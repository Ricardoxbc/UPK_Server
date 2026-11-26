import { createPublicKey, type KeyObject } from 'node:crypto'
import { resolve } from 'node:path'

function requerida(nombre: string): string {
  const v = process.env[nombre]?.trim()
  if (!v) {
    throw new Error(`Falta la variable de entorno ${nombre} (ver .env.example)`)
  }
  return v
}

function clavePublica(b64: string): KeyObject {
  // Mismo formato que update_public_key.b64 del Launcher: X.509 (SPKI) DER en Base64
  return createPublicKey({ key: Buffer.from(b64.replace(/\s+/g, ''), 'base64'), format: 'der', type: 'spki' })
}

export const config = {
  puerto: Number(process.env.PORT ?? 3000),
  mongoUrl: requerida('MONGO_URL'),
  mongoDb: process.env.MONGO_DB?.trim() || 'upk_server',
  /** Secreto para firmar la cookie de sesión del panel (mínimo 32 caracteres). */
  sessionSecret: requerida('SESSION_SECRET'),
  clavePublica: clavePublica(requerida('PUBLIC_KEY_B64')),
  dataDir: resolve(process.env.DATA_DIR?.trim() || './data'),
  /** URL externa del servicio (la de EasyPanel), sin barra final. Se usa para armar urlDescarga. */
  baseUrl: process.env.BASE_URL?.trim().replace(/\/+$/, '') || '',
  /** Si se define, el Launcher cambia su update.api.url a esta (migrar de dominio sin visitar cada PC). */
  nuevaApiUrl: process.env.NUEVA_API_URL?.trim() || null,
  /** Crea este administrador al arrancar si todavía no existe ninguno. */
  adminInicial: {
    usuario: process.env.ADMIN_USUARIO?.trim() || '',
    clave: process.env.ADMIN_CLAVE ?? '',
  },
  /** Cookies Secure (desactivar solo en desarrollo local por http). */
  cookieSegura: process.env.COOKIE_SEGURA !== 'false',
}

if (config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET debe tener al menos 32 caracteres')
}
