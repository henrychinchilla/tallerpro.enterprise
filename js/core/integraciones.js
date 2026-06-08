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

  /* ── Chat flotante con Beto ────────────────────── */
  abrirChat() {
    UI.modal('🔧 Beto — Asistente Mecánico', `
      <div id="ia-historial" style="max-height:340px;overflow-y:auto;margin-bottom:12px;
           display:flex;flex-direction:column;gap:8px">
        <div class="text-muted" style="font-size:12px">
          ¡Hola! Soy <b>Beto</b>. Puedo ayudarte con:<br>
          🔧 <b>Mecánica:</b> "¿qué significa el código P0420?", "pasos para cambiar la banda de tiempo",
          "mantenimiento de los 10,000 km"<br>
          📊 <b>Tu taller:</b> "¿cuánto facturé este mes?", "¿qué vehículos tienen mantenimiento pendiente?"
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <input class="form-input" id="ia-input" placeholder="Escribe tu pregunta o un código DTC..."
               onkeydown="if(event.key==='Enter')IA._enviarChat()">
        <button class="btn btn-amber" onclick="IA._enviarChat()">Enviar</button>
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="IA._insightsChat()">📊 Resumen del negocio</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ia-input').value='¿Qué significa el código de falla ';document.getElementById('ia-input').focus()">🔧 Consultar código DTC</button>
      </div>`, '560px');
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
    burbuja.textContent = texto;
    cont.appendChild(burbuja);
    cont.scrollTop = cont.scrollHeight;
    return burbuja;
  },

  async _enviarChat() {
    const inp = document.getElementById('ia-input');
    const msg = inp?.value.trim();
    if (!msg) return;
    inp.value = '';
    IA._push('user', msg);
    const cargando = IA._push('ai', '⏳ Pensando...');
    const r = await IA.preguntar(msg);
    if (cargando) cargando.textContent = r.ok ? r.texto : '⚠️ ' + r.error;
  },

  async _insightsChat() {
    const cargando = IA._push('ai', '⏳ Analizando el negocio...');
    const r = await IA.insights();
    if (cargando) cargando.textContent = r.ok ? r.texto : '⚠️ ' + r.error;
  }
};
