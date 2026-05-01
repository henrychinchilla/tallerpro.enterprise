/* ═══════════════════════════════════════════════════════
   app.js — Shell de la aplicación: sidebar, router,
             registro de Service Worker (PWA)
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

const App = {
  currentPage: 'dashboard',
  charts: {},

  /* ── INICIO ─────────────────────────────────────── */
  start() {
    if (!Auth.user) {
      Auth.user = { id:'demo', nombre:'Usuario', email:'', rol:'admin', activo:true, avatar:'👤' };
    }
    if (!Auth.tenant) {
      DB.getTenant().then(t => { if(t){ Auth.tenant=t; App.renderSidebar(); } });
    }
    const ls = document.getElementById('login-screen');
    if (ls) ls.style.display = 'none';
    const ap = document.getElementById('app');
    if (ap) ap.classList.add('visible');
    App.renderSidebar();
    App.navigate('dashboard');
    App.registerSW();
  },

  /* ── SERVICE WORKER (PWA) ───────────────────────── */
  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },

  /* ── SIDEBAR ────────────────────────────────────── */
  renderSidebar() {
    /* Info del tenant */
    const ti = document.getElementById('sidebar-tenant-info');
    ti.querySelector('.sidebar-tenant-name').textContent = Auth.tenant?.name || 'TallerPro';

    /* Navegación filtrada por rol */
    const nav   = document.getElementById('sidebar-nav');
    const role  = Auth.user?.rol || 'admin'; if (!Auth.user) return;
    let html    = '<div class="nav-section-label">Módulos</div>';

    NAV.forEach(item => {
      if (!item.roles.includes(role)) return;
      const badge = item.badge ? `<span class="nav-badge">${item.badge}</span>` : '';
      html += `
        <div class="nav-item${App.currentPage === item.id ? ' active' : ''}"
             id="nav-${item.id}"
             onclick="App.navigate('${item.id}')">
          <span class="nav-icon">${item.icon}</span>
          ${item.label}
          ${badge}
        </div>`;
    });
    nav.innerHTML = html;

    /* Usuario actual */
    const roleInfo = ROLES[role];
    const u        = document.getElementById('sidebar-user');
    u.innerHTML = `
      <div class="user-avatar">${roleInfo.icon}</div>
      <div>
        <div class="user-name">${Auth.user?.nombre||'Usuario'}</div>
        <div class="user-role">${roleInfo.label}</div>
      </div>
      <button class="user-logout" onclick="logout()" title="Cerrar sesión">⏻</button>`;
  },

  /* ── ROUTER ─────────────────────────────────────── */
  navigate(page) {
    if (!Auth.can(page)) {
      UI.toast('No tienes permiso para acceder a esa sección.', 'error');
      return;
    }

    App.destroyCharts();
    App.currentPage = page;

    /* Actualizar badge inventario dinámicamente */
    DB.getInventario().then(inv => {
      const bajo = inv.filter(i => i.stock <= i.min_stock).length;
      const badge = document.querySelector('#nav-inventario .nav-badge');
      if (bajo > 0) {
        if (!badge) {
          const navItem = document.getElementById('nav-inventario');
          if (navItem) {
            const b = document.createElement('span');
            b.className = 'nav-badge';
            b.textContent = bajo;
            navItem.appendChild(b);
          }
        } else {
          badge.textContent = bajo;
        }
      } else if (badge) {
        badge.remove();
      }
    }).catch(() => {});

    /* Marca activo en sidebar */
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('nav-' + page)?.classList.add('active');

    /* Label mobile */
    const item = NAV.find(n => n.id === page);
    const mob  = document.getElementById('mobile-page-label');
    if (mob && item) mob.textContent = '/ ' + item.label;

    /* Cierra sidebar en mobile */
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');

    /* Renderiza la página */
    const el = document.getElementById('page-content');
    el.className = 'anim-fadeup';
    el.innerHTML = '';
    void el.offsetWidth; // reflow para reiniciar animación

    const pages = {
      dashboard:   Pages.dashboard,
      clientes:    Pages.clientes,
      ordenes:     Pages.ordenes,
      inventario:  Pages.inventario,
      proveedores: Pages.proveedores,
      vehiculos:   Pages.vehiculos,
      calendario:  Pages.calendario,
      facturacion: Pages.facturacion,
      finanzas:    Pages.finanzas,
      rrhh:        Pages.rrhh,
      comunicaciones: Pages.comunicaciones,
      'mi-ot':     Pages.miOT,
      'mi-vehiculo':Pages.miVehiculo,
      config:      Pages.config,
      database:    Pages.database
    };

    if (pages[page]) {
      pages[page]();
    } else {
      el.innerHTML = `<div class="page-header"><h1 class="page-title">${item?.label || page}</h1></div>
                      <div class="page-body"><p class="text-muted">Módulo en desarrollo.</p></div>`;
    }
  },

  /* ── DESTRUIR CHARTS (evita memory leaks) ───────── */
  destroyCharts() {
    Object.values(App.charts).forEach(c => { try { c.destroy(); } catch (e) {} });
    App.charts = {};
  }
};

/* ── SIDEBAR MOBILE ─────────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

/* ── ENTRYPOINT ─────────────────────────────────────── */
function startApp() {
  // Hide login, show app
  App.start();
}

/* ══════════════════════════════════════════════════════
   THEME SWITCHER — Cambio rápido de tema
══════════════════════════════════════════════════════ */
const THEME = {
  THEMES: [
    { id: 'dark',   icon: '🌙', label: 'Oscuro'    },
    { id: 'light',  icon: '☀️', label: 'Claro'     },
    { id: 'blue',   icon: '🔵', label: 'Azul Navy' },
    { id: 'green',  icon: '🟢', label: 'Verde'     },
    { id: 'auto',   icon: '🌓', label: 'Auto'      }
  ],

  current() {
    return localStorage.getItem('tp_theme') || 'dark';
  },

  apply(themeId) {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    root.setAttribute('data-theme', themeId === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : themeId);
    localStorage.setItem('tp_theme', themeId);
    // Actualizar icono en sidebar si existe
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      const t = THEME.THEMES.find(x=>x.id===themeId)||THEME.THEMES[0];
      btn.textContent = t.icon;
      btn.title = 'Tema: ' + t.label;
    }
  },

  cycle() {
    const ids   = THEME.THEMES.map(t=>t.id);
    const curr  = THEME.current();
    const next  = ids[(ids.indexOf(curr)+1) % ids.length];
    THEME.apply(next);
    const t = THEME.THEMES.find(x=>x.id===next);
    UI.toast(`Tema: ${t.icon} ${t.label}`, 'info');
  },

  init() {
    THEME.apply(THEME.current());
    // Listener sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (THEME.current() === 'auto') THEME.apply('auto');
    });
  },

  renderPicker() {
    UI.openModal('🎨 Cambiar Tema', `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:8px">
        ${THEME.THEMES.map(t=>`
        <button onclick="THEME.apply('${t.id}');UI.closeModal()"
          style="padding:20px 12px;border:2px solid ${THEME.current()===t.id?'var(--amber)':'var(--border)'};
                 background:${THEME.current()===t.id?'var(--amber-dim)':'var(--surface2)'};
                 border-radius:8px;cursor:pointer;font-family:'Manrope',sans-serif;
                 color:${THEME.current()===t.id?'var(--amber)':'var(--text2)'};
                 display:flex;flex-direction:column;align-items:center;gap:8px">
          <span style="font-size:28px">${t.icon}</span>
          <span style="font-size:12px;font-weight:600">${t.label}</span>
          ${THEME.current()===t.id?'<span style="font-size:9px;opacity:.7">Activo</span>':''}
        </button>`).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      </div>
    `);
  }
};

// Iniciar tema al cargar
THEME.init();
