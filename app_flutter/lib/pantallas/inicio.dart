import 'package:flutter/material.dart';

import '../nucleo/config.dart';
import '../nucleo/sesion.dart';
import 'escaner.dart';

/* Pantalla de inicio.

   Deliberadamente corta: esta primera tajada nativa cubre entrar y escanear,
   que es lo que hoy está roto. Los demás módulos (POS, inventario, órdenes,
   facturación) se van agregando acá conforme se porten, y no se pintan botones
   de lo que todavía no existe — un menú que promete pantallas vacías es peor
   que un menú corto. */
class PantallaInicio extends StatelessWidget {
  const PantallaInicio({super.key});

  @override
  Widget build(BuildContext context) {
    final nombre = (Sesion.usuario?['nombre'] ?? 'Usuario') as String;
    final comercio = (Sesion.comercio?['name'] ?? '') as String;

    return Scaffold(
      appBar: AppBar(
        title: const Text(nombreApp),
        actions: [
          IconButton(
            tooltip: 'Cerrar sesión',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await sb.auth.signOut();
              Sesion.limpiar();
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(nombre),
              subtitle: Text([
                if (comercio.isNotEmpty) comercio,
                Sesion.rol,
              ].join(' · ')),
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.bluetooth_searching),
              title: const Text('Diagnóstico OBD-II'),
              subtitle: const Text('Escáner Bluetooth — clásico (SPP) y BLE'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PantallaEscaner()),
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              'Los demás módulos se van agregando conforme se portan a nativo. '
              'Mientras tanto siguen disponibles en el sitio web desde una computadora.',
              style: TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}
