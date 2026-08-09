/* ═══════════════════════════════════════════════════════
   NexusPro Enterprise — Punto de Venta (POS)
   Pantalla independiente (pos.html), comparte la misma base de datos.
   Solo para roles de venta/gestión. Factura, descuenta inventario,
   acumula/canjea puntos de fidelización, programa envíos y hace
   corte diario + reportes semanal/mensual (libro de ventas).
═══════════════════════════════════════════════════════ */
const POS = {
  _prod: [], _clientes: [], _cart: [], _cliente: null,
  _metodo: 'Efectivo', _descuento: 0, _canje: 0, _tarjetaDatos: null,
  _busca: '', _cat: '', _giro: '', _envioData: null, _ventasHoy: [], _caja: null, _terminal: null, _procesandoSesion: false,
  _ROLES_OK: ['superadmin','admin','gerente_tal','gerente_fin','recepcionista','vendedor'],

  async iniciar() {
    getSB().auth.onAuthStateChange((evento, sesion) => {
      if (evento === 'SIGNED_IN' && sesion?.user && !this._procesandoSesion) this._procesarSesion(sesion);
    });
    try {
      const { data } = await getSB().auth.getSession();
      if (data?.session?.user) return this._procesarSesion(data.session);
    } catch (_) {}
    this.renderLogin();
  },

  async _procesarSesion(session) {
    if (this._procesandoSesion) return;
    this._procesandoSesion = true;
    try {
      Auth.supaUser = session.user;
      const esGoogle = (session.user.identities || []).some(i => i.provider === 'google');
      await Auth._cargarPerfil(session.user.id, session.user.email, null, { permitir_registro_google: esGoogle });
      const acceso = await DB.getMisTalleresPOS();
      if (acceso.error) throw acceso.error;
      if (!acceso.data.length) return this.renderSinTaller();
      /* No volver a preguntar lo que ya se respondió: con un solo negocio, o con
         el último recordado, se entra directo. El RPC valida la membresía igual. */
      const recordado = localStorage.getItem('pos_tenant_id');
      const directo = acceso.data.length === 1
        ? acceso.data[0]
        : acceso.data.find(t => t.tenant_id === recordado);
      if (directo) return this.seleccionarTaller(directo.tenant_id);
      return this.renderSelectorTalleres(acceso.data);
    } catch (err) {
      console.error('POS: no se pudo preparar acceso', err);
      this.renderLogin('No pudimos validar tu acceso. Intenta de nuevo o contacta al administrador.');
    } finally { this._procesandoSesion = false; }
  },

  _puedeEntrar() {
    const rol = Auth.user?.rol;
    if (!rol) return false;
    const custom = Auth.user?.permisos_custom || {};
    /* El permiso puede venir como bool legacy o como nivel ('ver'/'editar'/true) */
    if (custom.pos !== undefined)
      return typeof nivelPermiso === 'function' ? nivelPermiso(custom.pos) !== 'no' : custom.pos === true;
    return this._ROLES_OK.includes(rol);
  },

  async _postLogin() {
    if (!this._puedeEntrar()) return this.renderDenegado();
    if (!this._terminal?.id) return this.renderSelectorTerminales();
    this._caja = await DB.getCajaPosAbierta(this._terminal.id);
    if (!this._caja) return this.renderApertura();
    return this.render();
  },

  _seguro(texto) { const e = document.createElement('div'); e.textContent = texto || ''; return e.innerHTML; },

  renderSelectorTalleres(negocios) {
    const opciones = negocios.map(t => `<button class="pos-select-option" onclick="POS.seleccionarTaller('${t.tenant_id}')"><b>${this._seguro(t.tenant_nombre)}</b><span>${this._seguro(t.rol || 'Usuario')} · Elegir negocio →</span></button>`).join('');
    document.getElementById('pos-root').innerHTML = `<div class="pos-login-shell"><div class="pos-login-card"><div class="pos-login-brand"><div class="pos-brand-mark">N</div><div><strong>NexusPro</strong> <em>POS</em><span>Acceso seguro por ubicación</span></div></div><h1>¿En qué negocio trabajarás?</h1><p>Elige únicamente entre los negocios que tu administrador te asignó.</p><div class="pos-select-list">${opciones}</div><div class="pos-login-back"><button class="btn btn-ghost btn-sm" onclick="POS.salir()">Cerrar sesión</button></div></div></div>`;
  },

  async seleccionarTaller(tenantId) {
    const r = await DB.seleccionarTallerPOS(tenantId);
    /* Si el negocio no abre, decirlo en pantalla: un toast solo dejaba la
       pantalla congelada sin explicar nada. */
    if (r.error) return this.renderErrorAcceso('No se pudo abrir el negocio', r.error.message);
    await Auth._cargarPerfil(Auth.supaUser.id, Auth.supaUser.email, null, { permitir_registro_google:true });
    /* Cambiar de negocio invalida la terminal recordada; volver al mismo la conserva. */
    if (localStorage.getItem('pos_tenant_id') !== tenantId) {
      this._terminal = null; localStorage.removeItem('pos_terminal_id');
    }
    localStorage.setItem('pos_tenant_id', tenantId);
    this.renderSelectorTerminales();
  },

  /* forzar=true lo abre aunque haya una terminal recordada (botón "Cambiar terminal") */
  async renderSelectorTerminales(forzar=false) {
    const r = await DB.getTerminalesPOS();
    if (r.error) return this.renderErrorAcceso('No se pudieron cargar las terminales', r.error.message);
    if (!r.data.length) return this.renderSinTerminal();
    if (!forzar) {
      const recordada = localStorage.getItem('pos_terminal_id');
      const directa = r.data.find(t => t.id === recordada) || (r.data.length === 1 ? r.data[0] : null);
      if (directa) return this.seleccionarTerminal(directa.id, r.data);
    }
    const opciones = r.data.map(t => `<button class="pos-select-option" onclick="POS.seleccionarTerminal('${t.id}')"><b>${UI.esc(this._seguro(t.nombre))}</b><span>${t.es_principal ? 'Terminal principal' : 'Terminal POS'} · Elegir terminal →</span></button>`).join('');
    document.getElementById('pos-root').innerHTML = `<div class="pos-login-shell"><div class="pos-login-card"><div class="pos-login-brand"><div class="pos-brand-mark">N</div><div><strong>NexusPro</strong> <em>POS</em><span>${this._seguro(Auth.tenant?.name || 'Tu negocio')}</span></div></div><h1>Elige tu terminal POS</h1><p>La caja, sus ventas y su cierre quedan registrados para esta terminal.</p><div class="pos-select-list">${opciones}</div><div class="pos-login-back"><button class="btn btn-ghost btn-sm" onclick="POS.cambiarTaller()">← Cambiar negocio</button></div></div></div>`;
  },

  async seleccionarTerminal(id, lista=null) {
    const data = lista || (await DB.getTerminalesPOS()).data;
    this._terminal = data.find(t => t.id === id) || null;
    if (!this._terminal) {
      /* La terminal recordada ya no existe o la desactivaron: olvidarla y preguntar. */
      localStorage.removeItem('pos_terminal_id');
      UI.toast('Esa terminal ya no está disponible. Elige otra.', 'warn');
      return this.renderSelectorTerminales(true);
    }
    localStorage.setItem('pos_terminal_id', id);
    this._postLogin();
  },

  cambiarTerminal() { this.renderSelectorTerminales(true); },

  /* Olvida lo recordado para poder volver a elegir negocio (y con él, terminal) */
  cambiarTaller() {
    localStorage.removeItem('pos_tenant_id');
    localStorage.removeItem('pos_terminal_id');
    this._terminal = null;
    this._procesarSesion({ user: Auth.supaUser });
  },

  renderErrorAcceso(titulo, detalle) {
    document.getElementById('pos-root').innerHTML = `<div class="pos-login-shell"><div class="pos-login-card"><div class="pos-login-brand"><div class="pos-brand-mark">N</div><div><strong>NexusPro</strong> <em>POS</em><span>No se pudo continuar</span></div></div><h1>${this._seguro(titulo)}</h1><p>${this._seguro(detalle || 'Intenta de nuevo. Si sigue igual, avisa al administrador.')}</p><div class="pos-select-list"><button class="pos-select-option" onclick="POS._procesarSesion({user:Auth.supaUser})"><b>Reintentar</b><span>Volver a cargar tus negocios</span></button></div><div class="pos-login-back"><button class="btn btn-ghost btn-sm" onclick="POS.salir()">Cerrar sesión</button></div></div></div>`;
  },

  renderSinTaller() {
    document.getElementById('pos-root').innerHTML = `<div class="pos-login-shell"><div class="pos-login-card"><div class="pos-login-brand"><div class="pos-brand-mark">N</div><div><strong>NexusPro</strong> <em>POS</em><span>Acceso pendiente</span></div></div><h1>Tu cuenta aún no tiene negocio asignado</h1><p>Google confirmó tu identidad, pero un administrador debe asignarte al negocio y darte permiso de POS antes de cobrar.</p><div class="pos-login-back"><button class="btn btn-ghost" onclick="POS.salir()">Cerrar sesión</button></div></div></div>`;
  },

  /* Roles que pueden dar de alta la terminal. No se usa _ROLES_OK: cobrar y
     configurar la caja no son lo mismo — un vendedor cobra, pero no define
     las terminales del negocio. */
  _puedeAdministrar() {
    return ['superadmin', 'admin', 'gerente', 'gerente_tal', 'gerente_fin'].includes(Auth.user?.rol);
  },

  /* ESTA PANTALLA ERA UN CALLEJÓN SIN SALIDA. Decía "pedíselo al
     administrador" — y el administrador tampoco tenía dónde crearla: no
     existía ninguna pantalla de terminales en toda la app. Un negocio nuevo
     (El Granjero, con módulo POS activo) no podía abrir el punto de venta
     nunca. Ahora quien administra la crea desde acá, en un clic, y sigue
     cobrando; el resto sí tiene que pedirla, pero sabiendo a quién. */
  renderSinTerminal() {
    const puede = this._puedeAdministrar();
    const accion = puede
      ? `<div class="pos-select-list"><button class="pos-select-option" onclick="POS.crearPrimeraTerminal(this)"><b>＋ Crear la terminal principal</b><span>Se llama "Caja 1" y podés renombrarla en Configuración</span></button></div>`
      : '';
    const texto = puede
      ? 'Todavía no hay ninguna caja dada de alta en este negocio. Creála ahora y empezá a cobrar.'
      : 'Quien administra el negocio debe crear o activar una terminal antes de iniciar cobros.';
    document.getElementById('pos-root').innerHTML = `<div class="pos-login-shell"><div class="pos-login-card"><div class="pos-login-brand"><div class="pos-brand-mark">N</div><div><strong>NexusPro</strong> <em>POS</em><span>${this._seguro(Auth.tenant?.name || 'Tu negocio')}</span></div></div><h1>No hay terminal POS disponible</h1><p>${texto}</p>${accion}<div class="pos-login-back"><button class="btn btn-ghost" onclick="POS.salir()">Cerrar sesión</button></div></div></div>`;
  },

  async crearPrimeraTerminal(btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = '<b>Creando…</b>'; }
    const { data, error } = await DB.guardarTerminalPOS({ nombre: 'Caja 1', es_principal: true });
    /* El error se muestra en pantalla y no en un toast: acá no hay ninguna
       otra cosa que mirar, y un toast que se va deja la pantalla muda. */
    if (error) return this.renderErrorAcceso('No se pudo crear la terminal', error.message);
    this._terminal = data;
    localStorage.setItem('pos_terminal_id', data.id);
    return this._postLogin();
  },

  renderApertura() {
    const cfg = Auth.tenant?.config_pos_caja || {};
    const sugerido = Number(cfg.fondo_inicial_sugerido ?? 500);
    document.getElementById('pos-root').innerHTML = `
      <div class="pos-login-shell"><div class="pos-login-card">
        <div class="pos-login-brand"><div class="pos-brand-mark">Q</div><div><strong>NexusPro</strong> <em>CAJA</em><span>Apertura de turno</span></div></div>
        <h1>Abre tu caja</h1>
        <p>Registra el efectivo disponible antes de iniciar cobros. Así NexusPro podrá calcular tu vuelto y cuadre de turno.</p>
        <div class="form-group"><label class="form-label">Fondo inicial en efectivo (Q)</label>
          <input class="form-input" id="pos-fondo-inicial" type="number" min="0" step="0.01" value="${sugerido.toFixed(2)}" autofocus></div>
        <div class="form-group"><label class="form-label">Nota de apertura <span style="color:var(--text3)">(opcional)</span></label>
          <input class="form-input" id="pos-nota-apertura" placeholder="Ej. Fondo entregado por gerente"></div>
        <button class="pos-login-submit" onclick="POS.abrirCaja()">Abrir caja <span>→</span></button>
        <div class="pos-login-back"><button class="btn btn-ghost btn-sm" onclick="POS.salir()">Cerrar sesión</button></div>
      </div></div>`;
  },

  async abrirCaja() {
    const fondo = Number(document.getElementById('pos-fondo-inicial')?.value);
    if (!Number.isFinite(fondo) || fondo < 0) { UI.toast('Ingresa un fondo inicial válido', 'error'); return; }
    const { data, error } = await DB.abrirCajaPos({
      terminal_id:this._terminal.id, usuario_apertura_id: Auth.user.id, fondo_inicial:fondo,
      notas_apertura:document.getElementById('pos-nota-apertura')?.value.trim() || null
    });
    if (error || !data) { UI.toast('No se pudo abrir caja: ' + (error?.message||''), 'error'); return; }
    this._caja = data;
    UI.toast('Caja abierta con ' + UI.q(fondo) + ' ✓');
    this.render();
  },

  async _resumenCaja() {
    if (!this._caja) return { efectivo:0, total:0, ventas:0, esperado:0 };
    const ventas = (await DB.getVentasParaCaja(this._caja.abierta_at)).filter(f => f.estado !== 'anulada');
    const efectivo = ventas.filter(f => f.metodo_pago === 'Efectivo').reduce((s,f) => s + (Number(f.total)||0), 0);
    const total = ventas.reduce((s,f) => s + (Number(f.total)||0), 0);
    return { efectivo, total, ventas:ventas.length, esperado:(Number(this._caja.fondo_inicial)||0) + efectivo };
  },

  async modalCierreCaja() {
    if (!this._caja) return;
    const r = await this._resumenCaja();
    UI.modal('🧾 Cierre de caja', `
      <div class="alert alert-cyan"><div class="alert-icon">Q</div><div class="alert-body">Cuenta el efectivo físico antes de confirmar. NexusPro comparará el monto contado contra lo esperado.</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0">
        <div class="card" style="padding:12px"><div class="text-muted" style="font-size:11px">Fondo inicial</div><b>${UI.q(this._caja.fondo_inicial)}</b></div>
        <div class="card" style="padding:12px"><div class="text-muted" style="font-size:11px">Ventas en efectivo</div><b>${UI.q(r.efectivo)}</b></div>
        <div class="card" style="padding:12px"><div class="text-muted" style="font-size:11px">Ventas del turno</div><b>${r.ventas} · ${UI.q(r.total)}</b></div>
        <div class="card card-amber" style="padding:12px"><div class="text-muted" style="font-size:11px">Efectivo esperado</div><b style="font-size:18px">${UI.q(r.esperado)}</b></div>
      </div>
      <div class="form-group"><label class="form-label">Efectivo contado en caja (Q) *</label><input class="form-input" id="pos-efectivo-contado" type="number" min="0" step="0.01" placeholder="${r.esperado.toFixed(2)}"></div>
      <div class="form-group"><label class="form-label">Observación de cierre</label><input class="form-input" id="pos-nota-cierre" placeholder="Ej. Faltante explicado / retiro para depósito"></div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button><button class="btn btn-amber" onclick="POS.cerrarCaja()">Confirmar cierre</button></div>`, '520px');
  },

  async cerrarCaja() {
    const contado = Number(document.getElementById('pos-efectivo-contado')?.value);
    if (!Number.isFinite(contado) || contado < 0) { UI.toast('Ingresa el efectivo contado', 'error'); return; }
    const r = await this._resumenCaja();
    const diferencia = Math.round((contado - r.esperado) * 100) / 100;
    const { error } = await DB.cerrarCajaPos(this._caja.id, {
      usuario_cierre_id:Auth.user.id, efectivo_esperado:r.esperado, efectivo_contado:contado,
      diferencia, ventas_efectivo:r.efectivo, ventas_total:r.total, num_ventas:r.ventas,
      notas_cierre:document.getElementById('pos-nota-cierre')?.value.trim() || null
    });
    if (error) { UI.toast('No se pudo cerrar caja: ' + error.message, 'error'); return; }
    UI.cerrarModal(); this._caja = null;
    UI.toast(diferencia === 0 ? 'Caja cuadrada ✓' : `Cierre registrado · diferencia ${UI.q(diferencia)}`, diferencia === 0 ? 'success' : 'warn', 6000);
    await Auth.logout(); this.renderLogin();
  },

  /* ── LOGIN ───────────────────────────────────────── */
  renderLogin(mensaje='') {
    document.getElementById('pos-root').innerHTML = `
      <div class="pos-login-shell">
        <div class="pos-login-card">
          <div class="pos-login-brand">
            <div class="pos-brand-mark">N</div>
            <div><strong>NexusPro</strong> <em>POS</em><span>Tu caja, siempre en control</span></div>
          </div>
          <h1>Inicia tu turno</h1>
          <p>Accede con tu cuenta del sistema para cobrar y controlar tu caja.</p>
          <button class="pos-google-btn" onclick="POS.loginConGoogle()"><span>G</span> Continuar con Google</button>
          <div class="pos-login-divider"><span>o usa tu correo</span></div>
          <div class="form-group"><label class="form-label">Correo</label>
            <input class="form-input" id="pos-email" type="email" autocomplete="username"></div>
          <div class="form-group"><label class="form-label">Contraseña</label>
            <input class="form-input" id="pos-pass" type="password" autocomplete="current-password"
                   onkeydown="if(event.key==='Enter')POS.login()"></div>
          <button class="pos-login-submit" onclick="POS.login()">Ingresar al POS <span>→</span></button>
          <div id="pos-login-err" style="color:var(--red);font-size:12px;margin-top:10px;text-align:center">${this._seguro(mensaje)}</div>
          <div class="pos-login-back"><a href="/">← Ir al sistema completo</a></div>
        </div>
      </div>`;
  },

  async loginConGoogle() {
    localStorage.setItem('google_intent', 'login');
    const { error } = await getSB().auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin + '/pos.html' }
    });
    if (error) {
      const err = document.getElementById('pos-login-err');
      if (err) err.textContent = 'No se pudo conectar con Google: ' + error.message;
    }
  },

  async login() {
    const email = document.getElementById('pos-email')?.value.trim();
    const pass  = document.getElementById('pos-pass')?.value;
    const err   = document.getElementById('pos-login-err');
    if (!email || !pass) { if (err) err.textContent = 'Ingresa correo y contraseña'; return; }
    if (err) err.textContent = 'Ingresando...';
    const r = await Auth.login(email, pass);
    if (!r.ok) { if (err) err.textContent = r.error || 'No se pudo ingresar'; return; }
    this._procesarSesion({ user: Auth.supaUser || { id: Auth.user?.id, email: Auth.user?.email, identities:[] } });
  },

  renderDenegado() {
    document.getElementById('pos-root').innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px">
        <div class="card" style="max-width:420px;text-align:center">
          <div style="font-size:40px">🚫</div>
          <h2 class="font-display" style="margin:8px 0">Sin acceso al POS</h2>
          <p style="color:var(--text2);font-size:13px">Tu usuario (${UI.esc(Auth.user?.email||'')}) no tiene permiso para el Punto de Venta. Contacta al administrador.</p>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
            <button class="btn btn-ghost" onclick="POS.salir()">Cerrar sesión</button>
            <a class="btn btn-amber" href="/">Ir al sistema</a>
          </div>
        </div>
      </div>`;
  },

  async salir() { await Auth.logout(); this.renderLogin(); },

  /* Al salir: preguntar si guardar la sesión o terminar el turno */
  confirmarSalida() {
    UI.modal('⏻ Salir del Punto de Venta', `
      <p style="font-size:13px;color:var(--text2);margin-bottom:6px">¿Cómo deseas salir?</p>
      <ul style="font-size:12px;color:var(--text3);margin:0 0 8px 18px">
        <li><b>Guardar sesión:</b> sales del POS pero tu sesión queda activa para seguir vendiendo después.</li>
        <li><b>Terminar turno:</b> se hace el <b>cierre de caja</b>, se envía el reporte de cierre y se cierra la sesión.</li>
      </ul>
      <div class="modal-footer" style="flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-cyan" onclick="POS._guardarSesion()">💾 Guardar sesión</button>
        <button class="btn btn-amber" onclick="POS._terminarTurno()">🧾 Cerrar caja y terminar</button>
      </div>`);
  },

  _guardarSesion() { UI.cerrarModal(); location.href = '/'; },

  async _terminarTurnoLegacy() {
    UI.cerrarModal();
    UI.toast('Generando cierre de caja...','info');
    const hoy = new Date().toISOString().slice(0,10);
    const facturas = await DB.getFacturas(hoy, hoy);
    const vivas = facturas.filter(f=>f.estado!=='anulada');
    const total = vivas.reduce((s,f)=>s+(Number(f.total)||0),0);
    const porMetodo = {};
    vivas.forEach(f=>{ const m=f.metodo_pago||'Efectivo'; porMetodo[m]=(porMetodo[m]||0)+(Number(f.total)||0); });
    const negocio = Auth.tenant?.name || 'NexusPro';
    const dest = Auth.tenant?.email || Auth.user?.email;
    const html =
      `<div style="font-family:Arial,sans-serif;max-width:480px">`+
      `<h2 style="color:#d97706">🧾 Cierre de caja — ${negocio}</h2>`+
      `<p>Fecha: <b>${UI.fecha(hoy)}</b><br>Cajero: <b>${UI.esc(Auth.user?.nombre||Auth.user?.email||'')}</b></p>`+
      `<p>Ventas del día: <b>${vivas.length}</b></p>`+
      `<table style="width:100%;border-collapse:collapse;font-size:14px">`+
      Object.entries(porMetodo).map(([m,v])=>`<tr><td style="padding:4px 0;color:#666">${m}</td><td style="text-align:right">${UI.q(v)}</td></tr>`).join('')+
      `<tr><td style="padding:8px 0;border-top:2px solid #d97706;font-weight:800">TOTAL</td><td style="text-align:right;border-top:2px solid #d97706;font-weight:800;color:#d97706">${UI.q(total)}</td></tr>`+
      `</table></div>`;
    let nota = '';
    if (dest) {
      const r = await Email.enviar(dest, `Cierre de caja ${negocio} — ${UI.fecha(hoy)}`, { html });
      nota = r.ok ? ` y enviado a ${dest}` : ` (no se pudo enviar el correo: ${r.error})`;
    } else {
      nota = ' (sin correo configurado para enviar el reporte)';
    }
    await Auth.logout();
    this.renderLogin();
    UI.toast(`Cierre de caja realizado: ${vivas.length} ventas · ${UI.q(total)}${nota} ✓`, 'success', 7000);
  },

  /* ── PANTALLA PRINCIPAL ──────────────────────────── */
  async _terminarTurno() {
    UI.cerrarModal();
    return this.modalCierreCaja();
  },

  async render() {
    const root = document.getElementById('pos-root');
    root.innerHTML = `<div class="empty-state"><div class="empty-state-sm">⏳</div>Cargando productos...</div>`;
    const hoy = new Date().toISOString().slice(0,10);
    [this._prod, this._clientes, this._ventasHoy] = await Promise.all([
      DB.getInventario(), DB.getClientes(), DB.getFacturas(hoy, hoy)
    ]);
    this._pintar();
  },

  _cats() {
    return [...new Set(this._prod.map(p=>p.categoria).filter(Boolean))].sort();
  },

  _pintar() {
    const root = document.getElementById('pos-root');
    root.innerHTML = `
      <style>
        .pos-cat-slider {
          display: flex !important;
          gap: 8px !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          flex-shrink: 0 !important;
          height: 52px !important;
          align-items: center !important;
          padding: 0 4px !important;
          margin-bottom: 12px !important;
          scrollbar-width: none !important;
          -webkit-overflow-scrolling: touch;
        }
        .pos-cat-slider::-webkit-scrollbar {
          display: none !important;
        }
        .pos-cat-pill {
          flex-shrink: 0 !important;
          display: inline-block !important;
          text-align: center !important;
          height: 36px !important;
          line-height: 34px !important;
          padding: 0 16px !important;
          border-radius: 99px !important;
          background: var(--surface2) !important;
          border: 1px solid var(--border) !important;
          color: #ffffff !important;
          font-size: 13px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          user-select: none !important;
          white-space: nowrap !important;
        }
        .pos-cat-pill:hover {
          border-color: var(--amber-border) !important;
          background: var(--surface3) !important;
        }
        .pos-cat-pill.active {
          background: var(--amber) !important;
          color: #ffffff !important;
          border-color: var(--amber) !important;
          box-shadow: 0 4px 12px rgba(217,119,6,0.2) !important;
        }
        .pos-shell { display:flex; flex-direction:column; height:100vh; height:100dvh; }
        .pos-header { display:flex; align-items:center; gap:12px; padding:12px 18px;
          background:linear-gradient(90deg, var(--surface) 0%, var(--surface2) 100%);
          border-bottom:1px solid var(--border); flex-wrap:wrap; }
        .pos-layout { flex:1; display:grid;
          grid-template-columns:minmax(0,1fr) 630px;
          gap:0; overflow:hidden; min-height:0; }
        .pos-catalogo { padding:0 16px 16px 16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; min-width:0; }
        .pos-cart-panel { border-left:1px solid var(--border); background:var(--surface);
          display:flex; flex-direction:column; min-height:0; overflow:hidden; }
        .pos-ticket { flex:1 1 0; display:flex; flex-direction:column; min-height:0; min-width:0; }
        #pos-cart { flex:1 1 0; overflow-y:auto; padding:4px 8px; min-height:0; }
        #pos-totales { flex:0 1 auto; border-top:1px solid var(--border); background:var(--surface2);
          padding:10px; display:flex; gap:10px; }
        .pos-cart-volver, .pos-mbar { display:none; }
        @media (max-width: 1200px) {
          .pos-layout { grid-template-columns:minmax(0,1fr) 520px; }
          .pos-cart-panel { width:520px; }
          #pos-totales { flex-direction:column; gap:8px; }
        }
        @media (max-width: 920px) {
          .pos-header { padding:10px 12px; gap:8px; }
          .pos-layout { grid-template-columns:1fr; }
          .pos-catalogo { padding:12px; padding-bottom:84px; }
          .pos-cart-panel { position:fixed; inset:0; z-index:60; border-left:none;
            transform:translateY(100%); transition:transform .25s ease; }
          .pos-cart-panel.open { transform:translateY(0); }
          .pos-cart-volver { display:flex; align-items:center; gap:8px; padding:13px 16px;
            border-bottom:1px solid var(--border); font-weight:800; font-size:14px;
            cursor:pointer; background:var(--surface2); user-select:none; }
          .pos-mbar { display:flex; position:fixed; left:12px; right:12px;
            bottom:calc(12px + env(safe-area-inset-bottom, 0px)); z-index:50;
            align-items:center; justify-content:space-between; gap:10px;
            background:var(--amber); color:#fff; border-radius:14px; padding:14px 18px;
            font-weight:900; font-size:15px; cursor:pointer; user-select:none;
            box-shadow:0 8px 24px rgba(0,0,0,0.35); }
        }
        @media (max-width: 600px) {
          .pos-user-name { display:none !important; }
          #pos-grid > div { grid-template-columns:repeat(auto-fill,minmax(104px,1fr)) !important; }
          .pos-line { flex-wrap:wrap; row-gap:6px; }
          .pos-line-info { flex-basis:calc(100% - 60px) !important; }
          .pos-line-nombre { white-space:normal !important; overflow:visible !important; line-height:1.3; }
          .pos-line-total { flex:1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pos-cart-panel { transition:none; }
        }
      </style>
      <div class="pos-shell">
        <header class="pos-header">
          <div style="font-family:'Outfit','Bebas Neue',sans-serif;font-size:24px;font-weight:900;letter-spacing:-0.5px;color:var(--amber)">🛒 POS</div>
          <div style="font-size:12px;color:var(--text3);background:var(--surface3);padding:4px 10px;border-radius:6px;font-weight:700">${Auth.tenant?.name||''}</div>
          <button class="btn btn-ghost btn-sm" style="font-size:12px" onclick="POS.cambiarTerminal()" title="Cambiar de terminal o de negocio">🖥️ ${UI.esc(this._seguro(this._terminal?.nombre || 'Terminal'))}</button>
          <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="POS.modalCierreCaja()">🧾 Cerrar caja</button>
            <button class="btn btn-ghost btn-sm" onclick="POS.reportes()">📊 Reportes</button>
            <span class="pos-user-name" style="font-size:12px;color:var(--text2);font-weight:700;display:flex;align-items:center;gap:6px">${Auth.user?.avatar||'👤'} ${UI.esc(Auth.user?.nombre||Auth.user?.email||'')}</span>
            <button class="btn btn-ghost btn-sm" onclick="POS.confirmarSalida()">⏻ Salir</button>
          </div>
        </header>
        <div class="pos-layout">
          <!-- Catálogo -->
          <div class="pos-catalogo">
            <div style="display:flex;gap:8px;align-items:center;position:sticky;top:0;z-index:20;background:var(--surface);padding:10px 0;border-bottom:1px solid var(--border);">
              <div class="pos-search-wrapper" style="flex:1;">
                <span style="color:var(--text3);font-size:14px">🔍</span>
                <input id="pos-busca" placeholder="Buscar por nombre, código o código de barras…"
                       value="${UI.esc(this._busca)}" autocomplete="off"
                       oninput="POS._busca=this.value;POS._pintarGrid()">
              </div>
              <button class="btn btn-secondary" id="pos-btn-cats" style="padding:0 10px;height:38px;display:flex;align-items:center;justify-content:center;gap:4px;border-radius:8px;font-size:12px;font-weight:700;background:var(--surface);color:var(--text2);" title="Filtrar por Categoría">
                <span>🏷️</span> <span id="pos-cat-label" style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${UI.esc(this._cat || 'Todo')}</span>
              </button>
              <button class="btn btn-secondary" id="pos-btn-numpad" style="padding:8px 12px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:15px;background:var(--surface);" title="Teclado numérico">⌨️</button>
              <button class="btn btn-secondary" id="pos-btn-options" style="padding:8px 12px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:15px;background:var(--surface);" title="Opciones">☰</button>

              <!-- Popover Categorías. Su margen derecho se calcula al abrirlo: el
                   botón cambia de ancho según la categoría activa, así que un
                   valor fijo se desalinea. -->
              <div class="options-dropdown" id="pos-cats-popover" style="left:auto; width:220px; max-height:280px; overflow-y:auto; display:none;">
              </div>

              <!-- Popover Teclado Virtual -->
              <div class="numpad-popover" id="pos-numpad-popover">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:6px;">
                  <span style="font-size:11px;font-weight:700;color:var(--text3);">TECLADO VIRTUAL</span>
                  <span style="cursor:pointer;font-weight:700;font-size:13px;color:var(--red);" onclick="document.getElementById('pos-numpad-popover').style.display='none'">✕</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
                  ${['1','2','3','4','5','6','7','8','9','.','0','←'].map(k => `
                    <button class="btn btn-secondary" style="padding:12px;font-size:15px;font-weight:700;justify-content:center;border-radius:8px;" onclick="POS._keypadPress('${k}')">${k}</button>
                  `).join('')}
                  <button class="btn" style="grid-column:span 3;background:var(--amber);color:white;justify-content:center;padding:12px;font-size:14px;font-weight:700;border:none;border-radius:8px;" onclick="POS._keypadPress('Enter')">Agregar</button>
                </div>
              </div>

              <!-- Popover Opciones -->
              <div class="options-dropdown" id="pos-options-popover">
                <div class="options-item" onclick="POS._triggerOp('📄 Reimprimir Último Ticket')">📄 Reimprimir Ticket</div>
                <div class="options-item" onclick="POS._triggerOp('🧾 Cerrar Caja Turno')">🧾 Cerrar Caja</div>
                <div class="options-item" onclick="POS._triggerOp('📊 Reporte de Ventas')">📊 Reportes</div>
                <div class="options-item" onclick="POS._triggerOp('🔄 Sincronizar Catálogo')">🔄 Sincronizar Catálogo</div>
                <div class="options-item" onclick="POS._triggerOp('🖥️ Cambiar Terminal')">🖥️ Cambiar Terminal</div>
              </div>
            </div>

            ${POS._girosPOS().length > 1 ? `
            <div class="fpos-chips">
              ${POS._girosPOS().map(g => `<div class="fpos-chip ${this._giro===g?'on':''}" onclick="POS.setGiro('${g}', this)">${(GIROS[g]||{}).icon||''} ${UI.esc((GIROS[g]||{}).label||g)}</div>`).join('')}
            </div>` : ''}
            <div id="pos-grid" style="flex:1"></div>
            <div class="fpos-teclas">
              <span>⌨️ <kbd>F2</kbd>buscar</span>
              <span><kbd>F4</kbd>cobrar</span>
              <span><kbd>Esc</kbd>limpiar búsqueda</span>
              <span style="color:var(--text3)">Escaneá el código de barras y el artículo se agrega solo.</span>
            </div>
          </div>
          <!-- Carrito -->
          <div class="pos-cart-panel" id="pos-cart-panel">
            <div class="pos-ticket">
              <div class="pos-cart-volver" onclick="POS.toggleCart(false)">← Seguir comprando</div>
              <div id="pos-cart"></div>
            </div>
            <div id="pos-totales"></div>
          </div>
        </div>
        <!-- Barra móvil: total + acceso al carrito/cobro -->
        <div class="pos-mbar" id="pos-mbar" onclick="POS.toggleCart(true)"></div>
      </div>`;

    // Configurar listeners interactivos para el Numpad, Opciones y Categorías
    const numpadBtn = document.getElementById('pos-btn-numpad');
    const numpadPop = document.getElementById('pos-numpad-popover');
    const optBtn = document.getElementById('pos-btn-options');
    const optPop = document.getElementById('pos-options-popover');
    const catsBtn = document.getElementById('pos-btn-cats');
    const catsPop = document.getElementById('pos-cats-popover');

    numpadBtn?.addEventListener('click', e => {
      e.stopPropagation();
      const isVisible = numpadPop.style.display === 'block';
      numpadPop.style.display = isVisible ? 'none' : 'block';
      numpadBtn.style.background = isVisible ? 'var(--surface)' : 'color-mix(in srgb, var(--amber) 15%, var(--surface))';
      if (optPop) optPop.style.display = 'none';
      if (optBtn) optBtn.style.background = 'var(--surface)';
      if (catsPop) catsPop.style.display = 'none';
      if (catsBtn) catsBtn.style.background = 'var(--surface)';
    });

    optBtn?.addEventListener('click', e => {
      e.stopPropagation();
      const isVisible = optPop.style.display === 'block';
      optPop.style.display = isVisible ? 'none' : 'block';
      optBtn.style.background = isVisible ? 'var(--surface)' : 'color-mix(in srgb, var(--amber) 15%, var(--surface))';
      if (numpadPop) numpadPop.style.display = 'none';
      if (numpadBtn) numpadBtn.style.background = 'var(--surface)';
      if (catsPop) catsPop.style.display = 'none';
      if (catsBtn) catsBtn.style.background = 'var(--surface)';
    });

    catsBtn?.addEventListener('click', e => {
      e.stopPropagation();
      const isVisible = catsPop.style.display === 'block';
      /* Se alinea el borde derecho del popover con el del botón. */
      if (!isVisible) catsPop.style.right =
        (catsBtn.parentElement.offsetWidth - catsBtn.offsetLeft - catsBtn.offsetWidth) + 'px';
      catsPop.style.display = isVisible ? 'none' : 'block';
      catsBtn.style.background = isVisible ? 'var(--surface)' : 'color-mix(in srgb, var(--amber) 15%, var(--surface))';
      if (numpadPop) numpadPop.style.display = 'none';
      if (numpadBtn) numpadBtn.style.background = 'var(--surface)';
      if (optPop) optPop.style.display = 'none';
      if (optBtn) optBtn.style.background = 'var(--surface)';
    });

    window.addEventListener('click', (e) => {
      if (numpadPop && !numpadPop.contains(e.target) && e.target !== numpadBtn) {
        numpadPop.style.display = 'none';
        if (numpadBtn) numpadBtn.style.background = 'var(--surface)';
      }
      if (optPop && !optPop.contains(e.target) && e.target !== optBtn) {
        optPop.style.display = 'none';
        if (optBtn) optBtn.style.background = 'var(--surface)';
      }
      if (catsPop && !catsPop.contains(e.target) && !catsBtn?.contains(e.target)) {
        catsPop.style.display = 'none';
        if (catsBtn) catsBtn.style.background = 'var(--surface)';
      }
    });

    this._pintarGrid();
    this._pintarCart();
    this._cablearAtajos();
  },

  /* Panel del carrito en móvil (≤920px): se desliza sobre el catálogo */
  toggleCart(abrir) {
    document.getElementById('pos-cart-panel')?.classList.toggle('open', !!abrir);
  },

  _pintarMbar() {
    const bar = document.getElementById('pos-mbar');
    if (!bar) return;
    const n = this._cart.reduce((s,l)=>s+l.cant, 0);
    const t = this._totales();
    bar.innerHTML = n
      ? `<span>🛒 ${n} artículo${n===1?'':'s'}</span><span>Cobrar ${UI.q(t.total)} →</span>`
      : `<span>🛒 Carrito vacío</span><span style="font-weight:700;font-size:13px">Ver carrito →</span>`;
  },

  /* ── ATAJOS DE TECLADO Y ESCÁNER ──
     Se anuncian en la barra inferior del catálogo, así que tienen que existir:
     un atajo que se muestra y no funciona es peor que no mostrarlo.
       F2  → al buscador       F4  → cobrar       Esc → limpiar la búsqueda
     El escáner de código de barras se comporta como un teclado que escribe
     rápido y termina con Enter: por eso el Enter del buscador agrega el
     artículo cuando la búsqueda identifica a UNO solo, y limpia para el
     siguiente. Sin eso, escanear sólo filtraba y había que tocar la tarjeta. */
  _cablearAtajos() {
    if (this._atajosListos) return;      // render() se llama varias veces
    this._atajosListos = true;

    document.addEventListener('keydown', (e) => {
      if (!document.getElementById('pos-grid')) return;   // no estamos en el POS

      if (e.key === 'F2') {
        e.preventDefault();
        const i = document.getElementById('pos-busca');
        if (i) { i.focus(); i.select(); }
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        if (this._cart.length) this.cobrar();
        else UI.toast('El carrito está vacío', 'warn');
        return;
      }
      if (e.key === 'Escape') {
        const i = document.getElementById('pos-busca');
        if (i && (this._busca || i.value)) {
          this._busca = ''; i.value = ''; this._pintarGrid();
        }
        return;
      }
      if (e.key === 'Enter' && e.target?.id === 'pos-busca') {
        e.preventDefault();
        this._agregarPorBusqueda();
      }
    });
  },

  /* Enter en el buscador: agrega si la búsqueda deja UN candidato claro.
     Prioriza la coincidencia EXACTA de código sobre el nombre — un escáner
     manda el código completo, y si además hubiera un producto cuyo nombre lo
     contiene, agregar el equivocado sería peor que no agregar nada. */
  _agregarPorBusqueda() {
    const b = this._busca.trim().toLowerCase();
    if (!b) return;
    const items = this._filtrados();

    const exacto = items.filter(p =>
      String(p.codigo || '').toLowerCase() === b ||
      String(p.codigo_barras || '').toLowerCase() === b);

    const elegido = exacto.length === 1 ? exacto[0] : (items.length === 1 ? items[0] : null);

    if (!elegido) {
      UI.toast(items.length ? `${items.length} coincidencias: elegí una` : 'Sin coincidencias', 'warn');
      return;
    }
    if ((Number(elegido.stock) || 0) <= 0) { UI.toast(`${elegido.nombre}: sin stock`, 'warn'); return; }

    this.addToCart(elegido.id);
    this._busca = '';
    const i = document.getElementById('pos-busca');
    if (i) i.value = '';
    this._pintarGrid();
  },

  _filtrados() {
    const b = this._busca.trim().toLowerCase();
    return this._prod.filter(p => {
      if (this._cat && p.categoria !== this._cat) return false;
      if (this._giro && (p.tipo_item || 'general') !== this._giro) return false;
      if (!b) return true;
      return (p.nombre||'').toLowerCase().includes(b)
          || (p.codigo||'').toLowerCase().includes(b)
          || (p.codigo_barras||'').toLowerCase().includes(b);
    });
  },

  /* Tarjeta de producto al estilo del POS de DoctorPro: miniatura, nombre a
     dos líneas, precio grande y un badge de stock con semáforo. El badge dice
     el número disponible en vez de sólo "hay/no hay": el cajero decide si
     alcanza para lo que le están pidiendo sin abrir nada. */
  _tarjetaProducto(p) {
    const stock = Number(p.stock) || 0;
    const sinStock = stock <= 0;
    const bajo = !sinStock && stock <= 5;
    const clase = sinStock ? 'out' : (bajo ? 'low' : 'ok');
    const etiqueta = sinStock ? 'Agotado'
      : `${stock}${p.unidad_medida ? ' ' + UI.esc(p.unidad_medida) : ''} disp.`;

    /* El inventario de la armería SÍ se ve y se vende acá (chalecos, camping,
       limpieza, ropa). Lo que no se cobra en el mostrador es el arma de fuego
       y la munición: la tarjeta lo dice antes de tocarla, y addToCart explica
       por qué si alguien la toca igual. */
    const regulado = typeof articuloRegulado === 'function' && articuloRegulado(p);

    const thumb = p.imagen_url
      ? `<img class="fpos-thumb" src="${encodeURI(p.imagen_url)}" alt="" loading="lazy">`
      : '<div class="fpos-thumb">📦</div>';

    const codigo = p.codigo || p.codigo_barras;
    return `
      <div class="fpos-card ${sinStock ? 'off' : ''}"
           ${sinStock ? '' : `onclick="POS.addToCart('${p.id}')"`}
           title="${UI.esc(p.nombre)}">
        ${thumb}
        <div class="fpos-body">
          <div class="fpos-nombre">${UI.esc(p.nombre)}</div>
          ${codigo ? `<div class="fpos-meta">${UI.esc(codigo)}</div>` : ''}
          <div class="fpos-pie">
            <span class="fpos-precio">${UI.q(p.precio_venta)}</span>
            <span class="fpos-stock ${regulado ? 'out' : clase}">${regulado ? '🔒 Solo Armería' : etiqueta}</span>
          </div>
        </div>
      </div>`;
  },

  _pintarGrid() {
    const cont = document.getElementById('pos-grid');
    if (!cont) return;
    const items = this._filtrados();
    cont.innerHTML = items.length
      ? `<div class="fpos-grid">${items.map(p => this._tarjetaProducto(p)).join('')}</div>`
      : `<div class="empty-state" style="padding:34px;text-align:center">
           ${this._busca ? `Ningún producto coincide con <b>${UI.esc(this._busca)}</b>.`
                         : 'No hay productos en esta categoría.'}
         </div>`;
    this._pintarChips();
  },

  /* Las categorías viven en el dropdown 🏷️ y no en una fila de chips: en un
     catálogo real la fila crecía tanto que tapaba los productos. Se repintan
     junto con la rejilla porque el conteo depende del buscador: al escribir
     "aceite", cada categoría dice cuántos aceites tiene, no su total. */
  _pintarChips() {
    const pop = document.getElementById('pos-cats-popover');
    if (!pop) return;

    /* Se cuenta sobre lo filtrado por texto y giro, pero SIN la categoría
       activa: si no, la elegida diría su total y las demás cero. */
    const catGuardada = this._cat;
    this._cat = '';
    const base = this._filtrados();
    this._cat = catGuardada;

    const cuenta = c => base.filter(p => (p.categoria || 'Sin categoría') === c).length;
    const item = (activo, txt, n, catVal) => `
      <div class="options-item" style="justify-content:space-between; padding:6px 10px; font-size:12px; font-weight:700; ${activo ? 'background:var(--purple-dim); color:var(--purple) !important;' : ''}" onclick="POS._setCatFilter('${UI.jsAttr(String(catVal))}')">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${txt}</span>
        <span style="font-size:10px; background:var(--surface3); padding:1px 5px; border-radius:4px; color:var(--text3); font-weight:700;"><small>${n}</small></span>
      </div>`;

    pop.innerHTML = [
      item(!this._cat, '📦 Todo', base.length, ''),
      ...this._cats().map(c => item(this._cat === c, UI.esc(c), cuenta(c), c)),
    ].join('');

    /* El botón carga la etiqueta activa, así que se actualiza aquí y no en cada
       sitio que toca this._cat (setGiro también la limpia). */
    const label = document.getElementById('pos-cat-label');
    if (label) label.textContent = this._cat || 'Todo';
  },

  _setCatFilter(cat) {
    this._cat = cat;
    const pop = document.getElementById('pos-cats-popover');
    if (pop) pop.style.display = 'none';
    const btn = document.getElementById('pos-btn-cats');
    if (btn) btn.style.background = 'var(--surface)';
    this._pintarGrid();
  },

  /* ── CARRITO ─────────────────────────────────────── */
  addToCart(id) {
    const p = this._prod.find(x=>x.id===id);
    if (!p) return;
    /* Único portón de entrada al carrito (la tarjeta, el escáner y el numpad
       pasan todos por acá), así que la regla se pone una sola vez. */
    if (typeof articuloRegulado === 'function' && articuloRegulado(p)) {
      UI.toast('Las armas de fuego y la munición no se cobran en el POS: van por el módulo de Armería, que registra al comprador y su licencia (arts. 59 y 60 de la Ley de Armas).', 'warn', 9000);
      return;
    }
    const linea = this._cart.find(l=>l.id===id);
    const enCarrito = linea ? linea.cant : 0;
    if (enCarrito + 1 > (p.stock||0)) { UI.toast('No hay más stock disponible','warn'); return; }
    if (linea) linea.cant++;
    else this._cart.push({ id:p.id, nombre:p.nombre, precio:Number(p.precio_venta)||0, cant:1, stock:p.stock, unidad:p.unidad_medida, imagen_url:p.imagen_url });
    this._pintarCart();
  },

  /* Los giros que el comercio maneja DE VERDAD, mirando lo que hay cargado en
     el catalogo y no la teoria: si nunca cargo nada de electronica, ese filtro
     solo estorbaria. Con un solo giro no se muestra nada — el POS de un negocio
     no tiene por que llenarse de botones. */
  _girosPOS() {
    const usados = [...new Set((this._prod || []).map(p => p.tipo_item || 'general'))]
      .filter(g => typeof GIROS !== 'undefined' && GIROS[g]);
    return usados.length > 1 ? usados : [];
  },

  setGiro(g, el) {
    const apagar = this._giro === g;             // volver a tocarlo lo apaga
    this._giro = apagar ? '' : g;
    this._cat = '';                              // giro y categoria no se pisan
    /* Se marca la pastilla a mano: repintar la pagina entera por un filtro
       perderia el carrito a medio armar. */
    el?.parentElement?.querySelectorAll('.fpos-chip').forEach(p => p.classList.remove('on'));
    if (!apagar && el) el.classList.add('on');
    this._pintarGrid();
  },

  /* La bascula sirve para lo que se vende POR PESO. Un filtro de aceite se
     cuenta en piezas: ponerle el boton solo estorbaria. */
  _pesable(linea) {
    /* La lista de unidades de peso sale de giros.js y no se copia acá: una
       copia se queda vieja el día que se agrega una unidad. */
    return typeof Bascula !== 'undefined' && Bascula.disponible()
        && typeof esUnidadDePeso === 'function' && esUnidadDePeso(linea.unidad);
  },

  /* Toma el peso de la bascula y lo pone como cantidad. Espera a que la
     lectura sea ESTABLE: un peso tomado mientras el grano se acomoda es un
     peso equivocado, y en granos eso es plata. */
  async pesar(id) {
    const l = this._cart.find(x => x.id === id);
    if (!l) return;
    if (typeof Bascula === 'undefined' || !Bascula.disponible()) {
      UI.toast('Este navegador no lee básculas. Escribí el peso a mano.', 'warn'); return;
    }
    if (!Bascula._puerto) {
      const r = await Bascula.conectar();
      if (r.cancelado) return;
      if (!r.ok) { UI.toast('No se pudo conectar: ' + r.error, 'error'); return; }
      UI.toast('Báscula conectada ⚖️', 'success');
    }
    UI.toast('Poné el producto en la báscula...', 'info');
    Bascula.onLectura = (lectura, estable) => {
      if (!estable) return;                       // se espera a que se asiente
      const cant = Bascula.aUnidad(lectura, String(l.unidad || 'kg').toLowerCase());
      Bascula.onLectura = null;
      if (cant === null) { UI.toast('La báscula da peso y este artículo no se vende por peso.', 'warn'); return; }
      if (cant <= 0) { UI.toast('La báscula marca cero o tara.', 'warn'); return; }
      this.setCant(id, cant);
      UI.toast(`Pesado: ${cant} ${l.unidad}`, 'success');
    };
  },

  cambiarCant(id, delta) {
    const l = this._cart.find(x=>x.id===id);
    if (!l) return;
    /* Redondeo a milesimas: sumar decimales en coma flotante deja colas como
       0.30000000000000004, que en pantalla se ve como un error del sistema. */
    l.cant = Math.round((l.cant + delta) * 1000) / 1000;
    if (l.cant <= 0) { this._cart = this._cart.filter(x=>x.id!==id); }
    else if (l.cant > (l.stock||0)) { l.cant = l.stock; UI.toast('Límite de stock','warn'); }
    this._pintarCart();
  },

  /* Escribir la cantidad, no sumar de uno en uno. Un quintal de maiz se vende
     por 12.5, y el gas refrigerante por 3.75 libras: con los botones +/- eso
     no se puede teclear. parseFloat y no parseInt — con parseInt, "12.5"
     entraba como 12 y el comercio regalaba media unidad en cada venta. */
  setCant(id, valor) {
    const l = this._cart.find(x=>x.id===id);
    if (!l) return;
    let n = parseFloat(String(valor).replace(',', '.'));
    if (!isFinite(n) || n <= 0) { this._cart = this._cart.filter(x=>x.id!==id); this._pintarCart(); return; }
    /* Se redondea a milesimas: es la precision de la balanza y la de la
       columna en la base (numeric(14,3)). Guardar mas decimales de los que la
       base guarda haria que el total en pantalla no cuadre con el guardado. */
    n = Math.round(n * 1000) / 1000;
    if (n > (l.stock || 0)) { n = l.stock; UI.toast('Límite de stock','warn'); }
    l.cant = n;
    this._pintarCart();
  },

  quitar(id) { this._cart = this._cart.filter(x=>x.id!==id); this._pintarCart(); },

  _totales() {
    const bruto = this._cart.reduce((s,l)=>s+l.cant*l.precio, 0);
    const tasa = Number(fidelizacionCfg().puntos_por_q1_canje)||10;   // pts que valen Q1
    const descCanje = this._canje > 0 ? this._canje/tasa : 0;
    const desc = Math.min(bruto, (Number(this._descuento)||0) + descCanje);
    const total = Math.max(0, bruto - desc);
    const subtotal = Math.round(total/1.12*100)/100;
    const iva = Math.round((total - subtotal)*100)/100;
    return { bruto, desc, descCanje, total, subtotal, iva };
  },

  /* Montos con los que el cliente suele pagar en efectivo, para el botón
     rápido del vuelto: el billete siguiente que cubre la cuenta y los redondeos
     de arriba. Con Q630 ofrece Q650, Q700 y Q1000.

     ESTA FUNCIÓN NO EXISTÍA Y ERA LA CAUSA DE QUE NO SE VIERA EL TOTAL: se
     llamaba desde _pintarCart dentro de `if (t.total > 0)`, así que con el
     carrito vacío no pasaba nada (por eso se veía "Total Q0.00"), pero al
     agregar el primer producto reventaba a media pintada y el bloque de
     totales se quedaba sin escribir. Y como el método por defecto es Efectivo,
     le pasaba a todo el mundo, siempre.

     Los cortes son los billetes que circulan en Guatemala: 20, 50, 100, 200 y
     el redondeo a mil. */
  _montosRapidos(total) {
    const t = Number(total) || 0;
    if (t <= 0) return [];
    const arriba = (paso) => Math.ceil(t / paso) * paso;
    /* Se descartan los que dan exactamente el total: para eso ya está el botón
       "Exacto", y repetirlo ocuparía lugar sin servir. */
    const candidatos = [arriba(20), arriba(50), arriba(100), arriba(500), arriba(1000)]
      .filter(m => m > t + 0.001);
    return [...new Set(candidatos)].sort((a, b) => a - b).slice(0, 3);
  },

  _pintarCart() {
    this._pisoOk = false;   // el aviso de margen mínimo se re-evalúa al cambiar el carrito
    const cont = document.getElementById('pos-cart');
    const tot  = document.getElementById('pos-totales');
    if (!cont || !tot) return;
    cont.innerHTML = `
      <div style="font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--amber);margin-bottom:6px">🧾 Detalle de la Venta</div>
      ${this._cart.length ? this._cart.map(l=>`
        <div class="pos-line" style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">
          ${l.imagen_url?`<img src="${l.imagen_url}" style="width:30px;height:30px;border-radius:6px;object-fit:cover;flex-shrink:0">`:'<div style="width:30px;height:30px;border-radius:6px;background:var(--surface3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px">📦</div>'}
          <div class="pos-line-info" style="flex:1;min-width:0">
            <div class="pos-line-nombre" style="font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)" title="${UI.esc(l.nombre)}">${UI.esc(l.nombre)}</div>
            <div style="font-size:10.5px;color:var(--text3);margin-top:1px">${UI.q(l.precio)} c/u</div>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            <button class="btn btn-ghost" style="width:22px;height:22px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;border:1px solid var(--border)" onclick="POS.cambiarCant('${l.id}',-1)">−</button>
            <input class="pos-line-cant" type="number" step="0.001" min="0" value="${l.cant}"
                   style="width:54px;text-align:center;font-weight:900;font-size:12.5px;padding:1px 2px;border:1px solid var(--border);border-radius:5px;background:var(--surface2);color:var(--text)"
                   onchange="POS.setCant('${l.id}', this.value)"
                   onclick="this.select()"
                   title="Se puede escribir: 12.5 quintales, 3.75 libras de gas">
            ${l.unidad ? `<span style="font-size:9.5px;color:var(--text3);min-width:28px">${l.unidad}</span>` : ''}
            ${POS._pesable(l) ? `<button class="btn btn-ghost" style="padding:1px 4px;font-size:11px" title="Tomar el peso de la báscula" onclick="POS.pesar('${l.id}')">⚖️</button>` : ''}
            <button class="btn btn-ghost" style="width:22px;height:22px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;border:1px solid var(--border)" onclick="POS.cambiarCant('${l.id}',1)">+</button>
          </div>
          <div style="width:72px;text-align:right;font-weight:900;font-size:13px" class="text-amber pos-line-total">${UI.q(l.cant*l.precio)}</div>
          <button class="btn btn-ghost" style="padding:2px 4px;color:var(--text3)" onclick="POS.quitar('${l.id}')" title="Eliminar">🗑️</button>
        </div>`).join('') : '<div class="text-muted" style="padding:30px 10px;text-align:center;font-size:12px">Selecciona productos a la izquierda para agregarlos al carrito</div>'}`;

    const t = this._totales();
    const cli = this._cliente;
    const puntosCli = cli?.programa_puntos ? (Number(cli.puntos_saldo)||0) : null;

    // 1. Bloque de Canje de Puntos HTML (Desacoplado)
    let htmlCanje = '';
    if (puntosCli !== null && puntosCli >= (Number(fidelizacionCfg().puntos_por_q1_canje) || 10)) {
      const tasa = Number(fidelizacionCfg().puntos_por_q1_canje) || 10;
      const maxCanjeable = Math.min(puntosCli, Math.floor(t.bruto * tasa));
      htmlCanje = `
      <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; background:rgba(255,255,255,0.6); padding:8px; border-radius:8px; border:1px solid #ebd5ff; margin-top:2px;">
        <span style="font-weight:700; color:#5b21b6;">Canjear pts:</span>
        <div style="display:flex; align-items:center; gap:4px">
          <input class="form-input" style="width:72px; padding:4px 6px; font-size:12px; height:26px; border-radius:5px; background:#fff;" type="number" min="0" step="${tasa}" max="${maxCanjeable}"
                 value="${this._canje}" onchange="POS.setCanje(this.value)">
          <span style="font-size:11px; color:#5b21b6; font-weight:700;">= Q${(this._canje / tasa).toFixed(2)}</span>
        </div>
      </div>`;
    }

    // 2. Bloque de Métodos de Pago HTML (Desacoplado)
    const pt = Auth.tenant?.config_pos_tarjeta;
    const conTarjeta = !pt || pt.habilitado !== false;
    const metodos = [
      { id:'Efectivo', label:'Efectivo', icon:'💵' },
      ...(conTarjeta ? [{ id:'Tarjeta', label:'Tarjeta', icon:'💳' }] : []),
      { id:'Transferencia', label:'Transfer', icon:'🏦' },
      { id:'Cheque', label:'Cheque', icon:'✍️' }
    ];
    const htmlMetodos = metodos.map(m => `
      <div class="pos-pay-compact-btn ${this._metodo===m.id?'selected':''}" onclick="POS._setMetodoPagoInline('${m.id}')">
        <span>${m.icon}</span> <span>${m.label}</span>
      </div>
    `).join('');

    // 3. Bloque de Calculadora de Vuelto HTML (Desacoplado)
    let htmlVuelto = '';
    if (this._metodo === 'Efectivo') {
      let htmlBilletes = '';
      if (t.total > 0) {
        const billetes = this._montosRapidos(t.total);
        const botonesBilletes = billetes.map(m => `
          <button class="btn btn-secondary btn-sm" style="flex:1; font-weight:700; border-radius:4px; padding:3px; font-size:10px;" onclick="POS._setRecibido(${m})">Q${m}</button>
        `).join('');
        htmlBilletes = `
        <div style="display:flex; gap:3px; margin-top:2px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" style="flex:1; font-weight:700; border-radius:4px; padding:3px; font-size:10px;" onclick="POS._setRecibido(${t.total.toFixed(2)})">Exacto</button>
          ${botonesBilletes}
        </div>`;
      }
      htmlVuelto = `
        <div style="display:flex; gap:6px; align-items:center; background:#fff; padding:6px; border-radius:6px; border:1px solid #ffedd5; margin-top:2px;">
          <div style="flex:1.2;">
            <label style="font-size:9.5px; font-weight:800; color:#c2410c; text-transform:uppercase;">Recibido</label>
            <input class="form-input" id="pos-recibido" type="number" min="0" step="0.01"
                   placeholder="${t.total.toFixed(2)}" style="margin-top:1px; border-radius:4px; background:var(--surface); width:100%; padding:3px 6px; height:24px; font-size:12px; font-weight:700; color:var(--text);">
          </div>
          <div style="flex:1; text-align:right;">
            <div style="font-size:9.5px; font-weight:800; color:#c2410c; text-transform:uppercase;">Cambio</div>
            <div id="pos-cambio" style="font-size:16px; font-weight:900; color:#15803d; margin-top:1px;">Q 0.00</div>
          </div>
        </div>
        ${htmlBilletes}`;
    }

    // 4. Desglose de Descuentos HTML
    const htmlDescRow = t.desc > 0 ? `
      <div style="display:flex; justify-content:space-between; font-size:11px; color:#c2410c; font-weight:700;">
        <span>Descuento</span><span>− ${UI.q(t.desc)}</span>
      </div>` : '';

    tot.innerHTML = `
      <!-- Columna Izquierda: Cliente, Envío & Pago (Morado/Lavanda) -->
      <div id="pos-cart-campos" style="flex:1.2; justify-content:space-between;">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <button class="btn btn-ghost" style="width:100%; text-align:left; font-size:11.5px; padding:5px 8px; border:1px solid #ebd5ff; border-radius:6px; background:#fff; color:#1e1b4b; display:flex; align-items:center; justify-content:space-between;" onclick="POS.modalCliente()">
            <span>👤 ${cli ? `<b>${UI.esc(cli.nombre)}</b>` : 'Consumidor Final (CF)'}</span>
            ${puntosCli !== null ? `<span style="color:#d97706; font-weight:800; font-size:10px; background:#fef3c7; padding:1px 4px; border-radius:4px;">${puntosCli} pts</span>` : ''}
          </button>
          ${htmlCanje}
        </div>

        <!-- Programar Envío -->
        <div style="border:1px solid #ebd5ff; border-radius:6px; padding:6px; background:#fff; margin-top:2px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; cursor:pointer; color:#1e1b4b; margin:0; user-select:none;">
            <input type="checkbox" id="pos-envio-on" style="width:13px; height:13px; margin:0;" ${this._envioData ? 'checked' : ''} onchange="POS._toggleEnvio(this.checked)"> 🚚 Envío a domicilio
          </label>
          ${this._envioData ? `
            <div style="margin-top:4px; font-size:10px; color:#5b21b6; background:#f5f3ff; border-radius:4px; padding:4px; display:flex; justify-content:space-between; align-items:center; border:1px solid #ebd5ff;">
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px;">📦 <b>${UI.esc(this._envioData.destinatario || 'Cliente')}</b> · ${UI.esc(this._envioData.direccion)}</span>
              <button class="btn btn-sm btn-ghost" style="padding:0px 4px; font-size:9px;" onclick="POS.modalEnvio()">Editar</button>
            </div>` : ''}
        </div>

        <!-- Descuento Manual y Método de Pago (Movidos aquí) -->
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px; border-top:1px dashed #ebd5ff; padding-top:4px;">
          <div style="display:flex; align-items:center; justify-content:space-between; font-size:11px;">
            <span style="font-weight:700; color:#5b21b6;">Descuento Manual:</span>
            <div style="display:flex; align-items:center; gap:1px">
              <span style="font-weight:800; color:#5b21b6; font-size:10px;">Q</span>
              <input class="form-input" style="width:58px; padding:2px 4px; font-size:11px; height:20px; border-radius:4px; background:#fff; text-align:right; border:1px solid #ebd5ff;" type="number" min="0" step="0.01"
                     value="${this._descuento}" onchange="POS.setDescuento(this.value)">
            </div>
          </div>
          <div class="pos-pay-compact-grid">
            ${htmlMetodos}
          </div>
        </div>
      </div>

      <!-- Columna Derecha: Totales y Cobro (Naranja/Peach) -->
      <div id="pos-cart-pie" style="flex:1; justify-content:space-between;">
        <!-- Totales Breakdown -->
        <div style="background:rgba(255,255,255,0.7); border-radius:6px; padding:6px; border:1px solid #ffedd5; margin-top:0;">
          ${htmlDescRow}
          <div style="display:flex; justify-content:space-between; font-size:10px; color:#7c2d12;">
            <span>Subtotal: ${UI.q(t.subtotal)}</span>
            <span>IVA: ${UI.q(t.iva)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:900; margin-top:2px; padding-top:2px; border-top:1px solid #ffedd5; font-family:'Outfit',sans-serif; color:#7c2d12;">
            <span>Total</span>
            <span>${UI.q(t.total)}</span>
          </div>
        </div>

        ${htmlVuelto}

        <button class="btn fpos-cobrar" id="pos-btn-cobrar" style="width:100%; font-size:13.5px; padding:7px; font-weight:800; border-radius:6px; margin-top:2px; background:${this._cart.length ? '#16a34a' : 'var(--surface3)'}; color:${this._cart.length ? '#fff' : 'var(--text3)'}; border:none; font-family:'Outfit',sans-serif; box-shadow:${this._cart.length ? '0 3px 6px rgba(22,163,74,0.15)' : 'none'}" onclick="POS.cobrar()" ${this._cart.length ? '' : 'disabled'}>
          💵 Cobrar ${UI.q(t.total)}
        </button>
      </div>`;

    // Enganchar listeners de la calculadora de vuelto
    const recEl = document.getElementById('pos-recibido');
    if (recEl) {
      if (this._recibidoVal !== undefined) {
        recEl.value = this._recibidoVal;
        this._actualizarCambio();
      }
      recEl.addEventListener('input', () => this._actualizarCambio());
      recEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('pos-btn-cobrar')?.click();
        }
      });
    }

    this._pintarMbar();
  },

  _setMetodoPagoInline(metodo) {
    this._metodo = metodo;
    if (metodo !== 'Tarjeta') this._tarjetaDatos = null;
    this._pintarCart();
  },

  _setMetodoPago(metodo, el) {
    this._metodo = metodo;
    if (metodo !== 'Tarjeta') this._tarjetaDatos = null;
    this._pintarCart();
  },

  _setRecibido(v) {
    const input = document.getElementById('pos-recibido');
    if (input) {
      input.value = v;
      this._recibidoVal = v;
      this._actualizarCambio();
    }
  },

  _actualizarCambio() {
    const input = document.getElementById('pos-recibido');
    const el = document.getElementById('pos-cambio');
    if (!input || !el) return;
    const total = this._totales().total;
    const rec = parseFloat(input.value) || 0;
    this._recibidoVal = input.value;
    const cambio = Math.max(0, rec - total);
    el.textContent = UI.q(cambio);
  },

  _keypadPress(k) {
    const input = document.getElementById('pos-busca');
    if (!input) return;
    if (k === '←') {
      input.value = input.value.slice(0, -1);
    } else if (k === 'Enter') {
      document.getElementById('pos-numpad-popover').style.display = 'none';
      const numpadBtn = document.getElementById('pos-btn-numpad');
      if (numpadBtn) numpadBtn.style.background = 'var(--surface)';
      this._agregarPorBusqueda();
    } else {
      input.value += k;
    }
    this._busca = input.value;
    this._pintarGrid();
    input.focus();
  },

  _triggerOp(op) {
    document.getElementById('pos-options-popover').style.display = 'none';
    const optBtn = document.getElementById('pos-btn-options');
    if (optBtn) optBtn.style.background = 'var(--surface)';

    if (op.includes('Reimprimir')) {
      this.reimprimirUltimo();
    } else if (op.includes('Cerrar Caja')) {
      this.modalCierreCaja();
    } else if (op.includes('Reporte')) {
      this.reportes();
    } else if (op.includes('Sincronizar')) {
      this.render();
      UI.toast('Catálogo sincronizado ✓');
    } else if (op.includes('Cambiar Terminal')) {
      this.cambiarTerminal();
    }
  },

  reimprimirUltimo() {
    if (this._ventasHoy && this._ventasHoy.length) {
      const ultimo = [...this._ventasHoy].sort((a,b) => new Date(b.created_at || b.fecha) - new Date(a.created_at || a.fecha))[0];
      if (ultimo) {
        this._imprimirRecibo(ultimo.id);
        return;
      }
    }
    UI.toast('No se encontraron ventas recientes para reimprimir', 'warn');
  },

  /* ── VOUCHER DE TARJETA (POS físico VISA/Credomatic) ──
     Solo se registran autorización y últimos 4 dígitos del voucher.
     NUNCA se pide ni se guarda el número completo ni el CVV. */
  modalTarjeta() {
    const pt = Auth.tenant?.config_pos_tarjeta || {};
    const t = this._totales();
    const comision = (Number(pt.comision_pct)||0) > 0 ? t.total * (Number(pt.comision_pct)||0) / 100 : 0;
    UI.modal('💳 Pago con tarjeta', `
      <div class="alert alert-cyan" style="margin-bottom:12px"><div class="alert-icon">🔒</div><div class="alert-body" style="font-size:11.5px">
        Pasa la tarjeta en tu POS <b>${pt.proveedor||'VISA/Credomatic'}</b> y copia los datos del voucher.
        <b>No ingreses el número completo de la tarjeta ni el CVV.</b>
      </div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo</label>
          <select class="form-select" id="pt-tipo"><option>Crédito</option><option>Débito</option></select></div>
        <div class="form-group"><label class="form-label">Red</label>
          <select class="form-select" id="pt-red"><option>VISA</option><option>Mastercard</option><option>Otra</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">No. de autorización *</label>
          <input class="form-input mono-sm" id="pt-aut" maxlength="10" placeholder="Del voucher, ej. 123456"></div>
        <div class="form-group"><label class="form-label">Últimos 4 dígitos</label>
          <input class="form-input mono-sm" id="pt-u4" maxlength="4" inputmode="numeric" placeholder="****"
                 oninput="this.value=this.value.replace(/\\D/g,'').slice(0,4)"></div>
      </div>
      ${comision>0?`<div style="font-size:12px;color:var(--text3);margin-bottom:8px">Comisión ${pt.proveedor||''} ${pt.comision_pct}% ≈ <b>${UI.q(comision)}</b> (informativa, la descuenta el banco)</div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-green" onclick="POS._confirmarTarjeta()">✓ Confirmar y cobrar ${UI.q(t.total)}</button>
      </div>`, '460px');
  },

  _confirmarTarjeta() {
    const aut = (document.getElementById('pt-aut')?.value||'').trim();
    const u4  = (document.getElementById('pt-u4')?.value||'').trim();
    if (!aut) { UI.toast('Ingresa el número de autorización del voucher','error'); return; }
    if (/\d{13,19}/.test(aut.replace(/[\s\-]/g,''))) { UI.toast('Seguridad: eso parece un número de tarjeta. Ingresa solo la autorización del voucher.','error'); return; }
    if (u4 && !/^\d{4}$/.test(u4)) { UI.toast('Los últimos 4 dígitos deben ser exactamente 4 números','error'); return; }
    const pt = Auth.tenant?.config_pos_tarjeta || {};
    const t = this._totales();
    this._tarjetaDatos = {
      tipo: document.getElementById('pt-tipo')?.value||'Crédito',
      red:  document.getElementById('pt-red')?.value||'VISA',
      autorizacion: aut,
      ultimos4: u4||null,
      proveedor: pt.proveedor||null,
      comision: (Number(pt.comision_pct)||0)>0 ? Math.round(t.total*(Number(pt.comision_pct)||0))/100 : 0
    };
    UI.cerrarModal();
    this.cobrar();
  },

  setDescuento(v) { this._descuento = Math.max(0, parseFloat(v)||0); this._pintarCart(); },
  setCanje(v) {
    const tasa = Number(fidelizacionCfg().puntos_por_q1_canje)||10;
    let n = parseInt(v)||0;
    n = Math.floor(n/tasa)*tasa;   // múltiplos de la tasa de canje
    const saldo = Number(this._cliente?.puntos_saldo)||0;
    const bruto = this._totales().bruto;
    this._canje = Math.max(0, Math.min(n, saldo, Math.floor(bruto*tasa)));
    this._pintarCart();
  },

  /* ── CLIENTE ─────────────────────────────────────── */
  modalCliente() {
    UI.modal('👤 Cliente de la venta', `
      <input class="form-input" id="pos-cli-busca" placeholder="🔍 Buscar nombre / NIT / teléfono..."
             oninput="POS._filtrarClientes(this.value)" style="margin-bottom:10px">
      <div style="max-height:320px;overflow-y:auto" id="pos-cli-list">${this._listaClientes(this._clientes)}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="POS.setCliente(null)">Consumidor Final</button>
      </div>`, '480px');
  },

  _listaClientes(arr) {
    return arr.map(c=>`<div onclick="POS.setCliente('${c.id}')" style="padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center">
      <div><b>${UI.esc(c.nombre)}</b><div style="font-size:11px;color:var(--text3)">NIT ${c.nit||'CF'} · ${c.tel||''}</div></div>
      ${c.programa_puntos?`<span class="badge badge-amber">${c.puntos_saldo||0} pts</span>`:'<span class="badge badge-gray">sin puntos</span>'}
    </div>`).join('') || '<div class="text-muted" style="padding:16px">Sin clientes</div>';
  },

  _filtrarClientes(q) {
    const b = (q||'').toLowerCase();
    const arr = this._clientes.filter(c=>(c.nombre||'').toLowerCase().includes(b)||(c.nit||'').toLowerCase().includes(b)||(c.tel||'').includes(b));
    const cont = document.getElementById('pos-cli-list');
    if (cont) cont.innerHTML = this._listaClientes(arr);
  },

  setCliente(id) {
    this._cliente = id ? this._clientes.find(c=>c.id===id) : null;
    this._canje = 0;
    UI.cerrarModal();
    this._pintarCart();
    setTimeout(() => this._pintarCart(), 20);
  },

  /* ── ENVÍO ───────────────────────────────────────── */
  _toggleEnvio(on) {
    if (on) this.modalEnvio();
    else { this._envioData = null; this._pintarCart(); }
  },

  modalEnvio() {
    const e = this._envioData || {};
    const cli = this._cliente;
    const hoy = new Date().toISOString().slice(0,10);
    UI.modal('🚚 Datos del envío al cliente', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Destinatario *</label>
          <input class="form-input" id="env-dest" value="${UI.esc(e.destinatario||cli?.nombre||'')}" placeholder="Nombre de quien recibe"></div>
        <div class="form-group"><label class="form-label">Teléfono *</label>
          <input class="form-input" id="env-tel" value="${e.telefono||cli?.tel||''}" placeholder="5555-5555"></div>
      </div>
      <div class="form-group"><label class="form-label">Dirección de entrega *</label>
        <textarea class="form-input" id="env-dir" rows="2" placeholder="Calle, número, zona, referencias...">${UI.esc(e.direccion||cli?.direccion||'')}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Municipio / Depto.</label>
          <input class="form-input" id="env-muni" value="${e.municipio||''}" placeholder="Guatemala, Mixco..."></div>
        <div class="form-group"><label class="form-label">Medio de envío</label>
          <select class="form-select" id="env-medio">
            ${['Courier','Mensajería en moto','Vehículo propio','Encomienda / bus','Retiro en tienda'].map(m=>`<option ${e.medio===m?'selected':''}>${m}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Empresa / Courier</label>
          <input class="form-input" id="env-empresa" value="${e.empresa||''}" placeholder="Cargo Expreso, Guatex..."></div>
        <div class="form-group"><label class="form-label">Costo del flete (Q)</label>
          <input class="form-input" id="env-costo" type="number" min="0" step="0.01" value="${e.costo||''}" placeholder="0.00"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Entrega estimada</label>
          <input class="form-input" id="env-fecha" type="date" value="${e.fecha_entrega||hoy}"></div>
        <div class="form-group"><label class="form-label">Referencia / Notas</label>
          <input class="form-input" id="env-notas" value="${e.refs||''}" placeholder="Punto de referencia, horario..."></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="POS._cancelEnvio()">Cancelar</button>
        <button class="btn btn-amber" onclick="POS._guardarEnvioDatos()">Guardar datos de envío</button>
      </div>`, '560px');
  },

  _cancelEnvio() {
    /* Si no había datos previos, desmarca la casilla */
    if (!this._envioData) { const c = document.getElementById('pos-envio-on'); if (c) c.checked = false; }
    UI.cerrarModal();
  },

  _guardarEnvioDatos() {
    const destinatario = document.getElementById('env-dest')?.value.trim();
    const telefono     = document.getElementById('env-tel')?.value.trim();
    const direccion    = document.getElementById('env-dir')?.value.trim();
    if (!destinatario || !telefono || !direccion) {
      UI.toast('Destinatario, teléfono y dirección son obligatorios','error'); return;
    }
    this._envioData = {
      destinatario, telefono, direccion,
      municipio: document.getElementById('env-muni')?.value.trim()||'',
      medio:     document.getElementById('env-medio')?.value||'',
      empresa:   document.getElementById('env-empresa')?.value.trim()||'',
      costo:     parseFloat(document.getElementById('env-costo')?.value)||0,
      fecha_entrega: document.getElementById('env-fecha')?.value||'',
      refs:      document.getElementById('env-notas')?.value.trim()||''
    };
    UI.cerrarModal();
    UI.toast('Datos de envío guardados ✓');
    this._pintarCart();
  },

  /* ── COBRO ───────────────────────────────────────── */
  async cobrar() {
    if (!this._caja?.id) { UI.toast('Abre la caja antes de cobrar', 'error'); return this.renderApertura(); }
    if (!this._cart.length) return;
    /* Política de precios: avisar si los descuentos dejan la venta bajo el margen mínimo */
    const Mmin = Number(Auth.tenant?.config_precios?.derivado?.multiplicador_min)||0;
    if (Mmin > 1 && !this._pisoOk) {
      const costoCart = this._cart.reduce((s,l)=>{
        const p = this._prod.find(x=>x.id===l.id);
        return s + (Number(p?.precio_costo)||0) * l.cant;
      }, 0);
      const piso = costoCart * Mmin;
      if (costoCart > 0 && this._totales().total < piso - 0.01) {
        if (!confirm(`⚠️ Con el descuento aplicado, esta venta queda BAJO tu margen mínimo (${Auth.tenant?.config_precios?.margen_minimo_pct||20}%).\nPrecio piso sugerido: ${UI.q(piso)}\n\n¿Cobrar de todos modos?`)) return;
        this._pisoOk = true;
      }
    }
    /* Tarjeta con config VISA/Credomatic activa: capturar voucher primero */
    if (this._metodo === 'Tarjeta' && Auth.tenant?.config_pos_tarjeta?.habilitado && !this._tarjetaDatos) {
      this.modalTarjeta();
      return;
    }
    const t = this._totales();
    const progEnvio = !!this._envioData;
    const cli = this._cliente;

    const res = await DB.upsertFactura({
      tarjeta_datos: this._metodo === 'Tarjeta' ? (this._tarjetaDatos||null) : null,
      cliente_id: cli?.id || null,
      nit: cli?.nit?.trim() || 'CF',
      nombre_receptor: cli?.nombre || 'Consumidor Final',
      tipo_cliente: (cli?.nit && cli.nit.toUpperCase()!=='CF') ? 'NIT' : 'CF',
      subtotal: t.subtotal, iva: t.iva, total: t.total,
      metodo_pago: this._metodo, estado: 'certificada',
      fecha: new Date().toISOString().slice(0,10),
      descripcion: 'Venta POS: ' + this._cart.map(l=>`${l.nombre} x${l.cant}`).join(', ').slice(0,480)
    });
    if (res.error || !res.data) { UI.toast('Error al cobrar: '+(res.error?.message||''),'error'); return; }
    const factura = res.data;

    const items = this._cart.map(l=>({ descripcion:l.nombre, cantidad:l.cant, precio_unit:l.precio, total:l.cant*l.precio, inventario_id:l.id }));
    await DB.insertFacturaItems(factura.id, items);
    await DB.descontarInventarioVenta(items, `Factura ${factura.num||factura.id.slice(0,8)}`);

    /* Fidelización: canje (descuento) y acumulación según política del negocio */
    const fid = fidelizacionCfg();
    if (cli?.programa_puntos) {
      if (this._canje > 0) {
        await DB.registrarPuntos(cli.id, -this._canje, { tipo:'canje', motivo:'Canje en venta POS', referencia:factura.num, factura_id:factura.id });
      }
      const ganados = Math.floor(t.total * (Number(fid.puntos_por_q)||0));
      if (ganados > 0) {
        await DB.registrarPuntos(cli.id, ganados, { tipo:'gana', motivo:'Compra POS', referencia:factura.num, factura_id:factura.id });
      }
    }

    /* Programar envío con los datos capturados */
    if (progEnvio) {
      const e = this._envioData;
      await DB.upsertEnvio({
        tipo: 'courier',
        descripcion: `Entrega venta ${factura.num||''}`,
        destinatario: e.destinatario || cli?.nombre || 'Cliente',
        cliente_id: cli?.id || null,
        telefono: e.telefono || null,
        direccion: e.direccion || null,
        municipio: e.municipio || null,
        referencias: e.refs || null,
        empresa_transporte: e.empresa || null,
        medio: e.medio || null,
        costo_flete: e.costo || 0,
        costo_total: e.costo || 0,
        num_factura: factura.num || null,
        orden_id: null,
        fecha_envio: new Date().toISOString().slice(0,10),
        fecha_entrega_estimada: e.fecha_entrega || null,
        estado: 'programado'
      }).catch(()=>{});
    }

    const totalPagado = t.total;
    const ganados = cli?.programa_puntos ? Math.floor(t.total * (Number(fid.puntos_por_q)||0)) : 0;
    /* Reset venta */
    this._cart = []; this._descuento = 0; this._canje = 0; this._cliente = null; this._metodo = 'Efectivo'; this._envioData = null; this._tarjetaDatos = null;
    await this.render();
    this._recibo(factura, items, totalPagado, ganados, progEnvio);
  },

  _recibo(factura, items, total, ganados, programado) {
    UI.modal('✅ Venta registrada', `
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:34px">✅</div>
        <div style="font-weight:800;font-size:18px">${UI.q(total)}</div>
        <div style="font-size:12px;color:var(--text3)">${factura.num||''} · ${factura.metodo_pago||''}</div>
        ${ganados>0?`<div style="font-size:12px;color:var(--amber);margin-top:4px">+${ganados} puntos de fidelización</div>`:''}
        ${programado?'<div style="font-size:12px;color:var(--cyan)">🚚 Envío programado</div>':''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="POS._imprimirRecibo('${factura.id}')">🖨️ Imprimir recibo</button>
      </div>`);
  },

  async _imprimirRecibo(facturaId) {
    const items = await DB.getFacturaItems(facturaId);
    const { data: f } = await getSB().from('facturas').select('*').eq('id', facturaId).maybeSingle();
    if (!f) return;
    const win = window.open('','_blank');
    win.document.write(`<html><head><title>Recibo ${f.num||''}</title>
      <style>
        body { font-family: 'DM Mono', 'Courier New', monospace; padding: 12px; max-width: 290px; color: #000; font-size: 12px; line-height: 1.4; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .r { display: flex; justify-content: space-between; }
        .hr { border-top: 1px dashed #000; margin: 8px 0; }
        .title { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
      </style></head>
      <body>
      <div class="center title">${Auth.tenant?.name||'NexusPro'}</div>
      <div class="center" style="font-size:10px">NIT: ${Auth.tenant?.nit||'—'}</div>
      <div class="center" style="font-size:10px">${UI.esc(Auth.tenant?.direccion||'Guatemala')}</div>
      <div class="hr"></div>
      <div class="r"><span>No. Ticket: <b>${f.num||''}</b></span><span>${UI.fecha(f.fecha)}</span></div>
      <div>Cliente: ${f.nombre_receptor||'CF'}</div>
      <div>NIT/DPI: ${f.nit||'CF'}</div>
      <div class="hr"></div>
      ${items.map(i=>`
        <div style="margin-bottom: 4px">
          <div>${i.descripcion}</div>
          <div class="r"><span style="padding-left:10px;color:#555">${i.cantidad} x ${UI.q(i.precio_unit)}</span><span>${UI.q(i.total)}</span></div>
        </div>
      `).join('')}
      <div class="hr"></div>
      <div class="r"><span>Subtotal</span><span>${UI.q(f.subtotal)}</span></div>
      <div class="r"><span>IVA (12%)</span><span>${UI.q(f.iva)}</span></div>
      <div class="r bold" style="font-size:14px"><span>TOTAL</span><span>${UI.q(f.total)}</span></div>
      <div class="hr"></div>
      <div class="r"><span>Método Pago:</span><span>${f.metodo_pago||'Efectivo'}</span></div>
      ${f.tarjeta_datos?`<div class="r" style="font-size:10px"><span>${f.tarjeta_datos.red||'Tarjeta'} ${f.tarjeta_datos.tipo||''} ${f.tarjeta_datos.ultimos4?'****'+f.tarjeta_datos.ultimos4:''}</span><span>Aut. ${f.tarjeta_datos.autorizacion||''}</span></div>`:''}
      <div class="hr"></div>
      <div class="center bold" style="margin-top:12px;font-size:11px">¡GRACIAS POR SU COMPRA!</div>
      <div class="center" style="font-size:9px;color:#444">NexusPro POS · Powered by Gemini</div>
      <script>window.print()</script></body></html>`);
    win.document.close();
  },

  /* ── CORTE DIARIO ────────────────────────────────── */
  async corteDiario() {
    const hoy = new Date().toISOString().slice(0,10);
    const facturas = await DB.getFacturas(hoy, hoy);
    const vivas = facturas.filter(f=>f.estado!=='anulada');
    const total = vivas.reduce((s,f)=>s+(Number(f.total)||0),0);
    const porMetodo = {};
    vivas.forEach(f=>{ const m=f.metodo_pago||'Efectivo'; porMetodo[m]=(porMetodo[m]||0)+(Number(f.total)||0); });
    UI.modal(`🧾 Corte diario — ${UI.fecha(hoy)}`, `
      <div class="kpi-grid" style="margin-bottom:14px">
        <div class="kpi-card"><div class="kpi-label">Ventas</div><div class="kpi-val cyan">${vivas.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total del día</div><div class="kpi-val amber">${UI.q(total)}</div></div>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Método de pago</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>${Object.entries(porMetodo).map(([m,v])=>`<tr><td>${m}</td><td style="text-align:right" class="mono-sm text-amber">${UI.q(v)}</td></tr>`).join('')||'<tr><td colspan="2" style="text-align:center;color:var(--text3)">Sin ventas hoy</td></tr>'}</tbody>
      </table></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="window.print()">🖨️ Imprimir</button>
      </div>`, '480px');
  },

  /* ── REPORTES SEMANAL / MENSUAL ──────────────────── */
  async reportes() {
    const hoy = new Date();
    const sem = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()-6).toISOString().slice(0,10);
    const mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0,10);
    const hoyStr = hoy.toISOString().slice(0,10);
    const [fSem, fMes] = await Promise.all([ DB.getFacturas(sem, hoyStr), DB.getFacturas(mes, hoyStr) ]);
    const sum = arr => arr.filter(f=>f.estado!=='anulada').reduce((s,f)=>s+(Number(f.total)||0),0);
    /* Ventas por día (mes en curso) */
    const dias = {};
    fMes.filter(f=>f.estado!=='anulada').forEach(f=>{ dias[f.fecha]=(dias[f.fecha]||0)+(Number(f.total)||0); });
    const filas = Object.entries(dias).sort((a,b)=>b[0].localeCompare(a[0]))
      .map(([d,v])=>`<tr><td>${UI.fecha(d)}</td><td style="text-align:right" class="mono-sm text-amber">${UI.q(v)}</td></tr>`).join('');
    UI.modal('📊 Reportes de ventas', `
      <div class="kpi-grid" style="margin-bottom:14px">
        <div class="kpi-card"><div class="kpi-label">Últimos 7 días</div><div class="kpi-val cyan">${UI.q(sum(fSem))}</div><div class="kpi-trend">${fSem.length} ventas</div></div>
        <div class="kpi-card"><div class="kpi-label">Mes en curso</div><div class="kpi-val amber">${UI.q(sum(fMes))}</div><div class="kpi-trend">${fMes.length} ventas</div></div>
      </div>
      <div style="font-size:12px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Libro de ventas — mes en curso</div>
      <div class="table-wrap" style="max-height:300px;overflow-y:auto"><table class="data-table">
        <thead><tr><th>Día</th><th style="text-align:right">Ventas</th></tr></thead>
        <tbody>${filas||'<tr><td colspan="2" style="text-align:center;color:var(--text3)">Sin ventas</td></tr>'}</tbody>
      </table></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="window.print()">🖨️ Imprimir</button>
      </div>`, '520px');
  }
};
