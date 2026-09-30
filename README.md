# Chi Schiero (fanta-ai)

Previsioni del fantavoto per la Serie A: probabilità che ogni giocatore prenda voto,
fantavoto atteso e probabilità di bonus, formazione consigliata per la tua rosa e scambi
che convengono a entrambe le squadre.

- `src/fanta_ai/` — raccolta dati, modello, backtest, previsioni (Python)
- `web/` — il sito (Next.js), legge i JSON in `web/data/` generati dalla pipeline

## Avvio

Richiede [uv](https://docs.astral.sh/uv/) e Node.js 22+.

```bash
uv sync
uv run pytest                          # test Python
uv run python -m fanta_ai.pipeline     # dati freschi + previsioni + accuratezza

cd web
npm install
npm test                               # test della logica del sito
npm run dev                            # http://localhost:3000
```

Primo avvio su un PC nuovo: la pipeline scarica solo la stagione in corso. Per lo storico
usato dal modello:

```bash
for s in 2021-22 2022-23 2023-24 2024-25 2025-26; do
  uv run python -m fanta_ai.scraping.voti --season $s
  uv run python -m fanta_ai.scraping.quote --season $s
done
uv run python -m fanta_ai.backtest     # rigenera reports/backtest.json
```

## Come funziona

| Passo | Modulo | Fonte |
|---|---|---|
| Voti, fantavoti, bonus/malus partita per partita | `scraping/voti.py` | fantacalcio.it |
| Listone (id, ruolo, squadra, quotazioni) | `scraping/listone.py` | fantacalcio.it |
| Prossima giornata | `scraping/calendario.py` | fantacalcio.it |
| Risultati, quote, gol attesi | `scraping/quote.py` | football-data.co.uk |
| Probabilità di titolarità | `scraping/titolarita.py` | SOS Fanta |
| Nome completo e data di nascita | `scraping/anagrafica.py` | fantacalcio.it |
| Foto vere dei giocatori (licenze libere) | `scraping/foto.py` | Wikidata, Wikimedia Commons |
| Dataset giocatore × giornata (solo dati passati) | `dataset.py` | |
| Modelli: p_gioca, fv_atteso, p_bonus | `model.py` | |
| Prova sulle stagioni passate | `backtest.py` | |
| Previsioni + esportazione per il sito | `predict.py` | |
| Accuratezza settimana per settimana | `evaluate.py` | |

Risultati del backtest (2023/24–2025/26, modello allenato solo sugli anni precedenti,
300 rose simulate per stagione): il modello batte la scelta per fantamedia di
+0,55 / +0,18 / +0,29 punti a giornata. Sapere in anticipo chi gioca vale circa +2 punti:
per questo dal vivo si usano anche le probabili formazioni (effetto misurato da `evaluate.py`
a partire dalla giornata 6 del 2026/27).

## Regole della lega e scambi

- Il fantavoto fantacalcio.it è ricostruito esattamente dalle sue voci (residuo zero su 55.224 voti):
  `model.py` prevede fv standard e ogni voce; il sito (`web/lib/rules.ts`) ricalcola il fantavoto con i
  bonus della lega, l'imbattibilità (P = e^−gol attesi avversario) e il modificatore difesa.
- Scambi (`web/lib/trades.ts`): guadagno per me = punti attesi della mia formazione migliore da qui a fine
  stagione; accettazione stimata da equità sul valore di mercato FVM (convesso, come KeepTradeCut) e
  dal cambiamento della loro formazione. Solo scambi con guadagno ≥ 0,15 a giornata e accettazione ≥ 0,45.

## Capitano, chi schiero, svincolati

- **Capitano**: se la lega ha il modificatore capitano (letto da Leghe Fantacalcio o impostato
  nelle regole) la formazione indica capitano (C) e vice (VC): il valore atteso del bonus a
  fasce sul voto puro previsto, del vice se il capitano non gioca. Entra nei punti attesi.
- **Chi schiero?**: confronto di due o tre giocatori della rosa (probabilità di giocare,
  fantavoto con le regole della lega, voto puro, gol/assist o porta inviolata, cartellini);
  parte dal dubbio più stretto della formazione.
- **Svincolati**: i giocatori del listone in nessuna rosa della lega, con chi tagliare dello
  stesso ruolo e il guadagno della formazione da qui a fine stagione (stesso metro degli scambi).
- **Calendario** (solo negli scambi e negli svincolati, non mostrato): le prossime 5 giornate
  contro gli avversari veri pesano il 40% del valore stagionale (`PESO_PROSSIME` in
  `web/lib/rules.ts`); le partite si leggono da `/serie-a/calendario/N`.

## Pronostici

Pagina `/pronostici` (dati da `fanta_ai.pronostici`, passo della pipeline):

- **Come finisce il campionato**: 20.000 simulazioni del resto della stagione (gol di
  Poisson dai rating di attacco e difesa delle ultime 10 partite, calendario da
  fantacalcio.it): punti attesi, scudetto, Champions, Europa, Conference, retrocessione.
- **Ogni partita**: probabilità di 25 mercati (1X2, doppia chance, under/over 0,5-4,5,
  gol/no gol, multigol, squadra segna) con la quota equa, griglia dei risultati esatti,
  pronostico statistico, statistiche della stagione a confronto (football-data.co.uk: tiri,
  tiri in porta, corner, falli, cartellini...), forma, precedenti dal 2021, giocatori.
- **Quote**: bet365 e bwin (licenza ADM) più media e massima di mercato da football-data
  (`fixtures.csv`, di solito 2-3 giorni prima delle partite). Con una chiave gratuita di
  The Odds API in `ODDS_API_KEY` si aggiungono Codere e Unibet Italia.
- Solo informazione (linee guida AGCOM sul Decreto Dignità, delibera 132/19/CONS): niente
  link, bonus o promozioni dei bookmaker, avvertenza sul gioco per i minori.

## Foto dei giocatori

`uv run python -m fanta_ai.scraping.anagrafica` e poi `uv run python -m fanta_ai.scraping.foto`
(da rifare quando cambia il listone). Ogni giocatore è riconosciuto su Wikidata per nome e data
di nascita; la foto viene da Wikimedia Commons con autore e licenza (mostrati sotto la
formazione) e il viso è ritagliato con il rilevatore YuNet di OpenCV. Chi non ha una foto con
licenza libera è mostrato con le iniziali. Prima di pubblicare, mettere un contatto vero in
`USER_AGENT` (le regole di Wikimedia lo chiedono).

Solo per uso personale: `uv run python -m fanta_ai.scraping.foto_tm` scarica le foto di
Transfermarkt per tutti i giocatori, che sul proprio PC sostituiscono quelle di Commons (rose di
Serie A, poi ricerca per nome ed età per chi è stato ceduto). Sono protette da diritto d'autore: finiscono in
`web/data/foto-personali.json`, escluso da git, quindi il sito pubblicato non le ha e mostra
solo quelle di Commons.

## Probabili formazioni

La pagina della giornata mostra una partita alla volta: i due campi, il confronto titolare per
titolare (probabilità di giocare e fantavoto atteso del modello), la panchina, i ballottaggi e gli
indisponibili. Modulo, titolari, ballottaggi e note sugli indisponibili vengono da SOS Fanta
(`scraping.titolarita` → `data/raw/probabili.json` → `fanta_ai.probabili` →
`web/data/probabili.json`, passo già incluso nella pipeline). Sono contenuti loro: il file è
escluso da git ma pubblicato su Vercel; se manca, le formazioni sono ricavate dal modello
(per ogni reparto chi ha la probabilità di giocare più alta).

## Aggiornamento automatico

`scripts/aggiorna.ps1` esegue la pipeline e, se le previsioni cambiano, fa commit (e push se
esiste il remote `origin`). Per eseguirlo il martedì, il venerdì e il sabato alle 9:

```powershell
schtasks /Create /TN "ChiSchiero" /SC WEEKLY /D TUE,FRI,SAT /ST 09:00 `
  /TR "powershell -ExecutionPolicy Bypass -File C:\Users\Admin\Documents\fanta-ai\scripts\aggiorna.ps1"
```

I log finiscono in `logs/`.

## Pubblicazione

Il sito è su Vercel (progetto `fantacalcio`, cartella `web` collegata con `vercel link`):
`cd web && vercel deploy --prod`. `scripts/aggiorna.ps1` lo ripubblica da solo dopo ogni
aggiornamento. Foto di Transfermarkt, loghi e probabili formazioni di SOS Fanta sono esclusi da git ma
pubblicati su Vercel: i diritti restano dei proprietari.

## Regole sui dati

- Chiave unica del giocatore: l'id ufficiale fantacalcio.it (presente negli URL).
- Richieste lente (2 s tra una pagina e l'altra) e cache locale in `data/cache/`.
- I dati grezzi (`data/`) non vanno nel repository: il sito mostra solo elaborazioni proprie.
- Se una pagina cambia formato lo scraper si ferma con un errore invece di salvare dati vuoti.

## Da fare prima di guadagnarci

- Pagina contatti/rimozione dati per le fonti (manca un indirizzo pubblico).
- Verifica legale sull'uso commerciale dei dati raccolti; valutare un modello di
  titolarità proprio al posto delle percentuali SOS Fanta.
- Partita IVA / commercialista prima di attivare pagamenti.
