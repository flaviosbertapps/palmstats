import type { Metadata } from "next";
import { inteiro, sql } from "@/lib/db";
import { comp, n } from "@/lib/format";
import { TabelaPartidas, type LinhaPartida } from "@/components/ui";

export const metadata: Metadata = { title: "Partidas" };

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default async function Partidas({ searchParams }: { searchParams: Busca }) {
  const q = await searchParams;
  const temporada = inteiro(q.temporada);
  const adversario = inteiro(q.adversario);
  const competicoes = await sql`select id, nome from competicoes order by nome`;
  const compId = competicoes.some((c) => c.id === q.competicao) ? String(q.competicao) : null;

  const [temporadas, adversarios, partidas] = await Promise.all([
    sql`select distinct temporada from partidas order by temporada desc`,
    sql`select c.id, c.nome, count(*) as j from clubes c join partidas p on p.adversario_id = c.id group by 1, 2 order by c.nome`,
    sql<LinhaPartida[]>`
      select p.id, p.data, p.competicao_id, p.fase, p.mando, c.nome as adversario, c.id as adversario_id,
             p.gols_pro, p.gols_contra, p.penaltis_pro, p.penaltis_contra, p.resultado
      from partidas p join clubes c on c.id = p.adversario_id
      where p.encerrada
        ${temporada ? sql`and p.temporada = ${temporada}` : sql``}
        ${compId ? sql`and p.competicao_id = ${compId}` : sql``}
        ${adversario ? sql`and p.adversario_id = ${adversario}` : sql``}
      order by p.data desc`,
  ]);

  const v = partidas.filter((p) => p.resultado === "V").length;
  const e = partidas.filter((p) => p.resultado === "E").length;
  const d = partidas.filter((p) => p.resultado === "D").length;

  return (
    <>
      <h1>Partidas</h1>
      <form className="filtros">
        <label>Temporada
          <select name="temporada" defaultValue={temporada ?? ""}>
            <option value="">Todas</option>
            {temporadas.map((t) => <option key={t.temporada} value={t.temporada}>{t.temporada}</option>)}
          </select>
        </label>
        <label>Competição
          <select name="competicao" defaultValue={compId ?? ""}>
            <option value="">Todas</option>
            {competicoes.map((c) => <option key={c.id} value={c.id}>{comp(c.id)}</option>)}
          </select>
        </label>
        <label>Adversário
          <select name="adversario" defaultValue={adversario ?? ""}>
            <option value="">Todos</option>
            {adversarios.map((a) => <option key={a.id} value={a.id}>{a.nome} ({n(a.j)})</option>)}
          </select>
        </label>
        <button type="submit">Filtrar</button>
      </form>
      <p className="sub">
        {n(partidas.length)} jogos · {v} vitórias, {e} empates, {d} derrotas
      </p>
      <TabelaPartidas partidas={partidas} />
    </>
  );
}
