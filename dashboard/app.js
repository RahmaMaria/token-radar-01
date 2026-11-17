// Token Radar — the dashboard's logic. Static page, no network: every figure comes
// from window.RADAR (data.js, written by main.ts from the sealed snapshot).
//
// The board ranks pre-token protocols by implied launch value. The farm plan for each
// protocol is generated here, in the page, from the row's own record — category,
// main chain, TVL and age — with the same rules as lib/model.ts, so the plan the
// reader sees is the plan the board's data implies, not a hand-written list.

'use strict';

const RADAR = window.RADAR || { rows: [], live: [], comparables: {}, category_multiples: {} };
const WATCHLIST = new Set(RADAR.watchlist || []);
const $ = (id) => document.getElementById(id);

/** HTML-escape a string from the data before it is rendered. */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** $1.23B / $456.7M / $12.3K / $45. */
function fmtMoney(n) {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

/** +12.5% / −4.0% / — when the snapshot reports none. */
function fmtPct(n) {
  if (n == null || !isFinite(n)) return '<span class="flat">—</span>';
  const cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  const sign = n > 0 ? '+' : '';
  return '<span class="' + cls + '">' + sign + n.toFixed(1) + '%</span>';
}

/** 731 days / 2.0y / — */
function fmtAge(days) {
  if (days == null) return '—';
  if (days < 365) return days + 'd';
  return (days / 365).toFixed(1) + 'y';
}

function chainOf(row) {
  return row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain';
}

function capitalFor(row) {
  if (row.tvl_usd >= 5e9) return 250;
  if (row.tvl_usd >= 1e9) return 150;
  if (row.tvl_usd >= 1e8) return 100;
  return 50;
}

function holdDaysFor(age) {
  if (age == null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(row, capital, chain) {
  const c = (row.category || '').toLowerCase();
  const name = row.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
  if (c.includes('curator') || c.includes('allocator')) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
  if (c.includes('prediction')) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
  if (c.includes('rwa')) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
  if (c.includes('stable')) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
  if (c.includes('insurance')) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
  if (c.includes('restak') || c.includes('staking')) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
  if (c.includes('bridge')) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + " and use the bridged funds in its app.";
  return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
}

/**
 * A protocol's farm plan, generated in the page from its own record. Six steps, each
 * an action with a cost and a time. A checklist, not financial advice, and it never
 * promises a token: the protocol records no token today, and may never issue one.
 */
function farmSteps(row) {
  const chain = chainOf(row);
  const capital = capitalFor(row);
  const hold = holdDaysFor(row.age_days);
  const action = actionFor(row, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: action, cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
    { text: "Open the protocol's own points or rewards page, if it publishes one, and check which actions it counts.", cost: 'no fee to check', time: '10 minutes' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
    { text: 'Before you withdraw, claim only from a link the protocol itself publishes, and never pay anyone to claim for you.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
  ];
}

// ---- state ---------------------------------------------------------------

const state = {
  tab: 'board',
  q: '',
  cat: '',
  chain: '',
  watch: false,
  sort: 'implied',
  selected: null,
  sandbox: { gw: 0.5, cs: 1, active: false },
};

const MODEL = RADAR.model || {};

/** The growth percentage the snapshot recorded, recovered from the stored multiplier. */
function growthPct(row) {
  return (row.growth_multiplier - 1) * 2 * 100;
}

/** Implied value under the current model: the published one, or the sandbox's. */
function implied(row) {
  if (!state.sandbox.active) return row.implied_value_usd;
  const gw = state.sandbox.gw;
  const cs = state.sandbox.cs;
  const pct = Math.min(MODEL.growth_cap == null ? 120 : MODEL.growth_cap,
    Math.max(MODEL.growth_floor == null ? -60 : MODEL.growth_floor, growthPct(row)));
  const growthMult = 1 + (pct / 100) * gw;
  return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * cs
    * growthMult * row.maturity_multiplier * row.chain_multiplier));
}

/** Rows after the filter, in the chosen order, each with its current implied value. */
function visibleRows() {
  const q = state.q.trim().toLowerCase();
  let rows = RADAR.rows.filter((r) => {
    if (state.watch && !WATCHLIST.has(r.slug)) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !(r.chains || []).includes(state.chain)) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    return true;
  }).map((r) => ({ row: r, value: implied(r) }));
  const by = {
    implied: (a, b) => b.value - a.value,
    tvl: (a, b) => b.row.tvl_usd - a.row.tvl_usd,
    growth: (a, b) => (b.row.change_7d == null ? -Infinity : b.row.change_7d) - (a.row.change_7d == null ? -Infinity : a.row.change_7d),
    age: (a, b) => (b.row.age_days == null ? -1 : b.row.age_days) - (a.row.age_days == null ? -1 : a.row.age_days),
    name: (a, b) => a.row.name.localeCompare(b.row.name),
  }[state.sort] || ((a, b) => b.value - a.value);
  rows.sort(by);
  return rows;
}

// ---- rendering -----------------------------------------------------------

function renderStats() {
  const values = RADAR.rows.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const med = values.length ? values[Math.floor(values.length / 2)] : 0;
  const top = RADAR.rows[0];
  $('stats').innerHTML =
    stat('Protocols ranked', String(RADAR.board_size || RADAR.rows.length), 'pre-token, watchlist and early') +
    stat('Watchlist', String(RADAR.watchlist_size || 0), 'protocols at or above the $50M floor') +
    stat('Total implied value', fmtMoney(RADAR.total_implied_usd || 0), 'sum of the board’s model estimates') +
    stat('Median implied value', fmtMoney(med), top ? 'top row: ' + esc(top.name) : '');
  $('snapshot-badge').innerHTML = 'Snapshot <b>' + esc(RADAR.as_of || '') + '</b> · DeFiLlama · ' +
    (RADAR.rows.length ? RADAR.rows.length + ' ranked of ' + (RADAR.protocols_total || '') + ' tracked' : 'loading');
}

function stat(k, v, s) {
  return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) +
    '</div><div class="s">' + esc(s) + '</div></div>';
}

function fillSelects() {
  const cats = [...new Set(RADAR.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(RADAR.rows.flatMap((r) => r.chains || []))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' +
    cats.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
  $('chain').innerHTML = '<option value="">All chains</option>' +
    chains.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
}

function renderBoard() {
  const rows = visibleRows();
  const max = rows.reduce((m, item) => Math.max(m, item.value), 1);
  $('rows').innerHTML = rows.map((item, i) => {
    const r = item.row;
    const pct = Math.round((item.value / max) * 100);
    const watch = WATCHLIST.has(r.slug) ? '<span class="watch" title="On the watchlist">★ watchlist</span>' : '';
    const chains = (r.chains || []).slice(0, 3).map(esc).join(', ') + ((r.chains || []).length > 3 ? ' +' + (r.chains.length - 3) : '');
    return '<tr data-slug="' + esc(r.slug) + '" tabindex="0" class="' +
      (i < 3 ? 'top3 ' : '') + (state.selected === r.slug ? 'sel' : '') + '">' +
      '<td class="num rank">' + (i + 1) + '</td>' +
      '<td><span class="pname">' + esc(r.name) + '</span>' + watch +
      '<span class="pslug">' + esc(r.slug) + '</span></td>' +
      '<td><span class="badge">' + esc(r.category || 'Uncategorised') + '</span></td>' +
      '<td>' + chains + '</td>' +
      '<td class="num">' + fmtMoney(r.tvl_usd) + '</td>' +
      '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num"><span class="valbar"><span class="bar"><i style="width:' + pct + '%"></i></span>' +
      '<strong>' + fmtMoney(item.value) + '</strong></span></td></tr>';
  }).join('');
  $('empty').hidden = rows.length > 0;
  $('count').innerHTML = 'Showing <b>' + rows.length + '</b> of <b>' + RADAR.rows.length + '</b> protocols' +
    (state.sandbox.active ? ' · <b>sandbox model</b> (growth weight ' + state.sandbox.gw.toFixed(2) +
      ', category ×' + state.sandbox.cs.toFixed(2) + ')' : ' · published model radar-2') +
    (state.watch ? ' · watchlist only' : '');
}

function renderLive() {
  $('live-rows').innerHTML = (RADAR.live || []).map((p) => {
    const ratio = p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—';
    return '<tr><td><span class="pname">' + esc(p.name) + '</span><span class="pslug">' + esc(p.slug) + '</span></td>' +
      '<td><span class="badge">' + esc(p.category || 'Uncategorised') + '</span></td>' +
      '<td class="num">' + fmtMoney(p.tvl_usd) + '</td>' +
      '<td class="num">' + fmtMoney(p.mcap_usd) + '</td>' +
      '<td class="num">' + ratio + '</td>' +
      '<td class="num">' + fmtPct(p.change_7d) + '</td></tr>';
  }).join('');
}

function renderMultiples() {
  const entries = Object.entries(RADAR.category_multiples || {})
    .sort((a, b) => b[1] - a[1]);
  $('multiples').querySelector('tbody').innerHTML = entries.map((e) =>
    '<tr><td>' + esc(e[0]) + '</td><td class="num">' + e[1].toFixed(3) + '×</td></tr>').join('') +
    '<tr><td>Global fallback</td><td class="num">' + (RADAR.global_multiple || 0).toFixed(3) + '×</td></tr>';
}

function renderDetail() {
  const panel = $('detail');
  const row = RADAR.rows.find((r) => r.slug === state.selected);
  if (!row) { panel.hidden = true; return; }
  const value = implied(row);
  const steps = farmSteps(row);
  const comps = (RADAR.comparables || {})[row.category || 'Uncategorised'] || [];
  const compHtml = comps.length
    ? '<table class="model-table">' + comps.map((c) =>
      '<tr><td>' + esc(c.name) + '</td><td>' + fmtMoney(c.mcap_usd) + ' mcap</td><td>' +
        c.ratio.toFixed(2) + '× TVL</td></tr>').join('') + '</table>'
    : '<p class="lede">No live-token comparable in this category in the snapshot.</p>';
  $('detail-body').innerHTML =
    '<h2>' + esc(row.name) + '</h2>' +
    '<p class="sub">' + esc(row.slug) + ' · ' + esc(row.category || 'Uncategorised') + ' · ' +
    (WATCHLIST.has(row.slug) ? 'on the watchlist · ' : '') + 'rank #' + row.rank + ' by implied value</p>' +
    '<div class="facts">' +
    fact('TVL', fmtMoney(row.tvl_usd)) + fact('7-day change', row.change_7d == null ? '—' : (row.change_7d > 0 ? '+' : '') + row.change_7d.toFixed(1) + '%') +
    fact('Age', row.age_days == null ? 'unknown' : row.age_days + ' days') +
    fact('Chains', (row.chains || []).join(', ') || '—') +
    fact('Listed', esc(row.listed_at || 'unknown')) +
    fact('Token recorded', 'none') + '</div>' +
    '<h3>Why this value — model breakdown</h3>' +
    '<table class="model-table">' +
    '<tr><td>TVL</td><td>' + fmtMoney(row.tvl_usd) + '</td></tr>' +
    '<tr><td>× Category multiple (' + esc(row.category || 'Uncategorised') + ')</td><td>' + row.category_multiple.toFixed(3) + '×</td></tr>' +
    '<tr><td>× Growth (' + (row.change_7d == null ? 'no 7d figure' : (row.change_7d > 0 ? '+' : '') + row.change_7d.toFixed(1) + '%') + ')</td><td>' + row.growth_multiplier.toFixed(3) + '×</td></tr>' +
    '<tr><td>× Maturity (' + fmtAge(row.age_days) + ')</td><td>' + row.maturity_multiplier.toFixed(3) + '×</td></tr>' +
    '<tr><td>× Chain reach (' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ')</td><td>' + row.chain_multiplier.toFixed(3) + '×</td></tr>' +
    '<tr class="total"><td>= Implied value</td><td>' + fmtMoney(value) + '</td></tr></table>' +
    '<h3>How to farm it</h3>' +
    '<ol class="steps">' + steps.map((s) =>
      '<li>' + esc(s.text) + '<br><span class="cost">' + esc(s.cost) + ' · ' + esc(s.time) + '</span></li>').join('') + '</ol>' +
    '<h3>Live comparables in ' + esc(row.category || 'this category') + '</h3>' + compHtml +
    '<h3>Read this first</h3>' +
    '<p class="caveat">This protocol records no token in the snapshot — that is not proof it has none, ' +
    'and not a promise it will ever issue one. The implied value is a model estimate from TVL, ' +
    'category, growth, age and chain reach; it is not a price, a prediction, or financial advice.</p>';
  panel.hidden = false;
}

function fact(k, v) {
  return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div></div>';
}

// ---- tabs, filters, sandbox, hash ----------------------------------------

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('view-board').hidden = tab !== 'board';
  $('view-live').hidden = tab !== 'live';
  $('view-method').hidden = tab !== 'method';
  if (tab === 'live') renderLive();
  if (tab === 'method') renderMultiples();
}

function applySandbox() {
  const gw = parseFloat($('gw').value);
  const cs = parseFloat($('cs').value);
  state.sandbox = { gw, cs, active: gw !== 0.5 || cs !== 1 };
  $('gw-out').textContent = gw.toFixed(2);
  $('cs-out').textContent = cs.toFixed(2) + '×';
  $('sandbox-note').textContent = state.sandbox.active
    ? 'Sandbox on: the board below is re-scored with growth weight ' + gw.toFixed(2) + ' and category ×' + cs.toFixed(2) + '.'
    : 'Showing the published model.';
  renderBoard();
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('p')) state.selected = h.get('p');
  if (h.get('cat')) { state.cat = h.get('cat'); $('cat').value = state.cat; }
  if (h.get('tab')) setTab(h.get('tab'));
}

function writeHash() {
  const h = new URLSearchParams();
  if (state.selected) h.set('p', state.selected);
  if (state.cat) h.set('cat', state.cat);
  if (state.tab !== 'board') h.set('tab', state.tab);
  const s = h.toString();
  history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
}

// ---- wiring --------------------------------------------------------------

document.querySelectorAll('.tab').forEach((b) =>
  b.addEventListener('click', () => { setTab(b.dataset.tab); writeHash(); }));
$('q').addEventListener('input', (e) => { state.q = e.target.value; renderBoard(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); writeHash(); });
$('chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); });
$('watch').addEventListener('change', (e) => { state.watch = e.target.checked; renderBoard(); });
$('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (tr) { state.selected = tr.dataset.slug; renderBoard(); renderDetail(); writeHash(); }
});
$('rows').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const tr = e.target.closest('tr[data-slug]');
  if (tr) { state.selected = tr.dataset.slug; renderBoard(); renderDetail(); writeHash(); }
});
$('detail-close').addEventListener('click', () => {
  state.selected = null; renderBoard(); renderDetail(); writeHash();
});
$('gw').addEventListener('input', applySandbox);
$('cs').addEventListener('input', applySandbox);
$('reset').addEventListener('click', () => {
  $('gw').value = '0.5'; $('cs').value = '1'; applySandbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.selected) {
    state.selected = null; renderBoard(); renderDetail(); writeHash();
  }
});

// ---- init ------------------------------------------------------------------

renderStats();
fillSelects();
readHash();
renderBoard();
renderDetail();
document.querySelector('main, #board').setAttribute('aria-busy', 'false');
