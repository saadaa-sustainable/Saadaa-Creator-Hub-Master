/**
 * Helvetica everywhere. Native stack only — no webfonts.
 *
 * Helvetica is proprietary (not on Google Fonts) so we use whatever the OS
 * provides. CSS uses the native stack: Helvetica Neue → Helvetica → Arial.
 *
 * Previously this file shipped Space Grotesk for display surfaces. Removed —
 * user wants Helvetica for body AND display, no other fonts.
 */

/** Empty class-name placeholder so callers that spread `spaceGrotesk.variable` still compile. */
export const spaceGrotesk = {
  variable: "",
  className: "",
  style: {},
};
