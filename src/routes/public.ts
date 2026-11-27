import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { Hono, type Context } from 'hono'
import { ObjectId } from 'mongodb'
import { absolutePath, createReadStream } from '../lib/storage.js'
import { config } from '../lib/config.js'
import {
  audit, clientMachines, clients, componentPackages, componentReports, identifications, launcherLinks, launcherReleases,
  reports, versions,
  COMPONENT_STATES, REPORT_RESULTS, type Client, type ComponentState, type IdentifyResult, type ReportResult,
} from '../lib/db.js'
import { checkClientKey, computeComponents, isValidClientKey, syncSettings } from '../lib/components.js'
import { computeUpdate, touchClient } from '../lib/releases.js'
import { checkDownloadSignature, hashLinkToken, launcherOffer } from '../lib/launcher.js'
import { isValidClientId, maxVersion } from '../lib/version.js'

export function clientIp(c: Context): string | null {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? null
}

export function publicBaseUrl(c: Context): string {
  if (config.baseUrl) return config.baseUrl
  const proto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '')
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
  return `${proto}://${host}`
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function parseObjectId(v: string): ObjectId | null {
  return ObjectId.isValid(v) && v.length === 24 ? new ObjectId(v) : null
}

export const publicRoutes = new Hono()

/**
 * Registro de equipos (desactivable por cliente): cada Launcher manda machineId (hash del MachineGuid,
 * 32 hex), machine (nombre) y mode. Los Launcher antiguos no lo mandan y no se registran.
 */
async function recordMachine(c: Context, client: Client, version: string): Promise<void> {
  const machineId = text(c.req.query('machineId'), 64).toLowerCase()
  if (client.telemetry === false || !/^[a-f0-9]{16,64}$/.test(machineId)) return
  const mode = text(c.req.query('mode'), 10)
  const now = new Date()
  try {
    await clientMachines().updateOne(
      { clientId: client.clientId, machineId },
      {
        $set: {
          machine: text(c.req.query('machine'), 100),
          mode: mode === 'servidor' || mode === 'cliente' ? mode : '',
          lastSeenAt: now, lastIp: clientIp(c), lastVersion: version,
          ...(launcherVersion(c) ? { launcherVersion: launcherVersion(c) } : {}),
        },
        $setOnInsert: { firstSeenAt: now },
        $inc: { starts: 1 },
      },
      { upsert: true },
    )
  } catch (e) {
    // Nunca impide la consulta de actualizaciones
    console.error('[machines] No se pudo registrar el equipo:', e instanceof Error ? e.message : e)
  }
}

/** Versión del propio Launcher (parámetro launcherVersion); vacía en los Launcher antiguos. */
function launcherVersion(c: Context): string {
  const v = text(c.req.query('launcherVersion'), 40)
  return /^\d{1,4}(\.\d{1,5}){0,3}$/.test(v) ? v : ''
}

/**
 * Consulta del Launcher: GET /api/v1/update?clientId=ID&version=1.4.0
 * [&machine=PC&machineId=hash&mode=servidor&launcherVersion=1.1.0]
 * Si el Launcher informa su versión y hay una más nueva, la respuesta trae además "launcher".
 */
publicRoutes.get('/update', async (c) => {
  const clientId = text(c.req.query('clientId'), 60)
  const version = text(c.req.query('version'), 40)
  if (!isValidClientId(clientId) || !version) {
    return c.json({ error: 'Parámetros requeridos: clientId (válido) y version' }, 400)
  }
  const client = await touchClient(clientId, version, clientIp(c))
  await recordMachine(c, client, version)
  const assigned = await versions().find({ state: 'published', clientIds: clientId }).toArray()
  const base = publicBaseUrl(c)
  const response = computeUpdate(client, version, assigned,
    (v) => `${base}/api/v1/downloads/${v._id!.toHexString()}?clientId=${encodeURIComponent(clientId)}`)
  if (config.newApiUrl) response.newApiUrl = config.newApiUrl
  const launcher = await launcherOffer(client, launcherVersion(c), base)
  c.header('Cache-Control', 'no-store')
  return c.json(launcher ? { ...response, launcher } : response)
})

// ---------- Identificación (launcher.properties perdido o equipo nuevo) ----------
// El usuario escribe cliente.id y versión: se acepta solo si el cliente existe, está activo y la
// versión es exactamente (mismo texto) la última publicada para él (la que le indica soporte). Cada intento queda
// registrado y se ve en el panel (Clientes → Identificaciones). Tras 5 fallos, la IP espera 15 minutos.
const identifyFailures = new Map<string, { count: number; since: number }>()
const IDENTIFY_WINDOW_MS = 15 * 60 * 1000
const IDENTIFY_MAX_FAILURES = 5

function identifyBlocked(ip: string): boolean {
  const f = identifyFailures.get(ip)
  return !!f && Date.now() - f.since <= IDENTIFY_WINDOW_MS && f.count >= IDENTIFY_MAX_FAILURES
}

function identifyFailed(ip: string): void {
  const f = identifyFailures.get(ip)
  if (!f || Date.now() - f.since > IDENTIFY_WINDOW_MS) identifyFailures.set(ip, { count: 1, since: Date.now() })
  else f.count++
  if (identifyFailures.size > 5000) identifyFailures.clear()
}

/** Versión que debe escribir el usuario: la mayor publicada para el cliente; sin ninguna, la última que reportó. */
export async function expectedVersion(client: Client): Promise<string | null> {
  const published = await versions().find({ state: 'published', clientIds: client.clientId }, { projection: { number: 1 } }).toArray()
  return maxVersion(published, (v) => v.number)?.number ?? client.lastVersion ?? null
}

/** POST /api/v1/identify {clientId, version, machine, hasApp}. No crea clientes. */
publicRoutes.post('/identify', async (c) => {
  let body: Record<string, unknown>
  try {
    const raw = await c.req.text()
    if (raw.length > 4 * 1024) return c.json({ error: 'Solicitud demasiado grande' }, 413)
    body = JSON.parse(raw)
  } catch {
    return c.json({ error: 'JSON inválido' }, 400)
  }
  const clientId = text(body.clientId, 60)
  const version = text(body.version, 40)
  const machine = text(body.machine, 100)
  const hasApp = body.hasApp === true
  if (!isValidClientId(clientId) || !version) {
    return c.json({ error: 'Escriba el ID del cliente y la versión' }, 400)
  }
  const ip = clientIp(c)
  const record = async (result: IdentifyResult) => {
    await identifications().insertOne({ clientId, version, machine, hasApp, result, ip, createdAt: new Date() })
    if (result !== 'ok') {
      console.warn(`[identify] ${result}: ${clientId} v${version} desde ${machine || '?'} (${ip ?? '?'})`)
    }
  }

  if (identifyBlocked(ip ?? '?')) {
    await record('blocked')
    return c.json({ error: 'Demasiados intentos fallidos. Espere 15 minutos y vuelva a intentar.' }, 429)
  }
  const client = await clients().findOne({ clientId })
  let result: IdentifyResult = 'ok'
  if (!client) result = 'unknown_client'
  else if (!client.active) result = 'inactive'
  else {
    const expected = await expectedVersion(client)
    // Texto exacto: "1.0" no vale por "1.0.0" (más difícil de adivinar)
    if (!expected || expected !== version) result = 'version_mismatch'
  }
  await record(result)
  if (result !== 'ok') {
    identifyFailed(ip ?? '?')
    // Mismo mensaje para ID y versión: no revela si el cliente existe
    return c.json({ error: 'El ID del cliente o la versión no son correctos. Consulte a soporte.' }, 403)
  }
  identifyFailures.delete(ip ?? '?')
  await clients().updateOne({ clientId }, { $set: { lastSeenAt: new Date(), lastIp: ip } })
  await audit('launcher', 'client.identify', `${clientId} v${version} → ${machine || '?'}${hasApp ? '' : ' (sin app.jar)'}`)
  return c.json({ ok: true, clientId, version })
})

/**
 * Envía un archivo de DATA_DIR con soporte de Range (el Launcher reanuda descargas canceladas).
 * Comprueba que existe y que su tamaño es el registrado.
 */
async function sendFile(c: Context, filePath: string, expectedSize: number, label: string,
  contentType: string, fileName: string): Promise<Response> {
  let total: number
  try {
    total = (await stat(filePath)).size
  } catch (e) {
    // Suele indicar que DATA_DIR no está en un volumen persistente y el redespliegue borró los archivos
    console.error(`[download] Falta el archivo de ${label} en ${filePath}:`, e instanceof Error ? e.message : e)
    return c.json({ error: `El archivo de ${label} no está en el disco del servidor. Vuelva a subirlo.` }, 500)
  }
  if (total !== expectedSize) {
    console.error(`[download] Tamaño distinto en ${filePath}: ${total} en disco, ${expectedSize} registrado`)
    return c.json({ error: `El archivo de ${label} en el servidor está dañado. Vuelva a subirlo.` }, 500)
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  }
  let start = 0
  let end = total - 1
  let status: 200 | 206 = 200
  const range = c.req.header('range')
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (m && (m[1] !== '' || m[2] !== '')) {
      if (m[1] === '') {
        start = Math.max(0, total - Number(m[2])) // sufijo: últimos N bytes
      } else {
        start = Number(m[1])
        if (m[2] !== '') end = Math.min(Number(m[2]), total - 1)
      }
      if (start >= total || start > end) {
        return c.body(null, 416, { 'Content-Range': `bytes */${total}` })
      }
      status = 206
      headers['Content-Range'] = `bytes ${start}-${end}/${total}`
    }
  }
  headers['Content-Length'] = String(end - start + 1)
  const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream
  return c.body(stream, status, headers)
}

/**
 * Descarga del jar con soporte de Range (el Launcher reanuda descargas canceladas).
 * Solo para un cliente al que la versión está asignada: nadie descarga la versión de otro.
 */
publicRoutes.get('/downloads/:versionId', async (c) => {
  const id = parseObjectId(c.req.param('versionId'))
  const clientId = text(c.req.query('clientId'), 60)
  const version = id && clientId
    ? await versions().findOne({ _id: id, state: 'published', clientIds: clientId })
    : null
  if (!version) return c.json({ error: 'Versión no disponible para este cliente' }, 404)

  return sendFile(c, absolutePath(version.path), version.size, `la versión ${version.number}`,
    'application/java-archive', `app-${version.number}.jar`)
})

// ---------- Launcher.jar (autoactualización y enlaces públicos) ----------

/**
 * Descarga del Launcher para la autoactualización: URL firmada (HMAC) que entrega /update y caduca
 * en pocos minutos. Solo la versión actual, para clientes activos.
 */
publicRoutes.get('/launcher/downloads/:releaseId', async (c) => {
  const releaseId = c.req.param('releaseId')
  const clientId = text(c.req.query('clientId'), 60)
  const check = checkDownloadSignature(releaseId, clientId, c.req.query('expires') ?? '', c.req.query('sig') ?? '')
  if (check !== 'ok') {
    return c.json({ error: check === 'expired' ? 'El enlace de descarga caducó' : 'Enlace de descarga inválido' }, 403)
  }
  const id = parseObjectId(releaseId)
  const release = id ? await launcherReleases().findOne({ _id: id, state: 'current' }) : null
  const client = release ? await clients().findOne({ clientId, active: true }) : null
  if (!release || !release.path || !client) return c.json({ error: 'Launcher no disponible' }, 404)
  return sendFile(c, absolutePath(release.path), release.size, `el Launcher ${release.number}`,
    'application/java-archive', 'Launcher.jar')
})

/**
 * Enlace público temporal creado en el panel (soporte, equipos con un Launcher antiguo).
 * Vale hasta su vencimiento y su número de descargas; las continuaciones (Range) no cuentan.
 */
publicRoutes.get('/launcher/link/:token', async (c) => {
  const token = text(c.req.param('token'), 100)
  const link = /^[A-Za-z0-9_-]{20,64}$/.test(token)
    ? await launcherLinks().findOne({ tokenHash: hashLinkToken(token) })
    : null
  if (!link || link.revoked) return c.text('Enlace inválido o revocado.', 404)
  if (link.expiresAt.getTime() < Date.now()) return c.text('Este enlace caducó. Pida uno nuevo a soporte.', 410)
  const range = c.req.header('range')
  const isContinuation = !!range && !/^bytes=0-/.test(range.trim())
  if (!isContinuation) {
    // Incremento atómico: dos descargas simultáneas no pueden pasar del máximo
    const taken = await launcherLinks().findOneAndUpdate(
      { _id: link._id, downloads: { $lt: link.maxDownloads } },
      { $inc: { downloads: 1 }, $set: { lastDownloadAt: new Date(), lastIp: clientIp(c) } },
    )
    if (!taken) return c.text('Este enlace ya alcanzó su número máximo de descargas.', 410)
  }
  const release = await launcherReleases().findOne({ _id: link.releaseId })
  if (!release || !release.path) return c.text('La versión de este enlace ya no está disponible.', 410)
  if (!isContinuation) {
    console.log(`[launcher] Enlace público: Launcher ${release.number} descargado (${clientIp(c) ?? '?'})`)
  }
  return sendFile(c, absolutePath(release.path), release.size, `el Launcher ${release.number}`,
    'application/java-archive', 'Launcher.jar')
})

/** Resultado de cada intento de actualización del Launcher (de la app o del propio Launcher). */
publicRoutes.post('/report', async (c) => {
  let body: Record<string, unknown>
  try {
    const raw = await c.req.text()
    if (raw.length > 16 * 1024) return c.json({ error: 'Reporte demasiado grande' }, 413)
    body = JSON.parse(raw)
  } catch {
    return c.json({ error: 'JSON inválido' }, 400)
  }
  const clientId = text(body.clientId, 60)
  const result = text(body.result, 20) as ReportResult
  if (!isValidClientId(clientId) || !REPORT_RESULTS.includes(result)) {
    return c.json({ error: `Campos requeridos: clientId y result (${REPORT_RESULTS.join('/')})` }, 400)
  }
  const ip = clientIp(c)
  const component = text(body.component, 20) === 'launcher' ? 'launcher' : 'app'
  await reports().insertOne({
    clientId,
    component,
    machine: text(body.machine, 100),
    fromVersion: text(body.fromVersion, 40),
    toVersion: text(body.toVersion, 40),
    result,
    detail: text(body.detail, 1000),
    ip,
    createdAt: new Date(),
  })
  // Tras actualizar o revertir, la versión instalada pasa a ser toVersion (sin esperar al próximo inicio)
  const installed = component === 'app' && (result === 'updated' || result === 'reverted') && text(body.toVersion, 40)
  await clients().updateOne({ clientId }, {
    $set: { lastSeenAt: new Date(), lastIp: ip, ...(installed ? { lastVersion: installed } : {}) },
  })
  return c.json({ ok: true })
})

// ---------- Componentes (servicio de sincronización) ----------
// Solo los consulta el Launcher en modo servidor. Exigen la clave del Launcher (X-Client-Key):
// el primer Launcher que consulta queda vinculado y los demás reciben 403.

type KeyedClient = { client: Client } | { error: Response }

async function authorizeComponents(c: Context, clientId: string, machine: string): Promise<KeyedClient> {
  const key = text(c.req.header('x-client-key'), 200)
  if (!isValidClientId(clientId) || !isValidClientKey(key)) {
    return { error: c.json({ error: 'Parámetros requeridos: clientId válido y cabecera X-Client-Key' }, 400) }
  }
  const client = await clients().findOne({ clientId })
  if (!client) return { error: c.json({ error: 'Cliente no registrado' }, 404) }
  const check = await checkClientKey(client, key, machine)
  if (check === 'mismatch') {
    console.warn(`[components] Clave rechazada para ${clientId} desde ${machine || '?'} (${clientIp(c) ?? '?'})`)
    return { error: c.json({ error: 'Este equipo no es el vinculado al cliente. Reinicie el vínculo en el panel.' }, 403) }
  }
  return { client: (await clients().findOne({ clientId }))! }
}

/** Estado deseado de los componentes: GET /api/v1/components?clientId=ID&machine=PC (X-Client-Key). */
publicRoutes.get('/components', async (c) => {
  const clientId = text(c.req.query('clientId'), 60)
  const auth = await authorizeComponents(c, clientId, text(c.req.query('machine'), 100))
  if ('error' in auth) return auth.error
  const base = publicBaseUrl(c)
  const response = await computeComponents(auth.client,
    (p) => `${base}/api/v1/components/downloads/${p._id!.toHexString()}?clientId=${encodeURIComponent(clientId)}`)
  c.header('Cache-Control', 'no-store')
  return c.json(response)
})

/** Descarga del paquete: solo para el Launcher vinculado de un cliente con el servicio activado. */
publicRoutes.get('/components/downloads/:packageId', async (c) => {
  const clientId = text(c.req.query('clientId'), 60)
  const auth = await authorizeComponents(c, clientId, '')
  if ('error' in auth) return auth.error
  const id = parseObjectId(c.req.param('packageId'))
  const pkg = id && auth.client.active && syncSettings(auth.client).enabled
    ? await componentPackages().findOne({ _id: id })
    : null
  if (!pkg) return c.json({ error: 'Paquete no disponible para este cliente' }, 404)
  return sendFile(c, absolutePath(pkg.path), pkg.size, `${pkg.component} ${pkg.number}`,
    'application/zip', `${pkg.component}-${pkg.number}.zip`)
})

/** Estado del componente tras cada revisión del Launcher. */
publicRoutes.post('/components/report', async (c) => {
  let body: Record<string, unknown>
  try {
    const raw = await c.req.text()
    if (raw.length > 16 * 1024) return c.json({ error: 'Reporte demasiado grande' }, 413)
    body = JSON.parse(raw)
  } catch {
    return c.json({ error: 'JSON inválido' }, 400)
  }
  const clientId = text(body.clientId, 60)
  const machine = text(body.machine, 100)
  const auth = await authorizeComponents(c, clientId, machine)
  if ('error' in auth) return auth.error
  const state = text(body.state, 20) as ComponentState
  if (text(body.component, 40) !== 'syncService' || !COMPONENT_STATES.includes(state)) {
    return c.json({ error: `Campos requeridos: component=syncService y state (${COMPONENT_STATES.join('/')})` }, 400)
  }
  const status = { state, version: text(body.version, 40), machine, detail: text(body.detail, 1000), reportedAt: new Date() }
  await componentReports().insertOne({
    clientId, component: 'syncService', machine, state, version: status.version, detail: status.detail,
    ip: clientIp(c), createdAt: status.reportedAt,
  })
  await clients().updateOne({ clientId }, { $set: { 'syncService.status': status } })
  // Reinicio del estado confirmado: solo si es el mismo que está pendiente (no uno pedido después)
  const resetId = text(body.resetId, 40)
  if (resetId) {
    await clients().updateOne({ clientId, 'syncService.resetId': resetId },
      { $set: { 'syncService.resetId': null, 'syncService.resetDoneAt': new Date() } })
  }
  return c.json({ ok: true })
})
