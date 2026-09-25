import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { plugin as shadcn } from "@shadcn/lint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // design-system discipline (works with plain Tailwind v4, no shadcn/ui needed)
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { shadcn },
    settings: {
      shadcn: { ui: "@/components", note: "Theme tokens live in src/app/globals.css (@theme); shared classes in src/lib/ui.tsx." },
    },
    rules: {
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": "error",
      // inline styles here are only data-driven values (bar widths, series colors, stagger by index, option count)
      "shadcn/no-inline-styles": "off",
      "shadcn/no-unknown-classes": "error",
      "shadcn/require-static-classes": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
