import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { Hono, type Context } from 'hono'
import { createReadStream, rutaAbsoluta } from '../lib/almacenamiento.js'
import { config } from '../lib/config.js'
import { clientes, reportes, versiones, type ResultadoReporte } from '../lib/db.js'
import { calcularActualizacion, registrarContacto } from '../lib/versiones.js'

const RESULTADOS: ResultadoReporte[] = ['actualizado', 'cancelado', 'fallido', 'revertido', 'omitido', 'pospuesto']

export function ipDe(c: Context): string | null {
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? null
}

export function baseUrl(c: Context): string {
  if (config.baseUrl) return config.baseUrl
  const proto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '')
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
  return `${proto}://${host}`
}

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export const publica = new Hono()

/** Consulta del Launcher: GET /api/v1/actualizacion?cliente=ID&version=1.4.0 */
publica.get('/actualizacion', async (c) => {
  const clienteId = texto(c.req.query('cliente'), 100)
  const version = texto(c.req.query('version'), 40)
  if (!clienteId || !version) {
    return c.json({ error: 'Parámetros requeridos: cliente y version' }, 400)
  }
  const cliente = await registrarContacto(clienteId, version, ipDe(c))
  const publicadas = await versiones().find({ estado: 'publicada' }).toArray()
  const base = baseUrl(c)
  const r = calcularActualizacion(cliente, version, publicadas,
    (v) => `${base}/api/v1/descargas/${encodeURIComponent(v.numero)}`)
  if (config.nuevaApiUrl) r.nuevaApiUrl = config.nuevaApiUrl
  c.header('Cache-Control', 'no-store')
  return c.json(r)
})

/** Descarga del jar con soporte de Range (el Launcher reanuda descargas canceladas). */
publica.get('/descargas/:version', async (c) => {
  const v = await versiones().findOne({ numero: c.req.param('version'), estado: 'publicada' })
  if (!v) return c.json({ error: 'Versión no disponible' }, 404)
  const ruta = rutaAbsoluta(v.ruta)
  let total: number
  try {
    total = (await stat(ruta)).size
  } catch {
    return c.json({ error: 'Archivo no encontrado en el servidor' }, 500)
  }

  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/java-archive',
    'Content-Disposition': `attachment; filename="app-${v.numero}.jar"`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  }
  const rango = c.req.header('range')
  let inicio = 0
  let fin = total - 1
  let estado = 200
  if (rango) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rango.trim())
    if (m && (m[1] !== '' || m[2] !== '')) {
      if (m[1] === '') {
        inicio = Math.max(0, total - Number(m[2])) // sufijo: últimos N bytes
      } else {
        inicio = Number(m[1])
        if (m[2] !== '') fin = Math.min(Number(m[2]), total - 1)
      }
      if (inicio >= total || inicio > fin) {
        return c.body(null, 416, { 'Content-Range': `bytes */${total}` })
      }
      estado = 206
      cabeceras['Content-Range'] = `bytes ${inicio}-${fin}/${total}`
    }
  }
  cabeceras['Content-Length'] = String(fin - inicio + 1)
  const stream = Readable.toWeb(createReadStream(ruta, { start: inicio, end: fin })) as ReadableStream
  return c.body(stream, estado as 200 | 206, cabeceras)
})

/** Resultado de cada intento de actualización del Launcher. */
publica.post('/reporte', async (c) => {
  let b: Record<string, unknown>
  try {
    const raw = await c.req.text()
    if (raw.length > 16 * 1024) return c.json({ error: 'Reporte demasiado grande' }, 413)
    b = JSON.parse(raw)
  } catch {
    return c.json({ error: 'JSON inválido' }, 400)
  }
  const clienteId = texto(b.cliente, 100)
  const resultado = texto(b.resultado, 20) as ResultadoReporte
  if (!clienteId || !RESULTADOS.includes(resultado)) {
    return c.json({ error: 'Campos requeridos: cliente y resultado (' + RESULTADOS.join('/') + ')' }, 400)
  }
  const ip = ipDe(c)
  await reportes().insertOne({
    clienteId,
    equipo: texto(b.equipo, 100),
    versionAntes: texto(b.versionAntes, 40),
    versionDespues: texto(b.versionDespues, 40),
    resultado,
    detalle: texto(b.detalle, 1000),
    ip,
    fecha: new Date(),
  })
  await clientes().updateOne({ clienteId }, { $set: { ultimoContacto: new Date(), ultimaIp: ip } })
  return c.json({ ok: true })
})
