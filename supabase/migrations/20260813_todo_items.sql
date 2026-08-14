-- Additive Migration for Siteop PWA MVP Part 5
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables or touch expense_ tables.
--
-- Weekly to-do list under the Tổng Hợp tab. Auto-populated from flagged
-- diary entries (one todo_item per flagged entry, UNIQUE(entry_id) so
-- re-populating a week only inserts newly-flagged entries and never
-- duplicates or touches existing rows' due_date/sort_order/is_done).

CREATE TABLE IF NOT EXISTS todo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES diary_entries (id) ON DELETE CASCADE,
  week_start DATE NOT NULL, -- Monday of the ISO week this item belongs to
  text TEXT NOT NULL,
  due_date DATE,
  sort_order INT NOT NULL DEFAULT 0,
  is_done BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (entry_id)
);

CREATE INDEX IF NOT EXISTS todo_items_week_start_idx ON todo_items (week_start);

ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'todo_items' AND policyname = 'Allow authenticated and anon access on todo_items'
  ) THEN
    CREATE POLICY "Allow authenticated and anon access on todo_items" ON todo_items
      FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
  END IF;
END $$;
