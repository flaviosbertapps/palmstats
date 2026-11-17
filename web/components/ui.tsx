import Link from "next/link";
import { comp, data, fase, MANDO } from "@/lib/format";

export function Res({ r }: { r: string | null }) {
  if (!r) return <span className="res E">–</span>;
  return <span className={`res ${r}`}>{r}</span>;
}

export type LinhaPartida = {
  id: number | string;
  data: Date;
  competicao_id: string;
  fase: string | null;
  mando: string;
  adversario: string;
  adversario_id?: number | string;
  gols_pro: number | null;
  gols_contra: number | null;
  penaltis_pro: number | null;
  penaltis_contra: number | null;
  resultado: string | null;
};

export function Placar({ p }: { p: LinhaPartida }) {
  const pen = p.penaltis_pro !== null ? ` (${p.penaltis_pro}–${p.penaltis_contra} pên.)` : "";
  return (
    <>
      {p.gols_pro ?? "–"}–{p.gols_contra ?? "–"}
      {pen && <span className="aviso">{pen}</span>}
    </>
  );
}

export function TabelaPartidas({ partidas, extra }: { partidas: LinhaPartida[]; extra?: (p: LinhaPartida) => React.ReactNode }) {
  return (
    <div className="tabela">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Competição</th>
            <th>Adversário</th>
            <th>Mando</th>
            <th className="num">Placar</th>
            <th></th>
            {extra && <th className="num">Jogador</th>}
          </tr>
        </thead>
        <tbody>
          {partidas.map((p) => (
            <tr key={String(p.id)}>
              <td><Link href={`/partidas/${p.id}`}>{data(p.data)}</Link></td>
              <td>
                {comp(p.competicao_id)}
                {p.fase && <span className="aviso"> · {fase(p.fase)}</span>}
              </td>
              <td>
                {p.adversario_id ? <Link href={`/adversarios/${p.adversario_id}`}>{p.adversario}</Link> : p.adversario}
              </td>
              <td>{MANDO[p.mando] ?? p.mando}</td>
              <td className="num"><Link href={`/partidas/${p.id}`}><Placar p={p} /></Link></td>
              <td><Res r={p.resultado} /></td>
              {extra && <td className="num">{extra(p)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Numero({ v, r }: { v: React.ReactNode; r: string }) {
  return (
    <div className="numero">
      <div className="v">{v}</div>
      <div className="r">{r}</div>
    </div>
  );
}
