/**
 * Game screen route (`game/[mode]`).
 *
 * Branches on the `mode` route param:
 *   • `basic`    → the playable Basic mode screen (Task 5.4, `<BasicGame/>`).
 *   • `advanced` → still the themed "coming soon" placeholder (Phase 6).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { BasicGame } from '@/screens/BasicGame';
import { typography, useTheme } from '@/theme';

export default function GameScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode: string }>();

  // Basic mode is playable now; Advanced stays a placeholder until Phase 6.
  if (mode !== 'advanced') {
    return <BasicGame />;
  }

  const modeKey = 'mode.advanced';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.center}>
          <Text style={[styles.mode, { color: colors.primary }]}>
            {t(modeKey)}
          </Text>
          <Text style={[styles.soon, { color: colors.text }]}>
            {t('comingSoon')}
          </Text>
        </View>
        <Button
          label={t('back')}
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, padding: 24, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  mode: { ...typography.title },
  soon: { ...typography.heading },
});
