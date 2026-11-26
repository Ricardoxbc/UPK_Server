import type { HttpBindings } from '@hono/node-server'
import { Hono } from 'hono'
import { recibirMultipart } from '../lib/almacenamiento.js'
import { requiereToken, type Variables } from '../lib/auth.js'
import { ErrorValidacion, registrarVersion } from '../lib/versiones.js'

/** API de administración (la usa `Firmador publicar`). Requiere Authorization: Bearer <token>. */
export const admin = new Hono<{ Bindings: HttpBindings; Variables: Variables }>()

admin.use('*', requiereToken)

admin.post('/versiones', async (c) => {
  try {
    const subida = await recibirMultipart(c.env.incoming)
    const v = await registrarVersion(subida, c.get('usuario'))
    return c.json({
      ok: true,
      version: v.numero,
      estado: v.estado,
      obligatoria: v.obligatoria,
      sha256: v.sha256,
      tamano: v.tamano,
    }, 201)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: msg }, e instanceof ErrorValidacion ? 400 : 500)
  }
})
