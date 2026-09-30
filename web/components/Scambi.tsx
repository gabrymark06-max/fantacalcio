"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Faccia, LineeCampo, RIGHE } from "@/components/Campo";
import { roseDellaLega, useLega, type LegaSalvata } from "@/components/legaStore";
import { conSegno, due, pct, voto } from "@/lib/format";
import { migliorFormazione, punteggio, type Contesto } from "@/lib/lineup";
import { contestoStagione, etichettaAccetta, SOGLIE, suggerisciScambi, valutaScambio, type Scambio } from "@/lib/trades";
import { NOMI_RUOLO, type Giocatore, type Ruolo } from "@/lib/types";

/*
 * Banco degli scambi, a tre colonne: la mia rosa (chi cedo), l'analisi con gli scambi
 * suggeriti, la rosa dell'altra squadra (chi ricevo). Si sceglie toccando i giocatori sul campo.
 */

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
  if (!mia) {
    return (
      <section className="scheda">
        <SceltaMia lega={lega} aggiorna={aggiorna} />
        <p className="vuoto">Scegli la tua squadra per cercare scambi.</p>
      </section>
    );
  }
  return (
    <Banco
      key={JSON.stringify(lega.regole) + lega.mia + String(!!lega.usaRuoliLega)}
      lega={lega}
      aggiorna={aggiorna}
      mia={mia}
      altre={altre}
      ctx={ctx}
      giornateRimanenti={Math.max(1, 38 - giornata + 1)}
    />
  );
}

function SceltaMia({ lega, aggiorna }: { lega: LegaSalvata; aggiorna: (l: LegaSalvata) => void }) {
  return (
    <select
      className="scelta-squadra"
      aria-label="La mia squadra"
      value={lega.mia ?? ""}
      onChange={(e) => aggiorna({ ...lega, mia: e.target.value || null })}
    >
      <option value="">Scegli la tua squadra…</option>
      {lega.squadre.map((s) => (
        <option key={s.nome}>{s.nome}</option>
      ))}
    </select>
  );
}

// ---------- Il banco ----------

function Banco({
  lega,
  aggiorna,
  mia,
  altre,
  ctx,
  giornateRimanenti,
}: {
  lega: LegaSalvata;
  aggiorna: (l: LegaSalvata) => void;
  mia: Giocatore[];
  altre: { nome: string; rosa: Giocatore[] }[];
  ctx: Contesto;
  giornateRimanenti: number;
}) {
  const [controparte, setControparte] = useState(altre[0]?.nome ?? "");
  const [cedo, setCedo] = useState<number[]>([]);
  const [ricevo, setRicevo] = useState<number[]>([]);
  const [suggeriti, setSuggeriti] = useState<Scambio[] | null>(null);
  const [calcolo, setCalcolo] = useState(false);

  const loro = altre.find((a) => a.nome === controparte)?.rosa ?? [];
  const ctxStagione = useMemo(() => contestoStagione(ctx, [mia, ...altre.map((a) => a.rosa)]), [ctx, mia, altre]);
  const cedoG = mia.filter((g) => cedo.includes(g.id));
  const ricevoG = loro.filter((g) => ricevo.includes(g.id));
  const ruoliUguali =
    cedoG.length > 0 && cedoG.map((g) => g.ruolo).sort().join() === ricevoG.map((g) => g.ruolo).sort().join();
  const valutato = ruoliUguali ? valutaScambio(mia, loro, cedoG, ricevoG, controparte, ctxStagione) : null;

  // scambi suggeriti solo con la squadra scelta a destra: si ricercano quando cambia
  const cerca = () => {
    setCalcolo(true);
    const con = altre.filter((a) => a.nome === controparte);
    // lascia al browser il tempo di mostrare "Sto cercando…" prima del calcolo
    const t = setTimeout(() => {
      setSuggeriti(suggerisciScambi(mia, con, ctx));
      setCalcolo(false);
    }, 30);
    return () => clearTimeout(t);
  };
  useEffect(cerca, [controparte]); // eslint-disable-line react-hooks/exhaustive-deps

  const alterna = (lista: number[], set: (x: number[]) => void, id: number) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const apri = (s: Scambio) => {
    setControparte(s.controparte);
    setCedo(s.cedo.map((g) => g.id));
    setRicevo(s.ricevo.map((g) => g.id));
    document.getElementById("analisi")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const aperto = (s: Scambio) =>
    s.controparte === controparte &&
    s.cedo.length === cedo.length &&
    s.ricevo.length === ricevo.length &&
    s.cedo.every((g) => cedo.includes(g.id)) &&
    s.ricevo.every((g) => ricevo.includes(g.id));

  return (
    <div className="banco-scambi">
      <ColonnaSquadra
        lato="cedi"
        scelta={<SceltaMia lega={lega} aggiorna={aggiorna} />}
        rosa={mia}
        scelti={cedoG}
        ctx={ctxStagione}
        onTocca={(id) => alterna(cedo, setCedo, id)}
      />

      <div className="centro-scambi">
        <Analisi
          cedo={cedoG}
          ricevo={ricevoG}
          valutato={valutato}
          giornateRimanenti={giornateRimanenti}
          onSvuota={() => {
            setCedo([]);
            setRicevo([]);
          }}
        />

        <section className="suggeriti" aria-labelledby="suggeriti-titolo">
          <div className="suggeriti-testa">
            <h2 id="suggeriti-titolo">Scambi suggeriti con {controparte}</h2>
            <button type="button" className="secondario" onClick={() => void cerca()} disabled={calcolo}>
              {calcolo ? "Sto cercando…" : "Aggiorna"}
            </button>
          </div>
          {suggeriti === null ? (
            <p className="nota-piccola">Sto cercando gli scambi con {controparte} che convengono a te e che possono accettare…</p>
          ) : suggeriti.length === 0 ? (
            <p className="nota-piccola">
              Con {controparte} nessuno scambio ti fa guadagnare almeno {due(SOGLIE.guadagnoMinimo)} punti a giornata restando
              accettabile per loro. Prova un&apos;altra squadra o componi uno scambio toccando i giocatori.
            </p>
          ) : (
            <ol className="carte-scambio">
              {suggeriti.map((s, i) => (
                <li key={i}>
                  <CartaScambio s={s} attiva={aperto(s)} onApri={() => apri(s)} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ColonnaSquadra
        lato="ricevi"
        scelta={
          <select
            className="scelta-squadra"
            aria-label="Squadra con cui scambiare"
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
        }
        rosa={loro}
        scelti={ricevoG}
        ctx={ctxStagione}
        onTocca={(id) => alterna(ricevo, setRicevo, id)}
      />
    </div>
  );
}

// ---------- Colonne delle squadre ----------

function ColonnaSquadra({
  lato,
  scelta,
  rosa,
  scelti,
  ctx,
  onTocca,
}: {
  lato: "cedi" | "ricevi";
  scelta: React.ReactNode;
  rosa: Giocatore[];
  scelti: Giocatore[];
  ctx: Contesto;
  onTocca: (id: number) => void;
}) {
  const formazione = useMemo(() => migliorFormazione(rosa, ctx), [rosa, ctx]);
  const ids = new Set(scelti.map((g) => g.id));
  const gettone = (g: Giocatore) => (
    <Gettone g={g} valore={punteggio(g, ctx)} scelto={ids.has(g.id)} lato={lato} onTocca={() => onTocca(g.id)} />
  );
  return (
    <section className={`colonna-squadra colonna-${lato}`} aria-label={lato === "cedi" ? "La mia squadra" : "L'altra squadra"}>
      {scelta}
      <div className="vassoio">
        <h2 className="vassoio-titolo">{lato === "cedi" ? "Cedi" : "Ricevi"}</h2>
        {scelti.length === 0 ? (
          <p className="vassoio-vuoto">Tocca un giocatore qui sotto</p>
        ) : (
          <ul className="vassoio-lista">
            {scelti.map((g) => (
              <li key={g.id}>
                <button type="button" className="gettone-scelto" onClick={() => onTocca(g.id)} aria-label={`Togli ${g.nome}`}>
                  <Faccia g={g} />
                  <span>{g.nome}</span>
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {formazione ? (
        <>
          <div className="mini-campo" role="group" aria-label={`Titolari, ${formazione.modulo}`}>
            <LineeCampo />
            {RIGHE.map((r) => (
              <ul key={r} className="mini-linea">
                {formazione.titolari
                  .filter((g) => g.ruolo === r)
                  .map((g) => (
                    <li key={g.id}>{gettone(g)}</li>
                  ))}
              </ul>
            ))}
          </div>
          <h3 className="panchina-titolo">Panchina</h3>
          <ul className="mini-panchina">
            {formazione.panchina.map((g) => (
              <li key={g.id}>{gettone(g)}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="nota-piccola">Rosa incompleta: non si può schierare una formazione.</p>
      )}
    </section>
  );
}

function Gettone({
  g,
  valore,
  scelto,
  lato,
  onTocca,
}: {
  g: Giocatore;
  valore: number;
  scelto: boolean;
  lato: "cedi" | "ricevi";
  onTocca: () => void;
}) {
  return (
    <button
      type="button"
      className="gettone"
      aria-pressed={scelto}
      onClick={onTocca}
      title={`${g.nome} (${NOMI_RUOLO[g.ruolo]}): ${voto(valore)} punti attesi a giornata fino a fine stagione. ${
        scelto ? "Tocca per toglierlo" : lato === "cedi" ? "Tocca per cederlo" : "Tocca per riceverlo"
      }`}
    >
      <span className="gettone-foto">
        <Faccia g={g} taglia="media" />
        <span className={`ruolo ruolo-${g.ruolo}`}>{g.ruolo}</span>
      </span>
      <span className="gettone-nome">{g.nome}</span>
    </button>
  );
}

// ---------- Analisi ----------

function Anello({ quota, testo, etichetta, tono }: { quota: number | null; testo: string; etichetta: string; tono: string }) {
  const q = quota === null ? 0 : Math.min(1, Math.max(0, quota));
  return (
    <div className={`anello anello-${tono}`} style={{ "--quota": `${q * 360}deg` } as React.CSSProperties}>
      <span className="anello-valore">{testo}</span>
      <span className="anello-etichetta">{etichetta}</span>
    </div>
  );
}

function verdetto(s: Scambio): { titolo: string; tono: string } {
  const conviene = s.deltaMio >= SOGLIE.guadagnoMinimo;
  const accettabile = s.pAccetta >= SOGLIE.accettazioneMinima && s.deltaLoro > -SOGLIE.perditaMassimaLoro;
  if (conviene && accettabile) return { titolo: "Proponilo", tono: "buono" };
  if (conviene) return { titolo: "Ti conviene, ma difficilmente accettano", tono: "medio" };
  if (s.deltaMio > 0) return { titolo: "Guadagni troppo poco", tono: "medio" };
  return { titolo: "Non ti conviene", tono: "cattivo" };
}

function Analisi({
  cedo,
  ricevo,
  valutato,
  giornateRimanenti,
  onSvuota,
}: {
  cedo: Giocatore[];
  ricevo: Giocatore[];
  valutato: Scambio | null;
  giornateRimanenti: number;
  onSvuota: () => void;
}) {
  const vuoto = cedo.length === 0 && ricevo.length === 0;
  const v = valutato ? verdetto(valutato) : null;
  const titolo = vuoto ? "Analizza uno scambio" : v ? v.titolo : "Cedi e ricevi gli stessi ruoli";
  const sottotitolo = vuoto
    ? "Tocca i giocatori da cedere a sinistra e da ricevere a destra, o apri uno scambio suggerito."
    : v
      ? null
      : "Per tenere valida la rosa servono lo stesso numero di giocatori e gli stessi ruoli da entrambe le parti.";

  return (
    <section id="analisi" className={`analisi${v ? ` analisi-${v.tono}` : ""}`} aria-live="polite" aria-labelledby="analisi-titolo">
      <button type="button" className="secondario svuota" onClick={onSvuota} disabled={vuoto}>
        Svuota tutto
      </button>
      <div className="analisi-cuore">
        <Anello
          quota={valutato ? Math.abs(valutato.deltaMio) / 0.6 : null}
          testo={valutato ? conSegno(valutato.deltaMio) : "–"}
          etichetta="punti per te a giornata"
          tono={valutato ? (valutato.deltaMio >= 0 ? "buono" : "cattivo") : "spento"}
        />
        <div className="analisi-testo">
          <h2 id="analisi-titolo">{titolo}</h2>
          {sottotitolo && <p>{sottotitolo}</p>}
          {valutato && (
            <p>Circa {conSegno(valutato.deltaMio * giornateRimanenti).replace(/,\d+$/, "")} punti da qui a fine stagione.</p>
          )}
        </div>
        <Anello
          quota={valutato ? valutato.pAccetta : null}
          testo={valutato ? pct(valutato.pAccetta) : "–"}
          etichetta="che accettino"
          tono={valutato ? (etichettaAccetta(valutato.pAccetta) === "bassa" ? "cattivo" : "buono") : "spento"}
        />
      </div>
      {valutato && (
        <details className="dettagli-analisi">
          <summary>Vedi dettagli analisi</summary>
          <Dettagli s={valutato} />
        </details>
      )}
    </section>
  );
}

function Dettagli({ s }: { s: Scambio }) {
  const diffMercato = Math.round((s.equita - 1) * 100);
  return (
    <ul>
      <li>
        <strong>Per te:</strong>{" "}
        {s.entranoTitolari.length > 0
          ? `${s.entranoTitolari.map((g) => g.nome).join(", ")} ${s.entranoTitolari.length > 1 ? "entrano" : "entra"} tra i titolari${
              s.esconoTitolari.length > 0 ? ` al posto di ${s.esconoTitolari.map((g) => g.nome).join(", ")}` : ""
            }; `
          : "i titolari non cambiano; "}
        la formazione migliore fa {conSegno(s.deltaMio)} punti attesi a giornata, con le regole della tua lega.
      </li>
      <li>
        <strong>Per {s.controparte}:</strong> valore di mercato (FVM) {s.fvmRicevono} ricevuto contro {s.fvmCedono} ceduto
        {diffMercato !== 0 && ` (${diffMercato > 0 ? "+" : ""}${diffMercato}% per loro, pesando di più i giocatori forti)`};
        formazione{" "}
        {s.deltaLoro >= 0.005 ? `migliore di ${due(s.deltaLoro)}` : s.deltaLoro <= -0.005 ? `peggiore di ${due(-s.deltaLoro)}` : "invariata"} a
        giornata.
      </li>
      <li>
        La probabilità che accettino dipende da quanto valore di mercato ricevono e da quanto cambia la loro formazione: è
        una stima, non una certezza.
      </li>
    </ul>
  );
}

// ---------- Carte degli scambi suggeriti ----------

function Lato({ titolo, giocatori }: { titolo: string; giocatori: Giocatore[] }) {
  return (
    <span className="carta-lato">
      <span className="carta-titolo">{titolo}</span>
      {giocatori.map((g) => (
        <span key={g.id} className="carta-giocatore">
          <span className="gettone-foto">
            <Faccia g={g} taglia="media" />
            <span className={`ruolo ruolo-${g.ruolo}`}>{g.ruolo}</span>
          </span>
          <span className="gettone-nome">{g.nome}</span>
        </span>
      ))}
    </span>
  );
}

function CartaScambio({ s, attiva, onApri }: { s: Scambio; attiva: boolean; onApri: () => void }) {
  const etichetta = etichettaAccetta(s.pAccetta);
  return (
    <button type="button" className="carta-scambio" aria-pressed={attiva} onClick={onApri}>
      <span className="carta-corpo">
        <Lato titolo="cedi" giocatori={s.cedo} />
        <span className="carta-freccia" aria-hidden="true">
          ⇄
        </span>
        <Lato titolo="prendi" giocatori={s.ricevo} />
      </span>
      <span className="carta-esito">
        <strong>{conSegno(s.deltaMio)}</strong> a giornata · accettazione{" "}
        <span className={`accetta accetta-${etichetta}`}>{etichetta}</span>
      </span>
      <span className="carta-apri">vedi analisi ›</span>
    </button>
  );
}
