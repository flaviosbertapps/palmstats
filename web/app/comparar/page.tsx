import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { inteiro, sql, umDe } from "@/lib/db";
import { aproveitamento, comp, data, n, posicao } from "@/lib/format";
import { juntos, metricas, type Filtro, type Metricas } from "@/lib/comparar";

export const metadata: Metadata = {
  title: "Comparar jogadores",
  description: "Dois jogadores lado a lado, por 90 minutos, no mesmo recorte.",
};

type Busca = Promise<Record<string, string | string[] | undefined>>;

const MIN_MINUTOS = 900;

/** Taxa por 90 minutos; null se não houver minutos com o dado. */
const p90 = (v: unknown, min: unknown) => {
  const m = Number(min ?? 0);
  return m > 0 && v !== null && v !== undefined ? (90 * Number(v)) / m : null;
};
const razao = (a: unknown, b: unknown) => (Number(b ?? 0) > 0 && a !== null ? Number(a) / Number(b) : null);

type Linha = {
  rotulo: string;
  valor: (m: Metricas) => number | null;
  casas?: number;
  sufixo?: string;
  menorMelhor?: boolean;
  dica?: string;
};
type Grupo = { titulo: string; linhas: Linha[]; goleiro?: boolean };

const GRUPOS: Grupo[] = [
  {
    titulo: "Volume",
    linhas: [
      { rotulo: "Jogos", valor: (m) => Number(m.jogos) },
      { rotulo: "Titular", valor: (m) => razao(100 * Number(m.titular), m.jogos), sufixo: "%" },
      { rotulo: "Minutos", valor: (m) => Number(m.minutos ?? 0) },
      { rotulo: "Minutos por jogo", valor: (m) => razao(m.minutos, m.jogos) },
      { rotulo: "Aproveitamento do time com ele", valor: (m) => aproveitamento(m.v, m.e, m.jogos), casas: 1, sufixo: "%" },
    ],
  },
  {
    titulo: "Produção",
    linhas: [
      { rotulo: "Gols", valor: (m) => Number(m.gols ?? 0) },
      { rotulo: "Assistências", valor: (m) => Number(m.assistencias ?? 0) },
      { rotulo: "Gols por 90", valor: (m) => p90(m.gols, m.minutos), casas: 2 },
      { rotulo: "Assistências por 90", valor: (m) => p90(m.assistencias, m.minutos), casas: 2 },
      { rotulo: "Participações em gol por 90", valor: (m) => p90(Number(m.gols ?? 0) + Number(m.assistencias ?? 0), m.minutos), casas: 2 },
      { rotulo: "Minutos por gol", valor: (m) => razao(m.minutos, m.gols), menorMelhor: true },
    ],
  },
  {
    titulo: "Gols que valem pontos",
    linhas: [
      { rotulo: "Gols decisivos", valor: (m) => Number(m.gols_decisivos ?? 0),
        dica: "Sem os gols dele naquele jogo, o resultado mudaria (vitória virava empate, empate virava derrota)." },
      { rotulo: "% dos gols que foram decisivos", valor: (m) => razao(100 * Number(m.gols_decisivos ?? 0), m.gols), sufixo: "%" },
      { rotulo: "Pontos rendidos pelos gols", valor: (m) => Number(m.pontos_gols ?? 0),
        dica: "Pontos (3/1/0) do resultado real menos os pontos sem os gols dele. Conta também mata-mata, como se fosse pontos corridos." },
    ],
  },
  {
    titulo: "Jogos grandes e momentos",
    linhas: [
      { rotulo: "Gols em clássicos", valor: (m) => Number(m.gols_classicos ?? 0), dica: "Corinthians, São Paulo e Santos." },
      { rotulo: "Gols por 90 em clássicos", valor: (m) => p90(m.gols_classicos, m.min_classicos), casas: 2 },
      { rotulo: "Gols em mata-mata", valor: (m) => Number(m.gols_mata ?? 0) },
      { rotulo: "Gols por 90 em mata-mata", valor: (m) => p90(m.gols_mata, m.min_mata), casas: 2 },
      { rotulo: "Gols depois dos 75'", valor: (m) => Number(m.gols_fim ?? 0) },
      { rotulo: "Gols por 90 saindo do banco", valor: (m) => p90(m.gols_reserva, m.min_reserva), casas: 2 },
    ],
  },
  {
    titulo: "Finalização",
    linhas: [
      { rotulo: "Chutes por 90", valor: (m) => p90(m.chutes, m.min_chutes), casas: 2 },
      { rotulo: "Chutes no alvo por 90", valor: (m) => p90(m.no_alvo, m.min_alvo), casas: 2 },
      { rotulo: "Gols por chute", valor: (m) => razao(100 * Number(m.gols_com_chutes ?? 0), m.chutes), sufixo: "%",
        dica: "Só jogos em que a fonte traz os chutes." },
      { rotulo: "Gols de cabeça", valor: (m) => Number(m.gols_cabeca ?? 0) },
      { rotulo: "Gols de pênalti", valor: (m) => Number(m.gols_penalti ?? 0) },
    ],
  },
  {
    titulo: "Disciplina",
    linhas: [
      { rotulo: "Faltas cometidas por 90", valor: (m) => p90(m.faltas_cometidas, m.min_fc), casas: 2, menorMelhor: true },
      { rotulo: "Faltas sofridas por 90", valor: (m) => p90(m.faltas_sofridas, m.min_fs), casas: 2 },
      { rotulo: "Cartões por 90", valor: (m) => p90(Number(m.amarelos ?? 0) + Number(m.vermelhos ?? 0), m.min_cartoes), casas: 2, menorMelhor: true },
      { rotulo: "Vermelhos", valor: (m) => Number(m.vermelhos ?? 0), menorMelhor: true },
    ],
  },
  {
    titulo: "Goleiro",
    goleiro: true,
    linhas: [
      { rotulo: "Defesas por 90", valor: (m) => p90(m.defesas, m.min_defesas), casas: 2 },
      { rotulo: "Jogos sem sofrer gol (como titular)", valor: (m) => Number(m.sem_sofrer ?? 0) },
      { rotulo: "% sem sofrer gol", valor: (m) => razao(100 * Number(m.sem_sofrer ?? 0), m.titular), sufixo: "%" },
    ],
  },
];

export default async function Comparar({ searchParams }: { searchParams: Busca }) {
  const q = await searchParams;
  const a = inteiro(q.a);
  const b = inteiro(q.b);
  const [jogadores, competicoes, tecnicos, anos] = await Promise.all([
    sql`select j.id, j.nome, j.posicao, count(*) filter (where x.jogou) as jogos
        from jogadores j join participacoes x on x.jogador_id = j.id
        group by 1, 2, 3 having count(*) filter (where x.jogou) > 0 order by j.nome`,
    sql`select id from competicoes where id in (select distinct competicao_id from partidas) order by nome`,
    sql`select t.id, t.nome from tecnicos t where exists (select 1 from partidas p where p.tecnico_id = t.id) order by t.nome`,
    sql`select distinct temporada from partidas order by 1`,
  ]);
  const f: Filtro = {
    de: inteiro(q.de),
    ate: inteiro(q.ate),
    competicao: competicoes.some((c) => c.id === q.competicao) ? String(q.competicao) : null,
    tecnico: inteiro(q.tecnico),
    mando: umDe(q.mando, ["casa", "fora", "neutro"] as const),
  };
  const porNome = (nome: string) => jogadores.find((j) => j.nome === nome);
  const sugestoes = [
    ["Raphael Veiga", "Dudu"], ["Rony", "José Manuel López"], ["Gustavo Gómez", "Murilo"], ["Weverton", "Marcelo Lomba"],
  ].map(([x, y]) => [porNome(x), porNome(y)]).filter(([x, y]) => x && y) as [{ id: number; nome: string }, { id: number; nome: string }][];
  const ja = jogadores.find((j) => Number(j.id) === a);
  const jb = jogadores.find((j) => Number(j.id) === b);

  const formulario = (
    <form className="filtros">
      <label>Jogador A
        <select name="a" defaultValue={a ?? ""}>
          <option value="">Escolha…</option>
          {jogadores.map((j) => <option key={j.id} value={j.id}>{j.nome} ({n(j.jogos)})</option>)}
        </select>
      </label>
      <label>Jogador B
        <select name="b" defaultValue={b ?? ""}>
          <option value="">Escolha…</option>
          {jogadores.map((j) => <option key={j.id} value={j.id}>{j.nome} ({n(j.jogos)})</option>)}
        </select>
      </label>
      <label>Competição
        <select name="competicao" defaultValue={f.competicao ?? ""}>
          <option value="">Todas</option>
          {competicoes.map((c) => <option key={c.id} value={c.id}>{comp(c.id)}</option>)}
        </select>
      </label>
      <label>Técnico
        <select name="tecnico" defaultValue={f.tecnico ?? ""}>
          <option value="">Todos</option>
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </label>
      <label>Mando
        <select name="mando" defaultValue={f.mando ?? ""}>
          <option value="">Todos</option>
          <option value="casa">Casa</option>
          <option value="fora">Fora</option>
          <option value="neutro">Neutro</option>
        </select>
      </label>
      <label>De
        <select name="de" defaultValue={f.de ?? ""}>
          <option value="">{anos[0]?.temporada}</option>
          {anos.map((x) => <option key={x.temporada} value={x.temporada}>{x.temporada}</option>)}
        </select>
      </label>
      <label>Até
        <select name="ate" defaultValue={f.ate ?? ""}>
          <option value="">{anos[anos.length - 1]?.temporada}</option>
          {anos.map((x) => <option key={x.temporada} value={x.temporada}>{x.temporada}</option>)}
        </select>
      </label>
      <button type="submit">Comparar</button>
    </form>
  );

  if (!ja || !jb || a === b) {
    return (
      <>
        <h1>Comparar jogadores</h1>
        <p className="sub">
          Dois jogadores lado a lado, por 90 minutos e no mesmo recorte. Escolha os dois e, se quiser, limite por
          competição, técnico, mando ou período.
        </p>
        {formulario}
        {a !== null && a === b && <p className="aviso alerta">Escolha dois jogadores diferentes.</p>}
        {sugestoes.length > 0 && (
          <p className="aviso">
            Sugestões:{" "}
            {sugestoes.map(([x, y], i) => (
              <span key={i}>
                {i > 0 && " · "}
                <Link href={`/comparar?a=${x.id}&b=${y.id}`}>{x.nome} × {y.nome}</Link>
              </span>
            ))}
          </p>
        )}
      </>
    );
  }

  const [ma, mb, jt] = await Promise.all([metricas(a!, f), metricas(b!, f), juntos(a!, b!, f)]);
  const ehGoleiro = (p: unknown) => String(p ?? "").includes("Goalkeeper");
  const algumGoleiro = ehGoleiro(ja.posicao) || ehGoleiro(jb.posicao);
  const doisGoleiros = ehGoleiro(ja.posicao) && ehGoleiro(jb.posicao);
  const posicoesDiferentes = posicao(ja.posicao) !== posicao(jb.posicao);

  const celula = (v: number | null, outro: number | null, l: Linha) => {
    // Compara o que é exibido: valores iguais depois do arredondamento não têm "melhor".
    const r = (x: number | null) => (x === null ? null : Number(x.toFixed(l.casas ?? 0)));
    const [rv, ro] = [r(v), r(outro)];
    const melhor = rv !== null && ro !== null && rv !== ro && (l.menorMelhor ? rv < ro : rv > ro);
    return (
      <td className="num" style={melhor ? { fontWeight: 800, color: "var(--verde)" } : undefined}>
        {v === null ? "–" : `${n(v, l.casas ?? 0)}${l.sufixo ?? ""}`}
      </td>
    );
  };

  const recorteJunto = (rot: string, j: unknown, v: unknown, e: unknown) => (
    <li>
      <span>{rot} <span className="aviso">({n(j)} jogos)</span></span>
      <strong>{Number(j) ? `${n(aproveitamento(v, e, j), 1)}%` : "–"}</strong>
    </li>
  );

  return (
    <>
      <h1>{ja.nome} × {jb.nome}</h1>
      {formulario}

      {[ma, mb].some((m) => Number(m.minutos ?? 0) < MIN_MINUTOS) && (
        <p className="aviso alerta">
          {[[ja, ma], [jb, mb]].filter(([, m]) => Number((m as Metricas).minutos ?? 0) < MIN_MINUTOS)
            .map(([j, m]) => `${(j as { nome: string }).nome} tem só ${n((m as Metricas).minutos ?? 0)} minutos neste recorte`)
            .join("; ")}. Taxas por 90 minutos com menos de {n(MIN_MINUTOS)} minutos oscilam muito.
        </p>
      )}
      {posicoesDiferentes && (
        <p className="aviso">
          Posições diferentes ({posicao(ja.posicao) || "?"} × {posicao(jb.posicao) || "?"}): compare com cuidado; gols e
          desarmes significam coisas distintas para cada função.
        </p>
      )}

      <div className="tabela">
        <table>
          <thead>
            <tr>
              <th></th>
              <th className="num"><Link href={`/jogadores/${a}`}>{ja.nome}</Link></th>
              <th className="num"><Link href={`/jogadores/${b}`}>{jb.nome}</Link></th>
            </tr>
          </thead>
          <tbody>
            {GRUPOS.filter((g) =>
              doisGoleiros ? ["Volume", "Goleiro", "Disciplina"].includes(g.titulo) : !g.goleiro || algumGoleiro,
            ).map((g) => (
              <Fragment key={g.titulo}>
                <tr><th colSpan={3}>{g.titulo}</th></tr>
                {g.linhas.map((l) => {
                  const va = l.valor(ma);
                  const vb = l.valor(mb);
                  return (
                    <tr key={g.titulo + l.rotulo}>
                      <td style={{ whiteSpace: "normal" }}>
                        {l.rotulo}
                        {l.dica && <div className="aviso" style={{ fontSize: 12 }}>{l.dica}</div>}
                      </td>
                      {celula(va, vb, l)}
                      {celula(vb, va, l)}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="aviso">Em verde, a melhor marca de cada linha. “–” quando a fonte não traz o dado.</p>

      <h2>Juntos e separados</h2>
      {Number(jt.j_juntos) + Number(jt.j_so_a) + Number(jt.j_so_b) === 0 || !jt.ini || jt.ini > jt.fim ? (
        <p className="aviso">Os dois não coincidiram no clube neste recorte.</p>
      ) : (
        <div className="grade">
          <section className="cartao">
            <p className="aviso" style={{ marginTop: 0 }}>
              Aproveitamento do time de {data(jt.ini)} a {data(jt.fim)}, período em que os dois estavam no clube.
            </p>
            <ul className="lista">
              {recorteJunto("Os dois em campo", jt.j_juntos, jt.v_juntos, jt.e_juntos)}
              {recorteJunto(`Só ${ja.nome}`, jt.j_so_a, jt.v_so_a, jt.e_so_a)}
              {recorteJunto(`Só ${jb.nome}`, jt.j_so_b, jt.v_so_b, jt.e_so_b)}
            </ul>
            {[jt.j_so_a, jt.j_so_b].some((x) => Number(x) > 0 && Number(x) < 10) && (
              <p className="aviso alerta" style={{ marginTop: 8 }}>Algum recorte tem menos de 10 jogos: amostra pequena.</p>
            )}
          </section>
          <section className="cartao">
            <h2>Um servindo o outro</h2>
            <ul className="lista">
              <li><span>{ja.nome} → {jb.nome}</span><strong>{n(jt.a_para_b)} assistências</strong></li>
              <li><span>{jb.nome} → {ja.nome}</span><strong>{n(jt.b_para_a)} assistências</strong></li>
            </ul>
          </section>
        </div>
      )}
      <p className="aviso">Correlação, não causa: adversários, calendário e o resto da escalação também mudam.</p>
    </>
  );
}
