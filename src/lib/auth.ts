import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import bcrypt from 'bcryptjs'
import { admins, apiTokens } from './db.js'
import { config } from './config.js'

const SESSION_COOKIE = 'upk_session'
const SESSION_MS = 12 * 3600 * 1000
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 12)

export type AuthVariables = { username: string }

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function checkCredentials(username: string, password: string): Promise<boolean> {
  const admin = await admins().findOne({ username })
  // Se compara aunque el usuario no exista para no revelar cuáles existen por el tiempo de respuesta
  const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH)
  return ok && !!admin
}

export async function startSession(c: Context, username: string): Promise<void> {
  await setSignedCookie(c, SESSION_COOKIE, `${username}|${Date.now() + SESSION_MS}`, config.sessionSecret, {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_MS / 1000,
  })
}

export function endSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** Panel: exige sesión válida; si no, redirige al login. En POST exige además mismo origen. */
export const requireSession: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const value = await getSignedCookie(c, config.sessionSecret, SESSION_COOKIE)
  const [username, expires] = typeof value === 'string' ? value.split('|') : []
  if (!username || !expires || Number(expires) < Date.now() || !(await admins().findOne({ username }))) {
    return c.redirect('/panel/login')
  }
  if (c.req.method !== 'GET' && !isSameOrigin(c)) {
    return c.text('Origen no permitido', 403)
  }
  c.set('username', username)
  await next()
}

/** Protección CSRF adicional a SameSite=Strict: el Origin (si viene) debe ser este mismo host. */
export function isSameOrigin(c: Context): boolean {
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

export function generateToken(): string {
  return 'upk_' + randomBytes(24).toString('base64url')
}

/** API de administración: Authorization: Bearer <token>. */
export const requireApiToken: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')
  if (!match) return c.json({ error: 'Falta el token (Authorization: Bearer …)' }, 401)
  const hash = hashToken(match[1])
  const token = await apiTokens().findOne({ hash, revoked: false })
  if (!token || !timingSafeEqual(Buffer.from(token.hash), Buffer.from(hash))) {
    return c.json({ error: 'Token inválido o revocado' }, 401)
  }
  await apiTokens().updateOne({ _id: token._id }, { $set: { lastUsedAt: new Date() } })
  c.set('username', `token:${token.name}`)
  await next()
}
