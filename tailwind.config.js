const token = (name) =>
  `color-mix(in oklab, var(${name}) calc(<alpha-value> * 100%), transparent)`;

const baseUiDataVariants = {
  "data-open": ['&[data-state="open"]', '&[data-open]:not([data-open="false"])'],
  "data-closed": ['&[data-state="closed"]', '&[data-closed]:not([data-closed="false"])'],
  "data-checked": ['&[data-state="checked"]', '&[data-checked]:not([data-checked="false"])'],
  "data-unchecked": ['&[data-state="unchecked"]', '&[data-unchecked]:not([data-unchecked="false"])'],
  "data-selected": '&[data-selected="true"]',
  "data-disabled": ['&[data-disabled="true"]', '&[data-disabled]:not([data-disabled="false"])'],
  "data-active": ['&[data-state="active"]', '&[data-active]:not([data-active="false"])'],
  "data-horizontal": '&[data-orientation="horizontal"]',
  "data-vertical": '&[data-orientation="vertical"]',
  "data-inset": '&[data-inset]',
  "data-popup-open": '&[data-popup-open]:not([data-popup-open="false"])',
  "has-data-checked": '&:has([data-checked]:not([data-checked="false"]))',
};

export default {
  darkMode: ["class"],
  content: {
    files: ["./index.html", "./src/**/*.{ts,tsx}"],
    transform: {
      ts: (content) => content.replace(/\[[^\]\s]*:\/\/[^\]\s]*\]/g, ""),
      tsx: (content) => content.replace(/\[[^\]\s]*:\/\/[^\]\s]*\]/g, ""),
    },
  },
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: token("--background"),
        foreground: token("--foreground"),
        card: {
          DEFAULT: token("--card"),
          foreground: token("--card-foreground"),
        },
        popover: {
          DEFAULT: token("--popover"),
          foreground: token("--popover-foreground"),
        },
        primary: {
          DEFAULT: token("--primary"),
          foreground: token("--primary-foreground"),
        },
        secondary: {
          DEFAULT: token("--secondary"),
          foreground: token("--secondary-foreground"),
        },
        muted: {
          DEFAULT: token("--muted"),
          foreground: token("--muted-foreground"),
        },
        accent: {
          DEFAULT: token("--accent"),
          foreground: token("--accent-foreground"),
        },
        destructive: {
          DEFAULT: token("--destructive"),
          foreground: token("--destructive-foreground"),
        },
        border: token("--border"),
        input: token("--input"),
        ring: token("--ring"),
        sidebar: {
          DEFAULT: token("--sidebar"),
          foreground: token("--sidebar-foreground"),
          primary: token("--sidebar-primary"),
          "primary-foreground": token("--sidebar-primary-foreground"),
          accent: token("--sidebar-accent"),
          "accent-foreground": token("--sidebar-accent-foreground"),
          border: token("--sidebar-border"),
          ring: token("--sidebar-ring"),
        },
        surface: {
          DEFAULT: token("--surface"),
          foreground: token("--surface-foreground"),
        },
        code: {
          DEFAULT: token("--code"),
          foreground: token("--code-foreground"),
          highlight: token("--code-highlight"),
          number: token("--code-number"),
        },
        chart: {
          1: token("--chart-1"),
          2: token("--chart-2"),
          3: token("--chart-3"),
          4: token("--chart-4"),
          5: token("--chart-5"),
        },
      },
    },
  },
  plugins: [
    ({ addVariant }) => {
      Object.entries(baseUiDataVariants).forEach(([name, selector]) => {
        addVariant(name, selector);
      });
    },
  ],
};
