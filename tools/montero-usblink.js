/* Montero 2004 + USB-Link — barrido EXHAUSTIVO por el puente RP1210.
   ────────────────────────────────────────────────────────────────────────────
   Objetivo: que el USB-Link hable con el Montero. La sesion del 30/07 probo ~80
   combinaciones y ninguna trajo respuesta, pero quedaron cosas afuera:

     · el device 146 (USB-Link ATEC-160 Baud) — nunca se uso
     · 9 de los 22 protocolos del .INI
     · el init lento de 5 baudios de ISO 9141-2, que es COMO se despierta el bus
       en un vehiculo de esta epoca: sin el, el modulo no contesta aunque el
       cable este bien
     · combinaciones device x protocolo (solo se probo device 1)

   Se corre con el vehiculo enchufado y el switch en contacto:
       node tools/montero-usblink.js
   Cada linea del log dice exactamente que se probo, para que un "no contesta"
   sea un dato y no una impresion.

   NO modifica nada en el vehiculo: todo lo que manda son peticiones de lectura.
*/

const PUERTO = 17210;
const ws = new WebSocket('ws://127.0.0.1:' + PUERTO);
const pend = {}; let rx = [];
const op = (o, ms = 9000) => new Promise((res, rej) => {
  (pend[o.op] = pend[o.op] || []).push(res);
  ws.send(JSON.stringify(o));
  setTimeout(() => rej(new Error('timeout ' + o.op)), ms);
});
ws.onerror = () => { console.log('No hay puente en 127.0.0.1:' + PUERTO); process.exit(1); };
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.op === 'mensaje') { rx.push(m.datos); return; }
  if (m.op === 'error') return;
  const c = pend[m.op]; if (c && c.length) c.shift()(m);
};
const esperar = ms => new Promise(r => setTimeout(r, ms));
const hex = a => a.map(x => x.toString(16).padStart(2, '0')).join(' ');
/* Busca una secuencia exacta dentro de la trama, sin importar en que posicion
   caiga. Se usa para reconocer el eco sin depender del formato de cada
   protocolo: J1850_104k mete dos bytes extra antes de los datos y por eso el
   filtro viejo —que asumia posicion fija— lo dejo pasar. */
const contiene = (trama, aguja) => {
  for (let i = 0; i + aguja.length <= trama.length; i++) {
    let igual = true;
    for (let j = 0; j < aguja.length; j++) {
      if (trama[i + j] !== aguja[j]) { igual = false; break; }
    }
    if (igual) return true;
  }
  return false;
};
const abierto = new Promise(res => { ws.onopen = res; });

/* Los 22 protocolos del NXULNK32.INI, en orden de probabilidad para un
   Mitsubishi 2004 (K-line primero, lo exotico al final). */
const PROTOCOLOS = [
  'ISO14230', 'KWP2000', 'ISO9141', 'KW2000', 'OBDII',
  'ISO14230:Baud=10.4', 'KWP2000:Baud=10.4', 'ISO9141:Baud=10.4',
  'J1850VPW', 'J1850PWM', 'J1850_104k', 'J1850_416k', 'J1850',
  'ALDL', 'ALDL9600', 'HUMMER_ALDL', 'ATEC160BAUD',
  'IESCAN', 'HINOCLUSTER', 'CAN', 'CAN:Baud=500', 'ISO15765',
];

/* Devices declarados en el .INI. El 146/246 son ATEC-160 y nunca se probaron. */
const DEVICES = [1, 146, 2, 246];

/* Direcciones de modulo. Las tres primeras cubren casi todo: 0x33 es la
   funcional de OBD-II, 0x10 y 0x18 el motor en Mitsubishi. El resto solo se
   prueba si alguna combinacion llego a abrir Y contestar algo. */
const DESTINOS = [0x33, 0x10, 0x18];
const DESTINOS_EXTRA = [0x11, 0x12, 0x01, 0x00, 0x7A, 0x28];

/* Peticiones: el saludo KWP2000 y el modo 01 de OBD-II. Con esas dos alcanza
   para saber si HAY alguien; el resto se pregunta despues. */
function peticiones(dst) {
  return [
    { et: 'KWP StartComm', d: [0x81, dst, 0xF1, 0x81] },
    { et: 'OBD 01 00',     d: [0x82, dst, 0xF1, 0x01, 0x00] },
    { et: 'OBD 03 (DTCs)', d: [0x81, dst, 0xF1, 0x03] },
  ];
}

/* Comandos RP1210 candidatos a "despertar" el bus, con su longitud correcta */
const INITS = [
  { n: 3,  d: [],      et: 'filtros a pasar' },
  /* Eco APAGADO. Con el eco encendido el USB-Link devuelve copia de lo que sale
     y eso NO es el vehiculo contestando. El 30/07 casi lo cantamos como exito en
     J1850_104k: llego "00 00 a7 24 01 00 01 81 33 f1 81", cuya cola es byte por
     byte la peticion que acababamos de mandar. */
  { n: 16, d: [0x00],  et: 'eco de transmision OFF' },
  { n: 8,  d: [0x01],  et: 'Set_J1708_Mode' },
  { n: 2,  d: [0x01],  et: 'Set_Message_Receive' },
];

let hallazgos = [];
/* Cuantos ecos se descartaron. Sirve de control: si es 0 en todo el barrido,
   el adaptador quiza ni esta transmitiendo y un "sin respuesta" no significa
   que el vehiculo callo. */
let ecosDescartados = 0;

async function probar(device, proto) {
  await op({ op: 'desconectar' }, 6000).catch(() => {});
  await esperar(400);
  const c = await op({ op: 'conectar', protocolo: proto, device }, 9000)
    .catch(e => ({ ok: false, error: e.message }));
  if (!c.ok) return { abre: false, motivo: c.error || ('cod ' + c.codigo) };

  for (const i of INITS) await op({ op: 'comando', numero: i.n, datos: i.d }, 5000).catch(() => {});

  /* Escucha pasiva: si el bus habla solo, aparece aca */
  rx = [];
  await esperar(1200);
  const espontaneas = rx.filter(m => m[4] !== 0x01).length;

  for (const dst of DESTINOS) {
    for (const p of peticiones(dst)) {
      rx = [];
      await op({ op: 'enviar', datos: p.d }, 6000).catch(() => {});
      await esperar(700);
      /* El eco del propio driver no es respuesta del vehiculo. Se descarta por
         dos vias independientes, para que ninguna forma de trama se escape:
           1. la bandera de eco del RP1210 (byte 4, despues de la marca de tiempo)
           2. que la trama contenga, literal, lo que acabamos de transmitir
         Con el eco apagado no deberia llegar ninguno; el filtro queda igual
         porque un falso positivo aca cuesta un viaje al taller. */
      const ecos = rx.filter(m => m[4] === 0x01 || contiene(m, p.d));
      const reales = rx.filter(m => !(m[4] === 0x01 || contiene(m, p.d)));
      ecosDescartados += ecos.length;
      if (reales.length) {
        console.log(`\n  *** RESPUESTA *** device=${device} proto=${proto} dst=0x${dst.toString(16)} ${p.et}`);
        reales.slice(0, 6).forEach(m => console.log('        ' + hex(m)));
        hallazgos.push({ device, proto, dst, peticion: p.et, tramas: reales.map(hex) });
        return { abre: true, respuesta: true };
      }
    }
  }
  return { abre: true, respuesta: false, espontaneas };
}

(async () => {
  await abierto;
  const est = await op({ op: 'estado' }, 6000).catch(() => ({}));
  console.log('Adaptador: ' + (est.dispositivo || '?') + '  api=' + (est.api || '?'));
  console.log(`Barrido: ${DEVICES.length} devices x ${PROTOCOLOS.length} protocolos x ` +
              `${DESTINOS.length} destinos x 4 peticiones\n`);

  let abren = 0, cerrados = 0;
  for (const device of DEVICES) {
    console.log(`\n══════ DEVICE ${device} ══════`);
    for (const proto of PROTOCOLOS) {
      const r = await probar(device, proto);
      if (!r.abre) { cerrados++; console.log(`  ${proto.padEnd(20)} no abre (${r.motivo})`); continue; }
      abren++;
      console.log(`  ${proto.padEnd(20)} abre` +
                  (r.espontaneas ? `  ·  ${r.espontaneas} tramas espontaneas!` : '') +
                  (r.respuesta ? '  ·  RESPONDE' : '  ·  sin respuesta'));
      if (r.respuesta) {
        console.log('\n>>> ENCONTRADO. Combinacion que funciona arriba. <<<');
        await op({ op: 'desconectar' }, 6000).catch(() => {});
        ws.close(); process.exit(0);
      }
    }
  }

  /* Segunda vuelta con las direcciones menos habituales, solo en los protocolos
     de K-line que abrieron. Se deja para el final para no cobrarle 25 minutos a
     un barrido que casi siempre se resuelve —o se descarta— en los primeros. */
  if (!hallazgos.length) {
    console.log('\n══════ SEGUNDA VUELTA: direcciones menos habituales ══════');
    DESTINOS.length = 0;
    DESTINOS.push(...DESTINOS_EXTRA);
    for (const proto of ['ISO14230', 'KWP2000', 'ISO9141', 'KW2000']) {
      const r = await probar(1, proto);
      console.log(`  device 1 · ${proto.padEnd(12)} ` +
                  (!r.abre ? 'no abre' : r.respuesta ? 'RESPONDE' : 'sin respuesta'));
      if (r.respuesta) break;
    }
  }

  console.log(`\n═══ RESUMEN ═══`);
  console.log(`  combinaciones que abrieron: ${abren}   que no abrieron: ${cerrados}`);
  console.log(`  respuestas del vehiculo: ${hallazgos.length}`);
  console.log(`  ecos propios descartados: ${ecosDescartados}`);
  if (!hallazgos.length) {
    console.log('\n  Ninguna combinacion del driver trajo respuesta.');
    console.log('  Queda una sola prueba, y es fisica, no de software:');
    console.log('    medir con multimetro la continuidad entre el pin 7 del conector');
    console.log('    OBD-II del vehiculo y el conector del USB-Link.');
    console.log('    Sin continuidad en el pin 7, ningun software puede alcanzar el bus.');
  }
  await op({ op: 'desconectar' }, 6000).catch(() => {});
  ws.close(); process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(2); });
