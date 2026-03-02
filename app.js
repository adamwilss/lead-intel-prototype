let leads = [];

// ── DOM refs ─────────────────────────────────────────────────────
const leadsContainer = document.getElementById('leadsContainer');
const modalOverlay = document.getElementById('modalOverlay');
const closeModal = document.getElementById('closeModal');
const modalBody = document.getElementById('modalBody');

// ── Navigation ───────────────────────────────────────────────────
const sections = ['dashboard', 'all-leads', 'analytics', 'integrations'];

function showSection(name) {
  sections.forEach(s => {
    document.getElementById('section-' + s).style.display = s === name ? '' : 'none';
  });
  document.querySelectorAll('.nav-item[data-section]').forEach(el => {
    el.classList.toggle('active', el.dataset.section === name);
  });
  if (name === 'all-leads') renderLeadsTable();
  if (name === 'analytics') renderAnalytics();
  if (name === 'integrations') renderIntegrations();
}

document.querySelectorAll('.nav-item[data-section]').forEach(el => {
  el.addEventListener('click', () => showSection(el.dataset.section));
});

// ── Data Loading ─────────────────────────────────────────────────
async function loadData() {
  try {
    // Flatten in case n8n pushes nested arrays
    const res = await fetch('data.json?t=' + Date.now());
    const raw = await res.json();
    leads = raw.flat(Infinity).filter(l => l && typeof l === 'object' && l.company);
    renderLeads();
    updateStats();
  } catch (err) {
    console.error('Error loading leads:', err);
    leadsContainer.innerHTML = `<p style="padding:40px;color:var(--critical)">Error loading lead data. Ensure data.json exists.</p>`;
  }
}

// ── Stats (Dashboard) ────────────────────────────────────────────
function updateStats() {
  const total = leads.length;
  const high = leads.filter(l => l.tier === 'high').length;
  const avg = total ? (leads.reduce((s, l) => s + Number(l.score || 0), 0) / total).toFixed(1) : '—';
  const industries = new Set(leads.map(l => l.industry)).size;
  setText('stat-total', total);
  setText('stat-high', high);
  setText('stat-avg', avg);
  setText('stat-industries', industries);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Dashboard Lead Cards ─────────────────────────────────────────
function renderLeads() {
  if (!leads.length) {
    leadsContainer.innerHTML = `<p style="padding:40px;color:var(--text-secondary)">No leads yet — n8n will populate this automatically.</p>`;
    return;
  }
  leadsContainer.innerHTML = leads.map((lead, i) => `
    <div class="lead-card ${lead.tier || 'mid'} animate-in" style="animation-delay:${i * 0.1}s" onclick="openLead(${lead.id})">
      <div class="lead-header">
        <div>
          <div class="company-name">${lead.company}</div>
          <div class="lead-meta">${lead.industry} • ${lead.employees} employees</div>
        </div>
        <div class="score-badge">${lead.score}</div>
      </div>
      <div class="lead-tagline">
        <strong style="color:var(--accent-blue)">Signal:</strong> ${lead.trigger}
      </div>
      <div class="lead-footer">
        <span class="pill">Vetted by AI</span>
        <i data-lucide="chevron-right" style="width:16px;color:var(--text-secondary)"></i>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

// ── All Leads Table ──────────────────────────────────────────────
function renderLeadsTable() {
  const search = (document.getElementById('lead-search')?.value || '').toLowerCase();
  const tierFilter = document.getElementById('lead-filter-tier')?.value || '';
  const sortVal = document.getElementById('lead-sort')?.value || 'score-desc';

  let filtered = leads.filter(l => {
    const matchSearch = !search || l.company.toLowerCase().includes(search) || l.industry.toLowerCase().includes(search);
    const matchTier = !tierFilter || l.tier === tierFilter;
    return matchSearch && matchTier;
  });

  filtered.sort((a, b) => {
    if (sortVal === 'score-desc') return b.score - a.score;
    if (sortVal === 'score-asc') return a.score - b.score;
    if (sortVal === 'company-asc') return a.company.localeCompare(b.company);
    if (sortVal === 'company-desc') return b.company.localeCompare(a.company);
    return 0;
  });

  const tbody = document.getElementById('leadsTableBody');
  const empty = document.getElementById('leads-table-empty');
  const table = tbody?.closest('table');

  if (!filtered.length) {
    if (table) table.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  if (table) table.style.display = '';
  if (empty) empty.style.display = 'none';

  const tierColour = { high: 'var(--success)', mid: 'var(--accent-blue)', low: 'var(--text-secondary)' };

  tbody.innerHTML = filtered.map(lead => `
    <tr style="border-bottom:1px solid var(--border-color); cursor:pointer; transition:background 0.15s;" 
        onmouseenter="this.style.background='rgba(255,255,255,0.03)'" 
        onmouseleave="this.style.background=''"
        onclick="openLead(${lead.id}); showSection('dashboard')">
      <td style="padding:16px 20px; font-weight:600;">${lead.company}</td>
      <td style="padding:16px 20px; color:var(--text-secondary);">${lead.industry}</td>
      <td style="padding:16px 20px; color:var(--text-secondary); max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${lead.trigger}</td>
      <td style="padding:16px 20px; text-align:center;">
        <span style="font-weight:700; color:var(--accent-blue); font-size:1.1rem;">${lead.score}</span>
      </td>
      <td style="padding:16px 20px; text-align:center;">
        <span class="pill" style="border-color:${tierColour[lead.tier] || 'var(--border-color)'}; color:${tierColour[lead.tier] || 'var(--text-secondary)'};">
          ${(lead.tier || 'mid').toUpperCase()}
        </span>
      </td>
      <td style="padding:16px 20px; text-align:center;">
        <i data-lucide="chevron-right" style="width:16px; color:var(--text-secondary);"></i>
      </td>
    </tr>
  `).join('');
  lucide.createIcons();
}

// Wire up search/filter/sort controls
setTimeout(() => {
  ['lead-search', 'lead-filter-tier', 'lead-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderLeadsTable);
    if (el) el.addEventListener('change', renderLeadsTable);
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
  // Bucket scores 1-10
  const buckets = Array(10).fill(0);
  leads.forEach(l => {
    const s = Math.round(Number(l.score || 0));
    if (s >= 1 && s <= 10) buckets[s - 1]++;
  });
  const maxBucket = Math.max(...buckets, 1);
  const colours = ['#374151', '#374151', '#374151', '#374151', '#374151', '#60a5fa', '#60a5fa', '#10b981', '#10b981', '#10b981'];
  el.innerHTML = buckets.map((count, i) => {
    const pct = Math.round((count / maxBucket) * 100);
    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
        <span style="font-size:0.7rem;color:var(--text-secondary);">${count}</span>
        <div style="width:100%;height:${pct || 4}px;background:${colours[i]};border-radius:4px 4px 0 0;min-height:4px;transition:height 0.4s ease;"></div>
        <span style="font-size:0.7rem;color:var(--text-secondary);">${i + 1}</span>
      </div>
    `;
  }).join('');
}

function renderTierBreakdown() {
  const el = document.getElementById('tier-breakdown');
  if (!el) return;
  const tiers = { high: 0, mid: 0, low: 0 };
  leads.forEach(l => { if (tiers[l.tier] !== undefined) tiers[l.tier]++; });
  const total = leads.length || 1;
  const config = {
    high: { label: 'High Priority', colour: 'var(--success)' },
    mid: { label: 'Mid Priority', colour: 'var(--accent-blue)' },
    low: { label: 'Low Priority', colour: 'var(--text-secondary)' },
  };
  el.innerHTML = Object.entries(tiers).map(([tier, count]) => {
    const pct = Math.round((count / total) * 100);
    const { label, colour } = config[tier];
    return `
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem;">
          <span style="color:${colour};">${label}</span>
          <span style="color:var(--text-secondary);">${count} (${pct}%)</span>
        </div>
        <div style="background:var(--border-color);border-radius:6px;height:8px;">
          <div style="width:${pct}%;background:${colour};height:8px;border-radius:6px;transition:width 0.5s ease;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderIndustryBreakdown() {
  const el = document.getElementById('industry-breakdown');
  if (!el) return;
  const counts = {};
  leads.forEach(l => { counts[l.industry] = (counts[l.industry] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = sorted[0]?.[1] || 1;
  el.innerHTML = sorted.map(([industry, count]) => {
    const pct = Math.round((count / max) * 100);
    return `
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem;">
          <span>${industry}</span>
          <span style="color:var(--text-secondary);">${count}</span>
        </div>
        <div style="background:var(--border-color);border-radius:6px;height:6px;">
          <div style="width:${pct}%;background:var(--accent-blue);height:6px;border-radius:6px;transition:width 0.5s ease;"></div>
        </div>
      </div>
    `;
  }).join('') || '<p style="color:var(--text-secondary);font-size:0.85rem;">No data yet.</p>';
}

function renderKeyMetrics() {
  const el = document.getElementById('key-metrics');
  if (!el) return;
  const total = leads.length;
  const avgScore = total ? (leads.reduce((s, l) => s + Number(l.score || 0), 0) / total).toFixed(1) : '—';
  const topScore = total ? Math.max(...leads.map(l => l.score)) : '—';
  const highCount = leads.filter(l => l.tier === 'high').length;
  const metrics = [
    { label: 'Total Leads in Pipeline', value: total },
    { label: 'Average AI Score', value: avgScore },
    { label: 'Top Score', value: topScore },
    { label: 'High Priority Leads', value: highCount },
    { label: 'Unique Industries', value: new Set(leads.map(l => l.industry)).size },
  ];
  el.innerHTML = metrics.map(m => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-color);">
      <span style="font-size:0.85rem;color:var(--text-secondary);">${m.label}</span>
      <span style="font-weight:700;font-size:1.1rem;color:var(--accent-blue);">${m.value}</span>
    </div>
  `).join('');
}

// ── Integrations ─────────────────────────────────────────────────
function renderIntegrations() {
  // Last push time — use most recent lead's timestamp if present, else n/a
  const lastPushEl = document.getElementById('last-push-time');
  const countEl = document.getElementById('github-lead-count');
  if (lastPushEl) lastPushEl.textContent = leads.length ? 'Data loaded ✓' : 'No data yet';
  if (countEl) countEl.textContent = leads.length;
}

// ── Lead Detail Modal ────────────────────────────────────────────
function openLead(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;
  modalBody.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
      <div>
        <h2 style="font-size:2rem;margin-bottom:8px;">${lead.company}</h2>
        <div style="display:flex;gap:8px;">
          <span class="pill">${lead.industry}</span>
          <span class="pill" style="border-color:var(--accent-blue);color:var(--accent-blue)">Priority: ${(lead.tier || 'mid').toUpperCase()}</span>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.875rem;color:var(--text-secondary)">AI FIT SCORE</div>
        <div style="font-size:2.5rem;font-weight:700;color:var(--accent-blue)">${lead.score}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
      <div>
        <h3 style="margin-bottom:16px;color:var(--text-secondary);text-transform:uppercase;font-size:0.75rem;letter-spacing:0.1em;">Analysis Reasoning</h3>
        <p style="line-height:1.6;font-size:1.1rem;margin-bottom:32px;">${lead.description}</p>
        <h3 style="margin-bottom:16px;color:var(--text-secondary);text-transform:uppercase;font-size:0.75rem;letter-spacing:0.1em;">Growth Signal</h3>
        <div style="background:var(--card-bg);padding:20px;border-radius:12px;border:1px solid var(--border-color);">
          <strong>${lead.trigger}</strong>
        </div>
      </div>
      <div>
        <h3 style="margin-bottom:16px;color:var(--text-secondary);text-transform:uppercase;font-size:0.75rem;letter-spacing:0.1em;">AI Outreach Drafts</h3>
        <div style="margin-bottom:24px;">
          <div style="font-size:0.9rem;margin-bottom:8px;font-weight:600;">Personalized Email</div>
          <div style="background:#1a1a1e;padding:20px;border-radius:12px;border:1px solid var(--border-color);font-size:0.9rem;white-space:pre-wrap;color:var(--text-secondary);">${lead.email}</div>
        </div>
        <div>
          <div style="font-size:0.9rem;margin-bottom:8px;font-weight:600;">Phone Conversation Starter</div>
          <div style="background:#1a1a1e;padding:20px;border-radius:12px;border:1px solid var(--border-color);font-size:0.9rem;color:var(--text-secondary);line-height:1.5;">"${lead.phone}"</div>
        </div>
      </div>
    </div>
  `;
  modalOverlay.style.display = 'flex';
  lucide.createIcons();
}

closeModal.onclick = () => { modalOverlay.style.display = 'none'; };
window.onclick = e => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; };

// ── Boot ─────────────────────────────────────────────────────────
loadData();
