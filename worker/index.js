// Site-ul routerel.app ca Cloudflare Worker cu fișiere statice: fișierele se servesc direct; doar „/” și „/en/” trec întâi
// pe aici, pentru limba implicită după țară (logica e în lang.js, aceeași ca la Pages Functions și testată în tools/site).
import { onRequest } from "./lang.js";

export default {
  /** @param {Request} request @param {{ ASSETS: { fetch: (r: Request) => Promise<Response> } }} env */
  async fetch(request, env) {
    return onRequest({ request, next: () => env.ASSETS.fetch(request) });
  },
};
