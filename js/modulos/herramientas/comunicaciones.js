/* TallerPro v3.0 — comunicaciones/index.js */
Modulos.comunicaciones = {
  _tab: 'whatsapp',

  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">🔔 Comunicaciones</h1>
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

    if (this._tab === 'whatsapp') {
      el.innerHTML = `
        <div class="grid-2">
          <div class="card">
            <div class="card-sub mb-3">💬 Enviar Mensaje WhatsApp</div>
            <div class="form-group"><label class="form-label">Número (con código país)</label>
              <input class="form-input" id="wa-tel" placeholder="+50255011234"></div>
            <div class="form-group"><label class="form-label">Mensaje *</label>
              <textarea class="form-input" id="wa-msg" rows="4" placeholder="Hola [nombre], su vehículo está listo..."></textarea></div>
            <button class="btn btn-green" style="width:100%" onclick="Modulos.comunicaciones.enviarWA()">
              💬 Enviar por WhatsApp Web
            </button>
          </div>
          <div class="card card-cyan">
            <div class="card-sub mb-3">📋 Plantillas Rápidas</div>
            ${[
              {label:'OT Lista', msg:'✅ Hola {nombre}, su vehículo {placa} está LISTO para retirar en nuestro taller. Horario: 8am-6pm. ¡Gracias por su preferencia!'},
              {label:'OT En Proceso', msg:'🔧 Hola {nombre}, su vehículo {placa} está en proceso de reparación. Le avisamos cuando esté listo.'},
              {label:'Recordatorio Cita', msg:'📅 Recordatorio: tiene una cita mañana en nuestro taller. Por favor confirme su asistencia.'},
              {label:'Mantenimiento', msg:'🚗 Hola {nombre}, es tiempo del mantenimiento de su vehículo {placa}. Llámenos al {tel} para agendar.'}
            ].map(t=>`
              <div style="padding:8px;background:var(--surface2);border-radius:8px;margin-bottom:8px;cursor:pointer"
                   onclick="document.getElementById('wa-msg').value=\`${t.msg}\`">
                <div style="font-weight:700;font-size:12px;color:var(--cyan)">${t.label}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px">${t.msg.slice(0,60)}...</div>
              </div>`).join('')}
          </div>
        </div>`;
    }

    else if (this._tab === 'email') {
      el.innerHTML = `
        <div class="card" style="max-width:600px">
          <div class="card-sub mb-3">📧 Enviar Email</div>
          <div class="alert alert-amber" style="margin-bottom:16px">
            <div class="alert-icon">⚠️</div>
            <div class="alert-body" style="font-size:12px">Configura el servidor SMTP en la pestaña Configuración para habilitar el envío de emails.</div>
          </div>
          <div class="form-group"><label class="form-label">Para *</label>
            <input class="form-input" id="em-para" type="email" placeholder="cliente@gmail.com"></div>
          <div class="form-group"><label class="form-label">Asunto *</label>
            <input class="form-input" id="em-asunto" placeholder="Su vehículo está listo"></div>
          <div class="form-group"><label class="form-label">Mensaje *</label>
            <textarea class="form-input" id="em-msg" rows="6"></textarea></div>
          <button class="btn btn-cyan" style="width:100%" onclick="Modulos.comunicaciones.abrirEmail()">
            📧 Abrir en cliente de correo
          </button>
        </div>`;
    }

    else if (this._tab === 'config') {
      el.innerHTML = `
        <div class="grid-2">
          <div class="card">
            <div class="card-sub mb-3">💬 CallMeBot / WhatsApp API</div>
            <div class="form-group"><label class="form-label">API Key CallMeBot</label>
              <input class="form-input" id="cfg-wakey" placeholder="xxxxxxxx"
                     value="${localStorage.getItem('tp_wakey')||''}"></div>
            <div class="form-group"><label class="form-label">Número WhatsApp del Taller</label>
              <input class="form-input" id="cfg-watel" placeholder="+50255011234"
                     value="${localStorage.getItem('tp_watel')||''}"></div>
            <button class="btn btn-green" onclick="Modulos.comunicaciones.guardarConfigWA()">Guardar</button>
            <div style="margin-top:12px;font-size:11px;color:var(--text3)">
              Obtén tu API Key gratis en <a href="https://www.callmebot.com" target="_blank" style="color:var(--cyan)">callmebot.com</a>
            </div>
          </div>
          <div class="card">
            <div class="card-sub mb-3">📧 Configuración SMTP</div>
            <div class="alert alert-cyan">
              <div class="alert-icon">🔧</div>
              <div class="alert-body" style="font-size:12px">
                Integración SMTP disponible en próxima versión.<br>
                Por ahora usa "Abrir en cliente de correo" para enviar emails.
              </div>
            </div>
          </div>
        </div>`;
    }
  },

  enviarWA() {
    const tel = document.getElementById('wa-tel')?.value.trim().replace(/\s/g,'');
    const msg = document.getElementById('wa-msg')?.value.trim();
    if (!tel||!msg) { UI.toast('Ingresa teléfono y mensaje','error'); return; }
    const url = `https://wa.me/${tel.replace('+','')}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  },

  abrirEmail() {
    const para   = document.getElementById('em-para')?.value.trim();
    const asunto = document.getElementById('em-asunto')?.value.trim();
    const msg    = document.getElementById('em-msg')?.value.trim();
    if (!para||!asunto||!msg) { UI.toast('Completa todos los campos','error'); return; }
    window.open(`mailto:${para}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(msg)}`, '_blank');
  },

  guardarConfigWA() {
    localStorage.setItem('tp_wakey', document.getElementById('cfg-wakey')?.value||'');
    localStorage.setItem('tp_watel', document.getElementById('cfg-watel')?.value||'');
    UI.toast('Configuración WhatsApp guardada ✓');
  }
};
