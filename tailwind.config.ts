import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        "brand-accent": "hsl(var(--brand-accent))",
        border: "hsl(var(--border))",
        ink: "hsl(var(--ink))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        navy: "hsl(var(--navy))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        "status-borrow": "hsl(var(--status-borrow))",
        "status-fail": "hsl(var(--status-fail))",
        "status-lost": "hsl(var(--status-lost))",
        "status-need-check": "hsl(var(--status-need-check))",
        "status-ready": "hsl(var(--status-ready))",
        "status-request": "hsl(var(--status-request))",
        "status-sold": "hsl(var(--status-sold))",
        "status-using": "hsl(var(--status-using))",
        surface: "hsl(var(--surface))",
      },
    },
  },
  plugins: [],
};

export default config;
