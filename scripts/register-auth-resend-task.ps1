param(
  [string]$TaskName = "ILEYCOM_AuthPortal_Resend_ExpiredSessions"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env.local"
$invokeScriptPath = Join-Path $PSScriptRoot "invoke-auth-resend-cron.ps1"

function Get-EnvMapFromFile {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path $Path)) {
    return $map
  }

  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $map[$key] = $value
  }

  return $map
}

if (-not (Test-Path $invokeScriptPath)) {
  throw "Missing script: $invokeScriptPath"
}

$envMap = Get-EnvMapFromFile -Path $envFile
$interval = 30
if ($envMap.ContainsKey("AUTH_PORTAL_CRON_INTERVAL_MINUTES") -and $envMap["AUTH_PORTAL_CRON_INTERVAL_MINUTES"]) {
  $parsed = [int]$envMap["AUTH_PORTAL_CRON_INTERVAL_MINUTES"]
  if ($parsed -gt 0) {
    $interval = $parsed
  }
}

if ($interval -gt 1439) {
  $interval = 1439
}

$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$invokeScriptPath`""

schtasks /Create /F /SC MINUTE /MO $interval /TN $TaskName /TR $taskCommand | Out-String | Write-Output
Write-Output "Registered task '$TaskName' to run every $interval minute(s)."
