/* ═══════════════════════════════════════════════════════
   modules/rrhh.js — RRHH & Nómina Completo
   TallerPro Enterprise v2.0
   - Empleados: CRUD + nómina
   - Viáticos: CRUD + filtro + imprimir + auto-egreso
   - Entrenamientos: CRUD + filtro + imprimir
   - Disciplina: CRUD + filtro + imprimir carta
   - Liquidaciones: CRUD + finiquito imprimible
═══════════════════════════════════════════════════════ */

let _rrhhTab = 'empleados';

Pages.rrhh = async function (tab = 'empleados') {
  _rrhhTab = tab;
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">RRHH & Nómina</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const empleados = await DB.getEmpleados();
  Pages._empleadosData = empleados;

  const TABS = [
    { id:'empleados',      icon:'👥', label:'Empleados'      },
    { id:'viaticos',       icon:'🚗', label:'Viáticos'       },
    { id:'entrenamientos', icon:'📚', label:'Entrenamientos' },
    { id:'disciplina',     icon:'⚠️', label:'Disciplina'     },
    { id:'liquidaciones',  icon:'📄', label:'Liquidaciones'  }
  ];

  const acciones = {
    empleados:      `<button class="btn btn-ghost" onclick="Pages.calcularNomina()">🧾 Nómina</button>
                     <button class="btn btn-amber" onclick="Pages.modalNuevoEmpleado()">＋ Empleado</button>`,
    viaticos:       `<button class="btn btn-ghost" onclick="Pages.imprimirViaticos()">🖨️ Imprimir</button>
                     <button class="btn btn-amber" onclick="Pages.modalNuevoViatico()">＋ Viático</button>`,
    entrenamientos: `<button class="btn btn-ghost" onclick="Pages.imprimirEntrenamientos()">🖨️ Imprimir</button>
                     <button class="btn btn-amber" onclick="Pages.modalNuevoEntrenamiento()">＋ Entrenamiento</button>`,
    disciplina:     `<button class="btn btn-ghost" onclick="Pages.imprimirDisciplina()">🖨️ Imprimir</button>
                     <button class="btn btn-amber" onclick="Pages.modalNuevaLlamada()">＋ Llamada de Atención</button>`,
    liquidaciones:  `<button class="btn btn-amber" onclick="Pages.modalNuevaLiquidacion()">＋ Liquidación</button>`
  };

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">RRHH & Nómina</h1>
        <p class="page-subtitle">// ${empleados.length} EMPLEADOS · Ley Guatemala</p>
      </div>
      <div class="page-actions">${acciones[tab] || ''}</div>
    </div>
    <div class="page-body">
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);overflow-x:auto">
        ${TABS.map(t => `
        <button onclick="Pages.rrhh('${t.id}')"
          style="padding:10px 14px;border:none;background:none;cursor:pointer;font-family:'Manrope',sans-serif;
                 font-size:13px;font-weight:600;white-space:nowrap;
                 border-bottom:2px solid ${_rrhhTab===t.id?'var(--amber)':'transparent'};
                 color:${_rrhhTab===t.id?'var(--amber)':'var(--text2)'}">${t.icon} ${t.label}
        </button>`).join('')}
      </div>
      <div id="rrhh-content"></div>
    </div>`;

  await Pages._renderRRHHTab(tab, empleados);
};

Pages._renderRRHHTab = async function (tab, empleados) {
  const el = document.getElementById('rrhh-content');
  if (!el) return;
  switch (tab) {
    case 'empleados':      el.innerHTML = Pages._renderEmpleados(empleados); break;
    case 'viaticos':       el.innerHTML = await Pages._buildViaticos(empleados); break;
    case 'entrenamientos': el.innerHTML = await Pages._buildEntrenamientos(empleados); break;
    case 'disciplina':     el.innerHTML = await Pages._buildDisciplina(empleados); break;
    case 'liquidaciones':  el.innerHTML = await Pages._buildLiquidaciones(empleados); break;
  }
};

/* ══════════════════════════════════════════════════════
   EMPLEADOS
══════════════════════════════════════════════════════ */
Pages._renderEmpleados = function (empleados) {
  const total = empleados.reduce((s,e) => s+(e.salario_base||0), 0);
  return `
    <div class="kpi-grid">
      <div class="kpi-card amber"><div class="kpi-label">Planilla Mensual</div><div class="kpi-val amber">${UI.q(total)}</div></div>
      <div class="kpi-card cyan"><div class="kpi-label">Empleados</div><div class="kpi-val cyan">${empleados.length}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Con IGSS</div><div class="kpi-val green">${empleados.filter(e=>e.igss).length}</div></div>
      <div class="kpi-card"><div class="kpi-label">IGSS Patronal (12.67%)</div><div class="kpi-val">${UI.q(total*0.1267)}</div></div>
    </div>
    <div class="search-bar">
      <input class="search-input" placeholder="🔍 Buscar empleado, cargo..." id="search-emp" oninput="Pages.filterEmpleados()">
      <select class="filter-select" id="filter-emp-rol" onchange="Pages.filterEmpleados()">
        <option value="">Todos los roles</option>
        ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}
      </select>
    </div>
    ${empleados.length === 0
      ? `<div class="card" style="text-align:center;padding:48px">
           <div style="font-size:40px;margin-bottom:16px">👤</div>
           <div class="text-muted mb-4">Sin empleados registrados.</div>
           <button class="btn btn-amber" onclick="Pages.modalNuevoEmpleado()">＋ Agregar Primero</button>
         </div>`
      : `<div style="display:flex;flex-direction:column;gap:10px" id="emp-lista">
          ${empleados.map(e => Pages._empCard(e)).join('')}
         </div>`}`;
};

Pages._empCard = function (e) {
  const igssLab = ((e.salario_base||0)*0.0483).toFixed(2);
  const liquido = ((e.salario_base||0)+(e.bonificacion||250)-parseFloat(igssLab)).toFixed(2);
  return `
    <div class="emp-card" data-rol="${e.rol}" data-text="${e.nombre} ${e.cargo||''} ${e.rol}">
      <div class="emp-avatar">${e.avatar||'👤'}</div>
      <div style="flex:1">
        <div class="emp-name">${e.nombre}</div>
        <div class="emp-role">${e.cargo||'—'} · <span class="badge badge-${ROLES[e.rol]?.color||'gray'}" style="font-size:8px">${ROLES[e.rol]?.label||e.rol}</span></div>
      </div>
      <div class="emp-stats">
        <div><div class="emp-stat-val">${UI.q(e.salario_base||0)}</div><div class="emp-stat-lbl">Salario</div></div>
        <div><div class="emp-stat-val">${UI.q(liquido)}</div><div class="emp-stat-lbl">Líquido</div></div>
      </div>
      <div style="display:flex;gap:5px;margin-left:10px;flex-wrap:wrap">
        <button class="btn btn-sm btn-ghost"  onclick="Pages.verEmpleado('${e.id}')">Ver</button>
        <button class="btn btn-sm btn-cyan"   onclick="Pages.modalEditarEmpleado('${e.id}')">✏️</button>
        <button class="btn btn-sm btn-amber"  onclick="Pages.imprimirBoleta('${e.id}')">🖨️</button>
        <button class="btn btn-sm btn-danger" onclick="Pages.desactivarEmpleado('${e.id}','${e.nombre.replace(/'/g,'')}')">🗑</button>
      </div>
    </div>`;
};

Pages.filterEmpleados = function () {
  const q   = (document.getElementById('search-emp')?.value||'').toLowerCase();
  const rol = document.getElementById('filter-emp-rol')?.value||'';
  document.querySelectorAll('#emp-lista .emp-card').forEach(r => {
    const match = (!q||(r.dataset.text||'').toLowerCase().includes(q)) && (!rol||r.dataset.rol===rol);
    r.style.display = match?'':'none';
  });
};

Pages.desactivarEmpleado = function (id, nombre) {
  UI.confirm(`¿Desactivar a <b>${nombre}</b>? No aparecerá en las listas.`, async () => {
    await DB.updateEmpleado(id, { activo: false });
    UI.closeModal(); UI.toast('Empleado desactivado'); Pages.rrhh('empleados');
  });
};

/* ══════════════════════════════════════════════════════
   VIÁTICOS
══════════════════════════════════════════════════════ */
Pages._buildViaticos = async function (empleados) {
  const viaticos = await DB.getViaticos();
  Pages._viaticosData = viaticos;
  const total     = viaticos.reduce((s,v)=>s+v.monto,0);
  const pendientes= viaticos.filter(v=>v.estado==='pendiente').length;

  const CATS = {
    alimentacion:'🍽️ Alimentación',transporte:'🚌 Transporte',
    hospedaje:'🏨 Hospedaje',combustible:'⛽ Combustible',
    peajes:'🛣️ Peajes',parqueo:'🅿️ Parqueo',
    comunicacion:'📱 Comunicación',otros:'📋 Otros'
  };

  const rows = viaticos.map(v => {
    const emp = v.empleados||empleados.find(e=>e.id===v.empleado_id);
    const estColor={pendiente:'amber',aprobado:'green',rechazado:'red',pagado:'cyan'}[v.estado]||'gray';
    return `<tr data-text="${emp?.nombre||''} ${v.concepto} ${v.categoria}" data-estado="${v.estado}" data-emp="${v.empleado_id}">
      <td>${emp?.nombre||'—'}</td>
      <td class="mono-sm">${v.fecha}</td>
      <td>${v.concepto}</td>
      <td><span class="badge badge-gray">${CATS[v.categoria]||v.categoria}</span></td>
      <td class="mono-sm">${v.comprobante||'—'}</td>
      <td class="mono-sm text-amber">${UI.q(v.monto)}</td>
      <td><span class="badge badge-${estColor}">${v.estado}</span></td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          ${v.estado==='pendiente'?`
            <button class="btn btn-sm btn-success" onclick="Pages.aprobarViatico('${v.id}')">✓ Aprobar</button>
            <button class="btn btn-sm btn-danger"  onclick="Pages.rechazarViatico('${v.id}')">✗</button>`:
          v.estado==='aprobado'?`
            <button class="btn btn-sm btn-cyan" onclick="Pages.pagarViatico('${v.id}')">Pagar</button>`:''}
          <button class="btn btn-sm btn-ghost" onclick="Pages.modalEditarViatico('${v.id}')">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="Pages.eliminarViatico('${v.id}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi-card amber"><div class="kpi-label">Total Viáticos</div><div class="kpi-val amber">${UI.q(total)}</div></div>
      <div class="kpi-card cyan"><div class="kpi-label">Pendientes</div><div class="kpi-val cyan">${pendientes}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Pagados</div><div class="kpi-val green">${viaticos.filter(v=>v.estado==='pagado').length}</div></div>
    </div>
    <div class="search-bar">
      <input class="search-input" placeholder="🔍 Buscar empleado, concepto..." id="search-viat" oninput="Pages.filterViaticos()">
      <select class="filter-select" id="filter-viat-emp" onchange="Pages.filterViaticos()">
        <option value="">Todos los empleados</option>
        ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-viat-est" onchange="Pages.filterViaticos()">
        <option value="">Todos los estados</option>
        <option value="pendiente">Pendiente</option>
        <option value="aprobado">Aprobado</option>
        <option value="pagado">Pagado</option>
        <option value="rechazado">Rechazado</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Comprobante</th><th>Monto</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody id="viat-tbody">
          ${rows||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">Sin viáticos registrados</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

Pages.filterViaticos = function () {
  const q   = (document.getElementById('search-viat')?.value||'').toLowerCase();
  const emp = document.getElementById('filter-viat-emp')?.value||'';
  const est = document.getElementById('filter-viat-est')?.value||'';
  document.querySelectorAll('#viat-tbody tr').forEach(r => {
    const match = (!q||(r.dataset.text||'').toLowerCase().includes(q)) &&
                  (!emp||r.dataset.emp===emp) && (!est||r.dataset.estado===est);
    r.style.display = match?'':'none';
  });
};

Pages.modalNuevoViatico = function () {
  const empleados = Pages._empleadosData||[];
  const CATS = {alimentacion:'🍽️ Alimentación',transporte:'🚌 Transporte',hospedaje:'🏨 Hospedaje',
    combustible:'⛽ Combustible',peajes:'🛣️ Peajes',parqueo:'🅿️ Parqueo',comunicacion:'📱 Comunicación',otros:'📋 Otros'};

  UI.openModal('Nuevo Viático', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Empleado *</label>
        <select class="form-select" id="nv2-emp">
          <option value="">Seleccionar...</option>
          ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Fecha</label>
        <input class="form-input" id="nv2-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Concepto *</label>
      <input class="form-input" id="nv2-concepto" placeholder="Descripción del gasto">
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Categoría</label>
        <select class="form-select" id="nv2-cat">
          ${Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Monto (Q) *</label>
        <input class="form-input" id="nv2-monto" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
    </div>
    <div class="form-group"><label class="form-label">No. Comprobante / Factura</label>
      <input class="form-input" id="nv2-comprobante" placeholder="FEL-2025-000123">
    </div>
    <div class="form-group"><label class="form-label">Notas</label>
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
  const monto    = parseFloat(document.getElementById('nv2-monto').value)||0;
  if (!empId)    { UI.toast('Selecciona un empleado','error'); return; }
  if (!concepto) { UI.toast('El concepto es obligatorio','error'); return; }
  if (monto<=0)  { UI.toast('El monto debe ser mayor a 0','error'); return; }

  const { error } = await DB.insertViatico({
    empleado_id:  empId,
    concepto,
    categoria:    document.getElementById('nv2-cat').value,
    monto,
    fecha:        document.getElementById('nv2-fecha').value,
    comprobante:  document.getElementById('nv2-comprobante').value.trim()||null,
    notas:        document.getElementById('nv2-notas').value.trim()||null,
    estado:       'pendiente'
  });
  if (error) { UI.toast('Error: '+error.message,'error'); return; }
  UI.closeModal();
  UI.toast('Viático registrado ✓');
  Pages.rrhh('viaticos');
};

Pages.modalEditarViatico = function (id) {
  const v = (Pages._viaticosData||[]).find(x=>x.id===id); if(!v) return;
  const CATS = {alimentacion:'🍽️ Alimentación',transporte:'🚌 Transporte',hospedaje:'🏨 Hospedaje',
    combustible:'⛽ Combustible',peajes:'🛣️ Peajes',parqueo:'🅿️ Parqueo',comunicacion:'📱 Comunicación',otros:'📋 Otros'};

  UI.openModal('Editar Viático', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Concepto *</label>
        <input class="form-input" id="ev2-concepto" value="${v.concepto}">
      </div>
      <div class="form-group"><label class="form-label">Fecha</label>
        <input class="form-input" id="ev2-fecha" type="date" value="${v.fecha}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Categoría</label>
        <select class="form-select" id="ev2-cat">
          ${Object.entries(CATS).map(([k,lbl])=>`<option value="${k}" ${v.categoria===k?'selected':''}>${lbl}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Monto (Q)</label>
        <input class="form-input" id="ev2-monto" type="number" step="0.01" value="${v.monto}">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Comprobante</label>
      <input class="form-input" id="ev2-comp" value="${v.comprobante||''}">
    </div>
    <div class="form-group"><label class="form-label">Estado</label>
      <select class="form-select" id="ev2-est">
        ${['pendiente','aprobado','rechazado','pagado'].map(s=>`<option value="${s}" ${v.estado===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarViatico('${id}')">Guardar Cambios</button>
    </div>`
  );
};

Pages.actualizarViatico = async function (id) {
  const ok = await DB.updateViatico(id, {
    concepto:    document.getElementById('ev2-concepto').value.trim(),
    fecha:       document.getElementById('ev2-fecha').value,
    categoria:   document.getElementById('ev2-cat').value,
    monto:       parseFloat(document.getElementById('ev2-monto').value)||0,
    comprobante: document.getElementById('ev2-comp').value.trim()||null,
    estado:      document.getElementById('ev2-est').value
  });
  if (!ok) { UI.toast('Error al actualizar','error'); return; }
  UI.closeModal(); UI.toast('Viático actualizado ✓'); Pages.rrhh('viaticos');
};

Pages.eliminarViatico = function (id) {
  UI.confirm('¿Eliminar este viático? Esta acción no se puede deshacer.', async () => {
    const { error } = await getSupabase().from('viaticos').delete().eq('id', id);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.closeModal(); UI.toast('Viático eliminado'); Pages.rrhh('viaticos');
  });
};

Pages.aprobarViatico = async function (id) {
  await DB.updateViatico(id, { estado:'aprobado' });
  UI.toast('Viático aprobado ✓'); Pages.rrhh('viaticos');
};

Pages.rechazarViatico = async function (id) {
  await DB.updateViatico(id, { estado:'rechazado' });
  UI.toast('Viático rechazado'); Pages.rrhh('viaticos');
};

Pages.pagarViatico = async function (id) {
  const all = await DB.getViaticos();
  const v   = all.find(x=>x.id===id); if (!v) return;

  await DB.updateViatico(id, { estado:'pagado' });

  /* ── Registrar en Finanzas → Egresos ───────────── */
  const emp = (Pages._empleadosData||[]).find(e=>e.id===v.empleado_id);
  await DB.insertEgreso({
    categoria:   'otros',
    concepto:    `Viático — ${emp?.nombre||'Empleado'}: ${v.concepto}`,
    monto:       v.monto,
    fecha:       v.fecha,
    metodo_pago: 'efectivo',
    notas:       `Categoría: ${v.categoria}. Comprobante: ${v.comprobante||'—'}`
  });

  UI.toast('Viático pagado y egreso registrado en Finanzas ✓');
  Pages.rrhh('viaticos');
};

Pages.imprimirViaticos = async function () {
  const all = Pages._viaticosData || await DB.getViaticos();
  const emp = Pages._empleadosData || [];
  const total = all.reduce((s,v)=>s+v.monto,0);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte Viáticos</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#000}
    h1{font-size:14px;margin-bottom:4px} .header{border-bottom:2px solid #000;margin-bottom:14px;padding-bottom:8px;display:flex;justify-content:space-between}
    table{width:100%;border-collapse:collapse;margin:10px 0}
    th{background:#f3f4f6;padding:5px 8px;border:1px solid #ddd;text-align:left}
    td{padding:5px 8px;border:1px solid #ddd}
    .total{font-weight:bold;background:#fef3c7}
    @media print{body{margin:0}}
  </style></head><body>
  <div class="header">
    <div><h1>${Auth.tenant?.name} — Reporte de Viáticos</h1></div>
    <div style="text-align:right">${new Date().toLocaleDateString('es-GT')}</div>
  </div>
  <table>
    <thead><tr><th>Empleado</th><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Comprobante</th><th>Monto</th><th>Estado</th></tr></thead>
    <tbody>
      ${all.map(v => {
        const e = v.empleados||emp.find(x=>x.id===v.empleado_id);
        return `<tr><td>${e?.nombre||'—'}</td><td>${v.fecha}</td><td>${v.concepto}</td>
          <td>${v.categoria}</td><td>${v.comprobante||'—'}</td><td>Q${v.monto.toFixed(2)}</td><td>${v.estado}</td></tr>`;
      }).join('')}
      <tr class="total"><td colspan="5" style="text-align:right">TOTAL:</td><td>Q${total.toFixed(2)}</td><td></td></tr>
    </tbody>
  </table>
  </body></html>`;
  const win=window.open('','_blank'); win.document.write(html); win.document.close(); setTimeout(()=>win.print(),400);
};

/* ══════════════════════════════════════════════════════
   ENTRENAMIENTOS
══════════════════════════════════════════════════════ */
Pages._buildEntrenamientos = async function (empleados) {
  const ent = await DB.getEntrenamientos();
  Pages._entrenamientosData = ent;
  const RESULT_COLOR = {aprobado:'green',reprobado:'red',en_proceso:'cyan',cancelado:'gray'};

  const rows = ent.map(e => {
    const emp = e.empleados||empleados.find(x=>x.id===e.empleado_id);
    const rc  = RESULT_COLOR[e.resultado]||'gray';
    return `<tr data-text="${emp?.nombre||''} ${e.titulo} ${e.instructor||''}" data-emp="${e.empleado_id}" data-res="${e.resultado||''}">
      <td>${emp?.nombre||'—'}</td>
      <td><b>${e.titulo}</b><br><span class="text-muted" style="font-size:11px">${e.instructor||''}</span></td>
      <td class="mono-sm">${e.fecha_inicio}</td>
      <td class="mono-sm">${e.horas||0}h</td>
      <td class="mono-sm">${UI.q(e.costo||0)}</td>
      <td>${e.resultado?`<span class="badge badge-${rc}">${e.resultado}</span>`:'<span class="text-muted">—</span>'}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px">
          <button class="btn btn-sm btn-ghost"  onclick="Pages.verEntrenamiento('${e.id}')">Ver</button>
          <button class="btn btn-sm btn-cyan"   onclick="Pages.modalEditarEntrenamiento('${e.id}')">✏️</button>
          <button class="btn btn-sm btn-amber"  onclick="Pages.imprimirEntrenamiento('${e.id}')">🖨️</button>
          <button class="btn btn-sm btn-danger" onclick="Pages.eliminarEntrenamiento('${e.id}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="search-bar">
      <input class="search-input" placeholder="🔍 Buscar entrenamiento, empleado..." id="search-ent" oninput="Pages.filterEntrenamientos()">
      <select class="filter-select" id="filter-ent-emp" onchange="Pages.filterEntrenamientos()">
        <option value="">Todos los empleados</option>
        ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-ent-res" onchange="Pages.filterEntrenamientos()">
        <option value="">Todos los resultados</option>
        <option value="en_proceso">En Proceso</option>
        <option value="aprobado">Aprobado</option>
        <option value="reprobado">Reprobado</option>
        <option value="cancelado">Cancelado</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Entrenamiento</th><th>Fecha</th><th>Horas</th><th>Costo</th><th>Resultado</th><th>Acciones</th></tr></thead>
        <tbody id="ent-tbody">
          ${rows||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Sin entrenamientos registrados</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

Pages.filterEntrenamientos = function () {
  const q   = (document.getElementById('search-ent')?.value||'').toLowerCase();
  const emp = document.getElementById('filter-ent-emp')?.value||'';
  const res = document.getElementById('filter-ent-res')?.value||'';
  document.querySelectorAll('#ent-tbody tr').forEach(r => {
    const match = (!q||(r.dataset.text||'').toLowerCase().includes(q)) &&
                  (!emp||r.dataset.emp===emp) && (!res||r.dataset.res===res);
    r.style.display = match?'':'none';
  });
};

Pages.modalNuevoEntrenamiento = function () {
  const empleados = Pages._empleadosData||[];
  UI.openModal('Nuevo Entrenamiento', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Empleado *</label>
        <select class="form-select" id="ne4-emp">
          <option value="">Seleccionar...</option>
          ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Resultado</label>
        <select class="form-select" id="ne4-res">
          <option value="en_proceso">En Proceso</option>
          <option value="aprobado">Aprobado</option>
          <option value="reprobado">Reprobado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Título del Entrenamiento *</label>
      <input class="form-input" id="ne4-titulo" placeholder="Nombre del curso o capacitación">
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Fecha Inicio</label>
        <input class="form-input" id="ne4-inicio" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="form-group"><label class="form-label">Fecha Fin</label>
        <input class="form-input" id="ne4-fin" type="date">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Horas</label>
        <input class="form-input" id="ne4-horas" type="number" min="0" placeholder="8">
      </div>
      <div class="form-group"><label class="form-label">Costo (Q)</label>
        <input class="form-input" id="ne4-costo" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Instructor / Institución</label>
      <input class="form-input" id="ne4-inst" placeholder="INTECAP, empresa externa...">
    </div>
    <div class="form-group"><label class="form-label">Descripción</label>
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
  if (!empId||!titulo) { UI.toast('Empleado y título son obligatorios','error'); return; }
  const {error} = await DB.insertEntrenamiento({
    empleado_id:  empId, titulo,
    descripcion:  document.getElementById('ne4-desc').value.trim()||null,
    fecha_inicio: document.getElementById('ne4-inicio').value,
    fecha_fin:    document.getElementById('ne4-fin').value||null,
    horas:        parseFloat(document.getElementById('ne4-horas').value)||0,
    costo:        parseFloat(document.getElementById('ne4-costo').value)||0,
    instructor:   document.getElementById('ne4-inst').value.trim()||null,
    resultado:    document.getElementById('ne4-res').value
  });
  if (error) { UI.toast('Error: '+error.message,'error'); return; }
  UI.closeModal(); UI.toast('Entrenamiento guardado ✓'); Pages.rrhh('entrenamientos');
};

Pages.modalEditarEntrenamiento = function (id) {
  const e = (Pages._entrenamientosData||[]).find(x=>x.id===id); if(!e) return;
  UI.openModal('Editar Entrenamiento', `
    <div class="form-group"><label class="form-label">Título *</label>
      <input class="form-input" id="ee4-titulo" value="${e.titulo}">
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Fecha Inicio</label>
        <input class="form-input" id="ee4-inicio" type="date" value="${e.fecha_inicio}">
      </div>
      <div class="form-group"><label class="form-label">Fecha Fin</label>
        <input class="form-input" id="ee4-fin" type="date" value="${e.fecha_fin||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Horas</label>
        <input class="form-input" id="ee4-horas" type="number" value="${e.horas||0}">
      </div>
      <div class="form-group"><label class="form-label">Costo (Q)</label>
        <input class="form-input" id="ee4-costo" type="number" step="0.01" value="${e.costo||0}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Instructor</label>
        <input class="form-input" id="ee4-inst" value="${e.instructor||''}">
      </div>
      <div class="form-group"><label class="form-label">Resultado</label>
        <select class="form-select" id="ee4-res">
          ${['en_proceso','aprobado','reprobado','cancelado'].map(r=>`<option value="${r}" ${e.resultado===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarEntrenamiento('${id}')">Guardar</button>
    </div>`
  );
};

Pages.actualizarEntrenamiento = async function (id) {
  const {error} = await getSupabase().from('entrenamientos').update({
    titulo:       document.getElementById('ee4-titulo').value.trim(),
    fecha_inicio: document.getElementById('ee4-inicio').value,
    fecha_fin:    document.getElementById('ee4-fin').value||null,
    horas:        parseFloat(document.getElementById('ee4-horas').value)||0,
    costo:        parseFloat(document.getElementById('ee4-costo').value)||0,
    instructor:   document.getElementById('ee4-inst').value.trim()||null,
    resultado:    document.getElementById('ee4-res').value
  }).eq('id',id);
  if (error) { UI.toast('Error: '+error.message,'error'); return; }
  UI.closeModal(); UI.toast('Entrenamiento actualizado ✓'); Pages.rrhh('entrenamientos');
};

Pages.eliminarEntrenamiento = function (id) {
  UI.confirm('¿Eliminar este entrenamiento?', async () => {
    await getSupabase().from('entrenamientos').delete().eq('id',id);
    UI.closeModal(); UI.toast('Eliminado'); Pages.rrhh('entrenamientos');
  });
};

Pages.verEntrenamiento = function (id) {
  const e = (Pages._entrenamientosData||[]).find(x=>x.id===id); if(!e) return;
  const emp = (Pages._empleadosData||[]).find(x=>x.id===e.empleado_id);
  UI.openModal('Entrenamiento: '+e.titulo, `
    <div class="detail-section">
      <div class="detail-section-header">Detalles</div>
      <div class="detail-row"><div class="detail-key">Empleado</div><div class="detail-val">${emp?.nombre||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Título</div><div class="detail-val">${e.titulo}</div></div>
      <div class="detail-row"><div class="detail-key">Instructor</div><div class="detail-val">${e.instructor||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Fechas</div><div class="detail-val mono-sm">${e.fecha_inicio} → ${e.fecha_fin||'En curso'}</div></div>
      <div class="detail-row"><div class="detail-key">Horas / Costo</div><div class="detail-val">${e.horas||0}h · ${UI.q(e.costo||0)}</div></div>
      <div class="detail-row"><div class="detail-key">Resultado</div><div class="detail-val">${e.resultado||'—'}</div></div>
      ${e.descripcion?`<div class="detail-row"><div class="detail-key">Descripción</div><div class="detail-val">${e.descripcion}</div></div>`:''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-amber" onclick="Pages.imprimirEntrenamiento('${id}')">🖨️ Imprimir</button>
    </div>`
  );
};

Pages.imprimirEntrenamiento = function (id) {
  const e   = (Pages._entrenamientosData||[]).find(x=>x.id===id); if(!e) return;
  const emp = (Pages._empleadosData||[]).find(x=>x.id===e.empleado_id);
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Entrenamiento</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;margin:2cm}
  h1{font-size:16px;text-align:center}.header{border-bottom:2px solid #000;margin-bottom:16px;padding-bottom:8px}
  table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:7px;border:1px solid #ddd}
  .firma{border-top:1px solid #000;padding-top:6px;text-align:center;margin-top:50px}
  @media print{body{margin:1cm}}</style></head><body>
  <div class="header"><h1>${Auth.tenant?.name}</h1><div style="text-align:center">CONSTANCIA DE ENTRENAMIENTO</div></div>
  <table>
    <tr><td><b>Empleado</b></td><td>${emp?.nombre||'—'}</td><td><b>Cargo</b></td><td>${emp?.cargo||'—'}</td></tr>
    <tr><td><b>Entrenamiento</b></td><td colspan="3">${e.titulo}</td></tr>
    <tr><td><b>Instructor</b></td><td>${e.instructor||'—'}</td><td><b>Institución</b></td><td>${e.instructor||'—'}</td></tr>
    <tr><td><b>Fecha Inicio</b></td><td>${e.fecha_inicio}</td><td><b>Fecha Fin</b></td><td>${e.fecha_fin||'En curso'}</td></tr>
    <tr><td><b>Horas</b></td><td>${e.horas||0}h</td><td><b>Costo</b></td><td>Q${(e.costo||0).toFixed(2)}</td></tr>
    <tr><td><b>Resultado</b></td><td colspan="3"><b>${e.resultado||'—'}</b></td></tr>
  </table>
  ${e.descripcion?`<p>${e.descripcion}</p>`:''}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px">
    <div><div class="firma">Firma del Empleado<br>${emp?.nombre||'—'}</div></div>
    <div><div class="firma">Autorizado<br>${Auth.user?.nombre||'Administración'} — ${Auth.tenant?.name}</div></div>
  </div>
  </body></html>`;
  const win=window.open('','_blank'); win.document.write(html); win.document.close(); setTimeout(()=>win.print(),400);
};

Pages.imprimirEntrenamientos = async function () {
  const all = Pages._entrenamientosData||await DB.getEntrenamientos();
  const emp = Pages._empleadosData||[];
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Entrenamientos</title>
  <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
  table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:6px;border:1px solid #ddd;text-align:left}
  td{padding:6px;border:1px solid #ddd}.header{border-bottom:2px solid #000;margin-bottom:14px;padding-bottom:8px;display:flex;justify-content:space-between}
  @media print{body{margin:0}}</style></head><body>
  <div class="header"><div><b>${Auth.tenant?.name} — Reporte de Entrenamientos</b></div><div>${new Date().toLocaleDateString('es-GT')}</div></div>
  <table><thead><tr><th>Empleado</th><th>Entrenamiento</th><th>Instructor</th><th>Fecha</th><th>Horas</th><th>Costo</th><th>Resultado</th></tr></thead>
  <tbody>${all.map(e=>{const em=e.empleados||emp.find(x=>x.id===e.empleado_id);
    return `<tr><td>${em?.nombre||'—'}</td><td>${e.titulo}</td><td>${e.instructor||'—'}</td>
      <td>${e.fecha_inicio}</td><td>${e.horas||0}h</td><td>Q${(e.costo||0).toFixed(2)}</td><td>${e.resultado||'—'}</td></tr>`;
  }).join('')}</tbody></table></body></html>`;
  const win=window.open('','_blank'); win.document.write(html); win.document.close(); setTimeout(()=>win.print(),400);
};

/* ══════════════════════════════════════════════════════
   DISCIPLINA
══════════════════════════════════════════════════════ */
Pages._buildDisciplina = async function (empleados) {
  const llamadas = await DB.getLlamadasAtencion();
  Pages._llamadasData = llamadas;
  const TIPOS = {verbal:'Verbal',escrita_1:'1ra Escrita',escrita_2:'2da Escrita',suspension:'Suspensión',terminacion:'Terminación'};
  const TCOLORS= {verbal:'cyan',escrita_1:'amber',escrita_2:'red',suspension:'red',terminacion:'red'};

  const rows = llamadas.map(l => {
    const emp = l.empleados||empleados.find(e=>e.id===l.empleado_id);
    return `<tr data-text="${emp?.nombre||''} ${l.motivo} ${l.tipo}" data-emp="${l.empleado_id}" data-tipo="${l.tipo}">
      <td>${emp?.nombre||'—'}</td>
      <td class="mono-sm">${l.fecha}</td>
      <td><span class="badge badge-${TCOLORS[l.tipo]||'gray'}">${TIPOS[l.tipo]||l.tipo}</span></td>
      <td style="font-size:12px">${l.motivo}</td>
      <td>${l.firmado?'<span class="badge badge-green">✓ Firmado</span>':'<span class="badge badge-amber">Pendiente</span>'}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px">
          <button class="btn btn-sm btn-ghost"  onclick="Pages.verLlamada('${l.id}')">Ver</button>
          <button class="btn btn-sm btn-cyan"   onclick="Pages.modalEditarLlamada('${l.id}')">✏️</button>
          <button class="btn btn-sm btn-amber"  onclick="Pages.imprimirLlamada('${l.id}')">🖨️</button>
          <button class="btn btn-sm btn-danger" onclick="Pages.eliminarLlamada('${l.id}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="alert alert-amber mb-4">
      <div class="alert-icon">⚖️</div>
      <div><div class="alert-title">Progresión disciplinaria — Código de Trabajo Guatemala</div>
      <div class="alert-body">Verbal → 1ra Escrita → 2da Escrita → Suspensión → Terminación justificada (Art. 77)</div></div>
    </div>
    <div class="search-bar">
      <input class="search-input" placeholder="🔍 Buscar empleado, motivo..." id="search-disc" oninput="Pages.filterDisciplina()">
      <select class="filter-select" id="filter-disc-emp" onchange="Pages.filterDisciplina()">
        <option value="">Todos los empleados</option>
        ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-disc-tipo" onchange="Pages.filterDisciplina()">
        <option value="">Todos los tipos</option>
        ${Object.entries(TIPOS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Firmado</th><th>Acciones</th></tr></thead>
        <tbody id="disc-tbody">
          ${rows||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">Sin llamadas de atención</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

Pages.filterDisciplina = function () {
  const q    = (document.getElementById('search-disc')?.value||'').toLowerCase();
  const emp  = document.getElementById('filter-disc-emp')?.value||'';
  const tipo = document.getElementById('filter-disc-tipo')?.value||'';
  document.querySelectorAll('#disc-tbody tr').forEach(r => {
    const match = (!q||(r.dataset.text||'').toLowerCase().includes(q)) &&
                  (!emp||r.dataset.emp===emp) && (!tipo||r.dataset.tipo===tipo);
    r.style.display = match?'':'none';
  });
};

Pages.modalNuevaLlamada = function () {
  const empleados = Pages._empleadosData||[];
  UI.openModal('Nueva Llamada de Atención', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Empleado *</label>
        <select class="form-select" id="nl-emp">
          <option value="">Seleccionar...</option>
          ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Fecha</label>
        <input class="form-input" id="nl-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Tipo *</label>
        <select class="form-select" id="nl-tipo">
          <option value="verbal">Verbal</option>
          <option value="escrita_1">1ra Llamada Escrita</option>
          <option value="escrita_2">2da Llamada Escrita</option>
          <option value="suspension">Suspensión</option>
          <option value="terminacion">Terminación</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Testigos</label>
        <input class="form-input" id="nl-testigos" placeholder="Nombres de testigos">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Motivo *</label>
      <input class="form-input" id="nl-motivo" placeholder="Motivo de la llamada de atención">
    </div>
    <div class="form-group"><label class="form-label">Descripción Detallada</label>
      <textarea class="form-input form-textarea" id="nl-desc" rows="3"></textarea>
    </div>
    <div class="form-group"><label class="form-label">Acciones Correctivas</label>
      <textarea class="form-input form-textarea" id="nl-acciones" rows="2"></textarea>
    </div>
    <div class="form-group"><label class="form-label">
      <input type="checkbox" id="nl-firmado" style="margin-right:8px"> Documento firmado por el empleado
    </label></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarLlamada()">Guardar</button>
    </div>`
  );
};

Pages.guardarLlamada = async function () {
  const empId  = document.getElementById('nl-emp').value;
  const motivo = document.getElementById('nl-motivo').value.trim();
  if (!empId||!motivo) { UI.toast('Empleado y motivo son obligatorios','error'); return; }
  const {error} = await DB.insertLlamadaAtencion({
    empleado_id:  empId,
    fecha:        document.getElementById('nl-fecha').value,
    tipo:         document.getElementById('nl-tipo').value,
    motivo,
    descripcion:  document.getElementById('nl-desc').value.trim()||null,
    testigos:     document.getElementById('nl-testigos').value.trim()||null,
    acciones:     document.getElementById('nl-acciones').value.trim()||null,
    firmado:      document.getElementById('nl-firmado').checked
  });
  if (error) { UI.toast('Error: '+error.message,'error'); return; }
  UI.closeModal(); UI.toast('Llamada de atención registrada ✓'); Pages.rrhh('disciplina');
};

Pages.modalEditarLlamada = function (id) {
  const l = (Pages._llamadasData||[]).find(x=>x.id===id); if(!l) return;
  UI.openModal('Editar Llamada de Atención', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Tipo</label>
        <select class="form-select" id="el-tipo">
          ${['verbal','escrita_1','escrita_2','suspension','terminacion'].map(t=>`<option value="${t}" ${l.tipo===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Fecha</label>
        <input class="form-input" id="el-fecha" type="date" value="${l.fecha}">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Motivo *</label>
      <input class="form-input" id="el-motivo" value="${l.motivo}">
    </div>
    <div class="form-group"><label class="form-label">Descripción</label>
      <textarea class="form-input form-textarea" id="el-desc" rows="3">${l.descripcion||''}</textarea>
    </div>
    <div class="form-group"><label class="form-label">Acciones</label>
      <textarea class="form-input form-textarea" id="el-acciones" rows="2">${l.acciones||''}</textarea>
    </div>
    <div class="form-group"><label class="form-label">
      <input type="checkbox" id="el-firmado" ${l.firmado?'checked':''} style="margin-right:8px"> Firmado
    </label></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarLlamada('${id}')">Guardar</button>
    </div>`
  );
};

Pages.actualizarLlamada = async function (id) {
  const {error} = await getSupabase().from('llamadas_atencion').update({
    tipo:        document.getElementById('el-tipo').value,
    fecha:       document.getElementById('el-fecha').value,
    motivo:      document.getElementById('el-motivo').value.trim(),
    descripcion: document.getElementById('el-desc').value.trim()||null,
    acciones:    document.getElementById('el-acciones').value.trim()||null,
    firmado:     document.getElementById('el-firmado').checked
  }).eq('id',id);
  if (error) { UI.toast('Error: '+error.message,'error'); return; }
  UI.closeModal(); UI.toast('Actualizado ✓'); Pages.rrhh('disciplina');
};

Pages.eliminarLlamada = function (id) {
  UI.confirm('¿Eliminar esta llamada de atención?', async () => {
    await getSupabase().from('llamadas_atencion').delete().eq('id',id);
    UI.closeModal(); UI.toast('Eliminado'); Pages.rrhh('disciplina');
  });
};

Pages.verLlamada = function (id) {
  const l = (Pages._llamadasData||[]).find(x=>x.id===id); if(!l) return;
  const emp = (Pages._empleadosData||[]).find(e=>e.id===l.empleado_id);
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
      <button class="btn btn-amber" onclick="Pages.imprimirLlamada('${id}')">🖨️ Imprimir Carta</button>
    </div>`
  );
};

Pages.imprimirLlamada = function (id) {
  const l = (Pages._llamadasData||[]).find(x=>x.id===id); if(!l) return;
  const emp = (Pages._empleadosData||[]).find(e=>e.id===l.empleado_id);
  const TIPOS = {verbal:'Llamada de Atención Verbal',escrita_1:'Primera Llamada de Atención Escrita',
    escrita_2:'Segunda Llamada de Atención Escrita',suspension:'Suspensión Laboral',terminacion:'Aviso de Terminación'};

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Llamada Atención</title>
  <style>body{font-family:'Times New Roman',serif;font-size:12pt;margin:2cm;line-height:1.7}
  h1{font-size:13pt;text-align:center;text-transform:uppercase}
  .header{text-align:right;margin-bottom:20pt}
  .firma{border-top:1px solid #000;padding-top:6pt;text-align:center;margin-top:60pt}
  @media print{body{margin:1.5cm}}</style></head><body>
  <p style="text-align:center"><b>${Auth.tenant?.name}</b></p>
  <div class="header">Guatemala, ${new Date(l.fecha+'T12:00:00').toLocaleDateString('es-GT',{day:'2-digit',month:'long',year:'numeric'})}</div>
  <h1>${TIPOS[l.tipo]||l.tipo}</h1>
  <p><b>Estimado(a) ${emp?.nombre||'—'},</b></p>
  <p>Por medio de la presente, con fundamento en el <b>Código de Trabajo de Guatemala (Decreto 1441)</b>, le comunicamos la siguiente situación:</p>
  <p><b>Motivo:</b> ${l.motivo}</p>
  ${l.descripcion?`<p><b>Descripción:</b> ${l.descripcion}</p>`:''}
  ${l.acciones?`<p><b>Acciones correctivas:</b> ${l.acciones}</p>`:''}
  <p>Le recordamos que el incumplimiento reiterado puede dar lugar a sanciones más severas conforme al Artículo 77 del Código de Trabajo.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40pt;margin-top:40pt">
    <div><div class="firma">Firma del Empleado<br><small>${emp?.nombre||'—'}</small></div></div>
    <div><div class="firma">Autorizado<br><small>${Auth.user?.nombre||'Administración'}</small></div></div>
  </div>
  ${l.testigos?`<p style="margin-top:20pt"><small>Testigos: ${l.testigos}</small></p>`:''}
  </body></html>`;
  const win=window.open('','_blank'); win.document.write(html); win.document.close(); setTimeout(()=>win.print(),400);
};

Pages.imprimirDisciplina = async function () {
  const all = Pages._llamadasData||await DB.getLlamadasAtencion();
  const emp = Pages._empleadosData||[];
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Disciplina</title>
  <style>body{font-family:Arial;font-size:11px;margin:20px}table{width:100%;border-collapse:collapse}
  th{background:#f3f4f6;padding:6px;border:1px solid #ddd}td{padding:6px;border:1px solid #ddd}
  .header{border-bottom:2px solid #000;margin-bottom:14px;padding-bottom:8px;display:flex;justify-content:space-between}
  @media print{body{margin:0}}</style></head><body>
  <div class="header"><b>${Auth.tenant?.name} — Reporte Disciplina</b><span>${new Date().toLocaleDateString('es-GT')}</span></div>
  <table><thead><tr><th>Empleado</th><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Firmado</th></tr></thead>
  <tbody>${all.map(l=>{const e=l.empleados||emp.find(x=>x.id===l.empleado_id);
    return `<tr><td>${e?.nombre||'—'}</td><td>${l.fecha}</td><td>${l.tipo}</td><td>${l.motivo}</td><td>${l.firmado?'✓':''}</td></tr>`;
  }).join('')}</tbody></table></body></html>`;
  const win=window.open('','_blank'); win.document.write(html); win.document.close(); setTimeout(()=>win.print(),400);
};

/* ══════════════════════════════════════════════════════
   LIQUIDACIONES
══════════════════════════════════════════════════════ */
Pages._buildLiquidaciones = async function (empleados) {
  const liq = await DB.getLiquidaciones();
  Pages._liquidacionesData = liq;
  const TIPOS = {renuncia:'Renuncia',despido_causa_justificada:'Despido Justificado',
    despido_sin_causa:'Despido sin Causa',mutuo_acuerdo:'Mutuo Acuerdo',fallecimiento:'Fallecimiento'};
  const ESTCOL = {borrador:'gray',firmada:'amber',pagada:'green'};

  const rows = liq.map(l => {
    const emp = l.empleados||empleados.find(e=>e.id===l.empleado_id);
    return `<tr data-text="${emp?.nombre||''} ${l.tipo_terminacion}" data-emp="${l.empleado_id}" data-est="${l.estado}">
      <td>${emp?.nombre||'—'}</td>
      <td class="mono-sm">${l.fecha_terminacion}</td>
      <td style="font-size:12px">${TIPOS[l.tipo_terminacion]||l.tipo_terminacion}</td>
      <td class="mono-sm text-amber">${UI.q(l.total_a_pagar)}</td>
      <td><span class="badge badge-${ESTCOL[l.estado]||'gray'}">${l.estado}</span></td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px">
          <button class="btn btn-sm btn-ghost"  onclick="Pages.verLiquidacion('${l.id}')">Ver</button>
          <button class="btn btn-sm btn-amber"  onclick="Pages.imprimirFiniquito('${l.id}')">🖨️ Finiquito</button>
          <button class="btn btn-sm btn-danger" onclick="Pages.eliminarLiquidacion('${l.id}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="search-bar">
      <input class="search-input" placeholder="🔍 Buscar empleado..." id="search-liq" oninput="Pages.filterLiquidaciones()">
      <select class="filter-select" id="filter-liq-emp" onchange="Pages.filterLiquidaciones()">
        <option value="">Todos los empleados</option>
        ${empleados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-liq-est" onchange="Pages.filterLiquidaciones()">
        <option value="">Todos los estados</option>
        <option value="borrador">Borrador</option>
        <option value="firmada">Firmada</option>
        <option value="pagada">Pagada</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Fecha Terminación</th><th>Tipo</th><th>Total a Pagar</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody id="liq-tbody">
          ${rows||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">Sin liquidaciones registradas</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

Pages.filterLiquidaciones = function () {
  const q   = (document.getElementById('search-liq')?.value||'').toLowerCase();
  const emp = document.getElementById('filter-liq-emp')?.value||'';
  const est = document.getElementById('filter-liq-est')?.value||'';
  document.querySelectorAll('#liq-tbody tr').forEach(r => {
    const match = (!q||(r.dataset.text||'').toLowerCase().includes(q)) &&
                  (!emp||r.dataset.emp===emp) && (!est||r.dataset.est===est);
    r.style.display = match?'':'none';
  });
};

Pages.eliminarLiquidacion = function (id) {
  UI.confirm('¿Eliminar esta liquidación?', async () => {
    await getSupabase().from('liquidaciones').delete().eq('id',id);
    UI.closeModal(); UI.toast('Liquidación eliminada'); Pages.rrhh('liquidaciones');
  });
};

Pages.modalNuevaLiquidacion = function () {
  const empleados = Pages._empleadosData||[];
  UI.openModal('Nueva Liquidación de Empleado', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Empleado *</label>
        <select class="form-select" id="liq-emp" onchange="Pages._calcLiquidacion()">
          <option value="">Seleccionar...</option>
          ${empleados.map(e=>`<option value="${e.id}" data-salario="${e.salario_base||0}" data-ingreso="${e.fecha_ingreso||''}" data-bonif="${e.bonificacion||250}">${e.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Fecha de Terminación *</label>
        <input class="form-input" id="liq-fecha" type="date" value="${new Date().toISOString().slice(0,10)}" onchange="Pages._calcLiquidacion()">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Tipo de Terminación *</label>
      <select class="form-select" id="liq-tipo" onchange="Pages._calcLiquidacion()">
        <option value="renuncia">Renuncia voluntaria</option>
        <option value="despido_causa_justificada">Despido con causa justificada (Art. 77)</option>
        <option value="despido_sin_causa">Despido sin causa justificada (Art. 82)</option>
        <option value="mutuo_acuerdo">Mutuo acuerdo</option>
        <option value="fallecimiento">Fallecimiento</option>
      </select>
    </div>
    <div class="card card-amber" style="margin-bottom:14px">
      <div class="card-sub mb-3">⚖️ Cálculo Automático — Ley Guatemala</div>
      <div class="grid-2" style="gap:10px">
        <div class="detail-section">
          <div class="detail-section-header">Base</div>
          <div class="detail-row"><div class="detail-key">Salario base</div><div class="detail-val mono-sm" id="liq-p-sal">Q0.00</div></div>
          <div class="detail-row"><div class="detail-key">Tiempo servido</div><div class="detail-val mono-sm" id="liq-p-tiempo">—</div></div>
        </div>
        <div class="detail-section">
          <div class="detail-section-header">Prestaciones</div>
          <div class="detail-row"><div class="detail-key">Indemnización</div><div class="detail-val mono-sm text-amber" id="liq-p-indem">Q0.00</div></div>
          <div class="detail-row"><div class="detail-key">Aguinaldo prop.</div><div class="detail-val mono-sm" id="liq-p-agui">Q0.00</div></div>
          <div class="detail-row"><div class="detail-key">Bono 14 prop.</div><div class="detail-val mono-sm" id="liq-p-bono">Q0.00</div></div>
          <div class="detail-row"><div class="detail-key">Vacaciones (15d/año)</div><div class="detail-val mono-sm" id="liq-p-vac">Q0.00</div></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid var(--border);margin-top:8px">
        <span style="font-weight:700">TOTAL A PAGAR</span>
        <span class="mono" style="font-size:20px;color:var(--amber);font-weight:700" id="liq-p-total">Q0.00</span>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Motivo para la Carta</label>
      <textarea class="form-input form-textarea" id="liq-motivo" rows="3" placeholder="Descripción del motivo de terminación..."></textarea>
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
  if (!salario||!ingreso) return;

  const inicio  = new Date(ingreso+'T12:00:00');
  const fin     = new Date(fechaT+'T12:00:00');
  const anios   = (fin-inicio)/(365.25*24*60*60*1000);
  const diario  = salario/30;
  const tieneIndem = ['despido_sin_causa','mutuo_acuerdo','fallecimiento'].includes(tipo);
  const indem   = tieneIndem ? salario*Math.max(Math.floor(anios),1) : 0;
  const mesActual = fin.getMonth()+1;
  const agui    = (salario/12)*(mesActual>=12?12:mesActual);
  const mesesBono= mesActual>=7?mesActual-6:mesActual;
  const bono    = (salario/12)*Math.min(mesesBono,12);
  const vac     = diario*15*anios;
  const total   = indem+agui+bono+vac;

  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  set('liq-p-sal',  UI.q(salario));
  set('liq-p-tiempo',`${Math.floor(anios)} años, ${Math.floor((anios%1)*365)} días`);
  set('liq-p-indem', UI.q(indem));
  set('liq-p-agui',  UI.q(agui));
  set('liq-p-bono',  UI.q(bono));
  set('liq-p-vac',   UI.q(vac));
  set('liq-p-total', UI.q(total));
  Pages._liqCalc = {salario,indem,agui,bono,vac,total,anios};
};

Pages.guardarLiquidacion = async function () {
  const empId = document.getElementById('liq-emp').value;
  const tipo  = document.getElementById('liq-tipo').value;
  const fecha = document.getElementById('liq-fecha').value;
  if (!empId||!fecha) { UI.toast('Selecciona empleado y fecha','error'); return; }
  const c = Pages._liqCalc||{};
  const {error} = await DB.insertLiquidacion({
    empleado_id: empId, fecha_terminacion: fecha, tipo_terminacion: tipo,
    salario_base: c.salario||0,
    indemnizacion: parseFloat((c.indem||0).toFixed(2)),
    aguinaldo_proporcional: parseFloat((c.agui||0).toFixed(2)),
    bono14_proporcional: parseFloat((c.bono||0).toFixed(2)),
    vacaciones_pendientes: parseFloat((c.vac||0).toFixed(2)),
    total_a_pagar: parseFloat((c.total||0).toFixed(2)),
    motivo_carta: document.getElementById('liq-motivo').value.trim()||null,
    estado: 'borrador'
  });
  if (error) { UI.toast('Error: '+error.message,'error'); return; }
  UI.closeModal(); UI.toast('Liquidación generada ✓'); Pages.rrhh('liquidaciones');
};

Pages.verLiquidacion = function (id) {
  const l = (Pages._liquidacionesData||[]).find(x=>x.id===id); if(!l) return;
  const emp = l.empleados||(Pages._empleadosData||[]).find(e=>e.id===l.empleado_id);
  UI.openModal('Liquidación: '+(emp?.nombre||'—'), `
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

Pages.imprimirFiniquito = function (id) {
  const l = (Pages._liquidacionesData||[]).find(x=>x.id===id); if(!l) return;
  const emp = l.empleados||(Pages._empleadosData||[]).find(e=>e.id===l.empleado_id);
  const TIPOS = {renuncia:'Renuncia Voluntaria',despido_causa_justificada:'Despido con Causa Justificada',
    despido_sin_causa:'Despido sin Causa Justificada',mutuo_acuerdo:'Mutuo Acuerdo',fallecimiento:'Fallecimiento'};
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Finiquito</title>
  <style>body{font-family:'Times New Roman',serif;font-size:12pt;margin:2cm;line-height:1.7}
  h1{font-size:13pt;text-align:center;text-transform:uppercase;margin-bottom:4pt}
  table{width:100%;border-collapse:collapse;margin:10pt 0}
  td{padding:6pt 8pt;border:1px solid #ddd}
  .total-row{font-weight:bold;background:#fffbeb}
  .firma{border-top:1px solid #000;padding-top:6pt;text-align:center;margin-top:60pt}
  @media print{body{margin:1.5cm}}</style></head><body>
  <p style="text-align:center"><b>${Auth.tenant?.name}</b> · NIT: ${Auth.tenant?.nit||'—'}</p>
  <h1>ACTA DE LIQUIDACIÓN Y FINIQUITO</h1>
  <p style="text-align:center">${TIPOS[l.tipo_terminacion]||l.tipo_terminacion}</p>
  <p>En la Ciudad de Guatemala, el ${new Date(l.fecha_terminacion+'T12:00:00').toLocaleDateString('es-GT',{day:'2-digit',month:'long',year:'numeric'})},
  comparecen <b>${Auth.tenant?.name}</b> ("el Patrono") y <b>${emp?.nombre||'—'}</b> ("el Trabajador"),
  y acuerdan suscribir el presente finiquito conforme al <b>Código de Trabajo, Decreto 1441</b>.</p>
  <table>
    <tr><td><b>Trabajador</b></td><td>${emp?.nombre||'—'}</td><td><b>Cargo</b></td><td>${emp?.cargo||'—'}</td></tr>
    <tr><td><b>Fecha Ingreso</b></td><td>${emp?.fecha_ingreso||'—'}</td><td><b>Fecha Terminación</b></td><td>${l.fecha_terminacion}</td></tr>
    <tr><td><b>Tipo</b></td><td colspan="3">${TIPOS[l.tipo_terminacion]}</td></tr>
    <tr><td><b>Salario Base</b></td><td colspan="3">Q${(l.salario_base||0).toFixed(2)}</td></tr>
  </table>
  <table>
    <tr><td><b>Prestación</b></td><td style="text-align:right"><b>Monto</b></td></tr>
    <tr><td>Indemnización (Art. 82 C.T.)</td><td style="text-align:right">Q${(l.indemnizacion||0).toFixed(2)}</td></tr>
    <tr><td>Aguinaldo Proporcional (Decreto 76-78)</td><td style="text-align:right">Q${(l.aguinaldo_proporcional||0).toFixed(2)}</td></tr>
    <tr><td>Bono 14 Proporcional (Decreto 42-92)</td><td style="text-align:right">Q${(l.bono14_proporcional||0).toFixed(2)}</td></tr>
    <tr><td>Vacaciones Pendientes (15 días/año — Art. 130)</td><td style="text-align:right">Q${(l.vacaciones_pendientes||0).toFixed(2)}</td></tr>
    <tr><td>Salario Pendiente</td><td style="text-align:right">Q${(l.salario_pendiente||0).toFixed(2)}</td></tr>
    <tr><td>(-) Préstamo empresa</td><td style="text-align:right">-Q${(l.prestamo_empresa||0).toFixed(2)}</td></tr>
    <tr><td>(-) Otros descuentos</td><td style="text-align:right">-Q${(l.otros_descuentos||0).toFixed(2)}</td></tr>
    <tr class="total-row"><td><b>TOTAL A PAGAR</b></td><td style="text-align:right"><b>Q${(l.total_a_pagar||0).toFixed(2)}</b></td></tr>
  </table>
  ${l.motivo_carta?`<p><b>Motivo:</b> ${l.motivo_carta}</p>`:''}
  <p>El Trabajador declara recibir la suma de <b>Q${(l.total_a_pagar||0).toFixed(2)}</b> como liquidación total de todas las prestaciones laborales, otorgando el más amplio finiquito al Patrono.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40pt">
    <div><div class="firma">Firma del Trabajador<br>${emp?.nombre||'—'}<br>DPI: ________________</div></div>
    <div><div class="firma">Patrono / Representante<br>${Auth.user?.nombre||'Administración'}<br>${Auth.tenant?.name}</div></div>
  </div>
  </body></html>`;
  const win=window.open('','_blank'); win.document.write(html); win.document.close(); setTimeout(()=>win.print(),400);
};

/* ══════════════════════════════════════════════════════
   EMPLEADOS — Funciones adicionales
══════════════════════════════════════════════════════ */
Pages.verEmpleado = function (id) {
  const emp = (Pages._empleadosData||[]).find(e=>e.id===id); if(!emp) return;
  const igssLab  = ((emp.salario_base||0)*0.0483).toFixed(2);
  const igssPatr = ((emp.salario_base||0)*0.1267).toFixed(2);
  const bonif    = emp.bonificacion||250;
  const liquido  = ((emp.salario_base||0)+bonif-parseFloat(igssLab)).toFixed(2);
  UI.openModal('Empleado: '+emp.nombre, `
    <div class="grid-2 mb-4">
      <div class="detail-section">
        <div class="detail-section-header">Datos</div>
        <div class="detail-row"><div class="detail-key">Nombre</div><div class="detail-val">${emp.nombre}</div></div>
        <div class="detail-row"><div class="detail-key">Cargo</div><div class="detail-val">${emp.cargo||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Rol</div><div class="detail-val">${ROLES[emp.rol]?.label||emp.rol}</div></div>
        <div class="detail-row"><div class="detail-key">Fecha Ingreso</div><div class="detail-val mono-sm">${emp.fecha_ingreso||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">IGSS</div><div class="detail-val">${emp.igss?'✅':'❌'}</div></div>
      </div>
      <div class="detail-section">
        <div class="detail-section-header">Salario</div>
        <div class="detail-row"><div class="detail-key">Base</div><div class="detail-val mono-sm text-amber">${UI.q(emp.salario_base||0)}</div></div>
        <div class="detail-row"><div class="detail-key">Bonificación</div><div class="detail-val mono-sm text-green">+${UI.q(bonif)}</div></div>
        <div class="detail-row"><div class="detail-key">IGSS Lab.(4.83%)</div><div class="detail-val mono-sm text-red">-${UI.q(igssLab)}</div></div>
        <div class="detail-row"><div class="detail-key">Líquido</div><div class="detail-val mono-sm" style="font-weight:700;color:var(--green)">${UI.q(liquido)}</div></div>
        <div class="detail-row"><div class="detail-key">IGSS Patronal</div><div class="detail-val mono-sm text-muted">${UI.q(igssPatr)}</div></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-ghost" onclick="UI.closeModal();Pages.rrhh('liquidaciones')">📄 Liquidar</button>
      <button class="btn btn-amber" onclick="Pages.imprimirBoleta('${emp.id}')">🖨️ Boleta</button>
    </div>`
  );
};

Pages.modalNuevoEmpleado = function () {
  UI.openModal('Nuevo Empleado', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="ne-nombre" placeholder="Nombre completo"></div>
      <div class="form-group"><label class="form-label">Rol *</label>
        <select class="form-select" id="ne-rol">
          ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cargo</label><input class="form-input" id="ne-cargo" placeholder="Mecánico Senior..."></div>
      <div class="form-group"><label class="form-label">NIT</label><input class="form-input" id="ne-nit" placeholder="1234567-8"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Salario Base (Q) *</label>
        <input class="form-input" id="ne-salario" type="number" min="0" placeholder="3500.00" oninput="Pages.calcularLiquido()">
      </div>
      <div class="form-group"><label class="form-label">Bonificación (Q)</label>
        <input class="form-input" id="ne-bonif" type="number" value="250" oninput="Pages.calcularLiquido()">
      </div>
    </div>
    <div class="card" style="padding:12px;margin-bottom:4px">
      <div class="grid-2" style="gap:8px">
        <div><div class="text-muted" style="font-size:11px">IGSS Laboral (4.83%)</div><div class="mono-sm text-red" id="prev-igss">Q0.00</div></div>
        <div><div class="text-muted" style="font-size:11px">Líquido a pagar</div><div class="mono-sm text-green" id="prev-liquido">Q0.00</div></div>
        <div><div class="text-muted" style="font-size:11px">IGSS Patronal (12.67%)</div><div class="mono-sm" id="prev-patron">Q0.00</div></div>
        <div><div class="text-muted" style="font-size:11px">Costo total taller</div><div class="mono-sm text-amber" id="prev-total">Q0.00</div></div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Fecha de Ingreso</label>
        <input class="form-input" id="ne-ingreso" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="form-group"><label class="form-label">Avatar (emoji)</label>
        <input class="form-input" id="ne-avatar" value="👤" maxlength="2">
      </div>
    </div>
    <div class="form-group"><label class="form-label">
      <input type="checkbox" id="ne-igss" checked style="margin-right:8px"> Afiliado al IGSS
    </label></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarEmpleado()">Guardar Empleado</button>
    </div>`
  );
};

Pages.calcularLiquido = function () {
  const sal   = parseFloat(document.getElementById('ne-salario')?.value||document.getElementById('ee-salario')?.value||0);
  const bonif = parseFloat(document.getElementById('ne-bonif')?.value||document.getElementById('ee-bonif')?.value||250);
  const igssL = sal*0.0483, igssP = sal*0.1267, liq = sal+bonif-igssL;
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=UI.q(val);};
  set('prev-igss',igssL); set('prev-liquido',liq); set('prev-patron',igssP); set('prev-total',sal+bonif+igssP);
};

Pages.guardarEmpleado = async function () {
  const nombre  = document.getElementById('ne-nombre').value.trim();
  const rol     = document.getElementById('ne-rol').value;
  const salario = parseFloat(document.getElementById('ne-salario').value)||0;
  if (!nombre||!rol)  { UI.toast('Nombre y rol son obligatorios','error'); return; }
  if (salario<=0)     { UI.toast('El salario debe ser mayor a 0','error'); return; }
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
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cargo</label><input class="form-input" id="ee-cargo" value="${emp.cargo||''}"></div>
      <div class="form-group"><label class="form-label">NIT</label><input class="form-input" id="ee-nit" value="${emp.nit||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Salario Base (Q)</label>
        <input class="form-input" id="ee-salario" type="number" value="${emp.salario_base||0}" oninput="Pages.calcularLiquido()">
      </div>
      <div class="form-group"><label class="form-label">Bonificación</label>
        <input class="form-input" id="ee-bonif" type="number" value="${emp.bonificacion||250}" oninput="Pages.calcularLiquido()">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Fecha Ingreso</label>
        <input class="form-input" id="ee-ingreso" type="date" value="${emp.fecha_ingreso||''}">
      </div>
      <div class="form-group"><label class="form-label">Avatar</label>
        <input class="form-input" id="ee-avatar" value="${emp.avatar||'👤'}" maxlength="2">
      </div>
    </div>
    <div class="form-group"><label class="form-label">
      <input type="checkbox" id="ee-igss" ${emp.igss?'checked':''} style="margin-right:8px"> Afiliado IGSS
    </label></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarEmpleado('${id}')">Guardar Cambios</button>
    </div>`
  );
};

Pages.actualizarEmpleado = async function (id) {
  const nombre = document.getElementById('ee-nombre').value.trim();
  if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
  const ok = await DB.updateEmpleado(id, {
    nombre, rol: document.getElementById('ee-rol').value,
    cargo:         document.getElementById('ee-cargo').value.trim()||null,
    nit:           document.getElementById('ee-nit').value.trim()||null,
    salario_base:  parseFloat(document.getElementById('ee-salario').value)||0,
    bonificacion:  parseFloat(document.getElementById('ee-bonif').value)||250,
    fecha_ingreso: document.getElementById('ee-ingreso').value||null,
    avatar:        document.getElementById('ee-avatar').value.trim()||'👤',
    igss:          document.getElementById('ee-igss').checked
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
  <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}
  h1{font-size:14px} .header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  th{background:#f3f4f6;padding:7px;border:1px solid #ddd;text-align:left}
  td{padding:7px;border:1px solid #ddd} .total{font-weight:bold;background:#fef3c7}
  .firma{border-top:1px solid #000;padding-top:6px;text-align:center;margin-top:50px}
  @media print{body{margin:0}}</style></head><body>
  <div class="header"><div><h1>${Auth.tenant?.name}</h1><div style="color:#666">${Auth.tenant?.address||''} · NIT: ${Auth.tenant?.nit||'—'}</div></div>
  <div style="text-align:right"><b>BOLETA DE PAGO</b><br>${mes.toUpperCase()}</div></div>
  <table><tr><td><b>Empleado</b></td><td>${emp.nombre}</td><td><b>Cargo</b></td><td>${emp.cargo||'—'}</td></tr>
  <tr><td><b>NIT</b></td><td>${emp.nit||'—'}</td><td><b>Fecha Ingreso</b></td><td>${emp.fecha_ingreso||'—'}</td></tr></table>
  <table><thead><tr><th colspan="2">Ingresos</th></tr></thead>
  <tr><td>Salario Base</td><td>Q${(emp.salario_base||0).toFixed(2)}</td></tr>
  <tr><td>Bonificación Incentivo (MINTRAB)</td><td>Q${bonif.toFixed(2)}</td></tr>
  <thead><tr><th colspan="2">Descuentos</th></tr></thead>
  <tr><td>IGSS Laboral (4.83%)</td><td>-Q${igssLab}</td></tr>
  <tr class="total"><td><b>LÍQUIDO A RECIBIR</b></td><td><b>Q${liquido}</b></td></tr>
  <thead><tr><th colspan="2">Aporte Patronal (cargo del taller)</th></tr></thead>
  <tr><td>IGSS Patronal (12.67%)</td><td>Q${igssPatr}</td></tr></table>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px">
    <div><div class="firma">Firma del Empleado<br>${emp.nombre}</div></div>
    <div><div class="firma">Autorizado por<br>${Auth.user?.nombre||'Administración'}</div></div>
  </div></body></html>`;
  const win=window.open('','_blank'); win.document.write(html); win.document.close(); setTimeout(()=>win.print(),400);
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
    return `<tr><td>${e.nombre}</td><td>${e.cargo||'—'}</td>
      <td class="mono-sm">${UI.q(sal)}</td><td class="mono-sm">${UI.q(bonif)}</td>
      <td class="mono-sm text-red">-${UI.q(igssL)}</td>
      <td class="mono-sm text-green">${UI.q(liq)}</td>
      <td class="mono-sm text-muted">${UI.q(igssP)}</td></tr>`;
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
      <button class="btn btn-amber" onclick="window.print()">🖨️ Imprimir Nómina</button>
    </div>`, 'modal-lg');
};
