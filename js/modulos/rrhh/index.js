/* TallerPro v3.0 — rrhh/index.js */
Modulos.rrhh = {
  _tab: 'empleados', _empleados: [],

  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">👤 RRHH & Nómina</h1>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='empleados'?'active':''}" onclick="Modulos.rrhh._tab='empleados';Modulos.rrhh._renderTab()">👤 Empleados</button>
          <button class="tab-btn ${this._tab==='nomina'?'active':''}" onclick="Modulos.rrhh._tab='nomina';Modulos.rrhh._renderTab()">💵 Nómina</button>
          <button class="tab-btn ${this._tab==='viaticos'?'active':''}" onclick="Modulos.rrhh._tab='viaticos';Modulos.rrhh._renderTab()">🚗 Viáticos</button>
          <button class="tab-btn ${this._tab==='documentos'?'active':''}" onclick="Modulos.rrhh._tab='documentos';Modulos.rrhh._renderTab()">📄 Documentos</button>
        </div>
        <div id="rrhh-content"><div style="padding:40px;text-align:center;color:var(--text3)">⏳ Cargando...</div></div>
      </div>`;
    await this._renderTab();
  },

  async _renderTab() {
    const el = document.getElementById('rrhh-content');
    if (!el) return;
    this._empleados = await DB.getEmpleados();

    if (this._tab==='empleados') {
      el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
          <button class="btn btn-amber" onclick="Modulos.rrhh.modalEmpleado()">＋ Nuevo Empleado</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Empleado</th><th>Cargo</th><th>DPI</th><th>IGSS</th><th>Ingreso</th><th>Salario Base</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._empleados.map(e=>`<tr>
                <td><div style="display:flex;align-items:center;gap:8px">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--amber-dim);display:flex;align-items:center;justify-content:center;font-size:14px">
                    ${e.foto ? `<img src="${e.foto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : '👤'}
                  </div>
                  <div><div style="font-weight:700">${e.nombre}</div><div style="font-size:11px;color:var(--text3)">${e.email||''}</div></div>
                </div></td>
                <td>${e.cargo||'—'}</td>
                <td class="mono-sm">${e.dpi||'—'}</td>
                <td class="mono-sm">${e.igss||'—'}</td>
                <td>${UI.fecha(e.fecha_ingreso)}</td>
                <td class="mono-sm text-amber">${UI.q(e.salario_base)}</td>
                <td><span class="badge badge-${e.activo?'green':'red'}">${e.activo?'Activo':'Inactivo'}</span></td>
                <td><div style="display:flex;gap:4px">
                  <button class="btn btn-sm btn-cyan" onclick="Modulos.rrhh.modalEmpleado('${e.id}')">Editar</button>
                  <button class="btn btn-sm btn-ghost" onclick="Modulos.rrhh._tab='nomina';Modulos.rrhh._renderTab()">💵</button>
                </div></td>
              </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin empleados registrados</td></tr>'}
            </tbody>
          </table>
        </div>`;
    }

    else if (this._tab==='nomina') {
      const now = new Date();
      const mes = now.getMonth()+1;
      const anio = now.getFullYear();
      const pagos = await DB.getPagosNomina(mes, anio);

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-weight:700">Nómina ${now.toLocaleDateString('es-GT',{month:'long',year:'numeric'})}</div>
          <button class="btn btn-amber" onclick="Modulos.rrhh.calcularNomina(${mes},${anio})">🔄 Calcular Nómina</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Empleado</th><th>Salario Base</th><th>Bonificación</th><th>IGSS</th><th>ISR</th><th>Líquido</th><th>Estado</th></tr></thead>
            <tbody>
              ${pagos.map(p=>`<tr>
                <td>${p.empleados?.nombre||'—'}</td>
                <td class="mono-sm">${UI.q(p.salario_base)}</td>
                <td class="mono-sm">${UI.q(p.bonificacion)}</td>
                <td class="mono-sm text-red">-${UI.q(p.igss_laboral)}</td>
                <td class="mono-sm text-red">-${UI.q(p.isr)}</td>
                <td class="mono-sm text-green"><b>${UI.q(p.liquido)}</b></td>
                <td><span class="badge badge-${p.pagado?'green':'amber'}">${p.pagado?'Pagado':'Pendiente'}</span></td>
              </tr>`).join('')||`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">
                Haz click en "Calcular Nómina" para generar los pagos del mes
              </td></tr>`}
            </tbody>
          </table>
        </div>
        ${pagos.length>0?`
        <div class="card card-amber" style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;font-size:13px">
            <span>Total nómina:</span>
            <b>${UI.q(pagos.reduce((s,p)=>s+p.liquido,0))}</b>
          </div>
        </div>`:''}`;
    }

    else if (this._tab==='viaticos') {
      const viaticos = await DB.getViaticos();
      el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
          <button class="btn btn-amber" onclick="Modulos.rrhh.modalViatico()">＋ Nuevo Viático</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Empleado</th><th>Concepto</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead>
            <tbody>
              ${viaticos.map(v=>`<tr>
                <td>${UI.fecha(v.fecha)}</td>
                <td>${v.empleados?.nombre||'—'}</td>
                <td>${v.concepto}</td>
                <td><span class="badge badge-gray">${v.tipo||'—'}</span></td>
                <td class="mono-sm text-amber">${UI.q(v.monto)}</td>
                <td><span class="badge badge-${v.aprobado?'green':'amber'}">${v.aprobado?'Aprobado':'Pendiente'}</span></td>
              </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin viáticos registrados</td></tr>'}
            </tbody>
          </table>
        </div>`;
    }

    else if (this._tab==='documentos') {
      el.innerHTML = `
        <div class="alert alert-cyan" style="margin-bottom:16px">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:12px">Selecciona un empleado para ver y gestionar sus documentos (DPI, IGSS, contrato, etc.)</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
          ${this._empleados.map(e=>`
            <div class="card" style="cursor:pointer;text-align:center" onclick="Modulos.rrhh.verDocumentos('${e.id}','${e.nombre}')">
              <div style="font-size:28px;margin-bottom:8px">👤</div>
              <div style="font-weight:700;font-size:13px">${e.nombre}</div>
              <div style="font-size:11px;color:var(--text3)">${e.cargo||'—'}</div>
              <div class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%">Ver documentos</div>
            </div>`).join('')||'<div class="text-muted">Sin empleados</div>'}
        </div>`;
    }
  },

  async calcularNomina(mes, anio) {
    UI.toast('Calculando nómina...','info');
    for (const e of this._empleados.filter(x=>x.activo)) {
      const isr = calcularISR(e.salario_base);
      const igss = e.salario_base * GT.igss_laboral;
      const liquido = e.salario_base + (e.bonificacion||GT.bonificacion_incentivo) - igss - isr;
      await DB.upsertPagoNomina({
        empleado_id:  e.id,
        periodo_mes:  mes,
        periodo_anio: anio,
        salario_base: e.salario_base,
        bonificacion: e.bonificacion || GT.bonificacion_incentivo,
        igss_laboral: igss,
        isr,
        liquido
      });
    }
    UI.toast('Nómina calculada ✓');
    this._renderTab();
  },

  modalEmpleado(id=null) {
    const e = id ? this._empleados.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Empleado`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del empleado.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre Completo *</label>
          <input class="form-input" id="emp-nombre" value="${e.nombre||''}"></div>
        <div class="form-group"><label class="form-label">Cargo / Puesto</label>
          <input class="form-input" id="emp-cargo" value="${e.cargo||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Teléfono</label>
          <input class="form-input" id="emp-tel" value="${e.tel||''}"></div>
        <div class="form-group"><label class="form-label">Email</label>
          <input class="form-input" id="emp-email" type="email" value="${e.email||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">DPI</label>
          <input class="form-input" id="emp-dpi" value="${e.dpi||''}"></div>
        <div class="form-group"><label class="form-label">No. IGSS</label>
          <input class="form-input" id="emp-igss" value="${e.igss||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha de Ingreso</label>
          <input class="form-input" id="emp-ingreso" type="date" value="${e.fecha_ingreso||''}"></div>
        <div class="form-group"><label class="form-label">Rol en Sistema</label>
          <select class="form-select" id="emp-rol">
            ${['mecanico','recepcionista','gerente_tal','gerente_fin','admin'].map(r=>`<option value="${r}" ${e.rol===r?'selected':''}>${ROLES[r]?.label||r}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Salario Base (Q)</label>
          <input class="form-input" id="emp-salario" type="number" value="${e.salario_base||GT.salario_minimo_no_agricola}" min="0" step="0.01"></div>
        <div class="form-group"><label class="form-label">Bonificación (Q)</label>
          <input class="form-input" id="emp-bono" type="number" value="${e.bonificacion||GT.bonificacion_incentivo}" min="0"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="emp-notas" rows="2">${e.notas||''}</textarea></div>
      ${esEdicion?`<div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="emp-activo" ${e.activo?'checked':''}>
          <span class="form-label" style="margin:0">Empleado activo</span>
        </label>
      </div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarEmpleado('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Empleado'}
        </button>
      </div>`,'640px');
  },

  async guardarEmpleado(id='') {
    const nombre = document.getElementById('emp-nombre')?.value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    const fields = {
      nombre,
      cargo:        document.getElementById('emp-cargo')?.value||null,
      tel:          document.getElementById('emp-tel')?.value||null,
      email:        document.getElementById('emp-email')?.value||null,
      dpi:          document.getElementById('emp-dpi')?.value||null,
      igss:         document.getElementById('emp-igss')?.value||null,
      fecha_ingreso:document.getElementById('emp-ingreso')?.value||null,
      rol:          document.getElementById('emp-rol')?.value||'mecanico',
      salario_base: parseFloat(document.getElementById('emp-salario')?.value)||GT.salario_minimo_no_agricola,
      bonificacion: parseFloat(document.getElementById('emp-bono')?.value)||GT.bonificacion_incentivo,
      notas:        document.getElementById('emp-notas')?.value||null,
      activo:       id ? (document.getElementById('emp-activo')?.checked ?? true) : true
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertEmpleado(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Empleado actualizado ✓':'Empleado creado ✓');
    this._renderTab();
  },

  modalViatico() {
    UI.modal('＋ Nuevo Viático', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Empleado *</label>
          <select class="form-select" id="via-emp">
            <option value="">Seleccionar...</option>
            ${this._empleados.filter(e=>e.activo).map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tipo</label>
          <select class="form-select" id="via-tipo">
            ${['alimentacion','transporte','hospedaje','combustible','otro'].map(t=>`<option>${t}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Concepto *</label>
          <input class="form-input" id="via-concepto" placeholder="Almuerzo en visita a cliente"></div>
        <div class="form-group"><label class="form-label">Monto (Q) *</label>
          <input class="form-input" id="via-monto" type="number" min="0" step="0.01"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha</label>
          <input class="form-input" id="via-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Referencia / Factura</label>
          <input class="form-input" id="via-ref"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.rrhh.guardarViatico()">Registrar Viático</button>
      </div>`);
  },

  async guardarViatico() {
    const empId   = document.getElementById('via-emp')?.value;
    const concepto= document.getElementById('via-concepto')?.value.trim();
    const monto   = parseFloat(document.getElementById('via-monto')?.value)||0;
    if (!empId||!concepto||monto<=0) { UI.toast('Completa todos los campos','error'); return; }
    const {error} = await DB.upsertViatico({
      empleado_id: empId, concepto, monto,
      tipo:        document.getElementById('via-tipo')?.value,
      fecha:       document.getElementById('via-fecha')?.value,
      referencia:  document.getElementById('via-ref')?.value||null,
      aprobado:    false
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Viático registrado ✓');
    this._renderTab();
  },

  async verDocumentos(empId, nombre) {
    const docs = await DB.getDocumentosEmpleado(empId);
    const TIPOS = ['DPI','Contrato','IGSS','IRTRA','Antecedentes','Título','Otro'];
    UI.modal(`📄 Documentos — ${nombre}`, `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${TIPOS.map(tipo=>{
          const doc = docs.find(d=>d.tipo===tipo);
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--surface2);border-radius:8px">
            <div>
              <div style="font-weight:700;font-size:13px">${tipo}</div>
              ${doc ? `<div style="font-size:11px;color:var(--text3)">No: ${doc.numero||'—'} · Vence: ${UI.fecha(doc.fecha_vencimiento)}</div>` : '<div style="font-size:11px;color:var(--text3)">Sin registrar</div>'}
            </div>
            <span class="badge badge-${doc?'green':'gray'}">${doc?'✓ Registrado':'Pendiente'}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`,'480px');
  }
};
