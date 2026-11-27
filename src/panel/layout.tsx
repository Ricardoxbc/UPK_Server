import type { Child } from 'hono/jsx'
import { config } from '../lib/config.js'
import type { Client } from '../lib/db.js'
import type { ClientVersionKind } from '../lib/releases.js'

export const STYLESHEET = `
:root{color-scheme:light;--bg:#f4f6fb;--surface:#fff;--surface2:#f8fafc;--fg:#1e2430;--mut:#667085;--bd:#e3e7ee;--bd2:#d0d5dd;
--pri:#3b5bdb;--pri-h:#3149c0;--pri-soft:#edf1ff;--ok:#15803d;--ok-soft:#e8f7ee;--err:#c0262d;--err-soft:#fdecec;
--warn:#a15c07;--warn-soft:#fff6e0;--glb:#7c3aed;--glb-soft:#f3edff;--side:#151b2c;--side-fg:#c7cee0;--side-act:#2a3350;
--shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08);--radius:10px}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0f131c;--surface:#171c28;--surface2:#1d2331;--fg:#e4e7ee;--mut:#98a1b3;
--bd:#2a3142;--bd2:#384055;--pri:#7c95ff;--pri-h:#93a8ff;--pri-soft:#232c4a;--ok:#4ade80;--ok-soft:#143021;--err:#f87171;--err-soft:#3a1a1c;
--warn:#fbbf24;--warn-soft:#3a2c10;--glb:#c4a5ff;--glb-soft:#2d2245;--side:#0b0e15;--side-fg:#aab3c7;--side-act:#1f2740;
--shadow:0 1px 2px rgba(0,0,0,.4)}}
*{box-sizing:border-box}html,body{margin:0}
body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--fg);background:var(--bg)}
a{color:var(--pri);text-decoration:none}a:hover{text-decoration:underline}
.shell{display:flex;min-height:100vh}
aside.side{width:228px;flex:none;background:var(--side);color:var(--side-fg);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;padding:18px 18px 14px;color:#fff;font-weight:650;font-size:15px}
.brand i{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#5b7cfa,#8b5cf6);display:grid;place-items:center;font-style:normal;font-size:13px}
aside nav{flex:1;overflow:auto;padding:4px 10px}
aside nav .group{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.55;padding:14px 10px 6px}
aside nav a{display:block;color:var(--side-fg);padding:7px 10px;border-radius:7px;margin:1px 0}
aside nav a:hover{background:var(--side-act);text-decoration:none;color:#fff}
aside nav a.active{background:var(--side-act);color:#fff;box-shadow:inset 3px 0 0 #6d8bff}
.side-foot{padding:12px 16px;border-top:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;gap:8px}
.side-foot span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-foot button{background:transparent;color:var(--side-fg);border-color:rgba(255,255,255,.18)}
.content{flex:1;min-width:0}
main{padding:26px 32px 48px;max-width:1240px}
main.center{max-width:none;min-height:100vh;display:grid;place-items:center;padding:16px}
h1{font-size:22px;font-weight:650;margin:0 0 16px;letter-spacing:-.01em}h2{font-size:16px;font-weight:620;margin:28px 0 10px}
p{margin:0 0 12px}
table{border-collapse:separate;border-spacing:0;width:100%;margin-bottom:14px;background:var(--surface);border:1px solid var(--bd);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
th,td{border-bottom:1px solid var(--bd);padding:9px 12px;text-align:left;vertical-align:top}
tbody tr:last-child td{border-bottom:0}tbody tr:hover td{background:var(--surface2)}
th{background:var(--surface2);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);white-space:nowrap}
td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
input,select,textarea,button{font:inherit;color:inherit;padding:7px 10px;border:1px solid var(--bd2);border-radius:8px;background:var(--surface)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--pri-soft);border-color:var(--pri)}
input[type=checkbox],input[type=radio]{padding:0;width:15px;height:15px;vertical-align:-2px;accent-color:var(--pri)}
input[type=file]{padding:6px;background:var(--surface2)}
textarea{width:100%;resize:vertical}
button{cursor:pointer;font-weight:550;transition:background .15s,border-color .15s}button:hover{border-color:var(--mut)}
button.primary{background:var(--pri);color:#fff;border-color:var(--pri)}button.primary:hover{background:var(--pri-h)}
button.danger{color:var(--err);border-color:color-mix(in srgb,var(--err) 40%,var(--bd2))}button.danger:hover{background:var(--err-soft)}
button:disabled,button[aria-busy=true]{opacity:.6;cursor:progress}
form.inline{display:inline}
form.grid{display:grid;grid-template-columns:180px 1fr;gap:12px 16px;max-width:920px;align-items:start}
form.grid>label{padding-top:8px;color:var(--mut);font-weight:550}
.msg{padding:10px 14px;border-radius:8px;margin-bottom:16px;border:1px solid transparent}
.msg.ok{background:var(--ok-soft);color:var(--ok);border-color:color-mix(in srgb,var(--ok) 25%,transparent)}
.msg.err{background:var(--err-soft);color:var(--err);border-color:color-mix(in srgb,var(--err) 25%,transparent)}
.msg.warn{background:var(--warn-soft);color:var(--warn);border-color:color-mix(in srgb,var(--warn) 25%,transparent)}
.tag{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:550;border:1px solid var(--bd);background:var(--surface2);color:var(--mut);margin:1px 3px 1px 0;white-space:nowrap}
.tag.published,.tag.updated,.tag.running,.tag.current,.tag.ok{background:var(--ok-soft);color:var(--ok);border-color:transparent}
.tag.retired,.tag.failed,.tag.reverted,.tag.inactive,.tag.expired{background:var(--err-soft);color:var(--err);border-color:transparent}
.tag.mandatory,.tag.cancelled,.tag.custom,.tag.paused{background:var(--warn-soft);color:var(--warn);border-color:transparent}
.tag.global{background:var(--glb-soft);color:var(--glb);border-color:transparent}
.muted{color:var(--mut)}code{background:var(--surface2);border:1px solid var(--bd);padding:1px 6px;border-radius:5px;font-size:12.5px;word-break:break-all}
pre{white-space:pre-wrap;margin:0}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.box{border:1px solid var(--bd);border-radius:var(--radius);padding:18px;background:var(--surface);box-shadow:var(--shadow)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px}
.stat{background:var(--surface);border:1px solid var(--bd);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow)}
.stat b{display:block;font-size:20px;font-weight:650}.stat span{color:var(--mut);font-size:12.5px}
.picker{border:1px solid var(--bd);border-radius:var(--radius);background:var(--surface);max-height:340px;overflow:auto}
.picker table{margin:0;border:0;box-shadow:none;border-radius:0}.picker label{display:block;cursor:pointer}
.upload-progress{grid-column:1/-1;border:1px solid var(--bd);border-radius:8px;padding:12px 14px;background:var(--surface2)}
.upload-progress .bar{height:8px;border-radius:99px;background:var(--bd);overflow:hidden;margin-top:8px}
.upload-progress .bar i{display:block;height:100%;width:0;background:var(--pri);transition:width .2s}
.upload-progress.indeterminate .bar i{width:35%;animation:slide 1.1s infinite ease-in-out}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
.copy{display:flex;gap:8px}.copy input{flex:1;font-family:ui-monospace,Consolas,monospace;font-size:12.5px}
@media (max-width:860px){
.shell{flex-direction:column}
aside.side{width:auto;height:auto;position:static}
.brand{padding:12px 16px}
aside nav{display:flex;overflow-x:auto;padding:0 10px 8px;gap:2px}
aside nav .group{display:none}aside nav a{white-space:nowrap}
aside nav a.active{box-shadow:inset 0 -2px 0 #6d8bff}
.side-foot{display:none}
main{padding:18px 16px 40px}
form.grid{grid-template-columns:1fr}form.grid>label{padding-top:0}
table{display:block;overflow-x:auto}
}
`

const MENU: { group: string; items: [string, string][] }[] = [
  { group: 'Distribución', items: [['/panel/versions', 'Versiones'], ['/panel/global', 'Historial global'], ['/panel/launcher', 'Launcher']] },
  { group: 'Clientes', items: [['/panel/clients', 'Clientes'], ['/panel/components', 'Sincronización']] },
  { group: 'Registro', items: [['/panel/reports', 'Reportes'], ['/panel/audit', 'Auditoría']] },
  { group: 'Ajustes', items: [['/panel/tokens', 'Tokens'], ['/panel/account', 'Cuenta']] },
]

export function Layout(props: {
  title: string
  username?: string
  active?: string
  ok?: string
  error?: string
  children?: Child
}) {
  const body = (
    <>
      {props.ok && <div class="msg ok">{props.ok}</div>}
      {props.error && <div class="msg err">{props.error}</div>}
      {props.children}
    </>
  )
  return (
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{props.title} · UPK Server</title>
        <link rel="stylesheet" href="/panel/style.css?v=2" />
        <script src="/panel/panel.js?v=2" defer></script>
      </head>
      <body>
        {props.username ? (
          <div class="shell">
            <aside class="side">
              <div class="brand"><i>UPK</i>UPK Server</div>
              <nav>
                {MENU.map((g) => (
                  <>
                    <div class="group">{g.group}</div>
                    {g.items.map(([href, label]) => (
                      <a href={href} class={props.active === href ? 'active' : ''}>{label}</a>
                    ))}
                  </>
                ))}
              </nav>
              <div class="side-foot">
                <span title={props.username}>{props.username}</span>
                <form class="inline" method="post" action="/panel/logout"><button>Salir</button></form>
              </div>
            </aside>
            <div class="content"><main>{body}</main></div>
          </div>
        ) : (
          <main class="center"><div style="width:100%;max-width:380px">{body}</div></main>
        )}
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
// ---------- Subidas con progreso ----------
// Los formularios con archivo se envían por XHR: barra de progreso real, botones deshabilitados,
// sin doble envío y aviso si se cierra la pestaña. Al terminar se sigue la redirección del servidor.
function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }
var uploading = false;
window.addEventListener('beforeunload', function (e) { if (uploading) { e.preventDefault(); e.returnValue = ''; } });
document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(function (form) {
  form.addEventListener('submit', function (e) {
    if (e.defaultPrevented || !window.FormData || !window.XMLHttpRequest) return;
    e.preventDefault();
    if (uploading) return;
    var file = form.querySelector('input[type=file]');
    var total = file && file.files && file.files[0] ? file.files[0].size : 0;
    var buttons = form.querySelectorAll('button, input[type=submit]');
    var box = form.querySelector('.upload-progress');
    if (!box) {
      box = document.createElement('div');
      box.className = 'upload-progress';
      box.innerHTML = '<div data-text></div><div class="bar"><i></i></div>';
      form.appendChild(box);
    }
    var text = box.querySelector('[data-text]'), bar = box.querySelector('.bar i');
    function busy(on) {
      uploading = on;
      buttons.forEach(function (b) { b.disabled = on; if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); });
    }
    function fail(msg) {
      busy(false);
      box.classList.remove('indeterminate');
      text.textContent = '';
      var s = document.createElement('b'); s.style.color = 'var(--err)'; s.textContent = msg; text.appendChild(s);
    }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', form.action);
    xhr.upload.onprogress = function (ev) {
      var t = ev.lengthComputable ? ev.total : total;
      if (!t) return;
      var pct = Math.min(100, Math.round(ev.loaded * 100 / t));
      bar.style.width = pct + '%';
      text.textContent = 'Subiendo… ' + pct + '% · ' + mb(ev.loaded) + ' de ' + mb(t) + '. No cierre esta pestaña.';
    };
    xhr.upload.onload = function () {
      box.classList.add('indeterminate');
      text.textContent = 'Archivo recibido. El servidor está verificando el archivo y la firma…';
    };
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 400 && xhr.responseURL) {
        uploading = false;
        window.location.href = xhr.responseURL;
      } else {
        fail('El servidor respondió con error ' + xhr.status + '. Intente de nuevo.');
      }
    };
    xhr.onerror = function () { fail('Se perdió la conexión durante la subida. Intente de nuevo.'); };
    var data = new FormData(form);
    busy(true);
    box.classList.remove('indeterminate');
    bar.style.width = '0';
    text.textContent = 'Preparando la subida…';
    xhr.send(data);
  });
});
// Formularios normales: evita el doble envío deshabilitando los botones justo después de enviar
document.querySelectorAll('form').forEach(function (form) {
  if (form.getAttribute('enctype') === 'multipart/form-data') return;
  form.addEventListener('submit', function (e) {
    if (e.defaultPrevented || form.method.toLowerCase() !== 'post') return;
    var b = form.querySelectorAll('button');
    setTimeout(function () { b.forEach(function (x) { x.disabled = true; x.setAttribute('aria-busy', 'true'); }); }, 0);
  });
});
// Copiar al portapapeles: <button data-copy="#id">
document.querySelectorAll('[data-copy]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var el = document.querySelector(btn.getAttribute('data-copy'));
    if (!el) return;
    var value = el.value || el.textContent;
    var done = function () { var t = btn.textContent; btn.textContent = 'Copiado'; setTimeout(function () { btn.textContent = t; }, 1500); };
    if (el.select) el.select();
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, function () { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
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
