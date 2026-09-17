/* El canal de comandos no se puede quedar trabado.

   Esta prueba nace de un fallo real: el 2026-09-16 el escaneo se congeló en
   "datos en vivo 6 de 30" y, después de eso, la app ya no volvió a conectar
   NUNCA — había que recargar.

   La causa no era el vehículo ni el dongle. El temporizador de cada comando
   miraba `this._resolve`, que es COMPARTIDO, en vez de comparar contra el suyo:

     1. el comando A contesta rápido y se resuelve;
     2. arranca B y pone su resolvedor en `this._resolve`;
     3. dispara el temporizador VIEJO de A, ve que `this._resolve` existe
        —pero es el de B— y lo pone en null;
     4. llega la respuesta de B y ya no hay a quién resolver;
     5. dispara el temporizador de B, ve `this._resolve` en null y NO rechaza.

   La promesa de B no se asentaba jamás, el `finally` no corría y `_busy` quedaba
   en true PARA SIEMPRE. Como `_busy` es estado del módulo, sobrevive a la
   reconexión: de ahí el segundo síntoma.

   Se reproduce con respuestas rápidas y un tope largo, que es exactamente la
   forma de la lectura de sensores en vivo (respuestas de ~300 ms, tope 1500). */
const { cargar, ok, fin } = require('./harness');

const dormir = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { M } = cargar();

  /* Bluetooth por el puente de la app, sin puente de verdad: lo único que hace
     falta es que el módulo se crea conectado y que escribir no haga nada. */
  M._via = 'android';
  M._bt = { nombre: 'ELM327 de prueba' };
  const enviados = [];
  M._escribirBLE = async txt => { enviados.push(txt.trim()); };

  /* ── El caso que congelaba ───────────────────────────────────────────────
     A con un tope corto para que su temporizador dispare MIENTRAS B espera. */
  const pA = M._cmdRaw('0105', 120);
  await dormir(10);
  M._recibir('41 05 5A\r>');
  const rA = await pA;
  ok('el primer comando contesta', /4105/.test(rA.replace(/\s/g, '')));
  ok('...y libera el canal', M._busy === false);

  /* B arranca ANTES de que dispare el temporizador viejo de A (a los 120 ms). */
  const pB = M._cmdRaw('010C', 3000);
  await dormir(200);              // aquí dispara el temporizador huérfano de A
  M._recibir('41 0C 1A F8\r>');

  let rB = null, exploto = null;
  try { rB = await Promise.race([pB, dormir(1500).then(() => 'COLGADA')]); }
  catch (e) { exploto = e; }

  ok('el segundo comando NO se queda colgado', rB !== 'COLGADA' && !exploto);
  ok('...y devuelve su propia respuesta', typeof rB === 'string' && /410C/.test(rB.replace(/\s/g, '')));
  ok('...y el canal queda libre para el siguiente', M._busy === false);

  /* ── Un comando sin respuesta rechaza, no cuelga ─────────────────────── */
  let mensaje = null;
  try { await M._cmdRaw('0100', 80); } catch (e) { mensaje = e.message; }
  ok('sin respuesta se rechaza con un motivo legible', /Sin respuesta a 0100/.test(mensaje || ''));
  ok('...y aun así libera el canal', M._busy === false);

  /* ── Y si algo dejara _busy colgado, la espera NO es eterna ──────────── */
  M._busy = true;                 // se simula la fuga que antes era mortal
  M._TOPE_CANAL = 200;            // en produccion son 45 s; aqui no hay que esperarlos
  const t0 = Date.now();
  let err = null;
  try { await M._esperarTurno('0101'); } catch (e) { err = e; }
  ok('la espera por el canal tiene tope y avisa', !!err && /ocupado/i.test(err.message));
  ok('...y se libera sola para que el reintento sirva', M._busy === false);
  ok('...respetando el tope configurado', Date.now() - t0 < 2000);

  fin();
})();
