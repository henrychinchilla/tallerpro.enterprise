/* Vehículos Module */
Modulos.vehiculos = {
  _data: [],
  _clientes: [],

  /* Catálogos sugeridos (editables: el usuario puede escribir uno nuevo) */
  _tipos: ['Liviano', 'SUV', 'Pesado', 'Motocicleta', 'ATV', 'Motor de lancha', 'Motogenerador'],
  _marcasPorTipo: {
    'Liviano': ['Toyota','Honda','Nissan','Hyundai','Kia','Mazda','Chevrolet','Volkswagen','Mitsubishi','Suzuki','Ford','Renault','Peugeot','Geely','BYD','Changan'],
    'SUV': ['Toyota','Honda','Hyundai','Kia','Mazda','Nissan','Mitsubishi','Suzuki','Chevrolet','Ford','Jeep','Subaru','Land Rover','BMW','Mercedes-Benz','Volkswagen','BYD'],
    'Pesado': ['Hino','Isuzu','Freightliner','International','Volvo','Mercedes-Benz','Scania','Mack','Kenworth','Foton','JAC','Dongfeng','UD Trucks','Iveco'],
    'Motocicleta': ['Honda','Yamaha','Suzuki','Kawasaki','BMW','Ducati','Aprilia','KTM','Triumph','Harley-Davidson','Husqvarna','Royal Enfield','Benelli','CFMoto','Vespa','Bajaj','TVS','Italika','Hero','Genesis','Freedom','Serpento','Daytona','Vento','Zontes','Voge'],
    'ATV': ['Honda','Yamaha','Suzuki','Kawasaki','Polaris','Can-Am','CFMoto','Kymco','Hisun','Linhai','TGB','Segway','Bombardier'],
    'Motor de lancha': ['Yamaha','Mercury','Suzuki','Honda','Tohatsu','Evinrude','Johnson','Mariner','Parsun','Selva'],
    'Motogenerador': ['Cummins','Caterpillar','Perkins','Kohler','Generac','Honda','Yamaha','Toyama','Firman','Hyundai','Pramac','FG Wilson','Power Value','Champion']
  },

  /* Unidad de control de mantenimiento por tipo (km o horas de uso) */
  _unidadPorTipo: { 'Motor de lancha': 'h', 'Motogenerador': 'h' },

  /* Modelos específicos por tipo+marca (evita mezclar con autos/motos) */
  _modelosEspeciales: {
    'ATV': {
      'Honda': ['TRX250 Recon','TRX420 Rancher','TRX500 Foreman','TRX520 Rubicon','FourTrax 90','TRX700XX'],
      'Yamaha': ['Grizzly 350','Grizzly 700','Kodiak 450','Kodiak 700','Raptor 700','YFZ450R','Wolverine'],
      'Suzuki': ['KingQuad 400','KingQuad 500','KingQuad 750','QuadSport Z400'],
      'Kawasaki': ['Brute Force 300','Brute Force 750','KFX90','KFX700'],
      'Polaris': ['Sportsman 450','Sportsman 570','Sportsman 850','Scrambler 850','Outlaw 110'],
      'Can-Am': ['Outlander 450','Outlander 650','Outlander 1000','Renegade 650','DS 250'],
      'CFMoto': ['CForce 400','CForce 600','CForce 800','CForce 1000'],
      'Kymco': ['MXU 270','MXU 550','MXU 700'],
      'Hisun': ['Tactic 400','Forge 550','Strike 550','Sector 750'],
      'TGB': ['Blade 550','Blade 1000','Target 500'],
      'Segway': ['Snarler AT6','Fugleman UT10']
    },
    'Motor de lancha': {
      'Yamaha': ['F15','F25','F40','F60','F90','F115','F150','F200','F250','Enduro E40','2T 40'],
      'Mercury': ['15 FourStroke','40 FourStroke','60 FourStroke','90 FourStroke','115 Pro XS','150 FourStroke','200 Verado','250 Verado'],
      'Suzuki': ['DF15','DF25','DF40','DF60','DF90','DF115','DF140','DF200','DF250'],
      'Honda': ['BF15','BF25','BF40','BF60','BF90','BF115','BF150','BF200','BF250'],
      'Tohatsu': ['MFS9.8','MFS15','MFS30','MFS40','MFS60','MFS90','MFS140'],
      'Evinrude': ['E-TEC 25','E-TEC 60','E-TEC 90','E-TEC 150','E-TEC G2 200'],
      'Parsun': ['F15','F40','T40','F60'],
      'Selva': ['Murena 40','Dorado 60','Tuna 90']
    },
    'Motogenerador': {
      'Cummins': ['C22 D5 (22 kVA Trifásico)','C33 D5 (33 kVA Trifásico)','C66 D5 (66 kVA Trifásico)','C110 D5 (110 kVA Trifásico)','C150 D5 (150 kVA Trifásico)','C220 D5 (220 kVA Trifásico)'],
      'Caterpillar': ['DE13.5 (Trifásico)','DE22 (Trifásico)','DE33 (Trifásico)','DE65 (Trifásico)','DE110 (Trifásico)','DE150 (Trifásico)'],
      'Perkins': ['1103 (Trifásico)','1104 (Trifásico)','1106 (Trifásico)','2206 (Trifásico)'],
      'Kohler': ['20REOZK (Trifásico)','30REOZK (Trifásico)','60REOZK (Trifásico)','100REOZK (Trifásico)'],
      'Generac': ['SD030 (Trifásico)','SD050 (Trifásico)','SD100 (Trifásico)','Guardian (Monofásico)'],
      'Honda': ['EU22i (Monofásico)','EG2800 (Monofásico)','EG4000 (Monofásico)','EG6500 (Bifásico)','EM5000 (Monofásico)'],
      'Yamaha': ['EF2000iS (Monofásico)','EF6300 (Bifásico)','EF12000 (Trifásico)'],
      'Toyama': ['TG2800 (Monofásico)','TG4000 (Monofásico)','TG6500 (Bifásico)','TDG12000 (Trifásico)'],
      'Firman': ['P03608 (Monofásico)','P08010 (Bifásico)'],
      'Hyundai': ['DHY6000 (Bifásico)','DHY8000 (Trifásico)']
    }
  },
  _colores: ['Blanco','Negro','Gris','Plateado','Rojo','Azul','Azul marino','Celeste','Verde','Beige','Café','Dorado','Amarillo','Naranja','Vino','Turquesa',
             'Blanco/Negro','Negro/Rojo','Negro/Gris','Azul/Blanco','Rojo/Negro','Naranja/Negro'],

  /* Modelos sugeridos por marca (autos, SUV, camiones y motos comunes en GT).
     Es un catálogo editable: el usuario siempre puede escribir uno nuevo. */
  _modelosPorMarca: {
    'Toyota': ['Corolla','Yaris','Camry','Hilux','RAV4','Land Cruiser','Land Cruiser Prado','Fortuner','4Runner','Tacoma','Tundra','Highlander','Avanza','Rush','Raize','Corolla Cross','Sienna','Sequoia','Coaster','Dyna','Hiace'],
    'Honda': ['Civic','Accord','CR-V','HR-V','Pilot','Fit','City','BR-V','Ridgeline','Odyssey','CB125','CB190R','XR150L','CRF250','Navi','Dio','PCX','Cargo 150'],
    'Nissan': ['Sentra','Versa','Altima','Frontier','X-Trail','Kicks','Qashqai','Pathfinder','Murano','March','Navara','NP300','Urvan','Patrol'],
    'Hyundai': ['Accent','Elantra','Sonata','Tucson','Santa Fe','Creta','Kona','Grand i10','Venue','Palisade','H100','HD65','HD78','Porter'],
    'Kia': ['Rio','Cerato','Forte','Sportage','Sorento','Seltos','Picanto','Soul','Carnival','Stonic','K2500','K2700','Frontier'],
    'Mazda': ['Mazda2','Mazda3','Mazda6','CX-3','CX-30','CX-5','CX-9','BT-50'],
    'Chevrolet': ['Spark','Aveo','Sail','Onix','Cruze','Tracker','Captiva','Equinox','Tahoe','Suburban','Silverado','Colorado','D-Max','N300','N400'],
    'Volkswagen': ['Gol','Polo','Virtus','Jetta','Passat','T-Cross','Taos','Tiguan','Amarok','Saveiro','Vento'],
    'Mitsubishi': ['Mirage','Lancer','ASX','Outlander','Montero','Montero Sport','L200','Xpander','Eclipse Cross','Canter','Fuso'],
    'Suzuki': ['Alto','Swift','Baleno','Ciaz','Dzire','Vitara','S-Cross','Jimny','Ertiga','Carry','GN125','GSX125','DR150','V-Strom','Gixxer'],
    'Ford': ['Fiesta','Focus','Figo','EcoSport','Escape','Edge','Explorer','Expedition','Ranger','F-150','Transit','Bronco'],
    'Jeep': ['Renegade','Compass','Cherokee','Grand Cherokee','Wrangler','Gladiator'],
    'Subaru': ['Impreza','Legacy','XV','Forester','Outback','Crosstrek'],
    'BMW': ['Serie 1','Serie 3','Serie 5','X1','X3','X5','X6','G 310','F 850 GS','R 1250 GS','S 1000 RR'],
    'Mercedes-Benz': ['Clase A','Clase C','Clase E','GLA','GLC','GLE','Sprinter','Actros','Atego','Axor'],
    'Hino': ['300 Series','Dutro','500 Series','FC','GD','FG','XZU'],
    'Isuzu': ['D-Max','ELF','NPR','NQR','FRR','FVR','Forward'],
    'Freightliner': ['Cascadia','M2 106','Columbia','Cargo','FLD'],
    'International': ['DuraStar','WorkStar','ProStar','HV','MV'],
    'Volvo': ['FH','FM','FMX','VNL','XC40','XC60','XC90'],
    'Scania': ['P-Series','G-Series','R-Series','S-Series'],
    'Foton': ['Aumark','Tunland','View','Auman','BJ'],
    'JAC': ['X200','T6','T8','J4','Sunray','HFC'],
    'Yamaha': ['YBR125','FZ','FZ25','MT-03','MT-07','XTZ125','XTZ150','R3','R15','Crypton','BWS','NMAX','XMAX'],
    'Kawasaki': ['Ninja 400','Ninja 300','Z400','Z650','Versys 300','KLR650','KLX150','Vulcan'],
    'KTM': ['Duke 200','Duke 250','Duke 390','RC 200','RC 390','Adventure 390','EXC'],
    'Bajaj': ['Boxer','Pulsar 135','Pulsar 180','Pulsar NS200','Pulsar 220','Dominar 400','CT100'],
    'Italika': ['FT125','FT150','FT180','DM150','RT200','Vitalia','125Z','TC200'],
    'Honda Motos': ['CB125','CB190R','XR150L','CRF250','Navi','Dio','PCX','Cargo 150','Wave'],
    'Harley-Davidson': ['Iron 883','Forty-Eight','Street Glide','Road King','Fat Boy','Sportster'],
    'Royal Enfield': ['Classic 350','Meteor 350','Himalayan','Hunter 350','Continental GT']
  },

  /* Plan de mantenimiento preventivo por tipo (intervalos del fabricante en km) */
  _mantenimiento: {
    'Liviano': [
      { item:'Cambio de aceite y filtro de aceite', km:5000,  ico:'🛢️' },
      { item:'Rotación de llantas',                  km:10000, ico:'🔄' },
      { item:'Alineación y balanceo',                km:10000, ico:'⚖️' },
      { item:'Filtro de aire del motor',             km:15000, ico:'💨' },
      { item:'Filtro de cabina (A/C)',               km:15000, ico:'❄️' },
      { item:'Pastillas de freno (revisión)',        km:20000, ico:'🛑' },
      { item:'Filtro de combustible',                km:30000, ico:'⛽' },
      { item:'Líquido de frenos',                    km:40000, ico:'🧪' },
      { item:'Bujías',                               km:40000, ico:'⚡' },
      { item:'Refrigerante / anticongelante',        km:60000, ico:'🌡️' },
      { item:'Aceite de transmisión (ATF)',          km:60000, ico:'⚙️' },
      { item:'Banda / correa de distribución',       km:90000, ico:'🔗' }
    ],
    'SUV': [
      { item:'Cambio de aceite y filtro de aceite', km:5000,  ico:'🛢️' },
      { item:'Rotación de llantas',                  km:10000, ico:'🔄' },
      { item:'Alineación y balanceo',                km:10000, ico:'⚖️' },
      { item:'Filtro de aire del motor',             km:15000, ico:'💨' },
      { item:'Pastillas de freno (revisión)',        km:20000, ico:'🛑' },
      { item:'Filtro de combustible',                km:30000, ico:'⛽' },
      { item:'Líquido de frenos',                    km:40000, ico:'🧪' },
      { item:'Bujías',                               km:40000, ico:'⚡' },
      { item:'Aceite de transferencia / diferencial',km:50000, ico:'⚙️' },
      { item:'Refrigerante / anticongelante',        km:60000, ico:'🌡️' },
      { item:'Banda / correa de distribución',       km:100000,ico:'🔗' }
    ],
    'Pesado': [
      { item:'Aceite de motor y filtro',             km:10000, ico:'🛢️' },
      { item:'Filtro separador de agua/combustible', km:15000, ico:'⛽' },
      { item:'Filtro de aire',                       km:20000, ico:'💨' },
      { item:'Frenos (revisión y ajuste)',           km:25000, ico:'🛑' },
      { item:'Aceite de transmisión',                km:40000, ico:'⚙️' },
      { item:'Aceite de diferenciales',              km:40000, ico:'⚙️' },
      { item:'Líquido refrigerante',                 km:60000, ico:'🌡️' },
      { item:'Ajuste de válvulas',                   km:80000, ico:'🔧' }
    ],
    'Motocicleta': [
      { item:'Cambio de aceite de motor',            km:3000,  ico:'🛢️' },
      { item:'Lubricación y ajuste de cadena',       km:1000,  ico:'🔗' },
      { item:'Filtro de aire',                       km:6000,  ico:'💨' },
      { item:'Bujía',                                km:8000,  ico:'⚡' },
      { item:'Frenos (pastillas/zapatas)',           km:10000, ico:'🛑' },
      { item:'Líquido de frenos',                    km:20000, ico:'🧪' },
      { item:'Kit de arrastre (cadena/piñones)',     km:25000, ico:'⚙️' }
    ],
    'ATV': [
      { item:'Cambio de aceite y filtro de motor',   km:1000,  ico:'🛢️' },
      { item:'Filtro de aire',                       km:3000,  ico:'💨' },
      { item:'Bujía',                                km:5000,  ico:'⚡' },
      { item:'Frenos (revisión)',                    km:5000,  ico:'🛑' },
      { item:'Aceite de diferencial / transmisión',  km:8000,  ico:'⚙️' },
      { item:'Líquido de frenos',                    km:15000, ico:'🧪' },
      { item:'Refrigerante',                         km:20000, ico:'🌡️' }
    ],
    /* Intervalos en HORAS de uso (no km) */
    'Motor de lancha': [
      { item:'Aceite y filtro de motor (4T)',        km:100, ico:'🛢️' },
      { item:'Aceite del pie / cola (gearcase)',     km:100, ico:'⚙️' },
      { item:'Filtro de combustible / separador',    km:100, ico:'⛽' },
      { item:'Ánodos de zinc (anticorrosión)',       km:100, ico:'🛡️' },
      { item:'Impulsor de bomba de agua (impeller)', km:200, ico:'💧' },
      { item:'Bujías',                               km:300, ico:'⚡' },
      { item:'Termostato',                           km:300, ico:'🌡️' },
      { item:'Banda / correa de distribución',       km:500, ico:'🔗' }
    ],
    /* Intervalos en HORAS de uso (no km) */
    'Motogenerador': [
      { item:'Aceite y filtro de aceite',            km:100, ico:'🛢️' },
      { item:'Revisión de batería y bornes',         km:250, ico:'🔋' },
      { item:'Filtro de aire',                       km:250, ico:'💨' },
      { item:'Bujías (gasolina)',                    km:300, ico:'⚡' },
      { item:'Filtro de combustible',                km:500, ico:'⛽' },
      { item:'Refrigerante / anticongelante',        km:500, ico:'🌡️' },
      { item:'Ajuste de válvulas',                   km:500, ico:'🔧' }
    ]
  },

  _opcionesMarca(tipo) {
    return (this._marcasPorTipo[tipo] || this._marcasPorTipo['Liviano'])
      .map(m => `<option value="${m}">`).join('');
  },

  _opcionesModelo(marca, tipo) {
    const esp = tipo && this._modelosEspeciales[tipo];
    const modelos = (esp && esp[marca]) || this._modelosPorMarca[marca] || [];
    return modelos.map(m => `<option value="${m}">`).join('');
  },

  /* Al cambiar el tipo, repuebla marcas y modelos sugeridos sin borrar lo escrito */
  _onTipoChange() {
    const tipo = document.getElementById('veh-tipo')?.value;
    const dl = document.getElementById('marcas-list');
    if (dl) dl.innerHTML = this._opcionesMarca(tipo);
    const dlMod = document.getElementById('modelos-list');
    if (dlMod) dlMod.innerHTML = this._opcionesModelo(document.getElementById('veh-marca')?.value, tipo);
  },

  /* Al cambiar la marca, repuebla los modelos sugeridos según el tipo */
  _onMarcaChange() {
    const marca = document.getElementById('veh-marca')?.value;
    const tipo = document.getElementById('veh-tipo')?.value;
    const dl = document.getElementById('modelos-list');
    if (dl) dl.innerHTML = this._opcionesModelo(marca, tipo);
  },

  async render(clienteId=null) {
    const el = document.getElementById('page-content');
    UI.loading(el);
    [this._data, this._clientes] = await Promise.all([
      DB.getVehiculos(clienteId), DB.getClientes()
    ]);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🚗 Vehículos</h1>
        <p class="page-subtitle">// ${this._data.length} registrados</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.vehiculos.modalForm()">＋ Nuevo Vehículo</button>
        </div>
      </div>
      <div class="page-body">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Placa</th><th>Vehículo</th><th>Cliente</th><th>Km</th><th>Motor</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              ${this._data.map(v=>`<tr>
                <td class="mono-sm"><b>${v.placa}</b></td>
                <td>${v.marca} ${v.modelo}<br><small style="color:var(--text3)">${[v.tipo,v.anio,v.color].filter(Boolean).join(' · ')}</small></td>
                <td>${v.clientes?.nombre||'—'}</td>
                <td class="mono-sm">${(v.kilometraje||0).toLocaleString()} km</td>
                <td>${v.motor||'—'}</td>
                <td onclick="event.stopPropagation()">
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.vehiculos.planMantenimiento('${v.id}')" title="Plan de mantenimiento preventivo">🔧 Mant.</button>
                    <button class="btn btn-sm btn-cyan" onclick="Modulos.vehiculos.modalForm('${v.id}')" title="Editar">✏️ Editar</button>
                    <button class="btn btn-sm btn-amber" onclick="Modulos.ordenes?.modalForm(null,'${v.id}')" title="Nueva OT">＋ OT</button>
                    <button class="btn btn-sm btn-danger" onclick="Modulos.vehiculos.eliminar('${v.id}','${v.placa}')" title="Eliminar">🗑️</button>
                  </div>
                </td>
              </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">Sin vehículos registrados</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  async modalForm(id=null) {
    const v = id ? this._data.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Vehículo`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del vehículo.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Placa *</label>
          <input class="form-input" id="veh-placa" value="${v.placa||''}" placeholder="P-123ABC" style="text-transform:uppercase"></div>
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="veh-cliente">
            <option value="">Seleccionar cliente...</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${v.cliente_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo *</label>
          <select class="form-select" id="veh-tipo" onchange="Modulos.vehiculos._onTipoChange()">
            ${this._tipos.map(t=>`<option ${(v.tipo||'Liviano')===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Marca *</label>
          <input class="form-input" id="veh-marca" list="marcas-list" autocomplete="off" value="${v.marca||''}" placeholder="Escribe o elige..."
                 oninput="Modulos.vehiculos._onMarcaChange()" onchange="Modulos.vehiculos._onMarcaChange()">
          <datalist id="marcas-list">${this._opcionesMarca(v.tipo||'Liviano')}</datalist>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Si no está en la lista, escríbela.</div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Modelo *</label>
          <input class="form-input" id="veh-modelo" list="modelos-list" autocomplete="off" value="${v.modelo||''}" placeholder="Elige según la marca o escribe...">
          <datalist id="modelos-list">${this._opcionesModelo(v.marca||'', v.tipo||'Liviano')}</datalist>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Sugerencias según la marca. Puedes escribir uno nuevo.</div></div>
        <div class="form-group"><label class="form-label">Año</label>
          <input class="form-input" id="veh-anio" type="number" value="${v.anio||''}" placeholder="2020"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Color</label>
          <input class="form-input" id="veh-color" list="colores-list" autocomplete="off" value="${v.color||''}" placeholder="Escribe o elige...">
          <datalist id="colores-list">${this._colores.map(c=>`<option value="${c}">`).join('')}</datalist>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Escribe uno nuevo o un dual (ej. Negro/Rojo).</div></div>
        <div class="form-group"><label class="form-label">Combustible</label>
          <select class="form-select" id="veh-comb">
            ${['Gasolina','Diesel','Híbrido','Eléctrico','GLP'].map(c=>`<option ${v.combustible===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Kilometraje / Horas de uso</label>
          <input class="form-input" id="veh-km" type="number" value="${v.kilometraje||''}" placeholder="km (autos) u horas (motores/generadores)"></div>
        <div class="form-group"><label class="form-label">Motor</label>
          <input class="form-input" id="veh-motor" value="${v.motor||''}" placeholder="1.8L"></div>
      </div>
      <div class="form-group"><label class="form-label">VIN / No. de Chasis</label>
        <input class="form-input" id="veh-vin" value="${v.vin||''}" maxlength="17" placeholder="17 caracteres" style="text-transform:uppercase">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">El VIN correcto permite a Beto identificar el vehículo y verificar fallas / códigos DTC.</div></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="veh-notas" rows="2">${v.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.vehiculos.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Vehículo'}
        </button>
      </div>`,'640px');
  },

  async guardar(id='') {
    const placa   = document.getElementById('veh-placa')?.value.trim().toUpperCase();
    const cliente = document.getElementById('veh-cliente')?.value;
    const marca   = document.getElementById('veh-marca')?.value.trim();
    const modelo  = document.getElementById('veh-modelo')?.value.trim();
    if (!placa||!cliente||!marca||!modelo) { UI.toast('Placa, cliente, marca y modelo son obligatorios','error'); return; }

    const fields = {
      placa, cliente_id:cliente, marca, modelo,
      tipo:        document.getElementById('veh-tipo')?.value||null,
      anio:        parseInt(document.getElementById('veh-anio')?.value)||null,
      color:       document.getElementById('veh-color')?.value||null,
      combustible: document.getElementById('veh-comb')?.value||null,
      kilometraje: parseInt(document.getElementById('veh-km')?.value)||0,
      motor:       document.getElementById('veh-motor')?.value||null,
      vin:         (document.getElementById('veh-vin')?.value||'').trim().toUpperCase()||null,
      notas:       document.getElementById('veh-notas')?.value||null
    };
    if (id) fields.id = id;

    const { error } = await DB.upsertVehiculo(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal();
    UI.toast(id?'Vehículo actualizado ✓':'Vehículo registrado ✓');
    this.render();
  },

  async eliminar(id, placa) {
    const ok = await UI.confirmar(`¿Eliminar vehículo <b>${placa}</b>?`, 'Eliminar');
    if (!ok) return;
    const r = await DB.deleteVehiculo(id);
    if (r) { UI.toast('Vehículo eliminado'); this.render(); }
    else UI.toast('Error al eliminar','error');
  },

  /* ── PLAN DE MANTENIMIENTO PREVENTIVO ─────────────
     Calendario del fabricante según el tipo de vehículo y su kilometraje.
     Para todos: livianos, SUV, camiones (pesado) y motocicletas. */
  planMantenimiento(id) {
    const v = this._data.find(x=>x.id===id);
    if (!v) return;
    const tipo = this._mantenimiento[v.tipo] ? v.tipo : 'Liviano';
    const plan = this._mantenimiento[tipo];
    const km = Number(v.kilometraje)||0;
    const u  = this._unidadPorTipo[tipo] || 'km';

    const filas = plan.map(p=>{
      /* Próximo múltiplo del intervalo respecto al uso actual */
      const ciclos   = Math.floor(km / p.km);
      const proximo  = (ciclos + 1) * p.km;
      const faltan   = proximo - km;
      const pct      = Math.max(0, Math.min(100, Math.round((km % p.km) / p.km * 100)));
      /* Estado por proximidad (margen según unidad: horas vs km) */
      const margen = u==='h' ? Math.max(10, p.km*0.1) : Math.max(500, p.km*0.1);
      const venc = faltan <= margen;
      const color = km===0 ? 'gray' : venc ? 'red' : faltan <= p.km*0.25 ? 'amber' : 'green';
      const estado = km===0 ? `Registra ${u==='h'?'las horas':'el km'}` : venc ? '¡Próximo ya!' : `Faltan ${faltan.toLocaleString()} ${u}`;
      return `<tr>
        <td><span style="font-size:15px;margin-right:6px">${p.ico}</span>${p.item}</td>
        <td class="mono-sm" style="text-align:center">cada ${p.km.toLocaleString()} ${u}</td>
        <td class="mono-sm" style="text-align:center">${proximo.toLocaleString()} ${u}</td>
        <td style="min-width:120px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:6px;background:var(--surface3);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:var(--${color});border-radius:3px"></div>
            </div>
            <span class="badge badge-${color}" style="white-space:nowrap">${estado}</span>
          </div>
        </td>
      </tr>`;
    }).join('');

    UI.modal(`🔧 Mantenimiento — ${v.marca} ${v.modelo} (${v.placa})`, `
      <div class="alert alert-cyan" style="margin-bottom:14px">
        <div class="alert-icon">📋</div>
        <div class="alert-body" style="font-size:12px">
          Calendario preventivo recomendado por el fabricante para <b>${tipo}</b>.
          ${u==='h'?'Horas de uso':'Kilometraje'} actual: <b>${km.toLocaleString()} ${u}</b>.
          ${km===0?`<br><span style="color:var(--amber)">Actualiza ${u==='h'?'las horas de uso':'el kilometraje'} para calcular los próximos servicios.</span>`:''}
        </div>
      </div>
      <div class="table-wrap"><table class="data-table" style="font-size:12.5px">
        <thead><tr><th>Servicio</th><th style="text-align:center">Intervalo</th><th style="text-align:center">Próximo</th><th>Estado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>

      <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px">
        <div style="font-weight:700;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">🤖 Recomendaciones específicas del fabricante</div>
        <div id="mant-ia" style="font-size:13px;color:var(--text2);white-space:pre-wrap;background:var(--surface2);border-radius:8px;padding:12px;min-height:48px;line-height:1.5">
          Consulta a Beto recomendaciones específicas para tu <b>${v.marca} ${v.modelo}${v.anio?` ${v.anio}`:''}</b> (aceites, torques, particularidades del fabricante).
        </div>
        <button class="btn btn-amber btn-sm" style="margin-top:10px" onclick="Modulos.vehiculos.consultarBeto('${id}')">🔧 Consultar a Beto (IA)</button>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-ghost" onclick="UI.cerrarModal();Modulos.ordenes?.modalForm(null,'${id}')">＋ OT en blanco</button>
        <button class="btn btn-amber" onclick="Modulos.vehiculos.generarOTSugerida('${id}')">🧰 Generar OT sugerida</button>
      </div>`, '720px');
  },

  /* Crea automáticamente una OT con los servicios preventivos DEBIDOS según
     el kilometraje (cada uno como ítem independiente) + Mano de obra. */
  async generarOTSugerida(id) {
    const v = this._data.find(x=>x.id===id);
    if (!v) return;
    const tipo = this._mantenimiento[v.tipo] ? v.tipo : 'Liviano';
    const plan = this._mantenimiento[tipo];
    const km = Number(v.kilometraje)||0;
    const u  = this._unidadPorTipo[tipo] || 'km';
    if (!km) { UI.toast(`Registra ${u==='h'?'las horas de uso':'el kilometraje'} para sugerir servicios`,'warn'); return; }

    /* Servicios próximos/vencidos según el uso actual (mismo criterio que el plan) */
    const due = plan.filter(p=>{
      const proximo = (Math.floor(km/p.km)+1)*p.km;
      const margen = u==='h' ? Math.max(10, p.km*0.1) : Math.max(500, p.km*0.1);
      return (proximo - km) <= margen;
    });
    if (!due.length) { UI.toast('No hay servicios próximos según el uso actual','info'); return; }

    const ok = await UI.confirmar(
      `Se creará una OT para <b>${v.marca} ${v.modelo} (${v.placa})</b> con <b>${due.length} servicio(s)</b> sugeridos a ${km.toLocaleString()} ${u}:<br><br>`+
      due.map(d=>`${d.ico} ${d.item}`).join('<br>')+
      `<br><br>más el ítem <b>Mano de obra</b>. Los precios quedan en Q0 para que los completes.`,
      'Crear OT sugerida'
    );
    if (!ok) return;

    const res = await DB.upsertOrden({
      vehiculo_id: v.id, cliente_id: v.cliente_id,
      descripcion: `Mantenimiento preventivo sugerido (${km.toLocaleString()} ${u}) — ${tipo}`,
      estado: 'recibido', prioridad: 'media', km_ingreso: u==='km'?km:null, total: 0
    });
    if (res.error || !res.data) { UI.toast('Error al crear OT: '+(res.error?.message||''),'error'); return; }
    const ordenId = res.data.id;

    const items = due.map((d,i)=>({
      tenant_id: getTID(), orden_id: ordenId, tipo: 'servicio',
      descripcion: d.item, cantidad: 1, precio_unit: 0, total: 0,
      ejecutado: false, es_extra: false, autorizado: true, orden_pos: i
    }));
    items.push({
      tenant_id: getTID(), orden_id: ordenId, tipo: 'mano_obra',
      descripcion: 'Mano de obra', cantidad: 1, precio_unit: 0, total: 0,
      ejecutado: false, es_extra: false, autorizado: true, orden_pos: items.length
    });
    await getSB().from('ot_items').insert(items);

    UI.cerrarModal();
    UI.toast(`OT ${res.data.num} creada con ${due.length} servicio(s) + mano de obra ✓`);
    App.navegarA('ordenes');
    setTimeout(()=>Modulos.ordenes?.verDetalle(ordenId), 400);
  },

  /* Consulta a la IA (Beto) recomendaciones del fabricante para este vehículo */
  async consultarBeto(id) {
    const v = this._data.find(x=>x.id===id);
    if (!v) return;
    const cont = document.getElementById('mant-ia');
    if (cont) cont.textContent = '⏳ Consultando recomendaciones del fabricante...';
    const km = Number(v.kilometraje)||0;
    const pregunta =
      `Dame el plan de mantenimiento preventivo y recomendaciones específicas del fabricante para un ` +
      `${v.tipo||'vehículo'} ${v.marca||''} ${v.modelo||''} ${v.anio||''}`.trim() +
      (v.vin?`, VIN ${v.vin}`:'') +
      (km?`, con ${km.toLocaleString()} km`:'') +
      (v.combustible?`, motor ${v.combustible}`:'') +
      `. Incluye: aceite recomendado y capacidad, intervalos por km, filtros, bujías, banda/cadena de distribución y puntos críticos típicos de este modelo. Responde conciso en español.`;
    const r = await IA.tecnico(pregunta);
    if (cont) cont.textContent = r.ok ? r.texto : '⚠️ ' + (r.error || 'No se pudo consultar la IA. Verifica que el asistente esté configurado.');
  }
};
