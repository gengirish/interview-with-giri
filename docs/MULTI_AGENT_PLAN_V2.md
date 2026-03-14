# Multi-Agent Implementation Plan V2 — 10 Advanced Features

**Product**: Hire with Giri — AI Interview as a Service  
**Scope**: 10 advanced features (Agents K–T), parallelized across agents  
**Prerequisite**: Standalone — no dependency on Plan V1 (Agents A–J)  
**Estimated Total**: ~3 implementation sessions

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION WAVES                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  WAVE 1 (Foundation)             WAVE 2 (Intelligence)                   │
│  ┌───────────────────┐           ┌───────────────────┐                   │
│  │ Agent K            │           │ Agent O            │                  │
│  │ AI Interview       │           │ Interview Clip     │                  │
│  │ Co-Pilot           │           │ Studio             │                  │
│  ├───────────────────┤           ├───────────────────┤                   │
│  │ Agent M            │           │ Agent P            │                  │
│  │ Competency         │           │ Interviewer        │                  │
│  │ Genome Map         │           │ Training Sim       │                  │
│  ├───────────────────┤           ├───────────────────┤                   │
│  │ Agent N            │           │ Agent Q            │                  │
│  │ Dynamic Interview  │           │ Cultural Fit &     │                  │
│  │ Branching          │           │ Values Assessment  │                  │
│  ├───────────────────┤           └───────────────────┘                   │
│  │ Agent R            │                                                   │
│  │ Candidate          │           WAVE 3 (Experience)                     │
│  │ Engagement Signals │           ┌───────────────────┐                   │
│  └───────────────────┘           │ Agent L            │                   │
│                                   │ Predictive Hiring  │                  │
│                                   │ Success Score      │                  │
│                                   ├───────────────────┤                   │
│                                   │ Agent S            │                  │
│                                   │ Hiring Knowledge   │                  │
│                                   │ Base               │                  │
│                                   ├───────────────────┤                   │
│                                   │ Agent T            │                  │
│                                   │ Accessibility      │                  │
│                                   │ Mode               │                  │
│                                   └───────────────────┘                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Existing Schema Context

The plan builds on top of these existing tables (do NOT recreate them):

- `organization`, `users`, `subscription`
- `job_posting`, `interview_session`, `interview_message`
- `candidate_report`, `candidate_feedback`, `report_comment`
- `behavior_event`, `interview_template`

Existing routers (21): auth, billing, dashboard, interviews, job_postings, reports, analytics, users, comments, feedback, templates, uploads, webhooks, health, code_execution, ats, proctoring, practice, coach, ai_ask, organizations.

Existing services (15): ai_engine, scoring_engine, coaching_engine, highlight_engine, notifications, agentmail_client, voice_pipeline, code_executor, audio_analysis, code_analysis, behavior_analytics, ats_integration, livekit_service, calendar_service, job_scraper.

---

## Wave 1 — Foundation Features (Run 4 Agents in Parallel)

### Agent K: AI Interview Co-Pilot

**Goal**: Real-time AI sidebar for human interviewers during live interviews — suggests follow-up questions, tracks competency coverage, warns about legal/bias risks.

#### Database Changes

New tables:

```sql
CREATE TABLE copilot_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_session_id UUID NOT NULL REFERENCES interview_session(id),
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(30) DEFAULT 'active',
    -- status: active, ended
    suggestions JSONB DEFAULT '[]',
    -- [{timestamp, type, content, accepted, reason}]
    competency_coverage JSONB DEFAULT '{}',
    -- {python: {covered: true, depth: 3}, system_design: {covered: false, depth: 0}}
    legal_alerts JSONB DEFAULT '[]',
    -- [{timestamp, question_text, risk_type, severity, suggestion}]
    config JSONB DEFAULT '{}',
    -- {auto_suggest: true, legal_check: true, suggest_interval_seconds: 60}
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    UNIQUE(interview_session_id, user_id)
);
```

#### Backend (Agent K-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `CopilotSession` model |
| `models/schemas.py` | ADD | `CopilotSessionCreate`, `CopilotSuggestion`, `CopilotStatus` schemas |
| `routers/copilot.py` | CREATE | New router |
| `services/copilot_engine.py` | CREATE | AI suggestion engine |
| `websocket/copilot_handler.py` | CREATE | Real-time WebSocket for copilot sidebar |
| `websocket/chat_handler.py` | MODIFY | Broadcast messages to copilot connections |
| `main.py` | MODIFY | Register copilot router + WebSocket route |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/copilot/start/{session_id}` | JWT | Start copilot for an interview |
| GET | `/copilot/{id}` | JWT | Get copilot session with suggestions |
| GET | `/copilot/{id}/coverage` | JWT | Get live competency coverage map |
| POST | `/copilot/{id}/accept-suggestion` | JWT | Mark a suggestion as accepted |
| POST | `/copilot/{id}/end` | JWT | End copilot session |
| GET | `/copilot/history` | JWT | List past copilot sessions with stats |

**WebSocket Architecture**:

```
Candidate ──── WS /ws/interview/{token} ──── AI Engine
                      │
                      ├── broadcasts each message to ──┐
                      │                                 │
Interviewer ── WS /ws/copilot/{copilot_id} ────────────┘
                      │
                      ├── receives: suggestions, coverage updates, legal alerts
                      └── sends: {type: "request_suggestion"} for on-demand suggestions
```

**Copilot Engine Logic** (`copilot_engine.py`):

1. **Follow-up Suggestion** — After each candidate response, analyze transcript + job skills and suggest 2-3 targeted follow-up questions. Include rationale ("Candidate mentioned Redis but didn't explain caching strategy").
2. **Competency Coverage Tracker** — Map job's `required_skills` to a coverage grid. After each Q&A exchange, update which skills have been assessed and at what depth (1=mentioned, 2=explored, 3=deep-dived).
3. **Legal/Bias Risk Scanner** — Scan each interviewer question in real-time for:
   - Age-related ("How old are you?", "When did you graduate?")
   - Family/marital status ("Do you have kids?", "Are you married?")
   - Religion/origin ("Where are you from originally?")
   - Disability ("Do you have any health issues?")
   - Generate severity (warning/critical) and suggest compliant alternatives.
4. **Time Allocation Monitor** — Track time spent per competency. Alert when >50% of time is on one skill while others are uncovered.

**AI Prompt** (for suggestion generation):

```
You are an interview co-pilot assisting a hiring manager in real-time.

Job: {title} | Skills: {required_skills}
Competencies NOT yet covered: {uncovered_skills}
Time remaining: ~{remaining_minutes} minutes
Last candidate response: {last_response}

Generate 2-3 follow-up question suggestions. Each should:
1. Target an uncovered competency if possible
2. Build naturally on what the candidate just said
3. Include a brief rationale (1 sentence)

Return JSON:
[
  {
    "question": "Can you walk me through how you'd design the caching layer?",
    "targets_skill": "System Design",
    "rationale": "Candidate mentioned Redis but didn't explain their caching strategy",
    "difficulty": "medium"
  }
]
```

#### Frontend (Agent K-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/copilot/[sessionId]/page.tsx` | CREATE | Copilot sidebar page (opens alongside interview) |
| `app/dashboard/interviews/[id]/page.tsx` | MODIFY | Add "Launch Co-Pilot" button for in-progress interviews |
| `components/copilot/suggestion-card.tsx` | CREATE | Individual suggestion display |
| `components/copilot/coverage-grid.tsx` | CREATE | Skill coverage heat grid |
| `components/copilot/legal-alert.tsx` | CREATE | Legal risk warning banner |
| `components/copilot/time-tracker.tsx` | CREATE | Time allocation bar chart |
| `lib/api.ts` | MODIFY | Add copilot API methods |

**UI Components**:

- **Split-screen layout**: Left = live interview transcript (read-only), Right = copilot panel
- **Suggestion cards**: Each card shows question, target skill, rationale. "Use This" button copies to clipboard.
- **Coverage grid**: Visual matrix of skills vs depth (color-coded: red=uncovered, yellow=shallow, green=deep)
- **Legal alert bar**: Fixed top banner, red for critical, yellow for warning, shows safe alternative
- **Time pie chart**: Time spent per competency area
- **"Suggest Now" button**: On-demand suggestion request

#### Tests

- Backend: 7 pytest tests (start copilot, suggestion generation, coverage tracking, legal detection, WebSocket connection, accept suggestion, history)
- Frontend: 7 Playwright E2E tests (copilot page layout, suggestion cards, coverage grid, legal alert, time tracker, launch button, WebSocket mock)

---

### Agent M: Competency Genome Map

**Goal**: Create a visual "DNA fingerprint" for each candidate showing competency profile across 20+ dimensions, buildable across multiple interviews, comparable against ideal role profiles.

#### Database Changes

New tables:

```sql
CREATE TABLE competency_genome (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    candidate_email VARCHAR(255) NOT NULL,
    candidate_name VARCHAR(255),
    genome_data JSONB NOT NULL DEFAULT '{}',
    -- {
    --   dimensions: {
    --     "problem_solving": {score: 8.2, confidence: 0.9, sources: [{session_id, score, date}]},
    --     "system_design": {score: 7.0, confidence: 0.7, sources: [...]},
    --     "communication": {score: 9.0, confidence: 0.95, sources: [...]},
    --     ...20+ dimensions
    --   },
    --   interview_count: 3,
    --   last_updated: "2026-03-10T..."
    -- }
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, candidate_email)
);

CREATE TABLE role_genome_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    role_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    ideal_genome JSONB NOT NULL DEFAULT '{}',
    -- {
    --   "problem_solving": {min: 7, ideal: 9, weight: 0.15},
    --   "system_design": {min: 8, ideal: 9, weight: 0.20},
    --   ...
    -- }
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, role_type)
);
```

#### Backend (Agent M-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `CompetencyGenome`, `RoleGenomeProfile` models |
| `models/schemas.py` | ADD | Genome-related Pydantic schemas |
| `routers/genome.py` | CREATE | New router |
| `services/genome_engine.py` | CREATE | Genome extraction + comparison logic |
| `services/scoring_engine.py` | MODIFY | Auto-update genome after report generation |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/genome/candidate/{email}` | JWT | Get candidate's competency genome |
| GET | `/genome/candidates` | JWT | List all candidate genomes (searchable) |
| POST | `/genome/compare` | JWT | Compare 2-5 candidate genomes side-by-side |
| POST | `/genome/match/{job_id}` | JWT | Match candidate genome against role profile |
| GET | `/genome/role-profiles` | JWT | List role genome profiles |
| POST | `/genome/role-profiles` | JWT | Create/update ideal role genome |
| GET | `/genome/role-profiles/{id}` | JWT | Get single role profile |
| DELETE | `/genome/role-profiles/{id}` | JWT | Delete role profile |
| POST | `/genome/rebuild/{email}` | JWT | Force-rebuild genome from all interviews |

**Genome Engine Logic** (`genome_engine.py`):

Standard 24-dimension taxonomy:

```python
COMPETENCY_DIMENSIONS = [
    # Technical
    "problem_solving", "system_design", "data_structures",
    "algorithms", "code_quality", "debugging", "architecture",
    "database_design", "api_design", "security_awareness",
    # Behavioral
    "communication", "leadership", "teamwork", "adaptability",
    "conflict_resolution", "time_management", "initiative",
    # Strategic
    "business_acumen", "customer_focus", "innovation",
    "decision_making", "analytical_thinking",
    # Cultural
    "cultural_alignment", "growth_mindset"
]
```

1. **Extraction** — After each interview report, AI maps skill scores + behavioral scores + AI summary onto the 24 dimensions. Each dimension gets a 0-10 score with confidence level.
2. **Aggregation** — When candidate has multiple interviews, merge scores using confidence-weighted average. More recent interviews get higher weight.
3. **Comparison** — Generate overlap percentage between candidate genome and role profile. Highlight gaps and overqualifications.
4. **Visualization Data** — Return data structured for radar/spider charts and heatmaps.

**AI Prompt** (for genome extraction from report):

```
Given this interview report, map the candidate's performance to our competency taxonomy.

Report:
- Skills scores: {skill_scores}
- Behavioral scores: {behavioral_scores}
- AI Summary: {ai_summary}
- Strengths: {strengths}
- Concerns: {concerns}

Map to these dimensions (score 0-10, confidence 0.0-1.0):
{COMPETENCY_DIMENSIONS}

Only score dimensions that have evidence in the report. Leave others null.

Return JSON:
{
  "problem_solving": {"score": 8.5, "confidence": 0.9, "evidence": "Broke down the problem systematically..."},
  "communication": {"score": 7.0, "confidence": 0.8, "evidence": "Clear explanations but could be more concise..."},
  ...
}
```

#### Frontend (Agent M-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/genome/page.tsx` | CREATE | Genome explorer (browse candidates) |
| `app/dashboard/genome/compare/page.tsx` | CREATE | Side-by-side genome comparison |
| `app/dashboard/genome/profiles/page.tsx` | CREATE | Role profile manager |
| `app/dashboard/interviews/[id]/page.tsx` | MODIFY | Add "Genome" tab to interview detail |
| `components/genome/radar-chart.tsx` | CREATE | Radar/spider chart for genome |
| `components/genome/comparison-grid.tsx` | CREATE | Multi-candidate comparison matrix |
| `components/genome/role-fit-gauge.tsx` | CREATE | Candidate vs role fit percentage |
| `lib/api.ts` | MODIFY | Add genome API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Genome" nav item |

**UI Components**:

- **Radar chart**: 24-dimension spider chart with candidate scores + role profile overlay. Uses Recharts `RadarChart`.
- **Heatmap grid**: Candidates as rows, dimensions as columns, color-coded by score.
- **Comparison view**: 2-5 radar charts overlaid, with a comparison table below showing dimension-by-dimension scores.
- **Role fit gauge**: Circular percentage (e.g., "87% match for Senior Backend Engineer"), click to see per-dimension breakdown.
- **Genome timeline**: How a candidate's genome evolved across interviews (line chart per dimension).
- **Role profile builder**: Interactive sliders to set min/ideal/weight for each dimension.

#### Tests

- Backend: 8 pytest tests (genome extraction, aggregation, comparison, role matching, rebuild, CRUD)
- Frontend: 7 Playwright E2E tests (radar chart, comparison view, role profile builder, genome tab, navigation)

---

### Agent N: Dynamic Interview Branching (Decision Trees)

**Goal**: Let hiring managers design non-linear interview flows using a visual editor. The AI follows the decision tree in real-time, adapting the interview path based on live performance.

#### Database Changes

New tables:

```sql
CREATE TABLE interview_decision_tree (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    role_type VARCHAR(100),
    tree_data JSONB NOT NULL DEFAULT '{}',
    -- {
    --   nodes: [
    --     {id: "start", type: "entry", next: "q1"},
    --     {id: "q1", type: "question_block", config: {
    --       topic: "System Design", num_questions: 3, difficulty: "medium"
    --     }, branches: [
    --       {condition: "score >= 8", next: "q2_advanced", label: "Strong"},
    --       {condition: "score >= 5", next: "q2_standard", label: "Adequate"},
    --       {condition: "score < 5", next: "q2_foundational", label: "Needs Work"}
    --     ]},
    --     {id: "q2_advanced", type: "question_block", config: {
    --       topic: "Architecture Deep Dive", num_questions: 4, difficulty: "hard"
    --     }, branches: [{condition: "always", next: "end"}]},
    --     {id: "end", type: "exit"}
    --   ],
    --   metadata: {estimated_duration: 45, max_questions: 15}
    -- }
    is_published BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

Modify existing table:

```sql
ALTER TABLE interview_session
    ADD COLUMN decision_tree_id UUID REFERENCES interview_decision_tree(id),
    ADD COLUMN tree_state JSONB DEFAULT NULL;
    -- tree_state: {current_node: "q2_advanced", path_taken: ["start", "q1", "q2_advanced"],
    --   node_scores: {"q1": 8.5, "q2_advanced": null}, questions_asked: 7}
```

#### Backend (Agent N-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `InterviewDecisionTree` model; MODIFY `InterviewSession` (add `decision_tree_id`, `tree_state`) |
| `models/schemas.py` | ADD | Tree-related schemas (node types, branch conditions, tree state) |
| `routers/decision_trees.py` | CREATE | New router |
| `services/tree_engine.py` | CREATE | Tree traversal + branching logic |
| `services/ai_engine.py` | MODIFY | Support tree-aware question generation |
| `websocket/chat_handler.py` | MODIFY | Integrate tree engine for question flow control |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/decision-trees` | JWT | List trees for org |
| POST | `/decision-trees` | JWT | Create tree |
| GET | `/decision-trees/{id}` | JWT | Get tree with usage stats |
| PUT | `/decision-trees/{id}` | JWT | Update tree |
| DELETE | `/decision-trees/{id}` | JWT | Delete tree |
| POST | `/decision-trees/{id}/publish` | JWT | Publish (make available for interviews) |
| POST | `/decision-trees/{id}/duplicate` | JWT | Clone tree |
| POST | `/decision-trees/validate` | JWT | Validate tree structure (no dead ends, reachable exit) |
| GET | `/decision-trees/{id}/analytics` | JWT | Path analytics (which branches are taken most) |

**Tree Engine Logic** (`tree_engine.py`):

1. **Initialization** — When session starts with `decision_tree_id`, load tree, set `current_node = "start"`, navigate to first question block.
2. **Question Generation** — At each question block node, generate questions matching the node's `topic`, `num_questions`, and `difficulty` using `ai_engine`.
3. **Scoring Gate** — After a question block completes, score the block (average of per-question scores). Evaluate branch conditions to determine next node.
4. **Branch Conditions** — Support operators: `>=`, `<=`, `>`, `<`, `==`, `always`. Evaluate in order, first match wins.
5. **State Tracking** — Update `tree_state` on `InterviewSession` after each node transition. Record `path_taken` and `node_scores`.
6. **Path Analytics** — Aggregate `path_taken` across all sessions using a tree. Generate Sankey diagram data.

**Integration with `chat_handler.py`**:

```python
# In the existing chat flow, after scoring each response:
if session.decision_tree_id:
    tree_state = await tree_engine.evaluate_transition(session)
    if tree_state.should_transition:
        # Move to next node, update question topic/difficulty
        next_node = tree_state.next_node
        ai_config = next_node.config  # override topic + difficulty
```

#### Frontend (Agent N-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/decision-trees/page.tsx` | CREATE | Tree list + creation |
| `app/dashboard/decision-trees/[id]/page.tsx` | CREATE | Visual tree editor |
| `app/dashboard/decision-trees/[id]/analytics/page.tsx` | CREATE | Path analytics (Sankey) |
| `app/dashboard/jobs/page.tsx` | MODIFY | Add decision tree selection to job config |
| `components/decision-tree/node-editor.tsx` | CREATE | Node configuration modal |
| `components/decision-tree/branch-editor.tsx` | CREATE | Branch condition builder |
| `components/decision-tree/tree-canvas.tsx` | CREATE | Visual tree canvas (nodes + edges) |
| `components/decision-tree/path-sankey.tsx` | CREATE | Sankey diagram of interview paths |
| `lib/api.ts` | MODIFY | Add decision tree API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Decision Trees" nav item |

**UI Components**:

- **Visual tree editor**: Canvas-based node graph. Drag to add nodes, connect with edges. Each node opens a config modal.
- **Node types**: Entry (green circle), Question Block (blue rectangle with topic/difficulty/count), Exit (red circle).
- **Branch condition builder**: Dropdown (score >= / <= / > / < / ==) + value input. Color-coded edges (green=strong path, yellow=adequate, red=needs work).
- **Preview mode**: Step through the tree with simulated scores to verify paths.
- **Sankey diagram**: Shows how candidates flow through the tree — thick paths = common, thin = rare.
- **Job integration**: When creating/editing a job, optional dropdown to attach a published decision tree.

**npm dependency**: `reactflow` for the visual node editor.

#### Tests

- Backend: 8 pytest tests (CRUD, validation, tree traversal, branch evaluation, state tracking, path analytics, chat integration, publish/duplicate)
- Frontend: 7 Playwright E2E tests (tree editor, node creation, branch conditions, preview, Sankey chart, job attachment, navigation)

---

### Agent R: Candidate Engagement Signals

**Goal**: Track behavioral micro-signals during interviews (response latency, answer confidence, hesitation patterns) and generate an Engagement Profile that supplements content-based scoring.

#### Database Changes

Modify existing tables:

```sql
ALTER TABLE interview_message
    ADD COLUMN engagement_metrics JSONB DEFAULT NULL;
    -- {
    --   response_latency_ms: 4500,
    --   word_count: 145,
    --   words_per_minute: 128,
    --   hedging_score: 0.3,      -- frequency of "maybe", "I think", "probably"
    --   assertiveness_score: 0.7, -- frequency of definitive statements
    --   elaboration_depth: 3,     -- sentences per key point
    --   question_engagement: 0.8  -- relevance of answer to the question asked
    -- }

ALTER TABLE candidate_report
    ADD COLUMN engagement_profile JSONB DEFAULT NULL;
    -- {
    --   overall_engagement: 0.78,
    --   response_speed: {avg_ms: 3200, trend: "improving", consistency: 0.8},
    --   confidence_pattern: {avg: 0.72, arc: [{q: 1, v: 0.6}, {q: 2, v: 0.8}]},
    --   elaboration_trend: {avg_depth: 2.8, trend: "stable"},
    --   notable_signals: [
    --     {type: "confidence_spike", question: 3, detail: "Highly confident discussing distributed systems"},
    --     {type: "hesitation_cluster", question: 5, detail: "Significant hedging on management experience"}
    --   ]
    -- }
```

#### Backend (Agent R-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | MODIFY | Add `engagement_metrics` to `InterviewMessage`, `engagement_profile` to `CandidateReport` |
| `models/schemas.py` | ADD | `EngagementMetrics`, `EngagementProfile` schemas |
| `services/engagement_analyzer.py` | CREATE | Per-message analysis + profile aggregation |
| `websocket/chat_handler.py` | MODIFY | Compute engagement metrics per message |
| `services/scoring_engine.py` | MODIFY | Generate engagement profile during report |
| `routers/reports.py` | MODIFY | Add engagement endpoint |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/reports/{id}/engagement` | JWT | Get engagement profile for a session |

**Engagement Analyzer Logic** (`engagement_analyzer.py`):

1. **Per-Message Metrics** (computed in real-time during chat):
   - `response_latency_ms` — Time between AI question sent and candidate response received.
   - `word_count` / `words_per_minute` — Basic length metrics.
   - `hedging_score` — Regex + NLP count of hedging phrases ("I think", "maybe", "sort of", "probably", "I guess") normalized to 0-1.
   - `assertiveness_score` — Count of definitive phrases ("I built", "I led", "definitely", "absolutely") normalized to 0-1.
   - `elaboration_depth` — Number of distinct points/sentences in the response.
   - `question_engagement` — AI-scored relevance of the answer to the asked question (0-1).

2. **Profile Aggregation** (computed during report generation):
   - Aggregate per-message metrics into trends (improving, declining, stable).
   - Identify notable signals: confidence spikes/drops, hesitation clusters, engagement peaks.
   - Calculate overall engagement score (weighted composite).

3. **No AI call per-message** (except `question_engagement`): Most metrics are computed using local NLP/regex for speed. Only `question_engagement` uses a lightweight AI call.

#### Frontend (Agent R-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/interviews/[id]/page.tsx` | MODIFY | Add "Engagement" tab |
| `components/engagement/engagement-timeline.tsx` | CREATE | Line chart of engagement metrics over questions |
| `components/engagement/signal-cards.tsx` | CREATE | Notable signal highlight cards |
| `components/engagement/response-speed-chart.tsx` | CREATE | Response latency trend chart |
| `lib/api.ts` | MODIFY | Add engagement API method |

**UI Components**:

- **Engagement timeline**: Multi-line chart (confidence, assertiveness, elaboration) across interview questions. Uses Recharts `LineChart`.
- **Response speed chart**: Bar chart of response latency per question, with average line overlay.
- **Signal cards**: Cards highlighting notable moments (e.g., "Confidence peaked on Q3: Distributed Systems" or "Hesitation cluster on Q5-Q6: Leadership questions").
- **Overall engagement badge**: In the interview header alongside existing score — circular gauge showing 0-100%.
- **Color-coded transcript**: In the existing message view, add subtle background tinting (green=high engagement, gray=neutral, yellow=low engagement).

#### Tests

- Backend: 6 pytest tests (per-message metrics, hedging detection, assertiveness detection, profile aggregation, engagement endpoint, integration with scoring)
- Frontend: 5 Playwright E2E tests (engagement tab, timeline chart, signal cards, speed chart, badge)

---

## Wave 2 — Intelligence Features (Run 3 Agents in Parallel)

> **Depends on**: Wave 1 for engagement signals (Agent R). Agents O and P can technically start independently.

### Agent O: Interview Clip Studio

**Goal**: AI automatically identifies the most important moments from each interview and generates shareable clips (text excerpts with context) that stakeholders can review in 2 minutes instead of reading full transcripts.

#### Database Changes

New tables:

```sql
CREATE TABLE interview_clip (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interview_session(id),
    org_id UUID NOT NULL REFERENCES organization(id),
    clip_type VARCHAR(50) NOT NULL,
    -- clip_type: best_answer, red_flag, key_insight, culture_signal,
    --            technical_deep_dive, growth_indicator
    title VARCHAR(255) NOT NULL,
    description TEXT,
    message_start_index INTEGER NOT NULL,
    message_end_index INTEGER NOT NULL,
    transcript_excerpt TEXT NOT NULL,
    importance_score NUMERIC(3,2),  -- 0.00 to 1.00
    tags JSONB DEFAULT '[]',
    share_token VARCHAR(64) UNIQUE,
    share_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE clip_collection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    clip_ids JSONB NOT NULL DEFAULT '[]',
    share_token VARCHAR(64) UNIQUE,
    share_expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Backend (Agent O-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `InterviewClip`, `ClipCollection` models |
| `models/schemas.py` | ADD | Clip-related schemas |
| `routers/clips.py` | CREATE | New router |
| `services/clip_engine.py` | CREATE | AI clip extraction |
| `services/scoring_engine.py` | MODIFY | Auto-generate clips after report creation |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/clips/session/{session_id}` | JWT | Get all clips for an interview |
| POST | `/clips/generate/{session_id}` | JWT | Manually trigger clip extraction |
| GET | `/clips/{id}` | JWT | Get single clip |
| DELETE | `/clips/{id}` | JWT | Delete clip |
| POST | `/clips/{id}/share` | JWT | Generate share link |
| GET | `/clips/public/{token}` | None | View shared clip |
| POST | `/clip-collections` | JWT | Create collection |
| GET | `/clip-collections` | JWT | List collections |
| GET | `/clip-collections/{id}` | JWT | Get collection with clips |
| POST | `/clip-collections/{id}/share` | JWT | Generate share link for collection |
| GET | `/clip-collections/public/{token}` | None | View shared collection |

**Clip Engine Logic** (`clip_engine.py`):

AI prompt analyzes full transcript and identifies 3-7 key moments:

```
Analyze this interview transcript and identify the 3-7 most noteworthy moments.

Categories:
- best_answer: Candidate gave an exceptionally strong response
- red_flag: Response revealed a significant concern
- key_insight: Revealed important information about candidate's thinking
- culture_signal: Showed alignment (or misalignment) with team values
- technical_deep_dive: Demonstrated deep technical expertise
- growth_indicator: Showed capacity for learning and development

For each clip, provide:
1. Category
2. Title (10 words max, compelling)
3. Description (1-2 sentences explaining why this moment matters)
4. Start and end message indices
5. Importance score (0.0 to 1.0)

Return JSON array of clips.
```

**Auto-generation**: After `scoring_engine.generate_report()` completes, call `clip_engine.extract_clips()` automatically.

#### Frontend (Agent O-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/interviews/[id]/page.tsx` | MODIFY | Add "Clips" tab |
| `app/dashboard/clips/page.tsx` | CREATE | Clip studio — browse all clips across interviews |
| `app/clips/[token]/page.tsx` | CREATE | Public shared clip viewer |
| `components/clips/clip-card.tsx` | CREATE | Clip card with type badge, transcript excerpt |
| `components/clips/clip-reel.tsx` | CREATE | Horizontal scrollable reel of clips |
| `components/clips/collection-builder.tsx` | CREATE | Drag-and-drop clip collection creator |
| `lib/api.ts` | MODIFY | Add clips API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Clips" nav item |
| `middleware/tenant.py` | MODIFY | Add `/api/v1/clips/public/` and `/api/v1/clip-collections/public/` to public prefixes |

**UI Components**:

- **Clip card**: Type badge (color-coded by category), title, 2-line excerpt preview, importance bar, share button.
- **Clip reel**: Horizontal scroll of top clips on the interview detail page (Netflix-style carousel).
- **Collection builder**: Drag clips from a sidebar into a collection. Reorder. Add collection title/description.
- **Shared clip viewer**: Clean public page showing clip with transcript, category badge, interview context (role, date). No login required.
- **Clip studio page**: Grid of all clips across interviews, filterable by type, date, job. Search by keyword.

#### Tests

- Backend: 7 pytest tests (clip extraction, CRUD, share token, public access, collections, auto-generation)
- Frontend: 7 Playwright E2E tests (clips tab, clip studio page, clip card elements, share link, collection builder, public viewer)

---

### Agent P: Interviewer Training Simulator

**Goal**: AI-powered training mode where hiring managers practice interviewing a simulated candidate. The AI plays the candidate (with configurable skill levels and personalities), then scores the interviewer on question quality, competency coverage, bias avoidance, and candidate experience.

#### Database Changes

New tables:

```sql
CREATE TABLE training_simulation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role_type VARCHAR(100) NOT NULL,
    candidate_persona JSONB NOT NULL,
    -- {
    --   name: "Alex Chen",
    --   experience_years: 5,
    --   skill_level: "senior",        -- junior, mid, senior, principal
    --   personality: "reserved",       -- confident, reserved, nervous, verbose, concise
    --   hidden_strengths: ["system design", "mentoring"],
    --   hidden_weaknesses: ["time management", "confrontation"],
    --   background: "5 years at mid-size startup, transitioned from frontend to full-stack"
    -- }
    messages JSONB DEFAULT '[]',
    -- [{role: "interviewer"|"candidate", content: "...", timestamp: "..."}]
    status VARCHAR(30) DEFAULT 'active',
    -- status: active, completed, abandoned
    scorecard JSONB DEFAULT NULL,
    -- {
    --   overall: 7.5,
    --   question_quality: {score: 8, feedback: "Good mix of behavioral and technical"},
    --   competency_coverage: {score: 6, feedback: "Missed system design entirely", coverage_map: {...}},
    --   bias_avoidance: {score: 9, feedback: "No problematic questions detected"},
    --   candidate_experience: {score: 7, feedback: "Good rapport but could give more time to respond"},
    --   depth_vs_breadth: {score: 7, feedback: "Good balance but stayed surface-level on Python"},
    --   time_management: {score: 6, feedback: "Spent 60% of time on one topic"},
    --   tips: ["Try the STAR method to probe behavioral answers", "Ask 'tell me more' to go deeper"]
    -- }
    duration_seconds INTEGER,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);
```

#### Backend (Agent P-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `TrainingSimulation` model |
| `models/schemas.py` | ADD | `SimulationCreate`, `CandidatePersona`, `InterviewerScorecard` schemas |
| `routers/training.py` | CREATE | New router |
| `services/training_engine.py` | CREATE | Candidate simulation + interviewer scoring |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/training/start` | JWT | Start new training simulation |
| POST | `/training/{id}/message` | JWT | Send interviewer message, get candidate response |
| POST | `/training/{id}/end` | JWT | End simulation, get scorecard |
| GET | `/training/{id}` | JWT | Get simulation with messages and scorecard |
| GET | `/training/history` | JWT | User's training history with scores |
| GET | `/training/leaderboard` | JWT | Org-wide interviewer training leaderboard |
| GET | `/training/personas` | JWT | List available candidate personas |
| POST | `/training/personas/random` | JWT | Generate random persona for a role |

**Training Engine Logic** (`training_engine.py`):

1. **Persona Generation** — Create realistic candidate personas with skill levels, personality traits, hidden strengths/weaknesses, and background stories. Can be pre-built or AI-generated.

2. **Candidate Simulation Prompt**:

```
You are roleplaying as a job candidate in a practice interview.

Your persona:
- Name: {name}
- Experience: {experience_years} years
- Skill level: {skill_level}
- Personality: {personality}
- Background: {background}
- Hidden strengths: {hidden_strengths} (reveal only if asked good probing questions)
- Hidden weaknesses: {hidden_weaknesses} (reveal only if interviewer creates safe space)

Rules:
1. Stay in character. Respond as this person would.
2. Match the personality: {personality_description}
3. Give realistic answers — not perfect. Include "um", natural pauses for nervous persona.
4. Only reveal hidden strengths/weaknesses if the interviewer asks insightful questions.
5. If asked an illegal question (age, marital status, etc.), respond naturally but note it internally.
6. Keep responses to 3-5 sentences unless the interviewer asks you to elaborate.
```

3. **Interviewer Scoring Prompt** (used at simulation end):

```
You just observed a practice interview. Score the INTERVIEWER (not the candidate).

Transcript: {messages}
Role being interviewed for: {role_type}
Required skills for this role: {required_skills}

Score these dimensions (1-10) with specific feedback:
1. Question Quality — Were questions clear, open-ended, relevant?
2. Competency Coverage — Were all required skills assessed?
3. Bias Avoidance — Any legally problematic questions?
4. Candidate Experience — Did they build rapport? Were they respectful of time?
5. Depth vs Breadth — Good balance of exploration?
6. Time Management — Efficient use of interview time?

Also provide 3 actionable tips for improvement.

Return JSON scorecard.
```

#### Frontend (Agent P-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/training/page.tsx` | CREATE | Training hub — start simulation, view history |
| `app/dashboard/training/[id]/page.tsx` | CREATE | Active simulation chat + scorecard |
| `components/training/persona-selector.tsx` | CREATE | Persona picker with difficulty badges |
| `components/training/scorecard-view.tsx` | CREATE | Scorecard display with radar chart |
| `components/training/leaderboard.tsx` | CREATE | Org-wide leaderboard table |
| `lib/api.ts` | MODIFY | Add training API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Training" nav item |

**UI Components**:

- **Training hub**: "Start Simulation" button, persona selector, history list with trend sparklines.
- **Simulation chat**: Chat interface styled differently from candidate interviews (purple theme). Interviewer types questions, AI candidate responds. Timer showing elapsed time.
- **Scorecard page**: After ending simulation — radar chart of 6 dimensions, per-dimension cards with score + feedback, improvement tips with action items.
- **Leaderboard**: Table showing team members, their average training scores, simulations completed, and improvement trend arrows.
- **Persona cards**: Character card with name, experience, personality badge, difficulty level (easy/medium/hard).

#### Tests

- Backend: 7 pytest tests (start simulation, message exchange, persona generation, end + scoring, history, leaderboard, persona consistency)
- Frontend: 6 Playwright E2E tests (training hub, simulation chat, scorecard, leaderboard, persona selector, history)

---

### Agent Q: Cultural Fit & Values Assessment

**Goal**: Companies define core values, AI generates scenario-based behavioral questions aligned to each value, then analyzes candidate responses for value alignment. Produces a radar chart of cultural fit.

#### Database Changes

New tables:

```sql
CREATE TABLE company_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    values JSONB NOT NULL DEFAULT '[]',
    -- [
    --   {name: "Ownership", definition: "Takes responsibility for outcomes, not just tasks",
    --    weight: 0.25, behavioral_indicators: ["Takes initiative", "Follows through"]},
    --   {name: "Customer Obsession", definition: "Starts with the customer and works backwards",
    --    weight: 0.25, behavioral_indicators: ["Mentions user impact", "Considers UX"]},
    --   ...
    -- ]
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id)
);

CREATE TABLE values_assessment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interview_session(id),
    org_id UUID NOT NULL REFERENCES organization(id),
    value_scores JSONB NOT NULL DEFAULT '{}',
    -- {
    --   "Ownership": {score: 8.5, confidence: 0.85, evidence: ["Described taking initiative on...", ...]},
    --   "Customer Obsession": {score: 6.0, confidence: 0.7, evidence: ["Mentioned users once but..."]},
    --   ...
    -- }
    overall_fit_score NUMERIC(4,2),
    fit_label VARCHAR(50),
    -- fit_label: "Strong Fit", "Good Fit", "Moderate Fit", "Weak Fit"
    ai_narrative TEXT,
    -- 2-3 paragraph narrative of cultural alignment
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(session_id)
);
```

#### Backend (Agent Q-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `CompanyValues`, `ValuesAssessment` models |
| `models/schemas.py` | ADD | Values-related schemas |
| `routers/values.py` | CREATE | New router |
| `services/values_engine.py` | CREATE | Values question generation + assessment |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/values` | JWT | Get org's defined values |
| PUT | `/values` | JWT (admin) | Set/update org values |
| POST | `/values/generate-questions` | JWT | Generate scenario questions for defined values |
| POST | `/values/assess/{session_id}` | JWT | Run values assessment on completed interview |
| GET | `/values/assessment/{session_id}` | JWT | Get assessment results |
| GET | `/values/org-trends` | JWT | Aggregate values alignment across all candidates |

**Values Engine Logic** (`values_engine.py`):

1. **Question Generation** — For each company value, generate 2-3 scenario-based behavioral questions:

```
Company value: "{name}" — {definition}
Behavioral indicators: {behavioral_indicators}

Generate 2 scenario-based interview questions that assess this value.
Questions should present realistic workplace situations and ask the candidate
how they would respond. Avoid direct questions like "Do you value ownership?"

Return JSON:
[
  {"question": "Tell me about a time when...", "probes": ["What was the outcome?", "What did you learn?"]}
]
```

2. **Assessment** — After interview completes, analyze transcript against each value:

```
Company values: {values_with_definitions}
Interview transcript: {transcript}

For each value, analyze the candidate's responses and assess alignment.
Look for behavioral indicators mentioned by the candidate, even indirectly.

Return JSON with score (1-10), confidence, and specific evidence from transcript.
```

3. **Fit Label** — Based on weighted average: >=8 "Strong Fit", >=6 "Good Fit", >=4 "Moderate Fit", <4 "Weak Fit".

#### Frontend (Agent Q-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/settings/page.tsx` | MODIFY | Add "Company Values" section to settings |
| `app/dashboard/interviews/[id]/page.tsx` | MODIFY | Add "Cultural Fit" tab |
| `components/values/values-editor.tsx` | CREATE | Drag-and-drop values editor with weights |
| `components/values/fit-radar.tsx` | CREATE | Radar chart of value alignment |
| `components/values/evidence-list.tsx` | CREATE | Per-value evidence cards |
| `lib/api.ts` | MODIFY | Add values API methods |

**UI Components**:

- **Values editor** (in Settings): Add/remove/reorder values. Each value has name, definition, weight slider, behavioral indicators (tag input). Drag to reorder priority.
- **Fit radar chart**: Spider/radar chart with each value as an axis. Candidate score plotted. Ideal (10) shown as dotted outline.
- **Evidence cards**: For each value, expandable card showing score, confidence, and quoted transcript evidence.
- **AI narrative**: 2-3 paragraph prose summary of cultural alignment, displayed as a styled callout block.
- **Fit badge**: On interview detail header — "Strong Fit" (green), "Good Fit" (blue), "Moderate Fit" (yellow), "Weak Fit" (red).

#### Tests

- Backend: 6 pytest tests (CRUD values, question generation, assessment, fit scoring, org trends)
- Frontend: 6 Playwright E2E tests (values editor, fit radar, evidence list, narrative, fit badge, settings integration)

---

## Wave 3 — Experience Features (Run 3 Agents in Parallel)

> **Depends on**: Wave 1 (engagement signals) and Wave 2 (clips). Agent T is fully independent.

### Agent L: Predictive Hiring Success Score

**Goal**: ML-powered prediction engine that correlates interview performance patterns with on-the-job success. Companies provide retention/performance feedback, and the model learns which interview signals predict top performers.

#### Database Changes

New tables:

```sql
CREATE TABLE hiring_outcome (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    session_id UUID NOT NULL REFERENCES interview_session(id),
    candidate_email VARCHAR(255) NOT NULL,
    was_hired BOOLEAN NOT NULL,
    hire_date DATE,
    -- Post-hire feedback (filled in later)
    performance_rating NUMERIC(3,1),    -- 1.0-5.0
    retention_months INTEGER,
    is_still_employed BOOLEAN,
    left_reason VARCHAR(100),
    -- left_reason: voluntary, involuntary, contract_end, promotion_out
    manager_feedback TEXT,
    feedback_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(session_id)
);

CREATE TABLE prediction_model (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    model_version INTEGER DEFAULT 1,
    training_sample_size INTEGER,
    feature_weights JSONB NOT NULL,
    -- {
    --   "overall_score": 0.25,
    --   "communication_score": 0.15,
    --   "engagement_overall": 0.12,
    --   "confidence_pattern_stability": 0.10,
    --   "elaboration_depth_avg": 0.08,
    --   ...
    -- }
    accuracy_metrics JSONB NOT NULL,
    -- {precision: 0.82, recall: 0.78, f1: 0.80, auc_roc: 0.85}
    is_active BOOLEAN DEFAULT true,
    trained_at TIMESTAMPTZ DEFAULT now()
);
```

#### Backend (Agent L-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `HiringOutcome`, `PredictionModel` models |
| `models/schemas.py` | ADD | Outcome + prediction schemas |
| `routers/predictions.py` | CREATE | New router |
| `services/prediction_engine.py` | CREATE | Feature extraction + prediction logic |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/predictions/outcomes` | JWT | Record hiring outcome |
| PUT | `/predictions/outcomes/{session_id}` | JWT | Update with post-hire feedback |
| GET | `/predictions/outcomes` | JWT | List outcomes |
| POST | `/predictions/train` | JWT (admin) | Train/retrain prediction model |
| GET | `/predictions/model` | JWT | Get current model info + accuracy |
| GET | `/predictions/predict/{session_id}` | JWT | Get prediction for a candidate |
| GET | `/predictions/insights` | JWT | Which interview signals matter most |
| GET | `/predictions/accuracy-report` | JWT | Model accuracy over time |

**Prediction Engine Logic** (`prediction_engine.py`):

1. **Feature Extraction** — For each interview session, extract features:
   - Report scores (overall, per-skill, behavioral)
   - Engagement metrics (if available from Agent R): confidence, assertiveness, engagement
   - Interview metadata: duration, question count, difficulty
   - Response patterns: avg word count, latency trends, elaboration depth

2. **Model Training** (requires minimum 50 outcomes):
   - Logistic regression with regularization (using scikit-learn)
   - Binary target: `performance_rating >= 3.5 AND retention_months >= 6`
   - Feature importance extraction → stored as `feature_weights`
   - Cross-validation for accuracy metrics

3. **Prediction** — For new candidates:
   - Extract same features from their interview
   - Apply trained model weights
   - Return: success_probability (0-1), confidence, top contributing factors, risk factors

4. **Fallback** (before model is trained):
   - Use heuristic scoring based on industry benchmarks
   - Display as "Estimated" vs "Predicted" to indicate model maturity

**Note**: Uses `scikit-learn` for the ML model. Add to `pyproject.toml` dependencies.

#### Frontend (Agent L-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/predictions/page.tsx` | CREATE | Predictions dashboard |
| `app/dashboard/interviews/[id]/page.tsx` | MODIFY | Add "Prediction" badge/section |
| `components/predictions/success-gauge.tsx` | CREATE | Circular probability gauge |
| `components/predictions/feature-importance.tsx` | CREATE | Horizontal bar chart of feature weights |
| `components/predictions/outcome-form.tsx` | CREATE | Record hiring outcome form |
| `components/predictions/accuracy-chart.tsx` | CREATE | Model accuracy over time line chart |
| `lib/api.ts` | MODIFY | Add prediction API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Predictions" nav item (admin) |

**UI Components**:

- **Success gauge**: Large circular gauge showing "78% likely to succeed" with color gradient (red→yellow→green).
- **Contributing factors**: Horizontal bar chart showing top positive and negative signals (green bars = positive, red bars = risk).
- **Prediction badge**: On interview detail page header — "High Probability" (green), "Moderate" (yellow), "At Risk" (red).
- **Outcome recording**: Form to record hire/no-hire decision. Later: feedback form for performance rating + retention.
- **Feature importance chart**: Shows which interview signals matter most across all predictions.
- **Model health dashboard**: Training sample size, accuracy metrics, last trained date, "Retrain" button.
- **Empty state**: Before 50 outcomes recorded, show progress bar ("Record 23 more outcomes to train your custom model") with heuristic estimates in the meantime.

#### Tests

- Backend: 8 pytest tests (outcome CRUD, feature extraction, model training mock, prediction, insights, accuracy, heuristic fallback, minimum sample enforcement)
- Frontend: 7 Playwright E2E tests (predictions dashboard, success gauge, feature chart, outcome form, model health, prediction badge, empty state)

---

### Agent S: Organizational Hiring Knowledge Base

**Goal**: AI continuously mines all past interviews to build a searchable knowledge base. Natural language queries against entire hiring history — "What questions work best for senior engineers?", "What's our pass rate for React roles?"

#### Database Changes

New tables:

```sql
CREATE TABLE knowledge_entry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    category VARCHAR(50) NOT NULL,
    -- category: question_insight, role_pattern, interviewer_pattern,
    --           skill_benchmark, process_recommendation
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    source_data JSONB NOT NULL,
    -- {session_ids: [...], date_range: {start, end}, sample_size: 42}
    confidence NUMERIC(3,2),
    tags JSONB DEFAULT '[]',
    is_auto_generated BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE knowledge_query_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organization(id),
    user_id UUID NOT NULL REFERENCES users(id),
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    sources JSONB DEFAULT '[]',
    -- [{entry_id, relevance_score}]
    rating INTEGER,  -- 1-5 user rating of response quality
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Backend (Agent S-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | ADD | `KnowledgeEntry`, `KnowledgeQueryLog` models |
| `models/schemas.py` | ADD | Knowledge-related schemas |
| `routers/knowledge.py` | CREATE | New router |
| `services/knowledge_engine.py` | CREATE | Knowledge extraction + query engine |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/knowledge/query` | JWT | Natural language query against hiring knowledge |
| GET | `/knowledge/entries` | JWT | Browse knowledge base entries |
| GET | `/knowledge/entries/{id}` | JWT | Get single entry with source data |
| POST | `/knowledge/generate` | JWT (admin) | Trigger knowledge extraction from recent interviews |
| GET | `/knowledge/suggestions` | JWT | AI-suggested insights based on recent data |
| POST | `/knowledge/query/{id}/rate` | JWT | Rate a query response quality |
| GET | `/knowledge/popular-queries` | JWT | Most common queries across org |

**Knowledge Engine Logic** (`knowledge_engine.py`):

1. **Knowledge Extraction** (runs on-demand or scheduled):
   - Query all completed interviews in a date range
   - Group by role type, skills, difficulty
   - Extract patterns using AI:

```
Analyze these {count} completed interviews for {role_type} roles.

Data points per interview:
- Questions asked and scores received
- Overall recommendation
- Skill breakdown
- Duration and question count

Extract insights in these categories:
1. Question Insights — Which questions/topics correlate with "hire" recommendations?
2. Role Patterns — Common strengths and weaknesses for this role type
3. Skill Benchmarks — Average scores per skill, score distribution
4. Process Recommendations — Optimal interview length, question count, difficulty

Return JSON array of knowledge entries.
```

2. **Query Engine** — When user asks a natural language question:
   - Search knowledge entries by semantic similarity (using AI embedding comparison)
   - If no matching entry, query raw interview data and generate an answer on-the-fly
   - Return answer with source citations (which interviews/entries contributed)
   - Log query + response for quality tracking

3. **Suggested Insights** — Periodically generate proactive insights:
   - "Your pass rate for React roles dropped 15% this month"
   - "Questions about system design are your strongest predictor of hire decisions"
   - "Average interview duration increased 20% — consider tightening question counts"

#### Frontend (Agent S-2)

| File | Action | Details |
|------|--------|---------|
| `app/dashboard/knowledge/page.tsx` | CREATE | Knowledge base — query + browse |
| `components/knowledge/query-chat.tsx` | CREATE | Chat-style query interface |
| `components/knowledge/entry-card.tsx` | CREATE | Knowledge entry card with category badge |
| `components/knowledge/source-citations.tsx` | CREATE | Linked source interviews |
| `components/knowledge/suggested-insights.tsx` | CREATE | Proactive insight cards |
| `lib/api.ts` | MODIFY | Add knowledge API methods |
| `components/layout/nav-items.ts` | MODIFY | Add "Knowledge" nav item |

**UI Components**:

- **Query interface**: Chat-style input ("Ask anything about your hiring data..."). Responses shown as rich cards with markdown formatting. Source citations linked to interview detail pages.
- **Knowledge browser**: Filterable grid of knowledge entries by category. Each card shows title, category badge, confidence level, last updated date.
- **Suggested insights**: Dashboard widget showing 3-5 AI-generated insights with trend arrows and action suggestions. Dismissable.
- **Popular queries**: Sidebar showing org's most common queries as clickable quick-access buttons.
- **Quality rating**: Thumbs up/down on each query response to improve future results.

#### Tests

- Backend: 7 pytest tests (knowledge extraction, query engine, entry CRUD, suggestions, query logging, rating, popular queries)
- Frontend: 6 Playwright E2E tests (query interface, knowledge browser, entry cards, suggested insights, source citations, rating)

---

### Agent T: Accessibility-First Interview Mode

**Goal**: Full ADA/WCAG 2.1 AA-compliant interview experience with screen reader optimization, time accommodations, alternative input methods, and accessibility preferences.

#### Database Changes

Modify existing tables:

```sql
ALTER TABLE interview_session
    ADD COLUMN accessibility_config JSONB DEFAULT NULL;
    -- {
    --   mode: "standard" | "accessible",
    --   preferences: {
    --     extended_time: true,
    --     time_multiplier: 1.5,
    --     screen_reader_optimized: true,
    --     high_contrast: true,
    --     dyslexia_friendly_font: true,
    --     large_text: true,
    --     reduced_motion: true,
    --     voice_to_text_input: true,
    --     auto_captions: true,
    --     keyboard_only_navigation: true
    --   },
    --   accommodations_notes: "Candidate requested extra time due to..."
    -- }
```

Add to organization settings:

```sql
-- No new table needed, add to organization.settings JSONB:
-- settings.accessibility = {
--   default_mode: "offer_choice",  -- "standard", "accessible", "offer_choice"
--   allowed_accommodations: ["extended_time", "screen_reader", "high_contrast", ...],
--   custom_instructions: "We provide reasonable accommodations..."
-- }
```

#### Backend (Agent T-1)

| File | Action | Details |
|------|--------|---------|
| `models/tables.py` | MODIFY | Add `accessibility_config` to `InterviewSession` |
| `models/schemas.py` | ADD | `AccessibilityConfig`, `AccessibilityPreferences` schemas |
| `routers/interviews.py` | MODIFY | Add accessibility config to session creation |
| `routers/accessibility.py` | CREATE | Accessibility settings router |
| `services/accessibility_service.py` | CREATE | Accommodation logic |
| `websocket/chat_handler.py` | MODIFY | Respect time multiplier, format messages for screen readers |

**Endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/accessibility/config/{token}` | None | Get accessibility config for a session |
| PUT | `/accessibility/config/{token}` | None | Candidate sets their accessibility preferences |
| GET | `/accessibility/org-settings` | JWT | Get org accessibility defaults |
| PUT | `/accessibility/org-settings` | JWT (admin) | Update org accessibility settings |
| POST | `/accessibility/text-to-speech` | None | Convert text to speech audio (for vision-impaired) |
| POST | `/accessibility/speech-to-text` | None | Convert speech to text (for mobility-impaired) |

**Accessibility Service Logic** (`accessibility_service.py`):

1. **Extended Time** — When `extended_time: true`, multiply all time limits by `time_multiplier`. Modify AI engine prompts to be patient with longer response times and not penalize for pauses.

2. **Screen Reader Optimization** — Restructure AI response format:
   - Add ARIA-friendly markdown structure
   - Prefix questions with "Question {n} of {total}:"
   - Avoid visual-only indicators (replace emoji with text)
   - Add explicit navigation cues ("Press Tab to move to the answer input")

3. **High Contrast Mode** — Return CSS variable overrides for the frontend:
   ```json
   {"bg": "#000000", "text": "#FFFFFF", "primary": "#FFFF00", "border": "#FFFFFF"}
   ```

4. **Dyslexia-Friendly** — Return font preference (`OpenDyslexic` or `Lexie Readable`).

5. **Voice-to-Text** — If `voice_to_text_input: true`, accept audio blobs from frontend, transcribe using AI, return text for the candidate to review before sending.

6. **Auto Captions** — For voice/video interviews, generate real-time text captions from audio stream.

7. **Scoring Fairness** — Modify scoring prompts to not penalize:
   - Longer response times (if extended time enabled)
   - Shorter responses (if using voice-to-text)
   - Simpler vocabulary (if dyslexia mode)

#### Frontend (Agent T-2)

| File | Action | Details |
|------|--------|---------|
| `app/interview/[token]/page.tsx` | MODIFY | Add accessibility preference modal on interview start |
| `components/accessibility/preference-modal.tsx` | CREATE | Accessibility setup wizard |
| `components/accessibility/accessible-chat.tsx` | CREATE | ARIA-optimized chat interface |
| `components/accessibility/caption-overlay.tsx` | CREATE | Live caption overlay for voice/video |
| `components/accessibility/voice-input.tsx` | CREATE | Voice-to-text input with review step |
| `app/dashboard/settings/page.tsx` | MODIFY | Add "Accessibility" section to org settings |
| `lib/api.ts` | MODIFY | Add accessibility API methods |

**UI Components**:

- **Preference modal**: Shown at interview start. Checklist of accommodations with descriptions. "I don't need accommodations" shortcut. Saves to session.
- **High contrast mode**: CSS custom properties override. Fully black background, white text, yellow accents, thick borders.
- **Dyslexia font**: `OpenDyslexic` font loaded from Google Fonts. Increased letter/word spacing.
- **Large text mode**: Base font size increased to 20px, inputs and buttons scaled proportionally.
- **Reduced motion**: Disable all CSS transitions/animations. No auto-scrolling.
- **Keyboard navigation**: Full Tab/Enter/Escape navigation. Focus indicators on all interactive elements. Skip-to-content links.
- **Voice input widget**: Microphone button, recording indicator, transcription preview, "Send" or "Re-record" buttons.
- **Caption overlay**: Semi-transparent overlay at bottom of screen showing real-time captions during voice/video interview. Adjustable font size.
- **Screen reader landmarks**: Proper `<main>`, `<nav>`, `<section>`, `role` attributes, `aria-live` regions for new messages.
- **Org settings**: Admin can set default accessibility mode, choose which accommodations to offer, add custom instructions.

**CSS approach**: Use CSS custom properties (`:root` variables) that can be overridden dynamically based on accessibility config. No separate stylesheet — single adaptive system.

#### Tests

- Backend: 6 pytest tests (config CRUD, extended time calculation, screen reader format, voice-to-text, scoring fairness, org settings)
- Frontend: 8 Playwright E2E tests (preference modal, high contrast mode, dyslexia font, large text, keyboard navigation, voice input, caption overlay, reduced motion)

---

## Dependency Graph

```
WAVE 1 (no dependencies — run all 4 in parallel)
├── Agent K: AI Interview Co-Pilot
├── Agent M: Competency Genome Map
├── Agent N: Dynamic Interview Branching
└── Agent R: Candidate Engagement Signals

WAVE 2 (Agent O, P independent; Agent Q independent)
├── Agent O: Interview Clip Studio (benefits from engagement data but not required)
├── Agent P: Interviewer Training Simulator (independent)
└── Agent Q: Cultural Fit & Values Assessment (independent)

WAVE 3 (Agent L needs engagement signals; Agent S needs interview history; Agent T independent)
├── Agent L: Predictive Hiring Success (needs: engagement metrics from R, more data = better)
├── Agent S: Hiring Knowledge Base (needs: broad interview data, benefits from all Wave 1-2 features)
└── Agent T: Accessibility Mode (fully independent — can run in any wave)
```

---

## Migration Strategy

All database migrations should be chained in order:

```
1. n10_add_copilot_session.py              (Agent K)
2. n11_add_competency_genome.py            (Agent M)
3. n12_add_decision_tree.py                (Agent N)
4. n13_add_engagement_metrics.py           (Agent R)
5. n14_add_interview_clips.py              (Agent O)
6. n15_add_training_simulation.py          (Agent P)
7. n16_add_company_values.py               (Agent Q)
8. n17_add_hiring_outcomes.py              (Agent L)
9. n18_add_knowledge_base.py               (Agent S)
10. n19_add_accessibility_config.py        (Agent T)
```

---

## New Dependencies

| Agent | Package | Purpose |
|-------|---------|---------|
| L | `scikit-learn` | ML model for hiring prediction |
| N | `reactflow` (npm) | Visual decision tree editor |
| T | `@fontsource/opendyslexic` (npm) | Dyslexia-friendly font |

---

## Summary

| Wave | Agents | Features | New Tables | Column Additions | New Endpoints | New Pages | Tests |
|------|--------|----------|------------|------------------|---------------|-----------|-------|
| 1 | K, M, N, R | 4 | 4 | 4 | 26 | 7 | 56 |
| 2 | O, P, Q | 3 | 5 | 0 | 25 | 5 | 39 |
| 3 | L, S, T | 3 | 4 | 1 | 21 | 4 | 42 |
| **Total** | **10** | **10** | **13** | **5** | **72** | **16** | **137** |

---

## Execution Command

To implement, run each wave's agents in parallel:

```
Wave 1: "Implement Agent K" + "Implement Agent M" + "Implement Agent N" + "Implement Agent R"
Wave 2: "Implement Agent O" + "Implement Agent P" + "Implement Agent Q"
Wave 3: "Implement Agent L" + "Implement Agent S" + "Implement Agent T"
```

Each agent instruction should reference this plan document and specify:
1. The exact agent letter (K–T)
2. "Follow the multi-agent plan in `docs/MULTI_AGENT_PLAN_V2.md`"
3. "Implement both backend and frontend as specified"
4. "Write all tests listed"
5. "Do not modify files assigned to other agents"

---

## Revenue Impact Summary

| Feature | Revenue Model | Estimated ARR Impact |
|---------|--------------|---------------------|
| AI Interview Co-Pilot | Enterprise add-on | High — $50-100/seat/month |
| Competency Genome Map | Pro tier driver | Medium — drives Pro upgrades |
| Dynamic Branching | Template marketplace | Medium — 10% revenue share |
| Engagement Signals | Analytics add-on | Low-Medium — bundled with Pro |
| Interview Clip Studio | Per-clip or Enterprise | Medium — $0.50/clip or Enterprise |
| Interviewer Training | L&D seat license | High — $30/seat/month |
| Cultural Fit Assessment | Module add-on | Medium — $20/assessment |
| Predictive Success Score | Premium analytics | Very High — $200/month/org |
| Hiring Knowledge Base | Enterprise-only | High — retention driver |
| Accessibility Mode | Compliance | Medium — enables enterprise deals |
