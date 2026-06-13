/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/ui.js — Utilidades de interfaz
═══════════════════════════════════════════════════════ */

const UI = {

  /* ── TOAST ────────────────────────────────────── */
  toast(msg, tipo='success', duracion=3000) {
    const tipos = ['success', 'error', 'warn', 'info'];
    const t = document.createElement('div');
    t.className = `toast toast-${tipos.includes(tipo) ? tipo : 'success'}`;
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
    document.querySelector('#modal-box .modal-header')?.classList.remove('modal-header-ia');
  },

  cerrarModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  },

  /* Cierre "suave": si hay un formulario en el modal, NO cierra al hacer
     click afuera ni con Escape — evita perder lo escrito. Para cerrar de
     verdad se usan los botones Cancelar / ✕ (que llaman a cerrarModal). */
  intentarCerrarModal() {
    const body = document.getElementById('modal-body');
    const tieneForm = body && body.querySelector('input, textarea, select');
    if (tieneForm) {
      const box = document.getElementById('modal-box');
      if (box) { box.classList.remove('modal-shake'); void box.offsetWidth; box.classList.add('modal-shake'); }
      UI.toast('Guarda o cancela los cambios primero', 'warn');
      return;
    }
    UI.cerrarModal();
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

  /* ── ARCHIVO → BASE64 ─────────────────────────────
     Imágenes: se redimensionan a maxPx y se comprimen (JPEG).
     PDFs: se guardan tal cual si pesan ≤ maxPdfMB.
     Devuelve Promise<{ base64, nombre, esPdf }> o rechaza con mensaje. */
  fileABase64(file, { maxPx = 1000, calidad = 0.8, maxPdfMB = 2 } = {}) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Sin archivo'));
      const esPdf = file.type === 'application/pdf';
      if (!esPdf && !file.type.startsWith('image/')) return reject(new Error('Solo imágenes o PDF'));
      if (esPdf && file.size > maxPdfMB*1024*1024) return reject(new Error(`El PDF supera ${maxPdfMB}MB`));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.onload = ev => {
        if (esPdf) return resolve({ base64: ev.target.result, nombre: file.name, esPdf: true });
        const img = new Image();
        img.onerror = () => reject(new Error('Imagen inválida'));
        img.onload = () => {
          const esc = Math.min(1, maxPx / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width*esc); cv.height = Math.round(img.height*esc);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve({ base64: cv.toDataURL('image/jpeg', calidad), nombre: file.name, esPdf: false });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /* Ver un adjunto base64 (imagen en modal; PDF en pestaña nueva) */
  verAdjunto(base64, titulo='Adjunto') {
    if (!base64) return;
    if (base64.startsWith('data:application/pdf')) {
      const bin = atob(base64.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(()=>URL.revokeObjectURL(url), 60000);
      return;
    }
    UI.modal(titulo, `<img src="${base64}" style="max-width:100%;border-radius:8px">`, '640px');
  },

  /* ── LOADER ───────────────────────────────────── */
  loading(el, msg='Cargando...') {
    if (!el) return;
    el.innerHTML = `<div class="empty-state">
      <div class="spinner"></div>${msg}</div>`;
  },

  /* ── ERROR ────────────────────────────────────── */
  /* Muestra un toast de error y lo registra en consola con contexto.
     Útil para que los fallos de la capa de datos no pasen en silencio. */
  error(msg, err=null, contexto='') {
    if (err) console.error(`[${contexto||'error'}]`, err);
    UI.toast(msg || 'Ocurrió un error', 'error');
  },

  /* ── TARJETA KPI ──────────────────────────────────
     opts = { icon?, label, value, clase?='cyan', trend?, money?=false,
              destino?, delta?, spark?:[...] }
     - delta: variación % vs periodo anterior (número; signo define up/down)
     - spark: serie de valores numéricos para la mini gráfica */
  kpiCard({ icon, label, value, clase='cyan', trend='', money=false, destino, delta=null, spark=null, id='' }) {
    const clickable = destino ? `onclick="App.navegarA('${destino}')" style="cursor:pointer"` : '';
    const head = (icon || delta !== null) ? `
      <div class="kpi-card-head">
        ${icon ? `<div class="kpi-icon">${icon}</div>` : '<div></div>'}
        ${delta !== null ? (() => {
          const d = Number(delta) || 0;
          const dir = d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat';
          const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·';
          return `<span class="kpi-delta ${dir}">${arrow} ${Math.abs(d).toFixed(1)}%</span>`;
        })() : ''}
      </div>` : '';
    const sparkHtml = (spark && spark.length >= 2)
      ? `<div class="kpi-spark">${Charts.sparkline({ valores: spark, colorVar: clase })}</div>` : '';
    return `
      <div class="kpi-card ${clase}" ${clickable}>
        ${head}
        <div class="kpi-label">${label}</div>
        <div class="kpi-val ${clase}"${id ? ` id="${id}"` : ''}${typeof value==='number' ? ` data-count="${value}" data-money="${money?1:0}"` : ''}>${typeof value==='number' ? (money?UI.q(value):value) : value}</div>
        ${trend ? `<div class="kpi-trend">${trend}</div>` : ''}
        ${sparkHtml}
      </div>`;
  },

  /* ── ESTADO VACÍO ─────────────────────────────── */
  vacio(icono='📭', titulo='Sin datos', subtitulo='') {
    return `<div class="empty-state empty-state-lg">
      <div class="empty-state-icon">${icono}</div>
      <div style="font-weight:700;margin-bottom:4px">${titulo}</div>
      ${subtitulo ? `<div class="text-muted" style="font-size:12px">${subtitulo}</div>` : ''}
    </div>`;
  }
};

/* Cerrar modal al click en overlay */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) UI.intentarCerrarModal();
    });
  }
});

/* ── BOUNDARY GLOBAL DE ERRORES ─────────────────────
   Evita que los fallos pasen en silencio: cualquier promesa
   rechazada sin manejar muestra un aviso discreto y queda en consola. */
window.addEventListener('unhandledrejection', e => {
  const msg = e.reason?.message || String(e.reason || '');
  console.error('[unhandledrejection]', e.reason);
  /* Ignorar ruido conocido (extensiones, abortos de fetch) */
  if (/abort|cancell?ed|extension/i.test(msg)) return;
  if (window.UI) UI.toast('Algo falló. Revisa tu conexión e inténtalo de nuevo', 'error');
});

window.addEventListener('error', e => {
  if (e.error) console.error('[window.error]', e.error);
});

/* ── ORDENAMIENTO UNIVERSAL DE TABLAS ──────────────────
   Click en cualquier <th> de una .data-table ordena por esa
   columna (asc ⇄ desc). Detecta montos (Q1,234.56), números,
   porcentajes y fechas (dd/mm/yyyy o yyyy-mm-dd); el resto se
   ordena como texto. Las filas con colspan (estados vacíos,
   totales) se mantienen al final. Aplica a TODOS los módulos
   sin tocarlos: delegación global. */
UI._sortVal = (td) => {
  const t = (td?.textContent || '').trim();
  if (!t || t === '—') return { n: null, t: '' };
  const num = t.replace(/[Qq$%\s,]/g, '');
  if (num && !isNaN(num)) return { n: parseFloat(num), t };
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return { n: +(new Date(+m[3], +m[2] - 1, +m[1])), t };
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return { n: +(new Date(t.slice(0, 10))), t };
  return { n: null, t: t.toLowerCase() };
};

document.addEventListener('click', (e) => {
  const th = e.target.closest('.data-table th');
  if (!th || e.target.closest('button, a, input, select')) return;
  const table = th.closest('table');
  const tbody = table?.tBodies[0];
  if (!tbody || tbody.rows.length < 2) return;
  const idx = Array.prototype.indexOf.call(th.parentNode.children, th);

  const filas = Array.from(tbody.rows);
  /* columna de acciones (mayoría de celdas con botones): no ordenar */
  const conBtn = filas.filter(r => r.cells[idx]?.querySelector('button, .btn')).length;
  if (conBtn > filas.length / 2) return;

  const dir = th.classList.contains('th-asc') ? -1 : 1;
  table.querySelectorAll('th').forEach(h => h.classList.remove('th-asc', 'th-desc'));
  th.classList.add(dir === 1 ? 'th-asc' : 'th-desc');

  const fijas = [], movibles = [];
  for (const r of filas) {
    if (!r.cells[idx] || Array.from(r.cells).some(c => c.colSpan > 1)) fijas.push(r);
    else movibles.push(r);
  }
  movibles.sort((a, b) => {
    const va = UI._sortVal(a.cells[idx]), vb = UI._sortVal(b.cells[idx]);
    if (va.n !== null && vb.n !== null) return (va.n - vb.n) * dir;
    if (va.n !== null) return -1 * dir;
    if (vb.n !== null) return 1 * dir;
    return va.t.localeCompare(vb.t, 'es') * dir;
  });
  movibles.forEach(r => tbody.appendChild(r));
  fijas.forEach(r => tbody.appendChild(r));
});
