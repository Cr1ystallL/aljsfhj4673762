import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Monopo Saigon Color System
        'midnight-canvas': '#000000',
        'frost-white': '#ffffff',
        'deep-shadow': '#181818',
        'whisper-gray': '#6d6d6d',
        'misty-gray': '#636363',
        'deep-ocean': '#a0e0ab',
        'macvbet-yellow': '#ffac2e',
        
        // Legacy aliases for compatibility
        background: '#000000',
        foreground: '#ffffff',
        muted: '#6d6d6d',
      },
      
      fontFamily: {
        sans: ['var(--font-roobert)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        roobert: ['var(--font-roobert)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        raleway: ['var(--font-raleway)', 'serif'],
      },
      
      fontSize: {
        'caption': ['11px', { lineHeight: '1.58' }],
        'body': ['16px', { lineHeight: '1.25' }],
        'subheading': ['18px', { lineHeight: '1.22' }],
        'heading-sm': ['29px', { lineHeight: '1.21' }],
        'heading': ['39px', { lineHeight: '1.15' }],
        'heading-lg': ['54px', { lineHeight: '1.39' }],
        'display': ['225px', { lineHeight: '0.7' }],
      },
      
      spacing: {
        '8': '8px',
        '12': '12px',
        '28': '28px',
        '40': '40px',
        '48': '48px',
        '64': '64px',
        '68': '68px',
        '152': '152px',
      },
      
      borderRadius: {
        'pill': '75.024px',
        'card': '10px',
        'full': '75.024px',
      },
      
      backgroundImage: {
        'gradient-ocean': 'linear-gradient(90deg, rgb(160, 224, 171), rgb(255, 172, 46) 50%, rgb(165, 45, 37))',
        'gradient-primary': 'linear-gradient(90deg, rgb(160, 224, 171), rgb(255, 172, 46) 50%, rgb(165, 45, 37))',
      },
      
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'float': 'float 4s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer': 'shimmer 3s ease-in-out infinite',
      },
      
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-15px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      
      backdropBlur: {
        'glass': '12px',
        'xl': '24px',
        '2xl': '40px',
      },
      
      maxWidth: {
        'page': '1078px',
      },
      
      gap: {
        'section': '46px',
        'element': '14px',
      },
    },
  },
  plugins: [],
};

export default config;
