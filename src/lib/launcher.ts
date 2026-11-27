import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { ObjectId } from 'mongodb'
import { config } from './config.js'
import {
  audit, launcherLinks, launcherReleases, settings, type Client, type LauncherRelease, type LauncherSettings,
} from './db.js'
import { ValidationError } from './releases.js'
import { verifySignature } from './signature.js'
import { deleteVersionFile, field, looksLikeJar, storeLauncherFile, type JarUpload } from './storage.js'
import { compareVersions, isValidVersion } from './version.js'
import { parseManifest, ZipReader } from './zip.js'

/** Clase principal que debe tener todo Launcher.jar. */
export const LAUNCHER_MAIN_CLASS = 'com.upksoft.launcher.LauncherMain'
/** Recurso del Launcher con la clave pública con la que verifica las actualizaciones. */
const PUBLIC_KEY_RESOURCE = 'update_public_key.b64'
/** Bytecode de Java 8: los equipos de los clientes ejecutan Java 8. */
export const JAVA8_CLASS_VERSION = 52
/** Validez de la URL de descarga que recibe cada Launcher en /update. */
export const DOWNLOAD_URL_MINUTES = 10
/** Cuántas versiones anteriores conservan su archivo en disco (para volver a publicarlas a mano). */
const KEEP_ARCHIVED_FILES = 3

export interface JarInspection {
  mainClass: string | null
  implementationVersion: string | null
  /** La clave pública embebida es la misma que PUBLIC_KEY_B64 del servidor. */
  samePublicKey: boolean
  hasPublicKey: boolean
  classVersion: number
}

/** Revisa el jar sin ejecutarlo: manifest, clave pública embebida y versión de bytecode. */
export async function inspectLauncherJar(path: string): Promise<JarInspection> {
  const zip = await ZipReader.open(path)
  try {
    const manifestBytes = await zip.read('META-INF/MANIFEST.MF')
    const manifest = manifestBytes ? parseManifest(manifestBytes.toString('utf8')) : {}
    const keyBytes = await zip.read(PUBLIC_KEY_RESOURCE)
    let samePublicKey = false
    if (keyBytes) {
      const embedded = Buffer.from(keyBytes.toString('utf8').replace(/\s+/g, ''), 'base64')
      const ours = config.publicKey.export({ type: 'spki', format: 'der' })
      samePublicKey = embedded.length === ours.length && timingSafeEqual(embedded, ours)
    }
    let classVersion = 0
    for (const name of zip.entries.keys()) {
      // module-info y META-INF/versions/* son para Java 9+ y Java 8 los ignora
      if (!name.endsWith('.class') || name.endsWith('module-info.class') || name.startsWith('META-INF/')) continue
      const bytes = await zip.read(name)
      if (bytes && bytes.length >= 8 && bytes.readUInt32BE(0) === 0xcafebabe) {
        classVersion = Math.max(classVersion, bytes.readUInt16BE(6))
      }
    }
    return {
      mainClass: manifest['Main-Class'] ?? null,
      implementationVersion: manifest['Implementation-Version'] ?? null,
      samePublicKey,
      hasPublicKey: !!keyBytes,
      classVersion,
    }
  } finally {
    await zip.close()
  }
}

export async function currentLauncher(): Promise<LauncherRelease | null> {
  return launcherReleases().findOne({ state: 'current' })
}

export async function launcherSettings(): Promise<LauncherSettings> {
  return (await settings().findOne({ _id: 'launcher' }))
    ?? { _id: 'launcher', distribution: true, updatedAt: new Date(0), updatedBy: '' }
}

export async function setDistribution(enabled: boolean, username: string): Promise<void> {
  await settings().updateOne({ _id: 'launcher' },
    { $set: { distribution: enabled, updatedAt: new Date(), updatedBy: username } }, { upsert: true })
  await audit(username, enabled ? 'launcher.distribution.on' : 'launcher.distribution.off')
}

/**
 * Registra un Launcher.jar subido (panel o `Firmador publicar-launcher`) y lo deja como versión actual.
 * Campos: version, signature, sha256 (opcional), notes + archivo "jar".
 * Además de la firma, exige lo que evita dejar a los equipos sin poder actualizarse:
 * Main-Class correcta, Implementation-Version igual a la indicada, la MISMA clave pública embebida
 * y bytecode de Java 8.
 */
export async function registerLauncherRelease(upload: JarUpload, username: string): Promise<LauncherRelease> {
  const tempPath = upload.tempPath
  try {
    const number = field(upload, 'version')
    const signature = field(upload, 'signature')
    const sentSha = field(upload, 'sha256').toLowerCase()

    if (!tempPath || !upload.sha256 || upload.size === 0) throw new ValidationError('Falta el archivo Launcher.jar')
    if (!isValidVersion(number)) throw new ValidationError('Número de versión inválido (ej.: 1.3.0)')
    if (!signature) throw new ValidationError('Falta la firma (salida de Firmador firmar)')
    if (sentSha && sentSha !== upload.sha256) {
      throw new ValidationError('El SHA-256 enviado no coincide con el del archivo recibido')
    }
    const current = await currentLauncher()
    if (current && compareVersions(number, current.number) <= 0) {
      throw new ValidationError(`La versión debe ser mayor que la actual (${current.number}). ` +
        'Para volver atrás, publique el Launcher anterior con un número mayor.')
    }
    if (await launcherReleases().findOne({ number })) throw new ValidationError(`Ya existe el Launcher ${number}`)
    if (!(await looksLikeJar(tempPath))) throw new ValidationError('El archivo no es un jar')
    if (!(await verifySignature(tempPath, signature))) {
      throw new ValidationError('Firma inválida: el jar no fue firmado con la clave privada de UPK')
    }

    let info: JarInspection
    try {
      info = await inspectLauncherJar(tempPath)
    } catch (e) {
      throw new ValidationError(`No se pudo leer el jar: ${e instanceof Error ? e.message : e}`)
    }
    if (info.mainClass !== LAUNCHER_MAIN_CLASS) {
      throw new ValidationError(`No parece un Launcher: Main-Class es "${info.mainClass ?? 'ninguna'}" ` +
        `(se esperaba ${LAUNCHER_MAIN_CLASS}). ¿Subió Firmador.jar o app.jar?`)
    }
    if (info.implementationVersion !== number) {
      throw new ValidationError(`El manifest del jar dice versión "${info.implementationVersion ?? 'ninguna'}" ` +
        `y usted indicó ${number}. Cambie la versión en el pom.xml del Launcher y vuelva a compilar.`)
    }
    if (!info.hasPublicKey || !info.samePublicKey) {
      throw new ValidationError('El jar trae otra clave pública (update_public_key.b64) o ninguna. ' +
        'Con esa clave los equipos ya no podrían verificar ninguna actualización futura. Compílelo con la clave actual.')
    }
    if (info.classVersion > JAVA8_CLASS_VERSION) {
      throw new ValidationError(`El jar contiene clases para Java ${info.classVersion - 44}; los equipos usan Java 8. ` +
        'Compile con maven.compiler.release=8.')
    }

    const id = new ObjectId()
    const path = await storeLauncherFile(tempPath, id.toHexString())
    const release: LauncherRelease = {
      _id: id,
      number,
      state: 'current',
      notes: field(upload, 'notes').slice(0, 4000),
      sha256: upload.sha256,
      signature,
      size: upload.size,
      path,
      classVersion: info.classVersion,
      createdAt: new Date(),
      createdBy: username,
      archivedAt: null,
    }
    await launcherReleases().updateMany({ state: 'current' }, { $set: { state: 'archived', archivedAt: new Date() } })
    await launcherReleases().insertOne(release)
    await pruneArchivedFiles()
    await audit(username, 'launcher.upload', `${number}${current ? ` (antes ${current.number})` : ''}`)
    return release
  } finally {
    if (tempPath) await rm(tempPath, { force: true })
  }
}

/** Borra los archivos de las versiones archivadas más antiguas (el registro queda en el historial). */
async function pruneArchivedFiles(): Promise<void> {
  const archived = await launcherReleases().find({ state: 'archived', path: { $ne: null } }).sort({ createdAt: -1 }).toArray()
  for (const r of archived.slice(KEEP_ARCHIVED_FILES)) {
    await deleteVersionFile(r.path!)
    await launcherReleases().updateOne({ _id: r._id }, { $set: { path: null } })
  }
}

// ---------- URL de descarga para los Launcher (sin estado, firmada con HMAC) ----------

function downloadKey(): Buffer {
  return createHmac('sha256', config.sessionSecret).update('launcher-download').digest()
}

function downloadSignature(releaseId: string, clientId: string, expires: number): string {
  return createHmac('sha256', downloadKey()).update(`${releaseId}|${clientId}|${expires}`).digest('base64url')
}

export function signedDownloadUrl(base: string, release: LauncherRelease, clientId: string): string {
  const id = release._id!.toHexString()
  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_URL_MINUTES * 60
  return `${base}/api/v1/launcher/downloads/${id}?clientId=${encodeURIComponent(clientId)}` +
    `&expires=${expires}&sig=${downloadSignature(id, clientId, expires)}`
}

export type SignedCheck = 'ok' | 'expired' | 'invalid'

export function checkDownloadSignature(releaseId: string, clientId: string, expires: string, sig: string): SignedCheck {
  const exp = Number(expires)
  if (!Number.isInteger(exp) || !sig) return 'invalid'
  const expected = Buffer.from(downloadSignature(releaseId, clientId, exp))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid'
  return exp * 1000 < Date.now() ? 'expired' : 'ok'
}

/** Campo "launcher" de la respuesta de /update (UpdateResponse.launcher en el Launcher). */
export interface LauncherOffer {
  version: string
  downloadUrl: string
  sha256: string
  signature: string
  size: number
}

/**
 * Se ofrece la versión actual solo si: la distribución está activa, el cliente está activo, el
 * Launcher informó su versión (los antiguos no lo hacen y no saben autoactualizarse) y es menor.
 */
export async function launcherOffer(client: Client, launcherVersion: string, base: string): Promise<LauncherOffer | null> {
  if (!client.active || !launcherVersion) return null
  const [current, s] = await Promise.all([currentLauncher(), launcherSettings()])
  if (!current || !current.path || !s.distribution || compareVersions(current.number, launcherVersion) <= 0) return null
  return {
    version: current.number,
    downloadUrl: signedDownloadUrl(base, current, client.clientId),
    sha256: current.sha256,
    signature: current.signature,
    size: current.size,
  }
}

// ---------- Enlaces públicos temporales ----------

export const LINK_MINUTES = [5, 15, 30, 60] as const
export const LINK_MAX_DOWNLOADS = [1, 3, 10] as const

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Crea un enlace de descarga del Launcher actual; devuelve el token en claro (solo se muestra una vez). */
export async function createLauncherLink(minutes: number, maxDownloads: number, note: string, username: string): Promise<{ token: string; expiresAt: Date }> {
  const current = await currentLauncher()
  if (!current || !current.path) throw new ValidationError('Primero suba una versión del Launcher')
  if (!(LINK_MINUTES as readonly number[]).includes(minutes)) throw new ValidationError('Duración inválida')
  if (!(LINK_MAX_DOWNLOADS as readonly number[]).includes(maxDownloads)) throw new ValidationError('Cantidad de descargas inválida')
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000)
  await launcherLinks().insertOne({
    tokenHash: hashLinkToken(token), releaseId: current._id!, releaseNumber: current.number, note: note.slice(0, 100),
    expiresAt, maxDownloads, downloads: 0, revoked: false, createdAt: new Date(), createdBy: username,
    lastDownloadAt: null, lastIp: null,
  })
  await audit(username, 'launcher.link.create',
    `${current.number}, ${minutes} min, ${maxDownloads} descarga(s)${note ? ` — ${note}` : ''}`)
  return { token, expiresAt }
}
