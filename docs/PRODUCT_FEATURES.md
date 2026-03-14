# Product Feature Guide

**Hire with Giri** — AI-powered Interview as a Service (IaaS) platform.

> **Live**: [hire-with-giri.vercel.app](https://hire-with-giri.vercel.app) | **API**: [interview-with-giri-api.fly.dev](https://interview-with-giri-api.fly.dev)

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard](#2-dashboard)
3. [Job Postings](#3-job-postings)
4. [Interview Formats](#4-interview-formats)
5. [AI Scoring & Reports](#5-ai-scoring--reports)
6. [Interview Replay & AI Highlights](#6-interview-replay--ai-highlights)
7. [Adaptive Difficulty Engine](#7-adaptive-difficulty-engine)
8. [Candidate Comparison](#8-candidate-comparison)
9. [AI Hiring Debrief](#9-ai-hiring-debrief)
10. [Ask AI — Natural Language Search](#10-ask-ai--natural-language-search)
11. [Team Collaboration & Comments](#11-team-collaboration--comments)
12. [Candidate Experience & NPS](#12-candidate-experience--nps)
13. [Analytics & Skills Insights](#13-analytics--skills-insights)
14. [Practice Mode](#14-practice-mode--interview-simulator)
15. [Scheduling & Calendar](#15-scheduling--calendar-integration)
16. [Resume Upload & Personalization](#16-resume-upload--personalization)
17. [Proctoring & Integrity](#17-proctoring--integrity-monitoring)
18. [White-Label Branding](#18-white-label-branding)
19. [Interview Templates](#19-interview-templates)
20. [Custom Scoring Rubrics](#20-custom-scoring-rubrics)
21. [ATS Integration](#21-ats-integration)
22. [Webhooks](#22-webhooks)
23. [Email Notifications](#23-email-notifications-agentmail)
24. [Billing & Subscriptions](#24-billing--subscriptions)
25. [Team Management](#25-team-management)
26. [Multi-Language Support](#26-multi-language-support)
27. [API Reference](#27-api-reference)

---

## 1. Getting Started

### Sign Up

1. Go to [hire-with-giri.vercel.app/signup](https://hire-with-giri.vercel.app/signup)
2. Enter your organization name, name, email, and password
3. Your organization, admin account, and free subscription are created instantly

### Log In

Navigate to `/login` and enter your credentials. You receive a JWT token that authenticates all subsequent requests. Roles: **Admin**, **Hiring Manager**, **Viewer**.

---

## 2. Dashboard

**Route**: `/dashboard`

Your command center. At a glance you see:

| Metric | Description |
|--------|-------------|
| Total Interviews | All-time interview count |
| Completed | Successfully completed interviews |
| Active Jobs | Currently active job postings |
| Avg Score | Average candidate score (0–10) |
| This Month | Interviews conducted this month |
| Pass Rate | Percentage of "Hire" or "Strong Hire" recommendations |

---

## 3. Job Postings

**Route**: `/dashboard/jobs`

### Create a Job

Click **New Job** and fill in:

- **Title** — e.g., "Senior Backend Engineer"
- **Role Type** — Technical, Non-Technical, or Mixed
- **Job Description** — minimum 50 characters; the AI uses this to craft relevant questions
- **Required Skills** — tag skills like Python, React, System Design
- **Interview Format** — Text, Voice, or Video
- **Interview Config**:
  - Number of questions (3–30)
  - Duration (10–120 minutes)
  - Difficulty (easy, medium, hard)
  - Include coding challenges (on/off)
  - Language (en, es, fr, hi, zh, and more)
- **Scoring Rubric** — optional custom dimensions with weights (see [Custom Scoring Rubrics](#20-custom-scoring-rubrics))

### AI Skill Extraction

Click **Extract Skills** on any job to let AI analyze the job description and suggest:
- Technical skills
- Soft skills
- Experience level
- Suggested interview questions

### Generate Interview Link

Click **Generate Link** on a job to create a unique, shareable interview URL. Options:
- Pre-fill candidate name and email
- Schedule for a future date/time (generates an ICS calendar invite)
- Send email invitation via AgentMail

### Bulk Import

Upload a CSV or Excel file to create multiple job postings at once (up to 200 rows, 5 MB limit). Download the template first to see the expected column format.

---

## 4. Interview Formats

### Text Interview

**Candidate URL**: `/interview/{token}`

The candidate enters their name and email, consents, and the AI interviewer begins a conversational interview. The AI:
- Asks one question at a time
- Adapts follow-up questions based on responses
- Probes 2–3 levels deep on significant answers
- For technical roles, acts as a pair-programming partner
- Reviews code submissions with specific, constructive feedback
- Adapts difficulty in real-time (see [Adaptive Difficulty](#7-adaptive-difficulty-engine))

### Voice Interview

**Candidate URL**: `/interview/{token}/voice`

Same AI-driven flow, but with speech:
- Candidate speaks into microphone → speech-to-text
- AI response → text-to-speech playback
- Full transcript saved for scoring

### Video Interview

**Candidate URL**: `/interview/{token}/video`

WebRTC-powered video interview via LiveKit:
- Live video and audio
- Local recording
- Transcript generation
- Candidate can switch between voice and text input

### Code Interview

**Candidate URL**: `/interview/{token}/code`

Split-screen with integrated Monaco code editor:
- Multiple language support
- Run code in a sandboxed Judge0 environment
- See stdout, stderr, and execution time
- AI reviews code submissions as a pair-programming partner
- Behavior tracking (keystrokes, pastes, tab switches) for proctoring

---

## 5. AI Scoring & Reports

**Route**: `/dashboard/interviews/{id}`

After an interview completes, the AI automatically generates a detailed candidate report.

### Report Contents

| Section | Description |
|---------|-------------|
| **Overall Score** | 0–10 composite score |
| **Skill Scores** | Per-skill scores with evidence quotes from the transcript |
| **Behavioral Scores** | Communication, problem-solving, collaboration signals |
| **AI Summary** | 3–4 sentence executive summary |
| **Strengths** | Specific strengths with evidence |
| **Concerns** | Areas of concern with evidence |
| **Recommendation** | Strong Hire, Hire, or No Hire |
| **Confidence Score** | How confident the AI is in its assessment (0–1) |
| **Experience Level** | Junior, Mid, Senior, or Lead assessment |
| **Follow-Up Areas** | Topics to probe in the next round |

### SWE-Specific Scoring (Technical/Mixed roles)

For technical roles, the scoring engine evaluates 9 dimensions:

**Technical**: Code Quality, Problem Solving, System Design, Security Awareness, Testing Instinct, Technical Communication

**Behavioral**: Problem Decomposition, Collaboration Signal, Learning Agility

### Custom Rubric Scoring

When a custom scoring rubric is defined on the job, the AI scores each custom dimension with evidence.

### Export

- **JSON** — full structured report for integrations
- **CSV** — spreadsheet-friendly format

### Share

Generate a time-limited public link (1–720 hours) to share with stakeholders who don't have accounts.

---

## 6. Interview Replay & AI Highlights

**Route**: `/dashboard/interviews/{id}` → Highlights tab

The AI identifies the **5–8 most significant moments** in every interview, saving hiring managers up to 80% of review time.

### Highlight Types

| Type | Color | Description |
|------|-------|-------------|
| Strong Answer | Green | Candidate gave an excellent response |
| Weak Answer | Red | Candidate struggled significantly |
| Creative Thinking | Purple | Novel or innovative approach |
| Red Flag | Red | Concerning behavior or response |
| Coding Breakthrough | Blue | Solved a coding challenge effectively |
| Deep Insight | Indigo | Demonstrated deep domain knowledge |
| Struggle | Amber | Candidate had difficulty but showed effort |
| Growth Moment | Teal | Candidate learned and adapted during the interview |

Each highlight includes:
- A descriptive label (e.g., "Strong system design thinking")
- A summary explaining why this moment matters
- A preview of the transcript at that moment
- Clickable navigation to the exact message in the transcript

---

## 7. Adaptive Difficulty Engine

The AI tracks candidate performance in real-time and dynamically adjusts question difficulty:

- **Strong answer** → Next question is harder
- **Weak answer** → Next question eases slightly
- Difficulty levels: Easy → Medium → Hard → Expert

### Difficulty Curve

The interview detail page shows a visual **Difficulty Progression** chart with color-coded badges:

| Level | Color |
|-------|-------|
| Easy | Green |
| Medium | Yellow |
| Hard | Orange |
| Expert | Red |

This produces more accurate assessments by avoiding ceiling effects (all easy questions for strong candidates) and floor effects (all hard questions for struggling ones).

---

## 8. Candidate Comparison

**Route**: `/dashboard/compare`

Compare all candidates for a specific job side-by-side:

- **Sortable table** with name, score, duration, recommendation
- **Color-coded scores** — green (7+), yellow (5–7), red (<5)
- **Shortlist toggle** — star candidates for final consideration
- **Filter** — show only shortlisted candidates
- **Export CSV** — download comparison data
- **Score details** — expand to see skill scores, strengths, concerns

---

## 9. AI Hiring Debrief

**Route**: `/dashboard/compare` → "Generate AI Debrief" button

Select 2–5 candidates and generate a structured **hiring committee debrief document**:

### Debrief Contents

1. **Executive Summary** — overview of the candidate pool
2. **Side-by-Side Comparison** — skill matrix table
3. **Individual Assessments** — strengths, risks, best fit per candidate
4. **Risk Assessment** — risks and mitigation strategies
5. **Recommended Ranking** — AI-suggested order with rationale
6. **Decision Recommendation** — final recommendation with confidence

The debrief can be downloaded as PDF (via print). It incorporates scores, transcripts, custom rubric dimensions, and team comments.

---

## 10. Ask AI — Natural Language Search

**Route**: `/dashboard/ask-ai`

Chat-style interface to search across all your interview data using natural language:

**Example queries:**
- "Who scored highest on system design?"
- "Show me candidates who discussed microservices"
- "Compare Alice and Bob's Python answers"
- "Summarize concerns about the last 5 candidates"

### How it works

1. Searches across all completed interview transcripts, reports, and scores
2. Builds context from relevant data
3. Sends to AI for synthesis
4. Returns a cited answer with links to specific interviews

**Features:**
- Optional job filter to narrow the search scope
- Citation cards linking to the exact interview/session
- Shows how many interviews were searched

---

## 11. Team Collaboration & Comments

**Route**: `/dashboard/interviews/{id}` → Team Discussion section

Add comments on any candidate report to collaborate with your hiring team:

- **Threaded comments** with user name and timestamp
- **@mentions** — type `@` to mention team members
- **Email notifications** — mentioned users receive email alerts via AgentMail
- **Delete** — remove your own comments
- All comments are visible to the entire org

---

## 12. Candidate Experience & NPS

### Feedback Form (Candidate-facing)

After completing an interview, candidates see a feedback form:

- **Overall rating** — 1–5 stars (required)
- **Category ratings** — Fairness, Clarity, Relevance (optional, 1–5 each)
- **Comment** — free-text feedback (optional)
- No authentication required

### Analytics (Dashboard)

**Route**: `/dashboard/analytics` → Candidate Experience section

| Metric | Description |
|--------|-------------|
| **NPS Score** | Net Promoter Score (-100 to +100): green >50, yellow 0–50, red <0 |
| **Average Ratings** | Overall, Fairness, Clarity, Relevance averages |
| **Rating Distribution** | Visual bar chart of 1–5 star distribution |
| **Recent Comments** | Latest candidate feedback with ratings |

---

## 13. Analytics & Skills Insights

**Route**: `/dashboard/analytics`

### Standard Analytics

| Metric | Description |
|--------|-------------|
| Total Interviews | All-time count |
| Completion Rate | % of started interviews that completed |
| Average Score | Mean candidate score |
| Average Duration | Mean interview length |
| Score Distribution | Histogram of score ranges |
| Status Breakdown | Pending, In Progress, Completed, Expired |
| Format Breakdown | Text vs Voice vs Video |
| Per-Job Stats | Interviews, avg score, avg duration per job |

### Skills Market Insights

AI-powered analysis of your candidate pool:

- **Skill Heatmap** — color-coded grid showing average score per skill
  - Red (<5.0): skill gap
  - Yellow (5.0–7.0): adequate
  - Green (≥7.0): strong
- **Skill Gaps** — skills where candidates consistently score below 5.0
- **Skill Strengths** — skills where candidates score above 7.0
- **AI Recommendations** — 3–5 actionable suggestions:
  - Adjust job descriptions
  - Improve sourcing channels
  - Modify interview focus areas
- **Behavioral Averages** — bar chart of behavioral dimension scores

---

## 14. Practice Mode — Interview Simulator

**Route**: `/practice` (public, no authentication)

A free AI practice interview mode for candidates. Also serves as a lead generation funnel.

### Built-in Templates

| Role | Type |
|------|------|
| Software Engineer | Technical |
| Product Manager | Behavioral |
| Data Scientist | Technical |
| Frontend Developer | Technical |
| Backend Developer | Technical |
| DevOps Engineer | Technical |

### How it works

1. Candidate selects a role template
2. Enters their name (optional)
3. Starts a 5-question practice interview
4. AI provides **coaching tips** after each answer (e.g., "**Tip:** Try structuring your answer using the STAR method")
5. Practice scorecard at the end (not shared with any employer)

**Key differences from real interviews:**
- No authentication required
- Capped at 5 questions
- AI gives coaching tips after each answer
- No report generated for employers
- Doesn't count toward billing limits
- After completing, get a full **AI Coaching Report** (see below)

### AI Interview Coach

**Route**: `/coach` (public landing page)

After completing a practice interview, candidates can generate a comprehensive AI coaching report. The `/coach` page explains the feature and links to practice.

#### Coaching Report Contents

| Section | Description |
|---------|-------------|
| **Readiness Score** | 0–100 score with label: Needs Work, Getting There, Ready, Outstanding |
| **Question-by-Question Feedback** | Per-question score (1–10), what went well, what to improve, sample stronger answer |
| **Strengths** | Specific strengths identified from the transcript with evidence |
| **Areas to Improve** | Prioritized improvements (high/medium/low) with actionable tips |
| **Personalized Study Plan** | Topics to focus on with practice exercises based on observed weaknesses |
| **STAR Method Tips** | Guidance on structuring behavioral answers (when applicable) |

Each section references exact moments from the interview transcript.

---

## 15. Scheduling & Calendar Integration

When generating an interview link, you can schedule it for a future date:

1. Set the **scheduled date and time**
2. Enter the **candidate's email**
3. The system generates an **ICS calendar invite** with:
   - Interview title and description
   - Date, time, and duration
   - Link to the interview
4. Calendar file downloads automatically
5. If AgentMail is configured, an email invitation is sent

---

## 16. Resume Upload & Personalization

Candidates can upload their resume (PDF, up to 5 MB) before starting the interview:

- Text is extracted from the PDF
- The AI uses the resume to personalize questions:
  - References specific projects and experience
  - Asks about technologies mentioned in the resume
  - Tailors difficulty based on stated experience level

---

## 17. Proctoring & Integrity Monitoring

For coding interviews, the system tracks candidate behavior:

### Events Tracked

| Event | Description |
|-------|-------------|
| Keystroke | Typing patterns and speed |
| Paste | Copy-paste actions with character count |
| Tab Switch | Leaving the interview tab |
| Focus Loss | Browser window losing focus |
| Idle | Extended periods of inactivity |
| Code Submit | Code execution attempts |

### Integrity Assessment

The system computes a composite **Integrity Score** (0–10) with:
- Risk level (Low, Medium, High)
- Flagged behaviors
- Summary narrative
- Detailed behavior statistics (typing speed, paste frequency, time away)

Visible on the interview detail page in the Integrity tab.

---

## 18. White-Label Branding

**Route**: `/dashboard/settings` → Branding tab

Customize the candidate-facing interview experience:

| Setting | Description |
|---------|-------------|
| **Logo URL** | Your company logo displayed on the interview page |
| **Primary Color** | Accent color for buttons, progress bar, and UI elements |
| **Company Name** | Displayed in the interview header |
| **Tagline** | Subtitle shown under the company name |

Branding is applied to:
- Interview consent page
- Interview chat UI (message bubbles, progress bar, buttons)
- Completed interview page

---

## 19. Interview Templates

**Route**: `/dashboard/jobs` → "Use Template" button

Pre-built configurations to quickly create job postings:

### System Templates (15+)

Built-in templates covering common roles:
- Senior React Developer, Backend Python Developer, Full-Stack Engineer
- DevOps/SRE, Data Scientist, ML Engineer
- Product Manager, QA Engineer, Mobile Developer
- And more

### Custom Templates

- **Save as Template** from any existing job
- Templates include: title, role type, description, skills, config, format
- Org-specific templates visible only to your team
- System templates cannot be deleted

---

## 20. Custom Scoring Rubrics

When creating a job, define custom scoring dimensions:

```json
[
  { "dimension": "API Design", "weight": 2.0, "description": "RESTful design principles" },
  { "dimension": "Database Knowledge", "weight": 1.5, "description": "SQL and schema design" },
  { "dimension": "Code Quality", "weight": 1.0, "description": "Clean, maintainable code" }
]
```

The AI will:
- Score each dimension from 0–10
- Weight the overall score according to your weights
- Provide evidence from the transcript for each dimension
- Note if a dimension was not assessed during the interview

---

## 21. ATS Integration

**Route**: `/dashboard/settings` → Integrations tab

Push interview scorecards to your Applicant Tracking System:

| Platform | Status |
|----------|--------|
| Greenhouse | Supported |
| Lever | Supported |
| Workable | Supported |

### Setup

1. Enter your ATS API key
2. Enable the integration
3. After scoring, click **Push to ATS** on any report

The scorecard includes: overall score, skill breakdown, recommendation, and AI summary.

---

## 22. Webhooks

**Route**: `/dashboard/settings` → Webhooks tab

Receive real-time notifications when events occur:

### Supported Events

| Event | Trigger |
|-------|---------|
| `interview.completed` | Interview finishes |
| `interview.scored` | AI report is generated |

### Configuration

- **URL** — your webhook endpoint (must be HTTPS, non-private IP)
- **Events** — which events to subscribe to
- **Secret** — HMAC secret for signature verification

Payloads include session ID, candidate name, status, and scores.

---

## 23. Email Notifications (AgentMail)

**Route**: `/dashboard/settings` → Email tab

Powered by [AgentMail](https://docs.agentmail.to), the platform sends:

- **Interview invitations** — when generating a link with a candidate email
- **Completion notifications** — to hiring managers when an interview completes
- **@mention alerts** — when a team member mentions you in a report comment

### Setup

Click **Setup Email** in Settings. An AgentMail inbox is provisioned automatically for your organization.

---

## 24. Billing & Subscriptions

**Route**: `/dashboard/settings` → Billing tab

Powered by Stripe:

| Plan | Price | Interviews/mo | Formats | Users |
|------|-------|---------------|---------|-------|
| Free | $0 | 10 | Text only | 2 |
| Starter | $99/mo | 100 | Text + Voice | 5 |
| Professional | $299/mo | 500 | All formats | 20 |
| Enterprise | $799/mo | Unlimited | All formats | Unlimited |

Features:
- Checkout via Stripe
- Usage metering and enforcement
- Auto-downgrade on subscription cancellation
- Customer portal for plan management

---

## 25. Team Management

**Route**: `/dashboard/team` (Admin only)

### Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage team, settings, billing, all features |
| **Hiring Manager** | Create jobs, run interviews, view reports, collaborate |
| **Viewer** | View-only access to interviews, reports, and analytics |

### Actions

- **Invite** team members (email, name, role, temporary password)
- **Change roles** — promote/demote users
- **Deactivate** — disable access without deleting

---

## 26. Multi-Language Support

Conduct interviews in multiple languages:

| Code | Language |
|------|----------|
| `en` | English |
| `es` | Spanish |
| `fr` | French |
| `de` | German |
| `hi` | Hindi |
| `zh` | Chinese |
| `ja` | Japanese |
| `ko` | Korean |
| `pt` | Portuguese |
| `ar` | Arabic |

Set the language in the interview config when creating a job. The AI conducts the entire interview in the selected language, only using English for technical terms without standard translations.

---

## 27. API Reference

All endpoints are prefixed with `/api/v1/`.

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/signup` | None | Create account + organization |
| POST | `/auth/login` | None | Get JWT token |

### Job Postings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/job-postings` | JWT | List jobs (paginated, filterable) |
| POST | `/job-postings` | JWT | Create job posting |
| GET | `/job-postings/{id}` | JWT | Get job details |
| PATCH | `/job-postings/{id}` | JWT | Update job |
| DELETE | `/job-postings/{id}` | JWT | Delete job |
| POST | `/job-postings/{id}/generate-link` | JWT | Generate interview link |
| POST | `/job-postings/{id}/extract-skills` | JWT | AI skill extraction |
| POST | `/job-postings/import` | JWT | Bulk import from CSV |

### Templates

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/templates` | JWT | List templates |
| POST | `/templates` | JWT | Create template |
| POST | `/templates/from-job/{id}` | JWT | Create from existing job |
| DELETE | `/templates/{id}` | JWT | Delete template |

### Interviews

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/interviews` | JWT | List sessions (filterable) |
| GET | `/interviews/{id}` | JWT | Get session details |
| GET | `/interviews/{id}/messages` | JWT | Get transcript |
| PATCH | `/interviews/{id}/cancel` | JWT | Cancel interview |
| PATCH | `/interviews/{id}/shortlist` | JWT | Toggle shortlist |
| GET | `/interviews/public/{token}` | None | Public interview info |
| POST | `/interviews/public/{token}/start` | None | Start interview |
| POST | `/interviews/public/{token}/feedback` | None | Submit candidate feedback |

### Reports

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/reports/{id}/generate` | JWT | Generate AI report |
| GET | `/reports/{id}` | JWT | Get report |
| GET | `/reports/{id}/highlights` | JWT | Get AI highlights |
| POST | `/reports/{id}/share` | JWT | Create share link |
| GET | `/reports/public/{token}` | None | View shared report |
| GET | `/reports/{id}/export/json` | JWT | Export as JSON |
| GET | `/reports/{id}/export/csv` | JWT | Export as CSV |
| POST | `/reports/debrief` | JWT | Generate AI debrief |

### Comments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/reports/{id}/comments` | JWT | List comments |
| POST | `/reports/{id}/comments` | JWT | Add comment |
| DELETE | `/reports/{id}/comments/{cid}` | JWT | Delete comment |

### Analytics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/dashboard/stats` | JWT | Dashboard summary |
| GET | `/analytics/overview` | JWT | Analytics overview |
| GET | `/analytics/per-job` | JWT | Per-job analytics |
| GET | `/analytics/compare` | JWT | Candidate comparison |
| GET | `/analytics/skills-insights` | JWT | Skills gap analysis |
| GET | `/analytics/candidate-satisfaction` | JWT | NPS and feedback stats |

### AI Assistant

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/ai/ask` | JWT | Natural language search |

### Practice Mode & Coach

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/practice/templates` | None | List practice templates |
| POST | `/practice/start` | None | Start practice session |
| POST | `/coach/analyze/{token}` | None | Generate AI coaching report |

### Proctoring

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/proctoring/events/{token}/batch` | None | Submit behavior events |
| GET | `/proctoring/summary/{id}` | JWT | Get behavior summary |
| GET | `/proctoring/integrity/{id}` | JWT | Get integrity assessment |

### Code Execution

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/code/execute` | None | Run code (requires interview token) |

### Billing

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/billing/subscription` | JWT | Current subscription |
| GET | `/billing/plans` | JWT | Available plans |
| POST | `/billing/checkout` | JWT | Create Stripe checkout |
| POST | `/billing/webhook` | Stripe | Handle Stripe events |

### Integrations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/webhooks/config` | JWT | List webhooks |
| POST | `/webhooks/config` | JWT | Add webhook |
| GET | `/ats/config` | JWT | List ATS configs |
| POST | `/ats/config` | JWT | Save ATS config |
| DELETE | `/ats/config/{platform}` | JWT | Remove ATS config |
| POST | `/ats/push` | JWT | Push scorecard to ATS |

### Organization

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/organizations/branding` | JWT | Get branding |
| PUT | `/organizations/branding` | JWT | Update branding |
| POST | `/organizations/email/setup` | JWT | Setup AgentMail |
| GET | `/organizations/email/status` | JWT | Email status |

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/users` | JWT | List users |
| POST | `/users` | JWT (Admin) | Invite user |
| GET | `/users/me` | JWT | Current user |
| PATCH | `/users/{id}/role` | JWT (Admin) | Change role |
| PATCH | `/users/{id}/deactivate` | JWT (Admin) | Toggle active |

### WebSocket

| Protocol | Endpoint | Description |
|----------|----------|-------------|
| WS | `/ws/interview/{token}` | Text interview |
| WS | `/ws/voice-interview/{token}` | Voice interview |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Basic health |
| GET | `/health/db` | None | Database check |
| GET | `/health/redis` | None | Redis check |
| GET | `/health/full` | None | Full system check |

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Next.js    │────▶│   FastAPI    │────▶│  PostgreSQL  │
│  (React 18)  │     │  (async)     │     │   (Neon)     │
│   Vercel     │     │  Fly.io      │     │              │
└──────┬───────┘     └──────┬───────┘     └──────────────┘
       │                    │
       │ WebSocket          ├────────────▶ Redis (Upstash)
       └────────────────────┤
                            │
                     ┌──────┴───────┐     ┌──────────────┐
                     │  AI Engine   │     │  AgentMail   │
                     │ OpenAI/Gemini│     │  (Email)     │
                     │ /Claude/etc  │     │              │
                     └──────────────┘     └──────────────┘
```

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Recharts |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| AI | OpenAI GPT-4o, Gemini, OpenRouter, Bonsai, Claude — automatic fallback chain |
| Real-time | WebSocket (text/voice), LiveKit (video) |
| Code Execution | Judge0 CE |
| Database | PostgreSQL 16, Redis 7 |
| Billing | Stripe |
| Email | AgentMail |
| Hosting | Vercel (frontend), Fly.io (backend), Neon (DB), Upstash (Redis) |
