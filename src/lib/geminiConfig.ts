// Single source of truth for which Gemini model the server-side API routes call.
//
// RULE: always use one of Google's `-latest` aliases here, never a dated /
// versioned snapshot (e.g. `gemini-1.5-flash`, `gemini-2.0-flash-001`).
// Google periodically sunsets dated snapshots -- that exact mistake took down
// /api/transcribe, /api/extract, and /api/generate-digest in production on
// 2026-08-12 when `gemini-1.5-flash` started returning 404s. `-latest`
// aliases are maintained by Google to keep resolving to their current stable
// model, so this file should not need to change just because Google ships a
// new version.
//
// NOTE: importing this from an api/*.ts route requires the explicit `.js`
// extension -- `from '../src/lib/geminiConfig.js'`, not `'...geminiConfig'`.
// package.json has "type": "module", so Vercel's Node runtime resolves
// api/*.ts relative imports with Node's native ESM loader, not a bundler.
// Native ESM requires explicit file extensions on relative imports; without
// one, Node throws ERR_MODULE_NOT_FOUND at module-load time (before the
// handler runs), which surfaces as a bare FUNCTION_INVOCATION_FAILED with no
// useful stack trace. This built and typechecked fine locally both times
// (`tsc`/`vite build` don't enforce Node's ESM extension rules) and only
// failed at actual runtime -- confirmed via a real preview deployment, not
// local build success. If you add another relative import to an api/*.ts
// file, give it a `.js` extension and verify on a preview deployment (push
// to a non-main branch) before merging to main.
//
// If this ever needs to change, change it here only -- do not hardcode a
// model string inline in an api/*.ts route again.
export const GEMINI_MODEL = 'gemini-flash-latest';
