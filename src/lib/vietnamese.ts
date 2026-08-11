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
