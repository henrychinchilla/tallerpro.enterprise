const {cargar,ok,fin}=require('./harness');
const {M}=cargar();

const antes={inicio:'2026-08-01T10:00:00Z',seg:2,muestras:[{t:0,rpm:800,temp:85},{t:1,rpm:1000,temp:87}],marcadores:[]};
const despues={inicio:'2026-08-02T10:00:00Z',seg:2,muestras:[{t:0,rpm:900,temp:90},{t:1,rpm:1300,temp:92}],marcadores:[{t:1,tipo:'Falla / tirón',nota:'se sintió vibración'}]};
const stats=M._grabStats(despues);
ok('estadísticas conservan la llave para comparar',stats.some(x=>x.k==='rpm'));
const cmp=M._compararGrabaciones(antes,despues);
ok('compara promedio antes y después',cmp.find(x=>x.k==='rpm').antes===900&&cmp.find(x=>x.k==='rpm').despues===1100);
ok('calcula el cambio de promedio',cmp.find(x=>x.k==='rpm').cambio===200);
const pdf=M._grabMuestrasPDF(despues);
ok('PDF incluye todas las muestras',pdf.includes('TODAS LAS MUESTRAS (2)')&&(pdf.match(/<tr>/g)||[]).length===3);
ok('PDF incluye marcadores del técnico',pdf.includes('Falla / tirón')&&pdf.includes('vibración'));
M._data=[{id:'a',vehiculo_id:'v1',created_at:'2026-08-01T10:00:00Z',grabacion:antes},{id:'b',vehiculo_id:'v1',created_at:'2026-08-02T10:00:00Z',grabacion:despues}];
ok('encuentra sólo la grabación anterior del vehículo',M._grabAnterior(M._data[1]).id==='a');
fin();
