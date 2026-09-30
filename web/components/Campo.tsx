"use client";

import { useState } from "react";

import { stato } from "@/components/Listone";
import { foto } from "@/lib/data";
import { iniziali, ritaglio } from "@/lib/foto";
import { pct, voto } from "@/lib/format";
import type { Contesto, Formazione } from "@/lib/lineup";
import { fantavotoRegole } from "@/lib/rules";
import { NOMI_RUOLO, type Giocatore, type Ruolo } from "@/lib/types";

/** Dall'alto in basso: attacco, centrocampo, difesa, porta. */
export const RIGHE: Ruolo[] = ["A", "C", "D", "P"];

/** Figurina sul campo: stesso formato dei ritratti di Transfermarkt (300×390), che entrano interi. */
const FORMATO_FIGURINA = 1.3;

/** piccola: cerchio negli elenchi; media e grande: figurina (scambi e campo). */
export type TagliaFaccia = "piccola" | "media" | "grande";

export function Faccia({ g, grande = false, taglia }: { g: Giocatore; grande?: boolean; taglia?: TagliaFaccia }) {
  const [errore, setErrore] = useState(false);
  const f = foto[String(g.id)];
  const t = taglia ?? (grande ? "grande" : "piccola");
  return (
    <span className={`faccia faccia-${g.ruolo}${t === "piccola" ? "" : ` ${t}`}`} aria-hidden="true">
      {f && !errore ? (
        // eslint-disable-next-line @next/next/no-img-element -- immagine esterna, niente ottimizzazione
        <img src={f.url} alt="" loading="lazy" decoding="async" style={ritaglio(f, t === "piccola" ? 1 : FORMATO_FIGURINA)} onError={() => setErrore(true)} />
      ) : (
        <span className="iniziali">{iniziali(g.nome)}</span>
      )}
    </span>
  );
}

/** Crediti delle foto mostrate: le licenze libere chiedono di citare autore e licenza. */
export function CreditiFoto({ giocatori }: { giocatori: Giocatore[] }) {
  const conFoto = giocatori.filter((g) => foto[String(g.id)]);
  if (conFoto.length === 0) return null;
  const personali = conFoto.filter((g) => foto[String(g.id)].fonte === "transfermarkt").length;
  return (
    <details className="crediti-foto">
      <summary>
        Foto: {conFoto.length} su {giocatori.length}
        {personali > 0 ? <>, da Transfermarkt ({personali}) e Wikimedia Commons</> : <>, da Wikimedia Commons</>}; chi
        non ha una foto è mostrato con le iniziali
      </summary>
      <ul>
        {conFoto.map((g) => {
          const f = foto[String(g.id)];
          return (
            <li key={g.id}>
              {g.nome}: <a href={f.pagina}>{f.autore}</a>, {f.licenza}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Pedina({ g, ctx, fascia }: { g: Giocatore; ctx: Contesto; fascia?: "C" | "VC" }) {
  const s = stato(g);
  const fv = fantavotoRegole(g, ctx.regole, ctx.orizzonte);
  return (
    <li className="pedina" title={`${g.nome} (${NOMI_RUOLO[g.ruolo]}), ${g.casa ? "in casa contro" : "in trasferta contro"} ${g.avversario}`}>
      <span className="gettone-foto">
        <Faccia g={g} grande />
        {fascia && (
          <span className={`fascia-capitano${fascia === "VC" ? " vice" : ""}`} title={fascia === "C" ? "Capitano consigliato" : "Vice capitano consigliato"}>
            {fascia}
          </span>
        )}
      </span>
      <span className="pedina-nome">{g.nome}</span>
      <span className="pedina-dati">
        <span className="pedina-fv">{voto(fv)}</span>
        <span className={s ? `pedina-p ${s.classe}` : "pedina-p"}>{pct(g.p_gioca)}</span>
      </span>
      {s && <span className={`pedina-nota ${s.classe}`}>{s.testo}</span>}
    </li>
  );
}

/** Il campo con i titolari disposti secondo il modulo. */
export function LineeCampo() {
  return (
    <svg className="linee-campo" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="65" height="102" />
      <line x1="1.5" y1="52.5" x2="66.5" y2="52.5" />
      <circle cx="34" cy="52.5" r="9.15" />
      <rect x="13.84" y="1.5" width="40.32" height="16.5" />
      <rect x="24.84" y="1.5" width="18.32" height="5.5" />
      <rect x="13.84" y="87" width="40.32" height="16.5" />
      <rect x="24.84" y="98" width="18.32" height="5.5" />
    </svg>
  );
}

export function Campo({ formazione, ctx }: { formazione: Formazione; ctx: Contesto }) {
  return (
    <div className="campo-da-gioco" role="group" aria-label={`Formazione ${formazione.modulo}`}>
      <LineeCampo />
      {RIGHE.map((r) => (
        <ol key={r} className={`linea linea-${r}`} aria-label={NOMI_RUOLO[r]}>
          {formazione.titolari
            .filter((g) => g.ruolo === r)
            .map((g) => (
              <Pedina
                key={g.id}
                g={g}
                ctx={ctx}
                fascia={formazione.capitano?.capitano === g ? "C" : formazione.capitano?.vice === g ? "VC" : undefined}
              />
            ))}
        </ol>
      ))}
    </div>
  );
}
