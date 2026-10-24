# Maintained entry point for the historical test-refactor03-stable acceptance.
param([switch]$All, [string[]]$Specs = @(), [int]$FixturePort = 18770, [string]$MySqlBin)
$ErrorActionPreference = 'Stop'
$run = @{ FixturePort = $FixturePort }
if ($MySqlBin) { $run.MySqlBin = $MySqlBin }
if ($All -or !$Specs.Count) { $run.All = $true } else { $run.Specs = $Specs }
& (Join-Path $PSScriptRoot "test-agent.ps1") @run
if ($LASTEXITCODE) { throw "Acceptance failed." }
