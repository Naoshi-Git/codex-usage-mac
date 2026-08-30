import { analyzeWeekly, analyzeWindow } from "./usage.mjs";
import { style, supportsStyle } from "./ui.mjs";

const BASE_ART = [
  "........P.........",
  ".......PPP........",
  "........P.........",
  ".....BBBBBBBB.....",
  "...BBHHBBBBHHBB...",
  "..BBWWBBBBBBWWBB..",
  ".BBBKWBBBBBBWKBBB.",
  "BBBBBBBBBBBBBBBBBB",
  "BBBBBBCBBBBBCBBBBB",
  "BBBBBBBBKKBBBBBBBB",
  ".BBBBBBBBBBBBBBBB.",
  "..DBBBBBBBBBBBBD..",
  "...DDBBB..BBBDD...",
  "....DD......DD....",
];

export function assessMood(snapshot, options) {
  const weeklyRemaining = snapshot.weekly ? 100 - snapshot.weekly.usedPercent : 100;
  const fiveRemaining = snapshot.fiveHour ? 100 - snapshot.fiveHour.usedPercent : 100;
  const weeklyDelta = analyzeWeekly(snapshot.weekly, snapshot.refreshedAt, options.night)?.delta ?? 0;
  const fiveDelta = analyzeWindow(snapshot.fiveHour, snapshot.refreshedAt)?.delta ?? 0;
  const lowestRemaining = Math.min(weeklyRemaining, fiveRemaining);

  const quotaSeverity = lowestRemaining <= 10 ? 3 : lowestRemaining <= 25 ? 2 : lowestRemaining <= 50 ? 1 : 0;
  const weeklySeverity = weeklyDelta >= 18 ? 3 : weeklyDelta >= 10 ? 2 : weeklyDelta >= 4 ? 1 : 0;
  // 5-hour windows are intentionally less sensitive because bursty usage is normal.
  const fiveSeverity = fiveDelta >= 40 ? 3 : fiveDelta >= 24 ? 2 : fiveDelta >= 12 ? 1 : 0;
  const severity = Math.max(quotaSeverity, weeklySeverity, fiveSeverity);
  const mood = ["cruising", "busy", "warm", "critical"][severity];
  const driver = severity === 0 ? "balanced"
    : weeklySeverity === severity ? "weekly pace"
    : fiveSeverity === severity ? "5h pace"
    : "remaining quota";

  return { mood, weeklyDelta, fiveDelta, lowestRemaining, driver };
}

export function chooseMood(snapshot, options) {
  return assessMood(snapshot, options).mood;
}

export function renderMascot(snapshot, options, frame = 0) {
  const assessment = assessMood(snapshot, options);
  const styled = supportsStyle(options.plain);
  const st = style(styled);

  if (!styled) {
    const face = {
      cruising: "(•‿•)",
      busy: "(•ᴗ•;)",
      warm: "(•﹏•)",
      critical: "(×﹏×)",
    }[assessment.mood];
    console.log(`  ${face}  ${moodText(assessment.mood, options.lang)} · ${basisText(assessment, options.lang)}`);
    return;
  }

  const blink = frame % 13 === 10;
  const bob = frame % 8 === 3 || frame % 8 === 4 ? 1 : 0;
  const art = buildArt(assessment.mood, blink);
  const palette = paletteFor(assessment.mood);
  const rows = [];

  for (let y = 0; y < art.length; y += 2) {
    const topIndex = y - bob;
    const bottomIndex = y + 1 - bob;
    const top = topIndex >= 0 && topIndex < art.length ? art[topIndex] : ".".repeat(18);
    const bottom = bottomIndex >= 0 && bottomIndex < art.length ? art[bottomIndex] : ".".repeat(18);
    rows.push(renderPixelRow(top, bottom, palette, st));
  }

  rows.forEach((row, index) => {
    const suffix = index === 1
      ? `  ${st.bold("quota buddy")} · ${st.dim(moodText(assessment.mood, options.lang))}`
      : index === 2
        ? `  ${st.dim(basisText(assessment, options.lang))}`
        : index === 3
          ? `  ${st.dim(driverText(assessment, options.lang))}`
          : "";
    console.log(`  ${row}${suffix}`);
  });
  console.log();
}

function buildArt(mood, blink) {
  const art = [...BASE_ART];
  if (blink) {
    art[5] = "..BBBBBBBBBBBBBB..";
    art[6] = ".BBBKKBBBBBBKKBBB.";
  } else if (mood === "critical") {
    art[5] = "..BBKKBBBBBBKKBB..";
    art[6] = ".BBBKKBBBBBBKKBBB.";
  }

  if (mood === "cruising") {
    art[9] = "BBBBBBKBBBBKBBBBBB";
    art[10] = ".BBBBBBKKKKBBBBBB.";
  } else if (mood === "busy") {
    art[9] = "BBBBBBBBKKBBBBBBBB";
  } else if (mood === "warm") {
    art[9] = "BBBBBBBKKKKBBBBBBB";
  } else {
    art[9] = "BBBBBBKKBBKKBBBBBB";
  }
  return art;
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
    cruising: [40, 198, 183],
    busy: [48, 175, 226],
    warm: [238, 177, 69],
    critical: [231, 84, 108],
  }[mood];
  const shadow = {
    cruising: [24, 135, 129],
    busy: [30, 116, 165],
    warm: [168, 112, 42],
    critical: [157, 48, 69],
  }[mood];
  const highlight = {
    cruising: [105, 231, 215],
    busy: [118, 210, 243],
    warm: [255, 217, 126],
    critical: [255, 154, 168],
  }[mood];
  return {
    B: body,
    D: shadow,
    H: highlight,
    W: [246, 248, 250],
    K: [22, 25, 30],
    C: mood === "warm" || mood === "critical" ? [255, 126, 113] : [255, 154, 171],
    P: [255, 211, 80],
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

function basisText(value, lang) {
  const en = lang === "en";
  const weekly = deltaText(value.weeklyDelta, en);
  const five = deltaText(value.fiveDelta, en);
  return en
    ? `pace W ${weekly} · 5h ${five} · floor ${value.lowestRemaining.toFixed(0)}% left`
    : `ペース W ${weekly} · 5h ${five} · 最低残量 ${value.lowestRemaining.toFixed(0)}%`;
}

function driverText(value, lang) {
  if (lang === "en") return value.driver === "balanced" ? "basis: pace + remaining quota" : `driver: ${value.driver}`;
  return {
    "weekly pace": "判定要因: 週次ペース",
    "5h pace": "判定要因: 5時間ペース",
    "remaining quota": "判定要因: 残量",
    balanced: "判定基準: ペース + 残量",
  }[value.driver];
}

function deltaText(delta, en) {
  if (delta > 0.05) return en ? `${delta.toFixed(1)}pt ahead` : `${delta.toFixed(1)}pt 先行`;
  if (delta < -0.05) return en ? `${(-delta).toFixed(1)}pt room` : `${(-delta).toFixed(1)}pt 余裕`;
  return en ? "on target" : "目安どおり";
}
