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

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    if (!this._prods.length) this._prods = await DB.getMagaProductos();

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
              ${UI.esc(p.medida)}${p.kg_equiv ? ` · ${Number(p.kg_equiv).toFixed(2)} kg` : ' · se vende por unidad, no se puede pasar a Q/kg'}
            </div>
          </div>
          <div style="text-align:right">
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

        <div style="font-size:10.5px;color:var(--text3);margin-top:8px">
          ${datos.length} observaciones · ${meses.length} meses · fuente:
          <a href="https://precios.maga.gob.gt/otros/datos-abiertos/" target="_blank" rel="noopener">datos abiertos del MAGA</a>.
          El percentil dice si el precio de hoy está caro o barato frente a su propio rango del período; no es un pronóstico.
        </div>
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
