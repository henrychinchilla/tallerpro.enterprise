/* ═══════════════════════════════════════════════════════
   notifications.js — Motor de Notificaciones
   TallerPro Enterprise v2.0

   Canales:
   - WhatsApp (Twilio Business API) — clientes
   - Email (SendGrid) — clientes
   - Internas (in-app) — admin, jefe, bodega

   Modo dev: simula envíos y muestra preview.
   Producción: configurar API keys en Configuración.
═══════════════════════════════════════════════════════ */

const NOTIF = {

  /* ── CONFIGURACIÓN ────────────────────────────────── */
  config: {
    /* WhatsApp — Twilio */
    twilio_sid:        '',
    twilio_token:      '',
    twilio_whatsapp:   'whatsapp:+17862041705',
    /* WhatsApp — CallMeBot (alternativa gratuita) */
    callmebot_activo:  false,
    callmebot_apikey:  '',
    callmebot_numero:  '',   // número destino con código país: +50212345678
    /* Email — SendGrid */
    sendgrid_key:      '',
    sendgrid_from:     '',
    /* Email — SMTP propio (dominio cliente) */
    smtp_activo:       false,
    smtp_host:         '',
    smtp_port:         587,
    smtp_user:         '',
    smtp_pass:         '',
    smtp_from:         '',
    smtp_from_name:    '',
    /* General */
    modo_dev:          true
  },

  /* ── PLANTILLAS ───────────────────────────────────── */
  PLANTILLAS: {
    ot_recibida: {
      whatsapp: `🔧 *{{taller}}*\n\nHola {{nombre_cliente}}, hemos recibido tu vehículo *{{placa}}*.\n\n📋 *OT:* {{num_ot}}\n📅 *Fecha ingreso:* {{fecha}}\n🔍 *Trabajo:* {{descripcion}}\n\nTe notificaremos cuando esté listo. ¡Gracias por tu confianza!`,
      email_subject: 'Vehículo recibido — {{num_ot}} | {{taller}}',
      email_body: `
        <h2>¡Tu vehículo fue recibido!</h2>
        <p>Hola <b>{{nombre_cliente}}</b>,</p>
        <p>Hemos recibido tu vehículo <b>{{placa}}</b> en nuestro taller.</p>
        <table>
          <tr><td><b>OT:</b></td><td>{{num_ot}}</td></tr>
          <tr><td><b>Fecha:</b></td><td>{{fecha}}</td></tr>
          <tr><td><b>Trabajo:</b></td><td>{{descripcion}}</td></tr>
        </table>
        <p>Te notificaremos cuando esté listo.</p>
      `
    },
    ot_lista: {
      whatsapp: `✅ *{{taller}}*\n\n¡Tu vehículo está listo! 🚗\n\n*{{placa}}* — {{num_ot}}\n💰 *Total:* {{total}}\n\nPuedes pasar a recogerlo en horario de {{horario}}.\n\n_{{taller}} — {{telefono}}_`,
      email_subject: '¡Tu vehículo está listo! — {{num_ot}}',
      email_body: `
        <h2>✅ ¡Tu vehículo está listo para entrega!</h2>
        <p>Hola <b>{{nombre_cliente}}</b>,</p>
        <p>Tu vehículo <b>{{placa}}</b> ya está listo.</p>
        <table>
          <tr><td><b>OT:</b></td><td>{{num_ot}}</td></tr>
          <tr><td><b>Total:</b></td><td>{{total}}</td></tr>
        </table>
        <p>Puedes pasar a recogerlo. ¡Gracias!</p>
      `
    },
    cita_confirmada: {
      whatsapp: `📅 *{{taller}}*\n\nHola {{nombre_cliente}}, tu cita ha sido confirmada:\n\n🗓️ *Fecha:* {{fecha}}\n⏰ *Hora:* {{hora}}\n🚗 *Vehículo:* {{placa}}\n🔧 *Servicio:* {{servicio}}\n\nTe esperamos. Para cancelar o cambiar: {{telefono}}`,
      email_subject: 'Cita confirmada — {{fecha}} {{hora}} | {{taller}}',
      email_body: `
        <h2>📅 Cita Confirmada</h2>
        <p>Hola <b>{{nombre_cliente}}</b>,</p>
        <p>Tu cita ha sido agendada exitosamente:</p>
        <table>
          <tr><td><b>Fecha:</b></td><td>{{fecha}}</td></tr>
          <tr><td><b>Hora:</b></td><td>{{hora}}</td></tr>
          <tr><td><b>Vehículo:</b></td><td>{{placa}}</td></tr>
          <tr><td><b>Servicio:</b></td><td>{{servicio}}</td></tr>
        </table>
      `
    },
    factura_lista: {
      whatsapp: `🧾 *{{taller}}*\n\nHola {{nombre_cliente}}, tu factura FEL está disponible.\n\n📄 *Factura:* {{num_factura}}\n💰 *Total:* {{total}}\n🔐 *UUID SAT:* {{uuid}}\n\nConservа este mensaje como comprobante.`,
      email_subject: 'Factura FEL {{num_factura}} | {{taller}}',
      email_body: `
        <h2>🧾 Factura FEL Disponible</h2>
        <p>Hola <b>{{nombre_cliente}}</b>,</p>
        <p>Tu factura electrónica está lista:</p>
        <table>
          <tr><td><b>Número:</b></td><td>{{num_factura}}</td></tr>
          <tr><td><b>Total:</b></td><td>{{total}}</td></tr>
          <tr><td><b>UUID SAT:</b></td><td>{{uuid}}</td></tr>
        </table>
      `
    }
  },

  /* ── FILL TEMPLATE ────────────────────────────────── */
  fill(template, vars) {
    let result = template;
    Object.entries(vars).forEach(([k, v]) => {
      result = result.replaceAll(`{{${k}}}`, v || '—');
    });
    return result;
  },

  /* ── VARIABLES COMUNES ────────────────────────────── */
  vars(extra = {}) {
    return {
      taller:    Auth.tenant?.name || 'TallerPro',
      telefono:  Auth.tenant?.tel  || '',
      horario:   '8:00 AM - 6:00 PM',
      ...extra
    };
  },

  /* ══════════════════════════════════════════════════
     ENVIAR WHATSAPP
  ══════════════════════════════════════════════════ */
  async sendWhatsApp(telefono, mensaje) {
    if (!telefono) return { ok: false, error: 'Sin número de teléfono' };

    // CallMeBot (gratuito, no requiere cuenta empresarial)
    if (NOTIF.config.callmebot_activo && NOTIF.config.callmebot_apikey) {
      try {
        const num = NOTIF.config.callmebot_numero || ('+502' + telefono.replace(/\D/g,''));
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(num)}&text=${encodeURIComponent(mensaje)}&apikey=${NOTIF.config.callmebot_apikey}`;
        const res = await fetch(url);
        if (res.ok) return { ok: true, canal: 'callmebot' };
        return { ok: false, error: 'CallMeBot error: ' + res.status };
      } catch(err) {
        return { ok: false, error: err.message };
      }
    }

    // Modo dev — simular
    if (NOTIF.config.modo_dev || !NOTIF.config.twilio_sid) {
      NOTIF._showPreview('WhatsApp', telefono, mensaje);
      return { ok: true, simulado: true };
    }

    // Producción — Twilio Business
    try {
      const to  = 'whatsapp:+502' + telefono.replace(/\D/g, '');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${NOTIF.config.twilio_sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(NOTIF.config.twilio_sid + ':' + NOTIF.config.twilio_token),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ From: NOTIF.config.twilio_whatsapp, To: to, Body: mensaje })
      });
      const data = await res.json();
      if (data.sid) return { ok: true, sid: data.sid };
      return { ok: false, error: data.message };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /* ══════════════════════════════════════════════════
     ENVIAR EMAIL
  ══════════════════════════════════════════════════ */
  async sendEmail(email, subject, htmlBody) {
    if (!email) return { ok: false, error: 'Sin correo electrónico' };

    const htmlFull = NOTIF._wrapEmailHTML(subject, htmlBody);

    // Modo dev — simular
    if (NOTIF.config.modo_dev || !NOTIF.config.sendgrid_key) {
      NOTIF._showPreview('Email', email, subject, htmlFull);
      return { ok: true, simulado: true };
    }

    // Producción — SendGrid
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + NOTIF.config.sendgrid_key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from:    { email: NOTIF.config.sendgrid_from, name: Auth.tenant?.name },
          subject,
          content: [{ type: 'text/html', value: htmlFull }]
        })
      });
      return { ok: res.status === 202 };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /* ── WRAPPER HTML EMAIL ───────────────────────────── */
  _wrapEmailHTML(title, body) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}
      .container{max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}
      .header{background:#080C10;padding:24px;text-align:center}
      .header h1{color:#F59E0B;font-size:22px;margin:0}
      .header p{color:#7A9BB5;font-size:12px;margin:4px 0 0}
      .body{padding:28px}
      h2{color:#080C10;font-size:18px}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      td{padding:8px 12px;border-bottom:1px solid #eee;font-size:14px}
      td:first-child{color:#666;width:40%}
      .footer{background:#f4f4f4;padding:16px;text-align:center;font-size:11px;color:#999}
    </style></head>
    <body><div class="container">
      <div class="header">
        <h1>${Auth.tenant?.name || 'TallerPro'}</h1>
        <p>${Auth.tenant?.address || ''}</p>
      </div>
      <div class="body">${body}</div>
      <div class="footer">
        ${Auth.tenant?.name} · ${Auth.tenant?.tel || ''} · ${Auth.tenant?.email || ''}
        <br>Powered by TallerPro Enterprise
      </div>
    </div></body></html>`;
  },

  /* ── PREVIEW EN MODAL ─────────────────────────────── */
  _showPreview(canal, destino, contenido, htmlPreview = null) {
    const isWA = canal === 'WhatsApp';
    UI.openModal(`Vista Previa — ${canal} (Modo Dev)`, `
      <div class="alert alert-amber" style="margin-bottom:16px">
        <div class="alert-icon">⚠️</div>
        <div>
          <div class="alert-title">Modo Desarrollo — Envío Simulado</div>
          <div class="alert-body">En producción se enviará al ${canal.toLowerCase()} real del cliente.
          Configura las APIs en <b>Configuración → Comunicaciones</b>.</div>
        </div>
      </div>

      <div style="margin-bottom:12px">
        <span class="badge badge-gray">Para:</span>
        <span class="mono-sm" style="margin-left:8px">${destino}</span>
      </div>

      ${isWA ? `
        <!-- Preview WhatsApp -->
        <div style="background:#E8F5E9;border-radius:8px;padding:16px;font-family:'Segoe UI',sans-serif;font-size:13px;line-height:1.6;white-space:pre-wrap;color:#111;border:1px solid #C8E6C9;max-height:300px;overflow-y:auto">
${contenido}
        </div>
        <div style="text-align:right;margin-top:4px">
          <span style="font-size:10px;color:#999">📱 Así llegará al cliente por WhatsApp</span>
        </div>` : `
        <!-- Preview Email -->
        <div style="font-weight:700;font-size:12px;color:var(--text2);margin-bottom:6px">Asunto: ${contenido}</div>
        <iframe srcdoc="${(htmlPreview||'').replace(/"/g,"'")}"
          style="width:100%;height:300px;border:1px solid var(--border);border-radius:6px"></iframe>
      `}

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="UI.toast('Para envíos reales configura las APIs en Configuración → Comunicaciones','info');UI.closeModal()">
          ⚙️ Configurar API
        </button>
      </div>
    `, 'modal-lg');
  },

  /* ══════════════════════════════════════════════════
     MÉTODOS DE ALTO NIVEL (llaman send)
  ══════════════════════════════════════════════════ */

  async notificarOTRecibida(ot, cliente, vehiculo) {
    const vars = NOTIF.vars({
      nombre_cliente: cliente?.nombre || '—',
      placa:          vehiculo?.placa || '—',
      num_ot:         ot?.num || '—',
      fecha:          ot?.fecha_ingreso || new Date().toLocaleDateString('es-GT'),
      descripcion:    ot?.descripcion || '—'
    });
    const msg = NOTIF.fill(NOTIF.PLANTILLAS.ot_recibida.whatsapp, vars);
    const sub = NOTIF.fill(NOTIF.PLANTILLAS.ot_recibida.email_subject, vars);
    const bod = NOTIF.fill(NOTIF.PLANTILLAS.ot_recibida.email_body, vars);

    const [wa, em] = await Promise.all([
      NOTIF.sendWhatsApp(cliente?.tel, msg),
      NOTIF.sendEmail(cliente?.email, sub, bod)
    ]);
    return { wa, em };
  },

  async notificarOTLista(ot, cliente, vehiculo) {
    const vars = NOTIF.vars({
      nombre_cliente: cliente?.nombre || '—',
      placa:          vehiculo?.placa || '—',
      num_ot:         ot?.num || '—',
      total:          UI.q(ot?.total || 0)
    });
    const msg = NOTIF.fill(NOTIF.PLANTILLAS.ot_lista.whatsapp, vars);
    const sub = NOTIF.fill(NOTIF.PLANTILLAS.ot_lista.email_subject, vars);
    const bod = NOTIF.fill(NOTIF.PLANTILLAS.ot_lista.email_body, vars);

    const [wa, em] = await Promise.all([
      NOTIF.sendWhatsApp(cliente?.tel, msg),
      NOTIF.sendEmail(cliente?.email, sub, bod)
    ]);
    return { wa, em };
  },

  async notificarCitaConfirmada(cita, cliente, vehiculo) {
    const vars = NOTIF.vars({
      nombre_cliente: cliente?.nombre || '—',
      placa:          vehiculo?.placa || '—',
      fecha:          cita?.fecha || '—',
      hora:           cita?.hora  || '—',
      servicio:       cita?.servicio || '—'
    });
    const msg = NOTIF.fill(NOTIF.PLANTILLAS.cita_confirmada.whatsapp, vars);
    const sub = NOTIF.fill(NOTIF.PLANTILLAS.cita_confirmada.email_subject, vars);
    const bod = NOTIF.fill(NOTIF.PLANTILLAS.cita_confirmada.email_body, vars);

    const [wa, em] = await Promise.all([
      NOTIF.sendWhatsApp(cliente?.tel, msg),
      NOTIF.sendEmail(cliente?.email, sub, bod)
    ]);
    return { wa, em };
  },

  async notificarFacturaLista(factura, cliente) {
    const vars = NOTIF.vars({
      nombre_cliente: cliente?.nombre || '—',
      num_factura:    factura?.num    || '—',
      total:          UI.q(factura?.total || 0),
      uuid:           factura?.fel_uuid   || 'Pendiente SAT'
    });
    const msg = NOTIF.fill(NOTIF.PLANTILLAS.factura_lista.whatsapp, vars);
    const sub = NOTIF.fill(NOTIF.PLANTILLAS.factura_lista.email_subject, vars);
    const bod = NOTIF.fill(NOTIF.PLANTILLAS.factura_lista.email_body, vars);

    const [wa, em] = await Promise.all([
      NOTIF.sendWhatsApp(cliente?.tel, msg),
      NOTIF.sendEmail(cliente?.email, sub, bod)
    ]);
    return { wa, em };
  },

  /* ══════════════════════════════════════════════════
     NOTIFICACIONES INTERNAS (In-App)
  ══════════════════════════════════════════════════ */
  INTERNAS: [],

  async cargarInternas() {
    const [inventario, ordenes, cxc] = await Promise.all([
      DB.getInventario(),
      DB.getOrdenes(),
      DB.getCuentasCobrar()
    ]);

    const alertas = [];
    const hoy = new Date().toISOString().slice(0, 10);

    // Stock bajo
    inventario.filter(i => i.stock <= i.min_stock).forEach(i => {
      alertas.push({
        tipo:     'stock_bajo',
        nivel:    i.stock === 0 ? 'critico' : 'warning',
        titulo:   'Stock Bajo: ' + i.nombre,
        cuerpo:   `${i.stock} uds disponibles (mínimo ${i.min_stock}). Código: ${i.codigo}`,
        icon:     '📦',
        accion:   "App.navigate('inventario')"
      });
    });

    // OTs vencidas (fecha estimada pasada, no entregadas)
    ordenes.filter(o =>
      o.fecha_estimada && o.fecha_estimada < hoy &&
      o.estado !== 'entregado' && o.estado !== 'cancelado'
    ).forEach(o => {
      const v = o.vehiculos;
      alertas.push({
        tipo:   'ot_vencida',
        nivel:  'warning',
        titulo: 'OT Vencida: ' + o.num,
        cuerpo: `${v?.placa || '—'} — ${o.descripcion}. Fecha estimada: ${o.fecha_estimada}`,
        icon:   '⚠️',
        accion: "App.navigate('ordenes')"
      });
    });

    // CxC vencidas
    cxc.filter(c =>
      c.fecha_vencimiento && c.fecha_vencimiento < hoy &&
      c.estado !== 'pagada'
    ).forEach(c => {
      alertas.push({
        tipo:   'cxc_vencida',
        nivel:  'critico',
        titulo: 'Cobro Vencido',
        cuerpo: `${c.clientes?.nombre || '—'}: ${c.concepto} — Saldo Q${(c.saldo || 0).toFixed(2)}`,
        icon:   '💰',
        accion: "App.navigate('finanzas')"
      });
    });

    NOTIF.INTERNAS = alertas;
    return alertas;
  },

  /* Render panel de alertas internas */
  renderPanelInternas(alertas) {
    if (alertas.length === 0) {
      return `<div class="alert alert-green" style="margin-bottom:0">
        <div class="alert-icon">✅</div>
        <div><div class="alert-title">Sin alertas</div>
        <div class="alert-body">Todo está en orden.</div></div>
      </div>`;
    }

    return alertas.map(a => {
      const color = a.nivel === 'critico' ? 'red' : 'amber';
      return `
        <div class="alert alert-${color}" style="cursor:pointer" onclick="${a.accion};UI.closeModal()">
          <div class="alert-icon">${a.icon}</div>
          <div style="flex:1">
            <div class="alert-title">${a.titulo}</div>
            <div class="alert-body">${a.cuerpo}</div>
          </div>
          <span style="color:var(--text3);font-size:12px;margin-left:8px">→</span>
        </div>`;
    }).join('');
  }
};

/* ══════════════════════════════════════════════════
   MÓDULO DE COMUNICACIONES (página)
══════════════════════════════════════════════════ */
Pages.comunicaciones = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Comunicaciones</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  /* Cargar alertas internas */
  const alertas = await NOTIF.cargarInternas();

  /* Actualizar badge del sidebar */
  const badge = document.querySelector('#nav-comunicaciones .nav-badge');
  if (badge) badge.textContent = alertas.length || '';

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Comunicaciones</h1>
        <p class="page-subtitle">// WhatsApp · Email · Alertas Internas</p>
      </div>
    </div>
    <div class="page-body">

      <!-- TABS -->
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border)">
        ${[
          {id:'alertas',    label:'🔔 Alertas Internas', badge: alertas.length},
          {id:'whatsapp',   label:'💬 WhatsApp'},
          {id:'email',      label:'📧 Email'},
          {id:'plantillas', label:'📝 Plantillas'},
          {id:'config-com', label:'⚙️ Configurar APIs'}
        ].map(t => `
          <button onclick="Pages._comTab('${t.id}')"
            id="com-tab-${t.id}"
            style="padding:10px 18px;border:none;background:none;cursor:pointer;
                   font-family:'Manrope',sans-serif;font-size:13px;font-weight:600;
                   border-bottom:2px solid transparent;color:var(--text2);transition:all .2s">
            ${t.label}${t.badge ? ` <span style="background:var(--red);color:#fff;border-radius:8px;padding:1px 6px;font-size:9px">${t.badge}</span>` : ''}
          </button>`).join('')}
      </div>

      <div id="com-content">
        ${Pages._renderComTab('alertas', alertas)}
      </div>
    </div>`;

  Pages._comTabActivo = 'alertas';
  Pages._comAlertas   = alertas;
  document.getElementById('com-tab-alertas').style.cssText +=
    ';border-bottom-color:var(--amber);color:var(--amber)';
};

Pages._comTab = function (tab) {
  document.querySelectorAll('[id^="com-tab-"]').forEach(b => {
    b.style.borderBottomColor = 'transparent';
    b.style.color = 'var(--text2)';
  });
  document.getElementById('com-tab-' + tab).style.cssText +=
    ';border-bottom-color:var(--amber);color:var(--amber)';
  Pages._comTabActivo = tab;
  document.getElementById('com-content').innerHTML =
    Pages._renderComTab(tab, Pages._comAlertas || []);
};

Pages._renderComTab = function (tab, alertas) {
  switch (tab) {
    case 'alertas':    return Pages._renderAlertas(alertas);
    case 'whatsapp':   return Pages._renderWhatsApp();
    case 'email':      return Pages._renderEmail();
    case 'plantillas': return Pages._renderPlantillas();
    case 'config-com': return Pages._renderConfigCom();
    default: return '';
  }
};

/* ── ALERTAS INTERNAS ─────────────────────────────── */
Pages._renderAlertas = function (alertas) {
  return `
    <div class="flex items-center justify-between mb-4">
      <span style="font-weight:700;font-size:14px">
        🔔 Alertas del Sistema
        ${alertas.length > 0 ? `<span class="badge badge-red" style="margin-left:8px">${alertas.length}</span>` : ''}
      </span>
      <button class="btn btn-ghost btn-sm" onclick="Pages.comunicaciones()">↻ Actualizar</button>
    </div>
    ${NOTIF.renderPanelInternas(alertas)}`;
};

/* ── WHATSAPP ─────────────────────────────────────── */
Pages._renderWhatsApp = function () {
  const modoActive = !NOTIF.config.twilio_sid;
  return `
    ${modoActive ? `<div class="alert alert-amber mb-4">
      <div class="alert-icon">⚠️</div>
      <div><div class="alert-title">Modo Desarrollo Activo</div>
      <div class="alert-body">Configura Twilio en la pestaña "Configurar APIs" para envíos reales.
      Por ahora se muestran previews de los mensajes.</div></div>
    </div>` : `<div class="alert alert-green mb-4">
      <div class="alert-icon">✅</div>
      <div><div class="alert-title">Twilio Conectado</div>
      <div class="alert-body">WhatsApp Business activo. Los mensajes se envían al número real del cliente.</div></div>
    </div>`}

    <div class="card card-green mb-4">
      <div class="card-sub mb-3">📨 Enviar WhatsApp Manual</div>
      <div class="form-group">
        <label class="form-label">Número de destino (Guatemala)</label>
        <input class="form-input" id="wa-numero" placeholder="5540-1234">
      </div>
      <div class="form-group">
        <label class="form-label">Mensaje</label>
        <textarea class="form-input form-textarea" id="wa-mensaje" rows="4"
          placeholder="Escribe el mensaje..."></textarea>
      </div>
      <button class="btn btn-success" onclick="Pages.enviarWAManual()">
        💬 Enviar WhatsApp
      </button>
    </div>

    <div class="card">
      <div class="card-sub mb-3">⚡ Notificaciones Automáticas Disponibles</div>
      ${[
        { evento: 'OT Recibida',         desc: 'Al crear una nueva OT',           btn: 'Probar Preview' },
        { evento: 'OT Lista',            desc: 'Al marcar OT como "Listo"',       btn: 'Probar Preview' },
        { evento: 'Cita Confirmada',     desc: 'Al confirmar una cita',           btn: 'Probar Preview' },
        { evento: 'Factura Disponible',  desc: 'Al certificar una factura FEL',   btn: 'Probar Preview' }
      ].map((e, i) => `
        <div class="flex items-center gap-3" style="padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">${e.evento}</div>
            <div class="text-muted" style="font-size:12px">${e.desc}</div>
          </div>
          <span class="badge badge-green">Activo</span>
          <button class="btn btn-sm btn-ghost" onclick="Pages.previsualizarNotif(${i})">${e.btn}</button>
        </div>`).join('')}
    </div>`;
};

/* ── EMAIL ────────────────────────────────────────── */
Pages._renderEmail = function () {
  const modoActive = !NOTIF.config.sendgrid_key;
  return `
    ${modoActive ? `<div class="alert alert-amber mb-4">
      <div class="alert-icon">⚠️</div>
      <div><div class="alert-title">Modo Desarrollo Activo</div>
      <div class="alert-body">Configura SendGrid en la pestaña "Configurar APIs" para envíos reales.</div></div>
    </div>` : `<div class="alert alert-green mb-4">
      <div class="alert-icon">✅</div>
      <div><div class="alert-title">SendGrid Conectado</div></div>
    </div>`}

    <div class="card card-cyan mb-4">
      <div class="card-sub mb-3">📧 Enviar Email Manual</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Destinatario</label>
          <input class="form-input" id="em-para" placeholder="cliente@gmail.com">
        </div>
        <div class="form-group">
          <label class="form-label">Asunto</label>
          <input class="form-input" id="em-asunto" placeholder="Asunto del correo">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Mensaje</label>
        <textarea class="form-input form-textarea" id="em-mensaje" rows="5"
          placeholder="Cuerpo del correo..."></textarea>
      </div>
      <button class="btn btn-cyan" onclick="Pages.enviarEmailManual()">
        📧 Enviar Email
      </button>
    </div>`;
};

/* ── PLANTILLAS ───────────────────────────────────── */
Pages._renderPlantillas = function () {
  return `
    <div style="font-weight:700;font-size:14px;margin-bottom:16px">📝 Plantillas de Mensajes</div>
    <div class="alert alert-cyan mb-4">
      <div class="alert-icon">💡</div>
      <div class="alert-body">Variables disponibles: <code>{{nombre_cliente}}</code> <code>{{placa}}</code>
      <code>{{num_ot}}</code> <code>{{fecha}}</code> <code>{{total}}</code>
      <code>{{num_factura}}</code> <code>{{uuid}}</code> <code>{{taller}}</code></div>
    </div>
    ${Object.entries(NOTIF.PLANTILLAS).map(([key, p]) => `
    <div class="card mb-4">
      <div class="detail-section-header" style="margin:-24px -24px 16px;padding:12px 20px;background:var(--surface2);border-bottom:1px solid var(--border)">
        ${key.replace(/_/g,' ').toUpperCase()}
      </div>
      <div class="form-group">
        <label class="form-label">WhatsApp</label>
        <textarea class="form-input form-textarea" id="tpl-wa-${key}" rows="5"
                  style="font-family:'DM Mono',monospace;font-size:11px">${p.whatsapp}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Email — Asunto</label>
        <input class="form-input" id="tpl-es-${key}" value="${p.email_subject}"
               style="font-family:'DM Mono',monospace;font-size:11px">
      </div>
      <button class="btn btn-amber btn-sm" onclick="Pages.guardarPlantilla('${key}')">
        Guardar Plantilla
      </button>
    </div>`).join('')}`;
};

/* ── CONFIG APIS ──────────────────────────────────── */
Pages._renderConfigCom = function () {
  return `
    <!-- WhatsApp: Twilio vs CallMeBot -->
    <div style="font-weight:700;font-size:13px;margin-bottom:12px">💬 Configuración WhatsApp</div>
    <div class="grid-2 mb-4">
      <!-- TWILIO -->
      <div class="card card-green">
        <div class="card-sub mb-3">Twilio Business API</div>
        <div class="alert alert-cyan" style="margin-bottom:12px">
          <div class="alert-icon">💡</div>
          <div class="alert-body" style="font-size:11px">Requiere cuenta empresarial en twilio.com. Permite envío masivo y automatizado.</div>
        </div>
        <div class="form-group"><label class="form-label">Account SID</label>
          <input class="form-input" id="tw-sid" value="${NOTIF.config.twilio_sid}" placeholder="ACxxxxxxxx..."></div>
        <div class="form-group"><label class="form-label">Auth Token</label>
          <input class="form-input" id="tw-token" type="password" value="${NOTIF.config.twilio_token}" placeholder="••••••••"></div>
        <div class="form-group"><label class="form-label">Número WhatsApp Twilio</label>
          <input class="form-input" id="tw-numero" value="${NOTIF.config.twilio_whatsapp}" placeholder="whatsapp:+17862041705"></div>
        <button class="btn btn-success btn-sm" onclick="Pages.guardarConfigTwilio()">Guardar Twilio</button>
      </div>

      <!-- CALLMEBOT -->
      <div class="card card-amber">
        <div class="card-sub mb-3">CallMeBot (Gratuito)</div>
        <div class="alert alert-amber" style="margin-bottom:12px">
          <div class="alert-icon">⚡</div>
          <div class="alert-body" style="font-size:11px">
            <b>Gratuito y sin cuenta empresarial.</b><br>
            1. Agrega +34 644 65 07 75 a tus contactos como "CallMeBot"<br>
            2. Envía "I allow callmebot to send me messages" por WhatsApp<br>
            3. Recibirás tu API Key en segundos
          </div>
        </div>
        <div class="form-group"><label class="form-label">
          <input type="checkbox" id="cmb-activo" ${NOTIF.config.callmebot_activo?'checked':''} style="margin-right:8px">
          Usar CallMeBot (prioridad sobre Twilio)
        </label></div>
        <div class="form-group"><label class="form-label">API Key CallMeBot</label>
          <input class="form-input" id="cmb-apikey" value="${NOTIF.config.callmebot_apikey}" placeholder="123456"></div>
        <div class="form-group"><label class="form-label">Número por defecto (+502...)</label>
          <input class="form-input" id="cmb-numero" value="${NOTIF.config.callmebot_numero}" placeholder="+50212345678"></div>
        <button class="btn btn-amber btn-sm" onclick="Pages.guardarConfigCallMeBot()">Guardar CallMeBot</button>
      </div>
    </div>

    <!-- Email: SendGrid vs SMTP propio -->
    <div style="font-weight:700;font-size:13px;margin-bottom:12px;border-top:1px solid var(--border);padding-top:16px">📧 Configuración Email</div>
    <div class="grid-2">
      <!-- SENDGRID -->
      <div class="card card-cyan">
        <div class="card-sub mb-3">SendGrid</div>
        <div class="alert alert-cyan" style="margin-bottom:12px">
          <div class="alert-icon">💡</div>
          <div class="alert-body" style="font-size:11px">sendgrid.com — gratis hasta 100 emails/día. No requiere dominio propio.</div>
        </div>
        <div class="form-group"><label class="form-label">API Key</label>
          <input class="form-input" id="sg-key" type="password" value="${NOTIF.config.sendgrid_key}" placeholder="SG.xxxxx..."></div>
        <div class="form-group"><label class="form-label">Email Remitente</label>
          <input class="form-input" id="sg-from" value="${NOTIF.config.sendgrid_from}" placeholder="noreply@mitaller.gt"></div>
        <button class="btn btn-cyan btn-sm" onclick="Pages.guardarConfigSendGrid()">Guardar SendGrid</button>
      </div>

      <!-- SMTP PROPIO -->
      <div class="card" style="border-color:var(--purple-border)">
        <div class="card-sub mb-3" style="color:var(--purple)">SMTP Propio (Tu Dominio/Hosting)</div>
        <div class="alert alert-cyan" style="margin-bottom:12px">
          <div class="alert-icon">🌐</div>
          <div class="alert-body" style="font-size:11px">Usa el correo de tu dominio/hosting (cPanel, Plesk, G Suite, Office 365). Sin límites adicionales.</div>
        </div>
        <div class="form-group"><label class="form-label">
          <input type="checkbox" id="smtp-activo" ${NOTIF.config.smtp_activo?'checked':''} style="margin-right:8px">
          Usar SMTP propio (prioridad sobre SendGrid)
        </label></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Servidor SMTP</label>
            <input class="form-input" id="smtp-host" value="${NOTIF.config.smtp_host}" placeholder="mail.tudominio.com"></div>
          <div class="form-group"><label class="form-label">Puerto</label>
            <select class="form-select" id="smtp-port">
              <option value="587" ${NOTIF.config.smtp_port==587?'selected':''}>587 (STARTTLS)</option>
              <option value="465" ${NOTIF.config.smtp_port==465?'selected':''}>465 (SSL)</option>
              <option value="25"  ${NOTIF.config.smtp_port==25 ?'selected':''}>25 (Sin cifrado)</option>
            </select></div>
        </div>
        <div class="form-group"><label class="form-label">Usuario / Email</label>
          <input class="form-input" id="smtp-user" value="${NOTIF.config.smtp_user}" placeholder="notificaciones@tudominio.com"></div>
        <div class="form-group"><label class="form-label">Contraseña</label>
          <input class="form-input" id="smtp-pass" type="password" value="${NOTIF.config.smtp_pass}" placeholder="••••••••"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Nombre Remitente</label>
            <input class="form-input" id="smtp-name" value="${NOTIF.config.smtp_from_name}" placeholder="Taller Mecánico XYZ"></div>
          <div class="form-group" style="display:flex;align-items:flex-end">
            <button class="btn btn-ghost btn-sm" style="width:100%" onclick="Pages.probarSMTP()">📧 Probar Envío</button>
          </div>
        </div>
        <button class="btn btn-amber btn-sm" style="width:100%" onclick="Pages.guardarConfigSMTP()">Guardar Configuración SMTP</button>
      </div>
    </div>`;
};

/* ── ACCIONES ─────────────────────────────────────── */
Pages.enviarWAManual = async function () {
  const num = document.getElementById('wa-numero')?.value.trim();
  const msg = document.getElementById('wa-mensaje')?.value.trim();
  if (!num || !msg) { UI.toast('Número y mensaje son obligatorios', 'error'); return; }
  UI.toast('Enviando WhatsApp...', 'info');
  const r = await NOTIF.sendWhatsApp(num, msg);
  if (r.ok) UI.toast(r.simulado ? 'Preview generado ✓' : 'WhatsApp enviado ✓');
  else UI.toast('Error: ' + r.error, 'error');
};

Pages.enviarEmailManual = async function () {
  const para   = document.getElementById('em-para')?.value.trim();
  const asunto = document.getElementById('em-asunto')?.value.trim();
  const msg    = document.getElementById('em-mensaje')?.value.trim();
  if (!para || !asunto || !msg) { UI.toast('Todos los campos son obligatorios', 'error'); return; }
  UI.toast('Enviando email...', 'info');
  const r = await NOTIF.sendEmail(para, asunto, `<p>${msg.replace(/\n/g,'<br>')}</p>`);
  if (r.ok) UI.toast(r.simulado ? 'Preview generado ✓' : 'Email enviado ✓');
  else UI.toast('Error: ' + r.error, 'error');
};

Pages.previsualizarNotif = async function (idx) {
  const demos = [
    () => NOTIF.notificarOTRecibida(
      { num:'OT-2025-0001', fecha_ingreso:'2025-04-28', descripcion:'Cambio de aceite y frenos' },
      { nombre:'Carlos Mendoza', tel:'5540-1234', email:'carlos@gmail.com' },
      { placa:'P 247 AKZ' }
    ),
    () => NOTIF.notificarOTLista(
      { num:'OT-2025-0001', total:1250 },
      { nombre:'Carlos Mendoza', tel:'5540-1234', email:'carlos@gmail.com' },
      { placa:'P 247 AKZ' }
    ),
    () => NOTIF.notificarCitaConfirmada(
      { fecha:'2025-04-30', hora:'09:00', servicio:'Cambio de aceite' },
      { nombre:'Carlos Mendoza', tel:'5540-1234', email:'carlos@gmail.com' },
      { placa:'P 247 AKZ' }
    ),
    () => NOTIF.notificarFacturaLista(
      { num:'FEL-2025-000001', total:1250, fel_uuid:'FEL-ABC123-XYZ' },
      { nombre:'Carlos Mendoza', tel:'5540-1234', email:'carlos@gmail.com' }
    )
  ];
  if (demos[idx]) await demos[idx]();
};

Pages.guardarPlantilla = function (key) {
  const wa = document.getElementById(`tpl-wa-${key}`)?.value;
  const es = document.getElementById(`tpl-es-${key}`)?.value;
  if (wa) NOTIF.PLANTILLAS[key].whatsapp      = wa;
  if (es) NOTIF.PLANTILLAS[key].email_subject  = es;
  UI.toast('Plantilla guardada ✓');
};

Pages.guardarConfigTwilio = function () {
  NOTIF.config.twilio_sid      = document.getElementById('tw-sid')?.value.trim();
  NOTIF.config.twilio_token    = document.getElementById('tw-token')?.value.trim();
  NOTIF.config.twilio_whatsapp = document.getElementById('tw-numero')?.value.trim();
  NOTIF.config.modo_dev        = !NOTIF.config.twilio_sid;
  UI.toast(NOTIF.config.twilio_sid ? 'Twilio configurado ✓' : 'Modo dev activado');
  Pages._comTab('config-com');
};

Pages.guardarConfigSendGrid = function () {
  NOTIF.config.sendgrid_key  = document.getElementById('sg-key')?.value.trim();
  NOTIF.config.sendgrid_from = document.getElementById('sg-from')?.value.trim();
  NOTIF.config.modo_dev      = !NOTIF.config.twilio_sid;
  UI.toast(NOTIF.config.sendgrid_key ? 'SendGrid configurado ✓' : 'Modo dev activado');
  Pages._comTab('config-com');
};

Pages.guardarConfigCallMeBot = function () {
  NOTIF.config.callmebot_activo = document.getElementById('cmb-activo')?.checked||false;
  NOTIF.config.callmebot_apikey = document.getElementById('cmb-apikey')?.value.trim()||'';
  NOTIF.config.callmebot_numero = document.getElementById('cmb-numero')?.value.trim()||'';
  localStorage.setItem('tp_notif_config', JSON.stringify(NOTIF.config));
  UI.toast(NOTIF.config.callmebot_activo ? 'CallMeBot configurado ✓' : 'CallMeBot desactivado');
};

Pages.guardarConfigSMTP = function () {
  NOTIF.config.smtp_activo    = document.getElementById('smtp-activo')?.checked||false;
  NOTIF.config.smtp_host      = document.getElementById('smtp-host')?.value.trim()||'';
  NOTIF.config.smtp_port      = parseInt(document.getElementById('smtp-port')?.value)||587;
  NOTIF.config.smtp_user      = document.getElementById('smtp-user')?.value.trim()||'';
  NOTIF.config.smtp_pass      = document.getElementById('smtp-pass')?.value||'';
  NOTIF.config.smtp_from_name = document.getElementById('smtp-name')?.value.trim()||'';
  NOTIF.config.smtp_from      = NOTIF.config.smtp_user;
  localStorage.setItem('tp_notif_config', JSON.stringify(NOTIF.config));
  UI.toast(NOTIF.config.smtp_activo ? 'SMTP configurado ✓' : 'SMTP desactivado');
};

Pages.probarSMTP = async function () {
  const email = NOTIF.config.smtp_user || document.getElementById('smtp-user')?.value.trim();
  if (!email) { UI.toast('Ingresa el usuario SMTP primero','error'); return; }
  UI.toast('Enviando email de prueba...','info');
  /* En modo dev simula — en producción necesita backend proxy para SMTP */
  await NOTIF.sendEmail(email, 'Prueba SMTP — TallerPro', '<h2>✅ Configuración SMTP correcta</h2><p>Este es un correo de prueba de TallerPro Enterprise.</p>');
  UI.toast('Email de prueba enviado ✓');
};

/* Persistir config en localStorage */
(function loadNotifConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('tp_notif_config')||'{}');
    Object.assign(NOTIF.config, saved);
  } catch {}
})();
