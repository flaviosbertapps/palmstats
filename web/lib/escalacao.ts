import { sql } from "@/lib/db";
import { num } from "@/lib/format";

/**
 * xG "em campo": soma o xG das finalizações (mapa de chutes do FotMob) que
 * aconteceram enquanto o jogador (ou a dupla) estava em campo, usando os
 * minutos de entrada e saída da ESPN. Gols contra ficam fora (não são chute).
 *
 * Fronteiras: o relógio da ESPN para em 45/90/105/120; uma finalização nos
 * acréscimos (minuto 45 + acréscimo) conta para quem saiu no intervalo, não
 * para quem entrou. Por isso as fronteiras desses minutos ganham +0,9 e os
 * chutes nos acréscimos ganham +0,5.
 */

export const ANO = 2026;
export const FUNCOES = ["gol", "zag", "lat", "vol", "meia", "ponta", "ata"] as const;
export type Funcao = (typeof FUNCOES)[number];
export const NOME_FUNCAO: Record<Funcao, string> = {
  gol: "Goleiro", zag: "Zagueiro", lat: "Lateral/ala", vol: "Volante",
  meia: "Meia", ponta: "Ponta", ata: "Centroavante",
};
export const SETORES = {
  vol: { nome: "Volantes", funcoes: ["vol"] },
  zag: { nome: "Zagueiros", funcoes: ["zag"] },
  lat: { nome: "Laterais e alas", funcoes: ["lat"] },
  ataque: { nome: "Ataque (meias, pontas e centroavantes)", funcoes: ["meia", "ponta", "ata"] },
} as const;
export type Setor = keyof typeof SETORES;

/** Minutos de "confiança" para puxar taxas pequenas em direção à média do time. */
export const K_AJUSTE = 450;

export type Recorte = { competicao: string | null; grandes: boolean };

function jogosCte(r: Recorte) {
  return sql`
    jogos as (
      select p.id from partidas p
      join clubes c on c.id = p.adversario_id
      where p.temporada = ${ANO} and p.encerrada
        and exists (select 1 from xg_finalizacao f where f.partida_id = p.id)
        ${r.competicao ? sql`and p.competicao_id = ${r.competicao}` : sql``}
        ${r.grandes ? sql`and (c.nome in ('Corinthians', 'São Paulo', 'Santos')
              or (p.fase is not null and p.fase !~* 'group|league phase|regular'))` : sql``}
    ),
    iv as (
      select x.partida_id, x.jogador_id, x.minutos,
             x.minuto_entrada + case when x.minuto_entrada in (45, 90, 105) then 0.9 else 0 end as ini,
             x.minuto_saida + case when x.minuto_saida in (45, 90, 105, 120) then 0.9 else 0 end as fim
      from participacoes x join jogos j on j.id = x.partida_id
      where x.jogou and x.minuto_entrada is not null and x.minuto_saida is not null
    ),
    sh as (
      select partida_id, do_palmeiras, xg,
             minuto + case when coalesce(acrescimo, 0) > 0 then 0.5 else 0 end as t
      from xg_finalizacao f join jogos j on j.id = f.partida_id
      where not gol_contra
    ),
    duracao as (
      select partida_id, max(minuto_saida) as min from participacoes
      where partida_id in (select id from jogos) group by 1
    ),
    tot as (
      select d.partida_id, d.min,
             coalesce(sum(sh.xg) filter (where sh.do_palmeiras), 0) as pro,
             coalesce(sum(sh.xg) filter (where not sh.do_palmeiras), 0) as contra
      from duracao d left join sh on sh.partida_id = d.partida_id
      group by 1, 2
    ),
    funcao as (
      select jogador_id, mode() within group (order by funcao) as funcao, count(funcao) as jogos_funcao
      from xg_participacao where funcao is not null group by 1
    )`;
}

export async function resumoTime(r: Recorte) {
  const [t] = await sql`
    with ${jogosCte(r)}
    select count(*) as jogos, sum(min) as minutos, sum(pro) as pro, sum(contra) as contra from tot`;
  const min = num(t.minutos) ?? 0;
  return {
    jogos: num(t.jogos) ?? 0,
    minutos: min,
    pro90: min ? (90 * (num(t.pro) ?? 0)) / min : null,
    contra90: min ? (90 * (num(t.contra) ?? 0)) / min : null,
  };
}

/** Com e sem cada jogador, mais números individuais do FotMob. */
export async function jogadores(r: Recorte) {
  return sql`
    with ${jogosCte(r)},
    em as (
      select iv.jogador_id, iv.partida_id, iv.minutos,
             coalesce(sum(sh.xg) filter (where sh.do_palmeiras), 0) as pro,
             coalesce(sum(sh.xg) filter (where not sh.do_palmeiras), 0) as contra
      from iv left join sh on sh.partida_id = iv.partida_id and sh.t >= iv.ini and sh.t < iv.fim
      group by 1, 2, 3
    ),
    periodo as (   -- "sem ele" só no período em que estava no clube (relacionado entre a 1ª e a última vez)
      select x.jogador_id, min(p.data) as de, max(p.data) as ate
      from participacoes x join partidas p on p.id = x.partida_id
      where p.temporada = ${ANO} group by 1
    ),
    fora as (
      select pe.jogador_id,
             sum(t.min - coalesce(em.minutos, 0)) as minutos,
             sum(t.pro - coalesce(em.pro, 0)) as pro,
             sum(t.contra - coalesce(em.contra, 0)) as contra
      from periodo pe
      join partidas p on p.data between pe.de and pe.ate
      join tot t on t.partida_id = p.id
      left join em on em.partida_id = p.id and em.jogador_id = pe.jogador_id
      group by 1
    ),
    ind as (
      select g.jogador_id, sum(g.minutos) as min_fm,
             sum(coalesce(g.xg_sem_penalti, 0)) as npxg, sum(coalesce(g.xa, 0)) as xa,
             sum(g.desarmes) as desarmes, sum(g.interceptacoes) as interceptacoes,
             sum(g.recuperacoes) as recuperacoes, sum(g.duelos_ganhos) as duelos_ganhos,
             sum(g.duelos_perdidos) as duelos_perdidos, sum(g.passes_certos) as passes_certos,
             sum(g.passes) as passes, sum(g.chances_criadas) as chances_criadas,
             sum(g.passes_terco_final) as passes_terco_final
      from xg_participacao g join jogos j on j.id = g.partida_id
      group by 1
    )
    select jg.id, jg.nome, f.funcao, f.jogos_funcao,
           count(em.partida_id) as jogos, sum(em.minutos) as minutos,
           sum(em.pro) as pro, sum(em.contra) as contra,
           fo.minutos as min_fora, fo.pro as pro_fora, fo.contra as contra_fora,
           ind.*
    from em
    join jogadores jg on jg.id = em.jogador_id
    left join funcao f on f.jogador_id = em.jogador_id
    left join fora fo on fo.jogador_id = em.jogador_id
    left join ind on ind.jogador_id = em.jogador_id
    group by jg.id, jg.nome, f.funcao, f.jogos_funcao, fo.minutos, fo.pro, fo.contra, ind.jogador_id,
             ind.min_fm, ind.npxg, ind.xa, ind.desarmes, ind.interceptacoes, ind.recuperacoes,
             ind.duelos_ganhos, ind.duelos_perdidos, ind.passes_certos, ind.passes,
             ind.chances_criadas, ind.passes_terco_final`;
}

/**
 * Minuto a minuto de quem estava em campo em cada setor. A função vale por
 * jogo (titular, grade do FotMob); quem entrou do banco fica com a principal.
 * Minuto k = intervalo [k, k+1). Finalização no minuto m do relógio cai em
 * k = m − 1; nos acréscimos (45+2, 90+3) cai no último minuto do tempo.
 */
function setorCte(funcoes: readonly string[]) {
  return sql`
    setor_iv as (
      select iv.partida_id, iv.jogador_id, floor(iv.ini)::int as ini, floor(iv.fim)::int as fim
      from iv
      left join xg_participacao g on g.partida_id = iv.partida_id and g.jogador_id = iv.jogador_id
      left join funcao f on f.jogador_id = iv.jogador_id
      where coalesce(g.funcao, f.funcao) in ${sql(funcoes as string[])}
    ),
    slot as (
      select partida_id, jogador_id, generate_series(ini, fim - 1) as k from setor_iv where fim > ini
    ),
    nslot as (
      select partida_id, k, count(*) as n, array_agg(jogador_id order by jogador_id) as js
      from slot group by 1, 2
    ),
    shk as (
      select partida_id, greatest(0, floor(t)::int - 1) as k,
             sum(xg) filter (where do_palmeiras) as pro, sum(xg) filter (where not do_palmeiras) as contra
      from sh group by 1, 2
    )`;
}

/**
 * Duplas do setor. Exclusiva: só os minutos em que os dois eram os únicos do
 * setor em campo (sem um terceiro volante, por exemplo).
 */
export async function duplas(r: Recorte, funcoes: readonly string[], minimo: number, exclusiva: boolean) {
  return sql`
    with ${jogosCte(r)}, ${setorCte(funcoes)},
    par_slot as (
      select s1.partida_id, s1.k, s1.jogador_id as a_id, s2.jogador_id as b_id
      from slot s1
      join slot s2 on s2.partida_id = s1.partida_id and s2.k = s1.k and s1.jogador_id < s2.jogador_id
      ${exclusiva ? sql`join nslot ns on ns.partida_id = s1.partida_id and ns.k = s1.k and ns.n = 2` : sql``}
    ),
    porjogo as (
      select ps.partida_id, ps.a_id, ps.b_id, count(*) as minutos,
             coalesce(sum(shk.pro), 0) as pro, coalesce(sum(shk.contra), 0) as contra
      from par_slot ps left join shk on shk.partida_id = ps.partida_id and shk.k = ps.k
      group by 1, 2, 3
    ),
    xa_time as (   -- xA do time por jogo (soma dos jogadores do FotMob)
      select t.partida_id, t.min, sum(coalesce(g.xa, 0)) as xa
      from tot t join xg_participacao g on g.partida_id = t.partida_id
      group by 1, 2
    ),
    periodo as (
      select x.jogador_id, min(p.data) as de, max(p.data) as ate
      from participacoes x join partidas p on p.id = x.partida_id
      where p.temporada = ${ANO} group by 1
    ),
    agg as (
      select a_id, b_id, count(*) as jogos, sum(minutos) as minutos, sum(pro) as pro, sum(contra) as contra
      from porjogo group by 1, 2 having sum(minutos) >= ${minimo}
    ),
    -- xA próprio de cada um nos jogos em que estiveram juntos, com os minutos do FotMob
    xa_dupla as (
      select pj.a_id, pj.b_id,
             sum(coalesce(ga.xa, 0)) filter (where ga.jogador_id is not null) as xa_a, sum(ga.minutos) as min_a,
             sum(coalesce(gb.xa, 0)) filter (where gb.jogador_id is not null) as xa_b, sum(gb.minutos) as min_b
      from porjogo pj
      join agg using (a_id, b_id)
      left join xg_participacao ga on ga.partida_id = pj.partida_id and ga.jogador_id = pj.a_id
      left join xg_participacao gb on gb.partida_id = pj.partida_id and gb.jogador_id = pj.b_id
      group by 1, 2
    ),
    -- xA do time por jogo inteiro: "com" = 60+ minutos juntos; "sem" = demais jogos do período em comum
    com_sem as (
      select agg.a_id, agg.b_id,
             sum(xt.xa) filter (where coalesce(pj.minutos, 0) >= 60) as xa_com,
             sum(xt.min) filter (where coalesce(pj.minutos, 0) >= 60) as min_com,
             sum(xt.xa) filter (where coalesce(pj.minutos, 0) < 60) as xa_sem,
             sum(xt.min) filter (where coalesce(pj.minutos, 0) < 60) as min_sem
      from agg
      join periodo pa on pa.jogador_id = agg.a_id
      join periodo pb on pb.jogador_id = agg.b_id
      join partidas p on p.data between greatest(pa.de, pb.de) and least(pa.ate, pb.ate)
      join xa_time xt on xt.partida_id = p.id
      left join porjogo pj on pj.partida_id = p.id and pj.a_id = agg.a_id and pj.b_id = agg.b_id
      group by 1, 2
    )
    select a.nome as a, b.nome as b, a.id as a_id, b.id as b_id, fa.funcao as fa, fb.funcao as fb,
           agg.jogos, agg.minutos, agg.pro, agg.contra,
           xd.xa_a, xd.min_a, xd.xa_b, xd.min_b,
           cs.xa_com, cs.min_com, cs.xa_sem, cs.min_sem
    from agg
    join jogadores a on a.id = agg.a_id join jogadores b on b.id = agg.b_id
    join funcao fa on fa.jogador_id = agg.a_id join funcao fb on fb.jogador_id = agg.b_id
    left join xa_dupla xd on xd.a_id = agg.a_id and xd.b_id = agg.b_id
    left join com_sem cs on cs.a_id = agg.a_id and cs.b_id = agg.b_id`;
}

/** Formações com 3 ou mais jogadores do setor em campo ao mesmo tempo (ex.: três volantes). */
export async function formacoes(r: Recorte, funcoes: readonly string[]) {
  return sql`
    with ${jogosCte(r)}, ${setorCte(funcoes)},
    grupos as (
      select ns.partida_id, ns.js, count(*) as minutos,
             coalesce(sum(shk.pro), 0) as pro, coalesce(sum(shk.contra), 0) as contra
      from nslot ns left join shk on shk.partida_id = ns.partida_id and shk.k = ns.k
      where ns.n >= 3 group by 1, 2
    )
    select g.js, (select array_agg(j.nome order by j.nome) from jogadores j where j.id = any(g.js)) as nomes,
           count(*) as jogos, sum(minutos) as minutos, sum(pro) as pro, sum(contra) as contra
    from grupos g group by g.js order by sum(minutos) desc`;
}

/** Taxa por 90 puxada para a média do time quando há poucos minutos. */
export function ajustado(total: number, minutos: number, media90: number) {
  return (90 * (total + (media90 * K_AJUSTE) / 90)) / (minutos + K_AJUSTE);
}
