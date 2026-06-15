// ═══════════════════════════════════════════════════════
// Edge Function: backup-tenants
// Respaldo automático de TODOS los talleres activos a Storage.
//
// Por cada tenant activo exporta sus tablas a un JSON, lo sube al
// bucket privado 'backups' (backups/<tenant_id>/<fecha>.json),
// registra el respaldo en tenant_backups (tipo 'automatico') y
// conserva solo los últimos RETENCION archivos por taller.
//
// Quién puede llamarla (verify_jwt=false, auth propia):
//   • pg_cron diario → header  x-cron-secret  (vive en Vault,
//     se lee vía RPC get_cron_secret con service role)
//   • superadmin desde el panel SaaS → JWT normal
//
// Body opcional: { tenant_id } para respaldar solo un taller.
//
// Deploy:  supabase functions deploy backup-tenants --no-verify-jwt
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const RETENCION = 14; // respaldos por taller que se conservan en Storage
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function esLlamadaAutorizada(req: Request, admin: any, url: string, anonKey: string): Promise<boolean> {
  // 1) cron con secreto compartido (Vault)
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data } = await admin.rpc("get_cron_secret");
    if (data && cronSecret === data) return true;
  }
  // 2) superadmin con su sesión
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

async function respaldarTenant(admin: any, tenant: any) {
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
    tipo: "automatico",
    tablas: meta,
    total_registros: registros,
  };

  const cuerpo = JSON.stringify(dump);
  const kb = Math.round(cuerpo.length / 1024);
  const fecha = new Date().toISOString().slice(0, 10);
  const path = `${tenant.id}/${fecha}.json`;

  const { error: upErr } = await admin.storage.from("backups")
    .upload(path, new Blob([cuerpo], { type: "application/json" }), {
      upsert: true, contentType: "application/json",
    });
  if (upErr) throw new Error(`Storage: ${upErr.message}`);

  await admin.from("tenant_backups").insert({
    tenant_id: tenant.id,
    tipo: "automatico",
    tablas: TABLAS.length,
    registros,
    tamano_kb: kb,
    creado_por: "sistema (cron)",
    notas: `Storage: backups/${path}`,
  });

  // Retención: conservar solo los últimos RETENCION archivos del taller
  try {
    const { data: archivos } = await admin.storage.from("backups")
      .list(tenant.id, { limit: 100, sortBy: { column: "name", order: "desc" } });
    const viejos = (archivos ?? []).slice(RETENCION).map((a: any) => `${tenant.id}/${a.name}`);
    if (viejos.length) await admin.storage.from("backups").remove(viejos);
  } catch (_) { /* la retención no debe tumbar el respaldo */ }

  return { tenant: tenant.name ?? tenant.slug, registros, kb };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, serviceKey);

  if (!(await esLlamadaAutorizada(req, admin, url, anonKey))) {
    return json({ error: "No autorizado" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* body vacío permitido */ }

  let q = admin.from("tenants").select("id, slug, name, active");
  if (body?.tenant_id) q = q.eq("id", body.tenant_id);
  const { data: tenants, error: tErr } = await q;
  if (tErr) return json({ error: tErr.message }, 500);

  const activos = (tenants ?? []).filter((t: any) => t.active !== false);
  const resultados: any[] = [];
  const errores: any[] = [];

  for (const t of activos) {
    try { resultados.push(await respaldarTenant(admin, t)); }
    catch (e: any) { errores.push({ tenant: t.name ?? t.slug, error: e?.message }); }
  }

  return json({
    ok: errores.length === 0,
    talleres: resultados.length,
    registros: resultados.reduce((s, r) => s + r.registros, 0),
    detalle: resultados,
    ...(errores.length ? { errores } : {}),
  });
});
