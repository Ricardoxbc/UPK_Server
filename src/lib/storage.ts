import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { dirname, join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import busboy from 'busboy'
import { config } from './config.js'

/** Tamaño máximo de un jar subido. */
export const MAX_JAR_BYTES = 400 * 1024 * 1024

export interface JarUpload {
  /** Campos del formulario; un mismo nombre puede repetirse (p. ej. varios clientIds). */
  fields: Record<string, string[]>
  /** Ruta temporal del jar (se borra si no se acepta). */
  tempPath: string | null
  sha256: string | null
  size: number
}

export class UploadError extends Error {}

export function field(upload: JarUpload, name: string): string {
  return (upload.fields[name]?.[0] ?? '').trim()
}

/**
 * Recibe un formulario multipart con un campo de archivo "jar" y lo escribe en flujo a una
 * carpeta temporal calculando su SHA-256. Nunca se carga el jar completo en memoria.
 */
export async function receiveMultipart(req: IncomingMessage): Promise<JarUpload> {
  const tmpDir = join(config.dataDir, 'tmp')
  await mkdir(tmpDir, { recursive: true })

  return new Promise<JarUpload>((resolve, reject) => {
    const upload: JarUpload = { fields: {}, tempPath: null, sha256: null, size: 0 }
    let writing: Promise<void> | null = null
    let parser: busboy.Busboy
    try {
      parser = busboy({
        headers: req.headers,
        limits: { fileSize: MAX_JAR_BYTES, files: 1, fields: 500, fieldSize: 64 * 1024 },
      })
    } catch {
      reject(new UploadError('Se esperaba un formulario multipart/form-data'))
      return
    }

    parser.on('field', (name, value) => {
      ;(upload.fields[name] ??= []).push(value)
    })
    parser.on('file', (name, stream, info) => {
      // "jar" para versiones de la app, "package" para paquetes de componentes (zip)
      if ((name !== 'jar' && name !== 'package') || !info.filename) {
        stream.resume()
        return
      }
      const tempPath = join(tmpDir, `${Date.now()}-${randomBytes(6).toString('hex')}.jar`)
      upload.tempPath = tempPath
      const hash = createHash('sha256')
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk)
          upload.size += chunk.length
          callback(null, chunk)
        },
      })
      let truncated = false
      stream.on('limit', () => {
        truncated = true
      })
      writing = pipeline(stream, meter, createWriteStream(tempPath)).then(() => {
        if (truncated) throw new UploadError(`El jar supera el máximo de ${MAX_JAR_BYTES / 1048576} MB`)
        upload.sha256 = hash.digest('hex')
      })
    })
    parser.on('error', (e) => reject(e))
    parser.on('close', () => {
      Promise.resolve(writing)
        .then(() => resolve(upload))
        .catch(async (e) => {
          if (upload.tempPath) await rm(upload.tempPath, { force: true })
          reject(e)
        })
    })
    req.pipe(parser)
  })
}

export function absolutePath(relativePath: string): string {
  return join(config.dataDir, relativePath)
}

/** Mueve el jar a versions/{id}/app.jar y devuelve la ruta relativa. */
export async function storeVersionFile(tempPath: string, versionId: string): Promise<string> {
  const relativePath = join('versions', versionId, 'app.jar')
  const target = absolutePath(relativePath)
  await mkdir(dirname(target), { recursive: true })
  await rename(tempPath, target)
  return relativePath
}

/** Mueve el zip a components/{id}/package.zip y devuelve la ruta relativa. */
export async function storeComponentFile(tempPath: string, packageId: string): Promise<string> {
  const relativePath = join('components', packageId, 'package.zip')
  const target = absolutePath(relativePath)
  await mkdir(dirname(target), { recursive: true })
  await rename(tempPath, target)
  return relativePath
}

export async function deleteVersionFile(relativePath: string): Promise<void> {
  await rm(dirname(absolutePath(relativePath)), { recursive: true, force: true })
}

/** Borra temporales huérfanos (subidas interrumpidas). */
export async function cleanTempFiles(): Promise<void> {
  await rm(join(config.dataDir, 'tmp'), { recursive: true, force: true })
  await mkdir(join(config.dataDir, 'tmp'), { recursive: true })
}

/** Comprueba al arrancar que DATA_DIR existe y se puede escribir (si no, las subidas fallarían). */
export async function checkDataDirWritable(): Promise<void> {
  const probe = join(config.dataDir, `.write-test-${process.pid}`)
  await mkdir(config.dataDir, { recursive: true })
  await writeFile(probe, 'ok')
  await rm(probe, { force: true })
}

export type FileStatus = 'ok' | 'missing' | 'sizeMismatch'

/** Estado del jar de una versión en disco (para el panel y el arranque). */
export async function fileStatus(relativePath: string, expectedSize: number): Promise<FileStatus> {
  try {
    return (await stat(absolutePath(relativePath))).size === expectedSize ? 'ok' : 'sizeMismatch'
  } catch {
    return 'missing'
  }
}

/** Comprueba que el archivo empieza como un zip/jar ("PK\x03\x04"). */
export async function looksLikeJar(filePath: string): Promise<boolean> {
  const handle = await open(filePath, 'r')
  try {
    const buf = Buffer.alloc(4)
    await handle.read(buf, 0, 4, 0)
    return buf.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  } finally {
    await handle.close()
  }
}

export { createReadStream }
