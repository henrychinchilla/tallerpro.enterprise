# 🏭 PROMPT — DoctorProGT (vertical clínicas/hospitales, basado en TallerPro Enterprise)

> **Cómo usarlo:** copia TODO lo que está dentro del bloque de abajo en una sesión
> NUEVA de Claude Code, en una carpeta VACÍA (otro directorio, otro repo). Ya viene
> con todos los datos rellenados — el agente debe empezar a trabajar de inmediato,
> sin pedir más información salvo algo realmente bloqueante.

---

```
Eres mi socio técnico y vas a construir un SaaS multi-tenant COMPLETO e ir desplegándolo
a producción por fases. Ya construimos juntos uno igual (TallerPro Enterprise, gestión de
talleres automotrices en Guatemala) y este prompt destila su arquitectura, convenciones y
lecciones. NO experimentes con otra arquitectura: replica esta, cambiando solo el dominio.

═══════════════════════════════════════════════
0. ANTES QUE NADA: PERMISOS
═══════════════════════════════════════════════
Crea (o edita) `.claude/settings.local.json` en la raíz del proyecto con:
{
  "permissions": {
    "allow": [
      "Bash(git push *)", "Bash(git commit *)", "Bash(git add *)", "Bash(npm run *)",
      "PowerShell(git *)", "PowerShell(npm run *)",
      "mcp__plugin_supabase_supabase__*",
      "mcp__plugin_cloudflare_cloudflare-api__execute"
    ],
    "defaultMode": "bypassPermissions"
  }
}
A partir de ahí trabaja sin pedirme confirmación para comandos, ediciones, commits,
push, migraciones ni despliegues. Sigue siendo cuidadoso con operaciones destructivas
(no --force, no DROP sin respaldo previo), pero no te detengas a preguntar.

═══════════════════════════════════════════════
1. EL PRODUCTO
═══════════════════════════════════════════════
- Nombre del producto: DoctorPro GT
- Vertical: clínicas y centros médicos de dermatología, cirugía plástica/estética
  y cuidado de la piel (también sirve para clínicas/hospitales generales pequeños).
- Cliente que paga: el médico dueño/administrador de la clínica.
- Entidad "cliente final": paciente.
- Entidad "objeto de trabajo": expediente clínico del paciente (historia clínica
  acumulada: antecedentes, alergias, evoluciones, procedimientos, fotos, consentimientos).
- Documento operativo central: consulta/cita médica (con nota de evolución tipo SOAP:
  Subjetivo, Objetivo, Análisis, Plan; diagnóstico CIE-10 opcional; receta asociada).
- País y fiscalidad: Guatemala — reutiliza TODO el bloque SAT/IGSS/nómina tal cual
  (FEL, IVA, ISR/ISO, libros, calendario fiscal, IGSS/IRTRA/INTECAP).
- Roles del equipo del cliente: médico/dermatólogo, cirujano plástico, enfermera/asistente
  clínico, recepcionista, administrador del centro, contador.
- Módulos del vertical (los que NO trae la base):
  - Pacientes (ficha demográfica, contacto, alergias, antecedentes médicos/familiares,
    seguro médico si aplica).
  - Expedientes clínicos / Historia clínica: línea de tiempo por paciente con todas
    sus consultas, diagnósticos, procedimientos, recetas, fotos y documentos.
  - Citas / Agenda médica: por médico y especialidad, duración configurable por tipo
    de cita/procedimiento, recordatorios (reutiliza el motor de email/WhatsApp ya
    construido), bloqueo de horarios, sala asignada.
  - Consultas con nota SOAP, signos vitales, diagnóstico (texto libre + CIE-10
    opcional), plan de tratamiento, próxima cita sugerida.
  - Recetas médicas: medicamento, dosis, vía, frecuencia, duración, indicaciones;
    PDF imprimible con datos del médico (nombre, colegiado activo, especialidad).
  - Procedimientos/Cirugías: programación (fecha, sala/quirófano, médico, asistentes,
    duración estimada), consentimiento informado (plantilla por procedimiento, firma
    digital del paciente con su usuario igual que las asignaciones de RRHH), checklist
    pre y post operatorio, notas de seguimiento postoperatorio con fechas de control.
  - Fotografías clínicas: antes/después por procedimiento o por fecha, comparador
    lado a lado, asociadas al expediente y al procedimiento, con consentimiento de
    uso de imagen (sí/no para fines de marketing).
  - Laboratorio: órdenes de laboratorio/estudios, resultados adjuntos (PDF/imagen),
    estado (pendiente/listo), asociados al expediente.
  - Salas/Quirófanos/Consultorios: catálogo de espacios físicos, disponibilidad,
    se cruza con la agenda de citas y procedimientos.
  - Inventario de insumos médicos y medicamentos: productos con lote y fecha de
    vencimiento, alertas de caducidad próxima (no solo de stock mínimo), baja
    automática al usar en consulta/procedimiento o al vender en POS (dermocosméticos).
  - POS opcional en pantalla aparte (pos.html) para venta de productos dermocosméticos
    de mostrador — reutiliza el módulo POS existente.
- Mi identidad: superadmin = henry.chinchilla@gmail.com / password inicial Ericsson_123!
  (cámbiala tras el primer login); yo soy el dueño del SaaS y vendo suscripciones.
- Moneda y país de los montos: Q (quetzales), Guatemala.

═══════════════════════════════════════════════
2. STACK (no negociable — es el probado)
═══════════════════════════════════════════════
- Frontend: SPA en **JavaScript vanilla** (sin frameworks ni build step). HTML + 3 CSS + módulos JS.
  Se sirve como estáticos en **Cloudflare Workers**, proyecto/worker llamado **doctorprogt**
  (`npx wrangler deploy`, package.json script "deploy"; name: "doctorprogt" en wrangler.toml).
- Backend: **Supabase** — crea un proyecto NUEVO (independiente del de TallerPro), p.ej.
  "doctorprogt". Postgres con **RLS multi-tenant estricto**, Auth (email+password),
  Edge Functions (Deno), Storage (respaldos, fotos clínicas, adjuntos de laboratorio),
  pg_cron + pg_net (tareas programadas), Vault (secretos cron).
- Email transaccional: **Resend** vía Edge Function `email-send` (secrets RESEND_API_KEY, EMAIL_FROM).
- IA: asistente con personalidad del vertical, nombre **"Vita"** (asistente de la clínica,
  tono profesional/cálido en español de Guatemala), vía Edge `ai-assistant` proxy a la API
  de Anthropic, modelo **claude-haiku-4-5** (barato), gateado por plan con tope mensual
  de consultas. Conocimiento: dudas administrativas de la clínica, redacción de indicaciones
  al paciente, recordatorios — NUNCA sustituye criterio médico ni da diagnósticos.
- Anti-bots: **Cloudflare Turnstile** en el registro público.
- Migraciones SQL numeradas en `db/migrations/NNN_nombre.sql`, aplicadas vía MCP de Supabase,
  y SIEMPRE guardadas también como archivo en el repo.

═══════════════════════════════════════════════
3. ARQUITECTURA DEL FRONTEND (calcar)
═══════════════════════════════════════════════
Estructura:
  index.html               ← carga TODOS los <script> (cada módulo nuevo se registra aquí)
  pos.html                  ← venta de mostrador (dermocosméticos), abre en pestaña nueva
  css/base.css             ← temas (8 paletas con variables CSS), animaciones, scrollbars, utilidades
  css/layout.css           ← login, sidebar (grupos + subnav), page-header/body, responsive móvil
  css/components.css       ← botones, cards, kpi-cards, tablas (con sorter), forms, modal, tabs, badges, toasts
  js/core/config.js        ← APP, ROLES, MODULOS (id/icon/label/grupo/subnav), GRUPOS, PERMISOS por rol,
                             PLANES comerciales, MODULOS_VENDIBLES, MODULOS_PRECIOS, helpers de gating
                             (modulosActivosTenant, moduloEnPlan, tieneAcceso, suscripcionVigente),
                             constantes del país (impuestos, prestaciones laborales), KPIS_POR_ROL
  js/core/db.js            ← capa de datos: TODOS los queries Supabase viven aquí como DB.métodos;
                             SIEMPRE filtrar .eq('tenant_id', getTID()); nunca queries sueltos en módulos
  js/core/auth.js          ← login/logout/crearUsuario (vía Edge), recuperación
  js/core/app.js           ← App.iniciar, sidebar por grupos con gating, navegarA/navegarSub,
                             RUTA PERSISTENTE en hash (#modulo/pestaña sobrevive refresh, validando acceso),
                             banner de suscripción, aviso de obligaciones al login, pantallaSuspendido
  js/core/ui.js            ← UI.modal/toast/confirmar/loading(spinner)/fileABase64(comprime imagen,
                             acepta pdf)/verAdjunto + SORTER UNIVERSAL de tablas (click en th de
                             .data-table ordena: montos, fechas dd/mm/yyyy, texto; columna de acciones
                             excluida; filas colspan al final) + boundary global de errores
  js/core/login.js         ← vistas login/registro(Turnstile + teléfono)/recovery(enlace O código OTP)
  js/modulos/<grupo>/<id>.js ← un archivo por módulo

Patrón de módulo (OBLIGATORIO, igual en todos):
  Modulos.<id> = {
    _tab: 'x', _datos: [],
    async render() { /* page-header + tabs + <div id="..."></div> */ this._renderTab(); },
    async _renderTab() { /* switch por this._tab; carga datos vía DB.*; pinta */ },
    modalX() { UI.modal(...) }, async guardarX() { ... }
  };
Acciones de fila: SIEMPRE Modulos.btnAccion('ver|editar|imprimir|eliminar', ...) y
Modulos.eliminarRegistro(tabla, id, descripcion, callback) — nunca ✕ ni texto suelto.
Listas: tabla .data-table dentro de .table-wrap (hereda marco y ordenamiento).
Todos los cálculos de negocio son MENSUALES salvo que el dominio diga otra cosa.

═══════════════════════════════════════════════
4. MULTI-TENANT + SEGURIDAD (reglas de oro)
═══════════════════════════════════════════════
- TODA tabla de negocio lleva tenant_id uuid NOT NULL + política RLS:
    CREATE POLICY tenant_isolation ON tabla FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
  con funciones current_tenant_id() (lee usuarios.tenant_id del auth.uid()) e is_superadmin()
  (email del superadmin o rol superadmin) como SECURITY DEFINER con search_path fijado.
- ⚠️ LECCIÓN: verifica que service_role tenga USAGE en schema public y GRANT ALL en tablas
  (un hardening lo puede romper y las Edge Functions fallan con 42501 en silencio).
- Edge Functions sensibles (crear usuarios, registro, reset): validan el JWT del llamante,
  su rol, y usan service role solo del lado servidor. Las llamadas de cron se autentican con
  un secreto en Vault leído vía RPC get_cron_secret (EXECUTE solo service_role).
- Todo usuario se crea con email Y teléfono VÁLIDOS (regex en la Edge): son los canales de recuperación.
- Recuperación de contraseña: enlace mágico de Supabase + OTP de 6 dígitos por email
  (hash sha256, 15 min, máx 5 intentos) vía Edge `recuperar-password`.
- DATOS CLÍNICOS SENSIBLES: además del aislamiento por tenant_id, restringe en la capa de
  permisos (PERMISOS por rol en config.js) que el expediente clínico completo (historia,
  diagnósticos, fotos, consentimientos) solo sea visible para roles médicos (médico,
  cirujano, enfermera); recepción/administración ven solo datos de agenda/facturación,
  no el contenido clínico. Refuerza esto también con políticas RLS por rol si el tiempo
  lo permite (no solo ocultar en el frontend).

═══════════════════════════════════════════════
5. CAPA COMERCIAL SaaS (idéntica, solo cambian precios/módulos)
═══════════════════════════════════════════════
- tenants: plan, modulos_activos jsonb (override a la carta; null=plan), precio_mensual,
  suscripcion_vence, ciclo_pago, active, notas_admin, ai_limite_mes.
- PLANES: básico/emprendedor, pro, empresarial + plan "A la Medida" (negociable: base del
  básico + módulos con precio individual en MODULOS_PRECIOS; el panel recalcula el precio al
  marcar módulos). CHECK constraint de tenants.plan debe incluir TODOS los valores.
- Gating: el sidebar y tieneAcceso() esconden módulos fuera del plan (aplica también al admin
  de la clínica); el superadmin ve todo; planes legacy/desconocidos no se bloquean.
- Panel Superadmin (módulo solo para mi rol): pestañas Clínicas (⚙️ plan/módulos/precio/vence/
  🎁 botón de gracia: resto del mes gratis + vence fin del mes siguiente / 💵 cobro / ⏸️ suspender),
  Cobros (MRR, cobrado/pendiente/sin cobrar del mes), Planes (tarjetas), Base de datos
  (respaldar/restaurar/borrar por tenant, igual que en TallerPro — replica TABLAS completo
  con TODAS las tablas con tenant_id en orden topológico de FKs).
- Registro público: Edge `registrar-taller` (renombrar conceptualmente a "registrar-clinica")
  con Turnstile (si TURNSTILE_SECRET falta, no bloquea), anti-duplicados, crea el tenant
  SUSPENDIDO ("Pendiente de aprobación") + email de aviso al superadmin; yo apruebo desde
  el panel (▶️). El RPC directo queda revocado.
- Trial: 30 días del plan más alto, el reloj ARRANCA EN EL PRIMER USO (no al registrarse):
  App._iniciarTrialSiAplica fija suscripcion_vence=hoy+30 con toast de bienvenida.
- Vencimiento: banner ≤7 días o vencida; recordatorios automáticos por email (Edge
  `saas-recordatorios`, cron diario: 7/3/1 días antes, hoy, mora 1/3/7 + resumen al superadmin);
  suspensión manual → pantallaSuspendido.
- Respaldos: Edge `backup-tenants` (cron diario) exporta TODAS las tablas con tenant_id de
  cada tenant a JSON en bucket privado 'backups' (retención 14) + bitácora tenant_backups +
  módulo Respaldos del cliente (descarga on-demand). Botones manuales en el panel SA.
  IMPORTANTE: define la lista de tablas completa desde el inicio (no la dejes incompleta
  como pasó en TallerPro — ahí faltaban 45 de 65 tablas y "borrar" no limpiaba inventario,
  empleados, capacitación, marketing, calendario ni configuración).
- Asistente IA "Vita" (personalidad experta del vertical, español de Guatemala):
  modos de chat con snapshot del negocio (filtrado por rol: datos clínicos solo a roles
  médicos, finanzas solo a roles altos), conocimiento administrativo de clínica, redacción;
  incluido en plan alto, add-on en los demás (módulo vendible 'ia'); tope mensual
  ai_limite_mes contando en ai_conversaciones (trial=50).

═══════════════════════════════════════════════
6. MÓDULOS BASE (vienen siempre, renombrando entidades)
═══════════════════════════════════════════════
- Dashboard con KPIs del mes navegable + accesos rápidos (citas del día, ingresos del
  mes, pacientes nuevos, procedimientos programados, insumos por vencer)
- Pacientes (CRM básico: ficha demográfica, contacto, alergias, antecedentes, seguro)
  y Expedientes clínicos (línea de tiempo del paciente)
- Consultas/Citas con estados tipo kanban/etapas (programada/confirmada/en consulta/
  atendida/cancelada/no-show), nota SOAP, items (procedimientos realizados), totales
- Inventario (insumos médicos y medicamentos: stock, mínimos, LOTES Y VENCIMIENTOS,
  movimientos con historial, baja automática al usar en consulta/procedimiento o vender)
- POS en pantalla aparte (pos.html, abre en pestaña nueva) para dermocosméticos de mostrador
- Proveedores + Compras (alimentan inventario y costos: insumos médicos, medicamentos)
- Facturación FEL + Bancos (cuentas, movimientos, conciliación con ingresos/egresos por
  triggers) + Finanzas (ingresos/egresos/estado de resultados, viáticos con comprobante
  por FOTO/cámara y desglose por tipo, gastos recurrentes) + Presupuesto
- Contabilidad/impuestos de Guatemala: hojas IVA SAT-2237/2046 con arrastre de remanente
  y fuente de crédito sistema-vs-FEL importado de SAT, ISR 1311 o trimestral 1361+ISO 1608
  con depreciación, libros de ventas/compras CSV, obligaciones con estado, calendario
  fiscal con IGSS·IRTRA·INTECAP el día 20, aviso al login ≤2 días del vencimiento
- RRHH: personal (médicos, enfermería, administrativo) con expediente de documentos con
  vencimiento (carnés, contratos, COLEGIADO ACTIVO de cada médico, certificaciones),
  nómina de Guatemala (IGSS 4.83/12.67, bonificación 250, ISR), planilla IGSS imprimible,
  productividad con KPIs POR ROL (ej. consultas atendidas, procedimientos realizados por
  médico, ocupación de agenda) + KPIs personalizados + dashboard por empleado con
  tendencia, bonos→egresos, capacitaciones con certificado adjunto, ASIGNACIONES de
  equipo médico/herramientas/vehículos/licencias con acta de entrega imprimible + firma
  digital del empleado con su usuario + fotos del estado (con cámara)
- Calendario con vistas Día/Semana/Mes + número de semana ISO, que agrega: citas,
  procedimientos/cirugías programados, disponibilidad de salas/quirófanos, pagos
  recurrentes, vencimientos fiscales (con estado), documentos por vencer (incluye
  colegiado activo de médicos y vencimiento de lotes de medicamentos)
- Marketing/fidelización (puntos, QR de feedback de satisfacción del paciente)
- Administración (info de la clínica + suscripción, backup/restore, logs de actividad
  por triggers), Configuración (datos del negocio + LOGO subible que aparece en sidebar
  y documentos/recetas), Usuarios (roles + permisos custom), Respaldos

═══════════════════════════════════════════════
7. PROCESO DE CONSTRUCCIÓN (en este orden, desplegando cada fase)
═══════════════════════════════════════════════
F1. Esqueleto: config/db/ui/app/login + CSS (copiar sistema de diseño) + auth multi-tenant
    + RLS + deploy pipeline funcionando (wrangler con worker "doctorprogt" + dominio).
    Crea el tenant inicial y el usuario superadmin (henry.chinchilla@gmail.com /
    Ericsson_123!, rol superadmin).
F2. Módulos core del vertical: pacientes, expedientes clínicos, citas/consultas (con
    nota SOAP), inventario de insumos/medicamentos con lotes y vencimientos.
F3. Dinero: facturación FEL, bancos, finanzas, compras.
F4. Módulos clínicos avanzados: procedimientos/cirugías con consentimiento informado
    digital y seguimiento postoperatorio, fotografías clínicas (antes/después),
    laboratorio, salas/quirófanos. Luego RRHH + productividad + contabilidad de Guatemala.
F5. Capa comercial SaaS completa (planes, panel SA con módulo Base de datos completo
    desde el inicio, registro+Turnstile+aprobación, trial, recordatorios, respaldos,
    IA "Vita" con gating).
F6. Pulido: sorter de tablas, ruta persistente, logo, calendario, cámara en adjuntos,
    comparador de fotos antes/después, POS de mostrador.

═══════════════════════════════════════════════
8. LECCIONES APRENDIDAS (errores que NO vas a repetir)
═══════════════════════════════════════════════
1. node --check de TODO archivo JS tocado ANTES de commit/deploy (un `await` en función no-async
   tumbó la app entera en producción).
2. El esquema y el código se desalinean: todo `.upsert(..., {onConflict})` exige un UNIQUE real;
   toda columna que el código escriba debe existir. Audita: llamadas DB.* vs definiciones,
   columnas vs information_schema, onConflict vs constraints.
3. Los CHECK constraints de valores (plan, estados) deben actualizarse cuando agregues valores nuevos.
4. PostgREST cachea el esquema: tras crear funciones RPC, NOTIFY pgrst,'reload schema'.
5. No mezclar dos sistemas de cobro (licencia vieja vs suscripción): UNA sola fuente de verdad.
6. Caches en localStorage (config fiscal) se vuelven rancios: provee una lectura "fresh" para
   pantallas que dependen de configuración crítica.
7. Errores silenciosos prohibidos: toda operación de guardado muestra el error real en toast,
   y window.unhandledrejection tiene boundary global.
8. Storage no permite DELETE por SQL (usa la API); pg_net no soporta SET SCHEMA (drop+create).
9. En cada lista: tabla ordenable, acciones consistentes, estados vacíos amables, fechas es-GT.
10. Mensajes de límite/bloqueo comerciales son oportunidades de venta: "pídelo a tu proveedor".
11. `const X = {...}` en scripts clásicos NO se cuelga de window: si algún código consulta
    `window.X` (helpers de config, gating), asigna EXPLÍCITAMENTE `window.X = X` al final del
    archivo.
12. Desde el día 1, la lista TABLAS de respaldo/borrado/restauración (backup-tenants,
    tenant-db-tools, exportarDatosTenant) debe incluir TODAS las tablas con tenant_id en
    orden topológico de FKs (padres antes que hijos para insertar, reverso para borrar), y
    manejar aparte cualquier tabla sin tenant_id propio (ej. detalle de entradas). No la
    dejes corta "para después": en TallerPro causó que "borrar base de datos" dejara
    intactos módulos enteros.

═══════════════════════════════════════════════
9. SECRETS QUE YO CONFIGURO (recuérdamelos al final de F5)
═══════════════════════════════════════════════
Supabase Edge secrets: RESEND_API_KEY, EMAIL_FROM, ANTHROPIC_API_KEY, TURNSTILE_SECRET
config.js: TURNSTILE_SITE_KEY · Cloudflare: widget Turnstile con los dominios de doctorprogt.

Empieza por la sección 0 (permisos) y luego la F1. Si algo bloqueante no está claro
(ej. dominio final, color/paleta de marca), pregúntalo; el resto ya está definido —
no te detengas a pedir confirmaciones de proceso.
```

---

## Notas para Henry (fuera del prompt)

- **Supuestos que hice** (dime si cambian): proyecto Supabase nuevo e independiente
  del de TallerPro, llamado "doctorprogt"; worker de Cloudflare también "doctorprogt";
  asistente IA se llama "Vita" (puedes pedir que lo rebauticen en F5, es trivial).
- **Lo que NO se copia entre verticales:** las fórmulas del dominio (KPIs de taller,
  hora-hombre) — para clínica se rediseñan como ocupación de agenda, consultas/
  procedimientos por médico, etc.
- **Lo que se copia tal cual:** todo el bloque Guatemala (SAT, IGSS, nómina) — clínica
  lo usa igual que taller.
- **Dato sensible**: el prompt incluye la contraseña inicial del superadmin en texto
  plano (Ericsson_123!) para que el agente cree la cuenta en F1 — cámbiala apenas
  tengas acceso al nuevo sistema.
