/* Panel SaaS — solo superadmin (dueño del producto).
   Gestiona comercios (planes, módulos, suscripción, suspensión),
   cobros mensuales (MRR, pendientes) y supervisa respaldos. */
Modulos.superadmin = {
  _tab: 'comercios',
  _tenants: [], _pagos: [], _solicitudes: [],
  _dbTenantId: null, _dbBackups: [],

  async render() {
    const el = document.getElementById('page-content');
    if (Auth.user?.rol !== 'superadmin') { el.innerHTML = '<div class="empty-state">Sin acceso</div>'; return; }
    UI.loading(el);
    [this._tenants, this._pagos, this._solicitudes] = await Promise.all([
      DB.getTenantsAdmin().catch(()=>[]),
      DB.getTenantPagos().catch(()=>[]),
      DB.getSolicitudes().catch(()=>[])
    ]);
    /* Comercios que verificaron su correo y esperan aprobación */
    this._pendMap = new Map(this._solicitudes.filter(s=>s.estado==='verificado'&&s.tenant_id).map(s=>[s.tenant_id, s]));

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">⚡ Panel SaaS</h1>
        <p class="page-subtitle">// gestión comercial de NexusPro</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.superadmin.respaldarTodos()" title="Respaldo inmediato de todos los comercios a Storage">💾 Respaldar todos</button>
          <button class="btn btn-ghost" onclick="Modulos.superadmin.enviarRecordatorios()" title="Enviar recordatorios de cobro/vencimiento por email">📧 Recordatorios</button>
          <button class="btn btn-amber" onclick="Modulos.superadmin.modalNuevoTaller()">➕ Nuevo comercio</button>
        </div>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='comercios'?'active':''}" onclick="Modulos.superadmin._ir('comercios')">🏪 Comercios</button>
          <button class="tab-btn ${this._tab==='solicitudes'?'active':''}" onclick="Modulos.superadmin._ir('solicitudes')">📥 Solicitudes${this._pendMap?.size?` <span class="badge badge-amber" style="font-size:10px">${this._pendMap.size}</span>`:''}</button>
          <button class="tab-btn ${this._tab==='cobros'?'active':''}" onclick="Modulos.superadmin._ir('cobros')">💵 Cobros</button>
          <button class="tab-btn ${this._tab==='planes'?'active':''}" onclick="Modulos.superadmin._ir('planes')">🎚️ Planes</button>
          <button class="tab-btn ${this._tab==='basedatos'?'active':''}" onclick="Modulos.superadmin._ir('basedatos')">🗄️ Base de datos</button>
        </div>
        <div id="sa-content"></div>
      </div>`;
    this._renderTab();
  },

  _ir(t){ this._tab=t; App._subActivo=t; App._guardarRuta(); App.renderSidebar(); App.marcarTabActivo(t); this._renderTab(); },

  /* ── SOPORTE: entrar a cualquier comercio ─────────────
     El superadmin cambia su tenant activo al del comercio y entra a su
     dashboard como si estuviera adentro. RLS lo permite (is_superadmin()),
     y getTID() usa Auth.tenant.id, así que todos los módulos quedan
     filtrados a ese comercio. Se guarda el tenant propio para volver. */
  _soporteReturn: undefined,
  async entrarComercio(id){
    const t = this._tenants.find(x=>x.id===id);
    if (!t) { UI.toast('Comercio no encontrado','error'); return; }
    if (this._soporteReturn === undefined) this._soporteReturn = Auth.tenant || null;
    Auth.tenant = t; window._cachedTenantId = t.id;
    this._pintarBarraSoporte(t);
    UI.toast(`Entraste a "${t.name||t.slug}" en modo soporte`, 'success');
    App.paginaActual = 'dashboard'; App._subActivo = null; App._guardarRuta();
    App.renderSidebar(); App.navegarA('dashboard');
  },
  salirSoporte(){
    if (this._soporteReturn !== undefined) {
      Auth.tenant = this._soporteReturn;
      window._cachedTenantId = this._soporteReturn?.id || null;
      this._soporteReturn = undefined;
    }
    document.getElementById('sa-soporte-bar')?.remove();
    this._tab = 'comercios'; App.paginaActual = 'superadmin'; App._subActivo = 'comercios'; App._guardarRuta();
    App.renderSidebar(); App.navegarA('superadmin');
  },
  _pintarBarraSoporte(t){
    let bar = document.getElementById('sa-soporte-bar');
    if (!bar) { bar = document.createElement('div'); bar.id='sa-soporte-bar'; document.body.appendChild(bar); }
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#b45309;color:#fff;'
      + 'padding:8px 14px;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;'
      + 'font-size:13px;box-shadow:0 -2px 10px rgba(0,0,0,.35)';
    bar.innerHTML = `🛟 <span>Modo soporte — estás dentro de <b>${t.name||t.slug}</b></span>`
      + `<button class="btn btn-sm" style="background:#fff;color:#b45309;font-weight:700" `
      + `onclick="Modulos.superadmin.salirSoporte()">← Volver al Panel SaaS</button>`;
  },

  _mesActual(){ const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; },
  _planLabel(p){ return (PLANES[p]?.label)||p||'—'; },

  _renderTab() {
    const el = document.getElementById('sa-content');
    if (!el) return;
    const hoy = new Date().toISOString().slice(0,10);
    const activos = this._tenants.filter(t=>t.active!==false);

    if (this._tab==='comercios') {
      const mrr = activos.reduce((s,t)=>s+(Number(t.precio_mensual)||0),0);
      const vencidos = this._tenants.filter(t=>t.suscripcion_vence && t.suscripcion_vence < hoy && t.active!==false);
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:20px">
          ${UI.kpiCard({ icon:'🏢', clase:'amber', label:'Comercios totales', value: this._tenants.length })}
          ${UI.kpiCard({ icon:'✅', clase:'green', label:'Activos', value: activos.length })}
          ${UI.kpiCard({ icon:'💰', clase:'cyan', label:'MRR (ingreso recurrente)', value: mrr, money:true, trend:'por mes' })}
          ${UI.kpiCard({ icon:'⚠️', clase: vencidos.length?'red':'gray', label:'Suscripciones vencidas', value: vencidos.length })}
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Comercio</th><th>Plan</th><th>Precio</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._tenants.map(t=>{
                const venc = t.suscripcion_vence && t.suscripcion_vence < hoy;
                const susp = t.active===false;
                const pend = this._pendMap?.has(t.id);   // verificó correo, espera aprobación
                const esDemo = (Number(t.precio_mensual)||0)===0 || /prueba/i.test(t.notas_admin||'');
                const estadoBadge = pend
                  ? '<span class="badge badge-amber">⏳ Por aprobar</span>'
                  : `<span class="badge badge-${susp?'red':'green'}">${susp?'Suspendido':'Activo'}</span>`;
                const planBadgeBase = `<span class="badge badge-${PLANES[t.plan]?.color||'gray'}">${this._planLabel(t.plan)}</span>`;
                const planBadge = esDemo
                  ? `<span class="badge badge-purple">🎁 DEMO</span> ${planBadgeBase}`
                  : planBadgeBase;
                return `<tr style="${susp&&!pend?'opacity:.55':''}">
                  <td><b>${t.name||t.slug||'—'}</b><br><small class="text-muted">${t.nit||''} ${t.email?('· '+t.email):''}</small></td>
                  <td>${planBadge}</td>
                  <td class="mono-sm">${UI.q(t.precio_mensual||0)}</td>
                  <td class="mono-sm ${venc?'text-red':''}">${t.suscripcion_vence?UI.fecha(t.suscripcion_vence):'—'}${venc?' ⚠️':''}</td>
                  <td>${estadoBadge}</td>
                  <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-amber" onclick="Modulos.superadmin.entrarComercio('${t.id}')" title="Entrar a este comercio para dar soporte">🛟 Entrar</button>
                    <button class="btn btn-sm btn-cyan" onclick="Modulos.superadmin.modalTaller('${t.id}')" title="Plan y módulos">⚙️</button>
                    ${pend ? `
                    <button class="btn btn-sm btn-green" onclick="Modulos.superadmin.aprobar('${t.id}')" title="Aprobar: activa el demo y avisa al cliente por correo">✅ Aprobar</button>
                    <button class="btn btn-sm btn-danger" onclick="Modulos.superadmin.rechazar('${t.id}')" title="Rechazar: borra el comercio (queda la solicitud como evidencia)">❌ Rechazar</button>
                    ` : `
                    <button class="btn btn-sm btn-green" onclick="Modulos.superadmin.modalCobro('${t.id}')" title="Registrar cobro">💵</button>
                    <button class="btn btn-sm ${susp?'btn-green':'btn-danger'}" onclick="Modulos.superadmin.toggleActivo('${t.id}',${susp})" title="${susp?'Reactivar':'Suspender'}">${susp?'▶️':'⏸️'}</button>
                    `}
                  </div></td>
                </tr>`;}).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin comercios registrados</td></tr>'}
            </tbody>
          </table>
        </div>`;
    }

    else if (this._tab==='solicitudes') {
      const S = this._solicitudes;
      const badgeEstado = {
        pendiente_verificacion: '<span class="badge badge-gray">✉️ Sin verificar</span>',
        verificado:             '<span class="badge badge-amber">⏳ Por aprobar</span>',
        aprobado:               '<span class="badge badge-green">✅ Aprobado</span>',
        rechazado:              '<span class="badge badge-red">❌ Rechazado</span>',
        expirado:               '<span class="badge badge-gray">⌛ Expirado</span>'
      };
      /* Detección de spam: correos con varias solicitudes rechazadas */
      const rechPorEmail = {};
      S.filter(s=>s.estado==='rechazado').forEach(s=>{ const k=(s.email||'').toLowerCase(); rechPorEmail[k]=(rechPorEmail[k]||0)+1; });
      const cont = { verificado:0, pendiente_verificacion:0, rechazado:0, aprobado:0, expirado:0 };
      S.forEach(s=>{ cont[s.estado]=(cont[s.estado]||0)+1; });
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:20px">
          ${UI.kpiCard({ icon:'⏳', clase: cont.verificado?'amber':'gray', label:'Por aprobar', value: cont.verificado })}
          ${UI.kpiCard({ icon:'✉️', clase:'gray', label:'Sin verificar', value: cont.pendiente_verificacion })}
          ${UI.kpiCard({ icon:'❌', clase: cont.rechazado?'red':'gray', label:'Rechazadas (spam)', value: cont.rechazado })}
          ${UI.kpiCard({ icon:'✅', clase:'green', label:'Aprobadas', value: cont.aprobado })}
        </div>
        <div class="alert alert-cyan" style="margin-bottom:16px"><div class="alert-icon">🛡️</div><div class="alert-body" style="font-size:12px">
          El comercio se crea solo cuando el cliente <b>verifica su correo</b>. Aquí apruebas (activa el demo y le
          avisas por correo) o rechazas (borra el comercio, pero la solicitud queda como <b>evidencia de spam</b>).
          Máximo <b>3 solicitudes por correo</b>.
        </div></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Comercio</th><th>Contacto</th><th>Tipo</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
            <tbody>
              ${S.map(s=>{
                const spam = (rechPorEmail[(s.email||'').toLowerCase()]||0) >= 2;
                return `<tr>
                  <td><b>${s.nombre_comercio||'—'}</b>${spam?' <span class="badge badge-red" style="font-size:10px" title="Correo con varias solicitudes rechazadas">🚩 spam</span>':''}<br><small class="text-muted">${s.nit||''}</small></td>
                  <td><small>${s.nombre_admin||''}<br>${s.email||''}${s.telefono?(' · '+s.telefono):''}</small></td>
                  <td><small>${s.tipo_negocio||'—'}</small></td>
                  <td>${badgeEstado[s.estado]||s.estado}</td>
                  <td class="mono-sm">${s.created_at?UI.fecha(s.created_at):'—'}</td>
                  <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                    ${s.estado==='verificado'&&s.tenant_id?`
                      <button class="btn btn-sm btn-green" onclick="Modulos.superadmin.aprobar('${s.tenant_id}')" title="Aprobar y avisar por correo">✅ Aprobar</button>
                      <button class="btn btn-sm btn-danger" onclick="Modulos.superadmin.rechazar('${s.tenant_id}')" title="Rechazar y borrar el comercio">❌ Rechazar</button>
                    `:'<span class="text-muted" style="font-size:12px">—</span>'}
                  </div></td>
                </tr>`;}).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin solicitudes</td></tr>'}
            </tbody>
          </table>
        </div>`;
    }

    else if (this._tab==='cobros') {
      const mesAct = this._mesActual();
      const tnById = id => this._tenants.find(t=>t.id===id);
      const cobradoMes = this._pagos.filter(p=>p.periodo===mesAct && p.estado==='pagado').reduce((s,p)=>s+(Number(p.monto)||0),0);
      const pendienteMes = this._pagos.filter(p=>p.periodo===mesAct && p.estado==='pendiente').reduce((s,p)=>s+(Number(p.monto)||0),0);
      /* Comercios activos sin pago registrado del mes */
      const conPago = new Set(this._pagos.filter(p=>p.periodo===mesAct).map(p=>p.tenant_id));
      const sinCobrar = activos.filter(t=>!conPago.has(t.id));
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:20px">
          ${UI.kpiCard({ icon:'💵', clase:'green', label:'Cobrado este mes', value: cobradoMes, money:true })}
          ${UI.kpiCard({ icon:'⏳', clase:'amber', label:'Pendiente este mes', value: pendienteMes, money:true })}
          ${UI.kpiCard({ icon:'⚠️', clase: sinCobrar.length?'red':'gray', label:`Sin cobrar (${mesAct})`, value: sinCobrar.length, trend:'comercios activos' })}
        </div>
        ${sinCobrar.length?`<div class="alert alert-amber" style="margin-bottom:16px"><div class="alert-icon">⏰</div><div class="alert-body" style="font-size:12px">
          Sin cobro de ${mesAct}: ${sinCobrar.map(t=>`<b>${t.name||t.slug}</b>`).join(', ')}.
        </div></div>`:''}
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Comercio</th><th>Periodo</th><th>Monto</th><th>Método</th><th>Estado</th><th></th></tr></thead>
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
              <div style="font-size:28px;font-weight:800;margin:6px 0">${p.negociable?'<span style="font-size:14px;color:var(--text3)">desde </span>':''}${UI.q(p.precio)}<span style="font-size:13px;color:var(--text3)">/mes</span></div>
              <div style="font-size:12px;color:var(--text3);margin-bottom:10px">${p.desc}</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                ${p.modulos.map(m=>`<span class="badge badge-gray" style="font-size:10px">${labelModulo(m)}</span>`).join('')}
                ${p.negociable?`<span class="badge badge-purple" style="font-size:10px">+ módulos a elección (c/u con precio)</span>`:''}
              </div>
            </div>`).join('')}
        </div>
        <div class="alert alert-cyan"><div class="alert-icon">💡</div><div class="alert-body" style="font-size:12px">
          Estos son los paquetes por defecto. En cada comercio (⚙️) puedes activar/desactivar módulos <b>a la carta</b>
          y fijar un precio propio, sin importar el plan. Los módulos de cuenta (Dashboard, Calendario, Configuración,
          Usuarios, Administración, Respaldos) están siempre incluidos.
        </div></div>
        <div class="alert alert-amber" style="margin-top:12px"><div class="alert-icon">🤖</div><div class="alert-body" style="font-size:12px">
          <b>Nexus (Asistente IA)</b> viene incluido en <b>Empresarial</b> y se vende como <b>add-on de Q99/mes</b>
          para Básico y Pro (actívalo a la carta en ⚙️ y suma Q99 al precio). Todos los comercios tienen un
          <b>tope mensual de consultas</b> (default 300, ampliable por comercio). Los comercios en prueba de 30 días
          lo traen activado para que lo conozcan.
        </div></div>`;
    }

    else if (this._tab==='basedatos') {
      el.innerHTML = `
        <div class="alert alert-red" style="margin-bottom:16px">
          <div class="alert-icon">⚠️</div>
          <div class="alert-body" style="font-size:12px">
            Herramientas de <b>alto riesgo</b>, solo superadmin. Restaurar o borrar sobrescribe los datos
            del comercio seleccionado. Antes de restaurar o borrar se genera automáticamente un respaldo
            de seguridad silencioso.
          </div>
        </div>
        <div class="form-group" style="max-width:420px">
          <label class="form-label">Comercio</label>
          <select class="form-select" id="db-tenant" onchange="Modulos.superadmin._dbCargar(this.value)">
            <option value="">— Selecciona un comercio —</option>
            ${this._tenants.map(t=>`<option value="${t.id}" ${this._dbTenantId===t.id?'selected':''}>${t.name||t.slug}</option>`).join('')}
          </select>
        </div>
        <div id="db-detalle"></div>`;
      if (this._dbTenantId) this._dbRenderDetalle();
    }
  },

  /* ── BASE DE DATOS (superadmin): respaldos por comercio, restaurar, borrar ── */
  async _dbCargar(id) {
    this._dbTenantId = id || null;
    this._dbBackups = [];
    if (!this._dbTenantId) { this._dbRenderDetalle(); return; }
    const el = document.getElementById('db-detalle');
    if (el) el.innerHTML = '<div class="empty-state">Cargando respaldos...</div>';
    const { data, error } = await getSB().functions.invoke('tenant-db-tools', { body:{ op:'listar', tenant_id:this._dbTenantId } });
    if (error || data?.error) { UI.toast('Error: '+(data?.error||error.message),'error'); this._dbBackups=[]; }
    else this._dbBackups = data.backups||[];
    this._dbRenderDetalle();
  },

  _dbRenderDetalle() {
    const el = document.getElementById('db-detalle');
    if (!el) return;
    if (!this._dbTenantId) { el.innerHTML=''; return; }
    const t = this._tenants.find(x=>x.id===this._dbTenantId);
    el.innerHTML = `
      <div class="table-wrap" style="margin-top:16px">
        <table class="data-table">
          <thead><tr><th>Respaldo</th><th>Tamaño</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._dbBackups.map(b=>`<tr>
              <td class="mono-sm">${b.nombre}</td>
              <td class="mono-sm">${b.tamano?Math.round(b.tamano/1024)+' KB':'—'}</td>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                ${b.url?`<a class="btn btn-sm btn-cyan" href="${b.url}" target="_blank">⬇️ Descargar</a>`:''}
                <button class="btn btn-sm btn-amber" onclick="Modulos.superadmin._dbRestaurar('${b.nombre}')">♻️ Restaurar</button>
              </div></td>
            </tr>`).join('')||'<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text3)">Sin respaldos para este comercio</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:20px;border:2px solid var(--red)">
        <div style="font-weight:800;color:var(--red);margin-bottom:6px">🗑️ Borrar datos de "${t?.name||t?.slug}"</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:10px">
          Elimina todos los datos operativos de este comercio (clientes, órdenes, facturas, inventario, finanzas, etc.).
          Se genera un respaldo de seguridad automático antes de borrar. Esta acción no se puede deshacer desde la app.
        </div>
        <div class="form-group">
          <label class="form-label">Escribe <b>${t?.slug||t?.id}</b> para confirmar</label>
          <input class="form-input" id="db-confirm-borrar" placeholder="${t?.slug||''}">
        </div>
        <button class="btn btn-danger" onclick="Modulos.superadmin._dbBorrar()">Borrar datos del comercio</button>
      </div>`;
  },

  async _dbRestaurar(nombre) {
    const t = this._tenants.find(x=>x.id===this._dbTenantId);
    if (!confirm(`¿Restaurar "${t?.name||t?.slug}" con el respaldo ${nombre}?\n\nSe sobrescribirán los datos actuales (se genera un respaldo de seguridad antes de continuar).`)) return;
    UI.toast('Restaurando...','info');
    const { data, error } = await getSB().functions.invoke('tenant-db-tools', {
      body:{ op:'restaurar', tenant_id:this._dbTenantId, path:`${this._dbTenantId}/${nombre}` }
    });
    if (error || data?.error) { UI.toast('Error: '+(data?.error||error.message),'error'); return; }
    UI.toast(`Restauración completa ✓ ${data.tablas} tablas · ${data.registros} registros`);
    this._dbCargar(this._dbTenantId);
  },

  async _dbBorrar() {
    const t = this._tenants.find(x=>x.id===this._dbTenantId);
    const txt = document.getElementById('db-confirm-borrar')?.value?.trim();
    if (!t || txt !== (t.slug||t.id)) { UI.toast('Escribe el identificador exacto del comercio para confirmar','error'); return; }
    if (!confirm(`¿Borrar TODOS los datos de "${t.name||t.slug}"?\n\nSe generará un respaldo de seguridad automático antes de borrar. Esta acción no se puede deshacer desde la app.`)) return;
    UI.toast('Borrando datos del comercio...','info');
    const { data, error } = await getSB().functions.invoke('tenant-db-tools', { body:{ op:'borrar', tenant_id:this._dbTenantId } });
    if (error || data?.error) { UI.toast('Error: '+(data?.error||error.message),'error'); return; }
    UI.toast(`Datos borrados ✓ ${data.registros_eliminados} registros eliminados`);
    this._dbCargar(this._dbTenantId);
  },

  /* ── NUEVO TALLER: tenant + usuario admin en un paso ── */
  modalNuevoTaller() {
    const venceDefault = (()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,10); })();
    UI.modal('➕ Nuevo comercio', `
      <div style="font-weight:700;font-size:13px;color:var(--amber);margin-bottom:8px">Datos del comercio</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre del comercio *</label>
          <input class="form-input" id="nt-nombre" placeholder="Comercio El Buen Freno"></div>
        <div class="form-group"><label class="form-label">NIT</label>
          <input class="form-input" id="nt-nit" placeholder="CF o 1234567-8"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email del comercio</label>
          <input class="form-input" id="nt-email" type="email" placeholder="contacto@comercio.com"></div>
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
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:4px">
        <input type="checkbox" id="nt-demo" onchange="Modulos.superadmin._toggleDemoNuevo(this.checked)">
        <span>🎁 Crear como <b>DEMO</b> — prueba gratis 30 días, sin cobro (precio Q0 y vence en 30 días)</span>
      </label>
      <div style="font-weight:700;font-size:13px;color:var(--amber);margin:14px 0 8px;border-top:1px solid var(--border);padding-top:12px">Usuario administrador del comercio</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-input" id="nt-adm-nombre" placeholder="Juan Pérez"></div>
        <div class="form-group"><label class="form-label">Email (login) *</label>
          <input class="form-input" id="nt-adm-email" type="email" placeholder="dueno@comercio.com"></div>
      </div>
      <div class="form-group"><label class="form-label">Contraseña inicial *</label>
        <input class="form-input" id="nt-adm-pass" type="text" placeholder="Mínimo 6 caracteres">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Se le pedirá cambiarla al primer ingreso.</div></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" id="nt-guardar" onclick="Modulos.superadmin.guardarNuevoTaller()">Crear comercio</button>
      </div>`, '640px');
  },

  _precioDePlan(plan) {
    const precio = document.getElementById('nt-precio');
    if (precio && PLANES[plan]) precio.value = PLANES[plan].precio;
  },

  /* DEMO en "Nuevo comercio": precio 0 y vence en 30 días. */
  _toggleDemoNuevo(demo) {
    const precio = document.getElementById('nt-precio');
    const vence = document.getElementById('nt-vence');
    if (demo) {
      if (precio) { precio.value = 0; precio.disabled = true; }
      if (vence) { vence.value = new Date(Date.now()+30*86400000).toISOString().slice(0,10); vence.disabled = true; }
    } else {
      if (precio) { precio.disabled = false; this._precioDePlan(document.getElementById('nt-plan')?.value); }
      if (vence) { vence.disabled = false; }
    }
  },

  _slug(nombre) {
    const base = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'comercio';
    return base + '-' + Math.random().toString(36).slice(2,6);
  },

  async guardarNuevoTaller() {
    const v = id => document.getElementById(id)?.value?.trim() || '';
    const nombre = v('nt-nombre'), plan = v('nt-plan');
    const admNombre = v('nt-adm-nombre'), admEmail = v('nt-adm-email'), admPass = v('nt-adm-pass');
    if (!nombre) { UI.toast('El nombre del comercio es obligatorio','error'); return; }
    if (!admNombre || !admEmail || !admPass) { UI.toast('Completa los datos del administrador','error'); return; }
    if (admPass.length < 6) { UI.toast('La contraseña debe tener al menos 6 caracteres','error'); return; }

    const btn = document.getElementById('nt-guardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }
    const reactivar = () => { if (btn) { btn.disabled = false; btn.textContent = 'Crear comercio'; } };

    /* 1. Crear el tenant (DEMO = precio 0 + vence +30 + notas de prueba) */
    const demo = document.getElementById('nt-demo')?.checked;
    const venceDemo = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    const { data: tenant, error: tErr } = await DB.crearTenant({
      slug: this._slug(nombre),
      name: nombre,
      nit: v('nt-nit')||null,
      email: v('nt-email')||null,
      tel: v('nt-tel')||null,
      plan,
      precio_mensual: demo ? 0 : (parseFloat(v('nt-precio'))||PLANES[plan]?.precio||0),
      suscripcion_vence: demo ? venceDemo : (v('nt-vence')||null),
      ciclo_pago: 'mensual',
      notas_admin: demo ? 'Prueba gratis 30 días (demo otorgado por administrador).' : null,
      active: true
    });
    if (tErr || !tenant) { UI.toast('Error creando el comercio: '+(tErr?.message||''),'error'); reactivar(); return; }

    /* 2. Crear el usuario admin dentro del nuevo tenant (Edge crear-usuario) */
    const res = await Auth.crearUsuario({
      email: admEmail, password: admPass, nombre: admNombre,
      rol: 'admin', tenant_id: tenant.id
    });
    if (!res.ok) {
      /* rollback: no dejar un comercio sin administrador */
      await DB.deleteTenantById(tenant.id).catch(()=>{});
      UI.toast('No se pudo crear el administrador: '+(res.error||''),'error');
      reactivar(); return;
    }

    UI.cerrarModal();
    UI.toast(`Comercio "${nombre}" creado con su administrador ✓`);
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
          <div style="display:flex;gap:6px">
            <input class="form-input" id="sa-precio" type="number" min="0" step="0.01" value="${t.precio_mensual||PLANES[t.plan]?.precio||0}" style="flex:1">
            <button class="btn btn-sm btn-amber" title="Marcar como DEMO: precio Q0 y vence en 30 días" onclick="Modulos.superadmin._aplicarDemo()">🎁 DEMO 30d</button>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">🎁 DEMO = prueba gratis: precio Q0 y vence en 30 días (se auto-suspende al vencer)</div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Suscripción vence</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="sa-vence" type="date" value="${t.suscripcion_vence||''}" style="flex:1">
            <button class="btn btn-sm btn-cyan" title="Convertir a cliente: regala los días que quedan del mes (gracia) y cobra desde el mes siguiente completo" onclick="Modulos.superadmin._aplicarGracia()">🎁</button>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">🎁 = gracia: resto del mes gratis + 1er mes completo (vence fin del mes siguiente)</div></div>
        <div class="form-group"><label class="form-label">Ciclo</label>
          <select class="form-select" id="sa-ciclo">
            ${['mensual','trimestral','anual'].map(c=>`<option ${t.ciclo_pago===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Módulos activos (a la carta)</label>
        <div id="sa-modulos" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:10px">
          ${MODULOS_VENDIBLES.map(m=>{ const lbl=labelModulo(m); const enBase=PLANES.medida.modulos.includes(m); return `
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="checkbox" class="sa-mod" value="${m}" ${activos.includes(m)?'checked':''} onchange="Modulos.superadmin._recalcPrecioMedida()">
              <span style="flex:1">${lbl}</span>
              <span class="sa-mod-precio" style="font-size:10px;color:var(--text3)">${enBase?'base':'+'+UI.q(MODULOS_PRECIOS[m]||0)}</span>
            </label>`;}).join('')}
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Dashboard, Calendario, Configuración, Usuarios, Administración y Respaldos siempre están incluidos.</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Límite Nexus IA (consultas/mes)</label>
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

  /* 🎁 DEMO: precio Q0 + vence en 30 días + marca de prueba en notas.
     El comercio queda como demo (banner de prueba y auto-suspensión al vencer). */
  _aplicarDemo() {
    const precio = document.getElementById('sa-precio');
    const vence = document.getElementById('sa-vence');
    const notas = document.getElementById('sa-notas');
    if (precio) precio.value = 0;
    if (vence) vence.value = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    if (notas && !/prueba/i.test(notas.value)) {
      notas.value = (notas.value ? notas.value.trim()+' ' : '') + 'Prueba gratis 30 días.';
    }
    UI.toast('Modo DEMO: Q0 y vence en 30 días. Guarda para aplicar ✓','info');
  },

  /* 🎁 Conversión con gracia: si la demo termina (o terminó) a media mes,
     los días restantes de ESE mes son gratis y el primer mes cobrado es el
     siguiente completo → vence = último día del mes siguiente. */
  _aplicarGracia() {
    const inp = document.getElementById('sa-vence');
    if (!inp) return;
    const base = inp.value ? new Date(inp.value + 'T00:00:00') : new Date();
    const hoy = new Date();
    const ref = base > hoy ? base : hoy;            // demo ya vencida → contar desde hoy
    const fin = new Date(ref.getFullYear(), ref.getMonth() + 2, 0); // último día del mes siguiente
    inp.value = `${fin.getFullYear()}-${String(fin.getMonth()+1).padStart(2,'0')}-${String(fin.getDate()).padStart(2,'0')}`;
    UI.toast(`Gracia aplicada: cobra desde el mes siguiente — vence ${UI.fecha(inp.value)} ✓`,'info');
  },

  _aplicarPlanModulos(plan) {
    const mods = PLANES[plan]?.modulos || [];
    document.querySelectorAll('.sa-mod').forEach(c=>{ c.checked = mods.includes(c.value); });
    const precio = document.getElementById('sa-precio');
    if (precio && PLANES[plan]) precio.value = PLANES[plan].precio;
    this._recalcPrecioMedida();
  },

  /* Plan A la Medida: precio = base + suma de los módulos extra marcados.
     Solo recalcula en ese plan; en los demás el precio del plan manda. */
  _recalcPrecioMedida() {
    if (document.getElementById('sa-plan')?.value !== 'medida') return;
    const precio = document.getElementById('sa-precio');
    if (!precio) return;
    let total = PLANES.medida.precio;
    document.querySelectorAll('.sa-mod:checked').forEach(c => {
      if (!PLANES.medida.modulos.includes(c.value)) total += (MODULOS_PRECIOS[c.value] || 0);
    });
    precio.value = total;
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
    UI.cerrarModal(); UI.toast('Comercio actualizado ✓');
    this.render();
  },

  /* Aprobar un comercio verificado: activa + correo "acceso habilitado" (Edge) */
  async aprobar(tenantId) {
    const t = this._tenants.find(x=>x.id===tenantId);
    if (!confirm(`¿Aprobar "${t?.name||t?.slug}"?\nSe activará su demo y se le avisará por correo.`)) return;
    UI.toast('Aprobando comercio...','info');
    const { data, error } = await getSB().functions.invoke('aprobar-comercio', { body: { tenant_id: tenantId } });
    if (error || data?.error) { UI.toast('Error: '+(data?.error||error.message),'error'); return; }
    UI.toast('Comercio aprobado y notificado ✓','success');
    this.render();
  },

  /* Rechazar: borra el comercio del SaaS pero deja la solicitud como evidencia (Edge) */
  async rechazar(tenantId) {
    const t = this._tenants.find(x=>x.id===tenantId);
    if (!confirm(`¿Rechazar "${t?.name||t?.slug}"?\nSe BORRARÁ el comercio. La solicitud quedará registrada para identificar spam.`)) return;
    const motivo = prompt('Motivo del rechazo (opcional):','')||null;
    UI.toast('Rechazando comercio...','info');
    const { data, error } = await getSB().functions.invoke('rechazar-comercio', { body: { tenant_id: tenantId, motivo } });
    if (error || data?.error) { UI.toast('Error: '+(data?.error||error.message),'error'); return; }
    UI.toast('Comercio rechazado y eliminado ✓');
    this.render();
  },

  async toggleActivo(id, activar) {
    const t = this._tenants.find(x=>x.id===id);
    const accion = activar ? 'reactivar' : 'suspender';
    if (!confirm(`¿Seguro que deseas ${accion} a "${t?.name||t?.slug}"?${activar?'':'\nNo podrá ingresar al sistema.'}`)) return;
    const { error } = await DB.updateTenantById(id, { active: activar });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(activar?'Comercio reactivado ✓':'Comercio suspendido');
    this.render();
  },

  /* ── COBROS ── */
  modalCobro(tenantId='') {
    const t = tenantId ? this._tenants.find(x=>x.id===tenantId) : null;
    UI.modal('💵 Registrar cobro', `
      <div class="form-group"><label class="form-label">Comercio *</label>
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
    if (!tenant_id || monto<=0) { UI.toast('Comercio y monto son obligatorios','error'); return; }
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
    UI.toast('Respaldando todos los comercios a Storage...','info');
    const { data, error } = await getSB().functions.invoke('backup-tenants', { body: {} });
    if (error || data?.error) { UI.toast('Error: '+(data?.error||error.message),'error'); return; }
    UI.toast(`Respaldo completo ✓ ${data.talleres} comercios · ${data.registros} registros`);
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
