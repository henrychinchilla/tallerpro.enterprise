/* Henry, 2026-09-23: con el motor apagado los sensores salían en rojo/amarillo.
   Sin lectura válida no hay falla: verde y "Motor apagado". En marcha, los
   rangos de ralentí varían con la carga y tampoco son falla.

   Parte del banco de pruebas del módulo OBD — ver harness.js. */
const { cargar, ok, fin } = require('./harness');
const { M } = cargar();
const def = k => Object.values(M._PIDS).find(p => p.k === k);
const ev = (k, v, datos) => M._evaluar(def(k), v, M._ctxMotor(datos));

const apagado = { rpm: 0, vel: 0, temp: 61 };
for (const [k, v] of [['rpm', 0], ['maf', 0], ['temp', 61], ['carga_abs', 0], ['lambda', 1.99],
                      ['o2_b1s1', 0.08], ['o2_b1s2', 0.08], ['temp_cat', 108], ['carga', 0]]) {
  const r = ev(k, v, apagado);
  ok(`motor apagado: ${k} en verde con "Motor apagado"`, r.est === 'ok' && /^Motor apagado/.test(r.nota));
}
ok('voltaje ECU con motor apagado: batería sana = verde', ev('volt_ecu', 12.6, apagado).est === 'ok');
ok('voltaje ECU con motor apagado: batería baja = advertencia', ev('volt_ecu', 11.8, apagado).est === 'fuera');

const ralenti = { rpm: 750, vel: 0, temp: 90 };
ok('en ralentí caliente sí se evalúa: MAF 2.4 normal', ev('maf', 2.4, ralenti).est === 'ok' && !ev('maf', 2.4, ralenti).nota);
ok('en ralentí: voltaje 12.0 con motor en marcha = falla del alternador', ev('volt_ecu', 12.0, ralenti).est === 'mal');
ok('recalentado sigue siendo alerta', ev('temp', 115, ralenti).est === 'mal');

const marcha = { rpm: 2500, vel: 60, temp: 92 };
ok('en marcha: MAF alto no es falla', ev('maf', 25, marcha).est === 'ok' && /En marcha/.test(ev('maf', 25, marcha).nota));
ok('en marcha: la mezcla sigue evaluándose', ev('lambda', 1.2, marcha).est === 'mal');

const frio = { rpm: 900, vel: 0, temp: 45 };
ok('motor frío: temperatura "calentando", no falla', ev('temp', 45, frio).est === 'ok' && /calentando/.test(ev('temp', 45, frio).nota));
ok('motor frío: sonda lambda no se evalúa todavía', ev('o2_b1s2', 0.08, frio).est === 'ok');
fin();
