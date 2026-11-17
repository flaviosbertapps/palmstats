import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inteiro, sql } from "@/lib/db";
import { aproveitamento, comp, MANDO, n } from "@/lib/format";
import { Numero, TabelaPartidas, type LinhaPartida } from "@/components/ui";

export const revalidate = 3600;

type Params = Promise<{ id: string }>;

async function clube(id: number) {
  const [c] = await sql`select * from clubes where id = ${id}`;
  return c;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = inteiro((await params).id);
  const c = id ? await clube(id) : null;
  return { title: c ? `Palmeiras x ${c.nome}` : "Adversário" };
}

export default async function Adversario({ params }: { params: Params }) {
  const id = inteiro((await params).id);
  if (!id) notFound();
  const c = await clube(id);
  if (!c) notFound();

  const [recortes, artilheiros, jogos] = await Promise.all([
    sql`
      select grouping(mando) as gm, grouping(competicao_id) as gc, mando, competicao_id,
             count(*) as j, count(*) filter (where resultado = 'V') as v,
             count(*) filter (where resultado = 'E') as e, count(*) filter (where resultado = 'D') as d,
             sum(gols_pro) as gp, sum(gols_contra) as gcontra
      from partidas where adversario_id = ${id} and encerrada
      group by grouping sets ((), (mando), (competicao_id))`,
    sql`
      select j.id, j.nome, sum(x.gols) as gols
      from participacoes x join jogadores j on j.id = x.jogador_id join partidas p on p.id = x.partida_id
      where p.adversario_id = ${id}
      group by 1, 2 having sum(x.gols) > 0 order by 3 desc limit 8`,
    sql<LinhaPartida[]>`
      select p.id, p.data, p.competicao_id, p.fase, p.mando, ${c.nome}::text as adversario,
             p.gols_pro, p.gols_contra, p.penaltis_pro, p.penaltis_contra, p.resultado
      from partidas p where p.adversario_id = ${id} and p.encerrada order by p.data desc`,
  ]);
  const geral = recortes.find((r) => r.gm === 1 && r.gc === 1)!;
  const porMando = recortes.filter((r) => r.gm === 0);
  const porComp = recortes.filter((r) => r.gc === 0);

  const linha = (rot: string, r: (typeof recortes)[number]) => (
    <tr key={rot}>
      <td>{rot}</td>
      <td className="num">{n(r.j)}</td><td className="num">{n(r.v)}</td><td className="num">{n(r.e)}</td>
      <td className="num">{n(r.d)}</td><td className="num">{n(r.gp)}–{n(r.gcontra)}</td>
      <td className="num">{n(aproveitamento(r.v, r.e, r.j), 1)}%</td>
    </tr>
  );

  return (
    <>
      <h1>Palmeiras x {c.nome}</h1>
      <p className="sub">Retrospecto desde 2015, todas as competições.</p>
      <div className="numeros">
        <Numero v={n(geral.j)} r="jogos" />
        <Numero v={n(geral.v)} r="vitórias" />
        <Numero v={n(geral.e)} r="empates" />
        <Numero v={n(geral.d)} r="derrotas" />
        <Numero v={`${n(geral.gp)}–${n(geral.gcontra)}`} r="gols" />
      </div>

      <div className="grade" style={{ marginTop: 16 }}>
        <div className="tabela">
          <table>
            <thead>
              <tr><th>Recorte</th><th className="num">J</th><th className="num">V</th><th className="num">E</th>
                <th className="num">D</th><th className="num">Gols</th><th className="num">Aprov.</th></tr>
            </thead>
            <tbody>
              {porMando.map((r) => linha(MANDO[r.mando] ?? r.mando, r))}
              {porComp.map((r) => linha(comp(r.competicao_id), r))}
            </tbody>
          </table>
        </div>
        {artilheiros.length > 0 && (
          <section className="cartao">
            <h2>Quem mais marcou no confronto</h2>
            <ul className="lista">
              {artilheiros.map((a) => (
                <li key={a.id}><Link href={`/jogadores/${a.id}`}>{a.nome}</Link><strong>{n(a.gols)}</strong></li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <h2>Todos os jogos</h2>
      <TabelaPartidas partidas={jogos} />
    </>
  );
}
