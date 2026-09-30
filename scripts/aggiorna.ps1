# Aggiornamento automatico: dati freschi, previsioni, accuratezza, pubblicazione.
#
# Esegue la pipeline Python; se i file del sito (web/data) sono cambiati li salva in un
# commit e, se esiste un remote "origin", li invia: il deploy del sito parte da solo.
# Pensato per l'Utilità di pianificazione di Windows (vedi README), funziona anche a mano:
#     powershell -ExecutionPolicy Bypass -File scripts\aggiorna.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("aggiorna_" + (Get-Date -Format "yyyy-MM-dd_HHmm") + ".log")
Start-Transcript -Path $log | Out-Null

try {
    uv run python -m fanta_ai.pipeline
    if ($LASTEXITCODE -ne 0) { throw "Pipeline fallita (codice $LASTEXITCODE): sito non aggiornato." }

    $changed = git status --porcelain -- web/data
    if (-not $changed) {
        Write-Output "Nessuna previsione cambiata, niente da pubblicare."
        return
    }

    $giornata = (Get-Content web/data/giornata.json -Raw | ConvertFrom-Json).giornata
    git add web/data
    git commit -m "Previsioni aggiornate: giornata $giornata ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
    if ($LASTEXITCODE -ne 0) { throw "Commit fallito." }

    $remote = git remote
    if ($remote -contains "origin") {
        git push origin HEAD
        if ($LASTEXITCODE -ne 0) { throw "Push fallito: le previsioni restano solo in locale." }
        Write-Output "Pubblicato: il sito si aggiornerà con il prossimo deploy."
    } else {
        Write-Output "Nessun remote 'origin': commit fatto solo in locale."
    }
}
finally {
    Stop-Transcript | Out-Null
}
