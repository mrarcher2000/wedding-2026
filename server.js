// ---------------------------------------------------------------------------
// Small server.
//
// - Serves the static site (index.html, styles.css, etc.)
// - POST /api/rsvp   — receives an RSVP from the form, stores it in MySQL
//                      (the source of truth), then best-effort relays a copy
//                      to Formspree so you still get an email notification.
// - GET  /api/rsvps  — protected by ADMIN_PASSWORD; reads the guest list
//                      back out of MySQL for the hidden admin page.
//
// Why store in our own DB instead of just using Formspree: Formspree's free
// plan can receive submissions but has no API to read them back (that needs
// a paid plan). MySQL gives you a real, queryable copy for free — Formspree
// stays in the loop purely for the email notification.
//
// Run with: npm install && npm start
// See README.md and .env.example for full setup instructions.
// ---------------------------------------------------------------------------

require("dotenv").config();
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const mysql = require("mysql2/promise");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const FORMSPREE_ENDPOINT = process.env.FORMSPREE_ENDPOINT || "";

const DB_HOST = process.env.DB_HOST || "";
const DB_PORT = process.env.DB_PORT || 3306;
const DB_USER = process.env.DB_USER || "";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "";

const dbConfigured = Boolean(DB_HOST && DB_USER && DB_NAME);
const pool = dbConfigured
  ? mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
    })
  : null;

// Set once startup connects successfully and the table exists — route
// handlers use this to give a clear "not configured/reachable" error
// instead of leaking raw SQL errors.
let dbReady = false;

async function initDb() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rsvps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        attending VARCHAR(10) NOT NULL,
        guests INT DEFAULT 1,
        dietary TEXT,
        message TEXT,
        submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    dbReady = true;
    console.log("Connected to MySQL and ensured the `rsvps` table exists.");
  } catch (err) {
    console.error(
      "Failed to connect to MySQL / create the `rsvps` table:",
      err.message
    );
    console.error(
      "Check DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME in .env, and that the database itself already exists (server.js creates the TABLE, not the DATABASE — see README.md)."
    );
  }
}
initDb();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function requireAdminPassword(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({
      error: "ADMIN_PASSWORD is not set on the server. See .env.example.",
    });
  }

  const authHeader = req.headers.authorization || "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  next();
}

app.post("/api/rsvp", async (req, res) => {
  const body = req.body || {};

  // Honeypot: the client already checks this, but a direct POST could skip
  // the browser entirely, so check again here. Pretend success either way.
  if (body.company) {
    return res.json({ ok: true });
  }

  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const attending = (body.attending || "").trim();
  const guests = Number.parseInt(body.guests, 10) || 1;
  const dietary = (body.dietary || "").trim();
  const message = (body.message || "").trim();

  if (!name || !email || !attending) {
    return res.status(400).json({ error: "Name, email, and attending are required." });
  }

  if (!dbConfigured || !dbReady) {
    return res.status(501).json({
      error:
        "Database isn't configured or reachable on the server yet (DB_HOST/DB_USER/DB_NAME in .env). See README.md.",
    });
  }

  try {
    await pool.query(
      "INSERT INTO rsvps (name, email, attending, guests, dietary, message) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, attending, guests, dietary, message]
    );
  } catch (err) {
    console.error("Failed to save RSVP to MySQL:", err);
    return res.status(500).json({ error: "Failed to save your RSVP. Please try again." });
  }

  // Best-effort: the RSVP is already safely stored above, so a Formspree
  // hiccup here shouldn't fail the guest's submission — just log it.
  if (FORMSPREE_ENDPOINT) {
    try {
      const fsRes = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, attending, guests, dietary, message }),
      });
      if (!fsRes.ok) {
        console.warn("Formspree notification relay returned", fsRes.status);
      }
    } catch (err) {
      console.warn("Formspree notification relay failed:", err.message);
    }
  }

  res.json({ ok: true });
});

app.get("/api/rsvps", requireAdminPassword, async (req, res) => {
  if (!dbConfigured || !dbReady) {
    return res.status(501).json({
      error:
        "Database isn't configured or reachable on the server yet (DB_HOST/DB_USER/DB_NAME in .env). See README.md.",
    });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM rsvps ORDER BY submitted_at DESC");
    const submissions = rows.map((row) => ({
      submittedAt: row.submitted_at,
      name: row.name,
      email: row.email,
      attending: row.attending,
      guests: row.guests,
      dietary: row.dietary,
      message: row.message,
    }));
    res.json({ submissions });
  } catch (err) {
    console.error("Failed to read RSVPs from MySQL:", err);
    res.status(500).json({ error: "Failed to read RSVPs from the database." });
  }
});

app.listen(PORT, () => {
  console.log(`Wedding site running at http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) {
    console.warn("ADMIN_PASSWORD not set — /api/rsvps will refuse all requests until it is.");
  }
  if (!dbConfigured) {
    console.warn(
      "DB_HOST/DB_USER/DB_NAME not set — RSVPs won't be saved or readable until MySQL is configured."
    );
  }
  if (!FORMSPREE_ENDPOINT) {
    console.warn("FORMSPREE_ENDPOINT not set — you won't get email notifications for new RSVPs.");
  }
});
