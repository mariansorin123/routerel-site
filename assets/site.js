/* Routerel — site. JavaScript mic, fără biblioteci. Se încarcă cu „defer” (nu blochează afișarea). */

/* =====================================================================
   SETĂRI — SINGURUL LOC DE MODIFICAT
   ===================================================================== */

// 1) Linkul Google Play.
//    Gol ("")  → butoanele arată „În curând pe Google Play” (fără link).
//    Când aplicația e publică, pune linkul de mai jos între ghilimele și urcă site-ul:
//    "https://play.google.com/store/apps/details?id=ro.routerel.app"
var PLAY_URL = "";

// 2) Prețurile abonamentelor, în lei (cu punct zecimal, ca în exemplu). Apar pe paginile în română.
//    Se schimbă aici și apar peste tot: prețul, „adică X lei/lună” și reducerea față de lunar.
//    Prețul real e mereu cel din Google Play; țineți-le la fel.
var PRICES = {
  monthly: 49.99,    // Lunar
  quarterly: 124.99, // La 3 luni (Recomandat)
  yearly: 399.99     // Anual
};

// 3) Prețurile în dolari (USD), afișate pe paginile în engleză.
//    DE CONFIRMAT de Sorin din Play Console (prețurile pentru Statele Unite). Valorile de acum sunt provizorii.
var PRICES_USD = {
  monthly: 9.99,     // Monthly
  quarterly: 24.99,  // Every 3 months (Recommended)
  yearly: 79.99      // Yearly
};

/* ===================================================================== */

(function () {
  "use strict";
  var doc = document.documentElement;
  var lang = (doc.getAttribute("lang") || "ro").slice(0, 2);
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  doc.classList.add("js");

  /* ---------- Google Play: „În curând” sau link ---------- */
  function setupPlay() {
    var live = typeof PLAY_URL === "string" && /^https:\/\/play\.google\.com\//.test(PLAY_URL);
    doc.classList.toggle("play-live", live);
    doc.classList.toggle("play-soon", !live);
    var els = document.querySelectorAll("[data-play]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (live) {
        el.setAttribute("href", PLAY_URL);
        el.setAttribute("rel", "noopener");
        el.removeAttribute("aria-disabled");
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
      } else if (el.hasAttribute("data-soon-href")) {
        // cât timp aplicația nu e publică, butonul duce la o secțiune a site-ului (ex. prețurile)
        el.setAttribute("href", el.getAttribute("data-soon-href"));
        el.removeAttribute("aria-disabled");
      } else {
        el.removeAttribute("href");
        el.setAttribute("aria-disabled", "true");
      }
    }
  }

  /* ---------- Prețuri: lei pe paginile în română, dolari pe cele în engleză ---------- */
  function fmt(n) {
    var s = n.toFixed(2);
    return lang === "ro" ? s.replace(".", ",") + " lei" : "$" + s;
  }
  function floor2(n) { return Math.floor(n * 100 + 1e-6) / 100; }
  function setupPrices() {
    var P = lang === "ro" ? PRICES : PRICES_USD;
    var per = { monthly: P.monthly, quarterly: floor2(P.quarterly / 3), yearly: floor2(P.yearly / 12) };
    var q = function (sel, fn) { var l = document.querySelectorAll(sel); for (var i = 0; i < l.length; i++) fn(l[i]); };
    q("[data-price]", function (el) { var k = el.getAttribute("data-price"); if (P[k]) el.textContent = fmt(P[k]); });
    q("[data-permonth]", function (el) { var k = el.getAttribute("data-permonth"); if (per[k]) el.textContent = fmt(per[k]); });
    q("[data-save]", function (el) {
      var k = el.getAttribute("data-save");
      var pct = Math.floor((1 - per[k] / P.monthly) * 100 + 1e-6);
      el.textContent = "−" + pct + "%";
      if (pct <= 0) el.hidden = true;
    });
    q("[data-from-permonth]", function (el) { el.textContent = fmt(Math.min(per.monthly, per.quarterly, per.yearly)); });
  }

  /* ---------- Limba aleasă (cookie „lang”, citit de funcția Cloudflare la intrarea pe site) ---------- */
  function setupLangChoice() {
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest(".lang-switch a[hreflang], a[data-set-lang]") : null;
      if (!a || (a.getAttribute("href") || "").charAt(0) === "#") return; // ancorele din aceeași pagină (ex. paginile legale) nu schimbă limba site-ului
      var l = a.getAttribute("data-set-lang") || a.getAttribute("hreflang");
      if (l !== "ro" && l !== "en") return;
      try {
        document.cookie = "lang=" + l + "; Max-Age=31536000; Path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
      } catch (err) { /* cookie-uri blocate: comutatorul merge oricum, doar nu se ține minte */ }
    });
  }

  /* ---------- Tema (luminoasă / întunecată), ținută minte ---------- */
  function setupTheme() {
    var btns = document.querySelectorAll("[data-theme-toggle]");
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    function current() {
      var t = doc.getAttribute("data-theme");
      if (t === "dark" || t === "light") return t;
      return mq && mq.matches ? "dark" : "light";
    }
    function label() {
      var dark = current() === "dark";
      var txt = lang === "ro" ? (dark ? "Treci la tema luminoasă" : "Treci la tema întunecată") : (dark ? "Switch to light theme" : "Switch to dark theme");
      for (var i = 0; i < btns.length; i++) { btns[i].setAttribute("aria-label", txt); btns[i].setAttribute("title", txt); }
    }
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var next = current() === "dark" ? "light" : "dark";
        doc.setAttribute("data-theme", next);
        try { localStorage.setItem("routerel-theme", next); } catch (e) { /* stocare indisponibilă */ }
        var meta = document.querySelector('meta[name="theme-color"]:not([media])');
        if (meta) meta.setAttribute("content", next === "dark" ? "#12151b" : "#ffffff");
        label();
      });
    }
    if (mq && mq.addEventListener) mq.addEventListener("change", label);
    label();
  }

  /* ---------- Meniul de pe telefon ---------- */
  function setupMenu() {
    var btn = document.querySelector("[data-menu-btn]");
    var panel = document.getElementById("mobile-nav");
    if (!btn || !panel) return;
    var icon = btn.querySelector("svg path");
    var ICON_MENU = "M4 6h16M4 12h16M4 18h16", ICON_CLOSE = "M6 6l12 12M18 6 6 18";
    var openY = 0, openT = 0;
    function set(open) {
      btn.setAttribute("aria-expanded", String(open));
      panel.hidden = !open;
      if (icon) icon.setAttribute("d", open ? ICON_CLOSE : ICON_MENU); // hamburger ↔ X
      openY = window.scrollY; openT = Date.now();
    }
    btn.addEventListener("click", function () { set(btn.getAttribute("aria-expanded") !== "true"); });
    panel.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) { set(false); btn.focus(); } });
    // dacă pagina se derulează cu meniul deschis, meniul se închide (nu rămâne agățat peste conținut)
    window.addEventListener("scroll", function () {
      if (panel.hidden) return;
      if (Date.now() - openT < 500) { openY = window.scrollY; return; } // o derulare deja pornită (inerție) nu-l închide imediat
      if (Math.abs(window.scrollY - openY) > 48) set(false);
    }, { passive: true });
  }

  /* ---------- Antetul (se micșorează la derulare) + bara de jos ---------- */
  function setupScroll() {
    var header = document.querySelector(".site-header");
    var sticky = document.querySelector(".sticky-cta");
    var hero = document.querySelector("[data-hero]");
    var footer = document.querySelector(".site-footer");
    // bara de jos se ascunde și cât timp se vede CTA-ul final, întrebarea demo sau prețurile (ar acoperi butoanele lor)
    var quiet = document.querySelectorAll("[data-final], [data-no-sticky]");
    var heroOut = false, footerIn = false, quietIn = [];
    var ticking = false;
    function update() {
      ticking = false;
      if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
      if (sticky) {
        var show = heroOut && !footerIn && quietIn.length === 0;
        sticky.classList.toggle("is-visible", show);
        document.body.classList.toggle("sticky-on", show);
        sticky.setAttribute("aria-hidden", show ? "false" : "true");
        var links = sticky.querySelectorAll("a");
        for (var i = 0; i < links.length; i++) { if (show) links[i].removeAttribute("tabindex"); else links[i].setAttribute("tabindex", "-1"); }
      }
    }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    if (sticky) document.body.classList.add("has-sticky");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.target === hero) heroOut = !en.isIntersecting && en.boundingClientRect.top < 0;
          if (en.target === footer) footerIn = en.isIntersecting;
          if (en.target.matches("[data-final], [data-no-sticky]")) {
            var k = quietIn.indexOf(en.target);
            if (en.isIntersecting && k < 0) quietIn.push(en.target);
            if (!en.isIntersecting && k >= 0) quietIn.splice(k, 1);
          }
        });
        update();
      }, { threshold: 0 });
      [hero, footer].concat(Array.prototype.slice.call(quiet)).forEach(function (el) { if (el) io.observe(el); });
    }
    update();
  }

  /* ---------- Apariția la derulare + numărătoare ---------- */
  function countUp(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    if (isNaN(target)) return;
    var suffix = el.getAttribute("data-suffix") || "";
    var sep = lang === "ro" ? "." : ",";
    function show(n) { el.textContent = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep) + suffix; }
    if (reduceMotion) { show(target); return; }
    var t0 = null, dur = 1300;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      show(Math.round(target * e));
      if (p < 1) requestAnimationFrame(step);
    }
    show(0);
    requestAnimationFrame(step);
  }
  function setupReveal() {
    var items = document.querySelectorAll(".reveal, [data-count], [data-animate]");
    if (!("IntersectionObserver" in window)) {
      for (var i = 0; i < items.length; i++) items[i].classList.add("is-in");
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.classList.add("is-in");
        if (el.hasAttribute("data-count")) countUp(el);
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    for (var j = 0; j < items.length; j++) io.observe(items[j]);
  }

  /* ---------- Hero: capturile se schimbă singure în telefon; înclinare ușoară ---------- */
  function setupHero() {
    var frames = document.querySelectorAll("[data-cycle] img");
    if (frames.length > 1 && !reduceMotion) {
      var idx = 0, timer = null;
      var run = function () {
        timer = setInterval(function () {
          frames[idx].classList.remove("is-on");
          idx = (idx + 1) % frames.length;
          frames[idx].classList.add("is-on");
        }, 3200);
      };
      run();
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) { clearInterval(timer); timer = null; } else if (!timer) run();
      });
    }
    var vis = document.querySelector("[data-tilt]");
    if (!vis || reduceMotion) return;
    var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
    var rx = 0, ry = 0, sy = 0, raf = 0;
    function apply() {
      raf = 0;
      vis.style.setProperty("--rx", rx.toFixed(2) + "deg");
      vis.style.setProperty("--ry", ry.toFixed(2) + "deg");
      vis.style.setProperty("--sy", sy.toFixed(1) + "px");
    }
    function queue() { if (!raf) raf = requestAnimationFrame(apply); }
    if (fine) {
      var host = vis.closest("[data-hero]") || vis;
      host.addEventListener("pointermove", function (e) {
        var r = vis.getBoundingClientRect();
        var x = (e.clientX - (r.left + r.width / 2)) / r.width;
        var y = (e.clientY - (r.top + r.height / 2)) / r.height;
        ry = Math.max(-1, Math.min(1, x)) * 7;
        rx = Math.max(-1, Math.min(1, y)) * -5;
        queue();
      });
      host.addEventListener("pointerleave", function () { rx = 0; ry = 0; queue(); });
    }
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      if (y > 1200) return;
      sy = y * -0.06;
      queue();
    }, { passive: true });
  }

  /* ---------- Mecanismul: linia dintre pași se umple la derulare ---------- */
  function setupProgressLine() {
    var wrap = document.querySelector("[data-steps]");
    if (!wrap) return;
    var fill = wrap.querySelector(".steps-fill");
    if (!fill) return;
    if (reduceMotion) { fill.style.transform = "scaleY(1)"; return; }
    var raf = 0;
    function upd() {
      raf = 0;
      var r = wrap.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = (vh * 0.6 - r.top) / r.height;
      p = Math.max(0, Math.min(1, p));
      fill.style.transform = "scaleY(" + p.toFixed(3) + ")";
    }
    window.addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
    window.addEventListener("resize", function () { if (!raf) raf = requestAnimationFrame(upd); });
    upd();
  }

  /* ---------- Galeria: butoanele înainte / înapoi ---------- */
  function setupGallery() {
    var g = document.querySelector("[data-gallery]");
    if (!g) return;
    var prev = document.querySelector("[data-gallery-prev]");
    var next = document.querySelector("[data-gallery-next]");
    function stepW() { var li = g.querySelector("li"); return li ? li.getBoundingClientRect().width + 16 : 280; }
    // puncte sub galerie pe telefon (unde nu sunt săgeți): arată la a câta captură ești
    var items = g.querySelectorAll(":scope > li");
    var dots = document.createElement("ul");
    dots.className = "gallery-dots";
    dots.setAttribute("aria-hidden", "true");
    for (var d = 0; d < items.length; d++) dots.appendChild(document.createElement("li"));
    (g.parentNode.parentNode || g.parentNode).insertBefore(dots, g.parentNode.nextSibling);
    function upd() {
      if (prev) prev.disabled = g.scrollLeft < 8;
      if (next) next.disabled = g.scrollLeft + g.clientWidth >= g.scrollWidth - 8;
      var w = stepW(), at = g.scrollLeft + g.clientWidth >= g.scrollWidth - 8 ? items.length - 1 : Math.round(g.scrollLeft / w);
      for (var i = 0; i < dots.children.length; i++) dots.children[i].classList.toggle("is-on", i === at);
    }
    if (prev) prev.addEventListener("click", function () { g.scrollBy({ left: -stepW(), behavior: reduceMotion ? "auto" : "smooth" }); });
    if (next) next.addEventListener("click", function () { g.scrollBy({ left: stepW(), behavior: reduceMotion ? "auto" : "smooth" }); });
    g.addEventListener("scroll", function () { requestAnimationFrame(upd); }, { passive: true });
    g.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); g.scrollBy({ left: stepW(), behavior: "auto" }); }
      if (e.key === "ArrowLeft") { e.preventDefault(); g.scrollBy({ left: -stepW(), behavior: "auto" }); }
    });
    upd();
  }

  /* ---------- Întrebarea demo (ca în aplicație: alegi → VERIFICĂ → verde / roșu + explicația) ---------- */
  function setupDemo() {
    var root = document.querySelector("[data-demo]");
    if (!root) return;
    var dataEl = document.getElementById("demo-data");
    var data;
    try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
    var qLang = lang;
    var picked = null, checked = false;
    var stem = root.querySelector("[data-demo-stem]");
    var list = root.querySelector("[data-demo-options]");
    var checkBtn = root.querySelector("[data-demo-check]");
    var result = root.querySelector("[data-demo-result]");
    var resTitle = root.querySelector("[data-demo-title]");
    var resXp = root.querySelector("[data-demo-xp]");
    var resText = root.querySelector("[data-demo-expl]");
    var resLabel = root.querySelector("[data-demo-label]");
    var after = root.querySelector("[data-demo-after]");
    var retry = root.querySelector("[data-demo-retry]");
    var live = root.querySelector("[data-demo-live]");
    var langBtns = root.querySelectorAll("[data-demo-lang]");
    var mascotHappy = root.querySelector(".demo-mascot--happy");
    var mascotSad = root.querySelector(".demo-mascot--sad");
    var typeLbl = root.querySelector("[data-demo-type]");
    var topicLbl = root.querySelector("[data-demo-topic]");
    var hintLbl = root.querySelector("[data-demo-hint]");
    var ui = data.ui;

    function t(obj) { return obj[qLang] || obj.en; }

    function render() {
      stem.textContent = t(data.stem);
      typeLbl.textContent = ui[qLang].type;
      topicLbl.textContent = t(data.topic);
      checkBtn.querySelector("span").textContent = ui[qLang].check;
      resLabel.textContent = ui[qLang].remember;
      if (hintLbl) hintLbl.textContent = ui[qLang].hint;
      list.innerHTML = "";
      data.options.forEach(function (o, i) {
        var li = document.createElement("li");
        var b = document.createElement("button");
        b.type = "button";
        b.className = "opt";
        b.setAttribute("data-id", o.id);
        b.setAttribute("aria-pressed", "false");
        b.innerHTML = '<span class="opt-num" aria-hidden="true">' + (i + 1) + '</span><span class="opt-body"><span class="opt-text"></span><span class="opt-why" hidden></span></span>';
        b.querySelector(".opt-text").textContent = t(o.text);
        b.addEventListener("click", function () { pick(o.id); });
        li.appendChild(b);
        list.appendChild(li);
      });
      for (var i = 0; i < langBtns.length; i++) {
        langBtns[i].setAttribute("aria-pressed", String(langBtns[i].getAttribute("data-demo-lang") === qLang));
      }
    }

    function pick(id) {
      if (checked) return;
      picked = id;
      var bs = list.querySelectorAll(".opt");
      for (var i = 0; i < bs.length; i++) {
        var on = bs[i].getAttribute("data-id") === id;
        bs[i].classList.toggle("is-picked", on);
        bs[i].setAttribute("aria-pressed", String(on));
      }
      checkBtn.disabled = false;
      checkBtn.removeAttribute("aria-disabled");
    }

    function check() {
      if (!picked || checked) return;
      checked = true;
      var opt = data.options.filter(function (o) { return o.id === picked; })[0];
      var ok = !!opt.correct;
      var bs = list.querySelectorAll(".opt");
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i];
        var o = data.options.filter(function (x) { return x.id === b.getAttribute("data-id"); })[0];
        b.disabled = true;
        b.classList.remove("is-picked");
        var why = b.querySelector(".opt-why");
        if (o.correct) {
          b.classList.add("is-correct");
          why.textContent = t(o.why); why.hidden = false;
          b.querySelector(".opt-num").textContent = "✓";
        } else if (o.id === picked) {
          b.classList.add("is-wrong");
          why.textContent = t(o.why); why.hidden = false;
          b.querySelector(".opt-num").textContent = "✕";
        } else {
          b.classList.add("is-dim");
        }
      }
      root.classList.toggle("is-ok", ok);
      root.classList.toggle("is-bad", !ok);
      resTitle.textContent = ok ? ui[qLang].good : ui[qLang].bad;
      resXp.textContent = "+" + (ok ? data.xp : data.xpWrong) + " XP";
      resText.textContent = t(data.explanation);
      // pe <svg>, proprietatea .hidden nu există: folosim atributul
      if (mascotHappy) mascotHappy.toggleAttribute("hidden", !ok);
      if (mascotSad) mascotSad.toggleAttribute("hidden", ok);
      result.hidden = false;
      after.hidden = false;
      checkBtn.hidden = true;
      retry.hidden = false;
      // reflow, apoi animația (doar transform / opacity)
      void result.offsetWidth;
      result.classList.add("is-in");
      after.classList.add("is-in");
      if (live) live.textContent = (ok ? ui[qLang].good : ui[qLang].bad) + " " + t(data.explanation);
      // explicația trebuie să se vadă întreagă (și cu mișcare redusă: atunci fără animație)
      var r = result.getBoundingClientRect();
      var headerH = 76, room = window.innerHeight - 12;
      if (r.bottom > room) {
        var dy = Math.min(r.bottom - room, r.top - headerH);
        if (dy > 0) window.scrollBy({ top: dy, behavior: reduceMotion ? "auto" : "smooth" });
      }
    }

    function reset(focusFirst) {
      picked = null; checked = false;
      root.classList.remove("is-ok", "is-bad");
      result.hidden = true; result.classList.remove("is-in");
      after.hidden = true; after.classList.remove("is-in");
      checkBtn.hidden = false; checkBtn.disabled = true; checkBtn.setAttribute("aria-disabled", "true");
      retry.hidden = true;
      render();
      if (focusFirst) { var f = list.querySelector(".opt"); if (f) f.focus(); }
    }

    checkBtn.addEventListener("click", check);
    retry.addEventListener("click", function () { reset(true); });
    for (var i = 0; i < langBtns.length; i++) {
      langBtns[i].addEventListener("click", function () {
        qLang = this.getAttribute("data-demo-lang");
        var wasChecked = checked, was = picked;
        reset(false);
        if (was) { pick(was); if (wasChecked) check(); }
      });
    }
    reset(false);
    root.classList.add("is-ready");
  }

  /* ---------- Telefon: comutatoare „Fără / Cu Routerel” și „Pentru cine”, „Vezi toate”, alegerea planului ----------
     Starea de pornire o dă CSS-ul (html.js), deci nu se mișcă nimic la încărcare; aici doar răspundem la atingeri.
     Fără JavaScript totul rămâne vizibil, iar comutatoarele și butonul „Vezi toate” nu apar. */
  function setupMobileUi() {
    var segs = document.querySelectorAll("[data-seg]");
    for (var i = 0; i < segs.length; i++) {
      (function (seg) {
        var target = document.getElementById(seg.getAttribute("data-seg"));
        if (!target) return;
        var btns = seg.querySelectorAll("[data-seg-val]");
        function set(val) {
          target.setAttribute("data-view", val);
          for (var j = 0; j < btns.length; j++) btns[j].setAttribute("aria-pressed", String(btns[j].getAttribute("data-seg-val") === val));
        }
        for (var j = 0; j < btns.length; j++) btns[j].addEventListener("click", function () { set(this.getAttribute("data-seg-val")); });
      })(segs[i]);
    }

    var more = document.querySelector("[data-stack-more]");
    var stack = more && document.getElementById(more.getAttribute("aria-controls"));
    if (more && stack) {
      more.addEventListener("click", function () {
        stack.classList.add("is-expanded");
        more.setAttribute("aria-expanded", "true");
        more.hidden = true; // după deschidere butonul dispare; lista rămâne întreagă
        var f = stack.children[4];
        if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); }
      });
    }

    // cuprinsul ghidurilor: pe telefon e strâns; butonul îl deschide / închide
    var tocBtn = document.querySelector("[data-toc-toggle]");
    if (tocBtn) {
      tocBtn.addEventListener("click", function () {
        var nav = tocBtn.parentNode;
        var open = nav.classList.toggle("is-open");
        tocBtn.setAttribute("aria-expanded", String(open));
      });
    }

    var sum = document.querySelector("[data-plan-sum]");
    var picks = document.querySelectorAll("[data-plan-pick]");
    if (sum && picks.length) {
      var sName = sum.querySelector("[data-sum-name]"), sPrice = sum.querySelector("[data-sum-price]"), sPeriod = sum.querySelector("[data-sum-period]");
      var choose = function (btn) {
        for (var k = 0; k < picks.length; k++) {
          var on = picks[k] === btn;
          picks[k].setAttribute("aria-pressed", String(on));
          picks[k].parentNode.classList.toggle("is-selected", on);
        }
        var plan = btn.parentNode;
        var h = plan.querySelector("h3"), pr = plan.querySelector("[data-price]"), pe = plan.querySelector(".period");
        if (sName && h) sName.textContent = h.textContent.trim();
        if (sPrice && pr) sPrice.textContent = pr.textContent.trim();
        if (sPeriod && pe) sPeriod.textContent = pe.textContent.trim();
      };
      for (var p = 0; p < picks.length; p++) picks[p].addEventListener("click", function () { choose(this); });
      var cur = document.querySelector('[data-plan-pick][aria-pressed="true"]') || picks[0];
      choose(cur);
      var line = sName && sName.parentNode;
      if (line) line.setAttribute("aria-live", "polite"); // anunțăm doar schimbările făcute de om, nu și starea de pornire
    }
  }

  /* ---------- Tabelele din ghiduri: „glisează →” și umbra din dreapta doar când tabelul nu încape ---------- */
  function setupTables() {
    var boxes = document.querySelectorAll(".table-scroll");
    if (!boxes.length) return;
    function upd(box) {
      var w = box.querySelector(".table-wrap");
      if (!w) return;
      var over = w.scrollWidth > w.clientWidth + 2;
      box.classList.toggle("is-overflow", over);
      box.classList.toggle("is-end", over && w.scrollLeft + w.clientWidth >= w.scrollWidth - 4);
    }
    function all() { for (var i = 0; i < boxes.length; i++) upd(boxes[i]); }
    for (var i = 0; i < boxes.length; i++) {
      (function (box) {
        var w = box.querySelector(".table-wrap");
        if (w) w.addEventListener("scroll", function () { upd(box); }, { passive: true });
      })(boxes[i]);
    }
    var raf = 0;
    window.addEventListener("resize", function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; all(); }); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
    all();
  }

  function init() {
    window.__rtl = true; // semnal pentru scriptul mic din <head> (dacă lipsește, animațiile de apariție se opresc)
    setupPlay();
    setupLangChoice();
    setupPrices();
    setupTheme();
    setupMenu();
    setupScroll();
    setupReveal();
    setupHero();
    setupProgressLine();
    setupGallery();
    setupDemo();
    setupMobileUi();
    setupTables();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
