/* Movie Box — TMDB integration
   Real TMDB catalogue only. No fake/local movie fallback is rendered.
*/
(() => {
  'use strict';

  const CONFIG = window.MOVIE_BOX_CONFIG || {};
  const TOKEN = String(CONFIG.tmdbAccessToken || '').trim();
  const API = 'https://api.themoviedb.org/3';
  const IMG = 'https://image.tmdb.org/t/p/';
  const CACHE_TTL = 30 * 60 * 1000;
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const cacheKey = key => `movie-box:tmdb:${key}`;
  const genreMap = new Map();

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(cacheKey(key));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Date.now() - parsed.time < CACHE_TTL ? parsed.value : null;
    } catch (_) { return null; }
  }

  function cacheSet(key, value) {
    try { localStorage.setItem(cacheKey(key), JSON.stringify({ time: Date.now(), value })); } catch (_) {}
  }

  function setStatus(text, type = 'live') {
    let badge = qs('#tmdbStatus');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'tmdbStatus';
      badge.className = 'tmdb-status';
      document.body.appendChild(badge);
    }
    badge.dataset.type = type;
    badge.textContent = text;
  }

  function tmdbImg(path, size = 'w500') {
    return path ? `${IMG}${size}${path}` : '';
  }

  async function request(path, params = {}) {
    if (!TOKEN || TOKEN === 'YOUR_TMDB_READ_ACCESS_TOKEN') {
      throw new Error('TMDB Read Access Token is not configured.');
    }
    const url = new URL(API + path);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    const cacheId = url.pathname + '?' + url.searchParams.toString();
    const cached = cacheGet(cacheId);
    if (cached) return cached;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${TOKEN}`
      }
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.status_message || ''; } catch (_) {}
      throw new Error(`TMDB ${response.status}${detail ? ` — ${detail}` : ''}`);
    }
    const data = await response.json();
    cacheSet(cacheId, data);
    return data;
  }

  function yearOf(date) {
    return date ? Number(String(date).slice(0, 4)) || '—' : '—';
  }

  function certificationFrom(raw) {
    const results = raw.release_dates?.results || [];
    const us = results.find(item => item.iso_3166_1 === 'US');
    const certification = us?.release_dates?.find(item => item.certification)?.certification;
    return certification || '—';
  }

  function normalize(raw) {
    const movie = {
      id: `tmdb-${raw.id}`,
      tmdbId: raw.id,
      source: 'tmdb',
      title: raw.title || raw.original_title || 'Untitled',
      year: yearOf(raw.release_date),
      rating: Number(raw.vote_average || 0),
      duration: Number(raw.runtime || 0),
      genres: (raw.genres || []).map(g => g.name).filter(Boolean),
      language: raw.original_language || '—',
      certification: certificationFrom(raw),
      tagline: raw.tagline || '',
      description: raw.overview || 'No synopsis is available for this title.',
      director: raw.credits?.crew?.find(person => person.job === 'Director')?.name || '—',
      cast: (raw.credits?.cast || []).slice(0, 8).map(person => person.name).filter(Boolean),
      keywords: (raw.keywords?.keywords || []).slice(0, 12).map(keyword => keyword.name).filter(Boolean),
      poster: tmdbImg(raw.poster_path, 'w500'),
      backdrop: tmdbImg(raw.backdrop_path, 'w1280'),
      trailer: raw.videos?.results?.find(video => video.site === 'YouTube' && ['Trailer','Teaser'].includes(video.type))?.key || '',
      popularity: Number(raw.popularity || 0),
      status: raw.status || '',
      originalTitle: raw.original_title || ''
    };
    movie.genres = movie.genres.length
      ? movie.genres
      : (raw.genre_ids || []).map(id => genreMap.get(id)).filter(Boolean);
    return movie;
  }

  function merge(movies) {
    window.mergeMovies?.(movies);
    movies.forEach(movie => {
      try { localStorage.setItem(`movie-box:tmdb-movie:${movie.id}`, JSON.stringify(movie)); } catch (_) {}
    });
  }

  function card(movie) {
    const favorite = window.isFavorite?.(movie.id) || false;
    const watchlist = window.isWatchlist?.(movie.id) || false;
    const rating = Number(movie.rating || 0).toFixed(1);
    return `<article class="card" data-movie-id="${esc(movie.id)}">
      <a href="movie.html?id=${encodeURIComponent(movie.id)}" aria-label="Open details for ${esc(movie.title)}">
        <div class="poster">
          <img src="${esc(movie.poster || movie.backdrop)}" alt="${esc(movie.title)} poster" loading="lazy" onerror="this.onerror=null;this.src='assets/images/placeholder.svg'">
          <div class="card-overlay"><div class="card-actions">
            <button class="icon-btn" type="button" data-tmdb-action="favorite" data-id="${esc(movie.id)}" aria-label="${favorite?'Remove from favorites':'Add to favorites'}">${favorite?'♥':'♡'}</button>
            <button class="icon-btn" type="button" data-tmdb-action="watchlist" data-id="${esc(movie.id)}" aria-label="${watchlist?'Remove from watchlist':'Add to watchlist'}">${watchlist?'✓':'+'}</button>
          </div></div>
        </div>
      </a>
      <div class="card-title">${esc(movie.title)}</div>
      <div class="card-meta"><span>${esc(movie.year)}</span><span>${movie.duration ? `${movie.duration}m` : '—'}</span><span class="rating">★ ${rating}</span></div>
    </article>`;
  }

  function render(selector, movies) {
    const el = typeof selector === 'string' ? qs(selector) : selector;
    if (!el) return;
    el.innerHTML = movies.filter(movie => movie.poster || movie.backdrop).map(card).join('');
    bindActions(el);
  }

  function bindActions(root = document) {
    qsa('[data-tmdb-action]', root).forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.dataset.id;
        const movie = window.byId?.(id);
        if (movie) {
          try { localStorage.setItem(`movie-box:tmdb-movie:${id}`, JSON.stringify(movie)); } catch (_) {}
        }
        if (button.dataset.tmdbAction === 'favorite') window.toggleFavorite?.(id);
        if (button.dataset.tmdbAction === 'watchlist') window.toggleWatchlist?.(id);
        const active = button.dataset.tmdbAction === 'favorite' ? window.isFavorite?.(id) : window.isWatchlist?.(id);
        button.textContent = button.dataset.tmdbAction === 'favorite' ? (active ? '♥' : '♡') : (active ? '✓' : '+');
      });
    });
  }

  async function loadGenres() {
    if (genreMap.size) return;
    const data = await request('/genre/movie/list', { language: 'en-US' });
    (data.genres || []).forEach(genre => genreMap.set(genre.id, genre.name));
  }

  async function discover(params = {}) {
    const data = await request('/discover/movie', {
      language: 'en-US',
      include_adult: 'false',
      include_video: 'false',
      page: params.page || 1,
      sort_by: params.sort_by || 'popularity.desc',
      with_genres: params.with_genres,
      primary_release_year: params.primary_release_year,
      'vote_average.gte': params['vote_average.gte'],
      with_original_language: params.with_original_language,
      'primary_release_date.lte': params['primary_release_date.lte']
    });
    const movies = (data.results || []).map(normalize).filter(movie => movie.poster || movie.backdrop);
    return { movies, totalPages: data.total_pages || 1, totalResults: data.total_results || 0 };
  }

  async function loadHome() {
    if (!TOKEN || TOKEN === 'YOUR_TMDB_READ_ACCESS_TOKEN') {
      setStatus('TMDB SETUP REQUIRED · Add your token in config.js', 'error');
      showHomeError('Add your TMDB Read Access Token to config.js, then refresh.');
      return;
    }
    setStatus('TMDB LIVE · Loading real movies…');
    try {
      await loadGenres();
      const [trending, popular, topRated, nowPlaying] = await Promise.all([
        request('/trending/movie/week', { language: 'en-US' }),
        request('/movie/popular', { language: 'en-US', page: 1 }),
        request('/movie/top_rated', { language: 'en-US', page: 1 }),
        request('/movie/now_playing', { language: 'en-US', page: 1 })
      ]);

      const trendingMovies = (trending.results || []).map(normalize).filter(movie => movie.poster || movie.backdrop);
      const popularMovies = (popular.results || []).map(normalize).filter(movie => movie.poster || movie.backdrop);
      const topMovies = (topRated.results || []).map(normalize).filter(movie => movie.poster || movie.backdrop);
      const newMovies = (nowPlaying.results || []).map(normalize).filter(movie => movie.poster || movie.backdrop);
      const all = [...trendingMovies, ...popularMovies, ...topMovies, ...newMovies];
      merge([...new Map(all.map(movie => [movie.id, movie])).values()]);

      window.state.currentHero = trendingMovies.slice(0, 5);
      window.state.heroIndex = 0;
      window.renderHero?.();
      window.renderHero && setTimeout(() => window.renderHero(), 0);

      render('[data-home-rail="trending"]', trendingMovies.slice(0, 12));
      render('[data-home-rail="popular"]', popularMovies.slice(0, 12));
      render('[data-home-rail="top"]', topMovies.slice(0, 12));
      render('[data-home-rail="new"]', newMovies.slice(0, 12));

      const savedGenres = [...new Set([...window.state.favorites, ...window.state.watchlist, ...window.state.recentlyViewed])]
        .map(id => window.byId?.(id)).filter(Boolean).flatMap(movie => movie.genres || []);
      const recommendations = [...popularMovies, ...topMovies]
        .sort((a, b) => (window.getRecommendations?.(b.id)?.length || 0) - (window.getRecommendations?.(a.id)?.length || 0));
      const rec = savedGenres.length
        ? [...new Set([...popularMovies, ...topMovies])].sort((a,b) => {
            const as = (a.genres || []).filter(g => savedGenres.includes(g)).length;
            const bs = (b.genres || []).filter(g => savedGenres.includes(g)).length;
            return bs - as || b.rating - a.rating;
          })
        : recommendations;
      render('[data-home-rail="rec"]', rec.slice(0, 12));

      const genreEl = qs('#genreList');
      if (genreEl) {
        genreEl.innerHTML = [...genreMap.values()].sort().slice(0, 18)
          .map(name => `<a class="genre-pill" href="discover.html?genre=${encodeURIComponent(name)}">${esc(name)}</a>`).join('');
      }
      setStatus('TMDB LIVE · Real movie catalogue connected');
      window.renderHero?.();
      if (window.state.currentHero.length > 1) {
        clearInterval(window.state.heroTimer);
        window.state.heroTimer = setInterval(() => {
          window.state.heroIndex = (window.state.heroIndex + 1) % window.state.currentHero.length;
          window.renderHero?.();
        }, 7000);
      }
    } catch (error) {
      console.error('TMDB Home Error:', error);
      setStatus(`TMDB ERROR · ${error.message}`, 'error');
      showHomeError('TMDB could not load the real movie catalogue. Check config.js and your network connection.');
    }
  }

  function showHomeError(message) {
    const title = qs('#heroTitle');
    const desc = qs('#heroDesc');
    if (title) title.textContent = 'TMDB unavailable';
    if (desc) desc.textContent = message;
    ['[data-home-rail="trending"]','[data-home-rail="popular"]','[data-home-rail="top"]','[data-home-rail="new"]','[data-home-rail="rec"]'].forEach(selector => {
      const el = qs(selector);
      if (el) el.innerHTML = `<div class="empty" style="grid-column:1/-1"><h2>Real movies could not be loaded</h2><p>${esc(message)}</p></div>`;
    });
  }

  async function loadDiscover() {
    if (!TOKEN || TOKEN === 'YOUR_TMDB_READ_ACCESS_TOKEN') {
      setStatus('TMDB SETUP REQUIRED · Add your token in config.js', 'error');
      const grid = qs('#discoverGrid');
      if (grid) grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h2>TMDB setup required</h2><p>Add your Read Access Token to config.js and refresh.</p></div>`;
      return;
    }

    const input = qs('#searchInput');
    const grid = qs('#discoverGrid');
    const count = qs('#resultCount');
    const loadMore = qs('#loadMore');
    const params = new URLSearchParams(location.search);
    const genreName = params.get('genre') || '';
    if (input && params.get('q')) input.value = params.get('q');

    await loadGenres();
    const genreSelect = qs('#genreFilter');
    if (genreName && genreSelect) {
      const option = [...genreSelect.options].find(opt => opt.value.toLowerCase() === genreName.toLowerCase());
      if (option) genreSelect.value = option.value;
    }

    let page = 1;
    let totalPages = 1;
    let current = [];
    let timer;

    const languageMap = { English: 'en', French: 'fr', Spanish: 'es', Korean: 'ko', Japanese: 'ja' };
    const sortMap = {
      popularity: 'popularity.desc', rating: 'vote_average.desc', newest: 'primary_release_date.desc',
      oldest: 'primary_release_date.asc', az: 'title.asc', za: 'title.desc'
    };

    async function run(reset = true) {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        grid.innerHTML = '<div class="loading-state" style="grid-column:1/-1">Loading real TMDB movies…</div>';
        try {
          const query = input?.value.trim() || '';
          const genre = qs('#genreFilter')?.value || '';
          const genreId = [...genreMap.entries()].find(([, name]) => name.toLowerCase() === genre.toLowerCase())?.[0] || '';
          const year = qs('#yearFilter')?.value || '';
          const rating = qs('#ratingFilter')?.value || '';
          const language = languageMap[qs('#languageFilter')?.value || ''] || '';

          let result;
          if (query) {
            result = await request('/search/movie', { query, language: 'en-US', include_adult: 'false', page });
            totalPages = result.total_pages || 1;
            result = {
              movies: (result.results || []).map(normalize).filter(movie => movie.poster || movie.backdrop),
              totalResults: result.total_results || 0
            };
          } else {
            result = await discover({
              page,
              with_genres: genreId,
              primary_release_year: year,
              'vote_average.gte': rating,
              with_original_language: language,
              sort_by: sortMap[qs('#sortFilter')?.value || 'popularity'] || 'popularity.desc'
            });
            totalPages = result.totalPages;
          }

          let movies = result.movies;
          const runtime = qs('#runtimeFilter')?.value || '';
          if (runtime) {
            movies = movies.filter(movie => {
              if (!movie.duration) return false;
              if (runtime === 'short') return movie.duration < 110;
              if (runtime === 'medium') return movie.duration >= 110 && movie.duration <= 130;
              return movie.duration > 130;
            });
          }

          if (reset) current = movies; else current = [...current, ...movies];
          merge(current);
          render(grid, current);
          if (count) count.textContent = `${result.totalResults ?? current.length} TMDB result${(result.totalResults ?? current.length) === 1 ? '' : 's'}`;
          if (loadMore) loadMore.hidden = page >= totalPages;
          setStatus('TMDB LIVE · Discovery ready');
        } catch (error) {
          console.error('TMDB Discover Error:', error);
          grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h2>TMDB could not load</h2><p>${esc(error.message)}</p></div>`;
          setStatus(`TMDB ERROR · ${error.message}`, 'error');
        }
      }, 220);
    }

    input?.addEventListener('input', () => { page = 1; run(true); });
    qsa('#genreFilter,#yearFilter,#ratingFilter,#runtimeFilter,#languageFilter,#sortFilter').forEach(el => el.addEventListener('change', () => { page = 1; run(true); }));
    qs('#resetFilters')?.addEventListener('click', () => {
      if (input) input.value = '';
      qsa('.filter-bar select').forEach(select => select.value = '');
      if (qs('#sortFilter')) qs('#sortFilter').value = 'popularity';
      page = 1;
      run(true);
    });
    loadMore?.addEventListener('click', () => { if (page < totalPages) { page += 1; run(false); } });
    run(true);
  }

  async function loadDetails() {
    const rawId = new URLSearchParams(location.search).get('id') || '';
    const tmdbId = rawId.replace(/^tmdb-/, '');
    if (!TOKEN || TOKEN === 'YOUR_TMDB_READ_ACCESS_TOKEN' || !/^\d+$/.test(tmdbId)) return;

    setStatus('TMDB LIVE · Loading movie details…');
    try {
      const raw = await request(`/movie/${tmdbId}`, {
        language: 'en-US',
        append_to_response: 'credits,videos,keywords,recommendations,similar,release_dates'
      });
      const movie = normalize(raw);
      window.mergeMovies?.([movie]);
      try { localStorage.setItem(`movie-box:tmdb-movie:${movie.id}`, JSON.stringify(movie)); } catch (_) {}
      window.addRecentlyViewed?.(movie.id);

      const bg = qs('#detailsBg');
      const poster = qs('#detailsPoster');
      if (bg) bg.style.backgroundImage = `url("${movie.backdrop || movie.poster}")`;
      if (poster) {
        poster.src = movie.poster || movie.backdrop || 'assets/images/placeholder.svg';
        poster.alt = `${movie.title} poster`;
      }
      const setText = (selector, value) => { const el = qs(selector); if (el) el.textContent = value; };
      setText('#detailsTitle', movie.title);
      setText('#detailsTagline', movie.tagline);
      setText('#detailsDesc', movie.description);
      const meta = qs('#detailsMeta');
      if (meta) meta.innerHTML = `<span>${esc(movie.year)}</span><span>${movie.duration ? `${movie.duration} min` : '—'}</span><span>${esc((movie.genres || []).join(' · '))}</span><span class="rating">★ ${movie.rating.toFixed(1)}</span><span>${esc(movie.language)}</span>`;
      setText('#director', movie.director);
      setText('#cast', movie.cast.join(', ') || '—');
      setText('#language', movie.language);
      setText('#certification', movie.certification);
      setText('#keywords', movie.keywords.join(', ') || '—');

      const favorite = qs('#favoriteBtn');
      const watchlist = qs('#watchlistBtn');
      if (favorite) {
        favorite.textContent = window.isFavorite?.(movie.id) ? '♥ Favorited' : '♡ Favorite';
        favorite.onclick = () => { window.toggleFavorite?.(movie.id); favorite.textContent = window.isFavorite?.(movie.id) ? '♥ Favorited' : '♡ Favorite'; };
      }
      if (watchlist) {
        watchlist.textContent = window.isWatchlist?.(movie.id) ? '✓ In Watchlist' : '+ Watchlist';
        watchlist.onclick = () => { window.toggleWatchlist?.(movie.id); watchlist.textContent = window.isWatchlist?.(movie.id) ? '✓ In Watchlist' : '+ Watchlist'; };
      }
      const trailer = qs('#trailerBtn');
      if (trailer) {
        trailer.disabled = !movie.trailer;
        trailer.textContent = movie.trailer ? '▶ Trailer' : 'Trailer unavailable';
        trailer.onclick = () => movie.trailer && window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(movie.trailer)}`, '_blank', 'noopener,noreferrer');
      }

      const similar = (raw.similar?.results || []).map(normalize).filter(item => item.poster || item.backdrop);
      const recommendations = (raw.recommendations?.results || []).map(normalize).filter(item => item.poster || item.backdrop);
      window.mergeMovies?.([...similar, ...recommendations]);
      render('#similarRail', similar.slice(0, 10));
      render('#recommendedRail', recommendations.slice(0, 10));
      setStatus('TMDB LIVE · Real movie details connected');
    } catch (error) {
      console.error('TMDB Details Error:', error);
      setStatus(`TMDB ERROR · ${error.message}`, 'error');
      const details = qs('#movieDetails');
      if (details) details.innerHTML = `<div class="empty"><h2>Movie details unavailable</h2><p>${esc(error.message)}</p><a class="btn primary" href="discover.html">Back to Discover</a></div>`;
    }
  }

  window.MB_TMDB = { request, normalize, loadHome, loadDiscover, loadDetails, tmdbImg };

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body?.dataset?.page;
    if (page === 'home') loadHome();
    if (page === 'discover') loadDiscover();
    if (page === 'movie') loadDetails();
  });
})();
