/**
 * utility to normalize context from a given URL, so that it is consistent for
 * the same configurations.
 *
 * the context will include the full path name (but omit host), sorted search
 * params and a consistent hash fragment
 */
export function normalizeContextFromUrl(
  input: string = typeof window !== "undefined" ? window.location.href : "/",
): string {
  const url = new URL(input, "http://localhost");

  // normalize searchParams
  const searchParams = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => {
      if (a > b) {
        return 1;
      }

      if (a < b) {
        return -1;
      }

      return 0;
    })
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  return `${url.pathname}?${searchParams}${url.hash || "#"}`;
}
