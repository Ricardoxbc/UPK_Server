import type { HttpBindings } from '@hono/node-server'
import type { Context } from 'hono'
import { ObjectId } from 'mongodb'
import type { AuthVariables } from '../lib/auth.js'

export type PanelEnv = { Bindings: HttpBindings; Variables: AuthVariables }

export const query = (c: Context, key: string) => c.req.query(key) || undefined

/** Patrón POST → redirect con mensaje (?ok= / ?error=). */
export const redirectWith = (c: Context, path: string, kind: 'ok' | 'error', message: string) =>
  c.redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(message)}`)

export function toObjectId(value: string): ObjectId | null {
  return ObjectId.isValid(value) && value.length === 24 ? new ObjectId(value) : null
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
