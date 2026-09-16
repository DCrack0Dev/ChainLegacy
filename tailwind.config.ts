import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#020617", // Slate 950
        foreground: "#f8fafc", // Slate 50
        accent: {
          DEFAULT: "#10b981", // Emerald 500
          light: "#34d399",
          dark: "#059669",
        },
        gold: {
          DEFAULT: "#D4AF37", // Metallic Gold
          light: "#F4D03F",
          dark: "#B8860B",
        },
        primary: {
          DEFAULT: "#6366f1", // Indigo 500
          light: "#818cf8",
          dark: "#4f46e5",
        },
        card: {
          DEFAULT: "#0f172a", // Slate 900
          border: "#1e293b", // Slate 800
        },
      },
    },
  },
  plugins: [],
};
export default config;
