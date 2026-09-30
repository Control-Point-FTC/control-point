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
import crypto from "crypto";
import bcrypt from "bcryptjs";
import multer from "multer";
import { simpleGit, SimpleGit } from "simple-git";
import axios from "axios";
import * as cheerio from "cheerio";
import { dbGet, dbAll, dbRun, dbExec, dbBatch } from "./db.js";
import {
  ONBOARDING_DDL,
  defaultOnboardingState,
  mergeOnboardingState,
  validateOnboardingPatch,
  normalizeOnboardingEmail,
  legacyOnboardingState,
  type OnboardingState,
} from "./server/onboarding.js";
import {
  isAIConfigured,
  getAISetting,
  getMaxTokens,
  aiGenerate,
  aiGenerateWithImages,
  aiStream,
  scoutNews,
  scoutFeed,
  parseScoutFeed,
  buildAttendancePrompt,
  buildCoachPrompt,
  buildHelperChat,
  NAVGPT_SYSTEM,
  ATTENDANCE_SYSTEM,
  COACH_SYSTEM,
} from "./ai.js";
import {
  youtubeApi as youtubeApiImpl,
  pickYouTubeChannel as pickYouTubeChannelImpl,
  resolveYouTubeChannel as resolveYouTubeChannelImpl,
  fetchYouTubeStats as fetchYouTubeStatsImpl,
} from "./server/youtube.js";

// Last-resort safety net: a single malformed request must never take the
// whole server down for every team. Log it and keep serving; Render's
// health checks stay green and no other team's session is affected.
process.on("unhandledRejection", (reason) => {
  console.error("[SafetyNet] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[SafetyNet] uncaughtException:", err);
});

// SECURITY: never expose password hashes to clients. Any member row that
// leaves the server goes through sanitizeMember first; clients get a
// `hasPassword` boolean instead of the hash.
function sanitizeMember<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const r: any = { ...(row as any) };
  const has = !!r.password;
  delete r.password;
  r.hasPassword = has;
  return r;
}
function sanitizeMembers<T>(rows: T[]): T[] {
  return (rows || []).map(sanitizeMember);
}

// --- Presence (online / idle / dnd / invisible) -------------------------------
// members.presence_status is the user's chosen mode ('online' = automatic).
// The displayed presence blends that choice with real activity:
//   invisible → always shown as offline
//   dnd / idle → shown as-is (explicit override)
//   online (auto) → online if active in the last 3 min, idle if within 15 min,
//                   otherwise offline. last_activity is refreshed by
//                   validateSession on every authenticated request.
const PRESENCE_STATUSES = ["online", "idle", "dnd", "invisible"] as const;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const IDLE_WINDOW_MS = 15 * 60 * 1000;
function computePresence(setting: string | null | undefined, lastActivity: string | null): string {
  if (setting === "invisible") return "offline";
  if (setting === "dnd") return "dnd";
  if (setting === "idle") return "idle";
  if (!lastActivity) return "offline";
  const age = Date.now() - new Date(lastActivity).getTime();
  if (Number.isNaN(age) || age < 0) return "online";
  if (age <= ONLINE_WINDOW_MS) return "online";
  if (age <= IDLE_WINDOW_MS) return "idle";
  return "offline";
}
async function presenceMap(memberIds: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const ids = [...new Set(memberIds)].filter((n) => Number.isFinite(n));
  if (!ids.length) return out;
  const ph = ids.map(() => "?").join(",");
  const lastRows = (await dbAll(
    `SELECT member_id, MAX(last_activity) AS last FROM sessions WHERE member_id IN (${ph}) GROUP BY member_id`,
    ...ids
  )) as any[];
  const lastById = new Map<number, string>(lastRows.map((r) => [r.member_id, r.last]));
  const settings = (await dbAll(
    `SELECT id, presence_status FROM members WHERE id IN (${ph})`,
    ...ids
  )) as any[];
  for (const s of settings) {
    out[s.id] = computePresence(s.presence_status, lastById.get(s.id) || null);
  }
  return out;
}

// --- Chat channels ----------------------------------------------------------
// Every team gets a #general channel. Existing messages (channel_id NULL)
// belong to general.
async function ensureGeneralChannel(teamId: number): Promise<any> {
  let general = (await dbGet(
    "SELECT * FROM chat_channels WHERE team_id = ? AND name = 'general'",
    teamId
  )) as any;
  if (!general) {
    const info = (await dbRun(
      "INSERT INTO chat_channels (team_id, name, topic, position) VALUES (?, 'general', 'Team-wide chat', 0)",
      teamId
    ));
    general = (await dbGet("SELECT * FROM chat_channels WHERE id = ?", info.lastInsertRowid)) as any;
  }
  return general;
}

// Default channel template for every team: two categories with starter
// channels (matches the Discord layout Sushil picked). Idempotent — only
// creates what's missing, and adopts pre-existing channels (e.g. #general
// from before categories existed) into their template category.
const CHAT_TEMPLATE: Array<{ category: string; channels: Array<{ name: string; topic: string }> }> = [
  {
    category: 'Club Information',
    channels: [
      { name: 'announcements', topic: 'Important club updates' },
      { name: 'welcome-and-rules', topic: 'Start here — how this club works' },
    ],
  },
  {
    category: 'Robotics Club',
    channels: [
      { name: 'general', topic: 'Team-wide chat' },
      { name: 'off-topic', topic: 'Anything goes' },
    ],
  },
];
async function ensureChatCategory(teamId: number, name: string, position: number): Promise<any> {
  let cat = (await dbGet(
    "SELECT * FROM channel_categories WHERE team_id = ? AND name = ?",
    teamId, name
  )) as any;
  if (!cat) {
    const info = (await dbRun(
      "INSERT INTO channel_categories (team_id, name, position) VALUES (?, ?, ?)",
      teamId, name, position
    ));
    cat = (await dbGet("SELECT * FROM channel_categories WHERE id = ?", info.lastInsertRowid)) as any;
  }
  return cat;
}
async function ensureChatTemplate(teamId: number): Promise<void> {
  let catPos = 0;
  for (const group of CHAT_TEMPLATE) {
    const cat = await ensureChatCategory(teamId, group.category, catPos++);
    let chPos = (((await dbGet(
      "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM chat_channels WHERE team_id = ? AND category_id = ?",
      teamId, cat.id
    )) as any)?.p ?? 0);
    for (const ch of group.channels) {
      const existing = (await dbGet(
        "SELECT id, category_id FROM chat_channels WHERE team_id = ? AND name = ?",
        teamId, ch.name
      )) as any;
      if (!existing) {
        await dbRun(
          "INSERT INTO chat_channels (team_id, name, topic, position, category_id) VALUES (?, ?, ?, ?, ?)",
          teamId, ch.name, ch.topic, chPos++, cat.id
        );
      } else if (!existing.category_id) {
        await dbRun("UPDATE chat_channels SET category_id = ? WHERE id = ?", cat.id, existing.id);
      }
    }
  }
  // Announcements are admin-post-only by default (applies to existing teams too)
  await dbRun("UPDATE chat_channels SET post_restricted = 1 WHERE team_id = ? AND name = 'announcements'", teamId);
}
async function backfillMessageChannels(teamId: number): Promise<void> {
  const general = await ensureGeneralChannel(teamId);
  (await dbRun(
    "UPDATE messages SET channel_id = ? WHERE team_id = ? AND channel_id IS NULL",
    general.id, teamId
  ));
}

// Members DDL (single source of truth — also reused by the multi-team migration below).
// One email (account) may hold one membership row PER TEAM, hence
// UNIQUE(team_id, email) instead of a global UNIQUE(email).
const MEMBERS_DDL = `CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT,
    is_setup INTEGER DEFAULT 0,
    is_board INTEGER DEFAULT 0,
    scopes TEXT, -- JSON array
    is_active INTEGER DEFAULT 1, -- 0 = removed from team; history (messages, tasks, attendance) is kept
    account_type TEXT DEFAULT 'student',
    google_id TEXT,
    discord_id TEXT,
    github_id TEXT,
    accent_color TEXT,
    primary_color TEXT,
    text_color TEXT,
    avatar_url TEXT,
    UNIQUE(team_id, email),
    FOREIGN KEY(team_id) REFERENCES teams(id)
  )`;

// Initialize Database - Create all tables first
(await dbExec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    number TEXT NOT NULL
  );

  ${MEMBERS_DDL};

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

  CREATE TABLE IF NOT EXISTS chat_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    topic TEXT DEFAULT '',
    position INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(created_by) REFERENCES members(id),
    UNIQUE(team_id, name)
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

  CREATE TABLE IF NOT EXISTS social_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    platform TEXT NOT NULL, -- 'youtube' | 'tiktok'
    handle TEXT,
    external_id TEXT, -- youtube channelId | tiktok open_id
    url TEXT,
    display_name TEXT,
    avatar_url TEXT,
    access_token TEXT, -- encrypted, tiktok oauth
    refresh_token TEXT, -- encrypted, tiktok oauth
    token_expires_at INTEGER, -- ms epoch
    token_status TEXT DEFAULT 'ok', -- 'ok' | 'needs_reconnect'
    is_pinned INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    last_synced_at INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS social_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    followers INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    posts INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(profile_id) REFERENCES social_profiles(id)
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

// Onboarding progress store (additive only; see server/onboarding.ts).
// Email-keyed so multi-team accounts keep one onboarding state.
(await dbExec(ONBOARDING_DDL));

// Migrations - Handle structural updates for existing databases
const memberColumns = (await dbAll("PRAGMA table_info(members)"));if (!memberColumns.some((c: any) => c.name === 'password')) {
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
// Owner AI controls (per-member): kill switch, timeout, token budgets
if (!memberColumns.some((c: any) => c.name === 'ai_disabled')) {
  (await dbExec("ALTER TABLE members ADD COLUMN ai_disabled INTEGER DEFAULT 0"));
}
if (!memberColumns.some((c: any) => c.name === 'ai_timeout_until')) {
  (await dbExec("ALTER TABLE members ADD COLUMN ai_timeout_until TEXT"));
}
if (!memberColumns.some((c: any) => c.name === 'ai_daily_token_limit')) {
  (await dbExec("ALTER TABLE members ADD COLUMN ai_daily_token_limit INTEGER"));
}
if (!memberColumns.some((c: any) => c.name === 'ai_max_tokens_reply')) {
  (await dbExec("ALTER TABLE members ADD COLUMN ai_max_tokens_reply INTEGER"));
}
// AI usage log: one row per Bruno/NavGPT request
(await dbExec(`CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  team_id INTEGER,
  endpoint TEXT DEFAULT 'build-helper',
  prompt_tokens INTEGER DEFAULT 0,
  response_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_ai_usage_member_day ON ai_usage(member_id, created_at)`));
// AI misuse flags: review queue for the app owner
(await dbExec(`CREATE TABLE IF NOT EXISTS ai_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  team_id INTEGER,
  chat_id INTEGER,
  excerpt TEXT,
  reason TEXT,
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  reviewer_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT
)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_ai_flags_status ON ai_flags(status, created_at)`));
// AI warnings issued by the app owner
(await dbExec(`CREATE TABLE IF NOT EXISTS ai_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  team_id INTEGER,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`));

// Hot-path indexes (verified against actual query patterns). All IF NOT EXISTS
// and additive — safe to run on every boot against old or new databases.
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_members_email ON members(email)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_members_team_active ON members(team_id, is_active)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance(member_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_attendance_team_date ON attendance(team_id, date)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_messages_team_ts ON messages(team_id, timestamp)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_social_profiles_team ON social_profiles(team_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_social_stats_profile ON social_stats(profile_id, recorded_at)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_bruno_chats_team ON bruno_chats(team_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_bruno_messages_chat ON bruno_messages(chat_id)`));

const taskColumns = (await dbAll("PRAGMA table_info(tasks)"));
if (!taskColumns.some((c: any) => c.name === 'is_board')) {
  (await dbExec("ALTER TABLE tasks ADD COLUMN is_board INTEGER DEFAULT 0"));
}
// Presence: user-chosen status mode (online = automatic from activity)
const memberPresenceColumns = (await dbAll("PRAGMA table_info(members)"));
if (!memberPresenceColumns.some((c: any) => c.name === 'presence_status')) {
  (await dbExec("ALTER TABLE members ADD COLUMN presence_status TEXT DEFAULT 'online'"));
}
// Chat channels: messages.channel_id points at chat_channels(id)
const messageChannelColumns = (await dbAll("PRAGMA table_info(messages)"));
if (!messageChannelColumns.some((c: any) => c.name === 'channel_id')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN channel_id INTEGER"));
}
// Message replies + forwarding (Discord-style)
const messageReplyColumns = (await dbAll("PRAGMA table_info(messages)"));
if (!messageReplyColumns.some((c: any) => c.name === 'reply_to_id')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN reply_to_id INTEGER"));
}
if (!messageReplyColumns.some((c: any) => c.name === 'is_forwarded')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN is_forwarded INTEGER DEFAULT 0"));
}
if (!messageReplyColumns.some((c: any) => c.name === 'forwarded_from')) {
  (await dbExec("ALTER TABLE messages ADD COLUMN forwarded_from TEXT DEFAULT ''"));
}

// Channel categories (Discord-style groups)
(await dbExec(`CREATE TABLE IF NOT EXISTS channel_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
  UNIQUE(team_id, name)
)`));
const chatChannelCols = (await dbAll("PRAGMA table_info(chat_channels)"));
if (!chatChannelCols.some((c: any) => c.name === 'category_id')) {
  (await dbExec("ALTER TABLE chat_channels ADD COLUMN category_id INTEGER"));
}
if (!chatChannelCols.some((c: any) => c.name === 'post_restricted')) {
  (await dbExec("ALTER TABLE chat_channels ADD COLUMN post_restricted INTEGER DEFAULT 0"));
}

const teamColumns = (await dbAll("PRAGMA table_info(teams)"));
if (!teamColumns.some((c: any) => c.name === 'accent_color')) {
  (await dbExec("ALTER TABLE teams ADD COLUMN accent_color TEXT"));
}

// Outreach: numeric fields for event totals (attendees, funds raised)
const outreachColumns = (await dbAll("PRAGMA table_info(outreach)"));
if (!outreachColumns.some((c: any) => c.name === 'attendees')) {
  (await dbExec("ALTER TABLE outreach ADD COLUMN attendees INTEGER DEFAULT 0"));
}
if (!outreachColumns.some((c: any) => c.name === 'funds_raised')) {
  (await dbExec("ALTER TABLE outreach ADD COLUMN funds_raised REAL DEFAULT 0"));
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
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id)`));

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

// ---- Multi-team accounts: one email may hold a membership row per team ----
// Relax the legacy global UNIQUE(email) to UNIQUE(team_id, email) via a table
// rebuild. Existing databases keep every column and row; fresh databases get
// the new schema directly from MEMBERS_DDL above.
//
// NOTE (2026-09-29): the first version of this migration renamed `members`
// itself, which made SQLite rewrite every `FOREIGN KEY ... REFERENCES members`
// clause to point at `members_old`; the subsequent DROP then failed under
// foreign-key enforcement and crashed the boot (killing the deploy). The two
// helpers below are idempotent and cover both orders of events:
//   * repairCrashedMembersMigration: cleans up a leftover `members_old` table
//     and re-points rewritten FOREIGN KEY clauses back at `members`.
//   * rebuildMembersTable: performs the rebuild without ever renaming
//     `members` (stages under `members_new`), with FK enforcement off for the
//     whole batch so intermediate states can't fail.
const KNOWN_MEMBER_COLS = ["id", "team_id", "name", "role", "email", "password", "is_setup", "is_board", "scopes", "is_active", "account_type", "google_id", "discord_id", "github_id", "accent_color", "primary_color", "text_color", "avatar_url"];

async function rebuildMembersTable(): Promise<void> {
  const oldCols = (await dbAll("PRAGMA table_info(members)")) as any[];
  const knownCols = [...KNOWN_MEMBER_COLS];
  const extraCols = oldCols.filter((c: any) => !knownCols.includes(c.name));
  const seqRow = (await dbGet("SELECT seq FROM sqlite_sequence WHERE name='members'")) as any;
  const stmts: string[] = ["PRAGMA foreign_keys=OFF;"];
  // Stage the new schema under a temporary name so `members` itself is never
  // renamed (renaming it would rewrite other tables' FOREIGN KEY clauses).
  stmts.push(MEMBERS_DDL.replace("CREATE TABLE IF NOT EXISTS members (", "CREATE TABLE members_new (") + ";");
  for (const c of extraCols) {
    stmts.push(`ALTER TABLE members_new ADD COLUMN "${c.name}" ${c.type || "TEXT"};`);
    knownCols.push(c.name);
  }
  const common = oldCols.map((c: any) => c.name).filter((n: string) => knownCols.includes(n));
  const list = common.map((n: string) => `"${n}"`).join(", ");
  stmts.push(`INSERT INTO members_new (${list}) SELECT ${list} FROM members;`);
  stmts.push("DROP TABLE members;");
  stmts.push("ALTER TABLE members_new RENAME TO members;");
  if (seqRow && typeof seqRow.seq === "number") {
    const s = Number(seqRow.seq);
    stmts.push(`UPDATE sqlite_sequence SET seq = ${s} WHERE name='members' AND seq < ${s};`);
  }
  stmts.push("PRAGMA foreign_keys=ON;");
  await dbExec(stmts.join("\n"));
  console.log("[DB Migration] members rebuilt with UNIQUE(team_id, email) for multi-team accounts");
}

async function repairCrashedMembersMigration(): Promise<void> {
  // A leftover members_old means the original migration crashed midway (after
  // copying rows, before dropping members_old). The rename rewrote other
  // tables' FOREIGN KEY clauses to REFERENCES members_old; rebuild those
  // tables with the clause pointed back at `members`.
  const affected = (await dbAll(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%members_old%'"
  )) as any[];
  const batch: string[] = ["PRAGMA foreign_keys=OFF;"];
  const indexDdls: string[] = [];
  for (const t of affected) {
    if (t.name === "members_old" || t.name === "members") continue;
    const cols = (await dbAll(`PRAGMA table_info("${t.name}")`)) as any[];
    const colList = cols.map((c: any) => `"${c.name}"`).join(", ");
    const fixedSql: string = (t.sql as string).replace(/members_old/g, "members");
    // Stage the rebuild as <table>__new and rename the STAGE when done. Never
    // rename a table that other tables reference (even to a staging name):
    // SQLite rewrites their FOREIGN KEY clauses to the staging name, and
    // PRAGMA foreign_keys=OFF in the same executeMultiple batch does not
    // reliably prevent that (production was left with a ghost
    // "bruno_chats__repair" reference this way).
    const stage = `${t.name}__new`;
    const stageRe = new RegExp(`(CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?)"?${t.name}"?(\\s*\\()`, "i");
    const stageSql = fixedSql.replace(stageRe, `$1"${stage}"$2`);
    if (stageSql === fixedSql) {
      throw new Error(`[DB Migration] cannot derive stage DDL for table ${t.name}`);
    }
    const idxs = (await dbAll(
      "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
      t.name
    )) as any[];
    for (const ix of idxs) indexDdls.push(ix.sql);
    batch.push(`${stageSql};`);
    batch.push(`INSERT INTO "${stage}" (${colList}) SELECT ${colList} FROM "${t.name}";`);
    batch.push(`DROP TABLE "${t.name}";`);
    batch.push(`ALTER TABLE "${stage}" RENAME TO "${t.name}";`);
  }
  // Belt and suspenders: copy any rows still only present in members_old.
  const oldCols = (await dbAll("PRAGMA table_info(members_old)")) as any[];
  const newCols = (await dbAll("PRAGMA table_info(members)")) as any[];
  const newNames = new Set(newCols.map((c: any) => c.name));
  const commonOld = oldCols.map((c: any) => c.name).filter((n: string) => newNames.has(n));
  if (commonOld.length) {
    const list = commonOld.map((n: string) => `"${n}"`).join(", ");
    batch.push(`INSERT OR IGNORE INTO members (${list}) SELECT ${list} FROM members_old;`);
  }
  batch.push("DROP TABLE IF EXISTS members_old;");
  batch.push("PRAGMA foreign_keys=ON;");
  await dbExec(batch.join("\n"));
  for (const ix of indexDdls) await dbExec(`${ix};`);
  console.log(`[DB Migration] repaired crashed members migration (${affected.length} table(s) re-pointed, members_old removed)`);
}

const membersOldExists = await dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name='members_old'");
if (membersOldExists) {
  await repairCrashedMembersMigration();
}
const membersTableSql = ((await dbGet("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'members'")) as any)?.sql || "";
if (membersTableSql && !/UNIQUE\s*\(\s*team_id\s*,\s*email\s*\)/i.test(membersTableSql)) {
  await rebuildMembersTable();
}

async function repairGhostRepairReferences(): Promise<void> {
  // The old repairCrashedMembersMigration() staged rebuilds by renaming
  // tables to "<name>__repair". On production that rename ran with FOREIGN
  // KEY rewriting active, so child tables that were NOT themselves rebuilt
  // kept SQL referencing the staging name (e.g. bruno_messages ended up with
  // REFERENCES "bruno_chats__repair"(id)). The staging table was dropped, so
  // every INSERT into such a child now fails with
  // "no such table: main.<name>__repair" — this is what took down Bruno and
  // NavGPT chat persistence. Re-point those references at the real table and
  // rebuild the child safely (stage as <table>__fixstage; never rename a
  // referenced table).
  const tables = (await dbAll(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%__repair%'"
  )) as any[];
  // Flag (don't touch) any non-table objects mentioning __repair.
  const others = (await dbAll(
    "SELECT type, name FROM sqlite_master WHERE type != 'table' AND sql LIKE '%__repair%'"
  )) as any[];
  for (const o of others) {
    console.log(`[DB Migration] WARNING: ${o.type} "${o.name}" mentions __repair; manual review needed`);
  }
  for (const t of tables) {
    const sql: string = t.sql || "";
    const ghosts = new Set<string>();
    const re = /REFERENCES\s+"?([A-Za-z0-9_]*__repair)"?\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) ghosts.add(m[1]);
    if (!ghosts.size) continue;
    let fixed = sql;
    let changed = false;
    for (const ghost of ghosts) {
      const real = ghost.slice(0, -"__repair".length);
      const realExists = await dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name=?", real);
      const ghostExists = await dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name=?", ghost);
      if (realExists && !ghostExists) {
        fixed = fixed
          .replace(new RegExp(`(REFERENCES\\s+")${ghost}(")`, "g"), `$1${real}$2`)
          .replace(new RegExp(`(REFERENCES\\s+)${ghost}(\\s*\\()`, "g"), `$1"${real}"$2`);
        changed = true;
        console.log(`[DB Migration] re-pointing ${t.name}: REFERENCES ${ghost} -> ${real}`);
      } else {
        console.log(`[DB Migration] WARNING: ${t.name} references ${ghost} (real exists: ${!!realExists}, staging exists: ${!!ghostExists}); leaving untouched`);
      }
    }
    if (!changed) continue;
    // Never silently rebuild a table other tables depend on; flag it instead.
    const dependents = (await dbAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE ? AND name != ?",
      `%REFERENCES%${t.name}%`, t.name
    )) as any[];
    if (dependents.length) {
      console.log(`[DB Migration] WARNING: ${t.name} is referenced by ${dependents.map((d: any) => d.name).join(", ")}; skipping automatic rebuild, manual review needed`);
      continue;
    }
    const cols = (await dbAll(`PRAGMA table_info("${t.name}")`)) as any[];
    const colList = cols.map((c: any) => `"${c.name}"`).join(", ");
    const idxs = (await dbAll(
      "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
      t.name
    )) as any[];
    const seqRow = (await dbGet("SELECT seq FROM sqlite_sequence WHERE name=?", t.name)) as any;
    const stage = `${t.name}__fixstage`;
    const createRe = new RegExp(`(CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?)"?${t.name}"?(\\s*\\()`, "i");
    const stageSql = fixed.replace(createRe, `$1"${stage}"$2`);
    if (stageSql === fixed) {
      console.log(`[DB Migration] WARNING: could not derive stage DDL for ${t.name}; leaving untouched`);
      continue;
    }
    await dbExec([
      "PRAGMA foreign_keys=OFF;",
      `${stageSql};`,
      `INSERT INTO "${stage}" (${colList}) SELECT ${colList} FROM "${t.name}";`,
      `DROP TABLE "${t.name}";`,
      `ALTER TABLE "${stage}" RENAME TO "${t.name}";`,
      "PRAGMA foreign_keys=ON;",
    ].join("\n"));
    for (const ix of idxs) await dbExec(`${ix.sql};`);
    if (seqRow && typeof seqRow.seq === "number") {
      const s = Number(seqRow.seq);
      await dbExec(`UPDATE sqlite_sequence SET seq = ${s} WHERE name='${t.name}' AND seq < ${s};`);
    }
    console.log(`[DB Migration] rebuilt ${t.name} with repaired REFERENCES clause`);
  }
}
await repairGhostRepairReferences();

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

// Secret chatbot persona (NavGPT ❤️): per-team toggle, default ON. Only has any
// effect for the qualifying team (name contains "hypnotic" or "4215").
if (!(await hasColumn('teams', 'navgpt_enabled'))) {
  (await dbExec("ALTER TABLE teams ADD COLUMN navgpt_enabled INTEGER NOT NULL DEFAULT 1"));
}

// Feedback screenshots: optional image attached to a feedback entry.
if (!(await hasColumn('feedback', 'screenshot_url'))) {
  (await dbExec("ALTER TABLE feedback ADD COLUMN screenshot_url TEXT"));
}

// QR check-in sessions: an admin starts one (projected on the board), students
// scan the QR or type the short day-code. Replaces unsupervised self check-in.
(await dbExec(`CREATE TABLE IF NOT EXISTS checkin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
)`));
(await dbExec("CREATE INDEX IF NOT EXISTS idx_checkin_sessions_team ON checkin_sessions(team_id, is_active)"));

// Does this team name qualify for the NavGPT ❤️ secret persona?
function navGptQualifies(teamName: any): boolean {
  const n = String(teamName || "");
  return /hypnotic/i.test(n) || /4215/.test(n);
}

// Effective persona: qualifying team AND the toggle switched on.
async function navGptActiveForTeam(teamId: number | null | undefined): Promise<boolean> {
  if (!teamId) return false;
  const t = (await dbGet("SELECT name, navgpt_enabled FROM teams WHERE id = ?", teamId)) as any;
  return !!t && navGptQualifies(t.name) && (t.navgpt_enabled ?? 1) === 1;
}

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
function getSessionId(req: any): string | null {
  return (req.query?.sessionId as string) || req.body?.sessionId || (req.headers?.['x-session-id'] as string) || null;
}
async function getAuth(req: any): Promise<{ memberId: number; teamId: number | null; accountType: string; email?: string; teamless?: boolean } | null> {
  const sessionId = getSessionId(req);
  if (!sessionId) return null;
  const { valid, memberId } = await validateSession(sessionId);
  if (!valid || !memberId) return null;
  const member = (await dbGet("SELECT id, team_id, account_type FROM members WHERE id = ? AND COALESCE(is_active, 1) = 1", memberId)) as any;
  if (member) return { memberId: member.id, teamId: member.team_id ?? null, accountType: member.account_type || 'student' };
  // Teamless: the session outlived its membership row (last team deleted, or
  // left every team). The ghost row anchors the account's email; if it still
  // has zero active memberships the session stays valid with no workspace.
  const ghost = (await dbGet("SELECT email FROM members WHERE id = ?", memberId)) as any;
  if (ghost?.email) {
    const c = (await dbGet("SELECT COUNT(*) AS n FROM members WHERE email = ? AND COALESCE(is_active, 1) = 1", ghost.email)) as any;
    if ((c?.n || 0) === 0) {
      return { memberId: 0, teamId: null, accountType: 'student', email: ghost.email, teamless: true };
    }
  }
  return null;
}

// ---- Multi-team accounts ----
// An account is an email; a membership is one members row per (email, team).
// Sessions point at a membership row, so the active team is the row's team.
async function allMemberRows(email: string): Promise<any[]> {
  return (await dbAll("SELECT * FROM members WHERE email = ? ORDER BY id DESC", email)) as any[];
}
async function activeMemberRows(email: string): Promise<any[]> {
  return (await dbAll("SELECT * FROM members WHERE email = ? AND COALESCE(is_active, 1) = 1 ORDER BY id DESC", email)) as any[];
}
// Which membership to sign in as when an account has several: the one with
// the most recently used session wins, falling back to the newest row.
async function pickMemberRow(rows: any[]): Promise<any | null> {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const ids = rows.map((r) => r.id);
  const hit = (await dbGet(
    `SELECT member_id FROM sessions WHERE member_id IN (${ids.map(() => "?").join(",")}) ORDER BY last_activity DESC LIMIT 1`,
    ...ids
  )) as any;
  return (hit && rows.find((r) => r.id === hit.member_id)) || rows[0];
}
// Every workspace (team) this account actively belongs to, with member counts
// and whether this account can manage each one.
async function userTeams(email: string): Promise<any[]> {
  const teams = (await dbAll(`
    SELECT t.*, (SELECT COUNT(*) FROM members m WHERE m.team_id = t.id AND COALESCE(m.is_active, 1) = 1) AS member_count
    FROM teams t
    JOIN members m ON m.team_id = t.id
    WHERE m.email = ? AND COALESCE(m.is_active, 1) = 1
    ORDER BY t.id
  `, email)) as any[];
  for (const t of teams) {
    const row = (await dbGet("SELECT id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, t.id)) as any;
    const perms = row ? await getMemberPerms(row.id, t.id) : new Set<string>();
    (t as any).can_manage = perms.has("*") || perms.has("manage_members");
  }
  return teams;
}
// Does this account hold an active membership in teamId with `perm`?
async function hasPermInTeam(email: string, teamId: number, perm: string): Promise<boolean> {
  const row = (await dbGet("SELECT id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, teamId)) as any;
  if (!row) return false;
  const perms = await getMemberPerms(row.id, teamId);
  return perms.has("*") || perms.has(perm);
}

// Middleware-ish guard: 401 when no valid session. Returns auth or sends the error.
async function requireAuth(req: any, res: any): Promise<{ memberId: number; teamId: number | null; accountType: string; email?: string; teamless?: boolean } | null> {
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
  { key: "manage_documentation", label: "Manage documentation" },
  { key: "manage_communications", label: "Manage communications" },
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
  if (!rows.length && excludedRoleId) {
    // The member holds role assignments, but none with admin perms would
    // survive the exclusion — they would NOT still be an admin. Do not
    // fall through to the legacy account_type flag here, or revoking the
    // last Admin role strands the team with zero admins.
    const anyRole = (await dbGet(
      "SELECT 1 FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.member_id = ? AND r.team_id = ? LIMIT 1",
      memberId, teamId
    )) as any;
    if (anyRole) return false;
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

  app.use(express.json({ limit: "5mb" })); // bound JSON bodies (AI payloads, code saves) — uploads go through multer's own limits

  // Health check for Render/uptime monitors. Cheap, unauthenticated, no AI/DB writes.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString(), uptimeSec: Math.round(process.uptime()) });
  });
  
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

  // Feedback screenshots: images only, 5MB cap
  const screenshotUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
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
        // Client reports which channel it's viewing (for @here pings)
        if (message.type === "viewing") {
          const cid = parseInt(message.channel_id, 10);
          (ws as any).viewingChannelId = Number.isFinite(cid) ? cid : null;
          return;
        }
        if (message.type === "chat") {
          const teamId = (ws as any).teamId;
          if (teamId == null) return; // ignore unidentified clients
          // Verify the claimed sender belongs to this workspace
          const sender = (await dbGet("SELECT id, team_id FROM members WHERE id = ?", message.sender_id)) as any;
          if (!sender || sender.team_id !== teamId) return;
          // Channel must belong to this team; default to #general
          const general = await ensureGeneralChannel(teamId);
          let channelId = parseInt(message.channel_id, 10);
          if (!Number.isFinite(channelId)) channelId = general.id;
          const chan = (await dbGet("SELECT id, name, post_restricted FROM chat_channels WHERE id = ? AND team_id = ?", channelId, teamId)) as any;
          if (!chan) channelId = general.id;
          const restrictedChan = (await dbGet("SELECT id, name, post_restricted FROM chat_channels WHERE id = ? AND team_id = ?", channelId, teamId)) as any;
          if (restrictedChan?.post_restricted && !(await hasPerm({ memberId: message.sender_id, teamId }, "manage_members"))) {
            try { ws.send(JSON.stringify({ type: "chat_denied", client_id: message.client_id || null, error: `Only admins can post in #${restrictedChan.name}` })); } catch {}
            return;
          }
          const timestamp = new Date().toISOString();
          // Optional reply target must be a real message in this workspace
          let replyToId: number | null = parseInt(message.reply_to_id, 10);
          if (!Number.isFinite(replyToId)) replyToId = null;
          if (replyToId != null) {
            const target = (await dbGet("SELECT id FROM messages WHERE id = ? AND team_id = ?", replyToId, teamId)) as any;
            if (!target) replyToId = null;
          }
          const isForwarded = message.is_forwarded ? 1 : 0;
          const forwardedFrom = typeof message.forwarded_from === 'string' ? message.forwarded_from.slice(0, 160) : '';
          // Forwarded attachments reuse the original file URL
          const fwdFilePath = isForwarded && typeof message.file_path === 'string' ? message.file_path.slice(0, 500) : null;
          const fwdFileName = isForwarded && typeof message.file_name === 'string' ? message.file_name.slice(0, 200) : null;
          const fwdFileSize = isForwarded && Number.isFinite(Number(message.file_size)) ? Number(message.file_size) : null;
          const info = await dbRun("INSERT INTO messages (sender_id, content, timestamp, team_id, channel_id, reply_to_id, is_forwarded, forwarded_from, file_path, file_name, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", message.sender_id, message.content, timestamp, teamId, channelId, replyToId, isForwarded, forwardedFrom, fwdFilePath, fwdFileName, fwdFileSize);

          // Reply preview for the live broadcast (same shape as GET /api/messages)
          let replyPreview: any = null;
          if (replyToId != null) {
            const rp = (await dbGet(`
              SELECT r.content as reply_content, r.deleted_at as reply_deleted, rmem.name as reply_sender_name
              FROM messages r LEFT JOIN members rmem ON rmem.id = r.sender_id
              WHERE r.id = ?
            `, replyToId)) as any;
            if (rp) replyPreview = rp;
          }

          // Handle mentions (scoped to the sender's workspace)
          const plainContent = String(message.content || '').replace(/@\[([^\]]+)\]/g, '@$1');
          const chanName = (restrictedChan as any)?.name || 'general';
          if (plainContent.includes('@everyone')) {
            // Notify every active member of the team (except the sender)
            const all = (await dbAll("SELECT id FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1 AND id != ?", teamId, message.sender_id)) as any[];
            for (const u of all) {
              createNotification(u.id, `${message.sender_name} pinged @everyone in #${chanName}: "${plainContent.slice(0, 120)}"`, 'mention');
            }
          } else if (plainContent.includes('@here')) {
            // Notify members currently viewing this channel (except the sender)
            const viewers = new Set<number>();
            for (const c of clients) {
              const mid = (c as any).memberId;
              if ((c as any).teamId === teamId && (c as any).viewingChannelId === channelId && mid && mid !== message.sender_id) {
                viewers.add(mid);
              }
            }
            for (const id of viewers) {
              createNotification(id, `${message.sender_name} pinged @here in #${chanName}: "${plainContent.slice(0, 120)}"`, 'mention');
            }
          }
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
            client_id: typeof message.client_id === "string" ? message.client_id : null,
            sender_id: message.sender_id,
            sender_name: message.sender_name,
            content: message.content,
            channel_id: channelId,
            reply_to_id: replyToId,
            reply_sender_name: replyPreview?.reply_sender_name || null,
            reply_content: replyPreview?.reply_content || null,
            reply_deleted: replyPreview?.reply_deleted || null,
            is_forwarded: isForwarded,
            forwarded_from: forwardedFrom,
            file_path: fwdFilePath,
            file_name: fwdFileName,
            file_size: fwdFileSize,
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
    const rows = await activeMemberRows(email);
    if (!rows.length) {
      // Distinguish "no such account" from "removed everywhere"
      const anyRow = (await dbGet("SELECT id FROM members WHERE email = ?", email)) as any;
      if (anyRow) return res.status(403).json({ error: "This account has been removed from the team" });
      return res.status(401).json({ error: "User not found" });
    }

    // The password is account-wide: accept it if it verifies against any of
    // this account's membership rows.
    let verified = false;
    for (const r of rows) {
      if (r.password && bcrypt.compareSync(password, r.password)) { verified = true; break; }
    }
    const picked = (await pickMemberRow(rows)) as any;
    if (!verified) {
      if (rows.some((r) => !r.password)) {
        const sessionId = await createSession(picked.id);
        return res.json({ needsSetup: true, user: sanitizeMember(picked), sessionId });
      }
      return res.status(401).json({ error: "Invalid password" });
    }
    const sessionId = await createSession(picked.id);
    res.json({ user: sanitizeMember(picked), sessionId });
  });

  app.post("/api/auth/setup", async (req, res) => {
    const { email, password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    // Setup is only for accounts that never had a password (e.g. added to the roster by an admin)
    const existing = (await dbGet("SELECT id FROM members WHERE email = ? AND password IS NULL ORDER BY id DESC", email)) as any;
    if (!existing) return res.status(400).json({ error: "This account already has a password — sign in instead" });
    const hashedPassword = bcrypt.hashSync(password, 10);
    // The password is account-wide: set it on every membership row for this email.
    (await dbRun("UPDATE members SET password = ?, is_setup = 1 WHERE email = ?", hashedPassword, email));
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", existing.id));
    const sessionId = await createSession(existing.id);
    res.json({ user: sanitizeMember(user), sessionId });
  });

  // Admin-only: force a roster member in your workspace to set a new password on next login
  app.post("/api/auth/reset", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const { email } = req.body;
    const target = (await dbGet("SELECT id, team_id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, auth.teamId)) as any;
    if (!target) {
      return res.status(404).json({ error: "Member not found in your workspace" });
    }
    if (target.id === auth.memberId) {
      return res.status(400).json({ error: "You can't reset your own password this way" });
    }
    // The password is account-wide: clear it on every membership row for this email.
    (await dbRun("UPDATE members SET password = NULL, is_setup = 0 WHERE email = ?", email));
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
      // Multi-team accounts: an existing email may sign up again to create or join
      // another team. When the account already has a password, it must match.
      const priorRows = await allMemberRows(cleanEmail);
      const pwRows = priorRows.filter((r) => r.password);
      let hashedPassword: string;
      if (pwRows.length) {
        const matched = pwRows.find((r) => bcrypt.compareSync(password, r.password));
        if (!matched) return res.status(400).json({ error: "An account with that email already exists — sign in instead" });
        hashedPassword = matched.password;
      } else {
        hashedPassword = bcrypt.hashSync(password, 10);
        if (priorRows.length) {
          // Adopt the new password account-wide for password-less rows.
          (await dbRun("UPDATE members SET password = ?, is_setup = 1 WHERE email = ? AND password IS NULL", hashedPassword, cleanEmail));
        }
      }

      if (accountType === 'admin') {
        // Team identity: an FTC team number is verified against the official
        // FTC record (name auto-filled from the number); otherwise the admin
        // types the team name manually.
        const identity: any = await resolveTeamIdentity(teamNumber, teamName);
        if (identity.error) return res.status(400).json({ error: identity.error });
        const code = await uniqueAccessCode();
        const tInfo = (await dbRun("INSERT INTO teams (name, number, access_code, ftc_team_number) VALUES (?, ?, ?, ?)", identity.name, identity.number, code, identity.ftcNumber)) as any;
        const teamId = tInfo.lastInsertRowid;
        const mInfo = (await dbRun(
          "INSERT INTO members (team_id, name, role, email, password, is_setup, is_board, account_type, scopes) VALUES (?, ?, ?, ?, ?, 1, 1, 'admin', ?)",
          teamId, cleanName, 'Admin', cleanEmail, hashedPassword, JSON.stringify(['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin'])
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        await assignSystemRole(teamId, mInfo.lastInsertRowid, "Admin");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        await ensureOnboardingRow(cleanEmail);
        return res.json({ user: sanitizeMember(user), sessionId, team: { id: teamId, name: identity.name, access_code: code, verified: !!identity.ftcNumber } });
      }

      if (accountType === 'student') {
        const norm = (accessCode || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!norm) return res.status(400).json({ error: "Enter the access code from your team admin" });
        const team = (await dbGet("SELECT * FROM teams WHERE REPLACE(access_code, '-', '') = ?", norm)) as any;
        if (!team) return res.status(400).json({ error: "That access code doesn't match any team — check it with your admin" });
        const dupe = (await dbGet("SELECT id, is_active FROM members WHERE email = ? AND team_id = ?", cleanEmail, team.id)) as any;
        if (dupe && dupe.is_active !== 0) {
          return res.status(400).json({ error: "You're already a member of this team — sign in instead" });
        }
        let memberId: number;
        if (dupe) {
          // Rejoining a team they were removed from: restore the membership.
          (await dbRun("UPDATE members SET is_active = 1, name = ?, password = ?, is_setup = 1 WHERE id = ?", cleanName, hashedPassword, dupe.id));
          memberId = dupe.id;
        } else {
          const mInfo = (await dbRun(
            "INSERT INTO members (team_id, name, role, email, password, is_setup, is_board, account_type, scopes) VALUES (?, ?, ?, ?, ?, 1, 0, 'student', ?)",
            team.id, cleanName, 'Member', cleanEmail, hashedPassword, JSON.stringify([])
          )) as any;
          memberId = mInfo.lastInsertRowid;
        }
        const sessionId = await createSession(memberId);
        await assignSystemRole(team.id, memberId, "Member");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", memberId));
        await ensureOnboardingRow(cleanEmail);
        return res.json({ user: sanitizeMember(user), sessionId, team: { id: team.id, name: team.name, access_code: team.access_code } });
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
  // Social auto-sync: YouTube Data API key (public channel stats, no OAuth needed)
  // and TikTok Login Kit (per-team OAuth connection).
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
  const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
  // TikTok Login Kit is UNVERIFIED — hard kill switch. Flip to true only after
  // the TikTok dev app + OAuth flow are tested end to end. While false: the
  // client hides all TikTok UI, /api/auth/config reports tiktokEnabled: false,
  // connect/callback refuse, and sync skips TikTok profiles (rows stay in the
  // DB so re-enabling loses nothing).
  const TIKTOK_ENABLED = false;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
  const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";

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
  const pendingOAuthSignups = new Map<string, { provider: string; providerSub: string; email: string; name: string; avatarUrl: string | null; intent: string; expiry: number }>();

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
      youtubeEnabled: !!YOUTUBE_API_KEY,
      tiktokEnabled: TIKTOK_ENABLED && !!(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET),
    });
  });

  // Resolve the current user from a session id (used after Google sign-in)
  app.get("/api/auth/me", async (req, res) => {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: "Invalid session" });
    const sessionId = getSessionId(req);
    // Teamless account (deleted/left their last team): no workspace, but the
    // session stays valid so they can create or join a team, or delete the account.
    if (auth.teamless) {
      const ghost = (await dbGet("SELECT name, email FROM members WHERE email = ? ORDER BY id DESC LIMIT 1", auth.email || "")) as any;
      const isOwner = ownerEmails().includes(((auth.email) || "").toLowerCase());
      return res.json({
        user: {
          id: 0, name: ghost?.name || auth.email || "", email: auth.email || "",
          team_id: null, account_type: "student", roles: [], permissions: [],
          teams: [], teamless: true,
        },
        sessionId, isOwner,
      });
    }
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", auth.memberId)) as any;
    const isOwner = ownerEmails().includes(((user?.email) || "").toLowerCase());
    if (user?.team_id) {
      await ensureRolesSeeded(user.team_id);
      (user as any).roles = await memberRoleList(user.id, user.team_id);
      (user as any).permissions = [...(await getMemberPerms(user.id, user.team_id))];
    } else {
      (user as any).roles = [];
      (user as any).permissions = [];
    }
    // Every workspace this account belongs to (for the team switcher)
    (user as any).teams = user?.email ? await userTeams(user.email) : [];
    if (user?.id) {
      const pm = await presenceMap([user.id]);
      (user as any).presence = pm[user.id] || "offline";
    }
    res.json({ user: sanitizeMember(user), sessionId, isOwner });
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
  // Fill in a missing name/avatar from the OAuth provider profile for every
  // membership row on this account. Never clobbers a name the user chose or an
  // avatar they uploaded themselves (uploads live under /uploads/).
  async function fillOAuthProfile(email: string, name: string, avatarUrl: string | null) {
    const rows = (await dbAll("SELECT id, name, avatar_url FROM members WHERE email = ? AND COALESCE(is_active, 1) = 1", email)) as any[];
    const cleanName = (name || '').trim();
    const emailPrefix = email.split('@')[0];
    for (const r of rows) {
      const nameIsDefault = !r.name || r.name === emailPrefix;
      const avatarIsEmpty = !r.avatar_url;
      const newName = cleanName && nameIsDefault ? cleanName : r.name;
      const newAvatar = avatarUrl && avatarIsEmpty ? avatarUrl : r.avatar_url;
      if (newName !== r.name || newAvatar !== r.avatar_url) {
        await dbRun("UPDATE members SET name = ?, avatar_url = ? WHERE id = ?", newName, newAvatar, r.id);
      }
    }
  }

  async function finishOAuthLogin(provider: string, providerSub: string, email: string, name: string, avatarUrl: string | null, intent: string, res: any) {
    const idColumn = OAUTH_PROVIDERS[provider].idColumn;
    let rows: any[] = (await dbAll(`SELECT * FROM members WHERE ${idColumn} = ? AND COALESCE(is_active, 1) = 1`, providerSub)) as any[];
    if (!rows.length) {
      rows = (await dbAll("SELECT * FROM members WHERE email = ? AND COALESCE(is_active, 1) = 1", email)) as any[];
      if (rows.length) {
        // Link this provider identity to every membership row for the account,
        // so future logins can land in the most recently used team.
        (await dbRun(`UPDATE members SET ${idColumn} = ? WHERE email = ? AND COALESCE(is_active, 1) = 1`, providerSub, email));
        await fillOAuthProfile(email, name, avatarUrl);
        rows = (await dbAll(`SELECT * FROM members WHERE ${idColumn} = ? AND COALESCE(is_active, 1) = 1`, providerSub)) as any[];
      } else if (intent === 'admin_signup' || intent === 'student_signup' || intent === 'signup') {
        const token = randomHex(32);
        pendingOAuthSignups.set(token, { provider, providerSub, email, name, avatarUrl, intent, expiry: Date.now() + 10 * 60 * 1000 });
        return res.redirect(`/?oauth_signup=${token}&intent=${intent}&provider=${provider}`);
      } else {
        return res.redirect("/?oauth_error=not_invited");
      }
    } else {
      await fillOAuthProfile(email, name, avatarUrl);
      rows = (await dbAll(`SELECT * FROM members WHERE ${idColumn} = ? AND COALESCE(is_active, 1) = 1`, providerSub)) as any[];
    }
    const member = await pickMemberRow(rows);
    const sessionId = await createSession(member.id);
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
      // Multi-team accounts: a provider-verified email may already exist — it
      // simply gains a membership row in the new/joined team. (Duplicate
      // membership in the SAME team is still rejected below.)

      const effectiveIntent = pending.intent === 'signup'
        ? (role === 'admin' ? 'admin_signup' : 'student_signup')
        : pending.intent;
      if (effectiveIntent === 'admin_signup') {
        const identity: any = await resolveTeamIdentity(teamNumber, teamName);
        if (identity.error) return res.status(400).json({ error: identity.error });
        const code = await uniqueAccessCode();
        const tInfo = (await dbRun("INSERT INTO teams (name, number, access_code, ftc_team_number) VALUES (?, ?, ?, ?)", identity.name, identity.number, code, identity.ftcNumber)) as any;
        const teamId = tInfo.lastInsertRowid;
        const mInfo = (await dbRun(
          `INSERT INTO members (team_id, name, role, email, password, ${idColumn}, is_setup, is_board, account_type, scopes, avatar_url) VALUES (?, ?, ?, ?, NULL, ?, 1, 1, 'admin', ?, ?)`,
          teamId, cleanName, 'Admin', cleanEmail, pending.providerSub, JSON.stringify(['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin']), pending.avatarUrl || null
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        await assignSystemRole(teamId, mInfo.lastInsertRowid, "Admin");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        await ensureOnboardingRow(cleanEmail);
        return res.json({ user: sanitizeMember(user), sessionId, team: { id: teamId, name: identity.name, access_code: code, verified: !!identity.ftcNumber } });
      }

      if (effectiveIntent === 'student_signup') {
        const norm = (accessCode || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!norm) return res.status(400).json({ error: "Enter the access code from your team admin" });
        const team = (await dbGet("SELECT * FROM teams WHERE REPLACE(access_code, '-', '') = ?", norm)) as any;
        if (!team) return res.status(400).json({ error: "That access code doesn't match any team — check it with your admin" });
        const dupe = (await dbGet("SELECT id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", cleanEmail, team.id)) as any;
        if (dupe) return res.status(400).json({ error: "This account is already on that team — sign in instead" });
        const mInfo = (await dbRun(
          `INSERT INTO members (team_id, name, role, email, password, ${idColumn}, is_setup, is_board, account_type, scopes, avatar_url) VALUES (?, ?, ?, ?, NULL, ?, 1, 0, 'student', ?, ?)`,
          team.id, cleanName, 'Member', cleanEmail, pending.providerSub, JSON.stringify([]), pending.avatarUrl || null
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        await assignSystemRole(team.id, mInfo.lastInsertRowid, "Member");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        await ensureOnboardingRow(cleanEmail);
        return res.json({ user: sanitizeMember(user), sessionId, team: { id: team.id, name: team.name, access_code: team.access_code } });
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
      const avatarUrl = profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null;
      await finishOAuthLogin('discord', String(profile.id), profile.email, name, avatarUrl, pending.intent || 'login', res);
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
      const avatarUrl = ghUser.avatar_url || null;
      await finishOAuthLogin('github', String(ghUser.id), primary.email, name, avatarUrl, pending.intent || 'login', res);
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

      await finishOAuthLogin('google', String(profile.sub), profile.email, profile.name || '', profile.picture || null, intent, res);
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
    const member = (await dbGet("SELECT id, email, password FROM members WHERE id = ?", auth.memberId)) as any;
    if (!member) return res.status(404).json({ error: "Account not found" });
    if (!member.password) {
      return res.status(400).json({ error: "This account signs in with Google — there is no password to change" });
    }
    if (!bcrypt.compareSync(String(currentPassword || ""), member.password)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    const newHash = bcrypt.hashSync(String(newPassword), 10);
    // The password is account-wide: update every membership row for this email,
    // and kill every other session on all of them.
    (await dbRun("UPDATE members SET password = ? WHERE email = ?", newHash, member.email));
    const siblingIds = ((await dbAll("SELECT id FROM members WHERE email = ?", member.email)) as any[]).map((r) => r.id);
    const sid = currentSessionId(req);
    if (siblingIds.length) {
      const placeholders = siblingIds.map(() => "?").join(",");
      if (sid) await dbRun(`DELETE FROM sessions WHERE member_id IN (${placeholders}) AND id != ?`, ...siblingIds, sid);
      else await dbRun(`DELETE FROM sessions WHERE member_id IN (${placeholders})`, ...siblingIds);
    }
    res.json({ ok: true });
  });

  // Export my data (GDPR-style download)
  app.get("/api/auth/export", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const member = (await dbGet("SELECT id, team_id, name, role, email, is_setup, is_board, scopes, account_type, avatar_url FROM members WHERE id = ?", auth.memberId)) as any;
    // Bounded export: explicit columns (no SELECT *) and per-table row caps
    // so a long-tenured user can't trigger an unbounded dump.
    const EXPORT_LIMIT = 5000;
    const attendance = await dbAll("SELECT id, team_id, member_id, date, status, reason, is_excused FROM attendance WHERE member_id = ? ORDER BY date DESC LIMIT ?", auth.memberId, EXPORT_LIMIT);
    const feedback = await dbAll("SELECT id, team_id, user_id, category, message, status, created_at FROM feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", auth.memberId, EXPORT_LIMIT);
    const messages = await dbAll("SELECT id, team_id, sender_id, content, timestamp FROM messages WHERE sender_id = ? ORDER BY timestamp DESC LIMIT ?", auth.memberId, EXPORT_LIMIT);
    const notifications = await dbAll("SELECT id, user_id, content, type, is_read, timestamp FROM notifications WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?", auth.memberId, EXPORT_LIMIT);
    res.json({ exported_at: new Date().toISOString(), member, attendance, feedback, messages, notifications });
  });

  // Delete my account — only when the account has zero team memberships.
  // Typed email confirmation happens client-side. Deletes the user record,
  // their sessions, and their orphaned personal data (notifications, avatars);
  // team history (messages, attendance, feedback) stays with the teams.
  app.delete("/api/auth/account", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const email = auth.teamless
      ? (auth.email || "")
      : (((await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any)?.email || "");
    if (!email) return res.status(401).json({ error: "Not signed in" });
    const active = (await dbGet(
      "SELECT COUNT(*) AS n FROM members WHERE email = ? AND COALESCE(is_active, 1) = 1", email
    )) as any;
    if ((active?.n || 0) > 0) {
      return res.status(400).json({ error: "Delete or leave all of your teams first — account deletion is only available with no team memberships." });
    }
    const rows = (await dbAll("SELECT id, avatar_url FROM members WHERE email = ?", email)) as any[];
    const ids = rows.map((r) => r.id);
    // Remove avatar files (best effort, async — never block the event loop)
    await Promise.all(rows.map(async (r) => {
      try {
        if (r.avatar_url?.startsWith('/uploads/')) {
          const p = path.join(uploadDir, r.avatar_url.slice('/uploads/'.length));
          await fs.promises.unlink(p).catch(() => {});
        }
      } catch { /* best effort */ }
    }));
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      // Independent deletes → one batch (atomic on Turso, single round trip)
      await dbBatch([
        { sql: `DELETE FROM sessions WHERE member_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM stream_sessions WHERE member_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM notifications WHERE user_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM member_roles WHERE member_id IN (${ph})`, args: ids },
        { sql: "DELETE FROM members WHERE email = ?", args: [email] },
        { sql: "DELETE FROM onboarding_state WHERE email = ?", args: [normalizeOnboardingEmail(email) || ""] },
      ]);
    } else {
      await dbBatch([
        { sql: "DELETE FROM members WHERE email = ?", args: [email] },
        { sql: "DELETE FROM onboarding_state WHERE email = ?", args: [normalizeOnboardingEmail(email) || ""] },
      ]);
    }
    res.json({ ok: true });
  });


  // --- API Routes ---

  // Teams — the signed-in account sees every workspace it belongs to
  app.get("/api/teams", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const email = auth.teamless
      ? (auth.email || "")
      : (((await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any)?.email || "");
    const list = await userTeams(email);
    for (const t of list as any[]) {
      const c = (await dbGet("SELECT COUNT(*) AS n FROM members WHERE team_id = ? AND is_active = 1", t.id)) as any;
      t.member_count = c?.n || 0;
    }
    res.json(list);
  });

  // Create an additional workspace for this admin account (or a first
  // workspace for a teamless account)
  app.post("/api/teams", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    // Teamless accounts may always create a team; otherwise you need the
    // manage_members permission in your active team.
    if (!auth.teamless && !(await hasPerm(auth as any, "manage_members"))) {
      return res.status(403).json({ error: "You don't have permission for that" });
    }
    const { name, number, accent_color, primary_color, text_color } = req.body || {};
    const cleanName = (name || "").trim();
    if (!cleanName) return res.status(400).json({ error: "Team name is required" });
    const code = await uniqueAccessCode();
    const tInfo = (await dbRun(
      "INSERT INTO teams (name, number, access_code, accent_color, primary_color, text_color) VALUES (?, ?, ?, ?, ?, ?)",
      cleanName, (number || "").trim(), code, cleanHex(accent_color), cleanHex(primary_color), cleanHex(text_color)
    )) as any;
    const teamId = tInfo.lastInsertRowid;
    const me = auth.teamless
      ? (await dbGet("SELECT * FROM members WHERE email = ? ORDER BY id DESC LIMIT 1", auth.email || "")) as any
      : (await dbGet("SELECT * FROM members WHERE id = ?", auth.memberId)) as any;
    const mInfo = (await dbRun(
      "INSERT INTO members (team_id, name, role, email, password, avatar_url, is_setup, is_board, account_type, scopes, google_id, discord_id, github_id) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'admin', ?, ?, ?, ?)",
      teamId, me?.name || me?.email || "Admin", "Admin", me?.email || auth.email || "", me?.password || null, me?.avatar_url || null, JSON.stringify(['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin']), me?.google_id || null, me?.discord_id || null, me?.github_id || null
    )) as any;
    await ensureRolesSeeded(teamId);
    await assignSystemRole(teamId, mInfo.lastInsertRowid, "Admin");
    const sessionId = await createSession(mInfo.lastInsertRowid);
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
    (user as any).teams = me?.email ? await userTeams(me.email) : [];
    res.json({ team: { id: teamId, name: cleanName, number: (number || "").trim(), access_code: code }, user: sanitizeMember(user), sessionId });
  });

  // Switch the active workspace: the session moves to this account's
  // membership row in the target team.
  // Secret chatbot persona (NavGPT ❤️): per-team toggle for the qualifying team.
  // Admin-gated, active-team scoped. For every other team this returns 404 — no trace.
  app.post("/api/team/chat-persona", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const me = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
    if (!(await hasPermInTeam(me?.email || "", auth.teamId, "manage_members"))) {
      return res.status(403).json({ error: "Admins only" });
    }
    const team = (await dbGet("SELECT id, name FROM teams WHERE id = ?", auth.teamId)) as any;
    if (!team || !navGptQualifies(team.name)) {
      return res.status(404).json({ error: "Not available for this team" });
    }
    const enabled = req.body?.enabled !== false;
    (await dbRun("UPDATE teams SET navgpt_enabled = ? WHERE id = ?", enabled ? 1 : 0, team.id));
    res.json({ ok: true, navgpt_enabled: enabled ? 1 : 0 });
  });

  app.post("/api/teams/switch", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const teamId = parseInt(req.body?.team_id, 10);
    if (!teamId) return res.status(400).json({ error: "Choose a team" });
    const me = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
    const row = (await dbGet(
      "SELECT * FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1",
      me?.email || "", teamId
    )) as any;
    if (!row) return res.status(403).json({ error: "You're not a member of that team" });
    const sessionId = await createSession(row.id);
    const team = (await dbGet("SELECT * FROM teams WHERE id = ?", teamId)) as any;
    res.json({ user: sanitizeMember(row), sessionId, team });
  });

  // Join a team with its access code. Works for teamless accounts and for
  // accounts adding another team; reactivates a previously left membership.
  app.post("/api/teams/join", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const email = auth.teamless
      ? (auth.email || "")
      : (((await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any)?.email || "");
    if (!email) return res.status(401).json({ error: "Not signed in" });
    const code = String(req.body?.access_code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "Enter an access code" });
    const team = (await dbGet("SELECT * FROM teams WHERE access_code = ?", code)) as any;
    if (!team) return res.status(404).json({ error: "No team found with that access code" });
    const existing = (await dbGet("SELECT * FROM members WHERE email = ? AND team_id = ?", email, team.id)) as any;
    let row = existing;
    if (existing && (existing.is_active ?? 1) === 1) {
      // Already a member — just switch to it.
    } else if (existing) {
      await dbRun("UPDATE members SET is_active = 1 WHERE id = ?", existing.id);
      row = (await dbGet("SELECT * FROM members WHERE id = ?", existing.id)) as any;
    } else {
      // New membership: carry the account's identity (name, password hash,
      // linked providers) so sign-in keeps working everywhere.
      const src = (await dbGet("SELECT * FROM members WHERE email = ? ORDER BY id DESC LIMIT 1", email)) as any;
      const info = (await dbRun(
        "INSERT INTO members (team_id, name, role, email, password, avatar_url, is_setup, account_type, scopes, google_id, discord_id, github_id) VALUES (?, ?, ?, ?, ?, ?, 1, 'student', ?, ?, ?, ?)",
        team.id, src?.name || email.split("@")[0], "Member", email, src?.password || null, src?.avatar_url || null,
        JSON.stringify(['attendance']), src?.google_id || null, src?.discord_id || null, src?.github_id || null
      )) as any;
      row = (await dbGet("SELECT * FROM members WHERE id = ?", info.lastInsertRowid)) as any;
      await ensureRolesSeeded(team.id);
      await assignSystemRole(team.id, row.id, "Member");
    }
    const sessionId = await createSession(row.id);
    const user = sanitizeMember({ ...(row as any), teams: await userTeams(email) });
    res.json({ user, sessionId, team, joined: !existing || (existing.is_active ?? 1) !== 1 });
  });

  // Leave a team (non-admin path). History is preserved via soft-remove; the
  // last admin of a team can't leave until someone else is promoted.
  app.post("/api/teams/leave", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth || auth.teamless) return res.status(400).json({ error: "You're not in a team" });
    const teamId = parseInt(req.body?.team_id, 10) || auth.teamId;
    if (!teamId) return res.status(400).json({ error: "Invalid team" });
    const me = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
    const email = me?.email || "";
    const row = (await dbGet(
      "SELECT * FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, teamId
    )) as any;
    if (!row) return res.status(403).json({ error: "You're not a member of that team" });
    // Don't strand a team with no admins.
    if (await hasPermInTeam(email, teamId, "manage_members")) {
      if ((await countAdmins(teamId)) <= 1) {
        return res.status(409).json({
          error: "You're the last admin of this team. Promote another member to admin before leaving, or delete the team instead."
        });
      }
    }
    await dbRun("UPDATE members SET is_active = 0 WHERE id = ?", row.id);
    await dbRun("DELETE FROM stream_sessions WHERE member_id = ?", row.id);
    // Hand back a session on another team when leaving the active one; the
    // current session simply becomes teamless when nothing remains.
    let switched: any = null;
    let teamless = false;
    if (auth.teamId === teamId) {
      const other = (await dbGet(
        "SELECT * FROM members WHERE email = ? AND team_id != ? AND COALESCE(is_active, 1) = 1 ORDER BY id DESC LIMIT 1", email, teamId
      )) as any;
      if (other) {
        const sessionId = await createSession(other.id);
        switched = { sessionId, user: sanitizeMember({ ...(other as any), teams: await userTeams(email) }), team: (await dbGet("SELECT * FROM teams WHERE id = ?", other.team_id)) as any };
      } else {
        teamless = true;
      }
    }
    res.json({ ok: true, switched, teamless });
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

  // Delete a workspace. The account's FINAL team cannot be deleted — an account
  // must always belong to at least one team.
  app.delete("/api/teams/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const teamId = parseInt(req.params.id, 10);
    if (!teamId) return res.status(400).json({ error: "Invalid team" });
    const me = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
    const email = me?.email || "";
    // Must be a manager of the team being deleted
    if (!(await hasPermInTeam(email, teamId, "manage_members"))) {
      return res.status(403).json({ error: "Not your workspace" });
    }
    // Final-team guard removed: an admin may delete any of their teams,
    // including the last one — the session is kept alive and becomes teamless.
    const memberships = (await dbAll(
      "SELECT team_id FROM members WHERE email = ? AND COALESCE(is_active, 1) = 1", email
    )) as any[];
    const memberIds = ((await dbAll("SELECT id FROM members WHERE team_id = ?", teamId)) as any[]).map((r) => r.id);
    const inMembers = memberIds.length ? `IN (${memberIds.map(() => "?").join(",")})` : "IN (NULL)";
    const currentSessionId = getSessionId(req);
    // The caller's membership row in the team being deleted becomes an
    // inactive ghost anchor (team_id nulled so the team delete passes FKs) —
    // rows in their other teams are untouched.
    const myRowInTeam = (await dbGet(
      "SELECT id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, teamId
    )) as any;
    const stmts: { sql: string; args?: any[] }[] = [
      { sql: "DELETE FROM bruno_messages WHERE chat_id IN (SELECT id FROM bruno_chats WHERE team_id = ?)", args: [teamId] },
      { sql: "DELETE FROM bruno_chats WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM code_files WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM code_commits WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM code_repos WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM events WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM budget WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM outreach WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM social_stats WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM social_profiles WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM inventory WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM communications WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM messages WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM documentation WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM tasks WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM attendance WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM feedback WHERE team_id = ?", args: [teamId] },
      { sql: `DELETE FROM notifications WHERE user_id ${inMembers}`, args: memberIds },
      // Keep the caller's session alive so they stay signed in (teamless when
      // this was their last team); every other session on the team is dropped.
      { sql: `DELETE FROM sessions WHERE member_id ${inMembers} AND id != ?`, args: [...memberIds, currentSessionId] },
      { sql: `DELETE FROM stream_sessions WHERE member_id ${inMembers}`, args: memberIds },
      { sql: `DELETE FROM member_roles WHERE member_id ${inMembers}`, args: memberIds },
      { sql: "DELETE FROM roles WHERE team_id = ?", args: [teamId] },
      // Hard-delete every membership in the team except the caller's own row,
      // which stays as an inactive anchor (team_id nulled so the team delete
      // passes FKs) so their session/email survive teamless.
      { sql: "DELETE FROM members WHERE team_id = ? AND id != ?", args: [teamId, myRowInTeam?.id ?? -1] },
      { sql: "UPDATE members SET is_active = 0, team_id = NULL WHERE id = ?", args: [myRowInTeam?.id ?? -1] },
      { sql: "DELETE FROM teams WHERE id = ?", args: [teamId] },
    ];
    await dbBatch(stmts);
    // If the deleted team was the active one, hand the client a session for
    // another of the account's teams so they stay signed in; with no teams
    // left the kept-alive session simply becomes teamless.
    let switched: any = null;
    let teamless = false;
    if (auth.teamId === teamId) {
      const other = memberships.find((m) => m.team_id !== teamId);
      if (other) {
        const otherRow = (await dbGet(
          "SELECT * FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, other.team_id
        )) as any;
        if (otherRow) {
          const sessionId = await createSession(otherRow.id);
          switched = {
            sessionId,
            user: otherRow,
            team: (await dbGet("SELECT * FROM teams WHERE id = ?", other.team_id)) as any,
          };
        } else {
          teamless = true;
        }
      } else {
        teamless = true;
      }
    }
    res.json({ ok: true, switched, teamless });
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
  // Shared FTC team-number lookup with a 24h cache (used by the admin settings
  // lookup and the public signup lookup below).
  const ftcLookupCache = new Map<string, { at: number; data: any }>();
  async function lookupFtcTeam(number: number): Promise<any | null> {
    const key = `lookup:${number}`;
    const cached = ftcLookupCache.get(key);
    if (cached && Date.now() - cached.at < 24 * 3600 * 1000) return cached.data;
    const data = await ftcQuery(
      `query Lookup($number: Int!) { teamByNumber(number: $number) { number name schoolName rookieYear location { city state country } } }`,
      { number }
    );
    const team = data?.data?.teamByNumber || null;
    if (team) ftcLookupCache.set(key, { at: Date.now(), data: team });
    return team;
  }
  app.get("/api/ftc/lookup", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const number = parseInt(String(req.query.number || ""), 10);
    if (!number || number <= 0) return res.status(400).json({ error: "Enter a valid team number" });
    try {
      const team = await lookupFtcTeam(number);
      if (!team) return res.status(404).json({ error: "No FTC team found with that number" });
      res.json(team);
    } catch (e: any) {
      res.status(502).json({ error: "Could not reach FTC Scout — try again in a moment" });
    }
  });

  // Public variant for signup: no auth (the caller has no account yet).
  // Returns only the identity fields needed to verify a team.
  app.get("/api/ftc/lookup-public", async (req, res) => {
    const number = parseInt(String(req.query.number || ""), 10);
    if (!number || number <= 0) return res.status(400).json({ error: "Enter a valid team number" });
    try {
      const team = await lookupFtcTeam(number);
      if (!team) return res.status(404).json({ error: "No FTC team found with that number" });
      res.json({ number: team.number, name: team.name, schoolName: team.schoolName || null });
    } catch (e: any) {
      res.status(502).json({ error: "Could not reach FTC Scout — try again in a moment" });
    }
  });

  // Resolve the team's identity at signup: an FTC team number is verified
  // against the official FTC record (name auto-filled from the number);
  // otherwise a manual team name is required.
  async function resolveTeamIdentity(teamNumber: any, teamName: any): Promise<
    { name: string; number: string; ftcNumber: number | null } | { error: string }
  > {
    const numStr = String(teamNumber || "").trim();
    const nameStr = String(teamName || "").trim();
    const num = parseInt(numStr, 10);
    if (numStr && num > 0) {
      try {
        const t = await lookupFtcTeam(num);
        if (t && t.name) {
          // A resolved FTC number always wins: the official name cannot be
          // overridden by a user-supplied team name.
          return { name: t.name, number: numStr, ftcNumber: t.number };
        }
      } catch { /* FTC Scout unreachable — fall through to manual */ }
      if (!nameStr) {
        return { error: "No FTC team found with that number — enter your team name manually instead" };
      }
      return { name: nameStr, number: numStr, ftcNumber: null };
    }
    if (!nameStr) return { error: "Enter your FTC team number or your team name" };
    return { name: nameStr, number: "", ftcNumber: null };
  }

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
    const pm = await presenceMap(members.map((m: any) => m.id));
    for (const m of members) {
      m.presence = pm[m.id] || "offline";
    }
    res.json(sanitizeMembers(members));
  });

  app.post("/api/members", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const { name, role, email, is_board, scopes, account_type, accent_color, primary_color, text_color } = req.body;
    // An admin may add a member to any of their own teams (defaults to the active one)
    const me = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
    let targetTeamId = auth.teamId!;
    const requestedTeam = parseInt(req.body?.team_id, 10);
    if (requestedTeam && requestedTeam !== auth.teamId) {
      if (!(await hasPermInTeam(me?.email || "", requestedTeam, "manage_members"))) {
        return res.status(403).json({ error: "You can't manage that team" });
      }
      targetTeamId = requestedTeam;
    }
    const existing = (await dbGet("SELECT id, is_active, team_id FROM members WHERE email = ? AND team_id = ?", email, targetTeamId)) as any;
    const finalScopes = typeof scopes === 'string' ? scopes : JSON.stringify(scopes || []);
    if (existing && existing.is_active === 0) {
      // Re-adding a previously removed member: restore their account and history
      (await dbRun(
        "UPDATE members SET is_active = 1, name = ?, role = ?, is_board = ?, scopes = ?, account_type = ?, accent_color = ?, primary_color = ?, text_color = ? WHERE id = ?",
        name, role, is_board ? 1 : 0, finalScopes, account_type === 'admin' ? 'admin' : 'student',
        cleanHex(accent_color), cleanHex(primary_color), cleanHex(text_color), existing.id
      ));
      await setAdminRole(existing.id, targetTeamId, account_type === 'admin');
      return res.json({ id: existing.id, restored: true });
    }
    if (existing) return res.status(400).json({ error: "That email is already on the roster" });
    const info = (await dbRun("INSERT INTO members (team_id, name, role, email, is_board, scopes, account_type, accent_color, primary_color, text_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", targetTeamId, name, role, email, is_board ? 1 : 0, finalScopes, account_type === 'admin' ? 'admin' : 'student', cleanHex(accent_color), cleanHex(primary_color), cleanHex(text_color)));
    await assignSystemRole(targetTeamId, (info as any).lastInsertRowid, account_type === 'admin' ? "Admin" : "Member");
    await ensureOnboardingRow(email);
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

    // Email must stay unique within the team
    if (email && email !== target.email) {
      const clash = (await dbGet("SELECT id FROM members WHERE email = ? AND team_id = ? AND id != ?", email, auth.teamId, memberId)) as any;
      if (clash) return res.status(400).json({ error: "That email is already on the roster" });
    }

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
    const { name, role, accent_color, primary_color, text_color, avatar_url, presence_status } = req.body || {};
    const cleanName = (name || '').trim();
    if (!cleanName) return res.status(400).json({ error: "Name can't be empty" });
    const updates: any = { name: cleanName, role: (role || '').trim() };
    if (presence_status !== undefined) {
      if (!(PRESENCE_STATUSES as readonly string[]).includes(presence_status)) {
        return res.status(400).json({ error: "Invalid status — choose online, idle, dnd, or invisible" });
      }
      updates.presence_status = presence_status;
    }
    if (accent_color !== undefined) updates.accent_color = cleanHex(accent_color);
    if (primary_color !== undefined) updates.primary_color = cleanHex(primary_color);
    if (text_color !== undefined) updates.text_color = cleanHex(text_color);
    if (avatar_url !== undefined) updates.avatar_url = avatar_url || null;
    const cols = Object.keys(updates);
    (await dbRun(`UPDATE members SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(updates), auth.memberId));
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", auth.memberId));
    const sanitized = sanitizeMember(user);
    sanitized.presence = (await presenceMap([auth.memberId!]))[auth.memberId!] || 'offline';
    res.json({ user: sanitized });
  });

  // ---- Onboarding progress ----
  // Per-account (email-keyed) onboarding state. The email always comes from
  // the caller's own session — clients can never read or write another
  // account's state.
  //
  // New accounts get a default (incomplete) row at signup, so the welcome
  // screen shows on first login. Accounts created before this feature have no
  // row and are treated as already dismissed — never force-onboarded — while
  // still able to restart via the account menu's Setup guide.
  async function ensureOnboardingRow(email: string): Promise<void> {
    const key = normalizeOnboardingEmail(email);
    if (!key) return;
    await dbRun(
      "INSERT OR IGNORE INTO onboarding_state (email, state, updated_at) VALUES (?, ?, ?)",
      key,
      JSON.stringify(defaultOnboardingState()),
      new Date().toISOString()
    );
  }

  async function onboardingEmailFor(req: any, auth: any): Promise<string | null> {
    const email = auth.teamless
      ? auth.email
      : (((await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any)?.email || "");
    return normalizeOnboardingEmail(email);
  }

  app.get("/api/onboarding", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const email = await onboardingEmailFor(req, auth);
    if (!email) return res.status(401).json({ error: "Not signed in" });
    const row = (await dbGet("SELECT state FROM onboarding_state WHERE email = ?", email)) as any;
    if (!row) return res.json({ state: legacyOnboardingState() });
    let stored = null;
    try {
      stored = row?.state ? JSON.parse(row.state) : null;
    } catch {
      stored = null;
    }
    res.json({ state: mergeOnboardingState(stored, null) });
  });

  app.put("/api/onboarding", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const email = await onboardingEmailFor(req, auth);
    if (!email) return res.status(401).json({ error: "Not signed in" });
    const v = validateOnboardingPatch(req.body);
    if (v.ok === false) return res.status(400).json({ error: v.error });
    const row = (await dbGet("SELECT state FROM onboarding_state WHERE email = ?", email)) as any;
    let stored = null;
    try {
      stored = row?.state ? JSON.parse(row.state) : null;
    } catch {
      stored = null;
    }
    const merged = mergeOnboardingState(stored, v.patch);
    const now = new Date().toISOString();
    if (row) {
      await dbRun("UPDATE onboarding_state SET state = ?, updated_at = ? WHERE email = ?", JSON.stringify(merged), now, email);
    } else {
      await dbRun("INSERT INTO onboarding_state (email, state, updated_at) VALUES (?, ?, ?)", email, JSON.stringify(merged), now);
    }
    res.json({ state: merged });
  });

  // Reset theme colors to the default Volt & Carbon palette: clears the
  // member's personal overrides, and the team's (for workspace managers).
  app.post("/api/theme/reset", async (req, res) => {    const auth = await requireAuth(req, res);
    if (!auth) return;
    (await dbRun("UPDATE members SET accent_color = NULL, primary_color = NULL, text_color = NULL WHERE id = ?", auth.memberId));
    if (await hasPerm(auth, "manage_members")) {
      (await dbRun("UPDATE teams SET accent_color = NULL, primary_color = NULL, text_color = NULL WHERE id = ?", auth.teamId));
    }
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", auth.memberId));
    res.json({ ok: true, user: sanitizeMember(user) });
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
    res.json({ avatar_url: avatarUrl, user: sanitizeMember(user) });
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
    if (!Number.isFinite(memberId) || !Number.isFinite(roleId)) {
      return res.status(400).json({ error: "Invalid member or role id" });
    }
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
    if (!Number.isFinite(memberId) || !Number.isFinite(roleId)) {
      return res.status(400).json({ error: "Invalid member or role id" });
    }
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
      // Anyone may log their OWN attendance (self check-in / self report);
      // touching anyone else's records needs the attendance permission.
      const selfOnly = memberIds.length > 0 && memberIds.every((mid) => mid === auth.memberId);
      if (!selfOnly && !(await hasPerm(auth, "manage_attendance"))) {
        return res.status(403).json({ error: "You don't have permission for that" });
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

  // Self check-in: now restricted — students must use the QR code / day code.
  // Callers with attendance-management permission (admins) keep direct access.
  app.post("/api/attendance/checkin", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!(await hasPerm(auth, "manage_attendance"))) {
        return res.status(403).json({ error: "Check-in needs the QR code — ask your admin to put it up." });
      }
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

  // ---- QR check-in sessions ----
  const SESSION_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function genSessionCode(): string {
    const bytes = crypto.randomBytes(6);
    let s = "";
    for (const b of bytes) s += SESSION_CODE_ALPHABET[b % SESSION_CODE_ALPHABET.length];
    return s;
  }
  function getBaseUrl(req: any): string {
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    const host = req.get("host");
    return `${proto}://${host}`;
  }
  // End of today in America/New_York, for the "rest of day" session length.
  function endOfTodayEastern(): Date {
    // End of the current day in America/New_York, returned as a real UTC instant.
    // Computes the NY offset with pure arithmetic (formatToParts + Date.UTC) so
    // the result never depends on the server's local timezone. Iterates twice
    // so DST-transition days converge on the correct offset.
    const nyDate = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric",
    });
    const nyWall = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
    });
    const offsetMinutesAt = (utc: Date): number => {
      const p = nyWall.formatToParts(utc);
      const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
      const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
      return Math.round((asIfUtc - utc.getTime()) / 60000);
    };
    const dp = nyDate.formatToParts(new Date());
    const g = (t: string) => Number(dp.find((p) => p.type === t)?.value);
    const wallAsUtc = Date.UTC(g("year"), g("month") - 1, g("day"), 23, 59, 59, 999);
    let guess = wallAsUtc;
    for (let i = 0; i < 2; i++) {
      guess = wallAsUtc - offsetMinutesAt(new Date(guess)) * 60000;
    }
    return new Date(guess);
  }
  // YYYY-MM-DD of "today" in America/New_York (teams are US-based; UTC date is
  // wrong near midnight local time).
  function easternToday(): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  }
  async function activeSession(teamId: number | null): Promise<any | null> {
    if (!teamId) return null;
    const s = (await dbGet(
      "SELECT * FROM checkin_sessions WHERE team_id = ? AND is_active = 1 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1",
      teamId
    )) as any;
    if (!s) {
      // Lazily retire anything stale so only one live session ever exists.
      await dbRun("UPDATE checkin_sessions SET is_active = 0 WHERE team_id = ? AND is_active = 1 AND expires_at <= datetime('now')", teamId);
    }
    return s || null;
  }
  // Resolve the caller's membership row inside the session's team (multi-team
  // aware: the active session team may differ from the caller's active team).
  async function memberInTeam(auth: { memberId: number; email?: string }, teamId: number): Promise<any | null> {
    let row = (await dbGet("SELECT * FROM members WHERE id = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", auth.memberId, teamId)) as any;
    if (!row && auth.email) {
      row = (await dbGet("SELECT * FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", auth.email, teamId)) as any;
    }
    return row || null;
  }
  async function applyQrCheckin(session: any, auth: { memberId: number; email?: string }) {
    const member = await memberInTeam(auth, session.team_id);
    if (!member) return { error: "You're not on this team — ask your admin for the right code.", status: 403 };
    const today = easternToday();
    const existing = (await dbGet("SELECT status FROM attendance WHERE member_id = ? AND date = ?", member.id, today)) as any;
    if (existing && (existing.status === "P" || existing.status === "L")) {
      return { already: true, date: today, memberName: member.name };
    }
    await dbRun(
      `INSERT INTO attendance (member_id, date, status, team_id)
       VALUES (?, ?, 'P', ?)
       ON CONFLICT(member_id, date) DO UPDATE SET status = 'P'`,
      member.id, today, session.team_id
    );
    return { success: true, date: today, memberName: member.name };
  }
  // SQLite stores UTC "YYYY-MM-DD HH:MM:SS"; parse it back as UTC.
  function parseDbUtc(s: string): number {
    return new Date(s.replace(" ", "T") + "Z").getTime();
  }
  function sessionPayload(req: any, s: any) {
    return {
      token: s.token,
      code: s.code,
      expiresAt: new Date(parseDbUtc(s.expires_at)).toISOString(),
      url: `${getBaseUrl(req)}/checkin/${s.token}`,
    };
  }

  // Start a session (admin). Body: { durationMinutes } — 15/30/60/180, or
  // "today" for rest of day. Starting a new one retires any previous session.
  app.post("/api/attendance/qr-session", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_attendance");
      if (!auth) return;
      if (!(await hasPerm(auth, "manage_attendance"))) return res.status(403).json({ error: "Not allowed" });
      if (!auth.teamId) return res.status(400).json({ error: "No active team" });
      const { durationMinutes } = req.body || {};
      let expires: Date;
      if (durationMinutes === "today") {
        expires = endOfTodayEastern();
      } else {
        const mins = [15, 30, 60, 180].includes(Number(durationMinutes)) ? Number(durationMinutes) : 60;
        expires = new Date(Date.now() + mins * 60 * 1000);
      }
      if (expires.getTime() - Date.now() < 60 * 1000) {
        return res.status(400).json({ error: "The day is over — start a session tomorrow." });
      }
      await dbRun("UPDATE checkin_sessions SET is_active = 0 WHERE team_id = ? AND is_active = 1", auth.teamId);
      const token = crypto.randomBytes(24).toString("hex");
      let code = genSessionCode();
      for (let i = 0; i < 5; i++) {
        const clash = (await dbGet("SELECT id FROM checkin_sessions WHERE code = ? AND is_active = 1 AND expires_at > datetime('now')", code)) as any;
        if (!clash) break;
        code = genSessionCode();
      }
      const expStr = expires.toISOString().slice(0, 19).replace("T", " ");
      const info = (await dbRun(
        "INSERT INTO checkin_sessions (team_id, token, code, created_by, expires_at) VALUES (?, ?, ?, ?, ?)",
        auth.teamId, token, code, auth.memberId, expStr
      )) as any;
      const s = (await dbGet("SELECT * FROM checkin_sessions WHERE id = ?", info.lastInsertRowid)) as any;
      res.json({ session: sessionPayload(req, s) });
    } catch (error) {
      console.error("Error starting QR session:", error);
      res.status(500).json({ error: "Could not start session" });
    }
  });

  // Current live session for the caller's team (admin display / refresh).
  app.get("/api/attendance/qr-session", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!(await hasPerm(auth, "manage_attendance"))) return res.status(403).json({ error: "Not allowed" });
      const s = await activeSession(auth.teamId);
      res.json({ session: s ? sessionPayload(req, s) : null });
    } catch (error) {
      console.error("Error fetching QR session:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Stop the live session early.
  app.post("/api/attendance/qr-session/stop", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_attendance");
      if (!auth) return;
      if (!(await hasPerm(auth, "manage_attendance"))) return res.status(403).json({ error: "Not allowed" });
      await dbRun("UPDATE checkin_sessions SET is_active = 0 WHERE team_id = ? AND is_active = 1", auth.teamId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error stopping QR session:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Session info for the scanned landing page (token is unguessable; the team
  // name shown here is what the QR itself encodes).
  app.get("/api/attendance/qr-session/:token", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const s = (await dbGet("SELECT * FROM checkin_sessions WHERE token = ?", req.params.token)) as any;
      if (!s || !s.is_active || parseDbUtc(s.expires_at) <= Date.now()) {
        return res.status(410).json({ error: "This check-in code has expired — ask your admin for a new one." });
      }
      const team = (await dbGet("SELECT name FROM teams WHERE id = ?", s.team_id)) as any;
      const member = await memberInTeam(auth, s.team_id);
      const today = easternToday();
      const rec = member ? (await dbGet("SELECT status FROM attendance WHERE member_id = ? AND date = ?", member.id, today)) as any : null;
      res.json({
        teamName: team?.name || "Your team",
        expiresAt: new Date(parseDbUtc(s.expires_at)).toISOString(),
        isMember: !!member,
        memberName: member?.name || null,
        alreadyCheckedIn: !!(rec && (rec.status === "P" || rec.status === "L")),
      });
    } catch (error) {
      console.error("Error fetching QR session info:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check in via scanned QR token.
  app.post("/api/attendance/checkin/:token", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const s = (await dbGet("SELECT * FROM checkin_sessions WHERE token = ?", req.params.token)) as any;
      if (!s || !s.is_active || parseDbUtc(s.expires_at) <= Date.now()) {
        return res.status(410).json({ error: "This check-in code has expired — ask your admin for a new one." });
      }
      const result = await applyQrCheckin(s, auth);
      if (result.error) return res.status(result.status || 403).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error("Error in QR checkin:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check in via the typed day-code (camera fallback).
  app.post("/api/attendance/checkin-code", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const raw = String(req.body?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!raw) return res.status(400).json({ error: "Enter the code shown under the QR." });
      const s = (await dbGet(
        "SELECT * FROM checkin_sessions WHERE code = ? AND is_active = 1 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1",
        raw
      )) as any;
      if (!s) return res.status(404).json({ error: "No live session matches that code — check it and try again." });
      const result = await applyQrCheckin(s, auth);
      if (result.error) return res.status(result.status || 403).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error("Error in code checkin:", error);
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
    const auth = await requirePerm(req, res, "manage_attendance");
    if (!auth) return;
    const { date } = req.body;
    (await dbRun("INSERT OR IGNORE INTO hidden_dates (date) VALUES (?)", date));
    res.json({ success: true });
  });

  app.delete("/api/hidden-dates/:date", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_attendance");
    if (!auth) return;
    (await dbRun("DELETE FROM hidden_dates WHERE date = ?", req.params.date));
    res.json({ success: true });
  });

  // Bulk hide/unhide (used by the day-of-week toggles — one request instead of ~100)
  app.post("/api/hidden-dates/bulk", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_attendance");
    if (!auth) return;
    const { dates } = req.body;
    if (!Array.isArray(dates)) { res.status(400).json({ error: "dates must be an array" }); return; }
    let count = 0;
    for (const d of dates) {
      if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        await dbRun("INSERT OR IGNORE INTO hidden_dates (date) VALUES (?)", d);
        count++;
      }
    }
    res.json({ success: true, count });
  });

  app.post("/api/hidden-dates/bulk-delete", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_attendance");
    if (!auth) return;
    const { dates } = req.body;
    if (!Array.isArray(dates)) { res.status(400).json({ error: "dates must be an array" }); return; }
    let count = 0;
    for (const d of dates) {
      if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        await dbRun("DELETE FROM hidden_dates WHERE date = ?", d);
        count++;
      }
    }
    res.json({ success: true, count });
  });

  // Messages
  app.get("/api/messages", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    await backfillMessageChannels(auth.teamId!);
    const channelId = parseInt(String(req.query.channel_id || ''), 10);
    const where = Number.isFinite(channelId) && channelId > 0
      ? "m.team_id = ? AND m.channel_id = ?"
      : "m.team_id = ?";
    const args = Number.isFinite(channelId) && channelId > 0 ? [auth.teamId, channelId] : [auth.teamId];
    const msgs = (await dbAll(`
      SELECT m.*, mem.name as sender_name,
        rmem.name as reply_sender_name, r.content as reply_content,
        r.deleted_at as reply_deleted
      FROM messages m
      JOIN members mem ON m.sender_id = mem.id
      LEFT JOIN messages r ON r.id = m.reply_to_id
      LEFT JOIN members rmem ON rmem.id = r.sender_id
      WHERE ${where}
      ORDER BY timestamp ASC LIMIT 200
    `, ...args));
    res.json(msgs);
  });

  // ---- Chat channels ----
  app.get("/api/chat/channels", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    await ensureChatTemplate(auth.teamId!);
    const channels = (await dbAll(
      "SELECT * FROM chat_channels WHERE team_id = ? ORDER BY position ASC, id ASC",
      auth.teamId
    )) as any[];
    res.json(channels);
  });

  app.post("/api/chat/channels", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const rawName = String(req.body?.name || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (!rawName) return res.status(400).json({ error: "Channel name can't be empty" });
    const topic = String(req.body?.topic || '').trim().slice(0, 140);
    let categoryId: number | null = parseInt(req.body?.category_id, 10);
    if (!Number.isFinite(categoryId)) categoryId = null;
    if (categoryId != null) {
      const cat = (await dbGet("SELECT id FROM channel_categories WHERE id = ? AND team_id = ?", categoryId, auth.teamId)) as any;
      if (!cat) return res.status(400).json({ error: "Category not found" });
    }
    try {
      const posRow = (await dbGet(
        "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM chat_channels WHERE team_id = ? AND (category_id = ? OR (category_id IS NULL AND ? IS NULL))",
        auth.teamId, categoryId, categoryId
      )) as any;
      const pos = posRow?.p ?? 0;
      const info = (await dbRun(
        "INSERT INTO chat_channels (team_id, name, topic, position, category_id, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        auth.teamId, rawName, topic, pos, categoryId, auth.memberId
      ));
      const channel = (await dbGet("SELECT * FROM chat_channels WHERE id = ?", info.lastInsertRowid));
      broadcastToTeam(auth.teamId!, { type: "channel_created", channel });
      res.json({ channel });
    } catch (e: any) {
      if (String(e?.message || '').includes('UNIQUE')) {
        return res.status(409).json({ error: "A channel with that name already exists" });
      }
      throw e;
    }
  });

  app.patch("/api/chat/channels/:id", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    const channel = (await dbGet("SELECT * FROM chat_channels WHERE id = ? AND team_id = ?", id, auth.teamId)) as any;
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    const rawCat = req.body?.category_id;
    const categoryId: number | null = rawCat === null || rawCat === undefined || rawCat === '' ? null : parseInt(rawCat, 10);
    if (categoryId !== null && !Number.isFinite(categoryId)) {
      return res.status(400).json({ error: "Invalid category" });
    }
    if (categoryId != null) {
      const cat = (await dbGet("SELECT id FROM channel_categories WHERE id = ? AND team_id = ?", categoryId, auth.teamId)) as any;
      if (!cat) return res.status(400).json({ error: "Category not found" });
    }
    await dbRun("UPDATE chat_channels SET category_id = ? WHERE id = ?", categoryId, id);
    if (req.body?.post_restricted !== undefined) {
      await dbRun("UPDATE chat_channels SET post_restricted = ? WHERE id = ?", req.body.post_restricted ? 1 : 0, id);
    }
    const updated = (await dbGet("SELECT * FROM chat_channels WHERE id = ?", id)) as any;
    broadcastToTeam(auth.teamId!, { type: "channel_updated", channel: updated });
    res.json({ channel: updated });
  });

  // Channel categories (Discord-style groups)
  app.get("/api/chat/categories", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    await ensureChatTemplate(auth.teamId!);
    const cats = (await dbAll(
      "SELECT * FROM channel_categories WHERE team_id = ? ORDER BY position ASC, id ASC",
      auth.teamId
    )) as any[];
    res.json(cats);
  });

  app.post("/api/chat/categories", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) return res.status(400).json({ error: "Category name can't be empty" });
    try {
      const pos = (((await dbGet("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM channel_categories WHERE team_id = ?", auth.teamId)) as any)?.p ?? 0);
      const info = (await dbRun(
        "INSERT INTO channel_categories (team_id, name, position) VALUES (?, ?, ?)",
        auth.teamId, name, pos
      ));
      const category = (await dbGet("SELECT * FROM channel_categories WHERE id = ?", info.lastInsertRowid)) as any;
      broadcastToTeam(auth.teamId!, { type: "category_created", category });
      res.json({ category });
    } catch (e: any) {
      if (String(e?.message || '').includes('UNIQUE')) {
        return res.status(409).json({ error: "A category with that name already exists" });
      }
      throw e;
    }
  });

  app.patch("/api/chat/categories/:id", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    const cat = (await dbGet("SELECT * FROM channel_categories WHERE id = ? AND team_id = ?", id, auth.teamId)) as any;
    if (!cat) return res.status(404).json({ error: "Category not found" });
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) return res.status(400).json({ error: "Category name can't be empty" });
    try {
      await dbRun("UPDATE channel_categories SET name = ? WHERE id = ?", name, id);
    } catch (e: any) {
      if (String(e?.message || '').includes('UNIQUE')) {
        return res.status(409).json({ error: "A category with that name already exists" });
      }
      throw e;
    }
    const updated = (await dbGet("SELECT * FROM channel_categories WHERE id = ?", id)) as any;
    broadcastToTeam(auth.teamId!, { type: "category_updated", category: updated });
    res.json({ category: updated });
  });

  app.delete("/api/chat/categories/:id", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    const cat = (await dbGet("SELECT * FROM channel_categories WHERE id = ? AND team_id = ?", id, auth.teamId)) as any;
    if (!cat) return res.status(404).json({ error: "Category not found" });
    await dbBatch([
      { sql: "UPDATE chat_channels SET category_id = NULL WHERE category_id = ?", args: [id] },
      { sql: "DELETE FROM channel_categories WHERE id = ?", args: [id] },
    ]);
    broadcastToTeam(auth.teamId!, { type: "category_deleted", categoryId: id });
    res.json({ ok: true });
  });

  app.delete("/api/chat/channels/:id", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    const channel = (await dbGet("SELECT * FROM chat_channels WHERE id = ? AND team_id = ?", id, auth.teamId)) as any;
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    if (channel.name === 'general') return res.status(400).json({ error: "The #general channel can't be deleted" });
    const general = await ensureGeneralChannel(auth.teamId!);
    await dbBatch([
      { sql: "UPDATE messages SET channel_id = ? WHERE channel_id = ?", args: [general.id, id] },
      { sql: "DELETE FROM chat_channels WHERE id = ?", args: [id] },
    ]);
    broadcastToTeam(auth.teamId!, { type: "channel_deleted", channelId: id, movedTo: general.id });
    res.json({ ok: true, movedTo: general.id });
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

    const general = await ensureGeneralChannel(auth.teamId!);
    let channelId = parseInt(req.body.channel_id, 10);
    if (!Number.isFinite(channelId)) channelId = general.id;
    const chan = (await dbGet("SELECT id, post_restricted FROM chat_channels WHERE id = ? AND team_id = ?", channelId, auth.teamId)) as any;
    if (!chan) channelId = general.id;
    const restrictedUpload = (await dbGet("SELECT post_restricted FROM chat_channels WHERE id = ? AND team_id = ?", channelId, auth.teamId)) as any;
    if (restrictedUpload?.post_restricted && !(await hasPerm({ memberId: auth.memberId, teamId: auth.teamId }, "manage_members"))) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
      return res.status(403).json({ error: "Only admins can post in that channel" });
    }
    let replyToId: number | null = parseInt(req.body.reply_to_id, 10);
    if (!Number.isFinite(replyToId)) replyToId = null;
    if (replyToId != null) {
      const target = (await dbGet("SELECT id FROM messages WHERE id = ? AND team_id = ?", replyToId, auth.teamId)) as any;
      if (!target) replyToId = null;
    }

    const info = (await dbRun(
      "INSERT INTO messages (sender_id, content, timestamp, file_path, file_name, file_size, file_updated, team_id, channel_id, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    , sender_id, content || '', timestamp, filePath, fileName, fileSize, fileUpdated, auth.teamId, channelId, replyToId));

    let replyPreview: any = null;
    if (replyToId != null) {
      replyPreview = (await dbGet(`
        SELECT r.content as reply_content, r.deleted_at as reply_deleted, rmem.name as reply_sender_name
        FROM messages r LEFT JOIN members rmem ON rmem.id = r.sender_id
        WHERE r.id = ?
      `, replyToId)) as any;
    }

    broadcastToTeam(auth.teamId, {
      type: "chat",
      id: info.lastInsertRowid,
      sender_id: parseInt(sender_id),
      sender_name,
      content: content || '',
      channel_id: channelId,
      reply_to_id: replyToId,
      reply_sender_name: replyPreview?.reply_sender_name || null,
      reply_content: replyPreview?.reply_content || null,
      reply_deleted: replyPreview?.reply_deleted || null,
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
  app.post("/api/feedback", (req, res, next) => {
    screenshotUpload.single('screenshot')(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Invalid image" });
      next();
    });
  }, async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const { category, message } = req.body || {};
      const clean = (message || '').trim();
      if (!clean) return res.status(400).json({ error: "Message can't be empty" });
      const me = auth.teamless
        ? { name: '', email: auth.email || '' }
        : (await dbGet("SELECT name, email FROM members WHERE id = ?", auth.memberId)) as any;
      const screenshotUrl = (req as any).file ? `/uploads/${(req as any).file.filename}` : null;
      const info = (await dbRun(
        "INSERT INTO feedback (team_id, user_id, user_name, user_email, category, message, screenshot_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
        auth.teamId, auth.teamless ? null : auth.memberId, me?.name || '', me?.email || '', (category || 'general').toString().slice(0, 40), clean.slice(0, 5000), screenshotUrl
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

  // --- Owner: AI governance (usage, flags, per-user controls, deletion) ---
  app.get("/api/owner/ai-overview", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const today = (await dbGet(
      "SELECT COUNT(*) AS messages, COALESCE(SUM(total_tokens), 0) AS tokens, COUNT(DISTINCT member_id) AS users FROM ai_usage WHERE created_at >= datetime('now', 'start of day')"
    )) as any;
    const top = (await dbAll(`
      SELECT u.member_id AS id, m.name, m.email, t.name AS team_name,
             COUNT(*) AS messages, COALESCE(SUM(u.total_tokens), 0) AS tokens
      FROM ai_usage u
      LEFT JOIN members m ON m.id = u.member_id
      LEFT JOIN teams t ON t.id = u.team_id
      WHERE u.created_at >= datetime('now', '-7 days')
      GROUP BY u.member_id ORDER BY tokens DESC LIMIT 10
    `)) as any[];
    const flagRows = (await dbAll("SELECT status, COUNT(*) AS n FROM ai_flags GROUP BY status")) as any[];
    const flags: Record<string, number> = {};
    for (const r of flagRows) flags[r.status] = r.n;
    res.json({ today, top, flags });
  });

  // Richer users list: AI status, 7-day usage, open flags, warnings
  app.get("/api/owner/users", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const users = (await dbAll(`
      SELECT m.id, m.name, m.email, m.role, m.account_type, m.team_id, t.name as team_name,
        m.ai_disabled, m.ai_timeout_until, m.ai_daily_token_limit, m.ai_max_tokens_reply,
        m.google_id, m.discord_id, m.github_id,
        (SELECT COUNT(*) FROM ai_usage u WHERE u.member_id = m.id AND u.created_at >= datetime('now', '-7 days')) AS msgs_7d,
        (SELECT COALESCE(SUM(u.total_tokens), 0) FROM ai_usage u WHERE u.member_id = m.id AND u.created_at >= datetime('now', '-7 days')) AS tokens_7d,
        (SELECT COUNT(*) FROM ai_flags f WHERE f.member_id = m.id AND f.status = 'open') AS flags_open,
        (SELECT COUNT(*) FROM ai_warnings w WHERE w.member_id = m.id) AS warnings,
        (SELECT MAX(u.created_at) FROM ai_usage u WHERE u.member_id = m.id) AS last_ai_use
      FROM members m LEFT JOIN teams t ON m.team_id = t.id
      ORDER BY m.id DESC LIMIT 500
    `));
    res.json(users);
  });

  app.get("/api/owner/users/:id", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    const user = (await dbGet(
      `SELECT m.*, t.name AS team_name FROM members m LEFT JOIN teams t ON m.team_id = t.id WHERE m.id = ?`, id
    )) as any;
    if (!user) return res.status(404).json({ error: "User not found" });
    const siblings = (await dbAll(
      `SELECT m.id, m.team_id, t.name AS team_name, m.role, m.account_type FROM members m
       LEFT JOIN teams t ON t.id = m.team_id WHERE m.email = ? AND m.id != ?`, user.email, id
    )) as any[];
    const usage14 = (await dbAll(
      `SELECT date(created_at) AS day, COUNT(*) AS messages, COALESCE(SUM(total_tokens), 0) AS tokens
       FROM ai_usage WHERE member_id = ? AND created_at >= datetime('now', '-14 days')
       GROUP BY day ORDER BY day`, id
    )) as any[];
    const flags = (await dbAll(
      `SELECT * FROM ai_flags WHERE member_id = ? ORDER BY created_at DESC LIMIT 20`, id
    )) as any[];
    const warnings = (await dbAll(
      `SELECT * FROM ai_warnings WHERE member_id = ? ORDER BY created_at DESC`, id
    )) as any[];
    delete user.password;
    res.json({ user, siblings, usage14, flags, warnings });
  });

  app.patch("/api/owner/users/:id/ai", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    const target = (await dbGet("SELECT id, email FROM members WHERE id = ?", id)) as any;
    if (!target) return res.status(404).json({ error: "User not found" });
    if (ownerEmails().includes((target.email || "").toLowerCase())) {
      return res.status(403).json({ error: "You can't restrict the app owner's AI access." });
    }
    const b = req.body || {};
    const sets: string[] = [];
    const args: any[] = [];
    if (typeof b.ai_disabled === "boolean") { sets.push("ai_disabled = ?"); args.push(b.ai_disabled ? 1 : 0); }
    if (b.timeoutHours !== undefined && b.timeoutHours !== null) {
      const h = parseFloat(b.timeoutHours);
      if (Number.isFinite(h) && h > 0) {
        sets.push("ai_timeout_until = ?");
        args.push(new Date(Date.now() + h * 3600_000).toISOString().slice(0, 19).replace("T", " "));
      }
    } else if (b.ai_timeout_until !== undefined) {
      sets.push("ai_timeout_until = ?"); args.push(b.ai_timeout_until || null);
    }
    if (b.ai_daily_token_limit !== undefined) {
      const n = parseInt(b.ai_daily_token_limit, 10);
      sets.push("ai_daily_token_limit = ?"); args.push(Number.isFinite(n) && n > 0 ? n : null);
    }
    if (b.ai_max_tokens_reply !== undefined) {
      const n = parseInt(b.ai_max_tokens_reply, 10);
      sets.push("ai_max_tokens_reply = ?"); args.push(Number.isFinite(n) && n > 0 ? n : null);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    await dbRun(`UPDATE members SET ${sets.join(", ")} WHERE id = ?`, ...args, id);
    const updated = (await dbGet("SELECT ai_disabled, ai_timeout_until, ai_daily_token_limit, ai_max_tokens_reply FROM members WHERE id = ?", id)) as any;
    res.json({ success: true, controls: updated });
  });

  app.post("/api/owner/users/:id/warn", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    const target = (await dbGet("SELECT id, team_id FROM members WHERE id = ?", id)) as any;
    if (!target) return res.status(404).json({ error: "User not found" });
    const note = String(req.body?.note || "").slice(0, 1000);
    await dbRun("INSERT INTO ai_warnings (member_id, team_id, note) VALUES (?, ?, ?)", id, target.team_id, note || null);
    const count = (await dbGet("SELECT COUNT(*) AS n FROM ai_warnings WHERE member_id = ?", id)) as any;
    res.json({ success: true, warnings: count?.n || 0 });
  });

  async function ownerDeleteMembership(memberId: number): Promise<{ ok: boolean; error?: string }> {
    const target = (await dbGet("SELECT id, email, team_id, account_type FROM members WHERE id = ?", memberId)) as any;
    if (!target) return { ok: false, error: "User not found" };
    if (ownerEmails().includes((target.email || "").toLowerCase())) {
      return { ok: false, error: "You can't delete the app owner's account." };
    }
    const perms = await rolePerms(target.id, target.team_id);
    const isAdminish = target.account_type === "admin" || perms.has("*") || perms.has("manage_members");
    if (isAdminish && (await countAdmins(target.team_id)) <= 1) {
      return { ok: false, error: "They're the last admin of their team — promote someone else first." };
    }
    // Sessions + role assignments
    await dbRun("DELETE FROM sessions WHERE member_id = ?", target.id);
    await dbRun("DELETE FROM stream_sessions WHERE member_id = ?", target.id);
    await dbRun("DELETE FROM member_roles WHERE member_id = ?", target.id);
    // Their private AI chats (public team chats stay for the team)
    const privChats = (await dbAll("SELECT id FROM bruno_chats WHERE member_id = ? AND COALESCE(is_public, 0) != 1", target.id)) as any[];
    for (const c of privChats) {
      await dbRun("DELETE FROM bruno_messages WHERE chat_id = ?", c.id);
      await dbRun("DELETE FROM bruno_chats WHERE id = ?", c.id);
    }
    await dbRun("DELETE FROM ai_usage WHERE member_id = ?", target.id);
    await dbRun("DELETE FROM members WHERE id = ?", target.id);
    return { ok: true };
  }

  // Delete one team membership (they keep their other teams)
  app.delete("/api/owner/users/:id", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const r = await ownerDeleteMembership(parseInt(req.params.id, 10));
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ success: true });
  });

  // Delete an entire account: every membership under one email
  app.delete("/api/owner/accounts", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email query param required" });
    if (ownerEmails().includes(email)) return res.status(403).json({ error: "You can't delete the app owner's account." });
    const rows = (await dbAll("SELECT id FROM members WHERE lower(email) = ?", email)) as any[];
    const deleted: number[] = [];
    const skipped: { id: number; error: string }[] = [];
    for (const r of rows) {
      const out = await ownerDeleteMembership(r.id);
      if (out.ok) deleted.push(r.id); else skipped.push({ id: r.id, error: out.error || "failed" });
    }
    res.json({ success: true, deleted, skipped });
  });

  app.get("/api/owner/ai-flags", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const status = String(req.query.status || "open");
    const where = status === "all" ? "" : "WHERE f.status = 'open'";
    const items = (await dbAll(`
      SELECT f.*, m.name AS user_name, m.email AS user_email, t.name AS team_name
      FROM ai_flags f
      LEFT JOIN members m ON m.id = f.member_id
      LEFT JOIN teams t ON t.id = f.team_id
      ${where} ORDER BY f.created_at DESC LIMIT 200
    `)) as any[];
    res.json(items);
  });

  app.patch("/api/owner/ai-flags/:id", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    const flag = (await dbGet("SELECT * FROM ai_flags WHERE id = ?", id)) as any;
    if (!flag) return res.status(404).json({ error: "Flag not found" });
    const { action, note, timeoutHours } = req.body || {};
    const cleanNote = String(note || "").slice(0, 1000) || null;
    let status = "dismissed";
    if (action === "warn") {
      status = "warned";
      await dbRun("INSERT INTO ai_warnings (member_id, team_id, note) VALUES (?, ?, ?)", flag.member_id, flag.team_id, cleanNote);
    } else if (action === "timeout") {
      status = "timed_out";
      const h = Number.isFinite(parseFloat(timeoutHours)) && parseFloat(timeoutHours) > 0 ? parseFloat(timeoutHours) : 24;
      const until = new Date(Date.now() + h * 3600_000).toISOString().slice(0, 19).replace("T", " ");
      await dbRun("UPDATE members SET ai_timeout_until = ? WHERE id = ?", until, flag.member_id);
    } else if (action === "disable") {
      status = "ai_disabled";
      await dbRun("UPDATE members SET ai_disabled = 1 WHERE id = ?", flag.member_id);
    }
    await dbRun("UPDATE ai_flags SET status = ?, reviewer_note = ?, reviewed_at = datetime('now') WHERE id = ?", status, cleanNote, id);
    res.json({ success: true, status });
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
      // AI token limits are global and affect every team + API usage:
      // only the app owner may change them.
      if (typeof key === "string" && key.startsWith("max_tokens_")) {
        const member = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
        if (!ownerEmails().includes((member?.email || "").toLowerCase())) {
          return res.status(403).json({ error: "Only the app owner can change AI limits." });
        }
      }
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
      const auth = await requirePerm(req, res, "manage_tasks");
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
      const auth = await requirePerm(req, res, "manage_tasks");
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
      const auth = await requirePerm(req, res, "manage_calendar");
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
      const auth = await requirePerm(req, res, "manage_calendar");
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
      const auth = await requirePerm(req, res, "manage_calendar");
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
      const auth = await requirePerm(req, res, "manage_budget");
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
      const auth = await requirePerm(req, res, "manage_budget");
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
      const { title, description, date, hours, location, attendees, funds_raised } = req.body;
      const info = (await dbRun("INSERT INTO outreach (title, description, date, hours, location, attendees, funds_raised, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", title, description, date, hours, location, Math.max(0, parseInt(attendees) || 0), Math.max(0, parseFloat(funds_raised) || 0), auth.teamId));

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
      const { title, description, date, hours, location, attendees, funds_raised } = req.body || {};
      (await dbRun(
        "UPDATE outreach SET title = ?, description = ?, date = ?, hours = ?, location = ?, attendees = ?, funds_raised = ? WHERE id = ?",
        title || '', description || '', date || '', hours || 0, location || '', Math.max(0, parseInt(attendees) || 0), Math.max(0, parseFloat(funds_raised) || 0), req.params.id
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

  // ---- Social auto-sync (YouTube + TikTok) ----
  // YouTube: server API key pulls public channel stats — no per-user OAuth needed.
  // TikTok: per-team OAuth via Login Kit (user.info.basic + user.info.stats).
  const SOCIAL_PLATFORMS = ["youtube", "tiktok"];

  // --- Token encryption (AES-256-GCM) for TikTok OAuth tokens ---
  const SOCIAL_TOKEN_KEY = process.env.SOCIAL_TOKEN_KEY || "";
  let socialCipherKey: Buffer;
  if (SOCIAL_TOKEN_KEY) {
    socialCipherKey = crypto.scryptSync(SOCIAL_TOKEN_KEY, "control-point-social", 32);
  } else {
    socialCipherKey = crypto.randomBytes(32);
    console.warn("[Social] SOCIAL_TOKEN_KEY not set — TikTok tokens use an ephemeral key and will need reconnecting after a restart.");
  }
  function encryptSocialToken(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", socialCipherKey, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `${iv.toString("base64")}.${enc.toString("base64")}.${cipher.getAuthTag().toString("base64")}`;
  }
  function decryptSocialToken(blob: string): string {
    const [ivB64, encB64, tagB64] = blob.split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", socialCipherKey, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
  }

  // --- YouTube Data API v3 ---
  // Pure helpers live in youtube.ts (unit-tested); these thin wrappers inject
  // the configured server API key.
  async function youtubeApi(path: string, params: Record<string, string>): Promise<any> {
    return youtubeApiImpl(YOUTUBE_API_KEY, path, params);
  }
  function pickYouTubeChannel(ch: any) {
    return pickYouTubeChannelImpl(ch);
  }
  async function resolveYouTubeChannel(input: string) {
    return resolveYouTubeChannelImpl(input, YOUTUBE_API_KEY);
  }
  async function fetchYouTubeStats(channelId: string) {
    return fetchYouTubeStatsImpl(YOUTUBE_API_KEY, channelId);
  }

  // --- TikTok Login Kit ---
  const tiktokOauthStates = new Map<string, { teamId: number; verifier: string; expiry: number }>();
  function tiktokRedirectUri(req: any): string {
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    if (base) return `${base}/api/auth/tiktok/callback`;
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    return `${proto}://${req.get("host")}/api/auth/tiktok/callback`;
  }
  async function tiktokTokenRequest(body: Record<string, string>): Promise<any> {
    const r = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, ...body }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.access_token) {
      throw new Error(data?.error_description || data?.error || "TikTok token request failed");
    }
    return data;
  }
  async function tiktokUserInfo(accessToken: string): Promise<any> {
    const r = await fetch("https://open.tiktokapis.com/v2/user/info/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ fields: ["open_id", "avatar_url", "display_name", "username", "follower_count", "following_count", "likes_count", "video_count"] }),
    });
    const data = await r.json().catch(() => null);
    const u = data?.data?.user;
    if (!r.ok || !u?.open_id) throw new Error(data?.error?.message || "Failed to fetch TikTok profile");
    return u;
  }
  async function getTikTokAccessToken(profile: any): Promise<string | null> {
    const now = Date.now();
    try {
      if (profile.access_token && profile.token_expires_at && profile.token_expires_at > now + 5 * 60 * 1000) {
        return decryptSocialToken(profile.access_token);
      }
      if (!profile.refresh_token) throw new Error("no refresh token");
      const t = await tiktokTokenRequest({ grant_type: "refresh_token", refresh_token: decryptSocialToken(profile.refresh_token) });
      const expiresAt = Date.now() + (t.expires_in || 86400) * 1000;
      const newRefresh = t.refresh_token ? encryptSocialToken(t.refresh_token) : profile.refresh_token;
      await dbRun("UPDATE social_profiles SET access_token = ?, refresh_token = ?, token_expires_at = ?, token_status = 'ok' WHERE id = ?",
        encryptSocialToken(t.access_token), newRefresh, expiresAt, profile.id);
      return t.access_token;
    } catch (e) {
      console.error(`[Social] TikTok token refresh failed for profile ${profile.id}:`, (e as Error).message);
      await dbRun("UPDATE social_profiles SET token_status = 'needs_reconnect' WHERE id = ?", profile.id);
      return null;
    }
  }

  // --- Snapshot + sync core ---
  async function recordSocialSnapshot(profileId: number, teamId: number, stats: { followers: number; likes: number; posts: number; views: number }) {
    await dbRun("INSERT INTO social_stats (profile_id, team_id, followers, likes, posts, views) VALUES (?, ?, ?, ?, ?, ?)",
      profileId, teamId, Math.round(stats.followers || 0), Math.round(stats.likes || 0), Math.round(stats.posts || 0), Math.round(stats.views || 0));
    await dbRun("UPDATE social_profiles SET last_synced_at = ? WHERE id = ?", Date.now(), profileId);
  }
  async function syncSocialProfile(profile: any): Promise<{ ok: boolean; error?: string }> {
    try {
      if (profile.platform === "youtube") {
        if (!YOUTUBE_API_KEY) return { ok: false, error: "YouTube API key not configured" };
        if (!profile.external_id) return { ok: false, error: "No channel linked" };
        const s = await fetchYouTubeStats(profile.external_id);
        await dbRun("UPDATE social_profiles SET display_name = ?, avatar_url = ? WHERE id = ?", s.displayName, s.avatarUrl, profile.id);
        await recordSocialSnapshot(profile.id, profile.team_id, { followers: s.followers, likes: 0, posts: s.posts, views: s.views });
        return { ok: true };
      }
      if (profile.platform === "tiktok") {
        if (!TIKTOK_ENABLED) return { ok: false, error: "TikTok is temporarily unavailable" };
        if (!(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET)) return { ok: false, error: "TikTok not configured" };
        const token = await getTikTokAccessToken(profile);
        if (!token) return { ok: false, error: "TikTok connection expired — reconnect it" };
        const u = await tiktokUserInfo(token);
        await dbRun("UPDATE social_profiles SET display_name = ?, avatar_url = ? WHERE id = ?", u.display_name || profile.display_name, u.avatar_url || profile.avatar_url, profile.id);
        await recordSocialSnapshot(profile.id, profile.team_id, {
          followers: Number(u.follower_count || 0),
          likes: Number(u.likes_count || 0),
          posts: Number(u.video_count || 0),
          views: 0,
        });
        return { ok: true };
      }
      return { ok: false, error: "Unknown platform" };
    } catch (e: any) {
      console.error(`[Social] Sync failed for profile ${profile.id}:`, e.message);
      return { ok: false, error: e.message || "Sync failed" };
    }
  }
  function socialGrowth(snaps: any[]) {
    if (snaps.length < 2) return null;
    const first = snaps[0], last = snaps[snaps.length - 1];
    const delta = (last.followers || 0) - (first.followers || 0);
    const pct = first.followers ? (delta / first.followers) * 100 : 0;
    return { delta, pct: Math.round(pct * 10) / 10 };
  }

  // Daily auto-sync: every profile, once a day. First run shortly after boot.
  let lastSocialSyncDate = "";
  async function runDailySocialSync() {
    const today = new Date().toISOString().slice(0, 10);
    if (today === lastSocialSyncDate) return;
    lastSocialSyncDate = today;
    try {
      const profiles = (await dbAll("SELECT * FROM social_profiles")) as any[];
      let ok = 0;
      for (const p of profiles) {
        if (p.platform === "tiktok" && (!TIKTOK_ENABLED || p.token_status === "needs_reconnect")) continue;
        const r = await syncSocialProfile(p);
        if (r.ok) ok++;
      }
      console.log(`[Social] Daily auto-sync finished: ${ok}/${profiles.length} profiles updated`);
    } catch (e) {
      console.error("[Social] Daily auto-sync failed:", e);
    }
  }
  setInterval(runDailySocialSync, 60 * 60 * 1000);
  setTimeout(runDailySocialSync, 90 * 1000);

  // --- TikTok connect (admin starts OAuth; tokens attach to the TEAM) ---
  app.get("/api/auth/tiktok/connect", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_outreach");
    if (!auth) return;
    if (!auth.teamId) return res.status(400).json({ error: "No team selected" });
    if (!TIKTOK_ENABLED) {
      return res.status(400).json({ error: "TikTok is temporarily unavailable while we verify the integration" });
    }
    if (!(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET)) {
      return res.status(400).json({ error: "TikTok is not configured yet" });
    }
    const state = randomHex(16);
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    tiktokOauthStates.set(state, { teamId: auth.teamId, verifier, expiry: Date.now() + 10 * 60 * 1000 });
    const params = new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      response_type: "code",
      scope: "user.info.basic,user.info.stats",
      redirect_uri: tiktokRedirectUri(req),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    res.redirect("https://www.tiktok.com/v2/auth/authorize/?" + params.toString());
  });

  app.get("/api/auth/tiktok/callback", async (req, res) => {
    if (!TIKTOK_ENABLED) return res.redirect("/outreach?social=tiktok_unavailable");
    try {
      const { code, state, error: tiktokError } = req.query as { code?: string; state?: string; error?: string };
      const pending = state ? tiktokOauthStates.get(state) : undefined;
      if (state) tiktokOauthStates.delete(state);
      if (tiktokError) return res.redirect("/outreach?social=cancelled");
      if (!code || !pending || pending.expiry < Date.now()) {
        return res.redirect("/outreach?social=error");
      }
      const tokens = await tiktokTokenRequest({
        grant_type: "authorization_code",
        code,
        redirect_uri: tiktokRedirectUri(req),
        code_verifier: pending.verifier,
      });
      const u = await tiktokUserInfo(tokens.access_token);
      const expiresAt = Date.now() + (tokens.expires_in || 86400) * 1000;
      const handle = u.username ? `@${u.username}` : (u.display_name || "TikTok account");
      const existing: any = await dbGet("SELECT id FROM social_profiles WHERE team_id = ? AND platform = 'tiktok'", pending.teamId);
      let profileId: number;
      if (existing) {
        profileId = existing.id;
        await dbRun(
          "UPDATE social_profiles SET handle = ?, external_id = ?, display_name = ?, avatar_url = ?, access_token = ?, refresh_token = ?, token_expires_at = ?, token_status = 'ok', last_synced_at = ? WHERE id = ?",
          handle, u.open_id, u.display_name, u.avatar_url,
          encryptSocialToken(tokens.access_token), encryptSocialToken(tokens.refresh_token),
          expiresAt, Date.now(), profileId
        );
      } else {
        const maxOrder: any = await dbGet("SELECT COALESCE(MAX(sort_order), -1) AS m FROM social_profiles WHERE team_id = ?", pending.teamId);
        const info: any = await dbRun(
          "INSERT INTO social_profiles (team_id, platform, handle, external_id, display_name, avatar_url, access_token, refresh_token, token_expires_at, token_status, sort_order, last_synced_at) VALUES (?, 'tiktok', ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)",
          pending.teamId, handle, u.open_id, u.display_name, u.avatar_url,
          encryptSocialToken(tokens.access_token), encryptSocialToken(tokens.refresh_token),
          expiresAt, (maxOrder.m + 1), Date.now()
        );
        profileId = info.lastInsertRowid;
      }
      await recordSocialSnapshot(profileId, pending.teamId, {
        followers: Number(u.follower_count || 0),
        likes: Number(u.likes_count || 0),
        posts: Number(u.video_count || 0),
        views: 0,
      });
      return res.redirect("/outreach?social=connected");
    } catch (e) {
      console.error("TikTok OAuth error:", e);
      return res.redirect("/outreach?social=error");
    }
  });

  // --- Social API ---
  app.get("/api/outreach/social", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const profiles = (await dbAll(
        "SELECT id, team_id, platform, handle, url, display_name, avatar_url, token_status, is_pinned, sort_order, last_synced_at, created_at FROM social_profiles WHERE team_id = ? ORDER BY is_pinned DESC, sort_order ASC, created_at ASC",
        auth.teamId
      )) as any[];
      for (const p of profiles) {
        const snaps = (await dbAll(
          "SELECT followers, likes, posts, views, recorded_at FROM social_stats WHERE profile_id = ? AND team_id = ? ORDER BY recorded_at ASC LIMIT 90",
          p.id, auth.teamId
        )) as any[];
        p.latest = snaps[snaps.length - 1] || null;
        p.history = snaps.map((s: any) => s.followers);
        p.growth = socialGrowth(snaps);
        p.snapshot_count = snaps.length;
      }
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching social profiles:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/outreach/social/youtube", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_outreach");
      if (!auth) return;
      if (!YOUTUBE_API_KEY) return res.status(400).json({ error: "YouTube sync isn't configured yet — add a YOUTUBE_API_KEY on the server" });
      const input = (req.body?.input || "").toString().trim();
      if (!input) return res.status(400).json({ error: "Enter a channel handle, URL, or channel ID" });
      let ch: any;
      try {
        ch = await resolveYouTubeChannel(input);
      } catch (e: any) {
        return res.status(400).json({ error: e.message || "Couldn't find that YouTube channel" });
      }
      const dup: any = await dbGet("SELECT id FROM social_profiles WHERE team_id = ? AND platform = 'youtube' AND external_id = ?", auth.teamId, ch.channelId);
      if (dup) return res.status(400).json({ error: "That channel is already linked" });
      const maxOrder: any = await dbGet("SELECT COALESCE(MAX(sort_order), -1) AS m FROM social_profiles WHERE team_id = ?", auth.teamId);
      const handle = (ch as any).handle || "@" + input.replace(/^@/, "").split(/[/?#]/)[0];
      const info: any = await dbRun(
        "INSERT INTO social_profiles (team_id, platform, handle, external_id, url, display_name, avatar_url, sort_order, last_synced_at) VALUES (?, 'youtube', ?, ?, ?, ?, ?, ?, ?)",
        auth.teamId, handle, ch.channelId, input.startsWith("http") ? input : null, ch.displayName, ch.avatarUrl, (maxOrder.m + 1), Date.now()
      );
      await recordSocialSnapshot(info.lastInsertRowid, auth.teamId, { followers: ch.followers, likes: 0, posts: ch.posts, views: ch.views });
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error linking YouTube channel:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/outreach/social/:id", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_outreach");
      if (!auth) return;
      const existing: any = await dbGet("SELECT team_id FROM social_profiles WHERE id = ?", req.params.id);
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      await dbRun("DELETE FROM social_stats WHERE profile_id = ?", req.params.id);
      await dbRun("DELETE FROM social_profiles WHERE id = ?", req.params.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting social profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/outreach/social/:id", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_outreach");
      if (!auth) return;
      const existing: any = await dbGet("SELECT team_id FROM social_profiles WHERE id = ?", req.params.id);
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      const pinned = !!req.body?.pinned;
      await dbRun("UPDATE social_profiles SET is_pinned = ? WHERE id = ?", pinned ? 1 : 0, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error pinning social profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/outreach/social/reorder", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_outreach");
      if (!auth) return;
      const ids = (req.body?.ids || []) as number[];
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No order provided" });
      await dbBatch(ids.map((id, i) => ({
        sql: "UPDATE social_profiles SET sort_order = ? WHERE id = ? AND team_id = ?",
        args: [i, id, auth.teamId],
      })));
      res.json({ ok: true });
    } catch (error) {
      console.error("Error reordering social profiles:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/outreach/social/:id/sync", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_outreach");
      if (!auth) return;
      const profile: any = await dbGet("SELECT * FROM social_profiles WHERE id = ?", req.params.id);
      if (!profile || profile.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      const result = await syncSocialProfile(profile);
      if (!result.ok) return res.status(400).json({ error: result.error || "Sync failed" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error syncing social profile:", error);
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
      const auth = await requirePerm(req, res, "manage_inventory");
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
      const auth = await requirePerm(req, res, "manage_inventory");
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
      const auth = await requirePerm(req, res, "manage_inventory");
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
      const _srAuth = await requirePerm(req, res, "manage_inventory");
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

  // Invoice import: any supplier's invoice — PDF or a photo/scan of one.
  const invoiceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      const name = file.originalname.toLowerCase();
      const ok =
        file.mimetype === "application/pdf" || name.endsWith(".pdf") ||
        ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype) ||
        [".png", ".jpg", ".jpeg", ".webp"].some((ext) => name.endsWith(ext));
      if (ok) cb(null, true);
      else cb(new Error("Only PDF or image files are allowed"));
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

  // --- Generic invoice import: any supplier's order invoice (PDF or photo/scan).
  // AI extracts line items from arbitrary layouts; the old goBILDA regex
  // parser remains as a fallback for PDFs when AI is unavailable.
  const INVENTORY_CATEGORIES = [
    "Structure", "Motion", "Wheels", "Electronics", "Sensors", "Power",
    "Hardware", "Tools", "Raw Material", "3D Printing", "Field", "Other",
  ];
  const INVOICE_EXTRACT_SYSTEM = `You extract purchasable line items from supplier order invoices and receipts for a robotics team's parts inventory. Return ONLY a JSON array — no markdown fences, no commentary, no trailing text. Each element must be an object: {"sku": string, "name": string, "quantity": number, "unitPrice": number, "category": string}.
Rules:
- One element per distinct line item on the invoice.
- "sku" is the supplier's part/SKU/model number as printed; use "" when none is shown.
- "name" is the item description, trimmed to about 120 characters.
- "quantity" is units ordered on that line (default 1 when unclear).
- "unitPrice" is the per-unit price in dollars (default 0 when unclear).
- "category" must be exactly one of: ${INVENTORY_CATEGORIES.join(", ")} — pick the closest fit for the item.
- Skip shipping, handling, tax, discounts, coupons, subtotals, totals, and gift cards.
- Never invent items that are not on the invoice.`;

  function sanitizeInvoiceItems(raw: any) {
    if (!Array.isArray(raw)) return [];
    const out: { sku: string; name: string; quantity: number; unitPrice: number; category: string }[] = [];
    for (const it of raw.slice(0, 500)) {
      if (!it || typeof it !== "object") continue;
      const sku = String(it.sku || "").trim().slice(0, 60);
      const name = String(it.name || "").trim().slice(0, 120) || sku;
      const quantity = Math.max(0, parseInt(it.quantity, 10) || 0);
      const unitPrice = Math.max(0, parseFloat(it.unitPrice) || 0);
      const category = INVENTORY_CATEGORIES.includes(String(it.category || "").trim())
        ? String(it.category).trim()
        : "Other";
      if (!name && !sku) continue;
      out.push({ sku, name, quantity: quantity || 1, unitPrice, category });
    }
    return out;
  }

  function parseInvoiceJson(text: string) {
    const cleaned = String(text || "")
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      return sanitizeInvoiceItems(JSON.parse(cleaned.slice(start, end + 1)));
    } catch {
      return [];
    }
  }

  async function handleInvoiceParse(req: any, res: any, upload: any, fieldName: string) {
    const auth = await requirePerm(req, res, "manage_inventory");
    if (!auth) return;
    if (aiRateLimitExceeded(auth.memberId, "invoice-parse", 30)) {
      return res.status(429).json({ error: AI_RATE_LIMIT_MSG });
    }
    upload.single(fieldName)(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      try {
        const file = (req as any).file;
        if (!file?.buffer?.length) return res.status(400).json({ error: "No file received" });
        const isPdf =
          file.mimetype === "application/pdf" ||
          String(file.originalname || "").toLowerCase().endsWith(".pdf");
        let text = "";
        if (isPdf) {
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({ data: file.buffer });
          try {
            const result = await parser.getText();
            text = result?.text || "";
          } finally {
            await parser.destroy().catch(() => {});
          }
        }
        let items: { sku: string; name: string; quantity: number; unitPrice: number }[] = [];
        if (isAIConfigured()) {
          try {
            const raw = isPdf
              ? await aiGenerate(INVOICE_EXTRACT_SYSTEM, `Invoice text:\n${text.slice(0, 15000)}`, 4096)
              : await aiGenerateWithImages(
                  INVOICE_EXTRACT_SYSTEM,
                  "Extract the purchasable line items from this invoice/receipt image.",
                  [{ mimeType: file.mimetype, data: file.buffer.toString("base64") }],
                  4096
                );
            items = parseInvoiceJson(raw);
          } catch (e: any) {
            console.error("invoice AI parse error:", e?.message);
          }
        }
        if (!items.length && isPdf && text) {
          items = parseGobildaOrder(text); // regex fallback for PDFs when AI is off or misses
        }
        if (!items.length) {
          return res.status(422).json({
            error: isPdf
              ? "No order line items found in this file. The layout may not be recognized — try a clearer scan, or send it to Sushil so the parser can be tuned."
              : "Could not read any line items from this image. AI invoice reading may not be configured — ask Sushil to check the Gemini API key.",
          });
        }
        res.json({ items, count: items.length });
      } catch (e: any) {
        console.error("invoice parse error:", e?.message);
        res.status(500).json({ error: "Could not read that file." });
      }
    });
  }

  app.post("/api/inventory/import-invoice/parse", (req, res) =>
    handleInvoiceParse(req, res, invoiceUpload, "file")
  );
  // Legacy alias for the old goBILDA-only route (old client bundles).
  app.post("/api/inventory/import-gobilda/parse", (req, res) =>
    handleInvoiceParse(req, res, pdfUpload, "pdf")
  );

  async function handleInvoiceConfirm(req: any, res: any, sourceLabel: string) {
    const auth = await requirePerm(req, res, "manage_inventory");
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
        const category = INVENTORY_CATEGORIES.includes(String(it.category || "").trim())
          ? String(it.category).trim()
          : "Other";
        if (!sku) {
          skipped.push(name || "(unnamed)");
          continue;
        }
        try {
          const existing: any = await dbGet("SELECT id, quantity FROM inventory WHERE team_id = ? AND sku = ?", auth.teamId, sku);
          if (existing) {
            await dbRun("UPDATE inventory SET quantity = quantity + ?, cost = ?, category = ? WHERE id = ?", quantity, cost, category, existing.id);
            merged++;
          } else {
            await dbRun(
              "INSERT INTO inventory (team_id, name, part_number, sku, quantity, location, category, description, cost, date_added) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)",
              auth.teamId,
              name,
              sku,
              sku,
              quantity,
              category,
              sourceLabel,
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
      console.error("invoice import confirm error:", e);
      res.status(500).json({ error: "Import failed" });
    }
  }

  app.post("/api/inventory/import-invoice/confirm", (req, res) =>
    handleInvoiceConfirm(req, res, "Imported from order invoice")
  );
  // Legacy alias for the old goBILDA-only route (old client bundles).
  app.post("/api/inventory/import-gobilda/confirm", (req, res) =>
    handleInvoiceConfirm(req, res, "Imported from goBILDA order")
  );

  // --- AI rate limiting (in-memory, per member, per endpoint) -------------------
  // Cost guard: caps how many AI requests one user can trigger per hour so a
  // runaway client (or someone hammering refresh) can't burn the Gemini
  // budget. Deliberate 429s — the client already shows "try again" copy.
  // No new infrastructure: a bounded in-memory map is free; Redis would not be.
  const aiRateBuckets = new Map<string, { count: number; resetAt: number }>();
  const aiRateSweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of aiRateBuckets) if (b.resetAt <= now) aiRateBuckets.delete(k);
  }, 5 * 60 * 1000);
  (aiRateSweep as any)?.unref?.();
  function aiRateLimitExceeded(memberId: number | string, endpoint: string, maxPerHour: number): boolean {
    const key = `${endpoint}:${memberId}`;
    const now = Date.now();
    let b = aiRateBuckets.get(key);
    if (!b || b.resetAt <= now) {
      // Bound the map itself: evict an arbitrary oldest-ish entry when huge.
      if (aiRateBuckets.size > 5000) {
        const first = aiRateBuckets.keys().next().value;
        if (first !== undefined) aiRateBuckets.delete(first);
      }
      b = { count: 0, resetAt: now + 60 * 60 * 1000 };
      aiRateBuckets.set(key, b);
    }
    b.count++;
    return b.count > maxPerHour;
  }
  const AI_RATE_LIMIT_MSG = "You're sending AI requests too fast — take a breather and try again in a bit.";

  // One-shot AI categorization for parts that have no category yet.
  app.post("/api/inventory/auto-categorize", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_inventory");
    if (!auth) return;
    if (!isAIConfigured()) {
      return res.status(501).json({ error: "AI is not configured — ask Sushil to check the Gemini API key." });
    }
    if (aiRateLimitExceeded(auth.memberId, "auto-categorize", 20)) {
      return res.status(429).json({ error: AI_RATE_LIMIT_MSG });
    }
    try {
      const parts: any[] = await dbAll(
        "SELECT id, sku, name FROM inventory WHERE team_id = ? AND (category IS NULL OR category = '') LIMIT 300",
        auth.teamId
      );
      if (!parts.length) return res.json({ categorized: 0 });
      const system = `You organize a robotics team's parts inventory into categories. You are given a JSON array of parts: [{"id": number, "sku": string, "name": string}]. Return ONLY a JSON array of {"id": number, "category": string} — one entry per part, same ids in the same order. Each category must be exactly one of: ${INVENTORY_CATEGORIES.join(", ")}. Pick the closest fit. No markdown, no commentary.`;
      const raw = await aiGenerate(system, JSON.stringify(parts.map((p) => ({ id: p.id, sku: p.sku, name: p.name }))).slice(0, 15000), 4096);
      const cleaned = String(raw || "").replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      let categorized = 0;
      if (start !== -1 && end > start) {
        try {
          const arr = JSON.parse(cleaned.slice(start, end + 1));
          if (Array.isArray(arr)) {
            for (const r of arr) {
              if (!r || typeof r.id === "undefined") continue;
              const cat = INVENTORY_CATEGORIES.includes(String(r.category || "").trim())
                ? String(r.category).trim()
                : "Other";
              await dbRun("UPDATE inventory SET category = ? WHERE id = ? AND team_id = ?", cat, r.id, auth.teamId);
              categorized++;
            }
          }
        } catch (e: any) {
          console.error("auto-categorize JSON parse error:", e?.message);
        }
      }
      res.json({ categorized });
    } catch (e: any) {
      console.error("auto-categorize error:", e?.message);
      res.status(500).json({ error: "Auto-categorize failed" });
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
      const auth = await requirePerm(req, res, "manage_documentation");
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
      const auth = await requirePerm(req, res, "manage_documentation");
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

  // --- Owner AI governance: per-member kill switch / timeout / token budgets ---
  async function aiAccessCheck(memberId: number): Promise<{ blocked: boolean; message?: string; timeoutUntil?: string }> {
    const m = (await dbGet("SELECT ai_disabled, ai_timeout_until, ai_daily_token_limit FROM members WHERE id = ?", memberId)) as any;
    if (!m) return { blocked: true, message: "Account not found." };
    if (m.ai_disabled === 1) {
      return { blocked: true, message: "AI access has been disabled for your account. Contact the app owner if you think this is a mistake." };
    }
    if (m.ai_timeout_until) {
      const until = new Date(m.ai_timeout_until).getTime();
      if (Number.isFinite(until) && until > Date.now()) {
        const when = new Date(m.ai_timeout_until).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        return { blocked: true, message: `Your AI access is paused until ${when}.`, timeoutUntil: m.ai_timeout_until };
      }
    }
    const limit = parseInt(m.ai_daily_token_limit, 10);
    if (Number.isFinite(limit) && limit > 0) {
      const used = (await dbGet(
        "SELECT COALESCE(SUM(total_tokens), 0) AS t FROM ai_usage WHERE member_id = ? AND created_at >= datetime('now', 'start of day')",
        memberId
      )) as any;
      if ((used?.t || 0) >= limit) {
        return { blocked: true, message: "You've reached your daily AI token limit. Try again tomorrow." };
      }
    }
    return { blocked: false };
  }

  async function logAiUsage(memberId: number, teamId: number | null, usage: any, promptChars: number, responseChars: number) {
    try {
      const prompt = usage?.promptTokens || Math.ceil(promptChars / 4);
      const response = usage?.responseTokens || Math.ceil(responseChars / 4);
      const total = usage?.totalTokens || prompt + response;
      await dbRun(
        "INSERT INTO ai_usage (member_id, team_id, endpoint, prompt_tokens, response_tokens, total_tokens) VALUES (?, ?, 'build-helper', ?, ?, ?)",
        memberId, teamId, prompt, response, total
      );
    } catch (e) {
      console.error("[AI] usage log failed:", (e as any)?.message || e);
    }
  }

  // Heuristic misuse signals. Flags are review-only — nothing auto-blocks.
  const HOMEWORK_SIGNALS: [RegExp, number][] = [
    [/\bhomework\b/i, 2], [/\bassignment\b/i, 2], [/\bessay\b/i, 2],
    [/\bquiz\b/i, 2], [/\btest answers\b/i, 3], [/\bmath problem\b/i, 2],
    [/write my\b/i, 3], [/do my (homework|assignment|essay|quiz)\b/i, 3],
    [/solve (this|these|the|for me)\b/i, 2], [/answer (this|these|the) (question|problem)/i, 2],
    [/summarize (this|the) (article|chapter|book|passage|reading)\b/i, 2],
    [/complete (this|the|my) (worksheet|assignment|homework)\b/i, 3],
  ];
  const HOMEWORK_FLAG_THRESHOLD = 4;

  async function flagMisuse(memberId: number, teamId: number | null, chatId: number | null, text: string) {
    try {
      const excerpt = String(text || "").slice(0, 400);
      // 1) Homework-like request
      let score = 0;
      for (const [re, pts] of HOMEWORK_SIGNALS) if (re.test(text)) score += pts;
      if (score >= HOMEWORK_FLAG_THRESHOLD) {
        const dup = (await dbGet(
          "SELECT id FROM ai_flags WHERE member_id = ? AND reason = 'homework' AND status = 'open' AND created_at >= datetime('now', '-6 hours')",
          memberId
        )) as any;
        if (!dup) {
          await dbRun(
            "INSERT INTO ai_flags (member_id, team_id, chat_id, excerpt, reason, score) VALUES (?, ?, ?, ?, 'homework', ?)",
            memberId, teamId, chatId, excerpt, score
          );
        }
      }
      // 2) Spam burst: 12+ AI messages in 10 minutes
      const burst = (await dbGet(
        "SELECT COUNT(*) AS n FROM ai_usage WHERE member_id = ? AND created_at >= datetime('now', '-10 minutes')",
        memberId
      )) as any;
      if ((burst?.n || 0) >= 12) {
        const dup = (await dbGet(
          "SELECT id FROM ai_flags WHERE member_id = ? AND reason = 'spam' AND status = 'open' AND created_at >= datetime('now', '-1 hour')",
          memberId
        )) as any;
        if (!dup) {
          await dbRun(
            "INSERT INTO ai_flags (member_id, team_id, chat_id, excerpt, reason, score) VALUES (?, ?, ?, ?, 'spam', ?)",
            memberId, teamId, chatId, excerpt, burst.n
          );
        }
      }
      // 3) Excessive daily use: 80+ AI messages in a day
      const dayCount = (await dbGet(
        "SELECT COUNT(*) AS n FROM ai_usage WHERE member_id = ? AND created_at >= datetime('now', 'start of day')",
        memberId
      )) as any;
      if ((dayCount?.n || 0) >= 80) {
        const dup = (await dbGet(
          "SELECT id FROM ai_flags WHERE member_id = ? AND reason = 'excessive-use' AND status = 'open' AND created_at >= datetime('now', 'start of day')",
          memberId
        )) as any;
        if (!dup) {
          await dbRun(
            "INSERT INTO ai_flags (member_id, team_id, chat_id, excerpt, reason, score) VALUES (?, ?, ?, ?, 'excessive-use', ?)",
            memberId, teamId, chatId, excerpt, dayCount.n
          );
        }
      }
    } catch (e) {
      console.error("[AI] flagging failed:", (e as any)?.message || e);
    }
  }

  app.post("/api/ai/fetch-news", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", result: "AI features are not configured yet. The team owner needs to add a Gemini API key." });
      }
      if (aiRateLimitExceeded(auth.memberId, "fetch-news", 30)) {
        return res.status(429).json({ error: AI_RATE_LIMIT_MSG, result: AI_RATE_LIMIT_MSG });
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
  // Bounded in-memory cache (no new infra — a shared Redis would add cost).
  // Entries are capped so a fleet of teams can't grow the map forever, and
  // concurrent requests for the same team share one in-flight generation
  // instead of each firing their own Gemini call.
  const SCOUT_FEED_TTL_MS = 6 * 60 * 60 * 1000;
  const SCOUT_FEED_MAX_TEAMS = 200;
  const scoutFeedCache = new Map<number, { at: number; items: any[] }>();
  const scoutFeedInflight = new Map<number, Promise<any[]>>();
  function scoutFeedCacheSet(teamKey: number, items: any[]) {
    if (!scoutFeedCache.has(teamKey) && scoutFeedCache.size >= SCOUT_FEED_MAX_TEAMS) {
      const oldest = scoutFeedCache.keys().next().value;
      if (oldest !== undefined) scoutFeedCache.delete(oldest);
    }
    scoutFeedCache.set(teamKey, { at: Date.now(), items });
  }

  // oEmbed validation cache: video ID → valid? (24h). YouTube video
  // existence barely changes, so re-validating the same ID per request is
  // pure waste. Bounded + in-flight deduped like the feed cache.
  const OEMBED_TTL_MS = 24 * 60 * 60 * 1000;
  const OEMBED_CACHE_MAX = 2000;
  const oembedCache = new Map<string, { at: number; ok: boolean }>();
  const oembedInflight = new Map<string, Promise<boolean>>();
  function oembedCacheSet(videoId: string, ok: boolean) {
    if (!oembedCache.has(videoId) && oembedCache.size >= OEMBED_CACHE_MAX) {
      const oldest = oembedCache.keys().next().value;
      if (oldest !== undefined) oembedCache.delete(oldest);
    }
    oembedCache.set(videoId, { at: Date.now(), ok });
  }

  async function checkYouTubeVideo(videoId: string, url: string, title: string): Promise<boolean> {
    const hit = oembedCache.get(videoId);
    if (hit && Date.now() - hit.at < OEMBED_TTL_MS) return hit.ok;
    const inflight = oembedInflight.get(videoId);
    if (inflight) return inflight;
    const p = (async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        let r: Response;
        try {
          r = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
            { signal: ctl.signal }
          );
        } finally {
          clearTimeout(t);
        }
        if (!r.ok) return false;
        let meta: any = null;
        try { meta = await r.json(); } catch { return false; }
        const STOP = new Set(["the","and","for","with","from","this","that","your","you","our","are","was","will","about","into","over","how","what","when","all"]);
        const sigWords = (s: string) => (s.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((w) => !STOP.has(w));
        const claimed = new Set(sigWords(String(title || "")));
        const actual = new Set(sigWords(String(meta?.title || "")));
        let overlap = 0;
        claimed.forEach((w) => { if (actual.has(w)) overlap++; });
        return overlap >= 2;
      } catch {
        return false;
      }
    })();
    oembedInflight.set(videoId, p);
    try {
      const ok = await p;
      oembedCacheSet(videoId, ok);
      return ok;
    } finally {
      oembedInflight.delete(videoId);
    }
  }

  // Run async tasks with at most `limit` in flight at once.
  async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (it: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    });
    await Promise.all(workers);
    return out;
  }

  async function buildAndValidateScoutFeed(maxTokens: number): Promise<any[]> {
    const raw = await scoutFeed(maxTokens);
    const items = parseScoutFeed(raw);
    // Drop YouTube items whose URLs don't resolve to the claimed video — the model
    // sometimes invents video IDs (even real-looking ones). oEmbed is keyless and fast:
    // non-200 means the video doesn't exist, and a title mismatch means the ID was
    // fabricated for an unrelated video. Validated 3 at a time, cached by video ID.
    const ytRe = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i;
    const checked = await mapWithConcurrency(items, 3, async (it: any) => {
      const m = String(it.url || "").match(ytRe);
      if (!m) return it;
      const ok = await checkYouTubeVideo(m[1], String(it.url), String(it.title || ""));
      return ok ? it : null;
    });
    return checked.filter(Boolean);
  }

  app.post("/api/ai/scout-feed", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", items: [] });
      }
      if (aiRateLimitExceeded(auth.memberId, "scout-feed", 30)) {
        return res.status(429).json({ error: AI_RATE_LIMIT_MSG, items: [] });
      }
      const teamKey = auth.teamId ?? 0;
      const force = req.body?.force === true;
      const hit = scoutFeedCache.get(teamKey);
      if (!force && hit && Date.now() - hit.at < SCOUT_FEED_TTL_MS) {
        return res.json({ items: hit.items, cached: true });
      }
      // Dedupe: if another request is already generating this team's feed,
      // wait for it instead of firing a second Gemini call. The check-and-set
      // is synchronous so concurrent requests can't slip past each other.
      if (force || !scoutFeedInflight.get(teamKey)) {
        const gen: Promise<any[]> = (async () => {
          const maxTokens = await getMaxTokens("max_tokens_news", 2048);
          return buildAndValidateScoutFeed(maxTokens);
        })();
        scoutFeedInflight.set(teamKey, gen);
        gen.then(
          (items) => { scoutFeedCacheSet(teamKey, items); if (scoutFeedInflight.get(teamKey) === gen) scoutFeedInflight.delete(teamKey); },
          () => { if (scoutFeedInflight.get(teamKey) === gen) scoutFeedInflight.delete(teamKey); }
        );
      }
      const validItems = await scoutFeedInflight.get(teamKey)!;
      if (!validItems.length) {
        return res.status(502).json({ error: "The scout feed came back empty — please try refreshing.", items: [] });
      }
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
      if (aiRateLimitExceeded(auth.memberId, "attendance-insights", 30)) {
        return res.status(429).json({ error: AI_RATE_LIMIT_MSG, result: AI_RATE_LIMIT_MSG });
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
  // Bruno calendar skill: the model ends its reply with a fenced ```event block
  // (a JSON object OR array) when the user confirms calendar events. Parse,
  // validate, strip. Events are only PROPOSED here — the client shows a
  // confirm button and the user confirms via POST /api/ai/apply-actions.
  function extractEventBlock(fullText: string): { text: string; events: { title: string; date: string; time: string; notes: string }[] | null } {
    const src = String(fullText || "");
    const m = src.match(EVENT_BLOCK_RE);
    if (!m) return { text: src, events: null };
    let events: { title: string; date: string; time: string; notes: string }[] | null = null;
    try {
      const raw = JSON.parse(m[1]);
      const arr = Array.isArray(raw) ? raw : [raw];
      const valid = arr.map((p: any) => {
        const okDate = typeof p?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && !isNaN(new Date(p.date + "T00:00:00").getTime());
        const okTime = !p?.time || (typeof p.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time));
        if (!p || typeof p.title !== "string" || !p.title.trim() || !okDate || !okTime) return null;
        return {
          title: p.title.trim().slice(0, 120),
          date: p.date,
          time: typeof p.time === "string" ? p.time : "",
          notes: typeof p.notes === "string" ? p.notes.trim().slice(0, 500) : "",
        };
      }).filter(Boolean);
      if (valid.length && valid.length <= 20) events = valid;
    } catch { /* malformed JSON — treat as no events */ }
    return { text: src.replace(EVENT_BLOCK_RE, "").trim(), events };
  }

  // Bruno outreach skill: the model ends its reply with a fenced ```outreach block
  // (a JSON array) when the user confirms outreach entries. Parse, validate, strip.
  const OUTREACH_BLOCK_RE = /```outreach\s*\r?\n([\s\S]*?)\r?\n```/;
  function extractOutreachBlock(fullText: string): { text: string; entries: any[] | null } {
    const src = String(fullText || "");
    const m = src.match(OUTREACH_BLOCK_RE);
    if (!m) return { text: src, entries: null };
    let entries: any[] | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (Array.isArray(p) && p.length > 0 && p.length <= 20) {
        const valid = p.map((e: any) => {
          if (!e || typeof e.title !== "string" || !e.title.trim()) return null;
          const okDate = typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !isNaN(new Date(e.date + "T00:00:00").getTime());
          if (!okDate) return null;
          const int0 = (v: any) => { const n = parseInt(v); return isNaN(n) || n < 0 ? 0 : n; };
          const funds = parseFloat(e.funds_raised);
          return {
            title: e.title.trim().slice(0, 120),
            description: typeof e.description === "string" ? e.description.trim().slice(0, 500) : "",
            date: e.date,
            hours: int0(e.hours),
            location: typeof e.location === "string" ? e.location.trim().slice(0, 120) : "",
            attendees: int0(e.attendees),
            funds_raised: isNaN(funds) || funds < 0 ? 0 : Math.round(funds * 100) / 100,
          };
        }).filter(Boolean);
        if (valid.length) entries = valid;
      }
    } catch { /* malformed JSON — treat as no entries */ }
    return { text: src.replace(OUTREACH_BLOCK_RE, "").trim(), entries };
  }

  // Bruno tasks skill: the model ends its reply with a fenced ```tasks block
  // (a JSON array) when the user confirms task entries. Parse, validate, strip.
  // Tasks are only PROPOSED here — confirmed via POST /api/ai/apply-actions.
  const TASKS_BLOCK_RE = /```tasks\s*\r?\n([\s\S]*?)\r?\n```/;
  function extractTasksBlock(fullText: string): { text: string; tasks: { title: string; description: string; due_date: string }[] | null } {
    const src = String(fullText || "");
    const m = src.match(TASKS_BLOCK_RE);
    if (!m) return { text: src, tasks: null };
    let tasks: { title: string; description: string; due_date: string }[] | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (Array.isArray(p) && p.length > 0 && p.length <= 20) {
        const valid = p.map((t: any) => {
          if (!t || typeof t.title !== "string" || !t.title.trim()) return null;
          let due = "";
          if (typeof t.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) && !isNaN(new Date(t.due_date + "T00:00:00").getTime())) {
            due = t.due_date;
          }
          return {
            title: t.title.trim().slice(0, 120),
            description: typeof t.description === "string" ? t.description.trim().slice(0, 500) : "",
            due_date: due,
          };
        }).filter(Boolean);
        if (valid.length) tasks = valid;
      }
    } catch { /* malformed JSON — treat as no tasks */ }
    return { text: src.replace(TASKS_BLOCK_RE, "").trim(), tasks };
  }

  // Bruno budget skill: the model ends its reply with a fenced ```budget block
  // (a JSON array) when the user confirms budget entries. Parse, validate, strip.
  // Entries are only PROPOSED here — confirmed via POST /api/ai/apply-actions.
  const BUDGET_BLOCK_RE = /```budget\s*\r?\n([\s\S]*?)\r?\n```/;
  function extractBudgetBlock(fullText: string): { text: string; entries: { type: string; amount: number; category: string; description: string; date: string }[] | null } {
    const src = String(fullText || "");
    const m = src.match(BUDGET_BLOCK_RE);
    if (!m) return { text: src, entries: null };
    let entries: { type: string; amount: number; category: string; description: string; date: string }[] | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (Array.isArray(p) && p.length > 0 && p.length <= 20) {
        const today = new Date().toISOString().slice(0, 10);
        const valid = p.map((b: any) => {
          const amount = parseFloat(b?.amount);
          if (isNaN(amount) || amount <= 0) return null;
          const type = b?.type === "income" ? "income" : "expense";
          let date = today;
          if (typeof b?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && !isNaN(new Date(b.date + "T00:00:00").getTime())) {
            date = b.date;
          }
          return {
            type,
            amount: Math.round(amount * 100) / 100,
            category: typeof b?.category === "string" ? b.category.trim().slice(0, 80) : "",
            description: typeof b?.description === "string" ? b.description.trim().slice(0, 500) : "",
            date,
          };
        }).filter(Boolean);
        if (valid.length) entries = valid;
      }
    } catch { /* malformed JSON — treat as no entries */ }
    return { text: src.replace(BUDGET_BLOCK_RE, "").trim(), entries };
  }

  // NavGPT coding handoff: the model ends its reply with a fenced ```switch block
  // when the user's request is a coding task. Parse, validate, strip — the client
  // renders a "Yes, switch to Bruno" button from the stripped signal.
  const SWITCH_BLOCK_RE = /```switch\s*\r?\n([\s\S]*?)\r?\n```/;
  function extractSwitchBlock(fullText: string): { text: string; switchTo: string | null } {
    const src = String(fullText || "");
    const m = src.match(SWITCH_BLOCK_RE);
    if (!m) return { text: src, switchTo: null };
    let switchTo: string | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (p && p.to === "bruno") switchTo = "bruno";
    } catch { /* malformed JSON — treat as no switch */ }
    return { text: src.replace(SWITCH_BLOCK_RE, "").trim(), switchTo };
  }

  app.post("/api/ai/build-helper", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", result: "Bruno isn't set up yet — the team owner needs to add a Gemini API key." });
      }
      // Owner AI governance: disabled / timed-out / over daily token budget
      const gate = await aiAccessCheck(auth.memberId);
      if (gate.blocked) {
        return res.status(403).json({ error: gate.message, aiBlocked: true, timeoutUntil: gate.timeoutUntil || null });
      }
      if (aiRateLimitExceeded(auth.memberId, "build-helper", 120)) {
        return res.status(429).json({ error: AI_RATE_LIMIT_MSG, result: AI_RATE_LIMIT_MSG });
      }
      const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const messages = raw
        .filter((m: any) => m && (m.role === "user" || m.role === "model") && typeof m.text === "string")
        .slice(-12)
        .map((m: any) => ({ role: m.role, text: m.text.slice(0, 2000) }));
      if (!messages.length || messages[messages.length - 1].role !== "user") {
        return res.status(400).json({ error: "A user message is required" });
      }
      // Misuse heuristics run async (never blocks the reply); flags land in the owner review queue
      const reqChatId = parseInt(req.body?.chatId, 10) || null;
      flagMisuse(auth.memberId, auth.teamId, reqChatId, messages[messages.length - 1].text);
      const globalMax = await getMaxTokens("max_tokens_chat", 1024);
      const memberCap = (await dbGet("SELECT ai_max_tokens_reply FROM members WHERE id = ?", auth.memberId)) as any;
      const perUserMax = parseInt(memberCap?.ai_max_tokens_reply, 10);
      const maxTokens = Number.isFinite(perUserMax) && perUserMax > 0 ? Math.min(globalMax, perUserMax) : globalMax;
      const stream = req.query.stream === "true";
      const teamContext = await buildChatContext(auth.teamId);
      const todayLine = `Today's date: ${new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })} (America/New_York).`;
      const fullContext = [teamContext, todayLine].filter(Boolean).join("\n\n");
      // Secret persona: NavGPT ❤️ overrides the Bruno identity only when the active
      // team qualifies (4215 Hypnotic Robotics) AND its toggle is switched on —
      // unless the client explicitly asked for Bruno (the coding-handoff switch).
      const personaOverride = req.body?.persona === "bruno" ? "bruno" : null;
      const navGptOn = !personaOverride && (await navGptActiveForTeam(auth.teamId));
      const systemExtra = [navGptOn ? NAVGPT_SYSTEM : "", fullContext].filter(Boolean).join("\n\n");
      // Data-action blocks (```event, ```outreach, ```tasks, ```budget) are
      // PROPOSALS only: strip them from the reply text here. Nothing is
      // inserted until the user taps the confirm button, which calls
      // POST /api/ai/apply-actions with the parsed items.
      const stripActionBlocks = (rawText: string): string => {
        let t = extractSwitchBlock(rawText).text;
        t = extractEventBlock(t).text;
        t = extractOutreachBlock(t).text;
        t = extractTasksBlock(t).text;
        t = extractBudgetBlock(t).text;
        return t;
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
        // The NavGPT -> Bruno handoff re-sends the same coding question under the
        // Bruno persona — don't persist a duplicate user message for it.
        const lastStored = (await dbGet("SELECT role, text FROM bruno_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1", chat.id)) as any;
        const dupUser = lastStored?.role === "user" && String(lastStored.text).slice(0, 20000) === String(userText).slice(0, 20000);
        if (!dupUser) {
          (await dbRun("INSERT INTO bruno_messages (chat_id, role, text) VALUES (?, 'user', ?)", chat.id, String(userText).slice(0, 20000)));
        }
        if (!chat.title && (msgCount?.n || 0) === 0) {
          const autoTitle = String(userText).slice(0, 45).trim();
          (await dbRun("UPDATE bruno_chats SET title = ? WHERE id = ?", (autoTitle || "New chat") + (String(userText).length > 45 ? "…" : ""), chat.id));
        }
        (await dbRun("UPDATE bruno_chats SET updated_at = datetime('now') WHERE id = ?", chat.id));
      }
      if (stream) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        // If the browser goes away mid-stream, abort the upstream Gemini
        // request instead of burning tokens on a reply nobody will read.
        const streamAbort = new AbortController();
        req.on("close", () => streamAbort.abort());
        try {
          let usage: any = null;
          const fullText = await buildHelperChat(messages, maxTokens, (chunk) => res.write(chunk), systemExtra, (u) => { usage = u; }, streamAbort.signal);
          const promptChars = messages.reduce((n: number, m: any) => n + String(m.text || "").length, 0);
          logAiUsage(auth.memberId, auth.teamId, usage, promptChars, String(fullText || "").length);
          // Strip the NavGPT ```switch handoff block and any data-action proposal
          // blocks before persisting (the live client strips them for display
          // itself and renders the switch button / confirm card).
          const finalText = stripActionBlocks(fullText);
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
      let nonStreamUsage: any = null;
      const nonStreamAbort = new AbortController();
      req.on("close", () => nonStreamAbort.abort());
      const result = await buildHelperChat(messages, maxTokens, undefined, systemExtra, (u) => { nonStreamUsage = u; }, nonStreamAbort.signal);
      const finalResult = stripActionBlocks(String(result || ""));
      const promptChars = messages.reduce((n: number, m: any) => n + String(m.text || "").length, 0);
      logAiUsage(auth.memberId, auth.teamId, nonStreamUsage, promptChars, String(finalResult || "").length);
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

  // Confirm + apply Bruno/NavGPT data-action proposals (```event, ```outreach,
  // ```tasks, ```budget blocks). The AI only proposes; nothing is inserted
  // until the user taps the confirm button, which calls this endpoint with the
  // parsed items. Server re-validates everything before inserting.
  // Permissions mirror the direct APIs: events/outreach any team member (same
  // as the old Bruno auto-insert behavior), tasks/budget admins only.
  app.post("/api/ai/apply-actions", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const actions = req.body?.actions;
      if (!Array.isArray(actions) || !actions.length || actions.length > 4) {
        return res.status(400).json({ error: "No actions to apply" });
      }
      const isAdmin = await hasPerm(auth, "manage_members");
      const applied: Record<string, number> = {};
      const createdAt = new Date().toISOString();
      for (const a of actions) {
        const kind = a?.kind;
        const items = Array.isArray(a?.items) ? a.items : [];
        if (!items.length || items.length > 20) continue;
        if (kind === "event") {
          const { events } = extractEventBlock("```event\n" + JSON.stringify(items) + "\n```");
          if (!events?.length) continue;
          for (const e of events) {
            (await insertTeamEvent(auth.teamId, auth.memberId, e));
          }
          applied.event = (applied.event || 0) + events.length;
        } else if (kind === "outreach") {
          const { entries } = extractOutreachBlock("```outreach\n" + JSON.stringify(items) + "\n```");
          if (!entries?.length) continue;
          for (const e of entries) {
            (await dbRun(
              "INSERT INTO outreach (title, description, date, hours, location, attendees, funds_raised, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              e.title, e.description, e.date, e.hours, e.location, e.attendees, e.funds_raised, auth.teamId
            ));
          }
          applied.outreach = (applied.outreach || 0) + entries.length;
        } else if (kind === "task") {
          if (!isAdmin) return res.status(403).json({ error: "Only admins can add tasks" });
          const { tasks } = extractTasksBlock("```tasks\n" + JSON.stringify(items) + "\n```");
          if (!tasks?.length) continue;
          for (const t of tasks) {
            (await dbRun(
              "INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, is_board, created_at) VALUES (?, ?, ?, 'todo', NULL, ?, 0, ?)",
              auth.teamId, t.title, t.description, t.due_date || null, createdAt
            ));
          }
          applied.task = (applied.task || 0) + tasks.length;
        } else if (kind === "budget") {
          if (!isAdmin) return res.status(403).json({ error: "Only admins can add budget entries" });
          const { entries } = extractBudgetBlock("```budget\n" + JSON.stringify(items) + "\n```");
          if (!entries?.length) continue;
          for (const b of entries) {
            (await dbRun(
              "INSERT INTO budget (team_id, type, amount, category, description, date) VALUES (?, ?, ?, ?, ?, ?)",
              auth.teamId, b.type, b.amount, b.category, b.description, b.date
            ));
          }
          applied.budget = (applied.budget || 0) + entries.length;
        }
      }
      if (!Object.keys(applied).length) {
        return res.status(400).json({ error: "Nothing valid to add — please try again" });
      }
      res.json({ ok: true, applied });
    } catch (error) {
      console.error("AI apply-actions error:", error);
      res.status(500).json({ error: "Couldn't save those — please try again" });
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
      if (aiRateLimitExceeded(auth.memberId, "activity-summary", 30)) {
        return res.status(429).json({ error: AI_RATE_LIMIT_MSG, result: AI_RATE_LIMIT_MSG });
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
      const auth = await requirePerm(req, res, "manage_communications");
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
      const auth = await requirePerm(req, res, "manage_communications");
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
      const auth = await requirePerm(req, res, "manage_code");
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
      const auth = await requirePerm(req, res, "manage_code");
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
      const auth = await requirePerm(req, res, "manage_code");
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
      const auth = await requirePerm(req, res, "manage_code");
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
      const auth = await requirePerm(req, res, "manage_code");
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
      const auth = await requirePerm(req, res, "manage_code");
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
      const auth = await requirePerm(req, res, "manage_code");
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
      const auth = await requirePerm(req, res, "manage_code");
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
