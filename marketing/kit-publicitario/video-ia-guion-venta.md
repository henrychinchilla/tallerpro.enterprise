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

## 2. Imágenes de referencia generadas

Se generaron 2 de las 12 piezas planeadas (Canva alcanzó su límite de generación diario del proyecto). Quedan guardadas en `marketing/kit-publicitario/imagenes/`:

1. **`modulo-dashboard.png`** — Escena de apertura: mockup de pantalla con KPIs en tiempo real. Headline: *"Tu negocio, en tiempo real"*.
2. **`modulo-ordenes-servicio.png`** — Escena de seguimiento de servicio: orden con barra de progreso y notificación al cliente. Headline: *"Tus clientes siempre saben en qué va su servicio"*.

Para las 10 escenas restantes (POS, Inventario, Facturación FEL, Contabilidad, RRHH, Fidelización, Multi-negocio, Seguridad 2FA, Panel multi-sucursal, Asistente IA Nexus) se incluye la **descripción visual completa** en la sección 3 — la IA de video puede generarlas directamente a partir del texto, o se pueden regenerar en Canva cuando se libere la cuota diaria y añadirlas como referencia de imagen.

---

## 3. Prompt maestro para IA generadora de video

Copia y pega esto en la IA de video (Sora, Runway, Veo, Kling, Pika, etc.), adjuntando `modulo-dashboard.png` como imagen de referencia del fotograma inicial y `modulo-ordenes-servicio.png` como referencia de la escena 3:

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
2. (0:03–0:06) Transición: los papeles se convierten/disuelven en una
   pantalla limpia con el logo "NexusPro" apareciendo con un efecto de
   luz azul. [Usar modulo-dashboard.png como referencia del mockup de
   pantalla con KPIs en tarjetas].
3. (0:06–0:09) Escena de Órdenes de Servicio: una pantalla de celular
   muestra una orden con barra de progreso (recibido → en proceso →
   listo) y llega una notificación al cliente. [Usar
   modulo-ordenes-servicio.png como referencia].
4. (0:09–0:12) Escena de Punto de Venta: una tablet en un mostrador
   procesa un cobro rápido con tarjeta y efectivo, ticket digital
   aparece al instante.
5. (0:12–0:15) Escena de Inventario: estantes de bodega estilizados en
   flat design con etiquetas de stock, una alerta de "stock bajo" se
   resuelve con un check verde.
6. (0:15–0:17) Escena de Facturación Electrónica: un documento digital
   con sello de verificado/check aparece junto a un ícono de nube,
   transmitiendo cumplimiento fiscal automático.
7. (0:17–0:19) Escena de Contabilidad y Finanzas: gráficas de ingresos
   vs. gastos animándose suavemente hacia arriba.
8. (0:19–0:21) Escena de Recursos Humanos: lista de empleados con
   check-ins de asistencia y un ícono de planilla.
9. (0:21–0:23) Escena de Fidelización: una tarjeta de puntos digital
   con un corazón/estrella iluminándose, celular mostrando una
   promoción.
10. (0:23–0:25) Escena Multi-negocio: distintos íconos de rubros
    (llave inglesa/taller, ferretería, grano/agro, textil) convergiendo
    hacia un mismo panel central.
11. (0:25–0:27) Escena de Seguridad: un escudo digital con candado y
    código de verificación, transmitiendo protección.
12. (0:27–0:29) Cierre de marca: logo "NexusPro" centrado sobre fondo
    azul marino, con el eslogan "Tu negocio conectado" apareciendo
    letra por letra.
13. (0:29–0:30) Fotograma final: logo + llamado a la acción en texto.

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

- Escena 2: **"Tu negocio, en tiempo real."**
- Escena 3: **"Tus clientes siempre saben en qué va su servicio."**
- Escena 4: **"Cobra en segundos."**
- Escena 5: **"Nunca más te quedes sin stock."**
- Escena 6: **"Cumple con la SAT en automático."**
- Escena 7: **"Tus finanzas, claras y al día."**
- Escena 8: **"Tu equipo, bien administrado."**
- Escena 9: **"Clientes que regresan una y otra vez."**
- Escena 10: **"Un sistema. Cualquier tipo de negocio."**
- Escena 11: **"Tu información, blindada."**
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
