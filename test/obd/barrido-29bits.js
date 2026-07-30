/* Barrido en 29 bits (PR #18): los vehiculos con direccionamiento extendido
   que no tienen nada en 0x700-0x7EF.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();

// Bus simulado en 29 bits: responden los destinos 0x10 (motor) y 0x28 (ABS)
const DST={0x10:true,0x28:true};
const enviados=[];
M._canTx=async(id,d)=>{
  enviados.push({id,ext:M._canExt});
  if(!M._canExt) return;                       // en 11 bits no contesta nadie
  const dst=(id>>8)&0xFF;
  if(((id>>>0)&0xFF)===0xF1 && DST[dst] && M._canRx)
    M._canRx((0x18DAF100|dst)>>>0,[0x02,0x7E,0x00]);
};

(async()=>{
  const h=await M._barrerModulos29(null);
  ok('barrido 29 bits encuentra los 2 destinos', h.length===2);
  ok('req bien armado 0x18DA10F1', h[0].req===0x18DA10F1);
  ok('resp bien leido 0x18DAF110', h[0].resp===0x18DAF110);
  ok('marca ext:true', h.every(x=>x.ext===true));
  ok('restaura _canExt al terminar', M._canExt===false||M._canExt===undefined);
  ok('barrio los 256 destinos', enviados.filter(e=>e.ext).length===256);

  // nombres honestos en 29 bits
  ok('nombra por destino', M._nombreUDS(0x18DA10F1,[])==='Modulo 0x10 (29 bits)');
  ok('nombra familia por letra', M._nombreUDS(0x18DA28F1,[{codigo:'C1234'}])==='Chasis / frenos 0x28 (29 bits)');
  ok('11 bits sigue usando la tabla', M._nombreUDS(0x758,[])==='Presión de neumáticos (TPMS)');

  // _escanearModulos cae a 29 bits cuando 11 bits trae <=2
  M._barrerModulos=async()=>[{req:0x7E0,resp:0x7E8,ext:false},{req:0x7E1,resp:0x7E9,ext:false}];
  const pedidos=[];
  M._udsPedir=async(req,resp)=>{ pedidos.push({req,ext:M._canExt}); return null; };
  M._canBaud=500; M._via='usb'; M._canExt=false;
  const logs=[];
  const res=await M._escanearModulos(m=>logs.push(m), null);
  ok('suma los de 29 bits a los 2 de 11 bits', res.length===4);
  ok('avisa del hallazgo en 29 bits', logs.some(l=>/2 modulo\(s\) en 29 bits/.test(l)));
  ok('consulta cada modulo con SU direccionamiento',
     pedidos.filter(p=>p.req===0x7E0).every(p=>p.ext===false) &&
     pedidos.filter(p=>p.req===0x18DA10F1).every(p=>p.ext===true));
  ok('deja _canExt como estaba', M._canExt===false);

  // con muchos modulos en 11 bits NO gasta el barrido de 29
  M._barrerModulos=async()=>[{req:0x7E0,resp:0x7E8,ext:false},{req:0x7E1,resp:0x7E9,ext:false},{req:0x758,resp:0x760,ext:false}];
  const l2=[];
  const r2=await M._escanearModulos(m=>l2.push(m), null);
  ok('no barre 29 bits si 11 bits ya dio 3', r2.length===3 && !l2.some(l=>/29 bits/.test(l)));

  // el mapa guarda y reusa el direccionamiento
  const mapa=M._mapaDeEscaneo(res);
  ok('mapa guarda ext por modulo', mapa.modulos.filter(m=>m.ext).length===2);
  ok('tarjeta muestra 29 bits', /29 bits/.test(M._mapaHTML({mapa_acceso:mapa})));
  const vivos=await M._probarConocidas([{req:0x18DA10F1,resp:0x18DAF110,ext:true},{req:0x7E0,resp:0x7E8,ext:false}]);
  ok('_probarConocidas usa ext del mapa (solo vive el de 29)', vivos.length===1 && vivos[0].req===0x18DA10F1);
  fin();
})();
