/** @type {import('tailwindcss').Config} */
export default {
  // Note: In Tailwind v4, content scanning is handled by @source directives in CSS
  // The 'content' configuration below is ignored when using v4 with @source
  // Keep theme extensions and plugins for v4 compatibility
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'fade-in-down': {
          '0%': {
            opacity: '0',
            transform: 'translateY(-10px)'
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)'
          },
        }
      },
      animation: {
        'fade-in-down': 'fade-in-down 0.3s ease-out'
      }
    },
  },
  plugins: [],
}
