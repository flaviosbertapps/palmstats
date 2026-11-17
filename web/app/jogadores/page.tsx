import type { Metadata } from "next";
import Link from "next/link";
import { inteiro, sql, umDe } from "@/lib/db";
import { comp, n } from "@/lib/format";

export const metadata: Metadata = { title: "Jogadores" };

const ORDENS = ["jogos", "gols", "assistencias", "minutos", "titular", "amarelos", "vermelhos"] as const;
const ROTULO: Record<(typeof ORDENS)[number], string> = {
  jogos: "Jogos", gols: "Gols", assistencias: "Assist.", minutos: "Minutos",
  titular: "Titular", amarelos: "🟨", vermelhos: "🟥",
};

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default async function Jogadores({ searchParams }: { searchParams: Busca }) {
  const q = await searchParams;
  const temporada = inteiro(q.temporada);
  const ordem = umDe(q.ordem, ORDENS) ?? "jogos";
  const competicoes = await sql`select id from competicoes order by nome`;
  const compId = competicoes.some((c) => c.id === q.competicao) ? String(q.competicao) : null;

  const [temporadas, linhas] = await Promise.all([
    sql`select distinct temporada from partidas order by temporada desc`,
    sql`
      select j.id, j.nome, j.posicao, j.nacionalidade,
             count(*) filter (where x.jogou) as jogos,
             count(*) filter (where x.titular) as titular,
             coalesce(sum(x.minutos), 0) as minutos,
             coalesce(sum(x.gols), 0) as gols,
             coalesce(sum(x.assistencias), 0) as assistencias,
             coalesce(sum(x.amarelos), 0) as amarelos,
             coalesce(sum(x.vermelhos), 0) as vermelhos,
             min(p.temporada) as de, max(p.temporada) as ate
      from participacoes x
      join jogadores j on j.id = x.jogador_id
      join partidas p on p.id = x.partida_id
      where true
        ${temporada ? sql`and p.temporada = ${temporada}` : sql``}
        ${compId ? sql`and p.competicao_id = ${compId}` : sql``}
      group by j.id
      having count(*) filter (where x.jogou) > 0
      order by ${sql(ordem)} desc, jogos desc
      limit 150`,
  ]);

  const link = (o: string) => {
    const s = new URLSearchParams();
    if (temporada) s.set("temporada", String(temporada));
    if (compId) s.set("competicao", compId);
    s.set("ordem", o);
    return `/jogadores?${s}`;
  };

  return (
    <>
      <h1>Jogadores</h1>
      <form className="filtros">
        <input type="hidden" name="ordem" value={ordem} />
        <label>Temporada
          <select name="temporada" defaultValue={temporada ?? ""}>
            <option value="">2015 em diante</option>
            {temporadas.map((t) => <option key={t.temporada} value={t.temporada}>{t.temporada}</option>)}
          </select>
        </label>
        <label>Competição
          <select name="competicao" defaultValue={compId ?? ""}>
            <option value="">Todas</option>
            {competicoes.map((c) => <option key={c.id} value={c.id}>{comp(c.id)}</option>)}
          </select>
        </label>
        <button type="submit">Filtrar</button>
      </form>
      <p className="sub"><Link href="/comparar">Comparar dois jogadores lado a lado →</Link></p>
      <p className="sub">Clique no cabeçalho para ordenar. Assistências vêm dos eventos de gol da ESPN.</p>
      <div className="tabela">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Jogador</th>
              <th>Período</th>
              {ORDENS.map((o) => (
                <th key={o} className="num">
                  <Link href={link(o)} className={o === ordem ? "ativo" : ""}>{ROTULO[o]}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((j, i) => (
              <tr key={j.id}>
                <td className="num aviso">{i + 1}</td>
                <td><Link href={`/jogadores/${j.id}`}>{j.nome}</Link></td>
                <td className="aviso">{j.de === j.ate ? j.de : `${j.de}–${j.ate}`}</td>
                {ORDENS.map((o) => <td key={o} className="num">{n(j[o])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
