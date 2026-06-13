/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/config.js — Constantes globales
   Multi-taller · Multi-usuario · PWA · Android · Windows
═══════════════════════════════════════════════════════ */

const APP = {
  nombre:   'TallerPro Enterprise',
  version:  '3.1.0',
  build:    '20260610',
  url:      'https://app.cmtelecommgt.com'
};

/* Site key pública de Cloudflare Turnstile (anti-bots en "Crear nuevo taller").
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
  gerente_tal:  { label:'Gerente de Taller',   icon:'🔧', color:'cyan',   oculto:false },
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
  { id:'clientes',       icon:'👥', label:'Clientes',          grupo:'operacion'  },
  { id:'vehiculos',      icon:'🚗', label:'Vehículos',         grupo:'operacion'  },
  { id:'ordenes',        icon:'📋', label:'Órdenes de Trabajo', grupo:'operacion',
    subnav:[
      { tab:'lista',  icon:'☰', label:'Lista'   },
      { tab:'kanban', icon:'⬛', label:'Kanban'  }
    ] },
  { id:'inventario',     icon:'📦', label:'Inventario',        grupo:'operacion'  },
  { id:'bodegas',        icon:'🏭', label:'Bodegas',           grupo:'operacion'  },
  { id:'proveedores',    icon:'🏪', label:'Proveedores',       grupo:'operacion'  },
  { id:'compras',        icon:'🛒', label:'Compras',           grupo:'operacion'  },
  { id:'activos',        icon:'🛠️', label:'Herramientas y Activos', grupo:'operacion',
    subnav:[
      { tab:'activos',      icon:'🛠️', label:'Inventario de Activos' },
      { tab:'depreciacion', icon:'📉', label:'Depreciación'          }
    ] },
  { id:'envios',         icon:'🚚', label:'Envíos / Fletes',   grupo:'operacion'  },
  { id:'facturacion',    icon:'🧾', label:'Facturación FEL',   grupo:'finanzas'   },
  { id:'bancos',         icon:'🏦', label:'Bancos',            grupo:'finanzas'   },
  { id:'finanzas',       icon:'💰', label:'Finanzas',          grupo:'finanzas',
    subnav:[
      { tab:'dashboard',   icon:'📊', label:'Resumen'              },
      { tab:'ingresos',    icon:'📈', label:'Ingresos'             },
      { tab:'egresos',     icon:'📉', label:'Egresos'              },
      { tab:'viaticos',    icon:'🚗', label:'Viáticos'             },
      { tab:'recurrentes', icon:'🔁', label:'Recurrentes'          },
      { tab:'balance',     icon:'📋', label:'Estado de Resultados' },
      { tab:'libros',      icon:'📚', label:'Libro IVA'            },
      { tab:'retenciones', icon:'🧾', label:'Retenciones / ISR'    },
      { tab:'fiscal',      icon:'🏛️', label:'Fiscal SAT'           }
    ] },
  { id:'presupuesto',    icon:'📊', label:'Presupuesto',       grupo:'finanzas'   },
  { id:'contabilidad',   icon:'🧮', label:'Contabilidad / SAT', grupo:'finanzas',
    subnav:[
      { tab:'iva',          icon:'🧾', label:'IVA del mes'      },
      { tab:'trimestre',    icon:'🏢', label:'Trimestral / ISO' },
      { tab:'ventas',       icon:'📤', label:'Libro de Ventas'  },
      { tab:'compras',      icon:'📥', label:'Libro de Compras' },
      { tab:'isr',          icon:'🏛️', label:'ISR mensual'      },
      { tab:'fel',          icon:'⬆️', label:'Importar FEL'     },
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
      { tab:'talleres', icon:'🏪', label:'Talleres' },
      { tab:'cobros',   icon:'💵', label:'Cobros'   },
      { tab:'planes',   icon:'🎚️', label:'Planes'   }
    ] },
  { id:'mi_ot',          icon:'🔍', label:'Mis Órdenes',       grupo:'cliente'    }
];

/* ── GRUPOS DEL SIDEBAR (orden y encabezados) ─────── */
/* El orden aquí define el orden del menú. label vacío = sin encabezado. */
const GRUPOS = [
  { id:'principal',    label:''               },
  { id:'operacion',    label:'Operación'      },
  { id:'finanzas',     label:'Finanzas'       },
  { id:'rrhh',         label:'RRHH & Nómina'  },
  { id:'marketing',    label:'Marketing'      },
  { id:'herramientas', label:'Herramientas'   },
  { id:'admin',        label:'Administración' },
  { id:'saas',         label:'SaaS'           },
  { id:'cliente',      label:''               }
];

/* ── PERMISOS POR ROL ─────────────────────────────── */
const PERMISOS = {
  superadmin:   { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:true,  compras:true,  activos:true,  envios:true,  facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  contabilidad:true,  rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:true,  usuarios:true,  admin:true,  mi_ot:false, doc_empresa:true  },
  admin:        { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:true,  compras:true,  activos:true,  envios:true,  facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  contabilidad:true,  rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:true,  usuarios:true,  admin:true,  mi_ot:false, doc_empresa:true  },
  gerente_tal:  { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:true,  compras:true,  activos:true,  envios:true,  facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:true  },
  gerente_fin:  { dashboard:true,  clientes:false, vehiculos:false, ordenes:false, inventario:false, bodegas:false, proveedores:true,  compras:true,  activos:true,  envios:true,  facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  contabilidad:true,  rrhh:true,  marketing:false, calendario:false, comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:true  },
  recepcionista:{ dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:true,  facturacion:true,  bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  vendedor:     { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:false, inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:true,  facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:true,  calendario:false, comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  mecanico:     { dashboard:true,  clientes:false, vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:false, compras:false, activos:false, envios:true,  facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  contador:     { dashboard:true,  clientes:false, vehiculos:false, ordenes:false, inventario:false, bodegas:false, proveedores:true,  compras:true,  activos:true,  envios:false, facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  contabilidad:true,  rrhh:false, marketing:false, calendario:true,  comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  bodeguero:    { dashboard:true,  clientes:false, vehiculos:false, ordenes:false, inventario:true,  bodegas:true,  proveedores:true,  compras:true,  activos:false, envios:true,  facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  limpieza:     { dashboard:true,  clientes:false, vehiculos:false, ordenes:false, inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:false, facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  conserje:     { dashboard:true,  clientes:false, vehiculos:false, ordenes:false, inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:false, facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false, doc_empresa:false },
  cliente:      { dashboard:false, clientes:false, vehiculos:false, ordenes:false, inventario:false, bodegas:false, proveedores:false, compras:false, activos:false, envios:false, facturacion:false, bancos:false, finanzas:false, presupuesto:false, contabilidad:false, rrhh:false, marketing:false, calendario:false, comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:true,  doc_empresa:false }
};

/* ── PLANES COMERCIALES (SaaS) ────────────────────────
   Cada plan define qué módulos incluye. El superadmin puede,
   por taller, sobre-escribir la lista exacta (tenants.modulos_activos).
   Módulos SIEMPRE disponibles (no se cobran / son de la cuenta):
   dashboard, configuración, usuarios, admin, mi_ot, calendario.        */
const MODULOS_SIEMPRE = ['dashboard','configuracion','usuarios','admin','respaldos','mi_ot','calendario'];

const PLANES = {
  basico: {
    label: 'Básico / Emprendedor', precio: 199, color: 'cyan',
    desc: 'Operación del taller: clientes, vehículos, OT, inventario y POS.',
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
    desc: 'Todo lo Pro + RRHH/Nómina y Beto, tu mecánico experto IA. Solución completa.',
    modulos: ['clientes','vehiculos','ordenes','inventario','pos',
              'proveedores','compras','bodegas','activos','envios',
              'facturacion','bancos','finanzas','presupuesto','contabilidad','marketing','comunicaciones','rrhh','ia']
  },
  medida: {
    label: 'A la Medida', precio: 199, color: 'purple', negociable: true,
    desc: 'Para negociar: arranca con la base del Emprendedor y suma solo los módulos que el taller necesita, cada uno con su precio.',
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
  rrhh: 149,        ia: 99
};

/* Lista de módulos que se pueden vender/activar a la carta (para el panel SA).
   'ia' (Beto) viene incluido en Empresarial y es add-on para Básico/Pro. */
const MODULOS_VENDIBLES = [
  'clientes','vehiculos','ordenes','inventario','pos','proveedores','compras',
  'bodegas','activos','envios','facturacion','bancos','finanzas','presupuesto',
  'contabilidad','marketing','comunicaciones','rrhh','ia'
];

/* Etiqueta legible de un módulo (los que no tienen página propia en MODULOS) */
function labelModulo(id) {
  return (typeof MODULOS !== 'undefined' && MODULOS.find(x => x.id === id)?.label)
    || ({ ia: '🤖 Beto (Asistente IA)' })[id] || id;
}

/* Módulos activos del taller en sesión (override del tenant o, si no, su plan). */
function modulosActivosTenant() {
  const t = window.Auth?.tenant;
  if (!t) return null;                       // sin tenant cargado → no bloquear
  if (Array.isArray(t.modulos_activos) && t.modulos_activos.length) return t.modulos_activos;
  const plan = PLANES[t.plan];
  if (!plan) return null;                     // plan legacy/desconocido → sin gating (todo permitido)
  return plan.modulos;
}

/* ¿El módulo está incluido en el plan/paquete del taller? */
function moduloEnPlan(modId) {
  if (MODULOS_SIEMPRE.includes(modId)) return true;
  const act = modulosActivosTenant();
  if (!act) return true;
  return act.includes(modId);
}

/* ── FIDELIZACIÓN (políticas configurables por taller) ──
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

/* ¿La suscripción del taller está vigente? (vencida = solo lectura/bloqueo suave) */
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

function tieneAcceso(modulo) {
  if (!window.Auth?.user) return false;
  const rol = window.Auth.user.rol;
  if (rol === 'superadmin') return true;          // el dueño del SaaS ve todo
  if (!moduloEnPlan(modulo)) return false;        // gating por plan (aplica también al admin del taller)
  if (rol === 'admin') return true;
  return getPermisos()[modulo] === true;
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
   tipo 'auto'  → lo calcula el sistema; scope 'taller' usa los datos
                  de TODO el taller (gestión/ventas) en vez de las OTs propias.
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
    { id:'ingresos_taller', label:'Ingresos del taller (Q)', peso:30, tipo:'auto',  meta:50000, scope:'taller' },
    { id:'atencion',        label:'Atención al cliente',     peso:30, tipo:'manual' },
    { id:'orden_caja',      label:'Orden de caja y cobros',  peso:20, tipo:'manual' },
    { id:'actitud',         label:'Actitud y disciplina',    peso:20, tipo:'manual' }
  ],
  recepcionista: [
    { id:'ots_taller',  label:'OTs entregadas del taller',   peso:25, tipo:'auto',  meta:30, scope:'taller' },
    { id:'atencion',    label:'Atención al cliente',         peso:35, tipo:'manual' },
    { id:'seguimiento', label:'Seguimiento de citas y OTs',  peso:20, tipo:'manual' },
    { id:'actitud',     label:'Actitud y disciplina',        peso:20, tipo:'manual' }
  ],
  gerente: [
    { id:'ots_taller',          label:'OTs entregadas del taller',      peso:25, tipo:'auto', meta:30,    scope:'taller' },
    { id:'ingresos_taller',     label:'Ingresos del taller (Q)',        peso:25, tipo:'auto', meta:80000, scope:'taller' },
    { id:'cumplimiento_taller', label:'Cumplimiento de tiempos (taller)',peso:20, tipo:'auto',            scope:'taller' },
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
