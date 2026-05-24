# Kopiuje kod z folderu roboczego dedeki -> dedeki-github (przed push na GitHub)
# Uruchom w PowerShell:
#   cd C:\Users\Zawadzki\Desktop\dedeki-github
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\sync-from-dedeki.ps1

$Source = "C:\Users\Zawadzki\Desktop\dedeki"
$Dest   = "C:\Users\Zawadzki\Desktop\dedeki-github"

if (-not (Test-Path $Source)) {
  Write-Error "Brak folderu zrodlowego: $Source"
  exit 1
}

Write-Host "Synchronizacja: $Source -> $Dest"

robocopy $Source $Dest /E /XD node_modules .git uploads .vscode /XF .env .env.local /NFL /NDL

if ($LASTEXITCODE -ge 8) {
  Write-Error "Robocopy zakonczyl sie bledem (kod $LASTEXITCODE)"
  exit $LASTEXITCODE
}

Write-Host "OK. Folder dedeki-github gotowy do: git add / commit / push"
Write-Host "Pliki deploy/ i docker-compose.prod.yml w dedeki-github NIE sa nadpisywane przez ten skrypt (zostaja w miejscu docelowym)."
