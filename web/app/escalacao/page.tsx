import type { Metadata } from "next";
import Link from "next/link";
import { sql, umDe } from "@/lib/db";
import { comp, n, num } from "@/lib/format";
import { Th } from "@/components/Ajuda";
import {
  ajustado, ANO, duplas, jogadores, K_AJUSTE, NOME_FUNCAO, resumoTime, SETORES,
  type Funcao, type Recorte, type Setor,
} from "@/lib/escalacao";

export const metadata: Metadata = {
  title: `Escalação ${ANO}`,
  description: "Quem rende junto: xG do Palmeiras com cada jogador e cada dupla em campo.",
};
export const revalidate = 3600;

type Busca = Promise<Record<string, string | string[] | undefined>>;
const MINIMOS = ["90", "180", "300", "450", "900"] as const;
const MIN_INDIVIDUAL = 270;

const AJ = `Puxa a taxa para a média do time quando há poucos minutos: soma ${K_AJUSTE} minutos fictícios jogados no nível médio do time antes de dividir. Quem jogou pouco fica perto da média; só se destaca quem manteve a diferença por muito tempo. A tabela é ordenada por ele.`;
const DICA: Record<string, string> = {
  "Jogos": "Jogos em que estiveram em campo juntos ao mesmo tempo, em partidas com xG.",
  "Min. juntos": "Minutos regulamentares com os dois em campo ao mesmo tempo (sem acréscimos).",
  "Min.": "Minutos regulamentares em campo em jogos com xG (sem acréscimos).",
  "xG pró/90": "xG das finalizações do Palmeiras com eles em campo, a cada 90 minutos. Quanto maior, mais e melhores chances o time criou.",
  "xG contra/90": "xG das finalizações do adversário com eles em campo, a cada 90 minutos. Quanto menor, menos chances o time cedeu.",
  "Saldo/90": "xG pró menos xG contra, a cada 90 minutos com eles em campo. Positivo = o time criou mais do que cedeu.",
  "xA da dupla/90": "Soma do xA de cada um por 90 minutos, nos jogos em que estiveram juntos. xA (assistência esperada) é o xG da finalização que nasceu do passe do jogador, mesmo que não tenha virado gol.",
  "xA time/jogo com": "xA de todo o time por 90 minutos nos jogos em que a dupla ficou 60 minutos ou mais junta. Conta o jogo inteiro: o FotMob não diz em que minuto saiu cada passe.",
  "sem (xA)": "xA de todo o time por 90 minutos nos outros jogos do período em que os dois estavam no clube (juntos menos de 60 minutos ou separados).",
  "Saldo/90 com": "xG pró menos xG contra do time a cada 90 minutos com ele em campo.",
  "sem": "O mesmo número com ele fora de campo (banco, fora da lista ou substituído), só nos jogos do período em que estava no clube.",
  "xG contra/90 com": "xG do adversário a cada 90 minutos com ele em campo. Menor é melhor.",
  "Desarmes + int./90": "Desarmes mais interceptações a cada 90 minutos (FotMob). Mede volume: quem fica mais sem a bola acumula mais.",
  "Recup./90": "Bolas recuperadas a cada 90 minutos (FotMob).",
  "Duelos": "Porcentagem de duelos ganhos, no chão e pelo alto (FotMob).",
  "Passes certos": "Porcentagem de passes certos (FotMob). Passe curto e para trás infla o número.",
  "Terço final/90": "Passes que chegam ao terço final do campo, a cada 90 minutos (FotMob). Mede o quanto o jogador faz a bola avançar.",
  "xA/90": "Assistência esperada a cada 90 minutos: xG das finalizações que nasceram do passe dele.",
  "xG s/ pên./90": "xG das finalizações do próprio jogador a cada 90 minutos, sem pênaltis.",
  "Soma/90": "xG sem pênalti + xA, a cada 90 minutos: tudo o que o jogador produziu ou criou de chance.",
  "Chances criadas/90": "Passes que terminaram em finalização, a cada 90 minutos (FotMob).",
  "xG pró/90 com": "xG do Palmeiras a cada 90 minutos com ele em campo. Mede o efeito no time, não a produção dele.",
};

function sinal(v: number | null, casas = 2) {
  if (v === null || Number.isNaN(v)) return "–";
  const s = n(Math.abs(v), casas);
  return v > 0.005 ? `+${s}` : v < -0.005 ? `−${s}` : s;
}
function Saldo({ v, casas = 2 }: { v: number | null; casas?: number }) {
  return <span className={v === null || Math.abs(v) < 0.005 ? "" : v > 0 ? "pos" : "neg"}>{sinal(v, casas)}</span>;
}
const p90 = (v: unknown, min: unknown) => {
  const x = num(v), m = num(min);
  return x === null || !m ? null : (90 * x) / m;
};

export default async function Escalacao({ searchParams }: { searchParams: Busca }) {
  const q = await searchParams;
  const competicoes = await sql`
    select distinct p.competicao_id as id from partidas p
    where p.temporada = ${ANO} and exists (select 1 from xg_finalizacao f where f.partida_id = p.id)`;
  const compId = competicoes.some((c) => c.id === q.competicao) ? String(q.competicao) : null;
  const r: Recorte = { competicao: compId, grandes: q.grandes === "1" };
  const setor: Setor = umDe(q.setor, Object.keys(SETORES) as Setor[]) ?? "vol";
  const minimo = Number(umDe(q.minimo, MINIMOS) ?? "300");

  const [time, js, ds] = await Promise.all([
    resumoTime(r), jogadores(r), duplas(r, SETORES[setor].funcoes, minimo),
  ]);

  if (!time.jogos || time.pro90 === null || time.contra90 === null) {
    return (<><h1>Escalação {ANO}</h1><p className="sub">Nenhum jogo com mapa de chutes neste recorte.</p><Filtros /></>);
  }
  const saldoTime = time.pro90 - time.contra90;

  const linhas: LinhaJ[] = (js as unknown as Record<string, unknown>[]).map((j) => {
    const min = num(j.minutos) ?? 0, mf = num(j.min_fora) ?? 0;
    const pro = num(j.pro) ?? 0, contra = num(j.contra) ?? 0;
    const com = min ? (90 * (pro - contra)) / min : null;
    const sem = mf ? (90 * ((num(j.pro_fora) ?? 0) - (num(j.contra_fora) ?? 0))) / mf : null;
    return {
      ...j, id: j.id, nome: j.nome, funcao: j.funcao as string | null, min, mf, com, sem,
      dif: com !== null && sem !== null && mf >= 90 ? com - sem : null,
      aj: ajustado(pro - contra, min, saldoTime),
      pro90: min ? (90 * pro) / min : null,
      contra90: min ? (90 * contra) / min : null,
      contraAj: ajustado(contra, min, time.contra90!),
      proAj: ajustado(pro, min, time.pro90!),
    };
  });
  const grupo = (fs: Funcao[]) =>
    linhas.filter((l) => fs.includes(l.funcao as Funcao) && l.min >= MIN_INDIVIDUAL).sort((a, b) => b.aj - a.aj);

  const pares = ds
    .map((d) => {
      const min = num(d.minutos) ?? 0, pro = num(d.pro) ?? 0, contra = num(d.contra) ?? 0;
      return { a: String(d.a), b: String(d.b), a_id: d.a_id, b_id: d.b_id, fa: d.fa, fb: d.fb, jogos: d.jogos, min, pro90: (90 * pro) / min, contra90: (90 * contra) / min,
        xaDupla: p90(d.xa_a, d.min_a) === null || p90(d.xa_b, d.min_b) === null ? null : p90(d.xa_a, d.min_a)! + p90(d.xa_b, d.min_b)!,
        xaCom: p90(d.xa_com, d.min_com), xaSem: p90(d.xa_sem, d.min_sem),
        saldo: (90 * (pro - contra)) / min, aj: ajustado(pro - contra, min, saldoTime) };
    })
    .sort((a, b) => b.aj - a.aj);

  function Filtros() {
    return (
      <form className="filtros">
        <label>Competição
          <select name="competicao" defaultValue={compId ?? ""}>
            <option value="">Todas</option>
            {competicoes.map((c) => <option key={c.id} value={c.id}>{comp(c.id)}</option>)}
          </select>
        </label>
        <label>Jogos
          <select name="grandes" defaultValue={r.grandes ? "1" : ""}>
            <option value="">Todos</option>
            <option value="1">Só grandes (mata-mata e clássicos)</option>
          </select>
        </label>
        <label>Duplas de
          <select name="setor" defaultValue={setor}>
            {Object.entries(SETORES).map(([k, s]) => <option key={k} value={k}>{s.nome}</option>)}
          </select>
        </label>
        <label>Mínimo juntos
          <select name="minimo" defaultValue={String(minimo)}>
            {MINIMOS.map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <button>Aplicar</button>
      </form>
    );
  }

  return (
    <>
      <h1>Escalação {ANO}: quem rende junto</h1>
      <p className="sub">
        Não existe “xG defensivo” de um jogador. O que dá para medir é o xG do Palmeiras, a favor e contra, nos minutos em
        que ele (ou a dupla) estava em campo, somando chute a chute pelo minuto. O saldo é xG a favor menos xG contra,
        por 90 minutos.
      </p>
      <Filtros />

      <div className="numeros">
        <div className="numero"><div className="v">{time.jogos}</div><div className="r">jogos no recorte</div></div>
        <div className="numero"><div className="v">{n(time.pro90, 2)}</div><div className="r">xG a favor por 90 (time)</div></div>
        <div className="numero"><div className="v">{n(time.contra90, 2)}</div><div className="r">xG contra por 90 (time)</div></div>
        <div className="numero"><div className="v"><Saldo v={saldoTime} /></div><div className="r">saldo por 90 (time)</div></div>
      </div>

      <details className="cartao" style={{ marginTop: 16 }}>
        <summary><strong>Como ler e por que desconfiar</strong></summary>
        <ul>
          <li>
            <strong>Ajustado</strong> soma {K_AJUSTE} minutos fictícios com a média do time antes de dividir. Quem jogou
            pouco fica perto da média; só se afasta quem sustentou a diferença por muito tempo. É por ele que as
            tabelas são ordenadas.
          </li>
          <li>
            <strong>Sem ele</strong> conta só jogos entre a primeira e a última vez que o jogador foi relacionado em {ANO}.
          </li>
          <li>
            Correlação, não causa. Os números misturam adversário, mando, placar (quem está ganhando recua) e rodízio:
            quem joga mais nos jogos fáceis parece melhor. Expulsões também entram na conta.
          </li>
          <li>
            Função = a mais frequente do jogador como titular, pela grade de posições do FotMob. Quem joga em mais de
            uma função aparece só na principal.
          </li>
          <li>Faltam os jogos sem xG (Copa do Brasil). xG é estimativa do FotMob, sem fonte para conferir.</li>
        </ul>
      </details>

      <h2>Duplas: {SETORES[setor].nome.toLowerCase()}</h2>
      <p className="aviso">
        Os dois em campo ao mesmo tempo, com pelo menos {minimo} minutos juntos. A função de cada um é a principal,
        mesmo que naquele jogo tenha atuado em outra. As colunas de xA do time contam jogos inteiros, porque o FotMob
        não diz em que minuto saiu cada passe; por isso não somam com as de xG, que são minuto a minuto. Toque ou passe
        o mouse no nome da coluna para ver o que ela mede.
      </p>
      {pares.length ? (
        <div className="tabela">
          <table>
            <thead>
              <tr><th>Dupla</th>
                {["Jogos", "Min. juntos", "xG pró/90", "xG contra/90", "Saldo/90"].map((c) => <Th key={c} rotulo={c} dica={DICA[c]} className="num" />)}
                <Th rotulo="Ajustado" dica={`Saldo/90 ajustado. ${AJ}`} className="num" />
                <Th rotulo="xA da dupla/90" dica={DICA["xA da dupla/90"]} className="num" />
                <Th rotulo="xA time/90 com" dica={DICA["xA time/jogo com"]} className="num" />
                <Th rotulo="sem" dica={DICA["sem (xA)"]} className="num" /></tr>
            </thead>
            <tbody>
              {pares.map((d) => (
                <tr key={`${d.a_id}-${d.b_id}`}>
                  <td>
                    <Link href={`/jogadores/${d.a_id}`}>{d.a}</Link> + <Link href={`/jogadores/${d.b_id}`}>{d.b}</Link>
                    {setor === "ataque" && <span className="aviso"> ({NOME_FUNCAO[d.fa as Funcao]}, {NOME_FUNCAO[d.fb as Funcao]})</span>}
                  </td>
                  <td className="num">{n(d.jogos)}</td>
                  <td className="num">{n(d.min)}</td>
                  <td className="num">{n(d.pro90, 2)}</td>
                  <td className="num">{n(d.contra90, 2)}</td>
                  <td className="num"><Saldo v={d.saldo} /></td>
                  <td className="num"><strong><Saldo v={d.aj} /></strong></td>
                  <td className="num">{n(d.xaDupla, 2)}</td>
                  <td className="num">{n(d.xaCom, 2)}</td>
                  <td className="num">{n(d.xaSem, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="aviso">Nenhuma dupla com {minimo} minutos juntos neste recorte. Diminua o mínimo.</p>
      )}

      <h2>Volantes</h2>
      <p className="aviso">
        Desarmes, interceptações, recuperações e duelos medem volume, não qualidade: time que passa mais tempo sem a bola
        acumula mais. Leia junto com o xG contra.
      </p>
      <Tabela
        linhas={grupo(["vol"])}
        cols={[
          ["Min.", (l) => n(l.min)],
          ["Saldo/90 com", (l) => <Saldo v={l.com} />],
          ["sem", (l) => <Saldo v={l.sem} />],
          ["Ajustado", (l) => <strong><Saldo v={l.aj} /></strong>, `Saldo/90 com ele, ajustado. ${AJ}`],
          ["xG contra/90 com", (l) => n(l.contra90, 2)],
          ["Desarmes + int./90", (l) => n(somaP90(l, ["desarmes", "interceptacoes"]), 1)],
          ["Recup./90", (l) => n(p90(l.recuperacoes, l.min_fm), 1)],
          ["Duelos", (l) => pctDe(l.duelos_ganhos, l.duelos_perdidos)],
          ["Passes certos", (l) => pctTot(l.passes_certos, l.passes)],
          ["Terço final/90", (l) => n(p90(l.passes_terco_final, l.min_fm), 1)],
          ["xA/90", (l) => n(p90(l.xa, l.min_fm), 2)],
        ]}
      />

      <h2>Defesa</h2>
      <p className="aviso">Aqui o número que importa é o xG contra com ele em campo (menor é melhor), ordenado pelo ajustado.</p>
      <Tabela
        linhas={[...grupo(["zag", "lat"])].sort((a, b) => a.contraAj - b.contraAj)}
        funcao
        cols={[
          ["Min.", (l) => n(l.min)],
          ["xG contra/90 com", (l) => n(l.contra90, 2)],
          ["sem", (l) => n(l.mf ? (90 * (num(l.contra_fora) ?? 0)) / l.mf : null, 2)],
          ["Ajustado", (l) => <strong>{n(l.contraAj, 2)}</strong>, `xG contra/90 com ele, ajustado (menor é melhor). ${AJ}`],
          ["Saldo/90 com", (l) => <Saldo v={l.com} />],
          ["Desarmes + int./90", (l) => n(somaP90(l, ["desarmes", "interceptacoes"]), 1)],
          ["Duelos", (l) => pctDe(l.duelos_ganhos, l.duelos_perdidos)],
          ["xA/90", (l) => n(p90(l.xa, l.min_fm), 2)],
        ]}
      />

      <h2>Ataque</h2>
      <p className="aviso">
        Produção própria (xG sem pênalti + xA, por 90) e o que o time produz com ele em campo. O primeiro mede o jogador;
        o segundo, o efeito no time.
      </p>
      <Tabela
        linhas={[...grupo(["meia", "ponta", "ata"])].sort((a, b) => b.proAj - a.proAj)}
        funcao
        cols={[
          ["Min.", (l) => n(l.min)],
          ["xG s/ pên./90", (l) => n(p90(l.npxg, l.min_fm), 2)],
          ["xA/90", (l) => n(p90(l.xa, l.min_fm), 2)],
          ["Soma/90", (l) => <strong>{n(somaP90(l, ["npxg", "xa"]), 2)}</strong>],
          ["Chances criadas/90", (l) => n(p90(l.chances_criadas, l.min_fm), 1)],
          ["xG pró/90 com", (l) => n(l.pro90, 2)],
          ["sem", (l) => n(l.mf ? (90 * (num(l.pro_fora) ?? 0)) / l.mf : null, 2)],
          ["Ajustado", (l) => <strong>{n(l.proAj, 2)}</strong>, `xG pró/90 com ele, ajustado. ${AJ}`],
          ["Saldo/90 com", (l) => <Saldo v={l.com} />],
        ]}
      />
      <p className="aviso">
        Só jogadores com pelo menos {MIN_INDIVIDUAL} minutos no recorte. Taxas por 90 do FotMob usam só os minutos de
        jogos em que o FotMob tem o jogador.
      </p>
    </>
  );
}

type LinhaJ = Record<string, unknown> & {
  id: unknown; nome: unknown; funcao: string | null; min: number; mf: number; com: number | null;
  sem: number | null; aj: number; pro90: number | null; contra90: number | null; contraAj: number; proAj: number;
};
type Linha = Record<string, unknown> & { id: unknown; nome: unknown; funcao: unknown; min: number };

function somaP90(l: Record<string, unknown>, ks: string[]) {
  const vs = ks.map((k) => num(l[k]));
  if (vs.some((v) => v === null)) return null;
  return p90(vs.reduce((a, b) => a! + b!, 0), l.min_fm);
}
function pctDe(g: unknown, p: unknown) {
  const a = num(g), b = num(p);
  return a === null || b === null || !(a + b) ? "–" : `${n((100 * a) / (a + b), 0)}%`;
}
function pctTot(c: unknown, t: unknown) {
  const a = num(c), b = num(t);
  return a === null || !b ? "–" : `${n((100 * a) / b, 0)}%`;
}

function Tabela<T extends Linha>({ linhas, cols, funcao }: {
  linhas: T[]; cols: [string, (l: T) => React.ReactNode, string?][]; funcao?: boolean;
}) {
  if (!linhas.length) return <p className="aviso">Ninguém com minutos suficientes neste recorte.</p>;
  return (
    <div className="tabela">
      <table>
        <thead><tr><th>Jogador</th>{cols.map(([c, , d]) => <Th key={c} rotulo={c} dica={d ?? DICA[c]} className="num" />)}</tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={String(l.id)}>
              <td>
                <Link href={`/jogadores/${l.id}`}>{String(l.nome)}</Link>
                {funcao && <span className="aviso"> {NOME_FUNCAO[l.funcao as Funcao]?.toLowerCase()}</span>}
                {l.min < 900 && <span className="aviso"> · &lt; 900 min</span>}
              </td>
              {cols.map(([c, f]) => <td key={c} className="num">{f(l)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
