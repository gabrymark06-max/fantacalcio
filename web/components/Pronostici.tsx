"use client";

import { useEffect, useMemo, useState } from "react";

import { Faccia } from "@/components/Campo";
import { Distintivo } from "@/components/Probabili";
import type {
  DatiPartita,
  DatiPronostici,
  PartitaForma,
  QuoteLibro,
  RigaClassifica,
  StatisticheLato,
} from "@/lib/datiPronostici";
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
 * Pagina Pronostici: per ogni partita probabilità di tutti i mercati con la quota equa, le quote
 * dei bookmaker quando sono pubblicate, statistiche di stagione a confronto, forma, precedenti e
 * giocatori; in fondo la proiezione del campionato (come il "supercomputer" di Opta).
 * Contenuto informativo: niente link né promozioni dei bookmaker (linee guida AGCOM sul
 * Decreto Dignità, delibera 132/19/CONS).
 *
 * Colori fissi in tutta la pagina: verde = squadra di casa, blu = squadra in trasferta.
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
const piccola = (p: number) => (p < 0.005 ? (p > 0 ? "<1%" : "–") : pct(p));

/** "1X · Inter non perde" → ["1X", "Inter non perde"]; senza "·" il nome resta intero. */
function dividiNome(nome: string): [string, string] {
  const i = nome.indexOf(" · ");
  return i < 0 ? [nome, ""] : [nome.slice(0, i), nome.slice(i + 3)];
}

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
  const classifica = useMemo(() => new Map(dati.classifica.map((r) => [r.squadra, r])), [dati.classifica]);

  return (
    <div className="pr-pagina">
      <section aria-labelledby="partite-titolo">
        <div className="pr-intestazione">
          <h2 id="partite-titolo" className="etichetta">
            Giornata {dati.giornata} · scegli la partita
          </h2>
          <a className="pr-salto" href="#proiezione-titolo">
            Come finisce il campionato ↓
          </a>
        </div>
        <ul className="pr-partite">
          {partite.map((x, i) => {
            const [uno, ics, due] = mercati(x);
            return (
              <li key={chiaveDi(x)}>
                <button
                  type="button"
                  aria-pressed={i === scelta}
                  onClick={() => scegli(i)}
                  aria-label={`${x.casa} – ${x.trasferta}`}
                >
                  <span className="pr-partita-quando">
                    {data(x.data).replace(/ \w+$/, "")} · {x.ora}
                  </span>
                  <span className="pr-partita-riga">
                    <Distintivo squadra={x.casa} logo={loghi[x.casa]} />
                    <span>{x.casa}</span>
                    <b>{pct(uno.p)}</b>
                  </span>
                  <span className="pr-partita-riga">
                    <Distintivo squadra={x.trasferta} logo={loghi[x.trasferta]} />
                    <span>{x.trasferta}</span>
                    <b>{pct(due.p)}</b>
                  </span>
                  <span className="pr-mini-esiti" aria-hidden="true">
                    <span style={{ flexGrow: uno.p }} className="pr-casa" />
                    <span style={{ flexGrow: ics.p }} className="pr-pari" />
                    <span style={{ flexGrow: due.p }} className="pr-trasferta" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {p && (
        <SchedaPartita
          key={chiaveDi(p)}
          p={p}
          d={dati.partite[chiaveDi(p)]}
          classifica={classifica}
          giocatori={giocatori}
          probabili={probabili}
          loghi={loghi}
        />
      )}

      <Proiezione dati={dati} loghi={loghi} />

      <p className="avvertenza-gioco">
        Pronostici statistici a scopo informativo, non consigli di gioco. Le quote sono riportate come informazione, senza
        promozione né collegamenti ai bookmaker. Il gioco è vietato ai minori di 18 anni e può causare dipendenza patologica.
      </p>
    </div>
  );
}

// ---------- Scheda della partita ----------

function SchedaPartita({
  p,
  d,
  classifica,
  giocatori,
  probabili,
  loghi,
}: {
  p: Partita;
  d: DatiPartita | undefined;
  classifica: Map<string, RigaClassifica>;
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
  const titolari = casa && trasferta ? [...casa.titolari, ...trasferta.titolari] : [];

  return (
    <article className="pr-scheda" aria-label={`${p.casa} – ${p.trasferta}`}>
      <Tabellone p={p} m={m} d={d} classifica={classifica} loghi={loghi} />

      <div className="pr-colonne">
        <div className="pr-colonna">
          <section className="pr-box" aria-labelledby="pr-scelte">
            <h3 id="pr-scelte">Il pronostico</h3>
            <ul className="pr-scelte">
              {scelte.map((s) => {
                const [codice, spiegazione] = dividiNome(s.mercato.nome);
                return (
                  <li
                    key={s.titolo}
                    style={
                      {
                        "--p": `${Math.round(s.mercato.p * 100)}%`,
                      } as React.CSSProperties
                    }
                  >
                    <span className="pr-scelta-tipo">{s.titolo}</span>
                    <span className="pr-scelta-esito">
                      <strong>{codice}</strong>
                      {spiegazione && <span>{spiegazione}</span>}
                    </span>
                    <span className="pr-scelta-p">{pct(s.mercato.p)}</span>
                    <span className="pr-scelta-quote">
                      <span title="Quota equa, senza margine del bookmaker">
                        <small>equa</small> {quota(quotaEqua(s.mercato.p))}
                      </span>
                      {libri.map((l) => {
                        const q = l[s.mercato.chiave];
                        return typeof q === "number" ? (
                          <span key={l.nome}>
                            <small>{l.nome}</small> {quota(q)}
                          </span>
                        ) : null;
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="pr-nota">
              Le previsioni del modello, non consigli di gioco. Nel nostro test sulla Serie A 2021-2026 i prezzi dei bookmaker
              italiani non lasciavano margini sfruttabili.
            </p>
          </section>

          <section className="pr-box" aria-labelledby="pr-mercati">
            <h3 id="pr-mercati">Tutti i mercati</h3>
            <TuttiIMercati m={m} libri={libri} />
          </section>

          {d && (
            <section className="pr-box" aria-labelledby="pr-statistiche">
              <h3 id="pr-statistiche">Statistiche della stagione</h3>
              <Confronto d={d} p={p} loghi={loghi} />
            </section>
          )}
        </div>

        <div className="pr-colonna">
          <section className="pr-box" aria-labelledby="pr-quote">
            <h3 id="pr-quote">Quote</h3>
            <TabellaQuote libri={libri} m={m} fonte={d?.quote?.fonte} />
          </section>

          <section className="pr-box" aria-labelledby="pr-risultati">
            <h3 id="pr-risultati">Risultati esatti</h3>
            <Griglia p={p} loghi={loghi} />
          </section>

          <section className="pr-box" aria-labelledby="pr-sapere">
            <h3 id="pr-sapere">Da sapere</h3>
            <SchedeDaSapere schede={daSapere(p, pronostico(p), casa, trasferta)} loghi={loghi} />
          </section>
        </div>
      </div>

      <div className="pr-giocatori">
        {d && (
          <section className="pr-box" aria-labelledby="pr-precedenti">
            <h3 id="pr-precedenti">Precedenti</h3>
            <Precedenti d={d} p={p} />
          </section>
        )}
        {titolari.length > 0 && (
          <>
            <Evidenze titolo="Possibili marcatori" voci={migliori(titolari, pGol, 5)} />
            <Evidenze titolo="Possibili assist" voci={migliori(titolari, pAssist, 5)} />
            <Evidenze titolo="Rischio cartellino" voci={migliori(titolari, pCartellino, 5)} />
          </>
        )}
      </div>
      <p className="pr-nota pr-fonti">
        Gol attesi {p.fonte_contesto === "quote" ? "dalle quote dei bookmaker" : "stimati dalla forza delle squadre"}; statistiche
        e precedenti: football-data.co.uk; giocatori: il nostro modello.
      </p>
    </article>
  );
}

// ---------- Tabellone: squadre, gol attesi ed esito finale ----------

function Tabellone({
  p,
  m,
  d,
  classifica,
  loghi,
}: {
  p: Partita;
  m: Mercato[];
  d: DatiPartita | undefined;
  classifica: Map<string, RigaClassifica>;
  loghi: Record<string, string>;
}) {
  const [uno, ics, due] = m;
  const lato = (squadra: string, pos: number | null | undefined, forma: PartitaForma[] | undefined, trasferta: boolean) => {
    const r = classifica.get(squadra);
    return (
      <div className={`pr-tab-squadra${trasferta ? " trasferta" : ""}`}>
        <Distintivo squadra={squadra} logo={loghi[squadra]} grande />
        <div>
          <strong>{squadra}</strong>
          <span className="pr-tab-pos">
            {pos ? `${pos}° in classifica` : "–"}
            {r ? ` · ${r.pt} pt` : ""}
          </span>
          {forma && forma.length > 0 && <Pallini forma={forma} />}
        </div>
      </div>
    );
  };
  return (
    <header className="pr-tabellone">
      {lato(p.casa, d?.posizione.casa, d?.forma.casa, false)}
      <div className="pr-tab-centro">
        <span className="pr-tab-quando">
          {data(p.data)} · {p.ora}
        </span>
        <span className="pr-tab-xg" aria-label={`Gol attesi: ${voto(p.xg_casa)} a ${voto(p.xg_trasferta)}`}>
          <b>{voto(p.xg_casa)}</b>
          <i>:</i>
          <b>{voto(p.xg_trasferta)}</b>
        </span>
        <span className="pr-tab-etichetta">gol attesi</span>
      </div>
      {lato(p.trasferta, d?.posizione.trasferta, d?.forma.trasferta, true)}

      <div className="pr-tab-esiti">
        <div className="pr-barra-esiti" aria-hidden="true">
          <span className="pr-casa" style={{ flexGrow: uno.p }} />
          <span className="pr-pari" style={{ flexGrow: ics.p }} />
          <span className="pr-trasferta" style={{ flexGrow: due.p }} />
        </div>
        <dl className="pr-esiti-numeri">
          {[
            [uno, `Vince ${p.casa}`],
            [ics, "Pareggio"],
            [due, `Vince ${p.trasferta}`],
          ].map(([x, testo]) => {
            const mk = x as Mercato;
            return (
              <div key={mk.chiave}>
                <dt>
                  <b>{mk.chiave}</b> {testo as string}
                </dt>
                <dd>
                  <span className="pr-esito-p">{pct(mk.p)}</span>
                  <span className="pr-esito-q">quota equa {quota(quotaEqua(mk.p))}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </header>
  );
}

function Pallini({ forma }: { forma: PartitaForma[] }) {
  return (
    <ol className="pallini-forma pr-pallini" aria-label="Ultime partite, dalla più recente">
      {forma.map((x) => (
        <li
          key={x.data}
          className={`forma-${x.esito}`}
          title={`${x.fatti}-${x.subiti} ${x.casa ? "in casa con" : "in trasferta a"} ${x.avversario}`}
        >
          {x.esito}
        </li>
      ))}
    </ol>
  );
}

// ---------- Pezzi della scheda ----------

function Griglia({ p, loghi }: { p: Partita; loghi: Record<string, string> }) {
  const g = matriceRisultati(p, 4);
  const massimo = Math.max(...g.flat());
  const top = g
    .flatMap((riga, i) => riga.map((q, j) => ({ i, j, q })))
    .sort((a, b) => b.q - a.q)
    .slice(0, 3);
  return (
    <>
      <ol className="pr-top-risultati">
        {top.map((x) => (
          <li key={`${x.i}-${x.j}`}>
            <strong>
              {x.i}-{x.j}
            </strong>
            <span>{pct(x.q)}</span>
          </li>
        ))}
      </ol>
      <table className="pr-griglia">
        <caption className="sr-only">
          Probabilità di ogni risultato: righe gol {p.casa}, colonne gol {p.trasferta}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="pr-griglia-angolo">
              <Distintivo squadra={p.casa} logo={loghi[p.casa]} />
              <Distintivo squadra={p.trasferta} logo={loghi[p.trasferta]} />
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
                  className={i > j ? "pr-casa" : i < j ? "pr-trasferta" : "pr-pari"}
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
      <p className="pr-nota">
        Righe: gol {p.casa} · colonne: gol {p.trasferta}. Valori in percentuale; verde vince {p.casa}, blu vince {p.trasferta}.
      </p>
    </>
  );
}

function TabellaQuote({ libri, m, fonte }: { libri: QuoteLibro[]; m: Mercato[]; fonte?: string }) {
  const righe = m.filter((x) => ["1", "X", "2", "over25", "under25"].includes(x.chiave));
  return (
    <>
      <table className="pr-quote">
        <thead>
          <tr>
            <th scope="col">Esito</th>
            <th scope="col">Prob.</th>
            <th scope="col">Equa</th>
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
              <th scope="row">{dividiNome(x.nome)[0]}</th>
              <td>{pct(x.p)}</td>
              <td className="pr-equa">{quota(quotaEqua(x.p))}</td>
              {libri.map((l) => {
                const q = l[x.chiave];
                return <td key={l.nome}>{typeof q === "number" ? quota(q) : "–"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pr-nota">
        {libri.length
          ? `Quote: ${fonte}. La quota equa è quella senza margine del bookmaker, dalle nostre probabilità.`
          : "Le quote dei bookmaker non sono ancora uscite: di solito arrivano 2-3 giorni prima della partita. Intanto c'è la quota equa, senza margine, dalle nostre probabilità."}
      </p>
    </>
  );
}

function TuttiIMercati({ m, libri }: { m: Mercato[]; libri: QuoteLibro[] }) {
  const gruppi = [...new Set(m.map((x) => x.gruppo))];
  return (
    <div className="pr-mercati">
      {gruppi.map((gr) => (
        <div key={gr} className="pr-gruppo">
          <p className="pr-gruppo-titolo">
            <span>{gr}</span>
            <span>prob.</span>
            <span>equa</span>
          </p>
          <ul>
            {m
              .filter((x) => x.gruppo === gr)
              .map((x) => {
                const libro = libri.find((l) => typeof l[x.chiave] === "number");
                const [codice, spiegazione] = dividiNome(x.nome);
                return (
                  <li
                    key={x.chiave}
                    className={x.p >= 0.5 ? "pr-probabile" : ""}
                    style={
                      {
                        "--p": `${Math.round(x.p * 100)}%`,
                      } as React.CSSProperties
                    }
                  >
                    <span className="pr-mercato-nome">
                      <b>{codice}</b>
                      {spiegazione && <span>{spiegazione}</span>}
                    </span>
                    <span className="pr-mercato-p">{pct(x.p)}</span>
                    <span
                      className="pr-mercato-q"
                      title={libro ? `${libro.nome}: ${quota(libro[x.chiave] as number)}` : "Quota equa, senza margine"}
                    >
                      {quota(quotaEqua(x.p))}
                    </span>
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

function Confronto({ d, p, loghi }: { d: DatiPartita; p: Partita; loghi: Record<string, string> }) {
  const [vista, setVista] = useState<"totale" | "lati">("totale");
  const a = vista === "totale" ? d.statistiche.casa.totale : d.statistiche.casa.casa;
  const b = vista === "totale" ? d.statistiche.trasferta.totale : d.statistiche.trasferta.trasferta;
  return (
    <>
      <div className="pr-confronto-testa">
        <span className="pr-confronto-squadra">
          <Distintivo squadra={p.casa} logo={loghi[p.casa]} />
          {p.casa}
          <small>{a.partite} partite</small>
        </span>
        <div className="reparti pr-vista" role="group" aria-label="Quali partite">
          <button type="button" aria-pressed={vista === "totale"} onClick={() => setVista("totale")}>
            Tutte
          </button>
          <button type="button" aria-pressed={vista === "lati"} onClick={() => setVista("lati")}>
            Casa / trasferta
          </button>
        </div>
        <span className="pr-confronto-squadra trasferta">
          <small>{b.partite} partite</small>
          {p.trasferta}
          <Distintivo squadra={p.trasferta} logo={loghi[p.trasferta]} />
        </span>
      </div>
      <ul className="pr-confronto">
        {RIGHE_CONFRONTO.map(([k, nome, tipo, meglioAlto]) => {
          const x = a[k] as number | null | undefined;
          const y = b[k] as number | null | undefined;
          if (x == null || y == null) return null;
          const fmt = (v: number) => (tipo === "pct" ? pct(v) : v.toFixed(1).replace(".", ","));
          const vinceA = x !== y && x > y === meglioAlto;
          const vinceB = x !== y && !vinceA;
          const vuoto = x + y === 0;
          return (
            <li key={k}>
              <span className={`pr-valore${vinceA ? " meglio" : ""}`}>{fmt(x)}</span>
              <span className="pr-confronto-nome">{nome}</span>
              <span className={`pr-valore trasferta${vinceB ? " meglio" : ""}`}>{fmt(y)}</span>
              <span className="pr-confronto-barra" aria-hidden="true">
                <i className={`pr-casa${vinceA ? " meglio" : ""}`} style={{ flexGrow: vuoto ? 1 : x }} />
                <i className={`pr-trasferta${vinceB ? " meglio" : ""}`} style={{ flexGrow: vuoto ? 1 : y }} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="pr-nota">
        Medie a partita di questa stagione
        {vista === "lati" ? `: ${p.casa} solo in casa, ${p.trasferta} solo in trasferta` : ""}. Più colorato chi fa meglio (per
        gol subiti, tiri concessi, falli e ammonizioni meglio meno).
      </p>
    </>
  );
}

function Precedenti({ d, p }: { d: DatiPartita; p: Partita }) {
  if (!d.precedenti.length) return <p className="pr-nota">Nessun precedente in Serie A dal 2021.</p>;
  const vinte = (s: string) =>
    d.precedenti.filter((x) => (x.casa === s ? x.gol_casa > x.gol_trasferta : x.trasferta === s && x.gol_trasferta > x.gol_casa))
      .length;
  const va = vinte(p.casa);
  const vb = vinte(p.trasferta);
  return (
    <>
      <p className="pr-bilancio">
        <span className="pr-casa-testo">
          <b>{va}</b> {p.casa}
        </span>
        <span>
          <b>{d.precedenti.length - va - vb}</b> pari
        </span>
        <span className="pr-trasferta-testo">
          <b>{vb}</b> {p.trasferta}
        </span>
      </p>
      <ul className="pr-precedenti">
        {d.precedenti.map((x) => (
          <li key={x.data}>
            <span className="pr-precedente-data">
              {new Date(`${x.data}T12:00:00`).toLocaleDateString("it-IT", {
                month: "short",
                year: "numeric",
              })}
            </span>
            <span className={x.gol_casa > x.gol_trasferta ? "vince" : ""}>{x.casa}</span>
            <strong>
              {x.gol_casa}-{x.gol_trasferta}
            </strong>
            <span className={x.gol_trasferta > x.gol_casa ? "vince" : ""}>{x.trasferta}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Evidenze({ titolo, voci }: { titolo: string; voci: Evidenza[] }) {
  const massimo = Math.max(...voci.map((v) => v.p), 0.01);
  return (
    <section className="pr-box" aria-label={titolo}>
      <h3>{titolo}</h3>
      <ol className="pr-evidenze">
        {voci.map(({ g, p }) => (
          <li
            key={g.id}
            style={
              {
                "--p": `${Math.round((p / massimo) * 100)}%`,
              } as React.CSSProperties
            }
          >
            <Faccia g={g} />
            <span className="pr-evidenza-nome">
              <strong>{g.nome}</strong>
              <small>{g.squadra}</small>
            </span>
            <span className="pr-evidenza-p">{pct(p)}</span>
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
    <ul className="schede-sapere pr-sapere">
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

// ---------- Proiezione del campionato ----------

function Calore({ p, retro = false }: { p: number; retro?: boolean }) {
  // più alta la probabilità, più intenso il colore
  const alfa = p <= 0 ? 0 : 0.12 + 0.88 * Math.min(1, p);
  return (
    <td className={`pr-calore${retro ? " retro" : ""}`} style={{ "--alfa": alfa } as React.CSSProperties}>
      {piccola(p)}
    </td>
  );
}

function Proiezione({ dati, loghi }: { dati: DatiPronostici; loghi: Record<string, string> }) {
  if (!dati.proiezione.length) return null;
  const massimo = Math.max(...dati.proiezione.map((r) => r.punti_attesi));
  const pos = new Map(dati.classifica.map((r) => [r.squadra, r]));
  // zone della classifica finale attesa: Champions (1-4), Europa (5), Conference (6), retrocessione (18-20)
  const zona = (i: number) => (i < 4 ? "champions" : i === 4 ? "europa" : i === 5 ? "conference" : i >= 17 ? "retro" : "");
  return (
    <section className="pr-proiezione" aria-labelledby="proiezione-titolo">
      <div className="pr-proiezione-testa">
        <div>
          <h2 id="proiezione-titolo">Come finisce il campionato</h2>
          <p className="pr-nota">
            Ogni partita ancora da giocare simulata {dati.simulazioni.toLocaleString("it-IT")} volte con i gol attesi di attacco e
            difesa delle due squadre (dalle quote delle ultime 10 partite). Punti e probabilità sono la media delle simulazioni.
          </p>
        </div>
        <ul className="pr-legenda" aria-label="Zone della classifica">
          <li className="champions">Champions</li>
          <li className="europa">Europa League</li>
          <li className="conference">Conference</li>
          <li className="retro">Retrocessione</li>
        </ul>
      </div>
      <div className="tabella-scorrevole">
        <table className="pr-tabella-proiezione">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Squadra</th>
              <th scope="col" title="Punti in classifica oggi">
                Punti oggi
              </th>
              <th scope="col">Punti attesi</th>
              <th scope="col">Scudetto</th>
              <th scope="col">Top 4</th>
              <th scope="col">Europa L.</th>
              <th scope="col">Conference</th>
              <th scope="col">Retrocessione</th>
            </tr>
          </thead>
          <tbody>
            {dati.proiezione.map((r, i) => (
              <tr key={r.squadra} className={zona(i)}>
                <td className="pr-pos">{i + 1}</td>
                <th scope="row">
                  <span className="pr-squadra-cella">
                    <Distintivo squadra={r.squadra} logo={loghi[r.squadra]} />
                    <span>{r.squadra}</span>
                    <small>oggi {pos.get(r.squadra)?.pos ?? "–"}°</small>
                  </span>
                </th>
                <td className="pr-numero">{r.punti}</td>
                <td>
                  <span className="pr-barra-punti">
                    <span style={{ width: `${(r.punti_attesi / massimo) * 100}%` }} />
                    <b>{voto(r.punti_attesi)}</b>
                  </span>
                </td>
                <Calore p={r.p_scudetto} />
                <Calore p={r.p_champions} />
                <Calore p={r.p_europa} />
                <Calore p={r.p_conference} />
                <Calore p={r.p_retrocessione} retro />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
