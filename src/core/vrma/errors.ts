/**
 * Error thrown by the VRMA core for anything wrong with a file.
 *
 * The message is always plain language suitable for showing directly to the
 * user (CLAUDE.md UX rule: never surface raw stack traces or jargon-only
 * errors). Keep messages specific: name the exact field/byte that is wrong.
 */
export class VrmaFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VrmaFileError';
  }
}
