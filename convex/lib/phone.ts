/**
 * Normalize a phone number to last 10 digits for comparison.
 * Strips all non-digit characters and returns the trailing 10 digits.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}
