# 🏭 PROMPT MAESTRO — Fábrica de SaaS verticales (base TallerPro Enterprise)

> **Cómo usarlo:** copia TODO lo que está dentro del bloque de abajo en una sesión
> nueva de Claude Code (en una carpeta vacía), rellena los `{{PLACEHOLDERS}}` de la
> sección 1, y deja que construya por fases. Cada `{{...}}` que no llenes, el agente
> debe preguntártelo antes de empezar.

---

```
Eres mi socio técnico y vas a construir un SaaS multi-tenant COMPLETO e ir desplegándolo
a producción por fases. Ya construimos juntos uno igual (TallerPro Enterprise, gestión de
talleres automotrices en Guatemala) y este prompt destila su arquitectura, convenciones y
lecciones. NO experimentes con otra arquitectura: replica esta, cambiando solo el dominio.

═══════════════════════════════════════════════
1. EL PRODUCTO (rellenar antes de empezar)
═══════════════════════════════════════════════
- Nombre del producto: {{NOMBRE_APP}}            (ej. ClinicPro, PanPro, FerrePro)
- Vertical: {{VERTICAL}}                          (ej. clínicas médicas / panaderías / ferreterías)
- Cliente que paga: {{QUIEN_PAGA}}                (ej. el médico dueño de la clínica)
- Entidad "cliente final": {{ENTIDAD_CLIENTE}}    (taller→cliente; clínica→paciente; ferretería→cliente)
- Entidad "objeto de trabajo": {{ENTIDAD_OBJETO}} (taller→vehículo; clínica→expediente/consulta; panadería→pedido/receta)
- Documento operativo central: {{DOC_CENTRAL}}    (taller→orden de trabajo; clínica→consulta/cita; ferretería→venta/cotización)
- País y fiscalidad: {{PAIS}}                     (si es Guatemala, reutilizar TODO el bloque SAT/IGSS tal cual)
- Roles del equipo del cliente: {{ROLES}}         (ej. médico, enfermera, recepcionista, contador...)
- Módulos del vertical (los que NO trae la base): {{MODULOS_VERTICALES}}
  (ej. clínica: expedientes, recetas, historial clínico, citas con agenda por médico, laboratorio;
   panadería: producción/recetas, mermas, pedidos mayoristas, ruta de reparto;
   ferretería: cotizaciones, despachos, crédito de clientes, múltiples listas de precio)
- Mi identidad: superadmin = {{TU_EMAIL}}; yo soy el dueño del SaaS y vendo suscripciones.
- Moneda y país de los montos: {{MONEDA}} (Q en Guatemala).

═══════════════════════════════════════════════
2. STACK (no negociable — es el probado)
═══════════════════════════════════════════════
- Frontend: SPA en **JavaScript vanilla** (sin frameworks ni build step). HTML + 3 CSS + módulos JS.
  Se sirve como estáticos en **Cloudflare Workers** (`npx wrangler deploy`, package.json script "deploy").
- Backend: **Supabase** — Postgres con **RLS multi-tenant estricto**, Auth (email+password),
  Edge Functions (Deno), Storage (respaldos), pg_cron + pg_net (tareas programadas), Vault (secretos cron).
- Email transaccional: **Resend** vía Edge Function `email-send` (secrets RESEND_API_KEY, EMAIL_FROM).
- IA: asistente con personalidad del vertical vía Edge `ai-assistant` proxy a la API de Anthropic,
  modelo **claude-haiku-4-5** (barato), gateado por plan con tope mensual de consultas.
- Anti-bots: **Cloudflare Turnstile** en el registro público.
- Migraciones SQL numeradas en `db/migrations/NNN_nombre.sql`, aplicadas vía MCP de Supabase,
  y SIEMPRE guardadas también como archivo en el repo.

═══════════════════════════════════════════════
3. ARQUITECTURA DEL FRONTEND (calcar)
═══════════════════════════════════════════════
Estructura:
  index.html               ← carga TODOS los <script> (cada módulo nuevo se registra aquí)
  pos.html / otras pantallas independientes (si aplica)
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

═══════════════════════════════════════════════
5. CAPA COMERCIAL SaaS (idéntica, solo cambian precios/módulos)
═══════════════════════════════════════════════
- tenants: plan, modulos_activos jsonb (override a la carta; null=plan), precio_mensual,
  suscripcion_vence, ciclo_pago, active, notas_admin, ai_limite_mes.
- PLANES: básico/emprendedor, pro, empresarial + plan "A la Medida" (negociable: base del
  básico + módulos con precio individual en MODULOS_PRECIOS; el panel recalcula el precio al
  marcar módulos). CHECK constraint de tenants.plan debe incluir TODOS los valores.
- Gating: el sidebar y tieneAcceso() esconden módulos fuera del plan (aplica también al admin
  del taller); el superadmin ve todo; planes legacy/desconocidos no se bloquean.
- Panel Superadmin (módulo solo para mi rol): pestañas Talleres (⚙️ plan/módulos/precio/vence/
  🎁 botón de gracia: resto del mes gratis + vence fin del mes siguiente / 💵 cobro / ⏸️ suspender),
  Cobros (MRR, cobrado/pendiente/sin cobrar del mes), Planes (tarjetas).
- Registro público: Edge `registrar-taller` con Turnstile (si TURNSTILE_SECRET falta, no bloquea),
  anti-duplicados, crea el tenant SUSPENDIDO ("Pendiente de aprobación") + email de aviso al
  superadmin; yo apruebo desde el panel (▶️). El RPC directo queda revocado.
- Trial: 30 días del plan más alto, el reloj ARRANCA EN EL PRIMER USO (no al registrarse):
  App._iniciarTrialSiAplica fija suscripcion_vence=hoy+30 con toast de bienvenida.
- Vencimiento: banner ≤7 días o vencida; recordatorios automáticos por email (Edge
  `saas-recordatorios`, cron diario: 7/3/1 días antes, hoy, mora 1/3/7 + resumen al superadmin);
  suspensión manual → pantallaSuspendido.
- Respaldos: Edge `backup-tenants` (cron diario) exporta las tablas de cada tenant a JSON en
  bucket privado 'backups' (retención 14) + bitácora tenant_backups + módulo Respaldos del cliente
  (descarga on-demand). Botones manuales en el panel SA.
- Asistente IA "{{NOMBRE_ASISTENTE}}" (personalidad experta del vertical, español local):
  modos de chat con snapshot del negocio (filtrado por rol: finanzas solo a roles altos),
  conocimiento técnico del dominio, redacción; incluido en plan alto, add-on en los demás
  (módulo vendible 'ia'); tope mensual ai_limite_mes contando en ai_conversaciones (trial=50).

═══════════════════════════════════════════════
6. MÓDULOS BASE (vienen siempre, renombrando entidades)
═══════════════════════════════════════════════
- Dashboard con KPIs del mes navegable + accesos rápidos
- {{ENTIDAD_CLIENTE}}s (CRM básico) y {{ENTIDAD_OBJETO}}s
- {{DOC_CENTRAL}} con estados tipo kanban/etapas, items, totales
- Inventario (stock, mínimos, movimientos con historial, baja automática al facturar/vender)
- POS en pantalla aparte (pos.html, abre en pestaña nueva) si el vertical vende mostrador
- Proveedores + Compras (alimentan inventario y costos)
- Facturación {{FEL_O_EQUIVALENTE}} + Bancos (cuentas, movimientos, conciliación con
  ingresos/egresos por triggers) + Finanzas (ingresos/egresos/estado de resultados, viáticos
  con comprobante por FOTO/cámara y desglose por tipo, gastos recurrentes) + Presupuesto
- Contabilidad/impuestos del país (si {{PAIS}}=Guatemala: hojas IVA SAT-2237/2046 con arrastre
  de remanente y fuente de crédito sistema-vs-FEL importado de SAT, ISR 1311 o trimestral
  1361+ISO 1608 con depreciación, libros de ventas/compras CSV, obligaciones con estado,
  calendario fiscal con IGSS·IRTRA·INTECAP el día 20, aviso al login ≤2 días del vencimiento)
- RRHH: empleados con expediente de documentos con vencimiento (carnés, contratos...),
  nómina del país (GT: IGSS 4.83/12.67, bonificación 250, ISR), planilla IGSS imprimible,
  productividad con KPIs POR ROL + KPIs personalizados + dashboard por empleado con tendencia,
  bonos→egresos, capacitaciones con certificado adjunto, ASIGNACIONES de herramientas/equipo/
  vehículos/licencias con acta de entrega imprimible + firma digital del empleado con su usuario
  + fotos del estado (con cámara)
- Calendario con vistas Día/Semana/Mes + número de semana ISO, que agrega: citas, pagos
  recurrentes, envíos, vencimientos fiscales (con estado), documentos por vencer
- Marketing/fidelización (puntos, QR de feedback) si aplica al vertical
- Administración (info del taller + suscripción, backup/restore, logs de actividad por triggers),
  Configuración (datos del negocio + LOGO subible que aparece en sidebar y documentos),
  Usuarios (roles + permisos custom), Respaldos

═══════════════════════════════════════════════
7. PROCESO DE CONSTRUCCIÓN (en este orden, desplegando cada fase)
═══════════════════════════════════════════════
F1. Esqueleto: config/db/ui/app/login + CSS (copiar sistema de diseño) + auth multi-tenant
    + RLS + deploy pipeline funcionando (wrangler + dominio).
F2. Módulos core del vertical ({{ENTIDAD_CLIENTE}}, {{ENTIDAD_OBJETO}}, {{DOC_CENTRAL}}, inventario).
F3. Dinero: facturación, bancos, finanzas, compras.
F4. RRHH + productividad + contabilidad del país.
F5. Capa comercial SaaS completa (planes, panel SA, registro+Turnstile+aprobación, trial,
    recordatorios, respaldos, IA con gating).
F6. Pulido: sorter de tablas, ruta persistente, logo, calendario, cámara en adjuntos.

═══════════════════════════════════════════════
8. LECCIONES APRENDIDAS (errores que NO vas a repetir)
═══════════════════════════════════════════════
1. node --check de TODO archivo JS tocado ANTES de commit/deploy (un `await` en función no-async
   tumbó la app entera en producción).
2. El esquema y el código se desalinean: todo `.upsert(..., {onConflict})` exige un UNIQUE real;
   toda columna que el código escriba debe existir (los viáticos estuvieron rotos meses por esto).
   Audita: llamadas DB.* vs definiciones, columnas vs information_schema, onConflict vs constraints.
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

═══════════════════════════════════════════════
9. SECRETS QUE YO CONFIGURO (recuérdamelos al final de F5)
═══════════════════════════════════════════════
Supabase Edge secrets: RESEND_API_KEY, EMAIL_FROM, ANTHROPIC_API_KEY, TURNSTILE_SECRET
config.js: TURNSTILE_SITE_KEY · Cloudflare: widget Turnstile con los dominios del producto.

Empieza por la F1. Pregúntame los {{PLACEHOLDERS}} que falten antes de escribir código.
Despliega cada fase, verifica con datos reales, y avísame qué probar.
```

---

## Notas para Henry (fuera del prompt)

- **Lo que NO se copia entre verticales:** las fórmulas del dominio (hora-hombre de mecánicos,
  KPIs de taller) — el prompt instruye a rediseñarlas por rol del vertical nuevo.
- **Lo que se copia tal cual:** todo el bloque Guatemala (SAT, IGSS, nómina) sirve para
  CUALQUIER vertical guatemalteco — clínica, panadería y ferretería declaran igual.
- **Atajo opcional:** en lugar de carpeta vacía, puedes clonar este repo y decirle al agente
  "usa este código como base, transforma al vertical X con este prompt" — más rápido aún,
  pero revisa que renombre entidades a fondo (clientes→pacientes en UI, no en tablas).
