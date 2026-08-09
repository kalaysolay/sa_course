const state = {
  mode: location.protocol === 'file:' ? 'files' : 'server',
  root: '',
  lectures: [],
  selectedId: null,
  files: new Map(),
  assetUrls: new Map()
};

const elements = {
  rootForm: document.querySelector('#rootForm'),
  rootInput: document.querySelector('#rootInput'),
  folderButton: document.querySelector('#folderButton'),
  folderInput: document.querySelector('#folderInput'),
  refreshButton: document.querySelector('#refreshButton'),
  lectureList: document.querySelector('#lectureList'),
  lectureCount: document.querySelector('#lectureCount'),
  statusText: document.querySelector('#statusText'),
  lecturePath: document.querySelector('#lecturePath'),
  lectureTitle: document.querySelector('#lectureTitle'),
  materialLinks: document.querySelector('#materialLinks'),
  markdownContent: document.querySelector('#markdownContent')
};

function pluralizeLecture(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} лекций`;
  if (last === 1) return `${count} лекция`;
  if (last >= 2 && last <= 4) return `${count} лекции`;
  return `${count} лекций`;
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isSafeUrl(url) {
  return /^(https?:|mailto:|#|\/)/i.test(url) || !/^[a-z][a-z0-9+.-]*:/i.test(url);
}

function assetUrl(baseId, href) {
  if (state.mode === 'files') {
    return localAssetUrl(baseId, href);
  }
  return `/api/asset?base=${encodeURIComponent(baseId)}&href=${encodeURIComponent(href)}`;
}

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

function dirname(value) {
  const path = normalizePath(value);
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function basename(value) {
  const path = normalizePath(value);
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

function joinPath(...parts) {
  const output = [];
  for (const part of parts.join('/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') output.pop();
    else output.push(part);
  }
  return output.join('/');
}

function localAssetUrl(baseId, href) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/')) return href;
  const assetPath = joinPath(dirname(baseId), href);
  const file = state.files.get(assetPath);
  if (!file) return '#';
  if (!state.assetUrls.has(assetPath)) {
    state.assetUrls.set(assetPath, URL.createObjectURL(file));
  }
  return state.assetUrls.get(assetPath);
}

function inlineMarkdown(text, baseId) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, href) => {
    const safeHref = isSafeUrl(href) ? href : '#';
    const src = /^[a-z][a-z0-9+.-]*:/i.test(safeHref) || safeHref.startsWith('/')
      ? safeHref
      : assetUrl(baseId, safeHref);
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = isSafeUrl(href) ? href : '#';
    return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  return html;
}

function parseTable(lines, start, baseId) {
  const separator = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  if (!lines[start + 1] || !separator.test(lines[start + 1])) return null;

  const rows = [];
  let index = start;
  while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) {
    if (index !== start + 1) {
      rows.push(lines[index].trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
    }
    index += 1;
  }

  const [head, ...body] = rows;
  const headHtml = head.map((cell) => `<th>${inlineMarkdown(cell, baseId)}</th>`).join('');
  const bodyHtml = body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell, baseId)}</td>`).join('')}</tr>`).join('');
  return {
    html: `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`,
    next: index
  };
}

function renderMarkdown(markdown, baseId) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      html.push(`<pre><code class="language-${escapeHtml(language)}">${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const table = parseTable(lines, index, baseId);
    if (table) {
      html.push(table.html);
      index = table.next;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2], baseId)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quote = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      html.push(`<blockquote>${quote.map((item) => inlineMarkdown(item, baseId)).join('<br>')}</blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ''));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${inlineMarkdown(item, baseId)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${inlineMarkdown(item, baseId)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,6})\s+/.test(lines[index].trim())
      && !/^[-*+]\s+/.test(lines[index].trim())
      && !/^\d+\.\s+/.test(lines[index].trim())
      && !lines[index].trim().startsWith('```')
      && !lines[index].trim().startsWith('>')
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${inlineMarkdown(paragraph.join(' '), baseId)}</p>`);
  }

  return html.join('\n');
}

function renderList() {
  elements.lectureList.innerHTML = '';
  elements.lectureCount.textContent = pluralizeLecture(state.lectures.length);

  if (state.lectures.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'Markdown-лекции не найдены';
    elements.lectureList.append(empty);
    return;
  }

  for (const lecture of state.lectures) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lecture-link';
    button.dataset.id = lecture.id;
    button.setAttribute('aria-current', lecture.id === state.selectedId ? 'page' : 'false');
    button.innerHTML = `
      <span class="lecture-link-title">${escapeHtml(lecture.title)}</span>
      <span class="lecture-link-path">${escapeHtml(lecture.folder)}</span>
    `;
    button.addEventListener('click', () => openLecture(lecture.id));
    elements.lectureList.append(button);
  }
}

function renderMaterials(lecture) {
  elements.materialLinks.innerHTML = '';
  if (!lecture.materials?.length) return;

  for (const material of lecture.materials) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'material-button';
    button.textContent = material.name;
    button.title = material.path;
    button.addEventListener('click', () => openLecture(material.id));
    elements.materialLinks.append(button);
  }
}

async function loadLectures() {
  if (state.mode === 'files') {
    elements.rootInput.value = '';
    elements.rootInput.placeholder = 'Нажмите кнопку выбора папки справа';
    elements.markdownContent.classList.add('empty-state');
    elements.markdownContent.textContent = 'HTML открыт напрямую. Выберите папку через кнопку "...", чтобы браузер получил доступ к Markdown-файлам.';
    renderList();
    setStatus('Выберите папку');
    return;
  }

  setStatus('Загрузка');
  const response = await fetch('/api/lectures');
  if (!response.ok) throw new Error('Не удалось загрузить список лекций');
  const data = await response.json();
  state.root = data.root;
  state.lectures = data.lectures;
  elements.rootInput.value = data.root;
  renderList();
  setStatus('Готово');

  if (!state.selectedId && state.lectures[0]) {
    await openLecture(state.lectures[0].id);
  }
}

async function openLecture(id) {
  state.selectedId = id;
  renderList();
  setStatus('Открытие');

  if (state.mode === 'files') {
    const lecture = state.lectures.find((item) => item.id === id);
    const file = state.files.get(id);
    if (!lecture || !file) throw new Error('Файл лекции не найден');

    lecture.content = await file.text();
    elements.lectureTitle.textContent = lecture.title;
    elements.lecturePath.textContent = lecture.path;
    elements.markdownContent.classList.remove('empty-state');
    elements.markdownContent.innerHTML = renderMarkdown(lecture.content, lecture.id);
    renderMaterials(lecture);
    setStatus('Готово');
    return;
  }

  const response = await fetch(`/api/lecture?id=${encodeURIComponent(id)}`);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Не удалось открыть лекцию');
  }

  const lecture = await response.json();
  elements.lectureTitle.textContent = lecture.title;
  elements.lecturePath.textContent = lecture.path;
  elements.markdownContent.classList.remove('empty-state');
  elements.markdownContent.innerHTML = renderMarkdown(lecture.content, lecture.id);
  renderMaterials(lecture);
  setStatus('Готово');
}

elements.rootForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const root = elements.rootInput.value.trim();
  if (!root) return;

  try {
    if (state.mode === 'files') {
      setStatus('Используйте выбор папки');
      elements.markdownContent.classList.add('empty-state');
      elements.markdownContent.textContent = 'При прямом открытии index.html браузер не может читать путь из текстового поля. Нажмите кнопку "..." и выберите папку.';
      return;
    }

    setStatus('Смена папки');
    const response = await fetch('/api/root', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось открыть папку');
    state.selectedId = null;
    state.root = data.root;
    state.lectures = data.lectures;
    elements.rootInput.value = data.root;
    renderList();
    if (state.lectures[0]) await openLecture(state.lectures[0].id);
    setStatus('Готово');
  } catch (error) {
    setStatus(error.message);
  }
});

elements.refreshButton.addEventListener('click', () => {
  if (state.mode === 'files' && state.files.size > 0) {
    scanSelectedFiles().catch((error) => setStatus(error.message));
    return;
  }
  loadLectures().catch((error) => setStatus(error.message));
});

elements.folderButton.addEventListener('click', () => {
  elements.folderInput.click();
});

elements.folderInput.addEventListener('change', () => {
  scanSelectedFiles().catch((error) => setStatus(error.message));
});

async function firstHeadingFromFile(file) {
  const text = await file.text();
  const heading = text.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || null;
}

function relativeFilePath(file) {
  return normalizePath(file.webkitRelativePath || file.name);
}

async function scanSelectedFiles() {
  state.mode = 'files';
  state.files.clear();
  for (const url of state.assetUrls.values()) URL.revokeObjectURL(url);
  state.assetUrls.clear();

  const files = Array.from(elements.folderInput.files || []);
  for (const file of files) {
    state.files.set(relativeFilePath(file), file);
  }

  const markdown = files
    .filter((file) => relativeFilePath(file).toLowerCase().endsWith('.md'))
    .sort((a, b) => relativeFilePath(a).localeCompare(relativeFilePath(b), 'ru', { numeric: true }));

  const lectureFiles = markdown.filter((file) => basename(relativeFilePath(file)).toLowerCase() === 'lecture.md');
  const primaryFiles = lectureFiles.length > 0 ? lectureFiles : markdown;
  const allMarkdownPaths = markdown.map(relativeFilePath);
  const lectures = [];

  for (const file of primaryFiles) {
    const filePath = relativeFilePath(file);
    const folder = dirname(filePath) || '.';
    const materials = allMarkdownPaths
      .filter((path) => dirname(path) === folder && path !== filePath)
      .map((path) => ({ id: path, name: basename(path), path }));

    lectures.push({
      id: filePath,
      title: (await firstHeadingFromFile(file)) ?? (basename(folder) || basename(filePath).replace(/\.md$/i, '')),
      path: filePath,
      folder,
      materialCount: materials.length,
      materials
    });
  }

  state.selectedId = null;
  state.root = files[0]?.webkitRelativePath?.split('/')[0] || 'selected folder';
  state.lectures = lectures;
  elements.rootInput.value = state.root;
  renderList();
  setStatus('Готово');

  if (state.lectures[0]) {
    await openLecture(state.lectures[0].id);
  } else {
    elements.markdownContent.classList.add('empty-state');
    elements.markdownContent.textContent = 'В выбранной папке Markdown-файлы не найдены.';
  }
}

loadLectures().catch((error) => setStatus(error.message));
