-- ============================================
-- Voltis Economics - SQL Migration Script
-- Version: 001_add_validation_and_normalization
-- Created: 2026-03-25
-- ============================================
-- This migration adds support for:
-- 1. Intelligent concept normalization
-- 2. Bill validation tracking
-- 3. Audit logging for changes
-- ============================================

BEGIN;

-- ============================================
-- TABLE: concept_normalizations
-- Stores learned concept mappings for grouping
-- ============================================
CREATE TABLE IF NOT EXISTS concept_normalizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    canonical_group TEXT NOT NULL CHECK (
        canonical_group IN (
            'ENERGIA',
            'POTENCIA',
            'EXCESOS_POTENCIA',
            'REACTIVA',
            'ALQUILER_EQUIPO',
            'PEAJES_CARGOS',
            'IMPUESTO_ELECTRICO',
            'IVA',
            'DESCUENTO',
            'BONO_SOCIAL',
            'COMPENSACION',
            'AJUSTES',
            'OTROS'
        )
    ),
    confidence NUMERIC(3,2) DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
    source_scope TEXT NOT NULL DEFAULT 'global' CHECK (source_scope IN ('global', 'commercial', 'project')),
    is_system BOOLEAN DEFAULT FALSE,
    user_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    
    -- Prevent duplicate mappings
    CONSTRAINT unique_concept_mapping UNIQUE (original_text, canonical_group, source_scope)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_concept_norm_original ON concept_normalizations(original_text);
CREATE INDEX IF NOT EXISTS idx_concept_norm_canonical ON concept_normalizations(canonical_group);
CREATE INDEX IF NOT EXISTS idx_concept_norm_scope ON concept_normalizations(source_scope);
CREATE INDEX IF NOT EXISTS idx_concept_norm_user ON concept_normalizations(user_id) WHERE user_id IS NOT NULL;

-- ============================================
-- TABLE: bill_audit_log
-- Tracks all changes to extracted bills
-- ============================================
CREATE TABLE IF NOT EXISTS bill_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id TEXT NOT NULL,
    project_id TEXT,
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    change_source TEXT NOT NULL CHECK (
        change_source IN ('ai_extraction', 'manual_edit', 'import_correction', 'ai_refine', 'validation', 'merge')
    ),
    change_reason TEXT,
    user_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    
    -- Index for bill history queries
    CONSTRAINT fk_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_audit_bill ON bill_audit_log(bill_id);
CREATE INDEX IF NOT EXISTS idx_audit_project ON bill_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON bill_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_field ON bill_audit_log(field_changed);

-- ============================================
-- TABLE: bills (Enhanced Fields)
-- Add validation and storage tracking columns
-- ============================================
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'pending' CHECK (
    extraction_status IS NULL OR extraction_status IN ('pending', 'success', 'error', 'partial')
);

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'unchecked' CHECK (
    validation_status IS NULL OR validation_status IN ('unchecked', 'pending', 'validated', 'discrepancy', 'failed')
);

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS math_check_passed BOOLEAN;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS discrepancy_amount NUMERIC(12,2) DEFAULT 0;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS review_attempts INTEGER DEFAULT 0 CHECK (review_attempts >= 0);

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS validation_notes TEXT;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS file_hash TEXT;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS original_file_url TEXT;

-- Index for validation queries
CREATE INDEX IF NOT EXISTS idx_bills_validation ON bills(validation_status);
CREATE INDEX IF NOT EXISTS idx_bills_math_check ON bills(math_check_passed) WHERE math_check_passed IS NOT NULL;

-- ============================================
-- SEED DATA: System-level concept rules
-- These are immutable rules that cannot be overwritten
-- ============================================
INSERT INTO concept_normalizations (original_text, normalized_text, canonical_group, confidence, source_scope, is_system, created_by) VALUES
    ('EXCESO DE POTENCIA', 'Exceso de Potencia', 'EXCESOS_POTENCIA', 1.00, 'global', TRUE, 'system'),
    ('EXCESO POTENCIA', 'Exceso de Potencia', 'EXCESOS_POTENCIA', 1.00, 'global', TRUE, 'system'),
    ('EXCESOS POTENCIA', 'Exceso de Potencia', 'EXCESOS_POTENCIA', 1.00, 'global', TRUE, 'system'),
    ('POTENCIA EXCEDIDA', 'Exceso de Potencia', 'EXCESOS_POTENCIA', 1.00, 'global', TRUE, 'system'),
    ('BONO SOCIAL', 'Bono Social', 'BONO_SOCIAL', 1.00, 'global', TRUE, 'system'),
    ('BONIFICACION SOCIAL', 'Bono Social', 'BONO_SOCIAL', 1.00, 'global', TRUE, 'system'),
    ('ALQUILER DE EQUIPOS', 'Alquiler de Equipos', 'ALQUILER_EQUIPO', 1.00, 'global', TRUE, 'system'),
    ('ALQUILER CONTADOR', 'Alquiler de Equipos', 'ALQUILER_EQUIPO', 1.00, 'global', TRUE, 'system'),
    ('ALQUILER MEDIDOR', 'Alquiler de Equipos', 'ALQUILER_EQUIPO', 1.00, 'global', TRUE, 'system'),
    ('PEAJE DE TRANSPORTE', 'Peajes y Cargos', 'PEAJES_CARGOS', 1.00, 'global', TRUE, 'system'),
    ('CARGO POR TRANSPORTE', 'Peajes y Cargos', 'PEAJES_CARGOS', 1.00, 'global', TRUE, 'system'),
    ('PEAJES Y TRANSPORTES', 'Peajes y Cargos', 'PEAJES_CARGOS', 1.00, 'global', TRUE, 'system'),
    ('CARGO POR DISTRIBUCION', 'Peajes y Cargos', 'PEAJES_CARGOS', 1.00, 'global', TRUE, 'system'),
    ('EXCEDENTE DE ENERGIA', 'Compensación Excedentes', 'COMPENSACION', 1.00, 'global', TRUE, 'system'),
    ('COMPENSACION EXCEDENTES', 'Compensación Excedentes', 'COMPENSACION', 1.00, 'global', TRUE, 'system'),
    ('EXCEDENTES AUTOCONSUMO', 'Compensación Excedentes', 'COMPENSACION', 1.00, 'global', TRUE, 'system'),
    ('IMPUESTO ELECTRICO', 'Impuesto Eléctrico', 'IMPUESTO_ELECTRICO', 1.00, 'global', TRUE, 'system'),
    ('IMPUESTO SOBRE LA ELECTRICIDAD', 'Impuesto Eléctrico', 'IMPUESTO_ELECTRICO', 1.00, 'global', TRUE, 'system'),
    ('IEE', 'Impuesto Eléctrico', 'IMPUESTO_ELECTRICO', 1.00, 'global', TRUE, 'system'),
    ('IVA', 'IVA', 'IVA', 1.00, 'global', TRUE, 'system'),
    ('IGIC', 'IVA', 'IVA', 1.00, 'global', TRUE, 'system'),
    ('IMPUESTO GENERAL', 'IVA', 'IVA', 1.00, 'global', TRUE, 'system'),
    ('DESCUENTO', 'Descuento', 'DESCUENTO', 1.00, 'global', TRUE, 'system'),
    ('PROMOCION', 'Descuento', 'DESCUENTO', 1.00, 'global', TRUE, 'system'),
    ('REBAJA', 'Descuento', 'DESCUENTO', 1.00, 'global', TRUE, 'system'),
    ('AJUSTE', 'Ajustes', 'AJUSTES', 1.00, 'global', TRUE, 'system'),
    ('REGULARIZACION', 'Ajustes', 'AJUSTES', 1.00, 'global', TRUE, 'system'),
    ('RECTIFICACION', 'Ajustes', 'AJUSTES', 1.00, 'global', TRUE, 'system'),
    ('ENERGIA REACTIVA', 'Energía Reactiva', 'REACTIVA', 1.00, 'global', TRUE, 'system'),
    ('EXCESO REACTIVA', 'Energía Reactiva', 'REACTIVA', 1.00, 'global', TRUE, 'system')
ON CONFLICT (original_text, canonical_group, source_scope) DO NOTHING;

-- ============================================
-- FUNCTION: Update timestamp trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to concept_normalizations
DROP TRIGGER IF EXISTS update_concept_norm_updated_at ON concept_normalizations;
CREATE TRIGGER update_concept_norm_updated_at
    BEFORE UPDATE ON concept_normalizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION: Auto-log bill changes
-- ============================================
CREATE OR REPLACE FUNCTION log_bill_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if actual data changed
    IF OLD IS NOT NULL AND (
        OLD.comercializadora IS DISTINCT FROM NEW.comercializadora OR
        OLD.titular IS DISTINCT FROM NEW.titular OR
        OLD.cups IS DISTINCT FROM NEW.cups OR
        OLD.fechaInicio IS DISTINCT FROM NEW.fechaInicio OR
        OLD.fechaFin IS DISTINCT FROM NEW.fechaFin OR
        OLD.tarifa IS DISTINCT FROM NEW.tarifa OR
        OLD.costeTotalConsumo IS DISTINCT FROM NEW.costeTotalConsumo OR
        OLD.costeTotalPotencia IS DISTINCT FROM NEW.costeTotalPotencia OR
        OLD.costeMedioKwh IS DISTINCT FROM NEW.costeMedioKwh OR
        OLD.consumoTotalKwh IS DISTINCT FROM NEW.consumoTotalKwh OR
        OLD.totalFactura IS DISTINCT FROM NEW.totalFactura OR
        OLD.validation_status IS DISTINCT FROM NEW.validation_status OR
        OLD.math_check_passed IS DISTINCT FROM NEW.math_check_passed
    ) THEN
        INSERT INTO bill_audit_log (
            bill_id,
            project_id,
            field_changed,
            old_value,
            new_value,
            change_source,
            created_by
        ) VALUES (
            NEW.id,
            NEW.project_id,
            'multiple_fields',
            jsonb_build_object(
                'comercializadora', OLD.comercializadora,
                'titular', OLD.titular,
                'cups', OLD.cups,
                'fechaInicio', OLD.fechaInicio,
                'fechaFin', OLD.fechaFin,
                'tarifa', OLD.tarifa,
                'costeTotalConsumo', OLD.costeTotalConsumo,
                'costeTotalPotencia', OLD.costeTotalPotencia,
                'costeMedioKwh', OLD.costeMedioKwh,
                'consumoTotalKwh', OLD.consumoTotalKwh,
                'totalFactura', OLD.totalFactura,
                'validationStatus', OLD.validation_status,
                'mathCheckPassed', OLD.math_check_passed
            )::TEXT,
            jsonb_build_object(
                'comercializadora', NEW.comercializadora,
                'titular', NEW.titular,
                'cups', NEW.cups,
                'fechaInicio', NEW.fechaInicio,
                'fechaFin', NEW.fechaFin,
                'tarifa', NEW.tarifa,
                'costeTotalConsumo', NEW.costeTotalConsumo,
                'costeTotalPotencia', NEW.costeTotalPotencia,
                'costeMedioKwh', NEW.costeMedioKwh,
                'consumoTotalKwh', NEW.consumoTotalKwh,
                'totalFactura', NEW.totalFactura,
                'validationStatus', NEW.validation_status,
                'mathCheckPassed', NEW.math_check_passed
            )::TEXT,
            'manual_edit',
            'system'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS for documentation
-- ============================================
COMMENT ON TABLE concept_normalizations IS 'Stores learned and system concept mappings for intelligent normalization';
COMMENT ON TABLE bill_audit_log IS 'Audit trail for all changes to extracted bills';
COMMENT ON COLUMN bills.extraction_status IS 'Status of AI extraction: pending, success, error, partial';
COMMENT ON COLUMN bills.validation_status IS 'Mathematical validation status: unchecked, pending, validated, discrepancy, failed';
COMMENT ON COLUMN bills.math_check_passed IS 'Whether the bill passed mathematical validation';
COMMENT ON COLUMN bills.discrepancy_amount IS 'Difference between printed total and calculated total';
COMMENT ON COLUMN bills.review_attempts IS 'Number of times bill was reviewed/validated';
COMMENT ON COLUMN bills.validation_notes IS 'Notes from validation review';
COMMENT ON COLUMN bills.last_validated_at IS 'Timestamp of last validation';
COMMENT ON COLUMN bills.storage_path IS 'Path to original document in Supabase Storage';
COMMENT ON COLUMN bills.file_hash IS 'SHA-256 hash of original file for duplicate detection';
COMMENT ON COLUMN bills.original_file_url IS 'Public URL of original document in Storage';

COMMIT;

-- ============================================
-- ROLLBACK INSTRUCTIONS
-- ============================================
-- To rollback this migration, run:
-- BEGIN;
-- DROP TRIGGER IF EXISTS log_bill_change ON bills;
-- DROP FUNCTION IF EXISTS log_bill_change();
-- DROP TRIGGER IF EXISTS update_concept_norm_updated_at ON concept_normalizations;
-- DROP FUNCTION IF EXISTS update_updated_at_column();
-- ALTER TABLE bills DROP COLUMN IF EXISTS extraction_status;
-- ALTER TABLE bills DROP COLUMN IF EXISTS validation_status;
-- ALTER TABLE bills DROP COLUMN IF EXISTS math_check_passed;
-- ALTER TABLE bills DROP COLUMN IF EXISTS discrepancy_amount;
-- ALTER TABLE bills DROP COLUMN IF EXISTS review_attempts;
-- ALTER TABLE bills DROP COLUMN IF EXISTS validation_notes;
-- ALTER TABLE bills DROP COLUMN IF EXISTS last_validated_at;
-- ALTER TABLE bills DROP COLUMN IF EXISTS storage_path;
-- ALTER TABLE bills DROP COLUMN IF EXISTS file_hash;
-- ALTER TABLE bills DROP COLUMN IF EXISTS original_file_url;
-- DROP TABLE IF EXISTS bill_audit_log;
-- DROP TABLE IF EXISTS concept_normalizations;
-- COMMIT;
