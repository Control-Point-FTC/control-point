#!/usr/bin/env node

import express from "express";
import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from current directory
dotenv.config();

import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import bcrypt from "bcryptjs";
import multer from "multer";
import { simpleGit, SimpleGit } from "simple-git";
import axios from "axios";
import * as cheerio from "cheerio";
import { dbGet, dbAll, dbRun, dbExec, dbBatch } from "./db.js";
import {
  isAIConfigured,
  getAISetting,
  getMaxTokens,
  aiGenerate,
  aiStream,
  scoutNews,
  buildAttendancePrompt,
  buildExcusePrompt,
  buildCoachPrompt,
  ATTENDANCE_SYSTEM,
  EXCUSE_SYSTEM,
  COACH_SYSTEM,
} from "./ai.js";

// Initialize Database - Create all tables first
(await dbExec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    number TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    is_setup INTEGER DEFAULT 0,
    is_board INTEGER DEFAULT 0,
    scopes TEXT, -- JSON array
    FOREIGN KEY(team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    assigned_to INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo', -- 'todo', 'in-progress', 'done'
    due_date TEXT,
    is_board INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(assigned_to) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    member_id INTEGER,
    date TEXT NOT NULL,
    status TEXT NOT NULL, -- 'P', 'A', 'L', 'E', 'U', 'S'
    reason TEXT,
    is_excused INTEGER DEFAULT 0,
    FOREIGN KEY(member_id) REFERENCES members(id),
    UNIQUE(member_id, date)
  );

  CREATE TABLE IF NOT EXISTS hidden_dates (
    date TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    type TEXT NOT NULL, -- 'mention', 'task', 'system'
    is_read INTEGER DEFAULT 0,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    sender_id INTEGER,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(sender_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS documentation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    type TEXT NOT NULL, -- 'meeting', 'funding', 'milestone'
    title TEXT NOT NULL,
    content TEXT,
    images TEXT, -- JSON array of base64 or URLs
    date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    type TEXT NOT NULL, -- 'income', 'expense'
    amount REAL NOT NULL,
    category TEXT,
    description TEXT,
    date TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    hours INTEGER,
    location TEXT
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    name TEXT NOT NULL,
    part_number TEXT,
    sku TEXT NOT NULL UNIQUE,
    quantity INTEGER DEFAULT 0,
    assigned_to INTEGER,
    location TEXT,
    category TEXT,
    description TEXT,
    cost REAL DEFAULT 0,
    date_added TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(assigned_to) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS communications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT DEFAULT 'email' -- 'email', 'announcement'
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    date TEXT NOT NULL, -- YYYY-MM-DD
    start_time TEXT DEFAULT '', -- HH:MM
    end_time TEXT DEFAULT '', -- HH:MM
    location TEXT DEFAULT '',
    event_type TEXT DEFAULT 'meeting', -- 'meeting', 'competition', 'deadline', 'social', 'other'
    team_id INTEGER,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS code_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    language TEXT DEFAULT 'java',
    file_size INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(created_by) REFERENCES members(id),
    UNIQUE(team_id, file_path)
  );

  CREATE TABLE IF NOT EXISTS code_commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    file_id INTEGER,
    branch TEXT DEFAULT 'main',
    author_id INTEGER,
    message TEXT NOT NULL,
    content TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(file_id) REFERENCES code_files(id),
    FOREIGN KEY(author_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    member_id INTEGER NOT NULL,
    ws_connection_id TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_activity TEXT NOT NULL,
    FOREIGN KEY(member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS stream_sessions (
    id TEXT PRIMARY KEY,
    member_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    chunks TEXT,
    position INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(member_id) REFERENCES members(id)
  );
`));


// Migrations - Handle structural updates for existing databases
const memberColumns = (await dbAll("PRAGMA table_info(members)"));
if (!memberColumns.some((c: any) => c.name === 'password')) {
  (await dbExec("ALTER TABLE members ADD COLUMN password TEXT"));
}
if (!memberColumns.some((c: any) => c.name === 'is_setup')) {
  (await dbExec("ALTER TABLE members ADD COLUMN is_setup INTEGER DEFAULT 0"));
}
if (!memberColumns.some((c: any) => c.name === 'google_id')) {
  (await dbExec("ALTER TABLE members ADD COLUMN google_id TEXT"));
}

const taskColumns = (await dbAll("PRAGMA table_info(tasks)"));
if (!taskColumns.some((c: any) => c.name === 'is_board')) {
  (await dbExec("ALTER TABLE tasks ADD COLUMN is_board INTEGER DEFAULT 0"));
}

const teamColumns = (await dbAll("PRAGMA table_info(teams)"));
if (!teamColumns.some((c: any) => c.name === 'accent_color')) {
  (await dbExec("ALTER TABLE teams ADD COLUMN accent_color TEXT"));
}
if (!teamColumns.some((c: any) => c.name === 'primary_color')) {
  (await dbExec("ALTER TABLE teams ADD COLUMN primary_color TEXT"));
}
if (!teamColumns.some((c: any) => c.name === 'text_color')) {
  (await dbExec("ALTER TABLE teams ADD COLUMN text_color TEXT"));
}

if (!memberColumns.some((c: any) => c.name === 'accent_color')) {
  (await dbExec("ALTER TABLE members ADD COLUMN accent_color TEXT"));
}
if (!memberColumns.some((c: any) => c.name === 'primary_color')) {
  (await dbExec("ALTER TABLE members ADD COLUMN primary_color TEXT"));
}
if (!memberColumns.some((c: any) => c.name === 'text_color')) {
  (await dbExec("ALTER TABLE members ADD COLUMN text_color TEXT"));
}
if (!memberColumns.some((c: any) => c.name === 'avatar_url')) {
  (await dbExec("ALTER TABLE members ADD COLUMN avatar_url TEXT"));
}

// Feedback table — users send feedback to the app owner
(await dbExec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    user_id INTEGER,
    user_name TEXT,
    user_email TEXT,
    category TEXT DEFAULT 'general',
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(user_id) REFERENCES members(id)
  )
`));

// Messages table migrations
const messageColumns = (await dbAll("PRAGMA table_info(messages)"));
if (!messageColumns.some((c: any) => c.name === 'deleted_at')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN deleted_at TEXT"));
}
if (!messageColumns.some((c: any) => c.name === 'file_path')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN file_path TEXT"));
}
if (!messageColumns.some((c: any) => c.name === 'file_name')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN file_name TEXT"));
}
if (!messageColumns.some((c: any) => c.name === 'file_size')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN file_size INTEGER"));
}
if (!messageColumns.some((c: any) => c.name === 'file_updated')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN file_updated TEXT"));
}
if (!messageColumns.some((c: any) => c.name === 'updated_at')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN updated_at TEXT"));
}

// Verify columns exist
const finalMemberColumns = (await dbAll("PRAGMA table_info(members)"));
console.log("[DB Migration] Members table columns:", finalMemberColumns.map((c: any) => c.name).join(", "));

const codeFilesColumns = (await dbAll("PRAGMA table_info(code_files)"));
if (!codeFilesColumns.some((c: any) => c.name === 'file_size')) {
  (await dbExec("ALTER TABLE code_files ADD COLUMN file_size INTEGER"));
}

// ---- Role-based workspaces: access codes, account types, team scoping ----
async function hasColumn(table: string, col: string): Promise<boolean> {
  const cols = (await dbAll(`PRAGMA table_info(${table})`)) as any[];
  return cols.some((c: any) => c.name === col);
}

function generateAccessCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // unambiguous chars only
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `CP-${s.slice(0, 4)}-${s.slice(4)}`;
}

async function uniqueAccessCode(): Promise<string> {
  let code = generateAccessCode();
  while ((await dbGet("SELECT id FROM teams WHERE access_code = ?", code))) {
    code = generateAccessCode();
  }
  return code;
}

if (!(await hasColumn('teams', 'access_code'))) {
  (await dbExec("ALTER TABLE teams ADD COLUMN access_code TEXT"));
}
(await dbExec("CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_access_code ON teams(access_code)"));

if (!(await hasColumn('members', 'account_type'))) {
  (await dbExec("ALTER TABLE members ADD COLUMN account_type TEXT DEFAULT 'student'"));
  // Existing board members become admins
  (await dbExec("UPDATE members SET account_type = 'admin' WHERE is_board = 1"));
  // Guarantee at least one admin exists
  const adminCount = (await dbGet("SELECT COUNT(*) as n FROM members WHERE account_type = 'admin'")) as any;
  if (!adminCount || adminCount.n === 0) {
    (await dbExec("UPDATE members SET account_type = 'admin' WHERE id = (SELECT MIN(id) FROM members)"));
  }
}

// team_id on all content tables — older databases may lack it on some tables (e.g. attendance)
const teamTables = ['events', 'budget', 'outreach', 'inventory', 'communications', 'messages', 'documentation', 'tasks', 'attendance'];
for (const t of teamTables) {
  if (!(await hasColumn(t, 'team_id'))) {
    (await dbExec(`ALTER TABLE ${t} ADD COLUMN team_id INTEGER`));
  }
}

// Ensure a default team exists only when orphaned rows need a home, then backfill them
const orphanCount = (await dbGet(
  `SELECT (SELECT COUNT(*) FROM members WHERE team_id IS NULL) + ${teamTables.map(t => `(SELECT COUNT(*) FROM ${t} WHERE team_id IS NULL)`).join(' + ')} AS n`
)) as any;
let defaultTeam = (await dbGet("SELECT id FROM teams ORDER BY id LIMIT 1")) as any;
if (!defaultTeam && orphanCount && orphanCount.n > 0) {
  const code = await uniqueAccessCode();
  const info = (await dbRun("INSERT INTO teams (name, number, access_code) VALUES (?, ?, ?)", "My Team", "", code)) as any;
  defaultTeam = { id: info.lastInsertRowid };
}
if (defaultTeam) {
  for (const t of teamTables) {
    (await dbRun(`UPDATE ${t} SET team_id = ? WHERE team_id IS NULL`, defaultTeam.id));
  }
  (await dbRun("UPDATE members SET team_id = ? WHERE team_id IS NULL", defaultTeam.id));
}

// Backfill access codes for teams created before codes existed
const codelessTeams = (await dbAll("SELECT id FROM teams WHERE access_code IS NULL")) as any[];
for (const t of codelessTeams) {
  (await dbRun("UPDATE teams SET access_code = ? WHERE id = ?", await uniqueAccessCode(), t.id));
}

(await dbExec("CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_member_date ON attendance(member_id, date)"));

// Initial data
(await dbExec(`
  INSERT OR IGNORE INTO settings (key, value) VALUES ('excuse_criteria', 'Excused if for school, family emergency, or illness. Unexcused for gaming, hanging out, or forgetting.');
`));



// Session Management
function generateSessionId(): string {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}



async function createSession(memberId: number): Promise<string> {
  const sessionId = generateSessionId();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
  (await dbRun("INSERT INTO sessions (id, member_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)", sessionId, memberId, now, expiresAt, now));
  return sessionId;
}

async function validateSession(sessionId: string): Promise<{ valid: boolean; memberId?: number }> {
  try {
    const session = (await dbGet("SELECT * FROM sessions WHERE id = ?", sessionId)) as any;
    if (!session) return { valid: false };
    
    const now = new Date().toISOString();
    if (now > session.expires_at) {
      (await dbRun("DELETE FROM sessions WHERE id = ?", sessionId));
      return { valid: false };
    }
    
    // Update last activity
    (await dbRun("UPDATE sessions SET last_activity = ? WHERE id = ?", now, sessionId));
    return { valid: true, memberId: session.member_id };
  } catch (e) {
    return { valid: false };
  }
}

// Resolve the calling user + their workspace from a session id.
// Looks in query (?sessionId=), JSON body, then the x-session-id header.
async function getAuth(req: any): Promise<{ memberId: number; teamId: number | null; accountType: string } | null> {
  const sessionId = (req.query?.sessionId as string) || req.body?.sessionId || (req.headers?.['x-session-id'] as string);
  if (!sessionId) return null;
  const { valid, memberId } = await validateSession(sessionId);
  if (!valid || !memberId) return null;
  const member = (await dbGet("SELECT id, team_id, account_type FROM members WHERE id = ?", memberId)) as any;
  if (!member) return null;
  return { memberId: member.id, teamId: member.team_id ?? null, accountType: member.account_type || 'student' };
}

// Middleware-ish guard: 401 when no valid session. Returns auth or sends the error.
async function requireAuth(req: any, res: any): Promise<{ memberId: number; teamId: number | null; accountType: string } | null> {
  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }
  return auth;
}

async function requireAdmin(req: any, res: any) {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (auth.accountType !== 'admin') {
    res.status(403).json({ error: "Admins only" });
    return null;
  }
  return auth;
}

// App owner (Sushil) — sees feedback and usage across all workspaces.
// Configure with the OWNER_EMAILS env var (comma-separated).
function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function requireOwner(req: any, res: any) {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  const member = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
  const email = (member?.email || "").toLowerCase();
  if (!ownerEmails().includes(email)) {
    res.status(403).json({ error: "Owner only" });
    return null;
  }
  return auth;
}






// Cleanup expired sessions periodically
setInterval(async () => {
  const now = new Date().toISOString();
  (await dbRun("DELETE FROM sessions WHERE expires_at < ?", now));
  (await dbRun("DELETE FROM stream_sessions WHERE expires_at < ?", now));
}, 60 * 60 * 1000); // Every hour

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());
  
  // Configure multer for file uploads
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
  
  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });

  // Avatars: images only, 2MB cap
  const avatarUpload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed'));
    }
  });
  
  app.use('/uploads', express.static(uploadDir));
  
  // Migration to populate missing file metadata for existing messages
  try {
    const messagesToFix = (await dbAll("SELECT id, file_path FROM messages WHERE file_path IS NOT NULL AND file_name IS NULL"));
    for (const msg of messagesToFix as any) {
      try {
        const relativePath = msg.file_path.startsWith('/uploads/') ? msg.file_path.slice(9) : msg.file_path;
        const fullPath = path.join(uploadDir, relativePath);
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          (await dbRun("UPDATE messages SET file_name = ?, file_size = ?, file_updated = ? WHERE id = ?", path.basename(fullPath), stats.size, stats.mtime.toISOString(), msg.id));
        }
      } catch (err) {
        console.error(`Failed to migrate metadata for message ${msg.id}:`, err);
      }
    }
  } catch (err) {
    console.error("Migration query failed:", err);
  }
  
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // --- WebSocket Logic ---
  const clients = new Set<WebSocket>();

  const broadcastToTeam = (teamId: number | null | undefined, data: any) => {
    if (teamId == null) return;
    const payload = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && (client as any).teamId === teamId) client.send(payload);
    });
  };

  const createNotification = async (userId: number, content: string, type: string) => {
    try {
      const timestamp = new Date().toISOString();
      const info = await dbRun("INSERT INTO notifications (user_id, content, type, timestamp) VALUES (?, ?, ?, ?)", userId, content, type, timestamp);
      const target = (await dbGet("SELECT team_id FROM members WHERE id = ?", userId)) as any;

      broadcastToTeam(target?.team_id, {
        type: 'notification',
        notification: {
          id: info.lastInsertRowid,
          user_id: userId,
          content,
          type,
          timestamp,
          is_read: 0
        }
      });
    } catch (e) {
      console.error("createNotification failed:", e);
    }
  };

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        // Client identifies its workspace right after connecting: { type: 'hello', sessionId }
        if (message.type === "hello" && message.sessionId) {
          const { valid, memberId } = await validateSession(message.sessionId);
          if (valid && memberId) {
            const member = (await dbGet("SELECT id, team_id FROM members WHERE id = ?", memberId)) as any;
            if (member) {
              (ws as any).teamId = member.team_id;
              (ws as any).memberId = member.id;
            }
          }
          return;
        }
        if (message.type === "chat") {
          const teamId = (ws as any).teamId;
          if (teamId == null) return; // ignore unidentified clients
          // Verify the claimed sender belongs to this workspace
          const sender = (await dbGet("SELECT id, team_id FROM members WHERE id = ?", message.sender_id)) as any;
          if (!sender || sender.team_id !== teamId) return;
          const timestamp = new Date().toISOString();
          const info = await dbRun("INSERT INTO messages (sender_id, content, timestamp, team_id) VALUES (?, ?, ?, ?)", message.sender_id, message.content, timestamp, teamId);

          // Handle mentions (scoped to the sender's workspace)
          const mentions = message.content.match(/@\[([^\]]+)\]/g);
          if (mentions) {
            for (const m of mentions) {
              const name = m.slice(2, -1);
              const user = (await dbGet("SELECT id FROM members WHERE name = ? AND team_id = ?", name, teamId)) as any;
              if (user) {
                createNotification(user.id, `You were mentioned by ${message.sender_name}: "${message.content}"`, 'mention');
              }
            }
          }

          broadcastToTeam(teamId, {
            type: "chat",
            id: info.lastInsertRowid,
            sender_id: message.sender_id,
            sender_name: message.sender_name,
            content: message.content,
            timestamp
          });
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    });
  });

  // --- Auth Routes ---
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = (await dbGet("SELECT * FROM members WHERE email = ?", email)) as any;

    if (!user) return res.status(401).json({ error: "User not found" });

    if (!user.password) {
      const sessionId = await createSession(user.id);
      return res.json({ needsSetup: true, user, sessionId });
    }

    if (bcrypt.compareSync(password, user.password)) {
      const sessionId = await createSession(user.id);
      res.json({ user, sessionId });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  });

  app.post("/api/auth/setup", async (req, res) => {
    const { email, password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    // Setup is only for accounts that never had a password (e.g. added to the roster by an admin)
    const existing = (await dbGet("SELECT id FROM members WHERE email = ? AND password IS NULL", email)) as any;
    if (!existing) return res.status(400).json({ error: "This account already has a password — sign in instead" });
    const hashedPassword = bcrypt.hashSync(password, 10);
    (await dbRun("UPDATE members SET password = ?, is_setup = 1 WHERE id = ?", hashedPassword, existing.id));
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", existing.id));
    const sessionId = await createSession(existing.id);
    res.json({ user, sessionId });
  });

  // Admin-only: force a roster member in your workspace to set a new password on next login
  app.post("/api/auth/reset", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const { email } = req.body;
    const target = (await dbGet("SELECT id, team_id FROM members WHERE email = ?", email)) as any;
    if (!target || target.team_id !== auth.teamId) {
      return res.status(404).json({ error: "Member not found in your workspace" });
    }
    if (target.id === auth.memberId) {
      return res.status(400).json({ error: "You can't reset your own password this way" });
    }
    (await dbRun("UPDATE members SET password = NULL, is_setup = 0 WHERE id = ?", target.id));
    res.json({ success: true });
  });

  // ---- Public signup ----
  // accountType 'admin': creates a new workspace (team) + access code, user becomes its admin.
  // accountType 'student': joins an existing workspace via the admin's access code.
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { accountType, name, email, password, teamName, teamNumber, accessCode } = req.body || {};
      const cleanName = (name || '').trim();
      const cleanEmail = (email || '').trim();
      if (!cleanName || !cleanEmail || !password || password.length < 6) {
        return res.status(400).json({ error: "Name, email, and a 6+ character password are required" });
      }
      const existing = (await dbGet("SELECT id FROM members WHERE email = ?", cleanEmail));
      if (existing) return res.status(400).json({ error: "An account with that email already exists — sign in instead" });
      const hashedPassword = bcrypt.hashSync(password, 10);

      if (accountType === 'admin') {
        const cleanTeam = (teamName || '').trim();
        if (!cleanTeam) return res.status(400).json({ error: "Team name is required" });
        const code = await uniqueAccessCode();
        const tInfo = (await dbRun("INSERT INTO teams (name, number, access_code) VALUES (?, ?, ?)", cleanTeam, (teamNumber || '').trim(), code)) as any;
        const teamId = tInfo.lastInsertRowid;
        const mInfo = (await dbRun(
          "INSERT INTO members (team_id, name, role, email, password, is_setup, is_board, account_type, scopes) VALUES (?, ?, ?, ?, ?, 1, 1, 'admin', ?)",
          teamId, cleanName, 'Admin', cleanEmail, hashedPassword, JSON.stringify(['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin'])
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        return res.json({ user, sessionId, team: { id: teamId, name: cleanTeam, access_code: code } });
      }

      if (accountType === 'student') {
        const norm = (accessCode || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!norm) return res.status(400).json({ error: "Enter the access code from your team admin" });
        const team = (await dbGet("SELECT * FROM teams WHERE REPLACE(access_code, '-', '') = ?", norm)) as any;
        if (!team) return res.status(400).json({ error: "That access code doesn't match any team — check it with your admin" });
        const mInfo = (await dbRun(
          "INSERT INTO members (team_id, name, role, email, password, is_setup, is_board, account_type, scopes) VALUES (?, ?, ?, ?, ?, 1, 0, 'student', ?)",
          team.id, cleanName, 'Member', cleanEmail, hashedPassword, JSON.stringify([])
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        return res.json({ user, sessionId, team: { id: team.id, name: team.name, access_code: team.access_code } });
      }

      return res.status(400).json({ error: "Choose whether you're signing up as an admin or a student" });
    } catch (e: any) {
      console.error("Signup error:", e);
      return res.status(500).json({ error: "Signup failed — try again" });
    }
  });

  // ---- Google OAuth ----
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
  const oauthStates = new Map<string, { expiry: number; intent: string }>(); // state -> {expiry, intent}
  // Pending Google signups: token -> {googleSub, email, name, intent, expiry}. Single-use, 10 min.
  const pendingGoogleSignups = new Map<string, { googleSub: string; email: string; name: string; intent: string; expiry: number }>();

  function getOAuthRedirectUri(req: any): string {
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    if (base) return `${base}/api/auth/google/callback`;
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    return `${proto}://${req.get("host")}/api/auth/google/callback`;
  }

  app.get("/api/auth/config", async (req, res) => {
    res.json({ googleEnabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) });
  });

  // Resolve the current user from a session id (used after Google sign-in)
  app.get("/api/auth/me", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) return res.status(401).json({ error: "No session" });
    const { valid, memberId } = await validateSession(sessionId);
    if (!valid || !memberId) return res.status(401).json({ error: "Invalid session" });
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", memberId)) as any;
    const isOwner = ownerEmails().includes(((user?.email) || "").toLowerCase());
    res.json({ user, sessionId, isOwner });
  });

  app.get("/api/auth/google", async (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: "Google sign-in is not configured" });
    }
    const rawIntent = (req.query.intent as string) || 'login';
    const intent = ['login', 'admin_signup', 'student_signup', 'signup'].includes(rawIntent) ? rawIntent : 'login';
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const state = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    oauthStates.set(state, { expiry: Date.now() + 10 * 60 * 1000, intent });
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: getOAuthRedirectUri(req),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    res.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString());
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const pending = state ? oauthStates.get(state) : undefined;
      if (state) oauthStates.delete(state);
      if (!code || !pending || pending.expiry < Date.now()) {
        return res.redirect("/?google_error=invalid_state");
      }
      const intent = pending.intent || 'login';
      // Exchange the authorization code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: getOAuthRedirectUri(req),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) throw new Error("Token exchange failed");
      const { access_token } = (await tokenRes.json()) as any;
      // Fetch the Google profile directly from Google (token came from Google over TLS)
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!profileRes.ok) throw new Error("Failed to fetch Google profile");
      const profile = (await profileRes.json()) as any;
      if (!profile.email) throw new Error("No email in Google profile");

      // Members sign in directly; new users complete signup when they arrived with a signup intent
      let member: any = (await dbGet("SELECT * FROM members WHERE google_id = ?", profile.sub));
      if (!member) {
        member = (await dbGet("SELECT * FROM members WHERE email = ?", profile.email));
        if (member) {
          (await dbRun("UPDATE members SET google_id = ? WHERE id = ?", profile.sub, member.id));
          member = (await dbGet("SELECT * FROM members WHERE id = ?", member.id));
        } else if (intent === 'admin_signup' || intent === 'student_signup' || intent === 'signup') {
          const tokenBytes = new Uint8Array(32);
          crypto.getRandomValues(tokenBytes);
          const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");
          pendingGoogleSignups.set(token, {
            googleSub: profile.sub,
            email: profile.email,
            name: profile.name || '',
            intent,
            expiry: Date.now() + 10 * 60 * 1000,
          });
          return res.redirect(`/?google_signup=${token}&intent=${intent}`);
        } else {
          return res.redirect("/?google_error=not_invited");
        }
      }
      const sessionId = await createSession(member.id);
      res.redirect(`/?google_session=${sessionId}`);
    } catch (error) {
      console.error("Google OAuth error:", error);
      res.redirect("/?google_error=oauth_failed");
    }
  });

  // Finish a Google signup: the user verified their Google identity, now they
  // provide the role-specific details (team name for admins, access code for students)
  app.post("/api/auth/google/complete", async (req, res) => {
    try {
      const { token, teamName, teamNumber, accessCode, role } = req.body || {};
      const pending = token ? pendingGoogleSignups.get(token) : undefined;
      if (pending) pendingGoogleSignups.delete(token); // single-use
      if (!pending || pending.expiry < Date.now()) {
        return res.status(400).json({ error: "Google signup expired — please try again" });
      }
      const cleanEmail = (pending.email || '').trim();
      const cleanName = (pending.name || '').trim() || cleanEmail.split('@')[0];
      if (!cleanEmail) return res.status(400).json({ error: "Google signup expired — please try again" });
      const existing = (await dbGet("SELECT id FROM members WHERE email = ?", cleanEmail));
      if (existing) return res.status(400).json({ error: "An account with that email already exists — sign in instead" });

      const effectiveIntent = pending.intent === 'signup'
        ? (role === 'admin' ? 'admin_signup' : 'student_signup')
        : pending.intent;
      if (effectiveIntent === 'admin_signup') {
        const cleanTeam = (teamName || '').trim();
        if (!cleanTeam) return res.status(400).json({ error: "Team name is required" });
        const code = await uniqueAccessCode();
        const tInfo = (await dbRun("INSERT INTO teams (name, number, access_code) VALUES (?, ?, ?)", cleanTeam, (teamNumber || '').trim(), code)) as any;
        const teamId = tInfo.lastInsertRowid;
        const mInfo = (await dbRun(
          "INSERT INTO members (team_id, name, role, email, password, google_id, is_setup, is_board, account_type, scopes) VALUES (?, ?, ?, ?, NULL, ?, 1, 1, 'admin', ?)",
          teamId, cleanName, 'Admin', cleanEmail, pending.googleSub, JSON.stringify(['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin'])
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        return res.json({ user, sessionId, team: { id: teamId, name: cleanTeam, access_code: code } });
      }

      if (effectiveIntent === 'student_signup') {
        const norm = (accessCode || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!norm) return res.status(400).json({ error: "Enter the access code from your team admin" });
        const team = (await dbGet("SELECT * FROM teams WHERE REPLACE(access_code, '-', '') = ?", norm)) as any;
        if (!team) return res.status(400).json({ error: "That access code doesn't match any team — check it with your admin" });
        const mInfo = (await dbRun(
          "INSERT INTO members (team_id, name, role, email, password, google_id, is_setup, is_board, account_type, scopes) VALUES (?, ?, ?, ?, NULL, ?, 1, 0, 'student', ?)",
          team.id, cleanName, 'Member', cleanEmail, pending.googleSub, JSON.stringify([])
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        return res.json({ user, sessionId, team: { id: team.id, name: team.name, access_code: team.access_code } });
      }

      return res.status(400).json({ error: "Google signup expired — please try again" });
    } catch (e: any) {
      console.error("Google signup completion error:", e);
      return res.status(500).json({ error: "Signup failed — try again" });
    }
  });


  // --- API Routes ---

  // Teams — each signed-in user sees only their own workspace
  app.get("/api/teams", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const teams = (await dbAll("SELECT * FROM teams WHERE id = ?", auth.teamId));
    res.json(teams);
  });

  // Workspaces are created at signup — direct creation is disabled
  app.post("/api/teams", async (req, res) => {
    res.status(403).json({ error: "Workspaces are created at signup" });
  });

  app.patch("/api/teams/:id", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    if (parseInt(req.params.id, 10) !== auth.teamId) {
      return res.status(403).json({ error: "Not your workspace" });
    }
    const { name, number, accent_color, primary_color, text_color } = req.body;
    (await dbRun("UPDATE teams SET name = ?, number = ?, accent_color = ?, primary_color = ?, text_color = ? WHERE id = ?", name, number, accent_color || null, primary_color || null, text_color || null, req.params.id));
    res.json({ success: true });
  });

  app.delete("/api/teams/:id", async (req, res) => {
    res.status(403).json({ error: "Workspaces can't be deleted from here" });
  });

  // Regenerate the workspace's student access code (admin only)
  app.post("/api/teams/regenerate-code", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const code = await uniqueAccessCode();
    (await dbRun("UPDATE teams SET access_code = ? WHERE id = ?", code, auth.teamId));
    res.json({ access_code: code });
  });

  // Members — scoped to the caller's workspace
  app.get("/api/members", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const members = (await dbAll(`
      SELECT m.*, t.name as team_name 
      FROM members m 
      LEFT JOIN teams t ON m.team_id = t.id
      WHERE m.team_id = ?
    `, auth.teamId));
    res.json(members);
  });

  app.post("/api/members", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const { name, role, email, is_board, scopes, account_type, accent_color, primary_color, text_color } = req.body;
    const existing = (await dbGet("SELECT id FROM members WHERE email = ?", email));
    if (existing) return res.status(400).json({ error: "That email is already on the roster" });
    const finalScopes = typeof scopes === 'string' ? scopes : JSON.stringify(scopes || []);
    const info = (await dbRun("INSERT INTO members (team_id, name, role, email, is_board, scopes, account_type, accent_color, primary_color, text_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", auth.teamId, name, role, email, is_board ? 1 : 0, finalScopes, account_type === 'admin' ? 'admin' : 'student', accent_color || null, primary_color || null, text_color || null));
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/members/:id", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const memberId = parseInt(req.params.id, 10);
    const target = (await dbGet("SELECT * FROM members WHERE id = ?", memberId)) as any;
    if (!target || target.team_id !== auth.teamId) {
      return res.status(404).json({ error: "Member not found" });
    }
    const { name, role, email, is_board, scopes, account_type, accent_color, primary_color, text_color } = req.body;
    const finalScopes = typeof scopes === 'string' ? scopes : JSON.stringify(scopes || []);

    // Guard: never leave the workspace without an admin
    const nextType = account_type === 'admin' || account_type === 'student' ? account_type : target.account_type;
    if (target.account_type === 'admin' && nextType !== 'admin') {
      const admins = (await dbGet("SELECT COUNT(*) as n FROM members WHERE team_id = ? AND account_type = 'admin'", auth.teamId)) as any;
      if (admins.n <= 1) return res.status(400).json({ error: "You need at least one admin — promote someone else first" });
    }

    // Only update color fields if they're explicitly provided (not undefined)
    const updates: any = {
      name, role, email,
      is_board: is_board ? 1 : 0,
      scopes: finalScopes,
      account_type: nextType,
    };

    if (accent_color !== undefined) updates.accent_color = accent_color;
    if (primary_color !== undefined) updates.primary_color = primary_color;
    if (text_color !== undefined) updates.text_color = text_color;

    const columns = Object.keys(updates);
    const setClause = columns.map(col => `${col} = ?`).join(', ');

    (await dbRun(`UPDATE members SET ${setClause} WHERE id = ?`, ...Object.values(updates), memberId));

    res.json({ success: true });
  });

  // Self-service profile: any signed-in member can update their own
  // name, role description, theme colors, and avatar. Admin-only fields
  // (email, is_board, scopes, account_type) stay on the admin endpoint.
  app.patch("/api/profile", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { name, role, accent_color, primary_color, text_color, avatar_url } = req.body || {};
    const cleanName = (name || '').trim();
    if (!cleanName) return res.status(400).json({ error: "Name can't be empty" });
    const updates: any = { name: cleanName, role: (role || '').trim() };
    if (accent_color !== undefined) updates.accent_color = accent_color || null;
    if (primary_color !== undefined) updates.primary_color = primary_color || null;
    if (text_color !== undefined) updates.text_color = text_color || null;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url || null;
    const cols = Object.keys(updates);
    (await dbRun(`UPDATE members SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(updates), auth.memberId));
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", auth.memberId));
    res.json({ user });
  });

  // Avatar upload for the signed-in member
  app.post("/api/profile/avatar", (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Invalid image" });
      next();
    });
  }, async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const avatarUrl = `/uploads/${req.file.filename}`;
    // Remove the previous avatar file so uploads don't pile up
    try {
      const prev = (await dbGet("SELECT avatar_url FROM members WHERE id = ?", auth.memberId)) as any;
      if (prev?.avatar_url?.startsWith('/uploads/')) {
        const prevPath = path.join(uploadDir, prev.avatar_url.slice('/uploads/'.length));
        if (fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
      }
    } catch { /* best effort */ }
    (await dbRun("UPDATE members SET avatar_url = ? WHERE id = ?", avatarUrl, auth.memberId));
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", auth.memberId));
    res.json({ avatar_url: avatarUrl, user });
  });

  app.delete("/api/members/:id", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const memberId = parseInt(req.params.id, 10);
    const target = (await dbGet("SELECT * FROM members WHERE id = ?", memberId)) as any;
    if (!target || target.team_id !== auth.teamId) {
      return res.status(404).json({ error: "Member not found" });
    }
    if (target.id === auth.memberId) {
      return res.status(400).json({ error: "You can't remove your own account" });
    }
    if (target.account_type === 'admin') {
      const admins = (await dbGet("SELECT COUNT(*) as n FROM members WHERE team_id = ? AND account_type = 'admin'", auth.teamId)) as any;
      if (admins.n <= 1) return res.status(400).json({ error: "You need at least one admin" });
    }
    (await dbRun("DELETE FROM members WHERE id = ?", memberId));
    res.json({ success: true });
  });

  // Attendance — scoped to the caller's workspace
  app.get("/api/attendance", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const { date } = req.query;
      let query = "SELECT a.* FROM attendance a JOIN members m ON a.member_id = m.id WHERE m.team_id = ?";
      let params: any[] = [auth.teamId];
      if (date) {
        query += " AND a.date = ?";
        params.push(date);
      }
      const records = (await dbAll(query, ...params));
      res.json(records);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/attendance/batch", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const { date, records } = req.body;
      if (!date || !Array.isArray(records)) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      // Every touched member must belong to the caller's workspace
      const memberIds = [...new Set(records.map((r: any) => r.member_id))];
      for (const mid of memberIds) {
        const m = (await dbGet("SELECT team_id FROM members WHERE id = ?", mid)) as any;
        if (!m || m.team_id !== auth.teamId) {
          return res.status(403).json({ error: "Not your workspace" });
        }
      }

      console.log(`[Attendance] Updating ${records.length} records for ${date}`);
      
      const upsertSql = `
        INSERT INTO attendance (member_id, date, status, reason)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(member_id, date) DO UPDATE SET
          status = excluded.status,
          reason = COALESCE(excluded.reason, attendance.reason)
      `;
      const stmts: { sql: string; args: any[] }[] = [];
      for (const rec of records) {
        if (rec.status === null || rec.status === '-') {
          stmts.push({ sql: "DELETE FROM attendance WHERE member_id = ? AND date = ?", args: [rec.member_id, date] });
        } else {
          stmts.push({ sql: upsertSql, args: [rec.member_id, date, rec.status, rec.reason || null] });
        }
      }
      await dbBatch(stmts);
      res.json({ success: true });
    } catch (error) {
      console.error("Error in attendance batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Self check-in: any member marks THEMSELVES present for today.
  app.post("/api/attendance/checkin", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const today = new Date().toISOString().slice(0, 10);
      (await dbRun(
        `INSERT INTO attendance (member_id, date, status, team_id)
         VALUES (?, ?, 'P', ?)
         ON CONFLICT(member_id, date) DO UPDATE SET status = 'P'`,
        auth.memberId, today, auth.teamId
      ));
      res.json({ success: true, date: today });
    } catch (error) {
      console.error("Error in attendance checkin:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/attendance/summary", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const summary = (await dbAll(`
        SELECT 
          m.id as member_id, 
          m.name,
          COUNT(CASE WHEN a.status = 'P' THEN 1 END) as present,
          COUNT(CASE WHEN a.status = 'A' THEN 1 END) as absent,
          COUNT(CASE WHEN a.status = 'L' THEN 1 END) as late,
          COUNT(CASE WHEN a.status = 'E' THEN 1 END) as excused,
          COUNT(a.id) as total
        FROM members m
        LEFT JOIN attendance a ON m.id = a.member_id
        WHERE m.team_id = ?
        GROUP BY m.id
      `, auth.teamId));
      res.json(summary);
    } catch (error) {
      console.error("Error fetching attendance summary:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/attendance/sessions", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const sessions = (await dbAll(`
        SELECT DISTINCT a.date 
        FROM attendance a
        JOIN members m ON a.member_id = m.id
        WHERE m.team_id = ?
        ORDER BY a.date DESC
      `, auth.teamId));
      res.json(sessions.map((s: any) => s.date));
    } catch (error) {
      console.error("Error fetching attendance sessions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/hidden-dates", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const dates = (await dbAll("SELECT date FROM hidden_dates"));
      res.json(dates.map((d: any) => d.date));
    } catch (error) {
      console.error("Error fetching hidden dates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/hidden-dates", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const { date } = req.body;
    (await dbRun("INSERT OR IGNORE INTO hidden_dates (date) VALUES (?)", date));
    res.json({ success: true });
  });

  app.delete("/api/hidden-dates/:date", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    (await dbRun("DELETE FROM hidden_dates WHERE date = ?", req.params.date));
    res.json({ success: true });
  });

  // Messages
  app.get("/api/messages", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const msgs = (await dbAll(`
      SELECT m.*, mem.name as sender_name 
      FROM messages m 
      JOIN members mem ON m.sender_id = mem.id 
      WHERE m.team_id = ?
      ORDER BY timestamp ASC LIMIT 100
    `, auth.teamId));
    res.json(msgs);
  });

  // File upload for messages
  app.post("/api/messages/upload", upload.single('file'), async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const { sender_id, sender_name, content } = req.body;
    const sender = (await dbGet("SELECT team_id FROM members WHERE id = ?", sender_id)) as any;
    if (!sender || sender.team_id !== auth.teamId) {
      return res.status(403).json({ error: "Not your workspace" });
    }
    const timestamp = new Date().toISOString();
    const filePath = `/uploads/${req.file.filename}`;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;
    const fileUpdated = new Date().toISOString();
    
    const info = (await dbRun(
      "INSERT INTO messages (sender_id, content, timestamp, file_path, file_name, file_size, file_updated, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    , sender_id, content || '', timestamp, filePath, fileName, fileSize, fileUpdated, auth.teamId));
    
    broadcastToTeam(auth.teamId, {
      type: "chat",
      id: info.lastInsertRowid,
      sender_id: parseInt(sender_id),
      sender_name,
      content: content || '',
      file_path: filePath,
      file_name: fileName,
      file_size: fileSize,
      file_updated: fileUpdated,
      timestamp
    });
    
    res.json({ 
      id: info.lastInsertRowid, 
      file_path: filePath,
      file_name: fileName,
      file_size: fileSize,
      file_updated: fileUpdated,
      sender_id: parseInt(sender_id),
      sender_name,
      content: content || '',
      timestamp
    });
  });

  // Delete message (hard delete - permanent removal)
  app.delete("/api/messages/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const messageId = req.params.id;
    const silent = req.query.silent === 'true'; // Check for silent deletion
    
    try {
      const existing: any = (await dbGet("SELECT team_id FROM messages WHERE id = ?", messageId));
      if (!existing || existing.team_id !== auth.teamId) {
        return res.status(404).json({ error: "Message not found" });
      }
      // Hard delete - permanently remove the message from database
      (await dbRun("DELETE FROM messages WHERE id = ?", messageId));
      
      if (!silent) { // Only broadcast if not silent deletion
        broadcastToTeam(auth.teamId, {
          type: "message_deleted",
          id: parseInt(messageId),
          deleted_permanently: true
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  });

  // PATCH: Update message content (silent edit)
  app.patch("/api/messages/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const messageId = req.params.id;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Content is required for message update" });
    }

    const existing: any = (await dbGet("SELECT team_id FROM messages WHERE id = ?", messageId));
    if (!existing || existing.team_id !== auth.teamId) {
      return res.status(404).json({ error: "Message not found" });
    }

    (await dbRun("UPDATE messages SET content = ?, updated_at = ? WHERE id = ?", content, new Date().toISOString(), messageId));
    
    // No broadcast for silent edit
    res.json({ success: true });
  });

  // Notifications
  app.get("/api/notifications/:userId", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const userId = parseInt(req.params.userId, 10);
    if (userId !== auth.memberId && auth.accountType !== 'admin') {
      return res.status(403).json({ error: "Not yours" });
    }
    const notes = (await dbAll("SELECT * FROM notifications WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50", userId));
    res.json(notes);
  });

  app.post("/api/notifications/read", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid" });
    await dbBatch(ids.map((id: any) => ({ sql: "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", args: [id, auth.memberId] })));
    res.json({ success: true });
  });

  // --- Feedback: any user can send feedback to the app owner ---
  app.post("/api/feedback", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const { category, message } = req.body || {};
      const clean = (message || '').trim();
      if (!clean) return res.status(400).json({ error: "Message can't be empty" });
      const me = (await dbGet("SELECT name, email FROM members WHERE id = ?", auth.memberId)) as any;
      const info = (await dbRun(
        "INSERT INTO feedback (team_id, user_id, user_name, user_email, category, message) VALUES (?, ?, ?, ?, ?, ?)",
        auth.teamId, auth.memberId, me?.name || '', me?.email || '', (category || 'general').toString().slice(0, 40), clean.slice(0, 5000)
      ));
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving feedback:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- Owner portal: cross-workspace visibility for the app owner ---
  app.get("/api/owner/overview", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const teams = (await dbAll(`
      SELECT t.id, t.name, t.number, t.access_code,
        (SELECT COUNT(*) FROM members m WHERE m.team_id = t.id) as member_count,
        (SELECT COUNT(*) FROM messages msg WHERE msg.team_id = t.id) as message_count,
        (SELECT COUNT(*) FROM tasks tk WHERE tk.team_id = t.id) as task_count,
        (SELECT COUNT(*) FROM feedback f WHERE f.team_id = t.id) as feedback_count
      FROM teams t ORDER BY t.id DESC
    `));
    const totals = (await dbGet(`
      SELECT (SELECT COUNT(*) FROM members) as users,
             (SELECT COUNT(*) FROM teams) as teams,
             (SELECT COUNT(*) FROM messages) as messages,
             (SELECT COUNT(*) FROM feedback) as feedback,
             (SELECT COUNT(*) FROM feedback WHERE status = 'new') as new_feedback
    `));
    res.json({ totals, teams });
  });

  app.get("/api/owner/users", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const users = (await dbAll(`
      SELECT m.id, m.name, m.email, m.role, m.account_type, m.team_id, t.name as team_name
      FROM members m LEFT JOIN teams t ON m.team_id = t.id
      ORDER BY m.id DESC LIMIT 500
    `));
    res.json(users);
  });

  app.get("/api/owner/feedback", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const items = (await dbAll(`
      SELECT f.*, t.name as team_name FROM feedback f
      LEFT JOIN teams t ON f.team_id = t.id
      ORDER BY f.created_at DESC LIMIT 500
    `));
    res.json(items);
  });

  app.patch("/api/owner/feedback/:id", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const { status } = req.body || {};
    const next = status === 'resolved' ? 'resolved' : 'new';
    (await dbRun("UPDATE feedback SET status = ? WHERE id = ?", next, req.params.id));
    res.json({ success: true });
  });

  // Am I the app owner? (drives the Owner tab in the UI)
  app.get("/api/owner/me", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const member = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
    res.json({ isOwner: ownerEmails().includes((member?.email || "").toLowerCase()) });
  });

  // Settings
  app.get("/api/settings", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const settings = (await dbAll("SELECT * FROM settings"));
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/storage-usage", async (req, res) => {
    try {
      const _suAuth = await requireAdmin(req, res);
      if (!_suAuth) return;
      const messageFilesSize = (await dbGet("SELECT SUM(file_size) as total FROM messages WHERE file_size IS NOT NULL AND team_id = ?", _suAuth.teamId)) as any;
      console.log("messageFilesSize raw:", messageFilesSize);
      const codeFilesSize = (await dbGet("SELECT SUM(file_size) as total FROM code_files WHERE file_size IS NOT NULL AND team_id = ?", _suAuth.teamId)) as any;
      console.log("codeFilesSize raw:", codeFilesSize);
      
      const totalSize = (messageFilesSize?.total || 0) + (codeFilesSize?.total || 0);
      
      res.json({ totalSize });
    } catch (error) {
      console.error("Error fetching storage usage:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const { key, value } = req.body;
      (await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value));
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Tasks
  app.get("/api/tasks", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const tasks = (await dbAll("SELECT * FROM tasks WHERE team_id = ?", auth.teamId));
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const { title, description, status, assigned_to, due_date, is_board } = req.body;
      const createdAt = new Date().toISOString();

      const targetAssignedTo = assigned_to || null;
      if (targetAssignedTo) {
        const m = (await dbGet("SELECT team_id FROM members WHERE id = ?", targetAssignedTo)) as any;
        if (!m || m.team_id !== auth.teamId) {
          return res.status(403).json({ error: "Not your workspace" });
        }
      }

      const info = (await dbRun("INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, is_board, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", auth.teamId, title, description, status || 'todo', targetAssignedTo, due_date, is_board || 0, createdAt));

      if (targetAssignedTo) {
        createNotification(targetAssignedTo, `New task assigned: ${title}`, 'task');
      }

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const task = (await dbGet("SELECT * FROM tasks WHERE id = ?", req.params.id)) as any;
      if (!task || task.team_id !== auth.teamId) {
        return res.status(404).json({ error: "Task not found" });
      }
      // Students may only move their own assigned tasks; admins may edit anything
      if (auth.accountType !== 'admin' && task.assigned_to !== auth.memberId) {
        return res.status(403).json({ error: "You can only update tasks assigned to you" });
      }
      const { status } = req.body;
      const completedAt = status === 'done' ? new Date().toISOString() : null;

      if (status === 'done') {
        (await dbRun("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?", status, completedAt, req.params.id));
      } else {
        (await dbRun("UPDATE tasks SET status = ?, completed_at = NULL WHERE id = ?", status, req.params.id));
      }

      if (task.assigned_to) {
        createNotification(task.assigned_to, `Task status updated to ${status}: ${task.title}`, 'task');
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const task = (await dbGet("SELECT team_id FROM tasks WHERE id = ?", req.params.id)) as any;
      if (!task || task.team_id !== auth.teamId) {
        return res.status(404).json({ error: "Task not found" });
      }
      (await dbRun("DELETE FROM tasks WHERE id = ?", req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Budget
  // ---- Team Calendar ----
  app.get("/api/events", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const events = (await dbAll("SELECT * FROM events WHERE team_id = ? ORDER BY date ASC, start_time ASC", auth.teamId));
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/events", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const { title, description, date, start_time, end_time, location, event_type, created_by } = req.body;
      if (!title || !date) {
        return res.status(400).json({ error: "Title and date are required" });
      }
      const info = (await dbRun(
        "INSERT INTO events (title, description, date, start_time, end_time, location, event_type, team_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      , title,
        description || '',
        date,
        start_time || '',
        end_time || '',
        location || '',
        event_type || 'meeting',
        auth.teamId,
        created_by || auth.memberId));
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/events/:id", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const { title, description, date, start_time, end_time, location, event_type } = req.body;
      const existing: any = (await dbGet("SELECT * FROM events WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Event not found" });
      (await dbRun(
        "UPDATE events SET title = ?, description = ?, date = ?, start_time = ?, end_time = ?, location = ?, event_type = ? WHERE id = ?"
      , title ?? existing.title,
        description ?? existing.description,
        date ?? existing.date,
        start_time ?? existing.start_time,
        end_time ?? existing.end_time,
        location ?? existing.location,
        event_type ?? existing.event_type,
        req.params.id));
      res.json({ ok: true });
    } catch (error) {
      console.error("Error updating event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const existing: any = (await dbGet("SELECT team_id FROM events WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Event not found" });
      (await dbRun("DELETE FROM events WHERE id = ?", req.params.id));
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/budget", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const budget = (await dbAll("SELECT * FROM budget WHERE team_id = ?", auth.teamId));
      res.json(budget);
    } catch (error) {
      console.error("Error fetching budget:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/budget", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const { type, amount, category, description, date } = req.body;
      const info = (await dbRun("INSERT INTO budget (team_id, type, amount, category, description, date) VALUES (?, ?, ?, ?, ?, ?)", auth.teamId, type, amount, category, description, date));

      // Notify board members of budget changes
      const boardMembers = (await dbAll("SELECT id FROM members WHERE is_board = 1 AND team_id = ?", auth.teamId));
      boardMembers.forEach((m: any) => {
        createNotification(m.id, `New budget ${type}: $$${amount} for ${category}`, 'system');
      });

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating budget item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/budget/:id", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const existing: any = (await dbGet("SELECT team_id FROM budget WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      (await dbRun("DELETE FROM budget WHERE id = ?", req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting budget item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Outreach
  app.get("/api/outreach", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const outreach = (await dbAll("SELECT * FROM outreach WHERE team_id = ?", auth.teamId));
      res.json(outreach);
    } catch (error) {
      console.error("Error fetching outreach:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/outreach", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const { title, description, date, hours, location } = req.body;
      const info = (await dbRun("INSERT INTO outreach (title, description, date, hours, location, team_id) VALUES (?, ?, ?, ?, ?, ?)", title, description, date, hours, location, auth.teamId));

      // Notify everyone of new outreach
      const allMembers = (await dbAll("SELECT id FROM members WHERE team_id = ?", auth.teamId));
      allMembers.forEach((m: any) => {
        createNotification(m.id, `New outreach event: ${title} at ${location}`, 'system');
      });

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating outreach event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/outreach/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const existing: any = (await dbGet("SELECT team_id FROM outreach WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      const { title, description, date, hours, location } = req.body || {};
      (await dbRun(
        "UPDATE outreach SET title = ?, description = ?, date = ?, hours = ?, location = ? WHERE id = ?",
        title || '', description || '', date || '', hours || 0, location || '', req.params.id
      ));
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating outreach event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/outreach/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const existing: any = (await dbGet("SELECT team_id FROM outreach WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      (await dbRun("DELETE FROM outreach WHERE id = ?", req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting outreach event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Inventory
  app.get("/api/inventory", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const inventory = (await dbAll(`
        SELECT i.*, m.name as assigned_member_name 
        FROM inventory i 
        LEFT JOIN members m ON i.assigned_to = m.id
        WHERE i.team_id = ?
        ORDER BY i.date_added DESC
      `, auth.teamId));
      res.json(inventory);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/inventory", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const { name, part_number, sku, quantity, assigned_to, location, category, description, cost } = req.body;
      if (!sku || !name) {
        return res.status(400).json({ error: "SKU and name are required" });
      }
      const date_added = new Date().toISOString();
      const info = (await dbRun(`
        INSERT INTO inventory (team_id, name, part_number, sku, quantity, assigned_to, location, category, description, cost, date_added) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, auth.teamId, name, part_number || null, sku, quantity || 0, assigned_to || null, location || '', category || '', description || '', cost || 0, date_added));

      res.json({ id: info.lastInsertRowid });
    } catch (error: any) {
      console.error("Error creating inventory item:", error);
      if (error.message.includes("UNIQUE constraint failed")) {
        res.status(400).json({ error: "SKU already exists" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.patch("/api/inventory/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const { name, part_number, sku, quantity, assigned_to, location, category, description, cost } = req.body;
      const id = req.params.id;
      const existing: any = (await dbGet("SELECT team_id FROM inventory WHERE id = ?", id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      
      (await dbRun(`
        UPDATE inventory 
        SET name = ?, part_number = ?, sku = ?, quantity = ?, assigned_to = ?, location = ?, category = ?, description = ?, cost = ?
        WHERE id = ?
      `, name, part_number, sku, quantity, assigned_to || null, location, category, description, cost, id));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating inventory item:", error);
      if (error.message.includes("UNIQUE constraint failed")) {
        res.status(400).json({ error: "SKU already exists" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.delete("/api/inventory/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const existing: any = (await dbGet("SELECT team_id FROM inventory WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      (await dbRun("DELETE FROM inventory WHERE id = ?", req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting inventory item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Scrape REV Robotics product page
  app.post("/api/inventory/scrape-rev", async (req, res) => {
    {
      const _srAuth = await requireAdmin(req, res);
      if (!_srAuth) return;
    }
    try {
      const { url } = req.body;
      if (!url || !url.includes("revrobotics.com")) {
        return res.status(400).json({ error: "Invalid REV Robotics URL" });
      }

      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });

      const $ = cheerio.load(String(response.data ?? ''));
      
      const data: any = {};

      // Extract title
      const titleElement = $("h1.productView-title");
      if (titleElement.length > 0) {
        data.name = titleElement.text().trim();
      }

      // Extract SKU
      const skuElement = $("dd.productView-info-value--sku");
      if (skuElement.length > 0) {
        const sku = skuElement.text().trim();
        if (sku) data.sku = sku;
      }

      // Extract Product Code/UPC
      const upcElement = $("dd.productView-info-value--upc");
      if (upcElement.length > 0) {
        const upc = upcElement.text().trim();
        if (upc) data.part_number = upc;
      }

      // Extract price
      const priceElement = $("span.price.price--withoutTax.price--main");
      if (priceElement.length > 0) {
        const priceText = priceElement.text().trim();
        const priceMatch = priceText.match(/[\d.]+/);
        if (priceMatch) {
          data.cost = parseFloat(priceMatch[0]);
        }
      }

      // Extract category if available
      const categoryElement = $("a[href*='/cat/']");
      if (categoryElement.length > 0) {
        data.category = categoryElement.first().text().trim();
      }

      if (!data.name && !data.sku) {
        return res.status(400).json({ error: "Could not extract product information from the page. Make sure the URL is correct." });
      }

      res.json(data);
    } catch (error: any) {
      console.error("Error scraping REV page:", error.message);
      res.status(500).json({ error: "Failed to scrape page: " + error.message });
    }
  });

  // Documentation
  app.get("/api/documentation", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const docs = (await dbAll("SELECT * FROM documentation WHERE team_id = ? ORDER BY date DESC", auth.teamId));
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/documentation", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const { type, title, content, images, date } = req.body;
      const info = (await dbRun("INSERT INTO documentation (type, title, content, images, date, created_at, team_id) VALUES (?, ?, ?, ?, ?, ?, ?)", type, title, content, JSON.stringify(images || []), date, new Date().toISOString(), auth.teamId));
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/documentation/:id", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const existing: any = (await dbGet("SELECT team_id FROM documentation WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      (await dbRun("DELETE FROM documentation WHERE id = ?", req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- AI endpoints (Google Gemini, server-side; key stays in env) ---

  app.post("/api/ai/fetch-news", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", result: "AI features are not configured yet. The team owner needs to add a Gemini API key." });
      }
      const stream = req.query.stream === "true";
      const maxTokens = await getMaxTokens("max_tokens_news", 1024);
      if (stream) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        try {
          await scoutNews(maxTokens, (chunk) => res.write(chunk));
          res.end();
        } catch (err) {
          console.error("AI news stream error:", err);
          res.end("\n\n(Failed to finish the news roundup.)");
        }
        return;
      }
      const result = await scoutNews(maxTokens);
      res.json({ result });
    } catch (error) {
      console.error("AI news error:", error);
      res.status(502).json({ error: "AI request failed", result: "Failed to fetch latest news. Please check your connection." });
    }
  });

  app.post("/api/ai/attendance", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", result: "Insights unavailable." });
      }
      // Prefer server-side data so clients can't spoof another team's records.
      const members = (await dbAll("SELECT id, name FROM members WHERE team_id = ?", auth.teamId)) as any[];
      const records = (await dbAll(
        "SELECT member_id, status FROM attendance WHERE team_id = ? AND date >= date('now', '-30 days')",
        auth.teamId
      )) as any[];
      const criteria = await getAISetting("excuse_criteria", "Excused for school, family emergency, or illness.");
      const prompt = buildAttendancePrompt(records, members, criteria);
      const maxTokens = await getMaxTokens("max_tokens_attendance", 1024);
      const stream = req.query.stream === "true";
      if (stream) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        try {
          await aiStream(ATTENDANCE_SYSTEM, prompt, maxTokens, (chunk) => res.write(chunk));
          res.end();
        } catch (err) {
          console.error("AI attendance stream error:", err);
          res.end("\n\n(Failed to finish insights.)");
        }
        return;
      }
      const result = await aiGenerate(ATTENDANCE_SYSTEM, prompt, maxTokens);
      res.json({ result });
    } catch (error) {
      console.error("AI attendance error:", error);
      res.status(502).json({ error: "AI request failed", result: "Insights unavailable." });
    }
  });

  app.post("/api/ai/check-excuse", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", result: "UNEXCUSED - AI not configured." });
      }
      const reason = String(req.body?.reason || "").slice(0, 500);
      if (!reason.trim()) {
        return res.status(400).json({ error: "Reason required", result: "UNEXCUSED - no reason given." });
      }
      const criteria = await getAISetting("excuse_criteria", "Excused for school, family emergency, or illness.");
      const prompt = buildExcusePrompt(criteria, reason);
      const maxTokens = await getMaxTokens("max_tokens_excuse", 512);
      const stream = req.query.stream === "true";
      if (stream) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        try {
          await aiStream(EXCUSE_SYSTEM, prompt, maxTokens, (chunk) => res.write(chunk));
          res.end();
        } catch (err) {
          console.error("AI excuse stream error:", err);
          res.end("UNEXCUSED - AI error.");
        }
        return;
      }
      const result = await aiGenerate(EXCUSE_SYSTEM, prompt, maxTokens);
      res.json({ result });
    } catch (error) {
      console.error("AI excuse error:", error);
      res.status(502).json({ error: "AI request failed", result: "UNEXCUSED - AI error." });
    }
  });

  app.post("/api/ai/activity-summary", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", result: "Failed to generate summary." });
      }
      const teamId = auth.teamId;
      const openTasks = (await dbAll(
        "SELECT title, status, due_date FROM tasks WHERE team_id = ? AND status != 'done' ORDER BY due_date LIMIT 25",
        teamId
      )) as any[];
      const overdue = (await dbGet(
        "SELECT COUNT(*) AS c FROM tasks WHERE team_id = ? AND status != 'done' AND due_date IS NOT NULL AND due_date < date('now')",
        teamId
      )) as any;
      const recentMessages = (await dbGet(
        "SELECT COUNT(*) AS c FROM messages WHERE team_id = ? AND created_at >= datetime('now', '-7 days')",
        teamId
      ).catch(() => ({ c: 0 }))) as any;
      const budgetRows = (await dbAll("SELECT amount, type FROM budget WHERE team_id = ?", teamId).catch(() => [])) as any[];
      const budgetNet = budgetRows.reduce(
        (sum: number, b: any) => sum + (String(b.type).toLowerCase() === "expense" ? -Math.abs(Number(b.amount) || 0) : Math.abs(Number(b.amount) || 0)),
        0
      );
      const lowStock = (await dbAll(
        "SELECT name, quantity FROM inventory WHERE team_id = ? AND quantity <= 2 ORDER BY quantity LIMIT 10",
        teamId
      ).catch(() => [])) as any[];
      const memberCount = ((await dbGet("SELECT COUNT(*) AS c FROM members WHERE team_id = ?", teamId)) as any)?.c || 0;
      const today = new Date().toISOString().slice(0, 10);
      const prompt = buildCoachPrompt({
        openTasks: openTasks.map((t) => ({ title: t.title, status: t.status, due: t.due_date && t.due_date < today ? `${t.due_date} (overdue)` : t.due_date })),
        overdueTasks: overdue?.c || 0,
        recentMessages: recentMessages?.c || 0,
        budgetNet,
        lowStock,
        memberCount,
      });
      const maxTokens = await getMaxTokens("max_tokens_summary", 1024);
      const stream = req.query.stream === "true";
      if (stream) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        try {
          await aiStream(COACH_SYSTEM, prompt, maxTokens, (chunk) => res.write(chunk));
          res.end();
        } catch (err) {
          console.error("AI summary stream error:", err);
          res.end("\n\n(Failed to finish the summary.)");
        }
        return;
      }
      const result = await aiGenerate(COACH_SYSTEM, prompt, maxTokens);
      res.json({ result });
    } catch (error) {
      console.error("AI summary error:", error);
      res.status(502).json({ error: "AI request failed", result: "Failed to generate summary." });
    }
  });
  app.get("/api/communications", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const comms = (await dbAll("SELECT * FROM communications WHERE team_id = ? ORDER BY date DESC", auth.teamId));
      res.json(comms);
    } catch (error) {
      console.error("Error fetching communications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/communications", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const { recipient, subject, body, date, type } = req.body;
      const info = (await dbRun("INSERT INTO communications (recipient, subject, body, date, type, team_id) VALUES (?, ?, ?, ?, ?, ?)", recipient, subject, body, date, type || 'email', auth.teamId));
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating communication:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/communications/:id", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const existing: any = (await dbGet("SELECT team_id FROM communications WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      (await dbRun("DELETE FROM communications WHERE id = ?", req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting communication:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- Code Management Endpoints ---
  console.log("[Code Manager] Initializing code management endpoints...");
  const codeRepoDir = path.join(process.cwd(), "code_repos");
  
  if (!fs.existsSync(codeRepoDir)) {
    fs.mkdirSync(codeRepoDir, { recursive: true });
  }
  console.log("[Code Manager] Repository directory:", codeRepoDir);

  // Helper to get team repo path
  const getTeamRepoPath = (teamId: number) => path.join(codeRepoDir, `team_${teamId}`);
  
  // Helper to get git instance for team
  const getGitInstance = (teamId: number): SimpleGit => {
    const repoPath = getTeamRepoPath(teamId);
    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }
    return simpleGit(repoPath);
  };

  // Initialize team repo
  const initTeamRepo = async (teamId: number) => {
    const git = getGitInstance(teamId);
    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        await git.init();
        await git.addConfig('user.email', 'robot@team.local');
        await git.addConfig('user.name', 'FTC Robot');
      }
    } catch (e) {
      console.error("Error initializing repo:", e);
    }
  };

  // POST: Get all code files for a team
  app.get("/api/code/files/:teamId", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = parseInt(req.params.teamId, 10);
      if (teamId !== auth.teamId) return res.status(403).json({ error: "Not your workspace" });
      console.log("[Code Endpoint] GET /api/code/files/:teamId called with teamId:", teamId);
      if (isNaN(teamId)) {
        return res.status(400).json({ error: "Invalid team ID" });
      }
      const files = (await dbAll("SELECT * FROM code_files WHERE team_id = ? ORDER BY updated_at DESC", teamId));
      console.log("[Code Endpoint] Found", files.length, "files for team", teamId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching code files:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  console.log("[Code Manager] GET /api/code/files/:teamId registered");

  // POST: Create/upload code file
  app.post("/api/code/files", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const { file_name, file_path, language = 'java', content } = req.body;
      const team_id = auth.teamId;
      const author_id = auth.memberId;
      
      console.log("[Code Endpoint] POST /api/code/files called with:", { team_id, file_name, file_path, language, author_id });
      
      if (!team_id || !file_name || !file_path || !author_id) {
        console.log("[Code Endpoint] Missing required fields");
        return res.status(400).json({ error: "Missing required fields: team_id, file_name, file_path, author_id" });
      }

      const now = new Date().toISOString();
      const fileSize = Buffer.byteLength(content || '', 'utf-8');

      const fileInfo = (await dbRun(`
        INSERT OR REPLACE INTO code_files (team_id, file_name, file_path, language, file_size, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, team_id, file_name, file_path, language, fileSize, author_id, now, now));

      const fileId = fileInfo.lastInsertRowid as number;

      // Create initial commit to drafts
      const hash = `draft_${Date.now()}`;
      (await dbRun(`
        INSERT INTO code_commits (team_id, file_id, branch, author_id, message, content, hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, team_id, fileId, 'drafts', author_id, `Created ${file_name}`, content || '', hash, now));

      console.log("[Code Endpoint] File created successfully. ID:", fileId);
      res.json({ id: fileId, file_name, file_path, language });
    } catch (error) {
      console.error("Error creating code file:", error);
      res.status(500).json({ error: "Internal server error", details: String(error) });
    }
  });
  console.log("[Code Manager] POST /api/code/files registered");

  // GET: Get code file content with history
  app.get("/api/code/files/:fileId/content", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const file = (await dbGet("SELECT * FROM code_files WHERE id = ? AND team_id = ?", fileId, auth.teamId)) as any;
      if (!file) return res.status(404).json({ error: "File not found" });
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const commits = (await dbAll(`
        SELECT cc.*, m.name as author_name 
        FROM code_commits cc
        LEFT JOIN members m ON cc.author_id = m.id
        WHERE cc.file_id = ?
        ORDER BY cc.created_at DESC
      `, fileId));

      // Get drafts content
      const draftCommit = (await dbGet(`
        SELECT content FROM code_commits 
        WHERE file_id = ? AND branch = 'drafts'
        ORDER BY created_at DESC LIMIT 1
      `, fileId)) as any;

      // Get main content
      const mainCommit = (await dbGet(`
        SELECT content FROM code_commits 
        WHERE file_id = ? AND branch = 'main'
        ORDER BY created_at DESC LIMIT 1
      `, fileId)) as any;

      res.json({
        file,
        content: {
          drafts: draftCommit?.content || '',
          main: mainCommit?.content || ''
        },
        commits
      });
    } catch (error) {
      console.error("Error fetching code content:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST: Save draft
  app.post("/api/code/files/:fileId/draft", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const file = (await dbGet("SELECT id FROM code_files WHERE id = ? AND team_id = ?", fileId, auth.teamId)) as any;
      if (!file) return res.status(404).json({ error: "File not found" });
      const { content } = req.body;
      const author_id = auth.memberId;
      
      const now = new Date().toISOString();
      const hash = `draft_${Date.now()}`;

      const info = (await dbRun(`
        INSERT INTO code_commits (team_id, file_id, branch, author_id, message, content, hash, created_at)
        VALUES (
          (SELECT team_id FROM code_files WHERE id = ?),
          ?, 'drafts', ?, 'Auto-save draft', ?, ?, ?
        )
      `, fileId, fileId, author_id, content, hash, now));

      // Update file's updated_at
      (await dbRun("UPDATE code_files SET updated_at = ? WHERE id = ?", now, fileId));

      res.json({ success: true, id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving draft:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST: Commit to main (publish)
  app.post("/api/code/files/:fileId/commit", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const { message } = req.body;
      const author_id = auth.memberId;

      const file = (await dbGet("SELECT * FROM code_files WHERE id = ? AND team_id = ?", fileId, auth.teamId)) as any;
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Get latest draft content
      const draft = (await dbGet(`
        SELECT content FROM code_commits 
        WHERE file_id = ? AND branch = 'drafts'
        ORDER BY created_at DESC LIMIT 1
      `, fileId)) as any;

      const now = new Date().toISOString();
      const hash = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const info = (await dbRun(`
        INSERT INTO code_commits (team_id, file_id, branch, author_id, message, content, hash, created_at)
        VALUES (?, ?, 'main', ?, ?, ?, ?, ?)
      `, file.team_id, fileId, author_id, message || 'Commit to main', draft?.content || '', hash, now));

      // Update file's updated_at
      (await dbRun("UPDATE code_files SET updated_at = ? WHERE id = ?", now, fileId));

      // Broadcast to WebSocket clients
      broadcastToTeam(file.team_id, {
        type: 'code_commit',
        file_id: fileId,
        team_id: file.team_id,
        message: message || 'New commit',
        hash,
        timestamp: now
      });

      res.json({ success: true, hash });
    } catch (error) {
      console.error("Error committing code:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET: Get commit history
  app.get("/api/code/files/:fileId/history", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const branch = (req.query.branch as string) || 'main';
      const fcheck = (await dbGet("SELECT id FROM code_files WHERE id = ? AND team_id = ?", fileId, auth.teamId)) as any;
      if (!fcheck) return res.status(404).json({ error: "File not found" });

      const commits = (await dbAll(`
        SELECT cc.*, m.name as author_name 
        FROM code_commits cc
        LEFT JOIN members m ON cc.author_id = m.id
        WHERE cc.file_id = ? AND cc.branch = ?
        ORDER BY cc.created_at DESC
      `, fileId, branch));

      res.json(commits);
    } catch (error) {
      console.error("Error fetching commit history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET: Get specific commit
  app.get("/api/code/commits/:commitId", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const commit = (await dbGet(`
        SELECT cc.*, m.name as author_name, cf.file_name
        FROM code_commits cc
        LEFT JOIN members m ON cc.author_id = m.id
        LEFT JOIN code_files cf ON cc.file_id = cf.id
        WHERE cc.id = ? AND cf.team_id = ?
      `, req.params.commitId, auth.teamId)) as any;

      if (!commit) {
        return res.status(404).json({ error: "Commit not found" });
      }

      res.json(commit);
    } catch (error) {
      console.error("Error fetching commit:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST: Revert a commit by creating a new commit on the chosen branch (main or drafts)
  app.post("/api/code/commits/:commitId/revert", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const commitId = parseInt(req.params.commitId, 10);
      if (isNaN(commitId)) return res.status(400).json({ error: "Invalid commit ID" });

      const { branch = 'main' } = req.body as any;
      const author_id = auth.memberId;

      const commit = (await dbGet("SELECT * FROM code_commits WHERE id = ?", commitId)) as any;
      if (!commit) return res.status(404).json({ error: 'Commit not found' });

      const file = (await dbGet("SELECT * FROM code_files WHERE id = ? AND team_id = ?", commit.file_id, auth.teamId)) as any;
      if (!file) return res.status(404).json({ error: 'File not found for commit' });

      const now = new Date().toISOString();
      const hash = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      (await dbRun(`
        INSERT INTO code_commits (team_id, file_id, branch, author_id, message, content, hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, file.team_id, file.id, branch, author_id || null, `Revert to commit ${commit.hash}`, commit.content, hash, now));

      (await dbRun("UPDATE code_files SET updated_at = ? WHERE id = ?", now, file.id));

      broadcastToTeam(file.team_id, {
        type: 'code_revert',
        file_id: file.id,
        team_id: file.team_id,
        branch,
        hash,
        timestamp: now
      });

      res.json({ success: true, hash });
    } catch (error) {
      console.error('Error reverting commit:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST: Download code file
  app.post("/api/code/files/:fileId/download", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const { branch = 'main' } = req.body;

      const file = (await dbGet("SELECT * FROM code_files WHERE id = ? AND team_id = ?", fileId, auth.teamId)) as any;
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const commit = (await dbGet(`
        SELECT content FROM code_commits 
        WHERE file_id = ? AND branch = ?
        ORDER BY created_at DESC LIMIT 1
      `, fileId, branch)) as any;

      if (!commit) {
        return res.status(404).json({ error: "No content found for this branch" });
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
      res.send(commit.content);
    } catch (error) {
      console.error("Error downloading code:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE: Delete code file
  app.delete("/api/code/files/:fileId", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const file = (await dbGet("SELECT id FROM code_files WHERE id = ? AND team_id = ?", fileId, auth.teamId)) as any;
      if (!file) return res.status(404).json({ error: "File not found" });
      (await dbRun("DELETE FROM code_commits WHERE file_id = ?", fileId));
      (await dbRun("DELETE FROM code_files WHERE id = ?", fileId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting code file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", async (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
