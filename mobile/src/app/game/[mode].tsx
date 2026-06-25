/**
 * Game screen placeholder (Task 4.5).
 *
 * Reads the `mode` route param (`basic` | `advanced`) and shows a themed
 * "coming soon" placeholder plus a back action. Real gameplay (grid, palette,
 * scoring) is Phase 5/6.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { typography, useTheme } from '@/theme';

export default function GameScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode: string }>();

  const modeKey = mode === 'advanced' ? 'mode.advanced' : 'mode.basic';

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
