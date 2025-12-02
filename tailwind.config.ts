import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "var(--brand-bg)",
          "bg-alt": "var(--brand-bg-alt)",
          grid: "var(--brand-grid)",
          primary: "var(--brand-primary)",
          secondary: "var(--brand-secondary)",
          accent: "var(--brand-accent)",
          card: "var(--brand-card)",
          border: "var(--brand-border)",
        },
        text: {
          primary: "var(--text-primary)",
          muted: "var(--text-muted)",
          secondary: "var(--text-secondary)",
        },
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "brand-gradient": "linear-gradient(135deg, #FFFFFF 0%, #E5E5E5 100%)",
        "brand-gradient-alt": "linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 100%)",
        "brand-gradient-accent": "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shake: "shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both",
        "pulse-glow": "pulse-glow 1.5s ease-in-out infinite",
      },
      keyframes: {
        shake: {
          "10%, 90%": { transform: "translate3d(-1px, 0, 0)" },
          "20%, 80%": { transform: "translate3d(2px, 0, 0)" },
          "30%, 50%, 70%": { transform: "translate3d(-4px, 0, 0)" },
          "40%, 60%": { transform: "translate3d(4px, 0, 0)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 20px rgba(29, 140, 255, 0.5)" },
          "50%": { opacity: "0.8", boxShadow: "0 0 30px rgba(29, 140, 255, 0.8)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
