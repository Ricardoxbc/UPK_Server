import { createHash, randomBytes } from 'node:crypto'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import busboy from 'busboy'
import { config } from './config.js'

/** Tamaño máximo de un jar subido. */
export const MAX_JAR_BYTES = 400 * 1024 * 1024

export interface SubidaJar {
  campos: Record<string, string>
  /** Ruta temporal del jar (borrarla si no se acepta). */
  rutaTemporal: string | null
  sha256: string | null
  tamano: number
}

/**
 * Recibe un formulario multipart con un campo de archivo "jar" y lo escribe en flujo a una
 * carpeta temporal calculando su SHA-256. Nunca se carga el jar completo en memoria.
 */
export async function recibirMultipart(req: IncomingMessage): Promise<SubidaJar> {
  const tmpDir = join(config.dataDir, 'tmp')
  await mkdir(tmpDir, { recursive: true })

  return new Promise<SubidaJar>((resolve, reject) => {
    const resultado: SubidaJar = { campos: {}, rutaTemporal: null, sha256: null, tamano: 0 }
    let escritura: Promise<void> | null = null
    let bb: busboy.Busboy
    try {
      bb = busboy({
        headers: req.headers,
        limits: { fileSize: MAX_JAR_BYTES, files: 1, fields: 20, fieldSize: 64 * 1024 },
      })
    } catch (e) {
      reject(new Error('Se esperaba un formulario multipart/form-data'))
      return
    }

    bb.on('field', (nombre, valor) => {
      resultado.campos[nombre] = valor
    })
    bb.on('file', (nombre, stream, info) => {
      if (nombre !== 'jar' || !info.filename) {
        stream.resume()
        return
      }
      const ruta = join(tmpDir, `${Date.now()}-${randomBytes(6).toString('hex')}.jar`)
      resultado.rutaTemporal = ruta
      const hash = createHash('sha256')
      const contador = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          hash.update(chunk)
          resultado.tamano += chunk.length
          cb(null, chunk)
        },
      })
      let truncado = false
      stream.on('limit', () => {
        truncado = true
      })
      escritura = pipeline(stream, contador, createWriteStream(ruta)).then(() => {
        if (truncado) throw new Error(`El jar supera el máximo de ${MAX_JAR_BYTES / 1024 / 1024} MB`)
        resultado.sha256 = hash.digest('hex')
      })
    })
    bb.on('error', (e) => reject(e))
    bb.on('close', () => {
      Promise.resolve(escritura)
        .then(() => resolve(resultado))
        .catch(async (e) => {
          if (resultado.rutaTemporal) await rm(resultado.rutaTemporal, { force: true })
          reject(e)
        })
    })
    req.pipe(bb)
  })
}

/** Ruta relativa (a DATA_DIR) donde se guarda cada versión. */
export function rutaVersion(numero: string): string {
  return join('versiones', numero, 'app.jar')
}

export function rutaAbsoluta(relativa: string): string {
  return join(config.dataDir, relativa)
}

export async function moverAVersion(rutaTemporal: string, numero: string): Promise<string> {
  const relativa = rutaVersion(numero)
  const destino = rutaAbsoluta(relativa)
  await mkdir(dirname(destino), { recursive: true })
  await rename(rutaTemporal, destino)
  return relativa
}

export async function borrarVersion(relativa: string): Promise<void> {
  await rm(dirname(rutaAbsoluta(relativa)), { recursive: true, force: true })
}

export async function tamanoArchivo(relativa: string): Promise<number | null> {
  try {
    return (await stat(rutaAbsoluta(relativa))).size
  } catch {
    return null
  }
}

/** Borra temporales huérfanos (subidas interrumpidas). */
export async function limpiarTemporales(): Promise<void> {
  await rm(join(config.dataDir, 'tmp'), { recursive: true, force: true })
  await mkdir(join(config.dataDir, 'tmp'), { recursive: true })
}

/** Comprueba que el archivo empieza como un zip/jar ("PK\x03\x04"). */
export async function pareceJar(ruta: string): Promise<boolean> {
  const fh = await open(ruta, 'r')
  try {
    const buf = Buffer.alloc(4)
    await fh.read(buf, 0, 4, 0)
    return buf.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  } finally {
    await fh.close()
  }
}

export { createReadStream }
