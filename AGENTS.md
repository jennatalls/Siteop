# Agent Instructions for Siteop

Read this before editing anything under `api/` or touching Gemini/Supabase config.

## 1. Gemini model names — always use the shared `-latest` alias

Never hardcode a dated/versioned Gemini model snapshot (e.g. `gemini-1.5-flash`,
`gemini-2.0-flash-001`, `gemini-2.5-flash-preview-...`). Google periodically
sunsets these. This exact mistake took down `/api/transcribe`, `/api/extract`,
and `/api/generate-digest` in production on 2026-08-12 when `gemini-1.5-flash`
started returning `404 Not Found`, silently for days because the client-side
fallback (see #2) swallowed the error.

The model name lives in **one place**: `src/lib/geminiConfig.ts` (`GEMINI_MODEL`).
All three routes import it. If you need to change the model:

- Change it in `src/lib/geminiConfig.ts` only.
- Do not write a model string literal inline in an `api/*.ts` route again —
  that's how it ended up hardcoded in three separate files last time, and two
  of them got missed when the third was "fixed."
- Prefer Google's `-latest` alias (currently `gemini-flash-latest`) over a
  dated snapshot unless you have a specific reason to pin a version and are
  prepared to update it manually before Google sunsets it.

## 2. Gemini API calls stay server-side only — no client fallback

`GEMINI_API_KEY` (no `VITE_` prefix) must only be read by `api/*.ts`
serverless routes, never by client code in `src/`. `src/lib/geminiFallback.ts`
calls those routes and, on failure, **throws and surfaces the real error** —
it does not retry by calling the Gemini SDK directly from the browser, and it
does not silently swallow the failure and return an empty/fake success.

If you're about to add "fall back to calling Gemini directly from the browser
with `VITE_GEMINI_API_KEY` if the API route fails" — don't. That pattern was
already added and removed once (it leaked the key into the client bundle and
hid real errors behind a fake success toast). Same goes for
`src/routes/DigestRoute.tsx`'s `handleGenerateDigest` — it calls
`/api/generate-digest` only.

## 3. `api/*.ts` relative imports need an explicit `.js` extension

`package.json` has `"type": "module"`, so Vercel's Node runtime resolves
`api/*.ts` files with Node's **native ESM loader**, not a bundler — unlike
the Vite/`tsc` build for `src/`, which is bundler-mode and tolerates
extensionless imports. Native ESM requires explicit file extensions on
relative imports. `import { X } from '../src/lib/foo'` (no extension) throws
`ERR_MODULE_NOT_FOUND` at module-load time in production — before the
handler runs — surfacing as a bare `FUNCTION_INVOCATION_FAILED` with no
useful stack trace anywhere in the standard deployment logs.

This built and typechecked fine locally both times it happened (`tsc` /
`vercel build` don't enforce Node's runtime ESM extension rules) and only
broke in the actually-deployed function. So:

- Any new relative import inside an `api/*.ts` file (or anything it imports)
  needs a `.js` extension: `from '../src/lib/foo.js'`, pointing at the `.ts`
  source file — this is normal/correct for TypeScript + native ESM.
- Before merging a change to `api/*.ts` (or a file it imports) to `main`,
  verify it on a **preview deployment** (push to a non-main branch, hit the
  preview URL's endpoints directly) — don't treat a clean local
  `tsc`/`vercel build` as proof the deployed function will actually run.

## 4. Supabase — additive migrations only

`supabase/migrations/` is additive-only. Never alter or drop existing tables,
and never touch `expense_*` tables or the `diary_entries` schema — those
belong to a separate concern. See the header comment in each migration file.
