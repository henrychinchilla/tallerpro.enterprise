import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../bluetooth/puente_bt.dart';
import '../obd/elm.dart';

/* Escáner OBD-II.
   Separa y clarifica las 3 etapas del diagnóstico:
     1. ¿el teléfono ve el dongle?          (la lista de dispositivos)
     2. ¿el dongle contesta?                (sonda ATI / ATZ en vivo)
     3. ¿el vehículo contesta?              (PIDs OBD-II)
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
  bool _verAnonimos = false;
  List<Escaner> _lista = [];
  Escaner? _elegido;
  String _estadoConexion = '';

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
      _estadoConexion = 'Buscando escáneres OBD-II alrededor...';
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
      if (l.every((d) => d.anonimo)) {
        _p('Ninguno publica nombre explícito. Si tu escáner es de Bluetooth clásico, '
            'emparejalo primero en los Ajustes › Bluetooth del teléfono.');
      }
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

      // Si falló el transporte inicial (SPP vs BLE), probar el transporte alternativo automáticamente
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
        setState(() => _estadoConexion = '✓ Socket abierto. Enviando consulta ATI/ATZ...');
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
          setState(() => _estadoConexion = '✓ Conectado y respondiendo: $sonda');
        }
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
                  labelText: 'Dirección MAC (ej: 04:25:E8:5B:35:B6)',
                  hintText: 'AA:BB:CC:DD:EE:FF',
                ),
                textCapitalization: TextCapitalization.characters,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('Modo de conexión:'),
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
          Padding(
            padding: const EdgeInsets.all(12),
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
              ],
            ),
          ),
          if (probables.isNotEmpty) ...probables.map(_fila),
          if (anonimos.isNotEmpty)
            ExpansionTile(
              title: Text('${anonimos.length} aparato(s) sin nombre publicitado'),
              subtitle: const Text(
                'Solo comunican su dirección MAC.',
                style: TextStyle(fontSize: 11),
              ),
              initiallyExpanded: _verAnonimos,
              onExpansionChanged: (v) => _verAnonimos = v,
              children: anonimos.map(_fila).toList(),
            ),
          const Divider(height: 1),
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
            if (d.pareceOBD)
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
