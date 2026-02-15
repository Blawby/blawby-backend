/**
 * Escapes characters that have special meaning in SQL LIKE patterns (%) and (_).
 * Use this to sanitize user input before passing it to a LIKE or ILIKE query.
 */
export const escapeLikeWildcards = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, '\\$&');
};
