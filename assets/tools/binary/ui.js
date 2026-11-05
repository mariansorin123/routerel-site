// Interfața convertorului binar / zecimal / hexazecimal (fără framework). Toată matematica e în binary.js.
//
// Folosire:
//   import { mountBinaryConverter } from "./ui.js";
//   const conv = mountBinaryConverter(document.getElementById("binary-tool"), { lang: "ro" });
//   conv.setLang("en");
//
// Componenta construiește singură tot HTML-ul în elementul primit. Stilurile folosesc clase cu prefixul `bnc-`
// (vezi demo.html); pagina gazdă le poate copia în style.css.

import { parseValue, fromValue, formatAs, steps, errorMessage, formatCount, placeValues, toHex2, PLACES } from "./binary.js";

/** @typedef {import("./binary.js").Lang} Lang */
/** @typedef {import("./binary.js").Base} Base */
/** @typedef {import("./binary.js").Conversion} Conversion */

const T = {
  ro: {
    valueLabel: "Număr sau adresă IPv4",
    baseLegend: "Scris în",
    bases: { dec: "Zecimal", bin: "Binar", hex: "Hexazecimal" },
    hints: {
      dec: "De exemplu 192, 192.168.1.1 sau 3232235777 (cel mult 32 de biți)",
      bin: "De exemplu 11000000 sau 11000000.10101000.00000001.00000001",
      hex: "De exemplu C0, C0.A8.01.01 sau 0xC0A80101",
    },
    convert: "Convertește",
    examples: "Exemple:",
    exampleAria: (/** @type {string} */ x, /** @type {string} */ b) => `Încarcă exemplul ${x} (${b})`,
    results: "Rezultat",
    rows: {
      dec: "Zecimal", bin: "Binar", hex: "Hexazecimal", ipv4: "Ca adresă IPv4", int: "Ca număr pe 32 de biți", hex0x: "Hexazecimal cu 0x",
    },
    placesTitle: "Tabelul pozițiilor",
    placesHint: (/** @type {boolean} */ multi) =>
      `Fiecare bit are o valoare: 128, 64, 32, 16, 8, 4, 2, 1. Unde bitul e 1, valoarea se adună.${multi ? " Câte un tabel pentru fiecare octet." : ""} Sub tabel, fiecare grupă de 4 biți este o cifră hexazecimală.`,
    octetCaption: (/** @type {number} */ i, /** @type {number} */ v, /** @type {boolean} */ multi) => (multi ? `Octetul ${i + 1} = ${v}` : `${v}`),
    nibbleAria: (/** @type {string} */ d) => `cifra hexazecimală ${d}`,
    sumZero: "niciun bit de 1 → 0",
    stepsTitle: "Pas cu pas",
    summary: (/** @type {Conversion} */ c) => {
      const dec = c.kind === "number" ? formatCount(c.value, "ro") : c.decimal;
      return `${dec} în zecimal = ${c.binary} în binar = ${c.hex} în hexazecimal.`;
    },
    padded: "Am completat cu zerouri în stânga; valoarea nu se schimbă.",
  },
  en: {
    valueLabel: "Number or IPv4 address",
    baseLegend: "Written in",
    bases: { dec: "Decimal", bin: "Binary", hex: "Hexadecimal" },
    hints: {
      dec: "For example 192, 192.168.1.1 or 3232235777 (up to 32 bits)",
      bin: "For example 11000000 or 11000000.10101000.00000001.00000001",
      hex: "For example C0, C0.A8.01.01 or 0xC0A80101",
    },
    convert: "Convert",
    examples: "Examples:",
    exampleAria: (/** @type {string} */ x, /** @type {string} */ b) => `Load example ${x} (${b})`,
    results: "Result",
    rows: {
      dec: "Decimal", bin: "Binary", hex: "Hexadecimal", ipv4: "As an IPv4 address", int: "As a 32-bit number", hex0x: "Hexadecimal with 0x",
    },
    placesTitle: "Place-value table",
    placesHint: (/** @type {boolean} */ multi) =>
      `Each bit has a value: 128, 64, 32, 16, 8, 4, 2, 1. Where the bit is 1, its value is added.${multi ? " One table per octet." : ""} Under the table, each group of 4 bits is one hexadecimal digit.`,
    octetCaption: (/** @type {number} */ i, /** @type {number} */ v, /** @type {boolean} */ multi) => (multi ? `Octet ${i + 1} = ${v}` : `${v}`),
    nibbleAria: (/** @type {string} */ d) => `hexadecimal digit ${d}`,
    sumZero: "no 1 bits → 0",
    stepsTitle: "Step by step",
    summary: (/** @type {Conversion} */ c) => {
      const dec = c.kind === "number" ? formatCount(c.value, "en") : c.decimal;
      return `${dec} in decimal = ${c.binary} in binary = ${c.hex} in hexadecimal.`;
    },
    padded: "Zeros were added on the left; the value doesn't change.",
  },
};

/** @type {[string, Base][]} */
const EXAMPLES = [["192", "dec"], ["10101100", "bin"], ["FE", "hex"], ["192.168.10.77", "dec"], ["11000000.10101000.00000001.00000001", "bin"], ["0xC0A80101", "hex"]];
const BASES = /** @type {const} */ (["dec", "bin", "hex"]);

let instances = 0;

/** @param {unknown} s */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => /** @type {Record<string,string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** Ca `esc`, dar permite ruperea rândului după „.”, ca adresele lungi să se rupă între octeți. @param {unknown} s */
const brk = (s) => esc(s).replace(/\./g, ".<wbr>");

/**
 * @param {HTMLElement} root
 * @param {{ lang?: Lang, initial?: string, base?: Base }} [options]
 */
export function mountBinaryConverter(root, options = {}) {
  const uid = `bnc${++instances}`;
  const id = (/** @type {string} */ name) => `${uid}-${name}`;

  const state = {
    /** @type {Lang} */ lang: options.lang === "en" ? "en" : "ro",
    /** @type {Base} */ base: BASES.includes(/** @type {Base} */ (options.base)) ? /** @type {Base} */ (options.base) : "dec",
    value: options.initial ?? "192.168.10.77",
    showErr: false,
  };
  const t = () => T[state.lang];

  /** @param {string} sel */
  const $ = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));

  function shell() {
    const L = t();
    return `
      <div class="bnc-panel">
        <form class="bnc-form" novalidate>
          <fieldset class="bnc-fieldset">
            <legend class="bnc-label">${esc(L.baseLegend)}</legend>
            <div class="bnc-seg">
              ${BASES.map((b) => `<label class="bnc-segbtn"><input type="radio" name="base" value="${b}" ${state.base === b ? "checked" : ""}><span>${esc(L.bases[b])}</span></label>`).join("")}
            </div>
          </fieldset>
          <label class="bnc-label" for="${id("value")}">${esc(L.valueLabel)}</label>
          <div class="bnc-inputrow">
            <input class="bnc-input bnc-mono" id="${id("value")}" name="value" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
              value="${esc(state.value)}" aria-describedby="${id("hint")} ${id("err")}">
            <button class="bnc-btn" type="submit">${esc(L.convert)}</button>
          </div>
          <p class="bnc-hint" id="${id("hint")}">${brk(L.hints[state.base])}</p>
          <p class="bnc-error" id="${id("err")}" hidden></p>
          <div class="bnc-examples"><span class="bnc-examples-label">${esc(L.examples)}</span>
            ${EXAMPLES.map(([x, b]) => `<button type="button" class="bnc-chip bnc-mono" data-example="${esc(x)}" data-base="${b}" aria-label="${esc(L.exampleAria(x, L.bases[b]))}">${brk(x)}</button>`).join("")}
          </div>
        </form>
        <p class="bnc-summary" id="${id("summary")}" aria-live="polite" aria-atomic="true"></p>
        <div id="${id("out")}"></div>
      </div>`;
  }

  /** @param {string | null} msg */
  function setError(msg) {
    const el = $(`#${id("err")}`);
    const input = $(`#${id("value")}`);
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
   * Tabelul 128…1 pentru un octet, cu biții de 1 „aprinși” și cifrele hexa dedesubt.
   * @param {number} o
   * @param {number} i
   * @param {boolean} multi
   */
  function placeTable(o, i, multi) {
    const L = t();
    const pv = placeValues(o);
    const ones = pv.filter((x) => x.bit).map((x) => x.place);
    const sum = ones.length ? `${ones.join(" + ")} = ${o}` : L.sumZero;
    const hex = toHex2(o);
    return `
      <figure class="bnc-octet">
        <table class="bnc-places">
          <caption class="bnc-octet-cap">${esc(L.octetCaption(i, o, multi))}</caption>
          <thead><tr>${PLACES.map((p, k) => `<th scope="col"${k === 4 ? ' class="bnc-nibstart"' : ""}>${p}</th>`).join("")}</tr></thead>
          <tbody>
            <tr>${pv.map((x, k) => `<td class="bnc-bit${x.bit ? " bnc-on" : ""}${k === 4 ? " bnc-nibstart" : ""}">${x.bit}</td>`).join("")}</tr>
            <tr class="bnc-nib"><td colspan="4" aria-label="${esc(L.nibbleAria(hex[0]))}">${hex[0]}</td><td colspan="4" class="bnc-nibstart" aria-label="${esc(L.nibbleAria(hex[1]))}">${hex[1]}</td></tr>
          </tbody>
        </table>
        <figcaption class="bnc-sum bnc-mono">${esc(sum)}</figcaption>
      </figure>`;
  }

  /** @param {{ announce?: boolean }} [o] */
  function render(o = {}) {
    const L = t();
    const lang = state.lang;
    const r = parseValue(state.value, state.base);
    if (!r.ok) {
      setError(state.showErr ? errorMessage(r.error, lang) : null);
      if (state.showErr) {
        $(`#${id("out")}`).innerHTML = "";
        $(`#${id("summary")}`).textContent = "";
      }
      return;
    }
    setError(null);
    const c = fromValue(r.value, r.kind, state.base, r.padded);
    /** @type {[string, string][]} */
    const rows = [];
    if (c.kind === "octet") {
      rows.push([L.rows.dec, c.decimal], [L.rows.bin, c.binary], [L.rows.hex, c.hex]);
    } else if (c.kind === "ipv4") {
      rows.push([L.rows.dec, c.decimal], [L.rows.bin, c.binary], [L.rows.hex, c.hex], [L.rows.int, formatCount(c.value, lang)], [L.rows.hex0x, c.hexPrefixed]);
    } else {
      rows.push([L.rows.dec, formatCount(c.value, lang)], [L.rows.bin, c.binary], [L.rows.hex, c.hex], [L.rows.ipv4, /** @type {string} */ (c.dotted)], [L.rows.hex0x, c.hexPrefixed]);
    }
    const table = `<table class="bnc-table bnc-kv"><caption class="bnc-h">${esc(L.results)}</caption><tbody>${rows
      .map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="bnc-mono">${brk(v)}</td></tr>`).join("")}</tbody></table>` +
      (c.padded ? `<p class="bnc-hint bnc-note">${esc(L.padded)}</p>` : "");

    const multi = c.octets.length > 1;
    const places = `
      <div class="bnc-block">
        <h3 class="bnc-h">${esc(L.placesTitle)}</h3>
        <p class="bnc-hint">${esc(L.placesHint(multi))}</p>
        <div class="bnc-octets${multi ? " bnc-octets-4" : ""}">${c.octets.map((x, i) => placeTable(x, i, multi)).join("")}</div>
      </div>`;

    const list = steps(state.value, state.base, lang);
    const stepList = `
      <div class="bnc-block">
        <h3 class="bnc-h">${esc(L.stepsTitle)}</h3>
        <ol class="bnc-steps">${list.map((s) => `<li data-step="${s.id}"${s.octet !== undefined ? ` data-octet="${s.octet}"` : ""}><strong>${esc(s.title)}.</strong> ${brk(s.text)}</li>`).join("")}</ol>
      </div>`;

    $(`#${id("out")}`).innerHTML = table + places + stepList;
    if (o.announce !== false) $(`#${id("summary")}`).textContent = L.summary(c);
  }

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let announceTimer;
  /** Rezultatul se actualizează imediat; cititorul de ecran îl aude doar după o pauză în tastare. */
  function liveRender() {
    render({ announce: false });
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const r = parseValue(state.value, state.base);
      if (r.ok) $(`#${id("summary")}`).textContent = t().summary(fromValue(r.value, r.kind, state.base, r.padded));
    }, 800);
  }

  /** @param {Event} e */
  function onInput(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === id("value")) {
      state.value = el.value;
      liveRender();
    }
  }

  /** La schimbarea bazei, valoarea validă e rescrisă în noua bază, ca explicația să pornească de acolo. @param {Event} e */
  function onChange(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.name !== "base" || el.type !== "radio") return;
    const next = /** @type {Base} */ (el.value);
    const r = parseValue(state.value, state.base);
    if (r.ok) {
      state.value = formatAs(fromValue(r.value, r.kind, state.base), next);
      /** @type {HTMLInputElement} */ ($(`#${id("value")}`)).value = state.value;
    }
    state.base = next;
    $(`#${id("hint")}`).innerHTML = brk(t().hints[next]);
    render();
  }

  /** @param {SubmitEvent} e */
  function onSubmit(e) {
    e.preventDefault();
    state.showErr = true;
    clearTimeout(announceTimer);
    render();
    if ($(`#${id("value")}`).getAttribute("aria-invalid") === "true") $(`#${id("value")}`).focus();
  }

  /** @param {MouseEvent} e */
  function onClick(e) {
    const ex = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-example]"));
    if (!ex) return;
    state.value = /** @type {string} */ (ex.dataset.example);
    state.base = /** @type {Base} */ (ex.dataset.base);
    /** @type {HTMLInputElement} */ ($(`#${id("value")}`)).value = state.value;
    for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (root.querySelectorAll('input[name="base"]'))) radio.checked = radio.value === state.base;
    $(`#${id("hint")}`).innerHTML = brk(t().hints[state.base]);
    state.showErr = true;
    render();
  }

  function build() {
    root.classList.add("bnc");
    root.innerHTML = shell();
    render({ announce: false });
  }

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);
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
    destroy() {
      clearTimeout(announceTimer);
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
      root.innerHTML = "";
      root.classList.remove("bnc");
    },
  };
}
