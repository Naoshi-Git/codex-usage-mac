import fs from "node:fs";

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export const APP_NAME = "codex-usage";
export const VERSION = packageJson.version;
export const REPOSITORY_SLUG = process.env.CODEX_USAGE_REPO?.trim() || "Naoshi-Git/codex-usage";
