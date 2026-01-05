/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gray: {
          750: "#2d3748" // Between gray-700 (#374151) and gray-800 (#1f2937)
        }
      }
    }
  },
  plugins: []
};
