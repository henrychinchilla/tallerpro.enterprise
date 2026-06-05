/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/auth.js — Autenticación y sesión
═══════════════════════════════════════════════════════ */

const Auth = {
  user:     null,
  tenant:   null,
  supaUser: null,
  licencia: null,

  /* ── TRADUCIR ERRORES SUPABASE ────────────────── */
  _traducirError(msg='') {
    const m = msg.toLowerCase();
    if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos';
    if (m.includes('email not confirmed'))       return 'Debes confirmar tu correo antes de entrar';
    if (m.includes('user already registered') ||
        m.includes('already been registered'))   return 'Ese correo ya está registrado';
    if (m.includes('password should be at least')) return 'La contraseña es muy corta (mínimo 8 caracteres)';
    if (m.includes('rate limit') ||
        m.includes('too many requests'))         return 'Demasiados intentos. Espera un momento e inténtalo de nuevo';
    if (m.includes('network') || m.includes('fetch')) return 'Sin conexión. Revisa tu internet';
    if (m.includes('for security purposes'))     return 'Por seguridad, espera unos segundos antes de reintentar';
    return msg || 'Ocurrió un error inesperado';
  },

  /* ── LOGIN ────────────────────────────────────── */
  async login(email, password, tenantSlug=null) {
    const sb = getSB();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok:false, error: Auth._traducirError(error.message) };

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
  /* Usa la Edge Function 'crear-usuario' (service role): valida el rol
     del admin y crea el auth user + perfil sin tocar la sesión actual.
     Reemplaza el viejo hack signUp()+restaurar sesión. */
  async crearUsuario(fields) {
    const { data, error } = await getSB().functions.invoke('crear-usuario', {
      body: {
        email:    fields.email,
        password: fields.password,
        nombre:   fields.nombre,
        rol:      fields.rol,
        telefono: fields.telefono || null,
        avatar:   fields.avatar || '👤'
      }
    });

    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch (_) {}
      return { ok:false, error: msg };
    }
    if (data?.error) return { ok:false, error: data.error };
    return { ok:true, id: data?.id };
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
        Auth.tenant = t; window._cachedTenantId = t?.id || null;
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
        Auth.tenant = t; window._cachedTenantId = t?.id || null;
      }
      if (!Auth.tenant) {
        const { data: t } = await getSB().from('tenants').select('*').limit(1).maybeSingle();
        Auth.tenant = t; window._cachedTenantId = t?.id || null;
      }
    }
  },

  /* ── RECUPERAR PASSWORD ───────────────────────── */
  /* Envía un correo con enlace de recuperación. Al volver, la app
     detecta el evento PASSWORD_RECOVERY y muestra el form de nueva clave.
     NOTA: el dominio (window.location.origin) debe estar en
     Supabase → Authentication → URL Configuration → Redirect URLs. */
  async recuperarPassword(email) {
    if (!email) return { ok:false, error:'Ingresa tu correo' };
    const { error } = await getSB().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) return { ok:false, error: Auth._traducirError(error.message) };
    return { ok:true };
  },

  /* ── CAMBIAR PASSWORD ─────────────────────────── */
  async cambiarPassword(nuevaPass) {
    const { error } = await getSB().auth.updateUser({ password: nuevaPass });
    if (error) return { ok:false, error: Auth._traducirError(error.message) };
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
  /* 1) signUp crea la cuenta (auto-inicia sesión si la confirmación de
        email está desactivada). 2) El RPC 'registrar_taller'
        (SECURITY DEFINER) crea tenant + licencia + config + usuario admin
        de forma atómica y los vincula al auth.uid(). */
  async registrarTaller(fields) {
    const sb = getSB();

    const { data: authData, error: authErr } = await sb.auth.signUp({
      email: fields.email, password: fields.password,
      options: { data: { nombre: fields.nombre, rol: 'admin' } }
    });
    if (authErr) return { ok:false, error: Auth._traducirError(authErr.message) };
    if (!authData.session) {
      return { ok:false, error:'Revisa tu correo para confirmar la cuenta y luego inicia sesión.' };
    }

    const { data: tenant, error: rpcErr } = await sb.rpc('registrar_taller', {
      p_nombre_taller: fields.nombre_taller,
      p_nit:           fields.nit || null,
      p_email:         fields.email,
      p_nombre:        fields.nombre
    });
    if (rpcErr) return { ok:false, error:'Error creando taller: '+rpcErr.message };

    Auth.supaUser = authData.user;
    Auth.tenant   = tenant;
    Auth.user     = { id:authData.user.id, nombre:fields.nombre, email:fields.email, rol:'admin', activo:true, avatar:'👑', tenant_id:tenant.id };
    Auth.licencia = { tipo:'demo', dias_restantes:30 };
    window._cachedTenantId = tenant.id;

    return { ok:true };
  }
};
