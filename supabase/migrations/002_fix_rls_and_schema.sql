-- ============================================
-- Voltis Economics - RLS & Schema Fix
-- Version: 002_fix_rls_and_schema
-- Created: 2026-03-25
-- ============================================
-- This migration:
-- 1. Creates RLS policies allowing public access
-- 2. Ensures all required columns exist
-- 3. Fixes common schema issues
-- ============================================

BEGIN;

-- ============================================
-- SECTION 1: RLS POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_normalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROJECTS TABLE POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read" ON projects;
DROP POLICY IF EXISTS "Allow public insert" ON projects;
DROP POLICY IF EXISTS "Allow public update" ON projects;
DROP POLICY IF EXISTS "Allow public delete" ON projects;
DROP POLICY IF EXISTS "Allow all" ON projects;
DROP POLICY IF EXISTS "Public access" ON projects;

-- Create permissive policies for projects
-- Allow anyone to read projects
CREATE POLICY "public_read" ON projects
    FOR SELECT USING (true);

-- Allow anyone to insert projects
CREATE POLICY "public_insert" ON projects
    FOR INSERT WITH CHECK (true);

-- Allow anyone to update projects
CREATE POLICY "public_update" ON projects
    FOR UPDATE USING (true) WITH CHECK (true);

-- Allow anyone to delete projects
CREATE POLICY "public_delete" ON projects
    FOR DELETE USING (true);

-- ============================================
-- BILLS TABLE POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow public read" ON bills;
DROP POLICY IF EXISTS "Allow public insert" ON bills;
DROP POLICY IF EXISTS "Allow public update" ON bills;
DROP POLICY IF EXISTS "Allow public delete" ON bills;
DROP POLICY IF EXISTS "Allow all" ON bills;
DROP POLICY IF EXISTS "Public access" ON bills;

-- Create permissive policies for bills
CREATE POLICY "public_read" ON bills
    FOR SELECT USING (true);

CREATE POLICY "public_insert" ON bills
    FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update" ON bills
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "public_delete" ON bills
    FOR DELETE USING (true);

-- ============================================
-- CUSTOM_CONCEPTS TABLE POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow public read" ON custom_concepts;
DROP POLICY IF EXISTS "Allow public insert" ON custom_concepts;
DROP POLICY IF EXISTS "Allow public update" ON custom_concepts;
DROP POLICY IF EXISTS "Allow public delete" ON custom_concepts;
DROP POLICY IF EXISTS "Allow all" ON custom_concepts;
DROP POLICY IF EXISTS "Public access" ON custom_concepts;

-- Create permissive policies for custom_concepts
CREATE POLICY "public_read" ON custom_concepts
    FOR SELECT USING (true);

CREATE POLICY "public_insert" ON custom_concepts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update" ON custom_concepts
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "public_delete" ON custom_concepts
    FOR DELETE USING (true);

-- ============================================
-- CONCEPT_NORMALIZATIONS TABLE POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow public read" ON concept_normalizations;
DROP POLICY IF EXISTS "Allow public insert" ON concept_normalizations;
DROP POLICY IF EXISTS "Allow public update" ON concept_normalizations;
DROP POLICY IF EXISTS "Allow public delete" ON concept_normalizations;

-- Create permissive policies for concept_normalizations
CREATE POLICY "public_read" ON concept_normalizations
    FOR SELECT USING (true);

CREATE POLICY "public_insert" ON concept_normalizations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update" ON concept_normalizations
    FOR UPDATE USING (true) WITH CHECK (true);

-- ============================================
-- BILL_AUDIT_LOG TABLE POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow public read" ON bill_audit_log;
DROP POLICY IF EXISTS "Allow public insert" ON bill_audit_log;
DROP POLICY IF EXISTS "Allow public update" ON bill_audit_log;

-- Create permissive policies for bill_audit_log
CREATE POLICY "public_read" ON bill_audit_log
    FOR SELECT USING (true);

CREATE POLICY "public_insert" ON bill_audit_log
    FOR INSERT WITH CHECK (true);

-- ============================================
-- SECTION 2: SCHEMA FIXES
-- ============================================

-- Ensure bills table has all required columns
ALTER TABLE bills ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'success';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'unchecked';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS math_check_passed BOOLEAN;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS discrepancy_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS review_attempts INTEGER DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS validation_notes TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_file_url TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS raw_data JSONB;

-- Ensure projects table has all required columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Ensure custom_concepts table has all required columns
ALTER TABLE custom_concepts ADD COLUMN IF NOT EXISTS bill_id TEXT;
ALTER TABLE custom_concepts ADD COLUMN IF NOT EXISTS data JSONB;

-- ============================================
-- SECTION 3: INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_bills_project_id ON bills(project_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_validation ON bills(validation_status);
CREATE INDEX IF NOT EXISTS idx_custom_concepts_bill_id ON custom_concepts(bill_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

COMMIT;

-- ============================================
-- VERIFICATION QUERIES (run these to check)
-- ============================================
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- SELECT schemaname, tablename, policyname, permissive FROM pg_policies WHERE schemaname = 'public';
