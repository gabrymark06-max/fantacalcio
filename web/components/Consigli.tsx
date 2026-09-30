"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Faccia } from "@/components/Campo";
import { roseDellaLega, useLega } from "@/components/legaStore";
import { conSegno, due, pct, voto } from "@/lib/format";
import { migliorFormazione, punteggio, type Contesto, type Formazione } from "@/lib/lineup";
import { componenti, fantavotoRegole, pGioca } from "@/lib/rules";
import { liberi as svincolatiDellaLega, suggerisciSvincolati, type Svincolo } from "@/lib/svincolati";
import { NOMI_RUOLO, RUOLI, type Giocatore, type Ruolo } from "@/lib/types";

// ---------- Pagine: servono la lega importata e la propria squadra ----------

interface PropsPagina {
  giocatori: Giocatore[];
  sdVoto: Record<Ruolo, number>;
}

function useMiaLega(giocatori: Giocatore[], sdVoto: Record<Ruolo, number>) {
  const perId = useMemo(() => new Map(giocatori.map((g) => [g.id, g])), [giocatori]);
  const { lega, caricata } = useLega(giocatori);
  if (!caricata) return { stato: "attesa" as const };
  if (!lega) return { stato: "senza-lega" as const };
  const { mia, altre } = roseDellaLega(lega, perId);
  if (!mia) return { stato: "senza-squadra" as const };
  const ctx: Contesto = { regole: lega.regole, orizzonte: "giornata", sdVoto };
  return { stato: "pronta" as const, lega, mia, altre, ctx };
}

function SenzaLega({ stato }: { stato: "senza-lega" | "senza-squadra" }) {
  return (
    <section className="scheda">
      <p className="vuoto">
        {stato === "senza-lega" ? "Serve la tua lega: " : "Scegli la tua squadra: "}
        <Link href="/lega">{stato === "senza-lega" ? "importala nella pagina La mia lega" : "vai a La mia lega"}</Link>
        {stato === "senza-lega" && ", basta un clic da Leghe Fantacalcio."}
      </p>
    </section>
  );
}

export function PaginaChiSchiero({ giocatori, sdVoto }: PropsPagina) {
  const l = useMiaLega(giocatori, sdVoto);
  if (l.stato === "attesa") return null;
  if (l.stato !== "pronta") return <SenzaLega stato={l.stato} />;
  const f = migliorFormazione(l.mia, l.ctx);
  if (!f) return <p className="vuoto">La tua rosa non basta per una formazione.</p>;
  return <ChiSchiero key={l.lega.mia} rosa={l.mia} formazione={f} ctx={l.ctx} />;
}

export function PaginaSvincolati({ giocatori, sdVoto }: PropsPagina) {
  const l = useMiaLega(giocatori, sdVoto);
  if (l.stato === "attesa") return null;
  if (l.stato !== "pronta") return <SenzaLega stato={l.stato} />;
  const liberi = svincolatiDellaLega(giocatori, [l.mia, ...l.altre.map((a) => a.rosa)]);
  return <Svincolati mia={l.mia} liberi={liberi} ctx={l.ctx} />;
}

// ---------- Chi schiero? ----------

/** Sotto questa differenza di punti attesi due giocatori si equivalgono. */
const QUASI_UGUALI = 0.15;

/** Il dubbio più stretto della formazione: l'ultimo titolare e il primo panchinaro dello stesso ruolo. */
function dubbioPiuStretto(f: Formazione, ctx: Contesto): number[] {
  let migliore: { ids: number[]; scarto: number } | null = null;
  for (const r of RUOLI) {
    const tit = f.titolari.filter((g) => g.ruolo === r);
    const pan = f.panchina.filter((g) => g.ruolo === r);
    if (!tit.length || !pan.length) continue;
    const ultimo = tit.reduce((a, b) => (punteggio(b, ctx) < punteggio(a, ctx) ? b : a));
    const primo = pan[0];
    const scarto = punteggio(ultimo, ctx) - punteggio(primo, ctx);
    if (!migliore || scarto < migliore.scarto) migliore = { ids: [ultimo.id, primo.id], scarto };
  }
  return migliore?.ids ?? f.titolari.slice(0, 2).map((g) => g.id);
}

export function ChiSchiero({ rosa, formazione, ctx }: { rosa: Giocatore[]; formazione: Formazione; ctx: Contesto }) {
  const [scelti, setScelti] = useState<(number | null)[]>(() => [...dubbioPiuStretto(formazione, ctx), null]);
  const perId = useMemo(() => new Map(rosa.map((g) => [g.id, g])), [rosa]);
  const giocatori = scelti.map((id) => (id != null ? perId.get(id) : undefined)).filter((g): g is Giocatore => !!g);
  const ordinati = [...giocatori].sort((a, b) => punteggio(b, ctx) - punteggio(a, ctx));
  const [primo, secondo] = ordinati;
  const scarto = primo && secondo ? punteggio(primo, ctx) - punteggio(secondo, ctx) : 0;
  const piuSicuro = [...giocatori].sort((a, b) => b.p_gioca - a.p_gioca)[0];

  return (
    <section className="scheda" aria-labelledby="chi-schiero-titolo">
      <h2 id="chi-schiero-titolo">Chi schiero?</h2>
      <p className="nota-piccola">Scegli due o tre giocatori della tua rosa in dubbio. Partiamo dal dubbio più stretto della formazione.</p>
      <div className="scelte-confronto">
        {scelti.map((id, i) => (
          <label key={i}>
            <span>{i < 2 ? `Giocatore ${i + 1}` : "Terzo (facoltativo)"}</span>
            <select value={id ?? ""} onChange={(e) => setScelti(scelti.map((x, j) => (j === i ? (e.target.value ? Number(e.target.value) : null) : x)))}>
              <option value="">{i < 2 ? "Scegli…" : "Nessuno"}</option>
              {RUOLI.map((r) => (
                <optgroup key={r} label={NOMI_RUOLO[r]}>
                  {rosa
                    .filter((g) => g.ruolo === r)
                    .map((g) => (
                      <option key={g.id} value={g.id} disabled={scelti.includes(g.id) && id !== g.id}>
                        {g.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        ))}
      </div>

      {giocatori.length >= 2 && (
        <>
          <p className="verdetto" aria-live="polite">
            {scarto < QUASI_UGUALI ? (
              <>
                {scarto < 0.005 ? (
                  <>
                    Praticamente uguali: <mark>{primo.nome}</mark> e {secondo.nome} valgono gli stessi punti attesi
                  </>
                ) : (
                  <>
                    Quasi uguali: <mark>{primo.nome}</mark> ha {due(scarto)} punti attesi in più
                  </>
                )}
                {piuSicuro !== primo
                  ? `, ${piuSicuro.nome} è più sicuro di giocare (${pct(piuSicuro.p_gioca)} contro ${pct(primo.p_gioca)}).`
                  : " ed è anche il più sicuro di giocare."}
              </>
            ) : (
              <>
                Schiera <mark>{primo.nome}</mark>: {conSegno(scarto)} punti attesi rispetto a {secondo.nome}.
              </>
            )}
          </p>
          <ul className="carte-confronto">
            {giocatori.map((g) => (
              <CartaConfronto key={g.id} g={g} ctx={ctx} migliore={g === primo} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function CartaConfronto({ g, ctx, migliore }: { g: Giocatore; ctx: Contesto; migliore: boolean }) {
  const c = componenti(g, ctx.orizzonte);
  const malus = c.ammonito + c.espulso;
  const righe: [string, string][] = [
    ["Gioca", pct(pGioca(g, ctx.orizzonte))],
    ["Fantavoto se gioca", voto(fantavotoRegole(g, ctx.regole, ctx.orizzonte))],
    ["Voto puro atteso", voto(c.voto)],
    ...(g.ruolo === "P"
      ? ([
          ["Porta inviolata", pct(c.p_imbattuto)],
          ["Gol subiti attesi", due(c.gol_subiti)],
        ] as [string, string][])
      : ([
          ["Gol attesi", due(c.gol + c.rigori_segnati)],
          ["Assist attesi", due(c.assist)],
        ] as [string, string][])),
    ["Rischio cartellino", pct(malus)],
  ];
  return (
    <li className={`carta-confronto${migliore ? " migliore" : ""}`}>
      <div className="carta-confronto-testa">
        <Faccia g={g} taglia="media" />
        <div>
          <strong>{g.nome}</strong>
          <span className="nota-piccola">
            {g.squadra} {g.casa ? "in casa con" : "in trasferta a"} {g.avversario}
          </span>
        </div>
      </div>
      <p className="punti-attesi">
        <span className="numero-grande">{voto(punteggio(g, ctx))}</span> punti attesi
      </p>
      <dl>
        {righe.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

// ---------- Svincolati da prendere ----------

export function Svincolati({ mia, liberi, ctx }: { mia: Giocatore[]; liberi: Giocatore[]; ctx: Contesto }) {
  const [proposte, setProposte] = useState<Svincolo[] | null>(null);
  // rosa e contesto vengono ricreati a ogni render della pagina: si ricalcola solo se cambiano davvero
  const chiave = `${mia.map((g) => `${g.id}${g.ruolo}`).join()}|${liberi.length}|${JSON.stringify(ctx.regole)}`;
  useEffect(() => {
    setProposte(null);
    // il calcolo prova centinaia di rose: lascia prima disegnare la pagina
    const t = setTimeout(() => setProposte(suggerisciSvincolati(mia, liberi, ctx)), 50);
    return () => clearTimeout(t);
  }, [chiave]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="scheda" aria-labelledby="svincolati-titolo">
      <h2 id="svincolati-titolo">Svincolati da prendere</h2>
      <p className="nota-piccola">
        Giocatori del listone che non sono in nessuna rosa della tua lega ({liberi.length}), e chi tagliare per fargli
        posto. Il guadagno è in punti attesi a giornata da qui a fine stagione, con le regole della tua lega.
      </p>
      {proposte === null ? (
        <p className="nota-piccola">Sto cercando tra gli svincolati…</p>
      ) : proposte.length === 0 ? (
        <p className="vuoto">Nessuno svincolato migliora la tua formazione: la tua rosa è già meglio dei liberi.</p>
      ) : (
        <ol className="svincoli">
          {proposte.map((s) => (
            <li key={s.prendi.id}>
              <span className="svincolo-lato">
                <span className="svincolo-etichetta">Prendi</span>
                <Faccia g={s.prendi} taglia="media" />
                <span>
                  <strong>{s.prendi.nome}</strong>
                  <span className="nota-piccola">
                    <span className={`ruolo ruolo-${s.prendi.ruolo}`}>{s.prendi.ruolo}</span> {s.prendi.squadra}
                    {s.prendi.qa != null && ` · quotazione ${s.prendi.qa}`}
                  </span>
                </span>
              </span>
              <span className="svincolo-freccia" aria-hidden="true">
                ⇄
              </span>
              <span className="svincolo-lato">
                <span className="svincolo-etichetta">Svincola</span>
                <Faccia g={s.taglia} taglia="media" />
                <span>
                  <strong>{s.taglia.nome}</strong>
                  <span className="nota-piccola">
                    <span className={`ruolo ruolo-${s.taglia.ruolo}`}>{s.taglia.ruolo}</span> {s.taglia.squadra}
                  </span>
                </span>
              </span>
              <span className="svincolo-guadagno">
                <strong>{conSegno(s.guadagno)}</strong>
                <span className="nota-piccola">a giornata</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
