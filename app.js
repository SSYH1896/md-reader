const defaultFileName = "考试重点.md";

const fileName = document.getElementById("fileName");
const fileInput = document.getElementById("fileInput");
const printButton = document.getElementById("printButton");
const markdownBody = document.getElementById("markdownBody");
const emptyState = document.getElementById("emptyState");
const toc = document.getElementById("toc");

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const text = await file.text();
  renderDocument(text, file.name);
});

printButton.addEventListener("click", () => {
  window.print();
});

loadDefaultDocument();

async function loadDefaultDocument() {
  try {
    const response = await fetch(encodeURIComponent(defaultFileName));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    renderDocument(text, defaultFileName);
  } catch {
    fileName.textContent = "请打开一个 Markdown 文件";
    emptyState.hidden = false;
  }
}

function renderDocument(markdown, name) {
  usedIds.clear();
  markdownBody.innerHTML = parseMarkdown(markdown);
  fileName.textContent = name;
  emptyState.hidden = true;
  buildTableOfContents();
}

function parseMarkdown(markdown) {
  const lines = normalizeLineEndings(markdown).split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += index < lines.length ? 1 : 0;
      const language = fence[1] ? ` class="language-${escapeAttribute(fence[1])}"` : "";
      html.push(`<pre><code${language}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^ {0,3}---+\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const rawText = stripInlineMarkdown(heading[2].trim());
      const id = makeUniqueId(rawText);
      html.push(`<h${level} id="${id}">${parseInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines = [];
      tableLines.push(lines[index], lines[index + 1]);
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      html.push(parseTable(tableLines));
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${parseMarkdown(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    if (isListLine(line)) {
      const result = parseList(lines, index, getListIndent(line));
      html.push(result.html);
      index = result.nextIndex;
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && shouldContinueParagraph(lines[index], lines, index)) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${parseInline(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function shouldContinueParagraph(line, lines, index) {
  if (line.trim() === "") return false;
  if (/^```/.test(line)) return false;
  if (/^ {0,3}---+\s*$/.test(line)) return false;
  if (/^(#{1,6})\s+/.test(line)) return false;
  if (/^\s*>\s?/.test(line)) return false;
  if (isListLine(line)) return false;
  if (isTableStart(lines, index)) return false;
  return true;
}

function parseList(lines, startIndex, baseIndent) {
  const first = parseListLine(lines[startIndex]);
  const tag = first.ordered ? "ol" : "ul";
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const current = parseListLine(lines[index]);
    if (!current || current.indent < baseIndent) break;
    if (current.indent > baseIndent) break;
    if ((current.ordered ? "ol" : "ul") !== tag) break;

    const parts = [parseInline(current.content)];
    index += 1;

    while (index < lines.length) {
      if (lines[index].trim() === "") {
        index += 1;
        break;
      }

      const next = parseListLine(lines[index]);
      if (next && next.indent === baseIndent) break;
      if (next && next.indent < baseIndent) break;

      if (next && next.indent > baseIndent) {
        const child = parseList(lines, index, next.indent);
        parts.push(child.html);
        index = child.nextIndex;
        continue;
      }

      if (!next && getIndent(lines[index]) > baseIndent) {
        parts.push(`<p>${parseInline(lines[index].trim())}</p>`);
        index += 1;
        continue;
      }

      break;
    }

    items.push(`<li>${parts.join("")}</li>`);
  }

  return {
    html: `<${tag}>${items.join("")}</${tag}>`,
    nextIndex: index,
  };
}

function isListLine(line) {
  return Boolean(parseListLine(line));
}

function parseListLine(line) {
  const unordered = line.match(/^(\s*)([-*+])\s+(.+)$/);
  if (unordered) {
    return {
      indent: unordered[1].length,
      ordered: false,
      content: unordered[3],
    };
  }

  const ordered = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
  if (ordered) {
    return {
      indent: ordered[1].length,
      ordered: true,
      content: ordered[2],
    };
  }

  return null;
}

function getListIndent(line) {
  const listLine = parseListLine(line);
  return listLine ? listLine.indent : 0;
}

function getIndent(line) {
  const match = line.match(/^\s*/);
  return match ? match[0].length : 0;
}

function isTableStart(lines, index) {
  return isTableRow(lines[index]) && index + 1 < lines.length && isTableDivider(lines[index + 1]);
}

function isTableRow(line) {
  return Boolean(line) && line.includes("|") && line.trim().startsWith("|");
}

function isTableDivider(line) {
  return /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function parseTable(lines) {
  const header = splitTableRow(lines[0]);
  const alignments = splitTableRow(lines[1]).map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
    if (trimmed.endsWith(":")) return "right";
    return "left";
  });
  const rows = lines.slice(2).map(splitTableRow);

  const headerHtml = header
    .map((cell, column) => tableCell("th", cell, alignments[column]))
    .join("");
  const bodyHtml = rows
    .map((row) => `<tr>${row.map((cell, column) => tableCell("td", cell, alignments[column])).join("")}</tr>`)
    .join("");

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function splitTableRow(row) {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function tableCell(tag, content, alignment) {
  const style = alignment && alignment !== "left" ? ` style="text-align:${alignment}"` : "";
  return `<${tag}${style}>${parseInline(content)}</${tag}>`;
}

function parseInline(text) {
  const placeholders = [];
  let escaped = escapeHtml(text);

  escaped = escaped.replace(/`([^`]+)`/g, (_, code) => {
    const token = storePlaceholder(placeholders, `<code>${code}</code>`);
    return token;
  });

  escaped = escaped.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, alt, src, title) => {
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
    const token = storePlaceholder(
      placeholders,
      `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}"${titleAttribute}>`
    );
    return token;
  });

  escaped = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, label, href, title) => {
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
    const token = storePlaceholder(
      placeholders,
      `<a href="${escapeAttribute(href)}"${titleAttribute} target="_blank" rel="noreferrer">${label}</a>`
    );
    return token;
  });

  escaped = escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");

  return restorePlaceholders(escaped, placeholders);
}

function storePlaceholder(placeholders, html) {
  const token = `\uE000${placeholders.length}\uE001`;
  placeholders.push(html);
  return token;
}

function restorePlaceholders(text, placeholders) {
  return placeholders.reduce((value, html, index) => {
    return value.replace(`\uE000${index}\uE001`, html);
  }, text);
}

function stripInlineMarkdown(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "");
}

function buildTableOfContents() {
  const headings = Array.from(markdownBody.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  toc.innerHTML = "";

  if (!headings.length) {
    toc.innerHTML = '<span class="toc-link">无标题</span>';
    return;
  }

  for (const heading of headings) {
    const link = document.createElement("a");
    const level = Number(heading.tagName.slice(1));
    link.className = `toc-link level-${level}`;
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent;
    toc.appendChild(link);
  }
}

const usedIds = new Map();

function makeUniqueId(text) {
  const base =
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section";
  const count = usedIds.get(base) || 0;
  usedIds.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n?/g, "\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
