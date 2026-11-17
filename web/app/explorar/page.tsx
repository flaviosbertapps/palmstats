import type { Metadata } from "next";
import Link from "next/link";
import type postgres from "postgres";
import { inteiro, sql, umDe } from "@/lib/db";
import { aproveitamento, comp, n } from "@/lib/format";
import { Numero, TabelaPartidas, type LinhaPartida } from "@/components/ui";

export const metadata: Metadata = {
  title: "Explorar",
  description: "Cruze jogador, adversário, competição, mando, técnico e período.",
};

type Busca = Promise<Record<string, string | string[] | undefined>>;

const MANDOS = ["casa", "fora", "neutro"] as const;
const PAPEIS = ["qualquer", "titular", "reserva"] as const;

type Resumo = { j: string; v: string; e: string; d: string; gp: string; gc: string };

function Recorte({ titulo, r, nota }: { titulo: string; r: Resumo; nota?: string }) {
  const j = Number(r.j);
  const ap = aproveitamento(r.v, r.e, r.j);
  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      {nota && <p className="aviso" style={{ marginTop: -6 }}>{nota}</p>}
      {j > 0 && j < 10 && (
        <p className="aviso alerta">Amostra pequena ({j} {j === 1 ? "jogo" : "jogos"}): não tire conclusões daqui.</p>
      )}
      {j === 0 ? (
        <p className="aviso">Nenhum jogo.</p>
      ) : (
        <ul className="lista">
          <li><span>Jogos</span><strong>{n(j)}</strong></li>
          <li><span>V · E · D</span><strong>{n(r.v)} · {n(r.e)} · {n(r.d)}</strong></li>
          <li><span>Aproveitamento</span><strong>{n(ap, 1)}%</strong></li>
          <li><span>Gols pró por jogo</span><strong>{n(Number(r.gp) / j, 2)}</strong></li>
          <li><span>Gols sofridos por jogo</span><strong>{n(Number(r.gc) / j, 2)}</strong></li>
        </ul>
      )}
    </section>
  );
}

export default async function Explorar({ searchParams }: { searchParams: Busca }) {
  const q = await searchParams;
  const jogador = inteiro(q.jogador);
  const adversario = inteiro(q.adversario);
  const tecnico = inteiro(q.tecnico);
  const de = inteiro(q.de);
  const ate = inteiro(q.ate);
  const mando = umDe(q.mando, MANDOS);
  const papel = umDe(q.papel, PAPEIS) ?? "qualquer";

  const [competicoes, jogadores, adversarios, tecnicos, anos] = await Promise.all([
    sql`select id from competicoes where id in (select distinct competicao_id from partidas) order by nome`,
    sql`select j.id, j.nome, count(*) filter (where x.jogou) as jogos
        from jogadores j join participacoes x on x.jogador_id = j.id
        group by 1, 2 having count(*) filter (where x.jogou) > 0 order by j.nome`,
    sql`select c.id, c.nome, count(*) as j from clubes c join partidas p on p.adversario_id = c.id group by 1, 2 order by c.nome`,
    sql`select t.id, t.nome from tecnicos t where exists (select 1 from partidas p where p.tecnico_id = t.id) order by t.nome`,
    sql`select distinct temporada from partidas order by 1`,
  ]);
  const compId = competicoes.some((c) => c.id === q.competicao) ? String(q.competicao) : null;
  const nomeJogador = jogadores.find((j) => Number(j.id) === jogador)?.nome as string | undefined;

  // Filtro comum a todas as consultas (só partidas encerradas).
  const filtro = sql`
    p.encerrada
    ${compId ? sql`and p.competicao_id = ${compId}` : sql``}
    ${adversario ? sql`and p.adversario_id = ${adversario}` : sql``}
    ${tecnico ? sql`and p.tecnico_id = ${tecnico}` : sql``}
    ${mando ? sql`and p.mando = ${mando}` : sql``}
    ${de ? sql`and p.temporada >= ${de}` : sql``}
    ${ate ? sql`and p.temporada <= ${ate}` : sql``}`;

  const condPapel =
    papel === "titular" ? sql`x.titular` : papel === "reserva" ? sql`(not x.titular and x.jogou)` : sql`x.jogou`;

  const resumoSql = (onde: postgres.PendingQuery<postgres.Row[]>) => sql<Resumo[]>`
    select count(*) as j, count(*) filter (where p.resultado = 'V') as v,
           count(*) filter (where p.resultado = 'E') as e, count(*) filter (where p.resultado = 'D') as d,
           coalesce(sum(p.gols_pro), 0) as gp, coalesce(sum(p.gols_contra), 0) as gc
    from partidas p where ${filtro} and ${onde}`;

  const nome = (lista: readonly Record<string, unknown>[], id: number | null) =>
    id ? (lista.find((x) => Number(x.id) === id)?.nome as string | undefined) : undefined;
  const partes = [
    nomeJogador && `${nomeJogador}${papel === "titular" ? " (titular)" : papel === "reserva" ? " (do banco)" : ""}`,
    adversario && `x ${nome(adversarios, adversario)}`,
    compId && comp(compId),
    mando && { casa: "em casa", fora: "fora", neutro: "campo neutro" }[mando],
    tecnico && `com ${nome(tecnicos, tecnico)}`,
    (de || ate) && `${de ?? anos[0]?.temporada}–${ate ?? anos[anos.length - 1]?.temporada}`,
  ].filter(Boolean);
  const temFiltro = partes.length > 0;
  const descricao = partes.join(" · ");

  let corpo: React.ReactNode;

  if (jogador && nomeJogador) {
    const jogou = sql`exists (select 1 from participacoes x where x.partida_id = p.id and x.jogador_id = ${jogador} and ${condPapel})`;
    // "Sem ele" só dentro do período em que esteve no clube, para não comparar eras diferentes.
    const periodo = sql`p.data between (select min(p2.data) from participacoes x2 join partidas p2 on p2.id = x2.partida_id
                                          where x2.jogador_id = ${jogador} and x2.jogou)
                                 and (select max(p2.data) from participacoes x2 join partidas p2 on p2.id = x2.partida_id
                                          where x2.jogador_id = ${jogador} and x2.jogou)`;
    const [indiv, com, sem, jogos] = await Promise.all([
      sql`
        select count(*) as jogos, count(*) filter (where x.titular) as titular, sum(x.minutos) as minutos,
               sum(x.gols) as gols, sum(x.assistencias) as assistencias,
               sum(x.amarelos) as amarelos, sum(x.vermelhos) as vermelhos
        from participacoes x join partidas p on p.id = x.partida_id
        where x.jogador_id = ${jogador} and ${condPapel} and ${filtro}`,
      resumoSql(jogou),
      resumoSql(sql`not exists (select 1 from participacoes x where x.partida_id = p.id and x.jogador_id = ${jogador} and x.jogou) and ${periodo}`),
      sql<(LinhaPartida & { g: number | null; minutos: number | null })[]>`
        select p.id, p.data, p.competicao_id, p.fase, p.mando, c.nome as adversario, c.id as adversario_id,
               p.gols_pro, p.gols_contra, p.penaltis_pro, p.penaltis_contra, p.resultado, x.gols as g, x.minutos
        from participacoes x join partidas p on p.id = x.partida_id join clubes c on c.id = p.adversario_id
        where x.jogador_id = ${jogador} and ${condPapel} and ${filtro}
        order by p.data desc limit 400`,
    ]);
    const i = indiv[0];
    const minutos = Number(i.minutos ?? 0);
    const gols = Number(i.gols ?? 0);
    corpo = (
      <>
        <h2>{nomeJogador} neste recorte</h2>
        <div className="numeros">
          <Numero v={n(i.jogos)} r="jogos" />
          <Numero v={n(i.gols)} r="gols" />
          <Numero v={n(i.assistencias)} r="assistências" />
          <Numero v={n(i.minutos)} r="minutos" />
          <Numero v={gols ? n(minutos / gols, 0) : "–"} r="minutos por gol" />
          <Numero v={`${n(i.amarelos)} / ${n(i.vermelhos)}`} r="amarelos / vermelhos" />
        </div>
        <div className="grade" style={{ marginTop: 16 }}>
          <Recorte titulo={`Com ${nomeJogador} em campo`} r={com[0]}
            nota={papel === "titular" ? "Só jogos em que foi titular." : papel === "reserva" ? "Só jogos em que entrou do banco." : undefined} />
          <Recorte titulo={`Sem ${nomeJogador}`} r={sem[0]}
            nota="Só jogos do período em que ele estava no clube (entre o primeiro e o último jogo dele), para não comparar eras diferentes. Inclui lesões, suspensões e poupados." />
        </div>
        <p className="aviso">
          Correlação, não causa: a diferença também reflete adversários, calendário e o restante da escalação.
        </p>
        <h2>Jogos ({n(jogos.length)}{jogos.length === 400 ? "+" : ""})</h2>
        <TabelaPartidas partidas={jogos} extra={(p) => {
          const r = p as (typeof jogos)[number];
          return <>{r.g ? "⚽".repeat(r.g) + " " : ""}{n(r.minutos)}'</>;
        }} />
      </>
    );
  } else {
    const [resumo, artilheiros, jogos] = await Promise.all([
      resumoSql(sql`true`),
      sql`
        select j.id, j.nome, sum(x.gols) as gols, count(*) filter (where x.jogou) as jogos
        from participacoes x join jogadores j on j.id = x.jogador_id join partidas p on p.id = x.partida_id
        where ${filtro}
        group by 1, 2 having sum(x.gols) > 0 order by 3 desc, 4 limit 10`,
      sql<LinhaPartida[]>`
        select p.id, p.data, p.competicao_id, p.fase, p.mando, c.nome as adversario, c.id as adversario_id,
               p.gols_pro, p.gols_contra, p.penaltis_pro, p.penaltis_contra, p.resultado
        from partidas p join clubes c on c.id = p.adversario_id
        where ${filtro} order by p.data desc limit 400`,
    ]);
    corpo = (
      <>
        <div className="grade" style={{ marginTop: 8 }}>
          <Recorte titulo="Resultado do recorte" r={resumo[0]} />
          <section className="cartao">
            <h2>Artilheiros no recorte</h2>
            {artilheiros.length === 0 ? <p className="aviso">Nenhum gol.</p> : (
              <ul className="lista">
                {artilheiros.map((a) => (
                  <li key={a.id}>
                    <Link href={`/explorar?${new URLSearchParams({ ...limpo(q), jogador: String(a.id) })}`}>{a.nome}</Link>
                    <span><strong>{n(a.gols)}</strong> <span className="aviso">em {n(a.jogos)} jogos</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <h2>Jogos ({n(jogos.length)}{jogos.length === 400 ? "+" : ""})</h2>
        <TabelaPartidas partidas={jogos} />
      </>
    );
  }

  return (
    <>
      <h1>Explorar</h1>
      <p className="sub">
        Combine filtros para responder perguntas como “Veiga contra o Corinthians, fora de casa, com o Abel” ou
        “como o time vai com e sem o Gómez”.
      </p>
      <details className="painel-filtros" open={!temFiltro}>
        <summary>{temFiltro ? `Recorte: ${descricao}` : "Filtros"} <span className="aviso">(alterar)</span></summary>
      <form className="filtros">
        <label>Jogador
          <select name="jogador" defaultValue={jogador ?? ""}>
            <option value="">Time inteiro</option>
            {jogadores.map((j) => <option key={j.id} value={j.id}>{j.nome} ({n(j.jogos)})</option>)}
          </select>
        </label>
        <label>Como
          <select name="papel" defaultValue={papel}>
            <option value="qualquer">Titular ou reserva</option>
            <option value="titular">Só titular</option>
            <option value="reserva">Só saindo do banco</option>
          </select>
        </label>
        <label>Adversário
          <select name="adversario" defaultValue={adversario ?? ""}>
            <option value="">Todos</option>
            {adversarios.map((a) => <option key={a.id} value={a.id}>{a.nome} ({n(a.j)})</option>)}
          </select>
        </label>
        <label>Competição
          <select name="competicao" defaultValue={compId ?? ""}>
            <option value="">Todas</option>
            {competicoes.map((c) => <option key={c.id} value={c.id}>{comp(c.id)}</option>)}
          </select>
        </label>
        <label>Mando
          <select name="mando" defaultValue={mando ?? ""}>
            <option value="">Todos</option>
            <option value="casa">Casa</option>
            <option value="fora">Fora</option>
            <option value="neutro">Neutro</option>
          </select>
        </label>
        <label>Técnico
          <select name="tecnico" defaultValue={tecnico ?? ""}>
            <option value="">Todos</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        <label>De
          <select name="de" defaultValue={de ?? ""}>
            <option value="">{anos[0]?.temporada}</option>
            {anos.map((a) => <option key={a.temporada} value={a.temporada}>{a.temporada}</option>)}
          </select>
        </label>
        <label>Até
          <select name="ate" defaultValue={ate ?? ""}>
            <option value="">{anos[anos.length - 1]?.temporada}</option>
            {anos.map((a) => <option key={a.temporada} value={a.temporada}>{a.temporada}</option>)}
          </select>
        </label>
        <button type="submit">Explorar</button>
        <Link href="/explorar" className="aviso">Limpar</Link>
      </form>
      </details>
      {corpo}
    </>
  );
}

/** Parâmetros atuais sem vazios, para montar links que preservam o recorte. */
function limpo(q: Record<string, string | string[] | undefined>) {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) o[k] = s;
  }
  return o;
}
