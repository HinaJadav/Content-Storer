import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppFonts } from './src/theme/fonts';
import { ThemeProvider, useTheme, type ThemeMode } from './src/theme/ThemeProvider';
import { radius, size, space, type } from './src/theme/tokens';

// Step 1: a temporary "token preview" screen to check the theme, fonts and
// light/dark switching work. It is replaced by the real Home screen later.

const MODES: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

function TokenPreview() {
  const { colors, isDark, mode, setMode } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.title, { color: colors.text }]}>Content Storer</Text>

        <Text style={[type.section, styles.sectionLabel, { color: colors.text3 }]}>THEME</Text>
        <View
          accessibilityRole="radiogroup"
          style={[styles.segments, { backgroundColor: colors.surface2 }]}
        >
          {MODES.map((m) => {
            const selected = m.mode === mode;
            return (
              <Pressable
                key={m.mode}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setMode(m.mode)}
                style={[styles.segment, selected && { backgroundColor: colors.surface }]}
              >
                <Text style={[type.button, { color: selected ? colors.text : colors.text2 }]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[type.section, styles.sectionLabel, { color: colors.text3 }]}>PINNED</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Text style={[type.key, { color: colors.text }]}>upi</Text>
            <Text style={[type.value, styles.rowValue, { color: colors.text2 }]} numberOfLines={1}>
              name@okicici
            </Text>
          </View>
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[type.key, { color: colors.text }]}>home-address</Text>
            <Text style={[type.value, styles.rowValue, { color: colors.text2 }]} numberOfLines={1}>
              B-204, Shanti Residency, Law Garden Road
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
        >
          <Text style={[type.button, { color: colors.onAccent }]}>Save</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default function App() {
  const fontsLoaded = useAppFonts();
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <TokenPreview />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, paddingTop: 64, gap: space.sm },
  sectionLabel: { marginTop: space.lg, paddingHorizontal: space.sm },
  segments: { flexDirection: 'row', padding: space.xs, gap: space.xs, borderRadius: radius.button },
  segment: {
    flex: 1,
    height: 44,
    borderRadius: radius.row,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderWidth: 1, borderRadius: radius.fab, overflow: 'hidden' },
  row: {
    height: size.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  rowValue: { flex: 1, textAlign: 'right' },
  primaryButton: {
    marginTop: space.xl,
    height: size.buttonPrimary,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
