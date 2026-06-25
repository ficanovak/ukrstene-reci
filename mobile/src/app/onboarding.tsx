/**
 * Onboarding / first-launch language selection (Task 4.5).
 *
 * Shown when no UI language has been persisted yet (see `_layout.tsx` gating).
 * Lists the 5 supported languages; tapping one persists it (store → i18n via
 * the layout effect) and routes home. Picking Serbian also reveals a simple
 * script toggle (Cyrillic / Latin) since `sr` is the only script-relevant
 * language. Placeholder polish; real onboarding flow comes later.
 */
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';
import { useSettings } from '@/store/settings';
import { typography, useTheme } from '@/theme';

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const language = useSettings((s) => s.language);
  const script = useSettings((s) => s.script);
  const setLanguage = useSettings((s) => s.setLanguage);
  const setScript = useSettings((s) => s.setScript);

  const choose = (code: LanguageCode) => {
    setLanguage(code);
  };

  const confirm = () => {
    // Default to Serbian if the user somehow taps confirm without choosing.
    if (!language) setLanguage('sr');
    router.replace('/');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('selectLanguage')}
        </Text>

        <View style={styles.list}>
          {SUPPORTED_LANGUAGES.map((code) => {
            const selected = language === code;
            return (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => choose(code)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: selected ? colors.primary : colors.clueCell,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rowLabel,
                    { color: selected ? colors.background : colors.text },
                  ]}
                >
                  {t(`lang.${code}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {language === 'sr' && (
          <View style={styles.scriptBlock}>
            <Text style={[styles.scriptTitle, { color: colors.text }]}>
              {t('script')}
            </Text>
            <View style={styles.scriptRow}>
              {(['cyrillic', 'latin'] as const).map((s) => {
                const selected = script === s;
                return (
                  <Pressable
                    key={s}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setScript(s)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: colors.primary,
                        backgroundColor: selected ? colors.primary : 'transparent',
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: selected ? colors.background : colors.primary },
                      ]}
                    >
                      {t(`script.${s}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Button label={t('continue')} onPress={confirm} disabled={!language} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 24, gap: 20, flexGrow: 1, justifyContent: 'center' },
  title: { ...typography.title, textAlign: 'center' },
  list: { gap: 12 },
  row: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  rowLabel: { ...typography.label },
  scriptBlock: { gap: 10 },
  scriptTitle: { ...typography.heading },
  scriptRow: { flexDirection: 'row', gap: 12 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 2,
  },
  chipLabel: { ...typography.label },
});
