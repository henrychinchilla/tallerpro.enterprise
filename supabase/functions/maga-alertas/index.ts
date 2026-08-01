// ═══════════════════════════════════════════════════════
// Edge Function: maga-alertas
// Avisa por correo, una vez al mes, qué productos seguidos entraron en su
// ventana de compra o de venta.
//
// Por qué existe: la ventana dura semanas y se pasa. Si hay que acordarse de
// abrir la pantalla, el análisis no sirve de nada.
//
// Usa los MISMOS umbrales que la app (vía maga_alertas_ventana) para que el
// correo nunca diga algo que la pantalla contradiga.
//
// Quién puede llamarla (verify_jwt=false, auth propia):
//   • pg_cron mensual → header x-cron-secret (Vault)
//   • admin desde la app → su JWT
//
// Body opcional:
//   { mes: 1..12 }        mes a evaluar (por defecto, el actual)
//   { dry_run: true }     arma los correos y los devuelve SIN enviarlos
//   { to_prueba: "..." }  manda todo a esa dirección en vez de a la del
//                         comercio, para probar el correo real sin escribirle
//                         a un cliente. Se registra en la respuesta.
//
// Deploy: supabase functions deploy maga-alertas --no-verify-jwt
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPERADMIN_EMAIL = "henry.chinchilla@gmail.com";
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
               "agosto","septiembre","octubre","noviembre","diciembre"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function autorizada(req: Request, admin: any, url: string, anonKey: string) {
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data } = await admin.rpc("get_cron_secret");
    if (data && secret === data) return true;
  }
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  if (!token) return false;
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: u } = await caller.auth.getUser(token);
  if (!u?.user) return false;
  if (u.user.email === SUPERADMIN_EMAIL) return true;
  const { data: perfil } = await admin.from("usuarios").select("rol").eq("id", u.user.id).maybeSingle();
  return perfil?.rol === "superadmin" || perfil?.rol === "admin";
}

const esc = (t: unknown) =>
  String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function nombresMeses(ms: number[] | null) {
  return (ms || []).map((m) => MESES[m - 1]).join(", ");
}

function armarHTML(nombreComercio: string, mes: number, filas: any[]) {
  const compra = filas.filter((f) => f.tipo === "compra");
  const venta = filas.filter((f) => f.tipo === "venta");
  const bloque = (titulo: string, lista: any[], color: string, verbo: string) =>
    !lista.length ? "" : `
      <h3 style="font-size:15px;margin:18px 0 6px;color:${color}">${titulo}</h3>
      ${lista.map((f) => `
        <div style="border-left:3px solid ${color};padding:8px 12px;margin-bottom:8px;background:#f6f8fa">
          <div style="font-weight:700;font-size:14px">${esc(f.producto)}</div>
          <div style="font-size:12px;color:#57606a">${esc(f.medida)}</div>
          <div style="font-size:13px;margin-top:4px">
            Suele estar ${verbo} en <b>${esc(nombresMeses(f.tipo === "compra" ? f.meses_baratos : f.meses_caros))}</b>.
            Brecha histórica <b>${Number(f.brecha).toFixed(0)}%</b> entre su mes más caro y el más barato.
          </div>
        </div>`).join("")}`;

  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:620px;color:#1f2328">
    <h2 style="font-size:18px;margin:0 0 4px">Ventanas de ${MESES[mes - 1]}</h2>
    <p style="font-size:13px;color:#57606a;margin:0 0 8px">
      ${esc(nombreComercio)} — productos que seguís y que este mes están en su piso o en su pico,
      según la serie del MAGA de los últimos 5 años.
    </p>
    ${bloque("🟢 En su mes barato — conviene comprar", compra, "#1a7f37", "barato")}
    ${bloque("🔴 En su mes caro — conviene vender", venta, "#cf222e", "caro")}
    <p style="font-size:11.5px;color:#57606a;margin-top:18px;border-top:1px solid #d0d7de;padding-top:10px">
      Esto describe lo que ha pasado en años anteriores, no un pronóstico: una sequía o un cambio
      en las importaciones rompe cualquier patrón. Solo se avisa de productos cuya brecha supera el
      20% y cuyo patrón se repite entre años.
    </p>
  </div>`;
}

/* ── RESUMEN DIARIO DE OPORTUNIDADES ───────────────────────────
   La alerta mensual mira estacionalidad (qué mes suele ser barato). Esto mira
   HOY: qué se movió contra su propio promedio y dónde el mismo producto está
   más barato en un mercado que en el otro.

   El destinatario es del CLIENTE, no una casilla nuestra: sale de
   tenants.email_reporte_maga y, si está vacío, del correo del comercio. Sólo
   se le manda a quien lo activó (reporte_maga_diario). */
function fmtQ(n: any) {
  const v = Number(n);
  return isFinite(v) ? "Q" + v.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

function armarHTMLDiario(nombreComercio: string, fecha: string, filas: any[], seguidos: Set<number>) {
  const compra = filas.filter((f) => f.tipo === "compra");
  const venta = filas.filter((f) => f.tipo === "venta");
  const brecha = filas.filter((f) => f.tipo === "brecha");

  const estrella = (f: any) => (seguidos.has(f.producto_id) ? ' <span title="lo seguís">⭐</span>' : "");

  const bloqueVar = (titulo: string, lista: any[], color: string, texto: (f: any) => string) =>
    !lista.length ? "" : `
      <h3 style="font-size:15px;margin:18px 0 6px;color:${color}">${titulo}</h3>
      ${lista.map((f) => `
        <div style="border-left:3px solid ${color};padding:8px 12px;margin-bottom:8px;background:#f6f8fa">
          <div style="font-weight:700;font-size:14px">${esc(f.producto)}${estrella(f)}</div>
          <div style="font-size:12px;color:#57606a">${esc(f.medida)} · ${esc(f.mercado)}</div>
          <div style="font-size:13px;margin-top:4px">${texto(f)}</div>
        </div>`).join("")}`;

  const cuerpo = [
    bloqueVar("🟢 Más barato que de costumbre — conviene comprar", compra, "#1a7f37",
      (f) => `Hoy <b>${fmtQ(f.precio)}</b>, un <b>${Math.abs(Number(f.variacion)).toFixed(1)}% por debajo</b>
              de su promedio (${fmtQ(f.referencia)}, serie ${esc(f.origen_ref)}).`),
    bloqueVar("🔴 Más caro que de costumbre — conviene vender", venta, "#cf222e",
      (f) => `Hoy <b>${fmtQ(f.precio)}</b>, un <b>${Number(f.variacion).toFixed(1)}% por encima</b>
              de su promedio (${fmtQ(f.referencia)}, serie ${esc(f.origen_ref)}).`),
    bloqueVar("🔵 Diferencia entre mercados — comprá donde está barato", brecha, "#0969da",
      (f) => `<b>${fmtQ(f.precio)}</b> en ${esc(f.mercado)} contra <b>${fmtQ(f.referencia)}</b> en el otro mercado:
              <b>${Math.abs(Number(f.variacion)).toFixed(1)}% de diferencia</b> el mismo día.`),
  ].join("");

  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:620px;color:#1f2328">
    <h2 style="font-size:18px;margin:0 0 4px">Oportunidades del ${esc(fecha)}</h2>
    <p style="font-size:13px;color:#57606a;margin:0 0 8px">
      ${esc(nombreComercio)} — precios mayoristas de La Terminal y el CENMA publicados por el MAGA.
      Los marcados con ⭐ son los que seguís.
    </p>
    ${cuerpo || '<p style="font-size:13px">Hoy no hubo movimientos que valga la pena avisar.</p>'}
    <p style="font-size:11.5px;color:#57606a;margin-top:18px;border-top:1px solid #d0d7de;padding-top:10px">
      Son precios de referencia mayorista del MAGA, no cotizaciones: sirven para decidir a quién
      llamar, no para cerrar el trato sin confirmar. Cuando la serie diaria todavía es corta, la
      comparación se hace contra el promedio mensual — eso lo dice cada línea.
    </p>
  </div>`;
}

async function resumenDiario(admin: any, body: any, apiKey: string | undefined, FROM: string) {
  const dryRun = body.dry_run === true;
  const toPrueba = typeof body.to_prueba === "string" && body.to_prueba.includes("@")
    ? body.to_prueba.trim() : null;

  const { data: filas, error } = await admin.rpc("maga_oportunidades_diarias", {
    p_fecha: body.fecha ?? null,
    p_umbral: Number(body.umbral) || 8,
    p_top: Number(body.top) || 8,
  });
  if (error) throw new Error("maga_oportunidades_diarias: " + error.message);
  const oportunidades = filas || [];

  /* Sin oportunidades no se manda nada: un correo diario que dice "nada hoy"
     se vuelve ruido y termina en spam. */
  if (!oportunidades.length) {
    return json({ ok: true, modo: "diario", fecha: null, oportunidades: 0, comercios: 0, resultado: [] });
  }
  const fecha = oportunidades[0].fecha;

  const { data: comercios, error: eT } = await admin.from("tenants")
    .select("id,name,email,email_reporte_maga")
    .eq("reporte_maga_diario", true);
  if (eT) throw new Error("leer comercios: " + eT.message);

  const { data: seg } = await admin.from("maga_seguimiento").select("tenant_id,producto_id");
  const seguidosPorTenant = new Map<string, Set<number>>();
  (seg || []).forEach((s: any) => {
    const set = seguidosPorTenant.get(s.tenant_id) || new Set<number>();
    set.add(s.producto_id); seguidosPorTenant.set(s.tenant_id, set);
  });

  const resultado: any[] = [];
  for (const t of comercios || []) {
    const destino = toPrueba || t.email_reporte_maga || t.email;
    if (!destino) { resultado.push({ tenant_id: t.id, email: null, enviado: false, error: "sin correo configurado" }); continue; }
    const seguidos = seguidosPorTenant.get(t.id) || new Set<number>();
    const html = armarHTMLDiario(t.name || "Tu comercio", fecha, oportunidades, seguidos);
    if (dryRun) { resultado.push({ tenant_id: t.id, email: destino, oportunidades: oportunidades.length, enviado: false }); continue; }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: destino,
        subject: `Oportunidades del día — ${oportunidades.length} en granos y productos agrícolas`,
        html,
      }),
    });
    let detalle: any = null;
    try { detalle = await r.json(); } catch { detalle = null; }
    resultado.push({ tenant_id: t.id, email: destino, oportunidades: oportunidades.length,
                     enviado: r.ok, estado: r.status, id: detalle?.id ?? null,
                     error: r.ok ? null : (detalle?.message ?? detalle?.error?.message ?? null) });
  }

  return json({ ok: true, modo: "diario", fecha, dry_run: dryRun, to_prueba: toPrueba,
                oportunidades: oportunidades.length, comercios: resultado.length, resultado });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!(await autorizada(req, admin, url, anonKey))) return json({ error: "No autorizado" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const mes = Number(body.mes) || new Date().getUTCMonth() + 1;
    const dryRun = body.dry_run === true;
    const toPrueba = typeof body.to_prueba === "string" && body.to_prueba.includes("@")
      ? body.to_prueba.trim() : null;

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const FROM = Deno.env.get("EMAIL_FROM") ?? "NexusPro <onboarding@resend.dev>";
    if (!apiKey && !dryRun) {
      return json({ error: "El correo aún no está configurado (falta RESEND_API_KEY)." }, 503);
    }

    /* Resumen diario de oportunidades: misma función para no duplicar la
       autorización ni el envío por Resend. */
    if (body.modo === "diario") return await resumenDiario(admin, body, apiKey, FROM);

    const { data: filas, error } = await admin.rpc("maga_alertas_ventana", { p_mes: mes, p_anios: 5 });
    if (error) throw new Error("maga_alertas_ventana: " + error.message);

    const porTenant = new Map<string, any[]>();
    (filas || []).forEach((f: any) => {
      if (!f.email) return;                       // sin correo no hay a dónde avisar
      const arr = porTenant.get(f.tenant_id) || [];
      arr.push(f); porTenant.set(f.tenant_id, arr);
    });

    const resultado: any[] = [];
    for (const [tid, lista] of porTenant) {
      const html = armarHTML(lista[0].tenant_name || "Tu comercio", mes, lista);
      const destino = toPrueba || lista[0].email;
      if (dryRun) { resultado.push({ tenant_id: tid, email: destino, productos: lista.length, enviado: false }); continue; }
      /* Se llama a Resend directo y no a la función email-send: esa exige una
         sesión de usuario (devuelve 401 con la clave de servicio) porque está
         hecha para el navegador. Es el mismo patrón que usa saas-recordatorios
         para sus correos de cron. */
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM, to: destino,
          subject: `Ventanas de ${MESES[mes - 1]} — ${lista.length} producto(s)`, html,
        }),
      });
      let detalle: any = null;
      try { detalle = await r.json(); } catch { detalle = null; }
      resultado.push({ tenant_id: tid, email: destino, productos: lista.length,
                       enviado: r.ok, estado: r.status,
                       id: detalle?.id ?? null,
                       error: r.ok ? null : (detalle?.message ?? detalle?.error?.message ?? null) });
    }

    return json({ ok: true, mes, dry_run: dryRun, to_prueba: toPrueba,
                  comercios: resultado.length, alertas: (filas || []).length, resultado });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
