import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "rescue.db");
console.log(`Initializing database at: ${dbPath}`);
const db = new Database(dbPath);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test2026";

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS volunteers (
    id TEXT PRIMARY KEY,
    mission_id TEXT,
    name TEXT NOT NULL,
    organization TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(mission_id) REFERENCES missions(id)
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id TEXT,
    mission_id TEXT,
    lat REAL,
    lng REAL,
    timestamp DATETIME,
    FOREIGN KEY(volunteer_id) REFERENCES volunteers(id),
    FOREIGN KEY(mission_id) REFERENCES missions(id)
  );
`);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

ensureColumn("missions", "active", "INTEGER DEFAULT 1");
ensureColumn("volunteers", "dismissed", "INTEGER DEFAULT 0");
ensureColumn("volunteers", "dismissed_at", "DATETIME");

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  app.use(express.json());

  // API Routes
  app.post("/api/admin/auth", (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
      return res.json({ success: true });
    }
    return res.status(401).json({ error: "Password admin non valida" });
  });

  app.post("/api/missions", (req, res) => {
    const { name } = req.body;
    const id = Math.random().toString(36).substring(2, 9).toUpperCase();
    db.prepare("INSERT INTO missions (id, name) VALUES (?, ?)").run(id, name);
    res.json({ id, name });
  });

  app.get("/api/missions/:id", (req, res) => {
    try {
      const mission = db.prepare("SELECT * FROM missions WHERE id = ?").get(req.params.id);
      if (!mission) {
        console.log(`Mission not found: ${req.params.id}`);
        return res.status(404).json({ error: "Missione non trovata" });
      }
      
      const volunteers = db.prepare("SELECT *, COALESCE(dismissed, 0) as dismissed FROM volunteers WHERE mission_id = ?").all(req.params.id);
      const locations = db.prepare(`
        SELECT l.* FROM locations l
        JOIN (
          SELECT volunteer_id, MAX(timestamp) as max_ts
          FROM locations
          WHERE mission_id = ?
          GROUP BY volunteer_id
        ) latest ON l.volunteer_id = latest.volunteer_id AND l.timestamp = latest.max_ts
      `).all(req.params.id);

      res.json({ mission, volunteers, locations });
    } catch (error) {
      console.error("Error fetching mission:", error);
      res.status(500).json({ error: "Errore interno del server" });
    }
  });

  app.patch("/api/missions/:id/status", (req, res) => {
    const { active } = req.body;
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "Valore active non valido" });
    }

    const update = db.prepare("UPDATE missions SET active = ? WHERE id = ?").run(active ? 1 : 0, req.params.id);
    if (update.changes === 0) {
      return res.status(404).json({ error: "Missione non trovata" });
    }

    io.to(`mission:${req.params.id}`).emit("update", { type: "mission-status", active });
    return res.json({ success: true, active });
  });

  app.patch("/api/missions/:id/volunteers/:volunteerId/dismiss", (req, res) => {
    const { dismissed } = req.body;
    if (typeof dismissed !== "boolean") {
      return res.status(400).json({ error: "Valore dismissed non valido" });
    }

    const update = db.prepare(`
      UPDATE volunteers
      SET dismissed = ?, dismissed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = ? AND mission_id = ?
    `).run(dismissed ? 1 : 0, dismissed ? 1 : 0, req.params.volunteerId, req.params.id);

    if (update.changes === 0) {
      return res.status(404).json({ error: "Volontario non trovato" });
    }

    io.to(`mission:${req.params.id}`).emit("update", {
      type: "volunteer-dismiss",
      volunteerId: req.params.volunteerId,
      dismissed,
    });

    return res.json({ success: true, dismissed });
  });

  app.post("/api/sync", (req, res) => {
    const { volunteerId, missionId, name, organization, locations } = req.body;

    const mission = db.prepare("SELECT id, active FROM missions WHERE id = ?").get(missionId) as { id: string; active: number } | undefined;
    if (!mission) {
      return res.status(404).json({ error: "Missione non trovata" });
    }
    if (mission.active !== 1) {
      return res.status(403).json({ error: "Missione chiusa: trasmissione non consentita" });
    }
    
    // Ensure volunteer exists
    const volunteer = db.prepare("SELECT id, COALESCE(dismissed, 0) as dismissed FROM volunteers WHERE id = ?").get(volunteerId) as { id: string; dismissed: number } | undefined;
    if (volunteer?.dismissed === 1) {
      return res.status(403).json({ error: "Trasmissione dismessa dall'amministratore" });
    }

    if (!volunteer) {
      db.prepare("INSERT INTO volunteers (id, mission_id, name, organization) VALUES (?, ?, ?, ?)")
        .run(volunteerId, missionId, name, organization);
    }

    // Insert locations
    const safeLocations = Array.isArray(locations) ? locations : [];
    const insertLoc = db.prepare("INSERT INTO locations (volunteer_id, mission_id, lat, lng, timestamp) VALUES (?, ?, ?, ?, ?)");
    const transaction = db.transaction((locs) => {
      for (const loc of locs) {
        insertLoc.run(volunteerId, missionId, loc.lat, loc.lng, loc.timestamp);
      }
    });
    transaction(safeLocations);

    // Update last seen
    db.prepare("UPDATE volunteers SET last_seen = CURRENT_TIMESTAMP WHERE id = ?").run(volunteerId);

    // Broadcast update
    io.to(`mission:${missionId}`).emit("update", {
      volunteerId,
      name,
      organization,
      latestLocation: safeLocations[safeLocations.length - 1]
    });

    res.json({ success: true });
  });

  // Socket.io
  io.on("connection", (socket) => {
    socket.on("join-mission", (missionId) => {
      socket.join(`mission:${missionId}`);
    });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
