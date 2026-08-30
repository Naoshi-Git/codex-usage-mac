import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { FIVE_HOUR_MINUTES, WEEKLY_MINUTES } from "./usage.mjs";

export function resolveCodexCommand() {
  const override = process.env.CODEX_CLI?.trim();
  if (override) return override;
  return findOnPath("codex") ?? "codex";
}

export function codexExists() {
  const command = resolveCodexCommand();
  if (command.includes(path.sep)) {
    try {
      fs.accessSync(command, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  return Boolean(findOnPath(command));
}

function findOnPath(command) {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

export function codexVersion() {
  if (!codexExists()) return null;
  const result = spawnSync(resolveCodexCommand(), ["--version"], { encoding: "utf8", timeout: 5000 });
  return result.status === 0 ? (result.stdout || result.stderr).trim() : null;
}

export async function fetchUsage({ timeoutMs = 15000 } = {}) {
  const command = resolveCodexCommand();
  const child = spawn(command, ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
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
      params: { clientInfo: { name: "codex-usage-mac", version: "1.0.0" }, capabilities: { experimentalApi: true } },
    });
    throwProtocol(init);
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    const response = await request({ id: 2, method: "account/rateLimits/read", params: null });
    throwProtocol(response);
    return parseUsageResponse(response, new Date());
  } catch (err) {
    if (err?.code === "ENOENT") {
      const e = new Error("Codex CLI was not found in PATH.");
      e.code = "CODEX_NOT_FOUND";
      throw e;
    }
    throw err;
  } finally {
    rl.close();
    child.kill("SIGTERM");
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
