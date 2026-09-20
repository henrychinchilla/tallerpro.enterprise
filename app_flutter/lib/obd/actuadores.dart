import 'package:flutter/material.dart';
import 'elm.dart';

/* Módulo de Pruebas de Actuadores (UDS 0x2F / BI-DIRECTIONAL ACTUATION TESTS)
   Soporta pruebas activas para ECM, TCM, ABS, EPS, HVAC, BCM, IMMO. */

class PruebaActuador {
  final String modulo;
  final String nombre;
  final String comandoOn;
  final String comandoOff;
  final String descripcion;
  final IconData icono;

  const PruebaActuador({
    required this.modulo,
    required this.nombre,
    required this.comandoOn,
    required this.comandoOff,
    required this.descripcion,
    required this.icono,
  });
}

class PantallaActuadoresUDS extends StatefulWidget {
  final ELM elm;
  const PantallaActuadoresUDS({super.key, required this.elm});

  @override
  State<PantallaActuadoresUDS> createState() => _PantallaActuadoresUDSState();
}

class _PantallaActuadoresUDSState extends State<PantallaActuadoresUDS> {
  final _logActuador = <String>[];
  bool _probando = false;
  String? _actuadorActivo;

  static const _pruebas = [
    PruebaActuador(
      modulo: 'ECM / Motor',
      nombre: 'Relevador Bomba de Combustible',
      comandoOn: '2F010103',
      comandoOff: '2F010100',
      descripcion: 'Activa el relé de la bomba de gasolina para probar flujo y presión.',
      icono: Icons.local_gas_station,
    ),
    PruebaActuador(
      modulo: 'ECM / Motor',
      nombre: 'Ventilador de Radiador (Baja/Alta)',
      comandoOn: '2F010203',
      comandoOff: '2F010200',
      descripcion: 'Enciende el electroventilador a máxima velocidad.',
      icono: Icons.toys,
    ),
    PruebaActuador(
      modulo: 'ABS / Frenos',
      nombre: 'Motor de Bomba Hidráulica ABS',
      comandoOn: '2F020103',
      comandoOff: '2F020100',
      descripcion: 'Pone a funcionar la bomba recirculadora de presión del ABS.',
      icono: Icons.disc_full,
    ),
    PruebaActuador(
      modulo: 'EPS / Dirección',
      nombre: 'Test de Calibración Servo EPS',
      comandoOn: '2F030103',
      comandoOff: '2F030100',
      descripcion: 'Envía señal de torque al motor electroasistido para prueba de respuesta.',
      icono: Icons.sports_motorsports,
    ),
    PruebaActuador(
      modulo: 'BCM / Confort',
      nombre: 'Luces / Bocina de Alarma',
      comandoOn: '2F040103',
      comandoOff: '2F040100',
      descripcion: 'Acciona el claxon y luces de emergencia mediante el BCM.',
      icono: Icons.campaign,
    ),
    PruebaActuador(
      modulo: 'HVAC / Aire Acond.',
      nombre: 'Embrague Compresor A/C',
      comandoOn: '2F050103',
      comandoOff: '2F050100',
      descripcion: 'Acopla el magneto del compresor de aire acondicionado.',
      icono: Icons.ac_unit,
    ),
  ];

  Future<void> _ejecutarActuador(PruebaActuador p, bool activar) async {
    if (!widget.elm.conectado) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El escáner no está conectado por Bluetooth.')),
      );
      return;
    }
    setState(() {
      _probando = true;
      _actuadorActivo = activar ? p.nombre : null;
    });

    final cmd = activar ? p.comandoOn : p.comandoOff;
    final estadoTexto = activar ? 'ACTIVAR (ON)' : 'DESACTIVAR (OFF)';
    _log('▶ Pruebas UDS [${p.modulo}] - ${p.nombre} -> $estadoTexto');

    try {
      final resp = await widget.elm.cmd(cmd);
      _log('  Comando enviado: $cmd  |  Respuesta ECU: $resp');
      if (resp.contains('7F') || resp.contains('ERROR')) {
        _log('  ⚠️ La ECU rechazó la prueba (Negative Response 7F / Condición no cumplida).');
      } else {
        _log('  ✓ Actuador ejecutado correctamente por la ECU.');
      }
    } catch (e) {
      _log('  ✗ Error de comunicación: $e');
    } finally {
      if (mounted) setState(() => _probando = false);
    }
  }

  void _log(String txt) {
    if (mounted) setState(() => _logActuador.add(txt));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pruebas de Actuadores (UDS 0x2F)'),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            color: Colors.blue.shade900.withValues(alpha: 0.2),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: Colors.cyanAccent),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Las pruebas bidireccionales activan componentes físicos (reles, bomba ABS, ventilador) enviando tramas UDS 0x2F.',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(10),
              itemCount: _pruebas.length,
              itemBuilder: (context, i) {
                final p = _pruebas[i];
                final esActivo = _actuadorActivo == p.nombre;

                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: Icon(p.icono, color: Colors.cyanAccent, size: 28),
                    title: Text(p.nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    subtitle: Text('${p.modulo} · ${p.descripcion}', style: const TextStyle(fontSize: 11)),
                    trailing: Wrap(
                      spacing: 4,
                      children: [
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: esActivo ? Colors.green : Colors.blue.shade800,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          ),
                          onPressed: _probando ? null : () => _ejecutarActuador(p, true),
                          child: const Text('ON', style: TextStyle(fontWeight: FontWeight.bold)),
                        ),
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          ),
                          onPressed: _probando ? null : () => _ejecutarActuador(p, false),
                          child: const Text('OFF'),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const Divider(height: 1),
          Container(
            height: 140,
            width: double.infinity,
            color: Colors.black38,
            padding: const EdgeInsets.all(10),
            child: SingleChildScrollView(
              reverse: true,
              child: SelectableText(
                _logActuador.isEmpty ? 'Selecciona un actuador arriba para iniciar prueba bidireccional UDS.' : _logActuador.join('\n'),
                style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
