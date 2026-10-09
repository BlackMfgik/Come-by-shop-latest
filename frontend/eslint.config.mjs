import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Правила React Compiler: поточний код коректний, але написаний до них — лише попередження
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      // Зображення з Cloudinary вже оптимізовані через URL-трансформації
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
