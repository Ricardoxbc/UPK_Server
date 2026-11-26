import { createReadStream } from 'node:fs'
import { createVerify } from 'node:crypto'
import { config } from './config.js'

/**
 * Verifica la firma SHA256withRSA (Base64) del archivo con la clave pública del Launcher.
 * Es la misma comprobación que hace FirmaUtil.verificar en cada PC.
 */
export function verificarFirma(ruta: string, firmaBase64: string): Promise<boolean> {
  return new Promise((resolve) => {
    let firma: Buffer
    try {
      firma = Buffer.from(firmaBase64.replace(/\s+/g, ''), 'base64')
    } catch {
      resolve(false)
      return
    }
    if (firma.length === 0) {
      resolve(false)
      return
    }
    const v = createVerify('RSA-SHA256')
    const s = createReadStream(ruta)
    s.on('data', (chunk) => v.update(chunk))
    s.on('error', () => resolve(false))
    s.on('end', () => {
      try {
        resolve(v.verify(config.clavePublica, firma))
      } catch {
        resolve(false)
      }
    })
  })
}
