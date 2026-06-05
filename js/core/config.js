/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/config.js — Constantes globales
   Multi-taller · Multi-usuario · PWA · Android · Windows
═══════════════════════════════════════════════════════ */

const APP = {
  nombre:   'TallerPro Enterprise',
  version:  '3.0.0',
  build:    '20260509',
  url:      'https://app.cmtelecommgt.com'
};

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
  mecanico:     { label:'Mecánico',            icon:'🪛', color:'gray',   oculto:false },
  cliente:      { label:'Cliente',             icon:'🚗', color:'cyan',   oculto:false }
};

/* ── MÓDULOS DEL SISTEMA ──────────────────────────── */
const MODULOS = [
  { id:'dashboard',      icon:'📊', label:'Dashboard',         grupo:'principal' },
  { id:'clientes',       icon:'👥', label:'Clientes',          grupo:'operacion'  },
  { id:'vehiculos',      icon:'🚗', label:'Vehículos',         grupo:'operacion'  },
  { id:'ordenes',        icon:'📋', label:'Órdenes de Trabajo', grupo:'operacion' },
  { id:'inventario',     icon:'📦', label:'Inventario',        grupo:'operacion'  },
  { id:'bodegas',        icon:'🏭', label:'Bodegas',           grupo:'operacion'  },
  { id:'proveedores',    icon:'🏪', label:'Proveedores',       grupo:'operacion'  },
  { id:'facturacion',    icon:'🧾', label:'Facturación FEL',   grupo:'finanzas'   },
  { id:'bancos',         icon:'🏦', label:'Bancos',            grupo:'finanzas'   },
  { id:'finanzas',       icon:'💰', label:'Finanzas',          grupo:'finanzas'   },
  { id:'rrhh',           icon:'👤', label:'RRHH & Nómina',     grupo:'rrhh'       },
  { id:'marketing',      icon:'🎯', label:'Marketing',         grupo:'marketing'  },
  { id:'calendario',     icon:'📅', label:'Calendario',        grupo:'herramientas'},
  { id:'comunicaciones', icon:'🔔', label:'Comunicaciones',    grupo:'herramientas'},
  { id:'configuracion',  icon:'⚙️', label:'Configuración',     grupo:'admin'      },
  { id:'usuarios',       icon:'👥', label:'Usuarios',          grupo:'admin'      },
  { id:'admin',          icon:'🗄️', label:'Administración',    grupo:'admin'      },
  { id:'mi_ot',          icon:'🔍', label:'Mis Órdenes',       grupo:'cliente'    }
];

/* ── PERMISOS POR ROL ─────────────────────────────── */
const PERMISOS = {
  superadmin:   { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:true,  facturacion:true,  bancos:true,  finanzas:true,  rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:true,  usuarios:true,  admin:true,  mi_ot:false },
  admin:        { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:true,  facturacion:true,  bancos:true,  finanzas:true,  rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:true,  usuarios:true,  admin:true,  mi_ot:false },
  gerente_tal:  { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:true,  facturacion:false, bancos:false, finanzas:false, rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false },
  gerente_fin:  { dashboard:true,  clientes:false, vehiculos:false, ordenes:false, inventario:false, bodegas:false, proveedores:true,  facturacion:true,  bancos:true,  finanzas:true,  rrhh:true,  marketing:false, calendario:false, comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false },
  recepcionista:{ dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:false, bodegas:false, proveedores:false, facturacion:true,  bancos:false, finanzas:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false },
  mecanico:     { dashboard:true,  clientes:false, vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:false, facturacion:false, bancos:false, finanzas:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false },
  cliente:      { dashboard:false, clientes:false, vehiculos:false, ordenes:false, inventario:false, bodegas:false, proveedores:false, facturacion:false, bancos:false, finanzas:false, rrhh:false, marketing:false, calendario:false, comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:true  }
};

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
  if (rol === 'superadmin' || rol === 'admin') return true;
  return getPermisos()[modulo] === true;
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
