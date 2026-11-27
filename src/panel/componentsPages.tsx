import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { ObjectId } from 'mongodb'
import {
  audit, clients, componentPackages, componentReports, SYNC_ENV_KEYS, type ComponentState,
} from '../lib/db.js'
import { cleanSyncEnv, registerComponentPackage, syncSettings, targetPackage } from '../lib/components.js'
import { ValidationError } from '../lib/releases.js'
import { MAX_JAR_BYTES, deleteVersionFile, fileStatus, receiveMultipart, UploadError } from '../lib/storage.js'
import { compareVersions } from '../lib/version.js'
import { Layout, formatDate, formatSize } from './layout.js'
import { errorMessage, query, redirectWith, toObjectId, type PanelEnv } from './helpers.js'

/**
 * Servicio de sincronización (UPK Sync): paquetes subidos y, por cliente, si debe estar instalado,
 * con qué configuración y qué reportó su Launcher. Lo aplica solo el Launcher en modo servidor.
 */
export const componentsPages = new Hono<PanelEnv>()

const STATE_LABEL: Record<ComponentState, string> = {
  running: 'en ejecución', stopped: 'detenido', uninstalled: 'desinstalado', failed: 'con error',
}

const ENV_LABEL: Record<(typeof SYNC_ENV_KEYS)[number], [string, string]> = {
  UPK_MONGODB_URI: ['URI de MongoDB', 'mongodb+srv://usuario:clave@host/'],
  UPK_MONGODB_DB: ['Base de MongoDB', 'mobile-conn'],
  UPK_WEBHOOK_URL: ['Webhook (opcional)', 'https://…/webhook/…'],
  SYNC_CRON: ['Frecuencia (cron, opcional)', '*/5 * * * *  (cada 5 minutos)'],
}

function StateTag(props: { state: ComponentState | undefined }) {
  if (!props.state) return <span class="muted">sin reporte</span>
  return <span class={`tag ${props.state}`}>{STATE_LABEL[props.state]}</span>
}

// ---------- Resumen: paquetes y clientes ----------
componentsPages.get('/', async (c) => {
  const packages = (await componentPackages().find({ component: 'syncService' }).toArray())
    .sort((a, b) => compareVersions(b.number, a.number))
  const latest = packages[0]?.number
  const list = await clients().find().sort({ clientId: 1 }).toArray()
  const packageNumber = new Map(packages.map((p) => [String(p._id), p.number]))
  return c.html(
    <Layout title="Sincronización" username={c.get('username')} active="/panel/components" ok={query(c, 'ok')} error={query(c, 'error')}>
      <h1>Servicio de sincronización (UPK Sync)</h1>
      <p class="muted">Al activarlo para un cliente, el Launcher del <b>equipo servidor</b> (modo=servidor) lo instala en PM2
        al abrir el sistema, lo deja arrancando con Windows y reporta su estado. Al desactivarlo, lo desinstala.
        El primer Launcher que consulta queda <b>vinculado</b>; ningún otro equipo recibe la configuración.</p>

      <h2>Clientes</h2>
      <table>
        <thead><tr><th>Cliente</th><th>Deseado</th><th>Estado reportado</th><th>Equipo vinculado</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colspan={5} class="muted">Sin clientes.</td></tr>}
          {list.map((cl) => {
            const s = syncSettings(cl)
            const wanted = s.packageId ? packageNumber.get(String(s.packageId)) ?? '¿?' : latest
            return (
              <tr>
                <td><b>{cl.clientId}</b><div class="muted">{cl.name}</div></td>
                <td>{s.enabled ? <span>activado <span class="muted">({wanted ?? 'sin paquete'}{s.packageId ? '' : ', la más reciente'})</span></span>
                  : <span class="muted">desactivado</span>}</td>
                <td><StateTag state={s.status?.state} /> {s.status?.version}
                  {s.resetId && <span class="tag mandatory">reinicio pendiente</span>}
                  <div class="muted">{s.status ? formatDate(s.status.reportedAt) : ''}</div></td>
                <td>{s.boundMachine ?? <span class="muted">—</span>}</td>
                <td><a href={`/panel/components/clients/${encodeURIComponent(cl.clientId)}`}>Configurar</a></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2>Paquetes</h2>
      <p class="muted">Se generan con <code>npm run pack</code> en el proyecto del servicio y se publican con
        <code>Firmador publicar-componente</code> (o desde el formulario de abajo con la firma de <code>Firmador firmar</code>).</p>
      <table>
        <thead><tr><th>Versión</th><th>Tamaño</th><th>Subido</th><th>Notas</th><th></th></tr></thead>
        <tbody>
          {packages.length === 0 && <tr><td colspan={5} class="muted">No hay paquetes.</td></tr>}
          {await Promise.all(packages.map(async (p, i) => {
            const status = await fileStatus(p.path, p.size)
            return (
              <tr>
                <td><b>{p.number}</b> {i === 0 && <span class="tag published">más reciente</span>}
                  {status !== 'ok' && <span class="tag failed">{status === 'missing' ? 'archivo faltante' : 'archivo dañado'}</span>}</td>
                <td class="num">{formatSize(p.size)}</td>
                <td>{formatDate(p.createdAt)}<div class="muted">por {p.createdBy}</div></td>
                <td class="muted">{p.notes.split('\n')[0].slice(0, 80)}</td>
                <td>
                  <form method="post" action={`/panel/components/packages/${p._id}/delete`} class="inline"
                    onsubmit={`return confirm('¿Eliminar el paquete ${p.number}?')`}>
                    <button class="danger">Eliminar</button>
                  </form>
                </td>
              </tr>
            )
          }))}
        </tbody>
      </table>

      <h2>Subir paquete</h2>
      <form class="grid box" method="post" action="/panel/components/new" enctype="multipart/form-data">
        <input type="hidden" name="component" value="syncService" />
        <label>Versión</label><input name="version" placeholder="1.0.0" required pattern="\d+(\.\d+){1,3}" />
        <label>Firma (Base64)</label><textarea name="signature" rows={3} required></textarea>
        <label>SHA-256 (opcional)</label><input name="sha256" />
        <label>Notas</label><textarea name="notes" rows={2}></textarea>
        <label>Zip</label><input type="file" name="package" accept=".zip" required />
        <span></span><div><button class="primary">Subir</button> <span class="muted">máx. {MAX_JAR_BYTES / 1048576} MB</span></div>
      </form>
    </Layout>,
  )
})

componentsPages.post('/new', async (c) => {
  try {
    const p = await registerComponentPackage(await receiveMultipart(c.env.incoming), c.get('username'))
    return redirectWith(c, '/panel/components', 'ok', `Paquete ${p.number} subido.`)
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof UploadError)) console.error('Error al subir paquete:', e)
    return redirectWith(c, '/panel/components', 'error', errorMessage(e))
  }
})

componentsPages.post('/packages/:id/delete', async (c) => {
  const id = toObjectId(c.req.param('id'))
  const p = id ? await componentPackages().findOne({ _id: id }) : null
  if (!p) return redirectWith(c, '/panel/components', 'error', 'Paquete no encontrado')
  const pinned = await clients().find({ 'syncService.packageId': p._id }, { projection: { clientId: 1 } }).toArray()
  if (pinned.length > 0) {
    return redirectWith(c, '/panel/components', 'error',
      `No se puede eliminar: lo tienen fijado ${pinned.map((x) => x.clientId).join(', ')}`)
  }
  await componentPackages().deleteOne({ _id: p._id })
  await deleteVersionFile(p.path)
  await audit(c.get('username'), 'component.delete', `${p.component} ${p.number}`)
  return redirectWith(c, '/panel/components', 'ok', `Paquete ${p.number} eliminado.`)
})

// ---------- Configuración por cliente ----------
componentsPages.get('/clients/:clientId', async (c) => {
  const clientId = c.req.param('clientId')
  const cl = await clients().findOne({ clientId })
  if (!cl) return redirectWith(c, '/panel/components', 'error', 'Cliente no encontrado')
  const s = syncSettings(cl)
  const packages = (await componentPackages().find({ component: 'syncService' }).toArray())
    .sort((a, b) => compareVersions(b.number, a.number))
  const target = await targetPackage(s)
  const history = await componentReports().find({ clientId }).sort({ createdAt: -1 }).limit(20).toArray()
  const base = `/panel/components/clients/${encodeURIComponent(clientId)}`
  // Comando para crear un usuario de Mongo limitado a la base de este cliente
  const mongoDb = s.env.UPK_MONGODB_DB || clientId
  const mongoUser = `upk_${clientId}`.replace(/[^A-Za-z0-9_-]/g, '_')
  const mongoPass = randomBytes(18).toString('base64url')
  const mongoUserScript = `use ${mongoDb}
db.createUser({
  user: "${mongoUser}",
  pwd: "${mongoPass}",
  roles: [{ role: "readWrite", db: "${mongoDb}" }]
})`
  return c.html(
    <Layout title={`Sincronización · ${clientId}`} username={c.get('username')} active="/panel/components" ok={query(c, 'ok')} error={query(c, 'error')}>
      <p><a href="/panel/components">← Sincronización</a></p>
      <h1>{clientId} <span class="muted">{cl.name}</span></h1>
      {!cl.active && <div class="msg err">El cliente está inactivo: su Launcher desinstalará el servicio.</div>}

      <form class="grid box" method="post" action={base}>
        <label>Servicio</label>
        <label style="padding-top:6px;color:inherit"><input type="checkbox" name="enabled" checked={s.enabled} /> Instalado y en ejecución
          <div class="muted">Desmarcar = el Launcher lo desinstala en su próximo inicio.</div></label>
        <label>Versión</label>
        <select name="packageId">
          <option value="">La más reciente{packages[0] ? ` (hoy ${packages[0].number})` : ''}</option>
          {packages.map((p) => <option value={String(p._id)} selected={!!s.packageId && s.packageId.equals(p._id!)}>{p.number}</option>)}
        </select>
        {SYNC_ENV_KEYS.map((key) => (
          <>
            <label>{ENV_LABEL[key][0]}</label>
            <div>
              <input name={key} value={s.env[key] ?? ''} placeholder={ENV_LABEL[key][1]} autocomplete="off" spellcheck={false}
                style="width:100%" {...(key === 'SYNC_CRON' ? { 'data-cron': '' } : {})} />
              {key === 'SYNC_CRON' && <div class="muted" data-cron-text></div>}
            </div>
          </>
        ))}
        <span></span>
        <div class="muted">La conexión a MariaDB la toma el servicio de las preferencias de la app en ese equipo.
          Estos valores se escriben en el <code>.env</code> del servicio y tienen prioridad sobre el registro.</div>
        <span></span><div><button class="primary">Guardar</button></div>
      </form>
      {s.enabled && !target && <div class="msg err">Activado, pero no hay paquetes subidos: no se instalará nada.</div>}
      {s.enabled && !s.env.UPK_MONGODB_URI && <div class="msg err">Falta la URI de MongoDB: el servicio usará la del registro o .env del equipo, si existe.</div>}

      <h2>Webhook</h2>
      <div class="box actions" style="justify-content:space-between">
        <div class="muted">Envía un POST de prueba (<code>event: "test"</code>) al webhook <b>guardado</b>, desde este servidor.</div>
        <form method="post" action={`${base}/webhook-test`}>
          <button disabled={!s.env.UPK_WEBHOOK_URL}>Probar webhook</button>
        </form>
      </div>

      <h2>Usuario de MongoDB para este cliente</h2>
      <p class="muted">Un usuario que solo puede leer y escribir la base <b>{mongoDb}</b>: si alguien saca la URI del equipo
        del cliente, no ve los datos de los demás. Ejecútelo en <code>mongosh</code> conectado como administrador y use ese
        usuario en la URI de arriba. La clave se genera al abrir esta página. En MongoDB Atlas: <i>Database Access → Add New
        Database User</i>, rol <code>readWrite</code> sobre <code>{mongoDb}</code>.</p>
      <pre class="box" style="user-select:all;white-space:pre-wrap">{mongoUserScript}</pre>
      <p class="muted">URI resultante (cambie <code>HOST</code> por el de su servidor de MongoDB):</p>
      <pre class="box" style="user-select:all;white-space:pre-wrap">{`mongodb://${mongoUser}:${mongoPass}@HOST/${mongoDb}?authSource=${mongoDb}`}</pre>

      <h2>Equipo vinculado</h2>
      <div class="box actions" style="justify-content:space-between">
        <div>{s.keyHash
          ? <span><b>{s.boundMachine ?? '¿?'}</b> <span class="muted">desde {formatDate(s.boundAt)}</span></span>
          : <span class="muted">Ninguno: se vinculará el primer Launcher en modo servidor que consulte.</span>}</div>
        {s.keyHash && (
          <form method="post" action={`${base}/unbind`} onsubmit="return confirm('El próximo Launcher en modo servidor que consulte quedará vinculado. ¿Continuar?')">
            <button class="danger">Reiniciar vínculo</button>
          </form>
        )}
      </div>
      <p class="muted">Reinicie el vínculo si reinstaló el equipo servidor o cambió de PC.</p>

      <h2>Estado de la sincronización</h2>
      <div class="box actions" style="justify-content:space-between">
        <div>{s.resetId
          ? <span><span class="tag mandatory">reinicio pendiente</span> <span class="muted">pedido {formatDate(s.resetRequestedAt)}.
              Se aplicará en el próximo inicio del sistema en el equipo servidor.</span></span>
          : <span class="muted">{s.resetDoneAt ? `Último reinicio aplicado: ${formatDate(s.resetDoneAt)}` : 'Sin reinicios.'}</span>}</div>
        {s.resetId
          ? (
            <form method="post" action={`${base}/reset/cancel`}>
              <button>Cancelar reinicio</button>
            </form>
          )
          : (
            <form method="post" action={`${base}/reset`}
              onsubmit="return confirm('En el próximo inicio se borrará sync_state.db y el servicio volverá a enviar todo el catálogo a MongoDB. ¿Continuar?')">
              <button class="danger">Reiniciar estado</button>
            </form>
          )}
      </div>
      <p class="muted">Borra <code>sync_state.db</code>, <code>-wal</code> y <code>-shm</code> en el equipo servidor: el servicio
        olvida lo que ya envió y vuelve a sincronizar todo. Úselo si MongoDB quedó desalineado o se vació.</p>

      <h2>Reportes del Launcher</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Equipo</th><th>Estado</th><th>Versión</th><th>Detalle</th></tr></thead>
        <tbody>
          {history.length === 0 && <tr><td colspan={5} class="muted">Sin reportes.</td></tr>}
          {history.map((r) => (
            <tr>
              <td>{formatDate(r.createdAt)}</td><td>{r.machine}</td><td><StateTag state={r.state} /></td>
              <td>{r.version}</td><td class="muted"><pre>{r.detail}</pre></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>,
  )
})

componentsPages.post('/clients/:clientId', async (c) => {
  const clientId = c.req.param('clientId')
  const base = `/panel/components/clients/${encodeURIComponent(clientId)}`
  const cl = await clients().findOne({ clientId })
  if (!cl) return redirectWith(c, '/panel/components', 'error', 'Cliente no encontrado')
  const form = await c.req.parseBody()
  let packageId: ObjectId | null = null
  if (form.packageId) {
    packageId = toObjectId(String(form.packageId))
    if (!packageId || !(await componentPackages().findOne({ _id: packageId }))) {
      return redirectWith(c, base, 'error', 'Paquete no encontrado')
    }
  }
  const s = syncSettings(cl)
  const enabled = form.enabled === 'on'
  const env = cleanSyncEnv(form as Record<string, unknown>)
  await clients().updateOne({ clientId }, { $set: { syncService: { ...s, enabled, packageId, env } } })
  // La auditoría nunca guarda la URI (lleva credenciales)
  await audit(c.get('username'), 'component.configure',
    `${clientId}: ${enabled ? 'activado' : 'desactivado'}, versión ${packageId ? String(packageId) : 'más reciente'}`)
  return redirectWith(c, base, 'ok', enabled
    ? 'Guardado. El Launcher del equipo servidor lo instalará o actualizará en su próximo inicio.'
    : 'Guardado. El Launcher del equipo servidor lo desinstalará en su próximo inicio.')
})

/** Prueba del webhook guardado: mismo formato que envía el servicio, con event "test". */
componentsPages.post('/clients/:clientId/webhook-test', async (c) => {
  const clientId = c.req.param('clientId')
  const base = `/panel/components/clients/${encodeURIComponent(clientId)}`
  const cl = await clients().findOne({ clientId })
  if (!cl) return redirectWith(c, '/panel/components', 'error', 'Cliente no encontrado')
  const s = syncSettings(cl)
  const url = s.env.UPK_WEBHOOK_URL
  if (!url) return redirectWith(c, base, 'error', 'No hay webhook guardado')
  if (!/^https?:\/\//i.test(url)) return redirectWith(c, base, 'error', 'El webhook debe empezar con http:// o https://')
  const started = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'UPK-Server/webhook-test' },
      body: JSON.stringify({
        event: 'test',
        timestamp: new Date().toISOString(),
        database: s.env.UPK_MONGODB_DB ?? '',
        clientId,
        summary: 'Prueba enviada desde el panel de UPK Server',
        changes: {
          categories: { upserts: 0, deletes: 0 }, products: { upserts: 0, deletes: 0 },
          productsKg: { upserts: 0, deletes: 0 }, repairedCategories: 0, totalUpserts: 0, totalDeletes: 0,
        },
        elapsedMs: 0,
      }),
      signal: AbortSignal.timeout(10000),
    })
    const body = (await res.text()).slice(0, 200)
    await audit(c.get('username'), 'component.webhook.test', `${clientId}: HTTP ${res.status}`)
    return redirectWith(c, base, res.ok ? 'ok' : 'error',
      `Webhook respondió HTTP ${res.status} en ${Date.now() - started} ms${body ? `: ${body}` : ''}`)
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'TimeoutError' ? 'sin respuesta en 10 s' : e.message) : String(e)
    return redirectWith(c, base, 'error', `No se pudo contactar el webhook: ${msg}`)
  }
})

componentsPages.post('/clients/:clientId/reset', async (c) => {
  const clientId = c.req.param('clientId')
  const base = `/panel/components/clients/${encodeURIComponent(clientId)}`
  const cl = await clients().findOne({ clientId })
  if (!cl) return redirectWith(c, '/panel/components', 'error', 'Cliente no encontrado')
  // Se guarda el objeto completo: el cliente puede no tener syncService todavía
  const s = syncSettings(cl)
  await clients().updateOne({ clientId },
    { $set: { syncService: { ...s, resetId: randomBytes(8).toString('hex'), resetRequestedAt: new Date() } } })
  await audit(c.get('username'), 'component.reset', clientId)
  return redirectWith(c, base, 'ok', s.enabled
    ? 'Reinicio pedido. Se aplicará en el próximo inicio del sistema en el equipo servidor.'
    : 'Reinicio pedido, pero el servicio está desactivado: se aplicará cuando lo active.')
})

componentsPages.post('/clients/:clientId/reset/cancel', async (c) => {
  const clientId = c.req.param('clientId')
  const base = `/panel/components/clients/${encodeURIComponent(clientId)}`
  const result = await clients().updateOne({ clientId }, { $set: { 'syncService.resetId': null, 'syncService.resetRequestedAt': null } })
  if (!result.matchedCount) return redirectWith(c, '/panel/components', 'error', 'Cliente no encontrado')
  await audit(c.get('username'), 'component.reset.cancel', clientId)
  return redirectWith(c, base, 'ok', 'Reinicio cancelado.')
})

componentsPages.post('/clients/:clientId/unbind', async (c) => {
  const clientId = c.req.param('clientId')
  const base = `/panel/components/clients/${encodeURIComponent(clientId)}`
  const result = await clients().updateOne({ clientId },
    { $set: { 'syncService.keyHash': null, 'syncService.boundMachine': null, 'syncService.boundAt': null } })
  if (!result.matchedCount) return redirectWith(c, '/panel/components', 'error', 'Cliente no encontrado')
  await audit(c.get('username'), 'component.unbind', clientId)
  return redirectWith(c, base, 'ok', 'Vínculo reiniciado.')
})
