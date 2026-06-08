# Integraciones — Email, WhatsApp e IA

Las Edge Functions ya están **DESPLEGADAS** (`email-send`, `whatsapp-send`,
`ai-assistant`, `crear-usuario`). Solo falta cargar sus **secrets** para
activarlas; sin secrets responden `503` y la app sigue funcionando normal.

> **Dónde cargar los secrets:** Supabase Dashboard → tu proyecto *tallerpro*
> → **Project Settings → Edge Functions → Secrets** (o *Functions → Secrets*).
> Agrega cada variable con su valor. No requiere re-desplegar: las funciones
> leen los secrets en cada ejecución.

| Integración | Secrets requeridos |
|---|---|
| **Email (Resend)** | `RESEND_API_KEY`, `EMAIL_FROM` |
| **WhatsApp (Meta)** | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |
| **IA (Claude)** | `ANTHROPIC_API_KEY` |
| **NIT — verificación (FEL)** | `NIT_LOOKUP_URL` (+ `NIT_LOOKUP_USUARIO`/`NIT_LOOKUP_LLAVE` o `NIT_LOOKUP_TOKEN`) |

---

## 0) Email — Resend

1. En https://resend.com → **API Keys → Create** → copia `re_...` → secret `RESEND_API_KEY`.
2. **Domains → Add Domain** → agrega los registros DNS (SPF/DKIM) que te muestra
   en tu proveedor de dominio → **Verify**.
3. Secret `EMAIL_FROM` con el formato `Mi Taller <noreply@tudominio.com>`
   (el dominio debe estar verificado; mientras tanto puedes probar con
   `onboarding@resend.dev`).
4. Probar (logueado, consola del navegador):
   ```js
   await Email.enviar('tucorreo@gmail.com', 'Prueba', { text: 'Hola desde TallerPro' })
   ```

## 0.1) Verificación de NIT — `nit-sat`

La Edge Function **`nit-sat`** ya está **DESPLEGADA**. Siempre valida el
**dígito verificador** del NIT localmente (algoritmo SAT, sin internet).
Para traer además el **nombre del contribuyente** en línea, conéctala a tu
**certificador FEL** (INFILE u otro) con estos secrets:

| Secret | Descripción |
|---|---|
| `NIT_LOOKUP_URL` | Endpoint de consulta de NIT del certificador. Puede incluir `{nit}` como marcador; si no, se agrega `?nit=...`. |
| `NIT_LOOKUP_METHOD` | `GET` (por defecto) o `POST`. |
| `NIT_LOOKUP_USUARIO` / `NIT_LOOKUP_LLAVE` | Cabeceras estilo INFILE (`usuario`, `llave`). |
| `NIT_LOOKUP_TOKEN` | Alternativa: `Authorization: Bearer <token>`. |

Sin estos secrets, el botón **🔎 Verificar NIT** (en Clientes, Proveedores y
Facturación) solo valida el dígito. Con ellos, autocompleta el nombre.

Probar (logueado, consola):
```js
await NIT.consultar('1234567-8')
```

---

Arquitectura: el navegador nunca toca las claves. Llama a una Edge
Function de Supabase, y la función (con sus secrets) habla con Meta o con
Anthropic.

```
navegador → getSB().functions.invoke('whatsapp-send' | 'ai-assistant') → Meta / Claude
```

---

## 1) IA — Asistente con Claude

### Qué hace
- **Diagnóstico:** síntomas → fallas probables + repuestos (`IA.diagnostico`)
- **Redacción:** genera descripciones de OT, cotizaciones, mensajes (`IA.redactar`)
- **Chat sobre tus datos:** "¿cuánto facturé en mayo?" (`IA.preguntar`)
- **Insights:** resumen ejecutivo del negocio (`IA.insights`)

Chat e insights se aterrizan en un *snapshot* del taller (clientes, OT
abiertas, ingresos/egresos del mes, inventario bajo) — la IA no inventa
cifras.

### Setup
1. Consigue una API key en https://console.anthropic.com → API Keys.
2. Guárdala como secret y despliega la función:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy ai-assistant
   ```
3. (Opcional) Ajusta modelo y profundidad/costo:
   ```bash
   supabase secrets set AI_MODEL=claude-opus-4-8     # def. claude-opus-4-8
   supabase secrets set AI_EFFORT=medium             # low | medium | high | max
   ```
   > Para bajar costos puedes usar `AI_MODEL=claude-sonnet-4-6` o `claude-haiku-4-5`.
4. Probar desde la consola del navegador (ya logueado):
   ```js
   await IA.preguntar('¿cuántas órdenes tengo abiertas?')
   ```
   o abre el chat: `IA.abrirChat()`.

### Costo
Claude cobra por token. Opus 4.8 ≈ $5 / 1M entrada y $25 / 1M salida.
Cada respuesta del chat ronda unos pocos centavos. Para un taller con uso
moderado es bajo; si quieres minimizarlo, usa Sonnet o Haiku vía `AI_MODEL`.

---

## 2) WhatsApp — Meta Cloud API

> ⚠️ Tu afiliación con Meta Business está en validación. Cuando termine,
> sigue estos pasos. Mientras tanto, todo el código ya está listo.

### Setup
1. En https://developers.facebook.com crea/usa una app con el producto
   **WhatsApp**. Obtén:
   - **Token permanente** (System User token con permiso `whatsapp_business_messaging`)
   - **Phone Number ID** (no el número, el ID)
2. Guarda los secrets y despliega:
   ```bash
   supabase secrets set WHATSAPP_TOKEN=EAAG...
   supabase secrets set WHATSAPP_PHONE_ID=123456789012345
   # opcional: supabase secrets set WHATSAPP_API_VERSION=v21.0
   supabase functions deploy whatsapp-send
   ```
3. Aplica la migración de tablas (bitácora):
   ```
   db/migrations/002_whatsapp_ai.sql   (SQL Editor → RUN)
   ```

### Reglas de Meta (importante)
- **Texto libre** solo se puede enviar dentro de las **24h** después de que
  el cliente te escribió. Fuera de esa ventana, debes usar una **plantilla
  pre-aprobada**.
- Crea y aprueba plantillas en Meta Business Manager → WhatsApp → Plantillas.

### Uso
```js
// Texto libre (ventana de 24h)
await WhatsApp.enviar('50212345678', 'Tu vehículo ya está listo 🚗')

// Avisar cambio de estado de una OT (conveniencia)
await WhatsApp.notificarEstadoOT(orden, cliente)

// Plantilla (iniciar conversación fuera de las 24h)
await WhatsApp.plantilla('50212345678', 'ot_lista', 'es', [/* components */])
```
Los números de 8 dígitos se normalizan a Guatemala (`502…`) automáticamente.

---

## 3) Activar en la UI (cuando estén listas)
Los flags viven en `config_integraciones` por tenant
(`whatsapp_activo`, `ia_activa`, `notif_ot_estado`, `notif_citas`) y en
`FEATURES` (defaults en `js/core/config.js`). El siguiente paso natural es
añadir un botón "🤖 IA" en el sidebar y un toggle de notificación de OT;
el andamiaje ya está listo para engancharlo.

---

## Resumen de archivos
| Archivo | Qué es |
|---|---|
| `supabase/functions/ai-assistant/` | Proxy a Claude (4 modos, aterrizado en datos) |
| `supabase/functions/whatsapp-send/` | Envío vía Meta Cloud API |
| `db/migrations/002_whatsapp_ai.sql` | Tablas `mensajes`, `ai_conversaciones`, `config_integraciones` + RLS |
| `js/core/integraciones.js` | Helpers cliente `WhatsApp.*` e `IA.*` |
