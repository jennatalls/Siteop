-- Additive Migration for Siteop PWA MVP
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables or touch expense_ tables.

CREATE TABLE IF NOT EXISTS diary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  voice_url TEXT,
  photo_url TEXT,
  transcription TEXT,
  extracted_data JSONB,  -- { category, materials: [], labor: [], confidence_score }
  status TEXT DEFAULT 'draft',  -- draft | filed | archived
  submitted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  entries_count INT,
  google_drive_file_id TEXT,
  status TEXT,
  error_message TEXT
);

-- Enable Row Level Security (RLS)
ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users read and write access
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'diary_entries' AND policyname = 'Authenticated users can manage diary_entries'
  ) THEN
    CREATE POLICY "Authenticated users can manage diary_entries" ON diary_entries
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sync_logs' AND policyname = 'Authenticated users can manage sync_logs'
  ) THEN
    CREATE POLICY "Authenticated users can manage sync_logs" ON sync_logs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
