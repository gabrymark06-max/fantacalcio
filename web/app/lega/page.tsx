import type { Metadata } from "next";

import { Lega } from "@/components/Lega";
import { giocatori, giornata } from "@/lib/data";

export const metadata: Metadata = { title: "La mia lega — Chi Schiero" };

export default function LegaPage() {
  return (
    <>
      <section className="apertura">
        <p className="occhiello">Formazione e scambi</p>
        <h1>La mia lega</h1>
        <p className="sottotitolo">
          Importa le rose: ti diciamo chi schierare questa giornata e quali scambi convengono a te e
          all&apos;altra squadra.
        </p>
      </section>
      <Lega giocatori={giocatori} giornata={giornata.giornata} />
    </>
  );
}
