/* TallerPro v3.0 — calendario/index.js */
Modulos.calendario = {
  _citas: [], _clientes: [], _vehiculos: [], _empleados: [],

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const hoy = new Date();
    const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
    const fin = new Date(hoy.getFullYear(), hoy.getMonth()+2, 0).toISOString();
    let vencDocs = [], recurrentes = [];
    [this._citas, this._clientes, this._vehiculos, this._empleados, vencDocs, recurrentes] = await Promise.all([
      DB.getCitas(ini.slice(0,10), fin.slice(0,10)), DB.getClientes(), DB.getVehiculos(), DB.getEmpleados(),
      DB.getVencimientosDocumentos(60).catch(()=>[]), DB.getEgresosRecurrentes().catch(()=>[])
    ]);

    const hoyStr = hoy.toISOString().slice(0,10);
    const citasHoy = this._citas.filter(c=>c.fecha_cita?.slice(0,10)===hoyStr);
    const citasProx = this._citas.filter(c=>c.fecha_cita?.slice(0,10)>hoyStr).slice(0,5);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📅 Calendario</h1>
        <p class="page-subtitle">// ${citasHoy.length} citas hoy</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.calendario.modalCita()">＋ Nueva Cita</button>
        </div>
      </div>
      <div class="page-body">
        <div class="grid-2">
          <div>
            <div class="card card-amber" style="margin-bottom:16px">
              <div class="card-sub mb-3">📅 Hoy — ${hoy.toLocaleDateString('es-GT',{weekday:'long',day:'numeric',month:'long'})}</div>
              ${citasHoy.length ? citasHoy.map(c=>this._renderCitaCard(c)).join('') : '<div class="text-muted">Sin citas para hoy</div>'}
            </div>
            <div class="card" style="margin-bottom:16px">
              <div class="card-sub mb-3">⏭️ Próximas Citas</div>
              ${citasProx.length ? citasProx.map(c=>this._renderCitaCard(c)).join('') : '<div class="text-muted">Sin citas próximas</div>'}
            </div>
            ${this._renderSeguimiento(vencDocs, recurrentes, hoyStr)}
          </div>
          <div class="card">
            <div class="card-sub mb-3">📋 Todas las Citas del Mes</div>
            <div style="max-height:500px;overflow-y:auto">
              ${this._citas.map(c=>this._renderCitaCard(c,true)).join('')||'<div class="text-muted">Sin citas este mes</div>'}
            </div>
          </div>
        </div>
      </div>`;
  },

  /* Panel de seguimiento: documentos por vencer + recurrentes pendientes */
  _renderSeguimiento(vencDocs, recurrentes, hoyStr) {
    const mesKey = hoyStr.slice(0,7)+'-01';
    const recPend = (recurrentes||[]).filter(r => r.activo && (r.ultima_generacion||'') < mesKey);
    if (!vencDocs.length && !recPend.length) return '';
    const docItem = d => {
      const dias = Math.ceil((new Date(d.fecha_vencimiento) - new Date()) / 86400000);
      const color = dias < 0 ? 'red' : dias <= 30 ? 'amber' : 'cyan';
      const txt = dias < 0 ? `vencido hace ${Math.abs(dias)} d` : `en ${dias} d`;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
        <div><b>${d.tipo}</b> · <span class="text-muted">${d.empleados?.nombre||''}</span></div>
        <span class="badge badge-${color}">${UI.fecha(d.fecha_vencimiento)} · ${txt}</span>
      </div>`;
    };
    return `<div class="card">
      <div class="card-sub mb-3">🔔 Seguimiento</div>
      ${vencDocs.length?`<div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">📄 Documentos por vencer</div>
        ${vencDocs.slice(0,8).map(docItem).join('')}`:''}
      ${recPend.length?`<div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:10px 0 4px">🔁 Gastos recurrentes pendientes</div>
        ${recPend.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
          <div><b>${r.concepto}</b> <span class="text-muted">· día ${r.dia_mes||1}</span></div>
          <span class="text-red mono-sm">${UI.q(r.monto)}</span>
        </div>`).join('')}
        <div style="margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="Modulos.finanzas._tab='recurrentes';App.navegarA('finanzas')">Ir a Recurrentes →</button></div>`:''}
    </div>`;
  },

  _renderCitaCard(c, conFecha=false) {
    const hora = c.fecha_cita ? new Date(c.fecha_cita).toLocaleTimeString('es-GT',{hour:'2-digit',minute:'2-digit'}) : '';
    const fecha = c.fecha_cita ? new Date(c.fecha_cita).toLocaleDateString('es-GT',{day:'numeric',month:'short'}) : '';
    return `<div style="padding:10px;border-left:3px solid var(--${c.estado==='completada'?'green':c.estado==='cancelada'?'red':'amber'});margin-bottom:8px;background:var(--surface2);border-radius:0 8px 8px 0;cursor:pointer" onclick="Modulos.calendario.modalCita('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:13px">${c.titulo}</div>
        <div style="font-size:11px;color:var(--amber)">${conFecha?fecha+' ':''} ${hora}</div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">
        ${c.clientes?.nombre||''} ${c.vehiculos?.placa?'· '+c.vehiculos.placa:''}
        ${c.empleados?.nombre?'· '+c.empleados.nombre:''}
      </div>
    </div>`;
  },

  async modalCita(id=null) {
    const c = id ? this._citas.find(x=>x.id===id)||{} : {};
    const esEdicion = !!id;
    const now = new Date();
    const defaultDate = `${now.toISOString().slice(0,10)}T${String(now.getHours()).padStart(2,'0')}:00`;

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nueva'} Cita`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la cita.</div></div>':''}
      <div class="form-group"><label class="form-label">Título / Motivo *</label>
        <input class="form-input" id="cit-titulo" value="${c.titulo||''}" placeholder="Cambio de aceite / Revisión general"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente</label>
          <select class="form-select" id="cit-cli">
            <option value="">Sin cliente</option>
            ${this._clientes.map(x=>`<option value="${x.id}" ${c.cliente_id===x.id?'selected':''}>${x.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Vehículo</label>
          <select class="form-select" id="cit-veh">
            <option value="">Sin vehículo</option>
            ${this._vehiculos.map(x=>`<option value="${x.id}" ${c.vehiculo_id===x.id?'selected':''}>${x.placa} - ${x.marca}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha y Hora *</label>
          <input class="form-input" id="cit-fecha" type="datetime-local" value="${c.fecha_cita?.slice(0,16)||defaultDate}"></div>
        <div class="form-group"><label class="form-label">Duración (min)</label>
          <input class="form-input" id="cit-dur" type="number" value="${c.duracion_min||60}" min="15" step="15"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Mecánico / Técnico</label>
          <select class="form-select" id="cit-emp">
            <option value="">Sin asignar</option>
            ${this._empleados.filter(e=>e.activo).map(x=>`<option value="${x.id}" ${c.empleado_id===x.id?'selected':''}>${x.nombre}</option>`).join('')}
          </select></div>
        ${esEdicion?`<div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="cit-estado">
            ${['pendiente','confirmada','en_proceso','completada','cancelada'].map(s=>`<option value="${s}" ${c.estado===s?'selected':''}>${s}</option>`).join('')}
          </select></div>`:''}
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="cit-notas" rows="2">${c.notas||''}</textarea></div>
      <div class="modal-footer">
        ${esEdicion?`<button class="btn btn-sm btn-danger" title="Eliminar" onclick="Modulos.eliminarRegistro('citas','${id}','${(c.titulo||'esta cita').replace(/'/g,"\\'")}',()=>{UI.cerrarModal();Modulos.calendario.render()})">🗑️ Eliminar</button>`:''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.calendario.guardarCita('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Cita'}
        </button>
      </div>`,'580px');
  },

  async guardarCita(id='') {
    const titulo = document.getElementById('cit-titulo')?.value.trim();
    const fecha  = document.getElementById('cit-fecha')?.value;
    if (!titulo||!fecha) { UI.toast('Título y fecha son obligatorios','error'); return; }
    const fields = {
      titulo,
      fecha_cita:   new Date(fecha).toISOString(),
      cliente_id:   document.getElementById('cit-cli')?.value||null,
      vehiculo_id:  document.getElementById('cit-veh')?.value||null,
      empleado_id:  document.getElementById('cit-emp')?.value||null,
      duracion_min: parseInt(document.getElementById('cit-dur')?.value)||60,
      estado:       document.getElementById('cit-estado')?.value||'pendiente',
      notas:        document.getElementById('cit-notas')?.value||null
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertCita(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Cita actualizada ✓':'Cita creada ✓');
    this.render();
  }
};
