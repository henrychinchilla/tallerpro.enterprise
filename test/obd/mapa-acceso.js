/* Mapa de acceso por modelo (PR #17): el taller aprende por donde entrarle
   a cada vehiculo, lo reusa y avisa si falta un modulo que siempre contesta.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();
let MODELO = [];   // escaneos previos del mismo modelo
ctx.DB.getDiagnosticosPorModelo = async () => MODELO;

M._vehiculos=[{id:'v1',marca:'Nissan',modelo:'Rogue',anio:2017}];

(async()=>{
  ok('sin escaneos previos no hay mapa', await M._mapaConocido('v1')===null);

  MODELO = [
   {mapa_acceso:{bits:11,baud:500,modulos:[{req:0x7E0,resp:0x7E8,nombre:'Motor (ECM)',servicio:'19 02'},
                                           {req:0x758,resp:0x760,nombre:'Presión de neumáticos (TPMS)'}]}},
   {mapa_acceso:{bits:11,baud:500,modulos:[{req:0x7E0,resp:0x7E8,nombre:'Motor (ECM)'},
                                           {req:0x744,resp:0x74C,nombre:'Airbag / SRS'}]}},
   {mapa_acceso:null},
  ];
  const mp=await M._mapaConocido('v1');
  ok('mapa junta 3 direcciones de 2 escaneos', mp.modulos.length===3 && mp.n===2);
  ok('ordena por veces visto (ECM primero)', mp.modulos[0].req===0x7E0 && mp.modulos[0].visto===2);
  ok('conserva marca/modelo', mp.marca==='Nissan'&&mp.modelo==='Rogue'&&mp.anio===2017);

  // Simula el bus: ECM y TPMS contestan; el airbag no (modulo caido)
  const VIVOS={0x7E0:0x7E8, 0x758:0x760};
  M._canTx=async(id)=>{ const r=VIVOS[id]; if(r&&M._canRx) M._canRx(r,[0x02,0x7E,0x00]); };
  M._via='usb';   // el transporte decide la primitiva: fijarlo antes de tocar puertas
  const vivos=await M._probarConocidas(mp.modulos);
  ok('_probarConocidas encuentra los 2 vivos', vivos.length===2 && vivos.some(v=>v.req===0x7E0&&v.resp===0x7E8));
  ok('_probarConocidas no inventa el caido', !vivos.some(v=>v.req===0x744));

  // _escanearModulos: barrido stub que no agrega nada + UDS que no contesta
  M._barrerModulos=async()=>[];
  M._udsPedir=async()=>null;
  M._canExt=false; M._canBaud=500; M._via='usb';
  const logs=[];
  const res=await M._escanearModulos(m=>logs.push(m), mp);
  ok('escanea los del mapa aunque el barrido no aporte', res.length===2);
  ok('detecta el modulo faltante', M._mapaFaltantes.length===1 && M._mapaFaltantes[0].req===0x744);
  ok('avisa del faltante en el log', logs.some(l=>/NO respondieron/.test(l)&&/Airbag/.test(l)));
  ok('ninguno marcado nuevo (todos del mapa)', res.every(m=>!m.nuevo));

  const mapa=M._mapaDeEscaneo(res);
  ok('_mapaDeEscaneo arma bits/baud/modulos', mapa.bits===11&&mapa.baud===500&&mapa.modulos.length===2);
  ok('_mapaDeEscaneo arrastra faltantes', mapa.faltantes.length===1);
  ok('_mapaHTML pinta modulos y aviso', /0x7E0/.test(M._mapaHTML({mapa_acceso:mapa})) && /no respondieron/.test(M._mapaHTML({mapa_acceso:mapa})));
  ok('_mapaHTML vacio sin mapa', M._mapaHTML({})==='');

  // modulo nuevo que el mapa del modelo no tenia
  M._barrerModulos=async()=>[{req:0x748,resp:0x750}];
  const res2=await M._escanearModulos(()=>{}, mp);
  ok('marca como nuevo el que no estaba en el mapa', res2.find(m=>m.ecu===0x748).nuevo===true);
  ok('no marca nuevo a los conocidos', res2.find(m=>m.ecu===0x7E0).nuevo===false);
  fin();
})();
