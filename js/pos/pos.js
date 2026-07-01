/* ═══════════════════════════════════════════════════════
   NexusPro Enterprise — Punto de Venta (POS)
   Pantalla independiente (pos.html), comparte la misma base de datos.
   Solo para roles de venta/gestión. Factura, descuenta inventario,
   acumula/canjea puntos de fidelización, programa envíos y hace
   corte diario + reportes semanal/mensual (libro de ventas).
═══════════════════════════════════════════════════════ */
const POS = {
  _prod: [], _clientes: [], _cart: [], _cliente: null,
  _metodo: 'Efectivo', _descuento: 0, _canje: 0,
  _busca: '', _cat: '', _envioData: null,
  _ROLES_OK: ['superadmin','admin','gerente_tal','gerente_fin','recepcionista','vendedor'],

  async iniciar() {
    try {
      const { data } = await getSB().auth.getSession();
      if (data?.session?.user) {
        await Auth._cargarPerfil(data.session.user.id, data.session.user.email);
        return this._postLogin();
      }
    } catch (_) {}
    this.renderLogin();
  },

  _puedeEntrar() {
    const rol = Auth.user?.rol;
    if (!rol) return false;
    const custom = Auth.user?.permisos_custom || {};
    if (custom.pos === true) return true;
    if (custom.pos === false) return false;
    return this._ROLES_OK.includes(rol);
  },

  _postLogin() {
    if (!this._puedeEntrar()) return this.renderDenegado();
    this.render();
  },

  /* ── LOGIN ───────────────────────────────────────── */
  renderLogin() {
    document.getElementById('pos-root').innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px">
        <div class="card" style="width:100%;max-width:380px">
          <div style="text-align:center;margin-bottom:18px">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:30px;letter-spacing:1px">NEXUSPRO</div>
            <div style="color:var(--amber);font-weight:800;letter-spacing:.1em">PUNTO DE VENTA</div>
          </div>
          <div class="form-group"><label class="form-label">Correo</label>
            <input class="form-input" id="pos-email" type="email" autocomplete="username"></div>
          <div class="form-group"><label class="form-label">Contraseña</label>
            <input class="form-input" id="pos-pass" type="password" autocomplete="current-password"
                   onkeydown="if(event.key==='Enter')POS.login()"></div>
          <button class="btn btn-amber" style="width:100%" onclick="POS.login()">Ingresar</button>
          <div id="pos-login-err" style="color:var(--red);font-size:12px;margin-top:10px;text-align:center"></div>
          <div style="text-align:center;margin-top:14px"><a href="/" style="color:var(--text3);font-size:12px">← Ir al sistema completo</a></div>
        </div>
      </div>`;
  },

  async login() {
    const email = document.getElementById('pos-email')?.value.trim();
    const pass  = document.getElementById('pos-pass')?.value;
    const err   = document.getElementById('pos-login-err');
    if (!email || !pass) { if (err) err.textContent = 'Ingresa correo y contraseña'; return; }
    if (err) err.textContent = 'Ingresando...';
    const r = await Auth.login(email, pass);
    if (!r.ok) { if (err) err.textContent = r.error || 'No se pudo ingresar'; return; }
    this._postLogin();
  },

  renderDenegado() {
    document.getElementById('pos-root').innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px">
        <div class="card" style="max-width:420px;text-align:center">
          <div style="font-size:40px">🚫</div>
          <h2 class="font-display" style="margin:8px 0">Sin acceso al POS</h2>
          <p style="color:var(--text2);font-size:13px">Tu usuario (${Auth.user?.email||''}) no tiene permiso para el Punto de Venta. Contacta al administrador.</p>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
            <button class="btn btn-ghost" onclick="POS.salir()">Cerrar sesión</button>
            <a class="btn btn-amber" href="/">Ir al sistema</a>
          </div>
        </div>
      </div>`;
  },

  async salir() { await Auth.logout(); this.renderLogin(); },

  /* Al salir: preguntar si guardar la sesión o terminar el turno */
  confirmarSalida() {
    UI.modal('⏻ Salir del Punto de Venta', `
      <p style="font-size:13px;color:var(--text2);margin-bottom:6px">¿Cómo deseas salir?</p>
      <ul style="font-size:12px;color:var(--text3);margin:0 0 8px 18px">
        <li><b>Guardar sesión:</b> sales del POS pero tu sesión queda activa para seguir vendiendo después.</li>
        <li><b>Terminar turno:</b> se hace el <b>cierre de caja</b>, se envía el reporte de cierre y se cierra la sesión.</li>
      </ul>
      <div class="modal-footer" style="flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-cyan" onclick="POS._guardarSesion()">💾 Guardar sesión</button>
        <button class="btn btn-amber" onclick="POS._terminarTurno()">🧾 Cerrar caja y terminar</button>
      </div>`);
  },

  _guardarSesion() { UI.cerrarModal(); location.href = '/'; },

  async _terminarTurno() {
    UI.cerrarModal();
    UI.toast('Generando cierre de caja...','info');
    const hoy = new Date().toISOString().slice(0,10);
    const facturas = await DB.getFacturas(hoy, hoy);
    const vivas = facturas.filter(f=>f.estado!=='anulada');
    const total = vivas.reduce((s,f)=>s+(Number(f.total)||0),0);
    const porMetodo = {};
    vivas.forEach(f=>{ const m=f.metodo_pago||'Efectivo'; porMetodo[m]=(porMetodo[m]||0)+(Number(f.total)||0); });
    const taller = Auth.tenant?.name || 'NexusPro';
    const dest = Auth.tenant?.email || Auth.user?.email;
    const html =
      `<div style="font-family:Arial,sans-serif;max-width:480px">`+
      `<h2 style="color:#d97706">🧾 Cierre de caja — ${taller}</h2>`+
      `<p>Fecha: <b>${UI.fecha(hoy)}</b><br>Cajero: <b>${Auth.user?.nombre||Auth.user?.email||''}</b></p>`+
      `<p>Ventas del día: <b>${vivas.length}</b></p>`+
      `<table style="width:100%;border-collapse:collapse;font-size:14px">`+
      Object.entries(porMetodo).map(([m,v])=>`<tr><td style="padding:4px 0;color:#666">${m}</td><td style="text-align:right">${UI.q(v)}</td></tr>`).join('')+
      `<tr><td style="padding:8px 0;border-top:2px solid #d97706;font-weight:800">TOTAL</td><td style="text-align:right;border-top:2px solid #d97706;font-weight:800;color:#d97706">${UI.q(total)}</td></tr>`+
      `</table></div>`;
    let nota = '';
    if (dest) {
      const r = await Email.enviar(dest, `Cierre de caja ${taller} — ${UI.fecha(hoy)}`, { html });
      nota = r.ok ? ` y enviado a ${dest}` : ` (no se pudo enviar el correo: ${r.error})`;
    } else {
      nota = ' (sin correo configurado para enviar el reporte)';
    }
    await Auth.logout();
    this.renderLogin();
    UI.toast(`Cierre de caja realizado: ${vivas.length} ventas · ${UI.q(total)}${nota} ✓`, 'success', 7000);
  },

  /* ── PANTALLA PRINCIPAL ──────────────────────────── */
  async render() {
    const root = document.getElementById('pos-root');
    root.innerHTML = `<div class="empty-state"><div class="empty-state-sm">⏳</div>Cargando productos...</div>`;
    [this._prod, this._clientes] = await Promise.all([
      DB.getInventario(), DB.getClientes()
    ]);
    this._pintar();
  },

  _cats() {
    return [...new Set(this._prod.map(p=>p.categoria).filter(Boolean))].sort();
  },

  _pintar() {
    const root = document.getElementById('pos-root');
    root.innerHTML = `
      <style>
        .pos-cat-slider {
          display: flex !important;
          gap: 8px !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          height: 52px !important;
          align-items: center !important;
          padding: 0 4px !important;
          margin-bottom: 12px !important;
          scrollbar-width: none !important;
          -webkit-overflow-scrolling: touch;
        }
        .pos-cat-slider::-webkit-scrollbar {
          display: none !important;
        }
        .pos-cat-pill {
          flex-shrink: 0 !important;
          display: inline-block !important;
          text-align: center !important;
          height: 36px !important;
          line-height: 34px !important;
          padding: 0 16px !important;
          border-radius: 99px !important;
          background: var(--surface2) !important;
          border: 1px solid var(--border) !important;
          color: #ffffff !important;
          font-size: 13px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          user-select: none !important;
          white-space: nowrap !important;
        }
        .pos-cat-pill:hover {
          border-color: var(--amber-border) !important;
          background: var(--surface3) !important;
        }
        .pos-cat-pill.active {
          background: var(--amber) !important;
          color: #ffffff !important;
          border-color: var(--amber) !important;
          box-shadow: 0 4px 12px rgba(217,119,6,0.2) !important;
        }
      </style>
      <div style="display:flex;flex-direction:column;height:100vh">
        <header style="display:flex;align-items:center;gap:12px;padding:12px 18px;background:linear-gradient(90deg, var(--surface) 0%, var(--surface2) 100%);border-bottom:1px solid var(--border)">
          <div style="font-family:\'Outfit\',\'Bebas Neue\',sans-serif;font-size:24px;font-weight:900;letter-spacing:-0.5px;color:var(--amber)">🛒 POS</div>
          <div style="font-size:12px;color:var(--text3);background:var(--surface3);padding:4px 10px;border-radius:6px;font-weight:700">${Auth.tenant?.name||''}</div>
          <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="POS.corteDiario()">🧾 Corte Diario</button>
            <button class="btn btn-ghost btn-sm" onclick="POS.reportes()">📊 Reportes</button>
            <span style="font-size:12px;color:var(--text2);font-weight:700;display:flex;align-items:center;gap:6px">${Auth.user?.avatar||'👤'} ${Auth.user?.nombre||Auth.user?.email||''}</span>
            <button class="btn btn-ghost btn-sm" onclick="POS.confirmarSalida()">⏻ Salir</button>
          </div>
        </header>
        <div style="flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;overflow:hidden">
          <!-- Catálogo -->
          <div style="padding:18px;overflow-y:auto;display:flex;flex-direction:column;gap:14px">
            <div style="display:flex;gap:12px;align-items:center">
              <div style="position:relative;flex:1">
                <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text3)">🔍</span>
                <input class="form-input" style="width:100%;padding-left:36px" placeholder="Buscar producto o código..."
                       value="${this._busca}" oninput="POS._busca=this.value;POS._pintarGrid()">
              </div>
            </div>
            <!-- Categorías Horizontal Slider -->
            <div class="pos-cat-slider">
              <div class="pos-cat-pill ${!this._cat ? 'active' : ''}" onclick="POS._cat='';POS._onCatChange(this)">📦 Todo</div>
              ${this._cats().map(c=>`
                <div class="pos-cat-pill ${this._cat===c?'active':''}" onclick="POS._cat='${c}';POS._onCatChange(this)">${c}</div>
              `).join('')}
            </div>
            <div id="pos-grid" style="flex:1"></div>
          </div>
          <!-- Carrito -->
          <div style="border-left:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column">
            <div id="pos-cart" style="flex:1;overflow-y:auto;padding:16px"></div>
            <div id="pos-totales" style="border-top:1px solid var(--border);padding:16px"></div>
          </div>
        </div>
      </div>`;
    this._pintarGrid();
    this._pintarCart();
  },

  _onCatChange(el) {
    document.querySelectorAll('.pos-cat-pill').forEach(p=>p.classList.remove('active'));
    el.classList.add('active');
    this._pintarGrid();
  },

  _filtrados() {
    const b = this._busca.trim().toLowerCase();
    return this._prod.filter(p => {
      if (this._cat && p.categoria !== this._cat) return false;
      if (!b) return true;
      return (p.nombre||'').toLowerCase().includes(b)
          || (p.codigo||'').toLowerCase().includes(b)
          || (p.codigo_barras||'').toLowerCase().includes(b);
    });
  },

  _pintarGrid() {
    const cont = document.getElementById('pos-grid');
    if (!cont) return;
    const items = this._filtrados();
    cont.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">
      ${items.map(p=>{
        const sinStock = (p.stock||0) <= 0;
        const stockBajo = !sinStock && (p.stock||0) <= 5;
        const thumb = p.imagen_url
          ? `<img src="${p.imagen_url}" alt="" style="width:100%;height:100px;object-fit:cover;border-radius:12px 12px 0 0">`
          : `<div style="width:100%;height:100px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:32px;border-radius:12px 12px 0 0">📦</div>`;
        return `
        <div class="pos-prod-card" onclick="${sinStock?'':'POS.addToCart(\''+p.id+'\')'}" style="opacity:${sinStock?0.55:1}">
          <div style="position:relative">
            ${thumb}
            ${sinStock?`<span style="position:absolute;top:8px;right:8px;background:var(--red);color:#fff;font-size:9px;font-weight:900;padding:2px 6px;border-radius:4px">AGOTADO</span>`:
              (stockBajo?`<span style="position:absolute;top:8px;right:8px;background:var(--amber);color:#fff;font-size:9px;font-weight:900;padding:2px 6px;border-radius:4px">¡ÚLTIMOS ${p.stock}!</span>`:'')}
          </div>
          <div style="padding:10px">
            <div style="font-weight:800;font-size:12px;line-height:1.3;height:32px;overflow:hidden;color:var(--text);margin-bottom:6px">${p.nombre}</div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:900;font-size:14px;color:var(--amber);font-family:\'Outfit\',sans-serif">${UI.q(p.precio_venta)}</span>
              <span style="font-size:10px;color:var(--text3);font-weight:700">${sinStock?'Sin stock':`${p.stock} ${p.unidad_medida||''}`}</span>
            </div>
          </div>
        </div>`;
      }).join('')||'<div class="text-muted" style="padding:24px;text-align:center">Sin productos encontrados</div>'}
    </div>`;
  },

  /* ── CARRITO ─────────────────────────────────────── */
  addToCart(id) {
    const p = this._prod.find(x=>x.id===id);
    if (!p) return;
    const linea = this._cart.find(l=>l.id===id);
    const enCarrito = linea ? linea.cant : 0;
    if (enCarrito + 1 > (p.stock||0)) { UI.toast('No hay más stock disponible','warn'); return; }
    if (linea) linea.cant++;
    else this._cart.push({ id:p.id, nombre:p.nombre, precio:Number(p.precio_venta)||0, cant:1, stock:p.stock, unidad:p.unidad_medida, imagen_url:p.imagen_url });
    this._pintarCart();
  },

  cambiarCant(id, delta) {
    const l = this._cart.find(x=>x.id===id);
    if (!l) return;
    l.cant += delta;
    if (l.cant <= 0) { this._cart = this._cart.filter(x=>x.id!==id); }
    else if (l.cant > (l.stock||0)) { l.cant = l.stock; UI.toast('Límite de stock','warn'); }
    this._pintarCart();
  },

  quitar(id) { this._cart = this._cart.filter(x=>x.id!==id); this._pintarCart(); },

  _totales() {
    const bruto = this._cart.reduce((s,l)=>s+l.cant*l.precio, 0);
    const tasa = Number(fidelizacionCfg().puntos_por_q1_canje)||10;   // pts que valen Q1
    const descCanje = this._canje > 0 ? this._canje/tasa : 0;
    const desc = Math.min(bruto, (Number(this._descuento)||0) + descCanje);
    const total = Math.max(0, bruto - desc);
    const subtotal = Math.round(total/1.12*100)/100;
    const iva = Math.round((total - subtotal)*100)/100;
    return { bruto, desc, descCanje, total, subtotal, iva };
  },

  _pintarCart() {
    const cont = document.getElementById('pos-cart');
    const tot  = document.getElementById('pos-totales');
    if (!cont || !tot) return;
    cont.innerHTML = `
      <div style="font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--amber);margin-bottom:12px">🧾 Detalle de la Venta</div>
      ${this._cart.length ? this._cart.map(l=>`
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
          ${l.imagen_url?`<img src="${l.imagen_url}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0">`:'<div style="width:40px;height:40px;border-radius:8px;background:var(--surface3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">📦</div>'}
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)">${l.nombre}</div>
            <div style="font-size:11.5px;color:var(--text3);margin-top:2px">${UI.q(l.precio)} c/u</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="btn btn-ghost" style="width:26px;height:26px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;border:1px solid var(--border)" onclick="POS.cambiarCant('${l.id}',-1)">−</button>
            <span style="min-width:24px;text-align:center;font-weight:900;font-size:14px">${l.cant}</span>
            <button class="btn btn-ghost" style="width:26px;height:26px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;border:1px solid var(--border)" onclick="POS.cambiarCant('${l.id}',1)">+</button>
          </div>
          <div style="width:84px;text-align:right;font-weight:900;font-size:14px" class="text-amber">${UI.q(l.cant*l.precio)}</div>
          <button class="btn btn-ghost" style="padding:4px 6px;color:var(--text3)" onclick="POS.quitar('${l.id}')" title="Eliminar">🗑️</button>
        </div>`).join('') : '<div class="text-muted" style="padding:40px 20px;text-align:center;font-size:13px">Selecciona productos a la izquierda para agregarlos al carrito</div>'}`;

    const t = this._totales();
    const cli = this._cliente;
    const puntosCli = cli?.programa_puntos ? (Number(cli.puntos_saldo)||0) : null;
    tot.innerHTML = `
      <!-- Cliente Selector -->
      <div style="margin-bottom:12px">
        <button class="btn btn-ghost" style="width:100%;text-align:left;font-size:13.5px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface2)" onclick="POS.modalCliente()">
          👤 ${cli ? `<b>${cli.nombre}</b>` : 'Consumidor Final (CF)'}${puntosCli!==null?` · <span style="color:var(--amber);font-weight:800">${puntosCli} pts</span>`:''}
        </button>
      </div>

      <!-- Canjear Puntos -->
      ${puntosCli!==null && puntosCli>=(Number(fidelizacionCfg().puntos_por_q1_canje)||10) ? (()=>{ const tasa=Number(fidelizacionCfg().puntos_por_q1_canje)||10; return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:13px;background:var(--surface2);padding:10px 12px;border-radius:10px;border:1px solid var(--border)">
        <span>Canjear puntos:</span>
        <div style="display:flex;align-items:center;gap:6px">
          <input class="form-input" style="width:80px;padding:6px 8px;font-size:13px" type="number" min="0" step="${tasa}" max="${Math.min(puntosCli, Math.floor(t.bruto*tasa))}"
                 value="${this._canje}" onchange="POS.setCanje(this.value)">
          <span class="text-muted" style="font-weight:700">= Q${(this._canje/tasa).toFixed(2)}</span>
        </div>
      </div>`; })():''}

      <!-- Descuento y Metodo -->
      <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;justify-content:space-between;font-size:13px">
        <span>Descuento Manual:</span>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-weight:700">Q</span>
          <input class="form-input" style="width:80px;padding:6px 8px;font-size:13px" type="number" min="0" step="0.01"
                 value="${this._descuento}" onchange="POS.setDescuento(this.value)">
        </div>
      </div>

      <!-- Selector de Pago Segmentado -->
      <div style="font-size:11px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Método de Pago</div>
      <div class="pos-pay-grid">
        ${[
          { id:'Efectivo', label:'Efectivo', icon:'💵' },
          { id:'Tarjeta', label:'Tarjeta', icon:'💳' },
          { id:'Transferencia', label:'Transfer', icon:'🏦' },
          { id:'Cheque', label:'Cheque', icon:'✍️' }
        ].map(m=>`
          <div class="pos-pay-btn ${this._metodo===m.id?'selected':''}" onclick="POS._setMetodoPago('${m.id}', this)">
            <span style="font-size:18px">${m.icon}</span>
            <span>${m.label}</span>
          </div>
        `).join('')}
      </div>

      <!-- Programar Envio -->
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:12px 0;cursor:pointer;user-select:none">
        <input type="checkbox" id="pos-envio-on" style="width:16px;height:16px" ${this._envioData?'checked':''} onchange="POS._toggleEnvio(this.checked)"> 🚚 Programar envío al cliente
      </label>
      ${this._envioData?`<div style="font-size:11.5px;color:var(--cyan);background:var(--surface2);border-radius:8px;padding:8px 10px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border)">
        <span>📦 ${this._envioData.destinatario||'Cliente'} · ${(this._envioData.direccion||'').slice(0,40)}</span>
        <button class="btn btn-sm btn-ghost" style="padding:2px 8px" onclick="POS.modalEnvio()">✏️</button>
      </div>`:''}

      <!-- Totales Breakdown -->
      <div style="background:var(--surface2);border-radius:12px;padding:12px;border:1px solid var(--border)">
        ${t.desc>0?`<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text3);padding:2px 0"><span>Descuento</span><span style="color:var(--red);font-weight:700">− ${UI.q(t.desc)}</span></div>`:''}
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text2);padding:2px 0"><span>Subtotal</span><span>${UI.q(t.subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text3);padding:2px 0"><span>IVA (12%)</span><span>${UI.q(t.iva)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:24px;font-weight:900;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-family:\'Outfit\',sans-serif">
          <span>Total</span>
          <span style="color:var(--green)">${UI.q(t.total)}</span>
        </div>
      </div>

      <button class="btn btn-amber" style="width:100%;font-size:17px;padding:15px;font-weight:900;border-radius:10px;margin-top:14px;box-shadow:0 6px 18px rgba(217,119,6,0.2)" onclick="POS.cobrar()" ${this._cart.length?'':'disabled'}>
        💵 Cobrar ${UI.q(t.total)}
      </button>`;
  },

  _setMetodoPago(metodo, el) {
    this._metodo = metodo;
    document.querySelectorAll('.pos-pay-btn').forEach(b=>b.classList.remove('selected'));
    el.classList.add('selected');
  },

  setDescuento(v) { this._descuento = Math.max(0, parseFloat(v)||0); this._pintarCart(); },
  setCanje(v) {
    const tasa = Number(fidelizacionCfg().puntos_por_q1_canje)||10;
    let n = parseInt(v)||0;
    n = Math.floor(n/tasa)*tasa;   // múltiplos de la tasa de canje
    const saldo = Number(this._cliente?.puntos_saldo)||0;
    const bruto = this._totales().bruto;
    this._canje = Math.max(0, Math.min(n, saldo, Math.floor(bruto*tasa)));
    this._pintarCart();
  },

  /* ── CLIENTE ─────────────────────────────────────── */
  modalCliente() {
    UI.modal('👤 Cliente de la venta', `
      <input class="form-input" id="pos-cli-busca" placeholder="🔍 Buscar nombre / NIT / teléfono..."
             oninput="POS._filtrarClientes(this.value)" style="margin-bottom:10px">
      <div style="max-height:320px;overflow-y:auto" id="pos-cli-list">${this._listaClientes(this._clientes)}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="POS.setCliente(null)">Consumidor Final</button>
      </div>`, '480px');
  },

  _listaClientes(arr) {
    return arr.map(c=>`<div onclick="POS.setCliente('${c.id}')" style="padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center">
      <div><b>${c.nombre}</b><div style="font-size:11px;color:var(--text3)">NIT ${c.nit||'CF'} · ${c.tel||''}</div></div>
      ${c.programa_puntos?`<span class="badge badge-amber">${c.puntos_saldo||0} pts</span>`:'<span class="badge badge-gray">sin puntos</span>'}
    </div>`).join('') || '<div class="text-muted" style="padding:16px">Sin clientes</div>';
  },

  _filtrarClientes(q) {
    const b = (q||'').toLowerCase();
    const arr = this._clientes.filter(c=>(c.nombre||'').toLowerCase().includes(b)||(c.nit||'').toLowerCase().includes(b)||(c.tel||'').includes(b));
    const cont = document.getElementById('pos-cli-list');
    if (cont) cont.innerHTML = this._listaClientes(arr);
  },

  setCliente(id) {
    this._cliente = id ? this._clientes.find(c=>c.id===id) : null;
    this._canje = 0;
    UI.cerrarModal();
    this._pintarCart();
  },

  /* ── ENVÍO ───────────────────────────────────────── */
  _toggleEnvio(on) {
    if (on) this.modalEnvio();
    else { this._envioData = null; this._pintarCart(); }
  },

  modalEnvio() {
    const e = this._envioData || {};
    const cli = this._cliente;
    const hoy = new Date().toISOString().slice(0,10);
    UI.modal('🚚 Datos del envío al cliente', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Destinatario *</label>
          <input class="form-input" id="env-dest" value="${e.destinatario||cli?.nombre||''}" placeholder="Nombre de quien recibe"></div>
        <div class="form-group"><label class="form-label">Teléfono *</label>
          <input class="form-input" id="env-tel" value="${e.telefono||cli?.tel||''}" placeholder="5555-5555"></div>
      </div>
      <div class="form-group"><label class="form-label">Dirección de entrega *</label>
        <textarea class="form-input" id="env-dir" rows="2" placeholder="Calle, número, zona, referencias...">${e.direccion||cli?.direccion||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Municipio / Depto.</label>
          <input class="form-input" id="env-muni" value="${e.municipio||''}" placeholder="Guatemala, Mixco..."></div>
        <div class="form-group"><label class="form-label">Medio de envío</label>
          <select class="form-select" id="env-medio">
            ${['Courier','Mensajería en moto','Vehículo propio','Encomienda / bus','Retiro en tienda'].map(m=>`<option ${e.medio===m?'selected':''}>${m}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Empresa / Courier</label>
          <input class="form-input" id="env-empresa" value="${e.empresa||''}" placeholder="Cargo Expreso, Guatex..."></div>
        <div class="form-group"><label class="form-label">Costo del flete (Q)</label>
          <input class="form-input" id="env-costo" type="number" min="0" step="0.01" value="${e.costo||''}" placeholder="0.00"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Entrega estimada</label>
          <input class="form-input" id="env-fecha" type="date" value="${e.fecha_entrega||hoy}"></div>
        <div class="form-group"><label class="form-label">Referencia / Notas</label>
          <input class="form-input" id="env-notas" value="${e.refs||''}" placeholder="Punto de referencia, horario..."></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="POS._cancelEnvio()">Cancelar</button>
        <button class="btn btn-amber" onclick="POS._guardarEnvioDatos()">Guardar datos de envío</button>
      </div>`, '560px');
  },

  _cancelEnvio() {
    /* Si no había datos previos, desmarca la casilla */
    if (!this._envioData) { const c = document.getElementById('pos-envio-on'); if (c) c.checked = false; }
    UI.cerrarModal();
  },

  _guardarEnvioDatos() {
    const destinatario = document.getElementById('env-dest')?.value.trim();
    const telefono     = document.getElementById('env-tel')?.value.trim();
    const direccion    = document.getElementById('env-dir')?.value.trim();
    if (!destinatario || !telefono || !direccion) {
      UI.toast('Destinatario, teléfono y dirección son obligatorios','error'); return;
    }
    this._envioData = {
      destinatario, telefono, direccion,
      municipio: document.getElementById('env-muni')?.value.trim()||'',
      medio:     document.getElementById('env-medio')?.value||'',
      empresa:   document.getElementById('env-empresa')?.value.trim()||'',
      costo:     parseFloat(document.getElementById('env-costo')?.value)||0,
      fecha_entrega: document.getElementById('env-fecha')?.value||'',
      refs:      document.getElementById('env-notas')?.value.trim()||''
    };
    UI.cerrarModal();
    UI.toast('Datos de envío guardados ✓');
    this._pintarCart();
  },

  /* ── COBRO ───────────────────────────────────────── */
  async cobrar() {
    if (!this._cart.length) return;
    const t = this._totales();
    const progEnvio = !!this._envioData;
    const cli = this._cliente;

    const res = await DB.upsertFactura({
      cliente_id: cli?.id || null,
      nit: cli?.nit?.trim() || 'CF',
      nombre_receptor: cli?.nombre || 'Consumidor Final',
      tipo_cliente: (cli?.nit && cli.nit.toUpperCase()!=='CF') ? 'NIT' : 'CF',
      subtotal: t.subtotal, iva: t.iva, total: t.total,
      metodo_pago: this._metodo, estado: 'certificada',
      fecha: new Date().toISOString().slice(0,10),
      descripcion: 'Venta POS: ' + this._cart.map(l=>`${l.nombre} x${l.cant}`).join(', ').slice(0,480)
    });
    if (res.error || !res.data) { UI.toast('Error al cobrar: '+(res.error?.message||''),'error'); return; }
    const factura = res.data;

    const items = this._cart.map(l=>({ descripcion:l.nombre, cantidad:l.cant, precio_unit:l.precio, total:l.cant*l.precio, inventario_id:l.id }));
    await DB.insertFacturaItems(factura.id, items);
    await DB.descontarInventarioVenta(items, `Factura ${factura.num||factura.id.slice(0,8)}`);

    /* Fidelización: canje (descuento) y acumulación según política del taller */
    const fid = fidelizacionCfg();
    if (cli?.programa_puntos) {
      if (this._canje > 0) {
        await DB.registrarPuntos(cli.id, -this._canje, { tipo:'canje', motivo:'Canje en venta POS', referencia:factura.num, factura_id:factura.id });
      }
      const ganados = Math.floor(t.total * (Number(fid.puntos_por_q)||0));
      if (ganados > 0) {
        await DB.registrarPuntos(cli.id, ganados, { tipo:'gana', motivo:'Compra POS', referencia:factura.num, factura_id:factura.id });
      }
    }

    /* Programar envío con los datos capturados */
    if (progEnvio) {
      const e = this._envioData;
      await DB.upsertEnvio({
        tipo: 'courier',
        descripcion: `Entrega venta ${factura.num||''}`,
        destinatario: e.destinatario || cli?.nombre || 'Cliente',
        cliente_id: cli?.id || null,
        telefono: e.telefono || null,
        direccion: e.direccion || null,
        municipio: e.municipio || null,
        referencias: e.refs || null,
        empresa_transporte: e.empresa || null,
        medio: e.medio || null,
        costo_flete: e.costo || 0,
        costo_total: e.costo || 0,
        num_factura: factura.num || null,
        orden_id: null,
        fecha_envio: new Date().toISOString().slice(0,10),
        fecha_entrega_estimada: e.fecha_entrega || null,
        estado: 'programado'
      }).catch(()=>{});
    }

    const totalPagado = t.total;
    const ganados = cli?.programa_puntos ? Math.floor(t.total * (Number(fid.puntos_por_q)||0)) : 0;
    /* Reset venta */
    this._cart = []; this._descuento = 0; this._canje = 0; this._cliente = null; this._metodo = 'Efectivo'; this._envioData = null;
    await this.render();
    this._recibo(factura, items, totalPagado, ganados, progEnvio);
  },

  _recibo(factura, items, total, ganados, programado) {
    UI.modal('✅ Venta registrada', `
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:34px">✅</div>
        <div style="font-weight:800;font-size:18px">${UI.q(total)}</div>
        <div style="font-size:12px;color:var(--text3)">${factura.num||''} · ${factura.metodo_pago||''}</div>
        ${ganados>0?`<div style="font-size:12px;color:var(--amber);margin-top:4px">+${ganados} puntos de fidelización</div>`:''}
        ${programado?'<div style="font-size:12px;color:var(--cyan)">🚚 Envío programado</div>':''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="POS._imprimirRecibo('${factura.id}')">🖨️ Imprimir recibo</button>
      </div>`);
  },

  async _imprimirRecibo(facturaId) {
    const items = await DB.getFacturaItems(facturaId);
    const { data: f } = await getSB().from('facturas').select('*').eq('id', facturaId).maybeSingle();
    if (!f) return;
    const win = window.open('','_blank');
    win.document.write(`<html><head><title>Recibo ${f.num||''}</title>
      <style>
        body { font-family: 'DM Mono', 'Courier New', monospace; padding: 12px; max-width: 290px; color: #000; font-size: 12px; line-height: 1.4; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .r { display: flex; justify-content: space-between; }
        .hr { border-top: 1px dashed #000; margin: 8px 0; }
        .title { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
      </style></head>
      <body>
      <div class="center title">${Auth.tenant?.name||'NexusPro'}</div>
      <div class="center" style="font-size:10px">NIT: ${Auth.tenant?.nit||'—'}</div>
      <div class="center" style="font-size:10px">${Auth.tenant?.direccion||'Guatemala'}</div>
      <div class="hr"></div>
      <div class="r"><span>No. Ticket: <b>${f.num||''}</b></span><span>${UI.fecha(f.fecha)}</span></div>
      <div>Cliente: ${f.nombre_receptor||'CF'}</div>
      <div>NIT/DPI: ${f.nit||'CF'}</div>
      <div class="hr"></div>
      ${items.map(i=>`
        <div style="margin-bottom: 4px">
          <div>${i.descripcion}</div>
          <div class="r"><span style="padding-left:10px;color:#555">${i.cantidad} x ${UI.q(i.precio_unit)}</span><span>${UI.q(i.total)}</span></div>
        </div>
      `).join('')}
      <div class="hr"></div>
      <div class="r"><span>Subtotal</span><span>${UI.q(f.subtotal)}</span></div>
      <div class="r"><span>IVA (12%)</span><span>${UI.q(f.iva)}</span></div>
      <div class="r bold" style="font-size:14px"><span>TOTAL</span><span>${UI.q(f.total)}</span></div>
      <div class="hr"></div>
      <div class="r"><span>Método Pago:</span><span>${f.metodo_pago||'Efectivo'}</span></div>
      <div class="hr"></div>
      <div class="center bold" style="margin-top:12px;font-size:11px">¡GRACIAS POR SU COMPRA!</div>
      <div class="center" style="font-size:9px;color:#444">NexusPro POS · Powered by Gemini</div>
      <script>window.print()</script></body></html>`);
    win.document.close();
  },

  /* ── CORTE DIARIO ────────────────────────────────── */
  async corteDiario() {
    const hoy = new Date().toISOString().slice(0,10);
    const facturas = await DB.getFacturas(hoy, hoy);
    const vivas = facturas.filter(f=>f.estado!=='anulada');
    const total = vivas.reduce((s,f)=>s+(Number(f.total)||0),0);
    const porMetodo = {};
    vivas.forEach(f=>{ const m=f.metodo_pago||'Efectivo'; porMetodo[m]=(porMetodo[m]||0)+(Number(f.total)||0); });
    UI.modal(`🧾 Corte diario — ${UI.fecha(hoy)}`, `
      <div class="kpi-grid" style="margin-bottom:14px">
        <div class="kpi-card"><div class="kpi-label">Ventas</div><div class="kpi-val cyan">${vivas.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total del día</div><div class="kpi-val amber">${UI.q(total)}</div></div>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Método de pago</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>${Object.entries(porMetodo).map(([m,v])=>`<tr><td>${m}</td><td style="text-align:right" class="mono-sm text-amber">${UI.q(v)}</td></tr>`).join('')||'<tr><td colspan="2" style="text-align:center;color:var(--text3)">Sin ventas hoy</td></tr>'}</tbody>
      </table></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="window.print()">🖨️ Imprimir</button>
      </div>`, '480px');
  },

  /* ── REPORTES SEMANAL / MENSUAL ──────────────────── */
  async reportes() {
    const hoy = new Date();
    const sem = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()-6).toISOString().slice(0,10);
    const mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0,10);
    const hoyStr = hoy.toISOString().slice(0,10);
    const [fSem, fMes] = await Promise.all([ DB.getFacturas(sem, hoyStr), DB.getFacturas(mes, hoyStr) ]);
    const sum = arr => arr.filter(f=>f.estado!=='anulada').reduce((s,f)=>s+(Number(f.total)||0),0);
    /* Ventas por día (mes en curso) */
    const dias = {};
    fMes.filter(f=>f.estado!=='anulada').forEach(f=>{ dias[f.fecha]=(dias[f.fecha]||0)+(Number(f.total)||0); });
    const filas = Object.entries(dias).sort((a,b)=>b[0].localeCompare(a[0]))
      .map(([d,v])=>`<tr><td>${UI.fecha(d)}</td><td style="text-align:right" class="mono-sm text-amber">${UI.q(v)}</td></tr>`).join('');
    UI.modal('📊 Reportes de ventas', `
      <div class="kpi-grid" style="margin-bottom:14px">
        <div class="kpi-card"><div class="kpi-label">Últimos 7 días</div><div class="kpi-val cyan">${UI.q(sum(fSem))}</div><div class="kpi-trend">${fSem.length} ventas</div></div>
        <div class="kpi-card"><div class="kpi-label">Mes en curso</div><div class="kpi-val amber">${UI.q(sum(fMes))}</div><div class="kpi-trend">${fMes.length} ventas</div></div>
      </div>
      <div style="font-size:12px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Libro de ventas — mes en curso</div>
      <div class="table-wrap" style="max-height:300px;overflow-y:auto"><table class="data-table">
        <thead><tr><th>Día</th><th style="text-align:right">Ventas</th></tr></thead>
        <tbody>${filas||'<tr><td colspan="2" style="text-align:center;color:var(--text3)">Sin ventas</td></tr>'}</tbody>
      </table></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-amber" onclick="window.print()">🖨️ Imprimir</button>
      </div>`, '520px');
  }
};
