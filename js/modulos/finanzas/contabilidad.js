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
  _tab: 'iva',
  _mes: null, _anio: null,
  _fiscal: null,
  _fuenteCredito: 'sistema',   // 'sistema' (compras+gastos) | 'fel' (CSV de SAT)
  _felParse: null,             // resultado del CSV pendiente de importar

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
          ${[['iva','🧾 IVA del mes'],['trimestre','🏢 Trimestral / ISO'],['ventas','📤 Libro de Ventas'],['compras','📥 Libro de Compras'],['isr','🏛️ ISR mensual'],['fel','⬆️ Importar FEL'],['obligaciones','📅 Obligaciones'],['formularios_sat','📋 Formularios SAT']]
            .map(([t,l])=>`<button class="tab-btn ${this._tab===t?'active':''}" onclick="Modulos.contabilidad._ir('${t}')">${l}</button>`).join('')}
        </div>
        <div id="cont-content"></div>
      </div>`;
    this._renderTab();
  },

  _ir(t){ this._tab=t; App._subActivo=t; App._guardarRuta(); App.renderSidebar(); App.marcarTabActivo(t); this._renderTab(); },

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

  _fila(label, valor, opts={}) {
    return `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed var(--border);font-size:13px">
      <span style="color:var(--text2)">${label}</span>
      <b class="mono-sm" style="color:var(--${opts.color||'text'})">${UI.q(valor)}</b></div>`;
  },

  _totalFila(label, valor, color) {
    return `<div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0 4px;font-size:15px">
      <b>${label}</b><b class="mono-sm" style="font-size:18px;color:var(--${color})">${UI.q(valor)}</b></div>`;
  },

  async _renderTab() {
    const el = document.getElementById('cont-content');
    if (!el) return;
    UI.loading(el);
    const { mes, anio, periodo } = this._rango();
    const nombreMes = new Date(anio, mes-1, 1).toLocaleDateString('es-GT',{month:'long',year:'numeric'});
    const pequeno = (this._fiscal?.regimen_iva||'general').toLowerCase().startsWith('peque');
    const utilidades = (Number(this._fiscal?.tasa_isr)||0.05) >= 0.2;

    /* ── IVA (con arrastre y fuente de crédito) ──── */
    if (this._tab === 'iva') {
      const d = await this._ivaConArrastre();
      const saldo = d.saldo;
      const difDeb = Math.round((d.debitoFel - d.debito)*100)/100;

      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'🧾', clase:'amber', label:'Débito fiscal', value: d.debito, money:true, trend:`${d.ventas.length} facturas del sistema` })}
          ${UI.kpiCard({ icon:'💳', clase:'cyan', label:`Crédito fiscal (${this._fuenteCredito==='fel'?'FEL SAT':'sistema'})`, value: d.creditoUsado, money:true, trend: this._fuenteCredito==='fel'?d.felRec+' DTE recibidos':'compras + gastos' })}
          ${UI.kpiCard({ icon:'🔄', clase:'purple', label:'Remanente anterior', value: d.remanenteAnterior, money:true, trend:`arrastre desde enero ${anio}` })}
          ${UI.kpiCard({ icon:'⚖️', clase: saldo>=0?'red':'green', label: saldo>=0?'IVA a pagar':'Remanente', value: Math.abs(saldo), money:true, trend: nombreMes })}
        </div>

        <div class="card" style="max-width:680px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
            <div class="card-sub" style="margin:0">🧾 ${pequeno?'Pequeño Contribuyente (SAT-2046)':'Hoja de trabajo — IVA General (SAT-2237)'} · ${nombreMes}</div>
            <div class="view-toggle">
              <button class="view-btn ${this._fuenteCredito==='sistema'?'active':''}" style="font-size:11px;padding:6px 10px" title="Crédito desde Compras y Gastos del sistema" onclick="Modulos.contabilidad._fuenteCredito='sistema';Modulos.contabilidad._renderTab()">Sistema</button>
              <button class="view-btn ${this._fuenteCredito==='fel'?'active':''}" style="font-size:11px;padding:6px 10px" title="Crédito desde el CSV de la Consulta FEL de SAT" onclick="Modulos.contabilidad._fuenteCredito='fel';Modulos.contabilidad._renderTab()">FEL SAT</button>
            </div>
          </div>
          ${pequeno ? `
            ${this._fila('Total facturado del mes (IVA incluido)', d.ventasTotal)}
            ${this._totalFila('IVA A PAGAR (5% del facturado)', Math.round(d.ventasTotal*0.05*100)/100, 'red')}
            <div style="font-size:11px;color:var(--text3)">Pequeño Contribuyente: 5% sobre ingresos brutos, sin crédito fiscal (SAT-2046).</div>
          ` : `
            ${this._fila('Ventas y servicios gravados (base imponible)', d.ventasNetas)}
            ${this._fila('DÉBITO fiscal (12% de ventas)', d.debito, {color:'amber'})}
            ${this._fila(`CRÉDITO fiscal — fuente ${this._fuenteCredito==='fel'?'FEL importado de SAT':'compras + gastos del sistema'}`, d.creditoUsado, {color:'cyan'})}
            ${this._fila('(−) Retenciones de IVA que te efectuaron', d.retIva, {color:'purple'})}
            ${this._fila('(−) Remanente de crédito del periodo anterior', d.remanenteAnterior, {color:'purple'})}
            ${this._totalFila(saldo>=0?'IVA A PAGAR del periodo':'REMANENTE para el próximo periodo', Math.abs(saldo), saldo>=0?'red':'green')}
            <div style="font-size:11px;color:var(--text3);margin-top:6px">
              El remanente se arrastra automáticamente mes a mes desde enero ${anio}.
              ${d.felEmi?`Verificación débito: FEL emitidas de SAT suman <b>${UI.q(d.debitoFel)}</b> (${difDeb===0?'✓ cuadra con el sistema':`diferencia ${UI.q(Math.abs(difDeb))} vs sistema`}).`:''}
            </div>
          `}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-amber" onclick="Modulos.contabilidad.registrarObligacion('IVA')">📅 Registrar obligación IVA ${periodo}</button>
          <button class="btn btn-ghost" onclick="Modulos.contabilidad.modalRetencion('IVA')">➕ Retención de IVA</button>
          ${!d.felRec && !pequeno ? `<button class="btn btn-cyan" onclick="Modulos.contabilidad._ir('fel')">⬆️ Importar FEL de SAT para el crédito</button>`:''}
        </div>`;
    }

    /* ── TRIMESTRAL: ISR SAT-1361 + ISO SAT-1608 ── */
    else if (this._tab === 'trimestre') {
      if (!utilidades) {
        el.innerHTML = `<div class="alert alert-cyan" style="max-width:640px"><div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:13px">Este taller está en <b>régimen opcional simplificado</b> (ISR mensual 5%/7%, pestaña "ISR mensual") y por ley está <b>exento de ISO</b>. La pestaña Trimestral aplica al régimen sobre utilidades (25%) — se configura con tasa ISR 0.25 en la configuración fiscal.</div></div>`;
        return;
      }
      const t = Math.ceil(mes/3);
      const tIniMes = (t-1)*3+1, tFinMes = t*3;
      const tIni = `${anio}-${String(tIniMes).padStart(2,'0')}-01`;
      const tFin = new Date(anio, tFinMes, 0).toISOString().slice(0,10);
      const enCurso = (new Date().toISOString().slice(0,10)) < tFin;

      const [facturas, egresos, retenciones, activos, factAnt, obligaciones] = await Promise.all([
        DB.getFacturasPeriodo(tIni, tFin),
        DB.getEgresos(tIni, tFin),
        DB.getRetencionesPeriodo(tIni, tFin),
        DB.getActivos().catch(()=>[]),
        DB.getFacturasPeriodo(`${anio-1}-01-01`, `${anio-1}-12-31`),
        DB.getObligaciones(anio)
      ]);
      const d = this._agregar(facturas, [], [], retenciones, []);
      const n = v => Number(v)||0;
      const gastos = Math.round(egresos.reduce((s,e)=>s+(n(e.monto)-n(e.iva_credito)),0)*100)/100;
      const dep = Math.round(activos.reduce((s,a)=>s+depEnRango(a, tIni, tFin),0)*100)/100;
      const utilidad = Math.round((d.ventasNetas - gastos - dep)*100)/100;
      const isrTrim = Math.max(0, Math.round(utilidad*0.25*100)/100);
      const isoPagado = obligaciones.filter(o=>o.tipo==='ISO'&&o.estado==='pagado').reduce((s,o)=>s+n(o.monto_pagado),0);
      const isrAPagar = Math.max(0, Math.round((isrTrim - d.retIsr - isoPagado)*100)/100);

      /* ISO: 1% anual sobre el MAYOR entre activo neto e ingresos brutos
         del periodo anterior; se paga la cuarta parte por trimestre. */
      const ingresosAnt = Math.round(factAnt.filter(f=>!/anulad/i.test(f.estado||'')).reduce((s,f)=>s+n(f.total),0)*100)/100;
      const activoNeto = this._isoActivoNeto ?? '';
      const baseIso = Math.max(Number(activoNeto)||0, ingresosAnt);
      const isoTrim = Math.round(baseIso*0.01/4*100)/100;

      el.innerHTML = `
        ${enCurso?`<div class="alert alert-amber" style="margin-bottom:14px;max-width:680px"><div class="alert-icon">⏳</div><div class="alert-body" style="font-size:12px">El trimestre T${t} aún está en curso — las cifras se actualizan conforme registres operaciones.</div></div>`:''}
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'📈', clase:'green', label:`Ingresos T${t} (sin IVA)`, value: d.ventasNetas, money:true })}
          ${UI.kpiCard({ icon:'📉', clase:'red', label:'Gastos + Depreciación', value: gastos+dep, money:true, trend:`dep: ${UI.q(dep)}` })}
          ${UI.kpiCard({ icon:'💹', clase: utilidad>=0?'cyan':'red', label:'Utilidad del trimestre', value: utilidad, money:true })}
          ${UI.kpiCard({ icon:'🏛️', clase:'amber', label:'ISR trimestral a pagar', value: isrAPagar, money:true })}
        </div>

        <div class="grid-2" style="align-items:start">
          <div class="card">
            <div class="card-sub mb-3">🏢 ISR Trimestral (SAT-1361) · T${t} ${anio} — cierre parcial</div>
            ${this._fila('Renta bruta del trimestre (sin IVA)', d.ventasNetas)}
            ${this._fila('(−) Costos y gastos deducibles (sin IVA)', gastos, {color:'red'})}
            ${this._fila('(−) Depreciación de activos (línea recta)', dep, {color:'red'})}
            ${this._fila('Renta imponible (utilidad)', Math.max(0,utilidad))}
            ${this._fila('ISR 25% sobre la utilidad', isrTrim, {color:'amber'})}
            ${this._fila('(−) Retenciones ISR del trimestre', d.retIsr, {color:'purple'})}
            ${this._fila('(−) ISO pagado acreditable (del año)', isoPagado, {color:'purple'})}
            ${this._totalFila('ISR TRIMESTRAL A PAGAR', isrAPagar, 'red')}
            <div style="font-size:11px;color:var(--text3);margin-top:6px">SAT-1361: se presenta dentro de los 10 días siguientes al cierre del trimestre. Método: cierre parcial. El acreditamiento del ISO mostrado es simplificado — confírmalo con tu contador.</div>
            <div style="margin-top:10px"><button class="btn btn-amber btn-sm" onclick="Modulos.contabilidad.registrarObligacionTrimestre('ISR', ${t}, ${isrAPagar})">📅 Registrar ISR T${t}</button></div>
          </div>

          <div class="card">
            <div class="card-sub mb-3">🏛️ ISO (SAT-1608) · T${t} ${anio}</div>
            ${this._fila(`Ingresos brutos ${anio-1} (facturado)`, ingresosAnt)}
            <div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed var(--border);font-size:13px;align-items:center">
              <span style="color:var(--text2)">Activo neto al cierre ${anio-1} (editable)</span>
              <input class="form-input mono-sm" style="width:130px;text-align:right" type="number" value="${activoNeto}"
                placeholder="${ingresosAnt}" onchange="Modulos.contabilidad._isoActivoNeto=parseFloat(this.value)||null;Modulos.contabilidad._renderTab()">
            </div>
            ${this._fila('Base ISO (el MAYOR de los dos)', baseIso)}
            ${this._fila('ISO anual (1% de la base)', Math.round(baseIso*0.01*100)/100, {color:'amber'})}
            ${this._totalFila(`ISO DEL TRIMESTRE (¼ parte)`, isoTrim, 'red')}
            <div style="font-size:11px;color:var(--text3);margin-top:6px">SAT-1608: vence dentro del mes siguiente al trimestre. El ISO pagado se acredita al ISR (o viceversa, según la opción elegida ante SAT). Exentos: los primeros 4 trimestres de operación y el régimen simplificado.</div>
            <div style="margin-top:10px"><button class="btn btn-amber btn-sm" onclick="Modulos.contabilidad.registrarObligacionTrimestre('ISO', ${t}, ${isoTrim})">📅 Registrar ISO T${t}</button></div>
          </div>
        </div>`;
    }

    /* ── LIBRO DE VENTAS ─────────────────────────── */
    else if (this._tab === 'ventas') {
      const d = await this._datos();
      el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
          <button class="btn btn-cyan" onclick="Modulos.contabilidad.exportarVentas()">⬇️ Exportar CSV</button>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Serie/No.</th><th>NIT</th><th>Cliente</th><th>Base</th><th>IVA</th><th>Total</th><th>Estado</th></tr></thead>
          <tbody>${d.facturas.map(f=>`<tr style="${/anulad/i.test(f.estado||'')?'opacity:.5;text-decoration:line-through':''}">
            <td class="mono-sm">${UI.fecha(f.fecha)}</td>
            <td class="mono-sm">${f.fel_serie||''} ${f.fel_numero||f.num||'—'}</td>
            <td class="mono-sm">${f.nit||'CF'}</td>
            <td>${f.nombre_receptor||'—'}</td>
            <td class="mono-sm">${UI.q(f.subtotal)}</td>
            <td class="mono-sm text-amber">${UI.q(f.iva)}</td>
            <td class="mono-sm text-green"><b>${UI.q(f.total)}</b></td>
            <td><span class="badge badge-${/anulad/i.test(f.estado||'')?'red':'green'}">${f.estado||'vigente'}</span></td>
          </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin facturas en el periodo</td></tr>'}</tbody>
        </table></div>
        <div style="margin-top:10px;font-size:12px;color:var(--text3)">Total facturado vigente: <b>${UI.q(d.ventasTotal)}</b> · Débito fiscal: <b>${UI.q(d.debito)}</b></div>`;
    }

    /* ── LIBRO DE COMPRAS ────────────────────────── */
    else if (this._tab === 'compras') {
      const d = await this._datos();
      const filasC = d.compras.map(c=>`<tr style="${/anulad/i.test(c.estado||'')?'opacity:.5':''}">
        <td class="mono-sm">${UI.fecha(c.fecha)}</td><td>${c.proveedor_nombre||'—'}</td>
        <td class="mono-sm">${c.num_factura||c.num||'—'}</td>
        <td class="mono-sm">${UI.q(c.subtotal)}</td><td class="mono-sm text-cyan">${UI.q(c.iva)}</td>
        <td class="mono-sm"><b>${UI.q(c.total)}</b></td><td><span class="badge badge-gray">compra</span></td></tr>`);
      const filasE = d.egresosIva.map(e=>`<tr>
        <td class="mono-sm">${UI.fecha(e.fecha)}</td><td>${e.proveedor||e.concepto||'—'}</td>
        <td class="mono-sm">${e.num_factura||'—'}</td>
        <td class="mono-sm">${UI.q((Number(e.monto)||0)-(Number(e.iva_credito)||0))}</td>
        <td class="mono-sm text-cyan">${UI.q(e.iva_credito)}</td>
        <td class="mono-sm"><b>${UI.q(e.monto)}</b></td><td><span class="badge badge-gray">gasto</span></td></tr>`);
      el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
          <button class="btn btn-cyan" onclick="Modulos.contabilidad.exportarCompras()">⬇️ Exportar CSV</button>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Base</th><th>IVA crédito</th><th>Total</th><th>Origen</th></tr></thead>
          <tbody>${[...filasC,...filasE].join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin compras/gastos con IVA en el periodo</td></tr>'}</tbody>
        </table></div>
        <div style="margin-top:10px;font-size:12px;color:var(--text3)">Crédito fiscal del periodo (sistema): <b>${UI.q(d.credito)}</b> · FEL importado: <b>${UI.q(d.creditoFel)}</b></div>`;
    }

    /* ── ISR MENSUAL (simplificado) ──────────────── */
    else if (this._tab === 'isr') {
      const d = await this._datos();
      if (utilidades) {
        el.innerHTML = `<div class="alert alert-amber" style="max-width:640px"><div class="alert-icon">🏢</div>
          <div class="alert-body" style="font-size:13px">Este taller está en <b>régimen sobre utilidades (25%)</b>: su ISR se calcula <b>trimestralmente</b>. Usa la pestaña <b>Trimestral / ISO</b> — ahí está la hoja SAT-1361 con la utilidad y la depreciación ya integradas.</div></div>
          <button class="btn btn-amber" style="margin-top:12px" onclick="Modulos.contabilidad._ir('trimestre')">🏢 Ir a Trimestral / ISO</button>`;
        return;
      }
      const base = d.ventasNetas;
      const isr = Math.round(this._isrSimplificado(base)*100)/100;
      const aPagar = Math.max(0, Math.round((isr - d.retIsr)*100)/100);
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'💵', clase:'cyan', label:'Renta del mes (sin IVA)', value: base, money:true })}
          ${UI.kpiCard({ icon:'🏛️', clase:'amber', label:'ISR calculado (5%/7%)', value: isr, money:true })}
          ${UI.kpiCard({ icon:'🧾', clase:'purple', label:'Retenciones ISR', value: d.retIsr, money:true })}
          ${UI.kpiCard({ icon:'⚖️', clase:'red', label:'ISR a pagar', value: aPagar, money:true })}
        </div>
        <div class="card" style="max-width:640px">
          <div class="card-sub mb-3">🏛️ Hoja de trabajo — ISR Opcional Simplificado (SAT-1311) · ${nombreMes}</div>
          ${this._fila('Renta bruta del periodo (facturado sin IVA)', base)}
          ${this._fila('ISR 5% sobre primeros Q30,000', Math.round(Math.min(base,30000)*0.05*100)/100, {color:'amber'})}
          ${base>30000?this._fila('ISR 7% sobre excedente de Q30,000', Math.round((base-30000)*0.07*100)/100, {color:'amber'}):''}
          ${this._fila('(−) Retenciones ISR que te efectuaron', d.retIsr, {color:'purple'})}
          ${this._totalFila('ISR A PAGAR del periodo', aPagar, 'red')}
          <div style="font-size:11px;color:var(--text3);margin-top:6px">Transcribe al SAT-1311 en Declaraguate. Se presenta dentro de los primeros 10 días hábiles del mes siguiente.</div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px">
          <button class="btn btn-amber" onclick="Modulos.contabilidad.registrarObligacion('ISR')">📅 Registrar obligación ISR ${periodo}</button>
          <button class="btn btn-ghost" onclick="Modulos.contabilidad.modalRetencion('ISR')">➕ Retención de ISR</button>
        </div>`;
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
          <div id="fel-preview"></div>
        </div>

        ${importados.length?`
        <div class="card" style="max-width:720px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <div class="card-sub" style="margin:0">📚 FEL importado · ${nombreMes}</div>
            <div style="display:flex;gap:6px">
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
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Serie/No.</th><th>Contraparte</th><th>Total</th><th>IVA</th><th></th></tr></thead>
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
              <td>${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('fel_importados','${x.id}','este DTE',()=>Modulos.contabilidad._renderTab())`)}</td>
            </tr>`).join('')}</tbody>
          </table></div>
          ${importados.length>60?`<div style="font-size:11px;color:var(--text3);margin-top:6px">Mostrando 60 de ${importados.length}.</div>`:''}
        </div>`:''}`;
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
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('obligaciones_fiscales','${o.id}','la obligación ${o.tipo} ${o.periodo}',()=>Modulos.contabilidad._renderTab())`)}
              </div></td>
            </tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin obligaciones registradas este año. Genera la del mes desde las pestañas IVA, ISR o Trimestral.</td></tr>'}</tbody>
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

  /* ── Retención rápida (IVA/ISR, recibida o emitida) ── */
  modalRetencion(tipoDefault='IVA') {
    UI.modal('➕ Registrar retención', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Impuesto *</label>
          <select class="form-select" id="ret-tipo">
            <option ${tipoDefault==='IVA'?'selected':''}>IVA</option>
            <option ${tipoDefault==='ISR'?'selected':''}>ISR</option>
          </select></div>
        <div class="form-group"><label class="form-label">Naturaleza *</label>
          <select class="form-select" id="ret-nat">
            <option value="recibida">Me la efectuaron (resta de mi impuesto)</option>
            <option value="emitida">Yo la efectué (agente de retención)</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" id="ret-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Documento / constancia</label>
          <input class="form-input" id="ret-doc" placeholder="No. de constancia o factura"></div>
      </div>
      <div class="form-group"><label class="form-label">Contraparte</label>
        <input class="form-input" id="ret-contra" placeholder="Cliente o proveedor que retiene/retuvo"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Base (Q)</label>
          <input class="form-input" id="ret-base" type="number" min="0" step="0.01" oninput="Modulos.contabilidad._calcRet()"></div>
        <div class="form-group"><label class="form-label">% retención</label>
          <input class="form-input" id="ret-pct" type="number" min="0" step="0.01" value="15" oninput="Modulos.contabilidad._calcRet()"></div>
        <div class="form-group"><label class="form-label">Monto retenido (Q) *</label>
          <input class="form-input" id="ret-monto" type="number" min="0" step="0.01"></div>
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
    const { error } = await DB.upsertRetencion({
      tipo: document.getElementById('ret-tipo')?.value||'IVA',
      naturaleza: document.getElementById('ret-nat')?.value||'recibida',
      fecha: document.getElementById('ret-fecha')?.value||new Date().toISOString().slice(0,10),
      documento: document.getElementById('ret-doc')?.value||null,
      contraparte: document.getElementById('ret-contra')?.value||null,
      base: parseFloat(document.getElementById('ret-base')?.value)||null,
      porcentaje: parseFloat(document.getElementById('ret-pct')?.value)||null,
      monto
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Retención registrada ✓');
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
      console.log('FEL: Leyendo', f.name, f.size, 'bytes');
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'xls' || ext === 'xlsx') {
        const r = new FileReader();
        r.onload = ev => {
          try {
            console.log('FEL: Buffer leído', f.name, ev.target.result.byteLength, 'bytes');
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type:'array' });
            console.log('FEL: Workbook parseado, sheets:', wb.SheetNames);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            console.log('FEL: Rows convertidas a array:', rows.length, 'filas');
            resolve({ rows, name: f.name });
          } catch(e) {
            console.error('FEL: Error parseando XLS', f.name, e);
            reject(e);
          }
        };
        r.onerror = e => {
          console.error('FEL: Error leyendo archivo', f.name, e);
          reject(e);
        };
        r.readAsArrayBuffer(f);
      } else {
        const r = new FileReader();
        r.onload = ev => {
          try {
            const rows = this._csvParse(String(ev.target.result));
            console.log('FEL: CSV parseado, rows:', rows.length);
            resolve({ rows, name: f.name });
          } catch(e) {
            console.error('FEL: Error parseando CSV', f.name, e);
            reject(e);
          }
        };
        r.readAsText(f, 'utf-8');
      }
    });

    Promise.all(files.map(f => readFile(f).catch(e => {
      console.error('FEL Promise catch:', f.name, e.message || e);
      return { error: e.message || String(e), name: f.name };
    })))
      .then(results => {
        console.log('FEL: Todos los archivos leídos, resultados:', results.length);
        const allDocs = [];
        const resumen = [];
        results.forEach(({ rows, name, error }) => {
          if (error) {
            console.warn('FEL: Error en', name, ':', error);
            resumen.push({ name, error });
            return;
          }
          console.log('FEL: Procesando', name, rows ? rows.length : '?', 'filas');
          const nat = /emiti/i.test(name) ? 'emitida' : /recib/i.test(name) ? 'recibida' : 'recibida';
          const docs = this._procesarFelRows(rows, nat);
          console.log('FEL:', name, 'resultó en', docs.length, 'documentos');
          if (docs.length) { allDocs.push(...docs); resumen.push({ name, nat, count: docs.length }); }
          else resumen.push({ name, error: 'Sin documentos válidos' });
        });
        console.log('FEL: Total documentos:', allDocs.length);
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
    if (filas.length < 2) { console.warn('FEL: < 2 filas', filas.length); return []; }
    const norm = h => {
      let s = String(h||'').toLowerCase()
        .replace(/[áàâäã]/g,'a').replace(/[éèêë]/g,'e')
        .replace(/[íìîï]/g,'i').replace(/[óòôöõ]/g,'o')
        .replace(/[úùû]/g,'u').replace(/ñ/g,'n').replace(/ç/g,'c')
        .replace(/[^a-z0-9\s_]/g,'');
      return s;
    };
    const head = filas[0].map(norm);
    console.log('FEL headers normalizados:', head);
    const idx = re => head.findIndex(h=>re.test(h));
    const col = {
      fecha:        idx(/fecha/),
      uuid:         idx(/autorizaci/),
      tipo:         idx(/tipo/),
      serie:        idx(/serie/),
      numero:       idx(/numero|dten/),
      nitEmisor:    idx(/nit.*emisor/),
      nomEmisor:    idx(/nombre.*emisor|razon.*emisor/),
      nitReceptor:  idx(/nit.*receptor/),
      nomReceptor:  idx(/nombre.*receptor|razon.*receptor/),
      total:        idx(/grantotal|monto.*total|total/),
      iva:          idx(/\biva\b/),
      estado:       idx(/estado/),
      anulado:      idx(/marca.*anulad/),
      petroleo:     idx(/petroleo|petrol/)
    };
    console.log('FEL columnas detectadas:', col);
    if (col.fecha < 0 || col.total < 0) {
      console.warn('FEL: no encontró Fecha o Total', { fecha: col.fecha, total: col.total });
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
        estado:               esAnulado(r) ? 'anulado' : 'vigente'
      };
    });
    console.log('FEL: Procesados', docs.length, 'documentos (brutos)');
    const filtered = docs.filter(d => {
      const valid = d.fecha && d.gran_total > 0;
      if (!valid && docs.length < 10) console.log('FEL: Descartado:', { fecha: d.fecha, total: d.gran_total });
      return valid;
    });
    console.log('FEL: Después del filtro:', filtered.length, 'documentos válidos');
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
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:8px 0;cursor:pointer">
        <input type="checkbox" id="fel-reemplazar" checked>
        Reemplazar lo ya importado en ese rango de fechas (por tipo)
      </label>
      <button class="btn btn-amber" onclick="Modulos.contabilidad.importarFel()">⬆️ Importar ${docs.length} documentos</button>`;
  },

  async importarFel() {
    const docs = this._felParse;
    if (!docs?.length) return;
    UI.toast('Importando...','info');
    const fechas = docs.map(d=>d.fecha).sort();
    const ini = fechas[0], fin = fechas[fechas.length-1];
    if (document.getElementById('fel-reemplazar')?.checked) {
      const naturalezas = [...new Set(docs.map(d=>d.naturaleza))];
      for (const nat of naturalezas) await DB.deleteFelPeriodo(ini, fin, nat);
    }
    let total = 0, errores = 0;
    for (let i = 0; i < docs.length; i += 200) {
      const { count, error } = await DB.insertFelImportados(docs.slice(i, i+200));
      if (error) { errores++; console.error('importarFel:', error.message); }
      total += count;
    }
    this._felParse = null;
    const comb = docs.filter(d=>d.es_combustible).reduce((s,d)=>s+d.gran_total,0);
    const msg = comb > 0 ? `✓ ${total} DTE importados · ⛽ combustible ${UI.q(comb)}` : `✓ ${total} documentos FEL importados`;
    if (errores) UI.toast(`Importados ${total} con errores — revisa la consola`,'error');
    else UI.toast(msg);
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
