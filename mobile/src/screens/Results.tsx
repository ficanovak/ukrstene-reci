/**
 * Results overlay — the level-complete screen (Task 7.3).
 *
 * Shown by both game screens (Basic + Advanced) the moment a level is solved.
 * It closes the play → save → sync loop: it computes the star rating + score
 * from the run's penalty signals via the pure `scoreLevel` (game/scoring.ts),
 * displays them alongside the mistakes/hints counts, PERSISTS the result to the
 * local DB (which queues it for the sync service), and offers a "Sledeći"
 * (next) button that advances.
 *
 * ── What it shows ────────────────────────────────────────────────────────────
 *   • a localized congrats title (the `solved` i18n key, e.g. "Rešeno!");
 *   • a 1..5 STAR row: five slots, `stars` of them FILLED, the rest EMPTY, with a
 *     staggered "pop" fill animation (each star scales in ~80ms after the prior);
 *   • the numeric SCORE, the MISTAKES count and the HINTS USED count;
 *   • a "Sledeći" button → `onNext`.
 *
 * ── SAVE TIMING (decision) ───────────────────────────────────────────────────
 * The result is persisted ON SHOW (a mount-time effect), NOT on "Next". A player
 * who backgrounds the app or navigates away from the results screen has still
 * EARNED the result, so we save the instant results appear — an accidental
 * nav-away never loses progress. The save runs exactly once per mount (guarded
 * by a ref) and is fire-and-forget: a failed write must not block the UI (the
 * row is queued with `synced = 0` regardless, so the sync service retries).
 *
 * ── SAVE is injectable ───────────────────────────────────────────────────────
 * The side-effect is an `onSave` prop. Production (the game screens) wire the
 * real `progressRepo.saveProgress(getDb(), …)`; tests pass a mock and assert the
 * exact `{ levelId, mode, stars, score, mistakes, hintsUsed }` payload without
 * touching SQLite. `saveProgress` sets `synced = 0`, which is what enqueues the
 * result for the Task-4.4 sync flush.
 *
 * ── ANIMATION TECH ───────────────────────────────────────────────────────────
 * React Native's built-in `Animated` (NOT reanimated), matching AdvancedGame's
 * §6.4 choice: zero jest setup, and the stagger is non-blocking + test-agnostic
 * (tests assert filled/empty star testIDs, never animation internals).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { getDb } from '@/db/sqlite';
import { saveProgress, type ProgressResult } from '@/db/progressRepo';
import type { SqliteDb } from '@/db/sqlite';
import { scoreLevel } from '@/game/scoring';
import { typography, useTheme } from '@/theme';

/** Persist side-effect signature — injectable so tests need no real DB. */
export type SaveProgressFn = (result: ProgressResult) => void | Promise<void>;

/** Per-star fill stagger (ms): each star pops in this long after the previous. */
const STAR_STAGGER_MS = 90;
/** Duration of a single star's pop-in. */
const STAR_POP_MS = 180;

export interface ResultsProps {
  /** Stable level identity for the progress row (cache id or sample id). */
  levelId: string;
  /** Play mode that produced this result ('basic' | 'advanced'). */
  mode: string;
  /** Difficulty band 1..NUM_BANDS — feeds the star rating's band forgiveness. */
  difficultyBand: number;
  /** Mistakes the engine tracked this run. */
  mistakes: number;
  /** Hints the player used this run (Task 7.2). */
  hintsUsed: number;
  /** Advance to the next level (v1: navigate home / reload). */
  onNext: () => void;
  /**
   * Persist the result locally (queues sync). Defaults to the real
   * `progressRepo.saveProgress` against the DB singleton; tests inject a mock.
   */
  onSave?: SaveProgressFn;
}

/** The real persist seam: write to the local DB singleton, queuing the sync. */
const defaultSave: SaveProgressFn = (result) => {
  // Fire-and-forget: open the DB and upsert. Swallow failures — the result is
  // best-effort local state; the user is not blocked, and the next successful
  // completion/sync can recover. (getDb degrades only when native sqlite is
  // unavailable, e.g. dev tooling, where there's nothing to persist to anyway.)
  void getDb()
    .then((db) => saveProgress(db as unknown as SqliteDb, result))
    .catch(() => {
      /* persistence is best-effort; never crash the results screen */
    });
};

/** A single star slot: filled (amber) or empty (outline), with a pop-in. */
function Star({
  index,
  filled,
  color,
  emptyColor,
}: {
  index: number;
  filled: boolean;
  color: string;
  emptyColor: string;
}) {
  // Start tiny, pop to full size after this star's staggered delay. Empty stars
  // animate too (so the row settles uniformly), they just stay un-coloured.
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(scale, {
      toValue: 1,
      duration: STAR_POP_MS,
      delay: index * STAR_STAGGER_MS,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [index, scale]);

  return (
    <Animated.Text
      testID={filled ? `star-filled-${index}` : `star-empty-${index}`}
      accessibilityLabel={filled ? 'star-filled' : 'star-empty'}
      style={[
        styles.star,
        { color: filled ? color : emptyColor, transform: [{ scale }] },
      ]}
    >
      {filled ? '★' : '☆'}
    </Animated.Text>
  );
}

/**
 * Results overlay. Renders over the solved board; the parent gates it on
 * `isSolved`. Computes stars/score from `scoreLevel`, saves on show, advances on
 * "Next".
 */
export function Results({
  levelId,
  mode,
  difficultyBand,
  mistakes,
  hintsUsed,
  onNext,
  onSave = defaultSave,
}: ResultsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const { stars, score } = useMemo(
    () => scoreLevel({ mistakes, hintsUsed, difficultyBand }),
    [mistakes, hintsUsed, difficultyBand],
  );

  // SAVE ON SHOW — exactly once per mount (see the file-level "SAVE TIMING"
  // note). A ref guard survives React 18 StrictMode's double-invoke in dev.
  const saved = useRef(false);
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    void onSave({ levelId, mode, stars, score, mistakes, hintsUsed });
    // Persist the snapshot captured at first show; later prop churn can't double-save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNext = useCallback(() => {
    onNext();
  }, [onNext]);

  return (
    <View testID="results-overlay" style={styles.overlay}>
      <View
        style={[
          styles.modal,
          { backgroundColor: colors.background, borderColor: colors.primary },
        ]}
      >
        <Text style={[styles.title, { color: colors.primary }]}>{t('solved')}</Text>

        {/* ── Star row (1..5; `stars` filled) ─────────────────────────────── */}
        <View testID="star-row" style={styles.starRow} accessibilityLabel={`stars-${stars}`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star
              key={i}
              index={i}
              filled={i < stars}
              color={colors.secondary}
              emptyColor={colors.clueCell}
            />
          ))}
        </View>

        {/* ── Score / mistakes / hints ────────────────────────────────────── */}
        <Text testID="results-score" style={[styles.score, { color: colors.text }]}>
          {t('score')}: {score}
        </Text>
        <View style={styles.statsRow}>
          <Text testID="results-mistakes" style={[styles.stat, { color: colors.text }]}>
            {t('mistakes')}: {mistakes}
          </Text>
          <Text testID="results-hints" style={[styles.stat, { color: colors.text }]}>
            {t('hint')}: {hintsUsed}
          </Text>
        </View>

        <Button label={t('next')} onPress={handleNext} style={styles.nextButton} />
      </View>
    </View>
  );
}

export default Results;

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000066',
    paddingHorizontal: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 2,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  title: { ...typography.title },
  starRow: { flexDirection: 'row', gap: 6, marginVertical: 4 },
  star: { fontSize: 40, lineHeight: 46 },
  score: { ...typography.heading },
  statsRow: { flexDirection: 'row', gap: 20 },
  stat: { ...typography.body },
  nextButton: { marginTop: 8, alignSelf: 'stretch' },
});
