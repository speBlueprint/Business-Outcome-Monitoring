/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  /* Preflight is off: the demo ships its own stylesheet (src/styles/app.css) and preflight would reset its tables, buttons and headings. */
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
