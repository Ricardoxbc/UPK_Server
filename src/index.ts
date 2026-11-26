import { serve, type HttpBindings } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { config } from './lib/config.js'
import { admins, cerrar, conectar } from './lib/db.js'
import { hashClave } from './lib/auth.js'
import { limpiarTemporales } from './lib/almacenamiento.js'
import { publica } from './rutas/publica.js'
import { admin } from './rutas/admin.js'
import { panel } from './panel/rutas.js'

const app = new Hono<{ Bindings: HttpBindings }>()

// same-origin: con no-referrer los navegadores envían "Origin: null" en los POST y fallaría la protección CSRF
app.use('*', secureHeaders({ referrerPolicy: 'same-origin' }))
// Límite de cuerpo para todo salvo las subidas de jar (que van en flujo a disco)
app.use('*', async (c, next) => {
  if (c.req.method === 'POST' && (c.req.path === '/api/admin/versiones' || c.req.path === '/panel/versiones/subir')) {
    return next()
  }
  return bodyLimit({ maxSize: 64 * 1024 })(c, next)
})

app.get('/', (c) => c.redirect('/panel/versiones'))
app.get('/salud', (c) => c.json({ ok: true }))
app.route('/api/v1', publica)
app.route('/api/admin', admin)
app.route('/panel', panel)

app.onError((e, c) => {
  console.error(`Error en ${c.req.method} ${c.req.path}:`, e)
  return c.json({ error: 'Error interno del servidor' }, 500)
})

async function crearAdminInicial(): Promise<void> {
  const { usuario, clave } = config.adminInicial
  if ((await admins().countDocuments()) > 0) return
  if (!usuario || clave.length < 10) {
    console.warn('No hay administradores. Defina ADMIN_USUARIO y ADMIN_CLAVE (mín. 10 caracteres) o use npm run crear-admin.')
    return
  }
  await admins().insertOne({ usuario, claveHash: await hashClave(clave), creadoEn: new Date() })
  console.log(`Administrador inicial "${usuario}" creado. Quite ADMIN_CLAVE de las variables de entorno.`)
}

await conectar()
await limpiarTemporales()
await crearAdminInicial()

const server = serve({ fetch: app.fetch, port: config.puerto }, (info) => {
  console.log(`UPK Server escuchando en el puerto ${info.port} (datos en ${config.dataDir})`)
})

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    server.close()
    cerrar().finally(() => process.exit(0))
  })
}
