/* ═══════════════════════════════════════════════════════
   Fórmulas de alimentación balanceada — pestaña de Agroservicio

   Por qué vive acá: el agroservicio le vende al mismo productor que compra
   el grano, y el maíz, el maicillo y la soya que llevan estas fórmulas son
   justo los que el módulo de granos ya cotiza. Con el precio del día se puede
   decir cuánto cuesta HOY un quintal de alimento, y cuándo conviene sustituir
   maíz por maicillo.

   LO QUE ESTO ES Y LO QUE NO ES: son fórmulas de referencia, del tipo que
   publican las guías de extensión. Sirven para cotizar y para tener una base;
   no reemplazan a un zootecnista formulando por requerimiento, análisis de
   materia prima y etapa productiva. Eso se dice en pantalla, no en un
   comentario que el usuario nunca lee.

   Las advertencias NO son decorativas: la urea mata a un caballo o a un cerdo,
   y la soya cruda tiene inhibidores de tripsina. Van marcadas por ingrediente
   y se muestran siempre que la fórmula lo incluya.
═══════════════════════════════════════════════════════ */

Modulos.formulas_alimento = {
  _especie: 'aves',
  _insumos: [],      // precios propios del comercio (agro_insumos)
  _ref: {},          // precios del día del MAGA
  _mercado: {},      // menudeo consultado en supermercados (TENTATIVO)

  /* En Guatemala el alimento se pesa en libras, no en kilos: la libra es la
     unidad de la báscula del agroservicio. Por eso arranca en libras y la
     preferencia se recuerda.

     Un detalle que simplifica todo: el quintal son 100 libras EXACTAS, así que
     el porcentaje de inclusión ES la libra por quintal — 56% = 56 lb. No hay
     conversión que equivocar. */
  _LB_KG: 0.45359237,
  _unidad: (typeof localStorage !== 'undefined' && localStorage.getItem('tp_unidad_formulas')) || 'lb',

  _setUnidad(u) {
    this._unidad = u;
    try { localStorage.setItem('tp_unidad_formulas', u); } catch (_) {}
    this.render();
  },

  /* Cantidad de un ingrediente en un quintal de alimento, en la unidad
     elegida. Las inclusiones chicas (premezcla, metionina) se muestran en
     GRAMOS: "0.20 lb" no se pesa, 91 g sí — y es como viene la bolsa. */
  _masa(pct) {
    if (this._unidad === 'kg') {
      const kg = 100 * this._LB_KG * pct / 100;
      return kg < 0.5 ? `${(kg * 1000).toFixed(0)} g` : `${kg.toFixed(2)} kg`;
    }
    const lb = pct;                                   // quintal = 100 lb
    return lb < 1 ? `${(lb * this._LB_KG * 1000).toFixed(0)} g` : `${lb.toFixed(2)} lb`;
  },

  /* Costo por unidad de peso a partir del costo por quintal. */
  _costoUnitario(costoQq) {
    return this._unidad === 'kg'
      ? { valor: costoQq / (100 * this._LB_KG), etiqueta: 'por kg' }
      : { valor: costoQq / 100,                  etiqueta: 'por libra' };
  },

  _selectorUnidadHTML() {
    const b = (u, txt) => `<button class="btn btn-sm ${this._unidad === u ? 'btn-cyan' : 'btn-ghost'}"
      onclick="Modulos.formulas_alimento._setUnidad('${u}')">${txt}</button>`;
    return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text3)">Pesos en:</span>
      ${b('lb', 'Libras')}${b('kg', 'Kilos')}
      <span style="font-size:11px;color:var(--text3)">— las cantidades chicas salen en gramos</span>
    </div>`;
  },

  /* Ingredientes. `maga` = nombre exacto del producto en el catálogo del MAGA
     (los tres que publica); el resto se costea con el precio que carga el
     comercio, porque nadie los publica abiertamente. */
  _ING: {
    maiz:      { label: 'Maíz amarillo',        maga: 'Maíz amarillo, de primera' },
    maiz_b:    { label: 'Maíz blanco',          maga: 'Maíz blanco, de primera' },
    sorgo:     { label: 'Sorgo (maicillo)',     maga: 'Sorgo blanco, de primera',
                 aviso: 'Los taninos del sorgo bajan la digestibilidad: en aves conviene no pasar del 50% del maíz que sustituye.' },
    soya:      { label: 'Pasta de soya (44-48% PC)', mercado: 'soya',
                 aviso: 'Es pasta/torta de extracción, NO grano crudo: la soya sin tostar trae inhibidores de tripsina y frena el crecimiento.' },
    melaza:    { label: 'Melaza de caña', mercado: 'melaza',
                 aviso: 'Aglutina y da palatabilidad, pero pasarse afloja el estiércol. En aves rara vez más del 5%.' },
    salvado:   { label: 'Salvado / afrecho de trigo', mercado: 'salvado de trigo' },
    avena:     { label: 'Avena en grano', mercado: 'avena' },
    aceite:    { label: 'Aceite vegetal' },
    h_pescado: { label: 'Harina de pescado', mercado: 'harina de pescado' },
    carbonato: { label: 'Carbonato de calcio', mercado: 'carbonato de calcio' },
    fosfato:   { label: 'Fosfato dicálcico' },
    sal:       { label: 'Sal común', mercado: 'sal' },
    premezcla: { label: 'Premezcla vitamínico-mineral' },
    metionina: { label: 'DL-Metionina' },
    lisina:    { label: 'L-Lisina' },
    urea:      { label: 'Urea (NPN)',
                 aviso: '⚠️ SÓLO RUMIANTES. En cerdos, aves y caballos es tóxica. Incorporar bien mezclada y nunca de golpe.' },
  },

  /* Porcentajes de inclusión. Suman 100, y como el quintal son 100 libras,
     cada porcentaje se lee directo como libras por quintal. */
  _ESPECIES: {
    aves: {
      label: '🐔 Gallinas y pollos', icon: '🐔',
      formulas: [
        { nombre: 'Pollo de engorde — inicio (0-3 sem)', consumo: 0.06, animal: 'pollo', ing: { maiz: 56, soya: 34, aceite: 3, carbonato: 1.5, fosfato: 1.8, sal: 0.4, premezcla: 0.5, metionina: 0.3, lisina: 0.2, h_pescado: 2.3 } },
        { nombre: 'Pollo de engorde — finalizador', consumo: 0.16, animal: 'pollo',      ing: { maiz: 62, soya: 28, aceite: 4, carbonato: 1.3, fosfato: 1.5, sal: 0.4, premezcla: 0.5, metionina: 0.2, lisina: 0.1, salvado: 2 } },
        { nombre: 'Gallina ponedora', consumo: 0.115, animal: 'gallina',                    ing: { maiz: 60, soya: 24, carbonato: 9, fosfato: 1.5, sal: 0.4, premezcla: 0.5, metionina: 0.2, salvado: 4.4 } },
      ],
    },
    porcinos: {
      label: '🐖 Cerdos', icon: '🐖',
      formulas: [
        { nombre: 'Cerdo — iniciación', consumo: 1.0, animal: 'cerdo',  ing: { maiz: 62, soya: 26, melaza: 4, h_pescado: 3, carbonato: 1, fosfato: 1.2, sal: 0.4, premezcla: 0.4, lisina: 0.2, salvado: 1.8 } },
        { nombre: 'Cerdo — desarrollo', consumo: 2.0, animal: 'cerdo',  ing: { maiz: 66, soya: 22, melaza: 5, salvado: 3.5, carbonato: 1, fosfato: 1, sal: 0.4, premezcla: 0.4, lisina: 0.2, aceite: 0.5 } },
        { nombre: 'Cerdo — engorde', consumo: 3.0, animal: 'cerdo',     ing: { maiz: 70, soya: 18, melaza: 5, salvado: 4, carbonato: 1, fosfato: 0.9, sal: 0.4, premezcla: 0.4, lisina: 0.3 } },
      ],
    },
    bovinos: {
      label: '🐄 Bovinos', icon: '🐄',
      nota: 'Concentrado para complementar el forraje, no para reemplazarlo: el rumen necesita fibra larga (pasto, ensilaje o heno) o se acidifica.',
      formulas: [
        { nombre: 'Vaca lechera — concentrado', consumo: 6.0, animal: 'vaca', ing: { maiz: 40, sorgo: 12, soya: 16, melaza: 9, salvado: 18, carbonato: 1.6, sal: 1, premezcla: 0.6, urea: 0.8, fosfato: 1 } },
        { nombre: 'Engorde — concentrado', consumo: 5.0, animal: 'novillo',      ing: { maiz: 45, sorgo: 15, soya: 12, melaza: 10, salvado: 13, carbonato: 1.6, sal: 1, premezcla: 0.5, urea: 1, fosfato: 0.9 } },
      ],
    },
    equinos: {
      label: '🐴 Caballos', icon: '🐴',
      nota: 'El caballo NO es rumiante: nada de urea, y los cambios de ración se hacen en 7-10 días para no provocar cólico.',
      formulas: [
        { nombre: 'Caballo — mantenimiento', consumo: 2.5, animal: 'caballo', ing: { avena: 45, maiz: 18, salvado: 17, soya: 8, melaza: 8, carbonato: 1.2, sal: 1, premezcla: 0.8, aceite: 1 } },
        { nombre: 'Caballo — trabajo', consumo: 4.5, animal: 'caballo',       ing: { avena: 40, maiz: 24, salvado: 14, soya: 10, melaza: 8, carbonato: 1.2, sal: 1, premezcla: 0.8, aceite: 1 } },
      ],
    },
  },

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const nombresMaga = [...new Set(Object.values(this._ING).map(i => i.maga).filter(Boolean))];
    [this._insumos, this._ref, this._mercado] = await Promise.all([
      DB.getAgroInsumos(),
      DB.getRefDiariaMaga(nombresMaga).catch(() => ({})),
      DB.getPreciosMercado().catch(() => ({})),
    ]);

    const esp = this._ESPECIES[this._especie];
    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">🧪 Fórmulas de alimentación</h1>
          <p class="page-subtitle">// Costeadas con el precio mayorista del día · maíz, maicillo y soya desde el MAGA</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.formulas_alimento.modalInsumo()">＋ Precio de insumo</button>
        </div>
      </div>
      <div class="page-body">
        ${Modulos.venta_granos?._tabsHTML ? Modulos.venta_granos._tabsHTML() : ''}
        <div class="alert alert-amber" style="margin-bottom:12px">
          <div class="alert-icon">📋</div>
          <div class="alert-body" style="font-size:12px">
            Son <b>fórmulas de referencia</b> para cotizar y tener una base. No sustituyen a un
            zootecnista formulando por requerimiento, etapa y análisis de la materia prima que
            usted compró. Verifique siempre las advertencias de cada ingrediente.
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;justify-content:space-between;align-items:center">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Object.entries(this._ESPECIES).map(([k, v]) =>
            `<button class="btn btn-sm ${this._especie === k ? 'btn-cyan' : 'btn-ghost'}"
                     onclick="Modulos.formulas_alimento._irEspecie('${k}')">${v.label}</button>`).join('')}
          </div>
          ${this._selectorUnidadHTML()}
        </div>
        ${esp.nota ? `<div class="card" style="padding:10px 12px;margin-bottom:12px;border-left:3px solid var(--cyan);font-size:12px">${UI.esc(esp.nota)}</div>` : ''}
        ${esp.formulas.map(f => this._formulaHTML(f)).join('')}
        ${this._sustitucionHTML()}
        ${this._insumosHTML()}
      </div>`;
  },

  _irEspecie(k) { this._especie = k; this.render(); },

  /* Precio por quintal de un ingrediente: primero el del MAGA (es de hoy y no
     hay que mantenerlo), si no el que cargó el comercio. Devuelve null cuando
     no hay ninguno — y entonces el costo se muestra como incompleto en vez de
     inventar un número. */
  _precioQq(clave) {
    const def = this._ING[clave];
    if (!def) return null;

    /* El precio que cargó el comercio manda sobre todo: es lo que de verdad
       paga. Después el MAGA, que es mayorista y del día. De último el
       menudeo, que es sólo un punto de partida. */
    const propio = this._insumos.find(i => i.nombre === def.label);
    if (propio) return { q: Number(propio.precio_quintal), fuente: 'tuyo', firme: true };

    if (def.maga && this._ref[def.maga]) return { q: this._ref[def.maga].precio, fuente: 'MAGA', firme: true };

    /* TENTATIVO. El supermercado vende presentacion de cocina, no de finca:
       la melaza sale ~Q37/kg cuando la forrajera anda por Q3-5. Sirve para
       tener una nocion y arrancar, NO para cotizar. Por eso viaja marcado y
       con el precio listo para corregir de un clic. */
    const m = def.mercado && this._mercado[def.mercado];
    if (m) {
      return {
        q: +(m.precio_kg * 100 * this._LB_KG).toFixed(2),
        fuente: 'menudeo', firme: false,
        detalle: m.nombre + ' · ' + m.fuente + ' · ' + m.fecha,
      };
    }
    return null;
  },

  /* Toma el precio tentativo y abre el editor con ese numero puesto, para
     ajustarlo al que realmente paga. Un clic entre "nocion" y "dato". */
  _ajustar(clave) {
    const def = this._ING[clave];
    const p = this._precioQq(clave);
    this.modalInsumo(null, { nombre: def ? def.label : '', precio: p ? p.q : '', nota: p && p.detalle ? p.detalle : '' });
  },

  /* A cuantos animales les da un quintal en un dia. Es la cuenta que hace el
     productor de cabeza y la que decide la compra. */
  _rendimiento(f, costoQq, completo) {
    if (!f.consumo) return '';
    const animales = (100 * this._LB_KG) / f.consumo;
    const racion = this._unidad === 'kg'
      ? f.consumo.toFixed(2) + ' kg'
      : (f.consumo / this._LB_KG < 1
          ? (f.consumo * 1000).toFixed(0) + ' g'
          : (f.consumo / this._LB_KG).toFixed(2) + ' lb');
    const porAnimal = completo ? costoQq / animales : null;
    return `<div style="padding:9px 12px;border-top:1px solid var(--border);font-size:12.5px;background:var(--surface2)">
      🐾 Un quintal alimenta <b>${Math.floor(animales)} ${UI.esc(f.animal)}${Math.floor(animales) === 1 ? '' : 's'}</b> por un día
      <span style="color:var(--text3)">(ración de ${racion} por animal al día)</span>
      ${porAnimal !== null ? ' · <b style="color:var(--green)">Q' + porAnimal.toFixed(2) + ' por ' + UI.esc(f.animal) + ' al día</b>' : ''}
      <div style="font-size:11px;color:var(--text3);margin-top:3px">
        El consumo es un promedio de la etapa: varía con el peso, el clima y la genética.
        Pesá lo que realmente comen una semana y ajustá.
      </div>
    </div>`;
  },

  _formulaHTML(f) {
    const filas = Object.entries(f.ing);
    let costo = 0, faltan = [], tentativos = [];
    filas.forEach(([k, pct]) => {
      const p = this._precioQq(k);
      if (!p) { faltan.push(this._ING[k]?.label || k); return; }
      costo += p.q * (pct / 100);
      if (!p.firme) tentativos.push(this._ING[k]?.label || k);
    });
    const avisos = filas.map(([k]) => this._ING[k]?.aviso).filter(Boolean);
    const total = filas.reduce((s, [, p]) => s + p, 0);

    return `<div class="card" style="padding:0;margin-bottom:14px">
      <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div style="font-weight:800;font-size:14px">${UI.esc(f.nombre)}</div>
        <div style="text-align:right">
          ${faltan.length
            ? `<span class="badge badge-amber">Costo incompleto</span>`
            : `<div style="font-size:16px;font-weight:800;color:var(--green)">Q${costo.toFixed(2)}<span style="font-size:11px;color:var(--text3)">/quintal</span></div>
               <div style="font-size:11px;color:var(--text3)">Q${this._costoUnitario(costo).valor.toFixed(2)} ${this._costoUnitario(costo).etiqueta}</div>
               ${tentativos.length ? '<div style="font-size:10.5px;color:var(--amber)">estimado — lleva precios tentativos</div>' : ''}`}
        </div>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Ingrediente</th><th>%</th><th>${this._unidad === 'kg' ? 'Kilos' : 'Libras'} por quintal</th><th>Precio qq</th><th>Costo</th></tr></thead>
        <tbody>
          ${filas.map(([k, pct]) => {
            const p = this._precioQq(k);
            return `<tr>
              <td>${UI.esc(this._ING[k]?.label || k)}${this._ING[k]?.aviso ? ' <span title="tiene advertencia">⚠️</span>' : ''}</td>
              <td>${pct}%</td>
              <td>${this._masa(pct)}</td>
              <td>${p
                ? `Q${p.q.toFixed(2)}
                   <span style="font-size:10px;color:${p.firme ? 'var(--text3)' : 'var(--amber)'}">${p.firme ? p.fuente : 'tentativo · menudeo'}</span>
                   ${p.firme ? '' : `<button class="btn btn-xs btn-ghost" style="margin-left:4px" title="${UI.esc(p.detalle || '')}" onclick="Modulos.formulas_alimento._ajustar('${k}')">ajustar</button>`}`
                : `<span style="color:var(--amber)">falta precio</span>
                   <button class="btn btn-xs btn-ghost" onclick="Modulos.formulas_alimento._ajustar('${k}')">poner</button>`}</td>
              <td>${p ? 'Q' + (p.q * pct / 100).toFixed(2) : '—'}</td>
            </tr>`;
          }).join('')}
          <tr><td colspan="4" style="text-align:right;font-weight:700">Total (${total.toFixed(1)}%)</td>
              <td style="font-weight:800">${faltan.length ? '—' : 'Q' + costo.toFixed(2)}</td></tr>
        </tbody>
      </table></div>
      ${this._rendimiento(f, costo, !faltan.length)}
      ${tentativos.length ? `<div style="padding:8px 12px;font-size:11.5px;color:var(--amber)">
        ⚠️ Precio <b>tentativo</b> en: ${UI.esc(tentativos.join(', '))}. Salen del supermercado, que vende
        presentación de cocina y no de finca — dan una noción, pero casi siempre están por encima
        del precio de insumo. Tocá <b>ajustar</b> y poné el tuyo para que el costo sea real.
      </div>` : ''}
      ${faltan.length ? `<div style="padding:8px 12px;font-size:11.5px;color:var(--amber)">
        Falta el precio de: <b>${UI.esc(faltan.join(', '))}</b>. Cargalos con “＋ Precio de insumo” y el costo se calcula solo.
      </div>` : ''}
      ${avisos.length ? `<div style="padding:8px 12px;font-size:11.5px;color:var(--text2);border-top:1px solid var(--border)">
        ${avisos.map(a => `<div style="margin-bottom:3px">• ${UI.esc(a)}</div>`).join('')}
      </div>` : ''}
    </div>`;
  },

  /* Maíz vs maicillo: la decisión de sustituir es de precio, y el precio
     cambia todos los días. Se compara por quintal con el dato de hoy. */
  _sustitucionHTML() {
    const maiz = this._precioQq('maiz') || this._precioQq('maiz_b');
    const sorgo = this._precioQq('sorgo');
    if (!maiz || !sorgo) return '';
    const dif = ((sorgo.q - maiz.q) / maiz.q) * 100;
    const conviene = dif < -5;
    return `<div class="card" style="padding:12px;margin-bottom:14px;border-left:3px solid ${conviene ? 'var(--green)' : 'var(--text3)'}">
      <div style="font-weight:800;font-size:13px;margin-bottom:4px">🔁 ¿Conviene cambiar maíz por maicillo hoy?</div>
      <div style="font-size:13px">
        Maíz <b>Q${maiz.q.toFixed(2)}</b>/qq · Maicillo <b>Q${sorgo.q.toFixed(2)}</b>/qq
        (${dif > 0 ? '+' : ''}${dif.toFixed(1)}%).
        ${conviene
          ? '<b style="color:var(--green)">Sí:</b> el maicillo está más barato. Sustituí hasta la mitad del maíz y observá consumo y ganancia de peso.'
          : '<b>Hoy no.</b> Con esa diferencia no compensa: el sorgo aporta algo menos de energía y trae taninos.'}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">
        En aves conviene no sustituir más del 50% del maíz. En rumiantes se tolera bastante más.
      </div>
    </div>`;
  },

  /* CRUD de precios propios: crear, ver, editar y eliminar. */
  _insumosHTML() {
    return `<div class="card" style="padding:0">
      <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:800;font-size:13px">
        💵 Tus precios de insumos
        <span style="font-weight:400;font-size:11px;color:var(--text3)">— el MAGA sólo publica maíz, maicillo y soya; el resto lo ponés vos</span>
      </div>
      ${this._insumos.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Insumo</th><th>Precio por quintal</th><th>Nota</th><th>Acciones</th></tr></thead>
        <tbody>${this._insumos.map(i => `<tr>
          <td><b>${UI.esc(i.nombre)}</b></td>
          <td>Q${Number(i.precio_quintal).toFixed(2)}</td>
          <td style="font-size:12px;color:var(--text3)">${UI.esc(i.nota || '—')}</td>
          <td><div style="display:flex;gap:4px">
            ${Modulos.btnAccion('editar', `Modulos.formulas_alimento.modalInsumo('${i.id}')`)}
            ${Modulos.btnAccion('eliminar', `Modulos.formulas_alimento.eliminarInsumo('${i.id}','${UI.escUI.jsAttr(i.nombre)}')`)}
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>` : `<div style="padding:16px;font-size:13px;color:var(--text3)">
        Todavía no cargaste precios. Sin ellos, el costo de las fórmulas queda incompleto — a propósito:
        preferimos no mostrar un número antes que mostrar uno inventado.</div>`}
    </div>`;
  },

  modalInsumo(id = null, precargar = null) {
    const i = id ? this._insumos.find(x => x.id === id) : (precargar
      ? { nombre: precargar.nombre, precio_quintal: precargar.precio, nota: precargar.nota }
      : null);
    const sugeridos = Object.values(this._ING).filter(x => !x.maga).map(x => x.label);
    UI.modal(`${i ? '✏️ Editar' : '＋ Nuevo'} precio de insumo`, `
      <div class="form-group">
        <label class="form-label">Insumo *</label>
        <input class="form-input" id="ins-nombre" list="ins-sugeridos" value="${i ? UI.esc(i.nombre) : ''}" placeholder="Melaza de caña">
        <datalist id="ins-sugeridos">${sugeridos.map(s => `<option value="${UI.esc(s)}">`).join('')}</datalist>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Usá el nombre de la lista para que la fórmula lo tome automáticamente.
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Precio por quintal (Q) *</label>
        <input class="form-input" id="ins-precio" type="number" min="0" step="0.01" value="${i ? i.precio_quintal : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Nota</label>
        <input class="form-input" id="ins-nota" value="${i ? UI.esc(i.nota || '') : ''}" placeholder="Proveedor, fecha de la cotización...">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.formulas_alimento.guardarInsumo(${id ? `'${id}'` : 'null'})">Guardar</button>
      </div>`);
  },

  async guardarInsumo(id) {
    const nombre = document.getElementById('ins-nombre')?.value.trim();
    const precio = parseFloat(document.getElementById('ins-precio')?.value);
    const nota = document.getElementById('ins-nota')?.value.trim() || null;
    if (!nombre) { UI.toast('Poné el nombre del insumo', 'error'); return; }
    if (!isFinite(precio) || precio < 0) { UI.toast('El precio no es válido', 'error'); return; }
    const { error } = await DB.guardarAgroInsumo({ id, nombre, precio_quintal: precio, nota });
    if (error) { UI.toast('No se pudo guardar: ' + error.message, 'error'); return; }
    UI.toast('Guardado ✓', 'success');
    UI.cerrarModal();
    this.render();
  },

  async eliminarInsumo(id, nombre) {
    Modulos.eliminarRegistro('agro_insumos', id, nombre, () => this.render());
  },
};
