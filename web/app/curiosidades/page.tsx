import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { comp, data, n } from "@/lib/format";
import { Placar, Res, type LinhaPartida } from "@/components/ui";

export const metadata: Metadata = { title: "Curiosidades" };
export const revalidate = 3600;

const BASE_PARTIDA = sql`
  select p.id, p.data, p.competicao_id, p.fase, p.mando, c.nome as adversario, c.id as adversario_id,
         p.gols_pro, p.gols_contra, p.penaltis_pro, p.penaltis_contra, p.resultado
  from partidas p join clubes c on c.id = p.adversario_id where p.encerrada`;

export default async function Curiosidades() {
  const [goleadas, derrotas, sequencias, faixas, cabeca, zagueiros, duplas, banco, penaltis, cobradores, jovens, viradas, mando] =
    await Promise.all([
      sql<LinhaPartida[]>`${BASE_PARTIDA} order by p.gols_pro - p.gols_contra desc, p.gols_pro desc limit 5`,
      sql<LinhaPartida[]>`${BASE_PARTIDA} order by p.gols_pro - p.gols_contra, p.gols_contra desc limit 5`,
      sql`
        with o as (select data, resultado, row_number() over (order by data) n from partidas where encerrada),
        inv as (select n - row_number() over (order by n) g, data from o where resultado <> 'D'),
        vit as (select n - row_number() over (order by n) g, data from o where resultado = 'V')
        (select 'Invencibilidade' as tipo, count(*) as jogos, min(data) as de, max(data) as ate from inv group by g order by 2 desc limit 3)
        union all
        (select 'Vitórias seguidas', count(*), min(data), max(data) from vit group by g order by 2 desc limit 3)`,
      sql`
        select case when minuto <= 15 then '1–15' when minuto <= 30 then '16–30' when minuto <= 45 then '31–45+'
                    when minuto <= 60 then '46–60' when minuto <= 75 then '61–75' else '76–90+' end as faixa,
               count(*) filter (where do_palmeiras) as pro, count(*) filter (where not do_palmeiras) as contra
        from eventos
        where tipo in ('gol', 'penalti_convertido', 'gol_contra') and not disputa_penaltis and minuto <= 90
        group by 1 order by min(minuto)`,
      sql`select round(100.0 * count(*) filter (where tipo_fonte = 'Goal - Header') / nullif(count(*), 0), 1) as pct
          from eventos where do_palmeiras and tipo = 'gol'`,
      sql`
        select j.id, j.nome, count(*) as gols, count(*) filter (where e.tipo_fonte = 'Goal - Header') as cabeca,
               count(*) filter (where e.tipo = 'penalti_convertido') as penaltis
        from eventos e join jogadores j on j.id = e.jogador_id
        where e.do_palmeiras and e.tipo in ('gol', 'penalti_convertido') and not e.disputa_penaltis
          and j.id in (select jogador_id from participacoes where posicao ilike '%defender%' group by 1 having count(*) >= 30)
        group by 1, 2 order by 3 desc limit 5`,
      sql`
        select e.jogador2_id as g_id, e.jogador2_nome as garcom, e.jogador_id as a_id, e.jogador_nome as artilheiro, count(*) as n
        from eventos e where e.do_palmeiras and e.tipo = 'gol' and e.jogador2_id is not null and e.jogador_id is not null
        group by 1, 2, 3, 4 order by 5 desc limit 6`,
      sql`
        select j.id, j.nome, sum(x.gols) as gols
        from participacoes x join jogadores j on j.id = x.jogador_id
        where not x.titular and x.jogou group by 1, 2 having sum(x.gols) > 0 order by 3 desc limit 6`,
      sql`select count(*) as total, count(*) filter (where penaltis_pro > penaltis_contra) as venceu
          from partidas where penaltis_pro is not null and competicao_id <> 'club.friendly'`,
      sql`
        select jogador_id as id, jogador_nome as nome,
               count(*) filter (where tipo = 'penalti_convertido') as conv, count(*) as total
        from eventos where tipo in ('penalti_convertido', 'penalti_perdido') and not disputa_penaltis
          and jogador_id is not null
        group by 1, 2 having count(*) >= 6 order by 3 desc limit 6`,
      sql`
        select distinct on (j.id) j.id, j.nome, p.data, p.id as partida_id, (p.data::date - j.nascimento) as dias
        from participacoes x join jogadores j on j.id = x.jogador_id join partidas p on p.id = x.partida_id
        where x.gols > 0 and j.nascimento is not null
        order by j.id, p.data`,
      sql`
        with g as (
          select e.partida_id, e.do_palmeiras,
                 row_number() over (partition by e.partida_id order by e.periodo, e.minuto, coalesce(e.acrescimo, 0), e.id) as k
          from eventos e where e.tipo in ('gol', 'penalti_convertido', 'gol_contra') and not e.disputa_penaltis),
        s as (select partida_id, sum(case when do_palmeiras then 1 else -1 end) over (partition by partida_id order by k) as saldo from g)
        select count(distinct p.id) as n from partidas p join s on s.partida_id = p.id where s.saldo < 0 and p.resultado = 'V'`,
      sql`
        select mando, count(*) as j,
               round(100.0 * (3 * count(*) filter (where resultado = 'V') + count(*) filter (where resultado = 'E')) / (3 * count(*)), 1) as aprov
        from partidas where encerrada and mando <> 'neutro' group by 1 order by 1`,
    ]);

  const maisJovens = [...jovens].sort((a, b) => Number(a.dias) - Number(b.dias)).slice(0, 5);
  const maxFaixa = Math.max(...faixas.map((f) => Number(f.pro)));
  const pen = penaltis[0];

  const listaPartidas = (ps: LinhaPartida[]) => (
    <ul className="lista">
      {ps.map((p) => (
        <li key={String(p.id)}>
          <Link href={`/partidas/${p.id}`}>{data(p.data)} · {p.adversario}
            <span className="aviso"> ({comp(p.competicao_id)})</span></Link>
          <span><Placar p={p} /> <Res r={p.resultado} /></span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <h1>Curiosidades</h1>
      <p className="sub">Calculadas a partir de todos os jogos desde 2015. Cada item leva às partidas de origem.</p>

      <div className="grade">
        <section className="cartao curio">
          <h2>Maiores goleadas</h2>
          {listaPartidas(goleadas)}
        </section>
        <section className="cartao curio">
          <h2>Piores derrotas</h2>
          {listaPartidas(derrotas)}
        </section>

        <section className="cartao curio">
          <h2>Sequências</h2>
          <ul className="lista">
            {sequencias.map((s, i) => (
              <li key={i}>
                <span>{s.tipo}: <strong>{n(s.jogos)} jogos</strong></span>
                <span className="aviso">{data(s.de)} a {data(s.ate)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao curio">
          <h2>O Palmeiras decide no fim</h2>
          <p className="aviso">Gols marcados por faixa de minuto (sofridos entre parênteses).</p>
          {faixas.map((f) => (
            <div key={f.faixa} style={{ display: "grid", gridTemplateColumns: "60px 1fr 70px", gap: 8, alignItems: "center", margin: "4px 0" }}>
              <span className="aviso">{f.faixa}</span>
              <div className="barra"><span style={{ width: `${(100 * Number(f.pro)) / maxFaixa}%` }} /></div>
              <span className="num">{n(f.pro)} <span className="aviso">({n(f.contra)})</span></span>
            </div>
          ))}
          <p className="aviso">{n(cabeca[0].pct, 1)}% dos gols de jogadores do Palmeiras são de cabeça.</p>
        </section>

        <section className="cartao curio">
          <h2>Zagueiros artilheiros</h2>
          <ul className="lista">
            {zagueiros.map((z) => (
              <li key={z.id}>
                <Link href={`/jogadores/${z.id}`}>{z.nome}</Link>
                <span><strong>{n(z.gols)}</strong> <span className="aviso">({n(z.cabeca)} de cabeça, {n(z.penaltis)} de pênalti)</span></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao curio">
          <h2>Duplas: assistência → gol</h2>
          <ul className="lista">
            {duplas.map((d, i) => (
              <li key={i}>
                <span>
                  <Link href={`/jogadores/${d.g_id}`}>{d.garcom}</Link> → <Link href={`/jogadores/${d.a_id}`}>{d.artilheiro}</Link>
                </span>
                <strong>{n(d.n)}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao curio">
          <h2>Quem decide saindo do banco</h2>
          <ul className="lista">
            {banco.map((b) => (
              <li key={b.id}><Link href={`/jogadores/${b.id}`}>{b.nome}</Link><strong>{n(b.gols)} gols</strong></li>
            ))}
          </ul>
        </section>

        <section className="cartao curio">
          <h2>Pênaltis</h2>
          <p>
            Disputas de pênaltis em jogos oficiais: <strong>{n(pen.venceu)} vitórias em {n(pen.total)}</strong>.
          </p>
          <p className="aviso">Cobradores com 6 ou mais pênaltis em jogo:</p>
          <ul className="lista">
            {cobradores.map((c) => (
              <li key={c.id}>
                <Link href={`/jogadores/${c.id}`}>{c.nome}</Link>
                <span><strong>{n(c.conv)}/{n(c.total)}</strong> <span className="aviso">({n((100 * Number(c.conv)) / Number(c.total))}%)</span></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao curio">
          <h2>Mais jovens a marcar</h2>
          <ul className="lista">
            {maisJovens.map((j) => (
              <li key={j.id}>
                <Link href={`/jogadores/${j.id}`}>{j.nome}</Link>
                <span>
                  <Link href={`/partidas/${j.partida_id}`}>{Math.floor(Number(j.dias) / 365.25)} anos e{" "}
                    {Math.floor((Number(j.dias) % 365.25) / 30.44)} meses</Link>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao curio">
          <h2>Viradas e mando</h2>
          <p><strong>{n(viradas[0].n)} viradas</strong>: jogos em que o Palmeiras saiu atrás e venceu.</p>
          <ul className="lista">
            {mando.map((m) => (
              <li key={m.mando}>
                <span>{m.mando === "casa" ? "Em casa" : "Fora"} <span className="aviso">({n(m.j)} jogos)</span></span>
                <strong>{n(m.aprov, 1)}%</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
