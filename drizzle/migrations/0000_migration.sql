
create type public.family_role as enum ('owner','admin','member');
create type public.request_status as enum ('pending','approved','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Родственник',
  avatar_path text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null,
  created_at timestamptz not null default now()
);
grant select, update on public.families to authenticated;
grant all on public.families to service_role;
alter table public.families enable row level security;

create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.family_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id),
  unique (user_id)
);
grant select on public.family_members to authenticated;
grant all on public.family_members to service_role;
alter table public.family_members enable row level security;

create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  code text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz
);
grant select on public.family_invites to authenticated;
grant all on public.family_invites to service_role;
alter table public.family_invites enable row level security;

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invite_id uuid references public.family_invites(id) on delete set null,
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (family_id, user_id)
);
grant select on public.join_requests to authenticated;
grant all on public.join_requests to service_role;
alter table public.join_requests enable row level security;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text check (body is null or char_length(body) <= 4000),
  reply_to_id uuid references public.messages(id) on delete set null,
  media_path text,
  media_type text check (media_type is null or media_type in ('image','video')),
  media_mime text,
  media_size bigint check (media_size is null or media_size <= 52428800),
  created_at timestamptz not null default now(),
  check (coalesce(char_length(body),0) > 0 or media_path is not null)
);
create index messages_family_created on public.messages(family_id, created_at desc);
grant select, insert, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','👍','😂','😮','😢','🙏')),
  family_id uuid not null references public.families(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
grant select, insert, delete on public.message_reactions to authenticated;
grant all on public.message_reactions to service_role;
alter table public.message_reactions enable row level security;

-- helpers
create or replace function public.is_family_member(_family uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from family_members where family_id=_family and user_id=auth.uid())
$$;
create or replace function public.is_family_admin(_family uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from family_members where family_id=_family and user_id=auth.uid() and role in ('owner','admin'))
$$;
create or replace function public.shares_family(_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _user = auth.uid() or exists(
    select 1 from family_members a join family_members b on a.family_id=b.family_id
    where a.user_id=auth.uid() and b.user_id=_user)
$$;
create or replace function public.is_admin_for_requester(_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from join_requests r where r.user_id=_user and r.status='pending' and public.is_family_admin(r.family_id))
$$;

-- policies
create policy "profiles read family" on public.profiles for select to authenticated
  using (public.shares_family(id) or public.is_admin_for_requester(id));
create policy "profiles insert self" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "families read members" on public.families for select to authenticated using (public.is_family_member(id));
create policy "families update admins" on public.families for update to authenticated using (public.is_family_admin(id)) with check (public.is_family_admin(id));

create policy "members read" on public.family_members for select to authenticated using (public.is_family_member(family_id));
create policy "invites read admins" on public.family_invites for select to authenticated using (public.is_family_admin(family_id));
create policy "requests read" on public.join_requests for select to authenticated using (user_id = auth.uid() or public.is_family_admin(family_id));

create policy "messages read" on public.messages for select to authenticated using (public.is_family_member(family_id));
create policy "messages insert" on public.messages for insert to authenticated with check (
  user_id = auth.uid() and public.is_family_member(family_id)
  and (media_path is null or media_path like family_id::text || '/' || auth.uid()::text || '/%')
  and (reply_to_id is null or exists(select 1 from public.messages m where m.id = reply_to_id and m.family_id = messages.family_id))
);
create policy "messages delete" on public.messages for delete to authenticated using (user_id = auth.uid() or public.is_family_admin(family_id));

create policy "reactions read" on public.message_reactions for select to authenticated using (public.is_family_member(family_id));
create policy "reactions insert" on public.message_reactions for insert to authenticated with check (
  user_id = auth.uid() and public.is_family_member(family_id)
  and exists(select 1 from public.messages m where m.id = message_id and m.family_id = message_reactions.family_id));
create policy "reactions delete" on public.message_reactions for delete to authenticated using (user_id = auth.uid());

-- media mime validation
create or replace function public.validate_message_media() returns trigger language plpgsql set search_path = public as $$
begin
  if new.media_path is not null then
    if new.media_type = 'image' and new.media_mime not in ('image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif') then
      raise exception 'Недопустимый тип изображения';
    elsif new.media_type = 'video' and new.media_mime not in ('video/mp4','video/webm','video/quicktime') then
      raise exception 'Недопустимый тип видео';
    elsif new.media_type is null then
      raise exception 'Не указан тип файла';
    end if;
  end if;
  return new;
end $$;
create trigger messages_validate_media before insert on public.messages for each row execute function public.validate_message_media();

-- signup profile
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''), nullif(trim(new.raw_user_meta_data->>'full_name'),''), split_part(new.email,'@',1), 'Родственник'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RPCs
create or replace function public.create_family(_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'Требуется вход'; end if;
  if exists(select 1 from family_members where user_id=auth.uid()) then raise exception 'Вы уже состоите в семье'; end if;
  if char_length(trim(_name)) < 1 then raise exception 'Введите название'; end if;
  insert into families(name, owner_id) values (trim(_name), auth.uid()) returning id into fid;
  insert into family_members(family_id,user_id,role) values (fid, auth.uid(), 'owner');
  delete from join_requests where user_id = auth.uid() and status='pending';
  return fid;
end $$;

create or replace function public.create_invite(_family uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_family_admin(_family) then raise exception 'Недостаточно прав'; end if;
  c := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into family_invites(family_id, code, created_by) values (_family, c, auth.uid());
  return c;
end $$;

create or replace function public.revoke_invite(_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update family_invites set revoked_at = now()
  where id=_invite and public.is_family_admin(family_id) and revoked_at is null;
  if not found then raise exception 'Приглашение не найдено'; end if;
end $$;

create or replace function public.preview_invite(_code text) returns table(family_name text, member_count int, valid boolean)
language sql stable security definer set search_path = public as $$
  select f.name, (select count(*)::int from family_members m where m.family_id=f.id),
    (i.revoked_at is null and i.expires_at > now())
  from family_invites i join families f on f.id=i.family_id
  where i.code = upper(trim(_code))
$$;

create or replace function public.request_join(_code text) returns text
language plpgsql security definer set search_path = public as $$
declare inv family_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Требуется вход'; end if;
  select * into inv from family_invites where code = upper(trim(_code));
  if not found or inv.revoked_at is not null or inv.expires_at <= now() then raise exception 'Приглашение недействительно'; end if;
  if exists(select 1 from family_members where user_id=auth.uid()) then raise exception 'Вы уже состоите в семье'; end if;
  insert into join_requests(family_id,user_id,invite_id,status) values (inv.family_id, auth.uid(), inv.id, 'pending')
  on conflict (family_id,user_id) do update set status='pending', invite_id=excluded.invite_id, created_at=now(), reviewed_at=null;
  return 'pending';
end $$;

create or replace function public.cancel_join_request(_request uuid) returns void
language sql security definer set search_path = public as $$
  delete from join_requests where id=_request and user_id=auth.uid() and status='pending'
$$;

create or replace function public.review_request(_request uuid, _approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r join_requests%rowtype;
begin
  select * into r from join_requests where id=_request and status='pending';
  if not found or not public.is_family_admin(r.family_id) then raise exception 'Заявка не найдена'; end if;
  if _approve then
    if exists(select 1 from family_members where user_id=r.user_id) then
      update join_requests set status='rejected', reviewed_at=now() where id=_request;
      raise exception 'Пользователь уже состоит в другой семье';
    end if;
    insert into family_members(family_id,user_id,role) values (r.family_id, r.user_id, 'member');
    update join_requests set status='approved', reviewed_at=now() where id=_request;
    delete from join_requests where user_id=r.user_id and id<>_request and status='pending';
  else
    update join_requests set status='rejected', reviewed_at=now() where id=_request;
  end if;
end $$;

create or replace function public.set_member_role(_family uuid, _user uuid, _role public.family_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from family_members where family_id=_family and user_id=auth.uid() and role='owner') then raise exception 'Только владелец может менять роли'; end if;
  if _role = 'owner' or _user = auth.uid() then raise exception 'Недопустимое действие'; end if;
  update family_members set role=_role where family_id=_family and user_id=_user;
end $$;

create or replace function public.remove_member(_family uuid, _user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare my_role family_role; their_role family_role;
begin
  select role into my_role from family_members where family_id=_family and user_id=auth.uid();
  select role into their_role from family_members where family_id=_family and user_id=_user;
  if their_role is null then raise exception 'Участник не найден'; end if;
  if _user = auth.uid() then
    if my_role='owner' then raise exception 'Владелец не может покинуть семью'; end if;
  elsif my_role='owner' or (my_role='admin' and their_role='member') then null;
  else raise exception 'Недостаточно прав'; end if;
  delete from family_members where family_id=_family and user_id=_user;
  delete from join_requests where family_id=_family and user_id=_user;
end $$;

revoke execute on function public.create_family, public.create_invite, public.revoke_invite, public.preview_invite, public.request_join, public.cancel_join_request, public.review_request, public.set_member_role, public.remove_member from anon, public;
grant execute on function public.create_family, public.create_invite, public.revoke_invite, public.preview_invite, public.request_join, public.cancel_join_request, public.review_request, public.set_member_role, public.remove_member, public.is_family_member, public.is_family_admin, public.shares_family, public.is_admin_for_requester to authenticated;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.join_requests;
