# Wedding Website

A basic HTML/CSS/JS wedding site for **June 8, 2027 at Antigua Gardens**,
backed by a small Node server with a MySQL database for RSVPs.

## Files

| File | Purpose |
|---|---|
| `index.html` | Main site (hero, details, schedule, RSVP form) |
| `styles.css` | All styling |
| `script.js` | RSVP form submit logic (posts to our own server) |
| `server.js` | Server: serves the site, saves RSVPs to MySQL, relays to Formspree, serves the live list |
| `rsvp-admin.html` | Hidden page for tracking RSVPs (not linked from the nav) |
| `rsvp-admin.js` | Logic for the hidden admin page (live list + local test data) |
| `.env.example` | Template for server config — copy to `.env` and fill in |
| `robots.txt` | Tells search engines not to index the hidden admin page |

## Before you launch: personalize it

- Adjust the **Schedule** section times in `index.html` if needed.
- Optional: add a couple photos, "Our Story" section, hotel/travel info.

## How RSVPs flow

1. A guest submits the form on `index.html` → it POSTs to our own
   `POST /api/rsvp` endpoint (`server.js`), not Formspree directly.
2. `server.js` saves the RSVP to **MySQL** — this is the real, permanent
   record.
3. `server.js` then best-effort relays a copy to your **Formspree**
   endpoint, purely so you get an email notification. If that relay
   fails for any reason, the RSVP is still safely saved in MySQL — you'd
   just miss the email for that one.
4. The hidden `rsvp-admin.html` page reads the guest list back out of
   MySQL via `GET /api/rsvps`, gated by a password.

This avoids needing a paid Formspree plan: Formspree's free tier can
*receive* submissions (which is all we ask of it now) — the tricky part
before, reading submissions back, is instead handled by our own database.

## Setup

### 1. MySQL

You need a MySQL server reachable from wherever `server.js` runs — either
installed locally, or a hosted instance (PlanetScale, Railway, AWS RDS,
your host's built-in MySQL, etc.).

Create the database (server.js creates the `rsvps` *table* inside it
automatically on startup — but not the database itself):

```sql
CREATE DATABASE wedding_rsvps;
```

Optionally, create a dedicated user instead of using root:

```sql
CREATE USER 'wedding_app'@'%' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON wedding_rsvps.* TO 'wedding_app'@'%';
FLUSH PRIVILEGES;
```

### 2. Formspree (notifications only)

Your form already has a Formspree endpoint:
`https://formspree.io/f/mqpkawzq`. The free plan is enough — we only
ever send it new submissions, never read from it.

### 3. Configure the server

Copy `.env.example` to `.env` and fill in:

```
PORT=3000
FORMSPREE_ENDPOINT=https://formspree.io/f/mqpkawzq
DB_HOST=localhost
DB_PORT=3306
DB_USER=wedding_app
DB_PASSWORD=choose-a-strong-password
DB_NAME=wedding_rsvps
ADMIN_PASSWORD=<a password only you and your partner know>
```

### 4. Run it

```bash
npm install
npm start
```

Check the startup log — it tells you clearly if `ADMIN_PASSWORD`,
the database, or `FORMSPREE_ENDPOINT` aren't configured yet, e.g.:

```
Connected to MySQL and ensured the `rsvps` table exists.
Wedding site running at http://localhost:3000
```

Then open `http://localhost:3000`, submit a test RSVP, and check:
- **MySQL** — `SELECT * FROM rsvps;` should show your test row.
- **Your email** — Formspree's notification (check spam, as you saw
  before).
- **`rsvp-admin.html`** — enter `ADMIN_PASSWORD` in the "Live guest
  list" box; your test RSVP should appear in the table.

Until everything above is configured, the site still works in a
degraded but honest way: submitting the form shows a clear error
(instead of silently failing) and saves a local-only copy in the
browser, and `rsvp-admin.html`'s live panel explains what's missing
rather than crashing.

### 5. Local test data (separate from the live list)

While testing, if `/api/rsvp` can't be reached (e.g. before MySQL is
configured), the form falls back to saving into the browser's
`localStorage`. The bottom section of `rsvp-admin.html` — "Local test
data" — shows those. It's per-browser and unrelated to the real MySQL
list above; useful only for local development.

## Hosting

This now needs somewhere that can run a persistent Node process *and*
reach a MySQL database — plain static hosts (GitHub Pages, Netlify's
free tier without add-ons) won't work. Options:
- **Render** / **Railway** / **Fly.io** — most of these also offer a
  managed MySQL add-on, so both the app and DB can live in one place.
  Set the `.env` values as environment variables in their dashboard
  (never commit `.env` — it's already in `.gitignore`).
- A small VPS running `npm start` behind a process manager (e.g. `pm2`),
  pointed at either a MySQL instance on the same box or a managed one.

## Security notes

- `rsvp-admin.html` isn't linked anywhere and is excluded from search
  indexing via `robots.txt` — that's obscurity, not real protection by
  itself. The actual protection is the `ADMIN_PASSWORD` check in
  `server.js`; pick a real password, and don't reuse one from elsewhere.
- The password travels as a bearer token over HTTP(S) — deploy behind
  HTTPS (Render/Railway/Fly.io all provide this by default) so it isn't
  sent in the clear.
- Don't expose your MySQL port publicly; keep it reachable only from
  `server.js` (same host, private network, or an allowlisted IP).
