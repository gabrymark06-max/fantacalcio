"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Campo, CreditiFoto, Faccia } from "@/components/Campo";
import { legaEsempio, useLega, roseDellaLega, type LegaSalvata } from "@/components/legaStore";

import { stato } from "@/components/Listone";
import { conSegno, due, pct, voto } from "@/lib/format";
import { codiceSegnalibro } from "@/lib/bookmarklet";
import { importaRose } from "@/lib/league";
import { migliorFormazione, type Contesto } from "@/lib/lineup";
import { formattaNumero, leggiNumero } from "@/lib/numbers";
import { fantavotoRegole, REGOLE_STANDARD, TUTTI_I_MODULI, type Regole } from "@/lib/rules";
import { NOMI_RUOLO, RUOLI, type Giocatore, type Ruolo } from "@/lib/types";

interface Props {
  giocatori: Giocatore[];
  giornata: number;
  sdVoto: Record<Ruolo, number>;
}

export function Lega({ giocatori, giornata, sdVoto }: Props) {
  const perId = useMemo(() => new Map(giocatori.map((g) => [g.id, g])), [giocatori]);
  const { lega, aggiorna, caricata } = useLega(giocatori);

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
  const { mia } = roseDellaLega(lega, perId);
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
        {lega.origine && <RiepilogoImport origine={lega.origine} />}
        {Object.keys(lega.ruoli ?? {}).length > 0 && (
          <RuoliLega
            ruoli={lega.ruoli ?? {}}
            perId={perId}
            attivi={!!lega.usaRuoliLega}
            onChange={(usaRuoliLega) => aggiorna({ ...lega, usaRuoliLega })}
          />
        )}
        {lega.origine && (
          <p className="nota-piccola">
            Dopo scambi o svincoli: apri la lega su Leghe Fantacalcio e clicca di nuovo il segnalibro <Segnalibro compatto />
          </p>
        )}
        <RegoleLega regole={lega.regole} onChange={(regole) => aggiorna({ ...lega, regole })} />
      </section>

      {mia ? (
        <>
          <Formazione rosa={mia} giornata={giornata} ctx={ctx} />
          <p className="rimando">
            <Link href="/scambi">Cerca scambi per la tua squadra →</Link>
          </p>
        </>
      ) : (
        <p className="vuoto">Scegli la tua squadra per vedere la formazione.</p>
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

function RuoliLega({
  ruoli,
  perId,
  attivi,
  onChange,
}: {
  ruoli: Record<number, Ruolo>;
  perId: Map<number, Giocatore>;
  attivi: boolean;
  onChange: (attivi: boolean) => void;
}) {
  const cambi = Object.entries(ruoli)
    .map(([id, ruolo]) => ({ g: perId.get(Number(id)), ruolo }))
    .filter((x): x is { g: Giocatore; ruolo: Ruolo } => x.g !== undefined && x.g.ruolo !== x.ruolo)
    .sort((a, b) => a.g.nome.localeCompare(b.g.nome));
  if (cambi.length === 0) return null;
  return (
    <details className="ruoli-lega">
      <summary>
        Ruoli: {attivi ? <strong>quelli di Leghe Fantacalcio</strong> : <strong>quelli del listone</strong>} ·{" "}
        {cambi.length} giocatori hanno un ruolo diverso su Leghe Fantacalcio
      </summary>
      <p className="nota-piccola">
        Attiva questi ruoli solo se nella tua lega i giocatori sono davvero schierabili così: formazione e scambi
        useranno questi ruoli al posto di quelli del listone.
      </p>
      <label className="spunta">
        <input type="checkbox" checked={attivi} onChange={(e) => onChange(e.target.checked)} /> Usa i ruoli di Leghe
        Fantacalcio
      </label>
      <ul className="elenco-ruoli">
        {cambi.map(({ g, ruolo }) => (
          <li key={g.id}>
            {g.nome} ({g.squadra}): <span className={`ruolo ruolo-${g.ruolo}`}>{g.ruolo}</span> →{" "}
            <span className={`ruolo ruolo-${ruolo}`}>{ruolo}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RiepilogoImport({ origine }: { origine: NonNullable<LegaSalvata["origine"]> }) {
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
      </p>
      <ul className="note-import">
        {origine.note.map((n, i) => (
          <li key={i} className={`nota-${n.tipo}`}>
            {n.tipo === "controlla" && <span className="da-controllare">Da controllare</span>}
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
  if (new Set(Object.values(r.gol)).size > 1) parti.push("gol diversi per ruolo");
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
      <Campo formazione={f} ctx={ctx} />
      <h3 className="etichetta">Panchina, in ordine di ingresso</h3>
      <ul className="panchina">
        {f.panchina.map((g) => (
          <GiocatoreRiga key={g.id} g={g} ctx={ctx} />
        ))}
      </ul>
      <CreditiFoto giocatori={[...f.titolari, ...f.panchina]} />
    </section>
  );
}

function GiocatoreRiga({ g, ctx }: { g: Giocatore; ctx: Contesto }) {
  const s = stato(g);
  return (
    <li className="mini">
      <Faccia g={g} />
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
