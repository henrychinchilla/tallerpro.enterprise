# Demo E2E en 10 minutos — NexusPro

Recorrido para probar de punta a punta, en el comercio **PRUEBAS (automatizadas)**.
No hay staging: todo corre en producción, así que se usan datos de prueba y
**nunca** un comercio real. Lo nuevo de dinero (Canal A y Canal B) está
**apagado por flag** y se prueba en modo simulación.

Marca cada casilla. Si algo falla, abre **🧾 Bitácora** o la consola (F12 → Console y Network) y copia el error.

---

## 0. Antes de empezar (1 min)

- [ ] Entra como superadmin a https://nexuspro.cmtelecommgt.com y recarga con **Ctrl+F5** (Service Worker nuevo).
- [ ] Panel SaaS → **Comercios**: ningún comercio con «Vence» en el pasado dice **Activo**; debe decir **⚠️ Vencido · en mora** o **Suspendido** (#104).

## 1. Soporte → POS sin perder el comercio (P0-2, #105) (2 min)

- [ ] Panel SaaS → Comercios → **🛟 Entrar** en *PRUEBAS*. Arriba aparece la barra «Modo soporte».
- [ ] Abre `/pos` en otra pestaña. Debe pedir la terminal **de PRUEBAS** (no «Tu cuenta aún no tiene negocio asignado»).
- [ ] F12 → **Network** → filtra `tenant_id`: **ninguna** petición con `tenant_id=eq.null` ni el texto `"null"`.
- [ ] Sal del modo soporte (← Volver al Panel SaaS) y abre `/pos`: debe decir «Sin comercio en soporte» con instrucción, no un error.
- [ ] Con un usuario **nuevo** (contraseña temporal) entra directo a `/pos`: debe pedir **cambiar la contraseña** antes de cobrar (#112).

## 2. Cotización → OT → factura → stock (3 min)

- [ ] Cotizaciones → **Nueva**: 2 líneas (una con 10% de descuento de línea) + 5% de descuento global. Anota el total.
- [ ] **Convertir a OT**: la OT trae las **2 líneas + «Descuento de la cotización»**, y su total = el cotizado (#108).
- [ ] En la OT agrega un repuesto **con stock** del inventario. Quita una línea: debe **pedir confirmación** (P1-5).
- [ ] Pasa la OT a «Listo» → **Facturar**. Anota el stock del repuesto antes y después: baja exactamente la cantidad (#107).
- [ ] Vuelve a facturar la **misma** OT (o en otra pestaña a la vez): «Esa OT ya tiene una factura emitida» y **no** se crea otra (#111).
- [ ] POS: vende **más** unidades de las que hay en stock: «No se cobró: Stock insuficiente de "X": hay N, se piden M» y **no** queda factura (#107).

## 3. FEL y pagos del comercio (Canal B) (2 min)

- [ ] Comunicaciones → **FEL**: el modo por defecto dice «Sin certificador conectado» (no «NexusPro gestiona»).
- [ ] Modo «Mis propias credenciales» → certificador cualquiera → usuario/contraseña **de prueba** → Guardar. Recarga: la contraseña **no** se vuelve a ver; dice «🔒 Guardada cifrada (…xxxx)».
- [ ] **🔌 Probar conexión** → «Sin conector para "…" todavía» (correcto: no hay certificador contratado).
- [ ] (Superadmin en soporte) Configuración → **💳 Pasarela de pagos propia** → Conectar → llaves de prueba → Guardar → **Probar** → «Sin conector». **Desconectar** pide confirmación y borra.
- [ ] Ninguna factura pasa a «certificada» por estas pruebas. *(El POS sigue guardando sus ventas como «certificada»: decisión vigente.)*

## 4. Renovación SaaS visible en el Superadmin (Canal A) (2 min)

- [ ] Panel SaaS → **Cobros** → **💵 Registrar cobro** a *PRUEBAS*, Pagado, 1 mes. El aviso dice «vigente hasta …» y en Comercios su «Vence» avanzó un mes y dice **Activo** (#106).
- [ ] Tarjeta **🤖 Cobro automático**: dice **APAGADO — solo simula**.
- [ ] **🔎 Simular hoy**: lista qué cobraría o suspendería. *Nada se cobra ni se suspende.* (Hoy: El Granjero «⛔ Suspender», vencido > gracia.)
- [ ] ⚙️ Configurar: **no** lo enciendas en la demo. Si lo enciendes, al día siguiente el cron suspende a los vencidos más allá de la gracia.

---

## Resultado

| Bloque | PASS / FAIL | Nota |
|---|---|---|
| 0. Estado comercial | | |
| 1. Soporte → POS | | |
| 2. Cotización → factura → stock | | |
| 3. Canal B (FEL / pagos) | | |
| 4. Canal A (renovación) | | |

Para producción real faltan, fuera de esta demo: contrato con una pasarela de CM (Canal A),
el conector del primer certificador FEL y de la primera pasarela que contrate un comercio
(Canal B), y la causa del 403 que bloquea los precios del MAGA desde el 18/8/2026.
