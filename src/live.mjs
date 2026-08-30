import process from "node:process";
import { fetchUsage } from "./codex-client.mjs";
import { recordHistory } from "./history.mjs";
import { parseNight, renderStatus } from "./usage.mjs";
import { renderMascot } from "./mascot.mjs";
import { createLiveFrame, style, supportsStyle } from "./ui.mjs";

const COMMANDS = [
  ["watch <sec|off>", "change polling cadence", "確認周期を変更"],
  ["mascot [on|off]", "toggle quota buddy", "マスコット切替"],
  ["lang <en|ja>", "switch display language", "表示言語を変更"],
  ["refresh", "fetch usage now", "今すぐ使用量を再取得"],
  ["redraw", "reset the terminal view", "表示を完全に再描画"],
  ["width <28-72>", "change timeline width", "タイムライン幅を変更"],
  ["night <00:00-06:00>", "change weekly night band", "夜間帯を変更"],
  ["help", "show slash commands", "コマンド一覧を表示"],
  ["quit", "leave live view", "ライブ表示を終了"],
];

const ARG_COMPLETIONS = new Map([
  ["mascot", ["on", "off"]],
  ["lang", ["en", "ja"]],
  ["watch", ["off"]],
  ["night", ["00:00-06:00"]],
]);

export async function runLiveSession(baseOptions) {
  const state = {
    watchSeconds: Math.max(10, Math.min(3600, baseOptions.watch ?? 60)),
    mascot: Boolean(baseOptions.mascot),
    lang: baseOptions.lang,
    width: baseOptions.width,
    night: baseOptions.night,
    commandMode: false,
    commandBuffer: "",
    exitRequested: false,
    forceReset: false,
    refreshRequested: false,
    notice: null,
    noticeUntil: 0,
    helpUntil: 0,
    dirty: true,
  };

  let snapshot = await fetchUsage();
  recordHistory(snapshot);
  let nextFetchAt = Date.now() + state.watchSeconds * 1000;
  let updatedUntil = 0;
  let lastFrame = -1;
  let lastSecond = -1;

  const frame = createLiveFrame();
  const input = beginInput(state);
  try {
    while (!state.exitRequested) {
      const now = Date.now();
      if (frame.checkResize()) {
        setNotice(state, state.lang === "en" ? "↻ terminal resized · view rebuilt" : "↻ サイズ変更を検出 · 表示を再構築", 2);
        state.dirty = true;
      }

      if (state.forceReset) {
        frame.reset();
        state.forceReset = false;
        state.dirty = true;
      }

      if (state.refreshRequested || (state.watchSeconds > 0 && now >= nextFetchAt)) {
        const fresh = await fetchUsage();
        recordHistory(fresh);
        if (changed(snapshot, fresh)) updatedUntil = Date.now() + 3000;
        snapshot = fresh;
        state.refreshRequested = false;
        nextFetchAt = state.watchSeconds > 0 ? Date.now() + state.watchSeconds * 1000 : Number.POSITIVE_INFINITY;
        state.dirty = true;
      }

      const mascotFrame = Math.floor(Date.now() / 450);
      if (state.mascot && mascotFrame !== lastFrame) {
        lastFrame = mascotFrame;
        state.dirty = true;
      }

      const second = Math.floor(Date.now() / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        state.dirty = true;
      }

      if (state.dirty) {
        const options = effectiveOptions(baseOptions, state, frame.width);
        const updated = Date.now() < updatedUntil;
        frame.render(() => draw(snapshot, options, state, frame.width, updated, nextFetchAt, mascotFrame));
        state.dirty = false;
      }

      await sleep(50);
    }
  } finally {
    input.close();
    frame.close();
  }
}

function effectiveOptions(baseOptions, state, terminalWidth) {
  let width = state.width;
  if (terminalWidth >= 70) width = Math.max(28, Math.min(72, Math.min(width, terminalWidth - 30)));
  return {
    ...baseOptions,
    watch: state.watchSeconds > 0 ? state.watchSeconds : null,
    mascot: state.mascot,
    lang: state.lang,
    width,
    night: state.night,
  };
}

function draw(snapshot, options, state, terminalWidth, updated, nextFetchAt, mascotFrame) {
  const st = style(supportsStyle(options.plain));
  if (terminalWidth < 68) {
    console.log(st.bold("Codex usage"));
    console.log();
    console.log(st.yellow(options.lang === "en"
      ? `  Terminal is too narrow (${terminalWidth} cols). Resize to at least 68 columns.`
      : `  ターミナル幅が狭すぎます（${terminalWidth}列）。68列以上に広げてください。`));
    console.log();
  } else {
    if (options.mascot) renderMascot(snapshot, options, mascotFrame);
    renderStatus(snapshot, options);
    console.log();
  }

  if (state.notice && Date.now() < state.noticeUntil) console.log(`  ${st.yellow(state.notice)}`);
  renderFooter(state, st, options.lang, updated, nextFetchAt);
  if (state.commandMode || Date.now() < state.helpUntil) renderCommandPalette(state, st, options.lang);
}

function renderFooter(state, st, lang, updated, nextFetchAt) {
  let badge;
  let next;
  if (state.watchSeconds <= 0) {
    badge = st.yellow("Ⅱ PAUSED");
    next = lang === "en" ? "auto refresh off" : "自動更新オフ";
  } else {
    badge = st.badge(updated ? "✦ UPDATED" : "● RUNNING", updated);
    const seconds = Math.max(0, Math.ceil((nextFetchAt - Date.now()) / 1000));
    next = lang === "en" ? `next check ${seconds}s` : `次回確認 ${seconds}秒`;
  }

  const hint = lang === "en"
    ? ` ${next} · / commands · Tab complete · Ctrl+L redraw · Ctrl+C exit`
    : ` ${next} · / コマンド · Tab 補完 · Ctrl+L 再描画 · Ctrl+C 終了`;
  console.log(`  ${badge}${st.dim(hint)}\u001b[K`);
  if (state.commandMode) console.log(`  ${st.cyan("› /")}${state.commandBuffer}\u001b[K`);
}

function renderCommandPalette(state, st, lang) {
  const filter = state.commandMode ? state.commandBuffer.trim().toLowerCase() : "";
  const token = filter.split(/\s+/, 1)[0] ?? "";
  const matches = token
    ? COMMANDS.filter(([spec]) => commandName(spec).startsWith(token))
    : COMMANDS;

  console.log();
  console.log(`  ${st.bold("/ commands")}${st.dim(lang === "en" ? "  Tab to complete · Enter to run · Esc to close" : "  Tabで補完 · Enterで実行 · Escで閉じる")}`);
  for (const [spec, en, ja] of matches.slice(0, 7)) {
    const command = `/${spec}`.padEnd(23);
    console.log(`  ${st.cyan(command)}${st.dim(lang === "en" ? en : ja)}`);
  }
  console.log();
}

function beginInput(state) {
  if (!process.stdin.isTTY) return { close() {} };
  const wasRaw = Boolean(process.stdin.isRaw);
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const onData = (chunk) => {
    for (const ch of chunk) handleKey(state, ch);
    state.dirty = true;
  };
  process.stdin.on("data", onData);

  return {
    close() {
      process.stdin.off("data", onData);
      try { process.stdin.setRawMode(wasRaw); } catch {}
      if (!wasRaw) process.stdin.pause();
    },
  };
}

function handleKey(state, ch) {
  if (ch === "\u0003") { // Ctrl+C
    state.exitRequested = true;
    return;
  }
  if (ch === "\u000c") { // Ctrl+L
    state.forceReset = true;
    setNotice(state, state.lang === "en" ? "↻ display reset" : "↻ 表示をリセット", 2);
    return;
  }

  if (!state.commandMode) {
    if (ch === "/") {
      state.commandMode = true;
      state.commandBuffer = "";
    }
    return;
  }

  if (ch === "\u001b") { // Esc
    state.commandMode = false;
    state.commandBuffer = "";
    return;
  }
  if (ch === "\u007f" || ch === "\b") {
    state.commandBuffer = state.commandBuffer.slice(0, -1);
    return;
  }
  if (ch === "\t") {
    completeCommandBuffer(state);
    return;
  }
  if (ch === "\r" || ch === "\n") {
    executeCommand(state, state.commandBuffer);
    state.commandMode = false;
    state.commandBuffer = "";
    return;
  }
  if (ch >= " " && ch !== "\u007f" && state.commandBuffer.length < 80) {
    state.commandBuffer += ch;
  }
}

function completeCommandBuffer(state) {
  const raw = state.commandBuffer;
  const separator = raw.indexOf(" ");
  if (separator < 0) {
    const prefix = raw.trim().toLowerCase();
    const names = [...new Set(COMMANDS.map(([spec]) => commandName(spec)))]
      .filter((name) => name.startsWith(prefix))
      .sort();
    if (!names.length) return false;
    const completion = names.length === 1 ? names[0] : longestCommonPrefix(names);
    if (completion.length <= prefix.length) return false;
    state.commandBuffer = completion;
    if (names.length === 1 && ARG_COMPLETIONS.has(completion)) state.commandBuffer += " ";
    return true;
  }

  const command = raw.slice(0, separator).trim().toLowerCase();
  const choices = ARG_COMPLETIONS.get(command);
  if (!choices) return false;
  const prefix = raw.slice(separator + 1).trimStart().toLowerCase();
  const matches = choices.filter((value) => value.startsWith(prefix)).sort();
  if (!matches.length) return false;
  const completion = matches.length === 1 ? matches[0] : longestCommonPrefix(matches);
  if (completion.length <= prefix.length) return false;
  state.commandBuffer = `${command} ${completion}`;
  return true;
}

function longestCommonPrefix(values) {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < value.length && prefix[i].toLowerCase() === value[i].toLowerCase()) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix;
}

function commandName(spec) {
  return spec.split(" ", 1)[0].toLowerCase();
}

function executeCommand(state, raw) {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    state.helpUntil = Date.now() + 8000;
    return;
  }
  const command = parts[0].toLowerCase();
  const argument = parts[1]?.toLowerCase();

  switch (command) {
    case "watch":
      if (!argument) {
        setNotice(state, `watch = ${state.watchSeconds > 0 ? `${state.watchSeconds}s` : "off"}`);
      } else if (argument === "off" || argument === "pause") {
        state.watchSeconds = 0;
        setNotice(state, state.lang === "en" ? "Ⅱ auto refresh paused" : "Ⅱ 自動更新を停止");
      } else if (/^\d+$/.test(argument)) {
        state.watchSeconds = Math.max(10, Math.min(3600, Number(argument)));
        state.refreshRequested = true;
        setNotice(state, state.lang === "en" ? `● watch set to ${state.watchSeconds}s` : `● 更新周期を ${state.watchSeconds}秒 に変更`);
      } else {
        setNotice(state, state.lang === "en" ? "watch expects seconds or off" : "watch は秒数または off を指定");
      }
      break;

    case "mascot":
      state.mascot = argument === "on" ? true : argument === "off" ? false : !state.mascot;
      state.forceReset = true;
      setNotice(state, state.lang === "en" ? `✨ mascot ${state.mascot ? "on" : "off"} · redrawn` : `✨ マスコット ${state.mascot ? "オン" : "オフ"} · 再描画済み`);
      break;

    case "lang":
      if (argument === "en" || argument === "ja") {
        state.lang = argument;
        state.forceReset = true;
        setNotice(state, argument === "en" ? "language = English · redrawn" : "表示言語 = 日本語 · 再描画済み");
      } else {
        setNotice(state, state.lang === "en" ? "lang expects en or ja" : "lang は en / ja を指定");
      }
      break;

    case "refresh":
      state.refreshRequested = true;
      setNotice(state, state.lang === "en" ? "↻ refreshing now" : "↻ 今すぐ再取得");
      break;

    case "redraw":
    case "reset":
    case "clear":
      state.forceReset = true;
      setNotice(state, state.lang === "en" ? "↻ display reset" : "↻ 表示をリセット");
      break;

    case "width": {
      const value = Number(argument);
      if (Number.isInteger(value)) {
        state.width = Math.max(28, Math.min(72, value));
        state.forceReset = true;
        setNotice(state, `timeline width = ${state.width} · redrawn`);
      } else {
        setNotice(state, state.lang === "en" ? "width expects 28-72" : "width は 28〜72 を指定");
      }
      break;
    }

    case "night":
      try {
        if (!argument) throw new Error("missing");
        state.night = parseNight(argument);
        state.forceReset = true;
        setNotice(state, state.lang === "en" ? `night = ${state.night.text} · redrawn` : `夜間 = ${state.night.text} · 再描画済み`);
      } catch {
        setNotice(state, state.lang === "en" ? "night expects 00:00-06:00" : "night は 00:00-06:00 形式");
      }
      break;

    case "help":
    case "commands":
      state.helpUntil = Date.now() + 10_000;
      break;

    case "quit":
    case "exit":
      state.exitRequested = true;
      break;

    default:
      setNotice(state, state.lang === "en" ? `unknown command /${command}` : `不明なコマンド /${command}`);
      break;
  }
}

function setNotice(state, text, seconds = 3) {
  state.notice = text;
  state.noticeUntil = Date.now() + seconds * 1000;
  state.dirty = true;
}

function changed(a, b) {
  const diff = (x, y) => !x || !y
    ? Boolean(x) !== Boolean(y)
    : Math.abs(x.usedPercent - y.usedPercent) >= 0.01 || String(x.resetsAt) !== String(y.resetsAt);
  return diff(a.weekly, b.weekly) || diff(a.fiveHour, b.fiveHour);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
