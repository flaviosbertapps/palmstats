import type { Metadata } from "next";
import Link from "next/link";
import { inteiro, sql, umDe } from "@/lib/db";
import { aproveitamento, comp, data, n } from "@/lib/format";

export const metadata: Metadata = {
  title: "Aproveitamento por jogador",
  description: "Quem esteve em campo nos jogos em que o Palmeiras mais pontuou, por campeonato e ano.",
};

type Busca = Promise<Record<string, string | string[] | undefined>>;

const CRITERIOS = ["titular", "45", "60", "jogou"] as const;
type Criterio = (typeof CRITERIOS)[number];
const NOME_CRITERIO: Record<Criterio, string> = {
  titular: "foi titular",
  "45": "jogou 45 minutos ou mais",
  "60": "jogou 60 minutos ou mais",
  jogou: "entrou em campo",
};
const ORDENS = ["aprov", "dif", "jogos"] as const;

type Jogo = { id: string; data: Date; resultado: "V" | "E" | "D" };
type Part = { partida_id: string; jogador_id: string; titular: boolean; jogou: boolean; minutos: number | null };
type Jog = { id: string; nome: string; primeiro: Date; ultimo: Date };

type Placar = { j: number; v: number; e: number; d: number };
const vazio = (): Placar => ({ j: 0, v: 0, e: 0, d: 0 });
function soma(p: Placar, r: Jogo["resultado"]) {
  p.j++;
  if (r === "V") p.v++;
  else if (r === "E") p.e++;
  else p.d++;
}
const ap = (p: Placar) => aproveitamento(p.v, p.e, p.j);

/** Sequências (jogos consecutivos do recorte) que satisfazem o teste. */
function sequencias(jogos: Jogo[], ok: (r: Jogo["resultado"]) => boolean) {
  const out: Jogo[][] = [];
  let atual: Jogo[] = [];
  for (const g of jogos) {
    if (ok(g.resultado)) atual.push(g);
    else {
      if (atual.length) out.push(atual);
      atual = [];
    }
  }
  if (atual.length) out.push(atual);
  return out.sort((a, b) => b.length - a.length || +b[0].data - +a[0].data);
}

export default async function Aproveitamento({ searchParams }: { searchParams: Busca }) {
  const q = await searchParams;
  const criterio = umDe(q.criterio, CRITERIOS) ?? "titular";
  const ordem = umDe(q.ordem, ORDENS) ?? "aprov";

  const opcoes = await sql`
    select temporada, competicao_id, count(*) as jogos
    from partidas where encerrada and resultado is not null group by 1, 2 order by 1 desc, 2`;
  const anos = [...new Set(opcoes.map((o) => Number(o.temporada)))];
  const temporada = anos.includes(inteiro(q.temporada) ?? -1) ? inteiro(q.temporada)! : anos[0];
  const compsDoAno = opcoes.filter((o) => Number(o.temporada) === temporada);
  const compId = compsDoAno.some((c) => c.competicao_id === q.competicao) ? String(q.competicao) : null;

  const filtro = sql`p.encerrada and p.resultado is not null and p.temporada = ${temporada ?? 0}
    ${compId ? sql`and p.competicao_id = ${compId}` : sql``}`;

  const [jogos, parts, jogs] = await Promise.all([
    sql<Jogo[]>`select p.id::text, p.data, p.resultado from partidas p where ${filtro} order by p.data`,
    sql<Part[]>`
      select x.partida_id::text, x.jogador_id::text, x.titular, x.jogou, x.minutos
      from participacoes x join partidas p on p.id = x.partida_id where ${filtro}`,
    // Período de cada jogador no clube (todas as competições), para o "sem ele".
    sql<Jog[]>`
      select j.id::text, j.nome, min(p.data) as primeiro, max(p.data) as ultimo
      from jogadores j join participacoes x on x.jogador_id = j.id and x.jogou join partidas p on p.id = x.partida_id
      where p.encerrada and j.id in (select x2.jogador_id from participacoes x2 join partidas p on p.id = x2.partida_id where ${filtro})
      group by 1, 2`,
  ]);

  const conta = (x: Part) =>
    criterio === "titular" ? x.titular
    : criterio === "jogou" ? x.jogou
    : x.jogou && x.minutos !== null && x.minutos >= Number(criterio);

  const total = jogos.length;
  const minAuto = Math.max(3, Math.ceil(total * 0.3));
  const minJogos = Math.min(inteiro(q.min) ?? minAuto, Math.max(total, 1));

  const time = vazio();
  for (const g of jogos) soma(time, g.resultado);

  // jogador -> conjunto de partidas em que atendeu ao critério
  const presenca = new Map<string, Set<string>>();
  for (const x of parts) {
    if (!conta(x)) continue;
    if (!presenca.has(x.jogador_id)) presenca.set(x.jogador_id, new Set());
    presenca.get(x.jogador_id)!.add(x.partida_id);
  }
  const info = new Map(jogs.map((j) => [j.id, j]));

  const linhas = [...presenca.entries()].map(([id, set]) => {
    const j = info.get(id);
    const com = vazio();
    const sem = vazio();
    for (const g of jogos) {
      if (set.has(g.id)) soma(com, g.resultado);
      else if (j && g.data >= j.primeiro && g.data <= j.ultimo) soma(sem, g.resultado);
    }
    const a = ap(com)!;
    const b = sem.j ? ap(sem) : null;
    return { id, nome: j?.nome ?? "?", com, sem, a, b, dif: b === null ? null : a - b };
  });

  const ranking = linhas
    .filter((l) => l.com.j >= minJogos)
    .sort((x, y) =>
      ordem === "jogos" ? y.com.j - x.com.j || y.a - x.a
      : ordem === "dif" ? (y.dif ?? -999) - (x.dif ?? -999) || y.com.j - x.com.j
      : y.a - x.a || y.com.j - x.com.j);
  const cortados = linhas.length - ranking.length;

  // Sequências: as 3 maiores invencibilidades e as 2 maiores séries de vitórias (mínimo 3 jogos).
  const invict = sequencias(jogos, (r) => r !== "D").filter((s) => s.length >= 3).slice(0, 3);
  // Série de vitórias idêntica a uma invencibilidade já listada não se repete.
  const mesma = (a: Jogo[], b: Jogo[]) => a.length === b.length && a[0].id === b[0].id;
  const vitorias = sequencias(jogos, (r) => r === "V")
    .filter((s) => s.length >= 3 && !invict.some((i) => mesma(i, s)))
    .slice(0, 2);
  const blocos = [
    ...invict.map((s) => ({ tipo: "Invencibilidade", s })),
    ...vitorias.map((s) => ({ tipo: "Vitórias seguidas", s })),
  ];
  const nasSeq = (s: Jogo[]) =>
    linhas
      .map((l) => ({ ...l, k: s.filter((g) => presenca.get(l.id)!.has(g.id)).length }))
      .filter((l) => l.k > 0)
      .sort((x, y) => y.k - x.k || x.nome.localeCompare(y.nome));

  // Presença somada nas invencibilidades listadas (vitórias seguidas já estão contidas nelas).
  const jogosSeq = invict.flat();
  const presencaSeq = nasSeq(jogosSeq).filter((l) => l.k >= Math.ceil(jogosSeq.length / 2));

  const link = (mais: Record<string, string>) => {
    const o: Record<string, string> = { temporada: String(temporada), criterio, ordem };
    if (compId) o.competicao = compId;
    if (q.min) o.min = String(minJogos);
    return `/aproveitamento?${new URLSearchParams({ ...o, ...mais })}`;
  };
  const recorte = `${compId ? comp(compId) : "Todas as competições"} ${temporada}`;
  const fmtDif = (d: number | null) => (d === null ? "–" : `${d > 0 ? "+" : ""}${n(d, 1)}`);

  return (
    <>
      <h1>Aproveitamento por jogador</h1>
      <p className="sub">
        Como o time pontuou nos jogos em que cada jogador esteve em campo, e quem participou das melhores sequências do
        Palmeiras num campeonato.
      </p>

      <form className="filtros">
        <label>Ano
          <select name="temporada" defaultValue={temporada}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>Competição
          <select name="competicao" defaultValue={compId ?? ""}>
            <option value="">Todas</option>
            {compsDoAno.map((c) => <option key={c.competicao_id} value={c.competicao_id}>{comp(c.competicao_id)} ({n(c.jogos)})</option>)}
          </select>
        </label>
        <label>Conta o jogo se
          <select name="criterio" defaultValue={criterio}>
            {CRITERIOS.map((c) => <option key={c} value={c}>{NOME_CRITERIO[c]}</option>)}
          </select>
        </label>
        <label>Mínimo de jogos
          <input type="number" name="min" min={1} placeholder={`auto (${minAuto})`} defaultValue={q.min ? minJogos : ""}
            style={{ width: 110 }} />
        </label>
        <label>Ordenar por
          <select name="ordem" defaultValue={ordem}>
            <option value="aprov">Aproveitamento</option>
            <option value="dif">Diferença com e sem</option>
            <option value="jogos">Jogos</option>
          </select>
        </label>
        <button type="submit">Ver</button>
      </form>
      <p className="aviso">
        Se mudar o ano, a lista de competições se atualiza depois de clicar em “Ver”. O mínimo automático é 30% dos jogos
        do recorte (pelo menos 3).
      </p>

      {total === 0 ? <p className="aviso">Nenhum jogo encerrado neste recorte.</p> : (
        <>
          <div className="numeros" style={{ marginTop: 8 }}>
            <div className="numero"><div className="v">{n(total)}</div><div className="r">jogos · {recorte}</div></div>
            <div className="numero"><div className="v">{n(time.v)}·{n(time.e)}·{n(time.d)}</div><div className="r">V · E · D</div></div>
            <div className="numero"><div className="v">{n(ap(time), 1)}%</div><div className="r">aproveitamento do time</div></div>
            <div className="numero"><div className="v">{n(minJogos)}</div><div className="r">jogos mínimos para entrar</div></div>
          </div>
          {temporada === new Date().getFullYear() && (
            <p className="aviso alerta" style={{ marginTop: 8 }}>Temporada em andamento: técnicos e dados de {temporada} ainda não foram conferidos.</p>
          )}
          {total < 10 && <p className="aviso alerta" style={{ marginTop: 8 }}>Recorte com só {total} jogos: as diferenças são ruído.</p>}

          <h2>Ranking de aproveitamento</h2>
          <p className="aviso">
            Jogos em que o jogador {NOME_CRITERIO[criterio]}. “Sem ele” são os demais jogos do recorte enquanto ele estava
            no clube (inclui lesão, suspensão, convocação e banco).
            {criterio === "45" || criterio === "60" ? " Jogos sem minutagem registrada ficam de fora." : ""}
            {cortados > 0 && ` ${n(cortados)} jogadores com menos de ${minJogos} jogos ficaram fora.`}
          </p>
          <div className="tabela">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Jogador</th>
                  <th className="num"><Link href={link({ ordem: "jogos" })}>Jogos</Link></th>
                  <th className="num">V·E·D</th>
                  <th className="num"><Link href={link({ ordem: "aprov" })}>Com ele</Link></th>
                  <th className="num">Sem ele</th>
                  <th className="num"><Link href={link({ ordem: "dif" })}>Diferença</Link></th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((l, i) => (
                  <tr key={l.id}>
                    <td className="num">{i + 1}</td>
                    <td><Link href={`/jogadores/${l.id}`}>{l.nome}</Link></td>
                    <td className="num">{n(l.com.j)} <span className="aviso">({n((100 * l.com.j) / total, 0)}%)</span></td>
                    <td className="num">{l.com.v}·{l.com.e}·{l.com.d}</td>
                    <td className="num"><strong>{n(l.a, 1)}%</strong></td>
                    <td className="num">{l.b === null ? "–" : `${n(l.b, 1)}%`} <span className="aviso">({n(l.sem.j)})</span></td>
                    <td className="num" style={{ color: l.dif === null ? undefined : l.dif >= 0 ? "var(--vitoria)" : "var(--derrota)" }}>
                      {fmtDif(l.dif)}{l.sem.j > 0 && l.sem.j < 5 && <span className="aviso">*</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="aviso">
            * “Sem ele” com menos de 5 jogos. Quem joga quase tudo tem aproveitamento parecido com o do time, e quem
            é poupado em jogos fáceis ou difíceis herda isso: correlação, não causa.
          </p>

          <h2>Nas melhores sequências</h2>
          {blocos.length === 0 ? <p className="aviso">Nenhuma sequência de 3 jogos ou mais sem derrota neste recorte.</p> : (
            <>
              {presencaSeq.length > 0 && (
                <section className="cartao" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginTop: 0 }}>Presença nas {invict.length === 1 ? "invencibilidade" : `${invict.length} maiores invencibilidades`} ({n(jogosSeq.length)} jogos)</h3>
                  <p className="aviso" style={{ marginTop: -6 }}>Quem {NOME_CRITERIO[criterio]} em pelo menos metade desses jogos.</p>
                  <ul className="lista">
                    {presencaSeq.map((l) => (
                      <li key={l.id}>
                        <Link href={`/jogadores/${l.id}`}>{l.nome}</Link>
                        <span><strong>{l.k}</strong> <span className="aviso">de {jogosSeq.length} ({n((100 * l.k) / jogosSeq.length, 0)}%)</span></span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="grade">
                {blocos.map(({ tipo, s }, i) => {
                  const pl = vazio();
                  for (const g of s) soma(pl, g.resultado);
                  const quem = nasSeq(s);
                  return (
                    <section className="cartao" key={i}>
                      <h3 style={{ marginTop: 0 }}>{tipo}: {s.length} jogos</h3>
                      <p className="aviso" style={{ marginTop: -6 }}>
                        <Link href={`/partidas/${s[0].id}`}>{data(s[0].data)}</Link> a{" "}
                        <Link href={`/partidas/${s[s.length - 1].id}`}>{data(s[s.length - 1].data)}</Link> · {pl.v}V {pl.e}E
                      </p>
                      <ul className="lista">
                        {quem.slice(0, 14).map((l) => (
                          <li key={l.id}>
                            <Link href={`/jogadores/${l.id}`}>{l.nome}</Link>
                            <span>{l.k === s.length ? <strong>todos</strong> : <>{l.k} <span className="aviso">de {s.length}</span></>}</span>
                          </li>
                        ))}
                      </ul>
                      {quem.length > 14 && <p className="aviso">+{quem.length - 14} jogadores com menos jogos.</p>}
                    </section>
                  );
                })}
              </div>
              <p className="aviso">
                Sequências contam só os jogos do recorte, em ordem de data. Disputa de pênaltis conta como empate (vale o
                placar do jogo).
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
