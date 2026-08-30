import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { REPOSITORY_SLUG } from "./meta.mjs";
import { powershellExecutable } from "./platform.mjs";

export async function runUpdate(options) {
  const en = options.lang === "en";
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-usage-update-"));
  try {
    const source = await resolveArchive();
    console.log(en ? `Updating from ${source.label}...` : `${source.label} から更新します…`);

    const response = await fetch(source.url, {
      redirect: "follow",
      headers: { "User-Agent": "codex-usage" },
    });
    if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);

    const archive = path.join(temp, process.platform === "win32" ? "source.zip" : "source.tar.gz");
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    extractArchive(archive, temp);

    const root = fs.readdirSync(temp, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== ".git")
      .map(entry => path.join(temp, entry.name))
      .find(dir => fs.existsSync(path.join(dir, process.platform === "win32" ? "install.ps1" : "install.sh")));
    if (!root) throw new Error("update archive did not contain an installer");

    const status = runInstaller(root);
    if (status !== 0) return status;

    console.log(en ? "\nUpdate complete." : "\n更新が完了しました。");
    return 0;
  } catch (err) {
    console.error(en ? `Update failed: ${err.message}` : `更新失敗: ${err.message}`);
    return 1;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function extractArchive(archive, destination) {
  if (process.platform === "win32") {
    const script = `Expand-Archive -LiteralPath '${psQuote(archive)}' -DestinationPath '${psQuote(destination)}' -Force`;
    const result = spawnSync(powershellExecutable(), [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command", script,
    ], { stdio: "inherit", windowsHide: true });
    if (result.status !== 0) throw new Error("failed to extract update archive");
    return;
  }

  const result = spawnSync("/usr/bin/tar", ["-xzf", archive, "-C", destination], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("failed to extract update archive");
}

function runInstaller(root) {
  if (process.platform === "win32") {
    const installer = path.join(root, "install.ps1");
    const result = spawnSync(powershellExecutable(), [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", installer,
    ], { stdio: "inherit", env: process.env, windowsHide: true });
    return result.status ?? 1;
  }

  const installer = path.join(root, "install.sh");
  const result = spawnSync("/bin/bash", [installer], {
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

function psQuote(value) {
  return String(value).replaceAll("'", "''");
}

async function resolveArchive() {
  const isWindows = process.platform === "win32";
  try {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY_SLUG}/releases/latest`, {
      redirect: "follow",
      headers: { "User-Agent": "codex-usage", Accept: "application/vnd.github+json" },
    });
    if (response.ok) {
      const release = await response.json();
      const releaseUrl = isWindows ? release?.zipball_url : release?.tarball_url;
      if (releaseUrl) {
        return { url: releaseUrl, label: release.tag_name || "latest release" };
      }
    }
  } catch {}

  return {
    url: isWindows
      ? `https://github.com/${REPOSITORY_SLUG}/archive/refs/heads/main.zip`
      : `https://github.com/${REPOSITORY_SLUG}/archive/refs/heads/main.tar.gz`,
    label: "latest main",
  };
}
