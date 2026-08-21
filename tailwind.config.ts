import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Nunito", "sans-serif"],
        serif: ["DM Serif Display", "Georgia", "serif"],
      },
      colors: {
        rust: "#B74217",
        teal: "#4FA4A1",
        nature: "#96BD99",
        cream: "#FAEFD1",
        ink: "#2F291E",
      },
    },
  },
  plugins: [],
} satisfies Config;
