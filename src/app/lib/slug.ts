/**
 * slug.ts — derive a URL-safe tree slug from a free-text name.
 *
 * The server (trees.ts createTreeSchema) enforces ^[a-z0-9][a-z0-9-]{1,63}$:
 * 2–64 chars, lowercase alphanumeric + hyphen, no leading hyphen. This client
 * helper produces a best-effort suggestion the user can edit. It returns '' when
 * the name yields no usable ASCII alphanumerics (e.g. an all-Thai name) so the
 * UI can prompt the user to type a slug themselves.
 */

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Best-effort slug candidate from a name; '' if none can be derived. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // collapse runs of non-alphanumerics to one hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .slice(0, 64)
    .replace(/-+$/, ''); // re-trim in case the slice cut on a hyphen boundary
  return SLUG_REGEX.test(base) ? base : '';
}

/** Mirror of the server-side slug constraint for instant client feedback. */
export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}
