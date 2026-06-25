import type {
  SocialProvider,
  SocialVerifier,
} from "./socialVerify.js";
import type { PrismaClient, User } from "@prisma/client";

/**
 * Auth business logic (Task 3.2).
 *
 * Pure, framework-agnostic functions that take an injected PrismaClient (so
 * tests hit the test DB) and, for social login, an injected
 * {@link SocialVerifier} (so tests use a mock and no network is touched). The
 * Fastify route layer (src/routes/auth.ts) handles HTTP concerns (validation,
 * JWT signing, status codes) and calls into here.
 */

export class InvalidSocialTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSocialTokenError";
  }
}

/**
 * Anonymous login: find-or-create the `anon` user for a device.
 *
 * The device's `deviceId` is stored as the user's `externalId`, so the same
 * device always maps back to the same anon user (progress survives app
 * restarts before the player signs in). Returns the User row; the route signs
 * the JWT.
 *
 * SECURITY (known limitation): the client-supplied `deviceId` is trusted
 * verbatim as the identity — there is no signing or device attestation. A
 * forged or guessed deviceId therefore grants access to that anon account's
 * progress, and could be migrated into an attacker's social account at link
 * time. This is largely inherent to device-id anonymous auth, but a future
 * hardening could issue signed device tokens (e.g. a server-minted, HMAC'd
 * device secret returned on first contact and required thereafter) so the
 * server can verify the deviceId was actually issued by us. NOT implemented
 * here — documented as accepted risk for the anonymous tier.
 *
 * Uses `upsert` on the (authProvider, externalId) composite unique rather than
 * find-then-create, so concurrent calls with the SAME deviceId can never insert
 * duplicate rows (a P2002 unique violation collapses into the existing row
 * instead of creating a second user that would split the player's progress).
 */
export async function anonLogin(
  prisma: PrismaClient,
  deviceId: string,
): Promise<User> {
  return prisma.user.upsert({
    where: { authProvider_externalId: { authProvider: "anon", externalId: deviceId } },
    create: { authProvider: "anon", externalId: deviceId },
    // Identity row already exists: return it unchanged (no fields to update).
    update: {},
  });
}

/**
 * Social login: verify the provider token, find-or-create the social user, and
 * (optionally) migrate an anonymous user's progress + preferences onto it.
 *
 * @throws InvalidSocialTokenError if the verifier rejects the token (→ 401).
 */
export async function socialLogin(
  prisma: PrismaClient,
  verifier: SocialVerifier,
  params: { provider: SocialProvider; token: string; anonUserId?: string },
): Promise<User> {
  let identity;
  try {
    identity = await verifier.verify(params.provider, params.token);
  } catch (err) {
    throw new InvalidSocialTokenError(
      err instanceof Error ? err.message : "social token verification failed",
    );
  }

  // Find-or-create the social user by (authProvider, externalId). `upsert` on
  // the composite unique makes this race-safe: concurrent first logins for the
  // same social identity collapse onto one row instead of inserting duplicates
  // that would split the player's progress.
  const socialUser = await prisma.user.upsert({
    where: {
      authProvider_externalId: {
        authProvider: params.provider,
        externalId: identity.externalId,
      },
    },
    create: {
      authProvider: params.provider,
      externalId: identity.externalId,
    },
    update: {},
  });

  // Migrate from the anon user when requested, it exists, and it is a different
  // user than the social account. Anything else (missing/already-migrated/same
  // user) is a no-op so repeated social logins are idempotent.
  if (params.anonUserId && params.anonUserId !== socialUser.id) {
    const anonUser = await prisma.user.findUnique({
      where: { id: params.anonUserId },
    });
    if (anonUser && anonUser.authProvider === "anon") {
      await migrateAnonUser(prisma, anonUser, socialUser);
    }
  }

  return socialUser;
}

/**
 * Decide which of two progress rows for the same (levelId, mode) to keep.
 *
 * Rule: keep the row with more `stars`; ties broken by higher `score`. (Stars
 * are the headline achievement; score is the finer-grained tiebreak.) Returns
 * true if `candidate` is strictly better than `incumbent`.
 */
function isBetterProgress(
  candidate: { stars: number; score: number },
  incumbent: { stars: number; score: number },
): boolean {
  if (candidate.stars !== incumbent.stars) return candidate.stars > incumbent.stars;
  return candidate.score > incumbent.score;
}

/**
 * Move an anon user's progress and (conditionally) preferences onto the social
 * user, transactionally, then delete the now-empty anon user.
 *
 * Conflict rule: UserProgress is unique on (userId, levelId, mode). For any
 * (levelId, mode) both users have, keep the BETTER result (more stars, higher
 * score as tiebreak — see {@link isBetterProgress}) and drop the loser, so the
 * unique constraint is never violated.
 *
 * Preferences rule: copy the anon user's currentLanguageId / currentScript /
 * theme / checkMode onto the social user ONLY for fields the social user has
 * not already set (null), so an existing social account's choices are never
 * clobbered. Each field is considered independently.
 *
 * All writes run in a single `$transaction` so a failure can't leave progress
 * split between the two users.
 */
async function migrateAnonUser(
  prisma: PrismaClient,
  anonUser: User,
  socialUser: User,
): Promise<void> {
  const [anonProgress, socialProgress] = await Promise.all([
    prisma.userProgress.findMany({ where: { userId: anonUser.id } }),
    prisma.userProgress.findMany({ where: { userId: socialUser.id } }),
  ]);

  const socialByKey = new Map(
    socialProgress.map((p) => [`${p.levelId}:${p.mode}`, p]),
  );

  // Plan the per-row outcome before touching the DB.
  const toReassign: string[] = []; // anon progress ids that move over as-is
  const conflictsToReplace: { socialId: string; anonId: string }[] = [];
  const losingAnonIds: string[] = []; // anon rows that lose the conflict

  for (const anonRow of anonProgress) {
    const key = `${anonRow.levelId}:${anonRow.mode}`;
    const incumbent = socialByKey.get(key);
    if (!incumbent) {
      toReassign.push(anonRow.id);
    } else if (isBetterProgress(anonRow, incumbent)) {
      conflictsToReplace.push({ socialId: incumbent.id, anonId: anonRow.id });
    } else {
      losingAnonIds.push(anonRow.id);
    }
  }

  // Preferences: only fill fields the social user has not set.
  const prefData: Record<string, string> = {};
  if (socialUser.currentLanguageId == null && anonUser.currentLanguageId != null)
    prefData.currentLanguageId = anonUser.currentLanguageId;
  if (socialUser.currentScript == null && anonUser.currentScript != null)
    prefData.currentScript = anonUser.currentScript;
  if (socialUser.theme == null && anonUser.theme != null)
    prefData.theme = anonUser.theme;
  if (socialUser.checkMode == null && anonUser.checkMode != null)
    prefData.checkMode = anonUser.checkMode;

  await prisma.$transaction(async (tx) => {
    // Non-conflicting rows: simply re-point at the social user.
    if (toReassign.length > 0) {
      await tx.userProgress.updateMany({
        where: { id: { in: toReassign } },
        data: { userId: socialUser.id },
      });
    }

    // Conflicts the anon row wins: drop the social incumbent, then move the
    // anon row over. Order matters — delete first so the unique constraint is
    // free before the reassign.
    for (const { socialId, anonId } of conflictsToReplace) {
      await tx.userProgress.delete({ where: { id: socialId } });
      await tx.userProgress.update({
        where: { id: anonId },
        data: { userId: socialUser.id },
      });
    }

    // Conflicts the social row wins: discard the anon duplicates.
    if (losingAnonIds.length > 0) {
      await tx.userProgress.deleteMany({
        where: { id: { in: losingAnonIds } },
      });
    }

    if (Object.keys(prefData).length > 0) {
      await tx.user.update({
        where: { id: socialUser.id },
        data: prefData,
      });
    }

    // The anon user is now empty; remove it so a device can start fresh.
    await tx.user.delete({ where: { id: anonUser.id } });
  });
}
