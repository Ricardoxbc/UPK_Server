import { Hono } from 'hono'
import { audit, clients, identifications, versions, type IdentifyResult } from '../lib/db.js'
import { clientVersionKinds } from '../lib/releases.js'
import { compareVersions, isValidClientId } from '../lib/version.js'
import { KindTag, Layout, formatDate } from './layout.js'
import { query, redirectWith, type PanelEnv } from './helpers.js'

export const clientsPages = new Hono<PanelEnv>()

const IDENTIFY_LABEL: Record<IdentifyResult, [string, string]> = {
  ok: ['aceptado', 'updated'],
  unknown_client: ['ID inexistente', 'failed'],
  inactive: ['cliente inactivo', 'failed'],
  version_mismatch: ['versión incorrecta', 'failed'],
  blocked: ['bloqueado (intentos)', 'failed'],
}

clientsPages.get('/', async (c) => {
  const list = await clients().find().sort({ clientId: 1 }).toArray()
  const kinds = await clientVersionKinds(list)
  // Mayor versión publicada asignada a cada cliente (lo que recibiría en su próximo inicio)
  const published = await versions().find({ state: 'published' }, { projection: { number: 1, clientIds: 1 } }).toArray()
  const offered = new Map<string, string>()
  for (const v of published) {
    for (const id of v.clientIds) {
      const current = offered.get(id)
      if (!current || compareVersions(v.number, current) > 0) offered.set(id, v.number)
    }
  }
  const idents = await identifications().find().sort({ createdAt: -1 }).limit(30).toArray()
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const rejected = idents.filter((i) => i.result !== 'ok' && i.createdAt >= weekAgo).length
  return c.html(
    <Layout title="Clientes" username={c.get('username')} active="/panel/clients" ok={query(c, 'ok')} error={query(c, 'error')}>
      <h1>Clientes</h1>
      <p class="muted">El identificador es el <code>cliente.id</code> del <code>launcher.properties</code> de cada instalación.
        Se registran solos cuando su Launcher consulta, o puede agregarlos aquí antes de instalar.
        Un cliente inactivo no recibe actualizaciones.</p>
      <table>
        <thead><tr><th>Cliente</th><th>Instalada</th><th>Disponible</th><th>Último contacto</th><th>Configuración</th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colspan={5} class="muted">Sin clientes todavía.</td></tr>}
          {list.map((cl) => {
            const next = offered.get(cl.clientId)
            const pending = next && compareVersions(next, cl.lastVersion) > 0
            return (
              <tr>
                <td><b>{cl.clientId}</b><div class="muted">{cl.name}</div>{!cl.active && <span class="tag inactive">inactivo</span>}</td>
                <td>{cl.lastVersion ?? '—'} <KindTag kind={kinds.get(cl.clientId) ?? 'unknown'} /></td>
                <td>{next ?? <span class="muted">ninguna</span>}{pending && <span class="tag mandatory">pendiente</span>}
                  <div><a href={`/panel/versions?clientId=${encodeURIComponent(cl.clientId)}`}>ver versiones</a></div></td>
                <td>{formatDate(cl.lastSeenAt)}<div class="muted">{cl.lastIp ?? ''}</div></td>
                <td>
                  <form method="post" action={`/panel/clients/${encodeURIComponent(cl.clientId)}`} class="actions">
                    <input name="name" value={cl.name} placeholder="Nombre / empresa" size={20} />
                    <label><input type="checkbox" name="active" checked={cl.active} /> Activo</label>
                    <button>Guardar</button>
                  </form>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2 id="identificaciones">Identificaciones</h2>
      <p class="muted">Cuando un equipo no tiene <code>launcher.properties</code> (instalación copiada o archivo borrado), el Launcher
        pide el ID del cliente y la versión. Se acepta solo si el cliente existe, está activo y la versión es exactamente la
        columna <b>Disponible</b> (sin versiones publicadas: la <b>Instalada</b>). Revise los rechazos: alguien escribió un ID
        ajeno o equivocado.</p>
      {rejected > 0 && <div class="msg err">{rejected} identificación(es) rechazada(s) en los últimos 7 días.</div>}
      <table>
        <thead><tr><th>Fecha</th><th>ID escrito</th><th>Versión escrita</th><th>Equipo</th><th>Resultado</th></tr></thead>
        <tbody>
          {idents.length === 0 && <tr><td colspan={5} class="muted">Sin identificaciones.</td></tr>}
          {idents.map((i) => (
            <tr>
              <td>{formatDate(i.createdAt)}</td>
              <td><b>{i.clientId}</b></td>
              <td>{i.version}</td>
              <td>{i.machine || '—'}<div class="muted">{i.ip ?? ''}{i.hasApp ? '' : ' · sin app.jar'}</div></td>
              <td><span class={`tag ${IDENTIFY_LABEL[i.result][1]}`}>{IDENTIFY_LABEL[i.result][0]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Agregar cliente</h2>
      <form method="post" action="/panel/clients" class="actions box">
        <input name="clientId" placeholder="cliente.id exacto" required pattern="[A-Za-z0-9._\-]{2,60}" />
        <input name="name" placeholder="Nombre / empresa" size={30} />
        <button class="primary">Agregar</button>
      </form>
    </Layout>,
  )
})

clientsPages.post('/', async (c) => {
  const form = await c.req.parseBody()
  const clientId = String(form.clientId ?? '').trim()
  if (!isValidClientId(clientId)) {
    return redirectWith(c, '/panel/clients', 'error', 'Identificador inválido (2–60 caracteres: letras, números, . _ -)')
  }
  if (await clients().findOne({ clientId })) return redirectWith(c, '/panel/clients', 'error', `El cliente ${clientId} ya existe`)
  await clients().insertOne({
    clientId, name: String(form.name ?? '').trim().slice(0, 100), active: true,
    lastVersion: null, lastSeenAt: null, lastIp: null, createdAt: new Date(),
  })
  await audit(c.get('username'), 'client.create', clientId)
  return redirectWith(c, '/panel/clients', 'ok', `Cliente ${clientId} agregado.`)
})

clientsPages.post('/:clientId', async (c) => {
  const clientId = c.req.param('clientId')
  const form = await c.req.parseBody()
  const changes = { name: String(form.name ?? '').trim().slice(0, 100), active: form.active === 'on' }
  const result = await clients().updateOne({ clientId }, { $set: changes })
  if (!result.matchedCount) return redirectWith(c, '/panel/clients', 'error', 'Cliente no encontrado')
  await audit(c.get('username'), 'client.update', `${clientId}: activo=${changes.active}`)
  return redirectWith(c, '/panel/clients', 'ok', `Cliente ${clientId} guardado.`)
})
