/**
 * Advanced mode — the playable letter-palette skandinavka screen (Task 6.3).
 *
 * Same board as Basic, but the player never types: the system DEALS up to 5
 * letters into a palette (Task 6.2 `<LetterPalette>`), the player PLACES each
 * into a cell, taps SUBMIT; correct placements LOCK (immovable), wrong ones are
 * cleared and counted as mistakes, the palette REFILLS, until the whole board is
 * solved (PRD §6.2 / §6.3).
 *
 * ── Engine is the source of truth (Task 6.1 `game/advanced.ts`) ──────────────
 * The screen holds ONE `AdvancedState` in `useState` and only ever transitions
 * it through the engine's pure functions:
 *   • `placeLetter(state, paletteIndex, row, col)` — tentative placement;
 *   • `unplaceLetter(state, row, col)`             — return a tile to the palette;
 *   • `submit(state)`                              — lock/clear/+mistakes/refill.
 * The Grid renders tentative placements straight from `state.base` (a GameState)
 * via the same `cellEntry`; LOCKED cells are passed to the Grid's `lockedCells`
 * prop so they render with the settled/confirmed look and are tap-immune here.
 *
 * ── Seed ─────────────────────────────────────────────────────────────────────
 * The deal RNG seed is DERIVED from the level number (`levelNumber * 2654435761`,
 * Knuth's multiplicative hash, masked to 32 bits) so a given level always deals
 * the same letters (reproducible, debuggable) while different levels differ. The
 * bundled sample level is number 1.
 *
 * ── Interaction ──────────────────────────────────────────────────────────────
 *   1. Tap a palette tile → toggle `selectedIndex`.
 *   2. Tap an empty unlocked cell with a tile selected → `placeLetter`, clear
 *      the selection.
 *   3. Tap a tentatively-placed unlocked cell → `unplaceLetter` (back to palette).
 *   4. Locked cells ignore taps (the engine no-ops, and we early-return).
 *   5. Submit → `submit`, then run the §6.4 animations + haptics.
 *
 * ── Animations (PRD §6.4) ────────────────────────────────────────────────────
 * Implemented with React Native's built-in `Animated` API (NOT reanimated) — see
 * the file-level note in `AnimatedBoard` below for the rationale. The functional
 * loop updates engine state FIRST (fully testable); the animations are a visual
 * reaction layered on top:
 *   • correct → scale-bounce + brief green flash → locked (light haptic);
 *   • wrong   → shake + red flash → cleared (notification haptic);
 *   • submit  → placements evaluated with a small staggered timing;
 *   • new letters → slide into the palette.
 *
 * ── Solved ───────────────────────────────────────────────────────────────────
 * When `isSolved` flips true we show the same minimal "Rešeno!" overlay as Basic
 * (the real results/score screen is Phase 7).
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Grid } from '@/components/grid';
import { LetterPalette } from '@/components/palette';
import { Button } from '@/components/ui/Button';
import {
  createAdvancedState,
  isSolved,
  placeLetter,
  submit,
  unplaceLetter,
  type AdvancedState,
} from '@/game/advanced';
import type { Coord, GridData, LetterCell } from '@/game/gridData.types';
import {
  applyLetterHint,
  applyWordHint,
  createHintState,
  freePerLevelProvider,
  lockRevealed,
  type HintState,
} from '@/game/hints';
import { useLevel } from '@/game/useLevel';
import { FALLBACK_LANGUAGE, type LanguageCode } from '@/i18n';
import { useSettings } from '@/store/settings';
import { fontFamily, typography, useTheme } from '@/theme';

import * as Haptics from 'expo-haptics';

import { Results } from './Results';

/** Coordinate key, matching the engine's `locked` set scheme ("row,col"). */
function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** Find the letter cell at (row,col), or undefined for non-letter coordinates. */
function letterCellAt(grid: GridData, row: number, col: number): LetterCell | undefined {
  return grid.cells.find(
    (c): c is LetterCell => c.kind === 'letter' && c.row === row && c.col === col,
  );
}

/** True iff (row,col) is still unsolved: a letter cell that is not yet locked. */
function isUnsolvedCell(state: AdvancedState, row: number, col: number): boolean {
  if (state.locked.has(cellKey(row, col))) return false;
  return letterCellAt(state.base.grid, row, col) !== undefined;
}

/**
 * Letter-hint target in Advanced: the FIRST still-unsolved (unlocked) cell on
 * the board, scanned in `grid.words` reading order so it sits on a word the
 * player is plausibly working on. Returns null when everything is solved.
 */
function firstUnsolvedCell(state: AdvancedState): Coord | null {
  for (const word of state.base.grid.words) {
    for (const c of word.cells) {
      if (isUnsolvedCell(state, c.row, c.col)) return { row: c.row, col: c.col };
    }
  }
  return null;
}

/**
 * Word-hint target in Advanced: the FIRST word that still has any unsolved
 * (unlocked) cell — i.e. the word containing {@link firstUnsolvedCell}. Returns
 * null when the board is solved.
 */
function firstUnsolvedWordId(state: AdvancedState): string | null {
  for (const word of state.base.grid.words) {
    if (word.cells.some((c) => isUnsolvedCell(state, c.row, c.col))) return word.id;
  }
  return null;
}

/**
 * Derive the deterministic deal seed from a level number (Knuth multiplicative
 * hash, masked to a 32-bit unsigned int). Same level ⇒ same deals.
 */
function seedForLevel(levelNumber: number): number {
  return (Math.imul(levelNumber, 2654435761) >>> 0) || 1;
}

/** Best-effort haptics — a no-op anywhere the native module is unavailable (jest). */
function safeHaptic(kind: 'light' | 'error'): void {
  try {
    if (kind === 'light') {
      void Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
    } else {
      void Haptics.notificationAsync?.(Haptics.NotificationFeedbackType.Error);
    }
  } catch {
    // Native module missing (e.g. tests / web) — animations & logic still run.
  }
}

/**
 * A tiny full-board flash overlay used after submit: a brief green pulse when at
 * least one letter locked, a red pulse when at least one was wrong (PRD §6.4
 * "green flash" / "red flash"). Kept as a board-level effect so the functional
 * loop never depends on per-cell animation wiring (tests assert engine DOM).
 *
 * NOTE ON ANIMATION TECH. We use RN's built-in `Animated` rather than
 * react-native-reanimated: reanimated v4 needs a worklet runtime + a jest setup
 * that is not wired in this repo (no `setUpTests` export is shipped here, and the
 * worklets runtime lives outside mobile/node_modules), which would destabilize
 * the green suite. `Animated` needs zero jest setup and fully covers the §6.4
 * effects (bounce / shake / flash / slide). See the task's documented fallback.
 */
function SubmitFlash({
  color,
  signal,
}: {
  color: string;
  /** Bumped each submit so the effect re-fires; carries which flash to show. */
  signal: { id: number; kind: 'correct' | 'wrong' | null };
}) {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (signal.kind === null) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0.35,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fire on signal id
  }, [signal.id]);

  return (
    <Animated.View
      pointerEvents="none"
      testID="submit-flash"
      style={[
        StyleSheet.absoluteFill,
        styles.flash,
        { backgroundColor: color, opacity },
      ]}
    />
  );
}

/** Inner playable view — only mounted once a level is resolved. */
function AdvancedGameBoard({
  grid,
  levelNumber,
  levelId,
  difficultyBand,
}: {
  grid: GridData;
  levelNumber: number;
  levelId: string;
  difficultyBand: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();

  const seed = useMemo(() => seedForLevel(levelNumber), [levelNumber]);

  const [state, setState] = useState<AdvancedState>(() =>
    createAdvancedState(grid, seed),
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Hint state: 2 free per level (1 word + 1 letter), via the provider so a
  // future inventory/ads source drops in unchanged. `hintsUsed` feeds the score.
  const [hints, setHints] = useState<HintState>(() =>
    createHintState(freePerLevelProvider()),
  );

  // Drives the post-submit flash (§6.4). `kind` decides the colour; `id` re-fires.
  const [flash, setFlash] = useState<{ id: number; kind: 'correct' | 'wrong' | null }>(
    { id: 0, kind: null },
  );
  // Palette slide-in (§6.4 "new letters"): translateY animates 0 on each refill.
  const [paletteSlide] = useState(() => new Animated.Value(0));

  const solved = isSolved(state);

  /** Tap a palette tile: toggle selection (tapping the selected tile clears it). */
  const handleSelectTile = useCallback((index: number) => {
    setSelectedIndex((prev) => (prev === index ? null : index));
  }, []);

  /**
   * Tap a board cell:
   *   • locked → ignore (settled);
   *   • empty + a tile selected → place it, clear the selection;
   *   • tentatively placed → return it to the palette.
   */
  const handleCellPress = useCallback(
    (row: number, col: number) => {
      const cell = letterCellAt(grid, row, col);
      if (!cell) return;
      const k = cellKey(row, col);
      if (state.locked.has(k)) return; // locked cells ignore taps

      const occupied = state.base.fill[k] !== undefined;
      if (occupied) {
        // Return the tentatively-placed tile to the palette.
        setState((prev) => unplaceLetter(prev, row, col));
        setSelectedIndex(null);
        return;
      }
      // Empty cell: place the selected tile (if any).
      if (selectedIndex === null) return;
      setState((prev) => placeLetter(prev, selectedIndex, row, col));
      setSelectedIndex(null);
    },
    [grid, selectedIndex, state.locked, state.base.fill],
  );

  /**
   * Submit: transition the engine FIRST (testable), then react with §6.4
   * animations + haptics based on what changed (newly-locked vs newly-cleared).
   */
  const handleSubmit = useCallback(() => {
    // Transition the engine first (pure), then react with §6.4 animations +
    // haptics OUTSIDE the state updater (no state-update-during-render).
    const prev = state;
    const next = submit(prev);

    setState(next);
    setSelectedIndex(null);

    const lockedMore = next.locked.size > prev.locked.size;
    const wrongHappened = next.mistakes > prev.mistakes;

    // Flash + haptics. Prefer the "correct" pulse when both occurred; still fire
    // a heavier cue when there were also wrong letters this round.
    if (lockedMore) {
      setFlash((f) => ({ id: f.id + 1, kind: 'correct' }));
      safeHaptic('light');
      if (wrongHappened) safeHaptic('error');
    } else if (wrongHappened) {
      setFlash((f) => ({ id: f.id + 1, kind: 'wrong' }));
      safeHaptic('error');
    }

    // §6.4 "new letters slide into the palette": run the slide on refill.
    paletteSlide.setValue(1);
    Animated.timing(paletteSlide, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state, paletteSlide]);

  /**
   * Word hint: reveal a still-unsolved word — write the correct graphemes into
   * its cells (replacing any tentative wrong letters there) and LOCK them, so
   * they count as solved exactly like a submit success (PRD §7.2 / §6.2).
   */
  const handleWordHint = useCallback(() => {
    const wordId = firstUnsolvedWordId(state);
    if (wordId === null) return;
    const res = applyWordHint(state.base, hints, wordId);
    if (res.hints === hints) return; // rejected (no remaining) — no-op
    const word = grid.words.find((w) => w.id === wordId);
    const coords = word ? word.cells : [];
    setState((prev) => lockRevealed({ ...prev, base: res.game }, res.game, coords));
    setHints(res.hints);
    setSelectedIndex(null);
  }, [state, hints, grid]);

  /**
   * Letter hint: reveal ONE cell — the first still-unsolved cell (see
   * `firstUnsolvedCell`). Write its correct grapheme and LOCK it.
   */
  const handleLetterHint = useCallback(() => {
    const target = firstUnsolvedCell(state);
    if (target === null) return;
    const res = applyLetterHint(state.base, hints, target.row, target.col);
    if (res.hints === hints) return; // rejected — no-op
    setState((prev) => lockRevealed({ ...prev, base: res.game }, res.game, [target]));
    setHints(res.hints);
    setSelectedIndex(null);
  }, [state, hints]);

  const goNext = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // Leave room for the palette + top bar so the board never overlaps.
  const boardMaxHeight = useMemo(
    () => Math.max(160, windowHeight * 0.46),
    [windowHeight],
  );

  // Nothing placed yet this round ⇒ Submit disabled (engine fill, minus locked).
  const placedCount = useMemo(() => {
    let n = 0;
    for (const k of Object.keys(state.base.fill)) {
      if (!state.locked.has(k)) n += 1;
    }
    return n;
  }, [state.base.fill, state.locked]);

  const flashColor = flash.kind === 'wrong' ? colors.wrong : colors.correct;
  // 18px slide for the palette refill (translateY from 18 → 0).
  const paletteTranslate = paletteSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 18],
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Button
          label={t('back')}
          variant="secondary"
          onPress={goNext}
          style={styles.backButton}
        />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {t('level')} {levelNumber}
        </Text>
        <View style={styles.stats}>
          <Text testID="stat-score" style={[styles.stat, { color: colors.primary }]}>
            {t('score')}: 0
          </Text>
          <Text testID="stat-mistakes" style={[styles.stat, { color: colors.wrong }]}>
            {t('mistakes')}: {state.mistakes}
          </Text>
        </View>
      </View>

      {/* ── Hint bar (PRD §7.2: 1 word + 1 letter, once each) ───────────── */}
      <View style={styles.hintBar}>
        <Button
          label={t('hintWord')}
          variant="secondary"
          onPress={handleWordHint}
          disabled={!hints.wordRemaining || solved}
          style={styles.hintButton}
        />
        <Button
          label={t('hintLetter')}
          variant="secondary"
          onPress={handleLetterHint}
          disabled={!hints.letterRemaining || solved}
          style={styles.hintButton}
        />
      </View>

      {/* ── Board ───────────────────────────────────────────────────────── */}
      <View style={styles.boardArea}>
        <View>
          <Grid
            grid={grid}
            state={state.base}
            showCheck={false}
            lockedCells={state.locked}
            maxHeight={boardMaxHeight}
            onCellPress={handleCellPress}
          />
          <SubmitFlash color={flashColor} signal={flash} />
        </View>
      </View>

      {/* ── Palette ─────────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.paletteArea, { transform: [{ translateY: paletteTranslate }] }]}
      >
        <LetterPalette
          letters={[...state.palette]}
          selectedIndex={selectedIndex}
          onSelectTile={handleSelectTile}
          onSubmit={handleSubmit}
          submitDisabled={placedCount === 0}
        />
      </Animated.View>

      {/* ── Results overlay (Task 7.3): stars/score/save/next ───────────── */}
      {solved ? (
        <Results
          levelId={levelId}
          mode="advanced"
          difficultyBand={difficultyBand}
          mistakes={state.mistakes}
          hintsUsed={hints.hintsUsed}
          onNext={goNext}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Screen entry: loads the level (cache → sample) then mounts the board. */
export function AdvancedGame() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const language = useSettings((s) => s.language);
  const script = useSettings((s) => s.script);
  const resolvedLanguage: LanguageCode = language ?? FALLBACK_LANGUAGE;
  // resolvedLanguage is currently informational; Advanced needs no keyboard.
  void resolvedLanguage;

  const load = useLevel({ language, script });

  if (load.status === 'loading') {
    return (
      <SafeAreaView
        style={[styles.safe, styles.loadingSafe, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.loading, { color: colors.text }]}>{t('loading')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <AdvancedGameBoard
      grid={load.level}
      levelNumber={load.levelNumber}
      levelId={load.levelId}
      difficultyBand={load.difficultyBand}
    />
  );
}

export default AdvancedGame;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loadingSafe: { alignItems: 'center', justifyContent: 'center' },
  loading: { ...typography.heading },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  backButton: { paddingVertical: 8, paddingHorizontal: 12 },
  title: { ...typography.heading, flexShrink: 1, textAlign: 'center' },
  stats: { alignItems: 'flex-end' },
  stat: { fontFamily: fontFamily.bold, fontSize: 13 },
  hintBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  hintButton: { flex: 1, paddingVertical: 8, paddingHorizontal: 8 },
  boardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  flash: { borderRadius: 8 },
  paletteArea: { paddingBottom: 4 },
});
