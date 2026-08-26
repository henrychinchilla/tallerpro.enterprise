-- Endurece el catálogo ya aplicado: técnicos leen/ejecutan; solo administración publica definiciones.
drop policy if exists obd_oem_def_tenant on public.obd_oem_definiciones;
drop policy if exists obd_oem_def_lectura on public.obd_oem_definiciones;
drop policy if exists obd_oem_def_escritura on public.obd_oem_definiciones;
create policy obd_oem_def_lectura on public.obd_oem_definiciones for select to authenticated
 using (tenant_id=current_tenant_id() or is_superadmin());
create policy obd_oem_def_escritura on public.obd_oem_definiciones for all to authenticated
 using ((tenant_id=current_tenant_id() and exists(select 1 from public.usuarios u where u.id=auth.uid() and u.rol in ('admin','gerente_tal'))) or is_superadmin())
 with check ((tenant_id=current_tenant_id() and exists(select 1 from public.usuarios u where u.id=auth.uid() and u.rol in ('admin','gerente_tal'))) or is_superadmin());
