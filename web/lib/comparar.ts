import type postgres from "postgres";
import { sql } from "@/lib/db";

export const CLASSICOS = ["Corinthians", "São Paulo", "Santos"];

export type Filtro = {
  de: number | null;
  ate: number | null;
  competicao: string | null;
  tecnico: number | null;
  mando: string | null;
};

export function condicaoPartida(f: Filtro) {
  return sql`
    p.encerrada
    ${f.competicao ? sql`and p.competicao_id = ${f.competicao}` : sql``}
    ${f.tecnico ? sql`and p.tecnico_id = ${f.tecnico}` : sql``}
    ${f.mando ? sql`and p.mando = ${f.mando}` : sql``}
    ${f.de ? sql`and p.temporada >= ${f.de}` : sql``}
    ${f.ate ? sql`and p.temporada <= ${f.ate}` : sql``}`;
}

/** Copa do Brasil, Recopa e Supercopa inteiras, mais fases eliminatórias das demais. */
const MATA_MATA = sql`(p.competicao_id in ('bra.copa_do_brazil', 'conmebol.recopa', 'bra.supercopa_do_brazil')
  or p.fase ~* '(final|semi|quarter|cuartos|round of 16|third place)')`;

/** Pontos de um saldo: vitória 3, empate 1, derrota 0. */
const pts = (saldo: postgres.PendingQuery<postgres.Row[]>) =>
  sql`(case when ${saldo} > 0 then 3 when ${saldo} = 0 then 1 else 0 end)`;

export type Metricas = Record<string, string | null>;

export async function metricas(jogador: number, f: Filtro): Promise<Metricas> {
  const filtro = condicaoPartida(f);
  const [m] = await sql<Metricas[]>`
    with base as (
      select x.*, p.resultado, p.gols_pro as p_gp, p.gols_contra as p_gc, p.competicao_id, p.fase,
             c.nome in ${sql(CLASSICOS)} as classico, ${MATA_MATA} as mata
      from participacoes x
      join partidas p on p.id = x.partida_id
      join clubes c on c.id = p.adversario_id
      where x.jogador_id = ${jogador} and x.jogou and ${filtro}
    ),
    ev as (
      select e.tipo, e.tipo_fonte, e.minuto from eventos e
      where e.jogador_id = ${jogador} and e.do_palmeiras and not e.disputa_penaltis
        and e.tipo in ('gol', 'penalti_convertido')
        and e.partida_id in (select partida_id from base)
    )
    select
      count(*) as jogos,
      count(*) filter (where titular) as titular,
      sum(minutos) as minutos,
      sum(gols) as gols,
      sum(assistencias) as assistencias,
      sum(finalizacoes) as chutes,
      sum(minutos) filter (where finalizacoes is not null) as min_chutes,
      sum(gols) filter (where finalizacoes is not null) as gols_com_chutes,
      sum(finalizacoes_no_alvo) as no_alvo,
      sum(minutos) filter (where finalizacoes_no_alvo is not null) as min_alvo,
      sum(faltas_cometidas) as faltas_cometidas,
      sum(minutos) filter (where faltas_cometidas is not null) as min_fc,
      sum(faltas_sofridas) as faltas_sofridas,
      sum(minutos) filter (where faltas_sofridas is not null) as min_fs,
      sum(amarelos) as amarelos,
      sum(vermelhos) as vermelhos,
      sum(minutos) filter (where amarelos is not null) as min_cartoes,
      sum(defesas) as defesas,
      sum(minutos) filter (where defesas is not null) as min_defesas,
      count(*) filter (where titular and p_gc = 0) as sem_sofrer,
      count(*) filter (where resultado = 'V') as v,
      count(*) filter (where resultado = 'E') as e,
      -- Gols decisivos: sem os gols dele naquele jogo, o resultado mudaria.
      sum(gols) filter (where gols > 0 and (resultado = 'E' or (resultado = 'V' and p_gp - p_gc = 1))) as gols_decisivos,
      sum(${pts(sql`(p_gp - p_gc)`)} - ${pts(sql`(p_gp - p_gc - coalesce(gols, 0))`)}) as pontos_gols,
      count(*) filter (where classico) as jogos_classicos,
      sum(gols) filter (where classico) as gols_classicos,
      sum(minutos) filter (where classico) as min_classicos,
      count(*) filter (where mata) as jogos_mata,
      sum(gols) filter (where mata) as gols_mata,
      sum(minutos) filter (where mata) as min_mata,
      sum(gols) filter (where not titular) as gols_reserva,
      sum(minutos) filter (where not titular) as min_reserva,
      (select count(*) from ev where tipo_fonte = 'Goal - Header') as gols_cabeca,
      (select count(*) from ev where tipo = 'penalti_convertido') as gols_penalti,
      (select count(*) from ev where minuto > 75) as gols_fim
    from base`;
  return m;
}

/** Os dois jogadores juntos e separados, no período em que coincidiram no clube. */
export async function juntos(a: number, b: number, f: Filtro) {
  const filtro = condicaoPartida(f);
  const jogou = (j: number) =>
    sql`exists (select 1 from participacoes x where x.partida_id = p.id and x.jogador_id = ${j} and x.jogou)`;
  const limites = (j: number) => sql`
    select min(p2.data) as ini, max(p2.data) as fim
    from participacoes x2 join partidas p2 on p2.id = x2.partida_id where x2.jogador_id = ${j} and x2.jogou`;
  const [r] = await sql`
    with la as (${limites(a)}), lb as (${limites(b)}),
    periodo as (select greatest(la.ini, lb.ini) as ini, least(la.fim, lb.fim) as fim from la, lb),
    jogos as (
      select p.resultado, ${jogou(a)} as com_a, ${jogou(b)} as com_b
      from partidas p, periodo where ${filtro} and p.data between periodo.ini and periodo.fim
    )
    select
      (select ini from periodo) as ini, (select fim from periodo) as fim,
      count(*) filter (where com_a and com_b) as j_juntos,
      count(*) filter (where com_a and com_b and resultado = 'V') as v_juntos,
      count(*) filter (where com_a and com_b and resultado = 'E') as e_juntos,
      count(*) filter (where com_a and not com_b) as j_so_a,
      count(*) filter (where com_a and not com_b and resultado = 'V') as v_so_a,
      count(*) filter (where com_a and not com_b and resultado = 'E') as e_so_a,
      count(*) filter (where com_b and not com_a) as j_so_b,
      count(*) filter (where com_b and not com_a and resultado = 'V') as v_so_b,
      count(*) filter (where com_b and not com_a and resultado = 'E') as e_so_b,
      (select count(*) from eventos e join partidas p on p.id = e.partida_id
        where ${filtro} and e.tipo = 'gol' and e.jogador2_id = ${a} and e.jogador_id = ${b}) as a_para_b,
      (select count(*) from eventos e join partidas p on p.id = e.partida_id
        where ${filtro} and e.tipo = 'gol' and e.jogador2_id = ${b} and e.jogador_id = ${a}) as b_para_a
    from jogos`;
  return r;
}
