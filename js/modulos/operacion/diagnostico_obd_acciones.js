/* NexusPro — Diagnóstico OBD · Acciones sobre el vehículo y el registro: borrado de códigos, asistente DTC, identificadores por módulo, reset, guardar escaneo, ver/editar/eliminar/imprimir.

   Es parte de Modulos.diagnostico_obd: el objeto se define en
   diagnostico_obd.js (núcleo y conexión) y cada parte le agrega sus métodos.
   Se dividió el 2026-09-22 porque el archivo único pasaba de 9.000 líneas.
   defineProperties + getOwnPropertyDescriptors (y no Object.assign) para que
   los get/set viajen como accesores y no como el valor del momento. */
(() => {
  const M = Modulos.diagnostico_obd;
  Object.defineProperties(M, Object.getOwnPropertyDescriptors({

  async borrarDTCs() {
    const ok = await UI.confirmar(
      '¿Borrar los códigos de falla y apagar el Check Engine?<br><small>Los códigos volverán a aparecer si la falla persiste. Hazlo solo después de reparar.</small>',
      'Borrar códigos');
    if (!ok) return;
    try {
      const guardado = await this._guardarAntesDeBorrar();
      if (!guardado) {
        this._log('<span style="color:var(--red)">Borrado cancelado: no se pudo guardar la copia previa de los DTC.</span>');
        return UI.toast('No se borró nada: primero debe guardarse el historial de DTC','error');
      }
      this._log('💾 Copia de DTC guardada antes de borrar ✓');
      if (this._via === 'j1939') {
        await this._j39Solicitar(65235);   // DM11: borra códigos activos
        await this._j39Solicitar(65228);   // DM3: borra códigos previos
        if (this._j39) { this._j39.dm1 = {}; this._j39.dm2 = {}; }
      } else await this._cmd('04', 8000);
      this._log(this._via === 'j1939' ? '🧹 Códigos borrados (DM11 + DM3) ✓' : '🧹 Códigos borrados (modo 04) ✓');
      UI.toast('Códigos borrados ✓');
    } catch (e) {
      UI.toast(e.message, 'error');
    }
    this._renderResultado();
  },

  asistenteDTC(codigo, modulo, marca, modelo, anio) {
    const cod = String(codigo || '').split('-')[0].toUpperCase();
    const vehTxt = [marca, modelo, anio].filter(Boolean).join(' ') || 'el vehículo';

    /* Catálogo de guías de diagnóstico por familia de código DTC */
    let guia = {
      titulo: 'Diagnóstico Genérico SAE J2012',
      sintomas: ['Testigo de falla (MIL) encendido en tablero', 'Posible comportamiento errático o falta de rendimiento'],
      causas: [
        { prob: '40%', desc: 'Sensor o actuador fuera de rango o con señal intermitente' },
        { prob: '35%', desc: 'Falso contacto, arnés sulfatado o conector flojo' },
        { prob: '15%', desc: 'Tierra física de chasis o alimentación de 12V/5V inestable' },
        { prob: '10%', desc: 'Falla interna de la computadora del módulo' }
      ],
      pruebas: [
        '<b>Paso 1 (Inspección Visual):</b> Revisá el conector del componente asociado y los cables buscando pellizcos o sulfato.',
        '<b>Paso 2 (Medición de Alimentación):</b> Con multímetro en VDC, verificá que el sensor reciba 5.0V de referencia (o 12V B+) con switch en ON.',
        '<b>Paso 3 (Medición de Tierra):</b> Medí continuidad ( < 1.0 Ω) entre el pin de tierra del sensor y el chasis.',
        '<b>Paso 4 (Monitoreo de Señal):</b> En la pestaña "Monitor en Vivo", observá la señal del sensor al mover el arnés.'
      ]
    };

    if (cod.startsWith('P030') || cod === 'P0300') {
      guia = {
        titulo: 'Fallo de Encendido / Misfire detectado en Cilindro(s)',
        sintomas: ['Motor tiembla o vibra en ralentí', 'Jaloneo al acelerar', 'Pérdida severa de potencia y mayor consumo', 'Testigo MIL parpadea (daño potencial a catalizador)'],
        causas: [
          { prob: '45%', desc: 'Bujía desgastada, con carbón o calibración incorrecta' },
          { prob: '30%', desc: 'Bobina de encendido (COP) dañada o con fuga de chispa' },
          { prob: '15%', desc: 'Inyector de combustible obstruido o con pulso defectuoso' },
          { prob: '10%', desc: 'Pérdida de compresión por válvula, junta de culata o anillo' }
        ],
        pruebas: [
          '<b>Paso 1 (Chispa & Bujía):</b> Retirá la bujía del cilindro indicado y revisá el desgaste del electrodo (calibración nominal 0.8 - 1.1 mm).',
          '<b>Paso 2 (Intercambio de Bobina):</b> Intercambiá la bobina a otro cilindro (ej: del 1 al 2). Si la falla se mueve de cilindro, la bobina está mala.',
          '<b>Paso 3 (Pulso de Inyector):</b> Con foco Noid o osciloscopio, comprobá el pulso a tierra entregado por la ECU al inyector.',
          '<b>Paso 4 (Compresión de Cilindro):</b> Medí compresión en seco/húmedo (debe estar entre 140 - 180 PSI y parejo entre cilindros).'
        ]
      };
    } else if (cod.startsWith('P0171') || cod.startsWith('P0174')) {
      guia = {
        titulo: 'Sistema de Combustible Demasiado Pobre (Lean Bank 1/2)',
        sintomas: ['Ralentí inestable o aceleración repentina', 'Tirones en marcha', 'Dificultad de arranque en frío'],
        causas: [
          { prob: '40%', desc: 'Fuga de vacío en mangueras de admisión o empaque de múltiple' },
          { prob: '25%', desc: 'Sensor de flujo de aire (MAF) o presión (MAP) sucio o descalibrado' },
          { prob: '20%', desc: 'Presión de combustible baja (bomba fatigada o filtro tapado)' },
          { prob: '15%', desc: 'Inyectores de combustible tapados o sonda lambda B1S1 agotada' }
        ],
        pruebas: [
          '<b>Paso 1 (Prueba de Humo / Vacío):</b> Introducí humo a la admisión para ubicar grietas en mangueras de vacío o empacaduras.',
          '<b>Paso 2 (Medición MAF):</b> En ralentí, el flujo MAF debe medir entre 2.0 y 4.0 g/s (para motor 1.5-2.0L). Si mide < 1.5 g/s, limpiá el hilo caliente con limpiador de MAF.',
          '<b>Paso 3 (Presión de Riel):</b> Conectá manómetro de combustible en el riel (debe marcar 40 - 60 PSI / 280-400 kPa según especificación).',
          '<b>Paso 4 (Monitoreo LTFT):</b> Si el ajuste de combustible (LTFT) baja a 0% al subir RPM a 2500, la falla es 100% fuga de vacío.'
        ]
      };
    } else if (cod.startsWith('C0035') || cod.startsWith('C0040') || cod.startsWith('C0045') || cod.startsWith('C0050') || cod.startsWith('C120')) {
      guia = {
        titulo: 'Sensor de Velocidad de Rueda (ABS / ESC)',
        sintomas: ['Testigo de ABS, Control de Tracción o Freno encendido', 'Pedal de freno vibra en frenado suave', 'Desactivación de control crucero'],
        causas: [
          { prob: '50%', desc: 'Sensor de rueda (WSS) con acumulación de viruta metálica o lodo' },
          { prob: '25%', desc: 'Cableado del arnés flexionado o partido cerca de la rueda' },
          { prob: '15%', desc: 'Aro dentado fónico / banda magnética de balero dañada' },
          { prob: '10%', desc: 'Falla interna en módulo electrónico del ABS' }
        ],
        pruebas: [
          '<b>Paso 1 (Limpieza de Sensor):</b> Retirá el sensor de la manzana de rueda y limpiá el entrehierro de polvo de balata o virutas.',
          '<b>Paso 2 (Resistencia del Sensor):</b> En sensores pasivos (VR), medí resistencia en pines (debe estar entre 800 y 1600 Ω).',
          '<b>Paso 3 (Continuidad de Arnés):</b> Flexioná la manguera del arnés mientras medís continuidad hacia el conector del ABS.',
          '<b>Paso 4 (Señal en VIVO):</b> En el monitor, girá la rueda a mano y comprobá que la velocidad km/h suba pareja respecto a las otras ruedas.'
        ]
      };
    } else if (cod.startsWith('U0100') || cod.startsWith('U0101') || cod.startsWith('U0121') || cod.startsWith('U0140')) {
      guia = {
        titulo: 'Pérdida de Comunicación en Bus CAN (Multiplexado)',
        sintomas: ['Múltiples alertas en tablero', 'Tacómetro o velocímetro caídos a cero', 'Motor no arranca o caja en modo emergencia'],
        causas: [
          { prob: '40%', desc: 'Batería baja o fusible de alimentación del módulo fundido' },
          { prob: '30%', desc: 'Líneas CAN_H o CAN_L cortadas, peladas o cruzadas a tierra' },
          { prob: '20%', desc: 'Conector de gateway o arnés sulfatado' },
          { prob: '10%', desc: 'Falta de resistencia terminadora de bus (120 Ω nominal)' }
        ],
        pruebas: [
          '<b>Paso 1 (Voltaje & Fusibles):</b> Revisá el fusible del módulo ausente y medí el voltaje de batería (>12.4V en reposo).',
          '<b>Paso 2 (Resistencia de Bus CAN):</b> Con switch en OFF y batería desconectada, medí resistencia entre CAN_H (pin 6 OBD) y CAN_L (pin 14 OBD). Debe medir **60 Ω** exactos (dos resistencias de 120 Ω en paralelo). Si mide 120 Ω, hay un tramo de bus abierto.',
          '<b>Paso 3 (Voltaje en Línea CAN):</b> Con switch en ON, medí voltaje a tierra: CAN_H debe estar en ~2.6V y CAN_L en ~2.4V.',
          '<b>Paso 4 (Revisión de Nodos):</b> Usá el Árbol de Topología CAN para aislar cuál módulo es el último en responder antes del corte.'
        ]
      };
    }

    const html = `
      <div style="font-size:12.5px">
        <div style="background:var(--surface2);border-left:4px solid var(--brand);padding:10px 12px;border-radius:6px;margin-bottom:12px">
          <div style="font-size:13px;font-weight:700;color:var(--brand)">💡 ${UI.esc(cod)} — ${UI.esc(guia.titulo)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Módulo emisor: <b>${UI.esc(modulo)}</b> · Vehículo: <b>${UI.esc(vehTxt)}</b></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="card" style="padding:10px">
            <b style="font-size:11.5px;color:var(--amber)">⚠️ SÍNTOMAS TÍPICOS DE LA FALLA</b>
            <ul style="margin:6px 0 0 16px;padding:0;font-size:11px;line-height:1.45;color:var(--text2)">
              ${guia.sintomas.map(s => `<li>${UI.esc(s)}</li>`).join('')}
            </ul>
          </div>

          <div class="card" style="padding:10px">
            <b style="font-size:11.5px;color:var(--red)">🎯 CAUSAS PROBABLES (Ponderadas)</b>
            <div style="margin-top:6px">
              ${guia.causas.map(c => `
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:4px">
                  <span style="color:var(--text2)">${UI.esc(c.desc)}</span>
                  <span style="font-weight:700;color:var(--brand);background:rgba(37,99,235,0.1);padding:1px 6px;border-radius:4px;font-size:10px">${c.prob}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="card" style="padding:12px;margin-bottom:12px">
          <b style="font-size:12px;color:var(--green)">⚡ PROCEDIMIENTO DE PRUEBA Y DIAGNÓSTICO EN TALLER</b>
          <div style="margin-top:8px;font-size:11.5px;line-height:1.55;color:var(--text)">
            ${guia.pruebas.map(p => `<div style="margin-bottom:6px;background:var(--surface2);padding:7px 10px;border-radius:6px;border-left:3px solid var(--green)">${p}</div>`).join('')}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:10px;flex-wrap:wrap;gap:8px">
          <span style="font-size:10.5px;color:var(--text3)">Guía de diagnóstico basada en estándar SAE & procedimientos OEM</span>
          <div style="display:flex;gap:8px">
            <a class="btn btn-sm" style="background:#ff0000;color:#ffffff;font-weight:700;border:none;display:inline-flex;align-items:center;gap:6px" href="https://www.youtube.com/results?search_query=${encodeURIComponent('reparar DTC ' + cod + ' ' + (marca||'') + ' ' + (modelo||''))}" target="_blank" rel="noopener">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              🎥 Ver Solución en YouTube
            </a>
            <a class="btn btn-sm btn-brand" href="${this._buscarDTC(cod, { marca, modelo, anio })}" target="_blank" rel="noopener">
              🔎 Buscar boletines OEM para ${UI.esc(cod)}
            </a>
          </div>
        </div>
      </div>
    `;

    UI.modal(`💡 Asistente de Reparación — ${cod}`, html, '780px');
  },

  /* ═══════════ DATOS EN VIVO POR MÓDULO (UDS 22) ═══════════
     El ABS conoce la velocidad de cada rueda, el TPMS la presión y temperatura
     de cada sensor, el BCM el estado de puertas, luces y llaves. Todo eso se
     lee con UDS 22 (ReadDataByIdentifier).

     El límite honesto: los identificadores de datos en vivo son PROPIETARIOS de
     cada fabricante. No existe un número estándar para "presión de la rueda
     trasera izquierda" — Nissan usa uno, Toyota otro. Así que:

       · Los identificadores de IDENTIFICACIÓN (0xF18x-0xF19x) sí son de la
         norma ISO 14229 y se leen con su nombre correcto.
       · Para los datos, se descubre QUÉ responde cada módulo y se muestra el
         valor crudo con sus interpretaciones más probables. El mecánico ve el
         número cambiar en tiempo real y lo relaciona con lo que hace el
         vehículo — que es como se identifica un dato sin la tabla del
         fabricante. Inventar la etiqueta sería peor que no ponerla. */

  /* Identificadores estándar de la norma: mismos en cualquier marca */
  _DID_ID: {
    0xF186:'Sesión de diagnóstico activa', 0xF187:'Número de parte del fabricante',
    0xF188:'Versión de software', 0xF189:'Versión de software (fabricante)',
    0xF18A:'Identificador del proveedor', 0xF18B:'Fecha de fabricación del módulo',
    0xF18C:'Número de serie del módulo', 0xF190:'VIN',
    0xF191:'Número de parte del hardware', 0xF192:'Número de parte (proveedor)',
    0xF193:'Versión de hardware', 0xF194:'Número de software (proveedor)',
    0xF195:'Versión de software (proveedor)', 0xF197:'Nombre del sistema',
    0xF19E:'Nombre del archivo ODX',
  },

  async _leerDID(req, resp, did, timeout = 700) {
    const d = await this._udsPedir(req, resp, [0x22, (did >> 8) & 0xFF, did & 0xFF], timeout);
    if (!d || d[0] !== 0x62) return null;
    /* Respuesta: [62][did hi][did lo][datos...] */
    if (((d[1] << 8) | d[2]) !== did) return null;
    return d.slice(3);
  },

  /* Un valor crudo puede ser texto, un número de 1/2 bytes, o varios campos.
     Se ofrecen las lecturas plausibles en vez de elegir una y arriesgarse. */
  _interpretarDID(b) {
    if (!b || !b.length) return null;
    const hex = b.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const txt = b.every(x => x === 0 || (x >= 32 && x < 127))
      ? b.map(x => x ? String.fromCharCode(x) : '').join('').trim() : '';
    const lecturas = [];
    if (txt && txt.length >= 3) lecturas.push(`texto: "${txt}"`);
    if (b.length === 1) lecturas.push(`${b[0]}`);
    if (b.length === 2) lecturas.push(`${(b[0] << 8) | b[1]}`);
    if (b.length === 4) lecturas.push(`${((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0}`);
    if (b.length > 1 && b.length <= 8) lecturas.push('bytes: ' + b.join(', '));
    return { hex, txt, lecturas };
  },

  /* Identificación del módulo: número de parte, software, serie. Sirve para
     saber si dos vehículos iguales traen el mismo módulo, y para pedir el
     repuesto correcto sin desmontarlo. */
  async _identificarModulo(req, resp) {
    const out = {};
    for (const did of [0xF187, 0xF188, 0xF18C, 0xF191, 0xF193, 0xF18A]) {
      const b = await this._leerDID(req, resp, did, 700).catch(() => null);
      if (!b) continue;
      const i = this._interpretarDID(b);
      out[did] = { nombre: this._DID_ID[did], texto: i.txt || i.hex, hex: i.hex };
    }
    return Object.keys(out).length ? out : null;
  },

  /* DIDs de alta probabilidad para consulta rápida sin congelar la pantalla */
  _DIDS_ALTA_PROBABILIDAD: [
    0x0100, 0x0101, 0x0102, 0x0104, 0x0106, 0x0108, 0x010A,
    0x1001, 0x1002, 0x1004, 0x1006, 0x2210, 0xC001, 0xC002, 0xC100, 0xD100,
    0xF187, 0xF188, 0xF18A, 0xF190, 0xF197
  ],

  async _explorarDatos(req, resp, log, tope = 16) {
    const hallados = [];
    for (const did of this._DIDS_ALTA_PROBABILIDAD) {
      if (hallados.length >= tope) break;
      const b = await this._leerDID(req, resp, did, 700).catch(() => null);
      if (!b || !b.length) continue;
      const i = this._interpretarDID(b);
      hallados.push({ did, hex: i.hex, txt: i.txt, lecturas: i.lecturas, bytes: b });
      if (log) log(`&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:var(--text3)">DID 0x${did.toString(16).toUpperCase()} → ${i.hex}</span>`);
    }
    return hallados;
  },

  /* Abre la ficha de un módulo: identificación + datos que expone. */
  async verModulo(ecu) {
    const ms = (this._scan && this._scan.por_modulo) || [];
    let m = ms.find(x => Number(x.ecu) === Number(ecu));
    if (!m) {
      m = { ecu: Number(ecu), nombre: `Módulo 0x${Number(ecu).toString(16).toUpperCase()}`, codigos: [], resp: null };
    }

    /* Si el módulo no entregó parámetros, la ficha va sin esa tarjeta. Antes
       se rellenaba con valores FIJOS (llantas a 32.5 PSI, ATF a 82 °C) que se
       mostraban como lectura "UDS 22" y se mezclaban en los datos del escaneo:
       Nexus los analizaba y el informe impreso los daba por medidos. Un dato
       inventado en un diagnóstico es peor que un hueco. */

    const permiso = this._puedePuntoAPunto();

    /* Renderizado de parámetros OEM conocidos (TCM, TPMS, MDPS, etc.) */
    const renderParamsOEM = pOem => {
      const entries = Object.entries(pOem || {}).filter(([k, v]) => v !== null && v !== undefined);
      if (!entries.length) return `<div class="card" style="padding:12px;margin-bottom:12px;font-size:12px;color:var(--text3)">
          <b style="color:var(--text2)">Sin parámetros en vivo para este módulo.</b> Leerlos exige los identificadores
          exactos del fabricante para ESTE módulo; sin una definición verificada no se muestra ningún número.</div>`;
      return `
        <div class="card" style="padding:14px;margin-bottom:12px;border:1px solid #0284c7;background:rgba(2,132,199,0.04)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <b style="font-size:13px;color:#0284c7;display:flex;align-items:center;gap:6px">📊 PARÁMETROS EN VIVO Y TELEMETRÍA (UDS 22)</b>
            <span class="badge badge-cyan">UDS SERVICIO 22</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
            ${entries.map(([k, v]) => {
              const evalData = this._evaluarSensorKey(k, v);
              const colorBorder = evalData.status === 'critico' ? 'var(--red)' : evalData.status === 'advertencia' ? 'var(--amber)' : 'var(--border)';
              return `
                <div style="background:var(--surface2);border-radius:10px;padding:10px;border:1px solid ${colorBorder};box-shadow:0 2px 6px rgba(0,0,0,0.03)">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:11px;color:var(--text3);font-weight:700">${UI.esc(evalData.label)}</span>
                    ${evalData.badge}
                  </div>
                  <div style="font-size:18px;font-weight:900;color:var(--text);margin:4px 0">
                    ${v}<span style="font-size:11px;font-weight:700;color:var(--text3);margin-left:3px">${UI.esc(evalData.unidad)}</span>
                  </div>
                  <div style="font-size:10px;color:var(--text3)">${UI.esc(evalData.ref)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    /* Abrir Modal SIEMPRE (NUNCA salir del escaneo ni tirar toast y abortar) */
    UI.modal(`🧠 ${m.nombre} (0x${Number(m.ecu).toString(16).toUpperCase()})`, `
      <div id="mod-cuerpo" style="font-size:12.5px">
        <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%);color:#f8fafc;padding:14px 16px;border-radius:12px;margin-bottom:14px;border:1px solid #334155;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-size:16px;font-weight:900;color:#38bdf8;display:flex;align-items:center;gap:8px">
              🧩 ${UI.esc(m.nombre)}
              <span style="background:rgba(56,189,248,0.2);color:#38bdf8;font-size:11px;font-family:monospace;padding:2px 8px;border-radius:4px">CAN ID 0x${Number(m.ecu).toString(16).toUpperCase()}</span>
            </div>
            <div style="font-size:11.5px;color:#94a3b8;margin-top:3px">
              ${m.resp != null ? `Responde en 0x${Number(m.resp).toString(16).toUpperCase()}` : 'Dirección Estándar CAN Bus'}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm" style="background:#0284c7;color:#ffffff;border:none;font-weight:700" onclick="Modulos.diagnostico_obd.modalPruebasActuadores(${m.ecu}, '${UI.jsAttr(m.nombre)}')">⚡ Pruebas Activas</button>
            <button class="btn btn-sm" style="background:#1e293b;color:#f8fafc;border:1px solid #475569" onclick="Modulos.diagnostico_obd.resetModulo(${m.ecu})">🔄 Reiniciar UDS</button>
            <button class="btn btn-sm" style="background:rgba(239,68,68,0.25);color:#fca5a5;border:1px solid rgba(239,68,68,0.5)" onclick="Modulos.diagnostico_obd.borrarCodigosModuloDirecto(${m.ecu})">🧹 Borrar DTCs</button>
          </div>
        </div>

        ${renderParamsOEM(m.params_oem)}

        ${m.codigos && m.codigos.length ? `
          <div class="card" style="padding:14px;margin-bottom:12px;border:1px solid rgba(239,68,68,0.5);background:rgba(239,68,68,0.04)">
            <b style="font-size:12px;color:var(--red);display:flex;align-items:center;gap:6px">🚨 CÓDIGOS DE FALLA REGISTRADOS EN ESTE MÓDULO (${m.codigos.length})</b>
            <div style="margin-top:8px">
              ${m.codigos.map(c => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface2);padding:8px 12px;border-radius:8px;margin-bottom:6px;border:1px solid var(--border)">
                  <div>
                    <b style="color:var(--red);font-family:monospace;font-size:13px">${UI.esc(c.codigo)}</b> — ${UI.esc(c.desc || 'Sin descripción')}
                  </div>
                  <button class="btn btn-xs btn-cyan" onclick="Modulos.diagnostico_obd.asistenteDTC('${c.codigo}', '${UI.esc(m.nombre)}')">💡 Asistente</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `<div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);color:var(--green);padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:12px;font-weight:700">✅ Módulo Saludable — 0 Códigos de Falla</div>`}

        ${m.ident ? `<div class="card" style="padding:14px;margin-bottom:12px">
          <b style="font-size:12px">IDENTIFICACIÓN DEL MÓDULO (Hardware & Software)</b>
          <table class="table" style="margin-top:6px;font-size:12px"><tbody>
            ${Object.values(m.ident).map(v => `<tr><td style="color:var(--text3)">${UI.esc(v.nombre)}</td>
              <td style="font-family:ui-monospace,Consolas,monospace">${UI.esc(v.texto)}</td></tr>`).join('')}
          </tbody></table>
        </div>` : ''}

        <div style="display:flex;justify-content:flex-end;margin-top:14px">
          <button class="btn btn-ghost" onclick="UI.cerrarModal()">❌ Cerrar Ficha</button>
        </div>
      </div>
    `, '800px');

    /* Si hay conexión activa con el adaptador, actualizar en vivo por UDS en background */
    if (permiso.ok) {
      try {
        const liveParams = await this._elmPuntoAPunto(async () => {
          return await this._leerParametrosUDSModulo(m);
        });
        if (liveParams && Object.keys(liveParams).length) {
          m.params_oem = { ...(m.params_oem || {}), ...liveParams };
          if (this._scan) this._scan.datos = { ...(this._scan.datos || {}), ...m.params_oem };
          const elCuerpo = document.getElementById('mod-cuerpo');
          if (elCuerpo) {
            this.verModulo(ecu);
          }
        }
      } catch (_) {}
    }
  },

  /* ═══════════ BORRADO Y RESET POR MÓDULO ═══════════
     El modo 04 de OBD-II solo llega a los módulos de emisiones. Las fallas del
     ABS, del TPMS o de la carrocería NO se borran con él: hay que pedírselo a
     cada módulo por su dirección con UDS 14 (ClearDiagnosticInformation).

     Dos protecciones que no son opcionales:

     1. El escaneo se GUARDA ANTES de borrar. Un código borrado sin registro es
        evidencia perdida: si el cliente vuelve en dos semanas con el mismo
        síntoma, sin ese registro no hay con qué comparar.

     2. Borrar reinicia los monitores de disponibilidad. Un vehículo recién
        borrado REPRUEBA una inspección de emisiones aunque esté sano, porque
        los monitores no han corrido. Hay que decirlo antes, no después. */

  async _guardarAntesDeBorrar() {
    if (!this._scan || this._scan.id) return true;
    try {
      /* COPIA, no referencia: enseguida se vacían los códigos de cada módulo
         para reflejar el borrado en pantalla, y con una referencia viva eso
         vaciaría también lo que se está guardando. El registro tiene que
         conservar lo que HABÍA — es justamente su razón de ser. */
      const { nhtsa, ...fila } = JSON.parse(JSON.stringify(this._scan));
      let { data, error } = await DB.upsertDiagnosticoOBD(fila);
      if (error && /PGRST204|column|does not exist/i.test(error.message || '')) {
        const base = { ...fila };
        for (const c of this._CAMPOS_NUEVOS) delete base[c];
        ({ data, error } = await DB.upsertDiagnosticoOBD(base));
      }
      if (error) return false;
      if (data && data.id) this._scan.id = data.id;
      return true;
    } catch (_) { return false; }
  },

  /* Borra los códigos de UN módulo. UDS 14 FF FF FF = borrar todos los suyos. */
  async _borrarModulo(req, resp) {
    const r = await this._udsPedir(req, resp, [0x14, 0xFF, 0xFF, 0xFF], 3000);
    if (r && r[0] === 0x54) return { ok: true };
    /* Algunos módulos exigen sesión extendida para aceptar el borrado */
    const s = await this._udsPedir(req, resp, [0x10, 0x03], 1500);
    if (s && s[0] === 0x50) {
      const r2 = await this._udsPedir(req, resp, [0x14, 0xFF, 0xFF, 0xFF], 3000);
      if (r2 && r2[0] === 0x54) return { ok: true };
      return { ok: false, motivo: r2 && r2[0] === 0x7F ? `rechazado (0x${(r2[2] || 0).toString(16)})` : 'sin respuesta' };
    }
    return { ok: false, motivo: r && r[0] === 0x7F ? `rechazado (0x${(r[2] || 0).toString(16)})` : 'sin respuesta' };
  },

  /* Borra los códigos de TODOS los módulos que reportaron fallas. */
  async borrarPorModulo() {
    const ms = (this._scan && this._scan.por_modulo) || [];
    const conFallas = ms.filter(m => m.codigos && m.codigos.length);
    if (!conFallas.length) { UI.toast('No hay códigos por módulo para borrar', 'info'); return; }
    const permiso = this._puedePuntoAPunto();
    if (!permiso.ok) { UI.toast(permiso.motivo, 'error'); return; }

    const total = conFallas.reduce((n, m) => n + m.codigos.length, 0);
    const ok = await UI.confirmar(
      `¿Borrar ${total} código(s) en ${conFallas.length} módulo(s)?<br><br>` +
      `<b>${conFallas.map(m => UI.esc(m.nombre)).join(', ')}</b><br><br>` +
      '<small>· Los códigos <b>vuelven</b> si la falla sigue: borrar no repara.<br>' +
      '· Se reinician los monitores de emisiones: el vehículo puede <b>reprobar una inspección</b> hasta que vuelvan a correr.<br>' +
      '· El escaneo se guarda antes, para no perder el registro de lo que había.<br>' +
      '· El vehículo debe estar <b>detenido</b> y con el motor apagado.</small>',
      'Borrar códigos de todos los módulos');
    if (!ok) return;

    const guardado = await this._guardarAntesDeBorrar();
    if (!guardado) {
      this._log('<span style="color:var(--red)">Borrado cancelado: no se pudo guardar la copia previa.</span>');
      return UI.toast('No se borró nada: primero debe guardarse el historial de DTC','error');
    }
    this._log('💾 Escaneo guardado antes de borrar ✓');

    let bien = 0, mal = 0;
    try {
      await this._elmPuntoAPunto(async () => {
        for (const m of conFallas) {
          const r = await this._borrarModulo(m.ecu, m.resp);
          if (r.ok) { bien++; this._log(`🧹 ${UI.esc(m.nombre)}: borrado ✓`); m.codigos = []; }
          else { mal++; this._log(`<span style="color:var(--amber)">⚠️ ${UI.esc(m.nombre)}: no se pudo borrar (${UI.esc(r.motivo)})</span>`); }
        }
      });
    } catch (e) { this._log(`<span style="color:var(--red)">✗ ${UI.esc(e.message)}</span>`); UI.toast(e.message, 'error'); }
    if (this._scan) this._scan.dtcs_borrados = true;
    this._renderResultado();
    UI.toast(mal ? `${bien} borrado(s), ${mal} rechazado(s)` : `${bien} módulo(s) borrados ✓`, mal ? 'warn' : 'success');
    this._log('<b>Volvé a escanear para confirmar qué códigos regresaron.</b> Los que vuelven de inmediato son fallas presentes, no memoria vieja.');
  },

  /* Reinicio de un módulo (UDS 11 01 = hard reset). Es como desconectarle la
     alimentación: vuelve a arrancar y reejecuta sus autodiagnósticos.
     NO borra códigos ni adaptaciones — para eso está el borrado. */
  async resetModulo(ecu) {
    const s = this._centroScan || this._scan;
    const ms = (s && s.por_modulo) || [];
    const m = ms.find(x => x.ecu === ecu);
    if (!m) return;
    const nombreModuloTexto = String(m.nombre || 'Módulo');
    const permiso = this._puedePuntoAPunto();
    if (!permiso.ok) { UI.toast(permiso.motivo, 'error'); return; }

    const ok = await UI.confirmar(
      `¿Reiniciar <b>${UI.esc(m.nombre)}</b>?<br><br>` +
      '<small>Equivale a cortarle la alimentación un instante: el módulo arranca de nuevo y repite sus autodiagnósticos.<br><br>' +
      '<b>El vehículo TIENE que estar detenido y con el motor apagado.</b> Reiniciar un módulo en marcha puede apagar el motor o dejar sin asistencia a la dirección o los frenos.<br><br>' +
      'No borra códigos ni adaptaciones.</small>',
      'Reiniciar módulo');
    if (!ok) return;

    UI.toast(`Enviando comando de reinicio a ${nombreModuloTexto}…`, 'info', 4000);
    try {
      const r = await this._elmPuntoAPunto(() => this._udsPedir(m.ecu, m.resp, [0x11, 0x01], 4000));
      if (r && r[0] === 0x51) {
        this._log(`🔄 ${UI.esc(m.nombre)}: reiniciado ✓ — esperá unos segundos y volvé a escanear`);
        UI.toast(`✅ ${nombreModuloTexto}: Módulo reiniciado correctamente`, 'success');
      } else if (r && r[0] === 0x7F) {
        this._log(`<span style="color:var(--amber)">${UI.esc(m.nombre)}: rechazó el reinicio (0x${(r[2] || 0).toString(16)})</span>`);
        UI.toast(`⚠️ ${nombreModuloTexto} rechazó el reinicio (Código: 0x${(r[2] || 0).toString(16)})`, 'warn');
      } else {
        this._log(`<span style="color:var(--amber)">${UI.esc(m.nombre)}: sin respuesta al reinicio</span>`);
        UI.toast(`❌ ${nombreModuloTexto}: Sin respuesta del módulo`, 'error');
      }
    } catch (e) { UI.toast('No se pudo reiniciar: ' + e.message, 'error'); }
  },

  async borrarCodigosModuloDirecto(ecu) {
    const s = this._centroScan || this._scan;
    const ms = (s && s.por_modulo) || [];
    const m = ms.find(x => x.ecu === ecu);
    if (!m) return;
    const nombreModuloTexto = String(m.nombre || 'Módulo');
    const permiso = this._puedePuntoAPunto();
    if (!permiso.ok) { UI.toast(permiso.motivo, 'error'); return; }

    const ok = await UI.confirmar(
      `¿Borrar códigos de falla en <b>${UI.esc(m.nombre)}</b>?<br><br>` +
      '<small>· El módulo borrará sus registros de falla almacenados.<br>' +
      '· Si el fallo físico persiste, el código volverá a encenderse.<br>' +
      '· El vehículo debe estar <b>detenido y en contacto</b>.</small>',
      'Borrar DTCs del Módulo');
    if (!ok) return;

    UI.toast(`Borrando DTCs en ${nombreModuloTexto}…`, 'info', 4000);
    try {
      const r = await this._elmPuntoAPunto(() => this._borrarModulo(m.ecu, m.resp));
      if (r && r.ok) {
        UI.toast(`Verificando códigos remanentes en ${nombreModuloTexto}…`, 'info', 2000);
        const codsRevisados = await this._elmPuntoAPunto(async () => {
          let d = await this._udsPedir(m.ecu, m.resp, [0x19, 0x02, 0xFF], 2000);
          return this._dtcsUDS(d);
        }).catch(() => []);

        if (codsRevisados.length) {
          m.codigos = codsRevisados.map(c => ({
            codigo: c.codigo,
            activo: true,
            desc: this._descDTC ? this._descDTC(c.codigo, []) : 'Falla física persistente'
          }));
          this._log(`<span style="color:var(--amber)">⚠️ ${UI.esc(m.nombre)}: Se borraron códigos pero ${codsRevisados.length} falla(s) persisten (falla física en caliente).</span>`);
          UI.toast(`⚠️ ${nombreModuloTexto}: Se borró memoria pero ${codsRevisados.length} falla(s) persisten en caliente`, 'warn', 4500);
        } else {
          m.codigos = [];
          this._log(`🧹 ${UI.esc(m.nombre)}: Códigos de falla borrados y verificado 0 fallas ✓`);
          UI.toast(`✅ DTCs borrados correctamente en ${nombreModuloTexto} (Verificado 0 fallas)`, 'success');
        }
        if (this._scan) this._scan.dtcs_borrados = true;
        this.verModulo(ecu);
      } else {
        const motivo = (r && r.motivo) || 'desconocido';
        this._log(`<span style="color:var(--amber)">⚠️ ${UI.esc(m.nombre)}: no se pudo borrar (${UI.esc(motivo)})</span>`);
        UI.toast(`❌ ${nombreModuloTexto} no aceptó el borrado: ${motivo}`, 'error');
      }
    } catch (e) { UI.toast('Error al borrar DTCs: ' + e.message, 'error'); }
  },

  /* Campos que dependen de una migración posterior a la tabla original. El
     código se despliega antes que la migración (son dos pasos distintos), así
     que un escaneo no puede perderse solo porque la columna todavía no exista.*/
  _CAMPOS_NUEVOS: ['permanentes', 'readiness', 'norma_obd', 'calibracion', 'equipamiento', 'costo', 'por_modulo', 'comparacion', 'mapa_acceso', 'traza'],

  async guardarEscaneo() {
    if (!this._scan) return;
    this._stopLive();
    const { nhtsa, ...fila } = this._scan;   // nhtsa no se persiste (se aplica a la ficha del vehículo)
    let { data, error } = await DB.upsertDiagnosticoOBD(fila);

    /* PGRST204 = la tabla no tiene esa columna. Se reintenta sin los campos
       nuevos: es preferible guardar el escaneo sin el análisis de equipamiento
       que perder el trabajo entero y que el mecánico tenga que rescanear. */
    if (error && /PGRST204|column|no existe|does not exist/i.test(error.message || '')) {
      const base = { ...fila };
      for (const c of this._CAMPOS_NUEVOS) delete base[c];
      const r2 = await DB.upsertDiagnosticoOBD(base);
      if (!r2.error) {
        UI.toast('Escaneo guardado, sin el análisis de equipamiento (falta aplicar la migración 095)', 'warn');
        if (r2.data && r2.data.id) this._scan.id = r2.data.id;
        UI.cerrarModal();
        await this.render();
        return;
      }
      error = r2.error;
    }
    if (error) { UI.toast('Error al guardar: ' + error.message, 'error'); return; }
    /* Sin esto el escaneo quedaba guardado en la base pero la pantalla seguía
       diciendo "sin guardar" y volvía a ofrecer el botón: dos filas del mismo
       escaneo a la segunda vez. */
    if (data && data.id) this._scan.id = data.id;
    UI.toast('Escaneo guardado ✓');
    UI.cerrarModal();
    await this.render();
  },

  /* ═══════════ VER / EDITAR / IMPRIMIR / ELIMINAR ═══════════ */
  ver(id) {
    const d = this._data.find(x => x.id === id);
    if (!d) return;
    /* Abrir un escaneo guardado lo vuelve el escaneo de trabajo: desde acá se
       entra al Centro de módulos y a "Tomar del escaneo" sin volver a escanear. */
    this._centroScan = d;
    const v = d.vehiculos;
    UI.modal('🩺 Reporte de Diagnóstico', `
      <div style="font-size:13px">
        <p><b>Vehículo:</b> ${v ? `${UI.esc(v.placa||'')} · ${UI.esc(v.marca||'')} ${UI.esc(v.modelo||'')} ${UI.esc(v.anio||'')}` : '—'}<br>
        <b>Fecha:</b> ${UI.fecha(d.created_at)} · <b>VIN:</b> <span style="font-family:monospace">${d.vin||'—'}</span><br>
        <b>Protocolo:</b> ${d.protocolo||'—'} · <b>Adaptador:</b> ${d.adaptador||'—'} · <b>Batería:</b> ${d.voltaje||'—'}<br>
        <b>Check Engine:</b> ${d.mil?'🔴 Encendido':'✅ Apagado'} ${d.dtcs_borrados?' · 🧹 Códigos borrados tras el escaneo':''}</p>
        ${this._modulosHTML(d)}
        ${this._tablaDTCs(d)}
        ${this._historialHTML(d)}
        ${this._freezeHTML(d.freeze_frame)}
        ${this._porModuloHTML(d)}
      ${this._mapaHTML(d)}
      ${this._equipamientoHTML(d)}
      ${this._monitoresHTML(d.monitores)}
        <div class="card" style="padding:14px;margin-top:12px">
          <b style="font-size:12px">DATOS AL MOMENTO DEL ESCANEO</b>
          ${this._vivoCategorizadoHTML(d.datos||{})}
        </div>
        ${this._grabHTML(d.grabacion)}
        ${this._grabComparacionHTML(d)}
        <div id="obd-ia">${this._iaHTML(d.ia_analisis)}</div>
        ${d.notas ? `<p style="margin-top:8px"><b>Notas:</b> ${d.notas}</p>` : ''}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        ${!d.ia_analisis && (typeof moduloEnPlan !== 'function' || moduloEnPlan('ia')) ? `<button class="btn btn-cyan" onclick="Modulos.diagnostico_obd.analizarIA('${d.id}')">🤖 Analizar con IA</button>` : ''}
        ${(d.traza || []).length ? `<button class="btn btn-ghost"
          title="Copia el dialogo crudo con el vehiculo para mandarlo a soporte"
          onclick="Modulos.diagnostico_obd.copiarTraza('${d.id}')">🧾 Bitácora técnica</button>` : ''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${Modulos.btnAccion('imprimir', `Modulos.diagnostico_obd.imprimir('${d.id}')`, { label:'🖨 Imprimir' })}
      </div>`, '980px');
  },

  modalEditar(id) {
    const d = this._data.find(x => x.id === id);
    if (!d) return;
    UI.modal('✏️ Editar Diagnóstico', `
      <div class="form-group">
        <label class="form-label">Vehículo</label>
        <select class="form-select" id="obd-e-veh">
          ${this._vehiculos.map(v=>`<option value="${v.id}" ${v.id===d.vehiculo_id?'selected':''}>${v.placa||'s/placa'} · ${v.marca||''} ${v.modelo||''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notas del técnico</label>
        <textarea class="form-input" id="obd-e-notas" rows="4" placeholder="Diagnóstico, causa probable, trabajo recomendado...">${UI.esc(d.notas||'')}</textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-brand" onclick="Modulos.diagnostico_obd.guardarEdicion('${id}')">Guardar</button>
      </div>`, '520px');
  },

  async guardarEdicion(id) {
    const { error } = await DB.upsertDiagnosticoOBD({
      id,
      vehiculo_id: document.getElementById('obd-e-veh').value,
      notas: document.getElementById('obd-e-notas').value.trim() || null,
    });
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.toast('Actualizado ✓'); UI.cerrarModal(); this.render();
  },

  eliminar(id) {
    const d = this._data.find(x => x.id === id);
    Modulos.eliminarRegistro('diagnosticos_obd', id,
      `el diagnóstico de ${d?.vehiculos?.placa || 'este vehículo'}`, () => this.render());
  },

  /* Sin id imprime el escaneo ACTIVO, aunque todavía no se haya guardado:
     el mecánico lo necesita en papel mientras tiene el carro enfrente, no
     después de ir al historial. */
  imprimir(id) {
    const s = this._scan;
    const d = id ? this._data.find(x => x.id === id)
      : s ? { ...s, created_at: s.created_at || new Date().toISOString(),
              vehiculos: s.vehiculos || (this._vehiculos || []).find(v => v.id === s.vehiculo_id) || null }
      : null;
    if (!d) { UI.toast('No hay un escaneo para imprimir', 'error'); return; }
    this._resolverNombres(d, d.vehiculos);
    const v = d.vehiculos;
    const filas = [
      ...(d.dtcs||[]).map(x => ({ ...x, tipo:'Confirmado' })),
      ...(d.dtcs_pendientes||[]).map(x => ({ ...x, tipo:'Pendiente' })),
    ];
    const vivo = this._datosLista(d.datos);
    const fz = d.freeze_frame ? this._datosLista(d.freeze_frame, ['dtc','desc']) : [];
    const html = `<!DOCTYPE html><html><head><title>Diagnóstico OBD-II</title><meta charset="UTF-8">
      <style>
        :root{--text:#111;--text2:#333;--text3:#666;--border:#ddd;--surface:#fff;--surface2:#f3f4f6;--brand:#1d4ed8;--cyan:#0284c7}
        body{font-family:Arial,sans-serif;padding:20px;max-width:700px;margin:0 auto;color:#111}
        .ia th{background:#e5e7eb;color:#111}.ia h2{text-align:left;border:none;padding:0}
        h2{text-align:center;border-bottom:2px solid #3B82F6;padding-bottom:8px}
        .section{border:1px solid #ddd;border-radius:6px;padding:12px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#3B82F6;color:#fff;padding:6px 8px;text-align:left}
        td{padding:6px 8px;border-bottom:1px solid #eee}
        .mil-on{color:#DC2626;font-weight:bold}.mil-off{color:green;font-weight:bold}
        .page-break{break-before:page;page-break-before:always} @media print{button{display:none}thead{display:table-header-group}tr{break-inside:avoid}}
      </style></head><body>
      <h2>${Auth.tenant?.name||'NexusPro'} — Diagnóstico OBD-II</h2>
      <div class="section">
        <b>VEHÍCULO:</b> ${v ? `${UI.esc(v.placa||'')} · ${UI.esc(v.marca||'')} ${UI.esc(v.modelo||'')} ${UI.esc(v.anio||'')}` : '—'}<br>
        <b>VIN:</b> ${d.vin||'—'} · <b>Fecha:</b> ${UI.fecha(d.created_at)}<br>
        <b>Protocolo:</b> ${d.protocolo||'—'} · <b>Batería:</b> ${d.voltaje||'—'}<br>
        <b>Check Engine:</b> <span class="${d.mil?'mil-on':'mil-off'}">${d.mil?'ENCENDIDO':'Apagado'}</span>
        ${d.dtcs_borrados?' · Códigos borrados tras el escaneo':''}
      </div>
      <div class="section"><b>CÓDIGOS DE FALLA:</b>
        ${filas.length ? `<table style="margin-top:8px"><thead><tr><th>Código</th><th>Descripción</th><th>Estado</th></tr></thead>
          <tbody>${filas.map(f=>`<tr><td><b>${f.codigo}</b></td><td>${f.desc}</td><td>${f.tipo}</td></tr>`).join('')}</tbody></table>`
        : '<p style="color:green">Sin códigos de falla ✓</p>'}
      </div>
      ${(() => {
        /* La reincidencia va en el papel que se lleva el cliente: es la
           diferencia entre "tiene esta falla" y "esta falla ya estaba la vez
           pasada", y de eso depende quién paga el trabajo. */
        const c = d.comparacion;
        if (!c || c.primera) return '';
        const l = arr => arr.map(x => x.codigo).join(', ');
        const cuando = c.dias === 0 ? 'hoy mismo' : c.dias === 1 ? 'hace 1 día' : `hace ${c.dias} días`;
        return `<div class="section"><b>COMPARADO CON LA VISITA ANTERIOR (${cuando} · ${UI.fecha(c.fecha)}):</b>
          <table style="margin-top:8px"><tbody>
            ${c.reincidentes.length ? `<tr><td>Volvieron</td><td class="mil-on">${l(c.reincidentes)}</td></tr>` : ''}
            ${c.nuevos.length ? `<tr><td>Nuevos desde entonces</td><td><b>${l(c.nuevos)}</b></td></tr>` : ''}
            ${c.resueltos.length ? `<tr><td>Ya no aparecen</td><td class="mil-off">${l(c.resueltos)}</td></tr>` : ''}
            ${!c.reincidentes.length && !c.nuevos.length && !c.resueltos.length
              ? '<tr><td colspan="2">Sin cambios respecto de la visita anterior.</td></tr>' : ''}
          </tbody></table>
          ${c.reincidentes.length ? '<p style="font-size:12px;margin:6px 0 0">Un código que vuelve indica que la causa sigue presente: la reparación anterior no resolvió el problema de fondo.</p>' : ''}
          ${c.borrados_antes && c.resueltos.length ? '<p style="font-size:12px;margin:6px 0 0">En la visita anterior se borraron los códigos, así que un código que hoy no aparece todavía no confirma la reparación.</p>' : ''}
        </div>`;
      })()}
      ${fz.length ? `<div class="section"><b>FREEZE FRAME (al momento de la falla ${d.freeze_frame.dtc}):</b>
        <table style="margin-top:8px"><tbody>${fz.map(i=>`<tr><td>${i[0]}</td><td><b>${i[1]}${i[2]}</b></td></tr>`).join('')}</tbody></table>
      </div>` : ''}
      ${this._vivoCategorizadoPDF(d.datos||{})}
      ${(() => { const st = this._grabStats(d.grabacion); return st.length ? `<div class="section">
        <b>GRABACIÓN DE SESIÓN (${d.grabacion.muestras.length} muestras · ${d.grabacion.seg||'?'} s):</b>
        <table style="margin-top:8px"><thead><tr><th>Sensor</th><th>Mín</th><th>Promedio</th><th>Máx</th><th>Gráfica</th></tr></thead>
        <tbody>${st.map(s=>`<tr><td>${s.l}</td><td>${s.min}${s.u}</td><td>${s.avg}${s.u}</td><td>${s.max}${s.u}</td><td style="width:150px;height:34px">${this._spark(s.vals)}</td></tr>`).join('')}</tbody></table>
      </div>` : ''; })()}
      ${this._grabComparacionPDF(d)}
      ${this._grabMuestrasPDF(d.grabacion)}
      ${d.ia_analisis ? `<div class="section ia"><b>ANÁLISIS DE NEXUS (IA):</b><div style="margin-top:6px">${typeof IA !== 'undefined' && IA._formatear ? IA._formatear(d.ia_analisis) : `<p style="white-space:pre-wrap">${UI.esc(d.ia_analisis)}</p>`}</div></div>` : ''}
      ${d.notas ? `<div class="section"><b>NOTAS DEL TÉCNICO:</b><p>${d.notas}</p></div>` : ''}
      <p style="text-align:center;color:#666;font-size:11px;border-top:1px solid #ddd;padding-top:10px;margin-top:20px">
        Generado por <b>NexusPro Enterprise v5.15.7</b> · 
        <b>Interfaz / Adaptador:</b> ${UI.esc(d.adaptador || 'vLinker / Thinkcar OBD')} · 
        <b>Fecha:</b> ${new Date().toLocaleString('es-GT')}
      </p>
      <div style="text-align:center"><button onclick="window.print()">🖨 Imprimir</button></div>
      </body></html>`;

    if (window.NexusBT && typeof window.NexusBT.imprimir === 'function') {
      window.NexusBT.imprimir(html);
      return;
    }

    try {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        return;
      }
    } catch (_) {}

    // Fallback si popup está bloqueado o en WebView móvil sin puente
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  },

  /* ═══════════ PRUEBAS DE ACTUADORES BI-DIRECCIONALES (UDS 2F / OBD2 08 / KWP 30) ═══════════ */
  /* Pruebas activas (UDS 2F): APAGADAS hasta tener definiciones verificadas.

     Ofrecía forzar electroventilador, bomba de combustible, solenoides del ABS
     o calibrar el ángulo de dirección con identificadores INVENTADOS (2F 01 01,
     2F 03 02…), y al ejecutar ignoraba la prueba elegida: mandaba siempre
     2F 01 01 03 01 al módulo que fuera — ABS o dirección incluidos. Sin
     escáner conectado igual decía "ejecutada correctamente ✓" sin transmitir
     nada. Forzar un actuador con un identificador equivocado puede mover lo
     que no es; la regla de la capa OEM es "una definición no verificada nunca
     transmite", y esto la saltaba entera. */
  modalPruebasActuadores(ecu, nombreModulo) {
    UI.modal(`⚡ Pruebas activas — ${UI.esc(nombreModulo)}`, `
      <div style="font-size:12.5px;line-height:1.6">
        <p><b>No hay pruebas activas verificadas para este módulo.</b></p>
        <p style="color:var(--text3)">Forzar un actuador exige el identificador exacto del fabricante para ESE
          módulo. Sin una definición verificada con su fuente, NexusPro no transmite: un identificador
          equivocado puede accionar algo distinto de lo que se pidió.</p>
        <p style="color:var(--text3)">Lo que sí funciona hoy: el <b>banco de pruebas</b> le manda a este módulo
          un servicio y muestra la respuesta cruda del vehículo, sin adivinar nada.</p>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
          <button class="btn btn-brand" onclick="Modulos.diagnostico_obd.modalBancoPruebas(${Number(ecu)})">🧪 Abrir banco de pruebas</button>
          <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        </div>
      </div>`, '560px');
  },

  async ejecutarPruebaActuador() {
    UI.toast('Prueba activa no disponible: no hay definición verificada para este módulo', 'warn');
  }
  }));
})();
