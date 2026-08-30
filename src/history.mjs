import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Card, style, supportsStyle } from "./ui.mjs";

const historyPath = path.join(os.homedir(), "Library", "Application Support", "codex-usage", "history.jsonl");

export function recordHistory(snapshot) {
  const point = {
    recordedAt: snapshot.refreshedAt.toISOString(),
    weeklyUsedPercent: snapshot.weekly?.usedPercent ?? null,
    weeklyResetsAt: snapshot.weekly?.resetsAt?.toISOString() ?? null,
    fiveHourUsedPercent: snapshot.fiveHour?.usedPercent ?? null,
    fiveHourResetsAt: snapshot.fiveHour?.resetsAt?.toISOString() ?? null,
  };
  try {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    const last = readLastPoint();
    if (last && Date.now() - new Date(last.recordedAt).getTime() < 120_000 &&
      near(last.weeklyUsedPercent, point.weeklyUsedPercent) &&
      near(last.fiveHourUsedPercent, point.fiveHourUsedPercent) &&
      last.weeklyResetsAt === point.weeklyResetsAt &&
      last.fiveHourResetsAt === point.fiveHourResetsAt) return;
    fs.appendFileSync(historyPath, JSON.stringify(point) + "\n", "utf8");
  } catch {
    // History is auxiliary; never block live usage.
  }
}

function readLastPoint() {
  if (!fs.existsSync(historyPath)) return null;
  try {
    const lines = fs.readFileSync(historyPath, "utf8").trim().split(/\r?\n/);
    return lines.length ? JSON.parse(lines.at(-1)) : null;
  } catch { return null; }
}
function near(a,b){return a == null && b == null || typeof a === "number" && typeof b === "number" && Math.abs(a-b)<0.01;}

export function readHistory(days) {
  if (!fs.existsSync(historyPath)) return [];
  const since = Date.now() - days * 86400_000;
  const points = [];
  try {
    for (const line of fs.readFileSync(historyPath, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const p = JSON.parse(line);
        if (new Date(p.recordedAt).getTime() >= since) points.push(p);
      } catch {}
    }
  } catch {}
  return points.sort((a,b) => new Date(a.recordedAt) - new Date(b.recordedAt));
}

export function renderHistory(points, days, options) {
  const st = style(supportsStyle(options.plain));
  const card = new Card(Math.max(72, Math.min(92, days * 2 + 24)), st);
  const en = options.lang === "en";
  card.top("Codex usage history");
  card.line(`  ${st.dim(en ? `Last ${days} days · ${points.length} samples` : `直近 ${days}日 · ${points.length} samples`)}`);
  card.line();
  if (points.length < 2) {
    card.line(en ? "  Not enough history yet." : "  履歴がまだ足りません。");
    card.line(st.dim(en ? "  Samples are recorded whenever codex-usage runs." : "  codex-usage 実行時にサンプルを記録します。"));
    card.bottom();
    return;
  }

  const width = Math.max(32, Math.min(64, card.width - 24));
  card.line(`  ${st.bold(en ? "Weekly used" : "週次使用")}   ${st.cyan(spark(points, "weeklyUsedPercent", width))}  ${fmtUsed(lastValue(points,"weeklyUsedPercent"))}`);
  card.line(`  ${st.bold(en ? "5-hour used" : "5時間使用")}  ${st.green(spark(points, "fiveHourUsedPercent", width))}  ${fmtUsed(lastValue(points,"fiveHourUsedPercent"))}`);
  card.line();

  const heat = buildHeatmap(points, days);
  card.line(`  ${st.bold(en ? "Usage by time" : "時間帯別の使用")}  ${st.dim(en ? "weekly quota consumed per 3h" : "3時間ごとの週次消費")}`);
  renderHeat(card, heat, days, st);
  card.line();
  card.line(st.dim(en
    ? "  ? no data   · observed/idle   ░ <1%   ▒ <3%   ▓ <6%   █ ≥6%   ↻ reset"
    : "  ? 未観測   · 観測/使用なし   ░ <1%   ▒ <3%   ▓ <6%   █ ≥6%   ↻ reset"));
  card.bottom();
}

function spark(points, key, cells) {
  const chars = "▁▂▃▄▅▆▇█";
  const first = new Date(points[0].recordedAt).getTime();
  const last = new Date(points.at(-1).recordedAt).getTime();
  const span = Math.max(1, last - first);
  const buckets = Array.from({length: cells}, () => []);
  for (const p of points) {
    if (typeof p[key] !== "number") continue;
    const idx = Math.max(0, Math.min(cells-1, Math.floor((new Date(p.recordedAt).getTime()-first)/span*(cells-1))));
    buckets[idx].push(p[key]);
  }
  let carry = null;
  return buckets.map(b => {
    if (b.length) carry = b.at(-1);
    if (carry == null) return " ";
    return chars[Math.max(0, Math.min(chars.length-1, Math.round(carry/100*(chars.length-1))))];
  }).join("");
}
function lastValue(points,key){for(let i=points.length-1;i>=0;i--) if(typeof points[i][key]==="number") return points[i][key]; return null;}
function fmtUsed(v){return v==null?"—":`${v.toFixed(0)}%`;}

function buildHeatmap(points, days) {
  const usage = Array.from({length:8},()=>Array(days).fill(0));
  const observed = Array.from({length:8},()=>Array(days).fill(0));
  const resets = Array.from({length:8},()=>Array(days).fill(false));
  const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate()-(days-1));
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i], from=new Date(a.recordedAt), to=new Date(b.recordedAt);
    const gap=to-from;
    if(gap<=0 || gap>3*3600_000) continue;
    distribute(from,to,start,days,observed,null,0);
    const ra=a.weeklyResetsAt, rb=b.weeklyResetsAt;
    if(!ra || !rb || typeof a.weeklyUsedPercent!=="number" || typeof b.weeklyUsedPercent!=="number") continue;
    if(ra!==rb){
      const r=new Date(ra);
      if(r>=from && r<=to) markReset(r,start,days,resets);
      continue;
    }
    const delta=b.weeklyUsedPercent-a.weeklyUsedPercent;
    if(delta>0) distribute(from,to,start,days,null,usage,delta);
  }
  return {usage,observed,resets,start};
}
function distribute(from,to,start,days,observed,usage,totalUsage){
  const total=Math.max(1,to-from); let cursor=new Date(from);
  while(cursor<to){
    const block=Math.floor(cursor.getHours()/3);
    const boundary=new Date(cursor); boundary.setHours((block+1)*3,0,0,0);
    const end=boundary<to?boundary:to;
    const ms=Math.max(0,end-cursor);
    const day=Math.floor((dateOnly(cursor)-dateOnly(start))/86400_000);
    if(day>=0&&day<days){
      if(observed) observed[block][day]+=ms/60_000;
      if(usage) usage[block][day]+=totalUsage*ms/total;
    }
    cursor=new Date(end);
  }
}
function markReset(r,start,days,resets){const day=Math.floor((dateOnly(r)-dateOnly(start))/86400_000); if(day>=0&&day<days) resets[Math.floor(r.getHours()/3)][day]=true;}
function dateOnly(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}

function renderHeat(card, heat, days, st){
  const cellWidth=days<=14?3:2;
  let header="          ";
  for(let d=0;d<days;d++){const date=new Date(heat.start);date.setDate(date.getDate()+d);header+=String(date.getDate()).padStart(2,"0")+(cellWidth===3?" ":"");}
  card.line(st.dim(header));
  for(let row=0;row<8;row++){
    let line=`  ${String(row*3).padStart(2,"0")}-${String((row+1)*3).padStart(2,"0")}   `;
    for(let d=0;d<days;d++){
      let ch="?";
      if(heat.resets[row][d]) ch="↻";
      else if(heat.observed[row][d]>0){
        const u=heat.usage[row][d];
        ch=u>=6?"█":u>=3?"▓":u>=1?"▒":u>0?"░":"·";
      }
      line+=ch+(cellWidth===3?"  ":" ");
    }
    card.line(line.trimEnd());
  }
}

export function historyFilePath(){ return historyPath; }
