"use client";

import { useEffect, useMemo, useState } from "react";

import { stato } from "@/components/Listone";
import { conSegno, due, pct, voto } from "@/lib/format";
import { importaRose, rosaDi, type Lega as LegaT } from "@/lib/league";
import { migliorFormazione } from "@/lib/lineup";
import { suggerisciScambi, valutaScambio, type Scambio } from "@/lib/trades";
import { NOMI_RUOLO, RUOLI, type Giocatore, type Ruolo } from "@/lib/types";

const CHIAVE = "chi-schiero-lega-v1";
const COMPOSIZIONE: Record<Ruolo, number> = { P: 3, D: 8, C: 8, A: 6 };

function leggi(): LegaT | null {
  try {
    const raw = localStorage.getItem(CHIAVE);
    return raw ? (JSON.parse(raw) as LegaT) : null;
  } catch {
    return null;
  }
}

function salva(lega: LegaT | null) {
  try {
    if (lega) localStorage.setItem(CHIAVE, JSON.stringify(lega));
    else localStorage.removeItem(CHIAVE);
  } catch {
    // archiviazione non disponibile (navigazione privata): la lega resta solo in questa pagina
  }
}

/** Lega di esempio: 8 squadre con rose 3/8/8/6 distribuite a serpentina tra i giocatori più forti. */
function legaEsempio(giocatori: Giocatore[]): LegaT {
  const nomi = ["Atletico Ma Non Troppo", "Real Mente", "Longobarda", "Dinamo Divano", "Sporting Lesione", "Bayern Monaco di Baviera", "Paris Saint Gennaro", "Inter Nos"];
  const squadre = nomi.map((nome) => ({ nome, ids: [] as number[] }));
  for (const r of RUOLI) {
    const pool = giocatori.filter((g) => g.ruolo === r).sort((a, b) => (b.fvm ?? 0) - (a.fvm ?? 0));
    let i = 0;
    for (let giro = 0; giro < COMPOSIZIONE[r]; giro++) {
      const ordine = giro % 2 === 0 ? squadre : [...squadre].reverse();
      for (const s of ordine) s.ids.push(pool[i++].id);
    }
  }
  return { squadre, mia: nomi[0] };
}

export function Lega({ giocatori, giornata }: { giocatori: Giocatore[]; giornata: number }) {
  const perId = useMemo(() => new Map(giocatori.map((g) => [g.id, g])), [giocatori]);
  const [lega, setLega] = useState<LegaT | null>(null);
  const [caricata, setCaricata] = useState(false);

  useEffect(() => {
    setLega(leggi());
    setCaricata(true);
  }, []);

  const aggiorna = (l: LegaT | null) => {
    setLega(l);
    salva(l);
  };

  if (!caricata) return null;
  if (!lega) return <Importa giocatori={giocatori} onImporta={aggiorna} />;

  const mia = lega.squadre.find((s) => s.nome === lega.mia) ?? null;
  return (
    <>
      <section className="scheda">
        <div className="riga-azioni">
          <label>
            <span>La mia squadra</span>
            <select value={lega.mia ?? ""} onChange={(e) => aggiorna({ ...lega, mia: e.target.value || null })}>
              <option value="">Scegli…</option>
              {lega.squadre.map((s) => (
                <option key={s.nome}>{s.nome}</option>
              ))}
            </select>
          </label>
          <button type="button" className="secondario" onClick={() => aggiorna(null)}>
            Importa un&apos;altra lega
          </button>
        </div>
        <p className="nota-piccola">
          {lega.squadre.length} squadre importate. Le rose restano salvate solo in questo browser.
        </p>
      </section>

      {mia ? (
        <>
          <Formazione rosa={rosaDi(mia, perId)} giornata={giornata} />
          <Scambi
            mia={rosaDi(mia, perId)}
            altre={lega.squadre.filter((s) => s.nome !== mia.nome).map((s) => ({ nome: s.nome, rosa: rosaDi(s, perId) }))}
          />
        </>
      ) : (
        <p className="vuoto">Scegli la tua squadra per vedere formazione e scambi.</p>
      )}
    </>
  );
}

function Importa({ giocatori, onImporta }: { giocatori: Giocatore[]; onImporta: (l: LegaT) => void }) {
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [nonTrovati, setNonTrovati] = useState<string[]>([]);

  const importa = (contenuto: string) => {
    const esito = importaRose(contenuto, giocatori);
    setNonTrovati(esito.nonTrovati.map((n) => `${n.squadra}: ${n.valore}`));
    if (esito.squadre.length === 0) {
      setErrore("Nessun giocatore riconosciuto. Controlla che ogni riga sia «Squadra, id» oppure «Squadra, Nome».");
      return;
    }
    setErrore(null);
    onImporta({ squadre: esito.squadre, mia: esito.squadre.length === 1 ? esito.squadre[0].nome : null });
  };

  return (
    <section className="scheda">
      <h2>Importa le rose della tua lega</h2>
      <p>
        Esporta le rose da Leghe Fantacalcio in formato CSV e carica il file, oppure incolla il testo qui
        sotto. Va bene anche scrivere a mano una riga per giocatore: <code>Squadra, Cognome</code>.
      </p>
      <label className="blocco">
        <span>File CSV</span>
        <input
          type="file"
          accept=".csv,.txt"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) importa(await file.text());
          }}
        />
      </label>
      <label className="blocco">
        <span>Oppure incolla le rose</span>
        <textarea
          rows={8}
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder={"Dinamo Divano, Martinez L.\nDinamo Divano, Barella\nLongobarda, Dimarco"}
        />
      </label>
      <div className="riga-azioni">
        <button type="button" onClick={() => importa(testo)} disabled={!testo.trim()}>
          Importa le rose
        </button>
        <button type="button" className="secondario" onClick={() => onImporta(legaEsempio(giocatori))}>
          Prova con una lega di esempio
        </button>
      </div>
      {errore && <p className="errore">{errore}</p>}
      {nonTrovati.length > 0 && (
        <p className="nota-piccola">Non riconosciuti ({nonTrovati.length}): {nonTrovati.slice(0, 12).join(" · ")}</p>
      )}
    </section>
  );
}

function Formazione({ rosa, giornata }: { rosa: Giocatore[]; giornata: number }) {
  const f = migliorFormazione(rosa);
  if (!f) {
    return (
      <section className="scheda">
        <h2>Formazione per la giornata {giornata}</h2>
        <p className="vuoto">
          Servono almeno 1 portiere, 3 difensori, 3 centrocampisti e 1 attaccante riconosciuti nella rosa.
        </p>
      </section>
    );
  }
  const titolari = new Set(f.titolari.map((g) => g.id));
  return (
    <section className="scheda" aria-labelledby="formazione-titolo">
      <h2 id="formazione-titolo">
        Formazione per la giornata {giornata}: <span className="modulo">{f.modulo}</span>
      </h2>
      <p className="nota-piccola">Punti attesi {due(f.atteso)}, contando chi entra dalla panchina se un titolare non gioca.</p>
      <div className="campo">
        {RUOLI.map((r) => (
          <div key={r} className="reparto">
            <h3 className="etichetta">{NOMI_RUOLO[r]}</h3>
            <ul>
              {f.titolari
                .filter((g) => g.ruolo === r)
                .map((g) => (
                  <GiocatoreRiga key={g.id} g={g} />
                ))}
            </ul>
          </div>
        ))}
      </div>
      <h3 className="etichetta">Panchina, in ordine di ingresso</h3>
      <ul className="panchina">
        {f.panchina
          .filter((g) => !titolari.has(g.id))
          .map((g) => (
            <GiocatoreRiga key={g.id} g={g} />
          ))}
      </ul>
    </section>
  );
}

function GiocatoreRiga({ g }: { g: Giocatore }) {
  const s = stato(g);
  return (
    <li className="mini">
      <span className={`ruolo ruolo-${g.ruolo}`}>{g.ruolo}</span>
      <span className="nome">{g.nome}</span>
      <span className="contro">
        {g.casa ? "vs" : "@"} {g.avversario}
        {s && <span className={`nota ${s.classe}`}>{s.testo}</span>}
      </span>
      <span className="numero">{pct(g.p_gioca)}</span>
      <span className="fv">{voto(g.fv_atteso)}</span>
    </li>
  );
}

function Scambi({ mia, altre }: { mia: Giocatore[]; altre: { nome: string; rosa: Giocatore[] }[] }) {
  const [suggeriti, setSuggeriti] = useState<Scambio[] | null>(null);
  const [calcolo, setCalcolo] = useState(false);
  const [controparte, setControparte] = useState(altre[0]?.nome ?? "");
  const [cedo, setCedo] = useState<number[]>([]);
  const [ricevo, setRicevo] = useState<number[]>([]);

  const loro = altre.find((a) => a.nome === controparte)?.rosa ?? [];
  const cedoG = mia.filter((g) => cedo.includes(g.id));
  const ricevoG = loro.filter((g) => ricevo.includes(g.id));
  const ruoliUguali =
    cedoG.map((g) => g.ruolo).sort().join() === ricevoG.map((g) => g.ruolo).sort().join() && cedoG.length > 0;
  const valutato = ruoliUguali ? valutaScambio(mia, loro, cedoG, ricevoG, controparte) : null;

  const cerca = () => {
    setCalcolo(true);
    // lascia al browser il tempo di mostrare "Sto cercando…" prima del calcolo
    setTimeout(() => {
      setSuggeriti(suggerisciScambi(mia, altre));
      setCalcolo(false);
    }, 20);
  };

  const scegli = (lista: number[], set: (x: number[]) => void, id: number) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  return (
    <section className="scheda" aria-labelledby="scambi-titolo">
      <h2 id="scambi-titolo">Scambi</h2>
      <p>
        Il valore di uno scambio è quanti punti attesi a giornata guadagna la formazione migliore di
        ciascuna squadra da qui a fine stagione. Proponiamo solo scambi che migliorano entrambe le
        squadre, a ruoli invariati: sono quelli che l&apos;altro ha motivo di accettare.
      </p>
      <button type="button" onClick={cerca} disabled={calcolo || altre.length === 0}>
        {calcolo ? "Sto cercando…" : "Cerca scambi vantaggiosi per entrambi"}
      </button>
      {suggeriti &&
        (suggeriti.length === 0 ? (
          <p className="vuoto">
            Nessuno scambio migliora entrambe le squadre: le rose sono già ben bilanciate tra loro. Prova a
            valutare a mano uno scambio qui sotto.
          </p>
        ) : (
          <ol className="scambi">
            {suggeriti.map((s, i) => (
              <li key={i}>
                <span>
                  Cedi <strong>{s.cedo.map((g) => g.nome).join(" + ")}</strong> a {s.controparte}, ricevi{" "}
                  <strong>{s.ricevo.map((g) => g.nome).join(" + ")}</strong>
                </span>
                <span className="delta">
                  tu {conSegno(s.deltaMio)} · loro {conSegno(s.deltaLoro)} punti a giornata
                </span>
              </li>
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
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Ricevo</legend>
          {loro.map((g) => (
            <label key={g.id} className="spunta">
              <input type="checkbox" checked={ricevo.includes(g.id)} onChange={() => scegli(ricevo, setRicevo, g.id)} />
              <span className={`ruolo ruolo-${g.ruolo}`}>{g.ruolo}</span> {g.nome}
            </label>
          ))}
        </fieldset>
      </div>
      <p className="esito" aria-live="polite">
        {cedoG.length === 0 && ricevoG.length === 0
          ? "Spunta i giocatori da scambiare."
          : !ruoliUguali
            ? "Per mantenere la rosa valida, cedi e ricevi lo stesso numero di giocatori con gli stessi ruoli."
            : `Tu ${conSegno(valutato!.deltaMio)} · ${controparte} ${conSegno(valutato!.deltaLoro)} punti attesi a giornata`}
      </p>
    </section>
  );
}
