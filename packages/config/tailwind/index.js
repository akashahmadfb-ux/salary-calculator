/** @type {import('tailwindcss').Config} */
const colors = require('../../../packages/ui/src/tokens/colors');

module.exports = {
  content: [
    './apps/**/*.{ts,tsx}',
    './packages/ui/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        night: colors.night,
        moon: colors.moon,
        star: colors.star,
        leaf: colors.leaf,
        ember: colors.ember,
        glass: colors.glass,
      },
      fontFamily: {
        serif: ['Playfair Display', 'serif'],
        sans: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
