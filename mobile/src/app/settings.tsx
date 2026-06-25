/**
 * Settings screen (Task 4.5).
 *
 * Theme toggle (light / dark / system) and language switch are wired for real:
 * both write to the persisted `useSettings` store, which is the single source
 * of truth — the root layout slaves the ThemeProvider's mode and i18n's
 * language to it. Script gets a working toggle too. Check-mode and account are
 * left as visible placeholders for later phases.
 */
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useSettings } from '@/store/settings';
import { typography, useTheme, type ThemeMode } from '@/theme';

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];
const SCRIPTS = ['cyrillic', 'latin'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: colors.primary,
          backgroundColor: selected ? colors.primary : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.chipLabel, { color: selected ? colors.background : colors.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const themeMode = useSettings((s) => s.themeMode);
  const language = useSettings((s) => s.language);
  const script = useSettings((s) => s.script);
  const setThemeMode = useSettings((s) => s.setThemeMode);
  const setLanguage = useSettings((s) => s.setLanguage);
  const setScript = useSettings((s) => s.setScript);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>{t('settings')}</Text>

        <Section title={t('theme')}>
          <View style={styles.row}>
            {THEME_MODES.map((m) => (
              <Chip
                key={m}
                label={t(m)}
                selected={themeMode === m}
                onPress={() => setThemeMode(m)}
              />
            ))}
          </View>
        </Section>

        <Section title={t('language')}>
          <View style={styles.row}>
            {SUPPORTED_LANGUAGES.map((code) => (
              <Chip
                key={code}
                label={t(`lang.${code}`)}
                selected={language === code}
                onPress={() => setLanguage(code)}
              />
            ))}
          </View>
        </Section>

        <Section title={t('script')}>
          <View style={styles.row}>
            {SCRIPTS.map((s) => (
              <Chip
                key={s}
                label={t(`script.${s}`)}
                selected={script === s}
                onPress={() => setScript(s)}
              />
            ))}
          </View>
        </Section>

        <Section title={t('checkMode')}>
          <Text style={[styles.placeholder, { color: colors.text }]}>{t('comingSoon')}</Text>
        </Section>

        <Section title={t('account')}>
          <Text style={[styles.placeholder, { color: colors.text }]}>{t('comingSoon')}</Text>
        </Section>

        <Button
          label={t('back')}
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 24, gap: 24 },
  title: { ...typography.title },
  section: { gap: 10 },
  sectionTitle: { ...typography.heading },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
  },
  chipLabel: { ...typography.label },
  placeholder: { ...typography.body, opacity: 0.7 },
});
