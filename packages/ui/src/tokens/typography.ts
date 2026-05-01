/**
 * Typography tokens.
 * Fonts are loaded via expo-font in the app shell.
 */
export const fontFamily = {
  /** Playfair Display — headings, journal titles, emotional text */
  serif: {
    regular: 'PlayfairDisplay_400Regular',
    medium: 'PlayfairDisplay_500Medium',
    semiBold: 'PlayfairDisplay_600SemiBold',
    bold: 'PlayfairDisplay_700Bold',
    italic: 'PlayfairDisplay_400Regular_Italic',
    boldItalic: 'PlayfairDisplay_700Bold_Italic',
  },
  /** Poppins — UI labels, numbers, body text */
  sans: {
    light: 'Poppins_300Light',
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semiBold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
  },
} as const;

export const fontSize = {
  /** Display — large hero amounts */
  display: 48,
  /** H1 — screen titles */
  h1: 32,
  /** H2 — section headers */
  h2: 24,
  /** H3 — card titles */
  h3: 20,
  /** Body large */
  bodyLg: 17,
  /** Body */
  body: 15,
  /** Body small */
  bodySm: 13,
  /** Caption */
  caption: 11,
  /** Micro label */
  micro: 10,
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

export const letterSpacing = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
  wider: 1,
  widest: 2,
} as const;
