-- Additive Migration for Siteop PWA MVP Part 2 & Part 3
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables or touch expense_ tables.

CREATE TABLE IF NOT EXISTS entry_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES diary_entries (id) ON DELETE CASCADE,
  summary_bullet TEXT,
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date DATE NOT NULL UNIQUE,
  agenda_text TEXT,
  summary_text TEXT,
  entries_count INT,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE entry_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_digests ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'entry_flags' AND policyname = 'Allow authenticated and anon access on entry_flags'
  ) THEN
    CREATE POLICY "Allow authenticated and anon access on entry_flags" ON entry_flags
      FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_digests' AND policyname = 'Allow authenticated and anon access on daily_digests'
  ) THEN
    CREATE POLICY "Allow authenticated and anon access on daily_digests" ON daily_digests
      FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
  END IF;
END $$;
