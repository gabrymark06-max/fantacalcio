import type { Metadata } from "next";

import { PaginaScambi } from "@/components/Scambi";
import { giocatori, giornata } from "@/lib/data";

export const metadata: Metadata = { title: "Scambi — Chi Schiero" };

export default function ScambiPage() {
  return (
    <>
      <section className="apertura">
        <p className="occhiello">La tua lega</p>
        <h1>Scambi</h1>
        <p className="sottotitolo">
          Scambi che alzano i punti della tua formazione da qui a fine stagione e che l&apos;altra squadra ha
          motivo di accettare. Oppure valuta tu quello che hai in mente.
        </p>
      </section>
      <PaginaScambi giocatori={giocatori} giornata={giornata.giornata} sdVoto={giornata.sd_voto} />
    </>
  );
}
