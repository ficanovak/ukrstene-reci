/**
 * Social token verification (Task 3.2).
 *
 * This module defines the {@link SocialVerifier} interface used by the auth
 * service to turn an opaque Apple/Google client token into a stable identity
 * `{ provider, externalId, email? }`. The interface is the seam that lets tests
 * inject a MOCK verifier (no network, deterministic) while production wires the
 * real implementations.
 *
 * IMPORTANT — the real verification is intentionally STUBBED here. Wiring the
 * genuine checks is a later task:
 *   - Apple:  fetch Apple's public JWKS (https://appleid.apple.com/auth/keys),
 *             verify the identity-token JWT's RS256 signature, `iss`
 *             (https://appleid.apple.com), `aud` (our client id) and `exp`,
 *             then read `sub` (the stable Apple user id) and optional `email`.
 *   - Google: either verify the Google ID-token JWT against Google's JWKS
 *             (https://www.googleapis.com/oauth2/v3/certs) with the same
 *             iss/aud/exp checks, or call the tokeninfo endpoint
 *             (https://oauth2.googleapis.com/tokeninfo?id_token=...). `sub` is
 *             the stable Google user id.
 * Neither path should pull a heavy SDK; a small JOSE/JWKS verification is
 * enough. Until that lands, {@link defaultSocialVerifier} throws so a
 * misconfigured production deploy fails loudly rather than trusting tokens.
 */

export type SocialProvider = "apple" | "google";

/** The identity a verified social token resolves to. */
export interface SocialIdentity {
  provider: SocialProvider;
  /** Stable per-provider user id (the token's `sub`). */
  externalId: string;
  email?: string;
}

/**
 * Verifies a provider token and resolves it to a {@link SocialIdentity}.
 *
 * Implementations MUST throw if the token is invalid/expired/untrusted — the
 * auth route maps a throw to HTTP 401.
 */
export interface SocialVerifier {
  verify(provider: SocialProvider, token: string): Promise<SocialIdentity>;
}

/**
 * Real-path verifier — placeholder.
 *
 * Structured exactly like the production verifier will be (provider switch),
 * but the per-provider verification is not implemented yet. It throws so that
 * an accidental real-traffic call is a hard, visible failure (→ 401) rather
 * than a silent trust of an unverified token. Tests never use this; they inject
 * a mock implementing {@link SocialVerifier}.
 */
export const defaultSocialVerifier: SocialVerifier = {
  async verify(provider: SocialProvider, token: string): Promise<SocialIdentity> {
    // `token` is accepted to match the interface; the real verification that
    // consumes it is not implemented yet (see module docs). Reference it so the
    // signature stays honest without an unused-parameter lint error.
    void token;
    switch (provider) {
      case "apple":
        // TODO(3.x): verify Apple identity token against Apple JWKS.
        throw new Error("Apple token verification is not yet implemented");
      case "google":
        // TODO(3.x): verify Google ID token against Google JWKS / tokeninfo.
        throw new Error("Google token verification is not yet implemented");
      default: {
        const exhaustive: never = provider;
        throw new Error(`Unsupported social provider: ${String(exhaustive)}`);
      }
    }
  },
};
