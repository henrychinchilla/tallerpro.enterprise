# Diagnóstico de transporte: mapas por unidad

Fecha: 2026-09-22.

## Uso

En Diagnóstico hay dos accesos nuevos:

- **Motocicletas**: selecciona una unidad registrada como motocicleta, scooter,
  motocarro o cuatrimoto; confirma protocolo, cable y tensión en la documentación
  del modelo y abre el escáner existente con esa unidad seleccionada.
- **Mapa y ruta de diagnóstico**: selecciona cualquier vehículo del taller,
  elige su familia y registra sus módulos y conexiones.

El Centro de módulos también permite abrir el mapa de la unidad del escaneo.

Las plantillas por familia sirven para planificar las comprobaciones. No son
esquemas OEM por modelo. Un módulo orientativo no prueba que esté instalado.
Importar un escaneo añade solamente direcciones que respondieron y no inventa
enlaces físicos, pinouts, nombres certificados ni ausencia actual de fallas.

Cada módulo y conexión tiene Crear, Ver, Editar y Eliminar. Se puede guardar red,
dirección observada, ubicación, conectores/pines, evidencia, fuente y notas.
Eliminar un módulo elimina sus conexiones documentales; no transmite al vehículo.
Eliminar un mapa conserva los escaneos. La revisión evita sobrescribir cambios
de otro mecánico. Un error de guardado conserva el mapa previo.

La ruta permite seleccionar DTC del escaneo reciente o escribir un síntoma,
identificar el sistema y consultar los tramos relacionados del mapa. Incluye
orientación para alimentación/masa, comunicación, no arranque, SPN/FMI y
comprobaciones de los sistemas. No determina automáticamente una pieza culpable.

## Cobertura y límites

Se amplió el catálogo de marcas y nombres de sistemas de la capa OEM y se añadió
un catálogo de planificación para livianos, camiones/autobuses, maquinaria y
motocicletas. Se incluyeron SCR/DEF, DPF, EBS/TEBS, retardador, PTO, hidráulica,
implementos, IMU, BMS, inversor y cargador, entre otros.

**Una marca listada no equivale a compatibilidad certificada.** No se agregaron
comandos propietarios inventados, semillas de acceso de seguridad ni rutinas
de programación. Se reutilizan los transportes ELM y RP1210 existentes. La
motocicleta debe soportar el protocolo de emisiones usado por el adaptador.
ABS/IMU/inmovilizador, gateways protegidos y maquinaria requieren documentación
OEM, interfaz y acceso específicos. No hay prueba física con vehículos en esta
entrega y no se certifican modelos/años concretos.

La pantalla inicial Android actual (`app_flutter/lib/pantallas/inicio.dart`)
abre el diagnóstico web a través de `PantallaModuloWeb`; los cambios publicados
en esa pantalla no requieren producir un APK adicional ni una variante de 32 bits.

## Fuentes públicas consultadas

- [AiM: conexión Euro 5 para motocicletas](https://support.aimshop.com/pdf/motorbikes/OBDII/Bike_euro5_std_eng_100.pdf).
  Orienta la identificación del conector; comprobar aplicabilidad por modelo.
- [CSS Electronics: J1939-73 y DM1](https://www.csselectronics.com/pages/j1939-73-dm1-diagnostic-message-dtc).
  Fundamenta conservar origen, SPN, FMI y contador de ocurrencias.
- [Cummins: aislamiento de fallas J1939](https://qsol.cummins.com/info/qsol/news/J1939_data_link_diagnostic_tool.html).
  Referencia de diagnóstico de la red y del arnés, sin reproducir manuales.
- [Bosch: ECU de motocicletas](https://www.bosch-mobility.com/en/solutions/control-units/engine-control-unit-for-small-bikes/).
- [TEXA: diagnóstico BIKE](https://www.texa.com/solutions/bike/).
  Referencia externa; no implica integración de TEXA con NexusPro.

## Datos y verificación

Migración `143_obd_topologia_vehiculo.sql`: una topología por taller/unidad,
arrays JSON de módulos/enlaces, RLS, comprobación de propietario del vehículo y
revisión de concurrencia. No se cargaron esquemas ni direcciones de fabricantes.

- `node test/obd/transporte.js`: flujo lógico, idempotencia, entradas no confiables,
  permisos, fallos, rutas y selección de motocicletas.
- `test/obd/topologia_rls.sql`: CRUD, revisión y aislamiento en una transacción
  revertida completamente; requiere dos talleres existentes.
- Validación de interfaz a 1440 y 390 píxeles con la UI real y persistencia simulada:
  creación/edición/eliminación de módulos y conexiones, diagrama, DTC y apertura
  del escáner de motocicletas. No se transmitió a un vehículo.

Se corrigió además la guía DTC existente que referenciaba variables inexistentes
y asumía Hyundai Accent en ausencia de vehículo, y se escaparon nombres de módulo
en mensajes HTML del registro de diagnóstico.
