import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".venv/**",
      "venv/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "dist/**",
      "out/**",
      "*.log",
    ],
  },
  ...nextVitals,
];

export default config;
