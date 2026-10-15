-- Planora Events — schéma initial (PostgreSQL / Supabase).
-- Stratégie de suppression : la suppression d'un projet supprime en cascade ses plans, révisions et exports ;
-- la suppression d'une organisation supprime tout son contenu. Les profils suivent auth.users.
-- Le document de plan est stocké en jsonb (validé côté client par Zod et côté base par une contrainte minimale) :
-- une sauvegarde est atomique et le versionnage se fait par instantané.


create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'editeur', 'lecteur')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null check (role in ('admin', 'editeur', 'lecteur')),
  token uuid not null unique default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index invitations_org_idx on public.invitations (org_id);

-- Abonnements : écriture réservée au serveur (clé service_role / webhooks du prestataire de paiement).
create table public.subscriptions (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  tier text not null check (tier in ('gratuit', 'pro', 'equipe', 'entreprise')),
  status text not null check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  client text not null default '',
  event_name text not null default '',
  event_type text not null default 'autre' check (event_type in ('banquet', 'conference', 'salon', 'concert', 'autre')),
  event_date date,
  guest_count integer check (guest_count is null or guest_count between 0 and 100000),
  notes text not null default '',
  favorite boolean not null default false,
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_org_updated_idx on public.projects (org_id, updated_at desc);

create table public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  document jsonb not null check (document ? 'schemaVersion' and document ? 'room' and jsonb_typeof(document -> 'objects') = 'array'),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index floor_plans_project_idx on public.floor_plans (project_id);

create table public.plan_revisions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.floor_plans (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  number integer not null check (number > 0),
  label text not null default '',
  document jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (plan_id, number)
);

create table public.object_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index object_templates_org_idx on public.object_templates (org_id);

create table public.room_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('salle', 'implantation')),
  document jsonb not null,
  created_at timestamptz not null default now()
);
create index room_templates_org_idx on public.room_templates (org_id);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  plan_id uuid references public.floor_plans (id) on delete set null,
  format text not null check (format in ('pdf', 'svg', 'png', 'csv')),
  variant text not null default '',
  revision integer not null,
  file_name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index exports_project_idx on public.exports (project_id, created_at desc);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger floor_plans_touch before update on public.floor_plans for each row execute function public.touch_updated_at();

-- Un plan appartient obligatoirement à l'organisation de son projet (empêche l'injection d'un org_id étranger).
create function public.plan_org_matches_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is distinct from (select org_id from public.projects where id = new.project_id) then
    raise exception 'org_id incohérent avec le projet';
  end if;
  return new;
end $$;
create trigger floor_plans_org_check before insert or update on public.floor_plans for each row execute function public.plan_org_matches_project();

-- Fonctions d'autorisation (security definer : évitent la récursion RLS sur organization_members).
create function public.has_org_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles)
  );
$$;
create function public.is_member(p_org uuid) returns boolean language sql stable as $$
  select public.has_org_role(p_org, array['admin', 'editeur', 'lecteur']);
$$;
create function public.can_edit(p_org uuid) returns boolean language sql stable as $$
  select public.has_org_role(p_org, array['admin', 'editeur']);
$$;

-- Création automatique du profil et d'un espace personnel à l'inscription.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  insert into public.organizations (name) values ('Espace de ' || coalesce(new.email, 'utilisateur')) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org, new.id, 'admin');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Acceptation d'une invitation : l'adresse du compte connecté doit correspondre à l'invitation.
create function public.accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where token = p_token and accepted_at is null;
  if v_inv.id is null then raise exception 'Invitation introuvable ou déjà utilisée'; end if;
  if lower(v_inv.email) <> lower((select email from public.profiles where id = auth.uid())) then
    raise exception 'Cette invitation est destinée à une autre adresse';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (v_inv.org_id, auth.uid(), v_inv.role)
    on conflict (org_id, user_id) do update set role = excluded.role;
  update public.invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.org_id;
end $$;

-- Row Level Security : toute lecture/écriture est filtrée par l'appartenance à l'organisation.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.projects enable row level security;
alter table public.floor_plans enable row level security;
alter table public.plan_revisions enable row level security;
alter table public.object_templates enable row level security;
alter table public.room_templates enable row level security;
alter table public.exports enable row level security;

create policy org_select on public.organizations for select using (public.is_member(id));
create policy org_update on public.organizations for update using (public.has_org_role(id, array['admin']));

create policy profile_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.organization_members a join public.organization_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profile_update on public.profiles for update using (id = auth.uid());

create policy members_select on public.organization_members for select using (public.is_member(org_id));
create policy members_admin_insert on public.organization_members for insert with check (public.has_org_role(org_id, array['admin']));
create policy members_admin_update on public.organization_members for update using (public.has_org_role(org_id, array['admin']));
create policy members_admin_delete on public.organization_members for delete using (public.has_org_role(org_id, array['admin']) and user_id <> auth.uid());

create policy invitations_admin on public.invitations for all
  using (public.has_org_role(org_id, array['admin'])) with check (public.has_org_role(org_id, array['admin']));

create policy subscriptions_select on public.subscriptions for select using (public.is_member(org_id));

create policy projects_select on public.projects for select using (public.is_member(org_id));
create policy projects_insert on public.projects for insert with check (public.can_edit(org_id));
create policy projects_update on public.projects for update using (public.can_edit(org_id)) with check (public.can_edit(org_id));
create policy projects_delete on public.projects for delete using (public.has_org_role(org_id, array['admin']));

create policy plans_select on public.floor_plans for select using (public.is_member(org_id));
create policy plans_insert on public.floor_plans for insert with check (public.can_edit(org_id));
create policy plans_update on public.floor_plans for update using (public.can_edit(org_id)) with check (public.can_edit(org_id));
create policy plans_delete on public.floor_plans for delete using (public.can_edit(org_id));

create policy revisions_select on public.plan_revisions for select using (public.is_member(org_id));
create policy revisions_insert on public.plan_revisions for insert with check (public.can_edit(org_id));

create policy otpl_select on public.object_templates for select using (public.is_member(org_id));
create policy otpl_write on public.object_templates for all using (public.can_edit(org_id)) with check (public.can_edit(org_id));
create policy rtpl_select on public.room_templates for select using (public.is_member(org_id));
create policy rtpl_write on public.room_templates for all using (public.can_edit(org_id)) with check (public.can_edit(org_id));

create policy exports_select on public.exports for select using (public.is_member(org_id));
create policy exports_insert on public.exports for insert with check (public.is_member(org_id));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
