/* ═══════════════════════════════════════════════════════
   BÁSCULA DIGITAL — leer el peso en vez de teclearlo

   Para qué: en granos y agroservicio la venta ES el peso. Teclearlo a mano
   invita al error y a la discusión con el cliente; leerlo de la báscula lo
   vuelve un dato.

   CÓMO SE CONECTA. Las básculas de mostrador que se usan acá sacan el peso por
   puerto serie (RS-232, casi siempre con un adaptador USB) en texto plano y
   continuo. El navegador lo lee con Web Serial, que existe en Chrome y Edge de
   escritorio; en Android hay modelos con Bluetooth, y para esos se usa Web
   Bluetooth con el servicio estándar de báscula (0x181D).

   LO QUE NO SE PUEDE PROMETER: cada fabricante arma la trama a su manera. Se
   soportan las formas comunes (Toledo/CAS/Excell y las que sólo mandan el
   número) y se muestra en pantalla lo que llega en crudo, para que si un
   modelo no calza se vea POR QUÉ y se pueda agregar. La captura a mano nunca
   se quita: una báscula que no conecta no puede dejar sin vender al comercio.

   Estabilidad: sólo se toma el peso cuando la báscula lo declara estable (ST)
   o cuando el número no cambia por medio segundo. Un peso tomado mientras el
   grano se acomoda es un peso equivocado.
═══════════════════════════════════════════════════════ */

const Bascula = {
  _puerto: null,
  _lector: null,
  _leyendo: false,
  _buffer: '',
  _ultimo: null,          // { peso, unidad, estable, crudo }
  _estables: [],          // ultimas lecturas, para decidir estabilidad por repeticion
  onLectura: null,        // callback que pone la app

  disponible() {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  },
  disponibleBluetooth() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  },

  /* Interpreta una línea de la báscula.

     Formas que se aceptan, en orden:
       "ST,GS,+  12.345kg"   → Toledo/CAS: estado, bruto/neto, signo, peso
       "ST,NT,-   1.20 lb"
       "+00012.34 kg"        → sólo peso con signo
       "12.345"              → sólo el número (muchas básculas chinas)
     Devuelve null si la línea no trae un número — que es lo correcto: hay
     modelos que mandan encabezados y basura entre pesada y pesada. */
  parsear(linea) {
    const s = String(linea || '').trim();
    if (!s) return null;

    /* Estabilidad declarada por la bascula: ST = estable, US = inestable. */
    let estable = null;
    if (/^ST/i.test(s)) estable = true;
    else if (/^US/i.test(s)) estable = false;

    /* El primer numero, con signo opcional. OJO: en la trama el signo viene
       SEPARADO del numero ("ST,NT,-   1.20 lb"), asi que hay que permitir
       espacios en medio — si no, una tara se lee como peso positivo y la
       venta sale al reves. Se admite coma decimal porque hay basculas
       configuradas en formato europeo. */
    const m = s.match(/([-+])?\s*(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    let peso = parseFloat(m[2].replace(',', '.'));
    if (!isFinite(peso)) return null;
    if (m[1] === '-') peso = -peso;

    /* Unidad al final de la trama; por defecto kg, que es lo que traen
       configuradas de fabrica. */
    let unidad = 'kg';
    if (/\blb\b|libras?/i.test(s)) unidad = 'lb';
    else if (/\bg\b|gramos?/i.test(s) && !/\bkg\b/i.test(s)) unidad = 'g';
    else if (/\boz\b/i.test(s)) unidad = 'oz';

    return { peso, unidad, estable, crudo: s };
  },

  /* Decide si ya se puede tomar el peso. Si la bascula no dice si es estable,
     se exige que el mismo numero se repita: tomar el peso mientras el grano
     se acomoda da una venta mal pesada. */
  _confirmar(lectura) {
    if (lectura.estable === true) return true;
    if (lectura.estable === false) { this._estables = []; return false; }
    this._estables.push(lectura.peso);
    if (this._estables.length > 4) this._estables.shift();
    return this._estables.length >= 3 && this._estables.every(p => p === this._estables[0]);
  },

  /* Convierte a la unidad que pide la pantalla. Devuelve null si no se puede
     (la bascula da masa; si alguien pide metros, no hay conversion posible). */
  aUnidad(lectura, unidadDestino) {
    if (!lectura) return null;
    const equiv = { kg: 1, g: 0.001, lb: 0.45359237, oz: 0.0283495,
                    quintal: 45.359237, arroba: 11.33980925, tonelada: 1000 };
    const a = equiv[lectura.unidad], b = equiv[unidadDestino];
    if (!a || !b) return null;
    return Math.round((lectura.peso * a / b) * 1000) / 1000;
  },

  /* Conectar por USB/serie. Pide permiso al usuario: el navegador NO deja
     abrir un puerto sin que la persona elija cual, y eso es correcto. */
  async conectar(baudRate = 9600) {
    if (!this.disponible()) {
      return { ok: false, error: 'Este navegador no puede leer básculas por USB. Usá Chrome o Edge en la computadora, o escribí el peso a mano.' };
    }
    try {
      this._puerto = await navigator.serial.requestPort();
      await this._puerto.open({ baudRate });
      this._leyendo = true;
      this._loop();
      return { ok: true };
    } catch (e) {
      /* Que el usuario cancele el dialogo no es un error que haya que gritar. */
      const msg = String(e?.message || e);
      if (/No port selected|cancel/i.test(msg)) return { ok: false, cancelado: true };
      return { ok: false, error: msg };
    }
  },

  async _loop() {
    const decoder = new TextDecoderStream();
    this._puerto.readable.pipeTo(decoder.writable).catch(() => {});
    this._lector = decoder.readable.getReader();
    try {
      while (this._leyendo) {
        const { value, done } = await this._lector.read();
        if (done) break;
        this._buffer += value;
        /* Las tramas llegan cortadas: se procesa por linea completa y se
           guarda el resto para la proxima vuelta. */
        const partes = this._buffer.split(/[\r\n]+/);
        this._buffer = partes.pop() || '';
        for (const linea of partes) {
          const lectura = this.parsear(linea);
          if (!lectura) continue;
          this._ultimo = lectura;
          if (typeof this.onLectura === 'function') {
            this.onLectura(lectura, this._confirmar(lectura));
          }
        }
      }
    } catch (_) { /* el puerto se desconecto: se corta la lectura y ya */ }
  },

  async desconectar() {
    this._leyendo = false;
    try { await this._lector?.cancel(); } catch (_) {}
    try { await this._puerto?.close(); } catch (_) {}
    this._lector = null; this._puerto = null; this._buffer = ''; this._estables = [];
  },
};

if (typeof window !== 'undefined') window.Bascula = Bascula;
