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
          Importa le rose e imposta le regole della tua lega: ti diciamo chi schierare questa giornata e
          quali scambi ti convengono e possono essere accettati.
        </p>
      </section>
      <Lega giocatori={giocatori} giornata={giornata.giornata} sdVoto={giornata.sd_voto} />
    </>
  );
}
