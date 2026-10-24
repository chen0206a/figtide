param([string]$MySqlBin = 'C:\Program Files\MySQL\MySQL Server 8.0\bin', [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
New-Item -ItemType Directory -Force .runtime | Out-Null
$jdk = Get-ChildItem '.runtime/java' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$jdk) {
    Write-Host 'Downloading local Microsoft OpenJDK 21 (first run only)...'
    Invoke-WebRequest 'https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip' -OutFile '.runtime/jdk.zip'
    Expand-Archive '.runtime/jdk.zip' '.runtime/java' -Force
    $jdk = Get-ChildItem '.runtime/java' -Directory | Select-Object -First 1
}
$env:JAVA_HOME = $jdk.FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
if (!(Test-Path "$MySqlBin/mysqld.exe")) { throw 'MySQL 8 binaries not found. Pass -MySqlBin <path>.' }
function Wait-Port([int]$Port) {
    for ($n=0; $n -lt 40; $n++) {
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { return }
        Start-Sleep -Milliseconds 500
    }
    throw "Port $Port did not start. See .runtime logs."
}
$processes = @{}
if (Test-Path '.runtime/processes.json') { $old = Get-Content '.runtime/processes.json' -Raw | ConvertFrom-Json; $old.psobject.Properties | ForEach-Object { $processes[$_.Name] = $_.Value } }
$mysqlRunning = Get-NetTCPConnection -LocalPort 33316 -State Listen -ErrorAction SilentlyContinue
if (!$mysqlRunning) {
    $firstRun = !(Test-Path '.runtime/mysql/mysql')
    if ($firstRun) {
        & "$MySqlBin/mysqld.exe" --no-defaults --initialize-insecure "--datadir=$root/.runtime/mysql" --console
        if ($LASTEXITCODE) { throw 'MySQL initialization failed' }
    }
    $proc = Start-Process "$MySqlBin/mysqld.exe" -ArgumentList '--no-defaults','--datadir=./.runtime/mysql','--port=33316','--bind-address=127.0.0.1','--mysqlx=0','--console' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput '.runtime/mysql.stdout.log' -RedirectStandardError '.runtime/mysql.stderr.log' -PassThru
    Wait-Port 33316
    $processes.mysql = (Get-NetTCPConnection -LocalPort 33316 -State Listen | Select-Object -First 1).OwningProcess
    if ($firstRun) {
        $sql = "CREATE DATABASE labflow CHARACTER SET utf8mb4; CREATE DATABASE labflow_test CHARACTER SET utf8mb4; CREATE USER 'labflow'@'127.0.0.1' IDENTIFIED BY 'labflow-local'; GRANT ALL ON labflow.* TO 'labflow'@'127.0.0.1'; GRANT ALL ON labflow_test.* TO 'labflow'@'127.0.0.1'; ALTER USER 'root'@'localhost' IDENTIFIED BY 'labflow-root-local';"
        $sql | & "$MySqlBin/mysql.exe" --host=127.0.0.1 --port=33316 --user=root
        if ($LASTEXITCODE) { throw 'Database bootstrap failed' }
    }
} elseif (!$processes.mysql -or $processes.mysql -ne $mysqlRunning[0].OwningProcess) { throw 'Port 33316 is occupied by an untracked process; no existing database was changed.' }
$processes | ConvertTo-Json | Set-Content '.runtime/processes.json'
if (!$SkipBuild) {
    $runningFrontend = Get-NetTCPConnection -LocalPort 5176 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($runningFrontend) {
        if ($runningFrontend.OwningProcess -ne $processes.frontend) { throw 'Port 5176 is occupied by an untracked process.' }
        $existingFrontend = Get-CimInstance Win32_Process -Filter "ProcessId=$($processes.frontend)"
        if (!$existingFrontend.CommandLine.Contains('node_modules/vite/bin/vite.js')) { throw 'Refusing to stop unrelated frontend process.' }
        Stop-Process -Id $processes.frontend
        Wait-Process -Id $processes.frontend -ErrorAction SilentlyContinue
    }
    $runningBackend = Get-NetTCPConnection -LocalPort 8086 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($runningBackend) {
        if ($runningBackend.OwningProcess -ne $processes.backend) { throw 'Port 8086 is occupied by an untracked process.' }
        $existingProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($processes.backend)"
        if (!$existingProcess.CommandLine.Contains('labflow-0.1.0.jar')) { throw 'Refusing to stop unrelated backend process.' }
        Stop-Process -Id $processes.backend
        Wait-Process -Id $processes.backend -ErrorAction SilentlyContinue
    }
    & mvn.cmd -f backend/pom.xml package -DskipTests -q
    if ($LASTEXITCODE) { throw 'Java build failed' }
    Push-Location frontend
    & npm.cmd ci --cache ../.runtime/npm-cache
    if ($LASTEXITCODE) { Pop-Location; throw 'npm ci failed' }
    & npm.cmd run build
    if ($LASTEXITCODE) { Pop-Location; throw 'Frontend build failed' }
    Pop-Location
}
foreach ($entry in @(@{name='backend';port=8086},@{name='frontend';port=5176})) {
    $running = Get-NetTCPConnection -LocalPort $entry.port -State Listen -ErrorAction SilentlyContinue
    if ($running) {
        if ($processes[$entry.name] -ne $running[0].OwningProcess) { throw "Port $($entry.port) is occupied by an untracked process." }
        continue
    }
    if ($entry.name -eq 'backend') {
        $proc = Start-Process "$env:JAVA_HOME/bin/java.exe" -ArgumentList '-jar','backend/target/labflow-0.1.0.jar' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput '.runtime/backend.stdout.log' -RedirectStandardError '.runtime/backend.stderr.log' -PassThru
    } else {
        $node = (Get-Command node.exe).Source
        $proc = Start-Process $node -ArgumentList 'node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5176','--strictPort' -WorkingDirectory "$root/frontend" -WindowStyle Hidden -RedirectStandardOutput '.runtime/frontend.stdout.log' -RedirectStandardError '.runtime/frontend.stderr.log' -PassThru
    }
    Wait-Port $entry.port
    $processes[$entry.name] = (Get-NetTCPConnection -LocalPort $entry.port -State Listen | Select-Object -First 1).OwningProcess
    $processes | ConvertTo-Json | Set-Content '.runtime/processes.json'
}
Write-Host 'FigTide: http://127.0.0.1:5176 | API: http://127.0.0.1:8086/api/health'
Write-Host 'Local single-user mode. Optional model assistance is disabled until configured.'
