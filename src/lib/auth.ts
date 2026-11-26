import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import bcrypt from 'bcryptjs'
import { admins, tokens } from './db.js'
import { config } from './config.js'

const COOKIE = 'upk_sesion'
const DURACION_SESION_MS = 12 * 3600 * 1000
const HASH_FICTICIO = bcrypt.hashSync(randomBytes(16).toString('hex'), 12)

export type Variables = { usuario: string }

export async function hashClave(clave: string): Promise<string> {
  return bcrypt.hash(clave, 12)
}

export async function verificarCredenciales(usuario: string, clave: string): Promise<boolean> {
  const a = await admins().findOne({ usuario })
  // Se compara aunque no exista el usuario para no revelar cuáles existen por el tiempo de respuesta
  const hash = a?.claveHash ?? HASH_FICTICIO
  const ok = await bcrypt.compare(clave, hash)
  return ok && !!a
}

export async function iniciarSesion(c: Context, usuario: string): Promise<void> {
  const valor = `${usuario}|${Date.now() + DURACION_SESION_MS}`
  await setSignedCookie(c, COOKIE, valor, config.sessionSecret, {
    httpOnly: true,
    secure: config.cookieSegura,
    sameSite: 'Strict',
    path: '/',
    maxAge: DURACION_SESION_MS / 1000,
  })
}

export function cerrarSesion(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' })
}

/** Panel: exige sesión válida; si no, redirige al login. En POST exige además mismo origen. */
export const requiereSesion: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const valor = await getSignedCookie(c, config.sessionSecret, COOKIE)
  const [usuario, expira] = typeof valor === 'string' ? valor.split('|') : []
  if (!usuario || !expira || Number(expira) < Date.now() || !(await admins().findOne({ usuario }))) {
    return c.redirect('/panel/login')
  }
  if (c.req.method !== 'GET' && !mismoOrigen(c)) {
    return c.text('Origen no permitido', 403)
  }
  c.set('usuario', usuario)
  await next()
}

/** Protección CSRF adicional a SameSite=Strict: el Origin (si viene) debe ser este mismo host. */
export function mismoOrigen(c: Context): boolean {
  const origin = c.req.header('origin')
  if (!origin) return true
  try {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generarToken(): string {
  return 'upk_' + randomBytes(24).toString('base64url')
}

/** API de administración: Authorization: Bearer <token>. */
export const requiereToken: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const auth = c.req.header('authorization') ?? ''
  const m = /^Bearer\s+(\S+)$/i.exec(auth)
  if (!m) return c.json({ error: 'Falta el token (Authorization: Bearer …)' }, 401)
  const h = hashToken(m[1])
  const t = await tokens().findOne({ hash: h, revocado: false })
  if (!t || !timingSafeEqual(Buffer.from(t.hash), Buffer.from(h))) {
    return c.json({ error: 'Token inválido o revocado' }, 401)
  }
  await tokens().updateOne({ _id: t._id }, { $set: { ultimoUso: new Date() } })
  c.set('usuario', `token:${t.nombre}`)
  await next()
}
