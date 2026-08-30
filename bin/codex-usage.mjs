#!/usr/bin/env node
import process from "node:process";
import { fetchUsage, parseUsageResponse, codexExists } from "../src/codex-client.mjs";
import { parseNight, renderStatus, toJson, pacePercentAt, renderUsageTrack } from "../src/usage.mjs";
import { recordHistory, readHistory, renderHistory } from "../src/history.mjs";
import { beginLiveFrame, redraw, style, supportsStyle } from "../src/ui.mjs";
import { runDoctor } from "../src/doctor.mjs";

const args = process.argv.slice(2);

async function main() {
  let options;
  try { options = parseArgs(args); }
  catch (err) {
    console.error(err.message);
    console.error("Run `codex-usage --help` for usage.");
    return 2;
  }

  if (options.help) { printHelp(options.lang); return 0; }
  if (options.selfTest) return selfTest();
  if (process.platform !== "darwin") {
    console.error("codex-usage-mac is intentionally macOS-only.");
    return 1;
  }
  if (options.command === "doctor") return runDoctor(options);
  if (options.command === "history") {
    renderHistory(readHistory(options.days), options.days, options);
    return 0;
  }

  if (!codexExists()) {
    printMissingCodex(options.lang);
    return 1;
  }

  try {
    if (options.watch) return await watch(options);
    const snapshot = await fetchUsage();
    recordHistory(snapshot);
    if (options.json) console.log(JSON.stringify(toJson(snapshot, options), null, 2));
    else renderStatus(snapshot, options);
    return 0;
  } catch (err) {
    printFetchError(err, options.lang);
    return 1;
  }
}

function parseArgs(argv) {
  const options = {
    command: "status", json: false, plain: false, selfTest: false, help: false,
    watch: null, width: 56, night: parseNight(), days: 7, lang: "ja",
  };
  let commandSet = false;
  for (let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if ((arg==="status"||arg==="history"||arg==="doctor") && !commandSet) { options.command=arg; commandSet=true; continue; }
    if (arg==="--json") {options.json=true;continue;}
    if (arg==="--plain"||arg==="--no-color") {options.plain=true;continue;}
    if (arg==="--self-test") {options.selfTest=true;continue;}
    if (arg==="--help"||arg==="-h") {options.help=true;continue;}
    if (arg==="--en") {options.lang="en";continue;}
    if (arg==="--ja") {options.lang="ja";continue;}
    if (arg==="--lang") {
      const v=argv[++i]; if(!["ja","en"].includes(v)) throw new Error("--lang must be ja or en."); options.lang=v; continue;
    }
    if (arg==="--watch") {
      let sec=60; if(argv[i+1] && /^\d+$/.test(argv[i+1])) sec=Number(argv[++i]);
      options.watch=Math.max(10,Math.min(3600,sec)); continue;
    }
    if (arg==="--width") {
      const v=Number(argv[++i]); if(!Number.isInteger(v)) throw new Error("--width must be an integer from 28 to 72.");
      options.width=Math.max(28,Math.min(72,v));continue;
    }
    if (arg==="--night") { if(!argv[i+1]) throw new Error("--night requires HH:MM-HH:MM."); options.night=parseNight(argv[++i]);continue;}
    if (arg==="--days") {
      const v=Number(argv[++i]); if(!Number.isInteger(v)) throw new Error("--days must be an integer from 1 to 30.");
      options.days=Math.max(1,Math.min(30,v));continue;
    }
    if(arg==="--30d"){options.days=30;continue;}
    throw new Error(`Unknown option: ${arg}`);
  }
  if(options.command==="history" && options.watch) throw new Error("history and --watch cannot be combined.");
  if(options.command==="history" && options.json) throw new Error("history and --json cannot be combined.");
  if(options.json && options.watch) throw new Error("--json and --watch cannot be combined.");
  return options;
}

async function watch(options) {
  let snapshot=await fetchUsage();
  recordHistory(snapshot);
  let next=Date.now()+options.watch*1000;
  let updatedUntil=0;
  const endFrame=beginLiveFrame();
  const st=style(supportsStyle(options.plain));
  const stop=()=>{endFrame();process.exit(0);};
  process.once("SIGINT",stop);
  try {
    while(true){
      if(Date.now()>=next){
        const fresh=await fetchUsage();
        recordHistory(fresh);
        if(changed(snapshot,fresh)) updatedUntil=Date.now()+3000;
        snapshot=fresh; next=Date.now()+options.watch*1000;
      }
      redraw(()=>{
        renderStatus(snapshot,options);
        console.log();
        const updated=Date.now()<updatedUntil;
        const sec=Math.max(0,Math.ceil((next-Date.now())/1000));
        console.log(`  ${st.badge(updated?"UPDATED":"RUNNING",updated)}${st.dim(options.lang==="en"?` next check ${sec}s · source every ${options.watch}s · Ctrl+C to stop`:` 次回確認 ${sec}秒 · ${options.watch}秒周期 · Ctrl+C で終了`)}`);
      });
      await sleep(1000);
    }
  } finally { endFrame(); }
}
function changed(a,b){
  const diff=(x,y)=>!x||!y ? Boolean(x)!==Boolean(y) : Math.abs(x.usedPercent-y.usedPercent)>=0.01 || String(x.resetsAt)!==String(y.resetsAt);
  return diff(a.weekly,b.weekly)||diff(a.fiveHour,b.fiveHour);
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function printMissingCodex(lang){
  console.error(lang==="en"?"Codex CLI was not found.":"Codex CLI が見つかりません。");
  console.error("");
  console.error("Install (official standalone):");
  console.error("  curl -fsSL https://chatgpt.com/codex/install.sh | sh");
  console.error("or Homebrew:");
  console.error("  brew install --cask codex");
  console.error("Then run `codex`, sign in with ChatGPT, and retry `codex-usage`.");
  console.error("Run `codex-usage doctor` for diagnostics.");
}
function printFetchError(err,lang){
  console.error(lang==="en"?`Failed to fetch usage: ${err.message}`:`取得失敗: ${err.message}`);
  console.error("");
  console.error(lang==="en"?"Try:":"確認:");
  console.error("  codex-usage doctor");
  console.error("  codex");
  console.error("If Codex works but this tool cannot find it, set CODEX_CLI=/full/path/to/codex.");
}

function printHelp(lang){
  const en=lang==="en";
  console.log("Codex Usage for Mac");
  console.log(en?"Terminal meter for Codex 5-hour and weekly usage limits.":"Codex の5時間・週次使用枠をMacのTerminalで確認するCLIです。");
  console.log();
  console.log(en?"Usage:":"使い方:");
  console.log("  codex-usage");
  console.log("  codex-usage --watch 60");
  console.log("  codex-usage history --30d");
  console.log("  codex-usage doctor");
  console.log("  codex-usage --json");
  console.log();
  console.log(en?"Options:":"オプション:");
  console.log("  status                 default live snapshot");
  console.log("  history                local usage history / heatmap");
  console.log("  doctor                 diagnose macOS / Node / Codex / login");
  console.log("  --watch [sec]          refresh in place (default 60s, min 10s)");
  console.log("  --days N / --30d       history range (1–30 days)");
  console.log("  --night 00:00-06:00    night band on weekly rail");
  console.log("  --width 56             timeline width (28–72)");
  console.log("  --json                 structured output");
  console.log("  --plain                no ANSI styling / ASCII-friendly rail");
  console.log("  --en / --ja            display language");
  console.log("  --lang en|ja           display language");
  console.log("  --self-test            offline tests");
  console.log();
  console.log("Set CODEX_CLI=/full/path/to/codex to override Codex CLI discovery.");
}

function selfTest(){
  try{
    const start=new Date("2026-08-29T00:00:00+09:00"), end=new Date(start.getTime()+7*86400_000);
    near(pacePercentAt(start,end,new Date(start.getTime()+42*3600_000)),25,0.001,"weekly target");
    const night=parseNight("00:00-06:00");
    if(night.startMinutes!==0||night.endMinutes!==360) throw new Error("night parse");
    const track=renderUsageTrack(start,end,28,night,25,35,true);
    if(!track.includes("●")||!track.includes("▲")||!track.includes("━")) throw new Error("track rendering");
    const reset=Math.floor(end.getTime()/1000);
    const response={result:{rateLimitsByLimitId:{codex:{
      primary:{usedPercent:29,windowDurationMins:300,resetsAt:reset},
      secondary:{usedPercent:35,windowDurationMins:10080,resetsAt:reset}
    }}}};
    const parsed=parseUsageResponse(response,new Date());
    near(parsed.weekly.usedPercent,35,0.001,"weekly parse");
    near(parsed.fiveHour.usedPercent,29,0.001,"5h parse");
    console.log("Self-tests passed.");
    return 0;
  }catch(err){console.error(`Self-test failed: ${err.message}`);return 1;}
}
function near(actual,expected,tol,name){if(Math.abs(actual-expected)>tol) throw new Error(`${name}: expected ${expected}, actual ${actual}`);}

process.exitCode = await main();
