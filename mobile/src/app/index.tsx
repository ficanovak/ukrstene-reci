/**
 * Home screen (Task 4.5).
 *
 * The app's main hub: title, the two game modes (Basic / Advanced → routes to
 * `game/[mode]`), a Continue affordance, and a Settings entry. Placeholder
 * styling that respects the active theme + language. Real gameplay arrives in
 * later phases.
 */
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { typography, useTheme } from '@/theme';

export default function HomeScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>
            {t('appTitle')}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            label={t('mode.basic')}
            onPress={() => router.push('/game/basic')}
          />
          <Button
            label={t('mode.advanced')}
            onPress={() => router.push('/game/advanced')}
          />
          <Button
            label={t('continue')}
            variant="secondary"
            onPress={() => router.push('/game/basic')}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.settings, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.settingsLabel, { color: colors.text }]}>
            {t('settings')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, padding: 24, justifyContent: 'space-between' },
  header: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title, fontSize: 34, lineHeight: 40, textAlign: 'center' },
  actions: { gap: 14 },
  settings: { alignItems: 'center', paddingVertical: 16, marginTop: 16 },
  settingsLabel: { ...typography.label },
});
