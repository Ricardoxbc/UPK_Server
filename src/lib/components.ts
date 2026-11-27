import { createHash, timingSafeEqual } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { ObjectId } from 'mongodb'
import {
  audit, clients, componentPackages, COMPONENT_NAMES, SYNC_ENV_KEYS,
  type Client, type ComponentName, type ComponentPackage, type SyncEnvKey, type SyncServiceSettings,
} from './db.js'
import { field, looksLikeJar, storeComponentFile, type JarUpload } from './storage.js'
import { verifySignature } from './signature.js'
import { ValidationError } from './releases.js'
import { isValidVersion, maxVersion } from './version.js'

/**
 * Registra un paquete de componente subido (por el panel o por `Firmador publicar-componente`).
 * Campos: component, version, signature, sha256 (opcional), notes + archivo "package" (zip).
 */
export async function registerComponentPackage(upload: JarUpload, username: string): Promise<ComponentPackage> {
  const tempPath = upload.tempPath
  try {
    const component = (field(upload, 'component') || 'syncService') as ComponentName
    const number = field(upload, 'version')
    const signature = field(upload, 'signature')
    const sentSha = field(upload, 'sha256').toLowerCase()

    if (!COMPONENT_NAMES.includes(component)) throw new ValidationError(`Componente desconocido: ${component}`)
    if (!tempPath || !upload.sha256 || upload.size === 0) throw new ValidationError('Falta el archivo del paquete (zip)')
    if (!isValidVersion(number)) throw new ValidationError('Número de versión inválido (ej.: 1.0.0)')
    if (!signature) throw new ValidationError('Falta la firma (salida de Firmador firmar)')
    if (sentSha && sentSha !== upload.sha256) {
      throw new ValidationError('El SHA-256 enviado no coincide con el del archivo recibido')
    }
    if (!(await looksLikeJar(tempPath))) throw new ValidationError('El archivo no es un zip')
    if (!(await verifySignature(tempPath, signature))) {
      throw new ValidationError('Firma inválida: el paquete no fue firmado con la clave privada de UPK')
    }
    if (await componentPackages().findOne({ component, number })) {
      throw new ValidationError(`Ya existe la versión ${number} de ${component}`)
    }

    const id = new ObjectId()
    const path = await storeComponentFile(tempPath, id.toHexString())
    const pkg: ComponentPackage = {
      _id: id,
      component,
      number,
      notes: field(upload, 'notes').slice(0, 4000),
      sha256: upload.sha256,
      signature,
      size: upload.size,
      path,
      createdAt: new Date(),
      createdBy: username,
    }
    await componentPackages().insertOne(pkg)
    await audit(username, 'component.upload', `${component} ${number}`)
    return pkg
  } finally {
    if (tempPath) await rm(tempPath, { force: true })
  }
}

export function emptySyncSettings(): SyncServiceSettings {
  return {
    enabled: false, packageId: null, env: {}, keyHash: null, boundMachine: null, boundAt: null, status: null,
    resetId: null, resetRequestedAt: null, resetDoneAt: null,
  }
}

export function syncSettings(client: Client): SyncServiceSettings {
  return { ...emptySyncSettings(), ...(client.syncService ?? {}) }
}

/** Paquete que debe tener instalado el cliente: el elegido en el panel o el más reciente. */
export async function targetPackage(settings: SyncServiceSettings): Promise<ComponentPackage | null> {
  if (settings.packageId) return componentPackages().findOne({ _id: settings.packageId })
  const all = await componentPackages().find({ component: 'syncService' }).toArray()
  return maxVersion(all, (p) => p.number) ?? null
}

export function hashClientKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/** Clave que genera el Launcher (LauncherConfig.generarClave): solo alfanumérica, 32–128 caracteres. */
export function isValidClientKey(key: string): boolean {
  return /^[A-Za-z0-9]{32,128}$/.test(key)
}

export type KeyCheck = 'ok' | 'bound' | 'mismatch'

/**
 * Verifica la clave del Launcher (cabecera X-Client-Key). Vínculo en el primer uso: si el cliente
 * aún no tiene clave, queda vinculado a esta (y al equipo que la envía). Después, solo ese Launcher
 * recibe la configuración del componente (que incluye la URI de MongoDB).
 */
export async function checkClientKey(client: Client, key: string, machine: string): Promise<KeyCheck> {
  const hash = hashClientKey(key)
  const settings = syncSettings(client)
  if (!settings.keyHash) {
    // Condición en el filtro: si dos equipos llegan a la vez, solo uno queda vinculado
    const result = await clients().updateOne(
      { clientId: client.clientId, $or: [{ 'syncService.keyHash': null }, { 'syncService.keyHash': { $exists: false } }] },
      {
        $set: {
          syncService: { ...settings, keyHash: hash, boundMachine: machine || null, boundAt: new Date() },
        },
      },
    )
    if (result.modifiedCount === 1) {
      await audit('launcher', 'component.bind', `${client.clientId} → ${machine || '?'}`)
      return 'bound'
    }
    const fresh = await clients().findOne({ clientId: client.clientId })
    return fresh?.syncService?.keyHash === hash ? 'ok' : 'mismatch'
  }
  const a = Buffer.from(settings.keyHash)
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'mismatch'
}

/** Solo las variables conocidas, recortadas; los valores vacíos se omiten. */
export function cleanSyncEnv(input: Record<string, unknown>): Partial<Record<SyncEnvKey, string>> {
  const env: Partial<Record<SyncEnvKey, string>> = {}
  for (const key of SYNC_ENV_KEYS) {
    const value = typeof input[key] === 'string' ? (input[key] as string).trim() : ''
    // Sin saltos de línea: el Launcher escribe un .env de una línea por variable
    if (value && !/[\r\n]/.test(value)) env[key] = value.slice(0, 1000)
  }
  return env
}

/** Respuesta de /components que entiende el Launcher (ComponentsResponse). */
export interface ComponentsResponse {
  clientId: string
  syncService: {
    enabled: boolean
    version?: string
    downloadUrl?: string
    sha256?: string
    signature?: string
    size?: number
    env?: Partial<Record<SyncEnvKey, string>>
    /** Motivo por el que no se instala aunque esté activado (p. ej. no hay paquete subido). */
    message?: string
    /** Reinicio pendiente: el Launcher borra sync_state.db una vez por cada resetId distinto. */
    resetId?: string
  }
}

export async function computeComponents(
  client: Client,
  downloadUrl: (p: ComponentPackage) => string,
): Promise<ComponentsResponse> {
  const settings = syncSettings(client)
  const base = { clientId: client.clientId }
  if (!client.active || !settings.enabled) return { ...base, syncService: { enabled: false } }
  const pkg = await targetPackage(settings)
  const reset = settings.resetId ? { resetId: settings.resetId } : {}
  if (!pkg) {
    // Activado pero sin paquete: el Launcher no toca lo instalado (no desinstala por error)
    return { ...base, syncService: { enabled: true, message: 'No hay paquete del servicio de sincronización subido', ...reset } }
  }
  return {
    ...base,
    syncService: {
      enabled: true,
      version: pkg.number,
      downloadUrl: downloadUrl(pkg),
      sha256: pkg.sha256,
      signature: pkg.signature,
      size: pkg.size,
      env: settings.env,
      ...reset,
    },
  }
}
