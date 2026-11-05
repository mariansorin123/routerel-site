// Interfața uneltei IPv6 (fără framework). Toată matematica e în ipv6.js.
//
// Folosire:
//   import { mountIpv6Tool } from "./ui.js";
//   const tool = mountIpv6Tool(document.getElementById("ipv6-tool"), { lang: "ro" });
//   tool.setLang("en");
//
// Trei file: Prescurtare / extindere, Tip și prefix, EUI-64. Stilurile folosesc clase cu prefixul `v6t-`
// (vezi demo.html); pagina gazdă le poate copia în style.css.

import {
  parseInput, analyze, compressSteps, expandSteps, prefixSteps, eui64, eui64Steps, parseMac, errorMessage,
  formatCount, plural, FORMS, zeroRuns,
} from "./ipv6.js";

/** @typedef {import("./ipv6.js").Lang} Lang */
/** @typedef {"compress" | "type" | "eui64"} Tab */

const T = {
  ro: {
    tabs: { compress: "Prescurtare / extindere", type: "Tip și prefix", eui64: "EUI-64" },
    tablist: "Ce vrei să faci",
    show: "Arată",
    examples: "Exemple:",
    exampleAria: (/** @type {string} */ x) => `Încarcă exemplul ${x}`,
    results: "Rezultat",
    // prescurtare
    addrLabel: "Adresă IPv6",
    addrHint: "În orice formă: completă, prescurtată, cu litere mari sau mici",
    compressed: "Prescurtată (RFC 5952)",
    expanded: "Completă",
    hexOnly: "Doar în hexazecimal",
    typeShort: "Tipul adresei",
    groupsTitle: "Cele 8 grupuri",
    groupsHint: "Fiecare grup are 16 biți (4 cifre hexazecimale).",
    groupAria: (/** @type {number} */ i, /** @type {string} */ v, /** @type {string} */ role) => `Grupul ${i}: ${v}${role}`,
    roleRun: ", înlocuit de ::",
    roleZero: ", rămâne 0",
    legendRun: "grupuri înlocuite de „::”",
    legendZero: "grup 0 care rămâne „0”",
    howCompress: "Cum se prescurtează",
    howExpand: "Cum se extinde",
    summaryCompress: (/** @type {string} */ c, /** @type {string} */ e) => `Prescurtat: ${c}. Complet: ${e}.`,
    // tip și prefix
    typeLabel: "Adresă IPv6, opțional cu prefix",
    typeHint: "De exemplu 2001:db8:acad:1::10/64. Fără prefix afli doar tipul adresei.",
    rows: {
      type: "Tipul", range: "Intervalul", meaning: "Ce înseamnă", scope: "Domeniul (scope)", group: "Grupul", lifetime: "Adresă multicast",
      network: "Rețeaua (prefixul)", first: "Prima adresă", last: "Ultima adresă", split: "Biți de rețea / restul", count: "Câte adrese", subnets: "Câte rețele /64",
      grp: "Prefix global de rutare (48 de biți)", subnetId: "ID de subrețea (16 biți)", iid: "ID de interfață (64 de biți)",
      eui: "ID-ul de interfață vine din MAC-ul", solicited: "Multicast solicited-node", ipv4: "Adresa IPv4 din ea", zone: "Zona (%)",
    },
    permanent: "permanentă (bine-cunoscută)",
    temporary: "temporară",
    scopeUnknown: (/** @type {number} */ n) => `rezervat / nealocat (${n.toString(16)})`,
    splitValue: (/** @type {number} */ p) => `${p} / ${128 - p}`,
    countValue: (/** @type {number} */ h, /** @type {string} */ n) => `2^${h} = ${n}`,
    structureNote: "Împărțirea tipică pentru unicast global: 48 de biți de la furnizor, 16 pentru subrețele, 64 pentru interfață.",
    prefixTitle: "Rețeaua și interfața",
    prefixHint: (/** @type {number} */ p) => `Cifrele albastre sunt cei ${plural(p, "ro", FORMS.BITS)} de rețea; cele chihlimbarii, restul.`.replace("cei 1 bit de rețea", "primul bit de rețea"),
    legendNet: "rețea (prefix)",
    legendHost: "subrețele și interfață",
    legendSplit: "cifră împărțită",
    stepsPrefix: "Pas cu pas: aflăm rețeaua",
    noPrefix: "Adaugă un prefix (de exemplu /64) ca să vezi rețeaua, prima și ultima adresă.",
    summaryType: (/** @type {string} */ a, /** @type {string} */ ty, /** @type {string | null} */ net) => `${a}: ${ty}${net ? `, rețeaua ${net}` : ""}.`,
    // eui-64
    macLabel: "Adresa MAC",
    macHint: "De exemplu 00:1a:2b:3c:4d:5e, 00-1A-2B-3C-4D-5E sau 001a.2b3c.4d5e",
    pfxLabel: "Prefix /64 (opțional)",
    pfxHint: "De exemplu 2001:db8:acad:1::/64",
    generate: "Generează",
    euiRows: { iid: "ID de interfață (EUI-64)", addr: "Adresa IPv6", full: "Adresa completă", ll: "Adresa link-local", mac: "MAC (format Cisco)" },
    bytesTitle: "Cei 64 de biți",
    bytesHint: "ff:fe se inserează la mijloc, iar în primul octet se inversează al 7-lea bit.",
    inserted: "inserat",
    flipTitle: "Primul octet, bit cu bit",
    flipBefore: "Înainte",
    flipAfter: "După",
    flipAria: (/** @type {number} */ b) => `Al 7-lea bit, inversat: era ${b}, devine ${b ? 0 : 1}`,
    stepsEui: "Pas cu pas",
    summaryEui: (/** @type {string} */ iid, /** @type {string | null} */ addr) => `ID de interfață ${iid}${addr ? `; adresa ${addr}` : ""}.`,
  },
  en: {
    tabs: { compress: "Compress / expand", type: "Type and prefix", eui64: "EUI-64" },
    tablist: "What do you want to do",
    show: "Show",
    examples: "Examples:",
    exampleAria: (/** @type {string} */ x) => `Load example ${x}`,
    results: "Result",
    addrLabel: "IPv6 address",
    addrHint: "In any form: full, compressed, upper or lower case",
    compressed: "Compressed (RFC 5952)",
    expanded: "Full",
    hexOnly: "Hexadecimal only",
    typeShort: "Address type",
    groupsTitle: "The 8 groups",
    groupsHint: "Each group is 16 bits (4 hexadecimal digits).",
    groupAria: (/** @type {number} */ i, /** @type {string} */ v, /** @type {string} */ role) => `Group ${i}: ${v}${role}`,
    roleRun: ", replaced by ::",
    roleZero: ", stays 0",
    legendRun: "groups replaced by \"::\"",
    legendZero: "zero group that stays \"0\"",
    howCompress: "How to compress it",
    howExpand: "How to expand it",
    summaryCompress: (/** @type {string} */ c, /** @type {string} */ e) => `Compressed: ${c}. Full: ${e}.`,
    typeLabel: "IPv6 address, optionally with a prefix",
    typeHint: "For example 2001:db8:acad:1::10/64. Without a prefix you only get the address type.",
    rows: {
      type: "Type", range: "Range", meaning: "What it means", scope: "Scope", group: "Group", lifetime: "Multicast address",
      network: "Network (prefix)", first: "First address", last: "Last address", split: "Network bits / the rest", count: "Addresses", subnets: "/64 networks",
      grp: "Global routing prefix (48 bits)", subnetId: "Subnet ID (16 bits)", iid: "Interface ID (64 bits)",
      eui: "Interface ID comes from the MAC", solicited: "Solicited-node multicast", ipv4: "IPv4 address inside", zone: "Zone (%)",
    },
    permanent: "permanent (well-known)",
    temporary: "temporary",
    scopeUnknown: (/** @type {number} */ n) => `reserved / unassigned (${n.toString(16)})`,
    splitValue: (/** @type {number} */ p) => `${p} / ${128 - p}`,
    countValue: (/** @type {number} */ h, /** @type {string} */ n) => `2^${h} = ${n}`,
    structureNote: "The usual global unicast split: 48 bits from the provider, 16 for subnets, 64 for the interface.",
    prefixTitle: "Network and interface",
    prefixHint: (/** @type {number} */ p) => `Blue digits are the ${plural(p, "en", FORMS.BITS)} of network; amber digits are the rest.`.replace("the 1 bit of network", "the single network bit"),
    legendNet: "network (prefix)",
    legendHost: "subnets and interface",
    legendSplit: "split digit",
    stepsPrefix: "Step by step: finding the network",
    noPrefix: "Add a prefix (for example /64) to see the network, the first and the last address.",
    summaryType: (/** @type {string} */ a, /** @type {string} */ ty, /** @type {string | null} */ net) => `${a}: ${ty}${net ? `, network ${net}` : ""}.`,
    macLabel: "MAC address",
    macHint: "For example 00:1a:2b:3c:4d:5e, 00-1A-2B-3C-4D-5E or 001a.2b3c.4d5e",
    pfxLabel: "/64 prefix (optional)",
    pfxHint: "For example 2001:db8:acad:1::/64",
    generate: "Generate",
    euiRows: { iid: "Interface ID (EUI-64)", addr: "IPv6 address", full: "Full address", ll: "Link-local address", mac: "MAC (Cisco format)" },
    bytesTitle: "The 64 bits",
    bytesHint: "ff:fe goes in the middle, and the 7th bit of the first byte is flipped.",
    inserted: "inserted",
    flipTitle: "The first byte, bit by bit",
    flipBefore: "Before",
    flipAfter: "After",
    flipAria: (/** @type {number} */ b) => `The 7th bit, flipped: was ${b}, becomes ${b ? 0 : 1}`,
    stepsEui: "Step by step",
    summaryEui: (/** @type {string} */ iid, /** @type {string | null} */ addr) => `Interface ID ${iid}${addr ? `; address ${addr}` : ""}.`,
  },
};

const EX_COMPRESS = ["2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8:0:0:1:0:0:1", "FE80::0202:B3FF:FE1E:8329", "::ffff:192.0.2.1"];
const EX_TYPE = ["2001:db8:acad:c123::1/50", "fe80::21a:2bff:fe3c:4d5e/64", "fd12:3456:789a:1::1/64", "ff02::1:ff3c:4d5e", "::1/128"];
const EX_MAC = ["00:1a:2b:3c:4d:5e", "fc99.4775.cee0", "02-00-5E-10-00-01"];
const TABS = /** @type {const} */ (["compress", "type", "eui64"]);

let instances = 0;

/** @param {unknown} s */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => /** @type {Record<string,string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hex2 = (/** @type {number} */ b) => b.toString(16).padStart(2, "0");
/** Ca `esc`, dar permite ruperea rândului după „:” și „.”, ca adresele lungi să se rupă între grupuri, nu în mijlocul lor. @param {unknown} s */
const brk = (s) => esc(s).replace(/([:.])/g, "$1<wbr>");

/**
 * @param {HTMLElement} root
 * @param {{ lang?: Lang, tab?: Tab, initial?: string }} [options]
 */
export function mountIpv6Tool(root, options = {}) {
  const uid = `v6t${++instances}`;
  const id = (/** @type {string} */ name) => `${uid}-${name}`;

  const state = {
    /** @type {Lang} */ lang: options.lang === "en" ? "en" : "ro",
    /** @type {Tab} */ tab: TABS.includes(/** @type {Tab} */ (options.tab)) ? /** @type {Tab} */ (options.tab) : "compress",
    addr: options.initial ?? EX_COMPRESS[0],
    typeAddr: "2001:db8:acad:1:21a:2bff:fe3c:4d5e/64",
    mac: EX_MAC[0],
    pfx: "2001:db8:acad:1::/64",
    showErr: { compress: false, type: false, eui64: false },
  };
  const t = () => T[state.lang];

  /** @param {string} sel */
  const $ = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));

  // ───────── construirea DOM-ului ─────────

  /**
   * @param {string} key   id-ul câmpului
   * @param {string} label
   * @param {string} hint
   * @param {string} value
   * @param {string} errId
   */
  const field = (key, label, hint, value, errId) => `
    <label class="v6t-label" for="${id(key)}">${esc(label)}</label>
    <input class="v6t-input v6t-mono" id="${id(key)}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
      value="${esc(value)}" aria-describedby="${id(`${key}-hint`)} ${id(errId)}">
    <p class="v6t-hint" id="${id(`${key}-hint`)}">${brk(hint)}</p>`;

  /** @param {string[]} list @param {string} target */
  const chips = (list, target) => `<div class="v6t-examples"><span class="v6t-examples-label">${esc(t().examples)}</span>
    ${list.map((x) => `<button type="button" class="v6t-chip v6t-mono" data-example="${esc(x)}" data-target="${target}" aria-label="${esc(t().exampleAria(x))}">${brk(x)}</button>`).join("")}</div>`;

  function shell() {
    const L = t();
    const tabBtn = (/** @type {Tab} */ k) =>
      `<button type="button" role="tab" class="v6t-tab" id="${id(`tab-${k}`)}" aria-controls="${id(`panel-${k}`)}" aria-selected="${state.tab === k}" tabindex="${state.tab === k ? 0 : -1}" data-tab="${k}">${esc(L.tabs[k])}</button>`;
    const panel = (/** @type {Tab} */ k, /** @type {string} */ body) =>
      `<section role="tabpanel" class="v6t-panel" id="${id(`panel-${k}`)}" aria-labelledby="${id(`tab-${k}`)}" ${state.tab === k ? "" : "hidden"} tabindex="0">${body}</section>`;

    const compressBody = `
      <form class="v6t-form" data-form="compress" novalidate>
        ${field("addr", L.addrLabel, L.addrHint, state.addr, "addr-err")}
        <button class="v6t-btn" type="submit">${esc(L.show)}</button>
        <p class="v6t-error" id="${id("addr-err")}" hidden></p>
        ${chips(EX_COMPRESS, "addr")}
      </form>
      <p class="v6t-summary" id="${id("compress-summary")}" aria-live="polite" aria-atomic="true"></p>
      <div id="${id("compress-out")}"></div>`;

    const typeBody = `
      <form class="v6t-form" data-form="type" novalidate>
        ${field("type-addr", L.typeLabel, L.typeHint, state.typeAddr, "type-err")}
        <button class="v6t-btn" type="submit">${esc(L.show)}</button>
        <p class="v6t-error" id="${id("type-err")}" hidden></p>
        ${chips(EX_TYPE, "type-addr")}
      </form>
      <p class="v6t-summary" id="${id("type-summary")}" aria-live="polite" aria-atomic="true"></p>
      <div id="${id("type-out")}"></div>`;

    const euiBody = `
      <form class="v6t-form" data-form="eui64" novalidate>
        ${field("mac", L.macLabel, L.macHint, state.mac, "eui-err")}
        ${field("pfx", L.pfxLabel, L.pfxHint, state.pfx, "eui-err")}
        <button class="v6t-btn" type="submit">${esc(L.generate)}</button>
        <p class="v6t-error" id="${id("eui-err")}" hidden></p>
        ${chips(EX_MAC, "mac")}
      </form>
      <p class="v6t-summary" id="${id("eui-summary")}" aria-live="polite" aria-atomic="true"></p>
      <div id="${id("eui-out")}"></div>`;

    return `
      <div class="v6t-tabs" role="tablist" aria-label="${esc(L.tablist)}">${TABS.map(tabBtn).join("")}</div>
      ${panel("compress", compressBody)}
      ${panel("type", typeBody)}
      ${panel("eui64", euiBody)}`;
  }

  // ───────── rezultate ─────────

  /**
   * @param {string} errId
   * @param {HTMLElement | null} input
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

  /** @param {[string, string, boolean?][]} rows  [etichetă, valoare, mono] */
  const kv = (rows) => `<table class="v6t-table v6t-kv"><caption class="v6t-h">${esc(t().results)}</caption><tbody>${rows
    .map(([k, v, mono]) => `<tr><th scope="row">${esc(k)}</th><td${mono === false ? "" : ' class="v6t-mono"'}>${brk(v)}</td></tr>`).join("")}</tbody></table>`;

  /** @param {string} title @param {{ id: string, title: string, text: string }[]} list */
  const stepBlock = (title, list) => `
    <div class="v6t-block">
      <h3 class="v6t-h">${esc(title)}</h3>
      <ol class="v6t-steps">${list.map((s) => `<li data-step="${s.id}"><strong>${esc(s.title)}.</strong> ${brk(s.text)}</li>`).join("")}</ol>
    </div>`;

  /** @param {{ announce?: boolean }} [o] */
  function renderCompress(o = {}) {
    const L = t();
    const lang = state.lang;
    const input = $(`#${id("addr")}`);
    const r = parseInput(state.addr);
    if (!r.ok) {
      setError("addr-err", input, state.showErr.compress ? errorMessage(r.error, lang) : null);
      if (state.showErr.compress) {
        $(`#${id("compress-out")}`).innerHTML = "";
        $(`#${id("compress-summary")}`).textContent = "";
      }
      return;
    }
    setError("addr-err", input, null);
    const a = analyze(state.addr);
    /** @type {[string, string, boolean?][]} */
    const rows = [[L.compressed, a.compressed], [L.expanded, a.expanded]];
    if (a.compressedHex !== a.compressed) rows.push([L.hexOnly, a.compressedHex]);
    rows.push([L.typeShort, a.type.label[lang], false]);

    const run = a.zeroRun;
    const zeros = new Set(zeroRuns(a.groups).flatMap((z) => Array.from({ length: z.length }, (_, k) => z.start + k)));
    const cells = a.groups.map((g, i) => {
      const inRun = run && i >= run.start && i < run.start + run.length;
      const cls = inRun ? " v6t-g-run" : zeros.has(i) ? " v6t-g-zero" : "";
      const v = g.toString(16).padStart(4, "0");
      const role = inRun ? L.roleRun : zeros.has(i) ? L.roleZero : "";
      return `<li class="v6t-g${cls}" aria-label="${esc(L.groupAria(i + 1, v, role))}"><span class="v6t-g-i" aria-hidden="true">${i + 1}</span><span class="v6t-g-v v6t-mono" aria-hidden="true">${v}</span></li>`;
    }).join("");
    const legend = [
      run ? `<span><span class="v6t-swatch v6t-swatch-run"></span>${esc(L.legendRun)}</span>` : "",
      zeros.size > (run ? run.length : 0) ? `<span><span class="v6t-swatch v6t-swatch-zero"></span>${esc(L.legendZero)}</span>` : "",
    ].join("");
    const groups = `
      <div class="v6t-block">
        <h3 class="v6t-h">${esc(L.groupsTitle)}</h3>
        <p class="v6t-hint">${esc(L.groupsHint)}</p>
        <ol class="v6t-groups">${cells}</ol>
        ${legend ? `<p class="v6t-legend" aria-hidden="true">${legend}</p>` : ""}
      </div>`;

    $(`#${id("compress-out")}`).innerHTML = kv(rows) + groups +
      stepBlock(L.howCompress, compressSteps(state.addr, lang)) +
      stepBlock(L.howExpand, expandSteps(state.addr, lang));
    if (o.announce !== false) $(`#${id("compress-summary")}`).textContent = L.summaryCompress(a.compressed, a.expanded);
  }

  /**
   * Forma completă cu cifrele colorate: rețea (albastru) / restul (chihlimbariu).
   * @param {number[]} groups
   * @param {number} p
   */
  function prefixDigits(groups, p) {
    const out = [];
    for (let gi = 0; gi < 8; gi++) {
      const digits = groups[gi].toString(16).padStart(4, "0");
      const spans = [...digits].map((d, di) => {
        const start = gi * 16 + di * 4;
        const cls = start + 4 <= p ? "v6t-net" : start >= p ? "v6t-host" : "v6t-split";
        return `<span class="${cls}">${d}</span>`;
      }).join("");
      out.push(`<span class="v6t-pg">${spans}</span>`);
    }
    return out.join('<span class="v6t-colon">:</span>');
  }

  /** @param {{ announce?: boolean }} [o] */
  function renderType(o = {}) {
    const L = t();
    const lang = state.lang;
    const input = $(`#${id("type-addr")}`);
    const r = parseInput(state.typeAddr);
    if (!r.ok) {
      setError("type-err", input, state.showErr.type ? errorMessage(r.error, lang) : null);
      if (state.showErr.type) {
        $(`#${id("type-out")}`).innerHTML = "";
        $(`#${id("type-summary")}`).textContent = "";
      }
      return;
    }
    setError("type-err", input, null);
    const a = analyze(state.typeAddr);
    const ty = a.type;
    /** @type {[string, string, boolean?][]} */
    const rows = [[L.rows.type, ty.label[lang], false]];
    if (ty.cidr) rows.push([L.rows.range, `${ty.cidr} (${ty.rfc})`]);
    rows.push([L.rows.meaning, ty.note[lang], false]);
    if (ty.multicast) {
      const m = ty.multicast;
      rows.push([L.rows.scope, m.scopeName ? m.scopeName[lang] : L.scopeUnknown(m.scope), false]);
      if (m.wellKnown) rows.push([L.rows.group, m.wellKnown[lang], false]);
      rows.push([L.rows.lifetime, m.permanent ? L.permanent : L.temporary, false]);
    }
    if (a.range) {
      rows.push(
        [L.rows.network, a.range.cidr],
        [L.rows.first, a.range.first],
        [L.rows.last, a.range.last],
        [L.rows.split, L.splitValue(/** @type {number} */ (a.prefix)), false],
        [L.rows.count, L.countValue(a.range.hostBits, formatCount(a.range.addresses, lang)), false],
      );
      if (a.range.subnets64 !== null) rows.push([L.rows.subnets, formatCount(a.range.subnets64, lang), false]);
    }
    if (a.structure) {
      rows.push([L.rows.grp, a.structure.globalRoutingPrefix], [L.rows.subnetId, a.structure.subnetId], [L.rows.iid, a.structure.interfaceId]);
    } else if (a.interfaceId) {
      rows.push([L.rows.iid, a.interfaceId]);
    }
    if (a.eui64Mac) rows.push([L.rows.eui, a.eui64Mac]);
    if (a.solicitedNode) rows.push([L.rows.solicited, a.solicitedNode]);
    if (a.ipv4) rows.push([L.rows.ipv4, a.ipv4]);
    if (a.zone) rows.push([L.rows.zone, a.zone]);

    let extra = a.structure ? `<p class="v6t-hint v6t-note">${esc(L.structureNote)}</p>` : "";
    if (a.prefix !== null) {
      const p = a.prefix;
      const hasSplit = p % 4 !== 0;
      extra += `
        <div class="v6t-block">
          <h3 class="v6t-h">${esc(L.prefixTitle)}</h3>
          <p class="v6t-hint">${esc(L.prefixHint(p))}</p>
          <p class="v6t-prefixline v6t-mono" aria-hidden="true">${prefixDigits(a.groups, p)}<span class="v6t-colon">/</span><span class="v6t-net">${p}</span></p>
          <p class="v6t-legend" aria-hidden="true"><span><span class="v6t-swatch v6t-swatch-net"></span>${esc(L.legendNet)}</span><span><span class="v6t-swatch v6t-swatch-host"></span>${esc(L.legendHost)}</span>${hasSplit ? `<span><span class="v6t-swatch v6t-swatch-split"></span>${esc(L.legendSplit)}</span>` : ""}</p>
        </div>` + stepBlock(L.stepsPrefix, prefixSteps(state.typeAddr, lang));
    } else {
      extra += `<p class="v6t-hint v6t-note">${esc(L.noPrefix)}</p>`;
    }
    $(`#${id("type-out")}`).innerHTML = kv(rows) + extra;
    if (o.announce !== false) $(`#${id("type-summary")}`).textContent = L.summaryType(a.compressed, ty.label[lang], a.range ? a.range.cidr : null);
  }

  /** @param {{ announce?: boolean }} [o] */
  function renderEui(o = {}) {
    const L = t();
    const lang = state.lang;
    const macInput = $(`#${id("mac")}`);
    const pfxInput = $(`#${id("pfx")}`);
    const show = state.showErr.eui64;
    const m = parseMac(state.mac);
    let e;
    let bad = /** @type {HTMLElement | null} */ (null);
    let msg = "";
    if (!m.ok) {
      bad = macInput;
      msg = errorMessage(m.error, lang);
    } else {
      try {
        e = eui64(state.mac, { prefix: state.pfx });
      } catch (err) {
        bad = pfxInput;
        msg = errorMessage(/** @type {any} */ (err), lang);
      }
    }
    macInput.removeAttribute("aria-invalid");
    pfxInput.removeAttribute("aria-invalid");
    if (!e) {
      setError("eui-err", bad, show ? msg : null);
      if (show) {
        $(`#${id("eui-out")}`).innerHTML = "";
        $(`#${id("eui-summary")}`).textContent = "";
      }
      return;
    }
    setError("eui-err", null, null);
    /** @type {[string, string, boolean?][]} */
    const rows = [[L.euiRows.iid, e.interfaceId]];
    if (e.withPrefix) rows.push([L.euiRows.addr, e.withPrefix.address], [L.euiRows.full, e.withPrefix.expanded]);
    rows.push([L.euiRows.ll, e.linkLocal], [L.euiRows.mac, e.macCisco]);

    const byteCells = e.bytes.map((b, i) => {
      const cls = i === 0 ? " v6t-b-flip" : i === 3 || i === 4 ? " v6t-b-ins" : "";
      return `<li class="v6t-b${cls}"><span class="v6t-mono">${hex2(b)}</span>${i === 3 || i === 4 ? `<span class="v6t-b-tag">${esc(L.inserted)}</span>` : ""}</li>`;
    }).join("");
    const bits = (/** @type {number} */ n) => n.toString(2).padStart(8, "0").split("")
      .map((d, i) => `<span class="v6t-bit${i === 6 ? " v6t-bit-flip" : ""}">${d}</span>`).join("");
    const visual = `
      <div class="v6t-block">
        <h3 class="v6t-h">${esc(L.bytesTitle)}</h3>
        <p class="v6t-hint">${esc(L.bytesHint)}</p>
        <ol class="v6t-bytes" aria-label="${esc(e.bytes.map(hex2).join(":"))}">${byteCells}</ol>
        <h3 class="v6t-h v6t-subh">${esc(L.flipTitle)}</h3>
        <div class="v6t-flip" role="img" aria-label="${esc(`${L.flipBefore}: ${e.firstByte.before.toString(2).padStart(8, "0")}. ${L.flipAfter}: ${e.firstByte.after.toString(2).padStart(8, "0")}. ${L.flipAria(e.firstByte.bitWas)}`)}">
          <span class="v6t-flip-l">${esc(L.flipBefore)}</span><span class="v6t-mono v6t-bits">${bits(e.firstByte.before)}</span><span class="v6t-mono v6t-flip-h">= ${hex2(e.firstByte.before)}</span>
          <span class="v6t-flip-l">${esc(L.flipAfter)}</span><span class="v6t-mono v6t-bits">${bits(e.firstByte.after)}</span><span class="v6t-mono v6t-flip-h">= ${hex2(e.firstByte.after)}</span>
        </div>
      </div>`;
    $(`#${id("eui-out")}`).innerHTML = kv(rows) + visual + stepBlock(L.stepsEui, eui64Steps(state.mac, { prefix: state.pfx, lang }));
    if (o.announce !== false) $(`#${id("eui-summary")}`).textContent = L.summaryEui(e.interfaceId, e.withPrefix ? e.withPrefix.address : null);
  }

  /** @param {Tab} k @param {{ announce?: boolean }} [o] */
  const renderTab = (k, o) => (k === "compress" ? renderCompress(o) : k === "type" ? renderType(o) : renderEui(o));

  // ───────── evenimente ─────────

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let announceTimer;
  /** Rezultatul se actualizează imediat; rezumatul pentru cititorul de ecran vine după o pauză în tastare. @param {Tab} k */
  function live(k) {
    renderTab(k, { announce: false });
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const L = t();
      let text = null;
      try {
        if (k === "compress") {
          const a = analyze(state.addr);
          text = L.summaryCompress(a.compressed, a.expanded);
        } else if (k === "type") {
          const a = analyze(state.typeAddr);
          text = L.summaryType(a.compressed, a.type.label[state.lang], a.range ? a.range.cidr : null);
        } else {
          const e = eui64(state.mac, { prefix: state.pfx });
          text = L.summaryEui(e.interfaceId, e.withPrefix ? e.withPrefix.address : null);
        }
      } catch {
        text = null; // textul e încă invalid: nu anunțăm nimic
      }
      if (text) $(`#${id(k === "eui64" ? "eui-summary" : `${k}-summary`)}`).textContent = text;
    }, 800);
  }

  /** @param {Event} e */
  function onInput(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === id("addr")) { state.addr = el.value; live("compress"); }
    else if (el.id === id("type-addr")) { state.typeAddr = el.value; live("type"); }
    else if (el.id === id("mac")) { state.mac = el.value; live("eui64"); }
    else if (el.id === id("pfx")) { state.pfx = el.value; live("eui64"); }
  }

  /** @param {SubmitEvent} e */
  function onSubmit(e) {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const which = /** @type {Tab} */ (form.dataset.form);
    state.showErr[which] = true;
    clearTimeout(announceTimer);
    renderTab(which);
    /** @type {HTMLElement | null} */ (form.querySelector('[aria-invalid="true"]'))?.focus();
  }

  /** @param {MouseEvent} e */
  function onClick(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const tab = /** @type {HTMLElement | null} */ (target.closest("[data-tab]"));
    if (tab) return selectTab(/** @type {Tab} */ (tab.dataset.tab), false);
    const ex = /** @type {HTMLElement | null} */ (target.closest("[data-example]"));
    if (!ex) return;
    const value = /** @type {string} */ (ex.dataset.example);
    const key = ex.dataset.target;
    /** @type {HTMLInputElement} */ ($(`#${id(/** @type {string} */ (key))}`)).value = value;
    if (key === "addr") { state.addr = value; state.showErr.compress = true; renderCompress(); }
    else if (key === "type-addr") { state.typeAddr = value; state.showErr.type = true; renderType(); }
    else if (key === "mac") { state.mac = value; state.showErr.eui64 = true; renderEui(); }
  }

  /** Taste pentru tab-uri (model WAI-ARIA): săgeți, Home, End. @param {KeyboardEvent} e */
  function onKeydown(e) {
    const tab = /** @type {HTMLElement} */ (e.target).closest?.("[role=tab]");
    if (!tab) return;
    const i = TABS.indexOf(/** @type {Tab} */ (/** @type {HTMLElement} */ (tab).dataset.tab));
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
      const b = $(`#${id(`tab-${name}`)}`);
      const on = name === k;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      $(`#${id(`panel-${name}`)}`).hidden = !on;
    }
    if (focus) $(`#${id(`tab-${k}`)}`).focus();
  }

  function build() {
    root.classList.add("v6t");
    root.innerHTML = shell();
    for (const k of TABS) renderTab(k, { announce: false });
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
    /** @param {Tab} k */
    selectTab(k) {
      if (TABS.includes(k)) selectTab(k, false);
    },
    /** @returns {Lang} */
    get lang() {
      return state.lang;
    },
    destroy() {
      clearTimeout(announceTimer);
      root.removeEventListener("input", onInput);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
      root.innerHTML = "";
      root.classList.remove("v6t");
    },
  };
}
