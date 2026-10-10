# ============================================================
# build-content.ps1 - embeds lesson content (output/*.md) into
# JS modules at tasks-mockup/assets/content/<TOPIC>.js
#
# Why: <script src> works on file:// and http, unlike fetch.
# course.js checks the cache first, then injects the module,
# then falls back to fetch.
#
# Re-run after the publisher regenerates output/.
# NOTE: ASCII-only file on purpose (PS 5.1 + Cyrillic = pain).
# IMPORTANT: [IO.File] + explicit UTF-8 no BOM only.
# Never use Get-Content/Set-Content here - it breaks encoding.
# ============================================================

$mockupRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $mockupRoot
$contentDir = Join-Path $mockupRoot 'assets\content'
$outputRoot = Join-Path $repoRoot 'output'

$utf8 = New-Object Text.UTF8Encoding $false

if (-not (Test-Path $outputRoot)) {
  Write-Host "No output/ dir"
  exit 1
}

New-Item -ItemType Directory -Force -Path $contentDir | Out-Null

function Escape-Js($text) {
  # Escape for JS template literal. Backslash first.
  $r = $text.Replace('\', '\\')
  $r = $r.Replace('`', '\`')
  $r = $r.Replace('${', '\${')
  return $r
}

function Read-Md($path) {
  if (-not (Test-Path $path)) { return '' }
  return [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
}

$built = 0
$skipped = 0

Get-ChildItem $outputRoot -Directory | ForEach-Object {
  $moduleDir = $_
  Get-ChildItem $moduleDir.FullName -Directory | ForEach-Object {
    $topicDir = $_
    $topicId = $topicDir.Name
    $lecture = Read-Md (Join-Path $topicDir.FullName 'lecture.md')
    if (-not $lecture) {
      $skipped++
      return
    }
    $exercises = Read-Md (Join-Path $topicDir.FullName 'exercises.md')
    $answers = Read-Md (Join-Path $topicDir.FullName 'answers.md')
    $task = Read-Md (Join-Path $topicDir.FullName 'project\task.md')

    $nl = "`n"
    $js = 'window.__LESSON_MD = window.__LESSON_MD || {};' + $nl
    $js += 'window.__LESSON_MD["' + $topicId + '"] = {' + $nl
    $js += '  lecture: `' + (Escape-Js $lecture) + '`,' + $nl
    $js += '  exercises: `' + (Escape-Js $exercises) + '`,' + $nl
    $js += '  answers: `' + (Escape-Js $answers) + '`,' + $nl
    $js += '  task: `' + (Escape-Js $task) + '`' + $nl
    $js += '};' + $nl

    [IO.File]::WriteAllText((Join-Path $contentDir ($topicId + '.js')), $js, $utf8)
    $built++
    Write-Host "built: $topicId"
  }
}

Write-Host "Done: embedded $built, skipped without lecture.md: $skipped"

# ---- Part 2: project artifacts (business-analysis/*.md) ----
$baRoot = Join-Path $repoRoot 'project\compliance\business-analysis'
$artifactsJs = Join-Path $contentDir '__artifacts.js'
$items = @()
if (Test-Path $baRoot) {
  Get-ChildItem $baRoot -File -Filter '*.md' | ForEach-Object {
    $body = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8)
    $id = [IO.Path]::GetFileNameWithoutExtension($_.Name)
    $items += @{ id = $id; file = $_.Name; body = $body }
  }
}
$nl = "`n"
$ajs = 'window.__ARTIFACTS = window.__ARTIFACTS || [];' + $nl
foreach ($item in $items) {
  $ajs += 'window.__ARTIFACTS.push({ id: "' + $item.id + '", file: "' + $item.file + '", body: `' + (Escape-Js $item.body) + '` });' + $nl
}
[IO.File]::WriteAllText($artifactsJs, $ajs, $utf8)
Write-Host "Artifacts embedded: $($items.Count) -> __artifacts.js"
