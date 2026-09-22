/* NexusPro — Centro de módulos.

   El escaneo encuentra trece direcciones. Trece renglones que dicen "Módulo
   0x7B3" no son un diagnóstico: son una lista de números. Esta pantalla pone
   orden en dos niveles, que es como se trabaja de verdad:

     1. RESUMEN — todo el vehículo de un vistazo, ordenado por gravedad.
        Primero lo que está fallando AHORA, después lo guardado, al final lo
        sano. Es la pregunta "¿qué tiene este carro?".

     2. FICHA DE UN MÓDULO — al entrar a uno: quién es, qué códigos tiene,
        qué se le puede hacer. Es la pregunta "¿y este qué?".

   Y un BANCO DE PRUEBAS para cualquier vehículo, no solo para el conejillo de
   indias de turno: mandar un servicio a una dirección y ver la respuesta cruda,
   con los de lectura a un clic y lo demás avisando lo que es.

   Se engancha sobre Modulos.diagnostico_obd, igual que diagnostico_oem.js: el
   driver, el diálogo UDS y la bitácora ya viven allá y no se duplican. */
(function () {
  'use strict';
  const M = globalThis.Modulos && globalThis.Modulos.diagnostico_obd;
  if (!M) return;

  /* Respuestas negativas de ISO 14229-1. Un "7F 19 31" en pantalla no le dice
     nada a nadie; "el módulo rechazó: pediste algo fuera de rango" sí. Solo
     están las que de verdad aparecen leyendo un vehículo. */
  const NRC = {
    0x10:'rechazo general',
    0x11:'ese servicio no existe en este módulo',
    0x12:'el servicio existe pero no esa variante',
    0x13:'la petición tiene el largo equivocado',
    0x14:'la respuesta no cabe en el buffer',
    0x21:'el módulo está ocupado, reintentar',
    0x22:'condiciones incorrectas (suele faltar contacto, motor apagado o velocidad cero)',
    0x24:'falta un paso previo en la secuencia',
    0x31:'pediste algo fuera de rango (ese identificador no existe acá)',
    0x33:'hace falta desbloqueo de seguridad',
    0x35:'la llave de seguridad es inválida',
    0x37:'hay que esperar antes de reintentar el desbloqueo',
    0x72:'error al programar la memoria del módulo',
    0x78:'el módulo pidió más tiempo y está respondiendo',
    0x7E:'ese servicio no se acepta en la sesión actual',
    0x7F:'ese servicio no se acepta en la sesión actual',
  };

  /* Catálogo del banco de pruebas. `lee: true` = no cambia nada en el vehículo,
     se puede mandar sin ceremonia. El resto avisa qué hace ANTES de mandarlo. */
  const SERVICIOS = [
    { id:'tester',   lee:true,  nombre:'¿Hay alguien en esta dirección?', tx:[0x3E,0x00],
      que:'Tester Present. Es el saludo: no lee ni cambia nada, solo confirma que hay un módulo escuchando.' },
    { id:'dtc',      lee:true,  nombre:'Leer códigos confirmados', tx:[0x19,0x02,0xFF],
      que:'ReadDTCInformation. Devuelve los códigos guardados con su estado.' },
    { id:'dtc_todos',lee:true,  nombre:'Leer TODOS los códigos que soporta', tx:[0x19,0x0A],
      que:'Algunos módulos no contestan al 19 02 y sí a este. Sigue siendo lectura.' },
    { id:'dtc_kwp',  lee:true,  nombre:'Leer códigos (KWP2000, módulos viejos)', tx:[0x18,0x00,0xFF,0x00],
      que:'Para módulos anteriores a UDS. A uno que habla UDS le resbala.' },
    { id:'pieza',    lee:true,  nombre:'Número de pieza del módulo (F187)', tx:[0x22,0xF1,0x87],
      que:'LA referencia: con este número se identifica el módulo y se pide el repuesto.' },
    { id:'sistema',  lee:true,  nombre:'Nombre del sistema (F197)', tx:[0x22,0xF1,0x97],
      que:'Cómo se llama el módulo a sí mismo. La mayoría no lo publica.' },
    { id:'software', lee:true,  nombre:'Versión de software (F189)', tx:[0x22,0xF1,0x89], que:'' },
    { id:'serie',    lee:true,  nombre:'Número de serie (F18C)', tx:[0x22,0xF1,0x8C], que:'' },
    { id:'fabric',   lee:true,  nombre:'Fabricante del módulo (F18A)', tx:[0x22,0xF1,0x8A], que:'' },
    { id:'vin',      lee:true,  nombre:'VIN (F190)', tx:[0x22,0xF1,0x90],
      que:'Normalmente solo lo tiene el motor, a veces la carrocería.' },
    { id:'ses_def',  lee:true,  nombre:'Volver a sesión normal (10 01)', tx:[0x10,0x01],
      que:'Saca al módulo del modo diagnóstico. Es lo que apaga los testigos que enciende una sesión extendida.' },
    { id:'ses_ext',  lee:false, nombre:'Abrir sesión extendida (10 03)', tx:[0x10,0x03],
      que:'Necesaria para que algunos módulos entreguen sus códigos. OJO: mientras esté abierta, el módulo ENCIENDE su testigo en el tablero. Acordate de cerrarla con 10 01.' },
  ];

  const hx = b => b.map(x => Number(x).toString(16).padStart(2, '0').toUpperCase()).join(' ');

  Object.assign(M, {
    _centroScan: null,
    /* Inicializado acá y no al abrir el modal: `ejecutarPrueba` puede llamarse
       antes (desde la ficha de un módulo), y un unshift sobre undefined revienta. */
    _pruebas: [],

    /* ═══════════ NIVEL 1 · RESUMEN DEL VEHÍCULO ═══════════ */
    async modalCentroModulos(scan) {
      /* Sin argumento se resuelve solo: el que está en curso, el que se abrió,
         o el más reciente con barrido por módulo. Entrar acá desde la barra —
         con la app recién recargada, o sea sin escaneo en curso— no puede
         contestar "no hay escaneos" teniendo la lista llena. */
      const s = scan || await this._escaneoDeTrabajo();
      if (!s || !Array.isArray(s.por_modulo) || !s.por_modulo.length)
        return UI.toast('Ningún escaneo tiene barrido por módulo todavía. ' +
          'El barrido corre cuando el dongle acepta ATSH y el vehículo está en CAN de 11 bits.', 'warn');
      this._centroScan = s;
      /* La libreta ahora vive acá adentro: guardar o borrar tiene que volver
         a esta pantalla, no a la de administración que ya no está en la barra. */
      this._libretaEnCentro = true;
      /* Las definiciones OEM se necesitan para saber qué se le puede hacer a
         cada módulo; se cargan una vez y quedan. */
      if (!this._oemDefs || !this._oemDefs.length) {
        try { this._oemDefs = await DB.getDefinicionesOEM(); } catch (_) { this._oemDefs = []; }
      }
      if (!this._modulosDeclarados) {
        const v = this._vehiculoDe(s);
        try { this._modulosDeclarados = await DB.getModulosVehiculo({ marca:v.marca, modelo:v.modelo, anio:v.anio }); }
        catch (_) { this._modulosDeclarados = []; }
      }
      UI.modal('🧠 Centro de módulos', this._centroHTML(s), '900px');
    },

    _vehiculoDe(s) {
      return (s && s.vehiculos) ||
             (this._vehiculos || []).find(v => v.id === (s && s.vehiculo_id)) || {};
    },

    /* Gravedad: lo que está fallando AHORA primero. Un resumen ordenado por
       dirección obliga a leerlo entero para encontrar lo que importa. */
    _gravedad(m) {
      const cods = m.codigos || [];
      if (cods.some(c => c.activo)) return 0;
      if (cods.length) return 1;
      if (m.respondio === false) return 3;
      return 2;
    },

    _estadoChip(m) {
      const cods = m.codigos || [];
      const act = cods.filter(c => c.activo).length;
      if (act) return `<span class="badge badge-red">🔴 ${act} activo(s)</span>`;
      if (cods.length) return `<span class="badge badge-amber">🟡 ${cods.length} guardado(s)</span>`;
      if (m.respondio === false) return '<span class="badge badge-amber">no contestó</span>';
      return '<span class="badge badge-green">✅ sin códigos</span>';
    },

    _centroHTML(s) {
      const veh = this._vehiculoDe(s);
      const ms = [...s.por_modulo].sort((a, b) =>
        this._gravedad(a) - this._gravedad(b) || a.ecu - b.ecu);
      const todos = ms.flatMap(m => m.codigos || []);
      const activos = todos.filter(c => c.activo).length;
      const vivo = s === this._scan && this._puedePuntoAPunto().ok;
      const sinNombre = ms.filter(m => !(!m.ext && this._DIR_NO_ES_MODULO(m.ecu)) &&
                                       this._nombreGenerico(m.nombre, m.ecu)).length;

      return `
      <div class="card" style="padding:14px;${activos ? 'border-left:3px solid var(--red)' : ''}">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
          <div><b>${UI.esc([veh.marca, veh.modelo, veh.anio].filter(Boolean).join(' ') || 'Vehículo')}</b>
            <div style="font-size:11.5px;color:var(--text3)">${ms.length} módulo(s) · ${UI.fecha(s.created_at || new Date())}${vivo ? ' · <span style="color:var(--green)">conectado</span>' : ' · sin conexión'}</div></div>
          <div style="font-size:13px">${activos
            ? `<b style="color:var(--red)">${activos} falla(s) presentes ahora</b>`
            : todos.length ? `<b style="color:var(--amber)">${todos.length} código(s) guardados</b>`
            : '<b style="color:var(--green)">Sin códigos en ningún módulo</b>'}</div>
        </div>
        ${sinNombre ? `<div style="font-size:11.5px;color:var(--text3);margin-top:8px;line-height:1.5">
          ${sinNombre} módulo(s) siguen sin nombre: la IA los investigó y la evidencia no alcanzó para
          sostener uno. Se quedan así a propósito — un nombre equivocado manda a desmontar el módulo que no era.
          <button class="btn btn-sm btn-cyan" style="margin-left:6px"
            onclick="Modulos.diagnostico_obd.identificarConIA()">🤖 Que lo intente de nuevo</button></div>` : ''}
      </div>

      <div style="max-height:52vh;overflow:auto;margin-top:12px">
        ${ms.map(m => {
          const cods = m.codigos || [];
          const id = m.ident || {};
          return `<div class="card" style="padding:11px;margin-bottom:7px;cursor:pointer"
              onclick="Modulos.diagnostico_obd.fichaModulo(${m.ecu})">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
              <div style="min-width:0">
                <b>${UI.esc(m.nombre)}</b>
                <span style="font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:var(--text3)"> · ${this._hexDir(m.ecu)}</span>
                <div style="font-size:11px;color:var(--text3);margin-top:2px">
                  ${id.referencia ? `pieza <b style="font-family:ui-monospace,Consolas,monospace">${UI.esc(id.referencia)}</b>` : 'sin número de pieza leído'}
                  ${cods.length ? ` · ${cods.map(c => UI.esc(c.codigo)).join(' ')}` : ''}
                </div>
              </div>
              <div style="white-space:nowrap">${this._estadoChip(m)} <span style="color:var(--text3)">›</span></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      ${this._libretaHTML(veh)}

      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.modalBancoPruebas()">🧪 Banco de pruebas</button>
        ${vivo && todos.length ? `<button class="btn btn-sm btn-danger" onclick="Modulos.diagnostico_obd.borrarPorModulo()">🧹 Borrar todos los códigos</button>` : ''}
      </div>
      <div class="modal-footer">
        <a href="javascript:void(0)" onclick="Modulos.diagnostico_obd.modalOEM()"
           style="margin-right:auto;font-size:11px;color:var(--text3);text-decoration:none"
           title="Definiciones OEM verificadas: lo que la herramienta tiene permitido TRANSMITIR al vehículo">⚙️ Catálogo OEM (avanzado)</a>
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`;
    },

    /* LA LIBRETA DE ESTE MODELO, adentro del Centro.
       Era una pantalla aparte ("🧩 Módulos") y Henry no entendía para qué —con
       razón: es la misma pregunta que el Centro contesta, "qué módulos trae
       este carro". Acá es la segunda mitad de la respuesta: los del escaneo de
       hoy arriba, y los que el taller ya sabe que este modelo trae, abajo.
       Es lo que hace que el PRÓXIMO escaneo del mismo modelo arranque sabiendo
       dónde preguntar. */
    _libretaHTML(veh) {
      const filas = this._modulosDeclarados || [];
      const puedeEditar = typeof puedeAccion !== 'function' || puedeAccion('diagnostico_obd', 'editar');
      const modelo = UI.esc([veh.marca, veh.modelo].filter(Boolean).join(' ') || 'este modelo');
      return `<div class="card" style="padding:12px;margin-top:12px">
        <b style="font-size:11.5px;letter-spacing:.3px;color:var(--text2)">📓 LIBRETA DE ${modelo.toUpperCase()}</b>
        <div style="font-size:11px;color:var(--text3);margin-top:3px;line-height:1.5">
          Qué módulos trae este modelo y en qué dirección contestan. Con esto el próximo escaneo
          arranca preguntando donde ya sabe, en vez de tocar 240 puertas a ciegas.
          Declarar un módulo <b>no transmite nada</b>: sólo se le pregunta “¿hay alguien?”.
        </div>
        ${filas.length ? `<div style="overflow:auto;margin-top:8px">
          <table class="table" style="font-size:11.5px"><tbody>
            ${filas.map(m => `<tr>
              <td><b>${UI.esc(m.nombre)}</b>
                <div style="font-size:10px;color:var(--text3)">${
                  m.origen === 'ia' ? '🤖 lo identificó la IA'
                  : m.origen === 'escaneo' ? 'tomado de un escaneo'
                  : m.origen === 'paquete' ? 'vino cargado' : 'lo escribió el taller'}</div></td>
              <td style="font-family:ui-monospace,Consolas,monospace;white-space:nowrap">${this._hexDir(m.req)}${m.ext ? ' (29b)' : ''}</td>
              ${puedeEditar ? `<td style="text-align:right;white-space:nowrap">
                <div style="display:inline-flex;gap:4px">
                  ${Modulos.btnAccion('ver', `Modulos.diagnostico_obd.verModuloVehiculo('${m.id}')`)}
                  ${Modulos.btnAccion('editar', `Modulos.diagnostico_obd.editarDeLaLibreta('${m.id}')`)}
                  ${Modulos.btnAccion('eliminar', `Modulos.diagnostico_obd.eliminarModuloVehiculo('${m.id}', '${UI.jsAttr(m.nombre)}')`)}
                </div></td>` : '<td></td>'}
            </tr>`).join('')}
          </tbody></table></div>`
        : '<div style="font-size:11.5px;color:var(--text3);margin-top:7px">Todavía no hay nada anotado para este modelo. Los módulos que la IA identifique se anotan solos.</div>'}
        ${puedeEditar ? `<button class="btn btn-sm btn-ghost" style="margin-top:8px"
          onclick="Modulos.diagnostico_obd.editarDeLaLibreta()">＋ Agregar módulo a la libreta</button>` : ''}
      </div>`;
    },

    /* ═══════════ NIVEL 2 · FICHA DE UN MÓDULO ═══════════ */
    async fichaModulo(ecu) {
      const s = this._centroScan || this._scan;
      const m = ((s && s.por_modulo) || []).find(x => x.ecu === ecu);
      if (!m) return;
      const veh = this._vehiculoDe(s);
      const vivo = s === this._scan && this._puedePuntoAPunto().ok;
      const id = m.ident || {};
      const sug = id.referencia ? this._sugerenciaPorReferencia(id.referencia) : null;
      const cods = m.codigos || [];

      /* Lo que la capa OEM tiene cargado PARA ESTE MÓDULO. Así el mecánico ve
         en un solo lugar qué se le puede hacer y qué no, en vez de tener que
         adivinar en qué pantalla estaba cada cosa. */
      const suyas = (this._oemDefs || []).filter(d =>
        Number(d.definicion && d.definicion.request_id) === Number(ecu) &&
        (typeof OEMMotor === 'undefined' || OEMMotor.aplica(d, veh)));
      const resets = suyas.filter(d => d.tipo === 'reset');
      const lecturas = suyas.filter(d => d.tipo === 'did');

      const seccion = (titulo, cuerpo) => `<div class="card" style="padding:12px;margin-bottom:9px">
        <b style="font-size:11.5px;letter-spacing:.3px;color:var(--text2)">${titulo}</b>
        <div style="margin-top:7px">${cuerpo}</div></div>`;

      /* El nombre lo escribe el taller: va escapado aunque sea el titulo. */
      UI.modal(`🔧 ${UI.esc(m.nombre)}`, `
        <div style="font-size:11.5px;color:var(--text3);margin-bottom:9px">
          ${UI.esc([veh.marca, veh.modelo].filter(Boolean).join(' '))} ·
          dirección <b style="font-family:ui-monospace,Consolas,monospace">${this._hexDir(ecu)}</b>
          ${m.resp == null ? ' · el ELM no revela desde dónde contesta' : ` → ${this._hexDir(m.resp)}`}
          ${vivo ? '' : ' · <span style="color:var(--amber)">sin conexión: solo lectura de lo guardado</span>'}
        </div>

        ${seccion('1 · QUIÉN ES', `
          ${id.referencia ? `<div>Número de pieza: <b style="font-family:ui-monospace,Consolas,monospace">${UI.esc(id.referencia)}</b></div>` : ''}
          ${id.nombre ? `<div>Se llama a sí mismo: <b>${UI.esc(id.nombre)}</b></div>` : ''}
          ${id.proveedor ? `<div style="color:var(--text3)">Fabricante: ${UI.esc(id.proveedor)}</div>` : ''}
          ${sug ? `<div style="color:var(--text3)">grupo de pieza ${UI.esc(sug.grupo)} = ${UI.esc(sug.sistema)}</div>` : ''}
          ${id.ia ? `<div style="color:var(--cyan);margin-top:3px">🤖 Nombre puesto por la IA · confianza ${UI.esc(id.ia.confianza)}${
              id.ia.fuente ? `<div style="color:var(--text3)">${UI.esc(id.ia.fuente)}</div>` : ''}${
              id.ia.nota ? `<div style="color:var(--text3)">${UI.esc(id.ia.nota)}</div>` : ''}</div>` : ''}
          ${!id.referencia && !id.nombre ? `<div style="color:var(--text3)">Este módulo no entregó identificación durante el escaneo.
            Probá <b>Identificar a fondo</b>: pregunta más identificadores, de a uno — y con eso la IA tiene más con qué trabajar.</div>` : ''}
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">
            ${this._nombreGenerico(m.nombre, ecu)
              ? `<button class="btn btn-sm btn-cyan" onclick="Modulos.diagnostico_obd.identificarConIA(${ecu})">🤖 Que la IA lo identifique</button>` : ''}
            ${vivo ? `<button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.identificarAFondo(${ecu})">🔬 Identificar a fondo</button>
            <button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.verModulo(${ecu})">📊 Datos que expone</button>` : ''}
          </div>`)}

        ${seccion(`2 · CÓDIGOS (${cods.length})`, `
          ${cods.length ? cods.map(c => `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">
              <span style="flex-shrink:0;padding:2px 7px;border-radius:6px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;font-weight:700;
                background:${c.activo ? 'rgba(239,68,68,.16)' : 'rgba(148,163,184,.14)'};
                color:${c.activo ? 'var(--red)' : 'var(--text2)'}">${UI.esc(c.codigo)}</span>
              <span style="flex:1;font-size:11.5px;line-height:1.45">${UI.esc(c.desc || c.sistema || '')}
                ${c.activo ? '<b style="color:var(--red)"> · presente ahora</b>' : '<span style="color:var(--text3)"> · guardada</span>'}</span>
            </div>`).join('') : '<div style="color:var(--green)">Sin códigos.</div>'}
          ${vivo ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">
            <button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.releerCodigosModulo(${ecu})">🔄 Leer ahora</button>
            ${cods.length ? `<button class="btn btn-sm btn-danger" onclick="Modulos.diagnostico_obd.borrarCodigosModulo(${ecu})">🧹 Borrar los de este módulo</button>` : ''}
          </div>` : ''}`)}

        ${seccion('3 · ACCIONES', `
          ${vivo ? `<button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.resetModulo(${ecu})">🔄 Reiniciar el módulo</button>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">Equivale a cortarle la alimentación un instante. No borra códigos ni adaptaciones.</div>`
            : '<div style="color:var(--text3)">Necesita el vehículo conectado.</div>'}
          ${resets.length ? `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
            <b style="font-size:11.5px">Procedimientos OEM cargados para este módulo</b>
            ${resets.map(d => {
              const p = typeof OEMMotor !== 'undefined'
                ? OEMMotor.puedeEjecutarReset(d, { contacto:true, velocidad:0, motor:false }) : { ok:false, motivo:'' };
              return `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:5px">
                <span style="font-size:12px">${UI.esc(d.nombre)}
                  <span style="color:var(--text3)"> · ${UI.esc(d.estado)}</span></span>
                <button class="btn btn-sm btn-${p.ok && vivo ? 'amber' : 'ghost'}" ${p.ok && vivo ? '' : 'disabled'}
                  title="${UI.esc(p.motivo || 'Listo para ejecutar')}"
                  onclick="Modulos.diagnostico_obd.ejecutarResetOEM('${d.id}')">▶</button></div>`;
            }).join('')}</div>` : ''}
          ${lecturas.length ? `<div style="font-size:11px;color:var(--text3);margin-top:8px">
            ${lecturas.length} parámetro(s) OEM verificados aplican a este módulo — se leen desde 🧠 OEM › Parámetros OEM.</div>` : ''}`)}

        ${seccion('4 · FUNCIONES AUXILIARES', `
          <div style="font-size:12px;line-height:1.55;color:var(--text2)">
            Actuadores, comandos y programación existen en la capa OEM pero <b>están bloqueados hasta que
            haya una definición verificada</b> para este módulo, con su fuente y sus precondiciones.
            No es una limitación de la conexión: es la regla de esta herramienta —
            lo que no se puede sostener con una norma o un manual, no se transmite.
          </div>`)}

        ${seccion('5 · BANCO DE PRUEBAS', `
          <div style="font-size:12px;color:var(--text2)">Mandarle un servicio puntual a este módulo y ver la respuesta cruda.
            Es la forma de averiguar qué soporta sin adivinar.</div>
          <button class="btn btn-sm btn-ghost" style="margin-top:8px" onclick="Modulos.diagnostico_obd.modalBancoPruebas(${ecu})">🧪 Abrir banco de pruebas</button>`)}

        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.modalCentroModulos()">‹ Volver al resumen</button>
        </div>`, '760px');
    },

    /* ═══════════ ACCIONES DE LA FICHA ═══════════ */

    async releerCodigosModulo(ecu) {
      const s = this._centroScan || this._scan;
      const m = ((s && s.por_modulo) || []).find(x => x.ecu === ecu);
      if (!m) return;
      const permiso = this._puedePuntoAPunto();
      if (!permiso.ok) return UI.toast(permiso.motivo, 'error');
      UI.toast('Leyendo códigos…', 'info');
      try {
        const cods = await this._elmPuntoAPunto(async () => {
          let d = await this._udsPedir(m.ecu, m.resp, [0x19, 0x02, 0xFF], 2500);
          let c = this._dtcsUDS(d);
          if (!c.length) {
            const ses = await this._udsPedir(m.ecu, m.resp, [0x10, 0x03], 1500);
            if (ses && ses[0] === 0x50) {
              c = this._dtcsUDS(await this._udsPedir(m.ecu, m.resp, [0x19, 0x02, 0xFF], 2500));
              /* Se cierra la sesión: abierta, el módulo enciende su testigo. */
              await this._udsPedir(m.ecu, m.resp, [0x10, 0x01], 1200).catch(() => {});
            }
          }
          return c;
        });
        for (const c of cods) { c.desc = this._descModulo(c.codigo, null); c.sistema = this._sistemaDTC(c.codigo); }
        m.codigos = cods;
        UI.toast(cods.length ? `${cods.length} código(s)` : 'Sin códigos ✓', cods.length ? 'warn' : 'success');
        this.fichaModulo(ecu);
      } catch (e) { UI.toast('No se pudo leer: ' + e.message, 'error'); }
    },

    async borrarCodigosModulo(ecu) {
      const s = this._centroScan || this._scan;
      const m = ((s && s.por_modulo) || []).find(x => x.ecu === ecu);
      if (!m || !(m.codigos || []).length) return;
      const permiso = this._puedePuntoAPunto();
      if (!permiso.ok) return UI.toast(permiso.motivo, 'error');
      const ok = await UI.confirmar(
        `¿Borrar ${m.codigos.length} código(s) de <b>${UI.esc(m.nombre)}</b>?<br><br>` +
        '<small>· Borrar <b>no repara</b>: si la falla sigue, el código vuelve.<br>' +
        '· Se pierde la evidencia de cuándo apareció. Si todavía no diagnosticaste esta falla, <b>no la borres</b>.<br>' +
        '· El escaneo se guarda antes.</small>', 'Borrar códigos del módulo');
      if (!ok) return;
      if (!await this._guardarAntesDeBorrar())
        return UI.toast('No se borró nada: primero debe guardarse el historial', 'error');
      try {
        const r = await this._elmPuntoAPunto(() => this._borrarModulo(m.ecu, m.resp));
        if (r.ok) { m.codigos = []; UI.toast('Códigos borrados ✓'); }
        else UI.toast('El módulo no aceptó el borrado: ' + r.motivo, 'warn');
        this.fichaModulo(ecu);
      } catch (e) { UI.toast('No se pudo borrar: ' + e.message, 'error'); }
    },

    /* Pregunta MÁS identificadores, de a uno y solo cuando se pide: durante el
       escaneo serían seis consultas por módulo, y en once módulos son minutos. */
    async identificarAFondo(ecu) {
      const s = this._centroScan || this._scan;
      const m = ((s && s.por_modulo) || []).find(x => x.ecu === ecu);
      if (!m) return;
      const permiso = this._puedePuntoAPunto();
      if (!permiso.ok) return UI.toast(permiso.motivo, 'error');
      UI.toast('Preguntándole al módulo quién es…', 'info');
      try {
        const ident = await this._elmPuntoAPunto(() => this._identificarModulo(m.ecu, m.resp));
        const basico = await this._identidadModulo(m).catch(() => null);
        if (basico) m.ident = Object.assign({}, m.ident || {}, basico);
        m.ident_completa = ident;
        if (!ident && !basico) return UI.toast('El módulo no entregó ningún identificador', 'warn');
        UI.modal(`🔬 ${UI.esc(m.nombre)}`, `
          <div class="card" style="padding:12px">
            <table class="table" style="font-size:12.5px"><tbody>
              ${Object.values(ident || {}).map(v => `<tr><td style="color:var(--text3)">${UI.esc(v.nombre)}</td>
                <td style="font-family:ui-monospace,Consolas,monospace">${UI.esc(v.texto)}</td></tr>`).join('')}
              ${(m.ident || {}).referencia ? `<tr><td style="color:var(--text3)">Número de pieza</td>
                <td style="font-family:ui-monospace,Consolas,monospace">${UI.esc(m.ident.referencia)}</td></tr>` : ''}
            </tbody></table>
            <div style="font-size:11px;color:var(--text3);margin-top:7px">
              Con el número de pieza se identifica el módulo sin desmontarlo. Ahora que hay más identificadores,
              la IA puede volver a intentarlo con mejor evidencia.</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.fichaModulo(${ecu})">‹ Volver</button>
            <button class="btn btn-cyan" onclick="Modulos.diagnostico_obd.identificarConIA(${ecu})">🤖 Que la IA lo identifique</button>
          </div>`, '620px');
      } catch (e) { UI.toast('No se pudo identificar: ' + e.message, 'error'); }
    },

    /* ═══════════ BANCO DE PRUEBAS ═══════════ */
    _nrcTexto(n) { return NRC[n] || `rechazo 0x${Number(n).toString(16).toUpperCase()} (ver manual de la marca)`; },

    modalBancoPruebas(ecu) {
      const dir = ecu != null ? Number(ecu).toString(16).toUpperCase() : '';
      this._pruebas = this._pruebas || [];
      UI.modal('🧪 Banco de pruebas', `
        <div style="font-size:12.5px;color:var(--text2);line-height:1.55">
          Mandale un servicio a una dirección y mirá la respuesta cruda. Sirve para
          <b>cualquier vehículo</b>: es la forma de averiguar qué soporta un módulo sin adivinar.
          <b>No hace falta escanear antes</b>: si no hay conexión, la abre solo.
          <div style="color:var(--text3);margin-top:4px">Los servicios de <b>lectura</b> no cambian nada en el vehículo.
          Los que sí hacen algo lo dicen antes de mandarse.</div>
        </div>
        <div class="form-grid" style="margin-top:12px">
          <div><label class="form-label">Dirección del módulo (hex)</label>
            <input class="form-input" id="bp-dir" value="${UI.esc(dir)}" placeholder="7E0"
              style="font-family:ui-monospace,Consolas,monospace"></div>
          <div><label class="form-label">Servicio</label>
            <select class="form-select" id="bp-svc" onchange="Modulos.diagnostico_obd._pintarQuePrueba()">
              ${SERVICIOS.map(x => `<option value="${x.id}">${x.lee ? '📖' : '⚠️'} ${UI.esc(x.nombre)}</option>`).join('')}
              <option value="__libre">⚠️ Escribir la trama a mano (avanzado)</option>
            </select></div>
          <div style="grid-column:1/-1" id="bp-libre-wrap" style="display:none">
            <label class="form-label">Trama en hexadecimal</label>
            <input class="form-input" id="bp-libre" placeholder="22 F1 90" style="font-family:ui-monospace,Consolas,monospace">
          </div>
        </div>
        <div id="bp-que" style="font-size:11.5px;color:var(--text3);margin-top:6px;line-height:1.5"></div>
        <div style="display:flex;gap:7px;margin-top:10px">
          <button class="btn btn-brand" onclick="Modulos.diagnostico_obd.ejecutarPrueba()">▶ Enviar</button>
          ${ecu != null ? `<button class="btn btn-ghost" onclick="Modulos.diagnostico_obd.fichaModulo(${ecu})">‹ Volver al módulo</button>` : ''}
        </div>
        <div id="bp-salida" style="margin-top:12px;max-height:38vh;overflow:auto"></div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button></div>`, '720px');
      this._pintarQuePrueba();
      this._pintarSalidaPruebas();
    },

    _pintarQuePrueba() {
      const sel = document.getElementById('bp-svc'), zona = document.getElementById('bp-que');
      const libre = document.getElementById('bp-libre-wrap');
      if (!sel || !zona) return;
      if (libre) libre.style.display = sel.value === '__libre' ? '' : 'none';
      if (sel.value === '__libre') {
        zona.innerHTML = '<span style="color:var(--amber)"><b>Avanzado.</b> Una trama escrita a mano puede hacer ' +
          'cualquier cosa en el módulo. Se pide confirmación y queda registrada con su respuesta.</span>';
        return;
      }
      const x = SERVICIOS.find(y => y.id === sel.value);
      zona.innerHTML = x ? `<code>${hx(x.tx)}</code> — ${UI.esc(x.que || '')}` : '';
    },

    async ejecutarPrueba() {
      /* Conexión propia: el banco de pruebas es para PROBAR, y exigir un
         escaneo previo lo vuelve inútil justo cuando más sirve —un vehículo
         nuevo del que no se sabe nada—. Si no hay enlace, lo abre él mismo. */
      if (!this._listo) {
        UI.toast('Conectando el adaptador…', 'info');
        try { await this._asegurarConexion(() => {}); }
        catch (e) { return UI.toast('No se pudo conectar: ' + String(e.message).replace(/<[^>]*>/g, ''), 'error'); }
        this._pintarEstadoConexion();
      }
      const permiso = this._puedePuntoAPunto();
      if (!permiso.ok) return UI.toast(permiso.motivo, 'error');
      const req = this._leerHex(document.getElementById('bp-dir')?.value);
      if (req == null || Number.isNaN(req)) return UI.toast('Poné una dirección válida, por ejemplo 7E0', 'error');
      if (req > 0x7FF) return UI.toast('El banco de pruebas trabaja en 11 bits (hasta 0x7FF)', 'error');

      const sel = document.getElementById('bp-svc')?.value;
      let tx, etiqueta;
      if (sel === '__libre') {
        const crudo = String(document.getElementById('bp-libre')?.value || '').replace(/[^0-9A-Fa-f]/g, '');
        if (!crudo || crudo.length % 2) return UI.toast('La trama debe ser un número par de dígitos hexadecimales', 'error');
        tx = crudo.match(/../g).map(h => parseInt(h, 16));
        etiqueta = 'trama a mano';
        const ok = await UI.confirmar(
          `¿Mandar <code>${hx(tx)}</code> a <b>${this._hexDir(req)}</b>?<br><br>` +
          '<small>Una trama escrita a mano no pasa por ninguna verificación: puede cambiar la configuración ' +
          'del módulo o dejarlo en un estado que solo se sale apagando el vehículo. ' +
          'Queda registrada con su respuesta.</small>', 'Enviar trama a mano');
        if (!ok) return;
      } else {
        const x = SERVICIOS.find(y => y.id === sel);
        if (!x) return;
        tx = x.tx; etiqueta = x.nombre;
        if (!x.lee) {
          const ok = await UI.confirmar(`¿Enviar <b>${UI.esc(x.nombre)}</b> a ${this._hexDir(req)}?<br><br><small>${UI.esc(x.que)}</small>`, 'Enviar');
          if (!ok) return;
        }
      }

      try {
        const r = await this._elmPuntoAPunto(() => this._udsPedir(req, null, tx, 4000));
        const fila = { hora: new Date().toLocaleTimeString(), dir: req, etiqueta,
                       tx: hx(tx), rx: r ? hx(r) : null };
        if (r && r[0] === 0x7F) fila.nrc = this._nrcTexto(r[2]);
        else if (r) {
          /* Si la respuesta trae texto legible, mostrarlo: es lo que convierte
             un chorro de bytes en "58920-G6300". */
          const t = this._textoDID(r.slice(3));
          if (t) fila.texto = t;
        }
        this._pruebas.unshift(fila);
        this._pruebas = this._pruebas.slice(0, 30);
        await DB.registrarEjecucionOEM({
          operacion: `banco_pruebas ${etiqueta} → ${this._hexDir(req)}`,
          estado: r ? (r[0] === 0x7F ? 'rechazada' : 'exitosa') : 'fallida',
          vehiculo_id: (this._centroScan || this._scan || {}).vehiculo_id || null,
          diagnostico_id: (this._scan || {}).id || null,
          solicitud_hex: fila.tx, respuesta_hex: fila.rx,
          evidencia: { direccion: this._hexDir(req), nrc: fila.nrc || null, texto: fila.texto || null },
        }).catch(() => {});
        this._pintarSalidaPruebas();
      } catch (e) { UI.toast('No se pudo enviar: ' + e.message, 'error'); }
    },

    _pintarSalidaPruebas() {
      const el = document.getElementById('bp-salida');
      if (!el) return;
      const p = this._pruebas || [];
      if (!p.length) { el.innerHTML = '<div style="color:var(--text3);font-size:12px">Todavía no mandaste nada.</div>'; return; }
      el.innerHTML = p.map(x => `<div class="card" style="padding:9px;margin-bottom:6px;font-size:11.5px">
        <div style="color:var(--text3)">${UI.esc(x.hora)} · ${UI.esc(x.etiqueta)} · ${this._hexDir(x.dir)}</div>
        <div style="font-family:ui-monospace,Consolas,monospace;margin-top:3px">&gt; ${UI.esc(x.tx)}</div>
        <div style="font-family:ui-monospace,Consolas,monospace">&lt; <b style="color:var(--${x.rx ? (x.nrc ? 'amber' : 'green') : 'text3'})">${UI.esc(x.rx || 'sin respuesta')}</b></div>
        ${x.texto ? `<div style="margin-top:3px">dice: <b>${UI.esc(x.texto)}</b></div>` : ''}
        ${x.nrc ? `<div style="color:var(--amber);margin-top:3px">${UI.esc(x.nrc)}</div>` : ''}
      </div>`).join('');
    },
  });
})();
