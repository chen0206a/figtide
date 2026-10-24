# Run after chart-corrections.spec.ts + evaluation.spec.ts. Requires Poppler on PATH.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$qaRoot = Join-Path $repoRoot '.runtime/refactor01-pdf-qa'
$popplerDir = Split-Path (Get-Command pdfinfo).Source -Parent
$pdfInfoExe = Join-Path $popplerDir 'pdfinfo.exe'
$pdfTextExe = (Get-Command pdftotext).Source
$pdfImagesExe = (Get-Command pdfimages).Source
$pdfRenderExe = Join-Path $popplerDir 'pdftoppm.exe'
New-Item -ItemType Directory -Path $qaRoot -Force | Out-Null
$requirements = @{
    sem = @('Baseline', 'Method A', 'Accuracy', 'SEM')
    confusion = @('Model A', 'n=7', 'Count')
    roc = @('Model A', 'AUC = 0.750')
}
$evidence = @()
foreach ($stem in @('sem', 'confusion', 'roc')) {
    $pdfPath = Join-Path $repoRoot "docs/exports/refactor-01-$stem.pdf"
    $svgPath = Join-Path $repoRoot "docs/exports/refactor-01-$stem.svg"
    $textPath = Join-Path $qaRoot "$stem.txt"
    $renderPrefix = Join-Path $qaRoot $stem
    $info = & $pdfInfoExe $pdfPath | Out-String
    if ($LASTEXITCODE -or $info -notmatch '(?m)^Pages:\s+1\s*$') { throw "Invalid PDF page count: $stem" }
    & $pdfTextExe -layout -enc UTF-8 $pdfPath $textPath
    if ($LASTEXITCODE) { throw "PDF text extraction failed: $stem" }
    $text = [IO.File]::ReadAllText($textPath)
    $svg = [IO.File]::ReadAllText($svgPath)
    foreach ($label in $requirements[$stem]) {
        if (!$text.Contains($label) -or !$svg.Contains($label)) { throw "Missing exported label: $stem / $label" }
    }
    $images = & $pdfImagesExe -list $pdfPath | Out-String
    if ($LASTEXITCODE -or $images -match '(?m)^\s+\d+\s+\d+\s+image\b' -or $svg -match '<(?:\w+:)?image\b') {
        throw "Unexpected raster content: $stem"
    }
    if ($stem -eq 'sem' -and ($svg -notmatch 'rgb\(53,\s*104,\s*181\)' -or $svg -notmatch 'rgb\(34,\s*139,\s*131\)')) {
        throw 'Group colors missing from SEM SVG'
    }
    & $pdfRenderExe -singlefile -scale-to 1600 -png $pdfPath $renderPrefix
    if ($LASTEXITCODE) { throw "PDF rendering failed: $stem" }
    $evidence += @{figure=$stem; pages=1; raster_images=0; expected_labels=$requirements[$stem]; text=$text; pdf_info=$info; render=".runtime/refactor01-pdf-qa/$stem.png"}
    Write-Output "Verified SVG/PDF text, vector content and rendered $stem.png"
}
$prSvg = [IO.File]::ReadAllText((Join-Path $repoRoot 'docs/exports/binary-pr.svg'))
if (!$prSvg.Contains('AP = 0.833') -or $prSvg -match '<(?:\w+:)?image\b') { throw 'PR SVG lost its computed AP or vector content' }
[IO.File]::WriteAllText((Join-Path $repoRoot 'docs/exports/refactor-01-pr.svg'), $prSvg, [Text.UTF8Encoding]::new($false))
$evidence += @{figure='pr'; format='svg'; expected_labels=@('AP = 0.833'); raster_images=0}
Write-Output 'Verified PR SVG retains computed AP = 0.833'
$evidencePath = Join-Path $repoRoot 'docs/test-evidence/refactor01-exports.json'
$evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $evidencePath -Encoding utf8
