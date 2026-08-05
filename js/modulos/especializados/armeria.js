/* ═══════════════════════════════════════════════════════════════════════════
   NexusPro v3.0 — especializados/armeria.js
   Módulo vertical: Armería. Venta y compra de armas y municiones con los
   datos de cumplimiento que exige la Ley de Armas y Municiones de Guatemala.

   El texto literal de la ley vive en js/core/ley-armas.js y es la fuente de
   verdad de este módulo: los topes, los requisitos y los plazos salen de ahí,
   no de números escritos a mano acá.

   ⚠️ NOMBRE vs LEY: para el Decreto 15-2009 una "armería" es el taller que
   REPARA armas (art. 85) y tiene PROHIBIDO venderlas (art. 88). El negocio
   que vende es un "establecimiento de compraventa" (arts. 55-56). Este módulo
   cubre las dos cosas porque un negocio real suele tener ambas licencias,
   pero son trámites distintos ante DIGECAM y el módulo lo advierte.

   No usa Modulos._especialOT (proyecto con anticipo/estado): la venta de un
   arma no es un trabajo por fases sino una entrega regulada — sigue el patrón
   de venta_granos.js (lista única con tipo venta/compra).
   ═══════════════════════════════════════════════════════════════════════════ */
Modulos.armeria = {
  _data: [], _clientes: [], _proveedores: [], _inventario: [], _catalogo: null,
  _filtroTipo: '', _tab: 'operaciones',

  /* Las categorías siguen la clasificación de la Ley de Armas, porque de ella
     depende qué papeles hay que pedir. Meter todo como "arma" obligaba a
     pedir licencia para una pistola de balines, que la ley exime. */
  _CATEGORIAS: {
    pistola:        'Pistola',
    'revólver':     'Revólver',
    rifle:          'Rifle',
    escopeta:       'Escopeta',
    deportiva:      'Arma deportiva (art. 11)',
    gas_comprimido: 'Aire/gas comprimido ≤5.5mm (art. 68 — sin licencia)',
    arma_blanca:    'Arma blanca / navaja (art. 13)',
    'munición':     'Munición',
    accesorio:      'Accesorio / equipo',
  },
  _LICENCIAS: { tenencia: 'Tarjeta de tenencia', 'portación': 'Licencia de portación' },

  /* Armas de fuego: las únicas con número de serie registrable ante DIGECAM
     y las únicas que pasan por el trámite del art. 59. */
  _ARMAS_FUEGO: ['pistola', 'revólver', 'rifle', 'escopeta', 'deportiva'],
  /* Lo que exige licencia + DPI al venderlo: armas de fuego (art. 59) y
     munición (art. 60). El resto NO — art. 68 exime al gas comprimido, y
     el art. 13 no pide licencia para una navaja de uso personal. */
  _REQUIERE_LICENCIA: ['pistola', 'revólver', 'rifle', 'escopeta', 'deportiva', 'munición'],

  /* Estados del art. 59: vender un arma NO es entregarla. El vendedor remite
     documentación y arma a DIGECAM, que en ≤5 días hábiles devuelve la
     autorización de entrega y la tarjeta de tenencia. */
  _ESTADOS: {
    documentos_recibidos: 'Documentos recibidos',
    enviado_digecam:      'Enviado a DIGECAM',
    autorizado:           'Autorizado para entrega',
    entregado:            'Entregado',
    cancelado:            'Cancelado',
  },
  _colorEstado(e) {
    return { documentos_recibidos:'gray', enviado_digecam:'amber', autorizado:'cyan',
             entregado:'green', cancelado:'red' }[e] || 'gray';
  },

  /* Solo el arma de fuego lleva número de serie registrable. */
  _esArma(categoria) { return this._ARMAS_FUEGO.includes(categoria); },
  _requiereLicencia(categoria) { return this._REQUIERE_LICENCIA.includes(categoria); },

  /* Aviso legal por categoría — lo que el vendedor tiene que saber ANTES de
     cerrar la venta, no después de una inspección. */
  _avisoCategoria(categoria) {
    return {
      gas_comprimido: '✅ Art. 68: tenencia sin registro y traslado sin licencia, siempre que la munición no pase de 5.5mm (.22). Si pasa de ahí, deja de estar exenta.',
      arma_blanca:    '⚠️ Art. 13: la navaja de bolsillo con hoja ≤10cm es de uso personal. Las navajas AUTOMÁTICAS de cualquier longitud son de uso bélico y están prohibidas a particulares (art. 13 c). Las de hoja >10cm no automáticas sólo se usan en áreas extraurbanas.',
      deportiva:      'ℹ️ Art. 11: arma deportiva (competencia o cacería). Es arma de fuego: lleva número de serie y el trámite del art. 59.',
      'munición':     '⚠️ Art. 60: sólo del calibre registrado en la licencia del comprador, con tope mensual, y la factura debe llevar su NIT, dirección y firma.',
      accesorio:      '',
    }[categoria] || '';
  },

  /* Tope mensual de munición — art. 60, vía ley-armas.js. Son 250 por CADA
     arma registrada en la licencia de portación (art. 72: hasta 3), o 200 con
     registro de tenencia. */
  _limiteMunicionMes(tipoLicencia, armasRegistradas = 1) {
    return (typeof topeMunicionMensual === 'function')
      ? topeMunicionMensual(tipoLicencia, armasRegistradas)
      : 0;
  },

  /* Validación pura (sin DOM), para poder probarla sin levantar un modal.
     Refleja EXACTAMENTE lo que exige la migración (constraints de la BD);
     así el usuario ve el error claro en vez de un 23514 genérico de Postgres. */
  _validar(f) {
    if (!['venta', 'compra'].includes(f.tipo)) return { ok: false, error: 'Tipo de operación inválido' };
    if (f.tipo === 'venta' && !f.cliente_id) return { ok: false, error: 'Selecciona el cliente que compra' };
    if (f.tipo === 'compra' && !f.cliente_id && !f.proveedor_id) return { ok: false, error: 'Selecciona a quién se le compra (cliente o proveedor)' };
    if (!f.categoria) return { ok: false, error: 'Selecciona la categoría del artículo' };
    if (this._esArma(f.categoria) && !String(f.numero_serie || '').trim()) {
      return { ok: false, error: 'El número de serie es obligatorio en armas de fuego — sin él no se puede registrar la venta ante DIGECAM (y el art. 82 g) prohíbe las armas sin número de registro)' };
    }
    /* Sólo armas de fuego y munición piden licencia+DPI. El gas comprimido
       ≤5.5mm está exento por el art. 68 y una navaja de uso personal por el
       art. 13 — pedirles papeles sería inventar un requisito. */
    if (f.tipo === 'venta' && this._requiereLicencia(f.categoria)) {
      if (!String(f.contraparte_licencia_num || '').trim()) {
        return { ok: false, error: 'Para vender armas de fuego o munición hay que registrar la tarjeta de tenencia o licencia de portación del comprador (art. 59 para armas; art. 60 para munición)' };
      }
      if (!String(f.contraparte_dpi || '').trim()) {
        return { ok: false, error: 'El DPI del comprador es obligatorio en venta de armas de fuego o munición (art. 59: fotocopia legalizada del documento de identificación personal)' };
      }
    }
    /* Art. 60: la factura de munición debe llevar además dirección y NIT. */
    if (f.tipo === 'venta' && f.categoria === 'munición') {
      if (!String(f.contraparte_nit || '').trim() || !String(f.contraparte_direccion || '').trim()) {
        return { ok: false, error: 'El art. 60 exige que la factura de munición lleve el NIT y la dirección del comprador — regístralos antes de guardar' };
      }
    }
    if (!(Number(f.cantidad) > 0)) return { ok: false, error: 'La cantidad debe ser mayor a cero' };
    if (Number(f.precio_unit) < 0) return { ok: false, error: 'El precio no puede ser negativo' };
    return { ok: true };
  },

  _colorTipo(t) { return t === 'compra' ? 'purple' : 'cyan'; },

  _tabsHTML() {
    const b = (tab, txt) => `<button class="btn btn-sm ${this._tab === tab ? 'btn-cyan' : 'btn-ghost'}" onclick="Modulos.armeria._irTab('${tab}')">${txt}</button>`;
    return `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      ${b('operaciones', '🎯 Operaciones')}${b('ley', '⚖️ Ley de Armas y Municiones')}
    </div>`;
  },

  _irTab(tab) {
    this._tab = tab;
    return tab === 'ley' ? this.renderLey() : this.render(this._filtroTipo);
  },

  async render(filtroTipo = '') {
    if (this._tab === 'ley') return this.renderLey();
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroTipo = filtroTipo;
    [this._data, this._clientes, this._proveedores, this._inventario] = await Promise.all([
      DB.getArmeriaOperaciones(filtroTipo ? { tipo: filtroTipo } : {}),
      DB.getClientes(),
      DB.getProveedores(),
      DB.getInventarioArmeria().catch(() => []),
    ]);

    const ventas = this._data.filter(o => o.tipo === 'venta');
    const compras = this._data.filter(o => o.tipo === 'compra');
    const ingresoVentas = ventas.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const pendientesDigecam = this._data.filter(o => !o.notificado_digecam).length;
    const enTramite = this._data.filter(o => ['documentos_recibidos', 'enviado_digecam', 'autorizado'].includes(o.estado)).length;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🎯 Armería</h1>
        <p class="page-subtitle">// ${this._data.length} operaciones registradas</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.inventario.abrirGiro('armeria')" title="Ver y cargar sólo los artículos de este giro">📦 Inventario de armería</button>
          <button class="btn btn-ghost" onclick="Modulos.armeria.imprimirLibro()">🖨️ Libro de registro</button>
          <button class="btn btn-amber" onclick="Modulos.armeria.modalForm()">＋ Nueva Operación</button>
        </div>
      </div>
      <div class="page-body">
        ${this._tabsHTML()}
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon: '🔺', clase: 'cyan', label: 'Ventas', value: ventas.length })}
          ${UI.kpiCard({ icon: '🔽', clase: 'purple', label: 'Compras', value: compras.length })}
          ${UI.kpiCard({ icon: '💰', clase: 'green', label: 'Ingreso en ventas', value: ingresoVentas, money: true })}
          ${UI.kpiCard({ icon: enTramite ? '⏳' : '✅', clase: enTramite ? 'amber' : 'green', label: 'Armas en trámite DIGECAM', value: enTramite })}
        </div>
        <div style="background:var(--card2);border-left:3px solid var(--amber);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px">
          ⚖️ Este módulo lleva el control interno de cumplimiento. <b>No sustituye el registro en el sistema de DIGECAM</b>
          (art. 56: el establecimiento debe estar conectado en línea al sistema informático de DIGECAM).
          ${pendientesDigecam ? `<b style="color:var(--red)"> · ${pendientesDigecam} operación(es) sin marcar como notificadas.</b>` : ''}
          Consulta la ley en la pestaña <a href="#" onclick="event.preventDefault();Modulos.armeria._irTab('ley')" style="color:var(--cyan)">⚖️ Ley de Armas y Municiones</a>.
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroTipo ? 'btn-cyan' : 'btn-ghost'}" onclick="Modulos.armeria.render('')">Todas</button>
          <button class="btn btn-sm ${filtroTipo === 'venta' ? 'btn-cyan' : 'btn-ghost'}" onclick="Modulos.armeria.render('venta')">🔺 Ventas</button>
          <button class="btn btn-sm ${filtroTipo === 'compra' ? 'btn-cyan' : 'btn-ghost'}" onclick="Modulos.armeria.render('compra')">🔽 Compras</button>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Tipo</th><th>Contraparte</th><th>Artículo</th><th>Serie</th><th>Total</th><th>Trámite</th><th>DIGECAM</th><th>Fecha</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(o => `<tr>
              <td class="mono-sm"><b>${o.num || '—'}</b></td>
              <td><span class="badge badge-${this._colorTipo(o.tipo)}">${o.tipo === 'compra' ? '🔽 Compra' : '🔺 Venta'}</span></td>
              <td>${o.clientes?.nombre || o.proveedores?.nombre || '—'}</td>
              <td><span class="badge badge-gray">${this._CATEGORIAS[o.categoria] || o.categoria}</span><div style="font-size:11px;color:var(--text3)">${[o.marca, o.modelo, o.calibre].filter(Boolean).join(' · ') || '—'}</div></td>
              <td class="mono-sm">${o.numero_serie || '—'}${o.inventario_id ? '<div style="font-size:10px;color:var(--green)">📦 del inventario</div>' : ''}</td>
              <td class="mono-sm" style="font-weight:700">${UI.q(o.total)}</td>
              <td><span class="badge badge-${this._colorEstado(o.estado)}">${this._ESTADOS[o.estado] || o.estado || '—'}</span></td>
              <td>${o.notificado_digecam
                ? `<span class="badge badge-green" title="${o.folio_notificacion_digecam ? 'Folio ' + o.folio_notificacion_digecam : ''}">✅ Notificado</span>`
                : `<button class="btn btn-sm btn-ghost" onclick="Modulos.armeria._accionNotificar('${o.id}')" title="Marcar como notificado a DIGECAM">⚠️ Pendiente</button>`}</td>
              <td class="mono-sm">${UI.fecha(o.fecha)}</td>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                ${Modulos.btnAccion('ver', `Modulos.armeria.verDetalle('${o.id}')`)}
                ${Modulos.btnAccion('editar', `Modulos.armeria.modalForm('${o.id}')`)}
                ${Modulos.btnAccion('eliminar', `Modulos.armeria.eliminar('${o.id}')`)}
              </div></td>
            </tr>`).join('') || '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3)">Sin operaciones. Registra la primera con "＋ Nueva Operación".</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  /* ── Consulta de la ley dentro de la app ─────────────────────────────────
     Henry pidió poder consultar la ley sin salir del sistema. El texto es
     literal (ver js/core/ley-armas.js), no un resumen. */
  _busquedaLey: '',

  renderLey() {
    const el = document.getElementById('page-content');
    const ley = window.LEY_ARMAS;
    if (!ley) { el.innerHTML = '<div class="page-body">No se pudo cargar el texto de la ley.</div>'; return; }
    const arts = (typeof buscarLeyArmas === 'function') ? buscarLeyArmas(this._busquedaLey) : ley.articulos;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">⚖️ ${ley.nombre}</h1>
        <p class="page-subtitle">// ${ley.decreto} · reglamento: ${ley.reglamento}</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="window.print()">🖨 Imprimir</button>
          <button class="btn btn-amber" onclick="Modulos.armeria._irTab('operaciones')">← Volver a operaciones</button>
        </div>
      </div>
      <div class="page-body">
        ${this._tabsHTML()}
        <div style="background:var(--card2);border-left:3px solid var(--cyan);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px">
          📖 Texto <b>literal</b> de los artículos que le tocan a un negocio de armas. Se incluyen los artículos
          aplicables al mostrador, no la ley completa (151 artículos).
          <div style="margin-top:6px;color:var(--text3)">
            ⚠️ Para la ley completa y sus reformas, consultá la fuente oficial: Congreso de la República
            (congreso.gob.gt) y DIGECAM (digecam.mil.gt). Esta consulta es de apoyo, no sustituye asesoría legal.
          </div>
        </div>
        <input class="form-input" id="ley-busca" style="margin-bottom:14px"
               placeholder="🔍 Buscar por número de artículo, título o texto (ej. 'munición', '60', 'portación')..."
               value="${UI.esc(this._busquedaLey)}"
               oninput="Modulos.armeria._buscarLey(this.value)">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
          <button class="btn btn-sm ${!this._busquedaLey ? 'btn-cyan' : 'btn-ghost'}" onclick="Modulos.armeria._buscarLey('')">Todos</button>
          ${Object.entries(ley.temas).map(([k, t]) =>
            `<button class="btn btn-sm btn-ghost" onclick="Modulos.armeria._buscarLeyTema('${k}')">${t.icon} ${t.label}</button>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:10px">${arts.length} artículo(s)</div>
        ${arts.map(a => `
          <div class="card" style="margin-bottom:12px;padding:14px">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;flex-wrap:wrap">
              <span class="badge badge-${a.clave ? 'amber' : 'gray'}">Artículo ${a.num}</span>
              <b style="font-size:14px">${UI.esc(a.titulo)}</b>
              ${a.clave ? '<span style="font-size:11px;color:var(--amber)">⭐ de uso diario</span>' : ''}
              <span style="font-size:11px;color:var(--text3);margin-left:auto">${ley.temas[a.tema]?.icon || ''} ${ley.temas[a.tema]?.label || a.tema}</span>
            </div>
            <div style="white-space:pre-wrap;font-size:13px;line-height:1.6">${UI.esc(a.texto)}</div>
          </div>`).join('') || '<div style="color:var(--text3);padding:20px;text-align:center">Sin resultados para esa búsqueda.</div>'}
      </div>`;
    const inp = document.getElementById('ley-busca');
    if (inp && this._busquedaLey) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  },

  _buscarLey(q) { this._busquedaLey = q; this.renderLey(); },
  _buscarLeyTema(tema) {
    const t = window.LEY_ARMAS?.temas?.[tema];
    this._busquedaLey = '';
    this.renderLey();
    /* Filtra por tema sin pasar por el buscador de texto (el tema no siempre
       aparece escrito en el artículo). */
    const arts = window.LEY_ARMAS.articulos.filter(a => a.tema === tema);
    const el = document.getElementById('page-content');
    const cont = el.querySelector('.page-body');
    if (!cont || !arts.length) return;
    const ley = window.LEY_ARMAS;
    cont.innerHTML = cont.innerHTML.split('<div style="font-size:12px;color:var(--text3);margin-bottom:10px">')[0] +
      `<div style="font-size:12px;color:var(--text3);margin-bottom:10px">${t.icon} ${t.label} — ${arts.length} artículo(s)</div>` +
      arts.map(a => `
        <div class="card" style="margin-bottom:12px;padding:14px">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <span class="badge badge-${a.clave ? 'amber' : 'gray'}">Artículo ${a.num}</span>
            <b style="font-size:14px">${UI.esc(a.titulo)}</b>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">${ley.temas[a.tema]?.icon || ''} ${ley.temas[a.tema]?.label || a.tema}</span>
          </div>
          <div style="white-space:pre-wrap;font-size:13px;line-height:1.6">${UI.esc(a.texto)}</div>
        </div>`).join('');
  },

  async verDetalle(id) {
    const o = this._data.find(x => x.id === id); if (!o) return;
    const item = o.inventario_id ? this._inventario.find(i => i.id === o.inventario_id) : null;
    const invNombre = o.inventario_id ? (item?.nombre || 'artículo del inventario') : null;
    UI.modal(`📋 Operación ${o.num || ''}`, `
      ${item ? this._fichaInventarioHTML(item) : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div style="font-size:11px;color:var(--text3)">Tipo</div><div><span class="badge badge-${this._colorTipo(o.tipo)}">${o.tipo === 'compra' ? '🔽 Compra' : '🔺 Venta'}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Estado del trámite</div><div><span class="badge badge-${this._colorEstado(o.estado)}">${this._ESTADOS[o.estado] || o.estado || '—'}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Contraparte</div><div style="font-weight:700">${o.clientes?.nombre || o.proveedores?.nombre || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Categoría</div><div>${this._CATEGORIAS[o.categoria] || o.categoria}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Marca / Modelo / Calibre</div><div>${[o.marca, o.modelo, o.calibre].filter(Boolean).join(' · ') || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Número de serie</div><div class="mono-sm">${o.numero_serie || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Trazabilidad</div><div>${invNombre ? `📦 ${UI.esc(invNombre)}` : '<span style="color:var(--amber)">sin vincular al inventario</span>'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">País de origen</div><div>${o.pais_origen || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Cantidad</div><div>${o.cantidad}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Total</div><div style="font-weight:700;color:var(--green)">${UI.q(o.total)}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">DPI</div><div class="mono-sm">${o.contraparte_dpi || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">NIT</div><div class="mono-sm">${o.contraparte_nit || '—'}</div></div>
        <div style="grid-column:1/-1"><div style="font-size:11px;color:var(--text3)">Dirección</div><div>${o.contraparte_direccion || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Licencia de la contraparte</div><div>${o.contraparte_licencia_tipo ? `${this._LICENCIAS[o.contraparte_licencia_tipo]} · ${o.contraparte_licencia_num || '—'}${o.contraparte_licencia_vencimiento ? ' · vence ' + UI.fecha(o.contraparte_licencia_vencimiento) : ''}` : '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Armas en la licencia</div><div>${o.contraparte_armas_registradas || 1} (tope munición: ${this._limiteMunicionMes(o.contraparte_licencia_tipo, o.contraparte_armas_registradas)}/mes)</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Foto / Huella en el local</div><div>${o.foto_tomada ? '📷 sí' : '📷 no'} · ${o.huella_tomada ? '👆 sí' : '👆 no'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">DIGECAM</div><div>${o.notificado_digecam ? `✅ Notificado${o.fecha_notificacion_digecam ? ' el ' + UI.fecha(o.fecha_notificacion_digecam) : ''}${o.folio_notificacion_digecam ? ' · folio ' + o.folio_notificacion_digecam : ''}` : '⚠️ Pendiente de notificar'}</div></div>
      </div>
      ${o.notas ? `<div style="background:var(--card2);padding:10px;border-radius:6px;margin-bottom:12px;font-size:13px">${UI.esc(o.notas)}</div>` : ''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${!o.notificado_digecam ? `<button class="btn btn-cyan" onclick="UI.cerrarModal();Modulos.armeria._accionNotificar('${o.id}')">⚠️ Marcar notificado</button>` : ''}
        <button class="btn btn-amber" onclick="UI.cerrarModal();Modulos.armeria.modalForm('${o.id}')">✏️ Editar</button>
      </div>`, '680px');
  },

  async modalForm(id = null) {
    const o = id ? this._data.find(x => x.id === id) || {} : {};
    if (!this._clientes.length) this._clientes = await DB.getClientes();
    if (!this._proveedores.length) this._proveedores = await DB.getProveedores();
    if (!this._inventario.length) this._inventario = await DB.getInventarioArmeria().catch(() => []);
    if (!this._catalogo) this._catalogo = await DB.getCatalogoArmeria().catch(() => ({}));
    const cat = this._catalogo || {};
    const esEdicion = !!id;
    const tipo = o.tipo || 'venta';

    UI.modal(`${esEdicion ? '✏️ Editar' : '＋ Nueva'} Operación de Armería`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo de operación *</label>
          <select class="form-select" id="arm-tipo" onchange="Modulos.armeria._toggleContraparte()">
            <option value="venta" ${tipo === 'venta' ? 'selected' : ''}>🔺 Venta a cliente</option>
            <option value="compra" ${tipo === 'compra' ? 'selected' : ''}>🔽 Compra (particular o proveedor)</option>
          </select></div>
        <div class="form-group"><label class="form-label">Categoría *</label>
          <select class="form-select" id="arm-categoria" onchange="Modulos.armeria._toggleSerie()">
            <option value="">— Selecciona —</option>
            ${Object.entries(this._CATEGORIAS).map(([k, l]) => `<option value="${k}" ${o.categoria === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Estado del trámite</label>
          <select class="form-select" id="arm-estado">
            ${Object.entries(this._ESTADOS).map(([k, l]) => `<option value="${k}" ${(o.estado || 'entregado') === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <div style="font-size:10.5px;color:var(--text3);margin-top:2px">Art. 59: un arma se remite a DIGECAM y sólo se entrega con su autorización (≤5 días hábiles).</div></div>
      </div>
      <div class="form-row" id="arm-grupo-cliente">
        <div class="form-group"><label class="form-label">Cliente ${tipo === 'venta' ? '*' : '(si el vendedor es particular)'}</label>
          <select class="form-select" id="arm-cliente" onchange="Modulos.armeria._verificarCliente(this.value)">
            <option value="">— Selecciona —</option>
            ${this._clientes.map(c => `<option value="${c.id}" ${o.cliente_id === c.id ? 'selected' : ''}>${UI.esc(c.nombre)}</option>`).join('')}
          </select>
          <div style="font-size:10.5px;color:var(--text3);margin-top:2px">¿Cliente nuevo? <a href="#" onclick="event.preventDefault();Modulos.armeria._nuevoCliente()" style="color:var(--cyan)">Crearlo aquí</a> con su DPI, licencia y recibo de servicios.</div>
          <div id="arm-cliente-check" style="font-size:11px;margin-top:6px"></div></div>
        <div class="form-group" id="arm-grupo-proveedor" style="${tipo === 'venta' ? 'display:none' : ''}"><label class="form-label">Proveedor (si es compra a mayorista)</label>
          <select class="form-select" id="arm-proveedor">
            <option value="">— Selecciona —</option>
            ${this._proveedores.map(p => `<option value="${p.id}" ${o.proveedor_id === p.id ? 'selected' : ''}>${UI.esc(p.nombre)}</option>`).join('')}
          </select></div>
      </div>

      <div class="form-group" style="background:var(--card2);border-radius:8px;padding:10px 12px">
        <label class="form-label">📦 Artículo del inventario (trazabilidad)</label>
        <select class="form-select" id="arm-inventario" onchange="Modulos.armeria._desdeInventario(this.value)">
          <option value="">— Sin vincular (se teclea a mano) —</option>
          ${this._inventario.map(i => `<option value="${i.id}" ${o.inventario_id === i.id ? 'selected' : ''}>${UI.esc(i.nombre)} · stock ${i.stock} ${UI.esc(i.unidad_medida || '')}</option>`).join('')}
        </select>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Vincular la operación al artículo hace que el <b>stock se mueva solo</b> y que el arma se pueda rastrear
          desde que entró hasta quién se la llevó. El art. 58 exige que el inventario físico cuadre exacto:
          una diferencia sin aclarar en 8 días cierra el establecimiento 15 días.
          ${this._inventario.length ? '' : '<br><b style="color:var(--amber)">Todavía no hay artículos del giro armería en el inventario.</b>'}
        </div>
        <div id="arm-ficha-inv"></div>
        <div id="arm-aviso-stock"></div>
      </div>

      <div id="arm-aviso-categoria" style="font-size:12px;padding:8px 10px;border-radius:6px;margin-bottom:10px;display:none"></div>

      <div class="form-row">
        <div class="form-group"><label class="form-label">Marca</label>
          <input class="form-input" id="arm-marca" list="arm-dl-marca" value="${UI.esc(o.marca || '')}"
                 placeholder="Escribe o elige — si no está, se agrega" oninput="Modulos.armeria._filtrarModelos()">
          <datalist id="arm-dl-marca">${(cat.marca || []).map(v => `<option value="${UI.esc(v)}">`).join('')}</datalist></div>
        <div class="form-group"><label class="form-label">Modelo</label>
          <input class="form-input" id="arm-modelo" list="arm-dl-modelo" value="${UI.esc(o.modelo || '')}" placeholder="Escribe o elige">
          <datalist id="arm-dl-modelo">${this._opcionesModelo(o.marca).map(v => `<option value="${UI.esc(v)}">`).join('')}</datalist>
          <div id="arm-modelo-hint" style="font-size:10.5px;color:var(--text3);margin-top:2px"></div></div>
        <div class="form-group"><label class="form-label">Calibre</label>
          <input class="form-input" id="arm-calibre" list="arm-dl-calibre" value="${UI.esc(o.calibre || '')}" placeholder="Escribe o elige">
          <datalist id="arm-dl-calibre">${(cat.calibre || []).map(v => `<option value="${UI.esc(v)}">`).join('')}</datalist>
          <div style="font-size:10.5px;color:var(--text3);margin-top:2px">Art. 60: sólo se vende munición del calibre registrado en la licencia del comprador.</div></div>
      </div>
      <div class="form-row">
        <div class="form-group" id="arm-grupo-serie"><label class="form-label">Número de serie <span id="arm-serie-req" style="color:var(--red)">${this._esArma(o.categoria) ? '*' : ''}</span></label>
          <input class="form-input" id="arm-serie" value="${UI.esc(o.numero_serie || '')}"
            style="font-family:monospace" placeholder="Obligatorio en armas de fuego">
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Art. 82 g): están prohibidas las armas sin número de registro o con el registro borrado/alterado.</div></div>
        <div class="form-group"><label class="form-label">País de origen</label>
          <input class="form-input" id="arm-origen" list="arm-dl-pais" value="${UI.esc(o.pais_origen || '')}" placeholder="Escribe o elige">
          <datalist id="arm-dl-pais">${(cat.pais || []).map(v => `<option value="${UI.esc(v)}">`).join('')}</datalist></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin:-4px 0 10px">
        💡 Marca, modelo, calibre y país salen de un catálogo que crece solo: si escribís uno que no está, queda guardado para la próxima.
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cantidad *</label>
          <input class="form-input" id="arm-cantidad" type="number" min="1" step="1" value="${o.cantidad || 1}" onchange="Modulos.armeria._calcTotal()" oninput="Modulos.armeria._avisoStock()"></div>
        <div class="form-group"><label class="form-label">Precio unitario (Q) *</label>
          <input class="form-input" id="arm-precio" type="number" min="0" step="0.01" value="${o.precio_unit || 0}" onchange="Modulos.armeria._calcTotal()"></div>
        <div class="form-group"><label class="form-label">Total (Q)</label>
          <input class="form-input" id="arm-total" type="number" readonly value="${o.total || 0}" style="background:var(--card2);font-weight:700"></div>
      </div>
      <div style="background:var(--card2);border-radius:8px;padding:10px 12px;margin:8px 0">
        <div id="arm-bloque-licencia" style="font-size:12px;font-weight:700;margin-bottom:8px">⚖️ Datos del comprador/vendedor que exige la ley</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">DPI</label>
            <input class="form-input" id="arm-dpi" value="${UI.esc(o.contraparte_dpi || '')}" placeholder="0000 00000 0000" style="font-family:monospace"></div>
          <div class="form-group"><label class="form-label">NIT</label>
            <input class="form-input" id="arm-nit" value="${UI.esc(o.contraparte_nit || '')}" placeholder="Art. 60 (munición)"></div>
          <div class="form-group"><label class="form-label">Dirección</label>
            <input class="form-input" id="arm-direccion" value="${UI.esc(o.contraparte_direccion || '')}" placeholder="Art. 60 (munición)"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Licencia presentada</label>
            <select class="form-select" id="arm-lic-tipo" onchange="Modulos.armeria._infoTope()">
              <option value="">— Ninguna (solo accesorios) —</option>
              ${Object.entries(this._LICENCIAS).map(([k, l]) => `<option value="${k}" ${o.contraparte_licencia_tipo === k ? 'selected' : ''}>${l}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Número de licencia</label>
            <input class="form-input" id="arm-lic-num" value="${UI.esc(o.contraparte_licencia_num || '')}"></div>
          <div class="form-group"><label class="form-label">Vence</label>
            <input class="form-input" id="arm-lic-vence" type="date" value="${o.contraparte_licencia_vencimiento || ''}"></div>
          <div class="form-group"><label class="form-label">Armas en la licencia</label>
            <select class="form-select" id="arm-armas-reg" onchange="Modulos.armeria._infoTope()">
              ${[1, 2, 3].map(n => `<option value="${n}" ${(o.contraparte_armas_registradas || 1) === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select></div>
        </div>
        <div id="arm-tope-info" style="font-size:11px;color:var(--cyan);margin-top:6px"></div>
        <div style="display:flex;gap:16px;margin-top:6px">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="arm-foto" ${o.foto_tomada ? 'checked' : ''}> Foto tomada en el local</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="arm-huella" ${o.huella_tomada ? 'checked' : ''}> Huella tomada en el local</label>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Forma de pago</label>
          <select class="form-select" id="arm-forma">
            <option value="efectivo" ${(o.forma_pago || 'efectivo') === 'efectivo' ? 'selected' : ''}>💵 Efectivo</option>
            <option value="tarjeta" ${o.forma_pago === 'tarjeta' ? 'selected' : ''}>💳 Tarjeta</option>
            <option value="transferencia" ${o.forma_pago === 'transferencia' ? 'selected' : ''}>🏦 Transferencia</option>
          </select></div>
        <div class="form-group"><label class="form-label">Fecha</label>
          <input class="form-input" id="arm-fecha" type="date" value="${(o.fecha || new Date().toISOString()).slice(0, 10)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="arm-notas" rows="2">${UI.esc(o.notas || '')}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.armeria.guardar('${id || ''}')">${esEdicion ? 'Guardar Cambios' : 'Crear Operación'}</button>
      </div>`, '820px');
    this._infoTope();
    this._toggleSerie();   // pinta el aviso legal de la categoría ya elegida
    this._filtrarModelos();
    /* Al editar una operación ya vinculada, la ficha se pinta de una vez
       (sin volver a copiar los datos: los de la operación ya son los buenos). */
    if (o.inventario_id) {
      const it = this._inventario.find(i => i.id === o.inventario_id);
      const cont = document.getElementById('arm-ficha-inv');
      if (it && cont) cont.innerHTML = this._fichaInventarioHTML(it);
      this._avisoStock();
    }
    if (o.cliente_id) this._verificarCliente(o.cliente_id);
  },

  /* Ficha visual del artículo: foto + características, para confirmar de un
     vistazo que se está entregando el arma correcta. En un negocio donde dos
     pistolas de la misma marca se distinguen sólo por el número de serie,
     ver la foto antes de entregar evita el error más caro posible. */
  _fichaInventarioHTML(it) {
    if (!it) return '';
    const a = it.atributos || {};
    const specs = [
      ['Tipo', this._CATEGORIAS[a.tipo_arma] || a.tipo_arma],
      ['Marca', a.marca || it.marca], ['Modelo', a.modelo], ['Calibre', a.calibre],
      ['Color', a.color], ['Acabado', a.acabado], ['Material', a.material],
      /* Largo del cañón: lo lleva la tarjeta de tenencia (art. 63) y la
         solicitud de portación (art. 72). El cliente lo va a necesitar. */
      ['Cañón', a.largo_canon ? `${a.largo_canon}"` : null],
      ['Capacidad', a.capacidad_cargador ? `${a.capacidad_cargador} cartuchos` : null],
      ['Conversiones', a.conversiones_calibre],
      ['Origen', a.pais_origen], ['Categoría', it.categoria],
      ['Ubicación', it.ubicacion],
    ].filter(([, v]) => v);

    const stock = Number(it.stock) || 0;
    const esArmaFuego = this._ARMAS_FUEGO.includes(a.tipo_arma);
    const foto = it.imagen_url
      ? `<img src="${UI.esc(it.imagen_url)}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid var(--border);flex-shrink:0">`
      : `<div style="width:96px;height:96px;border-radius:8px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:32px;color:var(--text3);flex-shrink:0">🎯</div>`;

    return `<div style="display:flex;gap:12px;background:var(--card2);border-radius:8px;padding:10px 12px;margin-top:8px">
      ${foto}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px">${UI.esc(it.nombre)}</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px">
          ${UI.esc(it.codigo || '')}${it.codigo_barras ? ' · ' + UI.esc(it.codigo_barras) : ''}
        </div>
        ${it.descripcion ? `<div style="font-size:12px;margin-bottom:6px">${UI.esc(it.descripcion)}</div>` : ''}
        <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px">
          ${specs.map(([k, v]) => `<span><span style="color:var(--text3)">${k}:</span> <b>${UI.esc(v)}</b></span>`).join('')}
        </div>
        <div style="margin-top:6px;font-size:12px">
          <span class="badge badge-${stock > 0 ? 'green' : 'red'}">Stock: ${stock} ${UI.esc(it.unidad_medida || '')}</span>
          <span style="margin-left:8px;color:var(--green);font-weight:700">${UI.q(it.precio_venta)}</span>
        </div>
        ${a.numero_serie ? `<div style="font-size:11px;margin-top:6px;font-family:monospace">Serie en ficha: ${UI.esc(a.numero_serie)}</div>` : ''}
        ${esArmaFuego && stock > 1 ? `<div style="font-size:11px;color:var(--amber);margin-top:4px">
          ⚠️ Hay ${stock} unidades de este modelo: cada arma tiene su PROPIO número de serie.
          Verificá el de la que estás entregando y corregilo abajo si no coincide.
        </div>` : ''}
      </div>
    </div>`;
  },

  /* Copia los datos del artículo del inventario al formulario y muestra su
     ficha. El arma se describe una sola vez (al darla de alta) y de ahí en
     adelante se reusa. */
  _desdeInventario(invId) {
    const cont = document.getElementById('arm-ficha-inv');
    if (!invId) { if (cont) { cont.innerHTML = ''; } this._avisoStock(); return; }
    const it = this._inventario.find(i => i.id === invId);
    if (!it) return;
    const a = it.atributos || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== '') el.value = v; };
    set('arm-marca', a.marca || it.marca); set('arm-modelo', a.modelo); set('arm-calibre', a.calibre);
    set('arm-serie', a.numero_serie); set('arm-origen', a.pais_origen);
    set('arm-precio', it.precio_venta);
    const cat = document.getElementById('arm-categoria');
    if (cat && !cat.value && a.tipo_arma && this._CATEGORIAS[a.tipo_arma]) { cat.value = a.tipo_arma; }
    if (cont) cont.innerHTML = this._fichaInventarioHTML(it);
    this._toggleSerie();
    this._filtrarModelos();
    this._calcTotal();
  },

  /* Avisa si se está vendiendo más de lo que hay. No bloquea: puede haber
     un ingreso que todavía no se registró. Pero el art. 58 exige que el
     inventario cuadre exacto, así que dejarlo pasar en silencio sería peor. */
  _avisoStock() {
    const cont = document.getElementById('arm-aviso-stock');
    if (!cont) return;
    const invId = document.getElementById('arm-inventario')?.value;
    const tipo = document.getElementById('arm-tipo')?.value;
    const cant = parseFloat(document.getElementById('arm-cantidad')?.value) || 0;
    const it = invId ? this._inventario.find(i => i.id === invId) : null;
    if (!it || tipo !== 'venta' || cant <= 0) { cont.innerHTML = ''; return; }
    const stock = Number(it.stock) || 0;
    cont.innerHTML = cant > stock
      ? `<div style="background:var(--card2);border-left:3px solid var(--red);border-radius:6px;padding:8px 10px;font-size:12px;margin-top:6px">
           ⚠️ Estás vendiendo <b>${cant}</b> pero en inventario hay <b>${stock}</b>.
           El art. 58 exige que el inventario físico cuadre exacto — registrá primero la compra que falta.
         </div>`
      : '';
  },

  /* Modelos que corresponden a una marca. Sin marca elegida se muestran
     todos (mejor eso que un dropdown vacío, que es justo lo que se veía
     cuando el catálogo de modelos no existía). */
  _opcionesModelo(marca) {
    const cat = this._catalogo || {};
    const m = String(marca || '').trim();
    const propios = m ? (cat.modeloPorMarca?.[m] || []) : [];
    return propios.length ? propios : (cat.modelo || []);
  },

  /* Al escribir la marca, el dropdown de modelo se reduce a los de esa
     marca — elegir Glock no debe ofrecer un Remington 870. */
  _filtrarModelos() {
    const marca = document.getElementById('arm-marca')?.value || '';
    const dl = document.getElementById('arm-dl-modelo');
    const hint = document.getElementById('arm-modelo-hint');
    if (!dl) return;
    const cat = this._catalogo || {};
    const propios = cat.modeloPorMarca?.[String(marca).trim()] || [];
    const lista = this._opcionesModelo(marca);
    dl.innerHTML = lista.map(v => `<option value="${UI.esc(v)}">`).join('');
    if (hint) hint.textContent = propios.length
      ? `${propios.length} modelo(s) de ${marca}`
      : (marca ? 'Marca nueva: escribe el modelo y queda guardado para la próxima.' : '');
  },

  /* Muestra el tope legal de munición según la licencia elegida (art. 60). */
  _infoTope() {
    const cont = document.getElementById('arm-tope-info'); if (!cont) return;
    const tipoLic = document.getElementById('arm-lic-tipo')?.value || '';
    const n = parseInt(document.getElementById('arm-armas-reg')?.value, 10) || 1;
    if (!tipoLic) { cont.textContent = 'Sin licencia sólo se pueden vender accesorios (art. 60).'; return; }
    const tope = this._limiteMunicionMes(tipoLic, n);
    cont.textContent = tipoLic === 'portación'
      ? `Art. 60: hasta ${tope} cartuchos al mes (250 × ${n} arma(s) registrada(s) en la licencia).`
      : `Art. 60: hasta ${tope} cartuchos al mes con registro de tenencia.`;
  },

  _toggleContraparte() {
    const tipo = document.getElementById('arm-tipo')?.value;
    const grupoProv = document.getElementById('arm-grupo-proveedor');
    if (grupoProv) grupoProv.style.display = tipo === 'compra' ? '' : 'none';
  },

  _toggleSerie() {
    const categoria = document.getElementById('arm-categoria')?.value;
    const req = document.getElementById('arm-serie-req');
    if (req) req.textContent = this._esArma(categoria) ? '*' : '';

    /* Aviso legal de la categoría: lo que el vendedor necesita saber antes
       de cerrar, no después. */
    const av = document.getElementById('arm-aviso-categoria');
    if (av) {
      const txt = this._avisoCategoria(categoria);
      av.style.display = txt ? '' : 'none';
      av.textContent = txt;
      const alerta = txt.startsWith('⚠️');
      av.style.background = alerta ? 'var(--red-dim, #fee)' : 'var(--card2)';
      av.style.borderLeft = `3px solid ${alerta ? 'var(--red)' : 'var(--cyan)'}`;
      av.style.color = 'var(--text)';
    }

    /* Sin licencia obligatoria, el bloque de papeles del comprador deja de
       ser un requisito y se marca como opcional. */
    const req2 = this._requiereLicencia(categoria);
    const lbl = document.getElementById('arm-bloque-licencia');
    if (lbl) lbl.textContent = req2
      ? '⚖️ Datos del comprador/vendedor que exige la ley'
      : '⚖️ Datos del comprador (esta categoría no exige licencia)';
  },

  _calcTotal() {
    const cant = parseFloat(document.getElementById('arm-cantidad')?.value) || 0;
    const precio = parseFloat(document.getElementById('arm-precio')?.value) || 0;
    const t = document.getElementById('arm-total');
    if (t) t.value = (cant * precio).toFixed(2);
  },

  /* Qué le falta al expediente del cliente para venderle legalmente. Se
     muestra al elegirlo, no al intentar guardar: si le falta el recibo de
     servicios, el vendedor tiene que pedírselo mientras lo tiene enfrente,
     no descubrirlo cuando el cliente ya se fue.

     El DPI/pasaporte y la licencia salen del art. 59; la verificación de
     domicilio con recibo de servicios es política del negocio (la ley pide
     la dirección — arts. 59 y 60 — pero no dice cómo comprobarla), y Henry
     la quiere obligatoria. */
  _CHECK_DOCS: {
    dpi: 'DPI (o pasaporte si es extranjero)',
    licencia_arma: 'Licencia de tenencia o portación',
    recibo_servicios: 'Recibo de servicios que verifique la dirección',
  },

  async _verificarCliente(clienteId) {
    const cont = document.getElementById('arm-cliente-check');
    if (!cont) return;
    if (!clienteId) { cont.innerHTML = ''; return; }
    cont.innerHTML = '<span style="color:var(--text3)">Verificando expediente…</span>';

    const cli = this._clientes.find(c => c.id === clienteId);
    const docs = await Docs.listar('cliente', clienteId).catch(() => []);
    const tipos = new Set(docs.map(d => d.tipo));

    const falta = [];
    /* El DPI se da por cubierto si subió pasaporte (extranjero). */
    if (!tipos.has('dpi') && !tipos.has('pasaporte')) falta.push(this._CHECK_DOCS.dpi);
    if (!tipos.has('licencia_arma')) falta.push(this._CHECK_DOCS.licencia_arma);
    if (!tipos.has('recibo_servicios')) falta.push(this._CHECK_DOCS.recibo_servicios);
    if (!String(cli?.direccion || '').trim()) falta.push('Dirección completa');
    if (!cli?.vivienda) falta.push('Indicar si la vivienda es propia o rentada');

    cont.innerHTML = falta.length
      ? `<div style="background:var(--card2);border-left:3px solid var(--amber);border-radius:6px;padding:8px 10px">
           <b>⚠️ Al expediente le falta:</b>
           <ul style="margin:4px 0 4px 16px">${falta.map(f => `<li>${UI.esc(f)}</li>`).join('')}</ul>
           <a href="#" onclick="event.preventDefault();Modulos.armeria._completarCliente('${clienteId}')" style="color:var(--cyan)">Completarlo ahora →</a>
         </div>`
      : '<span style="color:var(--green)">✅ Expediente completo (DPI/pasaporte, licencia, recibo de servicios y domicilio).</span>';
  },

  /* Abre la ficha del cliente para completarla y vuelve a la operación. */
  _completarCliente(clienteId) {
    UI.cerrarModal();
    if (Modulos.clientes?.modalForm) {
      Modulos.clientes._data = this._clientes;
      Modulos.clientes.modalForm(clienteId, () => {
        DB.getClientes().then(cs => { this._clientes = cs; this.modalForm(); });
      });
    }
  },

  /* Alta rápida de cliente sin salir de la operación — Henry pidió poder
     crear el cliente de la armería con su DPI/licencia desde acá. */
  _nuevoCliente() {
    UI.cerrarModal();
    if (Modulos.clientes?.modalForm) {
      Modulos.clientes.modalForm(null, () => {
        /* Al guardar, refresca la lista y vuelve a abrir la operación. */
        DB.getClientes().then(cs => { this._clientes = cs; this.modalForm(); });
      });
    }
  },

  async guardar(id = '') {
    const fields = {
      tipo: document.getElementById('arm-tipo')?.value || 'venta',
      estado: document.getElementById('arm-estado')?.value || 'entregado',
      cliente_id: document.getElementById('arm-cliente')?.value || null,
      proveedor_id: document.getElementById('arm-proveedor')?.value || null,
      inventario_id: document.getElementById('arm-inventario')?.value || null,
      categoria: document.getElementById('arm-categoria')?.value || '',
      marca: document.getElementById('arm-marca')?.value || null,
      modelo: document.getElementById('arm-modelo')?.value || null,
      calibre: document.getElementById('arm-calibre')?.value || null,
      numero_serie: document.getElementById('arm-serie')?.value || null,
      pais_origen: document.getElementById('arm-origen')?.value || null,
      cantidad: parseFloat(document.getElementById('arm-cantidad')?.value) || 0,
      precio_unit: parseFloat(document.getElementById('arm-precio')?.value) || 0,
      contraparte_dpi: document.getElementById('arm-dpi')?.value || null,
      contraparte_nit: document.getElementById('arm-nit')?.value || null,
      contraparte_direccion: document.getElementById('arm-direccion')?.value || null,
      contraparte_licencia_tipo: document.getElementById('arm-lic-tipo')?.value || null,
      contraparte_licencia_num: document.getElementById('arm-lic-num')?.value || null,
      contraparte_licencia_vencimiento: document.getElementById('arm-lic-vence')?.value || null,
      contraparte_armas_registradas: parseInt(document.getElementById('arm-armas-reg')?.value, 10) || 1,
      foto_tomada: !!document.getElementById('arm-foto')?.checked,
      huella_tomada: !!document.getElementById('arm-huella')?.checked,
      forma_pago: document.getElementById('arm-forma')?.value || 'efectivo',
      fecha: document.getElementById('arm-fecha')?.value || null,
      notas: document.getElementById('arm-notas')?.value || null,
    };
    fields.total = Math.round(fields.cantidad * fields.precio_unit * 100) / 100;
    if (fields.tipo === 'venta') fields.proveedor_id = null;

    const v = this._validar(fields);
    if (!v.ok) { UI.toast(v.error, 'error'); return; }

    if (fields.tipo === 'venta' && fields.categoria === 'munición') {
      const limite = this._limiteMunicionMes(fields.contraparte_licencia_tipo, fields.contraparte_armas_registradas);
      const yaVendido = await DB.getConsumoMunicionMes(fields.contraparte_dpi, id || null);
      const nuevoTotal = yaVendido + fields.cantidad;
      if (limite && nuevoTotal > limite) {
        UI.toast(`Excede el tope del art. 60: este DPI ya lleva ${yaVendido} cartuchos este mes y el límite con ${this._LICENCIAS[fields.contraparte_licencia_tipo].toLowerCase()} es ${limite}/mes (máximo ${Math.max(0, limite - yaVendido)} más). Para vender más, el comprador necesita permiso especial de DIGECAM.`, 'error');
        return;
      }
    }

    const previa = id ? this._data.find(x => x.id === id) : null;
    if (id) fields.id = id;
    const { data: saved, error } = await DB.upsertArmeriaOperacion(fields);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

    /* Trazabilidad: mueve el stock. Al editar se revierte el movimiento
       anterior antes de aplicar el nuevo, si no una corrección de cantidad
       descuadraría el inventario — justo lo que el art. 58 castiga. */
    if (previa?.inventario_id) await DB.moverStockArmeria(previa, true);
    const op = { ...fields, num: saved?.num || previa?.num };
    if (op.inventario_id) await DB.moverStockArmeria(op, false);

    /* Lo que el usuario escribió y no estaba en el catálogo, queda para la
       próxima vez. Es lo que evita el "Glock / GLOCK / glock". */
    await DB.agregarCatalogoArmeria({
      marca: fields.marca, modelo: fields.modelo,
      calibre: fields.calibre, pais: fields.pais_origen,
    }).catch(() => {});
    this._catalogo = null;   // se recarga al abrir el próximo formulario

    UI.cerrarModal();
    UI.toast(id ? 'Operación actualizada ✓' : 'Operación creada ✓');
    this.render(this._filtroTipo);
  },

  /* Eliminar devuelve el stock: borrar una venta sin reponer el artículo
     dejaría el inventario corto contra el conteo físico. */
  async eliminar(id) {
    const o = this._data.find(x => x.id === id); if (!o) return;
    const ok = await UI.confirmar(
      `¿Eliminar la operación <b>${o.num || ''}</b>?${o.inventario_id ? ' Se revertirá el movimiento de inventario.' : ''} Esta acción no se puede deshacer.`,
      'Eliminar');
    if (!ok) return;
    if (o.inventario_id) await DB.moverStockArmeria(o, true);
    const exito = await DB.deleteRegistro('armeria_operaciones', id);
    if (exito) { UI.toast('Eliminado ✓'); this.render(this._filtroTipo); }
    else UI.toast('No se pudo eliminar', 'error');
  },

  async _accionNotificar(id) {
    const o = this._data.find(x => x.id === id); if (!o) return;
    UI.modal('⚠️ Marcar como notificado a DIGECAM', `
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px">Operación <b>${o.num || ''}</b> — registra la fecha y el folio con que el negocio reportó esta transacción a DIGECAM.</div>
      <div style="background:var(--card2);border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px">
        📅 Recordá que el art. 60 obliga a remitir a DIGECAM <b>un informe y copia de la factura de venta cada fin de mes calendario</b> por las municiones vendidas.
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha de notificación</label>
          <input class="form-input" id="arm-not-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label class="form-label">Folio / referencia</label>
          <input class="form-input" id="arm-not-folio" placeholder="Número de trámite, folio DIGECAM..."></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-cyan" onclick="Modulos.armeria._guardarNotificacion('${id}')">💾 Guardar</button>
      </div>`, '480px');
  },

  async _guardarNotificacion(id) {
    const fecha_notificacion_digecam = document.getElementById('arm-not-fecha')?.value || null;
    const folio_notificacion_digecam = document.getElementById('arm-not-folio')?.value || null;
    const { error } = await DB.upsertArmeriaOperacion({ id, notificado_digecam: true, fecha_notificacion_digecam, folio_notificacion_digecam });
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.cerrarModal();
    UI.toast('Notificación registrada ✓');
    this.render(this._filtroTipo);
  },

  /* Libro de registro imprimible — el respaldo que pide un inspector.
     El libro oficial lo define y autoriza DIGECAM (art. 86); esto es el
     registro interno que este módulo puede entregar de una vez. */
  imprimirLibro() {
    const hoy = new Date().toLocaleDateString('es-GT');
    const filas = this._data.map(o => {
      /* El largo del cañón vive en la ficha del inventario; el libro lo trae
         de ahí porque es dato que la ley nombra (arts. 63 y 72) y un
         inspector lo puede pedir. */
      const inv = o.inventario_id ? this._inventario.find(i => i.id === o.inventario_id) : null;
      const canon = inv?.atributos?.largo_canon;
      return `<tr>
      <td>${o.num || '—'}</td><td>${o.tipo === 'compra' ? 'Compra' : 'Venta'}</td>
      <td>${o.clientes?.nombre || o.proveedores?.nombre || '—'}</td>
      <td>${o.contraparte_dpi || '—'}</td>
      <td>${o.contraparte_nit || '—'}</td>
      <td>${this._CATEGORIAS[o.categoria] || o.categoria}</td>
      <td>${[o.marca, o.modelo, o.calibre].filter(Boolean).join(' ')}</td>
      <td>${canon ? canon + '"' : '—'}</td>
      <td>${o.numero_serie || '—'}</td>
      <td>${o.cantidad || ''}</td>
      <td>${o.contraparte_licencia_num || '—'}</td>
      <td>${UI.q(o.total)}</td>
      <td>${this._ESTADOS[o.estado] || o.estado || '—'}</td>
      <td>${o.notificado_digecam ? 'Sí' : 'No'}</td>
      <td>${UI.fecha(o.fecha)}</td>
    </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Libro de Registro — Armería</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:20px;font-size:10px}
      h2{margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #999;padding:4px 5px;text-align:left}
      th{background:#eee}
      .nota{margin-top:14px;font-size:9px;color:#555;border-top:1px dashed #ccc;padding-top:8px}
    </style></head><body>
    <h2>${(window.Auth?.tenant?.name) || 'NexusPro'} — Libro de Registro de Armas y Municiones</h2>
    <p>Generado ${hoy} · ${this._data.length} operaciones</p>
    <table><thead><tr><th>No.</th><th>Tipo</th><th>Contraparte</th><th>DPI</th><th>NIT</th><th>Categoría</th><th>Marca/Modelo/Calibre</th><th>Cañón</th><th>Serie</th><th>Cant.</th><th>Licencia</th><th>Total</th><th>Trámite</th><th>DIGECAM</th><th>Fecha</th></tr></thead>
    <tbody>${filas || '<tr><td colspan="15">Sin operaciones</td></tr>'}</tbody></table>
    <div class="nota">
      Registro interno generado por NexusPro. El libro de control oficial debe ser autorizado por la DIGECAM
      (art. 86 del Decreto 15-2009) y de su movimiento debe rendirse informe por escrito cada fin de mes.
      El art. 60 obliga además a remitir a DIGECAM informe y copia de la factura de venta de municiones cada fin de mes calendario.
    </div>
    </body></html>`;
    const w = window.open('', '_blank', 'width=1000,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  },
};
