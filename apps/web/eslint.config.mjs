import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

// Next 15 deprecated `next lint`. Run ESLint directly via the flat config so it
// works non-interactively (`eslint .`). Extends Next's core-web-vitals +
// typescript rule sets through the eslintrc compat layer.
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "lib/supabase/types.gen.ts",
    ],
  },
  {
    rules: {
      // The codebase deliberately uses `(supabase as any)` to bypass the
      // generated-type gaps on PostgREST calls; flagging every one as an error
      // drowns out real signal. Allowed by convention.
      "@typescript-eslint/no-explicit-any": "off",
      // Unused vars are a smell to surface, not a build-breaker. `_`-prefixed
      // args/vars are intentionally ignored.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Stylistic-only — raw apostrophes in JSX prose render fine; surface as a
      // warning rather than breaking the build on copy.
      "react/no-unescaped-entities": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
];

export default eslintConfig;
