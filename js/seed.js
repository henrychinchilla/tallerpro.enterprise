/* ═══════════════════════════════════════════════════════
   seed.js — Datos de demostración
   Se ejecuta una sola vez (flag 'seeded' en localStorage)
═══════════════════════════════════════════════════════ */

function seedDemoData() {
  if (DB.get('seeded')) return;

  /* ── TENANTS ─────────────────────────────────────── */
  DB.set('tenants', {
    'automotriz-torres': {
      name:    'Automotriz Torres & Asociados',
      slug:    'automotriz-torres',
      plan:    'Pro',
      nit:     '1234567-8',
      tel:     '2456-7890',
      email:   'info@torres.gt',
      address: '7a Av. 12-34, Zona 1, Ciudad de Guatemala',
      logo:    '🔧',
      fel_certificador: 'INFILE'
    }
  });

  /* ── CLIENTES ────────────────────────────────────── */
  DB.set('clientes', [
    { id:'c1', nombre:'Carlos Mendoza',   email:'carlos@gmail.com',      tel:'5540-1234', nit:'9876543-2', direccion:'Zona 10, Guatemala',         created:'2024-01-15', vehiculos:['v1','v2'] },
    { id:'c2', nombre:'María García',     email:'maria@outlook.com',     tel:'4412-5678', nit:'1122334-5', direccion:'Zona 7, Guatemala',          created:'2024-02-20', vehiculos:['v3'] },
    { id:'c3', nombre:'Roberto Lima',     email:'rlima@empresa.gt',      tel:'3340-9900', nit:'5544332-1', direccion:'Mixco, Guatemala',           created:'2024-03-05', vehiculos:['v4'] },
    { id:'c4', nombre:'Ana Pérez',        email:'ana.perez@gmail.com',   tel:'2290-4411', nit:'7788990-3', direccion:'Villa Nueva, Guatemala',      created:'2024-04-10', vehiculos:['v5'] },
    { id:'c5', nombre:'Luis Castillo',    email:'lcastillo@hotmail.com', tel:'5566-7788', nit:'3344556-7', direccion:'Zona 15, Guatemala',         created:'2024-04-18', vehiculos:['v6'] }
  ]);

  /* ── VEHÍCULOS ───────────────────────────────────── */
  DB.set('vehiculos', [
    { id:'v1', placa:'P 247 AKZ', marca:'Toyota',    modelo:'Hilux',     anio:2020, color:'Blanco', motor:'2.4L Diesel',    vin:'JT3HP10V6W0123456', cliente_id:'c1', km:78200,  ultima_visita:'2025-04-01' },
    { id:'v2', placa:'C 112 BQR', marca:'Nissan',    modelo:'Frontier',  anio:2019, color:'Gris',   motor:'2.5L Diesel',    vin:'VNFUD22Y0KX765432', cliente_id:'c1', km:112500, ultima_visita:'2025-03-15' },
    { id:'v3', placa:'M 033 XYT', marca:'Honda',     modelo:'CR-V',      anio:2022, color:'Negro',  motor:'1.5T',           vin:'5J6RW2H54KA001234', cliente_id:'c2', km:32100,  ultima_visita:'2025-04-10' },
    { id:'v4', placa:'O 455 KLM', marca:'Chevrolet', modelo:'Silverado', anio:2018, color:'Rojo',   motor:'5.3L V8',        vin:'1GCVKREC0KZ765432', cliente_id:'c3', km:145600, ultima_visita:'2025-02-20' },
    { id:'v5', placa:'U 688 ZAB', marca:'Hyundai',   modelo:'Tucson',    anio:2021, color:'Plata',  motor:'2.0L',           vin:'KM8J3CAL0MU234567', cliente_id:'c4', km:45800,  ultima_visita:'2025-04-12' },
    { id:'v6', placa:'G 901 PQS', marca:'Ford',      modelo:'F-150',     anio:2023, color:'Azul',   motor:'3.5L EcoBoost',  vin:'1FTFW1E54PFB12345', cliente_id:'c5', km:18900,  ultima_visita:'2025-04-20' }
  ]);

  /* ── EMPLEADOS ───────────────────────────────────── */
  DB.set('empleados', [
    { id:'e1', nombre:'Diego Torres',    rol:'admin',          cargo:'Administrador / Dueño', email:'admin@torres.gt',    tel:'5540-0001', fecha_ingreso:'2020-01-01', salario:8500, igss:true, asistencias_mes:22, ots_mes:0,  avatar:'👑' },
    { id:'e2', nombre:'Sandra López',   rol:'recepcionista',  cargo:'Recepcionista',         email:'slopez@torres.gt',   tel:'5540-0002', fecha_ingreso:'2021-03-15', salario:3800, igss:true, asistencias_mes:21, ots_mes:0,  avatar:'📋' },
    { id:'e3', nombre:'Juan Revolorio', rol:'mecanico',       cargo:'Mecánico Senior',       email:'jrevolorio@torres.gt',tel:'5540-0003',fecha_ingreso:'2020-06-01', salario:4500, igss:true, asistencias_mes:22, ots_mes:8,  avatar:'🔧' },
    { id:'e4', nombre:'Pedro Sajquim',  rol:'mecanico',       cargo:'Mecánico',              email:'psajquim@torres.gt', tel:'5540-0004', fecha_ingreso:'2022-09-01', salario:3500, igss:true, asistencias_mes:20, ots_mes:5,  avatar:'🪛' },
    { id:'e5', nombre:'Marco Barrios',  rol:'jefe',           cargo:'Jefe de Taller',        email:'mbarrios@torres.gt', tel:'5540-0005', fecha_ingreso:'2021-01-10', salario:6000, igss:true, asistencias_mes:22, ots_mes:0,  avatar:'📊' }
  ]);

  /* ── ÓRDENES DE TRABAJO ──────────────────────────── */
  DB.set('ordenes', [
    { id:'ot1', num:'OT-2025-0141', vehiculo_id:'v1', cliente_id:'c1', estado:'en_trabajo',      prioridad:'alta',  mecanico_id:'e3', descripcion:'Cambio de aceite + revisión frenos + alineación',     servicios:['Cambio de aceite 5W-30','Revisión de frenos','Alineación y balanceo'], repuestos:[{rep:'r2',qty:5},{rep:'r4',qty:1}], total:1250, fecha_ingreso:'2025-04-28', fecha_estimada:'2025-04-29', notas:'Cliente indica ruido en frenos al frenar' },
    { id:'ot2', num:'OT-2025-0140', vehiculo_id:'v3', cliente_id:'c2', estado:'diagnostico',     prioridad:'media', mecanico_id:'e4', descripcion:'Revisión general y cambio faja de distribución',      servicios:['Diagnóstico computarizado','Cambio faja distribución'],              repuestos:[{rep:'r1',qty:1}],               total:2800, fecha_ingreso:'2025-04-28', fecha_estimada:'2025-04-30', notas:'' },
    { id:'ot3', num:'OT-2025-0139', vehiculo_id:'v4', cliente_id:'c3', estado:'espera_repuestos',prioridad:'alta',  mecanico_id:'e3', descripcion:'Reparación transmisión automática',                   servicios:['Desmontaje transmisión','Reparación interna','Montaje y prueba'],    repuestos:[{rep:'r3',qty:2}],               total:8500, fecha_ingreso:'2025-04-25', fecha_estimada:'2025-05-02', notas:'Esperando kit de sellos del proveedor' },
    { id:'ot4', num:'OT-2025-0138', vehiculo_id:'v5', cliente_id:'c4', estado:'listo',           prioridad:'baja',  mecanico_id:'e4', descripcion:'Servicio de 45,000 km',                               servicios:['Cambio aceite','Filtros aire y combustible','Revisión 30 puntos'],  repuestos:[{rep:'r2',qty:4},{rep:'r4',qty:1}],total:950,  fecha_ingreso:'2025-04-24', fecha_estimada:'2025-04-25', notas:'Listo para entrega' },
    { id:'ot5', num:'OT-2025-0137', vehiculo_id:'v6', cliente_id:'c5', estado:'recibido',        prioridad:'media', mecanico_id:null, descripcion:'Instalación de accesorios',                           servicios:['Instalación calcoblock','Instalación cámara reversa'],               repuestos:[],                               total:1800, fecha_ingreso:'2025-04-28', fecha_estimada:'2025-04-29', notas:'' },
    { id:'ot6', num:'OT-2025-0136', vehiculo_id:'v2', cliente_id:'c1', estado:'entregado',       prioridad:'baja',  mecanico_id:'e3', descripcion:'Limpieza inyectores + cambio bujías',                 servicios:['Limpieza inyectores ultrasonido','Cambio bujías NGK'],               repuestos:[{rep:'r5',qty:4}],               total:680,  fecha_ingreso:'2025-04-22', fecha_estimada:'2025-04-23', notas:'Entregado el 23/04' }
  ]);

  /* ── INVENTARIO ──────────────────────────────────── */
  DB.set('inventario', [
    { id:'r1', codigo:'REP-001', nombre:'Faja de Distribución Toyota',    marca:'Gates',   categoria:'Motor',       stock:3,  min_stock:2,  precio_costo:480,  precio_venta:720,  ubicacion:'Estante A-1', proveedor:'Importadora GT' },
    { id:'r2', codigo:'REP-002', nombre:'Aceite Motor 5W-30 1L',          marca:'Castrol', categoria:'Lubricantes', stock:48, min_stock:20, precio_costo:42,   precio_venta:65,   ubicacion:'Estante B-3', proveedor:'Lubricantes S.A.' },
    { id:'r3', codigo:'REP-003', nombre:'Kit Sellos Transmisión',         marca:'Sonnax',  categoria:'Transmisión', stock:1,  min_stock:3,  precio_costo:1200, precio_venta:1800, ubicacion:'Estante C-2', proveedor:'Auto Parts GT' },
    { id:'r4', codigo:'REP-004', nombre:'Filtro de Aceite Universal',     marca:'Mann',    categoria:'Filtros',     stock:15, min_stock:10, precio_costo:28,   precio_venta:45,   ubicacion:'Estante A-4', proveedor:'Filtros CR' },
    { id:'r5', codigo:'REP-005', nombre:'Bujías NGK Iridium',             marca:'NGK',     categoria:'Ignición',    stock:22, min_stock:8,  precio_costo:38,   precio_venta:65,   ubicacion:'Estante D-1', proveedor:'NGK Guatemala' },
    { id:'r6', codigo:'REP-006', nombre:'Pastillas de Freno Delantero',   marca:'Brembo',  categoria:'Frenos',      stock:4,  min_stock:6,  precio_costo:185,  precio_venta:295,  ubicacion:'Estante E-2', proveedor:'Frenos GT' },
    { id:'r7', codigo:'REP-007', nombre:'Amortiguador Delantero Toyota',  marca:'KYB',     categoria:'Suspensión',  stock:0,  min_stock:2,  precio_costo:420,  precio_venta:680,  ubicacion:'Estante F-1', proveedor:'Importadora GT' },
    { id:'r8', codigo:'REP-008', nombre:'Líquido de Frenos DOT4 500ml',   marca:'ATE',     categoria:'Líquidos',    stock:9,  min_stock:5,  precio_costo:55,   precio_venta:90,   ubicacion:'Estante B-1', proveedor:'Lubricantes S.A.' }
  ]);

  /* ── FACTURAS ────────────────────────────────────── */
  DB.set('facturas', [
    { id:'f1', num:'FEL-2025-000456', ot_id:'ot6', cliente_id:'c1', nit:'9876543-2', fecha:'2025-04-23', subtotal:566.10, iva:83.90,  total:650,  estado:'certificada', fel_uuid:'FEL-UUID-ABC123' },
    { id:'f2', num:'FEL-2025-000455', ot_id:'ot4', cliente_id:'c4', nit:'7788990-3', fecha:'2025-04-25', subtotal:839.29, iva:110.71, total:950,  estado:'certificada', fel_uuid:'FEL-UUID-DEF456' },
    { id:'f3', num:'FEL-2025-000454', ot_id:'ot2', cliente_id:'c2', nit:'1122334-5', fecha:'2025-04-28', subtotal:2477.88,iva:322.12, total:2800, estado:'pendiente',   fel_uuid:null },
    { id:'f4', num:'FEL-2025-000453', ot_id:'ot1', cliente_id:'c1', nit:'9876543-2', fecha:'2025-04-28', subtotal:1107.14,iva:142.86, total:1250, estado:'borrador',    fel_uuid:null }
  ]);

  /* ── CITAS ───────────────────────────────────────── */
  DB.set('citas', [
    { id:'ap1', fecha:'2025-04-28', hora:'09:00', vehiculo_id:'v1', cliente_id:'c1', servicio:'Cambio de aceite',    estado:'confirmada' },
    { id:'ap2', fecha:'2025-04-28', hora:'11:00', vehiculo_id:'v3', cliente_id:'c2', servicio:'Revisión general',    estado:'confirmada' },
    { id:'ap3', fecha:'2025-04-29', hora:'08:00', vehiculo_id:'v5', cliente_id:'c4', servicio:'Diagnóstico ABS',     estado:'pendiente'  },
    { id:'ap4', fecha:'2025-04-29', hora:'14:00', vehiculo_id:'v6', cliente_id:'c5', servicio:'Cambio bujías',       estado:'confirmada' },
    { id:'ap5', fecha:'2025-04-30', hora:'10:00', vehiculo_id:'v4', cliente_id:'c3', servicio:'Entrega transmisión', estado:'pendiente'  },
    { id:'ap6', fecha:'2025-05-02', hora:'09:00', vehiculo_id:'v2', cliente_id:'c1', servicio:'Alineación',          estado:'pendiente'  }
  ]);

  DB.set('seeded', true);
}
