-- Additive Migration for Siteop PWA MVP Part 5b
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables or touch expense_ tables.
--
-- Deleting a todo_item was a hard DELETE, but the weekly auto-populate merge
-- only checks "does a todo_item row exist for this entry_id" -- so a deleted
-- item's underlying entry is still flagged, and it silently reappeared on the
-- next visit/re-populate. Switch to a soft-delete flag: the row (and its
-- entry_id) stays, blocking re-creation, but is filtered out of the UI.

ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS dismissed BOOLEAN NOT NULL DEFAULT false;
