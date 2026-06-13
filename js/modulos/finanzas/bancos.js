/* TallerPro v3.0 — bancos/index.js */
Modulos.bancos = {
  _bancos: [], _bancoActivo: null,

  /* Calcula el saldo actual de una cuenta a partir de sus movimientos */
  async _saldoDe(banco) {
    const movs = await DB.getMovimientosBanco(banco.id);
    const ent = movs.filter(m=>m.tipo==='entrada'||m.tipo==='deposito').reduce((s,m)=>s+(m.monto||0),0);
    const sal = movs.filter(m=>m.tipo==='salida'||m.tipo==='retiro').reduce((s,m)=>s+(m.monto||0),0);
    return { saldo: (banco.saldo_inicial||0) + ent - sal, movs: movs.length };
  },

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._bancos = await DB.getBancos();

    /* Saldos reales por cuenta (en paralelo) */
    const saldos = await Promise.all(this._bancos.map(b=>this._saldoDe(b)));
    this._bancos.forEach((b,i)=>{ b._saldo = saldos[i].saldo; b._movs = saldos[i].movs; });

    /* Resumen por moneda */
    const porMoneda = {};
    this._bancos.filter(b=>b.activa!==false).forEach(b=>{
      const m = b.moneda||'GTQ';
      porMoneda[m] = (porMoneda[m]||0) + (b._saldo||0);
    });
    const activas = this._bancos.filter(b=>b.activa!==false).length;
    const totalMovs = this._bancos.reduce((s,b)=>s+(b._movs||0),0);
    const monedaCards = Object.entries(porMoneda).map(([m,v])=>
      UI.kpiCard({ icon:'🏦', clase: v>=0?'cyan':'red', label:`Saldo Total ${m}`, value: v, money:true })
    ).join('') || UI.kpiCard({ icon:'🏦', clase:'cyan', label:'Saldo Total', value: 0, money:true });

    const varClase = m => m==='USD'?'v-usd':m==='EUR'?'v-eur':'';

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🏦 Bancos</h1>
        <p class="page-subtitle">// ${this._bancos.length} cuentas · ${activas} activas</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.bancos.modalBanco()">＋ Nueva Cuenta</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:20px">
          ${monedaCards}
          ${UI.kpiCard({ icon:'🏦', clase:'amber', label:'Cuentas Activas', value: activas, trend:`de ${this._bancos.length} totales` })}
          ${UI.kpiCard({ icon:'🔁', clase:'green', label:'Movimientos', value: totalMovs, trend:'registrados' })}
        </div>
        <div class="bank-grid">
          ${this._bancos.map(b=>`
            <div class="bank-card ${varClase(b.moneda)} ${b.activa===false?'inactive':''}" onclick="Modulos.bancos.verMovimientos('${b.id}')">
              <div class="bank-card-top">
                <div>
                  <div class="bank-card-bank">${b.banco||'Banco'} · ${b.tipo||'cuenta'}</div>
                  <div class="bank-card-name">${b.nombre}</div>
                  ${(b.predeterminada_ingresos||b.predeterminada_egresos)?`<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${b.predeterminada_ingresos?'<span class="badge badge-green" style="font-size:9px">📥 Ingresos</span>':''}${b.predeterminada_egresos?'<span class="badge badge-amber" style="font-size:9px">📤 Egresos</span>':''}</div>`:''}
                </div>
                <div class="bank-card-chip"></div>
              </div>
              <div class="bank-card-num">${this._fmtNum(b.numero)}</div>
              <div>
                <div class="bank-card-saldo-label">Saldo actual · ${b.moneda||'GTQ'}</div>
                <div class="bank-card-saldo">${UI.q(b._saldo||0)}</div>
              </div>
              <div class="bank-card-foot">
                <span style="font-size:10px;opacity:.8">${b._movs||0} movimiento(s) · ver →</span>
                <div class="bank-card-actions" onclick="event.stopPropagation()">
                  ${Modulos.btnAccion('editar', `Modulos.bancos.modalBanco('${b.id}')`)}
                  ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('bancos','${b.id}','${(b.nombre||'').replace(/'/g,"\\'")}',()=>Modulos.bancos.render())`)}
                </div>
              </div>
            </div>`).join('')||'<div class="text-muted" style="padding:24px">Sin cuentas bancarias registradas. Crea la primera con “＋ Nueva Cuenta”.</div>'}
        </div>
      </div>`;
  },

  /* Enmascara el número de cuenta dejando los últimos 4 dígitos */
  _fmtNum(num) {
    if (!num) return '•••• •••• ••••';
    const s = String(num).replace(/\s+/g,'');
    const last = s.slice(-4).padStart(4,'•');
    return `•••• •••• •••• ${last}`;
  },

  async verMovimientos(bancoId, mes=null) {
    this._bancoActivo = bancoId;
    const banco = this._bancos.find(b=>b.id===bancoId);
    if (!banco) { this.render(); return; }
    const esEntrada = t => t==='entrada'||t==='deposito';

    /* Mes seleccionado (YYYY-MM); por defecto el mes actual */
    const now = new Date();
    this._mesBanco = mes || this._mesBanco || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const [y,mm] = this._mesBanco.split('-').map(Number);
    const iniMes = `${this._mesBanco}-01`;
    const finMes = new Date(y, mm, 0).toISOString().slice(0,10);
    const mesLabel = new Date(y, mm-1, 1).toLocaleDateString('es-GT',{month:'long',year:'numeric'});

    /* Todos los movimientos para poder arrastrar el saldo */
    const todos = await DB.getMovimientosBanco(bancoId);

    /* Saldo inicial del mes = saldo inicial de la cuenta + neto de TODO lo anterior al mes */
    const netoPrevios = todos
      .filter(m => (m.fecha||'') < iniMes)
      .reduce((s,m)=> s + (esEntrada(m.tipo)? (m.monto||0) : -(m.monto||0)), 0);
    const saldoInicialMes = (banco.saldo_inicial||0) + netoPrevios;

    /* Movimientos del mes y running balance (de antiguo a reciente) */
    const movsMes = todos.filter(m => (m.fecha||'') >= iniMes && (m.fecha||'') <= finMes);
    const entradasMes = movsMes.filter(m=>esEntrada(m.tipo)).reduce((s,m)=>s+(m.monto||0),0);
    const salidasMes  = movsMes.filter(m=>!esEntrada(m.tipo)).reduce((s,m)=>s+(m.monto||0),0);
    const saldoFinalMes = saldoInicialMes + entradasMes - salidasMes;
    const utilMes = entradasMes - salidasMes;

    const movsAsc = [...movsMes].sort((a,b)=> (a.fecha||'').localeCompare(b.fecha||'') || (a.created_at||'').localeCompare(b.created_at||''));
    let run = saldoInicialMes;
    movsAsc.forEach(m => { run += esEntrada(m.tipo)? (m.monto||0) : -(m.monto||0); m._saldo = run; });
    const movs = movsAsc.reverse();  // mostrar reciente arriba

    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">🏦 ${banco.nombre}</h1>
          <p class="page-subtitle">// ${banco.banco} · ${banco.numero||'—'} · Saldo actual total: <b>${UI.q(banco._saldo!=null?banco._saldo:saldoFinalMes)}</b></p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.bancos.render()">← Volver</button>
          <input type="month" class="form-input" style="width:160px" value="${this._mesBanco}" onchange="Modulos.bancos.verMovimientos('${bancoId}', this.value)">
          <button class="btn btn-amber" onclick="Modulos.bancos.modalMovimiento('${bancoId}')">＋ Nuevo Movimiento</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:20px">
          ${UI.kpiCard({ icon:'📅', clase: saldoInicialMes>=0?'cyan':'red', label:`Saldo inicial · ${mesLabel}`, value: saldoInicialMes, money:true, trend:'arrastrado del mes anterior' })}
          ${UI.kpiCard({ icon:'⬆️', clase:'green', label:'Entradas del mes', value: entradasMes, money:true })}
          ${UI.kpiCard({ icon:'⬇️', clase:'red', label:'Salidas del mes', value: salidasMes, money:true })}
          ${UI.kpiCard({ icon:'💰', clase: saldoFinalMes>=0?'cyan':'red', label:'Saldo final del mes', value: saldoFinalMes, money:true,
            trend: `${utilMes>=0?'▲ ganancia':'▼ pérdida'} ${UI.q(Math.abs(utilMes))}` })}
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Referencia</th><th>Monto</th><th>Saldo</th><th>Conciliado</th><th>Acciones</th></tr></thead>
            <tbody>
              <tr style="background:var(--surface2)">
                <td colspan="5" style="font-weight:700">Saldo inicial del mes (${mesLabel})</td>
                <td class="mono-sm" style="font-weight:700">${UI.q(saldoInicialMes)}</td>
                <td colspan="2"></td>
              </tr>
              ${movs.map(m=>`<tr>
                <td>${UI.fecha(m.fecha)}</td>
                <td>${m.concepto}</td>
                <td><span class="badge badge-${esEntrada(m.tipo)?'green':'red'}">${m.tipo}</span></td>
                <td class="mono-sm">${m.referencia||'—'}</td>
                <td class="mono-sm ${esEntrada(m.tipo)?'text-green':'text-red'}">
                  ${esEntrada(m.tipo)?'+':'-'}${UI.q(m.monto)}
                </td>
                <td class="mono-sm">${UI.q(m._saldo)}</td>
                <td><span class="badge badge-${m.conciliado?'green':'gray'}">${m.conciliado?'✓':'Pendiente'}</span></td>
                <td><div style="display:flex;gap:4px">
                  ${Modulos.btnAccion('editar', `Modulos.bancos.modalMovimiento('${bancoId}','${m.id}')`)}
                  ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('banco_movimientos','${m.id}','este movimiento',()=>Modulos.bancos.verMovimientos('${bancoId}'))`)}
                </div></td>
              </tr>`).join('')||`<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin movimientos en ${mesLabel}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  modalBanco(id=null) {
    const b = id ? this._bancos.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nueva'} Cuenta Bancaria`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la cuenta.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre de Cuenta *</label>
          <input class="form-input" id="ban-nombre" value="${b.nombre||''}" placeholder="Cuenta Operativa GTQ"></div>
        <div class="form-group"><label class="form-label">Banco</label>
          <select class="form-select" id="ban-banco">
            ${['Banrural','BAC','G&T Continental','Industrial','Bantrab','Agromercantil','Citibank','Otro'].map(x=>`<option ${b.banco===x?'selected':''}>${x}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo de Cuenta</label>
          <select class="form-select" id="ban-tipo">
            ${['monetaria','ahorro','depositos','credito'].map(x=>`<option ${b.tipo===x?'selected':''}>${x}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Número de Cuenta</label>
          <input class="form-input mono-sm" id="ban-num" value="${b.numero||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Moneda</label>
          <select class="form-select" id="ban-moneda">
            ${['GTQ','USD','EUR'].map(x=>`<option ${b.moneda===x?'selected':''}>${x}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Saldo Inicial (Q)</label>
          <input class="form-input" id="ban-saldo" type="number" value="${b.saldo_inicial||0}" step="0.01"></div>
      </div>
      ${esEdicion?`<div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="ban-activa" ${b.activa!==false?'checked':''}>
          <span class="form-label" style="margin:0">Cuenta activa</span>
        </label>
      </div>`:''}
      <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Las facturas/ventas entran a la cuenta de <b>ingresos</b>; los costos/planilla salen de la de <b>egresos</b>. Si solo hay una cuenta, se usa por defecto.</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;margin-bottom:6px">
          <input type="checkbox" id="ban-def-ing" ${b.predeterminada_ingresos?'checked':''}>
          <span>📥 Cuenta predeterminada para INGRESOS</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="ban-def-egr" ${b.predeterminada_egresos?'checked':''}>
          <span>📤 Cuenta predeterminada para EGRESOS</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.bancos.guardarBanco('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Cuenta'}
        </button>
      </div>`);
  },

  async guardarBanco(id='') {
    const nombre = document.getElementById('ban-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    const fields = {
      nombre,
      banco:         document.getElementById('ban-banco')?.value,
      tipo:          document.getElementById('ban-tipo')?.value,
      numero:        document.getElementById('ban-num')?.value||null,
      moneda:        document.getElementById('ban-moneda')?.value,
      saldo_inicial: parseFloat(document.getElementById('ban-saldo')?.value)||0,
      activa:        id ? (document.getElementById('ban-activa')?.checked ?? true) : true,
      predeterminada_ingresos: document.getElementById('ban-def-ing')?.checked || false,
      predeterminada_egresos:  document.getElementById('ban-def-egr')?.checked || false
    };
    if (id) fields.id = id;
    const res = await DB.upsertBanco(fields);
    if (res.error) { UI.toast('Error: '+res.error.message,'error'); return; }
    /* Mantener una única cuenta predeterminada por tipo */
    const savedId = id || res.data?.id;
    if (savedId) {
      if (fields.predeterminada_ingresos)
        await getSB().from('bancos').update({predeterminada_ingresos:false}).eq('tenant_id',getTID()).neq('id',savedId);
      if (fields.predeterminada_egresos)
        await getSB().from('bancos').update({predeterminada_egresos:false}).eq('tenant_id',getTID()).neq('id',savedId);
    }
    UI.cerrarModal(); UI.toast(id?'Cuenta actualizada ✓':'Cuenta creada ✓');
    this.render();
  },

  modalMovimiento(bancoId, id=null) {
    UI.modal(`${id?'✏️ Editar':'＋ Nuevo'} Movimiento`, `
      ${id?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán el movimiento actual.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo *</label>
          <select class="form-select" id="mov-tipo">
            <option value="deposito">📥 Depósito / Entrada</option>
            <option value="retiro">📤 Retiro / Salida</option>
            <option value="transferencia">🔄 Transferencia</option>
            <option value="pago">💳 Pago</option>
          </select></div>
        <div class="form-group"><label class="form-label">Monto (Q) *</label>
          <input class="form-input" id="mov-monto" type="number" min="0" step="0.01" placeholder="0.00"></div>
      </div>
      <div class="form-group"><label class="form-label">Concepto *</label>
        <input class="form-input" id="mov-concepto" placeholder="Pago a proveedor / Depósito de cliente"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" id="mov-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">No. Referencia / Cheque</label>
          <input class="form-input" id="mov-ref" placeholder="CHQ-001 / TRF-2026"></div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="mov-conciliado">
          <span class="form-label" style="margin:0">Movimiento conciliado</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.bancos.guardarMovimiento('${bancoId}','${id||''}')">
          ${id?'Guardar Cambios':'Registrar'}
        </button>
      </div>`);
  },

  async guardarMovimiento(bancoId, id='') {
    const concepto = document.getElementById('mov-concepto')?.value.trim();
    const monto    = parseFloat(document.getElementById('mov-monto')?.value)||0;
    if (!concepto||monto<=0) { UI.toast('Concepto y monto son obligatorios','error'); return; }
    const tipoVal = document.getElementById('mov-tipo')?.value;
    const fields = {
      banco_id:   bancoId,
      tipo:       tipoVal==='deposito'||tipoVal==='transferencia' ? 'entrada' : 'salida',
      concepto,
      monto,
      referencia: document.getElementById('mov-ref')?.value||null,
      fecha:      document.getElementById('mov-fecha')?.value,
      conciliado: document.getElementById('mov-conciliado')?.checked||false
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertMovimientoBanco(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Movimiento actualizado ✓':'Movimiento registrado ✓');
    this.verMovimientos(bancoId);
  }
};
