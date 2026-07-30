/* Modulos que no hablan UDS (PR #19): cadena 19 02 -> sesion extendida ->
   19 0A -> KWP2000 18 00 FF 00, sin inventar el byte de estado de KWP.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();

// ── parser KWP ────────────────────────────────────────────────
let r=M._dtcsKWP([0x58,0x02, 0x01,0x71,0x20, 0xC1,0x23,0x40]);
ok('KWP decodifica 2 codigos', r.length===2 && r[0].codigo==='P0171' && r[1].codigo==='U0123');
ok('KWP NO afirma estado', r.every(c=>c.estadoDesconocido===true && c.activo===false && c.confirmado===false));
ok('KWP conserva el byte crudo', r[0].estado===0x20);
ok('KWP sin byte de conteo', M._dtcsKWP([0x58,0x01,0x71,0x20])[0].codigo==='P0171');
ok('KWP descarta 0000 y FFFF', M._dtcsKWP([0x58,0x02, 0x00,0x00,0x00, 0xFF,0xFF,0x00]).length===0);
ok('KWP ignora respuesta que no es 58', M._dtcsKWP([0x7F,0x18,0x11]).length===0);
ok('KWP ignora largo imposible', M._dtcsKWP([0x58,0x02,0x01]).length===0);
ok('KWP no confunde con UDS', M._dtcsKWP(null).length===0);

// ── la cadena de respaldo ─────────────────────────────────────
M._canExt=false; M._canBaud=500; M._via='usb';
M._barrerModulos=async()=>[];
M._barrerModulos29=async()=>[];
M._probarConocidas=async(c)=>c.map(x=>({req:x.req,resp:x.resp,ext:!!x.ext,servicio:x.servicio||null}));

const pedidos=[];
// modulo viejo: niega 19 02 y 19 0A, contesta KWP
M._udsPedir=async(req,resp,tx)=>{
  pedidos.push(tx.map(b=>b.toString(16)).join(' '));
  if(tx[0]===0x19) return [0x7F,0x19,0x11];
  if(tx[0]===0x10) return [0x7F,0x10,0x11];
  if(tx[0]===0x18) return [0x58,0x01, 0xC1,0x07,0x60];
  return null;
};
(async()=>{
  const mapa={marca:'X',modelo:'Y',n:1,modulos:[{req:0x740,resp:0x748,ext:false}]};
  const res=await M._escanearModulos(null, mapa);
  ok('modulo viejo YA NO sale "sin codigos"', res[0].codigos.length===1 && res[0].codigos[0].codigo==='U0107');
  ok('registra el servicio que funciono', res[0].servicio==='18 00 FF 00 (KWP2000)');
  ok('probo 19 02 antes de KWP', pedidos[0].startsWith('19 2'));
  ok('probo 19 0A en el camino', pedidos.some(p=>p==='19 a'));
  ok('llego a KWP', pedidos.some(p=>p==='18 0 ff 0'));

  // el mapa recuerda: el proximo escaneo arranca por KWP
  pedidos.length=0;
  const mapa2={marca:'X',modelo:'Y',n:2,modulos:[{req:0x740,resp:0x748,ext:false,servicio:'18 00 FF 00 (KWP2000)'}]};
  const res2=await M._escanearModulos(null, mapa2);
  ok('con el mapa arranca directo en KWP', pedidos[0]==='18 0 ff 0');
  ok('y no gasta 19 02 / 19 0A', !pedidos.some(p=>p.startsWith('19 ')));
  ok('mismo resultado', res2[0].codigos[0].codigo==='U0107');

  // un modulo UDS normal no se toca
  pedidos.length=0;
  M._udsPedir=async(req,resp,tx)=>{
    pedidos.push(tx[0]);
    if(tx[0]===0x19&&tx[1]===0x02) return [0x59,0x02,0xFF, 0x01,0x71,0x00,0x09];
    return null;
  };
  const res3=await M._escanearModulos(null, {marca:'X',modelo:'Y',n:1,modulos:[{req:0x7E0,resp:0x7E8}]});
  ok('UDS normal responde al primer intento', res3[0].codigos.length===1 && res3[0].servicio==='19 02');
  ok('no cae a KWP si UDS contesto', !pedidos.includes(0x18));
  ok('UDS conserva el estado real', res3[0].codigos[0].confirmado===true && !res3[0].codigos[0].estadoDesconocido);
  fin();
})();
