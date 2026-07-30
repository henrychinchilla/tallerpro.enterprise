/* Tercer byte del codigo = tipo de falla, y el nombre que el modulo se da a
   si mismo por DID F197 (PR #21).

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();

// ── tipo de falla (3er byte del DTC) ──────────────────────────────
ok('0x11 = corto a tierra', M._descTipoFalla(0x11).txt === 'circuito en corto a tierra' && M._descTipoFalla(0x11).cierto);
ok('0x13 = circuito abierto', M._descTipoFalla(0x13).txt === 'circuito abierto');
ok('desconocido no se inventa', M._descTipoFalla(0x77).cierto === false && /0x77/.test(M._descTipoFalla(0x77).txt));
ok('desconocido remite al manual', /ver manual/.test(M._descTipoFalla(0x77).txt));
ok('null sin sufijo', M._descTipoFalla(null) === null);

// C1707 con tipo 0x11 y estado confirmado
const cods = M._dtcsUDS([0x59,0x02,0xFF, 0xC1,0x70,0x11,0x09]);
ok('codigo con sufijo', cods.length === 1 && cods[0].codigo === 'U0170-11');
ok('adjunta el tipo de falla', cods[0].tipo && cods[0].tipo.txt === 'circuito en corto a tierra');
ok('sin sufijo no inventa tipo', M._dtcsUDS([0x59,0x02,0xFF, 0x01,0x71,0x00,0x09])[0].tipo === null);

// ── el modulo dice como se llama ──────────────────────────────────
const texto = t => [0x62,0xF1,0x97].concat([...t].map(c=>c.charCodeAt(0)));
M._via = 'usb';
M._udsPedir = async (req,resp,tx) => (tx[0]===0x22 && tx[1]===0xF1 && tx[2]===0x97) ? texto('ABS_ESP') : null;
(async () => {
  ok('lee el nombre propio', await M._nombrePropio({req:0x745,resp:0x74D}) === 'ABS_ESP');

  M._udsPedir = async () => [0x62,0xF1,0x97, 0x00,0x01,0xFF];      // basura binaria
  ok('rechaza basura binaria', await M._nombrePropio({req:0x745}) === null);
  M._udsPedir = async () => [0x62,0xF1,0x97, 0x41,0x42];           // "AB", muy corto
  ok('rechaza nombre muy corto', await M._nombrePropio({req:0x745}) === null);
  M._udsPedir = async () => [0x7F,0x22,0x31];                      // negativa
  ok('rechaza respuesta negativa', await M._nombrePropio({req:0x745}) === null);
  M._udsPedir = async () => null;
  ok('rechaza sin respuesta', await M._nombrePropio({req:0x745}) === null);

  // en el barrido: el nombre propio gana en direcciones sin tabla...
  M._canExt = false; M._canBaud = 500;
  M._barrerModulos = async () => [{req:0x7AA,resp:0x7B2,ext:false}];   // 0x745 SI esta en la tabla: no aplica
  M._barrerModulos29 = async () => [];
  M._udsPedir = async (req,resp,tx) => {
    if (tx[0]===0x22) return texto('BCM_NISSAN');
    if (tx[0]===0x19 && tx[1]===0x02) return [0x59,0x02,0xFF, 0xC1,0x70,0x11,0x09];
    return null;
  };
  let r = await M._escanearModulos(null, null);
  ok('usa el nombre que dio el modulo', r[0].nombre === 'BCM_NISSAN');

  // ...pero NO pisa a las que la norma fija
  M._barrerModulos = async () => [{req:0x7E0,resp:0x7E8,ext:false}];
  r = await M._escanearModulos(null, null);
  ok('no pisa "Motor (ECM)" de la tabla', r[0].nombre === 'Motor (ECM)');

  // sin nombre propio cae a la deduccion por letra de codigo
  M._barrerModulos = async () => [{req:0x7AA,resp:0x7B2,ext:false}];
  M._udsPedir = async (req,resp,tx) => {
    if (tx[0]===0x22) return null;
    if (tx[0]===0x19 && tx[1]===0x02) return [0x59,0x02,0xFF, 0x41,0x70,0x11,0x09];
    return null;
  };
  r = await M._escanearModulos(null, null);
  ok('sin nombre propio deduce por el codigo', /Chasis/.test(r[0].nombre));
  fin();
})();
