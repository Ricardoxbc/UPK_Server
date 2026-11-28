import type { Child } from 'hono/jsx'
import { SiteHead, iconUrl, SITE_ASSET_VERSION } from './siteLayout.js'

/** Botón o menú de la app citado en el texto, con su icono real si lo tiene. */
const Ui = (props: { icon?: string; children: Child }) => (
  <span class="ui">{props.icon && <img src={iconUrl(props.icon)} alt="" />}{props.children}</span>
)
const K = (props: { children: Child }) => <kbd>{props.children}</kbd>

function Callout(props: { kind?: 'warn' | 'ok'; title: string; children: Child }) {
  const icon = props.kind === 'warn' ? '⚠️' : props.kind === 'ok' ? '✅' : '💡'
  return (
    <div class={`callout${props.kind ? ` ${props.kind}` : ''}`}>
      <span class="ic">{icon}</span>
      <div><b class="t">{props.title}</b>{props.children}</div>
    </div>
  )
}

function Topic(props: { id: string; icon: string; title: string; intro: string; children: Child }) {
  return (
    <section class="topic" id={props.id}>
      <h2><img src={iconUrl(props.icon)} alt="" />{props.title}</h2>
      <p class="intro">{props.intro}</p>
      {props.children}
    </section>
  )
}

/** Índice: [id, icono, título, grupo] */
const TOPICS: [string, string, string, string][] = [
  ['inicio', 'exitIcon', 'Primeros pasos', 'Empezar'],
  ['dolar', 'settingsIcon', 'Dólar del día y configuración', 'Empezar'],
  ['facturacion', 'registerIcon', 'Facturación', 'Día a día'],
  ['cobro', 'checkIcon', 'Cobrar una factura', 'Día a día'],
  ['ventas', 'salesIcon', 'Ventas', 'Día a día'],
  ['cierre', 'closingIcon', 'Cierre de caja', 'Día a día'],
  ['inventario', 'inventoryIcon', 'Inventario', 'Productos'],
  ['ingresos', 'stockEntryIcon', 'Ingreso de mercancía', 'Productos'],
  ['cxc', 'debtIcon', 'Cuentas por cobrar', 'Clientes y créditos'],
  ['clientes', 'clientsIcon', 'Clientes', 'Clientes y créditos'],
  ['usuarios', 'usersIcon', 'Usuarios y permisos', 'Administración'],
  ['atajos', 'systemIcon', 'Atajos de teclado', 'Ayuda'],
  ['preguntas', 'billIcon', 'Preguntas frecuentes', 'Ayuda'],
]

function Toc() {
  let group = ''
  return (
    <nav class="toc" aria-label="Índice del manual">
      {TOPICS.map(([id, icon, title, g]) => {
        const head = g !== group ? <div class="g">{g}</div> : null
        group = g
        return <>{head}<a href={`#${id}`}><img src={iconUrl(icon)} alt="" />{title}</a></>
      })}
    </nav>
  )
}

export function ManualPage(props: { demoUrl: string | null }) {
  return (
    <html lang="es">
      <SiteHead title="Manual de usuario · UPK" description="Guía rápida de UPK: facturación, ventas, inventario, cuentas por cobrar y configuración." />
      <body>
        <header class="mtop">
          <div class="wrap">
            <button class="tocbtn" type="button" aria-label="Mostrar índice">☰ Índice</button>
            <a class="logo" href="/"><i>UPK</i>Manual</a>
            <label class="search">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" stroke-width="1.8"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
              <input id="manual-search" type="search" placeholder="Buscar en el manual… (ej. devolución, dólar, IMEI)" autocomplete="off" aria-label="Buscar en el manual" />
              <kbd>/</kbd>
            </label>
          </div>
        </header>

        <div class="mlayout">
          <Toc />
          <main class="mcontent">
            <div class="mhead">
              <h1>Manual de usuario</h1>
              <p>Lo esencial para trabajar con UPK todos los días. Usa el buscador o elige un tema.</p>
              <div class="cards">
                {TOPICS.slice(2, 9).filter(([id]) => id !== 'cobro' && id !== 'cierre').map(([id, icon, title]) => (
                  <a href={`#${id}`}><img src={iconUrl(icon)} alt="" />{title}</a>
                ))}
              </div>
              {props.demoUrl && <p>¿Quieres practicar sin miedo a equivocarte? Usa la <a href={props.demoUrl}>demo con datos de ejemplo</a>.</p>}
            </div>

            <Topic id="inicio" icon="exitIcon" title="Primeros pasos" intro="Cómo entrar al sistema y orientarte en la ventana principal.">
              <h3>Iniciar sesión</h3>
              <ol class="steps">
                <li>Abre UPK desde su acceso directo. El lanzador comprueba si hay una versión nueva y la instala sola antes de abrir.</li>
                <li>Escribe tu <b>Cédula</b> y tu <b>Contraseña</b> y pulsa <K>Enter</K> o la flecha azul.</li>
                <li>Si aparece un triángulo amarillo junto a la contraseña, tienes las mayúsculas activadas.</li>
              </ol>
              <Callout kind="warn" title="«Antes de ingresar el administrador debe actualizar el dólar»">
                Los usuarios normales no pueden entrar hasta que un administrador registre la tasa del día. Ver <a href="#dolar">Dólar del día</a>.
              </Callout>
              <h3>La ventana principal</h3>
              <p>Arriba está la barra de iconos; cada uno abre un menú. Las ventanas de trabajo se abren dentro del escritorio y puedes tener varias a la vez (por ejemplo Facturación y Ventas).</p>
              <div class="grid2">
                <div class="mini"><b><img src={iconUrl('registerIcon')} alt="" />Facturación</b><span>Nueva factura, cierre de caja.</span></div>
                <div class="mini"><b><img src={iconUrl('clientsIcon')} alt="" />Clientes</b><span>Registro y límites de crédito.</span></div>
                <div class="mini"><b><img src={iconUrl('usersIcon')} alt="" />Usuarios</b><span>Cuentas, roles y permisos.</span></div>
                <div class="mini"><b><img src={iconUrl('salesIcon')} alt="" />Ventas</b><span>Ventas realizadas y bancos.</span></div>
                <div class="mini"><b><img src={iconUrl('inventoryIcon')} alt="" />Inventario</b><span>Artículos y reporte de inventario.</span></div>
                <div class="mini"><b><img src={iconUrl('providersIcon')} alt="" />Proveedores</b><span>Datos de tus proveedores.</span></div>
                <div class="mini"><b><img src={iconUrl('settingsIcon')} alt="" />Configuración</b><span>Dólar, IVA, datos de factura, respaldo.</span></div>
                <div class="mini"><b><img src={iconUrl('dispatchIcon')} alt="" />Despacho y Sucursales</b><span>Sucursales y cuentas por cobrar.</span></div>
                <div class="mini"><b><img src={iconUrl('payablesIcon')} alt="" />Cuentas por pagar</b><span>Deudas con proveedores.</span></div>
                <div class="mini"><b><img src={iconUrl('exitIcon')} alt="" />Salir</b><span>Cambiar de usuario o cerrar.</span></div>
              </div>
              <p>En la barra inferior verás la <b>cuenta</b> con la que trabajas y su <b>rol</b> (administrador o normal).</p>
            </Topic>

            <Topic id="dolar" icon="settingsIcon" title="Dólar del día y configuración" intro="La tasa del dólar es la base de todos los precios en bolívares. Actualízala cada día antes de vender.">
              <ol class="steps">
                <li>Abre <Ui icon="settingsIcon">Configuración</Ui> → <Ui icon="systemIcon">Configuración del sistema</Ui> (solo administradores).</li>
                <li>En la pestaña <b>Generales</b>, escribe el nuevo valor en <b>Dólar de sistema</b>. Debajo verás cómo queda 1 $.</li>
                <li>Pulsa <Ui>Guardar</Ui>. Los productos marcados como <b>Relativo al dólar</b> recalculan su precio en bolívares al momento.</li>
              </ol>
              <h3>Otros datos de la pestaña Generales</h3>
              <ul>
                <li><b>Valor del impuesto</b>: el IVA en decimales (16 % se escribe <code>0.16</code>).</li>
                <li><b>Nombre para facturas, Dirección, Teléfono y Rif</b>: aparecen en la cabecera de cada factura.</li>
                <li><b>Información</b> e <b>Info factura</b>: textos libres que se imprimen en las facturas (por ejemplo, «Gracias por su compra»).</li>
                <li><b>Incentivos %</b>: porcentaje de bonificación sobre las ventas de los empleados.</li>
              </ul>
            </Topic>

            <Topic id="facturacion" icon="registerIcon" title="Facturación" intro="Crear una factura: elegir el cliente, agregar productos y cobrar.">
              <h3>Crear una factura</h3>
              <ol class="steps">
                <li>Abre <Ui icon="registerIcon">Facturación</Ui> → <Ui icon="addIcon">Nueva factura</Ui> (<K>Ctrl</K>+<K>N</K>).</li>
                <li><b>Cliente</b>: escribe la cédula o RIF y pulsa <K>Enter</K>. Si no existe, se abre <b>Registrar Cliente</b>: completa Nombre, Apellido e Identificación (V-, E- o J-) y acepta. Si dejas el campo vacío, la venta va al cliente genérico.</li>
                <li><b>Código</b>: escanea o escribe el código del producto y pulsa <K>Enter</K>. Con <b>Aumentar cantidad siempre en uno</b> marcado, cada lectura suma 1.</li>
                <li>¿No recuerdas el código? Pulsa el <Ui icon="addIcon">+</Ui> junto al campo: se abre la <b>Búsqueda</b>, donde puedes buscar por nombre o categoría y marcar <b>Solo disponible</b> para ver solo productos con existencia.</li>
                <li>Revisa los totales del panel oscuro (bolívares y dólares) y pulsa <Ui>Facturar</Ui> (<K>F12</K>) para cobrar.</li>
              </ol>
              <h3>Corregir la factura</h3>
              <ul>
                <li>Selecciona una fila y pulsa <Ui>Remover</Ui> para quitar ese producto.</li>
                <li><Ui>Cancelar factura</Ui> (<K>Ctrl</K>+<K>W</K>) vacía la factura para empezar otra.</li>
                <li><b>Repetir productos</b> permite que el mismo producto aparezca en varias líneas; desmarcado, suma en su línea.</li>
                <li><b>Precio alternativo</b> (<K>F1</K>) cobra con el precio 2 o 3 del producto.</li>
              </ul>
              <h3>Guardar una factura para después</h3>
              <p>Si el cliente aún no paga, pulsa <Ui>Guardar factura</Ui>. Para retomarla usa <Ui>facturas guardadas</Ui>, elige la factura y pulsa <Ui>Seleccionar</Ui>: vuelve a la pantalla y desaparece de la lista.</p>
              <Callout title="Formato de la factura">
                Antes de facturar elige <b>Bs.</b>, <b>$.</b> o <b>A4</b>. Con <b>Imprimir directo</b> se imprime sin mostrar la vista previa; la lupa azul muestra la última factura.
              </Callout>
            </Topic>

            <Topic id="cobro" icon="checkIcon" title="Cobrar una factura" intro="La ventana Pago acepta varios métodos a la vez y te dice cuánto falta.">
              <ol class="steps">
                <li>Escribe lo que entrega el cliente en cada método: <b>Dólar</b>, <b>Bs.</b> (efectivo), <b>biopago</b>, <b>Zelle</b> (con su referencia), <b>Dólar usdt</b>, <b>Punto de venta</b> o <b>Transferencias</b> (botón <Ui icon="addIcon">+</Ui>, una línea por banco).</li>
                <li>Mira <b>Dinero acumulado / faltante</b>: el número entre paréntesis es lo que falta (negativo) o sobra.</li>
                <li>Para cobrar el resto por punto, pulsa el <Ui icon="linkIcon">enlace</Ui>: completa el monto faltante automáticamente. Elige el punto y anota lote y referencia.</li>
                <li>Si das vuelto en bolívares, escríbelo en <b>Cambio Bs.</b></li>
                <li>Cuando el pago cubre el total se habilita el <Ui icon="checkIcon">botón verde</Ui>: púlsalo. Luego puedes ver o imprimir la factura.</li>
              </ol>
              <Callout kind="warn" title="Crédito y excepción de pago">
                <b>Credito</b> deja la venta como cuenta por cobrar (ver <a href="#cxc">Cuentas por cobrar</a>). <b>Excepción de pago</b> registra la venta aunque el pago no esté completo: úsala solo cuando el administrador lo autorice.
              </Callout>
            </Topic>

            <Topic id="ventas" icon="salesIcon" title="Ventas" intro="Consultar lo vendido, reimprimir facturas y hacer devoluciones.">
              <h3>Buscar ventas</h3>
              <ol class="steps">
                <li>Abre <Ui icon="salesIcon">Ventas</Ui> → <Ui icon="searchSaleIcon">Ventas</Ui>.</li>
                <li>En <b>Filtrar facturas</b> elige el <b>Rango de fechas</b> y, si quieres, el número, el cliente, el método de <b>Pagos</b> o el <b>Vendedor</b>.</li>
                <li>Pulsa <Ui>Buscar</Ui>. A la derecha verás el <b>Total en ventas</b>, la <b>Ganancia total</b>, el IVA, incentivos y comisiones.</li>
                <li>Haz clic en una venta para ver su <b>Detalle</b> (productos, subtotal, IVA, descuento y total).</li>
              </ol>
              <h3>Reimprimir</h3>
              <p>Con la venta seleccionada elige <b>B</b>, <b>$</b> o <b>A4</b> y pulsa <Ui>Imprimir</Ui>.</p>
              <h3>Pagos realizados</h3>
              <p>El icono <Ui icon="paymentsIcon">bolsa verde</Ui> muestra cómo se cobró cada venta y la suma por método (efectivo, dólares, punto, Zelle, transferencias…). Marca <b>Incluir Abonos</b> para sumar también los abonos de créditos.</p>
              <h3>Devolución de una venta</h3>
              <ol class="steps">
                <li>Selecciona la venta y pulsa la <Ui icon="trashIcon">papelera roja</Ui>, o clic derecho → <b>Hacer devolucion de la venta</b>.</li>
                <li>Confirma. Los productos regresan al inventario y la venta deja de contar en los totales.</li>
              </ol>
              <Callout kind="warn" title="Requiere autorización">Si tu usuario no tiene permiso para devoluciones, el sistema pide una clave de autorización.</Callout>
            </Topic>

            <Topic id="cierre" icon="closingIcon" title="Cierre de caja" intro="Resumen de lo cobrado en el día.">
              <ol class="steps">
                <li>Abre <Ui icon="registerIcon">Facturación</Ui> → <Ui icon="closingIcon">Cierre</Ui>.</li>
                <li>Busca el cierre por día y elige verlo en <b>Bs</b> o en <b>$</b>. Usa <b>Cierre detallado</b> para ver cada movimiento.</li>
              </ol>
              <Callout title="Los abonos no están en el cierre">El cierre no incluye los abonos de ventas a crédito; consúltalos en Ventas → Pagos realizados con «Incluir Abonos».</Callout>
            </Topic>

            <Topic id="inventario" icon="inventoryIcon" title="Inventario" intro="Productos, precios, categorías y existencias.">
              <h3>Lista de artículos</h3>
              <p>En <Ui icon="inventoryIcon">Inventario</Ui> → <Ui icon="productsIcon">Inventario</Ui>, pestaña <b>Lista</b>, busca por código, descripción o categoría. <b>Entero</b> muestra productos por unidad y <b>Decimal</b> los que se venden por peso.</p>
              <div class="grid2">
                <div class="mini" style="background:#ffecec"><b>Fila roja</b><span>Existencia igual o menor al stock mínimo.</span></div>
                <div class="mini" style="background:#fffbd6"><b>Fila amarilla</b><span>Existencia cerca del mínimo.</span></div>
              </div>
              <p>La barra derecha resume artículos, categorías, monto total del inventario, gasto y ganancia aproximada de la búsqueda actual.</p>
              <h3>Agregar o modificar un artículo</h3>
              <ol class="steps">
                <li>Pestaña <b>Agregar/Modificar</b>: escribe el <b>Código</b> y pulsa <Ui>Buscar</Ui>. Si existe, se carga para modificarlo; si no, puedes crearlo. (También puedes hacer doble clic en un artículo de la Lista.)</li>
                <li>Completa <b>Descripción</b>, <b>Categoría</b>, <b>Proveedor</b> y <b>Stock mínimo</b>.</li>
                <li>Escribe el <b>Costo</b> y hasta tres <b>Precios</b>, en Bs. o en $: el otro valor se calcula con la tasa del día. A la derecha verás la ganancia de cada precio.</li>
                <li>Marca <b>Relativo al dólar</b> para que el precio en Bs. siga a la tasa, y <b>Cobrar IVA</b> si el producto lleva impuesto.</li>
                <li>Pulsa <Ui>Guardar</Ui>.</li>
              </ol>
              <Callout title="El stock se cambia con Ingresos">
                El campo Stock está bloqueado para evitar errores. Lo recomendable es sumar mercancía desde <a href="#ingresos">Ingresos</a>; si de verdad necesitas corregirlo, usa el botón de desbloqueo junto al campo.
              </Callout>
              <h3>Teléfonos y equipos con serial</h3>
              <p>Marca <b>Contiene serial</b> y usa <Ui>Detalles</Ui> para ver los seriales e IMEI disponibles. Cada equipo se registra por separado (serial, IMEI 1 y 2, color y condición) y al venderlo queda marcado como vendido.</p>
              <h3>Categorías</h3>
              <p>En la pestaña <b>Categorias</b> escribe el nombre y pulsa <Ui>Agregar</Ui>; selecciona una para <Ui>Modificar</Ui> o <Ui>Eliminar</Ui>. No se admiten caracteres especiales.</p>
              <h3>Importar desde archivo</h3>
              <p>Para cargar muchos productos a la vez, usa <Ui>Importar desde archivo</Ui> con un CSV separado por punto y coma: <code>CODIGO ; NOMBRE ; STOCK ; COSTO ; PRECIO ; NOMBRE CATEGORIA</code>.</p>
            </Topic>

            <Topic id="ingresos" icon="stockEntryIcon" title="Ingreso de mercancía" intro="Sumar existencias cuando llega mercancía, con su costo.">
              <ol class="steps">
                <li>En Inventario abre la pestaña <b>Ingresos</b> y elige el <b>artículo a ingresar</b>.</li>
                <li>Escribe la <b>cantidad</b> y el <b>costo</b> (en dólares o bolívares). Verás el monto bruto y neto.</li>
                <li>Opcional: <b>Descontar avería</b> (porcentaje de pérdidas) o un descuento al gasto.</li>
                <li>Pulsa <Ui>Confirmar</Ui>. Para equipos con serial, se pide cada serial/IMEI.</li>
              </ol>
              <Callout title="Comprar a crédito al proveedor">
                Marca <b>Crear deuda</b> para guardar el ingreso como una deuda en dólares o bolívares: queda registrada y luego puede modificarse y pagarse. <b>Solo guardar</b> registra el ingreso sin aumentar el inventario.
              </Callout>
            </Topic>

            <Topic id="cxc" icon="debtIcon" title="Cuentas por cobrar" intro="Ventas a crédito, abonos y control de deudores.">
              <h3>Vender a crédito</h3>
              <ol class="steps">
                <li>El cliente debe tener <b>días</b> y <b>límite de crédito</b> (ver <a href="#clientes">Clientes</a>), y tu usuario el permiso <b>Crear créditos</b>.</li>
                <li>En la ventana Pago marca <b>Credito</b> y confirma. La venta queda como deuda del cliente.</li>
              </ol>
              <Callout kind="ok" title="Deudas en dólares">
                Las cuentas por cobrar se guardan en dólares: el monto en bolívares se calcula con la tasa del día en que el cliente paga.
              </Callout>
              <h3>Registrar un abono</h3>
              <ol class="steps">
                <li>Abre <Ui icon="dispatchIcon">Despacho y Sucursales</Ui> → <Ui icon="debtIcon">Cuentas por cobrar</Ui>.</li>
                <li>En <b>Lista de deudores</b> busca la cuenta (por sucursal, número o fechas; <b>Pendientes</b> muestra solo las no saldadas).</li>
                <li>Agrega el pago con su monto y referencia. El total abonado y lo que falta se actualizan al momento.</li>
              </ol>
              <p>Desde la misma ventana puedes <b>Combinar cuentas seleccionadas</b>, ver los <b>Detalles de las cuentas</b> e imprimir reportes de pagos y ganancias. Necesitas el permiso <b>Pagar créditos</b> para registrar abonos.</p>
            </Topic>

            <Topic id="clientes" icon="clientsIcon" title="Clientes" intro="Datos de tus clientes y sus condiciones de crédito.">
              <ol class="steps">
                <li>Abre <Ui icon="clientsIcon">Clientes</Ui> → <Ui icon="clientsIcon">Clientes</Ui> y pulsa <Ui>Nuevo</Ui> (o busca uno existente y pulsa <Ui>Modificar</Ui>).</li>
                <li>Completa los campos con <b>*</b>: nombre, identificación (V-, E- o J-), <b>días de crédito</b> y <b>límite de crédito</b> (en dólares).</li>
                <li>Pulsa <Ui>Guardar</Ui>. El <b>Saldo $</b> muestra el dinero a favor del cliente.</li>
              </ol>
              <p>También puedes registrar clientes al vuelo desde Facturación, escribiendo una cédula que no existe.</p>
            </Topic>

            <Topic id="usuarios" icon="usersIcon" title="Usuarios y permisos" intro="Quién puede entrar y qué puede hacer.">
              <ol class="steps">
                <li>Abre <Ui icon="usersIcon">Usuarios</Ui> → <Ui icon="userIcon">Usuarios</Ui> (solo administradores) y pulsa <Ui>Nuevo</Ui>.</li>
                <li>Completa nombre, <b>cédula</b> (será su usuario), <b>clave</b>, fecha de nacimiento y <b>Rol</b>.</li>
                <li>Marca los permisos <b>Crear créditos</b> y <b>Pagar créditos</b> si corresponde, deja <b>Habilitar</b> marcado y pulsa <Ui>Guardar</Ui>.</li>
              </ol>
              <div class="grid2">
                <div class="mini"><b>Administrador</b><span>Configuración, usuarios, devoluciones, precios y todo el sistema.</span></div>
                <div class="mini"><b>Normal</b><span>Facturar y consultar; las acciones sensibles piden clave de administrador.</span></div>
              </div>
              <p>Para impedir el acceso de alguien sin borrar su historial, desmarca <b>Habilitar</b>.</p>
            </Topic>

            <Topic id="atajos" icon="systemIcon" title="Atajos de teclado" intro="Trabaja más rápido en Facturación.">
              <table class="keys">
                <tbody>
                  <tr><td><K>Ctrl</K> + <K>N</K></td><td>Nueva factura</td></tr>
                  <tr><td><K>F12</K></td><td>Facturar (abrir la ventana de pago)</td></tr>
                  <tr><td><K>F1</K></td><td>Alternar precio alternativo</td></tr>
                  <tr><td><K>Ctrl</K> + <K>W</K></td><td>Cancelar la factura actual</td></tr>
                  <tr><td><K>Enter</K></td><td>En Cliente o Código: buscar y pasar al siguiente campo</td></tr>
                </tbody>
              </table>
            </Topic>

            <Topic id="preguntas" icon="billIcon" title="Preguntas frecuentes" intro="Soluciones rápidas a lo más consultado.">
              <details class="faq"><summary>No puedo entrar: dice que el administrador debe actualizar el dólar</summary>
                <p>Un administrador debe entrar y guardar el dólar del día en Configuración del sistema. Después, los demás usuarios pueden ingresar.</p></details>
              <details class="faq"><summary>Olvidé mi contraseña</summary>
                <p>Pide a un administrador que la cambie desde Usuarios. «¿Olvidaste tu contraseña?» solo funciona si tienes preguntas de seguridad registradas.</p></details>
              <details class="faq"><summary>¿Por qué cambió el precio en bolívares de un producto?</summary>
                <p>Porque es <b>Relativo al dólar</b>: su precio en Bs. se recalcula cada vez que se actualiza la tasa. Desmarca esa opción para que tenga un precio fijo en bolívares.</p></details>
              <details class="faq"><summary>¿Cómo anulo una venta?</summary>
                <p>Con una devolución desde Ventas (papelera roja). El inventario se restituye automáticamente.</p></details>
              <details class="faq"><summary>El botón verde de la ventana Pago no se activa</summary>
                <p>El pago todavía no cubre el total. Revisa «Dinero acumulado / faltante» o usa el botón de enlace para completar el resto por punto de venta.</p></details>
              <details class="faq"><summary>Un producto aparece en rojo en la lista</summary>
                <p>Su existencia llegó al stock mínimo. Registra un ingreso de mercancía o ajusta el stock mínimo del artículo.</p></details>
              <details class="faq"><summary>¿Cómo se actualiza el programa?</summary>
                <p>Solo: al abrir UPK, el lanzador busca la versión publicada para tu negocio, la descarga, verifica su firma y la instala. No necesitas hacer nada.</p></details>
            </Topic>

            <div class="noresults">No encontramos ese tema. Prueba con otra palabra (por ejemplo «pago», «stock» o «crédito»).</div>
          </main>
        </div>
        <script src={`/site/site.js?v=${SITE_ASSET_VERSION}`} defer></script>
      </body>
    </html>
  )
}
