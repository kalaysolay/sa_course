/* Логика интерактивной карты «Путь аналитика».
   Зависимостей нет: раскладка, SVG-дорога, радар и модалки строятся на месте. */

(() => {
  "use strict";

  const DATA = window.ROADMAP;
  const STORAGE_KEY = "analyst-roadmap-v1";

  const BOARD_W = 1020;
  const X_CENTERS = [150, 390, 630, 870];
  const ROW_GAP = 185;
  const NODE_SIZE = { section: 128, module: 150 };
  const ZONE = { left: 40, width: 940, gapAfter: 60, bottomPad: 96, topPad: 128 };
  const START_TOP = 120;

  /* ---------- состояние ---------- */

  const state = { done: new Set() };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach((id) => state.done.add(id));
    }
  } catch (err) {
    /* localStorage может быть недоступен — карта продолжит работать без сохранения */
  }

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.done]));
    } catch (err) {
      /* молча игнорируем: прогресс просто не сохранится */
    }
  };

  /* ---------- утилиты ---------- */

  const $ = (sel) => document.querySelector(sel);

  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));

  /* Склонение числительных: 1 урок, 2 урока, 5 уроков. */
  const plural = (count, forms) => {
    const abs = Math.abs(count) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return forms[2];
    if (last > 1 && last < 5) return forms[1];
    if (last === 1) return forms[0];
    return forms[2];
  };

  const hexToRgba = (hex, alpha) => {
    const clean = hex.replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    const num = parseInt(full, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const xpForSection = (section) => 20 + section.topics.length * 10;

  /* ---------- карта данных ---------- */

  const MODULE_MAP = new Map();
  const SECTION_MAP = new Map();
  const SECTION_MODULE = new Map();

  DATA.modules.forEach((module) => {
    MODULE_MAP.set(module.id, module);
    module.sections.forEach((section) => {
      SECTION_MAP.set(section.id, section);
      SECTION_MODULE.set(section.id, module);
    });
  });

  const TOTAL_NODES = DATA.modules.reduce((sum, m) => sum + 1 + m.sections.length, 0);
  const TOTAL_SECTIONS = DATA.modules.reduce((sum, m) => sum + m.sections.length, 0);
  const TOTAL_XP = DATA.modules.reduce(
    (sum, m) => sum + m.xp + m.sections.reduce((s, section) => s + xpForSection(section), 0),
    0
  );

  /* ---------- раскладка ---------- */

  function buildLayout() {
    const nodes = [];
    let cursorY = START_TOP;

    DATA.modules.forEach((module) => {
      const zoneTop = cursorY;
      const firstRowY = zoneTop + ZONE.topPad;

      const items = [
        {
          type: "module",
          id: module.id,
          module,
          xp: module.xp,
          title: module.title,
          x: 0,
          y: 0,
          w: NODE_SIZE.module,
          h: NODE_SIZE.module
        },
        ...module.sections.map((section) => ({
          type: "section",
          id: section.id,
          module,
          section,
          xp: xpForSection(section),
          title: section.title,
          x: 0,
          y: 0,
          w: NODE_SIZE.section,
          h: NODE_SIZE.section
        }))
      ];

      const rows = [];
      for (let i = 0; i < items.length; i += 4) rows.push(items.slice(i, i + 4));

      rows.forEach((row, rowIndex) => {
        const order = rowIndex % 2 === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
        row.forEach((item, index) => {
          item.x = X_CENTERS[order[index]];
          item.y = firstRowY + rowIndex * ROW_GAP;
        });
      });

      const lastRowY = firstRowY + (rows.length - 1) * ROW_GAP;
      module._zone = {
        top: zoneTop,
        height: lastRowY + ZONE.bottomPad - zoneTop
      };

      nodes.push(...items);
      cursorY = lastRowY + ZONE.bottomPad + ZONE.gapAfter;
    });

    return { nodes, totalHeight: cursorY };
  }

  const layout = buildLayout();
  const NODES = layout.nodes;
  const TOTAL_HEIGHT = layout.totalHeight;
  const NODE_MAP = new Map(NODES.map((node) => [node.id, node]));

  /* ---------- дорога ---------- */

  function segmentPath(from, to) {
    if (Math.abs(from.y - to.y) < 2) {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }
    const dy = to.y - from.y;
    const c1y = from.y + dy * 0.52;
    const c2y = to.y - dy * 0.52;
    return `M ${from.x} ${from.y} C ${from.x} ${c1y}, ${to.x} ${c2y}, ${to.x} ${to.y}`;
  }

  function renderRoad() {
    const svg = $("#road");
    svg.setAttribute("viewBox", `0 0 ${BOARD_W} ${TOTAL_HEIGHT}`);
    svg.setAttribute("height", String(TOTAL_HEIGHT));

    const segments = [];
    for (let i = 0; i < NODES.length - 1; i += 1) {
      segments.push({ d: segmentPath(NODES[i], NODES[i + 1]), to: NODES[i + 1] });
    }

    // Короткий подъезд от флажка «старт» к первому миру.
    const lead = segmentPath({ x: NODES[0].x, y: 64 }, NODES[0]);
    const full = [lead, ...segments.map((segment) => segment.d)].join(" ");
    let markup =
      `<path class="road-base" d="${full}"></path>` +
      `<path class="road-inner" d="${full}"></path>` +
      `<path class="road-dash" d="${full}"></path>`;

    segments.forEach((segment) => {
      if (state.done.has(segment.to.id)) {
        markup += `<path class="road-done" d="${segment.d}"></path>`;
        markup += `<path class="road-done-dash" d="${segment.d}"></path>`;
      }
    });

    svg.innerHTML = markup;
  }

  /* ---------- отрисовка карты ---------- */

  function renderMap() {
    const zonesEl = $("#zones");
    const nodesEl = $("#nodes");
    zonesEl.innerHTML = "";
    nodesEl.innerHTML = "";

    DATA.modules.forEach((module) => {
      const zone = document.createElement("div");
      zone.className = "zone";
      zone.style.cssText =
        `left:${ZONE.left}px;top:${module._zone.top}px;width:${ZONE.width}px;height:${module._zone.height}px;` +
        `--c:${module.color};--soft:${module.soft};` +
        `background:linear-gradient(140deg, ${module.soft} 0%, rgba(255,255,255,.86) 72%, #ffffff 100%);`;
      zone.innerHTML =
        `<div class="zone-head"><span class="zone-num">Мир ${module.num}</span>` +
        `<span class="zone-name">${esc(module.title)}</span></div>` +
        `<span class="zone-emoji" aria-hidden="true">${module.icon}</span>`;
      zonesEl.appendChild(zone);
    });

    NODES.forEach((node) => {
      const module = node.module;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = node.id;
      btn.className = "node " + (node.type === "module" ? "module" : "section");
      if (module.boss) btn.classList.add("boss");
      if (module.soon) btn.classList.add("soon");

      btn.style.cssText =
        `left:${node.x - node.w / 2}px;top:${node.y - node.h / 2}px;` +
        `width:${node.w}px;height:${node.h}px;--c:${module.color};--soft:${module.soft};`;

      const meta = module.soon
        ? "скоро"
        : module.boss && node.type === "module"
          ? "босс"
          : node.type === "module"
            ? `${module.sections.length} разд.`
            : `${node.section.topics.length} ур.`;

      const worldLabel = module.boss ? "Финал" : `Мир ${module.num}`;
      const icon = node.type === "module" ? module.icon : node.section.icon;
      const shortTitle = node.type === "module" ? module.short : node.section.short;
      const label =
        node.type === "module"
          ? `${worldLabel}: ${module.title}. Открыть описание мира`
          : `Раздел «${node.section.title}». Открыть описание навыков`;

      btn.setAttribute("aria-label", label);
      btn.innerHTML =
        (node.type === "module" ? `<span class="node-world">${worldLabel}</span>` : "") +
        `<span class="node-icon" aria-hidden="true">${icon}</span>` +
        `<span class="node-title">${esc(shortTitle)}</span>` +
        `<span class="node-meta">${esc(meta)}</span>` +
        `<span class="node-check" aria-hidden="true">✓</span>`;

      btn.addEventListener("click", () => openNode(node.id));
      nodesEl.appendChild(btn);
    });

    renderRoad();
    renderMarkers();
  }

  function renderMarkers() {
    const nodesEl = $("#nodes");
    nodesEl.querySelectorAll(".here, .start-flag").forEach((el) => el.remove());

    const startFlag = document.createElement("div");
    startFlag.className = "start-flag";
    startFlag.textContent = "🏁 старт";
    startFlag.style.left = `${NODES[0].x}px`;
    startFlag.style.top = "24px";
    nodesEl.appendChild(startFlag);

    const next = NODES.find(
      (node) => node.type === "section" && !node.module.soon && !state.done.has(node.id)
    );
    const marker = document.createElement("div");

    if (next) {
      marker.className = "here";
      marker.textContent = "▶ ты здесь";
      marker.style.left = `${next.x}px`;
      marker.style.top = `${next.y - next.h / 2 - 12}px`;
    } else {
      const last = NODES[NODES.length - 1];
      marker.className = "here finish";
      marker.textContent = "🏆 финиш";
      marker.style.left = `${last.x}px`;
      marker.style.top = `${last.y - last.h / 2 - 12}px`;
    }

    nodesEl.appendChild(marker);
  }

  /* ---------- HUD ---------- */

  const totalXP = () =>
    NODES.reduce((sum, node) => sum + (state.done.has(node.id) ? node.xp : 0), 0);

  const levelIndex = (xp) => {
    let index = 0;
    DATA.levels.forEach((level, i) => {
      if (xp >= level.xp) index = i;
    });
    return index;
  };

  function updateHUD() {
    const xp = totalXP();
    const index = levelIndex(xp);
    const level = DATA.levels[index];
    const next = DATA.levels[index + 1];

    $("#hudLevelIcon").textContent = level.icon;
    $("#hudLevelName").textContent = level.title;

    if (next) {
      const span = next.xp - level.xp;
      const ratio = span > 0 ? Math.min(1, Math.max(0, (xp - level.xp) / span)) : 1;
      $("#hudXpFill").style.width = `${Math.round(ratio * 100)}%`;
      $("#hudXpLabel").textContent = `${xp} / ${next.xp} XP`;
    } else {
      $("#hudXpFill").style.width = "100%";
      $("#hudXpLabel").textContent = `${xp} XP · максимум`;
    }

    const doneNodes = NODES.filter((node) => state.done.has(node.id)).length;
    $("#hudProgress").textContent = `${doneNodes} / ${TOTAL_NODES} точек`;

    document.querySelectorAll(".node").forEach((el) => {
      el.classList.toggle("done", state.done.has(el.dataset.id));
    });

    renderRoad();
    renderMarkers();
  }

  /* ---------- радар ---------- */

  function radarSVG(values, color) {
    const width = 360;
    const height = 320;
    const cx = 180;
    const cy = 160;
    const radius = 92;
    const count = DATA.axes.length;
    const angles = Array.from({ length: count }, (_, i) => (Math.PI * 2 * i) / count - Math.PI / 2);

    const point = (r, angle) => [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];

    let rings = "";
    for (let level = 1; level <= 5; level += 1) {
      const r = (radius * level) / 5;
      const points = angles
        .map((angle) => point(r, angle).map((n) => n.toFixed(1)).join(","))
        .join(" ");
      rings += `<polygon points="${points}" fill="none" stroke="#e2d8c4" stroke-width="${level === 5 ? 1.6 : 1}"></polygon>`;
    }

    const axes = angles
      .map((angle) => {
        const [x, y] = point(radius, angle);
        return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e2d8c4" stroke-width="1"></line>`;
      })
      .join("");

    const dataPoints = values.map((value, i) => {
      const safe = Math.max(0, Math.min(5, value));
      return point((radius * safe) / 5, angles[i]);
    });
    const polygon = dataPoints.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
    const dots = dataPoints
      .map(
        (p) =>
          `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${color}" stroke="#fff" stroke-width="1.6"></circle>`
      )
      .join("");

    const labels = DATA.axes
      .map((label, i) => {
        const angle = angles[i];
        const [x, y] = point(radius + 27, angle);
        const cos = Math.cos(angle);
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" font-size="10.5" font-weight="700" fill="#64748b">${esc(label)}</text>`;
      })
      .join("");

    const aria = DATA.axes.map((axis, i) => `${axis} ${values[i]} из 5`).join(", ");

    return (
      `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Радар навыков: ${esc(aria)}">` +
      rings +
      axes +
      `<polygon points="${polygon}" fill="${hexToRgba(color, 0.24)}" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"></polygon>` +
      dots +
      labels +
      `</svg>`
    );
  }

  const aggregateRadar = (module, onlyDone = false) => {
    const values = [0, 0, 0, 0, 0, 0];
    module.sections.forEach((section) => {
      if (onlyDone && !state.done.has(section.id)) return;
      section.radar.forEach((value, i) => {
        values[i] = Math.max(values[i], value);
      });
    });
    return values;
  };

  const globalRadar = () => {
    const values = [0, 0, 0, 0, 0, 0];
    DATA.modules.forEach((module) => {
      module.sections.forEach((section) => {
        if (!state.done.has(section.id)) return;
        section.radar.forEach((value, i) => {
          values[i] = Math.max(values[i], value);
        });
      });
    });
    return values;
  };

  /* ---------- модалка ---------- */

  const overlay = $("#overlay");
  const modal = $("#modal");
  let current = null;
  let lastFocus = null;

  function showOverlay() {
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    if (overlay.hidden) lastFocus = document.activeElement;
    window.setTimeout(() => {
      const close = modal.querySelector(".modal-close");
      if (close) close.focus();
    }, 40);
  }

  function closeOverlay() {
    overlay.hidden = true;
    document.body.style.overflow = "";
    current = null;
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function openNode(id) {
    const node = NODE_MAP.get(id);
    if (!node) return;
    current = { kind: node.type === "module" ? "module" : "section", id };
    renderCurrentModal();
    modal.scrollTop = 0;
    showOverlay();
  }

  function openProfile() {
    current = { kind: "profile" };
    renderCurrentModal();
    modal.scrollTop = 0;
    showOverlay();
  }

  function renderCurrentModal() {
    if (!current) return;
    const scrollTop = modal.scrollTop;
    if (current.kind === "section") {
      modal.innerHTML = sectionModalHTML(current.id);
    } else if (current.kind === "module") {
      modal.innerHTML = moduleModalHTML(current.id);
    } else {
      modal.innerHTML = profileModalHTML();
    }
    modal.scrollTop = scrollTop;
  }

  function closeButtonHTML() {
    return `<button type="button" class="modal-close" data-close aria-label="Закрыть окно">✕</button>`;
  }

  function topicsHTML(module, section) {
    const readyCount = section.topics.filter((topic) => topic[3] === 1).length;
    const rows = section.topics
      .map((topic) => {
        const [id, title, order, available] = topic;
        const isSoon = Boolean(module.soon);
        const status = available
          ? `<span class="topic-status ready">📖 урок</span>`
          : isSoon
            ? `<span class="topic-status soon">🧪 скоро</span>`
            : `<span class="topic-status wip">🚧 в работе</span>`;
        const sub = available
          ? "Открыть лекцию · Markdown"
          : isSoon
            ? "Содержание ещё проектируется"
            : "Появится после публикации";
        const body =
          `<span class="topic-num">${order}</span>` +
          `<span class="topic-main"><span class="topic-title">${esc(title)}</span>` +
          `<span class="topic-sub">${sub}</span></span>` +
          status;

        if (available) {
          return (
            `<a class="topic is-link" href="../output/${module.id}/${id}/lecture.md" target="_blank" rel="noopener">` +
            body +
            `<span class="topic-arrow" aria-hidden="true">↗</span></a>`
          );
        }
        return `<div class="topic">${body}</div>`;
      })
      .join("");

    return (
      `<div class="lessons" style="--c:${module.color};--soft:${module.soft};">` +
      `<div class="lessons-head"><h4>Уроки раздела</h4>` +
      `<span>${section.topics.length} ${plural(section.topics.length, ["тема", "темы", "тем"])} · ${readyCount} опубликовано</span></div>` +
      rows +
      `</div>`
    );
  }

  function sectionModalHTML(id) {
    const section = SECTION_MAP.get(id);
    const module = SECTION_MODULE.get(id);
    if (!section || !module) return "";

    const sectionIndex = module.sections.indexOf(section) + 1;
    const done = state.done.has(section.id);
    const xp = xpForSection(section);
    const useList = section.use.map((item) => `<li>${esc(item)}</li>`).join("");
    const worldLabel = module.boss ? "Финал" : module.soon ? "Секретный уровень" : `Мир ${module.num}`;

    return (
      `<div class="modal-head" style="--c:${module.color};--soft:${module.soft};">` +
      `<div class="modal-tag">${module.icon} ${worldLabel} · раздел ${sectionIndex}</div>` +
      `<div class="modal-head-row">` +
      `<div class="modal-icon" aria-hidden="true">${section.icon}</div>` +
      `<div><h2 class="modal-title" id="modalTitle">${esc(section.title)}</h2>` +
      `<p class="modal-tagline">${esc(module.title)}</p></div>` +
      `</div>` +
      closeButtonHTML() +
      `</div>` +
      `<div class="modal-body" style="--c:${module.color};--soft:${module.soft};">` +
      `<div class="modal-grid">` +
      `<div><div class="radar-card">${radarSVG(section.radar, module.color)}` +
      `<p class="radar-card-title">радар навыков</p>` +
      `<p class="radar-hint">0–5 — глубина прокачки</p></div></div>` +
      `<div>` +
      `<div class="block"><h3 class="block-title">Что это за навык</h3><p>${esc(section.desc)}</p></div>` +
      `<div class="block"><h3 class="block-title">Где пригодится</h3><ul class="use-list">${useList}</ul></div>` +
      `</div></div>` +
      topicsHTML(module, section) +
      `</div>` +
      `<div class="modal-foot">` +
      `<span class="xp-chip">⚡ +${xp} XP</span>` +
      `<button type="button" class="btn btn-sm ${done ? "btn-undone" : "btn-done"}" data-complete="${section.id}">` +
      `${done ? "✓ Пройдено — снять отметку" : module.soon ? "✓ Я уже знаком с темой" : "Отметить пройденным"}</button>` +
      `</div>`
    );
  }

  function moduleModalHTML(id) {
    const module = MODULE_MAP.get(id);
    if (!module) return "";

    const doneSections = module.sections.filter((section) => state.done.has(section.id)).length;
    const allDone = doneSections === module.sections.length && state.done.has(module.id);
    const useList = module.use.map((item) => `<li>${esc(item)}</li>`).join("");
    const worldLabel = module.boss ? "Финал" : module.soon ? "Секретный уровень" : `Мир ${module.num}`;

    const rows = module.sections
      .map((section) => {
        const done = state.done.has(section.id);
        return (
          `<button type="button" class="section-row" data-open="${section.id}">` +
          `<span class="section-row-icon" aria-hidden="true">${section.icon}</span>` +
          `<span class="section-row-main"><span class="section-row-title">${esc(section.title)}</span>` +
          `<span class="section-row-sub">${section.topics.length} ${plural(section.topics.length, ["урок", "урока", "уроков"])} · радар ${section.radar.reduce((a, b) => a + b, 0)}</span></span>` +
          (done
            ? `<span class="section-row-done">✓ пройдено</span>`
            : `<span class="topic-arrow" aria-hidden="true">→</span>`) +
          `</button>`
        );
      })
      .join("");

    const totalXp = module.xp + module.sections.reduce((sum, section) => sum + xpForSection(section), 0);

    return (
      `<div class="modal-head" style="--c:${module.color};--soft:${module.soft};">` +
      `<div class="modal-tag">${module.icon} ${worldLabel} · модуль</div>` +
      `<div class="modal-head-row">` +
      `<div class="modal-icon" aria-hidden="true">${module.icon}</div>` +
      `<div><h2 class="modal-title" id="modalTitle">${esc(module.title)}</h2>` +
      `<p class="modal-tagline">${esc(module.tagline)}</p></div>` +
      `</div>` +
      closeButtonHTML() +
      `</div>` +
      `<div class="modal-body" style="--c:${module.color};--soft:${module.soft};">` +
      `<div class="modal-grid">` +
      `<div><div class="radar-card">${radarSVG(aggregateRadar(module), module.color)}` +
      `<p class="radar-card-title">радар мира</p>` +
      `<p class="radar-hint">лучшее из разделов мира</p></div></div>` +
      `<div>` +
      `<div class="block"><h3 class="block-title">Что за мир</h3><p>${esc(module.desc)}</p></div>` +
      `<div class="block"><h3 class="block-title">Что прокачаешь</h3><ul class="use-list">${useList}</ul></div>` +
      `</div></div>` +
      `<div class="block"><h3 class="block-title">Разделы мира (${doneSections} из ${module.sections.length})</h3>` +
      `<div class="section-list" style="--c:${module.color};--soft:${module.soft};">${rows}</div></div>` +
      `</div>` +
      `<div class="modal-foot">` +
      `<span class="xp-chip">⚡ +${totalXp} XP за мир</span>` +
      `<button type="button" class="btn btn-sm ${allDone ? "btn-undone" : "btn-done"}" data-world="${module.id}">` +
      `${allDone ? "Снять отметку со всего мира" : module.soon ? "Отметить как знакомое" : "Отметить весь мир"}</button>` +
      `</div>`
    );
  }

  function profileModalHTML() {
    const xp = totalXP();
    const index = levelIndex(xp);
    const level = DATA.levels[index];
    const doneSections = TOTAL_SECTIONS - DATA.modules.reduce(
      (sum, module) => sum + module.sections.filter((section) => !state.done.has(section.id)).length,
      0
    );
    const doneModules = DATA.modules.filter(
      (module) => state.done.has(module.id) && module.sections.every((section) => state.done.has(section.id))
    ).length;
    const availableLessons = DATA.modules.reduce(
      (sum, module) =>
        sum + module.sections.reduce((s, section) => s + section.topics.filter((topic) => topic[3] === 1).length, 0),
      0
    );
    const radar = globalRadar();
    const empty = doneSections === 0;

    const worlds = DATA.modules
      .map((module) => {
        const done = module.sections.filter((section) => state.done.has(section.id)).length;
        const percent = module.sections.length ? Math.round((done / module.sections.length) * 100) : 0;
        return (
          `<div class="wp-row" style="--c:${module.color};">` +
          `<span class="wp-name">${module.icon} ${esc(module.short)}</span>` +
          `<span class="wp-track"><span class="wp-fill" style="width:${percent}%"></span></span>` +
          `<span class="wp-val">${done}/${module.sections.length}</span>` +
          `</div>`
        );
      })
      .join("");

    return (
      `<div class="modal-head" style="--c:#2563eb;--soft:#dbeafe;">` +
      `<div class="modal-tag">📊 твой прогресс</div>` +
      `<div class="modal-head-row">` +
      `<div class="modal-icon" aria-hidden="true">${level.icon}</div>` +
      `<div><h2 class="modal-title" id="modalTitle">Мой профиль</h2>` +
      `<p class="modal-tagline">${esc(level.title)} · ${xp} XP</p></div>` +
      `</div>` +
      closeButtonHTML() +
      `</div>` +
      `<div class="modal-body" style="--c:#2563eb;--soft:#dbeafe;">` +
      `<div class="modal-grid">` +
      `<div><div class="radar-card">${radarSVG(radar, "#2563eb")}` +
      `<p class="radar-card-title">твой радар</p>` +
      `<p class="radar-hint">${empty ? "отметь первый раздел — и он начнёт расти" : "лучший результат по пройденным разделам"}</p></div></div>` +
      `<div>` +
      `<div class="profile-stats">` +
      `<div class="pstat"><b>${doneSections} / ${TOTAL_SECTIONS}</b><span>разделов пройдено</span></div>` +
      `<div class="pstat"><b>${doneModules} / ${DATA.modules.length}</b><span>миров закрыто</span></div>` +
      `<div class="pstat"><b>${availableLessons}</b><span>${plural(availableLessons, ["урок опубликован", "урока опубликовано", "уроков опубликовано"])}</span></div>` +
      `<div class="pstat"><b>${xp} / ${TOTAL_XP}</b><span>XP набрано</span></div>` +
      `</div>` +
      `<div class="block"><h3 class="block-title">Прогресс по мирам</h3>` +
      `<div class="world-progress">${worlds}</div></div>` +
      `</div></div>` +
      `</div>` +
      `<div class="modal-foot">` +
      `<button type="button" class="btn btn-sm btn-ghost" data-reset>🧹 Сбросить прогресс</button>` +
      `<button type="button" class="btn btn-sm btn-primary" data-continue>▶ Продолжить путь</button>` +
      `</div>`
    );
  }

  /* ---------- прогресс ---------- */

  function maybeLevelUp(previousXp) {
    const before = levelIndex(previousXp);
    const after = levelIndex(totalXP());
    if (after > before) {
      const level = DATA.levels[after];
      window.setTimeout(() => {
        toast(`Новый уровень: ${level.title}!`, level.icon, "levelup");
      }, 420);
    }
  }

  function toggleDone(id, sourceEl) {
    const node = NODE_MAP.get(id);
    if (!node) return;

    const previousXp = totalXP();
    const wasDone = state.done.has(id);

    if (wasDone) state.done.delete(id);
    else state.done.add(id);

    persist();
    updateHUD();

    if (!wasDone) {
      const rect = sourceEl ? sourceEl.getBoundingClientRect() : null;
      if (rect) spawnConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      toast(`+${node.xp} XP · ${node.title}`, "⚡");
      maybeLevelUp(previousXp);
    } else {
      toast("Отметка снята", "↩️");
    }

    renderCurrentModal();
  }

  function toggleWorld(moduleId, sourceEl) {
    const module = MODULE_MAP.get(moduleId);
    if (!module) return;

    const ids = [module.id, ...module.sections.map((section) => section.id)];
    const allDone = ids.every((id) => state.done.has(id));
    const previousXp = totalXP();

    let gained = 0;
    if (allDone) {
      ids.forEach((id) => state.done.delete(id));
    } else {
      ids.forEach((id) => {
        if (!state.done.has(id)) {
          state.done.add(id);
          const node = NODE_MAP.get(id);
          if (node) gained += node.xp;
        }
      });
    }

    persist();
    updateHUD();

    if (!allDone) {
      const rect = sourceEl ? sourceEl.getBoundingClientRect() : null;
      if (rect) spawnConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      toast(`Мир «${module.short}» закрыт! +${gained} XP`, "🌍");
      maybeLevelUp(previousXp);
    } else {
      toast(`Мир «${module.short}» снова в пути`, "↩️");
    }

    renderCurrentModal();
  }

  function nextSection() {
    for (const module of DATA.modules) {
      if (module.soon) continue; // закрытый «секретный уровень» не блокирует маршрут
      for (const section of module.sections) {
        if (!state.done.has(section.id)) return section;
      }
    }
    return null;
  }

  function continuePath() {
    const section = nextSection();
    if (section) openNode(section.id);
    else openNode("M11");
  }

  function resetProgress() {
    if (!window.confirm("Сбросить весь прогресс? XP и отметки исчезнут.")) return;
    state.done.clear();
    persist();
    updateHUD();
    closeOverlay();
    toast("Прогресс сброшен. Карта ждёт!", "🧹");
  }

  /* ---------- тосты и конфетти ---------- */

  function toast(text, icon = "✨", variant = "") {
    const el = document.createElement("div");
    el.className = "toast" + (variant ? ` ${variant}` : "");
    el.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon}</span><span>${esc(text)}</span>`;
    $("#toasts").appendChild(el);

    window.setTimeout(() => {
      el.style.transition = "opacity .3s ease, transform .3s ease";
      el.style.opacity = "0";
      el.style.transform = "translateX(14px)";
      window.setTimeout(() => el.remove(), 320);
    }, 3000);
  }

  function spawnConfetti(x, y) {
    const layer = $("#confetti");
    const colors = ["#f59e0b", "#22c55e", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];

    for (let i = 0; i < 26; i += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti";
      piece.style.left = `${x}px`;
      piece.style.top = `${y}px`;
      piece.style.setProperty("--cc", colors[i % colors.length]);

      const angle = Math.random() * Math.PI * 2;
      const distance = 60 + Math.random() * 140;
      piece.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
      piece.style.setProperty("--ty", `${Math.sin(angle) * distance + 70}px`);
      piece.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);

      layer.appendChild(piece);
      window.setTimeout(() => piece.remove(), 1300);
    }
  }

  /* ---------- масштабирование доски ---------- */

  function fitBoard() {
    const fit = $("#boardFit");
    const frame = $("#boardFrame");
    const board = $("#board");
    const available = fit.clientWidth - 20;
    const scale = Math.max(0.85, Math.min(1, available / BOARD_W));

    frame.style.width = `${Math.round(BOARD_W * scale)}px`;
    frame.style.height = `${Math.round(TOTAL_HEIGHT * scale)}px`;
    board.style.transform = `scale(${scale})`;
  }

  /* ---------- события ---------- */

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeOverlay();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeOverlay();
  });

  modal.addEventListener("click", (event) => {
    const closeBtn = event.target.closest("[data-close]");
    if (closeBtn) {
      closeOverlay();
      return;
    }

    const openBtn = event.target.closest("[data-open]");
    if (openBtn) {
      openNode(openBtn.dataset.open);
      return;
    }

    const completeBtn = event.target.closest("[data-complete]");
    if (completeBtn) {
      toggleDone(completeBtn.dataset.complete, completeBtn);
      return;
    }

    const worldBtn = event.target.closest("[data-world]");
    if (worldBtn) {
      toggleWorld(worldBtn.dataset.world, worldBtn);
      return;
    }

    const continueBtn = event.target.closest("[data-continue]");
    if (continueBtn) {
      closeOverlay();
      window.setTimeout(continuePath, 140);
      return;
    }

    const resetBtn = event.target.closest("[data-reset]");
    if (resetBtn) resetProgress();
  });

  $("#continueBtn").addEventListener("click", continuePath);
  $("#profileBtn").addEventListener("click", openProfile);
  $("#profileBtn2").addEventListener("click", openProfile);

  $("#resetBtn").addEventListener("click", () => {
    if (!window.confirm("Сбросить весь прогресс? XP и отметки исчезнут.")) return;
    state.done.clear();
    persist();
    updateHUD();
    toast("Прогресс сброшен. Карта ждёт!", "🧹");
  });

  window.addEventListener("resize", fitBoard);

  /* ---------- старт ---------- */

  $("#statWorlds").textContent = String(DATA.modules.length);
  $("#statSections").textContent = String(TOTAL_SECTIONS);
  $("#statTopics").textContent = String(DATA.meta.totalTopics);
  $("#statXp").textContent = String(TOTAL_XP);

  renderMap();
  updateHUD();
  fitBoard();
})();
