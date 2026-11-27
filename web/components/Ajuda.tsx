"use client";
import { useEffect, useRef, useState } from "react";

/** Cabeçalho de coluna com explicação: abre ao passar o mouse ou ao tocar (celular). */
export function Th({ rotulo, dica, className }: { rotulo: string; dica?: string; className?: string }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    if (!aberto || !ref.current) return;
    // fixed: a tabela tem overflow e cortaria um balão absoluto
    const r = ref.current.getBoundingClientRect();
    const larg = Math.min(260, window.innerWidth - 24);
    setPos({ left: Math.max(12, Math.min(r.left + r.width / 2 - larg / 2, window.innerWidth - larg - 12)), top: r.bottom + 6 });
    const fechar = () => setAberto(false);
    window.addEventListener("scroll", fechar, { passive: true, capture: true });
    const fora = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && setAberto(false);
    document.addEventListener("pointerdown", fora);
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("scroll", fechar, { capture: true });
    };
  }, [aberto]);
  if (!dica) return <th className={className}>{rotulo}</th>;
  return (
    <th className={`${className ?? ""} com-dica`} ref={ref}
      onPointerEnter={(e) => e.pointerType === "mouse" && setAberto(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setAberto(false)}>
      <button type="button" className="rotulo-dica" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        {rotulo}
      </button>
      {aberto && pos && <span role="tooltip" className="balao" style={pos}>{dica}</span>}
    </th>
  );
}
