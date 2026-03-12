# Testing Guide — Deployed Server

**API**: `https://interview-with-giri-api.fly.dev`
**Frontend**: `https://hire-with-giri.vercel.app`

---

## 1. Health Checks

These require no authentication.

```bash
# API health
curl https://interview-with-giri-api.fly.dev/api/v1/health

# Database connectivity
curl https://interview-with-giri-api.fly.dev/api/v1/health/db

# Redis connectivity
curl https://interview-with-giri-api.fly.dev/api/v1/health/redis
```

**Expected**: `200 OK` with `{"status": "healthy", ...}` for each.

---

## 2. Authentication

### 2.1 Sign Up (creates org + admin user)

```bash
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "org_name": "Test Corp",
    "full_name": "Test Admin",
    "email": "admin@testcorp.com",
    "password": "securepassword123"
  }'
```

**Expected**: `201 Created` with `access_token`, `role: "admin"`, `org_id`.

Save the token:

```bash
export TOKEN="<access_token from response>"
```

### 2.2 Login

```bash
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@testcorp.com", "password": "securepassword123"}'
```

**Expected**: `200 OK` with `access_token`.

### 2.3 Auth Guard (no token should be rejected)

```bash
curl https://interview-with-giri-api.fly.dev/api/v1/job-postings
```

**Expected**: `401 Unauthorized`.

---

## 3. User Management (Admin only)

### 3.1 Get Current User

```bash
curl https://interview-with-giri-api.fly.dev/api/v1/users/me \
  -H "Authorization: Bearer $TOKEN"
```

### 3.2 List Users in Org

```bash
curl https://interview-with-giri-api.fly.dev/api/v1/users \
  -H "Authorization: Bearer $TOKEN"
```

### 3.3 Invite a Hiring Manager

```bash
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Jane Recruiter",
    "email": "jane@testcorp.com",
    "password": "password123",
    "role": "hiring_manager"
  }'
```

**Expected**: `201 Created` with `role: "hiring_manager"`.

### 3.4 Invite a Viewer

```bash
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Bob Viewer",
    "email": "bob@testcorp.com",
    "password": "password123",
    "role": "viewer"
  }'
```

---

## 4. Job Postings

### 4.1 Create a Job Posting

```bash
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/job-postings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior Python Developer",
    "role_type": "technical",
    "job_description": "We are hiring a senior Python developer with 5+ years of experience in FastAPI, PostgreSQL, Docker, and cloud platforms. Must have strong system design skills.",
    "required_skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
    "interview_format": "text",
    "interview_config": {
      "num_questions": 5,
      "duration_minutes": 20,
      "difficulty": "medium",
      "include_coding": false
    }
  }'
```

**Expected**: `201 Created` with job posting details.

Save the job ID:

```bash
export JOB_ID="<id from response>"
```

### 4.2 List Job Postings

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/job-postings" \
  -H "Authorization: Bearer $TOKEN"
```

### 4.3 Get Single Job Posting

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/job-postings/$JOB_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### 4.4 Update a Job Posting

```bash
curl -X PATCH "https://interview-with-giri-api.fly.dev/api/v1/job-postings/$JOB_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Senior Python Engineer"}'
```

### 4.5 Extract Skills from Description (AI)

```bash
curl -X POST "https://interview-with-giri-api.fly.dev/api/v1/job-postings/$JOB_ID/extract-skills" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 5. Interview Links

### 5.1 Generate an Interview Link

```bash
curl -X POST "https://interview-with-giri-api.fly.dev/api/v1/job-postings/$JOB_ID/generate-link" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: `200 OK` with `{ "token": "<interview_token>", "link": "..." }`.

Save the interview token:

```bash
export INTERVIEW_TOKEN="<token from response>"
```

### 5.2 View Interview Details (Public — no auth)

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/interviews/public/$INTERVIEW_TOKEN"
```

**Expected**: `200 OK` with job title, format, config, and status.

### 5.3 Start the Interview (Candidate submits info)

```bash
curl -X POST "https://interview-with-giri-api.fly.dev/api/v1/interviews/public/$INTERVIEW_TOKEN/start" \
  -H "Content-Type: application/json" \
  -d '{
    "candidate_name": "Alice Smith",
    "candidate_email": "alice@candidate.com"
  }'
```

**Expected**: `200 OK` with `{ "session_id": "...", "ws_url": "..." }`.

---

## 6. AI Interview Session (WebSocket)

After starting the interview, connect via WebSocket to conduct the actual AI conversation.

### Using websocat (CLI)

```bash
websocat "wss://interview-with-giri-api.fly.dev/ws/interview/$INTERVIEW_TOKEN"
```

Once connected, send a JSON message:

```json
{"type": "message", "content": "Hello, I'm ready to begin."}
```

The AI interviewer will respond with questions. Continue the conversation naturally.

### Using Browser DevTools

Open the browser console on the frontend interview page and the WebSocket connection is handled automatically.

---

## 7. Interview Management (Authenticated)

### 7.1 List All Interviews

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/interviews" \
  -H "Authorization: Bearer $TOKEN"
```

### 7.2 Get Interview Details

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/interviews/<session_id>" \
  -H "Authorization: Bearer $TOKEN"
```

### 7.3 Get Interview Messages

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/interviews/<session_id>/messages" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 8. Dashboard & Analytics

### 8.1 Dashboard Stats

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/dashboard/stats" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: Counts for total interviews, active jobs, completed interviews, average score.

### 8.2 Analytics Overview

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/analytics/overview" \
  -H "Authorization: Bearer $TOKEN"
```

### 8.3 Per-Job Analytics

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/analytics/per-job" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 9. Reports & Export

### 9.1 Generate a Candidate Report (AI)

```bash
curl -X POST "https://interview-with-giri-api.fly.dev/api/v1/reports/<session_id>/generate" \
  -H "Authorization: Bearer $TOKEN"
```

### 9.2 Get Report

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/reports/<session_id>" \
  -H "Authorization: Bearer $TOKEN"
```

### 9.3 Export as JSON

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/reports/<session_id>/export/json" \
  -H "Authorization: Bearer $TOKEN"
```

### 9.4 Export as CSV

```bash
curl "https://interview-with-giri-api.fly.dev/api/v1/reports/<session_id>/export/csv" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 10. RBAC Verification

Login as each role and verify access restrictions.

### 10.1 Viewer Cannot Create Jobs

```bash
# Login as viewer
VIEWER_TOKEN=$(curl -s -X POST https://interview-with-giri-api.fly.dev/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "bob@testcorp.com", "password": "password123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Attempt to create a job (should fail)
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/job-postings \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"X","role_type":"technical","job_description":"test","required_skills":[]}'
```

**Expected**: `403 Forbidden`.

### 10.2 Viewer Cannot Manage Users

```bash
curl https://interview-with-giri-api.fly.dev/api/v1/users \
  -H "Authorization: Bearer $VIEWER_TOKEN"
```

**Expected**: `403 Forbidden`.

### 10.3 Hiring Manager Can Create Jobs

```bash
HM_TOKEN=$(curl -s -X POST https://interview-with-giri-api.fly.dev/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@testcorp.com", "password": "password123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -X POST https://interview-with-giri-api.fly.dev/api/v1/job-postings \
  -H "Authorization: Bearer $HM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Frontend Engineer",
    "role_type": "technical",
    "job_description": "React and TypeScript developer",
    "required_skills": ["React", "TypeScript"],
    "interview_format": "text",
    "interview_config": {"num_questions": 3, "duration_minutes": 15, "difficulty": "easy", "include_coding": false}
  }'
```

**Expected**: `201 Created`.

---

## 11. ATS Integration

### 11.1 Configure ATS

```bash
curl -X POST https://interview-with-giri-api.fly.dev/api/v1/ats/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform": "greenhouse", "api_key": "test-key-123", "webhook_url": "https://example.com/webhook"}'
```

### 11.2 List ATS Configs

```bash
curl https://interview-with-giri-api.fly.dev/api/v1/ats/config \
  -H "Authorization: Bearer $TOKEN"
```

### 11.3 Delete ATS Config

```bash
curl -X DELETE https://interview-with-giri-api.fly.dev/api/v1/ats/config/greenhouse \
  -H "Authorization: Bearer $TOKEN"
```

---

## 12. Frontend Walkthrough

Open each page in a browser and verify it renders correctly.

| Step | URL | Expected |
|------|-----|----------|
| 1 | `https://hire-with-giri.vercel.app` | Landing page with hero, features, pricing |
| 2 | `https://hire-with-giri.vercel.app/signup` | Registration form, creates account |
| 3 | `https://hire-with-giri.vercel.app/login` | Login form, redirects to dashboard |
| 4 | `https://hire-with-giri.vercel.app/dashboard` | Dashboard with stats cards |
| 5 | `https://hire-with-giri.vercel.app/dashboard/jobs` | Job postings list, create new job |
| 6 | `https://hire-with-giri.vercel.app/dashboard/interviews` | Interview sessions list |
| 7 | `https://hire-with-giri.vercel.app/dashboard/analytics` | Charts and analytics |
| 8 | `https://hire-with-giri.vercel.app/dashboard/team` | Team members (admin only) |
| 9 | `https://hire-with-giri.vercel.app/dashboard/settings` | Settings page (admin only) |

---

## 13. End-to-End Flow

This is the full happy-path test from signup to completed interview.

1. **Sign up** at `/signup` with a new org
2. **Create a job posting** at `/dashboard/jobs` → click "New Job"
3. **Generate an interview link** → click "Generate Link" on the job
4. **Open the interview link** in an incognito window (simulates candidate)
5. **Enter candidate details** and start the interview
6. **Chat with the AI interviewer** — answer 3–5 questions
7. **Return to admin dashboard** → check `/dashboard/interviews` for the session
8. **View interview detail** → click on the session to see messages and score
9. **Check analytics** at `/dashboard/analytics` for updated stats

---

## 14. Post-Deploy Sanity Script

Run the automated sanity check (requires Python + httpx):

```bash
cd backend
uv run python ../scripts/post_deploy_check.py
```

Or point at a custom environment:

```bash
python scripts/post_deploy_check.py \
  --api https://interview-with-giri-api.fly.dev \
  --frontend https://hire-with-giri.vercel.app
```

**Expected**: All 4 checks pass.

---

## 15. Cleanup

To delete test data after testing, sign in as admin and delete job postings from the dashboard. Interview sessions cascade-delete with their parent jobs.
