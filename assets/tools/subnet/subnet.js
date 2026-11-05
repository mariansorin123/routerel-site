// Calculator de subnetting IPv4 — Routerel (routerel.app).
// Modul ES fără dependențe, doar funcții pure. Rulează în browser și în Node (>= 18).
//
// Adresele sunt ținute intern ca numere întregi fără semn pe 32 de biți (0 … 4294967295).
// Toate operațiile pe biți se încheie cu `>>> 0`, altfel JavaScript le-ar trata ca int32 cu semn.

/** @typedef {"ro" | "en"} Lang */

/**
 * @typedef {"EMPTY" | "INVALID_FORMAT" | "INVALID_IP" | "MISSING_MASK" | "INVALID_MASK" |
 *   "NONCONTIGUOUS_MASK" | "PREFIX_RANGE" | "INVALID_OPTIONS" | "TOO_MANY_SUBNETS" |
 *   "TOO_MANY_HOSTS" | "INVALID_REQUIREMENT" | "VLSM_NO_FIT"} ErrorCode
 */

/** Eroare cu un cod stabil (pentru UI și teste) și detalii opționale. */
export class SubnetError extends Error {
  /**
   * @param {ErrorCode} code
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, details = {}) {
    super(errorMessage({ code, details }, "en"));
    this.name = "SubnetError";
    /** @type {ErrorCode} */
    this.code = code;
    /** @type {Record<string, unknown>} */
    this.details = details;
  }
}

/**
 * @typedef {{ ok: true, ip: number, prefix: number, maskInput: "prefix" | "mask" }} ParseOk
 * @typedef {{ ok: false, error: { code: ErrorCode, details: Record<string, unknown> } }} ParseFail
 * @typedef {ParseOk | ParseFail} ParseResult
 */

const MAX32 = 0xffffffff;

// ───────────────────────── Conversii de bază ─────────────────────────

/**
 * Transformă „a.b.c.d” într-un întreg pe 32 de biți. Întoarce `null` dacă textul nu e o adresă validă.
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
    out = out * 256 + n; // înmulțire, nu <<, ca să nu treacă prin int32
  }
  return out;
}

/**
 * @param {number} n întreg 0 … 2^32 − 1
 * @returns {string} „a.b.c.d”
 */
export function intToIp(n) {
  const v = n >>> 0;
  return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");
}

/**
 * @param {number} n
 * @returns {[number, number, number, number]}
 */
export function octets(n) {
  const v = n >>> 0;
  return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}

/**
 * Masca (întreg) pentru un prefix 0 … 32.
 * Atenție: în JS `x << 32` este `x << 0`, de aceea /0 e tratat separat.
 * @param {number} prefix
 * @returns {number}
 */
export function prefixToMaskInt(prefix) {
  assertPrefix(prefix);
  return prefix === 0 ? 0 : (MAX32 << (32 - prefix)) >>> 0;
}

/**
 * @param {number} prefix
 * @returns {string} masca în format zecimal cu puncte
 */
export function prefixToMask(prefix) {
  return intToIp(prefixToMaskInt(prefix));
}

/**
 * Prefixul unei măști date ca întreg; `null` dacă masca nu e contiguă (1-uri urmate doar de 0-uri).
 * @param {number} maskInt
 * @returns {number | null}
 */
export function maskIntToPrefix(maskInt) {
  const m = maskInt >>> 0;
  const inv = ~m >>> 0; // biții de host
  // inv trebuie să fie de forma 0…01…1, adică inv & (inv + 1) === 0
  if (((inv & (inv + 1)) >>> 0) !== 0) return null;
  return 32 - popcount(inv);
}

/**
 * Prefixul unei măști „a.b.c.d”. Întoarce `null` dacă masca e invalidă sau necontiguă.
 * @param {string} mask
 * @returns {number | null}
 */
export function maskToPrefix(mask) {
  const m = ipToInt(mask);
  return m === null ? null : maskIntToPrefix(m);
}

/**
 * @param {number} n
 * @returns {number}
 */
function popcount(n) {
  let v = n >>> 0;
  let c = 0;
  while (v) {
    v = (v & (v - 1)) >>> 0;
    c++;
  }
  return c;
}

/**
 * Cei 32 de biți, grupați pe octeți: „11000000.10101000.00001010.01001101”.
 * @param {number} n
 * @returns {string}
 */
export function toBinary(n) {
  return octets(n).map((o) => o.toString(2).padStart(8, "0")).join(".");
}

/**
 * Poziția (indexul caracterului) din `toBinary()` unde începe partea de host.
 * Bitul i (0 = cel mai semnificativ) se află la caracterul i + floor(i / 8).
 * @param {number} prefix
 * @returns {number}
 */
export function binaryBoundaryIndex(prefix) {
  assertPrefix(prefix);
  return prefix === 32 ? 35 : prefix + Math.floor(prefix / 8);
}

/** @param {unknown} prefix */
function assertPrefix(prefix) {
  if (!Number.isInteger(prefix) || /** @type {number} */ (prefix) < 0 || /** @type {number} */ (prefix) > 32) {
    throw new SubnetError("PREFIX_RANGE", { prefix });
  }
}

// ───────────────────────── Citirea textului introdus ─────────────────────────

/**
 * Citește „192.168.10.77/26”, „192.168.10.77 255.255.255.192”, „192.168.10.77/255.255.255.192”,
 * „10.0.0.1 /8”. Spațiile în plus sunt ignorate. Nu aruncă excepții.
 * @param {string} input
 * @returns {ParseResult}
 */
export function parseInput(input) {
  const fail = (/** @type {ErrorCode} */ code, details = {}) => /** @type {ParseFail} */ ({ ok: false, error: { code, details } });
  const text = String(input ?? "").trim();
  if (!text) return fail("EMPTY");

  const m = /^([^\s/]+)\s*(?:\/\s*|\s+)?(.*)$/.exec(text);
  if (!m) return fail("INVALID_FORMAT");
  const [, ipText, rest] = m;
  const maskText = rest.trim();

  const ip = ipToInt(ipText);
  if (ip === null) return fail("INVALID_IP", { value: ipText });
  if (!maskText) return fail("MISSING_MASK", { ip: ipText });
  if (/[\s/]/.test(maskText)) return fail("INVALID_FORMAT");

  if (/^[-+]?\d+$/.test(maskText)) {
    const prefix = Number(maskText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32 || maskText.startsWith("+")) {
      return fail("PREFIX_RANGE", { value: maskText });
    }
    return { ok: true, ip, prefix, maskInput: "prefix" };
  }

  const maskInt = ipToInt(maskText);
  if (maskInt === null) return fail("INVALID_MASK", { value: maskText });
  const prefix = maskIntToPrefix(maskInt);
  if (prefix === null) {
    // 0.0.0.63 seamănă cu o mască wildcard (inversa unei măști valide): îl ajutăm pe utilizator.
    const inverse = maskIntToPrefix(~maskInt >>> 0);
    return fail("NONCONTIGUOUS_MASK", {
      value: maskText,
      looksLikeWildcard: inverse !== null,
      ...(inverse !== null ? { suggestedMask: prefixToMask(inverse), suggestedPrefix: inverse } : {}),
    });
  }
  return { ok: true, ip, prefix, maskInput: "mask" };
}

/**
 * Ca `parseInput`, dar aruncă `SubnetError` dacă textul e invalid.
 * @param {string} input
 * @returns {{ ip: number, prefix: number }}
 */
export function parseOrThrow(input) {
  const r = parseInput(input);
  if (!r.ok) throw new SubnetError(r.error.code, r.error.details);
  return { ip: r.ip, prefix: r.prefix };
}

/**
 * @param {string | number} ip
 * @param {number | undefined} prefix
 * @returns {{ ip: number, prefix: number }}
 */
function normalizeArgs(ip, prefix) {
  if (prefix === undefined && typeof ip === "string") return parseOrThrow(ip);
  /** @type {number | null} */
  let ipInt;
  if (typeof ip === "number") ipInt = Number.isInteger(ip) && ip >= 0 && ip <= MAX32 ? ip : null;
  else ipInt = ipToInt(ip);
  if (ipInt === null) throw new SubnetError("INVALID_IP", { value: ip });
  assertPrefix(prefix);
  return { ip: ipInt, prefix: /** @type {number} */ (prefix) };
}

// ───────────────────────── Clase și intervale speciale ─────────────────────────

/**
 * Clasa adresei (doar informativ: rutarea modernă e fără clase, CIDR).
 * @param {number} ipInt
 * @returns {{ letter: "A" | "B" | "C" | "D" | "E", defaultPrefix: number | null }}
 */
export function addressClass(ipInt) {
  const first = (ipInt >>> 0) >>> 24;
  if (first < 128) return { letter: "A", defaultPrefix: 8 };
  if (first < 192) return { letter: "B", defaultPrefix: 16 };
  if (first < 224) return { letter: "C", defaultPrefix: 24 };
  if (first < 240) return { letter: "D", defaultPrefix: null };
  return { letter: "E", defaultPrefix: null };
}

/**
 * @typedef {"private" | "public" | "loopback" | "link-local" | "cgnat" | "multicast" | "reserved" |
 *   "documentation" | "this-network" | "broadcast" | "benchmark" | "protocol"} RangeKind
 * @typedef {{ id: string, cidr: string, kind: RangeKind, rfc: string | null, label: { ro: string, en: string } }} SpecialRange
 */

/** Ordonate de la cel mai specific la cel mai larg (prima potrivire câștigă). @type {SpecialRange[]} */
export const SPECIAL_RANGES = [
  { id: "limited-broadcast", cidr: "255.255.255.255/32", kind: "broadcast", rfc: "RFC 919", label: { ro: "Broadcast limitat (toată rețeaua locală)", en: "Limited broadcast (local network)" } },
  { id: "this-network", cidr: "0.0.0.0/8", kind: "this-network", rfc: "RFC 1122", label: { ro: "„Această rețea” (0.0.0.0/8, nu se folosește pe host-uri)", en: "\"This network\" (0.0.0.0/8, not assignable)" } },
  { id: "private-10", cidr: "10.0.0.0/8", kind: "private", rfc: "RFC 1918", label: { ro: "Privată (RFC 1918)", en: "Private (RFC 1918)" } },
  { id: "cgnat", cidr: "100.64.0.0/10", kind: "cgnat", rfc: "RFC 6598", label: { ro: "Spațiu partajat CGNAT (RFC 6598)", en: "Shared address space, CGNAT (RFC 6598)" } },
  { id: "loopback", cidr: "127.0.0.0/8", kind: "loopback", rfc: "RFC 1122", label: { ro: "Loopback (127.0.0.0/8)", en: "Loopback (127.0.0.0/8)" } },
  { id: "link-local", cidr: "169.254.0.0/16", kind: "link-local", rfc: "RFC 3927", label: { ro: "Link-local / APIPA (169.254.0.0/16)", en: "Link-local / APIPA (169.254.0.0/16)" } },
  { id: "private-172", cidr: "172.16.0.0/12", kind: "private", rfc: "RFC 1918", label: { ro: "Privată (RFC 1918)", en: "Private (RFC 1918)" } },
  { id: "ietf-protocol", cidr: "192.0.0.0/24", kind: "protocol", rfc: "RFC 6890", label: { ro: "Rezervată IETF pentru protocoale", en: "IETF protocol assignments" } },
  { id: "test-net-1", cidr: "192.0.2.0/24", kind: "documentation", rfc: "RFC 5737", label: { ro: "Documentație TEST-NET-1 (RFC 5737)", en: "Documentation TEST-NET-1 (RFC 5737)" } },
  { id: "6to4-relay", cidr: "192.88.99.0/24", kind: "reserved", rfc: "RFC 7526", label: { ro: "Fost releu 6to4 (rezervată)", en: "Former 6to4 relay anycast (reserved)" } },
  { id: "private-192", cidr: "192.168.0.0/16", kind: "private", rfc: "RFC 1918", label: { ro: "Privată (RFC 1918)", en: "Private (RFC 1918)" } },
  { id: "benchmark", cidr: "198.18.0.0/15", kind: "benchmark", rfc: "RFC 2544", label: { ro: "Teste de performanță (RFC 2544)", en: "Benchmarking (RFC 2544)" } },
  { id: "test-net-2", cidr: "198.51.100.0/24", kind: "documentation", rfc: "RFC 5737", label: { ro: "Documentație TEST-NET-2 (RFC 5737)", en: "Documentation TEST-NET-2 (RFC 5737)" } },
  { id: "test-net-3", cidr: "203.0.113.0/24", kind: "documentation", rfc: "RFC 5737", label: { ro: "Documentație TEST-NET-3 (RFC 5737)", en: "Documentation TEST-NET-3 (RFC 5737)" } },
  { id: "multicast", cidr: "224.0.0.0/4", kind: "multicast", rfc: "RFC 5771", label: { ro: "Multicast (clasa D)", en: "Multicast (class D)" } },
  { id: "reserved-e", cidr: "240.0.0.0/4", kind: "reserved", rfc: "RFC 1112", label: { ro: "Rezervată (clasa E)", en: "Reserved (class E)" } },
];

/** @type {SpecialRange} */
const PUBLIC_RANGE = { id: "public", cidr: "", kind: "public", rfc: null, label: { ro: "Publică (rutabilă pe Internet)", en: "Public (Internet-routable)" } };

const RANGE_INTS = SPECIAL_RANGES.map((r) => {
  const [ip, p] = r.cidr.split("/");
  const prefix = Number(p);
  const mask = prefixToMaskInt(prefix);
  return { range: r, net: (/** @type {number} */ (ipToInt(ip)) & mask) >>> 0, mask };
});

/**
 * În ce interval special cade adresa (sau „public”).
 * @param {number} ipInt
 * @returns {SpecialRange}
 */
export function classifyAddress(ipInt) {
  const v = ipInt >>> 0;
  for (const r of RANGE_INTS) if (((v & r.mask) >>> 0) === r.net) return r.range;
  return PUBLIC_RANGE;
}

// ───────────────────────── Analiza unei adrese ─────────────────────────

/**
 * @typedef {object} Analysis
 * @property {string} ip
 * @property {number} ipInt
 * @property {number} prefix
 * @property {string} cidr                „192.168.10.64/26”
 * @property {string} mask
 * @property {number} maskInt
 * @property {string} wildcard
 * @property {number} wildcardInt
 * @property {number} networkBits
 * @property {number} hostBits
 * @property {string} network
 * @property {number} networkInt
 * @property {string} broadcast           ultima adresă din bloc (la /31 și /32 nu e broadcast, vezi `hasBroadcast`)
 * @property {number} broadcastInt
 * @property {boolean} hasBroadcast       false la /31 (RFC 3021) și /32
 * @property {string} firstHost
 * @property {string} lastHost
 * @property {number} firstHostInt
 * @property {number} lastHostInt
 * @property {number} usableHosts         2^h − 2; /31 → 2; /32 → 1
 * @property {number} totalAddresses      2^h
 * @property {"normal" | "point-to-point" | "host-route"} kind
 * @property {"network" | "broadcast" | "host"} ipRole  rolul adresei introduse în subrețeaua ei
 * @property {string | null} nextNetwork  începutul blocului următor (null dacă e ultimul din IPv4)
 * @property {{ size: number, octet: 1 | 2 | 3 | 4, maskOctet: number, ipOctet: number, start: number, end: number }} block
 *           metoda „numărului magic”: octetul interesant, mărimea blocului și blocul care conține adresa
 * @property {{ letter: "A" | "B" | "C" | "D" | "E", defaultPrefix: number | null }} addressClass
 * @property {SpecialRange} range
 * @property {{ ip: string, mask: string, wildcard: string, network: string, broadcast: string, boundaryIndex: number }} binary
 */

/**
 * Analiza completă a unei adrese cu prefix.
 * `analyze("192.168.10.77", 26)`, `analyze(3232238157, 26)` sau `analyze("192.168.10.77/26")`.
 * @param {string | number} ip
 * @param {number} [prefix]
 * @returns {Analysis}
 */
export function analyze(ip, prefix) {
  const a = normalizeArgs(ip, prefix);
  const p = a.prefix;
  const ipInt = a.ip;
  const maskInt = prefixToMaskInt(p);
  const wildcardInt = ~maskInt >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | wildcardInt) >>> 0;
  const hostBits = 32 - p;
  const totalAddresses = 2 ** hostBits;

  /** @type {Analysis["kind"]} */
  let kind = "normal";
  let firstHostInt = networkInt + 1;
  let lastHostInt = broadcastInt - 1;
  let usableHosts = totalAddresses - 2;
  if (p === 31) {
    kind = "point-to-point";
    firstHostInt = networkInt;
    lastHostInt = broadcastInt;
    usableHosts = 2;
  } else if (p === 32) {
    kind = "host-route";
    firstHostInt = lastHostInt = networkInt;
    usableHosts = 1;
  }

  // Octetul interesant = octetul în care se află ultimul bit de rețea (/24 → octetul 3, bloc 1).
  const octetIndex = p === 0 ? 0 : Math.floor((p - 1) / 8);
  const maskOctet = octets(maskInt)[octetIndex];
  const ipOctet = octets(ipInt)[octetIndex];
  const size = 256 - maskOctet;
  const start = Math.floor(ipOctet / size) * size;

  /** @type {Analysis["ipRole"]} */
  let ipRole = "host";
  if (kind === "normal") {
    if (ipInt === networkInt) ipRole = "network";
    else if (ipInt === broadcastInt) ipRole = "broadcast";
  }

  return {
    ip: intToIp(ipInt),
    ipInt,
    prefix: p,
    cidr: `${intToIp(networkInt)}/${p}`,
    mask: intToIp(maskInt),
    maskInt,
    wildcard: intToIp(wildcardInt),
    wildcardInt,
    networkBits: p,
    hostBits,
    network: intToIp(networkInt),
    networkInt,
    broadcast: intToIp(broadcastInt),
    broadcastInt,
    hasBroadcast: kind === "normal",
    firstHost: intToIp(firstHostInt),
    lastHost: intToIp(lastHostInt),
    firstHostInt,
    lastHostInt,
    usableHosts,
    totalAddresses,
    kind,
    ipRole,
    nextNetwork: broadcastInt === MAX32 ? null : intToIp(broadcastInt + 1),
    block: { size, octet: /** @type {1|2|3|4} */ (octetIndex + 1), maskOctet, ipOctet, start, end: start + size - 1 },
    addressClass: addressClass(ipInt),
    range: classifyAddress(ipInt),
    binary: {
      ip: toBinary(ipInt),
      mask: toBinary(maskInt),
      wildcard: toBinary(wildcardInt),
      network: toBinary(networkInt),
      broadcast: toBinary(broadcastInt),
      boundaryIndex: binaryBoundaryIndex(p),
    },
  };
}

// ───────────────────────── Text: numere, plural, mesaje ─────────────────────────

/**
 * Numere mari ușor de citit. În română folosim spațiu fix (nu punct), ca să nu semene cu o adresă IP.
 * @param {number} n
 * @param {Lang} [lang]
 * @returns {string}
 */
export function formatCount(n, lang = "ro") {
  const sep = lang === "ro" ? " " : ",";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * „1 host”, „2 host-uri”, „62 de host-uri”, „101 host-uri”, „120 de host-uri”.
 * @param {number} n
 * @param {Lang} lang
 * @param {{ ro: [string, string], en: [string, string] }} forms  [singular, plural]
 * @returns {string}
 */
export function plural(n, lang, forms) {
  const num = formatCount(n, lang);
  if (lang === "en") return `${num} ${n === 1 ? forms.en[0] : forms.en[1]}`;
  if (n === 1) return `${num} ${forms.ro[0]}`;
  const r = n % 100;
  const de = n !== 0 && (r === 0 || r >= 20);
  return `${num} ${de ? "de " : ""}${forms.ro[1]}`;
}

/** @type {{ ro: [string, string], en: [string, string] }} */
const HOSTS = { ro: ["host", "host-uri"], en: ["host", "hosts"] };
/** @type {{ ro: [string, string], en: [string, string] }} */
const ADDRS = { ro: ["adresă", "adrese"], en: ["address", "addresses"] };
/** @type {{ ro: [string, string], en: [string, string] }} */
const SUBNETS = { ro: ["subrețea", "subrețele"], en: ["subnet", "subnets"] };
/** @type {{ ro: [string, string], en: [string, string] }} */
const BITS = { ro: ["bit", "biți"], en: ["bit", "bits"] };

export const FORMS = { HOSTS, ADDRS, SUBNETS, BITS };

/**
 * Mesajul pentru o eroare, în limba cerută.
 * @param {{ code: ErrorCode, details?: Record<string, unknown> }} err
 * @param {Lang} [lang]
 * @returns {string}
 */
export function errorMessage(err, lang = "ro") {
  const d = err.details ?? {};
  const v = d.value === undefined ? "" : String(d.value);
  const ro = lang === "ro";
  switch (err.code) {
    case "EMPTY":
      return ro ? "Scrie o adresă IP cu prefix, de exemplu 192.168.10.77/26." : "Enter an IP address with a prefix, e.g. 192.168.10.77/26.";
    case "INVALID_FORMAT":
      return ro ? "Formatul nu e recunoscut. Exemple: 192.168.10.77/26 sau 192.168.10.77 255.255.255.192." : "Format not recognised. Examples: 192.168.10.77/26 or 192.168.10.77 255.255.255.192.";
    case "INVALID_IP":
      return ro ? `„${v}” nu este o adresă IPv4 validă: are nevoie de 4 numere între 0 și 255, separate prin puncte.` : `"${v}" is not a valid IPv4 address: it needs 4 numbers from 0 to 255, separated by dots.`;
    case "MISSING_MASK":
      return ro ? "Lipsește masca. Adaugă un prefix (de exemplu /24) sau o mască (255.255.255.0)." : "The mask is missing. Add a prefix (e.g. /24) or a mask (255.255.255.0).";
    case "INVALID_MASK":
      return ro ? `„${v}” nu este o mască validă. Folosește un prefix (/0 … /32) sau o mască precum 255.255.255.0.` : `"${v}" is not a valid mask. Use a prefix (/0 … /32) or a mask such as 255.255.255.0.`;
    case "NONCONTIGUOUS_MASK": {
      const base = ro ? `Masca ${v} nu este contiguă: în binar, toți biții de 1 trebuie să fie la început, urmați doar de 0.` : `The mask ${v} is not contiguous: in binary, all 1 bits must come first, followed only by 0s.`;
      if (d.looksLikeWildcard) {
        return base + (ro ? ` Pare o mască wildcard; masca corespunzătoare este ${d.suggestedMask} (/${d.suggestedPrefix}).` : ` It looks like a wildcard mask; the matching subnet mask is ${d.suggestedMask} (/${d.suggestedPrefix}).`);
      }
      return base;
    }
    case "PREFIX_RANGE":
      return ro ? "Prefixul trebuie să fie un număr între 0 și 32." : "The prefix must be a number from 0 to 32.";
    case "INVALID_OPTIONS":
      return ro ? "Alege fie numărul de subrețele, fie numărul de host-uri pe subrețea (un număr întreg pozitiv)." : "Choose either the number of subnets or the number of hosts per subnet (a positive whole number).";
    case "TOO_MANY_SUBNETS":
      return ro ? `Nu se pot face ${formatCount(Number(d.requested), "ro")} subrețele din /${d.prefix}: ar trebui împrumutați ${d.bitsNeeded} biți, dar mai sunt doar ${d.bitsAvailable}.` : `Cannot make ${formatCount(Number(d.requested), "en")} subnets from a /${d.prefix}: that needs ${d.bitsNeeded} borrowed bits, only ${d.bitsAvailable} are available.`;
    case "TOO_MANY_HOSTS":
      return ro ? `Rețeaua /${d.prefix} are cel mult ${plural(Number(d.maxHosts), "ro", HOSTS)}; nu încap ${formatCount(Number(d.requested), "ro")} într-o subrețea.` : `A /${d.prefix} holds at most ${plural(Number(d.maxHosts), "en", HOSTS)}; ${formatCount(Number(d.requested), "en")} won't fit in one subnet.`;
    case "INVALID_REQUIREMENT":
      return ro ? `Cerința nr. ${Number(d.index) + 1} are nevoie de un număr întreg de host-uri, cel puțin 1.` : `Requirement #${Number(d.index) + 1} needs a whole number of hosts, at least 1.`;
    case "VLSM_NO_FIT":
      return ro ? `Nu încape: cerințele au nevoie de ${plural(Number(d.needed), "ro", ADDRS)}, dar ${d.network} are doar ${formatCount(Number(d.available), "ro")}.` : `Doesn't fit: the requirements need ${plural(Number(d.needed), "en", ADDRS)}, but ${d.network} has only ${formatCount(Number(d.available), "en")}.`;
    default:
      return ro ? "Eroare necunoscută." : "Unknown error.";
  }
}

// ───────────────────────── Explicația pas cu pas ─────────────────────────

/** @typedef {{ id: string, title: string, text: string }} Step */

const ORD = {
  ro: ["primul", "al doilea", "al treilea", "al patrulea"],
  en: ["first", "second", "third", "fourth"],
};

/**
 * Lista multiplilor blocului, scurtată în jurul blocului care conține adresa.
 * @param {number} size
 * @param {number} start
 * @returns {string}
 */
function multiplesList(size, start) {
  const all = [];
  for (let v = 0; v < 256; v += size) all.push(v);
  if (all.length <= 8) return all.join(", ");
  const keep = new Set([0, 1, 2, all.length - 1]);
  const at = start / size;
  for (const i of [at - 1, at, at + 1]) if (i >= 0 && i < all.length) keep.add(i);
  const out = [];
  let prev = -1;
  for (const i of [...keep].sort((x, y) => x - y)) {
    if (prev !== -1 && i > prev + 1) out.push("…");
    out.push(String(all[i]));
    prev = i;
  }
  return out.join(", ");
}

/**
 * Explicația calculului prin metoda blocului („numărul magic”), în română sau engleză.
 * Fiecare pas are un `id` stabil: mask, octet, block, multiples, network, broadcast, hosts, count (+ role).
 * @param {string | number} ip
 * @param {number} [prefix]
 * @param {Lang} [lang]
 * @returns {Step[]}
 */
export function steps(ip, prefix, lang = "ro") {
  const a = analyze(ip, prefix);
  const ro = lang !== "en";
  const L = ro ? "ro" : "en";
  const p = a.prefix;
  const h = a.hostBits;
  const { size, octet, maskOctet, ipOctet, start } = a.block;
  const ord = ORD[L][octet - 1];
  const nb = (/** @type {number} */ n) => plural(n, L, BITS);
  /** @type {Step[]} */
  const out = [];

  let maskText;
  if (ro) {
    const which = p === 0 ? `niciun bit al măștii nu este 1` : p === 1 ? `primul bit al măștii este 1` : `primii ${nb(p)} ai măștii sunt 1`;
    maskText = `Prefixul /${p} înseamnă că ${which}: ${a.mask}. Pentru host-uri rămân 32 − ${p} = ${nb(h)}.`;
  } else {
    const which = p === 0 ? `no mask bit is 1` : p === 1 ? `the first mask bit is 1` : `the first ${nb(p)} of the mask are 1s`;
    maskText = `The /${p} prefix means ${which}: ${a.mask}. That leaves 32 − ${p} = ${nb(h)} for hosts.`;
  }
  out.push({ id: "mask", title: ro ? "Masca" : "The mask", text: maskText });

  const onBoundary = p % 8 === 0 && p > 0;
  out.push({
    id: "octet",
    title: ro ? "Octetul interesant" : "The interesting octet",
    text: p === 0
      ? (ro
        ? `La /0 nu există niciun bit de rețea, așa că lucrăm în primul octet, unde masca are valoarea 0: un singur bloc acoperă tot spațiul IPv4.`
        : `A /0 has no network bits at all, so we work in the first octet, where the mask holds 0: one block covers the whole IPv4 space.`)
      : ro
        ? `Octetul interesant este ${ord} octet: acolo se termină biții de rețea, iar masca are în el valoarea ${maskOctet}.` +
          (onBoundary && p < 32 ? ` Aici granița cade exact la capătul octetului, deci octeții de după sunt numai biți de host.` : "")
        : `The interesting octet is the ${ord} octet: that is where the network bits end, and the mask holds ${maskOctet} there.` +
          (onBoundary && p < 32 ? ` Here the boundary falls exactly at the end of the octet, so the octets after it are all host bits.` : ""),
  });

  out.push({
    id: "block",
    title: ro ? "Mărimea blocului" : "The block size",
    text: ro
      ? `Mărimea blocului („numărul magic”) = 256 − ${maskOctet} = ${size}.`
      : `Block size (the "magic number") = 256 − ${maskOctet} = ${size}.`,
  });

  out.push({
    id: "multiples",
    title: ro ? "Multiplii blocului" : "Multiples of the block size",
    text: ro
      ? `Subrețelele încep din ${size} în ${size} în ${ord} octet: ${multiplesList(size, start)}.`
      : `Subnets start every ${size} in the ${ord} octet: ${multiplesList(size, start)}.`,
  });

  const end = start + size - 1;
  const inBlock = size === 1
    ? (ro ? `Valoarea ${ipOctet} formează singură un bloc` : `The value ${ipOctet} is a block on its own`)
    : (ro ? `${ipOctet} este între ${start} și ${end}, deci adresa intră în blocul care începe la ${start}` : `${ipOctet} lies between ${start} and ${end}, so the address falls in the block starting at ${start}`);
  const zeroRest = octet < 4 ? (ro ? " Octeții de după octetul interesant devin 0." : " The octets after the interesting octet become 0.") : "";
  out.push({
    id: "network",
    title: ro ? "Adresa de rețea" : "The network address",
    text: ro
      ? `Adresa ${a.ip} are ${ipOctet} în ${ord} octet. ${inBlock}. Adresa de rețea este ${a.network}.${zeroRest}`
      : `The address ${a.ip} has ${ipOctet} in the ${ord} octet. ${inBlock}. The network address is ${a.network}.${zeroRest}`,
  });

  const nextTxt = a.nextNetwork
    ? (ro ? `Blocul următor începe la ${a.nextNetwork}. Ultima adresă = următoarea rețea − 1 = ${a.broadcast}.` : `The next block starts at ${a.nextNetwork}. Last address = next network − 1 = ${a.broadcast}.`)
    : (ro ? `Acesta este ultimul bloc din IPv4, deci ultima adresă este ${a.broadcast}.` : `This is the last block in IPv4, so the last address is ${a.broadcast}.`);
  out.push({
    id: "broadcast",
    title: ro ? "Adresa de broadcast" : "The broadcast address",
    text:
      nextTxt +
      (a.kind === "normal"
        ? (ro ? ` Aceasta este adresa de broadcast.` : ` That is the broadcast address.`)
        : a.kind === "point-to-point"
          ? (ro ? ` La /31 nu există broadcast (RFC 3021).` : ` A /31 has no broadcast (RFC 3021).`)
          : (ro ? ` La /32 blocul are o singură adresă.` : ` A /32 block has a single address.`)),
  });

  let hostsText;
  if (a.kind === "point-to-point") {
    hostsText = ro
      ? `La /31 (RFC 3021, legături punct-la-punct) nu se mai rezervă adrese pentru rețea și broadcast: ambele adrese, ${a.firstHost} și ${a.lastHost}, se dau celor două capete ale legăturii.`
      : `On a /31 (RFC 3021, point-to-point links) no addresses are reserved for network and broadcast: both addresses, ${a.firstHost} and ${a.lastHost}, go to the two ends of the link.`;
  } else if (a.kind === "host-route") {
    hostsText = ro
      ? `La /32 există o singură adresă, ${a.ip}: o rută către un singur host (de exemplu o interfață loopback).`
      : `A /32 contains a single address, ${a.ip}: a route to one host (for example a loopback interface).`;
  } else {
    hostsText = ro
      ? `Primul host = rețeaua + 1 = ${a.firstHost}. Ultimul host = broadcast − 1 = ${a.lastHost}.`
      : `First host = network + 1 = ${a.firstHost}. Last host = broadcast − 1 = ${a.lastHost}.`;
  }
  out.push({ id: "hosts", title: ro ? "Primul și ultimul host" : "First and last host", text: hostsText });

  const pow = `2^${h}`;
  let countText;
  if (a.kind === "point-to-point") {
    countText = ro ? `Host-uri utilizabile = ${pow} = 2 (fără scădere, excepția /31).` : `Usable hosts = ${pow} = 2 (nothing subtracted, the /31 exception).`;
  } else if (a.kind === "host-route") {
    countText = ro ? `Host-uri utilizabile = ${pow} = 1.` : `Usable hosts = ${pow} = 1.`;
  } else {
    countText = ro
      ? `Host-uri utilizabile = ${pow} − 2 = ${formatCount(a.totalAddresses, L)} − 2 = ${plural(a.usableHosts, L, HOSTS)} (se scad adresa de rețea și cea de broadcast).`
      : `Usable hosts = ${pow} − 2 = ${formatCount(a.totalAddresses, L)} − 2 = ${plural(a.usableHosts, L, HOSTS)} (minus the network and broadcast addresses).`;
  }
  out.push({ id: "count", title: ro ? "Numărul de host-uri" : "Number of hosts", text: countText });

  if (a.ipRole !== "host") {
    out.push({
      id: "role",
      title: ro ? "Atenție" : "Note",
      text: a.ipRole === "network"
        ? (ro ? `${a.ip} este chiar adresa de rețea: nu poate fi dată unui host.` : `${a.ip} is the network address itself: it cannot be assigned to a host.`)
        : (ro ? `${a.ip} este chiar adresa de broadcast: nu poate fi dată unui host.` : `${a.ip} is the broadcast address itself: it cannot be assigned to a host.`),
    });
  }
  return out;
}

// ───────────────────────── Împărțire în subrețele egale ─────────────────────────

/**
 * @typedef {{ index: number, network: string, firstHost: string, lastHost: string, broadcast: string, prefix: number, cidr: string }} SubnetRow
 */

/**
 * Cei mai puțini biți de host h (h ≥ 2) pentru care 2^h − 2 ≥ hosts. Metoda clasică CCNA:
 * pentru 1 sau 2 host-uri iese /30 (/31 și /32 nu sunt propuse automat).
 * @param {number} hosts
 * @returns {number}
 */
export function hostBitsFor(hosts) {
  let h = 2;
  while (h < 32 && 2 ** h - 2 < hosts) h++;
  return h;
}

/**
 * @param {number} prefix
 * @returns {number}
 */
function usableFor(prefix) {
  if (prefix === 32) return 1;
  if (prefix === 31) return 2;
  return 2 ** (32 - prefix) - 2;
}

/**
 * @param {number} netInt
 * @param {number} prefix
 * @param {number} index
 * @returns {SubnetRow}
 */
function subnetRow(netInt, prefix, index) {
  const a = analyze(netInt, prefix);
  return { index, network: a.network, firstHost: a.firstHost, lastHost: a.lastHost, broadcast: a.broadcast, prefix, cidr: a.cidr };
}

/**
 * Împarte o rețea în subrețele egale.
 * `split("192.168.1.0/24", { subnets: 5 })` sau `split("10.0.0.0/16", { hostsPerSubnet: 500 })`.
 * Dacă adresa are biți de host setați, se folosește rețeaua ei (`normalized: true`).
 * @param {string} cidr
 * @param {{ subnets?: number, hostsPerSubnet?: number, limit?: number }} opts
 */
export function split(cidr, opts) {
  const { ip, prefix } = parseOrThrow(cidr);
  const o = opts ?? {};
  const hasS = o.subnets !== undefined;
  const hasH = o.hostsPerSubnet !== undefined;
  const limit = o.limit ?? 256;
  if (hasS === hasH) throw new SubnetError("INVALID_OPTIONS");
  const want = /** @type {number} */ (hasS ? o.subnets : o.hostsPerSubnet);
  if (!Number.isInteger(want) || want < 1 || !Number.isFinite(want)) throw new SubnetError("INVALID_OPTIONS", { value: want });

  const base = analyze(ip, prefix);
  let newPrefix;
  if (hasS) {
    let bitsNeeded = 0;
    while (2 ** bitsNeeded < want) bitsNeeded++;
    if (prefix + bitsNeeded > 32) {
      throw new SubnetError("TOO_MANY_SUBNETS", { requested: want, prefix, bitsNeeded, bitsAvailable: 32 - prefix });
    }
    newPrefix = prefix + bitsNeeded;
  } else {
    const h = hostBitsFor(want);
    if (2 ** h - 2 < want || 32 - h < prefix) {
      throw new SubnetError("TOO_MANY_HOSTS", { requested: want, prefix, maxHosts: usableFor(prefix) });
    }
    newPrefix = 32 - h;
  }

  const borrowedBits = newPrefix - prefix;
  const subnetCount = 2 ** borrowedBits;
  const step = 2 ** (32 - newPrefix);
  const shown = Math.min(subnetCount, limit);
  /** @type {SubnetRow[]} */
  const subnets = [];
  for (let i = 0; i < shown; i++) subnets.push(subnetRow(base.networkInt + i * step, newPrefix, i + 1));
  // Când lista e scurtată, adăugăm și ultima subrețea, ca utilizatorul să vadă capătul.
  const last = subnetCount > shown ? subnetRow(base.networkInt + (subnetCount - 1) * step, newPrefix, subnetCount) : null;

  return {
    network: base.network,
    prefix,
    cidr: base.cidr,
    normalized: base.networkInt !== ip,
    mode: hasS ? "subnets" : "hosts",
    requested: want,
    newPrefix,
    newMask: prefixToMask(newPrefix),
    borrowedBits,
    subnetCount,
    addressesPerSubnet: step,
    hostsPerSubnet: usableFor(newPrefix),
    subnets,
    lastSubnet: last,
    truncated: subnetCount > shown,
  };
}

// ───────────────────────── VLSM ─────────────────────────

/**
 * @typedef {{ name: string, hosts: number }} VlsmRequirement
 * @typedef {{ name: string, index: number, hostsRequested: number, prefix: number, mask: string, network: string,
 *   firstHost: string, lastHost: string, broadcast: string, cidr: string, size: number, usableHosts: number, unusedHosts: number }} VlsmAllocation
 */

/**
 * Descompune intervalul [from, to] în cele mai mari blocuri CIDR aliniate.
 * @param {number} from
 * @param {number} to  inclusiv
 * @returns {{ network: string, prefix: number, cidr: string, size: number }[]}
 */
export function rangeToCidrs(from, to) {
  const out = [];
  let cur = from;
  while (cur <= to) {
    let size = 1;
    // cel mai mare bloc aliniat la `cur` care nu depășește `to`
    while (size < 2 ** 32 && cur % (size * 2) === 0 && cur + size * 2 - 1 <= to) size *= 2;
    const prefix = 32 - Math.log2(size);
    out.push({ network: intToIp(cur), prefix, cidr: `${intToIp(cur)}/${prefix}`, size });
    cur += size;
  }
  return out;
}

/**
 * Alocare VLSM: cerințele se sortează descrescător după host-uri (la egalitate rămâne ordinea dată),
 * fiecare primește cel mai mic bloc cu 2^h − 2 ≥ host-uri, iar blocurile se pun unul după altul de la începutul rețelei.
 * @param {string} cidr
 * @param {VlsmRequirement[]} requirements
 */
export function vlsm(cidr, requirements) {
  const { ip, prefix } = parseOrThrow(cidr);
  const base = analyze(ip, prefix);
  if (!Array.isArray(requirements) || requirements.length === 0) throw new SubnetError("INVALID_REQUIREMENT", { index: 0 });
  const reqs = requirements.map((r, index) => {
    const hosts = r?.hosts;
    if (!Number.isInteger(hosts) || /** @type {number} */ (hosts) < 1) throw new SubnetError("INVALID_REQUIREMENT", { index, value: hosts });
    const h = hostBitsFor(/** @type {number} */ (hosts));
    return { name: String(r.name ?? "").trim() || `#${index + 1}`, index, hosts: /** @type {number} */ (hosts), h, size: 2 ** h };
  });
  const sorted = [...reqs].sort((x, y) => y.hosts - x.hosts || x.index - y.index);
  const available = base.totalAddresses;
  const needed = sorted.reduce((s, r) => s + r.size, 0);
  const tooBig = sorted.some((r) => 2 ** r.h - 2 < r.hosts || r.h > 32 - prefix);
  if (needed > available || tooBig) {
    throw new SubnetError("VLSM_NO_FIT", { needed, available, network: base.cidr });
  }

  // Blocurile sunt puteri ale lui 2 sortate descrescător și rețeaua e aliniată la mărimea ei,
  // deci alocarea secvențială păstrează fiecare bloc aliniat.
  let cursor = base.networkInt;
  /** @type {VlsmAllocation[]} */
  const allocations = sorted.map((r) => {
    const p = 32 - r.h;
    const a = analyze(cursor, p);
    cursor += r.size;
    return {
      name: r.name, index: r.index, hostsRequested: r.hosts, prefix: p, mask: a.mask, network: a.network,
      firstHost: a.firstHost, lastHost: a.lastHost, broadcast: a.broadcast, cidr: a.cidr,
      size: r.size, usableHosts: a.usableHosts, unusedHosts: a.usableHosts - r.hosts,
    };
  });
  const free = cursor <= base.broadcastInt ? rangeToCidrs(cursor, base.broadcastInt) : [];
  return {
    network: base.network,
    prefix,
    cidr: base.cidr,
    normalized: base.networkInt !== ip,
    allocations,
    usedAddresses: needed,
    totalAddresses: available,
    unusedAddresses: available - needed,
    unused: free,
  };
}
