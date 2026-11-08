-- ════════════════════════════════════════════════════════════════════
--  Soyağacı — Supabase veritabanı şeması
--
--  NASIL ÇALIŞTIRILIR:
--   1. supabase.com → projeniz → sol menü "SQL Editor" → "New query"
--   2. Bu dosyanın TAMAMINI yapıştırın ve "Run" düğmesine basın.
--   3. Dosya tekrar tekrar çalıştırılabilir; mevcut verileri silmez.
--
--  Süper yönetici: sonft1249@gmail.com — bu e-posta ile ilk kez giriş
--  yapan hesap otomatik olarak yönetici ve aktif olur.
--  (Değiştirmek için aşağıdaki super_admin_email() fonksiyonunu düzenleyin.)
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────────────────── Tablolar ───────────────────────────

create table if not exists public.persons (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- parent  : from_id = ebeveyn, to_id = çocuk
-- partner : from_id = aId,     to_id = bId
create table if not exists public.relations (
  id      text primary key,
  kind    text not null check (kind in ('parent', 'partner')),
  from_id text not null references public.persons (id) on delete cascade,
  to_id   text not null references public.persons (id) on delete cascade,
  data    jsonb not null default '{}'::jsonb
);
create index if not exists relations_from_idx on public.relations (kind, from_id);
create index if not exists relations_to_idx on public.relations (kind, to_id);

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null default '',
  role       text not null default 'member' check (role in ('admin', 'editor', 'member', 'guest')),
  status     text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  person_id  text references public.persons (id) on delete set null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.grants (
  id         text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  scope      text not null check (scope in ('all', 'branch')),
  person_id  text references public.persons (id) on delete cascade,
  expires_at timestamptz,
  data       jsonb not null default '{}'::jsonb
);
create index if not exists grants_user_idx on public.grants (user_id);

create table if not exists public.access_requests (
  id      text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status  text not null default 'pending',
  data    jsonb not null default '{}'::jsonb
);

create table if not exists public.change_requests (
  id        text primary key,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  status    text not null default 'pending',
  person_id text,
  data      jsonb not null default '{}'::jsonb
);

create table if not exists public.audit (
  id         text primary key,
  user_id    text,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit (created_at desc);

create table if not exists public.invites (
  id      text primary key,
  code    text not null unique,
  used_by uuid references public.profiles (id) on delete set null,
  data    jsonb not null default '{}'::jsonb
);

create table if not exists public.notifications (
  id      text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read    boolean not null default false,
  data    jsonb not null default '{}'::jsonb
);
create index if not exists notifications_user_idx on public.notifications (user_id);

create table if not exists public.settings (
  id   text primary key default 'main',
  data jsonb not null default '{}'::jsonb
);

insert into public.settings (id, data)
values ('main', '{"familyName":"Ailemiz","allowSignup":true,"hideLivingDetails":true}'::jsonb)
on conflict (id) do nothing;

-- ─────────────────────── Yardımcı fonksiyonlar ───────────────────────

create or replace function public.super_admin_email() returns text
language sql immutable as $$ select 'sonft1249@gmail.com'::text $$;

-- Yalnızca e-postası DOĞRULANMIŞ hesap süper yönetici olur (sahte kayıtlara karşı).
create or replace function public.is_super_admin_uid(uid uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = uid and lower(coalesce(u.email, '')) = public.super_admin_email()
      and u.email_confirmed_at is not null)
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_super_admin_uid(auth.uid())
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.role = 'admin')
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.role in ('admin', 'editor'))
$$;

create or replace function public.my_person_id() returns text
language sql stable security definer set search_path = public as $$
  select p.person_id from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

-- Bir kişinin "doğrudan soyu": kendisi + tüm ataları + tüm torunları + bunların eşleri.
create or replace function public.direct_line(pid text) returns setof text
language sql stable security definer set search_path = public as $$
  with recursive
    anc(id) as (
      select pid
      union
      select r.from_id from public.relations r join anc on r.to_id = anc.id where r.kind = 'parent'
    ),
    des(id) as (
      select pid
      union
      select r.to_id from public.relations r join des on r.from_id = des.id where r.kind = 'parent'
    ),
    line(id) as (select id from anc union select id from des)
  select id from line
  union
  select case when r.from_id = l.id then r.to_id else r.from_id end
  from public.relations r
  join line l on r.kind = 'partner' and (r.from_id = l.id or r.to_id = l.id)
$$;

-- Dal izni: kişinin doğrudan soyu + ebeveynlerinin doğrudan soyu (kardeşlerin aileleri dahil).
create or replace function public.branch_ids(pid text) returns setof text
language sql stable security definer set search_path = public as $$
  select x from public.direct_line(pid) as x
  union
  select y
  from public.relations r, lateral public.direct_line(r.from_id) as y
  where r.kind = 'parent' and r.to_id = pid
$$;

-- Kullanıcı herkesi görebilir mi? (yönetici/editör veya "tüm ağaç" izni)
create or replace function public.can_see_all() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_manager()
      or (public.is_active() and exists (
            select 1 from public.grants g
            where g.user_id = auth.uid() and g.scope = 'all'
              and (g.expires_at is null or g.expires_at > now())))
$$;

-- Kullanıcının görebildiği kişi kimlikleri (herkesi göremiyorsa).
create or replace function public.visible_person_ids() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct v.id), '{}'::text[])
  from (
    select x as id
    from public.profiles p, lateral public.direct_line(p.person_id) as x
    where p.id = auth.uid() and p.person_id is not null and public.is_active()
    union
    select y as id
    from public.grants g, lateral public.branch_ids(g.person_id) as y
    where g.user_id = auth.uid() and g.scope = 'branch' and g.person_id is not null
      and (g.expires_at is null or g.expires_at > now()) and public.is_active()
  ) v
$$;

-- Yöneticilere bildirim gönder (yalnızca tetikleyiciler kullanır; istemciye kapalı).
create or replace function public._notify_managers(p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m record;
  nid text;
begin
  for m in
    select id from public.profiles
    where (status = 'active' and role in ('admin', 'editor')) or public.is_super_admin_uid(id)
  loop
    nid := 'n_' || gen_random_uuid()::text;
    insert into public.notifications (id, user_id, read, data)
    values (nid, m.id, false, jsonb_build_object(
      'id', nid, 'userId', m.id, 'title', p_title, 'body', p_body, 'link', p_link,
      'read', false, 'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  end loop;
end $$;

-- İstemcinin çağırdığı bildirim RPC'si: aktif kullanıcı, tüm aktif yönetici/editörlere bildirim bırakır.
-- Kötüye kullanıma karşı: aktif olmayanlar yok sayılır, metinler kısaltılır, dakikada en fazla 20 çağrı.
create or replace function public.notify_managers(p_title text, p_body text default null, p_link text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  m record;
  nid text;
  v_recent int;
begin
  if auth.uid() is null or not public.is_active() then
    return;
  end if;
  select count(*) into v_recent from public.notifications n
  where n.data ->> 'fromUserId' = auth.uid()::text
    and (n.data ->> 'createdAt')::timestamptz > now() - interval '1 minute';
  if v_recent >= 20 * greatest(1, (select count(*) from public.profiles where status = 'active' and role in ('admin', 'editor'))) then
    return;
  end if;
  for m in
    select id from public.profiles
    where ((status = 'active' and role in ('admin', 'editor')) or public.is_super_admin_uid(id))
      and id <> auth.uid()
  loop
    nid := 'n_' || gen_random_uuid()::text;
    insert into public.notifications (id, user_id, read, data)
    values (nid, m.id, false, jsonb_strip_nulls(jsonb_build_object(
      'id', nid, 'userId', m.id, 'title', left(coalesce(p_title, ''), 120), 'body', left(p_body, 500),
      'link', case when p_link like '/%' then left(p_link, 200) end, 'read', false, 'fromUserId', auth.uid(),
      'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))));
  end loop;
end $$;

-- ───────────────────────── Tetikleyiciler ─────────────────────────

-- Yeni kayıt olan her kullanıcı için profil oluştur.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  v_code text;
  v_role text := 'member';
  v_status text := 'pending';
  v_person text;
  v_name text;
  v_avatar text;
  v_provider text;
  v_now text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, ''), '@', 1));
  v_avatar := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
  v_provider := case when new.raw_app_meta_data ->> 'provider' = 'google' then 'google' else 'email' end;
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));

  if v_code <> '' then
    select * into inv from public.invites i
    where upper(i.code) = v_code and i.used_by is null
      and (i.data ->> 'expiresAt' is null or (i.data ->> 'expiresAt')::timestamptz > now())
    limit 1 for update;
    if found then
      v_role := coalesce(nullif(inv.data ->> 'role', ''), 'member');
      v_status := 'active';
      v_person := nullif(inv.data ->> 'personId', '');
    end if;
  end if;

  if lower(coalesce(new.email, '')) = public.super_admin_email() and new.email_confirmed_at is not null then
    v_role := 'admin';
    v_status := 'active';
  end if;

  if v_person is not null and not exists (select 1 from public.persons where id = v_person) then
    v_person := null;
  end if;

  perform set_config('soyagaci.trusted', 'on', true);  -- profiles_guard bu güvenli yolu kısıtlamaz
  insert into public.profiles (id, email, role, status, person_id, data)
  values (new.id, coalesce(new.email, ''), v_role, v_status, v_person, jsonb_strip_nulls(jsonb_build_object(
    'id', new.id, 'email', coalesce(new.email, ''), 'displayName', v_name, 'avatarUrl', v_avatar,
    'role', v_role, 'status', v_status, 'personId', v_person, 'provider', v_provider,
    'createdAt', v_now, 'consentAt', case when v_provider = 'email' then v_now end)))
  on conflict (id) do nothing;
  perform set_config('soyagaci.trusted', 'off', true);

  -- profiles kaydı oluştuktan sonra daveti "kullanıldı" olarak işaretle.
  if inv.id is not null then
    update public.invites
    set used_by = new.id, data = data || jsonb_build_object('usedBy', new.id, 'usedAt', v_now)
    where id = inv.id;
  end if;
  return new;
end $$;

-- E-posta sonradan doğrulanırsa (şifreli kayıt) süper yöneticiyi yükselt.
create or replace function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set email = coalesce(new.email, email) where id = new.id;  -- profiles_guard yükseltir
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profil güvenliği: rolü yalnızca yönetici değiştirir; editör yönetici olmayan diğer üyelerin durum/kişi
-- eşleşmesini değiştirebilir; redeem_invite güvenli yoldur;
-- süper yönetici her zaman yönetici ve aktif kalır. data jsonb kolonlarla senkron tutulur.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and coalesce(current_setting('soyagaci.trusted', true), 'off') <> 'on' then
    if tg_op = 'INSERT' then
      new.role := 'member';
      new.status := 'pending';
      new.person_id := null;
      new.email := coalesce(auth.jwt() ->> 'email', new.email);
    else
      -- Rolü ve e-postayı yalnızca yönetici değiştirir.
      new.role := old.role;
      new.email := old.email;
      -- Editör, yönetici olmayan BAŞKA bir üyenin durumunu (onay/engel) ve kişi eşleşmesini değiştirebilir.
      if not (public.is_manager() and old.role <> 'admin' and old.id <> auth.uid()) then
        new.status := old.status;
        new.person_id := old.person_id;
      end if;
    end if;
  end if;
  if public.is_super_admin_uid(new.id) then
    new.role := 'admin';
    new.status := 'active';
  end if;
  new.data := coalesce(new.data, '{}'::jsonb) - 'role' - 'status' - 'personId' - 'email' - 'id'
    || jsonb_strip_nulls(jsonb_build_object('id', new.id, 'email', new.email, 'role', new.role,
                                            'status', new.status, 'personId', new.person_id));
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- Yeni üye kaydı ve kimlik eşleştirme talepleri için yöneticilere bildirim.
create or replace function public.profiles_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public._notify_managers('Yeni üye kaydı',
      coalesce(new.data ->> 'displayName', new.email) || ' (' || new.email || ') onay bekliyor.', '/admin/kullanicilar');
  elsif tg_op = 'UPDATE' then
    if (new.data ->> 'claimedPersonId') is not distinct from (old.data ->> 'claimedPersonId')
       and (new.data ->> 'claimNote') is not distinct from (old.data ->> 'claimNote') then
      return new;
    end if;
    perform public._notify_managers('Kimlik eşleştirme talebi',
      coalesce(new.data ->> 'displayName', new.email) || ': ' ||
      coalesce((select trim(coalesce(p.data ->> 'firstName', '') || ' ' || coalesce(p.data ->> 'lastName', ''))
                from public.persons p where p.id = new.data ->> 'claimedPersonId'),
               new.data ->> 'claimNote', ''),
      '/admin/kullanicilar');
  end if;
  return new;
end $$;

drop trigger if exists profiles_notify on public.profiles;
create trigger profiles_notify
  after insert or update on public.profiles
  for each row execute function public.profiles_notify();

-- Değişiklik/erişim talepleri için bildirimi uygulama notify_managers() RPC'si ile gönderir
-- (eski kurulumlardaki tetikleyicileri temizle, çift bildirim olmasın).
drop trigger if exists change_requests_notify on public.change_requests;
drop trigger if exists access_requests_notify on public.access_requests;
drop function if exists public.requests_notify();

-- ───────────────────────────── RPC ─────────────────────────────

-- Davet kodu geçerli mi? (kayıt formunda önceden kontrol için)
create or replace function public.check_invite(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invites i
    where upper(i.code) = upper(trim(p_code)) and i.used_by is null
      and (i.data ->> 'expiresAt' is null or (i.data ->> 'expiresAt')::timestamptz > now()))
$$;

-- Google ile giriş yapmış, onay bekleyen kullanıcı davet koduyla hesabını etkinleştirir.
create or replace function public.redeem_invite(p_code text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  prof public.profiles;
  v_person text;
  v_role text;
  v_now text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null then
    raise exception 'Önce giriş yapmalısınız.';
  end if;
  select * into prof from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profil bulunamadı.';
  end if;
  if prof.status = 'blocked' then
    raise exception 'Bu hesap engellenmiş.';
  end if;
  if prof.status = 'active' then
    return prof;
  end if;

  select * into inv from public.invites i
  where upper(i.code) = upper(trim(p_code)) and i.used_by is null
    and (i.data ->> 'expiresAt' is null or (i.data ->> 'expiresAt')::timestamptz > now())
  limit 1 for update;
  if not found then
    raise exception 'Davet kodu geçersiz, süresi dolmuş veya kullanılmış.';
  end if;

  v_role := coalesce(nullif(inv.data ->> 'role', ''), 'member');
  v_person := nullif(inv.data ->> 'personId', '');
  if v_person is not null and not exists (select 1 from public.persons where id = v_person) then
    v_person := null;
  end if;

  -- Güvenli kod yolu: profiles_guard'ın rol/durum kısıtlamasını bu güncelleme için kapat.
  perform set_config('soyagaci.trusted', 'on', true);
  update public.profiles
  set role = v_role, status = 'active', person_id = coalesce(v_person, person_id)
  where id = auth.uid()
  returning * into prof;
  perform set_config('soyagaci.trusted', 'off', true);

  update public.invites
  set used_by = auth.uid(), data = data || jsonb_build_object('usedBy', auth.uid(), 'usedAt', v_now)
  where id = inv.id;

  return prof;
end $$;



-- Onay bekleyen kullanıcının "ben buyum" seçimi için sınırlı arama (en az 3 harf, en fazla 10 sonuç).
create or replace function public.search_claim_candidates(q text)
returns table (id text, first_name text, last_name text, maiden_name text, birth_year text)
language sql stable security definer set search_path = public as $$
  select p.id, p.data ->> 'firstName', p.data ->> 'lastName', p.data ->> 'maidenName',
         left(coalesce(p.data ->> 'birthDate', ''), 4)
  from public.persons p
  where auth.uid() is not null
    and length(trim(coalesce(q, ''))) >= 3
    and coalesce((p.data ->> 'isDeceased')::boolean, false) = false
    and (lower(coalesce(p.data ->> 'firstName', '') || ' ' || coalesce(p.data ->> 'lastName', '') || ' ' ||
               coalesce(p.data ->> 'maidenName', '')) like '%' || lower(trim(q)) || '%')
  order by p.data ->> 'firstName'
  limit 10
$$;

-- ───────────────────────── Satır güvenliği (RLS) ─────────────────────────

alter table public.persons          enable row level security;
alter table public.relations        enable row level security;
alter table public.profiles         enable row level security;
alter table public.grants           enable row level security;
alter table public.access_requests  enable row level security;
alter table public.change_requests  enable row level security;
alter table public.audit            enable row level security;
alter table public.invites          enable row level security;
alter table public.notifications    enable row level security;
alter table public.settings         enable row level security;

-- persons
drop policy if exists persons_select on public.persons;
create policy persons_select on public.persons for select to authenticated
  using ((select public.can_see_all()) or id = any ((select public.visible_person_ids())::text[]));
drop policy if exists persons_insert on public.persons;
create policy persons_insert on public.persons for insert to authenticated
  with check ((select public.is_manager()));
drop policy if exists persons_update on public.persons;
create policy persons_update on public.persons for update to authenticated
  using ((select public.is_manager())
         or (id = (select public.my_person_id()) and (select public.is_active()) and (select public.my_role()) <> 'guest'))
  with check ((select public.is_manager())
         or (id = (select public.my_person_id()) and (select public.is_active()) and (select public.my_role()) <> 'guest'));
drop policy if exists persons_delete on public.persons;
create policy persons_delete on public.persons for delete to authenticated
  using ((select public.is_manager()));

-- relations
drop policy if exists relations_select on public.relations;
create policy relations_select on public.relations for select to authenticated
  using ((select public.can_see_all())
         or (from_id = any ((select public.visible_person_ids())::text[]) and to_id = any ((select public.visible_person_ids())::text[])));
drop policy if exists relations_write on public.relations;
create policy relations_write on public.relations for all to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_manager()));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()) or ((select public.is_manager()) and role <> 'admin'))
  with check (id = (select auth.uid()) or (select public.is_admin()) or ((select public.is_manager()) and role <> 'admin'));
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using ((select public.is_admin()) and lower(email) <> public.super_admin_email());

-- grants
drop policy if exists grants_select on public.grants;
create policy grants_select on public.grants for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_manager()));
drop policy if exists grants_write on public.grants;
create policy grants_write on public.grants for all to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

-- access_requests
drop policy if exists access_requests_select on public.access_requests;
create policy access_requests_select on public.access_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_manager()));
drop policy if exists access_requests_insert on public.access_requests;
create policy access_requests_insert on public.access_requests for insert to authenticated
  with check ((user_id = (select auth.uid()) and (select public.is_active())) or (select public.is_manager()));
drop policy if exists access_requests_update on public.access_requests;
create policy access_requests_update on public.access_requests for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
drop policy if exists access_requests_delete on public.access_requests;
create policy access_requests_delete on public.access_requests for delete to authenticated
  using ((user_id = (select auth.uid()) and status = 'pending') or (select public.is_manager()));

-- change_requests
drop policy if exists change_requests_select on public.change_requests;
create policy change_requests_select on public.change_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_manager()));
drop policy if exists change_requests_insert on public.change_requests;
create policy change_requests_insert on public.change_requests for insert to authenticated
  with check ((user_id = (select auth.uid()) and (select public.is_active())) or (select public.is_manager()));
drop policy if exists change_requests_update on public.change_requests;
create policy change_requests_update on public.change_requests for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
drop policy if exists change_requests_delete on public.change_requests;
create policy change_requests_delete on public.change_requests for delete to authenticated
  using ((user_id = (select auth.uid()) and status = 'pending') or (select public.is_manager()));

-- audit
drop policy if exists audit_select on public.audit;
create policy audit_select on public.audit for select to authenticated
  using ((select public.is_manager()));
drop policy if exists audit_insert on public.audit;
create policy audit_insert on public.audit for insert to authenticated
  with check ((select public.is_active()) and user_id = (select auth.uid())::text);

-- invites
drop policy if exists invites_all on public.invites;
create policy invites_all on public.invites for all to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

-- notifications
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check ((select public.is_active()) or user_id = (select auth.uid()));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_manager()));

-- settings (aile adı giriş/bekleme ekranında da görünsün diye tüm girişli kullanıcılar okuyabilir)
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to authenticated using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Tablo yetkileri (RLS satırları ayrıca süzer)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant execute on function public.check_invite(text) to anon, authenticated;
grant execute on function public.notify_managers(text, text, text) to authenticated;
-- Yalnızca diğer güvenli fonksiyonların içinden çağrılan yardımcılar istemciye kapalı.
revoke execute on function public._notify_managers(text, text, text) from public, anon, authenticated;
revoke execute on function public.direct_line(text) from public, anon, authenticated;
revoke execute on function public.branch_ids(text) from public, anon, authenticated;
revoke execute on function public.is_super_admin_uid(uuid) from public, anon, authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.search_claim_candidates(text) to authenticated;

-- ───────────────────────── Fotoğraf deposu ─────────────────────────

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists soyagaci_photos_read on storage.objects;
create policy soyagaci_photos_read on storage.objects for select
  using (bucket_id = 'photos');
drop policy if exists soyagaci_photos_insert on storage.objects;
create policy soyagaci_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (select public.is_active()) and (storage.foldername(name))[1] = 'persons');
drop policy if exists soyagaci_photos_update on storage.objects;
create policy soyagaci_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (select public.is_manager()));
drop policy if exists soyagaci_photos_delete on storage.objects;
create policy soyagaci_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (select public.is_manager()));

-- ─────────────── Şema öncesi kayıt olmuş kullanıcılar için profil ───────────────

insert into public.profiles (id, email, role, status, data)
select u.id, coalesce(u.email, ''),
       'member', 'pending',  -- profiles_guard doğrulanmış süper yöneticiyi otomatik yükseltir
       jsonb_strip_nulls(jsonb_build_object(
         'displayName', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name',
                                 split_part(coalesce(u.email, ''), '@', 1)),
         'avatarUrl', u.raw_user_meta_data ->> 'avatar_url',
         'createdAt', to_char(u.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
