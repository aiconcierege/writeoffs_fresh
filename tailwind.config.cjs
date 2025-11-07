/** @type {import('tailwindcss').Config} */
// tailwind.config.cjs
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./public/**/*.html"
  ],
  theme: { extend: {} },
  plugins: [],
};
