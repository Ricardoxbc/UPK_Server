/**
 * Comparación de versiones tipo 1.2.3, idéntica a VersionUtil.comparar del Launcher:
 * cada parte toma sus dígitos iniciales (ignora sufijos como -SNAPSHOT) y las partes
 * que faltan valen 0. Negativo si a < b.
 */
export function comparar(a: string | null | undefined, b: string | null | undefined): number {
  const va = partes(a)
  const vb = partes(b)
  const n = Math.max(va.length, vb.length)
  for (let i = 0; i < n; i++) {
    const x = va[i] ?? 0
    const y = vb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

function partes(v: string | null | undefined): number[] {
  if (!v || !v.trim()) return [0]
  return v.trim().split('.').map((t) => {
    const m = /^\d+/.exec(t)
    return m ? Number.parseInt(m[0], 10) : 0
  })
}

/** Formato aceptado al publicar: 1.2 o 1.2.3 (opcionalmente 1.2.3.4). */
export function esVersionValida(v: string): boolean {
  return /^\d{1,4}(\.\d{1,5}){1,3}$/.test(v)
}

export function mayor<T>(items: T[], numero: (t: T) => string): T | undefined {
  let max: T | undefined
  for (const it of items) {
    if (max === undefined || comparar(numero(it), numero(max)) > 0) max = it
  }
  return max
}
