/*
 * Foto vere dei giocatori, da Wikimedia Commons (licenze libere: CC BY, CC BY-SA, pubblico
 * dominio). Raccolte da fanta_ai.scraping.foto in web/data/foto.json, con autore e licenza
 * da citare e la posizione del viso per ritagliarle in un cerchio.
 * Chi non ha una foto libera viene mostrato con le iniziali.
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
}

const limita = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/**
 * Posizione dell'immagine dentro il cerchio (in % del cerchio): viso al centro, senza mai
 * lasciare vuoti ai bordi.
 */
export function ritaglio(f: Foto): { width: string; left: string; top: string } {
  const larghezza = Math.max(f.scala, 1, 1 / f.ar);
  const altezza = larghezza * f.ar;
  const left = limita(50 - (f.cx / 100) * larghezza * 100, 100 - larghezza * 100, 0);
  const top = limita(50 - (f.cy / 100) * altezza * 100, 100 - altezza * 100, 0);
  const p = (x: number) => `${Math.round(x * 100) / 100}%`;
  return { width: p(larghezza * 100), left: p(left), top: p(top) };
}

/** "Martinez L." → "ML", "Paz N." → "PN", "Dimarco" → "DI". */
export function iniziali(nome: string): string {
  const parti = nome.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (parti.length >= 2) return (parti[0][0] + parti[1][0]).toUpperCase();
  return nome.slice(0, 2).toUpperCase();
}
