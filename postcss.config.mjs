// Tailwind v4 PostCSS plugin — replaces @tailwindcss/vite during the
// Next.js migration. The CSS-first config in globals.css stays unchanged.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
