/* ═══════════════════════════════════════════════════════
   Contabilidad / SAT — Fase 1 (Guatemala)
   Genera la información lista para transcribir a Declaraguate:
   • IVA mensual (hoja de trabajo SAT-2237 régimen general, o
     SAT-2046 pequeño contribuyente según config_fiscal.regimen_iva)
   • Libro de Ventas y Libro de Compras (exportables a CSV)
   • ISR mensual régimen opcional simplificado 5%/7% (SAT-1311)
   • Obligaciones: registro de declaraciones (pendiente/pagado)
   Nota: Declaraguate no tiene API pública — aquí se PRE-CALCULA
   cada casilla para que el contador solo transcriba.
═══════════════════════════════════════════════════════ */
Modulos.contabilidad = {
  _tab: 'iva',
  _mes: null, _anio: null,
  _fiscal: null,

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
    this._fiscal = await DB.getConfigFiscal().catch(()=>null);
    const { mes, anio } = this._rango();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🧮 Contabilidad / SAT</h1>
        <p class="page-subtitle">// hoja de trabajo para Declaraguate — IVA, ISR y libros</p></div>
        <div class="page-actions">
          <select class="form-select" style="width:auto" onchange="Modulos.contabilidad._mes=parseInt(this.value);Modulos.contabilidad._renderTab()">
            ${meses.map((m,i)=>`<option value="${i+1}" ${mes===i+1?'selected':''}>${m}</option>`).join('')}
          </select>
          <select class="form-select" style="width:auto" onchange="Modulos.contabilidad._anio=parseInt(this.value);Modulos.contabilidad._renderTab()">
            ${[anio-1,anio,anio+1].map(a=>`<option ${anio===a?'selected':''}>${a}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="page-body">
        <div class="tabs">
          ${[['iva','🧾 IVA del mes'],['ventas','📤 Libro de Ventas'],['compras','📥 Libro de Compras'],['isr','🏛️ ISR'],['obligaciones','📅 Obligaciones']]
            .map(([t,l])=>`<button class="tab-btn ${this._tab===t?'active':''}" onclick="Modulos.contabilidad._ir('${t}')">${l}</button>`).join('')}
        </div>
        <div id="cont-content"></div>
      </div>`;
    this._renderTab();
  },

  _ir(t){ this._tab=t; App._subActivo=t; App.renderSidebar(); this._renderTab(); },

  /* ── Datos del periodo ── */
  async _datos() {
    const { ini, fin } = this._rango();
    const [facturas, compras, egresosIva, retenciones] = await Promise.all([
      DB.getFacturasPeriodo(ini, fin),
      DB.getComprasPeriodo(ini, fin),
      DB.getEgresosIvaPeriodo(ini, fin),
      DB.getRetencionesPeriodo(ini, fin)
    ]);
    const vivas = f => (f.estado||'').toLowerCase() !== 'anulada';
    const n = v => Number(v)||0;

    const ventas = facturas.filter(vivas);
    const ventasTotal = ventas.reduce((s,f)=>s+n(f.total),0);
    const debito = ventas.reduce((s,f)=>s+(n(f.iva)||Math.round((n(f.total)-n(f.subtotal))*100)/100||Math.round(n(f.total)/1.12*0.12*100)/100),0);
    const ventasNetas = Math.round((ventasTotal-debito)*100)/100;

    const comprasVivas = compras.filter(vivas);
    const ivaCompras = comprasVivas.reduce((s,c)=>s+n(c.iva),0);
    const ivaGastos  = egresosIva.reduce((s,e)=>s+n(e.iva_credito),0);
    const credito = Math.round((ivaCompras+ivaGastos)*100)/100;
    const comprasTotal = comprasVivas.reduce((s,c)=>s+n(c.total),0) + egresosIva.reduce((s,e)=>s+n(e.monto),0);
    const comprasNetas = Math.round((comprasTotal-credito)*100)/100;

    const esIva = r => (r.tipo||'').toUpperCase().includes('IVA');
    const esIsr = r => (r.tipo||'').toUpperCase().includes('ISR');
    const recibida = r => (r.naturaleza||'recibida').toLowerCase().includes('recib');
    const retIva = retenciones.filter(r=>esIva(r)&&recibida(r)).reduce((s,r)=>s+n(r.monto),0);
    const retIsr = retenciones.filter(r=>esIsr(r)&&recibida(r)).reduce((s,r)=>s+n(r.monto),0);

    return { facturas, compras, egresosIva, retenciones, ventas,
      ventasTotal, ventasNetas, debito, comprasTotal, comprasNetas, credito, retIva, retIsr };
  },

  /* ISR mensual — régimen opcional simplificado sobre ingresos (Dto. 10-2012):
     5% sobre los primeros Q30,000 de renta imponible y 7% sobre el excedente. */
  _isrSimplificado(base) {
    const b = Math.max(0, Number(base)||0);
    return b <= 30000 ? b*0.05 : (30000*0.05 + (b-30000)*0.07);
  },

  _fila(label, valor, opts={}) {
    return `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed var(--border);font-size:13px">
      <span style="color:var(--text2)">${label}${opts.casilla?` <span class="badge badge-gray" style="font-size:9px">${opts.casilla}</span>`:''}</span>
      <b class="mono-sm" style="color:var(--${opts.color||'text'})">${UI.q(valor)}</b></div>`;
  },

  async _renderTab() {
    const el = document.getElementById('cont-content');
    if (!el) return;
    UI.loading(el);
    const { mes, anio, periodo, fin } = this._rango();
    const nombreMes = new Date(anio, mes-1, 1).toLocaleDateString('es-GT',{month:'long',year:'numeric'});
    const d = await this._datos();
    const pequeno = (this._fiscal?.regimen_iva||'general').toLowerCase().startsWith('peque');

    /* ── IVA ─────────────────────────────────────── */
    if (this._tab === 'iva') {
      const saldo = Math.round((d.debito - d.credito - d.retIva)*100)/100;
      const hojaGeneral = `
        <div class="card" style="max-width:640px">
          <div class="card-sub mb-3">🧾 Hoja de trabajo — IVA General (SAT-2237) · ${nombreMes}</div>
          ${this._fila('Ventas y servicios gravados (base imponible)', d.ventasNetas)}
          ${this._fila('DÉBITO fiscal (12% de ventas)', d.debito, {color:'amber'})}
          ${this._fila('Compras y servicios gravados (base imponible)', d.comprasNetas)}
          ${this._fila('CRÉDITO fiscal (IVA de compras y gastos)', d.credito, {color:'cyan'})}
          ${this._fila('(−) Retenciones de IVA que te efectuaron', d.retIva, {color:'purple'})}
          <div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0 4px;font-size:15px">
            <b>${saldo>=0?'IVA A PAGAR del periodo':'REMANENTE de crédito fiscal'}</b>
            <b class="mono-sm" style="font-size:18px;color:var(--${saldo>=0?'red':'green'})">${UI.q(Math.abs(saldo))}</b>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">
            ${saldo>=0
              ? 'Transcribe estos valores al formulario SAT-2237 en Declaraguate. Vence el último día hábil del mes siguiente.'
              : 'El remanente se arrastra como crédito al siguiente periodo (cáselo en el SAT-2237 del próximo mes).'}
          </div>
        </div>`;
      const facturado = d.ventasTotal;
      const hojaPequeno = `
        <div class="card" style="max-width:640px">
          <div class="card-sub mb-3">🧾 Hoja de trabajo — Pequeño Contribuyente (SAT-2046) · ${nombreMes}</div>
          ${this._fila('Total facturado del mes (con IVA incluido)', facturado)}
          ${this._fila('Tipo impositivo', 0, {})}
          <div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0 4px;font-size:15px">
            <b>IVA A PAGAR (5% del facturado)</b>
            <b class="mono-sm" style="font-size:18px;color:var(--red)">${UI.q(Math.round(facturado*0.05*100)/100)}</b>
          </div>
          <div style="font-size:11px;color:var(--text3)">Régimen de Pequeño Contribuyente: 5% sobre ingresos brutos, sin derecho a crédito fiscal. SAT-2046 mensual.</div>
        </div>`;

      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:16px">
          <div class="kpi-card"><div class="kpi-label">Débito fiscal</div><div class="kpi-val amber">${UI.q(d.debito)}</div><div class="kpi-trend">${d.ventas.length} facturas</div></div>
          <div class="kpi-card"><div class="kpi-label">Crédito fiscal</div><div class="kpi-val cyan">${UI.q(d.credito)}</div><div class="kpi-trend">compras + gastos con IVA</div></div>
          <div class="kpi-card"><div class="kpi-label">Retenciones IVA</div><div class="kpi-val purple">${UI.q(d.retIva)}</div><div class="kpi-trend">que te efectuaron</div></div>
          <div class="kpi-card"><div class="kpi-label">${(d.debito-d.credito-d.retIva)>=0?'IVA a pagar':'Remanente'}</div><div class="kpi-val ${(d.debito-d.credito-d.retIva)>=0?'red':'green'}">${UI.q(Math.abs(Math.round((d.debito-d.credito-d.retIva)*100)/100))}</div><div class="kpi-trend">${nombreMes}</div></div>
        </div>
        ${pequeno ? hojaPequeno : hojaGeneral}
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-amber" onclick="Modulos.contabilidad.registrarObligacion('IVA')">📅 Registrar obligación IVA ${periodo}</button>
        </div>
        <div class="alert alert-cyan" style="margin-top:14px;max-width:640px">
          <div class="alert-icon">💡</div>
          <div class="alert-body" style="font-size:12px">Declaraguate no tiene API pública: nadie puede presentar por ti. Esta hoja te da <b>cada casilla ya calculada</b> para transcribir en minutos. Régimen configurado: <b>${pequeno?'Pequeño Contribuyente':'General (débito/crédito)'}</b> — se cambia en Configuración fiscal.</div>
        </div>`;
    }

    /* ── LIBRO DE VENTAS ─────────────────────────── */
    else if (this._tab === 'ventas') {
      el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
          <button class="btn btn-cyan" onclick="Modulos.contabilidad.exportarVentas()">⬇️ Exportar CSV</button>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Serie/No.</th><th>NIT</th><th>Cliente</th><th>Base</th><th>IVA</th><th>Total</th><th>Estado</th></tr></thead>
          <tbody>${d.facturas.map(f=>`<tr style="${(f.estado||'').toLowerCase()==='anulada'?'opacity:.5;text-decoration:line-through':''}">
            <td class="mono-sm">${UI.fecha(f.fecha)}</td>
            <td class="mono-sm">${f.fel_serie||''} ${f.fel_numero||f.num||'—'}</td>
            <td class="mono-sm">${f.nit||'CF'}</td>
            <td>${f.nombre_receptor||'—'}</td>
            <td class="mono-sm">${UI.q(f.subtotal)}</td>
            <td class="mono-sm text-amber">${UI.q(f.iva)}</td>
            <td class="mono-sm text-green"><b>${UI.q(f.total)}</b></td>
            <td><span class="badge badge-${(f.estado||'').toLowerCase()==='anulada'?'red':'green'}">${f.estado||'vigente'}</span></td>
          </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin facturas en el periodo</td></tr>'}</tbody>
        </table></div>
        <div style="margin-top:10px;font-size:12px;color:var(--text3)">Total facturado vigente: <b>${UI.q(d.ventasTotal)}</b> · Débito fiscal: <b>${UI.q(d.debito)}</b></div>`;
    }

    /* ── LIBRO DE COMPRAS ────────────────────────── */
    else if (this._tab === 'compras') {
      const filasC = d.compras.map(c=>`<tr style="${(c.estado||'').toLowerCase()==='anulada'?'opacity:.5':''}">
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
        <div style="margin-top:10px;font-size:12px;color:var(--text3)">Crédito fiscal del periodo: <b>${UI.q(d.credito)}</b></div>`;
    }

    /* ── ISR ─────────────────────────────────────── */
    else if (this._tab === 'isr') {
      const tasaIsr = Number(this._fiscal?.tasa_isr)||0.05;
      const utilidades = tasaIsr >= 0.2;   // 25% = régimen sobre utilidades
      const base = d.ventasNetas;
      const isr = Math.round(this._isrSimplificado(base)*100)/100;
      const aPagar = Math.max(0, Math.round((isr - d.retIsr)*100)/100);
      el.innerHTML = utilidades ? `
        <div class="alert alert-amber" style="max-width:640px">
          <div class="alert-icon">🏛️</div>
          <div class="alert-body" style="font-size:13px">
            Este taller está configurado en <b>régimen sobre utilidades (25%)</b>: el ISR se paga
            <b>trimestralmente (SAT-1361)</b> sobre la utilidad, con cierre anual (SAT-1411).
            El cálculo de utilidad con depreciaciones ya vive en <b>Finanzas → cálculo fiscal</b>.
            La hoja trimestral SAT-1361 pre-llenada llega en la Fase 2 de este módulo.
          </div>
        </div>` : `
        <div class="kpi-grid" style="margin-bottom:16px">
          <div class="kpi-card"><div class="kpi-label">Renta del mes (sin IVA)</div><div class="kpi-val cyan">${UI.q(base)}</div></div>
          <div class="kpi-card"><div class="kpi-label">ISR calculado (5%/7%)</div><div class="kpi-val amber">${UI.q(isr)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Retenciones ISR</div><div class="kpi-val purple">${UI.q(d.retIsr)}</div></div>
          <div class="kpi-card"><div class="kpi-label">ISR a pagar</div><div class="kpi-val red">${UI.q(aPagar)}</div></div>
        </div>
        <div class="card" style="max-width:640px">
          <div class="card-sub mb-3">🏛️ Hoja de trabajo — ISR Opcional Simplificado (SAT-1311) · ${nombreMes}</div>
          ${this._fila('Renta bruta del periodo (facturado sin IVA)', base)}
          ${this._fila('ISR 5% sobre primeros Q30,000', Math.round(Math.min(base,30000)*0.05*100)/100, {color:'amber'})}
          ${base>30000?this._fila('ISR 7% sobre excedente de Q30,000', Math.round((base-30000)*0.07*100)/100, {color:'amber'}):''}
          ${this._fila('(−) Retenciones ISR que te efectuaron', d.retIsr, {color:'purple'})}
          <div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0 4px;font-size:15px">
            <b>ISR A PAGAR del periodo</b>
            <b class="mono-sm" style="font-size:18px;color:var(--red)">${UI.q(aPagar)}</b>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">Transcribe al SAT-1311 en Declaraguate. Se presenta dentro de los primeros 10 días hábiles del mes siguiente.</div>
        </div>
        <div style="margin-top:14px">
          <button class="btn btn-amber" onclick="Modulos.contabilidad.registrarObligacion('ISR')">📅 Registrar obligación ISR ${periodo}</button>
        </div>`;
    }

    /* ── OBLIGACIONES ────────────────────────────── */
    else if (this._tab === 'obligaciones') {
      const obligaciones = await DB.getObligaciones(anio);
      const hoy = new Date().toISOString().slice(0,10);
      el.innerHTML = `
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Impuesto</th><th>Periodo</th><th>Calculado</th><th>Pagado</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${obligaciones.map(o=>{
            const vencida = o.estado!=='pagado' && o.fecha_vencimiento && o.fecha_vencimiento < hoy;
            return `<tr>
              <td><b>${o.tipo}</b></td>
              <td class="mono-sm">${o.periodo}</td>
              <td class="mono-sm text-amber">${UI.q(o.monto_calculado)}</td>
              <td class="mono-sm text-green">${o.monto_pagado?UI.q(o.monto_pagado):'—'}</td>
              <td class="mono-sm ${vencida?'text-red':''}">${o.fecha_vencimiento?UI.fecha(o.fecha_vencimiento):'—'}${vencida?' ⚠️':''}</td>
              <td><span class="badge badge-${o.estado==='pagado'?'green':(vencida?'red':'amber')}">${o.estado==='pagado'?'Pagado':(vencida?'Vencida':'Pendiente')}</span></td>
              <td><div style="display:flex;gap:4px">
                ${o.estado==='pagado'?'':`<button class="btn btn-sm btn-green" onclick="Modulos.contabilidad.marcarPagada('${o.id}')">💵 Pagada</button>`}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('obligaciones_fiscales','${o.id}','la obligación ${o.tipo} ${o.periodo}',()=>Modulos.contabilidad._renderTab())`)}
              </div></td>
            </tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin obligaciones registradas este año. Genera la del mes desde las pestañas IVA o ISR.</td></tr>'}</tbody>
        </table></div>
        <div class="alert alert-cyan" style="margin-top:14px">
          <div class="alert-icon">📅</div>
          <div class="alert-body" style="font-size:12px">Registra aquí cada declaración al calcularla y márcala <b>pagada</b> al presentar en Declaraguate (boleta SAT-2000). Las vencidas se marcan en rojo.</div>
        </div>`;
    }
  },

  /* ── Registrar obligación del mes (desde IVA o ISR) ── */
  async registrarObligacion(tipo) {
    const { mes, anio, periodo } = this._rango();
    const d = await this._datos();
    const pequeno = (this._fiscal?.regimen_iva||'general').toLowerCase().startsWith('peque');
    let monto, vence;
    if (tipo === 'IVA') {
      monto = pequeno ? Math.round(d.ventasTotal*0.05*100)/100
        : Math.max(0, Math.round((d.debito-d.credito-d.retIva)*100)/100);
      vence = new Date(anio, mes+1, 0).toISOString().slice(0,10);          // fin del mes siguiente
    } else {
      monto = Math.max(0, Math.round((this._isrSimplificado(d.ventasNetas)-d.retIsr)*100)/100);
      vence = new Date(anio, mes, 10).toISOString().slice(0,10);           // ~día 10 del mes siguiente
    }
    const { error } = await DB.upsertObligacion({
      tipo, periodo, monto_calculado: monto, fecha_vencimiento: vence, estado: 'pendiente',
      notas: tipo==='IVA' ? (pequeno?'SAT-2046 Pequeño Contribuyente':'SAT-2237 IVA General') : 'SAT-1311 ISR Simplificado'
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(`Obligación ${tipo} ${periodo} registrada ✓ (${UI.q(monto)})`);
    this._ir('obligaciones');
  },

  async marcarPagada(id) {
    const obligaciones = await DB.getObligaciones(this._rango().anio);
    const o = obligaciones.find(x=>x.id===id); if (!o) return;
    const ok = await UI.confirmar(`¿Marcar como pagada la obligación <b>${o.tipo} ${o.periodo}</b> por <b>${UI.q(o.monto_calculado)}</b>?`, 'Confirmar');
    if (!ok) return;
    const { error } = await DB.upsertObligacion({
      id, estado:'pagado', monto_pagado:o.monto_calculado, fecha_pago: new Date().toISOString().slice(0,10)
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast('Obligación pagada ✓');
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
