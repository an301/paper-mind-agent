/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  // Preflight is the global CSS reset. We disable it because the legacy
  // app has its own resets in index.css that we don't want overwritten
  // while we migrate. .ds-root has its own scoped reset in tokens.css.
  corePlugins: { preflight: false },
  theme: {
    // Hard-override defaults so devs can't accidentally reach for shadcn-grays.
    // Everything must come from the token system.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      black: "#000000",
      white: "#FFFFFF",

      bg: "var(--bg)",
      "bg-elevated": "var(--bg-elevated)",
      "bg-raised": "var(--bg-raised)",
      "bg-hover": "var(--bg-hover)",
      "bg-active": "var(--bg-active)",

      fg: "var(--fg)",
      "fg-default": "var(--fg-default)",
      "fg-muted": "var(--fg-muted)",
      "fg-subtle": "var(--fg-subtle)",

      border: "var(--border)",
      "border-strong": "var(--border-strong)",

      accent: "var(--accent)",
      "accent-hover": "var(--accent-hover)",
      "accent-active": "var(--accent-active)",
      "accent-fg": "var(--accent-fg)",
      "accent-soft": "var(--accent-soft)",
      "accent-ring": "var(--accent-ring)",

      success: "var(--success)",
      warning: "var(--warning)",
      danger: "var(--danger)",

      // Raw scale exposed for the design-tokens viewer; shouldn't be used in
      // production components — those should reach for semantic tokens above.
      gray: {
        0: "var(--gray-0)",
        1: "var(--gray-1)",
        2: "var(--gray-2)",
        3: "var(--gray-3)",
        4: "var(--gray-4)",
        5: "var(--gray-5)",
        6: "var(--gray-6)",
        7: "var(--gray-7)",
        8: "var(--gray-8)",
        9: "var(--gray-9)",
        10: "var(--gray-10)",
        11: "var(--gray-11)",
      },
    },
    fontFamily: {
      sans: "var(--font-sans)",
      mono: "var(--font-mono)",
    },
    fontSize: {
      xs:    ["12px", { lineHeight: "16px", letterSpacing: "0" }],
      sm:    ["13px", { lineHeight: "18px", letterSpacing: "0" }],
      md:    ["14px", { lineHeight: "20px", letterSpacing: "0" }],
      base:  ["16px", { lineHeight: "26px", letterSpacing: "0" }],
      lg:    ["20px", { lineHeight: "28px", letterSpacing: "-0.005em" }],
      xl:    ["28px", { lineHeight: "34px", letterSpacing: "-0.015em" }],
      "2xl": ["40px", { lineHeight: "46px", letterSpacing: "-0.022em" }],
    },
    borderRadius: {
      none: "0",
      sm:   "var(--radius-sm)",
      md:   "var(--radius-md)",
      lg:   "var(--radius-lg)",
      full: "9999px",
    },
    boxShadow: {
      none:  "none",
      pop:   "var(--shadow-pop)",
      modal: "var(--shadow-modal)",
    },
    extend: {
      letterSpacing: {
        caps:    "var(--tracking-caps)",
        display: "var(--tracking-display)",
      },
      transitionTimingFunction: {
        smooth: "var(--ease-out)",
      },
      transitionDuration: {
        quick: "var(--dur-quick)",
        base:  "var(--dur-base)",
        view:  "var(--dur-view)",
      },
    },
  },
  plugins: [],
};
