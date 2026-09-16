/* Configuración de NexusPro nativa.

   El backend NO se rehace: son el mismo proyecto de Supabase, las mismas
   tablas y las mismas políticas RLS que usa el sitio web. Lo único que cambia
   es la interfaz. Por eso estas dos constantes son exactamente las de
   js/core/config.js — si alguna vez se mueven allá, se mueven aquí. */

/// La `anon key` es pública por diseño: viaja en el bundle del sitio y lo que
/// protege los datos es RLS, no el secreto de esta cadena. No confundirla con
/// la `service_role`, que NUNCA debe estar en un cliente.
const String supabaseUrl = 'https://oanguccrxleznozumpbi.supabase.co';
const String supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hbmd1Y2NyeGxlem5venVtcGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODk4MzEsImV4cCI6MjA5Mjk2NTgzMX0.DcQS5AMHV3s4k-tvLlpb8ZWzkODPOSaiQjP1rLJVPAs';

/// Nombre visible del producto.
const String nombreApp = 'NexusPro';
