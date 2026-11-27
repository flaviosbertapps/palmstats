import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { aproveitamento, comp, data, MANDO, n, num } from "@/lib/format";
import { Numero, Placar, Res, type LinhaPartida } from "@/components/ui";
import { GraficoXg, type PontoXg } from "@/components/GraficoXg";

export const metadata: Metadata = {
  title: "Temporada 2026",
  description: "Análise da temporada 2026 do Palmeiras com gols esperados (xG) por jogo e por jogador.",
};
export const revalidate = 3600;

const ANO = 2026;
type Jogo = LinhaPartida & { xg_pro: number | null; xg_contra: number | null };

function sinal(v: number | null, casas = 1) {
  if (v === null) return "–";
  const s = n(Math.abs(v), casas);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

function Saldo({ v, casas = 1 }: { v: number | null; casas?: number }) {
  return <span className={v === null || Math.abs(v) < 0.05 ? "" : v > 0 ? "pos" : "neg"}>{sinal(v, casas)}</span>;
}

function resumo(js: Jogo[]) {
  const comXg = js.filter((j) => j.xg_pro !== null);
  const soma = (a: Jogo[], f: (j: Jogo) => number | null) => a.reduce((s, j) => s + (f(j) ?? 0), 0);
  const v = js.filter((j) => j.resultado === "V").length;
  const e = js.filter((j) => j.resultado === "E").length;
  return {
    jogos: js.length, v, e, d: js.length - v - e,
    aprov: aproveitamento(v, e, js.length),
    gp: soma(js, (j) => j.gols_pro), gc: soma(js, (j) => j.gols_contra),
    nXg: comXg.length,
    xgp: comXg.length ? soma(comXg, (j) => j.xg_pro) : null,
    xgc: comXg.length ? soma(comXg, (j) => j.xg_contra) : null,
    // Gols só dos jogos que têm xG, para a comparação ser justa.
    gpXg: soma(comXg, (j) => j.gols_pro), gcXg: soma(comXg, (j) => j.gols_contra),
  };
}

export default async function Temporada() {
  const [jogosRaw, jogadores] = await Promise.all([
    sql`
      select p.id, p.data, p.competicao_id, p.fase, p.mando, c.nome as adversario, p.adversario_id,
             p.gols_pro, p.gols_contra, p.penaltis_pro, p.penaltis_contra, p.resultado,
             x.xg_pro, x.xg_contra
      from partidas p
      join clubes c on c.id = p.adversario_id
      left join xg_partida x on x.partida_id = p.id
      where p.temporada = ${ANO} and p.encerrada
      order by p.data`,
    sql`
      with pen as (
        select partida_id, jogador_id, count(*) as n from eventos
        where tipo = 'penalti_convertido' and do_palmeiras and not disputa_penaltis
        group by 1, 2)
      select j.id, j.nome, j.posicao,
             count(*) filter (where x.jogou) as jogos,
             sum(x.minutos) filter (where x.jogou) as minutos,
             coalesce(sum(x.gols), 0) as gols,
             coalesce(sum(x.assistencias), 0) as assistencias,
             count(*) filter (where x.jogou and xp.xg_pro is not null) as jogos_xg,
             sum(x.minutos) filter (where x.jogou and xp.xg_pro is not null) as minutos_xg,
             coalesce(sum(x.gols) filter (where xp.xg_pro is not null), 0) as gols_xg,
             coalesce(sum(pen.n) filter (where xp.xg_pro is not null), 0) as penaltis_xg,
             coalesce(sum(x.assistencias) filter (where xp.xg_pro is not null), 0) as assist_xg,
             -- Linha do FotMob sem xG = jogou e não finalizou: vale zero. Sem linha nenhuma, fica NULL.
             sum(coalesce(g.xg, 0)) filter (where g.jogador_id is not null and xp.xg_pro is not null) as xg,
             sum(coalesce(g.xg_sem_penalti, 0)) filter (where g.jogador_id is not null and xp.xg_pro is not null) as npxg,
             sum(coalesce(g.xa, 0)) filter (where g.jogador_id is not null and xp.xg_pro is not null) as xa
      from participacoes x
      join partidas p on p.id = x.partida_id
      join jogadores j on j.id = x.jogador_id
      left join xg_partida xp on xp.partida_id = p.id
      left join xg_participacao g on g.partida_id = x.partida_id and g.jogador_id = x.jogador_id
      left join pen on pen.partida_id = x.partida_id and pen.jogador_id = x.jogador_id
      where p.temporada = ${ANO}
      group by j.id
      having count(*) filter (where x.jogou) > 0
      order by xg desc nulls last, jogos desc`,
  ]);

  const jogos: Jogo[] = jogosRaw.map((j) => ({
    ...(j as unknown as LinhaPartida),
    xg_pro: num(j.xg_pro), xg_contra: num(j.xg_contra),
  }));
  if (!jogos.length) {
    return (<><h1>Temporada {ANO}</h1><p className="sub">Ainda não há jogos encerrados de {ANO} no banco.</p></>);
  }

  const t = resumo(jogos);
  const comXg = jogos.filter((j) => j.xg_pro !== null);
  const semXg = jogos.filter((j) => j.xg_pro === null);
  const semXgComp = [...new Set(semXg.map((j) => comp(j.competicao_id)))];
  const porComp = [...new Set(jogos.map((j) => j.competicao_id))].map((c) => ({ c, ...resumo(jogos.filter((j) => j.competicao_id === c)) }));
  const porMando = ["casa", "fora", "neutro"].map((m) => ({ m, ...resumo(jogos.filter((j) => j.mando === m)) })).filter((r) => r.jogos);

  const dif = (j: Jogo) => (j.xg_pro ?? 0) - (j.xg_contra ?? 0);
  const LIMIAR = 0.5; // diferença de xG a partir da qual um lado "mereceu" mais
  const venceuPior = comXg.filter((j) => j.resultado === "V" && dif(j) < -LIMIAR);
  const naoVenceuMelhor = comXg.filter((j) => j.resultado !== "V" && dif(j) > LIMIAR);
  const xgVenceu = comXg.filter((j) => dif(j) > LIMIAR).length;
  const xgPerdeu = comXg.filter((j) => dif(j) < -LIMIAR).length;

  const pontos: PontoXg[] = comXg.map((j) => ({
    rotulo: data(j.data, false), jogo: `${j.adversario} ${j.gols_pro}–${j.gols_contra}`,
    pro: j.xg_pro!, contra: j.xg_contra!,
  }));
  const ultimos = (k: number) => resumo(comXg.slice(-k));
  const u10 = ultimos(10);

  const linhasJ = jogadores.filter((j) => num(j.xg) !== null && (num(j.minutos_xg) ?? 0) > 0);
  const por90 = (v: unknown, min: unknown) => {
    const x = num(v), m = num(min);
    return x === null || !m ? null : (90 * x) / m;
  };

  return (
    <>
      <h1>Temporada {ANO}</h1>
      <p className="sub">
        {t.jogos} jogos oficiais até {data(jogos[jogos.length - 1].data)}. O xG (gols esperados) mede a qualidade das
        chances: um chute com xG 0,30 vira gol 3 vezes em 10, em média. Ele vem do FotMob e cobre {t.nXg} desses
        jogos{semXg.length ? ` (faltam ${semXg.length}, de ${semXgComp.join(", ")}: a fonte não traz xG)` : ""}.
      </p>

      <div className="numeros">
        <Numero v={`${t.v}-${t.e}-${t.d}`} r="vitórias, empates, derrotas" />
        <Numero v={`${n(t.aprov, 1)}%`} r="aproveitamento" />
        <Numero v={`${t.gp}–${t.gc}`} r="gols pró e contra" />
        <Numero v={`${n(t.xgp, 1)}–${n(t.xgc, 1)}`} r={`xG pró e contra (${t.nXg} jogos)`} />
        <Numero v={<Saldo v={t.xgp === null ? null : t.gpXg - t.xgp} />} r="gols feitos acima do xG" />
        <Numero v={<Saldo v={t.xgc === null ? null : t.xgc - t.gcXg} />} r="gols sofridos abaixo do xG contra" />
      </div>
      <p className="aviso">
        Os dois saldos usam só os {t.nXg} jogos com xG. Positivo = melhor que o esperado. Saldo alto em uma temporada
        costuma ser parte qualidade de finalização (ou de goleiro) e parte sorte, e tende a diminuir com o tempo.
      </p>

      <h2>Jogo a jogo</h2>
      <GraficoXg pontos={pontos} />
      {u10.xgp !== null && (
        <p className="aviso">
          Últimos 10 jogos com xG: {n(u10.xgp / u10.nXg, 2)} a favor e {n(u10.xgc! / u10.nXg, 2)} contra por jogo, ante{" "}
          {n(t.xgp! / t.nXg, 2)} e {n(t.xgc! / t.nXg, 2)} na temporada.
        </p>
      )}

      <div className="grade">
        <div className="cartao">
          <h2>O placar contou a história?</h2>
          <p className="aviso">Conta como “dominou” quem teve pelo menos {n(LIMIAR, 1)} de xG a mais.</p>
          <ul className="lista">
            <li><span>Palmeiras dominou no xG</span><strong>{xgVenceu}</strong></li>
            <li><span>Adversário dominou no xG</span><strong>{xgPerdeu}</strong></li>
            <li><span>Equilibrado</span><strong>{comXg.length - xgVenceu - xgPerdeu}</strong></li>
            <li><span>Venceu sendo dominado</span><strong>{venceuPior.length}</strong></li>
            <li><span>Não venceu dominando</span><strong>{naoVenceuMelhor.length}</strong></li>
          </ul>
        </div>
        <div className="cartao">
          <h2>Venceu sendo dominado</h2>
          <ListaJogos js={venceuPior} />
        </div>
        <div className="cartao">
          <h2>Não venceu dominando</h2>
          <ListaJogos js={naoVenceuMelhor} />
        </div>
      </div>

      <h2>Por competição</h2>
      <TabelaResumo linhas={porComp.map((r) => ({ ...r, nome: comp(r.c) }))} />
      <h2>Por mando</h2>
      <TabelaResumo linhas={porMando.map((r) => ({ ...r, nome: MANDO[r.m] }))} />

      <h2>Jogadores</h2>
      <p className="sub">
        Só jogos com xG. “Gols − xG” positivo indica finalização acima do esperado. Pênaltis convertidos ficam fora de
        “Gols s/ pên.”, para comparar com o xG sem pênalti. Por 90 minutos com menos de 900 minutos aparece em cinza.
      </p>
      <div className="tabela">
        <table>
          <thead>
            <tr>
              <th>Jogador</th><th className="num">Jogos</th><th className="num">Min.</th>
              <th className="num">Gols</th><th className="num">xG</th><th className="num">Gols − xG</th>
              <th className="num">Gols s/ pên.</th><th className="num">xG s/ pên.</th><th className="num">xG s/ pên./90</th>
              <th className="num">Assist.</th><th className="num">xA</th><th className="num">xA/90</th>
            </tr>
          </thead>
          <tbody>
            {linhasJ.map((j) => {
              const pouco = (num(j.minutos_xg) ?? 0) < 900;
              const cl = pouco ? "num aviso" : "num";
              const npg = num(j.gols_xg)! - num(j.penaltis_xg)!;
              return (
                <tr key={j.id}>
                  <td><Link href={`/jogadores/${j.id}`}>{j.nome}</Link></td>
                  <td className="num">{n(j.jogos_xg)}</td>
                  <td className="num">{n(j.minutos_xg)}</td>
                  <td className="num">{n(j.gols_xg)}</td>
                  <td className="num">{n(j.xg, 2)}</td>
                  <td className="num"><Saldo v={num(j.gols_xg)! - num(j.xg)!} casas={2} /></td>
                  <td className="num">{n(npg)}</td>
                  <td className="num">{n(j.npxg, 2)}</td>
                  <td className={cl}>{n(por90(j.npxg, j.minutos_xg), 2)}</td>
                  <td className="num">{n(j.assist_xg)}</td>
                  <td className="num">{n(j.xa, 2)}</td>
                  <td className={cl}>{n(por90(j.xa, j.minutos_xg), 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Todos os jogos</h2>
      <div className="tabela">
        <table>
          <thead>
            <tr><th>Data</th><th>Competição</th><th>Adversário</th><th>Mando</th><th className="num">Placar</th><th></th>
              <th className="num">xG</th><th className="num">Saldo xG</th></tr>
          </thead>
          <tbody>
            {[...jogos].reverse().map((j) => (
              <tr key={String(j.id)}>
                <td><Link href={`/partidas/${j.id}`}>{data(j.data)}</Link></td>
                <td>{comp(j.competicao_id)}</td>
                <td>{j.adversario}</td>
                <td>{MANDO[j.mando] ?? j.mando}</td>
                <td className="num"><Link href={`/partidas/${j.id}`}><Placar p={j} /></Link></td>
                <td><Res r={j.resultado} /></td>
                <td className="num">{j.xg_pro === null ? "–" : `${n(j.xg_pro, 2)}–${n(j.xg_contra, 2)}`}</td>
                <td className="num"><Saldo v={j.xg_pro === null ? null : dif(j)} casas={2} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="aviso">
        xG é a estimativa do modelo do FotMob (dados Opta), não um fato do jogo, e não há outra fonte aberta para
        conferir. Outros sites usam modelos diferentes e chegam a números diferentes. Técnico, gols e assistências
        continuam vindo da ESPN e das conferências do PalmStats.
      </p>
    </>
  );
}

function ListaJogos({ js }: { js: Jogo[] }) {
  if (!js.length) return <p className="aviso">Nenhum.</p>;
  return (
    <ul className="lista">
      {js.map((j) => (
        <li key={String(j.id)}>
          <Link href={`/partidas/${j.id}`}>{data(j.data, false)} · {j.adversario} {j.gols_pro}–{j.gols_contra}</Link>
          <span>xG {n(j.xg_pro, 1)}–{n(j.xg_contra, 1)}</span>
        </li>
      ))}
    </ul>
  );
}

type Resumo = ReturnType<typeof resumo> & { nome: string };

function TabelaResumo({ linhas }: { linhas: Resumo[] }) {
  return (
    <div className="tabela">
      <table>
        <thead>
          <tr><th></th><th className="num">Jogos</th><th className="num">V-E-D</th><th className="num">Aprov.</th>
            <th className="num">Gols/jogo</th><th className="num">xG/jogo</th><th className="num">Sofridos/jogo</th>
            <th className="num">xG contra/jogo</th></tr>
        </thead>
        <tbody>
          {linhas.map((r) => (
            <tr key={r.nome}>
              <td>{r.nome}{r.jogos < 10 && <span className="aviso"> (amostra pequena)</span>}</td>
              <td className="num">{r.jogos}</td>
              <td className="num">{r.v}-{r.e}-{r.d}</td>
              <td className="num">{n(r.aprov, 1)}%</td>
              <td className="num">{n(r.gp / r.jogos, 2)}</td>
              <td className="num">{r.xgp === null ? "–" : n(r.xgp / r.nXg, 2)}</td>
              <td className="num">{n(r.gc / r.jogos, 2)}</td>
              <td className="num">{r.xgc === null ? "–" : n(r.xgc / r.nXg, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
