-- xG do FotMob (modelo próprio deles, não conferível em outra fonte).
-- Tabelas separadas para não misturar com o que vem da ESPN; recarregadas
-- inteiras por coleta/xg.py depois da carga principal.
create table xg_partida (
  partida_id  bigint primary key references partidas(id) on delete cascade,
  fotmob_id   text unique not null,
  xg_pro      numeric,
  xg_contra   numeric
);

-- Uma linha por jogador do Palmeiras que entrou em campo, segundo o FotMob.
-- xg NULL = o FotMob não trouxe o número (na prática, jogador sem finalização).
create table xg_participacao (
  partida_id         bigint not null references partidas(id) on delete cascade,
  jogador_id         bigint not null references jogadores(id),
  fotmob_jogador_id  text not null,
  minutos            int,
  xg                 numeric,
  xg_sem_penalti     numeric,
  xgot               numeric,
  xa                 numeric,
  primary key (partida_id, jogador_id)
);

alter table xg_partida enable row level security;
create policy leitura_publica on xg_partida for select to anon, authenticated using (true);
alter table xg_participacao enable row level security;
create policy leitura_publica on xg_participacao for select to anon, authenticated using (true);
