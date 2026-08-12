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
// NOTE: this lives under src/lib (not api/_lib) on purpose -- an
// api/_lib/gemini.ts variant of this file caused FUNCTION_INVOCATION_FAILED
// at runtime on Vercel (module wasn't resolving inside the serverless
// bundle), even though it built and typechecked fine. Verified via a preview
// deployment before this file existed. If this constant needs to move again,
// verify against a preview deployment (a non-main branch push) before
// merging to main -- don't rely on `tsc`/local build succeeding as proof the
// deployed function will actually run.
//
// If this ever needs to change, change it here only -- do not hardcode a
// model string inline in an api/*.ts route again.
export const GEMINI_MODEL = 'gemini-flash-latest';
