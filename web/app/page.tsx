import { Listone } from "@/components/Listone";
import { giocatori, giornata } from "@/lib/data";
import { data, intervallo, pct } from "@/lib/format";

export default function Home() {
  const quote = giornata.partite.some((p) => p.fonte_contesto === "quote");
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
          Per ognuno dei {giocatori.length} del listone: quanto è probabile che prenda voto e che
          fantavoto aspettarsi. In giallo i più schierabili di ogni reparto.
        </p>
      </section>

      <section aria-labelledby="partite-titolo" className="partite">
        <h2 id="partite-titolo" className="etichetta">
          Le partite {quote ? "· probabilità dalle quote" : "· probabilità stimate dalla forza delle squadre"}
        </h2>
        <ul>
          {giornata.partite.map((p) => (
            <li key={`${p.casa}-${p.trasferta}`}>
              <span className="squadre">
                {p.casa} – {p.trasferta}
              </span>
              <span className="quando">
                {data(p.data)} {p.ora}
              </span>
              <span className="esiti" title="Probabilità di 1, X, 2">
                {pct(p.p1)} · {pct(p.px)} · {pct(p.p2)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Listone giocatori={giocatori} />
    </>
  );
}
