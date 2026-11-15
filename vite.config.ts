import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The Node server in server/index.ts runs Vite in middleware mode, so this
// config only needs the React plugin. Vitest reads it too.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "src/**/*.test.ts"],
  },
});
