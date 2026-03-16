// ── Theme toggle ────────────────────────────────────────────────
function initTheme() {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const current = () => root.getAttribute('data-theme') || 'dark';

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('li-theme', theme);
    lucide.createIcons(); // re-render icons after DOM changes
  }

  if (btn) {
    btn.addEventListener('click', () => {
      apply(current() === 'dark' ? 'light' : 'dark');
    });
  }

  // Wire up the satellite buttons (other pages)
  document.querySelectorAll('.theme-toggle:not(#themeToggle)').forEach(b => {
    b.addEventListener('click', () => apply(current() === 'dark' ? 'light' : 'dark'));
  });
}

// ── Data ─────────────────────────────────────────────────────────
let leads = [];

const leadsContainer = document.getElementById('leadsContainer');
const modalOverlay = document.getElementById('modalOverlay');
const closeModalBtn = document.getElementById('closeModal');
const modalBody = document.getElementById('modalBody');

// ── Navigation ───────────────────────────────────────────────────
const SECTIONS = ['dashboard', 'all-leads', 'saved', 'analytics', 'integrations'];

function showSection(name) {
  SECTIONS.forEach(s => {
    const el = document.getElementById('section-' + s);
    if (el) el.style.display = s === name ? '' : 'none';
  });
  document.querySelectorAll('.nav-item[data-section]').forEach(el => {
    el.classList.toggle('active', el.dataset.section === name);
  });
  if (name === 'all-leads') renderLeadsTable();
  if (name === 'saved') renderSavedLeads();
  if (name === 'analytics') renderAnalytics();
  if (name === 'integrations') renderIntegrations();
}

document.querySelectorAll('.nav-item[data-section]').forEach(el => {
  el.addEventListener('click', () => showSection(el.dataset.section));
});

// ── Load data ────────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch('data.json?t=' + Date.now());
    const raw = await res.json();
    leads = Array.isArray(raw) ? raw.flat(Infinity).filter(l => l && l.company) : [];
    renderLeads();
    updateStats();
    updateStarredCount();
  } catch (err) {
    console.error('Error loading leads:', err);
    if (leadsContainer) leadsContainer.innerHTML =
      `<p style="padding:40px;color:var(--red)">Error loading lead data. Ensure data.json exists.</p>`;
  }
}

// ── Stats ────────────────────────────────────────────────────────
function updateStats() {
  const total = leads.length;
  const high = leads.filter(l => l.tier === 'high').length;
  const avg = total ? (leads.reduce((s, l) => s + +l.score, 0) / total).toFixed(1) : '—';
  const inds = new Set(leads.map(l => l.industry)).size;
  set('stat-total', total);
  set('stat-high', high);
  set('stat-avg', avg);
  set('stat-industries', inds);
  set('nav-lead-count', total);
}

function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ── HTML attribute escaping helper ───────────────────────────────
function htmlAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

// ── Score badge colour helper ─────────────────────────────────────
function scoreBadgeStyle(s) {
  const n = +s;
  if (n >= 8) return 'background:var(--green-bg);color:var(--green);border-color:rgba(52,211,153,0.25)';
  if (n >= 6) return 'background:var(--amber-bg);color:var(--amber);border-color:rgba(251,191,36,0.25)';
  return '';
}

// ── Saved / Starred leads (localStorage) ─────────────────────────
const SAVE_FIELDS = ['company','industry','employees','tier','score','trigger','description','outreach_email','call_opener','url','title','source'];
function trimLead(lead) {
  const out = { _savedAt: new Date().toISOString() };
  SAVE_FIELDS.forEach(k => { if (lead[k] != null) out[k] = lead[k]; });
  return out;
}

function getStarred() {
  try { return JSON.parse(localStorage.getItem('li-starred') || '[]'); } catch (e) { return []; }
}
function saveStarredList(arr) { localStorage.setItem('li-starred', JSON.stringify(arr)); }
function isStarred(company) { return getStarred().some(l => l.company === company); }
function updateStarredCount() { const n = getStarred().length; set('nav-saved-count', n || ''); }

function toggleStar(company, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  const list = getStarred();
  const idx = list.findIndex(l => l.company === company);
  const willBeStarred = idx === -1;
  if (!willBeStarred) {
    list.splice(idx, 1);
  } else {
    const lead = leads.find(l => l.company === company);
    if (lead) list.unshift(trimLead(lead));
  }
  saveStarredList(list);

  // Update all star buttons for this company (cards + modal) without re-rendering
  document.querySelectorAll('.star-btn[data-company]').forEach(btn => {
    if (btn.dataset.company === company) {
      btn.classList.toggle('starred', willBeStarred);
      btn.title = willBeStarred ? 'Remove from saved' : 'Save lead';
      const span = btn.querySelector('span');
      if (span) span.textContent = willBeStarred ? 'Saved' : 'Save';
    }
  });
  // Update card is-starred border
  document.querySelectorAll('.lead-card[data-company]').forEach(card => {
    if (card.dataset.company === company) card.classList.toggle('is-starred', willBeStarred);
  });

  updateStarredCount();
  // Refresh saved section if it's currently visible
  const savedSection = document.getElementById('section-saved');
  if (savedSection && savedSection.style.display !== 'none') renderSavedLeads();
}

// ── Pill filter helper ───────────────────────────────────────
function setPillFilter(groupId, btn) {
  document.querySelectorAll(`#${groupId} .filter-pill`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function getPillValue(groupId) {
  return document.querySelector(`#${groupId} .filter-pill.active`)?.dataset.value ?? '';
}

// ── Dashboard lead cards ─────────────────────────────────────────
function renderLeads() {
  if (!leadsContainer) return;

  const q = (document.getElementById('dash-search')?.value || '').toLowerCase();
  const tier = getPillValue('dash-tier-group');
  const minScore = getPillValue('dash-score-group') || 'all';
  const sort = document.getElementById('dash-sort')?.value || 'score-desc';

  // Start from scored leads only
  let visible = leads
    .map((l, idx) => ({ ...l, _idx: idx }))
    .filter(l => {
      if (l.score == null) return false;
      if (q && !l.company.toLowerCase().includes(q) &&
        !(l.industry || '').toLowerCase().includes(q)) return false;
      if (tier && l.tier !== tier) return false;
      if (minScore !== 'all' && +l.score < +minScore) return false;
      return true;
    });

  visible.sort((a, b) => {
    if (sort === 'score-desc') return b.score - a.score;
    if (sort === 'score-asc') return a.score - b.score;
    if (sort === 'company-asc') return a.company.localeCompare(b.company);
    if (sort === 'company-desc') return b.company.localeCompare(a.company);
    return 0;
  });

  // Update count badge
  const badge = document.getElementById('dash-count-badge');
  if (badge) badge.textContent = visible.length || '';

  if (!visible.length) {
    leadsContainer.innerHTML =
      `<p style="padding:40px;color:var(--t2)">No leads match the current filters.</p>`;
    return;
  }

  leadsContainer.innerHTML = visible.map((lead, displayIdx) => `
    <div class="lead-card ${lead.tier || 'mid'} animate-in${isStarred(lead.company) ? ' is-starred' : ''}" data-company="${htmlAttr(lead.company)}" style="animation-delay:${displayIdx * 0.08}s" onclick="openLead(${lead._idx})">
      <div class="lead-header">
        <div>
          <div class="company-name">${lead.company}</div>
          <div class="lead-meta">${lead.industry || '—'} · ${lead.employees || '—'} employees</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:6px;flex-shrink:0">
          <button class="star-btn${isStarred(lead.company) ? ' starred' : ''}" data-company="${htmlAttr(lead.company)}" title="${isStarred(lead.company) ? 'Remove from saved' : 'Save lead'}"><i data-lucide="star"></i></button>
          <div class="score-badge" style="${scoreBadgeStyle(lead.score)}">${lead.score}</div>
        </div>
      </div>
      <div class="lead-tagline"><strong>Signal:</strong> ${lead.trigger}</div>
      <div class="lead-footer">
        <span class="pill">Vetted by AI</span>
        <i data-lucide="chevron-right" style="width:15px;color:var(--t2)"></i>
      </div>
    </div>`).join('');
  lucide.createIcons();
}

// ── All Leads table ──────────────────────────────────────────────
function renderLeadsTable() {
  const q = (document.getElementById('lead-search')?.value || '').toLowerCase();
  const tier = document.getElementById('lead-filter-tier')?.value || '';
  const minScore = document.getElementById('lead-filter-score')?.value || 'all';
  const sort = document.getElementById('lead-sort')?.value || 'score-desc';

  // Carry the original leads-array index so openLead always gets the right item
  let rows = leads
    .map((l, idx) => ({ ...l, _idx: idx }))
    .filter(l => {
      if (q && !l.company.toLowerCase().includes(q) && !(l.industry || '').toLowerCase().includes(q)) return false;
      if (tier && l.tier !== tier) return false;
      if (minScore !== 'all') {
        if (l.score == null) return false;
        if (+l.score < +minScore) return false;
      }
      return true;
    });

  rows.sort((a, b) => {
    if (sort === 'score-desc') return b.score - a.score;
    if (sort === 'score-asc') return a.score - b.score;
    if (sort === 'company-asc') return a.company.localeCompare(b.company);
    if (sort === 'company-desc') return b.company.localeCompare(a.company);
    return 0;
  });

  const tbody = document.getElementById('leadsTableBody');
  const empty = document.getElementById('leads-table-empty');
  const tbl = tbody?.closest('table');

  if (!rows.length) {
    if (tbl) tbl.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  if (tbl) tbl.style.display = '';
  if (empty) empty.style.display = 'none';

  const accent = { high: 'var(--green)', mid: 'var(--amber)', low: 'var(--t2)' };

  tbody.innerHTML = rows.map(l => `
    <tr onclick="openLead(${l._idx}); showSection('dashboard')" style="${isStarred(l.company) ? 'background:rgba(251,191,36,0.03)' : ''}">
      <td style="font-weight:600">
        ${l.company}
      </td>
      <td style="color:var(--t2)">${l.industry}</td>
      <td style="color:var(--t2);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.trigger}</td>
      <td style="text-align:center">
        <span style="font-weight:800;font-size:1.05rem;${scoreBadgeStyle(l.score) ? `padding:3px 8px;border-radius:7px;${scoreBadgeStyle(l.score)}` : 'color:var(--t2)'}">${l.score}</span>
      </td>
      <td style="text-align:center">
        <span class="pill" style="border-color:${accent[l.tier || 'mid']};color:${accent[l.tier || 'mid']}">${(l.tier || 'mid').toUpperCase()}</span>
      </td>
      <td style="text-align:center;white-space:nowrap">
        <button class="star-btn${isStarred(l.company) ? ' starred' : ''}" data-company="${htmlAttr(l.company)}" title="${isStarred(l.company) ? 'Remove from saved' : 'Save lead'}" style="margin-right:6px"><i data-lucide="star"></i></button>
        <i data-lucide="chevron-right" style="width:15px;color:var(--t2);vertical-align:middle"></i>
      </td>
    </tr>`).join('');
  lucide.createIcons();
}

// ── Saved leads section ───────────────────────────────────────────
function renderSavedLeads() {
  const container = document.getElementById('savedContainer');
  if (!container) return;

  const q    = (document.getElementById('saved-search')?.value || '').toLowerCase();
  const tier = getPillValue('saved-tier-group');
  const sort = document.getElementById('saved-sort')?.value || 'saved-desc';

  const allSaved = getStarred();
  let visible = allSaved.filter(lead => {
    if (q && !lead.company.toLowerCase().includes(q) && !(lead.industry || '').toLowerCase().includes(q)) return false;
    if (tier && lead.tier !== tier) return false;
    return true;
  });

  if (sort === 'score-desc') visible.sort((a, b) => b.score - a.score);
  else if (sort === 'score-asc') visible.sort((a, b) => a.score - b.score);
  else if (sort === 'company-asc') visible.sort((a, b) => a.company.localeCompare(b.company));
  // 'saved-desc' keeps unshift order (most recent first)

  const badge = document.getElementById('saved-count-badge');
  if (badge) badge.textContent = allSaved.length || '';

  if (!allSaved.length) {
    container.innerHTML = `
      <div style="grid-column:1/-1;padding:60px 40px;text-align:center;color:var(--t2)">
        <div style="font-size:2.2rem;margin-bottom:14px;opacity:0.4">★</div>
        <div style="font-weight:700;font-size:0.95rem;margin-bottom:6px;color:var(--t1)">No saved leads yet</div>
        <div style="font-size:0.83rem">Click the ★ on any lead card to save it here — survives data.json refreshes</div>
      </div>`;
    return;
  }

  if (!visible.length) {
    container.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--t2);font-size:0.85rem">No saved leads match your filters.</div>`;
    return;
  }

  container.innerHTML = visible.map((lead, displayIdx) => {
    const isStale = leads.findIndex(l => l.company === lead.company) === -1;
    const savedDate = lead._savedAt ? new Date(lead._savedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '';
    return `
      <div class="lead-card ${lead.tier || 'mid'} animate-in is-starred" data-saved-company="${htmlAttr(lead.company)}" style="cursor:pointer;animation-delay:${displayIdx * 0.05}s${isStale ? ';opacity:0.72' : ''}">
        <div class="lead-header">
          <div>
            <div class="company-name">${lead.company}${isStale ? ' <span style="font-size:0.65rem;color:var(--amber);font-weight:600;margin-left:4px">stale</span>' : ''}</div>
            <div class="lead-meta">${lead.industry || '—'} · ${lead.employees || '—'} employees</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:6px;flex-shrink:0">
            <button class="star-btn starred" data-company="${htmlAttr(lead.company)}" title="Remove from saved" style="padding:4px 8px;font-size:0.7rem;gap:4px"><i data-lucide="x" style="width:11px;height:11px"></i><span style="font-weight:600">Remove</span></button>
            <div class="score-badge" style="${scoreBadgeStyle(lead.score)}">${lead.score}</div>
          </div>
        </div>
        <div class="lead-tagline"><strong>Signal:</strong> ${lead.trigger}</div>
        <div class="lead-footer">
          <span class="pill" style="border-color:var(--amber);color:var(--amber)">★ Saved${savedDate ? ' · ' + savedDate : ''}</span>
          <i data-lucide="chevron-right" style="width:15px;color:var(--t2)"></i>
        </div>
      </div>`;
  }).join('');
  lucide.createIcons();
}

// Wire table controls (All Leads section only — dashboard pills use inline onclick)
setTimeout(() => {
  ['lead-search', 'lead-filter-tier', 'lead-filter-score', 'lead-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', renderLeadsTable); el.addEventListener('change', renderLeadsTable); }
  });
}, 100);

// ── Analytics ────────────────────────────────────────────────────
function renderAnalytics() {
  renderScoreChart();
  renderTierBreakdown();
  renderIndustryBreakdown();
  renderKeyMetrics();
}

function renderScoreChart() {
  const el = document.getElementById('score-chart');
  if (!el) return;
  const buckets = Array(10).fill(0);
  leads.forEach(l => { const s = Math.round(+l.score || 0); if (s >= 1 && s <= 10) buckets[s - 1]++; });
  const mx = Math.max(...buckets, 1);
  const cols = ['#374151', '#374151', '#374151', '#374151', '#374151', '#60a5fa', '#60a5fa', '#34d399', '#34d399', '#34d399'];
  el.innerHTML = buckets.map((n, i) => {
    const h = Math.round(n / mx * 100);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
      <span style="font-size:0.68rem;color:var(--t2)">${n || ''}</span>
      <div style="width:100%;min-height:4px;height:${h || 4}px;background:${cols[i]};border-radius:4px 4px 0 0;transition:height .4s"></div>
    </div>`;
  }).join('');
}

function renderTierBreakdown() {
  const el = document.getElementById('tier-breakdown');
  if (!el) return;
  const t = { high: 0, mid: 0, low: 0 };
  leads.forEach(l => { if (t[l.tier] !== undefined) t[l.tier]++; });
  const tot = leads.length || 1;
  const cfg = {
    high: { label: 'High Priority', col: 'var(--green)' },
    mid: { label: 'Mid Priority', col: 'var(--amber)' },
    low: { label: 'Low Priority', col: 'var(--t2)' },
  };
  el.innerHTML = Object.entries(t).map(([tier, n]) => {
    const pct = Math.round(n / tot * 100);
    const { label, col } = cfg[tier];
    return `<div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.83rem;">
        <span style="color:${col}">${label}</span>
        <span style="color:var(--t2)">${n} (${pct}%)</span>
      </div>
      <div style="background:var(--border);border-radius:6px;height:7px;">
        <div style="width:${pct}%;background:${col};height:7px;border-radius:6px;transition:width .5s"></div>
      </div>
    </div>`;
  }).join('');
}

function renderIndustryBreakdown() {
  const el = document.getElementById('industry-breakdown');
  if (!el) return;
  const counts = {};
  leads.forEach(l => { counts[l.industry] = (counts[l.industry] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const mx = sorted[0]?.[1] || 1;
  el.innerHTML = sorted.map(([ind, n]) => {
    const pct = Math.round(n / mx * 100);
    return `<div>
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:0.83rem;">
        <span>${ind}</span><span style="color:var(--t2)">${n}</span>
      </div>
      <div style="background:var(--border);border-radius:6px;height:5px;">
        <div style="width:${pct}%;background:var(--blue);height:5px;border-radius:6px;transition:width .5s"></div>
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--t2);font-size:0.83rem">No data yet.</p>';
}

function renderKeyMetrics() {
  const el = document.getElementById('key-metrics');
  if (!el) return;
  const tot = leads.length;
  const items = [
    ['Total Leads', tot],
    ['Average AI Score', tot ? (leads.reduce((s, l) => s + +l.score, 0) / tot).toFixed(1) : '—'],
    ['Top Score', tot ? Math.max(...leads.map(l => l.score)) : '—'],
    ['High Priority', leads.filter(l => l.tier === 'high').length],
    ['Unique Industries', new Set(leads.map(l => l.industry)).size],
  ];
  el.innerHTML = items.map(([label, val]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:0.83rem;color:var(--t2)">${label}</span>
      <span style="font-weight:800;font-size:1.05rem;color:var(--blue)">${val}</span>
    </div>`).join('');
}

// ── Integrations ─────────────────────────────────────────────────
function renderIntegrations() {
  const lp = document.getElementById('last-push-time');
  const gc = document.getElementById('github-lead-count');
  if (lp) lp.textContent = leads.length ? 'Data loaded ✓' : 'No data yet';
  if (gc) gc.textContent = leads.length;
}

// ── Lead detail modal ────────────────────────────────────────────
// Takes array index OR a full lead object (e.g. stale saved leads)
let currentLeadIdx = 0;

function openLead(idxOrLead) {
  let lead, idx;
  if (typeof idxOrLead === 'object' && idxOrLead !== null) {
    lead = idxOrLead;
    idx = leads.findIndex(l => l.company === lead.company);
    currentLeadIdx = idx; // -1 if stale, keyboard nav disabled
  } else {
    idx = idxOrLead;
    lead = leads[idx];
    if (!lead) return;
    currentLeadIdx = idx;
  }

  const hasPrev = idx > 0;
  const hasNext = idx !== -1 && idx < leads.length - 1;

  modalBody.innerHTML = `
    <!-- Modal Navigation Arrows positioned on the sides -->
    <button class="nav-btn modal-nav-left" onclick="openLead(${idx - 1})" ${!hasPrev ? 'disabled' : ''} title="Previous Lead (Left Arrow)">
      <i data-lucide="chevron-left"></i>
    </button>
    <button class="nav-btn modal-nav-right" onclick="openLead(${idx + 1})" ${!hasNext ? 'disabled' : ''} title="Next Lead (Right Arrow)">
      <i data-lucide="chevron-right"></i>
    </button>

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding:0 20px;">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap">
          <h2 style="font-size:1.8rem;font-weight:800;letter-spacing:-0.03em;">${lead.company || 'Unknown Company'}</h2>
          <button id="modal-star-btn" class="star-btn${isStarred(lead.company) ? ' starred' : ''}" data-company="${htmlAttr(lead.company)}" style="padding:6px 12px;border-radius:9px" title="${isStarred(lead.company) ? 'Remove from saved' : 'Save lead'}"><i data-lucide="star"></i><span style="font-size:0.75rem;font-weight:600;margin-left:4px">${isStarred(lead.company) ? 'Saved' : 'Save'}</span></button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${lead.industry ? `<span class="pill">${lead.industry}</span>` : ''}
          <span class="pill" style="border-color:var(--blue);color:var(--blue)">Priority: ${(lead.tier || 'mid').toUpperCase()}</span>
          ${lead.employees ? `<span class="pill">${lead.employees} employees</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--t2);margin-bottom:4px">AI Fit Score</div>
        <div style="font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;color:var(--blue);line-height:1">${lead.score || '-'}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:0 20px;">
      <div>
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--t2);margin-bottom:12px">Analysis Reasoning</div>
        <p style="line-height:1.65;font-size:0.95rem;color:var(--t1);margin-bottom:24px">${lead.description || 'No detailed analysis provided.'}</p>
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--t2);margin-bottom:12px">Growth Signal</div>
        <div style="background:var(--surface);padding:16px;border-radius:11px;border:1px solid var(--border);font-weight:600;font-size:0.9rem">
          ${lead.trigger || 'No specific trigger detected.'}
          ${lead.url ? `
            <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:0.75rem">
              ${lead.title ? `<div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;color:var(--t1)">${lead.title}</div>` : ''}
              <span style="color:var(--t2)">READ MORE AT</span> 
              <a href="${lead.url}" target="_blank" style="color:var(--blue);text-decoration:none;font-weight:700;margin-left:4px">
                ${lead.source ? lead.source.toUpperCase() : 'ORIGINAL ARTICLE'} <i data-lucide="external-link" style="width:11px;height:11px;margin-left:2px;vertical-align:-1px"></i>
              </a>
            </div>
          ` : ''}
        </div>
      </div>
      <div>
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--t2);margin-bottom:12px">AI Outreach Drafts</div>
        <div style="margin-bottom:20px">
          <div style="font-size:0.8rem;font-weight:600;margin-bottom:8px;color:var(--t1)">📧 Personalized Email</div>
          <div style="background:var(--bg);padding:16px;border-radius:11px;border:1px solid var(--border);font-size:0.82rem;white-space:pre-wrap;color:var(--t2);line-height:1.6">${lead.outreach_email || 'No email draft available.'}</div>
        </div>
        <div>
          <div style="font-size:0.8rem;font-weight:600;margin-bottom:8px;color:var(--t1)">📞 Phone Opener</div>
          <div style="background:var(--bg);padding:16px;border-radius:11px;border:1px solid var(--border);font-size:0.82rem;color:var(--t2);line-height:1.6">${lead.call_opener || 'No phone opener available.'}</div>
        </div>
      </div>
    </div>`;
  modalOverlay.style.display = 'flex';
  lucide.createIcons();
}

if (closeModalBtn) closeModalBtn.onclick = () => { modalOverlay.style.display = 'none'; };
window.onclick = e => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; };

// Keyboard navigation for modal
window.addEventListener('keydown', (e) => {
  if (modalOverlay.style.display === 'flex') {
    if (e.key === 'ArrowRight' && currentLeadIdx < leads.length - 1) {
      openLead(currentLeadIdx + 1);
    } else if (e.key === 'ArrowLeft' && currentLeadIdx > 0) {
      openLead(currentLeadIdx - 1);
    } else if (e.key === 'Escape') {
      modalOverlay.style.display = 'none';
    }
  }
});

// ── Clear All Leads ───────────────────────────────────────────────
async function clearLeads() {
  if (!confirm('Clear all leads from data.json? This cannot be undone.')) return;

  const btn = document.getElementById('clearLeadsBtn');
  const originalHTML = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i> Clearing…';
  lucide.createIcons();

  try {
    const OWNER = 'adamwilss';
    const REPO = 'lead-intel-prototype';
    const FILE = 'data.json';
    const TOKEN = localStorage.getItem('gh-token');

    if (!TOKEN) {
      // Prompt for token once and store in localStorage
      const t = prompt(
        'Enter your GitHub Personal Access Token to push changes.\n' +
        '(It will be stored locally in your browser only.)'
      );
      if (!t) { resetBtn(); return; }
      localStorage.setItem('gh-token', t.trim());
      return clearLeads(); // retry with token
    }

    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };

    // Get current SHA
    const getRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`,
      { headers }
    );
    if (!getRes.ok) throw new Error(`GitHub GET failed: ${getRes.status}`);
    const { sha } = await getRes.json();

    // Push [] as base64
    const empty64 = btoa('[]');
    const putRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ message: 'chore: clear all leads', content: empty64, sha }),
      }
    );
    if (!putRes.ok) throw new Error(`GitHub PUT failed: ${putRes.status}`);

    // Update UI immediately
    leads = [];
    renderLeads();
    updateStats();
    btn.innerHTML = '<i data-lucide="check"></i> Cleared';
    lucide.createIcons();
    setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false; lucide.createIcons(); }, 2000);

  } catch (err) {
    console.error('Clear failed:', err);
    // Token might be invalid — clear it so user can re-enter
    if (err.message.includes('401') || err.message.includes('403')) {
      localStorage.removeItem('gh-token');
      alert('GitHub token was invalid or expired. It has been cleared — try again.');
    } else {
      alert('Failed to clear leads: ' + err.message);
    }
    resetBtn();
  }

  function resetBtn() {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    lucide.createIcons();
  }
}

// ── Saved card click delegation ───────────────────────────────────
document.addEventListener('click', function(e) {
  if (e.target.closest('.star-btn')) return; // handled separately
  const card = e.target.closest('[data-saved-company]');
  if (!card) return;
  const company = card.dataset.savedCompany;
  const saved = getStarred();
  const lead = saved.find(l => l.company === company);
  if (lead) openLead(lead);
});

// ── Star button delegation (capture phase so it fires before card onclick) ──
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.star-btn');
  if (!btn || !btn.dataset.company) return;
  e.stopPropagation();
  toggleStar(btn.dataset.company, e);
}, true);

// ── Boot ─────────────────────────────────────────────────────────
loadData();
initTheme();

const clearBtn = document.getElementById('clearLeadsBtn');
if (clearBtn) clearBtn.addEventListener('click', clearLeads);

