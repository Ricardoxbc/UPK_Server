import { Hono } from 'hono'
import { audit, clients, versions } from '../lib/db.js'
import { MAX_JAR_BYTES, deleteVersionFile, fileStatus, receiveMultipart, UploadError, type FileStatus } from '../lib/storage.js'
import {
  clientVersionKinds, parseClientIds, registerVersion, validateTargets, ValidationError,
} from '../lib/releases.js'
import { compareVersions } from '../lib/version.js'
import { ClientPicker, Layout, formatDate, formatSize } from './layout.js'
import { errorMessage, query, redirectWith, toObjectId, type PanelEnv } from './helpers.js'

export const versionsPages = new Hono<PanelEnv>()

const STATE_LABEL = { draft: 'borrador', published: 'publicada', retired: 'retirada' } as const

/** Aviso cuando el jar no está en disco (p. ej. DATA_DIR sin volumen persistente tras un redespliegue). */
function FileProblem(props: { status: FileStatus }) {
  if (props.status === 'ok') return null
  return <span class="tag failed">{props.status === 'missing' ? 'archivo faltante' : 'archivo dañado'}</span>
}

async function allClients() {
  const list = await clients().find().sort({ clientId: 1 }).toArray()
  return { list, kinds: await clientVersionKinds(list) }
}

// ---------- Lista ----------
versionsPages.get('/', async (c) => {
  const clientFilter = query(c, 'clientId')
  const list = (await versions().find(clientFilter ? { clientIds: clientFilter } : {}).toArray())
    .sort((a, b) => compareVersions(b.number, a.number) || b.createdAt.getTime() - a.createdAt.getTime())
  const statuses = new Map(await Promise.all(list.map(async (v) => [String(v._id), await fileStatus(v.path, v.size)] as const)))
  const clientIds = (await clients().find({}, { projection: { clientId: 1 } }).sort({ clientId: 1 }).toArray()).map((x) => x.clientId)
  return c.html(
    <Layout title="Versiones" username={c.get('username')} active="/panel/versions" ok={query(c, 'ok')} error={query(c, 'error')}>
      <div class="actions" style="justify-content:space-between">
        <h1>Versiones</h1>
        <a href="/panel/versions/new"><button class="primary">Subir versión</button></a>
      </div>
      <p class="muted">Cada versión existe <b>solo para los clientes asignados</b>: un cliente recibe la mayor versión
        publicada que tenga asignada. Las obligatorias se descargan sin preguntar.</p>
      <form method="get" class="actions" style="margin-bottom:10px">
        <select name="clientId"><option value="">Todos los clientes</option>
          {clientIds.map((id) => <option value={id} selected={id === clientFilter}>{id}</option>)}</select>
        <button>Filtrar</button>
      </form>
      <table>
        <thead><tr><th>Versión</th><th>Estado</th><th>Clientes</th><th>Tamaño</th><th>Publicada</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colspan={6} class="muted">No hay versiones.</td></tr>}
          {list.map((v) => (
            <tr>
              <td>
                <b>{v.number}</b> {v.isGlobal && <span class="tag global">global</span>}
                <FileProblem status={statuses.get(String(v._id)) ?? 'ok'} />
                {v.mandatory && <span class="tag mandatory">obligatoria</span>}
                <div class="muted">{v.notes.split('\n')[0].slice(0, 60)}</div>
              </td>
              <td><span class={`tag ${v.state}`}>{STATE_LABEL[v.state]}</span></td>
              <td style="max-width:360px">
                {v.clientIds.length === 0 ? <span class="muted">ninguno</span> : v.clientIds.map((id) => <span class="tag">{id}</span>)}
              </td>
              <td class="num">{formatSize(v.size)}</td>
              <td>{formatDate(v.publishedAt)}<div class="muted">por {v.createdBy}</div></td>
              <td><a href={`/panel/versions/${v._id}`}>Gestionar</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>,
  )
})

// ---------- Subir ----------
versionsPages.get('/new', async (c) => {
  const { list, kinds } = await allClients()
  return c.html(
    <Layout title="Subir versión" username={c.get('username')} active="/panel/versions" error={query(c, 'error')}>
      <h1>Subir versión</h1>
      <p class="muted">Lo normal es publicar desde la PC de desarrollo con <code>Firmador publicar</code>. Desde aquí:
        el nombre del archivo no importa (se guarda como app.jar). Obtenga la firma con <code>java -cp Launcher.jar com.upksoft.launcher.tools.Firmador firmar app.jar private_key.b64</code>
        (imprime <code>sha256</code> y <code>firma</code>).</p>
      <form class="grid box" method="post" action="/panel/versions/new" enctype="multipart/form-data" data-confirm-clients>
        <label>Versión</label><input name="version" placeholder="1.5.0" required pattern="\d+(\.\d+){1,3}" />
        <label>Firma (Base64)</label><textarea name="signature" rows={3} required></textarea>
        <label>SHA-256 (opcional)</label><input name="sha256" placeholder="si lo pega, se compara con el del archivo" />
        <label>Notas</label><textarea name="notes" rows={3} placeholder="Novedades que verá el usuario"></textarea>
        <label>Opciones</label>
        <div class="actions">
          <label><input type="checkbox" name="isGlobal" /> Última versión <b>global</b> (historial)</label>
          <label><input type="checkbox" name="mandatory" /> Obligatoria</label>
          <label><input type="checkbox" name="publish" /> Publicar al subir</label>
        </div>
        <label>Clientes</label>
        <ClientPicker clients={list} kinds={kinds} selected={[]} />
        <label>Jar</label><input type="file" name="jar" accept=".jar" required />
        <span></span><div><button class="primary">Subir</button> <span class="muted">máx. {MAX_JAR_BYTES / 1048576} MB</span></div>
      </form>
    </Layout>,
  )
})

versionsPages.post('/new', async (c) => {
  try {
    const v = await registerVersion(await receiveMultipart(c.env.incoming), c.get('username'))
    return redirectWith(c, `/panel/versions/${v._id}`, 'ok', `Versión ${v.number} subida (${STATE_LABEL[v.state]}).`)
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof UploadError)) console.error('Error al subir versión:', e)
    return redirectWith(c, '/panel/versions/new', 'error', errorMessage(e))
  }
})

// ---------- Detalle / gestión ----------
versionsPages.get('/:id', async (c) => {
  const id = toObjectId(c.req.param('id'))
  const v = id ? await versions().findOne({ _id: id }) : null
  if (!v) return redirectWith(c, '/panel/versions', 'error', 'Versión no encontrada')
  const status = await fileStatus(v.path, v.size)
  const { list, kinds } = await allClients()
  const base = `/panel/versions/${v._id}`
  return c.html(
    <Layout title={`Versión ${v.number}`} username={c.get('username')} active="/panel/versions" ok={query(c, 'ok')} error={query(c, 'error')}>
      <p><a href="/panel/versions">← Versiones</a></p>
      <h1>Versión {v.number} <span class={`tag ${v.state}`}>{STATE_LABEL[v.state]}</span>
        {v.isGlobal && <span class="tag global">global</span>}{v.mandatory && <span class="tag mandatory">obligatoria</span>}</h1>
      {status !== 'ok' && (
        <div class="msg err">El archivo de esta versión {status === 'missing' ? 'no está' : 'está dañado'} en el disco del
          servidor: los clientes reciben error 500 al descargarla. Suele pasar si <code>DATA_DIR</code> no está en un volumen
          persistente y se redesplegó. Retírela y vuelva a subirla.</div>
      )}
      <p class="muted">{formatSize(v.size)} · SHA-256 <code>{v.sha256}</code><br />
        Subida {formatDate(v.createdAt)} por {v.createdBy} · Publicada {formatDate(v.publishedAt)}</p>

      <div class="actions" style="margin-bottom:16px">
        {v.state !== 'published'
          ? <form class="inline" method="post" action={`${base}/state`}
              onsubmit={`return confirm('¿Publicar ${v.number} SOLO para: ${v.clientIds.join(', ')}?')`}>
              <input type="hidden" name="state" value="published" />
              <button class="primary">Publicar para {v.clientIds.length} cliente(s)</button></form>
          : <form class="inline" method="post" action={`${base}/state`} onsubmit="return confirm('¿Retirar? Dejará de ofrecerse a sus clientes.')">
              <input type="hidden" name="state" value="retired" /><button class="danger">Retirar</button></form>}
        {v.state !== 'published' && (
          <form class="inline" method="post" action={`${base}/delete`} onsubmit="return confirm('¿Eliminar la versión y su archivo? No se puede deshacer.')">
            <button class="danger">Eliminar</button></form>
        )}
      </div>

      <h2>Datos</h2>
      <form class="grid box" method="post" action={`${base}/details`}>
        <label>Notas</label><textarea name="notes" rows={4}>{v.notes}</textarea>
        <label>Opciones</label>
        <div class="actions">
          <label><input type="checkbox" name="isGlobal" checked={v.isGlobal} /> Versión <b>global</b></label>
          <label><input type="checkbox" name="mandatory" checked={v.mandatory} /> Obligatoria</label>
        </div>
        <span></span><div><button>Guardar datos</button></div>
      </form>

      <h2>Clientes que reciben esta versión</h2>
      <form method="post" action={`${base}/clients`} data-confirm-clients {...(v.state === 'published' ? { 'data-published': '' } : {})}>
        <ClientPicker clients={list} kinds={kinds} selected={v.clientIds} />
        <p><button class="primary">Guardar clientes</button></p>
      </form>
    </Layout>,
  )
})

versionsPages.post('/:id/state', async (c) => {
  const id = toObjectId(c.req.param('id'))
  const v = id ? await versions().findOne({ _id: id }) : null
  if (!v) return redirectWith(c, '/panel/versions', 'error', 'Versión no encontrada')
  const state = String((await c.req.parseBody()).state)
  const back = `/panel/versions/${v._id}`
  if (state !== 'published' && state !== 'retired') return redirectWith(c, back, 'error', 'Estado inválido')
  if (state === 'published' && v.clientIds.length === 0) {
    return redirectWith(c, back, 'error', 'Asigne al menos un cliente antes de publicar')
  }
  await versions().updateOne({ _id: v._id }, { $set: { state, ...(state === 'published' ? { publishedAt: new Date() } : {}) } })
  await audit(c.get('username'), state === 'published' ? 'version.publish' : 'version.retire', `${v.number} → ${v.clientIds.join(', ')}`)
  return redirectWith(c, back, 'ok', `Versión ${v.number} ${STATE_LABEL[state]}.`)
})

versionsPages.post('/:id/details', async (c) => {
  const id = toObjectId(c.req.param('id'))
  const v = id ? await versions().findOne({ _id: id }) : null
  if (!v) return redirectWith(c, '/panel/versions', 'error', 'Versión no encontrada')
  const form = await c.req.parseBody()
  const changes = {
    notes: String(form.notes ?? '').trim().slice(0, 4000),
    isGlobal: form.isGlobal === 'on',
    mandatory: form.mandatory === 'on',
  }
  await versions().updateOne({ _id: v._id }, { $set: changes })
  await audit(c.get('username'), 'version.details', `${v.number}: global=${changes.isGlobal}, obligatoria=${changes.mandatory}`)
  return redirectWith(c, `/panel/versions/${v._id}`, 'ok', 'Datos guardados.')
})

versionsPages.post('/:id/clients', async (c) => {
  const id = toObjectId(c.req.param('id'))
  const v = id ? await versions().findOne({ _id: id }) : null
  if (!v) return redirectWith(c, '/panel/versions', 'error', 'Versión no encontrada')
  const back = `/panel/versions/${v._id}`
  const form = await c.req.parseBody({ all: true })
  const raw = form.clientIds
  const clientIds = parseClientIds(Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [])
  if (v.state === 'published' && clientIds.length === 0) {
    return redirectWith(c, back, 'error', 'Una versión publicada debe tener al menos un cliente (o retírela)')
  }
  try {
    await validateTargets(v.number, clientIds, v._id)
  } catch (e) {
    return redirectWith(c, back, 'error', errorMessage(e))
  }
  await versions().updateOne({ _id: v._id }, { $set: { clientIds } })
  const added = clientIds.filter((x) => !v.clientIds.includes(x))
  const removed = v.clientIds.filter((x) => !clientIds.includes(x))
  await audit(c.get('username'), 'version.clients',
    `${v.number}: +[${added.join(', ')}] -[${removed.join(', ')}]`)
  return redirectWith(c, back, 'ok', `Clientes guardados (${clientIds.length}).`)
})

versionsPages.post('/:id/delete', async (c) => {
  const id = toObjectId(c.req.param('id'))
  const v = id ? await versions().findOne({ _id: id }) : null
  if (!v) return redirectWith(c, '/panel/versions', 'error', 'Versión no encontrada')
  if (v.state === 'published') return redirectWith(c, `/panel/versions/${v._id}`, 'error', 'Retire la versión antes de eliminarla')
  await versions().deleteOne({ _id: v._id })
  await deleteVersionFile(v.path)
  await audit(c.get('username'), 'version.delete', v.number)
  return redirectWith(c, '/panel/versions', 'ok', `Versión ${v.number} eliminada.`)
})
