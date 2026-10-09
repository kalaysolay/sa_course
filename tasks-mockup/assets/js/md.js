/* ============================================================
   md.js — Markdown → HTML для контента курса (output/*.md)
   По мотивам рендера viewer'а: заголовки, таблицы, списки,
   цитаты, code-fences. Диаграммы mermaid/plantuml уходят
   в AppUI.embedDiagram и рендерятся локально в браузере.
   ============================================================ */

window.AppMD = (function () {

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inline(text) {
    let html = esc(text);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
      if (/^\w[\w+.-]*:/i.test(href) && !/^(https?:|mailto:|#)/i.test(href)) {
        return esc(label);
      }
      return `<a href="${esc(href)}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
    });
    return html;
  }

  function isDiagram(language, source) {
    return /^(mermaid|flowchart|puml|plantuml)$/i.test(language)
      || /^(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/i.test(source.trim())
      || /^@start(?:uml|mindmap|wbs|gantt|json|yaml)\b/i.test(source.trim());
  }

  function diagramType(language, source) {
    if (/^(puml|plantuml)$/i.test(language) || /^@start/i.test(source.trim())) return 'plantuml';
    return 'mermaid';
  }

  function parseTable(lines, start) {
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
    if (!rows.length) return null;
    const [head, ...body] = rows;
    return {
      html: `<table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead>`
        + `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      next: index
    };
  }

  function render(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
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
        const source = code.join('\n');
        if (isDiagram(language, source) && window.AppUI) {
          html.push(window.AppUI.embedDiagram(diagramType(language, source), source));
        } else {
          html.push(`<pre><code class="language-${esc(language)}">${esc(source)}</code></pre>`);
        }
        continue;
      }

      const table = parseTable(lines, index);
      if (table) {
        html.push(table.html);
        index = table.next;
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = Math.min(heading[1].length + 1, 4);
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
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
        html.push(`<blockquote>${quote.map((item) => inline(item)).join('<br>')}</blockquote>`);
        continue;
      }

      if (/^[-*+]\s+/.test(trimmed)) {
        const items = [];
        while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
          items.push(lines[index].trim().replace(/^[-*+]\s+/, ''));
          index += 1;
        }
        html.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
        continue;
      }

      if (/^\d+[.)]\s+/.test(trimmed)) {
        const items = [];
        while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
          items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''));
          index += 1;
        }
        html.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`);
        continue;
      }

      const paragraph = [];
      while (
        index < lines.length
        && lines[index].trim()
        && !/^(#{1,6})\s+/.test(lines[index].trim())
        && !/^[-*+]\s+/.test(lines[index].trim())
        && !/^\d+[.)]\s+/.test(lines[index].trim())
        && !lines[index].trim().startsWith('```')
        && !lines[index].trim().startsWith('>')
      ) {
        paragraph.push(lines[index].trim());
        index += 1;
      }
      if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }

    return html.join('\n');
  }

  return { render, esc, inline };
})();
