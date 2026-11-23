/* Routerel — testul CCNA gratuit (pagina /en/ccna-practice-test/ și /test-ccna/). Fără biblioteci, se încarcă cu „defer”.
   Întrebările sunt în HTML (enunț, exhibit, variante); corectitudinea, „why” pe variantă și explicația vin din <script id="pt-data">.
   Variantele se amestecă la fiecare încărcare. Nimic nu se salvează și nimic nu pleacă din browser. */
(function () {
  "use strict";
  var dataEl = document.getElementById("pt-data");
  var list = document.querySelector("[data-pt]");
  if (!dataEl || !list) return;
  var D;
  try { D = JSON.parse(dataEl.textContent || "{}"); } catch (e) { return; }
  var lang = D.lang === "ro" ? "ro" : "en";
  var progress = document.querySelector("[data-pt-progress]");
  var resultBox = document.querySelector("[data-pt-result]");
  var scoreEl = document.querySelector("[data-pt-score]");
  var cards = Array.prototype.slice.call(list.querySelectorAll(".pt-q"));
  var answered = 0, correct = 0;

  var TXT = lang === "ro"
    ? { count: function (a, n, c) { return a + " din " + n + " rezolvate · " + c + " corecte"; }, result: function (c, n) { return "Ai răspuns corect la " + c + " din " + n + " (" + Math.round(c / n * 100) + "%)."; } }
    : { count: function (a, n, c) { return a + " of " + n + " answered · " + c + " correct"; }, result: function (c, n) { return "You got " + c + " of " + n + " right (" + Math.round(c / n * 100) + "%)."; } };

  function shuffle(card) {
    var box = card.querySelector(".pt-opts");
    var opts = Array.prototype.slice.call(box.children);
    for (var i = opts.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = opts[i]; opts[i] = opts[j]; opts[j] = t;
    }
    for (var k = 0; k < opts.length; k++) box.appendChild(opts[k]);
  }

  function selected(card) {
    return Array.prototype.slice.call(card.querySelectorAll('.pt-opt[aria-pressed="true"]')).map(function (b) { return b.getAttribute("data-opt"); });
  }

  function evaluate(card) {
    var q = D.q[Number(card.getAttribute("data-q"))];
    if (!q || card.classList.contains("is-done")) return;
    var picked = selected(card);
    var ok = picked.length === q.correct.length && picked.every(function (id) { return q.correct.indexOf(id) >= 0; });
    card.classList.add("is-done", ok ? "is-right" : "is-wrong");
    var btns = card.querySelectorAll(".pt-opt");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], id = b.getAttribute("data-opt");
      var isC = q.correct.indexOf(id) >= 0, isP = picked.indexOf(id) >= 0;
      b.disabled = true;
      b.classList.add(isC ? "is-correct" : isP ? "is-miss" : "is-other");
      if (q.why && q.why[id]) {
        var w = document.createElement("span");
        w.className = "pt-why";
        w.innerHTML = q.why[id]; // HTML generat de noi (tools/site/build-drafts.mjs): text escapat, cu cuvintele cu cratimă ținute împreună
        b.appendChild(w);
      }
    }
    var check = card.querySelector(".pt-check");
    if (check) check.hidden = true;
    var hint = card.querySelector(".pt-hint");
    if (hint) hint.hidden = true;
    var fb = card.querySelector(".pt-feedback");
    fb.innerHTML = "";
    var h = document.createElement("p");
    h.className = "pt-verdict";
    h.textContent = ok ? D.t.right : D.t.wrong;
    fb.appendChild(h);
    if (q.explanation) {
      var ex = document.createElement("p");
      ex.className = "pt-expl";
      var lbl = document.createElement("strong");
      lbl.textContent = D.t.explanation + ": ";
      ex.appendChild(lbl);
      var et = document.createElement("span");
      et.innerHTML = q.explanation;
      ex.appendChild(et);
      fb.appendChild(ex);
    }
    fb.hidden = false;
    answered++;
    if (ok) correct++;
    if (progress) progress.textContent = TXT.count(answered, D.n, correct);
    // progresul se vede și pe parcurs, sub fiecare întrebare rezolvată
    var tally = document.createElement("p");
    tally.className = "pt-tally";
    tally.textContent = TXT.count(answered, D.n, correct);
    fb.appendChild(tally);
    if (answered === D.n && resultBox) {
      scoreEl.textContent = TXT.result(correct, D.n);
      resultBox.hidden = false;
    }
  }

  list.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".pt-opt, .pt-check") : null;
    if (!btn || btn.disabled) return;
    var card = btn.closest(".pt-q");
    var q = D.q[Number(card.getAttribute("data-q"))];
    if (btn.classList.contains("pt-check")) { evaluate(card); return; }
    if (q.type === "multi") {
      var on = btn.getAttribute("aria-pressed") !== "true";
      if (on && selected(card).length >= q.choose) return; // nu mai mult decât cere enunțul
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      var check = card.querySelector(".pt-check");
      if (check) check.disabled = selected(card).length !== q.choose;
    } else {
      btn.setAttribute("aria-pressed", "true");
      evaluate(card);
    }
  });

  function reset() {
    answered = 0; correct = 0;
    cards.forEach(function (card) {
      card.classList.remove("is-done", "is-right", "is-wrong");
      var btns = card.querySelectorAll(".pt-opt");
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        b.disabled = false;
        b.setAttribute("aria-pressed", "false");
        b.classList.remove("is-correct", "is-miss", "is-other");
        var w = b.querySelector(".pt-why");
        if (w) b.removeChild(w);
      }
      var check = card.querySelector(".pt-check");
      if (check) { check.hidden = false; check.disabled = true; }
      var hint = card.querySelector(".pt-hint");
      if (hint) hint.hidden = false;
      var fb = card.querySelector(".pt-feedback");
      fb.hidden = true; fb.innerHTML = "";
      shuffle(card);
    });
    if (progress) progress.textContent = TXT.count(0, D.n, 0);
    if (resultBox) resultBox.hidden = true;
    if (cards[0]) cards[0].scrollIntoView({ block: "start" });
  }

  var again = document.querySelector("[data-pt-again]");
  if (again) again.addEventListener("click", reset);
  cards.forEach(shuffle);
  list.classList.add("is-ready");
  if (progress) progress.classList.add("is-live");
})();
