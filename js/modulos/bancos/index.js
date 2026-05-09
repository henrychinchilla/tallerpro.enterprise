/* TallerPro v3.0 — bancos/index.js */
Modulos.bancos = {
  _bancos: [], _bancoActivo: null,

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._bancos = await DB.getBancos();

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🏦 Bancos</h1>
        <p class="page-subtitle">// ${this._bancos.length} cuentas registradas</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.bancos.modalBanco()">＋ Nueva Cuenta</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid-3" style="margin-bottom:24px">
          ${this._bancos.map(b=>`
            <div class="card card-cyan" style="cursor:pointer" onclick="Modulos.bancos.verMovimientos('${b.id}')">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                <div>
                  <div style="font-weight:800;font-size:15px">${b.nombre}</div>
                  <div style="font-size:11px;color:var(--text3)">${b.banco||''} · ${b.tipo||''}</div>
                </div>
                <span class="badge badge-${b.activa?'green':'gray'}">${b.activa?'Activa':'Inactiva'}</span>
              </div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:8px">No. ${b.numero||'—'}</div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--cyan)">${b.moneda||'GTQ'}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:8px">Click para ver movimientos →</div>
              <button class="btn btn-sm btn-ghost" style="margin-top:8px;width:100%" onclick="event.stopPropagation();Modulos.bancos.modalBanco('${b.id}')">✏️ Editar</button>
            </div>`).join('')||'<div class="text-muted">Sin cuentas bancarias registradas</div>'}
        </div>
        ${this._bancoActivo ? this._renderMovimientos() : ''}
      </div>`;
  },

  async verMovimientos(bancoId) {
    this._bancoActivo = bancoId;
    const banco = this._bancos.find(b=>b.id===bancoId);
    const movs = await DB.getMovimientosBanco(bancoId);
    const totalEntradas = movs.filter(m=>m.tipo==='entrada'||m.tipo==='deposito').reduce((s,m)=>s+(m.monto||0),0);
    const totalSalidas  = movs.filter(m=>m.tipo==='salida'||m.tipo==='retiro').reduce((s,m)=>s+(m.monto||0),0);
    const saldo = (banco.saldo_inicial||0) + totalEntradas - totalSalidas;

    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">🏦 ${banco.nombre}</h1>
          <p class="page-subtitle">// ${banco.banco} · ${banco.numero||'—'}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.bancos.render()">← Volver</button>
          <button class="btn btn-amber" onclick="Modulos.bancos.modalMovimiento('${bancoId}')">＋ Nuevo Movimiento</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:20px">
          <div class="kpi-card"><div class="kpi-label">Saldo Actual</div><div class="kpi-val ${saldo>=0?'cyan':'red'}">${UI.q(saldo)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Entradas</div><div class="kpi-val green">${UI.q(totalEntradas)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Salidas</div><div class="kpi-val red">${UI.q(totalSalidas)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Movimientos</div><div class="kpi-val amber">${movs.length}</div></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Referencia</th><th>Monto</th><th>Conciliado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${movs.map(m=>`<tr>
                <td>${UI.fecha(m.fecha)}</td>
                <td>${m.concepto}</td>
                <td><span class="badge badge-${m.tipo==='entrada'||m.tipo==='deposito'?'green':'red'}">${m.tipo}</span></td>
                <td class="mono-sm">${m.referencia||'—'}</td>
                <td class="mono-sm ${m.tipo==='entrada'||m.tipo==='deposito'?'text-green':'text-red'}">
                  ${m.tipo==='entrada'||m.tipo==='deposito'?'+':'-'}${UI.q(m.monto)}
                </td>
                <td><span class="badge badge-${m.conciliado?'green':'gray'}">${m.conciliado?'✓':'Pendiente'}</span></td>
                <td><button class="btn btn-sm btn-cyan" onclick="Modulos.bancos.modalMovimiento('${bancoId}','${m.id}')">Editar</button></td>
              </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin movimientos registrados</td></tr>'}
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
          <input class="form-input" id="ban-num" value="${b.numero||''}" class="mono-sm"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Moneda</label>
          <select class="form-select" id="ban-moneda">
            ${['GTQ','USD','EUR'].map(x=>`<option ${b.moneda===x?'selected':''}>${x}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Saldo Inicial (Q)</label>
          <input class="form-input" id="ban-saldo" type="number" value="${b.saldo_inicial||0}" step="0.01"></div>
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
      activa:        true
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertBanco(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
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
