$ErrorActionPreference = 'Stop'
function Convert-PrismTimestampToUtc($Value) {
  if ($Value -is [DateTimeOffset]) { return $Value.UtcDateTime }
  if ($Value -is [DateTime]) { return $Value.ToUniversalTime() }
  return [DateTime]::Parse(
    [string]$Value,
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::RoundtripKind
  ).ToUniversalTime()
}

$prismStateFile = Join-Path $PSScriptRoot '.local\server.json'
if (-not (Test-Path -LiteralPath $prismStateFile)) { Write-Output 'PRISM is not running through the local launcher.'; exit 0 }
try { $prismState = Get-Content -LiteralPath $prismStateFile -Raw | ConvertFrom-Json } catch { throw 'The saved server record is invalid. No process was stopped.' }
$prismProcessId = [int]$prismState.pid
try { $prismCandidate = Get-Process -Id $prismProcessId -ErrorAction Stop } catch { $prismCandidate = $null }
if (-not $prismCandidate) {
  Remove-Item -LiteralPath $prismStateFile
  Write-Output 'The saved PRISM process has already stopped.'
  exit 0
}
$prismVerified = $false
try {
  if ($prismState.processStartedAt -and $prismState.project) {
    $prismExpectedRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([char[]]([string][char]92 + [char]47))
    $prismRecordedRoot = [IO.Path]::GetFullPath([string]$prismState.project).TrimEnd([char[]]([string][char]92 + [char]47))
    $prismRecordedStart = Convert-PrismTimestampToUtc $prismState.processStartedAt
    $prismTimeDifference = [Math]::Abs(($prismCandidate.StartTime.ToUniversalTime() - $prismRecordedStart).TotalSeconds)
    $prismVerified = $prismRecordedRoot.Equals($prismExpectedRoot, [StringComparison]::OrdinalIgnoreCase) -and $prismTimeDifference -lt 3
  } else {
    $prismLegacy = Get-CimInstance Win32_Process -Filter "ProcessId = $prismProcessId" -ErrorAction Stop
    $prismExpectedScript = Join-Path $PSScriptRoot 'scripts\local-server.mjs'
    $prismVerified = $prismLegacy -and $prismLegacy.CommandLine -and $prismLegacy.CommandLine.Contains($prismExpectedScript)
  }
} catch { throw 'The saved process could not be verified. No process was stopped.' }
if (-not $prismVerified) { throw 'The saved process belongs to another program; it was not stopped.' }
& taskkill.exe /PID $prismProcessId /T /F
if ($LASTEXITCODE -ne 0) { throw 'The local server could not be stopped.' }
# A newer instance must retain its own state record.
try {
  $prismLatest = Get-Content -LiteralPath $prismStateFile -Raw | ConvertFrom-Json
  if ($prismLatest.pid -eq $prismState.pid -and $prismLatest.startedAt -eq $prismState.startedAt) { Remove-Item -LiteralPath $prismStateFile }
} catch {}
Write-Output 'PRISM local server stopped.'
