/**
 * Night-sky colour palette for the IOKNBO Finance Tracker.
 * All values are intentionally soft and emotional — no harsh primary colours.
 */
export const night = {
  /** Deepest background — the open night sky */
  950: '#05070F',
  900: '#080C1A',
  800: '#0D1226',
  700: '#111832',
  600: '#161E3E',
  500: '#1C2650',
  400: '#233062',
} as const;

export const moon = {
  /** Warm ivory & parchment — journal pages */
  50: '#FDFBF5',
  100: '#FAF6E9',
  200: '#F3EBCC',
  300: '#E8D9A8',
  400: '#D9C07A',
  500: '#C9A84C',
  600: '#A8873A',
  700: '#866830',
} as const;

export const star = {
  /** Cool blue-white — data points, highlights */
  50: '#F0F4FF',
  100: '#DCE6FF',
  200: '#B8CCFF',
  300: '#8AABFF',
  400: '#5C8AFF',
  500: '#3D6FFF',
  600: '#2857E6',
} as const;

export const leaf = {
  /** Organic greens — savings, growth */
  50: '#F0FAF2',
  100: '#DBF4E0',
  200: '#B8E8C1',
  300: '#84D494',
  400: '#4FBA64',
  500: '#2DA044',
  600: '#1E8032',
} as const;

export const ember = {
  /** Warm amber-red — alerts, debts (gentle, not alarming) */
  50: '#FFF8F0',
  100: '#FFECD6',
  200: '#FFD2A3',
  300: '#FFB266',
  400: '#FF8C33',
  500: '#E86A0A',
  600: '#C05200',
} as const;

export const glass = {
  /** Frosted-glass overlays */
  white10: 'rgba(255, 255, 255, 0.10)',
  white15: 'rgba(255, 255, 255, 0.15)',
  white20: 'rgba(255, 255, 255, 0.20)',
  black30: 'rgba(0, 0, 0, 0.30)',
  black50: 'rgba(0, 0, 0, 0.50)',
  /** Frosted border */
  border: 'rgba(255, 255, 255, 0.12)',
} as const;

/** Semantic aliases for quick use */
export const semantic = {
  background: night[900],
  surface: night[800],
  surfaceElevated: night[700],
  textPrimary: moon[50],
  textSecondary: moon[200],
  textMuted: moon[400],
  accent: star[400],
  success: leaf[400],
  warning: ember[300],
  danger: ember[500],
} as const;
