-- A ESPN às vezes não registra a entrada de um reserva que jogou (ex.: fez gol).
-- "jogou" passa a ser explícito; minuto_entrada pode ficar NULL mesmo com jogou = true.
alter table participacoes add column jogou boolean not null default false;
update participacoes set jogou = minuto_entrada is not null;

create or replace view v_jogador_temporada with (security_invoker = true) as
select j.id as jogador_id, j.nome, p.temporada, p.competicao_id,
       count(*) filter (where x.jogou)                    as jogos,
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
