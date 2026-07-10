const palette = {
  parchment: "#f5f4ed",
  paper: "#faf9f5",
  raised: "#ffffff",
  line: "#ddd9ca",
  ink: "#1b365d",
  text: "#2a2a27",
  muted: "#5e5d59",
  soft: "#e8e6dc",
  success: "#4a7a4a",
  warning: "#b07a1c",
  danger: "#b53333",
  darkCanvas: "#141413",
  darkPaper: "#1c1b1a",
  darkRaised: "#24221f",
  darkLine: "#3a372f",
  darkText: "#edece5",
  darkMuted: "#a09e93",
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
    background: palette.parchment,
    surface: palette.paper,
    surfaceRaised: palette.raised,
    surfaceMuted: palette.soft,
    border: palette.line,
    text: palette.text,
    textMuted: palette.muted,
    accent: palette.ink,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    groupped: {
      background: palette.parchment,
    },
    header: {
      background: palette.paper,
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
    surfaceMuted: "#2a2823",
    border: palette.darkLine,
    text: palette.darkText,
    textMuted: palette.darkMuted,
    accent: "#9db7da",
    success: "#8fbe8f",
    warning: "#e3bd70",
    danger: "#e48585",
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
