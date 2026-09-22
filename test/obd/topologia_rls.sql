-- Prueba transaccional: usa unidades existentes y revierte todos los cambios.
begin;
do $$
declare u record; v record; otro_tenant uuid; otro_cliente uuid;
begin
  select usuarios.id, usuarios.tenant_id, vehiculos.id as vehiculo_id into u
  from public.usuarios join public.vehiculos using (tenant_id)
  where usuarios.rol <> 'superadmin'
    and not exists (select 1 from public.obd_topologias t where t.vehiculo_id=vehiculos.id)
  limit 1;
  if u.id is null then raise exception 'Falta unidad de prueba disponible'; end if;
  select id,tenant_id into v from public.vehiculos where tenant_id<>u.tenant_id limit 1;
  if v.id is null then
    select id into otro_tenant from public.tenants where id<>u.tenant_id limit 1;
    if otro_tenant is null then raise exception 'Falta segundo taller'; end if;
    insert into public.clientes(tenant_id,nombre) values(otro_tenant,'PRUEBA RLS TRANSACCIONAL') returning id into otro_cliente;
    insert into public.vehiculos(tenant_id,cliente_id,placa,marca,modelo)
      values(otro_tenant,otro_cliente,'RLS-'||substr(gen_random_uuid()::text,1,8),'Prueba','Rollback') returning id,tenant_id into v;
  end if;
  perform set_config('request.jwt.claim.sub',u.id::text,true);
  perform set_config('nexus.test_vehicle',u.vehiculo_id::text,true);
  perform set_config('nexus.other_vehicle',v.id::text,true);
  perform set_config('nexus.other_tenant',v.tenant_id::text,true);
  insert into public.obd_topologias(tenant_id,vehiculo_id,categoria)
    values(v.tenant_id,v.id,'pesado') on conflict(tenant_id,vehiculo_id) do nothing;
end $$;
set local role authenticated;
do $$
declare id_mapa uuid; n integer; rechazado boolean;
begin
  insert into public.obd_topologias(tenant_id,vehiculo_id,categoria)
    values(public.current_tenant_id(),current_setting('nexus.test_vehicle')::uuid,'moto') returning id into id_mapa;
  select count(*) into n from public.obd_topologias where id=id_mapa;
  if n<>1 then raise exception 'No puede leer mapa propio'; end if;
  update public.obd_topologias set revision=2 where id=id_mapa and revision=1;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'No puede editar mapa propio'; end if;
  update public.obd_topologias set revision=3 where id=id_mapa and revision=1;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Sobrescritura de revisión anterior'; end if;
  select count(*) into n from public.obd_topologias where tenant_id=current_setting('nexus.other_tenant')::uuid;
  if n<>0 then raise exception 'Fuga de mapas entre talleres'; end if;
  rechazado=false;
  begin
    insert into public.obd_topologias(tenant_id,vehiculo_id,categoria)
      values(public.current_tenant_id(),current_setting('nexus.other_vehicle')::uuid,'moto');
  exception when insufficient_privilege then rechazado=true;
  end;
  if not rechazado then raise exception 'Acepta vehículo de otro taller'; end if;
  update public.obd_topologias set revision=revision+1 where tenant_id=current_setting('nexus.other_tenant')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Permite editar mapas ajenos'; end if;
  delete from public.obd_topologias where tenant_id=current_setting('nexus.other_tenant')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Permite eliminar mapas ajenos'; end if;
  delete from public.obd_topologias where id=id_mapa and revision=2;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'No puede eliminar mapa propio'; end if;
end $$;
reset role;
select 'PASS: CRUD, revision y aislamiento entre talleres' as resultado;
rollback;
