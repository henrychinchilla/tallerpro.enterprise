/* ═══════════════════════════════════════════════════════
   modules/clientes.js — Clientes & Vehículos
   TallerPro Enterprise v2.0

   Mejoras:
   - Empresa vs Persona Individual
   - Eliminar cliente
   - Enviar WhatsApp
   - Filtros avanzados
   - Historial imprimible
   - Agregar vehículo desde el formulario
   - Flota agrupada por cliente
═══════════════════════════════════════════════════════ */

Pages.clientes = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Clientes</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const [clientes, vehiculos] = await Promise.all([
    DB.getClientes(),
    DB.getVehiculos()
  ]);
  Pages._clientesData  = clientes;
  Pages._vehiculosData = vehiculos;

  const rows = clientes.map(c => {
    const cvs      = vehiculos.filter(v => v.cliente_id === c.id);
    const lastVisit = cvs.map(v => v.ultima_visita).filter(Boolean).sort().pop() || '—';
    const esEmpresa = c.tipo === 'empresa';
    return `<tr onclick="Pages.verCliente('${c.id}')"
                data-text="${c.nombre} ${c.nit||''} ${c.email||''} ${c.tel||''} ${c.nombre_empresa||''}"
                data-tipo="${c.tipo||'individual'}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">${esEmpresa ? '🏢' : '👤'}</span>
          <div>
            <b>${esEmpresa && c.nombre_empresa ? c.nombre_empresa : c.nombre}</b>
            ${esEmpresa && c.representante ? `<br><span class="text-muted" style="font-size:11px">Repr: ${c.representante}</span>` : ''}
            <br><span class="mono-sm text-muted">${c.email||''}</span>
          </div>
        </div>
      </td>
      <td><span class="badge ${esEmpresa ? 'badge-purple' : 'badge-cyan'}">${esEmpresa ? 'Empresa' : 'Individual'}</span></td>
      <td class="mono-sm">${c.nit||'—'}</td>
      <td>${c.tel||'—'}</td>
      <td>
        ${cvs.length === 0 ? '<span class="text-muted">—</span>' :
          cvs.length <= 3
            ? cvs.map(v => `<span class="badge badge-amber" style="margin:1px">${v.placa}</span>`).join('')
            : `<span class="badge badge-amber" style="margin:1px">${cvs[0].placa}</span>
               <span class="badge badge-gray" style="margin:1px">+${cvs.length - 1} más</span>`}
      </td>
      <td class="mono-sm text-muted" style="font-size:11px">${lastVisit}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-ghost" onclick="Pages.verCliente('${c.id}')">Ver</button>
          ${c.tel ? `<button class="btn btn-sm btn-success" title="WhatsApp"
            onclick="Pages.enviarWACliente('${c.id}')">💬</button>` : ''}
          <button class="btn btn-sm btn-danger" title="Eliminar"
            onclick="Pages.eliminarCliente('${c.id}', '${(c.nombre_empresa||c.nombre).replace(/'/g,'')}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Clientes</h1>
        <p class="page-subtitle">// ${clientes.length} CLIENTES · ${vehiculos.length} VEHÍCULOS</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="Pages.modalNuevoCliente('empresa')">🏢 Nueva Empresa</button>
        <button class="btn btn-amber" onclick="Pages.modalNuevoCliente('individual')">＋ Nuevo Cliente</button>
      </div>
    </div>
    <div class="page-body">

      <!-- FILTROS -->
      <div class="search-bar">
        <input class="search-input" placeholder="🔍 Buscar nombre, NIT, placa, email..."
               id="search-clientes" oninput="Pages.filterClientes()">
        <select class="filter-select" id="filter-cli-tipo" onchange="Pages.filterClientes()">
          <option value="">Todos</option>
          <option value="individual">👤 Individuales</option>
          <option value="empresa">🏢 Empresas</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="Pages.filterClientes(true)">
          🚗 Ver Flota
        </button>
      </div>

      <!-- TABLA PRINCIPAL -->
      <div class="table-wrap" id="clientes-tabla">
        <table class="data-table">
          <thead>
            <tr><th>Cliente / Empresa</th><th>Tipo</th><th>NIT</th><th>Teléfono</th><th>Vehículos</th><th>Última Visita</th><th>Acciones</th></tr>
          </thead>
          <tbody id="clientes-tbody">
            ${rows || `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">
              Sin clientes.
              <span class="text-amber" style="cursor:pointer" onclick="Pages.modalNuevoCliente('individual')"> Agregar primero →</span>
            </td></tr>`}
          </tbody>
        </table>
      </div>

      <!-- VISTA FLOTA (oculta por defecto) -->
      <div id="clientes-flota" class="hidden">
        <div style="font-weight:700;font-size:14px;margin-bottom:12px">🚗 Vista Flota — Vehículos agrupados por cliente</div>
        ${clientes.filter(c => vehiculos.filter(v => v.cliente_id === c.id).length > 0).map(c => {
          const cvs = vehiculos.filter(v => v.cliente_id === c.id);
          const esEmpresa = c.tipo === 'empresa';
          return `
          <div class="card card-amber mb-4">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <span style="font-size:24px">${esEmpresa ? '🏢' : '👤'}</span>
              <div style="flex:1">
                <div style="font-weight:700;font-size:15px">${esEmpresa && c.nombre_empresa ? c.nombre_empresa : c.nombre}</div>
                <div class="mono-sm text-muted">${c.nit||'—'} · ${c.tel||'—'}</div>
              </div>
              <span class="badge ${esEmpresa?'badge-purple':'badge-cyan'}">${cvs.length} vehículo${cvs.length>1?'s':''}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
              ${cvs.map(v => `
              <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px;cursor:pointer"
                   onclick="App.navigate('vehiculos')">
                <div class="mono-sm text-amber">${v.placa}</div>
                <div style="font-size:12px;font-weight:600;margin-top:2px">${v.marca} ${v.modelo}</div>
                <div class="mono-sm text-muted">${v.anio||'—'} · ${(v.kilometraje||0).toLocaleString()} km</div>
              </div>`).join('')}
            </div>
          </div>`;
        }).join('') || '<p class="text-muted">Sin clientes con vehículos.</p>'}
      </div>

    </div>`;
};

Pages.filterClientes = function (showFlota = false) {
  const tabla = document.getElementById('clientes-tabla');
  const flota = document.getElementById('clientes-flota');

  if (showFlota) {
    tabla?.classList.toggle('hidden');
    flota?.classList.toggle('hidden');
    return;
  }

  const q    = (document.getElementById('search-clientes')?.value || '').toLowerCase();
  const tipo = document.getElementById('filter-cli-tipo')?.value || '';

  document.querySelectorAll('#clientes-tbody tr').forEach(r => {
    const matchText = !q || (r.dataset.text||'').toLowerCase().includes(q);
    const matchTipo = !tipo || r.dataset.tipo === tipo;
    r.style.display = matchText && matchTipo ? '' : 'none';
  });
};

/* ── VER CLIENTE ──────────────────────────────────── */
Pages.verCliente = async function (id) {
  const clientes  = Pages._clientesData  || await DB.getClientes();
  const vehiculos = Pages._vehiculosData || await DB.getVehiculos();
  const ordenes   = await DB.getOrdenes();

  const c   = clientes.find(x => x.id === id); if (!c) return;
  const cvs = vehiculos.filter(v => v.cliente_id === c.id);
  const ots = ordenes.filter(o => o.cliente_id === c.id);
  const esEmpresa = c.tipo === 'empresa';
  const totalFacturado = ots.reduce((s, o) => s + (o.total||0), 0);

  const vehiculosHtml = cvs.map(v => {
    const votos = ots.filter(o => o.vehiculo_id === v.id);
    return `
      <div class="detail-section" style="margin-bottom:10px">
        <div class="detail-section-header">
          <span>🚗 ${v.placa} — ${v.marca} ${v.modelo} ${v.anio||''}</span>
          <div style="display:flex;gap:6px">
            <span class="badge badge-amber">${(v.kilometraje||0).toLocaleString()} km</span>
            <button class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:10px"
                    onclick="Pages.modalNuevaOT('${v.id}')">+ OT</button>
          </div>
        </div>
        <div class="detail-row"><div class="detail-key">Color / Motor</div>
          <div class="detail-val">${v.color||'—'} · ${v.motor||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">VIN</div>
          <div class="detail-val mono-sm" style="font-size:11px">${v.vin||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">OTs</div>
          <div class="detail-val">${votos.length} trabajos realizados</div></div>
      </div>`;
  }).join('') || '<p class="text-muted" style="font-size:13px;padding:8px 0">Sin vehículos registrados.</p>';

  UI.openModal((esEmpresa ? '🏢 ' : '👤 ') + (esEmpresa && c.nombre_empresa ? c.nombre_empresa : c.nombre), `
    <div class="flex items-center gap-3 mb-4" style="flex-wrap:wrap">
      <div style="font-size:32px">${esEmpresa ? '🏢' : '👤'}</div>
      <div style="flex:1">
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:.04em">
          ${esEmpresa && c.nombre_empresa ? c.nombre_empresa : c.nombre}
        </h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
          <span class="badge ${esEmpresa?'badge-purple':'badge-cyan'}">${esEmpresa?'Empresa':'Individual'}</span>
          <span class="badge badge-gray">${cvs.length} vehículo${cvs.length!==1?'s':''}</span>
          <span class="badge badge-amber">${UI.q(totalFacturado)} facturado</span>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        ${c.tel ? `<button class="btn btn-sm btn-success" onclick="Pages.enviarWACliente('${c.id}')">💬 WhatsApp</button>` : ''}
        <button class="btn btn-sm btn-amber" onclick="UI.closeModal();Pages.modalNuevoVehiculo('${c.id}')">+ Vehículo</button>
      </div>
    </div>

    <div class="grid-2 mb-4">
      <div class="detail-section">
        <div class="detail-section-header">Información Personal</div>
        ${esEmpresa ? `
        <div class="detail-row"><div class="detail-key">Empresa</div><div class="detail-val">${c.nombre_empresa||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Representante</div><div class="detail-val">${c.representante||'—'}</div></div>` : ''}
        <div class="detail-row"><div class="detail-key">${esEmpresa?'Contacto':'Nombre'}</div><div class="detail-val">${c.nombre}</div></div>
        <div class="detail-row"><div class="detail-key">NIT</div><div class="detail-val mono-sm">${c.nit||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Teléfono</div><div class="detail-val">${c.tel||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Email</div><div class="detail-val">${c.email||'—'}</div></div>
        <div class="detail-row"><div class="detail-key">Dirección</div><div class="detail-val">${c.direccion||'—'}</div></div>
      </div>
      <div class="detail-section">
        <div class="detail-section-header">Resumen</div>
        <div class="detail-row"><div class="detail-key">Vehículos</div><div class="detail-val">${cvs.length}</div></div>
        <div class="detail-row"><div class="detail-key">Total OTs</div><div class="detail-val">${ots.length}</div></div>
        <div class="detail-row"><div class="detail-key">Total Facturado</div><div class="detail-val mono-sm text-amber">${UI.q(totalFacturado)}</div></div>
        <div class="detail-row"><div class="detail-key">Cliente desde</div><div class="detail-val mono-sm">${c.created_at?.slice(0,10)||'—'}</div></div>
      </div>
    </div>

    <div style="font-weight:700;font-size:13px;margin-bottom:10px">🚗 Vehículos / Flota</div>
    ${vehiculosHtml}

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-ghost" onclick="Pages.imprimirHistorialCliente('${c.id}')">🖨️ Historial</button>
      <button class="btn btn-danger" onclick="Pages.eliminarCliente('${c.id}','${(c.nombre_empresa||c.nombre).replace(/'/g,'')}')">🗑 Eliminar</button>
    </div>
  `, 'modal-lg');
};

/* ── NUEVO CLIENTE ────────────────────────────────── */
Pages.modalNuevoCliente = function (tipo = 'individual') {
  UI.openModal(tipo === 'empresa' ? '🏢 Nueva Empresa' : '👤 Nuevo Cliente', `

    <!-- Selector tipo -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">
      <label id="lbl-individual" style="display:flex;align-items:center;gap:10px;padding:12px;
             background:var(--surface2);border:2px solid ${tipo==='individual'?'var(--amber)':'var(--border)'};
             border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;
             color:${tipo==='individual'?'var(--amber)':'var(--text2)'}">
        <input type="radio" name="nc-tipo" value="individual" ${tipo==='individual'?'checked':''} style="display:none"
               onchange="Pages._toggleTipoCliente('individual')">
        <span style="font-size:20px">👤</span> Persona Individual
      </label>
      <label id="lbl-empresa" style="display:flex;align-items:center;gap:10px;padding:12px;
             background:var(--surface2);border:2px solid ${tipo==='empresa'?'var(--amber)':'var(--border)'};
             border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;
             color:${tipo==='empresa'?'var(--amber)':'var(--text2)'}">
        <input type="radio" name="nc-tipo" value="empresa" ${tipo==='empresa'?'checked':''} style="display:none"
               onchange="Pages._toggleTipoCliente('empresa')">
        <span style="font-size:20px">🏢</span> Empresa / Flota
      </label>
    </div>

    <!-- Campos empresa (visibles solo si empresa) -->
    <div id="nc-campos-empresa" class="${tipo==='individual'?'hidden':''}">
      <div class="form-group">
        <label class="form-label">Nombre de la Empresa *</label>
        <input class="form-input" id="nc-empresa" placeholder="Transportes XYZ S.A.">
      </div>
      <div class="form-group">
        <label class="form-label">Nombre del Representante Legal</label>
        <input class="form-input" id="nc-representante" placeholder="Juan García">
      </div>
    </div>

    <!-- Campos comunes -->
    <div class="form-group">
      <label class="form-label" id="nc-label-nombre">${tipo==='empresa'?'Nombre del Contacto *':'Nombre Completo *'}</label>
      <input class="form-input" id="nc-nombre" placeholder="${tipo==='empresa'?'Contacto principal':'Juan García Pérez'}">
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
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Correo Electrónico</label>
        <input class="form-input" id="nc-email" type="email" placeholder="contacto@empresa.gt">
      </div>
      <div class="form-group">
        <label class="form-label">Dirección</label>
        <input class="form-input" id="nc-dir" placeholder="Zona 10, Guatemala">
      </div>
    </div>

    <!-- Vehículo inicial (opcional) -->
    <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-weight:700;font-size:13px">🚗 Agregar vehículo</span>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="nc-add-vehiculo" onchange="Pages._toggleVehiculoForm()"> Agregar vehículo ahora
        </label>
      </div>
      <div id="nc-vehiculo-form" class="hidden">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Placa *</label>
            <input class="form-input" id="nc-placa" placeholder="P 123 ABC">
          </div>
          <div class="form-group">
            <label class="form-label">Marca *</label>
            <input class="form-input" id="nc-marca" placeholder="Toyota">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Modelo *</label>
            <input class="form-input" id="nc-modelo" placeholder="Hilux">
          </div>
          <div class="form-group">
            <label class="form-label">Año</label>
            <input class="form-input" id="nc-anio" type="number" placeholder="${new Date().getFullYear()}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Color</label>
            <input class="form-input" id="nc-color" placeholder="Blanco">
          </div>
          <div class="form-group">
            <label class="form-label">Kilometraje</label>
            <input class="form-input" id="nc-km" type="number" placeholder="0">
          </div>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarCliente()">Guardar</button>
    </div>`
  );
};

Pages._toggleTipoCliente = function (tipo) {
  const esEmpresa = tipo === 'empresa';
  document.getElementById('nc-campos-empresa')?.classList.toggle('hidden', !esEmpresa);
  document.getElementById('nc-label-nombre').textContent = esEmpresa ? 'Nombre del Contacto *' : 'Nombre Completo *';
  document.getElementById('nc-nombre').placeholder = esEmpresa ? 'Contacto principal' : 'Juan García Pérez';

  ['individual','empresa'].forEach(t => {
    const lbl = document.getElementById('lbl-' + t);
    if (lbl) {
      lbl.style.borderColor = t === tipo ? 'var(--amber)' : 'var(--border)';
      lbl.style.color       = t === tipo ? 'var(--amber)' : 'var(--text2)';
    }
  });
};

Pages._toggleVehiculoForm = function () {
  const checked = document.getElementById('nc-add-vehiculo')?.checked;
  document.getElementById('nc-vehiculo-form')?.classList.toggle('hidden', !checked);
};

Pages.guardarCliente = async function () {
  const tipo   = document.querySelector('input[name="nc-tipo"]:checked')?.value || 'individual';
  const nombre = document.getElementById('nc-nombre').value.trim();
  const tel    = document.getElementById('nc-tel').value.trim();
  if (!nombre || !tel) { UI.toast('Nombre y teléfono son obligatorios', 'error'); return; }

  const { data: cliente, error } = await DB.insertCliente({
    tipo,
    nombre,
    nombre_empresa: tipo === 'empresa' ? (document.getElementById('nc-empresa')?.value.trim() || null) : null,
    representante:  tipo === 'empresa' ? (document.getElementById('nc-representante')?.value.trim() || null) : null,
    nit:       document.getElementById('nc-nit').value.trim() || null,
    tel,
    email:     document.getElementById('nc-email').value.trim() || null,
    direccion: document.getElementById('nc-dir').value.trim() || null
  });
  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

  // Crear vehículo si se marcó
  const addVeh = document.getElementById('nc-add-vehiculo')?.checked;
  if (addVeh && cliente?.id) {
    const placa  = document.getElementById('nc-placa').value.trim().toUpperCase();
    const marca  = document.getElementById('nc-marca').value.trim();
    const modelo = document.getElementById('nc-modelo').value.trim();
    if (placa && marca && modelo) {
      await DB.insertVehiculo({
        cliente_id:  cliente.id,
        placa,
        marca,
        modelo,
        anio:        parseInt(document.getElementById('nc-anio').value) || null,
        color:       document.getElementById('nc-color').value.trim() || null,
        kilometraje: parseInt(document.getElementById('nc-km').value) || 0,
        combustible: 'gasolina'
      });
    }
  }

  UI.closeModal();
  UI.toast('Cliente guardado ✓');
  Pages.clientes();
};

/* ── ELIMINAR CLIENTE ─────────────────────────────── */
Pages.eliminarCliente = function (id, nombre) {
  UI.confirm(`¿Eliminar a <b>${nombre}</b>? Se eliminará su historial de la app. Esta acción no se puede deshacer.`, async () => {
    const { error } = await getSupabase().from('clientes').delete().eq('id', id);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.closeModal();
    UI.toast('Cliente eliminado');
    Pages.clientes();
  });
};

/* ── WHATSAPP CLIENTE ─────────────────────────────── */
Pages.enviarWACliente = async function (id) {
  const clientes  = Pages._clientesData  || await DB.getClientes();
  const vehiculos = Pages._vehiculosData || await DB.getVehiculos();
  const c = clientes.find(x => x.id === id); if (!c) return;
  const cvs = vehiculos.filter(v => v.cliente_id === c.id);

  UI.openModal('💬 Enviar WhatsApp a ' + (c.nombre_empresa||c.nombre), `
    <div class="detail-section mb-4">
      <div class="detail-section-header">Destinatario</div>
      <div class="detail-row"><div class="detail-key">Nombre</div><div class="detail-val">${c.nombre_empresa||c.nombre}</div></div>
      <div class="detail-row"><div class="detail-key">Teléfono</div><div class="detail-val">${c.tel}</div></div>
    </div>
    <div class="form-group">
      <label class="form-label">Plantilla rápida</label>
      <select class="form-select" id="wa-tpl" onchange="Pages._cargarPlantillaWA(this,'${c.nombre_empresa||c.nombre}','${cvs[0]?.placa||''}')">
        <option value="">Mensaje personalizado</option>
        <option value="saludo">Saludo general</option>
        <option value="recordatorio">Recordatorio de servicio</option>
        <option value="listo">Vehículo listo para entrega</option>
        <option value="cita">Invitación a cita</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Mensaje *</label>
      <textarea class="form-input form-textarea" id="wa-msg" rows="6"
        placeholder="Escribe el mensaje...">Hola ${c.nombre}, te contactamos desde ${Auth.tenant?.name}.</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-success" onclick="Pages._enviarWA('${c.tel}')">💬 Enviar WhatsApp</button>
    </div>`
  );
};

Pages._cargarPlantillaWA = function (sel, nombre, placa) {
  const taller = Auth.tenant?.name || 'TallerPro';
  const msgs = {
    saludo:       `Hola ${nombre} 👋\n\nTe saludamos desde *${taller}*.\n¿En qué podemos ayudarte hoy?\n\nEstamos a tu servicio 🔧`,
    recordatorio: `Hola ${nombre} 🚗\n\nTe recordamos que tu vehículo *${placa}* está próximo a necesitar servicio de mantenimiento.\n\n¿Quieres agendar una cita?\n\n_${taller} — ${Auth.tenant?.tel||''}_`,
    listo:        `✅ Hola ${nombre}, \n\n¡Tu vehículo *${placa}* está listo para recoger!\n\nPuedes pasar a nuestras instalaciones en horario de atención.\n\n_${taller}_`,
    cita:         `Hola ${nombre} 📅\n\nTe invitamos a agendar una cita en *${taller}* para el servicio de tu vehículo *${placa}*.\n\nLlámanos o responde este mensaje. ¡Con gusto te atendemos! 😊`
  };
  const msg = document.getElementById('wa-msg');
  if (msg && msgs[sel.value]) msg.value = msgs[sel.value];
};

Pages._enviarWA = async function (tel) {
  const msg = document.getElementById('wa-msg')?.value.trim();
  if (!msg) { UI.toast('Escribe un mensaje', 'error'); return; }
  UI.closeModal();
  const r = await NOTIF.sendWhatsApp(tel, msg);
  if (r.ok) UI.toast(r.simulado ? 'Preview generado (modo dev)' : 'WhatsApp enviado ✓');
  else UI.toast('Error: ' + r.error, 'error');
};

/* ── HISTORIAL IMPRIMIBLE ─────────────────────────── */
Pages.imprimirHistorialCliente = async function (id) {
  const clientes  = Pages._clientesData  || await DB.getClientes();
  const vehiculos = Pages._vehiculosData || await DB.getVehiculos();
  const ordenes   = await DB.getOrdenes();

  const c   = clientes.find(x => x.id === id); if (!c) return;
  const cvs = vehiculos.filter(v => v.cliente_id === c.id);
  const ots = ordenes.filter(o => o.cliente_id === c.id);
  const total = ots.reduce((s, o) => s + (o.total||0), 0);
  const nombre = c.nombre_empresa || c.nombre;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Historial — ${nombre}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#000}
    h1{font-size:18px} h2{font-size:14px;margin-top:20px;border-bottom:1px solid #ddd;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin:10px 0}
    th{background:#f3f4f6;padding:6px 10px;text-align:left;border:1px solid #ddd;font-size:11px}
    td{padding:6px 10px;border:1px solid #ddd;font-size:11px}
    .header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;background:#f3f4f6}
    .total{font-weight:bold;background:#fef3c7}
    @media print{body{margin:0}}
  </style></head><body>
  <div class="header">
    <div><h1>${Auth.tenant?.name}</h1><div style="color:#666">${Auth.tenant?.address||''} · NIT: ${Auth.tenant?.nit||''}</div></div>
    <div style="text-align:right"><div style="font-size:14px;font-weight:bold">Historial de Cliente</div>
    <div style="color:#666">${new Date().toLocaleDateString('es-GT')}</div></div>
  </div>

  <h2>Información del Cliente</h2>
  <table>
    <tr><td><b>Nombre</b></td><td>${nombre}</td><td><b>NIT</b></td><td>${c.nit||'—'}</td></tr>
    <tr><td><b>Teléfono</b></td><td>${c.tel||'—'}</td><td><b>Email</b></td><td>${c.email||'—'}</td></tr>
    <tr><td><b>Dirección</b></td><td colspan="3">${c.direccion||'—'}</td></tr>
  </table>

  <h2>Vehículos (${cvs.length})</h2>
  <table>
    <thead><tr><th>Placa</th><th>Marca / Modelo</th><th>Año</th><th>Color</th><th>Km</th><th>Motor</th></tr></thead>
    <tbody>${cvs.map(v=>`<tr>
      <td>${v.placa}</td><td>${v.marca} ${v.modelo}</td>
      <td>${v.anio||'—'}</td><td>${v.color||'—'}</td>
      <td>${(v.kilometraje||0).toLocaleString()}</td><td>${v.motor||'—'}</td>
    </tr>`).join('')}</tbody>
  </table>

  <h2>Historial de Órdenes de Trabajo (${ots.length})</h2>
  <table>
    <thead><tr><th>OT</th><th>Fecha</th><th>Vehículo</th><th>Descripción</th><th>Estado</th><th>Total</th></tr></thead>
    <tbody>
      ${ots.map(o=>{
        const v = cvs.find(x=>x.id===o.vehiculo_id);
        return`<tr>
          <td>${o.num}</td><td>${o.fecha_ingreso||'—'}</td>
          <td>${v?.placa||'—'}</td><td>${o.descripcion}</td>
          <td>${o.estado}</td><td>Q${(o.total||0).toFixed(2)}</td>
        </tr>`;
      }).join('')}
      <tr class="total"><td colspan="5" style="text-align:right">TOTAL FACTURADO:</td><td>Q${total.toFixed(2)}</td></tr>
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
