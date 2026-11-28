// JavaScript del sitio público, servido en /site/site.js (sin dependencias).
// - Escenas animadas de la presentación: cursor que se mueve, hace clic y escribe sobre maquetas de UPK.
// - Manual: búsqueda, índice activo según el scroll y menú en móviles.
// Nota: este archivo es un template literal de TS; el código JS evita las comillas invertidas.
export const SITE_SCRIPT = `
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= Utilidades ================= */
  function fmt(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** Las maquetas se diseñan a 600 px; en pantallas estrechas se reducen con zoom (las coordenadas se compensan). */
  var DESIGN_WIDTH = 600;
  function zoomOf(screen) { return parseFloat(screen.style.zoom) || 1; }
  function fitScreens() {
    document.querySelectorAll('.screen[data-scene]').forEach(function (s) {
      var w = s.parentElement.clientWidth - 20;
      if (w < DESIGN_WIDTH) { s.style.width = DESIGN_WIDTH + 'px'; s.style.zoom = String(w / DESIGN_WIDTH); }
      else { s.style.width = ''; s.style.zoom = ''; }
    });
  }

  /** Crea el contexto de una escena: helpers que respetan la cancelación (cuando sale de la vista). */
  function makeCtx(screen, token) {
    var cursor = screen.querySelector('.cursor');
    var pos = { x: screen.clientWidth * 0.6, y: screen.clientHeight * 0.75 };
    function alive() { if (token.stop) throw new Error('stop'); }
    function el(k) { return screen.querySelector('[data-k="' + k + '"]'); }
    function place() { cursor.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)'; }
    place();
    var ctx = {
      el: el,
      wait: function (ms) { alive(); return sleep(ms).then(alive); },
      move: function (target, dx, dy) {
        alive();
        var t = typeof target === 'string' ? el(target) : target;
        var r = t.getBoundingClientRect(), s = screen.getBoundingClientRect(), z = zoomOf(screen);
        pos = { x: (r.left - s.left + r.width * (dx == null ? 0.5 : dx)) / z, y: (r.top - s.top + r.height * (dy == null ? 0.55 : dy)) / z };
        place();
        return ctx.wait(560);
      },
      click: function (target, dx, dy) {
        return ctx.move(target, dx, dy).then(function () {
          var rp = document.createElement('span');
          rp.className = 'ripple'; rp.style.left = pos.x + 'px'; rp.style.top = pos.y + 'px';
          screen.appendChild(rp); setTimeout(function () { rp.remove(); }, 600);
          var t = typeof target === 'string' ? el(target) : target;
          if (t.classList.contains('ubtn')) { t.classList.add('press'); setTimeout(function () { t.classList.remove('press'); }, 160); }
          return ctx.wait(180);
        });
      },
      /** Escribe en un campo simulado letra a letra (rápido, como en un video acelerado). */
      type: function (k, text, speed) {
        var f = el(k);
        screen.querySelectorAll('.fld.focus').forEach(function (x) { x.classList.remove('focus'); });
        f.classList.add('focus');
        var i = 0;
        function step() {
          alive();
          f.innerHTML = '';
          f.appendChild(document.createTextNode(text.slice(0, i)));
          var c = document.createElement('span'); c.className = 'caret'; f.appendChild(c);
          if (i++ < text.length) return sleep(speed || 70).then(step);
          return ctx.wait(220);
        }
        return step();
      },
      blur: function () { screen.querySelectorAll('.fld.focus').forEach(function (x) { x.classList.remove('focus'); var c = x.querySelector('.caret'); if (c) c.remove(); }); },
      /** Cuenta un número hasta su valor final (con un pequeño "salto" exagerado al terminar). */
      count: function (target, from, to, fmtFn, ms) {
        var node = typeof target === 'string' ? el(target) : target;
        var start = performance.now(), dur = ms || 700;
        return new Promise(function (resolve) {
          function frame(now) {
            if (token.stop) return resolve();
            var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
            node.textContent = fmtFn(from + (to - from) * e);
            if (p < 1) requestAnimationFrame(frame);
            else { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); resolve(); }
          }
          requestAnimationFrame(frame);
        });
      },
      addRow: function (k, cells, extraClass) {
        var tbl = el(k), cols = tbl.getAttribute('data-cols');
        var row = document.createElement('div');
        row.className = 'tr new' + (extraClass ? ' ' + extraClass : '');
        row.style.gridTemplateColumns = cols;
        cells.forEach(function (c) { var s = document.createElement('span'); s.textContent = c; s.style.overflow = 'hidden'; s.style.textOverflow = 'ellipsis'; row.appendChild(s); });
        tbl.appendChild(row);
        return row;
      },
      confetti: function (target) {
        var t = typeof target === 'string' ? el(target) : target;
        var r = t.getBoundingClientRect(), s = screen.getBoundingClientRect(), z = zoomOf(screen);
        var colors = ['#228be6', '#00e676', '#ffd43b', '#ff6b6b', '#845ef7'];
        for (var i = 0; i < 26; i++) {
          var c = document.createElement('i'); c.className = 'confetti';
          c.style.left = ((r.left - s.left + r.width / 2) / z) + 'px'; c.style.top = ((r.top - s.top + r.height / 2) / z) + 'px';
          c.style.background = colors[i % colors.length];
          c.style.setProperty('--dx', (Math.random() * 220 - 110) + 'px');
          c.style.setProperty('--dy', (Math.random() * -160 - 20) + 'px');
          screen.appendChild(c); (function (n) { setTimeout(function () { n.remove(); }, 1200); })(c);
        }
      },
      toast: function (html) {
        var t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html;
        screen.appendChild(t); setTimeout(function () { t.remove(); }, 1900);
        return ctx.wait(1700);
      }
    };
    return ctx;
  }

  /* ================= Escenas ================= */
  var SCENES = {};

  // Portada: menús de la barra y panel del día que se llena
  SCENES.hero = {
    setup: function (s) {
      s.querySelectorAll('.tbl .tr').forEach(function (r) { r.remove(); });
      ['hVentas', 'hFacturas', 'hGanancia'].forEach(function (k) { s.querySelector('[data-k="' + k + '"]').textContent = '0'; });
      s.querySelectorAll('.menu-pop').forEach(function (m) { m.remove(); });
    },
    run: async function (c, s) {
      var menus = [['tb-registerIcon', [['addIcon', 'Nueva factura'], ['closingIcon', 'Cierre']]],
        ['tb-salesIcon', [['searchSaleIcon', 'Ventas'], ['paymentsIcon', 'Bancos']]],
        ['tb-inventoryIcon', [['productsIcon', 'Inventario'], ['stockEntryIcon', 'Reporte de inventario']]]];
      for (var m = 0; m < menus.length; m++) {
        var icon = c.el(menus[m][0]);
        await c.click(icon);
        icon.classList.add('on');
        var pop = document.createElement('div'); pop.className = 'menu-pop';
        var r = icon.getBoundingClientRect(), sr = s.getBoundingClientRect();
        pop.style.left = ((r.left - sr.left) / zoomOf(s)) + 'px'; pop.style.top = ((r.bottom - sr.top) / zoomOf(s)) + 'px';
        menus[m][1].forEach(function (it, i) {
          var d = document.createElement('div'); if (i === 0) d.className = 'hl';
          var im = document.createElement('img'); im.src = '/site/img/' + it[0] + '.png'; d.appendChild(im);
          d.appendChild(document.createTextNode(it[1])); pop.appendChild(d);
        });
        s.appendChild(pop);
        await c.move(pop.firstChild, 0.4);
        await c.wait(500);
        pop.remove(); icon.classList.remove('on');
      }
      var clientes = ['MARÍA PÉREZ', 'COMERCIAL EJEMPLO', 'JOSÉ RAMÍREZ', 'CLIENTE GENÉRICO', 'INVERSIONES DEMO'];
      var total = 0, gan = 0;
      for (var i = 0; i < 5; i++) {
        var t = [18.5, 42, 9.9, 125, 64][i];
        c.addRow('hRows', [String(i + 1).padStart(2, '0'), '0001' + (24 + i), clientes[i], fmt(t) + ' $']);
        c.count('hVentas', total, total + t, function (v) { return fmt(v) + ' $'; }, 500);
        c.el('hFacturas').textContent = String(i + 1);
        c.count('hGanancia', gan, gan + t * 0.32, function (v) { return fmt(v) + ' $'; }, 500);
        total += t; gan += t * 0.32;
        await c.wait(650);
      }
      await c.wait(2200);
    }
  };

  // Facturación: cliente, productos, cobro mixto y factura registrada
  SCENES.billing = {
    setup: function (s) {
      s.querySelectorAll('[data-k="items"] .tr').forEach(function (r) { r.remove(); });
      ['cliente', 'codigo', 'pDolar', 'pPunto', 'pDolarBs'].forEach(function (k) { s.querySelector('[data-k="' + k + '"]').textContent = ''; });
      s.querySelector('[data-k="clienteBox"]').innerHTML = '<div class="sk" style="width:70%"></div><div class="sk" style="width:45%;margin-top:5px"></div>';
      s.querySelector('[data-k="totUsd"]').textContent = '0.00 $.';
      s.querySelector('[data-k="totBs"]').textContent = '0.00 Bs.';
      s.querySelector('[data-k="pAcum"]').textContent = '0.00 Bs.';
      s.querySelector('[data-k="pAcum"]').style.color = '';
      s.querySelector('[data-k="pOk"]').style.opacity = '.45';
      s.querySelector('[data-k="pago"]').hidden = true;
    },
    run: async function (c) {
      var tasa = 40;
      await c.click('cliente');
      await c.type('cliente', '12345678');
      c.blur();
      c.el('clienteBox').innerHTML = '<b>(V) MARÍA PÉREZ</b><br>0414-1111111<br>Caracas';
      c.el('clienteBox').classList.add('flash');
      await c.wait(300);
      c.el('clienteBox').classList.remove('flash');
      var prods = [['PWB02', 'POWER BANK 20000MAH 22.5W', 25], ['CAB01', 'CABLE USB-C A USB-C 1M', 2.5], ['AUD01', 'AUDIFONOS INALAMBRICOS BT', 12]];
      var usd = 0;
      await c.click('codigo');
      for (var i = 0; i < prods.length; i++) {
        await c.type('codigo', prods[i][0], 60);
        var p = prods[i][2];
        c.addRow('items', [String(i + 1).padStart(2, '0'), prods[i][0], prods[i][1], fmt(p * tasa) + ' Bs.', '1', fmt(p * tasa) + ' Bs.']);
        c.count('totUsd', usd, usd + p, function (v) { return fmt(v) + ' $.'; }, 550);
        c.count('totBs', usd * tasa, (usd + p) * tasa, function (v) { return fmt(v) + ' Bs.'; }, 550);
        usd += p;
        c.el('codigo').textContent = '';
        await c.wait(450);
      }
      c.blur();
      await c.click('facturar');
      c.el('pago').hidden = false;
      await c.wait(400);
      var total = usd * tasa;
      await c.click('pDolar');
      await c.type('pDolar', '20');
      c.el('pDolarBs').textContent = '(' + fmt(20 * tasa) + ' Bs.)';
      c.el('pAcum').textContent = fmt(20 * tasa) + ' Bs.  (' + fmt(20 * tasa - total) + ')';
      c.blur();
      await c.click('pLink');
      c.el('pPunto').textContent = fmt(total - 20 * tasa);
      c.el('pPunto').classList.add('flash');
      await c.count('pAcum', 20 * tasa, total, function (v) { return fmt(v) + ' Bs.  (' + fmt(v - total) + ')'; }, 600);
      c.el('pAcum').style.color = '#2b8a3e';
      c.el('pOk').style.opacity = '1';
      await c.click('pOk');
      c.el('pago').hidden = true;
      c.confetti('facturar');
      await c.toast('<i>✔</i> Venta #000125 registrada');
      await c.wait(900);
    }
  };

  // Ventas: búsqueda por fecha, totales, detalle y pagos por método
  SCENES.sales = {
    setup: function (s) {
      s.querySelectorAll('[data-k="sRows"] .tr,[data-k="sItems"] .tr').forEach(function (r) { r.remove(); });
      ['sFecha', 'sTotal', 'sGan', 'sRes'].forEach(function (k) { s.querySelector('[data-k="' + k + '"]').textContent = ''; });
      s.querySelector('[data-k="sDet"]').innerHTML = '<div class="sk" style="width:80%"></div><div class="sk" style="width:60%;margin-top:4px"></div>';
      s.querySelector('[data-k="sPagos"]').hidden = true;
      ['pe', 'pp', 'pd', 'pz'].forEach(function (k) { s.querySelector('[data-k="' + k + '"]').textContent = '0'; s.querySelector('[data-k="' + k + 'Bar"]').style.width = '0'; });
    },
    run: async function (c) {
      await c.click('sFecha');
      await c.type('sFecha', '28 nov. 2026', 45);
      c.blur();
      await c.click('sBuscar');
      var ventas = [['000120', 'ANA', 'V-12345678', 640], ['000121', 'LUIS', 'J-300000001', 1880], ['000122', 'ANA', 'V-20456789', 396],
        ['000123', 'ANA', 'V-1', 5000], ['000124', 'LUIS', 'V-18222333', 2560], ['000125', 'ANA', 'V-12345678', 1580]];
      var rows = [];
      for (var i = 0; i < ventas.length; i++) {
        var v = ventas[i];
        rows.push(c.addRow('sRows', [String(i + 1).padStart(2, '0'), v[0], v[1], v[2], fmt(v[3]) + ' Bs.']));
        await c.wait(130);
      }
      c.el('sRes').textContent = 'Resultados: 6 | Tasa prom: 40.00';
      c.count('sTotal', 0, 12056, function (x) { return fmt(x) + ' Bs.'; }, 900);
      await c.count('sGan', 0, 3617, function (x) { return fmt(x) + ' Bs.'; }, 900);
      await c.click(rows[4], 0.4);
      rows[4].classList.add('sel');
      c.el('sDet').innerHTML = 'Subtotal 2,560.00 Bs.<br>Total <b>2,560.00 Bs.</b> (64.00 $)';
      c.addRow('sItems', ['01', 'PWB02', 'POWER BANK 20000MAH', '2,000.00']);
      c.addRow('sItems', ['02', 'AUD01', 'AUDIFONOS BT', '560.00']);
      await c.wait(500);
      await c.click('sPagosBtn');
      c.el('sPagos').hidden = false;
      var pagos = [['pe', 1450, 18], ['pp', 6206, 70], ['pd', 3600, 42], ['pz', 800, 12]];
      for (var j = 0; j < pagos.length; j++) {
        c.el(pagos[j][0] + 'Bar').style.width = pagos[j][2] + '%';
        await c.count(pagos[j][0], 0, pagos[j][1], fmt, 420);
      }
      await c.wait(2200);
    }
  };

  // Inventario: búsqueda que filtra, cambio de tasa que recalcula precios y alerta de stock
  SCENES.inventory = {
    setup: function (s) {
      s.querySelector('[data-k="iBuscar"]').textContent = '';
      s.querySelector('[data-k="iTasa"]').textContent = '40.00';
      s.querySelector('[data-k="iPop"]').hidden = true;
      s.querySelector('[data-k="iTasaFld"]').textContent = '';
      s.querySelectorAll('[data-k="iRows"] .tr').forEach(function (r, i) {
        r.style.display = '';
        var usd = Number(r.getAttribute('data-usd'));
        r.querySelector('[data-price]').textContent = fmt(usd * 40) + ' Bs. (' + usd + ' $)';
        var st = [18, 12, 2, 5, 40, 3, 10][i];
        r.querySelector('[data-stock]').textContent = String(st);
        r.className = 'tr' + (st <= 2 ? ' red' : st <= 4 ? ' yel' : '');
      });
    },
    run: async function (c, s) {
      var rows = Array.prototype.slice.call(s.querySelectorAll('[data-k="iRows"] .tr'));
      await c.click('iBuscar');
      var q = 'cargador';
      for (var i = 1; i <= q.length; i++) {
        await c.type('iBuscar', q.slice(0, i), 1);
        var t = q.slice(0, i);
        rows.forEach(function (r) { r.style.display = r.getAttribute('data-text').indexOf(t) >= 0 ? '' : 'none'; });
      }
      await c.wait(900);
      c.el('iBuscar').textContent = '';
      rows.forEach(function (r) { r.style.display = ''; });
      c.blur();
      await c.click('iDolarBtn');
      c.el('iPop').hidden = false;
      await c.wait(300);
      await c.click('iTasaFld');
      await c.type('iTasaFld', '45.00');
      await c.click('iGuardar');
      c.el('iPop').hidden = true;
      c.blur();
      c.el('iTasa').textContent = '45.00';
      c.el('iTasa').classList.add('bump');
      rows.forEach(function (r, k) {
        var usd = Number(r.getAttribute('data-usd')), cell = r.querySelector('[data-price]');
        setTimeout(function () {
          r.classList.add('flash');
          c.count(cell, usd * 40, usd * 45, function (v) { return fmt(v) + ' Bs. (' + usd + ' $)'; }, 600);
        }, k * 90);
      });
      await c.wait(1500);
      rows.forEach(function (r) { r.classList.remove('flash'); });
      // Se vende un cargador: el stock baja y la fila pasa a rojo
      var r6 = rows[5], st = r6.querySelector('[data-stock]');
      await c.move(r6, 0.55);
      st.textContent = '2'; st.classList.add('bump');
      r6.className = 'tr red';
      await c.toast('⚠ Stock bajo: CAR03');
      await c.wait(600);
    }
  };

  // Cuentas por cobrar: abono que completa una deuda
  SCENES.receivables = {
    setup: function (s) {
      var tot = 0;
      s.querySelectorAll('[data-k="cRows"] .tr').forEach(function (r) {
        var d = Number(r.getAttribute('data-debt')), p = Number(r.getAttribute('data-paid'));
        r.classList.remove('sel');
        r.querySelector('[data-paid-txt]').textContent = fmt(p);
        r.querySelector('.bar').classList.remove('done');
        r.querySelector('.bar i').style.width = Math.round(p / d * 100) + '%';
        r.querySelector('.tagu').className = 'tagu'; r.querySelector('.tagu').textContent = 'Pendiente';
        tot += d - p;
      });
      s.querySelector('[data-k="cTotal"]').textContent = fmt(tot) + ' $';
      s.querySelector('[data-k="cPop"]').hidden = true;
      ['cMonto', 'cRef'].forEach(function (k) { s.querySelector('[data-k="' + k + '"]').textContent = ''; });
    },
    run: async function (c, s) {
      var rows = s.querySelectorAll('[data-k="cRows"] .tr');
      var row = rows[3];
      await c.click(row, 0.3);
      row.classList.add('sel');
      await c.click('cAbonar');
      c.el('cPop').hidden = false;
      await c.wait(300);
      await c.click('cMonto');
      await c.type('cMonto', '60.00');
      await c.click('cRef');
      await c.type('cRef', '00154872', 50);
      await c.click('cOk');
      c.el('cPop').hidden = true;
      c.blur();
      row.classList.remove('sel');
      var bar = row.querySelector('.bar'), tag = row.querySelector('.tagu');
      bar.querySelector('i').style.width = '100%';
      c.count(row.querySelector('[data-paid-txt]'), 200, 260, fmt, 800);
      var tot = 0; rows.forEach(function (r) { tot += Number(r.getAttribute('data-debt')) - Number(r.getAttribute('data-paid')); });
      await c.count('cTotal', tot, tot - 60, function (v) { return fmt(v) + ' $'; }, 800);
      bar.classList.add('done');
      tag.className = 'tagu ok bump'; tag.textContent = 'Pagada';
      c.confetti(tag);
      await c.toast('<i>✔</i> Cuenta saldada');
      await c.wait(900);
    }
  };

  /* Ejecuta cada escena en bucle mientras es visible; se detiene al salir de pantalla. */
  function startScenes() {
    var screens = document.querySelectorAll('.screen[data-scene]');
    if (!screens.length) return;
    screens.forEach(function (s) {
      var scene = SCENES[s.getAttribute('data-scene')];
      if (!scene) return;
      var token = null;
      async function loop(tk) {
        while (!tk.stop) {
          scene.setup(s);
          try { await scene.run(makeCtx(s, tk), s); } catch (e) { if (e && e.message !== 'stop') console.error(e); }
          if (!tk.stop) await sleep(700);
        }
      }
      if (reduce) { scene.setup(s); s.querySelector('.cursor').style.display = 'none'; return; }
      if (!('IntersectionObserver' in window)) { loop({ stop: false }); return; }
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && !token) { token = { stop: false }; loop(token); }
          else if (!en.isIntersecting && token) { token.stop = true; token = null; }
        });
      }, { threshold: 0.35 }).observe(s);
    });
  }

  /* ================= Manual ================= */
  function startManual() {
    var input = document.getElementById('manual-search');
    if (!input) return;
    var topics = Array.prototype.slice.call(document.querySelectorAll('.topic'));
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
    var empty = document.querySelector('.noresults');
    var originals = new Map();
    topics.forEach(function (t) { originals.set(t, t.innerHTML); });

    function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); }

    function highlight(node, q) {
      var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
      var hits = [], n;
      while ((n = walker.nextNode())) { if (norm(n.nodeValue).indexOf(q) >= 0) hits.push(n); }
      hits.forEach(function (tn) {
        var i = norm(tn.nodeValue).indexOf(q);
        var after = tn.splitText(i); after.splitText(q.length);
        var m = document.createElement('mark'); m.textContent = after.nodeValue; after.parentNode.replaceChild(m, after);
      });
    }

    function search() {
      var q = norm(input.value.trim());
      var visible = 0;
      topics.forEach(function (t) {
        t.innerHTML = originals.get(t);
        var match = !q || norm(t.textContent).indexOf(q) >= 0;
        t.classList.toggle('hide', !match);
        if (match) { visible++; if (q.length > 1) { highlight(t, q); t.querySelectorAll('details').forEach(function (d) { if (d.querySelector('mark')) d.open = true; }); } }
      });
      links.forEach(function (a) {
        var t = document.querySelector(a.getAttribute('href'));
        a.classList.toggle('hide', !!(t && t.classList.contains('hide')));
      });
      // Títulos de grupo del índice sin temas visibles
      document.querySelectorAll('.toc .g').forEach(function (g) {
        var n = g.nextElementSibling, any = false;
        while (n && !n.classList.contains('g')) { if (!n.classList.contains('hide')) any = true; n = n.nextElementSibling; }
        g.style.display = any ? '' : 'none';
      });
      if (empty) empty.style.display = visible ? 'none' : 'block';
    }
    input.addEventListener('input', search);
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
      if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; search(); input.blur(); }
    });

    // Índice activo según la sección visible
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id); });
        });
      }, { rootMargin: '-80px 0px -70% 0px' });
      topics.forEach(function (t) { io.observe(t); });
    }

    // Menú del índice en pantallas pequeñas
    var btn = document.querySelector('.tocbtn'), toc = document.querySelector('.toc');
    if (btn && toc) {
      btn.addEventListener('click', function () { toc.classList.toggle('open'); });
      toc.addEventListener('click', function (e) { if (e.target.closest('a')) toc.classList.remove('open'); });
    }
  }

  function init() { fitScreens(); window.addEventListener('resize', fitScreens); startScenes(); startManual(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
`
