/* NexusPro — Precios de referencia MAGA
   Serie mensual de precios mayoristas del Ministerio de Agricultura (datos
   abiertos), desde 1998, mercados La Terminal / CENMA / 21 Calle.

   Para qué sirve: comparar el precio de hoy contra la propia historia del
   producto. No predice nada — con 12 datos por año y sin clima ni
   importaciones en la serie, pronosticar sería inventar. Lo que sí es un
   hecho medible es si está caro o barato respecto de lo que ha valido.

   Fase 1: catálogo + ficha con la serie histórica y el precio actual.
   La estacionalidad y las ventanas de compra/venta van en la fase 2. */
Modulos.precios_maga = {
  _prods: [], _cat: '', _busca: '', _sel: null, _serie: [], _mercado: '', _anios: 5,

  _CATS: { fruta:'🍉 Frutas', grano:'🌾 Granos', hortaliza:'🥬 Hortalizas', otro:'📦 Otros' },
  _MESES: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
  _vista: 'ventanas', _estac: null, _estacAnios: null,

  /* ═══════════ ESTACIONALIDAD ═══════════
     El índice dice cuánto vale cada mes respecto del promedio de su año
     (100 = promedio). Lo importante no es solo la brecha entre el mes más caro
     y el más barato, sino cuánto se repite: un patrón con mucha dispersión
     entre años es ruido disfrazado de señal, y decirlo es parte del trabajo.
     Medido sobre la serie real: mango 94%, papa 52%, sandía 36%… y frijol 13%,
     porque lo almacenable no tiene ventana: todos pueden esperar. */
  _MIN_BRECHA: 20,      // debajo de esto no hay negocio que perseguir
  _MAX_DISPERSION: 30,  // arriba de esto el patrón no se repite lo suficiente

  async _cargarEstac() {
    if (this._estac && this._estacAnios === this._anios) return this._estac;
    const filas = await DB.getMagaEstacionalidad(this._anios || 5);
    const porProd = {};
    filas.forEach(f => {
      (porProd[f.producto_id] ||= {})[f.mes] = { i: Number(f.indice), n: f.anios, d: Number(f.dispersion) };
    });
    this._estac = porProd;
    this._estacAnios = this._anios;
    return porProd;
  },

  /* Resume el patrón de un producto: ventanas, brecha y qué tan confiable es. */
  _resumen(meses) {
    if (!meses) return null;
    const ent = Object.entries(meses).map(([m, v]) => ({ mes: +m, ...v }));
    /* Con menos de 6 meses los 3 más baratos y los 3 más caros se traslapan y el
       consejo sale contradictorio ("comprá y vendé en julio"). Le pasa al durazno,
       que solo tiene 4 meses con dato. Con 6 ya son conjuntos disjuntos, y así no
       se pierde el mango (7 meses y 94% de brecha, de las señales más fuertes). */
    if (ent.length < 6) return null;
    const orden = [...ent].sort((a, b) => a.i - b.i);
    const brecha = (orden[orden.length - 1].i / orden[0].i - 1) * 100;
    const disp = ent.reduce((s, x) => s + x.d, 0) / ent.length;
    const baratos = orden.slice(0, 3).map(x => x.mes);
    const caros = orden.slice(-3).reverse().map(x => x.mes);
    let fuerza, nota;
    if (brecha < this._MIN_BRECHA) {
      fuerza = 'ninguna';
      nota = 'El precio casi no cambia con la temporada: no hay ventana que aprovechar.';
    } else if (disp > this._MAX_DISPERSION) {
      fuerza = 'debil';
      nota = 'El patrón existe pero cambia mucho de un año a otro: tomarlo como pista, no como plan.';
    } else {
      fuerza = brecha >= 35 ? 'fuerte' : 'moderada';
      nota = 'El patrón se repite con regularidad entre años.';
    }
    return { meses: ent, brecha, disp, baratos, caros, fuerza, nota };
  },

  _mesActual() { return new Date().getMonth() + 1; },

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    if (!this._prods.length) this._prods = await DB.getMagaProductos();
    await Promise.all([this._cargarEstac(), this._cargarSeguidos()]);

    const vistas = `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button class="btn btn-sm ${this._vista==='hoy'?'btn-cyan':'btn-ghost'}" onclick="Modulos.precios_maga._irVista('hoy')">📬 Oportunidades de hoy</button>
      <button class="btn btn-sm ${this._vista==='ventanas'?'btn-cyan':'btn-ghost'}" onclick="Modulos.precios_maga._irVista('ventanas')">🎯 Ventanas de este mes</button>
      <button class="btn btn-sm ${this._vista==='explorar'?'btn-cyan':'btn-ghost'}" onclick="Modulos.precios_maga._irVista('explorar')">🔍 Explorar productos</button>
    </div>`;

    if (this._vista === 'hoy') {
      const [ops, cfg, vs] = await Promise.all([DB.getOportunidadesMaga(), DB.getReporteMagaCfg(), DB.getMercadoVsMayoreo()]);
      el.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">📈 Precios de referencia (MAGA)</h1>
            <p class="page-subtitle">// Precios diarios de La Terminal y el CENMA${ops[0]?.fecha ? ' · al ' + UI.fecha(ops[0].fecha) : ''}</p>
          </div>
        </div>
        <div class="page-body">
          ${Modulos.venta_granos?._tabsHTML ? Modulos.venta_granos._tabsHTML() : ''}
          ${vistas}
          ${this._configCorreoHTML(cfg)}
          ${this._oportunidadesHTML(ops)}
          ${this._vsMenudeoHTML(vs)}
        </div>`;
      return;
    }

    if (this._vista === 'ventanas') {
      el.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">📈 Precios de referencia (MAGA)</h1>
            <p class="page-subtitle">// Estacionalidad sobre ${this._anios || 5} años · ${this._prods.length} productos</p>
          </div>
        </div>
        <div class="page-body">
          ${Modulos.venta_granos?._tabsHTML ? Modulos.venta_granos._tabsHTML() : ''}
          ${vistas}
          ${this._ventanasHTML()}
          ${this._calendarioHTML()}
        </div>`;
      return;
    }

    const filtrados = this._filtrar();
    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📈 Precios de referencia (MAGA)</h1>
          <p class="page-subtitle">// Precio mayorista mensual desde 1998 · ${this._prods.length} productos</p>
        </div>
      </div>
      <div class="page-body">
        ${Modulos.venta_granos?._tabsHTML ? Modulos.venta_granos._tabsHTML() : ''}
        ${vistas}
        <div class="card" style="padding:12px;margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="form-input" id="maga-busca" placeholder="Buscar producto: sandía, frijol, tomate..."
                 style="flex:2;min-width:220px" value="${UI.esc(this._busca)}"
                 oninput="Modulos.precios_maga._busca=this.value;Modulos.precios_maga._repintarLista()">
          <select class="form-select" style="width:190px"
                  onchange="Modulos.precios_maga._cat=this.value;Modulos.precios_maga._repintarLista()">
            <option value="">Todas las categorías</option>
            ${Object.entries(this._CATS).map(([k,l]) =>
              `<option value="${k}" ${k===this._cat?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:12px;align-items:start" class="maga-layout">
          <div class="card" style="padding:0;max-height:70vh;overflow:auto">
            <div id="maga-lista">${this._listaHTML(filtrados)}</div>
          </div>
          <div id="maga-ficha">${this._vacioHTML()}</div>
        </div>
      </div>
      <style>
        .maga-item{padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer}
        .maga-item:hover{background:var(--surface2)}
        .maga-item.activo{background:var(--surface2);border-left:3px solid var(--green)}
        @media(max-width:820px){.maga-layout{grid-template-columns:1fr !important}}
      </style>`;
  },

  _irVista(v) { this._vista = v; this.render(); },

  /* ── OPORTUNIDADES DE HOY ─────────────────────────────
     Las mismas filas que manda el correo diario (misma RPC), para que la
     pantalla nunca contradiga al correo. */
  _oportunidadesHTML(ops) {
    if (!ops.length) return `<div class="card" style="padding:16px">
      Todavía no hay oportunidades para mostrar. Los precios diarios del MAGA entran cada mañana;
      si el ministerio no publicó, este espacio queda vacío hasta la siguiente actualización.</div>`;

    const q = n => 'Q' + Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const bloque = (titulo, color, tipo, texto) => {
      const lista = ops.filter(o => o.tipo === tipo);
      if (!lista.length) return '';
      return `<div class="card" style="padding:0;margin-bottom:12px">
        <div style="padding:10px 12px;font-weight:800;font-size:13px;color:${color};border-bottom:1px solid var(--border)">${titulo}</div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Producto</th><th>Mercado</th><th>Hoy</th><th>Referencia</th><th>Diferencia</th></tr></thead>
          <tbody>${lista.map(o => `<tr>
            <td><b>${UI.esc(o.producto)}</b>${this._seguidos.has(o.producto_id) ? ' ⭐' : ''}
                <div style="font-size:11px;color:var(--text3)">${UI.esc(o.medida)}</div></td>
            <td>${UI.esc(o.mercado)}</td>
            <td><b>${q(o.precio)}</b></td>
            <td>${q(o.referencia)}<div style="font-size:11px;color:var(--text3)">${UI.esc(o.origen_ref)}</div></td>
            <td style="color:${color};font-weight:700">${Number(o.variacion) > 0 ? '+' : ''}${Number(o.variacion).toFixed(1)}%</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div style="padding:8px 12px;font-size:11px;color:var(--text3)">${texto}</div>
      </div>`;
    };

    return bloque('🟢 Más barato que de costumbre — conviene comprar', 'var(--green)', 'compra',
             'Comparado con su propio promedio reciente. "mensual" significa que la serie diaria aún es corta y se comparó con el histórico del mes.')
         + bloque('🔴 Más caro que de costumbre — conviene vender', 'var(--red)', 'venta',
             'Mismo criterio, al revés: hoy está por encima de lo que suele costar.')
         + bloque('🔵 Diferencia entre mercados — comprá donde está barato', 'var(--cyan)', 'brecha',
             'El mismo producto, el mismo día, en los dos mercados mayoristas. La columna Referencia es el precio del mercado caro.');
  },

  /* Mayoreo vs góndola. El margen es la razón de ser del negocio: si el
     quintal está a Q11.57/kg y el supermercado vende a Q19, ahí hay negocio.
     Se muestra de dónde salió cada precio para que se pueda verificar. */
  _vsMenudeoHTML(vs) {
    if (!vs?.length) return '';
    const q = n => 'Q' + Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<div class="card" style="padding:0;margin-bottom:12px">
      <div style="padding:10px 12px;font-weight:800;font-size:13px;border-bottom:1px solid var(--border)">
        🏪 Mayoreo contra supermercado
        <span style="font-weight:400;font-size:11px;color:var(--text3)">— precio por kilo, producto crudo y presentación de 1 kg o más</span>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Producto</th><th>Mayoreo (MAGA)</th><th>Góndola</th><th>Dónde</th><th>Diferencia</th></tr></thead>
        <tbody>${vs.map(v => `<tr>
          <td><b>${UI.esc(v.producto_maga)}</b><div style="font-size:11px;color:var(--text3)">${UI.esc(v.menudeo_nombre)}</div></td>
          <td>${q(v.mayoreo_kg)}<div style="font-size:11px;color:var(--text3)">${UI.fecha(v.fecha_mayoreo)}</div></td>
          <td>${q(v.menudeo_kg)}<div style="font-size:11px;color:var(--text3)">${UI.fecha(v.fecha_menudeo)}</div></td>
          <td style="font-size:12px">${UI.esc(v.fuente)}</td>
          <td style="font-weight:700;color:var(--green)">+${Number(v.margen_pct).toFixed(1)}%</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="padding:8px 12px;font-size:11px;color:var(--text3)">
        Sólo aparece lo que se pudo comparar de verdad: se descartan harinas, refritos y bolsas
        chicas, porque comparar un derivado o un empaque de 400 g contra el quintal da un margen
        que no existe.
      </div>
    </div>`;
  },

  /* Los precios de comparación se guardan POR KILO porque es la única unidad
     con la que se pueden poner en la misma tabla un quintal de mayoreo y una
     libra de supermercado. Pero en pantalla van por QUINTAL, que es como se
     negocia el grano acá: nadie cotiza maíz por kilo. */
  _porQuintal(precioKg) {
    const kg = (typeof convertirUnidad === 'function' ? convertirUnidad(1, 'quintal', 'kg') : 45.359237) || 45.359237;
    return (Number(precioKg) || 0) * kg;
  },

  /* Config del correo: es del CLIENTE que administra el negocio, no nuestra.
     Sólo la ve quien puede tocar configuración del comercio. */
  _configCorreoHTML(cfg) {
    const rol = Auth.user?.rol;
    if (!['admin', 'superadmin', 'gerente', 'gerente_fin'].includes(rol)) return '';
    const correo = cfg.email_reporte_maga || cfg.email || '';
    return `<div class="card" style="padding:12px;margin-bottom:12px;border-left:3px solid var(--cyan)">
      <div style="font-weight:800;font-size:13px;margin-bottom:6px">📬 Resumen diario por correo</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:10px">
        Cada mañana, después de que el MAGA publica, le llega este mismo listado al correo de quien
        administra el negocio. Se puede apagar cuando quieras.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px">
          <input type="checkbox" id="maga-rep-activo" ${cfg.reporte_maga_diario ? 'checked' : ''}> Recibirlo
        </label>
        <input class="form-input" id="maga-rep-email" style="flex:1;min-width:260px"
               placeholder="dueño@negocio.com; contador@negocio.com" value="${UI.esc(correo)}">
        <button class="btn btn-sm btn-cyan" onclick="Modulos.precios_maga._guardarCorreo()">Guardar</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">
        Podés poner <b>varios correos separados por punto y coma (;)</b> — el mismo resumen le llega a todos.
        Si lo dejás vacío se usa el correo del negocio${cfg.email ? ' (' + UI.esc(cfg.email) + ')' : ''}.
      </div>
    </div>`;
  },

  /* Varios destinatarios en un solo campo, separados por ";" — así lo pidió
     Henry y así se guarda: un negocio suele querer el resumen en el correo del
     dueño Y en el del que compra. El type="email" del input se quitó a
     propósito: con varias direcciones el navegador lo marca inválido.

     Se valida CADA una y se avisa cuál está mal: guardar una lista con un
     correo roto es la forma silenciosa de que ese no reciba nada nunca. */
  _correosDe(texto) {
    return String(texto || '').split(';').map(x => x.trim()).filter(Boolean);
  },

  async _guardarCorreo() {
    const activo = document.getElementById('maga-rep-activo')?.checked;
    const crudo = document.getElementById('maga-rep-email')?.value || '';
    const correos = this._correosDe(crudo);
    const malos = correos.filter(c => !/^[^@\s;]+@[^@\s;]+\.[^@\s;]+$/.test(c));
    if (activo && malos.length) {
      UI.toast(`Revisá ${malos.length === 1 ? 'este correo' : 'estos correos'}: ${malos.join(', ')}`, 'error', 7000);
      return;
    }
    /* Se guarda normalizado (sin espacios ni vacíos) para que quien manda el
       correo no tenga que adivinar el formato. */
    const { error } = await DB.guardarReporteMagaCfg(activo, correos.join('; '));
    if (error) { UI.toast('No se pudo guardar: ' + error.message, 'error'); return; }
    UI.toast(activo
      ? `Listo: el resumen diario llegará a ${correos.length || 1} ${correos.length === 1 || !correos.length ? 'correo' : 'correos'} ✓`
      : 'Resumen diario apagado', 'success');
  },

  /* ═══════════ SEGUIMIENTO Y CALENDARIO (fase 4) ═══════════
     La ventana de compra dura semanas y se pasa. Si hay que acordarse de abrir
     la pantalla, el análisis no sirve: por eso el comercio marca los productos
     que le importan y el día 8 de cada mes le llega el aviso por correo
     (Edge Function maga-alertas, con los mismos umbrales que esta pantalla). */
  _seguidos: new Set(),

  async _cargarSeguidos() {
    try { this._seguidos = await DB.getSeguimientoMaga(); }
    catch (_) { this._seguidos = new Set(); }
    return this._seguidos;
  },

  async alternarSeguir(id, ev) {
    if (ev) ev.stopPropagation();
    const seguir = !this._seguidos.has(id);
    const { error } = await DB.seguirProductoMaga(id, seguir);
    if (error) return UI.toast('No se pudo guardar: ' + error.message, 'error');
    if (seguir) this._seguidos.add(id); else this._seguidos.delete(id);
    UI.toast(seguir ? 'Te avisamos cuando entre en ventana ⭐' : 'Ya no lo seguís');
    await this.render();   // con await, quien llame sabe cuándo quedó pintado
  },

  _btnSeguir(id, chico) {
    const on = this._seguidos.has(id);
    return `<button class="btn btn-sm ${on?'btn-amber':'btn-ghost'}" style="${chico?'padding:2px 7px;font-size:11px':''}"
      title="${on?'Dejar de seguir':'Seguir: te avisamos por correo cuando entre en ventana'}"
      onclick="Modulos.precios_maga.alternarSeguir(${id}, event)">${on?'⭐ Siguiendo':'☆ Seguir'}</button>`;
  },

  /* Calendario anual: una fila por producto seguido, doce columnas. Sirve para
     planificar el año completo de un vistazo, no solo el mes en curso. */
  _calendarioHTML() {
    const seguidos = this._prods.filter(p => this._seguidos.has(p.id));
    if (!seguidos.length) {
      return `<div class="card" style="padding:22px;text-align:center;color:var(--text3);margin-top:12px">
        <div style="font-size:30px">🗓</div>
        <p style="font-size:13px;margin-top:6px">Todavía no seguís ningún producto.</p>
        <p style="font-size:12px">Marcá con <b>☆ Seguir</b> los que te interesen: acá vas a ver su año completo
           y el día 8 de cada mes te llega por correo cuáles entraron en ventana.</p>
      </div>`;
    }
    const mesHoy = this._mesActual();
    const filas = seguidos.map(p => {
      const r = this._resumen(this._estac?.[p.id]);
      const celdas = Array.from({ length: 12 }, (_, k) => {
        const m = r?.meses.find(x => x.mes === k + 1);
        const hoy = (k + 1) === mesHoy;
        if (!m) return `<td style="padding:0"><div style="height:26px;background:var(--surface2);border:1px solid var(--border);${hoy?'outline:2px solid var(--cyan);outline-offset:-2px':''}"></div></td>`;
        const color = m.i <= 95 ? 'var(--green)' : m.i >= 105 ? 'var(--red)' : 'var(--amber)';
        return `<td style="padding:0" title="${this._MESES[k]}: índice ${m.i.toFixed(0)}">
          <div style="height:26px;background:${color};opacity:${hoy?1:.7};display:flex;align-items:center;justify-content:center;
                      font-size:9.5px;font-weight:700;color:#08111c;${hoy?'outline:2px solid var(--cyan);outline-offset:-2px':''}">
            ${m.i.toFixed(0)}</div></td>`;
      }).join('');
      return `<tr>
        <td style="white-space:nowrap;padding-right:8px">
          <div style="font-size:12px;font-weight:700">${UI.esc(p.nombre)}</div>
          <div style="font-size:10px;color:var(--text3)">${r ? `brecha ${r.brecha.toFixed(0)}%` : 'sin patrón'}</div>
        </td>
        ${celdas}
        <td style="padding-left:8px">${this._btnSeguir(p.id, true)}</td>
      </tr>`;
    }).join('');

    return `<div class="card" style="padding:12px;margin-top:12px;overflow-x:auto">
      <b style="font-size:12.5px">🗓 CALENDARIO ANUAL — ${seguidos.length} producto(s) que seguís</b>
      <div style="font-size:11px;color:var(--text3);margin:2px 0 8px">
        100 = promedio del año · verde barato, rojo caro · el mes en curso va remarcado
      </div>
      <table style="width:100%;border-collapse:separate;border-spacing:2px;min-width:640px">
        <thead><tr><th></th>${this._MESES.map(m => `<th style="font-size:10px;color:var(--text3);font-weight:600">${m}</th>`).join('')}<th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">
        El día 8 de cada mes te llega un correo con los que entraron en ventana. Solo se avisa de
        patrones con brecha sobre ${this._MIN_BRECHA}% que se repiten entre años.
      </div>
    </div>`;
  },

  /* ═══════════ MI PRECIO CONTRA EL MERCADO (fase 3) ═══════════
     La referencia sola dice "el mercado estaba a Q X". Cruzada con lo que el
     comercio pagó o cobró dice lo que de verdad importa: "compraste 12% arriba
     del mercado ese mes". dif > 0 = por encima del mercado, que comprando es
     malo y vendiendo es bueno; por eso el color se invierte según el caso. */
  _mapeo: {},

  async renderComparacion() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    if (!this._prods.length) this._prods = await DB.getMagaProductos();
    const [mapeo, filas] = await Promise.all([DB.getMapeoGranos(), DB.getComparacionGranos()]);
    this._mapeo = mapeo || {};

    const conRef = filas.filter(f => f.dif_pct !== null && f.dif_pct !== undefined);
    const compras = conRef.filter(f => f.es_compra), ventas = conRef.filter(f => !f.es_compra);
    const prom = xs => xs.length ? xs.reduce((s, f) => s + Number(f.dif_pct), 0) / xs.length : null;
    const pc = prom(compras), pv = prom(ventas);

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📊 Mi precio vs mercado</h1>
          <p class="page-subtitle">// Cada compra y venta contra el precio mayorista del MAGA de ese mes</p>
        </div>
      </div>
      <div class="page-body">
        ${Modulos.venta_granos?._tabsHTML ? Modulos.venta_granos._tabsHTML() : ''}
        ${this._configMapeoHTML()}
        ${filas.length ? `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0">
            ${this._kpi('Transacciones comparadas', `${conRef.length} de ${filas.length}`, 'var(--text2)')}
            ${this._kpi('En compras', pc===null?'—':`${pc>0?'+':''}${pc.toFixed(1)}%`,
                        pc===null?'var(--text3)':(pc>0?'var(--red)':'var(--green)'))}
            ${this._kpi('En ventas', pv===null?'—':`${pv>0?'+':''}${pv.toFixed(1)}%`,
                        pv===null?'var(--text3)':(pv>0?'var(--green)':'var(--red)'))}
          </div>
          <div style="font-size:11.5px;color:var(--text3);margin-bottom:8px">
            Comprando, quedar <b style="color:var(--green)">debajo</b> del mercado es bueno;
            vendiendo, lo bueno es quedar <b style="color:var(--green)">encima</b>.
          </div>
          <div class="card" style="padding:0;overflow:auto">
            <table class="table" style="font-size:12px">
              <thead><tr>
                <th>Fecha</th><th>N°</th><th>Grano</th><th>Tipo</th>
                <th style="text-align:right">Mi Q/quintal</th><th style="text-align:right">Mercado Q/quintal</th>
                <th style="text-align:right">Diferencia</th>
              </tr></thead>
              <tbody>${filas.map(f => this._filaComparacion(f)).join('')}</tbody>
            </table>
          </div>`
        : `<div class="card" style="padding:26px;text-align:center;color:var(--text3);margin-top:12px">
            <div style="font-size:32px">📊</div>
            <p style="font-size:13px;margin-top:6px">Todavía no hay transacciones de granos registradas.</p>
            <p style="font-size:12px">En cuanto registres compras o ventas en la pestaña <b>Transacciones</b>,
               acá vas a ver a cómo compraste o vendiste comparado con el precio del mercado de ese mes.</p>
          </div>`}
      </div>`;
  },

  _filaComparacion(f) {
    const dif = f.dif_pct === null || f.dif_pct === undefined ? null : Number(f.dif_pct);
    /* Comprando conviene estar abajo del mercado; vendiendo, arriba. */
    const bueno = dif === null ? null : (f.es_compra ? dif < 0 : dif > 0);
    const color = dif === null ? 'var(--text3)' : (bueno ? 'var(--green)' : 'var(--red)');
    return `<tr>
      <td>${UI.esc(String(f.fecha || '').slice(0,10))}</td>
      <td>${UI.esc(f.num || '')}</td>
      <td>${UI.esc(f.tipo_grano || '')}${f.referencia ? `<div style="font-size:10px;color:var(--text3)">${UI.esc(f.referencia)}</div>` : ''}</td>
      <td><span class="badge badge-${f.es_compra?'amber':'green'}">${f.es_compra?'Compra':'Venta'}</span></td>
      <td style="text-align:right">${UI.q(this._porQuintal(f.precio_kg))}</td>
      <td style="text-align:right">${f.precio_ref_kg ? `${UI.q(this._porQuintal(f.precio_ref_kg))}<div style="font-size:10px;color:var(--text3)">${UI.esc(String(f.fecha_ref||'').slice(0,7))}</div>` : '—'}</td>
      <td style="text-align:right;font-weight:800;color:${color}">
        ${dif === null ? '<span style="font-size:11px;font-weight:400;color:var(--text3)">sin referencia</span>'
                       : `${dif>0?'+':''}${dif.toFixed(1)}%`}
      </td>
    </tr>`;
  },

  _configMapeoHTML() {
    const tipos = Modulos.venta_granos?._TIPOS_GRANO || {};
    const granos = this._prods.filter(p => p.categoria === 'grano' && p.n_datos > 24)
                              .sort((a, b) => a.nombre.localeCompare(b.nombre));
    return `<details class="card" style="padding:12px" ${Object.keys(this._mapeo).length ? '' : 'open'}>
      <summary style="cursor:pointer;font-size:12.5px;font-weight:800">⚙️ Qué precio del MAGA usar como referencia</summary>
      <p style="font-size:11.5px;color:var(--text3);margin:6px 0 10px">
        Tus transacciones usan tipos genéricos y el MAGA publica variedades
        (maíz blanco o amarillo, frijol negro, rojo o blanco). Elegí cuál se parece a lo que comerciás.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px">
        ${Object.entries(tipos).map(([k, label]) => `
          <div>
            <label class="form-label" style="font-size:11.5px">${UI.esc(label)}</label>
            <select class="form-select" style="width:100%;font-size:12px"
                    onchange="Modulos.precios_maga._guardarMapeo('${UI.esc(k)}', this.value)">
              <option value="">— sin referencia —</option>
              ${granos.map(g => `<option value="${g.id}" ${this._mapeo[k]===g.id?'selected':''}>${UI.esc(g.nombre)}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
      <p style="font-size:11px;color:var(--amber);margin-top:8px">
        El MAGA no publica precio de <b>trigo</b>: ese tipo va a quedar siempre sin referencia, y no es una falla del sistema.
      </p>
    </details>`;
  },

  async _guardarMapeo(tipo, productoId) {
    const { error } = await DB.guardarMapeoGrano(tipo, productoId ? Number(productoId) : null);
    if (error) return UI.toast('No se pudo guardar: ' + error.message, 'error');
    UI.toast('Referencia actualizada ✓');
    this.renderComparacion();
  },

  /* Qué conviene mirar ESTE mes. Sin esta vista el usuario tendría que adivinar
     qué producto abrir; acá el sistema le dice cuáles están en su ventana. */
  _ventanasHTML() {
    const mes = this._mesActual();
    const comprar = [], vender = [];
    for (const p of this._prods) {
      const r = this._resumen(this._estac?.[p.id]);
      if (!r || r.fuerza === 'ninguna' || r.fuerza === 'debil') continue;
      const fila = { p, r, idx: r.meses.find(m => m.mes === mes)?.i };
      if (r.baratos.includes(mes)) comprar.push(fila);
      else if (r.caros.includes(mes)) vender.push(fila);
    }
    const orden = (a, b) => b.r.brecha - a.r.brecha;
    comprar.sort(orden); vender.sort(orden);

    const tarjeta = (f, tipo) => {
      const color = tipo === 'compra' ? 'var(--green)' : 'var(--red)';
      const otros = tipo === 'compra' ? f.r.caros : f.r.baratos;
      return `<div style="border:1px solid var(--border);border-left:3px solid ${color};border-radius:10px;padding:9px 11px;cursor:pointer"
                   onclick="Modulos.precios_maga._verDesdeVentanas(${f.p.id})">
        <div style="font-size:12.5px;font-weight:800">${UI.esc(f.p.nombre)}</div>
        <div style="font-size:10.5px;color:var(--text3);margin:2px 0">${UI.esc(f.p.medida)}</div>
        <div style="font-size:11.5px">
          ${tipo === 'compra'
            ? `Suele estar <b style="color:${color}">barato</b> en ${this._nombresMeses(f.r.baratos)} · sube en ${this._nombresMeses(otros)}`
            : `Suele estar <b style="color:${color}">caro</b> en ${this._nombresMeses(f.r.caros)} · baja en ${this._nombresMeses(otros)}`}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap">
          <span style="font-size:11px;color:var(--text3)">
            brecha histórica <b style="color:${color}">${f.r.brecha.toFixed(0)}%</b> ·
            ${f.r.fuerza === 'fuerte' ? 'patrón fuerte' : 'patrón moderado'} (±${f.r.disp.toFixed(0)} pts entre años)
          </span>
          ${this._btnSeguir(f.p.id, true)}
        </div>
      </div>`;
    };

    const bloque = (titulo, lista, tipo, vacio) => `
      <div class="card" style="padding:12px">
        <b style="font-size:12.5px">${titulo}</b>
        ${lista.length
          ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${lista.slice(0, 12).map(f => tarjeta(f, tipo)).join('')}</div>
             ${lista.length > 12 ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">y ${lista.length - 12} más</div>` : ''}`
          : `<div style="font-size:12px;color:var(--text3);margin-top:6px">${vacio}</div>`}
      </div>`;

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px" class="maga-ventanas">
        ${bloque(`🟢 EN SU MES BARATO — conviene comprar (${this._MESES[mes-1]})`, comprar, 'compra',
                 'Ningún producto con patrón confiable está en su piso este mes.')}
        ${bloque(`🔴 EN SU MES CARO — conviene vender (${this._MESES[mes-1]})`, vender, 'venta',
                 'Ningún producto con patrón confiable está en su pico este mes.')}
      </div>
      <div class="card" style="padding:11px;margin-top:12px;font-size:11.5px;color:var(--text3)">
        Solo se listan productos cuya brecha entre el mes más caro y el más barato supera el
        ${this._MIN_BRECHA}% y cuyo patrón se repite entre años (dispersión bajo ${this._MAX_DISPERSION} puntos).
        Los que no aparecen no es que falten datos: es que <b>no tienen ventana</b> — el frijol, por ejemplo,
        se mueve apenas 13% porque al ser almacenable todos pueden esperar.
        Esto describe lo que ha pasado, no lo que va a pasar: una sequía o un cambio de importaciones rompe cualquier patrón.
      </div>`;
  },

  _nombresMeses(ms) { return ms.map(m => this._MESES[m-1]).join(', '); },

  async _verDesdeVentanas(id) {
    this._vista = 'explorar';
    await this.render();
    await this.ver(id);
  },

  _filtrar() {
    const b = this._busca.trim().toLowerCase();
    return this._prods.filter(p =>
      (!this._cat || p.categoria === this._cat) &&
      (!b || p.nombre.toLowerCase().includes(b)));
  },

  _repintarLista() {
    const c = document.getElementById('maga-lista');
    if (c) c.innerHTML = this._listaHTML(this._filtrar());
  },

  _listaHTML(lista) {
    if (!lista.length) return `<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">Sin productos que coincidan.</div>`;
    return lista.map(p => {
      /* MAGA deja de medir productos: si el último dato es viejo hay que
         decirlo, no graficar una serie muerta como si estuviera vigente. */
      const viejo = p.ultimo_dato && (Date.now() - new Date(p.ultimo_dato).getTime()) > 400 * 864e5;
      return `<div class="maga-item ${this._sel?.id===p.id?'activo':''}" onclick="Modulos.precios_maga.ver(${p.id})">
        <div style="font-size:12.5px;font-weight:700">${UI.esc(p.nombre)}</div>
        <div style="font-size:10.5px;color:var(--text3)">
          ${UI.esc(p.medida)} · ${p.n_datos} meses
          ${viejo ? ` · <span style="color:var(--amber)">sin datos desde ${UI.esc(String(p.ultimo_dato).slice(0,7))}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  },

  _vacioHTML() {
    return `<div class="card" style="padding:28px;text-align:center;color:var(--text3)">
      <div style="font-size:34px">📈</div>
      <p style="font-size:13px;margin-top:6px">Elegí un producto para ver su historia de precios.</p>
      <p style="font-size:11.5px">Fuente: Sistema de Información de Mercados del MAGA (datos abiertos).</p>
    </div>`;
  },

  async ver(id) {
    this._sel = this._prods.find(p => p.id === id) || null;
    if (!this._sel) return;
    this._mercado = '';
    this._repintarLista();
    const f = document.getElementById('maga-ficha');
    f.innerHTML = `<div class="card" style="padding:24px;text-align:center;color:var(--text3);font-size:13px">Cargando serie…</div>`;
    this._serie = await DB.getMagaSerie(id);
    this._pintarFicha();
  },

  _pintarFicha() {
    const f = document.getElementById('maga-ficha');
    const p = this._sel;
    if (!f || !p) return;
    const mercados = [...new Set(this._serie.map(r => r.mercado))].sort();
    const corte = this._anios ? this._fechaCorte(this._anios) : '0000-00-00';
    const datos = this._serie
      .filter(r => (!this._mercado || r.mercado === this._mercado) && r.fecha >= corte);

    if (!datos.length) {
      f.innerHTML = `<div class="card" style="padding:20px;color:var(--text3);font-size:13px">
        Sin datos para ese mercado y rango.</div>`;
      return;
    }

    /* Un punto por mes: si hay varios mercados se promedian, así la línea no
       salta entre plazas con niveles de precio distintos. */
    const porMes = {};
    datos.forEach(r => { (porMes[r.fecha] ||= []).push(Number(r.precio)); });
    const meses = Object.keys(porMes).sort();
    const valores = meses.map(m => porMes[m].reduce((a,b)=>a+b,0) / porMes[m].length);

    const ultimo = valores[valores.length - 1];
    const ultimaFecha = meses[meses.length - 1];
    const hace12 = meses.length > 12 ? valores[valores.length - 13] : null;
    const varAnual = hace12 ? ((ultimo / hace12 - 1) * 100) : null;
    const min = Math.min(...valores), max = Math.max(...valores);
    /* Percentil: dónde cae el precio de hoy dentro de su propio rango. Es el
       dato honesto — "está caro o barato para lo que suele valer" — sin
       pretender adivinar para dónde va. */
    const pct = max > min ? ((ultimo - min) / (max - min)) * 100 : 50;
    const zona = pct <= 25 ? ['ZONA BARATA', 'var(--green)']
               : pct >= 75 ? ['ZONA CARA', 'var(--red)']
               : ['EN SU RANGO NORMAL', 'var(--amber)'];

    const etiquetas = meses.map(m => {
      const [a, mm] = m.split('-');
      return `${this._MESES[+mm - 1]} ${a.slice(2)}`;
    });
    const grafica = Charts.areaLineas({
      labels: etiquetas.length > 24 ? etiquetas.map((e,i) => i % Math.ceil(etiquetas.length/12) ? '' : e) : etiquetas,
      series: [{ nombre: 'Precio', colorVar: 'green', area: true, valores }],
      alto: 250,
    });

    f.innerHTML = `
      <div class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
          <div>
            <div style="font-size:15px;font-weight:800">${UI.esc(p.nombre)}</div>
            <div style="font-size:11.5px;color:var(--text3)">
              ${UI.esc(p.medida)}${p.kg_equiv ? ` · ${UI.numero(Number(p.kg_equiv) / 0.45359237, 1)} libras` : ' · se vende por unidad, no se puede pasar a precio por libra'}
            </div>
          </div>
          <div style="text-align:right">
            <div style="margin-bottom:4px">${this._btnSeguir(p.id, true)}</div>
            <div style="font-size:22px;font-weight:900;font-family:'Outfit',sans-serif">${UI.q(ultimo)}</div>
            <div style="font-size:11px;color:var(--text3)">${UI.esc(ultimaFecha.slice(0,7))}${
              p.kg_equiv ? ` · ${UI.q(ultimo / Number(p.kg_equiv))}/kg` : ''}</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
          <select class="form-select" style="width:auto;font-size:12px"
                  onchange="Modulos.precios_maga._mercado=this.value;Modulos.precios_maga._pintarFicha()">
            <option value="">Todos los mercados</option>
            ${mercados.map(m => `<option value="${UI.esc(m)}" ${m===this._mercado?'selected':''}>${UI.esc(m)}</option>`).join('')}
          </select>
          <select class="form-select" style="width:auto;font-size:12px"
                  onchange="Modulos.precios_maga._anios=+this.value;Modulos.precios_maga._pintarFicha()">
            <option value="5"  ${this._anios===5?'selected':''}>Últimos 5 años</option>
            <option value="10" ${this._anios===10?'selected':''}>Últimos 10 años</option>
            <option value="0"  ${this._anios===0?'selected':''}>Toda la historia</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:10px">
          ${this._kpi('Mínimo del período', UI.q(min), 'var(--green)')}
          ${this._kpi('Máximo del período', UI.q(max), 'var(--red)')}
          ${this._kpi('Variación 12 meses', varAnual===null ? '—' : `${varAnual>0?'+':''}${varAnual.toFixed(0)}%`,
                      varAnual===null ? 'var(--text3)' : (varAnual>0?'var(--red)':'var(--green)'))}
          ${this._kpi(zona[0], `percentil ${pct.toFixed(0)}`, zona[1])}
        </div>

        <div style="overflow-x:auto">${grafica}</div>

        ${this._estacionalidadHTML(p)}

        <div style="font-size:10.5px;color:var(--text3);margin-top:8px">
          ${datos.length} observaciones · ${meses.length} meses · fuente:
          <a href="https://precios.maga.gob.gt/otros/datos-abiertos/" target="_blank" rel="noopener">datos abiertos del MAGA</a>.
          El percentil dice si el precio de hoy está caro o barato frente a su propio rango del período; no es un pronóstico.
        </div>
      </div>`;
  },

  /* Barras de los 12 meses: verde lo barato, rojo lo caro, y marcado el mes en
     curso. Es la vista que responde "¿cuándo compro y cuándo vendo?". */
  _estacionalidadHTML(p) {
    const r = this._resumen(this._estac?.[p.id]);
    if (!r) {
      return `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;font-size:12px;color:var(--text3)">
        <b style="font-size:12px;color:var(--text2)">🗓 ESTACIONALIDAD</b><br>
        No hay suficiente historia reciente de este producto para calcular un patrón confiable
        (hacen falta al menos 3 años con datos).
      </div>`;
    }
    const mesHoy = this._mesActual();
    const barras = Array.from({ length: 12 }, (_, k) => {
      const m = r.meses.find(x => x.mes === k + 1);
      if (!m) return `<div style="flex:1;text-align:center"><div style="height:70px"></div>
        <div style="font-size:9.5px;color:var(--text3)">${this._MESES[k]}</div></div>`;
      const color = m.i <= 95 ? 'var(--green)' : m.i >= 105 ? 'var(--red)' : 'var(--amber)';
      // el alto se escala entre 70 y 130 del índice, que es donde vive casi todo
      const alto = Math.max(6, Math.min(70, ((m.i - 70) / 60) * 70));
      const hoy = (k + 1) === mesHoy;
      return `<div style="flex:1;text-align:center" title="${this._MESES[k]}: ${m.i.toFixed(0)} (±${m.d.toFixed(0)}, ${m.n} años)">
        <div style="height:70px;display:flex;align-items:flex-end;justify-content:center">
          <div style="width:74%;height:${alto}px;background:${color};border-radius:3px 3px 0 0;opacity:${hoy?1:.72}"></div>
        </div>
        <div style="font-size:9.5px;color:${hoy?'var(--text)':'var(--text3)'};font-weight:${hoy?800:400}">${this._MESES[k]}</div>
        <div style="font-size:9px;color:var(--text3)">${m.i.toFixed(0)}</div>
      </div>`;
    }).join('');

    const colorF = { fuerte:'var(--green)', moderada:'var(--amber)', debil:'var(--amber)', ninguna:'var(--text3)' }[r.fuerza];
    const etiqueta = { fuerte:'Patrón fuerte', moderada:'Patrón moderado', debil:'Patrón poco confiable', ninguna:'Sin ventana' }[r.fuerza];

    return `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <b style="font-size:12px">🗓 ESTACIONALIDAD — ${this._anios || 5} años</b>
        <span style="font-size:10.5px;font-weight:800;color:${colorF};border:1px solid ${colorF};border-radius:6px;padding:1px 7px">
          ${etiqueta} · brecha ${r.brecha.toFixed(0)}%
        </span>
      </div>
      <div style="font-size:10.5px;color:var(--text3);margin:2px 0 6px">100 = promedio del año · el mes en curso va resaltado</div>
      <div style="display:flex;gap:3px;align-items:flex-end">${barras}</div>
      ${r.fuerza === 'ninguna' ? `
        <div style="font-size:12px;color:var(--text2);margin-top:8px">${UI.esc(r.nota)}</div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:10px">
          <div style="background:var(--surface2);border-left:3px solid var(--green);border-radius:8px;padding:8px 10px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Suele estar barato</div>
            <div style="font-size:13.5px;font-weight:800;color:var(--green)">${this._nombresMeses(r.baratos)}</div>
          </div>
          <div style="background:var(--surface2);border-left:3px solid var(--red);border-radius:8px;padding:8px 10px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Suele estar caro</div>
            <div style="font-size:13.5px;font-weight:800;color:var(--red)">${this._nombresMeses(r.caros)}</div>
          </div>
        </div>
        <div style="font-size:11.5px;color:var(--text2);margin-top:8px">
          ${UI.esc(r.nota)} Dispersión entre años: ±${r.disp.toFixed(0)} puntos.
          Contra la brecha del ${r.brecha.toFixed(0)}%, restá tu costo de bodega y la merma antes de decidir si esperar conviene.
        </div>`}
    </div>`;
  },

  _kpi(label, valor, color) {
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:8px 10px">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">${UI.esc(label)}</div>
      <div style="font-size:15px;font-weight:800;color:${color}">${valor}</div>
    </div>`;
  },

  _fechaCorte(anios) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - anios);
    return d.toISOString().slice(0, 10);
  },
};
