/** Trim, lowercase, strip diacritics. Does NOT transliterate scripts. */
export function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

/**
 * Resolve a user-supplied city (slug like "sofia", or the Cyrillic name
 * "София") against the API's city list. Latin↔Cyrillic transliteration is
 * out of scope — an agent that has called `list_districts` once already
 * knows the slug to use.
 */
export function resolveCity(
  input: string,
  cities: { slug: string; name: string }[],
): { slug: string; name: string } | null {
  const key = normalizeKey(input);
  return (
    cities.find((c) => normalizeKey(c.slug) === key || normalizeKey(c.name) === key) ?? null
  );
}
