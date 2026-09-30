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
| Dataset giocatore × giornata (solo dati passati) | `dataset.py` | |
| Modelli: p_gioca, fv_atteso, p_bonus | `model.py` | |
| Prova sulle stagioni passate | `backtest.py` | |
| Previsioni + esportazione per il sito | `predict.py` | |
| Accuratezza settimana per settimana | `evaluate.py` | |

Risultati del backtest (2023/24–2025/26, modello allenato solo sugli anni precedenti,
300 rose simulate per stagione): il modello batte la scelta per fantamedia di
+0,42 / +0,20 / +0,30 punti a giornata. Sapere in anticipo chi gioca vale circa +2 punti:
per questo dal vivo si usano anche le probabili formazioni (effetto misurato da `evaluate.py`
a partire dalla giornata 6 del 2026/27).

## Aggiornamento automatico

`scripts/aggiorna.ps1` esegue la pipeline e, se le previsioni cambiano, fa commit (e push se
esiste il remote `origin`). Per eseguirlo il martedì, il venerdì e il sabato alle 9:

```powershell
schtasks /Create /TN "ChiSchiero" /SC WEEKLY /D TUE,FRI,SAT /ST 09:00 `
  /TR "powershell -ExecutionPolicy Bypass -File C:\Users\Admin\Documents\fanta-ai\scripts\aggiorna.ps1"
```

I log finiscono in `logs/`.

## Pubblicazione

1. Crea un repository **privato** su GitHub e collegalo: `git remote add origin <url>` e `git push -u origin main`.
2. Su Vercel: *Add New Project* → importa il repository → **Root Directory: `web`** → Deploy.
3. Da lì ogni push di `aggiorna.ps1` aggiorna il sito da solo.

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
