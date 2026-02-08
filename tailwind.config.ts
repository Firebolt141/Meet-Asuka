import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        blush: "#fdf2f8",
        berry: "#db2777",
        peach: "#fdba74"
      },
      boxShadow: {
        soft: "0 20px 40px -24px rgba(219, 39, 119, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
