param(
  [int]$FrontendPort = 3000,
  [int]$BackendPort = 18080,
  [switch]$Stop
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $ScriptDir "..")
$LogDir = Join-Path $env:TEMP "mass_pay-local"
$BackendPidFile = Join-Path $LogDir "backend.pid"
$FrontendPidFile = Join-Path $LogDir "frontend.pid"

function Stop-PidFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return
  }

  $pidText = (Get-Content $Path -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($pidText -match "^\d+$") {
    $proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $proc.Id -Force
    }
  }

  Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Get-PortOwner {
  param([int]$Port)

  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Assert-PortFree {
  param([int]$Port, [string]$Name)

  $owner = Get-PortOwner -Port $Port
  if ($owner) {
    $proc = Get-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue
    $procName = if ($proc) { $proc.ProcessName } else { "pid $($owner.OwningProcess)" }
    throw "$Name port $Port is already used by $procName (pid $($owner.OwningProcess))."
  }
}

function Import-EnvFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    throw "Missing env file: $Path"
  }

  Get-Content $Path | ForEach-Object {
    if ($_ -match "^\s*([^#=\s]+)\s*=\s*(.*)\s*$") {
      $name = $Matches[1].Trim()
      $value = $Matches[2].Trim()
      if ($value -match '^"(.*)"$') {
        $value = $Matches[1]
      }
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Wait-ForHttp {
  param([string]$Url, [int]$Seconds = 30)

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 700
    }
  }

  return $false
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if ($Stop) {
  Stop-PidFile -Path $FrontendPidFile
  Stop-PidFile -Path $BackendPidFile
  Write-Host "Local app processes stopped."
  exit 0
}

Stop-PidFile -Path $FrontendPidFile
Stop-PidFile -Path $BackendPidFile

Push-Location $Root
try {
  docker compose up -d postgres redis | Out-Host
  docker compose stop frontend backend | Out-Null
} finally {
  Pop-Location
}

Assert-PortFree -Port $FrontendPort -Name "Frontend"
Assert-PortFree -Port $BackendPort -Name "Backend"

Import-EnvFile -Path (Join-Path $Root ".env")

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgres://masspay:masspay_secret@localhost:5432/masspay_bf?sslmode=disable"
}
if (-not $env:REDIS_URL) {
  $env:REDIS_URL = "redis://localhost:6379"
}

$env:PORT = "$BackendPort"
$env:NEXT_PUBLIC_API_URL = "http://localhost:$BackendPort/api/v1"
$env:NEXT_PUBLIC_APP_NAME = if ($env:NEXT_PUBLIC_APP_NAME) { $env:NEXT_PUBLIC_APP_NAME } else { "MynaPay BF" }
$env:NEXT_TELEMETRY_DISABLED = "1"

$backendOut = Join-Path $LogDir "backend.out.log"
$backendErr = Join-Path $LogDir "backend.err.log"
$frontendOut = Join-Path $LogDir "frontend.out.log"
$frontendErr = Join-Path $LogDir "frontend.err.log"

$backend = Start-Process `
  -FilePath "go" `
  -ArgumentList @("run", "./cmd/server") `
  -WorkingDirectory (Join-Path $Root "backend") `
  -RedirectStandardOutput $backendOut `
  -RedirectStandardError $backendErr `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 2
$backendOwner = Get-PortOwner -Port $BackendPort
if ($backendOwner) {
  Set-Content -Path $BackendPidFile -Value $backendOwner.OwningProcess
} else {
  Set-Content -Path $BackendPidFile -Value $backend.Id
}

$env:PORT = "$FrontendPort"

$frontend = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev") `
  -WorkingDirectory (Join-Path $Root "frontend") `
  -RedirectStandardOutput $frontendOut `
  -RedirectStandardError $frontendErr `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 3
$frontendOwner = Get-PortOwner -Port $FrontendPort
if ($frontendOwner) {
  Set-Content -Path $FrontendPidFile -Value $frontendOwner.OwningProcess
} else {
  Set-Content -Path $FrontendPidFile -Value $frontend.Id
}

$backendOk = Wait-ForHttp -Url "http://localhost:$BackendPort/health" -Seconds 30
$frontendOk = Wait-ForHttp -Url "http://localhost:$FrontendPort" -Seconds 45

Write-Host "Frontend: http://localhost:$FrontendPort"
Write-Host "Backend:  http://localhost:$BackendPort"
Write-Host "API:      $env:NEXT_PUBLIC_API_URL"
Write-Host "Logs:     $LogDir"

if (-not $backendOk) {
  Write-Warning "Backend health check did not pass. See $backendOut and $backendErr"
}
if (-not $frontendOk) {
  Write-Warning "Frontend check did not pass. See $frontendOut and $frontendErr"
}

Write-Host "Stop with: powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Stop"
