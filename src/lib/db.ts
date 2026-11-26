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
