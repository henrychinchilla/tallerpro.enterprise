# NexusPro — ficha para Google Play

> Revisada el **2026-08-25**. La versión anterior de este archivo tenía datos que **habrían
> hecho fallar la publicación** y quedan corregidos aquí:
> - paquete `com.telecommgt.nexuspro` → el real es **`com.cmtelecom.nexuspro`**
> - dominio `nexuspro.telecommgt.com` → **no existe** (sin DNS ni correo); el real es
>   **`nexuspro.cmtelecommgt.com`**. La URL de política de privacidad es obligatoria y Google
>   la abre: si no carga, rechaza la ficha.
> - correo `privacidad@telecommgt.com` → **rebota**; usar `@cmtelecommgt.com`
> - el asistente de IA se llama **Nexus**, no "Beto" (rebrand de 2026-07)
> - el gráfico destacado figuraba como pendiente y **ya existe**
>
> Pasos, D-U-N-S y formularios: `docs/PUBLICAR-EN-GOOGLE-PLAY.md`.

## Datos de la app

| Campo | Valor |
|---|---|
| Nombre en Play (30 car. máx.) | `NexusPro` |
| Paquete | `com.cmtelecom.nexuspro` |
| Versión | 4.77.0 (versionCode 4) |
| Desarrollador | CM Telecomm — entidad legal `CM INVESTMENTS, SOCIEDAD ANÓNIMA` |
| Categoría | Empresa / Negocios |
| Clasificación | Para todos |
| Público objetivo | 18 años en adelante |
| Precio | Gratis (la suscripción se contrata fuera de Play) |
| Anuncios | No |
| Países | Guatemala + Centroamérica |

## Enlaces (todos verificados el 2026-08-25)

- Sitio web: https://nexuspro.cmtelecommgt.com
- Política de privacidad: https://nexuspro.cmtelecommgt.com/privacidad
- Términos: https://nexuspro.cmtelecommgt.com/terminos
- Correo de soporte: `soporte@cmtelecommgt.com` ← **confirmar que el buzón existe**

---

## Descripción corta (80 caracteres máx.)

```
Gestiona tu taller o comercio: órdenes, inventario, punto de venta y facturas
```
(76 caracteres)

## Descripción larga (4000 caracteres máx.)

```
NexusPro es el sistema de gestión para talleres, agroservicios y comercios de Guatemala. Lleva tu negocio completo desde el teléfono: órdenes de trabajo, inventario, punto de venta, facturación electrónica y contabilidad, todo en un solo lugar.

ÓRDENES DE TRABAJO
Crea, asigna y da seguimiento a cada trabajo. Registra fotos del antes y el después, repuestos usados y mano de obra. Tus clientes consultan el estado de su equipo desde el portal de clientes, sin llamarte.

PUNTO DE VENTA
Cobra en el mostrador con lector de código de barras, control de caja por turno y cierre diario. El inventario se descuenta solo con cada venta.

INVENTARIO REAL
Control por bodegas, alertas de stock bajo y trazabilidad de cada movimiento. Unidades de Guatemala: quintal, arroba, libra, saco, galón, yarda.

FACTURACIÓN ELECTRÓNICA FEL
Emite facturas certificadas por la SAT desde la misma orden de trabajo. Cumple con la normativa guatemalteca.

CONTABILIDAD Y SAT
Libro de compras y ventas, y los formularios que te tocan según tu régimen. Aviso automático de obligaciones por vencer para que no se te pase una fecha.

ASISTENTE NEXUS
Un asistente con inteligencia artificial que conoce tu negocio y responde dudas técnicas y administrativas cuando lo necesitas.

DIAGNÓSTICO DE VEHÍCULOS (OBD-II)
Conecta un escáner Bluetooth o USB y lee los códigos de falla del vehículo desde la app. Compatible con automóviles y con camiones (J1939).

RECURSOS HUMANOS
Empleados, asistencia, planillas IGSS y control de rendimiento por técnico.

PARA CADA TIPO DE NEGOCIO
Activa solo lo que usas: taller mecánico, agroservicio, venta de granos, herrería, peletería, electrónica y refrigeración. Precios de referencia del MAGA y fórmulas de alimento para el sector agropecuario.

TU INFORMACIÓN, SEGURA
Cada negocio queda aislado del resto. Verificación en dos pasos, respaldo automático diario y datos cifrados en tránsito.

FUNCIONA EN TU TELÉFONO, TABLETA O COMPUTADORA
La misma cuenta en todos tus dispositivos, siempre sincronizada.

---
NexusPro requiere una cuenta activa. La suscripción se contrata en nexuspro.cmtelecommgt.com; no hay compras dentro de la aplicación.
```

## ⚠️ Sobre el módulo de Armería: NO mencionarlo en la ficha

NexusPro tiene un módulo de armería (control DIGECAM, Ley 15-2009). **Está deliberadamente
fuera de la descripción.**

La política de Play sobre armas prohíbe las apps que **faciliten la venta** de armas de fuego,
municiones o ciertos accesorios. Un ERP que lleva el inventario de una armería legalmente
establecida no es eso — pero mencionarlo en la ficha activa una revisión de política que puede
terminar en rechazo, y un rechazo por política es mucho más caro de revertir que uno técnico.

El módulo sigue funcionando con normalidad para los comercios que lo tienen habilitado: lo que
se evita es **anunciarlo en la tienda**. Si algún día se quiere incluir, conviene consultarlo
antes con el soporte de Play.

---

## Recursos gráficos

Todos verificados contra los límites de Play. Se regeneran con `node tools/capturas-play.mjs`.

| Recurso | Archivo | Medidas |
|---|---|---|
| Ícono | `icons/icon-512.png` | 512×512 PNG 32 bits ✅ |
| Gráfico destacado | `play-grafico-destacado.png` | 1024×500 ✅ |
| Teléfono (8) | `play-movil-01..08-*.png` | 1080×1920 (9:16) ✅ |
| Tablet 7" (2) | `play-tablet7-*.png` | 1200×1920 ✅ |
| Tablet 10" (2) | `play-tablet10-*.png` | 2560×1600 ✅ |

### ⚠️ Los dos gráficos destacados anteriores NO se usan

- **`nexuspro_grafico_funciones.jpg`** — se ve bien, pero enseña un **iPhone** y una interfaz
  que **no es la app**. Play desaconseja mostrar dispositivos de otra plataforma, y su política
  de metadatos engañosos pide que lo mostrado corresponda a la app real. Dos motivos de rechazo
  del recurso, y un rechazo por política es mucho más caro de revertir que uno técnico.
- **`screenshots/play-feature-graphic.png`** — marca vieja ("TallerPro Enterprise"), el
  asistente aún llamado "Beto" y el dominio muerto `tallerpro.telecommgt.com`.

El que se sube es `play-grafico-destacado.png`, generado con `node tools/grafico-destacado.mjs`:
marca real, ícono real de la app y sólo funciones que existen. Ningún teléfono dibujado, ninguna
pantalla inventada — nada que un revisor pueda contradecir.

> **El error que costó la primera tanda:** las capturas se hicieron con viewport 390×844, que
> es un teléfono real pero da **ratio 2.16:1**, y Play rechaza las capturas de teléfono que
> pasen de **2:1**. El mensaje de error habla de "dimensiones no válidas" y no menciona el
> ratio, así que no orienta. `tools/capturas-play.mjs` usa 360×640 @3x = 1080×1920 (9:16
> exacto) y **verifica cada imagen** antes de darla por buena.
>
> **No uses** `nexuspro_icono_playstore.jpg` como ícono: es JPG y Play exige **PNG**. El bueno
> es `icons/icon-512.png`.

### Orden sugerido de las capturas de teléfono
1. Panel del negocio · 2. Punto de venta · 3. Órdenes de trabajo · 4. Clientes
5. Inventario · 6. Facturación FEL · 7. Vehículos · 8. Contabilidad y SAT

## Palabras clave (ASO)

taller mecánico · gestión de taller · orden de trabajo · factura electrónica FEL · SAT
Guatemala · inventario · punto de venta · POS · agroservicio · venta de granos · quintal ·
planilla IGSS · escáner OBD2 · contabilidad Guatemala
