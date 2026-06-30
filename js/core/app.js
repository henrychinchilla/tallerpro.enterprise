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
    // Check MFA status first!
    if (typeof Auth !== 'undefined' && Auth.getMFAStatus) {
      const mfa = await Auth.getMFAStatus();
      if (mfa.nextLevel === 'aal2' && mfa.currentLevel === 'aal1') {
        document.getElementById('app')?.classList.remove('visible');
        document.getElementById('login-screen')?.style.removeProperty('display');
        if (typeof renderLogin === 'function') renderLogin('mfa-challenge');
        return;
      }
      if (mfa.currentLevel === 'aal1') {
        document.getElementById('app')?.classList.remove('visible');
        document.getElementById('login-screen')?.style.removeProperty('display');
        if (typeof renderLogin === 'function') renderLogin('mfa-enroll');
        return;
      }
    }

    document.getElementById('login-screen')?.style.setProperty('display','none');
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.add('visible');
    TEMAS.aplicar(localStorage.getItem('tp_tema') || 'light');
    /* Bloqueo si la cuenta del taller está suspendida (no aplica al superadmin) */
    if (Auth.user?.rol !== 'superadmin' && Auth.tenant?.active === false) {
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
                <div style="font-size:11px;color:var(--text3)">${o.notas||''}</div>
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

  /* El trial de 30 días arranca con el PRIMER USO del taller (no al
     registrarse ni mientras espera aprobación): si es un taller de
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

  /* Pantalla de cuenta suspendida (suscripción/cobro) o pendiente de activación */
  pantallaSuspendido() {
    const main = document.getElementById('page-content') || document.getElementById('app');
    const sb = document.getElementById('sidebar'); if (sb) sb.innerHTML = '';
    const pendiente = (Auth.tenant?.notas_admin || '').includes('Pendiente de aprobación');
    if (main) main.innerHTML = pendiente ? `
      <div style="min-height:90vh;display:flex;align-items:center;justify-content:center;padding:24px">
        <div class="card" style="max-width:480px;text-align:center">
          <div style="font-size:44px">⏳</div>
          <h2 style="margin:8px 0">Estamos activando tu taller</h2>
          <p style="color:var(--text2);font-size:14px"><b>${Auth.tenant?.name||'Tu taller'}</b> fue registrado con éxito
          y está en revisión de activación (normalmente toma unas horas).
          Te avisaremos a tu correo cuando puedas empezar tus <b>30 días de prueba gratis</b>.</p>
          <div style="margin-top:16px"><button class="btn btn-ghost" onclick="Auth.logout()">Cerrar sesión</button></div>
        </div>
      </div>` : `
      <div style="min-height:90vh;display:flex;align-items:center;justify-content:center;padding:24px">
        <div class="card" style="max-width:480px;text-align:center">
          <div style="font-size:44px">⏸️</div>
          <h2 style="margin:8px 0">Cuenta suspendida</h2>
          <p style="color:var(--text2);font-size:14px">El acceso a <b>${Auth.tenant?.name||'tu taller'}</b> está temporalmente suspendido.
          Ponte en contacto con soporte de TallerPro para reactivar tu suscripción.</p>
          <div style="margin-top:16px"><button class="btn btn-ghost" onclick="Auth.logout()">Cerrar sesión</button></div>
        </div>
      </div>`;
  },

  /* ── SIDEBAR ──────────────────────────────────── */
  renderSidebar() {
    const rol = Auth.user?.rol || 'recepcionista';
    const puedeVer = m => {
      if (!Auth.user) return false;
      if (m.id === 'mi_ot') return rol === 'cliente';
      if (m.id === 'superadmin') return rol === 'superadmin';
      if (rol === 'superadmin') return true;       // el dueño del SaaS ve todo
      return tieneAcceso(m.id);                     // admin del taller queda sujeto a su plan
    };

    const itemHtml = m => {
      /* Módulos con enlace externo (ej. POS) abren en nueva pestaña */
      if (m.href) {
        return `
        <li class="nav-item" style="list-style:none">
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
        <li class="nav-item ${activo ? 'active' : ''}"
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
      </div>
      <div class="sidebar-tenant" onclick="App.toggleSidebar()" style="display:flex;align-items:center;gap:8px">
        ${Auth.tenant?.logo_base64 ? `<img src="${Auth.tenant.logo_base64}" alt="logo" style="width:28px;height:28px;border-radius:6px;object-fit:contain;background:var(--surface2);flex-shrink:0">` : ''}
        <div class="sidebar-tenant-name" title="${Auth.tenant?.name || ''}">${Auth.tenant?.name || 'TallerPro'}</div>
      </div>
      <nav class="sidebar-nav"><ul>${nav}</ul></nav>
      ${iaBtn}
      <div class="sidebar-user" id="sidebar-user" onclick="TEMAS.picker()" title="Cambiar tema">
        <span class="sidebar-user-avatar">${Auth.user?.avatar || '👤'}</span>
        <div class="sidebar-user-info">
          <div class="user-name">${Auth.user?.nombre || 'Usuario'}</div>
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
          <span style="font-size:10px;color:rgba(255,255,255,0.2)">© 2026</span>
        </div>
      </div>`;

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
    /* Sincronizar la sub-sección activa con la pestaña interna del módulo */
    const def = MODULOS.find(m => m.id === pagina);
    const modulo = window.Modulos?.[pagina];
    App._subActivo = (def?.subnav?.length)
      ? (modulo?._tab || def.subnav[0].tab)
      : null;
    App._guardarRuta();
    App.renderSidebar();

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
     Editable por taller (Configuración > Seguridad de Sesión,
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
        UI.toast('¡Listo! Busca TallerPro en tu pantalla de inicio 📲', 'success', 5000);
        window._pwaPrompt = null;
        App.renderSidebar();
      }
      return;
    }
    /* iOS: instrucciones paso a paso */
    UI.modal('📲 Instalar TallerPro', `
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
  const stop = opts.stop !== false;   // por defecto frena la propagación (filas clickeables)
  const map = {
    ver:      ['btn-cyan',   '👁 Ver',    'Ver'],
    editar:   ['btn-cyan',   '✏️ Editar', 'Editar'],
    imprimir: ['btn-ghost',  '🖨️',        'Imprimir'],
    eliminar: ['btn-danger', '🗑️',        'Eliminar'],
  };
  const [cls, label, title] = map[tipo] || ['btn-ghost', tipo, tipo];
  const handler = stop ? `event.stopPropagation();${onclick}` : onclick;
  return `<button class="btn btn-sm ${cls}" title="${opts.titulo || title}" onclick="${handler}">${opts.label || label}</button>`;
};

/* Eliminar genérico con confirmación (tenant-scoped vía RLS). cb refresca la vista. */
Modulos.eliminarRegistro = async function (tabla, id, nombre, cb) {
  const ok = await UI.confirmar(
    `¿Eliminar <b>${nombre || 'este registro'}</b>? Esta acción no se puede deshacer.`,
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
    partes.push(`<span style="color:var(--cyan);font-size:11px">· ${r.nombre}</span>`);
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
