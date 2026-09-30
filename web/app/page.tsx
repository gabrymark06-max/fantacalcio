import { Listone } from "@/components/Listone";
import { Probabili } from "@/components/Probabili";
import { giocatori, giornata, probabili } from "@/lib/data";
import { data, intervallo } from "@/lib/format";

export default function Home() {
  return (
    <>
      <section className="apertura">
        <p className="occhiello">
          Serie A {giornata.stagione.replace("-", "/")} · aggiornato il {data(giornata.aggiornato)}
        </p>
        <h1>
          Giornata {giornata.giornata}
          <span className="date">{intervallo(giornata.partite.map((p) => p.data))}</span>
        </h1>
        <p className="sottotitolo">
          Partita per partita le probabili formazioni, con la probabilità di giocare e il fantavoto
          atteso di ognuno. Sotto, il listone completo: in giallo i più schierabili di ogni reparto.
        </p>
      </section>

      <Probabili partite={giornata.partite} giocatori={giocatori} probabili={probabili} />

      <Listone giocatori={giocatori} />
    </>
  );
}
