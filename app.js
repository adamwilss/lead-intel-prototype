let leads = [];

const leadsContainer = document.getElementById('leadsContainer');
const modalOverlay = document.getElementById('modalOverlay');
const closeModal = document.getElementById('closeModal');
const modalBody = document.getElementById('modalBody');

// Fetch data from data.json
async function loadData() {
    try {
        const response = await fetch('data.json?t=' + Date.now());
        leads = await response.json();
        renderLeads();
    } catch (error) {
        console.error('Error loading leads:', error);
        leadsContainer.innerHTML = `<p style="padding: 40px; color: var(--critical)">Error loading lead data. Ensure data.json exists.</p>`;
    }
}

function renderLeads() {
    leadsContainer.innerHTML = leads.map((lead, index) => `
        <div class="lead-card ${lead.tier} animate-in" style="animation-delay: ${index * 0.1}s" onclick="openLead(${lead.id})">
            <div class="lead-header">
                <div>
                    <div class="company-name">${lead.company}</div>
                    <div class="lead-meta">${lead.industry} • ${lead.employees} employees</div>
                </div>
                <div class="score-badge">${lead.score}</div>
            </div>
            <div class="lead-tagline">
                <strong style="color: var(--accent-blue)">Signal:</strong> ${lead.trigger}
            </div>
            <div class="lead-footer">
                <span class="pill">Vetted by AI</span>
                <i data-lucide="chevron-right" style="width: 16px; color: var(--text-secondary)"></i>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function openLead(id) {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;

    modalBody.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
            <div>
                <h2 style="font-size: 2rem; margin-bottom: 8px;">${lead.company}</h2>
                <div style="display: flex; gap: 8px;">
                    <span class="pill">${lead.industry}</span>
                    <span class="pill" style="border-color: var(--accent-blue); color: var(--accent-blue)">Priority: ${lead.tier.toUpperCase()}</span>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.875rem; color: var(--text-secondary)">AI FIT SCORE</div>
                <div style="font-size: 2.5rem; font-weight: 700; color: var(--accent-blue)">${lead.score}</div>
            </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 40px;">
            <div>
                <h3 style="margin-bottom: 16px; color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.1em;">Analysis Reasoning</h3>
                <p style="line-height: 1.6; font-size: 1.1rem; margin-bottom: 32px;">${lead.description}</p>
                
                <h3 style="margin-bottom: 16px; color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.1em;">Growth Signal</h3>
                <div style="background: var(--card-bg); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color);">
                    <strong>${lead.trigger}</strong>
                </div>
            </div>
            
            <div>
                <h3 style="margin-bottom: 16px; color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.1em;">AI Outreach Drafts</h3>
                <div style="margin-bottom: 24px;">
                    <div style="font-size: 0.9rem; margin-bottom: 8px; font-weight: 600;">Personalized Email</div>
                    <div style="background: #1a1a1e; padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); font-size: 0.9rem; white-space: pre-wrap; color: var(--text-secondary);">${lead.email}</div>
                </div>
                <div>
                    <div style="font-size: 0.9rem; margin-bottom: 8px; font-weight: 600;">Phone Conversation Starter</div>
                    <div style="background: #1a1a1e; padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">"${lead.phone}"</div>
                </div>
            </div>
        </div>

        <div style="margin-top: 40px; display: flex; gap: 16px;">
            <button class="pill" style="background: var(--accent-blue); border: none; font-weight: 600; padding: 12px 24px; color: white;">Push to CRM (Salesforce)</button>
            <button class="pill" style="padding: 12px 24px;">Archive Lead</button>
        </div>
    `;
    modalOverlay.style.display = 'flex';
    lucide.createIcons();
}

closeModal.onclick = () => {
    modalOverlay.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target === modalOverlay) {
        modalOverlay.style.display = 'none';
    }
};

// Initial Load
loadData();
