import { serve, type HttpBindings } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { config } from './lib/config.js'
import { admins, connect, disconnect } from './lib/db.js'
import { hashPassword } from './lib/auth.js'
import { cleanTempFiles } from './lib/storage.js'
import { publicRoutes } from './routes/public.js'
import { adminRoutes } from './routes/admin.js'
import { panel } from './panel/index.js'

const UPLOAD_PATHS = new Set(['/api/admin/versions', '/panel/versions/new'])

const app = new Hono<{ Bindings: HttpBindings }>()

// same-origin: con no-referrer los navegadores envían "Origin: null" en los POST y fallaría la protección CSRF
app.use('*', secureHeaders({ referrerPolicy: 'same-origin' }))
// Límite de cuerpo para todo salvo las subidas de jar (que van en flujo a disco)
app.use('*', async (c, next) => {
  if (c.req.method === 'POST' && UPLOAD_PATHS.has(c.req.path)) return next()
  return bodyLimit({ maxSize: 256 * 1024 })(c, next)
})

app.get('/', (c) => c.redirect('/panel/versions'))
app.get('/health', (c) => c.json({ ok: true }))
app.route('/api/v1', publicRoutes)
app.route('/api/admin', adminRoutes)
app.route('/panel', panel)

app.onError((e, c) => {
  console.error(`Error en ${c.req.method} ${c.req.path}:`, e)
  return c.json({ error: 'Error interno del servidor' }, 500)
})

async function createInitialAdmin(): Promise<void> {
  const { username, password } = config.initialAdmin
  if ((await admins().countDocuments()) > 0) return
  if (!username || password.length < 10) {
    console.warn('No hay administradores. Defina ADMIN_USER y ADMIN_PASSWORD (mín. 10 caracteres) o use npm run create-admin.')
    return
  }
  await admins().insertOne({ username, passwordHash: await hashPassword(password), createdAt: new Date() })
  console.log(`Administrador inicial "${username}" creado. Quite ADMIN_PASSWORD de las variables de entorno.`)
}

await connect()
await cleanTempFiles()
await createInitialAdmin()

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`UPK Server escuchando en el puerto ${info.port} (datos en ${config.dataDir})`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    disconnect().finally(() => process.exit(0))
  })
}
