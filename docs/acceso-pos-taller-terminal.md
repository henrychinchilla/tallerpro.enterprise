# Acceso POS: taller y terminal

Actualizado: 2026-07-24

Google solo verifica la identidad. NexusPro debe resolver después el contexto operativo:

1. El usuario autenticado ve únicamente los talleres donde tiene una membresía activa.
2. Al elegir un taller, el sistema valida la membresía en `seleccionar_taller_pos`; no acepta un `tenant_id` arbitrario.
3. El usuario elige una terminal POS activa de ese taller.
4. La apertura y el cierre de caja se registran contra esa terminal, permitiendo varias cajas abiertas en el mismo taller sin mezclarlas.

`usuario_tenants` guarda las membresías y conserva la asignación histórica de todos los usuarios existentes. El trigger `usuarios_sincronizar_membresia` mantiene la membresía al crear o editar usuarios. Cada taller recibe inicialmente una terminal `POS principal`.

Si una persona entra con Google pero no tiene una membresía, el POS debe explicar que falta asignación; nunca debe dejar una pantalla vacía ni exponer la lista de talleres.
