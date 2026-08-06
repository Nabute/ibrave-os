/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Newsreader Variable"', "ui-serif", "Georgia", "serif"],
        mono: ['"Geist Mono Variable"', "ui-monospace", "monospace"],
      },
      colors: {
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          active: "hsl(var(--sidebar-active))",
          border: "hsl(var(--sidebar-border))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          subtle: "hsl(var(--destructive-subtle))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          subtle: "hsl(var(--success-subtle))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          subtle: "hsl(var(--warning-subtle))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          subtle: "hsl(var(--info-subtle))",
        },
        brass: {
          DEFAULT: "hsl(var(--brass))",
          foreground: "hsl(var(--brass-foreground))",
        },
        grid: {
          line: "hsl(var(--grid-line))",
          weekend: "hsl(var(--grid-weekend))",
        },
        "invoice-brand": "hsl(var(--invoice-brand))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius)",
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        // Ledger: three recipes total. Cards are hairline-only (no shadow);
        // raise is for sticky headers, float for things that leave the page.
        raise: "0 1px 2px hsl(25 20% 12% / 0.06)",
        float:
          "0 8px 24px -8px hsl(25 20% 12% / 0.16), 0 1px 3px hsl(25 20% 12% / 0.07)",
        // legacy aliases so existing call sites degrade gracefully
        card: "none",
      },
      transitionTimingFunction: {
        ledger: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        fast: "110ms",
        base: "160ms",
        slow: "220ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
