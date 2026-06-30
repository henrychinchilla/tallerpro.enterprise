/* ═══════════════════════════════════════════════════════
   Contabilidad / SAT — Fases 1 y 2 (Guatemala)
   Hojas de trabajo listas para transcribir a Declaraguate:
   • IVA mensual SAT-2237 (o SAT-2046 pequeño contribuyente) con
     ARRASTRE automático del remanente de crédito desde enero y
     fuente de crédito conmutables: sistema vs FEL importado de SAT
   • ISR trimestral SAT-1361 e ISO SAT-1608 (régimen utilidades 25%)
     con depreciación de activos integrada
   • ISR mensual SAT-1311 (régimen opcional simplificado 5%/7%)
   • Importador del CSV de la Consulta FEL de SAT (emitidas/recibidas)
   • Registro rápido de retenciones IVA/ISR
   • Libros de Ventas y Compras exportables · Obligaciones con estado
   Nota: Declaraguate no tiene API pública — aquí se PRE-CALCULA
   cada casilla para que el contador solo transcriba.
═══════════════════════════════════════════════════════ */
Modulos.contabilidad = {
  _tab: 'formularios_sat',
  _mes: null, _anio: null,
  _fiscal: null,
  _fuenteCredito: 'sistema',   // 'sistema' (compras+gastos) | 'fel' (CSV de SAT)
  _felParse: null,             // resultado del CSV pendiente de importar

  /* Categorías de gasto con sus banderas fiscales por defecto (ded=ISR, cred=IVA).
     Viáticos comprobables (alimentos, hospedaje, transporte), herramientas, equipo
     y útiles son DEDUCIBLES si son para el negocio (Art. 21 Dto. 10-2012). */
  _CATS: {
    por_clasificar:        { label:'⏳ Por clasificar',                ded:false, cred:false },
    materia_prima:         { label:'🔩 Materia prima',                 ded:true,  cred:true  },
    insumos_servicio:      { label:'🧰 Insumos para servicios',        ded:true,  cred:true  },
    combustible:           { label:'⛽ Combustible',                   ded:true,  cred:true  },
    herramientas:          { label:'🛠️ Herramientas',                 ded:true,  cred:true  },
    electrodomesticos:     { label:'🔌 Electrodomésticos / equipo',    ded:true,  cred:true  },
    viaticos_alimentos:    { label:'🍽️ Viáticos — alimentos',         ded:true,  cred:true  },
    viaticos_hospedaje:    { label:'🏨 Viáticos — hospedaje',          ded:true,  cred:true  },
    viaticos_transporte:   { label:'🚕 Viáticos — transporte/taxi',    ded:true,  cred:true  },
    utiles_papeleria:      { label:'✏️ Útiles / papelería',           ded:true,  cred:true  },
    servicios:             { label:'💡 Servicios (luz/agua/tel)',      ded:true,  cred:true  },
    gastos_admin:          { label:'🏢 Gastos administrativos',        ded:true,  cred:true  },
    otros:                 { label:'📦 Otros (deducible)',             ded:true,  cred:true  },
    personal_no_deducible: { label:'🚫 Personal / no deducible',       ded:false, cred:false },
  },

  async _toggleFlag(id, campo, val) {
    await DB.setFlagsCompra(id, { [campo]: val });
    UI.toast(campo==='credito_iva' ? (val?'Crédito IVA activado':'Sin crédito IVA') : (val?'Deducible ISR':'No deducible ISR'));
    this._renderTab();
  },

  async _clasificarCompra(id, categoria, proveedor) {
    const c = this._CATS[categoria] || this._CATS.otros;
    const campos = { categoria_gasto: categoria, deducible: c.ded, credito_iva: c.cred };
    /* Clasifica esta compra + recuerda la regla del proveedor */
    await DB.clasificarCompras([id], campos, true);
    let extra = 0;
    /* Aplica la misma clasificación al resto de compras 'por clasificar' del mismo proveedor */
    if (proveedor) {
      const r = await DB.clasificarPorProveedor(proveedor, campos);
      extra = Math.max(0, (r.count||0) - 0);
    }
    UI.toast(`${c.label}${c.ded?'':' · no deducible'}${extra>1?` · aplicado a ${extra} de ${proveedor}`:''}`);
    this._renderTab();
  },

  _rango() {
    const now = new Date();
    const mes  = this._mes  || (now.getMonth()+1);
    const anio = this._anio || now.getFullYear();
    const ini = new Date(anio, mes-1, 1).toISOString().slice(0,10);
    const fin = new Date(anio, mes, 0).toISOString().slice(0,10);
    return { mes, anio, ini, fin, periodo: `${anio}-${String(mes).padStart(2,'0')}` };
  },

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._fiscal = await DB.getConfigFiscalFresh().catch(()=>null);
    const { mes, anio } = this._rango();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🧮 Contabilidad / SAT</h1>
        <p class="page-subtitle">// hoja de trabajo para Declaraguate — IVA, ISR, ISO y libros</p></div>
        <div class="page-actions">
          <select class="form-select" style="width:auto" onchange="Modulos.contabilidad._mes=parseInt(this.value);Modulos.contabilidad._renderTab()">
            ${meses.map((m,i)=>`<option value="${i+1}" ${mes===i+1?'selected':''}>${m}</option>`).join('')}
          </select>
          <select class="form-select" style="width:auto" onchange="Modulos.contabilidad._anio=parseInt(this.value);Modulos.contabilidad._renderTab()">
            ${[anio-1,anio,anio+1].map(a=>`<option ${anio===a?'selected':''}>${a}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" onclick="Modulos.contabilidad.modalRetencion()">➕ Retención</button>
        </div>
      </div>
      <div class="page-body">
        <div class="tabs">
          ${[['formularios_sat','📋 Formularios SAT'],['fel','⬆️ Importar FEL'],['ventas','📤 Libro de Ventas'],['compras','📥 Libro de Compras'],['retenciones','🧾 Retenciones'],['obligaciones','📅 Obligaciones']]
            .map(([t,l])=>`<button class="tab-btn ${this._tab===t?'active':''}" onclick="Modulos.contabilidad._ir('${t}')">${l}</button>`).join('')}
        </div>
        <div id="cont-content"></div>
      </div>`;
    this._renderTab();
  },

  _ir(t){ if(t!==this._tab && !App.puedeSalir()) return; this._tab=t; App._subActivo=t; App._guardarRuta(); App.renderSidebar(); App.marcarTabActivo(t); this._renderTab(); },

  /* ── Datos del MES seleccionado (libros) ── */
  async _datos() {
    const { ini, fin } = this._rango();
    const [facturas, compras, egresosIva, retenciones, fel] = await Promise.all([
      DB.getFacturasPeriodo(ini, fin),
      DB.getComprasPeriodo(ini, fin),
      DB.getEgresosIvaPeriodo(ini, fin),
      DB.getRetencionesPeriodo(ini, fin),
      DB.getFelImportados(ini, fin)
    ]);
    return this._agregar(facturas, compras, egresosIva, retenciones, fel);
  },

  /* Agrega métricas fiscales a un conjunto de documentos */
  _agregar(facturas, compras, egresosIva, retenciones, fel) {
    const vivas = f => !/anulad/i.test(f.estado||'');
    const n = v => Number(v)||0;
    const ivaDe = (total, iva, subtotal) =>
      n(iva) || Math.round((n(total)-n(subtotal))*100)/100 || Math.round(n(total)/1.12*0.12*100)/100;

    const ventas = (facturas||[]).filter(vivas);
    const ventasTotal = ventas.reduce((s,f)=>s+n(f.total),0);
    const debito = Math.round(ventas.reduce((s,f)=>s+ivaDe(f.total,f.iva,f.subtotal),0)*100)/100;
    const ventasNetas = Math.round((ventasTotal-debito)*100)/100;

    const comprasVivas = (compras||[]).filter(vivas);
    const credito = Math.round((comprasVivas.reduce((s,c)=>s+n(c.iva),0)
      + (egresosIva||[]).reduce((s,e)=>s+n(e.iva_credito),0))*100)/100;
    const comprasTotal = comprasVivas.reduce((s,c)=>s+n(c.total),0) + (egresosIva||[]).reduce((s,e)=>s+n(e.monto),0);
    const comprasNetas = Math.round((comprasTotal-credito)*100)/100;

    const felVivos = (fel||[]).filter(vivas);
    const felRec = felVivos.filter(x=>x.naturaleza!=='emitida');
    const felEmi = felVivos.filter(x=>x.naturaleza==='emitida');
    const creditoFel = Math.round(felRec.reduce((s,x)=>s+ivaDe(x.gran_total,x.iva,null),0)*100)/100;
    const debitoFel  = Math.round(felEmi.reduce((s,x)=>s+ivaDe(x.gran_total,x.iva,null),0)*100)/100;

    const esIva = r => (r.tipo||'').toUpperCase().includes('IVA');
    const esIsr = r => (r.tipo||'').toUpperCase().includes('ISR');
    const recibida = r => (r.naturaleza||'recibida').toLowerCase().includes('recib');
    const retIva = (retenciones||[]).filter(r=>esIva(r)&&recibida(r)).reduce((s,r)=>s+n(r.monto),0);
    const retIsr = (retenciones||[]).filter(r=>esIsr(r)&&recibida(r)).reduce((s,r)=>s+n(r.monto),0);

    return { facturas: facturas||[], compras: compras||[], egresosIva: egresosIva||[], ventas,
      ventasTotal, ventasNetas, debito, comprasTotal, comprasNetas, credito,
      creditoFel, debitoFel, felRec: felRec.length, felEmi: felEmi.length, retIva, retIsr };
  },

  /* ── Año hasta el mes seleccionado: ARRASTRE de remanente ──
     Una sola consulta por tabla y la cadena se calcula localmente
     mes a mes desde enero (remanente de años previos: nota manual). */
  async _ivaConArrastre() {
    const { mes, anio, fin } = this._rango();
    const iniAnio = `${anio}-01-01`;
    const [facturas, compras, egresosIva, retenciones, fel] = await Promise.all([
      DB.getFacturasPeriodo(iniAnio, fin),
      DB.getComprasPeriodo(iniAnio, fin),
      DB.getEgresosIvaPeriodo(iniAnio, fin),
      DB.getRetencionesPeriodo(iniAnio, fin),
      DB.getFelImportados(iniAnio, fin)
    ]);
    const mesDe = x => parseInt((x.fecha||'').slice(5,7))||0;
    let remanente = 0;
    let actual = null;
    for (let m = 1; m <= mes; m++) {
      const d = this._agregar(
        facturas.filter(x=>mesDe(x)===m), compras.filter(x=>mesDe(x)===m),
        egresosIva.filter(x=>mesDe(x)===m), retenciones.filter(x=>mesDe(x)===m),
        fel.filter(x=>mesDe(x)===m));
      const cred = this._fuenteCredito==='fel' ? d.creditoFel : d.credito;
      const saldo = Math.round((d.debito - cred - d.retIva - remanente)*100)/100;
      if (m === mes) actual = { ...d, creditoUsado: cred, remanenteAnterior: remanente, saldo };
      remanente = saldo < 0 ? -saldo : 0;
    }
    return actual;
  },

  /* ISR mensual — régimen opcional simplificado (Dto. 10-2012):
     5% sobre los primeros Q30,000 y 7% sobre el excedente. */
  _isrSimplificado(base) {
    const b = Math.max(0, Number(base)||0);
    return b <= 30000 ? b*0.05 : (30000*0.05 + (b-30000)*0.07);
  },

  async _renderTab() {
    const el = document.getElementById('cont-content');
    if (!el) return;
    UI.loading(el);
    const { mes, anio, periodo } = this._rango();
    const nombreMes = new Date(anio, mes-1, 1).toLocaleDateString('es-GT',{month:'long',year:'numeric'});
    const pequeno = (this._fiscal?.regimen_iva||'general').toLowerCase().startsWith('peque');
    const utilidades = (Number(this._fiscal?.tasa_isr)||0.05) >= 0.2;



    /* ── LIBRO DE VENTAS ─────────────────────────── */
    if (this._tab === 'ventas') {
      const d = await this._datos();
      const felEmiSinImp = await DB.getFelSinImportar('emitida').catch(()=>[]);
      el.innerHTML = `
        ${felEmiSinImp.length > 0 ? `
        <div class="card" style="background:linear-gradient(135deg,var(--green)15 0%,var(--cyan)15 100%);margin-bottom:14px;border-left:4px solid var(--green)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div class="card-sub" style="margin:0;color:var(--green)">📥 Importar ventas desde FEL del SAT</div>
              <p style="font-size:12px;color:var(--text2);margin:6px 0 0 0">
                <b>${felEmiSinImp.length} facturas emitidas</b> del FEL para registrar como ventas/ingresos.
                Total: <b>${UI.q(felEmiSinImp.reduce((s,f)=>s+(Number(f.gran_total)||0),0))}</b>
              </p>
            </div>
            <button class="btn btn-green" onclick="Modulos.contabilidad._importarFelVentas()">⬆️ Importar todo (${felEmiSinImp.length})</button>
          </div>
        </div>` : ''}
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:12px">
          <button class="btn btn-amber btn-sm" onclick="Modulos.facturacion.modalFactura()">＋ Registrar Venta Manual</button>
          <button class="btn btn-cyan btn-sm" onclick="Modulos.contabilidad.exportarVentas()">⬇️ Exportar CSV</button>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Serie/No.</th><th>NIT</th><th>Cliente</th><th>Base</th><th>IVA</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${d.facturas.map(f=>`<tr style="${/anulad/i.test(f.estado||'')?'opacity:.5;text-decoration:line-through':''}">
            <td class="mono-sm">${UI.fecha(f.fecha)}</td>
            <td class="mono-sm">${f.fel_serie||''} ${f.fel_numero||f.num||'—'}</td>
            <td class="mono-sm">${f.nit||'CF'}</td>
            <td>${f.nombre_receptor||'—'}</td>
            <td class="mono-sm">${UI.q(f.subtotal)}</td>
            <td class="mono-sm text-amber">${UI.q(f.iva)}</td>
            <td class="mono-sm text-green"><b>${UI.q(f.total)}</b></td>
            <td><span class="badge badge-${/anulad/i.test(f.estado||'')?'red':'green'}">${f.estado||'vigente'}</span></td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-sm btn-ghost" onclick="Modulos.facturacion.modalFactura('${f.id}')" title="Ver/Editar">✏️ Editar</button>
                <button class="btn btn-sm btn-ghost text-red" onclick="Modulos.finanzas.eliminar('facturas','${f.id}')" title="Eliminar">🗑️</button>
              </div>
            </td>
          </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">Sin facturas en el periodo</td></tr>'}</tbody>
        </table></div>
        <div style="margin-top:10px;font-size:12px;color:var(--text3)">Total facturado vigente: <b>${UI.q(d.ventasTotal)}</b> · Débito fiscal: <b>${UI.q(d.debito)}</b></div>`;
    }

    /* ── LIBRO DE COMPRAS ────────────────────────── */
    else if (this._tab === 'compras') {
      const d = await this._datos();
      const felRecSinImp = await DB.getFelSinImportar('recibida').catch(()=>[]);
      const opts = (sel) => Object.entries(this._CATS).map(([k,v])=>`<option value="${k}" ${sel===k?'selected':''}>${v.label}</option>`).join('');
      const porClasificar = d.compras.filter(c=>!/anulad/i.test(c.estado||'') && (c.categoria_gasto||'por_clasificar')==='por_clasificar');
      const filasC = d.compras.map(c=>{
        const cat = c.categoria_gasto||'por_clasificar';
        const ded = c.deducible, cred = c.credito_iva;
        return `<tr style="${/anulad/i.test(c.estado||'')?'opacity:.5':''}${cat==='por_clasificar'?'background:var(--amber-dim,#3a2f0a)':''}">
        <td class="mono-sm">${UI.fecha(c.fecha)}</td>
        <td class="mono-sm">${c.nit_proveedor||'—'}</td>
        <td>${c.proveedor_nombre||'—'}</td>
        <td class="mono-sm">${c.num_factura||c.num||'—'}</td>
        <td class="mono-sm">${UI.q(c.subtotal)}</td>
        <td class="mono-sm ${cred?'text-cyan':'text-gray'}" title="${cred?'genera crédito IVA':'sin crédito IVA'}">${cred?UI.q(c.iva):'—'}</td>
        <td class="mono-sm"><b>${UI.q(c.total)}</b></td>
        <td>
          <select class="form-select" style="font-size:11px;padding:3px 6px;min-width:150px" onchange="Modulos.contabilidad._clasificarCompra('${c.id}', this.value, this.dataset.prov)" data-prov="${(c.proveedor_nombre||'').replace(/"/g,'&quot;')}">${opts(cat)}</select>
          ${cat!=='por_clasificar'?`<div style="font-size:9px;margin-top:3px;display:flex;gap:4px;align-items:center">
            <span class="badge badge-${ded?'green':'red'}" style="font-size:8px;cursor:pointer" title="Clic para cambiar: deducible de ISR" onclick="Modulos.contabilidad._toggleFlag('${c.id}','deducible',${!ded})">ISR ${ded?'✓':'✗'}</span>
            <span class="badge badge-${cred?'cyan':'gray'}" style="font-size:8px;cursor:pointer" title="Crédito IVA solo si la factura está a nombre del taller (NIT). Clic para cambiar." onclick="Modulos.contabilidad._toggleFlag('${c.id}','credito_iva',${!cred})">IVA ${cred?'✓':'✗'}</span>
          </div>`:''}
        </td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-xs btn-ghost" onclick="Modulos.compras.verCompra('${c.id}')" title="Ver detalle">👁️ Ver</button>
            <button class="btn btn-xs btn-ghost text-red" onclick="Modulos.compras.eliminarCompra('${c.id}')" title="Eliminar">🗑️</button>
          </div>
        </td></tr>`;
      });
      const filasE = d.egresosIva.map(e=>`<tr>
        <td class="mono-sm">${UI.fecha(e.fecha)}</td>
        <td class="mono-sm">—</td>
        <td>${e.proveedor||e.concepto||'—'}</td>
        <td class="mono-sm">${e.num_factura||'—'}</td>
        <td class="mono-sm">${UI.q((Number(e.monto)||0)-(Number(e.iva_credito)||0))}</td>
        <td class="mono-sm text-cyan">${UI.q(e.iva_credito)}</td>
        <td class="mono-sm"><b>${UI.q(e.monto)}</b></td>
        <td><span class="badge badge-gray">gasto manual</span></td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-xs btn-ghost" onclick="Modulos.finanzas.modalEgreso('${e.id}')" title="Editar">✏️ Editar</button>
            <button class="btn btn-xs btn-ghost text-red" onclick="Modulos.finanzas.eliminar('egresos','${e.id}')" title="Eliminar">🗑️</button>
          </div>
        </td></tr>`);
      const totDed = d.compras.filter(c=>c.deducible && !/anulad/i.test(c.estado||'')).reduce((s,c)=>s+(Number(c.total)||0),0);
      const totNoDed = d.compras.filter(c=>!c.deducible && (c.categoria_gasto||'por_clasificar')!=='por_clasificar' && !/anulad/i.test(c.estado||'')).reduce((s,c)=>s+(Number(c.total)||0),0);
      el.innerHTML = `
        ${felRecSinImp.length>0?`
        <div class="card" style="background:linear-gradient(135deg,var(--cyan)15 0%,var(--blue)15 100%);margin-bottom:12px;border-left:4px solid var(--cyan)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div class="card-sub" style="margin:0;color:var(--cyan)">📥 Importar compras desde FEL del SAT</div>
              <p style="font-size:12px;color:var(--text2);margin:6px 0 0 0"><b>${felRecSinImp.length} facturas recibidas</b> del FEL para registrar. Total: <b>${UI.q(felRecSinImp.reduce((s,f)=>s+(Number(f.gran_total)||0),0))}</b></p>
            </div>
            <button class="btn btn-cyan" onclick="Modulos.compras._importarFel()">⬆️ Importar todo (${felRecSinImp.length})</button>
          </div>
        </div>`:''}
        ${porClasificar.length>0?`
        <div class="alert alert-amber" style="margin-bottom:12px">
          <div class="alert-icon">⏳</div>
          <div class="alert-body" style="font-size:12px">
            <b>${porClasificar.length} compras sin clasificar</b> (${UI.q(porClasificar.reduce((s,c)=>s+(Number(c.total)||0),0))}). Mientras estén "Por clasificar" <b>NO cuentan</b> como costo deducible ni crédito de IVA — así protegemos el Estado de Resultados y la fiscalización. Asigná la categoría en cada fila; el proveedor se recuerda para próximas importaciones.
          </div>
        </div>`:''}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:12px">
          <div style="font-size:12px;color:var(--text2)">✅ Deducible: <b class="text-green">${UI.q(totDed)}</b> · 🚫 No deducible: <b class="text-red">${UI.q(totNoDed)}</b></div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-amber btn-sm" onclick="Modulos.compras.modalCompra()">＋ Nueva Compra</button>
            <button class="btn btn-green btn-sm" onclick="Modulos.finanzas.exportExcelContador('${this._rango().ini}','${this._rango().fin}')">⬇️ Excel contador</button>
            <button class="btn btn-cyan btn-sm" onclick="Modulos.contabilidad.exportarCompras()">⬇️ CSV</button>
          </div>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>NIT</th><th>Proveedor</th><th>Factura</th><th>Base</th><th>IVA crédito</th><th>Total</th><th>Clasificación fiscal</th><th>Acciones</th></tr></thead>
          <tbody>${[...filasC,...filasE].join('')||'<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">Sin compras/gastos con IVA en el periodo</td></tr>'}</tbody>
        </table></div>`;
    }


    /* ── IMPORTAR FEL (CSV de la Consulta FEL de SAT) ── */
    else if (this._tab === 'fel') {
      const { ini, fin } = this._rango();
      const importados = await DB.getFelImportados(ini, fin);
      const rec = importados.filter(x=>x.naturaleza!=='emitida');
      const emi = importados.filter(x=>x.naturaleza==='emitida');
      el.innerHTML = `
        <div class="card" style="max-width:720px;margin-bottom:16px">
          <div class="card-sub mb-3">⬆️ Importar reporte FEL de SAT (XLS / CSV)</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
            Descarga los reportes desde la <b>Agencia Virtual SAT → Consulta FEL</b> → exportar XLS (o CSV).
            Puedes subir <b>varios archivos a la vez</b> (recibidas y emitidas de distintos meses).
            El tipo se detecta automáticamente si el nombre incluye "Recibid" o "Emitid".
          </div>
          <div class="form-group">
            <label class="form-label">Archivos XLS / CSV (uno o varios)</label>
            <input class="form-input" type="file" id="fel-file" accept=".csv,.xls,.xlsx,text/csv"
              multiple onchange="Modulos.contabilidad._leerFel(this)">
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px">
            <div id="fel-preview"></div>
            <button class="btn btn-amber btn-sm" onclick="Modulos.contabilidad.modalFelImportado()">＋ Registrar DTE Manual</button>
          </div>
        </div>

        ${importados.length?`
        <div class="card" style="max-width:720px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <div class="card-sub" style="margin:0">📚 FEL importado · ${nombreMes}</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm btn-amber" onclick="Modulos.contabilidad.modalFelImportado()">＋ Registrar DTE Manual</button>
              ${rec.length?`<button class="btn btn-sm btn-danger" onclick="Modulos.contabilidad.eliminarFelPeriodo('recibida')">🗑️ Recibidas (${rec.length})</button>`:''}
              ${emi.length?`<button class="btn btn-sm btn-danger" onclick="Modulos.contabilidad.eliminarFelPeriodo('emitida')">🗑️ Emitidas (${emi.length})</button>`:''}
            </div>
          </div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
            📥 Recibidas: <b>${rec.length}</b> DTE · IVA crédito <b>${UI.q(rec.reduce((s,x)=>s+(Number(x.iva)||Math.round((Number(x.gran_total)||0)/1.12*0.12*100)/100),0))}</b>
            ${rec.some(x=>x.es_combustible)?`· ⛽ combustible <b>${UI.q(rec.filter(x=>x.es_combustible).reduce((s,x)=>s+(Number(x.gran_total)||0),0))}</b>`:''}
            &nbsp;·&nbsp; 📤 Emitidas: <b>${emi.length}</b> DTE · total <b>${UI.q(emi.reduce((s,x)=>s+(Number(x.gran_total)||0),0))}</b>
          </div>
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Serie/No.</th><th>Contraparte</th><th>Total</th><th>IVA</th><th>Acciones</th></tr></thead>
            <tbody>${importados.slice(0,60).map(x=>`<tr style="${/anulad/i.test(x.estado||'')?'opacity:.5':''}">
              <td class="mono-sm">${UI.fecha(x.fecha)}</td>
              <td>
                <span class="badge badge-${x.naturaleza==='emitida'?'green':'cyan'}" style="font-size:9px">${x.naturaleza==='emitida'?'📤':'📥'} ${x.tipo_doc||'DTE'}</span>
                ${x.es_combustible?'<span class="badge badge-amber" style="font-size:9px;margin-left:3px">⛽</span>':''}
              </td>
              <td class="mono-sm">${x.serie||''} ${x.numero_dte||''}</td>
              <td>${x.nombre_emisor||'—'}<div style="font-size:10px;color:var(--text3)">${x.nit_emisor||''}</div></td>
              <td class="mono-sm"><b>${UI.q(x.gran_total)}</b></td>
              <td class="mono-sm text-cyan">${x.iva?UI.q(x.iva):'—'}</td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-xs btn-ghost" onclick="Modulos.contabilidad.modalFelImportado('${x.id}')" title="Editar DTE">✏️ Editar</button>
                  <button class="btn btn-xs btn-ghost text-red" onclick="Modulos.eliminarRegistro('fel_importados','${x.id}','este DTE',()=>Modulos.contabilidad._renderTab())" title="Eliminar">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}</tbody>
          </table></div>
          ${importados.length>60?`<div style="font-size:11px;color:var(--text3);margin-top:6px">Mostrando 60 de ${importados.length}.</div>`:''}
        </div>`:''}`;
    }

    /* ── RETENCIONES (IVA/ISR) — CRUD ───────────────── */
    else if (this._tab === 'retenciones') {
      const { ini, fin } = this._rango();
      const rets = await DB.getRetencionesPeriodo(ini, fin);
      const n = v => Number(v)||0;
      const sum = (tp,nat) => rets.filter(r=>r.tipo===tp && (r.naturaleza||'recibida')===nat).reduce((s,r)=>s+n(r.monto),0);
      const sufISR = sum('ISR','recibida'), sufIVA = sum('IVA','recibida');
      const efeISR = sum('ISR','emitida'),  efeIVA = sum('IVA','emitida');
      const natBadge = nat => nat==='emitida'
        ? '<span class="badge badge-amber">Efectuada (yo retuve)</span>'
        : '<span class="badge badge-cyan">Sufrida (me retuvieron)</span>';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">
          <div class="card-sub" style="margin:0">🧾 Retenciones · ${nombreMes}</div>
          <button class="btn btn-amber btn-sm" onclick="Modulos.contabilidad.modalRetencion()">＋ Nueva Retención</button>
        </div>
        <div class="kpi-grid" style="margin-bottom:14px">
          ${UI.kpiCard({ icon:'🧾', clase:'green', label:'ISR sufrido (acreditable)', value: sufISR, money:true })}
          ${UI.kpiCard({ icon:'💳', clase:'cyan', label:'IVA sufrido (crédito)', value: sufIVA, money:true })}
          ${UI.kpiCard({ icon:'📤', clase:'amber', label:'Efectuadas por enterar a SAT', value: efeISR+efeIVA, money:true, trend:`ISR ${UI.q(efeISR)} · IVA ${UI.q(efeIVA)}` })}
        </div>
        <div class="table-wrap"><table class="data-table" style="font-size:12px">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Naturaleza</th><th>Documento</th><th>Contraparte</th><th style="text-align:right">Base</th><th style="text-align:right">%</th><th style="text-align:right">Monto</th><th style="text-align:right">Acciones</th></tr></thead>
          <tbody>
            ${rets.map(r=>`<tr>
              <td class="mono-sm">${UI.fecha(r.fecha)}</td>
              <td><span class="badge badge-${r.tipo==='ISR'?'purple':'cyan'}">${r.tipo}</span></td>
              <td>${natBadge(r.naturaleza||'recibida')}</td>
              <td class="mono-sm">${r.documento||'—'}</td>
              <td>${r.contraparte||'—'}</td>
              <td class="mono-sm" style="text-align:right">${UI.q(r.base)}</td>
              <td class="mono-sm" style="text-align:right">${n(r.porcentaje)}%</td>
              <td class="mono-sm text-amber" style="text-align:right"><b>${UI.q(r.monto)}</b></td>
              <td style="text-align:right;white-space:nowrap">
                ${Modulos.btnAccion('editar', `Modulos.contabilidad.editarRetencion('${r.id}')`)}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('retenciones','${r.id}','esta retención',()=>Modulos.contabilidad._renderTab())`)}
              </td>
            </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">Sin retenciones en este mes. Registrá la primera con “＋ Nueva Retención”.</td></tr>'}
          </tbody>
        </table></div>
        <div class="alert alert-cyan" style="margin-top:12px"><div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:11px"><b>Sufridas</b>: te las retuvo un cliente/agente (acreditan tu ISR/IVA). <b>Efectuadas</b>: vos retuviste y debés enterarlas a la SAT.</div></div>`;
    }

    /* ── OBLIGACIONES ────────────────────────────── */
    else if (this._tab === 'obligaciones') {
      const obligaciones = await DB.getObligaciones(anio);
      const hoy = new Date().toISOString().slice(0,10);
      const utilidades = (Number(this._fiscal?.tasa_isr)||0.05) >= 0.2;
      const pequeno    = (this._fiscal?.regimen_iva||'general').toLowerCase().startsWith('peque');
      /* ISR anual: vence 31 de marzo del año siguiente */
      const venceAnual = `${anio+1}-03-31`;
      const alertaAnual = utilidades && hoy >= `${anio}-10-01`; /* aviso desde oct */
      const yaHayAnual  = obligaciones.some(o=>o.tipo==='ISR-ANUAL' && o.periodo===`${anio}-ANUAL`);
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">
          <div class="card-sub" style="margin:0">📅 Obligaciones fiscales · ${anio}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm btn-amber" onclick="Modulos.contabilidad.modalObligacion()">＋ Registrar Obligación</button>
            <button class="btn btn-sm btn-amber" onclick="Modulos.contabilidad.registrarObligacion('IVA')">＋ IVA del mes (${nombreMes})</button>
            ${!utilidades ? `<button class="btn btn-sm btn-amber" onclick="Modulos.contabilidad.registrarObligacion('ISR')">＋ ISR del mes</button>` : ''}
          </div>
        </div>
        ${alertaAnual && !yaHayAnual ? `
        <div class="alert alert-amber" style="margin-bottom:14px">
          <div class="alert-icon">⚠️</div>
          <div class="alert-body">
            <b>ISR Anual ${anio} (SAT-1411)</b> — vence el <b>31 de marzo de ${anio+1}</b><br>
            <span style="font-size:12px">Como Régimen Sobre Utilidades, debes presentar la declaración anual en Declaraguate. Usa el formulario SAT-1411 de la pestaña Formularios SAT.</span>
            <div style="margin-top:8px">
              <button class="btn btn-sm btn-amber" onclick="Modulos.contabilidad.registrarObligacionAnual(${anio})">📅 Registrar obligación ISR-ANUAL ${anio}</button>
              <button class="btn btn-sm btn-ghost" style="margin-left:6px" onclick="Modulos.contabilidad._ir('formularios_sat')">📋 Ir a Formularios SAT</button>
            </div>
          </div>
        </div>` : ''}
        ${!pequeno && !utilidades ? `
        <div class="alert" style="margin-bottom:14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:12px">
            <b>Régimen Opcional Simplificado:</b> el ISR se paga mensualmente (SAT-1311). No hay declaración anual de ISR separada. El acumulado del año queda cubierto con los pagos mensuales.
          </div>
        </div>` : ''}
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Impuesto</th><th>Periodo</th><th>Calculado</th><th>Pagado</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${obligaciones.map(o=>{
            const vencida = o.estado!=='pagado' && o.fecha_vencimiento && o.fecha_vencimiento < hoy;
            return `<tr>
              <td><b>${o.tipo}</b><div style="font-size:10px;color:var(--text3)">${o.notas||''}</div></td>
              <td class="mono-sm">${o.periodo}</td>
              <td class="mono-sm text-amber">${UI.q(o.monto_calculado)}</td>
              <td class="mono-sm text-green">${o.monto_pagado?UI.q(o.monto_pagado):'—'}</td>
              <td class="mono-sm ${vencida?'text-red':''}">${o.fecha_vencimiento?UI.fecha(o.fecha_vencimiento):'—'}${vencida?' ⚠️':''}</td>
              <td><span class="badge badge-${o.estado==='pagado'?'green':(vencida?'red':'amber')}">${o.estado==='pagado'?'Pagado':(vencida?'Vencida':'Pendiente')}</span></td>
              <td><div style="display:flex;gap:4px">
                ${o.estado==='pagado'?'':`<button class="btn btn-sm btn-green" onclick="Modulos.contabilidad.marcarPagada('${o.id}')">💵 Pagada</button>`}
                <button class="btn btn-sm btn-ghost" onclick="Modulos.contabilidad.modalObligacion('${o.id}')" title="Editar">✏️ Editar</button>
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('obligaciones_fiscales','${o.id}','la obligación ${o.tipo} ${o.periodo}',()=>Modulos.contabilidad._renderTab())`)}
              </div></td>
            </tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin obligaciones registradas este año. Usá los botones “＋ IVA/ISR del mes” de arriba para generarlas.</td></tr>'}</tbody>
        </table></div>
        <div class="alert alert-cyan" style="margin-top:14px">
          <div class="alert-icon">📅</div>
          <div class="alert-body" style="font-size:12px">Registra aquí cada declaración al calcularla y márcala <b>pagada</b> al presentar en Declaraguate (boleta SAT-2000). Estos estados alimentan el <b>Calendario</b> y el acreditamiento del ISO al ISR trimestral.</div>
        </div>`;
    }

    /* ── FORMULARIOS SAT (Declaraguate) ──────────── */
    else if (this._tab === 'formularios_sat') {
      await this.sat.renderLista(this);
    }
  },

  /* ── Registrar obligaciones ── */
  async registrarObligacion(tipo) {
    const { mes, anio, periodo } = this._rango();
    const pequeno = (this._fiscal?.regimen_iva||'general').toLowerCase().startsWith('peque');
    let monto, vence, notas;
    if (tipo === 'IVA') {
      const d = await this._ivaConArrastre();
      monto = pequeno ? Math.round(d.ventasTotal*0.05*100)/100 : Math.max(0, d.saldo);
      vence = new Date(anio, mes+1, 0).toISOString().slice(0,10);
      notas = pequeno ? 'SAT-2046 Pequeño Contribuyente' : `SAT-2237 IVA General (crédito: ${this._fuenteCredito==='fel'?'FEL SAT':'sistema'})`;
    } else {
      const d = await this._datos();
      monto = Math.max(0, Math.round((this._isrSimplificado(d.ventasNetas)-d.retIsr)*100)/100);
      vence = new Date(anio, mes, 10).toISOString().slice(0,10);
      notas = 'SAT-1311 ISR Simplificado';
    }
    const { error } = await DB.upsertObligacion({ tipo, periodo, monto_calculado: monto, fecha_vencimiento: vence, estado:'pendiente', notas });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(`Obligación ${tipo} ${periodo} registrada ✓ (${UI.q(monto)})`);
    this._ir('obligaciones');
  },

  async registrarObligacionTrimestre(tipo, t, monto) {
    const { anio } = this._rango();
    const mesSig = t*3;  // índice 0-based del mes siguiente al trimestre
    const vence = tipo==='ISR'
      ? new Date(anio, mesSig, 10).toISOString().slice(0,10)      // 10 días después del cierre
      : new Date(anio, mesSig+1, 0).toISOString().slice(0,10);    // fin del mes siguiente
    const { error } = await DB.upsertObligacion({
      tipo, periodo: `${anio}-T${t}`, monto_calculado: monto,
      fecha_vencimiento: vence, estado:'pendiente',
      notas: tipo==='ISR' ? 'SAT-1361 ISR Trimestral (cierre parcial)' : 'SAT-1608 ISO trimestral'
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(`Obligación ${tipo} T${t} registrada ✓ (${UI.q(monto)})`);
    this._ir('obligaciones');
  },

  async registrarObligacionAnual(anio) {
    anio = anio || this._rango().anio;
    const vence = `${Number(anio)+1}-03-31`;
    const { error } = await DB.upsertObligacion({
      tipo: 'ISR-ANUAL', periodo: `${anio}-ANUAL`,
      monto_calculado: 0, fecha_vencimiento: vence,
      estado: 'pendiente', notas: `SAT-1411 ISR Anual Sobre Utilidades — liquidar en Declaraguate`
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(`Obligación ISR-ANUAL ${anio} registrada ✓ — vence ${UI.fecha(vence)}`, 'success', 5000);
    this._renderTab();
  },

  async marcarPagada(id) {
    const obligaciones = await DB.getObligaciones(this._rango().anio);
    const o = obligaciones.find(x=>x.id===id); if (!o) return;
    const ok = await UI.confirmar(`¿Marcar como pagada la obligación <b>${o.tipo} ${o.periodo}</b> por <b>${UI.q(o.monto_calculado)}</b>?`, 'Confirmar');
    if (!ok) return;
    const { error } = await DB.upsertObligacion({ id, estado:'pagado', monto_pagado:o.monto_calculado, fecha_pago: new Date().toISOString().slice(0,10) });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast('Obligación pagada ✓');
    this._renderTab();
  },

  async modalFelImportado(id=null) {
    let f = {};
    if (id) {
      const { ini, fin } = this._rango();
      const importados = await DB.getFelImportados(ini, fin);
      f = importados.find(x=>x.id===id) || {};
    }
    const nat = f.naturaleza || 'recibida';
    const tipo = f.tipo_doc || 'FCAM';
    const estado = f.estado || 'vigente';
    
    UI.modal(id ? '✏️ Editar DTE Importado' : '＋ Nuevo DTE Manual', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Naturaleza *</label>
          <select class="form-select" id="fel-import-nat">
            <option value="recibida" ${nat==='recibida'?'selected':''}>📥 Recibida (Compra)</option>
            <option value="emitida" ${nat==='emitida'?'selected':''}>📤 Emitida (Venta)</option>
          </select></div>
        <div class="form-group"><label class="form-label">Tipo Documento *</label>
          <select class="form-select" id="fel-import-tipo">
            <option value="FCAM" ${tipo==='FCAM'?'selected':''}>Factura (DTE)</option>
            <option value="FPEST" ${tipo==='FPEST'?'selected':''}>Factura Especial</option>
            <option value="NCRE" ${tipo==='NCRE'?'selected':''}>Nota de Crédito</option>
            <option value="NDEB" ${tipo==='NDEB'?'selected':''}>Nota de Débito</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" type="date" id="fel-import-fecha" value="${f.fecha || new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Estado *</label>
          <select class="form-select" id="fel-import-estado">
            <option value="vigente" ${estado==='vigente'?'selected':''}>Vigente</option>
            <option value="anulado" ${estado==='anulado'?'selected':''}>Anulado</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Serie *</label>
          <input class="form-input" id="fel-import-serie" value="${f.serie||''}" placeholder="e.g. 5385F551"></div>
        <div class="form-group"><label class="form-label">Número DTE *</label>
          <input class="form-input" id="fel-import-numero" value="${f.numero_dte||''}" placeholder="e.g. 123456789"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">NIT Contraparte *</label>
          <input class="form-input" id="fel-import-nit" value="${f.nit_emisor||''}" placeholder="e.g. 883921-2"></div>
        <div class="form-group"><label class="form-label">Nombre Contraparte *</label>
          <input class="form-input" id="fel-import-nombre" value="${f.nombre_emisor||''}" placeholder="e.g. Repuestos El Amigo"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Total (Q) *</label>
          <input class="form-input" type="number" step="0.01" id="fel-import-total" value="${f.gran_total||''}" placeholder="0.00" oninput="Modulos.contabilidad._autoCalcIva()"></div>
        <div class="form-group"><label class="form-label">IVA (Q)</label>
          <input class="form-input" type="number" step="0.01" id="fel-import-iva" value="${f.iva||''}" placeholder="Auto-calculado si queda vacío"></div>
      </div>
      <div class="form-group" id="fel-import-combustible-box">
        <label class="form-label" style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="fel-import-combustible" ${f.es_combustible?'checked':''}> Es combustible (para IDP/IVA crédito especial)
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.contabilidad.guardarFelImportado('${id||''}')">${id?'Guardar Cambios':'Crear DTE'}</button>
      </div>
    `, '580px');
  },

  _autoCalcIva() {
    const tot = parseFloat(document.getElementById('fel-import-total')?.value)||0;
    const ivaEl = document.getElementById('fel-import-iva');
    if (ivaEl && !ivaEl.value && tot > 0) {
      ivaEl.placeholder = (tot - (tot / 1.12)).toFixed(2);
    }
  },

  async guardarFelImportado(id=null) {
    const nat = document.getElementById('fel-import-nat')?.value;
    const tipo = document.getElementById('fel-import-tipo')?.value;
    const fecha = document.getElementById('fel-import-fecha')?.value;
    const estado = document.getElementById('fel-import-estado')?.value;
    const serie = document.getElementById('fel-import-serie')?.value.trim();
    const numero = document.getElementById('fel-import-numero')?.value.trim();
    const nit = document.getElementById('fel-import-nit')?.value.trim();
    const nombre = document.getElementById('fel-import-nombre')?.value.trim();
    const total = parseFloat(document.getElementById('fel-import-total')?.value)||0;
    let iva = parseFloat(document.getElementById('fel-import-iva')?.value);
    if (isNaN(iva)) {
      iva = total - (total / 1.12);
    }
    const esCombustible = document.getElementById('fel-import-combustible')?.checked || false;

    if (!fecha || !serie || !numero || !nit || !nombre || total <= 0) {
      UI.toast('Por favor completa todos los campos requeridos y con valores válidos','error');
      return;
    }

    const fields = {
      naturaleza: nat,
      tipo_doc: tipo,
      fecha,
      estado,
      serie,
      numero_dte: numero,
      nit_emisor: nit,
      nombre_emisor: nombre,
      gran_total: total,
      iva,
      es_combustible: esCombustible
    };
    if (id) fields.id = id;

    UI.toast('Guardando registro FEL...','info');
    const { error } = await DB.upsertFelImportado(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal();
    UI.toast('DTE guardado exitosamente ✓');
    this._renderTab();
  },

  async modalObligacion(id=null) {
    let o = {};
    if (id) {
      const obligaciones = await DB.getObligaciones(this._rango().anio);
      o = obligaciones.find(x=>x.id===id) || {};
    }
    const tipo = o.tipo || 'IVA';
    const estado = o.estado || 'pendiente';
    UI.modal(id ? '✏️ Editar Obligación Fiscal' : '＋ Registrar Obligación Fiscal', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Impuesto *</label>
          <select class="form-select" id="ob-tipo">
            ${['IVA','ISR','ISO','ISR-ANUAL','Retenciones'].map(t=>`<option value="${t}" ${tipo===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Periodo *</label>
          <input class="form-input mono-sm" id="ob-periodo" value="${o.periodo || `${this._rango().anio}-${String(this._rango().mes).padStart(2,'0')}`}" placeholder="e.g. 2026-06 o 2026-ANUAL"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Monto Calculado (Q) *</label>
          <input class="form-input" type="number" step="0.01" id="ob-monto-calc" value="${o.monto_calculado||0}"></div>
        <div class="form-group"><label class="form-label">Monto Pagado (Q)</label>
          <input class="form-input" type="number" step="0.01" id="ob-monto-pag" value="${o.monto_pagado||''}" placeholder="Q0.00"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha Vencimiento *</label>
          <input class="form-input" type="date" id="ob-fecha-venc" value="${o.fecha_vencimiento || ''}"></div>
        <div class="form-group"><label class="form-label">Estado *</label>
          <select class="form-select" id="ob-estado">
            <option value="pendiente" ${estado==='pendiente'?'selected':''}>Pendiente</option>
            <option value="pagado" ${estado==='pagado'?'selected':''}>Pagado</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha de Pago</label>
          <input class="form-input" type="date" id="ob-fecha-pago" value="${o.fecha_pago || ''}"></div>
        <div class="form-group"><label class="form-label">Notas / Formulario</label>
          <input class="form-input" id="ob-notas" value="${o.notas||''}" placeholder="SAT-2237 IVA General"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.contabilidad.guardarObligacion('${id||''}')">${id?'Guardar Cambios':'Registrar Obligación'}</button>
      </div>
    `, '540px');
  },

  async guardarObligacion(id=null) {
    const tipo = document.getElementById('ob-tipo')?.value;
    const periodo = document.getElementById('ob-periodo')?.value.trim();
    const mCalc = parseFloat(document.getElementById('ob-monto-calc')?.value)||0;
    const mPag = parseFloat(document.getElementById('ob-monto-pag')?.value)||0;
    const venc = document.getElementById('ob-fecha-venc')?.value;
    const estado = document.getElementById('ob-estado')?.value;
    const fPago = document.getElementById('ob-fecha-pago')?.value || null;
    const notas = document.getElementById('ob-notas')?.value.trim();

    if (!periodo || !venc) {
      UI.toast('Por favor completa el Periodo y la Fecha de Vencimiento','error');
      return;
    }

    const fields = {
      tipo, periodo,
      monto_calculado: mCalc,
      monto_pagado: mPag || (estado==='pagado' ? mCalc : 0),
      fecha_vencimiento: venc,
      estado,
      fecha_pago: fPago || (estado==='pagado' ? new Date().toISOString().slice(0,10) : null),
      notas
    };
    if (id) fields.id = id;

    const { error } = await DB.upsertObligacion(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal();
    UI.toast('Obligación guardada exitosamente ✓');
    this._renderTab();
  },

  /* ── Retención (IVA/ISR, recibida o emitida) — crear o editar ── */
  modalRetencion(tipoDefault='IVA', ret=null) {
    const r = ret || {};
    const tipo = r.tipo || tipoDefault;
    UI.modal(ret ? '✏️ Editar retención' : '➕ Registrar retención', `
      <input type="hidden" id="ret-id" value="${r.id||''}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Impuesto *</label>
          <select class="form-select" id="ret-tipo">
            <option ${tipo==='IVA'?'selected':''}>IVA</option>
            <option ${tipo==='ISR'?'selected':''}>ISR</option>
          </select></div>
        <div class="form-group"><label class="form-label">Naturaleza *</label>
          <select class="form-select" id="ret-nat">
            <option value="recibida" ${(r.naturaleza||'recibida')==='recibida'?'selected':''}>Me la efectuaron (resta de mi impuesto)</option>
            <option value="emitida" ${r.naturaleza==='emitida'?'selected':''}>Yo la efectué (agente de retención)</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" id="ret-fecha" type="date" value="${r.fecha||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Documento / constancia</label>
          <input class="form-input" id="ret-doc" placeholder="No. de constancia o factura" value="${(r.documento||'').replace(/"/g,'&quot;')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Contraparte</label>
        <input class="form-input" id="ret-contra" placeholder="Cliente o proveedor que retiene/retuvo" value="${(r.contraparte||'').replace(/"/g,'&quot;')}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Base (Q)</label>
          <input class="form-input" id="ret-base" type="number" min="0" step="0.01" value="${r.base??''}" oninput="Modulos.contabilidad._calcRet()"></div>
        <div class="form-group"><label class="form-label">% retención</label>
          <input class="form-input" id="ret-pct" type="number" min="0" step="0.01" value="${r.porcentaje??15}" oninput="Modulos.contabilidad._calcRet()"></div>
        <div class="form-group"><label class="form-label">Monto retenido (Q) *</label>
          <input class="form-input" id="ret-monto" type="number" min="0" step="0.01" value="${r.monto??''}"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.contabilidad.guardarRetencion()">Guardar</button>
      </div>`);
  },

  _calcRet() {
    const base = parseFloat(document.getElementById('ret-base')?.value)||0;
    const pct = parseFloat(document.getElementById('ret-pct')?.value)||0;
    const m = document.getElementById('ret-monto');
    if (m) m.value = (Math.round(base*pct)/100).toFixed(2);
  },

  async guardarRetencion() {
    const monto = parseFloat(document.getElementById('ret-monto')?.value)||0;
    if (monto<=0) { UI.toast('El monto retenido es obligatorio','error'); return; }
    const id = document.getElementById('ret-id')?.value || null;
    const payload = {
      tipo: document.getElementById('ret-tipo')?.value||'IVA',
      naturaleza: document.getElementById('ret-nat')?.value||'recibida',
      fecha: document.getElementById('ret-fecha')?.value||new Date().toISOString().slice(0,10),
      documento: document.getElementById('ret-doc')?.value||null,
      contraparte: document.getElementById('ret-contra')?.value||null,
      base: parseFloat(document.getElementById('ret-base')?.value)||null,
      porcentaje: parseFloat(document.getElementById('ret-pct')?.value)||null,
      monto
    };
    if (id) payload.id = id;
    const { error } = await DB.upsertRetencion(payload);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id ? 'Retención actualizada ✓' : 'Retención registrada ✓');
    this._renderTab();
  },

  async editarRetencion(id) {
    const { ini, fin } = this._rango();
    const rets = await DB.getRetencionesPeriodo(ini, fin);
    const r = rets.find(x=>x.id===id);
    if (!r) { UI.toast('Retención no encontrada','error'); return; }
    this.modalRetencion(r.tipo, r);
  },

  /* Importar facturas EMITIDAS del FEL → tabla facturas (ventas/ingresos) */
  async _importarFelVentas() {
    const sinImp = await DB.getFelSinImportar('emitida').catch(()=>[]);
    if (!sinImp.length) { UI.toast('No hay facturas emitidas pendientes de importar','info'); return; }
    const ok = await UI.confirmar(`¿Registrar ${sinImp.length} ventas desde el FEL del SAT?<br>
      <span style="font-size:12px;color:var(--text2)">Total: <b>${UI.q(sinImp.reduce((s,f)=>s+(Number(f.gran_total)||0),0))}</b> — aparecerán en Libro de Ventas e ingresos.</span>`, 'Importar');
    if (!ok) return;
    UI.toast('Importando ventas desde FEL...','info');
    const { count, omitidas, errors } = await DB.crearFacturasDesdeFeL(sinImp.map(f=>f.id));
    if (errors) UI.toast(`Se crearon ${count} ventas (${errors} errores)`,'error');
    else if (count === 0) UI.toast('Todas las ventas ya estaban registradas','info');
    else UI.toast(`✓ ${count} ventas registradas${omitidas>0?` · ${omitidas} ya existían`:''}`);
    this._renderTab();
  },

  /* ── Parser del CSV de la Consulta FEL de SAT ──────
     Tolerante: detecta delimitador (,;) y mapea columnas por
     palabras clave del encabezado (varían entre descargas). */
  _leerFel(input) {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const prev = document.getElementById('fel-preview');
    if (prev) prev.innerHTML = '<div style="font-size:12px;color:var(--text3)">Leyendo archivos…</div>';
    this._felParse = null;

    const readFile = (f) => new Promise((resolve, reject) => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'xls' || ext === 'xlsx') {
        const r = new FileReader();
        r.onload = ev => {
          try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type:'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            resolve({ rows, name: f.name });
          } catch(e) {
            reject(e);
          }
        };
        r.onerror = e => {
          reject(e);
        };
        r.readAsArrayBuffer(f);
      } else {
        const r = new FileReader();
        r.onload = ev => {
          try {
            const rows = this._csvParse(String(ev.target.result));
            resolve({ rows, name: f.name });
          } catch(e) {
            reject(e);
          }
        };
        r.readAsText(f, 'utf-8');
      }
    });

    Promise.all(files.map(f => readFile(f).catch(e => {
      return { error: e.message || String(e), name: f.name };
    })))
      .then(results => {
        const allDocs = [];
        const resumen = [];
        results.forEach(({ rows, name, error }) => {
          if (error) {
            resumen.push({ name, error });
            return;
          }
          const nat = /emiti/i.test(name) ? 'emitida' : /recib/i.test(name) ? 'recibida' : 'recibida';
          const docs = this._procesarFelRows(rows, nat);
          if (docs.length) { allDocs.push(...docs); resumen.push({ name, nat, count: docs.length }); }
          else resumen.push({ name, error: 'Sin documentos válidos' });
        });
        if (!allDocs.length) { UI.toast('No se encontraron documentos válidos','error'); return; }
        this._felParse = allDocs;
        this._mostrarPreviewFel(allDocs, resumen);
      });
  },

  _csvParse(texto) {
    const lineas = texto.replace(/^\u{FEFF}/u,'').split(/\r?\n/).filter(l=>l.trim());
    if (!lineas.length) return [];
    const delim = (lineas[0].match(/;/g)||[]).length > (lineas[0].match(/,/g)||[]).length ? ';' : ',';
    const parseLinea = l => {
      const out = []; let cur=''; let q=false;
      for (let i=0;i<l.length;i++){
        const ch=l[i];
        if (q) { if (ch==='"'){ if(l[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; }
        else if (ch==='"') q=true;
        else if (ch===delim){ out.push(cur); cur=''; }
        else cur+=ch;
      }
      out.push(cur);
      return out.map(c=>c.trim());
    };
    return lineas.map(parseLinea);
  },

  _procesarFelRows(filas, naturaleza) {
    const norm = h => {
      let s = String(h||'').toLowerCase()
        .replace(/[áàâäã]/g,'a').replace(/[éèêë]/g,'e')
        .replace(/[íìîï]/g,'i').replace(/[óòôöõ]/g,'o')
        .replace(/[úùû]/g,'u').replace(/ñ/g,'n').replace(/ç/g,'c')
        .replace(/[^a-z0-9\s_]/g,'');
      return s;
    };
    const head = filas[0].map(norm);
    const idx = re => head.findIndex(h=>re.test(h));
    const col = {
      fecha:        idx(/fecha/),
      uuid:         idx(/autorizaci/),
      tipo:         idx(/tipo/),
      serie:        idx(/serie/),
      /* "Número del DTE", NO "Número de autorización" (que matchea /numero/ primero) */
      numero:       idx(/del dte|del documento|correlativo/) >= 0 ? idx(/del dte|del documento|correlativo/) : idx(/numero(?!.*autoriz)/),
      nitEmisor:    idx(/nit.*emisor/),
      nomEmisor:    idx(/nombre.*emisor|razon.*emisor/),
      /* El receptor puede venir como "ID del receptor" o "NIT del receptor" */
      nitReceptor:  idx(/(nit|id).*receptor/),
      nomReceptor:  idx(/nombre.*receptor|razon.*receptor/),
      total:        idx(/grantotal|monto.*total|total/),
      iva:          idx(/\biva\b/),
      estado:       idx(/estado/),
      anulado:      idx(/marca.*anulad/),
      petroleo:     idx(/petroleo|petrol/)
    };
    if (col.fecha < 0 || col.total < 0) {
      return [];
    }

    const num = v => { const x = parseFloat(String(v||'').replace(/[Qq\s,]/g,'')); return isNaN(x)?0:x; };
    const fecha = v => {
      const s = String(v||'').trim().slice(0,10);
      let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? s : null;
    };
    const g = (r,i) => i>=0 ? (r[i] ?? '') : '';
    const esAnulado = r => /anulad/i.test(g(r,col.estado)) || /s[ií]/i.test(g(r,col.anulado));

    const docs = filas.slice(1).map(r => {
      const petro = col.petroleo >= 0 ? num(g(r,col.petroleo)) : 0;
      return {
        naturaleza,
        fecha:                fecha(g(r,col.fecha)),
        numero_autorizacion:  col.uuid >= 0 ? String(g(r,col.uuid)).trim()||null : null,
        tipo_doc:             g(r,col.tipo)||'FACT',
        serie:                g(r,col.serie)||null,
        numero_dte:           g(r,col.numero)||null,
        nit_emisor:           naturaleza==='recibida' ? (g(r,col.nitEmisor)||null) : (g(r,col.nitReceptor)||g(r,col.nitEmisor)||null),
        nombre_emisor:        naturaleza==='recibida' ? (g(r,col.nomEmisor)||null) : (g(r,col.nomReceptor)||g(r,col.nomEmisor)||null),
        gran_total:           num(g(r,col.total)),
        iva:                  col.iva>=0 ? num(g(r,col.iva)) : null,
        petroleo:             petro,
        es_combustible:       petro > 0,
        estado:               esAnulado(r) ? 'anulada' : 'activa'
      };
    });
    const filtered = docs.filter(d => {
      const valid = d.fecha && d.gran_total > 0;
      return valid;
    });
    return filtered;
  },

  _procesarFel(texto) {
    const rows = this._csvParse(texto);
    const nat = 'recibida';
    const docs = this._procesarFelRows(rows, nat);
    if (!docs.length) { UI.toast('No se encontraron documentos válidos en el CSV','error'); return; }
    this._felParse = docs;
    this._mostrarPreviewFel(docs, [{ name: 'archivo.csv', nat, count: docs.length }]);
  },

  _mostrarPreviewFel(docs, resumen) {
    const fechas = docs.map(d=>d.fecha).sort();
    const totIva = docs.reduce((s,d)=>s+(d.iva||Math.round(d.gran_total/1.12*0.12*100)/100),0);
    const totCombustible = docs.filter(d=>d.es_combustible).reduce((s,d)=>s+d.gran_total,0);
    const prev = document.getElementById('fel-preview');
    if (!prev) return;
    prev.innerHTML = `
      <div class="alert alert-green" style="margin-top:8px">
        <div class="alert-icon">✓</div>
        <div class="alert-body" style="font-size:12px">
          ${resumen.map(r=>r.error
            ? `<div>⚠️ <b>${r.name}</b>: ${r.error}</div>`
            : `<div>✓ <b>${r.name}</b> — ${r.count} ${r.nat}s</div>`
          ).join('')}
          <hr style="margin:6px 0;opacity:.3">
          <b>${docs.length} documentos</b> del ${UI.fecha(fechas[0])} al ${UI.fecha(fechas[fechas.length-1])} ·
          Total <b>${UI.q(docs.reduce((s,d)=>s+d.gran_total,0))}</b> · IVA <b>${UI.q(totIva)}</b>
          ${totCombustible > 0 ? ` · ⛽ Combustible <b>${UI.q(totCombustible)}</b>` : ''}
        </div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin:8px 0;display:flex;align-items:center;gap:6px">
        <span>🛡️</span> Los DTE que ya estén cargados se omiten automáticamente — no se duplican.
      </div>
      <button class="btn btn-amber" onclick="Modulos.contabilidad.importarFel()">⬆️ Importar ${docs.length} documentos</button>`;
  },

  async importarFel() {
    const docs = this._felParse;
    if (!docs?.length) return;
    UI.toast('Importando...','info');
    /* Importación idempotente que COMPLETA datos: inserta nuevos y refresca
       existentes con el archivo del SAT, sin duplicar. */
    let nuevos = 0, actualizados = 0, errores = 0;
    for (let i = 0; i < docs.length; i += 200) {
      const { count, actualizados: act, error } = await DB.insertFelImportados(docs.slice(i, i+200));
      if (error) { errores++; console.error('importarFel:', error.message); }
      nuevos += count; actualizados += (act||0);
    }
    this._felParse = null;
    const comb = docs.filter(d=>d.es_combustible).reduce((s,d)=>s+d.gran_total,0);
    if (errores) {
      UI.toast(`Importados ${nuevos} con errores — revisa la consola`,'error');
    } else if (nuevos === 0 && actualizados > 0) {
      UI.toast(`Sin DTE nuevos · ${actualizados} ya existentes se actualizaron con el archivo`,'info');
    } else {
      let msg = `✓ ${nuevos} DTE nuevos`;
      if (actualizados > 0) msg += ` · ${actualizados} actualizados`;
      if (comb > 0) msg += ` · ⛽ combustible ${UI.q(comb)}`;
      UI.toast(msg);
    }
    this._renderTab();
  },

  async eliminarFelPeriodo(naturaleza) {
    const { ini, fin } = this._rango();
    const ok = await UI.confirmar(`¿Eliminar todos los DTE <b>${naturaleza}s</b> importados de este mes?`, 'Eliminar');
    if (!ok) return;
    await DB.deleteFelPeriodo(ini, fin, naturaleza);
    UI.toast('Importación eliminada');
    this._renderTab();
  },

  /* ── Export CSV ── */
  _csv(nombre, encabezados, filas) {
    const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
    const csv = '\u{FEFF}' + [encabezados, ...filas].map(r=>r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  },

  async exportarVentas() {
    const { periodo } = this._rango();
    const d = await this._datos();
    this._csv(`libro_ventas_${periodo}.csv`,
      ['Fecha','Serie','Numero','NIT','Cliente','Base','IVA','Total','Estado'],
      d.facturas.map(f=>[f.fecha, f.fel_serie||'', f.fel_numero||f.num||'', f.nit||'CF', f.nombre_receptor||'', f.subtotal||0, f.iva||0, f.total||0, f.estado||'vigente']));
    UI.toast('Libro de ventas exportado ✓');
  },

  async exportarCompras() {
    const { periodo } = this._rango();
    const d = await this._datos();
    const filas = [
      ...d.compras.map(c=>[c.fecha, c.proveedor_nombre||'', c.num_factura||c.num||'', c.subtotal||0, c.iva||0, c.total||0, 'compra']),
      ...d.egresosIva.map(e=>[e.fecha, e.proveedor||e.concepto||'', e.num_factura||'', (Number(e.monto)||0)-(Number(e.iva_credito)||0), e.iva_credito||0, e.monto||0, 'gasto'])
    ];
    this._csv(`libro_compras_${periodo}.csv`,
      ['Fecha','Proveedor','Factura','Base','IVA','Total','Origen'], filas);
    UI.toast('Libro de compras exportado ✓');
  }
};
