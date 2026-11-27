import type { HttpBindings } from '@hono/node-server'
import { Hono } from 'hono'
import { receiveMultipart, UploadError } from '../lib/storage.js'
import { requireApiToken, type AuthVariables } from '../lib/auth.js'
import { clients } from '../lib/db.js'
import { registerVersion, ValidationError } from '../lib/releases.js'
import { registerComponentPackage } from '../lib/components.js'

/** API de administración (la usa `Firmador publicar`). Requiere Authorization: Bearer <token>. */
export const adminRoutes = new Hono<{ Bindings: HttpBindings; Variables: AuthVariables }>()

adminRoutes.use('*', requireApiToken)

adminRoutes.post('/versions', async (c) => {
  try {
    const v = await registerVersion(await receiveMultipart(c.env.incoming), c.get('username'))
    return c.json({
      ok: true,
      id: v._id!.toHexString(),
      version: v.number,
      state: v.state,
      mandatory: v.mandatory,
      isGlobal: v.isGlobal,
      clientIds: v.clientIds,
      sha256: v.sha256,
      size: v.size,
    }, 201)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const isUserError = e instanceof ValidationError || e instanceof UploadError
    if (!isUserError) console.error('Error al subir versión:', e)
    return c.json({ error: message }, isUserError ? 400 : 500)
  }
})

/** Lista de clientes registrados (para elegir destinos desde la línea de comandos). */
adminRoutes.get('/clients', async (c) => {
  const list = await clients().find({}, { projection: { _id: 0, clientId: 1, name: 1, active: 1, lastVersion: 1 } })
    .sort({ clientId: 1 }).toArray()
  return c.json(list)
})

/** Paquete de componente (lo usa `Firmador publicar-componente`). */
adminRoutes.post('/components', async (c) => {
  try {
    const p = await registerComponentPackage(await receiveMultipart(c.env.incoming), c.get('username'))
    return c.json({ ok: true, id: p._id!.toHexString(), component: p.component, version: p.number, sha256: p.sha256, size: p.size }, 201)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const isUserError = e instanceof ValidationError || e instanceof UploadError
    if (!isUserError) console.error('Error al subir paquete de componente:', e)
    return c.json({ error: message }, isUserError ? 400 : 500)
  }
})
