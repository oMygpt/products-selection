// Safe Markdown renderer with strict DOM-allowlist XSS sanitization (zero external CDN deps)

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div',
  'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'kbd', 'li', 'ol', 'p', 'picture', 'pre', 's', 'span', 'strong', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul', 'button'
]);

const DROP_WITH_CONTENT_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'textarea', 'select', 'template', 'noscript'
]);

const ALLOWED_ATTRS = {
  '*': new Set(['class', 'title', 'align', 'dir', 'lang']),
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  button: new Set(['data-copy-enc', 'type']),
  td: new Set(['colspan', 'rowspan', 'align']),
  th: new Set(['colspan', 'rowspan', 'align']),
  details: new Set(['open'])
};

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isSafeUrl(urlStr = '', { allowHash = true } = {}) {
  const trimmed = String(urlStr || '').trim();
  if (!trimmed) return false;
  if (allowHash && trimmed.startsWith('#')) return true;
  // Strip control chars and whitespace to prevent java\nscript: bypasses
  const normalized = trimmed.replace(/[\u0000-\u0020]+/g, '');
  if (/^https?:\/\//i.test(normalized)) return true;
  if (/^mailto:/i.test(normalized)) return true;
  return false;
}

export function resolveAssetUrl(src, rawBaseUrl, repoSlug, defaultBranch = 'main') {
  if (!src) return '';
  const trimmed = src.trim();
  if (/^(https?:|#)/i.test(trimmed)) {
    const blobImg = trimmed.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/i);
    if (blobImg && /\.(png|jpe?g|gif|svg|webp|bmp|ico)(\?.*)?$/i.test(blobImg[3])) {
      return `https://raw.githubusercontent.com/${blobImg[1]}/${blobImg[2]}/${blobImg[3]}`;
    }
    return trimmed;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '';
  const cleanRel = trimmed.replace(/^\.\//, '').replace(/^\//, '');
  if (rawBaseUrl) return `${rawBaseUrl}${cleanRel}`;
  if (repoSlug) return `https://raw.githubusercontent.com/${repoSlug}/${defaultBranch}/${cleanRel}`;
  return '';
}

export function resolveLinkUrl(href, repoSlug, defaultBranch = 'main') {
  if (!href) return '#';
  const trimmed = href.trim();
  if (isSafeUrl(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed.replace(/[\u0000-\u0020]+/g, ''))) return '#';
  if (repoSlug) {
    const cleanRel = trimmed.replace(/^\.\//, '').replace(/^\//, '');
    return `https://github.com/${repoSlug}/blob/${defaultBranch}/${cleanRel}`;
  }
  return '#';
}

function sanitizeNode(node, doc) {
  if (node.nodeType === 3) return; // Text node is always safe
  if (node.nodeType !== 1) {
    node.remove();
    return;
  }

  const tag = node.tagName.toLowerCase();
  if (DROP_WITH_CONTENT_TAGS.has(tag)) {
    node.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap disallowed container tags while keeping sanitized children
    const frag = doc.createDocumentFragment();
    while (node.firstChild) {
      const child = node.firstChild;
      frag.appendChild(child);
      sanitizeNode(child, doc);
    }
    node.replaceWith(frag);
    return;
  }

  // Filter attributes strictly by allowlist
  const globalAllowed = ALLOWED_ATTRS['*'];
  const tagAllowed = ALLOWED_ATTRS[tag] || new Set();
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
      node.removeAttribute(attr.name);
      continue;
    }
    if (!globalAllowed.has(name) && !tagAllowed.has(name)) {
      node.removeAttribute(attr.name);
      continue;
    }
    if (name === 'href') {
      if (!isSafeUrl(attr.value, { allowHash: true })) {
        node.removeAttribute('href');
      }
    } else if (name === 'src') {
      if (!isSafeUrl(attr.value, { allowHash: false })) {
        node.removeAttribute('src');
      }
    }
  }

  if (tag === 'a' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (tag === 'img') {
    node.setAttribute('loading', 'lazy');
  }

  for (const child of Array.from(node.childNodes)) {
    sanitizeNode(child, doc);
  }
}

export function sanitizeHtml(html) {
  if (!html) return '';
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return '';
    for (const child of Array.from(root.childNodes)) {
      sanitizeNode(child, doc);
    }
    return root.innerHTML;
  }
  // Strict fallback for non-DOM environments (Node tests): strip dangerous tags & event handlers
  return String(html)
    .replace(/<(script|style|iframe|object|embed|svg|form|math)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|form|input|meta|link|base)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*["']\s*(?:javascript|vbscript|data)\s*:[^"']*["']/gi, '$1="#"');
}

export function renderMarkdown(mdText, rawBaseUrl = '', repoSlug = '', defaultBranch = 'main') {
  if (!mdText) return '';
  let text = String(mdText).replace(/\r\n/g, '\n');

  const codeBlocks = [];
  text = text.replace(/```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const cleanCode = code.replace(/\n$/, '');
    const encoded = encodeURIComponent(cleanCode);
    codeBlocks.push(
      `<div class="md-code-block"><div class="md-code-bar"><span>${escapeHtml(lang || 'text')}</span><button type="button" class="copy-mini-btn" data-copy-enc="${encoded}">复制代码</button></div><pre><code>${escapeHtml(cleanCode)}</code></pre></div>`
    );
    return `\n\n@@CODEBLOCK_${idx}@@\n\n`;
  });

  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `@@INLINECODE_${idx}@@`;
  });

  // Resolve relative <img src="..."> before sanitization
  text = text.replace(/<img\b([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (_, before, src, after) => {
    const abs = resolveAssetUrl(src, rawBaseUrl, repoSlug, defaultBranch);
    if (!abs) return '';
    return `<img${before}src="${escapeHtml(abs)}" loading="lazy"${after}>`;
  });

  const htmlBlocks = [];
  text = text.replace(/<(div|p|table|details|picture|figure)\b[\s\S]*?<\/\1>/gi, (match) => {
    const idx = htmlBlocks.length;
    htmlBlocks.push(match);
    return `\n\n@@HTMLBLOCK_${idx}@@\n\n`;
  });

  function formatInline(str) {
    let s = str.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => {
      const abs = resolveAssetUrl(src, rawBaseUrl, repoSlug, defaultBranch);
      if (!abs) return '';
      return `<img src="${escapeHtml(abs)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
      const abs = resolveLinkUrl(href, repoSlug, defaultBranch);
      return `<a href="${escapeHtml(abs)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s;
  }

  const lines = text.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }

    if (/^@@CODEBLOCK_(\d+)@@$/.test(trimmed)) {
      out.push(codeBlocks[parseInt(trimmed.match(/\d+/)[0], 10)]);
      i++; continue;
    }
    if (/^@@HTMLBLOCK_(\d+)@@$/.test(trimmed)) {
      out.push(htmlBlocks[parseInt(trimmed.match(/\d+/)[0], 10)]);
      i++; continue;
    }
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      out.push('<hr />');
      i++; continue;
    }

    const hMatch = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (hMatch) {
      out.push(`<h${hMatch[1].length}>${formatInline(hMatch[2])}</h${hMatch[1].length}>`);
      i++; continue;
    }

    if (trimmed.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const parseRow = (rowStr) => rowStr.replace(/^\||\|$/g, '').split('|').map(c => formatInline(c.trim()));
      const headers = parseRow(trimmed);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().includes('|') && !lines[i].trim().startsWith('@@')) {
        rows.push(parseRow(lines[i].trim()));
        i++;
      }
      out.push(`<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    if (trimmed.startsWith('>')) {
      const bqLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        bqLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${bqLines.map(l => formatInline(l)).join('<br />')}</blockquote>`);
      continue;
    }

    if (/^([-*+]|\d+\.)\s+/.test(trimmed)) {
      const tag = /^\d+\.\s+/.test(trimmed) ? 'ol' : 'ul';
      const liItems = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        liItems.push(`<li>${formatInline(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<${tag}>${liItems.join('')}</${tag}>`);
      continue;
    }

    const pLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|@@CODEBLOCK_|@@HTMLBLOCK_|([-*_])\1{2,}$)/.test(lines[i].trim()) &&
      !(lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]))
    ) {
      pLines.push(lines[i].trim());
      i++;
    }
    if (pLines.length > 0) out.push(`<p>${formatInline(pLines.join(' '))}</p>`);
  }

  const rawHtml = out.join('\n').replace(/@@INLINECODE_(\d+)@@/g, (_, idx) => inlineCodes[parseInt(idx, 10)] || '');
  return sanitizeHtml(rawHtml);
}
