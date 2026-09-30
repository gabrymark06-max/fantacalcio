import type { Metadata } from "next";

import { accuratezza, giornata } from "@/lib/data";
import { conSegno, due, voto } from "@/lib/format";

export const metadata: Metadata = { title: "Accuratezza — Chi Schiero" };

export default function AccuratezzaPage() {
  const { backtest, settimane } = accuratezza;
  return (
    <>
      <section className="apertura">
        <p className="occhiello">Numeri, non promesse</p>
        <h1>Quanto ci azzecchiamo</h1>
        <p className="sottotitolo">
          Ogni previsione viene salvata prima della giornata e confrontata con i voti veri dopo. E prima
          di pubblicare il modello l&apos;abbiamo messo alla prova sulle stagioni passate.
        </p>
      </section>

      <section className="scheda" aria-labelledby="settimane-titolo">
        <h2 id="settimane-titolo">Stagione in corso, giornata per giornata</h2>
        {settimane.length === 0 ? (
          <p className="vuoto">
            La prima giornata misurata sarà la {giornata.giornata}: i risultati compaiono qui dopo le
            partite.
          </p>
        ) : (
          <div className="tabella-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Giornata</th>
                  <th scope="col">Errore medio sul fantavoto</th>
                  <th scope="col">Errore con la fantamedia</th>
                  <th scope="col">I nostri 10 più schierabili</th>
                  <th scope="col">Dati per sicuri che hanno giocato</th>
                </tr>
              </thead>
              <tbody>
                {settimane.map((s) => (
                  <tr key={`${s.stagione}-${s.giornata}`}>
                    <th scope="row">{s.giornata}</th>
                    <td>{due(s.mae_modello)}</td>
                    <td>{due(s.mae_fantamedia)}</td>
                    <td>
                      fantavoto medio {voto(s.top10_fv_medio)}, {s.top10_hanno_giocato}/10 in campo (media di
                      tutti: {voto(s.fv_medio_tutti)})
                    </td>
                    <td>{s.sicuri_hanno_giocato == null ? "–" : `${Math.round(s.sicuri_hanno_giocato * 100)}% di ${s.sicuri}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="scheda" aria-labelledby="backtest-titolo">
        <h2 id="backtest-titolo">Prova sulle stagioni passate</h2>
        <p>
          Per ogni stagione il modello è stato allenato solo sugli anni precedenti, poi usato per
          scegliere la formazione di {backtest[0]?.rose_simulate ?? 300} rose di fantacalcio simulate
          (3 portieri, 8 difensori, 8 centrocampisti, 6 attaccanti presi tra i titolari abituali), una
          giornata alla volta. Lo confrontiamo con quello che farebbe un fantallenatore attento:
          schierare in base a fantamedia e presenze recenti.
        </p>
        <div className="tabella-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Stagione</th>
                <th scope="col">Punti a giornata: modello</th>
                <th scope="col">Con la fantamedia</th>
                <th scope="col">Differenza</th>
                <th scope="col">Chi gioca: errore (Brier)</th>
                <th scope="col">Ordine dei giocatori (Spearman)</th>
              </tr>
            </thead>
            <tbody>
              {backtest.map((b) => (
                <tr key={b.stagione}>
                  <th scope="row">{b.stagione.replace("-", "/")}</th>
                  <td>{due(b.punti_giornata_modello)}</td>
                  <td>{due(b.punti_giornata_baseline)}</td>
                  <td className="evidenziato-cella">{conSegno(b.punti_giornata_differenza)}</td>
                  <td>
                    {b.gioca_brier_modello.toFixed(3)} contro {b.gioca_brier_baseline.toFixed(3)}
                  </td>
                  <td>
                    {b.fv_spearman_modello.toFixed(2)} contro {b.fv_spearman_baseline.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Come leggerla</h3>
        <ul className="elenco">
          <li>
            Il modello fa meglio della fantamedia in ogni stagione, ma di poco: qualche decimo di punto a
            giornata, cioè circa 10 punti in un campionato.
          </li>
          <li>
            Il grosso del vantaggio sta nel sapere chi gioca. Nella stessa prova, conoscere in anticipo i
            giocatori in campo vale circa 2 punti a giornata. Per questo le previsioni della giornata usano
            anche le probabili formazioni, che nelle stagioni passate non avevamo: il loro effetto lo
            misuriamo settimana per settimana nella tabella qui sopra.
          </li>
          <li>
            Nessun modello indovina i gol: anche sapendo tutto di chi gioca, il fantavoto resta in gran
            parte imprevedibile. Diffida di chi promette di più.
          </li>
        </ul>
      </section>
    </>
  );
}
