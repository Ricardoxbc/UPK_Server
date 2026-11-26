import { rm } from 'node:fs/promises'
import { ObjectId } from 'mongodb'
import { audit, clients, versions, type AppVersion, type Client } from './db.js'
import { field, looksLikeJar, storeVersionFile, type JarUpload } from './storage.js'
import { verifySignature } from './signature.js'
import { compareVersions, isValidVersion, maxVersion } from './version.js'

export class ValidationError extends Error {}

const isTrue = (v: string) => v === 'true' || v === 'on' || v === '1'

/** Lee clientIds del formulario: acepta campos repetidos y/o valores separados por comas. */
export function parseClientIds(values: string[] | undefined): string[] {
  const ids = (values ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
  return [...new Set(ids)]
}

/**
 * Valida la lista de clientes de una versión:
 *  - todos deben existir (evita asignar a un cliente mal escrito),
 *  - ningún cliente puede tener dos versiones con el mismo número (sería ambiguo cuál recibe).
 */
export async function validateTargets(number: string, clientIds: string[], excludeVersionId?: ObjectId): Promise<void> {
  if (clientIds.length === 0) return
  const existing = await clients().find({ clientId: { $in: clientIds } }, { projection: { clientId: 1 } }).toArray()
  const known = new Set(existing.map((c) => c.clientId))
  const unknown = clientIds.filter((id) => !known.has(id))
  if (unknown.length > 0) {
    throw new ValidationError(`Clientes no registrados: ${unknown.join(', ')}. Agréguelos primero en Clientes.`)
  }
  const clash = await versions().findOne({
    number,
    clientIds: { $in: clientIds },
    ...(excludeVersionId ? { _id: { $ne: excludeVersionId } } : {}),
  })
  if (clash) {
    const shared = clash.clientIds.filter((id) => clientIds.includes(id))
    throw new ValidationError(`Ya existe una versión ${number} para: ${shared.join(', ')}`)
  }
}

/**
 * Registra una versión subida (por el panel o por `Firmador publicar`).
 * Campos: version, signature, sha256 (opcional), notes, mandatory, isGlobal, publish, clientIds (uno o varios).
 * Valida número, SHA-256, que sea un jar, la firma RSA y los clientes destino.
 */
export async function registerVersion(upload: JarUpload, username: string): Promise<AppVersion> {
  const tempPath = upload.tempPath
  try {
    const number = field(upload, 'version')
    const signature = field(upload, 'signature')
    const sentSha = field(upload, 'sha256').toLowerCase()
    const clientIds = parseClientIds(upload.fields.clientIds)
    const publish = isTrue(field(upload, 'publish'))

    if (!tempPath || !upload.sha256 || upload.size === 0) throw new ValidationError('Falta el archivo jar')
    if (!isValidVersion(number)) throw new ValidationError('Número de versión inválido (ej.: 1.5.0)')
    if (!signature) throw new ValidationError('Falta la firma (salida de Firmador firmar)')
    if (sentSha && sentSha !== upload.sha256) {
      throw new ValidationError('El SHA-256 enviado no coincide con el del archivo recibido')
    }
    if (publish && clientIds.length === 0) {
      throw new ValidationError('Para publicar, seleccione al menos un cliente')
    }
    if (!(await looksLikeJar(tempPath))) throw new ValidationError('El archivo no es un jar')
    if (!(await verifySignature(tempPath, signature))) {
      throw new ValidationError('Firma inválida: el jar no fue firmado con la clave privada de UPK')
    }
    await validateTargets(number, clientIds)

    const id = new ObjectId()
    const path = await storeVersionFile(tempPath, id.toHexString())
    const version: AppVersion = {
      _id: id,
      number,
      state: publish ? 'published' : 'draft',
      mandatory: isTrue(field(upload, 'mandatory')),
      isGlobal: isTrue(field(upload, 'isGlobal')),
      clientIds,
      notes: field(upload, 'notes').slice(0, 4000),
      sha256: upload.sha256,
      signature,
      size: upload.size,
      path,
      createdAt: new Date(),
      createdBy: username,
      publishedAt: publish ? new Date() : null,
    }
    await versions().insertOne(version)
    await audit(username, 'version.upload',
      `${number}${version.isGlobal ? ' (global)' : ''} ${version.state} → ${clientIds.join(', ') || 'sin clientes'}`)
    return version
  } finally {
    if (tempPath) await rm(tempPath, { force: true })
  }
}

/** Respuesta JSON que entiende el Launcher (UpdateResponse). */
export interface UpdateResponse {
  /** Cliente para el que se calculó esta respuesta: el Launcher la ignora si no es su cliente.id. */
  clientId: string
  hasUpdate: boolean
  newVersion?: string
  downloadUrl?: string
  sha256?: string
  signature?: string
  minVersion?: string
  mandatory?: boolean
  message?: string
  newApiUrl?: string
}

/**
 * Decide qué se ofrece a un cliente con versión local `localVersion`. Solo se consideran las
 * versiones publicadas asignadas a ese cliente (`assigned`):
 *  - target = la mayor;
 *  - minVersion = la mayor obligatoria ≤ target;
 *  - mandatory = hay alguna obligatoria en (localVersion, target];
 *  - message = notas de todas las versiones que se salta.
 */
export function computeUpdate(
  client: Pick<Client, 'clientId' | 'active'>,
  localVersion: string,
  assigned: AppVersion[],
  downloadUrl: (v: AppVersion) => string,
): UpdateResponse {
  const base = { clientId: client.clientId }
  const mine = assigned.filter((v) => v.state === 'published' && v.clientIds.includes(client.clientId))
  if (!client.active || mine.length === 0) return { ...base, hasUpdate: false }

  const target = maxVersion(mine, (v) => v.number)!
  const upToTarget = mine.filter((v) => compareVersions(v.number, target.number) <= 0)
  const minimum = maxVersion(upToTarget.filter((v) => v.mandatory), (v) => v.number)

  if (compareVersions(target.number, localVersion) <= 0) {
    return minimum ? { ...base, hasUpdate: false, minVersion: minimum.number } : { ...base, hasUpdate: false }
  }

  const skipped = upToTarget
    .filter((v) => compareVersions(v.number, localVersion) > 0)
    .sort((a, b) => compareVersions(b.number, a.number))
  const message = skipped
    .filter((v) => v.notes)
    .map((v) => (skipped.length > 1 ? `Versión ${v.number}:\n${v.notes}` : v.notes))
    .join('\n\n')

  return {
    ...base,
    hasUpdate: true,
    newVersion: target.number,
    downloadUrl: downloadUrl(target),
    sha256: target.sha256,
    signature: target.signature,
    ...(minimum ? { minVersion: minimum.number } : {}),
    mandatory: skipped.some((v) => v.mandatory),
    ...(message ? { message } : {}),
  }
}

/** Registra el contacto del cliente (lo crea si es la primera vez) y lo devuelve. */
export async function touchClient(clientId: string, version: string, ip: string | null): Promise<Client> {
  const result = await clients().findOneAndUpdate(
    { clientId },
    {
      $set: { lastVersion: version, lastSeenAt: new Date(), lastIp: ip },
      $setOnInsert: { clientId, name: '', active: true, createdAt: new Date() },
    },
    { upsert: true, returnDocument: 'after' },
  )
  return result as Client
}

export type ClientVersionKind = 'global' | 'custom' | 'unknown'

/**
 * Tipo de la versión que tiene instalada cada cliente: "global" si su versión actual es una
 * versión global asignada a él, "custom" si es una versión propia, "unknown" si no está en el servidor.
 */
export async function clientVersionKinds(list: Client[]): Promise<Map<string, ClientVersionKind>> {
  const ids = list.map((c) => c.clientId)
  const assigned = await versions()
    .find({ clientIds: { $in: ids } }, { projection: { number: 1, clientIds: 1, isGlobal: 1 } })
    .toArray()
  const kinds = new Map<string, ClientVersionKind>()
  for (const c of list) {
    const match = assigned.find((v) => v.number === c.lastVersion && v.clientIds.includes(c.clientId))
    kinds.set(c.clientId, match ? (match.isGlobal ? 'global' : 'custom') : 'unknown')
  }
  return kinds
}
