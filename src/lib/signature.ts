import { createReadStream } from 'node:fs'
import { createVerify } from 'node:crypto'
import { config } from './config.js'

/**
 * Verifica la firma SHA256withRSA (Base64) del archivo con la clave pública del Launcher.
 * Es la misma comprobación que hace FirmaUtil.verificar en cada PC.
 */
export function verifySignature(filePath: string, signatureBase64: string): Promise<boolean> {
  return new Promise((resolve) => {
    const signature = Buffer.from(signatureBase64.replace(/\s+/g, ''), 'base64')
    if (signature.length === 0) {
      resolve(false)
      return
    }
    const verifier = createVerify('RSA-SHA256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => verifier.update(chunk))
    stream.on('error', () => resolve(false))
    stream.on('end', () => {
      try {
        resolve(verifier.verify(config.publicKey, signature))
      } catch {
        resolve(false)
      }
    })
  })
}
