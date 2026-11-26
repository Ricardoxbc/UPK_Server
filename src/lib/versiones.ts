import { rm } from 'node:fs/promises'
import { auditar, clientes, versiones, type Cliente, type Version } from './db.js'
import { moverAVersion, pareceJar, type SubidaJar } from './almacenamiento.js'
import { verificarFirma } from './firma.js'
import { comparar, esVersionValida, mayor } from './version.js'

export class ErrorValidacion extends Error {}

/**
 * Registra una versión subida (por el panel o por `Firmador publicar`).
 * Valida número, SHA-256 (si se envió) y la firma RSA contra la clave pública del Launcher.
 * Campos: version, firma, sha256 (opcional), notas, obligatoria ("true"/"on"), publicar ("true"/"on").
 */
export async function registrarVersion(subida: SubidaJar, usuario: string): Promise<Version> {
  const tmp = subida.rutaTemporal
  try {
    const numero = (subida.campos.version ?? '').trim()
    const firma = (subida.campos.firma ?? '').trim()
    const shaEnviado = (subida.campos.sha256 ?? '').trim().toLowerCase()
    if (!tmp || !subida.sha256 || subida.tamano === 0) throw new ErrorValidacion('Falta el archivo jar')
    if (!esVersionValida(numero)) throw new ErrorValidacion('Número de versión inválido (ej.: 1.5.0)')
    if (!firma) throw new ErrorValidacion('Falta la firma (salida de Firmador firmar)')
    if (shaEnviado && shaEnviado !== subida.sha256) {
      throw new ErrorValidacion('El SHA-256 enviado no coincide con el del archivo recibido')
    }
    if (!(await pareceJar(tmp))) throw new ErrorValidacion('El archivo no es un jar')
    if (!(await verificarFirma(tmp, firma))) {
      throw new ErrorValidacion('Firma inválida: el jar no fue firmado con la clave privada de UPK')
    }
    if (await versiones().findOne({ numero })) {
      throw new ErrorValidacion(`La versión ${numero} ya existe`)
    }

    const publicar = esVerdadero(subida.campos.publicar)
    const ruta = await moverAVersion(tmp, numero)
    const v: Version = {
      numero,
      estado: publicar ? 'publicada' : 'borrador',
      obligatoria: esVerdadero(subida.campos.obligatoria),
      notas: (subida.campos.notas ?? '').trim().slice(0, 4000),
      sha256: subida.sha256,
      firma,
      tamano: subida.tamano,
      ruta,
      creadaEn: new Date(),
      creadaPor: usuario,
      publicadaEn: publicar ? new Date() : null,
    }
    await versiones().insertOne(v)
    await auditar(usuario, 'version.subir',
      `${numero} (${v.estado}${v.obligatoria ? ', obligatoria' : ''}, ${(v.tamano / 1048576).toFixed(1)} MB)`)
    return v
  } finally {
    if (tmp) await rm(tmp, { force: true })
  }
}

function esVerdadero(v: string | undefined): boolean {
  return v === 'true' || v === 'on' || v === '1'
}

/** Respuesta JSON que entiende el Launcher (UpdateResponse). */
export interface RespuestaActualizacion {
  hayActualizacion: boolean
  nuevaVersion?: string
  urlDescarga?: string
  sha256?: string
  firma?: string
  versionMinima?: string
  obligatoria?: boolean
  mensaje?: string
  nuevaApiUrl?: string
}

/**
 * Decide qué se ofrece a un cliente con versión local `local`:
 *  - destino = versión fijada (si está publicada) o la mayor publicada;
 *  - versionMinima = mayor obligatoria publicada ≤ destino;
 *  - obligatoria = hay alguna obligatoria en (local, destino].
 */
export function calcularActualizacion(
  cliente: Pick<Cliente, 'activo' | 'versionFijada'>,
  local: string,
  publicadas: Version[],
  urlDescarga: (v: Version) => string,
): RespuestaActualizacion {
  if (!cliente.activo || publicadas.length === 0) return { hayActualizacion: false }

  // Versión fijada: se ofrece solo esa; si no está publicada (p. ej. se retiró), no se ofrece nada
  const destino = cliente.versionFijada
    ? publicadas.find((v) => v.numero === cliente.versionFijada)
    : mayor(publicadas, (v) => v.numero)
  if (!destino) return { hayActualizacion: false }

  const hastaDestino = publicadas.filter((v) => comparar(v.numero, destino.numero) <= 0)
  const minima = mayor(hastaDestino.filter((v) => v.obligatoria), (v) => v.numero)

  if (comparar(destino.numero, local) <= 0) {
    return minima ? { hayActualizacion: false, versionMinima: minima.numero } : { hayActualizacion: false }
  }

  const saltadas = hastaDestino
    .filter((v) => comparar(v.numero, local) > 0)
    .sort((a, b) => comparar(b.numero, a.numero))
  const obligatoria = saltadas.some((v) => v.obligatoria)
  // Notas de todas las versiones que el cliente se saltó, de la más nueva a la más antigua
  const mensaje = saltadas
    .filter((v) => v.notas)
    .map((v) => (saltadas.length > 1 ? `Versión ${v.numero}:\n${v.notas}` : v.notas))
    .join('\n\n')

  return {
    hayActualizacion: true,
    nuevaVersion: destino.numero,
    urlDescarga: urlDescarga(destino),
    sha256: destino.sha256,
    firma: destino.firma,
    ...(minima ? { versionMinima: minima.numero } : {}),
    obligatoria,
    ...(mensaje ? { mensaje } : {}),
  }
}

/** Registra el contacto del cliente (lo crea si es la primera vez) y lo devuelve. */
export async function registrarContacto(clienteId: string, version: string, ip: string | null): Promise<Cliente> {
  const r = await clientes().findOneAndUpdate(
    { clienteId },
    {
      $set: { ultimaVersion: version, ultimoContacto: new Date(), ultimaIp: ip },
      $setOnInsert: { clienteId, nombre: '', versionFijada: null, activo: true, creadoEn: new Date() },
    },
    { upsert: true, returnDocument: 'after' },
  )
  return r as Cliente
}
