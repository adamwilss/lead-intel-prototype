
lead generation asset
/
okay, i wanna add some new features to this thing.

10:19
What features are you thinking of adding to the ERP lead gen system?

Feel free to pick from the options above or describe something else entirely — or both!

Q: What would you like to add? (Select all that apply)
A: i wanna make the lead gne system able to search for signals from specific companies from an extremely long dataset of companies we ahve ain a sprreadhseet

10:20
Nice — so instead of (or in addition to) pulling general news, you want to feed in a specific list of target accounts and search for signals on those companies directly. That's a solid ABM (Account-Based Marketing) upgrade.

A few quick questions to nail down the approach:

Q: Where is the company list spreadsheet?
A: Google Sheets

Q: How many companies are we talking?
A: 10,000+

Q: How should the workflow process them?
A: Only new/unprocessed companies

10:21
Great — 10k+ companies is a big list, so we need to be smart about this. Here's the plan I'd recommend:

The core approach:

n8n reads from Google Sheets, pulling only rows where a "Processed" column is blank/false
For each company, it searches NewsAPI using the company name as the query
OpenAI scores the signal and generates outreach copy (same as your existing pipeline)
Results pushed to GitHub → dashboard as usual
The row in Google Sheets gets marked as "Processed" with a timestamp so it's never re-run
The 10k+ problem — rate limits: NewsAPI's free/standard tier has request limits, so you can't blast through 10k companies in one run. The solution is batching — process X companies per run (e.g. 50-100), on a schedule (e.g. every hour or daily). At 100/day you'd get through the full list in ~100 days, but realistically most companies won't have news signals so you can filter those out fast.

A few things to confirm before I write the n8n workflow out:

Q: What NewsAPI plan are you on?
A: Free (100 req/day)

Q: What columns does your Google Sheet have?
A: Just company name

Q: Where should leads with no news signal go?
A: Skip & mark processed anyway

10:22
Perfect. Here's the full plan tailored to your setup:

Batch size: 100 companies per day (matches your free NewsAPI limit exactly — 1 request per company)

Workflow logic:

Google Sheets node — reads rows where "Processed" column is empty, limits to 100
Loop over items — iterates through each company one at a time
NewsAPI HTTP Request — searches everything endpoint with company name as query
IF node — checks if any articles were returned
No articles → mark row as "Processed - No Signal" in Sheets, skip
Has articles → pass top article to OpenAI for scoring + outreach generation
OpenAI node — same prompt as your existing pipeline
GitHub node — appends lead to your JSON data file
Google Sheets update — marks row as "Processed" with timestamp
Google Sheet setup needed: You'll need to add two columns to your sheet:

Processed — blank = unprocessed, gets filled with a status
Row Number — or use the built-in row index so n8n knows which row to update
Ready to build this out? I can give you the exact n8n node-by-node configuration. One last thing to confirm:

Q: How should the workflow be triggered?
A: Once daily (scheduled)

10:22
Perfect. Here's the complete n8n workflow configuration, node by node:

n8n Workflow: Company-Targeted ERP Lead Gen
Node 1 — Schedule Trigger
Type: Schedule Trigger
Interval: Every day at a fixed time (e.g. 8:00 AM)
Node 2 — Google Sheets (Read Unprocessed)
Type: Google Sheets
Operation: Read Rows
Sheet: Your company list sheet
Filters: Where Processed column is empty
Limit: 100 rows
Return All: Off
Make sure your sheet has columns: Company Name | Processed

Node 3 — Loop Over Items
Type: Split In Batches
Batch Size: 1
This ensures each company is processed one at a time (important for rate limiting and row-level Sheet updates).

Node 4 — NewsAPI HTTP Request
Type: HTTP Request
Method: GET
URL:
https://newsapi.org/v2/everything?q={{ encodeURIComponent($json["Company Name"]) }}&sortBy=publishedAt&pageSize=3&apiKey=YOUR_NEWSAPI_KEY
Authentication: None (key in URL)
Node 5 — IF (Has Articles?)
Type: IF
Condition: {{ $json.totalResults }} greater than 0
True branch → Node 6 (OpenAI)
False branch → Node 8 (Mark No Signal)
Node 6 — Code Node (Prepare OpenAI Body)
Same pattern as your existing pipeline — build the request body with JSON.stringify to avoid newline issues:

javascript
const company = $input.item.json["Company Name"];
const articles = $input.item.json.articles;
const top = articles[0];

const prompt = `You are an ERP sales intelligence assistant. Analyze this news article about a company and determine if it represents a buying signal for ERP software.

Company: ${company}
Article Title: ${top.title}
Article Description: ${top.description || "N/A"}
Published: ${top.publishedAt}

Respond in this exact JSON format (no markdown, no backticks):
{
  "company": "${company}",
  "score": <1-10>,
  "signal_reason": "<why this is or isn't an ERP signal>",
  "article_title": "${top.title.replace(/"/g, "'")}",
  "article_url": "${top.url}",
  "email_subject": "<cold email subject line>",
  "email_body": "<3 sentence cold email>",
  "call_opener": "<one sentence cold call opener>"
}`;

return [{
  json: {
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    }),
    company: company,
    row_number: $input.item.json.row_number
  }
}];
Node 7 — OpenAI HTTP Request
Type: HTTP Request
Method: POST
URL: https://api.openai.com/v1/chat/completions
Headers:
Authorization: Bearer YOUR_OPENAI_KEY
Content-Type: application/json
Body: {{ $json.body }} (raw expression)
Node 8 — Code Node (Parse + GitHub Push)
Consolidate parsing, scoring filter, base64, and GitHub push into one node (same approach that fixed your pipeline before):

javascript
const company = $input.item.json.company;
const row_number = $input.item.json.row_number;
const raw = $input.item.json.choices[0].message.content;

let lead;
try {
  lead = JSON.parse(raw);
} catch(e) {
  return [{ json: { company, row_number, status: "parse_error" } }];
}

// Only push to GitHub if score >= 6
if (lead.score < 6) {
  return [{ json: { company, row_number, status: "low_score" } }];
}

// Fetch current file from GitHub
const repoOwner = "YOUR_GITHUB_USERNAME";
const repoName = "YOUR_REPO_NAME";
const filePath = "data/leads.json";
const token = "YOUR_GITHUB_TOKEN";

const getRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
});
const fileData = await getRes.json();
const sha = fileData.sha;
const existing = JSON.parse(Buffer.from(fileData.content, "base64").toString("utf8"));

existing.push(lead);

const updated = Buffer.from(JSON.stringify(existing, null, 2)).toString("base64");

await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ message: `Add lead: ${company}`, content: updated, sha })
});

return [{ json: { company, row_number, status: "pushed" } }];
Node 9 — Google Sheets (Mark Processed)
This node runs after both the True and False branches (connect both to it):

Type: Google Sheets
Operation: Update Row
Row Number: {{ $json.row_number }}
Update Column: Processed
Value: {{ $json.status }} — will write pushed, low_score, no_signal, or parse_error
One Thing to Set Up in Your Sheet
You need n8n to know which row to update. The easiest way is to add a row_number column to your sheet and populate it (just 1, 2, 3... down the list). Or use a Code node right after the Sheets read to inject it:

javascript
return $input.all().map((item, i) => ({
  json: {
    ...item.json,
    row_number: item.json.row_number // if column exists
  }
}));
n8n's Google Sheets node also exposes $json["_rowNumber"] automatically in some versions — worth checking yours first before adding a manual column.

Want me to help wire up any specific node, or tackle the Google Sheets OAuth connection first?

okay, i want there toi be somehow oin the final dashboard site i want there to be l;ike a bit where you can request it to go through known companies and one where you can requrest it to search the news. would that be 2 spearate workflows triggered via a webhook to the dahsboard?

10:24
Yes, exactly — two separate workflows, each with a Webhook trigger instead of a Schedule trigger. Your dashboard just makes a POST request to each webhook URL to kick them off.

Workflow 1 — "Search News" (your existing pipeline)

Webhook trigger → fetch latest ERP news from NewsAPI → OpenAI score → GitHub push
Workflow 2 — "Known Companies" (the new one)

Webhook trigger → read unprocessed rows from Google Sheets → NewsAPI per company → OpenAI score → GitHub push
Your dashboard gets two buttons. Each one calls the relevant n8n webhook URL. n8n runs the workflow and pushes results to your leads.json on GitHub as usual. The dashboard then refreshes to show the new leads.

One thing to think about for the UI:

Q: How should the dashboard handle the trigger UX?
A: Button + status indicator (running/done)

Q: How should new leads appear after a run?
A: Refresh automatically after X seconds

10:24
Great choices. Here's the full plan before we build it:

Dashboard UX flow:

User clicks "Search News" or "Search Known Companies" button
Button changes to "Running..." with a spinner, disabled so it can't be double-clicked
Dashboard POSTs to the relevant n8n webhook
After ~60 seconds (enough time for the workflow to complete), it auto-refreshes the leads data and resets the button to "Done ✓" briefly, then back to normal
The slight catch with n8n webhooks: n8n webhooks respond immediately when triggered — they don't wait for the workflow to finish. So the dashboard can't know exactly when it's done. The cleanest solution without overcomplicating things is a timed poll — after triggering, check GitHub for new leads every 10 seconds for up to 2 minutes, and refresh the display as soon as new data appears.

Ready to build. A couple of quick things I need from you:

Your two n8n webhook URLs — you'll get these when you set each workflow to use a Webhook trigger node (copy the "Production URL" from n8n). You can add these after, I'll put placeholders in for now.
Does your current app.js already have the leads fetch + cache-busting logic we built before, or do I need to rebuild the whole dashboard from scratch?
my app is good so far, it can take info from n8n and present it clearly

10:25
Perfect — so I just need to add the two trigger buttons + status indicators + auto-refresh logic to your existing app.js, rather than rebuilding anything.

Can you paste your current app.js (and index.html if relevant) so I can slot the new code in cleanly without breaking what's already working?


let leads = []; const leadsContainer = document.getElementById('leadsContainer'); const modalOverlay = document.getElementById('modalOverlay'); const closeModal = document.getElementById('closeModal'); const modalBody = document.getElementById('modalBody'); // Fetch data from data.json asy

pasted


<!DOCTYPE html> <html lang="en"> <head> <meta charset="UTF-8"> <meta name="viewport" content="width=device-width, initial-scale=1.0"> <title>LeadIntel Pro | Enterprise AI Dashboard</title> <link rel="stylesheet" href="style.css"> <link href="https://fonts.googleapis.com/

pasted

10:26
Perfect, I've got everything I need. I'll add:

Two new trigger buttons in the header ("Search News" + "Search Known Companies")
Status indicator logic (Running... spinner → Done ✓ → resets)
Auto-polling after trigger — checks for new leads every 10s for up to 2 minutes, refreshes when data changes
Let me update both files:

app.js
Code 
index.html (header section updated)
Code 
Here's what changed and what you need to do:

What's new:

Two buttons in the header — "🔍 Search News" and "🏢 Search Known Companies"
Each has a status line underneath it that shows ⏳ Running... → ✓ Done — X new leads found (or "no new leads this run")
Buttons disable during a run so nobody double-triggers
After triggering, polls data.json every 10 seconds for up to 2 minutes and auto-refreshes the leads grid the moment new data lands
Two things to do:

In app.js at the top, replace the two placeholder webhook URLs with your actual n8n Production Webhook URLs once you set up the two workflows
Make sure your n8n webhook nodes are set to respond immediately (the "Respond to Webhook" node should fire right away, not wait for the whole workflow) — this prevents the browser fetch from timing out while n8n crunches through 100 companies
why does changing it in github fail so often?

10:35
Great question — it's a well-known pain point with the GitHub Contents API. The main culprit is the SHA mismatch problem.

Here's what happens:

Every time you update a file via the GitHub API, you must pass the file's current SHA (a unique fingerprint of that file's current state). If the SHA you send doesn't exactly match what's on GitHub at that moment, the API rejects the update with a 409 Conflict or 422 Unprocessable Entity error.

This causes failures when:

1. Race conditions in your workflow — your Code node fetches the SHA, then a split second later tries to write with it, but if anything touched that file in between (another workflow run, a manual commit, GitHub's own processing delay), the SHA is already stale.

2. Parallel/overlapping workflow runs — if your n8n workflow triggers twice close together (e.g. two webhook hits), both runs fetch the same SHA, one writes successfully, and the second one fails because the SHA changed after the first write.

3. Cached SHA — if you ever stored the SHA somewhere instead of fetching it fresh every single write, it goes stale fast.

4. Network timing — the fetch-SHA → write sequence isn't atomic. There's always a tiny gap where something can change.

The fix that makes it bulletproof:

Always fetch the SHA and write in the same Code node, back to back, with no other nodes in between — which is exactly what you're already doing after the consolidation fix we did. That's the right approach.

If you're still getting occasional failures, the next level up is adding a retry loop inside the Code node:

javascript
let attempts = 0;
while (attempts < 3) {
  try {
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const fileData = await getRes.json();
    const sha = fileData.sha;
    const existing = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    existing.push(lead);
    const updated = Buffer.from(JSON.stringify(existing, null, 2)).toString('base64');

    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Add lead: ${lead.company}`, content: updated, sha })
    });

    if (putRes.ok) break; // success, exit loop
    attempts++;
    await new Promise(r => setTimeout(r, 1000)); // wait 1s before retry
  } catch (e) {
    attempts++;
    await new Promise(r => setTimeout(r, 1000));
  }
}
This re-fetches a

Claude's response was interrupted
no i mean, like when im changing it actually in github it fails and then i get an email syaing it faield

10:36
Ah — that's a completely different thing. That's GitHub Actions failing, not the API.

When you edit a file directly in GitHub, it triggers your Actions workflow (the one that probably builds/deploys your dashboard to GitHub Pages). If something in that build process errors out, GitHub sends you the failure email.

The most common reasons:

1. The Actions workflow expects a specific file format — if your data.json gets malformed (missing comma, trailing comma, wrong structure) from an n8n push, then you edit something else in GitHub, the build runs, tries to process data.json, and chokes.

2. GitHub Pages build failing — if you're using Jekyll or any static site builder, even a small thing like an unrecognised file or bad frontmatter can kill the build.

3. The workflow YAML itself has an issue — could be a flaky dependency, an expired token used in Actions, or a step that just intermittently times out.

To diagnose it properly — next time you get the email, click the link in it that says "View workflow run". It'll take you to the Actions tab and show you exactly which step failed and the full error log. That'll tell us precisely what's breaking.

Can you check your Actions tab now (github.com/your-repo/actions) and see if there are red failed runs? If you paste the error from one I can tell you exactly what's wrong.

here https://vmi2928284.contaboserver.net/webhook-test/2a4f67a6-2384-4add-bb58-be2b7b43d902

is the news webhook workflow

10:39
Got it! So that's your n8n instance running on a Contabo VPS — not GitHub Actions at all. Let me update the webhook URL in the app.js:

app.js
Code ∙ Version 2 
One thing to note — that URL has /webhook-test/ in it, which is n8n's test mode endpoint. That only works while you have the workflow open and in test mode in the n8n editor.

For the dashboard to trigger it reliably in production you'll want the production URL, which will be:

https://vmi2928284.contaboserver.net/webhook/2a4f67a6-2384-4add-bb58-be2b7b43d902
(just /webhook/ instead of /webhook-test/). That works 24/7 without the editor being open. Just make sure the workflow is activated (the toggle in the top right of the n8n workflow editor is on).

Send over the companies webhook URL when you've got it and I'll drop that in too.

https://vmi2928284.contaboserver.net/webhook/2a4f67a6-2384-4add-bb58-be2b7b43d902

youre right

10:40
app.js
Code ∙ Version 3 
Updated! Just drop the companies webhook URL in whenever you've built that workflow and I'll add it in too.

so when i press on the search the news webhook trigger it should refresh the site and run the workflow. ensuire that

10:44
Looking at the current code, the workflow does get triggered and the site does poll for new data — but let me trace through exactly what happens to make sure it's solid:

The current flow is:

Click button → POST to webhook ✓
Poll every 10s, up to 2 mins, refresh if leads.length increases ✓
The one weak point is what if the workflow runs but returns the same number of leads (e.g. all scored below 6 and got filtered out)? The poll would just run for 2 full minutes and then give up without refreshing. Also the leads grid doesn't refresh mid-poll if new ones come in gradually.

Let me tighten it up — instead of comparing lead count, compare by latest lead timestamp or a hash of the data, and also force a refresh of the grid at the end of the poll regardless:

app.js
Code ∙ Version 4 
Key improvements:

Compares full data content with JSON.stringify rather than just lead count — so it catches any change to the data, even updates to existing leads
Always refreshes the grid when the poll ends (whether new data was found or not), so the display is never stale
Smarter status messages — distinguishes between "new leads added", "data changed" (e.g. existing leads updated), and "no changes"
The only thing that could still cause a miss is if your n8n workflow takes longer than 2 minutes to complete. If that ever happens, just increase maxAttempts — e.g. 18 gives you 3 minutes.

it just says fails to trigger...

10:47
That's likely a CORS issue. Your dashboard is on GitHub Pages (a different domain) and is trying to POST to your Contabo VPS — browsers block cross-origin requests unless the server explicitly allows them.

To fix it, you need to tell n8n to allow cross-origin requests. In your n8n instance:

SSH into your Contabo VPS
Open your n8n config file (usually /etc/n8n/n8n.env or ~/.n8n/.env or set via docker environment variables)
Add these lines:
N8N_CORS_ALLOWED_ORIGINS=*
N8N_CORS_ENABLE=true
Restart n8n
If you're running n8n via Docker, add them to your docker-compose.yml under environment:

yaml
environment:
  - N8N_CORS_ALLOWED_ORIGINS=*
  - N8N_CORS_ENABLE=true
Then docker-compose down && docker-compose up -d.

To confirm it's definitely CORS — open your browser DevTools → Console right now and tell me the exact error message you see when you click the button. It'll say something like Access-Control-Allow-Origin if it's CORS, or something else if it's a different issue.

i dont have access to the contabo server backend

10:48
In that case you can't set CORS headers on n8n directly. The workaround is to route the webhook call through a proxy — something that sits between your dashboard and n8n that adds the right CORS headers.

A few options:

Actually — before going down that route, can you check one thing first. Open DevTools → Console in your browser and paste the exact error message you see when you click the button. It might not be CORS at all, and I don't want to send you on a wild goose chase.

8
Tracking Prevention blocked access to storage for <URL>.
__favicon.ico:1__   Failed to load resource: the server responded with a status of 404 ()
__lead-intel-prototype/:1__  Access to fetch at '__https://vmi2928284.contaboserver.net/webhook/2a4f67a6-2384-4add-bb58-be2b7b43d902__' from origin '__https://adamwilss.github.io__' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
__vmi2928284.contabose…bb58-be2b7b43d902:1__   Failed to load resource: net::ERR_FAILED
__app.js:41__  Webhook error: TypeError: Failed to fetch     at triggerWorkflow (__app.js:39:11__)     at HTMLButtonElement.onclick (__lead-intel-prototype/:62:142__)
[NEW] Explain Console errors by using Copilot in Edge: click to explain an error. __Learn more__Don't show again

Show more
10:48
Confirmed — it's exactly CORS. Your GitHub Pages origin (adamwilss.github.io) is being blocked from calling the Contabo server.

Easiest free fix: Cloudflare Workers. It takes about 5 minutes and you don't need to touch the VPS at all.

Here's exactly what to do:

1. Create a free Cloudflare account at cloudflare.com if you don't have one

2. Go to Workers & Pages → Create → Create Worker

3. Replace the default code with this:

javascript
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('target');

    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: request.body
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  }
}
4. Deploy it — Cloudflare gives you a URL like https://your-worker.your-name.workers.dev

5. Then I update your app.js to call the worker instead of n8n directly, passing the webhook URL as a query parameter.

Give it a go and send me the worker URL once it's deployed and I'll update the code straight away.

it doesnt have to be a webhook anyway... it can be a manual trigger

10:50
Even simpler! A manual trigger in n8n means you just open n8n and click "Execute" yourself — but that defeats the point of having a button on the dashboard.

What you probably want is to keep the button on the dashboard but trigger the workflow a different way. A couple of options:

Q: What do you actually want the button to do?
A: Schedule it to run automatically (no button needed)

10:51
Easy — so we just remove the trigger buttons entirely and let n8n handle the scheduling. The dashboard just loads and displays whatever's in data.json, which n8n updates on its schedule.

Let me clean up both files:

app.js
Code ∙ Version 5 
app.js
Code ∙ Version 6 
index.html (header section updated)
Code ∙ Version 2 
Done — both files are cleaned up. The dashboard now just loads data.json on open, and n8n handles everything else on its schedule.

Two things to set up on the n8n side if you haven't already:

News workflow — swap the Webhook trigger for a Schedule trigger, set it to whatever time you want it to run daily
Known Companies workflow — same, Schedule trigger, pick a different time so they don't overlap and hit the GitHub API simultaneously (e.g. news at 7am, companies at 8am)






Claude is AI and can make mistakes. Please double-check responses.
let leads = [];

const leadsContainer = document.getElementById('leadsContainer');
const modalOverlay = document.getElementById('modalOverlay');
const closeModal = document.getElementById('closeModal');
const modalBody = document.getElementById('modalBody');

// ── Data Loading ────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch('data.json?t=' + Date.now());
    leads = await res.json();
    renderLeads();
  } catch (err) {
    console.error('Error loading leads:', err);
    leadsContainer.innerHTML = `<p style="padding:40px;color:var(--critical)">Error loading lead data. Ensure data.json exists.</p>`;
  }
}

// ── Render ──────────────────────────────────────────────────────
function renderLeads() {
  leadsContainer.innerHTML = leads.map((lead, i) => `
    <div class="lead-card ${lead.tier} animate-in" style="animation-delay:${i * 0.1}s" onclick="openLead(${lead.id})">
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

// ── Modal ───────────────────────────────────────────────────────
function openLead(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;

  modalBody.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
      <div>
        <h2 style="font-size:2rem;margin-bottom:8px;">${lead.company}</h2>
        <div style="display:flex;gap:8px;">
          <span class="pill">${lead.industry}</span>
          <span class="pill" style="border-color:var(--accent-blue);color:var(--accent-blue)">Priority: ${lead.tier.toUpperCase()}</span>
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

    <div style="margin-top:40px;display:flex;gap:16px;">
      <button class="pill" style="background:var(--accent-blue);border:none;font-weight:600;padding:12px 24px;color:white;">Push to CRM (Salesforce)</button>
      <button class="pill" style="padding:12px 24px;">Archive Lead</button>
    </div>
  `;
  modalOverlay.style.display = 'flex';
  lucide.createIcons();
}

closeModal.onclick = () => { modalOverlay.style.display = 'none'; };
window.onclick = e => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; };

// Initial load
loadData();
