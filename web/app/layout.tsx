import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Saira_Extra_Condensed } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const display = Saira_Extra_Condensed({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Chi Schiero — previsioni del fantavoto giornata per giornata",
  description:
    "Probabilità di giocare e fantavoto atteso per ogni giocatore di Serie A, formazione consigliata per la tua rosa e scambi che convengono a entrambe le squadre.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <header className="testata">
          <Link href="/" className="marchio">
            Chi <span className="evidenziato">Schiero</span>
          </Link>
          <nav aria-label="Sezioni">
            <Link href="/">Giornata</Link>
            <Link href="/lega">La mia lega</Link>
            <Link href="/chi-schiero">Chi schiero</Link>
            <Link href="/svincolati">Svincolati</Link>
            <Link href="/scambi">Scambi</Link>
            <Link href="/accuratezza">Accuratezza</Link>
            <Link href="/metodo">Metodo</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="piede">
          Previsioni statistiche, non consigli di scommessa. Non affiliato a Lega Serie A né a
          fantacalcio.it. <Link href="/metodo#fonti">Fonti dei dati</Link>
        </footer>
      </body>
    </html>
  );
}
