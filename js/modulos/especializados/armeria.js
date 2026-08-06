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
      /* Art. 21 del Reglamento: el código que devuelve DIGECAM es la prueba
         de que la verificación en línea se hizo, y va en la factura. */
      if (!String(f.codigo_autorizacion_digecam || '').trim()) {
        return { ok: false, error: 'Falta el código de autorización de DIGECAM. El art. 21 del Reglamento obliga a verificar el cupo del comprador en el sistema en línea antes de cada venta de munición y a anotar ese código en la factura' };
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
      ${b('operaciones', '🎯 Operaciones')}${b('municiones', '📦 Entrega de municiones')}${b('declaraciones', '📄 Declaraciones')}${b('ley', '⚖️ Ley de Armas y Municiones')}
    </div>`;
  },

  _irTab(tab) {
    this._tab = tab;
    if (tab === 'ley') return this.renderLey();
    if (tab === 'municiones') return this.renderMuniciones();
    if (tab === 'declaraciones') return this.renderDeclaraciones();
    return this.render(this._filtroTipo);
  },

  /* ══ ENTREGA DE MUNICIONES ═══════════════════════════════════════════════
     Se puede vender un combo de 1,000 cartuchos; lo que la ley limita es lo
     que el cliente se LLEVA cada mes (art. 60: 200 con tenencia, 250 por arma
     registrada con portación, hasta 3 armas = 750). Lo no retirado queda como
     SALDO A FAVOR y se entrega por partes, con comprobante en cada retiro. */
  async renderMuniciones() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const [saldos, entregas] = await Promise.all([
      DB.getMunicionSaldos().catch(() => []),
      DB.getMunicionEntregas().catch(() => []),
    ]);
    this._saldos = saldos; this._entregas = entregas;

    /* Mes activo por defecto; los anteriores quedan como historial (regla 3). */
    const hoy = new Date();
    const delMes = entregas.filter(e => {
      const d = new Date(e.fecha + 'T00:00:00');
      return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
    });

    const filaSaldo = s => `
      <tr>
        <td><b>${UI.esc(s.clientes?.nombre || '—')}</b>
            <div style="font-size:11px;color:var(--text3)">DPI ${UI.esc(s.clientes?.dpi || '—')}</div></td>
        <td>${UI.esc(s.calibre)}</td>
        <td class="mono-sm">${s.comprado}</td>
        <td class="mono-sm">${s.entregado}</td>
        <td class="mono-sm"><b style="color:var(--cyan)">${s.saldo}</b></td>
        <td style="text-align:right">
          <button class="btn btn-sm btn-cyan" onclick="Modulos.armeria.modalEntrega('${s.cliente_id}','${UI.esc(s.calibre)}')">
            📦 Entregar
          </button>
        </td>
      </tr>`;

    const filaEntrega = e => `
      <tr>
        <td class="mono-sm">${UI.esc(e.num)}</td>
        <td class="mono-sm">${UI.fecha(e.fecha)}</td>
        <td>${UI.esc(e.clientes?.nombre || '—')}</td>
        <td>${UI.esc(e.calibre)}</td>
        <td class="mono-sm"><b>${e.cantidad}</b></td>
        <td><span class="badge badge-${e.licencia_tipo === 'portación' ? 'cyan' : 'gray'}">${UI.esc(e.licencia_tipo)}</span></td>
        <td class="mono-sm">${UI.esc(e.codigo_autorizacion_digecam || '—')}</td>
        <td style="text-align:right;white-space:nowrap">
          ${Modulos.btnAccion('imprimir', `Modulos.armeria.imprimirComprobante('${e.id}')`)}
          ${Modulos.btnAccion('eliminar', `Modulos.armeria.eliminarEntrega('${e.id}')`)}
        </td>
      </tr>`;

    el.innerHTML = `
      <div class="page-header"><h1 class="page-title">🎯 Armería</h1></div>
      <div class="page-body">
        ${this._tabsHTML()}

        <div class="alert alert-amber" style="margin-bottom:16px">
          <div class="alert-icon">⚖️</div>
          <div class="alert-body" style="font-size:12px;line-height:1.6">
            <b>Tope mensual del art. 60 (Decreto 15-2009):</b> 200 cartuchos con <b>tenencia</b>
            y 250 <b>por arma registrada</b> con <b>portación</b> (hasta 3 armas según el art. 72,
            o sea 750). El tope es sobre lo que el cliente <b>se lleva</b>, no sobre lo que compra:
            por eso un combo grande es legal si se entrega por partes.
            <div style="margin-top:6px;color:var(--amber)">
              ⚠️ <b>Este conteo es una referencia parcial.</b> La cuota del art. 60 es
              <b>nacional por persona</b> y esta app solo ve las entregas de <i>este</i> comercio:
              si el cliente ya compró en otra armería este mes, aquí no se sabe.
              El control real es el <b>código de autorización de DIGECAM</b>, que se pide en cada entrega
              (reglamento AG 85-2011, art. 21).
            </div>
            <div style="margin-top:6px;color:var(--text3);border-top:1px dashed var(--border);padding-top:6px">
              🔐 <b>La consulta se hace en SIGECAM</b>, el sistema de empresas de DIGECAM
              (<a href="https://www.digecam.mil.gt/acceso-empresas" target="_blank" rel="noopener" style="color:var(--cyan)">digecam.mil.gt/acceso-empresas</a>).
              Se entra con DPI, contraseña y código de Google Authenticator, y <b>no publica API</b>:
              por eso esta app no puede consultarlo sola — haría falta la contraseña y el código de
              6 dígitos de una persona. La app prepara la consulta; el resultado vuelve escrito acá
              como código de autorización. <b>Ojo:</b> SIGECAM muestra unos 3 meses de historial de
              munición, así que para las ventas de <i>este</i> comercio el registro de acá termina
              siendo más completo.
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom:20px">
          <div class="card-sub mb-3">💳 Saldo a favor — munición comprada y no retirada</div>
          ${saldos.length ? `
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Cliente</th><th>Calibre</th><th>Comprado</th><th>Entregado</th><th>Saldo</th><th></th></tr></thead>
            <tbody>${saldos.map(filaSaldo).join('')}</tbody>
          </table></div>`
          : `<div class="empty-state">Ningún cliente tiene saldo pendiente. El saldo aparece solo al registrar una venta de munición en <b>Operaciones</b>.</div>`}
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center" class="mb-3">
            <div class="card-sub" style="margin-bottom:0">📋 Entregas de ${UI.esc(hoy.toLocaleDateString('es-GT',{month:'long',year:'numeric'}))}</div>
            <button class="btn btn-sm btn-ghost" onclick="Modulos.armeria._verHistorialEntregas()">📅 Ver historial</button>
          </div>
          ${delMes.length ? `
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Comprobante</th><th>Fecha</th><th>Cliente</th><th>Calibre</th><th>Cant.</th><th>Licencia</th><th>Cód. DIGECAM</th><th></th></tr></thead>
            <tbody>${delMes.map(filaEntrega).join('')}</tbody>
          </table></div>`
          : '<div class="empty-state">Sin entregas este mes.</div>'}
        </div>
      </div>`;
  },

  _verHistorialEntregas() {
    const todas = this._entregas || [];
    if (!todas.length) { UI.toast('Todavía no hay entregas registradas', 'info'); return; }
    UI.modal('📅 Historial completo de entregas', `
      <div class="table-wrap" style="max-height:60vh;overflow:auto"><table class="data-table">
        <thead><tr><th>Comprobante</th><th>Fecha</th><th>Cliente</th><th>Calibre</th><th>Cant.</th><th>Cód. DIGECAM</th></tr></thead>
        <tbody>${todas.map(e => `<tr>
          <td class="mono-sm">${UI.esc(e.num)}</td>
          <td class="mono-sm">${UI.fecha(e.fecha)}</td>
          <td>${UI.esc(e.clientes?.nombre || '—')}</td>
          <td>${UI.esc(e.calibre)}</td>
          <td class="mono-sm">${e.cantidad}</td>
          <td class="mono-sm">${UI.esc(e.codigo_autorizacion_digecam || '—')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button></div>
    `, '820px');
  },

  async modalEntrega(clienteId, calibre) {
    const s = (this._saldos || []).find(x => x.cliente_id === clienteId && x.calibre === calibre);
    if (!s) { UI.toast('No se encontró el saldo de ese cliente', 'error'); return; }
    const yaMes = await DB.getEntregadoMes(clienteId).catch(() => 0);

    /* La licencia se trae de la ficha del cliente (migración 127) en vez de
       pedirla otra vez. Sigue siendo editable: la entrega guarda SU copia como
       evidencia del día, así que si el cliente renueva, el comprobante viejo
       debe seguir diciendo lo que había entonces. */
    const cli = (this._clientes || []).find(c => c.id === clienteId) || {};
    const lic = cli.licencia_tipo || 'tenencia';
    const armas = Math.min(3, Math.max(1, Number(cli.armas_registradas) || 1));
    /* Sólo la portación vence; la tarjeta de tenencia no trae vigencia. */
    const dias = (cli.licencia_tipo === 'portación' && Modulos.clientes?.diasLicencia)
      ? Modulos.clientes.diasLicencia(cli.licencia_vencimiento) : null;
    const sel = (v, x) => v === x ? 'selected' : '';

    UI.modal('📦 Entregar munición', `
      <div class="alert alert-cyan" style="margin-bottom:14px">
        <div class="alert-body" style="font-size:12px">
          <b>${UI.esc(s.clientes?.nombre || '—')}</b> · DPI ${UI.esc(s.clientes?.dpi || '—')}<br>
          Saldo de ${UI.esc(calibre)}: <b style="font-size:15px">${s.saldo}</b> cartuchos ·
          ya retirados este mes: <b>${yaMes}</b>
        </div>
      </div>
      ${dias !== null && dias < 0 ? `
      <div style="background:rgba(239,68,68,.08);border-left:3px solid var(--red);border-radius:6px;padding:9px 11px;margin-bottom:12px;color:var(--red);font-size:12px">
        ⛔ <b>La licencia de este cliente venció hace ${Math.abs(dias)} día(s)</b> (${UI.fecha(cli.licencia_vencimiento)}).
        Una licencia vencida no habilita entregarle munición.
      </div>` : (dias !== null && dias <= 30 ? `
      <div style="background:rgba(245,158,11,.08);border-left:3px solid var(--amber);border-radius:6px;padding:9px 11px;margin-bottom:12px;color:var(--amber);font-size:12px">
        ⚠️ La licencia vence en <b>${dias} día(s)</b> (${UI.fecha(cli.licencia_vencimiento)}).
      </div>` : '')}
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tipo de licencia *</label>
          <select class="form-select" id="ent-lic" onchange="Modulos.armeria._recalcTope()">
            <option value="tenencia"  ${sel(lic,'tenencia')}>Tenencia (200 al mes)</option>
            <option value="portación" ${sel(lic,'portación')}>Portación (250 por arma)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Armas registradas *</label>
          <select class="form-select" id="ent-armas" onchange="Modulos.armeria._recalcTope()">
            ${[1,2,3].map(n=>`<option value="${n}" ${armas===n?'selected':''}>${n} arma${n===1?'':'s'}</option>`).join('')}
          </select>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Máximo 3 (art. 72).</div>
        </div>
      </div>
      ${cli.licencia_tipo ? `<div style="font-size:11px;color:var(--text3);margin:-6px 0 10px">
        Traído de la ficha del cliente. Si lo corregís acá, el cambio queda en <b>este</b> comprobante
        (la ficha no se toca): así un comprobante viejo sigue diciendo lo que había ese día.
      </div>` : `<div style="font-size:11px;color:var(--amber);margin:-6px 0 10px">
        Este cliente no tiene licencia guardada en su ficha. Cargala en su expediente para que se traiga sola.
      </div>`}
      <div id="ent-tope" style="font-size:12px;padding:8px 10px;border-radius:6px;background:var(--surface2);color:var(--text2);margin-bottom:12px"></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Cantidad a entregar *</label>
          <input class="form-input" id="ent-cant" type="number" min="1" max="${s.saldo}"
                 value="" placeholder="Ej. 100" oninput="Modulos.armeria._recalcTope()">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha *</label>
          <input class="form-input" id="ent-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">No. de licencia</label>
          <input class="form-input" id="ent-licnum" value="${UI.esc(cli.licencia_num || '')}" placeholder="Como aparece en el documento">
        </div>
        <div class="form-group">
          <label class="form-label">Vence la licencia</label>
          <input class="form-input" id="ent-licvence" type="date" value="${cli.licencia_vencimiento || ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Código de autorización DIGECAM</label>
        <input class="form-input" id="ent-digecam" placeholder="El que respalda la cuota nacional del cliente">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Es el control real: sin él, el conteo de esta app solo cubre lo comprado <b>aquí</b>.
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Recibido por</label>
        <input class="form-input" id="ent-recibido" placeholder="Nombre de quien retira y firma">
      </div>
      <div class="form-group">
        <label class="form-label">Notas</label>
        <input class="form-input" id="ent-notas" placeholder="Opcional">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-cyan" onclick="Modulos.armeria.guardarEntrega('${clienteId}','${UI.esc(calibre)}')">
          📦 Registrar entrega e imprimir
        </button>
      </div>
    `, '640px');

    this._entregaCtx = { yaMes, saldo: s.saldo };
    this._recalcTope();
  },

  /* Avisa ANTES de guardar. La validación de verdad la hace el trigger de la
     base: si esta cuenta y aquella no coincidieran, manda la base. */
  _recalcTope() {
    const ctx = this._entregaCtx || { yaMes: 0, saldo: 0 };
    const lic = document.getElementById('ent-lic')?.value || 'tenencia';
    const armas = Number(document.getElementById('ent-armas')?.value) || 1;
    const cant = Number(document.getElementById('ent-cant')?.value) || 0;
    const tope = topeMunicionMensual(lic, armas);
    const queda = Math.max(0, tope - ctx.yaMes);
    const box = document.getElementById('ent-tope');
    if (!box) return;

    let msg = `Tope del mes con <b>${lic}</b> y ${armas} arma(s): <b>${tope}</b> · ya retirados <b>${ctx.yaMes}</b> · puede llevarse <b>${queda}</b>.`;
    let color = 'var(--text2)', fondo = 'var(--surface2)';
    if (cant > 0 && cant > queda) {
      msg = `⛔ Se pasa del tope: ${ctx.yaMes} + ${cant} = ${ctx.yaMes + cant}, y el máximo del mes es ${tope}.`;
      color = 'var(--red)'; fondo = 'rgba(239,68,68,.08)';
    } else if (cant > ctx.saldo) {
      msg = `⛔ Solo hay ${ctx.saldo} cartuchos de saldo.`;
      color = 'var(--red)'; fondo = 'rgba(239,68,68,.08)';
    } else if (cant > 0) {
      msg += ` <span style="color:var(--green)">✓ Cabe en el tope.</span>`;
    }
    box.innerHTML = msg; box.style.color = color; box.style.background = fondo;
  },

  async guardarEntrega(clienteId, calibre) {
    const v = id => document.getElementById(id)?.value?.trim() || '';
    const cantidad = Number(v('ent-cant')) || 0;
    if (cantidad <= 0) { UI.toast('Indica cuántos cartuchos se entregan', 'error'); return; }

    const { data, error } = await DB.registrarEntregaMunicion({
      cliente_id: clienteId,
      calibre,
      cantidad,
      fecha: v('ent-fecha') || new Date().toISOString().slice(0, 10),
      licencia_tipo: v('ent-lic') || 'tenencia',
      licencia_num: v('ent-licnum') || null,
      licencia_vencimiento: v('ent-licvence') || null,
      armas_registradas: Number(v('ent-armas')) || 1,
      codigo_autorizacion_digecam: v('ent-digecam') || null,
      recibido_por: v('ent-recibido') || null,
      notas: v('ent-notas') || null,
    });

    if (error) {
      /* El trigger explica el motivo (tope o saldo); se muestra tal cual en vez
         de un "no se pudo guardar" que obliga a adivinar. */
      UI.toast(error.message || 'No se pudo registrar la entrega', 'error', 8000);
      return;
    }
    UI.cerrarModal();
    UI.toast(`✓ Entrega ${data.num} registrada`, 'success');
    this.imprimirComprobante(data.id, data);
    await this.renderMuniciones();
  },

  async eliminarEntrega(id) {
    const e = (this._entregas || []).find(x => x.id === id);
    if (!confirm(`¿Eliminar el comprobante ${e?.num || ''}?\n\nLos ${e?.cantidad || ''} cartuchos vuelven al saldo del cliente.`)) return;
    const ok = await DB.eliminarEntregaMunicion(id);
    UI.toast(ok ? 'Entrega eliminada, saldo devuelto' : 'No se pudo eliminar', ok ? 'success' : 'error');
    if (ok) await this.renderMuniciones();
  },

  /* Comprobante de entrega: el papel que se lleva el cliente y el respaldo del
     comercio de que la entrega fue dentro del tope. */
  imprimirComprobante(id, entrega = null) {
    const e = entrega || (this._entregas || []).find(x => x.id === id);
    if (!e) { UI.toast('No se encontró la entrega', 'error'); return; }
    const t = Auth.tenant || {};
    const tope = topeMunicionMensual(e.licencia_tipo, e.armas_registradas);

    const w = window.open('', '_blank');
    if (!w) { UI.toast('El navegador bloqueó la ventana de impresión', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
      <title>Comprobante ${UI.esc(e.num)}</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;max-width:700px;margin:24px auto;color:#111;line-height:1.55}
        h1{font-size:19px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;margin:14px 0}
        td{padding:7px 6px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top}
        td.k{color:#666;width:38%}
        .caja{border:2px solid #111;border-radius:8px;padding:14px;margin:16px 0;text-align:center}
        .caja .n{font-size:34px;font-weight:800;line-height:1}
        .legal{font-size:10.5px;color:#555;border-top:1px solid #e5e7eb;padding-top:10px;margin-top:18px}
        .firmas{display:flex;gap:40px;margin-top:44px}
        .firma{flex:1;border-top:1px solid #111;padding-top:5px;font-size:11px;text-align:center;color:#444}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>${UI.esc(t.name || 'Armería')}</h1>
      <div class="sub">NIT ${UI.esc(t.nit || '—')} · Comprobante de entrega de munición <b>${UI.esc(e.num)}</b></div>

      <table>
        <tr><td class="k">Fecha de entrega</td><td>${UI.fecha(e.fecha)}</td></tr>
        <tr><td class="k">Cliente</td><td><b>${UI.esc(e.clientes?.nombre || '—')}</b></td></tr>
        <tr><td class="k">DPI</td><td>${UI.esc(e.clientes?.dpi || '—')}</td></tr>
        <tr><td class="k">Licencia</td><td>${UI.esc(e.licencia_tipo)}${e.licencia_num ? ' No. ' + UI.esc(e.licencia_num) : ''}${e.licencia_vencimiento ? ' · vence ' + UI.fecha(e.licencia_vencimiento) : ''}</td></tr>
        <tr><td class="k">Armas registradas</td><td>${e.armas_registradas}</td></tr>
        <tr><td class="k">Calibre</td><td>${UI.esc(e.calibre)}</td></tr>
        <tr><td class="k">Código autorización DIGECAM</td><td>${UI.esc(e.codigo_autorizacion_digecam || '— no registrado —')}</td></tr>
      </table>

      <div class="caja">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.05em">Cartuchos entregados</div>
        <div class="n">${e.cantidad}</div>
      </div>

      <div class="legal">
        Entrega amparada en el <b>artículo 60 del Decreto 15-2009</b> (Ley de Armas y Municiones):
        hasta <b>200 cartuchos</b> al mes con licencia de tenencia y <b>250 por arma registrada</b>
        con licencia de portación, con un máximo de tres armas conforme al artículo 72
        (tope aplicable a esta entrega: <b>${tope}</b> cartuchos).
        <br><br>
        Este comprobante acredita la entrega física realizada por <b>${UI.esc(t.name || '')}</b>.
        El cumplimiento de la cuota mensual <b>a nivel nacional</b> corresponde verificarlo ante
        DIGECAM (reglamento, Acuerdo Gubernativo 85-2011, artículo 21); el registro de este
        comercio abarca únicamente las entregas realizadas por él.
      </div>

      <div class="firmas">
        <div class="firma">${UI.esc(e.recibido_por || '')}<br>Recibí conforme (cliente)</div>
        <div class="firma">Entregó — ${UI.esc(t.name || '')}</div>
      </div>
      <script>window.onload=function(){window.print()}<\/script>
      </body></html>`);
    w.document.close();
  },

  async render(filtroTipo = '') {
    if (this._tab === 'ley') return this.renderLey();
    if (this._tab === 'municiones') return this.renderMuniciones();
    if (this._tab === 'declaraciones') return this.renderDeclaraciones();
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
          <button class="btn btn-ghost" onclick="Modulos.armeria.modalDeclaraciones()">📄 Declaraciones</button>
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
              <td>${UI.esc(o.clientes?.nombre || o.proveedores?.nombre || '—')}</td>
              <td><span class="badge badge-gray">${this._CATEGORIAS[o.categoria] || o.categoria}</span><div style="font-size:11px;color:var(--text3)">${UI.esc([o.marca, o.modelo, o.calibre].filter(Boolean).join(' · ') || '—')}</div></td>
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
                <button class="btn btn-sm btn-ghost" onclick="Modulos.armeria.modalDeclaraciones('${o.id}')" title="Declaraciones juradas">📄</button>
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

  /* La ley reparte el trámite de importación en once artículos de tres
     capítulos distintos, y leídos así no se ve el ORDEN en que hay que hacer
     las cosas. Esto los pone en secuencia, cada paso con el artículo que lo
     respalda, y separa visualmente qué le toca a DIGECAM y qué a la SAT —
     que es la confusión más común: no es una o la otra, son las dos. */
  modalImportacion() {
    const pasos = (typeof pasosImportacion === 'function') ? pasosImportacion() : [];
    if (!pasos.length) { UI.toast('No se pudo cargar el trámite de importación', 'error'); return; }

    const colorEntidad = e => e === 'SAT' ? 'var(--amber)'
                          : e === 'DIGECAM' ? 'var(--cyan)' : 'var(--purple, var(--cyan))';

    UI.modal('🛃 Importación de armas — el trámite en orden', `
      <div style="background:var(--card2);border-left:3px solid var(--cyan);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;line-height:1.6">
        <b>Son DOS entidades, no una.</b>
        <span style="color:var(--cyan);font-weight:700">DIGECAM</span> autoriza (licencia de importación),
        toma huellas balísticas, emite tarjetas de tenencia y <b>troquela con las letras GUA</b>.
        <span style="color:var(--amber);font-weight:700">SAT</span> cobra los aranceles y custodia la
        mercadería en el almacén fiscal. Ninguna sustituye a la otra: sin licencia de DIGECAM la SAT no
        desalmacena, y sin pagar aranceles la DIGECAM no recibe nada.
      </div>

      <div style="max-height:56vh;overflow:auto;padding-right:4px">
        ${pasos.map(p => `
          <div style="display:flex;gap:11px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
            <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:${colorEntidad(p.entidad)};
                        color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">${p.n}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:3px">
                <b style="font-size:13px">${p.alerta ? '⚠️ ' : ''}${UI.esc(p.titulo)}</b>
                <span style="font-size:10px;font-weight:800;color:${colorEntidad(p.entidad)};
                             border:1px solid ${colorEntidad(p.entidad)};border-radius:4px;padding:1px 6px">${UI.esc(p.entidad)}</span>
                <span style="font-size:10.5px;color:var(--text3)">art. ${p.arts.join(', ')}</span>
              </div>
              <div style="font-size:12px;line-height:1.6;color:var(--text2)">${UI.esc(p.detalle)}</div>
            </div>
          </div>`).join('')}
      </div>

      <div style="font-size:11px;color:var(--text3);margin-top:10px;border-top:1px dashed var(--border);padding-top:10px;line-height:1.6">
        Esto <b>ordena lo que dice la ley</b> (Decreto 15-2009); no reemplaza al trámite oficial.
        Los formularios, las tasas y los tiempos de respuesta los fija la DIGECAM y <b>cambian sin que
        cambie la ley</b>: confirmalos en <b>digecam.mil.gt</b> antes de presentar.
        El texto literal de cada artículo está en esta misma pantalla — buscá por su número.
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-cyan" onclick="window.print()">🖨 Imprimir</button>
      </div>`, '760px');
  },

  renderLey() {
    const el = document.getElementById('page-content');
    const ley = window.LEY_ARMAS;
    if (!ley) { el.innerHTML = '<div class="page-body">No se pudo cargar el texto de la ley.</div>'; return; }
    const arts = (typeof buscarLeyArmas === 'function') ? buscarLeyArmas(this._busquedaLey)
      : (typeof articulosLeyArmas === 'function' ? articulosLeyArmas() : ley.articulos);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">⚖️ ${UI.esc(ley.nombre)}</h1>
        <p class="page-subtitle">// ${ley.decreto} y su reglamento (${ley.reglamento})</p></div>
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
        <div style="margin-bottom:14px">
          <button class="btn btn-cyan btn-sm" onclick="Modulos.armeria.modalImportacion()">
            🛃 Cómo importar armas — pasos ante DIGECAM y SAT
          </button>
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
              <span class="badge badge-${a.clave ? 'amber' : 'gray'}">${a.reglamento ? 'Reglamento' : 'Ley'} · Art. ${a.num}</span>
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
    const arts = (typeof articulosLeyArmas === 'function' ? articulosLeyArmas() : window.LEY_ARMAS.articulos)
      .filter(a => a.tema === tema);
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
        <div><div style="font-size:11px;color:var(--text3)">Contraparte</div><div style="font-weight:700">${UI.esc(o.clientes?.nombre || o.proveedores?.nombre || '—')}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Categoría</div><div>${this._CATEGORIAS[o.categoria] || o.categoria}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Marca / Modelo / Calibre</div><div>${UI.esc([o.marca, o.modelo, o.calibre].filter(Boolean).join(' · ') || '—')}</div></div>
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
        <button class="btn btn-ghost" onclick="UI.cerrarModal();Modulos.armeria.modalDeclaraciones('${o.id}')">📄 Declaraciones</button>
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
        <div class="form-group" id="arm-grupo-codigo">
          <label class="form-label">Código de autorización DIGECAM (venta de munición)</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="arm-codigo-digecam" value="${UI.esc(o.codigo_autorizacion_digecam || '')}"
                   style="font-family:monospace;flex:1" placeholder="El que devuelve DIGECAM por sistema o teléfono">
            <button type="button" class="btn btn-ghost" onclick="Modulos.armeria._copiarConsultaDigecam()"
                    title="Copiar los datos para pegarlos en el sistema de DIGECAM">📋 Copiar datos</button>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">
            Art. 21 del Reglamento: <b>antes de cada venta</b> de munición hay que verificar en el sistema en línea
            de DIGECAM que el comprador no haya excedido su límite mensual, y obtener este código —
            que además <b>debe anotarse en la factura</b>. El botón copia los datos del comprador para no
            volver a teclearlos en el sistema de DIGECAM.
          </div>
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
    const base = tipoLic === 'portación'
      ? `Art. 60: hasta ${tope} cartuchos al mes (250 × ${n} arma(s) registrada(s) en la licencia).`
      : `Art. 60: hasta ${tope} cartuchos al mes con registro de tenencia.`;
    /* El conteo que lleva la app es SÓLO de este comercio. El art. 21 del
       reglamento manda verificar en el sistema de DIGECAM justamente porque
       el cliente pudo comprar en otra armería el mismo mes. Decirlo acá
       evita que alguien confíe en un número que no ve el cuadro completo. */
    cont.innerHTML = `${base}<br><span style="color:var(--amber)">⚠️ El conteo de la app sólo ve las ventas de este negocio.
      El art. 21 del Reglamento obliga a verificar el cupo en el sistema en línea de DIGECAM antes de cada venta —
      el cliente pudo haber comprado en otra armería.</span>`;
  },

  /* Arma el texto de la consulta a DIGECAM con los datos que ya están en el
     formulario. No consulta nada — DIGECAM no expone una API pública, así
     que la verificación del art. 21 la hace la persona en el sistema al que
     el negocio ya debe estar conectado (art. 20) o por teléfono. Lo único
     que la app puede hacer es que no haya que teclear todo de nuevo. */
  _textoConsultaDigecam() {
    const g = (id) => document.getElementById(id)?.value || '';
    const lic = g('arm-lic-tipo');
    const cli = this._clientes.find(c => c.id === g('arm-cliente'));
    return [
      'CONSULTA DE CUPO DE MUNICIÓN — DIGECAM (art. 21 AG 85-2011)',
      `Comprador: ${cli?.nombre || '—'}`,
      `DPI: ${g('arm-dpi') || '—'}`,
      `NIT: ${g('arm-nit') || '—'}`,
      `Licencia: ${this._LICENCIAS[lic] || '—'} No. ${g('arm-lic-num') || '—'}`,
      `Armas registradas en la licencia: ${g('arm-armas-reg') || '1'}`,
      `Calibre a vender: ${g('arm-calibre') || '—'}`,
      `Cantidad solicitada: ${g('arm-cantidad') || '—'} cartuchos`,
      `Tope legal según licencia: ${this._limiteMunicionMes(lic, parseInt(g('arm-armas-reg'), 10) || 1) || '—'}/mes`,
    ].join('\n');
  },

  async _copiarConsultaDigecam() {
    const txt = this._textoConsultaDigecam();
    try {
      await navigator.clipboard.writeText(txt);
      UI.toast('Datos copiados — pegalos en el sistema de DIGECAM');
    } catch (_) {
      /* Sin permiso de portapapeles (pasa en http o si el navegador lo
         bloquea): se abre en una ventana para copiarlos a mano. */
      const w = window.open('', '_blank', 'width=520,height=420');
      if (w) { w.document.write('<pre style="white-space:pre-wrap;font-size:13px">' + UI.esc(txt) + '</pre>'); w.document.close(); }
      else UI.toast('No se pudo copiar: permití las ventanas emergentes', 'error');
    }
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

    /* Un expediente con una sola cara del DPI está incompleto: DIGECAM y el
       notario piden ambas. Los tipos VIEJOS ('dpi', 'licencia_arma') se
       aceptan como el anverso, para no mandar a refotografiar lo que ya se
       entregó antes de partir los documentos en dos caras. */
    const hay = t => tipos.has(t);
    const anversoDPI = hay('dpi_frente') || hay('dpi') || hay('pasaporte');
    const reversoDPI = hay('dpi_reverso') || hay('pasaporte');   // el pasaporte es una hoja
    const anversoLic = hay('licencia_frente') || hay('licencia_arma');
    const reversoLic = hay('licencia_reverso');

    const falta = [];
    if (!anversoDPI) falta.push('DPI (anverso) o pasaporte');
    else if (!reversoDPI) falta.push('DPI — falta el REVERSO');
    if (!anversoLic) falta.push(this._CHECK_DOCS.licencia_arma);
    else if (!reversoLic) falta.push('Licencia de arma — falta el REVERSO');
    if (!hay('recibo_servicios')) falta.push(this._CHECK_DOCS.recibo_servicios);
    if (!String(cli?.direccion || '').trim()) falta.push('Dirección completa');
    if (!cli?.vivienda) falta.push('Indicar si la vivienda es propia o rentada');
    if (!cli?.licencia_tipo) falta.push('Tipo de licencia (tenencia o portación) en la ficha del cliente');

    /* Una licencia VENCIDA no es un dato faltante: es un impedimento legal, y
       se avisa aparte y en rojo para que no se pierda entre la lista.
       Sólo aplica a PORTACIÓN: la tarjeta de tenencia no vence (dice "CIVIL
       ART. 9" y no trae vigencia — verificado contra dos tarjetas reales de
       DIGECAM, de 2019 y 2024). Avisar "vencida" sobre una tenencia inventaría
       un impedimento que la ley no pone. */
    const dias = (cli?.licencia_tipo === 'portación' && Modulos.clientes?.diasLicencia)
      ? Modulos.clientes.diasLicencia(cli?.licencia_vencimiento) : null;
    const avisoVence = dias === null ? ''
      : dias < 0
        ? `<div style="background:rgba(239,68,68,.08);border-left:3px solid var(--red);border-radius:6px;padding:8px 10px;margin-bottom:6px;color:var(--red)">
             ⛔ <b>La licencia venció hace ${Math.abs(dias)} día(s).</b> No habilita comprar arma ni munición.
           </div>`
        : dias <= 30
          ? `<div style="background:rgba(245,158,11,.08);border-left:3px solid var(--amber);border-radius:6px;padding:8px 10px;margin-bottom:6px;color:var(--amber)">
               ⚠️ La licencia vence en <b>${dias} día(s)</b>.
             </div>`
          : '';

    cont.innerHTML = avisoVence + (falta.length
      ? `<div style="background:var(--card2);border-left:3px solid var(--amber);border-radius:6px;padding:8px 10px">
           <b>⚠️ Al expediente le falta:</b>
           <ul style="margin:4px 0 4px 16px">${falta.map(f => `<li>${UI.esc(f)}</li>`).join('')}</ul>
           <a href="#" onclick="event.preventDefault();Modulos.armeria._completarCliente('${clienteId}')" style="color:var(--cyan)">Completarlo ahora →</a>
         </div>`
      : '<span style="color:var(--green)">✅ Expediente completo (DPI y licencia por ambas caras, recibo de servicios, domicilio y licencia vigente).</span>');
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
      codigo_autorizacion_digecam: document.getElementById('arm-codigo-digecam')?.value || null,
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
      <td>${UI.esc(o.clientes?.nombre || o.proveedores?.nombre || '—')}</td>
      <td>${o.contraparte_dpi || '—'}</td>
      <td>${o.contraparte_nit || '—'}</td>
      <td>${this._CATEGORIAS[o.categoria] || o.categoria}</td>
      <td>${UI.esc([o.marca, o.modelo, o.calibre].filter(Boolean).join(' '))}</td>
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
