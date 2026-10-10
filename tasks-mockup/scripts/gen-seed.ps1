# gen-seed.ps1 - generates Flyway seed migrations from mockup data.
# Usage:
#   1. Render tasks-mockup/scripts/seed-export.html in a browser
#      (or headless Edge --dump-dom) and save the <pre id="out"> JSON
#      to seed.json (UTF-8).
#   2. powershell -ExecutionPolicy Bypass -File gen-seed.ps1 -SeedJson <path-to-seed.json>
# ASCII-only file on purpose (PS 5.1 misreads Cyrillic without BOM).
# All text moves through [IO.File] with explicit UTF-8 (encoding-safe).
param(
  [string]$SeedJson = ''
)

$utf8 = New-Object Text.UTF8Encoding $false

function Q($s) {
  if ($null -eq $s) { return 'NULL' }
  return "'" + ([string]$s -replace "'", "''") + "'"
}

function Qb($b) {
  if ($b) { return 'TRUE' } else { return 'FALSE' }
}

function Arr($a) {
  if ($null -eq $a -or $a.Count -eq 0) { return "'{}'" }
  $parts = @()
  foreach ($x in $a) { $parts += (Q $x) }
  return 'ARRAY[' + ($parts -join ',') + ']'
}

if (-not $SeedJson -or -not (Test-Path $SeedJson)) {
  Write-Host "SeedJson not found. Pass -SeedJson <seed.json>."
  exit 1
}

$data = [IO.File]::ReadAllText($SeedJson, [Text.Encoding]::UTF8) | ConvertFrom-Json
$migDir = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'backend\shared\persistence\src\main\resources\db\migration'
New-Item -ItemType Directory -Force -Path $migDir | Out-Null

# ---------- V2: reference data (levels, tags, collections) ----------
$v2 = @()
$v2 += '-- Catalog reference data: levels, tags, collections.'
$v2 += '-- Source: tasks-mockup/assets/js/data-core.js (generated, do not edit by hand).'
$v2 += ''
$v2 += 'CREATE TABLE IF NOT EXISTS levels ('
$v2 += '  id          TEXT PRIMARY KEY,'
$v2 += '  name        TEXT NOT NULL,'
$v2 += "  css_class   TEXT NOT NULL DEFAULT '',"
$v2 += "  profile     TEXT NOT NULL DEFAULT '',"
$v2 += "  time_hint   TEXT NOT NULL DEFAULT '',"
$v2 += "  description TEXT NOT NULL DEFAULT '',"
$v2 += '  active      BOOLEAN NOT NULL DEFAULT TRUE'
$v2 += ');'
$v2 += ''
$v2 += 'CREATE TABLE IF NOT EXISTS tags ('
$v2 += '  id        TEXT PRIMARY KEY,'
$v2 += '  name      TEXT NOT NULL,'
$v2 += "  category  TEXT NOT NULL DEFAULT '',"
$v2 += "  synonyms  TEXT[] NOT NULL DEFAULT '{}',"
$v2 += '  active    BOOLEAN NOT NULL DEFAULT TRUE'
$v2 += ');'
$v2 += ''
$v2 += 'CREATE TABLE IF NOT EXISTS collections ('
$v2 += '  id          TEXT PRIMARY KEY,'
$v2 += '  title       TEXT NOT NULL,'
$v2 += "  tagline     TEXT NOT NULL DEFAULT '',"
$v2 += "  description TEXT NOT NULL DEFAULT '',"
$v2 += "  icon        TEXT NOT NULL DEFAULT '',"
$v2 += "  audience    TEXT NOT NULL DEFAULT '',"
$v2 += "  task_ids    TEXT[] NOT NULL DEFAULT '{}',"
$v2 += '  active      BOOLEAN NOT NULL DEFAULT TRUE'
$v2 += ');'
$v2 += ''
foreach ($l in $data.levels) {
  $v2 += ('INSERT INTO levels (id, name, css_class, profile, time_hint, description, active) VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, css_class = EXCLUDED.css_class, profile = EXCLUDED.profile, time_hint = EXCLUDED.time_hint, description = EXCLUDED.description, active = EXCLUDED.active;' `
    -f (Q $l.id), (Q $l.name), (Q $l.cssClass), (Q $l.profile), (Q $l.timeHint), (Q $l.description), (Qb $l.active))
}
$v2 += ''
foreach ($t in $data.tags) {
  $v2 += ('INSERT INTO tags (id, name, category, synonyms, active) VALUES ({0}, {1}, {2}, {3}, {4}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, synonyms = EXCLUDED.synonyms, active = EXCLUDED.active;' `
    -f (Q $t.id), (Q $t.name), (Q $t.category), (Arr $t.synonyms), (Qb $t.active))
}
$v2 += ''
foreach ($c in $data.collections) {
  $v2 += ('INSERT INTO collections (id, title, tagline, description, icon, audience, task_ids, active) VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, tagline = EXCLUDED.tagline, description = EXCLUDED.description, icon = EXCLUDED.icon, audience = EXCLUDED.audience, task_ids = EXCLUDED.task_ids, active = EXCLUDED.active;' `
    -f (Q $c.id), (Q $c.name), (Q $c.tagline), (Q $c.description), (Q $c.icon), (Q $c.audience), (Arr $c.taskIds), (Qb $c.active))
}
$v2 += ''
[IO.File]::WriteAllText((Join-Path $migDir 'V2__catalog_ref.sql'), ($v2 -join "`n"), $utf8)

# ---------- V3: task summaries (full bodies come in Phase 2) ----------
$v3 = @()
$v3 += '-- Task cards (catalog list summary). Full bodies arrive in Phase 2.'
$v3 += '-- Source: tasks-mockup/assets/js/data-tasks-*.js (generated, do not edit by hand).'
$v3 += ''
$v3 += 'CREATE TABLE IF NOT EXISTS tasks ('
$v3 += '  id          TEXT PRIMARY KEY,'
$v3 += '  title       TEXT NOT NULL,'
$v3 += '  level_id    TEXT NOT NULL REFERENCES levels (id),'
$v3 += "  tags        TEXT[] NOT NULL DEFAULT '{}',"
$v3 += "  status      TEXT NOT NULL DEFAULT 'published',"
$v3 += '  time_min    INTEGER NOT NULL DEFAULT 30,'
$v3 += '  solved_rate INTEGER NOT NULL DEFAULT 0,'
$v3 += '  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),'
$v3 += '  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()'
$v3 += ');'
$v3 += ''
foreach ($t in $data.tasks) {
  $v3 += ('INSERT INTO tasks (id, title, level_id, tags, status, time_min, solved_rate) VALUES ({0}, {1}, {2}, {3}, ''published'', {4}, {5}) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, level_id = EXCLUDED.level_id, tags = EXCLUDED.tags, time_min = EXCLUDED.time_min, solved_rate = EXCLUDED.solved_rate, updated_at = now();' `
    -f (Q $t.id), (Q $t.title), (Q $t.level), (Arr $t.tags), ([int]$t.timeMin), ([int]$t.solvedRate))
}
$v3 += ''
[IO.File]::WriteAllText((Join-Path $migDir 'V3__catalog_tasks.sql'), ($v3 -join "`n"), $utf8)

# ---------- V4: full task bodies (Phase 2; needs seed.json with "full") ----------
function J($o) {
  if ($null -eq $o) { return 'NULL' }
  $raw = ConvertTo-Json $o -Depth 20 -Compress
  return "'" + ($raw -replace "'", "''") + "'::jsonb"
}

if ($data.full) {
  $v4 = @()
  $v4 += '-- Full task bodies: statement, starter tabs, rubric, hints, interview Qs, author solution.'
  $v4 += '-- Source: tasks-mockup/assets/js/data-tasks-*.js (generated, do not edit by hand).'
  $v4 += ''
  $v4 += 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS statement JSONB NOT NULL DEFAULT ''{}'';'
  $v4 += 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS starter_tabs JSONB NOT NULL DEFAULT ''[]'';'
  $v4 += 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rubric JSONB NOT NULL DEFAULT ''[]'';'
  $v4 += 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hints JSONB NOT NULL DEFAULT ''[]'';'
  $v4 += 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS interview_questions JSONB NOT NULL DEFAULT ''[]'';'
  $v4 += 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS author_solution JSONB;'
  $v4 += ''
  foreach ($t in $data.full) {
    $v4 += ('UPDATE tasks SET statement = {0}, starter_tabs = {1}, rubric = {2}, hints = {3}, interview_questions = {4}, author_solution = {5}, updated_at = now() WHERE id = {6};' `
      -f (J $t.statement), (J $t.starterTabs), (J $t.rubric), (J $t.hints), (J $t.interviewQuestions), (J $t.authorSolution), (Q $t.id))
  }
  $v4 += ''
  [IO.File]::WriteAllText((Join-Path $migDir 'V4__tasks_full.sql'), ($v4 -join "`n"), $utf8)
} else {
  Write-Host 'No "full" in seed.json, V4 skipped (old seed without bodies).'
}

Write-Host "Migrations written."
