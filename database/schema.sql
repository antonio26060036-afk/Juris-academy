-- ===============================================================
-- UNIVERSITY STUDY APP - POSTGRESQL SCHEMA
-- ===============================================================
-- Description: Complete relational structure for a study app.
-- Features: Users, Subjects, Study Plans, Sessions, Notes, Flashcards,
--           Quizzes, Files, Productivity, Goals, Achievements, AI, and Logs.
-- ===============================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS
-- Stores core user information and authentication metadata.
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid TEXT UNIQUE, -- Optional: Link with Firebase Auth if needed
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT, -- Nullable if using OAuth/Firebase
    avatar_url TEXT,
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'admin', 'tutor')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. SUBJECTS (MATÉRIAS)
-- Academic disciplines the user is studying.
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    icon TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. STUDY PLANS
-- High-level planning for exams or semesters.
CREATE TABLE study_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. STUDY SESSIONS
-- Records of actual study time (Focus Mode / Pomodoro).
CREATE TABLE study_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    duration_minutes INT NOT NULL,
    xp_earned INT DEFAULT 0,
    coins_earned INT DEFAULT 0,
    session_type TEXT DEFAULT 'pomodoro',
    notes TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE
);

-- 5. NOTES
-- Academic summaries and class notes.
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Markdown or HTML
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. FLASHCARDS
-- Spaced repetition cards.
CREATE TABLE flashcards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    difficulty_level INT DEFAULT 1,
    next_review_date DATE DEFAULT CURRENT_DATE,
    interval_days INT DEFAULT 0,
    ease_factor NUMERIC(4,2) DEFAULT 2.5,
    repetitions INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. QUIZZES & RESULTS
-- Assessment records.
CREATE TABLE quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    score INT,
    total_questions INT,
    time_taken_seconds INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. FILES (METADATA)
-- References to uploaded study materials (PDFs, Images).
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT, -- MIME type
    file_size_bytes BIGINT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. PRODUCTIVITY STATS
-- Aggregated data for performance tracking.
CREATE TABLE productivity_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_minutes INT DEFAULT 0,
    sessions_count INT DEFAULT 0,
    xp_gained INT DEFAULT 0,
    streak_count INT DEFAULT 0,
    UNIQUE(user_id, date)
);

-- 10. GOALS
-- Specific targets set by the user.
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_value INT NOT NULL,
    current_value INT DEFAULT 0,
    deadline TIMESTAMP WITH TIME ZONE,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. ACHIEVEMENTS
-- Gamification rewards.
CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. AI INTERACTIONS
-- History of prompts and responses from the Study Assistant.
CREATE TABLE ai_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    context_type TEXT, -- e.g., 'note_summary', 'exam_prep'
    tokens_used INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. AUDIT LOGS
-- Detailed history of actions for security and recovery.
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- e.g., 'LOGIN', 'DELETE_NOTE', 'UPDATE_PROFILE'
    table_name TEXT,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===============================================================
-- INDICES (PERFORMANCE OPTIMIZATION)
-- ===============================================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_subjects_user ON subjects(user_id);
CREATE INDEX idx_sessions_user_date ON study_sessions(user_id, started_at);
CREATE INDEX idx_notes_user_subject ON notes(user_id, subject_id);
CREATE INDEX idx_flashcards_review ON flashcards(user_id, next_review_date);
CREATE INDEX idx_files_user ON files(user_id);
CREATE INDEX idx_ai_user_date ON ai_interactions(user_id, created_at);
CREATE INDEX idx_audit_user_action ON audit_logs(user_id, action);

-- ===============================================================
-- TRIGGERS (AUTOMATIC UPDATES)
-- ===============================================================

-- Function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to users and notes
CREATE TRIGGER update_users_modtime BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_notes_modtime BEFORE UPDATE ON notes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ===============================================================
-- SECURITY & ACCESS CONTROL (RLS - Row Level Security)
-- ===============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

-- Example Policy: Users can only see their own data
CREATE POLICY user_self_access ON users FOR ALL USING (id = auth_user_id()); -- auth_user_id() is a placeholder for your app's logic
CREATE POLICY subject_owner_access ON subjects FOR ALL USING (user_id = auth_user_id());

-- ===============================================================
-- BACKUP & RECOVERY NOTES
-- ===============================================================
-- 1. Use 'pg_dump' for logical backups:
--    pg_dump -U username -d dbname > backup.sql
-- 2. Use 'WAL-G' or 'Barman' for point-in-time recovery (PITR).
-- 3. Enable 'Autovacuum' to maintain performance.
