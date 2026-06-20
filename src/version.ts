/**
 * Build-time-injected package version.
 *
 * `__SKILLDOCTOR_VERSION__` is replaced by tsup's `define` with the version
 * from package.json. In environments where it is not defined (e.g. running the
 * raw TS under vitest), we fall back to "0.0.0-dev".
 */

declare const __SKILLDOCTOR_VERSION__: string | undefined;

export const VERSION: string =
  typeof __SKILLDOCTOR_VERSION__ === "string"
    ? __SKILLDOCTOR_VERSION__
    : "0.0.0-dev";
