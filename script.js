/* Movie Box — core UI/state layer
   TMDB supplies the catalogue. This file owns UI state, LocalStorage,
   navigation, cards, collection actions and the shared movie renderer.
*/
(() => {
  "use strict";

  const STORAGE = {
    favorites: "movie-box:favorites",
    watchlist: "movie-box:watchlist",
    recentlyViewed: "movie-box:recently-viewed",
    progress: "movie-box:progress",
    ratings: "movie-box:ratings",
    preferences: "movie-box:preferences",
  };

  const safeRead = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  };

  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  };

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>'"]/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[c],
    );

  const state = {
    movies: [],
    favorites: safeRead(STORAGE.favorites, []),
    watchlist: safeRead(STORAGE.watchlist, []),
    recentlyViewed: safeRead(STORAGE.recentlyViewed, []),
    progress: safeRead(STORAGE.progress, {}),
    ratings: safeRead(STORAGE.ratings, {}),
    currentHero: [],
    heroIndex: 0,
    heroTimer: null,
  };

  window.state = state;

  function byId(id) {
    return state.movies.find((movie) => String(movie.id) === String(id));
  }

  function mergeMovies(movies) {
    const map = new Map(state.movies.map((movie) => [String(movie.id), movie]));
    movies.filter(Boolean).forEach((movie) => map.set(String(movie.id), movie));
    state.movies = [...map.values()];
    return state.movies;
  }

  function isFavorite(id) {
    return state.favorites.includes(id);
  }
  function isWatchlist(id) {
    return state.watchlist.includes(id);
  }

  function toast(message) {
    const stack = qs("#toastStack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function persistMovie(movie) {
    if (!movie?.id || movie.source !== "tmdb") return;
    try {
      localStorage.setItem(
        `movie-box:tmdb-movie:${movie.id}`,
        JSON.stringify(movie),
      );
    } catch (_) {}
  }

  function toggleCollection(type, id) {
    const isFav = type === "favorites";
    const list = isFav ? state.favorites : state.watchlist;
    const key = isFav ? STORAGE.favorites : STORAGE.watchlist;
    const index = list.indexOf(id);
    const movie = byId(id);
    if (movie) persistMovie(movie);

    if (index >= 0) {
      list.splice(index, 1);
      toast(isFav ? "Removed from favorites" : "Removed from watchlist");
    } else {
      list.push(id);
      toast(isFav ? "Added to favorites" : "Added to watchlist");
    }
    safeWrite(key, list);
    refreshActionButtons(id);
    if (document.body.dataset.page === "collection")
      window.renderCollectionPage?.();
  }

  function toggleFavorite(id) {
    toggleCollection("favorites", id);
  }
  function toggleWatchlist(id) {
    toggleCollection("watchlist", id);
  }

  function addRecentlyViewed(id) {
    state.recentlyViewed = [
      id,
      ...state.recentlyViewed.filter((x) => x !== id),
    ].slice(0, 12);
    safeWrite(STORAGE.recentlyViewed, state.recentlyViewed);
    const movie = byId(id);
    if (movie) persistMovie(movie);
  }

  function imageFor(movie, type = "poster") {
    if (type === "backdrop")
      return (
        movie?.backdrop || movie?.poster || "assets/images/placeholder.svg"
      );
    return movie?.poster || movie?.backdrop || "assets/images/placeholder.svg";
  }

  function movieCard(movie) {
    const fav = isFavorite(movie.id);
    const watch = isWatchlist(movie.id);
    const progress = Number(state.progress[movie.id] || 0);
    const rating = Number(movie.rating || 0).toFixed(1);
    return `<article class="card" data-movie-id="${escapeHtml(movie.id)}">
      <a href="movie.html?id=${encodeURIComponent(movie.id)}" aria-label="Open details for ${escapeHtml(movie.title)}">
        <div class="poster">
          <img src="${escapeHtml(imageFor(movie))}" alt="${escapeHtml(movie.title)} poster" loading="lazy"
               onerror="this.onerror=null;this.src='assets/images/placeholder.svg'">
          <div class="card-overlay">
            <div class="card-actions">
              <button class="icon-btn" type="button" aria-label="${fav ? "Remove from favorites" : "Add to favorites"}" data-action="favorite" data-id="${escapeHtml(movie.id)}">${fav ? "♥" : "♡"}</button>
              <button class="icon-btn" type="button" aria-label="${watch ? "Remove from watchlist" : "Add to watchlist"}" data-action="watchlist" data-id="${escapeHtml(movie.id)}">${watch ? "✓" : "+"}</button>
            </div>
          </div>
          ${progress > 0 ? `<div class="movie-progress"><span style="width:${Math.min(100, progress)}%"></span></div>` : ""}
        </div>
      </a>
      <div class="card-title">${escapeHtml(movie.title)}</div>
      <div class="card-meta"><span>${escapeHtml(movie.year)}</span><span>${movie.duration ? `${movie.duration}m` : "—"}</span><span class="rating">★ ${rating}</span></div>
    </article>`;
  }

  function bindCardActions(root = document) {
    qsa("[data-action]", root).forEach((button) => {
      if (button.dataset.bound) return;
      button.dataset.bound = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.dataset.id;
        if (button.dataset.action === "favorite") toggleFavorite(id);
        if (button.dataset.action === "watchlist") toggleWatchlist(id);
      });
    });
  }

  function renderGrid(container, movies) {
    if (!container) return;
    container.innerHTML = movies.length
      ? movies.map(movieCard).join("")
      : `<div class="empty" style="grid-column:1/-1"><h2>No movies found</h2><p>Try another search or change your filters.</p></div>`;
    bindCardActions(container);
  }

  function renderRail(selector, movies) {
    const el = typeof selector === "string" ? qs(selector) : selector;
    if (!el) return;
    el.innerHTML = movies.filter(Boolean).map(movieCard).join("");
    bindCardActions(el);
  }

  function refreshActionButtons(id) {
    qsa(`[data-id="${CSS.escape(String(id))}"][data-action]`).forEach(
      (button) => {
        const action = button.dataset.action;
        if (action === "favorite") {
          const active = isFavorite(id);
          button.textContent = active ? "♥" : "♡";
          button.setAttribute(
            "aria-label",
            active ? "Remove from favorites" : "Add to favorites",
          );
        }
        if (action === "watchlist") {
          const active = isWatchlist(id);
          button.textContent = active ? "✓" : "+";
          button.setAttribute(
            "aria-label",
            active ? "Remove from watchlist" : "Add to watchlist",
          );
        }
      },
    );
    const heroButton = qs("#heroWatchlist");
    if (heroButton?.dataset.id === String(id)) {
      heroButton.textContent = isWatchlist(id)
        ? "✓ In Watchlist"
        : "+ Watchlist";
    }
  }

  function recommendationScore(movie) {
    const saved = [
      ...state.favorites,
      ...state.watchlist,
      ...state.recentlyViewed,
    ]
      .map(byId)
      .filter(Boolean);
    const genres = new Set(saved.flatMap((item) => item.genres || []));
    let score = Number(movie.rating || 0);
    (movie.genres || []).forEach((g) => {
      if (genres.has(g)) score += 3;
    });
    if (
      saved.some((item) =>
        (item.keywords || []).some((k) => (movie.keywords || []).includes(k)),
      )
    )
      score += 2;
    return score;
  }

  function getRecommendations(excludeId) {
    return state.movies
      .filter((movie) => movie.id !== excludeId)
      .sort((a, b) => recommendationScore(b) - recommendationScore(a));
  }

  function renderHero() {
    const hero = qs("#hero");
    if (!hero) return;

    const featured =
      state.currentHero ||
      [...state.movies].sort(() => Math.random() - 0.5).slice(0, 4);

    state.currentHero = featured;

    const movie = featured[state.heroIndex % featured.length];

    const heroMedia = qs("#heroMedia");

    if (!heroMedia || !movie) return;

    const backdrop = imageFor(movie, "backdrop");

    /*
     * IMPORTANT:
     * Hero artwork is a CSS background image,
     * not an <img> element.
     */
    heroMedia.style.backgroundImage = `url("${backdrop}")`;

    heroMedia.style.backgroundSize = "cover";
    heroMedia.style.backgroundRepeat = "no-repeat";
    heroMedia.style.backgroundPosition = "72% center";

    /*
     * Prevent the browser from visually reusing
     * a previous background during slider transitions.
     */
    heroMedia.style.backgroundColor = "#050609";

    /* -----------------------------
     Hero content
     ----------------------------- */

    qs("#heroKicker").textContent = "Featured tonight";

    qs("#heroTitle").textContent = movie.title || "Untitled";

    qs("#heroTagline").textContent = movie.tagline || "";

    qs("#heroDesc").textContent = movie.description || "";

    /* -----------------------------
     Metadata
     ----------------------------- */

    qs("#heroMeta").innerHTML = `
    <span>${movie.year || "—"}</span>

    <span>
      ${movie.duration ? `${movie.duration} min` : "—"}
    </span>

    <span>
      ${(movie.genres || []).join(" · ") || "Movie"}
    </span>

    <span class="rating">
      ★ ${movie.rating ?? "—"}
    </span>

    ${movie.certification ? `<span>${movie.certification}</span>` : ""}
  `;

    /* -----------------------------
     Details button
     ----------------------------- */

    const detailsButton = qs("#heroDetails");

    if (detailsButton) {
      detailsButton.href = `movie.html?id=${encodeURIComponent(movie.id)}`;
    }

    /* -----------------------------
     Watchlist
     ----------------------------- */

    const watchlistButton = qs("#heroWatchlist");

    if (watchlistButton) {
      watchlistButton.dataset.id = movie.id;

      watchlistButton.textContent = isWatchlist(movie.id)
        ? "✓ In Watchlist"
        : "+ Watchlist";
    }

    /* -----------------------------
     Slider dots
     ----------------------------- */

    const dots = qs("#heroDots");

    if (dots) {
      dots.innerHTML = featured
        .map(
          (_, i) => `
          <button
            class="hero-dot ${i === state.heroIndex ? "active" : ""}"
            aria-label="Show featured movie ${i + 1}"
            data-hero-index="${i}">
          </button>
        `,
        )
        .join("");

      qsa("[data-hero-index]", dots).forEach((button) => {
        button.onclick = () => {
          state.heroIndex = Number(button.dataset.heroIndex);

          renderHero();
          restartHero();
        };
      });
    }

    /* -----------------------------
     Previous / Next
     ----------------------------- */

    const previous = qs("#heroPrev");

    if (previous) {
      previous.onclick = () => {
        state.heroIndex =
          (state.heroIndex - 1 + featured.length) % featured.length;

        renderHero();
        restartHero();
      };
    }

    const next = qs("#heroNext");

    if (next) {
      next.onclick = () => {
        state.heroIndex = (state.heroIndex + 1) % featured.length;

        renderHero();
        restartHero();
      };
    }

    /* -----------------------------
     Watchlist action
     ----------------------------- */

    if (watchlistButton) {
      watchlistButton.onclick = () => {
        toggleWatchlist(movie.id);

        watchlistButton.textContent = isWatchlist(movie.id)
          ? "✓ In Watchlist"
          : "+ Watchlist";
      };
    }
  }
  function restartHero() {
    clearInterval(state.heroTimer);
    if (state.currentHero.length > 1) {
      state.heroTimer = setInterval(() => {
        state.heroIndex = (state.heroIndex + 1) % state.currentHero.length;
        renderHero();
      }, 7000);
    }
  }

  function openTrailer(id) {
    const movie = byId(id);
    if (!movie) return;
    if (movie.trailer) {
      window.open(
        `https://www.youtube.com/watch?v=${encodeURIComponent(movie.trailer)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    toast("No trailer is available for this title.");
  }

  function closeModal() {
    qs("#modal")?.classList.remove("open");
    document.body.classList.remove("modal-open");
  }

  function setupModal() {
    const modal = qs("#modal");
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
    qs(".modal-close")?.addEventListener("click", closeModal);
  }

  function setupHeader() {
    const header = qs(".site-header");
    const toggle = qs("#mobileToggle");
    const panel = qs("#mobilePanel");
    window.addEventListener(
      "scroll",
      () => header?.classList.toggle("scrolled", scrollY > 30),
      { passive: true },
    );
    toggle?.addEventListener("click", () => panel?.classList.toggle("open"));
    qsa("#mobilePanel a").forEach((a) =>
      a.addEventListener("click", () => panel?.classList.remove("open")),
    );
  }

  function setupGlobalKeys() {
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      ) {
        event.preventDefault();
        (qs("#searchInput") || qs("#globalSearchInput"))?.focus();
      }
      if (event.key === "Escape") {
        closeModal();
        qs("#mobilePanel")?.classList.remove("open");
      }
    });
  }

  function renderCollectionPage() {
    const tabs = qsa("[data-collection-tab]");
    const grid = qs("#movieGrid");
    const count = qs("#collectionCount");
    const title = qs("#collectionTitle");
    const desc = qs("#collectionDesc");
    let active =
      qs("[data-collection-tab].active")?.dataset.collectionTab || "watchlist";

    const show = () => {
      const ids =
        active === "favorites"
          ? state.favorites
          : active === "recent"
            ? state.recentlyViewed
            : state.watchlist;
      const list = ids.map(byId).filter(Boolean);
      renderGrid(grid, list);
      if (count) count.textContent = `${list.length} saved`;
      if (title)
        title.textContent =
          active === "favorites"
            ? "Favorites"
            : active === "recent"
              ? "Recently Viewed"
              : "My Watchlist";
      if (desc)
        desc.textContent =
          active === "favorites"
            ? "Films you marked as favorites."
            : active === "recent"
              ? "Your latest movie trail."
              : "A private shelf for films you want to explore.";
    };

    tabs.forEach(
      (tab) =>
        (tab.onclick = () => {
          tabs.forEach((item) => item.classList.remove("active"));
          tab.classList.add("active");
          active = tab.dataset.collectionTab;
          show();
        }),
    );
    show();
  }

  function hydrateSavedMovies() {
    const ids = [
      ...new Set([
        ...state.favorites,
        ...state.watchlist,
        ...state.recentlyViewed,
      ]),
    ];
    const saved = [];
    ids.forEach((id) => {
      if (!String(id).startsWith("tmdb-")) return;
      try {
        const movie = JSON.parse(
          localStorage.getItem(`movie-box:tmdb-movie:${id}`) || "null",
        );
        if (movie) saved.push(movie);
      } catch (_) {}
    });
    mergeMovies(saved);
  }

  function setupMovieFallback() {
    const id = new URLSearchParams(location.search).get("id");
    const movie = byId(id);
    if (!movie && window.MB_TMDB?.loadDetails) window.MB_TMDB.loadDetails();
  }

  window.byId = byId;
  window.mergeMovies = mergeMovies;
  window.renderRail = renderRail;
  window.renderGrid = renderGrid;
  window.renderHero = renderHero;
  window.renderCollectionPage = renderCollectionPage;
  window.isFavorite = isFavorite;
  window.isWatchlist = isWatchlist;
  window.toggleFavorite = toggleFavorite;
  window.toggleWatchlist = toggleWatchlist;
  window.addRecentlyViewed = addRecentlyViewed;
  window.getRecommendations = getRecommendations;
  window.openTrailer = openTrailer;
  window.toast = toast;
  window.refreshActionButtons = refreshActionButtons;

  document.addEventListener("DOMContentLoaded", () => {
    setupHeader();
    setupGlobalKeys();
    setupModal();
    hydrateSavedMovies();

    const page = document.body.dataset.page;
    if (page === "movie") setupMovieFallback();
    if (page === "collection") renderCollectionPage();
  });
})();
