"use client";

import { useMemo, useState } from "react";

import { Faccia, LineeCampo } from "@/components/Campo";
import { data, pct, voto } from "@/lib/format";
import { COLORI, formazioneSquadra, sigla, type FormazioneSquadra, type Nominato, type PartitaProbabile } from "@/lib/probabili";
import type { Giocatore, Partita } from "@/lib/types";

/*
 * Probabili formazioni della giornata, una partita alla volta: i due campi ai lati, al
 * centro il confronto titolare per titolare (probabilità di giocare e fantavoto atteso),
 * sotto ogni campo ballottaggi e indisponibili.
 */

interface Props {
  loghi: Record<string, string>;
  partite: Partita[];
  giocatori: Giocatore[];
  probabili: Record<string, PartitaProbabile>;
}

const eGiocatore = (g: Giocatore | Nominato): g is Giocatore => "ruolo" in g;

/** Tono del fantavoto atteso: chi quasi certamente non gioca è spento. */
function tono(g: Giocatore): string {
  if (g.p_gioca < 0.2) return "spento";
  return g.fv_atteso >= 7 ? "alto" : g.fv_atteso >= 6.3 ? "medio" : "basso";
}

/** Logo della squadra se c'è (sul proprio PC, da SOS Fanta), altrimenti sigla nei colori sociali. */
export function Distintivo({ squadra, logo, grande = false }: { squadra: string; logo?: string | null; grande?: boolean }) {
  const [errore, setErrore] = useState(false);
  const [sfondo, testo] = COLORI[squadra] ?? ["#52607a", "#ffffff"];
  if (logo && !errore) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- immagine esterna, niente ottimizzazione
      <img className={`logo-squadra${grande ? " grande" : ""}`} src={logo} alt="" onError={() => setErrore(true)} />
    );
  }
  return (
    <span className={`distintivo${grande ? " grande" : ""}`} style={{ background: sfondo, color: testo }} aria-hidden="true">
      {sigla(squadra)}
    </span>
  );
}

export function Probabili({ partite, giocatori, probabili, loghi: loghiSquadre }: Props) {
  const [scelta, setScelta] = useState(0);
  const perId = useMemo(() => new Map(giocatori.map((g) => [g.id, g])), [giocatori]);
  const loghi = useMemo(() => {
    const out: Record<string, string> = { ...loghiSquadre };
    for (const [chiave, x] of Object.entries(probabili)) {
      const [c, t] = chiave.split("-");
      if (x.loghi?.casa) out[c] = x.loghi.casa;
      if (x.loghi?.trasferta) out[t] = x.loghi.trasferta;
    }
    return out;
  }, [probabili, loghiSquadre]);
  const p = partite[scelta];
  const sos = probabili[`${p.casa}-${p.trasferta}`];
  const [casa, trasferta] = useMemo(() => {
    const rosa = (s: string) => giocatori.filter((g) => g.squadra === s);
    return [
      formazioneSquadra(p.casa, rosa(p.casa), perId, sos?.lati.casa, sos?.moduli.casa),
      formazioneSquadra(p.trasferta, rosa(p.trasferta), perId, sos?.lati.trasferta, sos?.moduli.trasferta),
    ];
  }, [p, sos, giocatori, perId]);

  return (
    <section className="probabili" aria-labelledby="probabili-titolo">
      <h2 id="probabili-titolo" className="etichetta">
        Probabili formazioni
      </h2>
      <ul className="striscia-partite">
        {partite.map((x, i) => (
          <li key={`${x.casa}-${x.trasferta}`}>
            <button type="button" aria-pressed={i === scelta} onClick={() => setScelta(i)} aria-label={`${x.casa} – ${x.trasferta}`}>
              <span className="coppia">
                <Distintivo squadra={x.casa} logo={loghi[x.casa]} />
                <Distintivo squadra={x.trasferta} logo={loghi[x.trasferta]} />
              </span>
              <span className="striscia-quando">
                {data(x.data).replace(/ \w+$/, "")} {x.ora}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <header className="testata-partita">
        <div className="squadra-partita">
          <Distintivo squadra={p.casa} logo={loghi[p.casa]} grande />
          <span>
            <strong>{p.casa}</strong>
            <span className="modulo-partita">{casa?.modulo}</span>
          </span>
        </div>
        <div className="centro-partita">
          <span>
            {data(p.data)} · {p.ora}
          </span>
          <span className="esiti" title="Probabilità di 1, X, 2">
            1 {pct(p.p1)} · X {pct(p.px)} · 2 {pct(p.p2)}
          </span>
        </div>
        <div className="squadra-partita trasferta">
          <span>
            <strong>{p.trasferta}</strong>
            <span className="modulo-partita">{trasferta?.modulo}</span>
          </span>
          <Distintivo squadra={p.trasferta} logo={loghi[p.trasferta]} grande />
        </div>
      </header>

      {casa && trasferta ? (
        <div className="tavolo-partita">
          <ColonnaSquadra f={casa} lato="casa" />
          <div className="colonna-centrale">
            <Confronto casa={casa} trasferta={trasferta} />
          </div>
          <ColonnaSquadra f={trasferta} lato="trasferta" />
        </div>
      ) : null}
      {casa && trasferta && (
        <p className="rimando-pronostico">
          <a href={`/pronostici#${encodeURIComponent(`${p.casa}-${p.trasferta}`)}`}>
            Pronostico completo di {p.casa} – {p.trasferta}: mercati, quote, statistiche e precedenti →
          </a>
        </p>
      )}
      {!(casa && trasferta) && (
        <p className="vuoto">Rose incomplete nel listone: non si può mostrare la formazione.</p>
      )}
      <p className="nota-piccola fonte-probabili">
        {casa?.fonte === "sos" && trasferta?.fonte === "sos"
          ? "Formazioni, ballottaggi e indisponibili: SOS Fanta. Probabilità di giocare e fantavoto atteso: il nostro modello."
          : "Formazioni stimate dal modello: per ogni reparto chi ha la probabilità di giocare più alta."}
      </p>
    </section>
  );
}

// ---------- Campo e colonne laterali ----------

function Pedina({ g }: { g: Giocatore }) {
  return (
    <li className="pedina-partita" title={`${g.nome}: gioca ${pct(g.p_gioca)}, fantavoto atteso ${voto(g.fv_atteso)}`}>
      <span className="gettone-foto">
        <Faccia g={g} taglia="media" />
        <span className={`fv-badge fv-${tono(g)}`}>{voto(g.fv_atteso)}</span>
      </span>
      <span className="gettone-nome">{g.nome}</span>
    </li>
  );
}

function ColonnaSquadra({ f, lato }: { f: FormazioneSquadra; lato: "casa" | "trasferta" }) {
  return (
    <div className={`colonna-partita colonna-${lato}`}>
      <div className="mini-campo campo-partita" role="group" aria-label={`${f.squadra}, ${f.modulo}`}>
        <LineeCampo />
        {[...f.linee].reverse().map((linea, i) => (
          <ol key={i} className="mini-linea">
            {linea.map((g) => (
              <Pedina key={g.id} g={g} />
            ))}
          </ol>
        ))}
      </div>
      <section className="riquadro riquadro-ballottaggi" aria-label={`Ballottaggi ${f.squadra}`}>
        <h3>Ballottaggi</h3>
        {f.ballottaggi.length === 0 ? (
          <p className="riquadro-vuoto">{f.fonte === "sos" ? "Nessun ballottaggio." : "Disponibili con le probabili formazioni."}</p>
        ) : (
          <ul className="ballottaggi">
            {f.ballottaggi.map((b, i) => (
              <li key={i}>
                <span className="duo-facce">
                  <FacciaONome g={b.a} />
                  <FacciaONome g={b.b} />
                </span>
                <span className="ballottaggio-testo">
                  <span>
                    <strong>{b.pa}%</strong> {b.a.nome}
                  </span>
                  <span className="contro">
                    {b.b.nome} <strong>{b.pb}%</strong>
                  </span>
                </span>
                <span className="barra-ballottaggio" style={{ "--quota": `${b.pa}%` } as React.CSSProperties} aria-hidden="true" />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="riquadro riquadro-indisponibili" aria-label={`Indisponibili ${f.squadra}`}>
        <h3>Indisponibili</h3>
        {f.indisponibili.length === 0 ? (
          <p className="riquadro-vuoto">{f.fonte === "sos" ? "Nessun indisponibile." : "Disponibili con le probabili formazioni."}</p>
        ) : (
          <ul className="indisponibili">
            {f.indisponibili.map((x, i) => (
              <li key={i}>
                <FacciaONome g={x.g} />
                <span>
                  <strong>{x.g.nome}</strong>
                  {x.stato && <span className="stato-indisponibile">{x.stato}</span>}
                  {x.nota && <span className="nota-indisponibile">{x.nota}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FacciaONome({ g }: { g: Giocatore | Nominato }) {
  if (eGiocatore(g)) return <Faccia g={g} />;
  return (
    <span className="faccia" aria-hidden="true">
      <span className="iniziali">{g.nome.slice(0, 2).toUpperCase()}</span>
    </span>
  );
}

// ---------- Confronto al centro ----------

function Riga({ g, lato }: { g: Giocatore; lato: "casa" | "trasferta" }) {
  return (
    <div className={`riga-duello ${lato}`}>
      <span className="gettone-foto">
        <Faccia g={g} />
        <span className={`ruolo ruolo-${g.ruolo}`}>{g.ruolo}</span>
      </span>
      <span className="duello-chi">
        <span className="duello-nome">{g.nome}</span>
        <span className="duello-p">
          {pct(g.p_gioca)}
          <span className="barra-p" aria-hidden="true">
            <span style={{ width: `${Math.round(g.p_gioca * 100)}%` }} />
          </span>
        </span>
      </span>
      <span className={`fv-badge grande fv-${tono(g)}`}>{voto(g.fv_atteso)}</span>
    </div>
  );
}

function Duelli({ casa, trasferta }: { casa: Giocatore[]; trasferta: Giocatore[] }) {
  const n = Math.max(casa.length, trasferta.length);
  return (
    <ol className="duelli">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          {casa[i] ? <Riga g={casa[i]} lato="casa" /> : <span />}
          {trasferta[i] ? <Riga g={trasferta[i]} lato="trasferta" /> : <span />}
        </li>
      ))}
    </ol>
  );
}

function Confronto({ casa, trasferta }: { casa: FormazioneSquadra; trasferta: FormazioneSquadra }) {
  return (
    <div className="confronto" aria-label="Confronto dei titolari e delle panchine">
      <p className="legenda-confronto">probabilità di giocare · fantavoto atteso se gioca</p>
      <Duelli casa={casa.titolari} trasferta={trasferta.titolari} />
      <h3 className="titolo-panchina">Panchina</h3>
      <Duelli casa={casa.panchina} trasferta={trasferta.panchina} />
    </div>
  );
}
