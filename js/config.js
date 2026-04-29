/* ═══════════════════════════════════════════════════════
   config.js — Constantes globales: roles, nav, estados
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

const ROLES = {
  admin:         { label: 'Admin / Dueño',   icon: '👑', color: 'amber'  },
  recepcionista: { label: 'Recepcionista',    icon: '📋', color: 'cyan'   },
  jefe:          { label: 'Jefe de Taller',   icon: '📊', color: 'purple' },
  mecanico:      { label: 'Mecánico',         icon: '🪛', color: 'green'  },
  cliente:       { label: 'Cliente',          icon: '🚗', color: 'red'    }
};

const NAV = [
  { id: 'dashboard',    icon: '📊', label: 'Dashboard',           roles: ['admin','recepcionista','jefe','mecanico','cliente'] },
  { id: 'clientes',     icon: '👥', label: 'Clientes',             roles: ['admin','recepcionista','jefe'] },
  { id: 'vehiculos',    icon: '🚗', label: 'Vehículos',             roles: ['admin','recepcionista','jefe'] },
  { id: 'ordenes',      icon: '📋', label: 'Órdenes de Trabajo',   roles: ['admin','recepcionista','jefe','mecanico'] },
  { id: 'inventario',   icon: '📦', label: 'Inventario',           roles: ['admin','jefe','mecanico'], badge: 2 },
  { id: 'proveedores',  icon: '🏪', label: 'Proveedores',           roles: ['admin','jefe'] },
  { id: 'calendario',   icon: '📅', label: 'Calendario',           roles: ['admin','recepcionista','jefe'] },
  { id: 'facturacion',  icon: '🧾', label: 'Facturación FEL',      roles: ['admin','recepcionista'] },
  { id: 'finanzas',     icon: '💰', label: 'Finanzas',              roles: ['admin'] },
  { id: 'rrhh',         icon: '👤', label: 'RRHH & Nómina',        roles: ['admin'] },
  { id: 'comunicaciones', icon: '🔔', label: 'Comunicaciones',       roles: ['admin','jefe'], badge: 0 },
  { id: 'mi-ot',        icon: '🔧', label: 'Mis OTs',              roles: ['mecanico'] },
  { id: 'mi-vehiculo',  icon: '🚗', label: 'Mi Vehículo',          roles: ['cliente'] },
  { id: 'config',       icon: '⚙️', label: 'Configuración',        roles: ['admin'] }
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
  admin: {
    id: 'e1', nombre: 'Diego Torres',
    rol: 'admin', tenant: 'automotriz-torres'
  },
  recepcionista: {
    id: 'e2', nombre: 'Sandra López',
    rol: 'recepcionista', tenant: 'automotriz-torres'
  },
  jefe: {
    id: 'e5', nombre: 'Marco Barrios',
    rol: 'jefe', tenant: 'automotriz-torres'
  },
  mecanico: {
    id: 'e3', nombre: 'Juan Revolorio',
    rol: 'mecanico', tenant: 'automotriz-torres'
  },
  cliente: {
    id: 'c1', nombre: 'Carlos Mendoza',
    rol: 'cliente', tenant: 'automotriz-torres',
    vehiculos: ['v1','v2']
  }
};
