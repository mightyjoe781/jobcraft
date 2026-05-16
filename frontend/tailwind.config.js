/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: "#ffffff",
          hover: "#f9fafb",
          active: "#eef2ff",
        },
        accent: {
          DEFAULT: "#4f46e5",
          hover: "#4338ca",
        },
        ats: {
          low: "#dc2626",
          mid: "#d97706",
          high: "#059669",
        },
      },
    },
  },
  plugins: [],
};
