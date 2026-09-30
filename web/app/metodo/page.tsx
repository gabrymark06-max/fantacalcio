import type { Metadata } from "next";

export const metadata: Metadata = { title: "Metodo e fonti — Chi Schiero" };

export default function MetodoPage() {
  return (
    <>
      <section className="apertura">
        <p className="occhiello">Come funziona</p>
        <h1>Metodo e fonti</h1>
      </section>

      <section className="scheda testo">
        <h2>Cosa prevediamo</h2>
        <p>Per ogni giocatore del listone, prima di ogni giornata:</p>
        <ul className="elenco">
          <li>
            <strong>Probabilità di giocare</strong>: che prenda un voto. Unisce lo storico del giocatore
            (presenze e partenze da titolare recenti) con le percentuali di titolarità delle probabili
            formazioni. Chi non compare nelle probabili formazioni della sua squadra è quasi sempre
            indisponibile.
          </li>
          <li>
            <strong>Fantavoto se gioca</strong>: il fantavoto medio atteso, bonus e malus compresi.
            Dipende dalla forma recente, dallo storico degli ultimi anni, dal ruolo e dalla partita: gol
            attesi della squadra e dell&apos;avversario ricavati dalle quote, casa o trasferta.
          </li>
          <li>
            <strong>Probabilità di bonus</strong>: che segni (anche su rigore) o faccia assist.
          </li>
        </ul>
        <p>
          La <strong>schierabilità</strong> mette insieme le prime due: se il titolare non gioca entra un
          compagno dalla panchina, che vale in media circa 5,5. La formazione consigliata sceglie, tra i
          moduli ammessi, quella con la schierabilità totale più alta.
        </p>

        <h2>Scambi</h2>
        <p>
          Per gli scambi conta il resto della stagione, non la prossima partita: usiamo probabilità di
          giocare e fantavoto contro un avversario medio. Il valore di uno scambio per una squadra è quanto
          migliora la sua formazione migliore, più un piccolo peso per le riserve che coprono infortuni e
          turnover. Un giocatore forte vale poco a chi lo terrebbe in panchina: per questo esistono scambi
          che convengono a entrambi.
        </p>

        <h2>Il modello</h2>
        <p>
          Tre modelli a gradient boosting allenati su tutte le partite di Serie A dal 2021/22: circa 84.000
          righe giocatore-giornata, di cui 55.000 con voto. Ogni caratteristica usa solo partite precedenti
          a quella da prevedere. I risultati della prova sulle stagioni passate sono nella pagina{" "}
          <a href="/accuratezza">Accuratezza</a>.
        </p>

        <h2 id="fonti">Fonti dei dati</h2>
        <ul className="elenco">
          <li>Voti, fantavoti, bonus e malus, listone e calendario: fantacalcio.it.</li>
          <li>Risultati e quote medie dei bookmaker: football-data.co.uk.</li>
          <li>Probabilità di titolarità della giornata: SOS Fanta.</li>
          <li>
            Parte della raccolta dati è adattata da FantaDraft (github.com/lucianomurr/FantaDraft), progetto
            open source con licenza MIT.
          </li>
        </ul>
        <p>
          Qui non ripubblichiamo i voti delle fonti: mostriamo solo le nostre elaborazioni. Chi Schiero non
          è affiliato a nessuna delle fonti né a Lega Serie A. Sono previsioni statistiche, non consigli di
          scommessa.
        </p>
      </section>
    </>
  );
}
