/**
 * CM502 social accounts — single source of truth (§D). Inspected the
 * project for any existing social config before adding this (site
 * header/footer, site_settings table, env vars) and found none, so this
 * is a fresh, small constants module rather than a URL scattered across
 * components.
 */
export const INSTAGRAM_HANDLE = "cmspeed.official";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;

export const TIKTOK_HANDLE = "@cmspeed.official";
export const TIKTOK_URL = `https://www.tiktok.com/${TIKTOK_HANDLE}`;
