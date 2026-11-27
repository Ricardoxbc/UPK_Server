import { Hono, type Context } from 'hono'
import { generateToken, hashPassword, hashToken, checkCredentials } from '../lib/auth.js'
import { admins, apiTokens, audit, auditLog, clients, reports, versions, REPORT_RESULTS } from '../lib/db.js'
import { compareVersions } from '../lib/version.js'
import { Layout, formatDate } from './layout.js'
import { query, redirectWith, toObjectId, type PanelEnv } from './helpers.js'

export const miscPages = new Hono<PanelEnv>()

const RESULT_LABEL: Record<string, string> = {
  updated: 'actualizado', cancelled: 'cancelado', failed: 'fallido',
  reverted: 'revertido', skipped: 'omitido', postponed: 'pospuesto',
}

// ---------- Historial de versiones globales ----------
miscPages.get('/global', async (c) => {
  const list = (await versions().find({ isGlobal: true }).toArray())
    .sort((a, b) => compareVersions(b.number, a.number) || b.createdAt.getTime() - a.createdAt.getTime())
  const installed = await clients().aggregate<{ _id: string; ids: string[] }>([
    { $match: { active: true } }, { $group: { _id: '$lastVersion', ids: { $push: '$clientId' } } },
  ]).toArray()
  const byVersion = new Map(installed.map((x) => [x._id, x.ids]))
  return c.html(
    <Layout title="Historial global" username={c.get('username')} active="/panel/global">
      <h1>Historial de versiones globales</h1>
      <p class="muted">Versiones marcadas como "global" (la versión general de la app). La más reciente es la última global.</p>
      <table>
        <thead><tr><th>Versión</th><th>Estado</th><th>Subida</th><th>Asignada a</th><th>La tienen instalada</th><th>Notas</th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colspan={6} class="muted">Aún no hay versiones globales.</td></tr>}
          {list.map((v, i) => {
            const have = (byVersion.get(v.number) ?? []).filter((id) => v.clientIds.includes(id))
            return (
              <tr>
                <td><a href={`/panel/versions/${v._id}`}><b>{v.number}</b></a> {i === 0 && <span class="tag global">última global</span>}</td>
                <td><span class={`tag ${v.state}`}>{v.state === 'published' ? 'publicada' : v.state === 'draft' ? 'borrador' : 'retirada'}</span></td>
                <td>{formatDate(v.createdAt)}</td>
                <td>{v.clientIds.length} cliente(s)</td>
                <td>{have.length} {have.length > 0 && <span class="muted">({have.join(', ')})</span>}</td>
                <td class="muted">{v.notes.split('\n')[0].slice(0, 80)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Layout>,
  )
})

// ---------- Reportes ----------
miscPages.get('/reports', async (c) => {
  const clientId = query(c, 'clientId')
  const result = query(c, 'result')
  const filter: Record<string, string> = {}
  if (clientId) filter.clientId = clientId
  if (result) filter.result = result
  const list = await reports().find(filter).sort({ createdAt: -1 }).limit(300).toArray()
  const ids = (await clients().find({}, { projection: { clientId: 1 } }).sort({ clientId: 1 }).toArray()).map((x) => x.clientId)
  return c.html(
    <Layout title="Reportes" username={c.get('username')} active="/panel/reports">
      <h1>Reportes de actualización</h1>
      <form method="get" class="actions" style="margin-bottom:12px">
        <select name="clientId"><option value="">Todos los clientes</option>
          {ids.map((id) => <option value={id} selected={id === clientId}>{id}</option>)}</select>
        <select name="result"><option value="">Todos los resultados</option>
          {REPORT_RESULTS.map((r) => <option value={r} selected={r === result}>{RESULT_LABEL[r]}</option>)}</select>
        <button>Filtrar</button>
        <span class="muted">Últimos 300 · se guardan 180 días</span>
      </form>
      <table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Equipo</th><th>Versión</th><th>Resultado</th><th>Detalle</th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colspan={6} class="muted">Sin reportes.</td></tr>}
          {list.map((r) => (
            <tr>
              <td>{formatDate(r.createdAt)}</td><td>{r.clientId}</td><td>{r.machine}</td>
              <td>{r.component === 'launcher' && <span class="tag global">Launcher</span>}{r.fromVersion} → {r.toVersion}</td>
              <td><span class={`tag ${r.result}`}>{RESULT_LABEL[r.result] ?? r.result}</span></td>
              <td class="muted">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>,
  )
})

// ---------- Auditoría ----------
miscPages.get('/audit', async (c) => {
  const list = await auditLog().find().sort({ createdAt: -1 }).limit(300).toArray()
  return c.html(
    <Layout title="Auditoría" username={c.get('username')} active="/panel/audit">
      <h1>Auditoría</h1>
      <table>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>
          {list.map((a) => <tr><td>{formatDate(a.createdAt)}</td><td>{a.username}</td><td><code>{a.action}</code></td><td class="muted">{a.detail}</td></tr>)}
        </tbody>
      </table>
    </Layout>,
  )
})

// ---------- Tokens de publicación ----------
async function tokensPage(c: Context<PanelEnv>, created?: { name: string; token: string }) {
  const list = await apiTokens().find().sort({ createdAt: -1 }).toArray()
  return c.html(
    <Layout title="Tokens" username={c.get('username')} active="/panel/tokens" ok={query(c, 'ok')} error={query(c, 'error')}>
      <h1>Tokens de publicación</h1>
      <p class="muted">Los usa <code>Firmador publicar</code> (variable <code>UPK_TOKEN</code>). Trátelos como contraseñas.</p>
      {created && (
        <div class="box" style="margin-bottom:14px">
          <b>Token "{created.name}" creado.</b> Cópielo ahora: no se volverá a mostrar.
          <pre style="margin-top:8px"><code>{created.token}</code></pre>
        </div>
      )}
      <table>
        <thead><tr><th>Nombre</th><th>Creado</th><th>Último uso</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {list.map((t) => (
            <tr>
              <td>{t.name}</td><td>{formatDate(t.createdAt)} <span class="muted">por {t.createdBy}</span></td><td>{formatDate(t.lastUsedAt)}</td>
              <td>{t.revoked ? <span class="tag retired">revocado</span> : <span class="tag published">activo</span>}</td>
              <td>{!t.revoked && (
                <form class="inline" method="post" action={`/panel/tokens/${t._id}/revoke`} onsubmit="return confirm('¿Revocar este token?')">
                  <button class="danger">Revocar</button>
                </form>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form method="post" action="/panel/tokens" class="actions">
        <input name="name" placeholder="Nombre (ej.: PC de desarrollo)" required size={30} />
        <button class="primary">Crear token</button>
      </form>
    </Layout>,
  )
}

miscPages.get('/tokens', (c) => tokensPage(c))

miscPages.post('/tokens', async (c) => {
  const name = String((await c.req.parseBody()).name ?? '').trim().slice(0, 60)
  if (!name) return redirectWith(c, '/panel/tokens', 'error', 'Indique un nombre')
  const token = generateToken()
  await apiTokens().insertOne({
    name, hash: hashToken(token), createdAt: new Date(), createdBy: c.get('username'), revoked: false, lastUsedAt: null,
  })
  await audit(c.get('username'), 'token.create', name)
  return tokensPage(c, { name, token })
})

miscPages.post('/tokens/:id/revoke', async (c) => {
  const id = toObjectId(c.req.param('id'))
  if (!id) return c.text('Id inválido', 400)
  const token = await apiTokens().findOneAndUpdate({ _id: id }, { $set: { revoked: true } })
  if (token) await audit(c.get('username'), 'token.revoke', token.name)
  return redirectWith(c, '/panel/tokens', 'ok', 'Token revocado.')
})

// ---------- Cuenta y administradores ----------
miscPages.get('/account', async (c) => {
  const list = await admins().find({}, { projection: { username: 1, createdAt: 1 } }).toArray()
  return c.html(
    <Layout title="Cuenta" username={c.get('username')} active="/panel/account" ok={query(c, 'ok')} error={query(c, 'error')}>
      <h1>Cuenta</h1>
      <h2>Cambiar mi clave</h2>
      <form method="post" action="/panel/account/password" class="grid box">
        <label>Clave actual</label><input type="password" name="current" required autocomplete="current-password" />
        <label>Nueva clave</label><input type="password" name="next" required minlength={10} autocomplete="new-password" />
        <span></span><button class="primary">Cambiar clave</button>
      </form>
      <h2>Administradores</h2>
      <table><tbody>{list.map((a) => <tr><td>{a.username}</td><td class="muted">desde {formatDate(a.createdAt)}</td></tr>)}</tbody></table>
      <form method="post" action="/panel/account/admins" class="grid box">
        <label>Usuario</label><input name="username" required pattern="[A-Za-z0-9._\-]{3,30}" />
        <label>Clave</label><input type="password" name="password" required minlength={10} autocomplete="new-password" />
        <span></span><button>Agregar administrador</button>
      </form>
    </Layout>,
  )
})

miscPages.post('/account/password', async (c) => {
  const form = await c.req.parseBody()
  const username = c.get('username')
  const next = String(form.next ?? '')
  if (!(await checkCredentials(username, String(form.current ?? '')))) {
    return redirectWith(c, '/panel/account', 'error', 'La clave actual no es correcta')
  }
  if (next.length < 10) return redirectWith(c, '/panel/account', 'error', 'La nueva clave debe tener al menos 10 caracteres')
  await admins().updateOne({ username }, { $set: { passwordHash: await hashPassword(next) } })
  await audit(username, 'account.password')
  return redirectWith(c, '/panel/account', 'ok', 'Clave cambiada.')
})

miscPages.post('/account/admins', async (c) => {
  const form = await c.req.parseBody()
  const username = String(form.username ?? '').trim()
  const password = String(form.password ?? '')
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(username) || password.length < 10) {
    return redirectWith(c, '/panel/account', 'error', 'Usuario (3–30 caracteres) y clave (mín. 10) requeridos')
  }
  if (await admins().findOne({ username })) return redirectWith(c, '/panel/account', 'error', 'Ese usuario ya existe')
  await admins().insertOne({ username, passwordHash: await hashPassword(password), createdAt: new Date() })
  await audit(c.get('username'), 'admin.create', username)
  return redirectWith(c, '/panel/account', 'ok', `Administrador ${username} creado.`)
})
