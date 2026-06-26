/* TallerPro v3.0 — comunicaciones */
Modulos.comunicaciones = {
  _tab: 'whatsapp',

  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">🔔 Comunicaciones</h1>
        <p class="page-subtitle">// Mensajes y notificaciones a tus clientes</p>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='whatsapp'?'active':''}" onclick="Modulos.comunicaciones._ir('whatsapp')">💬 WhatsApp</button>
          <button class="tab-btn ${this._tab==='email'?'active':''}" onclick="Modulos.comunicaciones._ir('email')">📧 Email</button>
          <button class="tab-btn ${this._tab==='config'?'active':''}" onclick="Modulos.comunicaciones._ir('config')">⚙️ Configuración</button>
        </div>
        <div id="com-content"></div>
      </div>`;
    this._renderTab();
  },

  _ir(t){ this._tab=t; App._subActivo=t; App._guardarRuta(); App.renderSidebar(); this._renderTab(); },

  _renderTab() {
    const el = document.getElementById('com-content');
    if (!el) return;
    const t = Auth.tenant || {};

    if (this._tab === 'whatsapp') {
      const waTel = t.whatsapp_tel || t.tel || '';
      el.innerHTML = `
        <div class="grid-2">
          <div class="card">
            <div class="card-sub mb-3">💬 Enviar Mensaje WhatsApp</div>
            <div class="alert alert-green" style="margin-bottom:14px">
              <div class="alert-icon">✅</div>
              <div class="alert-body" style="font-size:12px">
                <strong>Sin API — 100% directo.</strong> Al hacer clic se abre WhatsApp en tu teléfono o PC con el mensaje listo.
                No se requiere cuenta de Meta/Facebook ni configuración adicional.
              </div>
            </div>
            <div class="form-group"><label class="form-label">Número del cliente (con código de país)</label>
              <input class="form-input" id="wa-tel" placeholder="+50255011234"></div>
            <div class="form-group"><label class="form-label">Mensaje *</label>
              <textarea class="form-input" id="wa-msg" rows="4" placeholder="Hola, su vehículo está listo..."></textarea></div>
            <button class="btn btn-green" style="width:100%" onclick="Modulos.comunicaciones.enviarWA()">
              💬 Abrir WhatsApp con este mensaje
            </button>
            <div style="font-size:11px;color:var(--text3);margin-top:8px;text-align:center">
              El mensaje saldrá desde <strong>tu propio WhatsApp</strong>
              ${waTel ? '(+' + waTel + ')' : '— configura tu número en la pestaña Configuración'}
            </div>
          </div>
          <div class="card card-cyan">
            <div class="card-sub mb-3">📋 Plantillas Rápidas</div>
            <div id="wa-plantillas"></div>
          </div>
        </div>`;
      // Plantillas separadas para evitar escape de comillas en template anidado
      const plantillas = [
        { label: '✅ OT Lista',       msg: `✅ Hola, su vehículo está LISTO para retirar en ${t.name||'nuestro taller'}. Horario: 8am-6pm. ¡Gracias por su preferencia!` },
        { label: '🔧 En Proceso',     msg: `🔧 Buenas, su vehículo está en proceso de reparación en ${t.name||'el taller'}. Le avisamos cuando esté listo.` },
        { label: '📅 Cita mañana',    msg: `📅 Recordatorio: tiene una cita mañana en ${t.name||'nuestro taller'}. Por favor confírmenos su asistencia.` },
        { label: '🛢️ Mantenimiento',  msg: `🛢️ Hola, es tiempo del mantenimiento de su vehículo. Llámenos para agendar su cita en ${t.name||'el taller'}. ¡Le esperamos!` },
        { label: '💳 Pago pendiente', msg: `💳 Hola, tiene un saldo pendiente en ${t.name||'el taller'}. Por favor comuníquese con nosotros para coordinar.` },
      ];
      const cont = document.getElementById('wa-plantillas');
      if (cont) {
        cont.innerHTML = plantillas.map((p,i) => `
          <div style="padding:8px 10px;background:var(--surface2);border-radius:8px;margin-bottom:8px;cursor:pointer;border-left:3px solid var(--cyan)"
               data-pidx="${i}">
            <div style="font-weight:700;font-size:12px;color:var(--cyan)">${p.label}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">${p.msg.slice(0,65)}…</div>
          </div>`).join('');
        cont.querySelectorAll('[data-pidx]').forEach(div => {
          div.onclick = () => {
            const msg = document.getElementById('wa-msg');
            if (msg) msg.value = plantillas[+div.dataset.pidx].msg;
          };
        });
      }
    }

    else if (this._tab === 'email') {
      const smtpOk = !!(t.config_smtp && t.config_smtp.host);
      const plantillasEmail = [
        { label: 'OT Lista',       asunto: `Su vehículo está listo — ${t.name||'Taller'}`,
          msg: `Estimado cliente,\n\nNos complace informarle que su vehículo ya está listo para ser retirado en ${t.name||'nuestro taller'}.\n\nHorario: Lunes a Viernes 8am-6pm.\n\nGracias por confiar en nosotros.\n\n${t.name||''}\n${t.tel||''}` },
        { label: 'Presupuesto',    asunto: `Presupuesto de servicio — ${t.name||'Taller'}`,
          msg: `Estimado cliente,\n\nAdjuntamos el presupuesto solicitado para el servicio de su vehículo.\n\nQuedamos a sus órdenes para cualquier consulta.\n\n${t.name||''}\n${t.tel||''}` },
        { label: 'Pago pendiente', asunto: 'Recordatorio de pago pendiente',
          msg: `Estimado cliente,\n\nLe informamos que tiene un saldo pendiente con ${t.name||'nuestro taller'}.\n\nPor favor comuníquese al ${t.tel||''} para coordinar el pago.\n\nGracias.` },
      ];
      el.innerHTML = `
        <div class="grid-2">
          <div class="card">
            <div class="card-sub mb-3">📧 Enviar Email</div>
            ${smtpOk
              ? `<div class="alert alert-green" style="margin-bottom:12px"><div class="alert-icon">✅</div><div class="alert-body" style="font-size:12px">SMTP configurado: <strong>${t.config_smtp.host}</strong><br>Remitente: <strong>${t.config_smtp.from_email||t.email||''}</strong></div></div>`
              : `<div class="alert alert-cyan" style="margin-bottom:12px"><div class="alert-icon">📧</div><div class="alert-body" style="font-size:12px">Sin SMTP propio: se abrirá tu cliente de correo (Gmail, Outlook, etc.).<br>Para envíos automáticos, configura SMTP en la pestaña <strong>Configuración</strong>.</div></div>`
            }
            <div class="form-group"><label class="form-label">Para *</label>
              <input class="form-input" id="em-para" type="email" placeholder="cliente@gmail.com"></div>
            <div class="form-group"><label class="form-label">Asunto *</label>
              <input class="form-input" id="em-asunto" placeholder="Su vehículo está listo"></div>
            <div class="form-group"><label class="form-label">Mensaje *</label>
              <textarea class="form-input" id="em-msg" rows="5"></textarea></div>
            <button class="btn btn-cyan" style="width:100%" onclick="Modulos.comunicaciones.enviarEmail()">
              📧 ${smtpOk ? 'Enviar Email' : 'Abrir en cliente de correo'}
            </button>
          </div>
          <div class="card card-amber">
            <div class="card-sub mb-3">📋 Plantillas Email</div>
            <div id="email-plantillas"></div>
          </div>
        </div>`;
      const contE = document.getElementById('email-plantillas');
      if (contE) {
        contE.innerHTML = plantillasEmail.map((p,i) => `
          <div style="padding:8px 10px;background:var(--surface2);border-radius:8px;margin-bottom:8px;cursor:pointer;border-left:3px solid var(--amber)"
               data-eidx="${i}">
            <div style="font-weight:700;font-size:12px;color:var(--amber)">${p.label}</div>
          </div>`).join('');
        contE.querySelectorAll('[data-eidx]').forEach(div => {
          div.onclick = () => {
            const p = plantillasEmail[+div.dataset.eidx];
            const as = document.getElementById('em-asunto');
            const ms = document.getElementById('em-msg');
            if (as) as.value = p.asunto;
            if (ms) ms.value = p.msg;
          };
        });
      }
    }

    else if (this._tab === 'config') {
      const smtp   = t.config_smtp   || {};
      const infile = t.config_infile || { modo: 'tallerpro' };
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:20px;max-width:760px">

          <!-- ── WHATSAPP ── -->
          <div class="card card-green">
            <div class="card-sub mb-3">💬 WhatsApp — Configuración</div>
            <div class="alert alert-green" style="margin-bottom:14px">
              <div class="alert-icon">✅</div>
              <div class="alert-body" style="font-size:12px">
                <strong>No requiere API de Meta/Facebook.</strong><br>
                TallerPro usa enlaces <code>wa.me</code> que abren WhatsApp directamente desde tu dispositivo.
                Solo necesitas WhatsApp instalado. No hay costo adicional ni configuración de APIs.
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Número WhatsApp del Taller <span style="color:var(--text3);font-weight:400">(solo números, sin +)</span></label>
              <input class="form-input" id="cfg-watel" placeholder="50255011234"
                     value="${t.whatsapp_tel || (t.tel||'').replace(/[^0-9]/g,'')}">
              <div style="font-size:11px;color:var(--text3);margin-top:4px">Ejemplo: 50255011234 → código Guatemala (502) + 8 dígitos del taller</div>
            </div>
            <button class="btn btn-green" onclick="Modulos.comunicaciones.guardarWA()">💾 Guardar número WhatsApp</button>
          </div>

          <!-- ── EMAIL SMTP ── -->
          <div class="card card-cyan">
            <div class="card-sub mb-3">📧 Email — Configuración SMTP</div>
            <div class="alert alert-cyan" style="margin-bottom:14px">
              <div class="alert-icon">ℹ️</div>
              <div class="alert-body" style="font-size:12px">
                <strong>Sin SMTP propio:</strong> los emails se abren en tu cliente de correo (mailto:).<br>
                <strong>Con SMTP propio:</strong> los emails saldrán automáticamente desde tu propio correo
                (Gmail, Outlook, cPanel, etc). Rellena los campos y guarda.
              </div>
            </div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Servidor SMTP *</label>
                <input class="form-input" id="cfg-smtp-host" placeholder="smtp.gmail.com" value="${smtp.host||''}"></div>
              <div class="form-group"><label class="form-label">Puerto</label>
                <input class="form-input" id="cfg-smtp-port" placeholder="587" type="number" value="${smtp.port||''}"></div>
            </div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Usuario / Email de acceso *</label>
                <input class="form-input" id="cfg-smtp-user" type="email" placeholder="tu@correo.com" value="${smtp.user||''}"></div>
              <div class="form-group"><label class="form-label">Contraseña SMTP *</label>
                <input class="form-input" id="cfg-smtp-pass" type="password" placeholder="••••••••" value="${smtp.password||''}"></div>
            </div>
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Nombre del remitente</label>
                <input class="form-input" id="cfg-smtp-name" placeholder="${t.name||'Mi Taller'}" value="${smtp.from_name||t.name||''}"></div>
              <div class="form-group"><label class="form-label">Email visible al cliente</label>
                <input class="form-input" id="cfg-smtp-from" type="email" placeholder="notificaciones@mitaller.com" value="${smtp.from_email||t.email||''}"></div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
              <button class="btn btn-cyan" onclick="Modulos.comunicaciones.guardarSMTP()">💾 Guardar SMTP</button>
              ${smtp.host ? '<button class="btn btn-ghost btn-sm" onclick="Modulos.comunicaciones.limpiarSMTP()">🗑️ Quitar SMTP</button>' : ''}
            </div>
            <div style="font-size:11px;color:var(--text3);line-height:1.6">
              <strong>Gmail:</strong> smtp.gmail.com · Puerto 587 · Requiere "Contraseña de aplicación" (no tu contraseña normal).<br>
              <strong>Outlook/Hotmail:</strong> smtp-mail.outlook.com · Puerto 587.<br>
              <strong>cPanel/Hosting:</strong> mail.tudominio.com · Puerto 465 o 587.
            </div>
          </div>

          <!-- ── INFILE FEL ── -->
          <div class="card card-amber">
            <div class="card-sub mb-3">🧾 FEL / INFILE — Factura Electrónica</div>
            <div class="alert alert-amber" style="margin-bottom:14px">
              <div class="alert-icon">💡</div>
              <div class="alert-body" style="font-size:12px">
                INFILE cobra aprox. <strong>Q 400 por cada 100 facturas (Q 4/factura)</strong>.
                Puedes usar credenciales propias si ya tienes contrato con INFILE,
                o activar el servicio gestionado incluido en tu plan.
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Modo de Facturación Electrónica (FEL)</label>
              <select class="form-select" id="cfg-infile-modo"
                      onchange="Modulos.comunicaciones._toggleInfileMode(this.value)">
                <option value="tallerpro" ${infile.modo==='tallerpro'?'selected':''}>🏢 Gestionado por TallerPro (add-on — incluido en plan Empresarial)</option>
                <option value="propio"    ${infile.modo==='propio'   ?'selected':''}>🔑 Mis propias credenciales INFILE</option>
              </select>
            </div>
            <div id="infile-info-tallerpro" ${infile.modo==='propio'?'style="display:none"':''}>
              <div class="alert alert-green">
                <div class="alert-icon">✅</div>
                <div class="alert-body" style="font-size:12px">
                  <strong>TallerPro gestiona tu FEL.</strong><br>
                  Las facturas se certifican automáticamente a través del contrato INFILE de TallerPro.
                  No necesitas crear cuenta propia en INFILE. Para activar este servicio, comunícate con soporte TallerPro.
                </div>
              </div>
            </div>
            <div id="infile-campos-propios" ${infile.modo!=='propio'?'style="display:none"':''}>
              <div class="grid-2">
                <div class="form-group"><label class="form-label">Usuario INFILE *</label>
                  <input class="form-input" id="cfg-infile-user" placeholder="tu_usuario" value="${infile.usuario||''}"></div>
                <div class="form-group"><label class="form-label">Contraseña INFILE *</label>
                  <input class="form-input" id="cfg-infile-pass" type="password" placeholder="••••••••" value="${infile.password||''}"></div>
              </div>
              <div class="grid-2">
                <div class="form-group"><label class="form-label">NIT del emisor *</label>
                  <input class="form-input" id="cfg-infile-nit" placeholder="123456789" value="${infile.nit_emisor||t.nit||''}"></div>
                <div class="form-group"><label class="form-label">Alias / Firma electrónica</label>
                  <input class="form-input" id="cfg-infile-firma" placeholder="firma_taller" value="${infile.alias_firma||''}"></div>
              </div>
            </div>
            <button class="btn btn-amber" onclick="Modulos.comunicaciones.guardarInfile()">💾 Guardar configuración FEL</button>
          </div>

        </div>`;
    }
  },

  /* ─── WHATSAPP ───────────────────────────────────────── */
  enviarWA() {
    const tel = document.getElementById('wa-tel')?.value.trim().replace(/\s/g,'');
    const msg = document.getElementById('wa-msg')?.value.trim();
    if (!tel||!msg) { UI.toast('Ingresa número y mensaje','error'); return; }
    const num = tel.replace(/^\+/,'');
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
  },

  async guardarWA() {
    const tel = document.getElementById('cfg-watel')?.value.trim().replace(/[^0-9]/g,'');
    if (!tel) { UI.toast('Ingresa el número WhatsApp del taller','warn'); return; }
    const ok = await DB.updateTenant({ whatsapp_tel: tel, updated_at: new Date().toISOString() });
    if (ok) { Auth.tenant.whatsapp_tel = tel; UI.toast('Número WhatsApp guardado ✓'); }
    else UI.toast('Error al guardar','error');
  },

  /* ─── EMAIL ──────────────────────────────────────────── */
  enviarEmail() {
    const para   = document.getElementById('em-para')?.value.trim();
    const asunto = document.getElementById('em-asunto')?.value.trim();
    const msg    = document.getElementById('em-msg')?.value.trim();
    if (!para||!asunto||!msg) { UI.toast('Completa todos los campos','error'); return; }
    window.open(`mailto:${para}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(msg)}`, '_blank');
  },

  async guardarSMTP() {
    const smtp = {
      host:       document.getElementById('cfg-smtp-host')?.value.trim(),
      port:       parseInt(document.getElementById('cfg-smtp-port')?.value) || 587,
      user:       document.getElementById('cfg-smtp-user')?.value.trim(),
      password:   document.getElementById('cfg-smtp-pass')?.value,
      from_name:  document.getElementById('cfg-smtp-name')?.value.trim(),
      from_email: document.getElementById('cfg-smtp-from')?.value.trim(),
    };
    if (!smtp.host || !smtp.user || !smtp.password) {
      UI.toast('Servidor, usuario y contraseña son obligatorios','error'); return;
    }
    const ok = await DB.updateTenant({ config_smtp: smtp, updated_at: new Date().toISOString() });
    if (ok) { Auth.tenant.config_smtp = smtp; UI.toast('SMTP guardado ✓'); this._renderTab(); }
    else UI.toast('Error al guardar','error');
  },

  async limpiarSMTP() {
    if (!confirm('¿Quitar la configuración SMTP? Los emails se abrirán en tu cliente de correo.')) return;
    const ok = await DB.updateTenant({ config_smtp: {}, updated_at: new Date().toISOString() });
    if (ok) { Auth.tenant.config_smtp = {}; UI.toast('SMTP eliminado ✓'); this._renderTab(); }
    else UI.toast('Error','error');
  },

  /* ─── INFILE ─────────────────────────────────────────── */
  _toggleInfileMode(modo) {
    const info   = document.getElementById('infile-info-tallerpro');
    const campos = document.getElementById('infile-campos-propios');
    if (info)   info.style.display   = modo === 'propio' ? 'none' : '';
    if (campos) campos.style.display = modo === 'propio' ? '' : 'none';
  },

  async guardarInfile() {
    const modo = document.getElementById('cfg-infile-modo')?.value || 'tallerpro';
    const cfg  = { modo };
    if (modo === 'propio') {
      cfg.usuario    = document.getElementById('cfg-infile-user')?.value.trim();
      cfg.password   = document.getElementById('cfg-infile-pass')?.value;
      cfg.nit_emisor = document.getElementById('cfg-infile-nit')?.value.trim();
      cfg.alias_firma= document.getElementById('cfg-infile-firma')?.value.trim();
      if (!cfg.usuario || !cfg.password || !cfg.nit_emisor) {
        UI.toast('Usuario, contraseña y NIT del emisor son obligatorios','error'); return;
      }
    }
    const ok = await DB.updateTenant({ config_infile: cfg, updated_at: new Date().toISOString() });
    if (ok) { Auth.tenant.config_infile = cfg; UI.toast('Configuración FEL guardada ✓'); }
    else UI.toast('Error al guardar','error');
  },
};
