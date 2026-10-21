/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger:  'hsl(var(--danger))',
        subtle:  'hsl(var(--subtle))',
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      letterSpacing: {
        tighter: '-0.03em',
        tight: '-0.02em',
        normal: '-0.01em',
        wide: '0.01em',
      },
      // Five UI sizes (px, not rem: the root is 15px). Nothing smaller than 11px.
      fontSize: {
        '2xs':  ['11px', { lineHeight: '15px' }],   // captions, badges, metadata
        'xs':   ['12px', { lineHeight: '16px' }],   // secondary UI text
        'sm':   ['13px', { lineHeight: '19px' }],   // body / default UI text
        'base': ['15px', { lineHeight: '22px' }],   // section titles
        'lg':   ['17px', { lineHeight: '24px' }],   // dialog / page titles
        'xl':   ['20px', { lineHeight: '28px' }],
        '2xl':  ['24px', { lineHeight: '30px' }],
        '3xl':  ['30px', { lineHeight: '36px' }],
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', 'Ubuntu', 'Cantarell', '"Noto Sans"', 'sans-serif'],
        mono: ['Geist Mono Variable', 'Geist Mono', 'JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
