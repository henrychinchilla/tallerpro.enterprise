/* ═══════════════════════════════════════════════════════
   auth.js — Autenticación y sesión
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

const Auth = {
  user:   null,
  tenant: null,

  async login(tenantSlug, email, password) {
    const tenant = await DB.getTenant();
    if (!tenant) { UI.toast('Taller no encontrado', 'error'); return false; }
    Auth.tenant = tenant;
    Auth.user   = DEMO_USERS.admin;
    return true;
  },

  async quickLogin(role) {
    Auth.tenant = await DB.getTenant();
    Auth.user   = DEMO_USERS[role];
  },

  logout() {
    Auth.user   = null;
    Auth.tenant = null;
  },

  can(pageId) {
    const item = NAV.find(n => n.id === pageId);
    return item ? item.roles.includes(Auth.user?.rol) : false;
  }
};

/* ── HANDLERS GLOBALES ─────────────────────────────── */
async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  if (!email || !pass) { UI.toast('Completa todos los campos', 'error'); return; }
  const ok = await Auth.login('automotriz-torres', email, pass);
  if (ok) startApp();
}

async function quickLogin(role) {
  await Auth.quickLogin(role);
  startApp();
}

function logout() {
  Auth.logout();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
  App.destroyCharts();
}
