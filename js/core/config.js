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
  { id:'activos',        icon:'🛠️', label:'Herramientas y Activos', grupo:'operacion' },
  { id:'facturacion',    icon:'🧾', label:'Facturación FEL',   grupo:'finanzas'   },
  { id:'bancos',         icon:'🏦', label:'Bancos',            grupo:'finanzas'   },
  { id:'finanzas',       icon:'💰', label:'Finanzas',          grupo:'finanzas'   },
  { id:'presupuesto',    icon:'📊', label:'Presupuesto',       grupo:'finanzas'   },
  { id:'rrhh',           icon:'👤', label:'RRHH & Nómina',     grupo:'rrhh',
    subnav:[
      { tab:'empleados',     icon:'👤', label:'Empleados'     },
      { tab:'nomina',        icon:'💵', label:'Nómina'        },
      { tab:'productividad', icon:'📈', label:'Productividad'  },
      { tab:'organigrama',   icon:'🏢', label:'Organigrama'   },
      { tab:'documentos',    icon:'📄', label:'Documentos'    }
    ] },
  { id:'marketing',      icon:'🎯', label:'Marketing',         grupo:'marketing'  },
  { id:'calendario',     icon:'📅', label:'Calendario',        grupo:'herramientas'},
  { id:'comunicaciones', icon:'🔔', label:'Comunicaciones',    grupo:'herramientas'},
  { id:'configuracion',  icon:'⚙️', label:'Configuración',     grupo:'admin'      },
  { id:'usuarios',       icon:'👥', label:'Usuarios',          grupo:'admin'      },
  { id:'admin',          icon:'🗄️', label:'Administración',    grupo:'admin'      },
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
  { id:'cliente',      label:''               }
];

/* ── PERMISOS POR ROL ─────────────────────────────── */
const PERMISOS = {
  superadmin:   { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:true,  activos:true,  facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:true,  usuarios:true,  admin:true,  mi_ot:false },
  admin:        { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:true,  activos:true,  facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:true,  usuarios:true,  admin:true,  mi_ot:false },
  gerente_tal:  { dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:true,  activos:true,  facturacion:false, bancos:false, finanzas:false, presupuesto:false, rrhh:true,  marketing:true,  calendario:true,  comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false },
  gerente_fin:  { dashboard:true,  clientes:false, vehiculos:false, ordenes:false, inventario:false, bodegas:false, proveedores:true,  activos:true,  facturacion:true,  bancos:true,  finanzas:true,  presupuesto:true,  rrhh:true,  marketing:false, calendario:false, comunicaciones:true,  configuracion:false, usuarios:false, admin:false, mi_ot:false },
  recepcionista:{ dashboard:true,  clientes:true,  vehiculos:true,  ordenes:true,  inventario:false, bodegas:false, proveedores:false, activos:false, facturacion:true,  bancos:false, finanzas:false, presupuesto:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false },
  mecanico:     { dashboard:true,  clientes:false, vehiculos:true,  ordenes:true,  inventario:true,  bodegas:true,  proveedores:false, activos:false, facturacion:false, bancos:false, finanzas:false, presupuesto:false, rrhh:false, marketing:false, calendario:true,  comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:false },
  cliente:      { dashboard:false, clientes:false, vehiculos:false, ordenes:false, inventario:false, bodegas:false, proveedores:false, activos:false, facturacion:false, bancos:false, finanzas:false, presupuesto:false, rrhh:false, marketing:false, calendario:false, comunicaciones:false, configuracion:false, usuarios:false, admin:false, mi_ot:true  }
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

/* ¿Puede ver el PRECIO DE COMPRA (costo)? — secreto del negocio.
   Solo dueño/administración y gerencia financiera. */
function puedeVerCosto() {
  const rol = window.Auth?.user?.rol;
  return rol === 'superadmin' || rol === 'admin' || rol === 'gerente_fin';
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
