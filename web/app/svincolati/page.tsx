import type { Metadata } from "next";

import { PaginaSvincolati } from "@/components/Consigli";
import { giocatori, giornata } from "@/lib/data";

export const metadata: Metadata = { title: "Svincolati da prendere — Chi Schiero" };

export default function Pagina() {
  return (
    <>
      <section className="apertura">
        <p className="occhiello">La tua lega · giornata {giornata.giornata}</p>
        <h1>Svincolati da prendere</h1>
        <p className="sottotitolo">I giocatori liberi nella tua lega che migliorano la tua formazione da qui a fine stagione, e chi tagliare per fargli posto.</p>
      </section>
      <PaginaSvincolati giocatori={giocatori} sdVoto={giornata.sd_voto} />
    </>
  );
}
