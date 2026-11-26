import { Hono } from 'hono'
import { audit } from '../lib/db.js'
import { checkCredentials, endSession, isSameOrigin, requireSession, startSession } from '../lib/auth.js'
import { clientIp } from '../routes/public.js'
import { Layout, PANEL_SCRIPT, STYLESHEET } from './layout.js'
import { query, redirectWith, type PanelEnv } from './helpers.js'
import { versionsPages } from './versionsPages.js'
import { clientsPages } from './clientsPages.js'
import { miscPages } from './miscPages.js'

export const panel = new Hono<PanelEnv>()

panel.get('/style.css', (c) => c.body(STYLESHEET, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'max-age=3600' }))
panel.get('/panel.js', (c) => c.body(PANEL_SCRIPT, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'max-age=3600' }))

// ---------- Login (límite simple de intentos por IP) ----------
const attempts = new Map<string, { count: number; since: number }>()
const WINDOW_MS = 15 * 60 * 1000

function isBlocked(ip: string): boolean {
  const a = attempts.get(ip)
  return !!a && Date.now() - a.since <= WINDOW_MS && a.count >= 10
}

function recordFailure(ip: string): void {
  const a = attempts.get(ip)
  if (!a || Date.now() - a.since > WINDOW_MS) attempts.set(ip, { count: 1, since: Date.now() })
  else a.count++
  if (attempts.size > 5000) attempts.clear()
}

panel.get('/login', (c) =>
  c.html(
    <Layout title="Ingresar" error={query(c, 'error')}>
      <div class="box" style="max-width:360px;margin:60px auto">
        <h1>UPK Server</h1>
        <form method="post" action="/panel/login" class="grid" style="grid-template-columns:90px 1fr">
          <label>Usuario</label><input name="username" autocomplete="username" required autofocus />
          <label>Clave</label><input name="password" type="password" autocomplete="current-password" required />
          <span></span><button class="primary">Ingresar</button>
        </form>
      </div>
    </Layout>,
  ),
)

panel.post('/login', async (c) => {
  if (!isSameOrigin(c)) return c.text('Origen no permitido', 403)
  const ip = clientIp(c) ?? '?'
  if (isBlocked(ip)) return redirectWith(c, '/panel/login', 'error', 'Demasiados intentos. Espere 15 minutos.')
  const form = await c.req.parseBody()
  const username = String(form.username ?? '').trim()
  if (!(await checkCredentials(username, String(form.password ?? '')))) {
    recordFailure(ip)
    return redirectWith(c, '/panel/login', 'error', 'Usuario o clave incorrectos')
  }
  attempts.delete(ip)
  await startSession(c, username)
  await audit(username, 'session.login', ip)
  return c.redirect('/panel/versions')
})

panel.post('/logout', (c) => {
  endSession(c)
  return c.redirect('/panel/login')
})

// ---------- Todo lo demás exige sesión ----------
panel.use('*', requireSession)
panel.get('/', (c) => c.redirect('/panel/versions'))
panel.route('/versions', versionsPages)
panel.route('/clients', clientsPages)
panel.route('/', miscPages)
