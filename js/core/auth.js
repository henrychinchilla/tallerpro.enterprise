/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/auth.js — Autenticación y sesión
═══════════════════════════════════════════════════════ */

const Auth = {
  user:     null,
  tenant:   null,
  supaUser: null,
  licencia: null,

  /* ── LOGIN ────────────────────────────────────── */
  async login(email, password, tenantSlug=null) {
    const sb = getSB();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok:false, error:error.message };

    Auth.supaUser = data.user;
    await Auth._cargarPerfil(data.user.id, email, tenantSlug);

    /* Verificar licencia */
    if (email !== 'henry.chinchilla@gmail.com' && Auth.tenant?.id) {
      const { data: lic } = await getSB().from('licencias')
        .select('*').eq('tenant_id', Auth.tenant.id).maybeSingle();
      if (lic) {
        Auth.licencia = lic;
        if (lic.tipo === 'demo') {
          const dias = Math.ceil((new Date(lic.fecha_vencimiento) - Date.now()) / 86400000);
          if (dias < 0) return { ok:false, error:'demo_expirado', licencia:lic };
          Auth.licencia.dias_restantes = dias;
        }
      }
    }

    return { ok:true, debe_cambiar: Auth.user?.debe_cambiar_password === true };
  },

  /* ── LOGOUT ───────────────────────────────────── */
  async logout() {
    await getSB().auth.signOut();
    Auth.user = Auth.tenant = Auth.supaUser = Auth.licencia = null;
  },

  /* ── CREAR USUARIO ────────────────────────────── */
  async crearUsuario(fields) {
    /* Crear en Supabase Auth */
    const { data: authData, error: authErr } = await getSB().auth.signUp({
      email: fields.email,
      password: fields.password,
      options: { data: { nombre: fields.nombre, rol: fields.rol } }
    });
    if (authErr) return { ok:false, error:authErr.message };

    const userId = authData.user.id;

    /* Crear perfil */
    const { error: dbErr } = await getSB().from('usuarios').upsert({
      id:                    userId,
      tenant_id:             getTID(),
      nombre:                fields.nombre,
      email:                 fields.email,
      rol:                   fields.rol,
      telefono:              fields.telefono || null,
      avatar:                fields.avatar || '👤',
      activo:                true,
      debe_cambiar_password: true
    }, { onConflict:'id' });

    if (dbErr) console.warn('crearUsuario perfil:', dbErr.message);
    return { ok:true };
  },

  /* ── CARGAR PERFIL ────────────────────────────── */
  async _cargarPerfil(userId, email, tenantSlug=null) {
    /* Buscar perfil en public.usuarios */
    const { data: perfil } = await getSB().from('usuarios')
      .select('*').eq('id', userId).maybeSingle();

    if (perfil) {
      Auth.user = perfil;
      /* Cargar tenant */
      if (perfil.tenant_id) {
        const { data: t } = await getSB().from('tenants')
          .select('*').eq('id', perfil.tenant_id).maybeSingle();
        Auth.tenant = t;
      }
      /* Actualizar último login */
      getSB().from('usuarios').update({ ultimo_login: new Date().toISOString() })
        .eq('id', userId).then(() => {});
    } else {
      /* Fallback para superadmin */
      Auth.user = {
        id:     userId,
        nombre: email === 'henry.chinchilla@gmail.com' ? 'Henry Chinchilla' : email.split('@')[0],
        email,
        rol:    email === 'henry.chinchilla@gmail.com' ? 'superadmin' : 'admin',
        activo: true,
        avatar: email === 'henry.chinchilla@gmail.com' ? '⚡' : '👑'
      };
      /* Buscar tenant */
      if (tenantSlug) {
        const { data: t } = await getSB().from('tenants').select('*').eq('slug', tenantSlug).maybeSingle();
        Auth.tenant = t;
      }
      if (!Auth.tenant) {
        const { data: t } = await getSB().from('tenants').select('*').limit(1).maybeSingle();
        Auth.tenant = t;
      }
    }
  },

  /* ── CAMBIAR PASSWORD ─────────────────────────── */
  async cambiarPassword(nuevaPass) {
    const { error } = await getSB().auth.updateUser({ password: nuevaPass });
    if (error) return { ok:false, error:error.message };
    if (Auth.user?.id) {
      await getSB().from('usuarios').update({
        debe_cambiar_password: false,
        updated_at: new Date().toISOString()
      }).eq('id', Auth.user.id);
      Auth.user.debe_cambiar_password = false;
    }
    return { ok:true };
  },

  /* ── REGISTRAR NUEVO TALLER ───────────────────── */
  async registrarTaller(fields) {
    /* Crear tenant primero */
    const slug = fields.nombre_taller.toLowerCase()
      .replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').slice(0,40)
      + '-' + Date.now().toString(36);

    const { data: tenant, error: tErr } = await getSB().from('tenants').insert({
      slug, name: fields.nombre_taller, nit: fields.nit||null, email: fields.email
    }).select().single();
    if (tErr) return { ok:false, error:'Error creando taller: '+tErr.message };

    /* Crear licencia demo */
    await getSB().from('licencias').insert({
      tenant_id: tenant.id, tipo:'demo',
      fecha_inicio: new Date().toISOString().slice(0,10),
      fecha_vencimiento: new Date(Date.now()+30*86400000).toISOString().slice(0,10)
    });

    /* Crear config fiscal */
    await getSB().from('config_fiscal').insert({
      tenant_id: tenant.id, regimen_iva:'general', tasa_iva:0.12, tasa_isr:0.05
    });

    /* Crear usuario admin */
    const { data: authData, error: authErr } = await getSB().auth.signUp({
      email: fields.email, password: fields.password,
      options: { data: { nombre:fields.nombre, rol:'admin', tenant_id:tenant.id } }
    });
    if (authErr) return { ok:false, error:authErr.message };

    await getSB().from('usuarios').upsert({
      id: authData.user.id, tenant_id: tenant.id,
      nombre: fields.nombre, email: fields.email,
      rol:'admin', activo:true, avatar:'👑'
    });

    Auth.supaUser = authData.user;
    Auth.tenant   = tenant;
    Auth.user     = { id:authData.user.id, nombre:fields.nombre, email:fields.email, rol:'admin', activo:true, avatar:'👑', tenant_id:tenant.id };
    Auth.licencia = { tipo:'demo', dias_restantes:30 };

    return { ok:true };
  }
};
