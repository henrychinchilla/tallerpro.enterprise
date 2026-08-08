/* ═══════════════════════════════════════════════════════
   GIROS DE NEGOCIO — qué forma tiene un artículo según el rubro

   La app nació para taller mecánico y el inventario quedó con esa forma. Un
   quintal de maíz no tiene "motor compatible", y un cilindro de refrigerante
   no se cuenta en piezas: se cuenta en libras de gas, que es lo que se cobra.

   Acá vive esa diferencia, en datos y no en ifs desparramados: cada giro dice
   qué campos propios tiene, con qué unidades se mide y cómo se categoriza.
   Inventario, Proveedores, POS y los módulos verticales leen de acá, así que
   sumar un giro nuevo es agregar una entrada — no tocar cinco pantallas.

   SOBRE LAS UNIDADES: son las que se usan de verdad en Guatemala, con su
   equivalencia real, no las del sistema métrico de manual. **El kilogramo casi
   no se usa**: acá se pesa en libras y quintales, se mide en yardas y pies, y
   se vende por galón. Va último en las listas, pero no se borra — hay
   artículos cargados con él.
     · quintal = 100 libras = 45.359 kg  (grano, azúcar, cal, cemento)
     · arroba  = 25 libras  = 11.34 kg   (frutas, verduras, café)
     · saco    = presentación, NO peso fijo: hay de 100 lb, de 50 y de 25,
                 por eso lleva su propio campo de contenido en vez de asumir.
     · tonelada métrica = 1000 kg = 22.046 quintales
     · galón   = 3.785 l (el estadounidense; el imperial daría 20% de más)
     · yarda = 0.9144 m · pie = 0.3048 m · pulgada = 0.0254 m
     · vaso    = 250 ml POR CONVENCIÓN de cocina, no es unidad legal
   Cada familia (peso, volumen, longitud) se convierte por separado: tres
   galones no son metros, y forzar el número sería inventar.
═══════════════════════════════════════════════════════ */

const GIROS = {
  mecanico: {
    label: 'Taller mecánico', icon: '🔧',
    modulos: ['ordenes', 'vehiculos', 'diagnostico_obd'],
    unidades: ['pieza', 'unidad', 'juego', 'par', 'litro', 'galón', 'mililitro', 'onza', 'libra', 'metro', 'pulgada', 'pie', 'caja', 'kg'],
    categorias: ['Motor', 'Frenos', 'Suspensión', 'Eléctrico', 'Transmisión', 'Filtros',
                 'Lubricantes', 'Llantas', 'Carrocería', 'Accesorios', 'Herramienta'],
    /* Los campos de este giro son COLUMNAS reales de la tabla (la app nació
       así). Se declaran igual para que el formulario se arme del mismo modo
       que los demás; `col: true` avisa que no van al jsonb. */
    campos: [
      { id: 'num_parte_oem',   col: true, label: 'Número de parte (OEM)', tipo: 'texto', ph: 'OEM / referencia de fábrica' },
      { id: 'estado_articulo', col: true, label: 'Estado', tipo: 'lista', opciones: ['nuevo', 'usado', 'remanufacturado'] },
      { id: 'compat_marca',    col: true, label: 'Marca compatible',  tipo: 'texto', ph: 'Toyota, Honda...' },
      { id: 'compat_modelo',   col: true, label: 'Modelo compatible', tipo: 'texto', ph: 'Corolla, Civic...' },
      { id: 'compat_anio_ini', col: true, label: 'Año desde', tipo: 'entero', ph: '2010' },
      { id: 'compat_anio_fin', col: true, label: 'Año hasta', tipo: 'entero', ph: '2018' },
      { id: 'compat_motor',    col: true, label: 'Motor',     tipo: 'texto', ph: '1.8L, 2.0 Turbo' },
    ],
  },

  granos: {
    label: 'Granos y semillas', icon: '🌽',
    modulos: ['venta_granos'],
    /* El quintal manda: es como se compra, como se vende y como lo publica el
       MAGA. El saco va aparte porque NO es una unidad de peso. */
    unidades: ['quintal', 'libra', 'arroba', 'saco', 'bolsa', 'tonelada', 'gramo', 'onza', 'kg'],
    categorias: ['Maíz', 'Frijol', 'Arroz', 'Sorgo (maicillo)', 'Soya', 'Trigo',
                 'Ajonjolí', 'Semilla certificada', 'Subproducto'],
    campos: [
      { id: 'variedad',    label: 'Variedad',   tipo: 'texto', ph: 'Blanco, amarillo, ICTA B-7...' },
      { id: 'cosecha',     label: 'Cosecha',    tipo: 'texto', ph: 'Primera 2026, segunda...' },
      { id: 'humedad_pct', label: 'Humedad (%)', tipo: 'decimal', ph: '14',
        ayuda: 'Arriba de 14% el grano se calienta en bodega y se pierde. Es lo primero que mide el comprador.' },
      { id: 'impureza_pct', label: 'Impureza (%)', tipo: 'decimal', ph: '2' },
      { id: 'origen',      label: 'Procedencia', tipo: 'texto', ph: 'Petén, importado...' },
      { id: 'peso_saco_lb', label: 'Libras por saco', tipo: 'decimal', ph: '100',
        ayuda: 'El saco no es una medida fija: hay de 100 lb, de 50 y de 25. Sin este dato no se puede convertir a quintales.' },
    ],
  },

  refrigeracion: {
    label: 'Refrigeración y A/C', icon: '❄️',
    modulos: ['refrigeracion'],
    /* El gas se cobra por libra aunque venga en cilindro: el cilindro es el
       envase. Por eso están los dos y el cilindro lleva su contenido. */
    unidades: ['libra', 'cilindro', 'onza', 'gramo', 'litro', 'galón', 'pieza', 'metro', 'pie', 'pulgada', 'juego', 'kg'],
    categorias: ['Refrigerante', 'Compresores', 'Condensadores', 'Evaporadores',
                 'Filtros secadores', 'Tubería y accesorios', 'Controles y termostatos',
                 'Aceites y químicos', 'Herramienta especializada'],
    campos: [
      { id: 'refrigerante',   label: 'Tipo de gas', tipo: 'lista',
        opciones: ['R-134a', 'R-410A', 'R-22', 'R-404A', 'R-600a', 'R-290', 'R-32', 'R-1234yf', 'no aplica'],
        ayuda: 'No son intercambiables: cargar el gas equivocado destruye el compresor.' },
      { id: 'contenido_lb',   label: 'Libras por cilindro', tipo: 'decimal', ph: '25',
        ayuda: 'Para saber cuánto gas queda de verdad cuando el cilindro está a medias.' },
      { id: 'btu',            label: 'Capacidad (BTU)', tipo: 'entero', ph: '12000' },
      { id: 'voltaje',        label: 'Voltaje', tipo: 'lista', opciones: ['110V', '220V', '440V', '12V', 'no aplica'] },
      { id: 'compat_equipo',  label: 'Equipo compatible', tipo: 'texto', ph: 'Minisplit, cuarto frío, vitrina...' },
    ],
  },

  electronica: {
    label: 'Electrónica', icon: '📻',
    modulos: ['electronica'],
    unidades: ['pieza', 'par', 'metro', 'yarda', 'pie', 'pulgada', 'rollo', 'juego', 'caja', 'unidad'],
    categorias: ['Componentes', 'Tarjetas y módulos', 'Cables y conectores',
                 'Baterías y pilas', 'Pantallas', 'Repuestos de línea blanca',
                 'Herramienta y soldadura', 'Insumos'],
    campos: [
      { id: 'especificacion', label: 'Especificación', tipo: 'texto', ph: '10kΩ 1/4W, 470µF 25V...' },
      { id: 'voltaje',        label: 'Voltaje', tipo: 'texto', ph: '5V, 12V, 220V' },
      { id: 'compat_equipo',  label: 'Equipo / marca compatible', tipo: 'texto', ph: 'Samsung, LG, Mabe...' },
      { id: 'no_serie',       label: 'Número de serie o parte', tipo: 'texto' },
    ],
  },

  herreria: {
    label: 'Herrería y estructuras', icon: '🔨',
    modulos: ['herreria'],
    /* Se vende por metro lineal y por lámina; el hierro se compra por quintal.
       Los tres conviven en el mismo negocio. */
    unidades: ['metro lineal', 'metro', 'metro cuadrado', 'yarda', 'pie', 'pulgada', 'quintal', 'libra', 'lámina', 'tubo', 'varilla', 'pieza'],
    categorias: ['Tubo y perfil', 'Lámina', 'Varilla y hierro', 'PVC y aluminio',
                 'Vidrio', 'Soldadura y electrodos', 'Pintura y anticorrosivo',
                 'Herrajes y cerradura', 'Herramienta'],
    campos: [
      { id: 'material',   label: 'Material', tipo: 'lista',
        opciones: ['hierro negro', 'hierro galvanizado', 'acero inoxidable', 'aluminio', 'PVC', 'vidrio', 'otro'] },
      { id: 'calibre',    label: 'Calibre / espesor', tipo: 'texto', ph: 'Cal. 18, 1/8", 3mm' },
      { id: 'medida',     label: 'Medida', tipo: 'texto', ph: '1x1", 2x4", 4x8 pies' },
      { id: 'largo_m',    label: 'Largo por pieza (m)', tipo: 'decimal', ph: '6',
        ayuda: 'El tubo viene en tramos de 6 m: sin esto no se sabe cuántos metros hay en bodega.' },
    ],
  },

  peleteria: {
    label: 'Peletería y tapicería', icon: '🧵',
    modulos: ['peleteria'],
    unidades: ['yarda', 'metro', 'pie', 'pie cuadrado', 'metro cuadrado', 'pulgada', 'pieza', 'rollo', 'par'],
    categorias: ['Cuero', 'Tela y vinil', 'Espuma y relleno', 'Hilo y costura',
                 'Herrajes y accesorios', 'Pegamentos', 'Herramienta'],
    campos: [
      { id: 'material',  label: 'Material', tipo: 'texto', ph: 'Cuero natural, vinil, lona...' },
      { id: 'color',     label: 'Color', tipo: 'texto' },
      { id: 'ancho_m',   label: 'Ancho del rollo (m)', tipo: 'decimal', ph: '1.40',
        ayuda: 'La tela se compra por yarda pero rinde según el ancho: sin el ancho no se calcula el consumo.' },
      { id: 'grosor_mm', label: 'Grosor (mm)', tipo: 'decimal' },
    ],
  },

  agroservicio: {
    label: 'Agroservicio', icon: '🌱',
    modulos: ['agroservicio'],
    unidades: ['quintal', 'libra', 'arroba', 'saco', 'bolsa', 'litro', 'galón', 'mililitro', 'gramo', 'onza', 'tonelada', 'pieza', 'kg'],
    categorias: ['Fertilizante', 'Semilla', 'Plaguicida', 'Herbicida', 'Fungicida',
                 'Alimento balanceado', 'Veterinario', 'Riego', 'Herramienta agrícola'],
    campos: [
      { id: 'ingrediente_activo', label: 'Ingrediente activo', tipo: 'texto', ph: 'Glifosato 48%, Urea 46-0-0' },
      { id: 'formula_npk',        label: 'Fórmula (N-P-K)', tipo: 'texto', ph: '15-15-15' },
      { id: 'presentacion',       label: 'Presentación', tipo: 'texto', ph: 'Saco 100 lb, bidón 5 L' },
      { id: 'registro_maga',      label: 'Registro MAGA', tipo: 'texto',
        ayuda: 'Los agroquímicos llevan registro del ministerio: es lo que pide el inspector.' },
      { id: 'vencimiento',        label: 'Vence', tipo: 'fecha',
        ayuda: 'Un plaguicida vencido no se puede vender ni aplicar.' },
      { id: 'toxicidad',          label: 'Categoría toxicológica', tipo: 'lista',
        opciones: ['I - extremadamente tóxico', 'II - altamente tóxico', 'III - moderadamente tóxico',
                   'IV - ligeramente tóxico', 'no aplica'] },
    ],
  },

  armeria: {
    label: 'Armería', icon: '🎯',
    modulos: ['armeria'],
    /* Un arma es pieza única (número de serie propio); la munición se cuenta
       por caja o por cartucho suelto. El par existe por los guantes y las
       botas de camping, que se venden así. No hay quintal ni metro aquí. */
    unidades: ['pieza', 'unidad', 'caja', 'par', 'juego', 'libra', 'onza', 'gramo'],
    /* La tienda no vende sólo armas: vive también de la tienda de campo
       (chalecos, camping, aventura). Las categorías siguen la clasificación
       de la Ley de Armas donde ésta aplica (arts. 9, 11, 12, 13) y se
       vuelven normales donde no. */
    categorias: [
      'Arma corta (pistola/revólver)', 'Arma larga (rifle/escopeta)',
      'Arma deportiva', 'Aire/gas comprimido (balines)', 'Arma blanca (navajas/cuchillos)',
      'Munición', 'Balines y postas', 'Gas CO2 y aire',
      'Chalecos y protección', 'Fundas y portacargadores', 'Miras y ópticas',
      'Repuestos y accesorios', 'Limpieza y mantenimiento',
      'Camping y aventura', 'Herramientas', 'Ropa y gorras',
    ],
    campos: [
      { id: 'tipo_arma', label: 'Tipo', tipo: 'lista',
        opciones: ['pistola', 'revólver', 'rifle', 'escopeta', 'deportiva',
                   'gas comprimido', 'arma blanca', 'munición', 'accesorio', 'no aplica'] },
      /* `catalogo` hace que el campo se muestre con lista desplegable editable
         (datalist) alimentada por armeria_catalogo, en vez de texto suelto —
         así no quedan "Glock", "GLOCK" y "glock" como tres marcas. */
      { id: 'marca',        label: 'Marca',  tipo: 'texto', catalogo: 'marca', ph: 'Escribe o elige' },
      { id: 'modelo',       label: 'Modelo', tipo: 'texto', catalogo: 'modelo', ph: 'Escribe o elige' },
      { id: 'calibre',      label: 'Calibre', tipo: 'texto', catalogo: 'calibre', ph: 'Escribe o elige' },
      { id: 'numero_serie', label: 'Número de serie', tipo: 'texto',
        ayuda: 'Obligatorio en armas de fuego: el art. 82 g) prohíbe las que no lo traen. Balines, navajas y accesorios no llevan.' },
      { id: 'pais_origen',  label: 'País de origen', tipo: 'texto', catalogo: 'pais', ph: 'Escribe o elige' },
      /* Largo del cañón y conversiones NO son opcionales por gusto: los pide
         la ley por su nombre. Van en la tarjeta de tenencia que extiende
         DIGECAM (art. 63) y en la solicitud de licencia de portación
         (art. 72 a) 2). El comprador los necesita para su trámite. */
      /* EN MILÍMETROS, no en pulgadas. Verificado contra dos tarjetas de
         tenencia reales de DIGECAM: una Glock 19X dice "102 mm" y una escopeta
         Maverick 88 dice "530mm.". El dato físico es el mismo (102 mm = 4.02")
         pero el art. 58 exige que el inventario cuadre con el documento: si
         acá dice 4.02 y la tarjeta dice 102, no cuadra ante una inspección. */
      { id: 'largo_canon', label: 'Largo del cañón (mm)', tipo: 'decimal', ph: '102',
        ayuda: 'En MILÍMETROS, como lo anota la tarjeta de tenencia de DIGECAM (ej. pistola 102 mm, escopeta 530 mm). Lo exigen el art. 63 (tarjeta de tenencia) y el art. 72 (licencia de portación). En escopetas de dos cañones, anotar ambos.' },
      { id: 'conversiones_calibre', label: 'Conversiones de calibre', tipo: 'texto', ph: 'Ej. .22LR con kit de conversión',
        ayuda: 'La ley pide identificar "las conversiones de calibres que tuviere" (arts. 63 y 72). Dejar vacío si no tiene.' },
      /* Cómo se ve y de qué está hecha: es lo que el cliente pregunta y lo
         que distingue dos armas del mismo modelo en la vitrina. */
      { id: 'color',   label: 'Color', tipo: 'texto', catalogo: 'color', ph: 'Escribe o elige' },
      { id: 'acabado', label: 'Acabado', tipo: 'texto', catalogo: 'acabado', ph: 'Cromado, pavonado, policromado...' },
      { id: 'material', label: 'Material del armazón', tipo: 'lista',
        opciones: ['polímero', 'acero al carbono', 'acero inoxidable', 'aluminio / aleación',
                   'titanio', 'madera', 'mixto', 'no aplica'] },
      { id: 'capacidad_cargador', label: 'Capacidad del cargador', tipo: 'entero', ph: '15',
        ayuda: 'Ojo: el art. 82 i) prohíbe portar cargadores para más cartuchos de los que el arma trae de fábrica.' },
    ],
  },

  ferreteria: {
    label: 'Ferretería', icon: '🔩',
    modulos: [],
    unidades: ['pieza', 'unidad', 'caja', 'libra', 'quintal', 'onza', 'metro', 'yarda', 'pie', 'pulgada', 'metro cuadrado', 'galón', 'litro', 'mililitro', 'saco', 'bolsa', 'rollo', 'kg'],
    categorias: ['Tornillería', 'Herramienta manual', 'Herramienta eléctrica', 'Pintura',
                 'Plomería', 'Eléctrico', 'Construcción', 'Jardinería', 'Seguridad'],
    campos: [
      { id: 'medida',   label: 'Medida', tipo: 'texto', ph: '1/2", 3/8 x 2"' },
      { id: 'material', label: 'Material', tipo: 'texto', ph: 'Acero, bronce, PVC' },
    ],
  },

  general: {
    label: 'General', icon: '📦',
    modulos: [],
    unidades: ['unidad', 'pieza', 'caja', 'libra', 'quintal', 'onza', 'gramo', 'litro', 'galón', 'mililitro', 'vaso', 'metro', 'yarda', 'pie', 'pulgada', 'kilómetro', 'metro cuadrado', 'metro cúbico', 'tonelada', 'servicio', 'kg'],
    categorias: ['Producto', 'Servicio', 'Insumo', 'Otro'],
    campos: [],
  },
};

/* ── LAS MEDIDAS QUE SE USAN EN GUATEMALA ───────────────────────────────────
   Henry lo pidió por su nombre: gramos, litros, galones, quintales, toneladas,
   onzas, metros, yardas, pies, pulgadas, kilómetros, metros cuadrados, metros
   cúbicos, mililitros y vasos. **El kilogramo casi no se usa acá** — el
   mostrador pesa en libras y quintales, la ferretería mide en yardas y pies, y
   la gasolinera vende por galón. Queda al final de las listas, no afuera:
   borrarlo dejaría sin unidad válida a los artículos que ya están cargados con
   él, y editarlos se los cambiaría en silencio.

   Van en SINGULAR porque es como ya están guardados en `inventario.unidad_medida`
   y como se lee en la etiqueta de un artículo ("stock 12 quintal"). */
const UNIDADES_GT = {
  /* Peso — el orden es el de uso real en el mostrador. */
  peso:      ['libra', 'quintal', 'onza', 'arroba', 'gramo', 'tonelada', 'kg'],
  /* Volumen */
  volumen:   ['litro', 'galón', 'mililitro', 'vaso', 'metro cúbico'],
  /* Longitud y superficie */
  longitud:  ['metro', 'metro lineal', 'yarda', 'pie', 'pulgada', 'kilómetro'],
  superficie:['metro cuadrado', 'pie cuadrado', 'vara cuadrada'],
  /* Conteo y presentación: no se convierten a nada, son formas de vender. */
  conteo:    ['unidad', 'pieza', 'par', 'juego', 'caja', 'bolsa', 'saco', 'rollo',
              'cilindro', 'lámina', 'tubo', 'varilla', 'servicio'],
};

/* Todas juntas, para validar y para los giros que venden de todo. */
const UNIDADES_TODAS = [].concat(
  UNIDADES_GT.peso, UNIDADES_GT.volumen, UNIDADES_GT.longitud,
  UNIDADES_GT.superficie, UNIDADES_GT.conteo);

/* Equivalencias reales, para convertir sin inventar. Cada familia por
   separado: un metro lineal no tiene peso y un galón no tiene largo. */
const UNIDAD_KG = {
  /* Derivadas de la libra, no tecleadas redondeadas: con 11.339809 la arroba
     devolvía 24.99999 libras, y ese arrastre se acumula al convertir stock. */
  quintal: 100 * 0.45359237,
  arroba: 25 * 0.45359237,
  libra: 0.45359237,
  kg: 1,
  gramo: 0.001,
  tonelada: 1000,
  onza: 0.028349523125,          // 1/16 de libra exacta
};

/* Volumen en litros. El GALÓN es el estadounidense (3.785 l), que es el que se
   usa en Guatemala — el imperial británico (4.546 l) daría 20% de más en cada
   pipa de diésel. El VASO no es una unidad legal: son 250 ml por convención de
   cocina, y por eso va anotado (sirve para recetas y refresquería, no para
   facturar combustible). */
const UNIDAD_L = {
  litro: 1,
  mililitro: 0.001,
  'galón': 3.785411784,
  vaso: 0.25,
  'metro cúbico': 1000,
};

/* Longitud en metros. La YARDA y el PIE son de uso diario en telas, madera y
   construcción; la vara castellana (0.835 m) sigue viva en terrenos, pero no
   se incluye como unidad de inventario para no confundirla con la yarda. */
const UNIDAD_M = {
  metro: 1,
  'metro lineal': 1,        /* el mismo metro, pero es como lo dice la herrería */
  yarda: 0.9144,
  pie: 0.3048,
  pulgada: 0.0254,
  'kilómetro': 1000,
};

const _FAMILIAS = [UNIDAD_KG, UNIDAD_L, UNIDAD_M];

/* Convierte entre unidades de la MISMA familia. Devuelve null cuando alguna no
   se puede convertir o cuando son de familias distintas — que es la respuesta
   honesta: "3 galones" no son metros y forzar el número sería mentir. */
function convertirUnidad(cantidad, desde, hasta) {
  const n = Number(cantidad);
  if (!isFinite(n)) return null;
  for (const familia of _FAMILIAS) {
    const a = familia[desde], b = familia[hasta];
    if (a && b) return (n * a) / b;
  }
  return null;
}

/* ¿Esta unidad se pesa? Lo usa el POS para decidir si ofrece la báscula. Sale
   de la tabla de masa y no de una lista aparte: una lista copiada se queda
   vieja el día que se agrega una unidad (le pasó al gramo). */
function esUnidadDePeso(unidad) {
  const u = String(unidad || '').toLowerCase().trim();
  return !!UNIDAD_KG[u] || ['lb', 'g', 'kgs', 'qq'].includes(u);
}

/* Giros que le tocan a este comercio, deducidos de sus módulos activos: un
   taller ve el giro mecánico, una venta de granos ve granos. 'general'
   siempre está — sirve para lo que no encaja en ningún rubro. */
function girosDelTenant(modulosActivos) {
  const activos = Array.isArray(modulosActivos) ? modulosActivos : [];
  const propios = Object.entries(GIROS)
    .filter(([id, g]) => id !== 'general' && g.modulos.some(m => activos.includes(m)))
    .map(([id]) => id);
  /* Sin módulos verticales el comercio es un taller (que es como nació la
     app) para no dejar el inventario sin ningún campo útil. */
  if (!propios.length) propios.push('mecanico');
  return [...propios, 'general'];
}

/* El giro por defecto al crear un artículo: el primero del comercio. */
function giroPorDefecto(modulosActivos) {
  return girosDelTenant(modulosActivos)[0];
}

/* ── LO QUE NO SE COBRA EN EL MOSTRADOR ─────────────────────────────────────
   Todo el inventario de la armería se ve en el POS —la tienda vive también de
   chalecos, camping, limpieza y ropa, y ésos se cobran como cualquier cosa—,
   pero un arma de fuego y la munición NO: el art. 59 obliga a remitir papeles
   a DIGECAM antes de entregar el arma, y el art. 60 limita la munición al
   calibre y al cupo mensual del comprador, con código de autorización en la
   factura. Cobrarlas en el POS saltaría los dos trámites y descuadraría el
   libro que revisa DIGECAM (art. 58). Esas van por el módulo de Armería.

   Lo exento sí se cobra acá: el aire/gas comprimido ≤5.5mm (art. 68) y la
   navaja de uso personal (art. 13) no piden licencia. */
const ARMERIA_CATEGORIAS_REGULADAS = [
  'Arma corta (pistola/revólver)', 'Arma larga (rifle/escopeta)',
  'Arma deportiva', 'Munición',
];
const ARMERIA_TIPOS_REGULADOS = ['pistola', 'revólver', 'rifle', 'escopeta', 'deportiva', 'munición'];

/* Un artículo del inventario (no una operación de armería). Se mira la
   categoría Y el tipo de arma de sus atributos: la categoría la elige quien
   carga el artículo y puede quedar en blanco, el tipo lo pide el formulario
   del giro — con cualquiera de los dos alcanza para no venderlo en el POS. */
function articuloRegulado(art) {
  if (!art || (art.tipo_item || 'general') !== 'armeria') return false;
  if (ARMERIA_CATEGORIAS_REGULADAS.includes(art.categoria)) return true;
  const tipo = art.atributos?.tipo_arma;
  return !!tipo && ARMERIA_TIPOS_REGULADOS.includes(String(tipo).toLowerCase());
}

if (typeof window !== 'undefined') {
  window.GIROS = GIROS;
  window.UNIDADES_GT = UNIDADES_GT;
  window.UNIDADES_TODAS = UNIDADES_TODAS;
  window.UNIDAD_KG = UNIDAD_KG;
  window.UNIDAD_L = UNIDAD_L;
  window.UNIDAD_M = UNIDAD_M;
  window.esUnidadDePeso = esUnidadDePeso;
  window.convertirUnidad = convertirUnidad;
  window.girosDelTenant = girosDelTenant;
  window.giroPorDefecto = giroPorDefecto;
  window.ARMERIA_CATEGORIAS_REGULADAS = ARMERIA_CATEGORIAS_REGULADAS;
  window.articuloRegulado = articuloRegulado;
}
