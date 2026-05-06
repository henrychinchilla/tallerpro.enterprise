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

  const [citas, clientes, vehiculos, ordenes] = await Promise.all([
    DB.getCitas(), DB.getClientes(), DB.getVehiculos(), DB.getOrdenes()
  ]);

  // Agregar OTs con fecha estimada como eventos
  const hoy = new Date().toISOString().slice(0, 10);
  const otsConFecha = ordenes.filter(o =>
    o.fecha_estimada && o.estado !== 'entregado' && o.estado !== 'cancelado'
  );

  const today = new Date();
  const year  = today.getFullYear(), month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInM  = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toISOString().slice(0, 10);
  const MONTHS   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const citasHoy    = citas.filter(c => c.fecha === todayStr && !c.completada);
  const citasFuturas= citas.filter(c => c.fecha > todayStr && !c.completada);

  let calDays = '';
  for (let i = 0; i < firstDay; i++) calDays += '<div class="cal-day other-month"></div>';
  for (let d = 1; d <= daysInM; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayCitas = citas.filter(c => c.fecha === ds);
    const dayOTs   = otsConFecha.filter(o => o.fecha_estimada === ds);
    const isToday  = d === today.getDate();
    calDays += `
      <div class="cal-day${isToday ? ' today' : ''}">
        <div class="cal-day-num">${d}</div>
        ${dayCitas.map(c =>
          `<div class="cal-event ${c.completada?'':'c.estado === "confirmada" ? "green" : "amber"'}"
               onclick="Pages.modalCitaDetalle('${c.id}')" style="cursor:pointer">
            ${c.hora} ${(c.servicio||'').slice(0,10)}${c.completada?' ✓':''}
          </div>`
        ).join('')}
        ${dayOTs.map(o =>
          `<div class="cal-event" style="background:var(--purple-dim);border-color:var(--purple-border);color:var(--purple);cursor:pointer"
               onclick="Pages.verOT('${o.id}')">
            🔧 ${o.num?.slice(-4)||''} Entrega
          </div>`
        ).join('')}
      </div>`;
  }

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Calendario</h1>
        <p class="page-subtitle">// ${MONTHS[month].toUpperCase()} ${year}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="Pages.notificarCitasHoy()">🔔 Notificar Hoy</button>
        <button class="btn btn-amber" onclick="Pages.modalNuevaCita()">＋ Nueva Cita</button>
      </div>
    </div>
    <div class="page-body">

      ${citasHoy.length > 0 ? `
      <div class="alert alert-cyan">
        <div class="alert-icon">📅</div>
        <div style="flex:1">
          <div class="alert-title">Citas de Hoy (${citasHoy.length})</div>
          <div class="alert-body">${citasHoy.map(c => {
            const cl = clientes.find(x => x.id === c.cliente_id);
            return `<b>${c.hora}</b> — ${cl?.nombre||'—'}: ${c.servicio}`;
          }).join(' &nbsp;·&nbsp; ')}</div>
        </div>
        <button class="btn btn-sm btn-cyan" onclick="Pages.notificarCitasHoy()">💬 Notificar</button>
      </div>` : ''}

      ${citasFuturas.length > 0 ? `
      <div class="alert alert-amber" style="margin-bottom:14px">
        <div class="alert-icon">⏰</div>
        <div>
          <div class="alert-title">${citasFuturas.length} cita${citasFuturas.length>1?'s':''} próxima${citasFuturas.length>1?'s':''}</div>
          <div class="alert-body">La más próxima: ${citasFuturas[0].fecha} ${citasFuturas[0].hora} — ${citasFuturas[0].servicio}</div>
        </div>
      </div>` : ''}

      <div class="cal-grid">
        ${['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'].map(d => `<div class="cal-day-name">${d}</div>`).join('')}
        ${calDays}
      </div>

      <div class="grid-2 mt-5">
        <!-- Próximas citas -->
        <div>
          <div style="font-weight:700;font-size:14px;margin-bottom:12px">📋 Próximas Citas</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                ${[...citas].sort((a,b) => a.fecha.localeCompare(b.fecha)||a.hora.localeCompare(b.hora))
                  .filter(c => c.fecha >= todayStr).slice(0, 8).map(c => {
                    const cl = c.clientes || clientes.find(x => x.id === c.cliente_id);
                    return `<tr>
                      <td class="mono-sm">${c.fecha}</td>
                      <td class="mono-sm text-amber">${c.hora}</td>
                      <td>${cl?.nombre||'—'}</td>
                      <td style="font-size:12px">${c.servicio||'—'}</td>
                      <td>${c.completada
                        ? '<span class="badge badge-green">✓ Completada</span>'
                        : c.estado==='confirmada'
                          ? '<span class="badge badge-green">Confirmada</span>'
                          : '<span class="badge badge-amber">Pendiente</span>'}</td>
                      <td onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-ghost" onclick="Pages.modalCitaDetalle('${c.id}')">⋯</button>
                      </td>
                    </tr>`;
                  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px">Sin citas próximas</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- OTs con fecha estimada -->
        <div>
          <div style="font-weight:700;font-size:14px;margin-bottom:12px">🔧 OTs con Fecha de Entrega</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>OT</th><th>Vehículo</th><th>Entrega</th><th>Estado</th></tr></thead>
              <tbody>
                ${otsConFecha.sort((a,b) => a.fecha_estimada.localeCompare(b.fecha_estimada)).slice(0,8).map(o => {
                  const v = o.vehiculos;
                  const vencida = o.fecha_estimada < hoy;
                  return `<tr onclick="Pages.verOT('${o.id}')">
                    <td class="mono-sm text-amber">${o.num}</td>
                    <td class="mono-sm">${v?.placa||'—'}</td>
                    <td class="mono-sm ${vencida?'text-red':''}">${o.fecha_estimada}${vencida?' ⚠️':''}</td>
                    <td>${UI.estadoBadge(o.estado)}</td>
                  </tr>`;
                }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">Sin OTs programadas</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  Pages._calCitas     = citas;
  Pages._calClientes  = clientes;
  Pages._calVehiculos = vehiculos;
};

/* ── DETALLE DE CITA ──────────────────────────────── */
Pages.modalCitaDetalle = async function (id) {
  const citas    = Pages._calCitas    || await DB.getCitas();
  const clientes = Pages._calClientes || await DB.getClientes();
  const vehiculos= Pages._calVehiculos|| await DB.getVehiculos();
  const c = citas.find(x => x.id === id); if (!c) return;
  const cl = c.clientes || clientes.find(x => x.id === c.cliente_id);
  const v  = c.vehiculos|| vehiculos.find(x => x.id === c.vehiculo_id);

  UI.openModal('Cita: ' + c.servicio, `
    <div class="detail-section mb-4">
      <div class="detail-section-header">Detalles</div>
      <div class="detail-row"><div class="detail-key">Fecha</div><div class="detail-val mono-sm">${c.fecha}</div></div>
      <div class="detail-row"><div class="detail-key">Hora</div><div class="detail-val mono-sm text-amber">${c.hora}</div></div>
      <div class="detail-row"><div class="detail-key">Cliente</div><div class="detail-val">${cl?.nombre||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Vehículo</div><div class="detail-val">${v?.placa||'—'} ${v?.marca||''} ${v?.modelo||''}</div></div>
      <div class="detail-row"><div class="detail-key">Servicio</div><div class="detail-val">${c.servicio||'—'}</div></div>
      <div class="detail-row"><div class="detail-key">Estado</div><div class="detail-val">${c.completada?'<span class="badge badge-green">✓ Completada</span>':c.estado==='confirmada'?'<span class="badge badge-green">Confirmada</span>':'<span class="badge badge-amber">Pendiente</span>'}</div></div>
      ${c.email_invitado ? `<div class="detail-row"><div class="detail-key">Email invitado</div><div class="detail-val">${c.email_invitado}</div></div>` : ''}
    </div>

    <!-- Reprogramar -->
    <div class="card" style="margin-bottom:12px;padding:14px">
      <div class="card-sub mb-3">📅 Reprogramar</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nueva Fecha</label>
          <input class="form-input" id="rep-fecha" type="date" value="${c.fecha}">
        </div>
        <div class="form-group">
          <label class="form-label">Nueva Hora</label>
          <select class="form-select" id="rep-hora">
            ${['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
               '12:00','13:00','14:00','14:30','15:00','15:30','16:00','16:30'].map(h =>
              `<option ${c.hora===h?'selected':''}>${h}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email para notificar reprogramación</label>
        <input class="form-input" id="rep-email" value="${c.email_invitado||cl?.email||''}"
               placeholder="invitado@email.com">
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-danger btn-sm" onclick="Pages.eliminarCita('${c.id}')">🗑 Eliminar</button>
      ${cl?.tel ? `<button class="btn btn-success btn-sm" onclick="Pages.notificarCita('${c.id}')">💬 WhatsApp</button>` : ''}
      <button class="btn btn-cyan btn-sm" onclick="Pages.reprogramarCita('${c.id}')">📅 Reprogramar</button>
      ${!c.completada ? `<button class="btn btn-amber" onclick="Pages.completarCita('${c.id}')">✓ Marcar Completada</button>` : ''}
    </div>`
  );
};

Pages.completarCita = async function (id) {
  const ok = await DB.updateCita(id, { completada: true, estado: 'completada' });
  if (ok) { UI.closeModal(); UI.toast('Cita marcada como completada ✓'); Pages.calendario(); }
  else UI.toast('Error al actualizar', 'error');
};

Pages.reprogramarCita = async function (id) {
  const fecha = document.getElementById('rep-fecha')?.value;
  const hora  = document.getElementById('rep-hora')?.value;
  const email = document.getElementById('rep-email')?.value.trim();
  if (!fecha || !hora) { UI.toast('Selecciona fecha y hora', 'error'); return; }

  const ok = await DB.updateCita(id, { fecha, hora, email_invitado: email||null });
  if (!ok) { UI.toast('Error al reprogramar', 'error'); return; }

  // Notificar por email si hay
  if (email) {
    const asunto = `Cita Reprogramada — ${Auth.tenant?.name}`;
    const body   = `<h2>Tu cita ha sido reprogramada</h2>
      <p>Nueva fecha: <b>${fecha}</b><br>Nueva hora: <b>${hora}</b></p>
      <p>Si tienes alguna pregunta contáctanos.<br><b>${Auth.tenant?.name}</b></p>`;
    await NOTIF.sendEmail(email, asunto, body);
    UI.toast('Cita reprogramada y email enviado ✓');
  } else {
    UI.toast('Cita reprogramada ✓');
  }
  UI.closeModal();
  Pages.calendario();
};

Pages.eliminarCita = async function (id) {
  const ok = await DB.deleteCita(id);
  if (ok) { UI.closeModal(); UI.toast('Cita eliminada'); Pages.calendario(); }
  else UI.toast('Error al eliminar', 'error');
};

Pages.notificarCita = async function (id) {
  const citas    = Pages._calCitas    || [];
  const clientes = Pages._calClientes || [];
  const vehiculos= Pages._calVehiculos|| [];
  const c  = citas.find(x => x.id === id); if (!c) return;
  const cl = clientes.find(x => x.id === c.cliente_id);
  const v  = vehiculos.find(x => x.id === c.vehiculo_id);
  await NOTIF.notificarCitaConfirmada(c, cl, v);
};

Pages.notificarCitasHoy = async function () {
  const citas    = Pages._calCitas    || [];
  const clientes = Pages._calClientes || [];
  const vehiculos= Pages._calVehiculos|| [];
  const hoy = new Date().toISOString().slice(0, 10);
  const citasHoy = citas.filter(c => c.fecha === hoy && !c.completada);
  if (citasHoy.length === 0) { UI.toast('Sin citas pendientes hoy', 'info'); return; }

  let enviadas = 0;
  for (const c of citasHoy) {
    const cl = clientes.find(x => x.id === c.cliente_id);
    const v  = vehiculos.find(x => x.id === c.vehiculo_id);
    if (cl) { await NOTIF.notificarCitaConfirmada(c, cl, v); enviadas++; }
  }
  UI.toast(`${enviadas} notificaciones enviadas ✓`);
};

Pages.modalNuevaCita = async function () {
  const clientes  = Pages._calClientes  || await DB.getClientes();
  const vehiculos = Pages._calVehiculos || await DB.getVehiculos();
  const horas = ['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30',
                  '11:00','11:30','12:00','13:00','14:00','14:30','15:00','15:30','16:00','16:30'];

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
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente</label>
        <select class="form-select" id="nc2-cli">
          <option value="">Seleccionar...</option>
          ${clientes.map(c=>`<option value="${c.id}">${c.nombre_empresa||c.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Vehículo</label>
        <select class="form-select" id="nc2-veh">
          <option value="">Seleccionar...</option>
          ${vehiculos.map(v=>`<option value="${v.id}">${v.placa} — ${v.marca} ${v.modelo}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Servicio *</label>
      <input class="form-input" id="nc2-srv" placeholder="Cambio de aceite, revisión general...">
    </div>
    <div class="form-group">
      <label class="form-label">Email para notificar (opcional)</label>
      <input class="form-input" id="nc2-email" type="email" placeholder="cliente@gmail.com">
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

  const cliId = document.getElementById('nc2-cli').value;
  const vehId = document.getElementById('nc2-veh').value;
  const email = document.getElementById('nc2-email')?.value.trim();

  const { data, error } = await DB.insertCita({
    fecha:            document.getElementById('nc2-fecha').value,
    hora:             document.getElementById('nc2-hora').value,
    cliente_id:       cliId || null,
    vehiculo_id:      vehId || null,
    servicio:         srv,
    estado:           'pendiente',
    email_invitado:   email || null
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Cita agendada ✓');

  // Notificar al cliente
  try {
    const clientes  = Pages._calClientes  || await DB.getClientes();
    const vehiculos = Pages._calVehiculos || await DB.getVehiculos();
    const cl = clientes.find(x => x.id === cliId);
    const v  = vehiculos.find(x => x.id === vehId);
    if (cl) await NOTIF.notificarCitaConfirmada(data, cl, v);
    if (email) {
      await NOTIF.sendEmail(email,
        `Cita confirmada — ${Auth.tenant?.name}`,
        `<h2>Cita Confirmada</h2><p>Fecha: <b>${data.fecha}</b> Hora: <b>${data.hora}</b></p>
         <p>Servicio: ${srv}</p><p>${Auth.tenant?.name}</p>`
      );
    }
  } catch(e) { console.warn('Notif error:', e); }

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
    // Notificar factura al cliente
    try {
      const facturas = await DB.getFacturas();
      const f = facturas.find(x => x.id === id);
      const clientes = await DB.getClientes();
      const c = clientes.find(x => x.id === f?.cliente_id);
      if (f && c) await NOTIF.notificarFacturaLista(f, c);
    } catch(e) { console.warn('Notif error:', e); }

    const msg = result.simulado ? 'Factura certificada ✓ (Sandbox)' : 'Factura certificada ✓ UUID: ' + result.uuid;
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
  el.innerHTML = '<div class="page-header"><h1 class="page-title">Configuración</h1></div><div class="page-body"><div class="text-muted">Cargando...</div></div>';

  const t = await DB.getTenant();
  const logo = Auth.tenant?.logo_base64 || t?.logo_base64 || null;

  el.innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">⚙️ Configuración</h1>
      <p class="page-subtitle">// ${Auth.tenant?.name || t?.name || 'TallerPro'}</p></div>
    </div>
    <div class="page-body">
      <div class="grid-2">

        <!-- INFO DEL TALLER -->
        <div class="card card-amber">
          <div class="card-sub mb-4">🏪 Información del Taller</div>

          <!-- Logo -->
          <div class="form-group">
            <label class="form-label">Logo (PNG/JPG máx. 500KB)</label>
            ${logo ? '<img src="' + logo + '" style="height:56px;object-fit:contain;border:1px solid var(--border);border-radius:6px;padding:6px;background:#fff;margin-bottom:8px;display:block">' : ''}
            <input type="file" id="cfg-logo-file" accept="image/png,image/jpeg,image/webp"
                   class="form-input" onchange="Pages._onLogoChange(this)">
          </div>

          <div class="form-group"><label class="form-label">Nombre *</label>
            <input class="form-input" id="cfg-nombre" value="${t?.name||''}"></div>
          <div class="form-group"><label class="form-label">NIT</label>
            <input class="form-input" id="cfg-nit" value="${t?.nit||''}"></div>
          <div class="form-group"><label class="form-label">Teléfono</label>
            <input class="form-input" id="cfg-tel" value="${t?.tel||''}"></div>
          <div class="form-group"><label class="form-label">Email</label>
            <input class="form-input" id="cfg-email" value="${t?.email||''}"></div>
          <div class="form-group"><label class="form-label">Dirección</label>
            <input class="form-input" id="cfg-addr" value="${t?.address||''}"></div>
          <button class="btn btn-amber" onclick="Pages.guardarConfig()">Guardar Cambios</button>
        </div>

        <!-- USUARIOS Y GESTIÓN -->
        <div>
          <div class="card card-purple mb-4">
            <div class="card-sub mb-3">👥 Usuarios del Sistema</div>
            <p style="font-size:13px;color:var(--text2);margin-bottom:14px">
              Gestiona accesos, roles e invitaciones al sistema.
            </p>
            <button class="btn btn-cyan" style="width:100%" onclick="Pages.modalGestionUsuarios()">
              👥 Gestionar Usuarios
            </button>
          </div>

          <div class="card card-cyan">
            <div class="card-sub mb-3">🔗 Integraciones Activas</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                <span style="font-size:13px">🧾 INFILE FEL</span>
                <span class="badge badge-green">Activo</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                <span style="font-size:13px">💬 WhatsApp / CallMeBot</span>
                <button class="btn btn-sm btn-ghost" onclick="App.navigate('comunicaciones')">Configurar</button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
                <span style="font-size:13px">📧 Email / SMTP</span>
                <button class="btn btn-sm btn-ghost" onclick="App.navigate('comunicaciones')">Configurar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
};


Pages.guardarConfig = async function () {
  const fields = {
    name:    document.getElementById('cfg-nombre').value,
    nit:     document.getElementById('cfg-nit').value,
    tel:     document.getElementById('cfg-tel').value,
    email:   document.getElementById('cfg-email').value,
    address: document.getElementById('cfg-addr').value
  };
  if (Pages._logoBase64) fields.logo_base64 = Pages._logoBase64;

  const ok = await DB.updateTenant(fields);
  if (ok) {
    Auth.tenant = await DB.getTenant();
    App.renderSidebar();
    Pages._logoBase64 = null;
    UI.toast('Configuración guardada ✓');
  } else {
    UI.toast('Error al guardar', 'error');
  }
};

/* ══════════════ NUEVA FACTURA ══════════════ */

Pages.modalNuevaFactura = async function () {
  const [clientes, ordenes, config] = await Promise.all([
    DB.getClientes(),
    DB.getOrdenes(),
    DB.getConfigFiscal()
  ]);
  const ordenesListas = ordenes.filter(o => o.estado === 'listo' || o.estado === 'entregado');
  Pages._factConfig = config;

  UI.openModal('Nueva Factura FEL', `
    <!-- CLIENTE Y FECHA -->
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cliente *</label>
        <select class="form-select" id="nf-cliente" onchange="Pages.llenarNITFactura(this)">
          <option value="">Seleccionar cliente...</option>
          ${clientes.map(c => `<option value="${c.id}" data-nit="${c.nit||''}">${c.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" id="nf-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>

    <!-- NIT Y OT -->
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">NIT Receptor *</label>
        <input class="form-input" id="nf-nit" placeholder="CF o NIT del cliente">
      </div>
      <div class="form-group">
        <label class="form-label">Orden de Trabajo</label>
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
    </div>

    <!-- DESCRIPCIÓN Y MONTO -->
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <input class="form-input" id="nf-desc" placeholder="Servicios de taller mecánico">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Total a Cobrar (Q) *</label>
        <input class="form-input" id="nf-total" type="number" min="0" step="0.01" placeholder="0.00"
               oninput="Pages.calcularIVA()">
      </div>
      <div class="form-group">
        <label class="form-label">IVA incluido — calculado</label>
        <input class="form-input" id="nf-iva" readonly placeholder="0.00" style="opacity:.6">
      </div>
    </div>

    <!-- MÉTODO DE PAGO -->
    <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px">
      <div style="font-weight:700;font-size:12px;color:var(--text2);letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px">
        💳 Forma de Pago
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
        ${[
          {v:'efectivo',          icon:'💵', label:'Efectivo'},
          {v:'tarjeta_debito',    icon:'💳', label:'Débito'},
          {v:'tarjeta_credito',   icon:'💳', label:'Crédito'},
          {v:'cheque',            icon:'🗒️', label:'Cheque'},
          {v:'transferencia',     icon:'🏦', label:'Transferencia'},
          {v:'credito_cliente',   icon:'📋', label:'Crédito (CxC)'}
        ].map(m => `
          <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;
                 background:var(--surface2);border:1px solid var(--border);border-radius:6px;
                 cursor:pointer;font-size:13px;transition:border-color .2s"
                 onclick="Pages.seleccionarMetodoPago('${m.v}', this)">
            <input type="radio" name="nf-metodo" value="${m.v}" style="display:none">
            <span>${m.icon}</span> ${m.label}
          </label>`).join('')}
      </div>
    </div>

    <!-- CAMPOS TARJETA (ocultos por defecto) -->
    <div id="nf-campos-tarjeta" class="hidden">
      <div class="card" style="padding:14px;margin-bottom:14px;border-color:var(--cyan-border)">
        <div class="card-sub mb-3">Detalles de Pago con Tarjeta</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Franquicia</label>
            <select class="form-select" id="nf-franquicia">
              <option value="visa">Visa</option>
              <option value="mastercard">Mastercard</option>
              <option value="amex">American Express</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Proveedor POS</label>
            <select class="form-select" id="nf-pos" onchange="Pages.autoComisionPOS()">
              <option value="visanet">Visanet</option>
              <option value="credomatic">BAC Credomatic</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cuotas</label>
            <select class="form-select" id="nf-cuotas">
              <option value="1">Contado (1 cuota)</option>
              <option value="3">3 cuotas</option>
              <option value="6">6 cuotas</option>
              <option value="10">10 cuotas</option>
              <option value="12">12 cuotas</option>
              <option value="18">18 cuotas</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">No. Autorización</label>
            <input class="form-input" id="nf-autorizacion" placeholder="123456">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Comisión POS (%)</label>
            <input class="form-input" id="nf-comision" type="number" step="0.01" value="3.00"
                   oninput="Pages.calcularNetoTarjeta()">
          </div>
          <div class="form-group">
            <label class="form-label">Últimos 4 dígitos tarjeta</label>
            <input class="form-input" id="nf-digitos" placeholder="1234" maxlength="4">
          </div>
        </div>
        <!-- Resumen neto -->
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:12px">
          <div class="flex items-center justify-between mb-2">
            <span class="text-muted" style="font-size:12px">Monto bruto</span>
            <span class="mono-sm" id="nf-bruto">Q0.00</span>
          </div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-muted" style="font-size:12px">Comisión POS</span>
            <span class="mono-sm text-red" id="nf-comision-monto">-Q0.00</span>
          </div>
          <div class="flex items-center justify-between" style="border-top:1px solid var(--border);padding-top:8px">
            <span style="font-weight:700;font-size:12px">Ingreso neto al taller</span>
            <span class="mono-sm text-green" id="nf-neto">Q0.00</span>
          </div>
        </div>
        <div class="alert alert-cyan" style="margin-top:10px;margin-bottom:0">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:11px">
            Las cuotas son financiadas por el banco. El taller recibe el monto completo menos la comisión.
            La comisión se registra como egreso automáticamente.
          </div>
        </div>
      </div>
    </div>

    <!-- CAMPOS CHEQUE (ocultos) -->
    <div id="nf-campos-cheque" class="hidden">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Banco</label>
          <input class="form-input" id="nf-banco" placeholder="Banco Industrial, G&T Continental...">
        </div>
        <div class="form-group">
          <label class="form-label">No. de Cheque</label>
          <input class="form-input" id="nf-cheque-num" placeholder="0001234">
        </div>
      </div>
    </div>

    <!-- REFERENCIA -->
    <div class="form-group">
      <label class="form-label">Referencia / Notas adicionales</label>
      <input class="form-input" id="nf-ref" placeholder="Observaciones del pago...">
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-ghost" onclick="Pages.guardarFactura('borrador')">Guardar Borrador</button>
      <button class="btn btn-amber" onclick="Pages.guardarFactura('certificar')">Facturar y Certificar</button>
    </div>`
  , 'modal-lg');

  // Seleccionar efectivo por defecto
  const defaultLabel = document.querySelector('label[onclick*="efectivo"]');
  if (defaultLabel) Pages.seleccionarMetodoPago('efectivo', defaultLabel);
};

Pages.seleccionarMetodoPago = function (metodo, label) {
  // Reset all
  document.querySelectorAll('label[onclick*="seleccionarMetodoPago"]').forEach(l => {
    l.style.borderColor = 'var(--border)';
    l.style.color = 'var(--text2)';
    l.style.background = 'var(--surface2)';
  });
  // Highlight selected
  if (label) {
    label.style.borderColor = 'var(--amber)';
    label.style.color = 'var(--amber)';
    label.style.background = 'var(--amber-dim)';
  }
  // Store value
  document.querySelectorAll('input[name="nf-metodo"]').forEach(r => r.checked = r.value === metodo);

  // Show/hide extra fields
  const esTarjeta = metodo === 'tarjeta_debito' || metodo === 'tarjeta_credito';
  const esCheque  = metodo === 'cheque';
  document.getElementById('nf-campos-tarjeta')?.classList.toggle('hidden', !esTarjeta);
  document.getElementById('nf-campos-cheque')?.classList.toggle('hidden', !esCheque);

  if (esTarjeta) {
    Pages.autoComisionPOS();
    Pages.calcularNetoTarjeta();
  }
};

Pages.autoComisionPOS = function () {
  const pos     = document.getElementById('nf-pos')?.value || 'visanet';
  const metodo  = document.querySelector('input[name="nf-metodo"]:checked')?.value || '';
  const config  = Pages._factConfig || {};
  let comision  = 3.00;

  if (pos === 'visanet') {
    comision = metodo === 'tarjeta_debito'
      ? (config.com_debito_visanet    || 2.50)
      : (config.com_credito_visanet   || 3.00);
  } else if (pos === 'credomatic') {
    comision = metodo === 'tarjeta_debito'
      ? (config.com_debito_credomatic  || 2.50)
      : (config.com_credito_credomatic || 3.00);
  }

  const el = document.getElementById('nf-comision');
  if (el) { el.value = comision.toFixed(2); Pages.calcularNetoTarjeta(); }
};

Pages.calcularNetoTarjeta = function () {
  const bruto    = parseFloat(document.getElementById('nf-total')?.value || 0);
  const comPct   = parseFloat(document.getElementById('nf-comision')?.value || 0) / 100;
  const comMonto = bruto * comPct;
  const neto     = bruto - comMonto;

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('nf-bruto',         UI.q(bruto));
  setEl('nf-comision-monto','-' + UI.q(comMonto));
  setEl('nf-neto',          UI.q(neto));
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
  Pages.calcularNetoTarjeta();
};

Pages.calcularIVA = function () {
  const total    = parseFloat(document.getElementById('nf-total')?.value || 0);
  const subtotal = total / 1.12;
  const iva      = total - subtotal;
  const el = document.getElementById('nf-iva');
  if (el) el.value = iva.toFixed(2);
  Pages.calcularNetoTarjeta();
};

Pages.guardarFactura = async function (accion) {
  const clienteId = document.getElementById('nf-cliente').value;
  const nit       = document.getElementById('nf-nit').value.trim();
  const total     = parseFloat(document.getElementById('nf-total').value) || 0;
  const metodo    = document.querySelector('input[name="nf-metodo"]:checked')?.value || 'efectivo';

  if (!clienteId) { UI.toast('Selecciona un cliente', 'error'); return; }
  if (!nit)       { UI.toast('El NIT es obligatorio (CF para consumidor final)', 'error'); return; }
  if (total <= 0) { UI.toast('El total debe ser mayor a 0', 'error'); return; }

  /* ── VALIDACIÓN SAT Guatemala: CF no permitido > Q2,500 ── */
  if (total > 2500 && nit.toUpperCase() === 'CF') {
    UI.openModal('⚠️ NIT Requerido — SAT Guatemala', `
      <div class="alert alert-red mb-4">
        <div class="alert-icon">🚫</div>
        <div>
          <div class="alert-title">No se puede facturar como CF (Consumidor Final)</div>
          <div class="alert-body">
            Según el <b>Artículo 26 del Reglamento del IVA</b> y disposiciones de la SAT Guatemala,
            las facturas mayores a <b>Q2,500.00</b> deben incluir el NIT o DPI del receptor.
            No se puede emitir a Consumidor Final.
          </div>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px">
        <b>Monto de la factura:</b> <span style="color:var(--amber);font-weight:700">${UI.q(total)}</span>
      </div>
      <div style="font-weight:700;font-size:13px;margin-bottom:10px">¿Qué NIT debe usarse?</div>
      <div class="detail-section mb-4">
        <div class="detail-row">
          <div class="detail-key">✅ Con NIT activo</div>
          <div class="detail-val">Usar el NIT del cliente registrado ante la SAT</div>
        </div>
        <div class="detail-row">
          <div class="detail-key">📋 Sin NIT (persona individual)</div>
          <div class="detail-val">Usar el número de <b>DPI (CUI)</b> — 13 dígitos sin guiones</div>
        </div>
        <div class="detail-row">
          <div class="detail-key">🏢 Empresa</div>
          <div class="detail-val">Obligatorio NIT empresarial vigente</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Ingresar NIT o DPI del cliente *</label>
        <input class="form-input" id="nit-override" placeholder="1234567-8 o 1234567890101"
               style="font-size:16px;letter-spacing:2px">
        <div class="text-muted" style="font-size:11px;margin-top:4px">
          NIT: formato 1234567-8 · DPI/CUI: 13 dígitos
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Pages._aplicarNITOverride()">Aplicar y Continuar</button>
      </div>
    `);
    return;
  }

  const subtotal = total / 1.12;
  const iva      = total - subtotal;
  const otId     = document.getElementById('nf-ot').value || null;
  const esTarjeta = metodo === 'tarjeta_debito' || metodo === 'tarjeta_credito';

  // Datos de tarjeta
  let comisionMonto = 0, montoNeto = total, notasPago = '';
  let referencia = document.getElementById('nf-ref').value.trim() || null;

  if (esTarjeta) {
    const comPct       = parseFloat(document.getElementById('nf-comision')?.value || 0) / 100;
    const pos          = document.getElementById('nf-pos')?.value || '';
    const franquicia   = document.getElementById('nf-franquicia')?.value || '';
    const cuotas       = document.getElementById('nf-cuotas')?.value || '1';
    const autorizacion = document.getElementById('nf-autorizacion')?.value.trim() || '';
    const digitos      = document.getElementById('nf-digitos')?.value.trim() || '';

    comisionMonto = total * comPct;
    montoNeto     = total; // Ingreso completo — comisión va como egreso separado
    referencia    = autorizacion || referencia;
    notasPago     = [
      `Franquicia: ${franquicia.toUpperCase()}`,
      `POS: ${pos}`,
      cuotas > 1 ? `Cuotas: ${cuotas}` : 'Contado',
      digitos ? `Tarjeta: ****${digitos}` : '',
      `Comisión POS: ${(comPct*100).toFixed(2)}% = Q${comisionMonto.toFixed(2)} (egreso separado)`
    ].filter(Boolean).join(' | ');
  }

  if (metodo === 'cheque') {
    const banco    = document.getElementById('nf-banco')?.value.trim() || '';
    const numCheque= document.getElementById('nf-cheque-num')?.value.trim() || '';
    notasPago = `Cheque ${banco} No.${numCheque}`;
    referencia = numCheque || referencia;
  }

  // Guardar factura
  const estado = accion === 'borrador' ? 'borrador' : 'pendiente';
  const { data: factura, error } = await DB.insertFactura({
    cliente_id:  clienteId,
    ot_id:       otId,
    nit,
    fecha:       document.getElementById('nf-fecha').value,
    descripcion: document.getElementById('nf-desc').value.trim() || 'Servicios de taller mecánico',
    subtotal:    parseFloat(subtotal.toFixed(2)),
    iva:         parseFloat(iva.toFixed(2)),
    total:       parseFloat(total.toFixed(2)),
    estado
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();

  // Registrar ingreso inmediatamente (excepto borrador y crédito cliente)
  if (accion !== 'borrador' && metodo !== 'credito_cliente') {
    await DB.insertIngreso({
      tipo:        'cobro_ot',
      concepto:    `Factura ${factura.num}${factura.descripcion ? ' — ' + factura.descripcion : ''}`,
      monto:       parseFloat(total.toFixed(2)), // Monto total, comisión va como egreso
      iva:         parseFloat(iva.toFixed(2)),
      fecha:       factura.fecha || new Date().toISOString().slice(0,10),
      ot_id:       otId,
      cliente_id:  clienteId,
      factura_id:  factura.id,
      metodo_pago: metodo,
      referencia,
      notas:       notasPago || null
    });

    // Registrar comisión como egreso si es tarjeta
    if (esTarjeta && comisionMonto > 0) {
      const pos = document.getElementById('nf-pos')?.value || '';
      await DB.insertEgreso({
        categoria:   'otros',
        concepto:    `Comisión POS ${pos} — Factura ${factura.num}`,
        monto:       parseFloat(comisionMonto.toFixed(2)),
        fecha:       factura.fecha || new Date().toISOString().slice(0,10),
        proveedor:   pos === 'visanet' ? 'Visanet Guatemala' : pos === 'credomatic' ? 'BAC Credomatic' : 'POS',
        metodo_pago: 'transferencia',
        notas:       `Comisión automática por pago con tarjeta`
      });
    }

    // Si es crédito cliente, crear CxC
    if (metodo === 'credito_cliente') {
      await DB.insertCXC({
        cliente_id:  clienteId,
        ot_id:       otId,
        concepto:    `Crédito — Factura ${factura.num}`,
        monto_total: total,
        monto_pagado:0,
        estado:      'pendiente'
      });
    }
  }

  // Certificar FEL si se solicitó
  if (accion === 'certificar' && factura?.id) {
    UI.toast('Certificando con SAT...', 'info');
    const result = await FEL.certificar(factura.id);
    if (result.ok) UI.toast(`Factura ${factura.num} certificada y registrada ✓`);
    else UI.toast('Factura creada, error FEL: ' + result.error, 'warn');
  } else if (accion === 'borrador') {
    UI.toast('Borrador guardado ✓');
  } else {
    UI.toast(`Factura ${factura.num} creada e ingreso registrado ✓`);
  }

  Pages.facturacion();
};

/* ══════════════════════════════════════════════════════
   IMPORTAR REPORTE FEL SAT (CSV/Excel)
══════════════════════════════════════════════════════ */
Pages.modalImportarFEL = function () {
  UI.openModal('📥 Importar Reporte FEL — SAT Guatemala', `
    <div class="alert alert-cyan mb-4">
      <div class="alert-icon">💡</div>
      <div>
        <div class="alert-title">Campos del reporte SAT</div>
        <div class="alert-body" style="font-family:'DM Mono',monospace;font-size:11px">
          fecha, serie, numero_dte, nit_emisor, nombre_emisor, gran_total, iva
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer"
           onclick="document.getElementById('fel-csv-file').click()">
        <div style="font-size:28px;margin-bottom:8px">📄</div>
        <div style="font-weight:600;font-size:13px">CSV del SAT</div>
        <input type="file" id="fel-csv-file" accept=".csv,.txt" class="hidden"
               onchange="Pages.procesarFELCSV(this)">
      </div>
      <div style="border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer"
           onclick="document.getElementById('fel-xls-file').click()">
        <div style="font-size:28px;margin-bottom:8px">📊</div>
        <div style="font-weight:600;font-size:13px">Excel del SAT</div>
        <input type="file" id="fel-xls-file" accept=".xlsx,.xls" class="hidden"
               onchange="Pages.procesarFELExcel(this)">
      </div>
    </div>

    <div id="fel-preview" class="hidden">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px" id="fel-preview-title">Vista Previa</div>
      <div class="table-wrap" style="max-height:260px;overflow-y:auto">
        <table class="data-table">
          <thead><tr><th>Fecha</th><th>Serie</th><th>No. DTE</th><th>NIT Emisor</th><th>Nombre Emisor</th><th>Gran Total</th><th>IVA</th></tr></thead>
          <tbody id="fel-preview-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" id="btn-importar-fel" disabled
              onclick="Pages.guardarFELImportado()">⬆ Importar</button>
    </div>
  `, 'modal-lg');
  Pages._felImportData = [];
};

Pages.procesarFELCSV = function (input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines  = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g,''));
    const getCol = (row, names) => {
      for (const name of names) {
        const idx = header.findIndex(h => h.includes(name));
        if (idx >= 0) return (row[idx]||'').replace(/"/g,'').trim();
      }
      return '';
    };
    const filas = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const f = {
        fecha:         getCol(cols, ['fecha']),
        serie:         getCol(cols, ['serie']),
        numero_dte:    getCol(cols, ['numero','dte','num']),
        nit_emisor:    getCol(cols, ['nit']),
        nombre_emisor: getCol(cols, ['nombre','emisor','razon']),
        gran_total:    parseFloat(getCol(cols, ['gran_total','total'])) || 0,
        iva:           parseFloat(getCol(cols, ['iva'])) || 0,
        tipo_doc:      getCol(cols, ['tipo']) || 'FACT'
      };
      if (f.fecha && f.numero_dte) filas.push(f);
    }
    Pages._mostrarPreviewFEL(filas);
  };
  reader.readAsText(file);
};

Pages.procesarFELExcel = async function (input) {
  const file = input.files[0]; if (!file) return;
  const buf  = await file.arrayBuffer();
  try {
    const XLSX = window.XLSX;
    if (!XLSX) { UI.toast('Librería Excel no disponible, usa CSV', 'warn'); return; }
    const wb   = XLSX.read(buf, { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const filas = data.map(row => ({
      fecha:         String(row.Fecha || row.fecha || '').trim(),
      serie:         String(row.Serie || row.serie || '').trim(),
      numero_dte:    String(row['Numero DTE'] || row.numero_dte || row.NumeroDTE || '').trim(),
      nit_emisor:    String(row['NIT Emisor'] || row.nit_emisor || row.NIT || '').trim(),
      nombre_emisor: String(row['Nombre Emisor'] || row.nombre_emisor || row.Nombre || '').trim(),
      gran_total:    parseFloat(row['Gran Total'] || row.gran_total || row.Total || 0) || 0,
      iva:           parseFloat(row.IVA || row.iva || 0) || 0,
      tipo_doc:      String(row.Tipo || row.tipo || 'FACT').trim()
    })).filter(f => f.fecha && f.numero_dte);
    Pages._mostrarPreviewFEL(filas);
  } catch(e) { UI.toast('Error: ' + e.message, 'error'); }
};

Pages._mostrarPreviewFEL = function (filas) {
  Pages._felImportData = filas;
  const tbody   = document.getElementById('fel-preview-tbody');
  const preview = document.getElementById('fel-preview');
  if (tbody && preview) {
    preview.classList.remove('hidden');
    document.getElementById('fel-preview-title').textContent = `${filas.length} registros FEL`;
    tbody.innerHTML = filas.map(f => `<tr>
      <td class="mono-sm">${f.fecha}</td>
      <td class="mono-sm">${f.serie}</td>
      <td class="mono-sm">${f.numero_dte}</td>
      <td class="mono-sm">${f.nit_emisor}</td>
      <td style="font-size:12px">${f.nombre_emisor}</td>
      <td class="mono-sm text-amber">${UI.q(f.gran_total)}</td>
      <td class="mono-sm">${UI.q(f.iva)}</td>
    </tr>`).join('');
  }
  const btn = document.getElementById('btn-importar-fel');
  if (btn) btn.disabled = false;
  UI.toast(`${filas.length} registros FEL listos ✓`);
};

Pages.guardarFELImportado = async function () {
  const filas = Pages._felImportData || [];
  if (filas.length === 0) { UI.toast('Sin datos', 'error'); return; }
  UI.toast('Importando...', 'info');
  const { data, error } = await DB.insertFelImportados(filas);
  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast(`${filas.length} registros FEL importados ✓`);
  Pages.facturacion();
};

/* ══════════════════════════════════════════════════════
   FACTURAS RECIBIDAS — Importar CSV/Excel de compras
══════════════════════════════════════════════════════ */
Pages.modalImportarFELRecibidas = function () {
  UI.openModal('📥 Importar Facturas Recibidas (Compras)', `
    <div class="alert alert-cyan mb-4">
      <div class="alert-icon">💡</div>
      <div>
        <div class="alert-title">Facturas recibidas de proveedores / compras</div>
        <div class="alert-body" style="font-family:'DM Mono',monospace;font-size:11px">
          fecha, serie, numero_dte, nit_emisor, nombre_emisor, gran_total, iva
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer"
           onclick="document.getElementById('rec-csv-file').click()">
        <div style="font-size:28px;margin-bottom:8px">📄</div>
        <div style="font-weight:600;font-size:13px">Archivo CSV</div>
        <input type="file" id="rec-csv-file" accept=".csv,.txt" class="hidden"
               onchange="Pages.procesarFELRecibidasCSV(this)">
      </div>
      <div style="border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer"
           onclick="document.getElementById('rec-xls-file').click()">
        <div style="font-size:28px;margin-bottom:8px">📊</div>
        <div style="font-weight:600;font-size:13px">Archivo Excel</div>
        <input type="file" id="rec-xls-file" accept=".xlsx,.xls" class="hidden"
               onchange="Pages.procesarFELRecibidasExcel(this)">
      </div>
    </div>

    <div id="rec-preview" class="hidden">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px" id="rec-preview-title">Vista Previa</div>
      <div class="table-wrap" style="max-height:260px;overflow-y:auto">
        <table class="data-table">
          <thead><tr><th>Fecha</th><th>Serie</th><th>No. DTE</th><th>NIT Emisor</th><th>Nombre Emisor</th><th>Gran Total</th><th>IVA</th></tr></thead>
          <tbody id="rec-preview-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="form-group mt-4">
      <label class="form-label">
        <input type="checkbox" id="rec-crear-egreso" checked style="margin-right:8px">
        Crear egreso automático en Finanzas por cada factura
      </label>
    </div>

    <div class="flex gap-2 mt-2">
      <button class="btn btn-ghost btn-sm" onclick="Pages.descargarPlantillaFELRecibidas()">📥 Descargar Plantilla</button>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" id="btn-importar-rec" disabled onclick="Pages.guardarFELRecibidas()">
        ⬆ Importar Facturas Recibidas
      </button>
    </div>
  `, 'modal-lg');
  Pages._felRecibidasData = [];
};

Pages.procesarFELRecibidasCSV = function (input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines  = e.target.result.split('\n').map(l=>l.trim()).filter(Boolean);
    const header = lines[0].toLowerCase().split(',').map(h=>h.trim().replace(/"/g,''));
    const getCol = (row, names) => {
      for (const n of names) {
        const idx = header.findIndex(h=>h.includes(n));
        if (idx>=0) return (row[idx]||'').replace(/"/g,'').trim();
      }
      return '';
    };
    const filas = [];
    for (let i=1;i<lines.length;i++) {
      const cols = lines[i].split(',');
      const f = {
        fecha:         getCol(cols,['fecha']),
        serie:         getCol(cols,['serie']),
        numero_dte:    getCol(cols,['numero','dte','num']),
        nit_emisor:    getCol(cols,['nit']),
        nombre_emisor: getCol(cols,['nombre','emisor','razon']),
        gran_total:    parseFloat(getCol(cols,['gran_total','total']))||0,
        iva:           parseFloat(getCol(cols,['iva']))||0,
        tipo_doc:      getCol(cols,['tipo'])||'FACT',
        tipo_reporte:  'recibida'
      };
      if (f.fecha && f.numero_dte) filas.push(f);
    }
    Pages._mostrarPreviewFELRec(filas);
  };
  reader.readAsText(file);
};

Pages.procesarFELRecibidasExcel = async function (input) {
  const file = input.files[0]; if (!file) return;
  const buf  = await file.arrayBuffer();
  try {
    const XLSX = window.XLSX;
    if (!XLSX) { UI.toast('Usa CSV — Excel no disponible en este contexto','warn'); return; }
    const wb  = XLSX.read(buf,{type:'array'});
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const data= XLSX.utils.sheet_to_json(ws,{defval:''});
    const filas = data.map(row=>({
      fecha:         String(row.Fecha||row.fecha||'').trim(),
      serie:         String(row.Serie||row.serie||'').trim(),
      numero_dte:    String(row['Numero DTE']||row.numero_dte||row.NumeroDTE||'').trim(),
      nit_emisor:    String(row['NIT Emisor']||row.nit_emisor||row.NIT||'').trim(),
      nombre_emisor: String(row['Nombre Emisor']||row.nombre_emisor||row.Nombre||'').trim(),
      gran_total:    parseFloat(row['Gran Total']||row.gran_total||row.Total||0)||0,
      iva:           parseFloat(row.IVA||row.iva||0)||0,
      tipo_doc:      String(row.Tipo||row.tipo||'FACT').trim(),
      tipo_reporte:  'recibida'
    })).filter(f=>f.fecha&&f.numero_dte);
    Pages._mostrarPreviewFELRec(filas);
  } catch(e) { UI.toast('Error: '+e.message,'error'); }
};

Pages._mostrarPreviewFELRec = function (filas) {
  Pages._felRecibidasData = filas;
  const tbody   = document.getElementById('rec-preview-tbody');
  const preview = document.getElementById('rec-preview');
  if (tbody && preview) {
    preview.classList.remove('hidden');
    document.getElementById('rec-preview-title').textContent = `${filas.length} facturas recibidas`;
    tbody.innerHTML = filas.map(f=>`<tr>
      <td class="mono-sm">${f.fecha}</td>
      <td class="mono-sm">${f.serie}</td>
      <td class="mono-sm">${f.numero_dte}</td>
      <td class="mono-sm">${f.nit_emisor}</td>
      <td style="font-size:12px">${f.nombre_emisor}</td>
      <td class="mono-sm text-amber">${UI.q(f.gran_total)}</td>
      <td class="mono-sm">${UI.q(f.iva)}</td>
    </tr>`).join('');
  }
  const btn = document.getElementById('btn-importar-rec');
  if (btn) btn.disabled = false;
  UI.toast(`${filas.length} facturas recibidas listas ✓`);
};

Pages.guardarFELRecibidas = async function () {
  const filas = Pages._felRecibidasData||[];
  if (!filas.length) { UI.toast('Sin datos','error'); return; }
  const crearEgreso = document.getElementById('rec-crear-egreso')?.checked;
  UI.toast('Importando...','info');

  const {data, error} = await DB.insertFelImportados(filas);
  if (error) { UI.toast('Error: '+error.message,'error'); return; }

  // Crear egresos automáticos
  if (crearEgreso) {
    for (const f of filas) {
      await DB.insertEgreso({
        categoria:    'compra_inventario',
        concepto:     `Factura recibida — ${f.nombre_emisor} · DTE ${f.serie}-${f.numero_dte}`,
        monto:        f.gran_total,
        iva_credito:  f.iva,
        fecha:        f.fecha,
        proveedor:    f.nombre_emisor,
        num_factura:  `${f.serie}-${f.numero_dte}`,
        metodo_pago:  'transferencia',
        notas:        `NIT emisor: ${f.nit_emisor}`
      }).catch(()=>{});
    }
    UI.toast(`${filas.length} facturas recibidas importadas y egresos registrados ✓`);
  } else {
    UI.toast(`${filas.length} facturas recibidas importadas ✓`);
  }
  UI.closeModal();
  Pages.facturacion();
};

Pages.descargarPlantillaFELRecibidas = function () {
  const csv = [
    'fecha,serie,numero_dte,nit_emisor,nombre_emisor,gran_total,iva',
    '2025-04-01,A,00000001,1234567-8,Proveedor Guatemala SA,1120.00,120.00',
    '2025-04-05,B,00000002,9876543-2,Importadora de Repuestos GT,560.00,60.00'
  ].join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download='plantilla_facturas_recibidas.csv'; a.click();
  URL.revokeObjectURL(url);
};

/* ══════════════════════════════════════════════════════
   CONFIGURACIÓN — Logo del taller
══════════════════════════════════════════════════════ */
Pages._logoBase64 = null;

Pages._agregarLogoAConfig = function () {
  const logoHtml = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-sub mb-3">🖼️ Logo del Taller</div>
      <div class="form-group">
        <label class="form-label">Subir logo (PNG, JPG — máx. 500KB)</label>
        <input type="file" id="cfg-logo-file" accept="image/png,image/jpeg,image/webp"
               class="form-input" onchange="Pages._onLogoChange(this)">
      </div>
      <div id="cfg-logo-preview" style="margin-top:12px;display:none">
        <img id="cfg-logo-img" style="max-height:80px;max-width:200px;border:1px solid var(--border);border-radius:6px;padding:8px;background:#fff">
        <button class="btn btn-sm btn-danger" style="margin-left:8px" onclick="Pages._quitarLogo()">Quitar logo</button>
      </div>
      ${Auth.tenant?.logo_base64 ? `
      <div style="margin-top:8px">
        <div class="text-muted" style="font-size:11px">Logo actual:</div>
        <img src="${Auth.tenant.logo_base64}" style="max-height:60px;max-width:180px;border:1px solid var(--border);border-radius:4px;padding:6px;background:#fff;margin-top:4px">
      </div>` : ''}
    </div>`;
  return logoHtml;
};

Pages._onLogoChange = function (input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 512000) { UI.toast('El logo no debe superar 500KB','error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    Pages._logoBase64 = e.target.result;
    const preview = document.getElementById('cfg-logo-preview');
    const img     = document.getElementById('cfg-logo-img');
    if (preview && img) {
      img.src = Pages._logoBase64;
      preview.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
};

Pages._quitarLogo = function () {
  Pages._logoBase64 = null;
  const preview = document.getElementById('cfg-logo-preview');
  const input   = document.getElementById('cfg-logo-file');
  if (preview) preview.style.display = 'none';
  if (input)   input.value = '';
};


Pages._aplicarNITOverride = function () {
  const nit = document.getElementById('nit-override')?.value.trim();
  if (!nit || nit.length < 5) { UI.toast('Ingresa un NIT o DPI válido','error'); return; }
  const nitField = document.getElementById('nf-nit');
  if (nitField) nitField.value = nit;
  UI.closeModal();
  UI.toast('NIT actualizado: ' + nit + '. Ahora puedes facturar.','info');
};
