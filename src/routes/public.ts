import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { Hono, type Context } from 'hono'
import { ObjectId } from 'mongodb'
import { absolutePath, createReadStream } from '../lib/storage.js'
import { config } from '../lib/config.js'
import { clients, reports, versions, REPORT_RESULTS, type ReportResult } from '../lib/db.js'
import { computeUpdate, touchClient } from '../lib/releases.js'
import { isValidClientId } from '../lib/version.js'

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

/** Consulta del Launcher: GET /api/v1/update?clientId=ID&version=1.4.0 */
publicRoutes.get('/update', async (c) => {
  const clientId = text(c.req.query('clientId'), 60)
  const version = text(c.req.query('version'), 40)
  if (!isValidClientId(clientId) || !version) {
    return c.json({ error: 'Parámetros requeridos: clientId (válido) y version' }, 400)
  }
  const client = await touchClient(clientId, version, clientIp(c))
  const assigned = await versions().find({ state: 'published', clientIds: clientId }).toArray()
  const base = publicBaseUrl(c)
  const response = computeUpdate(client, version, assigned,
    (v) => `${base}/api/v1/downloads/${v._id!.toHexString()}?clientId=${encodeURIComponent(clientId)}`)
  if (config.newApiUrl) response.newApiUrl = config.newApiUrl
  c.header('Cache-Control', 'no-store')
  return c.json(response)
})

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

  const filePath = absolutePath(version.path)
  let total: number
  try {
    total = (await stat(filePath)).size
  } catch {
    return c.json({ error: 'Archivo no encontrado en el servidor' }, 500)
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/java-archive',
    'Content-Disposition': `attachment; filename="app-${version.number}.jar"`,
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
})

/** Resultado de cada intento de actualización del Launcher. */
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
  await reports().insertOne({
    clientId,
    machine: text(body.machine, 100),
    fromVersion: text(body.fromVersion, 40),
    toVersion: text(body.toVersion, 40),
    result,
    detail: text(body.detail, 1000),
    ip,
    createdAt: new Date(),
  })
  // Tras actualizar o revertir, la versión instalada pasa a ser toVersion (sin esperar al próximo inicio)
  const installed = (result === 'updated' || result === 'reverted') && text(body.toVersion, 40)
  await clients().updateOne({ clientId }, {
    $set: { lastSeenAt: new Date(), lastIp: ip, ...(installed ? { lastVersion: installed } : {}) },
  })
  return c.json({ ok: true })
})
