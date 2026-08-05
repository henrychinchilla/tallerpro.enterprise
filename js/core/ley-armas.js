/* ═══════════════════════════════════════════════════════
   LEY DE ARMAS Y MUNICIONES — Decreto Número 15-2009
   Texto de los artículos que le tocan a un negocio de armas en Guatemala.

   El texto es LITERAL, extraído del PDF oficial de la ley. No es un resumen
   ni una paráfrasis: si algo aquí dice "250 unidades", la ley dice 250. Lo
   único que se editó fueron los cortes de línea del PDF (venía justificado
   y partía las palabras).

   POR QUÉ ESTÁ EN EL REPO Y NO EN LA BASE DE DATOS: la ley es la misma para
   todos los comercios y no cambia sin una reforma del Congreso. Guardarla en
   la BD la volvería editable por tenant, que es justo lo que NO se quiere en
   un dato legal — un comercio no debe poder "ajustar" el límite de munición
   que la app le aplica.

   ⚠️ DISTINCIÓN LEGAL QUE IMPORTA (art. 85 vs art. 55):
   En esta ley "ARMERÍA" NO es la tienda que vende armas. Es el taller que las
   REPARA (art. 85), y el art. 88 le PROHÍBE expresamente hacer compraventa.
   El negocio que vende es un "establecimiento de compraventa de armas de
   fuego y municiones" (arts. 55-56), que es otra licencia. Un negocio puede
   tener las dos, pero son trámites distintos ante DIGECAM.
═══════════════════════════════════════════════════════ */

const LEY_ARMAS = {
  decreto: 'Decreto Número 15-2009',
  nombre: 'Ley de Armas y Municiones',
  reglamento: 'Acuerdo Gubernativo 85-2011',
  fuente: 'Congreso de la República de Guatemala',

  /* Cada artículo: número, título tal como aparece en la ley, el tema para
     filtrar, y el texto literal. `clave: true` marca los que se aplican todos
     los días en el mostrador. */
  articulos: [
    {
      num: 55, tema: 'compraventa', clave: true,
      titulo: 'Compraventa',
      texto: `Las personas individuales o jurídicas que deseen dedicarse a la compraventa de armas de fuego y municiones, deberán cumplir con los requisitos siguientes:

a. Presentar a la DIGECAM declaración jurada ante notario público, que deberá contener: nombres y apellidos completos del solicitante, edad, estado civil, nacionalidad, profesión o actividad a la que se dedica, calidad en la que actúa, número del documento de identificación personal, dirección exacta del domicilio y de su lugar de trabajo, y promesa de informar inmediatamente de cualquier cambio en los datos proporcionados.

b. Acompañar los documentos siguientes:
  1. Fotocopia legalizada del documento de identificación personal.
  2. Certificación de carencia de antecedentes penales y policíacos extendida por las autoridades correspondientes, del solicitante o del representante legal, si se trata de persona jurídica.
  3. Certificación contable de sus ingresos o estados financieros.
  4. Fotocopia legalizada del testimonio de la escritura constitutiva y sus modificaciones, debidamente inscrita en el Registro Mercantil, si el solicitante es una persona jurídica.
  5. Fotocopia legalizada de la patente de comercio de sociedad y de empresa, si el solicitante es persona jurídica, y fotocopia legalizada de la patente de comercio de empresa, si el solicitante es persona individual.
  6. Fotocopia legalizada del nombramiento de representante legal, si el solicitante es una persona jurídica.
  7. Certificación de que se encuentra inscrito como sujeto de contribución fiscal.`,
    },
    {
      num: 56, tema: 'compraventa', clave: true,
      titulo: 'Funcionamiento de los establecimientos de compraventa de armas de fuego y municiones',
      texto: `Los establecimientos de compraventa de armas de fuego y municiones debidamente autorizados de conformidad con el artículo anterior, podrán iniciar operaciones para la compraventa cuando cumplan con las disposiciones siguientes:

a. Deberán estar conectadas en línea al sistema informático de la DIGECAM, para el ingreso y control de datos de compraventa de armas y municiones, de conformidad con el Reglamento de la presente Ley.

b. Deberán cumplir con las medidas físicas, tecnológicas y humanas pertinentes de seguridad establecidas en el reglamento respectivo, además de las específicas que la DIGECAM indique para cada establecimiento, según sea el caso concreto.`,
    },
    {
      num: 58, tema: 'inventario', clave: true,
      titulo: 'Inventario del vendedor',
      texto: `El resultado del inventario físico de las armas y municiones deberá ser exacto; cualquier diferencia detectada en este rubro, ocasionará una revisión de los libros de control de armas, municiones y documentos, a partir de la última inspección que conste en los mismos libros, con el fin de aclarar la diferencia, dentro del plazo de ocho (8) días. Si ésta no fuera aclarada, ocasionará el cierre temporal del establecimiento por un período de quince (15) días, período dentro del cual se debe aclarar la diferencia. La DIGECAM está obligada a resolver sobre la reapertura del establecimiento en un plazo de veinticuatro (24) horas después de haberse aclarado la diferencia respectiva.

La reiteración de este incumplimiento ocasionará el cierre definitivo del establecimiento y la cancelación de la licencia respectiva.`,
    },
    {
      num: 59, tema: 'venta_arma', clave: true,
      titulo: 'Requisitos (para comprar un arma de fuego)',
      texto: `Para comprar un arma de fuego de uso civil, deportiva o de uso y manejo individual, el interesado deberá presentar a la entidad autorizada para venderla, fotocopia legalizada de su documento de identificación personal, certificación original de la partida de su nacimiento, certificación de carencia de antecedentes penales y policíacos, boleto de ornato, así como constancia de empleo o certificación de ingresos. Cuando por su actividad económica el interesado no pueda presentar este último documento, deberá presentar declaración jurada prestada ante notario público, declarando sus ingresos y la actividad de la que los obtiene.

El vendedor remitirá esta documentación y el arma a la DIGECAM, quien después de comprobar que los documentos están en orden y no existe ningún impedimento de los consignados en éste y otras leyes que prohíban la operación de compraventa, en un término no mayor de cinco (5) días hábiles remitirá al vendedor la autorización para entregar el arma al comprador y la tarjeta de tenencia de la misma. El comprador quedará autorizado para trasladar el arma dentro del término de tres (3) días siguientes al que le fue entregada, desde el establecimiento comercial que le vendió hasta su residencia o lugar de trabajo, si solamente desea el registro de tenencia.

Si desea tener una licencia de portación para el arma que le fue entregada, deberá presentarse a la DIGECAM y cumplir con los requisitos contemplados en la presente Ley.`,
    },
    {
      num: 60, tema: 'municiones', clave: true,
      titulo: 'Compraventa de municiones',
      texto: `Podrá venderse munición para armas de fuego con la sola presentación de la tarjeta de registro de la tenencia extendida por la DIGECAM, o con la presentación de la licencia de portación del arma. Sólo podrá venderse munición del calibre que esté registrado en los documentos referidos.

Mensualmente, las personas podrán adquirir hasta doscientas cincuenta (250) unidades de munición por cada una de las armas debidamente registradas en su licencia de portación o doscientas (200) unidades con su registro de tenencia. Las personas naturales o jurídicas que necesiten una mayor cantidad de municiones de las reguladas en este artículo, podrán adquirirlas con un permiso especial extendido por la DIGECAM, debiendo justificar y demostrar la situación que motiva dicha solicitud.

En la factura que acredite la compraventa de la munición deberá transcribirse, además del nombre del comprador, su dirección, su número de identificación tributaria -NIT-, el número de tarjeta de registro de la tenencia o de la licencia de portación de las armas y firma del comprador donde conste que recibió la munición.

El vendedor deberá estampar el sello de su establecimiento en cada caja de munición y agregar la fecha de venta y remitir a la DIGECAM un informe y copia de la factura de venta cada fin de mes calendario.

Queda prohibida cualquier transferencia de dominio de municiones entre particulares.`,
    },
    {
      num: 61, tema: 'compraventa',
      titulo: 'Compraventa entre particulares',
      texto: `Todo traspaso de dominio de un arma de fuego entre particulares, deberá constar en escritura pública. El comprador presentará el testimonio de la escritura pública, además de cualquier otro registro a que obligue la ley, para su registro en la DIGECAM dentro de los ocho (8) días siguientes a la fecha de celebración del contrato. Para que el notario pueda autorizar el traspaso de dominio de un arma de fuego, deberá tener a la vista e identificar en el cuerpo de la escritura pública los documentos siguientes:

a) Documento de identificación personal del comprador y del vendedor.
b) Título de propiedad del arma que se trate y tarjeta de registro de la misma, extendida por la DIGECAM.

El notario deberá dar aviso a la DIGECAM dentro de los quince (15) días siguientes al otorgamiento del contrato, indicando los nombres del vendedor y del comprador, los datos de identificación del arma, título de propiedad que tuvo a la vista. La omisión del aviso a la DIGECAM dará lugar a una multa al notario de un mil Quetzales (Q.1,000.00), que impondrá un juez a petición de la DIGECAM, salvo imposibilidad material de dar el aviso.

Las armas de fuego de uso de las fuerzas de seguridad y orden público del Estado no podrán traspasarse entre particulares.`,
    },
    {
      num: 62, tema: 'tenencia', clave: true,
      titulo: 'Tenencia',
      texto: `Todos los ciudadanos tienen el derecho de tenencia de armas de fuego en su lugar de habitación, salvo las que esta Ley prohíba, cumpliendo únicamente con los requisitos expresamente consignados en la presente Ley.`,
    },
    {
      num: 63, tema: 'tenencia', clave: true,
      titulo: 'Procedimiento de registro de tenencia',
      texto: `El registro de la tenencia de armas de fuego lo hará personalmente el interesado en la DIGECAM, presentando el o las armas que pretenda registrar con la factura que ampare su propiedad o testimonio de la escritura de compraventa.

El interesado deberá proporcionar dos (2) municiones, con el objeto de tomar las huellas balísticas del arma, lo que hará en el mismo acto. Los proyectiles y las vainas o casquillos pasarán a formar parte del archivo de datos balísticos de la DIGECAM. Acto seguido, la DIGECAM procederá a extender al interesado la tarjeta de tenencia, la cual indicará: nombre, residencia y domicilio del interesado, nacionalidad, número del documento de identificación personal, indicación de la marca del arma, modelo, calibre, número de serie, largo del cañón o cañones y conversiones de calibres que tuviere, así como lugar y fecha de registro.`,
    },
    {
      num: 70, tema: 'portacion', clave: true,
      titulo: 'Portación',
      texto: `Con autorización de la DIGECAM, los ciudadanos guatemaltecos y extranjeros con residencia temporal o permanente legalmente autorizada, podrán portar armas de fuego de las permitidas por la presente Ley, salvo las prohibiciones contenidas en este cuerpo legal.`,
    },
    {
      num: 72, tema: 'portacion', clave: true,
      titulo: 'Licencia (de portación)',
      texto: `Los ciudadanos, para portar armas de fuego de las permitidas en la presente Ley, deben obtener previamente la licencia de portación. La licencia puede cubrir y amparar hasta tres (3) armas diversas, que deberán ser previamente registradas en la DIGECAM.

La DIGECAM procederá simultáneamente a registrar la tenencia de un arma cuando un ciudadano solicite la licencia de portación de un arma que no esté previamente registrada. La DIGECAM extenderá la licencia de portación de armas de fuego, la cual tendrá vigencia de uno (1) a tres (3) años, pudiendo ser renovada, previo cumplimiento de los requisitos siguientes:

a) Solicitud en formulario que proporcionará la DIGECAM, la cual deberá contener:
  1. Nombres y apellidos completos del solicitante, edad, estado civil, nacionalidad, profesión o actividad a que se dedica, residencia, número del documento de identificación personal y lugar para recibir notificaciones.
  2. Marca, modelo, calibre, largo del cañón o cañones, número de serie del arma e identificación de las conversiones de calibres que tuviere.
  3. Declaración jurada que no padece ni ha padecido de enfermedades mentales, ni es desertor del Ejército de Guatemala y/o abandono de empleo en la Policía Nacional Civil.

b) Acompañar los siguientes documentos:
  1. Fotocopia legalizada del documento de identificación personal.
  2. Certificación de carencia de antecedentes penales y policíacos, extendida por las autoridades correspondientes.
  3. Certificación de haber superado las evaluaciones establecidas en el artículo 75 de la presente Ley.

Los datos y documentos que se remitan a la DIGECAM serán hechos bajo declaración jurada prestada ante notario público de conformidad con la ley, que toda la información es verídica.

c) Pago de la tarifa especial respectiva, la cual se fijará en el Reglamento de la presente Ley.`,
    },
    {
      num: 73, tema: 'portacion',
      titulo: 'Razones de orden público',
      texto: `Por razones de orden público no se extenderá ni renovará licencia de portación a la persona que haya sido condenada por tribunal competente por los delitos de homicidio doloso, asesinato, secuestro, ejecución extrajudicial, robo y robo agravado, lesiones graves y gravísimas provocadas con arma de fuego o portación ilegal de arma de fuego, además de los delitos establecidos en la Ley contra la Delincuencia Organizada, Decreto Número 21-2006 del Congreso de la República, o la presente Ley.`,
    },
    {
      num: 75, tema: 'portacion',
      titulo: 'Evaluaciones',
      texto: `Las licencias de portación de arma de fuego serán extendidas por la DIGECAM, cuando el solicitante demuestre que posee la aptitud para el manejo y conocimiento de las armas de fuego, de tal forma que la portación del arma de fuego no represente un riesgo para él mismo, su familia y la sociedad.

Para el efecto, será necesario que el solicitante apruebe las evaluaciones que la DIGECAM establecerá en el reglamento correspondiente, debiendo incluir medidas de seguridad para el manejo de armas de fuego, conocimientos generales de la presente Ley, evaluaciones técnicas y evaluaciones psicológicas.

La no aprobación de las evaluaciones tiene por efecto la denegatoria de la licencia de portación. Las evaluaciones serán en forma verbal o escrita; en cualquier caso deberá quedar constancia documental de las mismas, y se realizarán únicamente para la primera licencia.`,
    },
    {
      num: 76, tema: 'portacion',
      titulo: 'Renovación de licencia',
      texto: `Para la solicitud de renovación de licencia de portación de armas de fuego, se exigirá presentar el arma o las armas para verificar que no hayan sido modificadas, la solicitud con la información a que se refiere el artículo 72 literal a), numerales 1 y 2 de la presente Ley y certificación de carencia de antecedentes penales y policíacos.

La licencia vencida y la copia sellada de la solicitud de renovación constituirán licencia provisional mientras se resuelve la solicitud y tendrá validez por un máximo de cuarenta y cinco (45) días. El rechazo de la solicitud de portación o renovación deberá hacerse expresando los motivos, los cuales no pueden ser otros que los contemplados en la presente Ley.`,
    },
    {
      num: 82, tema: 'prohibiciones', clave: true,
      titulo: 'Prohibiciones generales',
      texto: `Se prohíbe a los particulares la fabricación, importación, exportación, intermediación, tenencia y portación de:

a) Armas bélicas, explosivos, armas químicas, armas biológicas, armas atómicas, trampas militares y armas experimentales.
b) Reductores de ruido, supresores o silenciadores.
c) Mecanismos de conversión a funcionamiento automático.
d) Artificios para disparar el arma de forma oculta, como maletines, estuches, lapiceros, libros y similares.
e) Municiones de uso exclusivo bélico o envenenadas con productos químicos, naturales o incendiarias.
f) Armas hechizas o artesanales de fuego.
g) Armas de fuego sin número de registro o registro borrado, alterado o tachado; sin modelo, calibre, nombre del fabricante, ni país de origen.
h) El tránsito sin autorización de armas y municiones por territorio nacional con el fin de importarlas o exportarlas a otro país.
i) Portar a la vista ostentosamente las armas y/o cargadores para más cartuchos de los que originalmente fueron fabricados para el arma o que sobresalgan de su empuñadura.`,
    },
    {
      num: 85, tema: 'armeria', clave: true,
      titulo: 'Armerías',
      texto: `Para fines de la presente Ley, se entiende por armerías a los establecimientos que se dediquen a la reparación y servicio de armas de fuego. Para que se autorice el funcionamiento de armerías, las personas individuales deberán cumplir con los requisitos siguientes:

a) Presentar solicitud a la DIGECAM, en formulario que ésta proporcionará, al cual se adherirán especies fiscales por valor de cien Quetzales (Q.100.00); tal solicitud contendrá: nombres y apellidos del solicitante, edad, estado civil, nacionalidad, profesión, número del documento de identificación personal, dirección de su residencia, lugar de trabajo y lugar para recibir notificaciones.

b) A la solicitud se acompañarán los documentos siguientes:
  1. Fotocopia legalizada del documento de identificación personal.
  2. Certificación de carencia de antecedentes penales y policíacos, extendida por las autoridades correspondientes.
  3. Acreditar que el responsable del establecimiento tiene los conocimientos científicos y técnicos necesarios para la reparación y mantenimiento de armas de fuego.
  4. Fotocopia legalizada de patente de comercio de la empresa.

c) Las personas jurídicas deberán acompañar además, los documentos siguientes:
  1. Fotocopia legalizada del testimonio de la escritura constitutiva, debidamente inscrita en el Registro Mercantil.
  2. Fotocopia legalizada del nombramiento del representante legal y de las patentes de comercio respectivas.`,
    },
    {
      num: 86, tema: 'armeria', clave: true,
      titulo: 'Obligaciones de los propietarios de armería',
      texto: `Al otorgarse la licencia respectiva, el interesado deberá llevar un libro de control para el registro de las armas de fuego que le sean encomendadas para su reparación y/o mantenimiento, en el cual deberá constar el nombre del propietario y su domicilio, marca, número de serie, calibre, así como el registro de la licencia de tenencia de las mismas.

El libro de control debe ser autorizado por la DIGECAM y de su movimiento deberá rendir informe por escrito cada fin de mes.`,
    },
    {
      num: 87, tema: 'armeria',
      titulo: 'Medidas de seguridad en las armerías',
      texto: `Dentro de las armerías, las armas deben permanecer debidamente identificadas y almacenadas, tomándose las medidas físicas, tecnológicas y humanas de seguridad correspondientes, de conformidad con el reglamento respectivo, para evitar robos o pérdidas; en caso de ocurrir cualquier suceso, deberá dar aviso inmediato a la DIGECAM y a las autoridades competentes.`,
    },
    {
      num: 88, tema: 'armeria', clave: true,
      titulo: 'Prohibiciones para las armerías',
      texto: `Las armerías no están autorizadas para efectuar compraventas de armas y/o municiones, ni reacondicionamiento de cartuchos; tampoco podrán modificar el funcionamiento del arma convirtiéndola en automática, ni fabricar o reparar reductores, supresores o silenciadores de ruido.

Asimismo, les queda prohibido recibir armas para su reparación o servicio, que no estén amparadas por la tarjeta de tenencia o la licencia de portación extendida por la DIGECAM.

Asimismo, tienen prohibido mantener en depósito pólvora o explosivos, pudiendo mantener solamente la munición y fulminantes necesarios para las correspondientes pruebas de funcionamiento.`,
    },
  ],

  /* ── REGLAMENTO — Acuerdo Gubernativo 85-2011 ────────────────────────────
     La ley delega en el reglamento un montón de cosas ("de conformidad con
     el reglamento"), y ahí es donde están las obligaciones del día a día de
     un establecimiento de compraventa. Texto literal, mismo criterio que la
     ley. Se marcan con `reglamento: true` para no confundirlos con
     artículos de la ley: son numeraciones distintas. */
  articulosReglamento: [
    {
      num: 17, tema: 'compraventa', clave: true, reglamento: true,
      titulo: 'Compraventa (licencia del establecimiento)',
      texto: `Las personas individuales o jurídicas que deseen dedicarse a la compraventa de armas de fuego y/o municiones, deberán cumplir con los requisitos siguientes:

a) Formulario de solicitud emitido por la DIGECAM.
b) Presentar a la DIGECAM, declaración jurada ante Notario, que deberá contener: nombres y apellidos completos del solicitante, edad, estado civil, nacionalidad, profesión o actividad a la que se dedica, calidad en la que actúa, número del documento de identificación personal, dirección exacta del domicilio y de su lugar de trabajo, y promesa de informar inmediatamente de cualquier cambio en los datos proporcionados.
c) Acompañar los documentos siguientes:
  1. Fotocopia legalizada del documento de identificación personal, reconocido por la ley.
  2. Certificación de carencia de antecedentes penales extendida por la autoridad correspondiente, del solicitante o del representante legal, si se tratare de persona jurídica.
  3. Certificación de carencia de antecedentes policíacos extendida por la autoridad correspondiente.
  4. Certificación contable de sus ingresos o estados financieros.
  5. Fotocopia legalizada del testimonio de la escritura constitutiva y sus modificaciones, debidamente inscrita en el Registro Mercantil, si el solicitante es una persona jurídica.
  6. Fotocopia legalizada de la patente de sociedad y patente de empresa, si el solicitante es persona jurídica, y fotocopia legalizada de la patente de empresa, si el solicitante es persona individual.
  7. Fotocopia legalizada del nombramiento de representante legal, si el solicitante es una persona jurídica.
  8. Certificación de que se encuentra inscrito como sujeto de contribución fiscal en la Superintendencia de Administración Tributaria.

La DIGECAM emitirá la licencia correspondiente al cumplir los requisitos, la que tendrá una vigencia de cinco (5) años. En cada solicitud de renovación debe cumplirse con todos los requisitos enumerados en este artículo.`,
    },
    {
      num: 20, tema: 'compraventa', clave: true, reglamento: true,
      titulo: 'Conexión al sistema informático de la DIGECAM',
      texto: `Las personas individuales o jurídicas que tengan licencia para venta de armas y municiones deberán estar todos los días conectados en línea al sistema informático de la DIGECAM, para lo cual deberán:

a) Contar con el equipo informático con las capacidades mínimas exigidas por la DIGECAM.
b) Que el personal que utilizará la conexión en línea cuente con la capacitación impartida en la DIGECAM.
c) Remitir los informes requeridos en la forma y plazo establecidos por la DIGECAM.`,
    },
    {
      num: 21, tema: 'municiones', clave: true, reglamento: true,
      titulo: 'Verificación en línea para la venta de munición',
      texto: `Las entidades que la DIGECAM autorice para la venta de municiones, previo a cada venta de las mismas deberán verificar en el sistema en línea con DIGECAM que la persona no haya excedido del límite de munición que se pueda adquirir mensualmente. Asimismo, obtener un código de autorización de venta en la DIGECAM, por vía informática o telefónica, el cual debe anotarse en la factura de venta.`,
    },
    {
      num: 22, tema: 'seguridad', clave: true, reglamento: true,
      titulo: 'Medidas de seguridad en establecimientos de compraventa',
      texto: `Las personas individuales o jurídicas que se dediquen a la comercialización de armas y municiones, deberán cumplir las medidas de seguridad físicas siguientes:

a) El local de la empresa debe ser construido con techo, paredes fuertes y sólidas, ya sea de block o concreto.
b) No compartir el local con otra empresa y otro tipo de negocio.
c) Contar con una sola puerta de acceso al local.
d) No estar ubicada la venta de armas y municiones en una colonia cerrada, condominio o casa de habitación.
e) Contar con un enrejado metálico ubicado frente al mostrador, de manera que las personas ajenas al negocio no tengan acceso al área donde se encuentran las armas y municiones.
f) Deben contar con una chapa eléctrica ubicada en la entrada principal, activable desde el mostrador u oficinas.
g) Contar con un enrejado metálico en forma de jaula en la entrada principal.
h) A un lado de la entrada principal, un casillero con puertas con llave, para que la persona ajena al negocio deposite sus armas y no entre armada a la sala de ventas.
i) Extinguidor contra incendios tipo ABC, de por lo menos quince (15) libras, con servicio técnico cada seis (6) meses.
j) Caja fuerte o bóveda con capacidad de resguardar todo el inventario de armas y municiones. Debe tener por lo menos un cuarto de pulgada de grosor.
k) Sistema de alarma antirrobos con sensores pasivos de movimiento que protejan todas las áreas, sirena, botón de pánico y caja eléctrica central.
l) Botiquín de primeros auxilios.
m) A requerimiento de la DIGECAM, contar con uno o varios agentes de una empresa de seguridad privada.
n) La DIGECAM requerirá otras medidas de seguridad que estime convenientes en casos concretos.`,
    },
    {
      num: 23, tema: 'municiones', reglamento: true,
      titulo: 'Permiso especial para compra de munición',
      texto: `Las personas individuales o jurídicas que necesiten mayor cantidad de municiones de las reguladas en la ley, para obtener el permiso especial de la DIGECAM deberán cumplir los requisitos siguientes:

a) Formulario de solicitud emitido por DIGECAM.
b) Fotocopia legalizada del documento de identificación personal, reconocido por la ley.
c) Fotocopia de la tarjeta de tenencia emitida por DIGECAM.
d) Documentos que justifiquen y demuestren la situación que motiva dicha solicitud.

La DIGECAM autorizará la cantidad de munición que considere conveniente en base a la justificación del requirente. En caso se autorice la compra de una cantidad de munición la DIGECAM realizará la anotación en el sistema informático y emitirá el documento de autorización, el cual debe ser presentado ante la empresa de compraventa de armas y municiones para cumplir con el procedimiento establecido de compra.`,
    },
    {
      num: 40, tema: 'armeria', reglamento: true,
      titulo: 'Autorización de armerías (taller de reparación)',
      texto: `Para que se autorice el funcionamiento de armerías, las personas individuales deberán cumplir con los requisitos siguientes:

a) Presentar solicitud en formulario emitido por la DIGECAM, al cual se adherirán especies fiscales por valor de cien quetzales (Q.100.00); tal solicitud contendrá: nombres y apellidos del solicitante, edad, estado civil, nacionalidad, profesión, número del documento de identificación personal, dirección de su residencia, lugar de trabajo y lugar para recibir notificaciones.
b) A la solicitud se acompañarán: fotocopia legalizada del documento de identificación personal; certificación de carencia de antecedentes penales; certificación de carencia de antecedentes policíacos; acreditar que el responsable del establecimiento tiene los conocimientos científicos y técnicos necesarios para la reparación y mantenimiento de armas de fuego; y fotocopia legalizada de patente de empresa.
c) Las personas jurídicas acompañarán además: fotocopia legalizada del testimonio de la escritura constitutiva inscrita en el Registro Mercantil; fotocopia legalizada del nombramiento del representante legal y de las patentes de comercio; y fotocopia legalizada de patente de sociedad.

La DIGECAM emitirá la licencia correspondiente al cumplir los requisitos, la que tendrá una vigencia de cinco (5) años.`,
    },
  ],

  temas: {
    compraventa:  { label: 'Compraventa (licencia del negocio)', icon: '🏪' },
    venta_arma:   { label: 'Venta de un arma', icon: '🔫' },
    municiones:   { label: 'Venta de municiones', icon: '📦' },
    tenencia:     { label: 'Tenencia', icon: '🏠' },
    portacion:    { label: 'Portación', icon: '🪪' },
    inventario:   { label: 'Inventario y libros', icon: '📒' },
    prohibiciones:{ label: 'Prohibiciones', icon: '🚫' },
    armeria:      { label: 'Armería (reparación)', icon: '🔧' },
    seguridad:    { label: 'Seguridad del local', icon: '🔒' },
  },
};

/* Ley y reglamento en una sola lista, cada artículo marcado con su fuente.
   Se consultan juntos porque en la práctica se aplican juntos: la ley dice
   qué, el reglamento dice cómo. */
function articulosLeyArmas() {
  return [
    ...LEY_ARMAS.articulos.map(a => ({ ...a, fuente: 'ley' })),
    ...LEY_ARMAS.articulosReglamento.map(a => ({ ...a, fuente: 'reglamento' })),
  ];
}

/* Tope mensual de munición que la ley permite venderle a una persona.
   Art. 60: 250 por CADA arma registrada en la licencia de portación, o 200
   con registro de tenencia. El "por cada arma" importa: el art. 72 permite
   hasta 3 armas por licencia, así que el tope real de un cliente con
   portación puede ser 250, 500 o 750 según cuántas tenga registradas.
   `armasRegistradas` por defecto 1 — el caso conservador. */
function topeMunicionMensual(tipoLicencia, armasRegistradas = 1) {
  const n = Math.max(1, Math.min(3, Number(armasRegistradas) || 1)); // art. 72: máx 3
  if (tipoLicencia === 'portación') return 250 * n;
  if (tipoLicencia === 'tenencia') return 200;   // el art. 60 no lo multiplica para tenencia
  return 0;                                       // sin licencia no se vende munición
}

/* Busca en ley y reglamento por texto libre (número, título o contenido). */
function buscarLeyArmas(q) {
  const todos = articulosLeyArmas();
  const s = String(q || '').trim().toLowerCase();
  if (!s) return todos;
  const soloNum = s.replace(/[^\d]/g, '');
  return todos.filter(a =>
    (soloNum && String(a.num) === soloNum) ||
    a.titulo.toLowerCase().includes(s) ||
    a.texto.toLowerCase().includes(s)
  );
}

if (typeof window !== 'undefined') {
  window.LEY_ARMAS = LEY_ARMAS;
  window.topeMunicionMensual = topeMunicionMensual;
  window.buscarLeyArmas = buscarLeyArmas;
  window.articulosLeyArmas = articulosLeyArmas;
}
