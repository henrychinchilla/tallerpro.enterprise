/* ═══════════════════════════════════════════════════════
   modules/pages.js — Calendario, FEL, RRHH, Mi OT,
                      Mi Vehículo, Configuración
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

/* ══════════════ CALENDARIO ══════════════ */

Pages.calendario = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Calendario</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const [citas, clientes, vehiculos] = await Promise.all([
    DB.getCitas(),
    DB.getClientes(),
    DB.getVehiculos()
  ]);

  const today     = new Date();
  const year      = today.getFullYear(), month = today.getMonth();
  const firstDay  = new Date(year, month, 1).getDay();
  const daysInM   = new Date(year, month + 1, 0).getDate();
  const todayStr  = today.toISOString().slice(0, 10);
  const MONTHS    = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const citasHoy  = citas.filter(c => c.fecha === todayStr);

  let calDays = '';
  for (let i = 0; i < firstDay; i++) calDays += '<div class="cal-day other-month"></div>';
  for (let d = 1; d <= daysInM; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayCitas = citas.filter(c => c.fecha === ds);
    const isToday  = d === today.getDate();
    calDays += `
      <div class="cal-day${isToday ? ' today' : ''}">
        <div class="cal-day-num">${d}</div>
        ${dayCitas.map(c =>
          `<div class="cal-event ${c.estado === 'confirmada' ? 'green' : 'amber'}">${c.hora} ${(c.servicio||'').slice(0,10)}</div>`
        ).join('')}
      </div>`;
  }

  const proximasRows = citas
    .filter(c => c.fecha >= todayStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
    .map(c => {
      const cl = c.clientes  || clientes.find(x => x.id === c.cliente_id);
      const v  = c.vehiculos || vehiculos.find(x => x.id === c.vehiculo_id);
      return `<tr>
        <td class="mono-sm">${c.fecha}</td>
        <td class="mono-sm text-amber">${c.hora}</td>
        <td>${cl?.nombre || '—'}</td>
        <td class="mono-sm">${v?.placa || '—'}</td>
        <td>${c.servicio || '—'}</td>
        <td>${c.estado === 'confirmada'
          ? '<span class="badge badge-green">Confirmada</span>'
          : '<span class="badge badge-amber">Pendiente</span>'}</td>
      </tr>`;
    }).join('');

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Calendario</h1>
        <p class="page-subtitle">// ${MONTHS[month].toUpperCase()} ${year}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-amber" onclick="Pages.modalNuevaCita()">＋ Nueva Cita</button>
      </div>
    </div>
    <div class="page-body">
      ${citasHoy.length > 0 ? `
      <div class="alert alert-cyan">
        <div class="alert-icon">📅</div>
        <div>
          <div class="alert-title">Citas de Hoy (${citasHoy.length})</div>
          <div class="alert-body">${citasHoy.map(c => {
            const cl = clientes.find(x => x.id === c.cliente_id);
            return `<b>${c.hora}</b> — ${cl?.nombre||'—'}: ${c.servicio}`;
          }).join(' &nbsp;·&nbsp; ')}</div>
        </div>
      </div>` : ''}

      <div class="cal-grid">
        ${['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'].map(d => `<div class="cal-day-name">${d}</div>`).join('')}
        ${calDays}
      </div>

      <div style="margin-top:24px">
        <div style="font-weight:700;font-size:14px;margin-bottom:12px">📋 Próximas Citas</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Placa</th><th>Servicio</th><th>Estado</th></tr></thead>
            <tbody>${proximasRows || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">Sin citas próximas</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  Pages._citasClientes  = clientes;
  Pages._citasVehiculos = vehiculos;
};

Pages.modalNuevaCita = async function () {
  const clientes  = Pages._citasClientes  || await DB.getClientes();
  const vehiculos = Pages._citasVehiculos || await DB.getVehiculos();
  const horas = ['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','13:00','14:00','14:30','15:00','15:30','16:00','16:30'];

  UI.openModal('Nueva Cita', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input class="form-input" id="nc2-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="form-group">
        <label class="form-label">Hora *</label>
        <select class="form-select" id="nc2-hora">${horas.map(h=>`<option>${h}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Cliente</label>
      <select class="form-select" id="nc2-cli">
        <option value="">Seleccionar cliente...</option>
        ${clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Vehículo</label>
      <select class="form-select" id="nc2-veh">
        <option value="">Seleccionar vehículo...</option>
        ${vehiculos.map(v=>`<option value="${v.id}">${v.placa} — ${v.marca} ${v.modelo}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Servicio *</label>
      <input class="form-input" id="nc2-srv" placeholder="Ej: Cambio de aceite y filtros">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarCita()">Agendar Cita</button>
    </div>`
  );
};

Pages.guardarCita = async function () {
  const srv = document.getElementById('nc2-srv').value.trim();
  if (!srv) { UI.toast('El servicio es obligatorio', 'error'); return; }

  const { error } = await DB.insertCita({
    fecha:       document.getElementById('nc2-fecha').value,
    hora:        document.getElementById('nc2-hora').value,
    cliente_id:  document.getElementById('nc2-cli').value || null,
    vehiculo_id: document.getElementById('nc2-veh').value || null,
    servicio:    srv,
    estado:      'pendiente'
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Cita agendada exitosamente ✓');
  Pages.calendario();
};


/* ══════════════ FACTURACIÓN FEL ══════════════ */

Pages.facturacion = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Facturación FEL</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const [facturas, clientes] = await Promise.all([
    DB.getFacturas(),
    DB.getClientes()
  ]);
  const totalCert = facturas.filter(f=>f.estado==='certificada').reduce((s,f)=>s+f.total,0);

  const rows = facturas.map(f => {
    const c   = f.clientes || clientes.find(x => x.id === f.cliente_id);
    const map = {
      certificada: '<span class="badge badge-green">✓ Certificada</span>',
      pendiente:   '<span class="badge badge-amber">⏳ Pendiente</span>',
      borrador:    '<span class="badge badge-gray">Borrador</span>',
      anulada:     '<span class="badge badge-red">Anulada</span>'
    };
    return `<tr>
      <td class="mono-sm text-amber">${f.num}</td>
      <td>${c?.nombre||'—'}<br><span class="mono-sm text-muted">NIT: ${f.nit||'—'}</span></td>
      <td class="mono-sm">${f.fecha}</td>
      <td class="mono-sm">${UI.q(f.subtotal)}</td>
      <td class="mono-sm">${UI.q(f.iva)}</td>
      <td class="mono-sm" style="font-weight:700;color:var(--amber)">${UI.q(f.total)}</td>
      <td>${map[f.estado]||f.estado}</td>
      <td onclick="event.stopPropagation()">
        ${f.estado==='borrador' ? `<button class="btn btn-sm btn-success" onclick="Pages.certificarFEL('${f.id}')">Certificar</button>` : ''}
        ${f.estado==='certificada' ? `<button class="btn btn-sm btn-ghost" onclick="FEL.descargarPDF('${f.id}')">📄 PDF</button> <button class="btn btn-sm btn-danger" onclick="Pages.anularFEL('${f.id}')">Anular</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Facturación FEL</h1>
        <p class="page-subtitle">// SAT GUATEMALA · FACTURA ELECTRÓNICA EN LÍNEA</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-amber" onclick="Pages.modalNuevaFactura()">＋ Nueva Factura</button>
      </div>
    </div>
    <div class="page-body">
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi-card green"><div class="kpi-label">Total Facturado</div><div class="kpi-val green">${UI.q(totalCert)}</div></div>
        <div class="kpi-card amber"><div class="kpi-label">Pendientes FEL</div><div class="kpi-val amber">${facturas.filter(f=>f.estado==='pendiente').length}</div></div>
        <div class="kpi-card cyan"><div class="kpi-label">Certificadas SAT</div><div class="kpi-val cyan">${facturas.filter(f=>f.estado==='certificada').length}</div></div>
      </div>
      <div class="alert alert-amber">
        <div class="alert-icon">🔐</div>
        <div>
          <div class="alert-title">Certificador FEL — ${Auth.tenant?.fel_certificador || 'INFILE'}</div>
          <div class="alert-body">NIT: ${Auth.tenant?.fel_nit || Auth.tenant?.nit || '—'} · Estado: <b style="color:var(--green)">Activo</b></div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Número</th><th>Cliente / NIT</th><th>Fecha</th><th>Subtotal</th><th>IVA 12%</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">Sin facturas registradas</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
};

Pages.certificarFEL = async function (id) {
  UI.toast('Enviando a certificador SAT...', 'info');
  const result = await FEL.certificar(id);
  if (result.ok) {
    const msg = result.simulado
      ? 'Factura certificada ✓ (Sandbox — UUID: ' + result.uuid.slice(0,20) + '...)'
      : 'Factura certificada ✓ UUID: ' + result.uuid;
    UI.toast(msg);
    Pages.facturacion();
  } else {
    UI.toast('Error FEL: ' + result.error, 'error');
  }
};

Pages.anularFEL = async function (id) {
  UI.confirm('¿Seguro que deseas anular esta factura? Esta acción no se puede deshacer.', async () => {
    UI.toast('Anulando factura...', 'info');
    const result = await FEL.anular(id);
    if (result.ok) { UI.toast('Factura anulada ✓'); Pages.facturacion(); }
    else UI.toast('Error: ' + result.error, 'error');
  });
};


/* ══════════════ RRHH & NÓMINA ══════════════ */


/* ══════════════ MIS OTs (MECÁNICO) ══════════════ */

Pages.miOT = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Mis Órdenes</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const ordenes = await DB.getOrdenes();
  const misOTs  = ordenes.filter(o =>
    o.mecanico_id === Auth.user.id &&
    o.estado !== 'entregado' && o.estado !== 'cancelado'
  );

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Mis Órdenes</h1>
        <p class="page-subtitle">// ${misOTs.length} OTs ASIGNADAS</p>
      </div>
    </div>
    <div class="page-body">
      ${misOTs.length === 0 ? `
        <div class="card" style="text-align:center;padding:40px">
          <div style="font-size:32px;margin-bottom:12px">✅</div>
          <div style="font-weight:700;color:var(--text)">Sin órdenes pendientes</div>
        </div>` :
        misOTs.map(o => {
          const v = o.vehiculos;
          return `
          <div class="card card-amber mb-4">
            <div class="flex items-center gap-2 mb-4" style="flex-wrap:wrap">
              <span class="mono-sm text-amber">${o.num}</span>
              ${UI.estadoBadge(o.estado)}
              ${UI.prioDot(o.prioridad)}
            </div>
            <div style="font-size:16px;font-weight:700;margin-bottom:4px">${v?.marca||'—'} ${v?.modelo||''} ${v?.anio||''}</div>
            <div class="mono-sm text-amber" style="margin-bottom:8px">${v?.placa||'—'}</div>
            <div class="text-muted mb-4" style="font-size:13px">${o.descripcion}</div>
            <div class="flex gap-2" style="flex-wrap:wrap">
              ${UI.estadoSelect(o.estado, `Pages.cambiarEstado('${o.id}', this.value);Pages.miOT()`)}
              <button class="btn btn-amber btn-sm" onclick="UI.toast('Cámara activada','info')">📷 Fotos</button>
              <button class="btn btn-cyan btn-sm" onclick="UI.toast('Escaneando QR...','info')">🔍 QR</button>
            </div>
          </div>`;
        }).join('')}
    </div>`;
};


/* ══════════════ MI VEHÍCULO (CLIENTE) ══════════════ */

Pages.miVehiculo = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Mis Vehículos</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const vehiculos = await DB.getVehiculos();
  const ordenes   = await DB.getOrdenes();

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Mis Vehículos</h1>
        <p class="page-subtitle">// Portal de Cliente</p>
      </div>
    </div>
    <div class="page-body">
      <div class="alert alert-green">
        <div class="alert-icon">👋</div>
        <div>
          <div class="alert-title">Bienvenido, ${Auth.user.nombre}</div>
          <div class="alert-body">Consulta el estado de tu vehículo e historial de servicios.</div>
        </div>
      </div>
      ${vehiculos.length === 0 ? `<div class="card" style="text-align:center;padding:32px">
        <div class="text-muted">Sin vehículos registrados. Contacta al taller.</div>
      </div>` :
        vehiculos.map(v => {
          const miOTs  = ordenes.filter(o => o.vehiculo_id === v.id);
          const activa = miOTs.find(o => o.estado !== 'entregado' && o.estado !== 'cancelado');
          return `
          <div class="card card-cyan mb-4">
            <div class="flex items-center gap-3 mb-4">
              <span style="font-size:30px">🚗</span>
              <div>
                <div style="font-size:17px;font-weight:700">${v.marca} ${v.modelo} ${v.anio||''}</div>
                <div class="mono-sm text-amber">${v.placa}</div>
              </div>
            </div>
            <div class="detail-section mb-4">
              <div class="detail-row"><div class="detail-key">Kilometraje</div><div class="detail-val mono-sm">${(v.kilometraje||0).toLocaleString()} km</div></div>
              <div class="detail-row"><div class="detail-key">Color</div><div class="detail-val">${v.color||'—'}</div></div>
              <div class="detail-row"><div class="detail-key">Motor</div><div class="detail-val">${v.motor||'—'}</div></div>
            </div>
            ${activa ? `
            <div class="alert alert-amber">
              <div class="alert-icon">🔧</div>
              <div>
                <div class="alert-title">OT Activa: ${activa.num}</div>
                <div class="alert-body">${activa.descripcion}<br>Estado: ${UI.estadoBadge(activa.estado)}</div>
              </div>
            </div>` : `
            <div class="alert alert-green" style="margin-bottom:0">
              <div class="alert-icon">✅</div>
              <div><div class="alert-title">Sin órdenes activas</div></div>
            </div>`}

            <div style="font-weight:700;font-size:13px;margin:16px 0 10px">📋 Historial</div>
            <div class="ot-timeline">
              ${miOTs.slice(0,5).map(o =>
                `<div class="tl-event">
                  <div class="tl-event-time">${o.fecha_ingreso||''} · ${o.num}</div>
                  <div class="tl-event-text">${o.descripcion} <span class="mono-sm" style="color:var(--amber)">${UI.q(o.total)}</span></div>
                </div>`
              ).join('') || '<div class="text-muted" style="font-size:13px">Sin historial de servicios.</div>'}
            </div>
          </div>`;
        }).join('')}
    </div>`;
};


/* ══════════════ CONFIGURACIÓN ══════════════ */

Pages.config = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Configuración</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const [empleados, t] = await Promise.all([
    DB.getEmpleados(),
    DB.getTenant()
  ]);

  const integraciones = [
    { name: 'INFILE FEL',               icon: '🧾', status: 'Activo',          color: 'green' },
    { name: 'WhatsApp Business (Twilio)',icon: '💬', status: 'No configurado',  color: 'amber' },
    { name: 'SendGrid Email',            icon: '📧', status: 'Activo',          color: 'green' },
    { name: 'CarMD Automotive API',      icon: '🚗', status: 'No configurado',  color: 'gray'  }
  ];

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Configuración</h1>
        <p class="page-subtitle">// Gestión del Taller</p>
      </div>
    </div>
    <div class="page-body">
      <div class="grid-2">
        <!-- Info del taller -->
        <div class="card card-amber">
          <div class="card-sub mb-4">⚙️ Información del Taller</div>
          <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="cfg-nombre" value="${t?.name||''}"></div>
          <div class="form-group"><label class="form-label">NIT</label><input class="form-input" id="cfg-nit" value="${t?.nit||''}"></div>
          <div class="form-group"><label class="form-label">Teléfono</label><input class="form-input" id="cfg-tel" value="${t?.tel||''}"></div>
          <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="cfg-email" value="${t?.email||''}"></div>
          <div class="form-group"><label class="form-label">Dirección</label><input class="form-input" id="cfg-addr" value="${t?.address||''}"></div>
          <button class="btn btn-amber" onclick="Pages.guardarConfig()">Guardar Cambios</button>
        </div>

        <div>
          <!-- Integraciones -->
          <div class="card card-cyan mb-4">
            <div class="card-sub mb-4">🔗 Integraciones</div>
            ${integraciones.map(i => `
            <div class="flex items-center gap-3" style="padding:10px 0;border-bottom:1px solid var(--border)">
              <span>${i.icon}</span>
              <span style="flex:1;font-size:13px">${i.name}</span>
              <span class="badge badge-${i.color}">${i.status}</span>
              <button class="btn btn-sm btn-ghost" onclick="UI.toast('Configurar: ${i.name}','info')">Config.</button>
            </div>`).join('')}
          </div>

          <!-- Usuarios -->
          <div class="card card-purple">
            <div class="card-sub mb-4">👥 Usuarios del Sistema</div>
            ${empleados.map(e => `
            <div class="flex items-center gap-2" style="padding:8px 0;border-bottom:1px solid var(--border)">
              <span>${e.avatar||'👤'}</span>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">${e.nombre}</div>
                <div class="mono-sm text-muted">${ROLES[e.rol]?.label||e.rol}</div>
              </div>
              <span class="badge badge-${ROLES[e.rol]?.color||'gray'}">${e.rol}</span>
            </div>`).join('') || '<div class="text-muted" style="font-size:13px">Sin empleados registrados.</div>'}
            <button class="btn btn-amber btn-sm mt-4"
                    onclick="UI.toast('Invitar usuario disponible con Supabase Auth','info')">
              ＋ Invitar Usuario
            </button>
          </div>
        </div>
      </div>

      <!-- Plan SaaS -->
      <div class="card mt-5">
        <div class="card-sub mb-4">📊 Plan & Suscripción SaaS</div>
        <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="kpi-card"><div class="kpi-label">Plan Actual</div><div class="kpi-val amber" style="font-size:28px">${(t?.plan||'Pro').toUpperCase()}</div></div>
          <div class="kpi-card"><div class="kpi-label">Usuarios</div><div class="kpi-val">${empleados.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Base de Datos</div><div class="kpi-val" style="font-size:28px">Activa</div></div>
          <div class="kpi-card"><div class="kpi-label">Estado</div><div class="kpi-val" style="font-size:22px;color:var(--green)">Online</div></div>
        </div>
        <button class="btn btn-amber mt-4" onclick="UI.toast('Redirigiendo a portal de pagos...','info')">
          ⬆ Actualizar Plan
        </button>
      </div>
    </div>`;
};

Pages.guardarConfig = async function () {
  const ok = await DB.updateTenant({
    name:    document.getElementById('cfg-nombre').value,
    nit:     document.getElementById('cfg-nit').value,
    tel:     document.getElementById('cfg-tel').value,
    email:   document.getElementById('cfg-email').value,
    address: document.getElementById('cfg-addr').value
  });
  if (ok) {
    Auth.tenant = await DB.getTenant();
    App.renderSidebar();
    UI.toast('Configuración guardada ✓');
  } else {
    UI.toast('Error al guardar', 'error');
  }
};

/* ══════════════ NUEVA FACTURA ══════════════ */

Pages.modalNuevaFactura = async function () {
  const [clientes, ordenes] = await Promise.all([
    DB.getClientes(),
    DB.getOrdenes()
  ]);
  const ordenesListas = ordenes.filter(o => o.estado === 'listo' || o.estado === 'entregado');

  UI.openModal('Nueva Factura FEL', `
    <div class="form-group">
      <label class="form-label">Cliente *</label>
      <select class="form-select" id="nf-cliente" onchange="Pages.llenarNITFactura(this)">
        <option value="">Seleccionar cliente...</option>
        ${clientes.map(c => `<option value="${c.id}" data-nit="${c.nit||''}">${c.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">NIT Receptor *</label>
        <input class="form-input" id="nf-nit" placeholder="CF o NIT del cliente">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" id="nf-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Orden de Trabajo (opcional)</label>
      <select class="form-select" id="nf-ot" onchange="Pages.llenarTotalFactura(this)">
        <option value="">Sin OT asociada</option>
        ${ordenesListas.map(o => {
          const v = o.vehiculos;
          return `<option value="${o.id}" data-total="${o.total}" data-cliente="${o.cliente_id}">
            ${o.num} — ${v?.placa||''} ${v?.marca||''} — Q${o.total}
          </option>`;
        }).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <input class="form-input" id="nf-desc" placeholder="Servicios de taller mecánico">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Total (Q) *</label>
        <input class="form-input" id="nf-total" type="number" min="0" step="0.01" placeholder="0.00"
               oninput="Pages.calcularIVA()">
      </div>
      <div class="form-group">
        <label class="form-label">IVA (12%) — calculado</label>
        <input class="form-input" id="nf-iva" readonly placeholder="0.00" style="opacity:.6">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-ghost" onclick="Pages.guardarFactura('borrador')">Guardar Borrador</button>
      <button class="btn btn-amber" onclick="Pages.guardarFactura('pendiente')">Crear y Certificar</button>
    </div>`
  );
};

Pages.llenarNITFactura = function (sel) {
  const nit = sel.options[sel.selectedIndex]?.dataset.nit || '';
  document.getElementById('nf-nit').value = nit || 'CF';
};

Pages.llenarTotalFactura = function (sel) {
  const total = parseFloat(sel.options[sel.selectedIndex]?.dataset.total || 0);
  const cid   = sel.options[sel.selectedIndex]?.dataset.cliente || '';
  document.getElementById('nf-total').value = total.toFixed(2);
  if (cid) document.getElementById('nf-cliente').value = cid;
  Pages.calcularIVA();
};

Pages.calcularIVA = function () {
  const total    = parseFloat(document.getElementById('nf-total').value) || 0;
  const subtotal = total / 1.12;
  const iva      = total - subtotal;
  document.getElementById('nf-iva').value = iva.toFixed(2);
};

Pages.guardarFactura = async function (estadoInicial) {
  const clienteId = document.getElementById('nf-cliente').value;
  const nit       = document.getElementById('nf-nit').value.trim();
  const total     = parseFloat(document.getElementById('nf-total').value) || 0;

  if (!clienteId) { UI.toast('Selecciona un cliente', 'error'); return; }
  if (!nit)       { UI.toast('El NIT es obligatorio (usa CF para consumidor final)', 'error'); return; }
  if (total <= 0) { UI.toast('El total debe ser mayor a 0', 'error'); return; }

  const subtotal = total / 1.12;
  const iva      = total - subtotal;
  const otId     = document.getElementById('nf-ot').value || null;

  const { data, error } = await DB.insertFactura({
    cliente_id:  clienteId,
    ot_id:       otId,
    nit,
    fecha:       document.getElementById('nf-fecha').value,
    descripcion: document.getElementById('nf-desc').value.trim() || 'Servicios de taller mecánico',
    subtotal:    parseFloat(subtotal.toFixed(2)),
    iva:         parseFloat(iva.toFixed(2)),
    total:       parseFloat(total.toFixed(2)),
    estado:      estadoInicial
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

  UI.closeModal();

  if (estadoInicial === 'pendiente' && data?.id) {
    UI.toast('Factura creada. Certificando...', 'info');
    const result = await FEL.certificar(data.id);
    if (result.ok) UI.toast('Factura certificada ✓');
    else UI.toast('Creada pero error FEL: ' + result.error, 'warn');
  } else {
    UI.toast('Factura guardada como borrador ✓');
  }

  Pages.facturacion();
};
