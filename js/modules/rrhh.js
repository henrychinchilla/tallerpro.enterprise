/* ═══════════════════════════════════════════════════════
   modules/rrhh.js — RRHH Avanzado
   TallerPro Enterprise v2.0

   Incluye:
   - Empleados (CRUD + nómina)
   - Viáticos
   - Entrenamientos
   - Llamadas de Atención
   - Liquidación / Finiquito (ley Guatemala)
   - Generación de cartas
═══════════════════════════════════════════════════════ */

let _rrhhTab = 'empleados';

Pages.rrhh = async function (tab = 'empleados') {
  _rrhhTab = tab;
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">RRHH & Nómina</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const empleados = await DB.getEmpleados();
  Pages._empleadosData = empleados;

  const tabs = [
    { id: 'empleados',    icon: '👥', label: 'Empleados'       },
    { id: 'viaticos',     icon: '🚗', label: 'Viáticos'        },
    { id: 'entrenamientos',icon:'📚', label: 'Entrenamientos'  },
    { id: 'disciplina',   icon: '⚠️', label: 'Disciplina'      },
    { id: 'liquidaciones',icon: '📄', label: 'Liquidaciones'   }
  ];

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">RRHH & Nómina</h1>
        <p class="page-subtitle">// ${empleados.length} EMPLEADOS · IGSS · MINTRAB · Guatemala</p>
      </div>
      <div class="page-actions">
        ${tab === 'empleados'     ? '<button class="btn btn-ghost" onclick="Pages.calcularNomina()">🧾 Nómina</button><button class="btn btn-amber" onclick="Pages.modalNuevoEmpleado()">＋ Empleado</button>' : ''}
        ${tab === 'viaticos'      ? '<button class="btn btn-amber" onclick="Pages.modalNuevoViatico()">＋ Viático</button>' : ''}
        ${tab === 'entrenamientos'? '<button class="btn btn-amber" onclick="Pages.modalNuevoEntrenamiento()">＋ Entrenamiento</button>' : ''}
        ${tab === 'disciplina'    ? '<button class="btn btn-amber" onclick="Pages.modalNuevaLlamada()">＋ Llamada de Atención</button>' : ''}
        ${tab === 'liquidaciones' ? '<button class="btn btn-amber" onclick="Pages.modalNuevaLiquidacion()">＋ Liquidación</button>' : ''}
      </div>
    </div>
    <div class="page-body">
      <!-- TABS -->
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border)">
        ${tabs.map(t => `
        <button onclick="Pages.rrhh('${t.id}')" id="rrhh-tab-${t.id}"
          style="padding:10px 16px;border:none;background:none;cursor:pointer;font-family:'Manrope',sans-serif;
                 font-size:13px;font-weight:600;white-space:nowrap;
                 border-bottom:2px solid ${_rrhhTab===t.id?'var(--amber)':'transparent'};
                 color:${_rrhhTab===t.id?'var(--amber)':'var(--text2)'}">
          ${t.icon} ${t.label}
        </button>`).join('')}
      </div>
      <div id="rrhh-content"></div>
    </div>`;

  await Pages._renderRRHHTab(tab, empleados);
};

Pages._renderRRHHTab = async function (tab, empleados) {
  const el = document.getElementById('rrhh-content');
  switch (tab) {
    case 'empleados':     el.innerHTML = Pages._renderEmpleados(empleados); break;
    case 'viaticos':      el.innerHTML = await Pages._renderViaticos(empleados); break;
    case 'entrenamientos':el.innerHTML = await Pages._renderEntrenamientos(empleados); break;
    case 'disciplina':    el.innerHTML = await Pages._renderDisciplina(empleados); break;
    case 'liquidaciones': el.innerHTML = await Pages._renderLiquidaciones(empleados); break;
  }
};

/* ══════════════════════════════════════════════════════
   EMPLEADOS
══════════════════════════════════════════════════════ */
Pages._renderEmpleados = function (empleados) {
  const totalNomina = empleados.reduce((s,e) => s + (e.salario_base||0), 0);
  return `
    <div class="kpi-grid">
      <div class="kpi-card amber"><div class="kpi-label">Planilla Mensual</div><div class="kpi-val amber">${UI.q(totalNomina)}</div></div>
      <div class="kpi-card cyan"><div class="kpi-label">Empleados</div><div class="kpi-val cyan">${empleados.length}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Con IGSS</div><div class="kpi-val green">${empleados.filter(e=>e.igss).length}</div></div>
      <div class="kpi-card"><div class="kpi-label">IGSS Patronal</div><div class="kpi-val">${UI.q(totalNomina*0.1267)}</div></div>
    </div>
    ${empleados.length === 0 ? `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:40px;margin-bottom:16px">👤</div>
        <div class="text-muted mb-4">Sin empleados. Agrega el primero.</div>
        <button class="btn btn-amber" onclick="Pages.modalNuevoEmpleado()">＋ Agregar Empleado</button>
      </div>` :
    `<div style="display:flex;flex-direction:column;gap:10px">
      ${empleados.map(e => {
        const igssLab = ((e.salario_base||0)*0.0483).toFixed(2);
        const liquido = ((e.salario_base||0)+(e.bonificacion||250)-parseFloat(igssLab)).toFixed(2);
        return `
        <div class="emp-card">
          <div class="emp-avatar" style="background:var(--${ROLES[e.rol]?.color||'gray'}-dim)">${e.avatar||'👤'}</div>
          <div style="flex:1">
            <div class="emp-name">${e.nombre}</div>
            <div class="emp-role">${e.cargo||''} · <span class="badge badge-${ROLES[e.rol]?.color||'gray'}" style="font-size:8px">${ROLES[e.rol]?.label||e.rol}</span></div>
          </div>
          <div class="emp-stats">
            <div><div class="emp-stat-val" style="font-size:15px">${UI.q(e.salario_base||0)}</div><div class="emp-stat-lbl">Salario</div></div>
            <div><div class="emp-stat-val" style="font-size:15px">${UI.q(liquido)}</div><div class="emp-stat-lbl">Líquido</div></div>
          </div>
          <div style="display:flex;gap:6px;margin-left:12px">
            <button class="btn btn-sm btn-ghost" onclick="Pages.verEmpleado('${e.id}')">Ver</button>
            <button class="btn btn-sm btn-cyan" onclick="Pages.modalEditarEmpleado('${e.id}')">✏️</button>
            <button class="btn btn-sm btn-amber" onclick="Pages.imprimirBoleta('${e.id}')">🖨️</button>
          </div>
        </div>`; }).join('')}
    </div>`}`;
};

/* ══════════════════════════════════════════════════════
   VIÁTICOS
══════════════════════════════════════════════════════ */
Pages._renderViaticos = async function (empleados) {
  const viaticos = await DB.getViaticos();
  const total    = viaticos.reduce((s,v) => s+v.monto, 0);
  const pendientes = viaticos.filter(v=>v.estado==='pendiente').length;

  const cats = {
    alimentacion:'🍽️ Alimentación', transporte:'🚌 Transporte',
    hospedaje:'🏨 Hospedaje', combustible:'⛽ Combustible',
    peajes:'🛣️ Peajes', parqueo:'🅿️ Parqueo',
    comunicacion:'📱 Comunicación', otros:'📋 Otros'
  };

  return `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi-card amber"><div class="kpi-label">Total Viáticos</div><div class="kpi-val amber">${UI.q(total)}</div></div>
      <div class="kpi-card cyan"><div class="kpi-label">Pendientes Aprobación</div><div class="kpi-val cyan">${pendientes}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Aprobados</div><div class="kpi-val green">${viaticos.filter(v=>v.estado==='aprobado'||v.estado==='pagado').length}</div></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${viaticos.map(v => {
            const emp = v.empleados || empleados.find(e=>e.id===v.empleado_id);
            const estColor = {pendiente:'amber',aprobado:'green',pagado:'cyan',rechazado:'red'}[v.estado]||'gray';
            return `<tr>
              <td>${emp?.nombre||'—'}</td>
              <td class="mono-sm">${v.fecha}</td>
              <td>${v.concepto}</td>
              <td><span class="badge badge-gray">${cats[v.categoria]||v.categoria}</span></td>
              <td class="mono-sm text-amber">${UI.q(v.monto)}</td>
              <td><span class="badge badge-${estColor}">${v.estado}</span></td>
              <td>
                ${v.estado==='pendiente'?`
                  <button class="btn btn-sm btn-success" onclick="Pages.aprobarViatico('${v.id}')">✓</button>
                  <button class="btn btn-sm btn-danger" onclick="Pages.rechazarViatico('${v.id}')">✗</button>`:
                  v.estado==='aprobado'?`<button class="btn btn-sm btn-cyan" onclick="Pages.pagarViatico('${v.id}')">Pagar</button>`:''}
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Sin viáticos registrados</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

Pages.modalNuevoViatico = function () {
  const empleados = Pages._empleadosData || [];
  const cats = {
    alimentacion:'🍽️ Alimentación', transporte:'🚌 Transporte',
    hospedaje:'🏨 Hospedaje', combustible:'⛽ Combustible',
    peajes:'🛣️ Peajes', parqueo:'🅿️ Parqueo',
    comunicacion:'📱 Comunicación', otros:'📋 Otros'
  };

  UI.openModal('Nuevo Viático', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Empleado *</label>
        <select class="form-select" id="nv2-emp">
          <option value="">Seleccionar...</option>
          ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" id="nv2-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Concepto *</label>
      <input class="form-input" id="nv2-concepto" placeholder="Descripción del gasto">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="nv2-cat">
          ${Object.entries(cats).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Monto (Q) *</label>
        <input class="form-input" id="nv2-monto" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">No. Comprobante / Factura</label>
      <input class="form-input" id="nv2-comprobante" placeholder="FEL-2025-000123">
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-input form-textarea" id="nv2-notas" rows="2"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarViatico()">Guardar Viático</button>
    </div>`
  );
};

Pages.guardarViatico = async function () {
  const empId    = document.getElementById('nv2-emp').value;
  const concepto = document.getElementById('nv2-concepto').value.trim();
  const monto    = parseFloat(document.getElementById('nv2-monto').value) || 0;
  if (!empId)    { UI.toast('Selecciona un empleado', 'error'); return; }
  if (!concepto) { UI.toast('El concepto es obligatorio', 'error'); return; }
  if (monto <= 0){ UI.toast('El monto debe ser mayor a 0', 'error'); return; }

  const { error } = await DB.insertViatico({
    empleado_id:  empId,
    concepto,
    categoria:    document.getElementById('nv2-cat').value,
    monto,
    fecha:        document.getElementById('nv2-fecha').value,
    comprobante:  document.getElementById('nv2-comprobante').value.trim() || null,
    notas:        document.getElementById('nv2-notas').value.trim() || null,
    estado:       'pendiente'
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Viático registrado ✓');
  Pages.rrhh('viaticos');
};

Pages.aprobarViatico = async function (id) {
  await DB.updateViatico(id, { estado: 'aprobado' });
  UI.toast('Viático aprobado ✓');
  Pages.rrhh('viaticos');
};

Pages.rechazarViatico = async function (id) {
  await DB.updateViatico(id, { estado: 'rechazado' });
  UI.toast('Viático rechazado');
  Pages.rrhh('viaticos');
};

Pages.pagarViatico = async function (id) {
  await DB.updateViatico(id, { estado: 'pagado' });
  // Registrar egreso automático
  const viaticos = await DB.getViaticos();
  const v = viaticos.find(x => x.id === id);
  if (v) {
    const emp = (Pages._empleadosData||[]).find(e => e.id === v.empleado_id);
    await DB.insertEgreso({
      categoria:   'otros',
      concepto:    `Viático — ${emp?.nombre||'Empleado'}: ${v.concepto}`,
      monto:       v.monto,
      fecha:       v.fecha,
      metodo_pago: 'efectivo',
      notas:       `Categoría: ${v.categoria}`
    });
  }
  UI.toast('Viático pagado y egreso registrado ✓');
  Pages.rrhh('viaticos');
};

/* ══════════════════════════════════════════════════════
   ENTRENAMIENTOS
══════════════════════════════════════════════════════ */
Pages._renderEntrenamientos = async function (empleados) {
  const ent = await DB.getEntrenamientos();
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Entrenamiento</th><th>Fecha</th><th>Horas</th><th>Costo</th><th>Resultado</th><th></th></tr></thead>
        <tbody>
          ${ent.map(e => {
            const emp = e.empleados || empleados.find(x=>x.id===e.empleado_id);
            const resColor = {aprobado:'green',reprobado:'red',en_proceso:'cyan',cancelado:'gray'}[e.resultado]||'gray';
            return `<tr>
              <td>${emp?.nombre||'—'}</td>
              <td><b>${e.titulo}</b><br><span class="text-muted" style="font-size:11px">${e.instructor||''}</span></td>
              <td class="mono-sm">${e.fecha_inicio}</td>
              <td class="mono-sm">${e.horas||0}h</td>
              <td class="mono-sm">${UI.q(e.costo||0)}</td>
              <td>${e.resultado?`<span class="badge badge-${resColor}">${e.resultado}</span>`:'<span class="text-muted">—</span>'}</td>
              <td><button class="btn btn-sm btn-ghost" onclick="Pages.verEntrenamiento('${e.id}')">Ver</button></td>
            </tr>`;
          }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Sin entrenamientos</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

Pages.modalNuevoEntrenamiento = function () {
  const empleados = Pages._empleadosData || [];
  UI.openModal('Nuevo Entrenamiento', `
    <div class="form-group">
      <label class="form-label">Empleado *</label>
      <select class="form-select" id="ne4-emp">
        <option value="">Seleccionar...</option>
        ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Título del Entrenamiento *</label>
      <input class="form-input" id="ne4-titulo" placeholder="Nombre del curso o capacitación">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha Inicio</label>
        <input class="form-input" id="ne4-inicio" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha Fin</label>
        <input class="form-input" id="ne4-fin" type="date">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Horas</label>
        <input class="form-input" id="ne4-horas" type="number" min="0" placeholder="8">
      </div>
      <div class="form-group">
        <label class="form-label">Costo (Q)</label>
        <input class="form-input" id="ne4-costo" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Instructor / Institución</label>
        <input class="form-input" id="ne4-inst" placeholder="INTECAP, empresa externa...">
      </div>
      <div class="form-group">
        <label class="form-label">Resultado</label>
        <select class="form-select" id="ne4-res">
          <option value="en_proceso">En Proceso</option>
          <option value="aprobado">Aprobado</option>
          <option value="reprobado">Reprobado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción / Notas</label>
      <textarea class="form-input form-textarea" id="ne4-desc" rows="2"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarEntrenamiento()">Guardar</button>
    </div>`
  );
};

Pages.guardarEntrenamiento = async function () {
  const empId = document.getElementById('ne4-emp').value;
  const titulo= document.getElementById('ne4-titulo').value.trim();
  if (!empId || !titulo) { UI.toast('Empleado y título son obligatorios', 'error'); return; }

  const { error } = await DB.insertEntrenamiento({
    empleado_id:  empId,
    titulo,
    descripcion:  document.getElementById('ne4-desc').value.trim() || null,
    fecha_inicio: document.getElementById('ne4-inicio').value,
    fecha_fin:    document.getElementById('ne4-fin').value || null,
    horas:        parseFloat(document.getElementById('ne4-horas').value) || 0,
    costo:        parseFloat(document.getElementById('ne4-costo').value) || 0,
    instructor:   document.getElementById('ne4-inst').value.trim() || null,
    resultado:    document.getElementById('ne4-res').value
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Entrenamiento guardado ✓');
  Pages.rrhh('entrenamientos');
};

Pages.verEntrenamiento = async function (id) {
  const all = await DB.getEntrenamientos();
  const e   = all.find(x => x.id === id); if (!e) return;
  const emp = (Pages._empleadosData||[]).find(x => x.id === e.empleado_id);
  UI.openModal('Entrenamiento: ' + e.titulo, `
    <div class="detail-section">
      <div class="detail-section-header">Detalles</div>
      <div class="detail-row"><div class="detail-key">Empleado</div><div class="detail-val">${emp?.nombre||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Título</div><div class="detail-val">${e.titulo}</div></div>
      <div class="detail-row"><div class="detail-key">Instructor</div><div class="detail-val">${e.instructor||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Fechas</div><div class="detail-val mono-sm">${e.fecha_inicio} → ${e.fecha_fin||'En curso'}</div></div>
      <div class="detail-row"><div class="detail-key">Horas</div><div class="detail-val">${e.horas||0}h</div></div>
      <div class="detail-row"><div class="detail-key">Costo</div><div class="detail-val mono-sm">${UI.q(e.costo||0)}</div></div>
      <div class="detail-row"><div class="detail-key">Resultado</div><div class="detail-val">${e.resultado||'—'}</div></div>
      ${e.descripcion?`<div class="detail-row"><div class="detail-key">Notas</div><div class="detail-val">${e.descripcion}</div></div>`:''}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button></div>`
  );
};

/* ══════════════════════════════════════════════════════
   LLAMADAS DE ATENCIÓN
══════════════════════════════════════════════════════ */
Pages._renderDisciplina = async function (empleados) {
  const llamadas = await DB.getLlamadasAtencion();
  const tipos = {
    verbal:'Verbal', escrita_1:'1ra Escrita',
    escrita_2:'2da Escrita', suspension:'Suspensión', terminacion:'Terminación'
  };
  const tipColors = {
    verbal:'cyan', escrita_1:'amber', escrita_2:'red',
    suspension:'red', terminacion:'red'
  };

  return `
    <div class="alert alert-amber mb-4">
      <div class="alert-icon">⚠️</div>
      <div><div class="alert-title">Progresión disciplinaria — Guatemala</div>
      <div class="alert-body">Verbal → 1ra Escrita → 2da Escrita → Suspensión → Terminación justificada</div></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Firmado</th><th></th></tr></thead>
        <tbody>
          ${llamadas.map(l => {
            const emp = l.empleados || empleados.find(e=>e.id===l.empleado_id);
            return `<tr>
              <td>${emp?.nombre||'—'}</td>
              <td class="mono-sm">${l.fecha}</td>
              <td><span class="badge badge-${tipColors[l.tipo]||'gray'}">${tipos[l.tipo]||l.tipo}</span></td>
              <td style="font-size:12px">${l.motivo}</td>
              <td>${l.firmado?'<span class="badge badge-green">✓</span>':'<span class="badge badge-amber">Pendiente</span>'}</td>
              <td>
                <button class="btn btn-sm btn-ghost" onclick="Pages.verLlamada('${l.id}')">Ver</button>
                <button class="btn btn-sm btn-amber" onclick="Pages.imprimirLlamada('${l.id}')">🖨️</button>
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">Sin llamadas de atención</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

Pages.modalNuevaLlamada = function () {
  const empleados = Pages._empleadosData || [];
  UI.openModal('Nueva Llamada de Atención', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Empleado *</label>
        <select class="form-select" id="nl-emp">
          <option value="">Seleccionar...</option>
          ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" id="nl-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tipo *</label>
        <select class="form-select" id="nl-tipo">
          <option value="verbal">Verbal</option>
          <option value="escrita_1">1ra Llamada Escrita</option>
          <option value="escrita_2">2da Llamada Escrita</option>
          <option value="suspension">Suspensión</option>
          <option value="terminacion">Terminación</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Testigos</label>
        <input class="form-input" id="nl-testigos" placeholder="Nombres de testigos">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Motivo *</label>
      <input class="form-input" id="nl-motivo" placeholder="Motivo de la llamada de atención">
    </div>
    <div class="form-group">
      <label class="form-label">Descripción Detallada</label>
      <textarea class="form-input form-textarea" id="nl-desc" rows="3"
        placeholder="Descripción completa de la situación..."></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Acciones Correctivas</label>
      <textarea class="form-input form-textarea" id="nl-acciones" rows="2"
        placeholder="Compromisos y acciones a tomar..."></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">
        <input type="checkbox" id="nl-firmado" style="margin-right:8px">
        Documento firmado por el empleado
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarLlamada()">Guardar</button>
    </div>`
  );
};

Pages.guardarLlamada = async function () {
  const empId  = document.getElementById('nl-emp').value;
  const motivo = document.getElementById('nl-motivo').value.trim();
  if (!empId || !motivo) { UI.toast('Empleado y motivo son obligatorios', 'error'); return; }

  const { error } = await DB.insertLlamadaAtencion({
    empleado_id:  empId,
    fecha:        document.getElementById('nl-fecha').value,
    tipo:         document.getElementById('nl-tipo').value,
    motivo,
    descripcion:  document.getElementById('nl-desc').value.trim() || null,
    testigos:     document.getElementById('nl-testigos').value.trim() || null,
    acciones:     document.getElementById('nl-acciones').value.trim() || null,
    firmado:      document.getElementById('nl-firmado').checked
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Llamada de atención registrada ✓');
  Pages.rrhh('disciplina');
};

Pages.imprimirLlamada = async function (id) {
  const all  = await DB.getLlamadasAtencion();
  const l    = all.find(x => x.id === id); if (!l) return;
  const emp  = (Pages._empleadosData||[]).find(e => e.id === l.empleado_id);
  const tipos= {verbal:'Verbal',escrita_1:'Primera Llamada de Atención Escrita',escrita_2:'Segunda Llamada de Atención Escrita',suspension:'Suspensión Laboral',terminacion:'Aviso de Terminación de Contrato'};

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Llamada de Atención — ${emp?.nombre}</title>
  <style>
    body{font-family:'Times New Roman',serif;font-size:12pt;margin:2cm;line-height:1.6;color:#000}
    h1{font-size:14pt;text-align:center;text-transform:uppercase;font-weight:bold}
    .fecha{text-align:right;margin-bottom:24pt}
    .firma-grid{display:grid;grid-template-columns:1fr 1fr;gap:40pt;margin-top:60pt}
    .firma{border-top:1px solid #000;padding-top:6pt;text-align:center}
    @media print{body{margin:1.5cm}}
  </style></head><body>
  <div class="fecha">Guatemala, ${new Date(l.fecha+'T12:00:00').toLocaleDateString('es-GT',{day:'2-digit',month:'long',year:'numeric'})}</div>
  <h1>${tipos[l.tipo]||l.tipo}</h1>
  <p><b>Estimado(a) Sr./Sra. ${emp?.nombre||'—'},</b></p>
  <p>Por medio de la presente, y con fundamento en el Código de Trabajo de Guatemala (Decreto 1441), nos permitimos comunicarle que se ha incurrido en la siguiente falta:</p>
  <p><b>Motivo:</b> ${l.motivo}</p>
  ${l.descripcion?`<p><b>Descripción:</b> ${l.descripcion}</p>`:''}
  ${l.acciones?`<p><b>Acciones correctivas requeridas:</b> ${l.acciones}</p>`:''}
  <p>Le recordamos que el incumplimiento reiterado de las normas de la empresa puede dar lugar a sanciones más severas, incluyendo la terminación de la relación laboral por causa justificada, de conformidad con el Artículo 77 del Código de Trabajo.</p>
  <p>Esta notificación se extiende para los efectos legales correspondientes.</p>
  <div class="firma-grid">
    <div><div class="firma">Firma del Empleado<br><small>${emp?.nombre||'—'}</small></div></div>
    <div><div class="firma">Autorizado por<br><small>${Auth.user?.nombre||'Administración'} — ${Auth.tenant?.name}</small></div></div>
  </div>
  ${l.testigos?`<p style="margin-top:20pt"><small>Testigos: ${l.testigos}</small></p>`:''}
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
};

Pages.verLlamada = async function (id) {
  const all = await DB.getLlamadasAtencion();
  const l   = all.find(x => x.id === id); if (!l) return;
  const emp = (Pages._empleadosData||[]).find(e => e.id === l.empleado_id);
  UI.openModal('Llamada de Atención', `
    <div class="detail-section">
      <div class="detail-section-header">Detalles</div>
      <div class="detail-row"><div class="detail-key">Empleado</div><div class="detail-val">${emp?.nombre||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Fecha</div><div class="detail-val mono-sm">${l.fecha}</div></div>
      <div class="detail-row"><div class="detail-key">Tipo</div><div class="detail-val">${l.tipo}</div></div>
      <div class="detail-row"><div class="detail-key">Motivo</div><div class="detail-val">${l.motivo}</div></div>
      ${l.descripcion?`<div class="detail-row"><div class="detail-key">Descripción</div><div class="detail-val">${l.descripcion}</div></div>`:''}
      ${l.acciones?`<div class="detail-row"><div class="detail-key">Acciones</div><div class="detail-val">${l.acciones}</div></div>`:''}
      <div class="detail-row"><div class="detail-key">Firmado</div><div class="detail-val">${l.firmado?'✅ Sí':'❌ Pendiente'}</div></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-amber" onclick="Pages.imprimirLlamada('${id}')">🖨️ Imprimir</button>
    </div>`
  );
};

/* ══════════════════════════════════════════════════════
   LIQUIDACIONES — Ley de Guatemala
══════════════════════════════════════════════════════ */
Pages._renderLiquidaciones = async function (empleados) {
  const liq = await DB.getLiquidaciones();
  const tipos = {
    renuncia:'Renuncia', despido_causa_justificada:'Despido Justificado',
    despido_sin_causa:'Despido sin Causa', mutuo_acuerdo:'Mutuo Acuerdo', fallecimiento:'Fallecimiento'
  };

  return `
    <div class="alert alert-cyan mb-4">
      <div class="alert-icon">⚖️</div>
      <div><div class="alert-title">Prestaciones Laborales — Guatemala (Código de Trabajo)</div>
      <div class="alert-body">Incluye: Indemnización · Aguinaldo · Bono 14 · Vacaciones · Preaviso según aplique</div></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Fecha Terminación</th><th>Tipo</th><th>Total a Pagar</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${liq.map(l => {
            const emp = l.empleados || empleados.find(e=>e.id===l.empleado_id);
            const estColor = {borrador:'gray',firmada:'amber',pagada:'green'}[l.estado]||'gray';
            return `<tr>
              <td>${emp?.nombre||'—'}</td>
              <td class="mono-sm">${l.fecha_terminacion}</td>
              <td style="font-size:12px">${tipos[l.tipo_terminacion]||l.tipo_terminacion}</td>
              <td class="mono-sm text-amber">${UI.q(l.total_a_pagar)}</td>
              <td><span class="badge badge-${estColor}">${l.estado}</span></td>
              <td>
                <button class="btn btn-sm btn-ghost" onclick="Pages.verLiquidacion('${l.id}')">Ver</button>
                <button class="btn btn-sm btn-amber" onclick="Pages.imprimirFiniquito('${l.id}')">🖨️ Finiquito</button>
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">Sin liquidaciones</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

Pages.modalNuevaLiquidacion = function () {
  const empleados = Pages._empleadosData || [];
  UI.openModal('Nueva Liquidación de Empleado', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Empleado *</label>
        <select class="form-select" id="liq-emp" onchange="Pages._calcLiquidacion()">
          <option value="">Seleccionar...</option>
          ${empleados.map(e=>`<option value="${e.id}"
            data-salario="${e.salario_base||0}"
            data-ingreso="${e.fecha_ingreso||''}"
            data-bonif="${e.bonificacion||250}">${e.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de Terminación *</label>
        <input class="form-input" id="liq-fecha" type="date"
               value="${new Date().toISOString().slice(0,10)}"
               onchange="Pages._calcLiquidacion()">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Tipo de Terminación *</label>
      <select class="form-select" id="liq-tipo" onchange="Pages._calcLiquidacion()">
        <option value="renuncia">Renuncia voluntaria</option>
        <option value="despido_causa_justificada">Despido con causa justificada</option>
        <option value="despido_sin_causa">Despido sin causa justificada</option>
        <option value="mutuo_acuerdo">Mutuo acuerdo</option>
        <option value="fallecimiento">Fallecimiento</option>
      </select>
    </div>

    <!-- Preview cálculo automático -->
    <div class="card card-amber" id="liq-preview" style="margin-bottom:12px">
      <div class="card-sub mb-3">⚖️ Cálculo Prestaciones — Ley Guatemala</div>
      <div class="grid-2" style="gap:10px">
        <div class="detail-section">
          <div class="detail-section-header">Datos Base</div>
          <div class="detail-row"><div class="detail-key">Salario base</div><div class="detail-val mono-sm" id="liq-p-sal">Q0.00</div></div>
          <div class="detail-row"><div class="detail-key">Tiempo servido</div><div class="detail-val mono-sm" id="liq-p-tiempo">—</div></div>
          <div class="detail-row"><div class="detail-key">Días proporcionales</div><div class="detail-val mono-sm" id="liq-p-dias">0</div></div>
        </div>
        <div class="detail-section">
          <div class="detail-section-header">Prestaciones</div>
          <div class="detail-row"><div class="detail-key">Indemnización</div><div class="detail-val mono-sm text-amber" id="liq-p-indem">Q0.00</div></div>
          <div class="detail-row"><div class="detail-key">Aguinaldo prop.</div><div class="detail-val mono-sm" id="liq-p-agui">Q0.00</div></div>
          <div class="detail-row"><div class="detail-key">Bono 14 prop.</div><div class="detail-val mono-sm" id="liq-p-bono">Q0.00</div></div>
          <div class="detail-row"><div class="detail-key">Vacaciones (15 días)</div><div class="detail-val mono-sm" id="liq-p-vac">Q0.00</div></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-top:1px solid var(--border);margin-top:8px">
        <span style="font-weight:700">TOTAL A PAGAR</span>
        <span class="mono" style="font-size:20px;color:var(--amber);font-weight:700" id="liq-p-total">Q0.00</span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Motivo para la Carta</label>
      <textarea class="form-input form-textarea" id="liq-motivo" rows="3"
        placeholder="Descripción del motivo de terminación para la carta..."></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarLiquidacion()">Generar Liquidación</button>
    </div>`
  );
};

Pages._calcLiquidacion = function () {
  const sel    = document.getElementById('liq-emp');
  const opt    = sel?.options[sel.selectedIndex];
  const salario= parseFloat(opt?.dataset.salario||0);
  const ingreso= opt?.dataset.ingreso||'';
  const tipo   = document.getElementById('liq-tipo')?.value||'renuncia';
  const fechaT = document.getElementById('liq-fecha')?.value||new Date().toISOString().slice(0,10);

  if (!salario || !ingreso) return;

  // Calcular tiempo de servicio
  const inicio = new Date(ingreso+'T12:00:00');
  const fin    = new Date(fechaT+'T12:00:00');
  const msYear = 365.25 * 24 * 60 * 60 * 1000;
  const anios  = (fin - inicio) / msYear;
  const dias   = Math.floor((fin - inicio) / (24*60*60*1000));
  const diasAnio = Math.floor(dias % 365.25);

  // Salario diario
  const diario = salario / 30;

  // Indemnización: 1 mes por año — solo aplica en despido sin causa, mutuo acuerdo, fallecimiento
  const tieneIndem = ['despido_sin_causa','mutuo_acuerdo','fallecimiento'].includes(tipo);
  const indem = tieneIndem ? salario * Math.max(Math.floor(anios), 1) : 0;

  // Aguinaldo proporcional (diciembre)
  const mesActual = fin.getMonth() + 1;
  const mesesAgui = mesActual >= 12 ? 12 : mesActual;
  const agui = (salario / 12) * mesesAgui;

  // Bono 14 proporcional (julio)
  const mesesBono = mesActual >= 7 ? mesActual - 6 : mesActual;
  const bono = (salario / 12) * Math.min(mesesBono, 12);

  // Vacaciones proporcionales: 15 días por año
  const diasVac = 15 * anios;
  const vac = diario * diasVac;

  const total = indem + agui + bono + vac;

  // Actualizar preview
  const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  set('liq-p-sal',    UI.q(salario));
  set('liq-p-tiempo', `${Math.floor(anios)} años, ${diasAnio} días`);
  set('liq-p-dias',   dias + ' días totales');
  set('liq-p-indem',  UI.q(indem));
  set('liq-p-agui',   UI.q(agui));
  set('liq-p-bono',   UI.q(bono));
  set('liq-p-vac',    UI.q(vac));
  set('liq-p-total',  UI.q(total));

  // Guardar en estado
  Pages._liqCalc = { salario, indem, agui, bono, vac, total, anios, dias };
};

Pages.guardarLiquidacion = async function () {
  const empId = document.getElementById('liq-emp').value;
  const tipo  = document.getElementById('liq-tipo').value;
  const fecha = document.getElementById('liq-fecha').value;
  if (!empId || !fecha) { UI.toast('Selecciona empleado y fecha', 'error'); return; }

  const c = Pages._liqCalc || {};

  const { error } = await DB.insertLiquidacion({
    empleado_id:           empId,
    fecha_terminacion:     fecha,
    tipo_terminacion:      tipo,
    salario_base:          c.salario || 0,
    dias_trabajados_anio:  c.dias || 0,
    indemnizacion:         parseFloat((c.indem||0).toFixed(2)),
    aguinaldo_proporcional:parseFloat((c.agui||0).toFixed(2)),
    bono14_proporcional:   parseFloat((c.bono||0).toFixed(2)),
    vacaciones_pendientes: parseFloat((c.vac||0).toFixed(2)),
    total_a_pagar:         parseFloat((c.total||0).toFixed(2)),
    motivo_carta:          document.getElementById('liq-motivo').value.trim() || null,
    estado:                'borrador'
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Liquidación generada ✓');
  Pages.rrhh('liquidaciones');
};

Pages.imprimirFiniquito = async function (id) {
  const all = await DB.getLiquidaciones();
  const l   = all.find(x => x.id === id); if (!l) return;
  const emp = l.empleados || (Pages._empleadosData||[]).find(e => e.id === l.empleado_id);

  const tipos = {
    renuncia:'Renuncia Voluntaria', despido_causa_justificada:'Despido con Causa Justificada',
    despido_sin_causa:'Despido sin Causa Justificada',
    mutuo_acuerdo:'Mutuo Acuerdo', fallecimiento:'Fallecimiento'
  };

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Finiquito — ${emp?.nombre}</title>
  <style>
    body{font-family:'Times New Roman',serif;font-size:12pt;margin:2cm;line-height:1.7;color:#000}
    h1{font-size:14pt;text-align:center;text-transform:uppercase;margin-bottom:6pt}
    h2{font-size:12pt;text-align:center;margin-bottom:16pt}
    table{width:100%;border-collapse:collapse;margin:12pt 0}
    td{padding:5pt 8pt;border:1px solid #ddd}
    .total-row{font-weight:bold;background:#fffbeb}
    .firma-grid{display:grid;grid-template-columns:1fr 1fr;gap:40pt;margin-top:60pt}
    .firma{border-top:1px solid #000;padding-top:6pt;text-align:center;margin-top:60pt}
    @media print{body{margin:1.5cm}}
  </style></head><body>
  <h1>${Auth.tenant?.name}</h1>
  <h1>ACTA DE LIQUIDACIÓN Y FINIQUITO</h1>
  <h2>${tipos[l.tipo_terminacion]||l.tipo_terminacion}</h2>

  <p>En la Ciudad de Guatemala, el ${new Date(l.fecha_terminacion+'T12:00:00').toLocaleDateString('es-GT',{day:'2-digit',month:'long',year:'numeric'})},
  comparecen por una parte <b>${Auth.tenant?.name}</b> (en adelante "el Patrono"),
  y por la otra parte el trabajador <b>${emp?.nombre||'—'}</b> (en adelante "el Trabajador"),
  quienes convienen en suscribir el presente finiquito de conformidad con el
  <b>Código de Trabajo de Guatemala, Decreto 1441</b>.</p>

  <table>
    <tr><td><b>Nombre del Trabajador</b></td><td>${emp?.nombre||'—'}</td></tr>
    <tr><td><b>Cargo desempeñado</b></td><td>${emp?.cargo||'—'}</td></tr>
    <tr><td><b>Fecha de Ingreso</b></td><td>${emp?.fecha_ingreso||'—'}</td></tr>
    <tr><td><b>Fecha de Terminación</b></td><td>${l.fecha_terminacion}</td></tr>
    <tr><td><b>Tipo de Terminación</b></td><td>${tipos[l.tipo_terminacion]}</td></tr>
    <tr><td><b>Salario Base Mensual</b></td><td>Q${(l.salario_base||0).toFixed(2)}</td></tr>
  </table>

  <h2 style="font-size:12pt;margin-top:16pt">LIQUIDACIÓN DE PRESTACIONES</h2>
  <table>
    <tr><td><b>Concepto</b></td><td style="text-align:right"><b>Monto</b></td></tr>
    <tr><td>Indemnización (Art. 82 C.T.)</td><td style="text-align:right">Q${(l.indemnizacion||0).toFixed(2)}</td></tr>
    <tr><td>Aguinaldo Proporcional (Decreto 76-78)</td><td style="text-align:right">Q${(l.aguinaldo_proporcional||0).toFixed(2)}</td></tr>
    <tr><td>Bono 14 Proporcional (Decreto 42-92)</td><td style="text-align:right">Q${(l.bono14_proporcional||0).toFixed(2)}</td></tr>
    <tr><td>Vacaciones Pendientes (Art. 130 C.T. — 15 días/año)</td><td style="text-align:right">Q${(l.vacaciones_pendientes||0).toFixed(2)}</td></tr>
    <tr><td>Salario Pendiente</td><td style="text-align:right">Q${(l.salario_pendiente||0).toFixed(2)}</td></tr>
    <tr><td>Menos: Préstamo de empresa</td><td style="text-align:right">-Q${(l.prestamo_empresa||0).toFixed(2)}</td></tr>
    <tr><td>Menos: Otros descuentos</td><td style="text-align:right">-Q${(l.otros_descuentos||0).toFixed(2)}</td></tr>
    <tr class="total-row"><td><b>TOTAL A PAGAR</b></td><td style="text-align:right"><b>Q${(l.total_a_pagar||0).toFixed(2)}</b></td></tr>
  </table>

  ${l.motivo_carta?`<p><b>Motivo:</b> ${l.motivo_carta}</p>`:''}

  <p>El Trabajador declara recibir la cantidad de <b>Q${(l.total_a_pagar||0).toFixed(2)}</b>
  en concepto de liquidación total y definitiva de todas las prestaciones laborales a que tiene derecho,
  otorgando el más amplio finiquito al Patrono.</p>

  <div class="firma-grid">
    <div><div class="firma">Firma del Trabajador<br><small>${emp?.nombre||'—'}</small><br><small>DPI: ________________</small></div></div>
    <div><div class="firma">Firma del Patrono / Representante<br><small>${Auth.user?.nombre||'Administración'}</small><br><small>${Auth.tenant?.name}</small></div></div>
  </div>

  <p style="margin-top:20pt;font-size:10pt;color:#666;text-align:center">
    Generado por TallerPro Enterprise · ${new Date().toLocaleDateString('es-GT')}
  </p>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
};

Pages.verLiquidacion = async function (id) {
  const all = await DB.getLiquidaciones();
  const l   = all.find(x => x.id === id); if (!l) return;
  const emp = l.empleados || (Pages._empleadosData||[]).find(e => e.id === l.empleado_id);

  UI.openModal('Liquidación: ' + (emp?.nombre||'—'), `
    <div class="detail-section mb-4">
      <div class="detail-section-header">Resumen</div>
      <div class="detail-row"><div class="detail-key">Empleado</div><div class="detail-val">${emp?.nombre||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Terminación</div><div class="detail-val mono-sm">${l.fecha_terminacion}</div></div>
      <div class="detail-row"><div class="detail-key">Tipo</div><div class="detail-val">${l.tipo_terminacion}</div></div>
      <div class="detail-row"><div class="detail-key">Indemnización</div><div class="detail-val mono-sm">${UI.q(l.indemnizacion||0)}</div></div>
      <div class="detail-row"><div class="detail-key">Aguinaldo</div><div class="detail-val mono-sm">${UI.q(l.aguinaldo_proporcional||0)}</div></div>
      <div class="detail-row"><div class="detail-key">Bono 14</div><div class="detail-val mono-sm">${UI.q(l.bono14_proporcional||0)}</div></div>
      <div class="detail-row"><div class="detail-key">Vacaciones</div><div class="detail-val mono-sm">${UI.q(l.vacaciones_pendientes||0)}</div></div>
      <div class="detail-row"><div class="detail-key">TOTAL</div><div class="detail-val mono-sm text-amber" style="font-weight:700;font-size:15px">${UI.q(l.total_a_pagar||0)}</div></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-amber" onclick="Pages.imprimirFiniquito('${id}')">🖨️ Imprimir Finiquito</button>
    </div>`
  );
};

/* Reutilizar funciones de la versión anterior */
Pages.verEmpleado = function (id) {
  const emp = (Pages._empleadosData||[]).find(e => e.id === id); if (!emp) return;
  const igssLab  = ((emp.salario_base||0)*0.0483).toFixed(2);
  const igssPatr = ((emp.salario_base||0)*0.1267).toFixed(2);
  const bonif    = emp.bonificacion||250;
  const liquido  = ((emp.salario_base||0)+bonif-parseFloat(igssLab)).toFixed(2);

  UI.openModal('Empleado: '+emp.nombre, `
    <div class="grid-2 mb-4">
      <div class="detail-section">
        <div class="detail-section-header">Datos Personales</div>
        <div class="detail-row"><div class="detail-key">Nombre</div><div class="detail-val">${emp.nombre}</div></div>
        <div class="detail-row"><div class="detail-key">Cargo</div><div class="detail-val">${emp.cargo||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Rol</div><div class="detail-val">${ROLES[emp.rol]?.label||emp.rol}</div></div>
        <div class="detail-row"><div class="detail-key">Fecha Ingreso</div><div class="detail-val mono-sm">${emp.fecha_ingreso||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">IGSS</div><div class="detail-val">${emp.igss?'✅':'❌'}</div></div>
      </div>
      <div class="detail-section">
        <div class="detail-section-header">Cálculo Salarial</div>
        <div class="detail-row"><div class="detail-key">Salario Base</div><div class="detail-val mono-sm text-amber">${UI.q(emp.salario_base||0)}</div></div>
        <div class="detail-row"><div class="detail-key">Bonificación</div><div class="detail-val mono-sm text-green">+${UI.q(bonif)}</div></div>
        <div class="detail-row"><div class="detail-key">IGSS Lab. (4.83%)</div><div class="detail-val mono-sm text-red">-${UI.q(igssLab)}</div></div>
        <div class="detail-row"><div class="detail-key">Líquido</div><div class="detail-val mono-sm" style="font-weight:700;color:var(--green)">${UI.q(liquido)}</div></div>
        <div class="detail-row"><div class="detail-key">IGSS Patronal</div><div class="detail-val mono-sm text-muted">${UI.q(igssPatr)}</div></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-ghost" onclick="Pages.rrhh('liquidaciones')">📄 Liquidar</button>
      <button class="btn btn-amber" onclick="Pages.imprimirBoleta('${emp.id}')">🖨️ Boleta de Pago</button>
    </div>`
  );
};

Pages.modalNuevoEmpleado = function () {
  UI.openModal('Nuevo Empleado', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="ne-nombre"></div>
      <div class="form-group"><label class="form-label">Rol *</label>
        <select class="form-select" id="ne-rol">
          ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cargo</label><input class="form-input" id="ne-cargo"></div>
      <div class="form-group"><label class="form-label">NIT</label><input class="form-input" id="ne-nit"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Salario Base (Q) *</label>
        <input class="form-input" id="ne-salario" type="number" min="0" oninput="Pages.calcularLiquido()"></div>
      <div class="form-group"><label class="form-label">Bonificación (Q)</label>
        <input class="form-input" id="ne-bonif" type="number" value="250" oninput="Pages.calcularLiquido()"></div>
    </div>
    <div id="preview-nomina" class="card" style="padding:12px;margin-bottom:4px">
      <div class="grid-2" style="gap:8px">
        <div><div class="text-muted" style="font-size:11px">IGSS Laboral</div><div class="mono-sm text-red" id="prev-igss">Q0.00</div></div>
        <div><div class="text-muted" style="font-size:11px">Líquido</div><div class="mono-sm text-green" id="prev-liquido">Q0.00</div></div>
        <div><div class="text-muted" style="font-size:11px">IGSS Patronal</div><div class="mono-sm" id="prev-patron">Q0.00</div></div>
        <div><div class="text-muted" style="font-size:11px">Costo total</div><div class="mono-sm text-amber" id="prev-total">Q0.00</div></div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Fecha de Ingreso</label>
        <input class="form-input" id="ne-ingreso" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="form-group"><label class="form-label">Avatar (emoji)</label>
        <input class="form-input" id="ne-avatar" value="👤" maxlength="2"></div>
    </div>
    <div class="form-group">
      <label class="form-label"><input type="checkbox" id="ne-igss" checked style="margin-right:8px"> Afiliado IGSS</label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarEmpleado()">Guardar</button>
    </div>`
  );
};

Pages.calcularLiquido = function () {
  const sal   = parseFloat(document.getElementById('ne-salario')?.value||document.getElementById('ee-salario')?.value||0);
  const bonif = parseFloat(document.getElementById('ne-bonif')?.value||document.getElementById('ee-bonif')?.value||250);
  const igssL = sal*0.0483, igssP = sal*0.1267;
  const liq   = sal+bonif-igssL;
  const set = (id,val) => { const el=document.getElementById(id); if(el) el.textContent=UI.q(val); };
  set('prev-igss', igssL); set('prev-liquido', liq);
  set('prev-patron', igssP); set('prev-total', sal+bonif+igssP);
};

Pages.guardarEmpleado = async function () {
  const nombre  = document.getElementById('ne-nombre').value.trim();
  const rol     = document.getElementById('ne-rol').value;
  const salario = parseFloat(document.getElementById('ne-salario').value)||0;
  if (!nombre||!rol) { UI.toast('Nombre y rol son obligatorios','error'); return; }
  if (salario<=0)    { UI.toast('El salario debe ser mayor a 0','error'); return; }
  const {error} = await DB.insertEmpleado({
    nombre, rol,
    cargo:         document.getElementById('ne-cargo').value.trim()||null,
    nit:           document.getElementById('ne-nit').value.trim()||null,
    salario_base:  salario,
    bonificacion:  parseFloat(document.getElementById('ne-bonif').value)||250,
    fecha_ingreso: document.getElementById('ne-ingreso').value||null,
    avatar:        document.getElementById('ne-avatar').value.trim()||'👤',
    igss:          document.getElementById('ne-igss').checked
  });
  if (error) { UI.toast('Error: '+error.message,'error'); return; }
  UI.closeModal(); UI.toast('Empleado agregado ✓'); Pages.rrhh('empleados');
};

Pages.modalEditarEmpleado = async function (id) {
  const emp = (Pages._empleadosData||await DB.getEmpleados()).find(e=>e.id===id); if(!emp) return;
  UI.openModal('Editar: '+emp.nombre, `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="ee-nombre" value="${emp.nombre}"></div>
      <div class="form-group"><label class="form-label">Rol</label>
        <select class="form-select" id="ee-rol">
          ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${emp.rol===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cargo</label><input class="form-input" id="ee-cargo" value="${emp.cargo||''}"></div>
      <div class="form-group"><label class="form-label">NIT</label><input class="form-input" id="ee-nit" value="${emp.nit||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Salario Base (Q)</label>
        <input class="form-input" id="ee-salario" type="number" value="${emp.salario_base||0}" oninput="Pages.calcularLiquido()"></div>
      <div class="form-group"><label class="form-label">Bonificación</label>
        <input class="form-input" id="ee-bonif" type="number" value="${emp.bonificacion||250}" oninput="Pages.calcularLiquido()"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Fecha Ingreso</label><input class="form-input" id="ee-ingreso" type="date" value="${emp.fecha_ingreso||''}"></div>
      <div class="form-group"><label class="form-label">Avatar</label><input class="form-input" id="ee-avatar" value="${emp.avatar||'👤'}" maxlength="2"></div>
    </div>
    <div class="form-group"><label class="form-label"><input type="checkbox" id="ee-igss" ${emp.igss?'checked':''} style="margin-right:8px"> Afiliado IGSS</label></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarEmpleado('${id}')">Guardar</button>
    </div>`
  );
};

Pages.actualizarEmpleado = async function (id) {
  const nombre = document.getElementById('ee-nombre').value.trim();
  if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
  const ok = await DB.updateEmpleado(id, {
    nombre, rol: document.getElementById('ee-rol').value,
    cargo:        document.getElementById('ee-cargo').value.trim()||null,
    nit:          document.getElementById('ee-nit').value.trim()||null,
    salario_base: parseFloat(document.getElementById('ee-salario').value)||0,
    bonificacion: parseFloat(document.getElementById('ee-bonif').value)||250,
    fecha_ingreso:document.getElementById('ee-ingreso').value||null,
    avatar:       document.getElementById('ee-avatar').value.trim()||'👤',
    igss:         document.getElementById('ee-igss').checked
  });
  if (!ok) { UI.toast('Error al actualizar','error'); return; }
  UI.closeModal(); UI.toast('Empleado actualizado ✓'); Pages.rrhh('empleados');
};

Pages.imprimirBoleta = function (id) {
  const emp = (Pages._empleadosData||[]).find(e=>e.id===id); if(!emp) return;
  const mes = new Date().toLocaleDateString('es-GT',{month:'long',year:'numeric'});
  const igssLab  = ((emp.salario_base||0)*0.0483).toFixed(2);
  const igssPatr = ((emp.salario_base||0)*0.1267).toFixed(2);
  const bonif    = emp.bonificacion||250;
  const liquido  = ((emp.salario_base||0)+bonif-parseFloat(igssLab)).toFixed(2);
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Boleta ${emp.nombre}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}table{width:100%;border-collapse:collapse;margin:12px 0}
  th{background:#f3f4f6;padding:7px;text-align:left;border:1px solid #ddd}td{padding:7px;border:1px solid #ddd}
  .total{font-weight:bold;background:#fef3c7}.header{border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:16px;display:flex;justify-content:space-between}
  .firma{border-top:1px solid #000;padding-top:6px;text-align:center;margin-top:50px}@media print{body{margin:0}}</style></head>
  <body><div class="header"><div><b>${Auth.tenant?.name}</b><br>${Auth.tenant?.address||''}</div>
  <div style="text-align:right">Boleta de Pago<br>${mes.toUpperCase()}</div></div>
  <table><tr><td><b>Empleado</b></td><td>${emp.nombre}</td><td><b>Cargo</b></td><td>${emp.cargo||'—'}</td></tr>
  <tr><td><b>NIT</b></td><td>${emp.nit||'—'}</td><td><b>Ingreso</b></td><td>${emp.fecha_ingreso||'—'}</td></tr></table>
  <table><thead><tr><th colspan="2">Ingresos</th></tr></thead>
  <tr><td>Salario Base</td><td>Q${(emp.salario_base||0).toFixed(2)}</td></tr>
  <tr><td>Bonificación Incentivo (MINTRAB)</td><td>Q${bonif.toFixed(2)}</td></tr>
  <thead><tr><th colspan="2">Descuentos</th></tr></thead>
  <tr><td>IGSS Laboral (4.83%)</td><td>-Q${igssLab}</td></tr>
  <tr class="total"><td><b>LÍQUIDO A RECIBIR</b></td><td><b>Q${liquido}</b></td></tr>
  <thead><tr><th colspan="2">Aporte Patronal</th></tr></thead>
  <tr><td>IGSS Patronal (12.67%)</td><td>Q${igssPatr}</td></tr></table>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px">
    <div><div class="firma">Firma del Empleado<br>${emp.nombre}</div></div>
    <div><div class="firma">Autorizado<br>${Auth.user?.nombre||'Admin'}</div></div>
  </div></body></html>`;
  const win = window.open('','_blank'); win.document.write(html); win.document.close();
  setTimeout(()=>win.print(),400);
};

Pages.calcularNomina = async function () {
  const empleados = Pages._empleadosData||await DB.getEmpleados();
  if (!empleados.length) { UI.toast('Sin empleados','warn'); return; }
  const mes = new Date().toLocaleDateString('es-GT',{month:'long',year:'numeric'});
  let totSal=0,totIgssL=0,totIgssP=0,totLiq=0;
  const filas = empleados.map(e=>{
    const sal=e.salario_base||0,bonif=e.bonificacion||250;
    const igssL=sal*0.0483,igssP=sal*0.1267,liq=sal+bonif-igssL;
    totSal+=sal;totIgssL+=igssL;totIgssP+=igssP;totLiq+=liq;
    return `<tr><td>${e.nombre}</td><td>${e.cargo||'—'}</td><td class="mono-sm">${UI.q(sal)}</td>
      <td class="mono-sm">${UI.q(bonif)}</td><td class="mono-sm text-red">-${UI.q(igssL)}</td>
      <td class="mono-sm text-green">${UI.q(liq)}</td><td class="mono-sm text-muted">${UI.q(igssP)}</td></tr>`;
  }).join('');
  UI.openModal(`Nómina — ${mes}`, `
    <div class="table-wrap mb-4" style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Cargo</th><th>Salario</th><th>Bonif.</th><th>IGSS Lab.</th><th>Líquido</th><th>IGSS Patr.</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr style="background:var(--surface2);font-weight:700">
          <td colspan="2">TOTALES</td>
          <td class="mono-sm">${UI.q(totSal)}</td><td></td>
          <td class="mono-sm text-red">-${UI.q(totIgssL)}</td>
          <td class="mono-sm text-green">${UI.q(totLiq)}</td>
          <td class="mono-sm text-muted">${UI.q(totIgssP)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-amber" onclick="window.print()">🖨️ Imprimir</button>
    </div>`, 'modal-lg');
};
