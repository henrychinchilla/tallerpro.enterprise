/* ═══════════════════════════════════════════════════════
   modules/vehiculos.js — Gestión de Vehículos
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

Pages.vehiculos = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Vehículos</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const [vehiculos, clientes] = await Promise.all([
    DB.getVehiculos(),
    DB.getClientes()
  ]);

  Pages._vehiculosData = vehiculos;
  Pages._clientesData  = clientes;

  const rows = vehiculos.map(v => {
    const c = v.clientes || clientes.find(x => x.id === v.cliente_id);
    const nombre = c?.nombre || '—';
    return `<tr onclick="Pages.verVehiculo('${v.id}')"
                data-text="${v.placa} ${v.marca} ${v.modelo} ${nombre} ${v.color||''} ${v.motor||''} ${v.combustible||''} ${v.vin||''}"
                data-marca="${v.marca||''}"
                data-comb="${v.combustible||''}">
      <td class="mono-sm text-amber">${v.placa}</td>
      <td><b>${v.marca} ${v.modelo}</b><br>
          <span class="mono-sm text-muted">${v.anio || '—'} · ${v.color || '—'}</span></td>
      <td>${nombre}</td>
      <td class="mono-sm">${(v.kilometraje || 0).toLocaleString()} km</td>
      <td class="mono-sm text-muted">${v.motor || '—'}</td>
      <td class="mono-sm text-muted">${v.ultima_visita || '—'}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          <button class="btn btn-sm btn-cyan"   onclick="Pages.modalEditarVehiculo('${v.id}')" title="Editar">Editar</button>
          <button class="btn btn-sm btn-amber"  onclick="Pages.modalNuevaOT('${v.id}')"        title="Nueva OT">+ OT</button>
          <button class="btn btn-sm btn-ghost"  onclick="Pages.imprimirHistorialVehiculo('${v.id}')" title="Historial">🖨</button>
          <button class="btn btn-sm btn-danger" onclick="Pages.eliminarVehiculo('${v.id}','${v.placa}')" title="Eliminar">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Vehículos</h1>
        <p class="page-subtitle">// ${vehiculos.length} VEHÍCULOS REGISTRADOS</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="Pages.imprimirListaVehiculos()">🖨️ Imprimir</button>
        <button class="btn btn-amber" onclick="Pages.modalNuevoVehiculo()">＋ Nuevo Vehículo</button>
      </div>
    </div>
    <div class="page-body">
      <div class="search-bar">
        <input class="search-input" placeholder="🔍 Buscar placa, marca, modelo, cliente, motor..."
               id="search-vehiculos" oninput="Pages.filterVehiculos()">
        <select class="filter-select" id="filter-veh-marca" onchange="Pages.filterVehiculos()">
          <option value="">Todas las marcas</option>
          ${[...new Set(vehiculos.map(v=>v.marca).filter(Boolean))].sort().map(m=>`<option value="${m}">${m}</option>`).join('')}
        </select>
        <select class="filter-select" id="filter-veh-comb" onchange="Pages.filterVehiculos()">
          <option value="">Todo combustible</option>
          ${[...new Set(vehiculos.map(v=>v.combustible).filter(Boolean))].sort().map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Placa</th><th>Vehículo</th><th>Cliente</th><th>Kilometraje</th><th>Motor</th><th>Última Visita</th><th></th></tr>
          </thead>
          <tbody id="vehiculos-tbody">
            ${rows || `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">
              Sin vehículos registrados.
              <span class="text-amber" style="cursor:pointer" onclick="Pages.modalNuevoVehiculo()"> Agregar primero →</span>
            </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
};

Pages.filterVehiculos = function () {
  const q    = (document.getElementById('search-vehiculos')?.value || '').toLowerCase();
  const marc = document.getElementById('filter-veh-marca')?.value || '';
  const comb = document.getElementById('filter-veh-comb')?.value  || '';
  document.querySelectorAll('#vehiculos-tbody tr').forEach(r => {
    const match = (!q    || (r.dataset.text||'').toLowerCase().includes(q)) &&
                  (!marc || r.dataset.marca === marc) &&
                  (!comb || r.dataset.comb  === comb);
    r.style.display = match ? '' : 'none';
  });
};

Pages.verVehiculo = async function (id) {
  const vehiculos = Pages._vehiculosData || await DB.getVehiculos();
  const clientes  = Pages._clientesData  || await DB.getClientes();
  const ordenes   = await DB.getOrdenes();

  const v = vehiculos.find(x => x.id === id); if (!v) return;
  const c = clientes.find(x => x.id === v.cliente_id);
  const ots = ordenes.filter(o => o.vehiculo_id === v.id);

  UI.openModal('Vehículo: ' + v.placa, `
    <div class="flex items-center gap-3 mb-4">
      <span style="font-size:36px">🚗</span>
      <div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:.04em">
          ${v.marca} ${v.modelo} ${v.anio || ''}
        </h2>
        <span class="badge badge-amber">${v.placa}</span>
      </div>
      <button class="btn btn-amber btn-sm" style="margin-left:auto"
              onclick="UI.closeModal();Pages.modalNuevaOT('${v.id}')">+ Nueva OT</button>
    </div>

    <div class="grid-2 mb-4">
      <div class="detail-section">
        <div class="detail-section-header">Datos del Vehículo</div>
        <div class="detail-row"><div class="detail-key">Placa</div><div class="detail-val mono-sm text-amber">${v.placa}</div></div>
        <div class="detail-row"><div class="detail-key">Marca</div><div class="detail-val">${v.marca}</div></div>
        <div class="detail-row"><div class="detail-key">Modelo</div><div class="detail-val">${v.modelo}</div></div>
        <div class="detail-row"><div class="detail-key">Año</div><div class="detail-val">${v.anio || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Color</div><div class="detail-val">${v.color || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Motor</div><div class="detail-val">${v.motor || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Transmisión</div><div class="detail-val">${v.transmision || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Combustible</div><div class="detail-val">${v.combustible || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">VIN</div><div class="detail-val mono-sm" style="font-size:11px">${v.vin || '—'}</div></div>
      </div>
      <div class="detail-section">
        <div class="detail-section-header">Estado Actual</div>
        <div class="detail-row"><div class="detail-key">Kilometraje</div><div class="detail-val mono-sm text-amber">${(v.kilometraje || 0).toLocaleString()} km</div></div>
        <div class="detail-row"><div class="detail-key">Última Visita</div><div class="detail-val">${v.ultima_visita || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Propietario</div><div class="detail-val">${c?.nombre || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Tel. Propietario</div><div class="detail-val">${c?.tel || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Total OTs</div><div class="detail-val">${ots.length} visitas</div></div>
      </div>
    </div>

    <div style="font-weight:700;font-size:13px;margin-bottom:10px">📋 Historial de Servicios</div>
    <div class="ot-timeline">
      ${ots.slice(0, 6).map(o =>
        `<div class="tl-event">
          <div class="tl-event-time">${o.fecha_ingreso || ''} · ${o.num} · ${UI.estadoBadge(o.estado)}</div>
          <div class="tl-event-text">${o.descripcion}
            <span class="mono-sm text-amber"> ${UI.q(o.total)}</span>
          </div>
        </div>`
      ).join('') || '<div class="text-muted" style="font-size:13px">Sin historial de servicios.</div>'}
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-ghost" onclick="Pages.imprimirHistorialVehiculo('${v.id}')">🖨️ Historial</button>
      <button class="btn btn-ghost" onclick="Pages.modalEditarVehiculo('${v.id}')">✏️ Editar</button>
      <button class="btn btn-danger" onclick="Pages.eliminarVehiculo('${v.id}','${v.placa}')">🗑 Eliminar</button>
      <button class="btn btn-amber" onclick="UI.closeModal();Pages.modalNuevaOT('${v.id}')">+ Nueva OT</button>
    </div>
  `, 'modal-lg');
};

Pages.modalNuevoVehiculo = async function () {
  const clientes = Pages._clientesData || await DB.getClientes();

  UI.openModal('Nuevo Vehículo', `
    <div class="form-group">
      <label class="form-label">Propietario (Cliente) *</label>
      <select class="form-select" id="nv-cliente">
        <option value="">Seleccionar cliente...</option>
        ${clientes.map(c => `<option value="${c.id}">${c.nombre} — ${c.nit || 'Sin NIT'}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Placa *</label>
        <input class="form-input" id="nv-placa" placeholder="P 123 ABC">
      </div>
      <div class="form-group">
        <label class="form-label">VIN / Chasis</label>
        <input class="form-input" id="nv-vin" placeholder="17 caracteres">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Marca *</label>
        <input class="form-input" id="nv-marca" placeholder="Toyota, Nissan, Honda...">
      </div>
      <div class="form-group">
        <label class="form-label">Modelo *</label>
        <input class="form-input" id="nv-modelo" placeholder="Hilux, Frontier, CR-V...">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Año</label>
        <input class="form-input" id="nv-anio" type="number" placeholder="${new Date().getFullYear()}">
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <input class="form-input" id="nv-color" placeholder="Blanco, Negro, Rojo...">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Motor</label>
        <input class="form-input" id="nv-motor" placeholder="2.4L Diesel, 1.5T...">
      </div>
      <div class="form-group">
        <label class="form-label">Transmisión</label>
        <select class="form-select" id="nv-trans">
          <option value="">Seleccionar...</option>
          <option value="Manual">Manual</option>
          <option value="Automática">Automática</option>
          <option value="CVT">CVT</option>
          <option value="Secuencial">Secuencial</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Combustible</label>
        <select class="form-select" id="nv-comb">
          <option value="gasolina">Gasolina</option>
          <option value="diesel">Diesel</option>
          <option value="hibrido">Híbrido</option>
          <option value="electrico">Eléctrico</option>
          <option value="gas">Gas</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Kilometraje Actual</label>
        <input class="form-input" id="nv-km" type="number" placeholder="0">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarVehiculo()">Guardar Vehículo</button>
    </div>`
  );
};

Pages.guardarVehiculo = async function () {
  const clienteId = document.getElementById('nv-cliente').value;
  const placa     = document.getElementById('nv-placa').value.trim().toUpperCase();
  const marca     = document.getElementById('nv-marca').value.trim();
  const modelo    = document.getElementById('nv-modelo').value.trim();

  if (!clienteId) { UI.toast('Selecciona un cliente', 'error'); return; }
  if (!placa)     { UI.toast('La placa es obligatoria', 'error'); return; }
  if (!marca)     { UI.toast('La marca es obligatoria', 'error'); return; }
  if (!modelo)    { UI.toast('El modelo es obligatorio', 'error'); return; }

  const { data, error } = await DB.insertVehiculo({
    cliente_id:   clienteId,
    placa,
    vin:          document.getElementById('nv-vin').value.trim() || null,
    marca,
    modelo,
    anio:         parseInt(document.getElementById('nv-anio').value) || null,
    color:        document.getElementById('nv-color').value.trim() || null,
    motor:        document.getElementById('nv-motor').value.trim() || null,
    transmision:  document.getElementById('nv-trans').value || null,
    combustible:  document.getElementById('nv-comb').value || 'gasolina',
    kilometraje:  parseInt(document.getElementById('nv-km').value) || 0
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Vehículo ' + placa + ' guardado exitosamente ✓');
  Pages.vehiculos();
};

Pages.modalEditarVehiculo = async function (id) {
  const vehiculos = Pages._vehiculosData || await DB.getVehiculos();
  const v = vehiculos.find(x => x.id === id);
  if (!v) return;

  UI.openModal('Editar Vehículo: ' + v.placa, `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Placa</label>
        <input class="form-input" id="ev-placa" value="${v.placa}">
      </div>
      <div class="form-group">
        <label class="form-label">Kilometraje Actual</label>
        <input class="form-input" id="ev-km" type="number" value="${v.kilometraje || 0}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Color</label>
        <input class="form-input" id="ev-color" value="${v.color || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Motor</label>
        <input class="form-input" id="ev-motor" value="${v.motor || ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">VIN / Chasis</label>
      <input class="form-input" id="ev-vin" value="${v.vin || ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-input form-textarea" id="ev-notas" rows="2">${v.notas || ''}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarVehiculo('${id}')">Guardar Cambios</button>
    </div>`
  );
};

Pages.actualizarVehiculo = async function (id) {
  const ok = await DB.updateVehiculo(id, {
    placa:       document.getElementById('ev-placa').value.trim().toUpperCase(),
    kilometraje: parseInt(document.getElementById('ev-km').value) || 0,
    color:       document.getElementById('ev-color').value.trim(),
    motor:       document.getElementById('ev-motor').value.trim(),
    vin:         document.getElementById('ev-vin').value.trim(),
    notas:       document.getElementById('ev-notas').value.trim()
  });

  if (!ok) { UI.toast('Error al actualizar', 'error'); return; }
  UI.closeModal();
  UI.toast('Vehículo actualizado ✓');
  Pages.vehiculos();
};

/* ── ELIMINAR VEHÍCULO ────────────────────────────── */
Pages.eliminarVehiculo = function (id, placa) {
  UI.confirm(`¿Eliminar el vehículo <b>${placa}</b>? Se perderá su historial. Esta acción no se puede deshacer.`, async () => {
    const { error } = await getSupabase().from('vehiculos').delete().eq('id', id);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.closeModal();
    UI.toast('Vehículo ' + placa + ' eliminado');
    Pages.vehiculos();
  });
};

/* ── HISTORIAL IMPRIMIBLE ─────────────────────────── */
Pages.imprimirHistorialVehiculo = async function (id) {
  const vehiculos = Pages._vehiculosData || await DB.getVehiculos();
  const clientes  = Pages._clientesData  || await DB.getClientes();
  const ordenes   = await DB.getOrdenes();

  const v = vehiculos.find(x => x.id === id); if (!v) return;
  const c = clientes.find(x => x.id === v.cliente_id);
  const ots = ordenes.filter(o => o.vehiculo_id === v.id);
  const total = ots.reduce((s, o) => s + (o.total||0), 0);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Historial — ${v.placa}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#000}
    h1{font-size:18px} h2{font-size:14px;margin-top:20px;border-bottom:1px solid #ddd;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin:10px 0}
    th{background:#f3f4f6;padding:6px 10px;text-align:left;border:1px solid #ddd;font-size:11px}
    td{padding:6px 10px;border:1px solid #ddd;font-size:11px}
    .header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px}
    .total{font-weight:bold;background:#fef3c7}
    @media print{body{margin:0}}
  </style></head><body>
  <div class="header">
    <div><h1>${Auth.tenant?.name}</h1><div style="color:#666">${Auth.tenant?.address||''}</div></div>
    <div style="text-align:right"><div style="font-size:16px;font-weight:bold">${v.placa}</div>
    <div style="color:#666">${new Date().toLocaleDateString('es-GT')}</div></div>
  </div>

  <h2>Datos del Vehículo</h2>
  <table>
    <tr><td><b>Placa</b></td><td>${v.placa}</td><td><b>Marca / Modelo</b></td><td>${v.marca} ${v.modelo} ${v.anio||''}</td></tr>
    <tr><td><b>Color</b></td><td>${v.color||'—'}</td><td><b>Motor</b></td><td>${v.motor||'—'}</td></tr>
    <tr><td><b>Transmisión</b></td><td>${v.transmision||'—'}</td><td><b>Combustible</b></td><td>${v.combustible||'—'}</td></tr>
    <tr><td><b>VIN</b></td><td colspan="3">${v.vin||'—'}</td></tr>
    <tr><td><b>Propietario</b></td><td>${c?.nombre||'—'}</td><td><b>Teléfono</b></td><td>${c?.tel||'—'}</td></tr>
    <tr><td><b>Kilometraje actual</b></td><td colspan="3"><b>${(v.kilometraje||0).toLocaleString()} km</b></td></tr>
  </table>

  <h2>Historial de Servicios (${ots.length} OTs)</h2>
  <table>
    <thead><tr><th>OT</th><th>Fecha Ingreso</th><th>Descripción</th><th>Estado</th><th>Total</th></tr></thead>
    <tbody>
      ${ots.map(o=>`<tr>
        <td>${o.num}</td>
        <td>${o.fecha_ingreso||'—'}</td>
        <td>${o.descripcion}</td>
        <td>${o.estado}</td>
        <td>Q${(o.total||0).toFixed(2)}</td>
      </tr>`).join('')}
      <tr class="total">
        <td colspan="4" style="text-align:right">TOTAL ACUMULADO:</td>
        <td>Q${total.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top:30px;text-align:center;font-size:10px;color:#999">
    Generado por TallerPro Enterprise · ${new Date().toLocaleDateString('es-GT')}
  </div>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
};

/* ── IMPRIMIR LISTA DE VEHÍCULOS ──────────────────── */
Pages.imprimirListaVehiculos = async function () {
  const vehiculos = Pages._vehiculosData || await DB.getVehiculos();
  const clientes  = Pages._clientesData  || await DB.getClientes();

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Vehículos</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#000}
    table{width:100%;border-collapse:collapse;margin:10px 0}
    th{background:#f3f4f6;padding:5px 8px;border:1px solid #ddd;text-align:left;font-size:10px}
    td{padding:5px 8px;border:1px solid #ddd}
    .header{border-bottom:2px solid #000;margin-bottom:12px;padding-bottom:6px;display:flex;justify-content:space-between}
    @media print{body{margin:0}}
  </style></head><body>
  <div class="header">
    <div><b>${Auth.tenant?.name} — Listado de Vehículos</b></div>
    <div>${new Date().toLocaleDateString('es-GT')} · ${vehiculos.length} vehículos</div>
  </div>
  <table>
    <thead><tr><th>Placa</th><th>Marca / Modelo</th><th>Año</th><th>Color</th><th>Motor</th><th>Combustible</th><th>Km</th><th>Cliente</th><th>VIN</th></tr></thead>
    <tbody>
      ${vehiculos.map(v => {
        const c = clientes.find(x => x.id === v.cliente_id);
        return `<tr>
          <td><b>${v.placa}</b></td>
          <td>${v.marca} ${v.modelo}</td>
          <td>${v.anio||'—'}</td>
          <td>${v.color||'—'}</td>
          <td>${v.motor||'—'}</td>
          <td>${v.combustible||'—'}</td>
          <td>${(v.kilometraje||0).toLocaleString()}</td>
          <td>${c?.nombre||'—'}</td>
          <td style="font-size:9px">${v.vin||'—'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
};
