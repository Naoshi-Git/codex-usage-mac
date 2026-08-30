import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export const SUPPORTED_PLATFORMS = new Set(["darwin", "win32"]);

export function isSupportedPlatform() {
  return SUPPORTED_PLATFORMS.has(process.platform);
}

export function platformLabel() {
  if (process.platform === "darwin") return "macOS";
  if (process.platform === "win32") return "Windows";
  return process.platform;
}

export function fileIsRunnable(candidate) {
  try {
    fs.accessSync(
      candidate,
      process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK,
    );
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function findOnPath(command) {
  if (!command) return null;

  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return resolveExplicitPath(command);
  }

  const names = commandNames(command);
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fileIsRunnable(candidate)) return candidate;
    }
  }
  return null;
}

function resolveExplicitPath(command) {
  if (fileIsRunnable(command)) return command;
  if (process.platform !== "win32" || path.extname(command)) return null;
  for (const ext of windowsPathExts()) {
    const candidate = command + ext;
    if (fileIsRunnable(candidate)) return candidate;
  }
  return null;
}

function commandNames(command) {
  if (process.platform !== "win32" || path.extname(command)) return [command];
  return windowsPathExts().map(ext => command + ext);
}

function windowsPathExts() {
  const configured = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map(ext => ext.trim())
    .filter(Boolean);
  return [...new Set(configured)];
}

export function desktopRuntimeCandidates() {
  if (process.platform === "darwin") {
    return [
      { source: "ChatGPT Desktop", path: "/Applications/ChatGPT.app/Contents/Resources/codex" },
      { source: "ChatGPT Desktop", path: path.join(os.homedir(), "Applications/ChatGPT.app/Contents/Resources/codex") },
      { source: "Codex Desktop (legacy)", path: "/Applications/Codex.app/Contents/Resources/codex" },
      { source: "Codex Desktop (legacy)", path: path.join(os.homedir(), "Applications/Codex.app/Contents/Resources/codex") },
    ];
  }

  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const candidates = [
      ...scanWindowsDesktopBins(path.join(local, "OpenAI", "Codex", "bin")),
      { source: "Codex Desktop", path: path.join(local, "Programs", "OpenAI", "Codex", "bin", "codex.exe") },
      { source: "Codex Desktop", path: path.join(local, "OpenAI", "Codex", "bin", "codex.exe") },
      { source: "Codex CLI", path: path.join(os.homedir(), ".local", "bin", "codex.exe") },
    ];
    return dedupeCandidates(candidates);
  }

  return [];
}

function scanWindowsDesktopBins(root) {
  const found = [];
  try {
    const direct = path.join(root, "codex.exe");
    if (fileIsRunnable(direct)) {
      found.push({ source: "Codex Desktop", path: direct, mtime: fs.statSync(direct).mtimeMs });
    }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(root, entry.name, "codex.exe");
      if (!fileIsRunnable(candidate)) continue;
      found.push({ source: "Codex Desktop", path: candidate, mtime: fs.statSync(candidate).mtimeMs });
    }
  } catch {
    return [];
  }

  return found
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ source, path: candidatePath }) => ({ source, path: candidatePath }));
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(candidate => {
    const key = candidate.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function defaultHistoryPath() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "codex-usage", "history.jsonl");
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(local, "CodexUsage", "history.jsonl");
  }
  return path.join(os.homedir(), ".codex-usage", "history.jsonl");
}

export function legacyHistoryPaths() {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return [path.join(local, "CodexUsageCli", "history.jsonl")];
  }
  return [];
}

export function makeCommandInvocation(command, args = []) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    const shell = process.env.ComSpec || "cmd.exe";
    const line = [quoteCmd(command), ...args.map(quoteCmd)].join(" ");
    return { command: shell, args: ["/d", "/s", "/c", line] };
  }
  return { command, args };
}

function quoteCmd(value) {
  const text = String(value);
  if (!/[\s"&|<>^()]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function powershellExecutable() {
  const pwsh = findOnPath("pwsh");
  if (pwsh) return pwsh;
  const windowsPowerShell = findOnPath("powershell");
  if (windowsPowerShell) return windowsPowerShell;
  return "powershell.exe";
}
