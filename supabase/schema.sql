-- Yoshe con Hoyo — historias subidas desde la app (sin moderación: el sitio es
-- para compartir con un puñado de amigos). Correr una vez en el SQL Editor del
-- proyecto Supabase (https://qfpvnriocisneyvwlfiv.supabase.co).
--
-- Si algo indebido llega a entrar, se borra a mano desde el Table Editor /
-- Storage del dashboard — no hay cola de revisión ni UI de moderación.

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  season_id int not null,
  date_text text,
  title text not null,
  body_text text not null,
  content jsonb not null,                   -- segmentos {t:"text"|"char"|"place", ...} de autoTagText()
  place_id text,
  new_place jsonb,                           -- {id,name,icon} | null
  char_ids text[] not null default '{}',
  new_people jsonb not null default '[]',    -- [{id,name}]
  images text[] not null default '{}',       -- paths en el bucket "media"
  submitter_name text
);

alter table public.stories enable row level security;

create policy "lectura publica" on public.stories
  for select to anon, authenticated using (true);

create policy "subida publica" on public.stories
  for insert to anon, authenticated with check (true);

-- sin policy de update/delete para anon/authenticated: solo editable desde el dashboard.

insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;

create policy "subida publica de fotos" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'media');

create policy "lectura publica de fotos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');
