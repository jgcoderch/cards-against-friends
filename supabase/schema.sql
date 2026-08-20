-- Rode isso no SQL Editor do seu projeto Supabase (Database > SQL Editor).
-- Cria a tabela usada pelo Hall da Fama (placar histórico entre partidas).

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  deck_id text not null,
  players jsonb not null, -- [{ playerId, name, score }]
  winner_player_id text,  -- null quando a partida termina empatada
  is_tie boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists matches_created_at_idx on matches (created_at);

-- RLS ligado e sem policies: só o backend acessa essa tabela, usando a
-- service role key (que ignora RLS). Isso evita que a anon key consiga
-- ler/escrever aqui por engano caso vaze pro cliente algum dia.
alter table matches enable row level security;
