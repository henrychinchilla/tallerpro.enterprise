/* TallerPro v3.0 — calendario/index.js */
Modulos.calendario = {
  _citas: [], _clientes: [], _vehiculos: [], _empleados: [],

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const hoy = new Date();
    const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
    const fin = new Date(hoy.getFullYear(), hoy.getMonth()+2, 0).toISOString();
    let vencDocs = [], recurrentes = [], envios = [], fiscal = null, obligaciones = [];
    [this._citas, this._clientes, this._vehiculos, this._empleados, vencDocs, recurrentes, envios, fiscal, obligaciones] = await Promise.all([
      DB.getCitas(ini.slice(0,10), fin.slice(0,10)), DB.getClientes(), DB.getVehiculos(), DB.getEmpleados(),
      DB.getVencimientosDocumentos(60).catch(()=>[]), DB.getEgresosRecurrentes().catch(()=>[]),
      DB.getEnvios({archivado:false}).catch(()=>[]),
      DB.getConfigFiscal().catch(()=>null),
      DB.getObligaciones(hoy.getFullYear()).catch(()=>[])
    ]);

    const hoyStr = hoy.toISOString().slice(0,10);
    /* Pagos recurrentes como eventos del calendario (mes actual y siguiente) */
    const pagos = this._pagosEventos(recurrentes, hoy);
    const enviosEv = (envios||[])
      .filter(e=>e.fecha_entrega_estimada && e.estado!=='cerrado')
      .map(e=>({ _envio:true, id:e.id, titulo:e.descripcion, tipo:e.tipo, fecha_cita:`${e.fecha_entrega_estimada}T10:00:00` }));
    /* Vencimientos SAT (según régimen fiscal) si el plan incluye contabilidad */
    const satEv = moduloEnPlan('contabilidad') ? this._eventosSAT(hoy, fiscal, obligaciones) : [];
    const eventos = [...this._citas, ...pagos, ...enviosEv, ...satEv]
      .sort((a,b)=>(a.fecha_cita||'').localeCompare(b.fecha_cita||''));
    const citasHoy = eventos.filter(c=>c.fecha_cita?.slice(0,10)===hoyStr);
    const citasProx = eventos.filter(c=>c.fecha_cita?.slice(0,10)>hoyStr).slice(0,6);
    this._eventosMes = eventos;

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
              ${(this._eventosMes||this._citas).map(c=>this._renderCitaCard(c,true)).join('')||'<div class="text-muted">Sin citas este mes</div>'}
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

  /* ── Calendario fiscal SAT (Guatemala) ─────────────
     Genera los vencimientos del mes actual y el siguiente según el
     régimen del taller (config_fiscal), cruzados con el estado en
     obligaciones_fiscales (✓ pagado / pendiente / por calcular):
       • IVA mensual: SAT-2237 (o SAT-2046 pequeño contribuyente),
         vence el último día del mes siguiente al periodo.
       • ISR Simplificado (SAT-1311): primeros 10 días del mes siguiente.
       • Régimen utilidades (25%): ISR trimestral SAT-1361 (día 10 de
         ene/abr/jul/oct), ISO SAT-1608 (fin de esos meses) y
         ISR anual SAT-1411 (31 de marzo). */
  _eventosSAT(hoy, fiscal, obligaciones) {
    const out = [];
    const pequeno = (fiscal?.regimen_iva||'general').toLowerCase().startsWith('peque');
    const utilidades = (Number(fiscal?.tasa_isr)||0.05) >= 0.2;
    const f = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const estadoDe = (tipo, periodo) => {
      const o = (obligaciones||[]).find(x=>x.tipo===tipo && x.periodo===periodo);
      return o ? o.estado : null;   // 'pagado' | 'pendiente' | null (sin calcular)
    };

    [0,1].forEach(k => {
      const base = new Date(hoy.getFullYear(), hoy.getMonth()+k, 1);
      const y = base.getFullYear(), m = base.getMonth();
      const prev = new Date(y, m-1, 1);
      const prevPer = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
      const finMes = new Date(y, m+1, 0);

      /* IVA del periodo anterior — vence fin de este mes */
      out.push({ _sat:true, titulo:`IVA ${pequeno?'SAT-2046':'SAT-2237'} · periodo ${prevPer}`,
        fecha_cita:`${f(finMes)}T09:00:00`, sat_estado: estadoDe('IVA', prevPer) });

      if (!utilidades) {
        /* ISR opcional simplificado mensual — día 10 */
        if (!pequeno) out.push({ _sat:true, titulo:`ISR Simplificado SAT-1311 · periodo ${prevPer}`,
          fecha_cita:`${f(new Date(y, m, 10))}T09:00:00`, sat_estado: estadoDe('ISR', prevPer) });
      } else {
        /* Régimen sobre utilidades: trimestrales + anual */
        if ([0,3,6,9].includes(m)) {
          const tAnt = m === 0 ? 4 : m/3;                 // trimestre que cierra
          const yT = m === 0 ? y-1 : y;
          out.push({ _sat:true, titulo:`ISR Trimestral SAT-1361 · T${tAnt} ${yT}`,
            fecha_cita:`${f(new Date(y, m, 10))}T09:00:00`, sat_estado: estadoDe('ISR', `${yT}-T${tAnt}`) });
          out.push({ _sat:true, titulo:`ISO SAT-1608 · T${tAnt} ${yT}`,
            fecha_cita:`${f(finMes)}T09:00:00`, sat_estado: estadoDe('ISO', `${yT}-T${tAnt}`) });
        }
        if (m === 2) out.push({ _sat:true, titulo:`ISR Anual SAT-1411 · ejercicio ${y-1}`,
          fecha_cita:`${f(new Date(y, 2, 31))}T09:00:00`, sat_estado:null });
      }
    });
    return out;
  },

  /* Convierte los gastos recurrentes activos en eventos del calendario
     (su fecha del mes actual y del siguiente, según dia_mes). */
  _pagosEventos(recurrentes, hoy) {
    const out = [];
    (recurrentes||[]).filter(r=>r.activo).forEach(r=>{
      [0,1].forEach(m=>{
        const base = new Date(hoy.getFullYear(), hoy.getMonth()+m, 1);
        const y = base.getFullYear(), mo = base.getMonth();
        const dia = Math.min(Math.max(1, r.dia_mes||1), new Date(y, mo+1, 0).getDate());
        const fechaStr = `${y}-${String(mo+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        out.push({ _pago:true, id:r.id, titulo:r.concepto, monto:r.monto, fecha_cita:`${fechaStr}T08:00:00` });
      });
    });
    return out;
  },

  _renderCitaCard(c, conFecha=false) {
    const hora = c.fecha_cita ? new Date(c.fecha_cita).toLocaleTimeString('es-GT',{hour:'2-digit',minute:'2-digit'}) : '';
    const fecha = c.fecha_cita ? new Date(c.fecha_cita).toLocaleDateString('es-GT',{day:'numeric',month:'short'}) : '';
    /* Evento de envío / flete (entrega estimada) */
    if (c._envio) {
      return `<div style="padding:10px;border-left:3px solid var(--cyan);margin-bottom:8px;background:var(--surface2);border-radius:0 8px 8px 0;cursor:pointer"
           onclick="App.navegarA('envios')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:700;font-size:13px">🚚 ${c.titulo}</div>
          <div style="font-size:11px;color:var(--cyan)">${conFecha?fecha+' ':''}${hora}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Entrega estimada de envío</div>
      </div>`;
    }
    /* Vencimiento SAT (calculado según el régimen fiscal) */
    if (c._sat) {
      const st = c.sat_estado === 'pagado' ? { b:'green', t:'✓ Pagado' }
        : c.sat_estado === 'pendiente' ? { b:'amber', t:'Pendiente' }
        : { b:'gray', t:'Por calcular' };
      return `<div style="padding:10px;border-left:3px solid var(--purple);margin-bottom:8px;background:var(--surface2);border-radius:0 8px 8px 0;cursor:pointer"
           onclick="App.navegarA('contabilidad')">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="font-weight:700;font-size:13px">🏛️ ${c.titulo}</div>
          <div style="font-size:11px;color:var(--purple);white-space:nowrap">${conFecha?fecha:''}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;display:flex;justify-content:space-between;align-items:center">
          <span>Declaración SAT (Declaraguate)</span>
          <span class="badge badge-${st.b}" style="font-size:9px">${st.t}</span>
        </div>
      </div>`;
    }
    /* Evento de pago recurrente (no es una cita real) */
    if (c._pago) {
      return `<div style="padding:10px;border-left:3px solid var(--red);margin-bottom:8px;background:var(--surface2);border-radius:0 8px 8px 0;cursor:pointer"
           onclick="Modulos.finanzas&&(Modulos.finanzas._tab='recurrentes');App.navegarA('finanzas')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:700;font-size:13px">💸 ${c.titulo}</div>
          <div style="font-size:11px;color:var(--red)">${conFecha?fecha+' ':''}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;display:flex;justify-content:space-between">
          <span>Pago programado</span><span class="text-red mono-sm">${UI.q(c.monto)}</span>
        </div>
      </div>`;
    }
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
            ${['pendiente','confirmada','completada','cancelada'].map(s=>`<option value="${s}" ${c.estado===s?'selected':''}>${s}</option>`).join('')}
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
