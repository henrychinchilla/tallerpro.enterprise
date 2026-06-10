/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise — Punto de Venta (POS)
   Pantalla independiente (pos.html), comparte la misma base de datos.
   Solo para roles de venta/gestión. Factura, descuenta inventario,
   acumula/canjea puntos de fidelización, programa envíos y hace
   corte diario + reportes semanal/mensual (libro de ventas).
═══════════════════════════════════════════════════════ */
const POS = {
  _prod: [], _clientes: [], _cart: [], _cliente: null,
  _metodo: 'Efectivo', _descuento: 0, _canje: 0,
  _busca: '', _cat: '',
  _ROLES_OK: ['superadmin','admin','gerente_tal','gerente_fin','recepcionista'],

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
            <div style="font-family:'Bebas Neue',sans-serif;font-size:30px;letter-spacing:1px">TALLERPRO</div>
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
    const taller = Auth.tenant?.name || 'TallerPro';
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
      <div style="display:flex;flex-direction:column;height:100vh">
        <header style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--bg-surface,#111);border-bottom:1px solid var(--border)">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px">🛒 POS</div>
          <div style="font-size:12px;color:var(--text3)">${Auth.tenant?.name||''}</div>
          <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="POS.corteDiario()">🧾 Corte diario</button>
            <button class="btn btn-ghost btn-sm" onclick="POS.reportes()">📊 Reportes</button>
            <span style="font-size:12px;color:var(--text3);align-self:center">${Auth.user?.avatar||'👤'} ${Auth.user?.nombre||Auth.user?.email||''}</span>
            <button class="btn btn-ghost btn-sm" onclick="POS.confirmarSalida()">⏻ Salir</button>
          </div>
        </header>
        <div style="flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;overflow:hidden">
          <!-- Catálogo -->
          <div style="padding:14px;overflow-y:auto">
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
              <input class="form-input" style="flex:1;min-width:180px" placeholder="🔍 Buscar producto o código..."
                     value="${this._busca}" oninput="POS._busca=this.value;POS._pintarGrid()">
              <select class="form-select" style="width:160px" onchange="POS._cat=this.value;POS._pintarGrid()">
                <option value="">Todas las categorías</option>
                ${this._cats().map(c=>`<option value="${c}" ${this._cat===c?'selected':''}>${c}</option>`).join('')}
              </select>
            </div>
            <div id="pos-grid"></div>
          </div>
          <!-- Carrito -->
          <div style="border-left:1px solid var(--border);background:var(--bg-surface,#111);display:flex;flex-direction:column">
            <div id="pos-cart" style="flex:1;overflow-y:auto;padding:14px"></div>
            <div id="pos-totales" style="border-top:1px solid var(--border);padding:14px"></div>
          </div>
        </div>
      </div>`;
    this._pintarGrid();
    this._pintarCart();
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
    cont.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:9px">
      ${items.map(p=>{
        const sinStock = (p.stock||0) <= 0;
        const thumb = p.imagen_url
          ? `<img src="${p.imagen_url}" alt="" style="width:100%;height:90px;object-fit:cover;border-radius:8px 8px 0 0">`
          : `<div style="width:100%;height:90px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:30px;border-radius:8px 8px 0 0">📦</div>`;
        return `<div onclick="${sinStock?'':`POS.addToCart('${p.id}')`}"
          style="border:1px solid var(--border);border-radius:8px;cursor:${sinStock?'not-allowed':'pointer'};opacity:${sinStock?.5:1};overflow:hidden;background:var(--surface2)">
          ${thumb}
          <div style="padding:8px">
            <div style="font-weight:700;font-size:12px;line-height:1.2;height:30px;overflow:hidden">${p.nombre}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
              <span class="text-amber" style="font-weight:800;font-size:13px">${UI.q(p.precio_venta)}</span>
              <span style="font-size:10px;color:${sinStock?'var(--red)':'var(--text3)'}">${sinStock?'Sin stock':`${p.stock} ${p.unidad_medida||''}`}</span>
            </div>
          </div>
        </div>`;
      }).join('')||'<div class="text-muted" style="padding:24px">Sin productos</div>'}
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
    const descCanje = this._canje > 0 ? this._canje/10 : 0;   // 10 pts = Q1
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
      <div style="font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--amber);margin-bottom:10px">🧾 Venta actual</div>
      ${this._cart.length ? this._cart.map(l=>`
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          ${l.imagen_url?`<img src="${l.imagen_url}" style="width:38px;height:38px;border-radius:6px;object-fit:cover;flex-shrink:0">`:'<div style="width:38px;height:38px;border-radius:6px;background:var(--surface3,#222);display:flex;align-items:center;justify-content:center;flex-shrink:0">📦</div>'}
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.nombre}</div>
            <div style="font-size:12.5px;color:var(--text3)">${UI.q(l.precio)} c/u</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="btn btn-ghost btn-sm" style="padding:4px 11px;font-size:17px;line-height:1" onclick="POS.cambiarCant('${l.id}',-1)">−</button>
            <span style="min-width:28px;text-align:center;font-weight:800;font-size:16px">${l.cant}</span>
            <button class="btn btn-ghost btn-sm" style="padding:4px 11px;font-size:17px;line-height:1" onclick="POS.cambiarCant('${l.id}',1)">+</button>
          </div>
          <div style="width:92px;text-align:right;font-weight:800;font-size:15px" class="text-amber">${UI.q(l.cant*l.precio)}</div>
          <button class="btn btn-ghost btn-sm" style="padding:4px 7px" onclick="POS.quitar('${l.id}')">🗑️</button>
        </div>`).join('') : '<div class="text-muted" style="padding:20px;text-align:center;font-size:13px">Toca un producto para agregarlo</div>'}`;

    const t = this._totales();
    const cli = this._cliente;
    const puntosCli = cli?.programa_puntos ? (Number(cli.puntos_saldo)||0) : null;
    tot.innerHTML = `
      <div style="margin-bottom:10px">
        <button class="btn btn-ghost" style="width:100%;text-align:left;font-size:14px;padding:10px 12px" onclick="POS.modalCliente()">
          👤 ${cli ? cli.nombre : 'Consumidor Final (CF)'}${puntosCli!==null?` · ${puntosCli} pts`:''}
        </button>
      </div>
      ${puntosCli!==null && puntosCli>=10 ? `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:14px">
        <span>Canjear puntos:</span>
        <input class="form-input" style="width:110px;padding:8px 10px;font-size:15px" type="number" min="0" step="10" max="${Math.min(puntosCli, t.bruto*10)}"
               value="${this._canje}" onchange="POS.setCanje(this.value)">
        <span class="text-muted">= ${UI.q(this._canje/10)}</span>
      </div>`:''}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:14px">
        <span>Descuento Q:</span>
        <input class="form-input" style="width:110px;padding:8px 10px;font-size:15px" type="number" min="0" step="0.01"
               value="${this._descuento}" onchange="POS.setDescuento(this.value)">
        <select class="form-select" style="flex:1;padding:8px 10px;font-size:15px" onchange="POS._metodo=this.value">
          ${['Efectivo','Tarjeta','Transferencia','Cheque','Depósito'].map(m=>`<option ${this._metodo===m?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:10px;cursor:pointer">
        <input type="checkbox" id="pos-envio-on" style="width:17px;height:17px"> 🚚 Programar envío al cliente
      </label>
      ${t.desc>0?`<div style="display:flex;justify-content:space-between;font-size:14px;color:var(--text3);padding:2px 0"><span>Descuento</span><span>− ${UI.q(t.desc)}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-size:15px;color:var(--text2);padding:3px 0"><span>Subtotal</span><span>${UI.q(t.subtotal)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:15px;color:var(--text2);padding:3px 0"><span>IVA (12%)</span><span>${UI.q(t.iva)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:30px;font-weight:800;margin:8px 0 12px"><span>Total</span><span class="text-amber">${UI.q(t.total)}</span></div>
      <button class="btn btn-amber" style="width:100%;font-size:19px;padding:16px;font-weight:800" onclick="POS.cobrar()" ${this._cart.length?'':'disabled'}>💵 Cobrar ${UI.q(t.total)}</button>`;
  },

  setDescuento(v) { this._descuento = Math.max(0, parseFloat(v)||0); this._pintarCart(); },
  setCanje(v) {
    let n = parseInt(v)||0;
    n = Math.floor(n/10)*10;   // múltiplos de 10
    const saldo = Number(this._cliente?.puntos_saldo)||0;
    const bruto = this._totales().bruto;
    this._canje = Math.max(0, Math.min(n, saldo, Math.floor(bruto*10)));
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

  /* ── COBRO ───────────────────────────────────────── */
  async cobrar() {
    if (!this._cart.length) return;
    const t = this._totales();
    const progEnvio = document.getElementById('pos-envio-on')?.checked;
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

    /* Fidelización: canje (descuento) y acumulación */
    if (cli?.programa_puntos) {
      if (this._canje > 0) {
        await DB.registrarPuntos(cli.id, -this._canje, { tipo:'canje', motivo:'Canje en venta POS', referencia:factura.num, factura_id:factura.id });
      }
      const ganados = Math.floor(t.total);   // Q1 = 1 punto
      if (ganados > 0) {
        await DB.registrarPuntos(cli.id, ganados, { tipo:'gana', motivo:'Compra POS', referencia:factura.num, factura_id:factura.id });
      }
    }

    /* Programar envío */
    if (progEnvio) {
      await DB.upsertEnvio({
        tipo: 'courier', descripcion: `Entrega venta ${factura.num||''}`,
        destinatario: cli?.nombre || 'Cliente', orden_id: null,
        fecha_envio: new Date().toISOString().slice(0,10), estado: 'programado'
      }).catch(()=>{});
    }

    const totalPagado = t.total;
    const ganados = cli?.programa_puntos ? Math.floor(t.total) : 0;
    /* Reset venta */
    this._cart = []; this._descuento = 0; this._canje = 0; this._cliente = null; this._metodo = 'Efectivo';
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
      <style>body{font-family:monospace;padding:16px;max-width:320px}h3{text-align:center;margin:4px 0}.r{display:flex;justify-content:space-between}hr{border:none;border-top:1px dashed #000}</style></head>
      <body><h3>${Auth.tenant?.name||'TallerPro'}</h3>
      <div style="text-align:center;font-size:11px">NIT: ${Auth.tenant?.nit||'—'}</div><hr>
      <div class="r"><span>${f.num||''}</span><span>${UI.fecha(f.fecha)}</span></div>
      <div>Cliente: ${f.nombre_receptor||'CF'} (${f.nit||'CF'})</div><hr>
      ${items.map(i=>`<div class="r"><span>${i.cantidad} x ${i.descripcion}</span><span>${Number(i.total).toFixed(2)}</span></div>`).join('')}
      <hr><div class="r"><span>Subtotal</span><span>${Number(f.subtotal).toFixed(2)}</span></div>
      <div class="r"><span>IVA</span><span>${Number(f.iva).toFixed(2)}</span></div>
      <div class="r" style="font-weight:bold;font-size:15px"><span>TOTAL</span><span>Q${Number(f.total).toFixed(2)}</span></div>
      <div>Pago: ${f.metodo_pago||''}</div><hr>
      <div style="text-align:center;font-size:11px">¡Gracias por su compra!</div>
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
