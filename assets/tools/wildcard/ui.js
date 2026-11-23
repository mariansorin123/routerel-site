// Interfața calculatorului de mască wildcard (fără framework). Toată matematica e în wildcard.js.
//
// Folosire:
//   import { mountWildcardCalculator } from "./ui.js";
//   const calc = mountWildcardCalculator(document.getElementById("wildcard-tool"), { lang: "ro" });
//   calc.setLang("en");
//
// Componenta construiește singură tot HTML-ul în elementul primit. Stilurile folosesc clase cu prefixul `wcc-`
// (vezi demo.html); pagina gazdă le ia de acolo.

import {
  convertMask, conversionSteps, analyzeEntry, testAddress, planRange, configLines, describeOctet, describeOctetTest,
  errorMessage, formatCount, plural, FORMS, guessTab, octetName,
} from "./wildcard.js";

/** @typedef {import("./wildcard.js").Lang} Lang */
/** @typedef {"convert" | "match" | "range"} Tab */

const T = {
  ro: {
    tabs: { convert: "Conversie", match: "Ce acoperă?", range: "Interval" },
    tablist: "Modul calculatorului",
    calc: "Calculează",
    examples: "Exemple:",
    exampleAria: (/** @type {string} */ x) => `Încarcă exemplul ${x}`,
    results: "Rezultat",
    na: "nu există (wildcard necontiguu)",
    // fila 1
    convLabel: "Mască, prefix sau wildcard",
    convHint: "De exemplu 255.255.255.192, /26 sau 0.0.0.63",
    convRows: { mask: "Masca de subrețea", wildcard: "Masca wildcard", prefix: "Prefixul", covered: "Adrese acoperite", dc: "Biți „nu contează”" },
    calcTitle: "Pas cu pas (255 minus fiecare octet)",
    calcCaption: (/** @type {boolean} */ fromWc) => (fromWc ? "De la wildcard la mască" : "De la mască la wildcard"),
    binary: "În binar",
    binRows: { mask: "Masca", inverse: "Inversul", wildcard: "Wildcard" },
    legendChk: "0 în wildcard: bitul se verifică",
    legendDc: "1 în wildcard: bitul nu contează",
    convSummary: (/** @type {import("./wildcard.js").Conversion} */ c) =>
      c.contiguous
        ? `Masca ${c.mask} (/${c.prefix}) are wildcardul ${c.wildcard}.`
        : `${c.wildcard} este un wildcard necontiguu: acoperă ${plural(c.blockSize, "ro", FORMS.ADDRS)} și nu are prefix.`,
    // fila 2
    entryLabel: "Intrarea din ACL sau OSPF",
    entryHint: "De exemplu 192.168.1.0 0.0.0.255, host 10.1.1.1, any sau 192.168.1.0/24",
    entryRows: { ios: "Intrarea, cum o salvează IOS", first: "Prima adresă", last: "Ultima adresă", covered: "Adrese acoperite", prefix: "Prefix echivalent" },
    changed: (/** @type {string} */ ios, /** @type {string} */ given) =>
      `IOS o salvează ca ${ios}: unde wildcardul are 1, biții adresei nu contează, așa că IOS îi pune pe 0 (ai scris ${given}).`,
    maskLike: (/** @type {string} */ wc, /** @type {string} */ sug) =>
      `${wc} arată ca o mască de subrețea. În ACL și în OSPF se scrie wildcardul, deci probabil voiai ${sug}. Așa cum e scris, intrarea verifică doar biții unde wildcardul are 0.`,
    single: "O adresă fără wildcard înseamnă un singur host: într-un ACL standard, wildcardul implicit este 0.0.0.0.",
    dcText: (/** @type {number} */ n, /** @type {number} */ count) =>
      n === 0
        ? "Wildcardul nu are niciun bit de 1, deci intrarea acoperă o singură adresă."
        : `Wildcardul are ${plural(n, "ro", FORMS.BITS)} de 1 („nu contează”), deci intrarea acoperă 2^${n} = ${plural(count, "ro", FORMS.ADDRS)}.`,
    octetsTitle: "Pe octeți",
    cols: { octet: "Octet", address: "Adresă", wildcard: "Wildcard", values: "Valori acceptate", n: "Nr.", network: "Rețea", entry: "Intrare ACL", addrs: "Adrese" },
    sampleTitle: "Primele adrese acoperite",
    sampleMore: (/** @type {number} */ n) => `… și încă ${formatCount(n, "ro")}`,
    entrySummary: (/** @type {import("./wildcard.js").EntryAnalysis} */ a) =>
      a.contiguous
        ? `${a.ios} acoperă ${plural(a.count, "ro", FORMS.ADDRS)}${a.count > 1 ? `: de la ${a.first} la ${a.last}` : `: ${a.first}`}.`
        : `${a.ios} acoperă ${plural(a.count, "ro", FORMS.ADDRS)}, care nu sunt la rând (wildcard necontiguu). Prima este ${a.first}, ultima ${a.last}.`,
    testLabel: "Verifică o adresă",
    testHint: "Scrie o adresă și afli dacă intrarea de mai sus o acoperă.",
    testBtn: "Verifică",
    yes: "Se potrivește",
    no: "Nu se potrivește",
    testSummary: (/** @type {string} */ ip, /** @type {string} */ ios, /** @type {boolean} */ ok, /** @type {number | null} */ bad) =>
      ok ? `${ip} se potrivește cu ${ios}.` : `${ip} nu se potrivește cu ${ios}: diferă octetul ${(bad ?? 0) + 1}.`,
    testNeedsEntry: "Scrie întâi o intrare validă mai sus.",
    // fila 3
    rangeLabel: "Rețea sau interval de adrese",
    rangeHint: "De exemplu 10.0.0.0/22, 10.0.0.0 255.255.252.0 sau 10.0.0.0 - 10.0.3.255",
    rangeRows: { start: "Prima adresă", end: "Ultima adresă", count: "Adrese", wildcard: "Wildcard", entries: "Intrări necesare" },
    normalized: (/** @type {string} */ c) => `Am folosit rețeaua ${c} (adresa avea biți de host setați).`,
    entriesTitle: "Intrările",
    entriesNote: "Cel mai mic număr de intrări cu wildcard contiguu care acoperă exact intervalul, fără nicio adresă în plus.",
    rangeSummary: (/** @type {import("./wildcard.js").RangePlan} */ r) =>
      `${r.start} – ${r.end}: ${plural(r.count, "ro", FORMS.ADDRS)}, ${r.entries.length === 1 ? `o singură intrare (${r.entries[0].acl})` : plural(r.entries.length, "ro", FORMS.ENTRIES)}.`,
    linesTitle: "Linii gata de copiat",
    code: { standard: "ACL standard", extended: "ACL extins (exemplu)", ospf: "OSPF" },
    codeNote: { standard: "", extended: "Sursa este intervalul, destinația orice.", ospf: "Aria 0, în modul router ospf." },
    copy: "Copiază",
    copied: "Copiat",
    copyAria: (/** @type {string} */ x) => `Copiază liniile pentru ${x}`,
    copiedLive: (/** @type {string} */ x) => `Liniile pentru ${x} au fost copiate.`,
    copyFail: "Nu am putut copia automat. Liniile sunt selectate: apasă Ctrl+C.",
    notes: {
      numbers: "Un ACL standard numerotat are numărul 1–99 sau 1300–1999, iar unul extins 100–199 sau 2000–2699.",
      deny: "La finalul oricărui ACL există un deny implicit: tot ce nu e permis explicit este blocat.",
      host: "Un /32 se scrie host x.x.x.x, adică x.x.x.x 0.0.0.0. La OSPF se scrie cu wildcardul 0.0.0.0.",
      any: "0.0.0.0 255.255.255.255 se scrie mai scurt any.",
      ospf: "La OSPF, network activează OSPF pe interfețele a căror adresă intră în interval; rețeaua anunțată este cea a interfeței.",
    },
    scrollTable: "Tabel (se poate derula pe orizontală)",
  },
  en: {
    tabs: { convert: "Convert", match: "Matches", range: "Range" },
    tablist: "Calculator mode",
    calc: "Calculate",
    examples: "Examples:",
    exampleAria: (/** @type {string} */ x) => `Load example ${x}`,
    results: "Result",
    na: "none (non-contiguous wildcard)",
    convLabel: "Mask, prefix or wildcard",
    convHint: "For example 255.255.255.192, /26 or 0.0.0.63",
    convRows: { mask: "Subnet mask", wildcard: "Wildcard mask", prefix: "Prefix", covered: "Addresses covered", dc: "“Don't care” bits" },
    calcTitle: "Step by step (255 minus each octet)",
    calcCaption: (/** @type {boolean} */ fromWc) => (fromWc ? "From wildcard to mask" : "From mask to wildcard"),
    binary: "In binary",
    binRows: { mask: "Mask", inverse: "Inverse", wildcard: "Wildcard" },
    legendChk: "0 in the wildcard: the bit is checked",
    legendDc: "1 in the wildcard: the bit doesn't matter",
    convSummary: (/** @type {import("./wildcard.js").Conversion} */ c) =>
      c.contiguous
        ? `The mask ${c.mask} (/${c.prefix}) has the wildcard ${c.wildcard}.`
        : `${c.wildcard} is a non-contiguous wildcard: it covers ${plural(c.blockSize, "en", FORMS.ADDRS)} and has no prefix.`,
    entryLabel: "ACL or OSPF entry",
    entryHint: "For example 192.168.1.0 0.0.0.255, host 10.1.1.1, any or 192.168.1.0/24",
    entryRows: { ios: "Entry as IOS stores it", first: "First address", last: "Last address", covered: "Addresses covered", prefix: "Equivalent prefix" },
    changed: (/** @type {string} */ ios, /** @type {string} */ given) =>
      `IOS stores it as ${ios}: where the wildcard has 1s, the address bits don't matter, so IOS sets them to 0 (you typed ${given}).`,
    maskLike: (/** @type {string} */ wc, /** @type {string} */ sug) =>
      `${wc} looks like a subnet mask. ACLs and OSPF take the wildcard, so you probably meant ${sug}. As written, the entry only checks the bits where the wildcard has 0s.`,
    single: "An address without a wildcard means a single host: in a standard ACL the default wildcard is 0.0.0.0.",
    dcText: (/** @type {number} */ n, /** @type {number} */ count) =>
      n === 0
        ? "The wildcard has no 1 bits, so the entry covers a single address."
        : `The wildcard has ${plural(n, "en", FORMS.BITS)} set to 1 (“don't care”), so the entry covers 2^${n} = ${plural(count, "en", FORMS.ADDRS)}.`,
    octetsTitle: "Octet by octet",
    cols: { octet: "Octet", address: "Address", wildcard: "Wildcard", values: "Accepted values", n: "#", network: "Network", entry: "ACL entry", addrs: "Addresses" },
    sampleTitle: "First addresses covered",
    sampleMore: (/** @type {number} */ n) => `… and ${formatCount(n, "en")} more`,
    entrySummary: (/** @type {import("./wildcard.js").EntryAnalysis} */ a) =>
      a.contiguous
        ? `${a.ios} covers ${plural(a.count, "en", FORMS.ADDRS)}${a.count > 1 ? `: ${a.first} to ${a.last}` : `: ${a.first}`}.`
        : `${a.ios} covers ${plural(a.count, "en", FORMS.ADDRS)} that are not consecutive (non-contiguous wildcard). The first is ${a.first}, the last ${a.last}.`,
    testLabel: "Test an address",
    testHint: "Type an address to see whether the entry above covers it.",
    testBtn: "Test",
    yes: "Matches",
    no: "Does not match",
    testSummary: (/** @type {string} */ ip, /** @type {string} */ ios, /** @type {boolean} */ ok, /** @type {number | null} */ bad) =>
      ok ? `${ip} matches ${ios}.` : `${ip} does not match ${ios}: octet ${(bad ?? 0) + 1} differs.`,
    testNeedsEntry: "Enter a valid entry above first.",
    rangeLabel: "Network or address range",
    rangeHint: "For example 10.0.0.0/22, 10.0.0.0 255.255.252.0 or 10.0.0.0 - 10.0.3.255",
    rangeRows: { start: "First address", end: "Last address", count: "Addresses", wildcard: "Wildcard", entries: "Entries needed" },
    normalized: (/** @type {string} */ c) => `Used the network ${c} (the address had host bits set).`,
    entriesTitle: "The entries",
    entriesNote: "The fewest entries with a contiguous wildcard that cover exactly the range, with no extra addresses.",
    rangeSummary: (/** @type {import("./wildcard.js").RangePlan} */ r) =>
      `${r.start} – ${r.end}: ${plural(r.count, "en", FORMS.ADDRS)}, ${r.entries.length === 1 ? `a single entry (${r.entries[0].acl})` : plural(r.entries.length, "en", FORMS.ENTRIES)}.`,
    linesTitle: "Ready-to-copy lines",
    code: { standard: "Standard ACL", extended: "Extended ACL (example)", ospf: "OSPF" },
    codeNote: { standard: "", extended: "The range is the source, any destination.", ospf: "Area 0, in router ospf mode." },
    copy: "Copy",
    copied: "Copied",
    copyAria: (/** @type {string} */ x) => `Copy the lines for ${x}`,
    copiedLive: (/** @type {string} */ x) => `The lines for ${x} were copied.`,
    copyFail: "Couldn't copy automatically. The lines are selected: press Ctrl+C.",
    notes: {
      numbers: "A numbered standard ACL uses 1–99 or 1300–1999; an extended one uses 100–199 or 2000–2699.",
      deny: "Every ACL ends with an implicit deny: anything not explicitly permitted is blocked.",
      host: "A /32 is written host x.x.x.x, which is x.x.x.x 0.0.0.0. In OSPF you write it with the wildcard 0.0.0.0.",
      any: "0.0.0.0 255.255.255.255 is written simply as any.",
      ospf: "In OSPF, network enables OSPF on the interfaces whose address falls in the range; the network advertised is the interface's own subnet.",
    },
    scrollTable: "Table (scrolls horizontally)",
  },
};

const EXAMPLES = {
  convert: ["255.255.255.192", "/20", "0.0.0.255", "0.0.255.0"],
  match: ["192.168.1.0 0.0.0.255", "192.168.1.5 0.0.0.255", "10.1.1.0 0.0.0.254", "host 10.1.1.1", "any", "172.16.0.0/12"],
  range: ["10.0.0.0/22", "172.16.0.0 255.255.240.0", "192.168.1.10 - 192.168.1.20", "10.1.1.1"],
};
const TABS = /** @type {const} */ (["convert", "match", "range"]);

let instances = 0;

/** @param {unknown} s */
/** Escape simplu, pentru valorile câmpurilor (ce scrie omul rămâne exact cum l-a scris). @param {unknown} s */
const escA = (s) => String(s).replace(/[&<>"']/g, (c) => /** @type {Record<string,string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => /** @type {Record<string,string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
  // un număr rămâne lângă cuvântul lui („11 addresses”, „256 de adrese”), iar „oricare (0–255)” / „any (0–255)” nu se rupe
  .replace(/(\d) (de )?(?=[\p{L}])/gu, (_, d, de) => `${d}\u00a0${de ? "de\u00a0" : ""}`)
  .replace(/(oricare|any) \(/g, "$1\u00a0(");
/** Ca esc, dar fiecare adresă (cu prefixul ei, dacă are) stă pe un singur rând: textul se rupe doar între cuvinte. @param {unknown} s */
const brk = (s) => esc(s).replace(/\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?/g, (m) => `<span class="wcc-nw">${m}</span>`);
/**
 * O linie de configurare: „host x”, perechea adresă + wildcard și „area N” nu se despart la capăt de rând. Escape simplu (fără
 * spații nedespărțite): ce se copiază trebuie să meargă în IOS; nedespărțirea o face doar CSS-ul (.wcc-nw = white-space: nowrap).
 * @param {string} line
 */
export const codeLine = (line) => escA(line).replace(/host \S+|\d{1,3}(?:\.\d{1,3}){3} \d{1,3}(?:\.\d{1,3}){3}|area \S+/g, (m) => `<span class="wcc-nw">${m}</span>`);

/**
 * Cei 32 de biți ai lui `value`, grupați pe octeți, colorați după wildcard: 0 = se verifică, 1 = nu contează.
 * @param {number} value
 * @param {number} wc
 */
function bitsHtml(value, wc) {
  const v = (value >>> 0).toString(2).padStart(32, "0");
  const w = (wc >>> 0).toString(2).padStart(32, "0");
  const groups = [];
  for (let o = 0; o < 4; o++) {
    let html = "";
    let run = "";
    let cls = "";
    for (let i = o * 8; i < o * 8 + 8; i++) {
      const c = w[i] === "1" ? "wcc-dc" : "wcc-chk";
      if (c !== cls && run) {
        html += `<span class="${cls}">${run}</span>`;
        run = "";
      }
      cls = c;
      run += v[i];
    }
    html += `<span class="${cls}">${run}</span>`;
    groups.push(html);
  }
  return groups.join(".");
}

/**
 * @param {HTMLElement} root
 * @param {{ lang?: Lang, initial?: string, tab?: Tab }} [options]
 *   `initial`: text precompletat în fila potrivită (o mască, un prefix sau un wildcard; o intrare ca
 *   „192.168.1.0 0.0.0.255”; un interval „a - b”). Fila se alege singură, dacă nu e dată `tab`.
 */
/** Plasă de siguranță pentru ce se copiază: spații și cratime obișnuite (IOS nu acceptă U+00A0 / U+2011). @param {string} text */
export const copyClean = (text) => text.replace(/\u00a0/g, " ").replace(/\u2011/g, "-");

export function mountWildcardCalculator(root, options = {}) {
  const uid = `wcc${++instances}`;
  const id = (/** @type {string} */ name) => `${uid}-${name}`;
  const initial = typeof options.initial === "string" && options.initial.trim() ? options.initial.trim().slice(0, 64) : null;
  const firstTab = options.tab && TABS.includes(options.tab) ? options.tab : initial ? guessTab(initial) : "convert";

  const state = {
    /** @type {Lang} */ lang: options.lang === "en" ? "en" : "ro",
    /** @type {Tab} */ tab: firstTab,
    convert: initial && firstTab === "convert" ? initial : "255.255.255.192",
    match: initial && firstTab === "match" ? initial : "192.168.1.0 0.0.0.255",
    test: "192.168.1.77",
    range: initial && firstTab === "range" ? initial : "10.0.0.0 - 10.0.3.255",
    showErr: { convert: false, match: false, test: false, range: false },
  };
  const t = () => T[state.lang];

  /** @param {string} name */
  const byId = (name) => /** @type {HTMLElement} */ (root.querySelector(`#${id(name)}`));

  // ───────── construirea DOM-ului ─────────

  /**
   * @param {Tab} k
   * @param {string} label
   * @param {string} hint
   */
  function inputForm(k, label, hint) {
    const L = t();
    return `
      <form class="wcc-form" data-form="${k}" novalidate>
        <label class="wcc-label" for="${id(`${k}-in`)}">${esc(label)}</label>
        <div class="wcc-inputrow">
          <input class="wcc-input wcc-mono" id="${id(`${k}-in`)}" name="${k}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
            value="${escA(state[k])}" aria-describedby="${id(`${k}-hint`)} ${id(`${k}-err`)}">
          <button class="wcc-btn" type="submit">${esc(L.calc)}</button>
        </div>
        <p class="wcc-hint" id="${id(`${k}-hint`)}">${esc(hint)}</p>
        <p class="wcc-error" id="${id(`${k}-err`)}" hidden></p>
        <div class="wcc-examples"><span class="wcc-examples-label">${esc(L.examples)}</span>
          ${EXAMPLES[k].map((x) => `<button type="button" class="wcc-chip wcc-mono" data-example="${esc(x)}" data-for="${k}" aria-label="${esc(L.exampleAria(x))}">${esc(x)}</button>`).join("")}
        </div>
      </form>
      <p class="wcc-summary" id="${id(`${k}-summary`)}" aria-live="polite" aria-atomic="true"></p>
      <div id="${id(`${k}-out`)}"></div>`;
  }

  function shell() {
    const L = t();
    const tabBtn = (/** @type {Tab} */ k) =>
      `<button type="button" role="tab" class="wcc-tab" id="${id(`tab-${k}`)}" aria-controls="${id(`panel-${k}`)}" aria-selected="${state.tab === k}" tabindex="${state.tab === k ? 0 : -1}" data-tab="${k}">${esc(L.tabs[k])}</button>`;
    const panel = (/** @type {Tab} */ k, /** @type {string} */ body) =>
      `<section role="tabpanel" class="wcc-panel" id="${id(`panel-${k}`)}" aria-labelledby="${id(`tab-${k}`)}" ${state.tab === k ? "" : "hidden"} tabindex="0">${body}</section>`;

    const testForm = `
      <div class="wcc-block wcc-testbox">
        <form class="wcc-form" data-form="test" novalidate>
          <label class="wcc-label" for="${id("test-in")}">${esc(L.testLabel)}</label>
          <div class="wcc-inputrow">
            <input class="wcc-input wcc-mono" id="${id("test-in")}" name="test" type="text" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false"
              value="${escA(state.test)}" aria-describedby="${id("test-hint")} ${id("test-err")}">
            <button class="wcc-btn" type="submit">${esc(L.testBtn)}</button>
          </div>
          <p class="wcc-hint" id="${id("test-hint")}">${esc(L.testHint)}</p>
          <p class="wcc-error" id="${id("test-err")}" hidden></p>
        </form>
        <div id="${id("test-out")}" aria-live="polite" aria-atomic="true"></div>
      </div>`;

    return `
      <div class="wcc-tabs" role="tablist" aria-label="${esc(L.tablist)}">${TABS.map(tabBtn).join("")}</div>
      ${panel("convert", inputForm("convert", L.convLabel, L.convHint))}
      ${panel("match", inputForm("match", L.entryLabel, L.entryHint) + testForm)}
      ${panel("range", inputForm("range", L.rangeLabel, L.rangeHint))}
      <p class="wcc-sr" id="${id("status")}" aria-live="polite"></p>`;
  }

  // ───────── rezultate ─────────

  /** @param {string} html */
  const scrollTable = (html) => `<div class="wcc-scroll" role="region" tabindex="0" aria-label="${esc(t().scrollTable)}">${html}</div>`;

  /**
   * @param {[string, string, boolean][]} rows [etichetă, valoare, monospace]
   */
  const kvTable = (rows) => `<table class="wcc-table wcc-kv"><caption class="wcc-h">${esc(t().results)}</caption><tbody>${rows
    .map(([k, v, mono]) => `<tr><th scope="row">${esc(k)}</th><td${mono ? ' class="wcc-mono"' : ""}>${brk(v)}</td></tr>`)
    .join("")}</tbody></table>`;

  /**
   * @param {"convert" | "match" | "test" | "range"} k
   * @param {string | null} msg
   */
  function setError(k, msg) {
    const el = byId(`${k}-err`);
    const input = byId(`${k}-in`);
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
      el.setAttribute("role", "alert");
      input.setAttribute("aria-invalid", "true");
    } else {
      el.textContent = "";
      el.hidden = true;
      el.removeAttribute("role");
      input.removeAttribute("aria-invalid");
    }
  }

  /**
   * La o eroare: mesajul apare doar după „Calculează” (nu în timp ce scrii), iar rezultatul vechi dispare atunci.
   * @param {"convert" | "match" | "range"} k
   * @param {import("./wildcard.js").Fail} r
   */
  function showFail(k, r) {
    if (!state.showErr[k]) return;
    setError(k, errorMessage(r.error, state.lang));
    byId(`${k}-out`).innerHTML = "";
    byId(`${k}-summary`).textContent = "";
  }

  /** @param {{ announce?: boolean }} [o] */
  function renderConvert(o = {}) {
    const L = t();
    const lang = state.lang;
    const c = convertMask(state.convert);
    if (!c.ok) return showFail("convert", c);
    setError("convert", null);
    const rows = /** @type {[string, string, boolean][]} */ ([
      [L.convRows.mask, c.mask ?? L.na, c.mask !== null],
      [L.convRows.wildcard, c.wildcard, true],
      [L.convRows.prefix, c.prefix === null ? L.na : `/${c.prefix}`, c.prefix !== null],
      [L.convRows.covered, formatCount(c.blockSize, lang), false],
      [L.convRows.dc, formatCount(c.dontCareBits, lang), false],
    ]);
    const all = conversionSteps(c, lang);
    const note = all.find((s) => s.id === "note");
    const fromWc = c.input === "wildcard";
    const calc = `
      <div class="wcc-block">
        <h3 class="wcc-h">${esc(L.calcTitle)}</h3>
        <table class="wcc-table wcc-calc"><caption class="wcc-sr">${esc(L.calcCaption(fromWc))}</caption><tbody>
          ${c.octetSteps.map((s, i) => `<tr><th scope="row">${esc(octetName(i, lang))}</th><td class="wcc-mono">255 − ${s.from} = <strong>${s.to}</strong></td></tr>`).join("")}
        </tbody></table>
        <ol class="wcc-steps">${all.filter((s) => s.id !== "note").map((s) => `<li data-step="${s.id}">${esc(s.text)}</li>`).join("")}</ol>
      </div>`;
    const top = fromWc ? (c.maskInt ?? (~c.wildcardInt >>> 0)) : /** @type {number} */ (c.maskInt);
    const binary = `
      <div class="wcc-block">
        <h3 class="wcc-h">${esc(L.binary)}</h3>
        ${scrollTable(`<table class="wcc-table wcc-bin"><tbody>
          <tr><th scope="row">${esc(c.contiguous ? L.binRows.mask : L.binRows.inverse)}</th><td class="wcc-mono wcc-bits">${bitsHtml(top, c.wildcardInt)}</td></tr>
          <tr><th scope="row">${esc(L.binRows.wildcard)}</th><td class="wcc-mono wcc-bits">${bitsHtml(c.wildcardInt, c.wildcardInt)}</td></tr>
        </tbody></table>`)}
        <p class="wcc-legend" aria-hidden="true"><span><span class="wcc-swatch wcc-swatch-chk"></span>${esc(L.legendChk)}</span> <span><span class="wcc-swatch wcc-swatch-dc"></span>${esc(L.legendDc)}</span></p>
      </div>`;
    byId("convert-out").innerHTML = (note ? `<p class="wcc-note">${esc(note.text)}</p>` : "") + kvTable(rows) + calc + binary;
    if (o.announce !== false) byId("convert-summary").textContent = L.convSummary(c);
  }

  /** @returns {import("./wildcard.js").EntryAnalysis | null} */
  function currentEntry() {
    const a = analyzeEntry(state.match);
    return a.ok ? a : null;
  }

  /** @param {{ announce?: boolean }} [o] */
  function renderMatch(o = {}) {
    const L = t();
    const lang = state.lang;
    const a = analyzeEntry(state.match);
    if (!a.ok) {
      showFail("match", a);
      if (state.showErr.match) byId("test-out").innerHTML = "";
      return;
    }
    setError("match", null);
    const notes = [
      a.changed && a.form !== "cidr" ? `<p class="wcc-note">${brk(L.changed(a.ios, `${a.address} ${a.wildcard}`))}</p>` : "",
      a.looksLikeMask ? `<p class="wcc-warn">${brk(L.maskLike(a.wildcard, /** @type {string} */ (a.suggestion)))}</p>` : "",
      a.form === "single" ? `<p class="wcc-note">${esc(L.single)}</p>` : "",
    ].join("");
    const rows = /** @type {[string, string, boolean][]} */ ([
      [L.entryRows.ios, a.ios, true],
      [L.entryRows.first, a.first, true],
      [L.entryRows.last, a.last, true],
      [L.entryRows.covered, formatCount(a.count, lang), false],
      [L.entryRows.prefix, a.prefix === null ? L.na : `/${a.prefix} (${a.mask})`, a.prefix !== null],
    ]);
    const octetRows = a.octets.map((x) =>
      `<tr><th scope="row" data-label="${esc(L.cols.octet)}">${x.index + 1}</th><td class="wcc-mono" data-label="${esc(L.cols.address)}">${x.address}</td><td class="wcc-mono" data-label="${esc(L.cols.wildcard)}">${x.wildcard}</td><td data-label="${esc(L.cols.values)}">${esc(describeOctet(x, lang))}</td></tr>`).join("");
    const octetsBlock = `
      <div class="wcc-block">
        <h3 class="wcc-h">${esc(L.octetsTitle)}</h3>
        <p class="wcc-hint">${esc(L.dcText(a.dontCareBits, a.count))}</p>
        ${scrollTable(`<table class="wcc-table wcc-octets"><thead><tr><th scope="col">${esc(L.cols.octet)}</th><th scope="col">${esc(L.cols.address)}</th><th scope="col">${esc(L.cols.wildcard)}</th><th scope="col">${esc(L.cols.values)}</th></tr></thead><tbody>${octetRows}</tbody></table>`)}
      </div>`;
    const sample = !a.contiguous
      ? `<div class="wcc-block"><h3 class="wcc-h">${esc(L.sampleTitle)}</h3><ul class="wcc-sample">${a.sample.map((s) => `<li class="wcc-mono">${brk(s)}</li>`).join("")}</ul>${a.count > a.sample.length ? `<p class="wcc-hint">${esc(L.sampleMore(a.count - a.sample.length))}</p>` : ""}</div>`
      : "";
    byId("match-out").innerHTML = notes + kvTable(rows) + octetsBlock + sample;
    if (o.announce !== false) byId("match-summary").textContent = L.entrySummary(a);
    renderTest();
  }

  /** Rezultatul testului e într-o regiune aria-live proprie, deci nu are rezumat separat. */
  function renderTest() {
    const L = t();
    const lang = state.lang;
    const out = byId("test-out");
    const a = currentEntry();
    if (!a) {
      out.innerHTML = state.showErr.test ? `<p class="wcc-hint">${esc(L.testNeedsEntry)}</p>` : "";
      return;
    }
    const r = testAddress(state.test, a.addressInt, a.wildcardInt);
    if (!r.ok) {
      if (state.showErr.test) {
        setError("test", errorMessage(r.error, lang));
        out.innerHTML = "";
      }
      return;
    }
    setError("test", null);
    const summary = L.testSummary(r.ip, a.ios, r.match, r.firstMismatch);
    out.innerHTML = `
      <p class="wcc-verdict ${r.match ? "wcc-yes" : "wcc-no"}"><span aria-hidden="true">${r.match ? "✓" : "✗"}</span> ${esc(r.match ? L.yes : L.no)}<span class="wcc-sr">: ${esc(summary)}</span></p>
      <ol class="wcc-steps wcc-tests">${r.octets.map((x) => `<li class="${x.ok ? "" : "wcc-bad"}"><strong>${esc(octetName(x.index, lang))}.</strong> ${esc(describeOctetTest(x, lang))}</li>`).join("")}</ol>`;
  }

  /** @param {{ announce?: boolean }} [o] */
  function renderRange(o = {}) {
    const L = t();
    const lang = state.lang;
    const r = planRange(state.range);
    if (!r.ok) return showFail("range", r);
    setError("range", null);
    const one = r.entries.length === 1;
    const rows = /** @type {[string, string, boolean][]} */ ([
      [L.rangeRows.start, r.start, true],
      [L.rangeRows.end, r.end, true],
      [L.rangeRows.count, formatCount(r.count, lang), false],
      one ? [L.rangeRows.wildcard, r.entries[0].wildcard, true] : [L.rangeRows.entries, formatCount(r.entries.length, lang), false],
    ]);
    const list = one ? "" : `
      <div class="wcc-block">
        <h3 class="wcc-h">${esc(L.entriesTitle)}</h3>
        <p class="wcc-hint">${esc(L.entriesNote)}</p>
        ${scrollTable(`<table class="wcc-table wcc-list"><thead><tr><th scope="col">${esc(L.cols.n)}</th><th scope="col">${esc(L.cols.network)}</th><th scope="col">${esc(L.cols.entry)}</th><th scope="col">${esc(L.cols.addrs)}</th></tr></thead><tbody>${r.entries
          .map((e, i) => `<tr><th scope="row" data-label="${esc(L.cols.n)}">${i + 1}</th><td class="wcc-mono" data-label="${esc(L.cols.network)}">${brk(e.cidr)}</td><td class="wcc-mono" data-label="${esc(L.cols.entry)}">${esc(e.acl)}</td><td data-label="${esc(L.cols.addrs)}">${formatCount(e.size, lang)}</td></tr>`)
          .join("")}</tbody></table>`)}
      </div>`;
    const lines = configLines(r.entries);
    const codeBlock = (/** @type {"standard" | "extended" | "ospf"} */ k) => `
      <div class="wcc-code">
        <div class="wcc-code-head">
          <span class="wcc-code-title">${esc(L.code[k])}</span>
          <button type="button" class="wcc-copy" data-copy="${k}" aria-label="${esc(L.copyAria(L.code[k]))}">${esc(L.copy)}</button>
        </div>
        ${L.codeNote[k] ? `<p class="wcc-code-note">${esc(L.codeNote[k])}</p>` : ""}
        <pre class="wcc-pre" id="${id(`code-${k}`)}">${lines[k].map((x) => `<span class="wcc-line">${codeLine(x)}</span>`).join("\n")}</pre>
      </div>`;
    const hasHost = r.entries.some((e) => e.kind === "host");
    const hasAny = r.entries.some((e) => e.kind === "any");
    const notes = [L.notes.numbers, L.notes.deny, hasHost ? L.notes.host : "", hasAny ? L.notes.any : "", L.notes.ospf].filter(Boolean);
    byId("range-out").innerHTML =
      (r.normalized ? `<p class="wcc-note">${brk(L.normalized(/** @type {string} */ (r.network)))}</p>` : "") +
      kvTable(rows) + list +
      `<div class="wcc-block"><h3 class="wcc-h">${esc(L.linesTitle)}</h3><div class="wcc-codes">${codeBlock("standard")}${codeBlock("extended")}${codeBlock("ospf")}</div>
        <ul class="wcc-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`;
    if (o.announce !== false) byId("range-summary").textContent = L.rangeSummary(r);
  }

  const RENDER = { convert: renderConvert, match: renderMatch, range: renderRange };

  // ───────── copiere ─────────

  /** @param {"standard" | "extended" | "ospf"} k @param {HTMLButtonElement} btn */
  async function copy(k, btn) {
    const L = t();
    const pre = byId(`code-${k}`);
    const text = copyClean(Array.from(pre.querySelectorAll(".wcc-line")).map((x) => x.textContent ?? "").join("\n"));
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    const status = byId("status");
    if (ok) {
      btn.textContent = `✓ ${L.copied}`;
      status.textContent = L.copiedLive(L.code[k]);
      setTimeout(() => {
        if (btn.isConnected) btn.textContent = t().copy;
      }, 2000);
    } else {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(pre);
      sel?.removeAllRanges();
      sel?.addRange(range);
      status.textContent = L.copyFail;
    }
  }

  // ───────── evenimente ─────────

  /** @type {Record<string, ReturnType<typeof setTimeout> | undefined>} */
  const timers = {};
  /** Rezultatul se actualizează imediat; cititorul de ecran îl aude doar după o pauză în tastare. @param {Tab} k */
  function live(k) {
    RENDER[k]({ announce: false });
    clearTimeout(timers[k]);
    timers[k] = setTimeout(() => RENDER[k](), 800);
  }

  /** @param {Event} e */
  function onInput(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === id("test-in")) {
      state.test = el.value;
      renderTest();
      return;
    }
    for (const k of TABS) {
      if (el.id === id(`${k}-in`)) {
        state[k] = el.value;
        live(k);
      }
    }
  }

  /** @param {SubmitEvent} e */
  function onSubmit(e) {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const which = /** @type {"convert" | "match" | "range" | "test"} */ (form.dataset.form);
    state.showErr[which] = true;
    if (which === "test") renderTest();
    else {
      clearTimeout(timers[which]);
      RENDER[which]();
    }
    const bad = /** @type {HTMLElement | null} */ (form.querySelector('[aria-invalid="true"]'));
    bad?.focus();
  }

  /** @param {MouseEvent} e */
  function onClick(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const tab = /** @type {HTMLElement | null} */ (target.closest("[data-tab]"));
    if (tab) return selectTab(/** @type {Tab} */ (tab.dataset.tab), false);
    const ex = /** @type {HTMLElement | null} */ (target.closest("[data-example]"));
    if (ex) {
      const k = /** @type {Tab} */ (ex.dataset.for);
      state[k] = /** @type {string} */ (ex.dataset.example);
      /** @type {HTMLInputElement} */ (byId(`${k}-in`)).value = state[k];
      state.showErr[k] = true;
      clearTimeout(timers[k]);
      RENDER[k]();
      return;
    }
    const cp = /** @type {HTMLButtonElement | null} */ (target.closest("[data-copy]"));
    if (cp) copy(/** @type {any} */ (cp.dataset.copy), cp);
  }

  /** Taste pentru tab-uri (model WAI-ARIA): săgeți, Home, End. @param {KeyboardEvent} e */
  function onKeydown(e) {
    const tab = /** @type {HTMLElement} */ (e.target).closest?.("[role=tab]");
    if (!tab) return;
    const i = TABS.indexOf(/** @type {any} */ (/** @type {HTMLElement} */ (tab).dataset.tab));
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    selectTab(TABS[next], true);
  }

  /** @param {Tab} k @param {boolean} focus */
  function selectTab(k, focus) {
    state.tab = k;
    for (const name of TABS) {
      const b = byId(`tab-${name}`);
      const on = name === k;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      byId(`panel-${name}`).hidden = !on;
    }
    if (focus) byId(`tab-${k}`).focus();
  }

  function build() {
    root.classList.add("wcc");
    root.innerHTML = shell();
    renderConvert({ announce: false });
    renderMatch({ announce: false });
    renderRange({ announce: false });
  }

  root.addEventListener("input", onInput);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  build();

  return {
    /** Schimbă limba păstrând ce a scris utilizatorul. @param {Lang} lang */
    setLang(lang) {
      if (lang !== "ro" && lang !== "en") return;
      const focusedId = /** @type {HTMLElement | null} */ (document.activeElement)?.id;
      state.lang = lang;
      build();
      if (focusedId && root.querySelector(`#${CSS.escape(focusedId)}`)) /** @type {HTMLElement} */ (root.querySelector(`#${CSS.escape(focusedId)}`)).focus();
    },
    /** @returns {Lang} */
    get lang() {
      return state.lang;
    },
    /** Arată o filă. @param {Tab} k */
    showTab(k) {
      if (TABS.includes(k)) selectTab(k, false);
    },
    destroy() {
      for (const k of Object.keys(timers)) clearTimeout(timers[k]);
      root.removeEventListener("input", onInput);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
      root.innerHTML = "";
      root.classList.remove("wcc");
    },
  };
}
