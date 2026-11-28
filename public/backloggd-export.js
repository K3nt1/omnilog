// Export Backloggd → Omnilog.
// À coller dans la console du navigateur (F12, onglet Console) sur une page de backloggd.com où tu es connecté.
// Le script lit tes listes (Played, Playing, Backlog, Wishlist), tes jeux masterisés et ton journal (sessions),
// puis télécharge un fichier « backloggd-<pseudo>.json » à importer dans Omnilog (Importer → Backloggd).
// Il ne fait que lire des pages de backloggd.com avec ta session : rien n'est envoyé ailleurs, rien n'est modifié.
(async () => {
  const PAUSE_MS = 400; // entre deux pages, pour ne pas surcharger Backloggd
  const MAX_PAGES = 300;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = (...args) => console.log("%c[Omnilog]", "color:#38bdf8;font-weight:bold", ...args);

  if (!/backloggd\.com$/.test(location.hostname)) {
    console.error("[Omnilog] Ouvre d'abord une page de backloggd.com, puis colle le script dans sa console.");
    return;
  }
  // Pseudo : celui du profil ouvert, sinon celui du menu « Profile » (toi).
  const fromPath = location.pathname.match(/^\/u\/([^/]+)/)?.[1];
  const fromMenu = document.querySelector('a.dropdown-item[href^="/u/"]')?.getAttribute("href")?.match(/^\/u\/([^/]+)/)?.[1];
  const user = fromPath ?? fromMenu ?? prompt("Ton pseudo Backloggd ?");
  if (!user) return;
  const base = `/u/${encodeURIComponent(user)}`;

  const decode = (s) =>
    s
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

  async function get(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, { credentials: "include", headers: { Accept: "text/html, text/vnd.turbo-stream.html" } });
      if (res.ok) return res.text();
      if (res.status === 404) return "";
      await sleep(2000 * (attempt + 1)); // 429, 5xx : on attend un peu
    }
    throw new Error(`Page illisible : ${url}`);
  }

  /** Jeux d'une page de liste : identifiant, slug (celui d'IGDB), titre et état de ton log. */
  function parseGames(html) {
    const games = new Map();
    // Chaque carte de jeu commence à game_id="…" : on la lit jusqu'à la suivante (titre et jaquette de ce jeu-là).
    for (const part of html.split('game_id="').slice(1)) {
      const m = part.match(/^(\d+)"[^>]*>\s*<a href="\/games\/([^/"]+)\/"/);
      if (!m) continue;
      const img = part.match(/<img[^>]*>/)?.[0] ?? "";
      // Titre : texte alternatif de la jaquette, sinon le titre écrit à la place d'une jaquette absente.
      const title = img.match(/alt="([^"]*)"/)?.[1] ?? part.match(/game-text-centered[^>]*>\s*([^<]+?)\s*</)?.[1] ?? "";
      // Jaquette : utile si IGDB ne fournit plus le jeu (il est alors ajouté à la main avec elle).
      const src = decode(img.match(/data-src="([^"]+)"/)?.[1] ?? img.match(/\ssrc="([^"]+)"/)?.[1] ?? "");
      games.set(m[1], { id: m[1], slug: decode(m[2]), title: decode(title), cover: src.startsWith("https://") ? src : null });
    }
    const preloaded = /id="preloaded-log-(\d+)">\s*<div([^>]*)>/g;
    for (const m of html.matchAll(preloaded)) {
      const game = games.get(m[1]);
      if (!game) continue;
      const attr = (name) => decode(m[2].match(new RegExp(`data-${name}="([^"]*)"`))?.[1] ?? "");
      game.played = attr("is-play") || null;
      game.playing = attr("is-playing") || null;
      game.backlog = attr("is-backlog") || null;
      game.wishlist = attr("is-wishlist") || null;
      game.rating = Number(attr("rating")) || null; // demi-étoiles : 1 à 10
      game.statusTitle = attr("status-title") || null; // Completed, Played, Retired, Shelved, Abandoned
    }
    return [...games.values()];
  }

  /** Toutes les pages d'une liste : la page suivante est chargée par un cadre Turbo (… ?format=turbo_stream&page=2). */
  async function readList(path, label) {
    const all = new Map();
    let url = path;
    for (let page = 1; url && page <= MAX_PAGES; page++) {
      const html = await get(url);
      const games = parseGames(html);
      let added = 0;
      for (const g of games) {
        if (all.has(g.id)) continue;
        all.set(g.id, g);
        added++;
      }
      log(`${label} : page ${page}, ${all.size} jeux`);
      const next = html.match(/id="games_pagination"[^>]*src="([^"]+)"/)?.[1];
      url = added > 0 && next ? decode(next) : null;
      await sleep(PAUSE_MS);
    }
    return all;
  }

  /** Journal : une ligne par session (jour, jeu, durée). Le mois est en titre, le jour répété est masqué mais présent. */
  function parseJournal(html, state) {
    const sessions = [];
    const months = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
    for (const block of html.split('class="row journal_entry"').slice(1)) {
      const month = block.match(/<h4>\s*([A-Za-z]+),\s*(\d{4})\s*<\/h4>/);
      if (month) state.month = `${month[2]}-${String(months[month[1]]).padStart(2, "0")}`;
      const day = block.match(/class="date-day[^"]*">\s*(\d{1,2})\s*</)?.[1];
      const slug = block.match(/href="\/games\/([^/"]+)\/"/)?.[1];
      const id = block.match(/game_id="(\d+)"/)?.[1] ?? null;
      if (!state.month || !day || !slug) continue;
      const time = block.match(/fa-stopwatch"><\/i>\s*(\d+)h\s*(\d+)m/);
      sessions.push({
        id,
        slug: decode(slug),
        date: `${state.month}-${day.padStart(2, "0")}`,
        minutes: time ? Number(time[1]) * 60 + Number(time[2]) || null : null,
      });
    }
    return sessions;
  }

  async function readJournal() {
    const first = await get(`${base}/journal/dates/`);
    const last = Math.max(1, ...[...first.matchAll(/journal(?:\/dates)?\/?\?page=(\d+)/g)].map((m) => Number(m[1])));
    const state = { month: null };
    const sessions = parseJournal(first, state);
    log(`Journal : page 1 / ${last}, ${sessions.length} sessions`);
    for (let page = 2; page <= Math.min(last, MAX_PAGES); page++) {
      await sleep(PAUSE_MS);
      sessions.push(...parseJournal(await get(`${base}/journal?page=${page}`), state));
      log(`Journal : page ${page} / ${last}, ${sessions.length} sessions`);
    }
    return sessions;
  }

  try {
    log(`Export de ${user}… (quelques minutes, laisse l'onglet ouvert)`);
    const games = new Map();
    for (const list of ["played", "playing", "backlog", "wishlist"]) {
      for (const [id, g] of await readList(`${base}/games/${list}/`, list)) games.set(id, { ...games.get(id), ...g });
    }
    const mastered = await readList(`${base}/games/played/by/title:asc/type:played;mastered:true/`, "mastered");
    for (const id of mastered.keys()) if (games.has(id)) games.get(id).mastered = true;
    const sessions = await readJournal();

    const data = { format: "omnilog-backloggd", version: 1, user, exportedAt: new Date().toISOString(), games: [...games.values()], sessions };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `backloggd-${user}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    log(`Terminé : ${data.games.length} jeux, ${mastered.size} masterisés, ${sessions.length} sessions. Fichier téléchargé : ${link.download}`);
  } catch (error) {
    console.error("[Omnilog] Export interrompu :", error);
  }
})();
