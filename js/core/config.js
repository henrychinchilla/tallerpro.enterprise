/* ═══════════════════════════════════════════════════════
   NexusPro v3.0
   js/core/config.js — Constantes globales
   Tu negocio conectado · Ecosistema integral
═══════════════════════════════════════════════════════ */

const APP = {
  nombre:   'NexusPro',
  slogan:   'Tu negocio conectado',
  version:  '3.2.0',
  build:    '20260630',
  url:      'https://nexuspro.cmtelecommgt.com'
};

/* ── Versión en pantalla ────────────────────────────────────────────────────
   La versión que se muestra la dice el SERVICE WORKER (su CACHE_VERSION), no
   `APP.version` de acá arriba. Dos razones, y las dos importan:

     · CACHE_VERSION es lo único que se sube en CADA despliegue — es la regla
       del proyecto. `APP.version` se olvida y queda vieja (hoy dice 3.2.0 de
       junio), así que mostrarla sería mentir con cara de dato.
     · Es la versión del código que DE VERDAD se está ejecutando. Si el Service
       Worker viejo todavía manda, acá se ve la versión vieja — y eso es
       exactamente lo que hace falta saber: si el cambio ya llegó o no.

   Un SW anterior a este cambio no sabe contestar; en ese caso no se muestra
   nada, que es mejor que mostrar un número equivocado. Con una recarga ya
   queda el SW nuevo y aparece. */
let _versionSW = null;

async function cargarVersion() {
  try {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
    const reg = await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller || reg.active;
    if (!sw) return null;
    _versionSW = await new Promise(res => {
      const ch = new MessageChannel();
      ch.port1.onmessage = e => res((e.data && e.data.version) || null);
      /* Sin este plazo, un SW que no contesta deja la promesa colgada para
         siempre y con ella el `await` de quien la esperaba. */
      setTimeout(() => res(null), 2000);
      sw.postMessage('version', [ch.port2]);
    });
  } catch (_) { _versionSW = null; }
  pintarVersion();
  return _versionSW;
}

/* Rellena los huecos de versión que haya en pantalla. Se llama después de cada
   render porque el login y el menú se redibujan enteros y se llevan el texto. */
function pintarVersion() {
  if (!_versionSW || typeof document === 'undefined') return;
  for (const el of document.querySelectorAll('.app-version')) {
    el.textContent = _versionSW;
    el.title = 'Versión que se está ejecutando. Si no es la que acabás de desplegar, recargá la página.';
  }
}

if (typeof navigator !== 'undefined' && navigator.serviceWorker) cargarVersion();

/* Site key pública de Cloudflare Turnstile (anti-bots en "Crear nuevo negocio").
   Se crea en dash.cloudflare.com → Turnstile (el secret va en los secrets de
   Supabase como TURNSTILE_SECRET). Vacía = el captcha no se muestra. */
const TURNSTILE_SITE_KEY = '0x4AAAAAADiKf8P4Nfiu4WBV';

/* ── SUPABASE ─────────────────────────────────────── */
const SUPABASE_URL = 'https://oanguccrxleznozumpbi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hbmd1Y2NyeGxlem5venVtcGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODk4MzEsImV4cCI6MjA5Mjk2NTgzMX0.DcQS5AMHV3s4k-tvLlpb8ZWzkODPOSaiQjP1rLJVPAs';

/* ── INTEGRACIONES (flags por defecto) ────────────── */
/* Se sobreescriben con la fila de config_integraciones del tenant.
   Las claves reales (Meta, Anthropic) viven en Supabase secrets, no aquí. */
const FEATURES = {
  whatsapp: false,   // requiere Edge Function whatsapp-send + secrets de Meta
  ia:       false    // requiere Edge Function ai-assistant + ANTHROPIC_API_KEY
};

/* ── ROLES ────────────────────────────────────────── */
const ROLES = {
  superadmin:   { label:'Super Admin',        icon:'⚡', color:'red',    oculto:true  },
  admin:        { label:'Administrador',       icon:'👑', color:'amber',  oculto:false },
  gerente_fin:  { label:'Gerente Financiero',  icon:'💰', color:'green',  oculto:false },
  gerente_tal:  { label:'Gerente de Negocio',   icon:'🔧', color:'cyan',   oculto:false },
  recepcionista:{ label:'Recepcionista',        icon:'📋', color:'purple', oculto:false },
  vendedor:     { label:'Vendedor (POS)',       icon:'🛒', color:'amber',  oculto:false },
  mecanico:     { label:'Mecánico',            icon:'🪛', color:'gray',   oculto:false },
  contador:     { label:'Contador',            icon:'🧮', color:'green',  oculto:false },
  bodeguero:    { label:'Bodeguero',           icon:'📦', color:'cyan',   oculto:false },
  limpieza:     { label:'Limpieza',            icon:'🧹', color:'gray',   oculto:false },
  conserje:     { label:'Conserje',            icon:'🧰', color:'gray',   oculto:false },
  cliente:      { label:'Cliente',             icon:'🚗', color:'cyan',   oculto:false }
};

/* ── MÓDULOS DEL SISTEMA ──────────────────────────── */
const MODULOS = [
  { id:'dashboard',      icon:'📊', label:'Dashboard',         grupo:'principal' },
  { id:'pos',            icon:'🛒', label:'Punto de Venta',    grupo:'principal', href:'/pos.html' },
  { id:'descarga',       icon:'📲', label:'Descargar App',     grupo:'principal' },
  { id:'clientes',       icon:'👥', label:'Clientes',          grupo:'operacion'  },
  { id:'vehiculos',      icon:'🚗', label:'Vehículos',         grupo:'operacion'  },
  { id:'diagnostico_obd',icon:'🩺', label:'Diagnóstico OBD-II', grupo:'operacion'  },
  { id:'bitacora',       icon:'📖', label:'Bitácora de Soluciones', grupo:'operacion'  },
  { id:'ordenes',        icon:'📋', label:'Órdenes de Trabajo', grupo:'operacion',
    subnav:[
      { tab:'lista',  icon:'☰',  label:'Lista'          },
      { tab:'kanban', icon:'⬛', label:'Kanban'          },
      { tab:'kpi',    icon:'📊', label:'KPI Mecánicos'  }
    ] },
  { id:'cotizaciones',   icon:'📝', label:'Cotizaciones',      grupo:'operacion'  },
  { id:'inventario',     icon:'📦', label:'Inventario',        grupo:'operacion'  },
  { id:'bodegas',        icon:'🏭', label:'Bodegas',           grupo:'operacion'  },
  { id:'proveedores',    icon:'🏪', label:'Proveedores',       grupo:'operacion'  },
  { id:'activos',        icon:'🛠️', label:'Herramientas y Activos', grupo:'operacion',
    subnav:[
      { tab:'activos',      icon:'🛠️', label:'Inventario de Activos' },
      { tab:'depreciacion', icon:'📉', label:'Depreciación'          }
    ] },
  { id:'envios',         icon:'🚚', label:'Envíos / Fletes',   grupo:'operacion'  },
  { id:'herreria',       icon:'⚒️', label:'Herrería y Ventanería', grupo:'especializados' },
  { id:'peleteria',      icon:'👜', label:'Peletería',         grupo:'especializados' },
  { id:'electronica',    icon:'🔌', label:'Electrónica y Electrodomésticos', grupo:'especializados' },
  { id:'refrigeracion',  icon:'❄️', label:'Refrigeración y A/C', grupo:'especializados' },
  { id:'armeria',        icon:'🎯', label:'Armería',            grupo:'especializados' },
  { id:'agroservicio',   icon:'🌾', label:'Agroservicio',       grupo:'agropecuaria'   },
  { id:'venta_granos',   icon:'🌽', label:'Venta de Granos',    grupo:'agropecuaria'   },
  { id:'facturacion',    icon:'🧾', label:'Facturación FEL',   grupo:'finanzas'   },
  { id:'bancos',         icon:'🏦', label:'Bancos',            grupo:'finanzas'   },
  { id:'finanzas',       icon:'💰', label:'Finanzas',          grupo:'finanzas',
    subnav:[
      { tab:'dashboard',   icon:'📊', label:'Resumen'              },
      { tab:'viaticos',    icon:'🚗', label:'Viáticos'             },
      { tab:'recurrentes', icon:'🔁', label:'Recurrentes'          },
      { tab:'balance',     icon:'📋', label:'Estado de Resultados' }
    ] },
  { id:'presupuesto',    icon:'📊', label:'Presupuesto',       grupo:'finanzas'   },
  { id:'contabilidad',   icon:'🧮', label:'Contabilidad / SAT', grupo:'finanzas',
    subnav:[
      { tab:'formularios_sat', icon:'📋', label:'Formularios SAT' },
      { tab:'fel',          icon:'⬆️', label:'Importar FEL'     },
      { tab:'ventas',       icon:'📤', label:'Libro de Ventas'  },
      { tab:'compras',      icon:'📥', label:'Libro de Compras' },
      { tab:'retenciones',  icon:'🧾', label:'Retenciones'      },
      { tab:'obligaciones', icon:'📅', label:'Obligaciones'     }
    ] },
  { id:'rrhh',           icon:'👤', label:'RRHH & Nómina',     grupo:'rrhh',
    subnav:[
      { tab:'empleados',     icon:'👤', label:'Empleados'     },
      { tab:'nomina',        icon:'💵', label:'Nómina'        },
      { tab:'igss',          icon:'🏛️', label:'Planilla IGSS'  },
      { tab:'productividad', icon:'📈', label:'Productividad'  },
      { tab:'capacitacion',  icon:'🎓', label:'Capacitación'   },
      { tab:'asignaciones',  icon:'🔑', label:'Asignaciones'   },
      { tab:'organigrama',   icon:'🏢', label:'Organigrama'   },
      { tab:'documentos',    icon:'📄', label:'Documentos'    },
      { tab:'reclutamiento', icon:'🧑‍💼', label:'Reclutamiento' },
      { tab:'disciplina',    icon:'⚖️', label:'Disciplina'    },
      { tab:'vacaciones',    icon:'🏖️', label:'Vacaciones'    },
      { tab:'horasextra',    icon:'⏰', label:'Horas Extra'   }
    ] },
  { id:'marketing',      icon:'🎯', label:'Marketing',         grupo:'marketing'  },
  { id:'calendario',     icon:'📅', label:'Calendario',        grupo:'herramientas'},
  { id:'comunicaciones', icon:'🔔', label:'Comunicaciones',    grupo:'herramientas',
    subnav:[
      { tab:'whatsapp', icon:'💬', label:'WhatsApp'       },
      { tab:'email',    icon:'📧', label:'Email'          },
      { tab:'config',   icon:'⚙️', label:'Configuración'  }
    ] },
  { id:'configuracion',  icon:'⚙️', label:'Configuración',     grupo:'admin'      },
  { id:'usuarios',       icon:'👥', label:'Usuarios',          grupo:'admin'      },
  { id:'admin',          icon:'🗄️', label:'Administración',    grupo:'admin',
    subnav:[
      { tab:'overview',  icon:'📊', label:'Estado'           },
      { tab:'exportar',  icon:'⬇️', label:'Exportar'         },
      { tab:'auditoria', icon:'📜', label:'Auditoría',        roles:['admin','superadmin','gerente_fin','gerente_tal'] },
      { tab:'importar',  icon:'⬆️', label:'Importar',         roles:['admin','superadmin'] },
      { tab:'peligro',   icon:'⚠️', label:'Zona de Peligro',  roles:['admin','superadmin'] },
      { tab:'documentos',icon:'🗂️', label:'Documentos Legales', roles:['admin','superadmin','gerente_fin','gerente_tal'] }
    ] },
  { id:'respaldos',      icon:'💾', label:'Respaldos',         grupo:'admin'      },
  { id:'superadmin',     icon:'⚡', label:'Panel SaaS',        grupo:'saas',
    subnav:[
      { tab:'comercios', icon:'🏪', label:'Comercios' },
      { tab:'cobros',    icon:'💵', label:'Cobros'    },
      { tab:'planes',    icon:'🎚️', label:'Planes'    }
    ] },
  { id:'mi_ot',          icon:'🔍', label:'Mis Órdenes',       grupo:'cliente'    }
];

/* ── GRUPOS DEL SIDEBAR (orden y encabezados) ─────── */
/* El orden aquí define el orden del menú. label vacío = sin encabezado. */
const GRUPOS = [
  { id:'principal',      label:''                         },
  { id:'operacion',      label:'Operación'                },
  { id:'especializados', label:'Servicios Especializados' },
  { id:'agropecuaria',   label:'Agropecuaria'             },
  { id:'finanzas',     label:'Finanzas'       },
  { id:'rrhh',         label:'RRHH & Nómina'  },
  { id:'marketing',    label:'Marketing'      },
  { id:'herramientas', label:'Herramientas'   },
  { id:'admin',        label:'Administración' },
  { id:'saas',         label:'SaaS'           },
  { id:'cliente',      label:''               }
];

/* Color de acento por grupo del menú (chip del ícono en el sidebar).
   Usa las variables de la paleta activa, así se adapta sola a los 8 temas. */
const GRUPO_COLOR = {
  principal:      'var(--amber)',
  operacion:      'var(--cyan)',
  especializados: 'var(--purple)',
  agropecuaria:   'var(--green)',
  finanzas:       'var(--amber)',
  rrhh:           'var(--red)',
  marketing:      'var(--purple)',
  herramientas:   'var(--cyan)',
  admin:          'var(--gray)',
  saas:           'var(--green)',
  cliente:        'var(--cyan)',
};

/* ── PERMISOS POR ROL ─────────────────────────────── */
const PERMISOS = {
  superadmin:   { dashboard:true,  pos:true,  descarga:true,  clientes:true,  vehiculos:true,  diagnostico_obd:true,  bitacora:true, ordenes:true,  cotizaciones:true,  herreria:true,  peleteria:true,  electronica:true,  refrigeracion:true,  armeria:true,  agroservicio:true,  venta_granos:true,  inventario:true,  bodegas:true,  proveedores:true,  compras:true,  activos:true,  envios:true,  facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  contabilidad:true,  rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:true,  usuarios:true,  admin:true,  mi_ot:false, doc_empresa:true  },
  admin:        { dashboard:true,  pos:true,  descarga:true,  clientes:true,  vehiculos:true,  diagnostico_obd:true,  bitacora:true, ordenes:true,  cotizaciones:true,  herreria:true,  peleteria:true,  electronica:true,  refrigeracion:true,  armeria:true,  agroservicio:true,  venta_granos:true,  inventario:true,  bodegas:true,  proveedores:true,  compras:true,  activos:true,  envios:true,  facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  contabilidad:true,  rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:true,  usuarios:true,  admin:true,  mi_ot:false, doc_empresa:true  },
  gerente_tal:  { dashboard:true,  pos:true,  descarga:true,  clientes:true,  vehiculos:true,  diagnostico_obd:true,  bitacora:true, ordenes:true,  cotizaciones:true,  herreria:true,  peleteria:true,  electronica:true,  refrigeracion:true,  armeria:true,  agroservicio:true,  venta_granos:true,  inventario:true,  bodegas:true,  proveedores:true,  compras:true,  activos:true,  envios:true,  facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:true  },
  gerente_fin:  { dashboard:true,  pos:true,  descarga:true,  clientes:false, vehiculos:false, diagnostico_obd:false, bitacora:false, ordenes:false, cotizaciones:false, herreria:false, peleteria:false, electronica:false, refrigeracion:false, armeria:false, agroservicio:false, venta_granos:false, inventario:false, bodegas:false, proveedores:true,  compras:true,  activos:true,  envios:true,  facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  contabilidad:true,  rrhh:true,  marketing:false, calendario:false, comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:true  },
  recepcionista:{ dashboard:true,  pos:true,  descarga:true,  clientes:true,  vehiculos:true,  diagnostico_obd:false, bitacora:false,  ordenes:true,  cotizaciones:true,  herreria:true,  peleteria:true,  electronica:true,  refrigeracion:true,  armeria:true,  agroservicio:true,  venta_granos:true,  inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:true,  facturacion:true,  bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  vendedor:     { dashboard:true,  pos:true,  descarga:true,  clientes:true,  vehiculos:true,  diagnostico_obd:false, bitacora:false,  ordenes:false, cotizaciones:false, herreria:false, peleteria:false, electronica:false, refrigeracion:false, armeria:false, agroservicio:false, venta_granos:true,  inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:true,  facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:true,  calendario:false, comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  mecanico:     { dashboard:true,  pos:false, descarga:true,  clientes:false, vehiculos:true,  diagnostico_obd:true,  bitacora:true, ordenes:true,  cotizaciones:true,  herreria:true,  peleteria:true,  electronica:true,  refrigeracion:true,  armeria:false, agroservicio:false, venta_granos:false, inventario:true,  bodegas:true,  proveedores:false, compras:false, activos:false, envios:true,  facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  contador:     { dashboard:true,  pos:false, descarga:true,  clientes:false, vehiculos:false, diagnostico_obd:false, bitacora:false, ordenes:false, cotizaciones:false, herreria:false, peleteria:false, electronica:false, refrigeracion:false, armeria:false, agroservicio:false, venta_granos:true,  inventario:false, bodegas:false, proveedores:true,  compras:true,  activos:true,  envios:false, facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  contabilidad:true,  rrhh:false, marketing:false, calendario:true,  comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  bodeguero:    { dashboard:true,  pos:false, descarga:true,  clientes:false, vehiculos:false, diagnostico_obd:false, bitacora:false, ordenes:false, cotizaciones:false, herreria:false, peleteria:false, electronica:false, refrigeracion:false, armeria:false, agroservicio:false, venta_granos:true,  inventario:true,  bodegas:true,  proveedores:true,  compras:true,  activos:false, envios:true,  facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  limpieza:     { dashboard:true,  pos:false, descarga:true,  clientes:false, vehiculos:false, diagnostico_obd:false, bitacora:false, ordenes:false, cotizaciones:false, herreria:false, peleteria:false, electronica:false, refrigeracion:false, armeria:false, agroservicio:false, venta_granos:false, inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:false, facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  conserje:     { dashboard:true,  pos:false, descarga:true,  clientes:false, vehiculos:false, diagnostico_obd:false, bitacora:false, ordenes:false, cotizaciones:false, herreria:false, peleteria:false, electronica:false, refrigeracion:false, armeria:false, agroservicio:false, venta_granos:false, inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:false, facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  cliente:      { dashboard:false, pos:false, descarga:false, clientes:false, vehiculos:false, diagnostico_obd:false, bitacora:false, ordenes:false, cotizaciones:false, herreria:false, peleteria:false, electronica:false, refrigeracion:false, armeria:false, agroservicio:false, venta_granos:false, inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:false, facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:false, comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:true,  doc_empresa:false }
};

/* ── PLANES COMERCIALES (SaaS) ────────────────────────
   Cada plan define qué módulos incluye. El superadmin puede,
   por negocio, sobre-escribir la lista exacta (tenants.modulos_activos).
   Módulos SIEMPRE disponibles (no se cobran / son de la cuenta):
   dashboard, configuración, usuarios, admin, mi_ot, calendario.        */
const MODULOS_SIEMPRE = ['dashboard','descarga','configuracion','usuarios','admin','respaldos','mi_ot','calendario'];

const PLANES = {
  basico: {
    label: 'Básico / Emprendedor', precio: 199, color: 'cyan',
    desc: 'Operación del negocio: clientes, vehículos, OT, inventario y POS.',
    modulos: ['clientes','vehiculos','ordenes','inventario','pos']
  },
  pro: {
    label: 'Pro', precio: 499, color: 'amber',
    desc: 'Todo lo básico + facturación FEL, finanzas, bancos, compras y fidelización.',
    modulos: ['clientes','vehiculos','ordenes','inventario','pos',
              'proveedores','compras','bodegas','activos','envios',
              'facturacion','bancos','finanzas','presupuesto','contabilidad','marketing','comunicaciones']
  },
  empresarial: {
    label: 'Empresarial', precio: 999, color: 'green',
    desc: 'Todo lo Pro + RRHH/Nómina y Nexus, tu asistente IA experto. Solución completa.',
    modulos: ['clientes','vehiculos','ordenes','inventario','pos',
              'proveedores','compras','bodegas','activos','envios',
              'facturacion','bancos','finanzas','presupuesto','contabilidad','marketing','comunicaciones','rrhh','ia',
              'diagnostico_obd','bitacora']
  },
  medida: {
    label: 'A la Medida', precio: 199, color: 'purple', negociable: true,
    desc: 'Para negociar: arranca con la base del Emprendedor y suma solo los módulos que el negocio necesita, cada uno con su precio.',
    modulos: ['clientes','vehiculos','ordenes','inventario','pos']
  }
};

/* Precio mensual de cada módulo adicional para el plan A la Medida.
   La base (clientes, vehículos, OT, inventario, POS) va incluida en el
   precio del plan; estos se SUMAN al marcar el módulo en el panel SA. */
const MODULOS_PRECIOS = {
  proveedores: 49,  compras: 49,   bodegas: 59,   activos: 49,
  envios: 59,       facturacion: 99, bancos: 59,  finanzas: 99,
  presupuesto: 49,  contabilidad: 99, marketing: 59, comunicaciones: 49,
  rrhh: 149,        ia: 99,
  /* Módulos verticales especializados (negocios no automotrices) */
  cotizaciones: 49, herreria: 89,  peleteria: 69, electronica: 79, refrigeracion: 89,
  agroservicio: 89, venta_granos: 79, diagnostico_obd: 99, bitacora: 49,
  /* Más cara que el resto de especializados: exige campos de cumplimiento
     DIGECAM (número de serie, licencia del comprador) que los demás no. */
  armeria: 129
};

/* Lista de módulos que se pueden vender/activar a la carta (para el panel SA).
   'ia' (Nexus) viene incluido en Empresarial y es add-on para Básico/Pro.
   Los módulos VERTICALES (herrería, peletería, electrónica, refrigeración,
   armería, agroservicio, venta de granos) se activan a demanda según el tipo
   de negocio del negocio y no vienen incluidos en ningún plan por defecto —
   el superadmin los prende por negocio en el Panel SaaS (⚙️ → Módulos activos). */
const MODULOS_VENDIBLES = [
  'clientes','vehiculos','ordenes','inventario','pos','proveedores','compras',
  'bodegas','activos','envios','facturacion','bancos','finanzas','presupuesto',
  'contabilidad','marketing','comunicaciones','rrhh','ia',
  'cotizaciones','herreria','peleteria','electronica','refrigeracion','armeria',
  'agroservicio','venta_granos','diagnostico_obd','bitacora'
];

/* Etiqueta legible de un módulo (los que no tienen página propia en MODULOS) */
function labelModulo(id) {
  return (typeof MODULOS !== 'undefined' && MODULOS.find(x => x.id === id)?.label)
    || ({ ia: '🤖 Nexus (Asistente IA)' })[id] || id;
}

/* Módulos activos del negocio en sesión (override del tenant o, si no, su plan). */
function modulosActivosTenant() {
  const t = window.Auth?.tenant;
  if (!t) return null;                       // sin tenant cargado → no bloquear
  if (Array.isArray(t.modulos_activos) && t.modulos_activos.length) return t.modulos_activos;
  const plan = PLANES[t.plan];
  if (!plan) return null;                     // plan legacy/desconocido → sin gating (todo permitido)
  return plan.modulos;
}

/* ¿El módulo está incluido en el plan/paquete del negocio? */
function moduloEnPlan(modId) {
  if (MODULOS_SIEMPRE.includes(modId)) return true;
  const act = modulosActivosTenant();
  if (!act) return true;
  return act.includes(modId);
}

/* ── FIDELIZACIÓN (políticas configurables por negocio) ──
   Se guardan en tenants.fidelizacion (jsonb); estos son los defaults.
   puntos_por_q: puntos ganados por cada Q1 de compra (0 = no acumula)
   puntos_por_q1_canje: puntos que equivalen a Q1 al canjear
   bono_afiliacion / bono_feedback: puntos de regalo (0 = desactivado)
   feedback_max_mes: máx. de bonos de encuesta por cliente al mes      */
const FIDELIZACION_DEFAULTS = {
  puntos_por_q: 1, puntos_por_q1_canje: 10,
  bono_afiliacion: 50, bono_feedback: 50, feedback_max_mes: 2
};
function fidelizacionCfg() {
  return { ...FIDELIZACION_DEFAULTS, ...(window.Auth?.tenant?.fidelizacion || {}) };
}

/* ¿La suscripción del negocio está vigente? (vencida = solo lectura/bloqueo suave) */
function suscripcionVigente() {
  const t = window.Auth?.tenant;
  if (!t) return true;
  if (t.active === false) return false;
  if (!t.suscripcion_vence) return true;
  return t.suscripcion_vence >= new Date().toISOString().slice(0,10);
}

/* ── FUNCIONES DE PERMISOS ────────────────────────── */
function getPermisos() {
  if (!window.Auth?.user) return {};
  const rol    = window.Auth.user.rol || 'recepcionista';
  const base   = { ...(PERMISOS[rol] || PERMISOS.recepcionista) };
  const custom = window.Auth.user.permisos_custom || {};
  return { ...base, ...custom };
}

/* ── NIVELES DE ACCESO POR MÓDULO ─────────────────────
   Cada módulo puede otorgarse en 4 niveles (permisos_custom por usuario):
     false    → sin acceso
     'ver'    → solo lectura (no puede crear/editar/eliminar)
     'editar' → puede ver + crear/editar (no eliminar)
     true     → acceso total (incluye eliminar) — formato legacy compatible
   El rol base (PERMISOS) sigue siendo booleano: true = acceso total.      */
const NIVELES_PERMISO = { no:0, ver:1, editar:2, total:3 };
const NIVELES_PERMISO_LABEL = {
  no:     '🚫 Sin acceso',
  ver:    '👁 Solo ver',
  editar: '✏️ Ver y editar',
  total:  '✅ Total (con eliminar)'
};

/* Normaliza cualquier valor guardado (bool legacy, string u objeto) a un nivel */
function nivelPermiso(v) {
  if (v === true  || v === 'total')  return 'total';
  if (v === 'editar')                return 'editar';
  if (v === 'ver')                   return 'ver';
  if (v && typeof v === 'object')    return v.eliminar ? 'total' : v.editar ? 'editar' : v.ver ? 'ver' : 'no';
  return 'no';
}

/* Nivel efectivo del usuario en sesión para un módulo */
function nivelAcceso(modulo) {
  if (!window.Auth?.user) return 'no';
  const rol = window.Auth.user.rol;
  if (rol === 'superadmin') return 'total';       // el dueño del SaaS ve todo
  if (!moduloEnPlan(modulo)) return 'no';         // gating por plan (aplica también al admin del negocio)
  if (rol === 'admin') return 'total';            // el admin del comercio no se auto-restringe
  const custom = window.Auth.user.permisos_custom || {};
  if (custom[modulo] !== undefined) return nivelPermiso(custom[modulo]);
  const base = PERMISOS[rol] || PERMISOS.recepcionista;
  return nivelPermiso(base[modulo]);
}

/* ¿El usuario en sesión puede ver este giro dentro de Inventario? Un giro
   sin módulo propio (ej. 'general', 'ferretería') no tiene nada que
   comprobar — se ve siempre. Si tiene módulo(s), basta con poder VER
   alguno de ellos: mismo criterio (custom, superadmin/admin, plan) que ya
   decide el menú lateral — no se duplica la lógica de permisos, solo se
   reusa puedeAccion(). Sin esto, un rol con `inventario:true` veía TODOS
   los giros del comercio sin importar a qué módulos tenía acceso — un
   mecánico podía ver el inventario serializado de Armería. */
function giroVisible(giro) {
  const g = (typeof GIROS !== 'undefined') && GIROS[giro];
  if (!g || !g.modulos.length) return true;
  return g.modulos.some(m => puedeAccion(m, 'ver'));
}

/* ¿El rol en sesión está en esta lista? EL SUPERADMIN SIEMPRE ESTÁ.

   Es el dueño del SaaS y el soporte de todos los negocios: entra a cualquier
   comercio en modo soporte y tiene que poder hacer lo mismo que su dueño. Cada
   lista de roles escrita a mano es una oportunidad de dejarlo afuera por
   olvido — ya había pasado con el aviso de contabilidad. Con esta función la
   regla vive en UN lugar y una lista nueva no puede romperla.

   `nivelAcceso()` ya hace lo propio para los permisos por módulo; esto cubre
   las listas sueltas (menús, pestañas, herramientas). */
function rolEnLista(lista, rol = window.Auth?.user?.rol) {
  if (rol === 'superadmin') return true;
  return Array.isArray(lista) && lista.includes(rol);
}

/* ¿Puede realizar la acción ('ver' | 'editar' | 'eliminar') en el módulo? */
function puedeAccion(modulo, accion) {
  const min = { ver:1, editar:2, eliminar:3 }[accion] || 3;
  return (NIVELES_PERMISO[nivelAcceso(modulo)] || 0) >= min;
}

function tieneAcceso(modulo) {
  return puedeAccion(modulo, 'ver');
}

/* ¿Puede ver el PRECIO DE COMPRA (costo)? — secreto del negocio.
   Solo dueño/administración y gerencia financiera. */
function puedeVerCosto() {
  const rol = window.Auth?.user?.rol;
  return rol === 'superadmin' || rol === 'admin' || rol === 'gerente_fin';
}

/* ¿Puede ver/gestionar los DOCUMENTOS LEGALES DE LA EMPRESA?
   Solo Dueño/Administración/Gerencia, y además requiere el acceso
   habilitado (PERMISOS.doc_empresa, ajustable por usuario en permisos_custom). */
function puedeVerDocsEmpresa() {
  const rol = window.Auth?.user?.rol;
  if (rol === 'superadmin') return true;
  if (!['admin','gerente_tal','gerente_fin'].includes(rol)) return false;
  return getPermisos().doc_empresa === true;
}

/* ── ESTADOS OT ───────────────────────────────────── */
const ESTADOS_OT = {
  recibido:    { label:'Recibido',     color:'gray',   pct:10  },
  diagnostico: { label:'Diagnóstico',  color:'cyan',   pct:30  },
  en_proceso:  { label:'En Proceso',   color:'amber',  pct:60  },
  listo:       { label:'Listo',        color:'green',  pct:90  },
  entregado:   { label:'Entregado',    color:'green',  pct:100 },
  cancelado:   { label:'Cancelado',    color:'red',    pct:0   },
  garantia:    { label:'Garantía',     color:'purple', pct:50  }
};

/* ── GUATEMALA 2026 ───────────────────────────────── */
const GT = {
  salario_minimo_no_agricola:  4002.28,
  salario_minimo_agricola:     3791.20,
  salario_minimo_maquila:      3409.73,
  bonificacion_incentivo:       250.00,
  igss_laboral:               0.0483,
  igss_patronal:              0.1267,
  intecap:                    0.01,
  irtra:                      0.01,
  isr_tramo1_tasa:            0.05,
  isr_tramo1_limite:          300000,
  isr_tramo2_fijo:            15000,
  isr_tramo2_tasa:            0.07,
  deduccion_personal:         48000,
  iva_general:                0.12,
  iva_repc:                   0.05
};

/* ── PRODUCTIVIDAD / COSTEO (hora-hombre, KPIs, bono) ──
   Valores por defecto; se sobreescriben con config_productividad del tenant.
   Todos los cálculos son MENSUALES. */
const PRODUCTIVIDAD_DEFAULTS = {
  horas_mes: 240,                 // jornada base mensual (8h x 30)
  cargas: {                       // cargas patronales sobre el salario base
    igss_patronal: GT.igss_patronal,   // 12.67%
    irtra:         GT.irtra,           // 1%
    intecap:       GT.intecap          // 1%
  },
  provisiones: {                  // provisiones mensuales (fracción de 1 salario/año)
    aguinaldo:     true,          // salario/12
    bono14:        true,          // salario/12
    vacaciones:    true,          // salario*0.5/12 (15 días/año)
    indemnizacion: true           // (salario + bonificación)/12 — Art. 82 Código de Trabajo GT
  },
  incluir_bonificacion_en_indemnizacion: true,
  bono_base:   'salario',         // base del bono mensual
  bono_max_pct: 30,               // % máximo del salario como bono al 100% de score
  kpis: [
    { id:'ots_entregadas', label:'OTs entregadas',          peso:30, tipo:'auto',   meta:10    },
    { id:'ingresos',       label:'Ingresos generados (Q)',  peso:25, tipo:'auto',   meta:20000 },
    { id:'cumplimiento',   label:'Cumplimiento de tiempo',  peso:20, tipo:'auto'               },
    { id:'calidad',        label:'Calidad (sin garantías)', peso:15, tipo:'auto'               },
    { id:'actitud',        label:'Actitud y disciplina',    peso:10, tipo:'manual'             }
  ]
};

/* ── KPIs POR ROL ─────────────────────────────────────
   Un gerente no ejecuta OTs: cada rol mide lo suyo.
   tipo 'auto'  → lo calcula el sistema; scope 'negocio' usa los datos
                  de TODO el negocio (gestión/ventas) en vez de las OTs propias.
   tipo 'manual'→ lo evalúa RRHH con un control 0-100.
   RRHH puede ajustar pesos/metas y AGREGAR KPIs personalizados por rol
   (se guardan en config_productividad.settings.kpis_rol del tenant). */
const KPIS_POR_ROL = {
  mecanico: [
    { id:'ots_entregadas', label:'OTs entregadas',           peso:30, tipo:'auto',  meta:10    },
    { id:'ingresos',       label:'Ingresos generados (Q)',   peso:25, tipo:'auto',  meta:20000 },
    { id:'cumplimiento',   label:'Cumplimiento de tiempo',   peso:20, tipo:'auto'              },
    { id:'calidad',        label:'Calidad (sin garantías)',  peso:15, tipo:'auto'              },
    { id:'actitud',        label:'Actitud y disciplina',     peso:10, tipo:'manual'            }
  ],
  vendedor: [
    { id:'ingresos_taller', label:'Ingresos del negocio (Q)', peso:30, tipo:'auto',  meta:50000, scope:'negocio' },
    { id:'atencion',        label:'Atención al cliente',     peso:30, tipo:'manual' },
    { id:'orden_caja',      label:'Orden de caja y cobros',  peso:20, tipo:'manual' },
    { id:'actitud',         label:'Actitud y disciplina',    peso:20, tipo:'manual' }
  ],
  recepcionista: [
    { id:'ots_taller',  label:'OTs entregadas del negocio',   peso:25, tipo:'auto',  meta:30, scope:'negocio' },
    { id:'atencion',    label:'Atención al cliente',         peso:35, tipo:'manual' },
    { id:'seguimiento', label:'Seguimiento de citas y OTs',  peso:20, tipo:'manual' },
    { id:'actitud',     label:'Actitud y disciplina',        peso:20, tipo:'manual' }
  ],
  gerente: [
    { id:'ots_taller',          label:'OTs entregadas del negocio',      peso:25, tipo:'auto', meta:30,    scope:'negocio' },
    { id:'ingresos_taller',     label:'Ingresos del negocio (Q)',        peso:25, tipo:'auto', meta:80000, scope:'negocio' },
    { id:'cumplimiento_taller', label:'Cumplimiento de tiempos (negocio)',peso:20, tipo:'auto',            scope:'negocio' },
    { id:'liderazgo',           label:'Liderazgo y gestión del equipo', peso:15, tipo:'manual' },
    { id:'objetivos',           label:'Objetivos del mes',              peso:15, tipo:'manual' }
  ],
  apoyo: [
    { id:'tareas',       label:'Cumplimiento de tareas asignadas', peso:35, tipo:'manual' },
    { id:'orden',        label:'Orden y limpieza del área',        peso:25, tipo:'manual' },
    { id:'puntualidad',  label:'Puntualidad y asistencia',         peso:20, tipo:'manual' },
    { id:'actitud',      label:'Actitud y disciplina',             peso:20, tipo:'manual' }
  ]
};
const KPIS_ROL_LABELS = { mecanico:'🪛 Mecánico / Auxiliar', vendedor:'🛒 Vendedor (POS)', recepcionista:'📋 Recepcionista', gerente:'👑 Gerencia / Administración', apoyo:'🧹 Apoyo (bodega, limpieza, conserjería)' };

/* Grupo de plantilla KPI que corresponde al rol de un empleado */
function plantillaKpiRol(rol) {
  if (['admin','gerente_tal','gerente_fin','gerente','superadmin','contador'].includes(rol)) return 'gerente';
  if (['bodeguero','limpieza','conserje'].includes(rol)) return 'apoyo';
  if (KPIS_POR_ROL[rol]) return rol;
  return 'mecanico';
}

/* Costo mensual cargado y hora-hombre de un empleado según la config */
function calcularHoraHombre(salarioBase, cfg = PRODUCTIVIDAD_DEFAULTS) {
  const s = Number(salarioBase) || 0;
  const bonif = GT.bonificacion_incentivo;
  const c = cfg.cargas || PRODUCTIVIDAD_DEFAULTS.cargas;
  const p = cfg.provisiones || PRODUCTIVIDAD_DEFAULTS.provisiones;
  const cargas = s * ((c.igss_patronal||0) + (c.irtra||0) + (c.intecap||0));
  const aguinaldo = p.aguinaldo  ? s/12 : 0;
  const bono14    = p.bono14     ? s/12 : 0;
  const vacaciones= p.vacaciones ? s*0.5/12 : 0;
  const baseIndem = s + (cfg.incluir_bonificacion_en_indemnizacion ? bonif : 0);
  const indemniz  = p.indemnizacion ? baseIndem/12 : 0;
  const costoMensual = s + bonif + cargas + aguinaldo + bono14 + vacaciones + indemniz;
  const horas = Number(cfg.horas_mes) || 240;
  return {
    salario: s, bonificacion: bonif, cargas,
    aguinaldo, bono14, vacaciones, indemnizacion: indemniz,
    costoMensual,
    factorCarga: s>0 ? (costoMensual - s)/s : 0,
    horasMes: horas,
    horaHombre: horas>0 ? costoMensual/horas : 0
  };
}

/* ── DÍAS FERIADOS DE GUATEMALA (Código de Trabajo) ─── */
function _pascuaDomingo(anio) {
  // Algoritmo de Gauss/Anonymous Gregorian para calcular Domingo de Pascua
  const a = anio % 19, b = Math.floor(anio/100), c = anio % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c/4), k = c % 4, l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l)/451);
  const mes = Math.floor((h + l - 7*m + 114)/31);
  const dia = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(anio, mes-1, dia);
}
function _fechaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function FERIADOS_GT(anio) {
  const pascua = _pascuaDomingo(anio);
  const restarDias = (n) => { const f = new Date(pascua); f.setDate(f.getDate()-n); return f; };
  return [
    { fecha: `${anio}-01-01`, nombre: 'Año Nuevo', completo: true },
    { fecha: _fechaISO(restarDias(3)), nombre: 'Jueves Santo', completo: true },
    { fecha: _fechaISO(restarDias(2)), nombre: 'Viernes Santo', completo: true },
    { fecha: _fechaISO(restarDias(1)), nombre: 'Sábado Santo', completo: true },
    { fecha: `${anio}-05-01`, nombre: 'Día del Trabajo', completo: true },
    { fecha: `${anio}-06-30`, nombre: 'Día del Ejército', completo: true },
    { fecha: `${anio}-08-15`, nombre: 'Día de la Asunción (Guatemala)', completo: true, local: true },
    { fecha: `${anio}-09-15`, nombre: 'Día de la Independencia', completo: true },
    { fecha: `${anio}-10-20`, nombre: 'Día de la Revolución', completo: true },
    { fecha: `${anio}-11-01`, nombre: 'Día de Todos los Santos', completo: true },
    { fecha: `${anio}-12-24`, nombre: 'Nochebuena (medio día)', completo: false },
    { fecha: `${anio}-12-25`, nombre: 'Navidad', completo: true },
    { fecha: `${anio}-12-31`, nombre: 'Fin de Año (medio día)', completo: false },
  ];
}

/* ── PERFILES PREDEFINIDOS PARA RECLUTAMIENTO ──────── */
const PERFILES_RECLUTAMIENTO = [
  { puesto:'Asistente Administrativo', departamento:'Administración', salario_min:4300, salario_max:5500,
    descripcion:'Apoyo administrativo general: atención telefónica, agendamiento de citas, archivo, control de correspondencia y apoyo a gerencia y recepción.',
    requisitos:'Diversificado graduado. Manejo de paquetes office (Word, Excel). Buena presentación y atención al cliente. Organización y discreción con información confidencial.' },

  { puesto:'Vendedor', departamento:'Ventas', salario_min:4300, salario_max:6000,
    descripcion:'Atención y asesoría a clientes sobre servicios y repuestos, generación de cotizaciones, seguimiento de oportunidades y cumplimiento de metas de venta mensuales.',
    requisitos:'Diversificado graduado. Experiencia en ventas o atención al cliente (deseable en repuestos/automotriz). Habilidad de negociación, orientación a resultados y buena comunicación.' },

  { puesto:'Gerente', departamento:'Gerencia', salario_min:8000, salario_max:15000,
    descripcion:'Coordinación de las áreas operativas y administrativas del negocio, supervisión de equipos de trabajo, control de indicadores (KPIs) y reporte a la Gerencia General.',
    requisitos:'Licenciatura en Administración de Empresas o carrera afín (deseable). 3+ años de experiencia en puestos de coordinación o gerencia media. Liderazgo, análisis de datos y manejo de personal.' },

  { puesto:'Jefe de Negocio', departamento:'Negocio', salario_min:6000, salario_max:10000,
    descripcion:'Supervisión diaria del negocio: distribución de órdenes de trabajo entre mecánicos, control de calidad de reparaciones, cumplimiento de tiempos de entrega y seguridad del personal.',
    requisitos:'Técnico en mecánica automotriz o carrera afín. 3+ años de experiencia como mecánico con al menos 1 año en supervisión de personal. Liderazgo, organización y conocimiento de diagnóstico mecánico/eléctrico.' },

  { puesto:'Gerente de RRHH', departamento:'RRHH', salario_min:7000, salario_max:12000,
    descripcion:'Gestión integral de recursos humanos: reclutamiento y selección, control de nómina y prestaciones, capacitación, disciplina laboral y cumplimiento del Código de Trabajo de Guatemala.',
    requisitos:'Licenciatura en Psicología Industrial, Administración de RRHH o carrera afín. 2+ años de experiencia en gestión de personal. Conocimiento de legislación laboral guatemalteca (IGSS, Código de Trabajo) y manejo de nómina.' },

  { puesto:'Gerente de Negocio', departamento:'Negocio', salario_min:7000, salario_max:12000,
    descripcion:'Responsable de la operación integral del negocio: productividad de mecánicos, control de inventario de repuestos, satisfacción del cliente y rentabilidad del área operativa.',
    requisitos:'Técnico o Licenciatura en Mecánica Automotriz, Ingeniería o Administración. 3+ años de experiencia en gestión de negocios automotrices. Habilidades de liderazgo, control de costos y atención al cliente.' },

  { puesto:'Administrador / Gerente General', departamento:'Gerencia General', salario_min:10000, salario_max:20000,
    descripcion:'Dirección general del negocio: planificación estratégica, supervisión de todas las áreas (operación, finanzas, RRHH, ventas), toma de decisiones y representación legal ante terceros.',
    requisitos:'Licenciatura en Administración de Empresas, Ingeniería Industrial o carrera afín (MBA deseable). 5+ años de experiencia en dirección o gerencia general. Visión estratégica, liderazgo y manejo financiero.' },

  { puesto:'Mecánico Junior', departamento:'Negocio', salario_min:4300, salario_max:5500,
    descripcion:'Apoyo en reparaciones y mantenimientos básicos (cambio de aceite, frenos, llantas, revisiones de rutina) bajo la supervisión de mecánicos senior.',
    requisitos:'Perito en Mecánica Automotriz o formación técnica equivalente (INTECAP). 0-2 años de experiencia. Disposición para aprender, orden y responsabilidad con las herramientas.' },

  { puesto:'Mecánico Senior', departamento:'Negocio', salario_min:5000, salario_max:8000,
    descripcion:'Diagnóstico y reparación de fallas mecánicas, eléctricas y de inyección electrónica en vehículos. Soporte técnico a mecánicos junior y control de calidad de los trabajos entregados.',
    requisitos:'Perito en Mecánica Automotriz o técnico equivalente. 5+ años de experiencia comprobable. Manejo de escáner automotriz y diagnóstico computarizado. Responsabilidad y autonomía en el trabajo.' },

  { puesto:'Auxiliar de Mecánica', departamento:'Negocio', salario_min:4300, salario_max:5000,
    descripcion:'Apoyo general en el negocio: limpieza de vehículos y áreas de trabajo, traslado de herramientas y repuestos, y asistencia directa a los mecánicos durante las reparaciones.',
    requisitos:'Educación básica completa (deseable diversificado). No se requiere experiencia previa. Buena actitud, puntualidad y disposición para el trabajo físico.' },

  { puesto:'Bodeguero', departamento:'Bodega', salario_min:4300, salario_max:5200,
    descripcion:'Control de entradas y salidas de repuestos e insumos, organización física de la bodega, conteos de inventario periódicos y coordinación con compras y mecánicos.',
    requisitos:'Diversificado graduado. Experiencia previa en manejo de inventarios (deseable). Orden, honestidad y manejo básico de sistemas/Excel.' },

  { puesto:'Gerente Financiero', departamento:'Finanzas', salario_min:8000, salario_max:14000,
    descripcion:'Administración de las finanzas del negocio: flujo de caja, presupuestos, relación con bancos, análisis de rentabilidad y reportes financieros para la Gerencia General.',
    requisitos:'Licenciatura en Administración de Empresas, Contaduría Pública y Auditoría o Economía. 3+ años de experiencia en finanzas. Manejo de presupuestos, análisis financiero y herramientas de Excel/ERP.' },

  { puesto:'Contador', departamento:'Contabilidad', salario_min:5000, salario_max:9000,
    descripcion:'Registro y control contable de las operaciones del negocio, elaboración de declaraciones ante la SAT (IVA, ISR), conciliaciones bancarias y apoyo en el cierre mensual.',
    requisitos:'Perito Contador o estudiante avanzado/graduado de Contaduría Pública y Auditoría. Conocimiento de obligaciones fiscales guatemaltecas (SAT) y manejo de sistemas contables.' }
];

/* ── DEPRECIACIÓN DE ACTIVOS (línea recta) ─────────── */
function _mesIdx(fechaStr) {
  if (!fechaStr) return null;
  const [y, m] = String(fechaStr).slice(0,10).split('-').map(Number);
  return y*12 + (m-1);
}

/* Depreciación mensual de un activo (línea recta) */
function depMensual(a) {
  const base = Math.max(0, (Number(a.costo)||0) - (Number(a.valor_residual)||0));
  const meses = Number(a.vida_util_meses)||0;
  if (meses<=0 || a.metodo==='no_deprecia') return 0;
  return base/meses;
}

/* Gasto por depreciación de un activo dentro de un rango [ini,fin] (inclusive) */
function depEnRango(a, ini, fin) {
  if (!a.fecha_adquisicion) return 0;
  const dm = depMensual(a);
  if (dm<=0) return 0;
  const adq = _mesIdx(a.fecha_adquisicion);
  let endIdx = adq + (Number(a.vida_util_meses)||0) - 1;
  if ((a.estado==='baja'||a.estado==='vendido') && a.fecha_baja)
    endIdx = Math.min(endIdx, _mesIdx(a.fecha_baja));
  const from = Math.max(adq, _mesIdx(ini));
  const to   = Math.min(endIdx, _mesIdx(fin));
  return Math.max(0, to - from + 1) * dm;
}

/* Depreciación acumulada y valor en libros a una fecha */
function valorEnLibros(a, hasta) {
  const costo = Number(a.costo)||0;
  const dm = depMensual(a);
  if (dm<=0 || !a.fecha_adquisicion) return { acumulada:0, libros:costo };
  const adq = _mesIdx(a.fecha_adquisicion);
  let endIdx = adq + (Number(a.vida_util_meses)||0) - 1;
  if ((a.estado==='baja'||a.estado==='vendido') && a.fecha_baja)
    endIdx = Math.min(endIdx, _mesIdx(a.fecha_baja));
  const hastaIdx = _mesIdx(hasta || new Date().toISOString().slice(0,10));
  const meses = Math.max(0, Math.min(endIdx, hastaIdx) - adq + 1);
  const acumulada = Math.min(meses*dm, costo - (Number(a.valor_residual)||0));
  return { acumulada, libros: Math.max(Number(a.valor_residual)||0, costo - acumulada) };
}

/* Vida útil sugerida (meses) por categoría — tasas máx. ISR Guatemala */
const VIDA_UTIL_CATEGORIA = {
  'Herramienta':              48,   // 25% anual
  'Maquinaria':               60,   // 20%
  'Equipo':                   60,   // 20%
  'Mobiliario y Equipo':      60,   // 20%
  'Equipo de Cómputo':        36,   // 33.33%
  'Vehículo':                 60,   // 20%
  'Edificación':             240,   // 5%
  'Otro':                     60
};

/* Calcular ISR mensual según Decreto 13-2026 */
function calcularISR(salarioMensual) {
  if (salarioMensual <= GT.salario_minimo_no_agricola) return 0;
  const anual = salarioMensual * 12;
  const imponible = Math.max(anual - GT.deduccion_personal, 0);
  if (imponible <= 0) return 0;
  const isrAnual = imponible <= GT.isr_tramo1_limite
    ? imponible * GT.isr_tramo1_tasa
    : GT.isr_tramo2_fijo + (imponible - GT.isr_tramo1_limite) * GT.isr_tramo2_tasa;
  return isrAnual / 12;
}

/* ═══════════════════════════════════════════════════════
   REGÍMENES TRIBUTARIOS DE GUATEMALA (SAT)

   El alta de un comercio sólo ofrecía dos —General y Pequeño Contribuyente—
   y faltaban los que creó el Decreto 7-2019, incluido el AGROPECUARIO, que es
   justo el de una venta de granos.

   Las tasas son las vigentes; aun así la pantalla dice que se confirmen con
   el contador, porque el régimen se elige por actividad y por techo de
   facturación, no sólo por la tasa.

   OJO al agregar uno nuevo: la app decidía "¿es simplificado?" preguntando si
   el código empieza con "peque". Con 'agropecuario' eso daba FALSO y le
   facturaba 12% a quien paga 5%. Por eso ahora la tasa sale de esta tabla y
   no del nombre del código.
═══════════════════════════════════════════════════════ */
const REGIMENES_SAT = {
  general: {
    label: 'Régimen General (IVA 12%)',
    tasa_iva: 0.12, simplificado: false,
    detalle: 'IVA 12% con derecho a crédito fiscal. El ISR se declara aparte: sobre utilidades (25%) u opcional simplificado (5% / 7%).',
  },
  /* techo_anual del pequeño contribuyente: lo subió el Decreto 31-2024 a 125
     salarios mínimos (Q465,381.25 para 2025). Antes decía Q150,000, el límite
     viejo, y contradecía el aviso de Contabilidad → SAT, que ya citaba la
     cifra nueva. Se recalcula cada año con el salario mínimo: confírmelo con
     su contador antes de tomarlo como definitivo. */
  pequeno: {
    label: 'Pequeño Contribuyente (5%)',
    tasa_iva: 0.05, simplificado: true, techo_anual: 465381.25,
    detalle: '5% sobre ingresos brutos, sin crédito fiscal. Hasta Q465,381.25 al año (125 salarios mínimos, Decreto 31-2024).',
  },
  pequeno_electronico: {
    label: 'Pequeño Contribuyente Electrónico (4%)',
    tasa_iva: 0.04, simplificado: true, techo_anual: 465381.25,
    detalle: '4% en vez de 5% si se paga dentro de los primeros 10 días hábiles del mes y se factura electrónicamente (Decreto 7-2019).',
  },
  agropecuario: {
    label: 'Contribuyente Agropecuario (5%)',
    tasa_iva: 0.05, simplificado: true, techo_anual: 3000000,
    detalle: 'Para producción y comercialización agropecuaria, hasta Q3,000,000 al año (Decreto 7-2019).',
  },
  agropecuario_electronico: {
    label: 'Agropecuario Electrónico (4%)',
    tasa_iva: 0.04, simplificado: true, techo_anual: 3000000,
    detalle: 'La variante electrónica del agropecuario: 4% pagando dentro de los primeros 10 días hábiles (Decreto 7-2019).',
  },
};

/* ── RÉGIMEN DE ISR ────────────────────────────────────────────────────────
   OJO: el ISR es un impuesto DISTINTO del IVA y con su propio régimen.
   En Guatemala el IVA es 12% (o las tasas reducidas de arriba); NO existe un
   IVA del 25%. El 25% es la tasa del ISR sobre utilidades — de ahí viene la
   confusión, y por eso acá se declara aparte y con nombre propio en vez de
   quedar escondido en el texto de ayuda del régimen general.

   Base legal: Ley de Actualización Tributaria, Decreto 10-2012.
     · Sobre Utilidades — 25% sobre la renta imponible (la utilidad).
     · Opcional Simplificado — 5% sobre los primeros Q30,000 de ingresos
       del mes y 7% sobre el excedente, calculado sobre INGRESOS, no sobre
       utilidad (por eso los gastos no deducen).
   El cambio de régimen se solicita a la SAT en diciembre (art. 51). */
const REGIMENES_ISR = {
  opcional_simplificado: {
    label: 'Opcional Simplificado sobre Ingresos (5% / 7%)',
    tramo1: 30000, tasa1: 0.05, tasa2: 0.07, sobre: 'ingresos',
    detalle: '5% sobre los primeros Q30,000 de ingresos del mes y 7% sobre el excedente. Se calcula sobre ingresos brutos: los gastos NO deducen.',
  },
  utilidades: {
    label: 'Sobre Utilidades de Actividades Lucrativas (25%)',
    tasa: 0.25, sobre: 'utilidad',
    detalle: '25% sobre la renta imponible (utilidad). Los gastos SÍ deducen. Pagos trimestrales por cierre parcial o sobre una renta imponible estimada del 8% de los ingresos brutos del trimestre.',
  },
};

/* ¿Este régimen de IVA paga ISR aparte?

   NO en los simplificados. Tanto el Pequeño Contribuyente (Decreto 27-92) como
   el Contribuyente Agropecuario (Decreto 7-2019) pagan una tasa única sobre
   ingresos brutos con carácter DEFINITIVO: quedan relevados de presentar y
   pagar declaraciones de ISR —anuales, trimestrales o mensuales— y del ISO.
   Ese 5% (o 4% en las variantes electrónicas) ya lo incluye todo.

   Por eso, cuando el régimen de IVA es simplificado, el régimen de ISR no se
   pregunta: no existe. Se guarda null, no un valor por defecto que mentiría. */
function aplicaISR(regimenIva) {
  return !regimenSimplificado(regimenIva);
}

/* Tasa de ISR que corresponde a un ingreso mensual dado. En el opcional
   simplificado la tasa depende del monto (5% hasta Q30,000, 7% arriba), así
   que no es un número fijo: se calcula. */
function tasaISR(regimenId, ingresoMensual = 0) {
  const r = REGIMENES_ISR[String(regimenId || '').toLowerCase()];
  if (!r) return 0;
  if (r.sobre === 'utilidad') return r.tasa;
  return (Number(ingresoMensual) || 0) > r.tramo1 ? r.tasa2 : r.tasa1;
}

/* La fila de config_fiscal que corresponde a un par de regímenes elegido.
   Existe porque el alta del comercio se hace desde cuatro lados (registro por
   correo, registro con Google, alta desde el Panel SaaS y el respaldo de
   auth.js) y los cuatro venían fijando el ISR en 5% y colapsando los cinco
   regímenes de IVA a dos: quien elegía "Agropecuario" terminaba guardado
   como "general" con IVA 12%. */
function resolverRegimenes(regimenIva, regimenIsr) {
  const iva = REGIMENES_SAT[regimenIva] ? regimenIva : 'general';
  /* En los regímenes simplificados el ISR no aplica (pago definitivo), así que
     se guarda null y tasa 0 aunque el formulario mande algo: el dato correcto
     es "no hay régimen de ISR", no un valor por defecto. */
  if (!aplicaISR(iva)) {
    return { regimen_iva: iva, tasa_iva: REGIMENES_SAT[iva].tasa_iva,
             regimen_isr: null, tasa_isr: 0 };
  }
  const isr = REGIMENES_ISR[regimenIsr] ? regimenIsr : 'opcional_simplificado';
  return {
    regimen_iva: iva,
    tasa_iva: REGIMENES_SAT[iva].tasa_iva,
    regimen_isr: isr,
    /* En el simplificado se guarda el tramo base (5%); el 7% del excedente lo
       calcula tasaISR() según los ingresos del mes, porque depende del monto. */
    tasa_isr: tasaISR(isr, 0),
  };
}

/* Régimen del comercio, tolerante con lo que ya está guardado. */
function regimenSAT(id) {
  return REGIMENES_SAT[String(id || 'general').toLowerCase()] || REGIMENES_SAT.general;
}

/* ¿Paga tasa reducida sobre ingresos en vez de IVA 12% con crédito fiscal?
   Reemplaza al viejo `regimen.startsWith('peque')`, que dejaba fuera a los
   agropecuarios y les cobraba 12% en vez de 5%. */
function regimenSimplificado(id) {
  return regimenSAT(id).simplificado === true;
}

function tasaIVARegimen(id) {
  return regimenSAT(id).tasa_iva;
}

if (typeof window !== 'undefined') {
  window.REGIMENES_SAT = REGIMENES_SAT;
  window.REGIMENES_ISR = REGIMENES_ISR;
  window.regimenSAT = regimenSAT;
  window.regimenSimplificado = regimenSimplificado;
  window.tasaIVARegimen = tasaIVARegimen;
  window.tasaISR = tasaISR;
  window.aplicaISR = aplicaISR;
  window.resolverRegimenes = resolverRegimenes;
}
