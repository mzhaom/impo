const palette = {
  canvas: "#f4f4f3",
  panel: "#ffffff",
  raised: "#e9e9e7",
  line: "#d8d8d5",
  accent: "#3b82f6",
  text: "#202020",
  muted: "#6f6f6b",
  soft: "#ededeb",
  success: "#22a65a",
  warning: "#d58b12",
  danger: "#dc3f3f",
  darkCanvas: "#111111",
  darkPaper: "#1a1a1a",
  darkRaised: "#242424",
  darkLine: "#2a2a2a",
  darkText: "#e0e0e0",
  darkMuted: "#8c8c8c",
};

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 999,
} as const;

export const typography = {
  title: {
    fontFamily: "Lato_700Bold",
    fontSize: 24,
    lineHeight: 30,
  },
  section: {
    fontFamily: "Lato_700Bold",
    fontSize: 15,
    lineHeight: 20,
  },
  body: {
    fontFamily: "Lato_400Regular",
    fontSize: 15,
    lineHeight: 21,
  },
  meta: {
    fontFamily: "Lato_400Regular",
    fontSize: 12,
    lineHeight: 16,
  },
  mono: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
} as const;

export const lightTheme = {
  dark: false,
  spacing,
  radii,
  typography,
  colors: {
    background: palette.canvas,
    surface: palette.panel,
    surfaceRaised: palette.raised,
    surfaceMuted: palette.soft,
    border: palette.line,
    text: palette.text,
    textMuted: palette.muted,
    accent: palette.accent,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    groupped: {
      background: palette.canvas,
    },
    header: {
      background: palette.panel,
      tint: palette.text,
    },
  },
};

export const darkTheme = {
  dark: true,
  spacing,
  radii,
  typography,
  colors: {
    background: palette.darkCanvas,
    surface: palette.darkPaper,
    surfaceRaised: palette.darkRaised,
    surfaceMuted: "#202020",
    border: palette.darkLine,
    text: palette.darkText,
    textMuted: palette.darkMuted,
    accent: "#3b82f6",
    success: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    groupped: {
      background: palette.darkCanvas,
    },
    header: {
      background: palette.darkPaper,
      tint: palette.darkText,
    },
  },
};

export type AppTheme = typeof lightTheme;
