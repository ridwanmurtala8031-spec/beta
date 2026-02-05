-- Migration: Add missing columns to signals and group_bindings tables
-- Note: Columns that already exist will be silently ignored (errors suppressed in app code)

-- Add data column to signals table
ALTER TABLE signals ADD COLUMN data TEXT;

-- Add data column to group_bindings table  
ALTER TABLE group_bindings ADD COLUMN data TEXT;

-- Add missing timestamp columns
ALTER TABLE signals ADD COLUMN last_update_at INTEGER;
ALTER TABLE signals ADD COLUMN next_update_at INTEGER;

