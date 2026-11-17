import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inteiro, sql } from "@/lib/db";
import { comp, data, EVENTO, fase, MANDO, n, posicao } from "@/lib/format";
import { Res } from "@/components/ui";

export const revalidate = 3600;

type Params = Promise<{ id: string }>;

async function partida(id: number) {
  const [p] = await sql`
    select v.*, c.id as adversario_id, c.escudo_url
    from v_partidas v join partidas p on p.id = v.id join clubes c on c.id = p.adversario_id
    where v.id = ${id}`;
  return p;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = inteiro((await params).id);
  const p = id ? await partida(id) : null;
  return { title: p ? `Palmeiras ${p.gols_pro}–${p.gols_contra} ${p.adversario} (${data(p.data)})` : "Partida" };
}

const STATS: [string, string, boolean?][] = [
  ["posse", "Posse de bola (%)", true],
  ["finalizacoes", "Finalizações"],
  ["finalizacoes_no_alvo", "No alvo"],
  ["passes", "Passes"],
  ["passes_certos", "Passes certos"],
  ["cruzamentos", "Cruzamentos"],
  ["desarmes", "Desarmes"],
  ["interceptacoes", "Interceptações"],
  ["escanteios", "Escanteios"],
  ["faltas", "Faltas"],
  ["impedimentos", "Impedimentos"],
  ["defesas", "Defesas do goleiro"],
];

export default async function Partida({ params }: { params: Params }) {
  const id = inteiro((await params).id);
  if (!id) notFound();
  const p = await partida(id);
  if (!p) notFound();

  const [elenco, eventos, stats] = await Promise.all([
    sql`
      select j.id, j.nome, x.*
      from participacoes x join jogadores j on j.id = x.jogador_id
      where x.partida_id = ${id}
      order by x.titular desc, x.jogou desc, x.minuto_entrada nulls last, x.camisa nulls last`,
    sql`
      select e.* from eventos e
      where e.partida_id = ${id} and e.tipo <> 'var'
      order by e.disputa_penaltis, e.periodo nulls last, e.minuto nulls last, e.acrescimo nulls first, e.id`,
    sql`select * from estatisticas_time where partida_id = ${id}`,
  ]);
  const pro = stats.find((s) => s.lado === "pro");
  const contra = stats.find((s) => s.lado === "contra");
  const titulares = elenco.filter((x) => x.titular);
  const reservas = elenco.filter((x) => !x.titular && x.jogou);
  const naoEntraram = elenco.filter((x) => !x.titular && !x.jogou);
  const gols = eventos.filter((e) => ["gol", "penalti_convertido", "gol_contra"].includes(e.tipo) && !e.disputa_penaltis);

  const linhaJogador = (x: (typeof elenco)[number]) => (
    <tr key={x.id}>
      <td className="num aviso">{x.camisa ?? ""}</td>
      <td><Link href={`/jogadores/${x.id}`}>{x.nome}</Link></td>
      <td className="aviso">{posicao(x.posicao)}</td>
      <td className="num">
        {x.titular ? "" : x.minuto_entrada !== null ? `${x.minuto_entrada}'` : ""}
        {x.minuto_saida !== null && x.minuto_saida < 90 ? ` → ${x.minuto_saida}'` : ""}
      </td>
      <td className="num">{n(x.minutos)}</td>
      <td className="num">{x.gols ? "⚽".repeat(x.gols) : ""}</td>
      <td className="num">{x.assistencias ? "🅰️".repeat(x.assistencias) : ""}</td>
      <td className="num">{n(x.finalizacoes)}</td>
      <td className="num">{x.vermelhos ? "🟥" : x.amarelos ? "🟨" : ""}</td>
    </tr>
  );

  return (
    <>
      <p className="sub">
        {data(p.data)} · {comp(p.competicao_id)}{p.fase ? ` · ${fase(p.fase)}` : ""} · {MANDO[p.mando]}
      </p>
      <div className="placar-grande">
        <span>Palmeiras</span>
        <span className="gols">{p.gols_pro}–{p.gols_contra}</span>
        <Link href={`/adversarios/${p.adversario_id}`}>{p.adversario}</Link>
        <Res r={p.resultado} />
      </div>
      {p.penaltis_pro !== null && <p>Pênaltis: {p.penaltis_pro}–{p.penaltis_contra}</p>}
      <p className="sub">
        {[p.estadio, p.publico ? `${n(p.publico)} pagantes` : null, p.arbitro ? `Árbitro: ${p.arbitro}` : null,
          p.tecnico ? `Técnico: ${p.tecnico}` : null].filter(Boolean).join(" · ")}
      </p>

      {gols.length > 0 && (
        <div className="cartao">
          <ul className="lista">
            {gols.map((e) => (
              <li key={e.id}>
                <span>
                  {e.minuto}'{e.acrescimo ? `+${e.acrescimo}` : ""} {EVENTO[e.tipo]}{" "}
                  {e.jogador_id ? <Link href={`/jogadores/${e.jogador_id}`}>{e.jogador_nome}</Link> : e.jogador_nome}
                  {e.tipo === "gol" && e.jogador2_nome && <span className="aviso"> (assist. {e.jogador2_nome})</span>}
                </span>
                <strong>{e.do_palmeiras ? "Palmeiras" : p.adversario}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>Escalação</h2>
      {elenco.length === 0 ? (
        <p className="aviso">A fonte não traz a escalação deste jogo.</p>
      ) : (
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th className="num">#</th><th>Jogador</th><th>Posição</th><th className="num">Entrou/saiu</th>
                <th className="num">Min</th><th className="num">G</th><th className="num">A</th>
                <th className="num">Chutes</th><th className="num">Cartão</th>
              </tr>
            </thead>
            <tbody>
              {titulares.map(linhaJogador)}
              {reservas.length > 0 && <tr><th colSpan={9}>Entraram</th></tr>}
              {reservas.map(linhaJogador)}
            </tbody>
          </table>
        </div>
      )}
      {naoEntraram.length > 0 && (
        <p className="aviso">No banco: {naoEntraram.map((x) => x.nome).join(", ")}.</p>
      )}

      {pro && (
        <>
          <h2>Estatísticas</h2>
          <div className="tabela">
            <table>
              <thead><tr><th className="num">Palmeiras</th><th style={{ textAlign: "center" }}></th><th>{p.adversario}</th></tr></thead>
              <tbody>
                {STATS.map(([k, rot, dec]) => (
                  <tr key={k}>
                    <td className="num"><strong>{n(pro[k], dec ? 1 : 0)}</strong></td>
                    <td style={{ textAlign: "center" }} className="aviso">{rot}</td>
                    <td>{n(contra?.[k], dec ? 1 : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Linha do tempo</h2>
      <div className="cartao">
        <ul className="lista">
          {eventos.filter((e) => e.tipo !== "substituicao" || e.do_palmeiras).map((e) => (
            <li key={e.id}>
              <span>
                {e.disputa_penaltis ? "Pên." : `${e.minuto ?? ""}'${e.acrescimo ? `+${e.acrescimo}` : ""}`}{" "}
                {EVENTO[e.tipo] ?? e.tipo_fonte}{" "}
                {e.tipo === "substituicao"
                  ? <>entra {e.jogador_nome}, sai {e.jogador2_nome}</>
                  : e.jogador_nome}
              </span>
              <span className="aviso">{e.do_palmeiras ? "Palmeiras" : p.adversario}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
