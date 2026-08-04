/* La OT (Ordenes de Trabajo) es exclusiva de vehículos.

   Dos bugs reportados juntos: el selector de cliente aparecía vacío al abrir
   "＋ OT" desde Vehículos (porque _clientes/_vehiculos nunca se habían
   cargado — sólo render() los llenaba), y el formulario ofrecía un selector
   de "Tipo de Servicio" con las otras verticales (Herrería, Peletería...)
   que ya tienen su propio flujo de OT en su propio módulo. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
let htmlCapturado = '';

const ctx = {
  console,
  Modulos: {},
  UI: { modal: (_t, h) => { htmlCapturado = h; }, esc: v => String(v ?? '') },
  ESTADOS_OT: {
    recibido: { label:'Recibido' }, diagnostico: { label:'Diagnóstico' },
    en_proceso: { label:'En Proceso' }, listo: { label:'Listo' },
    entregado: { label:'Entregado' }, cancelado: { label:'Cancelado' }, garantia: { label:'Garantía' },
  },
  DB: {
    getVehiculos: async () => [{ id: 'v1', cliente_id: 'c1', placa: 'P123ABC', marca: 'Toyota', modelo: 'Corolla', anio: 2018 }],
    getClientes:  async () => [{ id: 'c1', nombre: 'Juan Pérez', nit: '123456' }],
    getEmpleados: async () => [],
  },
  document: { getElementById: () => null, querySelectorAll: () => [] },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'operacion', 'ordenes.js'), 'utf8'), ctx);
const ORD = ctx.Modulos.ordenes;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

(async () => {
  /* Estado real al entrar desde Vehículos: nadie llamó antes a render().
     Reproduce el botón "＋ OT" de la fila del vehículo, que abre
     modalForm(null, vehiculoId) directo — el camino que fallaba. */
  ok('arranca sin clientes cargados (así estaba el bug)', ORD._clientes.length === 0);

  await ORD.modalForm(null, 'v1');

  ok('el modal sí se abrió', htmlCapturado.length > 0);
  ok('el cliente cargado aparece como opción seleccionable', htmlCapturado.includes('Juan Pérez'));
  ok('el vehículo del cliente aparece preseleccionado', htmlCapturado.includes('P123ABC'));
  ok('ya NO ofrece las otras verticales como "tipo de servicio"', !/Tipo de Servicio|Herrería y Estructuras|Peletería &amp; Cueros/.test(htmlCapturado));
  ok('el selector de vehículo sigue siendo obligatorio (id ot-veh)', htmlCapturado.includes('id="ot-veh"'));

  console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
  process.exit(fallidas ? 1 : 0);
})();
