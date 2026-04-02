param(
  [switch]$DryRun,
  [int]$PageSize = 0,
  [int]$MaxPages = 0
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env.local"

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

$envMap = Get-EnvMapFromFile -Path $envFile

$baseUrl = ""
if ($envMap.ContainsKey("NEXT_PUBLIC_BASE_URL") -and $envMap["NEXT_PUBLIC_BASE_URL"]) {
  $baseUrl = $envMap["NEXT_PUBLIC_BASE_URL"]
} else {
  $baseUrl = "http://localhost:3000"
}

$baseUrl = $baseUrl.TrimEnd("/")
$uri = "$baseUrl/api/seller/authFlow/resendExpiredSessions"

$headers = @{ "Content-Type" = "application/json" }
if ($envMap.ContainsKey("AUTH_PORTAL_CRON_KEY") -and $envMap["AUTH_PORTAL_CRON_KEY"]) {
  $headers["x-cron-key"] = $envMap["AUTH_PORTAL_CRON_KEY"]
}

$body = @{}
if ($DryRun.IsPresent) {
  $body["dryRun"] = $true
}
if ($PageSize -gt 0) {
  $body["pageSize"] = $PageSize
}
if ($MaxPages -gt 0) {
  $body["maxPages"] = $MaxPages
}

if ($envMap.ContainsKey("AUTH_PORTAL_LEAD_MINUTES") -and $envMap["AUTH_PORTAL_LEAD_MINUTES"]) {
  $lead = [int]$envMap["AUTH_PORTAL_LEAD_MINUTES"]
  if ($lead -gt 0) {
    $body["leadMinutes"] = $lead
  }
} elseif ($envMap.ContainsKey("AUTH_PORTAL_CRON_INTERVAL_MINUTES") -and $envMap["AUTH_PORTAL_CRON_INTERVAL_MINUTES"]) {
  $interval = [int]$envMap["AUTH_PORTAL_CRON_INTERVAL_MINUTES"]
  if ($interval -gt 0) {
    $body["leadMinutes"] = $interval
  }
}

$response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body ($body | ConvertTo-Json -Depth 5)
$response | ConvertTo-Json -Depth 10
