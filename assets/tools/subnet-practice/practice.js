// Exerciții de subnetting generate la nesfârșit — Routerel (routerel.app).
// Modul ES fără dependențe externe, doar funcții pure. Rulează în browser și în Node (>= 18).
//
// Matematica de bază (analiză, pașii metodei blocului, formatarea numerelor) vine din calculatorul
// de subnetting, `../subnet/subnet.js`. Pe site cele două unelte stau în `assets/tools/subnet/` și
// `assets/tools/subnet-practice/`, deci importul relativ funcționează la fel ca aici.
//
// Generatorul primește o funcție `rng()` (0 ≤ x < 1). Cu `createRng(seed)` exercițiile sunt
// reproductibile (teste, capturi); interfața pornește cu o sămânță aleatoare.

import { analyze, steps, intToIp, ipToInt, prefixToMask, maskToPrefix, classifyAddress, formatCount, plural, FORMS } from "../subnet/subnet.js";

/** @typedef {"ro" | "en"} Lang */
/** @typedef {"easy" | "medium" | "hard"} Level */
/**
 * @typedef {"network" | "broadcast" | "firstHost" | "lastHost" | "hostCount" | "mask" | "nextSubnet" |
 *   "maskForHosts" | "validHost" | "subnetCount"} ExerciseType
 */
/** @typedef {"ip" | "number" | "mask" | "prefixOrMask" | "yesno"} AnswerKind */
/** @typedef {{ id: string, title: string, text: string }} Step */

/**
 * @typedef {object} Exercise
 * @property {string} key          identifică întrebarea (două exerciții la rând nu au aceeași cheie)
 * @property {Level} level
 * @property {ExerciseType} type
 * @property {AnswerKind} kind     ce fel de răspuns se așteaptă
 * @property {string} subject      ce se afișează mare: „192.168.10.77/26”, „172.16.37.9 255.255.240.0”, „/26”, „50”
 * @property {string | null} ip    adresa din enunț (null la `mask` și `maskForHosts`)
 * @property {number} prefix       prefixul din enunț (la `maskForHosts`: prefixul răspunsului; la `subnetCount`: prefixul rețelei date)
 * @property {"prefix" | "mask"} notation  cum e scris prefixul în enunț
 * @property {number | null} hosts      doar la `maskForHosts`: câte host-uri se cer
 * @property {number | null} newPrefix  doar la `subnetCount`: prefixul subrețelelor
 * @property {string} answer       răspunsul canonic: „192.168.10.64”, „62”, „255.255.255.192”, „/26”, „yes” / „no”
 */

export const LEVELS = /** @type {const} */ (["easy", "medium", "hard"]);
export const TYPES = /** @type {const} */ ([
  "network", "broadcast", "firstHost", "lastHost", "hostCount", "mask", "nextSubnet", "maskForHosts", "validHost", "subnetCount",
]);
/** Tipurile din amestecul „toate tipurile” pe fiecare nivel. Un tip ales explicit merge pe orice nivel. */
export const MIX = {
  easy: ["network", "broadcast", "firstHost", "lastHost", "hostCount", "mask", "nextSubnet", "validHost"],
  medium: ["network", "broadcast", "firstHost", "lastHost", "hostCount", "mask", "nextSubnet", "validHost"],
  hard: [...TYPES],
};
/** Prefixele folosite pe fiecare nivel (inclusiv). */
export const PREFIX_RANGE = { easy: [24, 30], medium: [16, 23], hard: [8, 30] };

/** @type {Record<ExerciseType, AnswerKind>} */
export const KIND = {
  network: "ip", broadcast: "ip", firstHost: "ip", lastHost: "ip", nextSubnet: "ip",
  hostCount: "number", subnetCount: "number", mask: "mask", maskForHosts: "prefixOrMask", validHost: "yesno",
};

// ───────────────────────── Textele ─────────────────────────

export const TEXTS = {
  ro: {
    levels: { easy: "Ușor", medium: "Mediu", hard: "Greu" },
    levelNotes: {
      easy: "Prefixe /24–/30: calculul se face în ultimul octet (la /24, granița cade exact la capătul celui de-al treilea).",
      medium: "Prefixe /16–/23: calculul se face în al treilea octet (la /16, granița cade exact la capătul celui de-al doilea).",
      hard: "Prefixe /8–/30, în orice octet, plus măști pentru N host-uri și număr de subrețele.",
    },
    allTypes: "Toate tipurile",
    types: {
      network: "Adresa de rețea", broadcast: "Adresa de broadcast", firstHost: "Primul host", lastHost: "Ultimul host",
      hostCount: "Numărul de host-uri", mask: "Masca pentru un prefix", nextSubnet: "Subrețeaua următoare",
      maskForHosts: "Masca pentru N host-uri", validHost: "Adresă de host validă?", subnetCount: "Numărul de subrețele",
    },
    questions: {
      network: () => "Care este adresa de rețea?",
      broadcast: () => "Care este adresa de broadcast?",
      firstHost: () => "Care este primul host utilizabil?",
      lastHost: () => "Care este ultimul host utilizabil?",
      hostCount: () => "Câte host-uri utilizabile are subrețeaua?",
      mask: () => "Care este masca pentru acest prefix? Scrie-o zecimal, cu puncte.",
      nextSubnet: () => "Care este adresa de rețea a subrețelei următoare, de aceeași mărime?",
      maskForHosts: () => "Ce prefix (sau mască) dă cea mai mică subrețea cu cel puțin atâtea host-uri utilizabile?",
      validHost: () => "Poate fi dată această adresă unui host (unui PC sau unei interfețe)?",
      subnetCount: (/** @type {Exercise} */ ex) => `Câte subrețele /${ex.newPrefix} obții din această rețea?`,
    },
    hostsSubject: (/** @type {number} */ n) => plural(n, "ro", FORMS.HOSTS),
    hints: {
      ip: "Scrie o adresă IPv4, de exemplu 192.168.1.64.",
      number: "Scrie un număr, de exemplu 62.",
      mask: "Scrie masca zecimal, cu puncte, de exemplu 255.255.255.0.",
      prefixOrMask: "Scrie un prefix (/26) sau o mască (255.255.255.192).",
      yesno: "Alege Da sau Nu.",
    },
    errors: {
      empty: "Scrie mai întâi un răspuns.",
      ip: "Nu recunosc adresa. Scrie 4 numere între 0 și 255, cu puncte.",
      number: "Nu recunosc numărul. Scrie doar cifre, de exemplu 62.",
      mask: "Scrie masca cu 4 numere și puncte, de exemplu 255.255.255.0.",
      prefixOrMask: "Scrie un prefix între /0 și /32 sau o mască cu puncte.",
      yesno: "Alege Da sau Nu.",
    },
    yes: "Da",
    no: "Nu",
    answerTitle: "Răspunsul",
  },
  en: {
    levels: { easy: "Easy", medium: "Medium", hard: "Hard" },
    levelNotes: {
      easy: "Prefixes /24–/30: the work happens in the last octet (at /24, the boundary falls exactly at the end of the third).",
      medium: "Prefixes /16–/23: the work happens in the third octet (at /16, the boundary falls exactly at the end of the second).",
      hard: "Prefixes /8–/30 in any octet, plus masks for N hosts and number of subnets.",
    },
    allTypes: "All types",
    types: {
      network: "Network address", broadcast: "Broadcast address", firstHost: "First host", lastHost: "Last host",
      hostCount: "Number of hosts", mask: "Mask for a prefix", nextSubnet: "Next subnet",
      maskForHosts: "Mask for N hosts", validHost: "Valid host address?", subnetCount: "Number of subnets",
    },
    questions: {
      network: () => "What is the network address?",
      broadcast: () => "What is the broadcast address?",
      firstHost: () => "What is the first usable host?",
      lastHost: () => "What is the last usable host?",
      hostCount: () => "How many usable hosts does the subnet have?",
      mask: () => "What is the subnet mask for this prefix? Write it in dotted decimal.",
      nextSubnet: () => "What is the network address of the next subnet of the same size?",
      maskForHosts: () => "Which prefix (or mask) gives the smallest subnet with at least this many usable hosts?",
      validHost: () => "Can this address be assigned to a host (a PC or an interface)?",
      subnetCount: (/** @type {Exercise} */ ex) => `How many /${ex.newPrefix} subnets can you make from this network?`,
    },
    hostsSubject: (/** @type {number} */ n) => plural(n, "en", FORMS.HOSTS),
    hints: {
      ip: "Type an IPv4 address, for example 192.168.1.64.",
      number: "Type a number, for example 62.",
      mask: "Type the mask in dotted decimal, for example 255.255.255.0.",
      prefixOrMask: "Type a prefix (/26) or a mask (255.255.255.192).",
      yesno: "Choose Yes or No.",
    },
    errors: {
      empty: "Type an answer first.",
      ip: "That address isn't recognized. Type 4 numbers from 0 to 255, with dots.",
      number: "That number isn't recognized. Use digits only, for example 62.",
      mask: "Type the mask as 4 numbers with dots, for example 255.255.255.0.",
      prefixOrMask: "Type a prefix from /0 to /32 or a dotted mask.",
      yesno: "Choose Yes or No.",
    },
    yes: "Yes",
    no: "No",
    answerTitle: "Answer",
  },
};

/**
 * Citește numele unui nivel („easy”, „medium”, „hard”, sau în română „usor”/„ușor”, „mediu”, „greu”).
 * @param {unknown} text
 * @returns {Level | null}
 */
export function parseLevel(text) {
  const s = String(text ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (s === "easy" || s === "usor") return "easy";
  if (s === "medium" || s === "mediu") return "medium";
  if (s === "hard" || s === "greu") return "hard";
  return null;
}

/**
 * Enunțul exercițiului în limba cerută.
 * @param {Exercise} ex
 * @param {Lang} [lang]
 * @returns {{ question: string, subject: string, typeLabel: string, hint: string }}
 */
export function prompt(ex, lang = "ro") {
  const T = TEXTS[lang === "en" ? "en" : "ro"];
  return {
    question: T.questions[ex.type](ex),
    subject: ex.type === "maskForHosts" ? T.hostsSubject(/** @type {number} */ (ex.hosts)) : ex.subject,
    typeLabel: T.types[ex.type],
    hint: T.hints[ex.kind],
  };
}

// ───────────────────────── Numere aleatoare ─────────────────────────

/**
 * Generator pseudo-aleator mulberry32: aceeași sămânță dă mereu același șir de numere în [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {() => number} rng @param {number} lo @param {number} hi */
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
/** @template T @param {() => number} rng @param {readonly T[]} arr @returns {T} */
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
/** @param {number} a @param {number} b */
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Primul octet pentru adrese publice: fără 0, 100 (CGNAT), 127, 169 (link-local), 172, 192, 198, 203 (documentație,
// teste) și fără 224+ (multicast, rezervate). Orice adresă generată mai e verificată cu classifyAddress().
const PUBLIC_FIRST = [...range(11, 99), ...range(101, 126), ...range(128, 168), 170, 171, ...range(173, 191),
  ...range(193, 197), ...range(199, 202), ...range(204, 223)];

/**
 * O adresă realistă pentru prefixul dat: privată (10/8, 172.16/12, 192.168/16) sau publică obișnuită.
 * La prefixe scurte se folosesc doar spațiile în care rețeaua rămâne realistă.
 * @param {() => number} rng
 * @param {number} prefix
 * @returns {number}
 */
function randomIp(rng, prefix) {
  /** @type {string[]} */
  const pools = ["10", "public"];
  if (prefix >= 12) pools.push("172");
  if (prefix >= 16) pools.push("192", "192");
  const pool = pick(rng, pools);
  const r = () => randInt(rng, 0, 255);
  const o = pool === "10" ? [10, r(), r(), r()]
    : pool === "172" ? [172, randInt(rng, 16, 31), r(), r()]
      : pool === "192" ? [192, 168, r(), r()]
        : [pick(rng, PUBLIC_FIRST), r(), r(), r()];
  return ((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3];
}

/** Rețeaua, broadcastul (și opțional rețeaua următoare) sunt toate private sau publice, în același interval. */
const REALISTIC = new Set(["private", "public"]);
/** @param {import("../subnet/subnet.js").Analysis} a @param {boolean} needNext */
function realistic(a, needNext) {
  const net = classifyAddress(a.networkInt);
  const bc = classifyAddress(a.broadcastInt);
  if (!REALISTIC.has(net.kind) || net.id !== bc.id) return false;
  if (needNext) {
    if (a.nextNetwork === null) return false;
    if (classifyAddress(/** @type {number} */ (ipToInt(a.nextNetwork))).id !== net.id) return false;
  }
  return true;
}

/**
 * Prefixul pentru un nivel. Granițele de octet (/8, /16, /24) apar mai rar, pentru că sunt cazurile ușoare.
 * @param {() => number} rng
 * @param {Level} level
 */
function randomPrefix(rng, level) {
  const [lo, hi] = PREFIX_RANGE[level];
  const weighted = range(lo, hi).flatMap((p) => (p % 8 === 0 ? [p] : [p, p]));
  return pick(rng, weighted);
}

/** Cât de des enunțul arată masca cu puncte în loc de /prefix. */
const MASK_NOTATION = { easy: 0.2, medium: 0.3, hard: 0.4 };

/**
 * @param {string} ip
 * @param {number} prefix
 * @param {"prefix" | "mask"} notation
 */
const writeCidr = (ip, prefix, notation) => (notation === "mask" ? `${ip} ${prefixToMask(prefix)}` : `${ip}/${prefix}`);

// ───────────────────────── Generatorul ─────────────────────────

/**
 * Un exercițiu nou. Nu repetă întrebarea precedentă; în modul „toate tipurile” nici tipul precedent.
 * @param {() => number} rng
 * @param {{ level?: Level, type?: ExerciseType | "all", previous?: Exercise | null }} [options]
 * @returns {Exercise}
 */
export function generateExercise(rng, options = {}) {
  const level = LEVELS.includes(/** @type {Level} */ (options.level)) ? /** @type {Level} */ (options.level) : "easy";
  const all = !options.type || options.type === "all" || !TYPES.includes(/** @type {ExerciseType} */ (options.type));
  const prev = options.previous ?? null;
  /** @type {Exercise | null} */
  let ex = null;
  for (let i = 0; i < 50; i++) {
    let type = /** @type {ExerciseType} */ (all ? pick(rng, MIX[level]) : options.type);
    if (all && prev && type === prev.type) type = pick(rng, MIX[level].filter((t) => t !== prev.type));
    ex = makeExercise(rng, level, type);
    if (!prev || ex.key !== prev.key) return ex;
  }
  return /** @type {Exercise} */ (ex);
}

/**
 * @param {() => number} rng
 * @param {Level} level
 * @param {ExerciseType} type
 * @returns {Exercise}
 */
function makeExercise(rng, level, type) {
  const kind = KIND[type];
  const notation = /** @type {"prefix" | "mask"} */ (rng() < MASK_NOTATION[level] ? "mask" : "prefix");
  /** @param {Omit<Exercise, "key" | "level" | "type" | "kind">} rest @returns {Exercise} */
  const done = (rest) => ({ key: `${type}|${rest.subject}|${rest.newPrefix ?? ""}`, level, type, kind, ...rest });

  if (type === "mask") {
    const prefix = randomPrefix(rng, level);
    return done({ subject: `/${prefix}`, ip: null, prefix, notation: "prefix", hosts: null, newPrefix: null, answer: prefixToMask(prefix) });
  }

  if (type === "maskForHosts") {
    const prefix = randomPrefix(rng, level);
    const h = 32 - prefix;
    const lo = Math.max(2, 2 ** (h - 1) - 1); // primul număr pentru care blocul mai mic nu ajunge
    const hi = 2 ** h - 2;
    const r = rng();
    const hosts = r < 0.15 ? hi : r < 0.25 ? lo : randInt(rng, lo, hi); // și cazurile de la limită
    return done({ subject: String(hosts), ip: null, prefix, notation: "prefix", hosts, newPrefix: null, answer: `/${prefix}` });
  }

  if (type === "subnetCount") {
    let base;
    let next;
    if (level === "easy") {
      base = 24;
      next = randInt(rng, 25, 30);
    } else if (level === "medium") {
      base = randInt(rng, 16, 22);
      next = randInt(rng, base + 1, Math.min(23, base + 8));
    } else {
      base = randInt(rng, 8, 24);
      next = randInt(rng, base + 1, Math.min(30, base + 12));
    }
    const a = randomAnalysis(rng, base, false, false);
    return done({
      subject: writeCidr(a.network, base, notation), ip: a.network, prefix: base, notation, hosts: null, newPrefix: next,
      answer: String(2 ** (next - base)),
    });
  }

  const prefix = randomPrefix(rng, level);
  if (type === "validHost") {
    const a = randomAnalysis(rng, prefix, true, false);
    // jumătate din cazuri sunt capcane (rețeaua sau broadcastul), restul host-uri, inclusiv primul și ultimul
    const r = rng();
    const ipInt = r < 0.25 ? a.networkInt : r < 0.5 ? a.broadcastInt : r < 0.62 ? a.firstHostInt : r < 0.74 ? a.lastHostInt : a.ipInt;
    const ip = intToIp(ipInt);
    const isHost = ipInt !== a.networkInt && ipInt !== a.broadcastInt;
    return done({ subject: writeCidr(ip, prefix, notation), ip, prefix, notation, hosts: null, newPrefix: null, answer: isHost ? "yes" : "no" });
  }

  const a = randomAnalysis(rng, prefix, false, type === "nextSubnet");
  /** @type {Record<string, string>} */
  const answers = {
    network: a.network, broadcast: a.broadcast, firstHost: a.firstHost, lastHost: a.lastHost,
    nextSubnet: /** @type {string} */ (a.nextNetwork), hostCount: String(a.usableHosts),
  };
  return done({ subject: writeCidr(a.ip, prefix, notation), ip: a.ip, prefix, notation, hosts: null, newPrefix: null, answer: answers[type] });
}

/**
 * O adresă aleatoare cu prefixul dat, într-o rețea realistă. Dacă `allowEdge` e fals, adresa e un host
 * (nu chiar rețeaua sau broadcastul), ca întrebarea să nu fie banală.
 * @param {() => number} rng
 * @param {number} prefix
 * @param {boolean} allowEdge
 * @param {boolean} needNext
 */
function randomAnalysis(rng, prefix, allowEdge, needNext) {
  let a = analyze(randomIp(rng, prefix), prefix);
  for (let i = 0; i < 200; i++) {
    if (realistic(a, needNext) && (allowEdge || a.ipRole === "host")) return a;
    a = analyze(randomIp(rng, prefix), prefix);
  }
  return analyze(ipToInt("192.168.10.77") ?? 0, Math.max(prefix, 16)); // practic imposibil; doar ca plasă de siguranță
}

// ───────────────────────── Verificarea răspunsului ─────────────────────────

/**
 * @typedef {object} CheckResult
 * @property {boolean} correct
 * @property {string} expected         răspunsul corect, gata de afișat în limba cerută
 * @property {string} normalizedGiven  ce a scris utilizatorul, în forma canonică (sau textul brut dacă nu e recunoscut)
 * @property {boolean} recognized      false dacă textul nu are forma cerută (atunci nu se punctează)
 * @property {boolean} empty           true dacă nu s-a scris nimic
 */

const YES = new Set(["da", "d", "yes", "y", "true", "adevarat"]);
const NO = new Set(["nu", "n", "no", "false", "fals"]);

/**
 * Citește o adresă: spațiile sunt ignorate, zerourile din față se citesc zecimal (010 = 10), iar
 * „192,168,1,0” (virgule de la tastatura numerică) e acceptat ca „192.168.1.0”.
 * @param {string} text
 * @returns {number | null}
 */
export function readIp(text) {
  let s = String(text ?? "").replace(/\s+/g, "");
  if (/^\d{1,3}(,\d{1,3}){3}$/.test(s)) s = s.replace(/,/g, ".");
  return ipToInt(s);
}

/**
 * Citește un număr întreg: „1022”, „1 022”, „1,022”, „1.022”, „16 777 214” (cu spațiu, spațiu fix, virgulă,
 * punct sau apostrof între grupe de câte 3 cifre, același separator peste tot).
 * @param {string} text
 * @returns {number | null}
 */
export function readNumber(text) {
  const s = String(text ?? "").trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^\d{1,3}([ ,.'  ])\d{3}(?:\1\d{3})*$/.exec(s);
  return m ? Number(s.replace(/\D/g, "")) : null;
}

/**
 * Răspunsul corect, gata de afișat.
 * @param {Exercise} ex
 * @param {Lang} [lang]
 */
export function expectedText(ex, lang = "ro") {
  const L = lang === "en" ? "en" : "ro";
  if (ex.kind === "number") return formatCount(Number(ex.answer), L);
  if (ex.kind === "yesno") return ex.answer === "yes" ? TEXTS[L].yes : TEXTS[L].no;
  if (ex.kind === "prefixOrMask") return `${ex.answer} (${prefixToMask(ex.prefix)})`;
  return ex.answer;
}

/**
 * Verifică răspunsul. Nu aruncă excepții.
 * - adrese: „192.168.10.64”, cu spații, cu zerouri în față („192.168.010.064”) sau urmate de prefixul din enunț („/26”);
 * - numere: cu sau fără separator de mii;
 * - mască (pentru un prefix): doar zecimal cu puncte;
 * - prefix sau mască (pentru N host-uri): „/26”, „26”, „255.255.255.192”;
 * - da / nu: „da”, „nu”, „yes”, „no”, „d”, „n”, „y”, fără diferență între litere mari și mici.
 * @param {Exercise} ex
 * @param {unknown} given
 * @param {Lang} [lang]
 * @returns {CheckResult}
 */
export function checkAnswer(ex, given, lang = "ro") {
  const L = lang === "en" ? "en" : "ro";
  const raw = String(given ?? "").trim();
  const expected = expectedText(ex, L);
  const res = (/** @type {boolean} */ correct, /** @type {string} */ normalizedGiven, recognized = true) =>
    /** @type {CheckResult} */ ({ correct, expected, normalizedGiven, recognized, empty: false });
  if (!raw) return { correct: false, expected, normalizedGiven: "", recognized: false, empty: true };

  switch (ex.kind) {
    case "ip": {
      const m = /^(.*?)(?:\s*\/\s*(\d{1,2}))?$/.exec(raw);
      const ip = readIp(m?.[1] ?? "");
      if (ip === null) return res(false, raw, false);
      const suffix = m?.[2] === undefined ? null : Number(m[2]);
      if (suffix !== null && suffix > 32) return res(false, raw, false);
      const norm = intToIp(ip) + (suffix === null ? "" : `/${suffix}`);
      return res(intToIp(ip) === ex.answer && (suffix === null || suffix === ex.prefix), norm);
    }
    case "number": {
      const n = readNumber(raw);
      if (n === null) return res(false, raw, false);
      return res(n === Number(ex.answer), formatCount(n, L));
    }
    case "mask": {
      const m = readIp(raw);
      if (m === null) return res(false, raw, false);
      return res(intToIp(m) === ex.answer, intToIp(m));
    }
    case "prefixOrMask": {
      const s = raw.replace(/\s+/g, "");
      const pm = /^\/?(\d{1,2})$/.exec(s);
      if (pm) {
        const p = Number(pm[1]);
        if (p > 32) return res(false, raw, false);
        return res(`/${p}` === ex.answer, `/${p}`);
      }
      const maskInt = readIp(s.replace(/^\//, ""));
      if (maskInt === null) return res(false, raw, false);
      const mask = intToIp(maskInt);
      const p = maskToPrefix(mask);
      return res(p !== null && `/${p}` === ex.answer, p === null ? mask : `${mask} (/${p})`);
    }
    case "yesno": {
      const s = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const v = YES.has(s) ? "yes" : NO.has(s) ? "no" : null;
      if (v === null) return res(false, raw, false);
      return res(v === ex.answer, v === "yes" ? TEXTS[L].yes : TEXTS[L].no);
    }
    default:
      return res(false, raw, false);
  }
}

/**
 * Mesajul pentru un răspuns nerecunoscut (sau gol).
 * @param {Exercise} ex
 * @param {CheckResult} r
 * @param {Lang} [lang]
 */
export function answerError(ex, r, lang = "ro") {
  const T = TEXTS[lang === "en" ? "en" : "ro"];
  return r.empty ? T.errors.empty : T.errors[ex.kind];
}

// ───────────────────────── Scorul sesiunii ─────────────────────────

/** @typedef {{ correct: number, attempted: number, streak: number, best: number }} Score */

/** @returns {Score} */
export function emptyScore() {
  return { correct: 0, attempted: 0, streak: 0, best: 0 };
}

/**
 * @param {Score} s
 * @param {boolean} correct
 * @returns {Score}
 */
export function updateScore(s, correct) {
  const streak = correct ? s.streak + 1 : 0;
  return { correct: s.correct + (correct ? 1 : 0), attempted: s.attempted + 1, streak, best: Math.max(s.best, streak) };
}

// ───────────────────────── Rezolvarea pas cu pas ─────────────────────────

const BIT_VALUES = [128, 64, 32, 16, 8, 4, 2, 1];

/**
 * Rezolvarea exercițiului, ca listă de pași (ultimul are id-ul „answer”).
 * Pentru adrese se folosesc pașii metodei blocului din calculator (mask, octet, block, multiples, network, broadcast, hosts…).
 * @param {Exercise} ex
 * @param {Lang} [lang]
 * @returns {Step[]}
 */
export function solution(ex, lang = "ro") {
  const L = lang === "en" ? "en" : "ro";
  const ro = L === "ro";
  const T = TEXTS[L];
  const nb = (/** @type {number} */ n) => plural(n, L, FORMS.BITS);
  const fc = (/** @type {number} */ n) => formatCount(n, L);
  const answer = (/** @type {string} */ text) => ({ id: "answer", title: T.answerTitle, text });

  if (ex.type === "mask") {
    const p = ex.prefix;
    const full = Math.floor(p / 8);
    const rem = p % 8;
    const mask = ex.answer;
    const remaining = 4 - full - (rem > 0 ? 1 : 0);
    const bits = BIT_VALUES.slice(0, rem);
    const value = bits.reduce((s, x) => s + x, 0);
    const fullTxt = ro
      ? `${p} = ${full} × 8 + ${rem}: ${full === 1 ? "primul octet este" : `primii ${full} octeți sunt`} 255 (câte 8 biți de 1).`
      : `${p} = ${full} × 8 + ${rem}: the first ${full === 1 ? "octet is" : `${full} octets are`} 255 (eight 1 bits each).`;
    const remTxt = rem === 0
      ? (ro ? "Granița cade exact la capătul octetului, deci nu mai rămâne niciun bit de 1." : "The boundary falls exactly at the end of an octet, so no 1 bits are left over.")
      : rem === 1
        ? (ro ? "În octetul următor rămâne un singur bit de 1, cel din stânga, care valorează 128." : "In the next octet one 1 bit is left, the leftmost, worth 128.")
        : (ro ? `În octetul următor rămân ${nb(rem)} de 1, de la stânga: ${bits.join(" + ")} = ${value}.` : `In the next octet ${nb(rem)} are left, from the left: ${bits.join(" + ")} = ${value}.`);
    return [
      {
        id: "bits", title: ro ? "Biții de rețea" : "The network bits",
        text: ro ? `Prefixul /${p} înseamnă că primii ${nb(p)} ai măștii sunt 1, iar ceilalți ${nb(32 - p)} sunt 0.` : `The /${p} prefix means the first ${nb(p)} of the mask are 1s and the other ${nb(32 - p)} are 0s.`,
      },
      { id: "full", title: ro ? "Octeții plini" : "The full octets", text: fullTxt },
      { id: "rest", title: ro ? "Octetul interesant" : "The interesting octet", text: remTxt },
      answer(ro
        ? `${remaining > 0 ? "Octeții rămași sunt 0, deci masca" : "Masca"} pentru /${p} este ${mask}.`
        : `${remaining > 0 ? "The remaining octets are 0, so the mask" : "The mask"} for /${p} is ${mask}.`),
    ];
  }

  if (ex.type === "maskForHosts") {
    const n = /** @type {number} */ (ex.hosts);
    const h = 32 - ex.prefix;
    const below = 2 ** (h - 1) - 2;
    const at = 2 ** h - 2;
    const mask = prefixToMask(ex.prefix);
    return [
      {
        id: "formula", title: ro ? "Formula" : "The formula",
        text: ro ? "Cu h biți de host, o subrețea are 2^h − 2 host-uri utilizabile (se scad adresa de rețea și cea de broadcast)."
          : "With h host bits, a subnet has 2^h − 2 usable hosts (the network and broadcast addresses are subtracted).",
      },
      {
        id: "bits", title: ro ? "Câți biți de host" : "How many host bits",
        text: ro
          ? `Căutăm cel mai mic h pentru care 2^h − 2 ≥ ${fc(n)}: 2^${h - 1} − 2 = ${fc(below)} nu ajunge, dar 2^${h} − 2 = ${fc(at)} ajunge. Deci h = ${h}.`
          : `We need the smallest h with 2^h − 2 ≥ ${fc(n)}: 2^${h - 1} − 2 = ${fc(below)} is not enough, but 2^${h} − 2 = ${fc(at)} is. So h = ${h}.`,
      },
      answer(ro ? `Prefixul = 32 − ${h} = /${ex.prefix}, adică masca ${mask}.` : `Prefix = 32 − ${h} = /${ex.prefix}, which is the mask ${mask}.`),
    ];
  }

  if (ex.type === "subnetCount") {
    const b = ex.prefix;
    const n = /** @type {number} */ (ex.newPrefix);
    const k = n - b;
    const count = 2 ** k;
    const cidr = `${ex.ip}/${b}`;
    return [
      {
        id: "borrowed", title: ro ? "Biții împrumutați" : "The borrowed bits",
        text: ro ? `De la /${b} la /${n} se împrumută ${n} − ${b} = ${nb(k)} din partea de host.` : `Going from /${b} to /${n} borrows ${n} − ${b} = ${nb(k)} from the host part.`,
      },
      {
        id: "count", title: ro ? "Numărul de subrețele" : "The number of subnets",
        text: ro ? `Fiecare bit împrumutat dublează numărul de subrețele: 2^${k} = ${fc(count)}.` : `Each borrowed bit doubles the number of subnets: 2^${k} = ${fc(count)}.`,
      },
      {
        id: "check", title: ro ? "Verificare" : "Check",
        text: ro
          ? `Rețeaua /${b} are 2^${32 - b} = ${plural(2 ** (32 - b), "ro", FORMS.ADDRS)}, iar o subrețea /${n} are 2^${32 - n} = ${fc(2 ** (32 - n))}; ${fc(2 ** (32 - b))} ÷ ${fc(2 ** (32 - n))} = ${fc(count)}.`
          : `A /${b} network has 2^${32 - b} = ${fc(2 ** (32 - b))} addresses and a /${n} subnet has 2^${32 - n} = ${fc(2 ** (32 - n))}; ${fc(2 ** (32 - b))} ÷ ${fc(2 ** (32 - n))} = ${fc(count)}.`,
      },
      answer(ro ? `Din ${cidr} obții ${plural(count, "ro", FORMS.SUBNETS)} /${n}.` : `${cidr} gives ${plural(count, "en", FORMS.SUBNETS)} of size /${n}.`),
    ];
  }

  // Tipurile cu adrese: pașii metodei blocului din calculator.
  const ip = /** @type {string} */ (ex.ip);
  const a = analyze(ip, ex.prefix);
  const all = steps(ip, ex.prefix, L);
  const keep = ex.type === "hostCount"
    ? all.filter((s) => s.id === "mask" || s.id === "count")
    : all.filter((s) => s.id !== "count" && s.id !== "role"); // „role” ar repeta răspunsul de la „adresă validă?”

  /** @type {Record<string, string>} */
  const final = ro
    ? {
      network: `Adresa de rețea este ${a.network}.`,
      broadcast: `Adresa de broadcast este ${a.broadcast}.`,
      firstHost: `Primul host utilizabil este ${a.firstHost}.`,
      lastHost: `Ultimul host utilizabil este ${a.lastHost}.`,
      nextSubnet: `Subrețeaua următoare începe imediat după broadcast: ${a.broadcast} + 1 = ${a.nextNetwork}.`,
      hostCount: `Subrețeaua are ${plural(a.usableHosts, "ro", FORMS.HOSTS)} utilizabile.`.replace("1 host utilizabile", "1 host utilizabil"),
    }
    : {
      network: `The network address is ${a.network}.`,
      broadcast: `The broadcast address is ${a.broadcast}.`,
      firstHost: `The first usable host is ${a.firstHost}.`,
      lastHost: `The last usable host is ${a.lastHost}.`,
      nextSubnet: `The next subnet starts right after the broadcast: ${a.broadcast} + 1 = ${a.nextNetwork}.`,
      hostCount: `The subnet has ${formatCount(a.usableHosts, "en")} usable ${a.usableHosts === 1 ? "host" : "hosts"}.`,
    };
  if (ex.type === "validHost") {
    final.validHost = a.ipRole === "network"
      ? (ro ? `${ip} este adresa de rețea, deci răspunsul este Nu.` : `${ip} is the network address, so the answer is No.`)
      : a.ipRole === "broadcast"
        ? (ro ? `${ip} este adresa de broadcast, deci răspunsul este Nu.` : `${ip} is the broadcast address, so the answer is No.`)
        : (ro ? `${ip} este între primul host (${a.firstHost}) și ultimul (${a.lastHost}), deci răspunsul este Da.` : `${ip} lies between the first host (${a.firstHost}) and the last (${a.lastHost}), so the answer is Yes.`);
  }
  return [...keep, answer(final[ex.type])];
}
