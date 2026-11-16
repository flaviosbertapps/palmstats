-- PalmStats — schema inicial
-- Princípios:
--   * IDs próprios; o ID da fonte fica em coluna separada (espn_id, wikidata_id).
--   * NULL significa "sem dado na fonte", nunca zero.
--   * Tudo é leitura pública; escrita só pelo processo de carga (service role / conexão direta).

create table competicoes (
  id    text primary key,          -- slug da ESPN: bra.1, conmebol.libertadores...
  nome  text not null
);

create table clubes (
  id          bigint generated always as identity primary key,
  espn_id     text unique not null,
  nome        text not null,
  abreviacao  text,
  escudo_url  text
);

create table estadios (
  id       bigint generated always as identity primary key,
  espn_id  text unique not null,
  nome     text not null,
  cidade   text,
  pais     text
);

create table tecnicos (
  id           bigint generated always as identity primary key,
  nome         text unique not null,
  wikidata_id  text
);

-- Passagens do técnico efetivo (contratado ou interino oficial).
-- Auxiliar que comanda por suspensão do titular NÃO entra aqui.
create table passagens_tecnico (
  id          bigint generated always as identity primary key,
  tecnico_id  bigint not null references tecnicos(id),
  inicio      date not null,
  fim         date,                       -- null = atual
  interino    boolean not null default false,
  conferido   boolean not null default false,  -- datas confirmadas em fonte
  fonte       text,
  unique (tecnico_id, inicio)
);

create table jogadores (
  id             bigint generated always as identity primary key,
  espn_id        text unique not null,
  nome           text not null,           -- nome de exibição
  nome_completo  text,
  nascimento     date,
  nacionalidade  text,
  posicao        text,
  wikidata_id    text unique
);

create table partidas (
  id                bigint generated always as identity primary key,
  espn_id           text unique not null,
  data              timestamptz not null,
  temporada         int not null,
  competicao_id     text not null references competicoes(id),
  fase              text,                  -- texto da fonte (ex.: "Copa Do Brasil, Third Round")
  mando             text not null check (mando in ('casa', 'fora', 'neutro')),
  adversario_id     bigint not null references clubes(id),
  gols_pro          int,
  gols_contra       int,
  penaltis_pro      int,                   -- disputa de pênaltis, quando houver
  penaltis_contra   int,
  prorrogacao       boolean not null default false,
  estadio_id        bigint references estadios(id),
  publico           int,
  arbitro           text,
  tecnico_id        bigint references tecnicos(id),   -- derivado de passagens_tecnico
  encerrada         boolean not null default true,
  resultado         text generated always as (
                      case when gols_pro > gols_contra then 'V'
                           when gols_pro < gols_contra then 'D'
                           when gols_pro = gols_contra then 'E' end) stored
);
create index on partidas (temporada);
create index on partidas (competicao_id);
create index on partidas (adversario_id);
create index on partidas (data);

-- Jogador do Palmeiras × partida. Estatísticas NULL quando a fonte não traz.
create table participacoes (
  partida_id             bigint not null references partidas(id) on delete cascade,
  jogador_id             bigint not null references jogadores(id),
  titular                boolean not null,
  camisa                 int,
  posicao                text,
  minuto_entrada         int,             -- null = não entrou
  minuto_saida           int,
  minutos                int,             -- regulamentares (sem acréscimos)
  gols                   int,
  assistencias           int,
  finalizacoes           int,
  finalizacoes_no_alvo   int,
  faltas_cometidas       int,
  faltas_sofridas        int,
  impedimentos           int,
  amarelos               int,
  vermelhos              int,
  gols_contra            int,
  defesas                int,
  gols_sofridos          int,
  primary key (partida_id, jogador_id)
);
create index on participacoes (jogador_id);

-- Eventos dos dois times. Jogador do adversário fica só pelo nome.
create table eventos (
  id               bigint generated always as identity primary key,
  partida_id       bigint not null references partidas(id) on delete cascade,
  espn_id          text unique not null,
  tipo             text not null,   -- gol, gol_contra, penalti_convertido, penalti_perdido, amarelo, vermelho, substituicao, var...
  tipo_fonte       text not null,   -- texto original da ESPN
  periodo          int,
  minuto           int,
  acrescimo        int,
  do_palmeiras     boolean not null,  -- evento a favor do Palmeiras (gol contra conta para quem se beneficiou)
  jogador_id       bigint references jogadores(id),
  jogador_nome     text,
  jogador2_id      bigint references jogadores(id),  -- assistência / quem saiu na substituição
  jogador2_nome    text,
  disputa_penaltis boolean not null default false,
  pos_x            numeric,          -- posição do chute (0–1), quando houver
  pos_y            numeric,
  descricao        text
);
create index on eventos (partida_id);
create index on eventos (jogador_id);

create table estatisticas_time (
  partida_id               bigint not null references partidas(id) on delete cascade,
  lado                     text not null check (lado in ('pro', 'contra')),
  posse                    numeric,
  finalizacoes             int,
  finalizacoes_no_alvo     int,
  finalizacoes_bloqueadas  int,
  passes                   int,
  passes_certos            int,
  cruzamentos              int,
  cruzamentos_certos       int,
  bolas_longas             int,
  bolas_longas_certas      int,
  desarmes                 int,
  desarmes_certos          int,
  interceptacoes           int,
  cortes                   int,
  escanteios               int,
  faltas                   int,
  impedimentos             int,
  amarelos                 int,
  vermelhos                int,
  defesas                  int,
  primary key (partida_id, lado)
);

-- Fila de revisão manual: o que a carga não conseguiu validar.
create table revisao (
  id         bigint generated always as identity primary key,
  entidade   text not null,   -- partida, jogador, tecnico
  chave      text not null,   -- espn_id ou similar
  motivo     text not null,
  detalhe    jsonb,
  criado_em  timestamptz not null default now(),
  resolvido  boolean not null default false,
  unique (entidade, chave, motivo)
);

-- Visões de consulta ---------------------------------------------------------

create view v_partidas with (security_invoker = true) as
select p.id, p.espn_id, p.data, p.temporada, p.competicao_id, c.nome as competicao,
       p.fase, p.mando, a.nome as adversario, p.gols_pro, p.gols_contra,
       p.penaltis_pro, p.penaltis_contra, p.resultado, e.nome as estadio,
       p.publico, p.arbitro, t.nome as tecnico
from partidas p
join competicoes c on c.id = p.competicao_id
join clubes a on a.id = p.adversario_id
left join estadios e on e.id = p.estadio_id
left join tecnicos t on t.id = p.tecnico_id;

create view v_jogador_temporada with (security_invoker = true) as
select j.id as jogador_id, j.nome, p.temporada, p.competicao_id,
       count(*) filter (where x.minuto_entrada is not null) as jogos,
       count(*) filter (where x.titular)                  as titular,
       sum(x.minutos)                                     as minutos,
       sum(x.gols)                                        as gols,
       sum(x.assistencias)                                as assistencias,
       sum(x.amarelos)                                    as amarelos,
       sum(x.vermelhos)                                   as vermelhos
from participacoes x
join jogadores j on j.id = x.jogador_id
join partidas p on p.id = x.partida_id
group by j.id, j.nome, p.temporada, p.competicao_id;

create view v_tecnicos with (security_invoker = true) as
select t.id, t.nome, count(p.id) as jogos,
       count(*) filter (where p.resultado = 'V') as vitorias,
       count(*) filter (where p.resultado = 'E') as empates,
       count(*) filter (where p.resultado = 'D') as derrotas,
       round(100.0 * (3 * count(*) filter (where p.resultado = 'V')
                      + count(*) filter (where p.resultado = 'E'))
             / nullif(3 * count(p.id), 0), 1) as aproveitamento
from tecnicos t
left join partidas p on p.tecnico_id = t.id and p.encerrada
group by t.id, t.nome;

-- Segurança: leitura pública, escrita só por quem ignora RLS (carga) ---------

do $$
declare t text;
begin
  foreach t in array array['competicoes','clubes','estadios','tecnicos','passagens_tecnico',
                           'jogadores','partidas','participacoes','eventos','estatisticas_time']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy leitura_publica on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

alter table revisao enable row level security;  -- sem política: invisível para o público
