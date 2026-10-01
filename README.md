# Movie Box

Ultra-premium 4-page cinematic movie discovery prototype.

## Stack
- HTML5
- CSS3
- Vanilla JavaScript
- LocalStorage
- Local SVG artwork

## Pages
- `index.html` — Home / cinematic discovery
- `discover.html` — search, filters, sorting
- `movie.html?id=movie-id` — movie details
- `watchlist.html` — watchlist, favorites, recently viewed

## Data architecture
`MOVIES` is the local dataset in `script.js`. The UI reads from this data layer and keeps persistence in LocalStorage.

## Important
This project intentionally does not fake authentication, payments, streaming, AI, or an external movie API. Trailer UI explains when a legitimate trailer URL has not been configured.

## Run
Open the folder with VS Code and use a local static server (recommended), such as VS Code Live Server. The site is also compatible with GitHub Pages because it is a static project.

## Future API adapter
The data layer can later be replaced with real functions such as:
- `getMovies()`
- `getMovieById()`
- `searchMovies()`
- `filterMovies()`
- `sortMovies()`
- `getRecommendations()`

Keep API/data logic separate from rendering.

## Random cinematic imagery
Movie cards now use a rotating set of cinematic remote images for visual variety. Generated local SVG artwork remains available as a fallback, so the interface does not depend entirely on the external image provider.

## Production reliability upgrade

- 50 original local cinematic PNG assets in `assets/images/cinematic/`
- Local JSON manifest at `assets/cinematic-images.json`
- No remote image service is required for the cinematic image system
- Random hero backgrounds, hover variations, and preloading use local files
- Suitable for GitHub Pages and offline testing

## Advanced functionality upgrade

The app now includes a richer local-first discovery layer:

- Personalized “Because You Like These” recommendations based on local activity
- Similar-title recommendations on movie detail pages
- Continue Watching based on locally stored progress
- Manual watch-progress slider and quick progress controls
- Watchlist and Favorites actions directly on movie cards
- Recently Viewed tracking
- Genre quick-filter chips on Discover
- “Surprise Me” random movie action
- Collection statistics and collection switching
- Toast feedback for collection/progress actions
- Quick navigation dock for Explore, Watchlist and Surprise Me
- LocalStorage-backed activity and preferences
- No login, payment, fake streaming, or fake trailer service was added


## TMDB Live Setup

1. Open `config.js`.
2. Paste your TMDB **API Read Access Token** into `tmdbAccessToken`.
3. Save the file and refresh the site.

The project uses TMDB v3 endpoints with the Read Access Token as a Bearer token. The Home page is intentionally TMDB-only: it does not fall back to the old demo movie catalogue.

### Security note
`config.js` is ignored by Git via `.gitignore`. A browser-based GitHub Pages deployment cannot keep a TMDB credential secret from visitors, so a production public deployment should use a small backend/proxy rather than exposing a token in client-side JavaScript.

### TMDB attribution
This product uses the TMDB API but is not endorsed or certified by TMDB.
