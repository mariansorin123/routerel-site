// Cloudflare Pages Function: limba implicită după țara vizitatorului.
//
// Reguli (simple și sigure pentru SEO):
// - Doar GET/HEAD, doar pagini HTML (Accept: text/html), doar intrările principale „/” (RO) și „/en/” (EN).
// - Roboții (Google, Bing, previzualizările de link din WhatsApp, Facebook etc.) nu sunt redirecționați niciodată,
//   ca ambele variante să rămână indexabile.
// - Navigarea din interiorul site-ului (Referer de pe routerel.app) nu e redirecționată niciodată.
// - Alegerea explicită câștigă: cookie-ul „lang=ro|en” (pus de comutatorul RO/EN) decide. Fără cookie decide țara:
//   România → română, restul → engleză.
// - Redirecționarea e 302 (temporară), cu „Vary: Cookie” și „Cache-Control: private, no-store”.
// - Fără bucle: pagina-țintă are deja limba dorită, deci nu mai redirecționează.
// Fișierul _routes.json din rădăcina site-ului face ca funcția să ruleze doar pentru „/” și „/en/”.

/** Paginile cu pereche în cealaltă limbă: calea → limba paginii și perechea ei. */
export const PAIRS = {
  "/": { lang: "ro", other: "/en/" },
  "/en/": { lang: "en", other: "/" },
};

/** Roboți de căutare și de previzualizare a linkurilor (nu primesc niciodată redirecționare). */
export const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|googlebot|google-inspectiontool|googleother|adsbot|mediapartners|bingbot|bingpreview|duckduckbot|duckassist|applebot|yandex|baiduspider|sogou|exabot|petalbot|seznambot|facebookexternalhit|facebookcatalog|meta-externalagent|twitterbot|linkedinbot|whatsapp|slackbot|slack-imgproxy|telegrambot|discordbot|skypeuripreview|pinterest|redditbot|embedly|quora link preview|vkshare|tumblr|bitlybot|iframely|chrome-lighthouse|lighthouse|pagespeed|gtmetrix|headlesschrome|validator|curl\/|wget\/|python-requests|httpclient|okhttp\/(?!.*mobile)/i;

export const SITE_HOSTS = ["routerel.app", "www.routerel.app"];

/** @param {string | null | undefined} ua */
export function isBot(ua) {
  if (!ua || !ua.trim()) return true; // fără user-agent: nu e un browser obișnuit
  return BOT_RE.test(ua);
}

/** @param {string | null | undefined} cookieHeader @returns {"ro" | "en" | null} */
export function langFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== "lang") continue;
    const v = part.slice(i + 1).trim().toLowerCase();
    if (v === "ro" || v === "en") return v;
  }
  return null;
}

/** @param {string | null | undefined} referer @param {string} host */
export function isInternalReferer(referer, host) {
  if (!referer) return false;
  try {
    const h = new URL(referer).hostname.toLowerCase();
    return h === host.toLowerCase() || SITE_HOSTS.includes(h) || h.endsWith(".routerel.app") || h.endsWith(".pages.dev");
  } catch {
    return false;
  }
}

/**
 * Decide dacă cererea trebuie redirecționată spre cealaltă limbă. Funcție pură (fără I/O), testată în tools/site/.
 * @param {{ url: string, method?: string, country?: string | null, cookie?: string | null,
 *           userAgent?: string | null, accept?: string | null, referer?: string | null }} req
 * @returns {{ status: 302, location: string } | null}
 */
export function decideRedirect({ url, method = "GET", country, cookie, userAgent, accept, referer }) {
  if (method !== "GET" && method !== "HEAD") return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const page = PAIRS[u.pathname];
  if (!page) return null;
  if (isBot(userAgent)) return null;
  if (!accept || !/text\/html/i.test(accept)) return null; // doar navigări de pagină, nu fetch-uri sau prefetch de resurse
  if (isInternalReferer(referer, u.hostname)) return null; // navigarea din site nu e redirecționată niciodată
  const chosen = langFromCookie(cookie);
  const wanted = chosen ?? (String(country || "").toUpperCase() === "RO" ? "ro" : "en");
  if (wanted === page.lang) return null;
  return { status: 302, location: new URL(page.other + u.search, u.origin).toString() };
}

/** @param {{ request: Request, next: () => Promise<Response> }} context */
export async function onRequest(context) {
  const { request } = context;
  const h = request.headers;
  // @ts-ignore: `cf` există doar pe Cloudflare
  const country = (request.cf && request.cf.country) || h.get("cf-ipcountry");
  const d = decideRedirect({
    url: request.url,
    method: request.method,
    country,
    cookie: h.get("cookie"),
    userAgent: h.get("user-agent"),
    accept: h.get("accept"),
    referer: h.get("referer"),
  });
  if (d) {
    return new Response(null, {
      status: d.status,
      headers: { Location: d.location, Vary: "Cookie", "Cache-Control": "private, no-store" },
    });
  }
  return context.next();
}
