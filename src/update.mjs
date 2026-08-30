import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = "Naoshi-Git/codex-usage-mac";

export async function runUpdate(options) {
  const en = options.lang === "en";
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-usage-update-"));
  try {
    const source = await resolveArchive();
    console.log(en ? `Updating from ${source.label}...` : `${source.label} から更新します…`);

    const response = await fetch(source.url, {
      redirect: "follow",
      headers: { "User-Agent": "codex-usage-mac" },
    });
    if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);

    const archive = path.join(temp, "source.tar.gz");
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

    const extract = spawnSync("/usr/bin/tar", ["-xzf", archive, "-C", temp], { stdio: "inherit" });
    if (extract.status !== 0) throw new Error("failed to extract update archive");

    const root = fs.readdirSync(temp, { withFileTypes: true })
      .find(entry => entry.isDirectory() && entry.name !== ".git");
    if (!root) throw new Error("update archive did not contain a repository directory");

    const installer = path.join(temp, root.name, "install.sh");
    if (!fs.existsSync(installer)) throw new Error("install.sh was not found in update archive");

    const install = spawnSync("/bin/bash", [installer], {
      stdio: "inherit",
      env: process.env,
    });
    if (install.status !== 0) return install.status ?? 1;

    console.log(en ? "\nUpdate complete." : "\n更新が完了しました。");
    return 0;
  } catch (err) {
    console.error(en ? `Update failed: ${err.message}` : `更新失敗: ${err.message}`);
    return 1;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function resolveArchive() {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { "User-Agent": "codex-usage-mac", Accept: "application/vnd.github+json" },
    });
    if (response.ok) {
      const release = await response.json();
      if (release?.tarball_url) {
        return { url: release.tarball_url, label: release.tag_name || "latest release" };
      }
    }
  } catch {}

  return {
    url: `https://github.com/${REPO}/archive/refs/heads/main.tar.gz`,
    label: "latest main",
  };
}
