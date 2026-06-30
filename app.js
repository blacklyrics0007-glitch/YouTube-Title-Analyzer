/* ============================================================
   Best YouTube Title Analyzer — Application Logic
   - Local analysis engine (works fully offline, no key needed)
   - Live YouTube Data API v3 enrichment (competition + videos)
   ============================================================ */
'use strict';

/* ---------------- Constants & data ---------------- */
const LS_KEY = 'ytta_api_key';
const LS_COUNTRY = 'ytta_country';
const YT_API = 'https://www.googleapis.com/youtube/v3';

const COUNTRIES = [
  ['US', '🇺🇸 US'], ['GB', '🇬🇧 UK'], ['CA', '🇨🇦 Canada'], ['AU', '🇦🇺 Australia'],
  ['IN', '🇮🇳 India'], ['KH', '🇰🇭 Cambodia'], ['DE', '🇩🇪 Germany'], ['FR', '🇫🇷 France'],
  ['ES', '🇪🇸 Spain'], ['BR', '🇧🇷 Brazil'], ['MX', '🇲🇽 Mexico'], ['JP', '🇯🇵 Japan'],
  ['KR', '🇰🇷 Korea'], ['ID', '🇮🇩 Indonesia'], ['PH', '🇵🇭 Philippines'], ['TH', '🇹🇭 Thailand'],
  ['VN', '🇻🇳 Vietnam'], ['NG', '🇳🇬 Nigeria'], ['PK', '🇵🇰 Pakistan'], ['RU', '🇷🇺 Russia'],
  ['IT', '🇮🇹 Italy'], ['NL', '🇳🇱 Netherlands'], ['SA', '🇸🇦 Saudi Arabia'], ['AE', '🇦🇪 UAE'],
];

// Words ignored when extracting meaningful keywords.
const STOPWORDS = new Set(('a an and the to of for in on at by with from into over after this that ' +
  'is are was were be been being do does did how what why when where who which your you i my me ' +
  'we our us it its as or but if then so than too very can will just about out up down off it\'s ' +
  'vs &').split(/\s+/));

// Words that add emotional / power pull to a title (psychology layer).
const POWER_WORDS = new Set(('secret proven ultimate instantly free easy fast best worst stop avoid ' +
  'mistake hack truth never always exposed shocking insane crazy genius simple powerful brutal ' +
  'honest warning revealed unlock skyrocket explode boost guaranteed effortless'.split(/\s+/)));
const EMOTION_WORDS = new Set(('amazing incredible love hate fear surprising hidden dangerous painful ' +
  'happy fail win lose worst dream nightmare epic legendary unbelievable game-changing'.split(/\s+/)));

// Modifiers used to synthesize long-tail keyword opportunities.
const MODIFIERS = ['tutorial', 'guide', 'tips', 'for beginners', '2026', 'step by step',
  'explained', 'mistakes', 'review', 'best', 'how to', 'fast', 'free', 'examples', 'checklist'];

/* ---------------- DOM helpers ---------------- */
const $ = (id) => document.getElementById(id);
const el = {
  apiKey: $('apiKey'), country: $('country'), statusBadge: $('statusBadge'), statusText: $('statusText'),
  toggleKey: $('toggleKey'), saveKey: $('saveKey'), apiHint: $('apiHint'), modeBadge: $('modeBadge'),
  titleInput: $('titleInput'), charCount: $('charCount'), analyzeBtn: $('analyzeBtn'), alert: $('alert'),
  gaugeArc: $('gaugeArc'), scoreValue: $('scoreValue'), scoreLabel: $('scoreLabel'),
  insights: $('insights'), hashtags: $('hashtags'), videos: $('videos'), toast: $('toast'),
};
const GAUGE_LEN = 2 * Math.PI * 52; // matches r=52 in svg

// Last analysis state (used for copy + range switching).
let state = { lowComp: [], trending: [], all: [], hashtags: [], videos: [], lastTitle: '' };

/* ============================================================
   1. INITIALISATION
   ============================================================ */
function init() {
  // Country dropdown
  el.country.innerHTML = COUNTRIES.map(([c, l]) => `<option value="${c}">${l}</option>`).join('');
  el.country.value = localStorage.getItem(LS_COUNTRY) || 'US';

  // Restore saved key
  const savedKey = localStorage.getItem(LS_KEY);
  if (savedKey) { el.apiKey.value = savedKey; }
  refreshStatus();

  // Events
  el.saveKey.addEventListener('click', saveKey);
  el.toggleKey.addEventListener('click', toggleKeyVisibility);
  el.country.addEventListener('change', () => localStorage.setItem(LS_COUNTRY, el.country.value));
  el.analyzeBtn.addEventListener('click', runAnalysis);
  el.titleInput.addEventListener('input', updateCharCount);
  el.titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runAnalysis(); });
  el.apiKey.addEventListener('input', () => { if (!el.apiKey.value.trim()) setStatus(false); });

  document.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => copyGroup(b.dataset.copy, b)));
  document.querySelectorAll('.seg-btn').forEach((b) =>
    b.addEventListener('click', () => switchRange(b)));

  updateCharCount();
}

/* ============================================================
   2. API KEY + STATUS
   ============================================================ */
function hasKey() { return !!el.apiKey.value.trim(); }

function setStatus(online) {
  el.statusBadge.className = 'status-badge ' + (online ? 'status-badge--online' : 'status-badge--offline');
  el.statusText.textContent = online ? 'LIVE' : 'OFFLINE';
  el.modeBadge.textContent = online ? '● API ANALYSIS' : '● LOCAL ANALYSIS';
  el.modeBadge.classList.toggle('is-live', online);
}
function refreshStatus() { setStatus(hasKey() && !!localStorage.getItem(LS_KEY)); }

function saveKey() {
  const key = el.apiKey.value.trim();
  if (!key) { localStorage.removeItem(LS_KEY); setStatus(false); showAlert('Key cleared — running in local mode.', 'info'); return; }
  localStorage.setItem(LS_KEY, key);
  setStatus(true);
  showAlert('API key saved. Live competition & video data unlocked.', 'ok');
  toast('Key saved');
}
function toggleKeyVisibility() {
  const show = el.apiKey.type === 'password';
  el.apiKey.type = show ? 'text' : 'password';
  el.toggleKey.textContent = show ? '🙈 Hide' : '👁 Show';
}

/* ============================================================
   3. CHAR COUNT
   ============================================================ */
function updateCharCount() {
  const n = el.titleInput.value.length;
  el.charCount.textContent = n;
  el.charCount.className = 'char-count' + (n > 70 ? ' bad' : n > 60 ? ' warn' : '');
}

/* ============================================================
   4. TEXT / KEYWORD UTILITIES
   ============================================================ */
function clean(str) { return str.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim(); }
function tokenize(str) { return clean(str).split(' ').filter(Boolean); }
function meaningful(words) { return words.filter((w) => w.length > 2 && !STOPWORDS.has(w)); }

// Build n-grams of a given size from a token list.
function ngrams(words, n) {
  const out = [];
  for (let i = 0; i <= words.length - n; i++) out.push(words.slice(i, i + n).join(' '));
  return out;
}

// Frequency map from an array of strings.
function freqMap(arr) {
  const m = new Map();
  arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  return m;
}

function titleCase(s) { return s.replace(/\b\w/g, (c) => c.toUpperCase()); }

/* ============================================================
   5. SEO SCORING ENGINE  (deterministic, explainable)
   ============================================================ */
function scoreTitle(title) {
  const checks = [];
  let score = 0;
  const raw = title.trim();
  const len = raw.length;
  const words = tokenize(raw);
  const keys = meaningful(words);

  // a) Length (mobile-friendly 50-70) — 22 pts
  if (len >= 50 && len <= 70) { score += 22; checks.push(['ok', `Length is ideal (<b>${len}</b> chars) — fits mobile screens.`]); }
  else if (len >= 40 && len <= 80) { score += 14; checks.push(['warn', `Length is <b>${len}</b> chars — aim for 50–70 so it isn't truncated.`]); }
  else if (len < 40) { score += 6; checks.push(['bad', `Only <b>${len}</b> chars — too short to rank for enough keywords.`]); }
  else { score += 4; checks.push(['bad', `<b>${len}</b> chars — likely cut off on mobile (keep under 70).`]); }

  // b) Front-loaded keyword — 20 pts
  const firstChunk = clean(raw).slice(0, 30);
  const hasFrontKw = keys.some((k) => firstChunk.includes(k));
  if (hasFrontKw && keys.length) { score += 20; checks.push(['ok', 'Primary keyword is <b>front-loaded</b> (first 30 chars).']); }
  else { checks.push(['bad', 'Move your main keyword to the <b>front</b> of the title for max weight.']); }

  // c) Number / data point — 12 pts
  if (/\d/.test(raw)) { score += 12; checks.push(['ok', 'Contains a <b>number</b> — numbers lift CTR significantly.']); }
  else { checks.push(['warn', 'Add a <b>number</b> (e.g. "5 Ways", "in 2026") to boost clicks.']); }

  // d) Curiosity gap — brackets / parentheses — 12 pts
  if (/[\(\[].+[\)\]]/.test(raw)) { score += 12; checks.push(['ok', 'Has a <b>(bracketed hook)</b> — great curiosity trigger.']); }
  else { checks.push(['warn', 'Try a <b>(bracketed hook)</b> like "(Step by Step)" to add a curiosity gap.']); }

  // e) Power / emotional words — 14 pts
  const pw = words.filter((w) => POWER_WORDS.has(w) || EMOTION_WORDS.has(w));
  if (pw.length >= 2) { score += 14; checks.push(['ok', `Strong emotional pull (<b>${pw.join(', ')}</b>).`]); }
  else if (pw.length === 1) { score += 8; checks.push(['warn', `One power word (<b>${pw[0]}</b>) — add one more for stronger pull.`]); }
  else { checks.push(['bad', 'No <b>power/emotional words</b> — add words like "proven", "easy", "best".']); }

  // f) Word count balance — 10 pts
  if (words.length >= 6 && words.length <= 12) { score += 10; checks.push(['ok', `Good word count (<b>${words.length}</b>).`]); }
  else if (words.length) { score += 4; checks.push(['warn', `Word count is <b>${words.length}</b> — 6–12 reads best.`]); }

  // g) ALL-CAPS / clickbait penalty — 10 pts
  const capsWords = words.length ? raw.split(/\s+/).filter((w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w)) : [];
  if (capsWords.length <= 1) { score += 10; checks.push(['ok', 'Capitalisation looks clean (no spammy ALL-CAPS).']); }
  else { checks.push(['bad', `Too many ALL-CAPS words (<b>${capsWords.length}</b>) — looks like clickbait.`]); }

  return { score: Math.max(0, Math.min(100, Math.round(score))), checks };
}

/* ============================================================
   6. LOCAL KEYWORD GENERATION
   ============================================================ */
function localKeywords(title) {
  const words = tokenize(title);
  const keys = meaningful(words);
  const uniqueKeys = [...new Set(keys)];

  const short = [...new Set(uniqueKeys)];
  const long = [...new Set(ngrams(keys, 2))];
  const phrase = [...new Set([...ngrams(keys, 3), ...ngrams(words, 4)])].filter((p) => p.split(' ').length >= 3);

  // Long-tail opportunity phrases (synthesized) -> treated as low competition candidates.
  const seed = uniqueKeys.slice(0, 3);
  const synth = [];
  seed.forEach((s) => MODIFIERS.forEach((m) => {
    synth.push(m.includes('how') ? `${m} ${s}` : `${s} ${m}`);
  }));

  return { short, long, phrase, synth: [...new Set(synth)], all: [...new Set([...short, ...long, ...phrase])] };
}

/* ============================================================
   7. MAIN ANALYSIS FLOW
   ============================================================ */
async function runAnalysis() {
  const title = el.titleInput.value.trim();
  hideAlert();
  if (!title) { showAlert('Type a video title to analyze.', 'err'); el.titleInput.focus(); return; }

  // --- Local engine (always) ---
  const { score, checks } = scoreTitle(title);
  animateGauge(score);
  renderInsights(checks);

  const kw = localKeywords(title);
  state.all = kw.all;
  state.hashtags = buildHashtags(kw);
  state.lastTitle = title;

  renderHashtags(state.hashtags);
  renderKeywordList('all-keywords', kw.all, true);

  const online = hasKey();
  setStatus(online && !!localStorage.getItem(LS_KEY));

  if (!online) {
    // Offline: derive low-comp from synthesized long-tails, trending from title keys.
    state.lowComp = classifyLocal(kw.synth.length ? kw.synth : kw.all);
    state.trending = classifyLocal(kw.all, 'med');
    renderKeywordColumns('lc', state.lowComp);
    renderKeywordColumns('tr', state.trending);
    renderVideosEmpty('Add a YouTube API key (top of page) to load live competitor videos.');
    showAlert('Local analysis complete. Add an API key for live competition data.', 'info');
    return;
  }

  // --- Online enrichment ---
  setLoading(true);
  try {
    await onlineAnalysis(title, kw);
  } catch (err) {
    console.error(err);
    showAlert('API error: ' + err.message + ' — showing local results.', 'err');
    state.lowComp = classifyLocal(kw.synth.length ? kw.synth : kw.all);
    state.trending = classifyLocal(kw.all, 'med');
    renderKeywordColumns('lc', state.lowComp);
    renderKeywordColumns('tr', state.trending);
    renderVideosEmpty('Could not reach the YouTube API. Check your key & quota.');
  } finally {
    setLoading(false);
  }
}

/* ---------------- Online (YouTube Data API v3) ---------------- */
async function onlineAnalysis(title, kw) {
  const key = el.apiKey.value.trim();
  const region = el.country.value;

  // 1) Top competitor videos for the title.
  const search = await ytFetch('search', {
    key, part: 'snippet', q: title, type: 'video', maxResults: 25,
    regionCode: region, order: 'relevance',
  });
  const ids = (search.items || []).map((i) => i.id.videoId).filter(Boolean);
  if (!ids.length) {
    showAlert('No videos found for this title in the selected region.', 'info');
    state.trending = classifyLocal(kw.all, 'med');
    renderKeywordColumns('tr', state.trending);
    return;
  }

  // 2) Full stats for those videos.
  const details = await ytFetch('videos', {
    key, part: 'snippet,statistics', id: ids.join(','),
  });
  const vids = (details.items || []).map(mapVideo);

  // 3) Trending keywords = most frequent n-grams across competitor titles.
  const corpus = vids.map((v) => v.title).join(' . ');
  const cWords = meaningful(tokenize(corpus));
  const trShort = topFreq(cWords, 6);
  const trLong = topFreq(ngrams(cWords, 2), 6);
  const trPhrase = topFreq(ngrams(meaningful(tokenize(corpus)), 3), 5);
  state.trending = [
    ...trShort.map((k) => ({ kw: k, comp: 'high' })),
    ...trLong.map((k) => ({ kw: k, comp: 'med' })),
    ...trPhrase.map((k) => ({ kw: k, comp: 'low' })),
  ];
  renderKeywordColumns('tr', state.trending);

  // 4) Low competition = title-derived candidates whose usage is RARE in top results.
  const usage = freqMap([...cWords, ...ngrams(cWords, 2), ...ngrams(cWords, 3)]);
  const candidates = [...new Set([...kw.short, ...kw.long, ...kw.phrase, ...kw.synth])];
  const scored = candidates.map((c) => {
    const u = usage.get(c) || 0;
    const comp = u === 0 ? 'low' : u <= 2 ? 'med' : 'high';
    return { kw: c, comp, usage: u };
  }).sort((a, b) => a.usage - b.usage);
  // Prefer the genuinely low-usage opportunities.
  state.lowComp = scored.filter((s) => s.comp !== 'high').slice(0, 18);
  if (state.lowComp.length < 6) state.lowComp = scored.slice(0, 12);
  renderKeywordColumns('lc', state.lowComp);

  // 5) Store videos for comparison view (sorted by views).
  vids.sort((a, b) => b.views - a.views);
  state.videos = vids;
  renderVideos(getActiveRange());

  showAlert(`Live analysis done — scanned ${vids.length} ranking videos in ${region}.`, 'ok');
}

function mapVideo(v) {
  const s = v.snippet || {}, st = v.statistics || {};
  return {
    id: v.id, title: s.title || '', channel: s.channelTitle || '',
    thumb: (s.thumbnails && (s.thumbnails.medium || s.thumbnails.default) || {}).url || '',
    published: s.publishedAt || '', views: +(st.viewCount || 0), likes: +(st.likeCount || 0),
    comments: +(st.commentCount || 0),
  };
}

async function ytFetch(endpoint, params) {
  const url = `${YT_API}/${endpoint}?` + new URLSearchParams(params).toString();
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const msg = (data.error && data.error.message) || res.statusText;
    throw new Error(msg);
  }
  return data;
}

/* ---------------- Classify helpers (offline) ---------------- */
function classifyLocal(list, force) {
  return [...new Set(list)].slice(0, 18).map((k, i) => ({
    kw: k,
    comp: force || (k.split(' ').length >= 3 ? 'low' : k.split(' ').length === 2 ? 'med' : 'high'),
  }));
}
function topFreq(arr, n) {
  return [...freqMap(arr).entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]);
}

/* ============================================================
   8. HASHTAGS
   ============================================================ */
function buildHashtags(kw) {
  const base = [...kw.short, ...kw.long].slice(0, 8);
  const tags = base.map((k) => '#' + titleCase(k).replace(/\s+/g, ''));
  return [...new Set(tags)].slice(0, 5);
}

/* ============================================================
   9. RENDERING
   ============================================================ */
function chip(item) {
  const comp = item.comp || 'med';
  const label = { low: 'LOW', med: 'MED', high: 'HIGH' }[comp];
  return `<button class="chip" data-kw="${escapeHtml(item.kw)}" title="Click to copy">
      <span class="kw-text">${escapeHtml(item.kw)}</span>
      <span class="badge badge--${comp}">${label}</span>
    </button>`;
}

function renderKeywordColumns(prefix, items) {
  const byLen = { short: [], long: [], phrase: [] };
  items.forEach((it) => {
    const n = it.kw.trim().split(/\s+/).length;
    if (n === 1) byLen.short.push(it);
    else if (n === 2) byLen.long.push(it);
    else byLen.phrase.push(it);
  });
  fillCol(`${prefix}-short`, byLen.short);
  fillCol(`${prefix}-long`, byLen.long);
  fillCol(`${prefix}-phrase`, byLen.phrase);
}
function fillCol(id, items) {
  const node = $(id);
  node.innerHTML = items.length ? items.map(chip).join('') : '<span class="kw-empty">—</span>';
  bindChips(node);
}
function renderKeywordList(id, list, plain) {
  const node = $(id);
  if (!list.length) { node.innerHTML = '<span class="kw-empty">No keywords yet.</span>'; return; }
  node.innerHTML = list.map((k) => chip({ kw: k, comp: plain ? 'med' : 'low' })).join('');
  bindChips(node);
}
function bindChips(node) {
  node.querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => { copyText(c.dataset.kw); toast('Copied: ' + c.dataset.kw); }));
}

function renderHashtags(tags) {
  el.hashtags.innerHTML = tags.length
    ? tags.map((t) => `<span class="hashtag" data-kw="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')
    : '<span class="kw-empty">No hashtags yet.</span>';
  el.hashtags.querySelectorAll('.hashtag').forEach((h) =>
    h.addEventListener('click', () => { copyText(h.dataset.kw); toast('Copied ' + h.dataset.kw); }));
}

function renderInsights(checks) {
  el.insights.innerHTML = checks.map(([type, msg]) => {
    const m = { ok: '✓', warn: '⚠', bad: '✕' }[type];
    return `<li><span class="mark ${type}">${m}</span><span>${msg}</span></li>`;
  }).join('');
}

function renderVideos(rangeMonths) {
  const cutoff = Date.now() - rangeMonths * 30 * 24 * 3600 * 1000;
  const list = state.videos.filter((v) => !v.published || new Date(v.published).getTime() >= cutoff);
  if (!list.length) { renderVideosEmpty(`No ranking videos published in the last ${rangeMonths} months.`); return; }
  el.videos.innerHTML = list.slice(0, 10).map((v, i) => `
    <a class="video-card" href="https://youtu.be/${v.id}" target="_blank" rel="noopener">
      <img class="video-thumb" src="${v.thumb}" alt="" loading="lazy" />
      <div class="video-info">
        <span class="video-title">${escapeHtml(v.title)}</span>
        <span class="video-channel">${escapeHtml(v.channel)}</span>
        <div class="video-stats">
          <span class="video-rank">#${i + 1}</span>
          <span>👁 <b>${fmt(v.views)}</b></span>
          <span>👍 ${fmt(v.likes)}</span>
          <span>💬 ${fmt(v.comments)}</span>
          <span>📅 ${timeAgo(v.published)}</span>
        </div>
      </div>
    </a>`).join('');
}
function renderVideosEmpty(msg) { el.videos.innerHTML = `<p class="empty-note">${escapeHtml(msg)}</p>`; }

/* ============================================================
   10. RANGE SWITCHING
   ============================================================ */
function getActiveRange() {
  const active = document.querySelector('.seg-btn.is-active');
  return active ? +active.dataset.range : 3;
}
function switchRange(btn) {
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  if (state.videos.length) renderVideos(+btn.dataset.range);
}

/* ============================================================
   11. COPY / CLIPBOARD
   ============================================================ */
function copyGroup(group, btn) {
  let text = '';
  if (group === 'lowComp') text = state.lowComp.map((x) => x.kw).join('\n');
  else if (group === 'trending') text = state.trending.map((x) => x.kw).join('\n');
  else if (group === 'all') text = state.all.join('\n');
  else if (group === 'hashtags') text = state.hashtags.join(' ');
  if (!text) { toast('Nothing to copy yet'); return; }
  copyText(text);
  btn.classList.add('copied');
  const orig = btn.textContent;
  btn.textContent = '✓ Copied';
  setTimeout(() => { btn.classList.remove('copied'); btn.textContent = orig; }, 1300);
}
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) { /* noop */ }
  document.body.removeChild(ta);
}

/* ============================================================
   12. UI HELPERS
   ============================================================ */
function animateGauge(score) {
  const offset = GAUGE_LEN - (score / 100) * GAUGE_LEN;
  el.gaugeArc.style.strokeDashoffset = offset;
  const color = score >= 75 ? '#25e398' : score >= 50 ? '#ffb02e' : '#ff4d5e';
  el.gaugeArc.style.stroke = color;
  el.scoreValue.style.color = color;
  el.scoreLabel.textContent = score >= 85 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : score >= 50 ? 'AVERAGE' : score >= 30 ? 'WEAK' : 'POOR';
  // count up
  const start = +el.scoreValue.textContent || 0;
  const t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / 700);
    el.scoreValue.textContent = Math.round(start + (score - start) * p);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

function setLoading(on) {
  el.analyzeBtn.classList.toggle('loading', on);
  el.analyzeBtn.innerHTML = on ? '<span class="spinner"></span> Analyzing…' : '🔍 ANALYZE';
}
function showAlert(msg, type) {
  el.alert.hidden = false;
  el.alert.className = 'alert alert--' + (type === 'err' ? 'err' : type === 'ok' ? 'ok' : 'info');
  el.alert.textContent = msg;
}
function hideAlert() { el.alert.hidden = true; }

let toastTimer;
function toast(msg) {
  el.toast.hidden = false;
  el.toast.textContent = msg;
  requestAnimationFrame(() => el.toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.classList.remove('show'); }, 1600);
}

/* ---------------- formatting ---------------- */
function fmt(n) {
  n = +n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
function timeAgo(iso) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return 'today';
  if (d < 30) return Math.round(d) + 'd ago';
  if (d < 365) return Math.round(d / 30) + 'mo ago';
  return Math.round(d / 365) + 'y ago';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', init);
