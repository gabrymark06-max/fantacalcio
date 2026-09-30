"use client";

import { useMemo, useState } from "react";

import { pct, voto } from "@/lib/format";
import { NOMI_RUOLO, RUOLI, type Giocatore, type Ruolo } from "@/lib/types";

/** Quanti giocatori per reparto vengono evidenziati come i più schierabili. */
const EVIDENZIATI: Record<Ruolo, number> = { P: 3, D: 6, C: 6, A: 5 };
const PAGINA = 60;

type Ordine = "punteggio" | "fv_atteso" | "p_gioca" | "p_bonus";
const ORDINI: { valore: Ordine; etichetta: string }[] = [
  { valore: "punteggio", etichetta: "Schierabilità" },
  { valore: "fv_atteso", etichetta: "Fantavoto se gioca" },
  { valore: "p_gioca", etichetta: "Probabilità di giocare" },
  { valore: "p_bonus", etichetta: "Probabilità di bonus" },
];

export function stato(g: Giocatore): { testo: string; classe: string } | null {
  if (g.p_gioca < 0.1) return { testo: g.p_titolare_sos == null ? "fuori lista" : "panchina", classe: "rosso" };
  if (g.p_titolare_sos != null && g.p_titolare_sos >= 40 && g.p_titolare_sos <= 60) {
    return { testo: "ballottaggio", classe: "matita" };
  }
  return null;
}

export function Listone({ giocatori }: { giocatori: Giocatore[] }) {
  const [ruolo, setRuolo] = useState<Ruolo | "tutti">("A");
  const [squadra, setSquadra] = useState("");
  const [cerca, setCerca] = useState("");
  const [ordine, setOrdine] = useState<Ordine>("punteggio");
  const [mostra, setMostra] = useState(PAGINA);

  const evidenziati = useMemo(() => {
    const ids = new Set<number>();
    for (const r of RUOLI) {
      giocatori
        .filter((g) => g.ruolo === r)
        .sort((a, b) => b.punteggio - a.punteggio)
        .slice(0, EVIDENZIATI[r])
        .forEach((g) => ids.add(g.id));
    }
    return ids;
  }, [giocatori]);

  const squadre = useMemo(() => [...new Set(giocatori.map((g) => g.squadra))].sort(), [giocatori]);

  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return giocatori
      .filter((g) => ruolo === "tutti" || g.ruolo === ruolo)
      .filter((g) => !squadra || g.squadra === squadra)
      .filter((g) => !q || g.nome.toLowerCase().includes(q))
      .sort((a, b) => (b[ordine] ?? 0) - (a[ordine] ?? 0));
  }, [giocatori, ruolo, squadra, cerca, ordine]);

  return (
    <section className="listone" aria-labelledby="listone-titolo">
      <h2 id="listone-titolo" className="etichetta">
        Il listone della giornata
      </h2>

      <div className="filtri">
        <div className="reparti" role="group" aria-label="Reparto">
          {(["tutti", ...RUOLI] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={ruolo === r}
              onClick={() => {
                setRuolo(r);
                setMostra(PAGINA);
              }}
            >
              {r === "tutti" ? "Tutti" : NOMI_RUOLO[r]}
            </button>
          ))}
        </div>
        <label>
          <span>Squadra</span>
          <select value={squadra} onChange={(e) => setSquadra(e.target.value)}>
            <option value="">Tutte</option>
            {squadre.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Ordina per</span>
          <select value={ordine} onChange={(e) => setOrdine(e.target.value as Ordine)}>
            {ORDINI.map((o) => (
              <option key={o.valore} value={o.valore}>
                {o.etichetta}
              </option>
            ))}
          </select>
        </label>
        <label className="cerca">
          <span>Cerca</span>
          <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cognome" />
        </label>
      </div>

      <div className="intestazione" aria-hidden="true">
        <span>Giocatore</span>
        <span>Gioca</span>
        <span>Fantavoto se gioca</span>
        <span>Bonus</span>
      </div>
      {righe.length === 0 ? (
        <p className="vuoto">Nessun giocatore con questi filtri. Prova a togliere la squadra o a cambiare reparto.</p>
      ) : (
        <ol className="righe">
          {righe.slice(0, mostra).map((g) => {
            const s = stato(g);
            return (
              <li key={g.id} className="riga">
                <span className={`ruolo ruolo-${g.ruolo}`} title={NOMI_RUOLO[g.ruolo]}>
                  {g.ruolo}
                </span>
                <span className="chi">
                  <span className={evidenziati.has(g.id) ? "nome evidenziato" : "nome"}>{g.nome}</span>
                  <span className="contro">
                    {g.squadra} {g.casa ? "vs" : "@"} {g.avversario}
                    {s && <span className={`nota ${s.classe}`}>{s.testo}</span>}
                  </span>
                </span>
                <span className="gioca" title={g.p_titolare_sos != null ? `Titolare per SOS Fanta: ${g.p_titolare_sos}%` : undefined}>
                  <span className="barra" aria-hidden="true">
                    <span style={{ width: `${Math.round(g.p_gioca * 100)}%` }} />
                  </span>
                  <span className="numero">{pct(g.p_gioca)}</span>
                </span>
                <span className="fv">{voto(g.fv_atteso)}</span>
                <span className="bonus">{pct(g.p_bonus)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {righe.length > mostra && (
        <button type="button" className="altri" onClick={() => setMostra(righe.length)}>
          Mostra tutti i {righe.length}
        </button>
      )}
    </section>
  );
}
