// ═══════════════════════════════════════════════════════
// Edge Function: tenant-db-tools
// Herramientas de alto riesgo para UN taller — solo superadmin.
//
//   op:'listar'    → lista los respaldos en Storage (backups/<tenant_id>/*)
//                     con URL firmada de descarga (5 min).
//   op:'restaurar' → respaldo silencioso del estado actual, luego
//                     sobrescribe las tablas del taller con el contenido
//                     del respaldo indicado (path).
//   op:'borrar'    → respaldo silencioso del estado actual, luego borra
//                     TODAS las filas del taller en TABLAS.
//
// Body: { op, tenant_id, path? }
//
// Deploy:  supabase functions deploy tenant-db-tools --no-verify-jwt
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPERADMIN_EMAIL = "henry.chinchilla@gmail.com";

/* Tablas con tenant_id, en orden de inserción (padres antes que hijos según
   sus llaves foráneas). Para borrar se recorre en reversa (hijos primero).
   'entradas_detalle' no tiene tenant_id (depende de entradas_inventario) y
   se respalda/restaura por separado. */
const TABLAS = [
  // sin dependencias de otras tablas del tenant
  "clientes", "proveedores", "bodegas", "bancos", "combos", "vacantes", "documentos",
  "tenant_users", "retenciones", "licencias", "mensajes", "obligaciones_fiscales",
  "presupuesto", "fel_importados", "egresos_recurrentes", "config_fiscal",
  "config_integraciones", "config_productividad", "activos", "actividad_log",
  "ai_conversaciones", "documentos_empresa", "usuarios",
  // dependen solo de la capa anterior
  "vehiculos", "empleados", "inventario", "compras", "entradas_inventario", "egresos",
  "promociones", "aplicantes", "puntos_movimientos", "feedback",
  // dependen de empleados/inventario/etc.
  "ordenes", "compra_items", "inv_movimientos", "inventario_movimientos", "asistencia",
  "disciplina", "empleado_asignaciones", "empleado_documentos", "entrenamientos",
  "horas_extra", "kpi_empleado", "liquidaciones", "llamadas_atencion", "nomina",
  "pagos_nomina", "vacaciones_movimientos", "viaticos",
  // dependen de ordenes
  "citas", "facturas", "cuentas_cobrar", "ot_items", "ot_repuestos", "ot_servicios",
  "trabajos_externos",
  // dependen de facturas/ordenes
  "factura_items", "ingresos", "abonos", "envios",
  // dependen de ingresos/egresos/envios
  "banco_movimientos", "traslados",
  // dependen de traslados
  "traslado_items",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function esSuperadmin(req: Request, admin: any, url: string, anonKey: string): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return false;
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asCaller.auth.getUser(token);
  const user = userData?.user;
  if (!user) return false;
  if (user.email === SUPERADMIN_EMAIL) return true;
  const { data: perfil } = await admin.from("usuarios").select("rol").eq("id", user.id).maybeSingle();
  return perfil?.rol === "superadmin";
}

/* Respaldo silencioso de seguridad antes de restaurar/borrar.
   No aplica retención (son archivos de seguridad puntuales). */
async function respaldoSilencioso(admin: any, tenant: any, tipo: string) {
  const dump: Record<string, unknown> = {};
  const meta: Record<string, number> = {};
  let registros = 0;

  for (const t of TABLAS) {
    try {
      const { data, error } = await admin.from(t).select("*").eq("tenant_id", tenant.id);
      if (error) { dump[t] = []; meta[t] = 0; continue; }
      dump[t] = data ?? [];
      meta[t] = (data ?? []).length;
      registros += (data ?? []).length;
    } catch (_) { dump[t] = []; meta[t] = 0; }
  }

  /* entradas_detalle no tiene tenant_id: depende de entradas_inventario */
  try {
    const ids = ((dump["entradas_inventario"] as any[]) || []).map((r: any) => r.id);
    let detalle: any[] = [];
    if (ids.length) {
      const { data } = await admin.from("entradas_detalle").select("*").in("entrada_id", ids);
      detalle = data ?? [];
    }
    dump["entradas_detalle"] = detalle;
    meta["entradas_detalle"] = detalle.length;
    registros += detalle.length;
  } catch (_) { dump["entradas_detalle"] = []; meta["entradas_detalle"] = 0; }

  dump._meta = {
    tenant_id: tenant.id,
    taller: tenant.name ?? tenant.slug,
    generado: new Date().toISOString(),
    tipo,
    tablas: meta,
    total_registros: registros,
  };

  const cuerpo = JSON.stringify(dump);
  const kb = Math.round(cuerpo.length / 1024);
  const sello = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${tenant.id}/${tipo}_${sello}.json`;

  const { error: upErr } = await admin.storage.from("backups")
    .upload(path, new Blob([cuerpo], { type: "application/json" }), {
      upsert: true, contentType: "application/json",
    });
  if (upErr) throw new Error(`Storage: ${upErr.message}`);

  await admin.from("tenant_backups").insert({
    tenant_id: tenant.id,
    tipo,
    tablas: TABLAS.length,
    registros,
    tamano_kb: kb,
    creado_por: "sistema (seguridad)",
    notas: `Storage: backups/${path}`,
  });

  return { path, registros, kb };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, serviceKey);

  if (!(await esSuperadmin(req, admin, url, anonKey))) {
    return json({ error: "No autorizado" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* body vacío */ }

  const { op, tenant_id, path } = body;
  if (!tenant_id) return json({ error: "Falta tenant_id" }, 400);

  const { data: tenant, error: tErr } = await admin.from("tenants")
    .select("id, slug, name").eq("id", tenant_id).maybeSingle();
  if (tErr) return json({ error: tErr.message }, 500);
  if (!tenant) return json({ error: "Taller no encontrado" }, 404);

  if (op === "listar") {
    const { data: archivos, error: lErr } = await admin.storage.from("backups")
      .list(tenant_id, { limit: 100, sortBy: { column: "name", order: "desc" } });
    if (lErr) return json({ error: lErr.message }, 500);

    const backups = [];
    for (const a of archivos ?? []) {
      if (!a.name.endsWith(".json")) continue;
      const { data: signed } = await admin.storage.from("backups")
        .createSignedUrl(`${tenant_id}/${a.name}`, 300);
      backups.push({
        nombre: a.name,
        tamano: a.metadata?.size ?? null,
        url: signed?.signedUrl ?? null,
      });
    }
    return json({ ok: true, backups });
  }

  if (op === "restaurar") {
    if (!path) return json({ error: "Falta path del respaldo" }, 400);
    const { data: file, error: dErr } = await admin.storage.from("backups").download(path);
    if (dErr) return json({ error: "No se pudo leer el respaldo: " + dErr.message }, 500);

    let dump: any;
    try { dump = JSON.parse(await file.text()); }
    catch (e: any) { return json({ error: "Respaldo inválido: " + e.message }, 400); }

    /* Respaldo de seguridad del estado actual antes de sobrescribir */
    await respaldoSilencioso(admin, tenant, "pre_restauracion");

    const tablasDump = TABLAS.filter((t) => Object.prototype.hasOwnProperty.call(dump, t));
    const tieneDetalle = Array.isArray(dump["entradas_detalle"]);

    /* Borrar en orden inverso (hijos primero). entradas_detalle se borra en
       cascada al borrar entradas_inventario (no tiene tenant_id propio). */
    for (const t of [...tablasDump].reverse()) {
      await admin.from(t).delete().eq("tenant_id", tenant_id);
    }

    /* Reasignar tenant_id por si el respaldo es de otro taller (recuperación
       restaurando en un taller recién creado) */
    const remapTenant = (rows: any[]) =>
      rows.map((r: any) => (r && typeof r === "object" && "tenant_id" in r) ? { ...r, tenant_id } : r);

    let registros = 0;
    const errores: any[] = [];
    for (const t of tablasDump) {
      const rows = remapTenant(Array.isArray(dump[t]) ? dump[t] : []);
      if (!rows.length) continue;
      const { error } = await admin.from(t).insert(rows);
      if (error) errores.push({ tabla: t, error: error.message });
      else registros += rows.length;
    }

    /* entradas_detalle al final, depende de entradas_inventario ya restaurado */
    if (tieneDetalle) {
      const rows = dump["entradas_detalle"] as any[];
      if (rows.length) {
        const { error } = await admin.from("entradas_detalle").insert(rows);
        if (error) errores.push({ tabla: "entradas_detalle", error: error.message });
        else registros += rows.length;
      }
    }

    return json({ ok: errores.length === 0, tablas: tablasDump.length + (tieneDetalle ? 1 : 0), registros, ...(errores.length ? { errores } : {}) });
  }

  if (op === "borrar") {
    /* Respaldo de seguridad del estado actual antes de borrar */
    await respaldoSilencioso(admin, tenant, "pre_borrado");

    let registros_eliminados = 0;
    const errores: any[] = [];
    for (const t of [...TABLAS].reverse()) {
      const { data, error } = await admin.from(t).delete().eq("tenant_id", tenant_id).select("id");
      if (error) errores.push({ tabla: t, error: error.message });
      else registros_eliminados += (data ?? []).length;
    }

    return json({ ok: errores.length === 0, registros_eliminados, ...(errores.length ? { errores } : {}) });
  }

  return json({ error: "Operación inválida" }, 400);
});
