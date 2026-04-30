/* ═══════════════════════════════════════════════════════
   config.js — Constantes globales: roles, nav, estados
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

const ROLES = {
  superadmin:  { label: 'Super Admin',          icon: '⚡', color: 'red',    hidden: true  },
  admin:       { label: 'Administrador',         icon: '👑', color: 'amber',  hidden: false },
  gerente_fin: { label: 'Gerente Financiero',    icon: '💰', color: 'green',  hidden: false },
  gerente_tal: { label: 'Gerente de Taller',     icon: '🔧', color: 'cyan',   hidden: false },
  recepcionista:{ label: 'Recepcionista',         icon: '📋', color: 'purple', hidden: false },
  mecanico:    { label: 'Mecánico',              icon: '🪛', color: 'gray',   hidden: false },
  cliente:     { label: 'Cliente',               icon: '🚗', color: 'cyan',   hidden: false }
};

const NAV = [
  { id: 'dashboard',      icon: '📊', label: 'Dashboard',          roles: ['superadmin','admin','gerente_fin','gerente_tal'] },
  { id: 'clientes',       icon: '👥', label: 'Clientes',           roles: ['superadmin','admin','gerente_tal','recepcionista'] },
  { id: 'vehiculos',      icon: '🚗', label: 'Vehículos',          roles: ['superadmin','admin','gerente_tal','recepcionista'] },
  { id: 'ordenes',        icon: '📋', label: 'Órdenes de Trabajo', roles: ['superadmin','admin','gerente_tal','recepcionista','mecanico'] },
  { id: 'inventario',     icon: '📦', label: 'Inventario',         roles: ['superadmin','admin','gerente_tal','mecanico'] },
  { id: 'proveedores',    icon: '🏪', label: 'Proveedores',        roles: ['superadmin','admin','gerente_tal','gerente_fin'] },
  { id: 'calendario',     icon: '📅', label: 'Calendario',         roles: ['superadmin','admin','gerente_tal','recepcionista','mecanico'] },
  { id: 'facturacion',    icon: '🧾', label: 'Facturación FEL',    roles: ['superadmin','admin','gerente_fin','recepcionista'] },
  { id: 'finanzas',       icon: '💰', label: 'Finanzas',           roles: ['superadmin','admin','gerente_fin'] },
  { id: 'rrhh',           icon: '👤', label: 'RRHH & Nómina',      roles: ['superadmin','admin','gerente_fin'] },
  { id: 'comunicaciones', icon: '🔔', label: 'Comunicaciones',     roles: ['superadmin','admin','gerente_tal'] },
  { id: 'config',         icon: '⚙️', label: 'Configuración',      roles: ['superadmin','admin'] },
  { id: 'database',       icon: '🗄️', label: 'Base de Datos',      roles: ['superadmin','admin'] },
  /* Vistas cliente */
  { id: 'mi-vehiculo',    icon: '🚗', label: 'Mis Vehículos',      roles: ['cliente'] },
  /* Vistas mecánico */
  { id: 'mi-ot',          icon: '🔧', label: 'Mis Órdenes',        roles: ['mecanico'] }
];

const ESTADOS_OT = {
  recibido:        { label: 'Recibido',        color: 'gray'   },
  diagnostico:     { label: 'Diagnóstico',     color: 'cyan'   },
  en_trabajo:      { label: 'En Trabajo',      color: 'amber'  },
  espera_repuestos:{ label: 'Esp. Repuestos',  color: 'purple' },
  listo:           { label: 'Listo',           color: 'green'  },
  entregado:       { label: 'Entregado',       color: 'gray'   },
  cancelado:       { label: 'Cancelado',       color: 'red'    }
};

const DEMO_USERS = {
  superadmin:  { id:'u-sa',  rol:'superadmin',  nombre:'Super Admin',        email:'superadmin@tallerpro.gt' },
  admin:       { id:'u-ad',  rol:'admin',        nombre:'Carlos Torres',      email:'admin@tallerpro.gt'      },
  gerente_fin: { id:'u-gf',  rol:'gerente_fin',  nombre:'María López',        email:'finanzas@tallerpro.gt'   },
  gerente_tal: { id:'u-gt',  rol:'gerente_tal',  nombre:'Roberto Méndez',     email:'taller@tallerpro.gt'     },
  recepcionista:{ id:'u-rc', rol:'recepcionista', nombre:'Ana García',         email:'recep@tallerpro.gt'      },
  mecanico:    { id:'u-me',  rol:'mecanico',     nombre:'Pedro Orozco',       email:'mecanico@tallerpro.gt'   },
  cliente:     { id:'u-cl',  rol:'cliente',      nombre:'Juan Pérez',         email:'cliente@gmail.com'       }
};
