"use client";
import { useState } from "react";

export type PontoXg = { rotulo: string; jogo: string; pro: number; contra: number };

/** Média móvel de N jogos do xG pró e contra, com os valores de cada jogo como pontos claros. */
export function GraficoXg({ pontos, janela = 5 }: { pontos: PontoXg[]; janela?: number }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const L = 720, A = 240, m = { e: 30, d: 10, t: 10, b: 24 };
  const w = L - m.e - m.d, h = A - m.t - m.b;
  const max = Math.max(3, Math.ceil(Math.max(...pontos.flatMap((p) => [p.pro, p.contra]))));
  const x = (i: number) => m.e + (pontos.length < 2 ? w / 2 : (i * w) / (pontos.length - 1));
  const y = (v: number) => m.t + h - (v / max) * h;
  const movel = (k: "pro" | "contra") =>
    pontos.map((_, i) => {
      const s = pontos.slice(Math.max(0, i - janela + 1), i + 1);
      return s.reduce((a, p) => a + p[k], 0) / s.length;
    });
  const mp = movel("pro"), mc = movel("contra");
  const linha = (v: number[]) => v.map((y_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(y_).toFixed(1)}`).join("");
  const passo = pontos.length > 1 ? w / (pontos.length - 1) : w;
  const p = ativo !== null ? pontos[ativo] : null;

  return (
    <div className="grafico">
      <div className="legenda">
        <span><i style={{ background: "var(--serie-pro)" }} />xG a favor</span>
        <span><i style={{ background: "var(--serie-contra)" }} />xG contra</span>
        <span>linhas: média dos últimos {janela} jogos · pontos: cada jogo</span>
      </div>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="xG a favor e contra ao longo de 2026" onMouseLeave={() => setAtivo(null)}>
        {Array.from({ length: max + 1 }, (_, v) => (
          <g key={v}>
            <line className="eixo" x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} strokeWidth={v ? 0.5 : 1} />
            <text x={m.e - 6} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {pontos.map((pt, i) =>
          i % 10 === 0 ? <text key={i} x={x(i)} y={A - 6} textAnchor="middle">{pt.rotulo}</text> : null,
        )}
        {ativo !== null && <line className="eixo" x1={x(ativo)} x2={x(ativo)} y1={m.t} y2={m.t + h} strokeWidth={1} />}
        {pontos.map((pt, i) => (
          <g key={i} opacity={ativo === null || ativo === i ? 0.45 : 0.2}>
            <circle cx={x(i)} cy={y(pt.pro)} r={3} fill="var(--serie-pro)" />
            <circle cx={x(i)} cy={y(pt.contra)} r={3} fill="var(--serie-contra)" />
          </g>
        ))}
        <path d={linha(mp)} fill="none" stroke="var(--serie-pro)" strokeWidth={2} strokeLinejoin="round" />
        <path d={linha(mc)} fill="none" stroke="var(--serie-contra)" strokeWidth={2} strokeLinejoin="round" />
        {pontos.map((_, i) => (
          <rect key={i} x={x(i) - passo / 2} y={m.t} width={passo} height={h} fill="transparent" onMouseEnter={() => setAtivo(i)} onTouchStart={() => setAtivo(i)} />
        ))}
      </svg>
      {p && ativo !== null && (
        <div className="dica" style={{ left: `min(calc(${(x(ativo) / L) * 100}% + 8px), calc(100% - 210px))`, top: 40 }}>
          <strong>{p.rotulo}</strong> · {p.jogo}
          <br />xG {p.pro.toLocaleString("pt-BR")} × {p.contra.toLocaleString("pt-BR")}
          <br /><span className="aviso">média {janela} jogos: {mp[ativo].toFixed(2).replace(".", ",")} × {mc[ativo].toFixed(2).replace(".", ",")}</span>
        </div>
      )}
    </div>
  );
}
