import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  AsYouType,
  type CountryCode,
} from "libphonenumber-js";

const DEFAULT_COUNTRY: CountryCode = "US";

/**
 * Normalize a user-entered phone number into E.164 format (`+1XXXXXXXXXX`).
 * Returns null if the input is not a valid phone number.
 *
 * Handles: raw digits, formatted US numbers like "(217) 931-8000",
 * already-E.164 input, and international numbers with explicit country codes.
 */
export function toE164(
  input: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY
): string | null {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164 like "+12179318000"
}

/**
 * Format a phone number for human display. Falls back to the raw input when
 * the number can't be parsed (e.g., still being typed).
 */
export function formatPhoneDisplay(
  input: string,
  country: CountryCode = DEFAULT_COUNTRY
): string {
  if (!input) return "";
  const parsed = parsePhoneNumberFromString(input, country);
  if (parsed) {
    return parsed.country === country
      ? parsed.formatNational()
      : parsed.formatInternational();
  }
  return input;
}

/**
 * Compact dashed format: `XXX-XXX-XXXX` for 10-digit US/CA numbers,
 * `+1-XXX-XXX-XXXX` for E.164 US/CA, falls through to the input
 * untouched for anything else (international, malformed, in-progress
 * typing). Used in tight call-log rows where parens steal horizontal
 * space.
 */
export function formatPhoneDashed(
  input: string,
  country: CountryCode = DEFAULT_COUNTRY
): string {
  if (!input) return "";
  const parsed = parsePhoneNumberFromString(input, country);
  if (parsed && parsed.isValid()) {
    const digits = parsed.nationalNumber.toString();
    if (digits.length === 10) {
      const dashed = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      return parsed.country === country ? dashed : `+${parsed.countryCallingCode}-${dashed}`;
    }
    return parsed.formatInternational();
  }
  return input;
}

/**
 * Live-format partial input as the user types, for dialpad / phone input UIs.
 * Returns what the user has entered, formatted up to the current keystroke.
 */
export function formatAsTyped(
  input: string,
  country: CountryCode = DEFAULT_COUNTRY
): string {
  if (!input) return "";
  return new AsYouType(country).input(input);
}

/** True if `input` normalizes to a valid dialable phone number. */
export function isDialable(
  input: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY
): boolean {
  if (!input) return false;
  try {
    return isValidPhoneNumber(input, defaultCountry);
  } catch {
    return false;
  }
}
