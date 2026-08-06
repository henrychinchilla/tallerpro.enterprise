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
   equivalencia real, no las del sistema métrico de manual.
     · quintal = 100 libras = 45.359 kg  (grano, azúcar, cal, cemento)
     · arroba  = 25 libras  = 11.34 kg   (frutas, verduras, café)
     · saco    = presentación, NO peso fijo: hay de 100 lb, de 5 kg y de 25 kg,
                 por eso lleva su propio campo de contenido en vez de asumir.
     · tonelada métrica = 1000 kg = 22.046 quintales
   Las que NO son de masa (metro lineal, pie cuadrado, cilindro) no se
   convierten a peso: forzarlas sería inventar.
═══════════════════════════════════════════════════════ */

const GIROS = {
  mecanico: {
    label: 'Taller mecánico', icon: '🔧',
    modulos: ['ordenes', 'vehiculos', 'diagnostico_obd'],
    unidades: ['pieza', 'unidad', 'juego', 'par', 'litro', 'galón', 'kg', 'metro', 'caja'],
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
    unidades: ['quintal', 'libra', 'arroba', 'saco', 'kg', 'tonelada'],
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
    unidades: ['libra', 'cilindro', 'kg', 'onza', 'pieza', 'metro', 'juego'],
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
    unidades: ['pieza', 'par', 'metro', 'rollo', 'juego', 'caja'],
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
    unidades: ['metro lineal', 'metro cuadrado', 'quintal', 'libra', 'lámina', 'tubo', 'varilla', 'pieza'],
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
    unidades: ['yarda', 'metro', 'pie cuadrado', 'pieza', 'rollo', 'par'],
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
    unidades: ['quintal', 'libra', 'saco', 'litro', 'galón', 'kg', 'bolsa', 'pieza'],
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
    unidades: ['pieza', 'caja', 'unidad', 'par', 'juego'],
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
    unidades: ['pieza', 'unidad', 'caja', 'libra', 'quintal', 'metro', 'galón', 'litro', 'saco', 'bolsa'],
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
    unidades: ['unidad', 'pieza', 'caja', 'kg', 'libra', 'litro', 'metro', 'servicio'],
    categorias: ['Producto', 'Servicio', 'Insumo', 'Otro'],
    campos: [],
  },
};

/* Equivalencias reales, para convertir sin inventar. Sólo unidades de MASA:
   un metro lineal o un cilindro no tienen peso definido. */
const UNIDAD_KG = {
  /* Derivadas de la libra, no tecleadas redondeadas: con 11.339809 la arroba
     devolvía 24.99999 libras, y ese arrastre se acumula al convertir stock. */
  quintal: 100 * 0.45359237,
  arroba: 25 * 0.45359237,
  libra: 0.45359237,
  kg: 1,
  tonelada: 1000,
  onza: 0.0283495,
};

/* Convierte entre unidades de masa. Devuelve null cuando alguna de las dos no
   es de masa — que es la respuesta honesta: "3 metros lineales" no son kilos
   y forzar el número sería mentir. */
function convertirUnidad(cantidad, desde, hasta) {
  const a = UNIDAD_KG[desde], b = UNIDAD_KG[hasta];
  if (!a || !b) return null;
  const n = Number(cantidad);
  if (!isFinite(n)) return null;
  return (n * a) / b;
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

if (typeof window !== 'undefined') {
  window.GIROS = GIROS;
  window.UNIDAD_KG = UNIDAD_KG;
  window.convertirUnidad = convertirUnidad;
  window.girosDelTenant = girosDelTenant;
  window.giroPorDefecto = giroPorDefecto;
}
