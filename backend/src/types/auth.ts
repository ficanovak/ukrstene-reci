/**
 * Shared JWT-payload shape for protected routes.
 *
 * Both login paths (anon + social) sign `{ sub: userId }` (see src/routes/auth.ts),
 * so every protected route reads the userId off `request.user.sub`. This tiny
 * type replaces the inline `(request.user as { sub: string })` casts that were
 * duplicated across the auth/levels/progress routes, giving one place to evolve
 * the claim set if more claims are added later.
 */
export interface AuthPayload {
  sub: string;
}
