import type { Metadata } from "next";

import { PaginaChiSchiero } from "@/components/Consigli";
import { giocatori, giornata } from "@/lib/data";

export const metadata: Metadata = { title: "Chi schiero? — Chi Schiero" };

export default function Pagina() {
  return (
    <>
      <section className="apertura">
        <p className="occhiello">La tua lega · giornata {giornata.giornata}</p>
        <h1>Chi schiero?</h1>
        <p className="sottotitolo">Due o tre giocatori della tua rosa a confronto: chi ha più probabilità di giocare e più punti attesi, con le regole della tua lega.</p>
      </section>
      <PaginaChiSchiero giocatori={giocatori} sdVoto={giornata.sd_voto} />
    </>
  );
}
