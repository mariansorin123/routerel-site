// Calculator de mască wildcard (ACL și OSPF) — Routerel (routerel.app).
// Modul ES fără dependențe, doar funcții pure. Rulează în browser și în Node (>= 18).
// Nu importă nimic din alte unelte, ca să poată fi copiat singur în site.
//
// Adresele, măștile și wildcardurile sunt ținute intern ca întregi fără semn pe 32 de biți (0 … 4294967295).
// Operațiile pe biți se încheie cu `>>> 0`, altfel JavaScript le-ar trata ca int32 cu semn.
// Nicio funcție exportată nu aruncă excepții pentru intrări greșite: întoarce `{ ok: false, error }`.

/** @typedef {"ro" | "en"} Lang */

/**
 * @typedef {"EMPTY" | "INVALID_FORMAT" | "INVALID_IP" | "INVALID_MASK" | "INVALID_WILDCARD" |
 *   "NONCONTIGUOUS_MASK" | "PREFIX_RANGE" | "NOT_A_RANGE" | "RANGE_ORDER"} ErrorCode
 * @typedef {"mask" | "entry" | "range" | "test"} Field
 * @typedef {{ code: ErrorCode, details: { value?: string, field?: Field, [k: string]: unknown } }} WcError
 * @typedef {{ ok: false, error: WcError }} Fail
 */

const MAX32 = 0xffffffff;

/** @param {ErrorCode} code @param {WcError["details"]} [details] @returns {Fail} */
const fail = (code, details = {}) => ({ ok: false, error: { code, details } });

// ───────────────────────── Conversii de bază ─────────────────────────

/**
 * „a.b.c.d” → întreg pe 32 de biți; `null` dacă textul nu e o adresă validă.
 * Acceptă zerouri în față („010” = 10, zecimal), maximum 3 cifre pe octet.
 * @param {string} text
 * @returns {number | null}
 */
export function ipToInt(text) {
  if (typeof text !== "string") return null;
  const parts = text.trim().split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

/** @param {number} n @returns {string} „a.b.c.d” */
export function intToIp(n) {
  const v = n >>> 0;
  return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");
}

/** @param {number} n @returns {[number, number, number, number]} */
export function octets(n) {
  const v = n >>> 0;
  return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}

/** Numărul de biți de 1. @param {number} n */
export function popcount(n) {
  let v = n >>> 0;
  let c = 0;
  while (v) {
    v = (v & (v - 1)) >>> 0;
    c++;
  }
  return c;
}

/** Inversul pe 32 de biți (255 − fiecare octet). @param {number} n */
export function invert(n) {
  return ~n >>> 0;
}

/**
 * Masca pentru un prefix 0 … 32 (în JS `x << 32` este `x << 0`, de aceea /0 e tratat separat).
 * @param {number} prefix
 * @returns {number}
 */
export function prefixToMaskInt(prefix) {
  return prefix === 0 ? 0 : (MAX32 << (32 - prefix)) >>> 0;
}

/** Wildcardul pentru un prefix 0 … 32. @param {number} prefix */
export function prefixToWildcardInt(prefix) {
  return invert(prefixToMaskInt(prefix));
}

/**
 * Prefixul unei măști (1-uri urmate doar de 0-uri); `null` dacă nu e contiguă.
 * @param {number} maskInt
 * @returns {number | null}
 */
export function maskIntToPrefix(maskInt) {
  const inv = invert(maskInt);
  if (!isContiguousWildcard(inv)) return null;
  return 32 - popcount(inv);
}

/**
 * Un wildcard e contiguu când biții lui de 1 stau toți la dreapta (0…01…1), adică e inversul unei măști.
 * @param {number} wc
 */
export function isContiguousWildcard(wc) {
  const w = wc >>> 0;
  return w === MAX32 || ((w & (w + 1)) >>> 0) === 0;
}

/** Prefixul echivalent unui wildcard; `null` dacă wildcardul nu e contiguu. @param {number} wc */
export function wildcardIntToPrefix(wc) {
  return isContiguousWildcard(wc) ? 32 - popcount(wc) : null;
}

/**
 * Regula ACL: adresa `ip` se potrivește cu intrarea `address wildcard` dacă e egală cu ea pe toți biții
 * unde wildcardul are 0 (biții cu 1 „nu contează”).
 * @param {number} ip
 * @param {number} address
 * @param {number} wildcard
 */
export function matches(ip, address, wildcard) {
  return ((((ip ^ address) >>> 0) & invert(wildcard)) >>> 0) === 0;
}

/**
 * A k-a adresă (de la 0) potrivită de o intrare, în ordine crescătoare: biții lui k se pun, de jos în sus,
 * pe pozițiile unde wildcardul are 1.
 * @param {number} base adresa cu biții „nu contează” puși pe 0
 * @param {number} wildcard
 * @param {number} k 0 … 2^(biți de 1) − 1
 */
export function nthMatch(base, wildcard, k) {
  let out = base >>> 0;
  let rest = k;
  for (let pos = 0; pos < 32 && rest > 0; pos++) {
    if ((wildcard >>> pos) & 1) {
      if (rest % 2 === 1) out += 2 ** pos;
      rest = Math.floor(rest / 2);
    }
  }
  return out;
}

/**
 * Descompune intervalul [from, to] în cele mai mari blocuri aliniate (acoperirea CIDR minimă).
 * @param {number} from
 * @param {number} to inclusiv
 * @returns {{ address: number, prefix: number, size: number }[]}
 */
export function rangeToBlocks(from, to) {
  /** @type {{ address: number, prefix: number, size: number }[]} */
  const out = [];
  let cur = from;
  while (cur <= to) {
    let size = 1;
    while (size < 2 ** 32 && cur % (size * 2) === 0 && cur + size * 2 - 1 <= to) size *= 2;
    out.push({ address: cur, prefix: 32 - Math.log2(size), size });
    cur += size;
  }
  return out;
}

// ───────────────────────── Text: numere și plural ─────────────────────────

/**
 * Numere mari ușor de citit: în română cu spațiu fix (nu punct, ca să nu semene cu o adresă), în engleză cu virgulă.
 * @param {number} n
 * @param {Lang} [lang]
 */
export function formatCount(n, lang = "ro") {
  const sep = lang === "ro" ? " " : ",";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * „1 adresă”, „2 adrese”, „256 de adrese”, „101 adrese”.
 * @param {number} n
 * @param {Lang} lang
 * @param {{ ro: [string, string], en: [string, string] }} forms [singular, plural]
 */
export function plural(n, lang, forms) {
  const num = formatCount(n, lang);
  if (lang === "en") return `${num} ${n === 1 ? forms.en[0] : forms.en[1]}`;
  if (n === 1) return `${num} ${forms.ro[0]}`;
  const r = n % 100;
  const de = n !== 0 && (r === 0 || r >= 20);
  return `${num} ${de ? "de " : ""}${forms.ro[1]}`;
}

/** @type {Record<"ADDRS" | "BITS" | "ENTRIES" | "VALUES", { ro: [string, string], en: [string, string] }>} */
export const FORMS = {
  ADDRS: { ro: ["adresă", "adrese"], en: ["address", "addresses"] },
  BITS: { ro: ["bit", "biți"], en: ["bit", "bits"] },
  ENTRIES: { ro: ["intrare", "intrări"], en: ["entry", "entries"] },
  VALUES: { ro: ["valoare", "valori"], en: ["value", "values"] },
};

// ───────────────────────── Citirea intrărilor ─────────────────────────

const PREFIX_RE = /^\/?\s*(\d{1,3})$/;

/** @param {string} s */
const looksDotted = (s) => /^[\d.]+$/.test(s) && s.includes(".");

/**
 * @param {string} s
 * @param {Field} field
 * @param {string} [whole] textul întreg, arătat când nici nu seamănă a adresă
 * @returns {{ ok: true, value: number } | Fail}
 */
function readIp(s, field, whole = s) {
  const v = ipToInt(s);
  if (v === null) {
    const ipLike = looksDotted(s) || /^\d+$/.test(s);
    return fail(ipLike ? "INVALID_IP" : "INVALID_FORMAT", { value: ipLike ? s : whole, field });
  }
  return { ok: true, value: v };
}

/**
 * @param {string} s „26”, „/26”
 * @returns {number | null | "range"} prefixul, `null` dacă nu arată a prefix, "range" dacă e în afara 0 … 32
 */
function readPrefix(s) {
  const m = PREFIX_RE.exec(s.trim());
  if (!m) return null;
  const p = Number(m[1]);
  return p > 32 ? "range" : p;
}

// ───────────────────────── 1. Mască ↔ wildcard ─────────────────────────

/**
 * @typedef {{
 *   ok: true,
 *   input: "prefix" | "mask" | "wildcard",
 *   value: string,
 *   mask: string | null, maskInt: number | null,
 *   wildcard: string, wildcardInt: number,
 *   prefix: number | null,
 *   contiguous: boolean,
 *   ambiguous: boolean,
 *   dontCareBits: number,
 *   blockSize: number,
 *   octetSteps: { from: number, to: number }[],
 * }} Conversion
 */

/**
 * Mască, prefix sau wildcard → toate trei. Acceptă „255.255.255.192”, „/26”, „26”, „0.0.0.63”,
 * plus „mask …” / „masca …” / „wildcard …” / „wc …” ca să forțezi felul valorii.
 * Fără cuvânt înainte, o valoare care e mască validă e citită ca mască; altfel ca wildcard.
 * 0.0.0.0 și 255.255.255.255 sunt ambele și măști, și wildcarduri contigue: sunt citite ca măști, cu `ambiguous: true`.
 * @param {string} text
 * @param {{ as?: "auto" | "mask" | "wildcard" }} [opts]
 * @returns {Conversion | Fail}
 */
export function convertMask(text, opts = {}) {
  if (typeof text !== "string" || text.trim() === "") return fail("EMPTY", { field: "mask" });
  let s = text.trim().replace(/\s+/g, " ");
  let as = opts.as ?? "auto";
  const kw = /^(mask|masca|masca de subretea|mască|wildcard|wc)\s*:?\s+(.+)$/i.exec(s);
  if (kw) {
    as = /^w/i.test(kw[1]) ? "wildcard" : "mask";
    s = kw[2];
  }
  const p = readPrefix(s);
  if (p === "range") return fail("PREFIX_RANGE", { value: s, field: "mask" });
  /** @type {Conversion["input"]} */
  let input;
  let maskInt;
  let wcInt;
  if (p !== null) {
    input = "prefix";
    maskInt = prefixToMaskInt(p);
    wcInt = invert(maskInt);
  } else {
    const v = ipToInt(s);
    if (v === null) return fail(looksDotted(s) ? "INVALID_MASK" : "INVALID_FORMAT", { value: s, field: "mask" });
    const isMask = maskIntToPrefix(v) !== null;
    if (as === "mask" && !isMask) return fail("NONCONTIGUOUS_MASK", { value: s, field: "mask" });
    if (as === "mask" || (as === "auto" && isMask)) {
      input = "mask";
      maskInt = v;
      wcInt = invert(v);
    } else {
      input = "wildcard";
      wcInt = v;
      maskInt = isContiguousWildcard(v) ? invert(v) : null;
    }
  }
  const contiguous = maskInt !== null;
  const from = input === "wildcard" ? wcInt : /** @type {number} */ (maskInt);
  const dontCareBits = popcount(wcInt);
  return {
    ok: true,
    input,
    value: s,
    mask: maskInt === null ? null : intToIp(maskInt),
    maskInt,
    wildcard: intToIp(wcInt),
    wildcardInt: wcInt,
    prefix: contiguous ? 32 - dontCareBits : null,
    contiguous,
    ambiguous: as === "auto" && input === "mask" && (maskInt === 0 || maskInt === MAX32),
    dontCareBits,
    blockSize: 2 ** dontCareBits,
    octetSteps: octets(from).map((o) => ({ from: o, to: 255 - o })),
  };
}

// ───────────────────────── 2. Ce potrivește o intrare ─────────────────────────

/**
 * @typedef {"pair" | "host" | "any" | "cidr" | "single"} EntryForm
 * @typedef {{ ok: true, address: number, wildcard: number, form: EntryForm, stripped: boolean }} ParsedEntry
 */

/**
 * Citește o intrare de ACL / OSPF: „192.168.1.0 0.0.0.255”, „host 10.1.1.1”, „any”, „192.168.1.0/24”
 * sau o adresă singură (ca într-un ACL standard, unde wildcardul implicit e 0.0.0.0).
 * Acceptă și o linie lipită întreagă: „access-list 10 permit …”, „permit …”, „network … area 0”.
 * @param {string} text
 * @returns {ParsedEntry | Fail}
 */
export function parseEntry(text) {
  if (typeof text !== "string" || text.trim() === "") return fail("EMPTY", { field: "entry" });
  const original = text.trim().replace(/\s+/g, " ");
  let s = original
    .replace(/^access-list \S+ /i, "")
    .replace(/^(permit|deny) /i, "")
    .replace(/^network /i, "")
    .replace(/ area \S+$/i, "")
    .trim();
  const stripped = s !== original;
  if (/^any$/i.test(s)) return { ok: true, address: 0, wildcard: MAX32, form: "any", stripped };
  const host = /^host (\S+)$/i.exec(s);
  if (host) {
    const ip = readIp(host[1], "entry", original);
    return ip.ok ? { ok: true, address: ip.value, wildcard: 0, form: "host", stripped } : ip;
  }
  const cidr = /^(\S+?) ?\/ ?(\S+)$/.exec(s);
  if (cidr) {
    const ip = readIp(cidr[1], "entry", original);
    if (!ip.ok) return ip;
    const p = readPrefix(cidr[2]);
    if (p === null) return fail("INVALID_FORMAT", { value: original, field: "entry" });
    if (p === "range") return fail("PREFIX_RANGE", { value: cidr[2], field: "entry" });
    return { ok: true, address: ip.value, wildcard: prefixToWildcardInt(p), form: "cidr", stripped };
  }
  const pair = /^(\S+) (\S+)$/.exec(s);
  if (pair) {
    const ip = readIp(pair[1], "entry", original);
    if (!ip.ok) return ip;
    const wc = ipToInt(pair[2]);
    if (wc === null) return fail(looksDotted(pair[2]) ? "INVALID_WILDCARD" : "INVALID_FORMAT", { value: looksDotted(pair[2]) ? pair[2] : original, field: "entry" });
    return { ok: true, address: ip.value, wildcard: wc, form: "pair", stripped };
  }
  if (!s.includes(" ")) {
    const ip = readIp(s, "entry");
    return ip.ok ? { ok: true, address: ip.value, wildcard: 0, form: "single", stripped } : ip;
  }
  return fail("INVALID_FORMAT", { value: original, field: "entry" });
}

/**
 * @typedef {"exact" | "any" | "range" | "bits"} OctetKind
 * @typedef {{
 *   index: number, address: number, wildcard: number, base: number, care: number,
 *   kind: OctetKind, from: number, to: number, count: number, parity: "even" | "odd" | null, values: number[],
 * }} OctetInfo
 */

/**
 * Ce valori acceptă un octet: `exact` (wildcard 0), `any` (255), `range` (wildcard 1, 3, 7 … 127 = un interval)
 * sau `bits` (wildcard necontiguu în octet; `values` are toate valorile, crescător).
 * @param {number} address octetul adresei
 * @param {number} wildcard octetul wildcardului
 * @param {number} [index] 0 … 3
 * @returns {OctetInfo}
 */
export function octetInfo(address, wildcard, index = 0) {
  const care = 255 - wildcard;
  const base = address & care;
  /** @type {number[]} */
  const values = [];
  for (let v = 0; v < 256; v++) if ((v & care) === base) values.push(v);
  /** @type {OctetKind} */
  const kind = wildcard === 0 ? "exact" : wildcard === 255 ? "any" : (wildcard & (wildcard + 1)) === 0 ? "range" : "bits";
  const parity = wildcard === 254 ? (base & 1 ? "odd" : "even") : null;
  return { index, address, wildcard, base, care, kind, from: values[0], to: values[values.length - 1], count: values.length, parity, values };
}

/**
 * @typedef {{
 *   ok: true,
 *   form: EntryForm, stripped: boolean,
 *   address: string, addressInt: number,
 *   wildcard: string, wildcardInt: number,
 *   base: string, baseInt: number,
 *   changed: boolean,
 *   ios: string,
 *   contiguous: boolean, prefix: number | null, mask: string | null,
 *   dontCareBits: number, count: number,
 *   first: string, last: string,
 *   sample: string[],
 *   octets: OctetInfo[],
 *   looksLikeMask: boolean, suggestion: string | null,
 * }} EntryAnalysis
 */

/**
 * Textul intrării, cum îl scrii în IOS: „any”, „host 10.1.1.1” sau „192.168.1.0 0.0.0.255”.
 * @param {number} address
 * @param {number} wildcard
 */
export function entryText(address, wildcard) {
  const w = wildcard >>> 0;
  if (w === MAX32) return "any";
  if (w === 0) return `host ${intToIp(address)}`;
  return `${intToIp((address & invert(w)) >>> 0)} ${intToIp(w)}`;
}

/**
 * Tot ce potrivește perechea adresă + wildcard (date ca întregi).
 * @param {number} address
 * @param {number} wildcard
 * @param {{ sample?: number, form?: EntryForm, stripped?: boolean }} [opts] `sample`: câte potriviri să listeze (implicit 8)
 * @returns {EntryAnalysis}
 */
export function describeEntry(address, wildcard, opts = {}) {
  const a = address >>> 0;
  const w = wildcard >>> 0;
  const baseInt = (a & invert(w)) >>> 0;
  const dontCareBits = popcount(w);
  const count = 2 ** dontCareBits;
  const contiguous = isContiguousWildcard(w);
  const prefix = contiguous ? 32 - dontCareBits : null;
  const n = Math.min(opts.sample ?? 8, count);
  const sample = [];
  for (let k = 0; k < n; k++) sample.push(intToIp(nthMatch(baseInt, w, k)));
  const maskLike = !contiguous && maskIntToPrefix(w) !== null;
  const ao = octets(a);
  const wo = octets(w);
  return {
    ok: true,
    form: opts.form ?? "pair",
    stripped: opts.stripped ?? false,
    address: intToIp(a),
    addressInt: a,
    wildcard: intToIp(w),
    wildcardInt: w,
    base: intToIp(baseInt),
    baseInt,
    changed: baseInt !== a,
    ios: entryText(a, w),
    contiguous,
    prefix,
    mask: contiguous ? intToIp(invert(w)) : null,
    dontCareBits,
    count,
    first: intToIp(baseInt),
    last: intToIp((baseInt | w) >>> 0),
    sample,
    octets: ao.map((o, i) => octetInfo(o, wo[i], i)),
    looksLikeMask: maskLike,
    suggestion: maskLike ? `${intToIp((a & w) >>> 0)} ${intToIp(invert(w))}` : null,
  };
}

/**
 * Citește și analizează o intrare de ACL / OSPF (vezi `parseEntry`).
 * @param {string} text
 * @param {{ sample?: number }} [opts]
 * @returns {EntryAnalysis | Fail}
 */
export function analyzeEntry(text, opts = {}) {
  const p = parseEntry(text);
  if (!p.ok) return p;
  return describeEntry(p.address, p.wildcard, { ...opts, form: p.form, stripped: p.stripped });
}

/**
 * @typedef {{ index: number, ip: number, base: number, wildcard: number, care: number, ipMasked: number, baseMasked: number, ok: boolean }} OctetTest
 * @typedef {{ ok: true, ip: string, ipInt: number, match: boolean, octets: OctetTest[], firstMismatch: number | null }} TestResult
 */

/**
 * Verifică o adresă față de o intrare, octet cu octet.
 * @param {string} ipText
 * @param {number} address
 * @param {number} wildcard
 * @returns {TestResult | Fail}
 */
export function testAddress(ipText, address, wildcard) {
  if (typeof ipText !== "string" || ipText.trim() === "") return fail("EMPTY", { field: "test" });
  const s = ipText.trim();
  const r = readIp(s, "test");
  if (!r.ok) return r;
  const io = octets(r.value);
  const bo = octets((address & invert(wildcard)) >>> 0);
  const wo = octets(wildcard);
  const list = io.map((x, i) => {
    const care = 255 - wo[i];
    return { index: i, ip: x, base: bo[i], wildcard: wo[i], care, ipMasked: x & care, baseMasked: bo[i] & care, ok: (x & care) === (bo[i] & care) };
  });
  const bad = list.findIndex((o) => !o.ok);
  return { ok: true, ip: intToIp(r.value), ipInt: r.value, match: matches(r.value, address, wildcard), octets: list, firstMismatch: bad < 0 ? null : bad };
}

// ───────────────────────── 3. Interval → linii ACL ─────────────────────────

/**
 * @typedef {{ address: string, addressInt: number, wildcard: string, wildcardInt: number, prefix: number, size: number,
 *   kind: "any" | "host" | "net", cidr: string, acl: string, ospf: string }} RangeEntry
 * @typedef {{
 *   ok: true, source: "cidr" | "mask" | "wildcard" | "range" | "single",
 *   start: string, startInt: number, end: string, endInt: number, count: number,
 *   normalized: boolean, network: string | null,
 *   entries: RangeEntry[],
 * }} RangePlan
 */

/**
 * O intrare din acoperirea intervalului.
 * @param {number} address
 * @param {number} prefix
 * @returns {RangeEntry}
 */
function rangeEntry(address, prefix) {
  const w = prefixToWildcardInt(prefix);
  const kind = prefix === 0 ? "any" : prefix === 32 ? "host" : "net";
  return {
    address: intToIp(address),
    addressInt: address,
    wildcard: intToIp(w),
    wildcardInt: w,
    prefix,
    size: 2 ** (32 - prefix),
    kind,
    cidr: `${intToIp(address)}/${prefix}`,
    acl: entryText(address, w),
    ospf: `${intToIp(address)} ${intToIp(w)}`,
  };
}

/**
 * Rețea sau interval → lista minimă de intrări (blocuri cu wildcard contiguu) care acoperă exact intervalul.
 * Acceptă „10.0.0.0/22”, „10.0.0.0 255.255.252.0”, „10.0.0.0 0.0.3.255”, „10.0.0.0 - 10.0.3.255” (și „to”, „–”)
 * sau o adresă singură. O rețea cu biți de host setați e adusă la adresa de rețea (`normalized: true`).
 * @param {string} text
 * @returns {RangePlan | Fail}
 */
export function planRange(text) {
  if (typeof text !== "string" || text.trim() === "") return fail("EMPTY", { field: "range" });
  const s = text.trim().replace(/\s+/g, " ");
  let start;
  let end;
  /** @type {RangePlan["source"]} */
  let source;
  let normalized = false;
  /** @type {string | null} */
  let network = null;
  const dash = /^(\S+?) ?(?:-|–|—|\.\.| to | până la ) ?(\S+)$/i.exec(s);
  const cidr = /^(\S+?) ?\/ ?(\S+)$/.exec(s);
  const pair = /^(\S+) (\S+)$/.exec(s);
  if (dash && ipToInt(dash[1]) !== null) {
    const a = readIp(dash[1], "range");
    if (!a.ok) return a;
    const b = readIp(dash[2], "range");
    if (!b.ok) return b;
    if (a.value > b.value) return fail("RANGE_ORDER", { value: s, field: "range", start: dash[1], end: dash[2] });
    start = a.value;
    end = b.value;
    source = "range";
  } else if (cidr || pair) {
    const m = /** @type {RegExpExecArray} */ (cidr ?? pair);
    const ip = readIp(m[1], "range", s);
    if (!ip.ok) return ip;
    let prefix;
    if (cidr) {
      const p = readPrefix(m[2]);
      if (p === null) return fail("INVALID_FORMAT", { value: s, field: "range" });
      if (p === "range") return fail("PREFIX_RANGE", { value: m[2], field: "range" });
      prefix = p;
      source = "cidr";
    } else {
      const v = ipToInt(m[2]);
      if (v === null) return fail(looksDotted(m[2]) ? "INVALID_MASK" : "INVALID_FORMAT", { value: looksDotted(m[2]) ? m[2] : s, field: "range" });
      const asMask = maskIntToPrefix(v);
      if (asMask !== null) {
        prefix = asMask;
        source = "mask";
      } else if (isContiguousWildcard(v)) {
        prefix = /** @type {number} */ (wildcardIntToPrefix(v));
        source = "wildcard";
      } else {
        return fail("NOT_A_RANGE", { value: m[2], field: "range" });
      }
    }
    const maskInt = prefixToMaskInt(prefix);
    start = (ip.value & maskInt) >>> 0;
    end = (start | invert(maskInt)) >>> 0;
    normalized = start !== ip.value;
    network = `${intToIp(start)}/${prefix}`;
  } else if (!s.includes(" ")) {
    const ip = readIp(s, "range");
    if (!ip.ok) return ip;
    start = end = ip.value;
    source = "single";
    network = `${intToIp(start)}/32`;
  } else {
    return fail("INVALID_FORMAT", { value: s, field: "range" });
  }
  return {
    ok: true,
    source,
    start: intToIp(start),
    startInt: start,
    end: intToIp(end),
    endInt: end,
    count: end - start + 1,
    normalized,
    network,
    entries: rangeToBlocks(start, end).map((b) => rangeEntry(b.address, b.prefix)),
  };
}

/**
 * Liniile de configurare gata de copiat.
 * @param {RangeEntry[]} entries
 * @param {{ acl?: number | string, extAcl?: number | string, area?: number | string, action?: "permit" | "deny" }} [opts]
 * @returns {{ standard: string[], extended: string[], ospf: string[] }}
 */
export function configLines(entries, opts = {}) {
  const acl = opts.acl ?? 10;
  const ext = opts.extAcl ?? 100;
  const area = opts.area ?? 0;
  const action = opts.action ?? "permit";
  return {
    standard: entries.map((e) => `access-list ${acl} ${action} ${e.acl}`),
    extended: entries.map((e) => `access-list ${ext} ${action} ip ${e.acl} any`),
    ospf: entries.map((e) => `network ${e.ospf} area ${area}`),
  };
}

/**
 * Fila potrivită pentru un text (de exemplu din `?q=` în URL): `range` pentru „a - b”, `convert` pentru o singură
 * mască, un prefix sau un wildcard contiguu, `match` pentru rest (pereche adresă + wildcard, host, any, CIDR).
 * @param {string} text
 * @returns {"convert" | "match" | "range"}
 */
export function guessTab(text) {
  const s = String(text ?? "").trim().replace(/\s+/g, " ");
  if (/^\S+ ?(?:-|–|—|\.\.| to | până la ) ?\S+$/i.test(s) && ipToInt(s.split(/ ?(?:-|–|—|\.\.| to | până la ) ?/i)[0]) !== null) return "range";
  if (/^(mask|masca|mască|wildcard|wc)[\s:]/i.test(s) || PREFIX_RE.test(s)) return "convert";
  const v = ipToInt(s);
  if (v !== null && (maskIntToPrefix(v) !== null || isContiguousWildcard(v))) return "convert";
  return "match";
}

// ───────────────────────── Explicații (RO / EN) ─────────────────────────

const ORD = {
  ro: ["Octetul 1", "Octetul 2", "Octetul 3", "Octetul 4"],
  en: ["Octet 1", "Octet 2", "Octet 3", "Octet 4"],
};

/** @param {number} i @param {Lang} lang */
export const octetName = (i, lang) => ORD[lang][i];

/**
 * Pașii pentru fila „Mască ↔ wildcard”: `[{ id, text }]`, cu id-urile `rule`, `result`, `prefix` (sau `noncontig`), `note`.
 * Calculul pe octeți (255 − x) e în `conv.octetSteps`.
 * @param {Conversion} conv
 * @param {Lang} [lang]
 * @returns {{ id: string, text: string }[]}
 */
export function conversionSteps(conv, lang = "ro") {
  const ro = lang === "ro";
  const bits = (/** @type {number} */ n) => plural(n, lang, FORMS.BITS);
  const addrs = (/** @type {number} */ n) => plural(n, lang, FORMS.ADDRS);
  /** @type {{ id: string, text: string }[]} */
  const out = [];
  if (conv.input === "wildcard" && !conv.contiguous) {
    const inv = intToIp(invert(conv.wildcardInt));
    out.push({ id: "rule", text: ro
      ? `Inversul unui wildcard se calculează pe fiecare octet: 255 minus octetul wildcardului. Aici inversul este ${inv}.`
      : `The inverse of a wildcard is worked out per octet: 255 minus the wildcard octet. Here the inverse is ${inv}.` });
  } else if (conv.input === "wildcard") {
    out.push({ id: "rule", text: ro
      ? "Masca este inversul wildcardului: fiecare bit de 1 devine 0 și invers. Pe fiecare octet, asta înseamnă 255 minus octetul wildcardului."
      : "The mask is the inverse of the wildcard: every 1 bit becomes 0 and vice versa. Per octet, that is 255 minus the wildcard octet." });
  } else {
    out.push({ id: "rule", text: ro
      ? "Wildcardul este inversul măștii: fiecare bit de 1 din mască devine 0 și invers. Pe fiecare octet, asta înseamnă 255 minus octetul măștii."
      : "The wildcard is the inverse of the mask: every 1 bit in the mask becomes 0 and vice versa. Per octet, that is 255 minus the mask octet." });
  }
  if (conv.input === "prefix") {
    out.unshift({ id: "mask", text: ro
      ? `/${conv.prefix} înseamnă ${bits(/** @type {number} */ (conv.prefix))} de 1 la stânga, deci masca ${conv.mask}.`
      : `/${conv.prefix} means ${bits(/** @type {number} */ (conv.prefix))} set to 1 from the left, so the mask is ${conv.mask}.` });
  }
  if (conv.contiguous) {
    out.push({ id: "result", text: conv.input === "wildcard"
      ? (ro ? `Rezultat: masca ${conv.mask}, adică /${conv.prefix}.` : `Result: the mask ${conv.mask}, which is /${conv.prefix}.`)
      : (ro ? `Rezultat: wildcardul ${conv.wildcard}.` : `Result: the wildcard ${conv.wildcard}.`) });
    out.push({ id: "prefix", text: ro
      ? `Wildcardul are ${bits(conv.dontCareBits)} de 1 la dreapta („nu contează”), deci o intrare cu el acoperă 2^${conv.dontCareBits} = ${addrs(conv.blockSize)}. Masca are ${bits(/** @type {number} */ (conv.prefix))} de 1, deci prefixul este /${conv.prefix}.`
      : `The wildcard has ${bits(conv.dontCareBits)} set to 1 on the right (“don't care”), so an entry using it covers 2^${conv.dontCareBits} = ${addrs(conv.blockSize)}. The mask has ${bits(/** @type {number} */ (conv.prefix))} set to 1, so the prefix is /${conv.prefix}.` });
  } else {
    out.push({ id: "noncontig", text: ro
      ? `Biții de 1 din ${conv.wildcard} nu stau toți la dreapta, deci wildcardul este necontiguu. Inversul lui nu este o mască de subrețea validă și nu există un prefix echivalent.`
      : `The 1 bits in ${conv.wildcard} are not all on the right, so the wildcard is non-contiguous. Its inverse is not a valid subnet mask and there is no equivalent prefix.` });
    out.push({ id: "acl", text: ro
      ? `Într-un ACL este totuși valid: are ${bits(conv.dontCareBits)} „nu contează”, deci o intrare cu el acoperă 2^${conv.dontCareBits} = ${addrs(conv.blockSize)}, care nu formează un singur interval. Vezi fila „Ce acoperă?”.`
      : `It is still valid in an ACL: it has ${bits(conv.dontCareBits)} that “don't care”, so an entry using it covers 2^${conv.dontCareBits} = ${addrs(conv.blockSize)}, which do not form a single range. See the “Matches” tab.` });
  }
  if (conv.ambiguous) {
    const asWc = conv.maskInt === 0;
    out.push({ id: "note", text: ro
      ? `Am citit ${conv.value} ca mască (/${conv.prefix}). Ca wildcard, ${conv.value} înseamnă ${asWc ? "o singură adresă (host, /32)" : "orice adresă (any, /0)"}. Scrie „wildcard ${conv.value}” ca să-l citesc așa.`
      : `I read ${conv.value} as a mask (/${conv.prefix}). As a wildcard, ${conv.value} means ${asWc ? "a single address (host, /32)" : "any address (any, /0)"}. Type “wildcard ${conv.value}” to read it that way.` });
  }
  return out;
}

/**
 * Ce valori acceptă un octet, în cuvinte: „doar 192”, „oricare (0–255)”, „de la 0 la 3”, „doar pare: 0, 2, 4 … 254”.
 * @param {OctetInfo} o
 * @param {Lang} [lang]
 */
export function describeOctet(o, lang = "ro") {
  const ro = lang === "ro";
  const list = (/** @type {number[]} */ v) => (v.length <= 5 ? v.join(", ") : `${v.slice(0, 3).join(", ")} … ${v[v.length - 1]}`);
  switch (o.kind) {
    case "exact":
      return ro ? `doar ${o.base}` : `only ${o.base}`;
    case "any":
      return ro ? "oricare (0–255)" : "any (0–255)";
    case "range":
      return ro ? `de la ${o.from} la ${o.to} (${plural(o.count, lang, FORMS.VALUES)})` : `${o.from} to ${o.to} (${plural(o.count, lang, FORMS.VALUES)})`;
    default:
      if (o.parity === "even") return ro ? `doar valori pare: ${list(o.values)}` : `even values only: ${list(o.values)}`;
      if (o.parity === "odd") return ro ? `doar valori impare: ${list(o.values)}` : `odd values only: ${list(o.values)}`;
      return ro ? `${plural(o.count, lang, FORMS.VALUES)}: ${list(o.values)}` : `${plural(o.count, lang, FORMS.VALUES)}: ${list(o.values)}`;
  }
}

/**
 * Explicația pentru un octet la „Verifică o adresă”.
 * @param {OctetTest} o
 * @param {Lang} [lang]
 */
export function describeOctetTest(o, lang = "ro") {
  const ro = lang === "ro";
  const verdict = o.ok ? (ro ? "se potrivește" : "matches") : (ro ? "diferă" : "differs");
  if (o.wildcard === 255) return ro ? `wildcard 255: orice valoare e bună (adresa are ${o.ip}), deci ${verdict}` : `wildcard 255: any value is fine (the address has ${o.ip}), so it ${verdict}`;
  if (o.wildcard === 0) return ro ? `wildcard 0: trebuie să fie exact ${o.base}; adresa are ${o.ip}, deci ${verdict}` : `wildcard 0: must be exactly ${o.base}; the address has ${o.ip}, so it ${verdict}`;
  return ro
    ? `wildcard ${o.wildcard}: se compară doar biții cu 0 în wildcard (${o.care} = 255 − ${o.wildcard}). ${o.ip} AND ${o.care} = ${o.ipMasked}, trebuie ${o.baseMasked}, deci ${verdict}`
    : `wildcard ${o.wildcard}: only the bits that are 0 in the wildcard are compared (${o.care} = 255 − ${o.wildcard}). ${o.ip} AND ${o.care} = ${o.ipMasked}, needs ${o.baseMasked}, so it ${verdict}`;
}

// ───────────────────────── Mesaje de eroare ─────────────────────────

const FORMAT_HINT = {
  ro: {
    mask: "Scrie o mască (255.255.255.0), un prefix (/24) sau un wildcard (0.0.0.255).",
    entry: "Scrie adresa și wildcardul (192.168.1.0 0.0.0.255), host 10.1.1.1, any sau 192.168.1.0/24.",
    range: "Scrie o rețea (10.0.0.0/22 sau 10.0.0.0 255.255.252.0) sau un interval (10.0.0.0 - 10.0.3.255).",
    test: "Scrie o adresă IPv4, de exemplu 192.168.1.77.",
  },
  en: {
    mask: "Enter a mask (255.255.255.0), a prefix (/24) or a wildcard (0.0.0.255).",
    entry: "Enter the address and wildcard (192.168.1.0 0.0.0.255), host 10.1.1.1, any or 192.168.1.0/24.",
    range: "Enter a network (10.0.0.0/22 or 10.0.0.0 255.255.252.0) or a range (10.0.0.0 - 10.0.3.255).",
    test: "Enter an IPv4 address, for example 192.168.1.77.",
  },
};

/**
 * Mesajul pentru o eroare, în limba cerută.
 * @param {{ code: ErrorCode, details?: WcError["details"] }} err
 * @param {Lang} [lang]
 * @returns {string}
 */
export function errorMessage(err, lang = "ro") {
  const d = err?.details ?? {};
  const v = d.value === undefined ? "" : String(d.value);
  const ro = lang !== "en";
  const L = ro ? "ro" : "en";
  const hint = FORMAT_HINT[L][d.field ?? "mask"];
  switch (err?.code) {
    case "EMPTY":
      return ro ? `Câmpul este gol. ${hint}` : `The field is empty. ${hint}`;
    case "INVALID_FORMAT":
      return ro ? `Nu înțeleg „${v}”. ${hint}` : `I can't read “${v}”. ${hint}`;
    case "INVALID_IP":
      return ro
        ? `„${v}” nu este o adresă IPv4 validă: are nevoie de 4 numere de la 0 la 255, despărțite prin puncte.`
        : `“${v}” is not a valid IPv4 address: it needs 4 numbers from 0 to 255, separated by dots.`;
    case "INVALID_MASK":
      return ro
        ? `„${v}” nu are forma corectă: o mască sau un wildcard are 4 numere de la 0 la 255, despărțite prin puncte.`
        : `“${v}” is not in the right form: a mask or a wildcard has 4 numbers from 0 to 255, separated by dots.`;
    case "INVALID_WILDCARD":
      return ro
        ? `„${v}” nu este un wildcard valid: are nevoie de 4 numere de la 0 la 255, despărțite prin puncte.`
        : `“${v}” is not a valid wildcard: it needs 4 numbers from 0 to 255, separated by dots.`;
    case "NONCONTIGUOUS_MASK":
      return ro
        ? `„${v}” nu este o mască validă: într-o mască, biții de 1 stau toți la stânga. Scrie-l fără „mask” ca să-l citesc ca wildcard.`
        : `“${v}” is not a valid mask: in a mask, the 1 bits are all on the left. Type it without “mask” to read it as a wildcard.`;
    case "PREFIX_RANGE":
      return ro ? "Prefixul trebuie să fie între /0 și /32." : "The prefix must be between /0 and /32.";
    case "NOT_A_RANGE":
      return ro
        ? `„${v}” nu este nici mască, nici wildcard contiguu, deci nu descrie un singur interval. Pentru wildcarduri ca 0.0.0.254 folosește fila „Ce acoperă?”; pentru un interval scrie început - sfârșit.`
        : `“${v}” is neither a mask nor a contiguous wildcard, so it does not describe a single range. For wildcards like 0.0.0.254 use the “Matches” tab; for a range type start - end.`;
    case "RANGE_ORDER":
      return ro
        ? `Începutul intervalului (${d.start}) este după sfârșit (${d.end}). Scrie întâi adresa mai mică.`
        : `The start of the range (${d.start}) is after the end (${d.end}). Put the lower address first.`;
    default:
      return ro ? "Valoarea nu este validă." : "The value is not valid.";
  }
}
