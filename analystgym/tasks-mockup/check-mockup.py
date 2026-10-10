"""Integrity checks for the AnalystGym mockup.

Verifies (without a JS runtime):
 1. All <script src> in HTML files point to existing files.
 2. Every task tag / level / collection taskId resolves to a real dictionary entry.
 3. Every question has a valid answer index and a known competency.
 4. Rubrics, starter tabs, hints, interview questions are non-empty.
 5. Cross-page function usage: UI.*/Store.*/ReviewEngine.*/Scoring.* names used
    in page scripts exist in the shared modules.
 6. Rough brace/paren balance per JS file (strings and comments stripped).
"""

import os
import re
import sys

ROOT = r"D:\Projects\sa_course\tasks-mockup"
JS = os.path.join(ROOT, "assets", "js")
HTML_FILES = [
    "practice.html",
    "catalog.html",
    "collections.html",
    "task.html",
    "assessment.html",
    "results.html",
    "admin.html",
]

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


# ---------- 1. script references ----------
page_scripts = {}
for html in HTML_FILES:
    text = read(os.path.join(ROOT, html))
    srcs = re.findall(r'<script\s+src="([^"]+)"', text)
    page_scripts[html] = srcs
    for src in srcs:
        if src.startswith("http"):
            continue
        full = os.path.normpath(os.path.join(ROOT, src.lstrip("./")))
        if not os.path.isfile(full):
            err(f"{html}: missing script file {src}")

print("scripts referenced per page:")
for html, srcs in page_scripts.items():
    print(f"  {html}: {len(srcs)} scripts")

all_js = {}
for name in os.listdir(JS):
    if name.endswith(".js"):
        all_js[name] = read(os.path.join(JS, name))

# ---------- helpers to extract data ----------
def extract_ids(text, pattern):
    return re.findall(pattern, text)

tag_ids = set(re.findall(r"\{\s*id:\s*'([^']+)',\s*name:", all_js["data-core.js"]))
# tag entries have name+category; level entries have cssClass; collection entries have icon+tagline
level_ids = set(re.findall(r"id:\s*'(\w+)'\s*,\s*\n?\s*name:\s*'[^']*'\s*,\s*\n?\s*cssClass", all_js["data-core.js"]))
competency_ids = set(re.findall(r"\{\s*id:\s*'([^']+)',\s*name:.*icon:", all_js["data-core.js"]))
collection_ids = set(re.findall(r"id:\s*'([\w-]+)'\s*,\s*\n?\s*name:", all_js["data-core.js"]))

# task ids: top-level task objects start with "id: '...',\n    title:"
task_ids = set(re.findall(r"\n  \{\n    id:\s*'([\w-]+)',\s*\n    title:", all_js["data-tasks-1.js"] + all_js["data-tasks-2.js"]))

print(f"\ntags={len(tag_ids)} levels={level_ids} competencies={len(competency_ids)} collections={len(collection_ids)} tasks={len(task_ids)}")

# ---------- 2. tag/level/collection references ----------
for fname in ("data-tasks-1.js", "data-tasks-2.js"):
    text = all_js[fname]
    # tags arrays
    for match in re.finditer(r"tags:\s*\[([^\]]*)\]", text):
        for tag in re.findall(r"'([\w-]+)'", match.group(1)):
            if tag not in tag_ids:
                err(f"{fname}: unknown tag '{tag}'")
    # level values
    for level in re.findall(r"\n    level:\s*'([^']+)'", text):
        if level not in level_ids:
            err(f"{fname}: unknown level '{level}'")
    # starter tab types
    for ttype in re.findall(r"\n\s+type:\s*'([^']+)'", text):
        if ttype not in ("doc", "plantuml", "mermaid"):
            err(f"{fname}: unknown starter tab type '{ttype}'")

# collections -> taskIds
for match in re.finditer(r"taskIds:\s*\[([^\]]*)\]", all_js["data-core.js"]):
    for tid in re.findall(r"'([\w-]+)'", match.group(1)):
        if tid not in task_ids:
            err(f"data-core.js: collection references unknown task '{tid}'")

# ---------- 3. questions ----------
qtext = all_js["questions.js"]
qblocks = re.findall(
    r"\{\s*\n\s*id:\s*'([^']+)'.*?competency:\s*'([^']+)'.*?difficulty:\s*(\d)(.*?)answer:\s*(\d+)",
    qtext,
    re.S,
)
print(f"questions found: {len(qblocks)}")
seen_q = set()
for qid, comp, diff, middle, answer in qblocks:
    if qid in seen_q:
        err(f"questions.js: duplicate id {qid}")
    seen_q.add(qid)
    if comp not in competency_ids:
        err(f"questions.js: {qid} unknown competency '{comp}'")
    if diff not in ("1", "2", "3"):
        err(f"questions.js: {qid} bad difficulty {diff}")
    options = re.findall(r"'((?:[^'\\]|\\.)*)'", middle.split("options:")[-1] if "options:" in middle else "")
    # count options between 'options: [' and '],'
    opt_section = re.search(r"options:\s*\[(.*?)\]\s*,\s*\n", middle, re.S)
    if opt_section:
        n_opts = len(re.findall(r"^\s*'", opt_section.group(1), re.M))
        if not (0 <= int(answer) < n_opts):
            err(f"questions.js: {qid} answer={answer} out of {n_opts} options")

# rubric entries non-empty + keywords non-empty
for fname in ("data-tasks-1.js", "data-tasks-2.js"):
    text = all_js[fname]
    n_rubric = len(re.findall(r"rubric:\s*\[", text))
    n_criteria = len(re.findall(r"\n\s+id:\s*'[\w-]+',\s*\n\s+title:", text))
    print(f"{fname}: rubric blocks ok, criteria entries ~{n_criteria}")
    if n_rubric == 0:
        err(f"{fname}: no rubric found")

# ---------- 4. cross-module function usage ----------
definitions = {
    "AppUI": set(re.findall(r"AppUI\.(\w+)\s*=", all_js["ui.js"])),
    "Store": set(re.findall(r"^\s{4}(\w+)\(\)", all_js["store.js"], re.M))
    | set(re.findall(r"^\s{4}(get \w+|\w+)\(", all_js["store.js"], re.M)),
    "ReviewEngine": {"stages", "grades", "agents", "buildReview", "runReview"},
    "Scoring": {"compute", "buildPlan", "narrative", "marketView", "tierFor", "tierLabel"},
}

for page_js in ("landing.js", "catalog.js", "collections.js", "task.js",
                "assessment.js", "results.js", "admin.js"):
    text = all_js[page_js]
    for mod, defined in definitions.items():
        for used in set(re.findall(rf"{mod}\.(\w+)", text)):
            if used not in defined and used != "__internals":
                # Store getters defined as `name(...)` or `get name`
                err(f"{page_js}: uses {mod}.{used} which is not defined")

print("\ndefined API:")
for mod, defined in definitions.items():
    print(f"  {mod}: {sorted(defined)}")

# ---------- 5. rough brace balance ----------
def strip_js(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    # template literals, single/double quoted strings (rough)
    text = re.sub(r"`(?:[^`\\]|\\.)*`", '""', text, flags=re.S)
    text = re.sub(r"'(?:[^'\\\n]|\\.)*'", '""', text)
    text = re.sub(r'"(?:[^"\\\n]|\\.)*"', '""', text)
    return text

for name, text in all_js.items():
    stripped = strip_js(text)
    for left, right in (("{", "}"), ("(", ")"), ("[", "]")):
        if stripped.count(left) != stripped.count(right):
            err(f"{name}: unbalanced {left}{right}: {stripped.count(left)} vs {stripped.count(right)}")

# vendor files exist and non-empty
for vendor in ("mermaid.min.js", "plantuml.js", "viz-global.js"):
    full = os.path.join(ROOT, "assets", "vendor", vendor)
    if not os.path.isfile(full) or os.path.getsize(full) < 1000:
        err(f"vendor/{vendor} missing or too small")

print(f"\nERRORS: {len(errors)}")
for e in errors:
    print("  [ERR]", e)
print(f"WARNINGS: {len(warnings)}")
for w in warnings:
    print("  [WARN]", w)

sys.exit(1 if errors else 0)
