
create or replace function public.is_family_member_text(_family text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from family_members where family_id::text=_family and user_id=auth.uid())
$$;
create or replace function public.shares_family_text(_user text) returns boolean
language sql stable security definer set search_path = public as $$
  select _user = auth.uid()::text or exists(
    select 1 from family_members a join family_members b on a.family_id=b.family_id
    where a.user_id=auth.uid() and b.user_id::text=_user)
$$;
grant execute on function public.is_family_member_text, public.shares_family_text to authenticated;

create policy "media read family" on storage.objects for select to authenticated
  using (bucket_id='family-media' and public.is_family_member_text((storage.foldername(name))[1]));
create policy "media upload own" on storage.objects for insert to authenticated
  with check (bucket_id='family-media'
    and public.is_family_member_text((storage.foldername(name))[1])
    and (storage.foldername(name))[2] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','gif','heic','heif','mp4','webm','mov'));
create policy "media delete own" on storage.objects for delete to authenticated
  using (bucket_id='family-media' and (storage.foldername(name))[2] = auth.uid()::text);

create policy "avatars read family" on storage.objects for select to authenticated
  using (bucket_id='avatars' and public.shares_family_text((storage.foldername(name))[1]));
create policy "avatars upload own" on storage.objects for insert to authenticated
  with check (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg','jpeg','png','webp'));
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
