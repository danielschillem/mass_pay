import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:       "#07090F",
        surf:     "#0C1020",
        card:     "#111827",
        elevated: "#172035",
        border:   "#1C2840",
        gold:     "#E4A730",
        green:    "#0DC98A",
        red:      "#F05252",
        blue:     "#4B7BFF",
        muted:    "#5A6888",
        mid:      "#98A5C4",
        text:     "#E4EAF8",
      },
      fontFamily: {
        sans:    ["DM Sans", "sans-serif"],
        display: ["Sora", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
