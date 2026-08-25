export const colors = {
  background: '#000d18',
  backgroundDeep: '#000911',
  surface: '#001820',
  surfaceRaised: '#001f27',
  surfaceSoft: '#00121a',
  surfaceInteractive: '#002630',
  border: '#083742',
  borderStrong: '#0a5961',
  primary: '#04c5bf',
  primaryMuted: '#07827f',
  primarySoft: 'rgba(4, 197, 191, 0.10)',
  accent: '#ee0c6f',
  accentSoft: 'rgba(238, 12, 111, 0.10)',
  heading: '#c71b43',
  text: '#f5fbfc',
  textMuted: '#8aa5ad',
  textSubtle: '#66838b',
  danger: '#ff577f',
  success: '#50d2a5',
  warning: '#ffbe5c',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 9, 17, 0.82)',
} as const;

export const radius = {
  small: 8,
  medium: 12,
  large: 16,
  panel: 20,
  pill: 999,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const layout = {
  screenPadding: 16,
  cardPadding: 14,
  sectionGap: 12,
  controlHeight: 44,
  compactControlHeight: 38,
  touchTarget: 44,
  maxContentWidth: 680,
} as const;

export const typography = {
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800' as const,
    letterSpacing: 1.8,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },
  sectionTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700' as const,
  },
  caption: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500' as const,
  },
} as const;

export const shadow = {
  panel: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 4,
  },
  focus: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 2,
  },
} as const;
