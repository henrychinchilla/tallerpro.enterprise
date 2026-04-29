/* ═══════════════════════════════════════════════════════
   modules/rrhh.js — RRHH & Nómina completo
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

Pages.rrhh = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">RRHH & Nómina</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const empleados   = await DB.getEmpleados();
  const totalNomina = empleados.reduce((s, e) => s + (e.salario_base || 0), 0);
  Pages._empleadosData = empleados;

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">RRHH & Nómina</h1>
        <p class="page-subtitle">// ${empleados.length} EMPLEADOS · IGSS · MINTRAB</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="Pages.calcularNomina()">🧾 Calcular Nómina</button>
        <button class="btn btn-amber" onclick="Pages.modalNuevoEmpleado()">＋ Nuevo Empleado</button>
      </div>
    </div>
    <div class="page-body">

      <div class="kpi-grid">
        <div class="kpi-card amber">
          <div class="kpi-label">Planilla Mensual</div>
          <div class="kpi-val amber">${UI.q(totalNomina)}</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-label">Total Empleados</div>
          <div class="kpi-val cyan">${empleados.length}</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">Con IGSS</div>
          <div class="kpi-val green">${empleados.filter(e => e.igss).length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">IGSS Patronal (12.67%)</div>
          <div class="kpi-val">${UI.q(totalNomina * 0.1267)}</div>
        </div>
      </div>

      ${empleados.length === 0 ? `
        <div class="card" style="text-align:center;padding:48px">
          <div style="font-size:40px;margin-bottom:16px">👤</div>
          <div style="font-weight:700;font-size:16px;color:var(--text);margin-bottom:8px">Sin empleados registrados</div>
          <div class="text-muted mb-4">Agrega tu primer empleado para comenzar a gestionar la nómina.</div>
          <button class="btn btn-amber" onclick="Pages.modalNuevoEmpleado()">＋ Agregar Primer Empleado</button>
        </div>` : `

      <div class="search-bar">
        <input class="search-input" placeholder="🔍 Buscar empleado, cargo, rol..."
               id="search-emp" oninput="Pages.filterEmpleados()">
        <select class="filter-select" id="filter-rol" onchange="Pages.filterEmpleados()">
          <option value="">Todos los roles</option>
          ${Object.entries(ROLES).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
        </select>
      </div>

      <div id="emp-lista" style="display:flex;flex-direction:column;gap:10px">
        ${empleados.map(e => Pages._empCard(e)).join('')}
      </div>`}

    </div>`;
};

Pages._empCard = function (e) {
  const igssLab  = ((e.salario_base || 0) * 0.0483).toFixed(2);
  const liquido  = ((e.salario_base || 0) + (e.bonificacion || 250) - parseFloat(igssLab)).toFixed(2);
  return `
    <div class="emp-card" data-rol="${e.rol}" data-text="${e.nombre} ${e.cargo||''} ${e.rol}">
      <div class="emp-avatar" style="background:var(--${ROLES[e.rol]?.color||'gray'}-dim)">${e.avatar || '👤'}</div>
      <div style="flex:1">
        <div class="emp-name">${e.nombre}</div>
        <div class="emp-role">${e.cargo || '—'} · <span class="badge badge-${ROLES[e.rol]?.color||'gray'}" style="font-size:8px">${ROLES[e.rol]?.label||e.rol}</span></div>
      </div>
      <div class="emp-stats">
        <div>
          <div class="emp-stat-val" style="font-size:16px">${UI.q(e.salario_base||0)}</div>
          <div class="emp-stat-lbl">Salario</div>
        </div>
        <div>
          <div class="emp-stat-val" style="font-size:16px">${UI.q(liquido)}</div>
          <div class="emp-stat-lbl">Líquido</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-left:12px">
        <button class="btn btn-sm btn-ghost" onclick="Pages.verEmpleado('${e.id}')">Ver</button>
        <button class="btn btn-sm btn-cyan" onclick="Pages.modalEditarEmpleado('${e.id}')">✏️</button>
      </div>
    </div>`;
};

Pages.filterEmpleados = function () {
  const q   = (document.getElementById('search-emp')?.value || '').toLowerCase();
  const rol = document.getElementById('filter-rol')?.value || '';
  document.querySelectorAll('#emp-lista .emp-card').forEach(r => {
    const match = (!q || (r.dataset.text||'').toLowerCase().includes(q)) &&
                  (!rol || r.dataset.rol === rol);
    r.style.display = match ? '' : 'none';
  });
};

Pages.verEmpleado = function (id) {
  const emp = (Pages._empleadosData || []).find(e => e.id === id);
  if (!emp) return;

  const igssLab  = ((emp.salario_base || 0) * 0.0483).toFixed(2);
  const igssPatr = ((emp.salario_base || 0) * 0.1267).toFixed(2);
  const bonif    = emp.bonificacion || 250;
  const liquido  = ((emp.salario_base || 0) + bonif - parseFloat(igssLab)).toFixed(2);

  UI.openModal('Empleado: ' + emp.nombre, `
    <div class="flex items-center gap-3 mb-4">
      <div class="emp-avatar" style="width:50px;height:50px;font-size:22px;background:var(--${ROLES[emp.rol]?.color||'gray'}-dim)">${emp.avatar||'👤'}</div>
      <div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:24px">${emp.nombre}</h2>
        <span class="badge badge-${ROLES[emp.rol]?.color||'gray'}">${ROLES[emp.rol]?.label||emp.rol}</span>
      </div>
      <button class="btn btn-cyan btn-sm" style="margin-left:auto" onclick="UI.closeModal();Pages.modalEditarEmpleado('${emp.id}')">✏️ Editar</button>
    </div>

    <div class="grid-2 mb-4">
      <div class="detail-section">
        <div class="detail-section-header">Datos Personales</div>
        <div class="detail-row"><div class="detail-key">Nombre</div><div class="detail-val">${emp.nombre}</div></div>
        <div class="detail-row"><div class="detail-key">Cargo</div><div class="detail-val">${emp.cargo||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Rol Sistema</div><div class="detail-val">${ROLES[emp.rol]?.label||emp.rol}</div></div>
        <div class="detail-row"><div class="detail-key">NIT</div><div class="detail-val mono-sm">${emp.nit||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Fecha Ingreso</div><div class="detail-val mono-sm">${emp.fecha_ingreso||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">IGSS</div><div class="detail-val">${emp.igss ? '✅ Afiliado' : '❌ No afiliado'}</div></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-header">Cálculo Salarial — Guatemala</div>
        <div class="detail-row"><div class="detail-key">Salario Base</div><div class="detail-val mono-sm text-amber">${UI.q(emp.salario_base||0)}</div></div>
        <div class="detail-row"><div class="detail-key">Bonif. Incentivo</div><div class="detail-val mono-sm text-green">+${UI.q(bonif)} <span class="text-muted" style="font-size:10px">MINTRAB</span></div></div>
        <div class="detail-row"><div class="detail-key">IGSS Laboral (4.83%)</div><div class="detail-val mono-sm text-red">-${UI.q(igssLab)}</div></div>
        <div class="detail-row"><div class="detail-key">Líquido a Pagar</div><div class="detail-val mono-sm" style="font-weight:700;color:var(--green)">${UI.q(liquido)}</div></div>
        <div class="detail-row"><div class="detail-key">IGSS Patronal (12.67%)</div><div class="detail-val mono-sm text-muted">${UI.q(igssPatr)}</div></div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-danger" onclick="Pages.desactivarEmpleado('${emp.id}')">Desactivar</button>
      <button class="btn btn-amber" onclick="Pages.imprimirBoleta('${emp.id}')">🖨️ Boleta de Pago</button>
    </div>`
  );
};

Pages.modalNuevoEmpleado = function () {
  UI.openModal('Nuevo Empleado', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre Completo *</label>
        <input class="form-input" id="ne-nombre" placeholder="Juan García Pérez">
      </div>
      <div class="form-group">
        <label class="form-label">Rol en el Sistema *</label>
        <select class="form-select" id="ne-rol">
          <option value="">Seleccionar rol...</option>
          ${Object.entries(ROLES).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cargo / Puesto</label>
        <input class="form-input" id="ne-cargo" placeholder="Mecánico Senior, Recepcionista...">
      </div>
      <div class="form-group">
        <label class="form-label">NIT</label>
        <input class="form-input" id="ne-nit" placeholder="1234567-8">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Salario Base (Q) *</label>
        <input class="form-input" id="ne-salario" type="number" min="0" placeholder="3500.00"
               oninput="Pages.calcularLiquido()">
      </div>
      <div class="form-group">
        <label class="form-label">Bonificación (Q)</label>
        <input class="form-input" id="ne-bonif" type="number" value="250" min="0"
               oninput="Pages.calcularLiquido()">
      </div>
    </div>

    <!-- Preview de nómina -->
    <div class="card" style="padding:14px;margin-bottom:4px" id="preview-nomina">
      <div class="card-sub mb-3">Vista previa nómina</div>
      <div class="grid-2" style="gap:10px">
        <div><div class="text-muted" style="font-size:11px">IGSS Laboral (4.83%)</div><div class="mono-sm text-red" id="prev-igss">Q0.00</div></div>
        <div><div class="text-muted" style="font-size:11px">Líquido a pagar</div><div class="mono-sm text-green" id="prev-liquido">Q0.00</div></div>
        <div><div class="text-muted" style="font-size:11px">IGSS Patronal (12.67%)</div><div class="mono-sm text-muted" id="prev-patron">Q0.00</div></div>
        <div><div class="text-muted" style="font-size:11px">Costo total taller</div><div class="mono-sm text-amber" id="prev-total">Q0.00</div></div>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha de Ingreso</label>
        <input class="form-input" id="ne-ingreso" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="form-group">
        <label class="form-label">Avatar (emoji)</label>
        <input class="form-input" id="ne-avatar" placeholder="🔧" maxlength="2" value="👤">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">
        <input type="checkbox" id="ne-igss" checked style="margin-right:8px">
        Afiliado al IGSS
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarEmpleado()">Guardar Empleado</button>
    </div>`
  );
};

Pages.calcularLiquido = function () {
  const sal   = parseFloat(document.getElementById('ne-salario')?.value || document.getElementById('ee-salario')?.value || 0);
  const bonif = parseFloat(document.getElementById('ne-bonif')?.value   || document.getElementById('ee-bonif')?.value   || 250);
  const igssL = sal * 0.0483;
  const igssP = sal * 0.1267;
  const liq   = sal + bonif - igssL;

  const setEl = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = UI.q(val); };
  setEl('prev-igss',   igssL);
  setEl('prev-liquido',liq);
  setEl('prev-patron', igssP);
  setEl('prev-total',  sal + bonif + igssP);
};

Pages.guardarEmpleado = async function () {
  const nombre  = document.getElementById('ne-nombre').value.trim();
  const rol     = document.getElementById('ne-rol').value;
  const salario = parseFloat(document.getElementById('ne-salario').value) || 0;

  if (!nombre)  { UI.toast('El nombre es obligatorio', 'error'); return; }
  if (!rol)     { UI.toast('Selecciona un rol', 'error'); return; }
  if (salario <= 0) { UI.toast('El salario debe ser mayor a 0', 'error'); return; }

  const { data, error } = await DB.insertEmpleado({
    nombre,
    rol,
    cargo:        document.getElementById('ne-cargo').value.trim() || null,
    nit:          document.getElementById('ne-nit').value.trim()   || null,
    salario_base: salario,
    bonificacion: parseFloat(document.getElementById('ne-bonif').value) || 250,
    fecha_ingreso:document.getElementById('ne-ingreso').value || null,
    avatar:       document.getElementById('ne-avatar').value.trim() || '👤',
    igss:         document.getElementById('ne-igss').checked
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast(nombre + ' agregado exitosamente ✓');
  Pages.rrhh();
};

Pages.modalEditarEmpleado = async function (id) {
  const emp = (Pages._empleadosData || await DB.getEmpleados()).find(e => e.id === id);
  if (!emp) return;

  UI.openModal('Editar: ' + emp.nombre, `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre Completo *</label>
        <input class="form-input" id="ee-nombre" value="${emp.nombre}">
      </div>
      <div class="form-group">
        <label class="form-label">Rol en el Sistema *</label>
        <select class="form-select" id="ee-rol">
          ${Object.entries(ROLES).map(([k,v]) =>
            `<option value="${k}" ${emp.rol===k?'selected':''}>${v.icon} ${v.label}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cargo / Puesto</label>
        <input class="form-input" id="ee-cargo" value="${emp.cargo||''}">
      </div>
      <div class="form-group">
        <label class="form-label">NIT</label>
        <input class="form-input" id="ee-nit" value="${emp.nit||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Salario Base (Q) *</label>
        <input class="form-input" id="ee-salario" type="number" value="${emp.salario_base||0}"
               oninput="Pages.calcularLiquido()">
      </div>
      <div class="form-group">
        <label class="form-label">Bonificación (Q)</label>
        <input class="form-input" id="ee-bonif" type="number" value="${emp.bonificacion||250}"
               oninput="Pages.calcularLiquido()">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha de Ingreso</label>
        <input class="form-input" id="ee-ingreso" type="date" value="${emp.fecha_ingreso||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Avatar (emoji)</label>
        <input class="form-input" id="ee-avatar" value="${emp.avatar||'👤'}" maxlength="2">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">
        <input type="checkbox" id="ee-igss" ${emp.igss?'checked':''} style="margin-right:8px">
        Afiliado al IGSS
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarEmpleado('${emp.id}')">Guardar Cambios</button>
    </div>`
  );
};

Pages.actualizarEmpleado = async function (id) {
  const nombre  = document.getElementById('ee-nombre').value.trim();
  const salario = parseFloat(document.getElementById('ee-salario').value) || 0;
  if (!nombre)  { UI.toast('El nombre es obligatorio', 'error'); return; }

  const ok = await DB.updateEmpleado(id, {
    nombre,
    rol:          document.getElementById('ee-rol').value,
    cargo:        document.getElementById('ee-cargo').value.trim() || null,
    nit:          document.getElementById('ee-nit').value.trim()   || null,
    salario_base: salario,
    bonificacion: parseFloat(document.getElementById('ee-bonif').value) || 250,
    fecha_ingreso:document.getElementById('ee-ingreso').value || null,
    avatar:       document.getElementById('ee-avatar').value.trim() || '👤',
    igss:         document.getElementById('ee-igss').checked
  });

  if (!ok) { UI.toast('Error al actualizar', 'error'); return; }
  UI.closeModal();
  UI.toast('Empleado actualizado ✓');
  Pages.rrhh();
};

Pages.desactivarEmpleado = async function (id) {
  UI.confirm('¿Desactivar este empleado? No podrá iniciar sesión ni aparecerá en las listas.', async () => {
    const ok = await DB.updateEmpleado(id, { activo: false });
    if (ok) { UI.closeModal(); UI.toast('Empleado desactivado'); Pages.rrhh(); }
    else UI.toast('Error al desactivar', 'error');
  });
};

Pages.imprimirBoleta = function (id) {
  const emp = (Pages._empleadosData || []).find(e => e.id === id);
  if (!emp) return;

  const mes      = new Date().toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  const igssLab  = ((emp.salario_base||0) * 0.0483).toFixed(2);
  const igssPatr = ((emp.salario_base||0) * 0.1267).toFixed(2);
  const bonif    = emp.bonificacion || 250;
  const liquido  = ((emp.salario_base||0) + bonif - parseFloat(igssLab)).toFixed(2);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Boleta ${emp.nombre}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#000}
    h1{font-size:18px;margin-bottom:4px}
    .subtitle{color:#666;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{background:#f3f4f6;padding:8px;text-align:left;border:1px solid #ddd}
    td{padding:8px;border:1px solid #ddd}
    .total{font-weight:bold;background:#fef3c7}
    .footer{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
    .firma{border-top:1px solid #000;padding-top:8px;text-align:center;margin-top:60px}
    @media print{body{margin:0}}
  </style></head><body>
  <h1>${Auth.tenant?.name || 'TallerPro'}</h1>
  <div class="subtitle">NIT: ${Auth.tenant?.nit||'—'} · ${Auth.tenant?.address||''}</div>
  <h2 style="font-size:14px;border-bottom:2px solid #000;padding-bottom:6px">
    BOLETA DE PAGO — ${mes.toUpperCase()}
  </h2>
  <table>
    <tr><th colspan="2">Datos del Empleado</th></tr>
    <tr><td>Nombre</td><td>${emp.nombre}</td></tr>
    <tr><td>Cargo</td><td>${emp.cargo||'—'}</td></tr>
    <tr><td>NIT</td><td>${emp.nit||'—'}</td></tr>
    <tr><td>Fecha Ingreso</td><td>${emp.fecha_ingreso||'—'}</td></tr>
    <tr><th colspan="2">Ingresos</th></tr>
    <tr><td>Salario Base</td><td>Q${(emp.salario_base||0).toFixed(2)}</td></tr>
    <tr><td>Bonificación Incentivo (MINTRAB)</td><td>Q${bonif.toFixed(2)}</td></tr>
    <tr><th colspan="2">Descuentos</th></tr>
    <tr><td>IGSS Laboral (4.83%)</td><td>-Q${igssLab}</td></tr>
    <tr class="total"><td>LÍQUIDO A RECIBIR</td><td>Q${liquido}</td></tr>
    <tr><th colspan="2">Aporte Patronal</th></tr>
    <tr><td>IGSS Patronal (12.67%)</td><td>Q${igssPatr}</td></tr>
  </table>
  <div class="footer">
    <div><div class="firma">Firma del Empleado</div><div style="text-align:center;margin-top:4px">${emp.nombre}</div></div>
    <div><div class="firma">Autorizado por</div><div style="text-align:center;margin-top:4px">${Auth.user?.nombre||'Administrador'}</div></div>
  </div>
  <div style="margin-top:30px;text-align:center;font-size:10px;color:#999">
    Generado por TallerPro Enterprise · ${new Date().toLocaleDateString('es-GT')}
  </div>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
};

Pages.calcularNomina = async function () {
  const empleados = Pages._empleadosData || await DB.getEmpleados();
  if (empleados.length === 0) { UI.toast('No hay empleados registrados', 'warn'); return; }

  const mes = new Date().toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  let totalSalarios = 0, totalIGSSLab = 0, totalIGSSPatr = 0, totalLiquido = 0;

  const filas = empleados.map(e => {
    const sal    = e.salario_base || 0;
    const bonif  = e.bonificacion || 250;
    const igssL  = sal * 0.0483;
    const igssP  = sal * 0.1267;
    const liq    = sal + bonif - igssL;
    totalSalarios += sal;
    totalIGSSLab  += igssL;
    totalIGSSPatr += igssP;
    totalLiquido  += liq;
    return `<tr>
      <td>${e.nombre}</td><td>${e.cargo||'—'}</td>
      <td class="mono-sm">${UI.q(sal)}</td>
      <td class="mono-sm">${UI.q(bonif)}</td>
      <td class="mono-sm text-red">-${UI.q(igssL)}</td>
      <td class="mono-sm text-green">${UI.q(liq)}</td>
      <td class="mono-sm text-muted">${UI.q(igssP)}</td>
    </tr>`;
  }).join('');

  UI.openModal(`Nómina — ${mes}`, `
    <div class="table-wrap mb-4" style="overflow-x:auto">
      <table class="data-table">
        <thead>
          <tr><th>Empleado</th><th>Cargo</th><th>Salario</th><th>Bonif.</th><th>IGSS Lab.</th><th>Líquido</th><th>IGSS Patr.</th></tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr style="background:var(--surface2);font-weight:700">
            <td colspan="2">TOTALES</td>
            <td class="mono-sm">${UI.q(totalSalarios)}</td>
            <td></td>
            <td class="mono-sm text-red">-${UI.q(totalIGSSLab)}</td>
            <td class="mono-sm text-green">${UI.q(totalLiquido)}</td>
            <td class="mono-sm text-muted">${UI.q(totalIGSSPatr)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-amber" onclick="Pages.imprimirNomina()">🖨️ Imprimir Nómina</button>
    </div>
  `, 'modal-lg');
};

Pages.imprimirNomina = function () {
  UI.closeModal();
  setTimeout(() => window.print(), 300);
};
