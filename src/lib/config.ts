import { createPublicKey, type KeyObject } from 'node:crypto'
import { resolve } from 'node:path'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} (ver .env.example)`)
  }
  return value
}

function parsePublicKey(b64: string): KeyObject {
  // Mismo formato que update_public_key.b64 del Launcher: X.509 (SPKI) DER en Base64
  return createPublicKey({ key: Buffer.from(b64.replace(/\s+/g, ''), 'base64'), format: 'der', type: 'spki' })
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  mongoUrl: required('MONGO_URL'),
  mongoDb: process.env.MONGO_DB?.trim() || 'upk_server',
  /** Secreto para firmar la cookie de sesión del panel (mínimo 32 caracteres). */
  sessionSecret: required('SESSION_SECRET'),
  publicKey: parsePublicKey(required('PUBLIC_KEY_B64')),
  dataDir: resolve(process.env.DATA_DIR?.trim() || './data'),
  /** URL externa del servicio (la de EasyPanel), sin barra final. Se usa para armar downloadUrl. */
  baseUrl: process.env.BASE_URL?.trim().replace(/\/+$/, '') || '',
  /** Si se define, cada Launcher cambia su update.api.url a esta (migrar de dominio sin visitar cada PC). */
  newApiUrl: process.env.NEW_API_URL?.trim() || null,
  /** Crea este administrador al arrancar si todavía no existe ninguno. */
  initialAdmin: {
    username: process.env.ADMIN_USER?.trim() || '',
    password: process.env.ADMIN_PASSWORD ?? '',
  },
  /** Cookies Secure (desactivar solo en desarrollo local por http). */
  secureCookie: process.env.SECURE_COOKIE !== 'false',
  timeZone: process.env.TIMEZONE?.trim() || 'America/Lima',
}

if (config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET debe tener al menos 32 caracteres')
}
