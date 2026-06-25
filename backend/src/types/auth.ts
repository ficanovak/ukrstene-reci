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

/**
 * Type `request.user` (and the `app.jwt.sign` payload) as {@link AuthPayload}
 * globally via @fastify/jwt declaration merging, so protected routes can read
 * `request.user.sub` directly without an inline `as AuthPayload` cast. Both
 * login paths sign `{ sub }`, so `payload` and `user` share the same shape (no
 * `formatUser` transform is configured).
 */
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthPayload;
    user: AuthPayload;
  }
}
