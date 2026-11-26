import type { Child } from 'hono/jsx'

export const ESTILO = `
:root{--fg:#1f2328;--mut:#656d76;--bd:#d0d7de;--bg:#f6f8fa;--pri:#0969da;--ok:#1a7f37;--err:#cf222e;--warn:#9a6700}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg);background:#fff}
header{display:flex;gap:18px;align-items:center;padding:10px 20px;border-bottom:1px solid var(--bd);background:var(--bg)}
header b{font-size:15px}header nav{display:flex;gap:14px;flex:1}header a{color:var(--fg);text-decoration:none}
header a.act{font-weight:600;color:var(--pri)}main{padding:20px;max-width:1200px}
h1{font-size:20px;margin:0 0 14px}h2{font-size:16px;margin:24px 0 10px}
table{border-collapse:collapse;width:100%;margin-bottom:12px}th,td{border-bottom:1px solid var(--bd);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--bg);font-weight:600;white-space:nowrap}td.num{text-align:right;white-space:nowrap}
input,select,textarea,button{font:inherit;padding:5px 8px;border:1px solid var(--bd);border-radius:6px}
textarea{width:100%}button{background:#fff;cursor:pointer}button.pri{background:var(--pri);color:#fff;border-color:var(--pri)}
button.peligro{color:var(--err)}form.linea{display:inline}form.grid{display:grid;grid-template-columns:160px 1fr;gap:8px 12px;max-width:760px;align-items:start}
form.grid label{padding-top:6px;color:var(--mut)}.msg{padding:8px 12px;border-radius:6px;margin-bottom:14px}
.msg.ok{background:#dafbe1;color:var(--ok)}.msg.err{background:#ffebe9;color:var(--err)}
.et{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;border:1px solid var(--bd)}
.et.publicada,.et.actualizado{background:#dafbe1;color:var(--ok);border-color:#aceebb}
.et.borrador,.et.pospuesto,.et.omitido{background:var(--bg);color:var(--mut)}
.et.retirada,.et.fallido,.et.revertido{background:#ffebe9;color:var(--err);border-color:#ffcecb}
.et.obl,.et.cancelado{background:#fff8c5;color:var(--warn);border-color:#f2e085}
.mut{color:var(--mut)}code{background:var(--bg);padding:1px 5px;border-radius:4px}pre{white-space:pre-wrap;margin:0}
.acciones{display:flex;gap:6px;flex-wrap:wrap}details summary{cursor:pointer;color:var(--pri)}
.caja{border:1px solid var(--bd);border-radius:8px;padding:14px;background:var(--bg)}
`

const MENU: [string, string][] = [
  ['/panel/versiones', 'Versiones'],
  ['/panel/clientes', 'Clientes'],
  ['/panel/reportes', 'Reportes'],
  ['/panel/auditoria', 'Auditoría'],
  ['/panel/tokens', 'Tokens'],
  ['/panel/cuenta', 'Cuenta'],
]

export function Layout(props: { titulo: string; usuario?: string; activo?: string; ok?: string; error?: string; children?: Child }) {
  return (
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{props.titulo} · UPK Server</title>
        <link rel="stylesheet" href="/panel/estilo.css" />
      </head>
      <body>
        {props.usuario && (
          <header>
            <b>UPK Server</b>
            <nav>
              {MENU.map(([href, txt]) => (
                <a href={href} class={props.activo === href ? 'act' : ''}>{txt}</a>
              ))}
            </nav>
            <span class="mut">{props.usuario}</span>
            <form class="linea" method="post" action="/panel/salir"><button>Salir</button></form>
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

const ZONA = process.env.ZONA_HORARIA?.trim() || 'America/Lima'

export function fecha(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-PE', { timeZone: ZONA, dateStyle: 'short', timeStyle: 'short' })
}

export function mb(bytes: number): string {
  return (bytes / 1048576).toFixed(1) + ' MB'
}
