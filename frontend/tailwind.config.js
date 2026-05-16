/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: "#1a1d23",
          hover: "#22262e",
          active: "#2a2f3a",
        },
        accent: {
          DEFAULT: "#6366f1",
          hover: "#4f52d4",
        },
        ats: {
          low: "#ef4444",
          mid: "#f59e0b",
          high: "#22c55e",
        },
      },
    },
  },
  plugins: [],
};
