const ESC = "\u001b[";

export function supportsStyle(plain = false) {
  return !plain && Boolean(process.stdout.isTTY) && process.env.TERM !== "dumb" && !process.env.NO_COLOR;
}

export function style(enabled) {
  const paint = (code, text) => enabled ? `${ESC}${code}m${text}${ESC}0m` : text;
  return {
    bold: (t) => paint("1", t),
    dim: (t) => paint("90", t),
    cyan: (t) => paint("1;36", t),
    green: (t) => paint("1;32", t),
    yellow: (t) => paint("1;33", t),
    magenta: (t) => paint("1;35", t),
    red: (t) => paint("1;31", t),
    quota: (t, remaining) =>
      remaining <= 10 ? paint("1;31", t)
      : remaining <= 30 ? paint("1;33", t)
      : remaining <= 60 ? paint("1;36", t)
      : paint("1;32", t),
    badge: (t, updated) => paint(updated ? "1;30;42" : "1;30;46", ` ${t} `),
  };
}

export function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function visibleWidth(text) {
  return [...stripAnsi(text)].reduce((sum, ch) => sum + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);
}

function isWide(v) {
  return v >= 0x1100 && (
    v <= 0x115f ||
    v === 0x2329 || v === 0x232a ||
    (v >= 0x2e80 && v <= 0xa4cf) ||
    (v >= 0xac00 && v <= 0xd7a3) ||
    (v >= 0xf900 && v <= 0xfaff) ||
    (v >= 0xfe10 && v <= 0xfe19) ||
    (v >= 0xfe30 && v <= 0xfe6f) ||
    (v >= 0xff00 && v <= 0xff60) ||
    (v >= 0xffe0 && v <= 0xffe6) ||
    (v >= 0x1f300 && v <= 0x1faff) ||
    (v >= 0x20000 && v <= 0x3fffd)
  );
}

export class Card {
  constructor(innerWidth, st) {
    this.width = Math.max(56, Math.min(92, innerWidth));
    this.st = st;
  }
  top(title) {
    const prefix = "─ ";
    const suffix = " ";
    const fill = Math.max(1, this.width - visibleWidth(prefix) - visibleWidth(title) - visibleWidth(suffix));
    console.log(`${this.st.dim("╭" + prefix)}${this.st.bold(title)}${this.st.dim(suffix + "─".repeat(fill) + "╮")}`);
  }
  line(text = "") {
    const pad = Math.max(0, this.width - visibleWidth(text));
    console.log(`${this.st.dim("│")}${text}${" ".repeat(pad)}${this.st.dim("│")}`);
  }
  bottom() {
    console.log(this.st.dim("╰" + "─".repeat(this.width) + "╯"));
  }
}

export function beginLiveFrame() {
  if (!process.stdout.isTTY) return () => {};
  process.stdout.write("\u001b[?25l\u001b[2J\u001b[H");
  return () => process.stdout.write("\u001b[?25h\n");
}

export function redraw(draw) {
  if (process.stdout.isTTY) process.stdout.write("\u001b[H");
  draw();
  if (process.stdout.isTTY) process.stdout.write("\u001b[J");
}
