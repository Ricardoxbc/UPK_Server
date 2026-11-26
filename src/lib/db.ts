import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb'
import { config } from './config.js'

export type EstadoVersion = 'borrador' | 'publicada' | 'retirada'

export interface Version {
  _id?: ObjectId
  numero: string
  estado: EstadoVersion
  obligatoria: boolean
  notas: string
  sha256: string
  firma: string
  tamano: number
  /** Ruta relativa a DATA_DIR. */
  ruta: string
  creadaEn: Date
  creadaPor: string
  publicadaEn: Date | null
}

export interface Cliente {
  _id?: ObjectId
  clienteId: string
  nombre: string
  /** Si se define, el cliente recibe exactamente esta versión (si está publicada). */
  versionFijada: string | null
  activo: boolean
  ultimaVersion: string | null
  ultimoContacto: Date | null
  ultimaIp: string | null
  creadoEn: Date
}

export type ResultadoReporte = 'actualizado' | 'cancelado' | 'fallido' | 'revertido' | 'omitido' | 'pospuesto'

export interface Reporte {
  _id?: ObjectId
  clienteId: string
  equipo: string
  versionAntes: string
  versionDespues: string
  resultado: ResultadoReporte
  detalle: string
  ip: string | null
  fecha: Date
}

export interface Admin {
  _id?: ObjectId
  usuario: string
  claveHash: string
  creadoEn: Date
}

export interface TokenApi {
  _id?: ObjectId
  nombre: string
  /** SHA-256 del token; el token en claro solo se muestra al crearlo. */
  hash: string
  creadoEn: Date
  creadoPor: string
  revocado: boolean
  ultimoUso: Date | null
}

export interface Auditoria {
  _id?: ObjectId
  usuario: string
  accion: string
  detalle: string
  fecha: Date
}

let cliente: MongoClient | null = null
let db: Db | null = null

export async function conectar(): Promise<Db> {
  if (db) return db
  // Pool pequeño: el servicio corre con poca memoria y poco tráfico
  cliente = new MongoClient(config.mongoUrl, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 })
  await cliente.connect()
  db = cliente.db(config.mongoDb)
  await crearIndices(db)
  return db
}

async function crearIndices(d: Db): Promise<void> {
  await d.collection('versiones').createIndex({ numero: 1 }, { unique: true })
  await d.collection('clientes').createIndex({ clienteId: 1 }, { unique: true })
  await d.collection('reportes').createIndex({ clienteId: 1, fecha: -1 })
  // Los reportes caducan solos a los 180 días
  await d.collection('reportes').createIndex({ fecha: 1 }, { expireAfterSeconds: 180 * 24 * 3600 })
  await d.collection('admins').createIndex({ usuario: 1 }, { unique: true })
  await d.collection('tokens').createIndex({ hash: 1 }, { unique: true })
  await d.collection('auditoria').createIndex({ fecha: -1 })
}

function col<T extends object>(nombre: string): Collection<T> {
  if (!db) throw new Error('Base de datos no conectada')
  return db.collection<T>(nombre)
}

export const versiones = () => col<Version>('versiones')
export const clientes = () => col<Cliente>('clientes')
export const reportes = () => col<Reporte>('reportes')
export const admins = () => col<Admin>('admins')
export const tokens = () => col<TokenApi>('tokens')
export const auditoria = () => col<Auditoria>('auditoria')

export async function auditar(usuario: string, accion: string, detalle = ''): Promise<void> {
  await auditoria().insertOne({ usuario, accion, detalle, fecha: new Date() })
}

export async function cerrar(): Promise<void> {
  await cliente?.close()
  cliente = null
  db = null
}
