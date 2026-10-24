# Maintained entry point for the historical test-refactor09 acceptance.
param([switch]$All, [string[]]$Specs = @('visual-polish.spec.ts'), [int]$FixturePort = 18770, [string]$MySqlBin)
$ErrorActionPreference = 'Stop'
$run = @{ FixturePort = $FixturePort }
if ($MySqlBin) { $run.MySqlBin = $MySqlBin }
if ($All) { $run.All = $true } else { $run.Specs = $Specs }
$run.Production = $true
& (Join-Path $PSScriptRoot "test-agent.ps1") @run
if ($LASTEXITCODE) { throw "Acceptance failed." }
