"use client";

import { useEffect, useMemo, useState } from "react";

import { Faccia } from "@/components/Campo";
import { Distintivo } from "@/components/Probabili";
import type { DatiPartita, DatiPronostici, PartitaForma, QuoteLibro, StatisticheLato } from "@/lib/datiPronostici";
import { data, pct, voto } from "@/lib/format";
import { formazioneSquadra, type PartitaProbabile } from "@/lib/probabili";
import {
  daSapere,
  matriceRisultati,
  mercati,
  migliori,
  pAssist,
  pCartellino,
  pGol,
  pronostico,
  pronosticoStatistico,
  quotaEqua,
  type DaSapere,
  type Evidenza,
  type Mercato,
} from "@/lib/pronostico";
import type { Giocatore, Partita } from "@/lib/types";

/*
 * Pagina Pronostici: proiezione del campionato (come il "supercomputer" di Opta) e, per ogni
 * partita, probabilità di tutti i mercati con la quota equa, le quote dei bookmaker quando
 * sono pubblicate, statistiche di stagione a confronto, forma, precedenti e giocatori.
 * Contenuto informativo: niente link né promozioni dei bookmaker (linee guida AGCOM sul
 * Decreto Dignità, delibera 132/19/CONS).
 */

interface Props {
  partite: Partita[];
  giocatori: Giocatore[];
  probabili: Record<string, PartitaProbabile>;
  loghi: Record<string, string>;
  dati: DatiPronostici;
}

const quota = (x: number) => (Number.isFinite(x) ? x.toFixed(2).replace(".", ",") : "–");
const chiaveDi = (p: Partita) => `${p.casa}-${p.trasferta}`;

export function Pronostici({ partite, giocatori, probabili, loghi, dati }: Props) {
  const [scelta, setScelta] = useState(0);
  // la partita scelta resta nell'indirizzo (#Inter-Parma), così si può condividere e arrivarci dalla Giornata
  useEffect(() => {
    const da = decodeURIComponent(window.location.hash.slice(1));
    const i = partite.findIndex((p) => chiaveDi(p) === da);
    if (i >= 0) setScelta(i);
  }, [partite]);
  const scegli = (i: number) => {
    setScelta(i);
    history.replaceState(null, "", `#${encodeURIComponent(chiaveDi(partite[i]))}`);
  };
  const p = partite[scelta];

  return (
    <>
      <Proiezione dati={dati} loghi={loghi} />

      <section className="pronostici" aria-labelledby="partite-titolo">
        <h2 id="partite-titolo" className="etichetta">
          Le partite della giornata {dati.giornata}
        </h2>
        <ul className="striscia-pronostici">
          {partite.map((x, i) => {
            const m = mercati(x);
            const [uno, ics, due] = m;
            return (
              <li key={chiaveDi(x)}>
                <button type="button" aria-pressed={i === scelta} onClick={() => scegli(i)} aria-label={`${x.casa} – ${x.trasferta}`}>
                  <span className="striscia-squadre">
                    <Distintivo squadra={x.casa} logo={loghi[x.casa]} />
                    <span>
                      {x.casa}
                      <br />
                      {x.trasferta}
                    </span>
                    <Distintivo squadra={x.trasferta} logo={loghi[x.trasferta]} />
                  </span>
                  <span className="mini-esiti">
                    <span style={{ flexGrow: uno.p }} className="esito-1" />
                    <span style={{ flexGrow: ics.p }} className="esito-x" />
                    <span style={{ flexGrow: due.p }} className="esito-2" />
                  </span>
                  <span className="striscia-quando">
                    {data(x.data).replace(/ \w+$/, "")} {x.ora} · 1 {pct(uno.p)} X {pct(ics.p)} 2 {pct(due.p)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {p && (
          <SchedaPartita
            key={chiaveDi(p)}
            p={p}
            d={dati.partite[chiaveDi(p)]}
            giocatori={giocatori}
            probabili={probabili}
            loghi={loghi}
          />
        )}
      </section>

      <p className="avvertenza-gioco">
        Pronostici statistici a scopo informativo, non consigli di gioco. Le quote sono riportate come informazione, senza
        promozione né collegamenti ai bookmaker. Il gioco è vietato ai minori di 18 anni e può causare dipendenza
        patologica.
      </p>
    </>
  );
}

// ---------- Proiezione del campionato ----------

function Calore({ p }: { p: number }) {
  // più alta la probabilità, più intenso l'evidenziatore
  const alfa = p <= 0 ? 0 : 0.12 + 0.88 * Math.min(1, p);
  return (
    <td className="calore" style={{ "--alfa": alfa } as React.CSSProperties}>
      {p < 0.005 ? (p > 0 ? "<1%" : "–") : pct(p)}
    </td>
  );
}

function Proiezione({ dati, loghi }: { dati: DatiPronostici; loghi: Record<string, string> }) {
  const [tutte, setTutte] = useState(false);
  if (!dati.proiezione.length) return null;
  const massimo = Math.max(...dati.proiezione.map((r) => r.punti_attesi));
  const pos = new Map(dati.classifica.map((r) => [r.squadra, r]));
  const righe = tutte ? dati.proiezione : dati.proiezione.slice(0, 20);
  return (
    <section className="scheda proiezione" aria-labelledby="proiezione-titolo">
      <div className="titolo-con-azione">
        <h2 id="proiezione-titolo">Come finisce il campionato</h2>
        <span className="nota-piccola">
          {dati.simulazioni.toLocaleString("it-IT")} simulazioni del resto della stagione
        </span>
      </div>
      <p className="nota-piccola">
        Ogni partita ancora da giocare viene simulata con i gol attesi di attacco e difesa delle due squadre (dalle quote delle
        ultime 10 partite). Punti attesi e probabilità sono la media delle simulazioni.
      </p>
      <div className="tabella-scorrevole">
        <table className="tabella-proiezione">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Squadra</th>
              <th scope="col" title="Punti in classifica oggi">Punti</th>
              <th scope="col">Punti attesi a fine stagione</th>
              <th scope="col">Scudetto</th>
              <th scope="col">Champions</th>
              <th scope="col">Europa L.</th>
              <th scope="col">Conference</th>
              <th scope="col">Retrocessione</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r, i) => (
              <tr key={r.squadra}>
                <td className="pos">{i + 1}</td>
                <th scope="row">
                  <span className="squadra-cella">
                    <Distintivo squadra={r.squadra} logo={loghi[r.squadra]} />
                    {r.squadra}
                    <span className="nota-piccola">oggi {pos.get(r.squadra)?.pos ?? "–"}°</span>
                  </span>
                </th>
                <td className="numero">{r.punti}</td>
                <td>
                  <span className="barra-punti">
                    <span style={{ width: `${(r.punti_attesi / massimo) * 100}%` }} />
                    <b>{voto(r.punti_attesi)}</b>
                  </span>
                </td>
                <Calore p={r.p_scudetto} />
                <Calore p={r.p_champions} />
                <Calore p={r.p_europa} />
                <Calore p={r.p_conference} />
                <td className="calore retro" style={{ "--alfa": r.p_retrocessione > 0 ? 0.12 + 0.88 * r.p_retrocessione : 0 } as React.CSSProperties}>
                  {r.p_retrocessione < 0.005 ? (r.p_retrocessione > 0 ? "<1%" : "–") : pct(r.p_retrocessione)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dati.proiezione.length > 20 && (
        <button type="button" className="secondario" onClick={() => setTutte(!tutte)}>
          {tutte ? "Mostra meno" : "Mostra tutte"}
        </button>
      )}
    </section>
  );
}

// ---------- Scheda della partita ----------

function SchedaPartita({
  p,
  d,
  giocatori,
  probabili,
  loghi,
}: {
  p: Partita;
  d: DatiPartita | undefined;
  giocatori: Giocatore[];
  probabili: Record<string, PartitaProbabile>;
  loghi: Record<string, string>;
}) {
  const m = useMemo(() => mercati(p), [p]);
  const perId = useMemo(() => new Map(giocatori.map((g) => [g.id, g])), [giocatori]);
  const sos = probabili[chiaveDi(p)];
  const [casa, trasferta] = useMemo(() => {
    const rosa = (s: string) => giocatori.filter((g) => g.squadra === s);
    return [
      formazioneSquadra(p.casa, rosa(p.casa), perId, sos?.lati.casa, sos?.moduli.casa),
      formazioneSquadra(p.trasferta, rosa(p.trasferta), perId, sos?.lati.trasferta, sos?.moduli.trasferta),
    ];
  }, [p, sos, giocatori, perId]);
  const libri = d?.quote?.libri ?? [];
  const scelte = pronosticoStatistico(m, p);

  return (
    <article className="scheda-pronostico" aria-label={`${p.casa} – ${p.trasferta}`}>
      <header className="testata-pronostico">
        <div className="squadra-partita">
          <Distintivo squadra={p.casa} logo={loghi[p.casa]} grande />
          <span>
            <strong>{p.casa}</strong>
            <span className="modulo-partita">{d?.posizione.casa ? `${d.posizione.casa}° in classifica` : ""}</span>
          </span>
        </div>
        <div className="centro-partita">
          <span>
            {data(p.data)} · {p.ora}
          </span>
          <span className="gol-attesi-grandi">
            {voto(p.xg_casa)} <small>gol attesi</small> {voto(p.xg_trasferta)}
          </span>
        </div>
        <div className="squadra-partita trasferta">
          <span>
            <strong>{p.trasferta}</strong>
            <span className="modulo-partita">{d?.posizione.trasferta ? `${d.posizione.trasferta}° in classifica` : ""}</span>
          </span>
          <Distintivo squadra={p.trasferta} logo={loghi[p.trasferta]} grande />
        </div>
      </header>

      <div className="griglia-pronostico">
        <section className="riquadro" aria-label="Il pronostico">
          <h3>Il pronostico</h3>
          <ul className="scelte">
            {scelte.map((s) => (
              <li key={s.titolo}>
                <span className="scelta-titolo">{s.titolo}</span>
                <strong>{s.mercato.nome}</strong>
                <span className="scelta-numeri">
                  <span className="scelta-p">{pct(s.mercato.p)}</span>
                  <span>quota equa {quota(quotaEqua(s.mercato.p))}</span>
                  {libri.map((l) => {
                    const q = l[s.mercato.chiave];
                    return typeof q === "number" ? (
                      <span key={l.nome}>
                        {l.nome} {quota(q)}
                      </span>
                    ) : null;
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p className="nota-piccola">
            Le previsioni del modello, non consigli di gioco. Nel nostro test sulla Serie A 2021-2026 i prezzi dei bookmaker
            italiani non lasciavano margini sfruttabili.
          </p>
        </section>

        <section className="riquadro" aria-label="Esito finale">
          <h3>Esito finale</h3>
          <div className="esiti-grandi">
            {m.slice(0, 3).map((x, i) => (
              <div key={x.chiave} className={`esito-grande esito-${i === 1 ? "x" : x.chiave}`}>
                <span className="esito-segno">{x.chiave}</span>
                <span className="esito-p">{pct(x.p)}</span>
                <span className="nota-piccola">quota equa {quota(quotaEqua(x.p))}</span>
              </div>
            ))}
          </div>
          <Griglia p={p} />
        </section>

        <section className="riquadro" aria-label="Quote">
          <h3>Quote</h3>
          <TabellaQuote libri={libri} m={m} fonte={d?.quote?.fonte} />
        </section>
      </div>

      <div className="griglia-pronostico">
        <section className="riquadro largo-2" aria-label="Tutti i mercati">
          <h3>Tutti i mercati</h3>
          <TuttiIMercati m={m} libri={libri} />
        </section>
        <section className="riquadro" aria-label="Da sapere">
          <h3>Da sapere</h3>
          <SchedeDaSapere schede={daSapere(p, pronostico(p), casa, trasferta)} loghi={loghi} />
        </section>
      </div>

      {d && (
        <div className="griglia-pronostico">
          <section className="riquadro largo-2" aria-label="Statistiche a confronto">
            <h3>Statistiche della stagione</h3>
            <Confronto d={d} p={p} />
          </section>
          <section className="riquadro" aria-label="Forma e precedenti">
            <h3>Forma</h3>
            <Forma squadra={p.casa} forma={d.forma.casa} loghi={loghi} />
            <Forma squadra={p.trasferta} forma={d.forma.trasferta} loghi={loghi} />
            <h3 className="sotto-titolo">Precedenti</h3>
            {d.precedenti.length ? (
              <ul className="precedenti">
                {d.precedenti.map((x) => (
                  <li key={x.data}>
                    <span className="nota-piccola">{new Date(`${x.data}T12:00:00`).toLocaleDateString("it-IT", { month: "short", year: "numeric" })}</span>
                    <span className={x.gol_casa > x.gol_trasferta ? "vince" : ""}>{x.casa}</span>
                    <strong>
                      {x.gol_casa}-{x.gol_trasferta}
                    </strong>
                    <span className={x.gol_trasferta > x.gol_casa ? "vince" : ""}>{x.trasferta}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nota-piccola">Nessun precedente in Serie A dal 2021.</p>
            )}
          </section>
        </div>
      )}

      {casa && trasferta && (
        <div className="griglia-pronostico">
          <Evidenze titolo="Possibili marcatori" voci={migliori([...casa.titolari, ...trasferta.titolari], pGol, 5)} />
          <Evidenze titolo="Possibili assist" voci={migliori([...casa.titolari, ...trasferta.titolari], pAssist, 5)} />
          <Evidenze titolo="Rischio cartellino" voci={migliori([...casa.titolari, ...trasferta.titolari], pCartellino, 5)} />
        </div>
      )}
      <p className="nota-piccola fonte-probabili">
        Gol attesi {p.fonte_contesto === "quote" ? "dalle quote dei bookmaker" : "stimati dalla forza delle squadre"}; statistiche e
        precedenti: football-data.co.uk; giocatori: il nostro modello.
      </p>
    </article>
  );
}

// ---------- Pezzi della scheda ----------

function Griglia({ p }: { p: Partita }) {
  const g = matriceRisultati(p);
  const massimo = Math.max(...g.flat());
  return (
    <>
      <p className="etichetta-riquadro">Risultati esatti</p>
      <table className="griglia-risultati">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">
                Gol {p.casa} per gol {p.trasferta}
              </span>
            </th>
            {g[0].map((_, j) => (
              <th key={j} scope="col">
                {j}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {g.map((riga, i) => (
            <tr key={i}>
              <th scope="row">{i}</th>
              {riga.map((q, j) => (
                <td
                  key={j}
                  className={`cella-risultato ${i > j ? "vittoria-casa" : i < j ? "vittoria-trasferta" : "pari"}`}
                  style={{ "--alfa": q / massimo } as React.CSSProperties}
                  title={`${i}-${j}: ${pct(q)}`}
                >
                  {q >= 0.01 ? Math.round(q * 100) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="nota-piccola">
        Righe: gol {p.casa}; colonne: gol {p.trasferta}. Percentuali.
      </p>
    </>
  );
}

function TabellaQuote({ libri, m, fonte }: { libri: QuoteLibro[]; m: Mercato[]; fonte?: string }) {
  const righe = m.filter((x) => ["1", "X", "2", "over25", "under25"].includes(x.chiave));
  return (
    <>
      <div className="tabella-scorrevole">
        <table className="tabella-quote">
          <thead>
            <tr>
              <th scope="col">Mercato</th>
              <th scope="col">Quota equa</th>
              {libri.map((l) => (
                <th key={l.nome} scope="col">
                  {l.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righe.map((x) => (
              <tr key={x.chiave}>
                <th scope="row">{x.nome.split(" · ")[0]}</th>
                <td className="numero">{quota(quotaEqua(x.p))}</td>
                {libri.map((l) => {
                  const q = l[x.chiave];
                  return (
                    <td key={l.nome} className="numero">
                      {typeof q === "number" ? quota(q) : "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota-piccola">
        {libri.length
          ? `Quote: ${fonte}. La quota equa è quella senza margine del bookmaker, dalle nostre probabilità.`
          : "Le quote dei bookmaker per questa giornata non sono ancora uscite: di solito si pubblicano 2-3 giorni prima delle partite. Intanto c'è la quota equa, senza margine, dalle nostre probabilità."}
      </p>
    </>
  );
}

function TuttiIMercati({ m, libri }: { m: Mercato[]; libri: QuoteLibro[] }) {
  const gruppi = [...new Set(m.map((x) => x.gruppo))];
  return (
    <div className="gruppi-mercati">
      {gruppi.map((gr) => (
        <div key={gr} className="gruppo-mercato">
          <p className="etichetta-riquadro">{gr}</p>
          <ul>
            {m
              .filter((x) => x.gruppo === gr)
              .map((x) => {
                const libro = libri.find((l) => typeof l[x.chiave] === "number");
                return (
                  <li key={x.chiave}>
                    <span className="mercato-nome">{x.nome}</span>
                    <span className="barra-p" aria-hidden="true">
                      <span style={{ width: `${Math.round(x.p * 100)}%` }} />
                    </span>
                    <span className="mercato-p">{pct(x.p)}</span>
                    <span className="mercato-quota" title="Quota equa (senza margine)">
                      {quota(quotaEqua(x.p))}
                    </span>
                    {libro && (
                      <span className="mercato-libro" title={libro.nome}>
                        {quota(libro[x.chiave] as number)}
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const RIGHE_CONFRONTO: [keyof StatisticheLato, string, "numero" | "pct", boolean][] = [
  ["fatti", "Gol fatti", "numero", true],
  ["subiti", "Gol subiti", "numero", false],
  ["tiri", "Tiri", "numero", true],
  ["tiri_porta", "Tiri in porta", "numero", true],
  ["tiri_subiti", "Tiri concessi", "numero", false],
  ["corner", "Corner", "numero", true],
  ["falli", "Falli", "numero", false],
  ["gialli", "Ammonizioni", "numero", false],
  ["porta_inviolata", "Porta inviolata", "pct", true],
  ["segna", "Partite in cui segna", "pct", true],
  ["over25", "Partite con over 2,5", "pct", true],
  ["gg", "Partite con gol di entrambe", "pct", true],
];

function Confronto({ d, p }: { d: DatiPartita; p: Partita }) {
  const [vista, setVista] = useState<"totale" | "lati">("totale");
  const a = vista === "totale" ? d.statistiche.casa.totale : d.statistiche.casa.casa;
  const b = vista === "totale" ? d.statistiche.trasferta.totale : d.statistiche.trasferta.trasferta;
  return (
    <>
      <div className="reparti" role="group" aria-label="Quali partite">
        <button type="button" aria-pressed={vista === "totale"} onClick={() => setVista("totale")}>
          Tutte le partite
        </button>
        <button type="button" aria-pressed={vista === "lati"} onClick={() => setVista("lati")}>
          {p.casa} in casa, {p.trasferta} in trasferta
        </button>
      </div>
      <p className="nota-piccola">
        Medie a partita: {p.casa} su {a.partite}, {p.trasferta} su {b.partite} partite di questa stagione.
      </p>
      <table className="confronto-statistiche">
        <thead>
          <tr>
            <th scope="col">{p.casa}</th>
            <th scope="col">
              <span className="sr-only">Statistica</span>
            </th>
            <th scope="col">{p.trasferta}</th>
          </tr>
        </thead>
        <tbody>
          {RIGHE_CONFRONTO.map(([k, nome, tipo, meglioAlto]) => {
            const x = a[k] as number | null | undefined;
            const y = b[k] as number | null | undefined;
            if (x == null || y == null) return null;
            const massimo = Math.max(x, y) || 1;
            const fmt = (v: number) => (tipo === "pct" ? pct(v) : v.toFixed(1).replace(".", ","));
            const vinceA = x !== y && (x > y) === meglioAlto;
            const vinceB = x !== y && !vinceA;
            return (
              <tr key={k}>
                <td className={`lato-sinistro${vinceA ? " meglio" : ""}`}>
                  <span className="valore">{fmt(x)}</span>
                  <span className="barra-confronto" style={{ width: `${(x / massimo) * 100}%` }} />
                </td>
                <th scope="row">{nome}</th>
                <td className={`lato-destro${vinceB ? " meglio" : ""}`}>
                  <span className="barra-confronto" style={{ width: `${(y / massimo) * 100}%` }} />
                  <span className="valore">{fmt(y)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function Forma({ squadra, forma, loghi }: { squadra: string; forma: PartitaForma[]; loghi: Record<string, string> }) {
  return (
    <div className="riga-forma">
      <Distintivo squadra={squadra} logo={loghi[squadra]} />
      <div>
        <strong>{squadra}</strong>
        <ol className="pallini-forma" aria-label="Ultime partite, dalla più recente">
          {forma.map((x) => (
            <li key={x.data} className={`forma-${x.esito}`} title={`${x.fatti}-${x.subiti} ${x.casa ? "in casa con" : "in trasferta a"} ${x.avversario}`}>
              {x.esito}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Evidenze({ titolo, voci }: { titolo: string; voci: Evidenza[] }) {
  return (
    <section className="riquadro" aria-label={titolo}>
      <h3>{titolo}</h3>
      <ol className="evidenze">
        {voci.map(({ g, p }) => (
          <li key={g.id}>
            <Faccia g={g} />
            <span>
              <strong>{g.nome}</strong> <span className="nota-piccola">{g.squadra}</span>
            </span>
            <span className="evidenza-p">{pct(p)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TIPI: Record<DaSapere["tipo"], string> = {
  esito: "Esito",
  gol: "Gol",
  risultato: "Risultato",
  porta: "Porta inviolata",
  marcatore: "Marcatore",
  ballottaggi: "Formazione",
  forma: "Forma",
};

function SchedeDaSapere({ schede, loghi }: { schede: DaSapere[]; loghi: Record<string, string> }) {
  return (
    <ul className="schede-sapere">
      {schede.map((x) => (
        <li key={x.tipo + x.titolo} className={`sapere sapere-${x.tipo}`}>
          <span className="sapere-segno">
            {x.giocatore ? (
              <span className="gettone-foto">
                <Faccia g={x.giocatore} taglia="media" />
                <span className="sapere-valore sopra-foto">{x.valore}</span>
              </span>
            ) : x.tipo === "forma" && /^[VNP]+$/.test(x.valore) ? (
              <ol className="pallini-forma" aria-label="Ultime partite, dalla più recente">
                {[...x.valore].map((e, i) => (
                  <li key={i} className={`forma-${e}`}>
                    {e}
                  </li>
                ))}
              </ol>
            ) : (
              <span className="sapere-valore">{x.valore}</span>
            )}
          </span>
          <span className="sapere-testo">
            <span className="sapere-tipo">
              {x.squadra && <Distintivo squadra={x.squadra} logo={loghi[x.squadra]} />}
              {TIPI[x.tipo]}
            </span>
            <strong>{x.titolo}</strong>
            <span>{x.testo}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
