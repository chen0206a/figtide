# Maintained entry point for the historical test-refactor01c acceptance.
param([switch]$All, [string[]]$Specs = @('chart-corrections.spec.ts','classification.spec.ts','processing.spec.ts','professional.spec.ts','publication.spec.ts','evaluation.spec.ts'), [int]$FixturePort = 18770, [string]$MySqlBin)
$ErrorActionPreference = 'Stop'
$run = @{ FixturePort = $FixturePort }
if ($MySqlBin) { $run.MySqlBin = $MySqlBin }
if ($All) { $run.All = $true } else { $run.Specs = $Specs }
& (Join-Path $PSScriptRoot "test-agent.ps1") @run
if ($LASTEXITCODE) { throw "Acceptance failed." }
