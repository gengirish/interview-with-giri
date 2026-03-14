# Multi-Agent Implementation Plan — 10 Features

**Product**: Hire with Giri — AI Interview as a Service  
**Scope**: 10 new features, parallelized across agents  
**Estimated Total**: ~3 implementation sessions

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION WAVES                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1 (Foundation)         WAVE 2 (Intelligence)                │
│  ┌──────────────────┐        ┌──────────────────┐                 │
│  │ Agent A           │        │ Agent E           │                │
│  │ Multi-Round       │        │ Interview Intel   │                │
│  │ Orchestration     │        │ Engine            │                │
│  ├──────────────────┤        ├──────────────────┤                 │
│  │ Agent B           │        │ Agent F           │                │
│  │ Talent Pool &     │        │ AI Bias Detector  │                │
│  │ Smart Matching    │        │ & Fairness Audit  │                │
│  ├──────────────────┤        ├──────────────────┤                 │
│  │ Agent C           │        │ Agent G           │                │
│  │ Live Shadowing    │        │ Voice Sentiment   │                │
│  │                   │        │ Analysis          │                │
│  ├──────────────────┤        └──────────────────┘                 │
│  │ Agent D           │                                             │
│  │ JD Optimizer      │        WAVE 3 (Experience)                  │
│  └──────────────────┘        ┌──────────────────┐                 │
│                               │ Agent H           │                │
│                               │ Candidate Portal  │                │
│                               ├──────────────────┤                │
│                               │ Agent I           │                │
│                               │ Team Calibration  │                │
│                               ├──────────────────┤                │
│                               │ Agent J           │                │
│                               │ Reference Check   │                │
│                               └──────────────────┘                │
└────────────────────────────────────────────────────────────────────┘
```

---

## Wave 1 — Foundation Features (Run 4 Agents in Parallel)

### Agent A: Multi-Round Interview Orchestration

**Goal**: Transform single interviews into chained hiring pipelines with automatic advancement.

#### Database Changes

New tables:

```sql
-- Hiring pipeline definition
CREATE TABLE hiring_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    job_posting_id UUID NOT NULL REFERENCES job_posting(id),
    name VARCHAR(255) NOT NULL,
    rounds JSONB NOT NULL DEFAULT '[]',
    -- rounds: [{round_number: 1, name: "Phone Screen", type: "behavioral",
    --   config: {num_questions: 5, difficulty: "easy", format: "text"},
    --   advance_threshold: 6.0}]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Track candidate progress through pipeline
CREATE TABLE pipeline_candidate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES hiring_pipeline(id),
    candidate_email VARCHAR(255) NOT NULL,
    candidate_name VARCHAR(255),
    current_round INTEGER DEFAULT 1,
    status VARCHAR(30) DEFAULT 'active',
    -- status: active, advanced, rejected, withdrawn, hired
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(pipeline_id, candidate_email)
);
```

Modify existing table:

```sql
ALTER TABLE interview_session
    ADD COLUMN pipeline_id UUID REFERENCES hiring_pipeline(id),
    ADD COLUMN round_number INTEGER DEFAULT NULL;
```

#### Backend (Agent A-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `HiringPipeline`, `PipelineCandidate` models |
| `routers/pipelines.py` | CREATE | New router |
| `services/pipeline_service.py` | CREATE | Pipeline orchestration logic |
| `main.py` | MODIFY | Register pipeline router |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/pipelines` | JWT | Create pipeline for a job |
| GET | `/pipelines` | JWT | List org pipelines |
| GET | `/pipelines/{id}` | JWT | Pipeline details with candidate funnel |
| PATCH | `/pipelines/{id}` | JWT | Update rounds/thresholds |
| DELETE | `/pipelines/{id}` | JWT | Delete pipeline |
| POST | `/pipelines/{id}/candidates` | JWT | Add candidate to pipeline |
| GET | `/pipelines/{id}/candidates` | JWT | List candidates with round status |
| POST | `/pipelines/{id}/advance/{candidate_id}` | JWT | Manually advance candidate |
| GET | `/pipelines/{id}/funnel` | JWT | Funnel analytics (conversion per round) |

**Auto-advancement logic** (in `pipeline_service.py`):
- After `interview.completed` event, check if score >= round threshold
- If yes, auto-create next round's interview session with context from prior rounds
- Send advancement email via AgentMail
- If no, mark candidate as `rejected` at that round

**Context chaining** (modify `chat_handler.py`):
- When session has `pipeline_id` and `round_number > 1`, fetch prior round transcripts
- Inject prior context into system prompt: "Previous round summary: {prior_summary}"

#### Frontend (Agent A-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/pipelines/page.tsx` | CREATE | Pipeline list + creation |
| `app/dashboard/pipelines/[id]/page.tsx` | CREATE | Pipeline detail with Kanban/funnel view |
| `app/dashboard/jobs/[id]/page.tsx` | MODIFY | Add "Create Pipeline" button |
| `lib/api.ts` | MODIFY | Add pipeline API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Pipelines" nav item |

**UI Components**:
- Pipeline builder (drag-and-drop rounds)
- Kanban board showing candidates per round
- Funnel chart (candidates at each stage)
- Round configuration modal (format, questions, threshold)

#### Tests

- Backend: 8 pytest tests (CRUD, auto-advancement, context chaining, funnel analytics)
- Frontend: 8 Playwright E2E tests (pipeline creation, Kanban view, candidate flow)

---

### Agent B: Candidate Talent Pool & Smart Matching

**Goal**: Build a searchable pool from past candidates; auto-surface matches for new jobs.

#### Database Changes

```sql
CREATE TABLE talent_pool_entry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    candidate_email VARCHAR(255) NOT NULL,
    candidate_name VARCHAR(255),
    skills JSONB DEFAULT '[]',
    -- skills: [{name: "Python", score: 8.5, source_session: "uuid"}]
    experience_level VARCHAR(50),
    best_score NUMERIC(4,2),
    interview_count INTEGER DEFAULT 1,
    last_interviewed_at TIMESTAMPTZ,
    tags JSONB DEFAULT '[]',
    -- tags: ["strong_culture_fit", "needs_more_experience", "re-engage"]
    source_session_ids JSONB DEFAULT '[]',
    status VARCHAR(30) DEFAULT 'available',
    -- status: available, hired, do_not_contact
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, candidate_email)
);
```

#### Backend (Agent B-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `TalentPoolEntry` model |
| `routers/talent_pool.py` | CREATE | New router |
| `services/talent_matching.py` | CREATE | AI matching engine |
| `services/scoring_engine.py` | MODIFY | Auto-add to pool after interview completion |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/talent-pool` | JWT | Search/filter pool (name, skills, score range, tags) |
| GET | `/talent-pool/{id}` | JWT | Entry details with interview history |
| PATCH | `/talent-pool/{id}` | JWT | Update tags, notes, status |
| DELETE | `/talent-pool/{id}` | JWT | Remove from pool |
| POST | `/talent-pool/match/{job_id}` | JWT | AI-match pool against a job posting |
| POST | `/talent-pool/{id}/re-engage` | JWT | Send re-engagement email |
| GET | `/talent-pool/stats` | JWT | Pool analytics (size, top skills, avg score) |

**Matching algorithm** (`talent_matching.py`):
1. Extract required skills from job posting
2. Query pool entries with overlapping skills
3. Score match: skill overlap (40%) + score history (30%) + recency (20%) + tag boost (10%)
4. Send to AI for natural language ranking + reasoning
5. Return top 10 matches with match percentage and reasoning

**Auto-population** (modify `scoring_engine.py`):
- After report generation, upsert `TalentPoolEntry`:
  - Extract skills from report scores
  - Set experience level from report
  - Update best score if higher
  - Increment interview count

#### Frontend (Agent B-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/talent-pool/page.tsx` | CREATE | Pool search + browse |
| `app/dashboard/jobs/[id]/page.tsx` | MODIFY | Add "Find Matching Candidates" section |
| `lib/api.ts` | MODIFY | Add talent pool API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Talent Pool" nav item |

**UI Components**:
- Searchable/filterable candidate table with skill tags
- Match results card (% match, reasoning, previous scores)
- Candidate profile drawer (interview history timeline)
- Re-engage email dialog
- Pool size KPI card on dashboard

#### Tests

- Backend: 7 pytest tests (CRUD, matching, auto-population, re-engage)
- Frontend: 6 Playwright E2E tests (search, filter, match, profile view)

---

### Agent C: Live Interview Shadowing

**Goal**: Let hiring managers observe AI interviews in real-time and inject questions.

#### Database Changes

```sql
ALTER TABLE interview_session
    ADD COLUMN allow_shadowing BOOLEAN DEFAULT false,
    ADD COLUMN shadow_token VARCHAR(64) UNIQUE;
```

#### Backend (Agent C-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | MODIFY | Add `allow_shadowing`, `shadow_token` to `InterviewSession` |
| `routers/interviews.py` | MODIFY | Add shadow link generation |
| `websocket/shadow_handler.py` | CREATE | Read-only WebSocket for observers |
| `websocket/chat_handler.py` | MODIFY | Broadcast messages to shadow connections; handle injected questions |
| `main.py` | MODIFY | Register shadow WebSocket route |

**WebSocket Architecture**:

```
Candidate ──── WS /ws/interview/{token} ────── AI Engine
                       │
                       ├── broadcasts messages to ──┐
                       │                             │
Manager ──── WS /ws/shadow/{shadow_token} ──────────┘
                       │
                       └── can send {type: "inject_question", content: "..."}
```

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/interviews/{id}/shadow-link` | JWT | Generate shadow token |
| GET | `/interviews/{id}/shadow-status` | JWT | Check if anyone is shadowing |

**Shadow handler** (`shadow_handler.py`):
- Accept WebSocket connection with shadow_token
- Validate token maps to active session
- Stream all messages (interviewer + candidate) in real-time
- Accept `inject_question` messages from manager
- Forward injected questions to main chat_handler which weaves them into the AI's next response
- Send live metadata: thinking indicator, difficulty level, question progress

#### Frontend (Agent C-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/shadow/[token]/page.tsx` | CREATE | Shadow viewer page |
| `app/dashboard/interviews/[id]/page.tsx` | MODIFY | Add "Shadow Live" button for in-progress interviews |
| `lib/api.ts` | MODIFY | Add shadow API methods |

**UI Components**:
- Read-only chat transcript (live updating)
- Side panel: inject question input
- Live indicators: candidate typing, AI thinking, difficulty level
- Sentiment badge (if voice sentiment is also built)
- "End Observation" button

#### Tests

- Backend: 5 pytest tests (shadow token generation, WebSocket connection, question injection)
- Frontend: 5 Playwright E2E tests (shadow page elements, live message display)

---

### Agent D: AI Job Description Optimizer

**Goal**: Audit and improve job descriptions for bias, clarity, and effectiveness.

#### Database Changes

None required — stateless AI analysis. Results can be cached in `job_posting.settings` JSONB.

#### Backend (Agent D-1)

| File | Action | Details |
|------|--------|---------|
| `routers/job_postings.py` | MODIFY | Add optimize endpoint |
| `services/jd_optimizer.py` | CREATE | AI JD analysis service |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/job-postings/{id}/optimize` | JWT | Analyze and suggest improvements |
| POST | `/job-postings/analyze-text` | JWT | Analyze raw JD text (before saving) |

**AI Analysis Dimensions** (`jd_optimizer.py`):

```json
{
  "readability_score": 72,
  "readability_grade": "B",
  "bias_alerts": [
    {"text": "rockstar developer", "type": "gender_coded", "suggestion": "experienced developer"},
    {"text": "young and dynamic team", "type": "age_bias", "suggestion": "collaborative and driven team"}
  ],
  "missing_sections": ["salary_range", "remote_policy", "growth_opportunities"],
  "jargon_overload": ["synergize", "leverage"],
  "clarity_issues": ["Role responsibilities are vague — add 3-5 specific duties"],
  "strengths": ["Clear tech stack requirements", "Good benefits description"],
  "optimized_jd": "... AI-rewritten version ...",
  "attractiveness_score": 65,
  "word_count": 450,
  "estimated_apply_rate": "medium"
}
```

#### Frontend (Agent D-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/jobs/[id]/page.tsx` | MODIFY | Add "Optimize JD" tab/button |
| `lib/api.ts` | MODIFY | Add optimize API methods |

**UI Components**:
- Side-by-side diff view: original vs optimized
- Bias alerts with inline highlights (red underline on biased text)
- Readability gauge (A-F grade)
- Missing section checklist
- "Apply Suggestions" button that updates the JD

#### Tests

- Backend: 4 pytest tests (optimize, analyze-text, bias detection, readability)
- Frontend: 5 Playwright E2E tests (optimize button, bias alerts, diff view)

---

## Wave 2 — Intelligence Features (Run 3 Agents in Parallel)

> **Depends on**: Wave 1 must complete first (uses pipeline data, talent pool data).

### Agent E: Interview Intelligence Engine

**Goal**: Meta-analytics across hundreds of interviews to identify patterns and optimize hiring.

#### Database Changes

```sql
CREATE TABLE intelligence_report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    report_type VARCHAR(50) NOT NULL,
    -- report_type: quarterly, question_effectiveness, calibration_drift, custom
    data JSONB NOT NULL,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Backend (Agent E-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `IntelligenceReport` model |
| `routers/intelligence.py` | CREATE | New router |
| `services/intelligence_engine.py` | CREATE | Pattern analysis engine |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/intelligence/overview` | JWT (admin) | Org-wide hiring intelligence |
| GET | `/intelligence/question-effectiveness` | JWT | Which questions predict success |
| GET | `/intelligence/optimal-config` | JWT | Optimal interview length, # questions per role |
| GET | `/intelligence/calibration-drift` | JWT | Score consistency over time |
| GET | `/intelligence/skill-testing-balance` | JWT | Over/under-tested skills |
| POST | `/intelligence/generate-report` | JWT (admin) | Generate quarterly report |

**Analysis Logic** (`intelligence_engine.py`):

1. **Question Effectiveness**: Correlate individual question scores with overall recommendation across all interviews. Questions with high correlation = high predictive value.
2. **Optimal Config**: Group interviews by config (length, # questions), compare score variance. Lower variance = better config.
3. **Calibration Drift**: Plot weekly average scores over time. Detect upward/downward trends. Alert if scores shift >0.5 pts over 4 weeks.
4. **Skill Balance**: Compare frequency of skill assessment vs job requirements. Flag skills required but rarely tested.

#### Frontend (Agent E-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/intelligence/page.tsx` | CREATE | Intelligence dashboard |
| `lib/api.ts` | MODIFY | Add intelligence API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Intelligence" nav item (admin only) |

**UI Components**:
- Question effectiveness ranking table (sortable by predictive value)
- Optimal configuration recommendations (cards with current vs recommended)
- Calibration drift line chart (weekly avg scores with trend line)
- Skill testing heatmap (required vs assessed)
- Quarterly report generator with PDF export

#### Tests

- Backend: 6 pytest tests (overview, question effectiveness, drift detection)
- Frontend: 6 Playwright E2E tests (dashboard elements, charts, report generation)

---

### Agent F: AI Bias Detector & Fairness Audit

**Goal**: Automated bias detection with DEI compliance reporting.

#### Database Changes

```sql
CREATE TABLE fairness_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    audit_period VARCHAR(20) NOT NULL,  -- "2026-Q1", "2026-03"
    total_interviews INTEGER,
    findings JSONB NOT NULL,
    -- findings: {score_disparities: [...], biased_questions: [...],
    --   language_flags: [...], recommendations: [...]}
    fairness_score NUMERIC(4,2),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Backend (Agent F-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `FairnessAudit` model |
| `routers/fairness.py` | CREATE | New router |
| `services/bias_detector.py` | CREATE | Bias analysis engine |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/fairness/audit` | JWT (admin) | Run fairness audit for a period |
| GET | `/fairness/audits` | JWT (admin) | List past audits |
| GET | `/fairness/audits/{id}` | JWT (admin) | Audit details |
| GET | `/fairness/score-distribution` | JWT (admin) | Score breakdown by candidate demographics |
| POST | `/fairness/check-question` | JWT | Check a single question for bias |

**Bias Detection Logic** (`bias_detector.py`):

1. **Score Disparity Analysis**: Compare score distributions across name-inferred demographics. Flag if any group's average deviates >1 std dev.
2. **Question Language Audit**: Run all interview questions through AI bias classifier. Flag gender-coded, age-biased, culturally-specific language.
3. **AI Prompt Audit**: Analyze system prompts for implicit bias signals.
4. **Consistency Check**: Compare scores for similar answers across different candidates. Flag high variance for similar quality answers.
5. **Monthly Fairness Score**: Composite 0-100 score combining all dimensions.

#### Frontend (Agent F-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/fairness/page.tsx` | CREATE | Fairness dashboard |
| `lib/api.ts` | MODIFY | Add fairness API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Fairness" nav item (admin only) |

**UI Components**:
- Fairness score gauge (0-100 with color coding)
- Score distribution comparison charts
- Flagged questions table with suggested fixes
- Audit history timeline
- "Run Audit" button with period selector

#### Tests

- Backend: 5 pytest tests (audit generation, score distribution, question check)
- Frontend: 5 Playwright E2E tests (dashboard, audit results, question checker)

---

### Agent G: Voice Sentiment & Tone Analysis

**Goal**: Analyze confidence, enthusiasm, and stress from voice/video interviews.

#### Database Changes

```sql
ALTER TABLE interview_message
    ADD COLUMN sentiment_data JSONB DEFAULT NULL;
    -- sentiment_data: {confidence: 0.8, enthusiasm: 0.7, stress: 0.3,
    --   pace_wpm: 145, volume_db: -20, pause_count: 3}
```

```sql
ALTER TABLE candidate_report
    ADD COLUMN sentiment_summary JSONB DEFAULT NULL;
    -- sentiment_summary: {avg_confidence: 0.75, avg_enthusiasm: 0.6,
    --   stress_arc: [{q: 1, stress: 0.2}, {q: 2, stress: 0.5}],
    --   notable_moments: [{index: 3, type: "confidence_spike", detail: "..."}]}
```

#### Backend (Agent G-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | MODIFY | Add `sentiment_data` to `InterviewMessage`, `sentiment_summary` to `CandidateReport` |
| `services/sentiment_analyzer.py` | CREATE | Voice/text sentiment analysis |
| `websocket/voice_handler.py` | MODIFY | Integrate sentiment analysis per message |
| `services/scoring_engine.py` | MODIFY | Include sentiment in report generation |
| `routers/reports.py` | MODIFY | Add sentiment endpoint |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/reports/{id}/sentiment` | JWT | Get sentiment timeline for a session |

**Sentiment Analysis** (`sentiment_analyzer.py`):

1. **Text-based** (all formats): Analyze message text for confidence markers, hedging language, assertiveness, enthusiasm keywords.
2. **Audio-based** (voice/video): If audio features are available from voice pipeline, analyze pace (WPM), volume variance, pause patterns.
3. **Composite Score**: confidence (0-1), enthusiasm (0-1), stress (0-1) per message.
4. **Arc Generation**: Plot sentiment across the interview timeline for the report.

#### Frontend (Agent G-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/interviews/[id]/page.tsx` | MODIFY | Add "Sentiment" tab |
| `lib/api.ts` | MODIFY | Add sentiment API method |

**UI Components**:
- Sentiment timeline (line chart: confidence, enthusiasm, stress over time)
- Notable moments cards (confidence spikes/drops)
- Overall sentiment badges in the interview header
- Color-coded message bubbles (green = confident, yellow = neutral, red = stressed)

#### Tests

- Backend: 4 pytest tests (text sentiment, arc generation, report integration)
- Frontend: 5 Playwright E2E tests (sentiment tab, timeline chart, badges)

---

## Wave 3 — Experience Features (Run 3 Agents in Parallel)

> **Depends on**: Wave 1 for pipeline data. Can run concurrently with Wave 2.

### Agent H: Candidate Self-Service Portal

**Goal**: Give candidates a personal portal to view status, reports, and manage their interview.

#### Database Changes

```sql
CREATE TABLE candidate_portal_token (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    candidate_email VARCHAR(255) NOT NULL,
    portal_token VARCHAR(64) UNIQUE NOT NULL,
    permissions JSONB DEFAULT '["view_status", "view_coaching"]',
    -- permissions: view_status, view_scorecard, view_coaching,
    --   reschedule, upload_materials
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    UNIQUE(org_id, candidate_email)
);
```

#### Backend (Agent H-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `CandidatePortalToken` model |
| `routers/candidate_portal.py` | CREATE | New router (public, token-based) |
| `middleware/tenant.py` | MODIFY | Add `/api/v1/portal/` to public prefixes |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/portal/{token}` | None | Get portal data (interviews, status, timeline) |
| GET | `/portal/{token}/scorecard` | None | View scorecard (if org enables) |
| GET | `/portal/{token}/coaching` | None | View coaching reports |
| POST | `/portal/{token}/reschedule` | None | Request reschedule |
| POST | `/portal/{token}/materials` | None | Upload portfolio/links |
| POST | `/interviews/{id}/create-portal` | JWT | Generate portal token for candidate |

#### Frontend (Agent H-2)

| File | Action | Details |
|------|--------|---------|
| `app/portal/[token]/page.tsx` | CREATE | Candidate portal page |
| `lib/api.ts` | MODIFY | Add portal API methods |

**UI Components**:
- Interview status timeline (applied → scheduled → in progress → completed → decision)
- Scorecard viewer (if org enables transparency)
- Coaching report history (from practice sessions)
- Reschedule request form
- Material upload area (portfolio links, GitHub)
- Professional dark-themed UI (matches interview page aesthetic)

#### Tests

- Backend: 6 pytest tests (portal creation, data retrieval, permissions, upload)
- Frontend: 6 Playwright E2E tests (portal page, timeline, scorecard, reschedule)

---

### Agent I: Team Interview Calibration Mode

**Goal**: Build trust in AI scoring by comparing human vs AI evaluations.

#### Database Changes

```sql
CREATE TABLE calibration_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    created_by UUID NOT NULL REFERENCES users(id),
    sample_session_ids JSONB NOT NULL,  -- 5 interview session IDs
    status VARCHAR(30) DEFAULT 'active',
    -- status: active, completed
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE calibration_score (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calibration_id UUID NOT NULL REFERENCES calibration_session(id),
    user_id UUID NOT NULL REFERENCES users(id),
    session_id UUID NOT NULL REFERENCES interview_session(id),
    human_scores JSONB NOT NULL,
    -- {overall: 7, skills: {python: 8, design: 6}, recommendation: "hire"}
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(calibration_id, user_id, session_id)
);
```

#### Backend (Agent I-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `CalibrationSession`, `CalibrationScore` models |
| `routers/calibration.py` | CREATE | New router |
| `services/calibration_engine.py` | CREATE | Comparison and analysis |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/calibration/start` | JWT (admin) | Create calibration session with 5 random completed interviews |
| GET | `/calibration/{id}` | JWT | Get calibration session with transcripts |
| POST | `/calibration/{id}/score` | JWT | Submit human scores for a transcript |
| GET | `/calibration/{id}/results` | JWT | Compare human vs AI scores |
| GET | `/calibration/leaderboard` | JWT | Per-user calibration accuracy |

**Results Analysis** (`calibration_engine.py`):
- Calculate agreement rate per dimension (human vs AI)
- Generate calibration heatmap (which dimensions have highest disagreement)
- Per-user calibration score (how closely each manager aligns with AI)
- Trend over multiple calibration sessions

#### Frontend (Agent I-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/calibration/page.tsx` | CREATE | Calibration hub |
| `app/dashboard/calibration/[id]/page.tsx` | CREATE | Active calibration session |
| `lib/api.ts` | MODIFY | Add calibration API methods |

**UI Components**:
- "Start Calibration" button (admin only)
- Transcript viewer with inline scoring form
- Results page: agreement heatmap, per-user accuracy, AI vs human bar charts
- Calibration history with trend line
- "You scored 8.2, AI scored 7.5 — why?" explainer with AI reasoning

#### Tests

- Backend: 5 pytest tests (session creation, scoring, results comparison)
- Frontend: 6 Playwright E2E tests (calibration flow, scoring UI, results view)

---

### Agent J: Automated Reference Check

**Goal**: AI-driven reference collection and synthesis after candidate shortlisting.

#### Database Changes

```sql
CREATE TABLE reference_check (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    session_id UUID NOT NULL REFERENCES interview_session(id),
    candidate_name VARCHAR(255) NOT NULL,
    references JSONB NOT NULL DEFAULT '[]',
    -- [{name: "John Doe", email: "john@company.com", relationship: "Manager",
    --   status: "pending|completed|declined", responses: {...}}]
    ai_synthesis TEXT,
    consistency_score NUMERIC(4,2),
    -- How consistent reference feedback is with interview performance
    status VARCHAR(30) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### Backend (Agent J-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `ReferenceCheck` model |
| `routers/references.py` | CREATE | New router |
| `services/reference_engine.py` | CREATE | Reference questionnaire + synthesis |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/references/request` | JWT | Initiate reference check for a candidate |
| GET | `/references/{id}` | JWT | Get reference check status and results |
| GET | `/references/public/{token}` | None | Reference questionnaire page (for references) |
| POST | `/references/public/{token}/submit` | None | Submit reference responses |
| POST | `/references/{id}/synthesize` | JWT | Generate AI synthesis |

**Reference Questionnaire** (AI-generated based on role):
- Rate candidate's technical skills (1-10)
- Rate collaboration and communication (1-10)
- Would you hire them again? (Yes/No/Maybe)
- Describe their biggest strength
- Describe an area for growth
- Any additional context?

**AI Synthesis** (`reference_engine.py`):
- Aggregate scores across references
- Identify consensus and disagreements
- Compare reference feedback with interview performance
- Generate consistency score (how well references align with AI assessment)
- Flag discrepancies for hiring manager review

#### Frontend (Agent J-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/interviews/[id]/page.tsx` | MODIFY | Add "Reference Check" tab |
| `app/references/[token]/page.tsx` | CREATE | Public reference form |
| `lib/api.ts` | MODIFY | Add reference API methods |

**UI Components**:
- "Request References" button on shortlisted candidates
- Reference input form (add 2-3 references with email/relationship)
- Reference status tracker (pending, completed, declined)
- Synthesis report view with consistency score
- Interview vs Reference comparison chart

#### Tests

- Backend: 6 pytest tests (request, questionnaire, submission, synthesis, consistency)
- Frontend: 6 Playwright E2E tests (request flow, reference form, synthesis view)

---

## Dependency Graph

```
WAVE 1 (no dependencies — run all 4 in parallel)
├── Agent A: Multi-Round Orchestration
├── Agent B: Talent Pool & Matching
├── Agent C: Live Shadowing
└── Agent D: JD Optimizer

WAVE 2 (depends on Wave 1 data models)
├── Agent E: Interview Intelligence (needs: completed interviews from pipelines)
├── Agent F: Bias Detector (needs: talent pool demographics, pipeline data)
└── Agent G: Voice Sentiment (independent, can start with Wave 1)

WAVE 3 (depends on Wave 1 for pipeline; can overlap with Wave 2)
├── Agent H: Candidate Portal (needs: pipeline_candidate model)
├── Agent I: Team Calibration (needs: completed reports)
└── Agent J: Reference Check (needs: shortlisted candidates)
```

---

## Migration Strategy

All database migrations should be chained in order:

```
1. n1_add_hiring_pipeline.py          (Agent A)
2. n2_add_talent_pool.py              (Agent B)
3. n3_add_shadow_columns.py           (Agent C)
4. n4_add_intelligence_report.py      (Agent E)
5. n5_add_fairness_audit.py           (Agent F)
6. n6_add_sentiment_columns.py        (Agent G)
7. n7_add_candidate_portal.py         (Agent H)
8. n8_add_calibration_tables.py       (Agent I)
9. n9_add_reference_check.py          (Agent J)
```

Agent D (JD Optimizer) requires no migrations.

---

## Summary

| Wave | Agents | Features | New Tables | New Endpoints | New Pages | Tests |
|------|--------|----------|------------|---------------|-----------|-------|
| 1 | A, B, C, D | 4 | 3 | 20 | 5 | 54 |
| 2 | E, F, G | 3 | 2 | 12 | 3 | 31 |
| 3 | H, I, J | 3 | 3 | 14 | 4 | 35 |
| **Total** | **10** | **10** | **8** | **46** | **12** | **120** |

---

## Execution Command

To implement, run each wave's agents in parallel:

```
Wave 1: "Implement Agent A" + "Implement Agent B" + "Implement Agent C" + "Implement Agent D"
Wave 2: "Implement Agent E" + "Implement Agent F" + "Implement Agent G"
Wave 3: "Implement Agent H" + "Implement Agent I" + "Implement Agent J"
```

Each agent instruction should reference this plan document and specify:
1. The exact agent letter (A-J)
2. "Follow the multi-agent plan in docs/MULTI_AGENT_PLAN.md"
3. "Implement both backend and frontend as specified"
4. "Write all tests listed"
5. "Do not modify files assigned to other agents"
