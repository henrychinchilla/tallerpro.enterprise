/* Informe de Nexus sobre un escaneo (2026-09-22, Picanto P-332JPT).

   El informe salía "EXCELENTE" y a la vez "mezcla extremadamente pobre", daba
   por reparados dos códigos que sólo se habían BORRADO, llamaba "Pedal
   Embrague" al pedal E y se cortaba a media frase. Todo venía de lo que se le
   mandaba: claves internas sin unidad, ningún aviso de motor apagado, y
   lecturas OEM inventadas mezcladas con las reales.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M } = cargar();

const scan = {
  mil: false, protocolo: 'ISO 15765-4 (CAN 11/500)', dtcs: [], dtcs_pendientes: [],
  comparacion: { primera: false, dias: 0, borrados_antes: true, reincidentes: [], nuevos: [],
                 resueltos: [{ codigo: 'B2500' }, { codigo: 'C1102-16' }] },
  por_modulo: [{ ecu: 0x7B3, nombre: 'Módulo 0x7B3', codigos: [] },
               { ecu: 0x7E0, nombre: 'Motor', codigos: [] }],
  readiness: { monitores: [{ nombre: 'Catalizador', soportado: true, listo: false }] },
  datos: { rpm: 0, o2_b1s1: 1.245, lambda: 2, volt_ecu: 12.74, dist_borr: 0, warmups: 0, pedal_e: 7, map: 87 },
};
const p = M._promptIA(scan, { marca: 'Kia', modelo: 'Picanto', anio: 2019 });

ok('los sensores viajan con su nombre, no con la clave interna',
   /Pedal acelerador E: 7 %/.test(p) && !/pedal_e:/.test(p) && !/o2_b1s1/.test(p));
ok('avisa que el motor estaba apagado', /MOTOR APAGADO/.test(p));
ok('con motor apagado la sonda lambda no sale como FUERA',
   /Sonda lambda B1S1: 1\.245 V \[no evaluable con motor apagado\]/.test(p));
ok('con motor apagado el voltaje se juzga como batería en reposo',
   /Voltaje ECU: 12\.74 V \[batería en reposo/.test(p));
ok('un borrado reciente no se presenta como reparación',
   /BORRADOS RECIENTEMENTE/.test(p) && /sin verificar/.test(p));
ok('monitores incompletos se mencionan', /INCOMPLETOS: Catalizador/.test(p));
ok('un módulo sin nombre no se bautiza', /0x7B3 · sin identificar/.test(p));
ok('formato corto y fijo (4 secciones)',
   ['## Veredicto', '## Hallazgos', '## Acciones recomendadas', '## Alcance del escaneo'].every(s => p.includes(s)));

// Con el motor en marcha los rangos vuelven a valer
const enMarcha = M._promptIA({ ...scan, datos: { rpm: 780, o2_b1s1: 1.245 } }, null);
ok('en marcha, una sonda fija fuera de rango sí se marca FUERA',
   /Sonda lambda B1S1: 1\.245 V \[ref 0\.1–0\.9.*→ FUERA\]/.test(enMarcha) && !/MOTOR APAGADO/.test(enMarcha));

ok('ya no existe el relleno de parámetros OEM inventados',
   typeof M._sintetizarParametrosOEM === 'undefined');

fin();
