/* Lectura de códigos de falla.

   Esto se prueba sin vehículo y sin Bluetooth porque la parte que se puede
   equivocar es pura: convertir la respuesta cruda del adaptador en códigos.

   Y equivocarse aquí no da un error — da códigos EQUIVOCADOS, que es la peor
   manera de fallar que tiene un escáner: manda a cambiar la pieza que no era.
   El caso que lo destapa es el byte de CANTIDAD que CAN antepone y que
   ISO 9141 / KWP2000 no traen. */
import 'package:flutter_test/flutter_test.dart';
import 'package:nexuspro/obd/elm.dart';

void main() {
  group('modo 03 en CAN (protocolo 6 en adelante)', () {
    test('salta el byte de cantidad y lee los códigos reales', () {
      // 43 02 -> dos codigos: 0130 y 0200
      expect(ELM.interpretarDTCs('430201300200', '03', 6), ['P0130', 'P0200']);
    });

    test('un solo código', () {
      expect(ELM.interpretarDTCs('43010301', '03', 6), ['P0301']);
    });

    test('sin códigos: 43 00 y relleno', () {
      expect(ELM.interpretarDTCs('43000000', '03', 6), isEmpty);
    });

    test('NO saltar la cantidad daría un código inventado', () {
      /* Es el bug que esta prueba existe para impedir: leyendo desde el byte de
         cantidad, los bytes se corren uno y sale 'P0201' — un código que el
         vehículo nunca reportó — en vez de P0130. */
      final malo = ELM.interpretarDTCs('430201300200', '03', 0);
      expect(malo, isNot(contains('P0130')));
      expect(malo, contains('P0201'));
    });
  });

  group('modo 03 en K-line (ISO 9141 / KWP2000)', () {
    test('NO hay byte de cantidad: los códigos empiezan de una', () {
      expect(ELM.interpretarDTCs('4301300200', '03', 3), ['P0130', 'P0200']);
    });
  });

  group('modo 07 (pendientes)', () {
    test('usa la marca 47, no 43', () {
      expect(ELM.interpretarDTCs('470101710000', '07', 6), ['P0171']);
    });

    test('si la marca no aparece, no inventa nada', () {
      expect(ELM.interpretarDTCs('7F0312', '07', 6), isEmpty);
    });
  });

  group('las cuatro familias de SAE J2012', () {
    test('P, C, B y U salen de los dos bits más altos', () {
      /* La familia sale del PRIMER NIBBLE: 0-3 = P, 4-7 = C, 8-B = B, C-F = U.
         Por eso B2345 se escribe 'A345' y U0100 se escribe 'C100' — calcularlo
         "a ojo" es justo lo que hace que una prueba mienta. */
      expect(ELM.interpretarDTCs('4304013052 34A345C100'.replaceAll(' ', ''), '03', 6),
          ['P0130', 'C1234', 'B2345', 'U0100']);
    });

    test('el primer dígito sale de los dos bits siguientes', () {
      // Primer nibble 1 -> familia P (1 >> 2 = 0), primer dígito 1 (1 & 3).
      expect(ELM.interpretarDTCs('43011301', '03', 6), ['P1301']);
    });
  });

  test('los códigos repetidos no se duplican', () {
    expect(ELM.interpretarDTCs('43020130' '0130', '03', 6), ['P0130']);
  });

  test('basura a medias no revienta', () {
    expect(() => ELM.interpretarDTCs('4302013', '03', 6), returnsNormally);
    expect(ELM.interpretarDTCs('', '03', 6), isEmpty);
  });
}
