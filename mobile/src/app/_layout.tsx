/**
 * App root layout (Task 4.5).
 *
 * Wires the three foundation pieces together and gates first paint:
 *
 *  1. i18n — imported for its init side effect (configures i18next) and kept in
 *     sync with the persisted `language` setting.
 *  2. Theme — the whole tree is wrapped in `<ThemeProvider>`, whose `mode` is
 *     slaved to the persisted `themeMode` setting.
 *  3. Fonts — `useAppFonts()` loads Nunito; we hold the native splash screen
 *     until fonts AND the persisted settings have loaded, so there's no flash
 *     of fallback fonts or a wrong first route.
 *
 * Routing: once ready, if no `language` is persisted we send the user to
 * `/onboarding`; otherwise we land on `/` (home). The Stack declares every
 * route so Expo Router knows the navigator shape.
 */
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import '@/i18n';
import { setLanguage as applyI18nLanguage } from '@/i18n';
import { useSettings } from '@/store/settings';
import { ThemeProvider, useAppFonts, useTheme } from '@/theme';

// Keep the native splash up until we explicitly hide it (after the gate).
void SplashScreen.preventAutoHideAsync();

/**
 * Inner component: it runs INSIDE the ThemeProvider so it can drive the
 * navigator's status-bar/background via the active theme, and it performs the
 * first-launch routing once everything is hydrated.
 */
function RootNavigator() {
  const { colors } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  const [fontsLoaded, fontError] = useAppFonts();
  const hydrated = useSettings((s) => s.hydrated);
  const language = useSettings((s) => s.language);

  const ready = (fontsLoaded || fontError != null) && hydrated;

  // Apply the persisted UI language to i18n whenever it changes (incl. on the
  // first hydration). The store is the source of truth; i18n mirrors it.
  useEffect(() => {
    if (hydrated && language) {
      void applyI18nLanguage(language);
    }
  }, [hydrated, language]);

  // Hide the splash + perform first-launch routing once ready.
  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync();

    const onboarding = segments[0] === 'onboarding';
    if (!language && !onboarding) {
      router.replace('/onboarding');
    }
  }, [ready, language, segments, router]);

  // Hold first paint until fonts + settings are ready (splash stays visible).
  if (!ready) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="game/[mode]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

export default function RootLayout() {
  // ThemeProvider's mode follows the persisted setting (source of truth).
  const themeMode = useSettings((s) => s.themeMode);
  return (
    <ThemeProvider initialMode={themeMode} key={themeMode}>
      <RootNavigator />
    </ThemeProvider>
  );
}
