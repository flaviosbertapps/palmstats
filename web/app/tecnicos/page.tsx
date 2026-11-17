import type { Metadata } from "next";
import { sql } from "@/lib/db";
import { data, n } from "@/lib/format";

export const metadata: Metadata = { title: "Técnicos" };
export const revalidate = 3600;

export default async function Tecnicos() {
  const [tecnicos, passagens] = await Promise.all([
    sql`select * from v_tecnicos where jogos > 0 order by jogos desc`,
    sql`
      select t.nome, pt.inicio, pt.fim, pt.interino,
             (select count(*) from partidas p where p.tecnico_id = t.id
                and (p.data at time zone 'America/Sao_Paulo')::date between pt.inicio and coalesce(pt.fim, '2999-01-01')) as jogos
      from passagens_tecnico pt join tecnicos t on t.id = pt.tecnico_id
      order by pt.inicio desc`,
  ]);

  return (
    <>
      <h1>Técnicos</h1>
      <p className="sub">
        Técnico efetivo de cada jogo. Quando o titular cumpre suspensão e um auxiliar comanda, o jogo continua contando
        para o titular.
      </p>
      <div className="tabela">
        <table>
          <thead>
            <tr><th>Técnico</th><th className="num">Jogos</th><th className="num">V</th><th className="num">E</th>
              <th className="num">D</th><th className="num">Aproveitamento</th><th style={{ width: "30%" }}></th></tr>
          </thead>
          <tbody>
            {tecnicos.map((t) => (
              <tr key={t.id}>
                <td>{t.nome}</td>
                <td className="num">{n(t.jogos)}</td><td className="num">{n(t.vitorias)}</td>
                <td className="num">{n(t.empates)}</td><td className="num">{n(t.derrotas)}</td>
                <td className="num"><strong>{n(t.aproveitamento, 1)}%</strong></td>
                <td><div className="barra"><span style={{ width: `${Number(t.aproveitamento)}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Passagens</h2>
      <div className="tabela">
        <table>
          <thead><tr><th>Técnico</th><th>Início</th><th>Fim</th><th className="num">Jogos</th></tr></thead>
          <tbody>
            {passagens.map((p) => (
              <tr key={`${p.nome}-${p.inicio}`}>
                <td>{p.nome}{p.interino && <span className="aviso"> (interino)</span>}</td>
                <td>{data(p.inicio)}</td>
                <td>{p.fim ? data(p.fim) : "atual"}</td>
                <td className="num">{n(p.jogos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="aviso">Algumas datas de troca são aproximadas e estão sendo conferidas.</p>
    </>
  );
}
