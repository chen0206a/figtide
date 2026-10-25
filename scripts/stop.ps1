param([string]$MySqlBin = 'C:\Program Files\MySQL\MySQL Server 8.0\bin')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$appVersion = & (Join-Path $PSScriptRoot 'get-version.ps1')
$statePath = Join-Path $root '.runtime/processes.json'
if (!(Test-Path $statePath)) { Write-Host 'No tracked FigTide processes.'; exit }
$state = Get-Content $statePath -Raw | ConvertFrom-Json
foreach ($entry in @(@{name='frontend';port=5176;match='vite'},@{name='backend';port=8086;match='backend[/\\]target[/\\]labflow-\d+\.\d+\.\d+\.jar';regex=$true},@{name='mysql';port=33316;match='datadir=./.runtime/mysql'})) {
    $processId = $state.($entry.name)
    $owner = Get-NetTCPConnection -LocalPort $entry.port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$owner -or $owner.OwningProcess -ne $processId) { continue }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
    if (!$proc) { throw "Refusing to stop unrelated process $processId" }
    $matchesTrackedCommand = if ($entry.regex) { $proc.CommandLine -match $entry.match } else { $proc.CommandLine.Contains($entry.match) }
    if (!$matchesTrackedCommand) { throw "Refusing to stop unrelated process $processId" }
    if ($entry.name -eq 'mysql') {
        $oldPassword=$env:MYSQL_PWD
        try { $env:MYSQL_PWD='labflow-root-local'; & "$MySqlBin/mysqladmin.exe" --host=127.0.0.1 --port=33316 --user=root shutdown; if ($LASTEXITCODE) { throw 'MySQL shutdown failed' } }
        finally { $env:MYSQL_PWD=$oldPassword }
    } else { Stop-Process -Id $processId }
}
Write-Host 'Tracked FigTide services stopped. All database files preserved.'
