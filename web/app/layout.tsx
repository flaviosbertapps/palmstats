import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PalmStats", template: "%s · PalmStats" },
  description: "Estatísticas do Palmeiras desde 2015: jogos, jogadores, adversários e curiosidades.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo">
          <div className="linha">
            <Link href="/" className="marca">PalmStats</Link>
            <nav>
              <Link href="/explorar">Explorar</Link>
              <Link href="/aproveitamento">Aproveitamento</Link>
              <Link href="/partidas">Partidas</Link>
              <Link href="/jogadores">Jogadores</Link>
              <Link href="/tecnicos">Técnicos</Link>
              <Link href="/curiosidades">Curiosidades</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer>
          Projeto de torcedor, sem fins comerciais e sem vínculo com a S.E. Palmeiras. Dados: ESPN e Wikidata,
          desde 2015. Minutos são regulamentares, sem acréscimos. “–” significa que a fonte não traz o dado.
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
