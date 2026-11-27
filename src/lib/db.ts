import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb'
import { config } from './config.js'

export type VersionState = 'draft' | 'published' | 'retired'

/**
 * Una versión (un app.jar firmado) asignada a uno o varios clientes.
 * Solo los clientes de clientIds pueden verla y descargarla.
 */
export interface AppVersion {
  _id?: ObjectId
  number: string
  state: VersionState
  mandatory: boolean
  /** Marca la versión como "global" (versión general de la app): sirve para el historial. */
  isGlobal: boolean
  clientIds: string[]
  notes: string
  sha256: string
  signature: string
  size: number
  /** Ruta relativa a DATA_DIR. */
  path: string
  createdAt: Date
  createdBy: string
  publishedAt: Date | null
}

export interface Client {
  _id?: ObjectId
  clientId: string
  name: string
  /** Un cliente inactivo no recibe actualizaciones. */
  active: boolean
  lastVersion: string | null
  lastSeenAt: Date | null
  lastIp: string | null
  createdAt: Date
  /** Servicio de sincronización (UPK Sync) que el Launcher del equipo servidor instala o desinstala. */
  syncService?: SyncServiceSettings
  /** Registro de equipos (clientMachines). undefined = activado. */
  telemetry?: boolean
}

/**
 * Equipo distinto que usó un cliente.id (telemetría básica): uno por (clientId, machineId). Sirve para
 * ver si un Launcher se copió a otra PC con su launcher.properties. machineId = hash del MachineGuid.
 */
export interface ClientMachine {
  _id?: ObjectId
  clientId: string
  machineId: string
  machine: string
  mode: 'servidor' | 'cliente' | ''
  firstSeenAt: Date
  lastSeenAt: Date
  lastIp: string | null
  lastVersion: string
  starts: number
}

/** Componentes que el Launcher sabe instalar (paquetes .zip firmados). */
export const COMPONENT_NAMES = ['syncService'] as const
export type ComponentName = (typeof COMPONENT_NAMES)[number]

/** Paquete subido de un componente (zip firmado con la misma clave que los jar). */
export interface ComponentPackage {
  _id?: ObjectId
  component: ComponentName
  number: string
  notes: string
  sha256: string
  signature: string
  size: number
  /** Ruta relativa a DATA_DIR. */
  path: string
  createdAt: Date
  createdBy: string
}

/** Variables de entorno que el Launcher escribe en el .env del servicio de sincronización. */
export const SYNC_ENV_KEYS = ['UPK_MONGODB_URI', 'UPK_MONGODB_DB', 'UPK_WEBHOOK_URL', 'SYNC_CRON'] as const
export type SyncEnvKey = (typeof SYNC_ENV_KEYS)[number]

export const COMPONENT_STATES = ['running', 'stopped', 'uninstalled', 'failed'] as const
export type ComponentState = (typeof COMPONENT_STATES)[number]

/**
 * Estado deseado del servicio de sincronización de un cliente (lo decide el panel) y último estado
 * reportado por el Launcher. Solo lo aplica el Launcher en modo servidor que esté vinculado.
 */
export interface SyncServiceSettings {
  enabled: boolean
  /** Paquete a instalar; null = el más reciente subido. */
  packageId: ObjectId | null
  env: Partial<Record<SyncEnvKey, string>>
  /** SHA-256 de la clave del Launcher vinculado (se fija en su primer contacto). */
  keyHash: string | null
  boundMachine: string | null
  boundAt: Date | null
  status: ComponentStatus | null
  /**
   * Reinicio del estado de sincronización pedido desde el panel: mientras no sea null, el Launcher
   * borra sync_state.db (y sus -wal/-shm) en su próximo inicio y lo confirma en el reporte.
   */
  resetId: string | null
  resetRequestedAt: Date | null
  resetDoneAt: Date | null
}

export interface ComponentStatus {
  state: ComponentState
  version: string
  machine: string
  detail: string
  reportedAt: Date
}

export const REPORT_RESULTS = ['updated', 'cancelled', 'failed', 'reverted', 'skipped', 'postponed'] as const
export type ReportResult = (typeof REPORT_RESULTS)[number]

export interface Report {
  _id?: ObjectId
  clientId: string
  machine: string
  fromVersion: string
  toVersion: string
  result: ReportResult
  detail: string
  ip: string | null
  createdAt: Date
}

export interface ComponentReport {
  _id?: ObjectId
  clientId: string
  component: ComponentName
  machine: string
  state: ComponentState
  version: string
  detail: string
  ip: string | null
  createdAt: Date
}

/** Resultado de la identificación de un Launcher que perdió su launcher.properties. */
export const IDENTIFY_RESULTS = ['ok', 'unknown_client', 'inactive', 'version_mismatch', 'blocked'] as const
export type IdentifyResult = (typeof IDENTIFY_RESULTS)[number]

/** Cada intento de identificación (aciertos y fallos): así se ve quién escribe un cliente.id ajeno. */
export interface Identification {
  _id?: ObjectId
  clientId: string
  version: string
  machine: string
  /** El equipo ya tenía app.jar (solo perdió launcher.properties). */
  hasApp: boolean
  result: IdentifyResult
  ip: string | null
  createdAt: Date
}

export interface Admin {
  _id?: ObjectId
  username: string
  passwordHash: string
  createdAt: Date
}

export interface ApiToken {
  _id?: ObjectId
  name: string
  /** SHA-256 del token; el token en claro solo se muestra al crearlo. */
  hash: string
  createdAt: Date
  createdBy: string
  revoked: boolean
  lastUsedAt: Date | null
}

export interface AuditEntry {
  _id?: ObjectId
  username: string
  action: string
  detail: string
  createdAt: Date
}

let mongo: MongoClient | null = null
let db: Db | null = null

export async function connect(): Promise<Db> {
  if (db) return db
  // Pool pequeño: el servicio corre con poca memoria y poco tráfico
  mongo = new MongoClient(config.mongoUrl, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 })
  await mongo.connect()
  db = mongo.db(config.mongoDb)
  await createIndexes(db)
  return db
}

async function createIndexes(d: Db): Promise<void> {
  await d.collection('versions').createIndex({ clientIds: 1, state: 1 })
  await d.collection('versions').createIndex({ number: 1 })
  await d.collection('clients').createIndex({ clientId: 1 }, { unique: true })
  await d.collection('reports').createIndex({ clientId: 1, createdAt: -1 })
  // Los reportes caducan solos a los 180 días
  await d.collection('reports').createIndex({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 })
  await d.collection('componentPackages').createIndex({ component: 1, number: 1 }, { unique: true })
  await d.collection('componentReports').createIndex({ clientId: 1, createdAt: -1 })
  await d.collection('componentReports').createIndex({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 })
  await d.collection('clientMachines').createIndex({ clientId: 1, machineId: 1 }, { unique: true })
  await d.collection('identifications').createIndex({ createdAt: -1 })
  await d.collection('identifications').createIndex({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 })
  await d.collection('admins').createIndex({ username: 1 }, { unique: true })
  await d.collection('apiTokens').createIndex({ hash: 1 }, { unique: true })
  await d.collection('auditLog').createIndex({ createdAt: -1 })
}

function collection<T extends object>(name: string): Collection<T> {
  if (!db) throw new Error('Base de datos no conectada')
  return db.collection<T>(name)
}

export const versions = () => collection<AppVersion>('versions')
export const clients = () => collection<Client>('clients')
export const reports = () => collection<Report>('reports')
export const componentPackages = () => collection<ComponentPackage>('componentPackages')
export const componentReports = () => collection<ComponentReport>('componentReports')
export const clientMachines = () => collection<ClientMachine>('clientMachines')
export const identifications = () => collection<Identification>('identifications')
export const admins = () => collection<Admin>('admins')
export const apiTokens = () => collection<ApiToken>('apiTokens')
export const auditLog = () => collection<AuditEntry>('auditLog')

export async function audit(username: string, action: string, detail = ''): Promise<void> {
  await auditLog().insertOne({ username, action, detail, createdAt: new Date() })
}

export async function disconnect(): Promise<void> {
  await mongo?.close()
  mongo = null
  db = null
}
