# Aggiornamento automatico: dati freschi, previsioni, accuratezza, pubblicazione.
#
# Esegue la pipeline Python; se i file del sito (web/data) sono cambiati li salva in un
# commit, li invia a GitHub (remote "origin") e ripubblica il sito su Vercel se la cartella
# web è collegata a un progetto (web/.vercel, creata da "vercel link"). I file che restano
# solo sul proprio PC sono esclusi da git e da web/.vercelignore.
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
        Write-Output "Inviato a GitHub."
    } else {
        Write-Output "Nessun remote 'origin': commit fatto solo in locale."
    }

    if (Test-Path (Join-Path $root "web/.vercel")) {
        Push-Location (Join-Path $root "web")
        try {
            vercel deploy --prod --yes
            if ($LASTEXITCODE -ne 0) { throw "Deploy su Vercel fallito: il sito online resta alla versione precedente." }
            Write-Output "Sito online aggiornato."
        }
        finally { Pop-Location }
    }
}
finally {
    Stop-Transcript | Out-Null
}
