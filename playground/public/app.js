import { drawTrials, getTrialCandidates } from './trial-desk.js';

const GH_TOKEN_STORAGE_KEY = 'dpb_gh_token';
const USER_STATE_STORAGE_KEY = 'dpb_user_state';
const TRIAL_STORAGE_KEY = 'dpb_trial_choice';

const state = {
  isLocalServer: false,
  localCapabilities: { isLocalServer: false, isMac: false },
  ghToken: localStorage.getItem(GH_TOKEN_STORAGE_KEY) || '',
  ghUser: null,
  ghScopes: '',
  page: 'today',
  days: [],
  todayDate: '',
  todayData: null,
  archiveFallback: null,
  trialChoice: null,
  trialCandidates: [],
  trialSample: [],
  currentDate: null,
  currentDayData: null,
  staticAllCache: null,
  scope: 'daily', // 'daily' | 'all'
  selectedType: 'all',
  selectedForm: 'all',
  selectedStatus: null, // null | 'stack' | 'tried'
  viewMode: localStorage.getItem('dpb_view_mode') || 'gallery',
  searchQuery: '',
  allScopeProducts: [],
  displayedProducts: [],
  focusedIndex: -1,
  activeProduct: null,
  activeInspectInfo: null,
  wbTab: 'readme', // 'readme' | 'codespace' | 'web'
  previewMode: 'direct', // 'direct' | 'proxy'
  customPreviewUrl: null,
  repoCodespaces: [],
  repoMachines: [],
  csLoading: false,
  csError: '',
  csPollTimer: null,
  userState: { items: {} }
};

// DOM Elements
const appShellEl = document.getElementById('appShell');
const todayViewEl = document.getElementById('todayView');
const todayTitleEl = document.getElementById('todayTitle');
const todayDateEl = document.getElementById('todayDate');
const todayStatusEl = document.getElementById('todayStatus');
const todayContentEl = document.getElementById('todayContent');
const recordsViewEl = document.getElementById('recordsView');
const recordsContentEl = document.getElementById('recordsContent');
const workspaceEl = document.getElementById('workspace');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

const dateSelectEl = document.getElementById('dateSelect');
const dateMetaRowEl = document.getElementById('dateMetaRow');
const prevDayBtn = document.getElementById('prevDayBtn');
const nextDayBtn = document.getElementById('nextDayBtn');
const randomDayBtn = document.getElementById('randomDayBtn');
const rawBriefBtn = document.getElementById('rawBriefBtn');
const syncMuseBtn = document.getElementById('syncMuseBtn');

const ghKeyBtn = document.getElementById('ghKeyBtn');
const ghKeyDot = document.getElementById('ghKeyDot');
const ghKeyLabel = document.getElementById('ghKeyLabel');
const ghKeyDialog = document.getElementById('ghKeyDialog');
const closeGhKeyDialogBtn = document.getElementById('closeGhKeyDialogBtn');
const ghTokenInput = document.getElementById('ghTokenInput');
const saveGhTokenBtn = document.getElementById('saveGhTokenBtn');
const clearGhTokenBtn = document.getElementById('clearGhTokenBtn');
const ghAuthStatusMsg = document.getElementById('ghAuthStatusMsg');
const refreshAllCsBtn = document.getElementById('refreshAllCsBtn');
const userCodespacesListEl = document.getElementById('userCodespacesList');

const modeGalleryBtn = document.getElementById('modeGalleryBtn');
const modeMatrixBtn = document.getElementById('modeMatrixBtn');
const scopeDailyBtn = document.getElementById('scopeDailyBtn');
const scopeAllBtn = document.getElementById('scopeAllBtn');

const signalsListEl = document.getElementById('signalsList');
const stageDatelineEl = document.getElementById('stageDateline');
const stageTitleEl = document.getElementById('stageTitle');
const stageSubtitleEl = document.getElementById('stageSubtitle');
const dayFilterTabsEl = document.getElementById('dayFilterTabs');
const cardsGridEl = document.getElementById('cardsGrid');
const matrixContainerEl = document.getElementById('matrixContainer');
const matrixBodyEl = document.getElementById('matrixBody');

const stackCountBadgeEl = document.getElementById('stackCountBadge');
const triedCountBadgeEl = document.getElementById('triedCountBadge');
const statusFilterStackBtn = document.getElementById('statusFilterStackBtn');
const statusFilterTriedBtn = document.getElementById('statusFilterTriedBtn');
const focusedIndicatorEl = document.getElementById('focusedIndicator');

const globalSearchInput = document.getElementById('globalSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');

const tweaksToggleBtn = document.getElementById('tweaksToggleBtn');
const tweaksPanelEl = document.getElementById('tweaksPanel');
const tweaksCloseBtn = document.getElementById('tweaksCloseBtn');
const colWidthRange = document.getElementById('colWidthRange');

const wbResizerEl = document.getElementById('wbResizer');
const workbenchEl = document.getElementById('workbench');
const wbMetaStampsEl = document.getElementById('wbMetaStamps');
const wbTitleEl = document.getElementById('wbTitle');
const wbCloseBtn = document.getElementById('wbCloseBtn');
const wbOpenExternalBtn = document.getElementById('wbOpenExternalBtn');
const wbGithubRepoBtn = document.getElementById('wbGithubRepoBtn');
const wbGithub1sBtn = document.getElementById('wbGithub1sBtn');
const wbTriedBtn = document.getElementById('wbTriedBtn');
const wbStackBtn = document.getElementById('wbStackBtn');
const wbMemoToggleBtn = document.getElementById('wbMemoToggleBtn');
const wbMemoBarEl = document.getElementById('wbMemoBar');
const wbNoteInputEl = document.getElementById('wbNoteInput');

const wbInspectLoadingEl = document.getElementById('wbInspectLoading');
const wbCodespaceBannerEl = document.getElementById('wbCodespaceBanner');
const wbSummaryBoxEl = document.getElementById('wbSummaryBox');
const wbCommandsBoxEl = document.getElementById('wbCommandsBox');
const wbDocBodyEl = document.getElementById('wbDocBody');
const wbCodespaceContainerEl = document.getElementById('wbCodespaceContainer');

const wbPreviewUrlDisplayEl = document.getElementById('wbPreviewUrlDisplay');
const previewModePillsEl = document.getElementById('previewModePills');
const previewDirectBtn = document.getElementById('previewDirectBtn');
const previewProxyBtn = document.getElementById('previewProxyBtn');
const wbReloadIframeBtn = document.getElementById('wbReloadIframeBtn');
const wbIframeExtLinkEl = document.getElementById('wbIframeExtLink');
const wbPreviewNoticeEl = document.getElementById('wbPreviewNotice');
const wbIframeWrapEl = document.getElementById('wbIframeWrap');
const wbIframeEl = document.getElementById('wbIframe');

const rawDialogEl = document.getElementById('rawDialog');
const rawDialogTitleEl = document.getElementById('rawDialogTitle');
const rawBriefsContainerEl = document.getElementById('rawBriefsContainer');
const closeRawDialogBtn = document.getElementById('closeRawDialogBtn');

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 2400);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractDomain(urlStr = '') {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatIndex(idx) {
  return String(idx + 1).padStart(2, '0');
}

function decodeBase64Utf8(b64) {
  const clean = b64.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function extractQuickCommandsFromMd(readmeText, safeRepo = '') {
  const cmdMatches = [];
  const codeBlocks = [...readmeText.matchAll(/```(?:bash|sh|zsh|shell|console|cmd)?\r?\n([\s\S]*?)```/gi)];
  for (const block of codeBlocks) {
    const lines = block[1]
      .split(/\r?\n/)
      .map(l => l.trim().replace(/^\$\s+/, ''))
      .filter(l =>
        /^(npx |npm (i|install|exec|create)|pnpm |bunx |bun |uvx |uv |pip3? install|pipx |brew install|cargo install|go install|docker (run|compose)|curl .*\|.*sh|git clone |claude |codex )/i.test(l)
      );
    for (let l of lines) {
      if (safeRepo && /<repository[-_]url>|<repo[-_]url>/i.test(l)) {
        l = l.replace(/<repository[-_]url>|<repo[-_]url>/gi, `https://github.com/${safeRepo}.git`);
      }
      if (!cmdMatches.includes(l) && cmdMatches.length < 6) cmdMatches.push(l);
    }
  }
  return cmdMatches;
}

// ─────────────────────────────────────────────────────────────
// GITHUB API CLIENT (TOKEN AUTH + CODESPACES)
// ─────────────────────────────────────────────────────────────
async function ghFetch(path, options = {}) {
  if (!state.ghToken) throw new Error('尚未配置 GitHub Key');
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${state.ghToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  return res;
}

async function verifyAndSetGhToken(token, silent = false) {
  const clean = (token || '').trim();
  if (!clean) {
    state.ghToken = '';
    state.ghUser = null;
    state.ghScopes = '';
    localStorage.removeItem(GH_TOKEN_STORAGE_KEY);
    updateGhKeyUi();
    return false;
  }

  state.ghToken = clean;
  try {
    const res = await ghFetch('/user');
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP ${res.status}`);
    }
    const user = await res.json();
    state.ghUser = user;
    state.ghScopes = res.headers.get('x-oauth-scopes') || '';
    localStorage.setItem(GH_TOKEN_STORAGE_KEY, clean);
    updateGhKeyUi();
    if (!silent) {
      showToast(`已连接 GitHub 账号 @${user.login}`);
    }
    return true;
  } catch (e) {
    if (!silent) {
      ghAuthStatusMsg.className = 'gh-auth-status err';
      ghAuthStatusMsg.textContent = `验证失败：${e.message}`;
    }
    state.ghToken = '';
    state.ghUser = null;
    localStorage.removeItem(GH_TOKEN_STORAGE_KEY);
    updateGhKeyUi();
    return false;
  }
}

function updateGhKeyUi() {
  if (state.ghUser) {
    ghKeyDot.classList.add('connected');
    ghKeyLabel.textContent = `@${state.ghUser.login} · Codespaces`;
    ghTokenInput.value = state.ghToken;
    const scopeText = state.ghScopes ? ` · 权限: ${state.ghScopes}` : '';
    ghAuthStatusMsg.className = 'gh-auth-status ok';
    ghAuthStatusMsg.textContent = `已认证为 @${state.ghUser.login}${scopeText}`;
  } else {
    ghKeyDot.classList.remove('connected');
    ghKeyLabel.textContent = '配置 GitHub Key';
    ghTokenInput.value = '';
    ghAuthStatusMsg.className = 'gh-auth-status';
    ghAuthStatusMsg.textContent = '当前未配置 GitHub Key（点击上方按钮快速生成后粘贴即可使用 Codespaces）';
  }
}

async function loadAllUserCodespaces() {
  if (!state.ghToken) {
    userCodespacesListEl.innerHTML = '<p style="font-size:12.5px; color:var(--ink-muted);">请先在上方保存有效的 GitHub Key。</p>';
    return;
  }
  userCodespacesListEl.innerHTML = '<div class="wb-loading">正在读取你名下的 GitHub Codespaces 实例...</div>';
  try {
    const res = await ghFetch('/user/codespaces');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}（请确认 Token 已勾选 codespace 权限）`);
    }
    const data = await res.json();
    const list = data.codespaces || [];
    if (list.length === 0) {
      userCodespacesListEl.innerHTML = '<p style="font-size:12.5px; color:var(--ink-muted);">你名下当前没有运行或休眠中的 Codespaces 实例。</p>';
      return;
    }
    userCodespacesListEl.innerHTML = list.map(cs => {
      const stLower = (cs.state || '').toLowerCase();
      const badgeCls = stLower === 'available' ? 'available' : (stLower === 'shutdown' ? 'shutdown' : 'transitioning');
      return `
        <div class="cs-card" style="padding:10px 12px; gap:8px;">
          <div class="cs-card-head" style="padding-bottom:6px;">
            <div>
              <strong>${escapeHtml(cs.repository?.full_name || cs.name)}</strong>
              <span style="font-family:var(--font-mono); font-size:11px; color:var(--ink-muted); margin-left:6px;">${escapeHtml(cs.machine?.display_name || '')}</span>
            </div>
            <span class="cs-state-badge ${badgeCls}">${escapeHtml(cs.state)}</span>
          </div>
          <div class="cs-action-row">
            <a href="${escapeHtml(cs.web_url)}" target="_blank" rel="noopener" class="editorial-btn editorial-btn-ink editorial-btn-sm">🖥️ Web IDE</a>
            ${stLower === 'shutdown' ? `<button class="editorial-btn editorial-btn-sm" data-cs-action="start" data-cs-name="${escapeHtml(cs.name)}">▶ 启动</button>` : ''}
            ${stLower === 'available' ? `<button class="editorial-btn editorial-btn-sm" data-cs-action="stop" data-cs-name="${escapeHtml(cs.name)}">⏹ 停止</button>` : ''}
            <button class="editorial-btn editorial-btn-sm" data-cs-action="delete" data-cs-name="${escapeHtml(cs.name)}">🗑️ 删除</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    userCodespacesListEl.innerHTML = `<p class="gh-auth-status err">${escapeHtml(e.message)}</p>`;
  }
}

async function performCodespaceAction(action, csName, onAfter) {
  try {
    showToast(`正在执行 ${action} (${csName})...`);
    let res;
    if (action === 'start') {
      res = await ghFetch(`/user/codespaces/${encodeURIComponent(csName)}/start`, { method: 'POST' });
    } else if (action === 'stop') {
      res = await ghFetch(`/user/codespaces/${encodeURIComponent(csName)}/stop`, { method: 'POST' });
    } else if (action === 'delete') {
      res = await ghFetch(`/user/codespaces/${encodeURIComponent(csName)}`, { method: 'DELETE' });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    showToast(`操作 ${action} 成功`);
    if (onAfter) await onAfter();
  } catch (e) {
    showToast(`操作失败: ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// CLEAN MARKDOWN RENDERER FOR GITHUB README
// ─────────────────────────────────────────────────────────────
function resolveAssetUrl(src, rawBaseUrl, repoSlug, defaultBranch = 'main') {
  if (!src) return '';
  const trimmed = src.trim();
  if (/^(https?:|data:|#)/i.test(trimmed)) {
    const blobImg = trimmed.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/i);
    if (blobImg && /\.(png|jpe?g|gif|svg|webp|bmp|ico)(\?.*)?$/i.test(blobImg[3])) {
      return `https://raw.githubusercontent.com/${blobImg[1]}/${blobImg[2]}/${blobImg[3]}`;
    }
    return trimmed;
  }
  const cleanRel = trimmed.replace(/^\.\//, '').replace(/^\//, '');
  if (rawBaseUrl) return `${rawBaseUrl}${cleanRel}`;
  if (repoSlug) return `https://raw.githubusercontent.com/${repoSlug}/${defaultBranch}/${cleanRel}`;
  return trimmed;
}

function resolveLinkUrl(href, repoSlug, defaultBranch = 'main') {
  if (!href) return '#';
  const trimmed = href.trim();
  if (/^(https?:|mailto:|#)/i.test(trimmed)) return trimmed;
  if (repoSlug) {
    const cleanRel = trimmed.replace(/^\.\//, '').replace(/^\//, '');
    return `https://github.com/${repoSlug}/blob/${defaultBranch}/${cleanRel}`;
  }
  return trimmed;
}

function renderMarkdown(mdText, rawBaseUrl = '', repoSlug = '', defaultBranch = 'main') {
  if (!mdText) return '';
  let text = mdText.replace(/\r\n/g, '\n');

  const codeBlocks = [];
  text = text.replace(/```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const cleanCode = code.replace(/\n$/, '');
    const encoded = encodeURIComponent(cleanCode);
    codeBlocks.push(
      `<div class="md-code-block"><div class="md-code-bar"><span>${escapeHtml(lang || 'text')}</span><button class="copy-mini-btn" data-copy-enc="${encoded}">复制代码</button></div><pre><code>${escapeHtml(cleanCode)}</code></pre></div>`
    );
    return `\n\n@@CODEBLOCK_${idx}@@\n\n`;
  });

  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `@@INLINECODE_${idx}@@`;
  });

  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  text = text.replace(/<img\b([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (_, before, src, after) => {
    const abs = resolveAssetUrl(src, rawBaseUrl, repoSlug, defaultBranch);
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
      return `<img src="${escapeHtml(abs)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
      const abs = resolveLinkUrl(href, repoSlug, defaultBranch);
      return `<a href="${escapeHtml(abs)}" target="_blank" rel="noopener">${label}</a>`;
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

  return out.join('\n').replace(/@@INLINECODE_(\d+)@@/g, (_, idx) => inlineCodes[parseInt(idx, 10)] || '');
}

// ─────────────────────────────────────────────────────────────
// TWEAKS & VIEW MODE
// ─────────────────────────────────────────────────────────────
function restoreTweaks() {
  const savedTheme = localStorage.getItem('dpb_theme') || 'editorial';
  const savedFont = localStorage.getItem('dpb_font_v2') || 'sans';
  const savedCol = localStorage.getItem('dpb_col_width') || '340';
  const savedWbWidth = localStorage.getItem('dpb_wb_width');

  document.documentElement.setAttribute('data-theme', savedTheme);
  document.documentElement.setAttribute('data-font', savedFont);
  document.documentElement.style.setProperty('--card-col-min', `${savedCol}px`);
  if (savedWbWidth) document.documentElement.style.setProperty('--wb-width', savedWbWidth);
  colWidthRange.value = savedCol;

  document.querySelectorAll('#themeSwitchGroup .tweak-pill').forEach(b => b.classList.toggle('active', b.dataset.setTheme === savedTheme));
  document.querySelectorAll('#fontSwitchGroup .tweak-pill').forEach(b => b.classList.toggle('active', b.dataset.setFont === savedFont));
  updateViewModeUI();
}

function updateViewModeUI() {
  const isMatrix = state.viewMode === 'matrix';
  modeGalleryBtn.classList.toggle('active', !isMatrix);
  modeMatrixBtn.classList.toggle('active', isMatrix);
  cardsGridEl.classList.toggle('hidden', isMatrix);
  matrixContainerEl.classList.toggle('hidden', !isMatrix);
}

function updateStatusBadges() {
  const items = Object.values(state.userState.items || {});
  stackCountBadgeEl.textContent = items.filter(i => i.status === 'stack').length;
  triedCountBadgeEl.textContent = items.filter(i => i.status === 'tried' || i.status === 'stack').length;
}

function setPage(page) {
  if (state.page === page) return;
  closeWorkbench();
  tweaksPanelEl.classList.add('hidden');
  state.page = page;
  appShellEl.dataset.page = page;
  todayViewEl.classList.toggle('hidden', page !== 'today');
  recordsViewEl.classList.toggle('hidden', page !== 'records');
  document.querySelectorAll('.site-nav [data-page-link]').forEach(button => {
    if (button.dataset.pageLink === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('mainStage').scrollTop = 0;
  if (page === 'records') renderRecords();
}

function rememberTrial(product) {
  state.trialChoice = { date: product.date, key: product.key, name: product.name };
  localStorage.setItem(TRIAL_STORAGE_KEY, JSON.stringify(state.trialChoice));
  todayContentEl.querySelector('[data-resume-trial]')?.remove();
}

function renderToday() {
  const data = state.archiveFallback || state.todayData;
  const showingArchive = Boolean(state.archiveFallback);
  const [featured, ...alternatives] = state.trialSample;
  todayTitleEl.textContent = showingArchive ? '往期精选' : '今日试用';
  todayDateEl.dateTime = data?.date || state.todayDate;
  todayDateEl.textContent = todayDateEl.dateTime;
  if (todayStatusEl) {
    todayStatusEl.textContent = state.todayData ? '今日暂无可试用产品' : '今日简报待更新';
    todayStatusEl.classList.toggle('hidden', !showingArchive);
  }
  todayContentEl.setAttribute('aria-busy', 'false');

  const libraryLink = (date, label) => `<button class="desk-text-button" data-open-issue="${escapeHtml(date)}">${label}</button>`;
  const canResume = state.trialChoice?.key && state.trialChoice.name;
  const resume = canResume
    ? `<button class="${featured ? 'desk-text-button' : 'desk-primary'}" data-resume-trial>继续试用 · ${escapeHtml(state.trialChoice.name)}</button>`
    : '';

  if (!featured) {
    const message = data?.products.length ? '本期暂无带试用指引的产品' : '今天暂无可试用的产品';
    const fallback = data?.products.length
      ? libraryLink(data.date, '查看本期条目')
      : '<button class="desk-text-button" data-page-link="library">浏览产品库</button>';
    todayContentEl.innerHTML = `
      <div class="desk-empty">
        <h2>${message}</h2>
        <div class="desk-actions">${resume}${fallback}</div>
      </div>`;
    return;
  }

  const { product, task, mode, url } = featured;
  const canResumeOther = state.trialChoice?.date !== data.date || state.trialChoice?.key !== product.key;
  const trialKey = escapeHtml(product.key);
  const primary = url
    ? `<a class="desk-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener" data-start-trial="${trialKey}">${mode.action} <span aria-hidden="true">↗</span></a>`
    : `<button class="desk-primary" data-open-trial="${trialKey}">${mode.action} <span aria-hidden="true">→</span></button>`;
  todayContentEl.innerHTML = `
    <article class="desk-feature">
      <div class="desk-product">
        <div class="desk-product-mode">${mode.label}${product.pricingModel ? ` <span>·</span> ${escapeHtml(product.pricingModel)}` : ''}</div>
        <h2>${escapeHtml(product.name)}</h2>
        <p class="desk-product-deck">${escapeHtml(product.tagline || product.categoryLabel || '')}</p>
        <div class="desk-actions">
          ${primary}
          ${url ? `<button class="desk-text-button" data-open-trial="${trialKey}">试用指引</button>` : ''}
          ${canResumeOther ? resume : ''}
        </div>
        <p class="desk-requirement">${mode.requirement}</p>
      </div>
      <div class="desk-task">
        <h3>上手试什么</h3>
        <p>${escapeHtml(task).replace(/`([^`]+)`/g, '<code>$1</code>')}</p>
      </div>
    </article>
    <div class="desk-alternatives-heading">
      ${alternatives.length ? '<h2>其他选择</h2>' : '<span></span>'}
      <div class="desk-alternatives-actions">
        ${state.trialCandidates.length > 1 ? '<button class="desk-text-button" data-redraw-trials>换一组</button>' : ''}
        ${libraryLink(data.date, `查看本期全部 ${data.products.length} 条 <span aria-hidden="true">→</span>`)}
      </div>
    </div>
    ${alternatives.length ? `
      <ul class="desk-alternatives">
        ${alternatives.map(entry => `
          <li><button class="desk-alternative" data-choose-trial="${escapeHtml(entry.product.key)}">
            <span class="desk-alt-content">
              <span class="desk-alt-mode">${entry.mode.label}</span>
              <strong>${escapeHtml(entry.product.name)}</strong>
              <span class="desk-alt-deck">${escapeHtml(entry.product.tagline || '')}</span>
            </span>
            <span class="desk-alt-arrow" aria-hidden="true">→</span>
          </button></li>`).join('')}
      </ul>` : ''}
  `;
}

function renderRecords() {
  const entries = Object.entries(state.userState.items || {})
    .filter(([, entry]) => entry.status || entry.note)
    .sort(([, a], [, b]) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  recordsContentEl.innerHTML = entries.length ? `
    <ul class="desk-records">
      ${entries.map(([key, entry]) => `
        <li>
          <button class="desk-record" data-record-key="${escapeHtml(key)}">
            <strong>${escapeHtml(entry.name || key)}</strong>
            <span>${escapeHtml(entry.date || '')}${entry.status ? ` · ${entry.status === 'stack' ? '已收藏' : '已试过'}` : ''}</span>
          </button>
        </li>`).join('')}
    </ul>` : `
    <div class="desk-empty">
      <h2>还没有试用记录</h2>
      <p>标记已试或收藏后，产品会出现在这里。</p>
      <button class="desk-text-button" data-page-link="today">返回今日试用</button>
    </div>`;
}

async function readDay(date) {
  const res = await fetch(state.isLocalServer ? `/api/day/${date}` : `./data/day/${date}.json`);
  if (!res.ok) throw new Error(`Unable to load issue ${date}`);
  const data = await res.json();
  if (!Array.isArray(data.products)) throw new Error(`Invalid issue ${date}`);
  return data;
}

async function updateToday(data) {
  state.todayData = data?.date === state.todayDate ? data : null;
  let candidates = getTrialCandidates(state.todayData?.products || []);
  let fallback = null;
  if (!candidates.length) {
    for (const issue of state.days) {
      if (issue.date >= state.todayDate) continue;
      try {
        const previous = issue.date === data?.date ? data : await readDay(issue.date);
        const previousCandidates = getTrialCandidates(previous.products);
        if (previousCandidates.length) {
          fallback = previous;
          candidates = previousCandidates;
          break;
        }
      } catch {
        // The next available issue can still be used as a fallback.
      }
    }
  }
  state.archiveFallback = fallback;
  state.trialCandidates = candidates;
  state.trialSample = drawTrials(candidates, state.userState.items);
  renderToday();
}

async function openSavedProduct(key, entry) {
  if (!entry?.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    showToast('这条记录缺少可打开的刊期');
    return;
  }
  const page = state.page;
  try {
    const data = [state.todayData, state.currentDayData, state.archiveFallback]
      .find(issue => issue?.date === entry.date) || await readDay(entry.date);
    const product = data.products.find(item => item.key === key);
    if (state.page !== page) return;
    if (product) {
      openWorkbench(key, product);
      return;
    }
  } catch {
    // A dated product may have been removed from its original issue.
  }
  showToast('暂时无法打开这条历史产品');
}

function openIssue(date) {
  setPage('library');
  state.scope = 'daily';
  state.selectedType = 'all';
  state.selectedForm = 'all';
  state.selectedStatus = null;
  state.searchQuery = '';
  globalSearchInput.value = '';
  clearSearchBtn.classList.add('hidden');
  document.querySelectorAll('.strip-tab, .filter-chip').forEach(button =>
    button.classList.toggle('active', button.dataset.type === 'all' || button.dataset.form === 'all')
  );
  if (date === state.currentDate) applyFiltersAndRender();
  else loadDay(date);
}

// ─────────────────────────────────────────────────────────────
// DUAL-MODE DATA LOADING (LOCAL SERVER + STATIC GITHUB PAGES)
// ─────────────────────────────────────────────────────────────
function loadLocalStorageUserState() {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY) || 'null');
    return stored?.items && typeof stored.items === 'object' ? stored : { items: {} };
  } catch {
    return { items: {} };
  }
}

async function init() {
  restoreTweaks();
  bindEvents();
  state.todayDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  try {
    state.trialChoice = JSON.parse(localStorage.getItem(TRIAL_STORAGE_KEY) || 'null');
  } catch {
    // A malformed browser entry can be replaced at the next selection.
  }

  if (state.ghToken) {
    verifyAndSetGhToken(state.ghToken, true);
  } else {
    updateGhKeyUi();
  }

  let initPayload = null;
  try {
    const res = await fetch('/api/days');
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      initPayload = await res.json();
      state.isLocalServer = true;
      state.localCapabilities = initPayload.localCapabilities || { isLocalServer: true, isMac: false };
    }
  } catch {
    // static fallback
  }

  if (!initPayload) {
    state.isLocalServer = false;
    state.localCapabilities = { isLocalServer: false, isMac: false };
    const res = await fetch('./data/days.json');
    initPayload = await res.json();
    syncMuseBtn.classList.add('hidden');
    previewModePillsEl.classList.add('hidden');
  }

  state.days = initPayload.days || [];
  const lsState = loadLocalStorageUserState();
  state.userState = state.isLocalServer
    ? { items: { ...(lsState.items || {}), ...(initPayload.state?.items || {}) } }
    : lsState;
  updateStatusBadges();

  dateSelectEl.innerHTML = state.days.map((d, idx) => {
    const countTag = d.briefCount ? `${d.briefCount} 份汇总` : '当日简报';
    return `<option value="${d.date}">NO.${String(state.days.length - idx).padStart(2, '0')} · ${d.date} (${countTag})</option>`;
  }).join('');

  if (state.days.length > 0) {
    await loadDay(state.days[0].date);
  }
  await updateToday(state.currentDayData);
}

async function loadDay(date, autoOpenFirst = false) {
  dateSelectEl.value = date;
  let dayData;
  try {
    dayData = await readDay(date);
  } catch {
    if (dateSelectEl.value === date) dateSelectEl.value = state.currentDate || '';
    showToast('无法读取这一期，请稍后重试');
    return;
  }
  if (dateSelectEl.value !== date) return;

  state.currentDate = date;
  state.focusedIndex = -1;
  state.currentDayData = dayData;

  const ghCount = dayData.products.filter(p => p.deliveryForm === 'github' || p.githubRepo).length;
  const webCount = dayData.products.filter(p => p.deliveryForm === 'web').length;
  const enrichedCount = dayData.products.filter(p => p.enriched).length;

  dateMetaRowEl.innerHTML = `
    <span class="stamp stamp-neutral">汇总 ${dayData.products.length} 款</span>
    <span class="stamp stamp-delivery">开源 ${ghCount} · 网页 ${webCount}</span>
    ${enrichedCount > 0 ? `<span class="stamp stamp-type">已查验 ${enrichedCount}</span>` : ''}
  `;

  if (dayData.signals && dayData.signals.length > 0) {
    document.getElementById('signalsPanel').classList.remove('hidden');
    signalsListEl.innerHTML = dayData.signals.map((s, idx) => `
      <div class="signal-item">
        <span class="signal-title">${formatIndex(idx)}. ${escapeHtml(s.title)}</span>
        <div class="signal-detail">${escapeHtml(s.detail).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</div>
      </div>
    `).join('');
  } else {
    document.getElementById('signalsPanel').classList.add('hidden');
  }

  if (state.scope === 'daily') {
    applyFiltersAndRender();
    if (autoOpenFirst && state.displayedProducts.length > 0) {
      openWorkbench(state.displayedProducts[0].key);
    }
  }
}

async function fetchAllScopeProducts() {
  stageSubtitleEl.textContent = '正在检索全库历史产品...';
  if (state.isLocalServer) {
    const params = new URLSearchParams({ type: 'all', form: 'all', status: 'all', q: state.searchQuery, limit: '300' });
    const res = await fetch(`/api/explore?${params.toString()}`);
    const data = await res.json();
    state.allScopeProducts = data.items || [];
  } else {
    if (!state.staticAllCache) {
      const res = await fetch('./data/explore.json');
      const data = await res.json();
      state.staticAllCache = data.items || [];
    }
    state.allScopeProducts = state.staticAllCache;
  }
  applyFiltersAndRender();
}

function getSourcePool() {
  if (state.scope === 'all') return state.allScopeProducts;
  return state.currentDayData?.products || [];
}

function updateTypeCounts(pool) {
  const basePool = pool.filter(p => {
    const userEntry = state.userState.items?.[p.key] || {};
    const status = userEntry.status || p.userStatus || null;
    if (state.selectedStatus === 'stack' && status !== 'stack') return false;
    if (state.selectedStatus === 'tried' && status !== 'tried' && status !== 'stack') return false;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const hay = `${p.name} ${p.tagline || ''} ${p.introduction || ''} ${p.description || ''} ${p.categoryLabel || ''} ${p.githubRepo || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  document.getElementById('typeCountAll').textContent = basePool.length;
  document.getElementById('typeCountAgent').textContent = basePool.filter(p => p.categoryType === 'agent').length;
  document.getElementById('typeCountDevtools').textContent = basePool.filter(p => p.categoryType === 'devtools').length;
  document.getElementById('typeCountProductivity').textContent = basePool.filter(p => p.categoryType === 'productivity').length;
  document.getElementById('typeCountModels').textContent = basePool.filter(p => p.categoryType === 'models').length;
  document.getElementById('typeCountVertical').textContent = basePool.filter(p => p.categoryType === 'vertical').length;
  return basePool;
}

function applyFiltersAndRender() {
  const pool = getSourcePool();
  const basePool = updateTypeCounts(pool);

  const byType = state.selectedType === 'all'
    ? basePool
    : basePool.filter(p => p.categoryType === state.selectedType);

  document.getElementById('countFormAll').textContent = byType.length;
  document.getElementById('countFormGithub').textContent = byType.filter(p => p.deliveryForm === 'github' || p.githubRepo).length;
  document.getElementById('countFormWeb').textContent = byType.filter(p => p.deliveryForm === 'web').length;
  document.getElementById('countFormDesktop').textContent = byType.filter(p => p.deliveryForm === 'desktop').length;
  document.getElementById('countFormApi').textContent = byType.filter(p => p.deliveryForm === 'api').length;

  let finalItems = byType;
  if (state.selectedForm === 'github') finalItems = byType.filter(p => p.deliveryForm === 'github' || p.githubRepo);
  else if (state.selectedForm !== 'all') finalItems = byType.filter(p => p.deliveryForm === state.selectedForm);

  state.displayedProducts = finalItems;
  scopeDailyBtn.classList.toggle('active', state.scope === 'daily');
  scopeAllBtn.classList.toggle('active', state.scope === 'all');

  const typeNames = {
    all: '全部产品类型',
    agent: 'Agent 与自动化',
    devtools: '开发与基础设施',
    productivity: '效率与桌面工具',
    models: 'AI 模型与多模态',
    vertical: '垂直与行业应用'
  };

  if (state.scope === 'daily' && state.currentDayData) {
    const issueNum = state.days.length - state.days.findIndex(d => d.date === state.currentDayData.date);
    stageDatelineEl.textContent = `ISSUE NO.${String(issueNum).padStart(2, '0')} · ${state.currentDayData.date}`;
    stageTitleEl.textContent = state.selectedStatus
      ? `${state.selectedStatus === 'stack' ? '★ 收藏夹' : '✓ 已试过'} · ${typeNames[state.selectedType]}`
      : `${state.currentDayData.date} · ${typeNames[state.selectedType]}`;
    stageSubtitleEl.textContent = state.currentDayData.intro || '按产品类型与交付形态聚合，点击任意产品即可在右侧查看详细介绍、试玩指南或启动 Codespace 真机体验';
  } else {
    stageDatelineEl.textContent = `FULL ARCHIVE · 跨 ${state.days.length} 期全库`;
    stageTitleEl.textContent = state.searchQuery
      ? `检索「${state.searchQuery}」· ${typeNames[state.selectedType]}`
      : `全库分类浏览 · ${typeNames[state.selectedType]}`;
    stageSubtitleEl.textContent = `共筛选出 ${finalItems.length} 款产品，点击卡片即可在右侧查看体验指南、README 或启动 Codespace`;
  }

  renderProductsView(finalItems, state.scope === 'all');
}

function renderProductsView(products, showDateOnCard = false) {
  updateViewModeUI();
  renderGalleryCards(products, showDateOnCard);
  renderMatrixRows(products, showDateOnCard);
}

function renderGalleryCards(products, showDateOnCard = false) {
  if (!products || products.length === 0) {
    cardsGridEl.innerHTML = `<div class="wb-doc-section" style="grid-column: 1 / -1; text-align: center; padding: 36px;"><p style="color: var(--ink-muted); font-size: 13.5px;">当前分类或筛选条件下暂无产品，可切换上方类型或选择「跨 70+ 期全库」。</p></div>`;
    return;
  }

  cardsGridEl.innerHTML = products.map((p, idx) => {
    const userEntry = state.userState.items?.[p.key] || {};
    const status = userEntry.status || p.userStatus || null;
    const note = userEntry.note !== undefined ? userEntry.note : (p.userNote || '');
    const bestUrl = p.directUrl || p.url || `https://www.google.com/search?q=${encodeURIComponent(p.name)}`;
    const domain = p.githubRepo ? p.githubRepo : extractDomain(bestUrl);
    const isFocused = idx === state.focusedIndex;
    const summaryText = p.introduction || p.description || '';

    return `
      <article class="product-card ${state.activeProduct?.key === p.key ? 'active-card' : ''} ${isFocused ? 'kb-focused' : ''}" data-key="${escapeHtml(p.key)}" data-idx="${idx}" id="card-${escapeHtml(p.key)}">
        <div>
          <div class="card-index-row">
            <span class="card-index-num">#${formatIndex(idx)}</span>
            <div class="card-stamps">
              <span class="stamp stamp-type">${escapeHtml(p.categoryLabel || '垂直应用')}</span>
              <span class="stamp stamp-delivery">${escapeHtml(p.deliveryLabel || '在线网页')}</span>
              ${p.pricingModel ? `<span class="stamp stamp-pricing">${escapeHtml(p.pricingModel)}</span>` : ''}
              ${p.stars ? `<span class="stamp stamp-neutral">★ ${escapeHtml(p.stars)}</span>` : ''}
            </div>
          </div>

          <div class="card-title-block">
            <div class="card-title-line">
              <a href="${escapeHtml(bestUrl)}" target="_blank" rel="noopener" class="card-title" data-stop-card>${escapeHtml(p.name)}</a>
              <span class="card-domain-hint">${showDateOnCard ? `${escapeHtml(p.date)} · ` : ''}${escapeHtml(domain)}</span>
            </div>
            <div class="card-tagline" lang="zh">${escapeHtml(p.tagline || '')}</div>
          </div>

          ${summaryText ? `
            <div class="card-dossier" lang="zh">
              <div>${escapeHtml(summaryText)}</div>
            </div>
          ` : ''}

          ${note ? `<div class="card-memo-line">备注：${escapeHtml(note)}</div>` : ''}
        </div>

        <div class="card-footer">
          <div class="try-actions">
            <button class="editorial-btn editorial-btn-ink editorial-btn-sm open-wb-btn" data-key="${escapeHtml(p.key)}">${p.githubRepo ? '🚀 README / Codespace' : '查看体验指南 →'}</button>
            <a href="${escapeHtml(bestUrl)}" target="_blank" rel="noopener" class="editorial-btn editorial-btn-sm" data-stop-card>↗ 官网</a>
          </div>
          <div class="curation-actions">
            <button class="curate-btn ${status === 'tried' ? 'active-tried' : ''}" data-curate="tried" data-key="${escapeHtml(p.key)}">✓ 已试</button>
            <button class="curate-btn ${status === 'stack' ? 'active-stack' : ''}" data-curate="stack" data-key="${escapeHtml(p.key)}">★ 收藏</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderMatrixRows(products, showDate = false) {
  if (!products || products.length === 0) {
    matrixBodyEl.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px; color: var(--ink-muted);">暂无匹配条目</td></tr>`;
    return;
  }

  matrixBodyEl.innerHTML = products.map((p, idx) => {
    const userEntry = state.userState.items?.[p.key] || {};
    const status = userEntry.status || p.userStatus || null;
    const bestUrl = p.directUrl || p.url || `https://www.google.com/search?q=${encodeURIComponent(p.name)}`;
    const isFocused = idx === state.focusedIndex;

    return `
      <tr class="${state.activeProduct?.key === p.key ? 'active-row' : ''} ${isFocused ? 'kb-focused' : ''}" data-key="${escapeHtml(p.key)}" data-idx="${idx}" id="row-${escapeHtml(p.key)}">
        <td class="col-idx">${formatIndex(idx)}</td>
        <td>
          <span class="matrix-prod-name">${escapeHtml(p.name)}</span>
          ${showDate ? `<span class="stamp stamp-neutral" style="margin-right:4px;">${escapeHtml(p.date)}</span>` : ''}
          <span class="matrix-prod-tagline">${escapeHtml(p.tagline || '')}</span>
        </td>
        <td><span class="stamp stamp-type">${escapeHtml(p.categoryLabel || '垂直应用')}</span></td>
        <td>
          <span class="stamp stamp-delivery">${escapeHtml(p.deliveryLabel || '在线网页')}</span>
          ${p.pricingModel ? `<span class="stamp stamp-pricing">${escapeHtml(p.pricingModel)}</span>` : ''}
          ${p.githubRepo ? `<div style="font-family:var(--font-mono); font-size:10.5px; color:var(--ink-muted); margin-top:2px;">${escapeHtml(p.githubRepo)}</div>` : ''}
        </td>
        <td>
          <div class="curation-actions">
            <button class="curate-btn ${status === 'tried' ? 'active-tried' : ''}" data-curate="tried" data-key="${escapeHtml(p.key)}">✓</button>
            <button class="curate-btn ${status === 'stack' ? 'active-stack' : ''}" data-curate="stack" data-key="${escapeHtml(p.key)}">★</button>
          </div>
        </td>
        <td>
          <div class="try-actions">
            <button class="editorial-btn editorial-btn-ink editorial-btn-sm open-wb-btn" data-key="${escapeHtml(p.key)}">${p.githubRepo ? 'Codespace' : '体验'}</button>
            <a href="${escapeHtml(bestUrl)}" target="_blank" rel="noopener" class="editorial-btn editorial-btn-sm" data-stop-card>↗</a>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// CLIENT-SIDE INSPECT FALLBACK (FOR STATIC GITHUB PAGES)
// ─────────────────────────────────────────────────────────────
async function inspectProductClientSide(product) {
  const repo = product.githubRepo;
  const targetUrl = product.directUrl || product.url || '';
  const isWrapperUrl = targetUrl.includes('producthunt.com/') || targetUrl.includes('betalist.com/startups/');

  let githubDetails = null;
  let resolvedWebsite = !isWrapperUrl && targetUrl && !targetUrl.includes('github.com/') ? targetUrl : null;

  if (repo) {
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (state.ghToken) headers['Authorization'] = `Bearer ${state.ghToken}`;

    let meta = null;
    let readmeFull = '';
    let readmeHtmlUrl = `https://github.com/${repo}#readme`;

    try {
      const [metaRes, readmeRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}`, { headers }),
        fetch(`https://api.github.com/repos/${repo}/readme`, { headers })
      ]);
      if (metaRes.ok) {
        const d = await metaRes.json();
        meta = {
          full_name: d.full_name,
          description: d.description,
          stargazers_count: d.stargazers_count,
          language: d.language,
          license: d.license?.spdx_id || null,
          homepage: d.homepage,
          default_branch: d.default_branch,
          topics: d.topics || []
        };
        if (meta.homepage && /^https?:\/\//i.test(meta.homepage) && !resolvedWebsite) {
          resolvedWebsite = meta.homepage;
        }
      }
      if (readmeRes.ok) {
        const r = await readmeRes.json();
        if (r?.content && r.encoding === 'base64') {
          readmeFull = decodeBase64Utf8(r.content);
        }
        if (r?.html_url) readmeHtmlUrl = r.html_url;
      }
    } catch {
      // fallback to raw
    }

    if (!readmeFull) {
      for (const br of [meta?.default_branch, 'main', 'master'].filter(Boolean)) {
        try {
          const r = await fetch(`https://raw.githubusercontent.com/${repo}/${br}/README.md`);
          if (r.ok) {
            readmeFull = await r.text();
            break;
          }
        } catch { /* next */ }
      }
    }

    const defaultBranch = meta?.default_branch || 'main';
    githubDetails = {
      repo,
      meta,
      defaultBranch,
      rawBaseUrl: `https://raw.githubusercontent.com/${repo}/${defaultBranch}/`,
      readmeHtmlUrl,
      readmeFull,
      installCommands: readmeFull ? extractQuickCommandsFromMd(readmeFull, repo) : []
    };
  }

  return {
    targetUrl,
    resolvedWebsite,
    isWrapperUrl: isWrapperUrl && !resolvedWebsite,
    canEmbed: true,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    readableBlocks: [],
    github: githubDetails,
    installCommands: githubDetails?.installCommands || []
  };
}

// ─────────────────────────────────────────────────────────────
// CODESPACE RUNNER IN WORKBENCH
// ─────────────────────────────────────────────────────────────
function clearCsPoll() {
  if (state.csPollTimer) {
    clearTimeout(state.csPollTimer);
    state.csPollTimer = null;
  }
}

async function fetchRepoCodespacesAndMachines(repo) {
  clearCsPoll();
  if (!repo || !state.ghToken) return;
  state.csLoading = true;
  state.csError = '';
  renderCodespaceTab();

  try {
    const [csRes, machRes] = await Promise.all([
      ghFetch(`/repos/${repo}/codespaces`),
      ghFetch(`/repos/${repo}/codespaces/machines`)
    ]);
    if (!csRes.ok) {
      const err = await csRes.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${csRes.status}`);
    }
    const csData = await csRes.json();
    const machData = machRes.ok ? await machRes.json() : { machines: [] };
    state.repoCodespaces = csData.codespaces || [];
    state.repoMachines = machData.machines || [];
    state.csLoading = false;
    renderCodespaceBanner();
    renderCodespaceTab();

    // Auto-poll if any codespace is transitioning
    const activeTransition = state.repoCodespaces.some(cs =>
      !['Available', 'Shutdown', 'Unavailable', 'Failed'].includes(cs.state)
    );
    if (activeTransition && state.activeProduct?.githubRepo === repo) {
      state.csPollTimer = setTimeout(() => fetchRepoCodespacesAndMachines(repo), 3200);
    }
  } catch (e) {
    state.csLoading = false;
    state.csError = e.message;
    renderCodespaceTab();
  }
}

async function createRepoCodespace(repo, machineName) {
  const defaultBranch = state.activeInspectInfo?.github?.defaultBranch || 'main';
  state.csLoading = true;
  state.csError = '';
  renderCodespaceTab();

  try {
    const payload = { ref: defaultBranch };
    if (machineName) payload.machine = machineName;

    const res = await ghFetch(`/repos/${repo}/codespaces`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}（请确认你的 GitHub Key 勾选了 codespace 与 repo 权限）`);
    }
    const created = await res.json();
    showToast(`🚀 已发起创建 Codespace：${created.name}`);
    await fetchRepoCodespacesAndMachines(repo);
  } catch (e) {
    state.csLoading = false;
    state.csError = e.message;
    renderCodespaceTab();
  }
}

function renderCodespaceBanner() {
  const product = state.activeProduct;
  if (!product?.githubRepo || product.deliveryForm !== 'github') {
    wbCodespaceBannerEl.classList.add('hidden');
    wbCodespaceBannerEl.innerHTML = '';
    return;
  }
  const repo = product.githubRepo;
  const existing = state.repoCodespaces?.[0];
  const localBtnHtml = state.localCapabilities?.isMac
    ? `<button class="editorial-btn editorial-btn-sm" id="bannerLocalTermBtn">💻 本机 Terminal 克隆体验</button>`
    : '';

  wbCodespaceBannerEl.classList.remove('hidden');
  wbCodespaceBannerEl.innerHTML = `
    <div class="cs-banner-info">
      <div class="cs-banner-title">开源项目真机沙盒 · ${escapeHtml(repo)}</div>
      <div class="cs-banner-sub">
        ${existing
          ? `已有 Codespace 实例 (${escapeHtml(existing.name)} · 状态: ${escapeHtml(existing.state)})`
          : (state.ghToken ? '已配置 GitHub Key · 可在云端一键拉起真实容器并转发端口体验' : '配置 GitHub Key 即可在右侧一键拉起 Codespace 云端真机')
        }
      </div>
    </div>
    <div class="cs-banner-actions">
      <button class="editorial-btn editorial-btn-ink editorial-btn-sm" id="bannerGoCodespaceBtn">
        ${existing ? `🚀 打开 Codespace (${escapeHtml(existing.state)})` : '🚀 用 Codespace 启动真机体验'}
      </button>
      ${localBtnHtml}
    </div>
  `;

  document.getElementById('bannerGoCodespaceBtn')?.addEventListener('click', () => {
    switchWorkbenchTab('codespace');
  });
  document.getElementById('bannerLocalTermBtn')?.addEventListener('click', () => launchLocalTerminal(repo));
}

async function launchLocalTerminal(repo) {
  const cmd = state.activeInspectInfo?.installCommands?.[0] || '';
  try {
    const res = await fetch('/api/local-terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, command: cmd })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`已在 macOS Terminal.app 打开并克隆至 ${data.dir}`);
    } else {
      showToast(`启动本地终端失败: ${data.error}`);
    }
  } catch (e) {
    showToast(`启动本地终端失败: ${e.message}`);
  }
}

function renderCodespaceTab() {
  const product = state.activeProduct;
  if (!product) return;
  const repo = product.githubRepo;

  // Case 1: Product has no GitHub repo detected
  if (!repo) {
    wbCodespaceContainerEl.innerHTML = `
      <div class="cs-card">
        <div class="cs-card-head">
          <strong>当前条目未绑定 GitHub 开源仓库</strong>
        </div>
        <p class="gh-desc">该产品可能为 Web/SaaS 在线工具或闭源桌面端。你可以直接切换到「🌐 网页在线试玩」，或在下方手动输入它的 <code>owner/repo</code> 来启动 Codespace：</p>
        <div class="gh-token-form">
          <input type="text" id="manualRepoInput" class="gh-token-input" placeholder="例如：0nelight/sutra-os" />
          <button class="editorial-btn editorial-btn-ink" id="bindManualRepoBtn">绑定并拉取</button>
          <button class="editorial-btn" id="csSwitchToWebBtn">🌐 切换至网页试玩</button>
        </div>
      </div>
    `;
    document.getElementById('csSwitchToWebBtn')?.addEventListener('click', () => switchWorkbenchTab('web'));
    document.getElementById('bindManualRepoBtn')?.addEventListener('click', () => {
      const val = document.getElementById('manualRepoInput')?.value.trim();
      if (val && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(val)) {
        product.githubRepo = val;
        openWorkbench(product.key);
      } else {
        showToast('请输入合法的 owner/repo 格式');
      }
    });
    return;
  }

  const localTermBtn = state.localCapabilities?.isMac
    ? `<button class="editorial-btn" id="csLocalTermBtn">💻 本机 Terminal.app 克隆试跑</button>`
    : '';

  // Case 2: No GH_TOKEN configured
  if (!state.ghToken) {
    wbCodespaceContainerEl.innerHTML = `
      <div class="cs-card">
        <div class="cs-card-head">
          <strong>需要配置 GitHub Key 以在网页内控制 Codespaces</strong>
          <span class="cs-state-badge shutdown">未配置 Key</span>
        </div>
        <p class="gh-desc">
          输入带有 <code>codespace</code> + <code>repo</code> 权限的 GitHub Token 后，你可以直接在本工作台为 <strong>${escapeHtml(repo)}</strong> 一键创建云端虚拟机、启动服务并内嵌预览端口。
        </p>
        <div class="gh-token-actions-top">
          <a href="https://github.com/settings/tokens/new?description=Products-Selection-Codespaces&scopes=codespace,repo,read:user" target="_blank" rel="noopener" class="editorial-btn editorial-btn-ink">
            ↗ 一键前往 GitHub 生成 Token (自动勾选 codespace + repo)
          </a>
        </div>
        <div class="gh-token-form">
          <input type="password" id="inlineGhTokenInput" class="gh-token-input" placeholder="在此粘贴 GitHub Token (ghp_... / github_pat_...)" />
          <button class="editorial-btn editorial-btn-ink" id="inlineSaveGhTokenBtn">验证并启动</button>
        </div>
        <div style="border-top:1px dotted var(--rule); padding-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <span style="font-size:12px; color:var(--ink-muted);">或者直接免 Key 跳转：</span>
          <a href="https://codespaces.new/${escapeHtml(repo)}?quickstart=1" target="_blank" rel="noopener" class="editorial-btn">↗ 在 GitHub 新窗口创建 Codespace</a>
          ${localTermBtn}
        </div>
      </div>
    `;

    document.getElementById('inlineSaveGhTokenBtn')?.addEventListener('click', async () => {
      const val = document.getElementById('inlineGhTokenInput')?.value.trim();
      const ok = await verifyAndSetGhToken(val);
      if (ok) {
        fetchRepoCodespacesAndMachines(repo);
      } else {
        showToast('Token 验证失败，请检查是否复制完整');
      }
    });
    document.getElementById('csLocalTermBtn')?.addEventListener('click', () => launchLocalTerminal(repo));
    return;
  }

  // Case 3: GH_TOKEN configured
  const cmds = [];
  if (product.quickCommand) cmds.push(product.quickCommand);
  if (state.activeInspectInfo?.installCommands) {
    for (const c of state.activeInspectInfo.installCommands) {
      if (!cmds.includes(c)) cmds.push(c);
    }
  }

  const cs = state.repoCodespaces?.[0] || null;
  const defaultBranch = state.activeInspectInfo?.github?.defaultBranch || 'main';
  const machinesHtml = state.repoMachines.length > 0
    ? state.repoMachines.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.display_name)}</option>`).join('')
    : '<option value="">默认机器规格 (2-core / 8GB)</option>';

  let runnerCardHtml = '';
  if (state.csLoading && !cs) {
    runnerCardHtml = `<div class="wb-loading">正在查询 ${escapeHtml(repo)} 的 Codespace 实例与可用机器规格...</div>`;
  } else if (cs) {
    const stLower = (cs.state || '').toLowerCase();
    const badgeCls = stLower === 'available' ? 'available' : (stLower === 'shutdown' ? 'shutdown' : 'transitioning');
    runnerCardHtml = `
      <div class="cs-card">
        <div class="cs-card-head">
          <div>
            <strong>${escapeHtml(repo)}</strong>
            <span style="font-family:var(--font-mono); font-size:11px; color:var(--ink-muted); margin-left:8px;">${escapeHtml(cs.name)}</span>
          </div>
          <span class="cs-state-badge ${badgeCls}">${escapeHtml(cs.state)}${state.csLoading ? ' · 更新中...' : ''}</span>
        </div>

        <div class="cs-meta-grid">
          <span class="repo-stat-chip">机器: ${escapeHtml(cs.machine?.display_name || 'Standard')}</span>
          <span class="repo-stat-chip">分支: ${escapeHtml(cs.git_status?.ref || defaultBranch)}</span>
          ${cs.idle_timeout_minutes ? `<span class="repo-stat-chip">空闲休眠: ${cs.idle_timeout_minutes}m</span>` : ''}
        </div>

        <div class="cs-action-row">
          <a href="${escapeHtml(cs.web_url)}" target="_blank" rel="noopener" class="editorial-btn editorial-btn-ink">🖥️ 打开云端 VS Code 终端与编辑器 ↗</a>
          <a href="vscode://github.codespaces/connect?name=${encodeURIComponent(cs.name)}" class="editorial-btn">💻 本地 VS Code 连接</a>
          ${stLower === 'shutdown' ? `<button class="editorial-btn" id="csStartBtn">▶ 启动实例</button>` : ''}
          ${stLower === 'available' ? `<button class="editorial-btn" id="csStopBtn">⏹ 停止实例</button>` : ''}
          <button class="editorial-btn" id="csRefreshBtn">↻ 刷新状态</button>
          <button class="editorial-btn" id="csDeleteBtn" style="color:var(--accent);">🗑️ 销毁</button>
        </div>

        <div class="cs-port-bar">
          <span style="font-family:var(--font-mono); font-size:11px; color:var(--ink-muted);">端口直连预览 (Port Forward):</span>
          <input type="number" id="csPortInput" class="cs-port-input" value="${escapeHtml(String(product.defaultPort || 3000))}" min="1" max="65535" />
          <div style="display:flex; gap:4px;">
            <button class="curate-btn" data-port-preset="3000">3000</button>
            <button class="curate-btn" data-port-preset="5173">5173</button>
            <button class="curate-btn" data-port-preset="8000">8000</button>
            <button class="curate-btn" data-port-preset="8080">8080</button>
          </div>
          <button class="editorial-btn editorial-btn-ink editorial-btn-sm" id="csOpenPortInlineBtn">在右侧试玩窗口打开端口</button>
          <a href="https://${escapeHtml(cs.name)}-${escapeHtml(String(product.defaultPort || 3000))}.app.github.dev" target="_blank" rel="noopener" class="editorial-btn editorial-btn-sm" id="csOpenPortExtLink">↗ 新窗口打开</a>
        </div>
      </div>
    `;
  } else {
    runnerCardHtml = `
      <div class="cs-card">
        <div class="cs-card-head">
          <strong>为 ${escapeHtml(repo)} 创建真实 Codespace 云端容器</strong>
          <span class="cs-state-badge">就绪 (@${escapeHtml(state.ghUser?.login || 'GitHub')})</span>
        </div>
        <p class="gh-desc">
          将在你自己的 GitHub 账号下为 <code>${escapeHtml(repo)}</code>（分支 <code>${escapeHtml(defaultBranch)}</code>）启动隔离的云端 Linux 容器，不污染本地环境，随时可一键停止或销毁。
        </p>
        <div class="cs-action-row">
          <select id="csMachineSelect" class="cs-select">${machinesHtml}</select>
          <button class="editorial-btn editorial-btn-ink" id="csCreateBtn">🚀 立即创建并启动 Codespace</button>
          <a href="https://codespaces.new/${escapeHtml(repo)}?quickstart=1" target="_blank" rel="noopener" class="editorial-btn">↗ 官方页面创建</a>
          ${localTermBtn}
        </div>
      </div>
    `;
  }

  const errHtml = state.csError
    ? `<div class="wb-doc-section" style="border-left:3px solid var(--accent);"><div class="gh-auth-status err">Codespaces API 提示：${escapeHtml(state.csError)}</div><p style="font-size:12px; color:var(--ink-muted);">提示：若为权限问题，请确认 Token 勾选了 <code>codespace</code> 与 <code>repo</code>；也可直接使用 <a href="https://codespaces.new/${escapeHtml(repo)}?quickstart=1" target="_blank" rel="noopener">codespaces.new/${escapeHtml(repo)} ↗</a> 在官方页创建。</p></div>`
    : '';

  const cmdsHtml = cmds.length > 0 ? `
    <div class="wb-doc-section">
      <div class="wb-section-title">进入 Codespace 终端后，粘贴以下命令即可运行体验</div>
      <div class="cmd-list">
        ${cmds.map(cmd => `
          <div class="cmd-row">
            <code>$ ${escapeHtml(cmd)}</code>
            <button class="copy-mini-btn" data-copy-raw="${escapeHtml(cmd)}">复制</button>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  wbCodespaceContainerEl.innerHTML = `${errHtml}${runnerCardHtml}${cmdsHtml}`;

  // Bind dynamic events inside Codespace Tab
  document.getElementById('csCreateBtn')?.addEventListener('click', () => {
    const machine = document.getElementById('csMachineSelect')?.value || '';
    createRepoCodespace(repo, machine);
  });
  document.getElementById('csLocalTermBtn')?.addEventListener('click', () => launchLocalTerminal(repo));
  document.getElementById('csRefreshBtn')?.addEventListener('click', () => fetchRepoCodespacesAndMachines(repo));
  document.getElementById('csStartBtn')?.addEventListener('click', () => performCodespaceAction('start', cs.name, () => fetchRepoCodespacesAndMachines(repo)));
  document.getElementById('csStopBtn')?.addEventListener('click', () => performCodespaceAction('stop', cs.name, () => fetchRepoCodespacesAndMachines(repo)));
  document.getElementById('csDeleteBtn')?.addEventListener('click', () => performCodespaceAction('delete', cs.name, () => fetchRepoCodespacesAndMachines(repo)));

  const portInput = document.getElementById('csPortInput');
  const portExtLink = document.getElementById('csOpenPortExtLink');
  const syncPortUrl = () => {
    if (!cs || !portInput || !portExtLink) return '';
    const p = portInput.value.trim() || '3000';
    const url = `https://${cs.name}-${p}.app.github.dev`;
    portExtLink.href = url;
    return url;
  };

  portInput?.addEventListener('input', syncPortUrl);
  wbCodespaceContainerEl.querySelectorAll('[data-port-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (portInput) portInput.value = btn.dataset.portPreset;
      syncPortUrl();
    });
  });

  document.getElementById('csOpenPortInlineBtn')?.addEventListener('click', () => {
    const pUrl = syncPortUrl();
    if (!pUrl) return;
    state.customPreviewUrl = pUrl;
    state.previewMode = 'direct';
    switchWorkbenchTab('web');
  });
}

// ─────────────────────────────────────────────────────────────
// WORKBENCH TABS, DOCS & LIVE PREVIEW
// ─────────────────────────────────────────────────────────────
function switchWorkbenchTab(tabName) {
  state.wbTab = tabName;
  document.querySelectorAll('.wb-tab').forEach(t => t.classList.toggle('active', t.dataset.wbtab === tabName));
  document.getElementById('wbTabReadme').classList.toggle('hidden', tabName !== 'readme');
  document.getElementById('wbTabCodespace').classList.toggle('hidden', tabName !== 'codespace');
  document.getElementById('wbTabWeb').classList.toggle('hidden', tabName !== 'web');

  if (tabName === 'web') {
    loadWebPreviewIframe();
  } else if (tabName === 'codespace') {
    renderCodespaceTab();
    if (state.activeProduct?.githubRepo && state.ghToken && state.repoCodespaces.length === 0 && !state.csLoading) {
      fetchRepoCodespacesAndMachines(state.activeProduct.githubRepo);
    }
  }
}

function getEffectiveWebUrl(product, inspectInfo) {
  if (state.customPreviewUrl) return state.customPreviewUrl;
  if (inspectInfo?.resolvedWebsite) return inspectInfo.resolvedWebsite;
  if (product.directUrl) return product.directUrl;
  return product.url || '';
}

function loadWebPreviewIframe() {
  if (!state.activeProduct) return;
  const info = state.activeInspectInfo;
  const targetUrl = getEffectiveWebUrl(state.activeProduct, info);

  wbPreviewUrlDisplayEl.textContent = targetUrl || '无直接官网链接';
  wbIframeExtLinkEl.href = targetUrl || '#';

  previewDirectBtn.classList.toggle('active', state.previewMode === 'direct');
  previewProxyBtn.classList.toggle('active', state.previewMode === 'proxy');

  if (!state.customPreviewUrl && info?.isWrapperUrl && (!targetUrl || targetUrl.includes('producthunt.com/'))) {
    wbPreviewNoticeEl.classList.add('hidden');
    wbIframeEl.classList.add('hidden');
    let fallback = document.getElementById('wbWrapperFallback');
    if (!fallback) {
      fallback = document.createElement('div');
      fallback.id = 'wbWrapperFallback';
      fallback.className = 'wrapper-fallback-box';
      wbIframeWrapEl.appendChild(fallback);
    }
    fallback.classList.remove('hidden');
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(state.activeProduct.name + ' official website')}`;
    fallback.innerHTML = `
      <h4 style="font-size:15px;">该条目目前仅记录了 Product Hunt 介绍页</h4>
      <p style="font-size:13px; color:var(--ink-muted); max-width:420px;">Product Hunt 页面受 Cloudflare 保护，无法直接在页面内嵌显示。</p>
      <div style="display:flex; gap:10px; margin-top:6px;">
        <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener" class="editorial-btn editorial-btn-ink">↗ 新窗口打开 Product Hunt 页</a>
        <a href="${escapeHtml(searchUrl)}" target="_blank" rel="noopener" class="editorial-btn">↗ 搜索产品直达官网</a>
      </div>
    `;
    return;
  }

  const oldFallback = document.getElementById('wbWrapperFallback');
  if (oldFallback) oldFallback.classList.add('hidden');
  wbIframeEl.classList.remove('hidden');

  if (!targetUrl || !targetUrl.startsWith('http')) {
    wbIframeEl.src = 'about:blank';
    return;
  }

  if (state.previewMode === 'proxy' && state.isLocalServer) {
    wbPreviewNoticeEl.textContent = info && info.canEmbed === false
      ? '目标站点设置了防嵌套保护 (X-Frame-Options/CSP)，已自动切换至本地代理模式加载。'
      : '当前正通过本地代理模式加载目标站点。';
    wbPreviewNoticeEl.classList.remove('hidden');
    wbIframeEl.src = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  } else {
    if (!state.isLocalServer && targetUrl.includes('github.com/')) {
      wbPreviewNoticeEl.textContent = '提示：GitHub 官网限制浏览器直接内嵌，请切换至「🚀 Codespace 真机体验」或「📖 README」模式。';
      wbPreviewNoticeEl.classList.remove('hidden');
    } else {
      wbPreviewNoticeEl.classList.add('hidden');
    }
    wbIframeEl.src = targetUrl;
  }
}

function renderWorkbenchSummary(product, inspectInfo) {
  const meta = inspectInfo?.github?.meta;
  const starsVal = meta?.stargazers_count != null ? meta.stargazers_count.toLocaleString() : product.stars;
  const licenseVal = meta?.license || product.license;
  const langVal = meta?.language;
  const topics = meta?.topics || [];
  const introText = product.introduction || product.description || meta?.description || '';
  const guideSteps = Array.isArray(product.experienceGuide) ? product.experienceGuide : [];

  wbSummaryBoxEl.innerHTML = `
    ${guideSteps.length > 0 ? `
      <div class="experience-guide-box">
        <div class="experience-guide-title">上手体验指引</div>
        <ol class="experience-guide-list">
          ${guideSteps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
        </ol>
      </div>
    ` : ''}
    <div class="wb-section-title">产品介绍</div>
    <div style="font-family:var(--font-reading); font-size:14.5px; font-weight:600; color:var(--ink);">
      ${escapeHtml(product.tagline || meta?.description || '')}
    </div>
    ${introText ? `<div style="font-family:var(--font-reading); font-size:13px; color:var(--ink-body); line-height:1.7;">${escapeHtml(introText)}</div>` : ''}
    ${(starsVal || licenseVal || langVal || product.pricingModel || topics.length > 0) ? `
      <div class="repo-stats-bar">
        ${product.pricingModel ? `<span class="repo-stat-chip">${escapeHtml(product.pricingModel)}</span>` : ''}
        ${starsVal ? `<span class="repo-stat-chip">★ ${escapeHtml(String(starsVal))}</span>` : ''}
        ${langVal ? `<span class="repo-stat-chip">${escapeHtml(langVal)}</span>` : ''}
        ${licenseVal ? `<span class="repo-stat-chip">${escapeHtml(licenseVal)}</span>` : ''}
        ${topics.slice(0, 4).map(t => `<span class="repo-stat-chip">#${escapeHtml(t)}</span>`).join('')}
      </div>
    ` : ''}
  `;
}

function renderWorkbenchCommands(product, inspectInfo) {
  const cmds = [];
  if (product.quickCommand) cmds.push(product.quickCommand);
  if (inspectInfo?.installCommands) {
    for (const c of inspectInfo.installCommands) {
      if (!cmds.includes(c)) cmds.push(c);
    }
  }
  if (cmds.length === 0) {
    wbCommandsBoxEl.classList.add('hidden');
    wbCommandsBoxEl.innerHTML = '';
    return;
  }
  wbCommandsBoxEl.classList.remove('hidden');
  wbCommandsBoxEl.innerHTML = `
    <div class="wb-section-title">快速安装 / 运行指令</div>
    <div class="cmd-list">
      ${cmds.map(cmd => `
        <div class="cmd-row">
          <code>$ ${escapeHtml(cmd)}</code>
          <button class="copy-mini-btn" data-copy-raw="${escapeHtml(cmd)}">复制</button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderWorkbenchDocBody(product, inspectInfo) {
  const gh = inspectInfo?.github;
  if (gh && gh.readmeFull) {
    const renderedHtml = renderMarkdown(gh.readmeFull, gh.rawBaseUrl, gh.repo, gh.defaultBranch);
    wbDocBodyEl.innerHTML = `
      <div class="readme-header-bar">
        <span class="readme-header-label">README.md · ${escapeHtml(gh.repo)}</span>
        <a href="${escapeHtml(gh.readmeHtmlUrl)}" target="_blank" rel="noopener" class="editorial-btn editorial-btn-sm">↗ 在 GitHub 查看原文</a>
      </div>
      <div class="markdown-body">${renderedHtml}</div>
    `;
    return;
  }

  const hasWebInfo = inspectInfo && (inspectInfo.ogImage || inspectInfo.ogDescription || (inspectInfo.readableBlocks && inspectInfo.readableBlocks.length > 0));
  if (hasWebInfo) {
    wbDocBodyEl.innerHTML = `
      <div class="readme-header-bar">
        <span class="readme-header-label">官网内容速览 · ${escapeHtml(extractDomain(inspectInfo.resolvedWebsite || product.url))}</span>
        <button class="editorial-btn editorial-btn-ink editorial-btn-sm" id="switchToWebFromDocBtn">🌐 切换至网页在线试玩 →</button>
      </div>
      <div class="web-overview-card">
        ${inspectInfo.ogImage ? `<img src="${escapeHtml(inspectInfo.ogImage)}" alt="${escapeHtml(product.name)}" class="web-og-img" />` : ''}
        ${inspectInfo.ogTitle ? `<h3 style="font-size:17px;">${escapeHtml(inspectInfo.ogTitle)}</h3>` : ''}
        ${inspectInfo.ogDescription ? `<p style="font-size:13.5px; color:var(--ink-body);">${escapeHtml(inspectInfo.ogDescription)}</p>` : ''}
        ${inspectInfo.readableBlocks?.length ? `
          <div class="web-readable-blocks">
            ${inspectInfo.readableBlocks.map(b => {
              if (b.tag === 'h1' || b.tag === 'h2') return `<h3>${escapeHtml(b.text)}</h3>`;
              if (b.tag === 'h3') return `<strong>${escapeHtml(b.text)}</strong>`;
              return `<p>${escapeHtml(b.text)}</p>`;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `;
    document.getElementById('switchToWebFromDocBtn')?.addEventListener('click', () => switchWorkbenchTab('web'));
    return;
  }

  const bestUrl = getEffectiveWebUrl(product, inspectInfo);
  wbDocBodyEl.innerHTML = `
    <div class="wb-doc-section" style="text-align:center; padding: 28px;">
      <p style="font-size:13.5px; color:var(--ink-body); margin-bottom:12px;">
        该项目暂无公开的 GitHub README，可直接切换到「🌐 网页在线试玩」或在新窗口打开官网体验。
      </p>
      <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
        <button class="editorial-btn editorial-btn-ink" id="fallbackToWebBtn">🌐 在右侧网页试玩</button>
        ${bestUrl ? `<a href="${escapeHtml(bestUrl)}" target="_blank" rel="noopener" class="editorial-btn">↗ 新窗口打开</a>` : ''}
      </div>
    </div>
  `;
  document.getElementById('fallbackToWebBtn')?.addEventListener('click', () => switchWorkbenchTab('web'));
}

async function openWorkbench(productKey, selectedProduct = null) {
  const idx = state.displayedProducts.findIndex(p => p.key === productKey);
  if (idx !== -1) state.focusedIndex = idx;

  const product = selectedProduct || state.displayedProducts[idx] || state.currentDayData?.products.find(p => p.key === productKey);
  if (!product) return;

  if (!state.activeProduct) state.workbenchTrigger = document.activeElement;
  clearCsPoll();
  state.activeProduct = product;
  state.activeInspectInfo = null;
  state.customPreviewUrl = null;
  state.repoCodespaces = [];
  state.repoMachines = [];
  state.csError = '';

  document.querySelectorAll('.product-card').forEach(el => el.classList.toggle('active-card', el.dataset.key === product.key));
  document.querySelectorAll('.intel-matrix tbody tr').forEach(el => el.classList.toggle('active-row', el.dataset.key === product.key));

  workbenchEl.classList.remove('hidden');
  wbResizerEl.classList.remove('hidden');
  workspaceEl.classList.add('with-workbench');
  workspaceEl.classList.remove('sidebar-drawer-open');
  sidebarToggleBtn.classList.remove('active');
  switchWorkbenchTab('readme');
  wbCloseBtn.focus({ preventScroll: true });

  wbMetaStampsEl.innerHTML = `
    <span class="stamp stamp-type">${escapeHtml(product.categoryLabel || '垂直应用')}</span>
    <span class="stamp stamp-delivery">${escapeHtml(product.deliveryLabel || '在线网页')}</span>
    ${product.pricingModel ? `<span class="stamp stamp-pricing">${escapeHtml(product.pricingModel)}</span>` : ''}
  `;
  wbTitleEl.textContent = product.name;

  const bestUrl = product.directUrl || product.url || `https://www.google.com/search?q=${encodeURIComponent(product.name)}`;
  wbOpenExternalBtn.href = bestUrl;

  if (product.githubRepo) {
    wbGithubRepoBtn.href = `https://github.com/${product.githubRepo}`;
    wbGithubRepoBtn.classList.remove('hidden');
    wbGithub1sBtn.href = `https://github1s.com/${product.githubRepo}`;
    wbGithub1sBtn.classList.remove('hidden');
  } else {
    wbGithubRepoBtn.classList.add('hidden');
    wbGithub1sBtn.classList.add('hidden');
  }

  const userEntry = state.userState.items?.[product.key] || {};
  const status = userEntry.status || product.userStatus || null;
  const note = userEntry.note !== undefined ? userEntry.note : (product.userNote || '');
  wbTriedBtn.classList.toggle('active-tried', status === 'tried');
  wbStackBtn.classList.toggle('active-stack', status === 'stack');
  wbNoteInputEl.value = note;
  setMemoOpen(false);

  renderCodespaceBanner();
  renderWorkbenchSummary(product, null);
  renderWorkbenchCommands(product, null);
  wbDocBodyEl.innerHTML = '';
  wbInspectLoadingEl.classList.remove('hidden');

  try {
    let info;
    if (state.isLocalServer) {
      const params = new URLSearchParams({
        url: product.directUrl || product.url || '',
        repo: product.githubRepo || '',
        name: product.name || ''
      });
      const headers = {};
      if (state.ghToken) headers['X-GitHub-Token'] = state.ghToken;
      const res = await fetch(`/api/inspect?${params.toString()}`, { headers });
      info = await res.json();
    } else {
      info = await inspectProductClientSide(product);
    }

    if (state.activeProduct !== product) return;
    state.activeInspectInfo = info;
    wbInspectLoadingEl.classList.add('hidden');

    if (info.github?.repo) {
      product.githubRepo = info.github.repo;
      wbGithubRepoBtn.href = `https://github.com/${info.github.repo}`;
      wbGithubRepoBtn.classList.remove('hidden');
      wbGithub1sBtn.href = `https://github1s.com/${info.github.repo}`;
      wbGithub1sBtn.classList.remove('hidden');
    }
    if (info.resolvedWebsite) wbOpenExternalBtn.href = info.resolvedWebsite;

    state.previewMode = info.canEmbed === false && state.isLocalServer ? 'proxy' : 'direct';

    renderCodespaceBanner();
    renderWorkbenchSummary(product, info);
    renderWorkbenchCommands(product, info);
    renderWorkbenchDocBody(product, info);

    if (product.githubRepo && state.ghToken) {
      fetchRepoCodespacesAndMachines(product.githubRepo);
    }
    if (state.wbTab === 'codespace') renderCodespaceTab();
    if (state.wbTab === 'web') loadWebPreviewIframe();
  } catch {
    if (state.activeProduct !== product) return;
    wbInspectLoadingEl.classList.add('hidden');
    renderWorkbenchDocBody(product, null);
  }
}

function closeWorkbench() {
  if (workbenchEl.classList.contains('hidden')) return;
  clearCsPoll();
  workbenchEl.classList.add('hidden');
  wbResizerEl.classList.add('hidden');
  workspaceEl.classList.remove('with-workbench');
  workspaceEl.classList.remove('sidebar-drawer-open');
  wbIframeEl.src = 'about:blank';
  state.activeProduct = null;
  state.workbenchTrigger?.focus({ preventScroll: true });
  state.workbenchTrigger = null;
  document.querySelectorAll('.product-card').forEach(el => el.classList.remove('active-card'));
  document.querySelectorAll('.intel-matrix tbody tr').forEach(el => el.classList.remove('active-row'));
}

function setMemoOpen(open) {
  wbMemoBarEl.classList.toggle('hidden', !open);
  wbMemoToggleBtn.setAttribute('aria-expanded', String(open));
}

// ─────────────────────────────────────────────────────────────
// USER STATE SAVE (TRIED / STACK / 1-LINE MEMO)
// ─────────────────────────────────────────────────────────────
async function saveProductState(productKey, newStatus, newNote) {
  const product =
    (state.activeProduct?.key === productKey ? state.activeProduct : null) ||
    state.displayedProducts.find(p => p.key === productKey) ||
    state.currentDayData?.products.find(p => p.key === productKey);

  const prevEntry = state.userState.items?.[productKey] || {};
  const finalStatus = newStatus !== undefined
    ? (prevEntry.status === newStatus && newNote === undefined ? null : newStatus)
    : prevEntry.status;
  const finalNote = newNote !== undefined ? newNote : (prevEntry.note || '');

  state.userState.items = state.userState.items || {};
  state.userState.items[productKey] = {
    status: finalStatus,
    note: finalNote,
    name: product?.name || productKey,
    date: product?.date || state.currentDate,
    url: product?.directUrl || product?.url || '',
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(state.userState));

  if (state.isLocalServer) {
    try {
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: productKey,
          status: finalStatus,
          note: finalNote,
          name: product?.name || productKey,
          date: product?.date || state.currentDate,
          url: product?.directUrl || product?.url || ''
        })
      });
      const data = await res.json();
      if (data.ok) state.userState = data.state;
    } catch {
      // keep localStorage state
    }
  }

  updateStatusBadges();
  renderProductsView(state.displayedProducts, state.scope === 'all');
  if (state.page === 'records') renderRecords();
  if (state.activeProduct?.key === productKey) {
    wbTriedBtn.classList.toggle('active-tried', finalStatus === 'tried');
    wbStackBtn.classList.toggle('active-stack', finalStatus === 'stack');
  }
  if (newStatus === 'tried') showToast(finalStatus === 'tried' ? '✓ 已标记为已试过' : '已取消标记');
  else if (newStatus === 'stack') showToast(finalStatus === 'stack' ? '★ 已加入收藏夹' : '已移出收藏夹');
  else if (newNote !== undefined) showToast('备注已保存');
}

// ─────────────────────────────────────────────────────────────
// KEYBOARD FLOW, RESIZER & EVENT BINDINGS
// ─────────────────────────────────────────────────────────────
function moveKeyboardFocus(delta) {
  const list = state.displayedProducts;
  if (!list || list.length === 0) return;
  if (state.focusedIndex === -1) state.focusedIndex = 0;
  else state.focusedIndex = Math.max(0, Math.min(list.length - 1, state.focusedIndex + delta));

  const target = list[state.focusedIndex];
  if (!target) return;
  focusedIndicatorEl.textContent = `[${formatIndex(state.focusedIndex)}/${formatIndex(list.length - 1)}] ${target.name}`;

  document.querySelectorAll('.product-card').forEach((el, i) => el.classList.toggle('kb-focused', i === state.focusedIndex));
  document.querySelectorAll('.intel-matrix tbody tr').forEach((el, i) => el.classList.toggle('kb-focused', i === state.focusedIndex));

  const domId = state.viewMode === 'matrix' ? `row-${target.key}` : `card-${target.key}`;
  document.getElementById(domId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function initResizer() {
  let isDragging = false;
  wbResizerEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    wbResizerEl.classList.add('dragging');
    wbIframeEl.style.pointerEvents = 'none';
    document.body.style.cursor = 'col-resize';
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const totalW = window.innerWidth;
    const desiredWbW = Math.max(420, Math.min(totalW * 0.75, totalW - e.clientX));
    const widthStr = `${Math.round(desiredWbW)}px`;
    document.documentElement.style.setProperty('--wb-width', widthStr);
    localStorage.setItem('dpb_wb_width', widthStr);
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    wbResizerEl.classList.remove('dragging');
    wbIframeEl.style.pointerEvents = '';
    document.body.style.cursor = '';
  });
}

function bindEvents() {
  initResizer();

  // GitHub Key Dialog
  ghKeyBtn.addEventListener('click', () => {
    ghKeyDialog.showModal();
    if (state.ghToken) loadAllUserCodespaces();
  });
  closeGhKeyDialogBtn.addEventListener('click', () => ghKeyDialog.close());
  ghKeyDialog.addEventListener('click', (e) => {
    if (e.target === ghKeyDialog) ghKeyDialog.close();
  });

  saveGhTokenBtn.addEventListener('click', async () => {
    const ok = await verifyAndSetGhToken(ghTokenInput.value);
    if (ok) {
      loadAllUserCodespaces();
      if (state.activeProduct?.githubRepo) {
        fetchRepoCodespacesAndMachines(state.activeProduct.githubRepo);
      }
    }
  });
  clearGhTokenBtn.addEventListener('click', () => {
    verifyAndSetGhToken('', true);
    userCodespacesListEl.innerHTML = '<p style="font-size:12.5px; color:var(--ink-muted);">已清除本地 GitHub Key。</p>';
    renderCodespaceBanner();
    if (state.wbTab === 'codespace') renderCodespaceTab();
    showToast('已清除 GitHub Key');
  });
  refreshAllCsBtn.addEventListener('click', () => loadAllUserCodespaces());

  userCodespacesListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cs-action]');
    if (!btn) return;
    performCodespaceAction(btn.dataset.csAction, btn.dataset.csName, loadAllUserCodespaces);
  });

  // Sidebar drawer toggle
  sidebarToggleBtn.addEventListener('click', () => {
    if (workspaceEl.classList.contains('with-workbench')) {
      const open = workspaceEl.classList.toggle('sidebar-drawer-open');
      sidebarToggleBtn.classList.toggle('active', open);
    } else {
      const collapsed = workspaceEl.classList.toggle('sidebar-collapsed');
      sidebarToggleBtn.classList.toggle('active', !collapsed);
    }
  });
  sidebarCloseBtn.addEventListener('click', () => {
    if (workspaceEl.classList.contains('with-workbench')) {
      workspaceEl.classList.remove('sidebar-drawer-open');
      sidebarToggleBtn.classList.remove('active');
    } else {
      workspaceEl.classList.add('sidebar-collapsed');
      sidebarToggleBtn.classList.remove('active');
    }
  });

  modeGalleryBtn.addEventListener('click', () => {
    state.viewMode = 'gallery';
    localStorage.setItem('dpb_view_mode', 'gallery');
    updateViewModeUI();
  });
  modeMatrixBtn.addEventListener('click', () => {
    state.viewMode = 'matrix';
    localStorage.setItem('dpb_view_mode', 'matrix');
    updateViewModeUI();
  });

  scopeDailyBtn.addEventListener('click', () => {
    state.scope = 'daily';
    state.selectedStatus = null;
    statusFilterStackBtn.classList.remove('active');
    statusFilterTriedBtn.classList.remove('active');
    applyFiltersAndRender();
  });
  scopeAllBtn.addEventListener('click', () => {
    state.scope = 'all';
    if (state.allScopeProducts.length === 0) fetchAllScopeProducts();
    else applyFiltersAndRender();
  });

  document.querySelectorAll('.strip-tab[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedType = btn.dataset.type;
      document.querySelectorAll('.strip-tab[data-type]').forEach(b => b.classList.toggle('active', b === btn));
      applyFiltersAndRender();
    });
  });

  document.querySelectorAll('.strip-tab-status').forEach(btn => {
    btn.addEventListener('click', () => {
      const st = btn.dataset.status;
      if (state.selectedStatus === st) {
        state.selectedStatus = null;
        btn.classList.remove('active');
      } else {
        state.selectedStatus = st;
        document.querySelectorAll('.strip-tab-status').forEach(b => b.classList.toggle('active', b === btn));
        state.scope = 'all';
        if (state.allScopeProducts.length === 0) {
          fetchAllScopeProducts();
          return;
        }
      }
      applyFiltersAndRender();
    });
  });

  dayFilterTabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedForm = btn.dataset.form;
    state.focusedIndex = -1;
    applyFiltersAndRender();
  });

  tweaksToggleBtn.addEventListener('click', () => tweaksPanelEl.classList.toggle('hidden'));
  tweaksCloseBtn.addEventListener('click', () => tweaksPanelEl.classList.add('hidden'));
  document.querySelectorAll('#themeSwitchGroup .tweak-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.setTheme;
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('dpb_theme', t);
      document.querySelectorAll('#themeSwitchGroup .tweak-pill').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  document.querySelectorAll('#fontSwitchGroup .tweak-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.setFont;
      document.documentElement.setAttribute('data-font', f);
      localStorage.setItem('dpb_font_v2', f);
      document.querySelectorAll('#fontSwitchGroup .tweak-pill').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  colWidthRange.addEventListener('input', () => {
    const val = colWidthRange.value;
    document.documentElement.style.setProperty('--card-col-min', `${val}px`);
    localStorage.setItem('dpb_col_width', val);
  });

  dateSelectEl.addEventListener('change', () => {
    state.scope = 'daily';
    loadDay(dateSelectEl.value, false);
  });
  prevDayBtn.addEventListener('click', () => {
    const idx = state.days.findIndex(d => d.date === state.currentDate);
    if (idx !== -1 && idx + 1 < state.days.length) {
      state.scope = 'daily';
      loadDay(state.days[idx + 1].date, false);
    }
  });
  nextDayBtn.addEventListener('click', () => {
    const idx = state.days.findIndex(d => d.date === state.currentDate);
    if (idx > 0) {
      state.scope = 'daily';
      loadDay(state.days[idx - 1].date, false);
    }
  });
  randomDayBtn.addEventListener('click', () => {
    if (state.days.length === 0) return;
    const rand = state.days[Math.floor(Math.random() * state.days.length)];
    state.scope = 'daily';
    loadDay(rand.date, true);
    showToast(`已切换至 ${rand.date} 期`);
  });

  syncMuseBtn.addEventListener('click', async () => {
    if (!state.isLocalServer) return;
    syncMuseBtn.disabled = true;
    syncMuseBtn.textContent = '同步中...';
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    syncMuseBtn.disabled = false;
    syncMuseBtn.textContent = '同步';
    showToast(data.output.trim() || '已同步最新简报');
    await loadDay(state.currentDate, false);
    if (state.currentDate === state.todayDate) await updateToday(state.currentDayData);
  });

  rawBriefBtn.addEventListener('click', () => {
    if (!state.currentDayData) return;
    rawDialogTitleEl.textContent = `${state.currentDayData.date} · 当日原始简报汇总`;
    const briefs = state.currentDayData.rawBriefs || [];
    rawBriefsContainerEl.innerHTML = briefs.length > 0
      ? briefs.map(b => `
          <div class="raw-col">
            <h4>${escapeHtml(b.name)}</h4>
            <pre class="raw-pre">${escapeHtml(b.content)}</pre>
          </div>
        `).join('')
      : '<p style="color:var(--ink-muted);">当日暂无原始简报文本</p>';
    rawDialogEl.showModal();
  });
  closeRawDialogBtn.addEventListener('click', () => rawDialogEl.close());
  rawDialogEl.addEventListener('click', (e) => {
    if (e.target === rawDialogEl) rawDialogEl.close();
  });

  globalSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = globalSearchInput.value.trim();
      state.searchQuery = q;
      clearSearchBtn.classList.toggle('hidden', !q);
      if (q) {
        state.scope = 'all';
        fetchAllScopeProducts();
      } else {
        applyFiltersAndRender();
      }
    } else if (e.key === 'Escape') {
      globalSearchInput.blur();
    }
  });
  clearSearchBtn.addEventListener('click', () => {
    globalSearchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.classList.add('hidden');
    if (state.scope === 'all') fetchAllScopeProducts();
    else applyFiltersAndRender();
  });

  document.body.addEventListener('click', (e) => {
    const pageLink = e.target.closest('[data-page-link]');
    if (pageLink) {
      setPage(pageLink.dataset.pageLink);
      return;
    }
    const issueLink = e.target.closest('[data-open-issue]');
    if (issueLink) {
      openIssue(issueLink.dataset.openIssue);
      return;
    }
    if (e.target.closest('[data-redraw-trials]')) {
      closeWorkbench();
      const previousKeys = state.trialSample.map(entry => entry.product.key);
      state.trialSample = drawTrials(state.trialCandidates, state.userState.items, previousKeys);
      renderToday();
      todayContentEl.querySelector('[data-redraw-trials]')?.focus({ preventScroll: true });
      return;
    }
    const trialControl = e.target.closest('[data-choose-trial], [data-open-trial], [data-start-trial]');
    if (trialControl) {
      const { chooseTrial, openTrial, startTrial } = trialControl.dataset;
      const key = chooseTrial || openTrial || startTrial;
      const index = state.trialSample.findIndex(entry => entry.product.key === key);
      if (index === -1) return;
      const { product } = state.trialSample[index];
      rememberTrial(product);
      if (chooseTrial) {
        const [featured] = state.trialSample;
        state.trialSample[0] = state.trialSample[index];
        state.trialSample[index] = featured;
        renderToday();
        todayContentEl.querySelector('.desk-primary')?.focus();
      }
      if (openTrial) openWorkbench(product.key, product);
      return;
    }
    if (e.target.closest('[data-resume-trial]')) {
      openSavedProduct(state.trialChoice?.key, state.trialChoice);
      return;
    }
    const record = e.target.closest('[data-record-key]');
    if (record) {
      const key = record.dataset.recordKey;
      openSavedProduct(key, state.userState.items[key]);
      return;
    }
    const copyRawBtn = e.target.closest('[data-copy-raw]');
    if (copyRawBtn) {
      e.stopPropagation();
      navigator.clipboard.writeText(copyRawBtn.dataset.copyRaw);
      showToast(`已复制: ${copyRawBtn.dataset.copyRaw}`);
      return;
    }
    const copyEncBtn = e.target.closest('[data-copy-enc]');
    if (copyEncBtn) {
      e.stopPropagation();
      navigator.clipboard.writeText(decodeURIComponent(copyEncBtn.dataset.copyEnc));
      showToast('已复制代码块');
      return;
    }
    const curateBtn = e.target.closest('.curate-btn[data-curate]');
    if (curateBtn) {
      e.stopPropagation();
      saveProductState(curateBtn.dataset.key, curateBtn.dataset.curate, undefined);
      return;
    }
    if (e.target.closest('[data-stop-card]')) return;

    const openWbBtn = e.target.closest('.open-wb-btn');
    if (openWbBtn) {
      e.stopPropagation();
      openWorkbench(openWbBtn.dataset.key);
      return;
    }
    const cardEl = e.target.closest('.product-card[data-key]');
    if (cardEl) { openWorkbench(cardEl.dataset.key); return; }

    const rowEl = e.target.closest('.intel-matrix tbody tr[data-key]');
    if (rowEl) openWorkbench(rowEl.dataset.key);
  });

  document.querySelectorAll('.wb-tab').forEach(tab => {
    tab.addEventListener('click', () => switchWorkbenchTab(tab.dataset.wbtab));
  });
  previewDirectBtn.addEventListener('click', () => { state.previewMode = 'direct'; loadWebPreviewIframe(); });
  previewProxyBtn.addEventListener('click', () => { state.previewMode = 'proxy'; loadWebPreviewIframe(); });
  wbReloadIframeBtn.addEventListener('click', () => loadWebPreviewIframe());

  wbTriedBtn.addEventListener('click', () => { if (state.activeProduct) saveProductState(state.activeProduct.key, 'tried', undefined); });
  wbStackBtn.addEventListener('click', () => { if (state.activeProduct) saveProductState(state.activeProduct.key, 'stack', undefined); });
  wbMemoToggleBtn.addEventListener('click', () => {
    const open = wbMemoBarEl.classList.contains('hidden');
    setMemoOpen(open);
    if (open) wbNoteInputEl.focus();
  });
  wbMemoBarEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.activeProduct) return;
    saveProductState(state.activeProduct.key, undefined, wbNoteInputEl.value.trim());
    setMemoOpen(false);
    wbMemoToggleBtn.focus();
  });
  wbNoteInputEl.addEventListener('keydown', (e) => {
    if (!e.isComposing && e.key === 'Escape') {
      e.stopPropagation();
      setMemoOpen(false);
      wbMemoToggleBtn.focus();
    }
  });

  wbCloseBtn.addEventListener('click', closeWorkbench);

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'Enter' && (tag === 'button' || tag === 'a')) return;
    if (state.page !== 'library' && e.key !== 'Escape' && e.key !== '/') return;

    if (e.key === 'j' || e.key === 'J') { e.preventDefault(); moveKeyboardFocus(1); }
    else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); moveKeyboardFocus(-1); }
    else if (e.key === 'Enter' && state.focusedIndex >= 0 && state.displayedProducts[state.focusedIndex]) {
      e.preventDefault(); openWorkbench(state.displayedProducts[state.focusedIndex].key);
    } else if (e.key === 't' || e.key === 'T') {
      const target = state.displayedProducts[state.focusedIndex] || state.activeProduct;
      if (target) { e.preventDefault(); saveProductState(target.key, 'tried', undefined); }
    } else if (e.key === 's' || e.key === 'S') {
      const target = state.displayedProducts[state.focusedIndex] || state.activeProduct;
      if (target) { e.preventDefault(); saveProductState(target.key, 'stack', undefined); }
    } else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); modeMatrixBtn.click(); }
    else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); modeGalleryBtn.click(); }
    else if (e.key === '/') { e.preventDefault(); setPage('library'); globalSearchInput.focus(); }
    else if (e.key === 'Escape') {
      if (ghKeyDialog.open) ghKeyDialog.close();
      else if (rawDialogEl.open) rawDialogEl.close();
      else if (!tweaksPanelEl.classList.contains('hidden')) tweaksPanelEl.classList.add('hidden');
      else if (workspaceEl.classList.contains('sidebar-drawer-open')) workspaceEl.classList.remove('sidebar-drawer-open');
      else if (!workbenchEl.classList.contains('hidden')) closeWorkbench();
    }
  });
}

init().catch(() => {
  todayContentEl.setAttribute('aria-busy', 'false');
  todayContentEl.innerHTML = '<p class="desk-empty" role="alert">暂时无法加载简报，请刷新后重试。</p>';
});
