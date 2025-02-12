/**
 * validate that the input is a JavaScript object
 */
export function isRecord(input: unknown): input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }

  return true;
}
