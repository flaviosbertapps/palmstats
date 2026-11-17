import Link from "next/link";
import { sql } from "@/lib/db";
import { comp, data, n } from "@/lib/format";
import { Placar, Res, TabelaPartidas, type LinhaPartida } from "@/components/ui";

export const revalidate = 3600;

export default async function Inicio() {
  const [{ temporada }] = await sql`select max(temporada) as temporada from partidas where encerrada`;

  const [ultimas, artilheiros, resumo, nesteDia] = await Promise.all([
    sql<LinhaPartida[]>`
      select p.id, p.data, p.competicao_id, p.fase, p.mando, c.nome as adversario, c.id as adversario_id,
             p.gols_pro, p.gols_contra, p.penaltis_pro, p.penaltis_contra, p.resultado
      from partidas p join clubes c on c.id = p.adversario_id
      where p.encerrada order by p.data desc limit 6`,
    sql`
      select j.id, j.nome, sum(x.gols) as gols, count(*) filter (where x.jogou) as jogos
      from participacoes x join jogadores j on j.id = x.jogador_id join partidas p on p.id = x.partida_id
      where p.temporada = ${temporada}
      group by j.id, j.nome having sum(x.gols) > 0 order by gols desc, jogos limit 8`,
    sql`
      select count(*) as jogos,
             count(*) filter (where resultado = 'V') as v, count(*) filter (where resultado = 'E') as e,
             count(*) filter (where resultado = 'D') as d, sum(gols_pro) as gp, sum(gols_contra) as gc
      from partidas where encerrada and temporada = ${temporada}`,
    sql<(LinhaPartida & { ano: number })[]>`
      select p.id, p.data, p.competicao_id, p.fase, p.mando, c.nome as adversario, c.id as adversario_id,
             p.gols_pro, p.gols_contra, p.penaltis_pro, p.penaltis_contra, p.resultado,
             extract(year from p.data at time zone 'America/Sao_Paulo')::int as ano
      from partidas p join clubes c on c.id = p.adversario_id
      where p.encerrada
        and to_char(p.data at time zone 'America/Sao_Paulo', 'MM-DD') = to_char(now() at time zone 'America/Sao_Paulo', 'MM-DD')
      order by p.data desc`,
  ]);
  const r = resumo[0];

  return (
    <>
      <h1>Palmeiras em números</h1>
      <p className="sub">Todos os jogos oficiais desde 2015: escalações, gols, cartões e estatísticas.</p>

      <div className="grade">
        <section className="cartao">
          <h2>Temporada {temporada}</h2>
          <ul className="lista">
            <li><span>Jogos</span><strong>{n(r.jogos)}</strong></li>
            <li><span>Vitórias · empates · derrotas</span><strong>{n(r.v)} · {n(r.e)} · {n(r.d)}</strong></li>
            <li><span>Gols pró · contra</span><strong>{n(r.gp)} · {n(r.gc)}</strong></li>
          </ul>
        </section>

        <section className="cartao">
          <h2>Artilheiros de {temporada}</h2>
          <ul className="lista">
            {artilheiros.map((a) => (
              <li key={a.id}>
                <Link href={`/jogadores/${a.id}`}>{a.nome}</Link>
                <span><strong>{n(a.gols)}</strong> <span className="aviso">em {n(a.jogos)} jogos</span></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao">
          <h2>Neste dia</h2>
          {nesteDia.length === 0 ? (
            <p className="aviso">Nenhum jogo nesta data desde 2015.</p>
          ) : (
            <ul className="lista">
              {nesteDia.map((p) => (
                <li key={String(p.id)}>
                  <Link href={`/partidas/${p.id}`}>
                    {p.ano} · {p.adversario} <span className="aviso">({comp(p.competicao_id)})</span>
                  </Link>
                  <span><Placar p={p} /> <Res r={p.resultado} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <h2>Últimos jogos</h2>
      <TabelaPartidas partidas={ultimas} />
      <p><Link href="/partidas">Ver todas as partidas →</Link></p>

      <h2>Sabia que…</h2>
      <div className="grade">
        <div className="cartao curio">
          <div className="titulo">Um zagueiro entre os maiores artilheiros</div>
          Gustavo Gómez fez 43 gols desde 2015, 27 de cabeça. <Link href="/curiosidades">Mais curiosidades →</Link>
        </div>
        <div className="cartao curio">
          <div className="titulo">O Palmeiras decide no fim</div>
          A faixa entre os 76' e o apito final é a que mais rende gols ao time. <Link href="/curiosidades">Ver →</Link>
        </div>
        <div className="cartao curio">
          <div className="titulo">O calcanhar de aquiles</div>
          Nas disputas de pênaltis desde 2015, o retrospecto é negativo. <Link href="/curiosidades">Ver →</Link>
        </div>
      </div>
    </>
  );
}
