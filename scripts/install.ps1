# Companion — Windows installer for Meet Companion.
#
# The PowerShell counterpart of install.sh: same layout, same commands, so the
# two platforms are documented as one flow. Installs Companion Desktop and the
# `companion` CLI (no npm, no global publish). The desktop app is what you get
# up front; the browser extension is one command away afterwards:
#
#   companion install     detect browsers, pick one, load the extension
#   companion update      re-fetch the extension dist
#
# The CLI lands in %USERPROFILE%\.companion with a `companion.cmd` shim in
# %USERPROFILE%\.local\bin. The desktop app is installed by its .msi, which
# raises the usual UAC prompt.
#
#   From the repo:      powershell -ExecutionPolicy Bypass -File scripts\install.ps1
#   From a URL:         irm <raw>/scripts/install.ps1 | iex
#
# Env overrides:
#   COMPANION_HOME        install dir     (default: ~\.companion)
#   COMPANION_BIN         shim dir        (default: ~\.local\bin)
#   COMPANION_SRC         raw base URL    (default: github suiflex/companion develop)
#   COMPANION_DESKTOP     0 to skip installing the desktop app
#   COMPANION_FETCH_DIST  1 to also pre-fetch the extension dist (needs node)

$ErrorActionPreference = 'Stop'

$repo     = 'suiflex/companion'
$home_    = if ($env:COMPANION_HOME) { $env:COMPANION_HOME } else { Join-Path $HOME '.companion' }
$binDir   = if ($env:COMPANION_BIN)  { $env:COMPANION_BIN }  else { Join-Path $HOME '.local\bin' }
$srcBase  = if ($env:COMPANION_SRC)  { $env:COMPANION_SRC }  else { 'https://raw.githubusercontent.com/suiflex/companion/develop' }
$wantDesktop = $env:COMPANION_DESKTOP -ne '0'
# Off by default now: `companion install` downloads the dist on demand, so
# pre-fetching it here only spends time on something you may never load.
$fetchDist = $env:COMPANION_FETCH_DIST -eq '1'

New-Item -ItemType Directory -Force -Path $home_, $binDir | Out-Null

# --- desktop app -------------------------------------------------------------
# Runs before the node check: the desktop app is a native binary, and a machine
# without Node must still end up with it installed.
#
# Asset names are deterministic (`companion-desktop-<target-triple>.msi`, set by
# release-desktop.yml), so the URL is built rather than looked up.
function Install-Desktop {
  $triple = switch ($env:PROCESSOR_ARCHITECTURE) {
    'AMD64' { 'x86_64-pc-windows-msvc' }
    'ARM64' { 'aarch64-pc-windows-msvc' }
    default { $null }
  }
  if (-not $triple) {
    Write-Host "  Skipped: no desktop build for $env:PROCESSOR_ARCHITECTURE."
    return
  }

  # /releases/latest skips drafts and prereleases, so it never answers with the
  # rolling `companion-desktop-latest` pointer the app polls for updates.
  try {
    $tag = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" `
              -UseBasicParsing -Headers @{ 'User-Agent' = 'companion-installer' }).tag_name
  } catch {
    Write-Host '  Skipped: could not reach the GitHub releases API.'
    return
  }

  $msi = Join-Path ([System.IO.Path]::GetTempPath()) "companion-desktop-$triple.msi"
  try {
    Invoke-WebRequest -Uri "https://github.com/$repo/releases/download/$tag/companion-desktop-$triple.msi" `
      -OutFile $msi -UseBasicParsing
  } catch {
    Write-Host "  Skipped: $tag carries no companion-desktop-$triple.msi."
    return
  }

  # /passive shows progress but asks nothing; the UAC prompt still appears.
  $p = Start-Process msiexec.exe -ArgumentList '/i', "`"$msi`"", '/passive', '/norestart' -Wait -PassThru
  Remove-Item $msi -Force -ErrorAction SilentlyContinue
  # 3010 is "success, reboot required" — an install, not a failure.
  if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) {
    Write-Host "  Installed $tag"
  } else {
    Write-Host "  msiexec exited $($p.ExitCode) - the desktop app may not be installed."
  }
}

if ($wantDesktop) {
  Write-Host 'Installing Companion Desktop...'
  Install-Desktop
  Write-Host ''
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'node is required for the `companion` CLI but was not found on PATH. Install Node.js 20+ from https://nodejs.org and re-run. (The desktop app above does not need it.)'
}

# 1. the CLI and the modules it imports
# $PSScriptRoot is empty when the script is piped into iex, which is exactly the
# case where the files have to come off the network anyway.
foreach ($f in 'companion.mjs', 'unzip.mjs', 'picker.mjs') {
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
  Write-Host 'Fetching the latest extension dist...'
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
Write-Host 'Next:  companion install      # load the extension into a browser'
