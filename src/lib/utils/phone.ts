/**
 * Phone number formatting and validation utilities
 */

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX for US numbers)
 * @param phone - Phone number in any format
 * @returns Phone number in E.164 format
 */
export function formatToE164(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // Handle different input lengths
  if (digits.length === 10) {
    // US number without country code
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits[0] === "1") {
    // US number with country code but no +
    return `+${digits}`;
  }

  // If already has + prefix, return as-is (just cleaned)
  if (phone.startsWith("+")) {
    return `+${digits}`;
  }

  // Default: assume it's complete and add + prefix
  return `+${digits}`;
}

/**
 * Format a phone number for display (US format)
 * @param phone - Phone number in any format
 * @returns Formatted phone number like (555) 123-4567
 */
export function formatPhoneDisplay(phone: string): string {
  // Get last 10 digits (US number)
  const digits = phone.replace(/\D/g, "").slice(-10);

  if (digits.length !== 10) {
    // Return original if not a valid US number
    return phone;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Format a phone number for display with country code if international
 * @param phone - Phone number in any format
 * @returns Formatted phone number
 */
export function formatPhoneDisplayFull(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) {
    // US number without country code
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits[0] === "1") {
    // US number with country code
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // International or unknown format - just clean it up
  if (phone.startsWith("+")) {
    return phone;
  }

  return `+${digits}`;
}

/**
 * Compare two phone numbers (handles format variations)
 * @param a - First phone number
 * @param b - Second phone number
 * @returns true if the phone numbers match
 */
export function phoneNumbersMatch(a: string, b: string): boolean {
  // Compare last 10 digits (US standard)
  const digitsA = a.replace(/\D/g, "").slice(-10);
  const digitsB = b.replace(/\D/g, "").slice(-10);

  return digitsA === digitsB && digitsA.length === 10;
}

/**
 * Validate if a string is a valid phone number
 * @param phone - Phone number to validate
 * @returns true if the phone number is valid
 */
export function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");

  // Valid US phone: 10 digits or 11 digits starting with 1
  if (digits.length === 10) {
    return true;
  }

  if (digits.length === 11 && digits[0] === "1") {
    return true;
  }

  // International: at least 7 digits with + prefix
  if (phone.startsWith("+") && digits.length >= 7) {
    return true;
  }

  return false;
}

/**
 * Get the last 4 digits of a phone number (for display/matching)
 * @param phone - Phone number
 * @returns Last 4 digits
 */
export function getPhoneLast4(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4);
}

/**
 * Extract area code from a US phone number
 * @param phone - Phone number
 * @returns Area code (3 digits) or empty string
 */
export function getAreaCode(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);

  if (digits.length >= 10) {
    return digits.slice(0, 3);
  }

  return "";
}

/**
 * Clean a phone number to digits only
 * @param phone - Phone number
 * @returns Digits only
 */
export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, "");
}
