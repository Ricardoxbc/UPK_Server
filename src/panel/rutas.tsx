import type { HttpBindings } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { ObjectId } from 'mongodb'
import { borrarVersion, recibirMultipart, MAX_JAR_BYTES } from '../lib/almacenamiento.js'
import {
  cerrarSesion, generarToken, hashClave, hashToken, iniciarSesion, mismoOrigen,
  requiereSesion, verificarCredenciales, type Variables,
} from '../lib/auth.js'
import { admins, auditar, auditoria, clientes, reportes, tokens, versiones, type ResultadoReporte } from '../lib/db.js'
import { comparar } from '../lib/version.js'
import { ErrorValidacion, registrarVersion } from '../lib/versiones.js'
import { ipDe } from '../rutas/publica.js'
import { ESTILO, Layout, fecha, mb } from './layout.js'

type Env = { Bindings: HttpBindings; Variables: Variables }
export const panel = new Hono<Env>()

const q = (c: Context, k: string) => c.req.query(k) || undefined
/** Redirige con un mensaje (?ok= / ?error=). */
const volver = (c: Context, ruta: string, tipo: 'ok' | 'error', msg: string) =>
  c.redirect(`${ruta}?${tipo}=${encodeURIComponent(msg)}`)

panel.get('/estilo.css', (c) => c.body(ESTILO, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'max-age=3600' }))

// ---------- Login (límite simple de intentos por IP) ----------
const intentos = new Map<string, { n: number; desde: number }>()
const VENTANA_MS = 15 * 60 * 1000

function bloqueado(ip: string): boolean {
  const i = intentos.get(ip)
  if (!i || Date.now() - i.desde > VENTANA_MS) return false
  return i.n >= 10
}
function fallo(ip: string): void {
  const i = intentos.get(ip)
  if (!i || Date.now() - i.desde > VENTANA_MS) intentos.set(ip, { n: 1, desde: Date.now() })
  else i.n++
  if (intentos.size > 5000) intentos.clear()
}

panel.get('/login', (c) =>
  c.html(
    <Layout titulo="Ingresar" error={q(c, 'error')}>
      <div class="caja" style="max-width:360px;margin:60px auto">
        <h1>UPK Server</h1>
        <form method="post" action="/panel/login" class="grid" style="grid-template-columns:90px 1fr">
          <label>Usuario</label><input name="usuario" autocomplete="username" required autofocus />
          <label>Clave</label><input name="clave" type="password" autocomplete="current-password" required />
          <span></span><button class="pri">Ingresar</button>
        </form>
      </div>
    </Layout>,
  ),
)

panel.post('/login', async (c) => {
  if (!mismoOrigen(c)) return c.text('Origen no permitido', 403)
  const ip = ipDe(c) ?? '?'
  if (bloqueado(ip)) return volver(c, '/panel/login', 'error', 'Demasiados intentos. Espere 15 minutos.')
  const f = await c.req.parseBody()
  const usuario = String(f.usuario ?? '').trim()
  if (!(await verificarCredenciales(usuario, String(f.clave ?? '')))) {
    fallo(ip)
    return volver(c, '/panel/login', 'error', 'Usuario o clave incorrectos')
  }
  intentos.delete(ip)
  await iniciarSesion(c, usuario)
  await auditar(usuario, 'sesion.ingresar', ip)
  return c.redirect('/panel/versiones')
})

panel.post('/salir', (c) => {
  cerrarSesion(c)
  return c.redirect('/panel/login')
})

// ---------- Todo lo demás exige sesión ----------
panel.use('*', requiereSesion)
panel.get('/', (c) => c.redirect('/panel/versiones'))

// ---------- Versiones ----------
panel.get('/versiones', async (c) => {
  const lista = (await versiones().find().toArray()).sort((a, b) => comparar(b.numero, a.numero))
  const enUso = await clientes().aggregate<{ _id: string; n: number }>([
    { $match: { activo: true } }, { $group: { _id: '$ultimaVersion', n: { $sum: 1 } } },
  ]).toArray()
  const porVersion = new Map(enUso.map((x) => [x._id, x.n]))
  return c.html(
    <Layout titulo="Versiones" usuario={c.get('usuario')} activo="/panel/versiones" ok={q(c, 'ok')} error={q(c, 'error')}>
      <h1>Versiones</h1>
      <p class="mut">Se ofrece a los clientes la mayor versión <b>publicada</b> (o la fijada en el cliente).
        Una versión <b>obligatoria</b> se descarga sin preguntar; las demás muestran el aviso con cuenta regresiva.</p>
      <table>
        <thead><tr><th>Versión</th><th>Estado</th><th>Tipo</th><th>Tamaño</th><th>Clientes</th><th>Publicada</th><th>Notas</th><th>Acciones</th></tr></thead>
        <tbody>
          {lista.length === 0 && <tr><td colspan={8} class="mut">Todavía no hay versiones.</td></tr>}
          {lista.map((v) => (
            <tr>
              <td><b>{v.numero}</b><div class="mut" title={v.sha256}>{v.sha256.slice(0, 12)}…</div></td>
              <td><span class={`et ${v.estado}`}>{v.estado}</span></td>
              <td>{v.obligatoria ? <span class="et obl">obligatoria</span> : <span class="mut">opcional</span>}</td>
              <td class="num">{mb(v.tamano)}</td>
              <td class="num">{porVersion.get(v.numero) ?? 0}</td>
              <td>{fecha(v.publicadaEn)}<div class="mut">por {v.creadaPor}</div></td>
              <td style="max-width:280px">
                <details>
                  <summary>{v.notas ? v.notas.split('\n')[0].slice(0, 40) : 'agregar'}</summary>
                  <form method="post" action={`/panel/versiones/${v.numero}/notas`}>
                    <textarea name="notas" rows={4}>{v.notas}</textarea><button>Guardar notas</button>
                  </form>
                </details>
              </td>
              <td>
                <div class="acciones">
                  {v.estado !== 'publicada'
                    ? <form class="linea" method="post" action={`/panel/versiones/${v.numero}/estado`}><input type="hidden" name="estado" value="publicada" /><button class="pri">Publicar</button></form>
                    : <form class="linea" method="post" action={`/panel/versiones/${v.numero}/estado`} onsubmit="return confirm('¿Retirar esta versión? Dejará de ofrecerse a los clientes.')"><input type="hidden" name="estado" value="retirada" /><button class="peligro">Retirar</button></form>}
                  <form class="linea" method="post" action={`/panel/versiones/${v.numero}/obligatoria`}>
                    <input type="hidden" name="valor" value={v.obligatoria ? 'false' : 'true'} />
                    <button>{v.obligatoria ? 'Hacer opcional' : 'Hacer obligatoria'}</button>
                  </form>
                  {v.estado !== 'publicada' && (
                    <form class="linea" method="post" action={`/panel/versiones/${v.numero}/eliminar`} onsubmit="return confirm('¿Eliminar la versión y su archivo? No se puede deshacer.')">
                      <button class="peligro">Eliminar</button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Subir versión</h2>
      <p class="mut">Lo normal es publicar desde la PC del desarrollador con <code>Firmador publicar</code>.
        Desde aquí: firme antes el jar con <code>Firmador firmar app.jar private_key.b64</code> y pegue la firma.
        El servidor verifica la firma con la clave pública del Launcher.</p>
      <form class="grid caja" method="post" action="/panel/versiones/subir" enctype="multipart/form-data">
        <label>Versión</label><input name="version" placeholder="1.5.0" required pattern="\d+(\.\d+){1,3}" />
        <label>Firma (Base64)</label><textarea name="firma" rows={3} required></textarea>
        <label>SHA-256 (opcional)</label><input name="sha256" placeholder="se calcula y compara si lo pega" />
        <label>Notas</label><textarea name="notas" rows={3} placeholder="Novedades que verá el usuario"></textarea>
        <label>Opciones</label>
        <div>
          <label><input type="checkbox" name="obligatoria" /> Obligatoria</label>{'  '}
          <label><input type="checkbox" name="publicar" /> Publicar al subir</label>
        </div>
        <label>Jar</label><input type="file" name="jar" accept=".jar" required />
        <span></span><div><button class="pri">Subir</button> <span class="mut">máx. {MAX_JAR_BYTES / 1048576} MB</span></div>
      </form>
    </Layout>,
  )
})

panel.post('/versiones/subir', async (c) => {
  try {
    const v = await registrarVersion(await recibirMultipart(c.env.incoming), c.get('usuario'))
    return volver(c, '/panel/versiones', 'ok', `Versión ${v.numero} subida (${v.estado}).`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!(e instanceof ErrorValidacion)) console.error('Error al subir versión:', e)
    return volver(c, '/panel/versiones', 'error', msg)
  }
})

panel.post('/versiones/:numero/estado', async (c) => {
  const numero = c.req.param('numero')
  const estado = String((await c.req.parseBody()).estado)
  if (estado !== 'publicada' && estado !== 'retirada') return c.text('Estado inválido', 400)
  const r = await versiones().updateOne({ numero }, {
    $set: { estado, ...(estado === 'publicada' ? { publicadaEn: new Date() } : {}) },
  })
  if (!r.matchedCount) return volver(c, '/panel/versiones', 'error', 'Versión no encontrada')
  await auditar(c.get('usuario'), estado === 'publicada' ? 'version.publicar' : 'version.retirar', numero)
  return volver(c, '/panel/versiones', 'ok', `Versión ${numero} ${estado}.`)
})

panel.post('/versiones/:numero/obligatoria', async (c) => {
  const numero = c.req.param('numero')
  const valor = String((await c.req.parseBody()).valor) === 'true'
  await versiones().updateOne({ numero }, { $set: { obligatoria: valor } })
  await auditar(c.get('usuario'), 'version.obligatoria', `${numero} → ${valor ? 'obligatoria' : 'opcional'}`)
  return volver(c, '/panel/versiones', 'ok', `Versión ${numero} ahora es ${valor ? 'obligatoria' : 'opcional'}.`)
})

panel.post('/versiones/:numero/notas', async (c) => {
  const numero = c.req.param('numero')
  const notas = String((await c.req.parseBody()).notas ?? '').trim().slice(0, 4000)
  await versiones().updateOne({ numero }, { $set: { notas } })
  await auditar(c.get('usuario'), 'version.notas', numero)
  return volver(c, '/panel/versiones', 'ok', `Notas de ${numero} guardadas.`)
})

panel.post('/versiones/:numero/eliminar', async (c) => {
  const numero = c.req.param('numero')
  const v = await versiones().findOne({ numero })
  if (!v) return volver(c, '/panel/versiones', 'error', 'Versión no encontrada')
  if (v.estado === 'publicada') return volver(c, '/panel/versiones', 'error', 'Retire la versión antes de eliminarla')
  await versiones().deleteOne({ _id: v._id })
  await borrarVersion(v.ruta)
  await auditar(c.get('usuario'), 'version.eliminar', numero)
  return volver(c, '/panel/versiones', 'ok', `Versión ${numero} eliminada.`)
})

// ---------- Clientes ----------
panel.get('/clientes', async (c) => {
  const lista = await clientes().find().sort({ ultimoContacto: -1 }).toArray()
  const publicadas = (await versiones().find({ estado: 'publicada' }).toArray())
    .map((v) => v.numero).sort((a, b) => comparar(b, a))
  return c.html(
    <Layout titulo="Clientes" usuario={c.get('usuario')} activo="/panel/clientes" ok={q(c, 'ok')} error={q(c, 'error')}>
      <h1>Clientes</h1>
      <p class="mut">Se registran solos la primera vez que su Launcher consulta (por su <code>cliente.id</code>).
        Un cliente inactivo no recibe actualizaciones. Con una versión fijada recibe solo esa.</p>
      <table>
        <thead><tr><th>Cliente</th><th>Versión</th><th>Último contacto</th><th>IP</th><th>Configuración</th></tr></thead>
        <tbody>
          {lista.length === 0 && <tr><td colspan={5} class="mut">Ningún Launcher ha consultado todavía.</td></tr>}
          {lista.map((cl) => (
            <tr>
              <td><b>{cl.clienteId}</b><div class="mut">{cl.nombre}</div>{!cl.activo && <span class="et retirada">inactivo</span>}</td>
              <td>{cl.ultimaVersion ?? '—'}</td>
              <td>{fecha(cl.ultimoContacto)}</td>
              <td class="mut">{cl.ultimaIp ?? '—'}</td>
              <td>
                <form method="post" action={`/panel/clientes/${encodeURIComponent(cl.clienteId)}`} class="acciones">
                  <input name="nombre" value={cl.nombre} placeholder="Nombre / empresa" size={18} />
                  <select name="versionFijada" title="Versión fijada">
                    <option value="">Última publicada</option>
                    {cl.versionFijada && !publicadas.includes(cl.versionFijada) && (
                      <option value={cl.versionFijada} selected>{cl.versionFijada} (no publicada)</option>
                    )}
                    {publicadas.map((n) => <option value={n} selected={cl.versionFijada === n}>Fijar {n}</option>)}
                  </select>
                  <label><input type="checkbox" name="activo" checked={cl.activo} /> Activo</label>
                  <button>Guardar</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>,
  )
})

panel.post('/clientes/:id', async (c) => {
  const clienteId = c.req.param('id')
  const f = await c.req.parseBody()
  const cambios = {
    nombre: String(f.nombre ?? '').trim().slice(0, 100),
    versionFijada: String(f.versionFijada ?? '').trim() || null,
    activo: f.activo === 'on',
  }
  const r = await clientes().updateOne({ clienteId }, { $set: cambios })
  if (!r.matchedCount) return volver(c, '/panel/clientes', 'error', 'Cliente no encontrado')
  await auditar(c.get('usuario'), 'cliente.editar',
    `${clienteId}: fijada=${cambios.versionFijada ?? 'no'}, activo=${cambios.activo}`)
  return volver(c, '/panel/clientes', 'ok', `Cliente ${clienteId} guardado.`)
})

// ---------- Reportes ----------
const RESULTADOS: ResultadoReporte[] = ['actualizado', 'cancelado', 'fallido', 'revertido', 'omitido', 'pospuesto']

panel.get('/reportes', async (c) => {
  const cliente = q(c, 'cliente')
  const resultado = q(c, 'resultado')
  const filtro: Record<string, string> = {}
  if (cliente) filtro.clienteId = cliente
  if (resultado) filtro.resultado = resultado
  const lista = await reportes().find(filtro).sort({ fecha: -1 }).limit(300).toArray()
  const ids = (await clientes().find({}, { projection: { clienteId: 1 } }).toArray()).map((x) => x.clienteId).sort()
  return c.html(
    <Layout titulo="Reportes" usuario={c.get('usuario')} activo="/panel/reportes">
      <h1>Reportes de actualización</h1>
      <form method="get" class="acciones" style="margin-bottom:12px">
        <select name="cliente"><option value="">Todos los clientes</option>
          {ids.map((id) => <option value={id} selected={id === cliente}>{id}</option>)}</select>
        <select name="resultado"><option value="">Todos los resultados</option>
          {RESULTADOS.map((r) => <option value={r} selected={r === resultado}>{r}</option>)}</select>
        <button>Filtrar</button>
        <span class="mut">Últimos 300 · se guardan 180 días</span>
      </form>
      <table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Equipo</th><th>Versión</th><th>Resultado</th><th>Detalle</th></tr></thead>
        <tbody>
          {lista.length === 0 && <tr><td colspan={6} class="mut">Sin reportes.</td></tr>}
          {lista.map((r) => (
            <tr>
              <td>{fecha(r.fecha)}</td><td>{r.clienteId}</td><td>{r.equipo}</td>
              <td>{r.versionAntes} → {r.versionDespues}</td>
              <td><span class={`et ${r.resultado}`}>{r.resultado}</span></td>
              <td class="mut">{r.detalle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>,
  )
})

// ---------- Auditoría ----------
panel.get('/auditoria', async (c) => {
  const lista = await auditoria().find().sort({ fecha: -1 }).limit(300).toArray()
  return c.html(
    <Layout titulo="Auditoría" usuario={c.get('usuario')} activo="/panel/auditoria">
      <h1>Auditoría</h1>
      <table>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>
          {lista.map((a) => <tr><td>{fecha(a.fecha)}</td><td>{a.usuario}</td><td><code>{a.accion}</code></td><td class="mut">{a.detalle}</td></tr>)}
        </tbody>
      </table>
    </Layout>,
  )
})

// ---------- Tokens de publicación ----------
async function paginaTokens(c: Context<Env>, nuevo?: { nombre: string; token: string }) {
  const lista = await tokens().find().sort({ creadoEn: -1 }).toArray()
  return c.html(
    <Layout titulo="Tokens" usuario={c.get('usuario')} activo="/panel/tokens" ok={q(c, 'ok')} error={q(c, 'error')}>
      <h1>Tokens de publicación</h1>
      <p class="mut">Los usa <code>Firmador publicar … --token &lt;token&gt;</code> para subir versiones. Trátelos como contraseñas.</p>
      {nuevo && (
        <div class="caja" style="margin-bottom:14px">
          <b>Token "{nuevo.nombre}" creado.</b> Cópielo ahora: no se volverá a mostrar.
          <pre style="margin-top:8px"><code>{nuevo.token}</code></pre>
        </div>
      )}
      <table>
        <thead><tr><th>Nombre</th><th>Creado</th><th>Último uso</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {lista.map((t) => (
            <tr>
              <td>{t.nombre}</td><td>{fecha(t.creadoEn)} <span class="mut">por {t.creadoPor}</span></td><td>{fecha(t.ultimoUso)}</td>
              <td>{t.revocado ? <span class="et retirada">revocado</span> : <span class="et publicada">activo</span>}</td>
              <td>{!t.revocado && (
                <form class="linea" method="post" action={`/panel/tokens/${t._id}/revocar`} onsubmit="return confirm('¿Revocar este token?')">
                  <button class="peligro">Revocar</button>
                </form>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form method="post" action="/panel/tokens" class="acciones">
        <input name="nombre" placeholder="Nombre (ej.: PC de desarrollo)" required size={30} />
        <button class="pri">Crear token</button>
      </form>
    </Layout>,
  )
}

panel.get('/tokens', (c) => paginaTokens(c))

panel.post('/tokens', async (c) => {
  const nombre = String((await c.req.parseBody()).nombre ?? '').trim().slice(0, 60)
  if (!nombre) return volver(c, '/panel/tokens', 'error', 'Indique un nombre')
  const token = generarToken()
  await tokens().insertOne({
    nombre, hash: hashToken(token), creadoEn: new Date(), creadoPor: c.get('usuario'), revocado: false, ultimoUso: null,
  })
  await auditar(c.get('usuario'), 'token.crear', nombre)
  return paginaTokens(c, { nombre, token })
})

panel.post('/tokens/:id/revocar', async (c) => {
  let id: ObjectId
  try {
    id = new ObjectId(c.req.param('id'))
  } catch {
    return c.text('Id inválido', 400)
  }
  const t = await tokens().findOneAndUpdate({ _id: id }, { $set: { revocado: true } })
  if (t) await auditar(c.get('usuario'), 'token.revocar', t.nombre)
  return volver(c, '/panel/tokens', 'ok', 'Token revocado.')
})

// ---------- Cuenta y administradores ----------
panel.get('/cuenta', async (c) => {
  const lista = await admins().find({}, { projection: { usuario: 1, creadoEn: 1 } }).toArray()
  return c.html(
    <Layout titulo="Cuenta" usuario={c.get('usuario')} activo="/panel/cuenta" ok={q(c, 'ok')} error={q(c, 'error')}>
      <h1>Cuenta</h1>
      <h2>Cambiar mi clave</h2>
      <form method="post" action="/panel/cuenta/clave" class="grid caja">
        <label>Clave actual</label><input type="password" name="actual" required autocomplete="current-password" />
        <label>Nueva clave</label><input type="password" name="nueva" required minlength={10} autocomplete="new-password" />
        <span></span><button class="pri">Cambiar clave</button>
      </form>
      <h2>Administradores</h2>
      <table><tbody>{lista.map((a) => <tr><td>{a.usuario}</td><td class="mut">desde {fecha(a.creadoEn)}</td></tr>)}</tbody></table>
      <form method="post" action="/panel/cuenta/admin" class="grid caja">
        <label>Usuario</label><input name="usuario" required pattern="[A-Za-z0-9._-]{3,30}" />
        <label>Clave</label><input type="password" name="clave" required minlength={10} autocomplete="new-password" />
        <span></span><button>Agregar administrador</button>
      </form>
    </Layout>,
  )
})

panel.post('/cuenta/clave', async (c) => {
  const f = await c.req.parseBody()
  const usuario = c.get('usuario')
  const nueva = String(f.nueva ?? '')
  if (!(await verificarCredenciales(usuario, String(f.actual ?? '')))) {
    return volver(c, '/panel/cuenta', 'error', 'La clave actual no es correcta')
  }
  if (nueva.length < 10) return volver(c, '/panel/cuenta', 'error', 'La nueva clave debe tener al menos 10 caracteres')
  await admins().updateOne({ usuario }, { $set: { claveHash: await hashClave(nueva) } })
  await auditar(usuario, 'cuenta.clave')
  return volver(c, '/panel/cuenta', 'ok', 'Clave cambiada.')
})

panel.post('/cuenta/admin', async (c) => {
  const f = await c.req.parseBody()
  const usuario = String(f.usuario ?? '').trim()
  const clave = String(f.clave ?? '')
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(usuario) || clave.length < 10) {
    return volver(c, '/panel/cuenta', 'error', 'Usuario (3–30 caracteres) y clave (mín. 10) requeridos')
  }
  if (await admins().findOne({ usuario })) return volver(c, '/panel/cuenta', 'error', 'Ese usuario ya existe')
  await admins().insertOne({ usuario, claveHash: await hashClave(clave), creadoEn: new Date() })
  await auditar(c.get('usuario'), 'admin.crear', usuario)
  return volver(c, '/panel/cuenta', 'ok', `Administrador ${usuario} creado.`)
})
