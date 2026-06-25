/**
 * Basic mode — the playable skandinavka screen (Task 5.4).
 *
 * Composes the three Phase-5 pieces into a working game:
 *   • the engine (Task 5.1) holds the authoritative `GameState`;
 *   • the `<Grid>` (Task 5.2) renders the board from that state;
 *   • the `<Keyboard>` (Task 5.3) emits graphemes into the engine.
 *
 * THE ENGINE IS THE SOURCE OF TRUTH. The screen keeps ONE `GameState` in
 * `useState` and only ever transitions it through the engine's pure functions
 * (`setActiveWord` / `setLetter` / `clearLetter` / `moveCursor`). The Grid and
 * the stats are pure projections of that state — there is no duplicated game
 * data on the screen.
 *
 * ── Tap → activate (with direction toggle on intersections) ─────────────────
 * Tapping a letter cell selects a word that contains it and parks the cursor on
 * the tapped cell. The TOGGLE RULE for a cell that belongs to BOTH an across and
 * a down word:
 *   • first tap selects the cell's ACROSS word (a stable default);
 *   • tapping the SAME cell again, while that word is already active, switches to
 *     the cell's OTHER (down) word — and toggles back on the next tap;
 *   • tapping a DIFFERENT cell selects a word containing it (across preferred),
 *     starting fresh.
 * A cell on only one word always selects that word. The cursor is then moved to
 * the tapped cell's index within the active word (so typing continues from where
 * the player tapped, not from the word's start).
 *
 * ── Keyboard ────────────────────────────────────────────────────────────────
 * A letter key calls `setLetter(grapheme)` (writes at the cursor, advances).
 * Backspace calls `clearLetter()` then steps the cursor back one cell, which is
 * the conventional "erase + move left" feel.
 *
 * ── Auto-check ──────────────────────────────────────────────────────────────
 * `checkMode` (settings) drives `showCheck`: in `'auto'` the Grid surfaces
 * correct/wrong colouring and the top bar shows the engine's live mistake count;
 * in `'none'` correctness is hidden during play (mistakes are still tracked by
 * the engine but not surfaced here).
 *
 * ── Solved ──────────────────────────────────────────────────────────────────
 * After every state change we check `isSolved`; when it flips true we show a
 * minimal themed "Rešeno!" overlay with the mistake count and a "Sledeće"
 * button. The real results/stars/score screen is Task 7.3 — this is just the
 * solved-detection + a celebratory placeholder; "Sledeće" returns home.
 */
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Grid } from '@/components/grid';
import { Keyboard, type Script } from '@/components/keyboard';
import { Button } from '@/components/ui/Button';
import {
  clearLetter,
  createGameState,
  isSolved,
  moveCursor,
  setActiveWord,
  setLetter,
  type GameState,
} from '@/game/engine';
import type { GridData, LetterCell } from '@/game/gridData.types';
import { useLevel } from '@/game/useLevel';
import { FALLBACK_LANGUAGE, type LanguageCode } from '@/i18n';
import { useSettings, type ScriptChoice } from '@/store/settings';
import { fontFamily, typography, useTheme } from '@/theme';

/** Map the settings `ScriptChoice` onto the keyboard's `Script` ('lat'|'cyr'). */
function keyboardScript(script: ScriptChoice): Script {
  return script === 'cyrillic' ? 'cyr' : 'lat';
}

/** Find the letter cell at (row,col), or undefined for non-letter coordinates. */
function letterCellAt(grid: GridData, row: number, col: number): LetterCell | undefined {
  return grid.cells.find(
    (c): c is LetterCell => c.kind === 'letter' && c.row === row && c.col === col,
  );
}

/** Inner playable view — only mounted once a level is resolved. */
function BasicGameBoard({
  grid,
  levelNumber,
  language,
  script,
}: {
  grid: GridData;
  levelNumber: number;
  language: LanguageCode;
  script: ScriptChoice;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();

  const checkMode = useSettings((s) => s.checkMode);
  const showCheck = checkMode === 'auto';

  const [state, setState] = useState<GameState>(() => createGameState(grid));
  const solved = isSolved(state);

  /**
   * Tap a letter cell: select a word for it and park the cursor on the cell.
   * Implements the across-preferred default + same-cell direction toggle.
   */
  const handleCellPress = useCallback(
    (row: number, col: number) => {
      const cell = letterCellAt(grid, row, col);
      if (!cell || cell.words.length === 0) return;

      setState((prev) => {
        // Order this cell's memberships across-first for a stable default.
        const refs = [...cell.words].sort((a, b) => {
          const wa = grid.words.find((w) => w.id === a.wordId);
          const wb = grid.words.find((w) => w.id === b.wordId);
          const da = wa?.dir === 'across' ? 0 : 1;
          const db = wb?.dir === 'across' ? 0 : 1;
          return da - db;
        });

        // Toggle: if the currently active word is one of this cell's words and
        // there is another, switch to the next; otherwise take the first.
        let target = refs[0]!.wordId;
        if (refs.length > 1) {
          const activeIdx = refs.findIndex((r) => r.wordId === prev.activeWordId);
          if (activeIdx >= 0) {
            target = refs[(activeIdx + 1) % refs.length]!.wordId;
          }
        }

        // Select the word (cursor → 0), then move the cursor to this cell's
        // index within that word so typing continues from the tap.
        const ref = cell.words.find((r) => r.wordId === target);
        const next = setActiveWord(prev, target);
        return ref ? moveCursor(next, ref.index) : next;
      });
    },
    [grid],
  );

  const handleKeyPress = useCallback((grapheme: string) => {
    setState((prev) => setLetter(prev, grapheme));
  }, []);

  const handleBackspace = useCallback(() => {
    // Erase at the cursor, then step the cursor back one cell.
    setState((prev) => moveCursor(clearLetter(prev), { delta: -1 }));
  }, []);

  const goNext = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // Leave generous room for the keyboard + top bar so the board never overlaps.
  const boardMaxHeight = useMemo(
    () => Math.max(160, windowHeight * 0.5),
    [windowHeight],
  );

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
          {showCheck ? (
            <Text testID="stat-mistakes" style={[styles.stat, { color: colors.wrong }]}>
              {t('mistakes')}: {state.mistakes}
            </Text>
          ) : null}
        </View>
      </View>

      {/* ── Board ───────────────────────────────────────────────────────── */}
      <View style={styles.boardArea}>
        <Grid
          grid={grid}
          state={state}
          showCheck={showCheck}
          maxHeight={boardMaxHeight}
          onCellPress={handleCellPress}
        />
      </View>

      {/* ── Keyboard ────────────────────────────────────────────────────── */}
      <View style={styles.keyboardArea}>
        <Keyboard
          language={language}
          script={keyboardScript(script)}
          onKeyPress={handleKeyPress}
          onBackspace={handleBackspace}
        />
      </View>

      {/* ── Solved overlay ──────────────────────────────────────────────── */}
      {solved ? (
        <View testID="solved-overlay" style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: colors.background, borderColor: colors.primary }]}>
            <Text style={[styles.solvedTitle, { color: colors.primary }]}>
              {t('solved')}
            </Text>
            <Text style={[styles.solvedStat, { color: colors.text }]}>
              {t('mistakes')}: {state.mistakes}
            </Text>
            <Button label={t('next')} onPress={goNext} style={styles.nextButton} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/** Screen entry: loads the level (cache → sample) then mounts the board. */
export function BasicGame() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const language = useSettings((s) => s.language);
  const script = useSettings((s) => s.script);
  const resolvedLanguage: LanguageCode = language ?? FALLBACK_LANGUAGE;

  const load = useLevel({ language, script });

  if (load.status === 'loading') {
    return (
      <SafeAreaView style={[styles.safe, styles.loadingSafe, { backgroundColor: colors.background }]}>
        <Text style={[styles.loading, { color: colors.text }]}>{t('loading')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <BasicGameBoard
      grid={load.level}
      levelNumber={load.levelNumber}
      language={resolvedLanguage}
      script={script}
    />
  );
}

export default BasicGame;

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
  boardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  keyboardArea: { paddingBottom: 4 },
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
  solvedTitle: { ...typography.title },
  solvedStat: { ...typography.heading },
  nextButton: { marginTop: 8, alignSelf: 'stretch' },
});
