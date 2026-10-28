param([ValidateRange(1024, 65535)][int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$prismRoot = $PSScriptRoot
$prismRuntime = (Get-Command node -ErrorAction Stop).Source
$prismLogFolder = Join-Path $prismRoot '.local'
New-Item -ItemType Directory -Path $prismLogFolder -Force | Out-Null
$prismStatePath = Join-Path $prismLogFolder 'server.json'

function Convert-PrismTimestampToUtc($Value) {
  if ($Value -is [DateTimeOffset]) { return $Value.UtcDateTime }
  if ($Value -is [DateTime]) { return $Value.ToUniversalTime() }
  return [DateTime]::Parse(
    [string]$Value,
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::RoundtripKind
  ).ToUniversalTime()
}

function Test-PrismProcess($State) {
  if (-not $State -or -not $State.pid) { return $false }
  try {
    $prismCandidate = Get-Process -Id ([int]$State.pid) -ErrorAction Stop
    if ($prismCandidate.HasExited) { return $false }
    if ($State.processStartedAt -and $State.project) {
      $prismExpectedRoot = [IO.Path]::GetFullPath($prismRoot).TrimEnd([char[]]([string][char]92 + [char]47))
      $prismRecordedRoot = [IO.Path]::GetFullPath([string]$State.project).TrimEnd([char[]]([string][char]92 + [char]47))
      $prismRecordedStart = Convert-PrismTimestampToUtc $State.processStartedAt
      $prismTimeDifference = [Math]::Abs(($prismCandidate.StartTime.ToUniversalTime() - $prismRecordedStart).TotalSeconds)
      return $prismRecordedRoot.Equals($prismExpectedRoot, [StringComparison]::OrdinalIgnoreCase) -and $prismTimeDifference -lt 3
    }
    # Compatibility with state files written by the first local launcher.
    $prismLegacy = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$State.pid) -ErrorAction Stop
    return $prismLegacy -and $prismLegacy.CommandLine -and $prismLegacy.CommandLine.Contains((Join-Path $prismRoot 'scripts\local-server.mjs'))
  } catch { return $false }
}
function Test-PrismHttp([int]$ServerPort) {
  try {
    $prismResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$ServerPort/prism/" -UseBasicParsing -TimeoutSec 2
    return $prismResponse.StatusCode -eq 200 -and $prismResponse.Content.Contains('PRISM')
  } catch { return $false }
}
if (Test-PrismHttp $Port) {
  Write-Output "PRISM is already running at http://127.0.0.1:$Port/"
  exit 0
}
if (Test-Path -LiteralPath $prismStatePath) {
  try { $prismState = Get-Content -LiteralPath $prismStatePath -Raw | ConvertFrom-Json } catch { $prismState = $null }
  if (Test-PrismProcess $prismState) {
    if (Test-PrismHttp ([int]$prismState.port)) {
      Write-Output "PRISM is already running at http://127.0.0.1:$($prismState.port)/"
    } else {
      Write-Output "PRISM is already setting up or starting (process $($prismState.pid)). Read $prismLogFolder\server.log for progress."
    }
    exit 0
  }
}
$prismArguments = @(('"' + (Join-Path $prismRoot 'scripts\local-server.mjs') + '"'), '--port', $Port.ToString())
$prismProcess = Start-Process -FilePath $prismRuntime -ArgumentList $prismArguments -WorkingDirectory $prismRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $prismLogFolder 'server.log') -RedirectStandardError (Join-Path $prismLogFolder 'server-error.log') -PassThru
Write-Output "PRISM is starting at http://127.0.0.1:$Port/ (process $($prismProcess.Id)). Logs: $prismLogFolder"
for ($prismAttempt = 0; $prismAttempt -lt 60; $prismAttempt++) {
  Start-Sleep -Milliseconds 500
  $prismProcess.Refresh()
  if ($prismProcess.HasExited) { throw "PRISM could not start. Read $prismLogFolder\server-error.log" }
  if (Test-PrismHttp $Port) {
    Write-Output "PRISM is ready: http://127.0.0.1:$Port/"
    exit 0
  }
}
Write-Output "Setup is still running in the background. Read $prismLogFolder\server.log for progress."
