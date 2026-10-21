import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f0ff",
          100: "#e9e3ff",
          200: "#d6caff",
          300: "#b9a4ff",
          400: "#9b7bff",
          500: "#7c5cff",
          600: "#6b46f0",
          700: "#5a37d6",
          800: "#4a2eb0",
          900: "#3e288f",
        },
        // Muted pastel surface tints (Ethos-inspired accent surfaces)
        pastel: {
          sage: "#e7ede4",
          lavender: "#e9e4f6",
          peach: "#f9ecdd",
          periwinkle: "#e3e9f6",
          mist: "#f3f3f1",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: ["var(--font-domine)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
