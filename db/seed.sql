INSERT INTO organization (id, name, domain) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Demo Corp', 'democorp.com');

INSERT INTO users (org_id, email, password_hash, full_name, role) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'admin@democorp.com',
 '$2b$12$LJ3m4ys2Y8C.DCgJzz7Yb.TY1vTqXXaGzHJKL5C5C5C5C5C5C5C5e',
 'Admin User', 'admin'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'hiring@democorp.com',
 '$2b$12$LJ3m4ys2Y8C.DCgJzz7Yb.TY1vTqXXaGzHJKL5C5C5C5C5C5C5C5e',
 'Sarah Hiring', 'hiring_manager');

INSERT INTO subscription (org_id, plan_tier, interviews_limit, interviews_used, status) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'professional', 200, 12, 'active');

INSERT INTO job_posting (org_id, title, role_type, job_description, required_skills, interview_format) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
 'Senior Backend Engineer',
 'technical',
 'We are looking for a Senior Backend Engineer with 5+ years of experience in Python, FastAPI, PostgreSQL, and distributed systems. The ideal candidate has experience with microservices architecture, event-driven design, and cloud platforms (AWS/GCP).',
 '["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "AWS"]',
 'text'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
 'Product Manager',
 'non_technical',
 'We are looking for a Product Manager to lead our B2B SaaS product. You will work closely with engineering, design, and sales teams. Experience with agile methodologies, user research, and data-driven decision making required.',
 '["Product Strategy", "Agile", "User Research", "Data Analysis", "Stakeholder Management"]',
 'text');
