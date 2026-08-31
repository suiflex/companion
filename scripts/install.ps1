# Companion — Windows installer for Meet Companion.
#
# The PowerShell counterpart of install.sh: same layout, same commands, so the
# two platforms are documented as one flow. Installs the `companion` CLI +
# release dist into %USERPROFILE%\.companion and a `companion.cmd` shim into
# %USERPROFILE%\.local\bin (no npm, no global publish). After it finishes, run
# `companion install` — it detects your browsers, lets you pick in a console,
# and launches the extension in a dedicated profile.
#
#   From the repo:      powershell -ExecutionPolicy Bypass -File scripts\install.ps1
#   From a URL:         irm <raw>/scripts/install.ps1 | iex
#
# Env overrides:
#   COMPANION_HOME        install dir     (default: ~\.companion)
#   COMPANION_BIN         shim dir        (default: ~\.local\bin)
#   COMPANION_SRC         raw base URL    (default: github suiflex/companion develop)
#   COMPANION_FETCH_DIST  0 to skip fetching the release dist here

$ErrorActionPreference = 'Stop'

$home_    = if ($env:COMPANION_HOME) { $env:COMPANION_HOME } else { Join-Path $HOME '.companion' }
$binDir   = if ($env:COMPANION_BIN)  { $env:COMPANION_BIN }  else { Join-Path $HOME '.local\bin' }
$srcBase  = if ($env:COMPANION_SRC)  { $env:COMPANION_SRC }  else { 'https://raw.githubusercontent.com/suiflex/companion/develop' }
$fetchDist = $env:COMPANION_FETCH_DIST -ne '0'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'node is required but was not found on PATH. Install Node.js 20+ from https://nodejs.org and re-run.'
}

New-Item -ItemType Directory -Force -Path $home_, $binDir | Out-Null

# 1. the CLI and the modules it imports
# $PSScriptRoot is empty when the script is piped into iex, which is exactly the
# case where the files have to come off the network anyway.
foreach ($f in 'companion.mjs', 'unzip.mjs') {
  $local = if ($PSScriptRoot) { Join-Path $PSScriptRoot $f } else { $null }
  if ($local -and (Test-Path $local)) {
    Copy-Item $local (Join-Path $home_ $f) -Force
    Write-Host "Using local scripts\$f"
  } else {
    Write-Host "Downloading $f..."
    Invoke-WebRequest -Uri "$srcBase/scripts/$f" -OutFile (Join-Path $home_ $f) -UseBasicParsing
  }
}

# 2. shim that pins COMPANION_HOME and hands off to node
$cmd = @"
@echo off
set "COMPANION_HOME=$home_"
node "$home_\companion.mjs" %*
"@
Set-Content -Path (Join-Path $binDir 'companion.cmd') -Value $cmd -Encoding ASCII

Write-Host ''
Write-Host 'Companion installed.'
Write-Host "  CLI  : $home_\companion.mjs"
Write-Host "  shim : $binDir\companion.cmd"

if ($fetchDist) {
  Write-Host ''
  Write-Host 'Fetching the latest release dist...'
  $env:COMPANION_HOME = $home_
  & node (Join-Path $home_ 'companion.mjs') update
  if ($LASTEXITCODE -ne 0) {
    Write-Host '(failed to fetch dist - `companion install` will offer to fetch it)'
  }
}

# PATH is the user's to change; say what to run rather than editing it here.
Write-Host ''
if (($env:PATH -split ';') -notcontains $binDir) {
  $addPath = '[Environment]::SetEnvironmentVariable(''Path'', ' +
             "[Environment]::GetEnvironmentVariable('Path', 'User') + ';$binDir', 'User')"
  Write-Host "  Note: $binDir is not on your PATH."
  Write-Host "  Run:  $addPath"
  Write-Host '        then open a new terminal.'
}
Write-Host ''
Write-Host 'Next:  companion install'
