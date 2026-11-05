// Interfața calculatorului de subnetting (fără framework). Toată matematica e în subnet.js.
//
// Folosire:
//   import { mountSubnetCalculator } from "./ui.js";
//   const calc = mountSubnetCalculator(document.getElementById("subnet-tool"), { lang: "ro" });
//   calc.setLang("en");
//
// Componenta construiește singură tot HTML-ul în elementul primit. Stilurile folosesc clase cu prefixul `snc-`
// (vezi demo.html); pagina gazdă le poate copia în style.css.

import { analyze, steps, split, vlsm, parseInput, errorMessage, formatCount, plural, FORMS } from "./subnet.js";

/** @typedef {import("./subnet.js").Lang} Lang */

const T = {
  ro: {
    tabs: { analyze: "Analiză", split: "Subrețele egale", vlsm: "VLSM" },
    tablist: "Modul calculatorului",
    ipLabel: "Adresă IP și mască",
    ipHint: "De exemplu 192.168.10.77/26 sau 192.168.10.77 255.255.255.192",
    calc: "Calculează",
    examples: "Exemple:",
    exampleAria: (/** @type {string} */ x) => `Încarcă exemplul ${x}`,
    results: "Rezultat",
    rows: {
      network: "Adresa de rețea", broadcast: "Adresa de broadcast", first: "Primul host", last: "Ultimul host",
      usable: "Host-uri utilizabile", total: "Total adrese", mask: "Masca", wildcard: "Masca wildcard",
      block: "Mărimea blocului", cls: "Clasa (informativ)", type: "Tipul adresei", role: "Adresa introdusă",
    },
    noBroadcast31: "nu există (/31, RFC 3021)",
    noBroadcast32: "nu există (/32, un singur host)",
    blockValue: (/** @type {number} */ s, /** @type {string} */ o) => `${s}, în ${o} octet`,
    octetOrd: ["primul", "al doilea", "al treilea", "al patrulea"],
    classValue: (/** @type {string} */ c, /** @type {number|null} */ d) => (d ? `${c} (implicit /${d})` : `${c}`),
    role: { network: "este adresa de rețea", broadcast: "este adresa de broadcast", host: "poate fi dată unui host" },
    binary: "În binar",
    binaryCaption: (/** @type {number} */ n, /** @type {number} */ h) => {
      const net = n === 0 ? "Nu există biți de rețea" : n === 1 ? "Primul bit este partea de rețea" : `Primii ${plural(n, "ro", FORMS.BITS)} sunt partea de rețea`;
      const host = h === 0 ? "nu există biți de host" : h === 1 ? "ultimul bit este partea de host" : `ultimii ${plural(h, "ro", FORMS.BITS)} sunt partea de host`;
      return `${net}, ${host}.`;
    },
    binRows: { ip: "Adresa", mask: "Masca", network: "Rețeaua", broadcast: "Broadcast", last: "Ultima adresă" },
    legendNet: "biți de rețea",
    legendHost: "biți de host",
    stepsTitle: "Pas cu pas (metoda blocului)",
    summary: (/** @type {import("./subnet.js").Analysis} */ a) =>
      `${a.ip}/${a.prefix}: rețeaua ${a.network}, ${a.hasBroadcast ? `broadcast ${a.broadcast}, ` : ""}host-uri de la ${a.firstHost} la ${a.lastHost}, ${plural(a.usableHosts, "ro", FORMS.HOSTS)} utilizabile.`.replace("1 host utilizabile", "1 host utilizabil"),
    splitNet: "Rețeaua de împărțit",
    splitNetHint: "De exemplu 192.168.1.0/24",
    splitBy: "Împart după",
    bySubnets: "numărul de subrețele",
    byHosts: "host-uri pe subrețea",
    countSubnets: "Câte subrețele?",
    countHosts: "Câte host-uri în fiecare?",
    splitBtn: "Împarte",
    splitSummary: (/** @type {any} */ r) =>
      `${plural(r.subnetCount, "ro", FORMS.SUBNETS)} /${r.newPrefix} (${r.newMask}), cu câte ${plural(r.hostsPerSubnet, "ro", FORMS.HOSTS)} utilizabile. Biți împrumutați: ${r.borrowedBits}.`.replace("1 host utilizabile", "1 host utilizabil").replace(/^1 subrețea \/(\d+) \(([\d.]+)\), cu câte/, "O singură subrețea /$1 ($2), cu"),
    normalized: (/** @type {string} */ c) => `Am folosit rețeaua ${c} (adresa avea biți de host setați).`,
    truncated: (/** @type {number} */ n, /** @type {number} */ total) => `Se afișează primele ${formatCount(n, "ro")} din ${formatCount(total, "ro")} subrețele, plus ultima.`,
    cols: { n: "Nr.", network: "Rețea", first: "Primul host", last: "Ultimul host", broadcast: "Broadcast", name: "Nume", wanted: "Host-uri cerute", mask: "Masca", avail: "Host-uri disponibile" },
    vlsmNet: "Rețeaua disponibilă",
    vlsmReqs: "Rețelele de care ai nevoie",
    vlsmName: (/** @type {number} */ i) => `Numele rețelei ${i}`,
    vlsmHosts: (/** @type {number} */ i) => `Host-uri pentru rețeaua ${i}`,
    namePh: "Nume",
    hostsPh: "Host-uri",
    addRow: "Adaugă o rețea",
    removeRow: (/** @type {number} */ i) => `Șterge rețeaua ${i}`,
    vlsmBtn: "Calculează VLSM",
    vlsmNote: "Rețelele se alocă de la cea mai mare la cea mai mică.",
    vlsmSummary: (/** @type {any} */ r) => `Folosite ${formatCount(r.usedAddresses, "ro")} din ${plural(r.totalAddresses, "ro", FORMS.ADDRS)}; libere ${formatCount(r.unusedAddresses, "ro")}.`,
    free: "Spațiu liber:",
    noFree: "Nu a rămas spațiu liber.",
    defaultRows: [["Vânzări", 50], ["Birouri", 20], ["Legătură WAN", 2]],
    scrollTable: "Tabel (se poate derula pe orizontală)",
  },
  en: {
    tabs: { analyze: "Analyse", split: "Equal subnets", vlsm: "VLSM" },
    tablist: "Calculator mode",
    ipLabel: "IP address and mask",
    ipHint: "For example 192.168.10.77/26 or 192.168.10.77 255.255.255.192",
    calc: "Calculate",
    examples: "Examples:",
    exampleAria: (/** @type {string} */ x) => `Load example ${x}`,
    results: "Result",
    rows: {
      network: "Network address", broadcast: "Broadcast address", first: "First host", last: "Last host",
      usable: "Usable hosts", total: "Total addresses", mask: "Subnet mask", wildcard: "Wildcard mask",
      block: "Block size", cls: "Class (informative)", type: "Address type", role: "Entered address",
    },
    noBroadcast31: "none (/31, RFC 3021)",
    noBroadcast32: "none (/32, single host)",
    blockValue: (/** @type {number} */ s, /** @type {string} */ o) => `${s}, in the ${o} octet`,
    octetOrd: ["first", "second", "third", "fourth"],
    classValue: (/** @type {string} */ c, /** @type {number|null} */ d) => (d ? `${c} (default /${d})` : `${c}`),
    role: { network: "is the network address", broadcast: "is the broadcast address", host: "can be assigned to a host" },
    binary: "In binary",
    binaryCaption: (/** @type {number} */ n, /** @type {number} */ h) => {
      const net = n === 0 ? "There are no network bits" : n === 1 ? "The first bit is the network part" : `The first ${plural(n, "en", FORMS.BITS)} are the network part`;
      const host = h === 0 ? "there are no host bits" : h === 1 ? "the last bit is the host part" : `the last ${plural(h, "en", FORMS.BITS)} are the host part`;
      return `${net}, ${host}.`;
    },
    binRows: { ip: "Address", mask: "Mask", network: "Network", broadcast: "Broadcast", last: "Last address" },
    legendNet: "network bits",
    legendHost: "host bits",
    stepsTitle: "Step by step (block size method)",
    summary: (/** @type {import("./subnet.js").Analysis} */ a) =>
      `${a.ip}/${a.prefix}: network ${a.network}, ${a.hasBroadcast ? `broadcast ${a.broadcast}, ` : ""}hosts ${a.firstHost} to ${a.lastHost}, ${plural(a.usableHosts, "en", FORMS.HOSTS)} usable.`,
    splitNet: "Network to split",
    splitNetHint: "For example 192.168.1.0/24",
    splitBy: "Split by",
    bySubnets: "number of subnets",
    byHosts: "hosts per subnet",
    countSubnets: "How many subnets?",
    countHosts: "How many hosts in each?",
    splitBtn: "Split",
    splitSummary: (/** @type {any} */ r) =>
      `${plural(r.subnetCount, "en", FORMS.SUBNETS)} /${r.newPrefix} (${r.newMask}), ${plural(r.hostsPerSubnet, "en", FORMS.HOSTS)} usable in each. Borrowed bits: ${r.borrowedBits}.`,
    normalized: (/** @type {string} */ c) => `Used the network ${c} (the address had host bits set).`,
    truncated: (/** @type {number} */ n, /** @type {number} */ total) => `Showing the first ${formatCount(n, "en")} of ${formatCount(total, "en")} subnets, plus the last one.`,
    cols: { n: "#", network: "Network", first: "First host", last: "Last host", broadcast: "Broadcast", name: "Name", wanted: "Hosts needed", mask: "Mask", avail: "Hosts available" },
    vlsmNet: "Available network",
    vlsmReqs: "The networks you need",
    vlsmName: (/** @type {number} */ i) => `Name of network ${i}`,
    vlsmHosts: (/** @type {number} */ i) => `Hosts for network ${i}`,
    namePh: "Name",
    hostsPh: "Hosts",
    addRow: "Add a network",
    removeRow: (/** @type {number} */ i) => `Remove network ${i}`,
    vlsmBtn: "Calculate VLSM",
    vlsmNote: "Networks are allocated from the largest to the smallest.",
    vlsmSummary: (/** @type {any} */ r) => `Used ${formatCount(r.usedAddresses, "en")} of ${plural(r.totalAddresses, "en", FORMS.ADDRS)}; ${formatCount(r.unusedAddresses, "en")} free.`,
    free: "Free space:",
    noFree: "No free space left.",
    defaultRows: [["Sales", 50], ["Offices", 20], ["WAN link", 2]],
    scrollTable: "Table (scrolls horizontally)",
  },
};

const EXAMPLES = ["192.168.10.77/26", "172.16.37.9 255.255.240.0", "10.0.0.1/8", "10.1.1.1/31"];
const TABS = /** @type {const} */ (["analyze", "split", "vlsm"]);

let instances = 0;

/** @param {unknown} s */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => /** @type {Record<string,string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** Ca esc, dar permite ruperea rândului doar după „.” și „/” (adresele nu se rup în mijlocul unui număr). @param {unknown} s */
const brk = (s) => esc(s).replace(/([./])/g, "$1<wbr>");

/**
 * @param {HTMLElement} root
 * @param {{ lang?: Lang, initial?: string, tab?: "analyze" | "split" | "vlsm" }} [options]
 */
export function mountSubnetCalculator(root, options = {}) {
  const uid = `snc${++instances}`;
  const id = (/** @type {string} */ name) => `${uid}-${name}`;

  const state = {
    /** @type {Lang} */ lang: options.lang === "en" ? "en" : "ro",
    /** @type {"analyze" | "split" | "vlsm"} */ tab: options.tab ?? "analyze",
    ip: options.initial ?? "192.168.10.77/26",
    splitNet: "192.168.1.0/24",
    /** @type {"subnets" | "hosts"} */ splitMode: "subnets",
    splitValue: "4",
    vlsmNet: "192.168.1.0/24",
    /** @type {{ name: string, hosts: string }[] | null} */ vlsmRows: null,
    showErr: { analyze: false, split: false, vlsm: false },
  };
  const t = () => T[state.lang];
  const rows = () => state.vlsmRows ?? t().defaultRows.map(([n, h]) => ({ name: String(n), hosts: String(h) }));

  /** @param {string} sel */
  const $ = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));

  // ───────── construirea DOM-ului ─────────

  function shell() {
    const L = t();
    const tabBtn = (/** @type {typeof TABS[number]} */ k) =>
      `<button type="button" role="tab" class="snc-tab" id="${id(`tab-${k}`)}" aria-controls="${id(`panel-${k}`)}" aria-selected="${state.tab === k}" tabindex="${state.tab === k ? 0 : -1}" data-tab="${k}">${esc(L.tabs[k])}</button>`;
    const panel = (/** @type {typeof TABS[number]} */ k, /** @type {string} */ body) =>
      `<section role="tabpanel" class="snc-panel" id="${id(`panel-${k}`)}" aria-labelledby="${id(`tab-${k}`)}" ${state.tab === k ? "" : "hidden"} tabindex="0">${body}</section>`;

    const analyzeBody = `
      <form class="snc-form" data-form="analyze" novalidate>
        <label class="snc-label" for="${id("ip")}">${esc(L.ipLabel)}</label>
        <div class="snc-inputrow">
          <input class="snc-input snc-mono" id="${id("ip")}" name="ip" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
            value="${esc(state.ip)}" aria-describedby="${id("ip-hint")} ${id("ip-err")}">
          <button class="snc-btn" type="submit">${esc(L.calc)}</button>
        </div>
        <p class="snc-hint" id="${id("ip-hint")}">${esc(L.ipHint)}</p>
        <p class="snc-error" id="${id("ip-err")}" hidden></p>
        <div class="snc-examples"><span class="snc-examples-label">${esc(L.examples)}</span>
          ${EXAMPLES.map((x) => `<button type="button" class="snc-chip snc-mono" data-example="${esc(x)}" aria-label="${esc(L.exampleAria(x))}">${esc(x)}</button>`).join("")}
        </div>
      </form>
      <p class="snc-summary" id="${id("summary")}" aria-live="polite" aria-atomic="true"></p>
      <div id="${id("analyze-out")}"></div>`;

    const splitBody = `
      <form class="snc-form" data-form="split" novalidate>
        <label class="snc-label" for="${id("split-net")}">${esc(L.splitNet)}</label>
        <input class="snc-input snc-mono" id="${id("split-net")}" name="net" type="text" autocomplete="off" spellcheck="false"
          value="${esc(state.splitNet)}" aria-describedby="${id("split-hint")} ${id("split-err")}">
        <p class="snc-hint" id="${id("split-hint")}">${esc(L.splitNetHint)}</p>
        <fieldset class="snc-fieldset">
          <legend class="snc-label">${esc(L.splitBy)}</legend>
          <label class="snc-radio"><input type="radio" name="mode" value="subnets" ${state.splitMode === "subnets" ? "checked" : ""}> ${esc(L.bySubnets)}</label>
          <label class="snc-radio"><input type="radio" name="mode" value="hosts" ${state.splitMode === "hosts" ? "checked" : ""}> ${esc(L.byHosts)}</label>
        </fieldset>
        <label class="snc-label" for="${id("split-n")}" id="${id("split-n-label")}">${esc(state.splitMode === "subnets" ? L.countSubnets : L.countHosts)}</label>
        <div class="snc-inputrow">
          <input class="snc-input snc-num" id="${id("split-n")}" name="n" type="number" min="1" step="1" inputmode="numeric" value="${esc(state.splitValue)}" aria-describedby="${id("split-err")}">
          <button class="snc-btn" type="submit">${esc(L.splitBtn)}</button>
        </div>
        <p class="snc-error" id="${id("split-err")}" hidden></p>
      </form>
      <p class="snc-summary" id="${id("split-summary")}" aria-live="polite" aria-atomic="true"></p>
      <div id="${id("split-out")}"></div>`;

    const vlsmBody = `
      <form class="snc-form" data-form="vlsm" novalidate>
        <label class="snc-label" for="${id("vlsm-net")}">${esc(L.vlsmNet)}</label>
        <input class="snc-input snc-mono" id="${id("vlsm-net")}" name="net" type="text" autocomplete="off" spellcheck="false"
          value="${esc(state.vlsmNet)}" aria-describedby="${id("vlsm-err")}">
        <fieldset class="snc-fieldset">
          <legend class="snc-label">${esc(L.vlsmReqs)}</legend>
          <p class="snc-hint">${esc(L.vlsmNote)}</p>
          <div class="snc-vlsm-rows" id="${id("vlsm-rows")}">${vlsmRowsHtml()}</div>
          <button type="button" class="snc-btn snc-btn-ghost" data-action="add-row">+ ${esc(L.addRow)}</button>
        </fieldset>
        <button class="snc-btn" type="submit">${esc(L.vlsmBtn)}</button>
        <p class="snc-error" id="${id("vlsm-err")}" hidden></p>
      </form>
      <p class="snc-summary" id="${id("vlsm-summary")}" aria-live="polite" aria-atomic="true"></p>
      <div id="${id("vlsm-out")}"></div>`;

    return `
      <div class="snc-tabs" role="tablist" aria-label="${esc(L.tablist)}">${TABS.map(tabBtn).join("")}</div>
      ${panel("analyze", analyzeBody)}
      ${panel("split", splitBody)}
      ${panel("vlsm", vlsmBody)}`;
  }

  function vlsmRowsHtml() {
    const L = t();
    const list = rows();
    return list.map((r, i) => `
      <div class="snc-vlsm-row" data-row="${i}">
        <input class="snc-input" type="text" name="name" value="${esc(r.name)}" placeholder="${esc(L.namePh)}" aria-label="${esc(L.vlsmName(i + 1))}" autocomplete="off">
        <input class="snc-input snc-num" type="number" name="hosts" min="1" step="1" inputmode="numeric" value="${esc(r.hosts)}" placeholder="${esc(L.hostsPh)}" aria-label="${esc(L.vlsmHosts(i + 1))}">
        <button type="button" class="snc-icon-btn" data-action="remove-row" data-index="${i}" aria-label="${esc(L.removeRow(i + 1))}" ${list.length === 1 ? "disabled" : ""}>×</button>
      </div>`).join("");
  }

  // ───────── rezultate ─────────

  /** @param {string} html */
  const scrollTable = (html) => `<div class="snc-scroll" role="region" tabindex="0" aria-label="${esc(t().scrollTable)}">${html}</div>`;

  /**
   * @param {"ip-err" | "split-err" | "vlsm-err"} errId
   * @param {HTMLInputElement | null} input
   * @param {string | null} msg
   */
  function setError(errId, input, msg) {
    const el = $(`#${id(errId)}`);
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
      el.setAttribute("role", "alert");
      input?.setAttribute("aria-invalid", "true");
    } else {
      el.textContent = "";
      el.hidden = true;
      el.removeAttribute("role");
      input?.removeAttribute("aria-invalid");
    }
  }

  /** @param {{ announce?: boolean }} [o] */
  function renderAnalyze(o = {}) {
    const L = t();
    const lang = state.lang;
    const input = /** @type {HTMLInputElement} */ ($(`#${id("ip")}`));
    const r = parseInput(state.ip);
    if (!r.ok) {
      setError("ip-err", input, state.showErr.analyze ? errorMessage(r.error, lang) : null);
      return;
    }
    setError("ip-err", input, null);
    const a = analyze(r.ip, r.prefix);
    const ord = L.octetOrd[a.block.octet - 1];
    const bc = a.hasBroadcast ? a.broadcast : `— ${a.kind === "point-to-point" ? L.noBroadcast31 : L.noBroadcast32}`;
    const tableRows = [
      [L.rows.network, `${a.network}/${a.prefix}`, true],
      [L.rows.broadcast, bc, a.hasBroadcast],
      [L.rows.first, a.firstHost, true],
      [L.rows.last, a.lastHost, true],
      [L.rows.usable, formatCount(a.usableHosts, lang), false],
      [L.rows.total, formatCount(a.totalAddresses, lang), false],
      [L.rows.mask, `${a.mask} (/${a.prefix})`, true],
      [L.rows.wildcard, a.wildcard, true],
      [L.rows.block, L.blockValue(a.block.size, ord), false],
      [L.rows.cls, L.classValue(a.addressClass.letter, a.addressClass.defaultPrefix), false],
      [L.rows.type, a.range.label[lang], false],
      [L.rows.role, `${a.ip} ${L.role[a.ipRole]}`, false],
    ];
    const resultTable = `<table class="snc-table snc-kv"><caption class="snc-h">${esc(L.results)}</caption><tbody>${tableRows
      .map(([k, v, mono]) => `<tr><th scope="row">${esc(k)}</th><td${mono ? ' class="snc-mono"' : ""}${k === L.rows.usable ? ' data-key="usable"' : ""}>${brk(v)}</td></tr>`)
      .join("")}</tbody></table>`;

    const binRow = (/** @type {string} */ label, /** @type {string} */ bits) => {
      const i = a.binary.boundaryIndex;
      const net = bits.slice(0, i);
      const host = bits.slice(i);
      return `<tr><th scope="row">${esc(label)}</th><td class="snc-mono snc-bits"><span class="snc-net">${net}</span>${host ? `<span class="snc-host">${host}</span>` : ""}</td></tr>`;
    };
    const binary = `
      <div class="snc-block">
        <h3 class="snc-h">${esc(L.binary)}</h3>
        <p class="snc-hint">${esc(L.binaryCaption(a.prefix, a.hostBits))}</p>
        ${scrollTable(`<table class="snc-table snc-bin"><tbody>
          ${binRow(L.binRows.ip, a.binary.ip)}
          ${binRow(L.binRows.mask, a.binary.mask)}
          ${binRow(L.binRows.network, a.binary.network)}
          ${binRow(a.hasBroadcast ? L.binRows.broadcast : L.binRows.last, a.binary.broadcast)}
        </tbody></table>`)}
        <p class="snc-legend" aria-hidden="true"><span class="snc-swatch snc-swatch-net"></span>${esc(L.legendNet)} (${a.prefix}) <span class="snc-swatch snc-swatch-host"></span>${esc(L.legendHost)} (${a.hostBits})</p>
      </div>`;

    const stepList = `
      <div class="snc-block">
        <h3 class="snc-h">${esc(L.stepsTitle)}</h3>
        <ol class="snc-steps">${steps(r.ip, r.prefix, lang).map((s) => `<li data-step="${s.id}"><strong>${esc(s.title)}.</strong> ${esc(s.text)}</li>`).join("")}</ol>
      </div>`;

    $(`#${id("analyze-out")}`).innerHTML = resultTable + binary + stepList;
    if (o.announce !== false) $(`#${id("summary")}`).textContent = L.summary(a);
  }

  /** @param {{ announce?: boolean }} [o] */
  function renderSplit(o = {}) {
    const L = t();
    const lang = state.lang;
    const out = $(`#${id("split-out")}`);
    const netInput = /** @type {HTMLInputElement} */ ($(`#${id("split-net")}`));
    const n = Number(state.splitValue);
    let r;
    try {
      r = split(state.splitNet, state.splitMode === "subnets" ? { subnets: n } : { hostsPerSubnet: n });
    } catch (e) {
      if (state.showErr.split) {
        setError("split-err", netInput, errorMessage(/** @type {any} */ (e), lang));
        out.innerHTML = "";
        $(`#${id("split-summary")}`).textContent = "";
      }
      return;
    }
    setError("split-err", netInput, null);
    const row = (/** @type {import("./subnet.js").SubnetRow} */ s) =>
      `<tr><th scope="row" data-label="${esc(L.cols.n)}">${formatCount(s.index, lang)}</th><td class="snc-mono" data-label="${esc(L.cols.network)}">${s.cidr}</td><td class="snc-mono" data-label="${esc(L.cols.first)}">${s.firstHost}</td><td class="snc-mono" data-label="${esc(L.cols.last)}">${s.lastHost}</td><td class="snc-mono" data-label="${esc(L.cols.broadcast)}">${s.broadcast}</td></tr>`;
    const notes = [
      r.normalized ? `<p class="snc-hint">${esc(L.normalized(r.cidr))}</p>` : "",
      r.truncated ? `<p class="snc-hint">${esc(L.truncated(r.subnets.length, r.subnetCount))}</p>` : "",
    ].join("");
    out.innerHTML = notes + scrollTable(`<table class="snc-table snc-list"><thead><tr>
        <th scope="col">${esc(L.cols.n)}</th><th scope="col">${esc(L.cols.network)}</th><th scope="col">${esc(L.cols.first)}</th><th scope="col">${esc(L.cols.last)}</th><th scope="col">${esc(L.cols.broadcast)}</th>
      </tr></thead><tbody>${r.subnets.map(row).join("")}${r.lastSubnet ? `<tr class="snc-gap"><td colspan="5">…</td></tr>${row(r.lastSubnet)}` : ""}</tbody></table>`);
    if (o.announce !== false) $(`#${id("split-summary")}`).textContent = L.splitSummary(r);
  }

  /** @param {{ announce?: boolean }} [o] */
  function renderVlsm(o = {}) {
    const L = t();
    const lang = state.lang;
    const out = $(`#${id("vlsm-out")}`);
    const netInput = /** @type {HTMLInputElement} */ ($(`#${id("vlsm-net")}`));
    const reqs = rows().map((x) => ({ name: x.name, hosts: x.hosts.trim() === "" ? NaN : Number(x.hosts) }));
    let r;
    try {
      r = vlsm(state.vlsmNet, reqs);
    } catch (e) {
      if (state.showErr.vlsm) {
        setError("vlsm-err", netInput, errorMessage(/** @type {any} */ (e), lang));
        out.innerHTML = "";
        $(`#${id("vlsm-summary")}`).textContent = "";
      }
      return;
    }
    setError("vlsm-err", netInput, null);
    const body = r.allocations.map((x) => `<tr><th scope="row" data-label="${esc(L.cols.name)}">${esc(x.name)}</th><td data-label="${esc(L.cols.wanted)}">${formatCount(x.hostsRequested, lang)}</td><td class="snc-mono" data-label="${esc(L.cols.network)}">${x.cidr}</td><td class="snc-mono" data-label="${esc(L.cols.mask)}">${x.mask}</td><td class="snc-mono" data-label="${esc(L.cols.first)}">${x.firstHost}</td><td class="snc-mono" data-label="${esc(L.cols.last)}">${x.lastHost}</td><td class="snc-mono" data-label="${esc(L.cols.broadcast)}">${x.broadcast}</td><td data-label="${esc(L.cols.avail)}">${formatCount(x.usableHosts, lang)}</td></tr>`).join("");
    const free = r.unused.length
      ? `<p class="snc-free"><strong>${esc(L.free)}</strong> <span class="snc-mono">${r.unused.map((u) => u.cidr).join(", ")}</span></p>`
      : `<p class="snc-free">${esc(L.noFree)}</p>`;
    out.innerHTML = (r.normalized ? `<p class="snc-hint">${esc(L.normalized(r.cidr))}</p>` : "") +
      scrollTable(`<table class="snc-table snc-list"><thead><tr>
        <th scope="col">${esc(L.cols.name)}</th><th scope="col">${esc(L.cols.wanted)}</th><th scope="col">${esc(L.cols.network)}</th><th scope="col">${esc(L.cols.mask)}</th>
        <th scope="col">${esc(L.cols.first)}</th><th scope="col">${esc(L.cols.last)}</th><th scope="col">${esc(L.cols.broadcast)}</th><th scope="col">${esc(L.cols.avail)}</th>
      </tr></thead><tbody>${body}</tbody></table>`) + free;
    if (o.announce !== false) $(`#${id("vlsm-summary")}`).textContent = L.vlsmSummary(r);
  }

  // ───────── evenimente ─────────

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let announceTimer;
  /** Actualizează rezultatul imediat, dar anunță cititorului de ecran doar după o pauză în tastare. */
  function liveAnalyze() {
    renderAnalyze({ announce: false });
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const r = parseInput(state.ip);
      if (r.ok) $(`#${id("summary")}`).textContent = t().summary(analyze(r.ip, r.prefix));
    }, 800);
  }

  /** @param {Event} e */
  function onInput(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === id("ip")) {
      state.ip = el.value;
      liveAnalyze();
    } else if (el.id === id("split-net")) {
      state.splitNet = el.value;
      renderSplit({ announce: false });
    } else if (el.id === id("split-n")) {
      state.splitValue = el.value;
      renderSplit({ announce: false });
    } else if (el.id === id("vlsm-net")) {
      state.vlsmNet = el.value;
      renderVlsm({ announce: false });
    } else if (el.closest(".snc-vlsm-row")) {
      const i = Number(/** @type {HTMLElement} */ (el.closest(".snc-vlsm-row")).dataset.row);
      const list = rows().map((x) => ({ ...x }));
      list[i] = { ...list[i], [el.name === "hosts" ? "hosts" : "name"]: el.value };
      state.vlsmRows = list;
      renderVlsm({ announce: false });
    }
  }

  /** @param {Event} e */
  function onChange(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.name === "mode" && el.type === "radio") {
      state.splitMode = el.value === "hosts" ? "hosts" : "subnets";
      $(`#${id("split-n-label")}`).textContent = state.splitMode === "subnets" ? t().countSubnets : t().countHosts;
      renderSplit();
    }
  }

  /** @param {SubmitEvent} e */
  function onSubmit(e) {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const which = /** @type {"analyze" | "split" | "vlsm"} */ (form.dataset.form);
    state.showErr[which] = true;
    clearTimeout(announceTimer);
    if (which === "analyze") renderAnalyze();
    else if (which === "split") renderSplit();
    else renderVlsm();
    // la eroare, focusul merge pe câmpul cu problema
    const bad = /** @type {HTMLElement | null} */ (form.querySelector('[aria-invalid="true"]'));
    bad?.focus();
  }

  /** @param {MouseEvent} e */
  function onClick(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const tab = /** @type {HTMLElement | null} */ (target.closest("[data-tab]"));
    if (tab) return selectTab(/** @type {any} */ (tab.dataset.tab), false);
    const ex = /** @type {HTMLElement | null} */ (target.closest("[data-example]"));
    if (ex) {
      state.ip = /** @type {string} */ (ex.dataset.example);
      const input = /** @type {HTMLInputElement} */ ($(`#${id("ip")}`));
      input.value = state.ip;
      state.showErr.analyze = true;
      renderAnalyze();
      return;
    }
    const action = target.closest("[data-action]")?.getAttribute("data-action");
    if (action === "add-row") {
      state.vlsmRows = [...rows(), { name: "", hosts: "" }];
      $(`#${id("vlsm-rows")}`).innerHTML = vlsmRowsHtml();
      /** @type {HTMLInputElement} */ (root.querySelector(`.snc-vlsm-row[data-row="${state.vlsmRows.length - 1}"] input`)).focus();
    } else if (action === "remove-row") {
      const i = Number(/** @type {HTMLElement} */ (target.closest("[data-action]")).dataset.index);
      const list = rows().filter((_, k) => k !== i);
      if (!list.length) return;
      state.vlsmRows = list;
      $(`#${id("vlsm-rows")}`).innerHTML = vlsmRowsHtml();
      const next = root.querySelector(`.snc-vlsm-row[data-row="${Math.min(i, list.length - 1)}"] input`);
      /** @type {HTMLElement | null} */ (next)?.focus();
      renderVlsm();
    }
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

  /**
   * @param {"analyze" | "split" | "vlsm"} k
   * @param {boolean} focus
   */
  function selectTab(k, focus) {
    state.tab = k;
    for (const name of TABS) {
      const b = $(`#${id(`tab-${name}`)}`);
      const on = name === k;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      $(`#${id(`panel-${name}`)}`).hidden = !on;
    }
    if (focus) $(`#${id(`tab-${k}`)}`).focus();
  }

  function build() {
    root.classList.add("snc");
    root.innerHTML = shell();
    renderAnalyze({ announce: false });
    renderSplit({ announce: false });
    renderVlsm({ announce: false });
  }

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  build();

  return {
    /** Schimbă limba păstrând ce a scris utilizatorul. @param {Lang} lang */
    setLang(lang) {
      if (lang !== "ro" && lang !== "en") return;
      // rândurile VLSM implicite (nemodificate) se traduc; cele scrise de utilizator rămân
      const focusedId = /** @type {HTMLElement | null} */ (document.activeElement)?.id;
      state.lang = lang;
      build();
      if (focusedId && root.querySelector(`#${CSS.escape(focusedId)}`)) /** @type {HTMLElement} */ (root.querySelector(`#${CSS.escape(focusedId)}`)).focus();
    },
    /** @returns {Lang} */
    get lang() {
      return state.lang;
    },
    destroy() {
      clearTimeout(announceTimer);
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
      root.innerHTML = "";
      root.classList.remove("snc");
    },
  };
}
