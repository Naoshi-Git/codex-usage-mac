import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import process from "node:process";
import { FIVE_HOUR_MINUTES, WEEKLY_MINUTES } from "./usage.mjs";
import { VERSION } from "./meta.mjs";
import {
  desktopRuntimeCandidates,
  fileIsRunnable,
  findOnPath,
  makeCommandInvocation,
} from "./platform.mjs";

export function resolveCodex() {
  for (const variable of ["CODEX_CLI", "CODEX_CLI_PATH"]) {
    const override = process.env[variable]?.trim();
    if (!override) continue;
    return {
      command: findOnPath(override) ?? override,
      source: variable,
    };
  }

  const onPath = findOnPath("codex");
  if (onPath) return { command: onPath, source: "PATH" };

  for (const candidate of desktopRuntimeCandidates()) {
    if (fileIsRunnable(candidate.path)) {
      return { command: candidate.path, source: candidate.source };
    }
  }

  return {
    command: process.platform === "win32" ? "codex.exe" : "codex",
    source: "not found",
  };
}

export function resolveCodexCommand() {
  return resolveCodex().command;
}

export function codexExists() {
  const { command } = resolveCodex();
  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return fileIsRunnable(command);
  }
  return Boolean(findOnPath(command));
}

export function codexVersion() {
  if (!codexExists()) return null;
  const invocation = makeCommandInvocation(resolveCodexCommand(), ["--version"]);
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  return result.status === 0 ? (result.stdout || result.stderr).trim() : null;
}

export async function fetchUsage({ timeoutMs = 15000 } = {}) {
  const command = resolveCodexCommand();
  const invocation = makeCommandInvocation(command, ["app-server", "--stdio"]);
  const child = spawn(invocation.command, invocation.args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    windowsHide: true,
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => stderr += chunk);

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const waiting = new Map();
  let prematureExit = null;

  const finishWaiting = (err) => {
    for (const { reject, timer } of waiting.values()) {
      clearTimeout(timer);
      reject(err);
    }
    waiting.clear();
  };

  rl.on("line", line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message?.id != null && waiting.has(message.id)) {
      const item = waiting.get(message.id);
      clearTimeout(item.timer);
      waiting.delete(message.id);
      item.resolve(message);
    }
  });

  child.on("error", err => {
    prematureExit = err;
    finishWaiting(err);
  });
  child.on("exit", (code) => {
    if (waiting.size) {
      const err = new Error(`Codex exited before returning usage (exit ${code ?? "?"}). ${stderr.trim()}`.trim());
      prematureExit = err;
      finishWaiting(err);
    }
  });

  const request = (payload) => new Promise((resolve, reject) => {
    if (prematureExit) return reject(prematureExit);
    const timer = setTimeout(() => {
      waiting.delete(payload.id);
      reject(new Error("Timed out while waiting for Codex app-server."));
    }, timeoutMs);
    waiting.set(payload.id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify(payload) + "\n");
  });

  try {
    const init = await request({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "codex-usage", version: VERSION }, capabilities: { experimentalApi: true } },
    });
    throwProtocol(init);
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    const response = await request({ id: 2, method: "account/rateLimits/read", params: null });
    throwProtocol(response);
    return parseUsageResponse(response, new Date());
  } catch (err) {
    if (err?.code === "ENOENT") {
      const e = new Error("Codex runtime was not found. Install Codex CLI or a Codex desktop runtime.");
      e.code = "CODEX_NOT_FOUND";
      throw e;
    }
    throw err;
  } finally {
    rl.close();
    if (!child.killed) child.kill();
  }
}

function throwProtocol(response) {
  if (response?.error) throw new Error(`Codex API error: ${response.error.message ?? JSON.stringify(response.error)}`);
}

export function parseUsageResponse(response, refreshedAt = new Date()) {
  const result = response?.result;
  if (!result || typeof result !== "object") throw new Error("Codex returned an invalid rate-limit response.");
  const bucket = result.rateLimitsByLimitId?.codex ?? result.rateLimits;
  if (!bucket || typeof bucket !== "object") throw new Error("Codex general usage bucket was not found.");

  const windows = new Map();
  for (const name of ["primary", "secondary"]) {
    const raw = bucket[name];
    if (!raw || typeof raw.windowDurationMins !== "number" || typeof raw.usedPercent !== "number") continue;
    const reset = Number.isFinite(raw.resetsAt) ? new Date(raw.resetsAt * 1000) : null;
    windows.set(raw.windowDurationMins, {
      durationMinutes: raw.windowDurationMins,
      usedPercent: Math.max(0, Math.min(100, raw.usedPercent)),
      resetsAt: reset,
    });
  }
  return {
    fiveHour: windows.get(FIVE_HOUR_MINUTES) ?? null,
    weekly: windows.get(WEEKLY_MINUTES) ?? null,
    refreshedAt,
  };
}
