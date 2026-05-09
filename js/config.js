/* ═══════════════════════════════════════════════════════
   config.js — Constantes globales: roles, nav, permisos
   TallerPro Enterprise v2.1
═══════════════════════════════════════════════════════ */

const ROLES = {
  superadmin:   { label: 'Super Admin',       icon: '⚡', color: 'red',    hidden: true  },
  admin:        { label: 'Administrador',      icon: '👑', color: 'amber',  hidden: false },
  gerente_fin:  { label: 'Gerente Financiero', icon: '💰', color: 'green',  hidden: false },
  gerente_tal:  { label: 'Gerente de Taller',  icon: '🔧', color: 'cyan',   hidden: false },
  recepcionista:{ label: 'Recepcionista',      icon: '📋', color: 'purple', hidden: false },
  mecanico:     { label: 'Mecánico',           icon: '🪛', color: 'gray',   hidden: false },
  cliente:      { label: 'Cliente',            icon: '🚗', color: 'cyan',   hidden: false }
};

/* ── MÓDULOS DEL SISTEMA ──────────────────────────── */
const MODULOS = [
  { id: 'dashboard',      icon: '📊', label: 'Dashboard'         },
  { id: 'clientes',       icon: '👥', label: 'Clientes'          },
  { id: 'vehiculos',      icon: '🚗', label: 'Vehículos'         },
  { id: 'ordenes',        icon: '📋', label: 'Órdenes de Trabajo'},
  { id: 'inventario',     icon: '📦', label: 'Inventario'        },
  { id: 'proveedores',    icon: '🏪', label: 'Proveedores'       },
  { id: 'calendario',     icon: '📅', label: 'Calendario'        },
  { id: 'facturacion',    icon: '🧾', label: 'Facturación FEL'   },
  { id: 'finanzas',       icon: '💰', label: 'Finanzas'          },
  { id: 'rrhh',           icon: '👤', label: 'RRHH & Nómina'     },
  { id: 'comunicaciones', icon: '🔔', label: 'Comunicaciones'    },
  { id: 'config',         icon: '⚙️', label: 'Configuración'     },
  { id: 'database',       icon: '🗄️', label: 'Base de Datos'     },
  { id: 'mi_ot',          icon: '🔍', label: 'Mis Órdenes'       }
];

/* ── PERMISOS PREDEFINIDOS POR ROL ────────────────── */
const PERMISOS_ROL = {
  superadmin:   { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  proveedores:true,  calendario:true,  facturacion:true,  finanzas:true,  rrhh:true,  comunicaciones:true,  config:true,  database:true,  mi_ot:false },
  admin:        { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  proveedores:true,  calendario:true,  facturacion:true,  finanzas:true,  rrhh:true,  comunicaciones:true,  config:true,  database:true,  mi_ot:false },
  gerente_tal:  { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  proveedores:true,  calendario:true,  facturacion:false, finanzas:false, rrhh:true,  comunicaciones:true,  config:false, database:false, mi_ot:false },
  gerente_fin:  { dashboard:true,  clientes:false, vehiculos:false, ordenes:false, inventario:false, proveedores:true,  calendario:false, facturacion:true,  finanzas:true,  rrhh:true,  comunicaciones:true,  config:false, database:false, mi_ot:false },
  recepcionista:{ dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:false, proveedores:false, calendario:true,  facturacion:true,  finanzas:false, rrhh:false, comunicaciones:false, config:false, database:false, mi_ot:false },
  mecanico:     { dashboard:true,  clientes:false, vehiculos:true,  ordenes:true,  inventario:true,  proveedores:false, calendario:true,  facturacion:false, finanzas:false, rrhh:false, comunicaciones:false, config:false, database:false, mi_ot:false },
  cliente:      { dashboard:false, clientes:false, vehiculos:false, ordenes:false, inventario:false, proveedores:false, calendario:false, facturacion:false, finanzas:false, rrhh:false, comunicaciones:false, config:false, database:false, mi_ot:true  }
};

/* ── FUNCIONES DE PERMISOS ────────────────────────── */
function getPermisosUsuario() {
  if (!Auth.user) return {};
  const rol    = Auth.user.rol || 'recepcionista';
  const base   = { ...(PERMISOS_ROL[rol] || PERMISOS_ROL.recepcionista) };
  const custom = Auth.user.permisos_custom || {};
  return { ...base, ...custom };
}

function tieneAcceso(modulo) {
  if (!Auth.user) return false;
  if (Auth.user.rol === 'superadmin' || Auth.user.rol === 'admin') return true;
  return getPermisosUsuario()[modulo] === true;
}

/* ── NAV (generado dinámicamente según permisos) ─── */
const NAV = MODULOS.filter(m => m.id !== 'mi_ot').concat(
  [{ id: 'mi_ot', icon: '🔍', label: 'Mis Órdenes' }]
);

const ESTADOS_OT = {
  recibido:        { label: 'Recibido',        color: 'gray'   },
  diagnostico:     { label: 'Diagnóstico',     color: 'cyan'   },
  en_proceso:      { label: 'En Proceso',      color: 'amber'  },
  listo:           { label: 'Listo',           color: 'green'  },
  entregado:       { label: 'Entregado',       color: 'gray'   },
  cancelado:       { label: 'Cancelado',       color: 'red'    },
  garantia:        { label: 'Garantía',        color: 'purple' }
};

const DEMO_USERS = {
  superadmin:   { id:'u-sa', rol:'superadmin',   nombre:'Super Admin',   email:'superadmin@tallerpro.gt' },
  admin:        { id:'u-ad', rol:'admin',         nombre:'Carlos Torres', email:'admin@tallerpro.gt'      },
  gerente_fin:  { id:'u-gf', rol:'gerente_fin',   nombre:'María López',   email:'finanzas@tallerpro.gt'   },
  gerente_tal:  { id:'u-gt', rol:'gerente_tal',   nombre:'Roberto Méndez',email:'taller@tallerpro.gt'     },
  recepcionista:{ id:'u-rc', rol:'recepcionista', nombre:'Ana García',    email:'recep@tallerpro.gt'      },
  mecanico:     { id:'u-me', rol:'mecanico',      nombre:'Pedro Orozco',  email:'mecanico@tallerpro.gt'   },
  cliente:      { id:'u-cl', rol:'cliente',       nombre:'Juan Pérez',    email:'cliente@gmail.com'       }
};
