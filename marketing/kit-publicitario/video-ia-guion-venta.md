<title>Kit de Video Publicitario — NexusPro</title>

# Kit de Video Publicitario — NexusPro
### Prompt para IA de video + guion de venta

Este documento es el tercer entregable, separado del Manual de Usuario y de la Presentación Ejecutiva. Contiene: las imágenes de referencia generadas, el prompt listo para pegar en una IA generadora de video, el guion completo (voz en off + texto en pantalla) y variaciones para redes sociales.

---

## 1. Resumen del spot

| | |
|---|---|
| **Duración objetivo** | 30 segundos (hay versión de 15s y de 60s más abajo) |
| **Formatos** | 16:9 (YouTube/TV/Meta feed) · 9:16 (Reels/TikTok/Stories) · 1:1 (feed Instagram) |
| **Tono** | Confiable, ágil, moderno — sin tecnicismos ni jerga de software |
| **Público objetivo** | Dueños de pequeñas y medianas empresas en Guatemala (talleres, ferreterías, agroservicios, comercio en general) cansados de administrar con papel, Excel o varios sistemas sueltos |
| **Paleta de marca** | Azul #3B82F6, azul marino #0B1220, blanco/gris claro para texto |
| **Marca** | NexusPro — "Tu negocio conectado" |

---

## 2. Imágenes de referencia

### 2.1 Capturas reales de la app (preferidas para el video)

Guardadas en `marketing/kit-publicitario/imagenes-app-real/` — son capturas reales de las pantallas de NexusPro (no ilustraciones), ya corregidas para mostrar la marca actual ("NexusPro", "Nexus IA", dominio `nexuspro.cmtelecommgt.com`):

1. **`play-screen1-dashboard.png`** — Dashboard con KPIs del mes, órdenes recientes y estado de cada una.
2. **`play-screen2-ordenes.png`** — Listado de Órdenes de Trabajo con pestañas de filtro y tarjetas por estado (pendiente/en proceso/diagnóstico/listo).
3. **`play-screen3-nexus.png`** — Conversación con el asistente **Nexus IA** diagnosticando una falla técnica.
4. **`play-screen4-facturacion.png`** — Pantalla de Facturación Electrónica FEL con el detalle de una orden y el sello "Conectado a SAT".
5. **`play-screen5-modulos.png`** — Vista de módulos especializados (mecánica, electrónica, refrigeración, herrería, peletería, cotizaciones) + funciones destacadas.
6. **`play-feature-graphic.png`** — Banner horizontal (1024×500) con el nombre, tagline y pills de funciones, ideal como fotograma de cierre o portada.

Úsalas como referencia de imagen directa en la IA de video (la mayoría de herramientas de video con IA aceptan una imagen de referencia por escena/fotograma).

### 2.2 Piezas ilustrativas adicionales (Canva)

Guardadas en `marketing/kit-publicitario/imagenes-conceptuales/` — ilustraciones de estilo "poster SaaS" (no son capturas de la app), útiles como fondo/transición entre escenas de producto real, no como sustituto de ellas:

1. **`modulo-dashboard.png`** — Headline: *"Tu negocio, en tiempo real"*.
2. **`modulo-ordenes-servicio.png`** — Headline: *"Tus clientes siempre saben en qué va su servicio"*.

Canva alcanzó su límite de generación diario tras estas 2 piezas; el resto de conceptos ilustrativos (POS, Inventario, Facturación, Contabilidad, RRHH, Fidelización, Multi-negocio, Seguridad, Panel multi-sucursal) quedan solo como descripción textual en la sección 3, por si se quieren regenerar más adelante — no son necesarios si el video usa las capturas reales de la sección 2.1.

---

## 3. Prompt maestro para IA generadora de video

Copia y pega esto en la IA de video (Sora, Runway, Veo, Kling, Pika, etc.), adjuntando las 6 capturas reales de la sección 2.1 como imagen de referencia de cada escena correspondiente (ver marcas [Usar ...] en el storyboard):

```
Crea un spot publicitario de 30 segundos para "NexusPro", una plataforma
de gestión empresarial en la nube (ventas, inventario, finanzas, personal
y facturación electrónica) dirigida a dueños de pequeños y medianos
negocios en Guatemala.

ESTILO VISUAL: corporativo moderno, limpio, tipo anuncio de SaaS premium.
Paleta de color: azul brillante (#3B82F6) sobre fondo azul marino oscuro
(#0B1220), acentos en blanco y gris claro. Tipografía bold, geométrica,
sans-serif. Transiciones suaves tipo "deslizar" o "fundido cruzado" entre
escenas, sin cortes bruscos. Mockups de pantallas de celular, tablet y
laptop flotando con ligera profundidad (parallax sutil), nunca estáticos.
Iluminación suave, ambiente confiable y profesional, ritmo ágil pero no
frenético.

ESTRUCTURA DE ESCENAS (usar como storyboard, ~3 segundos cada una salvo
que se indique otra duración):

1. (0:00–0:03) Apertura con el problema: un dueño de negocio agobiado
   revisando papeles y hojas de cálculo desordenadas en un mostrador o
   escritorio. Tono ligeramente caótico, colores apagados.
2. (0:03–0:06) Transición: los papeles se convierten/disuelven en la
   pantalla real del Dashboard de NexusPro. [Usar
   play-screen1-dashboard.png — captura real de la app, con KPIs del mes,
   órdenes activas y facturación].
3. (0:06–0:09) Escena de Órdenes de Trabajo: se desliza la lista de
   órdenes con sus estados (pendiente, en proceso, diagnóstico, listo).
   [Usar play-screen2-ordenes.png — captura real de la app].
4. (0:09–0:12) Escena del asistente Nexus IA: una conversación de chat
   resolviendo un diagnóstico técnico en tiempo real. [Usar
   play-screen3-nexus.png — captura real de la app].
5. (0:12–0:15) Escena de Facturación Electrónica FEL: el detalle de una
   orden con el sello "Conectado a SAT · FEL Activo". [Usar
   play-screen4-facturacion.png — captura real de la app].
6. (0:15–0:18) Escena de módulos especializados: la cuadrícula de
   rubros (mecánica, electrónica, refrigeración, herrería, peletería,
   cotizaciones) y las funciones destacadas (FEL, RRHH, Nexus IA).
   [Usar play-screen5-modulos.png — captura real de la app].
7. (0:18–0:21) Escena Multi-negocio: distintos íconos de rubros
   (llave inglesa/taller, ferretería, grano/agro, textil) convergiendo
   hacia un mismo panel central, reforzando "un sistema, cualquier
   negocio" (puede animarse a partir de los íconos ya vistos en la
   escena anterior).
8. (0:21–0:24) Escena de Seguridad: un escudo digital con candado y
   código de verificación en dos pasos, transmitiendo protección.
9. (0:24–0:27) Escena de RRHH y equipo: lista de empleados con
   check-ins de asistencia y un ícono de planilla.
10. (0:27–0:29) Cierre de marca: usar play-feature-graphic.png como
    fotograma base — logo "NexusPro" con el eslogan "Tu negocio
    conectado" apareciendo letra por letra sobre el mismo fondo azul
    marino.
11. (0:29–0:30) Fotograma final: logo + llamado a la acción en texto.

CÁMARA: paneos suaves y acercamientos lentos (zoom-ins) sobre cada
mockup, nunca cortes secos entre escenas — usar disolvencias o
deslizamientos horizontales.

MÚSICA: instrumental corporativo-tecnológico, tempo medio (100–115 BPM),
con un "levantón" (build-up) hacia la escena 12 y resolución limpia en
el cierre. Sin letra cantada, para no competir con la voz en off.

VOZ EN OFF: ver guion completo en la sección 4 de este documento — el
locutor debe sonar cercano, seguro y en español neutro/centroamericano,
sin tecnicismos.

TEXTO EN PANTALLA: usar las frases de la sección 5, en tipografía bold
blanca sobre fondo azul marino o en tarjetas semitransparentes sobre
cada mockup.

FORMATO DE SALIDA: entregar en 16:9 a 1080p. Si es posible, generar
también una versión recortada/verticalizada en 9:16 para redes sociales,
priorizando que el logo y el texto queden centrados en el encuadre
vertical.
```

---

## 4. Guion de voz en off (30 segundos)

| Tiempo | Línea de voz en off |
|---|---|
| 0:00–0:04 | *"¿Cuánto tiempo pierdes cuadrando papeles, Excel y WhatsApp para saber cómo va tu negocio?"* |
| 0:04–0:08 | *"Con NexusPro, todo tu negocio vive en un solo lugar."* |
| 0:08–0:13 | *"Ventas, inventario, finanzas y tu equipo — conectados en tiempo real, desde cualquier dispositivo."* |
| 0:13–0:18 | *"Factura ante la SAT en automático. Cobra en segundos. Y deja que tus clientes vean el avance de su servicio sin tener que llamarte."* |
| 0:18–0:23 | *"Sin importar tu rubro — taller, ferretería, agroservicio o comercio — NexusPro se adapta a ti."* |
| 0:23–0:27 | *"Con la seguridad y los respaldos que tu negocio necesita, todos los días."* |
| 0:27–0:30 | *"NexusPro. Tu negocio conectado. Solicita tu demo hoy."* |

### Versión corta (15 segundos)
> *"¿Cansado de administrar tu negocio con papeles y Excel? NexusPro conecta tus ventas, inventario, finanzas y equipo en un solo lugar — y factura ante la SAT automáticamente. NexusPro. Tu negocio conectado."*

### Versión larga (60 segundos)
Usa el guion de 30 segundos como columna vertebral y añade, entre la escena 4 y la 5, estos dos bloques adicionales:

> *"Cada bodega, cada sucursal, bajo control — con alertas antes de que se te agote un producto."*
> *"Y si administras más de un negocio, un solo panel te deja ver y apoyar a todos, desde cualquier lugar."*

---

## 5. Texto en pantalla (on-screen text)

- Escena 2 (Dashboard): **"Tu negocio, en tiempo real."**
- Escena 3 (Órdenes): **"Tus clientes siempre saben en qué va su servicio."**
- Escena 4 (Nexus IA): **"Un asistente inteligente, siempre disponible."**
- Escena 5 (Facturación FEL): **"Cumple con la SAT en automático."**
- Escena 6 (Módulos): **"Un módulo para cada parte de tu negocio."**
- Escena 7 (Multi-negocio): **"Un sistema. Cualquier tipo de negocio."**
- Escena 8 (Seguridad): **"Tu información, blindada."**
- Escena 9 (RRHH): **"Tu equipo, bien administrado."**
- Cierre: **"NexusPro — Tu negocio conectado."** + **"Solicita tu demo →"**

---

## 6. Versiones para redes sociales

**Caption sugerido (Instagram/Facebook):**
> Menos papeles, más control. 📊 NexusPro conecta las ventas, el inventario, las finanzas y tu equipo en un solo lugar — y factura ante la SAT automáticamente. Tu negocio, conectado desde el celular, la tablet o la computadora. 👉 Solicita tu demo.
> `#NexusPro #GestiónEmpresarial #Guatemala #FacturaciónElectrónica #PyME`

**Caption corto (TikTok/Reels, tono más directo):**
> Tu negocio en un solo sistema, no en 5 aplicaciones sueltas. Así se ve NexusPro 👇

**Idea de hook para los primeros 2 segundos (crítico en redes):**
> Arrancar directo con la imagen de papeles/Excel desordenados y la pregunta *"¿Todavía administras tu negocio así?"* antes de mostrar el logo — el hook debe aparecer antes del segundo 2 para redes.

---

## 7. Notas de producción

- No usar capturas reales de datos de ningún cliente ni de la base de datos de producción — todas las escenas deben ser mockups/ilustraciones genéricas (como las imágenes generadas).
- Evitar mencionar cifras de rendimiento inventadas (por ejemplo "40% más rápido"): el mensaje se apoya en beneficios concretos, no en estadísticas sin respaldo.
- Mantener el logo y el eslogan **"Tu negocio conectado"** visibles en el fotograma final al menos 2 segundos, tiempo suficiente para que quede en la retina del espectador.
- Si se dobla a otro locutor, mantener un español neutro/centroamericano, evitando modismos muy locales que no viajen bien en redes.
