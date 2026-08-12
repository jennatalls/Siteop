/**
 * Removes Vietnamese diacritics / accents for case-insensitive diacritic-free searching.
 * e.g. "Xi măng" -> "xi mang", "Thợ nề" -> "tho ne"
 */
export function removeVietnameseDiacritics(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Performs a diacritic-insensitive and case-insensitive check if `searchQuery` is included in `targetText`.
 */
export function matchVietnameseSearch(targetText: string, searchQuery: string): boolean {
  if (!searchQuery.trim()) return true;
  if (!targetText) return false;

  const normalizedTarget = removeVietnameseDiacritics(targetText);
  const normalizedQuery = removeVietnameseDiacritics(searchQuery);

  return normalizedTarget.includes(normalizedQuery);
}

/**
 * Trigger words list for Part 2 per-entry flagging:
 * lưu ý, quan trọng, khẩn, gấp, cần, chú ý, nhớ
 */
export const TRIGGER_WORDS = [
  'lưu ý',
  'luu y',
  'quan trọng',
  'quan trong',
  'khẩn',
  'khan',
  'gấp',
  'gap',
  'cần',
  'can',
  'chú ý',
  'chu y',
  'nhớ',
  'nho'
];

export function checkTriggerWords(rawText: string): { isFlagged: boolean; matchedReason: string | null } {
  if (!rawText) return { isFlagged: false, matchedReason: null };

  const normalizedText = removeVietnameseDiacritics(rawText);

  // Check each trigger word
  for (const triggerWord of ['luu y', 'quan trong', 'khan', 'gap', 'can', 'chu y', 'nho']) {
    // Regex boundary check for whole words or phrases
    const regex = new RegExp(`\\b${triggerWord}\\b`, 'i');
    if (regex.test(normalizedText)) {
      // Return original display string for matched reason
      let originalDisplay = triggerWord;
      if (triggerWord === 'luu y') originalDisplay = 'lưu ý';
      else if (triggerWord === 'quan trong') originalDisplay = 'quan trọng';
      else if (triggerWord === 'khan') originalDisplay = 'khẩn';
      else if (triggerWord === 'gap') originalDisplay = 'gấp';
      else if (triggerWord === 'can') originalDisplay = 'cần';
      else if (triggerWord === 'chu y') originalDisplay = 'chú ý';
      else if (triggerWord === 'nho') originalDisplay = 'nhớ';

      return { isFlagged: true, matchedReason: originalDisplay };
    }
  }

  return { isFlagged: false, matchedReason: null };
}
