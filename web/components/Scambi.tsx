"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { roseDellaLega, useLega } from "@/components/legaStore";
import { conSegno, due, voto } from "@/lib/format";
import { punteggio, type Contesto } from "@/lib/lineup";
import { contestoStagione, etichettaAccetta, suggerisciScambi, valutaScambio, type Scambio } from "@/lib/trades";
import { NOMI_RUOLO, type Giocatore, type Ruolo } from "@/lib/types";

interface Props {
  giocatori: Giocatore[];
  giornata: number;
  sdVoto: Record<Ruolo, number>;
}

export function PaginaScambi({ giocatori, giornata, sdVoto }: Props) {
  const perId = useMemo(() => new Map(giocatori.map((g) => [g.id, g])), [giocatori]);
  const { lega, aggiorna, caricata } = useLega(giocatori);
  if (!caricata) return null;
  if (!lega) {
    return (
      <section className="scheda">
        <p className="vuoto">
          Per cercare scambi serve la tua lega. <Link href="/lega">Importala nella pagina La mia lega</Link>: basta un
          clic da Leghe Fantacalcio.
        </p>
      </section>
    );
  }
  const { mia, altre } = roseDellaLega(lega, perId);
  const ctx: Contesto = { regole: lega.regole, orizzonte: "giornata", sdVoto };
  return (
    <>
      <section className="scheda">
        <label>
          <span>La mia squadra</span>
          <select value={lega.mia ?? ""} onChange={(e) => aggiorna({ ...lega, mia: e.target.value || null })}>
            <option value="">Scegli…</option>
            {lega.squadre.map((s) => (
              <option key={s.nome}>{s.nome}</option>
            ))}
          </select>
        </label>
        <p className="nota-piccola">
          Regole e ruoli sono quelli impostati in <Link href="/lega">La mia lega</Link>.
        </p>
      </section>
      {mia ? (
        <Scambi
          key={JSON.stringify(lega.regole) + lega.mia + String(!!lega.usaRuoliLega)}
          mia={mia}
          altre={altre}
          ctx={ctx}
          giornateRimanenti={Math.max(1, 38 - giornata + 1)}
        />
      ) : (
        <p className="vuoto">Scegli la tua squadra per cercare scambi.</p>
      )}
    </>
  );
}

// ---------- Proposte e valutazione ----------

function NomiConRuolo({ giocatori }: { giocatori: Giocatore[] }) {
  return (
    <>
      {giocatori.map((g, i) => (
        <span key={g.id} className="nome-ruolo">
          {i > 0 && " + "}
          <span className={`ruolo ruolo-${g.ruolo}`} title={NOMI_RUOLO[g.ruolo]}>
            {g.ruolo}
          </span>{" "}
          <strong>{g.nome}</strong>
        </span>
      ))}
    </>
  );
}

function PropostaScambio({ s, giornateRimanenti }: { s: Scambio; giornateRimanenti: number }) {
  const etichetta = etichettaAccetta(s.pAccetta);
  const diffMercato = Math.round((s.equita - 1) * 100);
  return (
    <li>
      <span>
        Cedi <NomiConRuolo giocatori={s.cedo} /> a {s.controparte}, ricevi <NomiConRuolo giocatori={s.ricevo} />
      </span>
      <span className="delta">
        tu {conSegno(s.deltaMio)} a giornata (circa {conSegno(s.deltaMio * giornateRimanenti).replace(/,\d+$/, "")} punti a
        fine stagione) · accettazione <span className={`accetta accetta-${etichetta}`}>{etichetta}</span>
      </span>
      <span className="motivo">
        {s.entranoTitolari.length > 0 && (
          <>
            Per te: {s.entranoTitolari.map((g) => g.nome).join(", ")} {s.entranoTitolari.length > 1 ? "entrano" : "entra"} tra i
            titolari{s.esconoTitolari.length > 0 && ` al posto di ${s.esconoTitolari.map((g) => g.nome).join(", ")}`}.{" "}
          </>
        )}
        Per {s.controparte}: valore di mercato {s.fvmRicevono} contro {s.fvmCedono}
        {diffMercato !== 0 && ` (${diffMercato > 0 ? "+" : ""}${diffMercato}% per loro, con valori pesati per qualità)`}, formazione{" "}
        {s.deltaLoro >= 0.005 ? `migliore di ${due(s.deltaLoro)}` : s.deltaLoro <= -0.005 ? `peggiore di ${due(-s.deltaLoro)}` : "invariata"} a
        giornata.
      </span>
    </li>
  );
}

function Scambi({
  mia,
  altre,
  ctx,
  giornateRimanenti,
}: {
  mia: Giocatore[];
  altre: { nome: string; rosa: Giocatore[] }[];
  ctx: Contesto;
  giornateRimanenti: number;
}) {
  const [suggeriti, setSuggeriti] = useState<Scambio[] | null>(null);
  const [calcolo, setCalcolo] = useState(false);
  const [controparte, setControparte] = useState(altre[0]?.nome ?? "");
  const [cedo, setCedo] = useState<number[]>([]);
  const [ricevo, setRicevo] = useState<number[]>([]);

  const loro = altre.find((a) => a.nome === controparte)?.rosa ?? [];
  const cedoG = mia.filter((g) => cedo.includes(g.id));
  const ricevoG = loro.filter((g) => ricevo.includes(g.id));
  const ruoliUguali =
    cedoG.length > 0 && cedoG.map((g) => g.ruolo).sort().join() === ricevoG.map((g) => g.ruolo).sort().join();
  const ctxStagione = useMemo(() => contestoStagione(ctx, [mia, loro]), [ctx, mia, loro]);
  const valutato = ruoliUguali ? valutaScambio(mia, loro, cedoG, ricevoG, controparte, ctxStagione) : null;

  const cerca = () => {
    setCalcolo(true);
    // lascia al browser il tempo di mostrare "Sto cercando…" prima del calcolo
    setTimeout(() => {
      setSuggeriti(suggerisciScambi(mia, altre, ctx));
      setCalcolo(false);
    }, 20);
  };

  const scegli = (lista: number[], set: (x: number[]) => void, id: number) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const valoreStag = (g: Giocatore) => punteggio(g, ctxStagione);

  return (
    <section className="scheda" aria-labelledby="scambi-titolo">
      <h2 id="scambi-titolo">Proposte di scambio</h2>
      <p>
        Cerchiamo scambi 1 contro 1 e 2 contro 2 a ruoli invariati che alzano i punti attesi della tua
        formazione da qui a fine stagione, con le regole della tua lega. Ne proponiamo solo se reggono anche
        agli occhi dell&apos;altro: il valore di mercato che riceve (FVM) è almeno pari a quello che cede e la sua
        formazione non peggiora in modo evidente.
      </p>
      <button type="button" onClick={cerca} disabled={calcolo || altre.length === 0}>
        {calcolo ? "Sto cercando…" : "Cerca scambi"}
      </button>
      {suggeriti &&
        (suggeriti.length === 0 ? (
          <p className="vuoto">
            Nessuno scambio ti fa guadagnare almeno 0,15 punti a giornata restando accettabile per l&apos;altro.
            Prova a valutarne uno a mano qui sotto.
          </p>
        ) : (
          <ol className="scambi">
            {suggeriti.map((s, i) => (
              <PropostaScambio key={i} s={s} giornateRimanenti={giornateRimanenti} />
            ))}
          </ol>
        ))}

      <h3>Valuta uno scambio</h3>
      <label>
        <span>Con</span>
        <select
          value={controparte}
          onChange={(e) => {
            setControparte(e.target.value);
            setRicevo([]);
          }}
        >
          {altre.map((a) => (
            <option key={a.nome}>{a.nome}</option>
          ))}
        </select>
      </label>
      <div className="due-colonne">
        <fieldset>
          <legend>Cedo</legend>
          {mia.map((g) => (
            <label key={g.id} className="spunta">
              <input type="checkbox" checked={cedo.includes(g.id)} onChange={() => scegli(cedo, setCedo, g.id)} />
              <span className={`ruolo ruolo-${g.ruolo}`}>{g.ruolo}</span> {g.nome}
              <span className="valore-stagione">{voto(valoreStag(g))}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Ricevo</legend>
          {loro.map((g) => (
            <label key={g.id} className="spunta">
              <input type="checkbox" checked={ricevo.includes(g.id)} onChange={() => scegli(ricevo, setRicevo, g.id)} />
              <span className={`ruolo ruolo-${g.ruolo}`}>{g.ruolo}</span> {g.nome}
              <span className="valore-stagione">{voto(valoreStag(g))}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <p className="nota-piccola">Accanto a ogni nome: punti attesi a giornata da qui a fine stagione.</p>
      <div className="esito" aria-live="polite">
        {cedoG.length === 0 && ricevoG.length === 0 ? (
          <p>Spunta i giocatori da scambiare.</p>
        ) : !ruoliUguali ? (
          <p>Per mantenere la rosa valida, cedi e ricevi lo stesso numero di giocatori con gli stessi ruoli.</p>
        ) : (
          <ol className="scambi">
            <PropostaScambio s={valutato!} giornateRimanenti={giornateRimanenti} />
          </ol>
        )}
      </div>
    </section>
  );
}
