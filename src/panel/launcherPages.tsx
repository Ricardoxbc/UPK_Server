import { Hono, type Context } from 'hono'
import { audit, clientMachines, launcherLinks, launcherReleases, reports } from '../lib/db.js'
import {
  createLauncherLink, currentLauncher, DOWNLOAD_URL_MINUTES, launcherSettings, LINK_MAX_DOWNLOADS, LINK_MINUTES,
  registerLauncherRelease, setDistribution,
} from '../lib/launcher.js'
import { ValidationError } from '../lib/releases.js'
import { fileStatus, MAX_JAR_BYTES, receiveMultipart, UploadError } from '../lib/storage.js'
import { compareVersions } from '../lib/version.js'
import { publicBaseUrl } from '../routes/public.js'
import { Layout, formatDate, formatSize } from './layout.js'
import { errorMessage, query, redirectWith, toObjectId, type PanelEnv } from './helpers.js'

export const launcherPages = new Hono<PanelEnv>()

const RESULT_LABEL: Record<string, string> = {
  updated: 'actualizado', failed: 'fallido', reverted: 'revertido', cancelled: 'cancelado',
  skipped: 'omitido', postponed: 'pospuesto',
}
const MACHINE_DAYS = 30

async function launcherPage(c: Context<PanelEnv>, createdLink?: { url: string; expiresAt: Date; maxDownloads: number }) {
  const [current, s, history, links, launcherReports] = await Promise.all([
    currentLauncher(),
    launcherSettings(),
    launcherReleases().find().sort({ createdAt: -1 }).limit(50).toArray(),
    launcherLinks().find({ expiresAt: { $gt: new Date() }, revoked: false }).sort({ createdAt: -1 }).toArray(),
    reports().find({ component: 'launcher' }).sort({ createdAt: -1 }).limit(100).toArray(),
  ])
  const since = new Date(Date.now() - MACHINE_DAYS * 24 * 3600 * 1000)
  const machines = (await clientMachines().find({ lastSeenAt: { $gte: since } }).toArray())
    .sort((a, b) => compareVersions(a.launcherVersion, b.launcherVersion) || a.clientId.localeCompare(b.clientId))
  const upToDate = current ? machines.filter((m) => m.launcherVersion === current.number).length : 0
  const legacy = machines.filter((m) => !m.launcherVersion).length
  const status = current?.path ? await fileStatus(current.path, current.size) : 'ok'

  return c.html(
    <Layout title="Launcher" username={c.get('username')} active="/panel/launcher" ok={query(c, 'ok')} error={query(c, 'error')}>
      <h1>Launcher</h1>
      <p class="muted">Versión del propio <code>Launcher.jar</code>. Hay una sola versión actual y se entrega a <b>todos los
        clientes activos</b>: cada Launcher la descarga en segundo plano, la verifica (SHA-256 + firma), la instala al
        cerrarse con una autoprueba y, si falla, vuelve solo a la anterior. Los Launcher antiguos (sin versión informada)
        no saben autoactualizarse: instálelos a mano con un enlace temporal.</p>

      <div class="stats">
        <div class="stat"><b>{current ? current.number : '—'}</b><span>Versión actual</span></div>
        <div class="stat"><b>{s.distribution ? 'Activa' : 'En pausa'}</b><span>Distribución</span></div>
        <div class="stat"><b>{upToDate} / {machines.length}</b><span>Equipos al día (últimos {MACHINE_DAYS} días)</span></div>
        <div class="stat"><b>{legacy}</b><span>Equipos con Launcher antiguo</span></div>
      </div>

      {current && status !== 'ok' && (
        <div class="msg err">El archivo del Launcher {current.number} {status === 'missing' ? 'no está' : 'está dañado'} en el
          disco del servidor. Vuelva a subirlo con un número mayor.</div>
      )}
      {!s.distribution && (
        <div class="msg warn">Distribución en pausa: ningún Launcher recibe la versión actual. Los enlaces temporales siguen funcionando.</div>
      )}

      <div class="box">
        <div class="actions" style="justify-content:space-between">
          <div>
            {current
              ? <><b>Launcher {current.number}</b> <span class="tag current">actual</span>
                <div class="muted">{formatSize(current.size)} · subido {formatDate(current.createdAt)} por {current.createdBy}</div>
                <div class="muted">SHA-256 <code>{current.sha256}</code></div>
                {current.notes && <pre class="muted" style="margin-top:6px">{current.notes}</pre>}</>
              : <span class="muted">Todavía no se subió ninguna versión del Launcher.</span>}
          </div>
          <form method="post" action="/panel/launcher/distribution"
            onsubmit={s.distribution
              ? "return confirm('¿Pausar la distribución? Ningún Launcher se actualizará hasta reactivarla.')"
              : "return confirm('¿Reactivar la distribución? Todos los Launcher con una versión menor se actualizarán.')"}>
            <input type="hidden" name="enabled" value={s.distribution ? '0' : '1'} />
            <button class={s.distribution ? 'danger' : 'primary'}>{s.distribution ? 'Pausar distribución' : 'Reactivar distribución'}</button>
          </form>
        </div>
      </div>

      <h2>Enlace público temporal</h2>
      <p class="muted">Para descargar el Launcher actual en un equipo sin autoactualización (primera instalación o Launcher
        antiguo). El enlace se muestra una sola vez; se puede revocar.</p>
      {createdLink && (
        <div class="box" style="margin-bottom:14px">
          <b>Enlace creado.</b> Vence {formatDate(createdLink.expiresAt)} · {createdLink.maxDownloads} descarga(s). Cópielo ahora:
          <div class="copy" style="margin-top:8px">
            <input id="new-link" readonly value={createdLink.url} />
            <button type="button" class="primary" data-copy="#new-link">Copiar</button>
          </div>
        </div>
      )}
      <form method="post" action="/panel/launcher/links" class="box actions">
        <label>Duración <select name="minutes">{LINK_MINUTES.map((m) => <option value={m} selected={m === 15}>{m} minutos</option>)}</select></label>
        <label>Descargas <select name="maxDownloads">{LINK_MAX_DOWNLOADS.map((n) => <option value={n}>{n}</option>)}</select></label>
        <input name="note" placeholder="Nota (ej.: PC caja de Ferretería X)" maxlength={100} size={34} />
        <button class="primary" disabled={!current}>Generar enlace</button>
      </form>
      {links.length > 0 && (
        <table style="margin-top:12px">
          <thead><tr><th>Creado</th><th>Versión</th><th>Vence</th><th>Descargas</th><th>Nota</th><th></th></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr>
                <td>{formatDate(l.createdAt)} <span class="muted">por {l.createdBy}</span></td>
                <td>{l.releaseNumber}</td>
                <td>{formatDate(l.expiresAt)}</td>
                <td class="num">{l.downloads} / {l.maxDownloads}</td>
                <td class="muted">{l.note}</td>
                <td><form class="inline" method="post" action={`/panel/launcher/links/${l._id}/revoke`}><button class="danger">Revocar</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Subir nueva versión</h2>
      <p class="muted">Lo normal es <code>Firmador publicar-launcher</code>. Desde aquí: firme con
        <code>java -cp Launcher.jar com.upksoft.launcher.tools.Firmador firmar Launcher.jar private_key.b64</code>.
        El servidor rechaza el jar si la versión no es mayor que la actual, si su manifest dice otra versión, si trae otra
        clave pública o si tiene clases para un Java mayor que 8.</p>
      <form class="grid box" method="post" action="/panel/launcher/new" enctype="multipart/form-data"
        onsubmit="return confirm('Esta versión se instalará en TODOS los equipos con un Launcher menor. ¿Continuar?')">
        <label>Versión</label><input name="version" placeholder="1.3.0" required pattern="\d+(\.\d+){1,3}" />
        <label>Firma (Base64)</label><textarea name="signature" rows={3} required></textarea>
        <label>SHA-256 (opcional)</label><input name="sha256" placeholder="si lo pega, se compara con el del archivo" />
        <label>Notas</label><textarea name="notes" rows={3} placeholder="Cambios de esta versión (solo para el historial)"></textarea>
        <label>Launcher.jar</label><input type="file" name="jar" accept=".jar" required />
        <span></span><div><button class="primary">Subir y distribuir</button> <span class="muted">máx. {MAX_JAR_BYTES / 1048576} MB</span></div>
      </form>

      <h2>Historial de versiones</h2>
      <table>
        <thead><tr><th>Versión</th><th>Estado</th><th>Tamaño</th><th>Subida</th><th>Reemplazada</th><th>Notas</th></tr></thead>
        <tbody>
          {history.length === 0 && <tr><td colspan={6} class="muted">Sin versiones.</td></tr>}
          {history.map((r) => (
            <tr>
              <td><b>{r.number}</b></td>
              <td>{r.state === 'current' ? <span class="tag current">actual</span> : <span class="tag">anterior</span>}
                {!r.path && <span class="tag" title="Se conservan los archivos de las 3 anteriores">sin archivo</span>}</td>
              <td class="num">{formatSize(r.size)}</td>
              <td>{formatDate(r.createdAt)}<div class="muted">por {r.createdBy}</div></td>
              <td>{formatDate(r.archivedAt)}</td>
              <td class="muted">{r.notes.split('\n')[0].slice(0, 80)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Equipos (últimos {MACHINE_DAYS} días)</h2>
      <table>
        <thead><tr><th>Cliente</th><th>Equipo</th><th>Modo</th><th>Launcher</th><th>App</th><th>Último inicio</th></tr></thead>
        <tbody>
          {machines.length === 0 && <tr><td colspan={6} class="muted">Ningún equipo informó en este periodo.</td></tr>}
          {machines.map((m) => (
            <tr>
              <td><a href={`/panel/clients/${encodeURIComponent(m.clientId)}/machines`}>{m.clientId}</a></td>
              <td>{m.machine || <span class="muted">?</span>}</td>
              <td class="muted">{m.mode}</td>
              <td>{!m.launcherVersion
                ? <span class="tag mandatory">antiguo</span>
                : <>{m.launcherVersion} {current && m.launcherVersion === current.number && <span class="tag ok">al día</span>}</>}</td>
              <td>{m.lastVersion}</td>
              <td>{formatDate(m.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Reportes de autoactualización</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Equipo</th><th>Versión</th><th>Resultado</th><th>Detalle</th></tr></thead>
        <tbody>
          {launcherReports.length === 0 && <tr><td colspan={6} class="muted">Sin reportes.</td></tr>}
          {launcherReports.map((r) => (
            <tr>
              <td>{formatDate(r.createdAt)}</td><td>{r.clientId}</td><td>{r.machine}</td>
              <td>{r.fromVersion} → {r.toVersion}</td>
              <td><span class={`tag ${r.result}`}>{RESULT_LABEL[r.result] ?? r.result}</span></td>
              <td class="muted">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted">Cada Launcher recibe una URL de descarga firmada que vence a los {DOWNLOAD_URL_MINUTES} minutos.</p>
    </Layout>,
  )
}

launcherPages.get('/', (c) => launcherPage(c))

launcherPages.post('/new', async (c) => {
  try {
    const r = await registerLauncherRelease(await receiveMultipart(c.env.incoming), c.get('username'))
    return redirectWith(c, '/panel/launcher', 'ok', `Launcher ${r.number} subido: es la versión actual.`)
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof UploadError)) console.error('Error al subir el Launcher:', e)
    return redirectWith(c, '/panel/launcher', 'error', errorMessage(e))
  }
})

launcherPages.post('/distribution', async (c) => {
  const enabled = String((await c.req.parseBody()).enabled) === '1'
  await setDistribution(enabled, c.get('username'))
  return redirectWith(c, '/panel/launcher', 'ok', enabled ? 'Distribución reactivada.' : 'Distribución en pausa.')
})

launcherPages.post('/links', async (c) => {
  const form = await c.req.parseBody()
  try {
    const maxDownloads = Number(form.maxDownloads)
    const { token, expiresAt } = await createLauncherLink(Number(form.minutes), maxDownloads,
      String(form.note ?? '').trim(), c.get('username'))
    return launcherPage(c, { url: `${publicBaseUrl(c)}/api/v1/launcher/link/${token}`, expiresAt, maxDownloads })
  } catch (e) {
    return redirectWith(c, '/panel/launcher', 'error', errorMessage(e))
  }
})

launcherPages.post('/links/:id/revoke', async (c) => {
  const id = toObjectId(c.req.param('id'))
  const link = id ? await launcherLinks().findOneAndUpdate({ _id: id }, { $set: { revoked: true } }) : null
  if (!link) return redirectWith(c, '/panel/launcher', 'error', 'Enlace no encontrado')
  await audit(c.get('username'), 'launcher.link.revoke', `${link.releaseNumber}${link.note ? ` — ${link.note}` : ''}`)
  return redirectWith(c, '/panel/launcher', 'ok', 'Enlace revocado.')
})
