import type { Child } from 'hono/jsx'
import { SiteHead, iconUrl, SITE_ASSET_VERSION } from './siteLayout.js'

/** Reproductor: ventana simulada de UPK donde corre una escena animada (ver SITE_SCRIPT). */
function Player(props: { scene: string; title?: string; label?: string; children?: Child }) {
  return (
    <div class="player" aria-hidden="true">
      <div class="badge"><b></b>{props.label ?? 'Demostración'}</div>
      <div class="screen" data-scene={props.scene}>
        <div class="win-bar">
          <img src={iconUrl('registerIcon')} width="14" height="14" alt="" />
          <span>{props.title ?? 'UPK · Administrativo'}</span>
          <span class="dots"><span>—</span><span>☐</span><span>✕</span></span>
        </div>
        {props.children}
        <svg class="cursor" viewBox="0 0 20 20"><path d="M3 2 L3 16 L7 12.5 L9.6 18 L12 17 L9.5 11.6 L15 11.4 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round" /></svg>
      </div>
    </div>
  )
}

const TOOLBAR = ['registerIcon', 'clientsIcon', 'usersIcon', 'salesIcon', 'inventoryIcon', 'providersIcon', 'settingsIcon', 'dispatchIcon', 'payablesIcon', 'exitIcon']

function Toolbar() {
  return (
    <div class="toolbar">
      {TOOLBAR.map((id) => <img src={iconUrl(id)} data-k={`tb-${id}`} alt="" />)}
    </div>
  )
}

function Status() {
  return <div class="status">Cuenta: 1234 USUARIO DEMO&nbsp; - &nbsp;administrador</div>
}

/** Tabla con columnas fijas; el script agrega filas usando data-cols. */
function Table(props: { k: string; cols: string; heads: string[]; style?: string }) {
  return (
    <div class="tbl" data-k={props.k} data-cols={props.cols} style={props.style}>
      <div class="th" style={`grid-template-columns:${props.cols}`}>{props.heads.map((h) => <span>{h}</span>)}</div>
    </div>
  )
}

const Sk = (props: { w: string; style?: string }) => <div class="sk" style={`width:${props.w};${props.style ?? ''}`}></div>

function HeroScene() {
  return (
    <Player scene="hero" label="En vivo">
      <Toolbar />
      <div class="desk">
        <div class="frame" style="inset:14px 18px">
          <div class="frame-title">Panel del día</div>
          <div style="padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
            {[['Ventas de hoy', 'hVentas', '$'], ['Facturas', 'hFacturas', ''], ['Ganancia', 'hGanancia', '$']].map(([t, k, s]) => (
              <div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px">
                <div style="color:#666;font-size:10px">{t}</div>
                <div style="font-size:18px;font-weight:700" data-k={k} data-suffix={s}>0</div>
              </div>
            ))}
          </div>
          <div style="padding:0 10px">
            <Table k="hRows" cols="40px 70px 1fr 90px" heads={['#', 'Número', 'Cliente', 'Total']} style="height:118px" />
          </div>
        </div>
      </div>
      <Status />
    </Player>
  )
}

function BillingScene() {
  return (
    <Player scene="billing" title="UPK · Facturacion">
      <Toolbar />
      <div class="desk">
        <div class="frame">
          <div class="frame-title">Facturacion</div>
          <div style="display:flex;gap:5px;padding:5px;height:86px">
            <div style="flex:1;border:1px solid #ccc;position:relative;padding:5px">
              <div class="row-f" style="align-items:center"><span>Cliente</span><div class="fld" data-k="cliente" style="width:90px"></div></div>
              <div data-k="clienteBox" style="margin-top:5px;height:38px;width:150px;border:1px solid #ddd;background:#f2f2f2;padding:4px;font-size:10.5px">
                <Sk w="70%" /><Sk w="45%" style="margin-top:5px" />
              </div>
              <div style="position:absolute;right:6px;top:5px;text-align:right;font-size:10px">28/11/2026 09:15 a. m.<br /><b>Tasa del día: 40.00 Bs.</b></div>
              <div style="position:absolute;right:8px;bottom:6px;display:flex;gap:6px;align-items:flex-end">
                <div><div style="font-size:10px">Código</div><div class="fld" data-k="codigo" style="width:96px"></div></div>
                <div><div style="font-size:10px">Cantidad:</div><div class="fld" style="width:40px"></div></div>
              </div>
            </div>
            <div class="dark" style="width:190px">
              <div style="position:absolute;left:6px;top:5px;font-size:10px">total dólares.</div>
              <div class="green" style="position:absolute;left:6px;top:18px;font-size:17px" data-k="totUsd">0.00 $.</div>
              <div class="green" style="position:absolute;right:6px;bottom:3px;font-size:20px" data-k="totBs">0.00 Bs.</div>
            </div>
          </div>
          <div style="display:flex;gap:5px;padding:0 5px 5px;flex:1;min-height:0">
            <div style="flex:1;border:1px solid #ccc;padding:5px">
              <Table k="items" cols="22px 54px 1fr 80px 34px 80px" heads={['#', 'Codigo', 'Descripcion', 'Precio', 'Cant', 'Total']} style="height:100%" />
            </div>
            <div style="width:190px;border:1px solid #ccc;padding:6px;display:flex;flex-direction:column;gap:6px">
              <Sk w="85%" /><Sk w="60%" /><Sk w="70%" /><Sk w="55%" /><Sk w="65%" />
              <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end">
                <div style="display:flex;flex-direction:column;gap:4px"><span class="ubtn">Guardar factura</span><span class="ubtn">facturas guardadas</span></div>
                <span class="ubtn blue" data-k="facturar" style="height:26px;font-size:13px;padding:0 14px">Facturar</span>
              </div>
            </div>
          </div>
        </div>
        <div class="pop" data-k="pago" hidden style="left:50%;top:6px;width:200px;margin-left:-100px;padding:8px">
          <div style="font-size:18px;color:#555">Pago</div>
          <div style="font-size:10px;margin-top:4px">Dólar <span data-k="pDolarBs"></span></div>
          <div class="fld" data-k="pDolar" style="width:100%"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:6px"><Sk w="90%" /><Sk w="70%" /><Sk w="80%" /><Sk w="60%" /></div>
          <div style="font-size:10px;margin-top:8px">Punto de venta</div>
          <div class="row-f" style="align-items:center"><div class="fld" data-k="pPunto" style="flex:1"></div>
            <img src={iconUrl('linkIcon')} data-k="pLink" width="18" height="18" alt="" /></div>
          <div style="font-size:10px;margin-top:8px">Dinero acumulado / faltante</div>
          <div class="row-f" style="align-items:stretch;margin-top:2px">
            <div class="fld" data-k="pAcum" style="flex:1;height:auto;padding:3px 5px;background:#f2f2f2">0.00 Bs.</div>
            <span class="ubtn" data-k="pOk" style="height:34px;width:40px;opacity:.45"><img src={iconUrl('checkIcon')} width="26" height="26" alt="" /></span>
          </div>
        </div>
      </div>
      <Status />
    </Player>
  )
}

function SalesScene() {
  return (
    <Player scene="sales" title="UPK · Ventas">
      <Toolbar />
      <div class="desk">
        <div class="frame">
          <div class="frame-title">Ventas</div>
          <div style="display:flex;gap:5px;padding:5px;flex:1;min-height:0">
            <div style="flex:1;display:flex;flex-direction:column;min-width:0">
              <div style="color:#228be6;font-weight:700;font-size:12px;margin-bottom:4px">Ventas realizadas <span data-k="sRes" style="color:#0a8f2e;font-weight:600;margin-left:8px"></span></div>
              <Table k="sRows" cols="22px 52px 1fr 1fr 96px" heads={['#', 'Numero', 'Vendedor', 'Cliente', 'Total']} style="flex:1" />
            </div>
            <div style="width:150px;display:flex;flex-direction:column;gap:5px">
              <div style="border:1px solid #d0d0d0;padding:6px;display:flex;flex-direction:column;gap:5px">
                <b style="color:#228be6">Filtrar facturas</b>
                <div style="font-size:10px">Rango de fechas</div>
                <div class="fld" data-k="sFecha"></div>
                <div style="font-size:10px">Pagos</div><div class="fld" data-k="sPago">Seleccione</div>
                <span class="ubtn blue" data-k="sBuscar">Buscar</span>
              </div>
              <div style="font-size:10px">Total en ventas:</div><div class="fld" data-k="sTotal" style="background:#f2f2f2"></div>
              <div style="font-size:10px">Ganancia total</div><div class="fld" data-k="sGan" style="background:#f2f2f2"></div>
            </div>
          </div>
          <div style="height:70px;margin:0 5px 5px;border:1px solid #ccc;display:flex;gap:6px;padding:5px">
            <div style="width:120px"><b style="color:#555">Detalle de la venta</b><div data-k="sDet" style="font-size:10px;margin-top:3px"><Sk w="80%" /><Sk w="60%" style="margin-top:4px" /></div></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:3px">
              <div style="display:flex;gap:6px;justify-content:flex-end">
                <img src={iconUrl('paymentsIcon')} data-k="sPagosBtn" width="18" height="18" alt="" />
                <img src={iconUrl('searchSaleIcon')} width="18" height="18" alt="" />
                <img src={iconUrl('trashIcon')} width="18" height="18" alt="" />
              </div>
              <Table k="sItems" cols="22px 60px 1fr 70px" heads={['#', 'Codigo', 'Desc', 'Total']} style="flex:1" />
            </div>
          </div>
        </div>
        <div class="pop" data-k="sPagos" hidden style="right:20px;bottom:30px;width:210px;padding:8px">
          <div style="font-size:15px;color:#555;margin-bottom:6px">Pagos realizados</div>
          {[['Efectivo', 'pe'], ['Punto de venta', 'pp'], ['Dólares', 'pd'], ['Zelle', 'pz']].map(([t, k]) => (
            <div style="display:grid;grid-template-columns:78px 1fr 60px;gap:6px;align-items:center;margin:4px 0;font-size:10.5px">
              <span>{t}</span><div class="bar done"><i data-k={`${k}Bar`} style="width:0"></i></div><b data-k={k} style="text-align:right">0</b>
            </div>
          ))}
        </div>
      </div>
      <Status />
    </Player>
  )
}

const INVENTORY = [
  ['CAR01', 'CARGADOR PARED 20W USB-C', 'CARGADORES', 18, 8],
  ['AUD01', 'AUDIFONOS INALAMBRICOS BT', 'AUDIFONOS', 12, 12],
  ['CAR02', 'CARGADOR CARRO DOBLE USB', 'CARGADORES', 2, 5],
  ['PWB02', 'POWER BANK 20000MAH 22.5W', 'POWER BANK', 5, 25],
  ['CAB01', 'CABLE USB-C A USB-C 1M', 'CABLES', 40, 2.5],
  ['CAR03', 'CARGADOR RAPIDO 33W', 'CARGADORES', 3, 12],
  ['MEM02', 'MICRO SD 64GB CLASE 10', 'MEMORIAS', 10, 9],
] as const

function InventoryScene() {
  const cols = '22px 46px 1fr 74px 34px 112px'
  return (
    <Player scene="inventory" title="UPK · Articulos">
      <Toolbar />
      <div class="desk">
        <div class="frame">
          <div class="frame-title">Articulos</div>
          <div style="display:flex;gap:10px;align-items:center;padding:4px 6px;border-bottom:1px solid #d9d9d9;font-size:11px">
            <span style="display:flex;gap:4px;align-items:center;border-bottom:2px solid #4083c9;padding-bottom:2px"><img src={iconUrl('productsIcon')} width="14" height="14" alt="" />Lista</span>
            <span style="display:flex;gap:4px;align-items:center"><img src={iconUrl('categoryIcon')} width="14" height="14" alt="" />Categorias</span>
            <span style="display:flex;gap:4px;align-items:center"><img src={iconUrl('addIcon')} width="14" height="14" alt="" />Agregar/Modificar</span>
            <span style="display:flex;gap:4px;align-items:center;opacity:.6"><img src={iconUrl('stockEntryIcon')} width="14" height="14" alt="" />Ingresos</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;padding:5px 6px">
            <span>Busqueda</span><div class="fld" data-k="iBuscar" style="flex:1"></div>
            <span class="ubtn" data-k="iDolarBtn"><img src={iconUrl('settingsIcon')} width="14" height="14" alt="" />&nbsp;Dólar: <b data-k="iTasa" style="margin-left:3px">40.00</b></span>
          </div>
          <div class="tbl" data-k="iRows" data-cols={cols} style="margin:0 6px 6px;flex:1">
            <div class="th" style={`grid-template-columns:${cols}`}>{['#', 'Código', 'Descripción', 'Categoria', 'Stock', 'Precio'].map((h) => <span>{h}</span>)}</div>
            {INVENTORY.map(([c, d, cat, st, usd], i) => (
              <div class={`tr${st <= 2 ? ' red' : st <= 4 ? ' yel' : ''}`} style={`grid-template-columns:${cols}`} data-usd={usd} data-text={`${c} ${d} ${cat}`.toLowerCase()}>
                <span>{String(i + 1).padStart(2, '0')}</span><span>{c}</span><span style="overflow:hidden;text-overflow:ellipsis">{d}</span>
                <span>{cat}</span><span data-stock>{st}</span><span data-price>{(usd * 40).toFixed(2)} Bs. ({usd} $)</span>
              </div>
            ))}
          </div>
        </div>
        <div class="pop" data-k="iPop" hidden style="right:24px;top:40px;width:180px;padding:8px">
          <div style="font-size:14px;margin-bottom:6px">Configuración</div>
          <div style="font-size:10px">Dólar de sistema</div>
          <div class="fld" data-k="iTasaFld" style="width:100%"></div>
          <div style="text-align:right;margin-top:8px"><span class="ubtn" data-k="iGuardar">Guardar</span></div>
        </div>
      </div>
      <Status />
    </Player>
  )
}

const DEBTORS = [
  ['MARÍA PÉREZ', 'V-12345678', 120, 30],
  ['COMERCIAL EJEMPLO C.A.', 'J-300000001', 450, 300],
  ['JOSÉ RAMÍREZ', 'V-20456789', 80, 0],
  ['INVERSIONES DEMO', 'J-401234567', 260, 200],
] as const

function ReceivablesScene() {
  const cols = '1fr 74px 56px 90px 54px'
  return (
    <Player scene="receivables" title="UPK · Cuentas por cobrar">
      <Toolbar />
      <div class="desk">
        <div class="frame">
          <div class="frame-title">Cuentas por cobrar</div>
          <div style="display:flex;gap:10px;align-items:center;padding:6px">
            <b style="font-size:13px">Lista de deudores</b>
            <span style="margin-left:auto;font-size:10px">Total para cobrar</span><div class="fld" data-k="cTotal" style="width:90px;background:#f2f2f2"></div>
          </div>
          <div class="tbl" data-k="cRows" style="margin:0 6px;flex:1">
            <div class="th" style={`grid-template-columns:${cols}`}>{['Cliente', 'Deuda $', 'Abonado', 'Progreso', 'Estado'].map((h) => <span>{h}</span>)}</div>
            {DEBTORS.map(([n, id, debt, paid]) => (
              <div class="tr" style={`grid-template-columns:${cols};height:26px`} data-debt={debt} data-paid={paid}>
                <span style="line-height:1.1">{n}<br /><small style="opacity:.7">{id}</small></span>
                <span>{debt.toFixed(2)}</span><span data-paid-txt>{paid.toFixed(2)}</span>
                <div class="bar"><i style={`width:${Math.round((paid / debt) * 100)}%`}></i></div>
                <span><span class="tagu">Pendiente</span></span>
              </div>
            ))}
          </div>
          <div style="display:flex;gap:6px;justify-content:flex-end;padding:6px">
            <span class="ubtn">Combinar cuentas</span><span class="ubtn blue" data-k="cAbonar">Agregar pago</span>
          </div>
        </div>
        <div class="pop" data-k="cPop" hidden style="left:50%;top:40px;width:200px;margin-left:-100px;padding:8px">
          <div style="font-size:14px;margin-bottom:6px">Agregar pago</div>
          <div style="font-size:10px">Monto ($)</div><div class="fld" data-k="cMonto"></div>
          <div style="font-size:10px;margin-top:5px">Referencia</div><div class="fld" data-k="cRef"></div>
          <div style="text-align:right;margin-top:8px"><span class="ubtn blue" data-k="cOk">Agregar</span></div>
        </div>
      </div>
      <Status />
    </Player>
  )
}

function Feature(props: { id: string; icon: string; kicker: string; title: Child; text: string; points: string[]; flip?: boolean; children: Child }) {
  return (
    <section class={`feature${props.flip ? ' flip' : ''}`} id={props.id}>
      <div class="wrap">
        <div class="copy">
          <div class="kicker"><img src={iconUrl(props.icon)} alt="" />{props.kicker}</div>
          <h2>{props.title}</h2>
          <p>{props.text}</p>
          <ul class="checks">{props.points.map((p) => <li>{p}</li>)}</ul>
          <a class="btn line" href={`/manual#${props.id}`}>Cómo se usa →</a>
        </div>
        {props.children}
      </div>
    </section>
  )
}

export function LandingPage(props: { demoUrl: string | null }) {
  return (
    <html lang="es">
      <SiteHead title="UPK · Sistema administrativo para tu negocio"
        description="Facturación, ventas, inventario y cuentas por cobrar en bolívares y dólares, en un solo sistema." />
      <body>
        <header class="top">
          <div class="wrap">
            <a class="logo" href="/"><i>UPK</i>UPK</a>
            <nav>
              <a class="hide-m" href="#facturacion">Facturación</a>
              <a class="hide-m" href="#ventas">Ventas</a>
              <a class="hide-m" href="#inventario">Inventario</a>
              <a class="hide-m" href="#cxc">Cuentas por cobrar</a>
              <a href="/manual">Manual</a>
            </nav>
            {props.demoUrl && <a class="btn pri" href={props.demoUrl}>Probar la demo</a>}
          </div>
        </header>

        <section class="hero">
          <div class="wrap">
            <div>
              <span class="eyebrow"><b></b>Sistema administrativo UPK</span>
              <h1>Tu negocio, <em>facturando en segundos</em> y en dos monedas.</h1>
              <p class="lead">Factura, controla tu inventario, sigue cada venta y cobra a crédito sin perder la cuenta.
                Bolívares y dólares a la tasa del día, en una sola aplicación.</p>
              <div class="ctas">
                {props.demoUrl && <a class="btn pri" href={props.demoUrl}>Probar la demo gratis</a>}
                <a class="btn ghost" href="/manual">Ver el manual</a>
              </div>
              <div class="facts">
                <div><b>Bs. y $</b>tasa del día</div>
                <div><b>8 métodos</b>de pago</div>
                <div><b>PDF</b>factura al instante</div>
              </div>
            </div>
            <HeroScene />
          </div>
        </section>

        <Feature id="facturacion" icon="registerIcon" kicker="Facturación" title={<>Del código de barras a la factura, <em style="font-style:normal;color:var(--pri)">sin esperas</em></>}
          text="Escanea o escribe el código, el producto entra a la factura y los totales se calculan solos en bolívares y dólares."
          points={['Clientes por cédula: si no existe, se registra en el momento', 'Cobro mixto: efectivo, punto, dólares, Zelle, transferencias, biopago y USDT',
            'El faltante se completa por punto con un clic', 'Guarda facturas para retomarlas y genera la factura en PDF']}>
          <BillingScene />
        </Feature>

        <Feature id="ventas" icon="salesIcon" kicker="Ventas" flip title="Cada venta, a la vista y con su ganancia"
          text="Filtra por fecha, vendedor o método de pago y obtén al instante el total vendido, la ganancia y el detalle de cada factura."
          points={['Totales en Bs. y $ con ganancia, IVA y comisiones', 'Pagos realizados: cuánto entró por cada método', 'Reimprime cualquier factura (Bs., $ o A4)',
            'Devoluciones que regresan el inventario automáticamente']}>
          <SalesScene />
        </Feature>

        <Feature id="inventario" icon="inventoryIcon" kicker="Inventario" title="Precios que siguen al dólar, stock que avisa"
          text="Los productos relativos al dólar actualizan su precio en bolívares cuando cambia la tasa. El stock bajo se marca en amarillo y rojo."
          points={['Hasta tres precios por producto y cálculo de ganancia', 'Categorías, proveedores y ubicación', 'Equipos con serial e IMEI',
            'Ingresos de mercancía y carga masiva desde CSV']}>
          <InventoryScene />
        </Feature>

        <Feature id="cxc" icon="debtIcon" kicker="Cuentas por cobrar" flip title="Vende a crédito sin perder la cuenta"
          text="Las deudas quedan ancladas en dólares y se cobran a la tasa del día. Registra abonos parciales y mira quién debe y cuánto."
          points={['Límite y días de crédito por cliente', 'Abonos con referencia y saldo actualizado al momento', 'Lista de deudores con totales por cobrar',
            'Combina cuentas y genera reportes']}>
          <ReceivablesScene />
        </Feature>

        <section class="cta-final">
          <div class="wrap">
            <h2>¿Listo para verlo funcionando?</h2>
            <p>Entra a la demo con datos de ejemplo o consulta el manual paso a paso.</p>
            <div class="ctas" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
              {props.demoUrl && <a class="btn pri" href={props.demoUrl}>Probar la demo</a>}
              <a class="btn ghost" href="/manual">Manual de usuario</a>
            </div>
          </div>
        </section>

        <footer class="foot">
          <div class="wrap">
            <span>© {new Date().getFullYear()} UPK · Sistema administrativo</span>
            <nav><a href="/manual">Manual</a>{props.demoUrl && <a href={props.demoUrl}>Demo</a>}</nav>
          </div>
        </footer>
        <script src={`/site/site.js?v=${SITE_ASSET_VERSION}`} defer></script>
      </body>
    </html>
  )
}
