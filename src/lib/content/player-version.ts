/**
 * Bump manually when story-package format compatibility changes. Decoupled from package.json's
 * app version, which tracks UI/app releases, not package-format compatibility.
 *
 * 0.2.0 is format 1.1.0 support: achievement conditions, seed chats, authored outcome text and
 * manifest tags. A package using them declares `minPlayerVersion: 0.2.0`, because `formatVersion`
 * alone would not keep it out of an older player — the compatibility gate below only compares the
 * major version, so a 1.1.0 package would install on a 1.0.0-era player and then silently never
 * award its achievements.
 */
export const CURRENT_PLAYER_VERSION = '0.2.0';

/** Accepts manifest.json `formatVersion` values whose major version matches this. */
export const SUPPORTED_FORMAT_MAJOR = 1;
