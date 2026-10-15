// Design tokens copied from the "Component sheet & tokens" artboard of the
// Content Storer design. Every screen reads colours, radii, spacing and type
// from here — never hard-code a hex value in a component.

export type ColorTokens = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
  dangerSoft: string;
  onDanger: string;
  snack: string;
  onSnack: string;
  snackAction: string;
  kb: string;
  kbKey: string;
  scrim: string;
};

export const light: ColorTokens = {
  bg: '#F6F6F7',
  surface: '#FFFFFF',
  surface2: '#EFEFF1',
  border: '#E3E3E7',
  text: '#16161B',
  text2: '#55555F',
  text3: '#6E6E78',
  accent: '#5550C8',
  accentSoft: '#ECEBFB',
  onAccent: '#FFFFFF',
  danger: '#C0322E',
  dangerSoft: '#FBE9E8',
  onDanger: '#FFFFFF',
  snack: '#1D1D23',
  onSnack: '#F3F3F5',
  snackAction: '#B9B6FF',
  kb: '#E6E6EA',
  kbKey: '#FFFFFF',
  scrim: 'rgba(10,10,14,0.45)',
};

export const dark: ColorTokens = {
  bg: '#0D0D10',
  surface: '#16161A',
  surface2: '#1F1F24',
  border: '#2A2A31',
  text: '#EDEDF0',
  text2: '#A6A6B0',
  text3: '#8C8C96',
  accent: '#8E8AF5',
  accentSoft: '#25244A',
  onAccent: '#0D0D14',
  danger: '#F0736C',
  dangerSoft: '#3A1C1C',
  onDanger: '#1A0707',
  snack: '#ECECF0',
  onSnack: '#16161B',
  snackAction: '#4A45BF',
  kb: '#141418',
  kbKey: '#222228',
  scrim: 'rgba(0,0,0,0.6)',
};

// Corner radii, named by the component that uses them.
export const radius = {
  chip: 8,
  row: 10,
  field: 12,
  button: 14,
  fab: 16,
  tile: 20,
  dialog: 24,
  sheet: 28,
} as const;

// 4-pt grid. Screen gutter 16, card inset 12.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Fixed heights from the component sheet.
export const size = {
  touch: 48, // minimum touch target
  row: 64, // list row
  input: 52,
  buttonPrimary: 52,
  button: 48,
  fab: 56,
  snackbar: 52,
} as const;

// On Android each weight is its own font family, so we pick the family name
// instead of setting fontWeight. The names match the keys loaded in fonts.ts.
export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  monoMedium: 'GeistMono_500Medium',
  monoSemibold: 'GeistMono_600SemiBold',
} as const;

export const type = {
  title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  key: { fontFamily: fonts.monoSemibold, fontSize: 15, lineHeight: 20 },
  keySm: { fontFamily: fonts.monoSemibold, fontSize: 13, lineHeight: 18 },
  value: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  input: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  keyInput: { fontFamily: fonts.monoMedium, fontSize: 16, lineHeight: 22 },
  button: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  section: { fontFamily: fonts.monoMedium, fontSize: 11, lineHeight: 16, letterSpacing: 1.1 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
} as const;
