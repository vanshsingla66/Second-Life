/** @type {import('tailwindcss').Config} */
module.exports = {
  // "class" (not "media") so NativeWind's web runtime can manage the scheme; it still follows the system theme by default.
  darkMode: "class",
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effaf1", 100: "#d7f4de", 200: "#b1e8c1", 300: "#7dd699", 400: "#45bd6f",
          500: "#22a355", 600: "#158343", 700: "#126837", 800: "#12522e", 900: "#0f4428",
        },
        sun: { 400: "#FFC44D", 500: "#FFB020", 600: "#E89A00" },
        cream: "#F5FAF2",
        ink: "#14231A",
        night: { DEFAULT: "#0D1610", card: "#16231A", line: "#233428" },
      },
    },
  },
  plugins: [],
};
