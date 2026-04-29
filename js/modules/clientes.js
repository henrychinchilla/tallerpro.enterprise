/* ═══════════════════════════════════════════════════════
   modules/clientes.js — Clientes & Vehículos (Supabase)
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

Pages.clientes = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Clientes & Vehículos</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const [clientes, vehiculos] = await Promise.all([
    DB.getClientes(),
    DB.getVehiculos()
  ]);

  const rows = clientes.map(c => {
    const cvs = vehiculos.filter(v => v.cliente_id === c.id);
    const lastVisit = cvs.map(v => v.ultima_visita).filter(Boolean).sort().pop() || '—';
    return `<tr onclick="Pages.verCliente('${c.id}')">
      <td><b>${c.nombre}</b><br><span class="mono-sm text-muted">${c.email || ''}</span></td>
      <td class="mono-sm">${c.nit || '—'}</td>
      <td>${c.tel || '—'}</td>
      <td>${cvs.map(v => `<span class="badge badge-cyan" style="margin:1px">${v.placa}</span>`).join('') || '—'}</td>
      <td class="mono-sm text-muted">${lastVisit}</td>
      <td onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-ghost" onclick="Pages.verCliente('${c.id}')">Ver</button>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Clientes & Vehículos</h1>
        <p class="page-subtitle">// ${clientes.length} CLIENTES REGISTRADOS</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-amber" onclick="Pages.modalNuevoCliente()">＋ Nuevo Cliente</button>
      </div>
    </div>
    <div class="page-body">
      <div class="search-bar">
        <input class="search-input" placeholder="🔍 Buscar nombre, NIT, placa..."
               id="search-clientes" oninput="Pages.filterClientes()">
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Cliente</th><th>NIT</th><th>Teléfono</th><th>Vehículos</th><th>Última Visita</th><th></th></tr>
          </thead>
          <tbody id="clientes-tbody">
            ${rows || `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">
              Sin clientes registrados. <span class="text-amber" style="cursor:pointer" onclick="Pages.modalNuevoCliente()">Agregar primero →</span>
            </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  /* guardar datos para filtro */
  Pages._clientesData  = clientes;
  Pages._vehiculosData = vehiculos;
};

Pages.filterClientes = function () {
  const q = (document.getElementById('search-clientes')?.value || '').toLowerCase();
  document.querySelectorAll('#clientes-tbody tr').forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

Pages.verCliente = async function (id) {
  const clientes  = Pages._clientesData  || await DB.getClientes();
  const vehiculos = Pages._vehiculosData || await DB.getVehiculos();
  const ordenes   = await DB.getOrdenes();

  const c   = clientes.find(x => x.id === id); if (!c) return;
  const cvs = vehiculos.filter(v => v.cliente_id === c.id);

  const vehiculosHtml = cvs.map(v => {
    const ots = ordenes.filter(o => o.vehiculo_id === v.id);
    return `
      <div class="detail-section" style="margin-bottom:10px">
        <div class="detail-section-header">
          <span>${v.placa} — ${v.marca} ${v.modelo} ${v.anio || ''}</span>
          <span class="badge badge-amber">${(v.kilometraje||0).toLocaleString()} km</span>
        </div>
        <div class="detail-row"><div class="detail-key">Color</div><div class="detail-val">${v.color || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Motor</div><div class="detail-val">${v.motor || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">VIN</div><div class="detail-val mono-sm">${v.vin || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Historial</div><div class="detail-val">${ots.length} OTs registradas</div></div>
      </div>`;
  }).join('') || '<p class="text-muted" style="font-size:13px">Sin vehículos registrados.</p>';

  UI.openModal('Cliente: ' + c.nombre, `
    <div class="flex items-center gap-3 mb-4" style="flex-wrap:wrap">
      <div style="font-size:32px">👤</div>
      <div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:.04em">${c.nombre}</h2>
        <span class="badge badge-cyan">Cliente registrado</span>
      </div>
      <button class="btn btn-amber btn-sm" style="margin-left:auto"
              onclick="UI.closeModal();Pages.modalNuevaOT()">+ Nueva OT</button>
    </div>
    <div class="detail-section mb-4">
      <div class="detail-section-header">Información Personal</div>
      <div class="detail-row"><div class="detail-key">NIT</div><div class="detail-val mono-sm">${c.nit || '—'}</div></div>
      <div class="detail-row"><div class="detail-key">Teléfono</div><div class="detail-val">${c.tel || '—'}</div></div>
      <div class="detail-row"><div class="detail-key">Email</div><div class="detail-val">${c.email || '—'}</div></div>
      <div class="detail-row"><div class="detail-key">Dirección</div><div class="detail-val">${c.direccion || '—'}</div></div>
    </div>
    <div style="font-weight:700;font-size:13px;margin-bottom:10px">🚗 Vehículos Registrados</div>
    ${vehiculosHtml}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-cyan" onclick="UI.toast('Función WhatsApp próximamente','info')">💬 WhatsApp</button>
    </div>
  `, 'modal-lg');
};

Pages.modalNuevoCliente = function () {
  UI.openModal('Nuevo Cliente', `
    <div class="form-group">
      <label class="form-label">Nombre Completo *</label>
      <input class="form-input" id="nc-nombre" placeholder="Juan García Pérez">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">NIT</label>
        <input class="form-input" id="nc-nit" placeholder="1234567-8">
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono *</label>
        <input class="form-input" id="nc-tel" placeholder="5540-1234">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Correo Electrónico</label>
      <input class="form-input" id="nc-email" type="email" placeholder="juan@gmail.com">
    </div>
    <div class="form-group">
      <label class="form-label">Dirección</label>
      <input class="form-input" id="nc-dir" placeholder="Zona 10, Guatemala">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarCliente()">Guardar Cliente</button>
    </div>`
  );
};

Pages.guardarCliente = async function () {
  const nombre = document.getElementById('nc-nombre').value.trim();
  const tel    = document.getElementById('nc-tel').value.trim();
  if (!nombre || !tel) { UI.toast('Nombre y teléfono son obligatorios', 'error'); return; }

  const { data, error } = await DB.insertCliente({
    nombre,
    nit:       document.getElementById('nc-nit').value.trim(),
    tel,
    email:     document.getElementById('nc-email').value.trim(),
    direccion: document.getElementById('nc-dir').value.trim()
  });

  if (error) { UI.toast('Error al guardar: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Cliente guardado exitosamente ✓');
  Pages.clientes();
};
