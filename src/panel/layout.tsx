import type { Child } from 'hono/jsx'
import { config } from '../lib/config.js'
import type { Client } from '../lib/db.js'
import type { ClientVersionKind } from '../lib/releases.js'

export const STYLESHEET = `
:root{--fg:#1f2328;--mut:#656d76;--bd:#d0d7de;--bg:#f6f8fa;--pri:#0969da;--ok:#1a7f37;--err:#cf222e;--warn:#9a6700;--glb:#8250df}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg);background:#fff}
header{display:flex;gap:18px;align-items:center;padding:10px 20px;border-bottom:1px solid var(--bd);background:var(--bg);flex-wrap:wrap}
header b{font-size:15px}header nav{display:flex;gap:14px;flex:1;flex-wrap:wrap}header a{color:var(--fg);text-decoration:none}
header a.active{font-weight:600;color:var(--pri)}main{padding:20px;max-width:1200px}
h1{font-size:20px;margin:0 0 14px}h2{font-size:16px;margin:24px 0 10px}a{color:var(--pri)}
table{border-collapse:collapse;width:100%;margin-bottom:12px}th,td{border-bottom:1px solid var(--bd);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--bg);font-weight:600;white-space:nowrap}td.num{text-align:right;white-space:nowrap}
input,select,textarea,button{font:inherit;padding:5px 8px;border:1px solid var(--bd);border-radius:6px}
textarea{width:100%}button{background:#fff;cursor:pointer}button.primary{background:var(--pri);color:#fff;border-color:var(--pri)}
button.danger{color:var(--err)}form.inline{display:inline}form.grid{display:grid;grid-template-columns:170px 1fr;gap:8px 12px;max-width:900px;align-items:start}
form.grid>label{padding-top:6px;color:var(--mut)}.msg{padding:8px 12px;border-radius:6px;margin-bottom:14px}
.msg.ok{background:#dafbe1;color:var(--ok)}.msg.err{background:#ffebe9;color:var(--err)}
.tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;border:1px solid var(--bd);margin:1px 2px 1px 0}
.tag.published,.tag.updated{background:#dafbe1;color:var(--ok);border-color:#aceebb}
.tag.draft,.tag.postponed,.tag.skipped,.tag.unknown{background:var(--bg);color:var(--mut)}
.tag.retired,.tag.failed,.tag.reverted,.tag.inactive{background:#ffebe9;color:var(--err);border-color:#ffcecb}
.tag.mandatory,.tag.cancelled,.tag.custom{background:#fff8c5;color:var(--warn);border-color:#f2e085}
.tag.running{background:#dafbe1;color:var(--ok);border-color:#aceebb}.tag.stopped,.tag.uninstalled{background:var(--bg);color:var(--mut)}
.tag.global{background:#fbefff;color:var(--glb);border-color:#e6d2fb}
.muted{color:var(--mut)}code{background:var(--bg);padding:1px 5px;border-radius:4px}pre{white-space:pre-wrap;margin:0}
.actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.box{border:1px solid var(--bd);border-radius:8px;padding:14px;background:var(--bg)}
.picker{border:1px solid var(--bd);border-radius:8px;background:#fff;max-height:340px;overflow:auto}.picker table{margin:0}
.picker tr:hover{background:var(--bg)}.picker label{display:block;cursor:pointer}
`

const MENU: [string, string][] = [
  ['/panel/versions', 'Versiones'],
  ['/panel/global', 'Historial global'],
  ['/panel/clients', 'Clientes'],
  ['/panel/components', 'Sincronización'],
  ['/panel/reports', 'Reportes'],
  ['/panel/audit', 'Auditoría'],
  ['/panel/tokens', 'Tokens'],
  ['/panel/account', 'Cuenta'],
]

export function Layout(props: {
  title: string
  username?: string
  active?: string
  ok?: string
  error?: string
  children?: Child
}) {
  return (
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{props.title} · UPK Server</title>
        <link rel="stylesheet" href="/panel/style.css" />
        <script src="/panel/panel.js" defer></script>
      </head>
      <body>
        {props.username && (
          <header>
            <b>UPK Server</b>
            <nav>
              {MENU.map(([href, label]) => (
                <a href={href} class={props.active === href ? 'active' : ''}>{label}</a>
              ))}
            </nav>
            <span class="muted">{props.username}</span>
            <form class="inline" method="post" action="/panel/logout"><button>Salir</button></form>
          </header>
        )}
        <main>
          {props.ok && <div class="msg ok">{props.ok}</div>}
          {props.error && <div class="msg err">{props.error}</div>}
          {props.children}
        </main>
      </body>
    </html>
  )
}

const KIND_LABEL: Record<ClientVersionKind, string> = { global: 'global', custom: 'personalizada', unknown: 'sin registrar' }

export function KindTag(props: { kind: ClientVersionKind }) {
  return <span class={`tag ${props.kind}`}>{KIND_LABEL[props.kind]}</span>
}

/**
 * Lista de clientes con casillas para elegir a quién se asigna una versión. Muestra la versión
 * que tiene cada uno y si es global o personalizada, para no pisar versiones específicas por error.
 * Por defecto no hay nada marcado.
 */
export function ClientPicker(props: { clients: Client[]; kinds: Map<string, ClientVersionKind>; selected: string[] }) {
  return (
    <div data-picker>
      <div class="actions" style="margin-bottom:6px">
        <button type="button" data-select="global">Marcar los que están en versión global</button>
        <button type="button" data-select="all">Marcar todos</button>
        <button type="button" data-select="none">Desmarcar todos</button>
        <span class="muted" data-count></span>
      </div>
      <div class="picker">
        <table>
          <thead><tr><th></th><th>Cliente</th><th>Nombre</th><th>Versión actual</th><th>Tipo</th></tr></thead>
          <tbody>
            {props.clients.length === 0 && (
              <tr><td colspan={5} class="muted">No hay clientes. Se registran solos al consultar su Launcher, o agréguelos en Clientes.</td></tr>
            )}
            {props.clients.map((c) => {
              const kind = props.kinds.get(c.clientId) ?? 'unknown'
              return (
                <tr>
                  <td><input type="checkbox" name="clientIds" value={c.clientId} id={`cl-${c.clientId}`}
                    data-kind={kind} checked={props.selected.includes(c.clientId)} /></td>
                  <td><label for={`cl-${c.clientId}`}><b>{c.clientId}</b></label></td>
                  <td>{c.name}{!c.active && <span class="tag inactive">inactivo</span>}</td>
                  <td>{c.lastVersion ?? '—'}</td>
                  <td><KindTag kind={kind} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * JS mínimo del panel: botones de selección de clientes y confirmación antes de publicar
 * listando exactamente qué clientes recibirán la versión.
 */
export const PANEL_SCRIPT = `
document.querySelectorAll('[data-picker]').forEach(function (picker) {
  var boxes = picker.querySelectorAll('input[name=clientIds]');
  var count = picker.querySelector('[data-count]');
  function refresh() {
    var n = 0; boxes.forEach(function (b) { if (b.checked) n++; });
    count.textContent = n + ' seleccionado(s)';
  }
  picker.querySelectorAll('[data-select]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.getAttribute('data-select');
      boxes.forEach(function (b) { b.checked = mode === 'all' || (mode === 'global' && b.getAttribute('data-kind') === 'global'); });
      refresh();
    });
  });
  boxes.forEach(function (b) { b.addEventListener('change', refresh); });
  refresh();
});
// Texto legible de la expresión cron del servicio de sincronización (casos comunes)
function cronText(v) {
  v = v.trim();
  if (!v) return 'Vacío: cada 5 minutos (valor por defecto del servicio)';
  var p = v.split(/\\s+/);
  if (p.length !== 5) return 'No válida: deben ser 5 campos (minuto hora día mes día-semana)';
  var m = p[0], h = p[1], num = /^\\d+$/, rango = /^(\\d+)-(\\d+)$/;
  function cada(x) { var r = /^\\*\\/(\\d+)$/.exec(x); return r ? +r[1] : (x === '*' ? 1 : null); }
  function hh(x) { return ('0' + x).slice(-2); }
  function min(n) { return n === 1 ? 'Cada minuto' : 'Cada ' + n + ' minutos'; }
  if (p.slice(2).join(' ') !== '* * *') return 'Personalizada (limita día, mes o día de la semana): ' + v;
  if (cada(m) && h === '*') return min(cada(m));
  if (cada(m) && rango.test(h)) { var r = rango.exec(h); return min(cada(m)) + ', de ' + hh(r[1]) + ':00 a ' + hh(r[2]) + ':59'; }
  if (num.test(m) && h === '*') return 'Cada hora, en el minuto ' + m;
  if (num.test(m) && cada(h)) return 'Cada ' + cada(h) + ' horas, en el minuto ' + m;
  if (num.test(m) && num.test(h)) return 'Todos los días a las ' + hh(h) + ':' + hh(m);
  return 'Personalizada: ' + v;
}
document.querySelectorAll('input[data-cron]').forEach(function (input) {
  var out = input.parentNode.querySelector('[data-cron-text]');
  function refresh() { out.textContent = cronText(input.value); }
  input.addEventListener('input', refresh);
  refresh();
});
document.querySelectorAll('form[data-confirm-clients]').forEach(function (form) {
  form.addEventListener('submit', function (e) {
    var publish = form.querySelector('[name=publish]');
    var willPublish = form.hasAttribute('data-published') || (publish && publish.checked);
    if (!willPublish) return;
    var ids = [];
    form.querySelectorAll('input[name=clientIds]:checked').forEach(function (b) { ids.push(b.value); });
    var custom = [];
    form.querySelectorAll('input[name=clientIds]:checked[data-kind=custom]').forEach(function (b) { custom.push(b.value); });
    var msg = 'Esta versión quedará disponible SOLO para ' + ids.length + ' cliente(s):\\n\\n' + ids.join(', ');
    if (custom.length) msg += '\\n\\nATENCIÓN: tienen hoy una versión personalizada: ' + custom.join(', ');
    if (!confirm(msg + '\\n\\n¿Continuar?')) e.preventDefault();
  });
});
`

export function formatDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-PE', { timeZone: config.timeZone, dateStyle: 'short', timeStyle: 'short' })
}

export function formatSize(bytes: number): string {
  return (bytes / 1048576).toFixed(1) + ' MB'
}
