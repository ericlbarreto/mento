/** A required provider setting (API key, voice id) is missing. Routes turn this into HTTP 503. */
export class VoiceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceConfigError";
  }
}

/**
 * True for a VoiceConfigError. Checks the name, not `instanceof`: route files are loaded by @fastify/autoload
 * through a different module loader than the rest of the app in tests, so two copies of the class can exist.
 */
export function isVoiceConfigError(err: unknown): err is VoiceConfigError {
  return err instanceof Error && err.name === "VoiceConfigError";
}
