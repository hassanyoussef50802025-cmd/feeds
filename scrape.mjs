/*
 * RSS من أي موقع — Cloudflare Worker (جافاسكربت خالص، بلا أي مكتبات أو خطوة بناء)
 *
 * الاستخدام بعد النشر:
 *   https://<worker-name>.<account>.workers.dev/?url=<رابط الصفحة>
 * خيارات إضافية:
 *   &title=<عنوان الخلاصة>   عنوان الخلاصة (وإلا يُشتق من الموقع)
 *   &limit=<رقم>             أقصى عدد عناصر (افتراضي 30)
 *   &fresh=1                 تجاوز الذاكرة المؤقتة وإعادة الزحف الآن
 *   &debug=1                 إرجاع JSON بالمقالات المستخرجة بدل RSS (للتجربة)
 * وكل عنصر يحصل على pubDate؛ وإن غاب تاريخ في الصفحة يُقرأ من صفحة الخبر نفسها.
 *
 * يعمل بلا أي واجهة ولا حساب: عند كل طلب يتفحص الصفحة ويعيد خلاصة RSS محدّثة،
 * وذاكرة مؤقتة 10 دقائق تخفّف الضغط. لا صفحة ولا تبويب مفتوح ولا رجوع لأي مكان.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_HTML = 3000000;
const DEFAULT_LIMIT = 30;

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

const IMG_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-echo", "data-lazyload", "data-image", "src"];
const DATE_CLASS = /date|time|published|posted|meta|when|تاريخ|وقت/i;
const SKIP_ZONES = "nav,header,footer,aside,form,select";
const SKIP_TEXT = /^(home|about|contact|login|log ?in|sign ?in|sign ?up|register|search|menu|more|next|previous|prev|subscribe|privacy|terms|advertis\w*|sitemap|rss|facebook|twitter|instagram|youtube|telegram|whatsapp|tiktok|linkedin|share|comments?|tags?|categor\w*|archive|page \d+|cookies?|newsletter|read more|see more|المزيد|اقرأ|الأكثر|الأحدث|الرئيسية|اتصل|تسجيل|دخول|سياسة|شروط|حول|من نحن)$/i;
const SECTION_LABEL = /^(الرئيسية|الأخبار|أخبار|عاجل|رياضة|اقتصاد|سياسة|ثقافة|فن|فنون|علوم|صحة|تكنولوجيا|منوعات|عالم|عربي|محليات|تقارير|تقارير وتحليلات|مقالات|فيديو|صور|الموضوع الرئيسي|المزيد|الأكثر قراءة|الأكثر تداولًا|الأكثر مشاهدة|زوارنا يتصفحون الآن|بث مباشر|مباشر|شارك|تابعنا|home|news|sports|business|opinion|videos|photos|more)$/;
const SECTION_WORD = /^(news|section|category|tag|tags|author|topic|topics|page|pages|last-page|last|about|contact|search|feed|rss|index|archive|home|video|videos|photo|photos|news_egypt|news_arab)$/i;

const AR_DIGIT_MAP = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };

const AR_MONTHS = {
  "يناير": 1, "كانون1": 1, "كانون الثاني": 1, "فبراير": 2, "شباط": 2, "مارس": 3, "آذار": 3, "اذار": 3,
  "أبريل": 4, "ابريل": 4, "نيسان": 4, "مايو": 5, "أيار": 5, "ايار": 5, "يونيو": 6, "حزيران": 6,
  "يوليو": 7, "تموز": 7, "أغسطس": 8, "اغسطس": 8, "آب": 8, "سبتمبر": 9, "أيلول": 9, "ايلول": 9,
  "أكتوبر": 10, "اكتوبر": 10, "تشرين1": 10, "تشرين الأول": 10, "تشرين الاول": 10,
  "نوفمبر": 11, "تشرين2": 11, "تشرين الثاني": 11, "ديسمبر": 12, "كانون2": 12, "كانون الأول": 12, "كانون الاول": 12
};

const AR_MONTHS_HINT = new RegExp("(" + Object.keys(AR_MONTHS).join("|") + ")");

/* Dates remembered from the previous run's XML, keyed by item URL. Items whose page shows no date
   keep the date they already have, instead of being re-stamped with "now" on every run (which made
   readers treat the whole feed as new every 10 minutes). */
let PREV_DATES = new Map();

function xmlUnesc(s) {
  return String(s == null ? "" : s).replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

async function loadPrevDates(fileUrl, readFile) {
  const map = new Map();
  try {
    const xml = await readFile(fileUrl, "utf8");
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const u = (m[1].match(/<link>([^<]*)<\/link>/) || [])[1];
      const d = (m[1].match(/<pubDate>([^<]*)<\/pubDate>/) || [])[1];
      if (u && d) map.set(xmlUnesc(u).trim(), d.trim());
    }
  } catch (e) {}
  return map;
}

const REL_UNITS = {
  "دقيقة": 60000, "دقيقه": 60000, "دقائق": 60000, "دقيقتين": 120000,
  "ساعة": 3600000, "ساعه": 3600000, "ساعات": 3600000, "ساعتين": 7200000,
  "يوم": 86400000, "أيام": 86400000, "ايام": 86400000, "يومين": 172800000,
  "أسبوع": 604800000, "اسبوع": 604800000, "أسابيع": 604800000, "اسبوعين": 1209600000,
  "شهر": 2592000000, "أشهر": 2592000000, "اشهر": 2592000000, "شهرين": 5184000000,
  "سنة": 31536000000, "سنه": 31536000000, "سنوات": 31536000000, "سنتين": 63072000000,
  "minute": 60000, "minutes": 60000, "min": 60000, "mins": 60000, "hour": 3600000, "hours": 3600000,
  "day": 86400000, "days": 86400000, "week": 604800000, "weeks": 604800000,
  "month": 2592000000, "months": 2592000000, "year": 31536000000, "years": 31536000000
};

/* ============================ mini-DOM ============================ */

function decodeEntities(s) {
  if (!s || s.indexOf("&") < 0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, g) => {
    if (g[0] === "#") {
      let cp = NaN;
      try {
        cp = (g[1] === "x" || g[1] === "X") ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      } catch (e) {}
      if (!Number.isFinite(cp)) return m;
      try { return String.fromCodePoint(cp); } catch (e) { return m; }
    }
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", laquo: "«", raquo: "»", copy: "©", reg: "®", deg: "°", middot: "·", bull: "•", euro: "€", pound: "£", times: "×", rlm: "", lrm: "" };
    return named[g] !== undefined ? named[g] : m;
  });
}

function findTagEnd(s, start) {
  let i = start + 1, quote = null;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (quote) { if (ch === quote) quote = null; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return i;
    i++;
  }
  return -1;
}

function parseAttrs(str) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m;
  while ((m = re.exec(str))) {
    const name = m[1].toLowerCase();
    if (name in attrs) continue;
    attrs[name] = decodeEntities(m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : "")));
  }
  return attrs;
}

function mkEl(tag) { return { tagName: tag, attrs: {}, childNodes: [], parentNode: null, order: 0 }; }
function mkText(t) { return { text: t }; }
function isEl(n) { return !!n && typeof n.tagName === "string"; }
function isText(n) { return !!n && typeof n.text === "string"; }

function parseHTML(html) {
  let s = String(html || "");
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
       .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
       .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, " ")
       .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, " ")
       .replace(/<!--[\s\S]*?-->/g, " ");
  if (s.length > MAX_HTML) s = s.slice(0, MAX_HTML);

  const root = mkEl("#root");
  const stack = [root];
  let order = 0;
  let i = 0;
  const n = s.length;

  const addText = (t) => {
    if (!t) return;
    const v = decodeEntities(t).replace(/\s+/g, " ");
    if (!v) return;
    const parent = stack[stack.length - 1];
    const last = parent.childNodes[parent.childNodes.length - 1];
    if (isText(last)) last.text += v;
    else parent.childNodes.push(mkText(v));
  };

  while (i < n) {
    const lt = s.indexOf("<", i);
    if (lt < 0) { addText(s.slice(i)); break; }
    if (lt > i) addText(s.slice(i, lt));
    const nm = s.charAt(lt + 1);
    if (nm === "!" || nm === "?") { const e = s.indexOf(">", lt); i = e < 0 ? n : e + 1; continue; }
    if (nm === "/") {
      const cm = /^<\/\s*([a-zA-Z0-9:_-]+)/.exec(s.slice(lt, lt + 64));
      if (cm) {
        const name = cm[1].toLowerCase();
        for (let k = stack.length - 1; k >= 1; k--) {
          if (stack[k].tagName === name) { stack.length = k; break; }
        }
      }
      const e = s.indexOf(">", lt);
      i = e < 0 ? n : e + 1;
      continue;
    }
    const om = /^<([a-zA-Z][a-zA-Z0-9:_-]*)/.exec(s.slice(lt, lt + 64));
    if (!om) { addText("<"); i = lt + 1; continue; }
    const end = findTagEnd(s, lt);
    if (end < 0) { addText(s.slice(lt)); break; }
    const name = om[1].toLowerCase();
    const el = mkEl(name);
    el.order = order++;
    el.attrs = parseAttrs(s.slice(lt + 1 + name.length, end));
    const selfClose = s.charAt(end - 1) === "/";
    const parent = stack[stack.length - 1];
    el.parentNode = parent;
    parent.childNodes.push(el);
    if (!VOID.has(name) && !selfClose) stack.push(el);
    i = end + 1;
  }
  return root;
}

function childrenOf(el) { return el.childNodes.filter(isEl); }

function textOf(el) {
  if (isText(el)) return el.text;
  if (el._t !== undefined) return el._t;
  let s = "";
  for (const c of el.childNodes) s += isText(c) ? c.text : textOf(c);
  el._t = s;
  return s;
}

function attrOf(el, name) { const v = el.attrs[name]; return v === undefined ? null : v; }

const SEL_CACHE = new Map();
function parseSelector(selector) {
  let cached = SEL_CACHE.get(selector);
  if (cached) return cached;
  const list = selector.split(",").map((part) => {
    const o = { tag: null, id: null, classes: [], attrs: [] };
    let m;
    const tagM = /^\s*([a-zA-Z][\w-]*)/.exec(part);
    if (tagM) o.tag = tagM[1].toLowerCase();
    const idM = /#([\w-]+)/.exec(part);
    if (idM) o.id = idM[1].toLowerCase();
    const re = /\[([\w-]+)(?:([*^$~|]?)=(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\]/g;
    while ((m = re.exec(part))) {
      o.attrs.push({ name: m[1].toLowerCase(), op: m[2] || "exists", val: String(m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : ""))).toLowerCase() });
    }
    const cre = /\.([\w-]+)/g;
    while ((m = cre.exec(part))) o.classes.push(m[1].toLowerCase());
    return o;
  });
  SEL_CACHE.set(selector, list);
  return list;
}

function matchesSimple(el, sel) {
  if (!isEl(el)) return false;
  if (sel.tag && el.tagName !== sel.tag) return false;
  if (sel.id && String(el.attrs.id || "").toLowerCase() !== sel.id) return false;
  if (sel.classes.length) {
    const cls = " " + String(el.attrs.class || "").toLowerCase().split(/\s+/).join(" ") + " ";
    for (const c of sel.classes) if (cls.indexOf(" " + c + " ") < 0) return false;
  }
  for (const a of sel.attrs) {
    if (a.op === "exists") { if (!(a.name in el.attrs)) return false; continue; }
    const v = String(el.attrs[a.name] || "").toLowerCase();
    if (a.op === "=") { if (v !== a.val) return false; }
    else if (a.op === "*=") { if (v.indexOf(a.val) < 0) return false; }
    else if (a.op === "^=") { if (v.indexOf(a.val) !== 0) return false; }
    else if (a.op === "$=") { if (v.length < a.val.length || v.slice(-a.val.length) !== a.val) return false; }
  }
  return true;
}

function matchesSel(el, sels) { for (const s of sels) if (matchesSimple(el, s)) return true; return false; }

function qsa(root, selector) {
  const sels = parseSelector(selector);
  const out = [];
  const walk = (node) => {
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (!isEl(c)) continue;
      if (matchesSel(c, sels)) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

function q1(root, selector) { const r = qsa(root, selector); return r.length ? r[0] : null; }

function closest(el, selector) {
  const sels = parseSelector(selector);
  let n = el;
  while (n && isEl(n)) { if (matchesSel(n, sels)) return n; n = n.parentNode; }
  return null;
}

/* ============================ helpers ============================ */

function absolutize(u, base) {
  if (!u) return null;
  try { const a = new URL(u, base); return /^https?:$/.test(a.protocol) ? a.href : null; } catch (e) { return null; }
}

function normalizeDigits(s) {
  return String(s == null ? "" : s).replace(/[٠-٩۰-۹]/g, (d) => AR_DIGIT_MAP[d] || d);
}

function parseRelative(src) {
  const s = src.toLowerCase();
  if (/(^|[\s(،,.:])(الآن|قبل قليل|قبل لحظات|لحظات|just now|moments ago|ثوان)/.test(s)) return new Date(Date.now() - 60000);
  if (/(^|[\s(،,.:])(أمس|امس|yesterday)/.test(s)) return new Date(Date.now() - 86400000);
  if (/(^|[\s(،,.:])(اليوم|today)/.test(s)) return new Date(Date.now() - 3600000);
  const half = s.match(/نصف\s+(ساعة|ساعه|يوم|شهر|hour|day|month)/);
  if (half && REL_UNITS[half[1]]) return new Date(Date.now() - REL_UNITS[half[1]] / 2);
  let m = s.match(/(\d+)\s*(دقيقة|دقيقه|دقائق|ساعة|ساعه|ساعات|يوم|أيام|ايام|أسبوع|اسبوع|أسابيع|شهر|أشهر|اشهر|سنة|سنه|سنوات|minutes?|mins?|hours?|days?|weeks?|months?|years?)/);
  if (m && REL_UNITS[m[2]]) return new Date(Date.now() - Number(m[1]) * REL_UNITS[m[2]]);
  m = s.match(/(ساعتين|يومين|شهرين|أسبوعين|اسبوعين|سنتين|دقيقتين)/);
  if (m && REL_UNITS[m[1]]) return new Date(Date.now() - REL_UNITS[m[1]]);
  return null;
}

function parseArabicDate(src) {
  const two = src.replace(/تشرين\s+الأول|تشرين\s+الاول/g, "تشرين1")
    .replace(/تشرين\s+الثاني/g, "تشرين2")
    .replace(/كانون\s+الأول|كانون\s+الاول/g, "كانون1")
    .replace(/كانون\s+الثاني/g, "كانون2");
  const tokens = two.split(/[\s،,|/\\()\[\]{}؛;.‏‎\-–—+]+/).filter(Boolean);
  let monIdx = -1, mon = 0;
  for (let i = 0; i < tokens.length; i++) if (AR_MONTHS[tokens[i]]) { monIdx = i; mon = AR_MONTHS[tokens[i]]; break; }
  if (monIdx < 0) return null;
  let day = 0, year = 0, hh = 0, mm = 0, period = "", hasTime = false;
  for (let i = 0; i < monIdx; i++) {
    const tk = tokens[i];
    const tm = tk.match(/^(\d{1,2}):(\d{2})$/);
    if (tm) { hh = +tm[1]; mm = +tm[2]; hasTime = true; continue; }
    if (/^\d{1,4}$/.test(tk)) { const v = +tk; if (tk.length === 4) year = v; else if (v >= 1 && v <= 31) day = v; }
  }
  for (let i = monIdx + 1; i < tokens.length; i++) {
    const tk = tokens[i];
    const tm = tk.match(/^(\d{1,2}):(\d{2})$/);
    if (tm) { hh = +tm[1]; mm = +tm[2]; hasTime = true; continue; }
    if (/^(ص|م|صباحا|صباحًا|مساء|مساءً|am|pm|a\.m\.|p\.m\.)$/i.test(tk)) { period = tk; continue; }
    if (/^\d{4}$/.test(tk)) { if (!year) year = +tk; continue; }
    if (/^\d{1,4}$/.test(tk) && !day) { const v = +tk; if (v >= 1 && v <= 31) day = v; }
  }
  if (!day) day = 1;
  if (!hasTime) hh = 12;
  if (period) {
    if (/^(م|مساء|مساءً|pm|p\.m\.)$/i.test(period) && hh < 12) hh += 12;
    if (/^(ص|صباحا|صباحًا|am|a\.m\.)$/i.test(period) && hh === 12) hh = 0;
  }
  let y = year;
  if (!y) {
    y = new Date().getFullYear();
    if (new Date(y, mon - 1, day, hh, mm).getTime() - Date.now() > 2 * 86400000) y -= 1;
  }
  const d = new Date(y, mon - 1, day, hh, mm);
  return isNaN(d.getTime()) ? null : d;
}

function parseDateText(v) {
  const raw = normalizeDigits(v).replace(/[\u200e\u200f\u061c\u00a0]/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  if (/^\d{10}$/.test(raw)) { const d = new Date(Number(raw) * 1000); return isNaN(d.getTime()) ? null : d; }
  if (/^\d{13}$/.test(raw)) { const d = new Date(Number(raw)); return isNaN(d.getTime()) ? null : d; }
  const rel = parseRelative(raw);
  if (rel) return rel;
  let m = raw.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?/);
  if (m) {
    const hasTime = m[4] !== undefined;
    const d = new Date(+m[1], +m[2] - 1, +m[3], hasTime ? +m[4] : 12, hasTime ? +m[5] : 0);
    if (!isNaN(d.getTime())) return d;
  }
  m = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    const a = +m[1], b = +m[2];
    let day, mon;
    if (a > 12) { day = a; mon = b; } else if (b > 12) { day = b; mon = a; } else { day = a; mon = b; }
    const hasTime = m[4] !== undefined;
    const d = new Date(+m[3], mon - 1, day, hasTime ? +m[4] : 12, hasTime ? +m[5] : 0);
    if (!isNaN(d.getTime())) return d;
  }
  const ar = parseArabicDate(raw);
  if (ar) return ar;
  if (/(\d{1,2}[\s\-/.]?[A-Za-z]{3,9}[\s\-/.,]+\d{2,4})|([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})|GMT|UTC|[+-]\d{4}\b/i.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toRfc822(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : parseDateText(v);
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 1995 || y > 2100) return null;
  return d.toUTCString();
}

function pickDate(el) {
  const t = q1(el, "time[datetime],[datetime],[data-date],[data-time],[data-timestamp]");
  if (t) {
    const v = attrOf(t, "datetime") || attrOf(t, "content") || attrOf(t, "data-date") || attrOf(t, "data-time") || attrOf(t, "data-timestamp") || textOf(t) || "";
    const d = parseDateText(v);
    if (d) return d;
  }
  for (const c of qsa(el, "[class],[itemprop]")) {
    const cls = (attrOf(c, "class") || "") + " " + (attrOf(c, "itemprop") || "");
    if (!DATE_CLASS.test(cls)) continue;
    const s = attrOf(c, "title") || attrOf(c, "content") || textOf(c) || "";
    const d = parseDateText(s);
    if (d) return d;
  }
  for (const e of qsa(el, "[title]")) {
    const d = parseDateText(attrOf(e, "title") || "");
    if (d) return d;
  }
  return parseDateText(textOf(el) || "");
}

function normText(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").replace(/^[•·▪◦*\-–—|]+/, "").trim(); }

/* Cheap signal that a candidate card actually shows a date (used to prefer dated lists). */
function hasDateHint(k) {
  if (q1(k, "time[datetime],[datetime],[data-timestamp],[data-date]")) return true;
  for (const c of qsa(k, "p,span,small,div,li,time")) {
    const sig = (attrOf(c, "class") || "") + " " + (attrOf(c, "itemprop") || "");
    if (!DATE_CLASS.test(sig)) continue;
    const t = textOf(c) || "";
    if (t.length > 60) continue;
    if (/\d/.test(t) && (AR_MONTHS_HINT.test(t) || /\d{1,4}[:/.-]\d/.test(t))) return true;
  }
  return false;
}

function isJunkTitle(t) {
  if (!t || t.length < 8) return true;
  if (SECTION_LABEL.test(t)) return true;
  if (SKIP_TEXT.test(t)) return true;
  if (/^(اقرأ|اقرا|إقرأ|شاهد|تفاصيل|تابع|المزيد|تصفح|عرض)(\s|$)/.test(t) && t.length <= 34) return true;
  if (/^(read|continue reading|see more|view more|full (article|story)|more)\b/i.test(t) && t.length <= 34) return true;
  if (/^[\w\-_.]{1,24}$/.test(t) && t.indexOf(" ") < 0) return true;
  if (/(getty images|reuters|bloomberg|associated press|\bap\b|\bafp\b|photo:|image:|credit|shutterstock)/i.test(t)) return true;
  if (/^(by|بقلم|كتب|تصوير)\s/i.test(t)) return true;
  return false;
}

function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

function articleScore(u) {
  const segs = u.pathname.split("/").filter(Boolean);
  if (!segs.length) return -99;
  const last = segs[segs.length - 1];
  if (SECTION_WORD.test(last)) return -99;
  let s = 0;
  if (/\/20\d{2}\/\d{1,2}\//.test(u.pathname)) s += 4;
  if (/\.(html?|php|aspx?)$/i.test(last)) s += 2;
  if (/\d{4,}/.test(last)) s += 2;
  if (last.indexOf("-") >= 0 && last.length >= 10) s += 2;
  if (last.length >= 30) s += 1;
  if (/^[\u0600-\u06FF\-]+$/.test(decodeURIComponentSafe(last))) s += 1;
  if (/%D8|%D9/i.test(u.pathname)) s += 2;
  if (segs.length >= 2 && last.length >= 8) s += 1;
  if (/^\/(rss|feed|tag|category|author|search|page|wp-|about|contact|privacy|terms)/i.test(u.pathname)) s -= 8;
  return s;
}

function dateFromUrl(u) {
  let m = u.pathname.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); if (!isNaN(d.getTime())) return d.toUTCString(); }
  m = u.pathname.match(/\/(20\d{2})\/(\d{1,2})\/?(?:\/|$)/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, 1); if (!isNaN(d.getTime())) return d.toUTCString(); }
  return null;
}

function decodeSvgImage(u) {
  if (!u || u.indexOf("data:image/svg+xml;base64,") !== 0) return null;
  try {
    const b64 = u.split(",")[1] || "";
    const svg = (typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary"));
    const m = svg.match(/data-u="([^"]+)"/);
    if (m) return decodeURIComponent(m[1].replace(/&amp;/g, "&"));
  } catch (e) {}
  return null;
}

function pickImage(el, base) {
  for (const img of qsa(el, "img,source")) {
    for (const a of IMG_ATTRS) {
      const v = attrOf(img, a);
      if (v && /^https?:/i.test(v)) return absolutize(v, base);
    }
    const ss = attrOf(img, "srcset") || attrOf(img, "data-srcset");
    if (ss) {
      const first = ss.split(",")[0].trim().split(/\s+/)[0];
      if (/^https?:/i.test(first)) return absolutize(first, base);
    }
  }
  for (const e of qsa(el, "[style],[data-bg],[data-background]")) {
    const raw = attrOf(e, "data-bg") || attrOf(e, "data-background") || attrOf(e, "style") || "";
    const m = raw.match(/url\((['"]?)(.*?)\1\)/i);
    if (!m) continue;
    const decoded = decodeSvgImage(m[2]);
    if (decoded) return absolutize(decoded, base);
    if (/^https?:/i.test(m[2])) return absolutize(m[2], base);
  }
  return null;
}

function slugTitle(u) {
  if (!u) return "";
  let last = u.pathname.split("/").filter(Boolean).pop() || "";
  try { last = decodeURIComponent(last); } catch (e) {}
  if (!last) return "";
  let s = last.replace(/\.(html?|php|aspx?|shtml|amp)$/i, "").replace(/[_\-+.]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^[\s\-–—|،,]+|[\s\-–—|،,]+$/g, "").trim();
  if (s.length < 15 || s.length > 200) return "";
  if (!/[\u0600-\u06FFa-zA-Z]/.test(s)) return "";
  const words = s.split(" ").filter(Boolean);
  if (words.length < 3) return "";
  if (/^[\d\s]+$/.test(s)) return "";
  return s;
}

function mainLink(el, base) {
  let best = null, bestScore = -99;
  for (const a of qsa(el, "a[href]")) {
    const href = attrOf(a, "href") || "";
    if (!href || href === "#" || /^(javascript|mailto|tel):/i.test(href)) continue;
    let u;
    try { u = new URL(href, base); } catch (e) { continue; }
    if (u.origin !== base.origin) continue;
    if (u.pathname === base.pathname && !u.search) continue;
    const txt = normText(textOf(a));
    let s = articleScore(u);
    if (s < 0) continue;
    if (txt.length >= 25) s += 3; else if (txt.length >= 12) s += 1;
    if (closest(a, "h1,h2,h3,h4,h5")) s += 4;
    if (closest(a, "figure,picture")) s += 1;
    if (closest(a, "nav,header,footer,aside")) s -= 8;
    if (SKIP_TEXT.test(txt) && txt.length < 28) s -= 6;
    if (s > bestScore) { bestScore = s; best = { a, u, text: txt, score: s }; }
  }
  return bestScore >= 3 ? best : null;
}

function titleFromItem(k, link) {
  const cands = [];
  const h = q1(k, "h1,h2,h3,h4,h5,h6");
  if (h) cands.push(normText(textOf(h)));
  if (h) { const ah = q1(h, "a[href]"); if (ah) cands.push(normText(textOf(ah))); }
  cands.push(normText(attrOf(link.a, "title")));
  cands.push(normText(textOf(link.a)));
  const img = q1(k, "img[alt]");
  if (img) cands.push(normText(attrOf(img, "alt")));
  const slug = slugTitle(link.u);
  if (slug) cands.push(slug);
  for (const t of cands) if (t.length >= 15 && t.length <= 220 && !isJunkTitle(t)) return t;
  for (const t of cands) if (t.length >= 9 && !isJunkTitle(t)) return t;
  const fallback = cands.find((t) => t.length >= 6 && !SKIP_TEXT.test(t));
  return fallback || "";
}

function findItemLists(root, base) {
  const out = [];
  const all = qsa(root, "div,ul,ol,section,article,main,tbody,dl");
  for (const el of all) {
    if (closest(el, SKIP_ZONES)) continue;
    const kids = childrenOf(el);
    if (kids.length < 4 || kids.length > 250) continue;
    let n = 0, withHeading = 0, titleSum = 0;
    let dated = 0;
    const sigs = new Set();
    const picks = [];
    for (const k of kids) {
      const l = mainLink(k, base);
      if (!l) continue;
      const txt = (textOf(k) || "").replace(/\s+/g, " ").trim();
      const slug = txt.length < 15 ? slugTitle(l.u) : "";
      if (txt.length < 15 && slug.length < 15) continue;
      const h = q1(k, "h1,h2,h3,h4,h5");
      if (!h && txt.length < 35 && !slug) continue;
      n++;
      if (h) withHeading++;
      if (hasDateHint(k)) dated++;
      sigs.add(k.tagName + "|" + String(attrOf(k, "class") || "").slice(0, 80));
      titleSum += Math.min((h ? textOf(h) : (l.text || slug)).replace(/\s+/g, " ").trim().length, 140);
      picks.push(k);
    }
    if (n < 4) continue;
    const uniformity = 1 - (sigs.size / n);
    const dateBonus = (dated / n) * 60;
    const score = n * 10 + uniformity * 45 + Math.min(titleSum / n, 100) * 0.4 + withHeading * 1.5 + dateBonus;
    out.push({ el, n, score, picks, dated });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function stripTags(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}

function itemSummary(el, title) {
  let best = "";
  for (const p of qsa(el, "p,div,span,h3,h4")) {
    if (qsa(p, "div,p,article,ul,ol").length) continue;
    const t = (textOf(p) || "").replace(/\s+/g, " ").trim();
    if (t.length < 40 || t.length > 800) continue;
    if (t.indexOf(title) === 0) continue;
    if (t.length > best.length) best = t;
  }
  if (!best) {
    const t = (textOf(el) || "").replace(/\s+/g, " ").trim();
    if (t.length > title.length + 40) best = t.slice(0, 400);
  }
  if (best.length > 450) best = best.slice(0, 450).trim() + "…";
  return best;
}

function itemsFromList(list, base, strict, limit) {
  const items = [];
  const seen = new Set();
  for (const k of list.picks) {
    const l = mainLink(k, base);
    if (!l) continue;
    const url = l.u.href.split("#")[0];
    if (seen.has(url)) continue;
    const title = titleFromItem(k, l);
    if (!title) continue;
    if (strict && articleScore(l.u) < 3) continue;
    seen.add(url);
    items.push({
      url,
      title: title.length > 220 ? title.slice(0, 220).trim() + "…" : title,
      date: toRfc822(pickDate(k)) || dateFromUrl(l.u),
      img: pickImage(k, base),
      desc: itemSummary(k, title)
    });
    if (items.length >= limit) break;
  }
  return items;
}

function itemsScore(items) {
  let s = 0;
  for (const it of items) {
    if (it.title.length >= 25) s += 3; else if (it.title.length >= 15) s += 2; else s += 1;
    if (it.date) s += 2;
    if (it.img) s += 1;
  }
  return s;
}

function extractAllLinks(root, base, limit) {
  const items = [];
  const seen = new Set();
  for (const a of qsa(root, "a[href]")) {
    if (closest(a, SKIP_ZONES)) continue;
    const href = attrOf(a, "href") || "";
    if (!href || href === "#" || /^(javascript|mailto|tel):/i.test(href)) continue;
    let u;
    try { u = new URL(href, base); } catch (e) { continue; }
    if (u.origin !== base.origin) continue;
    if (articleScore(u) < 3) continue;
    const url = u.href.split("#")[0];
    if (seen.has(url)) continue;
    let title = normText(attrOf(a, "title")) || normText(textOf(a));
    if (!title) continue;
    if (title.length < 15 || isJunkTitle(title)) continue;
    seen.add(url);
    const box = closest(a, "article,li,div") || a.parentNode;
    items.push({
      url,
      title: title.length > 220 ? title.slice(0, 220).trim() + "…" : title,
      date: toRfc822(pickDate(box)) || dateFromUrl(u),
      img: pickImage(box, base),
      desc: itemSummary(box, title)
    });
    if (items.length >= limit) break;
  }
  return items;
}

function sortByDate(items) {
  const dated = items.filter((i) => i.date).length;
  if (items.length <= 2 || dated / items.length < 0.7) return items;
  return items.slice().sort((a, b) => {
    const d = (i) => (i.date ? Date.parse(i.date) : 0);
    return d(b) - d(a);
  });
}

function fillMissingDates(items) {
  const known = items.map((i) => (i.date ? Date.parse(i.date) : NaN));
  let approx = 0;
  const gaps = [];
  for (let i = 1; i < known.length; i++) {
    if (isNaN(known[i]) || isNaN(known[i - 1])) continue;
    const g = Math.abs(known[i - 1] - known[i]);
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  let step = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1800000;
  step = Math.min(Math.max(step, 60000), 86400000);
  for (let i = 0; i < items.length; i++) {
    if (!isNaN(known[i])) continue;
    const prevDate = PREV_DATES.get(items[i].url);
    if (prevDate) { items[i].date = prevDate; items[i].carried = true; continue; }
    let prev = -1, next = -1;
    for (let j = i - 1; j >= 0; j--) if (!isNaN(known[j])) { prev = j; break; }
    for (let j = i + 1; j < items.length; j++) if (!isNaN(known[j])) { next = j; break; }
    let t;
    if (prev >= 0) t = known[prev] - step * (i - prev);
    else if (next >= 0) t = known[next] + step * (next - i);
    else t = Date.now() - step * (i + 1);
    items[i].date = new Date(t).toUTCString();
    items[i].approx = true;
    approx++;
  }
  return approx;
}

function extractFromDom(root, pageUrl, limit) {
  const base = new URL(pageUrl);
  const lists = findItemLists(root, base);
  const built = [];
  for (const l of lists.slice(0, 8)) {
    let its = itemsFromList(l, base, true, limit);
    if (its.length < 3) its = itemsFromList(l, base, false, limit);
    if (its.length < 3) continue;
    built.push({ items: its, sc: itemsScore(its) + its.length * 2 });
  }
  built.sort((a, b) => b.sc - a.sc);
  let items = built.length ? built[0].items : [];
  if (built.length > 1) {
    const seen = new Set(items.map((i) => i.url));
    const merged = items.slice();
    for (const b of built.slice(1, 5)) {
      let added = 0;
      for (const it of b.items) {
        if (seen.has(it.url)) continue;
        seen.add(it.url);
        merged.push(it);
        added++;
      }
      if (added === 0 && merged.length >= 12) break;
    }
    if (merged.length >= items.length + 2) items = merged;
  }
  if (items.length < 5) {
    const flat = extractAllLinks(root, base, limit);
    if (flat.length > items.length) items = flat;
  }
  if (items.length < 3) return null;
  const dated = items.filter((i) => i.date).length;
  if (dated && dated < items.length) {
    const withDates = items.filter((i) => i.date);
    const withoutDates = items.filter((i) => !i.date);
    items = withDates.concat(withoutDates);
  }
  items = sortByDate(items.slice(0, limit));
  return { items, missing: items.filter((i) => !i.date).length };
}

function dateNearTitle(root) {
  const h1 = q1(root, "h1") || q1(root, "h2");
  if (!h1) return null;
  const nodes = qsa(root, "time[datetime],[class*=date],[class*=published],[class*=posted],[class*=history],[itemprop*=date]");
  let seen = 0;
  for (const e of nodes) {
    if (seen++ > 40) break;
    if (!(e.order > h1.order)) continue;
    if (closest(e, "nav,header,footer,aside,form,select")) continue;
    const cls = (attrOf(e, "class") || "") + " " + (attrOf(e, "id") || "");
    if (/today|now|current|live|clock|timer|elapsed|share|comment|view|read-?time/i.test(cls)) continue;
    const txt = (attrOf(e, "datetime") || attrOf(e, "content") || textOf(e) || "").replace(/\s+/g, " ").trim();
    if (!txt || /تحديث|آخر تحديث|شروط|حقوق|خصوصية|©|copyright/i.test(txt)) continue;
    const d = parseDateText(txt);
    if (d) return d;
  }
  return null;
}

/* ============================ networking ============================ */

async function fetchText(url, timeout, extraHeaders) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout || 14000);
  try {
    const headers = {
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ar,en-US;q=0.8,en;q=0.6",
      "cache-control": "no-cache",
      "pragma": "no-cache",
      "upgrade-insecure-requests": "1"
    };
    if (extraHeaders) for (const k of Object.keys(extraHeaders)) headers[k] = extraHeaders[k];
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || url, contentType: res.headers.get("content-type") || "", text };
  } catch (e) {
    return { ok: false, status: 0, url, contentType: "", text: "", error: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}

/* ---- fallback sources for sites that block the crawler's own IP (e.g. 403 Cloudflare) ---- */

const PROXY_BUILDERS = [
  [(u) => "https://r.jina.ai/" + u, { "x-respond-with": "html" }],
  [(u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u), {}],
  [(u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u), {}]
];

function looksLikeProxyError(text) {
  const head = String(text || "").slice(0, 400);
  if (head.length > 3000) return false;
  return /"success"\s*:\s*false|Failed to fetch|upstream|Bad Gateway|Not Found/i.test(head);
}

const ALT_UAS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Feedly/1.0 (+http://www.feedly.com/fetcher.html; like FeedFetcher-Google)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
];

let FETCH_DEADLINE = 0;

async function fetchWithFallback(url, timeout) {
  const direct = await fetchText(url, timeout);
  if (direct.ok && direct.text && direct.text.length > 250) return direct;
  const worthProxy = direct.status === 0 || direct.status === 401 || direct.status === 403 ||
    direct.status === 406 || direct.status === 429 || direct.status >= 500;
  if (!worthProxy) return direct;
  if (direct.status === 401 || direct.status === 403 || direct.status === 406) {
    for (const ua of ALT_UAS) {
      try {
        const alt = await fetchText(url, timeout, { "user-agent": ua });
        if (alt.ok && alt.text && alt.text.length > 250) return alt;
      } catch (e) {}
    }
  }
  if (FETCH_DEADLINE && Date.now() > FETCH_DEADLINE) return direct;
  for (const pair of PROXY_BUILDERS) {
    if (FETCH_DEADLINE && Date.now() > FETCH_DEADLINE) break;
    const built = pair[0](url);
    let pr;
    try { pr = await fetchText(built, Math.max(timeout || 15000, 25000), pair[1]); } catch (e) { continue; }
    if (pr.ok && pr.text && pr.text.length > 400 && !looksLikeProxyError(pr.text)) {
      console.log("   مصدر احتياطي نجح: " + new URL(built).host + " → " + url);
      return { ok: true, status: 200, url: url, contentType: pr.contentType || "text/html", text: pr.text, viaProxy: true };
    }
  }
  return direct;
}

async function fetchJson(url, timeout) {
  const attempts = [
    () => fetchText(url, timeout),
    () => fetchText("https://r.jina.ai/" + url, Math.max(timeout || 15000, 20000), { "x-respond-with": "text" }),
    () => fetchText("https://api.allorigins.win/raw?url=" + encodeURIComponent(url), Math.max(timeout || 15000, 20000)),
    () => fetchText("https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(url), Math.max(timeout || 15000, 20000))
  ];
  const list = (FETCH_DEADLINE && Date.now() > FETCH_DEADLINE) ? attempts.slice(0, 1) : attempts;
  for (const attempt of list) {
    let r;
    try { r = await attempt(); } catch (e) { continue; }
    if (!r || !r.text) continue;
    if (r.ok) {
      try { const j = JSON.parse(r.text); if (j && typeof j === "object") return j; } catch (e) {}
      if (/just a moment|cf-browser-verification|attention required|checking your browser|enable javascript/i.test(r.text.slice(0, 3000))) continue;
      return null;
    }
  }
  return null;
}

function looksLikeFeed(text) {
  const head = String(text || "").slice(0, 1000);
  return /<\?xml|<rss[\s>]|<feed[\s>]|<rdf:RDF/i.test(head);
}

function declaredFeedUrls(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rel = (tag.match(/\brel\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
    if (!/\balternate\b/i.test(rel)) continue;
    const type = (tag.match(/\btype\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
    if (!/(rss|atom|feed|\+xml)/i.test(type)) continue;
    const href = (tag.match(/\bhref\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
    if (!href) continue;
    let abs;
    try { abs = new URL(decodeEntities(href), pageUrl).href; } catch (e) { continue; }
    if (!/^https?:/i.test(abs) || seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

async function fetchArticleMeta(url) {
  const r = await fetchWithFallback(url, 12000);
  const html = r.text || "";
  if (!html || html.length < 200) return null;
  const head = html.slice(0, 80000);
  let date = "";
  let m = head.match(/<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|datePublished|pubdate|publish-date|published_time|date)["'][^>]*content=["']([^"']+)["']/i)
    || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["'](?:article:published_time|datePublished|pubdate|publish-date|date)["']/i);
  if (m) date = m[1];
  if (!date) { const ld = head.match(/"datePublished"\s*:\s*"([^"]+)"/i) || head.match(/"dateModified"\s*:\s*"([^"]+)"/i) || head.match(/"uploadDate"\s*:\s*"([^"]+)"/i); if (ld) date = ld[1]; }
  if (!date) { const tm = head.match(/<time[^>]+datetime=["']([^"']+)["']/i); if (tm) date = tm[1]; }
  if (!date) { const dm = head.match(/<meta[^>]+name=["'](?:date|sailthru\.date|DC\.date[^"']*)["'][^>]*content=["']([^"']+)["']/i); if (dm) date = dm[1]; }
  if (!date) { const inPage = dateNearTitle(parseHTML(html)); if (inPage) date = toRfc822(inPage); }
  const og = (re2) => { const x = head.match(re2); return x ? x[1] : null; };
  let img = og(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) || og(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i);
  if (img && /logo|placeholder|avatar|default|sprite|icon\./i.test(img)) img = null;
  const descRaw = og(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i) || og(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i);
  return { date: date ? toRfc822(date) : null, img, desc: descRaw ? stripTags(descRaw) : null };
}

async function backfillItemDates(items, limit) {
  const undated = items.filter((i) => !i.date).slice(0, limit);
  if (!undated.length) return 0;
  let filled = 0;
  const CONC = 4;
  for (let i = 0; i < undated.length; i += CONC) {
    const batch = undated.slice(i, i + CONC);
    const metas = await Promise.all(batch.map((it) => fetchArticleMeta(it.url).catch(() => null)));
    metas.forEach((md, j) => {
      if (!md) return;
      const it = batch[j];
      if (md.date && toRfc822(md.date)) { it.date = toRfc822(md.date); it.realDate = true; filled++; }
      if (!it.img && md.img) { try { it.img = absolutize(md.img, new URL(it.url)); } catch (e) {} }
      if ((!it.desc || it.desc.length < 40) && md.desc) it.desc = String(md.desc).replace(/\s+/g, " ").slice(0, 450);
    });
  }
  return filled;
}

async function tryWordPress(pageUrl) {
  const u = new URL(pageUrl);
  const origin = u.origin;
  const api = origin + "/wp-json/wp/v2";
  const fields = "_fields=link,title,date,excerpt,_links";
  let postsUrl = api + "/posts?per_page=25&" + fields;
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs.length >= 1 && /^[a-z0-9\u0600-\u06FF-]{2,60}$/i.test(segs[0])) {
    const slug = segs[0];
    for (const tax of ["categories", "tags"]) {
      try {
        const arr = await fetchJson(api + "/" + tax + "?slug=" + encodeURIComponent(slug), 12000);
        if (Array.isArray(arr) && arr[0] && arr[0].id) { postsUrl = api + "/posts?per_page=25&" + fields + "&" + tax + "=" + arr[0].id; break; }
      } catch (e) {}
    }
  }
  const posts = await fetchJson(postsUrl, 20000);
  if (!Array.isArray(posts) || posts.length < 2) return null;

  const mediaIds = posts.map((p) => {
    const link = p._links && p._links["wp:featuredmedia"] && p._links["wp:featuredmedia"][0] && p._links["wp:featuredmedia"][0].href;
    const m = link && link.match(/\/media\/(\d+)/);
    return m ? m[1] : null;
  });
  const mediaMap = {};
  const ids = mediaIds.filter(Boolean).slice(0, 25);
  if (ids.length) {
    try {
      const arr = await fetchJson(api + "/media?per_page=50&_fields=id,source_url&include=" + ids.join(","), 15000);
      if (Array.isArray(arr)) arr.forEach((m) => { mediaMap[m.id] = m.source_url; });
    } catch (e) {}
  }
  const items = posts.map((p, i) => ({
    url: p.link,
    title: stripTags(p.title && (p.title.rendered || p.title)),
    date: toRfc822(p.date),
    img: mediaIds[i] ? (mediaMap[mediaIds[i]] || null) : null,
    desc: stripTags(p.excerpt && (p.excerpt.rendered || p.excerpt)).slice(0, 450)
  })).filter((it) => it.url && it.title);
  if (items.length < 2) return null;
  return { items, via: "WordPress REST" };
}

/* ============================ RSS output ============================ */

function xmlEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function cdata(s) { return String(s || "").replace(/]]>/g, "]]&gt;"); }

/* Some pages print local time (e.g. Cairo, +2/+3) with no timezone, so a whole page's dates can
   land in the future; readers then hide those items. If the newest item is in the future, shift
   every date back by the same offset (relative order preserved) so the newest sits just before now. */
function fixFutureDates(items) {
  let maxT = 0;
  for (const it of items) { const t = Date.parse(it.date || ""); if (isFinite(t) && t > maxT) maxT = t; }
  const now = Date.now();
  if (!maxT || maxT <= now + 120000) return 0;
  const delta = maxT - now + 60000;
  for (const it of items) {
    const t = Date.parse(it.date || "");
    if (isFinite(t)) it.date = new Date(t - delta).toUTCString();
  }
  return delta;
}

function buildRssXml(opts) {
  const shifted = fixFutureDates(opts.items || []);
  if (shifted) console.log("   ملاحظة: أُرجعت تواريخ " + (opts.items || []).length + " عنصرًا إلى الوراء بمقدار " + Math.round(shifted / 60000) + " دقيقة (توقيت الموقع كانت متقدّمًا).");
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">');
  L.push('<channel>');
  L.push('<title>' + xmlEsc(opts.title) + '</title>');
  L.push('<link>' + xmlEsc(opts.pageUrl) + '</link>');
  L.push('<description>' + xmlEsc(opts.description || ("خلاصة من " + opts.title)) + '</description>');
  L.push('<language>ar</language>');
  L.push('<lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>');
  L.push('<generator>RSS Worker</generator>');
  L.push('<atom:link href="' + xmlEsc(opts.selfUrl || opts.pageUrl) + '" rel="self" type="application/rss+xml"/>');
  for (const it of opts.items) {
    L.push('<item>');
    L.push('<title>' + xmlEsc(it.title) + '</title>');
    L.push('<link>' + xmlEsc(it.url) + '</link>');
    L.push('<guid isPermaLink="true">' + xmlEsc(it.url) + '</guid>');
    if (it.date) L.push('<pubDate>' + xmlEsc(it.date) + '</pubDate>');
    if (it.img) L.push('<media:thumbnail url="' + xmlEsc(it.img) + '"/>');
    const body = (it.img ? '<img src="' + xmlEsc(it.img) + '" alt=""/>' : "") + (it.desc ? '<p>' + xmlEsc(it.desc) + '</p>' : "");
    if (body) {
      L.push('<description><![CDATA[' + cdata(body) + ']]></description>');
      L.push('<content:encoded><![CDATA[' + cdata(body) + ']]></content:encoded>');
    } else {
      L.push('<description>' + xmlEsc(it.title) + '</description>');
    }
    L.push('</item>');
  }
  L.push('</channel></rss>');
  return L.join("\n");
}

/* ============================ pipeline ============================ */

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || h === "0.0.0.0" || h === "[::1]") return true;
  const m = h.match(/^172\.(\d{1,2})\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  return false;
}

async function buildFeed(targetUrl, selfUrl, params) {
  const limit = Math.max(1, Math.min(60, parseInt(params.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const titleParam = params.get("title") || "";

  const first = await fetchWithFallback(targetUrl, 16000);
  const pageText = (first.ok && first.text) ? first.text : "";
  const finalUrl = (first.ok && first.url) ? first.url : targetUrl;

  // If the URL itself is a feed, pass it through.
  if (looksLikeFeed(pageText) || /(rss|atom)\+xml/i.test(first.contentType)) {
    return { passthrough: pageText, type: /application\/atom/i.test(first.contentType) ? "application/atom+xml" : "application/rss+xml" };
  }

  const base = new URL(finalUrl);

  // Native declared feed? Prefer it (self-updating, complete, real dates).
  const declared = declaredFeedUrls(pageText, finalUrl);
  for (const u of declared.slice(0, 3)) {
    const f = await fetchWithFallback(u, 12000);
    if (f.ok && looksLikeFeed(f.text)) {
      const isAtom = /<feed[\s>]/i.test(f.text.slice(0, 800));
      return { passthrough: f.text, type: isAtom ? "application/atom+xml" : "application/rss+xml" };
    }
  }

  // WordPress REST (cheap, exact dates).
  const wp = await tryWordPress(finalUrl);
  if (wp && wp.items.length >= 3) {
    const items = wp.items.slice(0, limit);
    fillMissingDates(items);
    return {
      items,
      via: wp.via,
      title: titleParam || (base.host + (base.pathname !== "/" ? base.pathname : "")),
      pageUrl: finalUrl
    };
  }

  // Generic DOM extraction.
  const root = parseHTML(pageText);
  let ex = null;
  try { ex = extractFromDom(root, finalUrl, limit); } catch (e) { ex = null; }
  if (ex && ex.items.length >= 3) {
    const items = ex.items.slice(0, limit);
    const backfilled = await backfillItemDates(items, 8);
    const approx = fillMissingDates(items);
    return {
      items,
      via: "استخراج مباشر من الصفحة",
      title: titleParam || (base.host + (base.pathname !== "/" ? base.pathname : "")),
      pageUrl: finalUrl,
      backfilled,
      approx
    };
  }

  // Last resort: probe the address's usual feed locations.
  const common = await probeCommonFeeds(base);
  if (common) return common;

  if (!pageText) {
    return { error: "تعذّر جلب الصفحة (الحالة " + first.status + ")." + (first.error ? " " + first.error : "") };
  }
  return { error: "لم نتمكّن من استخراج مقالات من هذه الصفحة. جرّب رابط قسم معيّن من الموقع (مثل صفحة الأخبار)." };
}

async function probeCommonFeeds(base) {
  const paths = ["/feed/", "/feed", "/rss", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml", "/?feed=rss2"];
  for (const p of paths) {
    let u;
    try { u = new URL(p, base.origin).href; } catch (e) { continue; }
    const f = await fetchWithFallback(u, 12000);
    if (f.ok && f.text && looksLikeFeed(f.text)) {
      const isAtom = /<feed[\s>]/i.test(f.text.slice(0, 800));
      return { passthrough: f.text, type: isAtom ? "application/atom+xml" : "application/rss+xml" };
    }
  }
  return null;
}

/* ============================ HTTP entry ============================ */

function helpPage() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>مولّد RSS التلقائي</title>
<style>body{font-family:system-ui,Segoe UI,Tahoma,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;line-height:1.9}
code,textarea{font-family:ui-monospace,Consolas,monospace}textarea,input{width:100%;padding:.6rem;font-size:1rem;box-sizing:border-box}
button{padding:.65rem 1.1rem;font:inherit;margin-top:.6rem;cursor:pointer}.box{border:1px solid #9996;border-radius:.6rem;padding:1rem;margin:1rem 0}
h1{font-size:1.5rem}label{display:block;margin-top:.8rem;font-weight:700}</style></head><body>
<h1>مولّد RSS التلقائي</h1>
<p>هذه خدمة تعمل من تلقاء نفسها: لا تحتاج هذه الصفحة بعد الآن ولا أي تبويب مفتوح. الصق رابط أي موقع واضغط الزر لتحصل على رابط خلاصة يتحدّث وحده.</p>
<div class="box">
<label for="u">رابط الموقع أو القسم</label>
<input id="u" type="url" placeholder="https://example.com/news" dir="ltr">
<button id="b" type="button">أنشئ الرابط</button>
<p id="o" role="status" aria-live="polite"></p>
</div>
<p>شكل الرابط الناتج: <code dir="ltr">/?url=&lt;عنوان-الموقع&gt;</code> — ويمكنك لصقه مباشرة في أي برنامج خلاصات.</p>
<script>
const base=location.origin+location.pathname;
document.getElementById("b").addEventListener("click",()=>{
  const v=document.getElementById("u").value.trim();
  const o=document.getElementById("o");
  if(!v){o.textContent="اكتب الرابط أولًا.";return;}
  const feed=base+"?url="+encodeURIComponent(v);
  o.textContent="رابط الخلاصة: "+feed;
  const t=document.createElement("textarea");t.value=feed;document.body.appendChild(t);t.select();
});
</script></body></html>`;
}

function errorFeed(message, selfUrl) {
  const xml = buildRssXml({
    title: "تعذّر توليد الخلاصة",
    pageUrl: selfUrl,
    selfUrl,
    description: message,
    items: [{ title: message, url: selfUrl, date: new Date().toUTCString() }]
  });
  return xml;
}

/* =======================================================================
 *  نقطة التشغيل على GitHub (Actions)
 *  - تقرأ قائمة الخلاصات من أداتنا (ملف rss-feeds-list) فتلتقط تلقائيًا
 *    كل موقع تولّده في الأداة، دون تعديل هذا الملف.
 *  - ويمكنك أيضًا إضافة مواقع يدويًا في FEEDS أدناه.
 *  - تكتب النتيجة في مجلد feeds/<name>.xml
 * ======================================================================= */

const LIST_URL = "https://editable.uploads.dev/file/qsswnafa2z/rss-feeds-list";

const FEEDS = [
  { name: "mugtama", url: "https://mugtama.com/", title: "مجتمع" },
  { name: "mobizil", url: "https://www.mobizil.com/", title: "موبيزل" }
];

function sanitizeName(n) {
  return String(n || "").toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function loadFeedList() {
  const byUrl = new Map();
  const add = (name, url, title) => {
    if (!url) return;
    let key;
    try { const u = new URL(url); key = (u.host + u.pathname.replace(/\/$/, "")).toLowerCase(); } catch (e) { key = String(url).toLowerCase(); }
    byUrl.set(key, { name: sanitizeName(name) || ("feed-" + byUrl.size), url, title: title || name });
  };
  for (const f of FEEDS || []) add(f.name, f.url, f.title);

  let fromTool = 0;
  try {
    const obj = await fetchJson(LIST_URL + "?t=" + Date.now(), 15000) || await fetchJson(LIST_URL, 15000);
    const arr = obj ? (Array.isArray(obj) ? obj : (Array.isArray(obj.feeds) ? obj.feeds : null)) : null;
    if (arr) {
      for (const f of arr) { if (f && f.url) { add(f.name, f.url, f.title); fromTool++; } }
    } else {
      console.error("تنبيه: تعذّر قراءة قائمة الأداة (سأعتمد على القائمة المدمجة).");
    }
  } catch (e) {
    console.error("تنبيه: تعذّر قراءة قائمة الأداة — " + (e && e.message ? e.message : e));
  }
  console.log("عدد الخلاصات: " + byUrl.size + " (من الأداة: " + fromTool + ")");
  return { list: [...byUrl.values()], fromTool };
}

async function scrapeWithRetry(url) {
  FETCH_DEADLINE = Date.now() + 150000;
  let out = await buildFeed(url, url, new URLSearchParams()).catch((e) => ({ error: "استثناء: " + (e && e.message ? e.message : String(e)) }));
  if (out && out.error) {
    await new Promise((r) => setTimeout(r, 4000));
    FETCH_DEADLINE = Date.now() + 90000;
    out = await buildFeed(url, url, new URLSearchParams()).catch((e) => ({ error: "استثناء: " + (e && e.message ? e.message : String(e)) }));
  }
  FETCH_DEADLINE = 0;
  return out;
}

async function run() {
  const { mkdir, writeFile, rm, readdir, readFile } = await import("node:fs/promises");
  const root = new URL("./feeds/", import.meta.url);
  await mkdir(root, { recursive: true });
  const { list: feeds, fromTool } = await loadFeedList();
  const written = new Set();
  let ok = 0, fail = 0;
  for (const f of feeds) {
    try {
      PREV_DATES = await loadPrevDates(new URL(f.name + ".xml", root), readFile);
      const out = await scrapeWithRetry(f.url);
      if (out && out.error) {
        console.error("✗ " + f.name + ": " + out.error);
        await writeFile(new URL(f.name + ".error.txt", root), out.error, "utf8");
        written.add(f.name + ".error.txt");
        fail++;
        continue;
      }
      let xml;
      if (out.passthrough) {
        xml = out.passthrough;
      } else {
        const items = out.items || [];
        fillMissingDates(items);
        xml = buildRssXml({
          title: f.title || out.title,
          pageUrl: out.pageUrl || f.url,
          selfUrl: f.url,
          description: "خلاصة تُحدَّث تلقائيًا من " + (f.title || out.title),
          items
        });
      }
      await writeFile(new URL(f.name + ".xml", root), xml, "utf8");
      written.add(f.name + ".xml");
      await rm(new URL(f.name + ".error.txt", root), { force: true });
      console.log("✓ " + f.name + ": " + (out.passthrough ? "خلاصة أصلية" : (out.items ? out.items.length : 0) + " عنصرًا"));
      ok++;
    } catch (e) {
      const msg = "استثناء: " + (e && e.message ? e.message : String(e));
      console.error("✗ " + f.name + ": " + msg);
      try { await writeFile(new URL(f.name + ".error.txt", root), msg, "utf8"); written.add(f.name + ".error.txt"); } catch (e2) {}
      fail++;
    }
  }
  if (fromTool > 0) {
    try {
      const keep = new Set();
      for (const f of feeds) { keep.add(f.name + ".xml"); keep.add(f.name + ".error.txt"); }
      const files = await readdir(root);
      for (const file of files) {
        if (!/\.xml$/.test(file) && !/\.error\.txt$/.test(file)) continue;
        if (keep.has(file) || written.has(file)) continue;
        try {
          await rm(new URL(file, root), { force: true });
          console.log("حذفت ملفًا قديمًا: " + file);
        } catch (e) {}
      }
    } catch (e) {}
  }
  console.log("انتهى: نجحت " + ok + " وفشلت " + fail + ".");
}

run();
