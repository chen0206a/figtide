$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'frontend/package.json') -Raw | ConvertFrom-Json).version
[xml]$pom = Get-Content (Join-Path $root 'backend/pom.xml') -Raw
$backend = $pom.SelectSingleNode("/*[local-name()='project']/*[local-name()='version']").InnerText
if ($version -notmatch '^\d+\.\d+\.\d+$' -or $version -ne $backend) { throw 'Frontend and backend release versions must match X.Y.Z.' }
$version
