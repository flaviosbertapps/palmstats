-- Finalizações do FotMob (mapa de chutes), para calcular o xG do time no
-- trecho em que cada jogador ou dupla estava em campo.
create table xg_finalizacao (
  id            bigint generated always as identity primary key,
  partida_id    bigint not null references partidas(id) on delete cascade,
  fotmob_id     text unique not null,
  do_palmeiras  boolean not null,
  jogador_id    bigint references jogadores(id),   -- só jogadores do Palmeiras casados
  minuto        int not null,                      -- minuto do relógio (45 ou 90 nos acréscimos)
  acrescimo     int,
  xg            numeric,
  xgot          numeric,
  situacao      text,                              -- RegularPlay, SetPiece, Penalty, FastBreak...
  gol           boolean not null,
  gol_contra    boolean not null
);
create index on xg_finalizacao (partida_id);

-- Função do titular naquele jogo pela grade de posições do FotMob
-- (gol, zag, lat, vol, meia, ponta, ata); NULL para quem entrou do banco.
-- Números defensivos e de passe do FotMob; NULL quando a fonte não traz.
alter table xg_participacao
  add column funcao              text,
  add column desarmes            int,
  add column interceptacoes      int,
  add column recuperacoes        int,
  add column duelos_ganhos       int,
  add column duelos_perdidos     int,
  add column passes_certos       int,
  add column passes              int,
  add column chances_criadas     int,
  add column passes_terco_final  int;

alter table xg_finalizacao enable row level security;
create policy leitura_publica on xg_finalizacao for select to anon, authenticated using (true);
