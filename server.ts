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
  scoutFeed,
  parseScoutFeed,
  buildAttendancePrompt,
  buildCoachPrompt,
  buildHelperChat,
  ATTENDANCE_SYSTEM,
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
    is_active INTEGER DEFAULT 1, -- 0 = removed from team; history (messages, tasks, attendance) is kept
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

  CREATE TABLE IF NOT EXISTS code_repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    repo_url TEXT NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    file_tree TEXT, -- JSON array of {path, type: 'blob'|'tree', size}
    file_count INTEGER DEFAULT 0,
    synced_at TEXT,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    UNIQUE(team_id)
  );

  CREATE TABLE IF NOT EXISTS bruno_chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL, -- owner
    title TEXT,
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS bruno_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL, -- 'user' | 'model'
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(chat_id) REFERENCES bruno_chats(id)
  );

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#71717A',
    permissions TEXT DEFAULT '[]', -- JSON array of permission keys; ["*"] = all
    position INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0, -- 1 for seeded Admin/Member roles (can't be edited/deleted)
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS member_roles (
    member_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (member_id, role_id),
    FOREIGN KEY(member_id) REFERENCES members(id),
    FOREIGN KEY(role_id) REFERENCES roles(id)
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
if (!memberColumns.some((c: any) => c.name === 'discord_id')) {
  (await dbExec("ALTER TABLE members ADD COLUMN discord_id TEXT"));
}
if (!memberColumns.some((c: any) => c.name === 'github_id')) {
  (await dbExec("ALTER TABLE members ADD COLUMN github_id TEXT"));
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
if (!teamColumns.some((c: any) => c.name === 'ftc_team_number')) {
  (await dbExec("ALTER TABLE teams ADD COLUMN ftc_team_number INTEGER"));
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

// code_repos is created via CREATE TABLE IF NOT EXISTS at startup; guard here for
// databases where schema setup ran partially
const codeReposTable = (await dbGet("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'code_repos'")) as any;
if (!codeReposTable) {
  (await dbExec(`CREATE TABLE code_repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    repo_url TEXT NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    file_tree TEXT,
    file_count INTEGER DEFAULT 0,
    synced_at TEXT,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    UNIQUE(team_id)
  )`));
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

// Soft-delete flag for members — removed members keep their history but lose access
if (!(await hasColumn('members', 'is_active'))) {
  (await dbExec("ALTER TABLE members ADD COLUMN is_active INTEGER DEFAULT 1"));
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
  const member = (await dbGet("SELECT id, team_id, account_type FROM members WHERE id = ? AND COALESCE(is_active, 1) = 1", memberId)) as any;
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
  return requirePerm(req, res, "manage_members");
}

// ---- Discord-like roles ----
const ROLE_PERMISSIONS = [
  { key: "manage_members", label: "Manage members" },
  { key: "manage_roles", label: "Manage roles" },
  { key: "manage_budget", label: "Manage budget" },
  { key: "manage_inventory", label: "Manage inventory" },
  { key: "manage_code", label: "Manage code" },
  { key: "manage_calendar", label: "Manage calendar" },
  { key: "manage_attendance", label: "Manage attendance" },
  { key: "manage_tasks", label: "Manage tasks" },
  { key: "manage_outreach", label: "Manage outreach" },
  { key: "view_ai", label: "Use AI features" },
];
const KNOWN_PERMS = new Set(ROLE_PERMISSIONS.map((p) => p.key));

function parsePerms(json: any): string[] {
  try {
    const a = JSON.parse(json || "[]");
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Seed the system roles for a team and backfill existing members:
// account_type 'admin' -> Admin role, everyone else -> Member role.
async function ensureRolesSeeded(teamId: number) {
  const has = (await dbGet("SELECT id FROM roles WHERE team_id = ? LIMIT 1", teamId)) as any;
  if (has) return;
  const adminRole = (await dbRun(
    "INSERT INTO roles (team_id, name, color, permissions, position, is_system) VALUES (?,?,?,?,?,1)",
    teamId, "Admin", "#FFC700", JSON.stringify(["*"]), 0
  )) as any;
  const memberRole = (await dbRun(
    "INSERT INTO roles (team_id, name, color, permissions, position, is_system) VALUES (?,?,?,?,?,1)",
    teamId, "Member", "#71717A", JSON.stringify(["view_ai"]), 1
  )) as any;
  const members = (await dbAll(
    "SELECT id, account_type FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", teamId
  )) as any[];
  for (const m of members) {
    await dbRun(
      "INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?,?)",
      m.id, m.account_type === "admin" ? adminRole.lastInsertRowid : memberRole.lastInsertRowid
    );
  }
}

async function systemRoleId(teamId: number, name: string): Promise<number | null> {
  const r = (await dbGet("SELECT id FROM roles WHERE team_id = ? AND name = ? AND is_system = 1", teamId, name)) as any;
  return r ? r.id : null;
}

// Union of permission keys from the member's roles (roles only, no legacy fallback).
async function rolePerms(memberId: number, teamId: number): Promise<Set<string>> {
  const perms = new Set<string>();
  const rows = (await dbAll(
    "SELECT r.permissions FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.member_id = ? AND r.team_id = ?",
    memberId, teamId
  )) as any[];
  for (const r of rows) for (const p of parsePerms(r.permissions)) perms.add(p);
  return perms;
}

async function getMemberPerms(memberId: number, teamId: number | null): Promise<Set<string>> {
  const perms = teamId ? await rolePerms(memberId, teamId) : new Set<string>();
  // Legacy safety net: members flagged admin before roles existed keep full access.
  const member = (await dbGet("SELECT account_type FROM members WHERE id = ?", memberId)) as any;
  if (member?.account_type === "admin") perms.add("*");
  return perms;
}

async function hasPerm(auth: { memberId: number; teamId: number | null }, perm: string): Promise<boolean> {
  const perms = await getMemberPerms(auth.memberId, auth.teamId);
  return perms.has("*") || perms.has(perm);
}

async function requirePerm(req: any, res: any, perm: string) {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (!(await hasPerm(auth, perm))) {
    res.status(403).json({ error: "You don't have permission for that" });
    return null;
  }
  return auth;
}

// Would this member still count as an admin if excludedRoleId were gone?
// (Pure-legacy admins with no roles at all keep their account_type flag.)
async function wouldBeAdmin(memberId: number, teamId: number, excludedRoleId: number | null): Promise<boolean> {
  const params: any[] = [memberId, teamId];
  let sql = "SELECT r.permissions FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.member_id = ? AND r.team_id = ?";
  if (excludedRoleId) { sql += " AND r.id != ?"; params.push(excludedRoleId); }
  const rows = (await dbAll(sql, ...params)) as any[];
  for (const r of rows) {
    const p = parsePerms(r.permissions);
    if (p.includes("*") || p.includes("manage_members")) return true;
  }
  if (!rows.length) {
    const m = (await dbGet("SELECT account_type FROM members WHERE id = ?", memberId)) as any;
    return m?.account_type === "admin";
  }
  return false;
}

// Keep account_type in sync with roles: anyone holding manage_members (or *)
// counts as an admin for the legacy coarse checks.
async function syncAccountType(memberId: number, teamId: number) {
  const perms = await rolePerms(memberId, teamId);
  const isAdmin = perms.has("*") || perms.has("manage_members");
  await dbRun("UPDATE members SET account_type = ? WHERE id = ?", isAdmin ? "admin" : "student", memberId);
}

async function countAdmins(teamId: number): Promise<number> {
  const members = (await dbAll(
    "SELECT id, account_type FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", teamId
  )) as any[];
  let n = 0;
  for (const m of members) {
    if (m.account_type === "admin") { n++; continue; }
    const perms = await rolePerms(m.id, teamId);
    if (perms.has("*") || perms.has("manage_members")) n++;
  }
  return n;
}

async function memberRoleList(memberId: number, teamId: number) {
  return (await dbAll(
    "SELECT r.id, r.name, r.color FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.member_id = ? AND r.team_id = ? ORDER BY r.position, r.id",
    memberId, teamId
  )) as any[];
}

// Seed (if needed) and give a fresh member their system role.
async function assignSystemRole(teamId: number, memberId: number, name: "Admin" | "Member") {
  await ensureRolesSeeded(teamId);
  const roleId = await systemRoleId(teamId, name);
  if (roleId) await dbRun("INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?,?)", memberId, roleId);
}

// Set the system Admin role to match an explicit admin/student choice
// (used by the member add/edit forms). Custom roles are left alone.
async function setAdminRole(memberId: number, teamId: number, isAdmin: boolean) {
  await ensureRolesSeeded(teamId);
  const adminRoleId = await systemRoleId(teamId, "Admin");
  const memberRoleId = await systemRoleId(teamId, "Member");
  if (isAdmin && adminRoleId) {
    await dbRun("INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?,?)", memberId, adminRoleId);
  } else if (!isAdmin) {
    if (adminRoleId) await dbRun("DELETE FROM member_roles WHERE member_id = ? AND role_id = ?", memberId, adminRoleId);
    if (memberRoleId) await dbRun("INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?,?)", memberId, memberRoleId);
  }
}

// App owner (Sushil) — sees feedback and usage across all workspaces.
// Configure with the OWNER_EMAILS env var (comma-separated).
function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Theme colors must be real 6-digit hex values. Junk strings (e.g. "null",
// " ", "#") would make var(--color-accent) invalid and silently strip the
// volt yellow from the whole UI, so they are stored as NULL (theme default).
function cleanHex(v: any): string | null {
  return (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) ? v.trim() : null;
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
    if (user.is_active === 0) return res.status(403).json({ error: "This account has been removed from the team" });

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
        await assignSystemRole(teamId, mInfo.lastInsertRowid, "Admin");
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
        await assignSystemRole(team.id, mInfo.lastInsertRowid, "Member");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        return res.json({ user, sessionId, team: { id: team.id, name: team.name, access_code: team.access_code } });
      }

      return res.status(400).json({ error: "Choose whether you're signing up as an admin or a student" });
    } catch (e: any) {
      console.error("Signup error:", e);
      return res.status(500).json({ error: "Signup failed — try again" });
    }
  });

  // ---- OAuth (Google, Discord, GitHub) ----
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
  const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

  const OAUTH_PROVIDERS: Record<string, { idColumn: string; label: string }> = {
    google: { idColumn: "google_id", label: "Google" },
    discord: { idColumn: "discord_id", label: "Discord" },
    github: { idColumn: "github_id", label: "GitHub" },
  };

  function randomHex(bytes: number): string {
    const b = new Uint8Array(bytes);
    crypto.getRandomValues(b);
    return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  const oauthStates = new Map<string, { expiry: number; intent: string; provider: string }>(); // state -> {expiry, intent, provider}
  // Pending OAuth signups: token -> {provider, providerSub, email, name, intent, expiry}. Single-use, 10 min.
  const pendingOAuthSignups = new Map<string, { provider: string; providerSub: string; email: string; name: string; intent: string; expiry: number }>();

  function getOAuthRedirectUri(req: any, provider: string): string {
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    if (base) return `${base}/api/auth/${provider}/callback`;
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    return `${proto}://${req.get("host")}/api/auth/${provider}/callback`;
  }

  app.get("/api/auth/config", async (req, res) => {
    res.json({
      googleEnabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
      discordEnabled: !!(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET),
      githubEnabled: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
    });
  });

  // Resolve the current user from a session id (used after Google sign-in)
  app.get("/api/auth/me", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) return res.status(401).json({ error: "No session" });
    const { valid, memberId } = await validateSession(sessionId);
    if (!valid || !memberId) return res.status(401).json({ error: "Invalid session" });
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", memberId)) as any;
    const isOwner = ownerEmails().includes(((user?.email) || "").toLowerCase());
    if (user?.team_id) {
      await ensureRolesSeeded(user.team_id);
      (user as any).roles = await memberRoleList(user.id, user.team_id);
      (user as any).permissions = [...(await getMemberPerms(user.id, user.team_id))];
    } else {
      (user as any).roles = [];
      (user as any).permissions = [];
    }
    res.json({ user, sessionId, isOwner });
  });

  app.get("/api/auth/google", async (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: "Google sign-in is not configured" });
    }
    const rawIntent = (req.query.intent as string) || 'login';
    const intent = ['login', 'admin_signup', 'student_signup', 'signup'].includes(rawIntent) ? rawIntent : 'login';
    const state = randomHex(16);
    oauthStates.set(state, { expiry: Date.now() + 10 * 60 * 1000, intent, provider: 'google' });
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: getOAuthRedirectUri(req, 'google'),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    res.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString());
  });

  // Shared finish step for every OAuth provider: link or create the member, then
  // either start a session (existing member) or stash a single-use signup token.
  async function finishOAuthLogin(provider: string, providerSub: string, email: string, name: string, intent: string, res: any) {
    const idColumn = OAUTH_PROVIDERS[provider].idColumn;
    let member: any = (await dbGet(`SELECT * FROM members WHERE ${idColumn} = ?`, providerSub));
    if (!member) {
      member = (await dbGet("SELECT * FROM members WHERE email = ?", email));
      if (member) {
        (await dbRun(`UPDATE members SET ${idColumn} = ? WHERE id = ?`, providerSub, member.id));
        member = (await dbGet("SELECT * FROM members WHERE id = ?", member.id));
      } else if (intent === 'admin_signup' || intent === 'student_signup' || intent === 'signup') {
        const token = randomHex(32);
        pendingOAuthSignups.set(token, { provider, providerSub, email, name, intent, expiry: Date.now() + 10 * 60 * 1000 });
        return res.redirect(`/?oauth_signup=${token}&intent=${intent}&provider=${provider}`);
      } else {
        return res.redirect("/?oauth_error=not_invited");
      }
    }
    const sessionId = await createSession(member.id);
    if (member.is_active === 0) return res.redirect("/?oauth_error=account_removed");
    res.redirect(`/?oauth_session=${sessionId}`);
  }

  // Shared completion step for every OAuth provider: the identity is verified,
  // now collect the role-specific details (team name for admins, access code for students).
  async function completeOAuthSignup(provider: string, req: any, res: any) {
    try {
      const { token, teamName, teamNumber, accessCode, role } = req.body || {};
      const pending = token ? pendingOAuthSignups.get(token) : undefined;
      if (pending) pendingOAuthSignups.delete(token); // single-use
      if (!pending || pending.expiry < Date.now() || pending.provider !== provider) {
        return res.status(400).json({ error: "Signup expired — please try again" });
      }
      const idColumn = OAUTH_PROVIDERS[provider].idColumn;
      const cleanEmail = (pending.email || '').trim();
      const cleanName = (pending.name || '').trim() || cleanEmail.split('@')[0];
      if (!cleanEmail) return res.status(400).json({ error: "Signup expired — please try again" });
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
          `INSERT INTO members (team_id, name, role, email, password, ${idColumn}, is_setup, is_board, account_type, scopes) VALUES (?, ?, ?, ?, NULL, ?, 1, 1, 'admin', ?)`,
          teamId, cleanName, 'Admin', cleanEmail, pending.providerSub, JSON.stringify(['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin'])
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        await assignSystemRole(teamId, mInfo.lastInsertRowid, "Admin");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        return res.json({ user, sessionId, team: { id: teamId, name: cleanTeam, access_code: code } });
      }

      if (effectiveIntent === 'student_signup') {
        const norm = (accessCode || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!norm) return res.status(400).json({ error: "Enter the access code from your team admin" });
        const team = (await dbGet("SELECT * FROM teams WHERE REPLACE(access_code, '-', '') = ?", norm)) as any;
        if (!team) return res.status(400).json({ error: "That access code doesn't match any team — check it with your admin" });
        const mInfo = (await dbRun(
          `INSERT INTO members (team_id, name, role, email, password, ${idColumn}, is_setup, is_board, account_type, scopes) VALUES (?, ?, ?, ?, NULL, ?, 1, 0, 'student', ?)`,
          team.id, cleanName, 'Member', cleanEmail, pending.providerSub, JSON.stringify([])
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        await assignSystemRole(team.id, mInfo.lastInsertRowid, "Member");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        return res.json({ user, sessionId, team: { id: team.id, name: team.name, access_code: team.access_code } });
      }

      return res.status(400).json({ error: "Signup expired — please try again" });
    } catch (e: any) {
      console.error("OAuth signup completion error:", e);
      return res.status(500).json({ error: "Signup failed — try again" });
    }
  }

  // ---- Discord OAuth ----
  app.get("/api/auth/discord", async (req, res) => {
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      return res.status(400).json({ error: "Discord sign-in is not configured" });
    }
    const rawIntent = (req.query.intent as string) || 'login';
    const intent = ['login', 'admin_signup', 'student_signup', 'signup'].includes(rawIntent) ? rawIntent : 'login';
    const state = randomHex(16);
    oauthStates.set(state, { expiry: Date.now() + 10 * 60 * 1000, intent, provider: 'discord' });
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: getOAuthRedirectUri(req, 'discord'),
      response_type: "code",
      scope: "identify email",
      state,
      prompt: "consent",
    });
    res.redirect("https://discord.com/oauth2/authorize?" + params.toString());
  });

  app.get("/api/auth/discord/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const pending = state ? oauthStates.get(state) : undefined;
      if (state) oauthStates.delete(state);
      if (!code || !pending || pending.expiry < Date.now() || pending.provider !== 'discord') {
        return res.redirect("/?oauth_error=invalid_state");
      }
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: getOAuthRedirectUri(req, 'discord'),
        }),
      });
      if (!tokenRes.ok) throw new Error("Token exchange failed");
      const { access_token } = (await tokenRes.json()) as any;
      const meRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!meRes.ok) throw new Error("Failed to fetch Discord profile");
      const profile = (await meRes.json()) as any;
      if (!profile.email || profile.verified !== true) {
        return res.redirect("/?oauth_error=email_unverified");
      }
      const name = profile.global_name || profile.username || "";
      await finishOAuthLogin('discord', String(profile.id), profile.email, name, pending.intent || 'login', res);
    } catch (error) {
      console.error("Discord OAuth error:", error);
      res.redirect("/?oauth_error=oauth_failed");
    }
  });

  // ---- GitHub OAuth ----
  app.get("/api/auth/github", async (req, res) => {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.status(400).json({ error: "GitHub sign-in is not configured" });
    }
    const rawIntent = (req.query.intent as string) || 'login';
    const intent = ['login', 'admin_signup', 'student_signup', 'signup'].includes(rawIntent) ? rawIntent : 'login';
    const state = randomHex(16);
    oauthStates.set(state, { expiry: Date.now() + 10 * 60 * 1000, intent, provider: 'github' });
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: getOAuthRedirectUri(req, 'github'),
      scope: "user:email",
      state,
    });
    res.redirect("https://github.com/login/oauth/authorize?" + params.toString());
  });

  app.get("/api/auth/github/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const pending = state ? oauthStates.get(state) : undefined;
      if (state) oauthStates.delete(state);
      if (!code || !pending || pending.expiry < Date.now() || pending.provider !== 'github') {
        return res.redirect("/?oauth_error=invalid_state");
      }
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: getOAuthRedirectUri(req, 'github'),
        }),
      });
      if (!tokenRes.ok) throw new Error("Token exchange failed");
      const { access_token, error: tokenError } = (await tokenRes.json()) as any;
      if (!access_token || tokenError) throw new Error("Token exchange failed");
      const ghHeaders = { Authorization: `Bearer ${access_token}`, "User-Agent": "Control-Point" };
      const userRes = await fetch("https://api.github.com/user", { headers: ghHeaders });
      if (!userRes.ok) throw new Error("Failed to fetch GitHub profile");
      const ghUser = (await userRes.json()) as any;
      const emailsRes = await fetch("https://api.github.com/user/emails", { headers: ghHeaders });
      if (!emailsRes.ok) throw new Error("Failed to fetch GitHub emails");
      const emails = (await emailsRes.json()) as any[];
      const primary = Array.isArray(emails)
        ? emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified)
        : undefined;
      if (!primary?.email) {
        return res.redirect("/?oauth_error=email_unverified");
      }
      const name = ghUser.name || ghUser.login || "";
      await finishOAuthLogin('github', String(ghUser.id), primary.email, name, pending.intent || 'login', res);
    } catch (error) {
      console.error("GitHub OAuth error:", error);
      res.redirect("/?oauth_error=oauth_failed");
    }
  });

  // Generic OAuth completion (Discord/GitHub); the Google route below delegates here too.
  app.post("/api/auth/oauth/complete", async (req, res) => {
    const provider = String(req.body?.provider || "");
    if (!OAUTH_PROVIDERS[provider]) return res.status(400).json({ error: "Unknown provider" });
    await completeOAuthSignup(provider, req, res);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const pending = state ? oauthStates.get(state) : undefined;
      if (state) oauthStates.delete(state);
      if (!code || !pending || pending.expiry < Date.now() || pending.provider !== 'google') {
        return res.redirect("/?oauth_error=invalid_state");
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
          redirect_uri: getOAuthRedirectUri(req, 'google'),
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

      await finishOAuthLogin('google', String(profile.sub), profile.email, profile.name || '', intent, res);
    } catch (error) {
      console.error("Google OAuth error:", error);
      res.redirect("/?oauth_error=oauth_failed");
    }
  });

  // Back-compat: the old Google-only completion route now delegates to the generic one.
  app.post("/api/auth/google/complete", async (req, res) => {
    await completeOAuthSignup('google', req, res);
  });

  // --- Self-service account management ---

  const currentSessionId = (req: any): string | null =>
    (req.query?.sessionId as string) || req.body?.sessionId || (req.headers?.['x-session-id'] as string) || null;

  // Log out: invalidate the current session server-side
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sid = currentSessionId(req);
      if (sid) await dbRun("DELETE FROM sessions WHERE id = ?", sid);
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: true }); // logout should never fail client-side
    }
  });

  // Change password (password accounts only)
  app.post("/api/auth/change-password", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }
    const member = (await dbGet("SELECT password FROM members WHERE id = ?", auth.memberId)) as any;
    if (!member) return res.status(404).json({ error: "Account not found" });
    if (!member.password) {
      return res.status(400).json({ error: "This account signs in with Google — there is no password to change" });
    }
    if (!bcrypt.compareSync(String(currentPassword || ""), member.password)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    await dbRun("UPDATE members SET password = ? WHERE id = ?", bcrypt.hashSync(String(newPassword), 10), auth.memberId);
    // Keep this session alive, kill every other one
    const sid = currentSessionId(req);
    if (sid) await dbRun("DELETE FROM sessions WHERE member_id = ? AND id != ?", auth.memberId, sid);
    else await dbRun("DELETE FROM sessions WHERE member_id = ?", auth.memberId);
    res.json({ ok: true });
  });

  // Export my data (GDPR-style download)
  app.get("/api/auth/export", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const member = (await dbGet("SELECT id, team_id, name, role, email, is_setup, is_board, scopes, account_type, avatar_url FROM members WHERE id = ?", auth.memberId)) as any;
    const attendance = await dbAll("SELECT * FROM attendance WHERE member_id = ?", auth.memberId);
    const feedback = await dbAll("SELECT * FROM feedback WHERE user_id = ?", auth.memberId);
    const messages = await dbAll("SELECT * FROM messages WHERE sender_id = ?", auth.memberId);
    const notifications = await dbAll("SELECT * FROM notifications WHERE user_id = ?", auth.memberId);
    res.json({ exported_at: new Date().toISOString(), member, attendance, feedback, messages, notifications });
  });

  // Delete my account — with password confirmation and last-admin guard
  app.delete("/api/auth/account", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const member = (await dbGet("SELECT * FROM members WHERE id = ?", auth.memberId)) as any;
    if (!member) return res.status(404).json({ error: "Account not found" });

    if (member.password) {
      if (!bcrypt.compareSync(String(req.body?.password || ""), member.password)) {
        return res.status(401).json({ error: "Password is incorrect — account not deleted" });
      }
    }

    // Don't orphan a team: the last admin can't delete their account
    if ((member.account_type || 'student') === 'admin' && member.team_id) {
      const row = (await dbGet(
        "SELECT COUNT(*) AS c FROM members WHERE team_id = ? AND (account_type = 'admin' OR is_board = 1)",
        member.team_id
      )) as any;
      if ((row?.c || 0) <= 1) {
        return res.status(409).json({
          error: "You're the only admin of this team. Promote another member to admin (or Board) before deleting your account, so the team isn't left without an owner."
        });
      }
    }

    // Remove avatar file
    try {
      if (member.avatar_url?.startsWith('/uploads/')) {
        const p = path.join(uploadDir, member.avatar_url.slice('/uploads/'.length));
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    } catch { /* best effort */ }

    // Cascade-delete personal data
    await dbRun("DELETE FROM sessions WHERE member_id = ?", auth.memberId);
    await dbRun("DELETE FROM stream_sessions WHERE member_id = ?", auth.memberId);
    await dbRun("DELETE FROM attendance WHERE member_id = ?", auth.memberId);
    await dbRun("DELETE FROM feedback WHERE user_id = ?", auth.memberId);
    await dbRun("DELETE FROM notifications WHERE user_id = ?", auth.memberId);
    await dbRun("DELETE FROM messages WHERE sender_id = ?", auth.memberId);
    await dbRun("DELETE FROM members WHERE id = ?", auth.memberId);
    res.json({ ok: true });
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
    const { name, number, accent_color, primary_color, text_color, ftc_team_number } = req.body;
    // Partial update: only touch columns the caller actually sent, so saving the
    // FTC team number alone can't wipe the workspace name or colors.
    const sets: string[] = [];
    const vals: any[] = [];
    if (name !== undefined) { sets.push("name = ?"); vals.push(name); }
    if (number !== undefined) { sets.push("number = ?"); vals.push(number); }
    if (accent_color !== undefined) { sets.push("accent_color = ?"); vals.push(cleanHex(accent_color)); }
    if (primary_color !== undefined) { sets.push("primary_color = ?"); vals.push(cleanHex(primary_color)); }
    if (text_color !== undefined) { sets.push("text_color = ?"); vals.push(cleanHex(text_color)); }
    if (ftc_team_number !== undefined) {
      const ftcNum = ftc_team_number === null || ftc_team_number === ''
        ? null
        : parseInt(String(ftc_team_number), 10);
      if (ftcNum !== null && (!Number.isInteger(ftcNum) || ftcNum <= 0)) {
        return res.status(400).json({ error: "FTC team number must be a positive integer" });
      }
      sets.push("ftc_team_number = ?"); vals.push(ftcNum);
    }
    if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });
    vals.push(req.params.id);
    (await dbRun(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`, ...vals));
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

  // --- FTC integration (ftc-scout.org, community mirror of official FIRST data) ---
  const FTC_SCOUT_URL = "https://api.ftcscout.org/graphql";
  const ftcCache = new Map<string, { at: number; data: any }>();
  const FTC_CACHE_TTL = 10 * 60 * 1000;

  async function ftcQuery(query: string, variables: any): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(FTC_SCOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`FTC Scout responded with HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // Look up any FTC team number (admin) — used to verify before saving
  app.get("/api/ftc/lookup", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const number = parseInt(String(req.query.number || ""), 10);
    if (!number || number <= 0) return res.status(400).json({ error: "Enter a valid team number" });
    try {
      const data = await ftcQuery(
        `query Lookup($number: Int!) { teamByNumber(number: $number) { number name schoolName rookieYear location { city state country } } }`,
        { number }
      );
      const team = data?.data?.teamByNumber;
      if (!team) return res.status(404).json({ error: "No FTC team found with that number" });
      res.json(team);
    } catch (e: any) {
      res.status(502).json({ error: "Could not reach FTC Scout — try again in a moment" });
    }
  });

  // Connected team's season data: profile, OPR stats with ranks, event history
  async function getFtcTeamPayload(number: number, season: number): Promise<any> {
    const data = await ftcQuery(
      `query TeamData($number: Int!, $season: Int!) {
        teamByNumber(number: $number) {
          number name schoolName rookieYear activeSeasons
          location { city state country }
          quickStats(season: $season) {
            season
            tot { value rank } auto { value rank } dc { value rank } eg { value rank }
          }
          events(season: $season) {
            event { code name start timezone type }
            stats { __typename ... on TeamEventStats${season} { rank wins losses ties } }
            awards { type }
          }
        }
      }`,
      { number, season }
    );
    const t = data?.data?.teamByNumber;
    if (!t) return null;
    const qs = t.quickStats || {};
    const norm = (s: any) => (s ? { value: Math.round((s.value || 0) * 10) / 10, rank: s.rank ?? null } : null);
    return {
      number: t.number,
      name: t.name,
      school: t.schoolName,
      city: t.location?.city, state: t.location?.state, country: t.location?.country,
      rookieYear: t.rookieYear,
      seasons: [...new Set((t.activeSeasons || []).filter((s: number) => s >= 2022 && s <= 2025))].sort((a: number, b: number) => b - a),
      season,
      opr: { tot: norm(qs.tot), auto: norm(qs.auto), dc: norm(qs.dc), eg: norm(qs.eg) },
      events: (t.events || []).map((e: any) => ({
        code: e.event?.code,
        name: e.event?.name,
        date: e.event?.start ? String(e.event.start).slice(0, 10) : null,
        type: e.event?.type || null,
        rank: e.stats?.rank ?? null,
        wins: e.stats?.wins ?? null, losses: e.stats?.losses ?? null, ties: e.stats?.ties ?? null,
        awards: (e.awards || []).map((a: any) => a.type).filter(Boolean),
      })).sort((a: any, b: any) => (a.date || "").localeCompare(b.date || "")),
    };
  }

  app.get("/api/ftc/team", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseInt(String(req.query.season || "2025"), 10);
    if (![2022, 2023, 2024, 2025].includes(season)) {
      return res.status(400).json({ error: "Season data is available for 2022–2025" });
    }
    const team = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", auth.teamId)) as any;
    const number = team?.ftc_team_number;
    if (!number) return res.status(404).json({ error: "No FTC team connected — set your team number in Settings" });

    const cacheKey = `ftc:${number}:${season}`;
    const cached = ftcCache.get(cacheKey);
    if (cached && Date.now() - cached.at < FTC_CACHE_TTL) return res.json(cached.data);

    try {
      const payload = await getFtcTeamPayload(number, season);
      if (!payload) return res.status(404).json({ error: "FTC Scout has no record of that team number" });
      ftcCache.set(cacheKey, { at: Date.now(), data: payload });
      res.json(payload);
    } catch (e: any) {
      res.status(502).json({ error: "Could not reach FTC Scout — try again in a moment" });
    }
  });

  // Members — scoped to the caller's workspace
  app.get("/api/members", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    await ensureRolesSeeded(auth.teamId!);
    const members = (await dbAll(`
      SELECT m.*, t.name as team_name 
      FROM members m 
      LEFT JOIN teams t ON m.team_id = t.id
      WHERE m.team_id = ? AND COALESCE(m.is_active, 1) = 1
    `, auth.teamId)) as any[];
    for (const m of members) {
      m.roles = await memberRoleList(m.id, auth.teamId!);
      m.permissions = [...(await getMemberPerms(m.id, auth.teamId!))];
    }
    res.json(members);
  });

  app.post("/api/members", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const { name, role, email, is_board, scopes, account_type, accent_color, primary_color, text_color } = req.body;
    const existing = (await dbGet("SELECT id, is_active, team_id FROM members WHERE email = ?", email)) as any;
    const finalScopes = typeof scopes === 'string' ? scopes : JSON.stringify(scopes || []);
    if (existing && existing.is_active === 0 && existing.team_id === auth.teamId) {
      // Re-adding a previously removed member: restore their account and history
      (await dbRun(
        "UPDATE members SET is_active = 1, name = ?, role = ?, is_board = ?, scopes = ?, account_type = ?, accent_color = ?, primary_color = ?, text_color = ? WHERE id = ?",
        name, role, is_board ? 1 : 0, finalScopes, account_type === 'admin' ? 'admin' : 'student',
        cleanHex(accent_color), cleanHex(primary_color), cleanHex(text_color), existing.id
      ));
      await setAdminRole(existing.id, auth.teamId, account_type === 'admin');
      return res.json({ id: existing.id, restored: true });
    }
    if (existing) return res.status(400).json({ error: "That email is already on the roster" });
    const info = (await dbRun("INSERT INTO members (team_id, name, role, email, is_board, scopes, account_type, accent_color, primary_color, text_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", auth.teamId, name, role, email, is_board ? 1 : 0, finalScopes, account_type === 'admin' ? 'admin' : 'student', cleanHex(accent_color), cleanHex(primary_color), cleanHex(text_color)));
    await assignSystemRole(auth.teamId, (info as any).lastInsertRowid, account_type === 'admin' ? "Admin" : "Member");
    res.json({ id: (info as any).lastInsertRowid });
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
      const admins = (await dbGet("SELECT COUNT(*) as n FROM members WHERE team_id = ? AND account_type = 'admin' AND COALESCE(is_active, 1) = 1", auth.teamId)) as any;
      if (admins.n <= 1) return res.status(400).json({ error: "You need at least one admin — promote someone else first" });
    }

    // Only update color fields if they're explicitly provided (not undefined)
    const updates: any = {
      name, role, email,
      is_board: is_board ? 1 : 0,
      scopes: finalScopes,
      account_type: nextType,
    };

    if (accent_color !== undefined) updates.accent_color = cleanHex(accent_color);
    if (primary_color !== undefined) updates.primary_color = cleanHex(primary_color);
    if (text_color !== undefined) updates.text_color = cleanHex(text_color);

    const columns = Object.keys(updates);
    const setClause = columns.map(col => `${col} = ?`).join(', ');

    (await dbRun(`UPDATE members SET ${setClause} WHERE id = ?`, ...Object.values(updates), memberId));

    // Keep the system Admin role aligned with an explicit admin/student change,
    // then reconcile account_type with any custom roles the member holds.
    await setAdminRole(memberId, auth.teamId, nextType === 'admin');
    await syncAccountType(memberId, auth.teamId);

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
    if (accent_color !== undefined) updates.accent_color = cleanHex(accent_color);
    if (primary_color !== undefined) updates.primary_color = cleanHex(primary_color);
    if (text_color !== undefined) updates.text_color = cleanHex(text_color);
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
      if ((await countAdmins(auth.teamId)) <= 1) return res.status(400).json({ error: "You need at least one admin" });
    }
    // Soft remove: the member loses access immediately, but their messages,
    // tasks, attendance, and other history stay intact.
    (await dbRun("UPDATE members SET is_active = 0 WHERE id = ?", memberId));
    res.json({ success: true });
  });

  // ---- Roles (Discord-like) ----
  // List roles with member counts. Any team member can view.
  app.get("/api/roles", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    await ensureRolesSeeded(auth.teamId!);
    const roles = (await dbAll(
      "SELECT * FROM roles WHERE team_id = ? ORDER BY position, id", auth.teamId
    )) as any[];
    const counts = (await dbAll(
      `SELECT mr.role_id as role_id, COUNT(*) as n FROM member_roles mr
       JOIN members m ON m.id = mr.member_id
       WHERE m.team_id = ? AND COALESCE(m.is_active, 1) = 1 GROUP BY mr.role_id`,
      auth.teamId
    )) as any[];
    const countBy = new Map(counts.map((c: any) => [c.role_id, c.n]));
    res.json(roles.map((r: any) => ({
      ...r,
      permissions: parsePerms(r.permissions),
      member_count: countBy.get(r.id) || 0,
    })));
  });

  app.get("/api/role-permissions", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    res.json(ROLE_PERMISSIONS);
  });

  // Create a custom role (manage_roles only)
  app.post("/api/roles", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_roles");
    if (!auth) return;
    await ensureRolesSeeded(auth.teamId!);
    const name = String(req.body?.name || "").trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: "Role name is required" });
    const color = cleanHex(req.body?.color) || "#71717A";
    const permissions = Array.isArray(req.body?.permissions)
      ? [...new Set(req.body.permissions.filter((p: any) => KNOWN_PERMS.has(p)))]
      : [];
    const maxPos = (await dbGet("SELECT COALESCE(MAX(position), -1) as m FROM roles WHERE team_id = ?", auth.teamId)) as any;
    const info = (await dbRun(
      "INSERT INTO roles (team_id, name, color, permissions, position, is_system) VALUES (?,?,?,?,?,0)",
      auth.teamId, name, color, JSON.stringify(permissions), (maxPos?.m ?? -1) + 1
    )) as any;
    res.json({ id: info.lastInsertRowid });
  });

  // Edit a custom role (system roles are fixed)
  app.patch("/api/roles/:id", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_roles");
    if (!auth) return;
    await ensureRolesSeeded(auth.teamId!);
    const roleId = parseInt(req.params.id, 10);
    const role = (await dbGet("SELECT * FROM roles WHERE id = ? AND team_id = ?", roleId, auth.teamId)) as any;
    if (!role) return res.status(404).json({ error: "Role not found" });
    if (role.is_system) return res.status(403).json({ error: "System roles can't be edited" });
    const updates: any = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim().slice(0, 40);
      if (!name) return res.status(400).json({ error: "Role name is required" });
      updates.name = name;
    }
    if (req.body?.color !== undefined) updates.color = cleanHex(req.body.color) || "#71717A";
    if (req.body?.permissions !== undefined) {
      updates.permissions = JSON.stringify(
        Array.isArray(req.body.permissions)
          ? [...new Set(req.body.permissions.filter((p: any) => KNOWN_PERMS.has(p)))]
          : []
      );
    }
    if (Object.keys(updates).length) {
      const cols = Object.keys(updates);
      await dbRun(`UPDATE roles SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, ...Object.values(updates), roleId);
    }
    // Re-sync admin flags: a role gaining/losing manage_members promotes/demotes holders.
    const holders = (await dbAll("SELECT member_id FROM member_roles WHERE role_id = ?", roleId)) as any[];
    for (const h of holders) await syncAccountType(h.member_id, auth.teamId!);
    res.json({ success: true });
  });

  // Delete a custom role (system roles are fixed); never strand the team without an admin.
  app.delete("/api/roles/:id", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_roles");
    if (!auth) return;
    await ensureRolesSeeded(auth.teamId!);
    const roleId = parseInt(req.params.id, 10);
    const role = (await dbGet("SELECT * FROM roles WHERE id = ? AND team_id = ?", roleId, auth.teamId)) as any;
    if (!role) return res.status(404).json({ error: "Role not found" });
    if (role.is_system) return res.status(403).json({ error: "System roles can't be deleted" });
    const holders = (await dbAll(
      `SELECT m.id FROM member_roles mr JOIN members m ON m.id = mr.member_id
       WHERE mr.role_id = ? AND COALESCE(m.is_active, 1) = 1`, roleId
    )) as any[];
    // Would deleting this role leave zero admins?
    const members = (await dbAll(
      "SELECT id FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", auth.teamId
    )) as any[];
    let adminsAfter = 0;
    for (const m of members) {
      if (await wouldBeAdmin(m.id, auth.teamId!, roleId)) adminsAfter++;
    }
    if (adminsAfter <= 0) {
      return res.status(400).json({ error: "Can't delete this role — the team would be left without an admin" });
    }
    await dbRun("DELETE FROM member_roles WHERE role_id = ?", roleId);
    await dbRun("DELETE FROM roles WHERE id = ?", roleId);
    for (const h of holders) await syncAccountType(h.id, auth.teamId!);
    res.json({ success: true });
  });

  // Assign a role to a member (manage_roles only) — this is how you make extra admins.
  app.post("/api/members/:id/roles", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_roles");
    if (!auth) return;
    await ensureRolesSeeded(auth.teamId!);
    const memberId = parseInt(req.params.id, 10);
    const roleId = parseInt(req.body?.role_id, 10);
    const target = (await dbGet(
      "SELECT id FROM members WHERE id = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", memberId, auth.teamId
    )) as any;
    if (!target) return res.status(404).json({ error: "Member not found" });
    const role = (await dbGet("SELECT id FROM roles WHERE id = ? AND team_id = ?", roleId, auth.teamId)) as any;
    if (!role) return res.status(404).json({ error: "Role not found" });
    await dbRun("INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?,?)", memberId, roleId);
    await syncAccountType(memberId, auth.teamId!);
    res.json({ success: true });
  });

  // Revoke a role from a member (manage_roles only); last-admin guard applies.
  app.delete("/api/members/:id/roles/:roleId", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_roles");
    if (!auth) return;
    await ensureRolesSeeded(auth.teamId!);
    const memberId = parseInt(req.params.id, 10);
    const roleId = parseInt(req.params.roleId, 10);
    const target = (await dbGet(
      "SELECT id, account_type FROM members WHERE id = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", memberId, auth.teamId
    )) as any;
    if (!target) return res.status(404).json({ error: "Member not found" });
    const role = (await dbGet("SELECT * FROM roles WHERE id = ? AND team_id = ?", roleId, auth.teamId)) as any;
    if (!role) return res.status(404).json({ error: "Role not found" });
    if (!(await wouldBeAdmin(memberId, auth.teamId!, roleId)) && (await countAdmins(auth.teamId!)) <= 1) {
      return res.status(400).json({ error: "You need at least one admin — promote someone else first" });
    }
    await dbRun("DELETE FROM member_roles WHERE member_id = ? AND role_id = ?", memberId, roleId);
    await syncAccountType(memberId, auth.teamId!);
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

  // Shared team-event insert (used by the admin route and by Bruno).
  async function insertTeamEvent(teamId: number, memberId: number, e: { title: string; date: string; time?: string; notes?: string }) {
    const info = (await dbRun(
      "INSERT INTO events (title, description, date, start_time, end_time, location, event_type, team_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      e.title, e.notes || "", e.date, e.time || "", "", "", "meeting", teamId, memberId
    )) as any;
    return info.lastInsertRowid;
  }

  app.post("/api/events", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const { title, description, date, start_time, end_time, location, event_type, created_by } = req.body;
      if (!title || !date) {
        return res.status(400).json({ error: "Title and date are required" });
      }
      const id = await insertTeamEvent(auth.teamId, Number(created_by) || auth.memberId, {
        title, date, time: start_time, notes: description,
      });
      // Preserve the extra fields the admin form collects
      (await dbRun("UPDATE events SET end_time = ?, location = ?, event_type = ? WHERE id = ?",
        end_time || '', location || '', event_type || 'meeting', id));
      res.json({ id });
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

  // goBILDA order PDF → inventory import (parse in memory, then user-confirmed upsert)
  const pdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      const ok = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
      if (ok) cb(null, true);
      else cb(new Error("Only PDF files are allowed"));
    },
  });

  /** Heuristic line-item parser for goBILDA order/invoice PDFs.
   *  goBILDA SKUs look like 5203-2402-0019 or 5027103001. Each line holding a
   *  SKU is treated as one line item: name = nearby text, qty = nearby integer,
   *  unit price = first $ amount on the line. Callers review before importing. */
  function parseGobildaOrder(text: string) {
    const SKU_RE = /\b(\d{4}-\d{4}-\d{4}|\d{10})\b/;
    const items = new Map<string, { sku: string; name: string; quantity: number; unitPrice: number }>();
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(SKU_RE);
      if (!m || m.index == null) continue;
      const sku = m[1];

      const amounts = [...line.matchAll(/\$ ?([\d,]+\.\d{2})/g)].map((x) => parseFloat(x[1].replace(/,/g, "")));

      let qty: number | null = null;
      const qm =
        line.match(/(?:qty|quantity)[\s:]*(\d{1,4})/i) ||
        line.match(/\b(\d{1,4})\s*x\b/i) ||
        line.match(/\bx\s*(\d{1,4})/i);
      if (qm) qty = parseInt(qm[1], 10);
      if (qty == null) {
        const stripped = line.replace(SKU_RE, " ").replace(/\$ ?[\d,]+\.\d{2}/g, " ");
        const ints = [...stripped.matchAll(/\b(\d{1,4})\b/g)]
          .map((x) => parseInt(x[1], 10))
          .filter((n) => n > 0 && n <= 500);
        if (ints.length === 1) qty = ints[0];
      }
      if (qty == null || qty <= 0) qty = 1;

      let name = line
        .slice(0, m.index)
        .replace(/\$ ?[\d,]+\.\d{2}/g, " ")
        .replace(/(?:qty|quantity)[\s:]*\d{1,4}/gi, " ")
        .replace(/\b\d{1,4}\s*x\b/gi, " ")
        .trim();
      if (!name) {
        name = line
          .slice(m.index + sku.length)
          .replace(/\$ ?[\d,]+\.\d{2}/g, " ")
          .replace(/\b\d{1,4}\b/g, " ")
          .replace(/\bx\b/gi, " ")
          .trim();
      }
      name = name.replace(/\s{2,}/g, " ").replace(/^[-–—:;,.]+|[-–—:;,.]+$/g, "").trim();
      if (!name) name = sku;

      const unitPrice = amounts.length ? amounts[0] : 0;
      const prev = items.get(sku);
      if (prev) {
        prev.quantity += qty;
        if (!prev.unitPrice && unitPrice) prev.unitPrice = unitPrice;
      } else {
        items.set(sku, { sku, name: name.slice(0, 120), quantity: qty, unitPrice });
      }
    }
    return [...items.values()];
  }

  app.post("/api/inventory/import-gobilda/parse", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    pdfUpload.single("pdf")(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      try {
        const file = (req as any).file;
        if (!file?.buffer?.length) return res.status(400).json({ error: "No PDF file received" });
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: file.buffer });
        let text = "";
        try {
          const result = await parser.getText();
          text = result?.text || "";
        } finally {
          await parser.destroy().catch(() => {});
        }
        const items = parseGobildaOrder(text);
        if (!items.length) {
          return res.status(422).json({
            error: "No order line items found in this PDF. It may not be a goBILDA order/invoice, or the layout isn't recognized yet — send it to Sushil so the parser can be tuned.",
          });
        }
        res.json({ items, count: items.length });
      } catch (e: any) {
        console.error("goBILDA PDF parse error:", e?.message);
        res.status(500).json({ error: "Could not read that PDF. Make sure it's a valid goBILDA order PDF." });
      }
    });
  });

  app.post("/api/inventory/import-gobilda/confirm", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ error: "No items to import" });
      let added = 0;
      let merged = 0;
      const skipped: string[] = [];
      const date_added = new Date().toISOString();
      for (const it of items.slice(0, 500)) {
        const sku = String(it.sku || "").trim();
        const name = String(it.name || "").trim().slice(0, 120) || sku;
        const quantity = Math.max(0, parseInt(it.quantity, 10) || 0);
        const cost = Math.max(0, parseFloat(it.cost) || 0);
        if (!sku) {
          skipped.push(name || "(unnamed)");
          continue;
        }
        try {
          const existing: any = await dbGet("SELECT id, quantity FROM inventory WHERE team_id = ? AND sku = ?", auth.teamId, sku);
          if (existing) {
            await dbRun("UPDATE inventory SET quantity = quantity + ?, cost = ? WHERE id = ?", quantity, cost, existing.id);
            merged++;
          } else {
            await dbRun(
              "INSERT INTO inventory (team_id, name, part_number, sku, quantity, location, category, description, cost, date_added) VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)",
              auth.teamId,
              name,
              sku,
              sku,
              quantity,
              "Imported from goBILDA order",
              cost,
              date_added
            );
            added++;
          }
        } catch (e: any) {
          // e.g. SKU already claimed by another workspace (SKU uniqueness is global)
          skipped.push(sku);
        }
      }
      res.json({ added, merged, skipped });
    } catch (e) {
      console.error("goBILDA import confirm error:", e);
      res.status(500).json({ error: "Import failed" });
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
      // Team-aware news: pull the connected FTC team's latest stats for the "Your Team" section
      let teamCtx: any = null;
      try {
        const t = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", auth.teamId)) as any;
        if (t?.ftc_team_number) {
          const payload = await getFtcTeamPayload(t.ftc_team_number, 2025);
          if (payload) {
            const ranked = (payload.events || []).filter((e: any) => e.rank != null);
            const best = ranked.length ? ranked.reduce((a: any, b: any) => (a.rank <= b.rank ? a : b)) : null;
            const latest = (payload.events || []).length ? payload.events[payload.events.length - 1] : null;
            teamCtx = {
              number: payload.number, name: payload.name, city: payload.city, state: payload.state,
              season: 2025, gameName: "DECODE", opr: payload.opr,
              bestFinish: best ? { rank: best.rank, event: best.name, date: best.date } : null,
              latestEvent: latest ? { name: latest.name, date: latest.date, rank: latest.rank } : null,
            };
          }
        }
      } catch { /* news works fine without team context */ }
      if (stream) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        try {
          await scoutNews(teamCtx, maxTokens, (chunk) => res.write(chunk));
          res.end();
        } catch (err) {
          console.error("AI news stream error:", err);
          res.end("\n\n(Failed to finish the news roundup.)");
        }
        return;
      }
      const result = await scoutNews(teamCtx, maxTokens);
      res.json({ result });
    } catch (error) {
      console.error("AI news error:", error);
      res.status(502).json({ error: "AI request failed", result: "Failed to fetch latest news. Please check your connection." });
    }
  });

  // --- AI Scout feed (JSON cards for the visual feed; cached per team) ---
  const scoutFeedCache = new Map<number, { at: number; items: any[] }>();
  const SCOUT_FEED_TTL_MS = 6 * 60 * 60 * 1000;

  app.post("/api/ai/scout-feed", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", items: [] });
      }
      const teamKey = auth.teamId ?? 0;
      const force = req.body?.force === true;
      const hit = scoutFeedCache.get(teamKey);
      if (!force && hit && Date.now() - hit.at < SCOUT_FEED_TTL_MS) {
        return res.json({ items: hit.items, cached: true });
      }
      const maxTokens = await getMaxTokens("max_tokens_news", 2048);
      const raw = await scoutFeed(maxTokens);
      const items = parseScoutFeed(raw);
      // Drop YouTube items whose URLs don't resolve to the claimed video — the model
      // sometimes invents video IDs (even real-looking ones). oEmbed is keyless and fast:
      // non-200 means the video doesn't exist, and a title mismatch means the ID was
      // fabricated for an unrelated video.
      const ytRe = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i;
      const STOP = new Set(["the","and","for","with","from","this","that","your","you","our","are","was","will","about","into","over","how","what","when","all"]);
      const sigWords = (s: string) => (s.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((w) => !STOP.has(w));
      const checked = await Promise.all(
        items.map(async (it: any) => {
          const m = String(it.url || "").match(ytRe);
          if (!m) return it;
          try {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 8000);
            const r = await fetch(
              `https://www.youtube.com/oembed?url=${encodeURIComponent(it.url)}&format=json`,
              { signal: ctl.signal }
            );
            clearTimeout(t);
            if (!r.ok) return null;
            let meta: any = null;
            try { meta = await r.json(); } catch { return null; }
            const claimed = new Set(sigWords(String(it.title || "")));
            const actual = new Set(sigWords(String(meta?.title || "")));
            let overlap = 0;
            claimed.forEach((w) => { if (actual.has(w)) overlap++; });
            return overlap >= 2 ? it : null;
          } catch {
            return null;
          }
        })
      );
      const validItems = checked.filter(Boolean);
      if (!validItems.length) {
        return res.status(502).json({ error: "The scout feed came back empty — please try refreshing.", items: [] });
      }
      scoutFeedCache.set(teamKey, { at: Date.now(), items: validItems });
      res.json({ items: validItems });
    } catch (error) {
      console.error("AI scout feed error:", error);
      res.status(502).json({ error: "Could not build the scout feed. Please try again.", items: [] });
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

  // AI excuse checker is skipped for now (per Sushil 2026-09-28).
  // To re-enable: restore the Gemini implementation from git history
  // (commit fb29db6) — buildExcusePrompt/EXCUSE_SYSTEM still live in ai.ts.
  app.post("/api/ai/check-excuse", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    return res.status(501).json({ error: "Excuse checker disabled", result: "UNEXCUSED - AI excuse checker is currently disabled." });
  });

  // --- Bruno: FTC build-mentor chatbot (floating widget) ---
  // Bruno calendar skill: the model ends its reply with a fenced ```event block
  // when the user confirms an event. Parse it, validate, strip it from the
  // visible text. Returns { text, event } where event is null when absent/invalid.
  const EVENT_BLOCK_RE = /```event\s*\r?\n([\s\S]*?)\r?\n```/;
  function extractEventBlock(fullText: string): { text: string; event: { title: string; date: string; time: string; notes: string } | null } {
    const src = String(fullText || "");
    const m = src.match(EVENT_BLOCK_RE);
    if (!m) return { text: src, event: null };
    let event: { title: string; date: string; time: string; notes: string } | null = null;
    try {
      const p = JSON.parse(m[1]);
      const okDate = typeof p?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && !isNaN(new Date(p.date + "T00:00:00").getTime());
      const okTime = !p?.time || (typeof p.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time));
      if (p && typeof p.title === "string" && p.title.trim() && okDate && okTime) {
        event = {
          title: p.title.trim().slice(0, 120),
          date: p.date,
          time: typeof p.time === "string" ? p.time : "",
          notes: typeof p.notes === "string" ? p.notes.trim().slice(0, 500) : "",
        };
      }
    } catch { /* malformed JSON — treat as no event */ }
    return { text: src.replace(EVENT_BLOCK_RE, "").trim(), event };
  }

  app.post("/api/ai/build-helper", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", result: "Bruno isn't set up yet — the team owner needs to add a Gemini API key." });
      }
      const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const messages = raw
        .filter((m: any) => m && (m.role === "user" || m.role === "model") && typeof m.text === "string")
        .slice(-12)
        .map((m: any) => ({ role: m.role, text: m.text.slice(0, 2000) }));
      if (!messages.length || messages[messages.length - 1].role !== "user") {
        return res.status(400).json({ error: "A user message is required" });
      }
      const maxTokens = await getMaxTokens("max_tokens_chat", 1024);
      const stream = req.query.stream === "true";
      const teamContext = await buildChatContext(auth.teamId);
      const todayLine = `Today's date: ${new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })} (America/New_York).`;
      const fullContext = [teamContext, todayLine].filter(Boolean).join("\n\n");
      // After generation, handle a ```event block: create the calendar event,
      // strip the raw block, and append a confirmation line.
      const applyEventBlock = async (rawText: string): Promise<string> => {
        const { text, event } = extractEventBlock(rawText);
        if (!event) return text;
        try {
          await insertTeamEvent(auth.teamId, auth.memberId, event);
          const when = event.time ? `${event.date} at ${event.time}` : event.date;
          return (text ? text + "\n\n" : "") + `📅 Added to the team calendar: **${event.title}** — ${when}.`;
        } catch (e) {
          console.error("Bruno calendar event insert failed:", e);
          return (text ? text + "\n\n" : "") + "⚠️ I couldn't save that to the team calendar — please try again.";
        }
      };
      // Optional chat persistence: validate access, store the user message now
      const chatId = parseInt(req.body?.chatId, 10) || 0;
      let chat: any = null;
      if (chatId) {
        chat = await getBrunoChat(chatId, auth.teamId);
        if (!chat || !canViewBrunoChat(chat, auth.memberId)) {
          return res.status(403).json({ error: "Chat not found" });
        }
        const userText = messages[messages.length - 1].text;
        const msgCount = (await dbGet("SELECT COUNT(*) AS n FROM bruno_messages WHERE chat_id = ?", chat.id)) as any;
        (await dbRun("INSERT INTO bruno_messages (chat_id, role, text) VALUES (?, 'user', ?)", chat.id, String(userText).slice(0, 20000)));
        if (!chat.title && (msgCount?.n || 0) === 0) {
          const autoTitle = String(userText).slice(0, 45).trim();
          (await dbRun("UPDATE bruno_chats SET title = ? WHERE id = ?", (autoTitle || "New chat") + (String(userText).length > 45 ? "…" : ""), chat.id));
        }
        (await dbRun("UPDATE bruno_chats SET updated_at = datetime('now') WHERE id = ?", chat.id));
      }
      if (stream) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        try {
          const fullText = await buildHelperChat(messages, maxTokens, (chunk) => res.write(chunk), fullContext);
          const finalText = await applyEventBlock(fullText);
          if (chat && String(finalText || "").trim()) {
            (await dbRun("INSERT INTO bruno_messages (chat_id, role, text) VALUES (?, 'model', ?)", chat.id, String(finalText).slice(0, 20000)));
          }
          res.end();
        } catch (err) {
          console.error("AI build-helper stream error:", err);
          res.end("\n\n(Something glitched — try asking again.)");
        }
        return;
      }
      const result = await buildHelperChat(messages, maxTokens, undefined, fullContext);
      const finalResult = await applyEventBlock(String(result || ""));
      if (chat) {
        const modelText = String(finalResult || "");
        if (modelText.trim()) {
          (await dbRun("INSERT INTO bruno_messages (chat_id, role, text) VALUES (?, 'model', ?)", chat.id, modelText.slice(0, 20000)));
        }
      }
      res.json({ result: finalResult, chatId: chat ? chat.id : undefined });
    } catch (error) {
      console.error("AI build-helper error:", error);
      res.status(502).json({ error: "AI request failed", result: "Bruno hit a snag — please try again in a moment." });
    }
  });

  // --- Bruno chat history (persistent chats + public team chats) ---
  async function getBrunoChat(chatId: number, teamId: number | null) {
    if (!chatId || !teamId) return null;
    return (await dbGet("SELECT * FROM bruno_chats WHERE id = ? AND team_id = ?", chatId, teamId)) as any;
  }
  function canViewBrunoChat(chat: any, memberId: number) {
    return !!chat && (chat.member_id === memberId || chat.is_public === 1);
  }

  // List: my chats + team's public chats
  app.get("/api/bruno/chats", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!auth.teamId) return res.json([]);
    const chats = (await dbAll(`
      SELECT c.*, m.name AS owner_name,
        (SELECT COUNT(*) FROM bruno_messages WHERE chat_id = c.id) AS message_count
      FROM bruno_chats c
      LEFT JOIN members m ON c.member_id = m.id
      WHERE c.team_id = ? AND (c.member_id = ? OR c.is_public = 1)
      ORDER BY c.updated_at DESC
    `, auth.teamId, auth.memberId)) as any[];
    res.json(chats);
  });

  // Create a chat owned by the caller
  app.post("/api/bruno/chats", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!auth.teamId) return res.status(400).json({ error: "No workspace" });
    const title = typeof req.body?.title === "string" ? req.body.title.slice(0, 120) : null;
    const info = (await dbRun(
      "INSERT INTO bruno_chats (team_id, member_id, title) VALUES (?, ?, ?)",
      auth.teamId, auth.memberId, title
    )) as any;
    const chat = (await dbGet("SELECT * FROM bruno_chats WHERE id = ?", info.lastInsertRowid));
    res.json(chat);
  });

  // Get a chat + its messages (owner or public)
  app.get("/api/bruno/chats/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const chat = await getBrunoChat(parseInt(req.params.id, 10), auth.teamId);
    if (!chat || !canViewBrunoChat(chat, auth.memberId)) {
      return res.status(403).json({ error: "Chat not found" });
    }
    const messages = (await dbAll(
      "SELECT id, role, text, created_at FROM bruno_messages WHERE chat_id = ? ORDER BY id ASC",
      chat.id
    )) as any[];
    res.json({ ...chat, messages });
  });

  // Rename / share — owner only (any member, including students, can share)
  app.patch("/api/bruno/chats/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const chat = await getBrunoChat(parseInt(req.params.id, 10), auth.teamId);
    if (!chat || chat.member_id !== auth.memberId) {
      return res.status(403).json({ error: "Only the chat owner can change this" });
    }
    const updates: string[] = [];
    const params: any[] = [];
    if (typeof req.body?.title === "string") {
      updates.push("title = ?");
      params.push(req.body.title.slice(0, 120));
    }
    if (req.body?.is_public !== undefined) {
      updates.push("is_public = ?");
      params.push(req.body.is_public ? 1 : 0);
    }
    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
    updates.push("updated_at = datetime('now')");
    (await dbRun(`UPDATE bruno_chats SET ${updates.join(", ")} WHERE id = ?`, ...params, chat.id));
    const updated = (await dbGet("SELECT * FROM bruno_chats WHERE id = ?", chat.id));
    res.json(updated);
  });

  // Delete — owner or admin (messages go with it)
  app.delete("/api/bruno/chats/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const chat = await getBrunoChat(parseInt(req.params.id, 10), auth.teamId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const isAdmin = auth.accountType === "admin";
    if (chat.member_id !== auth.memberId && !isAdmin) {
      return res.status(403).json({ error: "Only the chat owner or an admin can delete this" });
    }
    (await dbRun("DELETE FROM bruno_messages WHERE chat_id = ?", chat.id));
    (await dbRun("DELETE FROM bruno_chats WHERE id = ?", chat.id));
    res.json({ success: true });
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

  // ---- GitHub repo linking for the Code page ----
  const GITHUB_UA = "Control-Point";
  const GITHUB_TREE_CAP = 5000;
  const GITHUB_FILE_BYTES_CAP = 100 * 1024;

  async function githubFetch(url: string): Promise<Response> {
    const res = await fetch(url, {
      headers: { "User-Agent": GITHUB_UA, "Accept": "application/vnd.github+json" },
    });
    if (res.status === 403 || res.status === 429) {
      const e: any = new Error("GitHub rate limit hit, try again shortly");
      e.rateLimited = true;
      throw e;
    }
    return res;
  }

  function parseGitHubRepoUrl(input: string): { owner: string; repo: string } | null {
    const s = String(input || "").trim().replace(/\.git\/?$/i, "").replace(/\/+$/, "");
    const m = s.match(/^https?:\/\/(?:www\.)?github\.com\/([^\/\s?#]+)\/([^\/\s?#]+)/i);
    if (!m) return null;
    const owner = m[1], repo = m[2];
    if (!/^[\w.\-]+$/.test(owner) || !/^[\w.\-]+$/.test(repo)) return null;
    return { owner, repo };
  }

  async function fetchRepoTreeFromGitHub(owner: string, repo: string) {
    const repoRes = await githubFetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );
    if (repoRes.status === 404) {
      const e: any = new Error("Repo not found or private — only public repos can be linked");
      e.status = 400;
      throw e;
    }
    if (!repoRes.ok) {
      const e: any = new Error(`GitHub error ${repoRes.status}`);
      e.status = 502;
      throw e;
    }
    const meta = await repoRes.json();
    if (meta.private) {
      const e: any = new Error("Private repos can't be linked — make the repo public first");
      e.status = 400;
      throw e;
    }
    const branch = meta.default_branch || "main";
    const treeRes = await githubFetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    );
    if (!treeRes.ok) {
      const e: any = new Error(`GitHub error ${treeRes.status} while reading the file tree`);
      e.status = 502;
      throw e;
    }
    const treeData = await treeRes.json();
    const entries = ((treeData.tree || []) as any[])
      .filter((e) => e && (e.type === "blob" || e.type === "tree") && typeof e.path === "string")
      .slice(0, GITHUB_TREE_CAP)
      .map((e) => ({ path: e.path, type: e.type, size: e.size || 0 }));
    return { owner, repo: meta.name as string, branch, entries };
  }

  async function saveRepoForTeam(teamId: number, repoUrl: string, data: { owner: string; repo: string; branch: string; entries: any[] }) {
    const now = new Date().toISOString();
    const fileCount = data.entries.filter((e) => e.type === "blob").length;
    (await dbRun(
      `INSERT INTO code_repos (team_id, repo_url, owner, repo, branch, file_tree, file_count, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id) DO UPDATE SET
         repo_url = excluded.repo_url, owner = excluded.owner, repo = excluded.repo,
         branch = excluded.branch, file_tree = excluded.file_tree,
         file_count = excluded.file_count, synced_at = excluded.synced_at`,
      teamId, repoUrl, data.owner, data.repo, data.branch, JSON.stringify(data.entries), fileCount, now
    ));
    return { owner: data.owner, repo: data.repo, branch: data.branch, fileCount, syncedAt: now };
  }

  function repoStatusPayload(row: any) {
    if (!row) return null;
    let fileTree: any[] = [];
    try { fileTree = JSON.parse(row.file_tree || "[]"); } catch { /* keep empty */ }
    return {
      owner: row.owner,
      repo: row.repo,
      repoUrl: row.repo_url,
      branch: row.branch,
      fileCount: row.file_count,
      syncedAt: row.synced_at,
      fileTree,
    };
  }

  function handleRepoError(res: any, error: any) {
    if (error?.rateLimited) return res.status(429).json({ error: "GitHub rate limit hit, try again shortly" });
    if (error?.status) return res.status(error.status).json({ error: error.message });
    console.error("GitHub repo error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }

  // Team chat context: linked GitHub repo's file tree, so Bruno can reference real paths
  async function buildChatContext(teamId: number | null): Promise<string> {
    if (!teamId) return "";
    const row = (await dbGet("SELECT owner, repo, branch, file_count, file_tree, synced_at FROM code_repos WHERE team_id = ?", teamId)) as any;
    if (!row) return "";
    let tree: any[] = [];
    try { tree = JSON.parse(row.file_tree || "[]"); } catch { /* keep empty */ }
    const blobs = tree.filter((e) => e && e.type === "blob").map((e) => e.path as string);
    const srcExts = [".java", ".kt", ".py", ".js", ".ts", ".c", ".cpp", ".h", ".hpp", ".xml", ".gradle", ".md"];
    // Rank: team's own code first (TeamCode/), SDK sample boilerplate last
    const rank = (p: string) => {
      const l = p.toLowerCase();
      if (l.includes("/teamcode/")) return 0;
      if (l.includes("/external/samples/")) return 3;
      if (srcExts.some((x) => l.endsWith(x))) return 1;
      return 2;
    };
    const sorted = [...blobs].sort((a, b) => rank(a) - rank(b));
    let listing = sorted.join("\n");
    if (listing.length > 4000) listing = listing.slice(0, 4000) + "\n…(truncated)";
    return `TEAM CODE REPO\nLinked GitHub repo: ${row.owner}/${row.repo} (branch: ${row.branch}, ${row.file_count} files, synced ${row.synced_at})\nFile tree (paths only):\n${listing}`;
  }

  // Link a GitHub repo (admin only)
  app.post("/api/code/repo", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const parsed = parseGitHubRepoUrl(req.body?.repoUrl);
      if (!parsed) return res.status(400).json({ error: "That doesn't look like a GitHub repo link — paste a github.com/owner/repo URL" });
      const data = await fetchRepoTreeFromGitHub(parsed.owner, parsed.repo);
      const repoUrl = `https://github.com/${data.owner}/${data.repo}`;
      const result = await saveRepoForTeam(auth.teamId!, repoUrl, data);
      res.json(result);
    } catch (error) {
      handleRepoError(res, error);
    }
  });

  // Linked repo status
  app.get("/api/code/repo", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const row = (await dbGet("SELECT * FROM code_repos WHERE team_id = ?", auth.teamId)) as any;
      res.json(repoStatusPayload(row));
    } catch (error) {
      console.error("GitHub repo status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Re-sync the tree (admin only)
  app.post("/api/code/repo/sync", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      const row = (await dbGet("SELECT * FROM code_repos WHERE team_id = ?", auth.teamId)) as any;
      if (!row) return res.status(404).json({ error: "No repo linked yet" });
      const data = await fetchRepoTreeFromGitHub(row.owner, row.repo);
      const result = await saveRepoForTeam(auth.teamId!, row.repo_url, data);
      res.json(result);
    } catch (error) {
      handleRepoError(res, error);
    }
  });

  // Unlink (admin only)
  app.delete("/api/code/repo", async (req, res) => {
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return;
      (await dbRun("DELETE FROM code_repos WHERE team_id = ?", auth.teamId));
      res.json({ success: true });
    } catch (error) {
      console.error("GitHub repo unlink error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Fetch one file's raw content
  app.get("/api/code/repo/file", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const row = (await dbGet("SELECT * FROM code_repos WHERE team_id = ?", auth.teamId)) as any;
      if (!row) return res.status(404).json({ error: "No repo linked yet" });
      const path = String(req.query.path || "").replace(/^\/+/, "");
      if (!path || path.includes("..")) return res.status(400).json({ error: "Invalid file path" });
      let tree: any[] = [];
      try { tree = JSON.parse(row.file_tree || "[]"); } catch { /* keep empty */ }
      const entry = tree.find((e) => e.type === "blob" && e.path === path);
      if (!entry) return res.status(404).json({ error: "File not in the linked repo's tree" });
      if (entry.size > GITHUB_FILE_BYTES_CAP) {
        return res.status(400).json({ error: "That file is over 100KB — open it on GitHub instead" });
      }
      const rawRes = await githubFetch(
        `https://raw.githubusercontent.com/${encodeURIComponent(row.owner)}/${encodeURIComponent(row.repo)}/${encodeURIComponent(row.branch)}/${path.split("/").map(encodeURIComponent).join("/")}`
      );
      if (rawRes.status === 403 || rawRes.status === 429) {
        return res.status(429).json({ error: "GitHub rate limit hit, try again shortly" });
      }
      if (!rawRes.ok) return res.status(502).json({ error: `GitHub returned ${rawRes.status}` });
      const text = await rawRes.text();
      res.json({ path, content: text.slice(0, GITHUB_FILE_BYTES_CAP) });
    } catch (error) {
      handleRepoError(res, error);
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
