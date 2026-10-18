$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:JAVA_HOME=(Get-ChildItem .runtime/java -Directory | Select-Object -First 1).FullName
$env:Path="$env:JAVA_HOME\bin;$env:Path"
& mvn.cmd -f backend/pom.xml test
if($LASTEXITCODE){throw 'Backend tests failed'}
Push-Location frontend
try {
    & npm.cmd test
    if($LASTEXITCODE){throw 'Frontend tests failed'}
    & npm.cmd run build
    if($LASTEXITCODE){throw 'Production build failed'}
    & npx.cmd playwright install chromium
    if($LASTEXITCODE){throw 'Browser installation failed'}
    & npm.cmd run e2e
    if($LASTEXITCODE){throw 'E2E failed'}
} finally { Pop-Location }
