const TZ = "America/Sao_Paulo";

export function data(d: Date | string, comAno = true) {
  return new Date(d).toLocaleDateString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    ...(comAno ? { year: "numeric" } : {}),
  });
}

/** Número vindo do Postgres (int, bigint ou numeric) → number; null fica null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

/** NULL vira "–", nunca zero. */
export function n(v: unknown, casas = 0) {
  const x = num(v);
  if (x === null || Number.isNaN(x)) return "–";
  return x.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function pct(v: unknown) {
  const x = num(v);
  return x === null ? "–" : `${x.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function aproveitamento(v: unknown, e: unknown, jogos: unknown) {
  const j = num(jogos) ?? 0;
  if (!j) return null;
  return (100 * (3 * (num(v) ?? 0) + (num(e) ?? 0))) / (3 * j);
}

export const MANDO: Record<string, string> = { casa: "Casa", fora: "Fora", neutro: "Neutro" };

export const COMPETICAO_CURTA: Record<string, string> = {
  "bra.1": "Brasileirão",
  "bra.camp.paulista": "Paulistão",
  "bra.copa_do_brazil": "Copa do Brasil",
  "conmebol.libertadores": "Libertadores",
  "conmebol.recopa": "Recopa",
  "bra.supercopa_do_brazil": "Supercopa",
  "fifa.cwc": "Mundial",
  "club.friendly": "Amistoso",
};

export function comp(id: string) {
  return COMPETICAO_CURTA[id] ?? id;
}

/** Traduz a fase que vem em inglês da ESPN. */
export function fase(f: string | null) {
  if (!f) return "";
  const t: [RegExp, string][] = [
    [/^Finals?$/i, "Final"],
    [/Semi-?finals?/i, "Semifinal"],
    [/Quarter[- ]?finals?|Cuartos de Final/i, "Quartas de final"],
    [/Round of 16/i, "Oitavas de final"],
    [/Group Stage/i, "Fase de grupos"],
    [/Third Place/i, "Disputa de 3º lugar"],
    [/Third Round/i, "3ª fase"],
    [/Second Round/i, "2ª fase"],
    [/First Round/i, "1ª fase"],
    [/Regular Season|Temporada Regular/i, "Fase inicial"],
    [/Club Friendly/i, "Amistoso"],
  ];
  for (const [re, pt] of t) if (re.test(f)) return pt;
  return f.replace(/^Torneo Paulista \d{4} - /, "");
}

export const EVENTO: Record<string, string> = {
  gol: "⚽",
  penalti_convertido: "⚽ (pên.)",
  gol_contra: "⚽ (contra)",
  penalti_perdido: "❌ pênalti perdido",
  amarelo: "🟨",
  vermelho: "🟥",
  substituicao: "🔁",
  var: "📺 VAR",
};

const POSICOES: Record<string, string> = {
  Goalkeeper: "Goleiro",
  Defender: "Defensor",
  "Center Defender": "Zagueiro",
  "Center Left Defender": "Zagueiro (esq.)",
  "Center Right Defender": "Zagueiro (dir.)",
  Sweeper: "Líbero",
  "Left Back": "Lateral-esquerdo",
  "Right Back": "Lateral-direito",
  Midfielder: "Meio-campista",
  "Defensive Midfielder": "Volante",
  "Center Midfielder": "Meio-campista",
  "Center Left Midfielder": "Meia (esq.)",
  "Center Right Midfielder": "Meia (dir.)",
  "Left Midfielder": "Ala esquerdo",
  "Right Midfielder": "Ala direito",
  "Attacking Midfielder": "Meia-atacante",
  "Attacking Midfielder Left": "Meia-atacante (esq.)",
  "Attacking Midfielder Right": "Meia-atacante (dir.)",
  Forward: "Atacante",
  "Center Left Forward": "Atacante (esq.)",
  "Center Right Forward": "Atacante (dir.)",
  "Left Forward": "Ponta esquerda",
  "Right Forward": "Ponta direita",
  "Rear Center Forward": "Segundo atacante",
  Substitute: "",
};
export const posicao = (p: string | null) => (p ? POSICOES[p] ?? p : "");

const PAISES: Record<string, string> = {
  Brazil: "Brasil", Argentina: "Argentina", Paraguay: "Paraguai", Uruguay: "Uruguai", Colombia: "Colômbia",
  Chile: "Chile", Ecuador: "Equador", Venezuela: "Venezuela", Panama: "Panamá",
};
export const pais = (p: string | null) => (p ? PAISES[p] ?? p : "");
