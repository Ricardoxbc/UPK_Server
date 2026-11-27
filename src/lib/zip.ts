import { open, type FileHandle } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'

/**
 * Lector mínimo de zip/jar (sin dependencias): solo el directorio central y la lectura de entradas
 * puntuales. Se usa para revisar el Launcher subido (manifest, clave pública embebida, bytecode)
 * sin cargar el archivo completo en memoria. No admite ZIP64 (un Launcher pesa pocos MB).
 */
export interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  size: number
  localHeaderOffset: number
}

export class ZipError extends Error {}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
/** Límite de lo que se descomprime por entrada (protección contra zip bombs). */
const MAX_ENTRY_BYTES = 8 * 1024 * 1024

export class ZipReader {
  private constructor(private handle: FileHandle, readonly entries: Map<string, ZipEntry>) {}

  static async open(path: string): Promise<ZipReader> {
    const handle = await open(path, 'r')
    try {
      const { size } = await handle.stat()
      const tailSize = Math.min(size, 65557)
      const tail = Buffer.alloc(tailSize)
      await handle.read(tail, 0, tailSize, size - tailSize)
      let eocd = -1
      for (let i = tailSize - 22; i >= 0; i--) {
        if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
          eocd = i
          break
        }
      }
      if (eocd < 0) throw new ZipError('No es un zip válido (falta el directorio central)')
      const count = tail.readUInt16LE(eocd + 10)
      const dirSize = tail.readUInt32LE(eocd + 12)
      const dirOffset = tail.readUInt32LE(eocd + 16)
      if (dirOffset === 0xffffffff || dirOffset + dirSize > size) throw new ZipError('Zip no soportado (ZIP64 o dañado)')
      const dir = Buffer.alloc(dirSize)
      await handle.read(dir, 0, dirSize, dirOffset)
      const entries = new Map<string, ZipEntry>()
      let p = 0
      for (let i = 0; i < count; i++) {
        if (p + 46 > dir.length || dir.readUInt32LE(p) !== CENTRAL_SIGNATURE) throw new ZipError('Directorio central dañado')
        const nameLength = dir.readUInt16LE(p + 28)
        const extraLength = dir.readUInt16LE(p + 30)
        const commentLength = dir.readUInt16LE(p + 32)
        const name = dir.toString('utf8', p + 46, p + 46 + nameLength)
        entries.set(name, {
          name,
          method: dir.readUInt16LE(p + 10),
          compressedSize: dir.readUInt32LE(p + 20),
          size: dir.readUInt32LE(p + 24),
          localHeaderOffset: dir.readUInt32LE(p + 42),
        })
        p += 46 + nameLength + extraLength + commentLength
      }
      return new ZipReader(handle, entries)
    } catch (e) {
      await handle.close()
      throw e
    }
  }

  async read(name: string): Promise<Buffer | null> {
    const entry = this.entries.get(name)
    if (!entry) return null
    if (entry.size > MAX_ENTRY_BYTES || entry.compressedSize > MAX_ENTRY_BYTES) {
      throw new ZipError(`Entrada demasiado grande: ${name}`)
    }
    const header = Buffer.alloc(30)
    await this.handle.read(header, 0, 30, entry.localHeaderOffset)
    if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new ZipError(`Entrada dañada: ${name}`)
    const dataStart = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
    const data = Buffer.alloc(entry.compressedSize)
    await this.handle.read(data, 0, entry.compressedSize, dataStart)
    if (entry.method === 0) return data
    if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES })
    throw new ZipError(`Método de compresión no soportado en ${name}`)
  }

  close(): Promise<void> {
    return this.handle.close()
  }
}

/** Atributos principales de un META-INF/MANIFEST.MF (une las líneas de continuación). */
export function parseManifest(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let current: string | null = null
  for (const line of lines) {
    if (line === '') break // fin de la sección principal
    if (line.startsWith(' ') && current) {
      result[current] += line.slice(1)
      continue
    }
    const i = line.indexOf(':')
    if (i <= 0) continue
    current = line.slice(0, i).trim()
    result[current] = line.slice(i + 1).trim()
  }
  return result
}
