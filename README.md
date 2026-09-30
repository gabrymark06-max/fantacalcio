# fanta-ai

Previsioni del fantavoto per la Serie A, formazione consigliata e valutazione degli
scambi, costruite su un modello verificato sulle stagioni passate.

## Avvio

Richiede [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run pytest
uv run python -m fanta_ai.scraping.voti --season 2026-27
```

I dati scaricati finiscono in `data/` (esclusa da git): `data/cache/` tiene l'HTML
originale, `data/raw/` i CSV estratti.

## Roadmap

1. **Dati**
   - [x] Voti e fantavoti partita per partita (fantacalcio.it, dal 2021/22)
   - [ ] xG/xA (Understat via `soccerdata`)
   - [ ] Risultati e quote bookmaker (football-data.co.uk)
   - [ ] Probabilità di titolarità della giornata (SOS Fanta, Gazzetta)
   - [ ] Infortunati
2. **Modello**
   - [ ] Baseline: fantamedia recente × probabilità di giocare
   - [ ] Modello (gradient boosting) sul fantavoto atteso
   - [ ] Backtest per stagione: il modello deve battere la baseline, altrimenti non si pubblica
3. **Sito** — formazione consigliata settimanale + storico pubblico dell'accuratezza
4. **La tua lega** — import rose (CSV Leghe Fantacalcio), formazione sulla tua rosa
5. **Scambi** — valore di uno scambio = variazione dei punti attesi della formazione
   migliore di entrambe le squadre; suggerimento di scambi vantaggiosi per tutti e due

## Regole sui dati

- Chiave unica del giocatore: l'id ufficiale fantacalcio.it (presente negli URL).
- Richieste lente (2 s tra una pagina e l'altra) e cache locale: ogni pagina si scarica una volta.
- I dati grezzi delle fonti non vengono ripubblicati: il sito mostra solo elaborazioni
  proprie (previsioni, punteggi), con le fonti citate.
- Se una pagina cambia formato lo scraper si ferma con un errore, non salva dati vuoti.
