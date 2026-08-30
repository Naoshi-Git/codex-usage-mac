import { Card, style, supportsStyle } from "./ui.mjs";

const FIVE_HOUR_MINUTES = 300;
const WEEKLY_MINUTES = 10080;

export { FIVE_HOUR_MINUTES, WEEKLY_MINUTES };

export function parseNight(text = "00:00-06:00") {
  const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) throw new Error("--night must use HH:MM-HH:MM.");
  const sh = Number(m[1]), sm = Number(m[2]), eh = Number(m[3]), em = Number(m[4]);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) throw new Error("--night contains an invalid time.");
  return { startMinutes: sh * 60 + sm, endMinutes: eh * 60 + em, text: `${pad2(sh)}:${pad2(sm)}-${pad2(eh)}:${pad2(em)}` };
}

export function isNight(date, night) {
  const mins = date.getHours() * 60 + date.getMinutes();
  const { startMinutes: s, endMinutes: e } = night;
  if (s === e) return false;
  return s < e ? mins >= s && mins < e : mins >= s || mins < e;
}

export function analyzeWindow(window, now) {
  if (!window?.resetsAt) return null;
  const end = new Date(window.resetsAt);
  const start = new Date(end.getTime() - window.durationMinutes * 60_000);
  const used = clamp(window.usedPercent, 0, 100);
  const target = pacePercentAt(start, end, now);
  const delta = used - target;
  let catchUpAt = null;
  if (delta > 0.05) {
    const candidate = new Date(start.getTime() + (end - start) * used / 100);
    if (candidate > now && candidate <= end) catchUpAt = candidate;
  }
  return { start, end, used, target, delta, catchUpAt };
}

export function analyzeWeekly(window, now, night) {
  const base = analyzeWindow(window, now);
  if (!base) return null;
  const nextNightEnd = computeNextNightEnd(now, night);
  let headroomAtNextNightEnd = null;
  if (nextNightEnd < base.end) {
    headroomAtNextNightEnd = pacePercentAt(base.start, base.end, nextNightEnd) - base.used;
  }
  return { ...base, nextNightEnd: nextNightEnd < base.end ? nextNightEnd : null, headroomAtNextNightEnd };
}

function computeNextNightEnd(now, night) {
  const d = new Date(now);
  const eH = Math.floor(night.endMinutes / 60), eM = night.endMinutes % 60;
  d.setHours(eH, eM, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

export function pacePercentAt(start, end, point) {
  const total = end - start;
  if (total <= 0) return 0;
  return clamp((point - start) / total * 100, 0, 100);
}

export function renderUsageTrack(start, end, cells, night, target, used, unicode = true) {
  const day = unicode ? "─" : "-";
  const nightCh = unicode ? "░" : ":";
  const usedDay = unicode ? "━" : "=";
  const usedNight = unicode ? "▓" : "#";
  const currentMarker = unicode ? "●" : "o";
  const usedMarker = unicode ? "▲" : "^";
  const overlap = unicode ? "◆" : "*";
  const span = end - start;
  const track = Array(cells).fill(day);
  for (let i = 0; i < cells; i++) {
    const sample = new Date(start.getTime() + span * ((i + 0.5) / cells));
    track[i] = night && isNight(sample, night) ? nightCh : day;
  }
  const currentIndex = percentIndex(target, cells);
  const usedIndex = percentIndex(used, cells);
  for (let i = 0; i < usedIndex; i++) track[i] = track[i] === nightCh ? usedNight : usedDay;
  if (currentIndex === usedIndex) track[currentIndex] = overlap;
  else {
    track[currentIndex] = currentMarker;
    track[usedIndex] = usedMarker;
  }
  return track.join("");
}

function percentIndex(percent, cells) {
  return clamp(Math.round(clamp(percent, 0, 100) / 100 * (cells - 1)), 0, cells - 1);
}

export function renderStatus(snapshot, options) {
  const now = snapshot.refreshedAt;
  const weekly = analyzeWeekly(snapshot.weekly, now, options.night);
  const five = analyzeWindow(snapshot.fiveHour, now);
  const st = style(supportsStyle(options.plain));
  const card = new Card(Math.max(64, Math.min(92, options.width + 24)), st);
  const en = options.lang === "en";
  card.top("Codex usage");
  card.line(`  ${st.dim(formatDateTime(now))}`);
  card.line();

  if (snapshot.weekly && weekly) {
    renderWindow(card, en ? "Weekly" : "週次", snapshot.weekly, weekly, now, options, st, true);
    card.line();
    renderAdvice(card, weekly, now, en, st, true);
  } else {
    card.line(`  ${st.yellow(en ? "Weekly usage unavailable." : "週次  使用量を取得できませんでした。")}`);
  }

  card.line();
  if (snapshot.fiveHour && five) {
    renderWindow(card, en ? "5 hour" : "5時間", snapshot.fiveHour, five, now, options, st, false);
    card.line();
    renderAdvice(card, five, now, en, st, false);
  } else {
    card.line(`  ${st.yellow(en ? "5-hour usage unavailable." : "5時間  使用量を取得できませんでした。")}`);
  }
  card.bottom();
}

function renderWindow(card, label, window, analysis, now, options, st, withNight) {
  const en = options.lang === "en";
  const remaining = clamp(100 - window.usedPercent, 0, 100);
  const left = `${st.bold(label)}  ${st.quota(en ? `${remaining.toFixed(0)}% left` : `${remaining.toFixed(0)}% 残り`, remaining)}  ${st.dim(en ? `· ${window.usedPercent.toFixed(0)}% used` : `· ${window.usedPercent.toFixed(0)}% 実使用`)}`;
  const right = st.dim(en ? `reset in ${formatUntil(window.resetsAt, now, en)}` : `リセットまで ${formatUntil(window.resetsAt, now, en)}`);
  card.line(`  ${joinColumns(left, right, Math.max(50, Math.min(86, options.width + 18)))}`);
  card.line(`        ${st.dim(formatWindowRange(analysis.start, analysis.end))}`);
  const track = renderUsageTrack(analysis.start, analysis.end, options.width, withNight ? options.night : null, analysis.target, analysis.used, !options.plain);
  card.line(`        ${styleTrack(track, st)}`);
  const nowLegend = st.cyan(en ? `● now ${hhmm(now)}` : `● 今 ${hhmm(now)}`);
  const targetLegend = st.dim(en ? `target ${analysis.target.toFixed(1)}%` : `使用目安 ${analysis.target.toFixed(1)}%`);
  const usedLegend = st.yellow(en ? `▲ used ${analysis.used.toFixed(1)}%` : `▲ 実使用 ${analysis.used.toFixed(1)}%`);
  card.line(`        ${nowLegend}   ${targetLegend}   ${usedLegend}`);
  if (withNight) card.line(st.dim(en ? `        ░ night ${options.night.text.replace("-", "–")}` : `        ░ 夜間 ${options.night.text.replace("-", "–")}`));
}

function renderAdvice(card, analysis, now, en, st, weekly) {
  if (analysis.delta > 0.05) card.line(`        ${st.yellow(en ? `▲ +${analysis.delta.toFixed(1)}pt above target` : `▲ 使用目安より +${analysis.delta.toFixed(1)}pt`)}`);
  else if (analysis.delta < -0.05) card.line(`        ${st.green(en ? `● ${(-analysis.delta).toFixed(1)}pt headroom` : `● 使用目安より ${(-analysis.delta).toFixed(1)}pt 余裕`)}`);
  else card.line(`        ${st.green(en ? "● on target" : "● ほぼ使用目安どおり")}`);
  if (analysis.delta > 0.05 && analysis.catchUpAt) {
    card.line(st.dim(en ? `          ↳ back on target ${formatMoment(analysis.catchUpAt, now, en)} if idle` : `          ↳ 使わなければ ${formatMoment(analysis.catchUpAt, now, en)} に使用目安へ戻る`));
  }
  if (weekly && analysis.nextNightEnd && analysis.headroomAtNextNightEnd != null) {
    const h = analysis.headroomAtNextNightEnd, when = formatMoment(analysis.nextNightEnd, now, en);
    card.line(st.dim(en
      ? h >= 0 ? `          ↳ ${h.toFixed(1)}pt headroom at ${when}` : `          ↳ still ${(-h).toFixed(1)}pt ahead at ${when}`
      : h >= 0 ? `          ↳ ${when}時点で ${h.toFixed(1)}pt 分の余裕` : `          ↳ ${when}時点でも ${(-h).toFixed(1)}pt 先行`));
  }
}

function styleTrack(track, st) {
  return [...track].map(ch =>
    ch === "●" ? st.cyan(ch) :
    ch === "▲" ? st.yellow(ch) :
    ch === "◆" ? st.magenta(ch) :
    "━=▓#".includes(ch) ? st.yellow(ch) :
    st.dim(ch)
  ).join("");
}

export function toJson(snapshot, options) {
  const weekly = analyzeWeekly(snapshot.weekly, snapshot.refreshedAt, options.night);
  const five = analyzeWindow(snapshot.fiveHour, snapshot.refreshedAt);
  return {
    refreshedAt: snapshot.refreshedAt.toISOString(),
    weekly: snapshot.weekly ? {
      remainingPercent: clamp(100 - snapshot.weekly.usedPercent, 0, 100),
      usedPercent: snapshot.weekly.usedPercent,
      targetUsedPercent: weekly?.target ?? null,
      deltaPoints: weekly?.delta ?? null,
      resetsAt: snapshot.weekly.resetsAt?.toISOString() ?? null,
      windowStart: weekly?.start?.toISOString() ?? null,
      catchUpAt: weekly?.catchUpAt?.toISOString() ?? null,
      nextNightEnd: weekly?.nextNightEnd?.toISOString() ?? null,
      headroomAtNextNightEndPoints: weekly?.headroomAtNextNightEnd ?? null,
    } : null,
    fiveHour: snapshot.fiveHour ? {
      remainingPercent: clamp(100 - snapshot.fiveHour.usedPercent, 0, 100),
      usedPercent: snapshot.fiveHour.usedPercent,
      targetUsedPercent: five?.target ?? null,
      deltaPoints: five?.delta ?? null,
      resetsAt: snapshot.fiveHour.resetsAt?.toISOString() ?? null,
      windowStart: five?.start?.toISOString() ?? null,
      catchUpAt: five?.catchUpAt?.toISOString() ?? null,
    } : null,
    night: options.night.text,
  };
}

function joinColumns(left, right, width) {
  const raw = s => s.replace(/\x1b\[[0-9;]*m/g, "");
  const spaces = Math.max(2, width - [...raw(left)].length - [...raw(right)].length);
  return left + " ".repeat(spaces) + right;
}
function formatWindowRange(start, end) {
  if (sameDay(start, end)) return `${hhmm(start)} → ${hhmm(end)}`;
  return `${mmdd(start)} ${hhmm(start)} → ${mmdd(end)} ${hhmm(end)}`;
}
function formatUntil(target, now, en) {
  if (!target) return en ? "unknown" : "不明";
  const ms = target - now;
  if (ms <= 0) return en ? "soon" : "まもなく";
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) return en ? `${totalMinutes}m` : `${totalMinutes}分`;
  const h = Math.floor(totalMinutes / 60), m = totalMinutes % 60;
  if (h < 24) return en ? `${h}h ${m}m` : `${h}時間${m ? `${m}分` : ""}`;
  const d = Math.floor(h / 24), rh = h % 24;
  return en ? `${d}d ${rh}h` : `${d}日${rh ? `${rh}時間` : ""}`;
}
function formatMoment(target, now, en) {
  if (sameDay(target, now)) return en ? `today ${hhmm(target)}` : `今日${hhmm(target)}`;
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(target, tomorrow)) return en ? `tomorrow ${hhmm(target)}` : `明日${hhmm(target)}`;
  return `${mmdd(target)} ${hhmm(target)}`;
}
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function formatDateTime(d){return `${mmdd(d)} ${hhmm(d)}`;}
function mmdd(d){return `${pad2(d.getMonth()+1)}/${pad2(d.getDate())}`;}
function hhmm(d){return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;}
function pad2(v){return String(v).padStart(2,"0");}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
