import 'package:flutter/material.dart';

import '../nucleo/config.dart';
import '../nucleo/sesion.dart';
import 'escaner.dart';
import 'modulo_web.dart';

/* Pantalla principal de la App Nativa NexusPro Enterprise.
   Ofrece acceso directo al escáner OBD-II Bluetooth nativo Y al 100% de los
   34+ módulos del sistema sin excepción. */
class PantallaInicio extends StatelessWidget {
  const PantallaInicio({super.key});

  @override
  Widget build(BuildContext context) {
    final nombre = (Sesion.usuario?['nombre'] ?? 'Usuario') as String;
    final comercio = (Sesion.comercio?['name'] ?? '') as String;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text(nombreApp),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.blue.withOpacity(0.2),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.blue.withOpacity(0.4)),
              ),
              child: const Text(
                'v$versionApp',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.lightBlueAccent),
              ),
            ),
          ],
        ),
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
          // Tarjeta de perfil y comercio
          Card(
            elevation: 2,
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: Theme.of(context).colorScheme.primary,
                child: Text(
                  nombre.isNotEmpty ? nombre[0].toUpperCase() : 'U',
                  style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
              title: Text(nombre, style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text([
                if (comercio.isNotEmpty) comercio,
                Sesion.rol,
              ].join(' · ')),
              trailing: const Icon(Icons.verified, color: Colors.green),
            ),
          ),
          const SizedBox(height: 16),

          // Módulo Destacado: Escáner OBD-II Nativo
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.blue.shade900, Colors.indigo.shade900],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(12),
              boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(0, 2))],
            ),
            child: Material(
              color: Colors.transparent,
              child: ListTile(
                contentPadding: const EdgeInsets.all(16),
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.blueAccent.withOpacity(0.3),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.bluetooth_searching, color: Colors.cyanAccent, size: 32),
                ),
                title: const Text(
                  'Diagnóstico OBD-II Escáner Nativo',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                subtitle: const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: Text(
                    'vLinker MS, Vgate, ELM327 Bluetooth (SPP & BLE) · UDS 0x2F Actuadores y DTCs',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ),
                trailing: const Icon(Icons.arrow_forward_ios, color: Colors.cyanAccent, size: 20),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const PantallaEscaner()),
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Título Módulos Enterprise
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Módulos Enterprise (34 Módulos)',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              TextButton.icon(
                icon: const Icon(Icons.open_in_new, size: 16),
                label: const Text('Ver Todo'),
                onPressed: () => _abrirModulo(context, 'Dashboard General', 'dashboard'),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Grilla de accesos rápidos a módulos
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.5,
            children: [
              _tarjetaModulo(
                context,
                titulo: 'Punto de Venta (POS)',
                icono: Icons.shopping_cart,
                color: Colors.amber,
                moduloId: 'pos',
              ),
              _tarjetaModulo(
                context,
                titulo: 'Órdenes de Trabajo',
                icono: Icons.assignment_outlined,
                color: Colors.orange,
                moduloId: 'ordenes',
              ),
              _tarjetaModulo(
                context,
                titulo: 'Clientes & CRM',
                icono: Icons.people_alt,
                color: Colors.teal,
                moduloId: 'clientes',
              ),
              _tarjetaModulo(
                context,
                titulo: 'Vehículos & Flotilla',
                icono: Icons.directions_car,
                color: Colors.lightBlue,
                moduloId: 'vehiculos',
              ),
              _tarjetaModulo(
                context,
                titulo: 'Inventario & Bodegas',
                icono: Icons.inventory_2,
                color: Colors.cyan,
                moduloId: 'inventario',
              ),
              _tarjetaModulo(
                context,
                titulo: 'Facturación & FEL',
                icono: Icons.receipt_long,
                color: Colors.green,
                moduloId: 'facturacion',
              ),
              _tarjetaModulo(
                context,
                titulo: 'Cotizaciones',
                icono: Icons.description_outlined,
                color: Colors.purpleAccent,
                moduloId: 'cotizaciones',
              ),
              _tarjetaModulo(
                context,
                titulo: 'Finanzas & Bancos',
                icono: Icons.account_balance,
                color: Colors.indigoAccent,
                moduloId: 'finanzas',
              ),
              _tarjetaModulo(
                context,
                titulo: 'Contabilidad',
                icono: Icons.calculate,
                color: Colors.lightGreen,
                moduloId: 'contabilidad',
              ),
              _tarjetaModulo(
                context,
                titulo: 'Configuración',
                icono: Icons.settings,
                color: Colors.grey,
                moduloId: 'configuracion',
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Botón para acceder al menú completo de todos los 34 módulos
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              backgroundColor: Theme.of(context).colorScheme.surfaceContainerHigh,
            ),
            icon: const Icon(Icons.grid_view_rounded),
            label: const Text('Abrir Todos los 34 Módulos del Sistema'),
            onPressed: () => _abrirModulo(context, 'Plataforma NexusPro Enterprise', 'dashboard'),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              'NexusPro Enterprise v$versionApp (Build $buildApp)',
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tarjetaModulo(
    BuildContext context, {
    required String titulo,
    required IconData icono,
    required Color color,
    required String moduloId,
  }) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _abrirModulo(context, titulo, moduloId),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icono, color: color, size: 28),
              const SizedBox(height: 8),
              Text(
                titulo,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _abrirModulo(BuildContext context, String titulo, String moduloId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PantallaModuloWeb(titulo: titulo, moduloId: moduloId),
      ),
    );
  }
}
