/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/app.js — Navegación y aplicación principal
═══════════════════════════════════════════════════════ */

const App = {
  paginaActual: 'dashboard',

  /* ── INICIAR APP ──────────────────────────────── */
  iniciar() {
    document.getElementById('login-screen')?.style.setProperty('display','none');
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.add('visible');
    App.renderSidebar();
    App.navegarA('dashboard');
    App.checkLicencia();
    App.registrarSW();
    TEMAS.aplicar(localStorage.getItem('tp_tema') || 'dark');
  },

  /* ── SIDEBAR ──────────────────────────────────── */
  renderSidebar() {
    const rol = Auth.user?.rol || 'recepcionista';
    const puedeVer = m => {
      if (!Auth.user) return false;
      if (m.id === 'mi_ot') return rol === 'cliente';
      if (rol === 'superadmin' || rol === 'admin') return m.id !== 'mi_ot';
      return tieneAcceso(m.id);
    };

    const itemHtml = m => `
      <li class="nav-item ${App.paginaActual === m.id ? 'active' : ''}"
          onclick="App.navegarA('${m.id}')">
        <span class="nav-icon">${m.icon}</span>
        <span class="nav-label">${m.label}</span>
      </li>`;

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

    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="sidebar-brand-name">TALLERPRO</div>
        <div class="sidebar-brand-sub">Enterprise v${APP.version}</div>
      </div>
      <div class="sidebar-tenant" onclick="App.toggleSidebar()">
        <div class="sidebar-tenant-name">${Auth.tenant?.name || 'TallerPro'}</div>
      </div>
      <nav class="sidebar-nav"><ul>${nav}</ul></nav>
      <div class="sidebar-user" id="sidebar-user" onclick="TEMAS.picker()" title="Cambiar tema">
        <span class="sidebar-user-avatar">${Auth.user?.avatar || '👤'}</span>
        <div class="sidebar-user-info">
          <div class="user-name">${Auth.user?.nombre || 'Usuario'}</div>
          <div class="user-role">${ROLES[Auth.user?.rol]?.label || ''}</div>
        </div>
        <span style="margin-left:auto;opacity:.5;font-size:14px">🎨</span>
      </div>
      <div class="sidebar-footer">
        <button class="btn btn-ghost btn-sm" onclick="App.cerrarSesion()" style="width:100%">
          ⏻ Cerrar sesión
        </button>
      </div>`;
  },

  /* ── NAVEGACIÓN ───────────────────────────────── */
  navegarA(pagina) {
    if (!Auth.user) return;
    const rol = Auth.user.rol;

    /* Verificar permisos */
    if (pagina !== 'mi_ot' && rol !== 'superadmin' && rol !== 'admin') {
      if (!tieneAcceso(pagina)) {
        UI.toast('Sin acceso a este módulo', 'error');
        return;
      }
    }

    App.paginaActual = pagina;
    App.renderSidebar();

    /* Cargar módulo */
    const modulo = window.Modulos?.[pagina];
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

  /* ── CERRAR SESIÓN ────────────────────────────── */
  async cerrarSesion() {
    await Auth.logout();
    location.reload();
  },

  /* ── SIDEBAR TOGGLE MÓVIL ─────────────────────── */
  toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-overlay')?.classList.toggle('open');
  },

  /* ── LICENCIA ─────────────────────────────────── */
  checkLicencia() {
    const lic = Auth.licencia;
    if (!lic || lic.tipo === 'completa') return;
    const dias = lic.dias_restantes;
    if (dias === undefined || dias > 7) return;

    const banner = document.createElement('div');
    banner.id = 'lic-banner';
    banner.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:999;
      background:${dias<=3?'var(--red)':'var(--amber)'};color:#000;
      padding:8px 16px;font-size:12px;font-weight:600;
      display:flex;align-items:center;justify-content:space-between;`;
    banner.innerHTML = `
      <span>⚠️ Demo: ${dias} día${dias===1?'':'s'} restante${dias===1?'':'s'}</span>
      <div style="display:flex;gap:8px">
        <button onclick="App.activarLicencia()"
          style="background:#000;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px">
          🔑 Activar
        </button>
        <button onclick="document.getElementById('lic-banner').remove()"
          style="background:none;border:none;cursor:pointer;font-size:16px">✕</button>
      </div>`;
    document.body.appendChild(banner);
  },

  activarLicencia() {
    UI.modal('🔑 Activar Licencia', `
      <div class="form-group">
        <label class="form-label">Código de Licencia</label>
        <input class="form-input" id="lic-code" placeholder="TALLERPRO-XXXX-XXXX"
               style="font-family:monospace;letter-spacing:2px;text-transform:uppercase">
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px">
        Contacta a <a href="mailto:soporte@tallerpro.gt" style="color:var(--cyan)">soporte@tallerpro.gt</a>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="App._procesarLicencia()">Activar</button>
      </div>`
    );
  },

  async _procesarLicencia() {
    const codigo = document.getElementById('lic-code')?.value.trim().toUpperCase();
    if (!codigo) { UI.toast('Ingresa el código','error'); return; }
    const r = await DB.activarLicencia(codigo, Auth.user?.email);
    if (!r.ok) { UI.toast('Código inválido: '+r.error,'error'); return; }
    document.getElementById('lic-banner')?.remove();
    UI.cerrarModal();
    UI.toast('¡Licencia activada! ✓');
    Auth.licencia = { tipo:'completa' };
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

  actual() { return localStorage.getItem('tp_tema') || 'dark'; },

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
