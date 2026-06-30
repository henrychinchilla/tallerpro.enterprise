/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/integraciones.js — WhatsApp e IA (cliente)

   Todo pasa por Edge Functions (claves del lado servidor).
   Si una integración no está configurada, la Edge Function
   responde 503 y aquí se maneja con un aviso, sin romper la app.
═══════════════════════════════════════════════════════ */

/* Helper común para invocar Edge Functions y normalizar errores */
async function _invocar(fn, body) {
  const { data, error } = await getSB().functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    let status = error?.context?.status;
    try { const j = await error.context.json(); if (j?.error) { msg = j.error; } } catch (_) {}
    const low = (error.message || '').toLowerCase();
    /* Función aún no desplegada en el servidor */
    if (status === 404 || error.name === 'FunctionsFetchError' ||
        low.includes('failed to send') || low.includes('failed to fetch')) {
      msg = 'Esta función todavía no está activada en el servidor. ' +
            'Falta desplegarla (ver INTEGRACIONES.md).';
    }
    return { ok: false, error: msg };
  }
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, ...data };
}

/* ── WHATSAPP ──────────────────────────────────────── */
const WhatsApp = {
  /* Texto libre (solo válido dentro de la ventana de 24h del cliente) */
  async enviar(to, texto, referencia_id = null) {
    if (!to) return { ok: false, error: 'Sin número de destino' };
    return _invocar('whatsapp-send', { tipo: 'text', to, texto, referencia_id });
  },

  /* Plantilla pre-aprobada (para iniciar conversación) */
  async plantilla(to, name, language = 'es', components = [], referencia_id = null) {
    return _invocar('whatsapp-send', {
      tipo: 'template', to,
      template: { name, language, components },
      referencia_id
    });
  },

  /* Conveniencia: avisar al cliente que su OT cambió de estado */
  async notificarEstadoOT(orden, cliente) {
    const tel = cliente?.tel;
    if (!tel) return { ok: false, error: 'El cliente no tiene teléfono' };
    const estado = (ESTADOS_OT[orden.estado]?.label) || orden.estado;
    const taller = Auth.tenant?.name || 'tu taller';
    const texto =
      `🔧 *${taller}*\n` +
      `Hola${cliente.nombre ? ' ' + cliente.nombre : ''}, tu orden ${orden.num || ''} ` +
      `cambió a estado: *${estado}*.\n` +
      (orden.saldo ? `Saldo pendiente: ${UI.q(orden.saldo)}.\n` : '') +
      `¡Gracias por tu preferencia!`;
    return WhatsApp.enviar(tel, texto, orden.id);
  }
};

/* ── EMAIL (Resend) ────────────────────────────────── */
const Email = {
  /* Envía un correo. Acepta html y/o text. */
  async enviar(to, subject, { html = null, text = null, referencia_id = null } = {}) {
    if (!to) return { ok: false, error: 'Sin destinatario' };
    if (!subject) return { ok: false, error: 'Sin asunto' };
    return _invocar('email-send', { to, subject, html, text, referencia_id });
  },

  /* Conveniencia: avisar al cliente que su OT cambió de estado */
  async notificarEstadoOT(orden, cliente) {
    const email = cliente?.email;
    if (!email) return { ok: false, error: 'El cliente no tiene email' };
    const estado = (ESTADOS_OT[orden.estado]?.label) || orden.estado;
    const taller = Auth.tenant?.name || 'tu taller';
    const html =
      `<div style="font-family:Arial,sans-serif;max-width:520px">` +
      `<h2 style="color:#d97706">🔧 ${taller}</h2>` +
      `<p>Hola${cliente.nombre ? ' ' + cliente.nombre : ''},</p>` +
      `<p>Tu orden <b>${orden.num || ''}</b> cambió a estado: <b>${estado}</b>.</p>` +
      (orden.saldo ? `<p>Saldo pendiente: <b>${UI.q(orden.saldo)}</b>.</p>` : '') +
      `<p>¡Gracias por tu preferencia!</p></div>`;
    return Email.enviar(email, `${taller} — Orden ${orden.num || ''}: ${estado}`, { html, referencia_id: orden.id });
  }
};

/* ── NIT (verificación SAT / certificador FEL) ──────── */
const NIT = {
  limpiar(n) { return (n || '').toString().replace(/[\s-]/g, '').toUpperCase(); },
  esCF(n) { const x = NIT.limpiar(n); return !x || x === 'CF' || x === 'C/F'; },

  /* Valida el dígito verificador localmente (algoritmo SAT, módulo 11) */
  validarLocal(nit) {
    if (NIT.esCF(nit)) return { valido: true, cf: true };
    const n = NIT.limpiar(nit);
    if (!/^[0-9]+K?$/.test(n)) return { valido: false, cf: false };
    const verif = n.slice(-1), numero = n.slice(0, -1);
    if (!/^\d+$/.test(numero) || !numero.length) return { valido: false, cf: false };
    let suma = 0; const L = numero.length;
    for (let i = 0; i < L; i++) suma += Number(numero[i]) * (L - i + 1);
    const comp = (11 - (suma % 11)) % 11;
    const calc = comp === 10 ? 'K' : String(comp);
    return { valido: calc === verif, cf: false };
  },

  /* Consulta en línea (Edge Function nit-sat: dígito + nombre vía FEL) */
  async consultar(nit) {
    if (NIT.esCF(nit)) return { ok: true, cf: true, valido: true, nit: 'CF' };
    return _invocar('nit-sat', { nit: NIT.limpiar(nit) });
  }
};

/* ── IA (Claude) ───────────────────────────────────── */
const IA = {
  async _pedir(modo, mensaje, contexto = {}) {
    return _invocar('ai-assistant', { modo, mensaje, contexto });
  },

  preguntar(mensaje)            { return IA._pedir('chat', mensaje); },
  tecnico(mensaje)              { return IA._pedir('tecnico', mensaje); },
  insights()                    { return IA._pedir('insights', ''); },
  redactar(que, contexto = {})  { return IA._pedir('redaccion', que, contexto); },
  diagnostico(vehiculo, sintomas) {
    return IA._pedir('diagnostico',
      `Síntomas: ${sintomas}`,
      { vehiculo });
  },
  async escanearTarjeta(imagenBase64) {
    return _invocar('ai-assistant', { modo: 'tarjeta', imagen_base64: imagenBase64 });
  },

  /* ── Chat flotante con Nexus ────────────────────── */
  abrirChat() {
    UI.modal('🔧 Nexus — Asistente IA', `
      <div class="tabs" style="margin:-4px 0 14px">
        <button class="tab-btn active" id="nexus-tab-chat" onclick="IA._tabChat()">💬 Chat</button>
        <button class="tab-btn" id="nexus-tab-hist" onclick="IA._tabHistorial()">📋 Historial</button>
      </div>

      <div id="nexus-panel-chat">
        <div id="ia-historial" style="max-height:340px;overflow-y:auto;margin-bottom:12px;
             display:flex;flex-direction:column;gap:8px">
          <div class="text-muted" style="font-size:12.5px;line-height:1.8" id="nexus-welcome">
            ¡Hola! Soy <b>Nexus</b>, tu asistente de IA.<br>
            🔧 <b>Mecánica:</b> DTC, diagnósticos, mantenimientos.<br>
            🏗️ <b>Especializados:</b> Herrería · Peletería · Electrónica · Refrigeración.<br>
            🌾 <b>Agropecuaria:</b> Agroservicio · Venta de Granos.<br>
            📊 <b>Tu negocio:</b> facturación, órdenes, reportes, precios.<br>
            Escribe tu consulta para comenzar.
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="ia-input" placeholder="Escribe tu consulta..."
                 onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();IA._enviarChat()}">
          <button class="btn btn-amber" onclick="IA._enviarChat()">Enviar</button>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="IA._insightsChat()">📊 Resumen negocio</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ia-input').value='¿Qué significa el código DTC ';document.getElementById('ia-input').focus()">🔧 Código DTC</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ia-input').value='Cotización para ';document.getElementById('ia-input').focus()">📋 Cotización</button>
        </div>
      </div>

      <div id="nexus-panel-hist" style="display:none">
        <div id="nexus-hist-lista" style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
          <div class="text-muted" style="padding:8px;font-size:13px">Cargando historial...</div>
        </div>
        <button class="btn btn-danger btn-sm" style="margin-top:10px;width:100%" onclick="IA._limpiarTodoHistorial()">🗑️ Limpiar todo el historial</button>
      </div>`, '700px');
    document.querySelector('#modal-box .modal-header')?.classList.add('modal-header-ia');
    // Inicializar conteo del historial en la pestaña
    DB.getNexusHistorial(10).then(convs => {
      const btn = document.getElementById('nexus-tab-hist');
      if (btn && convs.length) btn.textContent = `📋 Historial (${convs.length})`;
    }).catch(() => {});
  },

  _tabChat() {
    document.getElementById('nexus-tab-chat')?.classList.add('active');
    document.getElementById('nexus-tab-hist')?.classList.remove('active');
    document.getElementById('nexus-panel-chat').style.display = '';
    document.getElementById('nexus-panel-hist').style.display = 'none';
  },

  _tabHistorial() {
    document.getElementById('nexus-tab-chat')?.classList.remove('active');
    document.getElementById('nexus-tab-hist')?.classList.add('active');
    document.getElementById('nexus-panel-chat').style.display = 'none';
    document.getElementById('nexus-panel-hist').style.display = '';
    IA._cargarHistorial();
  },

  async _cargarHistorial() {
    const cont = document.getElementById('nexus-hist-lista');
    if (!cont) return;
    cont.innerHTML = '<div class="text-muted" style="padding:8px;font-size:13px">Cargando...</div>';
    try {
      const convs = await DB.getNexusHistorial(10);
      const btn = document.getElementById('nexus-tab-hist');
      if (btn) btn.textContent = `📋 Historial${convs.length ? ' (' + convs.length + ')' : ''}`;
      if (!convs.length) {
        cont.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><div style="font-weight:700">Sin historial aún</div><div class="text-muted" style="font-size:12px">Las consultas a Nexus aparecerán aquí</div></div>';
        return;
      }
      const modoColor = { chat:'amber', tecnico:'cyan', redaccion:'green', diagnostico:'purple', insights:'gray' };
      cont.innerHTML = convs.map(c => `
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--surface2)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span class="badge badge-${modoColor[c.modo]||'gray'}">${c.modo}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:11px;color:var(--text3)">${UI.fechaHora(c.created_at)}</span>
              <button class="btn btn-ghost btn-xs" onclick="IA._continuarDesde('${c.id}')" title="Continuar este chat">↩ Continuar</button>
              <button class="btn btn-danger btn-xs" onclick="IA._eliminarConversacion('${c.id}')" title="Eliminar esta consulta">✕</button>
            </div>
          </div>
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;
                      overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
               title="${(c.pregunta||'').replace(/"/g,'&quot;')}">${c.pregunta || '(Resumen del negocio)'}</div>
          <div style="font-size:12px;color:var(--text3);overflow:hidden;display:-webkit-box;
                      -webkit-line-clamp:2;-webkit-box-orient:vertical">${c.respuesta || ''}</div>
        </div>`).join('');
    } catch (e) {
      cont.innerHTML = `<div class="alert alert-red"><div class="alert-body">Error al cargar historial: ${e.message}</div></div>`;
    }
  },

  async _continuarDesde(id) {
    try {
      const convs = await DB.getNexusHistorial(10);
      const conv = convs.find(c => c.id === id);
      if (!conv) return;
      // Cambiar al tab de chat
      IA._tabChat();
      // Limpiar el chat y cargar esa conversación como contexto visual
      const hist = document.getElementById('ia-historial');
      if (hist) {
        hist.innerHTML = '';
        IA._push('user', conv.pregunta || '(Resumen del negocio)');
        IA._push('ai', conv.respuesta || '');
      }
      // Enfocar el input para que el usuario escriba el seguimiento
      const inp = document.getElementById('ia-input');
      if (inp) { inp.value = ''; inp.focus(); }
      UI.toast('Historial cargado — escribe tu seguimiento', 'info');
    } catch (e) {
      UI.toast('Error al cargar conversación: ' + e.message, 'error');
    }
  },

  async _eliminarConversacion(id) {
    try {
      await DB.deleteNexusConversacion(id);
      await IA._cargarHistorial();
      UI.toast('Consulta eliminada del historial', 'success');
    } catch (e) {
      UI.toast('Error al eliminar: ' + e.message, 'error');
    }
  },

  async _limpiarTodoHistorial() {
    const ok = await UI.confirmar('¿Eliminar todo el historial de consultas a Nexus? Esta acción no se puede deshacer.', 'Limpiar todo');
    if (!ok) return;
    try {
      const convs = await DB.getNexusHistorial(100);
      await Promise.all(convs.map(c => DB.deleteNexusConversacion(c.id)));
      await IA._cargarHistorial();
      UI.toast('Historial limpiado', 'success');
    } catch (e) {
      UI.toast('Error: ' + e.message, 'error');
    }
  },

  _push(rol, texto) {
    const cont = document.getElementById('ia-historial');
    if (!cont) return;
    const burbuja = document.createElement('div');
    const esUser = rol === 'user';
    burbuja.style.cssText = `align-self:${esUser ? 'flex-end' : 'flex-start'};
      max-width:85%;padding:8px 12px;border-radius:10px;font-size:13px;white-space:pre-wrap;
      background:${esUser ? 'var(--amber-dim)' : 'var(--surface2)'};
      border:1px solid var(--border);color:var(--text)`;
    burbuja.innerHTML = IA._formatear(texto);
    cont.appendChild(burbuja);
    cont.scrollTop = cont.scrollHeight;
    return burbuja;
  },

  /* Convierte enlaces Markdown [texto](url) a <a> clicables; escapa el
     resto del texto para evitar inyección de HTML */
  _formatear(texto) {
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return esc(texto).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_, label, url) => `<a href="${url}" target="_blank" rel="noopener" style="color:var(--amber)">${label}</a>`);
  },

  /* Actualiza el texto de una burbuja ya creada (ej. al recibir la respuesta) */
  _actualizar(burbuja, texto) {
    if (burbuja) burbuja.innerHTML = IA._formatear(texto);
  },

  async _enviarChat() {
    const inp = document.getElementById('ia-input');
    const msg = inp?.value.trim();
    if (!msg) return;
    inp.value = '';
    IA._push('user', msg);
    const cargando = IA._push('ai', '⏳ Pensando...');
    const r = await IA.preguntar(msg);
    IA._actualizar(cargando, r.ok ? r.texto : '⚠️ ' + r.error);
    // Actualizar badge del historial tras cada respuesta
    if (r.ok) {
      DB.getNexusHistorial(10).then(convs => {
        const btn = document.getElementById('nexus-tab-hist');
        if (btn) btn.textContent = `📋 Historial${convs.length ? ' (' + convs.length + ')' : ''}`;
      }).catch(() => {});
    }
  },

  async _insightsChat() {
    const cargando = IA._push('ai', '⏳ Analizando el negocio...');
    const r = await IA.insights();
    IA._actualizar(cargando, r.ok ? r.texto : '⚠️ ' + r.error);
  }
};
