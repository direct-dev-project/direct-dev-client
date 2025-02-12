/**
 * Create a promise that resolves after the defined delay.
 *
 * This implementation is equivalent to using setTimeout, but allows using an
 * async/await pattern for handling delayed operations.
 */
export function asyncTimeout(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), delayMs));
}
