-- Additive Migration for Siteop PWA MVP Part 4
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables or touch expense_ tables.
--
-- Creates the `diary-assets` storage bucket that src/lib/offlineStore.ts
-- (uploadMediaToSupabase) already references but which was never actually
-- created. Every voice/photo upload was failing silently and falling back to
-- storing the raw file inline as a base64 data URL in
-- diary_entries.voice_url / photo_url instead.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('diary-assets', 'diary-assets', true, 52428800) -- 50MB per file
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow authenticated and anon access on diary-assets'
  ) THEN
    CREATE POLICY "Allow authenticated and anon access on diary-assets" ON storage.objects
      FOR ALL TO authenticated, anon
      USING (bucket_id = 'diary-assets')
      WITH CHECK (bucket_id = 'diary-assets');
  END IF;
END $$;
