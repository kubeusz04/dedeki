# Synchronizuje kod z folderu dedeki (dev) do dedeki-github (repo / Oracle)
$ErrorActionPreference = "Stop"
$src = Join-Path $env:USERPROFILE "Desktop\dedeki"
$dst = Join-Path $env:USERPROFILE "Desktop\dedeki-github"

if (-not (Test-Path $src)) {
  Write-Error "Brak folderu dev: $src"
}

Write-Host "Kopiowanie z $src -> $dst ..."
robocopy $src $dst /E /XD node_modules .git /XF .env /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }

Write-Host "Gotowe. Pliki deploy (.gitignore, docker-compose.prod.yml, DEPLOY.md) pozostają w dedeki-github."
Write-Host "Sprawdź diff: cd dedeki-github; git status"
