import os from "node:os";
import process from "node:process";
import { codexExists, codexVersion, fetchUsage, resolveCodexCommand } from "./codex-client.mjs";
import { historyFilePath } from "./history.mjs";

export async function runDoctor(options) {
  const en = options.lang === "en";
  const rows = [];
  rows.push(["macOS", process.platform === "darwin", `${os.release()} · ${process.arch}`]);
  const major = Number(process.versions.node.split(".")[0]);
  rows.push(["Node.js", major >= 18, process.version]);
  const exists = codexExists();
  rows.push(["Codex CLI", exists, exists ? `${resolveCodexCommand()} · ${codexVersion() ?? "version unknown"}` : "not found in PATH"]);

  let access = false, detail = "";
  if (exists) {
    try {
      const snapshot = await fetchUsage({ timeoutMs: 10000 });
      access = Boolean(snapshot.weekly || snapshot.fiveHour);
      detail = access ? "rate-limit endpoint OK" : "connected, but no Codex rate-limit bucket";
    } catch (err) {
      detail = err.message;
    }
  }
  rows.push(["Codex account", access, detail || "not checked"]);

  console.log("Codex Usage Doctor");
  console.log("==================");
  for (const [name, ok, info] of rows) console.log(`${ok ? "✓" : "✗"} ${name.padEnd(14)} ${info}`);
  console.log(`• history        ${historyFilePath()}`);

  if (rows.every(r => r[1])) {
    console.log(en ? "\nReady. Run: codex-usage" : "\n準備完了です。`codex-usage` を実行できます。");
    return 0;
  }

  console.log(en ? "\nRecommended fixes:" : "\n推奨する修正:");
  if (process.platform !== "darwin") console.log("  • This repository is macOS-only.");
  if (major < 18) console.log("  • Install/update Node.js 18+: brew install node");
  if (!exists) {
    console.log("  • Install Codex CLI (official standalone):");
    console.log("      curl -fsSL https://chatgpt.com/codex/install.sh | sh");
    console.log("    or Homebrew:");
    console.log("      brew install --cask codex");
    console.log("    or npm:");
    console.log("      npm install -g @openai/codex");
  } else if (!access) {
    console.log("  • Run `codex`, choose “Sign in with ChatGPT”, then retry:");
    console.log("      codex-usage doctor");
  }
  return 1;
}
