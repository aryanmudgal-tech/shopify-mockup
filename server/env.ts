// Loads ANTHROPIC_API_KEY from .env (git-ignored) into the server process.
// The key never reaches the page: only server code reads process.env.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function loadDotEnv(): void {
  const file = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
