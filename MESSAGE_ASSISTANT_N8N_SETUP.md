# Message Assistant (AI Chatbot) – n8n webhook setup

This guide sets up an n8n workflow so the **AI Assistant** on the Generate Leads page can answer user questions using **all generated leads** plus the user’s message. The app sends the same data to your webhook every time the user sends a message; you use it (e.g. with OpenAI) to return a reply.

---

## 1. What the app sends to your webhook

- **Endpoint:** The app calls **your** n8n webhook URL (you set it in `.env` as `N8N_MESSAGE_ASSISTANT_WEBHOOK`).
- **Flow:** Browser → `POST /api/message-assistant` (your backend) → your n8n webhook. The backend proxies the request so the webhook URL is never exposed to the client.

**Request (from app to your webhook):**

- **Method:** `POST`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**

```json
{
  "message": "Write personalized LinkedIn outreach messages for these leads.",
  "leads": [
    {
      "id": "lead-1",
      "companyName": "Acme Inc",
      "contactName": "Jane Smith",
      "jobTitle": "Marketing Director",
      "industry": "Marketing & Advertising",
      "email": "jane@acme.com",
      "phone": "+1 555 123 4567",
      "country": "United States",
      "companyDomain": "acme.com",
      "linkedin": "https://linkedin.com/in/janesmith",
      "status": "New",
      "createdAt": "2026-03-05T18:46:59.513Z"
    }
  ],
  "conversation_id": "conv-1730737019513",
  "timestamp": "2026-03-05T19:30:00.000Z"
}
```

- **`message`** (string): The user’s question or request (e.g. “Write cold emails for these leads”, “Suggest first lines for LinkedIn”).
- **`leads`** (array): **All** leads from the current “Generate Leads” results. Each item can include:
  - `id`, `companyName`, `contactName`, `jobTitle`, `industry`
  - `email`, `phone`, `country`
  - `companyDomain`, `linkedin`, `status`, `createdAt`

If the user hasn’t generated leads yet, `leads` may be an empty array. Your workflow can still reply (e.g. “Generate some leads first, then I can tailor messages.”).

- **`conversation_id`** (string): Same for all messages in one chat session (same browser tab). Use in n8n to group or log by conversation. If the client doesn’t send one, the server generates one per request (e.g. `conv-<timestamp>`).
- **`timestamp`** (string): ISO 8601 time when the request was received (e.g. `2026-03-05T19:30:00.000Z`). Useful for logging and ordering.

---

## 2. What your webhook must return

The app expects a **JSON** response so it can show the assistant’s reply in the chat.

**Simplest (recommended):**

```json
{
  "reply": "Here are three personalized LinkedIn message ideas for your leads:\n\n1. For Jane at Acme..."
}
```

The app looks for the reply text in this order:

1. Top-level: `reply`, `output`, `message`, `response`, or `text`
2. If the response is an array: first item’s `reply` / `output` / `message` / etc. (or under `.json` if present)
3. If the response has `data` array: first element’s same fields
4. If none of the above: the **raw response body** is used as plain text

So you can return any of:

- `{ "reply": "Your text here" }`
- `{ "output": "Your text here" }`
- `{ "message": "Your text here" }`
- Or plain text (e.g. n8n “Respond to Webhook” with **Body** = plain text)

**Status codes:**

- **200:** Reply is shown in the chatbot.
- **Non-2xx (e.g. 502):** The app shows an error (e.g. “Message assistant failed” or your `error` / `message` field).

---

## 3. Prompt and step-by-step build guide

### 3.1 System prompt (for the AI)

Use this as the **system** or **instruction** message so the AI generates only what the user asked for and uses conversation history:

```
You are an expert B2B outreach and sales copywriter specializing in LinkedIn DMs, cold emails, and follow-up messages. You generate high-converting outreach based ONLY on the leads provided in the context.

OFF-TOPIC RULE (check this FIRST):
If the user's message has NOTHING to do with leads, outreach, cold email, LinkedIn DMs, follow-ups, or this dashboard (e.g. "fix my plumbing", "recipe for pasta", "how do I fix my car", "what's the weather", general life advice, hobbies, unrelated topics), you MUST NOT generate any emails, DMs, or follow-ups. Return ONLY this JSON shape with a short redirect string:
{ "reply": "I'm here to help with outreach for your leads—cold emails, LinkedIn DMs, or follow-ups. Generate leads on this page, then ask for the type of message you need.", "followups": [] }
The "reply" must be a plain string, never an object with "type": "personalized_messages" or "templates". Do not use the leads in context to invent outreach for an unrelated request.

STRICT RULES:
- Use ONLY information from the provided leads when generating outreach. Do NOT invent companies, roles, industries, or personal details. If a lead field is missing, do not guess it.
- Personalize using the lead's name, company, role, or industry when available. Keep messages natural, concise, and conversational. Avoid spammy or exaggerated language.

WHAT TO GENERATE (only when the user's request is about outreach/leads; decide from USER'S REQUEST and CONVERSATION HISTORY):
- If the user asks only for "email" / "cold email" / "emails" → generate ONLY cold email (subject + body) per lead.
- If the user asks only for "LinkedIn" / "LinkedIn DM" / "DMs" → generate ONLY LinkedIn DM per lead.
- If the user asks only for "follow-up" / "follow up" → generate ONLY follow-up messages (see follow-up rule below).
- If the user is vague ("help me reach out", "write something for these leads", "outreach", "messages") or asks for "all" / "everything" → generate ALL THREE: LinkedIn DM, cold email, and follow-up for each lead.
- If the user explicitly asks for "templates" or "campaign templates" → generate reusable templates with placeholders (e.g. {{name}}, {{company}}, {{role}}) and NO per-lead list (see template format below).

FOLLOW-UP RULE:
When the user asks for follow-up messages, use CONVERSATION HISTORY to find the previous email or LinkedIn DM that was sent (or that you generated) for that lead. If you find it, write a follow-up that explicitly references that first touch (e.g. "Following up on my email from last week…"). If you do NOT find any previous message in the conversation, do NOT invent one. Instead reply in JSON with a short message asking the user to paste the email or LinkedIn DM they sent to the lead(s), so you can write a relevant follow-up. Once they provide it in a later message, generate the follow-ups using that.

INPUT:
You receive: message (current user request), context (formatted leads), history (conversation history). Prioritize leadsSimple / context for lead data.

OUTPUT:
Return valid JSON only. No explanations outside the JSON.

When you have leads and generate personalized content, use this shape. Include ONLY the channels the user asked for (e.g. if they asked only for email, each lead has only "cold_email", not "linkedin_dm" or "follow_up"):

{
  "reply": {
    "type": "personalized_messages",
    "leads": [
      {
        "name": "Lead Name",
        "company": "Company Name",
        "linkedin_dm": "...",
        "cold_email": { "subject": "...", "body": "..." },
        "follow_up": "..."
      }
    ]
  },
  "followups": ["Optional follow-up question", "Optional second question"]
}

Omit any of linkedin_dm, cold_email, or follow_up per lead when that channel was not requested.

When the user asked for TEMPLATES, use this shape (one template per channel requested, with placeholders like {{name}}, {{company}}, {{role}}, {{industry}}):

{
  "reply": {
    "type": "templates",
    "linkedin_dm_template": "...",
    "cold_email_template": { "subject": "...", "body": "..." },
    "follow_up_template": "..."
  },
  "followups": ["Optional follow-up question"]
}

Omit any of linkedin_dm_template, cold_email_template, follow_up_template if that channel was not requested.

When NO LEADS are provided:

{
  "reply": "No leads were provided. Please generate or import leads first before creating outreach messages.",
  "followups": ["Would you like help generating leads?", "What industry or country should the leads be from?"]
}

When the user is OFF-TOPIC (see OFF-TOPIC RULE at the top): "reply" MUST be a plain string redirect only. Do NOT output personalized_messages or templates. Example: { "reply": "I'm here to help with outreach for your leads—cold emails, LinkedIn DMs, or follow-ups. Generate leads on this page, then ask for the type of message you need.", "followups": [] }

FOLLOWUPS ARRAY:
Include 1–2 short suggested next questions when it makes sense (e.g. if you generated only emails, suggest "Want LinkedIn DMs or follow-ups for these leads?"; if you generated all, you can suggest "Want reusable templates instead?" or skip). Do not always add followups; only when helpful.

Always use the same "leads" array structure even for one lead (one item in the array).
```

### 3.2 User prompt (what you send to the AI)

Build the **user** message from the Normalize Input node so the AI gets context, history, and the current request. In the OpenAI node, set the **user message** to:

```
Context:
{{ $json.context }}

Conversation History:
{{ $json.history }}

User Question:
{{ $json.message }}
```

- **context** = formatted leads from Normalize Input. If none, it will say "No leads provided…".
- **history** = previous turns in the conversation (if you pass it from the app or store it in n8n).

- **message** = current user message (e.g. "Write cold emails for these leads" or "Just LinkedIn DMs").

### 3.3 Flow: Webhook → Normalize Input → OpenAI → Parse Response → Respond to Webhook

This flow matches the pattern you described: webhook with `body` (message, leads, conversation_id, timestamp) → **Code (Normalize Input)** → **OpenAI** (context + history + message, JSON reply) → **Code (Parse Response)** → **Respond to Webhook**.

---

### 3.4 Step-by-step build in n8n

**Step 1 – Webhook**

1. Add trigger **Webhook**.
2. **HTTP Method:** POST.
3. **Path:** `message-assistant` (or any path; note the full URL).
4. **Respond:** **When last node finishes**.
5. Save. Copy the **Production** URL into `.env` as `N8N_MESSAGE_ASSISTANT_WEBHOOK`.

**Step 2 – Code: Normalize Input**

1. Add a **Code** node; name it **Normalize Input**.
2. **Mode:** Run Once for All Items.
3. Paste the script from **3.6 Code 1 – Normalize Input** below.
4. Output: one item with `message`, `context`, `history` for the OpenAI node.

**Step 3 – OpenAI**

1. Add **OpenAI** (Chat/Message) after **Normalize Input**.
2. **Model:** e.g. `gpt-4o-mini` or `gpt-4o`.
3. **Credentials:** Your OpenAI API key.
4. **System prompt:** Use the text in **3.5 System + user prompt block** below.
5. **User prompt:** `Context:\n{{ $json.context }}\n\nConversation History:\n{{ $json.history }}\n\nUser Question:\n{{ $json.message }}`

**Step 4 – Code: Parse Response**

1. Add another **Code** node; name it **Parse Response**.
2. **Mode:** Run Once for All Items.
3. Paste the script from **3.7 Code 2 – Parse Response** below.
4. Output: one item with `reply` (string).

**Step 5 – Respond to Webhook**

1. Add **Respond to Webhook** after **Parse Response**.
2. **Respond With:** JSON.
3. **Body:** `{ "reply": "{{ $json.reply }}" }`

**Step 6 – Connect and test**

1. Connect: **Webhook** → **Normalize Input** → **OpenAI** → **Parse Response** → **Respond to Webhook**.
2. Activate the workflow (Production).
3. In your app: Generate leads, open AI Assistant, send e.g. “Generate personalized LinkedIn DMs for these leads.”
4. In n8n: Confirm webhook receives `body.message`, `body.leads`, `body.conversation_id`, `body.timestamp`; final response has `reply` with the AI text.

---

### 3.5 System + user prompt block (for OpenAI node)

Use the full system prompt from **section 3.1** (paste the entire block into the OpenAI node system / instruction field).

**User prompt** in the OpenAI node: use the template from **section 3.2** so the node receives context, history, and message from the Normalize Input node:

- `Context:\n{{ $json.context }}\n\nConversation History:\n{{ $json.history }}\n\nUser Question:\n{{ $json.message }}`

**Note:** The app does not send `history` in the request body by default. In Normalize Input, `history` is set from `body.history` (empty if not provided). To use conversation history, store messages keyed by `conversation_id` (e.g. in n8n memory or a database) and pass the last N turns into `history` in the payload to the OpenAI node.

---

### 3.6 Code 1 – Normalize Input (enhanced)

Webhook output is often `[ { body: {...}, headers, params, ... } ]`. This script reads `body.message` and `body.leads`, builds a **rich `context`** (one block per lead with labeled fields), a **`leadsSimple`** array for downstream use, and outputs `message`, `context`, `history`, and `leadsSimple` for the OpenAI node (and any other nodes).

**Enhancements:**
- **Context:** Each lead is a small block with Name, Company, Title, Industry, Email, LinkedIn, Country so the AI has full detail and can personalize by lead.
- **leadsSimple:** Array of `{ name, company, title, industry, linkedin, email }` for easy use in other nodes or prompts.

```javascript
// Webhook output: body at raw.body or raw
const raw = $input.first().json;
const body = raw.body ?? raw;

const message = body.message || '';
const leads = Array.isArray(body.leads) ? body.leads : [];
const history = Array.isArray(body.history) ? body.history : [];
const MAX_LEADS = 80;
const slice = leads.slice(0, MAX_LEADS);

// Simple shape for downstream: { name, company, title, industry, linkedin, email }
const leadsSimple = slice.map((l) => ({
  name: l.contactName || l.name || '',
  company: l.companyName || l.company || '',
  title: l.jobTitle || l.title || '',
  industry: l.industry || '',
  linkedin: l.linkedin || '',
  email: l.email || ''
}));

// Rich context: one block per lead with labeled fields (better for AI to personalize)
function leadBlock(l, i) {
  const name = l.contactName || l.name || '';
  const company = l.companyName || l.company || '';
  const title = l.jobTitle || l.title || '';
  const industry = l.industry || '';
  const email = l.email || '';
  const linkedin = l.linkedin || '';
  const country = l.country || '';
  const lines = [
    `Lead ${i + 1}:`,
    `  Name: ${name}`,
    `  Company: ${company}`,
    `  Title: ${title}`,
    `  Industry: ${industry}`
  ];
  if (email) lines.push(`  Email: ${email}`);
  if (linkedin) lines.push(`  LinkedIn: ${linkedin}`);
  if (country) lines.push(`  Country: ${country}`);
  return lines.join('\n');
}

const context = slice.length === 0
  ? 'No leads provided. Suggest the user generate leads first.'
  : slice.map((l, i) => leadBlock(l, i)).join('\n\n');

return [{ json: { message, context, history, leadsSimple } }];
```

---

### 3.7 Code 2 – Parse Response

Extracts the reply from the OpenAI response. If the AI returns JSON with a structured `reply` (e.g. `{ type: "personalized_messages", leads: [...] }` or `{ type: "templates", ... }`), this code formats it into a single markdown string for the chat. Otherwise the string `reply` is used as-is. Outputs `{ reply }` for Respond to Webhook.

```javascript
const raw = $input.first().json;
let reply = '';
let content = raw.message?.content ?? raw.output?.[0]?.content?.[0]?.text ?? raw.text ?? raw.choices?.[0]?.message?.content;
if (typeof content !== 'string') content = content ? JSON.stringify(content) : '';

if (content.trim().startsWith('{')) {
  try {
    let parsed = JSON.parse(content);
    let r = parsed.reply;
    let followups = Array.isArray(parsed.followups) ? parsed.followups : [];

    // Handle double-encoded reply: sometimes reply is a string containing JSON
    if (typeof r === 'string' && r.trim().startsWith('{')) {
      try {
        const inner = JSON.parse(r);
        r = inner.reply;
        if (Array.isArray(inner.followups)) followups = inner.followups;
      } catch (e) { /* keep r as string */ }
    }

    if (typeof r === 'string') {
      reply = r;
    } else if (r && typeof r === 'object' && r.type === 'personalized_messages' && Array.isArray(r.leads)) {
      const parts = [];
      r.leads.forEach((lead, i) => {
        parts.push(`### ${lead.name || 'Lead'}${lead.company ? ` @ ${lead.company}` : ''}`);
        if (lead.linkedin_dm) {
          parts.push('**LinkedIn DM**\n' + lead.linkedin_dm);
        }
        if (lead.cold_email) {
          const ce = lead.cold_email;
          parts.push('**Cold Email**\nSubject: ' + (ce.subject || '') + '\n\n' + (ce.body || ''));
        }
        if (lead.follow_up) {
          parts.push('**Follow-up**\n' + lead.follow_up);
        }
        parts.push('');
      });
      reply = parts.join('\n');
      if (followups.length > 0) reply += '\n---\n*Suggested next:* ' + followups.join(' | ');
    } else if (r && typeof r === 'object' && r.type === 'templates') {
      const parts = [];
      if (r.linkedin_dm_template) parts.push('### LinkedIn DM template\n' + r.linkedin_dm_template);
      if (r.cold_email_template) {
        const ce = r.cold_email_template;
        parts.push('### Cold email template\n**Subject:** ' + (ce.subject || '') + '\n\n' + (ce.body || ''));
      }
      if (r.follow_up_template) parts.push('### Follow-up template\n' + r.follow_up_template);
      reply = parts.join('\n\n');
      if (followups.length > 0) reply += '\n---\n*Suggested next:* ' + followups.join(' | ');
    } else {
      reply = r ? (typeof r === 'string' ? r : JSON.stringify(r)) : content;
    }
  } catch (e) {
    reply = content;
  }
} else if (content) {
  reply = content;
} else {
  reply = typeof raw === 'string' ? raw : JSON.stringify(raw);
}

return [{ json: { reply: reply || 'No response generated.' } }];
```

---

## 4. Environment variable (recap)

In your project **`.env`** (same place as other n8n webhooks):

```env
# Message Assistant: POST { message, leads } – used for AI outreach suggestions
N8N_MESSAGE_ASSISTANT_WEBHOOK=https://your-n8n-instance.com/webhook/message-assistant
```

- Use the **Production** webhook URL from n8n (with “Respond when last node finishes” or manual “Respond to Webhook”).
- Restart the app after changing `.env`.

If this is missing or invalid, the UI will show: *“Message assistant webhook is not configured. Add N8N_MESSAGE_ASSISTANT_WEBHOOK to .env.”*

---

## 5. n8n workflow outline

1. **Webhook** – POST, receives `{ message, leads }`. **Respond:** When last node finishes.
2. **Code (optional)** – Build a prompt string: summarize leads (e.g. first 50) + user `message` for the AI.
3. **OpenAI** (or other AI node) – Send the prompt, get a completion.
4. **Respond to Webhook** – Return `{ "reply": "<AI response text>" }`.

You can add more nodes (e.g. limit leads, format the list, or branch by `message`), but the minimum is: **Webhook → AI → Respond to Webhook**.

---

## 6. Node-by-node setup (reference)

### 6.1 Webhook

- **HTTP Method:** POST  
- **Path:** e.g. `message-assistant`  
- **Respond:** **When last node finishes** (so the webhook waits for the AI and then returns the reply).  
- Copy the **Production** URL (e.g. `https://your-n8n.com/webhook/message-assistant`) into `.env` as `N8N_MESSAGE_ASSISTANT_WEBHOOK`.

---

### 6.2 Code: Build prompt from `message` + `leads`

Add a **Code** node that runs **once** and builds one object with a `prompt` (and optionally a short `leadsSummary`) for the next node.

**Mode:** Run Once for All Items.

**Input:** You get one item from the Webhook: `$input.first().json` has `message` and `leads`.

Example:

```javascript
const item = $input.first().json;
const message = item.message || '';
const leads = Array.isArray(item.leads) ? item.leads : [];

// Optional: limit to first 50 leads so the prompt doesn’t get huge
const slice = leads.slice(0, 50);

function row(l) {
  return [
    l.companyName || '',
    l.contactName || '',
    l.jobTitle || '',
    l.industry || '',
    l.email || ''
  ].filter(Boolean).join(' | ');
}

const leadsSummary = slice.length === 0
  ? 'No leads provided.'
  : slice.map((l, i) => `${i + 1}. ${row(l)}`).join('\n');

const prompt = `You are an outreach expert. Below are leads (company, contact, job title, industry, email). Use them to answer the user's request. If there are no leads, say so and suggest they generate leads first.

LEADS:
${leadsSummary}

USER REQUEST:
${message}

Provide a helpful, actionable response. Use clear formatting (e.g. bullet points or numbered list).`;

return [{ json: { prompt, message, leadsCount: leads.length } }];
```

- **Output:** One item with `prompt`, `message`, and `leadsCount`. The next node (e.g. OpenAI) will use `prompt`.

---

### 6.3 OpenAI (or other AI)

- **Resource:** Chat (Completion).
- **Model:** e.g. `gpt-4o-mini` or `gpt-4o`.
- **Prompt / Message:** Use the prompt from the Code node, e.g. `{{ $json.prompt }}`.
- **Output:** The node returns the AI text (e.g. in `message.content` or similar, depending on the node).

---

### 6.4 Respond to Webhook

You must return a **single** JSON object with a `reply` (or equivalent) field so the app can show it in the chat.

**Option A – From OpenAI node:**

If your OpenAI node outputs the text in something like `$json.message.content` or `$json.text`:

- Add a **Respond to Webhook** node.
- **Respond With:** JSON.
- **Body:**  
  `{ "reply": "{{ $json.message.content }}" }`  
  (adjust the path to match your AI node’s output, e.g. `$json.text` or `$json.reply`).

**Option B – Code before Respond to Webhook:**

If the AI node returns a different structure, add a **Code** node that normalizes it:

```javascript
const item = $input.first().json;
const text = item.message?.content
  || item.content
  || item.text
  || item.reply
  || (typeof item === 'string' ? item : '');
return [{ json: { reply: text || 'No response generated.' } }];
```

Then **Respond to Webhook** with **Body:** `{{ $json.reply }}` as a string, or **Respond With:** JSON and **Body:** `{ "reply": "{{ $json.reply }}" }` (ensure the value is a string).

**Option C – Plain text:**

If you prefer to return plain text, set **Respond to Webhook** → **Respond With:** Text and put the AI reply in the body. The app will use the raw body as the reply.

---

## 7. End-to-end flow (summary)

| Step | What happens |
|------|------------------|
| 1 | User types in AI Assistant and clicks Send. |
| 2 | App sends `POST /api/message-assistant` with `{ message, leads }` (all current generated leads). |
| 3 | Your server forwards the same body to `N8N_MESSAGE_ASSISTANT_WEBHOOK`. |
| 4 | n8n Webhook receives `message` + `leads`. |
| 5 | Code node (optional) builds a prompt from leads + message. |
| 6 | OpenAI (or other AI) returns a completion. |
| 7 | Respond to Webhook returns `{ "reply": "<text>" }` (or plain text). |
| 8 | App shows the reply in the AI Assistant chat. |

---

## 8. Security and limits

- **Auth:** The app’s `POST /api/message-assistant` is protected by your app’s auth (e.g. session). Only logged-in users hit the webhook. n8n can optionally check a secret header if you add one.
- **Size:** If you have hundreds of leads, consider summarizing or limiting to the first N (e.g. 50) in the Code node to keep the prompt and token usage under control.
- **PII:** The payload includes email/phone/names. Use HTTPS and restrict who can access your n8n instance and webhook URL.

---

## 9. Testing

1. Set `N8N_MESSAGE_ASSISTANT_WEBHOOK` in `.env` and restart the app.
2. In the app: Generate Leads so you have at least one lead.
3. Open the AI Assistant, type e.g. “Write a short LinkedIn DM for the first lead,” and send.
4. In n8n: Check the Webhook execution; you should see `message` and `leads` in the input.
5. Confirm the last node returns `{ "reply": "..." }` (or plain text). The chat should show that reply.

If the app shows “Message assistant webhook is not configured,” the env var is missing or the URL is wrong. If it shows “Message assistant failed” or “Could not reach the assistant,” check n8n logs and that the webhook responds with 200 and a body the app can parse (see section 2).
