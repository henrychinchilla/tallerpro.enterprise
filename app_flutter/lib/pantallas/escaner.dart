import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../bluetooth/puente_bt.dart';
import '../obd/elm.dart';
import '../obd/dtc_diccionario.dart';
import '../obd/actuadores.dart';
import '../obd/pids_envivo.dart';
import 'modulo_web.dart';

/* Escáner OBD-II Nativo NexusPro Enterprise.
   Cubre el ciclo completo de diagnóstico:
     1. Enlace Bluetooth (SPP Clásico y BLE)
     2. Identificación de Vehículo (0100) y VIN (0902)
     3. Lectura e Interpretación de Códigos DTC (03, 07)
     4. Procedimientos de Reparación y Enlaces a YouTube
     5. Borrado de Códigos DTC (04)
     6. Pruebas de Actuadores Bidireccionales (UDS 0x2F)
*/
class PantallaEscaner extends StatefulWidget {
  const PantallaEscaner({super.key});
  @override
  State<PantallaEscaner> createState() => _PantallaEscanerState();
}

class _PantallaEscanerState extends State<PantallaEscaner> {
  final _elm = ELM();
  final _log = <String>[];

  bool _ocupado = false;
  bool _escaneandoVehiculo = false;
  bool _verAnonimos = false;

  List<Escaner> _lista = [];
  Escaner? _elegido;
  String _estadoConexion = '';

  List<InfoDTC> _codigosEncontrados = [];
  String? _protocoloDetectado;
  String? _vinDetectado;

  @override
  void initState() {
    super.initState();
    _elm.engancharse();
  }

  @override
  void dispose() {
    PuenteBT.desconectar();
    _elm.soltar();
    super.dispose();
  }

  void _p(String linea) {
    _elm.apuntar(linea);
    if (mounted) setState(() => _log.add(linea));
  }

  Future<void> _buscar() async {
    if (_ocupado) return;
    setState(() {
      _ocupado = true;
      _lista = [];
      _elegido = null;
      _estadoConexion = 'Buscando escáneres OBD-II...';
    });
    try {
      final est = await PuenteBT.estado();
      if (est['disponible'] != true) {
        _p('✗ Este teléfono no cuenta con hardware Bluetooth disponible.');
        return;
      }
      if (est['encendido'] != true) {
        _p('✗ El Bluetooth está apagado. Encendelo en los ajustes del teléfono.');
        return;
      }

      _p('Buscando escáneres (emparejados y BLE cercanos)…');
      final l = await PuenteBT.listar();
      setState(() {
        _lista = l;
        _estadoConexion = '${l.length} escáner(es) detectado(s).';
      });
      final identificables = l.where((d) => !d.anonimo).length;
      _p('${l.length} aparato(s) detectado(s) · $identificables identificable(s).');
    } on PlatformException catch (e) {
      _p('✗ ${e.message ?? e.code}');
    } catch (e) {
      _p('✗ $e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _conectarYProbar(Escaner d) async {
    if (_ocupado) return;
    setState(() {
      _ocupado = true;
      _elegido = d;
      _estadoConexion = 'Iniciando conexión a ${d.titulo}...';
    });
    try {
      _p('Conectando a ${d.nombre} (${d.esBle ? 'BLE' : 'Bluetooth clásico (SPP)'})...');

      EventoBT? evt = await _intentarConexionTransporte(d);

      if (evt?.evento != 'conectado') {
        final altTipo = d.esBle ? 'spp' : 'ble';
        _p('⚠️ Falló transporte ${d.tipo.toUpperCase()}: ${evt?.detalle ?? "Sin respuesta"}. Probando alternativo (${altTipo.toUpperCase()})...');
        if (mounted) {
          setState(() => _estadoConexion = 'Probando transporte alternativo (${altTipo.toUpperCase()})...');
        }

        await PuenteBT.desconectar();
        final escAlt = Escaner(
          nombre: d.nombre,
          mac: d.mac,
          tipo: altTipo,
          vinculado: d.vinculado,
          rssi: d.rssi,
          sinNombre: d.sinNombre,
        );
        evt = await _intentarConexionTransporte(escAlt);
      }

      if (evt?.evento != 'conectado') {
        _p('✗ Error de conexión con ${d.nombre}: ${evt?.detalle ?? "No respondió"}');
        if (mounted) {
          setState(() => _estadoConexion = '✗ Falló conexión: ${evt?.detalle ?? "Sin respuesta"}');
        }
        return;
      }

      _elm.marcarConectado(true);
      if (mounted) {
        setState(() => _estadoConexion = '✓ Socket abierto. Probando ATI/ATZ...');
      }
      _p('Socket abierto con éxito. Sondando ATI/ATZ...');

      var sonda = await _elm.sondear();
      if (sonda.isEmpty) {
        _p('✗ Conectó el socket pero el dongle no respondió a ATI. Verificá que el vehículo esté en contacto (switch ON).');
        if (mounted) {
          setState(() => _estadoConexion = '⚠️ Sin respuesta ATI del escáner (Switch en OFF?).');
        }
      } else {
        _p('✓ Respuesta ATI recibida: $sonda');
        if (mounted) {
          setState(() => _estadoConexion = '✓ Conectado: $sonda. Iniciando diagnóstico...');
        }
        // Iniciar escaneo automático de vehículo y códigos DTC
        await _iniciarEscaneoVehiculoYCodigos();
      }
    } catch (e) {
      _p('✗ Excepción durante la conexión: $e');
      if (mounted) {
        setState(() => _estadoConexion = '✗ Error: $e');
      }
    } finally {
      if (mounted) {
        setState(() => _ocupado = false);
      }
    }
  }

  Future<void> _iniciarEscaneoVehiculoYCodigos() async {
    setState(() {
      _escaneandoVehiculo = true;
      _estadoConexion = '🔍 Inicializando vehículo y leyendo DTCs...';
    });

    try {
      _p('🔍 Inicializando protocolo de comunicación con el vehículo (0100)...');
      _protocoloDetectado = await _elm.iniciar(_p);
      _p('✓ Protocolo detectado: $_protocoloDetectado');

      _p('🔍 Solicitando VIN del vehículo (Modo 09 02)...');
      _vinDetectado = await _elm.leerVIN();
      if (_vinDetectado != null && _vinDetectado!.isNotEmpty) {
        _p('✓ VIN detectado: $_vinDetectado');
      } else {
        _p('ℹ VIN no reportado por la ECU.');
      }

      _p('🔍 Leyendo códigos de falla confirmados (Modo 03)...');
      final dtcs03 = await _elm.leerDTCs('03');
      _p('🔍 Leyendo códigos de falla pendientes (Modo 07)...');
      final dtcs07 = await _elm.leerDTCs('07');

      final todosCodigos = {...dtcs03, ...dtcs07}.toList();
      _p('✓ Lectura finalizada: ${todosCodigos.length} código(s) detectado(s): ${todosCodigos.join(', ')}');

      final infoLista = todosCodigos.map((c) => DiccionarioDTC.buscar(c)).toList();
      if (mounted) {
        setState(() {
          _codigosEncontrados = infoLista;
          _estadoConexion = '✓ Escaneo finalizado. ${infoLista.length} código(s) de falla encontrados.';
        });
      }
    } catch (e) {
      _p('✗ Error durante el escaneo del vehículo: $e');
      if (mounted) {
        setState(() => _estadoConexion = '⚠️ Error en escaneo vehículo: $e');
      }
    } finally {
      if (mounted) {
        setState(() => _escaneandoVehiculo = false);
      }
    }
  }

  Future<void> _borrarCodigosDTC() async {
    if (!_elm.conectado) return;
    setState(() => _escaneandoVehiculo = true);
    _p('🧹 Enviando orden de borrado de códigos de falla (Modo 04 CLEAR DTCs)...');
    try {
      final resp = await _elm.cmd('04', limite: const Duration(seconds: 10));
      _p('✓ Respuesta de borrado: $resp');
      _p('🔄 Re-escaneando vehículo para verificar limpieza...');
      await _iniciarEscaneoVehiculoYCodigos();
    } catch (e) {
      _p('✗ Error al borrar códigos: $e');
    } finally {
      if (mounted) setState(() => _escaneandoVehiculo = false);
    }
  }

  Future<EventoBT?> _intentarConexionTransporte(Escaner d) async {
    final completer = Completer<EventoBT>();
    StreamSubscription<EventoBT>? sub;

    sub = PuenteBT.eventos.listen((evt) {
      if (evt.evento == 'probando') {
        _p('⏳ ${evt.detalle}');
        if (mounted) setState(() => _estadoConexion = evt.detalle);
      } else if (evt.evento == 'conectado' || evt.evento == 'error' || evt.evento == 'cerrado') {
        if (!completer.isCompleted) completer.complete(evt);
      }
    });

    try {
      await PuenteBT.conectar(d);
      return await completer.future.timeout(
        const Duration(seconds: 25),
        onTimeout: () => const EventoBT('error', 'El tiempo de espera (timeout 25s) se agotó.'),
      );
    } catch (e) {
      return EventoBT('error', e.toString());
    } finally {
      await sub.cancel();
    }
  }

  void _copiarBitacora() {
    final texto = _log.join('\n');
    Clipboard.setData(ClipboardData(text: texto));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Bitácora copiada al portapapeles.')),
    );
  }

  Future<void> _conectarMacManual() async {
    final txtCtrl = TextEditingController();
    bool esBle = false;

    final mac = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Ingresar Dirección MAC Manual'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: txtCtrl,
                decoration: const InputDecoration(
                  labelText: 'Dirección MAC o ID Dongle (ej: 979869044587)',
                  hintText: 'AA:BB:CC:DD:EE:FF ó ID 979869044587',
                ),
                textCapitalization: TextCapitalization.characters,
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.cyanAccent,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                ),
                icon: const Icon(Icons.flash_on, size: 14),
                label: const Text('Usar Thinkcar Dongle (979869044587)', style: TextStyle(fontSize: 11)),
                onPressed: () {
                  txtCtrl.text = '979869044587';
                },
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('Modo:'),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: const Text('SPP Clásico'),
                    selected: !esBle,
                    onSelected: (v) => setDialogState(() => esBle = !v),
                  ),
                  const SizedBox(width: 6),
                  ChoiceChip(
                    label: const Text('BLE'),
                    selected: esBle,
                    onSelected: (v) => setDialogState(() => esBle = v),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, txtCtrl.text.trim()),
              child: const Text('Conectar'),
            ),
          ],
        ),
      ),
    );

    if (mac != null && mac.isNotEmpty) {
      final esc = Escaner(
        nombre: 'Manual ($mac)',
        mac: mac,
        tipo: esBle ? 'ble' : 'spp',
        vinculado: true,
      );
      await _conectarYProbar(esc);
    }
  }

  @override
  Widget build(BuildContext context) {
    final probables = _lista.where((d) => d.rango < 3).toList();
    final anonimos = _lista.where((d) => d.rango == 3).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Diagnóstico OBD-II'),
        actions: [
          IconButton(
            tooltip: 'Copiar bitácora técnica',
            icon: const Icon(Icons.receipt_long),
            onPressed: _copiarBitacora,
          ),
        ],
      ),
      body: Column(
        children: [
          // Barra de controles superiores
          Padding(
            padding: const EdgeInsets.all(10),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                FilledButton.icon(
                  onPressed: _ocupado ? null : _buscar,
                  icon: const Icon(Icons.search),
                  label: Text(_ocupado ? 'Buscando…' : 'Buscar escáneres Bluetooth'),
                ),
                OutlinedButton.icon(
                  onPressed: _ocupado ? null : _conectarMacManual,
                  icon: const Icon(Icons.edit),
                  label: const Text('Ingresar MAC manual'),
                ),
                if (_elm.conectado)
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.green.shade800),
                    onPressed: _escaneandoVehiculo ? null : _iniciarEscaneoVehiculoYCodigos,
                    icon: const Icon(Icons.autorenew),
                    label: Text(_escaneandoVehiculo ? 'Escaneando…' : 'Re-escanear vehículo'),
                  ),
              ],
            ),
          ),

          // Si hay conexión y vehículo detectado, mostrar resumen del vehículo y acciones
          if (_protocoloDetectado != null || _codigosEncontrados.isNotEmpty) ...[
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.indigo.shade900.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.cyan.withValues(alpha: 0.4)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.directions_car, color: Colors.cyanAccent),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Vehículo: ${_vinDetectado ?? "VIN no reportado"}',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: _codigosEncontrados.isEmpty ? Colors.green.withValues(alpha: 0.2) : Colors.red.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _codigosEncontrados.isEmpty ? Colors.green : Colors.red),
                        ),
                        child: Text(
                          _codigosEncontrados.isEmpty ? '✓ Sin fallas' : '🚨 ${_codigosEncontrados.length} DTC(s)',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: _codigosEncontrados.isEmpty ? Colors.greenAccent : Colors.redAccent,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_protocoloDetectado != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Protocolo: $_protocoloDetectado',
                      style: const TextStyle(fontSize: 11, color: Colors.white70),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.teal.shade800,
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        ),
                        icon: const Icon(Icons.speed, size: 16),
                        label: const Text('PIDs y Datos en Vivo', style: TextStyle(fontSize: 11)),
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => PantallaPIDsEnVivo(elm: _elm)),
                        ),
                      ),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red.shade900,
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        ),
                        icon: const Icon(Icons.delete_forever, size: 16),
                        label: const Text('Borrar Códigos (Modo 04)', style: TextStyle(fontSize: 11)),
                        onPressed: _escaneandoVehiculo ? null : _borrarCodigosDTC,
                      ),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.purple.shade800,
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        ),
                        icon: const Icon(Icons.touch_app, size: 16),
                        label: const Text('Pruebas Actuadores UDS 0x2F', style: TextStyle(fontSize: 11)),
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => PantallaActuadoresUDS(elm: _elm)),
                        ),
                      ),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        ),
                        icon: const Icon(Icons.open_in_browser, size: 16),
                        label: const Text('Diagnóstico Completo Web', style: TextStyle(fontSize: 11)),
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const PantallaModuloWeb(
                              titulo: 'Diagnóstico OBD-II Enterprise',
                              moduloId: 'diagnostico_obd',
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],

          // Lista de códigos de falla DTC detectados
          if (_codigosEncontrados.isNotEmpty)
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                itemCount: _codigosEncontrados.length,
                itemBuilder: (context, idx) {
                  final dtc = _codigosEncontrados[idx];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    color: Colors.grey.shade900,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: Colors.red.shade900,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  dtc.codigo,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.white),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(dtc.titulo, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                    Text(dtc.sistema, style: const TextStyle(fontSize: 11, color: Colors.cyanAccent)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(dtc.descripcion, style: const TextStyle(fontSize: 12, color: Colors.white70)),
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.black45,
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: Colors.white12),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Procedimiento de Reparación:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: Colors.amberAccent)),
                                const SizedBox(height: 4),
                                Text(dtc.procedimiento, style: const TextStyle(fontSize: 11, height: 1.4)),
                              ],
                            ),
                          ),
                          const SizedBox(height: 8),
                          Align(
                            alignment: Alignment.centerRight,
                            child: ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.red.shade700,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              ),
                              icon: const Icon(Icons.play_circle_fill, size: 18),
                              label: Text('📺 Ver Guía YouTube (${dtc.codigo})', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => PantallaModuloWeb(
                                      titulo: 'Guía YouTube ${dtc.codigo}',
                                      moduloId: 'youtube',
                                      urlEspecifica: dtc.youtubeUrl,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            )
          else if (_lista.isNotEmpty && !_elm.conectado) ...[
            if (probables.isNotEmpty) ...probables.map(_fila),
            if (anonimos.isNotEmpty)
              ExpansionTile(
                title: Text('${anonimos.length} aparato(s) sin nombre publicitado'),
                subtitle: const Text('Solo comunican su dirección MAC.', style: TextStyle(fontSize: 11)),
                initiallyExpanded: _verAnonimos,
                onExpansionChanged: (v) => _verAnonimos = v,
                children: anonimos.map(_fila).toList(),
              ),
          ],

          const Divider(height: 1),
          // Consola de traza técnica inferior
          if (_codigosEncontrados.isEmpty || !_elm.conectado)
            Expanded(
              child: Container(
                width: double.infinity,
                color: Colors.black26,
                padding: const EdgeInsets.all(12),
                child: SingleChildScrollView(
                  reverse: true,
                  child: SelectableText(
                    _log.isEmpty
                        ? 'Enchufá el escáner al vehículo, poné el switch en contacto y tocá "Buscar escáneres Bluetooth".'
                        : _log.join('\n'),
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _fila(Escaner d) {
    final esSeleccionado = _elegido?.mac == d.mac;
    final estaConectando = esSeleccionado && _ocupado;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      color: esSeleccionado ? Colors.blue.shade900.withValues(alpha: 0.3) : null,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: esSeleccionado ? Colors.cyan : Colors.transparent,
          width: esSeleccionado ? 1.5 : 0,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        leading: Icon(
          d.esBle ? Icons.bluetooth : Icons.settings_input_antenna,
          color: d.pareceOBD ? Colors.greenAccent : Colors.cyan,
          size: 28,
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                d.titulo,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              ),
            ),
            if (d.nombre.contains('979869044587') || d.nombre.toLowerCase().contains('thinkcar') || d.mac.contains('9798'))
              Container(
                margin: const EdgeInsets.only(left: 4),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.cyan.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: Colors.cyanAccent),
                ),
                child: const Text('Thinkcar 9798', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.cyanAccent)),
              )
            else if (d.pareceOBD)
              Container(
                margin: const EdgeInsets.only(left: 4),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: Colors.green.withValues(alpha: 0.5)),
                ),
                child: const Text('Recomendado OBD', style: TextStyle(fontSize: 10, color: Colors.greenAccent)),
              ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 2),
            Text(
              [
                d.esBle ? 'BLE' : 'Bluetooth clásico (SPP)',
                d.vinculado ? 'Emparejado' : 'No emparejado',
                if (d.rssi != -1) '${d.rssi} dBm',
                d.mac,
              ].join(' · '),
              style: const TextStyle(fontSize: 11, color: Colors.white70),
            ),
            if (esSeleccionado && _estadoConexion.isNotEmpty) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  if (estaConectando)
                    const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.cyanAccent),
                    ),
                  if (estaConectando) const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      _estadoConexion,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: _estadoConexion.contains('✓')
                            ? Colors.greenAccent
                            : (_estadoConexion.contains('✗') ? Colors.redAccent : Colors.cyanAccent),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
        trailing: estaConectando
            ? OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.redAccent,
                  side: const BorderSide(color: Colors.redAccent),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                ),
                icon: const Icon(Icons.stop, size: 16),
                label: const Text('Cancelar', style: TextStyle(fontSize: 12)),
                onPressed: () async {
                  await PuenteBT.desconectar();
                  if (mounted) {
                    setState(() {
                      _ocupado = false;
                      _estadoConexion = 'Conexión cancelada por el usuario.';
                    });
                  }
                },
              )
            : ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: d.pareceOBD ? Colors.blue.shade700 : Theme.of(context).colorScheme.primaryContainer,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                ),
                icon: const Icon(Icons.bluetooth_connected, size: 16),
                label: const Text('🔌 Conectar', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                onPressed: _ocupado ? null : () => _conectarYProbar(d),
              ),
      ),
    );
  }
}
