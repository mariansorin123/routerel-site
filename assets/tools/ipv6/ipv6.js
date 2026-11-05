// IPv6: prescurtare, extindere, tipul adresei, prefix și EUI-64 — Routerel (routerel.app).
// Modul ES fără dependențe, doar funcții pure. Rulează în browser și în Node (>= 18).
//
// O adresă e ținută intern ca 8 grupuri de câte 16 biți (numere 0 … 0xffff), de la stânga la dreapta.
// Numărul de adrese dintr-un prefix (până la 2^128) se calculează cu BigInt.

/** @typedef {"ro" | "en"} Lang */
/** @typedef {number[]} Groups  exact 8 numere 0 … 65535 */

/**
 * @typedef {"EMPTY" | "INVALID_CHAR" | "IPV4_ONLY" | "TOO_FEW_GROUPS" | "TOO_MANY_GROUPS" | "MULTIPLE_DOUBLE_COLON" |
 *   "EMPTY_GROUP" | "GROUP_TOO_LONG" | "INVALID_IPV4" | "IPV4_POSITION" | "INVALID_ZONE" | "INVALID_PREFIX" |
 *   "PREFIX_RANGE" | "MAC_EMPTY" | "INVALID_MAC" | "EUI64_PREFIX"} ErrorCode
 */

/** Eroare cu un cod stabil (pentru UI și teste) și detalii opționale. */
export class Ipv6Error extends Error {
  /**
   * @param {ErrorCode} code
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, details = {}) {
    super(errorMessage({ code, details }, "en"));
    this.name = "Ipv6Error";
    /** @type {ErrorCode} */
    this.code = code;
    /** @type {Record<string, unknown>} */
    this.details = details;
  }
}

// ───────────────────────── Citirea textului ─────────────────────────

/**
 * @typedef {{ ok: true, groups: Groups, prefix: number | null, zone: string | null, hasIpv4: boolean,
 *   doubleColon: { at: number, count: number } | null, written: string[] }} ParseOk
 *   `written` = grupurile așa cum au fost scrise (fără cele ascunse de „::”), `doubleColon.at` = indexul primului grup ascuns
 * @typedef {{ ok: false, error: { code: ErrorCode, details: Record<string, unknown> } }} ParseFail
 * @typedef {ParseOk | ParseFail} ParseResult
 */

const IPV4_OCTET = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/;

/**
 * Citește o adresă IPv6 în orice formă validă (RFC 4291 §2.2): completă, prescurtată cu „::”, cu zerouri în față sau fără,
 * litere mari sau mici, cu IPv4 la final (::ffff:192.0.2.1), opțional cu prefix (/64) și identificator de zonă (%eth0).
 * Nu aruncă excepții.
 * @param {string} input
 * @returns {ParseResult}
 */
export function parseInput(input) {
  const fail = (/** @type {ErrorCode} */ code, details = {}) => /** @type {ParseFail} */ ({ ok: false, error: { code, details } });
  let text = String(input ?? "").trim();
  if (!text) return fail("EMPTY");

  /** @type {number | null} */
  let prefix = null;
  const slash = text.indexOf("/");
  if (slash !== -1) {
    const p = text.slice(slash + 1).trim();
    text = text.slice(0, slash).trim();
    if (!/^\d+$/.test(p)) return fail("INVALID_PREFIX", { value: p });
    prefix = Number(p);
    if (prefix > 128 || p.length > 3) return fail("PREFIX_RANGE", { value: p });
  }

  /** @type {string | null} */
  let zone = null;
  const pct = text.indexOf("%");
  if (pct !== -1) {
    zone = text.slice(pct + 1);
    text = text.slice(0, pct);
    if (!/^[0-9A-Za-z._~-]+$/.test(zone)) return fail("INVALID_ZONE", { value: zone });
  }
  if (!text) return fail("EMPTY");

  for (const ch of text) {
    if (!/[0-9a-fA-F:.]/.test(ch)) return fail("INVALID_CHAR", { char: ch });
  }
  if (!text.includes(":")) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return fail("IPV4_ONLY", { value: text });
    return fail("TOO_FEW_GROUPS", { count: 1 });
  }
  if (text.includes(":::")) return fail("EMPTY_GROUP");
  const first = text.indexOf("::");
  if (first !== -1 && text.indexOf("::", first + 1) !== -1) return fail("MULTIPLE_DOUBLE_COLON");

  const hasDouble = first !== -1;
  const headText = hasDouble ? text.slice(0, first) : text;
  const tailText = hasDouble ? text.slice(first + 2) : "";
  const head = headText ? headText.split(":") : [];
  const tail = tailText ? tailText.split(":") : [];
  const all = [...head, ...tail];
  if (all.some((g) => g === "")) return fail("EMPTY_GROUP");

  // partea IPv4 poate fi doar ultimul grup
  const ipv4At = all.findIndex((g) => g.includes("."));
  if (ipv4At !== -1 && (ipv4At !== all.length - 1 || (hasDouble && !tail.length))) return fail("IPV4_POSITION", { value: all[ipv4At] });
  /** @type {number[]} */
  let v4 = [];
  if (ipv4At !== -1) {
    const s = all[ipv4At];
    const parts = s.split(".");
    if (parts.length !== 4 || !parts.every((x) => IPV4_OCTET.test(x))) return fail("INVALID_IPV4", { value: s });
    const o = parts.map(Number);
    v4 = [(o[0] << 8) | o[1], (o[2] << 8) | o[3]];
  }
  const hexParts = ipv4At === -1 ? all : all.slice(0, -1);
  for (const g of hexParts) {
    if (g.length > 4) return fail("GROUP_TOO_LONG", { group: g });
  }
  const count = hexParts.length + v4.length;
  if (hasDouble ? count > 7 : count > 8) return fail("TOO_MANY_GROUPS", { count, doubleColon: hasDouble });
  if (!hasDouble && count < 8) return fail("TOO_FEW_GROUPS", { count });

  const nums = (/** @type {string[]} */ xs) => xs.filter((g) => !g.includes(".")).map((g) => parseInt(g, 16));
  const headNums = nums(head);
  const tailNums = nums(tail);
  // partea IPv4 e la capăt: după „::” (în coadă) sau, fără „::”, la sfârșitul singurei părți
  if (v4.length) (hasDouble ? tailNums : headNums).push(...v4);
  const missing = 8 - headNums.length - tailNums.length;
  const groups = [...headNums, ...Array(hasDouble ? missing : 0).fill(0), ...tailNums];
  return {
    ok: true,
    groups,
    prefix,
    zone,
    hasIpv4: v4.length > 0,
    doubleColon: hasDouble ? { at: headNums.length, count: missing } : null,
    written: all,
  };
}

/**
 * Ca `parseInput`, dar aruncă `Ipv6Error`.
 * @param {string} input
 */
export function parseOrThrow(input) {
  const r = parseInput(input);
  if (!r.ok) throw new Ipv6Error(r.error.code, r.error.details);
  return r;
}

/**
 * @param {string | Groups} x
 * @returns {Groups}
 */
function toGroups(x) {
  if (Array.isArray(x)) {
    if (x.length !== 8 || !x.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)) throw new TypeError("Expected 8 groups of 0 … 0xffff");
    return x;
  }
  return parseOrThrow(x).groups;
}

// ───────────────────────── Extindere și prescurtare ─────────────────────────

/**
 * Forma completă: 8 grupuri × 4 cifre hexa, cu litere mici.
 * @param {string | Groups} x
 * @returns {string}
 */
export function expand(x) {
  return toGroups(x).map((g) => g.toString(16).padStart(4, "0")).join(":");
}

/**
 * Șirurile de grupuri 0 consecutive (orice lungime ≥ 1), de la stânga la dreapta.
 * @param {Groups} groups
 * @returns {{ start: number, length: number }[]}
 */
export function zeroRuns(groups) {
  const out = [];
  let i = 0;
  while (i < 8) {
    if (groups[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    out.push({ start: i, length: j - i });
    i = j;
  }
  return out;
}

/**
 * Șirul care devine „::” după RFC 5952 §4.2: cel mai lung, de cel puțin 2 grupuri; la egalitate, primul.
 * @param {Groups} groups
 * @returns {{ start: number, length: number } | null}
 */
export function longestZeroRun(groups) {
  let best = null;
  for (const r of zeroRuns(groups)) if (r.length >= 2 && (!best || r.length > best.length)) best = r;
  return best;
}

/** @param {Groups} g */
export const isIpv4Mapped = (g) => g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff;

/**
 * Forma prescurtată recomandată de RFC 5952: litere mici, fără zerouri în fața grupurilor, cel mai lung șir de cel puțin
 * 2 grupuri 0 devine „::” (primul, la egalitate), un singur grup 0 rămâne „0”.
 * Pentru adresele IPv4-mapped (::ffff:0:0/96) se folosește implicit forma mixtă „::ffff:192.0.2.1” (RFC 5952 §5);
 * cu `{ ipv4Mixed: false }` iese doar hexa („::ffff:c000:201”).
 * @param {string | Groups} x
 * @param {{ ipv4Mixed?: boolean }} [opts]
 * @returns {string}
 */
export function compress(x, opts = {}) {
  const g = toGroups(x);
  if (opts.ipv4Mixed !== false && isIpv4Mapped(g)) return `::ffff:${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  const hex = g.map((n) => n.toString(16));
  const run = longestZeroRun(g);
  if (!run) return hex.join(":");
  return `${hex.slice(0, run.start).join(":")}::${hex.slice(run.start + run.length).join(":")}`;
}

/**
 * Cei 16 biți ai unui grup.
 * @param {number} group
 */
export const toBin16 = (group) => group.toString(2).padStart(16, "0");

// ───────────────────────── Prefix ─────────────────────────

/**
 * Masca pentru un prefix 0 … 128, ca 8 grupuri.
 * @param {number} prefix
 * @returns {Groups}
 */
export function prefixMask(prefix) {
  assertPrefix(prefix);
  return Array.from({ length: 8 }, (_, i) => {
    const bits = Math.max(0, Math.min(16, prefix - i * 16));
    return bits === 0 ? 0 : (0xffff << (16 - bits)) & 0xffff;
  });
}

/** @param {unknown} p */
function assertPrefix(p) {
  if (!Number.isInteger(p) || /** @type {number} */ (p) < 0 || /** @type {number} */ (p) > 128) throw new Ipv6Error("PREFIX_RANGE", { value: p });
}

/**
 * Prima și ultima adresă din prefix (biții de după prefix puși pe 0, respectiv pe 1).
 * @param {string | Groups} x
 * @param {number} prefix
 * @returns {{ network: Groups, last: Groups }}
 */
export function prefixRange(x, prefix) {
  const g = toGroups(x);
  const m = prefixMask(prefix);
  return { network: g.map((n, i) => n & m[i]), last: g.map((n, i) => (n & m[i]) | (~m[i] & 0xffff)) };
}

// ───────────────────────── Tipul adresei ─────────────────────────

/**
 * @typedef {"unspecified" | "loopback" | "ipv4-mapped" | "documentation" | "global-unicast" | "link-local" |
 *   "site-local" | "unique-local" | "multicast" | "reserved"} TypeId
 * @typedef {{ id: TypeId, cidr: string, rfc: string, cast: "unicast" | "multicast" | "special",
 *   label: { ro: string, en: string }, note: { ro: string, en: string } }} AddressType
 */

/** Ordonate de la cel mai specific la cel mai larg (prima potrivire câștigă). @type {AddressType[]} */
export const ADDRESS_TYPES = [
  { id: "unspecified", cidr: "::/128", rfc: "RFC 4291", cast: "special",
    label: { ro: "Adresa nespecificată", en: "Unspecified address" },
    note: { ro: "Înseamnă „încă nicio adresă”: apare ca sursă când un dispozitiv își caută adresa (de exemplu la DAD). Nu se configurează pe o interfață.", en: "Means \"no address yet\": used as the source while a device is still getting an address (for example during DAD). Never configured on an interface." } },
  { id: "loopback", cidr: "::1/128", rfc: "RFC 4291", cast: "special",
    label: { ro: "Loopback", en: "Loopback" },
    note: { ro: "Dispozitivul vorbește cu el însuși, ca 127.0.0.1 în IPv4. Pachetele nu ies niciodată pe rețea.", en: "The device talking to itself, like 127.0.0.1 in IPv4. Packets never leave the device." } },
  { id: "ipv4-mapped", cidr: "::ffff:0:0/96", rfc: "RFC 4291", cast: "special",
    label: { ro: "IPv4-mapped", en: "IPv4-mapped" },
    note: { ro: "O adresă IPv4 scrisă în format IPv6. O folosesc intern sistemele dual-stack; nu apare în pachetele de pe rețea.", en: "An IPv4 address written in IPv6 form. Used internally by dual-stack systems; it does not appear in packets on the wire." } },
  { id: "documentation", cidr: "2001:db8::/32", rfc: "RFC 3849", cast: "unicast",
    label: { ro: "Documentație (2001:db8::/32)", en: "Documentation (2001:db8::/32)" },
    note: { ro: "Rezervată pentru exemple în cărți, cursuri și laboratoare. Face parte din spațiul unicast global, dar nu se rutează pe Internet.", en: "Reserved for examples in books, courses and labs. It sits inside the global unicast space but is never routed on the Internet." } },
  { id: "global-unicast", cidr: "2000::/3", rfc: "RFC 4291", cast: "unicast",
    label: { ro: "Unicast global (GUA)", en: "Global unicast (GUA)" },
    note: { ro: "Adresă publică, unică pe Internet și rutabilă, echivalentul adreselor IPv4 publice. Toate încep cu 2 sau 3.", en: "A public address, unique on the Internet and routable, like public IPv4 addresses. They all start with 2 or 3." } },
  { id: "link-local", cidr: "fe80::/10", rfc: "RFC 4291", cast: "unicast",
    label: { ro: "Link-local", en: "Link-local" },
    note: { ro: "Valabilă doar pe legătura locală (același segment); routerele nu o trimit mai departe. Fiecare interfață IPv6 are una, iar routerele o folosesc ca next hop.", en: "Valid only on the local link (the same segment); routers never forward it. Every IPv6 interface has one, and routers use it as the next hop." } },
  { id: "site-local", cidr: "fec0::/10", rfc: "RFC 3879", cast: "unicast",
    label: { ro: "Site-local (învechită)", en: "Site-local (deprecated)" },
    note: { ro: "Tip vechi de adresă privată, renunțat în 2004. În locul ei se folosesc adresele unique local (fc00::/7).", en: "An old kind of private address, deprecated in 2004. Unique local addresses (fc00::/7) replace it." } },
  { id: "unique-local", cidr: "fc00::/7", rfc: "RFC 4193", cast: "unicast",
    label: { ro: "Unicast local unic (ULA)", en: "Unique local (ULA)" },
    note: { ro: "Echivalentul adreselor private IPv4: merge în interiorul organizației, nu pe Internet. În practică încep cu fd (fd00::/8).", en: "The IPv6 counterpart of private IPv4: works inside an organisation, not on the Internet. In practice they start with fd (fd00::/8)." } },
  { id: "multicast", cidr: "ff00::/8", rfc: "RFC 4291", cast: "multicast",
    label: { ro: "Multicast", en: "Multicast" },
    note: { ro: "Un pachet către un grup de dispozitive. IPv6 nu are broadcast; multicastul îi ține locul.", en: "One packet to a group of devices. IPv6 has no broadcast; multicast takes its place." } },
];

/** @type {AddressType} */
const RESERVED = { id: "reserved", cidr: "", rfc: "RFC 4291", cast: "special",
  label: { ro: "Rezervată / nealocată", en: "Reserved / unassigned" },
  note: { ro: "Spațiul acesta nu e folosit pentru adrese obișnuite. Unicastul global începe cu 2 sau 3, link-local cu fe80, multicastul cu ff.", en: "This space is not used for ordinary addresses. Global unicast starts with 2 or 3, link-local with fe80, multicast with ff." } };

const TYPE_NETS = ADDRESS_TYPES.map((t) => {
  const [a, p] = t.cidr.split("/");
  const prefix = Number(p);
  return { type: t, prefix, net: prefixRange(a, prefix).network };
});

/**
 * Se potrivește adresa cu rețeaua `net`/`prefix`?
 * @param {Groups} g
 * @param {Groups} net
 * @param {number} prefix
 */
function inPrefix(g, net, prefix) {
  const m = prefixMask(prefix);
  return g.every((n, i) => (n & m[i]) === net[i]);
}

/** Domeniul (scope) unui multicast: ultima cifră din primul grup. */
export const MULTICAST_SCOPES = {
  1: { id: "interface-local", ro: "interfața locală", en: "interface-local" },
  2: { id: "link-local", ro: "legătura locală (link-local)", en: "link-local" },
  3: { id: "realm-local", ro: "realm-local", en: "realm-local" },
  4: { id: "admin-local", ro: "administrativ local", en: "admin-local" },
  5: { id: "site-local", ro: "site-ul (site-local)", en: "site-local" },
  8: { id: "organization-local", ro: "organizația", en: "organisation-local" },
  14: { id: "global", ro: "global (Internet)", en: "global" },
};

/** Grupuri multicast bine-cunoscute (forma prescurtată → nume). */
const WELL_KNOWN = {
  "ff01::1": { ro: "toate nodurile (pe interfață)", en: "all nodes (interface-local)" },
  "ff01::2": { ro: "toate routerele (pe interfață)", en: "all routers (interface-local)" },
  "ff02::1": { ro: "toate nodurile de pe legătură (all-nodes)", en: "all nodes on the link (all-nodes)" },
  "ff02::2": { ro: "toate routerele de pe legătură (all-routers)", en: "all routers on the link (all-routers)" },
  "ff02::5": { ro: "toate routerele OSPFv3", en: "all OSPFv3 routers" },
  "ff02::6": { ro: "routerele DR/BDR OSPFv3", en: "OSPFv3 DR/BDR routers" },
  "ff02::9": { ro: "routerele RIPng", en: "RIPng routers" },
  "ff02::a": { ro: "routerele EIGRP pentru IPv6", en: "EIGRP for IPv6 routers" },
  "ff02::d": { ro: "routerele PIM", en: "PIM routers" },
  "ff02::16": { ro: "rapoarte MLDv2", en: "MLDv2 reports" },
  "ff02::1:2": { ro: "toți agenții de releu și serverele DHCPv6", en: "all DHCPv6 relay agents and servers" },
  "ff05::2": { ro: "toate routerele din site", en: "all routers in the site" },
  "ff05::1:3": { ro: "toate serverele DHCPv6 din site", en: "all DHCPv6 servers in the site" },
};

/**
 * @typedef {AddressType & {
 *   multicast?: { scope: number, scopeName: { ro: string, en: string } | null, permanent: boolean,
 *     wellKnown: { ro: string, en: string } | null, solicitedNodeFor: string | null }
 * }} Classification
 */

/**
 * Tipul adresei (și, la multicast, domeniul și grupul cunoscut).
 * @param {string | Groups} x
 * @returns {Classification}
 */
export function classify(x) {
  const g = toGroups(x);
  const hit = TYPE_NETS.find((t) => inPrefix(g, t.net, t.prefix));
  const type = hit ? hit.type : RESERVED;
  if (type.id !== "multicast") return { ...type };
  const scope = g[0] & 0xf;
  const flags = (g[0] >> 4) & 0xf;
  const s = /** @type {Record<number, { ro: string, en: string }>} */ (MULTICAST_SCOPES)[scope];
  const short = compress(g, { ipv4Mixed: false });
  // solicited-node: ff02::1:ff00:0/104 + ultimii 24 de biți ai adresei unicast
  const solicited = g[0] === 0xff02 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 1 && (g[6] >> 8) === 0xff;
  const low24 = solicited ? `${(g[6] & 0xff).toString(16).padStart(2, "0")}:${g[7].toString(16).padStart(4, "0")}` : null;
  return {
    ...type,
    multicast: {
      scope,
      scopeName: s ? { ro: s.ro, en: s.en } : null,
      permanent: (flags & 1) === 0,
      wellKnown: /** @type {Record<string, {ro: string, en: string}>} */ (WELL_KNOWN)[short] ?? (solicited
        ? { ro: `solicited-node (NDP): o ascultă adresele unicast care se termină în …${low24}`, en: `solicited-node (NDP): joined by unicast addresses ending in …${low24}` }
        : null),
      solicitedNodeFor: low24,
    },
  };
}

/**
 * Adresa multicast solicited-node a unei adrese unicast: ff02::1:ff + ultimii 24 de biți.
 * @param {string | Groups} x
 * @returns {string}
 */
export function solicitedNode(x) {
  const g = toGroups(x);
  return compress([0xff02, 0, 0, 0, 0, 1, 0xff00 | (g[6] & 0xff), g[7]]);
}

// ───────────────────────── EUI-64 ─────────────────────────

/**
 * Citește o adresă MAC: 00:1a:2b:3c:4d:5e, 00-1A-2B-3C-4D-5E, 001a.2b3c.4d5e (Cisco) sau 001a2b3c4d5e.
 * @param {string} input
 * @returns {{ ok: true, bytes: number[] } | ParseFail}
 */
export function parseMac(input) {
  const text = String(input ?? "").trim();
  if (!text) return { ok: false, error: { code: "MAC_EMPTY", details: {} } };
  let hex = null;
  if (/^[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}$/i.test(text)) hex = text.replace(/[:-]/g, "");
  else if (/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(text)) hex = text.replace(/\./g, "");
  else if (/^[0-9a-f]{12}$/i.test(text)) hex = text;
  if (!hex) return { ok: false, error: { code: "INVALID_MAC", details: { value: text } } };
  const bytes = [];
  for (let i = 0; i < 12; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return { ok: true, bytes };
}

const hex2 = (/** @type {number} */ b) => b.toString(16).padStart(2, "0");

/**
 * @typedef {object} Eui64Result
 * @property {string} mac               „00:1a:2b:3c:4d:5e”
 * @property {string} macCisco          „001a.2b3c.4d5e”
 * @property {number[]} bytes           cei 8 octeți ai ID-ului de interfață
 * @property {string} withFffe          „00:1a:2b:ff:fe:3c:4d:5e” (înainte de inversarea bitului)
 * @property {{ before: number, after: number, bitWas: 0 | 1 }} firstByte  bitul 7 (U/L) = 0x02
 * @property {Groups} interfaceIdGroups 4 grupuri
 * @property {string} interfaceId       „021a:2bff:fe3c:4d5e”
 * @property {string} interfaceIdShort  „21a:2bff:fe3c:4d5e”
 * @property {{ input: string, network: string, normalized: boolean, address: string, expanded: string } | null} withPrefix
 * @property {string} linkLocal         „fe80::21a:2bff:fe3c:4d5e”
 */

/**
 * ID-ul de interfață EUI-64 dintr-o adresă MAC (RFC 4291, anexa A): se inserează ff:fe la mijloc și se inversează al 7-lea
 * bit al primului octet (bitul U/L). Opțional, cu un prefix /64 se obține adresa completă.
 * @param {string} mac
 * @param {{ prefix?: string }} [opts]  „2001:db8:acad:1::/64” (fără /lungime se presupune /64)
 * @returns {Eui64Result}
 */
export function eui64(mac, opts = {}) {
  const m = parseMac(mac);
  if (!m.ok) throw new Ipv6Error(m.error.code, m.error.details);
  const b = m.bytes;
  const flipped = b[0] ^ 0x02;
  const bytes = [flipped, b[1], b[2], 0xff, 0xfe, b[3], b[4], b[5]];
  const iid = [0, 2, 4, 6].map((i) => (bytes[i] << 8) | bytes[i + 1]);
  const iidText = iid.map((g) => g.toString(16).padStart(4, "0")).join(":");
  const linkLocal = compress([0xfe80, 0, 0, 0, ...iid]);

  let withPrefix = null;
  if (opts.prefix !== undefined && String(opts.prefix).trim() !== "") {
    const r = parseOrThrow(String(opts.prefix));
    const len = r.prefix ?? 64;
    if (len !== 64) throw new Ipv6Error("EUI64_PREFIX", { value: len });
    const net = r.groups.slice(0, 4);
    const full = [...net, ...iid];
    withPrefix = {
      input: String(opts.prefix).trim(),
      network: `${compress([...net, 0, 0, 0, 0])}/64`,
      normalized: r.groups.slice(4).some((x) => x !== 0),
      address: compress(full),
      expanded: expand(full),
    };
  }
  return {
    mac: b.map(hex2).join(":"),
    macCisco: [0, 2, 4].map((i) => hex2(b[i]) + hex2(b[i + 1])).join("."),
    bytes,
    withFffe: [b[0], b[1], b[2], 0xff, 0xfe, b[3], b[4], b[5]].map(hex2).join(":"),
    firstByte: { before: b[0], after: flipped, bitWas: /** @type {0|1} */ ((b[0] & 2) >> 1) },
    interfaceIdGroups: iid,
    interfaceId: iidText,
    interfaceIdShort: iid.map((g) => g.toString(16)).join(":"),
    withPrefix,
    linkLocal,
  };
}

/**
 * Dacă ID-ul de interfață pare EUI-64 (are ff:fe la mijloc), MAC-ul din care provine. Altfel `null`.
 * @param {Groups} g
 * @returns {string | null}
 */
export function macFromEui64(g) {
  if ((g[5] & 0xff) !== 0xff || (g[6] >> 8) !== 0xfe) return null;
  const b = [(g[4] >> 8) ^ 0x02, g[4] & 0xff, g[5] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff];
  return b.map(hex2).join(":");
}

// ───────────────────────── Analiza unei adrese ─────────────────────────

/**
 * @typedef {object} Analysis
 * @property {Groups} groups
 * @property {string} expanded
 * @property {string} compressed        RFC 5952 (formă mixtă pentru IPv4-mapped)
 * @property {string} compressedHex     doar hexa (diferă de `compressed` numai la IPv4-mapped)
 * @property {{ start: number, length: number } | null} zeroRun  grupurile înlocuite de „::”
 * @property {number | null} prefix
 * @property {string | null} zone
 * @property {Classification} type
 * @property {{ network: string, networkExpanded: string, cidr: string, first: string, last: string, lastExpanded: string,
 *   hostBits: number, addresses: bigint, subnets64: bigint | null, normalized: boolean } | null} range
 * @property {{ globalRoutingPrefix: string, subnetId: string, interfaceId: string } | null} structure  împărțirea tipică 48/16/64 (GUA)
 * @property {string | null} interfaceId  ultimii 64 de biți (pentru unicast)
 * @property {string | null} eui64Mac     MAC-ul, dacă ID-ul de interfață e EUI-64
 * @property {string | null} ipv4         adresa IPv4 din IPv4-mapped
 * @property {string | null} solicitedNode adresa multicast solicited-node (pentru unicast)
 */

/**
 * Analiza completă: formele scrise, tipul, prefixul și structura.
 * @param {string} input
 * @returns {Analysis}
 */
export function analyze(input) {
  const r = parseOrThrow(input);
  const g = r.groups;
  const type = classify(g);
  const p = r.prefix;
  let range = null;
  if (p !== null) {
    const { network, last } = prefixRange(g, p);
    const hostBits = 128 - p;
    range = {
      network: compress(network, { ipv4Mixed: false }),
      networkExpanded: expand(network),
      cidr: `${compress(network, { ipv4Mixed: false })}/${p}`,
      first: compress(network, { ipv4Mixed: false }),
      last: compress(last, { ipv4Mixed: false }),
      lastExpanded: expand(last),
      hostBits,
      addresses: 2n ** BigInt(hostBits),
      subnets64: p <= 64 ? 2n ** BigInt(64 - p) : null,
      normalized: network.some((n, i) => n !== g[i]),
    };
  }
  const h4 = (/** @type {number[]} */ xs) => xs.map((n) => n.toString(16).padStart(4, "0")).join(":");
  const unicast = type.cast === "unicast" || type.id === "loopback";
  return {
    groups: g,
    expanded: expand(g),
    compressed: compress(g),
    compressedHex: compress(g, { ipv4Mixed: false }),
    zeroRun: longestZeroRun(g),
    prefix: p,
    zone: r.zone,
    type,
    range,
    structure: type.id === "global-unicast" || type.id === "documentation"
      ? { globalRoutingPrefix: h4(g.slice(0, 3)), subnetId: h4(g.slice(3, 4)), interfaceId: h4(g.slice(4)) }
      : null,
    interfaceId: type.cast === "unicast" ? h4(g.slice(4)) : null,
    eui64Mac: type.cast === "unicast" ? macFromEui64(g) : null,
    ipv4: isIpv4Mapped(g) ? `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}` : null,
    solicitedNode: unicast && type.id !== "loopback" ? solicitedNode(g) : null,
  };
}

// ───────────────────────── Text: numere, mesaje ─────────────────────────

/**
 * Numere mari ușor de citit: spațiu fix în română, virgulă în engleză. Acceptă și BigInt.
 * @param {number | bigint} n
 * @param {Lang} [lang]
 */
export function formatCount(n, lang = "ro") {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "ro" ? " " : ",");
}

/**
 * „1 bit”, „2 biți”, „64 de biți”.
 * @param {number | bigint} n
 * @param {Lang} lang
 * @param {{ ro: [string, string], en: [string, string] }} forms
 */
export function plural(n, lang, forms) {
  const num = formatCount(n, lang);
  const big = BigInt(n);
  if (lang === "en") return `${num} ${big === 1n ? forms.en[0] : forms.en[1]}`;
  if (big === 1n) return `${num} ${forms.ro[0]}`;
  const r = Number(big % 100n);
  return `${num} ${big !== 0n && (r === 0 || r >= 20) ? "de " : ""}${forms.ro[1]}`;
}

/** @type {{ ro: [string, string], en: [string, string] }} */
const BITS = { ro: ["bit", "biți"], en: ["bit", "bits"] };
/** @type {{ ro: [string, string], en: [string, string] }} */
const GROUPS = { ro: ["grup", "grupuri"], en: ["group", "groups"] };
/** @type {{ ro: [string, string], en: [string, string] }} */
const DIGITS = { ro: ["cifră", "cifre"], en: ["digit", "digits"] };
/** @type {{ ro: [string, string], en: [string, string] }} */
const ADDRS = { ro: ["adresă", "adrese"], en: ["address", "addresses"] };
/** @type {{ ro: [string, string], en: [string, string] }} */
const SUBNETS = { ro: ["subrețea", "subrețele"], en: ["subnet", "subnets"] };
export const FORMS = { BITS, GROUPS, DIGITS, ADDRS, SUBNETS };

/**
 * Mesajul pentru o eroare, în limba cerută.
 * @param {{ code: ErrorCode, details?: Record<string, unknown> }} err
 * @param {Lang} [lang]
 * @returns {string}
 */
export function errorMessage(err, lang = "ro") {
  const d = err.details ?? {};
  const v = d.value === undefined ? "" : String(d.value);
  const ro = lang !== "en";
  switch (err.code) {
    case "EMPTY":
      return ro ? "Scrie o adresă IPv6, de exemplu 2001:db8:acad:1::10." : "Enter an IPv6 address, e.g. 2001:db8:acad:1::10.";
    case "INVALID_CHAR":
      return ro
        ? `„${d.char}” nu are voie într-o adresă IPv6: se folosesc doar cifrele 0–9, literele a–f și „:”.`
        : `"${d.char}" is not allowed in an IPv6 address: only the digits 0–9, the letters a–f and ":" are used.`;
    case "IPV4_ONLY":
      return ro
        ? `${v} este o adresă IPv4. Ca adresă IPv6 (IPv4-mapped) se scrie ::ffff:${v}.`
        : `${v} is an IPv4 address. As an IPv6 address (IPv4-mapped) it is written ::ffff:${v}.`;
    case "TOO_FEW_GROUPS":
      return ro
        ? `Adresa are doar ${plural(Number(d.count), "ro", GROUPS)} și nu folosește „::”. O adresă IPv6 are 8 grupuri; dacă lipsesc grupuri de zero, scrie „::” în locul lor.`
        : `The address has only ${plural(Number(d.count), "en", GROUPS)} and no "::". An IPv6 address has 8 groups; if zero groups are left out, write "::" in their place.`;
    case "TOO_MANY_GROUPS":
      return d.doubleColon
        ? (ro ? `Prea multe grupuri: cu „::” pot fi scrise cel mult 7 grupuri (aici sunt ${d.count}), pentru că „::” ține locul a cel puțin unui grup.` : `Too many groups: with "::" at most 7 groups can be written (this has ${d.count}), because "::" stands for at least one group.`)
        : (ro ? `Prea multe grupuri: o adresă IPv6 are exact 8 (aici sunt ${d.count}).` : `Too many groups: an IPv6 address has exactly 8 (this has ${d.count}).`);
    case "MULTIPLE_DOUBLE_COLON":
      return ro
        ? "„::” poate apărea o singură dată, altfel nu se știe câte grupuri de zero ține fiecare."
        : "\"::\" may appear only once; otherwise there is no way to tell how many zero groups each one stands for.";
    case "EMPTY_GROUP":
      return ro
        ? "Lipsește un grup: între două „:” trebuie să fie cifre. Doar „::” (o singură dată) poate ține locul grupurilor de zero, iar adresa nu poate începe sau termina cu un singur „:”."
        : "A group is missing: there must be digits between two \":\". Only \"::\" (once) may stand for zero groups, and the address cannot start or end with a single \":\".";
    case "GROUP_TOO_LONG":
      return ro
        ? `Grupul „${d.group}” are prea multe cifre: un grup are cel mult 4 cifre hexazecimale (16 biți).`
        : `The group "${d.group}" has too many digits: a group has at most 4 hexadecimal digits (16 bits).`;
    case "INVALID_IPV4":
      return ro
        ? `Partea IPv4 „${v}” nu e validă: trebuie 4 numere între 0 și 255, fără zerouri în față.`
        : `The IPv4 part "${v}" is not valid: it needs 4 numbers from 0 to 255, without leading zeros.`;
    case "IPV4_POSITION":
      return ro ? "Partea IPv4 (cu puncte) poate sta doar la sfârșitul adresei, în locul ultimelor 2 grupuri." : "The IPv4 part (with dots) can only come at the end, in place of the last 2 groups.";
    case "INVALID_ZONE":
      return ro ? `Identificatorul de zonă „%${v}” nu e valid (de exemplu %eth0 sau %12).` : `The zone ID "%${v}" is not valid (e.g. %eth0 or %12).`;
    case "INVALID_PREFIX":
      return ro ? `Prefixul „/${v}” nu e un număr. Scrie de exemplu /64.` : `The prefix "/${v}" is not a number. Write e.g. /64.`;
    case "PREFIX_RANGE":
      return ro ? "Prefixul trebuie să fie un număr între 0 și 128." : "The prefix must be a number from 0 to 128.";
    case "MAC_EMPTY":
      return ro ? "Scrie o adresă MAC, de exemplu 00:1a:2b:3c:4d:5e." : "Enter a MAC address, e.g. 00:1a:2b:3c:4d:5e.";
    case "INVALID_MAC":
      return ro
        ? `„${v}” nu e o adresă MAC validă. Formate acceptate: 00:1a:2b:3c:4d:5e, 00-1A-2B-3C-4D-5E, 001a.2b3c.4d5e.`
        : `"${v}" is not a valid MAC address. Accepted formats: 00:1a:2b:3c:4d:5e, 00-1A-2B-3C-4D-5E, 001a.2b3c.4d5e.`;
    case "EUI64_PREFIX":
      return ro
        ? `EUI-64 are nevoie de un prefix /64 (64 de biți de rețea + 64 de biți ID de interfață); ai dat /${v}.`
        : `EUI-64 needs a /64 prefix (64 network bits + a 64-bit interface ID); you gave /${v}.`;
    default:
      return ro ? "Eroare necunoscută." : "Unknown error.";
  }
}

// ───────────────────────── Explicațiile pas cu pas ─────────────────────────

/** @typedef {{ id: string, title: string, text: string }} Step */

const ORD_RO = ["primul", "al 2-lea", "al 3-lea", "al 4-lea", "al 5-lea", "al 6-lea", "al 7-lea", "al 8-lea"];
const ORD_EN = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

/**
 * „grupul 3”, „grupurile 3–5” (numerotate de la 1).
 * @param {{ start: number, length: number }} run
 * @param {boolean} ro
 */
function runName(run, ro) {
  const a = run.start + 1;
  const b = run.start + run.length;
  return run.length === 1 ? (ro ? `grupul ${a}` : `group ${a}`) : (ro ? `grupurile ${a}–${b}` : `groups ${a}–${b}`);
}

/**
 * Cum se scrie adresa completă (extinderea), pornind de la textul introdus.
 * Id-uri: `count` (doar cu „::”), `ipv4` (doar cu IPv4 la final), `pad`, `result`.
 * @param {string} input
 * @param {Lang} [lang]
 * @returns {Step[]}
 */
export function expandSteps(input, lang = "ro") {
  const r = parseOrThrow(input);
  const ro = lang !== "en";
  const L = ro ? "ro" : "en";
  /** @type {Step[]} */
  const out = [];
  const g = r.groups;
  if (r.doubleColon) {
    const written = r.written.length + (r.hasIpv4 ? 1 : 0);
    const k = r.doubleColon.count;
    const shown = r.written.map((x) => x).join(", ");
    out.push({
      id: "count",
      title: ro ? "Câte grupuri ascunde „::”" : "How many groups \"::\" hides",
      text: ro
        ? `O adresă IPv6 are 8 grupuri. ${written === 0 ? "Aici nu e scris niciun grup" : `Aici sunt scrise ${plural(written, L, GROUPS)}${r.hasIpv4 ? " (partea IPv4 contează ca 2)" : ""}: ${shown}`}. Deci „::” ține locul a 8 − ${written} = ${plural(k, L, GROUPS)} de 0000.`.replace("sunt scrise 1 grup", "e scris 1 grup")
        : `An IPv6 address has 8 groups. ${written === 0 ? "No group is written here" : `Here ${plural(written, L, GROUPS)} ${written === 1 ? "is" : "are"} written${r.hasIpv4 ? " (the IPv4 part counts as 2)" : ""}: ${shown}`}. So "::" stands for 8 − ${written} = ${k} zero ${k === 1 ? "group" : "groups"} (0000).`,
    });
  }
  if (r.hasIpv4) {
    const v4 = r.written[r.written.length - 1];
    const o = v4.split(".").map(Number);
    const h = (/** @type {number} */ n) => n.toString(16).padStart(2, "0");
    out.push({
      id: "ipv4",
      title: ro ? "Partea IPv4 în hexazecimal" : "The IPv4 part in hexadecimal",
      text: ro
        ? `Partea IPv4 ${v4} ocupă ultimele 2 grupuri (32 de biți). Fiecare octet devine 2 cifre hexazecimale: ${o.map((n) => `${n} = ${h(n)}`).join(", ")}. Deci ${o[0]}.${o[1]} → ${h(o[0])}${h(o[1])} și ${o[2]}.${o[3]} → ${h(o[2])}${h(o[3])}.`
        : `The IPv4 part ${v4} fills the last 2 groups (32 bits). Each octet becomes 2 hexadecimal digits: ${o.map((n) => `${n} = ${h(n)}`).join(", ")}. So ${o[0]}.${o[1]} → ${h(o[0])}${h(o[1])} and ${o[2]}.${o[3]} → ${h(o[2])}${h(o[3])}.`,
    });
  }
  const short = r.written.filter((x) => !x.includes(".") && x.length < 4);
  const padExamples = [...new Set(short)].slice(0, 3).map((x) => `${x} → ${x.toLowerCase().padStart(4, "0")}`);
  out.push({
    id: "pad",
    title: ro ? "Câte 4 cifre în fiecare grup" : "Four digits in every group",
    text: (ro
      ? `Fiecare grup are 16 biți, adică 4 cifre hexazecimale. Unde sunt mai puține, adăugăm zerouri în față (în stânga)${padExamples.length ? `: ${padExamples.join(", ")}` : ""}.`
      : `Each group is 16 bits, which is 4 hexadecimal digits. Where there are fewer, add zeros in front (on the left)${padExamples.length ? `: ${padExamples.join(", ")}` : ""}.`) +
      (padExamples.length ? "" : (ro ? " Aici toate grupurile scrise au deja 4 cifre." : " Here every written group already has 4 digits.")),
  });
  out.push({
    id: "result",
    title: ro ? "Forma completă" : "Full form",
    text: ro ? `${expand(g)} (8 grupuri × 4 cifre = 32 de cifre hexazecimale, 128 de biți).` : `${expand(g)} (8 groups × 4 digits = 32 hexadecimal digits, 128 bits).`,
  });
  return out;
}

/**
 * Cum se prescurtează adresa după RFC 5952.
 * Id-uri: `full`, `leading`, `run`, `ipv4` (doar IPv4-mapped), `result`.
 * @param {string} input
 * @param {Lang} [lang]
 * @returns {Step[]}
 */
export function compressSteps(input, lang = "ro") {
  const r = parseOrThrow(input);
  const ro = lang !== "en";
  const L = ro ? "ro" : "en";
  const g = r.groups;
  /** @type {Step[]} */
  const out = [];
  out.push({
    id: "full",
    title: ro ? "Pornim de la forma completă" : "Start from the full form",
    text: ro ? `${expand(g)}.` : `${expand(g)}.`,
  });
  const noLead = g.map((n) => n.toString(16)).join(":");
  const hasUpper = /[A-F]/.test(r.written.join(""));
  out.push({
    id: "leading",
    title: ro ? "Scoatem zerourile din față" : "Drop the leading zeros",
    text: ro
      ? `În fiecare grup ștergem zerourile din față (din stânga); un grup care e doar 0000 rămâne „0”. Zerourile de la sfârșitul unui grup nu se ating.${hasUpper ? " Literele se scriu mici." : ""} Rezultă ${noLead}.`
      : `In every group delete the zeros in front (on the left); a group that is just 0000 stays "0". Zeros at the end of a group are never touched.${hasUpper ? " Letters are written in lowercase." : ""} That gives ${noLead}.`,
  });

  const runs = zeroRuns(g);
  const best = longestZeroRun(g);
  let runText;
  if (!runs.length) {
    runText = ro ? "Nu există niciun grup 0, deci nu folosim „::”." : "There is no zero group, so \"::\" is not used.";
  } else if (!best) {
    runText = ro
      ? `Există doar grupuri 0 izolate (${runs.map((x) => runName(x, true)).join(", ")}). RFC 5952 nu folosește „::” pentru un singur grup, deci rămâne „0”.`
      : `There are only single zero groups (${runs.map((x) => runName(x, false)).join(", ")}). RFC 5952 never uses "::" for a single group, so it stays "0".`;
  } else {
    const ties = runs.filter((x) => x.length === best.length);
    const others = runs.filter((x) => x !== best);
    const base = ro
      ? `Cel mai lung șir de grupuri 0 consecutive: ${runName(best, true)} (${plural(best.length, L, GROUPS)}). Îl înlocuim cu „::”.`
      : `The longest run of consecutive zero groups is ${runName(best, false)} (${plural(best.length, L, GROUPS)}). Replace it with "::".`;
    const tie = ties.length > 1
      ? (ro ? ` Există mai multe șiruri la fel de lungi (${ties.map((x) => runName(x, true)).join(" și ")}); RFC 5952 cere să-l alegem pe primul.` : ` Several runs are equally long (${ties.map((x) => runName(x, false)).join(" and ")}); RFC 5952 says to pick the first one.`)
      : "";
    const rest = others.length
      ? (ro ? ` Celelalte grupuri 0 rămân scrise „0”, pentru că „::” poate apărea o singură dată.` : ` The other zero groups stay as "0", because "::" may appear only once.`)
      : "";
    runText = base + tie + rest;
  }
  out.push({ id: "run", title: ro ? "Înlocuim zerourile cu „::”" : "Replace zeros with \"::\"", text: runText });

  if (isIpv4Mapped(g)) {
    out.push({
      id: "ipv4",
      title: ro ? "Adresa IPv4-mapped" : "IPv4-mapped address",
      text: ro
        ? `Adresa începe cu ::ffff:, deci ultimele 2 grupuri sunt o adresă IPv4. RFC 5952 recomandă să le scriem zecimal, cu puncte: ${compress(g)} (în hexazecimal ar fi ${compress(g, { ipv4Mixed: false })}).`
        : `The address starts with ::ffff:, so the last 2 groups are an IPv4 address. RFC 5952 recommends writing them in dotted decimal: ${compress(g)} (in hexadecimal it would be ${compress(g, { ipv4Mixed: false })}).`,
    });
  }
  out.push({
    id: "result",
    title: ro ? "Forma prescurtată" : "Compressed form",
    text: ro ? `${compress(g)}.` : `${compress(g)}.`,
  });
  return out;
}

/**
 * Cum se află rețeaua (prefixul) unei adrese. Cere un prefix în text (de ex. „2001:db8:acad:1::10/64”).
 * Id-uri: `bits`, `digits`, `partial` (doar dacă prefixul nu e multiplu de 4), `network`, `last`, `size`.
 * @param {string} input
 * @param {Lang} [lang]
 * @returns {Step[]}
 */
export function prefixSteps(input, lang = "ro") {
  const r = parseOrThrow(input);
  const ro = lang !== "en";
  const L = ro ? "ro" : "en";
  if (r.prefix === null) return [];
  const p = r.prefix;
  const g = r.groups;
  const { network, last } = prefixRange(g, p);
  /** @type {Step[]} */
  const out = [];
  const nb = (/** @type {number} */ n) => plural(n, L, BITS);
  out.push({
    id: "bits",
    title: ro ? "Ce înseamnă prefixul" : "What the prefix means",
    text: ro
      ? `/${p} înseamnă că ${p === 0 ? "niciun bit nu ține de rețea" : `primii ${nb(p)} sunt partea de rețea (prefixul)`}; ${128 - p === 0 ? "nu rămâne niciun bit pentru interfață" : `ultimii ${nb(128 - p)} rămân pentru subrețele și interfețe`}.`.replace("primii 1 bit sunt", "primul bit este").replace("ultimii 1 bit rămân", "ultimul bit rămâne")
      : `/${p} means ${p === 0 ? "no bit belongs to the network" : `the first ${nb(p)} are the network part (the prefix)`}; ${128 - p === 0 ? "no bits are left for the interface" : `the last ${nb(128 - p)} are left for subnets and interfaces`}.`.replace("the first 1 bit are", "the first bit is").replace("the last 1 bit are", "the last bit is"),
  });

  const full = Math.floor(p / 4);
  const extra = p % 4;
  const fullGroups = Math.floor(p / 16);
  const digitsInGroup = Math.floor((p % 16) / 4);
  const groupTxt = ro
    ? `${fullGroups ? `${plural(fullGroups, L, GROUPS)} ${fullGroups === 1 ? "întreg" : "întregi"}` : ""}${fullGroups && digitsInGroup ? " și " : ""}${digitsInGroup ? `${plural(digitsInGroup, L, DIGITS)} din ${ORD_RO[fullGroups]} grup` : ""}`
    : `${fullGroups ? `${fullGroups} whole ${fullGroups === 1 ? "group" : "groups"}` : ""}${fullGroups && digitsInGroup ? " and " : ""}${digitsInGroup ? `${plural(digitsInGroup, L, DIGITS)} of the ${ORD_EN[fullGroups]} group` : ""}`;
  let keeps;
  if (p === 0) keeps = ro ? "prefixul nu păstrează nimic, deci se potrivește cu orice adresă (ca ruta implicită ::/0)" : "the prefix keeps nothing, so it matches every address (like the default route ::/0)";
  else if (full === 0) keeps = ro ? `prefixul păstrează doar ${extra === 1 ? "primul bit" : `primii ${nb(extra)}`} din prima cifră` : `the prefix keeps only the first ${extra === 1 ? "bit" : nb(extra)} of the first digit`;
  else {
    const fd = full === 1 ? (ro ? "prima cifră" : "the first digit") : (ro ? `primele ${plural(full, L, DIGITS)}` : `the first ${plural(full, L, DIGITS)}`);
    keeps = (ro ? `prefixul păstrează ${fd}` : `the prefix keeps ${fd}`) +
      (extra ? (ro ? ` și încă ${nb(extra)} din cifra următoare` : ` plus ${nb(extra)} of the next digit`) : "") +
      (groupTxt ? ` (${groupTxt})` : "");
  }
  out.push({
    id: "digits",
    title: ro ? "Numărăm cifrele hexazecimale" : "Count the hexadecimal digits",
    text: ro
      ? `Fiecare cifră hexazecimală are 4 biți și fiecare grup are 16 biți. ${p} ÷ 4 = ${full}${extra ? ` rest ${extra}` : ""}: ${keeps}.`
      : `Each hexadecimal digit is 4 bits and each group is 16 bits. ${p} ÷ 4 = ${full}${extra ? ` remainder ${extra}` : ""}: ${keeps}.`,
  });

  if (extra) {
    const gi = Math.floor(p / 16);
    const di = Math.floor((p % 16) / 4);
    const digit = (g[gi] >> (12 - di * 4)) & 0xf;
    const kept = digit & ((0xf << (4 - extra)) & 0xf);
    const b4 = (/** @type {number} */ n) => n.toString(2).padStart(4, "0");
    out.push({
      id: "partial",
      title: ro ? "Cifra tăiată de prefix" : "The digit split by the prefix",
      text: ro
        ? `${full === 0 ? "Prima cifră" : `Cifra a ${full + 1}-a`} este ${digit.toString(16)} = ${b4(digit)}. Păstrăm primii ${extra === 1 ? "bit" : `${extra} biți`} (${b4(digit).slice(0, extra)}) și punem 0 în rest: ${b4(kept)} = ${kept.toString(16)}.`.replace("primii bit", "primul bit")
        : `Digit ${full + 1} is ${digit.toString(16)} = ${b4(digit)}. Keep the first ${extra === 1 ? "bit" : `${extra} bits`} (${b4(digit).slice(0, extra)}) and set the rest to 0: ${b4(kept)} = ${kept.toString(16)}.`,
    });
  }

  const normalized = network.some((n, i) => n !== g[i]);
  out.push({
    id: "network",
    title: ro ? "Adresa de rețea (prefixul)" : "The network address (prefix)",
    text: ro
      ? `Toți biții de după prefix devin 0: ${expand(network)}, prescurtat ${compress(network, { ipv4Mixed: false })}/${p}.${normalized ? "" : " Adresa introdusă era deja chiar adresa de rețea."}`
      : `Every bit after the prefix becomes 0: ${expand(network)}, compressed ${compress(network, { ipv4Mixed: false })}/${p}.${normalized ? "" : " The address you entered was already the network address."}`,
  });
  out.push({
    id: "last",
    title: ro ? "Ultima adresă din prefix" : "The last address in the prefix",
    text: ro
      ? `Toți biții de după prefix devin 1: ${expand(last)}. IPv6 nu are broadcast, deci și ultima adresă poate fi folosită.`
      : `Every bit after the prefix becomes 1: ${expand(last)}. IPv6 has no broadcast, so even the last address can be used.`,
  });

  const host = 128 - p;
  let size;
  if (p < 64) {
    const n = 64 - p;
    size = ro
      ? `Un /${p} conține 2^${n} = ${plural(2n ** BigInt(n), L, SUBNETS)} /64 (mărimea obișnuită a unei rețele LAN), fiecare cu 2^64 de adrese.`
      : `A /${p} holds 2^${n} = ${formatCount(2n ** BigInt(n), L)} /64 subnets (the usual LAN size), each with 2^64 addresses.`;
  } else if (p === 64) {
    size = ro
      ? `/64 este mărimea obișnuită a unei rețele LAN: 64 de biți de rețea și 64 de biți pentru ID-ul interfeței (necesar pentru SLAAC și EUI-64), adică 2^64 = ${formatCount(2n ** 64n, L)} de adrese.`
      : `/64 is the usual LAN size: 64 network bits and a 64-bit interface ID (needed for SLAAC and EUI-64), so 2^64 = ${formatCount(2n ** 64n, L)} addresses.`;
  } else if (p === 127) {
    size = ro ? "Un /127 are exact 2 adrese: se folosește pe legăturile punct-la-punct dintre routere (RFC 6164)." : "A /127 holds exactly 2 addresses: used on point-to-point links between routers (RFC 6164).";
  } else if (p === 128) {
    size = ro ? "Un /128 este o singură adresă (de exemplu o interfață loopback sau o rută către un singur host)." : "A /128 is a single address (for example a loopback interface or a route to one host).";
  } else {
    size = ro
      ? `Prefixul are 2^${host} = ${plural(2n ** BigInt(host), L, ADDRS)}. E mai lung decât /64, deci SLAAC și EUI-64 nu merg pe o astfel de rețea.`
      : `The prefix holds 2^${host} = ${plural(2n ** BigInt(host), L, ADDRS)}. It is longer than /64, so SLAAC and EUI-64 won't work on such a network.`;
  }
  out.push({ id: "size", title: ro ? "Cât de mare este" : "How big it is", text: size });
  return out;
}

/**
 * Explicația EUI-64. Id-uri: `split`, `insert`, `flip`, `group`, `prefix` (doar cu prefix), `linkLocal`.
 * @param {string} mac
 * @param {{ prefix?: string, lang?: Lang }} [opts]
 * @returns {Step[]}
 */
export function eui64Steps(mac, opts = {}) {
  const e = eui64(mac, { prefix: opts.prefix });
  const ro = opts.lang !== "en";
  const parts = e.mac.split(":");
  const b8 = (/** @type {number} */ n) => n.toString(2).padStart(8, "0");
  /** @type {Step[]} */
  const out = [];
  out.push({
    id: "split",
    title: ro ? "Împărțim MAC-ul în două" : "Split the MAC in half",
    text: ro
      ? `Adresa MAC ${e.mac} are 48 de biți (6 octeți). O tăiem la mijloc: ${parts.slice(0, 3).join(":")} (partea producătorului, OUI) și ${parts.slice(3).join(":")}.`
      : `The MAC address ${e.mac} is 48 bits (6 bytes). Cut it in the middle: ${parts.slice(0, 3).join(":")} (the vendor part, OUI) and ${parts.slice(3).join(":")}.`,
  });
  out.push({
    id: "insert",
    title: ro ? "Inserăm ff:fe la mijloc" : "Insert ff:fe in the middle",
    text: ro
      ? `Între cele două jumătăți punem ff:fe: ${e.withFffe}. Acum avem 64 de biți, cât are un ID de interfață.`
      : `Put ff:fe between the two halves: ${e.withFffe}. Now there are 64 bits, the size of an interface ID.`,
  });
  const { before, after, bitWas } = e.firstByte;
  out.push({
    id: "flip",
    title: ro ? "Inversăm al 7-lea bit" : "Flip the 7th bit",
    text: ro
      ? `Primul octet este ${hex2(before)} = ${b8(before)}. Al 7-lea bit de la stânga (bitul U/L, valoarea 2) era ${bitWas} și devine ${bitWas ? 0 : 1}: ${b8(after)} = ${hex2(after)}. ${bitWas ? "Bitul 1 însemna o adresă MAC administrată local." : "Bitul 0 însemna o adresă MAC unică global, dată de producător."}`
      : `The first byte is ${hex2(before)} = ${b8(before)}. The 7th bit from the left (the U/L bit, worth 2) was ${bitWas} and becomes ${bitWas ? 0 : 1}: ${b8(after)} = ${hex2(after)}. ${bitWas ? "A 1 meant a locally administered MAC address." : "A 0 meant a globally unique MAC address, assigned by the vendor."}`,
  });
  out.push({
    id: "group",
    title: ro ? "Scriem în grupuri IPv6" : "Write it as IPv6 groups",
    text: ro
      ? `Grupăm câte 4 cifre hexazecimale: ${e.interfaceId}. Acesta este ID-ul interfeței (ultimii 64 de biți ai adresei); fără zerourile din față: ${e.interfaceIdShort}.`
      : `Group 4 hexadecimal digits at a time: ${e.interfaceId}. This is the interface ID (the last 64 bits of the address); without leading zeros: ${e.interfaceIdShort}.`,
  });
  if (e.withPrefix) {
    out.push({
      id: "prefix",
      title: ro ? "Adăugăm prefixul" : "Add the prefix",
      text: ro
        ? `Primii 64 de biți vin din prefixul ${e.withPrefix.network}${e.withPrefix.normalized ? " (am păstrat doar primii 64 de biți din ce ai scris)" : ""}, ultimii 64 din ID-ul interfeței: ${e.withPrefix.expanded}, prescurtat ${e.withPrefix.address}.`
        : `The first 64 bits come from the prefix ${e.withPrefix.network}${e.withPrefix.normalized ? " (only the first 64 bits of what you typed were kept)" : ""}, the last 64 from the interface ID: ${e.withPrefix.expanded}, compressed ${e.withPrefix.address}.`,
    });
  }
  out.push({
    id: "linkLocal",
    title: ro ? "Adresa link-local" : "The link-local address",
    text: ro
      ? `Același ID de interfață, pus după fe80::/64, dă adresa link-local pe care routerul o creează singur: ${e.linkLocal}.`
      : `The same interface ID after fe80::/64 gives the link-local address the router builds by itself: ${e.linkLocal}.`,
  });
  return out;
}
