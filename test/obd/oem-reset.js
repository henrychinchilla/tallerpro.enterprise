/* Ejecutar un reset OEM: qué transmite, qué no, y por qué.

   La regla de esta capa es una sola: una definición no verificada NUNCA
   transmite. Encima de eso, un reset agrega dos cosas que una lectura no tiene
   — una dirección de módulo real y precondiciones MEDIDAS en el vehículo — y
   una tercera que es la que evita el desastre: el comando tiene que existir.

   Solo dos resets son normativos (ISO 14229-1): borrar la memoria de fallas de
   un módulo y reiniciarlo. Todo lo demás (punto cero de la dirección,
   adaptativos de la caja, DPF, registro de batería) depende de una rutina
   propia de la marca. Mandar un 31 01 con un identificador inventado no es
   "hacer el reset": es escribirle cualquier cosa a un módulo del vehículo de
   un cliente. Por eso, sin el identificador del manual, no sale nada.

   Parte del banco de pruebas del módulo OBD — ver harness.js. */

const fs = require('fs'), vm = require('vm'), path = require('path');
const { ok, fin } = require('./harness');

const fuente = fs.readFileSync(
  path.join(__dirname, '../../js/modulos/operacion/diagnostico_oem.js'), 'utf8');
const ctx = { globalThis: null, Modulos: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fuente, ctx);
const O = ctx.OEMMotor;

const hex = b => b.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const detenido = { contacto: true, velocidad: 0, motor: false, voltaje: 12.4 };

const borrar = {
  nombre: 'Borrar códigos del módulo · Motor', marca: 'Kia', modelo: 'Picanto',
  ecu: 'ECM / PCM (motor)', tipo: 'reset', identificador: 'dtc_modulo',
  estado: 'verificado', riesgo: 'controlado', protocolo: 'uds', activa: true,
  fuente: 'Norma ISO / SAE: ISO 14229-1, ClearDiagnosticInformation (14 FF FF FF)',
  definicion: { red: 'hs', request_id: 0x7E0, response_id: 0x7E8, objetivo_reset: 'dtc_modulo' },
  precondiciones: ['contacto'],
};

/* ── La receta: qué bytes salen ── */
const r1 = O.recetaDeReset(borrar);
ok('borrar códigos sale por ClearDiagnosticInformation', r1.ok && r1.origen === 'norma');
ok('y la trama es exactamente 14 FF FF FF', hex(r1.pasos[0].tx) === '14 FF FF FF');
ok('espera la respuesta positiva 0x54', r1.pasos[0].positiva === 0x54);

const reiniciar = { ...borrar, identificador: 'ecu_reinicio', riesgo: 'alto',
  definicion: { ...borrar.definicion, objetivo_reset: 'ecu_reinicio' },
  precondiciones: ['contacto', { clave: 'velocidad_max', valor: 0 }] };
const r2 = O.recetaDeReset(reiniciar);
ok('reiniciar el módulo es ECUReset 11 01', r2.ok && hex(r2.pasos[0].tx) === '11 01');
ok('y espera 0x51', r2.pasos[0].positiva === 0x51);

/* ── Lo que NO tiene comando normalizado no inventa uno ── */
const sas = { ...borrar, ecu: 'EPS / PSCM (dirección)', identificador: 'sas_cero', riesgo: 'alto',
  definicion: { ...borrar.definicion, objetivo_reset: 'sas_cero' } };
const r3 = O.recetaDeReset(sas);
ok('el punto cero de la dirección NO tiene receta normalizada', r3.ok === false);
ok('y dice qué falta: el identificador de rutina del manual',
   /rutina/i.test(r3.motivo) && /manual/i.test(r3.motivo));
ok('sin receta, no se ejecuta', O.puedeEjecutarReset(sas, detenido).ok === false);

/* ── La rutina del fabricante SÍ, cuando viene de un manual ── */
const conRutina = { ...sas, definicion: { ...sas.definicion, rutina: { rid: 0x0203, sub: 0x01 } } };
const r4 = O.recetaDeReset(conRutina);
ok('con el identificador cargado, arma el RoutineControl', r4.ok && r4.origen === 'rutina');
ok('y la trama es 31 01 02 03', hex(r4.pasos[0].tx) === '31 01 02 03');
const rutinaMala = { ...sas, definicion: { ...sas.definicion, rutina: { rid: 0x1FFFF } } };
ok('un identificador de rutina fuera de rango no pasa por bueno',
   O.recetaDeReset(rutinaMala).ok === false);
const rutinaBasura = { ...sas, definicion: { ...sas.definicion, rutina: { rid: 0x0203, datos: [999, 'x', 5] } } };
ok('los datos de la rutina se filtran a bytes válidos',
   hex(O.recetaDeReset(rutinaBasura).pasos[0].tx) === '31 01 02 03 05');

/* ── La escalera de seguridad ── */
ok('un reset verificado y detenido se puede ejecutar', O.puedeEjecutarReset(borrar, detenido).ok === true);
ok('sin verificar, no', O.puedeEjecutarReset({ ...borrar, estado: 'laboratorio' }, detenido).ok === false);
ok('de riesgo crítico, tampoco',
   O.puedeEjecutarReset({ ...borrar, riesgo: 'critico' }, detenido).ok === false);
const sinDir = { ...borrar, definicion: { ...borrar.definicion, request_id: undefined } };
ok('sin dirección de módulo, no', O.puedeEjecutarReset(sinDir, detenido).ok === false);
ok('y el motivo manda a completarla desde el mapa del vehículo',
   /mapa de acceso/i.test(O.puedeEjecutarReset(sinDir, detenido).motivo));

const rodando = O.puedeEjecutarReset(reiniciar, { contacto: true, velocidad: 40, motor: true });
ok('no se reinicia un módulo con el vehículo en movimiento', rodando.ok === false);
ok('y lo dice por la velocidad', /[Vv]elocidad/.test(rodando.motivo));
const sinMedir = O.puedeEjecutarReset(reiniciar, { contacto: true });
ok('si no se pudo medir la velocidad, tampoco: no adivina', sinMedir.ok === false);
ok('el ELM puede no revelar la dirección de respuesta y aun así se ejecuta',
   O.puedeEjecutarReset({ ...borrar, definicion: { ...borrar.definicion, response_id: null } }, detenido).resp === null);

/* El botón de lectura sigue siendo solo para lecturas: un reset no se cuela
   por ahí, tiene su propia puerta con precondiciones medidas. */
ok('el ejecutor de lecturas DID rechaza un reset', O.puedeEjecutar(borrar).ok === false);

/* ── El paquete Kia Picanto ── */
const paq = O.paquetes.find(x => x.id === 'kia_picanto');
ok('existe el paquete Kia Picanto', !!paq);
const defs = paq.construir();
ok('trae definiciones para todo el trabajo del vehículo', defs.length >= 18);
ok('todas declaran fuente', defs.every(d => String(d.fuente || '').trim().length > 10));
ok('todas son del Picanto', defs.every(d => d.marca === 'Kia' && d.modelo === 'Picanto'));

const verificadas = defs.filter(d => d.estado === 'verificado');
ok('hay definiciones ejecutables el día uno', verificadas.length >= 10);
ok('TODA definición verificada tiene dirección legislada ISO 15765-4',
   verificadas.every(d => {
     const q = d.definicion.request_id;
     return Number.isInteger(q) && q >= 0x7E0 && q <= 0x7E7;
   }));
ok('y esas direcciones son solo motor y transmisión',
   verificadas.every(d => [0x7E0, 0x7E1].includes(d.definicion.request_id)));
ok('ninguna verificada es de un módulo fuera del rango legislado',
   !verificadas.some(d => /ABS|airbag|carrocer|Inmovil|direcci|tablero/i.test(d.ecu)));

const resets = defs.filter(d => d.tipo === 'reset');
ok('el paquete trae 7 resets: 4 ejecutables y 3 pendientes de dirección', resets.length === 7);
ok('cada reset lleva su objetivo como identificador (o el índice único los choca)',
   resets.every(d => d.identificador === d.definicion.objetivo_reset));
const claves = resets.map(d => [d.marca, d.modelo, d.ecu, d.tipo, d.identificador].join('|'));
ok('y no hay dos resets con la misma clave única', new Set(claves).size === claves.length);

const ejecutables = resets.filter(d => O.puedeEjecutarReset(d, detenido).ok);
ok('borrar códigos y reiniciar quedan ejecutables en motor y transmisión',
   ejecutables.length === 4);
ok('todos los ejecutables usan un servicio normativo',
   ejecutables.every(d => ['dtc_modulo', 'ecu_reinicio'].includes(d.definicion.objetivo_reset)));

const pendientes = resets.filter(d => d.estado === 'borrador');
ok('ABS, airbag y carrocería vienen en borrador', pendientes.length === 3);
ok('y SIN dirección: no se inventa un 0x7B3 de memoria',
   pendientes.every(d => d.definicion.request_id === undefined));
ok('ninguno de esos puede ejecutarse', pendientes.every(d => !O.puedeEjecutarReset(d, detenido).ok));
ok('y cada uno dice que la dirección sale del propio vehículo',
   pendientes.every(d => /mapa de acceso/i.test(d.definicion.nota_validacion || '')));

const procs = defs.filter(d => d.tipo === 'procedimiento');
ok('los resets que dependen de una rutina de marca quedan como procedimiento', procs.length === 4);
ok('un procedimiento no transmite nada', procs.every(d => !O.puedeEjecutar(d).ok && d.riesgo === 'lectura'));
ok('y explica exactamente qué falta para habilitarlo',
   procs.every(d => /rutina/i.test(d.definicion.nota_validacion || '')));

const immo = defs.filter(d => String(d.tipo).startsWith('immo_'));
ok('el IMMO del paquete es solo identificación',
   immo.length === 1 && immo[0].definicion.objetivo_immo === 'identificacion' && immo[0].estado === 'borrador');
ok('y no menciona llaves, PIN, clonación ni bypass',
   !/llave|pin|clonac|bypass/i.test(JSON.stringify(immo[0]).replace(/no contiene[^"]*/i, '')));

const dids = defs.filter(d => d.tipo === 'did');
ok('la identificación cubre VIN, pieza, software y serie de las dos ECU', dids.length === 8);
ok('y toda la identificación es de riesgo lectura', dids.every(d => d.riesgo === 'lectura'));
ok('las definiciones del paquete pasan la validación del motor',
   defs.filter(d => d.estado === 'verificado').every(d => O.validar(d).length === 0));

/* ── El módulo expone lo necesario para ejecutar ── */
ok('hay un ejecutor de reset en el módulo', fuente.includes('async ejecutarResetOEM('));
ok('mide el estado del vehículo antes de decidir', fuente.includes('_estadoVehiculoOEM'));
ok('pide confirmación antes de transmitir', /ejecutarResetOEM[\s\S]*?UI\.confirmar\(/.test(fuente));
ok('registra en la bitácora antes de transmitir',
   /ejecutarResetOEM[\s\S]*?estado:'iniciada'/.test(fuente));
ok('guarda la trama enviada y la respuesta', /solicitud_hex:tramas/.test(fuente) && /respuesta_hex: ultimo\.respuesta/.test(fuente));
ok('devuelve la cabecera del ELM al terminar', /ejecutarResetOEM[\s\S]*?_elmPuntoAPunto\(/.test(fuente));
ok('exige rol de administración', /ejecutarResetOEM[\s\S]*?rolEnLista\(\['admin','gerente_tal'\]\)/.test(fuente));
ok('hay un cargador de paquetes', fuente.includes('async cargarPaqueteOEM('));
ok('y una forma de completar direcciones desde el mapa', fuente.includes('async completarDireccionesOEM('));

fin();
