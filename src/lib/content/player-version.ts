/** Bump manually when story-package format compatibility changes. Decoupled from
 * package.json's app version, which tracks UI/app releases, not package-format compatibility. */
export const CURRENT_PLAYER_VERSION = '0.1.0';

/** Accepts manifest.json `formatVersion` values whose major version matches this. */
export const SUPPORTED_FORMAT_MAJOR = 1;
