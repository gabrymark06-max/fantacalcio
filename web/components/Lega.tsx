"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { stato } from "@/components/Listone";
import { conSegno, due, pct, voto } from "@/lib/format";
import { codiceSegnalibro } from "@/lib/bookmarklet";
import { importaRose, rosaDi, type Squadra } from "@/lib/league";
import { decodificaImport, regoleDaLeghe, roseDaLeghe, ruoliDaLeghe, type Nota } from "@/lib/leghe";
import { migliorFormazione, punteggio, type Contesto } from "@/lib/lineup";
import { formattaNumero, leggiNumero } from "@/lib/numbers";
import { fantavotoRegole, REGOLE_STANDARD, TUTTI_I_MODULI, type Regole } from "@/lib/rules";
import { contestoStagione, etichettaAccetta, suggerisciScambi, valutaScambio, type Scambio } from "@/lib/trades";
import { NOMI_RUOLO, RUOLI, type Giocatore, type Ruolo } from "@/lib/types";

const CHIAVE = "chi-schiero-lega-v2";
const COMPOSIZIONE: Record<Ruolo, number> = { P: 3, D: 8, C: 8, A: 6 };

interface LegaSalvata {
  squadre: Squadra[];
  mia: string | null;
  regole: Regole;
  /** Ruoli cambiati dalla lega (id giocatore → ruolo), da Leghe Fantacalcio. */
  ruoli?: Record<number, Ruolo>;
  /** Presente se la lega arriva da Leghe Fantacalcio. */
  origine?: {
    lega: string;
    importata: string;
    note: Nota[];
    fuoriListone: number;
    impostazioni: unknown;
  };
}

/** Rosa con i ruoli della lega applicati. */
function rosaLega(squadra: Squadra, perId: Map<number, Giocatore>, ruoli: Record<number, Ruolo> = {}): Giocatore[] {
  return rosaDi(squadra, perId).map((g) => (ruoli[g.id] && ruoli[g.id] !== g.ruolo ? { ...g, ruolo: ruoli[g.id] } : g));
}

/** Se l'URL porta dati dal segnalibro, li trasforma in una lega (e pulisce l'URL). */
function daSegnalibro(giocatori: Giocatore[], precedente: LegaSalvata | null): LegaSalvata | null {
  if (typeof window === "undefined" || !window.location.hash.includes("importa=")) return null;
  const dati = decodificaImport(window.location.hash);
  window.history.replaceState(null, "", window.location.pathname);
  if (!dati) return null;
  const rose = roseDaLeghe(dati, giocatori);
  const { regole, note } = regoleDaLeghe(dati.impostazioni);
  const miaPrima = precedente?.mia && rose.squadre.some((s) => s.nome === precedente.mia) ? precedente.mia : null;
  return {
    squadre: rose.squadre,
    mia: rose.mia ?? miaPrima,
    regole,
    ruoli: ruoliDaLeghe(dati.impostazioni.ruoli),
    origine: {
      lega: dati.lega.nome,
      importata: new Date().toISOString(),
      note,
      fuoriListone: rose.fuoriListone,
      impostazioni: { calcolo: dati.impostazioni.calcolo, formazione: dati.impostazioni.formazione },
    },
  };
}

function leggi(): LegaSalvata | null {
  try {
    const raw = localStorage.getItem(CHIAVE);
    if (!raw) return null;
    const l = JSON.parse(raw) as LegaSalvata;
    return { ...l, regole: { ...REGOLE_STANDARD, ...l.regole } };
  } catch {
    return null;
  }
}

function salva(lega: LegaSalvata | null) {
  try {
    if (lega) localStorage.setItem(CHIAVE, JSON.stringify(lega));
    else localStorage.removeItem(CHIAVE);
  } catch {
    // archiviazione non disponibile (navigazione privata): la lega resta solo in questa pagina
  }
}

/** Lega di esempio: 8 squadre con rose 3/8/8/6 distribuite a serpentina tra i giocatori più forti. */
function legaEsempio(giocatori: Giocatore[]): LegaSalvata {
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
  return { squadre, mia: nomi[0], regole: REGOLE_STANDARD };
}

interface Props {
  giocatori: Giocatore[];
  giornata: number;
  sdVoto: Record<Ruolo, number>;
}

export function Lega({ giocatori, giornata, sdVoto }: Props) {
  const perId = useMemo(() => new Map(giocatori.map((g) => [g.id, g])), [giocatori]);
  const [lega, setLega] = useState<LegaSalvata | null>(null);
  const [caricata, setCaricata] = useState(false);

  useEffect(() => {
    const salvata = leggi();
    const importata = daSegnalibro(giocatori, salvata);
    if (importata) salva(importata);
    setLega(importata ?? salvata);
    setCaricata(true);
  }, [giocatori]);

  const aggiorna = (l: LegaSalvata | null) => {
    setLega(l);
    salva(l);
  };

  if (!caricata) return null;
  if (!lega) {
    return (
      <>
        <CollegaLeghe />
        <Importa giocatori={giocatori} onImporta={aggiorna} />
      </>
    );
  }

  const ctx: Contesto = { regole: lega.regole, orizzonte: "giornata", sdVoto };
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
          {lega.squadre.length} squadre importate. Rose e regole restano salvate solo in questo browser.
        </p>
        {lega.origine && <RiepilogoImport origine={lega.origine} ruoli={Object.keys(lega.ruoli ?? {}).length} />}
        {lega.origine && (
          <p className="nota-piccola">
            Dopo scambi o svincoli: apri la lega su Leghe Fantacalcio e clicca di nuovo il segnalibro <Segnalibro compatto />
          </p>
        )}
        <RegoleLega regole={lega.regole} onChange={(regole) => aggiorna({ ...lega, regole })} />
      </section>

      {mia ? (
        <>
          <Formazione rosa={rosaLega(mia, perId, lega.ruoli)} giornata={giornata} ctx={ctx} />
          <Scambi
            key={JSON.stringify(lega.regole) + mia.nome}
            mia={rosaLega(mia, perId, lega.ruoli)}
            altre={lega.squadre.filter((s) => s.nome !== mia.nome).map((s) => ({ nome: s.nome, rosa: rosaLega(s, perId, lega.ruoli) }))}
            ctx={ctx}
            giornateRimanenti={Math.max(1, 38 - giornata + 1)}
          />
        </>
      ) : (
        <p className="vuoto">Scegli la tua squadra per vedere formazione e scambi.</p>
      )}
    </>
  );
}

// ---------- Importazione ----------

/** Il pulsante da trascinare nei preferiti. React non permette href "javascript:", lo si imposta a mano. */
function Segnalibro({ compatto = false }: { compatto?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", codiceSegnalibro(window.location.origin));
  }, []);
  return (
    <a
      ref={ref}
      className={compatto ? "segnalibro compatto" : "segnalibro"}
      onClick={(e) => {
        e.preventDefault();
        alert("Trascina questo pulsante nella barra dei preferiti, poi cliccalo dalla pagina della tua lega su leghe.fantacalcio.it.");
      }}
      draggable
    >
      Importa in Chi Schiero
    </a>
  );
}

function CollegaLeghe() {
  return (
    <section className="scheda" aria-labelledby="collega-titolo">
      <h2 id="collega-titolo">Importa da Leghe Fantacalcio</h2>
      <p>Rose di tutte le squadre, bonus e malus, moduli e ruoli della tua lega, in un clic.</p>
      <ol className="passi">
        <li>
          Trascina questo pulsante nella barra dei preferiti: <Segnalibro />
        </li>
        <li>Apri la tua lega su leghe.fantacalcio.it, con il login fatto.</li>
        <li>Clicca il preferito «Importa in Chi Schiero»: si apre questa pagina con tutto compilato.</li>
      </ol>
      <p className="nota-piccola">
        Il segnalibro legge i dati con la sessione già aperta nel tuo browser. Password e codice di accesso non
        escono da Leghe Fantacalcio: qui arrivano solo rose e impostazioni. Funziona con le leghe Classic.
      </p>
    </section>
  );
}

function RiepilogoImport({ origine, ruoli }: { origine: NonNullable<LegaSalvata["origine"]>; ruoli: number }) {
  const [copiato, setCopiato] = useState(false);
  const daControllare = origine.note.filter((n) => n.tipo === "controlla");
  const testo = JSON.stringify(origine.impostazioni, null, 1);
  return (
    <div className="riepilogo-import">
      <p>
        Importata da Leghe Fantacalcio: <strong>{origine.lega}</strong>, il{" "}
        {new Date(origine.importata).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}.
        {origine.fuoriListone === 1 && " 1 giocatore non è più nel listone di Serie A e non viene contato."}
        {origine.fuoriListone > 1 && ` ${origine.fuoriListone} giocatori non sono più nel listone di Serie A e non vengono contati.`}
        {ruoli === 1 && " 1 giocatore ha il ruolo cambiato dalla lega."}
        {ruoli > 1 && ` ${ruoli} giocatori hanno il ruolo cambiato dalla lega.`}
      </p>
      <ul className="note-import">
        {origine.note.map((n, i) => (
          <li key={i} className={n.tipo === "ok" ? "nota-ok" : "nota-controlla"}>
            {n.testo}
          </li>
        ))}
      </ul>
      {daControllare.length > 0 && (
        <details>
          <summary>Impostazioni originali della lega</summary>
          <p className="nota-piccola">
            Servono per leggere in automatico anche i modificatori: copiale e mandale a chi cura il sito.
          </p>
          <button
            type="button"
            className="secondario"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(testo);
                setCopiato(true);
              } catch {
                setCopiato(false);
              }
            }}
          >
            {copiato ? "Copiate" : "Copia le impostazioni"}
          </button>
          <pre className="grezzo">{testo}</pre>
        </details>
      )}
    </div>
  );
}

function Importa({ giocatori, onImporta }: { giocatori: Giocatore[]; onImporta: (l: LegaSalvata) => void }) {
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
    onImporta({ squadre: esito.squadre, mia: esito.squadre.length === 1 ? esito.squadre[0].nome : null, regole: REGOLE_STANDARD });
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

// ---------- Regole ----------

const PRESET: { nome: string; regole: Regole }[] = [
  { nome: "Standard fantacalcio.it", regole: REGOLE_STANDARD },
  {
    nome: "Con modificatore difesa",
    regole: { ...REGOLE_STANDARD, modificatoreDifesa: { ...REGOLE_STANDARD.modificatoreDifesa, attivo: true } },
  },
  {
    nome: "Modificatore + imbattibilità",
    regole: { ...REGOLE_STANDARD, imbattibilita: 1, modificatoreDifesa: { ...REGOLE_STANDARD.modificatoreDifesa, attivo: true } },
  },
];

type CampoNumerico = Exclude<keyof Regole, "gol" | "modificatoreDifesa" | "moduli">;
const CAMPI: { chiave: CampoNumerico; etichetta: string }[] = [
  { chiave: "rigoreSegnato", etichetta: "Rigore segnato" },
  { chiave: "assist", etichetta: "Assist" },
  { chiave: "golSubito", etichetta: "Gol subito (portiere)" },
  { chiave: "imbattibilita", etichetta: "Imbattibilità portiere" },
  { chiave: "playerOfTheMatch", etichetta: "Player of the match" },
  { chiave: "rigoreParato", etichetta: "Rigore parato" },
  { chiave: "rigoreSbagliato", etichetta: "Rigore sbagliato" },
  { chiave: "autorete", etichetta: "Autorete" },
  { chiave: "ammonizione", etichetta: "Ammonizione" },
  { chiave: "espulsione", etichetta: "Espulsione" },
];

function Numero({
  valore,
  onChange,
  etichetta,
  passo = 0.5,
}: {
  valore: number;
  onChange: (v: number) => void;
  etichetta: string;
  /** Incremento delle frecce; si può comunque scrivere qualsiasi decimale (6,25 o 6.25). */
  passo?: number;
}) {
  // Testo libero: mentre si scrive "6," o "-" il valore non è ancora un numero e non va perso.
  const [bozza, setBozza] = useState(formattaNumero(valore));
  const [attivo, setAttivo] = useState(false);
  const mostrato = attivo ? bozza : formattaNumero(valore);
  const applica = (v: number) => {
    const arrotondato = Math.round(v * 100) / 100;
    setBozza(formattaNumero(arrotondato));
    onChange(arrotondato);
  };
  return (
    <label className="numero-regola">
      <span>{etichetta}</span>
      <input
        type="text"
        inputMode="decimal"
        value={mostrato}
        onFocus={() => {
          setBozza(formattaNumero(valore));
          setAttivo(true);
        }}
        onBlur={() => setAttivo(false)}
        onChange={(e) => {
          setBozza(e.target.value);
          const v = leggiNumero(e.target.value);
          if (v !== null) onChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            applica(valore + (e.key === "ArrowUp" ? passo : -passo));
          }
        }}
      />
    </label>
  );
}
function riassunto(r: Regole): string {
  const parti = [];
  if (JSON.stringify(r) === JSON.stringify(REGOLE_STANDARD)) return "standard fantacalcio.it";
  if (r.modificatoreDifesa.attivo) parti.push("modificatore difesa");
  if (r.imbattibilita) parti.push(`imbattibilità ${conSegno(r.imbattibilita).replace(",00", "")}`);
  if (r.playerOfTheMatch) parti.push(`player of the match ${conSegno(r.playerOfTheMatch).replace(",00", "")}`);
  if (r.gol.D !== 3 || r.gol.C !== 3) parti.push("gol diversi per ruolo");
  if (r.moduli.length < TUTTI_I_MODULI.length) parti.push(`${r.moduli.length} moduli`);
  return parti.length ? parti.join(", ") : "personalizzate";
}

function RegoleLega({ regole, onChange }: { regole: Regole; onChange: (r: Regole) => void }) {
  const md = regole.modificatoreDifesa;
  const setMd = (patch: Partial<Regole["modificatoreDifesa"]>) => onChange({ ...regole, modificatoreDifesa: { ...md, ...patch } });
  return (
    <details className="regole">
      <summary>
        Regole della lega: <strong>{riassunto(regole)}</strong>
      </summary>
      <p className="nota-piccola">
        Formazione e scambi si ricalcolano con queste regole. Il voto puro resta quello previsto; cambia il
        peso di bonus e malus.
      </p>
      <div className="riga-azioni">
        {PRESET.map((p) => (
          <button key={p.nome} type="button" className="secondario" onClick={() => onChange(p.regole)}>
            {p.nome}
          </button>
        ))}
      </div>

      <fieldset>
        <legend>Bonus gol per ruolo</legend>
        <div className="griglia-regole">
          {RUOLI.map((r) => (
            <Numero
              key={r}
              etichetta={NOMI_RUOLO[r]}
              valore={regole.gol[r]}
              onChange={(v) => onChange({ ...regole, gol: { ...regole.gol, [r]: v } })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Altri bonus e malus</legend>
        <div className="griglia-regole">
          {CAMPI.map((c) => (
            <Numero key={c.chiave} etichetta={c.etichetta} valore={regole[c.chiave]} onChange={(v) => onChange({ ...regole, [c.chiave]: v })} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Modificatore difesa</legend>
        <label className="spunta">
          <input type="checkbox" checked={md.attivo} onChange={(e) => setMd({ attivo: e.target.checked })} /> Attivo (serve
          schierare almeno 4 difensori)
        </label>
        {md.attivo && (
          <>
            <label>
              <span>Media calcolata su</span>
              <select
                value={md.conPortiere ? "p3" : "d4"}
                onChange={(e) => setMd(e.target.value === "p3" ? { conPortiere: true, migliori: 3 } : { conPortiere: false, migliori: 4 })}
              >
                <option value="p3">portiere + 3 migliori difensori</option>
                <option value="d4">4 migliori difensori</option>
              </select>
            </label>
            <div className="griglia-regole">
              {md.fasce.map((f, i) => (
                <div key={i} className="fascia">
                  <Numero
                    etichetta="Da media"
                    passo={0.25}
                    valore={f.da}
                    onChange={(v) => setMd({ fasce: md.fasce.map((x, j) => (j === i ? { ...x, da: v } : x)) })}
                  />
                  <Numero
                    etichetta="Bonus"
                    valore={f.bonus}
                    onChange={(v) => setMd({ fasce: md.fasce.map((x, j) => (j === i ? { ...x, bonus: v } : x)) })}
                  />
                </div>
              ))}
            </div>
            <div className="riga-azioni">
              <button type="button" className="secondario" onClick={() => {
                  const ultima = md.fasce.reduce((a, b) => (b.da > a.da ? b : a), { da: 5.75, bonus: 0 });
                  setMd({ fasce: [...md.fasce, { da: ultima.da + 0.25, bonus: ultima.bonus + 1 }] });
                }}>
                Aggiungi fascia
              </button>
              {md.fasce.length > 1 && (
                <button type="button" className="secondario" onClick={() => setMd({ fasce: md.fasce.slice(0, -1) })}>
                  Togli l&apos;ultima fascia
                </button>
              )}
            </div>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Moduli ammessi</legend>
        <div className="moduli">
          {TUTTI_I_MODULI.map((m) => (
            <label key={m} className="spunta">
              <input
                type="checkbox"
                checked={regole.moduli.includes(m)}
                onChange={(e) => {
                  const moduli = e.target.checked ? [...regole.moduli, m] : regole.moduli.filter((x) => x !== m);
                  if (moduli.length) onChange({ ...regole, moduli: TUTTI_I_MODULI.filter((x) => moduli.includes(x)) });
                }}
              />
              {m}
            </label>
          ))}
        </div>
      </fieldset>
    </details>
  );
}

// ---------- Formazione ----------

function Formazione({ rosa, giornata, ctx }: { rosa: Giocatore[]; giornata: number; ctx: Contesto }) {
  const [modulo, setModulo] = useState<string>("auto");
  const moduloValido = modulo !== "auto" && ctx.regole.moduli.includes(modulo) ? modulo : undefined;
  const automatica = migliorFormazione(rosa, ctx);
  const f = moduloValido ? migliorFormazione(rosa, ctx, moduloValido) : automatica;

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
  return (
    <section className="scheda" aria-labelledby="formazione-titolo">
      <div className="titolo-con-azione">
        <h2 id="formazione-titolo">
          Formazione per la giornata {giornata}: <span className="modulo">{f.modulo}</span>
        </h2>
        <label>
          <span>Modulo</span>
          <select value={moduloValido ?? "auto"} onChange={(e) => setModulo(e.target.value)}>
            <option value="auto">Il migliore ({automatica?.modulo})</option>
            {ctx.regole.moduli.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="nota-piccola">
        Punti attesi {due(f.atteso)}
        {ctx.regole.modificatoreDifesa.attivo && `, di cui modificatore difesa ${due(f.modificatore)}`}
        {moduloValido && automatica && automatica.atteso > f.atteso && ` (${due(automatica.atteso - f.atteso)} in meno del ${automatica.modulo})`}
        . Contano anche i cambi dalla panchina se un titolare non gioca.
      </p>
      <div className="campo">
        {RUOLI.map((r) => (
          <div key={r} className="reparto">
            <h3 className="etichetta">{NOMI_RUOLO[r]}</h3>
            <ul>
              {f.titolari
                .filter((g) => g.ruolo === r)
                .map((g) => (
                  <GiocatoreRiga key={g.id} g={g} ctx={ctx} />
                ))}
            </ul>
          </div>
        ))}
      </div>
      <h3 className="etichetta">Panchina, in ordine di ingresso</h3>
      <ul className="panchina">
        {f.panchina.map((g) => (
          <GiocatoreRiga key={g.id} g={g} ctx={ctx} />
        ))}
      </ul>
    </section>
  );
}

function GiocatoreRiga({ g, ctx }: { g: Giocatore; ctx: Contesto }) {
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
      <span className="fv" title="Fantavoto atteso se gioca, con le regole della lega">
        {voto(fantavotoRegole(g, ctx.regole, ctx.orizzonte))}
      </span>
    </li>
  );
}

// ---------- Scambi ----------

function PropostaScambio({ s, giornateRimanenti }: { s: Scambio; giornateRimanenti: number }) {
  const etichetta = etichettaAccetta(s.pAccetta);
  const diffMercato = Math.round((s.equita - 1) * 100);
  return (
    <li>
      <span>
        Cedi <strong>{s.cedo.map((g) => g.nome).join(" + ")}</strong> a {s.controparte}, ricevi{" "}
        <strong>{s.ricevo.map((g) => g.nome).join(" + ")}</strong>
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
      <h2 id="scambi-titolo">Scambi</h2>
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
