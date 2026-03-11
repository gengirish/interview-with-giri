CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS organization (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    plan_tier VARCHAR(50) NOT NULL DEFAULT 'free',
    interviews_limit INTEGER DEFAULT 10,
    interviews_used INTEGER DEFAULT 0,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_posting (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    role_type VARCHAR(50) NOT NULL,
    job_description TEXT NOT NULL,
    required_skills JSONB DEFAULT '[]',
    interview_config JSONB DEFAULT '{"num_questions": 10, "duration_minutes": 30, "difficulty": "medium", "include_coding": false}',
    interview_format VARCHAR(20) DEFAULT 'text',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_session (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id UUID NOT NULL REFERENCES job_posting(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organization(id),
    token VARCHAR(64) UNIQUE NOT NULL,
    candidate_name VARCHAR(255),
    candidate_email VARCHAR(255),
    status VARCHAR(30) DEFAULT 'pending',
    format VARCHAR(20) DEFAULT 'text',
    overall_score NUMERIC(4, 2),
    duration_seconds INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_message (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES interview_session(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_report (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID UNIQUE NOT NULL REFERENCES interview_session(id) ON DELETE CASCADE,
    skill_scores JSONB DEFAULT '{}',
    behavioral_scores JSONB DEFAULT '{}',
    ai_summary TEXT,
    strengths JSONB DEFAULT '[]',
    concerns JSONB DEFAULT '[]',
    recommendation VARCHAR(50),
    confidence_score NUMERIC(3, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_job_posting_org ON job_posting(org_id);
CREATE INDEX IF NOT EXISTS idx_session_job ON interview_session(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_session_org ON interview_session(org_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON interview_session(token);
CREATE INDEX IF NOT EXISTS idx_session_status ON interview_session(status);
CREATE INDEX IF NOT EXISTS idx_message_session ON interview_message(session_id);
CREATE INDEX IF NOT EXISTS idx_report_session ON candidate_report(session_id);
CREATE INDEX IF NOT EXISTS idx_subscription_org ON subscription(org_id);
