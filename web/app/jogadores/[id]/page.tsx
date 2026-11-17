import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inteiro, sql } from "@/lib/db";
import { comp, data, n, pais, posicao } from "@/lib/format";
import { Numero, TabelaPartidas, type LinhaPartida } from "@/components/ui";

export const revalidate = 3600;

type Params = Promise<{ id: string }>;

async function jogador(id: number) {
  const [j] = await sql`select * from jogadores where id = ${id}`;
  return j;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = inteiro((await params).id);
  const j = id ? await jogador(id) : null;
  return { title: j?.nome ?? "Jogador" };
}

export default async function Jogador({ params }: { params: Params }) {
  const id = inteiro((await params).id);
  if (!id) notFound();
  const j = await jogador(id);
  if (!j) notFound();

  const [totais, porTemporada, porAdversario, jogos, parceiros] = await Promise.all([
    sql`
      select count(*) filter (where x.jogou) as jogos, count(*) filter (where x.titular) as titular,
             sum(x.minutos) as minutos, sum(x.gols) as gols, sum(x.assistencias) as assistencias,
             sum(x.amarelos) as amarelos, sum(x.vermelhos) as vermelhos,
             count(*) filter (where x.jogou and p.resultado = 'V') as v,
             count(*) filter (where x.jogou and p.resultado = 'E') as e,
             min(p.data) filter (where x.jogou) as estreia
      from participacoes x join partidas p on p.id = x.partida_id
      where x.jogador_id = ${id}`,
    sql`
      select p.temporada, p.competicao_id,
             count(*) filter (where x.jogou) as jogos, sum(x.minutos) as minutos,
             sum(x.gols) as gols, sum(x.assistencias) as assistencias
      from participacoes x join partidas p on p.id = x.partida_id
      where x.jogador_id = ${id}
      group by 1, 2 having count(*) filter (where x.jogou) > 0
      order by 1 desc, 3 desc`,
    sql`
      select c.id, c.nome, sum(x.gols) as gols, count(*) filter (where x.jogou) as jogos
      from participacoes x join partidas p on p.id = x.partida_id join clubes c on c.id = p.adversario_id
      where x.jogador_id = ${id}
      group by 1, 2 having sum(x.gols) > 0 order by 3 desc, 4 limit 10`,
    sql<(LinhaPartida & { g: number; minutos: number | null })[]>`
      select p.id, p.data, p.competicao_id, p.fase, p.mando, c.nome as adversario, c.id as adversario_id,
             p.gols_pro, p.gols_contra, p.penaltis_pro, p.penaltis_contra, p.resultado, x.gols as g, x.minutos
      from participacoes x join partidas p on p.id = x.partida_id join clubes c on c.id = p.adversario_id
      where x.jogador_id = ${id} and x.jogou
      order by p.data desc limit 15`,
    sql`
      select e.jogador_id as id, e.jogador_nome as nome, count(*) as n
      from eventos e where e.jogador2_id = ${id} and e.tipo = 'gol' and e.jogador_id is not null
      group by 1, 2 order by 3 desc limit 5`,
  ]);
  const t = totais[0];
  const aprov = Number(t.jogos) ? (100 * (3 * Number(t.v) + Number(t.e))) / (3 * Number(t.jogos)) : null;

  return (
    <>
      <h1>{j.nome}</h1>
      <p className="sub">
        {[j.nome_completo !== j.nome ? j.nome_completo : null, posicao(j.posicao) || null, pais(j.nacionalidade) || null,
          j.nascimento ? `nascido em ${data(j.nascimento)}` : null,
          t.estreia ? `estreia em ${data(t.estreia)}` : null].filter(Boolean).join(" · ")}
        {j.wikidata_id && <> · <a href={`https://www.wikidata.org/wiki/${j.wikidata_id}`}>Wikidata</a></>}
      </p>

      <div className="numeros">
        <Numero v={n(t.jogos)} r="jogos" />
        <Numero v={n(t.gols)} r="gols" />
        <Numero v={n(t.assistencias)} r="assistências" />
        <Numero v={n(t.minutos)} r="minutos" />
        <Numero v={aprov === null ? "–" : `${n(aprov, 1)}%`} r="aproveitamento com ele em campo" />
        <Numero v={`${n(t.amarelos)} / ${n(t.vermelhos)}`} r="amarelos / vermelhos" />
      </div>

      <h2>Por temporada e competição</h2>
      <div className="tabela">
        <table>
          <thead>
            <tr><th>Temporada</th><th>Competição</th><th className="num">Jogos</th><th className="num">Minutos</th>
              <th className="num">Gols</th><th className="num">Assist.</th></tr>
          </thead>
          <tbody>
            {porTemporada.map((r) => (
              <tr key={`${r.temporada}-${r.competicao_id}`}>
                <td>{r.temporada}</td>
                <td><Link href={`/partidas?temporada=${r.temporada}&competicao=${r.competicao_id}`}>{comp(r.competicao_id)}</Link></td>
                <td className="num">{n(r.jogos)}</td><td className="num">{n(r.minutos)}</td>
                <td className="num">{n(r.gols)}</td><td className="num">{n(r.assistencias)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grade" style={{ marginTop: 16 }}>
        {porAdversario.length > 0 && (
          <section className="cartao">
            <h2>Vítimas preferidas</h2>
            <ul className="lista">
              {porAdversario.map((a) => (
                <li key={a.id}>
                  <Link href={`/adversarios/${a.id}`}>{a.nome}</Link>
                  <span><strong>{n(a.gols)}</strong> <span className="aviso">gols em {n(a.jogos)} jogos</span></span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {parceiros.length > 0 && (
          <section className="cartao">
            <h2>Para quem mais deu assistência</h2>
            <ul className="lista">
              {parceiros.map((a) => (
                <li key={a.id}>
                  <Link href={`/jogadores/${a.id}`}>{a.nome}</Link>
                  <strong>{n(a.n)}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <h2>Últimos jogos</h2>
      <TabelaPartidas partidas={jogos} extra={(p) => {
        const r = p as (typeof jogos)[number];
        return <>{r.g ? "⚽".repeat(r.g) + " " : ""}{n(r.minutos)}'</>;
      }} />
    </>
  );
}
