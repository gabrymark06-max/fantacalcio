import type { Metadata } from "next";

import { Pronostici } from "@/components/Pronostici";
import { giocatori, giornata, loghi, probabili, pronostici } from "@/lib/data";
import { intervallo } from "@/lib/format";

export const metadata: Metadata = { title: "Pronostici — Chi Schiero" };

export default function PaginaPronostici() {
  return (
    <>
      <section className="apertura">
        <p className="occhiello">Serie A · giornata {giornata.giornata} · {intervallo(giornata.partite.map((p) => p.data))}</p>
        <h1>Pronostici</h1>
        <p className="sottotitolo">
          Per ogni partita le probabilità di tutti i mercati con la quota equa, le quote dei bookmaker, le statistiche della
          stagione, la forma e i precedenti. In fondo, come finisce il campionato secondo 20.000 simulazioni.
        </p>
      </section>
      <Pronostici partite={giornata.partite} giocatori={giocatori} probabili={probabili} loghi={loghi} dati={pronostici} />
    </>
  );
}
