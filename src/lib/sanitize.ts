/**
 * DOMPurify-based sanitization for user-generated text content.
 * Strips XSS vectors while preserving legitimate text formatting.
 */

import DOMPurify from "dompurify";

// Create a singleton DOMPurify instance with strict config
const purify = DOMPurify(null as any) as typeof DOMPurify; // DOM-less

// Allow only plain text - strip all HTML
const ALLOWED_TAGS: string[] = [];
const ALLOWED_ATTR: string[] = [];

/**
 * Sanitize plain text input - strips ALL HTML
 * Use this for essay/answer text where no markup is allowed.
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== "string") return "";

  // First pass: DOMPurify strips HTML
  const sanitized = purify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });

  // Second pass: decode any entities that might have survived
  const div = document.createElement("div");
  div.innerHTML = sanitized;
  return div.textContent || "";
}

/**
 * Sanitize but allow a few safe formatting tags (b, i, em, strong, br, p).
 * Use this for display of question text where basic formatting may be present.
 */
export function sanitizeRichText(input: string): string {
  if (!input || typeof input !== "string") return "";

  return purify.sanitize(input, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "br", "p", "span"],
    ALLOWED_ATTR: [],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

/**
 * Sanitize question text input from users - same as sanitizeText
 * but explicitly designed for question paste scenarios
 */
export function sanitizeQuestionText(input: string): string {
  return sanitizeText(input);
}

/**
 * Validate and clean image base64 data
 * Returns null if invalid
 */
export function sanitizeImageData(input: string | null): string | null {
  if (!input || typeof input !== "string") return null;

  // Must start with data:image/
  if (!input.startsWith("data:image/")) return null;

  // Must contain base64 payload
  if (!input.includes(";base64,")) return null;

  // Max 10MB base64 (~13.6M chars in base64)
  if (input.length > 14_000_000) return null;

  return input;
}

/**
 * Sanitize a URL string (for src attributes)
 */
export function sanitizeUrl(input: string): string {
  if (!input || typeof input !== "string") return "";
  return purify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|data):)/i,
  });
}

// Export DOMPurify instance for direct use if needed
export { purify };
