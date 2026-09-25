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
 * نسخة 13: (١) فكّ ترميز الصفحات القديمة (windows-1256 وغيرها) — تُقرأ الصفحة كبايتات ثم تُفكّ
 * بالترميز الصحيح فتظهر العناوين العربية سليمة؛ (٢) تُقدَّم واجهة ووردبريس عندما تكون خلاصة
 * الموقع الأصلية قصيرة جدًا (١٠ عناصر مثلًا)؛ (٣) تجاوز المواقع التي تحجب مراكز البيانات: نكشف
 * صفحات «Human verification»/تحدي كلاودفلير وننتقل إلى الوسائط الاحتياطية، وآخرها وسيط منصّة
 * Perchance نفسه (fetch-plugin) الذي يمرّ من خوادم المنصّة فينجح مع هذه المواقع؛ (٤) مصدر
 * «ريادي» في القائمة المدمجة (feed-riadynews-com-1nw2k).
 *
 * نسخة 14: المواقع التي تحجب مراكز البيانات (كلاودفلير…) كانت تُجمَّد خلاصتها: الجلب المباشر يردّ
 * 403، ثم تُجرَّب الوسائط الاحتياطية واحدةً تلو الأخرى حتى تنتهي مهلة الدورة قبل الوصول إلى الوسيط
 * الذي ينجح فعلًا (هكذا بقيت خلاصة «المركزية» ساعاتٍ بلا تحديث). الآن: (١) تُجرَّب الوسائط كلها في
 * وقت واحد وتُختار أول نتيجة صالحة، ووسيط منصّة Perchance أولها؛ (٢) يُتذكَّر لكل نطاق الوسيط الذي
 * نجح معه فتُستعمل بقية دورة الزحف نفسها (سريع ولا يُثقل الوسائط العامة)؛ (٣) لا تُقبل نتيجة وسيط
 * إن كانت صفحة حجب؛ (٤) محاولة واحدة بهوية Googlebot بدل ثلاث؛ (٥) قراءة الوقت وحده («11:37 AM»)
 * كتاريخ اليوم، فقد كانت عناصر الصفحة الأولى تبقى بلا تاريخ فتتأخّر في الترتيب.
 *
 * نسخة 19 (إصلاح خطير لخلاصة «المركزية»): أرشيف الإنترنت قد لا يزحف موقعًا محجوبًا لشهور، فكانت
 *   «أقرب نسخة» للمركزية من ٢٢ ديسمبر ٢٠٢٥ — وبما أن بطاقات الصفحة تكتب الساعة بلا تاريخ فقد
 *   نُشرت أخبار ديسمبر ٢٠٢٥ بتواريخ «اليوم»! الآن: (١) لا نعتمد التقاطًا أقدم من ٣ أيام مهما كان
 *   (ويُتحقّق من عمر الالتقاط من ترويسة الصفحة المعروضة أو من الطابع الزمني لردّ الحفظ أو من واجهة
 *   الأرشيف)، فإن لم يوجد التقاط حديث نتجاوز الأرشيف إلى بحث أخبار جوجل (تواريخ حقيقية)؛ (٢) تُسقط
 *   الخلاصة العناصر الأقدم من ٤٥ يومًا (أقسام «الأكثر قراءة» ومعارض الصور القديمة)؛ (٣) مقارنة
 *   الروابط تتجاهل البروتوكول وwww والشرطة النهائية (كانت ترفض قوائم طازجة لاختلاف الشرطة)؛
 *   (٤) بحث أخبار جوجل يجرّب كل النوافذ ويختار أطول قائمة طازجة.
 *
 * نسخة 18 (تكملة 17): الخلاصة السابقة التي بُنيت من «بحث أخبار جوجل» كانت تُعامل كمصدر مساوٍ
 *   للاستخراج من الموقع (كلتاهما "dom")، فترفض حماية «لا نُفسد الخلاصة» قائمة الموقع الأصلية لأن
 *   روابطها لا تتقاطع مع روابط جوجل — وتبقى الخلاصة رهينة نتائج جوجل القديمة. الآن: (١) الاستخراج
 *   من صفحة الموقع رتبته أعلى من خلاصة جوجل فتُقبل الترقية؛ (٢) وإن كانت خلاصة سابقة أكثرها روابط
 *   news.google.com فتُعامل كمصدر أدنى حتى لو حملت وسم "dom" من نسخة قديمة.
 *
 * نسخة 17 (إصلاح جذري لمواقع كلاودفلير، مثل mobizil و«المركزية»):
 *   (١) كان الاستخراج يقارن الـorigin حرفيًا، فموقع يُفتح على www.mobizil.com بينما روابط أخباره
 *   mobizil.com/… تُرفض كلها ويعود الاستخراج صفرًا — وهذا وحده كان يُفشل مسار الأرشيف والوسائط.
 *   الآن المقارنة بـ«نفس الموقع» (تجاهل www والنطاقات الفرعية مثل m./amp.).
 *   (٢) مسار «أرشيف الإنترنت» صار مسارًا كاملًا: يُعاد استعمال التقاط حديث (< ٣٠ دقيقة)، وإن غاب
 *   الطابع الزمني في ردّ الحفظ نسأل واجهة الأرشيف عن أقرب نسخة، وإن تعذّرت النسخة الخام نُقرأ النسخة
 *   المعروضة ونُزيل لفّة /web/<ts>/ عن الروابط، ثم يُفحص العنصر مستخرَجًا (عدد + حداثة) قبل النشر.
 *   (٣) عند حجب الصفحة (403) لم نعد نهدر الدقائق في إعادة تجربة الوسائط: نجرّب واجهة WordPress ثم
 *   الأرشيف مباشرة.
 *   (٤) «أبقِ النسخة السابقة» كان يمنع الترقية من خلاصة «بحث أخبار جوجل» إلى قائمة الموقع الأصلية
 *   (لا تقاطع بالروابط إطلاقًا)؛ الآن يُقاس التقاطع بالعناوين أيضًا، وللأرشيف/واجهة REST رتبة أعلى
 *   من خلاصة جوجل فتُقبل الترقية، مع حماية من نشر قائمة أقدم زمنيًا.
 *   (٥) ملف feeds/run-log.txt الجديد يسجّل نتيجة كل خلاصة في كل دورة (المصدر، عدد العناصر، أحدث
 *   تاريخ، سبب الإبقاء على النسخة السابقة) لتشخيص أي توقّف بلا حاجة إلى سجلات Actions.
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
let PREV_XML = "";
let PREV_BUILD = 0;
let PREV_SRC = "";
let PREV_NEWEST = 0;

/* True when the last parsed date came from a relative expression ("منذ 5 دقائق", "today"), i.e. a
   value that is re-computed at every run and must never overwrite a known stable date. */
let LAST_REL = false;

/* v8 — تثبيت ثابت للتواريخ:
   1) PICKED_REL: نحفظ علم "التاريخ نسبي" في لحظة نجاح التحليل داخل pickDate. في v7 كان العلم
      يُقرأ بعد pickDate الذي يجرّب عدة نصوص متتالية، فآخر محاولة (نص البطاقة كاملًا) كانت تصفّره
      حتى لو كان التاريخ المختار نفسه نسبيًا => لا يُثبَّت التاريخ ويعاد ختمه كل دورة.
   2) extractAllLinks (المسار المسطح) كان يبني العناصر بدون حقل relDate إطلاقًا.
   3) حراسة إضافية: أي تاريخ يقع داخل 90 دقيقة من وقت التشغيل يُعدّ نسبيًا ويُؤخذ من التحديث السابق.
   v9: (أ) fixFutureDates كان يزيح كل تواريخ الخلاصة للوراء إذا وُجد عنصر واحد متقدّم (بطاقة ساعتها
       محلية أو "12:00" الافتراضية)، فيتناقص كل تشغيل بمقدار مختلف — وهذا ما جعل تواريخ مجتمع
       تنزل من 04:27 إلى 02:21 ثم 00:27 وهي ثابتة المفروض. الآن يُزاح العنصر المتقدّم وحده،
       والتحريك الجماعي لا يحدث إلا إذا كان معظم الخلاصة متقدّمًا (مشكلة منطقة زمنية حقيقية).
       (ب) افتراضي الساعة لتاريخ بلا وقت صار 00:00 بدل 12:00 (الظهر) فلا يقع في المستقبل صباحًا.
   v10: (1) تاريخ أي عنصر سبق نشره يُثبَّت كما هو ما لم يختلف الجديد عنه بأكثر من 4 ساعات: فروق
        المصدر (توقيت الموقع المحلي مقابل UTC = 3 ساعات، أو قائمة صفحة مختلفة) لم تعد تحرّك تاريخ
        خبر قديم. (2) مسار WordPress REST صار يقرأ date_gmt (الوقت الحقيقي UTC) بدل date (توقيت
        الموقع)، ويتابع بقية الوسطاء إذا ردّ وسيط بنصّ غير JSON بدل أن يستسلم — فصار ينجح في كل
        دورة تقريبًا. (3) الخلاصة لا تُفسد نفسها: إن جاءت دورة بقائمة لا تتقاطع مع ما نُشر سابقًا
        (أقل من 30% من نفس رتبة المصدر) نُعيد نشر النسخة السابقة كما هي، وتُلغى الحماية تلقائيًا
        بعد 6 ساعات. السبب: موقع mobizil يعطي أحيانًا قائمته الكاملة (25 خبرًا بتواريخ) وأحيانًا
        يسقط إلى قائمة جانبية قديمة (صفحات 2023/2024)، فكانت الخلاصة تقفز بين مجموعتين كل 11 دقيقة. */
let PICKED_REL = false;
/* v17: تاريخ «وقت بلا تاريخ» (ساعة الموقع مثل «11:59 AM») — يُثبَّت للعنصر نفسه بين الدورات. */
let LAST_TIME_ONLY = false;
let PICKED_TIME_ONLY = false;

/* Give undated items their date from the previous run's feed, so dates don't churn every cycle.
   v10: العنصر الموجود في التحديث السابق خبرٌ قديم، فتاريخه يجب ألّا يتحرك أبدًا. نُثبّت التاريخ
   السابق متى كان التاريخ الجديد قريبًا منه (أقل من 4 ساعات)، لأن الفروق الصغيرة تأتي من تغيّر
   مصدر القراءة (توقيت الموقع المحلي مقابل UTC، أو قائمة صفحة مختلفة) لا من تغيّر الخبر نفسه.
   وإذا اختلف التاريخ بأكثر من 4 ساعات فهذا تصحيح حقيقي فنأخذ الجديد. */
function applyPrevDates(items) {
  let n = 0, frozen = 0;
  for (const it of items) {
    if (!it || !it.url) continue;
    const prev = PREV_DATES.get(urlKey(it.url));
    if (!prev) continue;
    const t = it.date ? Date.parse(it.date) : NaN;
    const pt = Date.parse(prev);
    const looksLikeNow = !isNaN(t) && Math.abs(Date.now() - t) < 90 * 60000;
    if (!it.date || it.relDate || it.timeOnly || looksLikeNow) { it.date = prev; it.carried = true; it.approx = false; n++; continue; }
    if (isFinite(t) && isFinite(pt) && Math.abs(t - pt) <= 4 * 3600000) {
      it.date = prev; it.carried = true; it.approx = false; frozen++;
    }
  }
  if (n) console.log("   ثبّتنا تواريخ " + n + " عنصرًا من التحديث السابق.");
  if (frozen) console.log("   حافظنا على تاريخ " + frozen + " عنصرًا من التحديث السابق (فرق المصدر أقل من 4 ساعات).");
  return n + frozen;
}

function xmlUnesc(s) {
  return String(s == null ? "" : s).replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

async function loadPrevDates(fileUrl, readFile) {
  const map = new Map();
  let gnewsPrev = 0;
  PREV_XML = "";
  PREV_BUILD = 0;
  PREV_SRC = "";
  PREV_NEWEST = 0;
  try {
    const xml = await readFile(fileUrl, "utf8");
    PREV_NEWEST = 0;
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const u = (m[1].match(/<link>([^<]*)<\/link>/) || [])[1];
      const d = (m[1].match(/<pubDate>([^<]*)<\/pubDate>/) || [])[1];
      if (u && /news\.google\.com/.test(u)) gnewsPrev++;
      if (u && d) map.set(urlKey(xmlUnesc(u)), d.trim());
      const t = d ? Date.parse(d.trim()) : NaN;
      if (isFinite(t) && t > PREV_NEWEST) PREV_NEWEST = t;
    }
    /* v10: نحتفظ بنصّ الخلاصة السابقة كاملًا، فإن جاءت هذه الدورة بقائمة لا تشبهها (مصدر تعذّر
       الوصول إليه، أو قائمة صفحة أخرى) نُعيد نشر النسخة السابقة بدل أن نُفسد الخلاصة. */
    if (map.size) {
      PREV_XML = xml;
      const b = (xml.match(/<lastBuildDate>([^<]*)<\/lastBuildDate>/) || [])[1];
      const t = b ? Date.parse(b) : NaN;
      PREV_BUILD = isFinite(t) ? t : 0;
      const src = xml.match(/<!--\s*rss-src:\s*([a-z]+)\s*-->/);
      PREV_SRC = /<generator>RSS Worker<\/generator>/.test(xml) ? (src ? src[1] : "dom") : "native";
      /* v18: خلاصة سابقة أكثرها روابط «بحث أخبار جوجل» تُعامَل كمصدر أدنى رتبة، فتُقبل الترقية إلى
         قائمة الموقع الأصلية من أول دورة تنجح فيها (النسخ قبل 18 كانت تكتب وسمها "dom" زورًا فتبقى
         الخلاصة رهينة روابط جوجل القديمة). */
      if (PREV_SRC === "dom" && gnewsPrev >= Math.max(2, Math.floor(map.size / 3))) PREV_SRC = "gnews";
    }
  } catch (e) {}
  return map;
}

/* v10: ترتيب جودة المصادر. الخلاصة الأصلية للموقع أفضل شيء، ثم واجهة WordPress (تواريخ دقيقة
   وثابتة)، ثم الاستخراج من الصفحة (يتغيّر بتغيّر نسخة الصفحة). نستخدمه فقط للسماح بالترقية إلى
   مصدر أفضل، ولا يمنع الرجوع لمصدر أردأ. */
/* v17: نسخة الأرشيف مصدر حقيقي من الموقع (روابط أصلية + قوائم الصفحة كاملة)، فهي أعلى رتبة من
   «بحث أخبار جوجل» (روابط جوجل). الرتبة الأعلى تسمح بالترقية دائمًا: خلاصة بُنيت من بحث جوجل
   يُسمح باستبدالها بقائمة الموقع الأصلية. */
const SRC_RANK = { gnews: 1, dom: 2, native: 2, rest: 3, wayback: 3 };

/* v10: هل القائمة التي استخرجناها هذه الدورة تختلف جذريًا عمّا نشرناه سابقًا من نفس المصدر؟
   إن نعم نُبقي النسخة السابقة (انظر run).
   v17: نقيس التقاطع بالروابط وبالعناوين معًا. خلاصة سابقة بُنيت من بحث جوجل تحمل روابط جوجل
   وعناوين أخبار الموقع نفسها، فقائمة الموقع الأصلية لا تتقاطع معها بالروابط إطلاقًا (فكانت
   تُرفض ويعود الموقع إلى خلاصة جوجل القديمة كل دورة). */
function checkInconsistent(items, src) {
  if (!PREV_XML || PREV_DATES.size < 5) return { overlap: 0, bad: false };
  const overlap = items.filter((i) => PREV_DATES.has(urlKey(i.url))).length;
  const prevTitles = new Set();
  for (const m of PREV_XML.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const t = normTitleKey((m[1].match(/<title>([^<]*)<\/title>/) || [])[1]);
    if (t) prevTitles.add(t);
  }
  const titleOverlap = items.filter((i) => prevTitles.has(normTitleKey(i.title))).length;
  if (PREV_BUILD > 0 && Date.now() - PREV_BUILD > 6 * 3600000) return { overlap, titleOverlap, bad: false };
  const better = (SRC_RANK[src] || 1) > (SRC_RANK[PREV_SRC] || 1);
  /* دورة لا تُضيف شيئًا جديدًا وتحذف عناصر (قائمة أصغر كلها موجودة) لا فائدة من نشرها. */
  const subsetOnly = items.length > 0 && items.length < PREV_DATES.size && overlap >= items.length;
  const related = overlap >= Math.max(2, Math.floor(PREV_DATES.size * 0.3)) ||
    titleOverlap >= Math.max(3, Math.floor(items.length * 0.3));
  /* v19: قائمة طازجة من الموقع نفسه تُقبل حتى لو جاءت من قسم آخر في الصفحة (أخبار مقابل مراجعات
     مثلًا). الحماية الآن من «القائمة الأقدم» (انظر run: ضابط التدهور الزمني + إسقاط ما مضى عليه
     ٤٥ يومًا) ومن «قائمة أصغر لا تُضيف جديدًا» (subsetOnly). */
  const newestItems = newestTime(items);
  const freshList = newestItems > 0 && (PREV_NEWEST === 0 || newestItems >= PREV_NEWEST - 12 * 3600000);
  const acceptable = related || (freshList && items.length >= 5);
  const bad = !better && (!acceptable || subsetOnly);
  return { overlap, titleOverlap, bad };
}

/* مفتاح مقارنة العنوان: بلا وسوم/تشكيل ولا لاحقة اسم الموقع. */
function normTitleKey(t) {
  return normText(xmlUnesc(String(t || "")))
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/\s*[-–—|]\s*[^-–—|]{2,40}$/, "")
    .replace(/[^\u0600-\u06FFa-zA-Z0-9 ]+/g, "")
    .replace(/\s+/g, " ").trim().slice(0, 60);
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
  LAST_REL = false;
  const s = src.toLowerCase();
  const done = (d) => { LAST_REL = true; return d; };
  if (/(^|[\s(،,.:])(الآن|قبل قليل|قبل لحظات|لحظات|just now|moments ago|ثوان)/.test(s)) return done(new Date(Date.now() - 60000));
  if (/(^|[\s(،,.:])(أمس|امس|yesterday)/.test(s)) return done(new Date(Date.now() - 86400000));
  if (/(^|[\s(،,.:])(اليوم|today)/.test(s)) return done(new Date(Date.now() - 3600000));
  const half = s.match(/نصف\s+(ساعة|ساعه|يوم|شهر|hour|day|month)/);
  if (half && REL_UNITS[half[1]]) return done(new Date(Date.now() - REL_UNITS[half[1]] / 2));
  let m = s.match(/(\d+)\s*(دقيقة|دقيقه|دقائق|ساعة|ساعه|ساعات|يوم|أيام|ايام|أسبوع|اسبوع|أسابيع|شهر|أشهر|اشهر|سنة|سنه|سنوات|minutes?|mins?|hours?|days?|weeks?|months?|years?)/);
  if (m && REL_UNITS[m[2]]) return done(new Date(Date.now() - Number(m[1]) * REL_UNITS[m[2]]));
  m = s.match(/(ساعتين|يومين|شهرين|أسبوعين|اسبوعين|سنتين|دقيقتين)/);
  if (m && REL_UNITS[m[1]]) return done(new Date(Date.now() - REL_UNITS[m[1]]));
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
  if (!hasTime) hh = 0; /* v9: كان 12 (الظهر) فتقع تواريخ "24 سبتمبر" وحدها في المستقبل وقت تشغيل الصباح، فيزيح fixFutureDates الخلاصة كلها للوراء كل دورة */
  if (period) {
    if (/^(م|مساء|مساءً|pm|p\.m\.)$/i.test(period) && hh < 12) hh += 12;
    if (/^(ص|صباحا|صباحًا|am|a\.m\.)$/i.test(period) && hh === 12) hh = 0;
  }
  let y = year;
  if (!y) {
    y = new Date().getUTCFullYear();
    if (new Date(Date.UTC(y, mon - 1, day, hh, mm)).getTime() - Date.now() > 2 * 86400000) y -= 1;
  }
  const d = new Date(Date.UTC(y, mon - 1, day, hh, mm));
  return isNaN(d.getTime()) ? null : d;
}

function parseDateText(v) {
  LAST_TIME_ONLY = false;
  const raw = normalizeDigits(v).replace(/[\u200e\u200f\u061c\u00a0]/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  if (/^\d{10}$/.test(raw)) { const d = new Date(Number(raw) * 1000); return isNaN(d.getTime()) ? null : d; }
  if (/^\d{13}$/.test(raw)) { const d = new Date(Number(raw)); return isNaN(d.getTime()) ? null : d; }
  const rel = parseRelative(raw);
  if (rel) return rel;
  let m = raw.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?/);
  if (m) {
    const hasTime = m[4] !== undefined;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], hasTime ? +m[4] : 12, hasTime ? +m[5] : 0));
    if (!isNaN(d.getTime())) return d;
  }
  m = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    const a = +m[1], b = +m[2];
    let day, mon;
    if (a > 12) { day = a; mon = b; } else if (b > 12) { day = b; mon = a; } else { day = a; mon = b; }
    const hasTime = m[4] !== undefined;
    const d = new Date(Date.UTC(+m[3], mon - 1, day, hasTime ? +m[4] : 12, hasTime ? +m[5] : 0));
    if (!isNaN(d.getTime())) return d;
  }
  const ar = parseArabicDate(raw);
  if (ar) return ar;
  if (/(\d{1,2}[\s\-/.]?[A-Za-z]{3,9}[\s\-/.,]+\d{2,4})|([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})|GMT|UTC|[+-]\d{4}\b/i.test(raw)) {
    const hasZone = /(?:GMT|UTC|[-+]\d{4})\s*$/i.test(raw);
    const d = new Date(hasZone ? raw : raw + " UTC");
    if (!isNaN(d.getTime())) return d;
  }
  const only = parseTimeOnly(raw);
  if (only) return only;
  return null;
}

/* v14: مواقع كثيرة تكتب وقت الخبر وحده بلا تاريخ («11:37 AM») لأن الخبر من اليوم نفسه؛ وبدون هذا
   كانت عناصر الصفحة الأولى تبقى بلا تاريخ فتُدفع إلى آخر الخلاصة. نعتبرها اليوم بذلك الوقت.
   لو كان وقت الموقع متقدّمًا على ساعة التشغيل (فارق التوقيت) يعالج fixFutureDates الفارق لاحقًا. */
function parseTimeOnly(src) {
  const s = normalizeDigits(src).replace(/[\u200e\u200f\u061c\u00a0]/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s.length > 24) return null;
  const now = new Date();
  const atToday = (hh, mm) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0));
  /* v17: نُعلّم هذا التاريخ بأنه «وقت بلا تاريخ» — موقع يكتب «11:59 AM» يعني ساعة الموقع المحلية،
     وهذا التاريخ (اليوم في ساعة الموقع) يجب أن يبقى ثابتًا للعنصر نفسه بين الدورات كما يفعل
     التاريخ النسبي، وإلّا تحرّك مع كل دورة. */
  const done = (d) => { LAST_TIME_ONLY = true; return d; };
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)$/i);
  if (m) {
    let hh = +m[1];
    const mm = +m[2], ap = m[3].toLowerCase();
    if (hh > 12 || mm > 59) return null;
    if (/^p/.test(ap) && hh < 12) hh += 12;
    if (/^a/.test(ap) && hh === 12) hh = 0;
    return done(atToday(hh, mm));
  }
  m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(ص|م|صباحا|صباحًا|صباحاً|مساء|مساءً|مساءا)$/);
  if (m) {
    let hh = +m[1];
    const mm = +m[2], ap = m[3];
    if (hh > 23 || mm > 59) return null;
    if (/^(م|مساء)/.test(ap) && hh < 12) hh += 12;
    if (/^(ص|صباحا)/.test(ap) && hh === 12) hh = 0;
    return done(atToday(hh, mm));
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
  const take = (v) => { const d = parseDateText(v); if (d) { PICKED_REL = LAST_REL; PICKED_TIME_ONLY = LAST_TIME_ONLY; } return d; };
  const t = q1(el, "time[datetime],[datetime],[data-date],[data-time],[data-timestamp]");
  if (t) {
    const v = attrOf(t, "datetime") || attrOf(t, "content") || attrOf(t, "data-date") || attrOf(t, "data-time") || attrOf(t, "data-timestamp") || textOf(t) || "";
    const d = take(v);
    if (d) return d;
  }
  for (const c of qsa(el, "[class],[itemprop]")) {
    const cls = (attrOf(c, "class") || "") + " " + (attrOf(c, "itemprop") || "");
    if (!DATE_CLASS.test(cls)) continue;
    const s = attrOf(c, "title") || attrOf(c, "content") || textOf(c) || "";
    const d = take(s);
    if (d) return d;
  }
  for (const e of qsa(el, "[title]")) {
    const d = take(attrOf(e, "title") || "");
    if (d) return d;
  }
  return take(textOf(el) || "");
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
  if (m) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (!isNaN(d.getTime())) return d.toUTCString(); }
  m = u.pathname.match(/\/(20\d{2})\/(\d{1,2})\/?(?:\/|$)/);
  if (m) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, 1)); if (!isNaN(d.getTime())) return d.toUTCString(); }
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
    if (!sameSite(u.host, base.host)) continue;
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
    LAST_REL = false;
    const picked = pickDate(k);
    const relDate = !!picked && PICKED_REL;
    const timeOnly = !!picked && PICKED_TIME_ONLY;
    items.push({
      url,
      title: title.length > 220 ? title.slice(0, 220).trim() + "…" : title,
      date: toRfc822(picked) || dateFromUrl(l.u),
      relDate,
      timeOnly,
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
    if (!sameSite(u.host, base.host)) continue;
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
      relDate: PICKED_REL,
      timeOnly: PICKED_TIME_ONLY,
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
    const prevDate = PREV_DATES.get(urlKey(items[i].url));
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
  /* v19: الصفحة قد تحمل أكثر من قسم (أخبار/مراجعات/معارض)، فيتبدّل اختيار القائمة بين الدورات
     فتظهر الخلاصة وكأنها «قائمة أخرى» وتُرفض. نفضّل القائمة التي تتقاطع بوضوح مع ما ننشره. */
  if (PREV_DATES.size >= 5 && built.length > 1) {
    const hit = built.find((b) => {
      const n = b.items.filter((i) => PREV_DATES.has(urlKey(i.url))).length;
      return n >= 3 && n >= Math.floor(b.items.length * 0.3);
    });
    if (hit) items = hit.items;
  }
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

/* ---- الترميز: مواقع عربية قديمة تُصدِّر الصفحة بترميز windows-1256 بدل UTF-8 ---- */

function decodedScore(text) {
  const s = text.length > 120000 ? text.slice(0, 120000) : text;
  let arabic = 0, bad = 0, moji = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0xfffd) bad++;
    else if ((c >= 0x600 && c <= 0x6ff) || (c >= 0x750 && c <= 0x77f) || (c >= 0x8a0 && c <= 0x8ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff)) arabic++;
    else if (c === 0xd8 || c === 0xd9 || c === 0xc3 || c === 0xc2 || c === 0x98 || c === 0x99) moji++;
  }
  return arabic * 2 - bad * 60 - moji * 3;
}

function decodeHtmlBytes(bytes, contentType) {
  let strict = null;
  try {
    strict = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (strict.charCodeAt(0) === 0xfeff) strict = strict.slice(1);
  } catch (e) { strict = null; }
  if (strict !== null && strict.indexOf("\uFFFD") === -1) {
    return { text: strict, score: decodedScore(strict), label: "utf-8" };
  }
  const cands = [];
  const ct = /charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(contentType || "");
  if (ct) cands.push(ct[1]);
  try {
    const sniff = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    let m = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(sniff);
    if (m) cands.push(m[1]);
    m = /<\?xml[^>]+encoding\s*=\s*["']\s*([\w.:-]+)/i.exec(sniff);
    if (m) cands.push(m[1]);
  } catch (e) {}
  cands.push("utf-8", "windows-1256", "iso-8859-6");
  const seen = new Set();
  let best = null;
  for (const rawLabel of cands) {
    const label = String(rawLabel || "").toLowerCase().replace(/["']/g, "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    let text;
    try { text = new TextDecoder(label).decode(bytes); } catch (e) { continue; }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const score = decodedScore(text);
    const repl = (text.match(/\uFFFD/g) || []).length;
    if (!best || repl < best.repl || (repl === best.repl && score > best.score)) best = { text, score, repl, label };
  }
  if (best) return best;
  return { text: new TextDecoder("utf-8").decode(bytes), score: 0, label: "utf-8" };
}

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
    const contentType = res.headers.get("content-type") || "";
    let text = "";
    let encoding = "utf-8";
    try {
      const buf = new Uint8Array(await res.arrayBuffer());
      const dec = decodeHtmlBytes(buf, contentType);
      text = dec.text;
      encoding = dec.label;
    } catch (e) {
      text = await res.text();
    }
    if (encoding !== "utf-8" && /html|xml/i.test(contentType)) {
      console.log("   ترميز الصفحة: " + encoding + " — " + url);
    }
    return { ok: res.ok, status: res.status, url: res.url || url, contentType, encoding, text };
  } catch (e) {
    return { ok: false, status: 0, url, contentType: "", text: "", error: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}


/* v15: تشخيص. سجلّ تشغيل GitHub لا يمكن قراءته إلا لصاحب المستودع، فإذا فشل جلب موقع لا سبيل
   لمعرفة أي وسيط رفضه ولماذا. لذلك نكتب لكل خلاصة تفشل ملف `<name>.diag.txt` فيه نتيجة كل محاولة
   (الحالة، عدد الأحرف، بداية الرد) إضافة إلى ملف الخطأ. يُحذفان بمجرد نجاح دورة. */
let DIAG = [];
let DIAG_DROPPED = 0;
const DIAG_MAX = 70;
function diag(line) {
  if (DIAG.length >= DIAG_MAX) { DIAG_DROPPED++; return; }
  DIAG.push(String(line).slice(0, 240));
}
function diagText(t) { return String(t || "").replace(/\s+/g, " ").slice(0, 90); }
function diagResult(name, r) {
  if (!r) { diag("  - " + name + ": لا رد"); return; }
  diag("  - " + name + ": حالة " + r.status + " / " + (r.text ? r.text.length : 0) + " حرفًا" + (r.error ? " / خطأ: " + r.error : "") + (r.text ? " / «" + diagText(r.text) + "»" : ""));
}

/* v15: الموقع الذي عرفنا كيف نجلبه يُثبَّت مصدره في ملف `feeds/.transport.json` فيُستعمل في الدورات
   التالية مباشرة (وسيط معيّن، أو بحث أخبار جوجل) — فلا تتقلّب الخلاصة بين مجموعتين مختلفتين من
   الروابط كل دورة، ولا يُعاد اختبار الطرق الفاشلة. */
let TRANSPORT = new Map();
let TRANSPORT_START = "";
let LAST_VIA = "";
let LAST_SNAP = null;

function transportRec(host) {
  const v = host ? TRANSPORT.get(host) : null;
  if (!v) return {};
  if (typeof v === "string") return { via: v };
  return v && typeof v === "object" ? v : {};
}

function transportVia(host) {
  return String(transportRec(host).via || "");
}

function diagText2() {
  const body = DIAG.length ? DIAG.join("\n") : "لا محاولات مسجّلة.";
  return body + (DIAG_DROPPED ? "\n(وأُسقط " + DIAG_DROPPED + " سطرًا زائدًا)" : "");
}

async function loadTransport(root, readFile) {
  try {
    const txt = await readFile(new URL(".transport.json", root), "utf8");
    const obj = JSON.parse(txt);
    return (obj && typeof obj === "object" && !Array.isArray(obj)) ? obj : {};
  } catch (e) { return {}; }
}

/* ---- fallback sources for sites that block the crawler's own IP (e.g. 403 Cloudflare) ---- */

/* وسيط منصّة Perchance نفسه (نفس ما تستعمله الأداة في المتصفح عبر superFetch). بعض المواقع تحجب
   كل عناوين مراكز البيانات وتردّ على غيرها بصفحة «Human verification»، فيفشل الجلب المباشر وكل
   الوسائط العامة، بينما يمرّ هذا الوسيط من خوادم المنصّة فينجح. نستعمله كآخر محاولة فقط. */
const PERCHANCE_ORIGIN = "https://aeb47c27fa872c122527f995305d6c1c.perchance.org";
const PERCHANCE_GENERATOR = "qsswnafa2z";

const PROXY_BUILDERS = [
  /* نفس النداء الذي تصنعه الأداة في المتصفح: المتصفح يرسل ترويستي Origin و Referer مع الطلب،
     ويبدو أن خدمة الوسيط تعتمد عليهما، فنرسلهما صراحةً من الخادم أيضًا. */
  [(u) => "https://fetch-plugin.perchance.org/proxy1/" + encodeURIComponent(u) +
    "?origin=" + encodeURIComponent(PERCHANCE_ORIGIN) + "&generator=" + PERCHANCE_GENERATOR,
    { "origin": PERCHANCE_ORIGIN, "referer": PERCHANCE_ORIGIN + "/" }],
  [(u) => "https://fetch-plugin.perchance.org/proxy1/" + encodeURIComponent(u) +
    "?origin=" + encodeURIComponent(PERCHANCE_ORIGIN) + "&generator=" + PERCHANCE_GENERATOR, {}],
  [(u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u), {}],
  [(u) => "https://r.jina.ai/" + u, { "x-respond-with": "html" }],
  [(u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u), {}]
];

/* الوسيط الذي نجح مع نطاق معيّن يُتذكَّر لبقية الدورة: المواقع المحجوبة تُطلب عدة مرات في الدورة
   نفسها (الصفحة + صفحات الأخبار لقراءة التواريخ)، فلا معنى لإعادة تجربة الجلب المباشر الفاشل
   وكل الوسائط في كل مرة. */
const HOST_PROXY = new Map();

function hostOf(url) {
  try { return new URL(url).host; } catch (e) { return ""; }
}

/* v17: المقارنة بنفس «الموقع» لا بنفس الـorigin. كثير من المواقع تفتح على www بينما روابط
   أخبارها بلا www (أو العكس)، فكانت كل الروابط تُرفض ويعود الاستخراج صفرًا — وهذا بالضبط ما
   أفشل مسار «نسخة الأرشيف» لموقع mobizil. */
function siteKey(host) {
  let h = String(host || "").toLowerCase().replace(/\.$/, "");
  if (/^www\d*\./.test(h)) h = h.replace(/^www\d*\./, "");
  return h;
}

function sameSite(a, b) {
  const x = siteKey(a), y = siteKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.endsWith("." + y) || y.endsWith("." + x);
}

/* v19: مفتاح مقارنة الروابط: بلا بروتوكول ولا www ولا شرطة نهائية — فالرابط نفسه يظهر أحيانًا
   معها وأحيانًا بدونها (mobizil مثلًا)، فكان التقاطع يُحسب منخفضًا فتُرفض قائمة طازجة. */
function urlKey(u) {
  return String(u || "").trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();
}

function proxyResult(pr, url, built) {
  if (!pr || !pr.ok || !pr.text || pr.text.length < 400) return null;
  if (looksLikeProxyError(pr.text) || looksLikeBlockPage(pr.text)) return null;
  console.log("   مصدر احتياطي نجح: " + (hostOf(built) || "proxy") + " → " + url);
  return { ok: true, status: 200, url: url, contentType: pr.contentType || "text/html", text: pr.text, viaProxy: true };
}

function looksLikeProxyError(text) {
  const head = String(text || "").slice(0, 400);
  if (head.length > 3000) return false;
  return /"success"\s*:\s*false|Failed to fetch|upstream|Bad Gateway|Not Found/i.test(head);
}

/* صفحات الحجب: بعض المواقع تردّ بحالة 200 لكن بصفحة «Human verification» أو تحدي Cloudflare،
   فيظنّ الجلب أنه نجح. نكشفها لننتقل إلى الوسائط الاحتياطية بدل أن نسقط إلى «لا مقالات». */
function looksLikeBlockPage(text) {
  const head = String(text || "").slice(0, 3000);
  if (!head) return true;
  if (/Human verification|Just a moment|Attention Required|cf-error|Checking your browser|Verifying you are human|Please verify you are a human|Enable JavaScript and cookies|challenge-platform|Access denied|Attention required/i.test(head)) return true;
  if (head.length < 600 && !/<(a|title|h1|h2|body|article)\b/i.test(head)) return true;
  return false;
}

const ALT_UAS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Feedly/1.0 (+http://www.feedly.com/fetcher.html; like FeedFetcher-Google)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
];

let FETCH_DEADLINE = 0;

async function fetchWithFallback(url, timeout) {
  const host = hostOf(url);
  /* نطاق عرفنا أنه محجوب: نستعمل الوسيط الذي نجح معه سابقًا (خلال هذه الدورة أو الدورة السابقة)
     مباشرة، بلا إهدار وقت على جلب مباشر فاشل مسبقًا. */
  let known = -1;
  if (host && HOST_PROXY.has(host)) known = HOST_PROXY.get(host);
  else if (host) {
    const m = transportVia(host).match(/^proxy:(\d+)$/);
    if (m && PROXY_BUILDERS[+m[1]]) known = +m[1];
  }
  if (known >= 0) {
    const pair = PROXY_BUILDERS[known];
    let pr = null;
    try { pr = await fetchText(pair[0](url), Math.max(20000, Math.min(timeout || 15000, 30000)), pair[1]); } catch (e) { diag("وسيط متذكَّر: استثناء " + (e && e.message)); }
    diagResult("وسيط#" + known + " متذكَّر", pr);
    const hit = proxyResult(pr, url, pair[0](url));
    if (hit) { LAST_VIA = "proxy:" + known; return hit; }
    HOST_PROXY.delete(host);
  }
  const direct = await fetchText(url, timeout);
  diag("مباشر " + host + ": حالة " + direct.status + " / " + (direct.text ? direct.text.length : 0) + " حرفًا" + (direct.error ? " / خطأ: " + direct.error : "") + (direct.text ? " / «" + diagText(direct.text) + "»" : ""));
  const blocked = looksLikeBlockPage(direct.text || "");
  if (direct.ok && direct.text && direct.text.length > 250 && !blocked) { LAST_VIA = "direct"; return direct; }
  if (blocked) console.log("   الصفحة ردّت بصفحة حجب — سنجرّب الوسائط الاحتياطية.");
  const worthProxy = !direct.ok || direct.status === 0 || direct.status === 401 || direct.status === 403 ||
    direct.status === 406 || direct.status === 429 || direct.status >= 500 || blocked;
  if (!worthProxy) return direct;
  if (direct.status === 401 || direct.status === 403 || direct.status === 406) {
    try {
      const alt = await fetchText(url, Math.max(8000, Math.min(timeout || 15000, 9000)), { "user-agent": ALT_UAS[0] });
      diagResult("هوية Googlebot", alt);
      if (alt.ok && alt.text && alt.text.length > 250 && !looksLikeBlockPage(alt.text)) { LAST_VIA = "direct"; return alt; }
    } catch (e) {}
  }
  if (FETCH_DEADLINE && Date.now() > FETCH_DEADLINE - 5000) { diag("تجاوزنا مهلة الدورة قبل الوسائط"); return direct; }
  /* كل الوسائط في وقت واحد: الأسرع يفوز، وترتيب PROXY_BUILDERS هو الأولوية عند تساوي السرعة،
     فلا تنتهي المهلة قبل الوصول إلى الوسيط الذي ينجح فعلًا. */
  const budget = FETCH_DEADLINE ? Math.min(45000, Math.max(15000, FETCH_DEADLINE - Date.now())) : 45000;
  const race = PROXY_BUILDERS.map((pair, idx) => {
    const built = pair[0](url);
    return fetchText(built, Math.max(budget, 20000), pair[1])
      .then((pr) => ({ idx, pr, built }))
      .catch(() => ({ idx, pr: null, built }));
  });
  const settled = await Promise.all(race);
  settled.sort((a, b) => a.idx - b.idx);
  for (const r of settled) diagResult("وسيط#" + r.idx, r.pr);
  for (const r of settled) {
    const hit = proxyResult(r.pr, url, r.built);
    if (hit) {
      if (host) HOST_PROXY.set(host, r.idx);
      LAST_VIA = "proxy:" + r.idx;
      return hit;
    }
  }
  return direct;
}

async function fetchJson(url, timeout) {
  const host = hostOf(url);
  const known = host && HOST_PROXY.has(host) ? HOST_PROXY.get(host) : -1;
  const direct = [{ fn: () => fetchText(url, timeout), idx: -1 }];
  const viaProxies = PROXY_BUILDERS.map((pair, idx) => ({ fn: () => fetchText(pair[0](url), Math.max(timeout || 15000, 20000), pair[1]), idx }));
  const attempts = [
    ...(known >= 0 ? [viaProxies[known]] : []),
    ...direct,
    ...viaProxies
  ];
  const list = (FETCH_DEADLINE && Date.now() > FETCH_DEADLINE) ? attempts.slice(0, 1) : attempts;
  for (const attempt of list) {
    if (FETCH_DEADLINE && Date.now() > FETCH_DEADLINE) break;
    let r;
    try { r = await attempt.fn(); } catch (e) { diag("JSON عبر " + (attempt.idx >= 0 ? "وسيط#" + attempt.idx : "مباشر") + ": استثناء " + (e && e.message)); continue; }
    diagResult("JSON " + (attempt.idx >= 0 ? "وسيط#" + attempt.idx : "مباشر"), r);
    if (!r || !r.text) continue;
    if (r.ok) {
      try {
        const j = JSON.parse(r.text);
        if (j && typeof j === "object") {
          if (attempt.idx >= 0 && host) HOST_PROXY.set(host, attempt.idx);
          return j;
        }
      } catch (e) {}
      if (/just a moment|cf-browser-verification|attention required|checking your browser|enable javascript/i.test(r.text.slice(0, 3000))) continue;
      /* v10: ردّ سليم لكن ليس JSON (مثلاً نسخة r.jina.ai النصّية) كان يُنهي كل المحاولات فورًا،
         فيسقط مسار WordPress REST إلى الاستخراج من الصفحة رغم أن وسيطًا آخر كان سينجح. الآن نُجرّب الباقي. */
      continue;
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
  const undated = items.filter((i) => !i.date && !PREV_DATES.get(i.url)).slice(0, limit);
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

async function tryWordPress(pageUrl, timeout) {
  const tmo = timeout || 20000;
  const u = new URL(pageUrl);
  const origin = u.origin;
  const api = origin + "/wp-json/wp/v2";
  const fields = "_fields=link,title,date,date_gmt,excerpt,_links";
  let postsUrl = api + "/posts?per_page=25&" + fields;
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs.length >= 1 && /^[a-z0-9\u0600-\u06FF-]{2,60}$/i.test(segs[0])) {
    const slug = segs[0];
    for (const tax of ["categories", "tags"]) {
      try {
        const arr = await fetchJson(api + "/" + tax + "?slug=" + encodeURIComponent(slug), Math.min(tmo, 12000));
        if (Array.isArray(arr) && arr[0] && arr[0].id) { postsUrl = api + "/posts?per_page=25&" + fields + "&" + tax + "=" + arr[0].id; break; }
      } catch (e) {}
    }
  }
  const posts = await fetchJson(postsUrl, tmo);
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
      const arr = await fetchJson(api + "/media?per_page=50&_fields=id,source_url&include=" + ids.join(","), Math.min(tmo, 15000));
      if (Array.isArray(arr)) arr.forEach((m) => { mediaMap[m.id] = m.source_url; });
    } catch (e) {}
  }
  const items = posts.map((p, i) => ({
    url: p.link,
    title: stripTags(p.title && (p.title.rendered || p.title)),
    date: (p.date_gmt ? toRfc822(new Date(p.date_gmt + "Z")) : null) || toRfc822(p.date),
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

/* Some pages print local time (e.g. Beirut, +3) with no timezone, so a whole page's dates can land
   in the future; readers then hide those items. v17:
   - إن كان الفارق بين أحدث تاريخ وساعة التشغيل يساوي ساعات كاملة (فارق منطقة زمنية للموقع) نُزيح كل
     العناصر الجديدة بالمقدار نفسه، فيبقى الترتيب صحيحًا وتُصحَّح الساعة لكل العناصر، بدل إرجاع
     البطاقات المتقدّمة وحدها (كان ذلك يخلط ترتيب آخر ساعة).
   - لا نُحرّك عنصرًا نُشر في دورة سابقة (it.carried): تواريخ الخلاصة تبقى ثابتة فلا تظهر الأخبار
     القديمة كأنها جديدة كل ٢٠ دقيقة. */
function fixFutureDates(items) {
  const now = Date.now();
  const times = items.map((it) => Date.parse(it.date || "")).filter((t) => isFinite(t));
  if (!times.length) return 0;
  const future = times.filter((t) => t > now + 120000);
  if (!future.length) return 0;
  const delta = Math.max(...times) - now + 60000;
  const hours = Math.round(delta / 3600000);
  const tzShift = future.length >= 2 && hours >= 1 && hours <= 11 && Math.abs(delta - hours * 3600000) < 45 * 60000;
  const shift = tzShift ? hours * 3600000 : delta;
  let n = 0;
  for (const it of items) {
    if (it.carried) continue;
    const t = Date.parse(it.date || "");
    if (!isFinite(t)) continue;
    const hit = tzShift ? t > now - 72 * 3600000 : t > now + 120000;
    if (!hit) continue;
    it.date = new Date(t - shift).toUTCString();
    it.approx = true;
    n++;
  }
  if (n) {
    console.log("   ملاحظة: أُرجعت " + n + " تواريخ متقدّمة إلى الوراء" +
      (tzShift ? " (" + hours + " ساعات — ساعة الموقع المحلية)" : " (ساعة الموقع)") + " دون تحريك ما نُشر سابقًا.");
  }
  return 0;
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
  L.push('<!-- rss-src: ' + (opts.src || "dom") + ' -->');
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

function feedTitle(base, titleParam) {
  return titleParam || (base.host + (base.pathname !== "/" ? base.pathname : ""));
}

function wpFeed(wp, limit, title, finalUrl) {
  const items = wp.items.slice(0, limit);
  applyPrevDates(items);
  fillMissingDates(items);
  return { items, via: wp.via, title, pageUrl: finalUrl };
}

/* استخراج DOM من نصّ صفحة. لا يعمل على صفحة حجب، ولهذا لا يُستدعى إلا على صفحة حقيقية. */
function domFeed(text, pageUrl, limit, title) {
  let ex = null;
  try { ex = extractFromDom(parseHTML(text), pageUrl, limit); } catch (e) { ex = null; }
  if (!ex || ex.items.length < 3) return null;
  const items = ex.items.slice(0, limit);
  applyPrevDates(items);
  const approx = fillMissingDates(items);
  return { items, via: "استخراج مباشر من الصفحة", title, pageUrl, approx };
}

async function buildFeed(targetUrl, selfUrl, params) {
  const limit = Math.max(1, Math.min(60, parseInt(params.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const titleParam = params.get("title") || "";
  const host = (() => { try { return new URL(targetUrl).host; } catch (e) { return ""; } })();

  const first = await fetchWithFallback(targetUrl, 16000);
  const pageText = (first.ok && first.text) ? first.text : "";
  const finalUrl = (first.ok && first.url) ? first.url : targetUrl;

  // If the URL itself is a feed, pass it through.
  if (looksLikeFeed(pageText) || /(rss|atom)\+xml/i.test(first.contentType)) {
    return { passthrough: pageText, type: /application\/atom/i.test(first.contentType) ? "application/atom+xml" : "application/rss+xml" };
  }

  const base = new URL(finalUrl);
  const title = feedTitle(base, titleParam);
  /* v17: هل وصلت الصفحة نفسها؟ (أحد الوسائط نجح) أم أن الموقع حجبنا كلنا؟ الفرق مهم: استخراج DOM
     من صفحة حجب لا ينفع، وإعادة تجربة الوسائط على كل مسار مضيعة للدقائق داخل دورة قصيرة. */
  const pageOk = !!(pageText && pageText.length > 250 && !looksLikeBlockPage(pageText));

  /* ---------- (١) الصفحة وصلت: نجرب من الأفضل إلى الأردأ ---------- */
  if (pageOk) {
    // خلاصة الموقع الأصلية، إن كانت معلنة في الصفحة وكاملة (١٥ عنصرًا أو أكثر).
    let native = null;
    const declared = declaredFeedUrls(pageText, finalUrl);
    for (const u of declared.slice(0, 3)) {
      const f = await fetchWithFallback(u, 12000);
      if (f.ok && looksLikeFeed(f.text)) {
        const isAtom = /<feed[\s>]/i.test(f.text.slice(0, 800));
        const count = (f.text.match(/<item[\s>]/g) || []).length + (f.text.match(/<entry[\s>]/g) || []).length;
        if (count >= 15) {
          return { passthrough: f.text, type: isAtom ? "application/atom+xml" : "application/rss+xml" };
        }
        native = { xml: f.text, atom: isAtom, count };
        break;
      }
    }

    // واجهة WordPress REST: تواريخ دقيقة وروابط أصلية.
    const wp = await tryWordPress(finalUrl, 20000);
    if (wp && wp.items.length >= 3 && (!native || wp.items.length > native.count + 5)) {
      return wpFeed(wp, limit, title, finalUrl);
    }

    if (native) return { passthrough: native.xml, type: native.atom ? "application/atom+xml" : "application/rss+xml" };

    const dom = domFeed(pageText, finalUrl, limit, title);
    if (dom) {
      dom.backfilled = await backfillItemDates(dom.items, 8);
      return dom;
    }

    const common = await probeCommonFeeds(base, 12000);
    if (common) return common;
  } else {
    /* ---------- (٢) الصفحة محجوبة/غير متاحة ---------- */
    diag("الصفحة غير متاحة (" + (first.status || "؟") + ") — المسار: WordPress ثم أرشيف الإنترنت.");
    /* واجهة WordPress تعمل غالبًا حتى مع حجب الصفحة، وتُعطي تواريخ دقيقة وروابط أصلية. */
    const wp = await tryWordPress(finalUrl, 9000);
    if (wp && wp.items.length >= 3) return wpFeed(wp, limit, title, finalUrl);
    const arch = await archiveItems(finalUrl || targetUrl, host, limit, title);
    if (arch) return arch;
  }

  /* (٣) الصفحة وصلت لكن بلا قوائم، أو حُجبت وكل ما سبق فشل: نجرب الأرشيف ثم بحث أخبار جوجل. */
  if (pageOk) {
    const arch = await archiveItems(finalUrl || targetUrl, host, limit, title);
    if (arch) return arch;
  }
  const gnews = await googleNewsFallback(host, limit);
  if (gnews) return gnews;

  if (!pageText) {
    return { error: "تعذّر جلب الصفحة (الحالة " + first.status + ")." + (first.error ? " " + first.error : "") };
  }
  return { error: "لم نتمكّن من استخراج مقالات من هذه الصفحة. جرّب رابط قسم معيّن من الموقع (مثل صفحة الأخبار)." };
}

/* v17: «أرشيف الإنترنت» وسيلة جلب طازجة للمواقع المحجوبة: Save Page Now يزحف الصفحة في اللحظة
   من عناوين الأرشيف المسموح لها (كلاودفلير تسمح لأرشيف الإنترنت)، ثم نقرأ نسخته الخام (id_) فيبقى
   HTML أصليًا بروابط أصلية. نحترم الخدمة: إن كان لدينا التقاط أحدث من ٣٠ دقيقة نستعمله بدل طلب
   التقاط جديد. وإن لم نجد طابع زمني في ردّ الحفظ نسأل واجهة الأرشيف عن أقرب نسخة، وإن لم تُقرأ
   النسخة الخام نقرأ النسخة المعروضة ونُزيل لفّتها (/web/<ts>/) عن الروابط. */
const WB_REUSE_MS = 30 * 60000;
/* v19: عمر أقصى للالتقاط الذي نقبله. هذا أهم ضابط في النسخة: أرشيف الإنترنت قد لا يزحف موقعًا
   محجوبًا لشهور، فيكون «أقرب نسخة» له من سنة 2025 — ولو نشرنا تلك الصفحة لظهرت أخبارها القديمة
   بتواريخ «اليوم» (لأن بطاقاتها تكتب الساعة بلا تاريخ) وهذا أسوأ من ألّا ننشر شيئًا. */
const MAX_CAPTURE_AGE = 3 * 86400000;

function ts14Now() { return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14); }

function ts14ToMs(ts) {
  const m = String(ts || "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return 0;
  const t = Date.parse(m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + m[6] + "Z");
  return isFinite(t) ? t : 0;
}

function isRecentCapture(ts) {
  const t = ts14ToMs(ts);
  return !!t && (Date.now() - t) < MAX_CAPTURE_AGE;
}

function stripWaybackUrl(u) {
  return String(u || "").replace(/^(?:https?:)?\/\/web\.archive\.org\/web\/[0-9]{4,14}[a-z_]*\//, "");
}

/* النسخة المعروضة من الأرشيف تُعيد كتابة كل رابط إلى /web/<ts>/<الرابط الأصلي>، فنُزيل اللفّة قبل
   الاستخراج حتى يعمل فحص «نفس الموقع» وتخرج الروابط أصلية. */
function unwrapWayback(html) {
  return String(html || "")
    .replace(/(["'(])(?:https?:)?\/\/web\.archive\.org\/web\/[0-9]{4,14}[a-z_]*\//g, "$1")
    .replace(/(["'(])\/web\/[0-9]{4,14}[a-z_]*\//g, "$1");
}

async function waybackPage(pageUrl, host) {
  if (!pageUrl) return null;
  const rec = transportRec(host);
  if (rec.snap && rec.snapTs && (Date.now() - rec.snapTs < WB_REUSE_MS)) {
    const f = await fetchWithFallback(rec.snap, 20000);
    const good = f && f.ok && f.text && f.text.length > 2000 && !looksLikeBlockPage(f.text);
    diag("نسخة أرشيف حديثة أُعيد استخدامها: " + (f ? f.status + " / " + (f.text ? f.text.length : 0) + " حرفًا" : "لا رد") + (good ? "" : " (غير صالحة)"));
    if (good) return { text: f.text, snap: rec.snap, ts: rec.snapTs };
  }
  /* Save Page Now: نأخذ **أحدث** طابع زمني في الردّ — الردّ يذكر أيضًا تقاطعات قديمة للموقع. */
  const save = await fetchWithFallback("https://web.archive.org/save/" + pageUrl, 30000);
  let ts = "";
  if (save && save.text) {
    for (const m of save.text.matchAll(/\/web\/(\d{14})[a-z_]*\//g)) if (m[1] > ts) ts = m[1];
  }
  diag("أرشيف الإنترنت (التقاط): " + (save ? save.status + " / " + (save.text ? save.text.length : 0) + " حرفًا" : "لا رد") + (ts ? " / " + ts : ""));
  const cands = [];
  if (isRecentCapture(ts)) cands.push({ ts: ts, how: "التقاط جديد" });
  if (!cands.length) {
    try {
      const av = await fetchJson("https://archive.org/wayback/available?url=" + encodeURIComponent(pageUrl) + "&timestamp=" + ts14Now(), 15000);
      const snap = av && av.archived_snapshots && av.archived_snapshots.closest;
      const tsAv = snap && snap.available ? String(snap.timestamp || "") : "";
      diag("أقرب نسخة من واجهة الأرشيف: " + (tsAv || "لا شيء"));
      if (isRecentCapture(tsAv)) cands.push({ ts: tsAv, how: "أقرب نسخة" });
    } catch (e) {}
  }
  for (const c of cands) {
    const url = "https://web.archive.org/web/" + c.ts + "id_/" + pageUrl;
    const f = await fetchWithFallback(url, 25000);
    const good = f && f.ok && f.text && f.text.length > 2000 && !looksLikeBlockPage(f.text);
    diag("نسخة الأرشيف (" + c.how + " " + c.ts + "): " + (f ? f.status + " / " + (f.text ? f.text.length : 0) + " حرفًا" : "لا رد") + (good ? "" : " (غير صالحة)"));
    if (good) return { text: f.text, snap: url, ts: Date.now() };
  }
  /* لا طابع زمني موثوق: نقرأ النسخة المعروضة (تظهر فيها ساعة الالتقاط في ترويستها) ونتحقّق من عمرها. */
  const plainUrl = "https://web.archive.org/web/" + ts14Now() + "/" + pageUrl;
  const p = await fetchWithFallback(plainUrl, 25000);
  let tsPlain = "";
  if (p && p.text) { const m = p.text.match(/\/web\/(\d{14})[a-z_]*\//); if (m) tsPlain = m[1]; }
  const pGood = p && p.ok && p.text && p.text.length > 2000 && !looksLikeBlockPage(p.text);
  diag("نسخة الأرشيف (معروضة): " + (p ? p.status + " / " + (p.text ? p.text.length : 0) + " حرفًا" : "لا رد") + (tsPlain ? " / التقاط " + tsPlain : "") + (pGood && isRecentCapture(tsPlain) ? "" : " (غير صالحة أو قديمة)"));
  if (pGood && isRecentCapture(tsPlain)) return { text: unwrapWayback(p.text), snap: plainUrl, ts: Date.now() };
  if (pGood) diag("أرشيف الإنترنت: أحدث التقاط متاح أقدم من " + Math.round(MAX_CAPTURE_AGE / 86400000) + " أيام — لا نعتمده (وإلا نشرنا أخبارًا قديمة بتواريخ اليوم).");
  return null;
}

/* v17: مسار الأرشيف كاملًا: نجلب نسخة الأرشيف ثم نستخرج القوائم منها ونعيد الروابط أصلية. */
const ARCHIVE_MAX_AGE = 7 * 86400000;

async function archiveItems(pageUrl, host, limit, title) {
  const wb = await waybackPage(pageUrl, host);
  if (!wb) return null;
  let ex = null;
  try { ex = extractFromDom(parseHTML(wb.text), pageUrl, limit); } catch (e) { ex = null; }
  if (ex && ex.items && ex.items.length) {
    for (const it of ex.items) { it.url = stripWaybackUrl(it.url); if (it.img) it.img = stripWaybackUrl(it.img); }
  }
  if (!ex || ex.items.length < 3) { diag("نسخة الأرشيف لم تُنتج قوائم أخبار كافية (" + (ex && ex.items ? ex.items.length : 0) + " عنصرًا)"); return null; }
  const items = ex.items.slice(0, limit);
  if (!freshEnough(items, ARCHIVE_MAX_AGE)) {
    diag("نسخة الأرشيف قديمة — رُفضت (أحدث عنصر: " + (newestTime(items) ? new Date(newestTime(items)).toISOString() : "بلا تاريخ") + ")");
    return null;
  }
  applyPrevDates(items);
  const approx = fillMissingDates(items);
  LAST_VIA = "wayback";
  LAST_SNAP = { url: wb.snap, ts: wb.ts };
  diag("استخراج من نسخة الأرشيف: " + items.length + " عنصرًا / أحدثها " + new Date(newestTime(items) || Date.now()).toISOString());
  return { items, via: "نسخة أرشيف الإنترنت", title, pageUrl, approx };
}

/* v15: آخر ملاذ للمواقع التي تحجب خوادمنا: خلاصة بحث «أخبار جوجل» عن الموقع نفسه. جوجل تزحف كل
   المواقع الإخبارية وتحفظ العناوين والتواريخ، فالخلاصة تبقى حيّة حتى لو حجب الموقع كل وسائطنا.
   الروابط في هذه الحالة روابط جوجل (تُفتح عادة إلى الخبر الأصلي)، ولهذا لا نستعملها إلا إذا فشل
   كل شيء آخر، ونُثبّتها في .transport.json حتى لا تتقلّب الخلاصة بين مجموعتين من الروابط. */
function googleNewsItems(xml, limit) {
  const out = [];
  const seen = new Set();
  for (const m of String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const link = ((b.match(/<link>([^<]*)<\/link>/) || [])[1] || "").trim();
    let title = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    title = xmlUnesc(title.replace(/<!\[CDATA\[|\]\]>/g, "")).replace(/\s+-\s+[^-]{2,50}$/, "").replace(/\s+/g, " ").trim();
    const date = toRfc822((b.match(/<pubDate>([^<]*)<\/pubDate>/) || [])[1]);
    if (!link || !title || seen.has(link)) continue;
    seen.add(link);
    out.push({ url: link, title: title.slice(0, 220), date, relDate: false, img: null, desc: "" });
    if (out.length >= (limit || 30)) break;
  }
  return out;
}

async function googleNewsFallback(host, limit) {
  if (!host) return null;
  /* نطلب نافذة زمنية (when:) وإلّا أعادت جوجل نتائج «الأكثر صلة» وقد تكون قديمة جدًا (جرّبناه: عادت
     بأخبار سنة 2025 في المقدمة). ثم نرتّب نحن تنازليًا بالتاريخ ولا نقبل ما هو أقدم من ٣ أيام. */
  const tries = [["LB", "LB", "2d"], ["EG", "EG", "2d"], ["LB", "LB", "7d"], ["US", "US", "7d"], ["LB", "LB", ""]];
  /* v19: نجمع كل النوافذ الطازجة ونختار أطولها (الخلاصة تبقى ممتلئة وحديثة معًا). */
  let best = null, bestWhen = "";
  for (const [gl, ceid, when] of tries) {
    let q = "site:" + host;
    if (when) q += " when:" + when;
    const u = "https://news.google.com/rss/search?q=" + encodeURIComponent(q) +
      "&hl=ar&gl=" + gl + "&ceid=" + ceid + ":ar";
    const f = await fetchWithFallback(u, 20000);
    let items = f && f.ok ? googleNewsItems(f.text, limit) : [];
    items = sortByDate(items);
    const fresh = freshEnough(items, 3 * 86400000);
    diag("بحث أخبار جوجل (" + gl + (when ? " " + when : "") + "): " + (f ? f.status + " / " + items.length + " عنصرًا" : "لا رد") + (items.length ? " / أحدثها " + (items[0].date || "بلا تاريخ") : "") + (fresh ? "" : " (مرفوض: قديم)"));
    if (fresh && (!best || items.length > best.length)) { best = items; bestWhen = gl + (when ? " " + when : ""); }
    if (items.length >= (limit || 30) && fresh) break;
  }
  if (best) {
    LAST_VIA = "gnews";
    diag("اخترنا نافذة أخبار جوجل: " + bestWhen + " / " + best.length + " عنصرًا");
    return { items: best, via: "بحث أخبار جوجل", note: "المصدر: بحث أخبار جوجل عن هذا الموقع (رفض الموقع خوادم الجلب)", pageUrl: "https://news.google.com/" };
  }
  return null;
}

/* عناصر مقبولة: ثلاثة على الأقل، وأحدثها لم يتجاوز عمره الحد المسموح (خلاصة الأرشيف/جوجل ليست أقدم
   من الوضع الراهن، فلا نستبدل خلاصة طازجة بأخرى قديمة). */
function freshEnough(items, maxAgeMs) {
  if (!items || items.length < 3) return false;
  const newest = newestTime(items);
  if (!newest) return false;
  const floor = Date.now() - maxAgeMs;
  const prev = PREV_NEWEST || 0;
  return newest >= Math.min(floor, prev ? prev - 12 * 3600000 : floor);
}

function newestTime(items) {
  let t = 0;
  for (const it of items || []) {
    const v = Date.parse(it.date || "");
    if (isFinite(v) && v > t) t = v;
  }
  return t;
}

async function probeCommonFeeds(base, timeout) {
  const paths = ["/feed/", "/feed", "/rss", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml", "/?feed=rss2"];
  const tmo = timeout || 12000;
  for (const p of paths) {
    let u;
    try { u = new URL(p, base.origin).href; } catch (e) { continue; }
    const f = await fetchWithFallback(u, tmo);
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
  { name: "mobizil", url: "https://www.mobizil.com/", title: "موبيزل" },
  { name: "feed-riadynews-com-1nw2k", url: "https://riadynews.com/", title: "ريادي" }
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
  const transport = await loadTransport(root, readFile);
  TRANSPORT = new Map(Object.entries(transport));
  TRANSPORT_START = JSON.stringify(transport);
  const written = new Set();
  const runLog = [];
  const iso = (t) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) : "بلا تاريخ");
  let ok = 0, fail = 0;
  for (const f of feeds) {
    const t0 = Date.now();
    let summary = "";
    try {
      PREV_DATES = await loadPrevDates(new URL(f.name + ".xml", root), readFile);
      DIAG = []; DIAG_DROPPED = 0; LAST_VIA = ""; LAST_SNAP = null;
      const out = await scrapeWithRetry(f.url);
      if (out && out.error) {
        console.error("✗ " + f.name + ": " + out.error);
        await writeFile(new URL(f.name + ".error.txt", root), out.error, "utf8");
        written.add(f.name + ".error.txt");
        const txt = "الخطأ: " + out.error + "\n" + diagText2();
        await writeFile(new URL(f.name + ".diag.txt", root), txt, "utf8");
        written.add(f.name + ".diag.txt");
        console.log(txt);
        summary = "خطأ: " + out.error;
        fail++;
      } else {
        let xml;
        if (out.passthrough) {
          xml = out.passthrough;
          summary = "خلاصة الموقع الأصلية (" + xml.length + " حرفًا)";
        } else {
          let items = out.items || [];
          let dropped = 0;
          /* v10: خلاصة لا تُفسد نفسها. إن جاءت هذه الدورة بقائمة لا تتقاطع مع ما نشرناه سابقًا (مصدر
             تعذّر الوصول إليه فسقطنا إلى قائمة صفحة أخرى) نُعيد نشر النسخة السابقة كما هي، فالخلاصة
             تتحسّن أو تبقى، ولا تتدهور. الشرط ينتهي تلقائيًا إذا مرّ 6 ساعات على آخر نشر سليم.
             v17: الرتبة تسمح بالترقية من خلاصة «بحث أخبار جوجل» إلى قائمة الموقع الأصلية، والتقاطع
             يُقاس بالعناوين أيضًا لا بالروابط وحدها. */
          const src = out.via === "WordPress REST" ? "rest"
            : out.via === "نسخة أرشيف الإنترنت" ? "wayback"
            : out.via === "بحث أخبار جوجل" ? "gnews" : "dom";
          const chk = checkInconsistent(items, src);
          /* v17: حماية من التدهور الزمني: لا نستبدل خلاصة حديثة بقائمة أقدم منها بفارق كبير. */
          const newest = newestTime(items);
          const stale = !chk.bad && newest > 0 && PREV_NEWEST > 0 &&
            newest < Date.now() - 3 * 86400000 && newest < PREV_NEWEST - 12 * 3600000;
          if (chk.bad) {
            console.log("   أبقينا النسخة السابقة: القائمة الجديدة لا تشبه السابقة (" + chk.overlap + " رابطًا / " + chk.titleOverlap + " عنوانًا مشتركًا).");
            summary = "أُبقيت النسخة السابقة (تقاطع " + chk.overlap + "/" + chk.titleOverlap + ")";
            xml = PREV_XML;
          } else if (stale) {
            console.log("   أبقينا النسخة السابقة: القائمة الجديدة أقدم (أحدث عنصر " + iso(newest) + " مقابل " + iso(PREV_NEWEST) + ").");
            summary = "أُبقيت النسخة السابقة (الجديدة أقدم: " + iso(newest) + ")";
            xml = PREV_XML;
          } else {
            /* v19: نُسقط العناصر الأقدم من ٤٥ يومًا (أقسام «الأكثر قراءة» أو معارض صور قديمة في
               الصفحة تُضاف إلى القائمة) ما دام يبقى ٥ عناصر على الأقل. */
            const CUT_MS = 45 * 86400000;
            const kept = items.filter((it) => { const t = Date.parse(it.date || ""); return !isFinite(t) || t > Date.now() - CUT_MS; });
            if (kept.length >= 5 && kept.length < items.length) {
              console.log("   أسقطنا " + (items.length - kept.length) + " عنصرًا أقدم من ٤٥ يومًا.");
              dropped = items.length - kept.length;
              items = kept;
            }
            fillMissingDates(items);
            xml = buildRssXml({
              title: f.title || out.title,
              pageUrl: out.pageUrl || f.url,
              selfUrl: f.url,
              description: "خلاصة تُحدَّث تلقائيًا من " + (f.title || out.title) + (out.note ? " — " + out.note : ""),
              items,
              src
            });
            summary = "نُشرت " + items.length + " عنصرًا (via " + (out.via || "?") + ") أحدثها " + iso(newestTime(items)) + (dropped ? " / أُسقط " + dropped + " قديمًا" : "");
          }
        }
        await writeFile(new URL(f.name + ".xml", root), xml, "utf8");
        written.add(f.name + ".xml");
        await rm(new URL(f.name + ".error.txt", root), { force: true });
        await rm(new URL(f.name + ".diag.txt", root), { force: true });
        {
          const h = hostOf(f.url);
          const rec = { via: LAST_VIA || "direct" };
          if (rec.via === "wayback" && LAST_SNAP) { rec.snap = LAST_SNAP.url; rec.snapTs = LAST_SNAP.ts; }
          TRANSPORT.set(h, rec);
        }
        console.log("✓ " + f.name + ": " + summary);
        ok++;
      }
    } catch (e) {
      const msg = "استثناء: " + (e && e.message ? e.message : String(e));
      console.error("✗ " + f.name + ": " + msg);
      summary = msg;
      try { await writeFile(new URL(f.name + ".error.txt", root), msg, "utf8"); written.add(f.name + ".error.txt"); } catch (e2) {}
      fail++;
    }
    runLog.push(f.name + " | " + f.url + " | " + Math.round((Date.now() - t0) / 1000) + "s | via=" + (LAST_VIA || "-") + " | " + summary + (DIAG.length ? "\n    " + DIAG.join("\n    ") : ""));
  }
  try {
    await writeFile(new URL("run-log.txt", root), "دورة " + new Date().toISOString() + "\n" + runLog.join("\n") + "\n", "utf8");
    written.add("run-log.txt");
  } catch (e) {}

  try {
    const obj = {};
    for (const f of feeds) {
      const h = hostOf(f.url);
      const r = transportRec(h);
      if (r && r.via) obj[h] = r;
    }
    const txt = JSON.stringify(obj, null, 1);
    if (txt !== TRANSPORT_START) {
      await writeFile(new URL(".transport.json", root), txt, "utf8");
      written.add(".transport.json");
      console.log("حُفظت مصادر الجلب في .transport.json (" + Object.keys(obj).length + " موقعًا)");
    }
  } catch (e) {}
  if (fromTool > 0) {
    try {
      const keep = new Set();
      for (const f of feeds) { keep.add(f.name + ".xml"); keep.add(f.name + ".error.txt"); keep.add(f.name + ".diag.txt"); }
      const files = await readdir(root);
      for (const file of files) {
        if (!/\.xml$/.test(file) && !/\.error\.txt$/.test(file) && !/\.diag\.txt$/.test(file)) continue;
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
