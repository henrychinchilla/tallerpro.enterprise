/* Comparacion contra la visita anterior del mismo vehiculo (PR #16)
   y los tres monitores continuos del byte B que faltaban en readiness.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M, ctx } = cargar();
const PREV = [];   // escaneos previos del vehiculo; las pruebas lo van llenando
ctx.DB.getDiagnosticosPorVehiculo = async () => PREV;

// 1. _codigosDe junta emisiones + por módulo
const hoy={dtcs:[{codigo:'P0300',modulo:'Motor (ECM)'}],
  por_modulo:[{nombre:'TPMS',codigos:[{codigo:'C1707',activo:true},{codigo:'C1734'}]}]};
const m=M._codigosDe(hoy);
ok('_codigosDe junta ambas fuentes (3)', m.size===3 && m.get('C1707').modulo==='TPMS');

// 2. primera visita
(async()=>{
  let r=await M._compararConAnterior('v1',hoy);
  ok('primera visita', r.primera===true);

  // 3. diff real
  PREV.push({id:'a1',created_at:new Date(Date.now()-10*86400000).toISOString(),
    dtcs:[{codigo:'P0300',modulo:'Motor (ECM)'},{codigo:'P0171',modulo:'Motor (ECM)'}],
    por_modulo:[], permanentes:[{codigo:'P0300'}], dtcs_borrados:true, mil:true});
  r=await M._compararConAnterior('v1',{...hoy,permanentes:[{codigo:'P0300'}]});
  ok('reincidente P0300', r.reincidentes.length===1 && r.reincidentes[0].codigo==='P0300');
  ok('nuevos = C1707,C1734', r.nuevos.map(x=>x.codigo).sort().join()==='C1707,C1734');
  ok('resuelto P0171', r.resueltos.length===1 && r.resueltos[0].codigo==='P0171');
  ok('dias=10', r.dias===10);
  ok('borrados_antes', r.borrados_antes===true);
  ok('permanente sigue', r.perm_siguen.join()==='P0300');

  // 4. no compara contra escaneos POSTERIORES (ver de un guardado viejo)
  const viejo=new Date(Date.now()-30*86400000).toISOString();
  r=await M._compararConAnterior('v1',hoy,viejo);
  ok('ignora escaneos posteriores al de referencia', r.primera===true);

  // 5. HTML no revienta y menciona lo clave
  const h=M._historialHTML({comparacion:await M._compararConAnterior('v1',hoy)});
  ok('HTML con reincidente', /VOLVIERON/.test(h)&&/P0300/.test(h));
  ok('HTML primera visita', /PRIMERA VISITA/.test(M._historialHTML({comparacion:{primera:true}})));
  ok('HTML sin datos = vacio', M._historialHTML({})==='');

  // 6. readiness: monitores continuos del byte B, sin colisionar con byte C
  M._via='ble'; M._conectado=true; M._busy=false;
  M._cmd=async()=>'41 01 81 07 65 04';   // A=81 MIL, B=07 (3 continuos, gasolina), C=65, D=04
  const rd=await M._leerReadiness();
  const cont=rd.monitores.filter(x=>x.continuo);
  ok('3 monitores continuos', cont.length===3);
  ok('continuos sin bit (no colisionan)', cont.every(x=>x.bit===null));
  ok('catalizador se resuelve por bit 0x01', rd.monitores.find(x=>x.bit===0x01).nombre==='Catalizador');
  ok('total 11 monitores gasolina', rd.monitores.length===11);
  // B=0x07 soportados, incompletos bits 0x10/0x20/0x40 = 0 -> los 3 listos
  ok('continuos listos cuando B no marca incompleto', cont.every(x=>x.soportado&&x.listo));
  fin();
})();
