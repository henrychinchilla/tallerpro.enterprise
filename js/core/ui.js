/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/ui.js — Utilidades de interfaz
═══════════════════════════════════════════════════════ */

const UI = {

  /* ── TOAST ────────────────────────────────────── */
  toast(msg, tipo='success', duracion=3000) {
    const colores = {
      success: '#10B981', error: '#EF4444',
      warn: '#F59E0B', info: '#06B6D4'
    };
    const t = document.createElement('div');
    t.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;
      background:${colores[tipo]||colores.success};color:#000;
      padding:12px 20px;border-radius:10px;font-weight:600;
      font-size:13px;font-family:'Manrope',sans-serif;
      box-shadow:0 4px 20px rgba(0,0,0,0.3);
      animation:slideIn .25s ease;max-width:340px;
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duracion);
  },

  /* ── MODAL ────────────────────────────────────── */
  modal(titulo, contenido, ancho='520px') {
    document.getElementById('modal-overlay').classList.add('open');
    document.getElementById('modal-titulo').textContent = titulo;
    document.getElementById('modal-body').innerHTML = contenido;
    document.getElementById('modal-box').style.maxWidth = ancho;
  },

  cerrarModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  },

  /* ── CONFIRMAR ────────────────────────────────── */
  async confirmar(msg, accion) {
    return new Promise(resolve => {
      UI.modal('⚠️ Confirmar acción', `
        <div class="alert alert-amber" style="margin-bottom:16px">
          <div class="alert-icon">⚠️</div>
          <div class="alert-body">${msg}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.cerrarModal();_resolveConfirm(false)">Cancelar</button>
          <button class="btn btn-danger" onclick="UI.cerrarModal();_resolveConfirm(true)">${accion||'Confirmar'}</button>
        </div>`
      );
      window._resolveConfirm = resolve;
    });
  },

  /* ── FORMATOS ─────────────────────────────────── */
  q(n) {
    return 'Q' + (n||0).toLocaleString('es-GT', { minimumFractionDigits:2, maximumFractionDigits:2 });
  },

  fecha(f) {
    if (!f) return '—';
    return new Date(f+'T12:00:00').toLocaleDateString('es-GT');
  },

  fechaHora(f) {
    if (!f) return '—';
    return new Date(f).toLocaleString('es-GT');
  },

  /* ── BADGE ESTADO ─────────────────────────────── */
  badge(estado) {
    const e = ESTADOS_OT[estado] || { label:estado, color:'gray' };
    return `<span class="badge badge-${e.color}">${e.label}</span>`;
  },

  /* ── TOGGLE PASSWORD ──────────────────────────── */
  togglePass(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  },

  /* ── LOADER ───────────────────────────────────── */
  loading(el, msg='Cargando...') {
    if (!el) return;
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:12px">⏳</div>${msg}</div>`;
  }
};

/* Cerrar modal al click en overlay */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) UI.cerrarModal();
    });
  }
});
