/* NexusPro — Tablero en vivo ("modo GOD").

   Pedido por Henry el 2026-09-22, con una captura de un Grafana de CSS
   Electronics como referencia: foto del vehículo, relojes, mosaicos de color,
   tendencias y el recorrido en un mapa.

   Tres reglas, las mismas del resto del escáner:
     · Solo se muestra lo que el vehículo SOPORTA y CONTESTÓ. Un reloj de un
       sensor que el carro no tiene no se dibuja: nada de números de relleno.
     · Es una VISTA del monitor en vivo, no otro lector: usa el mismo ciclo de
       lectura y el mismo historial (_hist). Dos lectores en paralelo sobre un
       ELM327 se pisan las respuestas.
     · El mapa existe SOLO mientras hay datos en vivo: es el recorrido que se
       monitoreó, no un mapa por adorno. Si se graba la sesión, el recorrido
       queda guardado con la grabación.

   La foto es la de CATÁLOGO del fabricante (Edge Function foto-modelo, mig
   145: la IA encuentra la página oficial del modelo, la foto se verifica como
   ese modelo y se guarda para todos). Si no hay, Wikimedia Commons con su
   autor y licencia. El color de la foto puede no ser el del vehículo: por eso
   el color de la ficha va al lado, como dato. */
(() => {
  const M = Modulos.diagnostico_obd;
  if (!M) return;

  /* Sensores del tablero, en orden de importancia. Se toman solo los que el
     vehículo soporta, y como mucho 8: por Bluetooth cada lectura cuesta
     ~300 ms y con más el tablero se actualiza cada 3 s o peor. */
  const PIDS_TABLERO = ['0C', '0D', '05', '04', '2F', '11', '0B', '42', '33', '06', '07', '0F'];
  const RELOJES = { rpm: [0, 7000], vel: [0, 220], temp: [0, 130], carga: [0, 100], comb: [0, 100] };

  const COLORES_EN = {
    blanco: 'white', negro: 'black', gris: 'grey', plata: 'silver', plateado: 'silver', rojo: 'red',
    azul: 'blue', verde: 'green', amarillo: 'yellow', naranja: 'orange', 'café': 'brown', cafe: 'brown',
    marron: 'brown', 'marrón': 'brown', beige: 'beige', vino: 'red', corinto: 'red', dorado: 'gold', morado: 'purple',
  };
  const COLORES_CSS = {
    blanco: '#f8fafc', negro: '#111827', gris: '#6b7280', plata: '#c0c4cc', plateado: '#c0c4cc', rojo: '#dc2626',
    azul: '#2563eb', verde: '#16a34a', amarillo: '#eab308', naranja: '#f97316', 'café': '#7c4a1e', cafe: '#7c4a1e',
    marron: '#7c4a1e', 'marrón': '#7c4a1e', beige: '#d6c7a1', vino: '#7f1d1d', corinto: '#7f1d1d', dorado: '#ca8a04', morado: '#7e22ce',
  };

  Object.assign(M, {
    _ruta: [],            // [{lat, lng, t}] del monitoreo en vivo
    _gpsWatch: null,
    _mapa: null, _mapaLinea: null, _mapaPunto: null,

    _vehTablero() {
      const s = this._scan;
      return (s && (s.vehiculos || (this._vehiculos || []).find(v => v.id === s.vehiculo_id))) || {};
    },

    /* Los sensores del tablero que ESTE vehículo soporta. */
    _pidsTablero() {
      const disp = this._sensoresMonitor();
      return PIDS_TABLERO.filter(p => disp.includes(p) && this._defSensor(p)).slice(0, 8);
    },

    /* Último valor de un sensor: el del monitor si está corriendo, si no el
       que quedó en el escaneo. Nunca uno inventado. */
    _valorTablero(k) {
      const h = (this._hist && this._hist[k]) || [];
      const nums = h.filter(x => typeof x === 'number');
      if (nums.length) return nums[nums.length - 1];
      const d = this._scan && this._scan.datos;
      const v = d ? d[k] : null;
      return typeof v === 'number' ? v : null;
    },

    /* ── Foto genérica del modelo (Wikimedia Commons) ─────────────────── */
    async _fotoVehiculo(veh) {
      const marca = String(veh.marca || '').trim(), modelo = String(veh.modelo || '').trim();
      if (!marca || !modelo) return null;
      const colorEn = COLORES_EN[String(veh.color || '').trim().toLowerCase()] || '';
      const clave = `obd_foto_v2_${marca}|${modelo}|${veh.anio || ''}|${colorEn}`.toLowerCase();
      try { const c = JSON.parse(localStorage.getItem(clave) || 'null'); if (c && c.url) return c; } catch (_) {}

      /* 1. La foto OFICIAL de catálogo (Edge Function foto-modelo): la del
            fabricante, verificada por la IA como ese modelo y guardada para
            todos los talleres. Henry: «hay muchas fotos de brochures». */
      if (typeof IA !== 'undefined' && typeof IA.fotoModelo === 'function') {
        const r = await IA.fotoModelo(veh).catch(() => null);
        if (r && r.ok && r.url) {
          let sitio = 'sitio oficial';
          try { sitio = new URL(r.pagina).hostname.replace(/^www\./, ''); } catch (_) {}
          const foto = { url: r.url, pagina: r.pagina, autor: sitio, licencia: 'foto de catálogo del fabricante', oficial: true };
          try { localStorage.setItem(clave, JSON.stringify(foto)); } catch (_) {}
          return foto;
        }
      }
      /* 2. Respaldo: Wikimedia Commons (licencia libre). */
      /* De lo más parecido a lo más genérico: año y color juntos primero (la
         generación correcta Y el color), después cada uno por separado. */
      const consultas = [
        colorEn && veh.anio && `${marca} ${modelo} ${veh.anio} ${colorEn}`,
        colorEn && `${marca} ${modelo} ${colorEn}`,
        veh.anio && `${marca} ${modelo} ${veh.anio}`,
        `${marca} ${modelo}`,
      ].filter(Boolean);
      const malo = /interior|engine|motor|badge|logo|emblem|dashboard|wheel|rim|seat|trunk|detail|rear|heck/i;
      for (const q of consultas) {
        try {
          const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
            '&generator=search&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=640' +
            '&gsrsearch=' + encodeURIComponent(q);
          const r = await fetch(u);
          if (!r.ok) continue;
          const j = await r.json();
          const paginas = Object.values((j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
          const modeloRx = new RegExp(modelo.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          const buena = paginas.find(p => {
            const ii = p.imageinfo && p.imageinfo[0];
            return ii && /image\/(jpeg|png|webp)/.test(ii.mime || '') && modeloRx.test(p.title) && !malo.test(p.title);
          });
          if (!buena) continue;
          const ii = buena.imageinfo[0], meta = ii.extmetadata || {};
          const limpio = t => String((t && t.value) || '').replace(/<[^>]*>/g, '').trim();
          const foto = { url: ii.thumburl || ii.url, pagina: ii.descriptionurl,
                         autor: limpio(meta.Artist).slice(0, 80) || 'autor en Wikimedia', licencia: limpio(meta.LicenseShortName) || 'licencia libre',
                         busqueda: q };
          try { localStorage.setItem(clave, JSON.stringify(foto)); } catch (_) {}
          return foto;
        } catch (_) { /* sin internet o Commons caído: se sigue con la silueta */ }
      }
      return null;
    },

    _siluetaSVG() {
      return `<svg viewBox="0 0 240 110" style="width:100%;height:100%;opacity:.55">
        <path d="M18 78 L30 56 Q40 40 70 36 L120 30 Q150 30 172 44 L204 56 Q222 60 224 72 L224 80 Z" fill="var(--text3)"/>
        <circle cx="62" cy="82" r="15" fill="var(--text2)"/><circle cx="182" cy="82" r="15" fill="var(--text2)"/>
        <path d="M78 40 L118 35 L118 54 L66 56 Z M126 35 Q150 36 166 50 L126 54 Z" fill="var(--surface)"/></svg>`;
    },

    /* ── Esqueleto: se pinta UNA vez; el ciclo solo actualiza los números ── */
    _tableroHTML() {
      const veh = this._vehTablero(), s = this._scan || {};
      const pids = this._pidsTablero();
      const defs = pids.map(p => this._defSensor(p));
      const relojes = defs.filter(d => RELOJES[d.k]).slice(0, 4);
      /* Lo que no entró como reloj va como mosaico: con 5 candidatos a reloj
         el quinto (combustible) desaparecía del tablero. */
      const mosaicos = defs.filter(d => !relojes.includes(d));
      const colorTxt = String(veh.color || '').trim();
      const colorCss = COLORES_CSS[colorTxt.toLowerCase()];
      const tarjeta = (extra = '') => `background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px;${extra}`;
      if (!pids.length) return `<div style="grid-column:1/-1;${tarjeta()}">Este vehículo no reportó sensores para el tablero.</div>`;
      /* En teléfono todo va a una columna: un "span 2" fijo en una grilla de
         UNA columna crea una columna implícita y la página se desborda. */
      return `<style>
          #tab-root{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;min-width:0}
          #tab-root .tab-ancho{grid-column:1/-1}
          @media (min-width:560px){ #tab-root .tab-ancho{grid-column:span 2} }
          #tab-root svg{max-width:100%}
        </style>
        <div id="tab-root">
        <div class="tab-ancho" style="${tarjeta('display:flex;flex-direction:column;gap:6px;min-width:0')}">
          <div id="tab-foto" style="height:150px;display:flex;align-items:center;justify-content:center;border-radius:8px;overflow:hidden;background:var(--surface)">${this._siluetaSVG()}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <div><b style="font-size:15px">${UI.esc([veh.marca, veh.modelo, veh.anio].filter(Boolean).join(' ') || 'Vehículo')}</b>
              <div style="font-size:11.5px;color:var(--text3)">${UI.esc(veh.placa || '')}${s.vin ? ` · VIN <span style="font-family:ui-monospace,Consolas,monospace">${UI.esc(s.vin)}</span>` : ''}</div></div>
            ${colorTxt ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:3px 9px">
              <span style="width:12px;height:12px;border-radius:50%;background:${colorCss || 'transparent'};border:1px solid var(--border)"></span>${UI.esc(colorTxt)}</span>` : ''}
          </div>
          <div id="tab-foto-credito" style="font-size:9.5px;color:var(--text3)"></div>
        </div>
        ${relojes.map(d => `<div style="${tarjeta('text-align:center')}">
          <div style="font-size:11px;font-weight:700;color:var(--text2)">${UI.esc(d.l)}</div>
          <div id="tab-g-${d.k}" style="height:110px"></div></div>`).join('')}
        ${mosaicos.map(d => `<div id="tab-t-${d.k}" style="${tarjeta('border-top:4px solid var(--border)')}">
          <div style="font-size:11px;font-weight:700;color:var(--text2)">${UI.esc(d.l)}</div>
          <div class="tab-num" style="font-size:30px;font-weight:900;line-height:1.1;margin-top:4px">—</div>
          <div class="tab-ref" style="font-size:10px;color:var(--text3)"></div></div>`).join('')}
        ${['rpm', 'vel', 'acel'].filter(k => defs.some(d => d.k === k)).map(k => {
          const d = defs.find(x => x.k === k);
          return `<div class="tab-ancho" style="${tarjeta('min-width:0')}">
            <div style="font-size:11px;font-weight:700;color:var(--text2)">${UI.esc(d.l)} · tendencia</div>
            <div id="tab-c-${k}" style="height:90px;margin-top:6px"></div></div>`;
        }).join('')}
        <div id="tab-mapa-wrap" style="${tarjeta('grid-column:1/-1;display:none')}">
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--text2)">
            <span>🗺 Recorrido monitoreado</span><span id="tab-mapa-info" style="font-weight:500;color:var(--text3)"></span></div>
          <div id="tab-mapa" style="height:260px;border-radius:8px;margin-top:6px;overflow:hidden"></div>
        </div>
      </div>`;
    },

    async _pintarFotoTablero() {
      const veh = this._vehTablero();
      const foto = await this._fotoVehiculo(veh).catch(() => null);
      const zona = document.getElementById('tab-foto'), cred = document.getElementById('tab-foto-credito');
      if (!zona || !foto) { if (cred) cred.textContent = 'Sin foto del modelo en Wikimedia Commons'; return; }
      const img = new Image();
      img.alt = `${veh.marca || ''} ${veh.modelo || ''}`;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;object-position:center';
      img.onload = () => {
        /* Las de catálogo suelen ser banners muy anchos con el auto a la
           derecha del centro: se encuadra hacia ahí en vez de cortarlo. */
        if (img.naturalWidth / Math.max(1, img.naturalHeight) > 2.4) img.style.objectPosition = '68% 60%';
        zona.innerHTML = ''; zona.appendChild(img);
      };
      img.src = foto.url;
      if (cred) cred.innerHTML = foto.oficial
        ? `Foto de catálogo del modelo · <a href="${UI.esc(foto.pagina)}" target="_blank" rel="noopener" style="color:var(--cyan)">${UI.esc(foto.autor)}</a>`
        : `Foto genérica del modelo · ${UI.esc(foto.autor)} · ${UI.esc(foto.licencia)} · ` +
          `<a href="${UI.esc(foto.pagina)}" target="_blank" rel="noopener" style="color:var(--cyan)">Wikimedia Commons</a>`;
    },

    /* ── Cada vuelta del ciclo en vivo: solo números, sin rehacer el DOM ── */
    _actualizarTablero() {
      if (!document.getElementById('tab-root')) return;
      for (const p of this._pidsTablero()) {
        const d = this._defSensor(p), v = this._valorTablero(d.k);
        const est = this._estadoSensor(d, v);
        const color = est === 'mal' ? 'red' : est === 'ok' ? 'green' : est === 'fuera' ? 'amber' : 'cyan';
        const g = document.getElementById('tab-g-' + d.k);
        if (g) { const [mn, mx] = RELOJES[d.k]; g.innerHTML = this._gaugeSVG(v, mn, mx, d.l, d.u, color); }
        const t = document.getElementById('tab-t-' + d.k);
        if (t) {
          t.style.borderTopColor = `var(--${color})`;
          t.querySelector('.tab-num').innerHTML = v === null ? '—'
            : `${Math.round(v * 10) / 10}<span style="font-size:13px;font-weight:600;color:var(--text3);margin-left:2px">${UI.esc((d.u || '').trim())}</span>`;
          t.querySelector('.tab-ref').textContent = d.r ? `ref ${d.r[0]}–${d.r[1]}${d.rc ? ' · ' + d.rc : ''}` : '';
        }
        const c = document.getElementById('tab-c-' + d.k);
        if (c) c.innerHTML = this._spark(((this._hist || {})[d.k] || []).filter(x => typeof x === 'number'), d.r, color) ||
          '<div style="font-size:11px;color:var(--text3);padding-top:30px;text-align:center">Arrancá el monitor en vivo para ver la tendencia</div>';
      }
      this._actualizarMapa();
    },

    _abrirTablero() {
      /* Se seleccionan los sensores del tablero para que el ciclo los lea. */
      const pids = this._pidsTablero();
      if (pids.length) this._selMon = pids;
      const el = document.getElementById('obd-vivo');
      if (el) el.innerHTML = this._tableroHTML();
      this._pintarFotoTablero();
      this._actualizarTablero();
      if (this._liveTimer) this._iniciarGPS();
    },

    /* ── GPS y mapa: solo con datos en vivo ────────────────────────────── */
    async _cargarLeaflet() {
      if (typeof L !== 'undefined') return true;
      if (!document.getElementById('leaflet-css')) {
        const css = document.createElement('link');
        css.id = 'leaflet-css'; css.rel = 'stylesheet';
        css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);
      }
      await new Promise((ok, no) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
        s.onload = ok; s.onerror = no;
        document.head.appendChild(s);
      }).catch(() => {});
      return typeof L !== 'undefined';
    },

    _iniciarGPS() {
      if (this._gpsWatch != null) return;
      const wrap = document.getElementById('tab-mapa-wrap');
      if (wrap) wrap.style.display = '';
      const info = document.getElementById('tab-mapa-info');
      if (!navigator.geolocation) { if (info) info.textContent = 'Este dispositivo no tiene GPS disponible'; return; }
      this._ruta = [];
      if (info) info.textContent = 'Buscando señal GPS…';
      this._gpsWatch = navigator.geolocation.watchPosition(pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now(),
                    vel: this._valorTablero('vel'), rpm: this._valorTablero('rpm') };
        this._ruta.push(p);
        if (this._rec) (this._rec.ruta = this._rec.ruta || []).push(p);
        this._actualizarMapa();
      }, err => {
        if (info) info.textContent = err.code === 1 ? 'Sin permiso de ubicación: el recorrido no se dibuja'
          : 'Sin señal GPS en este dispositivo';
      }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    },

    _detenerGPS() {
      if (this._gpsWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(this._gpsWatch);
      this._gpsWatch = null;
    },

    async _actualizarMapa() {
      const cont = document.getElementById('tab-mapa');
      if (!cont || !this._ruta.length) return;
      if (!this._mapa || this._mapa.getContainer() !== cont) {
        if (!(await this._cargarLeaflet())) {
          const info = document.getElementById('tab-mapa-info');
          if (info) info.textContent = 'No se pudo cargar el mapa';
          return;
        }
        if (!document.getElementById('tab-mapa')) return;
        this._mapa = L.map(cont, { zoomControl: true, attributionControl: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(this._mapa);
        this._mapaLinea = L.polyline([], { color: '#0284c7', weight: 4 }).addTo(this._mapa);
        this._mapaPunto = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }).addTo(this._mapa);
      }
      const pts = this._ruta.map(p => [p.lat, p.lng]);
      this._mapaLinea.setLatLngs(pts);
      this._mapaPunto.setLatLng(pts[pts.length - 1]);
      if (pts.length === 1) this._mapa.setView(pts[0], 16);
      else this._mapa.fitBounds(this._mapaLinea.getBounds(), { padding: [20, 20], maxZoom: 17 });
      const info = document.getElementById('tab-mapa-info');
      if (info) info.textContent = `${pts.length} punto(s)${this._rec ? ' · se guarda con la grabación' : ''}`;
    },
  });

  /* Enganche con el monitor en vivo existente, sin duplicar su lógica. */
  const setVista = M._setVistaMon, stopLive = M._stopLive, toggleLive = M.toggleLive, tiles = M._tilesMonitor;
  M._setVistaMon = function (modo) {
    setVista.call(this, modo);
    if (modo === 'tablero') this._abrirTablero(); else this._detenerGPS();
  };
  M._tilesMonitor = function () {
    if (this._vistaMon === 'tablero') {
      /* El ciclo en vivo llama a esto en cada vuelta: con el tablero ya
         pintado, solo se actualizan los números (y el mapa sigue vivo). */
      if (document.getElementById('tab-root')) { this._actualizarTablero(); return null; }
      return this._tableroHTML();
    }
    return tiles.call(this);
  };
  M.toggleLive = async function () {
    const r = await toggleLive.call(this);
    if (this._liveTimer && this._vistaMon === 'tablero') this._iniciarGPS();
    return r;
  };
  M._stopLive = function () {
    stopLive.call(this);
    this._detenerGPS();   // el recorrido dibujado queda: es lo que se monitoreó
  };
})();
