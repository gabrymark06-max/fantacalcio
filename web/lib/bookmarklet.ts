/*
 * Il segnalibro "Importa in Chi Schiero": si clicca sulla pagina della propria lega su
 * leghe.fantacalcio.it (con il login fatto). Legge dall'API interna del sito, con la sessione
 * già aperta nel browser, le rose di tutte le squadre e le impostazioni della lega, poi apre
 * Chi Schiero passando i dati nel frammento dell'URL.
 *
 * Il token di accesso non esce mai dalla pagina di Leghe Fantacalcio: a Chi Schiero arrivano
 * solo rose e impostazioni. Autenticazione e percorsi da fantabot, docs/leghe-api.md: header
 * `app_key` (pubblico, uguale per tutti, nel codice del sito) e `Authorization: Bearer` con il
 * token della lega salvato in localStorage["LEAGUES2024_LOCAL"].
 */

// Scritto in JavaScript "semplice" perché gira dentro la pagina di un altro sito.
const SORGENTE = `(async () => {
  const SITO = "__SITO__";
  const finestra = window.open("about:blank", "_blank");
  try {
    if (!/(^|\\.)fantacalcio\\.it$/.test(location.hostname)) {
      throw new Error("apri prima la pagina della tua lega su leghe.fantacalcio.it, poi clicca il segnalibro.");
    }
    const stato = JSON.parse(localStorage.getItem("LEAGUES2024_LOCAL") || "null");
    const idUtente = stato && stato["current-user"];
    const utente = stato && stato["current-user-" + idUtente];
    const lega = utente && utente.currentLeague;
    if (!lega || !lega.token) throw new Error("non risulti collegato: accedi a Leghe Fantacalcio, apri la tua lega e riprova.");
    const intestazioni = { app_key: "ICiELOObd5DF5uJEATi77CRvHiiRuMU0", Authorization: "Bearer " + lega.token };
    const leggi = async (percorso) => {
      const r = await fetch("https://apileague.fantacalcio.it/onboarding/v1/league/" + percorso, { headers: intestazioni });
      if (!r.ok) throw new Error("Leghe Fantacalcio ha risposto " + r.status + " (" + percorso + "). Se il problema resta, rifai il login.");
      return r.json();
    };
    const facoltativo = (percorso) => leggi(percorso).catch(() => null);

    let squadre = [], pagina = 1, pagine = 1;
    do {
      const risposta = await leggi("teams?page=" + pagina + "&pageSize=50");
      pagine = risposta.pages || 1;
      squadre = squadre.concat(risposta.data || []);
      pagina++;
    } while (pagina <= pagine);
    const [calcolo, formazione, ruoli] = await Promise.all([
      facoltativo("settings/calculate"), facoltativo("settings/lineup"), facoltativo("custom-roles"),
    ]);
    const numeri = (testo) => String(testo || "").split(";").filter(Boolean).map(Number);
    const dati = {
      v: 1,
      lega: { nome: lega.name, alias: lega.alias },
      utente: Number(idUtente) || null,
      squadre: squadre.map((s) => ({ nome: s.n, proprietario: s.idu ?? null, ids: numeri(s.cal), costi: numeri(s.cs) })),
      impostazioni: { calcolo, formazione, ruoli },
    };
    const byte = new TextEncoder().encode(JSON.stringify(dati));
    let bin = "";
    byte.forEach((b) => (bin += String.fromCharCode(b)));
    const codice = btoa(bin).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
    const url = SITO + "/lega#importa=" + codice;
    if (finestra) finestra.location.href = url; else location.href = url;
  } catch (e) {
    if (finestra) finestra.close();
    alert("Chi Schiero: " + e.message);
  }
})();`;

/** Codice del segnalibro per il sito `origine` (es. https://chischiero.it o http://localhost:3000). */
export function codiceSegnalibro(origine: string): string {
  const compatto = SORGENTE.replace("__SITO__", origine)
    .split("\n")
    .map((riga) => riga.trim())
    .join(" ");
  return "javascript:" + encodeURIComponent(compatto);
}

/** Il sorgente, per eseguirlo nei test in una pagina simulata. */
export function sorgenteSegnalibro(origine: string): string {
  return SORGENTE.replace("__SITO__", origine);
}
