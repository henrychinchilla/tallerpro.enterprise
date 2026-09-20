import 'dart:async';
import 'package:flutter/material.dart';
import 'elm.dart';

/* Módulo de Datos en Vivo (PIDs en Tiempo Real OBD-II)
   Lectura continua de RPM, Velocidad, Temperatura del Refrigerante, Voltaje de Batería,
   Posición de Mariposa, Avance de Encendido, MAF, MAP y Ajustes de Combustible (Fuel Trim). */

class LecturaPID {
  final String pid;
  final String nombre;
  final double valor;
  final String unidad;
  final double min;
  final double max;
  final String estado; // 'normal' | 'advertencia' | 'critico'

  const LecturaPID({
    required this.pid,
    required this.nombre,
    required this.valor,
    required this.unidad,
    required this.min,
    required this.max,
    this.estado = 'normal',
  });
}

class PantallaPIDsEnVivo extends StatefulWidget {
  final ELM elm;
  const PantallaPIDsEnVivo({super.key, required this.elm});

  @override
  State<PantallaPIDsEnVivo> createState() => _PantallaPIDsEnVivoState();
}

class _PantallaPIDsEnVivoState extends State<PantallaPIDsEnVivo> {
  Timer? _timerLive;
  bool _monitoreando = false;

  double _rpm = 0;
  double _velocidad = 0;
  double _tempCoolant = 0;
  double _voltaje = 12.6;
  double _mariposa = 0;
  double _fuelTrimShort = 0;
  double _fuelTrimLong = 0;
  double _maf = 0;
  double _map = 0;

  @override
  void initState() {
    super.initState();
    if (widget.elm.conectado) {
      _iniciarMonitoreo();
    }
  }

  @override
  void dispose() {
    _timerLive?.cancel();
    super.dispose();
  }

  void _iniciarMonitoreo() {
    setState(() => _monitoreando = true);
    _timerLive = Timer.periodic(const Duration(milliseconds: 600), (_) => _leerRondaPIDs());
  }

  void _detenerMonitoreo() {
    _timerLive?.cancel();
    if (mounted) setState(() => _monitoreando = false);
  }

  Future<void> _leerRondaPIDs() async {
    if (!widget.elm.conectado) return;
    try {
      // 010C: RPM ( (A*256 + B)/4 )
      final rRpm = await widget.elm.cmd('010C', limite: const Duration(milliseconds: 800)).catchError((_) => '');
      _parseRpm(rRpm);

      // 010D: Velocidad ( A km/h )
      final rVel = await widget.elm.cmd('010D', limite: const Duration(milliseconds: 800)).catchError((_) => '');
      _parseVelocidad(rVel);

      // 0105: Temperatura Refrigerante ( A - 40 °C )
      final rTemp = await widget.elm.cmd('0105', limite: const Duration(milliseconds: 800)).catchError((_) => '');
      _parseTemp(rTemp);

      // 0111: Posición Mariposa TPS ( A * 100 / 255 % )
      final rTps = await widget.elm.cmd('0111', limite: const Duration(milliseconds: 800)).catchError((_) => '');
      _parseTps(rTps);

      // 0142: Voltaje del Módulo ( (A*256 + B)/1000 V )
      final rVolt = await widget.elm.cmd('0142', limite: const Duration(milliseconds: 800)).catchError((_) => '');
      _parseVoltaje(rVolt);

      // 0106: Short Term Fuel Trim ( (A - 128) * 100 / 128 % )
      final rStft = await widget.elm.cmd('0106', limite: const Duration(milliseconds: 800)).catchError((_) => '');
      _parseFuelTrim(rStft, esShort: true);

      // 0107: Long Term Fuel Trim ( (A - 128) * 100 / 128 % )
      final rLtft = await widget.elm.cmd('0107', limite: const Duration(milliseconds: 800)).catchError((_) => '');
      _parseFuelTrim(rLtft, esShort: false);

      // 010B: MAP Intake Pressure ( A kPa )
      final rMap = await widget.elm.cmd('010B', limite: const Duration(milliseconds: 800)).catchError((_) => '');
      _parseMap(rMap);

      // 0110: MAF Air Flow ( (A*256 + B)/100 g/s )
      final rMaf = await widget.elm.cmd('0110', limite: const Duration(milliseconds: 800)).catchError((_) => '');
      _parseMaf(rMaf);
    } catch (_) {}
  }

  void _parseRpm(String resp) {
    final hex = _extraerHex(resp, '410C');
    if (hex.length >= 4) {
      final a = int.parse(hex.substring(0, 2), radix: 16);
      final b = int.parse(hex.substring(2, 4), radix: 16);
      final val = ((a * 256) + b) / 4.0;
      if (mounted) setState(() => _rpm = val);
    }
  }

  void _parseVelocidad(String resp) {
    final hex = _extraerHex(resp, '410D');
    if (hex.length >= 2) {
      final val = int.parse(hex.substring(0, 2), radix: 16).toDouble();
      if (mounted) setState(() => _velocidad = val);
    }
  }

  void _parseTemp(String resp) {
    final hex = _extraerHex(resp, '4105');
    if (hex.length >= 2) {
      final val = (int.parse(hex.substring(0, 2), radix: 16) - 40).toDouble();
      if (mounted) setState(() => _tempCoolant = val);
    }
  }

  void _parseTps(String resp) {
    final hex = _extraerHex(resp, '4111');
    if (hex.length >= 2) {
      final a = int.parse(hex.substring(0, 2), radix: 16);
      final val = (a * 100.0) / 255.0;
      if (mounted) setState(() => _mariposa = val);
    }
  }

  void _parseVoltaje(String resp) {
    final hex = _extraerHex(resp, '4142');
    if (hex.length >= 4) {
      final a = int.parse(hex.substring(0, 2), radix: 16);
      final b = int.parse(hex.substring(2, 4), radix: 16);
      final val = ((a * 256) + b) / 1000.0;
      if (mounted) setState(() => _voltaje = val);
    }
  }

  void _parseMap(String resp) {
    final hex = _extraerHex(resp, '410B');
    if (hex.length >= 2) {
      final val = int.parse(hex.substring(0, 2), radix: 16).toDouble();
      if (mounted) setState(() => _map = val);
    }
  }

  void _parseFuelTrim(String resp, {required bool esShort}) {
    final pidHex = esShort ? '4106' : '4107';
    final hex = _extraerHex(resp, pidHex);
    if (hex.length >= 2) {
      final a = int.parse(hex.substring(0, 2), radix: 16);
      final val = ((a - 128) * 100.0) / 128.0;
      if (mounted) {
        setState(() {
          if (esShort) {
            _fuelTrimShort = val;
          } else {
            _fuelTrimLong = val;
          }
        });
      }
    }
  }

  void _parseMaf(String resp) {
    final hex = _extraerHex(resp, '4110');
    if (hex.length >= 4) {
      final a = int.parse(hex.substring(0, 2), radix: 16);
      final b = int.parse(hex.substring(2, 4), radix: 16);
      final val = ((a * 256) + b) / 100.0;
      if (mounted) setState(() => _maf = val);
    }
  }

  String _extraerHex(String resp, String marca) {
    final limpio = resp.replaceAll(RegExp(r'[^0-9A-Fa-f]'), '').toUpperCase();
    final idx = limpio.indexOf(marca);
    if (idx < 0) return '';
    return limpio.substring(idx + marca.length);
  }

  @override
  Widget build(BuildContext context) {
    final tempCritica = _tempCoolant > 105;
    final tempAdvertencia = _tempCoolant > 95 && !tempCritica;
    final voltBajo = _voltaje < 11.8;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Datos en Vivo (PIDs OBD-II)'),
        actions: [
          IconButton(
            icon: Icon(_monitoreando ? Icons.pause_circle_filled : Icons.play_circle_fill),
            color: _monitoreando ? Colors.amber : Colors.greenAccent,
            onPressed: () {
              if (_monitoreando) {
                _detenerMonitoreo();
              } else {
                _iniciarMonitoreo();
              }
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          // Tarjeta principal RPM & Velocidad
          Row(
            children: [
              Expanded(
                child: _tarjetaReloj(
                  titulo: 'Revoluciones (RPM)',
                  valor: _rpm.toStringAsFixed(0),
                  unidad: 'RPM',
                  progreso: (_rpm / 7000.0).clamp(0.0, 1.0),
                  color: _rpm > 5000 ? Colors.redAccent : Colors.cyanAccent,
                  icono: Icons.speed,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _tarjetaReloj(
                  titulo: 'Velocidad',
                  valor: _velocidad.toStringAsFixed(0),
                  unidad: 'km/h',
                  progreso: (_velocidad / 200.0).clamp(0.0, 1.0),
                  color: Colors.greenAccent,
                  icono: Icons.directions_run,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Tarjetas de Sensores Clave
          _tarjetaSensor(
            nombre: 'Temperatura Refrigerante Motor (ECT)',
            valor: '${_tempCoolant.toStringAsFixed(1)} °C',
            progreso: ((_tempCoolant + 40) / 160.0).clamp(0.0, 1.0),
            color: tempCritica ? Colors.redAccent : (tempAdvertencia ? Colors.amber : Colors.blueAccent),
            estadoText: tempCritica ? '🚨 Sobrecalentamiento' : (tempAdvertencia ? '⚠️ Alta' : '✓ Normal'),
            icono: Icons.thermostat,
          ),
          const SizedBox(height: 8),

          _tarjetaSensor(
            nombre: 'Voltaje del Módulo / Alternador',
            valor: '${_voltaje.toStringAsFixed(2)} V',
            progreso: ((_voltaje - 9) / 6.0).clamp(0.0, 1.0),
            color: voltBajo ? Colors.orangeAccent : Colors.lightGreenAccent,
            estadoText: voltBajo ? '⚠️ Batería Baja (<11.8V)' : '✓ Carga Correcta',
            icono: Icons.battery_charging_full,
          ),
          const SizedBox(height: 8),

          _tarjetaSensor(
            nombre: 'Posición de Mariposa de Aceleración (TPS)',
            valor: '${_mariposa.toStringAsFixed(1)} %',
            progreso: (_mariposa / 100.0).clamp(0.0, 1.0),
            color: Colors.purpleAccent,
            estadoText: 'Apertura sensor TPS',
            icono: Icons.tune,
          ),
          const SizedBox(height: 8),

          _tarjetaSensor(
            nombre: 'Ajuste Combustible Corto Plazo (STFT)',
            valor: '${_fuelTrimShort >= 0 ? "+" : ""}${_fuelTrimShort.toStringAsFixed(1)} %',
            progreso: ((_fuelTrimShort + 25) / 50.0).clamp(0.0, 1.0),
            color: _fuelTrimShort.abs() > 15 ? Colors.amberAccent : Colors.tealAccent,
            estadoText: _fuelTrimShort > 15 ? 'Mezcla Pobre (+Rica)' : (_fuelTrimShort < -15 ? 'Mezcla Rica (-Pobre)' : '✓ Balanceado'),
            icono: Icons.local_gas_station,
          ),
          const SizedBox(height: 8),

          _tarjetaSensor(
            nombre: 'Ajuste Combustible Largo Plazo (LTFT)',
            valor: '${_fuelTrimLong >= 0 ? "+" : ""}${_fuelTrimLong.toStringAsFixed(1)} %',
            progreso: ((_fuelTrimLong + 25) / 50.0).clamp(0.0, 1.0),
            color: _fuelTrimLong.abs() > 15 ? Colors.orangeAccent : Colors.greenAccent,
            estadoText: _fuelTrimLong > 15 ? 'Corrección Almacenada Pobre' : (_fuelTrimLong < -15 ? 'Corrección Almacenada Rica' : '✓ Normal'),
            icono: Icons.ev_station,
          ),
          const SizedBox(height: 8),

          _tarjetaSensor(
            nombre: 'Presión Múltiple Admisión (MAP)',
            valor: '${_map.toStringAsFixed(0)} kPa',
            progreso: (_map / 255.0).clamp(0.0, 1.0),
            color: Colors.deepOrangeAccent,
            estadoText: 'Presión en Manifold',
            icono: Icons.compress,
          ),
          const SizedBox(height: 8),

          _tarjetaSensor(
            nombre: 'Flujo de Aire de Admisión (MAF)',
            valor: '${_maf.toStringAsFixed(2)} g/s',
            progreso: (_maf / 150.0).clamp(0.0, 1.0),
            color: Colors.indigoAccent,
            estadoText: 'Lectura sensor masa de aire',
            icono: Icons.air,
          ),
        ],
      ),
    );
  }

  Widget _tarjetaReloj({
    required String titulo,
    required String valor,
    required String unidad,
    required double progreso,
    required Color color,
    required IconData icono,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icono, color: color, size: 20),
                const SizedBox(width: 6),
                Text(titulo, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 12),
            Text(valor, style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: color)),
            Text(unidad, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            const SizedBox(height: 12),
            LinearProgressIndicator(value: progreso, color: color, backgroundColor: Colors.white12),
          ],
        ),
      ),
    );
  }

  Widget _tarjetaSensor({
    required String nombre,
    required String valor,
    required double progreso,
    required Color color,
    required String estadoText,
    required IconData icono,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icono, color: color, size: 22),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                ),
                Text(valor, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: color)),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: LinearProgressIndicator(
                    value: progreso,
                    color: color,
                    backgroundColor: Colors.white10,
                  ),
                ),
                const SizedBox(width: 10),
                Text(estadoText, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
