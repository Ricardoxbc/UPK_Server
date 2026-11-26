/**
 * Comparación de versiones tipo 1.2.3, idéntica a VersionUtil.comparar del Launcher:
 * cada parte toma sus dígitos iniciales (ignora sufijos como -SNAPSHOT) y las partes
 * que faltan valen 0. Negativo si a < b.
 */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parts(a)
  const pb = parts(b)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

function parts(v: string | null | undefined): number[] {
  if (!v || !v.trim()) return [0]
  return v.trim().split('.').map((token) => {
    const m = /^\d+/.exec(token)
    return m ? Number.parseInt(m[0], 10) : 0
  })
}

/** Formato aceptado al publicar: 1.2, 1.2.3 o 1.2.3.4. */
export function isValidVersion(v: string): boolean {
  return /^\d{1,4}(\.\d{1,5}){1,3}$/.test(v)
}

export function maxVersion<T>(items: T[], getNumber: (item: T) => string): T | undefined {
  let max: T | undefined
  for (const item of items) {
    if (max === undefined || compareVersions(getNumber(item), getNumber(max)) > 0) max = item
  }
  return max
}

/** Identificador de cliente: el cliente.id del launcher.properties. */
export function isValidClientId(id: string): boolean {
  return /^[A-Za-z0-9._-]{2,60}$/.test(id)
}
