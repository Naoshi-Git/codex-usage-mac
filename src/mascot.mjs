import { analyzeWeekly } from "./usage.mjs";
import { style, supportsStyle } from "./ui.mjs";

const OPEN_EYES = [
  "....BBBBBB....",
  "..BBBBBBBBBB..",
  ".BBBWWBBWWBBB.",
  "BBBWKBBKWBBBBB",
  "BBBBBBBBBBBBBB",
  "BBBBBBAABBBBBB",
  "BBBBBAAAABBBBB",
  ".BBBBBBBBBBBB.",
  "..BBB....BBB..",
  ".BB........BB.",
];

const BLINK_EYES = [
  "....BBBBBB....",
  "..BBBBBBBBBB..",
  ".BBBBBBBBBBBB.",
  "BBBBKBBBBKBBBB",
  "BBBBBBBBBBBBBB",
  "BBBBBBAABBBBBB",
  "BBBBBAAAABBBBB",
  ".BBBBBBBBBBBB.",
  "..BBB....BBB..",
  ".BB........BB.",
];

export function chooseMood(snapshot, options) {
  const weeklyRemaining = snapshot.weekly ? 100 - snapshot.weekly.usedPercent : 100;
  const fiveRemaining = snapshot.fiveHour ? 100 - snapshot.fiveHour.usedPercent : 100;
  const delta = analyzeWeekly(snapshot.weekly, snapshot.refreshedAt, options.night)?.delta ?? 0;
  const lowest = Math.min(weeklyRemaining, fiveRemaining);

  if (lowest <= 10 || delta >= 18) return "critical";
  if (lowest <= 25 || delta >= 10) return "warm";
  if (lowest <= 50 || delta >= 4) return "busy";
  return "cruising";
}

export function renderMascot(snapshot, options, frame = 0) {
  const mood = chooseMood(snapshot, options);
  const styled = supportsStyle(options.plain);
  const st = style(styled);

  if (!styled) {
    const face = {
      cruising: "(•‿•)",
      busy: "(•ᴗ•;)",
      warm: "(•﹏•)",
      critical: "(×﹏×)",
    }[mood];
    console.log(`  ${face}  ${moodText(mood, options.lang)}`);
    return;
  }

  const art = frame % 9 === 7 ? BLINK_EYES : OPEN_EYES;
  const bob = frame % 4 === 2 ? 1 : 0;
  const palette = paletteFor(mood);
  const rows = [];

  for (let y = 0; y < art.length; y += 2) {
    const topIndex = y - bob;
    const bottomIndex = y + 1 - bob;
    const top = topIndex >= 0 && topIndex < art.length ? art[topIndex] : ".".repeat(14);
    const bottom = bottomIndex >= 0 && bottomIndex < art.length ? art[bottomIndex] : ".".repeat(14);
    rows.push(renderPixelRow(top, bottom, palette, st));
  }

  const moodLabel = st.dim(moodText(mood, options.lang));
  const quota = st.dim(quotaText(snapshot, options.lang));
  rows.forEach((row, index) => {
    const suffix = index === 1
      ? `  ${st.bold("quota buddy")} · ${moodLabel}`
      : index === 2
        ? `  ${quota}`
        : "";
    console.log(`  ${row}${suffix}`);
  });
  console.log();
}

function renderPixelRow(top, bottom, palette, st) {
  let line = "";
  const width = Math.max(top.length, bottom.length);
  for (let x = 0; x < width; x++) {
    const topColor = palette[top[x] ?? "."];
    const bottomColor = palette[bottom[x] ?? "."];
    if (!topColor && !bottomColor) line += " ";
    else if (topColor && !bottomColor) line += st.rgb(...topColor, "▀");
    else if (!topColor && bottomColor) line += st.rgb(...bottomColor, "▄");
    else line += st.rgbPair(topColor, bottomColor, "▀");
  }
  return line;
}

function paletteFor(mood) {
  const body = {
    cruising: [35, 198, 183],
    busy: [36, 172, 226],
    warm: [244, 187, 68],
    critical: [235, 86, 112],
  }[mood];
  return {
    B: body,
    W: [242, 245, 248],
    K: [24, 27, 32],
    A: mood === "warm" || mood === "critical" ? [120, 55, 45] : [30, 90, 92],
  };
}

function moodText(mood, lang) {
  const en = lang === "en";
  return {
    cruising: en ? "cruising" : "余裕あり",
    busy: en ? "active" : "やや先行",
    warm: en ? "ease up" : "少し抑えめ",
    critical: en ? "cool down" : "休ませどき",
  }[mood];
}

function quotaText(snapshot, lang) {
  const weekly = snapshot.weekly ? `${Math.max(0, 100 - snapshot.weekly.usedPercent).toFixed(0)}%` : "--";
  const five = snapshot.fiveHour ? `${Math.max(0, 100 - snapshot.fiveHour.usedPercent).toFixed(0)}%` : "--";
  return lang === "en"
    ? `weekly ${weekly} left · 5h ${five} left`
    : `週次 ${weekly} 残り · 5h ${five} 残り`;
}
