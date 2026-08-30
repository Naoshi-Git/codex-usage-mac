import os from "node:os";
import process from "node:process";
import { codexExists, codexVersion, fetchUsage, resolveCodex } from "./codex-client.mjs";
import { historyFilePath } from "./history.mjs";
import { isSupportedPlatform, platformLabel } from "./platform.mjs";

export async function runDoctor(options) {
  const en = options.lang === "en";
  const rows = [];
  rows.push(["Platform", isSupportedPlatform(), `${platformLabel()} ${os.release()} · ${process.arch}`]);
  const major = Number(process.versions.node.split(".")[0]);
  rows.push(["Node.js", major >= 22, process.version]);

  const resolved = resolveCodex();
  const exists = codexExists();
  rows.push([
    "Codex runtime",
    exists,
    exists ? `${resolved.source} · ${resolved.command} · ${codexVersion() ?? "version unknown"}` : "not found",
  ]);

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
  if (!isSupportedPlatform()) {
    console.log("  • Supported platforms are macOS and Windows.");
  }
  if (major < 22) printNodeInstall(en);
  if (!exists) {
    console.log(en
      ? "  • Install Codex CLI, or use a supported Codex desktop runtime."
      : "  • Codex CLIを導入するか、対応するCodex Desktop runtimeを利用してください。");
    printCodexInstall();
  } else if (!access) {
    if (resolved.source.includes("Desktop")) {
      console.log(en
        ? "  • Open the Codex/ChatGPT desktop app and confirm you are signed in."
        : "  • Codex/ChatGPTデスクトップアプリを開き、ログイン済みか確認してください。");
    } else {
      console.log("  • Run `codex`, choose “Sign in with ChatGPT”, then retry:");
    }
    console.log("      codex-usage doctor");
  }

  console.log("\nOverride discovery if needed:");
  if (process.platform === "win32") {
    console.log("  $env:CODEX_CLI='C:\\full\\path\\to\\codex.exe'; codex-usage doctor");
  } else {
    console.log("  CODEX_CLI=/full/path/to/codex codex-usage doctor");
  }
  console.log("  CODEX_CLI_PATH is also recognized for Codex Desktop compatibility.");
  return 1;
}

function printNodeInstall() {
  if (process.platform === "win32") {
    console.log("  • Install/update Node.js 22+: winget install OpenJS.NodeJS.LTS");
  } else {
    console.log("  • Install/update Node.js 22+: brew install node");
  }
}

function printCodexInstall() {
  if (process.platform === "win32") {
    console.log("  • Codex Desktop user runtime is auto-detected under %LOCALAPPDATA%\\OpenAI\\Codex\\bin when available.");
    console.log("  • Official standalone Codex CLI:");
    console.log('      powershell -NoProfile -ExecutionPolicy Bypass -c "irm https://chatgpt.com/codex/install.ps1 | iex"');
    return;
  }

  console.log("  • ChatGPT/Codex Desktop bundled runtime is detected automatically when present.");
  console.log("  • Official standalone Codex CLI:");
  console.log("      curl -fsSL https://chatgpt.com/codex/install.sh | sh");
  console.log("    or Homebrew:");
  console.log("      brew install --cask codex");
}
