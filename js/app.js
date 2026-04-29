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
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('visible');
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
    const role  = Auth.user.rol;
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
        <div class="user-name">${Auth.user.nombre}</div>
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
      config:      Pages.config
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
  App.start();
}
