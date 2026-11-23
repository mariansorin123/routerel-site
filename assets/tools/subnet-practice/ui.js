// Interfața exercițiilor de subnetting (fără framework). Toată logica e în practice.js.
//
// Folosire:
//   import { mountSubnetPractice } from "./ui.js";
//   const practice = mountSubnetPractice(document.getElementById("subnet-practice"), { lang: "ro", initial: "easy" });
//   practice.setLang("en");
//
// Componenta construiește singură tot HTML-ul în elementul primit. Stilurile folosesc clase cu prefixul `spx-`
// (vezi demo.html). Scorul ține doar cât e deschisă pagina: nu se salvează nimic.

import {
  LEVELS, TYPES, TEXTS, createRng, generateExercise, checkAnswer, answerError, prompt, solution, parseLevel,
  emptyScore, updateScore,
} from "./practice.js";

/** @typedef {import("./practice.js").Lang} Lang */
/** @typedef {import("./practice.js").Level} Level */
/** @typedef {import("./practice.js").Exercise} Exercise */
/** @typedef {import("./practice.js").ExerciseType} ExerciseType */

const T = {
  ro: {
    level: "Nivel",
    type: "Tipul exercițiului",
    score: (/** @type {number} */ c, /** @type {number} */ a) => `Corecte: <strong>${c}</strong> din <strong>${a}</strong>`,
    streak: (/** @type {number} */ s) => `Serie: <strong>${s}</strong>`,
    scoreLabel: "Scorul acestei sesiuni",
    exercise: (/** @type {number} */ n) => `Exercițiul ${n}`,
    answer: "Răspunsul tău",
    check: "Verifică",
    reveal: "Arată soluția",
    next: "Exercițiul următor",
    correct: "Corect!",
    wrong: "Nu chiar.",
    revealed: "Iată soluția.",
    expected: "Răspunsul corect:",
    yourAnswer: "Răspunsul:",
    given: "Ai scris:",
    chose: "Ai ales:",
    stepsTitle: "Rezolvarea pas cu pas",
    seeSteps: "Vezi rezolvarea pas cu pas",
  },
  en: {
    level: "Level",
    type: "Exercise type",
    score: (/** @type {number} */ c, /** @type {number} */ a) => `Correct: <strong>${c}</strong> of <strong>${a}</strong>`,
    streak: (/** @type {number} */ s) => `Streak: <strong>${s}</strong>`,
    scoreLabel: "Score for this session",
    exercise: (/** @type {number} */ n) => `Exercise ${n}`,
    answer: "Your answer",
    check: "Check",
    reveal: "Show solution",
    next: "Next exercise",
    correct: "Correct!",
    wrong: "Not quite.",
    revealed: "Here is the solution.",
    expected: "Correct answer:",
    yourAnswer: "Answer:",
    given: "You wrote:",
    chose: "You chose:",
    stepsTitle: "Worked solution",
    seeSteps: "See the worked solution",
  },
};

const INPUT_MODE = { ip: "decimal", number: "numeric", mask: "decimal", prefixOrMask: "text", yesno: "text" };

let instances = 0;

/** @param {unknown} s */
/** Escape simplu, pentru valorile câmpurilor (ce scrie omul rămâne exact cum l-a scris). @param {unknown} s */
const escA = (s) => String(s).replace(/[&<>"']/g, (c) => /** @type {Record<string,string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => /** @type {Record<string,string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
  // un număr rămâne lângă cuvintele lui („4,094 usable hosts”, „62 de host-uri utilizabile”); cuvintele cu cratimă nu se rup („host-uri”)
  .replace(/(\d) (de )?(?=[\p{L}])/gu, (_, d, de) => `${d}\u00a0${de ? "de\u00a0" : ""}`)
  .replace(/(usable|host-uri|host-ul) (hosts?|utilizabile?)/g, "$1\u00a0$2")
  .replace(/\p{L}[\p{L}\p{N}]*(?:-\p{L}[\p{L}\p{N}]*)+/gu, (m) => m.replace(/-/g, "\u2011"));
/** O valoare care nu se rupe pe două rânduri (adresă, mască, număr). @param {unknown} s */
const whole = (s) => `<span class="spx-nw">${esc(s)}</span>`;
/** Enunțul: adresa și masca rămân întregi; rândul se poate rupe doar între ele. @param {string} s */
const subjectHtml = (s) => s.split(" ").map(whole).join(" ");
const IP_RE = /\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?/g;
/** Text explicativ: adresele nu se rup, iar „32 − 22” rămâne pe un rând. @param {string} s */
const prose = (s) => esc(s.replace(/(\S) − (\S)/g,"$1 − $2")).replace(IP_RE, (m) => `<span class="spx-nw">${m}</span>`);

/**
 * @param {HTMLElement} root
 * @param {{ lang?: Lang, initial?: string, type?: ExerciseType | "all", seed?: number }} [options]
 *   `initial`: nivelul de pornire („easy”, „medium”, „hard”; implicit „easy”).
 *   `type`: un singur tip de exercițiu (implicit toate). `seed`: pentru exerciții reproductibile (teste, capturi).
 */
export function mountSubnetPractice(root, options = {}) {
  const uid = `spx${++instances}`;
  const id = (/** @type {string} */ name) => `${uid}-${name}`;
  const seed = Number.isInteger(options.seed) ? /** @type {number} */ (options.seed) : Math.floor(Math.random() * 2 ** 32);

  const state = {
    /** @type {Lang} */ lang: options.lang === "en" ? "en" : "ro",
    /** @type {Level} */ level: parseLevel(options.initial) ?? "easy",
    /** @type {ExerciseType | "all"} */ type: TYPES.includes(/** @type {any} */ (options.type)) ? /** @type {ExerciseType} */ (options.type) : "all",
    rng: createRng(seed),
    /** @type {Exercise} */ exercise: /** @type {any} */ (null),
    count: 0,
    draft: "",
    /** @type {string | null} */ error: null,
    /** @type {{ given: string | null, correct: boolean, revealed: boolean } | null} */ answered: null,
    score: emptyScore(),
  };
  const t = () => T[state.lang];
  const P = () => TEXTS[state.lang];
  /** @param {string} sel */
  const $ = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));

  function newExercise() {
    state.exercise = generateExercise(state.rng, { level: state.level, type: state.type, previous: state.exercise });
    state.count++;
    state.draft = "";
    state.error = null;
    state.answered = null;
  }

  // ───────── construirea DOM-ului ─────────

  function shell() {
    const L = t();
    const levels = LEVELS.map((l) => `
      <label class="spx-segbtn"><input type="radio" name="${id("level")}" value="${l}" ${state.level === l ? "checked" : ""}><span>${esc(P().levels[l])}</span></label>`).join("");
    const types = [["all", P().allTypes], ...TYPES.map((k) => [k, P().types[k]])]
      .map(([k, label]) => `<option value="${k}" ${state.type === k ? "selected" : ""}>${esc(label)}</option>`).join("");
    return `
      <div class="spx-controls">
        <fieldset class="spx-fieldset">
          <legend class="spx-label">${esc(L.level)}</legend>
          <div class="spx-seg">${levels}</div>
        </fieldset>
        <div class="spx-field">
          <label class="spx-label" for="${id("type")}">${esc(L.type)}</label>
          <select class="spx-select" id="${id("type")}">${types}</select>
        </div>
      </div>
      <p class="spx-note" id="${id("level-note")}">${esc(P().levelNotes[state.level])}</p>
      <p class="spx-score" id="${id("score")}" aria-label="${esc(L.scoreLabel)}"></p>
      <section class="spx-panel" id="${id("panel")}" aria-labelledby="${id("q")}"></section>`;
  }

  function renderScore() {
    const L = t();
    const s = state.score;
    $(`#${id("score")}`).innerHTML = `<span class="spx-pill">${L.score(s.correct, s.attempted)}</span><span class="spx-pill">${L.streak(s.streak)}</span>`;
  }

  function renderExercise() {
    const L = t();
    const ex = state.exercise;
    const pr = prompt(ex, state.lang);
    const done = state.answered;
    const yesno = ex.kind === "yesno";
    const res = done && done.given !== null ? checkAnswer(ex, done.given, state.lang) : null;
    const mark = done && !done.revealed ? (done.correct ? " spx-is-ok" : " spx-is-bad") : "";

    const answerArea = yesno
      ? `<div class="spx-yesno" role="group" aria-labelledby="${id("q")}" aria-describedby="${id("subject")}">
          ${["yes", "no"].map((v) => {
            const chosen = done && done.given === v;
            // după răspuns, varianta corectă e mereu verde; cea aleasă greșit e roșie
            const cls = !done ? "" : v === ex.answer ? " spx-is-ok" : chosen ? " spx-is-bad" : "";
            return `<button type="button" class="spx-choice${cls}" data-choice="${v}" aria-pressed="${chosen ? "true" : "false"}" ${done ? "disabled" : ""}>${esc(v === "yes" ? P().yes : P().no)}</button>`;
          }).join("")}
        </div>`
      : `<label class="spx-label" for="${id("answer")}">${esc(L.answer)}</label>
        <input class="spx-input spx-mono${mark}" id="${id("answer")}" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
          inputmode="${INPUT_MODE[ex.kind]}" enterkeyhint="done" value="${escA(state.draft)}" aria-describedby="${id("q")} ${id("subject")} ${id("hint")}"
          ${done ? "readonly" : ""} ${state.error ? 'aria-invalid="true"' : done && !done.correct && !done.revealed ? 'aria-invalid="true"' : ""}>`;

    $(`#${id("panel")}`).innerHTML = `
      <p class="spx-kicker">${esc(L.exercise(state.count))} ·&nbsp;${esc(pr.typeLabel)}</p>
      <p class="spx-question" id="${id("q")}">${esc(pr.question)}</p>
      <p class="spx-subject ${ex.type === "maskForHosts" ? "spx-subject-text" : "spx-mono"}" id="${id("subject")}">${subjectHtml(pr.subject)}</p>
      <form class="spx-form" novalidate>
        ${answerArea}
        <p class="spx-hint${state.error ? " spx-hint-error" : ""}" id="${id("hint")}">${esc(state.error ?? pr.hint)}</p>
        <div class="spx-actions">
          ${yesno ? "" : `<button type="submit" class="spx-btn" ${done ? "hidden" : ""}>${esc(L.check)}</button>`}
          <button type="button" class="spx-btn spx-btn-ghost" data-action="reveal" ${done ? "hidden" : ""}>${esc(L.reveal)}</button>
          <button type="button" class="spx-btn" data-action="next" ${done ? "" : "hidden"}>${esc(L.next)} <span aria-hidden="true">→</span></button>
        </div>
      </form>
      <div class="spx-live" id="${id("live")}" aria-live="polite" aria-atomic="true">${done ? verdictHtml(ex, done, res) : ""}</div>
      <div class="spx-solution" id="${id("solution")}">${done ? solutionHtml(ex, done) : ""}</div>`;
  }

  /**
   * @param {Exercise} ex
   * @param {{ given: string | null, correct: boolean, revealed: boolean }} done
   * @param {import("./practice.js").CheckResult | null} res
   */
  function verdictHtml(ex, done, res) {
    const L = t();
    const expected = res ? res.expected : checkAnswer(ex, "", state.lang).expected;
    const cls = done.revealed ? "spx-verdict-info" : done.correct ? "spx-verdict-ok" : "spx-verdict-bad";
    const title = done.revealed ? L.revealed : done.correct ? L.correct : L.wrong;
    const lines = [`<p class="spx-verdict-line">${esc(done.correct ? L.yourAnswer : L.expected)} <span class="spx-mono spx-strong spx-nw">${esc(expected)}</span></p>`];
    if (!done.correct && res) {
      lines.push(`<p class="spx-verdict-line">${esc(ex.kind === "yesno" ? L.chose : L.given)} <span class="spx-mono spx-nw">${esc(res.normalizedGiven)}</span></p>`);
    }
    return `<div class="spx-verdict ${cls}"><p class="spx-verdict-title">${esc(title)}</p>${lines.join("")}</div>`;
  }

  /**
   * @param {Exercise} ex
   * @param {{ correct: boolean }} done
   */
  function solutionHtml(ex, done) {
    const L = t();
    const list = `<ol class="spx-steps">${solution(ex, state.lang)
      .map((s) => `<li data-step="${s.id}"${s.id === "answer" ? ' class="spx-step-answer"' : ""}><strong>${esc(s.title)}.</strong> ${prose(s.text)}</li>`).join("")}</ol>`;
    return done.correct
      ? `<details class="spx-details"><summary>${esc(L.seeSteps)}</summary>${list}</details>`
      : `<h3 class="spx-h">${esc(L.stepsTitle)}</h3>${list}`;
  }

  // ───────── acțiuni ─────────

  /** @param {string} given */
  function submit(given) {
    if (state.answered) return;
    const ex = state.exercise;
    const r = checkAnswer(ex, given, state.lang);
    if (!r.recognized) {
      // răspuns gol sau într-o formă nerecunoscută: nu se punctează, doar arătăm formatul
      state.error = answerError(ex, r, state.lang);
      renderExercise();
      const input = /** @type {HTMLInputElement | null} */ (root.querySelector(`#${id("answer")}`));
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length); // cursorul la final, ca la tastare
      }
      return;
    }
    state.error = null;
    state.answered = { given, correct: r.correct, revealed: false };
    state.score = updateScore(state.score, r.correct);
    renderExercise();
    renderScore();
    $(`[data-action="next"]`).focus();
  }

  function reveal() {
    if (state.answered) return;
    state.error = null;
    state.answered = { given: null, correct: false, revealed: true };
    state.score = updateScore(state.score, false);
    renderExercise();
    renderScore();
    $(`[data-action="next"]`).focus();
  }

  /** @param {boolean} focus */
  function next(focus) {
    newExercise();
    renderExercise();
    if (focus) /** @type {HTMLElement | null} */ (root.querySelector(`#${id("answer")}, [data-choice]`))?.focus();
  }

  // ───────── evenimente ─────────

  /** @param {Event} e */
  function onInput(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === id("answer")) {
      state.draft = el.value;
      if (state.error) {
        // eroarea dispare când utilizatorul corectează; textul de ajutor revine pe același loc
        state.error = null;
        el.removeAttribute("aria-invalid");
        const hint = $(`#${id("hint")}`);
        hint.classList.remove("spx-hint-error");
        hint.textContent = prompt(state.exercise, state.lang).hint;
      }
    }
  }

  /** @param {Event} e */
  function onChange(e) {
    const el = /** @type {HTMLInputElement | HTMLSelectElement} */ (e.target);
    if (el.name === id("level")) {
      state.level = /** @type {Level} */ (el.value);
      $(`#${id("level-note")}`).textContent = P().levelNotes[state.level];
      next(false);
    } else if (el.id === id("type")) {
      state.type = /** @type {ExerciseType | "all"} */ (el.value);
      next(false);
    }
  }

  /** @param {SubmitEvent} e */
  function onSubmit(e) {
    e.preventDefault();
    if (state.exercise.kind !== "yesno") submit(state.draft);
  }

  /** @param {MouseEvent} e */
  function onClick(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const choice = /** @type {HTMLElement | null} */ (target.closest("[data-choice]"));
    if (choice) return submit(/** @type {string} */ (choice.dataset.choice));
    const action = target.closest("[data-action]")?.getAttribute("data-action");
    if (action === "reveal") reveal();
    else if (action === "next") next(true);
  }

  function build() {
    root.classList.add("spx");
    root.innerHTML = shell();
    renderScore();
    renderExercise();
  }

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);
  newExercise();
  build();

  return {
    /** Schimbă limba păstrând exercițiul, răspunsul scris și scorul. @param {Lang} lang */
    setLang(lang) {
      if (lang !== "ro" && lang !== "en") return;
      const focused = /** @type {HTMLElement | null} */ (document.activeElement);
      const focusSel = focused && root.contains(focused)
        ? focused.id ? `#${CSS.escape(focused.id)}` : focused.dataset.action ? `[data-action="${focused.dataset.action}"]` : focused.dataset.choice ? `[data-choice="${focused.dataset.choice}"]` : null
        : null;
      state.lang = lang;
      if (state.error) state.error = answerError(state.exercise, checkAnswer(state.exercise, state.draft, lang), lang);
      build();
      if (focusSel) /** @type {HTMLElement | null} */ (root.querySelector(focusSel))?.focus();
    },
    /** Trece la exercițiul următor (fără să puncteze exercițiul curent). */
    next() {
      next(false);
    },
    /** @returns {Lang} */
    get lang() {
      return state.lang;
    },
    /** @returns {import("./practice.js").Score} */
    get score() {
      return { ...state.score };
    },
    destroy() {
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
      root.innerHTML = "";
      root.classList.remove("spx");
    },
  };
}
