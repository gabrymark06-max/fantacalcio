/*
 * Foto vere dei giocatori, da Wikimedia Commons (licenze libere: CC BY, CC BY-SA, pubblico
 * dominio). Raccolte da fanta_ai.scraping.foto in web/data/foto.json, con autore e licenza
 * da citare e la posizione del viso per ritagliarle in un cerchio.
 * Sul proprio PC hanno la precedenza le foto di Transfermarkt (fonte "transfermarkt", solo uso
 * personale, mai pubblicate). Chi non ha nessuna foto viene mostrato con le iniziali.
 */

export interface Foto {
  url: string;
  /** Centro del viso in % della larghezza e dell'altezza della foto. */
  cx: number;
  cy: number;
  /** Larghezza della foto in "cerchi": il viso occupa circa metà del cerchio. */
  scala: number;
  /** Altezza / larghezza della foto. */
  ar: number;
  viso: boolean;
  autore: string;
  licenza: string;
  pagina: string;
  fonte?: "transfermarkt";
}

const limita = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** Altezza del centro del viso nella cornice (%): un po' sopra la metà, per vedere collo e spalle. */
const ALTEZZA_VISO = 42;

/**
 * Posizione dell'immagine dentro la cornice, in % della cornice: viso al centro (poco sopra),
 * senza mai lasciare vuoti ai bordi.
 * `formato` è altezza / larghezza della cornice: 1 per il cerchio, 1,3 per la figurina, dove
 * un ritratto di Transfermarkt (300×390) entra intero, senza tagli.
 */
export function ritaglio(f: Foto, formato = 1): { width: string; left: string; top: string } {
  // larghezze in "larghezze della cornice"; l'immagine deve coprirla anche in altezza
  const larghezza = Math.max(f.scala, 1, formato / f.ar);
  const altezza = larghezza * f.ar;
  const left = limita(50 - (f.cx / 100) * larghezza * 100, 100 - larghezza * 100, 0);
  // `top` in CSS è in % dell'altezza della cornice
  const top = limita(((ALTEZZA_VISO / 100) * formato - (f.cy / 100) * altezza) / formato * 100, (1 - altezza / formato) * 100, 0);
  const p = (x: number) => `${Math.round(x * 100) / 100 + 0}%`;
  return { width: p(larghezza * 100), left: p(left), top: p(top) };
}

/** "Martinez L." → "ML", "Paz N." → "PN", "Dimarco" → "DI". */
export function iniziali(nome: string): string {
  const parti = nome.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (parti.length >= 2) return (parti[0][0] + parti[1][0]).toUpperCase();
  return nome.slice(0, 2).toUpperCase();
}
