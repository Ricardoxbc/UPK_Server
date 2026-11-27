import { serve, type HttpBindings } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { config } from './lib/config.js'
import { admins, connect, disconnect, versions } from './lib/db.js'
import { hashPassword } from './lib/auth.js'
import { checkDataDirWritable, cleanTempFiles, fileStatus } from './lib/storage.js'
import { publicRoutes } from './routes/public.js'
import { adminRoutes } from './routes/admin.js'
import { panel } from './panel/index.js'

const UPLOAD_PATHS = new Set(['/api/admin/versions', '/panel/versions/new'])

const app = new Hono<{ Bindings: HttpBindings }>()

// same-origin: con no-referrer los navegadores envían "Origin: null" en los POST y fallaría la protección CSRF
app.use('*', secureHeaders({ referrerPolicy: 'same-origin' }))
// Log de la API (poco tráfico: una línea por petición) para diagnosticar desde los logs de EasyPanel
app.use('/api/*', async (c, next) => {
  const started = Date.now()
  await next()
  const line = `[api] ${c.req.method} ${c.req.path}${new URL(c.req.url).search} → ${c.res.status} (${Date.now() - started} ms)`
  if (c.res.status >= 500) console.error(line)
  else console.log(line)
})
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

/** Avisa en el log si DATA_DIR no se puede escribir o si faltan jar de versiones publicadas. */
async function checkStorage(): Promise<void> {
  try {
    await checkDataDirWritable()
  } catch (e) {
    console.error(`[storage] No se puede escribir en DATA_DIR=${config.dataDir}: ${e instanceof Error ? e.message : e}. ` +
      'Las subidas fallarán. Revise el volumen montado en /data y sus permisos.')
    return
  }
  const published = await versions().find({ state: 'published' }, { projection: { number: 1, path: 1, size: 1 } }).toArray()
  for (const v of published) {
    const status = await fileStatus(v.path, v.size)
    if (status !== 'ok') {
      console.error(`[storage] Versión publicada ${v.number} (${v._id}): archivo ${status === 'missing' ? 'FALTANTE' : 'con tamaño distinto'}. ` +
        '¿DATA_DIR está en un volumen persistente? Vuelva a subir la versión.')
    }
  }
}

await connect()
await checkStorage()
await cleanTempFiles().catch((e) => console.error('[storage] No se pudo limpiar tmp:', e instanceof Error ? e.message : e))
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
