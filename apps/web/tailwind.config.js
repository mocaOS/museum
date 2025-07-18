/** @type {import('tailwindcss').Config} */
export default {
  darkMode: [ "class" ],
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        "DEFAULT": "1rem",
        "sm": "2rem",
        "lg": "2rem",
        "xl": "2rem",
        "2xl": "2rem",
      },
    },
  },
  plugins: [],
};
