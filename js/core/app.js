/* ═══════════════════════════════════════════════════════
   NexusPro v3.0
   js/core/app.js — Navegación y aplicación principal
═══════════════════════════════════════════════════════ */

const App = {
  paginaActual: 'dashboard',
  _subActivo: null,   // sub-sección activa del módulo actual (para el submenú lateral)
  _unsavedGuard: null, // función () => bool; si devuelve false, se cancela la salida

  /* Guard de cambios sin guardar. Un módulo (ej. formulario SAT) registra
     App._unsavedGuard mientras edita; al intentar navegar fuera se consulta.
     Devuelve true si se puede salir (y limpia el guard). */
  puedeSalir() {
    if (typeof App._unsavedGuard === 'function') {
      const ok = App._unsavedGuard();
      if (ok) { App._unsavedGuard = null; window.onbeforeunload = null; }
      return ok;
    }
    return true;
  },

  /* ── INICIAR APP ──────────────────────────────── */
  async iniciar() {
    App._initRenderHooks();
    localStorage.removeItem('mfa_bypass');   // purga del bypass antiguo (hueco de seguridad)

    /* SEGURIDAD 2FA: cuenta con factor verificado → el reto es OBLIGATORIO.
       La activación inicial (cuenta sin factor) sí es posponible, y el reto
       sólo se salta si el usuario pausó su 2FA (Auth.mfaPausado: bandera en
       la BD que exige un código verificado para encenderse, mig 099). */
    if (typeof Auth !== 'undefined' && Auth.getMFAStatus) {
      try {
        const mfa = await Auth.getMFAStatus();
        if (mfa.nextLevel === 'aal2' && mfa.currentLevel === 'aal1' && !Auth.mfaPausado()) {
          document.getElementById('app')?.classList.remove('visible');
          document.getElementById('login-screen')?.style.removeProperty('display');
          if (typeof renderLogin === 'function') renderLogin('mfa-challenge');
          return;
        }
        /* Ojo: con el 2FA pausado el nivel también es aal1 — sin este guard
           la pantalla de enrolamiento saldría a quien YA tiene su factor. */
        if (mfa.currentLevel === 'aal1' && !Auth.mfaPausado() &&
            localStorage.getItem('mfa_enroll_later') !== 'true') {
          document.getElementById('app')?.classList.remove('visible');
          document.getElementById('login-screen')?.style.removeProperty('display');
          if (typeof renderLogin === 'function') renderLogin('mfa-enroll');
          return;
        }
      } catch(err) {
        /* Fail-closed: sin estado 2FA verificable no se entra a la app */
        console.error('Error al verificar MFA al iniciar:', err);
        document.getElementById('app')?.classList.remove('visible');
        document.getElementById('login-screen')?.style.removeProperty('display');
        if (typeof renderLogin === 'function') renderLogin('login');
        UI.toast('No se pudo verificar tu 2FA. Inicia sesión de nuevo.', 'error');
        return;
      }
    }

    document.getElementById('login-screen')?.style.setProperty('display','none');
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.add('visible');
    TEMAS.aplicar(localStorage.getItem('tp_tema') || 'light');
    /* Bloqueo si la cuenta está suspendida o su prueba gratis venció (no aplica al superadmin) */
    if (App._bloqueadoPorSuscripcion()) {
      return App.pantallaSuspendido();
    }
    App.renderSidebar();
    App._initSidebarToggle();
    App.navegarA(App._restaurarRuta());
    await App._iniciarTrialSiAplica();
    App.checkSuscripcion();
    App.avisoSAT();
    App.registrarSW();
    App.iniciarInactividad(Auth.tenant?.session_timeout_minutes);
  },

  /* ── AVISO SAT AL ENTRAR ──────────────────────────
     Para el personal de finanzas/contabilidad (admin, gerente_fin,
     contador): obligaciones fiscales pendientes que vencen en ≤2 días
     o ya vencidas → aviso al iniciar sesión. */
  async avisoSAT() {
    try {
      const rol = Auth.user?.rol;
      if (!['admin','gerente_fin','contador'].includes(rol)) return;
      if (typeof moduloEnPlan === 'function' && !moduloEnPlan('contabilidad')) return;
      const anio = new Date().getFullYear();
      const [o1, o2] = await Promise.all([
        DB.getObligaciones(anio).catch(()=>[]),
        DB.getObligaciones(anio-1).catch(()=>[])   // dic. del año pasado vence en enero
      ]);
      const hoyStr = new Date().toISOString().slice(0,10);
      const limite = new Date(Date.now() + 2*86400000).toISOString().slice(0,10);
      const proximas = [...o1, ...o2]
        .filter(o => o.estado !== 'pagado' && o.fecha_vencimiento && o.fecha_vencimiento <= limite)
        .sort((a,b) => (a.fecha_vencimiento||'').localeCompare(b.fecha_vencimiento||''));
      if (!proximas.length) return;

      UI.modal('⚠️ Obligaciones SAT por vencer', `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${proximas.map(o => {
            const vencida = o.fecha_vencimiento < hoyStr;
            return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--surface2);border-left:3px solid var(--${vencida?'red':'amber'});border-radius:0 8px 8px 0;padding:10px">
              <div>
                <div style="font-weight:700;font-size:13px">🏛️ ${o.tipo} · ${o.periodo}</div>
                <div style="font-size:11px;color:var(--text3)">${UI.esc(o.notas||'')}</div>
              </div>
              <div style="text-align:right">
                <div class="mono-sm" style="font-weight:800;color:var(--amber)">${UI.q(o.monto_calculado)}</div>
                <span class="badge badge-${vencida?'red':'amber'}" style="font-size:10px">${vencida?'⚠️ VENCIDA':'vence '+UI.fecha(o.fecha_vencimiento)}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.cerrarModal()">Después</button>
          <button class="btn btn-amber" onclick="UI.cerrarModal();App.navegarA('contabilidad')">🧮 Ir a Contabilidad</button>
        </div>`, '480px');
    } catch (_) { /* el aviso nunca debe bloquear el ingreso */ }
  },

  /* El trial de 30 días arranca con el PRIMER USO del negocio (no al
     registrarse ni mientras espera aprobación): si es un negocio de
     prueba sin fecha de vencimiento, se fija hoy + 30. */
  async _iniciarTrialSiAplica() {
    const t = Auth.tenant;
    if (!t || t.suscripcion_vence || t.active === false) return;
    if (Auth.user?.rol === 'superadmin') return;
    if (!(t.notas_admin || '').includes('Prueba gratis 30 días')) return;
    const vence = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const ok = await DB.updateTenant({ suscripcion_vence: vence });
    if (ok) {
      t.suscripcion_vence = vence;
      UI.toast(`🎉 ¡Tu prueba gratis de 30 días inició hoy! Vence el ${UI.fecha(vence)}`, 'info', 6000);
    }
  },

  /* ── SUSCRIPCIÓN / PRUEBA GRATIS ──────────────────
     Un comercio en prueba (precio 0) o con notas que dicen 'prueba' se
     considera demo. El demo vencido bloquea el acceso (auto-suspensión).
     El auto-suspender real vive en el cron suspender_trials_vencidos (BD,
     mig 065); esto es el bloqueo inmediato en el cliente para no depender
     de que el cron ya haya corrido. */
  _esTrial(t) {
    return (Number(t?.precio_mensual) || 0) === 0 ||
      (t?.notas_admin || '').toLowerCase().includes('prueba');
  },
  _trialVencido(t = Auth.tenant) {
    if (!t?.suscripcion_vence) return false;
    const hoy = new Date().toISOString().slice(0, 10);
    return t.suscripcion_vence < hoy && App._esTrial(t);
  },
  _bloqueadoPorSuscripcion() {
    if (Auth.user?.rol === 'superadmin') return false;
    return Auth.tenant?.active === false || App._trialVencido();
  },

  /* Pantalla de cuenta suspendida / prueba vencida / pendiente de activación */
  pantallaSuspendido() {
    const main = document.getElementById('page-content') || document.getElementById('app');
    const sb = document.getElementById('sidebar'); if (sb) sb.innerHTML = '';
    const t = Auth.tenant;
    const nombre = t?.name || 'tu comercio';
    const notas = (t?.notas_admin || '').toLowerCase();
    /* Pendiente = registrado pero aún no aprobado (no ha iniciado su prueba) */
    const pendiente = t?.active === false && notas.includes('pendiente de aprobación') && !t?.suscripcion_vence;
    const trialVencido = App._trialVencido(t);

    let icon, titulo, cuerpo;
    if (pendiente) {
      icon = '⏳'; titulo = 'Estamos activando tu comercio';
      cuerpo = `<b>${nombre}</b> fue registrado con éxito y está en revisión de activación
        (normalmente toma unas horas). Te avisaremos a tu correo cuando puedas empezar tus
        <b>30 días de prueba gratis</b>.`;
      if (main) main.innerHTML = `
        <div style="min-height:90vh;display:flex;align-items:center;justify-content:center;padding:24px">
          <div class="card" style="max-width:480px;text-align:center">
            <div style="font-size:44px">${icon}</div>
            <h2 style="margin:8px 0">${titulo}</h2>
            <p style="color:var(--text2);font-size:14px">${cuerpo}</p>
            <div style="margin-top:16px"><button class="btn btn-ghost" onclick="Auth.logout()">Cerrar sesión</button></div>
          </div>
        </div>`;
      return;
    }

    /* Demo vencido o suspendido → paywall: pagar con tarjeta o subir voucher */
    if (trialVencido) {
      icon = '🔒'; titulo = 'Tu prueba gratis terminó';
      cuerpo = `Tu prueba de 30 días de <b>${nombre}</b> venció el <b>${UI.fecha ? UI.fecha(t.suscripcion_vence) : t.suscripcion_vence}</b>.
        Tus datos están guardados y seguros: activa tu plan para seguir donde te quedaste.`;
    } else {
      icon = '⏸️'; titulo = 'Suscripción vencida o suspendida';
      cuerpo = `El acceso a <b>${nombre}</b> está suspendido por falta de pago o a solicitud del administrador.
        Realiza tu pago para reactivarlo, o contacta a soporte NexusPro.`;
    }
    const precio = App._precioMensual();
    if (main) main.innerHTML = `
      <div style="min-height:90vh;display:flex;align-items:center;justify-content:center;padding:24px">
        <div class="card" style="max-width:560px;text-align:center">
          <div style="font-size:44px">${icon}</div>
          <h2 style="margin:8px 0">${titulo}</h2>
          <p style="color:var(--text2);font-size:14px">${cuerpo}</p>
          ${precio ? `<div style="margin:10px 0;font-size:13px;color:var(--text2)">Costo de tu servicio:
            <b style="font-size:18px;color:var(--text)">${UI.q(precio)}</b> <span style="color:var(--text3)">/mes${PLANES[t?.plan]?.label ? ` (plan ${PLANES[t.plan].label})` : ''}</span></div>` : ''}
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:14px">
            ${App._botonesPago('Pagar')}
          </div>
          <div id="pw-estado" style="margin-top:12px;font-size:12px;color:var(--text3)"></div>
          <div style="margin-top:16px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="App.paywallEmailPagos()">✉️ Solicitar datos de pago por correo</button>
            <button class="btn btn-ghost btn-sm" onclick="Auth.logout()">Cerrar sesión</button>
          </div>
        </div>
      </div>`;
    App._cargarVoucherPrevio();
  },

  /* ── PAYWALL DE ACTIVACIÓN ─────────────────────────
     El comercio bloqueado puede: (A) registrar su tarjeta (NexusPro procesa
     el cargo y activa), o (B) transferir/depositar y subir el voucher, que
     la Edge Function verificar-voucher lee con IA y activa automáticamente
     si el pago coincide (si no, queda en revisión en el Panel SaaS). */
  _precioMensual() {
    const t = Auth.tenant || {};
    return Number(t.precio_mensual) > 0 ? Number(t.precio_mensual) : (PLANES[t.plan]?.precio || 0);
  },

  /* Botones de pago según los métodos habilitados para el comercio
     (Panel SaaS → ⚙️ del comercio → Métodos de pago). La transferencia con
     voucher siempre está; tarjeta y PayPal solo si el SaaS los habilitó —
     así el cliente nunca ve una opción que todavía no funciona. */
  _botonesPago(accion = 'Pagar', small = false) {
    const t = Auth.tenant || {};
    const cls = small ? 'btn btn-sm' : 'btn';
    const b = [];
    if (t.pago_tarjeta_habilitado) b.push(`<button class="${cls} btn-blue" onclick="App.paywallTarjeta()">💳 ${accion} con tarjeta</button>`);
    if (t.pago_paypal_habilitado)  b.push(`<button class="${cls} btn-cyan" onclick="App.paywallPaypal()">🅿️ PayPal</button>`);
    b.push(`<button class="${cls} btn-green" onclick="App.paywallTransferencia()">🏦 Transferencia / depósito</button>`);
    return b.join('');
  },

  async _configPagos() {
    if (App._cfgPagos) return App._cfgPagos;
    try {
      const { data } = await getSB().from('saas_config').select('valor').eq('clave', 'pago').maybeSingle();
      App._cfgPagos = data?.valor || {};
    } catch (e) { App._cfgPagos = {}; }
    return App._cfgPagos;
  },

  /* Si ya subió un voucher, mostrar su estado en el paywall */
  async _cargarVoucherPrevio() {
    try {
      const { data } = await getSB().from('vouchers_pago')
        .select('estado, motivo_rechazo')
        .order('created_at', { ascending: false }).limit(1);
      const v = data?.[0]; const el = document.getElementById('pw-estado');
      if (!v || !el) return;
      if (v.estado === 'revision') el.innerHTML = '⏳ Ya recibimos un comprobante tuyo y está <b>en revisión</b>. Te activaremos al confirmarlo.';
      else if (v.estado === 'rechazado') el.innerHTML = `⚠️ Tu último comprobante fue rechazado${v.motivo_rechazo ? ': ' + v.motivo_rechazo : ''}. Puedes subir otro.`;
    } catch (e) { /* tabla aún no migrada */ }
  },

  /* Opción A: pago con tarjeta.
     El cobro REAL siempre se procesa en el POS / pasarela segura del banco
     (ahí es donde se usa la tarjeta completa con su CVV, directo al banco).
     NexusPro nunca pide ni guarda el número completo ni el CVV (norma PCI):
       • Pago único   → solo se crea la solicitud de cobro, SIN guardar tarjeta.
       • Recurrente   → se guarda titular + últimos 4 (identificación, no
         sirven para cobrar) y la autorización del cargo mensual. */
  paywallTarjeta() {
    const meses = [...Array(12)].map((_, i) => `<option>${i + 1}</option>`).join('');
    const anios = [...Array(10)].map((_, i) => `<option>${new Date().getFullYear() + i}</option>`).join('');
    const precio = App._precioMensual();
    UI.modal('💳 Pagar con tarjeta', `
      <div class="alert alert-cyan" style="margin-bottom:12px"><div class="alert-icon">🔒</div>
        <div class="alert-body" style="font-size:12px"><b>Tu tarjeta nunca viaja completa por NexusPro.</b>
        El cobro se procesa en el POS / pasarela segura del banco, donde sí se valida tu tarjeta
        completa con su CVV. Por seguridad (norma PCI) aquí no pedimos ni guardamos esos datos.</div></div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
        <label style="display:flex;align-items:flex-start;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer">
          <input type="radio" name="pw-tj-modo" value="unico" checked onchange="App._toggleModoTarjeta('unico')">
          <span style="font-size:13px"><b>Pago único</b> — cobrar una sola vez.
            <span style="color:var(--text3)">No guardamos ningún dato de tu tarjeta.</span></span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer">
          <input type="radio" name="pw-tj-modo" value="recurrente" onchange="App._toggleModoTarjeta('recurrente')">
          <span style="font-size:13px"><b>Pago recurrente</b> — autorizo el cargo automático mensual.
            <span style="color:var(--text3)">Guardamos solo titular y últimos 4 dígitos para identificarla.</span></span>
        </label>
      </div>

      <div id="pw-tj-unico">
        <div style="font-size:12.5px;color:var(--text2);line-height:1.6;margin-bottom:12px">
          Se creará tu <b>solicitud de cobro único${precio ? ` por ${UI.q(precio)}` : ''}</b>.
          NexusPro te contactará de inmediato para procesar el pago con tu tarjeta en el
          POS / enlace de pago seguro y activará tu servicio al confirmarse.
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
          <button class="btn btn-blue" onclick="App.solicitarCobroUnico()">💳 Solicitar cobro único</button>
        </div>
      </div>

      <div id="pw-tj-recurrente" style="display:none">
        <div class="form-group"><label class="form-label">Nombre del titular *</label>
          <input class="form-input" id="pw-tj-titular" placeholder="Como aparece en la tarjeta"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Marca</label>
            <select class="form-select" id="pw-tj-marca"><option>VISA</option><option>MASTERCARD</option><option>OTRA</option></select></div>
          <div class="form-group"><label class="form-label">Últimos 4 dígitos *</label>
            <input class="form-input mono-sm" id="pw-tj-u4" maxlength="4" inputmode="numeric" placeholder="****"
                   oninput="this.value=this.value.replace(/\\D/g,'').slice(0,4)"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Mes de vencimiento</label>
            <select class="form-select" id="pw-tj-mes">${meses}</select></div>
          <div class="form-group"><label class="form-label">Año</label>
            <select class="form-select" id="pw-tj-anio">${anios}</select></div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
          Los últimos 4 dígitos <b>no sirven para cobrar</b>: solo identifican tu tarjeta en los recibos.
          El primer cargo lo procesa NexusPro contigo en el POS / pasarela segura; los siguientes quedan automáticos.
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
          <button class="btn btn-blue" onclick="App.guardarTarjetaPaywall()">💳 Autorizar cargo recurrente</button>
        </div>
      </div>`);
  },

  _toggleModoTarjeta(modo) {
    const u = document.getElementById('pw-tj-unico');
    const r = document.getElementById('pw-tj-recurrente');
    if (u) u.style.display = modo === 'unico' ? '' : 'none';
    if (r) r.style.display = modo === 'recurrente' ? '' : 'none';
  },

  /* Pago único: NO se guarda la tarjeta. Se crea una solicitud de cobro que
     el Panel SaaS (Cobros → vouchers) atiende: se procesa en el POS/pasarela
     y al aprobarla se registra el pago (método Tarjeta) y se activa. */
  async solicitarCobroUnico() {
    const precio = App._precioMensual();
    const { error } = await getSB().from('vouchers_pago').insert({
      tenant_id: Auth.tenant.id,
      monto: precio || null,
      banco: 'Tarjeta — cobro único',
      referencia: 'Solicitud de cobro único con tarjeta (contactar al cliente)',
      estado: 'revision',
    });
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.cerrarModal();
    const el = document.getElementById('pw-estado');
    if (el) el.innerHTML = '✅ <b>Solicitud de cobro único recibida.</b> Te contactaremos para procesar el pago con tu tarjeta (no guardamos sus datos) y activar tu servicio.';
    UI.toast('Solicitud de cobro único enviada ✓', 'info', 5000);
  },

  async guardarTarjetaPaywall() {
    const titular = document.getElementById('pw-tj-titular')?.value.trim();
    const u4 = document.getElementById('pw-tj-u4')?.value.trim() || '';
    if (!titular || u4.length !== 4) { UI.toast('Ingresa el titular y los últimos 4 dígitos', 'error'); return; }
    const fields = {
      titular,
      marca: document.getElementById('pw-tj-marca')?.value || 'VISA',
      ultimos4: u4,
      exp_mes: parseInt(document.getElementById('pw-tj-mes')?.value) || null,
      exp_anio: parseInt(document.getElementById('pw-tj-anio')?.value) || null,
      cargo_automatico: true,
      notas: 'Cargo recurrente autorizado por el comercio (activación de servicio)',
    };
    /* update si ya existe (privilegios por columna: tenant_id solo en INSERT) */
    const sb = getSB();
    const { data: prev } = await sb.from('tenant_tarjetas').select('id').eq('tenant_id', Auth.tenant.id).maybeSingle();
    const { error } = prev
      ? await sb.from('tenant_tarjetas').update(fields).eq('id', prev.id)
      : await sb.from('tenant_tarjetas').insert({ ...fields, tenant_id: Auth.tenant.id });
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.cerrarModal();
    const el = document.getElementById('pw-estado');
    if (el) el.innerHTML = '✅ <b>Cargo recurrente autorizado.</b> NexusPro procesará el cargo de tu plan y activará tu servicio; te llegará la confirmación a tu correo.';
    UI.toast('Cargo recurrente autorizado ✓');
  },

  /* Opción B: transferencia/depósito + voucher (lo lee Nexus IA) */
  async paywallTransferencia() {
    const cfg = await App._configPagos();
    const cuentas = Array.isArray(cfg.cuentas) ? cfg.cuentas : [];
    const precio = App._precioMensual();
    const cuentasHtml = cuentas.length ? cuentas.map(c => `
      <div style="padding:8px 10px;background:var(--surface2);border-radius:8px;margin-bottom:6px;text-align:left">
        <div style="font-weight:700;font-size:13px">🏦 ${c.banco || ''} <span class="badge badge-gray" style="font-size:10px">${c.tipo || 'Monetaria'}</span></div>
        <div class="mono-sm" style="font-size:14px">${c.numero || ''}</div>
        <div style="font-size:11px;color:var(--text3)">${c.titular || ''}</div>
      </div>`).join('')
      : `<div class="alert alert-amber"><div class="alert-icon">✉️</div><div class="alert-body" style="font-size:12px">
          Solicita el número de cuenta por correo (botón del paywall) y luego sube aquí tu comprobante.</div></div>`;
    UI.modal('🏦 Pago por transferencia o depósito', `
      ${precio ? `<div style="font-size:13px;margin-bottom:10px">Monto de tu plan: <b>${UI.q(precio)}</b>/mes
        <span style="color:var(--text3)">(puedes pagar varios meses en un solo depósito)</span></div>` : ''}
      ${cuentasHtml}
      <div style="border-top:1px solid var(--border);margin:12px 0 0;padding-top:12px">
        <div style="font-weight:700;font-size:13px;margin-bottom:8px">📸 Sube tu comprobante (voucher)</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">
          Nexus leerá el comprobante y, si el pago coincide, <b>activará tu servicio automáticamente</b>.</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Monto pagado (Q)</label>
            <input class="form-input" id="pw-vo-monto" type="number" min="0" step="0.01" value="${precio || ''}"></div>
          <div class="form-group"><label class="form-label">No. de boleta / referencia</label>
            <input class="form-input" id="pw-vo-ref" placeholder="Opcional"></div>
        </div>
        <div class="form-group"><label class="form-label">Foto o captura del comprobante *</label>
          <input class="form-input" id="pw-vo-file" type="file" accept="image/*"></div>
        <div id="pw-vo-msg" style="font-size:12px;margin-top:6px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-green" id="pw-vo-btn" onclick="App.enviarVoucherPaywall()">📤 Enviar comprobante</button>
      </div>`);
  },

  async enviarVoucherPaywall() {
    const file = document.getElementById('pw-vo-file')?.files?.[0];
    const msg = document.getElementById('pw-vo-msg');
    const btn = document.getElementById('pw-vo-btn');
    if (!file) { UI.toast('Selecciona la foto del comprobante', 'error'); return; }
    try {
      const { base64, esPdf } = await UI.fileABase64(file, { maxPx: 1400, calidad: 0.85 });
      if (esPdf) { UI.toast('Sube una foto o captura de pantalla (no PDF)', 'error'); return; }
      if (btn) { btn.disabled = true; btn.textContent = '🔎 Verificando pago...'; }
      if (msg) msg.innerHTML = '⏳ Nexus está leyendo tu comprobante...';
      const { data, error } = await getSB().functions.invoke('verificar-voucher', {
        body: {
          imagen_base64: base64,
          monto: parseFloat(document.getElementById('pw-vo-monto')?.value) || null,
          referencia: document.getElementById('pw-vo-ref')?.value.trim() || null,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error.message);
      if (data.estado === 'aprobado') {
        if (msg) msg.innerHTML = `✅ <b>${data.mensaje}</b> Recargando...`;
        UI.toast(data.mensaje, 'info', 5000);
        setTimeout(() => location.reload(), 1800);
      } else {
        if (msg) msg.innerHTML = `⏳ ${data.mensaje}`;
        if (btn) { btn.disabled = false; btn.textContent = '📤 Enviar otro comprobante'; }
        const est = document.getElementById('pw-estado');
        if (est) est.innerHTML = '⏳ Comprobante recibido, <b>en revisión</b>. Te activaremos al confirmarlo.';
      }
    } catch (e) {
      if (msg) msg.innerHTML = `❌ ${e.message}`;
      if (btn) { btn.disabled = false; btn.textContent = '📤 Enviar comprobante'; }
    }
  },

  /* Opción C: PayPal (solo si el SaaS lo habilitó para el comercio).
     El pago se hace en PayPal y el cliente sube su captura, que entra al
     mismo flujo de vouchers (revisión en Panel SaaS → Cobros). */
  async paywallPaypal() {
    const cfg = await App._configPagos();
    if (!cfg.paypal_email && !cfg.paypal_link) {
      UI.toast('PayPal aún no está disponible. Usa transferencia o solicita los datos por correo.', 'warn');
      return;
    }
    const precio = App._precioMensual();
    UI.modal('🅿️ Pago con PayPal', `
      ${precio ? `<div style="font-size:13px;margin-bottom:10px">Monto de tu plan: <b>${UI.q(precio)}</b>/mes</div>` : ''}
      <div style="padding:10px;background:var(--surface2);border-radius:8px;margin-bottom:12px;font-size:13px">
        ${cfg.paypal_email ? `Envía tu pago a: <b>${cfg.paypal_email}</b><br>` : ''}
        ${cfg.paypal_link ? `<a href="${cfg.paypal_link}" target="_blank" rel="noopener" class="btn btn-sm btn-cyan" style="margin-top:6px">🅿️ Abrir PayPal para pagar</a>` : ''}
      </div>
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">📸 Sube la captura de tu pago</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px">
        Tu servicio se activará al confirmarse el pago (normalmente en horas).</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Monto pagado (Q)</label>
          <input class="form-input" id="pw-vo-monto" type="number" min="0" step="0.01" value="${precio || ''}"></div>
        <div class="form-group"><label class="form-label">ID de transacción PayPal</label>
          <input class="form-input" id="pw-vo-ref" placeholder="Opcional"></div>
      </div>
      <div class="form-group"><label class="form-label">Captura del pago *</label>
        <input class="form-input" id="pw-vo-file" type="file" accept="image/*"></div>
      <div id="pw-vo-msg" style="font-size:12px;margin-top:6px"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-cyan" id="pw-vo-btn" onclick="App.enviarVoucherPaywall()">📤 Enviar comprobante</button>
      </div>`);
  },

  /* Solicitar los datos de pago por correo */
  async paywallEmailPagos() {
    const cfg = await App._configPagos();
    const para = cfg.email_pagos || 'henry.chinchilla@gmail.com';
    const t = Auth.tenant || {};
    const precio = App._precioMensual();
    const asunto = `Activación de servicio NexusPro — ${t.name || t.slug || ''}`;
    const body = `Hola, mi prueba/suscripción de NexusPro venció.\n\nComercio: ${t.name || ''}\nPlan: ${PLANES[t.plan]?.label || t.plan || ''}${precio ? `\nMonto mensual: Q${precio}` : ''}\n\n¿Me comparten el número de cuenta para hacer la transferencia?\n\nGracias.`;
    window.open(`mailto:${para}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(body)}`, '_blank');
  },

  /* ── FIX EMOJIS EN TÍTULOS CON GRADIENTE ─────────────
     .page-title y .dash-hero-saludo usan background-clip:text con relleno
     transparente: el texto toma el gradiente pero los emojis pierden su
     color (se ven monocromos). Se envuelve cada emoji en un span .emoji-color
     que restaura el relleno normal. Un MutationObserver lo aplica en cada
     render sin tocar los ~30 módulos que pintan títulos. */
  _fixEmojiGradiente() {
    const re = /(\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}️‍]|\p{Extended_Pictographic})*)/gu;
    document.querySelectorAll('.page-title:not([data-emojifix]), .dash-hero-saludo:not([data-emojifix])').forEach(el => {
      el.dataset.emojifix = '1';
      if (re.test(el.innerHTML)) {
        el.innerHTML = el.innerHTML.replace(re, '<span class="emoji-color">$1</span>');
      }
    });
  },
  /* Un solo observador para los retoques que van sobre CUALQUIER render:
     los emojis de los títulos y el buscador de las tablas. */
  _initRenderHooks() {
    if (App._emojiObs) return;
    App._emojiObs = new MutationObserver(() => { App._fixEmojiGradiente(); App._ponerBuscadores(); });
    App._emojiObs.observe(document.body, { childList: true, subtree: true });
    App._fixEmojiGradiente();
    App._ponerBuscadores();
  },

  /* ── BUSCADOR AUTOMÁTICO EN LAS TABLAS ───────────────
     De 31 módulos con listado, sólo Clientes tenía buscador — y el suyo va
     por consulta a la BD (DB.getClientes(busca)). Copiar eso a mano en los
     otros 30 son 30 oportunidades de olvidarse de uno, que es exactamente
     cómo quedaron así. Por eso el buscador se inyecta solo, encima de toda
     tabla que haya en la página, sin tocar ningún módulo: los que existen
     hoy y los que se agreguen mañana.

     Filtra las filas YA renderizadas, no vuelve a consultar. Consecuencia
     que hay que tener presente: en los listados por mes (Compras, OBD,
     Contabilidad…) busca dentro del mes cargado, no en todo el historial —
     para eso está el selector de mes/año, que sigue igual. */
  /* Basta UNA fila para que aparezca el buscador. Estuvo en 3 y fue un error:
     con dos vehículos cargados la caja no salía y el módulo parecía no tenerla.
     El pedido fue "en todos los módulos"; que aparezca o no según cuántos
     registros haya es impredecible, y lo impredecible se lee como roto. */
  _MIN_FILAS_BUSCADOR: 1,
  _busquedaTabla: {},

  _normalizarBusqueda(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');   // "Movil" encuentra "Movil" con tilde
  },

  /* Puro a propósito (recibe las filas, no las busca): es lo que se prueba.
     Varias palabras = todas deben aparecer ("nissan 2017"). Devuelve cuántas
     filas de datos quedaron visibles. */
  _filtrarFilas(filas, q) {
    const terminos = App._normalizarBusqueda(q).trim().split(/\s+/).filter(Boolean);
    let visibles = 0;
    for (const tr of filas) {
      /* La fila de "Sin registros" no se filtra: estorba mientras se busca
         y tiene que volver cuando se limpia la búsqueda. */
      if (tr.dataset && tr.dataset.sinFiltro === '1') {
        tr.style.display = terminos.length ? 'none' : '';
        continue;
      }
      const texto = App._normalizarBusqueda(tr.textContent);
      const coincide = terminos.every(t => texto.includes(t));
      tr.style.display = coincide ? '' : 'none';
      if (coincide) visibles++;
    }
    return visibles;
  },

  _filasDe(tabla) {
    const tbody = tabla.tBodies && tabla.tBodies[0];
    return tbody ? Array.from(tbody.rows) : [];
  },

  _ponerBuscadores() {
    const zona = document.getElementById('page-content');
    if (!zona) return;

    zona.querySelectorAll('table').forEach((tabla, i) => {
      if (tabla.dataset.buscador) return;

      const filas = App._filasDe(tabla);
      /* Fila de estado vacío: una sola celda con colspan. Se marca para que
         el filtro la trate aparte y no cuente como registro. */
      const datos = filas.filter(tr => {
        const vacia = tr.cells.length === 1 && tr.cells[0].hasAttribute('colspan');
        if (vacia) tr.dataset.sinFiltro = '1';
        return !vacia;
      });
      if (datos.length < App._MIN_FILAS_BUSCADOR) return;   // una lista vacía no se busca

      /* Respetar al módulo que YA trae su propio buscador, para no dejar dos
         cajas sobre la misma tabla (Inventario, Órdenes, Proveedores, Bodegas,
         Facturación, Bitácora, Precios MAGA y Clientes tienen el suyo).

         Dos formas de equivocarse acá, y ya caímos en las dos:
         · Buscar `input[type=text]` en el selector NO los encuentra: esos
           campos se escriben `<input class="form-input" placeholder="🔍 Buscar…">`,
           sin atributo `type`. Por eso Inventario terminó con dos cajas.
           Se mira la PROPIEDAD `.type`, que vale 'text' aunque el atributo
           falte. Los filtros de fecha o cantidad (`type=date|number`) no
           cuentan como buscador, así que esas páginas sí reciben el suyo.
         · Contar mis propias cajas: el input que este código le puso a la
           primera tabla hacía que la SEGUNDA se quedara sin buscador. Por eso
           se excluye todo lo que viva dentro de `.buscador-auto`. */
      const contenedor = tabla.closest('.page-body') || tabla.parentElement;
      const TEXTO = ['', 'text', 'search'];
      const yaTieneBuscadorPropio = contenedor && (
        contenedor.querySelector('.search-bar') ||
        Array.from(contenedor.querySelectorAll('input')).some(inp =>
          TEXTO.includes((inp.type || '').toLowerCase()) && !inp.closest('.buscador-auto'))
      );
      if (yaTieneBuscadorPropio) return;

      tabla.dataset.buscador = '1';
      const clave = App.paginaActual + '#' + i;

      const barra = document.createElement('div');
      barra.className = 'buscador-auto';
      const input = document.createElement('input');
      input.className = 'form-input';
      input.type = 'search';
      input.placeholder = '🔍 Buscar en la lista...';
      const info = document.createElement('span');
      info.className = 'buscador-auto-info';
      barra.append(input, info);

      const aplicar = () => {
        const visibles = App._filtrarFilas(App._filasDe(tabla), input.value);
        App._busquedaTabla[clave] = input.value;
        info.textContent = !input.value.trim() ? ''
          : visibles ? `${visibles} de ${datos.length}`
          : 'sin coincidencias';
        info.style.color = input.value.trim() && !visibles ? 'var(--red)' : 'var(--text3)';
      };
      input.addEventListener('input', aplicar);

      /* El buscador va afuera de la tarjeta/scroll de la tabla, no adentro. */
      const ancla = tabla.closest('.table-wrap, .card') || tabla;
      ancla.insertAdjacentElement('beforebegin', barra);

      /* Un guardado o un borrado repintan la tabla entera: recuperar lo que
         estaba escrito, o el filtro se perdería en cada acción. */
      const previa = App._busquedaTabla[clave];
      if (previa) { input.value = previa; aplicar(); }
    });
  },

  /* ── SIDEBAR ──────────────────────────────────── */
  renderSidebar() {
    const rol = Auth.user?.rol || 'recepcionista';
    const puedeVer = m => {
      if (!Auth.user) return false;
      if (m.id === 'mi_ot') return rol === 'cliente';
      if (m.id === 'superadmin') return rol === 'superadmin';
      if (rol === 'superadmin') return true;       // el dueño del SaaS ve todo
      return tieneAcceso(m.id);                     // admin del negocio queda sujeto a su plan
    };

    const itemHtml = m => {
      const ic = GRUPO_COLOR[m.grupo] || '';
      /* Módulos con enlace externo (ej. POS) abren en nueva pestaña */
      if (m.href) {
        return `
        <li class="nav-item" style="list-style:none;--ic:${ic}">
          <a class="nav-link" href="${m.href}" target="_blank" rel="noopener"
             style="display:flex;align-items:center;gap:10px;padding:10px 16px;text-decoration:none;color:inherit;border-radius:8px;transition:background .15s"
             onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''"
          ><span class="nav-icon">${m.icon}</span><span class="nav-label">${m.label}</span></a>
        </li>`;
      }
      const activo = App.paginaActual === m.id;
      /* Submenú interno (solo visible cuando el módulo está activo) */
      const subnav = (m.subnav || []).filter(s => !s.roles || s.roles.includes(rol));
      const sub = (activo && subnav.length && !App._subColapsado) ? `
        <ul class="nav-sub">
          ${subnav.map(s => `
            <li class="nav-subitem ${App._subActivo === s.tab ? 'active' : ''}"
                onclick="event.stopPropagation();App.navegarSub('${m.id}','${s.tab}')">
              <span class="nav-icon">${s.icon}</span>
              <span class="nav-label">${s.label}</span>
            </li>`).join('')}
        </ul>` : '';
      return `
        <li class="nav-item ${activo ? 'active' : ''}" style="--ic:${ic}"
            onclick="App.navegarA('${m.id}')">
          <span class="nav-icon">${m.icon}</span>
          <span class="nav-label">${m.label}</span>
        </li>${sub}`;
    };

    /* Render por grupos, en el orden definido en GRUPOS */
    const nav = GRUPOS.map(g => {
      const items = MODULOS.filter(m => m.grupo === g.id && puedeVer(m));
      if (!items.length) return '';
      const header = g.label
        ? `<li class="nav-group-label">${g.label}</li>` : '';
      return header + items.map(itemHtml).join('');
    }).join('');

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    /* El sidebar se reconstruye en cada navegación: conservar su scroll
       (en memoria entre renders y en sessionStorage para el refresh) */
    const scrollPrevio = sidebar.scrollTop > 0
      ? sidebar.scrollTop
      : (parseInt(sessionStorage.getItem('tp_sb_scroll')) || 0);

    /* Botón del asistente IA: oculto para clientes y gateado por el
       módulo 'ia' (incluido en Empresarial; add-on para Básico/Pro) */
    const iaBtn = (rol === 'cliente' || (rol !== 'superadmin' && !moduloEnPlan('ia'))) ? '' : `
      <div class="sidebar-ia">
        <button class="btn-ia" onclick="IA.abrirChat()">
          <span class="btn-ia-icon">🔧</span>
          <span>Nexus — Asistente IA</span>
        </button>
      </div>`;

    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="sidebar-brand-name">NEXUSPRO</div>
        <div class="sidebar-brand-sub">${APP.slogan}</div>
        <div class="sidebar-brand-sub app-version" style="font-size:9.5px;opacity:.6;margin-top:2px;letter-spacing:0;text-transform:none"></div>
      </div>
      <div class="sidebar-tenant" onclick="App.toggleSidebar()" style="display:flex;align-items:center;gap:8px">
        ${Auth.tenant?.logo_base64 ? `<img src="${Auth.tenant.logo_base64}" alt="logo" style="width:28px;height:28px;border-radius:6px;object-fit:contain;background:var(--surface2);flex-shrink:0">` : ''}
        <div class="sidebar-tenant-name" title="${Auth.tenant?.name || ''}">${Auth.tenant?.name || 'NexusPro'}</div>
      </div>
      <nav class="sidebar-nav"><ul>${nav}</ul></nav>
      ${iaBtn}
      <div class="sidebar-user" id="sidebar-user" onclick="TEMAS.picker()" title="Cambiar tema">
        <span class="sidebar-user-avatar">${Auth.user?.avatar || '👤'}</span>
        <div class="sidebar-user-info">
          <div class="user-name">${UI.esc(Auth.user?.nombre || 'Usuario')}</div>
          <div class="user-role">${ROLES[Auth.user?.rol]?.label || ''}</div>
        </div>
        <span style="margin-left:auto;opacity:.5;font-size:14px">🎨</span>
      </div>
      <div class="sidebar-footer">
        ${App._puedeInstalar() ? `
        <button class="btn btn-cyan btn-sm" onclick="App.instalarApp()" style="width:100%;margin-bottom:8px">
          📲 Instalar como App
        </button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="App.cerrarSesion()" style="width:100%">
          ⏻ Cerrar sesión
        </button>
        <div style="display:flex;justify-content:center;gap:12px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08)">
          <a href="/privacidad.html" target="_blank" style="font-size:10px;color:rgba(255,255,255,0.4);text-decoration:none;transition:color .2s" onmouseover="this.style.color='rgba(255,255,255,0.75)'" onmouseout="this.style.color='rgba(255,255,255,0.4)'">Privacidad</a>
          <span style="font-size:10px;color:rgba(255,255,255,0.2)">·</span>
          <a href="/terminos.html" target="_blank" style="font-size:10px;color:rgba(255,255,255,0.4);text-decoration:none;transition:color .2s" onmouseover="this.style.color='rgba(255,255,255,0.75)'" onmouseout="this.style.color='rgba(255,255,255,0.4)'">Términos</a>
          <span style="font-size:10px;color:rgba(255,255,255,0.2)">·</span>
          <span style="font-size:10px;color:rgba(255,255,255,0.35)" title="Derechos reservados">© 2026 CM INVESTMENTS</span>
        </div>
      </div>`;

    /* El render se lleva el texto de la versión: hay que volver a ponerlo */
    if (typeof pintarVersion === 'function') pintarVersion();

    /* Restaurar la posición del menú y mantenerla persistida */
    sidebar.scrollTop = scrollPrevio;
    if (!sidebar._scrollHook) {
      sidebar._scrollHook = true;
      sidebar.addEventListener('scroll', () => {
        sessionStorage.setItem('tp_sb_scroll', String(sidebar.scrollTop));
      }, { passive: true });
    }
  },

  /* ── NAVEGACIÓN ───────────────────────────────── */
  navegarA(pagina) {
    if (!Auth.user) return;
    if (pagina !== App.paginaActual && !App.puedeSalir()) return;
    const rol = Auth.user.rol;

    /* Click sobre el módulo ya activo: contraer/expandir sus pestañas
       en vez de volver a renderizar la página */
    if (App.paginaActual === pagina) {
      const def = MODULOS.find(m => m.id === pagina);
      if (def?.subnav?.length) {
        App._subColapsado = !App._subColapsado;
        App.renderSidebar();
        return;
      }
    }

    /* Verificar permisos */
    if (pagina === 'superadmin') {
      if (rol !== 'superadmin') { UI.toast('Sin acceso a este módulo', 'error'); return; }
    } else if (pagina !== 'mi_ot' && rol !== 'superadmin') {
      if (!tieneAcceso(pagina)) {
        UI.toast(moduloEnPlan(pagina) ? 'Sin acceso a este módulo' : 'Este módulo no está incluido en tu plan', 'error');
        return;
      }
    }

    App.paginaActual = pagina;
    App._subColapsado = false;
    App._busquedaTabla = {};   // el filtro sobrevive al repintado, no al cambio de módulo
    /* Sincronizar la sub-sección activa con la pestaña interna del módulo */
    const def = MODULOS.find(m => m.id === pagina);
    const modulo = window.Modulos?.[pagina];
    App._subActivo = (def?.subnav?.length)
      ? (modulo?._tab || def.subnav[0].tab)
      : null;
    App._guardarRuta();
    App.renderSidebar();
    App._vigilarPermisosUI();

    /* Cargar módulo */
    if (modulo?.render) {
      modulo.render();
    } else {
      const el = document.getElementById('page-content');
      if (el) el.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">🔧</div>
        <div>Módulo <b>${pagina}</b> cargando...</div>
      </div>`;
    }
  },

  /* ── NAVEGACIÓN A SUB-SECCIÓN (submenú lateral) ── */
  navegarSub(pagina, tab) {
    if ((pagina !== App.paginaActual || tab !== App._subActivo) && !App.puedeSalir()) return;
    const modulo = window.Modulos?.[pagina];
    App._subActivo = tab;
    if (App.paginaActual !== pagina) {
      App.paginaActual = pagina;
      if (modulo) modulo._tab = tab;
      App._guardarRuta();
      App.renderSidebar();
      modulo?.render?.();
      return;
    }
    /* Ya estamos en el módulo: solo cambiar de pestaña */
    if (modulo) {
      modulo._tab = tab;
      App._guardarRuta();
      App.renderSidebar();
      if (modulo._renderTab) {
        App.marcarTabActivo(tab);
        modulo._renderTab();
      } else {
        modulo.render?.();
      }
    }
  },

  /* Marca visualmente el tab-btn activo dentro del módulo actual.
     Se llama tanto desde navegarSub() (sidebar) como desde _ir() de cada módulo. */
  marcarTabActivo(tab) {
    document.querySelectorAll('#page-content .tabs .tab-btn').forEach(btn => {
      /* La cadena del onclick puede ser '_ir(\'iva\')', '_ir("iva")', etc.
         Buscamos la forma entrecomillada del tab para evitar falsos positivos. */
      const oc = btn.getAttribute('onclick') || '';
      const activo = oc.includes(`'${tab}'`) || oc.includes(`"${tab}"`);
      btn.classList.toggle('active', activo);
    });
  },

  /* ── OCULTAR ACCIONES SEGÚN NIVEL DE ACCESO ────────
     Red de seguridad para botones NO estandarizados: si el usuario no puede
     editar/eliminar en el módulo activo se ocultan los botones de crear
     (＋ Nuevo), editar (✏️) y eliminar (🗑️) que aparezcan en la página.
     Los módulos que usan Modulos.btnAccion ya ni siquiera los renderizan. */
  _vigilarPermisosUI() {
    if (App._permObs) return;
    const cont = document.getElementById('page-content');
    if (!cont || typeof MutationObserver === 'undefined') return;
    App._permObs = new MutationObserver(() => {
      if (App._permRaf) return;
      App._permRaf = requestAnimationFrame(() => { App._permRaf = null; App._aplicarPermisosUI(); });
    });
    App._permObs.observe(cont, { childList: true, subtree: true });
    App._aplicarPermisosUI();
  },

  _aplicarPermisosUI() {
    const mod = App.paginaActual;
    if (!mod || typeof puedeAccion !== 'function') return;
    const pEditar   = puedeAccion(mod, 'editar');
    const pEliminar = puedeAccion(mod, 'eliminar');
    if (pEditar && pEliminar) return;
    document.querySelectorAll('#page-content button:not([data-perm])').forEach(b => {
      const t  = (b.textContent || '').trim();
      const oc = b.getAttribute('onclick') || '';
      const esEliminar = t.includes('🗑') || /^elimina/i.test(b.title || '');
      const esEditar   = t.includes('✏️') || t.startsWith('＋') || t.startsWith('+ ') ||
                         /modalNuevo|modalForm|modalEditar/.test(oc);
      if ((!pEliminar && esEliminar) || (!pEditar && esEditar)) b.style.display = 'none';
      b.setAttribute('data-perm', '1');
    });
  },

  /* ── RUTA PERSISTENTE (#modulo/pestaña) ───────────
     Sobrevive al refresh: la ruta vive en el hash de la URL y
     App.iniciar la restaura validando que el módulo exista y que
     el usuario tenga acceso. */
  _guardarRuta() {
    const ruta = '#' + App.paginaActual + (App._subActivo ? '/' + App._subActivo : '');
    if (location.hash !== ruta) history.replaceState(null, '', ruta);
  },

  _restaurarRuta() {
    const [pagina, tab] = (location.hash || '').replace(/^#/, '').split('/');
    /* El superadmin (dueño del SaaS) aterriza directo en el Panel SaaS al
       entrar sin ruta previa: administra sin depender de un comercio. */
    if (!pagina && Auth.user?.rol === 'superadmin' && window.Modulos?.superadmin) return 'superadmin';
    if (!pagina || pagina === 'dashboard') return 'dashboard';
    const def = MODULOS.find(m => m.id === pagina);
    if (!def || !window.Modulos?.[pagina]) return 'dashboard';
    if (typeof tieneAcceso === 'function' && !tieneAcceso(pagina)) return 'dashboard';
    if (tab && def.subnav?.some(s => s.tab === tab)) window.Modulos[pagina]._tab = tab;
    return pagina;
  },

  /* ── CERRAR SESIÓN ────────────────────────────── */
  async cerrarSesion() {
    await Auth.logout();
    location.reload();
  },

  /* ── CIERRE DE SESIÓN POR INACTIVIDAD ─────────────
     Editable por negocio (Configuración > Seguridad de Sesión,
     tenants.session_timeout_minutes, default 15). Reinicia el
     contador en cualquier interacción del usuario. */
  iniciarInactividad(minutes) {
    const mins = Math.min(480, Math.max(1, parseInt(minutes, 10) || 15));
    this._idleMs = mins * 60 * 1000;
    if (!this._idleBound) {
      this._idleBound = () => this._resetIdle();
      ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(ev =>
        window.addEventListener(ev, this._idleBound, { passive: true })
      );
    }
    this._resetIdle();
  },

  _resetIdle() {
    if (!Auth.user) return;
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(async () => {
      localStorage.setItem('tp_logout_reason', 'inactivity');
      await Auth.logout();
      location.reload();
    }, this._idleMs);
  },

  /* ── SIDEBAR COLAPSABLE (escritorio) ──────────────
     Botón flotante en el borde del menú: ◀ lo oculta (contenido a
     pantalla completa), ☰ lo vuelve a mostrar. Preferencia recordada. */
  _initSidebarToggle() {
    if (document.getElementById('sb-toggle')) return;
    const b = document.createElement('button');
    b.id = 'sb-toggle';
    b.title = 'Mostrar / ocultar menú';
    b.onclick = () => App.toggleSidebarDesktop();
    document.body.appendChild(b);
    if (localStorage.getItem('tp_sb_oculto') === '1') document.body.classList.add('sb-oculto');
    App._pintarSbToggle();
  },

  toggleSidebarDesktop() {
    const oculto = document.body.classList.toggle('sb-oculto');
    localStorage.setItem('tp_sb_oculto', oculto ? '1' : '0');
    App._pintarSbToggle();
  },

  _pintarSbToggle() {
    const b = document.getElementById('sb-toggle');
    if (b) b.textContent = document.body.classList.contains('sb-oculto') ? '☰' : '◀';
  },

  /* ── SIDEBAR TOGGLE MÓVIL ─────────────────────── */
  toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-overlay')?.classList.toggle('open');
  },

  /* ── SUSCRIPCIÓN (reemplaza a la licencia vieja) ──
     Banner cuando la suscripción/prueba está por vencer (≤7 días) o vencida.
     La activación/cobro la gestiona el superadmin desde el panel SaaS. */
  checkSuscripcion() {
    if (Auth.user?.rol === 'superadmin') return;
    const vence = Auth.tenant?.suscripcion_vence;
    if (!vence) return;
    const dias = Math.ceil((new Date(vence + 'T00:00:00') - Date.now()) / 86400000);
    if (dias > 7) return;

    const esTrial = (Auth.tenant?.notas_admin || '').toLowerCase().includes('prueba');
    const vencida = dias < 0;
    const texto = vencida
      ? `⚠️ Tu ${esTrial ? 'prueba gratis' : 'suscripción'} venció el ${UI.fecha ? UI.fecha(vence) : vence}. Comunícate con tu proveedor para reactivarla.`
      : `⏰ Tu ${esTrial ? 'prueba gratis' : 'suscripción'} vence en ${dias} día${dias === 1 ? '' : 's'}.`;

    const banner = document.createElement('div');
    banner.id = 'susc-banner';
    banner.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:999;
      background:${vencida || dias <= 3 ? 'var(--red)' : 'var(--amber)'};color:#fff;
      padding:8px 16px;font-size:12px;font-weight:600;
      display:flex;align-items:center;justify-content:space-between;`;
    banner.innerHTML = `
      <span>${texto}</span>
      <button onclick="document.getElementById('susc-banner').remove()"
        style="background:none;border:none;cursor:pointer;font-size:16px">✕</button>`;
    document.body.appendChild(banner);
  },

  /* ── INSTALAR COMO APP (PWA → Android/iOS) ────────
     Android/Chrome: prompt nativo capturado en beforeinstallprompt.
     iOS/Safari: no hay prompt — se muestran instrucciones.
     Si ya corre instalada (standalone), el botón no aparece. */
  _esStandalone() {
    return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  },
  _esIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); },
  _puedeInstalar() {
    return !App._esStandalone() && (!!window._pwaPrompt || App._esIOS());
  },

  async instalarApp() {
    if (window._pwaPrompt) {
      window._pwaPrompt.prompt();
      const { outcome } = await window._pwaPrompt.userChoice.catch(()=>({outcome:'dismissed'}));
      if (outcome === 'accepted') {
        UI.toast('¡Listo! Busca NexusPro en tu pantalla de inicio 📲', 'success', 5000);
        window._pwaPrompt = null;
        App.renderSidebar();
      }
      return;
    }
    /* iOS: instrucciones paso a paso */
    UI.modal('📲 Instalar NexusPro', `
      <div style="font-size:14px;line-height:1.8">
        <p style="margin-bottom:10px">En tu <b>iPhone o iPad</b> (con Safari):</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="background:var(--surface2);border-radius:10px;padding:10px 14px">1️⃣ Toca el botón <b>Compartir</b> <span style="font-size:16px">⬆️</span> (abajo al centro)</div>
          <div style="background:var(--surface2);border-radius:10px;padding:10px 14px">2️⃣ Busca y toca <b>"Agregar a pantalla de inicio"</b> ➕</div>
          <div style="background:var(--surface2);border-radius:10px;padding:10px 14px">3️⃣ Toca <b>"Agregar"</b> — y listo 🎉</div>
        </div>
        <p style="font-size:12px;color:var(--text3);margin-top:12px">La app abre a pantalla completa, con su propio ícono, y funciona aun sin conexión para consultar.</p>
      </div>
      <div class="modal-footer"><button class="btn btn-amber" onclick="UI.cerrarModal()">Entendido</button></div>`);
  },

  /* ── SERVICE WORKER ───────────────────────────── */
  registrarSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }
};

/* ── TEMAS ──────────────────────────────────────── */
const TEMAS = {
  lista: [
    { id:'dark',     icon:'🌙', label:'Oscuro'       },
    { id:'light',    icon:'☀️', label:'Claro'        },
    { id:'midnight', icon:'🌌', label:'Midnight'     },
    { id:'blue',     icon:'💙', label:'Ocean Navy'   },
    { id:'green',    icon:'🌿', label:'Forest'       },
    { id:'purple',   icon:'💜', label:'Purple Night' },
    { id:'red',      icon:'🔴', label:'Dark Red'     },
    { id:'slate',    icon:'🩶', label:'Slate'        }
  ],

  actual() { return localStorage.getItem('tp_tema') || 'light'; },

  aplicar(id) {
    document.documentElement.setAttribute('data-theme',
      id === 'auto'
        ? (window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')
        : id
    );
    localStorage.setItem('tp_tema', id);
  },

  picker() {
    const curr = TEMAS.actual();
    const items = TEMAS.lista.map(t => {
      const activo = curr === t.id;
      return `<button onclick="TEMAS.aplicar('${t.id}');UI.cerrarModal()"
        style="padding:14px 10px;border:2px solid ${activo?'var(--amber)':'var(--border)'};
               background:${activo?'var(--amber-dim)':'var(--surface2)'};border-radius:8px;
               cursor:pointer;color:${activo?'var(--amber)':'var(--text2)'};
               display:flex;flex-direction:column;align-items:center;gap:6px;font-family:inherit">
        <span style="font-size:24px">${t.icon}</span>
        <span style="font-size:11px;font-weight:700">${t.label}</span>
        ${activo?'<span style="font-size:9px;color:var(--amber)">✓ ACTIVO</span>':''}
      </button>`;
    }).join('');

    UI.modal('🎨 Tema de Colores', `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${items}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`, '480px');
  }
};

/* Namespace de módulos */
window.Modulos = {};

/* Captura el prompt de instalación PWA (Android/Chrome/Edge) para
   dispararlo desde el botón "📲 Instalar como App" del sidebar. */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window._pwaPrompt = e;
  if (window.Auth?.user) App.renderSidebar();   // refrescar para mostrar el botón
});
window.addEventListener('appinstalled', () => {
  window._pwaPrompt = null;
  if (window.Auth?.user) App.renderSidebar();
});

/* ── Utilidades CSV compartidas (export / import) ──────────────── */

/* Escapa un valor para CSV (comillas, comas, saltos de línea) */
Modulos._csvCell = function (v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/* Descarga una matriz [[fila],[fila]] como archivo CSV (con BOM para Excel) */
Modulos._descargarCSV = function (rows, filename) {
  const csv = rows.map(r => r.map(Modulos._csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/* Carga SheetJS (xlsx) bajo demanda para exportar Excel real */
Modulos._ensureXLSX = function () {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar Excel')); document.head.appendChild(s);
  });
};

/* Descarga un .xlsx real. sheets = [{ nombre, rows:[[...]] }] */
Modulos._descargarXLSX = async function (sheets, filename) {
  await Modulos._ensureXLSX();
  const wb = XLSX.utils.book_new();
  sheets.forEach(sh => {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    XLSX.utils.book_append_sheet(wb, ws, (sh.nombre || 'Hoja').slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
};

/* Parser CSV tolerante (comillas, comas y saltos dentro de celdas) */
Modulos._parseCSV = function (text) {
  text = text.replace(/^﻿/, '');           // quitar BOM
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(x => x !== '')) rows.push(row); }
  return rows;
};

/* ── Botones de acción ESTANDARIZADOS (Ver/Editar/Imprimir/Eliminar) ──
   Misma iconografía, color y orden en todos los módulos.
   Uso: ${Modulos.btnAccion('editar', `Modulos.x.modalForm('${id}')`)} */
Modulos.btnAccion = function (tipo, onclick, opts = {}) {
  /* Gating por nivel de acceso: si el usuario solo puede VER el módulo activo,
     los botones editar/eliminar no se renderizan (opts.modulo permite forzar
     el módulo a evaluar cuando el botón actúa sobre otro módulo). */
  const modAct = opts.modulo || window.App?.paginaActual;
  if (modAct && typeof puedeAccion === 'function') {
    if (tipo === 'editar'   && !puedeAccion(modAct, 'editar'))   return '';
    if (tipo === 'eliminar' && !puedeAccion(modAct, 'eliminar')) return '';
  }
  const stop = opts.stop !== false;   // por defecto frena la propagación (filas clickeables)
  const map = {
    ver:      ['btn-cyan',   '👁 Ver',    'Ver'],
    editar:   ['btn-cyan',   '✏️ Editar', 'Editar'],
    imprimir: ['btn-ghost',  '🖨️',        'Imprimir'],
    eliminar: ['btn-danger', '🗑️',        'Eliminar'],
  };
  const [cls, label, title] = map[tipo] || ['btn-ghost', tipo, tipo];
  const handler = stop ? `event.stopPropagation();${onclick}` : onclick;
  return `<button class="btn btn-sm ${cls}" title="${UI.esc(opts.titulo || title)}" onclick="${handler}">${opts.label || label}</button>`;
};

/* Eliminar genérico con confirmación (tenant-scoped vía RLS). cb refresca la vista. */
Modulos.eliminarRegistro = async function (tabla, id, nombre, cb) {
  const modAct = window.App?.paginaActual;
  if (modAct && typeof puedeAccion === 'function' && !puedeAccion(modAct, 'eliminar')) {
    UI.toast('No tienes permiso para eliminar en este módulo', 'error');
    return;
  }
  /* El nombre llega desde el onclick de la fila, o sea desde un dato guardado:
     va escapado porque UI.confirmar lo pinta como HTML. */
  const ok = await UI.confirmar(
    `¿Eliminar <b>${UI.esc(nombre || 'este registro')}</b>? Esta acción no se puede deshacer.`,
    'Eliminar'
  );
  if (!ok) return;
  const exito = await DB.deleteRegistro(tabla, id);
  if (exito) { UI.toast('Eliminado ✓'); if (cb) cb(); }
  else UI.toast('No se pudo eliminar (puede tener registros relacionados)', 'error');
};

/* Verifica un NIT (dígito local + nombre en línea vía certificador FEL).
   Pinta el resultado en statusId y, si trae nombre y el campo de nombre
   está vacío, lo autocompleta. */
Modulos.verificarNIT = async function (inputId, statusId, nombreInputId) {
  const inp = document.getElementById(inputId);
  const st  = document.getElementById(statusId);
  if (!inp) return;
  const nit = inp.value.trim();
  if (!nit) { if (st) st.innerHTML = ''; return; }
  if (st) st.innerHTML = '<span style="color:var(--text3);font-size:11px">⏳ Verificando...</span>';
  const r = await NIT.consultar(nit);
  if (!r || r.ok === false) {
    if (st) st.innerHTML = `<span style="color:var(--red);font-size:11px">⚠️ ${(r && r.error) || 'No se pudo verificar'}</span>`;
    return;
  }
  if (r.cf) { if (st) st.innerHTML = '<span style="color:var(--text3);font-size:11px">Consumidor Final</span>'; return; }
  const partes = [ r.valido
    ? '<span style="color:var(--green);font-size:11px">✓ NIT válido</span>'
    : '<span style="color:var(--red);font-size:11px">✗ Dígito verificador inválido</span>' ];
  if (r.nombre) {
    partes.push(`<span style="color:var(--cyan);font-size:11px">· ${UI.esc(r.nombre)}</span>`);
    const nEl = nombreInputId ? document.getElementById(nombreInputId) : null;
    if (nEl && !nEl.value.trim()) nEl.value = r.nombre;
  } else if (r.mensaje) {
    partes.push(`<span style="color:var(--text3);font-size:11px">· ${r.mensaje}</span>`);
  }
  if (st) st.innerHTML = partes.join(' ');
};

/* Abre un selector de archivo .csv y entrega las filas parseadas al callback */
Modulos._importarCSV = function (onRows) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const filas = Modulos._parseCSV(String(reader.result));
        if (filas.length < 2) { UI.toast('El CSV no tiene datos', 'error'); return; }
        onRows(filas);
      } catch (e) {
        UI.toast('No se pudo leer el CSV: ' + e.message, 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
};
