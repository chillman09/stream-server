# StreamFlix

A Netflix-style video-on-demand app on Cloudflare Workers.

- **Frontend** (`public/`): static HTML, Tailwind (CDN), Lucide icons, custom video player (HLS supported).
- **API** (`src/worker.js`): catalog CRUD, JWT admin auth (httpOnly cookie), optional R2 range streaming.
- **Storage**: Workers KV for the catalog, R2 for your own video files (optional).
- **CI/CD**: GitHub Actions tests every push/PR and deploys `main` to Workers.

```
public/            index.html, app.js, styles.css, admin/{login,dashboard}.html
src/worker.js      API + R2 streaming
tests/             node:test suite
wrangler.toml      bindings + staging env
.github/workflows/deploy.yml
```

## 1. Create the repo
```bash
git init && git add . && git commit -m "Initial commit"
gh repo create streamflix --private --source=. --push     # or create it on github.com and push
```

## 2. Local development
```bash
npm install
cp .dev.vars.example .dev.vars      # set ADMIN_PASSWORD and JWT_SECRET
npm run dev                         # wrangler dev (Miniflare-based local KV/R2), http://localhost:8787
npm test
```
Local KV works without an ID. The catalog seeds itself with four sample titles on first load.
Admin: http://localhost:8787/admin/login (username `admin` unless you change `ADMIN_USERNAME`).

## 3. Cloudflare resources (once)
```bash
npx wrangler login
npx wrangler kv namespace create MEDIA_KV     # paste the id into wrangler.toml
npx wrangler r2 bucket create streamflix-media
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put JWT_SECRET            # e.g. output of: openssl rand -hex 32
```
Upload your own video: `npx wrangler r2 object put streamflix-media/movie.mp4 --file movie.mp4`,
then use `/stream/movie.mp4` as the Video URL in the dashboard.

## 4. GitHub secrets (Settings > Secrets and variables > Actions)
| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare > My Profile > API Tokens > "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard > Workers & Pages sidebar |
| `ADMIN_PASSWORD` | your choice (long and unique) |
| `JWT_SECRET` | random 32+ byte string |

Push to `main` and the workflow tests, then deploys. Staging: `npm run deploy:staging`.

## Notes before going to production
- Tailwind loads from its CDN for simplicity. For production, compile it with the Tailwind CLI and serve the CSS from `public/`.
- Add a rate-limit rule on `/api/admin/login` (Cloudflare Security > WAF > Rate limiting).
- KV is eventually consistent, so catalog edits can take up to ~60s to appear everywhere. Move to D1 if you need strict consistency or large catalogs (KV listing caps at 1,000 items per call).
- The seed titles use Google's public sample videos. Replace them with content you have rights to.
