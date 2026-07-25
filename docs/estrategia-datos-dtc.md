# Estrategia de datos DTC — NexusPro

## Fuentes actuales

- **NHTSA vPIC** identifica el VIN y enriquece la ficha; no se presenta como un procedimiento de reparación OEM.
- **SAE/OBD-II** cubre códigos genéricos. Un código de fabricante no se interpreta como específico si no hay una fuente validada.
- **J1939** conserva `SPN + FMI + OC` para camiones y maquinaria; la interpretación base no sustituye el manual OEM.

## Arquitectura de proveedores

`dtc_catalogo_especifico` es el punto único para datos enriquecidos. Cada registro identifica alcance, años, motor, fuente, licencia y estado de verificación. Solo registros `verificado` aparecen al técnico y el origen queda junto al DTC guardado.

No se extrae ni copia contenido de interfaces comerciales. Se requiere API o acuerdo escrito que permita almacenarlo en caché, mostrarlo al técnico e incluirlo en reportes.

## Prioridad de evaluación

| Vertical | Proveedores a evaluar |
| --- | --- |
| Autos y pickups | Mitchell 1 ProDemand |
| Camiones, buses y motores diésel | Jaltest y portales OEM por motor, como Cummins QuickServe |
| Agrícola, construcción y maquinaria | Jaltest OHW/AGV y TEXA IDC5 OHW |
| Configuración/repuestos multimarca | Auto Care VCdb, separado de reparación |

Antes de contratar: confirmar cobertura Guatemala/LatAm, API, actualización, límites y derechos de visualización/redistribución.
