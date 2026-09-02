# Register the Companion native-messaging host with Chrome or Firefox on Windows.
#
# Usage (PowerShell, from repo root):
#   powershell -ExecutionPolicy Bypass -File apps/desktop/scripts/install-native-host.ps1 -ExtensionId <ID> [-Channel chrome|firefox]
#
#   Chrome/Chromium register via the registry (HKCU\Software\...\NativeMessagingHosts);
#   Firefox via a manifest file under %APPDATA%.
#   The host itself is installed under %LOCALAPPDATA%\Companion (stable path, not the
#   user Downloads folder where execution is more likely to be blocked).
param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,
  [ValidateSet('chrome', 'firefox')]
  [string]$Channel = 'chrome'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

# 1. Bundle the host (esbuild).
Push-Location (Join-Path $root 'apps\desktop')
try {
  npm run build:host
} finally {
  Pop-Location
}

# 2. Install the host binary to a stable user location.
$installDir = Join-Path $env:LOCALAPPDATA 'Companion'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$hostPath = Join-Path $installDir 'native-host.mjs'
Copy-Item (Join-Path $root 'apps\desktop\dist-native\native-host.mjs') $hostPath -Force

$manifestName = 'dev.suiflex.companion'

if ($Channel -eq 'firefox') {
  # Firefox native-messaging-hosts manifests.
  $nmDir = Join-Path $env:APPDATA 'Mozilla\NativeMessagingHosts'
  New-Item -ItemType Directory -Force -Path $nmDir | Out-Null
  $manifest = Join-Path $nmDir "$manifestName.json"
  @{
    name             = $manifestName
    description      = 'Companion vault capture host'
    path             = $hostPath
    type             = 'stdio'
    allowed_extensions = @($ExtensionId)
  } | ConvertTo-Json | Set-Content -Path $manifest -Encoding UTF8
  Write-Host "Registered Firefox host: $manifest"
} else {
  # Chrome / Edge / Chromium register the host in the registry; the default value
  # points at the manifest file.
  $base = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$manifestName"
  New-Item -Path $base -Force | Out-Null
  $manifest = Join-Path $installDir "$manifestName.json"
  @{
    name             = $manifestName
    description      = 'Companion vault capture host'
    path             = $hostPath
    type             = 'stdio'
    allowed_origins  = @("chrome-extension://$ExtensionId/")
  } | ConvertTo-Json | Set-Content -Path $manifest -Encoding UTF8
  Set-Item -Path $base -Value $manifest
  Write-Host "Registered Chrome host at $base -> $manifest"
}

Write-Host "Host installed: $hostPath"
Write-Host "Then reload the extension and refresh the meeting tab."
