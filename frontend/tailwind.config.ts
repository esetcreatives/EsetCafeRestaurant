import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: "#fdca00",
        "golden-ember": "#fdca00",
        forest: "#05503c",
        "deep-emerald": "#05503c",
        cream: "#faf8f2",
        alabaster: "#F9F9F9",
        "midnight-emerald": "#021a14",
        glass: {
          bg: "rgba(255, 255, 255, 0.08)",
          border: "rgba(255, 255, 255, 0.1)",
        },
      },
      fontFamily: {
        heading: ["var(--font-bricolage)", "sans-serif"],
        body: ["var(--font-instrument)", "sans-serif"],
      },
      boxShadow: {
        'soft': '0 10px 30px rgba(0, 0, 0, 0.05)',
        'medium': '0 20px 50px rgba(0, 0, 0, 0.08)',
        'deep': '0 30px 60px rgba(0, 0, 0, 0.12)',
        'gold': '0 4px 15px rgba(253, 202, 0, 0.3)',
        'gold-hover': '0 6px 25px rgba(253, 202, 0, 0.4)',
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out",
        "slide-up": "slideUp 0.8s ease-out",
        "scale-in": "scaleIn 0.5s ease-out",
        "shimmer": "shimmer 2s infinite",
        "pulse-gold": "pulseGold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "trace": "trace 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(30px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        pulseGold: {
          "0%, 100%": { 
            boxShadow: "0 0 0 0 rgba(253, 202, 0, 0.7)",
          },
          "50%": { 
            boxShadow: "0 0 0 10px rgba(253, 202, 0, 0)",
          },
        },
        trace: {
          "0%, 100%": { strokeDashoffset: "0" },
          "50%": { strokeDashoffset: "100" },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      letterSpacing: {
        tighter: '-0.04em',
      },
    },
  },
  plugins: [],
};

export default config;
