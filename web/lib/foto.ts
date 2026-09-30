/*
 * Immagini dei giocatori: i "campioncini" di fantacalcio.it, indicizzati con lo stesso id
 * ufficiale del listone (es. .../campioncini/21/medium/5585.png = Malen). Formati: small,
 * medium (120×160), large, card.
 *
 * ATTENZIONE: sono illustrazioni di proprietà di fantacalcio.it. Vanno bene per l'uso
 * personale in locale; prima di pubblicare il sito servono il loro permesso o immagini con
 * licenza libera. Per cambiare fonte basta cambiare questa funzione.
 */
export function urlFoto(id: number): string {
  return `https://content.fantacalcio.it/web/campioncini/21/medium/${id}.png`;
}

/** "Martinez L." → "ML", "Paz N." → "PN", "Dimarco" → "DI". */
export function iniziali(nome: string): string {
  const parti = nome.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (parti.length >= 2) return (parti[0][0] + parti[1][0]).toUpperCase();
  return nome.slice(0, 2).toUpperCase();
}
