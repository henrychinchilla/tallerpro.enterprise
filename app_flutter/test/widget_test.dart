/* Prueba minima de arranque.

   No monta la app entera: `main()` inicializa Supabase, que necesita red y
   almacenamiento, y una prueba que dependa de eso deja de medir la UI para
   medir la conexion. Lo que si se puede verificar sin red es que la pantalla
   de login se dibuja y que un fallo recibido se MUESTRA — que es justamente
   lo que fallaba en la version anterior: el error existia y nadie lo veia. */
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexuspro/pantallas/login.dart';

void main() {
  testWidgets('el login se dibuja y pide correo y contrasena', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: PantallaLogin()));
    expect(find.text('Correo'), findsOneWidget);
    expect(find.text('Contraseña'), findsOneWidget);
    expect(find.text('Entrar'), findsOneWidget);
  });

  testWidgets('un fallo de ingreso se muestra en pantalla, no en un toast', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: PantallaLogin(fallo: 'Invalid login credentials'),
    ));
    expect(find.text('No se pudo entrar'), findsOneWidget);
    expect(find.text('Invalid login credentials'), findsOneWidget);
  });
}
