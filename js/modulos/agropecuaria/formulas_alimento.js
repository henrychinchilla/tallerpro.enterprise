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
    alfalfa:   { label: 'Harina de alfalfa',
                 aviso: 'Es la FIBRA de la fórmula del conejo, no un relleno: cambiarla por grano para abaratar es lo que produce las diarreas.' },
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
    /* Las cuatro de arriba eran TODO lo que traía la app. Un agroservicio
       guatemalteco vende también a quien cría conejos, ovejas, patos,
       codornices y tilapia — y esa gente llegaba a una parrilla en blanco.
       Siguen siendo fórmulas DE REFERENCIA, del tipo que publican las guías de
       extensión: sirven de punto de partida y se ajustan. */
    conejos: {
      label: '🐇 Conejos', icon: '🐇',
      nota: 'El conejo vive de la FIBRA: por debajo de 12-14% de fibra cruda vienen las diarreas, que es lo que mata camadas enteras. La alfalfa de esta fórmula no se cambia por más grano para abaratar.',
      formulas: [
        { nombre: 'Conejo — engorde (30-70 días)', consumo: 0.12, animal: 'conejo', ing: { alfalfa: 40, salvado: 18, maiz: 17, soya: 16, melaza: 5, aceite: 1.5, carbonato: 1.5, sal: 0.5, premezcla: 0.5 } },
        { nombre: 'Coneja — lactancia', consumo: 0.25, animal: 'coneja',            ing: { alfalfa: 38, soya: 19, maiz: 19, salvado: 15, melaza: 4, aceite: 2, carbonato: 1.5, sal: 0.5, premezcla: 0.5, fosfato: 0.5 } },
      ],
    },
    ovinos: {
      label: '🐑 Ovejas y cabras', icon: '🐑',
      nota: 'Es COMPLEMENTO del pasto, no reemplazo: el rumen necesita fibra larga. Va sin urea a propósito — en ovinos y caprinos el margen entre la dosis útil y la tóxica es más chico que en bovinos.',
      formulas: [
        { nombre: 'Oveja/cabra — concentrado', consumo: 0.5, animal: 'oveja',   ing: { maiz: 42, salvado: 18, sorgo: 15, soya: 12, melaza: 9, carbonato: 1.5, fosfato: 1, sal: 1, premezcla: 0.5 } },
        { nombre: 'Cabra lechera — concentrado', consumo: 0.8, animal: 'cabra', ing: { maiz: 38, salvado: 18, soya: 16, sorgo: 14, melaza: 9, carbonato: 2, fosfato: 1, sal: 1, premezcla: 1 } },
      ],
    },
    patos: {
      label: '🦆 Patos y codornices', icon: '🦆',
      nota: 'El pato come mojado y desperdicia: la comedera va con agua cerca pero no encima. La codorniz ponedora necesita bastante calcio, igual que la gallina.',
      formulas: [
        { nombre: 'Pato — engorde', consumo: 0.15, animal: 'pato',            ing: { maiz: 58, soya: 26, salvado: 6, h_pescado: 4, carbonato: 2, aceite: 1.6, fosfato: 1.5, premezcla: 0.5, sal: 0.4 } },
        { nombre: 'Codorniz — ponedora', consumo: 0.025, animal: 'codorniz',  ing: { maiz: 55, soya: 30, carbonato: 6.5, h_pescado: 3, aceite: 2.8, fosfato: 1.5, premezcla: 0.5, sal: 0.4, metionina: 0.3 } },
      ],
    },
    /* LA TILAPIA NO COME LO MISMO TODA SU VIDA, y la diferencia no es un
       matiz: el alevín necesita casi el DOBLE de proteína que el pez de
       engorde, y en polvo en vez de pellet. Darle el alimento de engorde a un
       alevín no lo mata — crece lento y se muere más, que es plata perdida
       justo en la fase más cara. Por eso son tres fórmulas y no una.
       La proteína baja a medida que el pez crece; lo que sube es el maíz. */
    peces: {
      label: '🐟 Tilapia', icon: '🐟',
      nota: 'La forma FÍSICA del alimento cambia con la etapa: polvo para el alevín, migaja para el dedino y pellet para el engorde. Un alevín no puede morder un pellet de 3 mm, y el pellet en harina se deshace en el agua — se pierde el alimento y se ensucia el estanque. Si no tenés peletizadora, usá estas fórmulas para comparar precios contra el alimento hecho.',
      formulas: [
        { nombre: 'Tilapia — alevín (40-45% proteína)', consumo: 0.0001, animal: 'alevín',
          ing: { soya: 42, h_pescado: 30, maiz: 12, salvado: 7, aceite: 4, premezcla: 2, fosfato: 1.5, carbonato: 1, metionina: 0.5 },
          nota: 'Va en POLVO fino, repartido 6 a 8 veces al día: el alevín tiene el estómago del tamaño de su ojo y no aguanta la ración de un día de una sola vez. El consumo de acá es un promedio de la etapa (~0.1 g por alevín al día); en la práctica se da del 10 al 20% del peso vivo. La harina de pescado es la que sostiene la proteína — bajarla para abaratar es lo que frena el crecimiento en la etapa que más se nota.' },
        { nombre: 'Tilapia — dedino/juvenil (35% proteína)', consumo: 0.0005, animal: 'dedino',
          ing: { soya: 45, h_pescado: 18, maiz: 17, salvado: 12, aceite: 3.5, premezcla: 1.5, fosfato: 1.5, carbonato: 1, metionina: 0.5 },
          nota: 'De 1 a 30 gramos, en migaja o pellet fino, 4 veces al día. El cambio de ración se hace en varios días, no de golpe.' },
        { nombre: 'Tilapia — engorde (28-30% proteína)', consumo: 0.02, animal: 'tilapia',
          ing: { soya: 38, maiz: 25, salvado: 18, h_pescado: 12, aceite: 3, fosfato: 1.5, carbonato: 1, premezcla: 1, metionina: 0.5 },
          nota: 'De 30 gramos a cosecha, en pellet de 3-4 mm, 2 a 3 veces al día.' },
      ],
    },
  },

  /* Fórmulas propias del comercio (mig 134). Se cargan aparte de las de
     referencia y se juntan por especie: para el usuario son todas "fórmulas",
     la diferencia es que las suyas se editan y las de referencia se copian. */
  _propias: [],

  /* Las especies que se muestran como pestañas: las de referencia MÁS las que
     el comercio inventó. Un agroservicio real formula para conejos, tilapia u
     ovejas, y antes eso no cabía en ningún lado. */
  _especies() {
    const mapa = {};
    Object.entries(this._ESPECIES).forEach(([k, v]) => {
      mapa[k] = { label: v.label, nota: v.nota, formulas: v.formulas.slice() };
    });
    (this._propias || []).forEach(f => {
      const k = f.especie || 'otros';
      if (!mapa[k]) mapa[k] = { label: f.especie_label || k, formulas: [] };
      mapa[k].formulas.push(f);
    });
    return mapa;
  },

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const nombresMaga = [...new Set(Object.values(this._ING).map(i => i.maga).filter(Boolean))];
    [this._insumos, this._ref, this._mercado, this._propias] = await Promise.all([
      DB.getAgroInsumos(),
      DB.getRefDiariaMaga(nombresMaga).catch(() => ({})),
      DB.getPreciosMercado().catch(() => ({})),
      DB.getAgroFormulas().catch(() => []),
    ]);

    const especies = this._especies();
    /* Si la especie activa era una propia y se borró, no dejar la pantalla en
       blanco: se cae a la primera que exista. */
    if (!especies[this._especie]) this._especie = Object.keys(especies)[0];
    const esp = especies[this._especie] || { formulas: [] };
    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">🧪 Fórmulas de alimentación</h1>
          <p class="page-subtitle">// Costeadas con el precio mayorista del día · maíz, maicillo y soya desde el MAGA</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.formulas_alimento.modalInsumo()">＋ Precio de insumo</button>
          <button class="btn btn-amber" onclick="Modulos.formulas_alimento.modalFormula()">＋ Nueva fórmula</button>
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
          ${Object.entries(especies).map(([k, v]) =>
            `<button class="btn btn-sm ${this._especie === k ? 'btn-cyan' : 'btn-ghost'}"
                     onclick="Modulos.formulas_alimento._irEspecie('${UI.jsAttr(k)}')">${UI.esc(v.label)}</button>`).join('')}
          </div>
          ${this._selectorUnidadHTML()}
        </div>
        ${esp.nota ? `<div class="card" style="padding:10px 12px;margin-bottom:12px;border-left:3px solid var(--cyan);font-size:12px">${UI.esc(esp.nota)}</div>` : ''}
        ${esp.formulas.length
          ? esp.formulas.map(f => this._formulaHTML(f)).join('')
          : `<div class="card" style="padding:16px;font-size:13px;color:var(--text3);margin-bottom:14px">
               Esta especie todavía no tiene fórmulas. Creá una con <b>＋ Nueva fórmula</b>.</div>`}
        ${this._sustitucionHTML()}
        ${this._insumosHTML()}
      </div>`;
  },

  _irEspecie(k) { this._especie = k; this.render(); },

  /* Precio por quintal de un ingrediente, buscado POR NOMBRE. Se busca por
     nombre y no por clave para que las fórmulas propias del comercio —donde el
     ingrediente lo escribe el usuario— usen exactamente el mismo camino que
     las de referencia. Devuelve null cuando no hay ningún precio: entonces el
     costo se muestra incompleto en vez de inventar un número.

     TODO PRECIO SE PUEDE PISAR. El orden es: lo que el comercio cargó a mano
     (agro_insumos) manda SIEMPRE, incluso sobre el MAGA — es lo que de verdad
     paga él, y el MAGA es un promedio mayorista nacional. Después el MAGA, que
     es del día y no hay que mantener. De último el menudeo, que es sólo un
     punto de partida y viaja marcado como tentativo. */
  _precioDe(nombre) {
    const propio = this._insumos.find(i => i.nombre === nombre);
    if (propio) {
      return { q: Number(propio.precio_quintal), fuente: 'tuyo', firme: true, insumoId: propio.id };
    }

    const def = Object.values(this._ING).find(x => x.label === nombre);
    if (def) {
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
    }
    return null;
  },

  /* Por clave del catálogo interno (lo usa la comparación maíz/maicillo). */
  _precioQq(clave) {
    const def = this._ING[clave];
    return def ? this._precioDe(def.label) : null;
  },

  /* Advertencia del ingrediente, buscada por nombre: una fórmula propia que
     lleve urea tiene que traer el mismo aviso que una de referencia. La urea
     mata a un caballo — que el aviso dependa de cómo se creó la fórmula sería
     el peor lugar posible para una inconsistencia. */
  _avisoDe(nombre) {
    return (Object.values(this._ING).find(x => x.label === nombre) || {}).aviso || '';
  },

  /* Los ingredientes de una fórmula, venga de donde venga: las de referencia
     los traen como {clave: %}, las propias como [{nombre, pct}]. Acá se
     emparejan para que todo lo de abajo no tenga que saber la diferencia. */
  _ingredientes(f) {
    if (Array.isArray(f.ingredientes)) {
      return f.ingredientes
        .filter(x => x && x.nombre)
        .map(x => ({ nombre: x.nombre, pct: Number(x.pct) || 0 }));
    }
    return Object.entries(f.ing || {}).map(([k, pct]) => ({ nombre: this._ING[k]?.label || k, pct }));
  },

  /* Abre el editor de precio con el número actual puesto, sea de donde sea:
     del MAGA, del menudeo o ninguno. Un clic entre "el dato que baja solo" y
     "lo que yo pago". */
  _ajustar(nombre) {
    const p = this._precioDe(nombre);
    if (p && p.insumoId) return this.modalInsumo(p.insumoId);   // ya es tuyo: editarlo
    this.modalInsumo(null, { nombre, precio: p ? p.q : '', nota: p && p.detalle ? p.detalle : '' });
  },

  /* Vuelve al precio automático borrando la sobreescritura. Existe porque
     pisar un precio no puede ser un camino de una sola dirección: el día que
     el del MAGA vuelva a servir, hay que poder soltarlo. */
  async _soltarPrecio(nombre) {
    const p = this._precioDe(nombre);
    if (!p?.insumoId) return;
    const ok = await UI.confirmar(
      `¿Volver al precio automático de <b>${UI.esc(nombre)}</b>? Se borra el precio que cargaste.`, 'Volver al automático');
    if (!ok) return;
    const exito = await DB.deleteRegistro('agro_insumos', p.insumoId);
    if (!exito) { UI.toast('No se pudo quitar el precio', 'error'); return; }
    UI.toast('Listo: vuelve a tomar el precio automático ✓');
    this.render();
  },

  /* A cuantos animales les da un quintal en un dia. Es la cuenta que hace el
     productor de cabeza y la que decide la compra. */
  /* Plural del animal. Con "pollo" bastaba pegarle una s, pero al entrar los
     alevines quedaba "453592 alevíns". Las reglas que hacen falta de verdad:
     -ín/-ón pierden el acento y suman -es (alevín → alevines), lo que termina
     en consonante suma -es, y el resto la s de siempre. */
  _plural(animal) {
    const a = String(animal || '');
    if (/ín$/i.test(a)) return a.replace(/ín$/i, 'ines');
    if (/ón$/i.test(a)) return a.replace(/ón$/i, 'ones');
    if (/z$/i.test(a))  return a.replace(/z$/i, 'ces');   // codorniz → codornices
    if (/[aeiouáéíóú]$/i.test(a)) return a + 's';
    return a + 'es';
  },

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
      🐾 Un quintal alimenta <b>${UI.numero(Math.floor(animales), 0)} ${UI.esc(Math.floor(animales) === 1 ? f.animal : this._plural(f.animal))}</b> por un día
      <span style="color:var(--text3)">(ración de ${racion} por animal al día)</span>
      ${porAnimal !== null ? ' · <b style="color:var(--green)">' + (
        /* Un alevín come tan poco que el costo por cabeza sale "Q0.00", que no
           le dice nada a nadie. Por debajo del centavo se muestra por MILLAR,
           que además es como se compran y se cuentan los alevines. */
        porAnimal < 0.01
          ? 'Q' + (porAnimal * 1000).toFixed(2) + ' por millar al día'
          : 'Q' + porAnimal.toFixed(2) + ' por ' + UI.esc(f.animal) + ' al día'
      ) + '</b>' : ''}
      <div style="font-size:11px;color:var(--text3);margin-top:3px">
        El consumo es un promedio de la etapa: varía con el peso, el clima y la genética.
        Pesá lo que realmente comen una semana y ajustá.
      </div>
    </div>`;
  },

  _formulaHTML(f) {
    const filas = this._ingredientes(f);
    let costo = 0, faltan = [], tentativos = [];
    filas.forEach(({ nombre, pct }) => {
      const p = this._precioDe(nombre);
      if (!p) { faltan.push(nombre); return; }
      costo += p.q * (pct / 100);
      if (!p.firme) tentativos.push(nombre);
    });
    const avisos = filas.map(x => this._avisoDe(x.nombre)).filter(Boolean);
    const total = filas.reduce((s, x) => s + x.pct, 0);
    const propia = !!f.id;                                  // las de referencia no tienen id

    return `<div class="card" style="padding:0;margin-bottom:14px">
      <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div>
          <div style="font-weight:800;font-size:14px">${UI.esc(f.nombre)}
            ${propia ? '<span class="badge badge-cyan" style="margin-left:6px">Tuya</span>'
                     : '<span class="badge badge-gray" style="margin-left:6px">De referencia</span>'}</div>
          <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
            ${propia
              ? `${Modulos.btnAccion('editar', `Modulos.formulas_alimento.modalFormula('${f.id}')`)}
                 ${Modulos.btnAccion('eliminar', `Modulos.formulas_alimento.eliminarFormula('${f.id}','${UI.jsAttr(f.nombre)}')`)}`
              : `<button class="btn btn-sm btn-ghost" title="Copiarla como fórmula tuya para ajustar porcentajes e ingredientes"
                         onclick="Modulos.formulas_alimento.copiarFormula('${UI.jsAttr(f.nombre)}')">📋 Copiar y ajustar</button>`}
          </div>
        </div>
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
          ${filas.map(({ nombre, pct }) => {
            const p = this._precioDe(nombre);
            const aviso = this._avisoDe(nombre);
            /* TODAS las filas llevan botón, incluidas las que trae el MAGA:
               el precio de la bodega del comercio no es el promedio nacional,
               y sin este botón el costo de la fórmula nunca era el suyo. */
            const editar = `<button class="btn btn-xs btn-ghost" style="margin-left:4px"
              title="${p ? 'Poner el precio que vos pagás (manda sobre el automático)' : 'Cargar el precio de este insumo'}"
              onclick="Modulos.formulas_alimento._ajustar('${UI.jsAttr(nombre)}')">${p ? '✏️' : 'poner'}</button>`;
            const soltar = p && p.insumoId
              ? `<button class="btn btn-xs btn-ghost" title="Volver al precio automático"
                   onclick="Modulos.formulas_alimento._soltarPrecio('${UI.jsAttr(nombre)}')">↩︎</button>` : '';
            return `<tr>
              <td>${UI.esc(nombre)}${aviso ? ' <span title="tiene advertencia">⚠️</span>' : ''}</td>
              <td>${pct}%</td>
              <td>${this._masa(pct)}</td>
              <td>${p
                ? `Q${p.q.toFixed(2)}
                   <span style="font-size:10px;color:${p.firme ? 'var(--text3)' : 'var(--amber)'}">${p.firme ? p.fuente : 'tentativo · menudeo'}</span>
                   ${editar}${soltar}`
                : `<span style="color:var(--amber)">falta precio</span>${editar}`}</td>
              <td>${p ? 'Q' + (p.q * pct / 100).toFixed(2) : '—'}</td>
            </tr>`;
          }).join('')}
          <tr><td colspan="4" style="text-align:right;font-weight:700">Total (${total.toFixed(1)}%)</td>
              <td style="font-weight:800">${faltan.length ? '—' : 'Q' + costo.toFixed(2)}</td></tr>
        </tbody>
      </table></div>
      ${f.nota ? `<div style="padding:8px 12px;font-size:11.5px;color:var(--text2)">📝 ${UI.esc(f.nota)}</div>` : ''}
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
            ${Modulos.btnAccion('eliminar', `Modulos.formulas_alimento.eliminarInsumo('${i.id}','${UI.jsAttr(i.nombre)}')`)}
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

  /* ══ FÓRMULAS PROPIAS — CRUD COMPLETO ══════════════════════════════════════
     Las de referencia se ven y se copian; las propias se crean, se editan y se
     borran. La especie es texto libre con sugerencias: la app no puede tener
     una lista cerrada de animales, porque el productor de al lado cría
     codornices y el de más allá tilapia. */

  /* Nombres de ingrediente que se ofrecen: los del catálogo interno (que traen
     precio del MAGA o de menudeo) más los que el comercio ya cargó. */
  _nombresIngrediente() {
    const del = Object.values(this._ING).map(i => i.label);
    const mios = (this._insumos || []).map(i => i.nombre);
    return [...new Set([...del, ...mios])].sort();
  },

  /* Recibe el ingrediente ENTERO y no (nombre, pct) sueltos: así el nombre del
     usuario no aparece nunca crudo en una interpolación —se escapa acá
     adentro— y el detector de XSS (test/xss-escape.js) puede distinguir entre
     "pintar un campo" y "llamar a un renderizador". */
  _filaIngHTML(ing = {}) {
    const nombre = ing.nombre || '', pct = ing.pct ?? '';
    return `<div class="form-row form-ing" style="grid-template-columns:1fr 90px 40px;gap:6px;align-items:end;margin-bottom:6px">
      <div class="form-group" style="margin:0">
        <input class="form-input ing-nombre" list="form-ing-lista" value="${UI.esc(nombre)}" placeholder="Maíz amarillo">
      </div>
      <div class="form-group" style="margin:0">
        <input class="form-input ing-pct" type="number" min="0" max="100" step="0.1" value="${pct}" placeholder="%"
               oninput="Modulos.formulas_alimento._sumarPct()">
      </div>
      <button type="button" class="btn btn-sm btn-ghost" title="Quitar ingrediente"
              onclick="this.parentElement.remove();Modulos.formulas_alimento._sumarPct()">✕</button>
    </div>`;
  },

  /* El total tiene que verse mientras se escribe: una fórmula que suma 87% no
     está mal escrita a propósito casi nunca, y descubrirlo al guardar es tarde. */
  _sumarPct() {
    const cont = document.getElementById('form-ing-cont');
    const av = document.getElementById('form-ing-total');
    if (!cont || !av) return;
    const total = [...cont.querySelectorAll('.ing-pct')]
      .reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
    const ok = Math.abs(total - 100) < 0.05;
    av.innerHTML = `Suma: <b style="color:${ok ? 'var(--green)' : 'var(--amber)'}">${total.toFixed(1)}%</b>` +
      (ok ? ' ✓' : ' — una fórmula completa suma 100%');
  },

  _agregarIng() {
    const cont = document.getElementById('form-ing-cont');
    if (cont) { cont.insertAdjacentHTML('beforeend', this._filaIngHTML()); this._sumarPct(); }
  },

  /* Copia una fórmula de referencia como propia: es la forma más rápida de
     "ajustarla", que es lo que de verdad hace el que formula — parte de una
     base conocida y le mueve los porcentajes. */
  copiarFormula(nombre) {
    const base = (this._ESPECIES[this._especie]?.formulas || []).find(f => f.nombre === nombre);
    if (!base) { UI.toast('No se encontró la fórmula de referencia', 'error'); return; }
    this.modalFormula(null, {
      nombre: base.nombre + ' (ajustada)',
      animal: base.animal, consumo: base.consumo,
      especie: this._especie,
      ingredientes: this._ingredientes(base),
    });
  },

  /* Todas las fórmulas de referencia, de todas las especies, aplanadas: es lo
     que se ofrece como punto de partida al crear una nueva. */
  _sugerencias() {
    return Object.entries(this._ESPECIES).flatMap(([k, esp]) =>
      esp.formulas.map(f => ({ clave: `${k}|${f.nombre}`, especie: k, espLabel: esp.label, f })));
  },

  /* Carga una fórmula de referencia dentro del formulario. Reabre el modal con
     la base puesta en vez de tocar el DOM campo por campo: son ~10 renglones de
     ingredientes que hay que crear y numerar, y reabrir usa el mismo camino que
     "copiar y ajustar", que ya está probado. */
  _sugerir(clave) {
    if (!clave) return this.modalFormula();
    const s = this._sugerencias().find(x => x.clave === clave);
    if (!s) return;
    this.modalFormula(null, {
      nombre: s.f.nombre + ' (ajustada)', animal: s.f.animal, consumo: s.f.consumo,
      especie: s.especie, nota: this._ESPECIES[s.especie]?.nota || '',
      ingredientes: this._ingredientes(s.f),
    });
  },

  modalFormula(id = null, base = null) {
    const f = id ? (this._propias || []).find(x => x.id === id) : base;
    const especies = this._especies();
    const espActual = f?.especie || this._especie;
    const ings = f ? this._ingredientes(f) : [{ nombre: '', pct: '' }, { nombre: '', pct: '' }];
    const animales = [...new Set([
      ...Object.values(this._ESPECIES).flatMap(e => e.formulas.map(x => x.animal)),
      'perro', 'pavo', 'ganso', 'cuy', 'camarón',
    ])].sort();

    /* El grupo va en un <select> y NO en un input con datalist: el navegador
       FILTRA el datalist por lo que el campo ya trae, así que al venir
       precargado con "aves" se veía una sola opción y parecía que no había
       más grupos. Con un select se ven todos, y "otro" abre el campo libre. */
    const esNuevoGrupo = !especies[espActual];
    const opcionesGrupo = Object.entries(especies)
      .map(([k, v]) => `<option value="${UI.esc(k)}" ${k === espActual ? 'selected' : ''}>${UI.esc(v.label)}</option>`).join('');

    UI.modal(`${id ? '✏️ Editar' : '＋ Nueva'} fórmula`, `
      ${id ? '' : `
      <div class="form-group">
        <label class="form-label">¿Partir de una fórmula de referencia?</label>
        <select class="form-select" onchange="Modulos.formulas_alimento._sugerir(this.value)">
          <option value="">— Empezar en blanco —</option>
          ${this._sugerencias().map(s =>
            `<option value="${UI.jsAttr(s.clave)}" ${base && base.nombre === s.f.nombre + ' (ajustada)' ? 'selected' : ''}>${UI.esc(s.espLabel)} · ${UI.esc(s.f.nombre)}</option>`).join('')}
        </select>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">
          Trae los ingredientes y porcentajes ya puestos para que los ajustes a lo que vos mezclás. Es lo más rápido, incluso para un animal parecido.
        </div>
      </div>`}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre de la fórmula *</label>
          <input class="form-input" id="form-f-nombre" value="${f ? UI.esc(f.nombre) : ''}" placeholder="Conejo — engorde"></div>
        <div class="form-group"><label class="form-label">Animal *</label>
          <input class="form-input" id="form-f-animal" value="${f ? UI.esc(f.animal || '') : ''}" placeholder="conejo"
                 list="form-animal-lista">
          <datalist id="form-animal-lista">${animales.map(a => `<option value="${UI.esc(a)}">`).join('')}</datalist>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">En singular, y puede ser cualquiera: se usa para decir "alimenta 38 conejos por un día".</div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Grupo (pestaña) *</label>
          <select class="form-select" id="form-f-especie" onchange="Modulos.formulas_alimento._grupoNuevo(this.value === '__nuevo')">
            ${opcionesGrupo}
            <option value="__nuevo" ${esNuevoGrupo ? 'selected' : ''}>➕ Otro grupo (escribirlo)…</option>
          </select>
          <input class="form-input" id="form-f-especie-nueva" style="margin-top:6px;display:${esNuevoGrupo ? 'block' : 'none'}"
                 value="${esNuevoGrupo ? UI.esc(espActual) : ''}" placeholder="conejos, tilapia, ovinos…">
          <div style="font-size:11px;color:var(--text3);margin-top:3px">Es la pestaña donde va a aparecer.</div></div>
        <div class="form-group"><label class="form-label">Consumo por animal al día (gramos) *</label>
          <input class="form-input" id="form-f-consumo" type="number" min="0" step="0.1" value="${f?.consumo != null ? +(f.consumo * 1000).toFixed(2) : ''}" placeholder="120">
          <div style="font-size:11px;color:var(--text3);margin-top:3px">
            En GRAMOS, que es como se pesa una ración: 120 g un conejo, 60 g un pollito, 6000 g (6 kg) una vaca.
            De acá sale a cuántos animales le alcanza un quintal.</div></div>
      </div>
      <div class="form-group">
        <label class="form-label">Ingredientes y % de inclusión *</label>
        <div id="form-ing-cont">${ings.map(i => this._filaIngHTML(i)).join('')}</div>
        <datalist id="form-ing-lista">${this._nombresIngrediente().map(n => `<option value="${UI.esc(n)}">`).join('')}</datalist>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px">
          <button type="button" class="btn btn-sm btn-ghost" onclick="Modulos.formulas_alimento._agregarIng()">＋ Agregar ingrediente</button>
          <span id="form-ing-total" style="font-size:12px;color:var(--text3)"></span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:6px">
          Como el quintal son 100 libras exactas, el % es directamente las libras por quintal.
          Si el ingrediente está en la lista, el costo se calcula solo con el precio del MAGA o el tuyo.
        </div>
      </div>
      <div class="form-group"><label class="form-label">Nota</label>
        <input class="form-input" id="form-f-nota" value="${f ? UI.esc(f.nota || '') : ''}" placeholder="Para la etapa de 30 a 60 días, con agua a voluntad"></div>
      <div class="alert alert-amber" style="margin-bottom:10px"><div class="alert-icon">⚠️</div>
        <div class="alert-body" style="font-size:11.5px">Las advertencias por ingrediente siguen aplicando en tu fórmula
          (la urea es sólo para rumiantes; la soya cruda trae inhibidores de tripsina). Revisá con un zootecnista antes de producir.</div></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.formulas_alimento.guardarFormula(${id ? `'${id}'` : 'null'})">Guardar fórmula</button>
      </div>`, '640px');
    this._sumarPct();
  },

  _grupoNuevo(mostrar) {
    const inp = document.getElementById('form-f-especie-nueva');
    if (inp) { inp.style.display = mostrar ? 'block' : 'none'; if (mostrar) inp.focus(); }
  },

  async guardarFormula(id) {
    const v = (el) => document.getElementById(el)?.value.trim() || '';
    const nombre = v('form-f-nombre'), animal = v('form-f-animal');
    /* El grupo sale del select, salvo que se haya elegido "otro". */
    const elegido = v('form-f-especie');
    const especie = elegido === '__nuevo' ? v('form-f-especie-nueva') : elegido;
    /* El campo pide GRAMOS (que es como se pesa una ración) y la columna
       guarda kilos, que es la unidad con la que se hace la cuenta de cuántos
       animales alimenta un quintal. La conversión pasa acá, una sola vez. */
    const consumoGramos = parseFloat(document.getElementById('form-f-consumo')?.value);
    const consumo = isFinite(consumoGramos) ? consumoGramos / 1000 : NaN;
    if (!nombre) { UI.toast('Poné el nombre de la fórmula', 'error'); return; }
    if (!animal) { UI.toast('Poné para qué animal es', 'error'); return; }
    if (!especie) { UI.toast('Poné el grupo (la pestaña donde va)', 'error'); return; }
    if (!isFinite(consumo) || consumo <= 0) { UI.toast('El consumo diario por animal tiene que ser mayor a cero', 'error'); return; }

    const cont = document.getElementById('form-ing-cont');
    const ingredientes = [...(cont?.querySelectorAll('.form-ing') || [])].map(fila => ({
      nombre: fila.querySelector('.ing-nombre')?.value.trim() || '',
      pct: parseFloat(fila.querySelector('.ing-pct')?.value) || 0,
    })).filter(x => x.nombre && x.pct > 0);
    if (!ingredientes.length) { UI.toast('Agregá al menos un ingrediente con su porcentaje', 'error'); return; }

    /* La suma se AVISA, no se bloquea: hay quien carga la base al 95% y
       completa con lo que tenga a mano. Bloquearlo sería inventarle una regla
       a alguien que sabe más de su galera que la app. */
    const total = ingredientes.reduce((s, x) => s + x.pct, 0);
    if (Math.abs(total - 100) >= 0.05) {
      const ok = await UI.confirmar(
        `Los ingredientes suman <b>${total.toFixed(1)}%</b>, no 100%. El costo por quintal se calcula sobre lo que pusiste. ¿Guardar así?`,
        'Guardar igual');
      if (!ok) return;
    }

    /* La etiqueta de la pestaña sólo se guarda si el grupo es nuevo: los de
       referencia (aves, porcinos…) ya tienen la suya en el código. */
    const especie_label = this._ESPECIES[especie] ? null : especie;
    const { error } = await DB.guardarAgroFormula({
      id, especie, especie_label, nombre, animal, consumo,
      ingredientes, nota: v('form-f-nota') || null,
    });
    if (error) { UI.toast('No se pudo guardar: ' + error.message, 'error'); return; }
    UI.toast(id ? 'Fórmula actualizada ✓' : 'Fórmula creada ✓', 'success');
    UI.cerrarModal();
    this._especie = especie;
    this.render();
  },

  async eliminarFormula(id, nombre) {
    Modulos.eliminarRegistro('agro_formulas', id, nombre, () => this.render());
  },
};
