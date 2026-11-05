// Convertor binar / zecimal / hexazecimal — Routerel (routerel.app).
// Modul ES fără dependențe, doar funcții pure. Rulează în browser și în Node (>= 18).
//
// Lucrează cu trei feluri de valori:
//   • octet      0 … 255           (8 biți)  — „192”, „11000000”, „C0”
//   • ipv4       a.b.c.d           (4 octeți) — „192.168.1.1”, „11000000.10101000.00000001.00000001”, „C0.A8.01.01”
//   • number     întreg pe 32 de biți (256 … 4 294 967 295 în zecimal, 9–32 de cifre binare, 3–8 cifre hexa)
// Numerele sunt ținute ca întregi fără semn; operațiile pe biți se încheie cu `>>> 0`.

/** @typedef {"ro" | "en"} Lang */
/** @typedef {"dec" | "bin" | "hex"} Base */
/** @typedef {"octet" | "ipv4" | "number"} Kind */

/**
 * @typedef {"EMPTY" | "INVALID_BASE" | "INVALID_CHAR" | "GROUP_COUNT" | "EMPTY_GROUP" | "GROUP_TOO_LONG" |
 *   "OCTET_RANGE" | "OUT_OF_RANGE"} ErrorCode
 */

/** Eroare cu un cod stabil (pentru UI și teste) și detalii opționale. */
export class BinaryError extends Error {
  /**
   * @param {ErrorCode} code
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, details = {}) {
    super(errorMessage({ code, details }, "en"));
    this.name = "BinaryError";
    /** @type {ErrorCode} */
    this.code = code;
    /** @type {Record<string, unknown>} */
    this.details = details;
  }
}

/** Valorile pozițiilor dintr-un octet, de la stânga la dreapta. */
export const PLACES = /** @type {const} */ ([128, 64, 32, 16, 8, 4, 2, 1]);
export const BASES = /** @type {const} */ (["dec", "bin", "hex"]);
const MAX32 = 0xffffffff;
const DIGITS = { dec: /^[0-9]$/, bin: /^[01]$/, hex: /^[0-9a-fA-F]$/ };

// ───────────────────────── Ajutătoare de bază ─────────────────────────

/** @param {number} n 0 … 255 @returns {string} 8 cifre binare */
export const toBin8 = (n) => (n & 255).toString(2).padStart(8, "0");
/** @param {number} n 0 … 255 @returns {string} 2 cifre hexa, majuscule */
export const toHex2 = (n) => (n & 255).toString(16).toUpperCase().padStart(2, "0");

/**
 * Cei 4 octeți ai unui întreg pe 32 de biți.
 * @param {number} n
 * @returns {[number, number, number, number]}
 */
export function octetsOf(n) {
  const v = n >>> 0;
  return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}

/**
 * Biții unui octet așezați sub tabelul 128 64 32 16 8 4 2 1.
 * @param {number} octet
 * @returns {{ place: number, bit: 0 | 1 }[]}
 */
export function placeValues(octet) {
  return PLACES.map((place) => ({ place, bit: /** @type {0|1} */ ((octet & place) ? 1 : 0) }));
}

/**
 * Metoda scăderii (cea din CCNA): mergi pe tabel de la 128 la 1; dacă valoarea poziției încape în ce a rămas,
 * scrii 1 și o scazi, altfel scrii 0.
 * @param {number} octet 0 … 255
 * @returns {{ place: number, before: number, fits: boolean, bit: 0 | 1, after: number }[]}
 */
export function decToBinTrace(octet) {
  if (!Number.isInteger(octet) || octet < 0 || octet > 255) throw new BinaryError("OCTET_RANGE", { value: octet });
  let rest = octet;
  return PLACES.map((place) => {
    const before = rest;
    const fits = place <= rest;
    if (fits) rest -= place;
    return { place, before, fits, bit: /** @type {0|1} */ (fits ? 1 : 0), after: rest };
  });
}

/**
 * Valoarea unei cifre hexa și cei 4 biți ai ei.
 * @param {string} digit
 * @returns {{ digit: string, value: number, bits: string }}
 */
export function nibble(digit) {
  const value = parseInt(digit, 16);
  return { digit: digit.toUpperCase(), value, bits: value.toString(2).padStart(4, "0") };
}

// ───────────────────────── Citirea textului ─────────────────────────

/**
 * @typedef {{ ok: true, value: number, kind: Kind, base: Base, digits: number, padded: boolean }} ParseOk
 * @typedef {{ ok: false, error: { code: ErrorCode, details: Record<string, unknown> } }} ParseFail
 * @typedef {ParseOk | ParseFail} ParseResult
 */

/**
 * Citește un număr scris în baza dată. Nu aruncă excepții.
 *   zecimal:  „192” (octet), „192.168.1.1” (IPv4), „3232235777” sau „3 232 235 777” (32 de biți)
 *   binar:    „11000000”, „0b1010”, „1100 0000”, „11000000.10101000.00000001.00000001”
 *   hexa:     „C0”, „0xc0”, „C0A80101”, „C0.A8.01.01”
 * Fără puncte, spațiile (și „_”) dintre cifre sunt ignorate.
 * @param {string} input
 * @param {Base} base
 * @returns {ParseResult}
 */
export function parseValue(input, base) {
  const fail = (/** @type {ErrorCode} */ code, details = {}) => /** @type {ParseFail} */ ({ ok: false, error: { code, details } });
  if (!BASES.includes(/** @type {Base} */ (base))) return fail("INVALID_BASE", { value: base });
  const text = String(input ?? "").trim();
  if (!text) return fail("EMPTY", { base });

  const badChar = (/** @type {string} */ s) => {
    for (const ch of s) if (!DIGITS[base].test(ch)) return ch;
    return null;
  };
  const charFail = (/** @type {string} */ ch) => fail("INVALID_CHAR", { char: ch, base, suggestedBase: suggestBase(text, base) });

  if (text.includes(".")) {
    // adresă IPv4: 4 grupuri separate prin puncte, fiecare grup este un octet
    const groups = text.split(".").map((g) => g.trim());
    for (const g of groups) {
      const ch = badChar(g);
      if (ch) return charFail(ch);
    }
    if (groups.length !== 4) return fail("GROUP_COUNT", { count: groups.length, base });
    if (groups.some((g) => g === "")) return fail("EMPTY_GROUP", { base });
    const max = { dec: 3, bin: 8, hex: 2 }[base];
    const radix = { dec: 10, bin: 2, hex: 16 }[base];
    let value = 0;
    for (const g of groups) {
      if (g.length > max) {
        // un grup zecimal de 4+ cifre e tot „prea mare”, nu „prea lung”, ca mesajul să fie clar
        if (base === "dec") return fail("OCTET_RANGE", { value: g.replace(/^0+(?=\d)/, "") });
        return fail("GROUP_TOO_LONG", { group: g, max, base });
      }
      const n = parseInt(g, radix);
      if (n > 255) return fail("OCTET_RANGE", { value: g });
      value = value * 256 + n;
    }
    return { ok: true, value, kind: "ipv4", base, digits: groups.join("").length, padded: base !== "dec" && groups.some((g) => g.length < max) };
  }

  let digits = text.replace(/[\s_]+/g, "");
  if (base === "bin" && /^0b/i.test(digits)) digits = digits.slice(2);
  if (base === "hex" && /^0x/i.test(digits)) digits = digits.slice(2);
  if (!digits) return fail("EMPTY", { base });
  const ch = badChar(digits);
  if (ch) return charFail(ch);

  if (base === "dec") {
    const trimmed = digits.replace(/^0+(?=\d)/, "");
    if (trimmed.length > 10 || Number(trimmed) > MAX32) return fail("OUT_OF_RANGE", { base, value: trimmed });
    const value = Number(trimmed);
    return { ok: true, value, kind: value <= 255 ? "octet" : "number", base, digits: digits.length, padded: false };
  }
  if (base === "bin") {
    if (digits.length > 32) return fail("OUT_OF_RANGE", { base, digits: digits.length });
    const value = parseInt(digits, 2);
    const kind = digits.length <= 8 ? "octet" : "number";
    return { ok: true, value, kind, base, digits: digits.length, padded: digits.length < (kind === "octet" ? 8 : 32) };
  }
  if (digits.length > 8) return fail("OUT_OF_RANGE", { base, digits: digits.length });
  const value = parseInt(digits, 16);
  const kind = digits.length <= 2 ? "octet" : "number";
  return { ok: true, value, kind, base, digits: digits.length, padded: digits.length < (kind === "octet" ? 2 : 8) };
}

/**
 * Dacă textul nu e valid în baza aleasă, dar e valid în alta, o sugerăm (ordinea: zecimal, hexa, binar).
 * @param {string} text
 * @param {Base} base
 * @returns {Base | null}
 */
function suggestBase(text, base) {
  for (const b of /** @type {Base[]} */ (["dec", "hex", "bin"])) {
    if (b === base) continue;
    const ok = text.includes(".")
      ? text.split(".").every((g) => g.trim() !== "" && [...g.trim()].every((c) => DIGITS[b].test(c)))
      : [...text.replace(/[\s_]+/g, "").replace(b === "hex" ? /^0x/i : b === "bin" ? /^0b/i : /^$/, "")].every((c) => DIGITS[b].test(c));
    if (ok && parseValue(text, b).ok) return b;
  }
  return null;
}

// ───────────────────────── Conversia ─────────────────────────

/**
 * @typedef {object} Conversion
 * @property {Kind} kind
 * @property {Base} from          baza în care a fost scris numărul
 * @property {8 | 32} bits
 * @property {number} value       valoarea (întreg fără semn)
 * @property {number[]} octets    1 octet pentru `octet`, 4 pentru `ipv4` și `number`
 * @property {string} decimal     „192”, „192.168.1.1” sau „3232235777”
 * @property {string} binary      „11000000” sau 32 de biți cu puncte între octeți
 * @property {string} binaryPlain cifrele binare fără separatori (8 sau 32)
 * @property {string} hex         „C0”, „C0.A8.01.01” (ipv4) sau „C0A80101” (number)
 * @property {string} hexPrefixed „0xC0”, „0xC0A80101”
 * @property {string | null} dotted  forma a.b.c.d (doar pe 32 de biți)
 * @property {boolean} padded     intrarea avea mai puține cifre decât lățimea și a fost completată cu zerouri
 */

/**
 * Construiește toate reprezentările unei valori.
 * @param {number} value
 * @param {Kind} kind
 * @param {Base} [from]
 * @param {boolean} [padded]
 * @returns {Conversion}
 */
export function fromValue(value, kind, from = "dec", padded = false) {
  const wide = kind !== "octet";
  if (!Number.isInteger(value) || value < 0 || value > (wide ? MAX32 : 255)) {
    throw new BinaryError(wide ? "OUT_OF_RANGE" : "OCTET_RANGE", { value, base: "dec" });
  }
  const octets = wide ? octetsOf(value) : [value];
  const binary = octets.map(toBin8).join(".");
  const hexPlain = octets.map(toHex2).join("");
  return {
    kind,
    from,
    bits: wide ? 32 : 8,
    value,
    octets,
    decimal: kind === "ipv4" ? octets.join(".") : String(value),
    binary,
    binaryPlain: binary.replace(/\./g, ""),
    hex: kind === "ipv4" ? octets.map(toHex2).join(".") : hexPlain,
    hexPrefixed: `0x${hexPlain}`,
    dotted: wide ? octets.join(".") : null,
    padded,
  };
}

/**
 * Convertește textul dat în baza `from`. Aruncă `BinaryError` dacă textul e invalid.
 * @param {string} input
 * @param {Base} from
 * @returns {Conversion}
 */
export function convert(input, from) {
  const r = parseValue(input, from);
  if (!r.ok) throw new BinaryError(r.error.code, r.error.details);
  return fromValue(r.value, r.kind, from, r.padded);
}

/**
 * Valoarea scrisă în baza dorită, gata de pus într-un câmp de text (folosit la schimbarea bazei în UI).
 * Pe 32 de biți: IPv4 cu puncte; numărul simplu are binarul grupat pe octeți cu spații.
 * @param {Conversion} c
 * @param {Base} base
 * @returns {string}
 */
export function formatAs(c, base) {
  if (base === "dec") return c.decimal;
  if (base === "hex") return c.hex;
  if (c.kind === "number") return c.binary.replace(/\./g, " ");
  return c.binary;
}

// ───────────────────────── Text: numere, mesaje ─────────────────────────

/**
 * Numere mari ușor de citit: spațiu fix în română (ca să nu semene cu o adresă IP), virgulă în engleză.
 * @param {number} n
 * @param {Lang} [lang]
 */
export function formatCount(n, lang = "ro") {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "ro" ? " " : ",");
}

const BASE_NAME = {
  ro: { dec: "zecimal", bin: "binar", hex: "hexazecimal" },
  en: { dec: "decimal", bin: "binary", hex: "hexadecimal" },
};

/**
 * Mesajul pentru o eroare, în limba cerută.
 * @param {{ code: ErrorCode, details?: Record<string, unknown> }} err
 * @param {Lang} [lang]
 * @returns {string}
 */
export function errorMessage(err, lang = "ro") {
  const d = err.details ?? {};
  const ro = lang !== "en";
  const L = ro ? "ro" : "en";
  const base = /** @type {Base} */ (d.base);
  const sb = /** @type {Base | null | undefined} */ (d.suggestedBase);
  const suggest = sb ? (ro ? ` Dacă e scris în ${BASE_NAME.ro[sb]}, alege „${cap(BASE_NAME.ro[sb])}”.` : ` If it is written in ${BASE_NAME.en[sb]}, choose "${cap(BASE_NAME.en[sb])}".`) : "";
  switch (err.code) {
    case "EMPTY":
      return ro ? "Scrie un număr (de exemplu 192) sau o adresă IPv4 (de exemplu 192.168.1.1)." : "Enter a number (e.g. 192) or an IPv4 address (e.g. 192.168.1.1).";
    case "INVALID_BASE":
      return ro ? "Baza trebuie să fie zecimal, binar sau hexazecimal." : "The base must be decimal, binary or hexadecimal.";
    case "INVALID_CHAR": {
      const ch = String(d.char ?? "");
      const what = {
        ro: { dec: "în zecimal se folosesc doar cifrele 0–9", bin: "în binar se folosesc doar cifrele 0 și 1", hex: "în hexazecimal se folosesc cifrele 0–9 și literele A–F" },
        en: { dec: "decimal uses only the digits 0–9", bin: "binary uses only the digits 0 and 1", hex: "hexadecimal uses the digits 0–9 and the letters A–F" },
      }[L][base] ?? "";
      return (ro ? `„${ch}” nu are voie aici: ${what}.` : `"${ch}" is not allowed here: ${what}.`) + suggest;
    }
    case "GROUP_COUNT":
      return ro ? `O adresă IPv4 are exact 4 octeți separați prin puncte; aici sunt ${d.count}.` : `An IPv4 address has exactly 4 octets separated by dots; this has ${d.count}.`;
    case "EMPTY_GROUP":
      return ro ? "Lipsește un octet între două puncte (sau la început ori la sfârșit)." : "An octet is missing between two dots (or at the start or end).";
    case "GROUP_TOO_LONG":
      return ro
        ? `Grupul „${d.group}” e prea lung: un octet are cel mult ${d.max} cifre în ${BASE_NAME.ro[base]}.`
        : `The group "${d.group}" is too long: an octet has at most ${d.max} digits in ${BASE_NAME.en[base]}.`;
    case "OCTET_RANGE":
      return ro ? `${d.value} nu încape într-un octet: un octet ține valori de la 0 la 255.` : `${d.value} does not fit in an octet: an octet holds values from 0 to 255.`;
    case "OUT_OF_RANGE": {
      const lim = { ro: { dec: "4 294 967 295", bin: "32 de cifre binare", hex: "8 cifre hexazecimale" }, en: { dec: "4,294,967,295", bin: "32 binary digits", hex: "8 hexadecimal digits" } }[L][base] ?? "";
      return ro ? `Numărul e prea mare: convertorul lucrează pe cel mult 32 de biți (maximum ${lim}).` : `The number is too large: the converter works with at most 32 bits (maximum ${lim}).`;
    }
    default:
      return ro ? "Eroare necunoscută." : "Unknown error.";
  }
}

/** @param {string} s */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ───────────────────────── Explicația pas cu pas ─────────────────────────

/** @typedef {{ id: string, title: string, text: string, octet?: number }} Step */

/**
 * „rămân 64”, „rămâne 1”, „rămâne 0” / „64 left”.
 * @param {number} n
 * @param {boolean} ro
 */
const left = (n, ro) => (ro ? `${n <= 1 ? "rămâne" : "rămân"} ${n}` : `${n} left`);

/**
 * Zecimal → binar pentru un octet, prin tabelul 128 64 32 16 8 4 2 1.
 * @param {number} o
 * @param {boolean} ro
 */
function decToBinText(o, ro) {
  if (o === 0) return ro ? `0 nu conține niciuna dintre valorile 128, 64, 32, 16, 8, 4, 2, 1, deci toți biții sunt 0: 00000000.` : `0 contains none of 128, 64, 32, 16, 8, 4, 2, 1, so every bit is 0: 00000000.`;
  const parts = [];
  const trace = decToBinTrace(o);
  const and = ro ? " și " : " and ";
  const list = (/** @type {number[]} */ xs) => (xs.length === 1 ? String(xs[0]) : `${xs.slice(0, -1).join(", ")}${and}${xs[xs.length - 1]}`);
  let i = 0;
  while (i < trace.length) {
    const s = trace[i];
    if (s.before === 0) {
      // după ce restul a ajuns la 0, toți biții rămași sunt 0
      const restPlaces = trace.slice(i).map((x) => x.place);
      parts.push(restPlaces.length === 1
        ? (ro ? "ultimul bit (1) este 0" : "the last bit (1) is 0")
        : (ro ? `restul biților (${restPlaces.join(", ")}) sunt 0` : `the remaining bits (${restPlaces.join(", ")}) are 0`));
      break;
    }
    if (s.fits) {
      parts.push(ro ? `${s.place} încape în ${s.before} → 1, ${left(s.after, true)}` : `${s.place} fits into ${s.before} → 1, ${left(s.after, false)}`);
      i++;
      continue;
    }
    // pozițiile consecutive care nu încap se spun împreună: „128, 64 și 32 nu încap în 10 → 000”
    let j = i;
    while (j < trace.length && !trace[j].fits) j++;
    const run = trace.slice(i, j).map((x) => x.place);
    const zeros = "0".repeat(run.length);
    if (run.length === 1) parts.push(ro ? `${run[0]} nu încape în ${s.before} → 0` : `${run[0]} doesn't fit into ${s.before} → 0`);
    else parts.push(ro ? `${list(run)} nu încap în ${s.before} → ${zeros}` : `${list(run)} don't fit into ${s.before} → ${zeros}`);
    i = j;
  }
  return ro
    ? `Mergem pe tabelul 128 64 32 16 8 4 2 1: ${parts.join("; ")}. Rezultat: ${o} = ${toBin8(o)}.`
    : `Walk the table 128 64 32 16 8 4 2 1: ${parts.join("; ")}. Result: ${o} = ${toBin8(o)}.`;
}

/**
 * Binar → zecimal pentru un octet: aduni valorile pozițiilor unde e 1.
 * @param {number} o
 * @param {boolean} ro
 */
function binToDecText(o, ro) {
  const b = toBin8(o);
  const ones = placeValues(o).filter((x) => x.bit).map((x) => x.place);
  if (!ones.length) return ro ? `${b}: niciun bit nu este 1, deci valoarea este 0.` : `${b}: no bit is 1, so the value is 0.`;
  if (ones.length === 1) return ro ? `${b}: singurul 1 stă sub ${ones[0]}, deci valoarea este ${o}.` : `${b}: the only 1 sits under ${ones[0]}, so the value is ${o}.`;
  return ro
    ? `${b}: adunăm valorile pozițiilor unde este 1: ${ones.join(" + ")} = ${o}.`
    : `${b}: add up the place values where there is a 1: ${ones.join(" + ")} = ${o}.`;
}

/**
 * Binar → hexa: grupe de câte 4 biți.
 * @param {number} o
 * @param {boolean} ro
 */
function binToHexText(o, ro) {
  const b = toBin8(o);
  const [hi, lo] = [b.slice(0, 4), b.slice(4)];
  const one = (/** @type {string} */ n) => {
    const v = parseInt(n, 2);
    const ones = [8, 4, 2, 1].filter((p, i) => n[i] === "1");
    const sum = ones.length > 1 ? `${ones.join(" + ")} = ${v}` : `${v}`;
    const digit = v.toString(16).toUpperCase();
    return v > 9 ? `${n} = ${sum} = ${digit}` : `${n} = ${sum}`;
  };
  return ro
    ? `Împărțim cei 8 biți în două grupe de câte 4 (nibble), fiecare cu valorile 8 4 2 1: ${hi} | ${lo}. ${one(hi)}; ${one(lo)}. Hexazecimal: ${toHex2(o)}.`
    : `Split the 8 bits into two groups of 4 (nibbles), each with place values 8 4 2 1: ${hi} | ${lo}. ${one(hi)}; ${one(lo)}. Hexadecimal: ${toHex2(o)}.`;
}

/**
 * Hexa → binar: fiecare cifră devine 4 biți.
 * @param {number} o
 * @param {boolean} ro
 */
function hexToBinText(o, ro) {
  const h = toHex2(o);
  const parts = [...h].map((c) => {
    const n = nibble(c);
    return n.value > 9 ? `${n.digit} (${n.value}) = ${n.bits}` : `${n.digit} = ${n.bits}`;
  });
  return ro
    ? `Fiecare cifră hexazecimală înseamnă exact 4 biți: ${parts.join(", ")}. Le punem una după alta: ${h} = ${toBin8(o)}.`
    : `Each hexadecimal digit is exactly 4 bits: ${parts.join(", ")}. Put them side by side: ${h} = ${toBin8(o)}.`;
}

/**
 * Verificare hexa ↔ zecimal: prima cifră × 16 + a doua.
 * @param {number} o
 * @param {boolean} ro
 */
function hexCheckText(o, ro) {
  const h = toHex2(o);
  const [a, b] = [nibble(h[0]), nibble(h[1])];
  return ro
    ? `Prima cifră hexazecimală valorează de 16 ori mai mult: ${h} = ${a.value} × 16 + ${b.value} = ${o}.`
    : `The first hexadecimal digit is worth 16 times more: ${h} = ${a.value} × 16 + ${b.value} = ${o}.`;
}

/**
 * Explicația conversiei, în română sau engleză.
 * Id-uri: `pad`, `split` (32 de biți din zecimal), apoi pentru fiecare octet `dec2bin`, `bin2dec`, `hex2bin`, `bin2hex`,
 * `hexcheck` (cu `octet` = indexul octetului), apoi `join` (doar pentru numărul pe 32 de biți) și `result`.
 * @param {string} input
 * @param {Base} from
 * @param {Lang} [lang]
 * @returns {Step[]}
 */
export function steps(input, from, lang = "ro") {
  const c = convert(input, from);
  const ro = lang !== "en";
  /** @type {Step[]} */
  const out = [];
  const multi = c.octets.length > 1;
  const octTitle = (/** @type {number} */ i, /** @type {string} */ what) => (multi ? (ro ? `Octetul ${i + 1}: ${what}` : `Octet ${i + 1}: ${what}`) : cap(what));
  const W = ro
    ? { d2b: "zecimal → binar", b2d: "binar → zecimal", b2h: "binar → hexazecimal", h2b: "hexazecimal → binar" }
    : { d2b: "decimal → binary", b2d: "binary → decimal", b2h: "binary → hexadecimal", h2b: "hexadecimal → binary" };

  if (c.padded) {
    const shown = c.kind === "ipv4" ? (from === "bin" ? c.binary : c.hex) : from === "bin" ? c.binaryPlain : c.hex;
    let text;
    if (c.kind === "ipv4") {
      text = ro
        ? `Fiecare octet are ${from === "bin" ? "8 biți" : "2 cifre hexazecimale"}, așa că grupurile mai scurte se completează cu zerouri în stânga (zerourile din stânga nu schimbă valoarea): ${shown}.`
        : `Each octet is ${from === "bin" ? "8 bits" : "2 hexadecimal digits"}, so shorter groups get zeros on the left (leading zeros don't change the value): ${shown}.`;
    } else {
      const width = ro
        ? (from === "bin" ? (c.bits === 8 ? "8 biți" : "32 de biți") : `${c.bits / 4} cifre`)
        : (from === "bin" ? `${c.bits} bits` : `${c.bits / 4} digits`);
      text = ro
        ? `Completăm cu zerouri în stânga până la ${width}; zerourile din stânga nu schimbă valoarea: ${shown}.`
        : `Pad with zeros on the left up to ${width}; leading zeros don't change the value: ${shown}.`;
    }
    out.push({ id: "pad", title: ro ? "Completăm cu zerouri" : "Pad with zeros", text });
  }

  if (c.kind === "ipv4") {
    out.push({
      id: "split",
      title: ro ? "Câte un octet pe rând" : "One octet at a time",
      text: ro
        ? `O adresă IPv4 are 4 octeți (4 × 8 = 32 de biți). Convertim fiecare octet separat: ${from === "dec" ? c.decimal : from === "bin" ? c.binary : c.hex}.`
        : `An IPv4 address has 4 octets (4 × 8 = 32 bits). Convert each octet on its own: ${from === "dec" ? c.decimal : from === "bin" ? c.binary : c.hex}.`,
    });
  } else if (c.kind === "number" && from === "dec") {
    const [a, b, d, e] = c.octets;
    const n = (/** @type {number} */ x) => formatCount(x, ro ? "ro" : "en");
    const r1 = c.value - a * 16777216;
    const r2 = r1 - b * 65536;
    out.push({
      id: "split",
      title: ro ? "Împărțim în 4 octeți" : "Split into 4 octets",
      text: ro
        ? `Un număr pe 32 de biți are 4 octeți, cu ponderile 2^24 = ${n(16777216)}, 2^16 = ${n(65536)}, 2^8 = 256 și 1. ${n(c.value)} ÷ ${n(16777216)} = ${a}, rest ${n(r1)}; ${n(r1)} ÷ ${n(65536)} = ${b}, rest ${n(r2)}; ${n(r2)} ÷ 256 = ${d}, rest ${e}. Octeții sunt ${c.dotted}.`
        : `A 32-bit number has 4 octets, weighted 2^24 = ${n(16777216)}, 2^16 = ${n(65536)}, 2^8 = 256 and 1. ${n(c.value)} ÷ ${n(16777216)} = ${a}, remainder ${n(r1)}; ${n(r1)} ÷ ${n(65536)} = ${b}, remainder ${n(r2)}; ${n(r2)} ÷ 256 = ${d}, remainder ${e}. The octets are ${c.dotted}.`,
    });
  }

  c.octets.forEach((o, i) => {
    if (from === "dec") {
      out.push({ id: "dec2bin", octet: i, title: octTitle(i, W.d2b), text: decToBinText(o, ro) });
      out.push({ id: "bin2hex", octet: i, title: octTitle(i, W.b2h), text: binToHexText(o, ro) });
      out.push({ id: "hexcheck", octet: i, title: octTitle(i, ro ? "verificare" : "check"), text: hexCheckText(o, ro) });
    } else if (from === "bin") {
      out.push({ id: "bin2dec", octet: i, title: octTitle(i, W.b2d), text: binToDecText(o, ro) });
      out.push({ id: "bin2hex", octet: i, title: octTitle(i, W.b2h), text: binToHexText(o, ro) });
    } else {
      out.push({ id: "hex2bin", octet: i, title: octTitle(i, W.h2b), text: hexToBinText(o, ro) });
      out.push({ id: "bin2dec", octet: i, title: octTitle(i, W.b2d), text: binToDecText(o, ro) });
    }
  });

  if (c.kind === "number" && from !== "dec") {
    const [a, b, d, e] = c.octets;
    const n = (/** @type {number} */ x) => formatCount(x, ro ? "ro" : "en");
    out.push({
      id: "join",
      title: ro ? "Numărul întreg" : "The whole number",
      text: ro
        ? `Ca să obținem un singur număr zecimal, fiecare octet se înmulțește cu ponderea lui: ${a} × ${n(16777216)} + ${b} × ${n(65536)} + ${d} × 256 + ${e} = ${n(c.value)}.`
        : `To get one decimal number, multiply each octet by its weight: ${a} × ${n(16777216)} + ${b} × ${n(65536)} + ${d} × 256 + ${e} = ${n(c.value)}.`,
    });
  }

  const L = ro ? "ro" : "en";
  const dec = c.kind === "number" ? formatCount(c.value, L) : c.decimal;
  const extra = c.kind === "number" ? (ro ? `; ca adresă IPv4: ${c.dotted}` : `; as an IPv4 address: ${c.dotted}`) : "";
  out.push({
    id: "result",
    title: ro ? "Rezultat" : "Result",
    text: ro
      ? `Zecimal ${dec}; binar ${c.binary}; hexazecimal ${c.hex}${extra}.`
      : `Decimal ${dec}; binary ${c.binary}; hexadecimal ${c.hex}${extra}.`,
  });
  return out;
}
