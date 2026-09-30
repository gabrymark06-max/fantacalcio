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

        <h2>Le regole della tua lega</h2>
        <p>
          Il fantavoto di fantacalcio.it è voto + 3 per gol e rigore segnato, +1 per assist, −1 per gol
          subito, −2 per autorete, ±3 per rigore sbagliato o parato, −0,5 per ammonizione e −1 per
          espulsione: l&apos;abbiamo verificato su tutti i 55.000 voti dal 2021/22. Per questo prevediamo anche
          ogni voce separatamente (gol, assist, cartellini, gol subiti) e nella pagina della lega ricalcoliamo
          il fantavoto con i tuoi bonus. La probabilità di porta inviolata viene dai gol attesi
          dell&apos;avversario nelle quote; il modificatore difesa usa i voti puri previsti di portiere e
          difensori, con la loro variabilità reale.
        </p>

        <h2>Scambi</h2>
        <p>
          Conta il resto della stagione, non la prossima partita: per ogni giocatore usiamo probabilità di
          giocare e fantavoto contro un avversario medio. Il valore di uno scambio per te è quanto migliora la
          tua formazione migliore con le regole della lega, modificatore compreso, più un piccolo peso per le
          riserve.
        </p>
        <p>
          L&apos;altro fantallenatore però non vede il nostro modello: guarda il valore di mercato (FVM) e la sua
          squadra. Per questo proponiamo solo scambi in cui il valore di mercato che riceve è almeno pari a
          quello che cede (con i valori pesati per qualità: un campione vale più di due giocatori medi) e la sua
          formazione non peggiora in modo evidente. Il vantaggio per te nasce dove il nostro modello e il
          mercato non sono d&apos;accordo, o dove un giocatore vale di più nella tua rosa che nella sua. È lo
          stesso principio di strumenti come KeepTradeCut e il Trade Finder di FantasyPros.
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
            Foto dei giocatori: Wikimedia Commons, trovate tramite Wikidata, con licenze libere. Autore e licenza
            di ogni foto sono indicati sotto la formazione; chi non ha una foto libera è mostrato con le iniziali.
          </li>
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
