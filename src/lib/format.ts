export function fmtBytes(n?: number | null): string {
  if (n == null) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 || v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function fmtDuration(s?: number | null): string {
  if (s == null || !isFinite(s)) return "";
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const dirname = (p: string) => p.slice(0, Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/")));
export const extname = (p: string) => {
  const name = basename(p);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};
export const stem = (p: string) => {
  const name = basename(p);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};
export const joinPath = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, "")}\\${name}`;

/** Parses "83", "1:23", "01:01:23.5" into seconds. Empty or invalid input gives null. */
export function parseTime(str: string): number | null {
  const t = str.trim();
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some((n) => !isFinite(n) || n < 0) || parts.length > 3) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Parses "1-3, 5, 8-" into 0-based page indexes (in the given order, duplicates removed). */
export function parsePageRanges(input: string, total: number): number[] | null {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of input.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d*)\s*(-?)\s*(\d*)$/);
    if (!m || (!m[1] && !m[3])) return null;
    const from = m[1] ? Number(m[1]) : 1;
    const to = m[2] ? (m[3] ? Number(m[3]) : total) : from;
    if (from < 1 || to > total || from > to) return null;
    for (let p = from; p <= to; p++) {
      if (!seen.has(p - 1)) {
        seen.add(p - 1);
        out.push(p - 1);
      }
    }
  }
  return out.length ? out : null;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
