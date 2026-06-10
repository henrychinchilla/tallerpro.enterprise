/* Panel SaaS — solo superadmin (dueño del producto).
   Gestiona talleres (planes, módulos, suscripción, suspensión),
   cobros mensuales (MRR, pendientes) y supervisa respaldos. */
Modulos.superadmin = {
  _tab: 'talleres',
  _tenants: [], _pagos: [],

  async render() {
    const el = document.getElementById('page-content');
    if (Auth.user?.rol !== 'superadmin') { el.innerHTML = '<div class="empty-state">Sin acceso</div>'; return; }
    UI.loading(el);
    [this._tenants, this._pagos] = await Promise.all([
      DB.getTenantsAdmin().catch(()=>[]),
      DB.getTenantPagos().catch(()=>[])
    ]);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">⚡ Panel SaaS</h1>
        <p class="page-subtitle">// gestión comercial de TallerPro</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.superadmin.respaldarTodos()" title="Respaldo inmediato de todos los talleres a Storage">💾 Respaldar todos</button>
          <button class="btn btn-ghost" onclick="Modulos.superadmin.enviarRecordatorios()" title="Enviar recordatorios de cobro/vencimiento por email">📧 Recordatorios</button>
          <button class="btn btn-amber" onclick="Modulos.superadmin.modalNuevoTaller()">➕ Nuevo taller</button>
        </div>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='talleres'?'active':''}" onclick="Modulos.superadmin._ir('talleres')">🏪 Talleres</button>
          <button class="tab-btn ${this._tab==='cobros'?'active':''}" onclick="Modulos.superadmin._ir('cobros')">💵 Cobros</button>
          <button class="tab-btn ${this._tab==='planes'?'active':''}" onclick="Modulos.superadmin._ir('planes')">🎚️ Planes</button>
        </div>
        <div id="sa-content"></div>
      </div>`;
    this._renderTab();
  },

  _ir(t){ this._tab=t; this._renderTab(); },

  _mesActual(){ const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; },
  _planLabel(p){ return (PLANES[p]?.label)||p||'—'; },

  _renderTab() {
    const el = document.getElementById('sa-content');
    if (!el) return;
    const hoy = new Date().toISOString().slice(0,10);
    const activos = this._tenants.filter(t=>t.active!==false);

    if (this._tab==='talleres') {
      const mrr = activos.reduce((s,t)=>s+(Number(t.precio_mensual)||0),0);
      const vencidos = this._tenants.filter(t=>t.suscripcion_vence && t.suscripcion_vence < hoy && t.active!==false);
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:20px">
          <div class="kpi-card"><div class="kpi-label">Talleres totales</div><div class="kpi-val amber">${this._tenants.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Activos</div><div class="kpi-val green">${activos.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">MRR (ingreso recurrente)</div><div class="kpi-val cyan">${UI.q(mrr)}</div><div class="kpi-trend">por mes</div></div>
          <div class="kpi-card"><div class="kpi-label">Suscripciones vencidas</div><div class="kpi-val ${vencidos.length?'red':'gray'}">${vencidos.length}</div></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Taller</th><th>Plan</th><th>Precio</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._tenants.map(t=>{
                const venc = t.suscripcion_vence && t.suscripcion_vence < hoy;
                const susp = t.active===false;
                return `<tr style="${susp?'opacity:.55':''}">
                  <td><b>${t.name||t.slug||'—'}</b><br><small class="text-muted">${t.nit||''} ${t.email?('· '+t.email):''}</small></td>
                  <td><span class="badge badge-${PLANES[t.plan]?.color||'gray'}">${this._planLabel(t.plan)}</span></td>
                  <td class="mono-sm">${UI.q(t.precio_mensual||0)}</td>
                  <td class="mono-sm ${venc?'text-red':''}">${t.suscripcion_vence?UI.fecha(t.suscripcion_vence):'—'}${venc?' ⚠️':''}</td>
                  <td><span class="badge badge-${susp?'red':'green'}">${susp?'Suspendido':'Activo'}</span></td>
                  <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-cyan" onclick="Modulos.superadmin.modalTaller('${t.id}')" title="Plan y módulos">⚙️</button>
                    <button class="btn btn-sm btn-green" onclick="Modulos.superadmin.modalCobro('${t.id}')" title="Registrar cobro">💵</button>
                    <button class="btn btn-sm ${susp?'btn-green':'btn-danger'}" onclick="Modulos.superadmin.toggleActivo('${t.id}',${susp})" title="${susp?'Reactivar':'Suspender'}">${susp?'▶️':'⏸️'}</button>
                  </div></td>
                </tr>`;}).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin talleres registrados</td></tr>'}
            </tbody>
          </table>
        </div>`;
    }

    else if (this._tab==='cobros') {
      const mesAct = this._mesActual();
      const tnById = id => this._tenants.find(t=>t.id===id);
      const cobradoMes = this._pagos.filter(p=>p.periodo===mesAct && p.estado==='pagado').reduce((s,p)=>s+(Number(p.monto)||0),0);
      const pendienteMes = this._pagos.filter(p=>p.periodo===mesAct && p.estado==='pendiente').reduce((s,p)=>s+(Number(p.monto)||0),0);
      /* Talleres activos sin pago registrado del mes */
      const conPago = new Set(this._pagos.filter(p=>p.periodo===mesAct).map(p=>p.tenant_id));
      const sinCobrar = activos.filter(t=>!conPago.has(t.id));
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:20px">
          <div class="kpi-card"><div class="kpi-label">Cobrado este mes</div><div class="kpi-val green">${UI.q(cobradoMes)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Pendiente este mes</div><div class="kpi-val amber">${UI.q(pendienteMes)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Sin cobrar (${mesAct})</div><div class="kpi-val ${sinCobrar.length?'red':'gray'}">${sinCobrar.length}</div><div class="kpi-trend">talleres activos</div></div>
        </div>
        ${sinCobrar.length?`<div class="alert alert-amber" style="margin-bottom:16px"><div class="alert-icon">⏰</div><div class="alert-body" style="font-size:12px">
          Sin cobro de ${mesAct}: ${sinCobrar.map(t=>`<b>${t.name||t.slug}</b>`).join(', ')}.
        </div></div>`:''}
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Taller</th><th>Periodo</th><th>Monto</th><th>Método</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              ${this._pagos.map(p=>{ const t=tnById(p.tenant_id); return `<tr>
                <td class="mono-sm">${UI.fecha(p.fecha)}</td>
                <td>${t?.name||t?.slug||'—'}</td>
                <td class="mono-sm">${p.periodo||'—'}</td>
                <td class="mono-sm text-green">${UI.q(p.monto)}</td>
                <td>${p.metodo||'—'}</td>
                <td><span class="badge badge-${p.estado==='pagado'?'green':'amber'}">${p.estado}</span></td>
                <td>${Modulos.btnAccion('eliminar', `Modulos.superadmin.eliminarPago('${p.id}')`)}</td>
              </tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin cobros registrados</td></tr>'}
            </tbody>
          </table>
        </div>`;
    }

    else if (this._tab==='planes') {
      el.innerHTML = `
        <div class="grid-3" style="margin-bottom:20px">
          ${Object.entries(PLANES).map(([k,p])=>`
            <div class="card card-${p.color}" style="border:2px solid var(--${p.color})">
              <div style="font-weight:800;font-size:18px;color:var(--${p.color})">${p.label}</div>
              <div style="font-size:28px;font-weight:800;margin:6px 0">${UI.q(p.precio)}<span style="font-size:13px;color:var(--text3)">/mes</span></div>
              <div style="font-size:12px;color:var(--text3);margin-bottom:10px">${p.desc}</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                ${p.modulos.map(m=>`<span class="badge badge-gray" style="font-size:10px">${labelModulo(m)}</span>`).join('')}
              </div>
            </div>`).join('')}
        </div>
        <div class="alert alert-cyan"><div class="alert-icon">💡</div><div class="alert-body" style="font-size:12px">
          Estos son los paquetes por defecto. En cada taller (⚙️) puedes activar/desactivar módulos <b>a la carta</b>
          y fijar un precio propio, sin importar el plan. Los módulos de cuenta (Dashboard, Calendario, Configuración,
          Usuarios, Administración, Respaldos) están siempre incluidos.
        </div></div>
        <div class="alert alert-amber" style="margin-top:12px"><div class="alert-icon">🤖</div><div class="alert-body" style="font-size:12px">
          <b>Beto (Asistente IA)</b> viene incluido en <b>Empresarial</b> y se vende como <b>add-on de Q99/mes</b>
          para Básico y Pro (actívalo a la carta en ⚙️ y suma Q99 al precio). Todos los talleres tienen un
          <b>tope mensual de consultas</b> (default 300, ampliable por taller). Los talleres en prueba de 30 días
          lo traen activado para que lo conozcan.
        </div></div>`;
    }
  },

  /* ── NUEVO TALLER: tenant + usuario admin en un paso ── */
  modalNuevoTaller() {
    const venceDefault = (()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,10); })();
    UI.modal('➕ Nuevo taller', `
      <div style="font-weight:700;font-size:13px;color:var(--amber);margin-bottom:8px">Datos del taller</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre del taller *</label>
          <input class="form-input" id="nt-nombre" placeholder="Taller El Buen Freno"></div>
        <div class="form-group"><label class="form-label">NIT</label>
          <input class="form-input" id="nt-nit" placeholder="CF o 1234567-8"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email del taller</label>
          <input class="form-input" id="nt-email" type="email" placeholder="contacto@taller.com"></div>
        <div class="form-group"><label class="form-label">Teléfono</label>
          <input class="form-input" id="nt-tel" placeholder="5555-5555"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Plan *</label>
          <select class="form-select" id="nt-plan" onchange="Modulos.superadmin._precioDePlan(this.value)">
            ${Object.entries(PLANES).map(([k,p])=>`<option value="${k}">${p.label} — ${UI.q(p.precio)}/mes</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Precio mensual (Q)</label>
          <input class="form-input" id="nt-precio" type="number" min="0" step="0.01" value="${PLANES[Object.keys(PLANES)[0]]?.precio||0}"></div>
        <div class="form-group"><label class="form-label">Suscripción vence</label>
          <input class="form-input" id="nt-vence" type="date" value="${venceDefault}"></div>
      </div>
      <div style="font-weight:700;font-size:13px;color:var(--amber);margin:14px 0 8px;border-top:1px solid var(--border);padding-top:12px">Usuario administrador del taller</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-input" id="nt-adm-nombre" placeholder="Juan Pérez"></div>
        <div class="form-group"><label class="form-label">Email (login) *</label>
          <input class="form-input" id="nt-adm-email" type="email" placeholder="dueno@taller.com"></div>
      </div>
      <div class="form-group"><label class="form-label">Contraseña inicial *</label>
        <input class="form-input" id="nt-adm-pass" type="text" placeholder="Mínimo 6 caracteres">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Se le pedirá cambiarla al primer ingreso.</div></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" id="nt-guardar" onclick="Modulos.superadmin.guardarNuevoTaller()">Crear taller</button>
      </div>`, '640px');
  },

  _precioDePlan(plan) {
    const precio = document.getElementById('nt-precio');
    if (precio && PLANES[plan]) precio.value = PLANES[plan].precio;
  },

  _slug(nombre) {
    const base = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'taller';
    return base + '-' + Math.random().toString(36).slice(2,6);
  },

  async guardarNuevoTaller() {
    const v = id => document.getElementById(id)?.value?.trim() || '';
    const nombre = v('nt-nombre'), plan = v('nt-plan');
    const admNombre = v('nt-adm-nombre'), admEmail = v('nt-adm-email'), admPass = v('nt-adm-pass');
    if (!nombre) { UI.toast('El nombre del taller es obligatorio','error'); return; }
    if (!admNombre || !admEmail || !admPass) { UI.toast('Completa los datos del administrador','error'); return; }
    if (admPass.length < 6) { UI.toast('La contraseña debe tener al menos 6 caracteres','error'); return; }

    const btn = document.getElementById('nt-guardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }
    const reactivar = () => { if (btn) { btn.disabled = false; btn.textContent = 'Crear taller'; } };

    /* 1. Crear el tenant */
    const { data: tenant, error: tErr } = await DB.crearTenant({
      slug: this._slug(nombre),
      name: nombre,
      nit: v('nt-nit')||null,
      email: v('nt-email')||null,
      tel: v('nt-tel')||null,
      plan,
      precio_mensual: parseFloat(v('nt-precio'))||PLANES[plan]?.precio||0,
      suscripcion_vence: v('nt-vence')||null,
      ciclo_pago: 'mensual',
      active: true
    });
    if (tErr || !tenant) { UI.toast('Error creando el taller: '+(tErr?.message||''),'error'); reactivar(); return; }

    /* 2. Crear el usuario admin dentro del nuevo tenant (Edge crear-usuario) */
    const res = await Auth.crearUsuario({
      email: admEmail, password: admPass, nombre: admNombre,
      rol: 'admin', tenant_id: tenant.id
    });
    if (!res.ok) {
      /* rollback: no dejar un taller sin administrador */
      await DB.deleteTenantById(tenant.id).catch(()=>{});
      UI.toast('No se pudo crear el administrador: '+(res.error||''),'error');
      reactivar(); return;
    }

    UI.cerrarModal();
    UI.toast(`Taller "${nombre}" creado con su administrador ✓`);
    this.render();
  },

  /* ── EDITAR TALLER: plan, módulos, precio, vencimiento ── */
  modalTaller(id) {
    const t = this._tenants.find(x=>x.id===id); if (!t) return;
    const activos = Array.isArray(t.modulos_activos)&&t.modulos_activos.length ? t.modulos_activos : (PLANES[t.plan]?.modulos||[]);
    const hoy = new Date().toISOString().slice(0,10);
    UI.modal(`⚙️ ${t.name||t.slug}`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Plan</label>
          <select class="form-select" id="sa-plan" onchange="Modulos.superadmin._aplicarPlanModulos(this.value)">
            ${Object.entries(PLANES).map(([k,p])=>`<option value="${k}" ${t.plan===k?'selected':''}>${p.label} — ${UI.q(p.precio)}/mes</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Precio mensual (Q)</label>
          <input class="form-input" id="sa-precio" type="number" min="0" step="0.01" value="${t.precio_mensual||PLANES[t.plan]?.precio||0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Suscripción vence</label>
          <input class="form-input" id="sa-vence" type="date" value="${t.suscripcion_vence||''}"></div>
        <div class="form-group"><label class="form-label">Ciclo</label>
          <select class="form-select" id="sa-ciclo">
            ${['mensual','trimestral','anual'].map(c=>`<option ${t.ciclo_pago===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Módulos activos (a la carta)</label>
        <div id="sa-modulos" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:10px">
          ${MODULOS_VENDIBLES.map(m=>{ const lbl=labelModulo(m); return `
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="checkbox" class="sa-mod" value="${m}" ${activos.includes(m)?'checked':''}> ${lbl}
            </label>`;}).join('')}
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Dashboard, Calendario, Configuración, Usuarios, Administración y Respaldos siempre están incluidos.</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Límite Beto IA (consultas/mes)</label>
          <input class="form-input" id="sa-ia-limite" type="number" min="0" step="50" value="${t.ai_limite_mes??300}">
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Add-on sugerido: Q99/mes con 300 consultas (incluido en Empresarial).</div></div>
        <div class="form-group"><label class="form-label">Notas internas</label>
          <textarea class="form-input" id="sa-notas" rows="2">${t.notas_admin||''}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.superadmin.guardarTaller('${id}')">Guardar</button>
      </div>`, '600px');
  },

  _aplicarPlanModulos(plan) {
    const mods = PLANES[plan]?.modulos || [];
    document.querySelectorAll('.sa-mod').forEach(c=>{ c.checked = mods.includes(c.value); });
    const precio = document.getElementById('sa-precio');
    if (precio && PLANES[plan]) precio.value = PLANES[plan].precio;
  },

  async guardarTaller(id) {
    const modulos = Array.from(document.querySelectorAll('.sa-mod:checked')).map(c=>c.value);
    const fields = {
      plan: document.getElementById('sa-plan')?.value,
      precio_mensual: parseFloat(document.getElementById('sa-precio')?.value)||0,
      suscripcion_vence: document.getElementById('sa-vence')?.value||null,
      ciclo_pago: document.getElementById('sa-ciclo')?.value||'mensual',
      modulos_activos: modulos,
      ai_limite_mes: parseInt(document.getElementById('sa-ia-limite')?.value)||300,
      notas_admin: document.getElementById('sa-notas')?.value||null
    };
    const { error } = await DB.updateTenantById(id, fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Taller actualizado ✓');
    this.render();
  },

  async toggleActivo(id, activar) {
    const t = this._tenants.find(x=>x.id===id);
    const accion = activar ? 'reactivar' : 'suspender';
    if (!confirm(`¿Seguro que deseas ${accion} a "${t?.name||t?.slug}"?${activar?'':'\nNo podrá ingresar al sistema.'}`)) return;
    const { error } = await DB.updateTenantById(id, { active: activar });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(activar?'Taller reactivado ✓':'Taller suspendido');
    this.render();
  },

  /* ── COBROS ── */
  modalCobro(tenantId='') {
    const t = tenantId ? this._tenants.find(x=>x.id===tenantId) : null;
    UI.modal('💵 Registrar cobro', `
      <div class="form-group"><label class="form-label">Taller *</label>
        <select class="form-select" id="co-tenant">
          ${this._tenants.map(x=>`<option value="${x.id}" ${tenantId===x.id?'selected':''}>${x.name||x.slug}</option>`).join('')}
        </select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Periodo (mes) *</label>
          <input class="form-input" id="co-periodo" type="month" value="${this._mesActual()}"></div>
        <div class="form-group"><label class="form-label">Monto (Q) *</label>
          <input class="form-input" id="co-monto" type="number" min="0" step="0.01" value="${t?.precio_mensual||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Método</label>
          <select class="form-select" id="co-metodo">${['Transferencia','Depósito','Efectivo','Tarjeta','Cheque'].map(m=>`<option>${m}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="co-estado"><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Referencia / Notas</label>
        <input class="form-input" id="co-ref" placeholder="No. de boleta, observaciones..."></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-green" onclick="Modulos.superadmin.guardarCobro()">Registrar</button>
      </div>`);
  },

  async guardarCobro() {
    const tenant_id = document.getElementById('co-tenant')?.value;
    const monto = parseFloat(document.getElementById('co-monto')?.value)||0;
    if (!tenant_id || monto<=0) { UI.toast('Taller y monto son obligatorios','error'); return; }
    const fields = {
      tenant_id,
      periodo: document.getElementById('co-periodo')?.value||this._mesActual(),
      monto,
      metodo: document.getElementById('co-metodo')?.value,
      estado: document.getElementById('co-estado')?.value||'pagado',
      referencia: document.getElementById('co-ref')?.value||null,
      fecha: new Date().toISOString().slice(0,10)
    };
    const { error } = await DB.upsertTenantPago(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Cobro registrado ✓');
    this.render();
  },

  async eliminarPago(id) {
    if (!confirm('¿Eliminar este cobro?')) return;
    await DB.deleteTenantPago(id);
    UI.toast('Cobro eliminado');
    this.render();
  },

  /* ── OPERACIONES SaaS (Edge Functions; el cron diario hace esto solo) ── */
  async respaldarTodos() {
    UI.toast('Respaldando todos los talleres a Storage...','info');
    const { data, error } = await getSB().functions.invoke('backup-tenants', { body: {} });
    if (error || data?.error) { UI.toast('Error: '+(data?.error||error.message),'error'); return; }
    UI.toast(`Respaldo completo ✓ ${data.talleres} talleres · ${data.registros} registros`);
    if (data.errores?.length) console.warn('backup-tenants errores:', data.errores);
  },

  async enviarRecordatorios() {
    UI.toast('Enviando recordatorios de suscripción...','info');
    const { data, error } = await getSB().functions.invoke('saas-recordatorios', { body: {} });
    if (error || data?.error) { UI.toast('Error: '+(data?.error||error.message),'error'); return; }
    UI.toast(`Recordatorios ✓ ${data.enviados} enviados · ${data.por_vencer} por vencer · ${data.vencidos} vencidos`);
    if (data.errores?.length) console.warn('saas-recordatorios errores:', data.errores);
  }
};
