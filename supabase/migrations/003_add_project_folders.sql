-- ============================================
-- Voltis Economics - Project Folders Schema
-- Version: 003_add_project_folders
-- Created: 2026-03-26
-- ============================================

BEGIN;

-- 1. Create Folders Table
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    user_id TEXT DEFAULT 'voltis_user_global',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add folder_id to Projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;

-- 3. Enable RLS on Folders
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for Folders
DROP POLICY IF EXISTS "public_read" ON folders;
DROP POLICY IF EXISTS "public_insert" ON folders;
DROP POLICY IF EXISTS "public_update" ON folders;
DROP POLICY IF EXISTS "public_delete" ON folders;

CREATE POLICY "public_read" ON folders FOR SELECT USING (true);
CREATE POLICY "public_insert" ON folders FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update" ON folders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public_delete" ON folders FOR DELETE USING (true);

-- 5. Create Indexes
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_folder_id ON projects(folder_id);

COMMIT;
