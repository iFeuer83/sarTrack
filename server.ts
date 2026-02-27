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
      
      const volunteers = db.prepare("SELECT * FROM volunteers WHERE mission_id = ?").all(req.params.id);
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

  app.post("/api/sync", (req, res) => {
    const { volunteerId, missionId, name, organization, locations } = req.body;
    
    // Ensure volunteer exists
    const volunteer = db.prepare("SELECT id FROM volunteers WHERE id = ?").get(volunteerId);
    if (!volunteer) {
      db.prepare("INSERT INTO volunteers (id, mission_id, name, organization) VALUES (?, ?, ?, ?)")
        .run(volunteerId, missionId, name, organization);
    }

    // Insert locations
    const insertLoc = db.prepare("INSERT INTO locations (volunteer_id, mission_id, lat, lng, timestamp) VALUES (?, ?, ?, ?, ?)");
    const transaction = db.transaction((locs) => {
      for (const loc of locs) {
        insertLoc.run(volunteerId, missionId, loc.lat, loc.lng, loc.timestamp);
      }
    });
    transaction(locations);

    // Update last seen
    db.prepare("UPDATE volunteers SET last_seen = CURRENT_TIMESTAMP WHERE id = ?").run(volunteerId);

    // Broadcast update
    io.to(`mission:${missionId}`).emit("update", {
      volunteerId,
      name,
      organization,
      latestLocation: locations[locations.length - 1]
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
