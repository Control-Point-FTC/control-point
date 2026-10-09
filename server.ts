#!/usr/bin/env node

import express from "express";
// Patches Express 4 so errors thrown in async route handlers are forwarded
// to the centralized error middleware instead of hanging the request.
import "express-async-errors";
import "dotenv/config";
import path from "path";
import fs from "fs";
import { gzip } from "zlib";
import { promisify } from "util";
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
import { parseRevProduct, revTarget, type RevProduct } from "./server/revImport.js";
import { MAX_PURCHASE_URL, SUPPLIERS, cleanPurchaseUrl, detectSupplier, supplierById } from "./src/utils/suppliers.js";
import { dbGet, dbAll, dbRun, dbExec, dbBatch, dbBatchResults } from "./db.js";
import { runMigrations } from "./migrations/runner.js";
import {
  isEmailVerified,
  markEmailVerified,
  issueVerificationCode,
  getEmailHealth,
  isEmailConfigured,
  checkVerificationCode,
  consumeVerificationCode,
  notifyTaskAssignees,
  sendEmail,
  emailTemplate,
  escapeHtml,
  appUrl,
} from "./email-verify.js";
import {
  newInviteToken, hashInviteToken, looksLikeInviteToken, inviteHint, inviteState,
  parseInviteOptions, INVITE_STATE_MESSAGE, type InviteRow,
} from "./server/invites.js";
import {
  ONBOARDING_DDL,
  defaultOnboardingState,
  mergeOnboardingState,
  validateOnboardingPatch,
  normalizeOnboardingEmail,
  legacyOnboardingState,
  type OnboardingState,
} from "./server/onboarding.js";
import { safeGet, checkPublicUrl, UnsafeUrlError } from "./server/safeFetch.js";
import { RateLimiter, limit, clientIp, normEmail } from "./server/rateLimit.js";
import { DurableFtcCache, recordSourceOk, recordSourceFailure, sourceHealth } from "./server/ftcStore.js";
import { workspaceFactsBlock, resolveTimeZone, todayIn } from "./server/workspaceFacts.js";
import { buildIcs } from "./server/ics.js";
import { resourceKey } from "./src/utils/resourceUrl.js";
import { CHANGELOG, compareVersions, changelogEntryFrom, changelogDiscordText } from "./src/utils/changelog.js";
import { readEventRepeat, seriesDates, cleanReminder, reminderDueMs, eventStartMs, reminderText, type EventRepeat } from "./src/utils/eventSeries.js";
import { nextOccurrence, parseQuickAdd, readRecurrence, addDays } from "./src/utils/quickAdd.js";
import { normalizeBrunoTask } from "./src/utils/brunoTasks.js";
import { createLookupHold, extractLookupBlocks, followUpPrompt, runLookups } from "./server/brunoLookup.js";
import { sourcesFooter } from "./server/webSources.js";
import { extractRememberBlocks, isDuplicateFact, memoryPromptBlock, nudgeText, localHourAndDay, MAX_USER_MEMORIES, MAX_TEAM_MEMORIES, MAX_FACT_CHARS } from "./server/brunoMemory.js";
import { quoteUntrusted } from "./server/scoutingContext.js";
import { serveDist } from "./server/staticAssets.js";
import { currentWeather } from "./server/weather.js";
import { registerScoutingRoutes } from "./server/scouting.js";
import { registerNotebookFileRoutes } from "./server/notebookFiles.js";
import { NotebookStore, registerNotebookRoutes } from "./server/notebook.js";
import { buildArticleCsp, buildCsp, inlineScriptHashes, summarizeCspReport } from "./server/csp.js";
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
  NAVGPT_SYSTEM,
  ATTENDANCE_SYSTEM,
  COACH_SYSTEM,
  isQuotaError,
  QUOTA_EXHAUSTED_MSG,
} from "./ai.js";
import {
  aiChat,
  isGeminiConfigured,
  isAnthropicQuotaError,
  ANTHROPIC_QUOTA_EXHAUSTED_MSG,
} from "./ai-hybrid.js";
import {
  youtubeApi as youtubeApiImpl,
  pickYouTubeChannel as pickYouTubeChannelImpl,
  resolveYouTubeChannel as resolveYouTubeChannelImpl,
  fetchYouTubeStats as fetchYouTubeStatsImpl,
} from "./server/youtube.js";
import {
  CAD_DDL,
  CAD_SECTIONS,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  PART_SOURCES,
  PART_STATUSES,
  PART_SOURCE_LABELS,
  PART_STATUS_LABELS,
  normalizeSection,
  isValidReviewStatus,
  isValidPartSource,
  isValidPartStatus,
  detectModelType,
  isValidHttpUrl,
  canTransitionReviewStatus,
  sanitizePartInput,
} from "./server/cad.js";
import {
  registerVoiceRoutes,
  handleVoiceWSMessage,
  dedupeVoiceChannels,
  voiceMaintenance,
  scheduleVoiceDisconnectCleanup,
  cancelVoiceDisconnectCleanup,
  removeParticipantEverywhere,
} from "./server/voice.js";
import {
  isFirstEventsConfigured,
  getFirstEventsTeam,
  getFirstEventsTeamEvents,
  getFirstEventsEvent,
  getFirstEventsEventTeams,
  getFirstEventsRankings,
  getFirstEventsMatches,
  getFirstEventsSchedule,
  getFirstEventsAlliances,
  getFirstEventsAdvancement,
  FirstEventsError,
  matchKey,
} from "./server/ftcEvents.js";
import { PredictEngine, type Forecast, type Partners } from "./server/predict/engine.js";
import { PredictStore } from "./server/predict/store.js";
import { syncSeasons, dataAsOf } from "./server/predict/sync.js";
import { OfflinePackBuilder, buildPack, detectRegion, listRegions, type PackedEvent } from "./server/offline/pack.js";
import { passwordProblem } from "./src/utils/password.js";
import { isMessageModerator, messageActionAllowed } from "./server/messagePerms.js";
import { PredictMonitor, eventStillOpen, type LiveAccuracy } from "./server/predict/monitor.js";
import type { FirstAlliance, FirstMatch, FirstRanking } from "./server/ftcEvents.js";
import {
  SCOUT_SEASONS,
  SCOUT_SEARCH_QUERY,
  scoutEventQuery,
  scoutTeamEventsQuery,
  parseScoutEvent,
  parseScoutSearch,
  parseScoutTeamEvents,
  mergeEventFull,
  type FirstEventPieces,
  type ScoutEventParsed,
} from "./server/ftcScout.js";
import { mergeStampedDelete, mergeStampedPatch, type FieldStamps, type ShortlistPatch, type StoredShortlistEntry, type WriteOrigin } from "./src/utils/shortlist.js";
import { eventError, budgetEntryFrom, requiredTextError, communicationError, REQUIRED, formatMoney, isIsoDate, attendanceMarkError, latestTodayOnEarth, earliestTodayOnEarth } from "./src/utils/validation.js";
import { buildScoutingContextPack } from "./server/scoutingContext.js";
import { fileKey, r2FromEnv } from "./server/r2.js";
import { cite, citeTeam, eventUrl, siteOf, teamUrl } from "./server/sourceLinks.js";
import { DIGEST_WINDOW_MS, PingLimiter, digestText, parsePrefs, prefsPatch, type UpdateKind } from "./server/notifyPrefs.js";
import { formatScreenContext, parseScreenRequest, type ScreenLookups } from "./server/screenContext.js";
import type { FtcEventFull, FtcTeamEventStats, FtcTeamEventSummary, FtcTeamProfile, FtcTeamSearchHit, ShortlistEntry } from "./src/types/ftcScout.js";

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
/** Redesign interface modes (members.interface_mode / teams.default_interface_mode). */
const INTERFACE_MODES = ["legacy", "modern"];

/** A membership row without an interface mode takes the account's choice from
 *  its other rows (newest first) and keeps it. Called wherever a member row is
 *  handed to the client: /api/auth/me, workspace switch, join and create. */
async function inheritInterfaceMode(row: any): Promise<void> {
  if (!row || row.interface_mode != null || !row.email) return;
  const other = (await dbGet(
    "SELECT interface_mode FROM members WHERE email = ? AND id != ? AND interface_mode IS NOT NULL ORDER BY id DESC LIMIT 1",
    row.email, row.id,
  )) as any;
  if (!other?.interface_mode) return;
  // Only fill an empty value: a concurrent PATCH /api/profile may have saved a
  // newer choice in between. Then return whatever is actually stored.
  await dbRun("UPDATE members SET interface_mode = ? WHERE id = ? AND interface_mode IS NULL", other.interface_mode, row.id);
  const now = (await dbGet("SELECT interface_mode FROM members WHERE id = ?", row.id)) as any;
  row.interface_mode = now?.interface_mode ?? null;
}

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
// A member row ready to broadcast: sanitized + computed presence attached so
// clients' dots update live instead of going stale.
async function memberWithPresence(row: any): Promise<any> {
  const m = sanitizeMember(row);
  if (m && m.id != null) {
    m.presence = (await presenceMap([m.id]))[m.id] || "offline";
  }
  return m;
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

// Aggregate reactions for a batch of message ids.
// Returns { [messageId]: [{ emoji, count, reacted_by_me, member_ids }] }.
async function getMessageReactions(messageIds: number[], viewerMemberId: number): Promise<Record<number, any[]>> {
  const out: Record<number, any[]> = {};
  if (!messageIds.length) return out;
  const placeholders = messageIds.map(() => "?").join(",");
  const rows = (await dbAll(
    `SELECT message_id, emoji, member_id FROM message_reactions WHERE message_id IN (${placeholders})`,
    ...messageIds
  )) as any[];
  const byMsg: Record<number, Record<string, number[]>> = {};
  for (const r of rows) {
    (byMsg[r.message_id] ||= {})[r.emoji] ||= [];
    (byMsg[r.message_id] as any)[r.emoji].push(r.member_id);
  }
  // Resolve custom emoji image urls in one query.
  const customIds = [...new Set(rows.map((r) => String(r.emoji)).filter((e) => e.startsWith("custom:")).map((e) => e.slice(7)))];
  const customMap: Record<string, string> = {};
  if (customIds.length) {
    const ce = (await dbAll(
      `SELECT id, image_url FROM custom_emoji WHERE id IN (${customIds.map(() => "?").join(",")})`,
      ...customIds
    )) as any[];
    for (const c of ce) customMap[`custom:${c.id}`] = c.image_url;
  }
  for (const [mid, emojis] of Object.entries(byMsg)) {
    out[Number(mid)] = Object.entries(emojis).map(([emoji, memberIds]) => ({
      emoji,
      count: memberIds.length,
      reacted_by_me: memberIds.includes(viewerMemberId),
      member_ids: memberIds,
      ...(customMap[emoji] ? { image_url: customMap[emoji] } : {}),
    }));
  }
  return out;
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

  CREATE TABLE IF NOT EXISTS message_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE(message_id, member_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS custom_emoji (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    category TEXT DEFAULT 'Other',
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES members(id)
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
    -- YouTube rich channel details (populated on link + sync)
    country TEXT,
    published_at TEXT,
    description TEXT,
    custom_url TEXT,
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
    type TEXT DEFAULT 'email', -- 'email', 'announcement'
    parent_id INTEGER, -- NULL for thread roots; points at parent entry for replies
    direction TEXT DEFAULT 'outbound' -- 'outbound' (we sent) or 'inbound' (they replied)
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

  ${CAD_DDL}

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
// Bruno teaching mode: member prefers to be taught step-by-step instead of
// just receiving finished code. Surfaced as a toggle in Settings → Bruno AI.
if (!memberColumns.some((c: any) => c.name === 'bruno_teach_mode')) {
  (await dbExec("ALTER TABLE members ADD COLUMN bruno_teach_mode INTEGER DEFAULT 0"));
}
// Interface mode (2026 redesign): 'legacy' | 'modern' | NULL (= follow the team
// default). Saved per account: PATCH /api/profile writes every row with the email.
if (!memberColumns.some((c: any) => c.name === 'interface_mode')) {
  (await dbExec("ALTER TABLE members ADD COLUMN interface_mode TEXT"));
}
// Bruno output level: low | medium | high | max — caps reply length per member.
if (!memberColumns.some((c: any) => c.name === 'bruno_output_level')) {
  (await dbExec("ALTER TABLE members ADD COLUMN bruno_output_level TEXT DEFAULT 'medium'"));
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
  status TEXT DEFAULT 'ok',
  created_at TEXT DEFAULT (datetime('now'))
)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_ai_usage_member_day ON ai_usage(member_id, created_at)`));
// status: 'ok' | 'error' | 'quota' — failed attempts are logged too so the
// owner dashboard reflects real usage even during an upstream outage.
const aiUsageColumns = (await dbAll(`PRAGMA table_info(ai_usage)`)) as any[];
if (!aiUsageColumns.some((c: any) => c.name === 'status')) {
  (await dbExec("ALTER TABLE ai_usage ADD COLUMN status TEXT DEFAULT 'ok'"));
}
// provider: 'gemini' | 'anthropic' | 'unknown' — which backend served the request,
// so the owner can see the hybrid split in the AI dashboard.
if (!aiUsageColumns.some((c: any) => c.name === 'provider')) {
  (await dbExec("ALTER TABLE ai_usage ADD COLUMN provider TEXT DEFAULT 'gemini'"));
}
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
// Link a flag to the exact team-chat message that triggered it (NULL for Bruno-chat flags).
if (!(await hasColumn('ai_flags', 'message_id'))) {
  (await dbExec("ALTER TABLE ai_flags ADD COLUMN message_id INTEGER"));
}
// Chat image persistence: Render's filesystem is ephemeral, so uploaded
// images vanish on every restart/redeploy. A DB copy survives — served via
// /api/message-images/:id with the disk file as a fallback.
(await dbExec(`CREATE TABLE IF NOT EXISTS message_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_message_images_message ON message_images(message_id)`));
// Durable file store: Render's filesystem is ephemeral, so EVERY user upload
// (avatars, feedback attachments, task proof, custom emoji, CAD models) is
// persisted as a BLOB in the database. Served via /api/files/:id.
// message_images (chat images) predates this and stays as its legacy store.
(await dbExec(`CREATE TABLE IF NOT EXISTS stored_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  member_id INTEGER,
  kind TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT,
  size INTEGER,
  data BLOB NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_stored_files_team ON stored_files(team_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_stored_files_member ON stored_files(member_id)`));
// One-time rescue: import any user-uploaded files still sitting on ephemeral
// disk into stored_files and rewrite their DB URLs to /api/files/:id.
// Idempotent — a file already imported no longer has any /uploads/ references.
try {
  const rescueDir = path.join(process.cwd(), "uploads");
  if (fs.existsSync(rescueDir)) {
    const rescueCols: { table: string; col: string; kind: string; teamCol: string | null; memberCol: string | null }[] = [
      { table: "members", col: "avatar_url", kind: "avatar", teamCol: null, memberCol: "id" },
      { table: "feedback", col: "screenshot_url", kind: "feedback", teamCol: "team_id", memberCol: "user_id" },
      { table: "custom_emoji", col: "image_url", kind: "emoji", teamCol: "team_id", memberCol: "member_id" },
      { table: "cad_snapshots", col: "file_url", kind: "cad", teamCol: "team_id", memberCol: "created_by" },
      { table: "cad_snapshots", col: "screenshot_url", kind: "cad", teamCol: "team_id", memberCol: "created_by" },
      { table: "cad_reviews", col: "screenshot_url", kind: "cad", teamCol: "team_id", memberCol: "created_by" },
      { table: "messages", col: "file_path", kind: "chat", teamCol: "team_id", memberCol: "sender_id" },
    ];
    for (const f of fs.readdirSync(rescueDir)) {
      const diskPath = path.join(rescueDir, f);
      let stat: any = null;
      try { stat = fs.statSync(diskPath); } catch { continue; }
      if (!stat.isFile()) continue;
      const url = `/uploads/${f}`;
      const bytes = fs.readFileSync(diskPath);
      let rewrote = 0;
      for (const c of rescueCols) {
        let rows: any[] = [];
        try {
          rows = await dbAll(
            `SELECT id, ${c.col} AS u, ${c.teamCol ?? "NULL"} AS t, ${c.memberCol ?? "NULL"} AS m FROM ${c.table} WHERE ${c.col} = ?`, url
          ) as any[];
        } catch { continue; }
        for (const row of rows) {
          try {
            const info = await dbRun(
              `INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              row.t ?? null, row.m ?? null, c.kind, f, null, bytes.length, bytes
            );
            await dbRun(`UPDATE ${c.table} SET ${c.col} = ? WHERE id = ?`, `/api/files/${info.lastInsertRowid}`, row.id);
            rewrote++;
          } catch (e) { console.error(`[rescue] ${c.table}.${c.col} id ${row.id}:`, (e as any)?.message || e); }
        }
      }
      // tasks.completion_images is a JSON array of URLs.
      try {
        const tasks = await dbAll(`SELECT id, completion_images FROM tasks WHERE completion_images LIKE ?`, `%${url}%`) as any[];
        for (const t of tasks) {
          try {
            const arr = JSON.parse(t.completion_images || "[]");
            if (!Array.isArray(arr) || !arr.includes(url)) continue;
            const info = await dbRun(
              `INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              null, null, "proof", f, null, bytes.length, bytes
            );
            const next = arr.map((u: string) => (u === url ? `/api/files/${info.lastInsertRowid}` : u));
            await dbRun(`UPDATE tasks SET completion_images = ? WHERE id = ?`, JSON.stringify(next), t.id);
            rewrote++;
          } catch (e) { console.error(`[rescue] tasks.completion_images id ${t.id}:`, (e as any)?.message || e); }
        }
      } catch { /* table may not exist yet */ }
      // Remove the disk copy only when we imported it AND no /uploads/
      // references remain. Never delete files we didn't import (e.g.
      // repo-committed fixtures) — orphaned disk files are harmless.
      if (rewrote === 0) continue;
      try {
        let refs = 0;
        for (const c of rescueCols) {
          try {
            const r = await dbGet(`SELECT COUNT(*) AS n FROM ${c.table} WHERE ${c.col} = ?`, url) as any;
            refs += r?.n || 0;
          } catch { /* ignore */ }
        }
        const rt = await dbAll(`SELECT id, completion_images FROM tasks WHERE completion_images LIKE ?`, `%${url}%`).catch(() => []) as any[];
        refs += rt.length;
        if (refs === 0) fs.unlinkSync(diskPath);
      } catch { /* best effort */ }
    }
  }
} catch (e) { console.error("[rescue] upload rescue failed:", (e as any)?.message || e); }
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
// Added 2026-10-01 after EXPLAIN QUERY PLAN showed full table scans on the
// dashboard's hot queries (tasks/events/budget per team, channel messages).
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_tasks_team_status_due ON tasks(team_id, status, due_date)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_events_team_date ON events(team_id, date, start_time)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_budget_team ON budget(team_id)`));
// Reactions, custom emoji, resources (2026-10-02).
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_reactions_member ON message_reactions(member_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_custom_emoji_member ON custom_emoji(member_id, team_id)`));
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_resources_team ON resources(team_id, created_at)`));

const taskColumns = (await dbAll("PRAGMA table_info(tasks)"));
if (!taskColumns.some((c: any) => c.name === 'is_board')) {
  (await dbExec("ALTER TABLE tasks ADD COLUMN is_board INTEGER DEFAULT 0"));
}
// Task completion proof: who marked it done, their notes, screenshot paths (JSON).
if (!taskColumns.some((c: any) => c.name === 'completion_notes')) {
  (await dbExec("ALTER TABLE tasks ADD COLUMN completion_notes TEXT"));
}
if (!taskColumns.some((c: any) => c.name === 'completed_by')) {
  (await dbExec("ALTER TABLE tasks ADD COLUMN completed_by INTEGER"));
}
if (!taskColumns.some((c: any) => c.name === 'completion_images')) {
  (await dbExec("ALTER TABLE tasks ADD COLUMN completion_images TEXT"));
}
// Notifications: optional JSON metadata (e.g. mention → channel_id/message_id)
// so clients can deep-link and clear per-channel.
const notificationColumns = (await dbAll("PRAGMA table_info(notifications)"));
if (!notificationColumns.some((c: any) => c.name === 'meta')) {
  (await dbExec("ALTER TABLE notifications ADD COLUMN meta TEXT"));
}
// Communications: threading — replies link to a parent entry, direction marks who sent it.
const commColumns = (await dbAll("PRAGMA table_info(communications)"));
if (!commColumns.some((c: any) => c.name === 'parent_id')) {
  (await dbExec("ALTER TABLE communications ADD COLUMN parent_id INTEGER"));
}
if (!commColumns.some((c: any) => c.name === 'direction')) {
  (await dbExec("ALTER TABLE communications ADD COLUMN direction TEXT DEFAULT 'outbound'"));
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
// Index for the hot channel-messages query (team + channel + time order).
// Created here — after the channel_id migration above — not with the other
// indexes, because the column may not exist yet on older databases.
(await dbExec(`CREATE INDEX IF NOT EXISTS idx_messages_channel_ts ON messages(team_id, channel_id, timestamp)`));
// YouTube rich channel details on social_profiles (link + sync populate them)
const socialProfileColumns = (await dbAll("PRAGMA table_info(social_profiles)"));
for (const [col, type] of [
  // Core linking columns (absent on DBs created before the social feature matured)
  ['external_id', 'TEXT'],
  ['avatar_url', 'TEXT'],
  ['access_token', 'TEXT'],
  ['refresh_token', 'TEXT'],
  ['token_expires_at', 'INTEGER'],
  ['token_status', "TEXT DEFAULT 'ok'"],
  ['last_synced_at', 'INTEGER'],
  // Rich YouTube channel details
  ['country', 'TEXT'],
  ['published_at', 'TEXT'],
  ['description', 'TEXT'],
  ['custom_url', 'TEXT'],
] as const) {
  if (!socialProfileColumns.some((c: any) => c.name === col)) {
    (await dbExec(`ALTER TABLE social_profiles ADD COLUMN ${col} ${type}`));
  }
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

// One-time cleanup: the team-join endpoint used to grant every new student the
// legacy 'attendance' scope by default, which the client treats as attendance
// admin (full grid, start sessions). Members get no default scopes — strip the
// default grant from students whose scopes are exactly that default shape.
// Idempotent: only touches rows still carrying the untouched default.
try {
  const rows = (await dbAll(
    "SELECT id, scopes FROM members WHERE account_type = 'student' AND COALESCE(is_active, 1) = 1 AND scopes IS NOT NULL AND scopes != '' AND scopes != '[]'"
  )) as any[];
  let cleaned = 0;
  for (const r of rows) {
    let s: any = r.scopes;
    try {
      while (typeof s === 'string') {
        const p = JSON.parse(s);
        if (typeof p === 'string') s = p; else { s = p; break; }
      }
    } catch { continue; }
    if (Array.isArray(s) && s.length === 1 && s[0] === 'attendance') {
      await dbRun("UPDATE members SET scopes = ? WHERE id = ?", JSON.stringify([]), r.id);
      cleaned++;
    }
  }
  if (cleaned) console.log(`[DB Migration] cleared default 'attendance' scope from ${cleaned} student member(s)`);
} catch (e) {
  console.error('[DB Migration] default-scope cleanup failed:', e);
}

// Default Member role now includes calendar, communications, tasks and
// outreach access. Upgrade existing system "Member" roles that still carry
// the untouched old default (exactly ["view_ai"]) — roles Sushil customized
// are left alone. Idempotent.
try {
  const newDefault = JSON.stringify(["view_ai", "manage_calendar", "manage_communications", "manage_tasks", "manage_outreach"]);
  const oldDefault = JSON.stringify(["view_ai"]);
  const roles = (await dbAll(
    "SELECT id, permissions FROM roles WHERE name = 'Member' AND is_system = 1"
  )) as any[];
  let upgraded = 0;
  for (const r of roles) {
    let perms: any = r.permissions;
    try {
      perms = typeof perms === 'string' ? JSON.parse(perms) : perms;
    } catch { continue; }
    if (Array.isArray(perms) && JSON.stringify(perms) === oldDefault) {
      await dbRun("UPDATE roles SET permissions = ? WHERE id = ?", newDefault, r.id);
      upgraded++;
    }
  }
  if (upgraded) console.log(`[DB Migration] upgraded default Member role permissions on ${upgraded} team(s)`);
} catch (e) {
  console.error('[DB Migration] member-role permission upgrade failed:', e);
}

// Repair social_profiles with unrecognized platform values (shows "Unknown
// platform" on sync and renders with the wrong branding). Normalizes
// case/whitespace variants; profiles carrying a YouTube channel ID
// (UC…) are restored to 'youtube'. Idempotent.
try {
  const bad = (await dbAll(
    "SELECT id, platform, external_id FROM social_profiles WHERE platform IS NULL OR TRIM(LOWER(platform)) NOT IN ('youtube', 'tiktok')"
  )) as any[];
  let fixed = 0;
  for (const p of bad) {
    const norm = String(p.platform || '').trim().toLowerCase();
    let target: string | null = null;
    if (norm === 'youtube' || norm === 'tiktok') target = norm;
    else if (p.external_id && /^UC[A-Za-z0-9_-]{20,}$/.test(String(p.external_id))) target = 'youtube';
    if (target) {
      await dbRun("UPDATE social_profiles SET platform = ? WHERE id = ?", target, p.id);
      fixed++;
    } else {
      console.log(`[DB Migration] social_profiles id=${p.id} has unrecognized platform '${p.platform}' (external_id=${p.external_id || 'none'}) — left for manual review`);
    }
  }
  if (fixed) console.log(`[DB Migration] repaired platform on ${fixed} social profile(s)`);
} catch (e) {
  console.error('[DB Migration] social platform repair failed:', e);
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

// Workspace default for the interface mode (admins set it; users can override).
if (!(await hasColumn('teams', 'default_interface_mode'))) {
  (await dbExec("ALTER TABLE teams ADD COLUMN default_interface_mode TEXT"));
}
if (!(await hasColumn('teams', 'access_code'))) {
  (await dbExec("ALTER TABLE teams ADD COLUMN access_code TEXT"));
}
(await dbExec("CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_access_code ON teams(access_code)"));

// Secret chatbot persona (NavGPT ❤️): per-team toggle, default OFF. Only has any
// effect for the qualifying team (name contains "hypnotic" or "4215").
// They can turn it on from Settings whenever they want.
if (!(await hasColumn('teams', 'navgpt_enabled'))) {
  (await dbExec("ALTER TABLE teams ADD COLUMN navgpt_enabled INTEGER NOT NULL DEFAULT 0"));
}
// One-time backfill (guarded by marker column, so an explicit Settings choice
// is never overridden on later boots): existing qualifying teams were created
// when the default was ON.
if (!(await hasColumn('teams', 'navgpt_backfill_v1'))) {
  await dbExec("ALTER TABLE teams ADD COLUMN navgpt_backfill_v1 INTEGER NOT NULL DEFAULT 0");
  await dbRun(
    "UPDATE teams SET navgpt_enabled = 0 WHERE (name LIKE '%hypnotic%' OR name LIKE '%4215%') AND navgpt_enabled <> 0"
  );
  await dbRun("UPDATE teams SET navgpt_backfill_v1 = 1");
}

// Feedback screenshots: optional image attached to a feedback entry.
if (!(await hasColumn('feedback', 'screenshot_url'))) {
  (await dbExec("ALTER TABLE feedback ADD COLUMN screenshot_url TEXT"));
}
// Feedback attachments: original filename + mime for images/videos/files
if (!(await hasColumn('feedback', 'attachment_name'))) {
  (await dbExec("ALTER TABLE feedback ADD COLUMN attachment_name TEXT"));
}
if (!(await hasColumn('feedback', 'attachment_type'))) {
  (await dbExec("ALTER TABLE feedback ADD COLUMN attachment_type TEXT"));
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
  return !!t && navGptQualifies(t.name) && (t.navgpt_enabled ?? 0) === 1;
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
  const info = (await dbRun("INSERT INTO teams (name, number, access_code, navgpt_enabled) VALUES (?, ?, ?, 0)", "My Team", "", code)) as any;
  defaultTeam = { id: info.lastInsertRowid };
}
if (defaultTeam) {
  for (const t of teamTables) {
    (await dbRun(`UPDATE ${t} SET team_id = ? WHERE team_id IS NULL`, defaultTeam.id));
  }
  // Only active team-less rows (legacy data) get a home. Inactive "ghost"
  // anchors left by workspace deletion stay team-less by design, and a row is
  // never moved into a team where that email already has a membership (that
  // violated UNIQUE(team_id, email) and crash-looped the server at boot).
  (await dbRun(
    "UPDATE members SET team_id = ? WHERE team_id IS NULL AND COALESCE(is_active, 1) = 1 AND NOT EXISTS (SELECT 1 FROM members m2 WHERE m2.team_id = ? AND m2.email = members.email)",
    defaultTeam.id, defaultTeam.id,
  ));
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



// ---- Session Management ----
// A session token lives only in the HttpOnly `cp_session` cookie (never in a
// URL, a JSON body the page can read, or localStorage). The database stores
// a SHA-256 of the token, so a leaked sessions table can't be replayed.
// Sessions slide: each use (at most every few minutes) pushes expiry out to
// SESSION_TTL_MS; an idle session expires.
const SESSION_COOKIE = "cp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Must stay under the 3-minute "online" window in computePresence(), which
// reads sessions.last_activity.
const SESSION_TOUCH_MS = 60 * 1000;
const TOKEN_PREFIX = "cps_";

function generateSessionToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
}
/** DB key for a token: hashed for current tokens; legacy (pre-cookie,
 *  plaintext-stored) tokens are looked up as-is until they are rotated. */
function sessionKey(token: string): string {
  return token.startsWith(TOKEN_PREFIX)
    ? "h:" + crypto.createHash("sha256").update(token).digest("hex")
    : token;
}

async function createSession(memberId: number): Promise<string> {
  const token = generateSessionToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  (await dbRun("INSERT INTO sessions (id, member_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)", sessionKey(token), memberId, now, expiresAt, now));
  return token;
}

/**
 * The signed-in user moved to another of their memberships (team switch, new
 * or joined team, left/deleted the current one): point this device's
 * existing session at the new membership. The token — and so the cookie —
 * stays the same, so no in-flight response can roll the switch back.
 */
async function rebindSession(req: any, memberId: number): Promise<string> {
  const token = getSessionId(req);
  if (token && token.startsWith(TOKEN_PREFIX)) {
    const info = (await dbRun("UPDATE sessions SET member_id = ?, last_activity = ? WHERE id = ?", memberId, new Date().toISOString(), sessionKey(token))) as any;
    if (Number(info?.changes) > 0) return token;
  }
  return createSession(memberId);
}

/** createSession, but only while `memberId` still belongs to `email` and the
 *  account still has `passwordHash` — checked in the INSERT itself. */
async function createSessionIfCredential(memberId: number, email: string, passwordHash: string): Promise<string | null> {
  const sessionId = generateSessionToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const info = (await dbRun(
    `INSERT INTO sessions (id, member_id, created_at, expires_at, last_activity)
     SELECT ?, ?, ?, ?, ?
     WHERE EXISTS (SELECT 1 FROM members WHERE id = ? AND LOWER(email) = LOWER(?) AND COALESCE(is_active, 1) = 1)
       AND EXISTS (SELECT 1 FROM members WHERE LOWER(email) = LOWER(?) AND password = ?)`,
    sessionKey(sessionId), memberId, now, expiresAt, now, memberId, email, email, passwordHash
  )) as any;
  return Number(info?.changes) > 0 ? sessionId : null;
}

async function validateSession(token: string): Promise<{ valid: boolean; memberId?: number; legacy?: boolean; touched?: boolean }> {
  try {
    if (!token || typeof token !== "string" || token.startsWith("h:")) return { valid: false };
    const key = sessionKey(token);
    const session = (await dbGet("SELECT * FROM sessions WHERE id = ?", key)) as any;
    if (!session) return { valid: false };

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    if (now > session.expires_at) {
      (await dbRun("DELETE FROM sessions WHERE id = ?", key));
      return { valid: false };
    }
    const legacy = !token.startsWith(TOKEN_PREFIX);
    // Sliding expiry, written at most every SESSION_TOUCH_MS (not per request).
    const last = Date.parse(session.last_activity || "") || 0;
    let touched = false;
    if (!legacy && nowMs - last > SESSION_TOUCH_MS) {
      (await dbRun("UPDATE sessions SET last_activity = ?, expires_at = ? WHERE id = ?", now, new Date(nowMs + SESSION_TTL_MS).toISOString(), key));
      touched = true;
    }
    return { valid: true, memberId: session.member_id, legacy, touched };
  } catch (e) {
    return { valid: false };
  }
}

// The cookie outlives any session (browsers cap it at 400 days); the
// server-side sliding expiry is what actually ends a session. So the cookie
// never needs re-issuing on activity — and a slow, older response can never
// overwrite a newer cookie with a stale value.
const SESSION_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
/** Set-Cookie value for a session token (or a clearing value for null). */
function sessionCookie(token: string | null, secure: boolean): string {
  const attrs = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  return token
    ? `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${attrs}; Max-Age=${SESSION_COOKIE_MAX_AGE_S}`
    : `${SESSION_COOKIE}=; ${attrs}; Max-Age=0`;
}
function requestIsHttps(req: any): boolean {
  return !!req.secure || String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

// Retired: the old /api/files/-scoped cookie (the session cookie now covers
// every path). Cleared on sight.
const FILES_COOKIE = "cp_files_sid";
// Stored-file MIME types rendered inline (video/audio are allowed by prefix).
// SVG is included: it can't run script inside <img>, and opened directly the
// route's `sandbox` CSP blocks its scripts. HTML is never inline — see the
// /api/files/:id route.
const INLINE_SAFE_MIME = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon",
  "image/svg+xml",
]);
function readCookie(req: any, name: string): string | null {
  const raw = String(req.headers?.cookie || "");
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()) || null; } catch { return null; }
    }
  }
  return null;
}
// The caller's session token: the HttpOnly cookie only. (A legacy header
// token from a tab opened before the cookie switch is rotated into the
// cookie by the /api middleware, which stores the result on the request.)
// Never from a query string or body — URLs end up in logs and history.
function getSessionId(req: any): string | null {
  return (req.cpSessionToken as string | undefined) || readCookie(req, SESSION_COOKIE) || null;
}

/**
 * Validate screenshot payloads for Bruno chat. Returns clean
 * { mimeType, data } pairs (base64, no data: prefix), capped at 5 images and
 * ~4MB each so the request stays under the JSON body limit. Anything
 * malformed is dropped rather than failing the whole message.
 */
function sanitizeBrunoImages(input: any): { mimeType: string; data: string }[] {
  if (!Array.isArray(input)) return [];
  const out: { mimeType: string; data: string }[] = [];
  for (const im of input.slice(0, 5)) {
    try {
      const mimeType = String(im?.mimeType || "");
      let data = String(im?.data || "").replace(/^data:image\/\w+;base64,/, "");
      if (!mimeType.startsWith("image/")) continue;
      if (!/^[A-Za-z0-9+/=]+$/.test(data)) continue;
      if (data.length > 4 * 1024 * 1024) continue;
      if (data.length < 100) continue;
      out.push({ mimeType: mimeType.slice(0, 64), data });
    } catch { /* skip malformed entries */ }
  }
  return out;
}

/**
 * Sanitize attached PDFs for Bruno: { mimeType, data, name } tuples, capped at
 * 5 PDFs and ~14MB base64 each. Only application/pdf is accepted.
 */
function sanitizeBrunoPdfs(input: any): { mimeType: string; data: string; name: string }[] {
  if (!Array.isArray(input)) return [];
  const out: { mimeType: string; data: string; name: string }[] = [];
  for (const p of input.slice(0, 5)) {
    try {
      const mimeType = String(p?.mimeType || "");
      let data = String(p?.data || "").replace(/^data:application\/pdf;base64,/, "");
      if (mimeType !== "application/pdf") continue;
      if (!/^[A-Za-z0-9+/=]+$/.test(data)) continue;
      if (data.length > 14 * 1024 * 1024) continue;
      if (data.length < 100) continue;
      out.push({ mimeType: "application/pdf", data, name: String(p?.name || "document.pdf").slice(0, 128) });
    } catch { /* skip malformed entries */ }
  }
  return out;
}
async function getAuth(req: any): Promise<{ memberId: number; teamId: number | null; accountType: string; email?: string; teamless?: boolean } | null> {
  const sessionId = getSessionId(req);
  if (!sessionId) return null;
  // The /api middleware already validated this token for the request.
  const pre = req.cpSessionCheck;
  const { valid, memberId } = pre && pre.token === sessionId ? pre : await validateSession(sessionId);
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
  // Case-insensitive: an account is one email however it was typed. An exact
  // match let a different-case copy of an email open a second "account".
  return (await dbAll("SELECT * FROM members WHERE LOWER(email) = LOWER(?) ORDER BY id DESC", String(email || "").trim())) as any[];
}
async function activeMemberRows(email: string): Promise<any[]> {
  return (await dbAll("SELECT * FROM members WHERE LOWER(email) = LOWER(?) AND COALESCE(is_active, 1) = 1 ORDER BY id DESC", String(email || "").trim())) as any[];
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
    (t as any).can_invite = (t as any).can_manage || perms.has("invite_members");
    // The access code is never sent with the list (audit M-2): people who
    // manage the workspace reveal it on demand, and each reveal is logged.
    // Everyone else joins by invite link.
    delete (t as any).access_code;
  }
  return teams;
}

/** A team row for a client response: no access code unless they manage it. */
async function teamForClient(team: any, email: string, opts: { reveal?: boolean } = {}): Promise<any> {
  if (!team) return team;
  const out = { ...team };
  // Only the one-time reveal right after creating a workspace carries the
  // code; otherwise managers reveal it on demand (logged).
  if (!opts.reveal || !(await hasPermInTeam(email, Number(team.id), "manage_members"))) delete out.access_code;
  return out;
}

// Adds an account (by email) to a team as a Member, or reactivates a
// membership they left / were removed from. Identity (name, password hash,
// linked providers) is copied from the account's newest row, unless this is
// a brand-new account (`fresh`).
async function addMembership(email: string, team: any, fresh?: { name: string; passwordHash: string | null }) {
  const existing = (await dbGet("SELECT * FROM members WHERE email = ? AND team_id = ?", email, team.id)) as any;
  if (existing && (existing.is_active ?? 1) === 1) return { row: existing, joined: false };
  let row: any;
  if (existing) {
    await dbRun("UPDATE members SET is_active = 1 WHERE id = ?", existing.id);
    row = await dbGet("SELECT * FROM members WHERE id = ?", existing.id);
  } else {
    // NOTE: members get NO default scopes — permissions come from roles
    // (the "Member" system role) or explicit admin grants.
    const src = fresh ? null : ((await dbGet("SELECT * FROM members WHERE email = ? ORDER BY id DESC LIMIT 1", email)) as any);
    const info = (await dbRun(
      "INSERT INTO members (team_id, name, role, email, password, avatar_url, is_setup, account_type, scopes, google_id, discord_id, github_id) VALUES (?, ?, ?, ?, ?, ?, 1, 'student', ?, ?, ?, ?)",
      team.id, fresh?.name || src?.name || email.split("@")[0], "Member", email, fresh ? fresh.passwordHash : (src?.password || null), src?.avatar_url || null,
      JSON.stringify([]), src?.google_id || null, src?.discord_id || null, src?.github_id || null
    )) as any;
    row = await dbGet("SELECT * FROM members WHERE id = ?", info.lastInsertRowid);
  }
  // Removal strips roles, so a returning member gets the Member role back too.
  await assignSystemRole(team.id, row.id, "Member");
  return { row, joined: true };
}

/** Looks up an invite by its link token (no state checks). */
async function inviteByToken(token: unknown): Promise<(InviteRow & { team_name: string; team_number: string | null; ftc_team_number: string | null }) | null> {
  if (!looksLikeInviteToken(token)) return null;
  return ((await dbGet(
    `SELECT i.*, t.name AS team_name, t.number AS team_number, t.ftc_team_number
       FROM team_invites i JOIN teams t ON t.id = i.team_id WHERE i.token_hash = ?`,
    hashInviteToken(token)
  )) as any) || null;
}

/**
 * One workspace per FTC team number. Returns the workspace that already
 * holds `ftcNumber` (the oldest, if pre-existing duplicates exist), other
 * than `exceptTeamId`.
 */
async function ftcWorkspace(ftcNumber: number | null | undefined, exceptTeamId?: number | null): Promise<any | null> {
  if (!ftcNumber || !Number.isInteger(Number(ftcNumber))) return null;
  return ((await dbGet(
    "SELECT * FROM teams WHERE ftc_team_number = ? AND id != ? ORDER BY id LIMIT 1",
    Number(ftcNumber), exceptTeamId ?? -1
  )) as any) || null;
}

/**
 * Inserts a team, claiming its FTC number atomically: the existence check
 * and the insert are one statement, so two simultaneous claims can't both
 * win. Returns the new id, or null if another workspace holds the number.
 */
async function insertTeamClaimingFtc(cols: Record<string, any>): Promise<number | null> {
  const keys = Object.keys(cols);
  const vals = keys.map((k) => cols[k]);
  const ftc = cols.ftc_team_number;
  const r = (ftc == null
    ? await dbRun(`INSERT INTO teams (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, ...vals)
    : await dbRun(
      `INSERT INTO teams (${keys.join(", ")}) SELECT ${keys.map(() => "?").join(", ")}
        WHERE NOT EXISTS (SELECT 1 FROM teams WHERE ftc_team_number = ?)`,
      ...vals, ftc
    )) as any;
  if (!Number(r?.changes ?? r?.rowsAffected ?? 0)) return null;
  return Number(r.lastInsertRowid);
}

/** The 409 body when someone tries to create or claim a taken FTC number. */
function ftcTakenBody(ftcNumber: number) {
  return {
    error: `Team #${ftcNumber} already has a workspace on Control Point. Ask to join it instead.`,
    ftcTaken: { number: ftcNumber },
  };
}

/** Counts a use, refusing a revoked, expired or used-up link (atomic). */
async function consumeInvite(inv: InviteRow): Promise<boolean> {
  const r = (await dbRun(
    `UPDATE team_invites SET uses = uses + 1
      WHERE id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) AND (max_uses IS NULL OR uses < max_uses)`,
    inv.id, new Date().toISOString()
  )) as any;
  return Number(r?.changes ?? r?.rowsAffected ?? 0) > 0;
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

/** Message moderation (edit / delete others' / silent delete): manage_members. */
async function canModerateMessages(memberId: number | null | undefined, teamId: number | null | undefined): Promise<boolean> {
  if (!memberId || !teamId) return false;
  return isMessageModerator(await getMemberPerms(memberId, teamId));
}

async function requireAdmin(req: any, res: any) {
  return requirePerm(req, res, "manage_members");
}

// ---- Discord-like roles ----
const ROLE_PERMISSIONS = [
  { key: "manage_members", label: "Manage members" },
  { key: "invite_members", label: "Invite people" },
  { key: "manage_roles", label: "Manage roles" },
  { key: "manage_budget", label: "Manage budget" },
  { key: "manage_inventory", label: "Manage inventory" },
  { key: "manage_code", label: "Manage code" },
  { key: "manage_calendar", label: "Manage calendar" },
  { key: "manage_attendance", label: "Manage attendance" },
  { key: "manage_tasks", label: "Manage tasks" },
  { key: "manage_outreach", label: "Manage outreach" },
  { key: "manage_documentation", label: "Manage documentation" },
  { key: "edit_notebook", label: "Edit notebook pages" },
  { key: "organize_notebook", label: "Organize notebooks" },
  { key: "delete_notebook", label: "Delete notebook items" },
  { key: "manage_communications", label: "Manage communications" },
  { key: "manage_voice", label: "Manage voice channels" },
  { key: "moderate_calls", label: "Moderate calls" },
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
// Ensures all three default roles exist (Admin, Member, Verified Member) —
// creates any that are missing, so existing teams get new defaults too.
/**
 * A membership counts on the roster once its email is verified (V3-M3).
 * Email+password signups are pending until they enter the code; accounts
 * without a password (OAuth, or added by an admin) and everyone from before
 * verification existed (grandfathered by migration 001) are unaffected.
 * Use with the members table aliased as `m`.
 */
const VERIFIED_MEMBER_SQL = "(COALESCE(m.password, '') = '' OR EXISTS (SELECT 1 FROM verified_emails ve WHERE LOWER(ve.email) = LOWER(m.email)))";

/**
 * Send a signup/login verification code. Never throws: the caller still
 * answers "check your inbox", but says whether the email actually left so
 * the screen can say so instead of leaving someone waiting for nothing.
 * A cooldown hit means a code went out under a minute ago, which counts as sent.
 * With no email provider configured the answer is "not sent".
 */
async function sendSignupCode(email: string): Promise<boolean> {
  try {
    await issueVerificationCode(email);
    // Without a provider the code is only logged (dev/test): nothing reached
    // an inbox, so say so rather than start a cooldown for a missing email.
    return isEmailConfigured();
  } catch (e) {
    console.error("verify code issue failed:", e);
    return false;
  }
}

async function ensureRolesSeeded(teamId: number | null | undefined) {
  // A member with no team (e.g. their workspace was deleted) has nothing to
  // seed; inserting would violate roles.team_id NOT NULL and 500 the request.
  if (!teamId) return;
  const existing = (await dbAll("SELECT name FROM roles WHERE team_id = ?", teamId)) as any[];
  const names = new Set(existing.map((r: any) => r.name));

  let adminRoleId: number | null = null;
  let memberRoleId: number | null = null;

  if (!names.has("Admin")) {
    const adminRole = (await dbRun(
      "INSERT INTO roles (team_id, name, color, permissions, position, is_system) VALUES (?,?,?,?,?,1)",
      teamId, "Admin", "#FFC700", JSON.stringify(["*"]), 0
    )) as any;
    adminRoleId = Number(adminRole.lastInsertRowid);
  }
  if (!names.has("Member")) {
    const memberRole = (await dbRun(
      "INSERT INTO roles (team_id, name, color, permissions, position, is_system) VALUES (?,?,?,?,?,1)",
      teamId, "Member", "#71717A", JSON.stringify(["view_ai", "manage_calendar", "manage_communications", "manage_tasks", "manage_outreach", "edit_notebook", "organize_notebook"]), 1
    )) as any;
    memberRoleId = Number(memberRole.lastInsertRowid);
  }
  if (!names.has("Verified Member")) {
    await dbRun(
      "INSERT INTO roles (team_id, name, color, permissions, position, is_system) VALUES (?,?,?,?,?,1)",
      teamId, "Verified Member", "#22C55E", JSON.stringify(["view_ai", "manage_inventory", "manage_calendar", "manage_tasks", "manage_documentation", "manage_communications", "manage_outreach", "manage_attendance", "manage_code", "manage_budget", "edit_notebook", "organize_notebook"]), 2
    );
  }

  // Backfill role assignments for members (only when we just created the roles).
  if (adminRoleId || memberRoleId) {
    const adminId = adminRoleId || (await systemRoleId(teamId, "Admin"));
    const memberId = memberRoleId || (await systemRoleId(teamId, "Member"));
    const members = (await dbAll(
      "SELECT id, account_type FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", teamId
    )) as any[];
    for (const m of members) {
      const roleId = m.account_type === "admin" ? adminId : memberId;
      if (roleId) {
        await dbRun("INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?,?)", m.id, roleId);
      }
    }
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
  // Versioned migrations run after the inline baseline DDL above.
  await runMigrations();
  // Migration 011 lowercases emails but never merges case-only duplicates
  // inside one workspace — surface any left for manual review.
  try {
    const mixed = (await dbAll("SELECT id, team_id, email FROM members WHERE email != LOWER(TRIM(email))")) as any[];
    if (mixed.length) console.warn(`[email-case] ${mixed.length} member row(s) still have mixed-case emails (case-only duplicates in one workspace) — review by hand: ids ${mixed.map((m) => m.id).join(", ")}`);
  } catch (e) { console.error("email-case check failed:", e); }
  const app = express();
  // nginx on the same host proxies every request: trust its X-Forwarded-For
  // so req.ip is the real client (rate limits key on it).
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");
  // Baseline security headers on every response. The Content-Security-Policy
  // is sent with the HTML page (see serveDist below), report-only for now.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // Camera (QR check-in, video calls), microphone and screen share are used
    // by the app itself; nothing else is.
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    next();
  });

  // CSP violation reports from browsers. Registered before the /api session
  // and CSRF guard: browsers send these without our client header, and they
  // change nothing. Stored (origin only, rate-limited) in client_errors so
  // the owner's Errors tab shows what the policy would block.
  const cspLimiter = new RateLimiter();
  setInterval(() => cspLimiter.sweep(), 10 * 60 * 1000).unref();
  // client_errors (crashes + CSP reports) keeps only the newest 5,000 rows:
  // trimmed now and then on insert, and hourly whatever arrives.
  const pruneClientErrors = () =>
    dbRun("DELETE FROM client_errors WHERE id <= (SELECT id FROM client_errors ORDER BY id DESC LIMIT 1 OFFSET 5000)").catch(() => {});
  setInterval(() => void pruneClientErrors(), 60 * 60 * 1000).unref();
  app.post(
    "/api/csp-report",
    express.json({ type: ["application/csp-report", "application/reports+json", "application/json"], limit: "16kb" }),
    async (req, res) => {
      res.status(204).end();
      if (cspLimiter.hit(clientIp(req), { max: 20, windowMs: 10 * 60 * 1000 }) > 0) return;
      const s = summarizeCspReport(req.body);
      if (!s) return;
      try {
        await dbRun(
          "INSERT INTO client_errors (kind, message, route, user_agent) VALUES ('csp', ?, ?, ?)",
          s.message, s.route, String(req.headers["user-agent"] || "").slice(0, 300),
        );
        if (Math.random() < 0.05) await pruneClientErrors();
      } catch { /* best effort */ }
    },
  );
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // A notebook save can contain 2 MB of text plus 4 MB of canvas JSON.
  // Keep the larger reader scoped to notebook routes; other APIs retain 5 MiB.
  app.use("/api/notebook", express.json({ limit: "7mb" }));
  app.use(express.json({ limit: "5mb" })); // bound JSON bodies (AI payloads, code saves) — uploads go through multer's own limits

  // ---- Auth rate limits (registered before the routes they guard) ----
  const authLimiter = new RateLimiter();
  setInterval(() => authLimiter.sweep(), 10 * 60 * 1000).unref();
  const MIN = 60 * 1000;
  const byIp = (max: number, windowMs: number) => ({ rule: { max, windowMs }, key: (req: any) => clientIp(req) });
  const byEmail = (max: number, windowMs: number) => ({ rule: { max, windowMs }, key: (req: any) => normEmail(req.body?.email) || null });
  const byIpEmail = (max: number, windowMs: number) => ({ rule: { max, windowMs }, key: (req: any) => { const e = normEmail(req.body?.email); return e ? `${clientIp(req)}|${e}` : null; } });
  app.post("/api/auth/login", limit(authLimiter, "login", [byIp(30, 15 * MIN), byIpEmail(8, 15 * MIN), byEmail(20, 60 * MIN)]));
  app.post("/api/auth/signup", limit(authLimiter, "signup", [byIp(10, 60 * MIN), byEmail(5, 60 * MIN)]));
  app.post("/api/auth/verify-email", limit(authLimiter, "verify", [byIp(30, 15 * MIN), byEmail(10, 15 * MIN)]));
  app.post("/api/auth/resend-code", limit(authLimiter, "resend", [byIp(20, 15 * MIN), byEmail(6, 60 * MIN)]));
  app.post("/api/auth/forgot-password", limit(authLimiter, "forgot", [byIp(20, 15 * MIN), byEmail(6, 60 * MIN)]));
  app.post("/api/auth/reset-password", limit(authLimiter, "resetpw", [byIp(30, 15 * MIN), byEmail(10, 15 * MIN)]));
  app.post("/api/auth/change-password", limit(authLimiter, "changepw", [byIp(20, 15 * MIN)]));
  // Signed out, and says whether a team number has a workspace (V3-L2): enough
  // for someone typing their number, too slow to list every team.
  app.get("/api/ftc/lookup-public", limit(authLimiter, "ftclookup", [byIp(60, 15 * MIN)]));
  app.post("/api/auth/oauth/complete", limit(authLimiter, "oauthdone", [byIp(20, 15 * MIN)]));
  app.post("/api/auth/google/complete", limit(authLimiter, "oauthdone", [byIp(20, 15 * MIN)]));
  app.post("/api/teams/join", limit(authLimiter, "join", [byIp(20, 15 * MIN)]));
  app.get("/api/invites/preview/:token", limit(authLimiter, "invitepeek", [byIp(60, 15 * MIN)]));
  app.post("/api/invites/accept", limit(authLimiter, "join", [byIp(20, 15 * MIN)]));
  app.post("/api/teams/request-join", limit(authLimiter, "reqjoin", [byIp(20, 15 * MIN)]));
  for (const p of ["/api/auth/google", "/api/auth/discord", "/api/auth/github"]) {
    app.get(p, limit(authLimiter, "oauthstart", [byIp(40, 15 * MIN)]));
  }

  // ---- Session cookie + CSRF guard (every /api request) ----
  // 1. Any session a route issues (login, signup, verify, team switch…) is
  //    moved from the JSON body into the HttpOnly cookie, so page scripts
  //    never see a token.
  // 2. Transition: a tab opened before the cookie switch still sends its old
  //    token in X-Session-ID. A valid legacy token is rotated once into a
  //    fresh cookie session and deleted, so nobody is signed out by the move.
  // 3. CSRF: cookies ride along on cross-site requests, so every state-
  //    changing /api call must carry X-CP-Client (or the legacy header).
  //    Cross-origin pages can't add custom headers without a CORS preflight,
  //    and no cross-origin access is allowed.
  app.use("/api", async (req: any, res, next) => {
    const secure = requestIsHttps(req);
    let issued: string | null = null;
    const issue = (token: string) => {
      if (!token || token === issued || res.headersSent) return;
      issued = token;
      res.append("Set-Cookie", sessionCookie(token, secure));
    };
    const json = res.json.bind(res);
    res.json = (body: any) => {
      if (body && typeof body === "object") {
        if (typeof body.sessionId === "string") { issue(body.sessionId); delete body.sessionId; }
        if (body.switched && typeof body.switched.sessionId === "string") { issue(body.switched.sessionId); delete body.switched.sessionId; }
      }
      return json(body);
    };
    if (readCookie(req, FILES_COOKIE)) res.append("Set-Cookie", `${FILES_COOKIE}=; Path=/api/files/; HttpOnly; SameSite=Lax; Max-Age=0`);

    const legacyHeader = typeof req.headers["x-session-id"] === "string" ? String(req.headers["x-session-id"]) : "";
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (unsafe && !req.headers["x-cp-client"] && !legacyHeader) {
      return res.status(403).json({ error: "Missing client header" });
    }
    try {
      const cookieToken = readCookie(req, SESSION_COOKIE);
      if (cookieToken) {
        // Validate once per request (getAuth reuses it).
        const v = await validateSession(cookieToken);
        req.cpSessionCheck = { token: cookieToken, ...v };
      } else if (legacyHeader && !legacyHeader.startsWith(TOKEN_PREFIX)) {
        // An old tab may fire several requests at once with the same token
        // before the new cookie arrives: they all get the same replacement,
        // and the old token keeps working for a short grace period.
        const prior = rotatedLegacy.get(legacyHeader);
        if (prior && prior.expires > Date.now()) {
          issue(prior.token);
          req.cpSessionToken = prior.token;
        } else {
          const v = await validateSession(legacyHeader);
          if (v.valid && v.legacy && v.memberId) {
            const fresh = await createSession(v.memberId);
            const graceEnds = Date.now() + LEGACY_GRACE_MS;
            rotatedLegacy.set(legacyHeader, { token: fresh, expires: graceEnds });
            await dbRun("UPDATE sessions SET expires_at = ? WHERE id = ?", new Date(graceEnds).toISOString(), legacyHeader);
            issue(fresh);
            req.cpSessionToken = fresh;
          }
        }
      }
    } catch (e) { console.error("session check failed:", e); }
    next();
  });
  // Pre-cookie tokens already rotated (legacy -> fresh), kept for the grace period.
  const LEGACY_GRACE_MS = 2 * 60 * 1000;
  const rotatedLegacy = new Map<string, { token: string; expires: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rotatedLegacy) if (v.expires < now) rotatedLegacy.delete(k);
  }, 60 * 1000).unref();

  // No CORS: the app and its API share one origin (the GitHub Pages mirror,
  // which called the API cross-origin, is retired). Browsers therefore refuse
  // cross-origin reads, and the CSRF header above can't be forged.

  // Health check for Render/uptime monitors. Cheap, unauthenticated, no AI/DB writes.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString(), uptimeSec: Math.round(process.uptime()) });
  });
  
  // Configure multer for file uploads
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  // Uploads are received into memory and persisted as BLOBs in the
  // stored_files table — Render's disk is ephemeral, so nothing
  // user-uploaded may live only on the filesystem.
  const storage = multer.memoryStorage();
  
  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });

  // Task-completion proof: screenshots only, 10MB each, max 5 files.
  const proofUpload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed as proof'));
    }
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

  // Feedback attachments: images, videos, and common documents, 25MB cap
  const feedbackUpload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const name = (file.originalname || '').toLowerCase();
      const mime = file.mimetype || '';
      const ok = mime.startsWith('image/') || mime.startsWith('video/')
        || /\.(pdf|txt|md|markdown|csv|log|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z)$/.test(name);
      if (ok) cb(null, true);
      else cb(new Error('Only images, videos, and common document files are allowed'));
    }
  });

  // CAD uploads: 3D model files (.step/.stp/.stl) + images, 25MB cap.
  // STEP files arrive with assorted mimetypes, so filter by extension.
  const cadUpload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const name = (file.originalname || '').toLowerCase();
      const ok3d = name.endsWith('.step') || name.endsWith('.stp') || name.endsWith('.stl');
      const okImg = (file.mimetype && file.mimetype.startsWith('image/')) || /\.(png|jpe?g|gif|webp)$/.test(name);
      if (ok3d || okImg) cb(null, true);
      else cb(new Error('Only .step/.stp/.stl model files and images are allowed'));
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

  // Targeted delivery to every open socket of one member (voice signaling, call invites).
  const sendToMember = (teamId: number | null | undefined, memberId: number, data: any) => {
    if (teamId == null) return;
    const payload = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && (client as any).teamId === teamId && (client as any).memberId === memberId) {
        try { client.send(payload); } catch {}
      }
    });
  };

  // Close every live socket of one membership (removed member): the socket
  // was authorised once at `hello`, so it must not outlive the membership.
  const disconnectMember = (teamId: number | null | undefined, memberId: number) => {
    const dropped: [number, number][] = [];
    clients.forEach(client => {
      if ((client as any).teamId === teamId && (client as any).memberId === memberId) {
        dropped.push([teamId as number, memberId]);
        (client as any).teamId = null;
        (client as any).memberId = null;
        try { client.close(4001, "membership ended"); } catch {}
      }
    });
    afterSocketsDropped(dropped);
  };

  // Sockets closed above have their identity cleared first, so the close
  // handler can't do its voice cleanup: do it here. A member left with no
  // open socket in that workspace is dropped from live calls after the usual
  // reconnect grace window.
  const afterSocketsDropped = (dropped: [number, number][]) => {
    const seen = new Set<string>();
    for (const [teamId, memberId] of dropped) {
      const key = `${teamId}:${memberId}`;
      if (teamId == null || seen.has(key)) continue;
      seen.add(key);
      if (memberSocketCount(teamId, memberId) === 0) scheduleVoiceDisconnectCleanup(voiceDeps, teamId, memberId);
    }
  };

  // Close the live sockets of an account's other sign-ins (sign out other
  // devices, password change): their sessions are gone, so must the sockets
  // authorised by them. Sockets on `keepKey` (this device) stay open.
  const disconnectOtherSessions = (memberIds: number[], keepKey: string | null) => {
    const ids = new Set(memberIds);
    const dropped: [number, number][] = [];
    clients.forEach(client => {
      const c = client as any;
      if (c.memberId != null && ids.has(c.memberId) && (!keepKey || c.sessionKey !== keepKey)) {
        dropped.push([c.teamId, c.memberId]);
        c.teamId = null;
        c.memberId = null;
        try { client.close(4001, "signed out"); } catch {}
      }
    });
    afterSocketsDropped(dropped);
  };

  const memberSocketCount = (teamId: number | null | undefined, memberId: number): number => {
    if (teamId == null) return 0;
    let n = 0;
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && (client as any).teamId === teamId && (client as any).memberId === memberId) n++;
    });
    return n;
  };

  // Voice/video calling deps — injected into server/voice.ts (no direct
  // imports) so the voice module stays unit-testable. Declared before the
  // wss handlers that reference it.
  const voiceDeps = {
    dbAll, dbGet, dbRun,
    requireAuth, requirePerm, hasPerm, getMemberPerms,
    memberRoleIds: async (memberId: number, teamId: number) =>
      (await memberRoleList(memberId, teamId)).map((r: any) => r.id),
    broadcastToTeam, sendToMember, memberSocketCount,
    env: process.env as Record<string, string | undefined>,
    nowIso: () => new Date().toISOString(),
  };

  /** A membership just lost its identity (removed, or moved to another
   *  email): drop it from any live call (its client tears down media; the
   *  others' participant lists update), then close its sockets. Sessions are
   *  revoked by the caller in the same write that changes the row. */
  const endMemberPresence = async (teamId: number | null | undefined, memberId: number) => {
    if (teamId == null) return;
    cancelVoiceDisconnectCleanup(teamId, memberId);
    try { await removeParticipantEverywhere(voiceDeps, teamId, memberId, "removed"); } catch (e) { console.error("voice cleanup failed:", e); }
    disconnectMember(teamId, memberId);
  };

  const createNotification = async (userId: number, content: string, type: string, meta?: Record<string, any>, opts?: { throwOnError?: boolean }) => {
    let inserted = false;
    try {
      const timestamp = new Date().toISOString();
      const metaJson = meta ? JSON.stringify(meta) : null;
      const info = await dbRun("INSERT INTO notifications (user_id, content, type, timestamp, meta) VALUES (?, ?, ?, ?, ?)", userId, content, type, timestamp, metaJson);
      inserted = true;
      const target = (await dbGet("SELECT team_id FROM members WHERE id = ?", userId)) as any;

      // Deliver to the recipient's own sockets only: a team-wide broadcast
      // put every member's notification text in every teammate's browser.
      sendToMember(target?.team_id, userId, {
        type: 'notification',
        notification: {
          id: info.lastInsertRowid,
          user_id: userId,
          content,
          type,
          timestamp,
          is_read: 0,
          meta: metaJson
        }
      });
    } catch (e) {
      console.error("createNotification failed:", e);
      // Only a failed save is the caller's problem; a failed live push isn't.
      if (opts?.throwOnError && !inserted) throw e;
    }
  };

  // ---- Notification controls (audit item 26) ----
  // A membership's prefs, or the account's from another membership (a
  // workspace joined after saving inherits the choice). Use with alias m.
  const PREFS_OF_M = `COALESCE(
    CASE WHEN json_valid(m.notify_prefs) THEN m.notify_prefs END,
    (SELECT p.notify_prefs FROM members p
      WHERE m.email IS NOT NULL AND LOWER(p.email) = LOWER(m.email)
        AND p.notify_prefs IS NOT NULL AND json_valid(p.notify_prefs)
      ORDER BY p.id DESC LIMIT 1))`;
  // Team updates (budget, outreach, calendar) follow each recipient's choice:
  // instant, a digest every few hours, or off. The actor is never notified of
  // their own change. `count` > 1 bundles a batch (Bruno adding 9 events).
  const notifyTeamUpdate = async (
    teamId: number, actorId: number | null, recipientIds: number[], kind: UpdateKind,
    content: string, meta: Record<string, any>, count = 1,
  ) => {
    const ids = [...new Set(recipientIds)].filter((id) => id && id !== actorId);
    if (!ids.length) return;
    try {
      const rows = (await dbAll(
        `SELECT m.id, ${PREFS_OF_M} AS notify_prefs FROM members m WHERE m.id IN (${ids.map(() => "?").join(",")}) AND m.team_id = ? AND COALESCE(m.is_active, 1) = 1`,
        ...ids, teamId,
      )) as any[];
      const now = new Date().toISOString();
      for (const r of rows) {
        const mode = parsePrefs(r.notify_prefs).team_updates;
        if (mode === "instant") void createNotification(r.id, content, "system", meta);
        else if (mode === "digest") {
          await dbRun(
            "INSERT INTO notification_digest (member_id, team_id, kind, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            r.id, teamId, kind, content, JSON.stringify({ ...meta, count }), now,
          );
        }
      }
    } catch (e) {
      console.error("notifyTeamUpdate failed:", e);
    }
  };

  // One summary per member once their oldest queued update is DIGEST_WINDOW old.
  // Rows are claimed in one UPDATE, so two sweeps (an overrun, a second
  // process) can never send the same rows; a claim left by a crashed sweep
  // expires after an hour.
  let flushing = false;
  const flushDigests = async () => {
    if (flushing) return;
    flushing = true;
    try {
      const cutoff = new Date(Date.now() - DIGEST_WINDOW_MS).toISOString();
      const staleClaim = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const due = (await dbAll(
        "SELECT member_id FROM notification_digest WHERE claim IS NULL OR claim < ? GROUP BY member_id HAVING MIN(created_at) <= ?",
        staleClaim, cutoff,
      )) as any[];
      for (const d of due) {
        const token = `${new Date().toISOString()}|${crypto.randomUUID()}`;
        const claimed = (await dbRun(
          "UPDATE notification_digest SET claim = ? WHERE member_id = ? AND (claim IS NULL OR claim < ?)",
          token, d.member_id, staleClaim,
        )) as any;
        if (!Number(claimed?.changes)) continue;
        const items = (await dbAll(
          "SELECT id, team_id, kind, meta FROM notification_digest WHERE claim = ? ORDER BY id", token,
        )) as any[];
        await dbRun("DELETE FROM notification_digest WHERE claim = ?", token);
        if (!items.length) continue;
        // Their current choice wins (they may have turned updates off since).
        const cur = (await dbGet(`SELECT ${PREFS_OF_M} AS notify_prefs FROM members m WHERE m.id = ?`, d.member_id)) as any;
        if (parsePrefs(cur?.notify_prefs).team_updates === "off") continue;
        const kinds: UpdateKind[] = [];
        for (const it of items) {
          let n = 1;
          try { n = Math.max(1, Math.min(50, Number(JSON.parse(it.meta || "{}").count) || 1)); } catch { /* 1 */ }
          for (let i = 0; i < n; i++) kinds.push(it.kind as UpdateKind);
        }
        const team = (await dbGet("SELECT name FROM teams WHERE id = ?", items[items.length - 1].team_id)) as any;
        const text = digestText(String(team?.name || ""), kinds);
        if (text) await createNotification(d.member_id, text, "system", { digest: true, items: kinds.length });
      }
    } catch (e) {
      console.error("digest flush failed:", e);
    } finally {
      flushing = false;
    }
  };
  setInterval(() => void flushDigests(), Number(process.env.NOTIFY_DIGEST_FLUSH_MS) || 15 * 60 * 1000).unref();

  // Members affected by a change to a whole role (edited, deleted): each hears
  // what happened, plus whether it changed their admin rights. `before` holds
  // { member_id, account_type } read before the change.
  const notifyRoleHolders = async (teamId: number, actorId: number, before: any[], what: (team: string) => string) => {
    if (!before.length) return;
    const t = (await dbGet("SELECT name FROM teams WHERE id = ?", teamId)) as any;
    const team = t?.name || "your workspace";
    for (const h of before) {
      if (h.member_id === actorId) continue;
      const now = (await dbGet("SELECT account_type FROM members WHERE id = ?", h.member_id)) as any;
      const adminNote = now && now.account_type !== h.account_type
        ? (now.account_type === "admin" ? " You're now an admin." : " You're no longer an admin.") : "";
      void createNotification(h.member_id, `${what(team)}${adminNote}`, "system", { roles_changed: true });
    }
  };

  // Caps one sender's @everyone / @here fan-out; the message still posts.
  const pingLimiter = new PingLimiter(3, 60 * 60 * 1000);
  setInterval(() => pingLimiter.sweep(), 10 * 60 * 1000).unref();

  wss.on("connection", (ws, req) => {
    // Same-origin sockets only (the session cookie must not authenticate a
    // socket opened by another site), and identity comes from that cookie.
    const origin = String(req.headers.origin || "");
    const host = String(req.headers.host || "");
    if (origin) {
      let ok = false;
      try { ok = new URL(origin).host === host; } catch { ok = false; }
      if (!ok) { try { ws.close(4003, "origin not allowed"); } catch {} return; }
    }
    (ws as any).cookieToken = readCookie(req, SESSION_COOKIE);
    clients.add(ws);
    ws.on("close", () => {
      const teamId = (ws as any).teamId;
      const memberId = (ws as any).memberId;
      clients.delete(ws);
      // Voice grace period: if this was the member's last open socket,
      // schedule dropping them from any live call after the reconnect grace
      // window instead of yanking them immediately — a brief network blip
      // shouldn't kill a call. A reconnect (hello) or rejoin inside the
      // window cancels the pending cleanup.
      if (teamId != null && memberId != null && memberSocketCount(teamId, memberId) === 0) {
        scheduleVoiceDisconnectCleanup(voiceDeps, teamId, memberId);
      }
    });
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        // Client identifies its workspace right after connecting: { type: 'hello', sessionId }
        // Identify the socket: the session cookie sent with the upgrade (a tab
        // from before the cookie switch may still name its token in hello).
        if (message.type === "hello") {
          const token = (ws as any).cookieToken || (typeof message.sessionId === "string" ? message.sessionId : "");
          if (!token) return;
          const { valid, memberId } = await validateSession(token);
          if (valid && memberId) {
            // Removed members' sessions are revoked, but check anyway: only an
            // active membership may join the team's live feed.
            const member = (await dbGet("SELECT id, team_id FROM members WHERE id = ? AND COALESCE(is_active, 1) = 1", memberId)) as any;
            if (member) {
              (ws as any).teamId = member.team_id;
              (ws as any).memberId = member.id;
              // Which sign-in this socket rides on: signing out other devices closes it.
              (ws as any).sessionKey = sessionKey(token);
              // Socket reconnect inside the grace window: cancel the pending
              // disconnect cleanup so the member stays in their call.
              cancelVoiceDisconnectCleanup(member.team_id, member.id);
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
        // Voice/video signaling (SDP/ICE relay, media state, ring cancel).
        // SDP and ICE payloads are relayed in-memory between verified
        // participants of the same live session and never persisted.
        if (typeof message.type === "string" && message.type.startsWith("voice:")) {
          await handleVoiceWSMessage(ws, message, voiceDeps);
          return;
        }
        if (message.type === "chat") {
          const teamId = (ws as any).teamId;
          const socketMemberId = (ws as any).memberId;
          if (teamId == null || socketMemberId == null) return; // ignore unidentified clients
          // The sender is whoever authenticated this socket — never the
          // client's claimed sender_id/sender_name (that allowed posting as
          // anyone, including admins in admin-only channels).
          const sender = (await dbGet("SELECT id, team_id, name FROM members WHERE id = ? AND COALESCE(is_active, 1) = 1", socketMemberId)) as any;
          if (!sender || sender.team_id !== teamId) return;
          message.sender_id = sender.id;
          message.sender_name = sender.name;
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
          // Inappropriate-content flag (review-only, never blocks the send).
          flagChatMessage(message.sender_id, teamId, Number(info.lastInsertRowid), String(message.content || ""));

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
          const wantsPing = plainContent.includes('@everyone') || plainContent.includes('@here');
          // Past 3 pings an hour, one sender's @everyone/@here stop fanning out.
          const pingAllowed = wantsPing && pingLimiter.allow(teamId, message.sender_id);
          if (plainContent.includes('@everyone') && pingAllowed) {
            // Notify every active member of the team (except the sender) who takes @everyone pings
            const all = (await dbAll(`SELECT m.id, ${PREFS_OF_M} AS notify_prefs FROM members m WHERE m.team_id = ? AND COALESCE(m.is_active, 1) = 1 AND m.id != ?`, teamId, message.sender_id)) as any[];
            for (const u of all) {
              if (!parsePrefs(u.notify_prefs).everyone_pings) continue;
              createNotification(u.id, `${message.sender_name} pinged @everyone in #${chanName}: "${plainContent.slice(0, 120)}"`, 'mention', { channel_id: channelId, channel_name: chanName, message_id: info.lastInsertRowid });
            }
          } else if (plainContent.includes('@here') && pingAllowed) {
            // Notify members currently viewing this channel (except the sender)
            const viewers = new Set<number>();
            for (const c of clients) {
              const mid = (c as any).memberId;
              if ((c as any).teamId === teamId && (c as any).viewingChannelId === channelId && mid && mid !== message.sender_id) {
                viewers.add(mid);
              }
            }
            const optedOut = viewers.size
              ? new Set(((await dbAll(
                  `SELECT m.id, ${PREFS_OF_M} AS notify_prefs FROM members m WHERE m.id IN (${[...viewers].map(() => "?").join(",")})`, ...viewers,
                )) as any[]).filter((r) => !parsePrefs(r.notify_prefs).everyone_pings).map((r) => r.id))
              : new Set<number>();
            for (const id of viewers) {
              if (optedOut.has(id)) continue;
              createNotification(id, `${message.sender_name} pinged @here in #${chanName}: "${plainContent.slice(0, 120)}"`, 'mention', { channel_id: channelId, channel_name: chanName, message_id: info.lastInsertRowid });
            }
          }
          const mentions = message.content.match(/@\[([^\]]+)\]/g);
          if (mentions) {
            for (const m of mentions) {
              const name = m.slice(2, -1);
              const user = (await dbGet("SELECT id FROM members WHERE name = ? AND team_id = ?", name, teamId)) as any;
              if (user) {
                createNotification(user.id, `You were mentioned by ${message.sender_name}: "${message.content}"`, 'mention', { channel_id: channelId, channel_name: chanName, message_id: info.lastInsertRowid });
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
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    // One message for every credential failure, so the endpoint can't be
    // used to learn which emails have accounts.
    const BAD_LOGIN = "Invalid email or password";
    if (!email || !password) return res.status(401).json({ error: BAD_LOGIN });
    const rows = await activeMemberRows(email);
    if (!rows.length) return res.status(401).json({ error: BAD_LOGIN });

    // The password is account-wide: accept it if it verifies against any of
    // this account's membership rows.
    let verified = false;
    let matchedHash = "";
    for (const r of rows) {
      if (r.password && (await bcrypt.compare(password, r.password))) { verified = true; matchedHash = r.password; break; }
    }
    const picked = (await pickMemberRow(rows)) as any;
    if (!verified) {
      // An account that never had a password (OAuth-only, or added to a
      // roster) proves ownership of its email with a code — never with
      // whatever was typed in the password box.
      if (rows.every((r) => !r.password)) {
        try {
          // A cooldown means a code went out under a minute ago — still valid.
          await issueVerificationCode(email, "reset");
        } catch (e) {
          console.error("setup code issue failed:", e);
          return res.status(502).json({ error: "We couldn't send your setup email — try again in a minute" });
        }
        return res.json({ needsPasswordSetup: true, email });
      }
      return res.status(401).json({ error: BAD_LOGIN });
    }
    // Email ownership check: unverified addresses get a code, not a session.
    if (!(await isEmailVerified(email))) {
      const emailSent = await sendSignupCode(email);
      return res.json({ needsVerification: true, email, emailSent });
    }
    // Atomic: the session is only created if, at insert time, the row still
    // has this email and the account still holds the password just checked
    // (an admin edit or password change may have landed mid-login).
    const sessionId = await createSessionIfCredential(picked.id, email, matchedHash);
    if (!sessionId) return res.status(401).json({ error: BAD_LOGIN });
    await inheritInterfaceMode(picked);
    res.json({ user: sanitizeMember(picked), sessionId });
  });

  // Retired: setting a first password without proving the email let anyone
  // claim a password-less account. First passwords now go through the
  // emailed-code flow (/api/auth/forgot-password → /api/auth/reset-password).
  app.post("/api/auth/setup", async (_req, res) => {
    res.status(410).json({ error: "Use the emailed code to set your password", needsPasswordSetup: true });
  });

  // Admin-only: email a roster member in your workspace a password-reset code.
  // A password is account-wide (it may guard other workspaces too), so an
  // admin never clears or sets it — only the email's owner can, via the code.
  app.post("/api/auth/reset", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const target = (await dbGet("SELECT id, team_id FROM members WHERE LOWER(email) = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, auth.teamId)) as any;
    if (!target) {
      return res.status(404).json({ error: "Member not found in your workspace" });
    }
    if (target.id === auth.memberId) {
      return res.status(400).json({ error: "You can't reset your own password this way" });
    }
    try {
      await issueVerificationCode(email, "reset");
    } catch (e) {
      console.error("admin reset code issue failed:", e);
      return res.status(502).json({ error: "Couldn't send the reset email — try again" });
    }
    res.json({ success: true, emailed: true });
  });

  // ---- Public signup ----
  // accountType 'admin': creates a new workspace (team) + access code, user becomes its admin.
  // accountType 'student': joins an existing workspace via the admin's access code.
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { accountType, name, email, password, teamName, teamNumber, accessCode, inviteToken, requestFtcNumber } = req.body || {};
      const cleanName = (name || '').trim();
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanName || !cleanEmail || !password || typeof password !== "string") {
        return res.status(400).json({ error: "Name, email and a password are required" });
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
      } else if (priorRows.length) {
        // The email already has password-less memberships (OAuth or roster).
        // A signup can't claim them by picking a password: the owner sets one
        // through the emailed code first ("Forgot password?").
        return res.status(400).json({ error: "An account with that email already exists — sign in instead" });
      } else {
        // A new password: the rules apply (an existing account above keeps its own).
        const weak = passwordProblem(password);
        if (weak) return res.status(400).json({ error: weak });
        hashedPassword = bcrypt.hashSync(password, 10);
      }

      if (accountType === 'admin') {
        // Team identity: an FTC team number is verified against the official
        // FTC record (name auto-filled from the number); otherwise the admin
        // types the team name manually.
        const identity: any = await resolveTeamIdentity(teamNumber, teamName);
        if (identity.error) return res.status(400).json({ error: identity.error });
        if (await ftcWorkspace(identity.ftcNumber)) return res.status(409).json(ftcTakenBody(identity.ftcNumber));
        const code = await uniqueAccessCode();
        const teamId = await insertTeamClaimingFtc({ name: identity.name, number: identity.number, access_code: code, ftc_team_number: identity.ftcNumber, navgpt_enabled: 0 });
        if (teamId == null) return res.status(409).json(ftcTakenBody(identity.ftcNumber));
        const mInfo = (await dbRun(
          "INSERT INTO members (team_id, name, role, email, password, is_setup, is_board, account_type, scopes) VALUES (?, ?, ?, ?, ?, 1, 1, 'admin', ?)",
          teamId, cleanName, 'Admin', cleanEmail, hashedPassword, JSON.stringify(['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin'])
        )) as any;
        // Unverified emails get a code, not a session — the team row already
        // exists, so verifying later lands them right back here.
        if (!(await isEmailVerified(cleanEmail))) {
          const emailSent = await sendSignupCode(cleanEmail);
          return res.json({ needsVerification: true, email: cleanEmail, emailSent });
        }
        const sessionId = await createSession(mInfo.lastInsertRowid);
        await assignSystemRole(teamId, mInfo.lastInsertRowid, "Admin");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        await ensureOnboardingRow(cleanEmail);
        await inheritInterfaceMode(user);
        return res.json({ user: sanitizeMember(user), sessionId, team: { id: teamId, name: identity.name, access_code: code, verified: !!identity.ftcNumber } });
      }

      if (accountType === 'student' && requestFtcNumber) {
        // "Ask to join" the workspace that already owns this FTC number:
        // nothing is created until someone there approves.
        const owner = await ftcWorkspace(parseInt(String(requestFtcNumber), 10));
        if (!owner) return res.status(400).json({ error: "No workspace has claimed that team number yet — create it instead" });
        if (priorRows.length) return res.status(400).json({ error: "You already have an account — sign in, then ask to join from Workspaces" });
        await fileJoinRequest(owner, cleanEmail, cleanName, null, "ftc");
        return res.json({ pendingApproval: true, team: { name: owner.name } });
      }

      if (accountType === 'student') {
        let team: any;
        let invite: Awaited<ReturnType<typeof inviteByToken>> = null;
        if (inviteToken) {
          invite = await inviteByToken(inviteToken);
          if (!invite) return res.status(400).json({ error: "That invite link isn't valid — ask your team for a new one" });
          const state = inviteState(invite);
          if (state !== "active") return res.status(400).json({ error: INVITE_STATE_MESSAGE[state] });
          team = await dbGet("SELECT * FROM teams WHERE id = ?", invite.team_id);
        } else {
          const norm = (accessCode || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (!norm) return res.status(400).json({ error: "Enter the access code from your team admin" });
          team = (await dbGet("SELECT * FROM teams WHERE REPLACE(access_code, '-', '') = ?", norm)) as any;
        }
        if (!team) return res.status(400).json({ error: "That access code doesn't match any team — check it with your admin" });
        if (invite?.requires_approval) {
          // Nothing is created yet: the account is made from the request
          // when someone approves it (they then sign in and verify the email).
          if (priorRows.length) return res.status(400).json({ error: "You already have an account — sign in, then open the invite link again" });
          if (!(await consumeInvite(invite))) return res.status(400).json({ error: INVITE_STATE_MESSAGE.used_up });
          await fileJoinRequest(team, cleanEmail, cleanName, invite.id);
          return res.json({ pendingApproval: true, team: { id: team.id, name: team.name } });
        }
        const dupe = (await dbGet("SELECT id, is_active FROM members WHERE email = ? AND team_id = ?", cleanEmail, team.id)) as any;
        if (dupe && dupe.is_active !== 0) {
          return res.status(400).json({ error: "You're already a member of this team — sign in instead" });
        }
        // Only now, when someone will actually join, does the link spend a use.
        if (invite && !(await consumeInvite(invite))) return res.status(400).json({ error: INVITE_STATE_MESSAGE.used_up });
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
        // Unverified emails get a code, not a session — the membership row
        // already exists, so verifying later lands them right back here.
        // Until then they are hidden from the roster (V3-M3) and teammates
        // hear "joined" only once the address is verified.
        if (!(await isEmailVerified(cleanEmail))) {
          const emailSent = await sendSignupCode(cleanEmail);
          return res.json({ needsVerification: true, email: cleanEmail, emailSent });
        }
        broadcastToTeam(team.id, { type: "member_joined", member: sanitizeMember(await dbGet("SELECT * FROM members WHERE id = ?", memberId)) });
        const sessionId = await createSession(memberId);
        await assignSystemRole(team.id, memberId, "Member");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", memberId));
        await ensureOnboardingRow(cleanEmail);
        await inheritInterfaceMode(user);
        return res.json({ user: sanitizeMember(user), sessionId, team: { id: team.id, name: team.name } });
      }

      return res.status(400).json({ error: "Choose whether you're signing up as an admin or a student" });
    } catch (e: any) {
      console.error("Signup error:", e);
      return res.status(500).json({ error: "Signup failed — try again" });
    }
  });

  // ---- Email verification (OTP) ----
  // The code is checked, the address is marked verified account-wide, and the
  // caller finally gets a session — identical shape to a login response, plus
  // the team for the admin code-reveal screen.
  app.post("/api/auth/verify-email", async (req, res) => {
    const email = (((req.body || {}).email) || "").trim();
    const code = String((req.body || {}).code || "");
    if (!email || !code) return res.status(400).json({ error: "Email and code are required" });
    const check = await checkVerificationCode(email, code);
    if (check.ok === false) {
      const msg = check.reason === "expired"
        ? "That code expired — request a new one"
        : check.reason === "locked"
          ? "Too many wrong attempts — request a new code"
          : "That code doesn't match — try again";
      return res.status(400).json({ error: msg, reason: check.reason });
    }
    await markEmailVerified(email);
    await ensureOnboardingRow(email);
    const rows = await activeMemberRows(email);
    if (!rows.length) return res.status(400).json({ error: "No account found for that email" });
    // Now verified: they appear on their teams' rosters (hidden until now, V3-M3).
    for (const r of rows) if (r.team_id) broadcastToTeam(r.team_id, { type: "member_joined", member: sanitizeMember(r) });
    const picked = (await pickMemberRow(rows)) as any;
    const sessionId = await createSession(picked.id);
    const teamRow = (await dbGet(
      "SELECT t.id, t.name, t.access_code FROM teams t JOIN members m ON m.team_id = t.id WHERE m.email = ? ORDER BY m.id DESC LIMIT 1",
      email
    )) as any;
    res.json({
      user: sanitizeMember(picked),
      sessionId,
      team: teamRow ? await teamForClient({ id: teamRow.id, name: teamRow.name, access_code: teamRow.access_code }, picked.email, { reveal: true }) : undefined,
    });
  });

  app.post("/api/auth/resend-code", async (req, res) => {
    const email = (((req.body || {}).email) || "").trim();
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (await isEmailVerified(email)) return res.json({ alreadyVerified: true });
    try {
      const result = await issueVerificationCode(email);
      if (result.sent === false) {
        return res.status(429).json({
          error: `Wait ${result.cooldownSeconds}s before requesting a new code`,
          cooldownSeconds: result.cooldownSeconds,
        });
      }
      return res.json({ sent: true });
    } catch (e: any) {
      console.error("resend code failed:", e);
      return res.status(500).json({ error: "Couldn't send the code — try again" });
    }
  });

  // ---- Forgot password (OTP via Resend) ----
  // Step 1: request a reset code. Always returns generic success so the
  // endpoint can't be used to enumerate accounts.
  app.post("/api/auth/forgot-password", async (req, res) => {
    const email = (((req.body || {}).email) || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email is required" });
    try {
      // Case-insensitive lookup: signup preserves the user's original casing.
      const exists = (await dbGet("SELECT id FROM members WHERE LOWER(email) = ?", email)) as any;
      if (exists) {
        // Fire and forget the cooldown: the public response is identical
        // whether the account exists, is cooling down, or is unknown, so
        // the endpoint never reveals registered addresses.
        await issueVerificationCode(email, "reset").catch((e) => console.error("forgot password code issue failed:", e));
      }
      return res.json({ sent: true });
    } catch (e: any) {
      console.error("forgot password failed:", e);
      return res.status(500).json({ error: "Couldn't send the code — try again" });
    }
  });

  // Step 2: verify the code + set a new password. The code proves email
  // ownership, so this also marks the email verified.
  app.post("/api/auth/reset-password", async (req, res) => {
    const email = (((req.body || {}).email) || "").trim().toLowerCase();
    const code = String((req.body || {}).code || "");
    const newPassword = String((req.body || {}).newPassword || "");
    if (!email || !code) return res.status(400).json({ error: "Email and code are required" });
    const weak = passwordProblem(newPassword);
    if (weak) return res.status(400).json({ error: weak });
    // Atomic: validate + consume the code in one step so overlapping
    // requests with the same code can't both succeed.
    const check = await consumeVerificationCode(email, code);
    if (check.ok === false) {
      const msg = check.reason === "expired"
        ? "That code expired — request a new one"
        : check.reason === "locked"
          ? "Too many wrong attempts — request a new code"
          : "That code doesn't match — try again";
      return res.status(400).json({ error: msg, reason: check.reason });
    }
    // Case-insensitive: match the account regardless of stored casing.
    const members = (await dbAll("SELECT id FROM members WHERE LOWER(email) = ?", email)) as any[];
    if (!members.length) return res.status(400).json({ error: "No account found for that email" });
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    // The password is account-wide: set it on every membership row for this email.
    await dbRun("UPDATE members SET password = ?, is_setup = 1 WHERE LOWER(email) = ?", hashedPassword, email);
    await markEmailVerified(email);
    // The code is already consumed; clear any stragglers.
    await dbRun("DELETE FROM email_verification_codes WHERE LOWER(email) = ?", email);
    // Kill every existing session on all membership rows: a password reset
    // must log out everything, including a possibly-stolen session.
    const memberIds = members.map((m) => m.id);
    const placeholders = memberIds.map(() => "?").join(",");
    await dbRun(`DELETE FROM sessions WHERE member_id IN (${placeholders})`, ...memberIds);
    res.json({ success: true });
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
  const TIKTOK_ENABLED = true;
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

  const oauthStates = new Map<string, { expiry: number; intent: string; provider: string; returnTo?: string; memberId?: number }>(); // state -> {expiry, intent, provider}
  // OAuth state is bound to the browser that started the flow (a short-lived
  // HttpOnly cookie), so a victim can't be fed someone else's callback URL
  // (login CSRF). Expired entries are swept on every start.
  const OAUTH_STATE_COOKIE = "cp_oauth_state";
  function startOAuthState(req: any, res: any, state: string, entry: { expiry: number; intent: string; provider: string; returnTo?: string; memberId?: number }) {
    const now = Date.now();
    for (const [k, v] of oauthStates) if (v.expiry < now) oauthStates.delete(k);
    oauthStates.set(state, entry);
    res.append("Set-Cookie", `${OAUTH_STATE_COOKIE}=${state}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${requestIsHttps(req) ? "; Secure" : ""}`);
  }
  /** The pending entry for a callback's state — only from the browser that started it. Single-use. */
  function takeOAuthState(req: any, res: any, state: string | undefined) {
    if (!state) return undefined;
    const pending = oauthStates.get(state);
    oauthStates.delete(state);
    res.append("Set-Cookie", `${OAUTH_STATE_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0`);
    if (readCookie(req, OAUTH_STATE_COOKIE) !== state) return undefined;
    return pending;
  }
  // Pending OAuth signups: token -> {provider, providerSub, email, name, intent, expiry}. Single-use, 10 min.
  const pendingOAuthSignups = new Map<string, { provider: string; providerSub: string; email: string; name: string; avatarUrl: string | null; intent: string; expiry: number }>();

  // First-party web origins that may start AND finish OAuth on the same host,
  // so each domain keeps the user on the domain they started from instead of
  // silently bouncing them to APP_URL. Both callback URIs are registered in
  // the Google/Discord/GitHub provider apps.
  function firstPartyOrigins(): string[] {
    const out = new Set<string>(["https://control-point.onrender.com"]);
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    if (appUrl) {
      try { out.add(new URL(appUrl).origin); } catch { /* ignore bad APP_URL */ }
    }
    return [...out];
  }

  function getOAuthRedirectUri(req: any, provider: string): string {
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    const host = req.get("host") || "";
    const reqOrigin = host ? `${proto}://${host}` : "";
    // Stay on the request's own domain when it's one of ours — never trust a
    // raw Host header beyond this allowlist.
    if (reqOrigin && firstPartyOrigins().includes(reqOrigin)) {
      return `${reqOrigin}/api/auth/${provider}/callback`;
    }
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    if (base) return `${base}/api/auth/${provider}/callback`;
    return `${reqOrigin}/api/auth/${provider}/callback`;
  }

  // OAuth completion may return to either first-party domain (so a login
  // started on control-point.onrender.com finishes there).
  // Sign-in completes on the host whose callback ran: the session cookie is
  // host-only, so handing off to another domain would arrive signed out.
  // No cross-domain return_to is accepted.
  function isAllowedOAuthReturnOrigin(_origin: string): boolean {
    return false;
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
        isOwner,
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
    // Memberships created or reactivated after the user picked an interface
    // mode inherit it from their other rows (and keep it from then on).
    await inheritInterfaceMode(user);
    // Every workspace this account belongs to (for the team switcher)
    (user as any).teams = user?.email ? await userTeams(user.email) : [];
    if (user?.id) {
      const pm = await presenceMap([user.id]);
      (user as any).presence = pm[user.id] || "offline";
    }
    res.json({ user: sanitizeMember(user), isOwner });
  });

  app.get("/api/auth/google", async (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: "Google sign-in is not configured" });
    }
    const rawIntent = (req.query.intent as string) || 'login';
    const intent = ['login', 'admin_signup', 'student_signup', 'signup'].includes(rawIntent) ? rawIntent : 'login';
    const state = randomHex(16);
    // Mirror login: the frontend passes ?return_to=<mirror origin> so the
    // OAuth completion can redirect back to the mirror instead of the API host.
    const rt = req.query.return_to as string | undefined;
    // Keep the full mirror URL (origin + base path, e.g. /control-point) so the
    // OAuth completion lands on the mirror's app root. Origin must be allowlisted.
    let returnTo: string | undefined;
    try {
      if (rt && isAllowedOAuthReturnOrigin(rt)) returnTo = new URL(rt).href.replace(/\/$/, '');
    } catch { /* invalid URL — fall back to API host */ }
    startOAuthState(req, res, state, { expiry: Date.now() + 10 * 60 * 1000, intent, provider: 'google', returnTo });
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
  // avatar they uploaded themselves. OAuth avatar URLs (Google, Discord, etc.)
  // can expire or break, so we download and store them locally on first sight.
  async function fillOAuthProfile(email: string, name: string, avatarUrl: string | null) {
    const rows = (await dbAll("SELECT id, name, avatar_url FROM members WHERE email = ? AND COALESCE(is_active, 1) = 1", email)) as any[];
    const cleanName = (name || '').trim();
    const emailPrefix = email.split('@')[0];

    // Download a provider avatar and store it locally. Returns the local
    // file URL, or null if the download failed.
    const downloadAvatar = async (url: string, memberId: number): Promise<string | null> => {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const buf = Buffer.from(await resp.arrayBuffer());
        const ctype = resp.headers.get('content-type') || '';
        if (resp.ok && buf.length > 0 && buf.length < 2 * 1024 * 1024 && ctype.startsWith('image/')) {
          const fid = await storeFile({
            teamId: null, memberId, kind: 'avatar',
            filename: 'oauth-avatar', mimeType: ctype.split(';')[0], buffer: buf,
          });
          return fileUrl(fid);
        }
      } catch { /* download failed */ }
      return null;
    };

    // Check if a local /api/files/:id avatar actually exists in storage.
    const localAvatarExists = async (url: string | null): Promise<boolean> => {
      const m = /^\/api\/files\/(\d+)$/.exec(String(url || ''));
      if (!m) return false;
      try {
        const f = (await dbGet("SELECT id FROM stored_files WHERE id = ?", Number(m[1]))) as any;
        return !!f;
      } catch { return false; }
    };

    for (const r of rows) {
      const nameIsDefault = !r.name || r.name === emailPrefix;
      const newName = cleanName && nameIsDefault ? cleanName : r.name;
      let newAvatar = r.avatar_url;

      const storedIsLocal = typeof r.avatar_url === 'string' && r.avatar_url.startsWith('/api/files/');
      const storedIsExternal = typeof r.avatar_url === 'string' && /^https?:\/\//.test(r.avatar_url);
      const localOk = storedIsLocal ? await localAvatarExists(r.avatar_url) : false;

      if (storedIsLocal && localOk) {
        // Working local avatar — never touch it.
      } else if (avatarUrl) {
        // Missing, broken, or external avatar: (re)download the fresh provider URL.
        const local = await downloadAvatar(avatarUrl, r.id);
        if (local) {
          newAvatar = local;
        } else if (!storedIsExternal) {
          // Download failed and nothing usable stored — clear it so the UI
          // falls back to initials instead of a broken image.
          newAvatar = null;
        }
        // else: keep the existing external URL (might still work).
      } else if (storedIsLocal && !localOk) {
        // Local file is gone and no fresh URL — clear it.
        newAvatar = null;
      }

      if (newName !== r.name || newAvatar !== r.avatar_url) {
        await dbRun("UPDATE members SET name = ?, avatar_url = ? WHERE id = ?", newName, newAvatar, r.id);
      }
    }
  }

  async function finishOAuthLogin(provider: string, providerSub: string, rawEmail: string, name: string, avatarUrl: string | null, intent: string, res: any, returnTo?: string) {
    const idColumn = OAUTH_PROVIDERS[provider].idColumn;
    // Emails are stored lowercase: one account per address, whatever its casing.
    const email = String(rawEmail || "").trim().toLowerCase();
    let rows: any[] = (await dbAll(`SELECT * FROM members WHERE ${idColumn} = ? AND COALESCE(is_active, 1) = 1`, providerSub)) as any[];
    // Redirect target: the mirror origin when this login started there, else the API host.
    const base = returnTo || '';
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
        return res.redirect(`${base}/?oauth_signup=${token}&intent=${intent}&provider=${provider}`);
      } else {
        return res.redirect(`${base}/?oauth_error=not_invited`);
      }
    } else {
      await fillOAuthProfile(email, name, avatarUrl);
      rows = (await dbAll(`SELECT * FROM members WHERE ${idColumn} = ? AND COALESCE(is_active, 1) = 1`, providerSub)) as any[];
    }
    const member = await pickMemberRow(rows);
    // OAuth providers verify email ownership — no OTP needed.
    await markEmailVerified(email);
    const sessionId = await createSession(member.id);
    // The session goes straight into the HttpOnly cookie on this top-level
    // redirect — never into the URL (history, logs, Referer).
    res.append("Set-Cookie", sessionCookie(sessionId, requestIsHttps(res.req)));
    res.redirect(`${base}/?oauth=ok`);
  }

  // Shared completion step for every OAuth provider: the identity is verified,
  // now collect the role-specific details (team name for admins, access code for students).
  async function completeOAuthSignup(provider: string, req: any, res: any) {
    try {
      const { token, teamName, teamNumber, accessCode, role, inviteToken, requestFtcNumber } = req.body || {};
      const pending = token ? pendingOAuthSignups.get(token) : undefined;
      if (pending) pendingOAuthSignups.delete(token); // single-use
      if (!pending || pending.expiry < Date.now() || pending.provider !== provider) {
        return res.status(400).json({ error: "Signup expired — please try again" });
      }
      const idColumn = OAUTH_PROVIDERS[provider].idColumn;
      const cleanEmail = (pending.email || '').trim();
      const cleanName = (pending.name || '').trim() || cleanEmail.split('@')[0];
      if (!cleanEmail) return res.status(400).json({ error: "Signup expired — please try again" });
      // The OAuth provider verified this address — no OTP needed.
      await markEmailVerified(cleanEmail);
      // Multi-team accounts: a provider-verified email may already exist — it
      // simply gains a membership row in the new/joined team. (Duplicate
      // membership in the SAME team is still rejected below.)

      // A fixable answer (wrong code, taken number…) keeps the one-time
      // signup token alive so the person can correct it and resubmit.
      const retryable = (status: number, body: any) => {
        pendingOAuthSignups.set(token, pending);
        return res.status(status).json(body);
      };
      const effectiveIntent = pending.intent === 'signup'
        ? (role === 'admin' ? 'admin_signup' : 'student_signup')
        : pending.intent;
      // "Ask to join" the workspace that owns an FTC number. Handled first so
      // it works from an admin signup too (the number turned out to be taken).
      if (requestFtcNumber && (effectiveIntent === 'admin_signup' || effectiveIntent === 'student_signup')) {
        const owner = await ftcWorkspace(parseInt(String(requestFtcNumber), 10));
        if (!owner) return retryable(400, { error: "No workspace has claimed that team number yet — create it instead" });
        const dupe = (await dbGet("SELECT id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", cleanEmail, owner.id)) as any;
        if (dupe) return res.status(400).json({ error: "This account is already on that team — sign in instead" });
        // The provider verified the email; on approval they sign in with it.
        await fileJoinRequest(owner, cleanEmail, cleanName, null, "ftc");
        return res.json({ pendingApproval: true, team: { name: owner.name } });
      }

      if (effectiveIntent === 'admin_signup') {
        const identity: any = await resolveTeamIdentity(teamNumber, teamName);
        if (identity.error) return retryable(400, { error: identity.error });
        if (await ftcWorkspace(identity.ftcNumber)) return retryable(409, ftcTakenBody(identity.ftcNumber));
        const code = await uniqueAccessCode();
        const teamId = await insertTeamClaimingFtc({ name: identity.name, number: identity.number, access_code: code, ftc_team_number: identity.ftcNumber, navgpt_enabled: 0 });
        if (teamId == null) return retryable(409, ftcTakenBody(identity.ftcNumber));
        const mInfo = (await dbRun(
          `INSERT INTO members (team_id, name, role, email, password, ${idColumn}, is_setup, is_board, account_type, scopes, avatar_url) VALUES (?, ?, ?, ?, NULL, ?, 1, 1, 'admin', ?, ?)`,
          teamId, cleanName, 'Admin', cleanEmail, pending.providerSub, JSON.stringify(['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin']), pending.avatarUrl || null
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        await assignSystemRole(teamId, mInfo.lastInsertRowid, "Admin");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        await ensureOnboardingRow(cleanEmail);
        await inheritInterfaceMode(user);
        return res.json({ user: sanitizeMember(user), sessionId, team: { id: teamId, name: identity.name, access_code: code, verified: !!identity.ftcNumber } });
      }

      if (effectiveIntent === 'student_signup') {
        let team: any;
        let invite: Awaited<ReturnType<typeof inviteByToken>> = null;
        if (inviteToken) {
          invite = await inviteByToken(inviteToken);
          if (!invite) return retryable(400, { error: "That invite link isn't valid — ask your team for a new one" });
          const state = inviteState(invite);
          if (state !== "active") return retryable(400, { error: INVITE_STATE_MESSAGE[state] });
          // Approval links need an account first: sign in, then open the link.
          if (invite.requires_approval) return res.status(400).json({ error: "This invite needs approval — create your account with email and password, or sign in first" });
          team = await dbGet("SELECT * FROM teams WHERE id = ?", invite.team_id);
        } else {
          const norm = (accessCode || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (!norm) return retryable(400, { error: "Enter the access code from your team admin" });
          team = (await dbGet("SELECT * FROM teams WHERE REPLACE(access_code, '-', '') = ?", norm)) as any;
        }
        if (!team) return retryable(400, { error: "That access code doesn't match any team — check it with your admin" });
        const dupe = (await dbGet("SELECT id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", cleanEmail, team.id)) as any;
        if (dupe) return res.status(400).json({ error: "This account is already on that team — sign in instead" });
        if (invite && !(await consumeInvite(invite))) return res.status(400).json({ error: INVITE_STATE_MESSAGE.used_up });
        const mInfo = (await dbRun(
          `INSERT INTO members (team_id, name, role, email, password, ${idColumn}, is_setup, is_board, account_type, scopes, avatar_url) VALUES (?, ?, ?, ?, NULL, ?, 1, 0, 'student', ?, ?)`,
          team.id, cleanName, 'Member', cleanEmail, pending.providerSub, JSON.stringify([]), pending.avatarUrl || null
        )) as any;
        const sessionId = await createSession(mInfo.lastInsertRowid);
        await assignSystemRole(team.id, mInfo.lastInsertRowid, "Member");
        const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
        await ensureOnboardingRow(cleanEmail);
        await inheritInterfaceMode(user);
        broadcastToTeam(team.id, { type: "member_joined", member: sanitizeMember(user) });
        return res.json({ user: sanitizeMember(user), sessionId, team: { id: team.id, name: team.name } });
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
    // Mirror login: the frontend passes ?return_to=<mirror origin> so the
    // OAuth completion can redirect back to the mirror instead of the API host.
    const rt = req.query.return_to as string | undefined;
    // Keep the full mirror URL (origin + base path, e.g. /control-point) so the
    // OAuth completion lands on the mirror's app root. Origin must be allowlisted.
    let returnTo: string | undefined;
    try {
      if (rt && isAllowedOAuthReturnOrigin(rt)) returnTo = new URL(rt).href.replace(/\/$/, '');
    } catch { /* invalid URL — fall back to API host */ }
    startOAuthState(req, res, state, { expiry: Date.now() + 10 * 60 * 1000, intent, provider: 'discord', returnTo });
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
      const pending = takeOAuthState(req, res, state);
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
      await finishOAuthLogin('discord', String(profile.id), profile.email, name, avatarUrl, pending.intent || 'login', res, pending.returnTo);
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
    // Mirror login: the frontend passes ?return_to=<mirror origin> so the
    // OAuth completion can redirect back to the mirror instead of the API host.
    const rt = req.query.return_to as string | undefined;
    // Keep the full mirror URL (origin + base path, e.g. /control-point) so the
    // OAuth completion lands on the mirror's app root. Origin must be allowlisted.
    let returnTo: string | undefined;
    try {
      if (rt && isAllowedOAuthReturnOrigin(rt)) returnTo = new URL(rt).href.replace(/\/$/, '');
    } catch { /* invalid URL — fall back to API host */ }
    startOAuthState(req, res, state, { expiry: Date.now() + 10 * 60 * 1000, intent, provider: 'github', returnTo });
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
      const pending = takeOAuthState(req, res, state);
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
      await finishOAuthLogin('github', String(ghUser.id), primary.email, name, avatarUrl, pending.intent || 'login', res, pending.returnTo);
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
      const pending = takeOAuthState(req, res, state);
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
      // Only a Google-verified address may sign in or link to an existing
      // account by email (Discord and GitHub are checked the same way).
      if (profile.email_verified !== true && profile.email_verified !== "true") {
        return res.redirect(`${pending.returnTo || ''}/?oauth_error=email_unverified`);
      }

      await finishOAuthLogin('google', String(profile.sub), profile.email, profile.name || '', profile.picture || null, intent, res, pending.returnTo);
    } catch (error) {
      console.error("Google OAuth error:", error);
      res.redirect("/?oauth_error=oauth_failed");
    }
  });

  // Back-compat: the old Google-only completion route now delegates to the generic one.
  app.post("/api/auth/google/complete", async (req, res) => {
    await completeOAuthSignup('google', req, res);
  });

  // --- Google Calendar linking (per-member, from Settings) ---
  // Separate OAuth flow with calendar.events scope. Stores a refresh token per
  // member; the admin's `google_calendar_sync` setting controls whether team
  // events auto-push to every linked member's personal calendar.

  const getCalendarSyncEnabled = async (): Promise<boolean> => {
    try {
      const row = (await dbGet("SELECT value FROM settings WHERE key = 'google_calendar_sync'")) as any;
      return row?.value === '1';
    } catch { return false; }
  };

  const getGoogleAccessToken = async (memberId: number): Promise<string | null> => {
    try {
      const link = (await dbGet("SELECT refresh_token FROM google_calendar_links WHERE member_id = ?", memberId)) as any;
      if (!link?.refresh_token) return null;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: link.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      if (!tokenRes.ok) {
        // Refresh token revoked/expired — drop the link so the user can re-link.
        if (tokenRes.status === 400 || tokenRes.status === 401) {
          await dbRun("DELETE FROM google_calendar_links WHERE member_id = ?", memberId);
        }
        return null;
      }
      const { access_token } = (await tokenRes.json()) as any;
      return access_token || null;
    } catch {
      return null;
    }
  };

  // Start the calendar-link OAuth flow (must be signed in).
  // Uses its own redirect URI (/api/auth/google/calendar/callback) — it must
  // be added to the Google Cloud Console's authorized redirect URIs.
  const getCalendarRedirectUri = (req: any): string => {
    const base = getOAuthRedirectUri(req, 'google');
    return base.replace('/api/auth/google/callback', '/api/auth/google/calendar/callback');
  };
  app.get("/api/auth/google/calendar", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(400).json({ error: "Google sign-in is not configured" });
      }
      const state = randomHex(16);
      startOAuthState(req, res, state, {
        expiry: Date.now() + 10 * 60 * 1000,
        intent: 'calendar_link',
        provider: 'google',
        memberId: auth.memberId,
      });
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: getCalendarRedirectUri(req),
        response_type: "code",
        scope: "openid email https://www.googleapis.com/auth/calendar.events",
        state,
        access_type: "offline",
        prompt: "consent select_account",
      });
      res.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString());
    } catch (error) {
      console.error("Calendar link start error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // OAuth callback for calendar linking lives at /api/auth/google/calendar/callback (below).

  app.get("/api/auth/google/calendar/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const pending = takeOAuthState(req, res, state);
      if (!code || !pending || pending.expiry < Date.now() || pending.intent !== 'calendar_link') {
        return res.redirect("/settings?cal_error=invalid_state");
      }
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: getCalendarRedirectUri(req),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) throw new Error("Token exchange failed");
      const { access_token, refresh_token } = (await tokenRes.json()) as any;
      if (!refresh_token) throw new Error("No refresh token granted");
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const profile = profileRes.ok ? ((await profileRes.json()) as any) : {};
      await dbRun(
        "INSERT OR REPLACE INTO google_calendar_links (member_id, google_email, refresh_token, linked_at) VALUES (?, ?, ?, datetime('now'))",
        pending.memberId, profile.email || '', refresh_token
      );
      res.redirect("/settings?cal_linked=1");
    } catch (error) {
      console.error("Calendar link callback error:", error);
      res.redirect("/settings?cal_error=link_failed");
    }
  });

  // Calendar link status for the current member.
  app.get("/api/calendar/link", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const link = (await dbGet(
        "SELECT google_email, linked_at FROM google_calendar_links WHERE member_id = ?", auth.memberId
      )) as any;
      const syncEnabled = await getCalendarSyncEnabled();
      res.json({ linked: !!link, google_email: link?.google_email || null, linked_at: link?.linked_at || null, team_sync_enabled: syncEnabled });
    } catch (error) {
      console.error("Error fetching calendar link:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Unlink the current member's Google Calendar.
  app.delete("/api/calendar/link", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      await dbRun("DELETE FROM google_calendar_links WHERE member_id = ?", auth.memberId);
      await dbRun("DELETE FROM event_calendar_sync WHERE member_id = ?", auth.memberId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error unlinking calendar:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Push one team event to one member's Google Calendar.
  const pushEventToGoogle = async (memberId: number, event: any): Promise<string | null> => {
    const accessToken = await getGoogleAccessToken(memberId);
    if (!accessToken) return null;
    const body: any = {
      summary: event.title,
      description: `${event.description || ''}\n\n— via Control Point`.trim(),
      location: event.location || undefined,
    };
    if (event.start_time) {
      // Timed event — interpret in the server's local timezone
      const dateStr = `${event.date}T${event.start_time}:00`;
      const endStr = event.end_time ? `${event.date}T${event.end_time}:00` : null;
      body.start = { dateTime: dateStr };
      body.end = { dateTime: endStr || dateStr };
    } else {
      body.start = { date: event.date };
      const end = new Date(event.date + 'T12:00:00Z');
      end.setUTCDate(end.getUTCDate() + 1);
      body.end = { date: end.toISOString().slice(0, 10) };
    }
    try {
      const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) return null;
      const created = (await r.json()) as any;
      return created.id || null;
    } catch {
      return null;
    }
  };

  const syncEventToCalendars = async (event: any, teamId: number) => {
    if (!(await getCalendarSyncEnabled())) return;
    try {
      const links = (await dbAll(
        `SELECT g.member_id FROM google_calendar_links g
         JOIN members m ON m.id = g.member_id
         WHERE m.team_id = ? AND COALESCE(m.is_active, 1) = 1`, teamId
      )) as any[];
      for (const l of links) {
        const googleEventId = await pushEventToGoogle(l.member_id, event);
        if (googleEventId) {
          await dbRun(
            "INSERT OR REPLACE INTO event_calendar_sync (event_id, member_id, google_event_id) VALUES (?, ?, ?)",
            event.id, l.member_id, googleEventId
          );
        }
      }
    } catch (e) {
      console.error("Calendar sync failed:", (e as any)?.message);
    }
  };

  const updateSyncedEvent = async (event: any) => {
    if (!(await getCalendarSyncEnabled())) return;
    try {
      const rows = (await dbAll("SELECT member_id, google_event_id FROM event_calendar_sync WHERE event_id = ?", event.id)) as any[];
      for (const r of rows) {
        const accessToken = await getGoogleAccessToken(r.member_id);
        if (!accessToken) continue;
        const body: any = {
          summary: event.title,
          description: `${event.description || ''}\n\n— via Control Point`.trim(),
          location: event.location || undefined,
        };
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(r.google_event_id)}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => {});
      }
    } catch (e) {
      console.error("Calendar sync update failed:", (e as any)?.message);
    }
  };

  const deleteSyncedEvent = async (eventId: number) => {
    try {
      const rows = (await dbAll("SELECT member_id, google_event_id FROM event_calendar_sync WHERE event_id = ?", eventId)) as any[];
      for (const r of rows) {
        const accessToken = await getGoogleAccessToken(r.member_id);
        if (!accessToken) continue;
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(r.google_event_id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});
      }
      await dbRun("DELETE FROM event_calendar_sync WHERE event_id = ?", eventId);
    } catch (e) {
      console.error("Calendar sync delete failed:", (e as any)?.message);
    }
  };

  // --- Self-service account management ---

  /** DB key of the caller's session (for "delete this one / all but this one"). */
  const currentSessionId = (req: any): string | null => {
    const token = getSessionId(req);
    return token ? sessionKey(token) : null;
  };

  // Log out: invalidate the current session server-side
  app.post("/api/auth/logout", async (req, res) => {
    // Expire the cookies first, so they're cleared even if the session
    // delete below fails.
    res.append("Set-Cookie", sessionCookie(null, requestIsHttps(req)));
    res.append("Set-Cookie", `${FILES_COOKIE}=; Path=/api/files/; HttpOnly; SameSite=Lax; Max-Age=0`);
    try {
      const sid = currentSessionId(req);
      if (sid) await dbRun("DELETE FROM sessions WHERE id = ?", sid);
      // A pre-cookie token rotated into this session may still be in its
      // grace period — it must die with the session.
      const token = getSessionId(req);
      for (const [legacy, v] of rotatedLegacy) {
        if (v.token === token) {
          rotatedLegacy.delete(legacy);
          await dbRun("DELETE FROM sessions WHERE id = ?", legacy);
        }
      }
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
    const weak = passwordProblem(newPassword);
    if (weak) return res.status(400).json({ error: weak });
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
    (await dbRun("UPDATE members SET password = ? WHERE LOWER(email) = LOWER(?)", newHash, member.email));
    const siblingIds = ((await dbAll("SELECT id FROM members WHERE LOWER(email) = LOWER(?)", member.email)) as any[]).map((r) => r.id);
    const sid = currentSessionId(req);
    if (siblingIds.length) {
      const placeholders = siblingIds.map(() => "?").join(",");
      if (sid) await dbRun(`DELETE FROM sessions WHERE member_id IN (${placeholders}) AND id != ?`, ...siblingIds, sid);
      else await dbRun(`DELETE FROM sessions WHERE member_id IN (${placeholders})`, ...siblingIds);
      disconnectOtherSessions(siblingIds, sid);
    }
    res.json({ ok: true });
  });

  // Sign out everywhere else: every other session of this account (all its
  // workspaces); this one stays signed in.
  app.post("/api/auth/sign-out-others", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const me = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
    if (!me?.email) return res.status(404).json({ error: "Account not found" });
    const ids = ((await dbAll("SELECT id FROM members WHERE LOWER(email) = LOWER(?)", me.email)) as any[]).map((r) => r.id);
    const sid = currentSessionId(req);
    let removed = 0;
    if (ids.length && sid) {
      const placeholders = ids.map(() => "?").join(",");
      const r = (await dbRun(`DELETE FROM sessions WHERE member_id IN (${placeholders}) AND id != ?`, ...ids, sid)) as any;
      removed = Number(r?.changes ?? r?.rowsAffected ?? 0);
      disconnectOtherSessions(ids, sid);
    }
    res.json({ ok: true, removed });
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
      await deleteOwnedAvatarFile(r.avatar_url, ids);
    }));
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      // Independent deletes → one batch (atomic on Turso, single round trip)
      // Include every table with a FK to members(id) — team deletion should have
      // cleaned team-scoped rows, but belt-and-suspenders here prevents 500s.
      await dbBatch([
        { sql: `DELETE FROM sessions WHERE member_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM stream_sessions WHERE member_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM notifications WHERE user_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM member_roles WHERE member_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM attendance WHERE member_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM messages WHERE sender_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM tasks WHERE assigned_to IN (${ph})`, args: ids },
        { sql: `DELETE FROM feedback WHERE user_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM call_participants WHERE member_id IN (${ph})`, args: ids },
        // Bruno's personal facts and morning-summary records go with the account.
        { sql: `DELETE FROM bruno_memories WHERE scope = 'user' AND member_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM bruno_nudges_sent WHERE member_id IN (${ph})`, args: ids },
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
    // Any signed-in account may start a workspace (it becomes its admin);
    // permissions in other workspaces don't matter here.
    const { name, number, ftc_number, accent_color, primary_color, text_color } = req.body || {};
    // FTC number first: a verified number names the workspace and claims the
    // number; without one, a typed name is required.
    const identity: any = await resolveTeamIdentity(ftc_number ?? number, name);
    if (identity.error) return res.status(400).json({ error: identity.error });
    if (await ftcWorkspace(identity.ftcNumber)) return res.status(409).json(ftcTakenBody(identity.ftcNumber));
    const cleanName = String(identity.name).trim().slice(0, 80);
    const code = await uniqueAccessCode();
    const teamId = await insertTeamClaimingFtc({
      name: cleanName, number: identity.number, access_code: code, ftc_team_number: identity.ftcNumber,
      accent_color: cleanHex(accent_color), primary_color: cleanHex(primary_color), text_color: cleanHex(text_color), navgpt_enabled: 0,
    });
    if (teamId == null) return res.status(409).json(ftcTakenBody(identity.ftcNumber));
    const me = auth.teamless
      ? (await dbGet("SELECT * FROM members WHERE email = ? ORDER BY id DESC LIMIT 1", auth.email || "")) as any
      : (await dbGet("SELECT * FROM members WHERE id = ?", auth.memberId)) as any;
    const mInfo = (await dbRun(
      "INSERT INTO members (team_id, name, role, email, password, avatar_url, is_setup, is_board, account_type, scopes, google_id, discord_id, github_id) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'admin', ?, ?, ?, ?)",
      teamId, me?.name || me?.email || "Admin", "Admin", me?.email || auth.email || "", me?.password || null, me?.avatar_url || null, JSON.stringify(['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin']), me?.google_id || null, me?.discord_id || null, me?.github_id || null
    )) as any;
    await ensureRolesSeeded(teamId);
    await assignSystemRole(teamId, mInfo.lastInsertRowid, "Admin");
    const sessionId = await rebindSession(req, mInfo.lastInsertRowid);
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", mInfo.lastInsertRowid));
    await inheritInterfaceMode(user);
    (user as any).teams = me?.email ? await userTeams(me.email) : [];
    res.json({ team: { id: teamId, name: cleanName, number: identity.number, ftc_team_number: identity.ftcNumber, access_code: code }, user: sanitizeMember(user), sessionId });
  });

  // Ask to join the workspace that already owns an FTC team number (the
  // "someone already created our team" path). Files a join request.
  app.post("/api/teams/request-join", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const email = await authEmail(auth);
    if (!email) return res.status(401).json({ error: "Not signed in" });
    const owner = await ftcWorkspace(parseInt(String(req.body?.ftc_number || ""), 10));
    if (!owner) return res.status(404).json({ error: "No workspace has claimed that team number yet" });
    const already = (await dbGet(
      "SELECT id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, owner.id
    )) as any;
    if (already) return res.status(400).json({ error: "You're already in that workspace — switch to it from the workspace menu" });
    const me = (await dbGet("SELECT name FROM members WHERE email = ? ORDER BY id DESC LIMIT 1", email)) as any;
    await fileJoinRequest(owner, email, me?.name || email.split("@")[0], null, "ftc");
    res.json({ pendingApproval: true, team: { name: owner.name } });
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
    await inheritInterfaceMode(row);
    const sessionId = await rebindSession(req, row.id);
    const team = (await dbGet("SELECT * FROM teams WHERE id = ?", teamId)) as any;
    res.json({ user: sanitizeMember(row), sessionId, team: await teamForClient(team, row.email) });
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
    // Codes are shown as CP-XXXX-XXXXXX; accept them with or without dashes.
    const norm = String(req.body?.access_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!norm) return res.status(400).json({ error: "Enter an access code" });
    const team = (await dbGet("SELECT * FROM teams WHERE REPLACE(access_code, '-', '') = ?", norm)) as any;
    if (!team) return res.status(404).json({ error: "No team found with that access code" });
    await joinAndRespond(req, res, email, team);
  });

  // Shared tail of every "join this workspace" path: add the membership,
  // move the session there, tell the team.
  async function joinAndRespond(req: any, res: any, email: string, team: any) {
    const { row, joined } = await addMembership(email, team);
    await inheritInterfaceMode(row);
    const sessionId = await rebindSession(req, row.id);
    const user = sanitizeMember({ ...(row as any), teams: await userTeams(email) });
    if (joined) {
      // Live mission control: everyone sees the new member without refreshing.
      broadcastToTeam(team.id, { type: "member_joined", member: sanitizeMember(row) });
    }
    res.json({ user, sessionId, team: await teamForClient(team, email), joined });
  }

  async function authEmail(auth: { teamless?: boolean; email?: string; memberId: number }): Promise<string> {
    return auth.teamless
      ? (auth.email || "")
      : (((await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any)?.email || "");
  }

  async function canInvite(auth: any): Promise<boolean> {
    if (!auth || auth.teamless || !auth.teamId) return false;
    return (await hasPerm(auth, "manage_members")) || (await hasPerm(auth, "invite_members"));
  }

  // Files (or refreshes) a pending request and tells the people who can
  // approve it. A request never carries credentials: nobody has proven they
  // own the email yet, so a brand-new account is created password-less on
  // approval and its owner sets a password through an emailed code (or signs
  // in with Google/Discord/GitHub).
  async function fileJoinRequest(team: any, email: string, name: string, inviteId: number | null, source = "invite") {
    await dbRun(
      `INSERT INTO team_join_requests (team_id, email, name, invite_id, source) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(team_id, email) WHERE status = 'pending' DO UPDATE SET name = excluded.name, invite_id = excluded.invite_id`,
      team.id, email, name, inviteId, source
    );
    const approvers = (await dbAll("SELECT id FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", team.id)) as any[];
    for (const m of approvers) {
      const perms = await getMemberPerms(m.id, team.id);
      if (perms.has("*") || perms.has("manage_members") || perms.has("invite_members")) {
        await createNotification(m.id, `${name || email} asked to join ${team.name}`, "system", { join_request: true });
      }
    }
    broadcastToTeam(team.id, { type: "join_requests_changed" });
  }

  // ---- Invite links ----
  // Admins and anyone with "Invite people" create links; members never need
  // (or see) the access code.
  const inviteView = (i: any) => ({
    id: i.id, label: i.label, hint: i.token_hint, created_at: i.created_at, created_by_name: i.created_by_name || null,
    expires_at: i.expires_at, max_uses: i.max_uses, uses: i.uses, requires_approval: !!i.requires_approval,
    revoked_at: i.revoked_at, state: inviteState(i),
  });

  app.get("/api/invites", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!(await canInvite(auth))) return res.status(403).json({ error: "You don't have permission for that" });
    // Live links first (at most 50 can exist, see below), so a working link
    // never drops off the list behind newer revoked or expired ones.
    const rows = (await dbAll(
      `SELECT i.*, m.name AS created_by_name FROM team_invites i LEFT JOIN members m ON m.id = i.created_by
        WHERE i.team_id = ?
        ORDER BY (i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?) AND (i.max_uses IS NULL OR i.uses < i.max_uses)) DESC, i.id DESC
        LIMIT 100`, auth.teamId, new Date().toISOString()
    )) as any[];
    res.json(rows.map(inviteView));
  });

  app.post("/api/invites", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!(await canInvite(auth))) return res.status(403).json({ error: "You don't have permission for that" });
    const opts = parseInviteOptions(req.body);
    if ("error" in opts) return res.status(400).json({ error: opts.error });
    // Only links that still work count (used-up links can't be seen or revoked).
    const live = (await dbGet(
      `SELECT COUNT(*) AS n FROM team_invites
        WHERE team_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) AND (max_uses IS NULL OR uses < max_uses)`,
      auth.teamId, new Date().toISOString()
    )) as any;
    if ((live?.n || 0) >= 50) return res.status(400).json({ error: "This workspace has 50 active links — turn some off first" });
    const token = newInviteToken();
    const info = (await dbRun(
      "INSERT INTO team_invites (team_id, token_hash, token_hint, label, created_by, expires_at, max_uses, requires_approval) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      auth.teamId, hashInviteToken(token), inviteHint(token), opts.label, auth.memberId, opts.expiresAt, opts.maxUses, opts.requiresApproval ? 1 : 0
    )) as any;
    const row = await dbGet(
      "SELECT i.*, m.name AS created_by_name FROM team_invites i LEFT JOIN members m ON m.id = i.created_by WHERE i.id = ?",
      info.lastInsertRowid
    );
    // The full link is only returned now; afterwards only its last 4 characters.
    res.json({ invite: inviteView(row), token, url: appUrl(`/join/${token}`) });
  });

  app.delete("/api/invites/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!(await canInvite(auth))) return res.status(403).json({ error: "You don't have permission for that" });
    const r = (await dbRun(
      "UPDATE team_invites SET revoked_at = datetime('now') WHERE id = ? AND team_id = ? AND revoked_at IS NULL",
      Number(req.params.id) || 0, auth.teamId
    )) as any;
    if (!Number(r?.changes ?? r?.rowsAffected ?? 0)) return res.status(404).json({ error: "That link was not found" });
    res.json({ ok: true });
  });

  // Public: what a link leads to, so the join page can say "Join <team>".
  // Reveals only the team's name and number.
  app.get("/api/invites/preview/:token", async (req, res) => {
    const inv = await inviteByToken(req.params.token);
    if (!inv) return res.status(404).json({ error: "That invite link isn't valid — ask your team for a new one" });
    const state = inviteState(inv);
    res.json({
      team: { name: inv.team_name, number: inv.ftc_team_number || inv.team_number || null },
      requires_approval: !!inv.requires_approval,
      state,
      message: state === "active" ? null : INVITE_STATE_MESSAGE[state],
    });
  });

  // Signed in (or teamless): use a link.
  app.post("/api/invites/accept", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const email = await authEmail(auth);
    if (!email) return res.status(401).json({ error: "Not signed in" });
    const inv = await inviteByToken(req.body?.token);
    if (!inv) return res.status(404).json({ error: "That invite link isn't valid — ask your team for a new one" });
    const team = (await dbGet("SELECT * FROM teams WHERE id = ?", inv.team_id)) as any;
    if (!team) return res.status(404).json({ error: "That workspace no longer exists" });
    const already = (await dbGet(
      "SELECT id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, team.id
    )) as any;
    // Already in: just switch there (costs no use, works on a dead link too).
    if (already) return joinAndRespond(req, res, email, team);
    const state = inviteState(inv);
    if (state !== "active") return res.status(400).json({ error: INVITE_STATE_MESSAGE[state] });
    if (inv.requires_approval) {
      const pending = (await dbGet(
        "SELECT id FROM team_join_requests WHERE team_id = ? AND email = ? AND status = 'pending'", team.id, email
      )) as any;
      if (!pending && !(await consumeInvite(inv))) return res.status(400).json({ error: INVITE_STATE_MESSAGE.used_up });
      const me = (await dbGet("SELECT name FROM members WHERE email = ? ORDER BY id DESC LIMIT 1", email)) as any;
      await fileJoinRequest(team, email, me?.name || email.split("@")[0], inv.id);
      return res.json({ pendingApproval: true, team: { id: team.id, name: team.name } });
    }
    if (!(await consumeInvite(inv))) return res.status(400).json({ error: INVITE_STATE_MESSAGE.used_up });
    await joinAndRespond(req, res, email, team);
  });

  // ---- Join requests (approval links) ----
  app.get("/api/join-requests", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!(await canInvite(auth))) return res.status(403).json({ error: "You don't have permission for that" });
    const rows = (await dbAll(
      `SELECT id, email, name, source, created_at FROM team_join_requests WHERE team_id = ? AND (status = 'pending' OR (status = 'deciding' AND decided_at < datetime('now', '-5 minutes'))) ORDER BY id`,
      auth.teamId
    )) as any[];
    res.json(rows);
  });

  app.post("/api/join-requests/:id/:decision", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!(await canInvite(auth))) return res.status(403).json({ error: "You don't have permission for that" });
    const decision = req.params.decision;
    if (decision !== "approve" && decision !== "deny") return res.status(400).json({ error: "Approve or deny" });
    const reqRow = (await dbGet(
      `SELECT * FROM team_join_requests WHERE id = ? AND team_id = ? AND (status = 'pending' OR (status = 'deciding' AND decided_at < datetime('now', '-5 minutes')))`, Number(req.params.id) || 0, auth.teamId
    )) as any;
    if (!reqRow) return res.status(404).json({ error: "That request was already handled" });
    // Claim it first ('deciding') so two approvers can't both act on it. A
    // claim abandoned by a crash frees itself after 5 minutes.
    const claimed = (await dbRun(
      `UPDATE team_join_requests SET status = 'deciding', decided_by = ?, decided_at = datetime('now')
        WHERE id = ? AND (status = 'pending' OR (status = 'deciding' AND decided_at < datetime('now', '-5 minutes')))`,
      auth.memberId, reqRow.id
    )) as any;
    if (!Number(claimed?.changes ?? claimed?.rowsAffected ?? 0)) return res.status(404).json({ error: "That request was already handled" });
    const team = (await dbGet("SELECT * FROM teams WHERE id = ?", auth.teamId)) as any;
    if (decision === "approve") {
      let added: { row: any; joined: boolean };
      try {
        const hasAccount = (await dbGet("SELECT id FROM members WHERE email = ? LIMIT 1", reqRow.email)) as any;
        added = await addMembership(
          reqRow.email, team,
          hasAccount ? undefined : { name: reqRow.name || reqRow.email.split("@")[0], passwordHash: null }
        );
        if (!hasAccount) await ensureOnboardingRow(reqRow.email);
      } catch (e) {
        // Nothing lost: the request (and any saved password) goes back to pending.
        await dbRun("UPDATE team_join_requests SET status = 'pending', decided_by = NULL, decided_at = NULL WHERE id = ?", reqRow.id).catch(() => {});
        console.error("join request approval failed:", e);
        return res.status(500).json({ error: "Could not add them — try again" });
      }
      await dbRun(
        "UPDATE team_join_requests SET status = 'approved', decided_at = datetime('now'), password_hash = NULL WHERE id = ?", reqRow.id
      );
      const { row, joined } = added;
      if (joined) broadcastToTeam(team.id, { type: "member_joined", member: sanitizeMember(row) });
      const html = emailTemplate({
        preheader: `You're in ${team.name} on Control Point`,
        title: `You're in ${team.name}`,
        intro: `Your request to join <strong>${escapeHtml(team.name)}</strong> was approved. Sign in with this email — if you haven't set a password yet, we'll email you a code to set one (or use Google, Discord or GitHub).`,
        cta: { label: "Open Control Point", href: appUrl("/") },
        footnote: "You received this because you asked to join this workspace.",
      });
      sendEmail(reqRow.email, `You're in ${team.name}`, html).catch((e) => console.error("approval email failed:", e));
    } else {
      await dbRun(
        "UPDATE team_join_requests SET status = 'denied', decided_at = datetime('now'), password_hash = NULL WHERE id = ?", reqRow.id
      );
    }
    broadcastToTeam(team.id, { type: "join_requests_changed" });
    res.json({ ok: true });
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
        const sessionId = await rebindSession(req, other.id);
        switched = { sessionId, user: sanitizeMember({ ...(other as any), teams: await userTeams(email) }), team: await teamForClient(await dbGet("SELECT * FROM teams WHERE id = ?", other.team_id), email) };
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
    const { name, number, accent_color, primary_color, text_color, ftc_team_number, default_interface_mode, timezone } = req.body;
    // Partial update: only touch columns the caller actually sent, so saving the
    // FTC team number alone can't wipe the workspace name or colors.
    const sets: string[] = [];
    const vals: any[] = [];
    if (name !== undefined) { sets.push("name = ?"); vals.push(name); }
    if (number !== undefined) { sets.push("number = ?"); vals.push(number); }
    if (accent_color !== undefined) { sets.push("accent_color = ?"); vals.push(cleanHex(accent_color)); }
    if (primary_color !== undefined) { sets.push("primary_color = ?"); vals.push(cleanHex(primary_color)); }
    if (text_color !== undefined) { sets.push("text_color = ?"); vals.push(cleanHex(text_color)); }
    // A new FTC number is claimed in the same statement as the other fields,
    // after every field has been validated (all or nothing).
    let claimFtc: number | null = null;
    if (ftc_team_number !== undefined) {
      const ftcNum = ftc_team_number === null || ftc_team_number === ''
        ? null
        : parseInt(String(ftc_team_number), 10);
      if (ftcNum !== null && (!Number.isInteger(ftcNum) || ftcNum <= 0)) {
        return res.status(400).json({ error: "FTC team number must be a positive integer" });
      }
      // One workspace per FTC number. Workspaces that already shared a number
      // before this rule keep it (nothing is changed automatically).
      const current = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", auth.teamId)) as any;
      if (ftcNum !== null && Number(current?.ftc_team_number) !== ftcNum) claimFtc = ftcNum;
      sets.push("ftc_team_number = ?"); vals.push(ftcNum);
    }
    if (default_interface_mode !== undefined) {
      if (default_interface_mode !== null && !INTERFACE_MODES.includes(default_interface_mode)) {
        return res.status(400).json({ error: "Invalid interface mode" });
      }
      sets.push("default_interface_mode = ?"); vals.push(default_interface_mode);
    }
    if (timezone !== undefined) {
      // IANA zone (e.g. "America/Chicago"); null/"" clears it (browser zone is used).
      let tz: string | null = null;
      if (timezone !== null && timezone !== "") {
        tz = String(timezone).slice(0, 64);
        if (resolveTimeZone(tz) !== tz) return res.status(400).json({ error: "Unknown timezone" });
      }
      sets.push("timezone = ?"); vals.push(tz);
    }
    if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });
    vals.push(req.params.id);
    if (claimFtc !== null) {
      // Check-and-set in one statement so two workspaces can't claim it at once.
      const r = (await dbRun(
        `UPDATE teams SET ${sets.join(", ")} WHERE id = ? AND NOT EXISTS (SELECT 1 FROM teams WHERE ftc_team_number = ? AND id != ?)`,
        ...vals, claimFtc, auth.teamId
      )) as any;
      if (!Number(r?.changes ?? r?.rowsAffected ?? 0)) {
        return res.status(409).json({ error: `Team #${claimFtc} is already connected to another workspace on Control Point.` });
      }
    } else {
      (await dbRun(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`, ...vals));
    }
    res.json({ success: true });
  });

  // Delete a workspace. The account's FINAL team cannot be deleted — an account
  // must always belong to at least one team.
  // Workspace-scoped rows that point at a member without ON DELETE CASCADE.
  // A member referenced by any of them outside the workspace being deleted
  // must not be hard-deleted (see deleteWorkspace). Each `?` is that workspace.
  const MEMBER_REFS: [table: string, column: string][] = [
    ["messages", "sender_id"], ["tasks", "assigned_to"], ["attendance", "member_id"], ["feedback", "user_id"],
    ["resources", "created_by"], ["chat_channels", "created_by"], ["inventory", "assigned_to"],
    ["code_files", "created_by"], ["code_commits", "author_id"], ["bruno_chats", "member_id"],
    ["checkin_sessions", "created_by"], ["voice_channels", "created_by"], ["call_sessions", "created_by"],
  ];
  const REFERENCED_ELSEWHERE = [
    ...MEMBER_REFS.map(([t, c]) => `id IN (SELECT ${c} FROM ${t} WHERE ${c} IS NOT NULL AND COALESCE(team_id, -1) != ?)`),
    "id IN (SELECT p.member_id FROM call_participants p JOIN call_sessions cs ON cs.id = p.session_id WHERE cs.team_id != ?)",
    "id IN (SELECT i.inviter_id FROM call_invites i JOIN call_sessions cs ON cs.id = i.session_id WHERE cs.team_id != ?)",
    "id IN (SELECT i.invitee_id FROM call_invites i JOIN call_sessions cs ON cs.id = i.session_id WHERE cs.team_id != ?)",
  ].join(" OR ");
  const REFERENCED_ELSEWHERE_PARAMS = MEMBER_REFS.length + 3;

  /**
   * Deletes a workspace and everything in it (one batch). `keepMemberId`: a
   * membership row kept as an inactive anchor (team_id nulled) so its
   * account stays signed in teamless; `keepSessionId`: a session that
   * survives. Other members' sessions end and their live sockets close.
   */
  async function deleteWorkspace(teamId: number, { keepMemberId, keepSessionId }: { keepMemberId: number | null; keepSessionId: string }) {
    const memberIds = ((await dbAll("SELECT id FROM members WHERE team_id = ?", teamId)) as any[]).map((r) => r.id);
    const inMembers = memberIds.length ? `IN (${memberIds.map(() => "?").join(",")})` : "IN (NULL)";
    const stmts: { sql: string; args?: any[] }[] = [
      { sql: "DELETE FROM bruno_messages WHERE chat_id IN (SELECT id FROM bruno_chats WHERE team_id = ?)", args: [teamId] },
      { sql: "DELETE FROM bruno_chats WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM bruno_memories WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM code_files WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM code_commits WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM code_repos WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM events WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM calendar_feeds WHERE team_id = ?", args: [teamId] },
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
      { sql: "DELETE FROM notebook_mentions WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM notebook_comments WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM notebook_threads WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM notebook_links WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM notebook_versions WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM notebook_file_refs WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM notebook_files WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM notebook_pages WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM notebook_sections WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM notebook_books WHERE team_id = ?", args: [teamId] },
      // Voice tables (FKs to teams have no CASCADE — must clean manually)
      { sql: "DELETE FROM call_sessions WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM voice_channel_role_perms WHERE channel_id IN (SELECT id FROM voice_channels WHERE team_id = ?)", args: [teamId] },
      { sql: "DELETE FROM voice_channels WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM team_voice_settings WHERE team_id = ?", args: [teamId] },
      // Messaging + newer tables missing from the original batch
      { sql: "DELETE FROM chat_channels WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM channel_categories WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM custom_emoji WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM resources WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM team_invites WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM team_join_requests WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM scouting_entries WHERE team_id = ?", args: [teamId] },
      // Rows that point at a member (created_by / author) without ON DELETE
      // CASCADE: they must go before the members below, or the foreign key
      // refuses the whole batch and the workspace can never be deleted.
      // Children first: review comments -> reviews -> snapshots/parts -> docs.
      { sql: "DELETE FROM cad_review_comments WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM cad_reviews WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM cad_snapshots WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM cad_parts WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM cad_docs WHERE team_id = ?", args: [teamId] },
      { sql: "DELETE FROM checkin_sessions WHERE team_id = ?", args: [teamId] },
      // References teams without a cascade.
      { sql: "DELETE FROM call_moderation_log WHERE team_id = ?", args: [teamId] },
      // No foreign key, but they belong to this workspace.
      { sql: "DELETE FROM access_code_events WHERE team_id = ?", args: [teamId] },
      { sql: `DELETE FROM ai_warnings WHERE team_id = ? OR member_id ${inMembers}`, args: [teamId, ...memberIds] },
      { sql: `DELETE FROM notifications WHERE user_id ${inMembers}`, args: memberIds },
      // Keep the caller's session alive so they stay signed in (teamless when
      // this was their last team); every other session on the team is dropped.
      { sql: `DELETE FROM sessions WHERE member_id ${inMembers} AND id != ?`, args: [...memberIds, keepSessionId] },
      { sql: `DELETE FROM stream_sessions WHERE member_id ${inMembers}`, args: memberIds },
      { sql: `DELETE FROM bruno_nudges_sent WHERE member_id ${inMembers}`, args: memberIds },
      { sql: `DELETE FROM member_roles WHERE member_id ${inMembers}`, args: memberIds },
      { sql: "DELETE FROM roles WHERE team_id = ?", args: [teamId] },
      // A member moved here from another workspace can still be referenced
      // there (their old messages, tasks, attendance...): deleting the row
      // would break those foreign keys and fail the whole batch. Such rows
      // stay as inactive, teamless anchors instead.
      { sql: `UPDATE members SET is_active = 0, team_id = NULL WHERE team_id = ? AND id != ? AND (${REFERENCED_ELSEWHERE})`, args: [teamId, keepMemberId ?? -1, ...Array(REFERENCED_ELSEWHERE_PARAMS).fill(teamId)] },
      // Hard-delete every membership in the team except the caller's own row,
      // which stays as an inactive anchor (team_id nulled so the team delete
      // passes FKs) so their session/email survive teamless.
      { sql: "DELETE FROM members WHERE team_id = ? AND id != ?", args: [teamId, keepMemberId ?? -1] },
      { sql: "UPDATE members SET is_active = 0, team_id = NULL WHERE id = ?", args: [keepMemberId ?? -1] },
      { sql: "DELETE FROM teams WHERE id = ?", args: [teamId] },
    ];
    await dbBatch(stmts);
    for (const id of memberIds) if (id !== keepMemberId) disconnectMember(teamId, id);
  }

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
    const callerToken = getSessionId(req);
    const currentSessionId = callerToken ? sessionKey(callerToken) : "";
    // The caller's membership row in the team being deleted becomes an
    // inactive ghost anchor (team_id nulled so the team delete passes FKs) —
    // rows in their other teams are untouched.
    const myRowInTeam = (await dbGet(
      "SELECT id FROM members WHERE email = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", email, teamId
    )) as any;
    await deleteWorkspace(teamId, { keepMemberId: myRowInTeam?.id ?? null, keepSessionId: currentSessionId });
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
          const sessionId = await rebindSession(req, otherRow.id);
          switched = {
            sessionId,
            user: otherRow,
            team: await teamForClient(await dbGet("SELECT * FROM teams WHERE id = ?", other.team_id), other.email),
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
    await dbRun("INSERT INTO access_code_events (team_id, member_id, action, created_at) VALUES (?, ?, 'regenerate', ?)",
      auth.teamId, auth.memberId, new Date().toISOString());
    res.json({ access_code: code });
  });

  // Access code, masked by default (audit M-2): a manager of the workspace
  // reveals it here, and every reveal is logged with who and when.
  const codeManager = async (req: any, res: any) => {
    const auth = await requireAuth(req, res);
    if (!auth) return null;
    const teamId = parseInt(req.params.id, 10);
    const email = auth.teamless ? (auth.email || "")
      : (((await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any)?.email || "");
    if (!Number.isFinite(teamId) || !email || !(await hasPermInTeam(email, teamId, "manage_members"))) {
      res.status(403).json({ error: "Only people who manage this workspace can see its access code" });
      return null;
    }
    const me = (await dbGet("SELECT id FROM members WHERE LOWER(email) = LOWER(?) AND team_id = ? AND COALESCE(is_active, 1) = 1", email, teamId)) as any;
    return { teamId, memberId: me?.id ?? null };
  };
  app.post("/api/teams/:id/access-code/reveal", async (req, res) => {
    const who = await codeManager(req, res);
    if (!who) return;
    const team = (await dbGet("SELECT access_code FROM teams WHERE id = ?", who.teamId)) as any;
    if (!team) return res.status(404).json({ error: "Workspace not found" });
    await dbRun("INSERT INTO access_code_events (team_id, member_id, action, created_at) VALUES (?, ?, 'view', ?)",
      who.teamId, who.memberId, new Date().toISOString());
    res.json({ access_code: team.access_code });
  });
  app.get("/api/teams/:id/access-code/events", async (req, res) => {
    const who = await codeManager(req, res);
    if (!who) return;
    const rows = await dbAll(
      `SELECT e.action, e.created_at, m.name AS member_name FROM access_code_events e
       LEFT JOIN members m ON m.id = e.member_id
       WHERE e.team_id = ? ORDER BY e.id DESC LIMIT 20`, who.teamId);
    res.json(rows);
  });

  // --- FTC integration (ftcscout.org, community mirror of official FIRST data) ---
  // Overridable for integration tests (a local stand-in for FTC Scout).
  const FTC_SCOUT_URL = process.env.FTC_SCOUT_URL || "https://api.ftcscout.org/graphql";
  // Memory cache with database write-through: the last good copy of each
  // payload survives restarts and is served while the feeds are down.
  // Search results are per keystroke and short-lived: memory only.
  const ftcCache = new DurableFtcCache().attach({ dbGet, dbRun }, { persist: (key) => !key.startsWith("scoutsearch:") });
  // Saved copies older than 30 days are of no use as a fallback.
  setInterval(() => { void ftcCache.prune(30 * 24 * 3600 * 1000); }, 24 * 3600 * 1000).unref();
  void ftcCache.prune(30 * 24 * 3600 * 1000);
  const FTC_CACHE_TTL = 10 * 60 * 1000;
  // Within this age an expired entry is served at once while a refresh runs
  // in the background (venue Wi-Fi shouldn't wait on two upstream APIs).
  const FTC_SWR_MAX = 30 * 60 * 1000;
  /** Cached entry from memory, else the persisted last-good copy. */
  const ftcCached = async (key: string) => ftcCache.get(key) ?? (await ftcCache.load(key));

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
      // Keep the status: callers treat 400/404 (query rejected, e.g. an
      // unsupported season) as "no data" and everything else as an outage.
      if (!res.ok) {
        // 400/404 = "no such data" (not an outage); anything else counts against health.
        // A 400/404 is a real answer ("no such data"): the source is up.
        if (res.status === 400 || res.status === 404) recordSourceOk("ftc-scout");
        else recordSourceFailure("ftc-scout", `HTTP ${res.status}`);
        throw Object.assign(new Error(`FTC Scout responded with HTTP ${res.status}`), { status: res.status });
      }
      const json = await res.json();
      // GraphQL reports failures as HTTP 200 + `errors`. With no data at all it
      // is a failed request (counts against health); a partial answer with
      // data is still contact with a working source.
      if (Array.isArray(json?.errors) && json.errors.length && !json?.data) {
        recordSourceFailure("ftc-scout", `GraphQL error: ${String(json.errors[0]?.message || "unknown").slice(0, 120)}`);
      } else {
        recordSourceOk("ftc-scout");
      }
      return json;
    } catch (e: any) {
      if (e?.status === undefined) recordSourceFailure("ftc-scout", e?.name === "AbortError" ? "timeout" : "network error");
      throw e;
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
      res.json({ number: team.number, name: team.name, schoolName: team.schoolName || null, claimed: !!(await ftcWorkspace(team.number)) });
    } catch (e: any) {
      res.status(502).json({ error: "Could not reach FTC Scout — try again in a moment" });
    }
  });

  // Small weather widget ("72° · Sunny") for the team's town, from its FTC
  // record. Cached 15 minutes per place (server/weather.ts). Teams without a
  // connected FTC number, or a lookup that fails, simply get no widget.
  app.get("/api/weather", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (auth.teamless || !auth.teamId) return res.json({ available: false });
    try {
      const team = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", auth.teamId)) as any;
      const number = Number(team?.ftc_team_number);
      if (!number) return res.json({ available: false });
      const t = await lookupFtcTeam(number);
      const w = t?.location ? await currentWeather(t.location) : null;
      if (!w) return res.json({ available: false });
      res.json({ available: true, ...w });
    } catch {
      res.json({ available: false });
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
          number name schoolName rookieYear activeSeasons sponsors
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
        activeTeamsCount(season: $season)
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
      sponsors: (t.sponsors || []).filter(Boolean),
      city: t.location?.city, state: t.location?.state, country: t.location?.country,
      rookieYear: t.rookieYear,
      seasons: [...new Set((t.activeSeasons || []).filter((s: number) => s >= 2022 && s <= 2026))].sort((a: number, b: number) => b - a),
      season,
      totalTeams: data?.data?.activeTeamsCount ?? null,
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

  // Which FTC feed is up — so error states can say what is actually wrong.
  app.get("/api/ftc/health", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    res.json({ configured: { firstEvents: isFirstEventsConfigured(), ftcScout: true }, sources: sourceHealth() });
  });

  app.get("/api/ftc/team", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseInt(String(req.query.season || currentFtcSeason()), 10);
    if (!SUPPORTED_SEASONS.includes(season)) {
      return res.status(400).json({ error: "Season data is available for 2022–2026" });
    }
    const team = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", auth.teamId)) as any;
    const number = team?.ftc_team_number;
    if (!number) return res.status(404).json({ error: "No FTC team connected — set your team number in Settings" });

    const cacheKey = `ftc:${number}:${season}`;
    const cached = await ftcCached(cacheKey);
    if (cached && ftcCacheFresh(cached)) return res.json(ftcCachedBody(cached));
    const refresh = () => sharedFetch(cacheKey, async () => {
      const payload = await getTeamData(number, season);
      if (payload) ftcCache.set(cacheKey, { at: Date.now(), data: payload });
      return payload;
    });
    if (cached && Date.now() - cached.at < FTC_SWR_MAX) {
      refresh().catch(() => { /* keep serving the cached copy */ });
      return res.json(ftcCachedBody(cached, true));
    }

    try {
      const payload = await refresh();
      // Both sources answered "no record" — a genuine miss, not an outage.
      if (!payload) return res.status(404).json({ error: "No record of that team number this season" });
      res.json({ ...payload.data, source: payload.source, fetchedAt: payload.fetchedAt });
    } catch (e: any) {
      // Both sources down: serve the last good copy if we have one.
      if (cached) return res.json(ftcCachedBody(cached, true));
      res.status(502).json({ error: "Could not reach FTC data sources — try again in a moment" });
    }
  });

  // Single event detail: venue info + full match list (quals + playoffs) with
  // alliance breakdowns, for the connected team's event history drill-down.
  async function getFtcEventPayload(number: number, season: number, code: string): Promise<any> {
    const data = await ftcQuery(
      `query EventDetail($number: Int!, $season: Int!, $code: String!) {
        eventByCode(season: $season, code: $code) {
          name start end type timezone address
          location { city state country }
          teams { teamNumber team { name } }
          matches {
            matchNum tournamentLevel series description hasBeenPlayed
            scores {
              __typename
              ... on MatchScores2022 { red { totalPoints } blue { totalPoints } }
              ... on MatchScores2023 { red { totalPoints } blue { totalPoints } }
              ... on MatchScores2024 { red { totalPoints } blue { totalPoints } }
              ... on MatchScores2025 { red { totalPoints } blue { totalPoints } }
            }
            teams { teamNumber station }
          }
        }
        teamByNumber(number: $number) {
          events(season: $season) {
            event { code }
            stats { __typename ... on TeamEventStats${season} { rank wins losses ties opr { totalPointsNp } } }
            awards { type }
          }
        }
      }`,
      { number, season, code }
    );
    const ev = data?.data?.eventByCode;
    if (!ev) return null;
    // Team name lookup for alliance display
    const names: Record<number, string> = {};
    for (const t of ev.teams || []) {
      if (t?.teamNumber) names[t.teamNumber] = t.team?.name || `Team ${t.teamNumber}`;
    }
    const nameOf = (n: number) => names[n] || `Team ${n}`;
    // FTC Scout orders match.teams as red1, red2, blue1, blue2
    const matches = (ev.matches || [])
      .map((m: any) => {
        const teams = (m.teams || []).map((t: any) => ({ number: t.teamNumber, name: nameOf(t.teamNumber) }));
        const red = teams.slice(0, 2);
        const blue = teams.slice(2, 4);
        const redScore = m.scores?.red?.totalPoints ?? null;
        const blueScore = m.scores?.blue?.totalPoints ?? null;
        const onRed = red.some((t: any) => t.number === number);
        const onBlue = blue.some((t: any) => t.number === number);
        let result: "win" | "loss" | "tie" | null = null;
        if (m.hasBeenPlayed && redScore != null && blueScore != null && (onRed || onBlue)) {
          const mine = onRed ? redScore : blueScore;
          const theirs = onRed ? blueScore : redScore;
          result = mine > theirs ? "win" : mine < theirs ? "loss" : "tie";
        }
        return {
          num: m.matchNum,
          label: m.description || `Match ${m.matchNum}`,
          level: m.tournamentLevel || null, // "Quals" | "Semis" | "Finals"
          series: m.series ?? null,
          played: !!m.hasBeenPlayed,
          red, blue, redScore, blueScore, result,
        };
      })
      .sort((a: any, b: any) => {
        // Quals first (by match num), then playoffs (by match num)
        const rank = (l: string | null) => (l === "Quals" ? 0 : 1);
        return rank(a.level) - rank(b.level) || a.num - b.num;
      });
    // The connected team's stats + awards at this event
    const teamEvents = data?.data?.teamByNumber?.events || [];
    const mine = teamEvents.find((e: any) => e?.event?.code === code);
    return {
      code,
      season,
      name: ev.name,
      start: ev.start ? String(ev.start).slice(0, 10) : null,
      end: ev.end ? String(ev.end).slice(0, 10) : null,
      type: ev.type || null,
      venue: ev.address || null,
      city: ev.location?.city || null, state: ev.location?.state || null, country: ev.location?.country || null,
      timezone: ev.timezone || null,
      rank: mine?.stats?.rank ?? null,
      wins: mine?.stats?.wins ?? null, losses: mine?.stats?.losses ?? null, ties: mine?.stats?.ties ?? null,
      oprNp: mine?.stats?.opr?.totalPointsNp != null ? Math.round(mine.stats.opr.totalPointsNp * 10) / 10 : null,
      awards: (mine?.awards || []).map((a: any) => a.type).filter(Boolean),
      teams: (ev.teams || [])
        .filter((t: any) => t?.teamNumber)
        .map((t: any) => ({ teamNumber: t.teamNumber, name: t.team?.name || `Team ${t.teamNumber}` })),
      matches,
      qualsCount: matches.filter((m: any) => m.level === "Quals").length,
      playoffsCount: matches.filter((m: any) => m.level !== "Quals").length,
    };
  }

  // -------------------------------------------------------------------------
  // FTC data-source layer: FIRST Events (primary) -> FTC Scout (fallback) ->
  // server cache. Every result carries source + fetchedAt metadata so the UI
  // and Bruno can say where the data came from and how fresh it is.
  // -------------------------------------------------------------------------

  type FtcSource = "first-events" | "ftc-scout" | "cache";

  interface FtcSourced<T> {
    source: FtcSource;
    fetchedAt: string; // ISO timestamp of when the data was fetched
    data: T;
    /** Some FIRST Events sub-requests failed; don't cache for the full TTL. */
    partial?: boolean;
  }

  /** Every data source errored (vs. answering "no such team/event"). */
  class FtcUnavailableError extends Error {}
  /**
   * FTC Scout said the data doesn't exist: 400 (query rejected — e.g. a
   * season it doesn't support yet) or 404. Anything else (401/403/429/5xx,
   * network, timeout) is "temporarily unavailable", never "no data".
   */
  function isFtcScoutClientError(e: any): boolean {
    return e?.status === 400 || e?.status === 404;
  }

  const SUPPORTED_SEASONS = [2022, 2023, 2024, 2025, 2026];
  // Last season list seen per team, so the picker keeps historical seasons
  // even when FTC Scout (the only source of activeSeasons) is unavailable.
  const ftcSeasonsSeen = new Map<number, number[]>();

  function currentFtcSeason(): number {
    const now = new Date();
    const s = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return Math.min(Math.max(s, SUPPORTED_SEASONS[0]), SUPPORTED_SEASONS[SUPPORTED_SEASONS.length - 1]);
  }

  /**
   * Team payload merged from both sources:
   *  - identity (name/school/location/rookie/sponsors): FIRST Events first
   *  - OPR + activeSeasons: FTC Scout only (FIRST Events has neither)
   *  - events: merged by event code, deduped
   * Returns null when both sources answered "no record"; throws
   * FtcUnavailableError when neither could be reached.
   */
  async function getTeamData(number: number, season: number): Promise<FtcSourced<any> | null> {
    const fetchedAt = new Date().toISOString();
    let firstFailed = false;
    let scoutFailed = false;

    // Both sources in parallel (they used to run one after the other, so a
    // slow FIRST response delayed the FTC Scout fallback by up to ~20 s).
    const configured = isFirstEventsConfigured();
    const [teamRes, eventsRes, scoutRes] = await Promise.allSettled([
      configured ? getFirstEventsTeam(season, number) : Promise.resolve(null),
      configured ? getFirstEventsTeamEvents(season, number) : Promise.resolve([] as any[]),
      getFtcTeamPayload(number, season),
    ]);

    let firstTeam: any = null;
    let firstEvents: any[] = [];
    let firstEventsMissing = false;
    if (teamRes.status === "fulfilled") {
      firstTeam = teamRes.value;
      // A failed events lookup keeps the team: its event list is just partial.
      if (eventsRes.status === "fulfilled") firstEvents = firstTeam ? eventsRes.value : [];
      else if (firstTeam) {
        firstEventsMissing = true;
        console.error(`[ftc] FIRST Events team events failed for ${number}/${season}: ${(eventsRes.reason as any)?.message || eventsRes.reason}`);
      }
    } else {
      firstFailed = true;
      console.error(`[ftc] FIRST Events team lookup failed for ${number}/${season}: ${(teamRes.reason as any)?.message || teamRes.reason}`);
    }

    let scout: any = null;
    if (scoutRes.status === "fulfilled") {
      scout = scoutRes.value;
    } else if (!isFtcScoutClientError(scoutRes.reason)) {
      // 400/404 = FTC Scout has no data for this request (e.g. unsupported
      // season); rate limits, auth errors, 5xx, network = unreachable.
      scoutFailed = true;
      console.error(`[ftc] FTC Scout team lookup failed for ${number}/${season}: ${(scoutRes.reason as any)?.message || scoutRes.reason}`);
    }

    if (!firstTeam && !scout) {
      if (firstFailed || scoutFailed) throw new FtcUnavailableError("FTC data sources unreachable");
      return null;
    }

    // Merge events by code: FIRST Events gives names/dates/types, FTC Scout
    // gives rank/wins/losses/ties/awards. Dedupe by code (case-insensitive).
    const byCode = new Map<string, any>();
    for (const e of firstEvents) {
      byCode.set(e.eventCode.toLowerCase(), {
        code: e.eventCode,
        name: e.name,
        date: e.dateStart,
        type: e.eventType,
        rank: null, wins: null, losses: null, ties: null, awards: [],
      });
    }
    for (const e of scout?.events || []) {
      const key = String(e.code || "").toLowerCase();
      if (!key) continue;
      const existing = byCode.get(key);
      if (existing) {
        existing.rank = e.rank ?? existing.rank;
        existing.wins = e.wins ?? existing.wins;
        existing.losses = e.losses ?? existing.losses;
        existing.ties = e.ties ?? existing.ties;
        existing.awards = e.awards?.length ? e.awards : existing.awards;
      } else {
        byCode.set(key, { ...e });
      }
    }
    const events = [...byCode.values()].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    // Season picker: FTC Scout's activeSeasons, else the last list we saw for
    // this team, else every supported season since the rookie year — so a
    // Scout outage or a season Scout doesn't know yet never hides history.
    if (scout?.seasons?.length) ftcSeasonsSeen.set(number, scout.seasons);
    const rookie = firstTeam?.rookieYear ?? scout?.rookieYear ?? null;
    const base: number[] = scout?.seasons?.length
      ? scout.seasons
      : ftcSeasonsSeen.get(number) || SUPPORTED_SEASONS.filter((s) => !rookie || s >= rookie);
    const seasonSet = new Set<number>(base);
    seasonSet.add(currentFtcSeason());
    seasonSet.add(season); // the requested season is always viewable
    const seasons = [...seasonSet].sort((a, b) => b - a);

    const source: FtcSource = firstTeam ? "first-events" : "ftc-scout";
    const data = {
      number,
      name: firstTeam?.name || scout?.name || `Team ${number}`,
      school: firstTeam?.schoolName || scout?.school || null,
      sponsors: firstTeam?.sponsors?.length ? firstTeam.sponsors : scout?.sponsors || [],
      city: firstTeam?.city || scout?.city || null,
      state: firstTeam?.state || scout?.state || null,
      country: firstTeam?.country || scout?.country || null,
      rookieYear: rookie,
      seasons,
      season,
      totalTeams: scout?.totalTeams ?? null,
      opr: scout?.opr || { tot: null, auto: null, dc: null, eg: null },
      oprSource: scout?.opr?.tot ? "ftc-scout" : null,
      events,
    };
    return { source, fetchedAt, data, partial: firstFailed || scoutFailed || firstEventsMissing };
  }

  /**
   * Event detail merged from both sources:
   *  - FIRST Events: venue, teams, rankings, matches, alliances (live)
   *  - FTC Scout: event OPR + awards (FIRST has neither), and the fallback for
   *    any piece FIRST couldn't supply (teams, matches) or the whole event.
   * Returns null when neither source knows the event; throws
   * FtcUnavailableError when neither could be reached.
   */
  async function getEventData(number: number, season: number, code: string): Promise<FtcSourced<any> | null> {
    const fetchedAt = new Date().toISOString();
    let firstFailed = false;
    let scoutFailed = false;

    // FTC Scout runs in parallel either way: it fills gaps in FIRST's data.
    const scoutP = getFtcEventPayload(number, season, code).catch((e: any) => {
      if (!isFtcScoutClientError(e)) scoutFailed = true;
      return null;
    });

    if (isFirstEventsConfigured()) {
      try {
        const ev = await getFirstEventsEvent(season, code);
        if (ev) {
          const settled = await Promise.allSettled([
            getFirstEventsEventTeams(season, code),
            getFirstEventsRankings(season, code),
            getFirstEventsSchedule(season, code, "qual"),
            getFirstEventsSchedule(season, code, "playoff"),
            getFirstEventsMatches(season, code),
            getFirstEventsAlliances(season, code),
          ]);
          const val = <T,>(i: number, fallback: T): T =>
            settled[i].status === "fulfilled" ? ((settled[i] as PromiseFulfilledResult<any>).value as T) : fallback;
          const partial = settled.some((r) => r.status === "rejected");
          const firstTeams = val<{ teamNumber: number; name: string }[]>(0, []);
          const rankings = val<any[]>(1, []);
          const qualSched = val<any[]>(2, []);
          const playoffSched = val<any[]>(3, []);
          const results = val<any[]>(4, []);
          const alliances = val<any[]>(5, []);
          const scout: any = await scoutP;

          // Teams: FIRST's list, else FTC Scout's.
          const teams: { teamNumber: number; name: string }[] = firstTeams.length
            ? firstTeams
            : (scout?.teams || []);
          const nameOf = (n: number) => teams.find((t) => t.teamNumber === n)?.name || `Team ${n}`;
          const rankOf = (n: number) => rankings.find((r) => r.teamNumber === n) || null;

          // Prefer scored results; fall back to schedule for unplayed matches.
          // Keyed by level + series + number: playoff numbers repeat by series.
          const resultKey = new Set(results.map((m) => matchKey(m)));
          const firstMatches = [...results];
          for (const s of [...qualSched, ...playoffSched]) {
            if (!resultKey.has(matchKey(s))) firstMatches.push(s);
          }
          let matches = firstMatches
            .map((m) => {
              const onRed = m.red.teams.includes(number);
              const onBlue = m.blue.teams.includes(number);
              let result: "win" | "loss" | "tie" | null = null;
              if (m.red.score != null && m.blue.score != null && (onRed || onBlue)) {
                const mine = onRed ? m.red.score : m.blue.score;
                const theirs = onRed ? m.blue.score : m.red.score;
                result = mine > theirs ? "win" : mine < theirs ? "loss" : "tie";
              }
              return {
                num: m.matchNumber,
                label: m.description || `Match ${m.matchNumber}`,
                level: m.level === "qual" ? "Quals" : "Playoffs",
                series: m.series,
                played: m.red.score != null && m.blue.score != null,
                red: m.red.teams.map((n: number) => ({ number: n, name: nameOf(n) })),
                blue: m.blue.teams.map((n: number) => ({ number: n, name: nameOf(n) })),
                redScore: m.red.score,
                blueScore: m.blue.score,
                result,
              };
            })
            .sort((a, b) =>
              a.level !== b.level ? (a.level === "Quals" ? -1 : 1) : (a.series ?? 0) - (b.series ?? 0) || a.num - b.num
            );
          // FIRST had no match data (failed or not published) → FTC Scout's.
          if (!matches.length && scout?.matches?.length) matches = scout.matches;

          const myRank = rankOf(number);
          const data = {
            code: ev.eventCode,
            season,
            name: ev.name,
            start: ev.dateStart,
            end: ev.dateEnd,
            type: ev.eventType,
            venue: ev.venue || ev.address,
            city: ev.city, state: ev.state, country: ev.country,
            timezone: ev.timezone,
            rank: myRank?.rank ?? scout?.rank ?? null,
            wins: myRank?.wins ?? scout?.wins ?? null,
            losses: myRank?.losses ?? scout?.losses ?? null,
            ties: myRank?.ties ?? scout?.ties ?? null,
            // FIRST Events has no OPR or awards — always from FTC Scout.
            oprNp: scout?.oprNp ?? null,
            awards: scout?.awards || [],
            teams: teams.map((t) => ({ teamNumber: t.teamNumber, name: t.name })),
            rankings: rankings.map((r) => ({ ...r })),
            alliances: alliances.map((a) => ({ ...a })),
            matches,
            qualsCount: matches.filter((m: any) => m.level === "Quals").length,
            playoffsCount: matches.filter((m: any) => m.level !== "Quals").length,
          };
          return { source: "first-events" as FtcSource, fetchedAt, data, partial: partial || scoutFailed };
        }
      } catch {
        firstFailed = true;
        console.error(`[ftc] FIRST Events event lookup failed for ${code}/${season}, falling back to FTC Scout`);
      }
    }

    const scout = await scoutP;
    if (!scout) {
      if (firstFailed || scoutFailed) throw new FtcUnavailableError("FTC data sources unreachable");
      return null;
    }
    return { source: "ftc-scout" as FtcSource, fetchedAt, data: scout, partial: firstFailed };
  }

  // Partial results (a source or sub-request failed) are cached briefly so a
  // transient failure doesn't pin incomplete data for the full TTL.
  const FTC_PARTIAL_TTL = 60 * 1000;
  function ftcCacheFresh(entry: { at: number; data: any } | undefined): boolean {
    if (!entry) return false;
    const ttl = entry.data?.partial ? FTC_PARTIAL_TTL : FTC_CACHE_TTL;
    return Date.now() - entry.at < ttl;
  }
  // A cached response: `source` says it's cached, `origin` keeps where it
  // originally came from, `stale` marks one served because sources are down.
  function ftcCachedBody(entry: { at: number; data: any }, stale = false) {
    const p = entry.data;
    return { ...p.data, source: "cache", origin: p.source, fetchedAt: p.fetchedAt, cached: true, ...(stale ? { stale: true } : {}) };
  }

  app.get("/api/ftc/event", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseInt(String(req.query.season || currentFtcSeason()), 10);
    if (!SUPPORTED_SEASONS.includes(season)) {
      return res.status(400).json({ error: "Season data is available for 2022–2026" });
    }
    const code = String(req.query.code || "").trim().slice(0, 32);
    if (!code) return res.status(400).json({ error: "Missing event code" });
    const team = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", auth.teamId)) as any;
    const number = team?.ftc_team_number;
    if (!number) return res.status(404).json({ error: "No FTC team connected — set your team number in Settings" });

    const cacheKey = `ftcevent:${number}:${season}:${code}`;
    const cached = await ftcCached(cacheKey);
    if (cached && ftcCacheFresh(cached)) return res.json(ftcCachedBody(cached));

    try {
      const payload = await getEventData(number, season, code);
      if (!payload) return res.status(404).json({ error: "No record of that event" });
      ftcCache.set(cacheKey, { at: Date.now(), data: payload });
      res.json({ ...payload.data, source: payload.source, fetchedAt: payload.fetchedAt });
    } catch (e: any) {
      // Both sources down: serve the last good copy if we have one.
      if (cached) return res.json(ftcCachedBody(cached, true));
      res.status(502).json({ error: "Could not reach FTC data sources — try again in a moment" });
    }
  });

  // -------------------------------------------------------------------------
  // Scouting (Team Stats → Compete / Analyze). FIRST Events is primary for
  // teams, rankings, matches and alliances; FTC Scout supplies OPR, score
  // breakdowns, per-event stats, team search, and is the fallback. All
  // payloads carry source/fetchedAt/partial and share the 10-minute cache.
  // -------------------------------------------------------------------------

  function scoutCachedBody<T extends { source: string }>(p: T, stale = false) {
    return { ...p, source: "cache", origin: p.source, cached: true, ...(stale ? { stale: true } : {}) };
  }

  /** Full event (field + matches + alliances), merged. Null = unknown event. */
  async function getEventFull(season: number, code: string): Promise<FtcEventFull | null> {
    const fetchedAt = new Date().toISOString();
    let firstFailed = false;
    let scoutFailed = false;
    let partial = false;

    const scoutP: Promise<ScoutEventParsed | null> = SCOUT_SEASONS.includes(season)
      ? ftcQuery(scoutEventQuery(season), { season, code })
          .then((r) => parseScoutEvent(r, season))
          .catch((e: unknown) => {
            if (!isFtcScoutClientError(e)) scoutFailed = true;
            return null;
          })
      : Promise.resolve(null);

    let first: FirstEventPieces | null = null;
    if (isFirstEventsConfigured()) {
      try {
        const event = await getFirstEventsEvent(season, code);
        if (event) {
          const settled = await Promise.allSettled([
            getFirstEventsEventTeams(season, code),
            getFirstEventsRankings(season, code),
            getFirstEventsMatches(season, code),
            getFirstEventsSchedule(season, code, "qual"),
            getFirstEventsSchedule(season, code, "playoff"),
            getFirstEventsAlliances(season, code),
          ]);
          partial = settled.some((r) => r.status === "rejected");
          const val = <T,>(i: number): T[] =>
            settled[i].status === "fulfilled" ? ((settled[i] as PromiseFulfilledResult<T[]>).value) : [];
          first = {
            event,
            teams: val<{ teamNumber: number; name: string }>(0),
            rankings: val<FirstRanking>(1),
            results: val<FirstMatch>(2),
            schedule: [...val<FirstMatch>(3), ...val<FirstMatch>(4)],
            alliances: val<FirstAlliance>(5),
          };
        }
      } catch {
        firstFailed = true;
        console.error(`[scout] FIRST Events event lookup failed for ${code}/${season}`);
      }
    }
    const scout = await scoutP;
    if (!first && !scout) {
      if (firstFailed || scoutFailed) throw new FtcUnavailableError("FTC data sources unreachable");
      return null;
    }
    return mergeEventFull(season, code, first, scout, { fetchedAt, partial: partial || firstFailed || scoutFailed });
  }

  // Concurrent cold-cache requests (several users, Bruno's context builder)
  // share one upstream fetch per key; the entry is dropped once it settles.
  const scoutInflight = new Map<string, Promise<unknown>>();
  function sharedFetch<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = scoutInflight.get(key);
    if (hit) return hit as Promise<T>;
    const p = load().finally(() => scoutInflight.delete(key));
    scoutInflight.set(key, p);
    return p;
  }

  async function cachedEventFull(season: number, code: string): Promise<FtcEventFull | null> {
    const key = `scoutevent:${season}:${code.toUpperCase()}`;
    const cached = await ftcCached(key);
    if (cached && ftcCacheFresh(cached)) return scoutCachedBody(cached.data as FtcEventFull) as FtcEventFull;
    const refresh = () => sharedFetch(key, async () => {
      const ev = await getEventFull(season, code);
      if (ev) ftcCache.set(key, { at: Date.now(), data: ev });
      return ev;
    });
    if (cached && Date.now() - cached.at < FTC_SWR_MAX) {
      refresh().catch(() => { /* keep serving the cached copy */ });
      return scoutCachedBody(cached.data as FtcEventFull, true) as FtcEventFull;
    }
    try {
      return await refresh();
    } catch (e) {
      if (cached) return scoutCachedBody(cached.data as FtcEventFull, true) as FtcEventFull;
      throw e;
    }
  }

  /**
   * Per-event stats for a team profile: FIRST Events rank / W-L-T / awards
   * are primary, FTC Scout adds RP, OPR and averages. Seasons FTC Scout
   * doesn't cover (e.g. 2026) still get FIRST's results instead of nothing.
   */
  function firstEventStats(number: number, name: string, e: any, scout: FtcTeamEventStats | null): FtcTeamEventStats | null {
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const rank = n(e.rank), wins = n(e.wins), losses = n(e.losses), ties = n(e.ties);
    const awards: string[] = Array.isArray(e.awards) ? e.awards.filter((a: unknown) => typeof a === "string") : [];
    if (!scout && rank == null && wins == null && !awards.length) return null;
    const base: FtcTeamEventStats = scout ?? { teamNumber: number, name, rank: null, rp: null, wins: null, losses: null, ties: null, qualMatchesPlayed: null, opr: null, avg: null, awards: [] };
    return {
      ...base,
      rank: rank ?? base.rank,
      wins: wins ?? base.wins,
      losses: wins != null ? losses : base.losses,
      ties: wins != null ? ties : base.ties,
      awards: awards.length ? awards : base.awards,
    };
  }

  /** Any team's season profile + per-event stats. Null = unknown team. */
  async function getTeamProfile(number: number, season: number): Promise<FtcTeamProfile | null> {
    const base = await getTeamData(number, season); // throws FtcUnavailableError on outage
    if (!base) return null;
    const d = base.data as any;
    let partial = !!base.partial;
    let scoutEvents: ReturnType<typeof parseScoutTeamEvents> = [];
    if (SCOUT_SEASONS.includes(season)) {
      try {
        scoutEvents = parseScoutTeamEvents(await ftcQuery(scoutTeamEventsQuery(season), { number, season }), season, d.name);
      } catch (e) {
        if (!isFtcScoutClientError(e)) partial = true;
      }
    }
    const byCode = new Map(scoutEvents.map((e) => [e.code.toLowerCase(), e]));
    const events: FtcTeamEventSummary[] = (d.events || []).map((e: any) => {
      const s = byCode.get(String(e.code || "").toLowerCase());
      byCode.delete(String(e.code || "").toLowerCase());
      return {
        code: String(e.code),
        name: String(e.name || e.code),
        date: e.date ?? s?.date ?? null,
        type: e.type ?? s?.type ?? null,
        city: s?.city ?? null,
        state: s?.state ?? null,
        stats: firstEventStats(number, d.name, e, s?.stats ?? null),
      };
    });
    for (const s of byCode.values()) events.push({ code: s.code, name: s.name, date: s.date, type: s.type, city: s.city, state: s.state, stats: s.stats });
    events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return {
      number,
      name: d.name,
      school: d.school ?? null,
      sponsors: d.sponsors ?? [],
      city: d.city ?? null,
      state: d.state ?? null,
      country: d.country ?? null,
      rookieYear: d.rookieYear ?? null,
      season,
      seasons: d.seasons ?? [],
      totalTeams: d.totalTeams ?? null,
      opr: d.opr,
      oprSource: d.oprSource ?? null,
      events,
      source: base.source === "first-events" ? "first-events" : "ftc-scout",
      fetchedAt: base.fetchedAt,
      partial,
    };
  }

  async function cachedTeamProfile(number: number, season: number): Promise<FtcTeamProfile | null> {
    const key = `scoutteam:${number}:${season}`;
    const cached = await ftcCached(key);
    if (cached && ftcCacheFresh(cached)) return scoutCachedBody(cached.data as FtcTeamProfile) as FtcTeamProfile;
    const refresh = () => sharedFetch(key, async () => {
      const p = await getTeamProfile(number, season);
      if (p) ftcCache.set(key, { at: Date.now(), data: p });
      return p;
    });
    if (cached && Date.now() - cached.at < FTC_SWR_MAX) {
      refresh().catch(() => { /* keep serving the cached copy */ });
      return scoutCachedBody(cached.data as FtcTeamProfile, true) as FtcTeamProfile;
    }
    try {
      return await refresh();
    } catch (e) {
      if (cached) return scoutCachedBody(cached.data as FtcTeamProfile, true) as FtcTeamProfile;
      throw e;
    }
  }

  function parseSeason(raw: unknown): number | null {
    const s = parseInt(String(raw ?? currentFtcSeason()), 10);
    return SUPPORTED_SEASONS.includes(s) ? s : null;
  }

  const EVENT_CODE_RE = /^[A-Za-z0-9]{2,32}$/;

  app.get("/api/ftc/scout/event", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseSeason(req.query.season);
    if (season == null) return res.status(400).json({ error: "Season data is available for 2022–2026" });
    const code = String(req.query.code || "").trim();
    if (!EVENT_CODE_RE.test(code)) return res.status(400).json({ error: "Invalid event code" });
    try {
      const ev = await cachedEventFull(season, code);
      if (!ev) return res.status(404).json({ error: "No data for that event yet" });
      res.json(ev);
    } catch {
      res.status(502).json({ error: "Could not reach FTC data sources — try again in a moment" });
    }
  });

  app.get("/api/ftc/scout/team", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseSeason(req.query.season);
    if (season == null) return res.status(400).json({ error: "Season data is available for 2022–2026" });
    let number = parseInt(String(req.query.number || ""), 10);
    if (!number) {
      const team = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", auth.teamId)) as any;
      number = parseInt(team?.ftc_team_number, 10) || 0;
      if (!number) return res.status(404).json({ error: "No FTC team connected — set your team number in Settings" });
    }
    if (number < 1 || number > 999999) return res.status(400).json({ error: "Invalid team number" });
    try {
      const p = await cachedTeamProfile(number, season);
      if (!p) return res.status(404).json({ error: "No record of that team number this season" });
      res.json(p);
    } catch {
      res.status(502).json({ error: "Could not reach FTC data sources — try again in a moment" });
    }
  });

  app.get("/api/ftc/scout/search", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const q = String(req.query.q || "").trim().slice(0, 40);
    const season = parseSeason(req.query.season) ?? currentFtcSeason();
    if (q.length < 2 && !/^\d+$/.test(q)) return res.json({ results: [] });
    const key = `scoutsearch:${season}:${q.toLowerCase()}`;
    const cached = await ftcCached(key);
    if (cached && ftcCacheFresh(cached)) return res.json({ results: cached.data, cached: true });
    const results: FtcTeamSearchHit[] = [];
    let anyOk = false;
    try {
      if (/^\d{1,6}$/.test(q)) {
        const n = parseInt(q, 10);
        if (isFirstEventsConfigured()) {
          try {
            const t = await getFirstEventsTeam(season, n);
            anyOk = true;
            if (t) results.push({ number: t.teamNumber, name: t.name, city: t.city, state: t.state });
          } catch { /* fall through to FTC Scout */ }
        }
        if (!results.length) {
          try {
            const r: any = await ftcQuery(`query One($n: Int!) { teamByNumber(number: $n) { number name location { city state } } }`, { n });
            anyOk = true;
            const t = r?.data?.teamByNumber;
            if (t?.number) results.push({ number: t.number, name: t.name || `Team ${t.number}`, city: t.location?.city ?? null, state: t.location?.state ?? null });
          } catch { /* reported below if nothing worked */ }
        }
      } else {
        const r = await ftcQuery(SCOUT_SEARCH_QUERY, { q });
        anyOk = true;
        results.push(...parseScoutSearch(r));
      }
    } catch { /* handled below */ }
    if (!anyOk) {
      if (cached) return res.json({ results: cached.data, cached: true, stale: true });
      return res.status(502).json({ error: "Team search is unavailable right now — try again in a moment" });
    }
    ftcCache.set(key, { at: Date.now(), data: results });
    res.json({ results });
  });

  // ---- Scouting shortlist (shared per workspace + season) ----
  const SHORTLIST_PRIORITIES = new Set(["high", "medium", "low"]);
  function cleanTags(v: unknown): string[] {
    return (Array.isArray(v) ? v : [])
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 10);
  }
  function shortlistRow(r: any): ShortlistEntry {
    const tags = (s: unknown): string[] => { try { return cleanTags(JSON.parse(String(s || "[]"))); } catch { return []; } };
    return {
      teamNumber: Number(r.team_number),
      teamName: String(r.team_name || ""),
      season: Number(r.season),
      eventCode: r.event_code || null,
      notes: String(r.notes || ""),
      priority: SHORTLIST_PRIORITIES.has(r.priority) ? r.priority : "medium",
      scoutNext: Number(r.scout_next) === 1,
      strengths: tags(r.strengths),
      weaknesses: tags(r.weaknesses),
      updatedAt: String(r.updated_at || ""),
    };
  }
  async function loadShortlist(teamId: number, season: number): Promise<ShortlistEntry[]> {
    const rows = (await dbAll(
      "SELECT * FROM scouting_shortlist WHERE team_id = ? AND season = ? AND deleted = 0 ORDER BY scout_next DESC, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, team_number",
      teamId, season
    )) as any[];
    return rows.map(shortlistRow);
  }

  app.get("/api/ftc/shortlist", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseSeason(req.query.season);
    if (season == null) return res.status(400).json({ error: "Invalid season" });
    res.json({ entries: await loadShortlist(auth.teamId!, season) });
  });

  // Shortlist writes (see src/utils/shortlist.ts): field-level patches merged
  // into the stored row. Each entry's read-merge-write runs under a lock, and
  // per-field write origins stop a client's own delayed request from
  // overwriting its newer edit or resurrecting a team it deleted.
  const shortlistLocks = new Map<string, Promise<unknown>>();
  function withShortlistLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = shortlistLocks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    shortlistLocks.set(key, tail);
    void tail.then(() => { if (shortlistLocks.get(key) === tail) shortlistLocks.delete(key); });
    return run;
  }
  async function storedShortlist(teamId: number, season: number, teamNumber: number): Promise<StoredShortlistEntry> {
    const rows = (await dbAll(
      "SELECT * FROM scouting_shortlist WHERE team_id = ? AND season = ? AND team_number = ?",
      teamId, season, teamNumber
    )) as any[];
    const r = rows[0];
    if (!r) return { entry: null, stamps: {}, deleted: false };
    let stamps: FieldStamps = {};
    try {
      const parsed = JSON.parse(String(r.field_ts || "{}"));
      if (parsed && typeof parsed === "object") {
        for (const [k, byClient] of Object.entries(parsed as Record<string, any>)) {
          if (!byClient || typeof byClient !== "object" || k === "__proto__") continue;
          const clean: Record<string, number> = {};
          for (const [c, n] of Object.entries(byClient)) if (c !== "__proto__" && typeof n === "number" && Number.isSafeInteger(n)) clean[c] = n;
          stamps[k] = clean;
        }
      }
    } catch { stamps = {}; }
    return { entry: shortlistRow(r), stamps, deleted: Number(r.deleted) === 1 };
  }

  /** Write origin from the request; without one, the write always applies. */
  function writeOrigin(client: unknown, seq: unknown): WriteOrigin {
    const c = typeof client === "string" && /^[A-Za-z0-9-]{8,64}$/.test(client) ? client : `anon-${crypto.randomUUID()}`;
    const n = typeof seq === "number" ? seq : parseInt(String(seq ?? ""), 10);
    return { client: c, seq: Number.isSafeInteger(n) && n >= 0 ? n : 0 };
  }

  async function writeShortlistRow(teamId: number, memberId: number | null, e: ShortlistEntry, stamps: FieldStamps, deleted: boolean) {
    await dbRun(
      `INSERT INTO scouting_shortlist (team_id, season, team_number, team_name, event_code, notes, priority, scout_next, strengths, weaknesses, updated_by, updated_at, field_ts, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id, season, team_number) DO UPDATE SET
         team_name = excluded.team_name, event_code = excluded.event_code, notes = excluded.notes,
         priority = excluded.priority, scout_next = excluded.scout_next, strengths = excluded.strengths,
         weaknesses = excluded.weaknesses, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
         field_ts = excluded.field_ts, deleted = excluded.deleted`,
      teamId, e.season, e.teamNumber, e.teamName, e.eventCode, e.notes, e.priority, e.scoutNext ? 1 : 0,
      JSON.stringify(e.strengths), JSON.stringify(e.weaknesses), memberId, e.updatedAt, JSON.stringify(stamps), deleted ? 1 : 0
    );
  }

  app.put("/api/ftc/shortlist", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const b = req.body || {};
    const season = parseSeason(b.season);
    const teamNumber = parseInt(b.teamNumber, 10);
    if (season == null || !teamNumber || teamNumber < 1 || teamNumber > 999999) return res.status(400).json({ error: "Season and team number are required" });
    if (b.priority !== undefined && !SHORTLIST_PRIORITIES.has(b.priority)) return res.status(400).json({ error: "Invalid priority" });
    const tagList = (v: unknown) => (Array.isArray(v) ? v.slice(0, 10) : undefined);
    const patch: ShortlistPatch = {
      season,
      teamNumber,
      teamName: typeof b.teamName === "string" ? b.teamName : undefined,
      eventCode: b.eventCode === undefined ? undefined : typeof b.eventCode === "string" && EVENT_CODE_RE.test(b.eventCode) ? b.eventCode : null,
      notes: typeof b.notes === "string" ? b.notes : undefined,
      priority: b.priority,
      scoutNext: typeof b.scoutNext === "boolean" ? b.scoutNext : undefined,
      addStrengths: tagList(b.addStrengths),
      removeStrengths: tagList(b.removeStrengths),
      addWeaknesses: tagList(b.addWeaknesses),
      removeWeaknesses: tagList(b.removeWeaknesses),
    };
    const origin = writeOrigin(b.clientId, b.seq);
    await withShortlistLock(`${auth.teamId}:${season}:${teamNumber}`, async () => {
      const stored = await storedShortlist(auth.teamId!, season, teamNumber);
      const merged = mergeStampedPatch(stored, patch, origin, new Date().toISOString());
      // null = an older request from a client that has since deleted the entry.
      if (merged) await writeShortlistRow(auth.teamId!, auth.memberId, merged.entry, merged.stamps, false);
    });
    res.json({ entries: await loadShortlist(auth.teamId!, season) });
  });

  app.delete("/api/ftc/shortlist", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseSeason(req.query.season);
    const teamNumber = parseInt(String(req.query.team || ""), 10);
    if (season == null || !teamNumber) return res.status(400).json({ error: "Season and team number are required" });
    const origin = writeOrigin(req.query.clientId, req.query.seq);
    await withShortlistLock(`${auth.teamId}:${season}:${teamNumber}`, async () => {
      const stored = await storedShortlist(auth.teamId!, season, teamNumber);
      if (!stored.entry || stored.deleted) return;
      const stamps = mergeStampedDelete(stored, origin);
      // null = the same client already made a newer edit (late delete): keep it.
      if (stamps) await writeShortlistRow(auth.teamId!, auth.memberId, stored.entry, stamps, true);
    });
    res.json({ entries: await loadShortlist(auth.teamId!, season) });
  });

  // -------------------------------------------------------------------------
  // Predict (Compete → Predict): advancement odds, partner scenarios, matches.
  // The engine keeps its own match history on disk (PREDICT_DATA_DIR) synced
  // from FTC Scout + FIRST in the background; live event data comes from the
  // same cached event payload as Team Stats.
  // -------------------------------------------------------------------------
  const predictSeasons = [currentFtcSeason() - 2, currentFtcSeason() - 1, currentFtcSeason()].filter((s) => SUPPORTED_SEASONS.includes(s));
  const predictStore = new PredictStore(process.env.PREDICT_DATA_DIR || path.join(process.cwd(), ".data", "predict"), {
    scout: (query, variables) => ftcQuery(query, variables),
    advancement: (season, code) => (isFirstEventsConfigured() ? getFirstEventsAdvancement(season, code) : Promise.resolve(null)),
    gapMs: 150,
    log: (m) => console.log(m),
  });
  const predictEngine = new PredictEngine(predictStore, predictSeasons);
  // Live monitoring: pre-match / per-stage snapshots, scored once results land.
  const predictMonitor = new PredictMonitor(predictStore.dir, (m) => console.log(m));
  let predictLive: LiveAccuracy | null = null;
  const predictBaseline = () => {
    const a = predictEngine.accuracy as any;
    return {
      matchBrier: a?.matches?.liveBrier ?? 0.18,
      advancement: { pre: a?.advancement?.pre?.brier, quals: a?.advancement?.quals?.brier, selected: a?.advancement?.selected?.brier },
    };
  };
  function scoreLive(): void {
    const season = currentFtcSeason();
    const { events, advancement } = predictEngine.seasonData(season);
    predictLive = predictMonitor.score(season, events, advancement);
    predictMonitor.checkDrift(predictLive, predictBaseline());
  }
  /** Forecast an event, record its snapshots, and annotate played matches with their pre-match odds. */
  function forecastAndRecord(ev: Parameters<typeof predictEngine.forecast>[0], myTeam: number | null): Forecast | null {
    const fc = predictEngine.forecast(ev, myTeam);
    if (!fc) return null;
    if (eventStillOpen(ev.end)) predictMonitor.record(fc, new Date(), predictEngine.storedPlayedKeys(ev.season, ev.code));
    return predictMonitor.annotate(fc);
  }
  /**
   * Snapshot events that are on now or start within a day, so their
   * pre-match odds are recorded even if nobody opens them. Sequential and
   * capped — each forecast is a few thousand simulations.
   */
  async function snapshotCurrentEvents(): Promise<number> {
    const season = currentFtcSeason();
    if (!predictEngine.ready || !predictStore.hasSeason(season)) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const metas = Object.values(predictStore.index(season))
      .filter((e) => !e.remote && e.start && e.end && e.start <= soon && e.end >= today)
      .slice(0, 40);
    let n = 0;
    for (const meta of metas) {
      try {
        const ev = await cachedEventFull(season, meta.code);
        if (!ev || predictEngine.unsupportedReason(ev) || !eventStillOpen(ev.end)) continue;
        const fc = predictEngine.forecast(ev, null, 1000);
        if (fc && predictMonitor.record(fc, new Date(), predictEngine.storedPlayedKeys(season, meta.code))) n++;
      } catch { /* FTC data unavailable for this one — try next sync */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    return n;
  }
  let predictSyncing = false;
  /** The last sync's download failures (null = the last sync downloaded every season). */
  let predictSyncError: string | null = null;
  async function syncPredict(): Promise<void> {
    if (predictSyncing) return;
    predictSyncing = true;
    try {
      const { errors } = await syncSeasons(predictStore, predictSeasons, currentFtcSeason(), (m) => console.log(m));
      predictSyncError = errors.length ? errors.map((e) => `${e.season}: ${e.message}`).join("; ").slice(0, 300) : null;
      // Rebuild even after a failed download: other seasons may have new data.
      await predictEngine.rebuild();
      predictCache.clear();
      console.log(`[predict] ratings rebuilt (${predictSeasons.join(", ")})`);
      predictMonitor.flush();
      const snapped = await snapshotCurrentEvents();
      if (snapped) console.log(`[predict] snapshots recorded for ${snapped} current events`);
      scoreLive();
    } catch (e) {
      predictSyncError = (e as Error).message;
      console.error("[predict] sync failed:", (e as Error).message);
    } finally {
      predictSyncing = false;
    }
  }
  const predictCache = new Map<string, { at: number; ttl: number; data: unknown }>();
  async function cachedPredict<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
    const hit = predictCache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.data as T;
    const data = await fn();
    predictCache.set(key, { at: Date.now(), ttl, data });
    if (predictCache.size > 500) predictCache.delete(predictCache.keys().next().value!);
    return data;
  }
  if (process.env.NODE_ENV !== "test") {
    // Build from whatever is on disk right away (PREDICT_SYNC=off skips the
    // background download, e.g. for local testing), then keep it fresh.
    setTimeout(() => { predictEngine.rebuild().then(scoreLive).catch((e) => console.warn("[predict] initial build failed:", (e as Error).message)); }, 5_000);
    if (process.env.PREDICT_SYNC !== "off") {
      setTimeout(() => void syncPredict(), 30_000);
      setInterval(() => void syncPredict(), 2 * 60 * 60 * 1000);
    }
  }

  async function myFtcTeam(teamId: number | null): Promise<number | null> {
    const row = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", teamId)) as any;
    return parseInt(row?.ftc_team_number, 10) || null;
  }

  // ---- Offline region pack (V3.5 phase 6b) ----
  const gzipAsync = promisify(gzip);
  const offlineBuilder = new OfflinePackBuilder(predictStore);
  const offlinePacks = new Map<string, { json: string; gz: Buffer }>();
  /** The newest season with stored events, and its packed events. */
  async function offlineSeason(): Promise<{ season: number; events: PackedEvent[]; version: string } | null> {
    for (const s of [...predictSeasons].sort((a, b) => b - a)) {
      const got = await offlineBuilder.events(s);
      if (got.events.length) return { season: s, ...got };
    }
    return null;
  }

  app.get("/api/offline/regions", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const got = await offlineSeason();
    if (!got) return res.status(503).json({ error: "Offline data isn't ready yet — check back in a few minutes." });
    const myTeam = await myFtcTeam(auth.teamId);
    const asEvents = (evs: PackedEvent[]) => evs.map((e) => ({ region: e.event.region, teams: e.event.teams.map((t) => t[0]) }));
    // This season's events first; early in a season, last season's.
    const detected = detectRegion(asEvents(got.events), myTeam)
      ?? detectRegion(predictEngine.seasonData(got.season - 1).events.map((e) => ({ region: e.region ?? null, teams: e.teams })), myTeam);
    res.json(listRegions(got.events, got.season, predictStore.lastSync(got.season), detected));
  });

  app.get("/api/offline/pack", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const region = String(req.query.region || "").toUpperCase();
    if (!/^(ALL|[A-Z0-9]{2,8})$/.test(region)) return res.status(400).json({ error: "Choose a region" });
    const readyBefore = predictEngine.readyAt;
    // The age is read before the files, so a sync finishing during the read
    // can only make the label older than the results, never newer.
    const syncedBefore = new Map(predictSeasons.map((x) => [x, predictStore.lastSync(x)]));
    const got = await offlineSeason();
    if (!got) return res.status(503).json({ error: "Offline data isn't ready yet — check back in a few minutes." });
    if (region !== "ALL" && !got.events.some((e) => e.event.region === region)) return res.status(404).json({ error: "No events in that region this season" });
    const dataAsOf = syncedBefore.get(got.season) ?? null;
    // Keyed by the stored files' version (read with the events): any file a
    // sync rewrote, even one that partly failed, makes a new pack. Ratings
    // change with each rebuild, so they're part of the key too. dataAsOf
    // only labels its age.
    const key = `${got.season}:${region}:${got.version}:${readyBefore}:${dataAsOf}`;
    let built = offlinePacks.get(key);
    if (!built) {
      const pack = buildPack(got.events, got.season, region, dataAsOf);
      // Ratings for offline Predict, once the engine has them.
      if (predictEngine.ready) pack.predict = predictEngine.offlineData(got.season, new Set(pack.teams.map((t) => t[0])), pack.events.map((e) => e.type), pack.events.map((e) => e.code)) ?? undefined;
      const json = JSON.stringify(pack);
      built = { json, gz: await gzipAsync(json) };
      // Not kept if the ratings were rebuilt while it was built.
      if (predictEngine.readyAt === readyBefore) {
        offlinePacks.set(key, built);
        // Keep a handful (the full pack is a few MB).
        while (offlinePacks.size > 6) offlinePacks.delete(offlinePacks.keys().next().value!);
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Accept-Encoding");
    res.type("application/json");
    if (/\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) {
      res.setHeader("Content-Encoding", "gzip");
      return res.send(built.gz);
    }
    res.send(built.json);
  });

  app.get("/api/predict/status", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    res.json({ ready: predictEngine.ready, readyAt: predictEngine.readyAt, dataAsOf: dataAsOf((s) => predictStore.lastSync(s), predictSeasons), syncError: predictSyncError, syncing: predictSyncing, seasons: predictSeasons, accuracy: predictEngine.accuracy, live: predictLive });
  });

  app.get("/api/predict/event", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseSeason(req.query.season);
    const code = String(req.query.code || "");
    if (season == null || !EVENT_CODE_RE.test(code)) return res.status(400).json({ error: "Season and event code are required" });
    if (!predictEngine.ready) return res.status(503).json({ error: "Predictions are warming up — check back in a few minutes." });
    try {
      const ev = await cachedEventFull(season, code);
      if (!ev) return res.status(404).json({ error: "Event not found" });
      const myTeam = await myFtcTeam(auth.teamId);
      const live = !ev.matches.length || ev.matches.some((m) => !m.played);
      const why = predictEngine.unsupportedReason(ev);
      if (why) return res.status(422).json({ error: why });
      const fc = await cachedPredict<Forecast | null>(`event:${season}:${code}:${myTeam ?? 0}`, live ? 2 * 60_000 : 10 * 60_000, async () => forecastAndRecord(ev, myTeam));
      if (!fc) return res.status(503).json({ error: "Predictions are warming up — check back in a few minutes." });
      res.json({ ...fc, eventName: ev.name, eventStart: ev.start, eventEnd: ev.end, myTeam });
    } catch (e) {
      if (e instanceof FtcUnavailableError) return res.status(503).json({ error: "FTC data is temporarily unavailable." });
      throw e;
    }
  });

  app.get("/api/predict/partners", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseSeason(req.query.season);
    const code = String(req.query.code || "");
    if (season == null || !EVENT_CODE_RE.test(code)) return res.status(400).json({ error: "Season and event code are required" });
    if (!predictEngine.ready) return res.status(503).json({ error: "Predictions are warming up — check back in a few minutes." });
    const myTeam = await myFtcTeam(auth.teamId);
    if (!myTeam) return res.status(400).json({ error: "Connect your FTC team number in Settings first." });
    try {
      const ev = await cachedEventFull(season, code);
      if (!ev) return res.status(404).json({ error: "Event not found" });
      const live = ev.matches.some((m) => !m.played);
      const out = await cachedPredict<Partners | null>(`partners:${season}:${code}:${myTeam}`, live ? 2 * 60_000 : 10 * 60_000, () => predictEngine.partners(ev, myTeam));
      if (!out) return res.status(404).json({ error: "Your team isn't registered for this event." });
      res.json(out);
    } catch (e) {
      if (e instanceof FtcUnavailableError) return res.status(503).json({ error: "FTC data is temporarily unavailable." });
      throw e;
    }
  });

  app.get("/api/predict/match", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const season = parseSeason(req.query.season);
    const list = (v: unknown) => String(v || "").split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n > 0 && n <= 999999);
    const red = list(req.query.red), blue = list(req.query.blue);
    if (season == null || !red.length || !blue.length || red.length > 3 || blue.length > 3) return res.status(400).json({ error: "Season plus 1–3 red and blue team numbers are required" });
    if (!predictEngine.ready) return res.status(503).json({ error: "Predictions are warming up — check back in a few minutes." });
    const p = predictEngine.match(season, red, blue);
    if (!p) return res.status(404).json({ error: "No ratings for that season yet." });
    res.json({ season, red: { teams: red, ...p.red }, blue: { teams: blue, ...p.blue }, pRedWin: p.pRedWin });
  });

  /**
   * Bruno screen context: the page the user is on plus whatever record they
   * have open. Every lookup is scoped to the caller's active workspace, so an
   * id from another workspace (or a forged one) simply finds nothing.
   */
  async function screenContextFor(auth: { teamId: number | null }, raw: unknown): Promise<string> {
    const req = parseScreenRequest(raw);
    if (!req || auth.teamId == null) return "";
    const found: ScreenLookups = {};
    if (req.taskId) {
      const t = (await dbGet("SELECT id, title, status, due_date, description FROM tasks WHERE id = ? AND team_id = ?", req.taskId, auth.teamId)) as any;
      if (t) {
        const who = (await dbAll(
          "SELECT m.name FROM task_assignees ta JOIN members m ON m.id = ta.member_id WHERE ta.task_id = ? AND m.team_id = ? ORDER BY m.name LIMIT 8",
          t.id, auth.teamId
        )) as any[];
        found.task = { id: t.id, title: String(t.title || ""), status: t.status ?? null, due_date: t.due_date ?? null, description: t.description ?? null, assignees: who.map((w) => String(w.name || "")).filter(Boolean) };
      }
    }
    if (req.eventId) {
      const e = (await dbGet("SELECT id, title, date, start_time, end_time, location, event_type, description FROM events WHERE id = ? AND team_id = ?", req.eventId, auth.teamId)) as any;
      if (e) found.event = { id: e.id, title: String(e.title || ""), date: String(e.date || ""), start_time: e.start_time || null, end_time: e.end_time || null, location: e.location || null, event_type: e.event_type || null, description: e.description || null };
    }
    if (req.channelId) {
      const c = (await dbGet("SELECT id, name, topic FROM chat_channels WHERE id = ? AND team_id = ?", req.channelId, auth.teamId)) as any;
      if (c) found.channel = { id: c.id, name: String(c.name || ""), topic: c.topic || null };
    }
    if (req.codeFileId) {
      const f = (await dbGet("SELECT id, file_path, language, file_size, updated_at FROM code_files WHERE id = ? AND team_id = ?", req.codeFileId, auth.teamId)) as any;
      if (f) found.codeFile = { id: f.id, file_path: String(f.file_path || ""), language: f.language || null, file_size: f.file_size ?? null, updated_at: f.updated_at || null };
    }
    if (req.predictEvent && req.predictSeason && predictEngine.ready) {
      try {
        const ev = await cachedEventFull(req.predictSeason, req.predictEvent);
        if (ev && !predictEngine.unsupportedReason(ev)) {
          const myTeam = await myFtcTeam(auth.teamId);
          const live = !ev.matches.length || ev.matches.some((m) => !m.played);
          const fc = await cachedPredict<Forecast | null>(`event:${req.predictSeason}:${req.predictEvent}:${myTeam ?? 0}`, live ? 2 * 60_000 : 10 * 60_000, async () => forecastAndRecord(ev, myTeam));
          if (fc) {
            const me = myTeam ? fc.teams.find((t) => t.team === myTeam) : undefined;
            found.predict = {
              event: fc.event, eventName: ev.name, stage: fc.stage, myTeam, slots: fc.slots, assumptions: fc.assumptions,
              mine: me ? { pAdvance: me.pAdvance, matchesOnly: fc.matchesOnly?.pAdvance ?? null, pWin: me.pWin, pCaptain: me.pCaptain, rankP10: me.rank.p10, rankP90: me.rank.p90, points: { quals: me.points.quals, alliance: me.points.alliance, playoffs: me.points.playoffs, awards: me.points.awards } } : null,
              top: fc.teams.slice(0, 6).map((t) => ({ team: t.team, pAdvance: t.pAdvance })),
            };
          }
        }
      } catch { /* best-effort: the rest of the screen context still goes out */ }
    }
    return formatScreenContext(req, found);
  }

  /**
   * Bruno scouting context (Analyze mode): the client sends only what it is
   * looking at; the server builds the pack from its own cached FTC data.
   */
  async function scoutingContextFor(auth: { teamId: number | null }, raw: unknown): Promise<string> {
    if (!raw || typeof raw !== "object") return "";
    const r = raw as Record<string, unknown>;
    if (r.mode !== "analyze") return "";
    const season = parseSeason(r.season);
    if (season == null || !auth.teamId) return "";
    const eventCode = typeof r.eventCode === "string" && EVENT_CODE_RE.test(r.eventCode) ? r.eventCode : null;
    const selectedTeam = Number.isInteger(r.selectedTeam) && (r.selectedTeam as number) > 0 ? (r.selectedTeam as number) : null;
    const teamRow = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", auth.teamId)) as any;
    const myTeam = parseInt(teamRow?.ftc_team_number, 10) || null;
    const [event, selected, shortlist] = await Promise.all([
      eventCode ? cachedEventFull(season, eventCode).catch(() => null) : Promise.resolve(null),
      selectedTeam ? cachedTeamProfile(selectedTeam, season).catch(() => null) : Promise.resolve(null),
      loadShortlist(auth.teamId, season).catch(() => []),
    ]);
    return buildScoutingContextPack({ season, myTeam, event, selected, shortlist });
  }

  // Members — scoped to the caller's workspace
  app.get("/api/members/presence", async (req, res) => {
    // Lightweight presence reconciliation: the client polls this every minute
    // so online/idle/offline dots decay correctly without a full roster fetch.
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const rows = (await dbAll(
      "SELECT id FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1",
      auth.teamId
    )) as any[];
    res.json({ presence: await presenceMap(rows.map((r: any) => r.id)) });
  });

  app.get("/api/members", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    await ensureRolesSeeded(auth.teamId!);
    const members = (await dbAll(`
      SELECT m.*, t.name as team_name 
      FROM members m 
      LEFT JOIN teams t ON m.team_id = t.id
      WHERE m.team_id = ? AND COALESCE(m.is_active, 1) = 1 AND ${VERIFIED_MEMBER_SQL}
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
    const { name, role, is_board, scopes, account_type, accent_color, primary_color, text_color } = req.body;
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return res.status(400).json({ error: "A valid email is required" });
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
    const { name, role, is_board, scopes, account_type, accent_color, primary_color, text_color } = req.body;
    const requested = req.body?.email == null ? String(target.email || "") : String(req.body.email).trim().toLowerCase();
    if (!requested || !requested.includes("@")) return res.status(400).json({ error: "A valid email is required" });
    // Legacy per-member scopes no longer grant anything (roles do); keep the
    // stored value unless a caller still sends one.
    const finalScopes = scopes === undefined ? (target.scopes ?? "[]") : typeof scopes === 'string' ? scopes : JSON.stringify(scopes || []);
    const emailChanged = requested.toLowerCase() !== String(target.email || "").toLowerCase();
    // Unchanged address: keep the stored value byte-for-byte (a case-only
    // duplicate left by migration 011 must not be rewritten into a clash).
    const email = emailChanged ? requested : target.email;

    // Email must stay unique within the team
    if (emailChanged) {
      const clash = (await dbGet("SELECT id FROM members WHERE LOWER(email) = ? AND team_id = ? AND id != ?", email, auth.teamId, memberId)) as any;
      if (clash) return res.status(400).json({ error: "That email is already on the roster" });
    }

    // Guard: never leave the workspace without an admin (role-aware count).
    const nextType = account_type === 'admin' || account_type === 'student' ? account_type : target.account_type;
    if (target.account_type === 'admin' && nextType !== 'admin') {
      if ((await countAdmins(auth.teamId!)) <= 1) return res.status(400).json({ error: "You need at least one admin — promote someone else first" });
    }

    // Only update color fields if they're explicitly provided (not undefined)
    // Fields the caller leaves out keep their stored value (partial update).
    const updates: any = {
      name: name === undefined ? target.name : name,
      role: role === undefined ? target.role : role,
      email,
      is_board: is_board === undefined ? (target.is_board ? 1 : 0) : is_board ? 1 : 0,
      scopes: finalScopes,
      account_type: nextType,
    };

    if (accent_color !== undefined) updates.accent_color = cleanHex(accent_color);
    if (primary_color !== undefined) updates.primary_color = cleanHex(primary_color);
    if (text_color !== undefined) updates.text_color = cleanHex(text_color);
    if (emailChanged) {
      // The row now belongs to a different email (account). Its old password,
      // linked sign-ins and sessions belong to the previous address and must
      // not carry over — otherwise an admin could point a row whose password
      // they know at someone else's email and sign in as them. Cleared in the
      // same write as the email (and login re-checks credentials atomically
      // when it creates a session). The new owner sets a password via code.
      Object.assign(updates, { password: null, is_setup: 0, google_id: null, discord_id: null, github_id: null });
    }

    const columns = Object.keys(updates);
    const setClause = columns.map(col => `${col} = ?`).join(', ');

    await dbBatch([
      { sql: `UPDATE members SET ${setClause} WHERE id = ?`, args: [...Object.values(updates), memberId] },
      ...(emailChanged ? [{ sql: "DELETE FROM sessions WHERE member_id = ?", args: [memberId] }] : []),
    ]);
    if (emailChanged) await endMemberPresence(auth.teamId, memberId);

    // Keep the system Admin role aligned with an explicit admin/student change,
    // then reconcile account_type with any custom roles the member holds.
    await setAdminRole(memberId, auth.teamId, nextType === 'admin');
    await syncAccountType(memberId, auth.teamId);

    const updatedMember = (await dbGet("SELECT * FROM members WHERE id = ?", memberId)) as any;
    broadcastToTeam(auth.teamId, { type: "member_updated", member: await memberWithPresence(updatedMember) });
    if (updatedMember && updatedMember.account_type !== target.account_type && memberId !== auth.memberId) {
      const t = (await dbGet("SELECT name FROM teams WHERE id = ?", auth.teamId)) as any;
      void createNotification(memberId, updatedMember.account_type === 'admin'
        ? `You're now an admin of ${t?.name || "your workspace"}.`
        : `You're no longer an admin of ${t?.name || "your workspace"}.`, "system", { roles_changed: true });
    }
    broadcastToTeam(auth.teamId, { type: "member_roles_changed", member_id: memberId });
    // Asked to demote, but a custom role still grants admin: say which (H-2 —
    // never report success for a change that didn't happen).
    let stillAdminVia: string | null = null;
    if (nextType !== 'admin' && updatedMember?.account_type === 'admin') {
      const r = (await dbAll(
        "SELECT r.name, r.permissions FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.member_id = ? AND r.team_id = ?",
        memberId, auth.teamId
      )) as any[];
      stillAdminVia = r.find((x) => { const p = parsePerms(x.permissions); return p.includes("*") || p.includes("manage_members"); })?.name || null;
    }
    res.json({ success: true, account_type: updatedMember?.account_type, ...(stillAdminVia ? { stillAdminVia } : {}) });
  });

  // Self-service profile: any signed-in member can update their own
  // name, role description, theme colors, and avatar. Admin-only fields
  // (email, is_board, scopes, account_type) stay on the admin endpoint.
  app.patch("/api/profile", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { name, role, accent_color, primary_color, text_color, avatar_url, presence_status, bruno_teach_mode, bruno_output_level, bruno_nudges, interface_mode } = req.body || {};
    if (interface_mode !== undefined && interface_mode !== null && !INTERFACE_MODES.includes(interface_mode)) {
      return res.status(400).json({ error: "Invalid interface mode" });
    }
    const cleanName = (name || '').trim();
    if (!cleanName) return res.status(400).json({ error: "Name can't be empty" });
    const updates: any = { name: cleanName, role: (role || '').trim() };
    if (bruno_teach_mode !== undefined) updates.bruno_teach_mode = bruno_teach_mode ? 1 : 0;
    if (bruno_nudges !== undefined) updates.bruno_nudges = bruno_nudges ? 1 : 0;
    if (bruno_output_level !== undefined) {
      let lvl = String(bruno_output_level);
      if (lvl === 'max') lvl = 'high'; // 'max' was removed — map to 'high'
      if (['low', 'medium', 'high'].includes(lvl)) updates.bruno_output_level = lvl;
    }
    if (presence_status !== undefined) {
      if (!(PRESENCE_STATUSES as readonly string[]).includes(presence_status)) {
        return res.status(400).json({ error: "Invalid status — choose online, idle, dnd, or invisible" });
      }
      updates.presence_status = presence_status;
    }
    if (accent_color !== undefined) updates.accent_color = cleanHex(accent_color);
    if (primary_color !== undefined) updates.primary_color = cleanHex(primary_color);
    if (text_color !== undefined) updates.text_color = cleanHex(text_color);
    if (avatar_url !== undefined) {
      // Only clearing, an https image URL, or one of this account's own
      // uploaded avatars — a pointer at someone else's stored file was the
      // first step of deleting it via the avatar upload route.
      const v = typeof avatar_url === "string" ? avatar_url.trim() : "";
      if (!v) updates.avatar_url = null;
      else if (/^https:\/\/[^\s"'<>]+$/i.test(v) && v.length <= 1000) updates.avatar_url = v;
      else {
        const fm = /^\/api\/files\/(\d+)$/.exec(v);
        const own = fm ? (await dbGet(
          "SELECT f.id FROM stored_files f JOIN members m ON m.id = f.member_id WHERE f.id = ? AND f.kind = 'avatar' AND LOWER(m.email) = (SELECT LOWER(email) FROM members WHERE id = ?)",
          Number(fm[1]), auth.memberId
        )) as any : null;
        if (!own) return res.status(400).json({ error: "Invalid avatar" });
        updates.avatar_url = v;
      }
    }
    const cols = Object.keys(updates);
    (await dbRun(`UPDATE members SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(updates), auth.memberId));
    if (interface_mode !== undefined) {
      // Per account, not per workspace: every membership row for this email.
      const me = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
      if (me?.email) await dbRun("UPDATE members SET interface_mode = ? WHERE email = ?", interface_mode, me.email);
      else await dbRun("UPDATE members SET interface_mode = ? WHERE id = ?", interface_mode, auth.memberId);
    }
    const user = (await dbGet("SELECT * FROM members WHERE id = ?", auth.memberId));
    const withPresence = await memberWithPresence(user);
    // Live presence: a status/name change is visible to the team immediately.
    if (auth.teamId) broadcastToTeam(auth.teamId, { type: "member_updated", member: withPresence });
    res.json({ user: withPresence });
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
    // Persist to the database so the avatar survives restarts/redeploys.
    const fileId = await storeFile({
      teamId: null, memberId: auth.memberId, kind: "avatar",
      filename: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer,
    });
    const avatarUrl = fileUrl(fileId);
    // Remove the previous avatar's stored file so uploads don't pile up
    try {
      const prev = (await dbGet("SELECT avatar_url FROM members WHERE id = ?", auth.memberId)) as any;
      await deleteOwnedAvatarFile(prev?.avatar_url, [auth.memberId]);
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
    // tasks, attendance, and other history stay intact. Privileges do not
    // survive removal — rejoining later starts over as a plain Member — and
    // every session and live socket for the membership ends now.
    await dbBatch([
      { sql: "UPDATE members SET is_active = 0, account_type = 'student', is_board = 0, scopes = '[]', role = 'Member' WHERE id = ?", args: [memberId] },
      { sql: "DELETE FROM member_roles WHERE member_id = ?", args: [memberId] },
      { sql: "DELETE FROM sessions WHERE member_id = ?", args: [memberId] },
    ]);
    await endMemberPresence(auth.teamId, memberId);
    broadcastToTeam(auth.teamId, { type: "member_removed", id: memberId });
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
    broadcastToTeam(auth.teamId, { type: "roles_changed" });
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
    const holders = (await dbAll(
      "SELECT mr.member_id, m.account_type FROM member_roles mr JOIN members m ON m.id = mr.member_id WHERE mr.role_id = ?", roleId,
    )) as any[];
    for (const h of holders) await syncAccountType(h.member_id, auth.teamId!);
    if (updates.permissions !== undefined && updates.permissions !== role.permissions) {
      const name = updates.name ?? role.name;
      await notifyRoleHolders(auth.teamId!, auth.memberId, holders, (team) => `The ${name} role's permissions in ${team} changed.`);
    }
    broadcastToTeam(auth.teamId, { type: "roles_changed" });
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
    const before = (await dbAll(
      "SELECT m.id AS member_id, m.account_type FROM member_roles mr JOIN members m ON m.id = mr.member_id WHERE mr.role_id = ?", roleId,
    )) as any[];
    await dbRun("DELETE FROM member_roles WHERE role_id = ?", roleId);
    await dbRun("DELETE FROM roles WHERE id = ?", roleId);
    for (const h of holders) await syncAccountType(h.id, auth.teamId!);
    await notifyRoleHolders(auth.teamId!, auth.memberId, before, (team) => `The ${role.name} role in ${team} was deleted, so you no longer have it.`);
    broadcastToTeam(auth.teamId, { type: "roles_changed" });
    res.json({ success: true });
  });

  // Assign a role to a member (manage_roles only) — this is how you make extra admins.
  // Your own notification controls (Settings → Notifications). The prefs live
  // on every membership row of your account, so they follow you across
  // workspaces.
  app.get("/api/notification-prefs", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const row = (await dbGet(`SELECT ${PREFS_OF_M} AS notify_prefs FROM members m WHERE m.id = ?`, auth.memberId)) as any;
    res.json(parsePrefs(row?.notify_prefs));
  });
  app.patch("/api/notification-prefs", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const p = prefsPatch(req.body);
    if ("error" in p) return res.status(400).json({ error: p.error });
    // Merge in one statement (two quick saves can't undo each other), on
    // every membership of the account.
    const paths: string[] = [];
    const args: any[] = [];
    if (p.patch.team_updates !== undefined) { paths.push("'$.team_updates', ?"); args.push(p.patch.team_updates); }
    if (p.patch.everyone_pings !== undefined) paths.push(`'$.everyone_pings', json('${p.patch.everyone_pings ? "true" : "false"}')`);
    const me = (await dbGet("SELECT email FROM members WHERE id = ?", auth.memberId)) as any;
    const where = me?.email ? "LOWER(m.email) = LOWER(?)" : "m.id = ?";
    await dbRun(
      `UPDATE members AS m SET notify_prefs = json_set(COALESCE(${PREFS_OF_M}, '{}'), ${paths.join(", ")}) WHERE ${where}`,
      ...args, me?.email || auth.memberId,
    );
    // Off means off: drop anything already waiting in a digest.
    if (p.patch.team_updates === "off") {
      await dbRun(
        `DELETE FROM notification_digest WHERE member_id IN (SELECT m.id FROM members m WHERE ${where})`,
        me?.email || auth.memberId,
      );
    }
    const row = (await dbGet(`SELECT ${PREFS_OF_M} AS notify_prefs FROM members m WHERE m.id = ?`, auth.memberId)) as any;
    res.json(parsePrefs(row?.notify_prefs));
  });

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
    const added = (await dbRun("INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?,?)", memberId, roleId)) as any;
    await syncAccountType(memberId, auth.teamId!);
    // Admin changes that affect you always reach you.
    if (Number(added?.changes) && memberId !== auth.memberId) {
      const r = (await dbGet("SELECT name FROM roles WHERE id = ?", roleId)) as any;
      const t = (await dbGet("SELECT name FROM teams WHERE id = ?", auth.teamId)) as any;
      void createNotification(memberId, `You were given the ${r?.name || "new"} role in ${t?.name || "your workspace"}.`, "system", { roles_changed: true });
    }
    // Live mission control: the affected member's permissions change — push it
    // so their client picks it up without a refresh.
    broadcastToTeam(auth.teamId, { type: "member_roles_changed", member_id: memberId });
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
    const removed = (await dbRun("DELETE FROM member_roles WHERE member_id = ? AND role_id = ?", memberId, roleId)) as any;
    await syncAccountType(memberId, auth.teamId!);
    if (Number(removed?.changes) && memberId !== auth.memberId) {
      const t = (await dbGet("SELECT name FROM teams WHERE id = ?", auth.teamId)) as any;
      void createNotification(memberId, `Your ${role.name} role in ${t?.name || "your workspace"} was removed.`, "system", { roles_changed: true });
    }
    broadcastToTeam(auth.teamId, { type: "member_roles_changed", member_id: memberId });
    res.json({ success: true });
  });

  // Attendance — scoped to the caller's workspace
  app.get("/api/attendance", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const { date } = req.query;
      let query = "SELECT a.*, m.name AS member_name FROM attendance a JOIN members m ON a.member_id = m.id WHERE m.team_id = ?";
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
      if (!isIsoDate(date) || !Array.isArray(records) || records.length > 500) {
        return res.status(400).json({ error: "Invalid request body" });
      }
      // Status codes and future-day rule (only Excused / School event ahead
      // of time). "Today" is taken in the furthest-ahead timezone so a team
      // anywhere on Earth can mark its own today.
      const latestToday = latestTodayOnEarth();
      for (const rec of records) {
        if (rec?.status === null || rec?.status === '-') continue;
        const bad = attendanceMarkError(date, String(rec?.status), latestToday);
        if (bad) return res.status(400).json({ error: bad });
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
      const canManage = await hasPerm(auth, "manage_attendance");
      if (!selfOnly && !canManage) {
        return res.status(403).json({ error: "You don't have permission for that" });
      }
      // Self-reports are for today only (the dashboard check-in strip). Any
      // other day goes through someone who manages attendance.
      if (selfOnly && !canManage && (date < earliestTodayOnEarth() || date > latestToday)) {
        return res.status(403).json({ error: "You can only report your own attendance for today" });
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
      broadcastToTeam(auth.teamId, { type: "attendance_changed", date });
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
      broadcastToTeam(auth.teamId, { type: "attendance_changed", date: today });
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
    broadcastToTeam(session.team_id, { type: "attendance_changed", date: today });
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
      const dates = (await dbAll("SELECT date FROM team_hidden_dates WHERE team_id = ?", auth.teamId));
      res.json(dates.map((d: any) => d.date));
    } catch (error) {
      console.error("Error fetching hidden dates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/hidden-dates", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_attendance");
    if (!auth) return;
    const date = String(req.body?.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Invalid date" });
    (await dbRun("INSERT OR IGNORE INTO team_hidden_dates (team_id, date) VALUES (?, ?)", auth.teamId, date));
    res.json({ success: true });
  });

  app.delete("/api/hidden-dates/:date", async (req, res) => {
    const auth = await requirePerm(req, res, "manage_attendance");
    if (!auth) return;
    (await dbRun("DELETE FROM team_hidden_dates WHERE team_id = ? AND date = ?", auth.teamId, req.params.date));
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
        await dbRun("INSERT OR IGNORE INTO team_hidden_dates (team_id, date) VALUES (?, ?)", auth.teamId, d);
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
        await dbRun("DELETE FROM team_hidden_dates WHERE team_id = ? AND date = ?", auth.teamId, d);
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
    // Cursor pagination: newest page first. `before` is a message id; the
    // response is always in ascending display order (oldest -> newest).
    // Clients infer hasMore from items.length === limit.
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "100"), 10) || 100, 1), 200);
    const before = parseInt(String(req.query.before || ''), 10);
    const whereBase = Number.isFinite(channelId) && channelId > 0
      ? "m.team_id = ? AND m.channel_id = ?"
      : "m.team_id = ?";
    const where = Number.isFinite(before) && before > 0 ? `${whereBase} AND m.id < ?` : whereBase;
    const baseArgs = Number.isFinite(channelId) && channelId > 0 ? [auth.teamId, channelId] : [auth.teamId];
    const args = Number.isFinite(before) && before > 0 ? [...baseArgs, before] : baseArgs;
    const msgs = (await dbAll(`
      SELECT m.*, mem.name as sender_name,
        rmem.name as reply_sender_name, r.content as reply_content,
        r.deleted_at as reply_deleted
      FROM messages m
      JOIN members mem ON m.sender_id = mem.id
      LEFT JOIN messages r ON r.id = m.reply_to_id
      LEFT JOIN members rmem ON rmem.id = r.sender_id
      WHERE ${where}
      ORDER BY m.id DESC LIMIT ?
    `, ...args, limit)) as any[];
    // Attach aggregated reactions (one extra query for the whole page).
    try {
      const reacted = await getMessageReactions(msgs.map((m: any) => m.id), auth.memberId);
      for (const m of msgs) m.reactions = reacted[m.id] || [];
    } catch {}
    res.json(msgs.reverse());
  });

  // ---- Voice & video calling ----
  registerVoiceRoutes(app, voiceDeps);

  registerNotebookRoutes(app, { requireAuth, ensureRolesSeeded });

  // ---- Manual scouting (works with no FTC data; synced from devices) ----
  registerScoutingRoutes(app, {
    dbAll, dbGet, dbRun,
    requireAuth: requireAuth as any,
    hasPerm: hasPerm as any,
    broadcastToTeam: (teamId, msg) => broadcastToTeam(teamId, msg),
  });

  // Periodic voice maintenance: expire stale ringing invites, end sessions
  // whose participants all vanished (crashed tabs, killed apps).
  setInterval(async () => {
    try {
      const teams = (await dbAll(
        "SELECT DISTINCT team_id FROM call_sessions WHERE ended_at IS NULL"
      )) as any[];
      for (const t of teams) await voiceMaintenance(voiceDeps, t.team_id);
    } catch (e) {
      console.error("voice maintenance sweep failed:", e);
    }
  }, 60 * 1000);

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
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!name) return res.status(400).json({ error: "Channel name can't be empty" });
      try {
        await dbRun("UPDATE chat_channels SET name = ? WHERE id = ?", name, id);
      } catch (e: any) {
        if (String(e?.message || '').includes('UNIQUE')) return res.status(409).json({ error: "A channel with that name already exists" });
        throw e;
      }
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
  // ---- Durable file store (survives Render restarts/redeploys) ----
  // Every user upload is persisted as a BLOB in stored_files and served from
  // /api/files/:id. Nothing user-uploaded may live only on ephemeral disk.
  // With R2 configured, the bytes go to the (private) bucket and the row
  // keeps an empty data column plus r2_key; if R2 is unreachable the bytes
  // are kept in the database exactly as before, so an upload never fails
  // because of R2.
  const r2 = r2FromEnv(process.env as Record<string, string | undefined>);
  async function storeFile(opts: {
    teamId?: number | null; memberId?: number | null; kind: string;
    filename?: string | null; mimeType?: string | null; buffer: Buffer;
  }): Promise<number> {
    const info = await dbRun(
      `INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      opts.teamId ?? null, opts.memberId ?? null, opts.kind,
      opts.filename ?? null, opts.mimeType ?? null, opts.buffer.length, r2 ? Buffer.alloc(0) : opts.buffer
    );
    const id = Number(info.lastInsertRowid);
    if (r2) {
      const key = fileKey("stored_files", id);
      try {
        await r2.put(key, opts.buffer, opts.mimeType);
        await dbRun("UPDATE stored_files SET r2_key = ? WHERE id = ?", key, id);
      } catch (e) {
        console.error("R2 upload failed; keeping the file in the database:", (e as any)?.message || e);
        await dbRun("UPDATE stored_files SET data = ? WHERE id = ?", opts.buffer, id);
      }
    }
    return id;
  }
  /** Delete a stored_files row and its R2 copy (best effort for R2). */
  async function deleteStoredRow(id: number): Promise<void> {
    await dbRun("DELETE FROM stored_files WHERE id = ?", id);
    // The key is derived from the id, so the object goes too even if a
    // background copy hadn't recorded r2_key yet (the copier also removes
    // an upload whose row disappeared meanwhile).
    if (r2) {
      try { await r2.del(fileKey("stored_files", id)); } catch (e) { console.error("R2 delete failed:", (e as any)?.message || e); }
    }
  }
  /** The bytes of a stored file: R2 first, the database copy as fallback. */
  async function readStoredBytes(table: "stored_files" | "message_images", id: number, r2Key: string | null, blobLen: number): Promise<Buffer | null> {
    if (r2Key && r2) {
      try {
        const b = await r2.get(r2Key);
        if (b) return b;
      } catch (e) {
        console.error("R2 read failed; trying the database copy:", (e as any)?.message || e);
      }
    }
    // Bytes that live only in R2 (database column cleared) and couldn't be
    // read are missing. Anything else is the database copy, which may
    // legitimately be an empty file.
    if (r2Key && blobLen === 0) return null;
    const row = (await dbGet(`SELECT data FROM ${table} WHERE id = ?`, id)) as any;
    if (row?.data == null) return null;
    return Buffer.from(row.data as ArrayBuffer);
  }

  registerNotebookFileRoutes(app,{requireAuth,ensureRolesSeeded,storeFile,deleteStoredRow,readStoredBytes},new NotebookStore());

  // Copy existing files into R2 in the background (the owner asked for every
  // existing image and file to move). Each copy is verified by size before
  // the row points at R2. The database copy is cleared only when
  // R2_PRUNE_DB=1, and only after R2's copy is verified again.
  let r2Syncing = false;
  const r2Progress = { copied: 0, pruned: 0, failed: 0, lastRun: "" as string };
  // Each pass walks forward by id and wraps around, so rows that keep
  // failing can never stop the rest from being copied or pruned.
  const r2Cursor: Record<string, number> = {};
  async function syncFilesToR2(): Promise<void> {
    if (!r2 || r2Syncing || process.env.R2_SYNC === "off") return;
    r2Syncing = true;
    try {
      for (const table of ["stored_files", "message_images"] as const) {
        const copyKey = `copy:${table}`;
        const rows = (await dbAll(
          `SELECT id, mime_type, length(data) AS n FROM ${table} WHERE r2_key IS NULL AND length(data) > 0 AND id > ? ORDER BY id LIMIT 25`,
          r2Cursor[copyKey] ?? 0,
        )) as any[];
        r2Cursor[copyKey] = rows.length ? rows[rows.length - 1].id : 0;
        for (const r of rows) {
          try {
            const data = (await dbGet(`SELECT data FROM ${table} WHERE id = ?`, r.id)) as any;
            if (!data?.data) continue;
            const buf = Buffer.from(data.data as ArrayBuffer);
            const key = fileKey(table, r.id);
            await r2.put(key, buf, r.mime_type);
            if ((await r2.size(key)) !== buf.length) throw new Error("size mismatch after upload");
            const upd = (await dbRun(`UPDATE ${table} SET r2_key = ? WHERE id = ? AND r2_key IS NULL`, key, r.id)) as any;
            if (Number(upd?.changes)) r2Progress.copied++;
            else if (!(await dbGet(`SELECT id FROM ${table} WHERE id = ?`, r.id))) {
              // Deleted while we copied it: don't leave its bytes behind.
              await r2.del(key).catch(() => undefined);
            }
          } catch (e) {
            r2Progress.failed++;
            console.error(`R2 copy of ${table} #${r.id} failed:`, (e as any)?.message || e);
          }
        }
        if (process.env.R2_PRUNE_DB === "1") {
          const pruneKey = `prune:${table}`;
          const done = (await dbAll(
            `SELECT id, r2_key, length(data) AS n FROM ${table} WHERE r2_key IS NOT NULL AND length(data) > 0 AND id > ? ORDER BY id LIMIT 25`,
            r2Cursor[pruneKey] ?? 0,
          )) as any[];
          r2Cursor[pruneKey] = done.length ? done[done.length - 1].id : 0;
          for (const r of done) {
            try {
              const have = await r2.size(r.r2_key);
              if (have === Number(r.n)) {
                await dbRun(`UPDATE ${table} SET data = ? WHERE id = ?`, Buffer.alloc(0), r.id);
                r2Progress.pruned++;
              } else {
                // Kept in the database: R2's copy is missing or the wrong size.
                r2Progress.failed++;
                console.error(`R2 prune skipped ${table} #${r.id}: expected ${r.n} bytes, R2 has ${have ?? "nothing"}`);
              }
            } catch (e) {
              r2Progress.failed++;
              console.error(`R2 verify of ${table} #${r.id} failed:`, (e as any)?.message || e);
            }
          }
        }
      }
    } catch (e) {
      console.error("R2 sync failed:", (e as any)?.message || e);
    } finally {
      r2Progress.lastRun = new Date().toISOString();
      r2Syncing = false;
    }
  }
  // Owner: how far the move to R2 has got.
  app.get("/api/owner/r2-status", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const count = async (sql: string) => Number(((await dbGet(sql)) as any)?.n) || 0;
    const tables: Record<string, any> = {};
    for (const t of ["stored_files", "message_images"]) {
      tables[t] = {
        total: await count(`SELECT COUNT(*) AS n FROM ${t}`),
        inR2: await count(`SELECT COUNT(*) AS n FROM ${t} WHERE r2_key IS NOT NULL`),
        waiting: await count(`SELECT COUNT(*) AS n FROM ${t} WHERE r2_key IS NULL AND length(data) > 0`),
        dbCopiesLeft: await count(`SELECT COUNT(*) AS n FROM ${t} WHERE r2_key IS NOT NULL AND length(data) > 0`),
      };
    }
    res.json({ configured: !!r2, pruning: process.env.R2_PRUNE_DB === "1", tables, progress: r2Progress });
  });
  if (r2) {
    const every = Number(process.env.R2_SYNC_MS) || 60_000;
    setTimeout(() => void syncFilesToR2(), Math.min(every, 10_000)).unref();
    setInterval(() => void syncFilesToR2(), every).unref();
  }
  const fileUrl = (id: number): string => `/api/files/${id}`;
  /** Delete a member's own previous avatar file — only when the stored file
   *  is an avatar uploaded by one of `memberIds` and no other member row
   *  still points at it. A URL alone is never proof of ownership. */
  async function deleteOwnedAvatarFile(url: string | null | undefined, memberIds: number[]): Promise<void> {
    try {
      const m = /^\/api\/files\/(\d+)$/.exec(String(url || ""));
      if (!m || !memberIds.length) return;
      const id = Number(m[1]);
      const row = (await dbGet("SELECT member_id, kind FROM stored_files WHERE id = ?", id)) as any;
      if (!row || row.kind !== "avatar" || !memberIds.includes(Number(row.member_id))) return;
      const ph = memberIds.map(() => "?").join(",");
      const others = (await dbGet(`SELECT COUNT(*) AS n FROM members WHERE avatar_url = ? AND id NOT IN (${ph})`, url, ...memberIds)) as any;
      if ((others?.n || 0) > 0) return;
      await deleteStoredRow(id);
    } catch { /* best effort */ }
  }
  /** Delete the stored_files row behind a /api/files/:id URL (best effort).
   *  Also removes legacy /uploads/ disk files when they still exist. */
  async function deleteStoredFileByUrl(url: string | null | undefined): Promise<void> {
    try {
      const m = /^\/api\/files\/(\d+)$/.exec(String(url || ""));
      if (m) {
        await deleteStoredRow(Number(m[1]));
        return;
      }
      const d = /^\/uploads\/(.+)$/.exec(String(url || ""));
      if (d) {
        const p = path.join(uploadDir, path.basename(d[1]));
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    } catch { /* best effort */ }
  }

  // File serving. Team files require active-team membership (owner bypasses);
  // avatars are visible to any signed-in user, like member names are.
  app.get("/api/files/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(404).end();
      // Metadata only: the BLOB is read after the auth + ETag checks, so a
      // 304 revalidation never pulls the file out of the database.
      const f = (await dbGet(
        `SELECT id, team_id, kind, filename, mime_type, r2_key, length(data) AS blob_len FROM stored_files WHERE id = ? AND data IS NOT NULL`, id
      )) as any;
      if (!f || f.kind === "notebook") return res.status(404).end();
      let email = String((auth as any).email || "");
      if (!email) {
        const me = (await dbGet(`SELECT email FROM members WHERE id = ?`, auth.memberId)) as any;
        email = String(me?.email || "");
      }
      const isOwner = ownerEmails().includes(email.toLowerCase());
      if (!isOwner && f.kind !== "avatar") {
        if (!f.team_id || f.team_id !== auth.teamId) return res.status(403).end();
      }
      // Uploads are untrusted and their MIME type is whatever the uploader
      // sent. Since the files cookie makes these URLs openable directly in a
      // tab, only media renders inline; anything else (HTML, ...) is forced
      // to an opaque download. The sandbox CSP + nosniff mean
      // nothing served here can ever run script on the app's origin.
      const mime = String(f.mime_type || "").toLowerCase().split(";")[0].trim();
      const inlineSafe = INLINE_SAFE_MIME.has(mime) || mime.startsWith("video/") || mime.startsWith("audio/");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      // Revalidate every use (no stale reuse after logout / account switch);
      // stored file content never changes, so an id-based ETag makes repeat
      // loads a cheap 304 — after the auth checks above.
      const etag = `"f${f.id}"`;
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, no-cache");
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      const buf = await readStoredBytes("stored_files", f.id, f.r2_key, Number(f.blob_len) || 0);
      if (!buf) return res.status(404).end();
      res.setHeader("Content-Type", inlineSafe ? mime : "application/octet-stream");
      res.setHeader("Content-Length", buf.length);
      const safe = String(f.filename || "file").replace(/["\r\n]/g, "").slice(0, 120) || "file";
      res.setHeader("Content-Disposition", `${inlineSafe ? "inline" : "attachment"}; filename="${safe}"`);
      res.send(buf);
    } catch (e) {
      console.error("file serve error:", (e as any)?.message || e);
      res.status(500).end();
    }
  });

  // Chat images, served from the database so they survive restarts and
  // redeploys (Render's disk is ephemeral). Team-scoped: you can only load
  // images from messages in your active workspace.
  app.get("/api/message-images/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).end();
    const row = (await dbGet(
      `SELECT mi.id AS id, mi.mime_type AS mime_type, mi.r2_key AS r2_key, length(mi.data) AS blob_len FROM message_images mi
       JOIN messages m ON m.id = mi.message_id
       WHERE mi.id = ? AND m.team_id = ?`,
      id, auth.teamId
    )) as any;
    if (!row) return res.status(404).end();
    const buf = await readStoredBytes("message_images", row.id, row.r2_key, Number(row.blob_len) || 0);
    if (!buf) return res.status(404).end();
    res.setHeader("Content-Type", row.mime_type || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buf);
  });

  app.post("/api/messages/upload", upload.single('file'), async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    // The sender is the signed-in member, never a client-claimed id/name.
    const { content } = req.body;
    const sender = (await dbGet("SELECT id, team_id, name FROM members WHERE id = ?", auth.memberId)) as any;
    if (!sender || sender.team_id !== auth.teamId) {
      return res.status(403).json({ error: "Not your workspace" });
    }
    const sender_id = sender.id;
    const sender_name = sender.name;
    const timestamp = new Date().toISOString();
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
    , sender_id, content || '', timestamp, null, fileName, fileSize, fileUpdated, auth.teamId, channelId, replyToId));

    // Persist the upload in the database so it survives restarts/redeploys
    // (disk is ephemeral). The message row carries the DB-backed URL.
    let servedPath: string | null = null;
    try {
      if (req.file?.buffer?.length) {
        const fid = await storeFile({
          teamId: auth.teamId, memberId: Number(sender_id) || auth.memberId, kind: "chat",
          filename: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer,
        });
        servedPath = fileUrl(fid);
        await dbRun("UPDATE messages SET file_path = ? WHERE id = ?", servedPath, info.lastInsertRowid);
      }
    } catch (e) {
      console.error("[chat] file DB persist failed:", (e as any)?.message || e);
    }

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
      file_path: servedPath,
      file_name: fileName,
      file_size: fileSize,
      file_updated: fileUpdated,
      timestamp
    });
    
    res.json({ 
      id: info.lastInsertRowid, 
      file_path: servedPath,
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
      const existing: any = (await dbGet("SELECT team_id, sender_id FROM messages WHERE id = ?", messageId));
      if (!existing || existing.team_id !== auth.teamId) {
        return res.status(404).json({ error: "Message not found" });
      }
      // Authors may delete their own messages; anyone else's (and silent,
      // un-broadcast deletion) needs moderator rights.
      const moderator = await canModerateMessages(auth.memberId, auth.teamId);
      if (!messageActionAllowed({ action: silent ? "silent-delete" : "delete", isAuthor: existing.sender_id === auth.memberId, moderator })) {
        return res.status(403).json({ error: "You can only delete your own messages" });
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

    const existing: any = (await dbGet("SELECT team_id, sender_id, channel_id, deleted_at FROM messages WHERE id = ?", messageId));
    if (!existing || existing.team_id !== auth.teamId || existing.deleted_at) {
      return res.status(404).json({ error: "Message not found" });
    }
    const text = String(content).trim().slice(0, 4000);
    if (!text) return res.status(400).json({ error: "A message can't be empty — delete it instead" });
    const now = new Date().toISOString();

    // The author's own edit: everyone sees it, marked "edited".
    if (messageActionAllowed({ action: "edit-own", isAuthor: existing.sender_id === auth.memberId, moderator: false })) {
      await dbRun("UPDATE messages SET content = ?, updated_at = ?, edited_at = ? WHERE id = ?", text, now, now, messageId);
      broadcastToTeam(auth.teamId, { type: "message_updated", id: Number(messageId), channel_id: existing.channel_id ?? null, content: text, edited_at: now });
      return res.json({ success: true, content: text, edited_at: now });
    }
    // Someone else's message: a silent moderation edit (Settings → Admin).
    if (!messageActionAllowed({ action: "edit", isAuthor: false, moderator: await canModerateMessages(auth.memberId, auth.teamId) })) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }
    (await dbRun("UPDATE messages SET content = ?, updated_at = ? WHERE id = ?", text, now, messageId));
    // No broadcast for silent edit
    res.json({ success: true });
  });

  // ---- Message reactions (Discord-style) ----
  // Toggle: POST adds the reaction if absent, removes it if the user already reacted.
  app.post("/api/messages/:id/reactions", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const messageId = parseInt(req.params.id, 10);
      const emoji = String(req.body?.emoji || "").slice(0, 64);
      if (!Number.isFinite(messageId) || !emoji) {
        return res.status(400).json({ error: "Message id and emoji are required" });
      }
      const msg: any = await dbGet("SELECT id, team_id, channel_id FROM messages WHERE id = ?", messageId);
      if (!msg || msg.team_id !== auth.teamId) {
        return res.status(404).json({ error: "Message not found" });
      }
      // Custom emoji (custom:<id>) may only be used by their owner.
      if (emoji.startsWith("custom:")) {
        const ce: any = await dbGet("SELECT id, member_id FROM custom_emoji WHERE id = ?", emoji.slice(7));
        if (!ce || ce.member_id !== auth.memberId) {
          return res.status(403).json({ error: "That custom reaction isn't yours to use" });
        }
      }
      const existing: any = await dbGet(
        "SELECT id FROM message_reactions WHERE message_id = ? AND member_id = ? AND emoji = ?",
        messageId, auth.memberId, emoji
      );
      let added: boolean;
      if (existing) {
        await dbRun("DELETE FROM message_reactions WHERE id = ?", existing.id);
        added = false;
      } else {
        await dbRun(
          "INSERT INTO message_reactions (message_id, member_id, emoji) VALUES (?, ?, ?)",
          messageId, auth.memberId, emoji
        );
        added = true;
      }
      const reactions = await getMessageReactions([messageId], auth.memberId);
      // Broadcast so every client updates live.
      try {
        broadcastToTeam(auth.teamId, {
          type: "message:reaction",
          messageId, emoji, added, memberId: auth.memberId,
          reactions: reactions[messageId] || [],
        });
      } catch {}
      res.json({ ok: true, added, reactions: reactions[messageId] || [] });
    } catch (e: any) {
      console.error("reaction toggle error:", e?.message);
      res.status(500).json({ error: "Could not update reaction" });
    }
  });

  // ---- Custom personal reactions ----
  // Each user can upload their own reaction images in settings; only the
  // uploader can use them (referenced as "custom:<id>" in reactions).
  app.get("/api/chat/custom-emoji", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const rows = await dbAll(
      "SELECT id, name, image_url, created_at FROM custom_emoji WHERE member_id = ? AND team_id = ? ORDER BY created_at",
      auth.memberId, auth.teamId
    );
    res.json(rows);
  });

  app.post("/api/chat/custom-emoji", (req, res) => {
    const single = upload.single("image");
    single(req, res, async (err: any) => {
      try {
        const auth = await requireAuth(req, res);
        if (!auth) return;
        if (err) return res.status(400).json({ error: err.message || "Upload failed" });
        const file = (req as any).file;
        const name = String(req.body?.name || "").trim().slice(0, 32);
        if (!file) return res.status(400).json({ error: "No image uploaded" });
        if (!name) return res.status(400).json({ error: "Give your reaction a name" });
        if (!String(file.mimetype || "").startsWith("image/")) {
          return res.status(400).json({ error: "Upload an image file" });
        }
        const count: any = await dbGet(
          "SELECT COUNT(*) AS n FROM custom_emoji WHERE member_id = ? AND team_id = ?",
          auth.memberId, auth.teamId
        );
        if ((count?.n || 0) >= 25) {
          return res.status(400).json({ error: "You have 25 custom reactions — delete one to add another" });
        }
        const fid = await storeFile({
          teamId: auth.teamId, memberId: auth.memberId, kind: "emoji",
          filename: file.originalname, mimeType: file.mimetype, buffer: file.buffer,
        });
        const info = await dbRun(
          "INSERT INTO custom_emoji (member_id, team_id, name, image_url) VALUES (?, ?, ?, ?)",
          auth.memberId, auth.teamId, name, fileUrl(fid)
        );
        res.json({ ok: true, id: info.lastInsertRowid, name, image_url: fileUrl(fid) });
      } catch (e: any) {
        console.error("custom emoji upload error:", e?.message);
        res.status(500).json({ error: "Could not save that reaction" });
      }
    });
  });

  app.delete("/api/chat/custom-emoji/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const row: any = await dbGet(
      "SELECT id, member_id, image_url FROM custom_emoji WHERE id = ? AND team_id = ?",
      req.params.id, auth.teamId
    );
    if (!row || row.member_id !== auth.memberId) {
      return res.status(404).json({ error: "Reaction not found" });
    }
    await dbRun("DELETE FROM message_reactions WHERE emoji = ?", `custom:${row.id}`);
    await dbRun("DELETE FROM custom_emoji WHERE id = ?", row.id);
    await deleteStoredFileByUrl(row.image_url);
    res.json({ ok: true });
  });

  // ---- Resources: team link library (replaces AI Scout) ----
  const RESOURCE_CATEGORIES = [
    "Game Updates", "Parts & Suppliers", "CAD & Design", "Code & Programming",
    "Outreach", "Videos", "Community", "Other",
  ] as const;

  app.get("/api/resources", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const rows = await dbAll(
      `SELECT r.*, m.name AS created_by_name FROM resources r
       LEFT JOIN members m ON m.id = r.created_by
       WHERE r.team_id = ? ORDER BY r.created_at DESC`,
      auth.teamId
    );
    res.json(rows);
  });

  // Paste a blob of text (chat logs, notes) — Bruno AI extracts every link,
  // writes a title + description, and categorizes each one.
  const resourceLocks = new Map<number, Promise<unknown>>();
  /** Run `fn` after any save already running for this team. */
  function withResourceLock<T>(teamId: number, fn: () => Promise<T>): Promise<T> {
    const prev = resourceLocks.get(teamId) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    resourceLocks.set(teamId, tail);
    void tail.then(() => { if (resourceLocks.get(teamId) === tail) resourceLocks.delete(teamId); });
    return run;
  }

  app.post("/api/resources/parse", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const text = String(req.body?.text || "").slice(0, 30000);
      if (!text.trim()) return res.status(400).json({ error: "Paste some text first" });
      // Fast path: pull out raw URLs even before AI.
      const urlRe = /https?:\/\/[^\s<>"')\]]+/gi;
      const found = [...new Set((text.match(urlRe) || []).map((u) => u.replace(/[.,;!?]+$/, "")))].slice(0, 50);
      if (!found.length) return res.status(422).json({ error: "No links found in that text" });
      let items: any[] = found.map((url) => ({ url, title: "", description: "", category: "Other" }));
      if (isGeminiConfigured()) {
        try {
          const system = `You organize a robotics team's saved link library. Given pasted text containing links, return ONLY a JSON array — no markdown fences, no commentary. Each element: {"url": string, "title": string, "description": string, "category": string}.
Rules:
- One element per distinct URL in the text (dedupe).
- "title": short human title (page/site/video name); guess from surrounding text or the URL itself.
- "description": one sentence on what the link is useful for, from context clues.
- "category" must be exactly one of: ${RESOURCE_CATEGORIES.join(", ")}.
- Skip image-only or tracking URLs with no useful content.`;
          const raw = await aiGenerate(system, text.slice(0, 15000), 4096);
          const parsed = JSON.parse(String(raw).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
          if (Array.isArray(parsed) && parsed.length) {
            items = parsed
              .filter((p: any) => p && typeof p.url === "string" && /^https?:\/\//i.test(p.url))
              .slice(0, 50)
              .map((p: any) => ({
                url: p.url,
                title: String(p.title || "").slice(0, 200),
                description: String(p.description || "").slice(0, 500),
                category: (RESOURCE_CATEGORIES as readonly string[]).includes(p.category) ? p.category : "Other",
              }));
          }
        } catch (e: any) {
          console.error("resources AI parse error:", e?.message);
        }
      }
      // Mark what's already in the library (or repeated in the paste) so the
      // preview can leave it out; the save checks again.
      const existing = ((await dbAll("SELECT url FROM resources WHERE team_id = ?", auth.teamId)) as any[]).map((r) => String(r.url));
      const savedKeys = new Set(existing.map(resourceKey));
      const seen = new Set<string>();
      items = items.map((it) => {
        const k = resourceKey(it.url);
        const duplicate = savedKeys.has(k) ? "saved" : seen.has(k) ? "repeat" : undefined;
        seen.add(k);
        return duplicate ? { ...it, duplicate } : it;
      });
      const fresh = items.filter((it) => !it.duplicate).length;
      res.json({ items, count: items.length, fresh, duplicates: items.length - fresh });
    } catch (e: any) {
      console.error("resources parse error:", e?.message);
      res.status(500).json({ error: "Could not read those links" });
    }
  });

  app.post("/api/resources", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
    // One save per team at a time: two imports of the same links at once
    // must not both pass the duplicate check.
    const result = await withResourceLock(auth.teamId, async () => {
      const saved: any[] = [];
      const skipped: { url: string; title: string }[] = [];
      // Same page = same key (www, https, trailing slash, tracking params,
      // YouTube link forms), against the library and earlier links in this save.
      const keys = new Set(((await dbAll("SELECT url FROM resources WHERE team_id = ?", auth.teamId)) as any[]).map((r) => resourceKey(r.url)));
      for (const it of items.slice(0, 50)) {
        const url = String(it?.url || "").trim().slice(0, 2000);
        if (!/^https?:\/\//i.test(url)) continue;
        const title = String(it?.title || "").trim().slice(0, 200) || url;
        const description = String(it?.description || "").trim().slice(0, 1000);
        const category = (RESOURCE_CATEGORIES as readonly string[]).includes(it?.category) ? it.category : "Other";
        const key = resourceKey(url);
        if (keys.has(key)) { skipped.push({ url, title }); continue; }
        keys.add(key);
        const info = await dbRun(
          "INSERT INTO resources (team_id, url, title, description, category, created_by) VALUES (?, ?, ?, ?, ?, ?)",
          auth.teamId, url, title, description, category, auth.memberId
        );
        saved.push({ id: info.lastInsertRowid, url, title, description, category });
      }
      return { saved, skipped };
    });
    if (result.saved.length) broadcastToTeam(auth.teamId, { type: "resources_changed" });
    res.json({ ok: true, saved: result.saved, count: result.saved.length, skipped: result.skipped });
  });

  app.delete("/api/resources/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const row: any = await dbGet("SELECT id FROM resources WHERE id = ? AND team_id = ?", req.params.id, auth.teamId);
    if (!row) return res.status(404).json({ error: "Not found" });
    await dbRun("DELETE FROM resources WHERE id = ?", req.params.id);
    broadcastToTeam(auth.teamId, { type: "resources_changed" });
    res.json({ ok: true });
  });

  // ---- CAD parts: invoice import (reuses the Bruno invoice parser) ----
  app.post("/api/cad/parts/import-invoice/parse", (req, res) =>
    handleInvoiceParse(req, res, invoiceUpload, "file", "auth")
  );

  // Notifications
  app.get("/api/notifications/:userId", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const userId = parseInt(req.params.userId, 10);
    // Notifications are private to their recipient — admins included (an
    // admin check here let any workspace's admin read anyone's inbox).
    if (userId !== auth.memberId) {
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

  app.post("/api/notifications/unread", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid" });
    await dbBatch(ids.map((id: any) => ({ sql: "UPDATE notifications SET is_read = 0 WHERE id = ? AND user_id = ?", args: [id, auth.memberId] })));
    res.json({ success: true });
  });

  // Delete a single notification (must belong to the requester).
  app.delete("/api/notifications/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    await dbRun("DELETE FROM notifications WHERE id = ? AND user_id = ?", req.params.id, auth.memberId);
    res.json({ success: true });
  });

  // Clear all notifications for the requester.
  app.delete("/api/notifications", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    await dbRun("DELETE FROM notifications WHERE user_id = ?", auth.memberId);
    res.json({ success: true });
  });

  // --- Link preview: fetch OpenGraph metadata for chat embeds ---
  // Server-side fetch avoids CORS issues. 8s timeout, 1MB cap, HTML only.
  app.get("/api/link-preview", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const rawUrl = String(req.query.url || '').slice(0, 2048);
    if (!rawUrl) return res.status(400).json({ error: "Missing url" });
    let parsed: URL;
    try {
      parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }
    // SSRF guard: the resolved address (every redirect hop too) must be public.
    try { checkPublicUrl(parsed.toString()); } catch {
      return res.status(400).json({ error: "Private URLs not allowed" });
    }
    try {
      const { response: resp } = await safeGet(parsed.toString(), {
        headers: { 'User-Agent': 'ControlPoint-LinkPreview/1.0', 'Accept': 'text/html' },
        timeoutMs: 8000,
        maxBytes: 1024 * 1024,
        responseType: 'arraybuffer',
      });
      const ctype = String(resp.headers?.['content-type'] || '');
      if (resp.status < 200 || resp.status >= 300 || !ctype.includes('text/html')) {
        return res.json({ url: parsed.toString(), site: parsed.hostname });
      }
      const buf = Buffer.from(resp.data as ArrayBuffer);
      const html = new TextDecoder().decode(buf.subarray(0, 200 * 1024)); // only need the head
      const meta = (prop: string): string | null => {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
               || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
        return m ? m[1].slice(0, 500) : null;
      };
      const titleM = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
      res.json({
        url: parsed.toString(),
        site: parsed.hostname,
        title: meta('og:title') || (titleM ? titleM[1].trim() : null),
        description: meta('og:description') || meta('description'),
        image: meta('og:image'),
      });
    } catch (e: any) {
      res.json({ url: parsed.toString(), site: parsed.hostname });
    }
  });

  // --- Feedback: any user can send feedback to the app owner ---
  app.post("/api/feedback", (req, res, next) => {
    feedbackUpload.single('attachment')(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Invalid file" });
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
      const file = (req as any).file;
      // Persist the attachment in the database so it survives restarts.
      let screenshotUrl: string | null = null;
      if (file?.buffer?.length) {
        const fid = await storeFile({
          teamId: auth.teamId, memberId: auth.teamless ? null : auth.memberId, kind: "feedback",
          filename: file.originalname, mimeType: file.mimetype, buffer: file.buffer,
        });
        screenshotUrl = fileUrl(fid);
      }
      const attachmentName = file ? file.originalname : null;
      const attachmentType = file ? file.mimetype : null;
      const info = (await dbRun(
        "INSERT INTO feedback (team_id, user_id, user_name, user_email, category, message, screenshot_url, attachment_name, attachment_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        auth.teamId, auth.teamless ? null : auth.memberId, me?.name || '', me?.email || '', (category || 'general').toString().slice(0, 40), clean.slice(0, 5000), screenshotUrl, attachmentName, attachmentType
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
        (SELECT COUNT(*) FROM feedback f WHERE f.team_id = t.id) as feedback_count,
        (SELECT MAX(msg.timestamp) FROM messages msg WHERE msg.team_id = t.id) as last_message_at
      FROM teams t ORDER BY t.id DESC
    `));
    const totals = (await dbGet(`
      SELECT (SELECT COUNT(*) FROM members) as users,
             (SELECT COUNT(*) FROM teams) as teams,
             (SELECT COUNT(*) FROM messages) as messages,
             (SELECT COUNT(*) FROM feedback) as feedback,
             (SELECT COUNT(*) FROM feedback WHERE status = 'new') as new_feedback,
             (SELECT COUNT(*) FROM client_errors WHERE created_at >= datetime('now', '-7 days')) as crashes_7d
    `));
    res.json({ totals, teams, email: getEmailHealth() });
  });

  // The app owner deletes any workspace (abandoned, spam, duplicates). Same
  // cleanup as an admin's delete. The workspace's name must be typed back.
  app.delete("/api/owner/teams/:id", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const teamId = parseInt(req.params.id, 10);
    const team = Number.isFinite(teamId) ? ((await dbGet("SELECT id, name FROM teams WHERE id = ?", teamId)) as any) : null;
    if (!team) return res.status(404).json({ error: "Workspace not found" });
    if (String(req.body?.confirm ?? "").trim() !== String(team.name).trim()) {
      return res.status(400).json({ error: "Type the workspace's name to delete it" });
    }
    if ((auth as any).teamId === teamId) {
      return res.status(400).json({ error: "You're signed in to this workspace. Switch to another one first, or delete it from its settings." });
    }
    const members = (await dbGet("SELECT COUNT(*) AS n FROM members WHERE team_id = ?", teamId)) as any;
    await deleteWorkspace(teamId, { keepMemberId: null, keepSessionId: "" });
    console.log(`[owner] workspace ${teamId} (${team.name}) deleted with ${members?.n ?? 0} members`);
    res.json({ ok: true, deleted: { id: teamId, name: team.name, members: Number(members?.n || 0) } });
  });

  // Workspaces sharing an FTC number from before the one-per-number rule.
  // Listed for the owner to sort out by hand; nothing is merged or changed.
  app.get("/api/owner/ftc-duplicates", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const rows = (await dbAll(`
      SELECT t.ftc_team_number AS ftc, t.id, t.name,
        (SELECT COUNT(*) FROM members m WHERE m.team_id = t.id AND COALESCE(m.is_active, 1) = 1) AS members
      FROM teams t
      WHERE t.ftc_team_number IN (SELECT ftc_team_number FROM teams WHERE ftc_team_number IS NOT NULL GROUP BY ftc_team_number HAVING COUNT(*) > 1)
      ORDER BY t.ftc_team_number, t.id
    `)) as any[];
    const groups: Record<string, any[]> = {};
    for (const r of rows) (groups[String(r.ftc)] ||= []).push({ id: r.id, name: r.name, members: Number(r.members) || 0 });
    res.json(Object.entries(groups).map(([ftc, teams]) => ({ ftc: Number(ftc), teams })));
  });

  // ---- Client error reports (browser crashes) ----
  // Anyone may report (a crash can happen before or after sign-in); input is
  // size-capped, rate-limited per IP and stored without query strings or
  // form contents. Only the owner can read them.
  const clientErrorLimiter = new RateLimiter();
  setInterval(() => clientErrorLimiter.sweep(), 10 * 60 * 1000).unref();
  const CLIENT_ERROR_KINDS = new Set(["render", "uncaught", "unhandledrejection", "chunk"]);
  app.post("/api/client-errors", async (req, res) => {
    if (clientErrorLimiter.hit(clientIp(req), { max: 30, windowMs: 10 * 60 * 1000 }) > 0) return res.status(204).end();
    const b = req.body || {};
    const kind = CLIENT_ERROR_KINDS.has(b.kind) ? b.kind : "uncaught";
    const message = String(b.message || "").slice(0, 500);
    if (!message) return res.status(204).end();
    const auth = await getAuth(req).catch(() => null);
    try {
      await dbRun(
        "INSERT INTO client_errors (member_id, team_id, kind, message, stack, component_stack, route, release, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        auth?.memberId || null, auth?.teamId ?? null, kind, message,
        String(b.stack || "").slice(0, 4000), String(b.componentStack || "").slice(0, 4000),
        String(b.route || "").split("?")[0].slice(0, 200), String(b.release || "").slice(0, 80),
        String(req.headers["user-agent"] || "").slice(0, 300),
      );
      // Keep the table bounded: drop everything but the newest 5,000 rows.
      if (Math.random() < 0.05) await pruneClientErrors();
    } catch (e) { console.error("client error report failed:", e); }
    res.status(204).end();
  });

  app.get("/api/owner/client-errors", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const rows = await dbAll(
      `SELECT e.id, e.created_at, e.kind, e.message, e.stack, e.component_stack, e.route, e.release, e.user_agent,
              e.team_id, t.name AS team_name
       FROM client_errors e LEFT JOIN teams t ON t.id = e.team_id
       ORDER BY e.id DESC LIMIT 200`
    );
    // Grouped view: same message + route counts once with its latest sighting.
    const groups = await dbAll(
      `SELECT message, route, kind, COUNT(*) AS n, MAX(created_at) AS last_seen
       FROM client_errors WHERE created_at >= datetime('now', '-7 days')
       GROUP BY message, route, kind ORDER BY n DESC LIMIT 50`
    );
    res.json({ recent: rows, groups });
  });

  // ---- What's new: owner-edited changelog ----
  // Releases live in changelog_entries; the owner adds and edits them in the
  // Owner console. An empty table is seeded once from the built-in list.
  const rowToEntry = (r: any) => {
    const arr = (v: any) => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
    return { id: Number(r.id), version: r.version, date: r.date, title: r.title, added: arr(r.added), improved: arr(r.improved), fixed: arr(r.fixed), updated_at: r.updated_at, posted_at: r.posted_at || null };
  };
  const listChangelog = async () =>
    ((await dbAll("SELECT * FROM changelog_entries")) as any[]).map(rowToEntry).sort((a, b) => compareVersions(a.version, b.version));
  try {
    // Seeded once (a settings flag, not "the table is empty"): releases the
    // owner deletes stay deleted.
    const seeded = (await dbGet("SELECT value FROM settings WHERE key = 'changelog_seeded'")) as any;
    if (!seeded) {
      const now = new Date().toISOString();
      await dbBatch(CHANGELOG.map((e) => ({
        sql: "INSERT OR IGNORE INTO changelog_entries (version, date, title, added, improved, fixed, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [e.version, e.date, e.title, JSON.stringify(e.added), JSON.stringify(e.improved), JSON.stringify(e.fixed), now],
      })).concat([{ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('changelog_seeded', '1')", args: [] }]));
    }
  } catch (e) { console.error("changelog seed failed:", e); }
  const discordChangelogWebhook = () => {
    const url = (process.env.DISCORD_CHANGELOG_WEBHOOK || "").trim();
    return /^https:\/\/(?:canary\.|ptb\.)?(?:discord|discordapp)\.com\/api\/webhooks\//.test(url) ? url : "";
  };

  // Everyone (signed in or not) reads the releases; there's nothing private in them.
  app.get("/api/changelog", async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-cache");
      res.json((await listChangelog()).map(({ id, updated_at, posted_at, ...e }) => e));
    } catch (error) {
      console.error("Error reading changelog:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/owner/changelog", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    res.json({ entries: await listChangelog(), discord: !!discordChangelogWebhook() });
  });

  app.post("/api/owner/changelog", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const v = changelogEntryFrom(req.body);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const e = v.entry;
    if (await dbGet("SELECT id FROM changelog_entries WHERE version = ?", e.version)) return res.status(409).json({ error: `v${e.version} already exists` });
    const info = await dbRun(
      "INSERT INTO changelog_entries (version, date, title, added, improved, fixed, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      e.version, e.date, e.title, JSON.stringify(e.added), JSON.stringify(e.improved), JSON.stringify(e.fixed), new Date().toISOString(),
    );
    res.json({ entry: rowToEntry(await dbGet("SELECT * FROM changelog_entries WHERE id = ?", info.lastInsertRowid)) });
  });

  app.put("/api/owner/changelog/:id", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const id = parseInt(req.params.id, 10);
    if (!(await dbGet("SELECT id FROM changelog_entries WHERE id = ?", id))) return res.status(404).json({ error: "Release not found" });
    const v = changelogEntryFrom(req.body);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const e = v.entry;
    if (await dbGet("SELECT id FROM changelog_entries WHERE version = ? AND id != ?", e.version, id)) return res.status(409).json({ error: `v${e.version} already exists` });
    await dbRun(
      "UPDATE changelog_entries SET version = ?, date = ?, title = ?, added = ?, improved = ?, fixed = ?, updated_at = ? WHERE id = ?",
      e.version, e.date, e.title, JSON.stringify(e.added), JSON.stringify(e.improved), JSON.stringify(e.fixed), new Date().toISOString(), id,
    );
    res.json({ entry: rowToEntry(await dbGet("SELECT * FROM changelog_entries WHERE id = ?", id)) });
  });

  app.delete("/api/owner/changelog/:id", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const info = await dbRun("DELETE FROM changelog_entries WHERE id = ?", parseInt(req.params.id, 10));
    if (!info.changes) return res.status(404).json({ error: "Release not found" });
    res.json({ ok: true });
  });

  // Post a release to the Discord changelog channel (DISCORD_CHANGELOG_WEBHOOK).
  app.post("/api/owner/changelog/:id/discord", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const url = discordChangelogWebhook();
    if (!url) return res.status(400).json({ error: "Set DISCORD_CHANGELOG_WEBHOOK on the server to post to Discord" });
    const id = parseInt(req.params.id, 10);
    const row = await dbGet("SELECT * FROM changelog_entries WHERE id = ?", id);
    if (!row) return res.status(404).json({ error: "Release not found" });
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: changelogDiscordText(rowToEntry(row)), allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return res.status(502).json({ error: `Discord said ${r.status}` });
      await dbRun("UPDATE changelog_entries SET posted_at = ? WHERE id = ?", new Date().toISOString(), id);
      res.json({ entry: rowToEntry(await dbGet("SELECT * FROM changelog_entries WHERE id = ?", id)) });
    } catch (error) {
      console.error("Discord changelog post failed:", error);
      res.status(502).json({ error: "Couldn't reach Discord — try again" });
    }
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
    const fid = parseInt(req.params.id, 10);
    if (status === 'resolved') {
      // Notify the reporter, then delete so it's gone from the Owner Portal.
      const fb = (await dbGet("SELECT id, user_id, category, message FROM feedback WHERE id = ?", fid)) as any;
      if (fb?.user_id) {
        const preview = String(fb.message || '').slice(0, 80);
        await createNotification(
          fb.user_id,
          `Your feedback${fb.category ? ` (${fb.category})` : ''} has been addressed by the Control Point team. Thanks for reporting it!`,
          'system',
          { feedbackId: fb.id, feedbackPreview: preview }
        );
      }
      (await dbRun("DELETE FROM feedback WHERE id = ?", fid));
    } else {
      const next = 'new';
      (await dbRun("UPDATE feedback SET status = ? WHERE id = ?", next, fid));
    }
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
  // ---- Owner AI overview: timezone-aware day boundaries ----
  // ai_usage.created_at is stored in UTC ('YYYY-MM-DD HH:MM:SS'). The owner
  // thinks in their own timezone, so "today" and the daily history are
  // computed against the ?tz= IANA zone (default America/New_York).
  function resolveTz(tz: unknown): string {
    const s = String(tz || "").trim();
    if (!s) return "America/New_York";
    try { new Intl.DateTimeFormat("en-US", { timeZone: s }); return s; }
    catch { return "America/New_York"; }
  }
  function tzParts(tz: string, ms: number) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    let h = get("hour"); if (h === "24") h = "00"; // hour12:false can emit 24 at midnight
    return { y: get("year"), mo: get("month"), d: get("day"), h, mi: get("minute"), s: get("second") };
  }
  // UTC ms of 00:00:00 in `tz` on the tz-calendar day containing refMs.
  function zonedMidnightUtcMs(tz: string, refMs: number): number {
    const p = tzParts(tz, refMs);
    const datePart = `${p.y}-${p.mo}-${p.d}`;
    const target = Date.parse(datePart + "T00:00:00Z");
    let guess = Date.parse(datePart + "T12:00:00Z");
    for (let i = 0; i < 4; i++) {
      const q = tzParts(tz, guess);
      const asUtc = Date.parse(`${q.y}-${q.mo}-${q.d}T${q.h}:${q.mi}:${q.s}Z`);
      if (!Number.isFinite(asUtc)) break;
      const next = guess + (target - asUtc);
      if (next === guess) break;
      guess = next;
    }
    return guess;
  }
  const utcStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

  app.get("/api/owner/ai-overview", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const tz = resolveTz(req.query.tz);
    const nowMs = Date.now();
    const todayStart = utcStamp(zonedMidnightUtcMs(tz, nowMs));
    const today = (await dbGet(
      "SELECT COUNT(*) AS messages, COALESCE(SUM(total_tokens), 0) AS tokens, COUNT(DISTINCT member_id) AS users FROM ai_usage WHERE created_at >= ?",
      todayStart
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
    // Provider split (Gemini vs Anthropic) for today's traffic — shows the hybrid
    // router working. Older rows default to 'gemini' via the column default.
    const providers = (await dbAll(
      "SELECT provider, COUNT(*) AS messages, COALESCE(SUM(total_tokens), 0) AS tokens FROM ai_usage WHERE created_at >= ? GROUP BY provider",
      todayStart
    )) as any[];
    // Daily history: last 14 tz-calendar days, zero-filled, oldest first.
    // (Loop guards against DST duplicates where two 24h-apart instants share
    // a calendar date.)
    const days: { date: string; startMs: number }[] = [];
    const seen = new Set<string>();
    for (let back = 0; days.length < 14 && back < 40; back++) {
      const startMs = zonedMidnightUtcMs(tz, nowMs - back * 86400000);
      const p = tzParts(tz, startMs + 1000);
      const date = `${p.y}-${p.mo}-${p.d}`;
      if (!seen.has(date)) { seen.add(date); days.unshift({ date, startMs }); }
    }
    const buckets = new Map<string, { messages: number; tokens: number; users: Set<number> }>();
    for (const d of days) buckets.set(d.date, { messages: 0, tokens: 0, users: new Set() });
    const windowStart = days.length ? utcStamp(days[0].startMs) : todayStart;
    const rows = (await dbAll(
      "SELECT created_at, total_tokens, member_id FROM ai_usage WHERE created_at >= ?",
      windowStart
    )) as any[];
    for (const r of rows) {
      const ms = Date.parse(String(r.created_at).replace(" ", "T") + "Z");
      if (!Number.isFinite(ms)) continue;
      const p = tzParts(tz, ms);
      const bucket = buckets.get(`${p.y}-${p.mo}-${p.d}`);
      if (!bucket) continue;
      bucket.messages += 1;
      bucket.tokens += Number(r.total_tokens) || 0;
      if (r.member_id != null) bucket.users.add(r.member_id);
    }
    const daily = days.map((d) => {
      const b = buckets.get(d.date)!;
      return { date: d.date, messages: b.messages, tokens: b.tokens, users: b.users.size };
    });
    res.json({ today, top, flags, providers, daily, tz });
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
    // Bruno's personal facts about them (team facts stay with the team).
    await dbRun("DELETE FROM bruno_memories WHERE scope = 'user' AND member_id = ?", target.id);
    await dbRun("DELETE FROM bruno_nudges_sent WHERE member_id = ?", target.id);
    await dbRun("DELETE FROM members WHERE id = ?", target.id);
    return { ok: true };
  }

  // Owner moves run one at a time, so the last-admin check and the move can't
  // interleave with another move (two admins moved out at once would both see
  // an admin count of 2 and leave the team with none).
  let ownerMoveChain: Promise<unknown> = Promise.resolve();
  function serializeOwnerMove<T>(fn: () => Promise<T>): Promise<T> {
    const run = ownerMoveChain.catch(() => {}).then(fn);
    ownerMoveChain = run.catch(() => {});
    return run;
  }

  // Move a user's membership to a different workspace (silent — no notification)
  app.post("/api/owner/users/:id/move", async (req, res) => {
    const auth = await requireOwner(req, res);
    if (!auth) return;
    const memberId = parseInt(req.params.id, 10);
    const targetTeamId = parseInt((req.body || {}).teamId, 10);
    if (!targetTeamId) return res.status(400).json({ error: "teamId is required" });

    const target = (await dbGet("SELECT id, email, team_id, account_type FROM members WHERE id = ?", memberId)) as any;
    if (!target) return res.status(404).json({ error: "User not found" });
    if (ownerEmails().includes((target.email || "").toLowerCase())) {
      return res.status(403).json({ error: "You can't move the app owner's account." });
    }
    if (target.team_id === targetTeamId) {
      return res.status(400).json({ error: "User is already in that workspace." });
    }
    const destTeam = (await dbGet("SELECT id, name FROM teams WHERE id = ?", targetTeamId)) as any;
    if (!destTeam) return res.status(404).json({ error: "Target workspace not found" });

    // P1 fix: block if they already have a membership in the target workspace
    // (same email, different member row) — moving would create a conflict.
    const existing = (await dbGet(
      "SELECT id FROM members WHERE lower(email) = lower(?) AND team_id = ? AND id != ?",
      target.email, targetTeamId, target.id
    )) as any;
    if (existing) {
      return res.status(400).json({ error: "They already have an account in that workspace. Delete the duplicate first." });
    }

    // Resolve the destination's Member role first, so granting it can be part
    // of the same atomic batch as the move (never moved-but-permissionless).
    await ensureRolesSeeded(targetTeamId);
    const memberRoleId = await systemRoleId(targetTeamId, "Member");
    if (!memberRoleId) return res.status(500).json({ error: "The target workspace has no Member role." });

    const result = await serializeOwnerMove(async () => {
      // Guard: don't strand their old team without an admin. Checked inside
      // the serialized section, against fresh data.
      const fresh = (await dbGet("SELECT team_id, account_type FROM members WHERE id = ?", target.id)) as any;
      if (!fresh || fresh.team_id !== target.team_id) return { error: "That user's workspace just changed — refresh and try again." };
      const perms = await rolePerms(target.id, fresh.team_id);
      const isAdminish = fresh.account_type === "admin" || perms.has("*") || perms.has("manage_members");
      if (isAdminish && (await countAdmins(fresh.team_id)) <= 1) {
        return { error: "They're the last admin of their current team — promote someone else first." };
      }
      // Atomic move: clear old roles/sessions, update team, grant the
      // destination Member role — one batch. Sessions are invalidated so they
      // re-auth into the new workspace. No notification is sent (silent move).
      await dbBatch([
        { sql: "DELETE FROM member_roles WHERE member_id = ?", args: [target.id] },
        { sql: "DELETE FROM sessions WHERE member_id = ?", args: [target.id] },
        { sql: "DELETE FROM stream_sessions WHERE member_id = ?", args: [target.id] },
        { sql: "UPDATE members SET team_id = ?, role = 'member', account_type = 'member' WHERE id = ?", args: [targetTeamId, target.id] },
        { sql: "INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [target.id, memberRoleId] },
      ]);
      return { error: null };
    });
    if (result.error) return res.status(400).json({ error: result.error });

    res.json({ success: true, teamId: targetTeamId, teamName: destTeam.name });
  });

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
      // AI token limits and the chat provider are global and affect every
      // team + API usage: only the app owner may change them.
      if (typeof key === "string" && (key.startsWith("max_tokens_") || key === "chat_provider")) {
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

  // Tasks — multi-assignee support.
  // task_assignees is the source of truth; tasks.assigned_to is legacy.
  const getTaskAssigneeIds = async (taskId: number): Promise<number[]> => {
    try {
      const rows = (await dbAll("SELECT member_id FROM task_assignees WHERE task_id = ?", taskId)) as any[];
      const ids = rows.map((r: any) => r.member_id);
      if (ids.length > 0) return ids;
    } catch { /* table may not exist yet on very old DBs */ }
    // Legacy fallback
    const t = (await dbGet("SELECT assigned_to FROM tasks WHERE id = ?", taskId)) as any;
    return t?.assigned_to ? [t.assigned_to] : [];
  };
  const setTaskAssignees = async (taskId: number, memberIds: number[], teamId: number) => {
    // Validate all members belong to the team
    const valid: number[] = [];
    for (const mid of memberIds) {
      const m = (await dbGet("SELECT team_id FROM members WHERE id = ?", mid)) as any;
      if (m && m.team_id === teamId) valid.push(mid);
    }
    await dbRun("DELETE FROM task_assignees WHERE task_id = ?", taskId);
    for (const mid of valid) {
      await dbRun("INSERT OR IGNORE INTO task_assignees (task_id, member_id) VALUES (?, ?)", taskId, mid);
    }
    // Keep legacy column in sync (first assignee, for old clients)
    await dbRun("UPDATE tasks SET assigned_to = ? WHERE id = ?", valid[0] || null, taskId);
    return valid;
  };
  const withAssignees = async (tasks: any[]) => {
    for (const t of tasks) {
      t.assignee_ids = await getTaskAssigneeIds(t.id);
    }
    return tasks;
  };

  app.get("/api/tasks", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const tasks = (await dbAll("SELECT * FROM tasks WHERE team_id = ?", auth.teamId)) as any[];
      res.json(await withAssignees(tasks));
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const TASK_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];
  /** A known priority, lower-cased, or null. */
  const cleanPriority = (v: unknown): string | null => {
    const p = String(v ?? "").toLowerCase().trim();
    return TASK_PRIORITIES.includes(p) ? p : null;
  };
  /** A valid repeat rule as stored JSON, or null. */
  const cleanRecurrence = (v: unknown): string | null => {
    const r = readRecurrence(v);
    return r ? JSON.stringify(r) : null;
  };

  /**
   * A recurring task was completed: create the next one, once. The new due
   * date steps from the old due date (or today when it had none), so a task
   * finished late doesn't drift. Returns the new task, or null.
   */
  /** The first occurrence after `from` that is not before `today` (jumps, no step cap). */
  function catchUpOccurrence(from: string, rule: { freq: "daily" | "weekly" | "monthly"; interval: number }, today: string): string {
    let due = nextOccurrence(from, rule);
    if (due >= today) return due;
    if (rule.freq === "monthly") {
      while (due < today) due = nextOccurrence(due, rule); // at most ~12 steps a year behind
      return due;
    }
    const step = (rule.freq === "daily" ? 1 : 7) * Math.max(1, rule.interval);
    const behind = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86400000);
    const jump = Math.ceil(behind / step) * step;
    return new Date(Date.parse(`${due}T12:00:00Z`) + jump * 86400000).toISOString().slice(0, 10);
  }

  async function spawnNextRecurringTask(task: any, teamId: number, actorId: number): Promise<any | null> {
    const rule = readRecurrence(task.recurrence);
    if (!rule) return null;
    // Claim the slot first: two completions racing can't both create one.
    const claim = (await dbRun("UPDATE tasks SET next_task_id = -1 WHERE id = ? AND next_task_id IS NULL", task.id)) as any;
    if (!Number(claim?.changes ?? claim?.rowsAffected ?? 0)) return null;
    let due = "";
    let assignees: number[] = [];
    try {
      const tz = await teamTimeZone(teamId);
      const today = todayIn(tz);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(task.due_date || "")) ? String(task.due_date) : today;
      due = catchUpOccurrence(from, rule, today);
      // Current team members only (someone may have left since).
      const current = await getTaskAssigneeIds(Number(task.id));
      for (const mid of current) {
        const m = (await dbGet("SELECT team_id FROM members WHERE id = ? AND COALESCE(is_active, 1) = 1", mid)) as any;
        if (m && m.team_id === teamId) assignees.push(mid);
      }
      // The copy, its link and its assignees are one transaction: either the
      // whole next task exists, or nothing does. We hold the claim (-1), so
      // the link step always applies to us.
      await dbBatch([
        {
          sql: "INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, due_time, is_board, created_at, priority, recurrence) VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)",
          args: [teamId, task.title, task.description ?? "", assignees[0] ?? null, due, task.due_time ?? null, task.is_board ? 1 : 0, new Date().toISOString(), task.priority ?? null, task.recurrence],
        },
        { sql: "UPDATE tasks SET next_task_id = last_insert_rowid() WHERE id = ? AND next_task_id = -1", args: [task.id] },
        ...assignees.map((mid) => ({
          sql: "INSERT OR IGNORE INTO task_assignees (task_id, member_id) SELECT next_task_id, ? FROM tasks WHERE id = ?",
          args: [mid, task.id],
        })),
      ]);
    } catch (e) {
      // Nothing was written: release the claim so the next completion can
      // try again instead of the series silently stopping.
      await dbRun("UPDATE tasks SET next_task_id = NULL WHERE id = ? AND next_task_id = -1", task.id).catch((err) => console.error("could not release repeat claim:", err));
      throw e;
    }
    const nextId = Number(((await dbGet("SELECT next_task_id FROM tasks WHERE id = ?", task.id)) as any)?.next_task_id) || 0;
    if (nextId <= 0) return null;
    for (const mid of assignees) {
      if (mid !== actorId) createNotification(mid, `Next up (repeats): ${task.title}, due ${due}`, "task", { task_id: nextId });
    }
    const created = (await dbGet("SELECT * FROM tasks WHERE id = ?", nextId)) as any;
    created.assignee_ids = assignees;
    broadcastToTeam(teamId, { type: "task_created", task: created });
    return created;
  }

  app.post("/api/tasks", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_tasks");
      if (!auth) return;
      const { title, description, status, assigned_to, assignee_ids, due_date, is_board } = req.body;
      const priority = cleanPriority(req.body?.priority);
      const recurrence = cleanRecurrence(req.body?.recurrence);
      const missingTask = requiredTextError(req.body || {}, REQUIRED.task);
      if (missingTask) return res.status(400).json({ error: missingTask });
      const createdAt = new Date().toISOString();
      // Optional time of day it's due (HH:MM); only meaningful with a date.
      const dueTime = due_date && TASK_TIME_RE.test(String(req.body?.due_time || "")) ? String(req.body.due_time) : null;
      if (req.body?.due_time && !dueTime && due_date) return res.status(400).json({ error: "Use a time like 15:30" });

      // assignee_ids (array) is preferred; assigned_to (single) for legacy clients
      let targetIds: number[] = [];
      if (Array.isArray(assignee_ids)) {
        targetIds = assignee_ids.map(Number).filter((n: number) => Number.isFinite(n));
      } else if (assigned_to) {
        targetIds = [Number(assigned_to)];
      }
      const validIds: number[] = [];
      for (const mid of targetIds) {
        const m = (await dbGet("SELECT team_id FROM members WHERE id = ?", mid)) as any;
        if (m && m.team_id === auth.teamId) validIds.push(mid);
      }
      if (targetIds.length > 0 && validIds.length === 0) {
        return res.status(403).json({ error: "Not your workspace" });
      }
      const legacyAssignedTo = validIds[0] || null;

      const info = (await dbRun("INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, due_time, is_board, created_at, priority, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", auth.teamId, title, description ?? '', ['todo', 'in-progress', 'done'].includes(status) ? status : 'todo', legacyAssignedTo, due_date || null, dueTime, is_board ? 1 : 0, createdAt, priority, recurrence));

      const taskId = Number(info.lastInsertRowid);
      await setTaskAssignees(taskId, validIds, auth.teamId);

      for (const mid of validIds) {
        createNotification(mid, `New task assigned: ${title}`, 'task', { task_id: taskId });
      }
      // Email the assignees (best-effort, never blocks the response).
      void notifyTaskAssignees(taskId, title || "", description || "", due_date || "", auth.teamId, auth.memberId, validIds);

      const created = (await dbGet("SELECT * FROM tasks WHERE id = ?", taskId)) as any;
      created.assignee_ids = validIds;
      broadcastToTeam(auth.teamId, { type: "task_created", task: created });
      res.json({ id: taskId });
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Bulk task import: paste a blob of text (meeting notes, chat logs) — Bruno AI
  // extracts each task with title, description, status, assignee, and due date.
  // Returns parsed items for preview/edit before saving.
  app.post("/api/tasks/parse", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_tasks");
      if (!auth) return;
      const text = String(req.body?.text || "").slice(0, 30000);
      if (!text.trim()) return res.status(400).json({ error: "Paste some text first" });
      // Team roster so the AI can match @names to real members.
      const roster = (await dbAll("SELECT id, name FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", auth.teamId)) as any[];
      const rosterList = roster.map((m: any) => `${m.name} (id ${m.id})`).join(", ") || "no members";
      let items: any[] = [];
      // "Today" is the team's today, not the server's UTC date: an evening
      // entry in the US must not land a day late.
      const tz = await teamTimeZone(auth.teamId, req.body?.tz);
      const todayISO = todayIn(tz);
      const tomorrowISO = new Date(Date.parse(`${todayISO}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      if (isGeminiConfigured()) {
        try {
          const todayStr = new Date(`${todayISO}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
          const system = `You turn pasted team notes/chat into a task list for a robotics team. Return ONLY a JSON array — no markdown fences, no commentary. Each element: {"title": string, "description": string, "status": string, "assignee_name": string|null, "due_date": string|null, "due_time": string|null, "priority": string|null, "repeat": string|null, "source": string}.
"source" is the exact text, copied verbatim from the input, that this task came from (usually its line or sentence).
Today is ${todayStr} (${todayISO}). Use this to resolve EVERY relative date into an exact YYYY-MM-DD.

Rules:
- One element per distinct actionable task in the text (dedupe).
- "title": short imperative title, max 80 chars. Strip the date words out of the title when they become due_date (e.g. "final robot cad due next thursday" → title "Final robot CAD", due_date the coming Thursday).
- "description": one sentence of context from the text, may be "". Do NOT dump the raw date phrase here when it was parsed into due_date.
- "status": exactly one of "todo", "in-progress", "done" (default "todo"; use "in-progress" if the text says someone started it, "done" if completed).
- "assignee_name": match to a name from this roster when the text names someone: ${rosterList}. Use the exact roster name or null.
- "due_date": YYYY-MM-DD. Resolve relative dates against today (${todayISO}):
  * "next thursday" / "thursday" → the next upcoming Thursday (if today is Friday Oct 2, "next thursday" = 2026-10-08)
  * "tomorrow" → ${tomorrowISO}, "today" → ${todayISO}
  * "next week" → 7 days from today; "in 2 weeks" → 14 days from today
  * "by friday", "due monday" → the next upcoming such weekday (if that weekday is today, use today)
  * explicit dates like "Oct 8" or "10/8" → ${todayISO.slice(0, 4)}-10-08 (use current year unless clearly past, then next year)
  * else null. Never guess a date that wasn't mentioned.
- "due_time": 24-hour HH:MM when a time is given ("4:30pm" → "16:30", "at noon" → "12:00"), else null. Never put the time in the title or description.
- "priority": "low", "medium", "high" or "urgent" when the text says so ("high priority", "urgent", "asap"), else null. Never put it in the description.
- "repeat": "daily", "weekly", "biweekly" or "monthly" when the task repeats ("every Saturday" → "weekly"), else null.
- Skip non-actionable chatter.`;
          const raw = await aiGenerate(system, text.slice(0, 15000), 4096);
          const parsed = JSON.parse(String(raw).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
          if (Array.isArray(parsed) && parsed.length) {
            const byName = new Map(roster.map((m: any) => [String(m.name).toLowerCase(), m.id]));
            items = parsed
              .filter((p: any) => p && typeof p.title === "string" && p.title.trim())
              .slice(0, 50)
              .map((p: any) => {
                const an = String(p.assignee_name || "").toLowerCase().trim();
                // The verbatim excerpt this task came from, when it really is in the text.
                const src = typeof p.source === "string" ? p.source.trim() : "";
                return {
                  ...(src.length >= 3 && text.includes(src) ? { _source: src } : {}),
                  title: String(p.title).slice(0, 80),
                  description: String(p.description || "").slice(0, 500),
                  status: ["todo", "in-progress", "done"].includes(p.status) ? p.status : "todo",
                  assigned_to: (an && byName.get(an)) || null,
                  assignee_name: (an && byName.get(an)) ? roster.find((m: any) => m.id === byName.get(an))?.name || null : null,
                  due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.due_date || "")) ? p.due_date : null,
                  due_time: TASK_TIME_RE.test(String(p.due_time || "")) ? p.due_time : null,
                  priority: cleanPriority(p.priority),
                  recurrence: p.repeat === "daily" ? { freq: "daily", interval: 1 } : p.repeat === "weekly" ? { freq: "weekly", interval: 1 } : p.repeat === "biweekly" ? { freq: "weekly", interval: 2 } : p.repeat === "monthly" ? { freq: "monthly", interval: 1 } : null,
                };
              });
          }
        } catch (e: any) {
          console.error("tasks AI parse error:", e?.message);
        }
      }
      // Fallback: one task per non-empty line when AI is unavailable or found nothing.
      if (!items.length) {
        const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^[-*•\d.)\s]+/, "").trim()).filter((l) => l.length > 2);
        // Each fallback task remembers its own line for the field reader below.
        items = [...new Set(lines)].slice(0, 50).map((title) => ({
          title: title.slice(0, 80), description: "", status: "todo",
          assigned_to: null, assignee_name: null, due_date: null, _source: title,
        }));
      }
      // The deterministic reader has the last word on structured fields: a
      // date, time, priority, repeat or assignee it finds in a line lands in
      // its field, and the phrase leaves the title (V3.5 quick-add fix).
      // Each task reads its own text: a fallback task its line, an AI task the
      // verbatim excerpt it quoted (checked against the input), and a single
      // AI task the whole text. One with no source keeps the AI's fields.
      const names = roster.map((m: any) => String(m.name));
      const single = items.length === 1 ? text.replace(/\s+/g, " ") : null;
      items = items.map((raw: any) => {
        const { _source, ...it } = raw;
        // A task reads its own full excerpt (so notes around it can't override
        // its fields); the whole text only when the AI quoted none.
        const source: string | null = _source ?? single ?? null;
        if (!source) return it;
        const q = parseQuickAdd(source, todayISO, names);
        const who = q.assignees[0] ? roster.find((m: any) => m.name === q.assignees[0]) : null;
        return {
          ...it,
          // Without AI the whole line became the title: use the cleaned one.
          title: (q.title && q.title.length >= 3 && String(it.title).trim() === source.trim().replace(/^[-*•\d.)\s]+/, "").slice(0, 80).trim() ? q.title : it.title).slice(0, 80),
          // "Today" that only comes from a bare time never beats a date the AI read.
          due_date: (q.date_is_default ? (it.due_date || q.due_date) : (q.due_date || it.due_date)) || null,
          due_time: q.due_time || it.due_time || null,
          priority: q.priority || it.priority || null,
          recurrence: q.recurrence || it.recurrence || null,
          assigned_to: who?.id ?? it.assigned_to ?? null,
          assignee_name: who?.name ?? it.assignee_name ?? null,
          assignee_ids: q.assignees.length ? roster.filter((m: any) => q.assignees.includes(m.name)).map((m: any) => m.id) : (it.assigned_to ? [it.assigned_to] : []),
        };
      });
      if (!items.length) return res.status(422).json({ error: "No tasks found in that text" });
      res.json({ items, count: items.length, roster: roster.map((m: any) => ({ id: m.id, name: m.name })) });
    } catch (error) {
      console.error("tasks parse error:", (error as any)?.message);
      res.status(500).json({ error: "Could not read those tasks" });
    }
  });

  // Bulk task creation (from the Bruno parse preview). One row per task.
  app.post("/api/tasks/bulk", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_tasks");
      if (!auth) return;
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ error: "No tasks to save" });
      const createdAt = new Date().toISOString();
      const saved: any[] = [];
      for (const it of items.slice(0, 50)) {
        const title = String(it?.title || "").trim().slice(0, 200);
        if (!title) continue;
        const status = ["todo", "in-progress", "done"].includes(it?.status) ? it.status : "todo";
        // Everyone named (assignee_ids), else the single assigned_to; team members only.
        const wanted: number[] = (Array.isArray(it?.assignee_ids) && it.assignee_ids.length ? it.assignee_ids : it?.assigned_to ? [it.assigned_to] : [])
          .map(Number).filter((n: number) => Number.isFinite(n));
        const targets: number[] = [];
        for (const mid of [...new Set(wanted)].slice(0, 20)) {
          const m = (await dbGet("SELECT team_id FROM members WHERE id = ?", mid)) as any;
          if (m && m.team_id === auth.teamId) targets.push(mid);
        }
        const due = /^\d{4}-\d{2}-\d{2}$/.test(String(it?.due_date || "")) ? it.due_date : null;
        const dueTime = due && TASK_TIME_RE.test(String(it?.due_time || "")) ? String(it.due_time) : null;
        const info = (await dbRun(
          "INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, due_time, is_board, created_at, priority, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          auth.teamId, title, String(it?.description || "").trim().slice(0, 1000), status, targets[0] ?? null, due, dueTime, 0, createdAt,
          cleanPriority(it?.priority), cleanRecurrence(it?.recurrence)
        ));
        const bulkTaskId = Number(info.lastInsertRowid);
        saved.push(bulkTaskId);
        if (targets.length) {
          await setTaskAssignees(bulkTaskId, targets, auth.teamId);
          for (const mid of targets) createNotification(mid, `New task assigned: ${title}`, 'task', { task_id: bulkTaskId });
        }
      }
      // Bulk import: receivers just refresh their task list.
      broadcastToTeam(auth.teamId, { type: "tasks_changed" });
      res.json({ ok: true, ids: saved, count: saved.length });
    } catch (error) {
      console.error("Error bulk-creating tasks:", error);
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
      // Managers may edit anything; assignees without the permission may only move status.
      const canManage = await hasPerm(auth, 'manage_tasks');
      const assigneeIds = await getTaskAssigneeIds(Number(req.params.id));
      const isAssignee = assigneeIds.includes(auth.memberId) || task.assigned_to === auth.memberId;
      if (!canManage && !isAssignee) {
        return res.status(403).json({ error: "You can only update tasks assigned to you" });
      }
      // Completing a task requires proof (notes and/or screenshots). PATCH may
      // move a task back to todo/in-progress, but only POST /:id/complete sets done.
      if (req.body?.status === 'done' && task.status !== 'done') {
        return res.status(400).json({ error: "Mark a task done through the completion dialog — proof is required." });
      }
      const { status, title, description, assigned_to, assignee_ids, due_date, is_board, due_time, priority, recurrence } = req.body;
      if (!canManage && (title !== undefined || description !== undefined || assigned_to !== undefined || assignee_ids !== undefined || due_date !== undefined || due_time !== undefined || is_board !== undefined || priority !== undefined || recurrence !== undefined)) {
        return res.status(403).json({ error: "Only team managers can edit task details" });
      }
      if (title !== undefined && !String(title ?? '').trim()) return res.status(400).json({ error: "Add a title" });
      const completedAt = status === 'done' ? new Date().toISOString() : null;

      // Status-only moves keep the old path; field edits update the rest.
      const sets: string[] = [];
      const vals: any[] = [];
      if (status !== undefined) {
        sets.push('status = ?', 'completed_at = ?');
        vals.push(status, status === 'done' ? completedAt : null);
        // Reopened: whatever review it had no longer applies.
        if (status !== 'done') sets.push('review_status = NULL');
      }
      if (priority !== undefined) { sets.push('priority = ?'); vals.push(cleanPriority(priority)); }
      if (recurrence !== undefined) { sets.push('recurrence = ?'); vals.push(cleanRecurrence(recurrence)); }
      if (title !== undefined) { sets.push('title = ?'); vals.push(title); }
      if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
      if (due_date !== undefined) { sets.push('due_date = ?'); vals.push(due_date || null); }
      if (due_time !== undefined || due_date !== undefined) {
        // The time belongs to the resulting date: none without a date, and a
        // request that sets only the date keeps the stored time.
        const resultingDate = due_date !== undefined ? (due_date || null) : (task.due_date || null);
        const wanted = due_time !== undefined ? (due_time ? String(due_time) : null) : (task.due_time ?? null);
        if (due_time && !TASK_TIME_RE.test(String(due_time))) return res.status(400).json({ error: "Use a time like 15:30" });
        sets.push('due_time = ?'); vals.push(resultingDate ? wanted : null);
      }
      if (is_board !== undefined) { sets.push('is_board = ?'); vals.push(is_board ? 1 : 0); }
      if (assigned_to !== undefined || assignee_ids !== undefined) {
        let newIds: number[] = [];
        if (Array.isArray(assignee_ids)) {
          newIds = assignee_ids.map(Number).filter((n: number) => Number.isFinite(n));
        } else if (assigned_to) {
          newIds = [Number(assigned_to)];
        }
        const valid = await setTaskAssignees(Number(req.params.id), newIds, auth.teamId);
        if (newIds.length > 0 && valid.length === 0) {
          return res.status(403).json({ error: "Not your workspace" });
        }
        // Notify newly added assignees
        for (const mid of valid) {
          if (!assigneeIds.includes(mid)) {
            createNotification(mid, `New task assigned: ${task.title}`, 'task', { task_id: Number(req.params.id) });
          }
        }
      }
      if (sets.length > 0) {
        (await dbRun(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, ...vals, req.params.id));
      }

      const notifyIds = await getTaskAssigneeIds(Number(req.params.id));
      for (const mid of notifyIds) {
        const note = status !== undefined && title === undefined
          ? `Task status updated to ${status}: ${task.title}`
          : `Task updated: ${title ?? task.title}`;
        createNotification(mid, note, 'task', { task_id: Number(req.params.id) });
      }

      const updated = (await dbGet("SELECT * FROM tasks WHERE id = ?", req.params.id)) as any;
      updated.assignee_ids = notifyIds;
      broadcastToTeam(auth.teamId, { type: "task_updated", task: updated });
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
      try { await dbRun("DELETE FROM task_assignees WHERE task_id = ?", req.params.id); } catch { /* table may not exist yet */ }
      (await dbRun("DELETE FROM tasks WHERE id = ?", req.params.id));
      broadcastToTeam(auth.teamId, { type: "task_deleted", id: Number(req.params.id) });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Review a done task: approve it, or send it back to the assignees with a
  // note (it reopens as In Progress). Managers only.
  app.post("/api/tasks/:id/review", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_tasks");
      if (!auth) return;
      const task = (await dbGet("SELECT * FROM tasks WHERE id = ?", req.params.id)) as any;
      if (!task || task.team_id !== auth.teamId) return res.status(404).json({ error: "Task not found" });
      if (task.status !== "done") return res.status(400).json({ error: "Only finished tasks can be reviewed" });
      const action = String(req.body?.action || "");
      const note = String(req.body?.note || "").trim().slice(0, 1000);
      const now = new Date().toISOString();
      const assignees = await getTaskAssigneeIds(Number(task.id));
      const reviewer = ((await dbGet("SELECT name FROM members WHERE id = ?", auth.memberId)) as any)?.name || "A manager";
      // Each write re-checks the task is still done, so a review racing with
      // another manager's (or a reopen) can't stamp a reopened task.
      const changed = (r: any) => Number(r?.changes ?? r?.rowsAffected ?? 0) > 0;
      const reopened = () => res.status(409).json({ error: "This task was reopened in the meantime — refresh and look again." });
      if (action === "approve") {
        const r = await dbRun("UPDATE tasks SET review_status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND status = 'done'", auth.memberId, now, note || null, task.id);
        if (!changed(r)) return reopened();
        for (const mid of assignees) if (mid !== auth.memberId) createNotification(mid, `${reviewer} approved your task: ${task.title}`, "task", { task_id: Number(task.id) });
      } else if (action === "send_back") {
        if (!note) return res.status(400).json({ error: "Say what needs to change" });
        const r = await dbRun(
          "UPDATE tasks SET status = 'in-progress', completed_at = NULL, review_status = 'changes_requested', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND status = 'done'",
          auth.memberId, now, note, task.id
        );
        if (!changed(r)) return reopened();
        for (const mid of assignees) if (mid !== auth.memberId) createNotification(mid, `${reviewer} sent back "${task.title}": ${note}`, "task", { task_id: Number(task.id) });
      } else {
        return res.status(400).json({ error: "Unknown review action" });
      }
      const updated = (await dbGet("SELECT * FROM tasks WHERE id = ?", task.id)) as any;
      updated.assignee_ids = assignees;
      broadcastToTeam(auth.teamId, { type: "task_updated", task: updated });
      res.json({ success: true, task: updated });
    } catch (error) {
      console.error("Error reviewing task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark a task done WITH proof: completion notes + optional screenshots.
  // If the task is unassigned, the completer becomes the assignee.
  app.post("/api/tasks/:id/complete", (req: any, res: any) => {
    proofUpload.array("images", 5)(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Invalid proof images" });
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const task = (await dbGet("SELECT * FROM tasks WHERE id = ?", req.params.id)) as any;
      if (!task || task.team_id !== auth.teamId) {
        return res.status(404).json({ error: "Task not found" });
      }
      const canManage = await hasPerm(auth, 'manage_tasks');
      const taskAssignees = await getTaskAssigneeIds(Number(req.params.id));
      const isAssignee = taskAssignees.includes(auth.memberId) || task.assigned_to === auth.memberId;
      if (!canManage && !isAssignee && (taskAssignees.length > 0 || task.assigned_to)) {
        return res.status(403).json({ error: "Only an assignee or a manager can complete this task" });
      }
      const notes = String(req.body?.notes || "").trim().slice(0, 2000);
      // Proof images are persisted in the database so they survive restarts.
      const images: string[] = [];
      for (const f of (req.files || []) as any[]) {
        if (!f?.buffer?.length) continue;
        const fid = await storeFile({
          teamId: auth.teamId, memberId: auth.memberId, kind: "proof",
          filename: f.originalname, mimeType: f.mimetype, buffer: f.buffer,
        });
        images.push(fileUrl(fid));
      }
      // Proof is required: a description, screenshots, or both.
      if (!notes && images.length === 0) {
        return res.status(400).json({ error: "Add a description or at least one screenshot as proof of completion." });
      }
      const prevImages = (() => { try { return JSON.parse(task.completion_images || "[]"); } catch { return []; } })();
      const allImages = [...prevImages, ...images].slice(0, 10);
      const now = new Date().toISOString();
      // Unassigned task: the completer claims it.
      const assignee = task.assigned_to || auth.memberId;
      // Done isn't accepted yet: a manager reviews it (approve, or send it
      // back). A manager finishing a task approves their own work.
      const review = canManage ? "approved" : "pending";
      await dbRun(
        "UPDATE tasks SET status = 'done', completed_at = ?, completed_by = ?, completion_notes = ?, completion_images = ?, assigned_to = ?, review_status = ?, review_note = NULL, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
        now, auth.memberId, notes || null, JSON.stringify(allImages), assignee, review, canManage ? auth.memberId : null, canManage ? now : null, req.params.id
      );
      // A repeating task rolls forward the moment it's done.
      try { await spawnNextRecurringTask({ ...task, id: Number(req.params.id) }, auth.teamId!, auth.memberId); }
      catch (e) { console.error("recurring task spawn failed:", e); }
      if (task.assigned_to && task.assigned_to !== auth.memberId) {
        const completer = (await dbGet("SELECT name FROM members WHERE id = ?", auth.memberId)) as any;
        createNotification(task.assigned_to, `Task completed by ${completer?.name || "a teammate"}: ${task.title}`, 'task', { task_id: Number(req.params.id) });
      }
      const updated = (await dbGet("SELECT * FROM tasks WHERE id = ?", req.params.id)) as any;
      broadcastToTeam(auth.teamId, { type: "task_updated", task: updated });
      res.json({ success: true, task: updated });
    } catch (error) {
      console.error("Error completing task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
    });
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
  interface TeamEventFields {
    title: string; date: string; time?: string; end?: string; notes?: string;
    location?: string; event_type?: string; reminder_minutes?: number | null;
    recurrence?: string | null; series_id?: number | null;
  }
  const EVENT_INSERT_SQL = "INSERT INTO events (title, description, date, start_time, end_time, location, event_type, team_id, created_by, reminder_minutes, recurrence, series_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  const eventInsertArgs = (teamId: number, memberId: number, e: TeamEventFields) => [
    e.title, e.notes || "", e.date, e.time || "", (e.time && e.end) || "", e.location || "", e.event_type || "meeting",
    teamId, memberId, e.reminder_minutes ?? null, e.recurrence ?? null, e.series_id ?? null,
  ];
  async function insertTeamEvent(teamId: number, memberId: number, e: TeamEventFields) {
    const info = (await dbRun(EVENT_INSERT_SQL, ...eventInsertArgs(teamId, memberId, e))) as any;
    const eventId = info.lastInsertRowid;
    // Push to linked personal Google Calendars (if the admin enabled sync)
    const newEvent = (await dbGet("SELECT * FROM events WHERE id = ?", eventId)) as any;
    if (newEvent) void syncEventToCalendars(newEvent, teamId);
    return eventId;
  }

  /** Push every occurrence of a series saved in one transaction to linked Google Calendars. */
  async function syncSeriesRows(teamId: number, seriesId: number, exceptId?: number) {
    const rows = (await dbAll("SELECT * FROM events WHERE series_id = ? AND team_id = ?", seriesId, teamId)) as any[];
    for (const row of rows) if (row.id !== exceptId) void syncEventToCalendars(row, teamId);
  }

  /** A submitted repeat rule: null for none, or an error message. */
  function repeatFrom(raw: unknown, firstDate: string): { rule: EventRepeat | null } | { error: string } {
    if (raw === undefined || raw === null || raw === "" || raw === false) return { rule: null };
    const rule = readEventRepeat(raw);
    if (!rule) return { error: "Pick how often the event repeats" };
    if (rule.until && rule.until <= firstDate) return { error: "The repeat end date must be after the first event" };
    return { rule };
  }

  const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

  app.post("/api/events", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_calendar");
      if (!auth) return;
      const { title, description, date, start_time, end_time, location, event_type, repeat, reminder_minutes } = req.body;
      const invalid = eventError({ title, date, start_time, end_time });
      if (invalid) return res.status(400).json({ error: invalid });
      const rep = repeatFrom(repeat, date);
      if ("error" in rep) return res.status(400).json({ error: rep.error });
      // The creator is the signed-in member (a client-supplied created_by is ignored).
      const fields: TeamEventFields = {
        title: String(title).trim(), date, time: start_time, end: end_time, notes: description,
        location: location || "", event_type: event_type || "meeting", reminder_minutes: cleanReminder(reminder_minutes),
        recurrence: rep.rule ? JSON.stringify(rep.rule) : null,
      };
      let id: number;
      let count = 1;
      if (rep.rule) {
        // The whole series in one write transaction: all of it or none of it.
        // The first row is the series head (series_id = its own id); the write
        // lock is held from the first statement, so it is the team's newest head
        // when the followers look it up.
        const dates = seriesDates(date, rep.rule);
        count = dates.length;
        const head = "(SELECT MAX(id) FROM events WHERE team_id = ? AND series_id = id)";
        const results = await dbBatchResults([
          { sql: EVENT_INSERT_SQL, args: eventInsertArgs(auth.teamId, auth.memberId, fields) },
          { sql: "UPDATE events SET series_id = id WHERE id = last_insert_rowid()" },
          ...dates.slice(1).map((d) => ({
            sql: EVENT_INSERT_SQL.replace(/VALUES \((.*)\?\)$/, `VALUES ($1${head})`),
            args: [...eventInsertArgs(auth.teamId, auth.memberId, { ...fields, date: d }).slice(0, -1), auth.teamId],
          })),
        ]);
        id = results[0].lastInsertRowid;
        await syncSeriesRows(auth.teamId, id);
      } else {
        id = Number(await insertTeamEvent(auth.teamId, auth.memberId, fields));
      }
      broadcastToTeam(auth.teamId, { type: "events_changed" });
      const everyone = (await dbAll("SELECT id FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", auth.teamId)) as any[];
      void notifyTeamUpdate(auth.teamId!, auth.memberId, everyone.map((m) => m.id), "event",
        count > 1
          ? `New repeating event: ${fields.title}, ${count} times from ${date}${start_time ? ` at ${start_time}` : ""}`
          : `New calendar event: ${fields.title} on ${date}${start_time ? ` at ${start_time}` : ""}`,
        { event_id: id }, count);
      res.json({ id, count });
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Calendar writes for one team run one at a time, so an edit reads a
  // series and rewrites it with no other edit of that team in between (two
  // overlapping repeat-rule changes can't both leave a run behind).
  const calendarLocks = new Map<number, Promise<unknown>>();
  function withCalendarLock<T>(teamId: number, fn: () => Promise<T>): Promise<T> {
    const prev = calendarLocks.get(teamId) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    calendarLocks.set(teamId, tail);
    void tail.then(() => { if (calendarLocks.get(teamId) === tail) calendarLocks.delete(teamId); });
    return run;
  }
  /** Members' Google copies of these events. Read BEFORE the events are
   *  deleted: a foreign-key cascade takes the mappings with them. */
  async function googleCopiesOf(ids: number[]): Promise<{ member_id: number; google_event_id: string }[]> {
    if (!ids.length) return [];
    return (await dbAll(
      `SELECT member_id, google_event_id FROM event_calendar_sync WHERE event_id IN (${ids.map(() => "?").join(",")})`, ...ids,
    )) as any[];
  }
  async function removeGoogleCopies(copies: { member_id: number; google_event_id: string }[]) {
    for (const c of copies) {
      try {
        const accessToken = await getGoogleAccessToken(c.member_id);
        if (!accessToken) continue;
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(c.google_event_id)}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000),
        }).catch(() => {});
      } catch (e) {
        console.error("Calendar sync delete failed:", (e as any)?.message);
      }
    }
  }

  // scope "following" (repeating events only) applies the edit to this
  // occurrence and every later one in its series; a date change shifts them
  // all by the same number of days. A changed repeat rule (with "following",
  // or on a one-off event) replaces the later occurrences with a new run.
  // Every row is validated first and all writes are one transaction; linked
  // Google Calendars are updated only after it commits.
  app.patch("/api/events/:id", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_calendar");
      if (!auth) return;
      // Google cleanup runs after the lock is released (a slow Google must
      // not hold up the team's other calendar edits).
      let cleanup: { member_id: number; google_event_id: string }[] = [];
      await withCalendarLock(auth.teamId, async () => {
      const { title, description, date, start_time, end_time, location, event_type, reminder_minutes, repeat, scope } = req.body;
      const existing: any = (await dbGet("SELECT * FROM events WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Event not found" });
      // Validate the event as it will be stored (patch merged over the row).
      const invalid = eventError({
        title: title ?? existing.title,
        date: date ?? existing.date,
        start_time: start_time ?? existing.start_time,
        end_time: end_time ?? existing.end_time,
      });
      if (invalid) return res.status(400).json({ error: invalid });
      const newDate: string = date ?? existing.date;
      const following = scope === "following" && !!existing.series_id;
      let ruleChange: { rule: EventRepeat | null } | null = null;
      // An unchanged rule is left alone (its end date may already be behind this occurrence).
      if (repeat !== undefined && (following || !existing.series_id)
        && JSON.stringify(readEventRepeat(repeat)) !== JSON.stringify(readEventRepeat(existing.recurrence))) {
        const rep = repeatFrom(repeat, newDate);
        if ("error" in rep) return res.status(400).json({ error: rep.error });
        ruleChange = rep;
      }
      const delta = daysBetween(existing.date, newDate);
      let rows: any[] = following
        ? (await dbAll("SELECT * FROM events WHERE series_id = ? AND team_id = ? AND date >= ? ORDER BY date", existing.series_id, auth.teamId, existing.date)) as any[]
        : [existing];
      const stmts: { sql: string; args?: any[] }[] = [];
      // A new rule replaces the later occurrences: deleted by condition (not
      // by the ids read above), with their sync rows, in the same transaction.
      const removed = ruleChange && following ? rows.filter((r) => r.id !== existing.id).map((r) => Number(r.id)) : [];
      const removedCopies = await googleCopiesOf(removed);
      if (ruleChange && following) {
        const later = "SELECT id FROM events WHERE series_id = ? AND team_id = ? AND date >= ? AND id != ?";
        const laterArgs = [existing.series_id, auth.teamId, existing.date, existing.id];
        stmts.push({ sql: `DELETE FROM event_calendar_sync WHERE event_id IN (${later})`, args: laterArgs });
        stmts.push({ sql: `DELETE FROM events WHERE id IN (${later})`, args: laterArgs });
        rows = [existing];
      }
      const reminder = reminder_minutes !== undefined ? cleanReminder(reminder_minutes) : undefined;
      const merged = rows.map((r) => ({
        r,
        next: {
          title: title ?? r.title,
          description: description ?? r.description,
          date: r.id === existing.id ? newDate : addDays(r.date, delta),
          start_time: start_time ?? r.start_time,
          end_time: end_time ?? r.end_time,
          location: location ?? r.location,
          event_type: event_type ?? r.event_type,
          reminder_minutes: reminder !== undefined ? reminder : r.reminder_minutes,
        },
      }));
      // Each later occurrence keeps its own fields where the edit leaves them
      // out, so check every merged row before writing any of them.
      for (const { next } of merged) {
        const bad = eventError(next);
        if (bad) return res.status(400).json({ error: `${bad} (on ${next.date})` });
      }
      for (const { r, next } of merged) {
        // A new time (or lead time) means the reminder should go out again.
        const retime = next.date !== r.date || (next.start_time || "") !== (r.start_time || "") || (next.reminder_minutes ?? null) !== (r.reminder_minutes ?? null);
        stmts.push({
          sql: `UPDATE events SET title = ?, description = ?, date = ?, start_time = ?, end_time = ?, location = ?, event_type = ?, reminder_minutes = ?${retime ? ", reminder_sent_at = NULL" : ""} WHERE id = ?`,
          args: [next.title, next.description, next.date, next.start_time, next.end_time, next.location, next.event_type, next.reminder_minutes, r.id],
        });
      }
      const seriesId = Number(existing.series_id || existing.id);
      if (ruleChange?.rule) {
        const head = merged.find((m) => m.r.id === existing.id)!.next;
        const recurrence = JSON.stringify(ruleChange.rule);
        stmts.push({ sql: "UPDATE events SET recurrence = ?, series_id = ? WHERE id = ?", args: [recurrence, seriesId, existing.id] });
        for (const d of seriesDates(head.date, ruleChange.rule).slice(1)) {
          stmts.push({
            sql: EVENT_INSERT_SQL,
            args: eventInsertArgs(auth.teamId, existing.created_by ?? auth.memberId, {
              title: head.title, date: d, time: head.start_time, end: head.end_time, notes: head.description,
              location: head.location, event_type: head.event_type, reminder_minutes: head.reminder_minutes, recurrence, series_id: seriesId,
            }),
          });
        }
      } else if (ruleChange) {
        stmts.push({ sql: "UPDATE events SET recurrence = NULL WHERE id = ?", args: [existing.id] });
      }
      await dbBatchResults(stmts);
      // Linked calendars follow once the database has committed.
      cleanup = removedCopies;
      for (const { r } of merged) {
        const updatedEvent = (await dbGet("SELECT * FROM events WHERE id = ?", r.id)) as any;
        if (updatedEvent) void updateSyncedEvent(updatedEvent);
      }
      if (ruleChange?.rule) {
        // Only the new run (rows not synced before) is pushed as new events.
        const fresh = (await dbAll(
          "SELECT e.* FROM events e WHERE e.series_id = ? AND e.team_id = ? AND e.id != ? AND NOT EXISTS (SELECT 1 FROM event_calendar_sync s WHERE s.event_id = e.id) AND e.date > ?",
          seriesId, auth.teamId, existing.id, newDate,
        )) as any[];
        for (const row of fresh) void syncEventToCalendars(row, auth.teamId);
      }
      broadcastToTeam(auth.teamId, { type: "events_changed" });
      res.json({ ok: true, updated: merged.length });
      });
      if (cleanup.length) void removeGoogleCopies(cleanup);
    } catch (error) {
      console.error("Error updating event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ?scope=following deletes this occurrence and every later one in its
  // series; ?scope=all deletes the whole series. Default: just this one.
  app.delete("/api/events/:id", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_calendar");
      if (!auth) return;
      let cleanup: { member_id: number; google_event_id: string }[] = [];
      await withCalendarLock(auth.teamId, async () => {
      const existing: any = (await dbGet("SELECT id, team_id, series_id, date FROM events WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Event not found" });
      const scope = String(req.query.scope || "");
      const ids: number[] = existing.series_id && (scope === "all" || scope === "following")
        ? ((await dbAll(
          `SELECT id FROM events WHERE series_id = ? AND team_id = ?${scope === "following" ? " AND date >= ?" : ""}`,
          ...(scope === "following" ? [existing.series_id, auth.teamId, existing.date] : [existing.series_id, auth.teamId]),
        )) as any[]).map((r) => Number(r.id))
        : [Number(existing.id)];
      const copies = await googleCopiesOf(ids);
      const inIds = ids.map(() => "?").join(",");
      await dbBatchResults([
        { sql: `DELETE FROM event_calendar_sync WHERE event_id IN (${inIds})`, args: ids },
        { sql: `DELETE FROM events WHERE team_id = ? AND id IN (${inIds})`, args: [auth.teamId, ...ids] },
      ]);
      cleanup = copies;
      broadcastToTeam(auth.teamId, { type: "events_changed" });
      res.json({ ok: true, deleted: ids.length });
      });
      if (cleanup.length) void removeGoogleCopies(cleanup);
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---- Event reminders ----
  // Once a minute: events whose reminder time has come get one inbox
  // notification per verified, active member. The claim and the inbox rows
  // are one transaction: the claim only matches the date, time and lead time
  // the sweep read (an event moved meanwhile is left for its new time), and
  // the inserts only happen if this sweep's claim stuck. A failure rolls it
  // all back, so the next sweep retries. A reminder whose event already
  // started (server was down) is marked sent and skipped.
  let remindersRunning = false;
  const sendEventReminders = async () => {
    if (remindersRunning) return;
    remindersRunning = true;
    try {
      const now = Date.now();
      // Stored dates are team-local; a few days either side covers every
      // timezone and the longest lead time.
      const from = new Date(now - 2 * 86400000).toISOString().slice(0, 10);
      const to = new Date(now + 4 * 86400000).toISOString().slice(0, 10);
      const due = (await dbAll(
        "SELECT e.id, e.title, e.date, e.start_time, e.reminder_minutes, e.team_id, t.timezone FROM events e JOIN teams t ON t.id = e.team_id WHERE e.reminder_minutes IS NOT NULL AND e.reminder_sent_at IS NULL AND e.date BETWEEN ? AND ?",
        from, to,
      )) as any[];
      for (const e of due) {
        try {
          const tz = resolveTimeZone(e.timezone);
          const at = reminderDueMs(e, tz);
          if (at == null || now < at) continue;
          const claimMark = `${new Date(now).toISOString()}#${crypto.randomBytes(6).toString("hex")}`;
          const claim = {
            sql: "UPDATE events SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL AND date = ? AND COALESCE(start_time, '') = ? AND reminder_minutes = ?",
            args: [claimMark, e.id, e.date, e.start_time || "", e.reminder_minutes],
          };
          if (now >= eventStartMs(e, tz)) { await dbRun(claim.sql, ...claim.args); continue; }
          const members = (await dbAll(
            `SELECT m.id, m.team_id FROM members m WHERE m.team_id = ? AND COALESCE(m.is_active, 1) = 1 AND ${VERIFIED_MEMBER_SQL}`, e.team_id,
          )) as any[];
          const content = reminderText(e);
          const stamp = new Date(now).toISOString();
          const meta = JSON.stringify({ event_id: Number(e.id), reminder: true });
          const results = await dbBatchResults([
            claim,
            ...members.map((m) => ({
              sql: "INSERT INTO notifications (user_id, content, type, timestamp, meta) SELECT ?, ?, 'system', ?, ? WHERE EXISTS (SELECT 1 FROM events WHERE id = ? AND reminder_sent_at = ?)",
              args: [m.id, content, stamp, meta, e.id, claimMark],
            })),
          ]);
          // Live delivery for the rows this sweep actually wrote.
          members.forEach((m, i) => {
            const r = results[i + 1];
            if (!r?.changes) return;
            sendToMember(m.team_id, m.id, { type: "notification", notification: { id: r.lastInsertRowid, user_id: m.id, content, type: "system", timestamp: stamp, is_read: 0, meta } });
          });
        } catch (err) {
          console.error(`Event reminder ${e.id} failed (will retry):`, err);
        }
      }
    } catch (err) {
      console.error("Event reminders failed:", err);
    } finally {
      remindersRunning = false;
    }
  };
  setInterval(() => void sendEventReminders(), Number(process.env.EVENT_REMINDER_SWEEP_MS) || 60 * 1000).unref();

  // ---- Calendar subscribe feed (ICS) ----
  // One secret URL per membership. Google/Apple/Outlook poll it, so the team
  // calendar shows in personal calendars. The token is the only credential:
  // it stops working when the member leaves the workspace, and the member
  // can replace it (the old URL then 404s).
  const feedUrl = (req: any, token: string) =>
    `${(process.env.APP_URL || "").replace(/\/$/, "") || getBaseUrl(req)}/api/calendar/feed/${token}.ics`;

  app.get("/api/calendar/feed", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const row = (await dbGet("SELECT token FROM calendar_feeds WHERE member_id = ? AND team_id = ?", auth.memberId, auth.teamId)) as any;
      res.json({ url: row ? feedUrl(req, row.token) : null });
    } catch (error) {
      console.error("Error reading calendar feed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create the subscribe URL, or replace it with { reset: true }.
  app.post("/api/calendar/feed", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth || !auth.teamId) return auth && res.status(400).json({ error: "Join a workspace first" });
      const row = (await dbGet("SELECT token, team_id FROM calendar_feeds WHERE member_id = ?", auth.memberId)) as any;
      if (row && row.team_id === auth.teamId && !req.body?.reset) return res.json({ url: feedUrl(req, row.token) });
      const token = crypto.randomBytes(24).toString("base64url");
      await dbRun(
        "INSERT OR REPLACE INTO calendar_feeds (member_id, team_id, token, created_at) VALUES (?, ?, ?, ?)",
        auth.memberId, auth.teamId, token, new Date().toISOString(),
      );
      res.json({ url: feedUrl(req, token) });
    } catch (error) {
      console.error("Error creating calendar feed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/calendar/feed", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      await dbRun("DELETE FROM calendar_feeds WHERE member_id = ?", auth.memberId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error removing calendar feed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // The feed itself: no session (calendar apps can't sign in), the token is the key.
  app.get("/api/calendar/feed/:file", async (req, res) => {
    try {
      const m = /^([A-Za-z0-9_-]{24,64})\.ics$/.exec(String(req.params.file));
      if (!m) return res.status(404).type("text/plain").send("Not found");
      const feed = (await dbGet(
        "SELECT f.team_id FROM calendar_feeds f JOIN members m ON m.id = f.member_id WHERE f.token = ? AND m.team_id = f.team_id AND COALESCE(m.is_active, 1) = 1",
        m[1],
      )) as any;
      if (!feed) return res.status(404).type("text/plain").send("Not found");
      const team = (await dbGet("SELECT name, timezone FROM teams WHERE id = ?", feed.team_id)) as any;
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const events = (await dbAll(
        "SELECT id, title, description, date, start_time, end_time, location, event_type, reminder_minutes FROM events WHERE team_id = ? AND date >= ? ORDER BY date ASC, start_time ASC LIMIT 3000",
        feed.team_id, since,
      )) as any[];
      let host = "tryctrlpoint.org";
      try { host = new URL(feedUrl(req, "x")).hostname || host; } catch { /* keep default */ }
      const body = buildIcs({
        calendarName: `${team?.name || "Team"} · Control Point`,
        timeZone: resolveTimeZone(team?.timezone),
        host,
        events,
        now: Date.now(),
      });
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", 'inline; filename="control-point.ics"');
      res.setHeader("Cache-Control", "private, max-age=900");
      res.send(body);
    } catch (error) {
      console.error("Error serving calendar feed:", error);
      res.status(500).type("text/plain").send("Calendar unavailable");
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
      const entry = budgetEntryFrom(req.body, null);
      if ("error" in entry) return res.status(400).json({ error: entry.error });
      const { type, amount, category, description, date } = entry;
      const info = (await dbRun("INSERT INTO budget (team_id, type, amount, category, description, date) VALUES (?, ?, ?, ?, ?, ?)", auth.teamId, type, amount, category, description, date));

      // Board members hear about budget changes, as each of them chose
      // (instant, digest or off; never the person who logged it).
      const boardMembers = (await dbAll("SELECT id FROM members WHERE is_board = 1 AND team_id = ? AND COALESCE(is_active, 1) = 1", auth.teamId)) as any[];
      void notifyTeamUpdate(auth.teamId!, auth.memberId, boardMembers.map((m) => m.id), "budget",
        `New budget ${type}: ${formatMoney(amount)}${category ? ` for ${category}` : ""}`, { budget_id: Number(info.lastInsertRowid) });
      broadcastToTeam(auth.teamId, { type: "budget_changed" });

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating budget item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/budget/:id", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_budget");
      if (!auth) return;
      const existing: any = (await dbGet("SELECT * FROM budget WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      const entry = budgetEntryFrom(req.body, existing);
      if ("error" in entry) return res.status(400).json({ error: entry.error });
      const { type, amount, category, description, date } = entry;
      (await dbRun(
        "UPDATE budget SET type = ?, amount = ?, category = ?, description = ?, date = ? WHERE id = ?",
        type, amount, category, description, date,
        req.params.id));
      broadcastToTeam(auth.teamId, { type: "budget_changed" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating budget item:", error);
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
      broadcastToTeam(auth.teamId, { type: "budget_changed" });
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
      const missingOutreach = requiredTextError(req.body || {}, REQUIRED.outreach);
      if (missingOutreach) return res.status(400).json({ error: missingOutreach });
      // Optional fields default rather than reach the driver as undefined (a 500).
      const info = (await dbRun("INSERT INTO outreach (title, description, date, hours, location, attendees, funds_raised, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", String(title).trim(), description ?? '', date, Math.max(0, parseFloat(hours) || 0), location ?? '', Math.max(0, parseInt(attendees) || 0), Math.max(0, parseFloat(funds_raised) || 0), auth.teamId));

      // Everyone hears about new outreach, as each of them chose.
      const allMembers = (await dbAll("SELECT id FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", auth.teamId)) as any[];
      void notifyTeamUpdate(auth.teamId!, auth.memberId, allMembers.map((m) => m.id), "outreach",
        `New outreach event: ${title}${location ? ` at ${location}` : ""}`, { outreach_id: Number(info.lastInsertRowid) });

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
      const missingOutreach = requiredTextError(req.body || {}, REQUIRED.outreach);
      if (missingOutreach) return res.status(400).json({ error: missingOutreach });
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
        await dbRun("UPDATE social_profiles SET display_name = ?, avatar_url = ?, country = ?, published_at = ?, description = ?, custom_url = ? WHERE id = ?", s.displayName, s.avatarUrl, s.country || null, s.publishedAt || null, s.description || null, s.customUrl || null, profile.id);
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
      return { ok: false, error: `Unknown platform "${profile.platform}" — unlink and re-link this profile` };
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
        "SELECT id, team_id, platform, handle, url, display_name, avatar_url, token_status, is_pinned, sort_order, last_synced_at, created_at, country, published_at, description, custom_url, external_id FROM social_profiles WHERE team_id = ? ORDER BY is_pinned DESC, sort_order ASC, created_at ASC",
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
        "INSERT INTO social_profiles (team_id, platform, handle, external_id, url, display_name, avatar_url, sort_order, last_synced_at, country, published_at, description, custom_url) VALUES (?, 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        auth.teamId, handle, ch.channelId, input.startsWith("http") ? input : null, ch.displayName, ch.avatarUrl, (maxOrder.m + 1), Date.now(),
        ch.country || null, ch.publishedAt || null, ch.description || null, ch.customUrl || null
      );
      await recordSocialSnapshot(info.lastInsertRowid, auth.teamId, { followers: ch.followers, likes: 0, posts: ch.posts, views: ch.views });
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (error) {
      // Log the full error server-side; return a safe specific message.
      const err: any = error;
      console.error("Error linking YouTube channel:", err?.message, String(err?.stack || "").split("\n").slice(0, 3).join(" | "));
      const msg = String(err?.message || "");
      if (/no such column/i.test(msg)) {
        return res.status(500).json({ error: "Database needs an update — please try again in a minute" });
      }
      if (/no such table/i.test(msg)) {
        return res.status(500).json({ error: "Database table missing — please try again in a minute" });
      }
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

  /** Purchase link and supplier from a request body: undefined = not sent,
   *  null = cleared ("" link, "" or "auto" supplier). */
  function purchaseFields(body: any): { url?: string | null; supplier?: string | null } | { error: string } {
    const out: { url?: string | null; supplier?: string | null } = {};
    if (body?.url !== undefined) {
      const raw = String(body.url ?? "").trim();
      if (!raw) out.url = null;
      else {
        const url = cleanPurchaseUrl(raw);
        if (!url) return { error: raw.length > MAX_PURCHASE_URL ? "That purchase link is too long — use the product page's own address." : "The purchase link must be a web address (https://…)" };
        out.url = url;
      }
    }
    if (body?.supplier !== undefined) {
      const raw = String(body.supplier ?? "").trim();
      if (!raw || raw === "auto") out.supplier = null;
      else if (supplierById(raw)) out.supplier = raw;
      else return { error: "Unknown supplier" };
    }
    return out;
  }

  app.post("/api/inventory", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_inventory");
      if (!auth) return;
      const { name, part_number, sku, quantity, assigned_to, location, category, description, cost } = req.body;
      if (!sku || !name) {
        return res.status(400).json({ error: "SKU and name are required" });
      }
      const purchase = purchaseFields(req.body);
      if ("error" in purchase) return res.status(400).json({ error: purchase.error });
      // No supplier chosen: detect one from the link, SKU format or name.
      const supplier = purchase.supplier ?? detectSupplier({ url: purchase.url, sku, part_number, name, description });
      const date_added = new Date().toISOString();
      const info = (await dbRun(`
        INSERT INTO inventory (team_id, name, part_number, sku, quantity, assigned_to, location, category, description, cost, date_added, url, supplier)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, auth.teamId, name, part_number || null, sku, quantity || 0, assigned_to || null, location || '', category || '', description || '', cost || 0, date_added, purchase.url ?? null, supplier ?? null));

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
      const id = req.params.id;
      const existing: any = (await dbGet("SELECT * FROM inventory WHERE id = ?", id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      // Partial update: only the columns sent are written, so a bulk "set
      // category" can't blank a part's name, SKU or count, and can't undo a
      // different field another request changed at the same moment.
      const body = req.body || {};
      if (body.name !== undefined && !String(body.name ?? '').trim()) return res.status(400).json({ error: "Add a name" });
      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of ["name", "part_number", "sku", "quantity", "assigned_to", "location", "category", "description", "cost"]) {
        if (body[k] === undefined) continue;
        sets.push(`${k} = ?`);
        vals.push(k === "assigned_to" ? (body[k] || null) : body[k]);
      }
      const purchase = purchaseFields(body);
      if ("error" in purchase) return res.status(400).json({ error: purchase.error });
      if (purchase.url !== undefined) { sets.push("url = ?"); vals.push(purchase.url); }
      if (purchase.supplier !== undefined) { sets.push("supplier = ?"); vals.push(purchase.supplier); }
      if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
      (await dbRun(`UPDATE inventory SET ${sets.join(", ")} WHERE id = ?`, ...vals, id));

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

  // Import a REV Robotics product from its link (or a bare SKU like REV-41-1600).
  app.post("/api/inventory/scrape-rev", async (req, res) => {
    {
      const _srAuth = await requirePerm(req, res, "manage_inventory");
      if (!_srAuth) return;
    }
    // Exact host match on every hop (a substring check let
    // http://169.254.169.254/?revrobotics.com through), plus the shared
    // private-address guard on the resolved IP.
    const isRevHost = (u: URL) => {
      const h = u.hostname.toLowerCase();
      if (u.protocol !== "https:" || (h !== "revrobotics.com" && !h.endsWith(".revrobotics.com"))) {
        throw new UnsafeUrlError("Invalid REV Robotics URL");
      }
    };
    const target = revTarget(req.body?.url);
    if (!target) return res.status(400).json({ error: "Paste a REV Robotics product link (like revrobotics.com/rev-41-1600/) or a REV SKU." });
    try { isRevHost(checkPublicUrl(target.url)); } catch {
      return res.status(400).json({ error: "Invalid REV Robotics URL" });
    }
    let status = 0;
    let product: RevProduct = {};
    try {
      const { response } = await safeGet(target.url, {
        // A full browser header set: REV's storefront answers bare clients with an error page.
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeoutMs: 15000,
        maxBytes: 5 * 1024 * 1024,
        allowUrl: isRevHost,
      });
      status = response.status;
      if (status < 400) product = parseRevProduct(String(response.data ?? ""));
    } catch (error: any) {
      console.error("REV import fetch failed:", error?.message);
    }
    const base = { url: target.url, supplier: "rev" };
    if (product.name || product.sku) return res.json({ ...base, ...product, sku: product.sku || target.sku || undefined });
    // REV says the page doesn't exist: a mistyped or retired part, not a hiccup.
    if (status === 404) return res.status(404).json({ error: "REV says that page doesn't exist. Check the link: product pages look like revrobotics.com/rev-41-1600/." });
    // The page couldn't be read, but the link names the part: fill what we know.
    if (target.sku) {
      return res.json({
        ...base, sku: target.sku, partial: true,
        note: "REV's page couldn't be read just now, so only the SKU and link were filled in. Add the name and price, then save.",
      });
    }
    res.status(502).json({ error: status ? `REV's page couldn't be read (status ${status}). Try again, or enter the part by hand.` : "Couldn't reach REV Robotics. Try again, or enter the part by hand." });
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
  const INVOICE_EXTRACT_SYSTEM = `You extract purchasable line items from supplier order invoices and receipts for a robotics team's parts inventory. Return ONLY a JSON array — no markdown fences, no commentary, no trailing text. Each element must be an object: {"sku": string, "name": string, "quantity": number, "unitPrice": number, "category": string, "supplier": string}.
Rules:
- One element per distinct line item on the invoice.
- "sku" is the supplier's part/SKU/model number as printed; use "" when none is shown.
- "name" is the item description, trimmed to about 120 characters.
- "quantity" is units ordered on that line (default 1 when unclear).
- "unitPrice" is the per-unit price in dollars (default 0 when unclear).
- "category" must be exactly one of: ${INVENTORY_CATEGORIES.join(", ")} — pick the closest fit for the item.
- "supplier" is who makes or sells the item, as one of: ${SUPPLIERS.map((x) => x.id).join(", ")} (the store on the invoice, or the brand when a reseller sells it, e.g. an Axon servo bought from goBILDA is "axon"); "" when it's none of these.
- Skip shipping, handling, tax, discounts, coupons, subtotals, totals, and gift cards.
- Never invent items that are not on the invoice.`;

  function sanitizeInvoiceItems(raw: any) {
    if (!Array.isArray(raw)) return [];
    const out: { sku: string; name: string; quantity: number; unitPrice: number; category: string; supplier: string }[] = [];
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
      const supplier = supplierById(it.supplier)?.id || detectSupplier({ sku, name }) || "";
      out.push({ sku, name, quantity: quantity || 1, unitPrice, category, supplier });
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

  async function handleInvoiceParse(req: any, res: any, upload: any, fieldName: string, perm: string = "manage_inventory") {
    const auth = perm === "auth" ? await requireAuth(req, res) : await requirePerm(req, res, perm);
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
        if (isGeminiConfigured()) {
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
          // Regex fallback for PDFs when AI is off or misses: it only reads
          // goBILDA orders, so every line it finds is goBILDA's.
          items = parseGobildaOrder(text).map((it) => ({ ...it, supplier: "gobilda" }));
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
        // Who sells it, so the part gets an order link (src/utils/suppliers.ts).
        const supplier = supplierById(it.supplier)?.id || detectSupplier({ sku, name, url: it.url }) || null;
        const url = cleanPurchaseUrl(it.url);
        try {
          const existing: any = await dbGet("SELECT id, quantity FROM inventory WHERE team_id = ? AND sku = ?", auth.teamId, sku);
          if (existing) {
            await dbRun("UPDATE inventory SET quantity = quantity + ?, cost = ?, category = ?, supplier = COALESCE(supplier, ?), url = COALESCE(url, ?) WHERE id = ?", quantity, cost, category, supplier, url, existing.id);
            merged++;
          } else {
            await dbRun(
              "INSERT INTO inventory (team_id, name, part_number, sku, quantity, location, category, description, cost, date_added, supplier, url) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)",
              auth.teamId,
              name,
              sku,
              sku,
              quantity,
              category,
              sourceLabel,
              cost,
              date_added,
              supplier,
              url
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
    if (!isGeminiConfigured()) {
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

  async function logAiUsage(memberId: number, teamId: number | null, usage: any, promptChars: number, responseChars: number, status: string = 'ok', provider: string = 'gemini', endpoint: string = 'bruno-chat') {
    try {
      const prompt = usage?.promptTokens || Math.ceil(promptChars / 4);
      const response = usage?.responseTokens || Math.ceil(responseChars / 4);
      const total = usage?.totalTokens || prompt + response;
      await dbRun(
        "INSERT INTO ai_usage (member_id, team_id, endpoint, prompt_tokens, response_tokens, total_tokens, status, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        memberId, teamId, endpoint, prompt, response, total, status, provider
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

  // Heuristic signals for inappropriate team-chat content. Flags are
  // review-only — nothing is blocked, edited, or deleted automatically.
  // Scored like the AI-misuse heuristics; mild words need company, slurs
  // and threats flag on their own. One open flag per member per 6 hours.
  const CHAT_INAPPROPRIATE_SIGNALS: [RegExp, number][] = [
    [/\bnigg[ae]rs?\b/i, 6], [/\bfaggots?\b/i, 6], [/\btranny\b/i, 5], [/\bkike\b/i, 6],
    [/\bchink\b/i, 6], [/\bspic\b/i, 6],
    [/\bporn\w*/i, 4], [/\bsex\b/i, 3], [/\bsexy\b/i, 2], [/\bdicks?\b/i, 3],
    [/\bpussy\b/i, 4], [/\bcum\b/i, 3], [/\borgasm/i, 4], [/\bmasturbat\w*/i, 4],
    [/\bnudes?\b/i, 4], [/\bhorny\b/i, 3],
    [/\bkill yourself\b/i, 6], [/\bkys\b/i, 6],
    [/\bi('ll| will) (kill|hurt|beat) you/i, 5], [/\bshut the fuck up/i, 3],
    [/\bfuck\w*/i, 3], [/\bshit\w*/i, 2], [/\bbitch/i, 2], [/\basshole/i, 2],
    [/\bcunt\b/i, 4], [/\bdamn\b/i, 1], [/\bhell\b/i, 1], [/\bcrap\b/i, 1],
  ];
  const CHAT_FLAG_THRESHOLD = 4;

  async function flagChatMessage(memberId: number, teamId: number | null, messageId: number, text: string) {
    try {
      const excerpt = String(text || "").slice(0, 400);
      let score = 0;
      for (const [re, pts] of CHAT_INAPPROPRIATE_SIGNALS) if (re.test(text)) score += pts;
      if (score < CHAT_FLAG_THRESHOLD) return;
      const dup = (await dbGet(
        "SELECT id FROM ai_flags WHERE member_id = ? AND reason = 'inappropriate-chat' AND status = 'open' AND created_at >= datetime('now', '-6 hours')",
        memberId
      )) as any;
      if (dup) return;
      await dbRun(
        "INSERT INTO ai_flags (member_id, team_id, message_id, excerpt, reason, score) VALUES (?, ?, ?, ?, 'inappropriate-chat', ?)",
        memberId, teamId, messageId, excerpt, score
      );
    } catch (e) {
      console.error("[chat] flagging failed:", (e as any)?.message || e);
    }
  }

  app.post("/api/ai/fetch-news", async (req, res) => {
    // Hoisted so the catch block can attribute failed attempts to the caller.
    let auth: Awaited<ReturnType<typeof requireAuth>> = null;
    try {
      auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isGeminiConfigured()) {
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
        res.setHeader("X-Accel-Buffering", "no"); // stream through nginx unbuffered
        res.setHeader("Cache-Control", "no-cache");
        try {
          const streamedNews = await scoutNews(teamCtx, maxTokens, (chunk) => res.write(chunk));
          logAiUsage(auth.memberId, auth.teamId, null, 0, String(streamedNews || "").length, "ok", "gemini", "fetch-news");
          res.end();
        } catch (err) {
          console.error("AI news stream error:", err);
          logAiUsage(auth.memberId, auth.teamId, null, 0, 0, isQuotaError(err) ? "quota" : "error", "gemini", "fetch-news");
          res.end(isQuotaError(err) ? `\n\n(${QUOTA_EXHAUSTED_MSG})` : "\n\n(Failed to finish the news roundup.)");
        }
        return;
      }
      const result = await scoutNews(teamCtx, maxTokens);
      logAiUsage(auth.memberId, auth.teamId, null, 0, String(result || "").length, "ok", "gemini", "fetch-news");
      res.json({ result });
    } catch (error) {
      console.error("AI news error:", error);
      if (auth) logAiUsage(auth.memberId, auth.teamId, null, 0, 0, isQuotaError(error) ? "quota" : "error", "gemini", "fetch-news");
      if (isQuotaError(error)) {
        res.status(429).json({ error: "AI quota exhausted", result: QUOTA_EXHAUSTED_MSG });
      } else {
        res.status(502).json({ error: "AI request failed", result: "Failed to fetch latest news. Please check your connection." });
      }
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
    // Hoisted so the catch block can attribute failed attempts to the caller.
    let auth: Awaited<ReturnType<typeof requireAuth>> = null;
    // Hoisted alongside auth: only the request that starts a shared
    // generation logs its usage; waiters share that one Gemini call.
    let isOwner = false;
    try {
      auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isGeminiConfigured()) {
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
      // Only the request that *starts* the generation logs usage — waiters
      // share the same single Gemini call and must not each log a row.
      if (force || !scoutFeedInflight.get(teamKey)) {
        isOwner = true;
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
        if (isOwner && auth) logAiUsage(auth.memberId, auth.teamId, null, 0, 0, "error", "gemini", "scout-feed");
        return res.status(502).json({ error: "The scout feed came back empty — please try refreshing.", items: [] });
      }
      if (isOwner) logAiUsage(auth.memberId, auth.teamId, null, 0, JSON.stringify(validItems).length, "ok", "gemini", "scout-feed");
      res.json({ items: validItems });
    } catch (error) {
      console.error("AI scout feed error:", error);
      // Owner-only: every waiter lands here when the shared generation
      // rejects, but it was still just one Gemini call.
      if (isOwner && auth) logAiUsage(auth.memberId, auth.teamId, null, 0, 0, isQuotaError(error) ? "quota" : "error", "gemini", "scout-feed");
      if (isQuotaError(error)) {
        res.status(429).json({ error: "AI quota exhausted", items: [] });
      } else {
        res.status(502).json({ error: "Could not build the scout feed. Please try again.", items: [] });
      }
    }
  });

  app.post("/api/ai/attendance", async (req, res) => {
    // Hoisted so the catch block can attribute failed attempts to the caller.
    let auth: Awaited<ReturnType<typeof requireAuth>> = null;
    try {
      auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isGeminiConfigured()) {
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
        res.setHeader("X-Accel-Buffering", "no"); // stream through nginx unbuffered
        res.setHeader("Cache-Control", "no-cache");
        try {
          const streamedInsights = await aiStream(ATTENDANCE_SYSTEM, prompt, maxTokens, (chunk) => res.write(chunk));
          logAiUsage(auth.memberId, auth.teamId, null, prompt.length, String(streamedInsights || "").length, "ok", "gemini", "attendance");
          res.end();
        } catch (err) {
          console.error("AI attendance stream error:", err);
          logAiUsage(auth.memberId, auth.teamId, null, 0, 0, isQuotaError(err) ? "quota" : "error", "gemini", "attendance");
          res.end(isQuotaError(err) ? `\n\n(${QUOTA_EXHAUSTED_MSG})` : "\n\n(Failed to finish insights.)");
        }
        return;
      }
      const result = await aiGenerate(ATTENDANCE_SYSTEM, prompt, maxTokens);
      logAiUsage(auth.memberId, auth.teamId, null, prompt.length, String(result || "").length, "ok", "gemini", "attendance");
      res.json({ result });
    } catch (error) {
      console.error("AI attendance error:", error);
      if (auth) logAiUsage(auth.memberId, auth.teamId, null, 0, 0, isQuotaError(error) ? "quota" : "error", "gemini", "attendance");
      if (isQuotaError(error)) {
        res.status(429).json({ error: "AI quota exhausted", result: QUOTA_EXHAUSTED_MSG });
      } else {
        res.status(502).json({ error: "AI request failed", result: "Insights unavailable." });
      }
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
  // Run `fn` over items with at most `limit` in flight, preserving order.
  async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    });
    await Promise.all(workers);
    return out;
  }
  const SCOUT_BLOCK_RE = /```scout-team\s*\r?\n([\s\S]*?)\r?\n```/;
  const SCOUT_EVENT_RE = /```scout-event\s*\r?\n([\s\S]*?)\r?\n```/;
  // Bruno calendar skill: the model ends its reply with a fenced ```event block
  // (a JSON object OR array) when the user confirms calendar events. Parse,
  // validate, strip. Events are only PROPOSED here — the client shows a
  // confirm button and the user confirms via POST /api/ai/apply-actions.
  function extractEventBlock(fullText: string): { text: string; events: { title: string; date: string; time: string; end: string; notes: string }[] | null } {
    const src = String(fullText || "");
    const m = src.match(EVENT_BLOCK_RE);
    if (!m) return { text: src, events: null };
    let events: { title: string; date: string; time: string; end: string; notes: string }[] | null = null;
    try {
      const raw = JSON.parse(m[1]);
      const arr = Array.isArray(raw) ? raw : [raw];
      const valid = arr.map((p: any) => {
        const okDate = typeof p?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && !isNaN(new Date(p.date + "T00:00:00").getTime());
        const okTime = !p?.time || (typeof p.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time));
        if (!p || typeof p.title !== "string" || !p.title.trim() || !okDate || !okTime) return null;
        const time = typeof p.time === "string" ? p.time : "";
        // An end time is kept only when it is a valid HH:MM after the start
        // (an invalid end is dropped rather than failing the whole event).
        const end = typeof p.end === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.end) && time && p.end > time ? p.end : "";
        return {
          title: p.title.trim().slice(0, 120),
          date: p.date,
          time,
          end,
          notes: typeof p.notes === "string" ? p.notes.trim().slice(0, 500) : "",
        };
      }).filter(Boolean);
      if (valid.length && valid.length <= 20) events = valid;
    } catch { /* malformed JSON — treat as no events */ }
    return { text: src.replace(EVENT_BLOCK_RE, "").trim(), events };
  }

  // Bruno scouting skill: the model ends its reply with a fenced ```scout-team
  // block (a JSON object OR array of {number} entries) when the user asks about
  // other teams. Parse, validate, strip. The backend fetches the stats and
  // appends a summary to the reply.
  function extractScoutBlock(fullText: string): { text: string; numbers: number[] | null } {
    const src = String(fullText || "");
    const m = src.match(SCOUT_BLOCK_RE);
    if (!m) return { text: src, numbers: null };
    let numbers: number[] | null = null;
    try {
      const raw = JSON.parse(m[1]);
      const arr = Array.isArray(raw) ? raw : [raw];
      const valid = arr.map((p: any) => {
        const n = parseInt(p?.number, 10);
        return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
      }).filter(Boolean) as number[];
      if (valid.length && valid.length <= 3) numbers = valid;
    } catch { /* malformed JSON — treat as no scout request */ }
    return { text: src.replace(SCOUT_BLOCK_RE, "").trim(), numbers };
  }

  // Bruno scouting skill: the model ends its reply with a fenced ```scout-event
  // block ({"code": "USNJCMP"}) when the user asks about an entire event's
  // field. The backend fetches all teams at the event with their OPRs.
  function extractScoutEventBlock(fullText: string): { text: string; code: string | null } {
    const src = String(fullText || "");
    const m = src.match(SCOUT_EVENT_RE);
    if (!m) return { text: src, code: null };
    let code: string | null = null;
    try {
      const raw = JSON.parse(m[1]);
      const c = String(raw?.code || "").trim().slice(0, 32);
      if (c) code = c;
    } catch { /* malformed JSON — treat as no scout request */ }
    return { text: src.replace(SCOUT_EVENT_RE, "").trim(), code };
  }

  // Bruno calendar skill: the model ends its reply with a fenced ```delete-event
  // block (a JSON object OR array of {id} entries) when the user confirms
  // deleting calendar events. Parse, validate, strip. Deletions are only
  // PROPOSED here — confirmed via POST /api/ai/apply-actions.
  const DELETE_EVENT_BLOCK_RE = /```delete-event\s*\r?\n([\s\S]*?)\r?\n```/;
  function extractDeleteEventBlock(fullText: string): { text: string; ids: number[] | null } {
    const src = String(fullText || "");
    const m = src.match(DELETE_EVENT_BLOCK_RE);
    if (!m) return { text: src, ids: null };
    let ids: number[] | null = null;
    try {
      const raw = JSON.parse(m[1]);
      const arr = Array.isArray(raw) ? raw : [raw];
      const valid = arr
        .map((p: any) => (typeof p?.id === "number" ? p.id : parseInt(p?.id)))
        .filter((n: any) => Number.isInteger(n) && n > 0)
        .slice(0, 20);
      if (valid.length) ids = valid;
    } catch { /* malformed JSON — treat as no deletions */ }
    return { text: src.replace(DELETE_EVENT_BLOCK_RE, "").trim(), ids };
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

  // Bruno communications skill: the model ends its reply with a fenced
  // ```communications block (a JSON array) when the user confirms communication
  // log entries (e.g. importing a saved email). Parse, validate, strip.
  // Entries are only PROPOSED here — confirmed via POST /api/ai/apply-actions.
  const COMMUNICATIONS_BLOCK_RE = /```communications\s*\r?\n([\s\S]*?)\r?\n```/;
  function extractCommunicationsBlock(fullText: string): { text: string; entries: any[] | null } {
    const src = String(fullText || "");
    const m = src.match(COMMUNICATIONS_BLOCK_RE);
    if (!m) return { text: src, entries: null };
    let entries: any[] | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (Array.isArray(p) && p.length > 0 && p.length <= 20) {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const valid = p.map((c: any) => {
          if (!c || typeof c.recipient !== "string" || !c.recipient.trim()) return null;
          if (typeof c.subject !== "string" || !c.subject.trim()) return null;
          let date = todayStr;
          if (typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && !isNaN(new Date(c.date + "T00:00:00").getTime())) {
            date = c.date;
          }
          const type = c.type === "announcement" ? "announcement" : "email";
          const direction = c.direction === "inbound" ? "inbound" : "outbound";
          const parentId = Number.isInteger(c.parent_id) && (c.parent_id as number) > 0 ? (c.parent_id as number) : null;
          return {
            recipient: c.recipient.trim().slice(0, 200),
            subject: c.subject.trim().slice(0, 200),
            body: typeof c.body === "string" ? c.body.trim().slice(0, 2000) : "",
            date,
            type,
            direction,
            parent_id: parentId,
          };
        }).filter(Boolean);
        if (valid.length) entries = valid;
      }
    } catch { /* malformed JSON — treat as no entries */ }
    return { text: src.replace(COMMUNICATIONS_BLOCK_RE, "").trim(), entries };
  }

  // Bruno tasks skill: the model ends its reply with a fenced ```tasks block
  // (a JSON array) when the user confirms task entries. Parse, validate, strip.
  // Tasks are only PROPOSED here — confirmed via POST /api/ai/apply-actions.
  const TASKS_BLOCK_RE = /```tasks\s*\r?\n([\s\S]*?)\r?\n```/;
  type RawBrunoTask = { title: string; description: string; due_date: string; due_time?: string; priority?: string; assignees?: string[]; repeat?: unknown };
  function extractTasksBlock(fullText: string): { text: string; tasks: RawBrunoTask[] | null } {
    const src = String(fullText || "");
    const m = src.match(TASKS_BLOCK_RE);
    if (!m) return { text: src, tasks: null };
    let tasks: RawBrunoTask[] | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (Array.isArray(p) && p.length > 0 && p.length <= 20) {
        const valid = p.map((t: any): RawBrunoTask | null => {
          if (!t || typeof t.title !== "string" || !t.title.trim()) return null;
          let due = "";
          if (typeof t.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) && !isNaN(new Date(t.due_date + "T00:00:00").getTime())) {
            due = t.due_date;
          }
          // Names as written; resolved against the roster when applied.
          const names = [...(Array.isArray(t.assignees) ? t.assignees : []), ...(typeof t.assignee === "string" ? [t.assignee] : [])]
            .filter((n: any) => typeof n === "string" && n.trim()).map((n: string) => n.trim().slice(0, 80)).slice(0, 20);
          return {
            title: t.title.trim().slice(0, 120),
            description: typeof t.description === "string" ? t.description.trim().slice(0, 500) : "",
            due_date: due,
            ...(typeof t.due_time === "string" && TASK_TIME_RE.test(t.due_time) ? { due_time: t.due_time } : {}),
            ...(typeof t.priority === "string" ? { priority: t.priority.slice(0, 10) } : {}),
            ...(names.length ? { assignees: names } : {}),
            ...(t.repeat ? { repeat: typeof t.repeat === "string" ? t.repeat.slice(0, 20) : t.repeat } : {}),
          };
        }).filter((t): t is RawBrunoTask => !!t);
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
        // Same rules as the budget form and API (budgetEntryFrom); Bruno only
        // gets defaults for type (expense) and date (today), and long text is
        // trimmed rather than refused.
        const valid = p.map((b: any) => {
          const entry = budgetEntryFrom({
            type: b?.type === "income" ? "income" : "expense",
            amount: b?.amount,
            date: isIsoDate(b?.date) ? b.date : today,
            // Forms require both; Bruno fills sensible ones rather than drop the entry.
            category: (typeof b?.category === "string" && b.category.trim().slice(0, 80)) || "General",
            description: (typeof b?.description === "string" && b.description.trim().slice(0, 500))
              || (typeof b?.category === "string" && b.category.trim().slice(0, 80))
              || (b?.type === "income" ? "Income" : "Expense"),
          }, null);
          return "error" in entry ? null : entry;
        }).filter(Boolean);
        if (valid.length) entries = valid;
      }
    } catch { /* malformed JSON — treat as no entries */ }
    return { text: src.replace(BUDGET_BLOCK_RE, "").trim(), entries };
  }

  // Bruno communication skill: the model ends its reply with a fenced ```communication block
  // (a JSON array) when the user confirms communication log entries. Parse, validate, strip.
  // Entries are only PROPOSED here — confirmed via POST /api/ai/apply-actions.
  const COMMUNICATION_BLOCK_RE = /```communication\s*\r?\n([\s\S]*?)\r?\n```/;
  function extractCommunicationBlock(fullText: string): { text: string; entries: { recipient: string; subject: string; body: string; type: string; date: string }[] | null } {
    const src = String(fullText || "");
    const m = src.match(COMMUNICATION_BLOCK_RE);
    if (!m) return { text: src, entries: null };
    let entries: { recipient: string; subject: string; body: string; type: string; date: string }[] | null = null;
    try {
      const p = JSON.parse(m[1]);
      if (Array.isArray(p) && p.length > 0 && p.length <= 20) {
        const now = new Date();
        const todayDefault = now.toISOString().slice(0, 10) + " " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
        const valid = p.map((c: any) => {
          if (!c || typeof c.subject !== "string" || !c.subject.trim()) return null;
          let date = todayDefault;
          if (typeof c?.date === "string") {
            const d = c.date.trim();
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(d) && !isNaN(new Date(d.replace(" ", "T") + ":00").getTime())) date = d;
            else if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + "T00:00:00").getTime())) date = d + " 00:00";
          }
          return {
            recipient: typeof c?.recipient === "string" ? c.recipient.trim().slice(0, 200) : "",
            subject: c.subject.trim().slice(0, 200),
            body: typeof c?.body === "string" ? c.body.trim().slice(0, 5000) : "",
            type: c?.type === "announcement" ? "announcement" : "email",
            date,
          };
        }).filter(Boolean);
        if (valid.length) entries = valid;
      }
    } catch { /* malformed JSON — treat as no entries */ }
    return { text: src.replace(COMMUNICATION_BLOCK_RE, "").trim(), entries };
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

  /**
   * Bruno's scouting lookups: when a reply ends with a ```scout-team /
   * ```scout-event request, fetch the stats and return a summary to append
   * (or "" when there was no request). Shared by the streamed and the plain
   * reply paths — streamed replies used to promise a lookup and never run it.
   */
  async function scoutingAppendix(rawText: string, teamId: number | null, signal?: AbortSignal): Promise<string> {
    const scout = extractScoutBlock(String(rawText || ""));
    const scoutEvent = extractScoutEventBlock(String(rawText || ""));
    let out = "";
    // A stopped reply stops its lookups too (no fetches for an answer nobody sees).
    const stopped = () => !!signal?.aborted;
    if (stopped()) return "";
    // If Bruno requested team scouting, fetch the stats and append a summary.
    // Uses the data-source layer (FIRST Events primary, FTC Scout fallback).
    const srcName = (src: string) => (src === "first-events" ? "FIRST Events" : "FTC Scout");
    if (scout.numbers?.length) {
      const season = currentFtcSeason();
      const sources = new Set<string>();
      const summaries = await mapLimit(scout.numbers, 4, async (num: number) => {
        if (stopped()) return "";
        try {
          const payload = await getTeamData(num, season);
          const p = payload?.data;
          if (!payload || !p) return `**Team ${num}**: no data found for ${season} season`;
          sources.add(srcName(payload.source));
          // Inline citations: records from the payload's site, OPR from FTC Scout.
          const site = siteOf(payload.source, (payload as any).origin);
          const opr = p.opr || {};
          const link = citeTeam(site, season, Number(p.number) || num, opr.tot?.value != null);
          const fmt = (s: any) => s?.value != null ? `${s.value}${s.rank ? ` (#${s.rank})` : ''}` : 'n/a';
          const evts = (p.events || []).slice(0, 3).map((e: any) =>
            `${e.name}${e.rank ? ` (#${e.rank})` : ''}${e.wins != null ? ` ${e.wins}-${e.losses}-${e.ties}` : ''}`
          ).join('; ');
          return `**Team ${p.number} — ${p.name}** (${link}): OPR ${fmt(opr.tot)} (auto ${fmt(opr.auto)}, teleop ${fmt(opr.dc)}, endgame ${fmt(opr.eg)})${evts ? `\nRecent: ${evts}` : ''}`;
        } catch { return `**Team ${num}**: lookup failed (data sources unreachable)`; }
      });
      if (summaries.length) {
        const label = sources.size ? [...sources].join(' + ') : 'no live source';
        out += `\n\n---\n**Scouting data** (${label}, ${season} season):\n\n${summaries.join('\n\n')}`;
      }
    }
    // If Bruno requested event-wide scouting, fetch the field at the event.
    // Uses the data-source layer (FIRST Events primary, FTC Scout fallback).
    if (scoutEvent.code) {
      const season = currentFtcSeason();
      try {
        const teamRow = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", teamId)) as any;
        const myNum = parseInt(teamRow?.ftc_team_number, 10) || 0;
        const evPayload = await getEventData(myNum, season, scoutEvent.code).catch(() => null);
        const ev = evPayload?.data;
        if (evPayload && ev?.teams?.length) {
          const rankMap = new Map<number, number>();
          for (const r of ev.rankings || []) {
            if (r.teamNumber && r.rank) rankMap.set(r.teamNumber, r.rank);
          }
          const field: number[] = ev.teams.map((t: any) => t.teamNumber).filter((n: number) => n && n !== myNum);
          // With event rankings: order the whole field by rank first, then
          // look up only the top of it. Without: OPR is the only signal, so
          // look up (a capped slice of) the field and rank by OPR.
          const ranked = rankMap.size > 0;
          const candidates = ranked
            ? [...field].sort((a, b) => (rankMap.get(a) ?? 9999) - (rankMap.get(b) ?? 9999)).slice(0, 15)
            : field.slice(0, 40);
          const rows = (await mapLimit(candidates, 6, async (n: number) => {
            if (stopped()) return null;
            try {
              const d = (await getTeamData(n, season))?.data;
              if (!d) return null;
              const er = rankMap.get(n);
              const oprV = d.opr?.tot?.value;
              // Each row's OPR is this team's FTC Scout season figure: cite it.
              const oprCite = oprV != null ? ` (${cite('ftc-scout', teamUrl('ftc-scout', season, n))})` : '';
              const label = er ? `event #${er}${oprV != null ? `, OPR ${oprV}${oprCite}` : ''}` : oprV != null ? `OPR ${oprV}${oprCite}` : "no data";
              return { text: `${d.number} ${d.name} — ${label}`, sort: er ?? (oprV != null ? 1000 - oprV : 9999) };
            } catch { return null; }
          })).filter(Boolean) as { text: string; sort: number }[];
          rows.sort((a, b) => a.sort - b.sort);
          const basis = ranked
            ? `ranked by event standings (${field.length} teams)`
            : `ranked by OPR — considered ${candidates.length} of ${field.length} teams`;
          const evSite = siteOf(evPayload.source, (evPayload as any).origin);
          // Standings come from the event's site; each row cites its own OPR.
          const evLink = cite(evSite, eventUrl(evSite, season, ev.code || scoutEvent.code));
          out += `\n\n---\n**Event scouting: ${ev.name}** (${evLink}, ${season} season, ${basis}):\n\nTop teams:\n${rows.slice(0, 15).map((r, i) => `${i + 1}. ${r.text}`).join('\n')}\n\n_These are data-driven suggestions, not guarantees — watch matches and scout in person before locking picks._`;
        }
      } catch { /* event scouting is best-effort */ }
    }
    return out;
  }

  app.post("/api/ai/build-helper", async (req, res) => {
    // Hoisted so the catch block can attribute failed attempts to the caller.
    let auth: Awaited<ReturnType<typeof requireAuth>> = null;
    try {
      auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isAIConfigured()) {
        return res.status(501).json({ error: "AI not configured", result: "Bruno isn't set up yet — the team owner needs to add a Gemini or Anthropic API key." });
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
      // Screenshots attached to the latest user message. Validated and used
      // in-memory for this one request only: they are never written to disk
      // and never persisted to the database (the stored chat row gets a
      // "[screenshot attached]" marker instead). This keeps screenshots from
      // accumulating and eating server space.
      const images = sanitizeBrunoImages(req.body?.images);
      const pdfs = sanitizeBrunoPdfs(req.body?.pdfs);
      // Merge PDFs into the file list for the AI (Gemini inlineData handles both).
      // Misuse heuristics run async (never blocks the reply); flags land in the owner review queue.
      // The owner's own testing is never flagged — reviewing your own flags is noise.
      const reqChatId = parseInt(req.body?.chatId, 10) || null;
      const callerIsOwner = ownerEmails().includes(((auth.email) || "").toLowerCase());
      if (!callerIsOwner) {
        flagMisuse(auth.memberId, auth.teamId, reqChatId, messages[messages.length - 1].text);
      }
      const globalMax = await getMaxTokens("max_tokens_chat", 1024);
      const memberCap = (await dbGet("SELECT ai_max_tokens_reply, bruno_output_level FROM members WHERE id = ?", auth.memberId)) as any;
      const perUserMax = parseInt(memberCap?.ai_max_tokens_reply, 10);
      // Member's output-level preference (Settings → Bruno AI): low 512 /
      // medium 1024 / high 2048 / max 4096. Admin caps still apply as ceilings.
      const OUTPUT_LEVEL_TOKENS: Record<string, number> = { low: 512, medium: 1024, high: 2048, max: 4096 };
      const levelCap = OUTPUT_LEVEL_TOKENS[String(memberCap?.bruno_output_level || "medium")] ?? 1024;
      const maxTokens = Math.min(
        globalMax,
        Number.isFinite(perUserMax) && perUserMax > 0 ? perUserMax : globalMax,
        levelCap
      );
      const stream = req.query.stream === "true";
      const teamContext = await buildChatContext(auth.teamId);
      const snapshotCtx = await buildTeamSnapshotContext(auth.teamId);
      // Counts, dates, weekdays, next/recurring events and open tasks are
      // computed server-side in the team's timezone (see server/workspaceFacts.ts)
      // — Bruno states them, it doesn't derive them. Event ids stay listed so
      // ```delete-event proposals can reference them.
      const tz = await teamTimeZone(auth.teamId, req.body?.tz);
      const factsCtx = await workspaceFactsBlock({ dbGet, dbAll }, auth.teamId, tz);
      // User identity: Bruno should address the user by name, not the team name.
      let userLine = "";
      try {
        const member = (await dbGet("SELECT name FROM members WHERE id = ?", auth.memberId)) as any;
        if (member?.name) {
          userLine = `You are chatting with ${member.name}. Address them by their first name in greetings (e.g. "Hey ${member.name.split(' ')[0]}!"), not by the team name.`;
        }
      } catch (err) { console.error("[bruno] user name lookup failed:", err); /* best-effort */ }
      // Bruno memory (phase 4c): facts saved in earlier chats, this member's and the team's.
      // Each scope has its own limit, so a busy team never crowds out this member's own facts.
      const userMem = auth.teamId ? ((await dbAll(
        "SELECT content FROM bruno_memories WHERE team_id = ? AND scope = 'user' AND member_id = ? ORDER BY id DESC LIMIT 30", auth.teamId, auth.memberId,
      )) as any[]) : [];
      const teamMem = auth.teamId ? ((await dbAll(
        "SELECT content FROM bruno_memories WHERE team_id = ? AND scope = 'team' ORDER BY id DESC LIMIT 30", auth.teamId,
      )) as any[]) : [];
      const memberNameRow = (await dbGet("SELECT name FROM members WHERE id = ?", auth.memberId)) as any;
      const memoryCtx = memoryPromptBlock(
        userMem.map((r) => String(r.content)),
        teamMem.map((r) => String(r.content)),
        String(memberNameRow?.name || ""),
      );
      const fullContext = [userLine, teamContext, factsCtx, snapshotCtx, memoryCtx].filter(Boolean).join("\n\n");
      // Secret persona: NavGPT ❤️ overrides the Bruno identity only when the active
      // team qualifies (4215 Hypnotic Robotics) AND its toggle is switched on —
      // unless the client explicitly asked for Bruno (the coding-handoff switch).
      const personaOverride = req.body?.persona === "bruno" ? "bruno" : null;
      const navGptOn = !personaOverride && (await navGptActiveForTeam(auth.teamId));
      // Teaching mode (member preference, Settings → Bruno AI): the member
      // wants to LEARN, not just receive finished code. Bruno-only — NavGPT's
      // navigation persona is unaffected.
      let teachCtx = "";
      try {
        const pref = (await dbGet("SELECT bruno_teach_mode FROM members WHERE id = ?", auth.memberId)) as any;
        if (!navGptOn && pref?.bruno_teach_mode === 1) {
          teachCtx = "TEACHING MODE (this member's saved preference): they want to learn, not just receive finished code. Explain the concepts first, walk through the logic step by step, and guide them to write it themselves. Only write out full code when they explicitly ask you to.";
        }
      } catch (err) { console.error("[bruno] teach-mode pref lookup failed:", err); /* best-effort — never block the reply */ }
      // Analyze mode (Team Stats): structured scouting pack built server-side
      // from cached FTC data. Best-effort — never blocks the reply.
      const scoutingCtx = await scoutingContextFor(auth, req.body?.scouting).catch((err: unknown) => {
        console.error("[bruno] scouting context failed:", err);
        return "";
      });
      // What the user is looking at (page + open record). Best-effort.
      const screenCtx = await screenContextFor(auth, req.body?.screen).catch((err: unknown) => {
        console.error("[bruno] screen context failed:", err);
        return "";
      });
      const systemExtra = [navGptOn ? NAVGPT_SYSTEM : "", teachCtx, fullContext, screenCtx, scoutingCtx].filter(Boolean).join("\n\n");
      // Data-action blocks (```event, ```delete-event, ```outreach, ```tasks, ```budget,
      // ```communications) are PROPOSALS only: strip them from the reply text here. Nothing is
      // inserted until the user taps the confirm button, which calls
      // POST /api/ai/apply-actions with the parsed items.
      // A reply may carry several blocks of one kind (pasted meeting notes):
      // strip until none are left.
      const stripActionBlocks = (rawText: string): string => {
        let t = rawText;
        for (let pass = 0; pass < 8; pass++) {
          const before = t;
          t = stripActionBlocksOnce(t);
          if (t === before) break;
        }
        return t;
      };
      const stripActionBlocksOnce = (rawText: string): string => {
        let t = extractSwitchBlock(rawText).text;
        t = extractEventBlock(t).text;
        t = extractDeleteEventBlock(t).text;
        t = extractOutreachBlock(t).text;
        t = extractCommunicationsBlock(t).text;
        t = extractTasksBlock(t).text;
        t = extractBudgetBlock(t).text;
        t = extractScoutBlock(t).text;
        t = extractScoutEventBlock(t).text;
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
        const userText = messages[messages.length - 1].text + (images.length ? " 📷 [screenshot attached]" : "") + (pdfs.length ? ` 📄 [${pdfs.length} PDF${pdfs.length > 1 ? 's' : ''} attached: ${pdfs.map(p => p.name).join(', ')}]` : "");
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
      // Bruno lookups (phase 4b): a reply that ends with a ```lookup block asks
      // for team data. Run it for this team and let Bruno answer from the rows
      // in a second pass; the block itself is never shown or saved.
      const lookupTz = await teamTimeZone(auth.teamId, req.body?.tz);
      // ```remember facts from a finished reply: saved for this member (or the
      // team, for members who manage it), with a short note back to the user.
      // Saved only once the reply is final (after the Stop check): a stopped
      // reply leaves no facts behind.
      const saveMemories = async (facts: { scope: string; fact: string }[]): Promise<string> => {
        if (!facts.length || !auth.teamId) return "";
        try {
          const canTeam = await hasPerm(auth, "manage_members");
          const saved: string[] = [];
          for (const f of facts) {
            const scope = f.scope === "team" && canTeam ? "team" : "user";
            if (await storeBrunoMemory(auth.teamId, auth.memberId, scope, f.fact)) saved.push(scope === "team" ? `${f.fact} (team)` : f.fact);
          }
          return saved.length ? `\n\n_Remembered: ${saved.join("; ")}. (Settings → Bruno to review.)_` : "";
        } catch (e) {
          console.error("Bruno memory save failed:", (e as any)?.message);
          return "";
        }
      };
      const followUpWithLookups = async (firstText: string, opts: { stream: boolean; onChunk?: (c: string) => void; signal: AbortSignal; grounded: boolean }) => {
        const { text: shownFirst, queries } = extractLookupBlocks(firstText);
        if (!queries.length || !auth.teamId) return null;
        const web = queries.some((q) => q.kind === "web");
        const dataQueries = queries.filter((q) => q.kind !== "web");
        const rows = dataQueries.length ? await runLookups(dbAll as any, auth.teamId, lookupTz, dataQueries) : "";
        if (opts.signal.aborted) return null;
        const secondMessages = [
          ...messages,
          { role: "model", text: firstText },
          // Rows (up to 12,000 chars) and their incomplete/failed notes must reach the model whole.
          { role: "user", maxChars: 14000, text: followUpPrompt(rows, queries) },
        ];
        let secondUsage: any = null;
        const second = await aiChat({
          extraSystem: systemExtra,
          messages: secondMessages,
          maxTokens,
          stream: opts.stream,
          onChunk: opts.onChunk,
          onUsage: (u) => { secondUsage = u; },
          signal: opts.signal,
          // A ```lookup {"kind":"web"} check, or a question the first call
          // already searched the web for, runs this pass with live web search.
          webSearch: web || opts.grounded,
        });
        // The second call is its own AI request: log it on its own row (with
        // its own provider) so daily limits count both calls.
        const secondPromptChars = secondMessages.reduce((n: number, m: any) => n + String(m.text || "").length, 0);
        logAiUsage(auth.memberId, auth.teamId, secondUsage, secondPromptChars, String(second.text || "").length, "ok", second.provider);
        return { shownFirst, answer: extractLookupBlocks(second.text).text, provider: second.provider, sources: second.sources };
      };
      if (stream) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("X-Accel-Buffering", "no"); // stream through nginx unbuffered
        res.setHeader("Cache-Control", "no-cache");
        // If the browser goes away mid-stream, abort the upstream Gemini
        // request instead of burning tokens on a reply nobody will read.
        const streamAbort = new AbortController();
        req.on("close", () => streamAbort.abort());
        try {
          let usage: any = null;
          const hold = createLookupHold();
          // Hybrid provider: Gemini (free) handles everything; Anthropic is
          // fallback on quota. The router decides deterministically — no
          // model call is spent choosing the provider.
          const aiReply = await aiChat({
            extraSystem: systemExtra,
            messages,
            maxTokens,
            stream: true,
            webSearch: req.body?.webSearch === true,
            images: (images.length || pdfs.length) ? [...images, ...pdfs.map(p => ({ mimeType: p.mimeType, data: p.data }))] : undefined,
            onChunk: (chunk) => { const out = hold.push(chunk); if (out) res.write(out); },
            onUsage: (u) => { usage = u; },
            signal: streamAbort.signal,
          });
          const tail = hold.end();
          if (tail) res.write(tail);
          let fullText = aiReply.text;
          const webSources = [...(aiReply.sources || [])];
          // The first call's own counts, logged before any lookup pass (which logs itself).
          const firstPromptChars = messages.reduce((n: number, m: any) => n + String(m.text || "").length, 0);
          logAiUsage(auth.memberId, auth.teamId, usage, firstPromptChars, String(aiReply.text || "").length, "ok", aiReply.provider);
          if (hold.blocked && !streamAbort.signal.aborted) {
            const hold2 = createLookupHold();
            // The answer starts its own paragraph, live and in the saved reply alike.
            const gap = extractLookupBlocks(fullText).text ? "\n\n" : "";
            let gapWritten = false;
            // What the user has seen of the second pass, so a failure part-way saves the same text.
            let secondShown = "";
            const looked = await followUpWithLookups(fullText, {
              stream: true,
              onChunk: (chunk) => {
                const out = hold2.push(chunk);
                if (!out) return;
                if (!gapWritten) { gapWritten = true; if (gap) res.write(gap); }
                secondShown += out;
                res.write(out);
              },
              signal: streamAbort.signal,
              grounded: aiReply.grounded,
            }).catch((e) => { console.error("Bruno lookup pass failed:", e?.message); return null; });
            if (streamAbort.signal.aborted) { res.end(); return; }
            const tail2 = hold2.end();
            if (tail2) {
              if (!gapWritten) { gapWritten = true; if (gap) res.write(gap); }
              secondShown += tail2;
              res.write(tail2);
            }
            if (looked) {
              fullText = `${looked.shownFirst}\n\n${looked.answer}`.trim();
              // The answer's own pages first: the cap must never hide them.
              webSources.unshift(...(looked.sources || []));
            } else {
              const sorry = "\n\n(I couldn't look that up just now. Try asking again.)";
              res.write(sorry);
              const shown = extractLookupBlocks(fullText).text;
              fullText = (secondShown.trim() ? `${shown}\n\n${secondShown.trim()}` : shown) + sorry;
            }
          }
          // Strip the NavGPT ```switch handoff block and any data-action proposal
          // blocks before persisting (the live client strips them for display
          // itself and renders the switch button / confirm card).
          // Scouting lookups the reply asked for run now and stream after it.
          const mem = extractRememberBlocks(fullText);
          fullText = mem.text;
          const scouting = await scoutingAppendix(fullText, auth.teamId, streamAbort.signal).catch(() => "");
          // Stopped during the lookups: the user has the reply they saw; nothing more is written or saved.
          if (streamAbort.signal.aborted) { res.end(); return; }
          // The note streams with the scouting appendix below (written once).
          // Web pages the answer drew on, listed under it (phase 4d).
          const appendix = sourcesFooter(webSources) + (await saveMemories(mem.facts)) + scouting;
          if (appendix) res.write(appendix);
          const finalText = stripActionBlocks(fullText) + appendix;
          if (chat && String(finalText || "").trim()) {
            (await dbRun("INSERT INTO bruno_messages (chat_id, role, text) VALUES (?, 'model', ?)", chat.id, String(finalText).slice(0, 20000)));
          }
          res.end();
        } catch (err: any) {
          console.error("AI build-helper stream error:", err);
          const anthropicQuota = isAnthropicQuotaError(err);
          const quota = anthropicQuota || isQuotaError(err);
          const quotaMsg = anthropicQuota ? ANTHROPIC_QUOTA_EXHAUSTED_MSG : QUOTA_EXHAUSTED_MSG;
          // Track the attempt even on failure so the owner dashboard reflects
          // real usage during an upstream outage (0 tokens — nothing was generated).
          logAiUsage(auth.memberId, auth.teamId, null, 0, 0, quota ? "quota" : "error", (err as any)?.aiProvider || "unknown");
          res.end(quota ? `\n\n(${quotaMsg})` : "\n\n(Something glitched — try asking again.)");
        }
        return;
      }
      let nonStreamUsage: any = null;
      const nonStreamAbort = new AbortController();
      req.on("close", () => nonStreamAbort.abort());
      const aiReply = await aiChat({
        extraSystem: systemExtra,
        messages,
        maxTokens,
        stream: false,
        webSearch: req.body?.webSearch === true,
        images: (images.length || pdfs.length) ? [...images, ...pdfs.map(p => ({ mimeType: p.mimeType, data: p.data }))] : undefined,
        onUsage: (u) => { nonStreamUsage = u; },
        signal: nonStreamAbort.signal,
      });
      let result = aiReply.text;
      const firstPromptChars = messages.reduce((n: number, m: any) => n + String(m.text || "").length, 0);
      logAiUsage(auth.memberId, auth.teamId, nonStreamUsage, firstPromptChars, String(result || "").length, "ok", aiReply.provider);
      // Same rule as the stream: any ```lookup block (even an unfinished or
      // unreadable one) is never shown or saved; if it can't run, say so.
      const webSourcesNS = [...(aiReply.sources || [])];
      if (String(result || "").includes("```lookup")) {
        const looked = await followUpWithLookups(String(result || ""), { stream: false, signal: nonStreamAbort.signal, grounded: aiReply.grounded }).catch(() => null);
        result = looked ? `${looked.shownFirst}\n\n${looked.answer}`.trim() : `${extractLookupBlocks(String(result || "")).text}\n\n(I couldn't look that up just now. Try asking again.)`;
        if (looked) webSourcesNS.unshift(...(looked.sources || []));
      }
      const memNS = extractRememberBlocks(String(result || ""));
      result = memNS.text;
      const scoutingNS = await scoutingAppendix(String(result || ""), auth.teamId, nonStreamAbort.signal);
      if (nonStreamAbort.signal.aborted) return;
      const finalResult = stripActionBlocks(String(result || "")) + sourcesFooter(webSourcesNS) + (await saveMemories(memNS.facts)) + scoutingNS;
      if (chat) {
        const modelText = String(finalResult || "");
        if (modelText.trim()) {
          (await dbRun("INSERT INTO bruno_messages (chat_id, role, text) VALUES (?, 'model', ?)", chat.id, modelText.slice(0, 20000)));
        }
      }
      res.json({ result: finalResult, chatId: chat ? chat.id : undefined });
    } catch (error: any) {
      console.error("AI build-helper error:", error);
      const anthropicQuota = isAnthropicQuotaError(error);
      const quota = anthropicQuota || isQuotaError(error);
      if (auth) logAiUsage(auth.memberId, auth.teamId, null, 0, 0, quota ? "quota" : "error", (error as any)?.aiProvider || "unknown");
      if (quota) {
        const quotaMsg = anthropicQuota ? ANTHROPIC_QUOTA_EXHAUSTED_MSG : QUOTA_EXHAUSTED_MSG;
        res.status(429).json({ error: "AI quota exhausted", result: quotaMsg });
      } else {
        res.status(502).json({ error: "AI request failed", result: "Bruno hit a snag — please try again in a moment." });
      }
    }
  });

  // Confirm + apply Bruno/NavGPT data-action proposals (```event, ```outreach,
  // ```tasks, ```budget, ```communications blocks). The AI only proposes; nothing is inserted
  // until the user taps the confirm button, which calls this endpoint with the
  // parsed items. Server re-validates everything before inserting.
  // Permissions mirror the direct APIs: events/outreach any team member (same
  // as the old Bruno auto-insert behavior), tasks/budget admins only.
  // ---- Bruno memory (phase 4c) ----
  app.get("/api/bruno/memories", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const rows = (await dbAll(
        "SELECT id, scope, content, created_at FROM bruno_memories WHERE team_id = ? AND (scope = 'team' OR member_id = ?) ORDER BY id DESC",
        auth.teamId, auth.memberId,
      )) as any[];
      res.json({ user: rows.filter((r) => r.scope === "user"), team: rows.filter((r) => r.scope === "team"), canEditTeam: await hasPerm(auth, "manage_members") });
    } catch (error) {
      console.error("Bruno memories read failed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /** Save one fact unless it's a duplicate, keeping the newest within the
   *  scope's cap. Returns the new row id, or 0 for a duplicate. */
  async function storeBrunoMemory(teamId: number, memberId: number, scope: "user" | "team", fact: string): Promise<number> {
    // One save at a time per memory list, so two chats (or a double-clicked
    // Add) can't both pass the duplicate check before either inserts.
    const key = scope === "team" ? `t${teamId}` : `u${teamId}:${memberId}`;
    const prev = memoryLocks.get(key) || Promise.resolve();
    const run = prev.catch(() => {}).then(() => storeBrunoMemoryNow(teamId, memberId, scope, fact));
    const tail = run.catch(() => {});
    memoryLocks.set(key, tail);
    void tail.then(() => { if (memoryLocks.get(key) === tail) memoryLocks.delete(key); });
    return run;
  }
  const memoryLocks = new Map<string, Promise<unknown>>();
  async function storeBrunoMemoryNow(teamId: number, memberId: number, scope: "user" | "team", fact: string): Promise<number> {
    const existing = ((await dbAll(
      scope === "team" ? "SELECT content FROM bruno_memories WHERE team_id = ? AND scope = 'team'" : "SELECT content FROM bruno_memories WHERE team_id = ? AND scope = 'user' AND member_id = ?",
      ...(scope === "team" ? [teamId] : [teamId, memberId]),
    )) as any[]).map((r) => String(r.content));
    if (isDuplicateFact(fact, existing)) return 0;
    const info = await dbRun(
      "INSERT INTO bruno_memories (team_id, member_id, scope, content, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      teamId, scope === "user" ? memberId : null, scope, fact, memberId, new Date().toISOString(),
    );
    await dbRun(
      scope === "team"
        ? "DELETE FROM bruno_memories WHERE team_id = ? AND scope = 'team' AND id NOT IN (SELECT id FROM bruno_memories WHERE team_id = ? AND scope = 'team' ORDER BY id DESC LIMIT ?)"
        : "DELETE FROM bruno_memories WHERE team_id = ? AND scope = 'user' AND member_id = ? AND id NOT IN (SELECT id FROM bruno_memories WHERE team_id = ? AND scope = 'user' AND member_id = ? ORDER BY id DESC LIMIT ?)",
      ...(scope === "team" ? [teamId, teamId, MAX_TEAM_MEMORIES] : [teamId, memberId, teamId, memberId, MAX_USER_MEMORIES]),
    );
    return Number(info.lastInsertRowid);
  }

  app.post("/api/bruno/memories", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth || !auth.teamId) return auth && res.status(400).json({ error: "Join a workspace first" });
      const content = String(req.body?.content || "").replace(/\s+/g, " ").trim().slice(0, MAX_FACT_CHARS);
      if (!content) return res.status(400).json({ error: "Write something for Bruno to remember" });
      const scope = req.body?.scope === "team" ? "team" : "user";
      if (scope === "team" && !(await hasPerm(auth, "manage_members"))) return res.status(403).json({ error: "Only people who manage the team can add team memories" });
      // Same checked, capped save as facts from chat.
      const id = await storeBrunoMemory(auth.teamId, auth.memberId, scope, content);
      if (!id) return res.status(409).json({ error: "Bruno already remembers that" });
      res.json({ memory: { id, scope, content } });
    } catch (error) {
      console.error("Bruno memory add failed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/bruno/memories/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const row = (await dbGet("SELECT id, team_id, member_id, scope FROM bruno_memories WHERE id = ?", parseInt(req.params.id, 10))) as any;
      const mine = row && row.team_id === auth.teamId && (row.scope === "user" ? row.member_id === auth.memberId : await hasPerm(auth, "manage_members"));
      if (!mine) return res.status(404).json({ error: "Memory not found" });
      await dbRun("DELETE FROM bruno_memories WHERE id = ?", row.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("Bruno memory delete failed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---- Bruno morning nudge (phase 4c) ----
  // Every 10 minutes: in each team where it's now 8 AM, members who have the
  // nudge on and haven't had today's get one line about their tasks due today
  // and overdue (managers also hear about unassigned ones). Nothing to say, no
  // nudge (later sweeps that hour look again); the day is claimed with INSERT
  // OR IGNORE right before sending, so it goes out once.
  let nudging = false;
  const sendMorningNudges = async (now = new Date()) => {
    if (nudging) return;
    nudging = true;
    try {
      const teams = (await dbAll("SELECT id, timezone FROM teams")) as any[];
      for (const t of teams) {
        const { hour, day } = localHourAndDay(resolveTimeZone(t.timezone), now);
        if (hour !== Number(process.env.BRUNO_NUDGE_HOUR ?? 8)) continue;
        const members = (await dbAll(
          `SELECT m.id, m.email FROM members m WHERE m.team_id = ? AND COALESCE(m.is_active, 1) = 1 AND COALESCE(m.bruno_nudges, 1) = 1 AND ${VERIFIED_MEMBER_SQL}`, t.id,
        )) as any[];
        for (const m of members) {
          try {
            if (await dbGet("SELECT 1 FROM bruno_nudges_sent WHERE member_id = ? AND day = ?", m.id, day)) continue;
            // Board tasks only count for members whose task page shows them.
            const board = (await hasPermInTeam(String(m.email || ""), t.id, "manage_members")) ? "" : " AND COALESCE(t.is_board, 0) = 0";
            const mine = `t.team_id = ? AND t.status != 'done'${board} AND (t.assigned_to = ? OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.member_id = ?))`;
            const due = (await dbGet(`SELECT SUM(CASE WHEN t.due_date = ? THEN 1 ELSE 0 END) AS today, SUM(CASE WHEN t.due_date < ? THEN 1 ELSE 0 END) AS overdue FROM tasks t WHERE ${mine}`, day, day, t.id, m.id, m.id)) as any;
            const manager = await hasPermInTeam(String(m.email || ""), t.id, "manage_tasks");
            const unassigned = manager
              ? Number(((await dbGet(`SELECT COUNT(*) AS n FROM tasks t WHERE t.team_id = ? AND t.status != 'done'${board} AND t.assigned_to IS NULL AND NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id)`, t.id)) as any)?.n || 0)
              : null;
            const text = nudgeText({ dueToday: Number(due?.today || 0), overdue: Number(due?.overdue || 0), unassigned });
            if (!text) continue; // nothing yet; a later sweep this hour checks again
            const claim = await dbRun("INSERT OR IGNORE INTO bruno_nudges_sent (member_id, day) VALUES (?, ?)", m.id, day);
            if (!claim.changes) continue;
            try {
              await createNotification(m.id, text, "system", { nudge: true, day }, { throwOnError: true });
            } catch (e) {
              // Not delivered: release the day so a later sweep this hour retries.
              await dbRun("DELETE FROM bruno_nudges_sent WHERE member_id = ? AND day = ?", m.id, day);
              throw e;
            }
          } catch (e) {
            console.error(`Morning nudge for member ${m.id} failed:`, (e as any)?.message);
          }
        }
      }
    } catch (e) {
      console.error("Morning nudges failed:", (e as any)?.message);
    } finally {
      nudging = false;
    }
  };
  setInterval(() => void sendMorningNudges(), Number(process.env.BRUNO_NUDGE_SWEEP_MS) || 10 * 60 * 1000).unref();

  // What the Bruno confirm card needs to show a proposal exactly as it will be
  // saved: the team's today and its roster names.
  app.get("/api/ai/proposal-context", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const roster = (await dbAll("SELECT name FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", auth.teamId)) as any[];
      res.json({ today: todayIn(await teamTimeZone(auth.teamId, req.query.tz)), roster: roster.map((m: any) => String(m.name)) });
    } catch (error) {
      console.error("proposal-context error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/ai/apply-actions", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const actions = req.body?.actions;
      if (!Array.isArray(actions) || !actions.length || actions.length > 12) {
        return res.status(400).json({ error: "No actions to apply" });
      }
      // Bruno's proposals are applied with exactly the permission the direct
      // API needs for the same write — checked for every action BEFORE any
      // is written, so a refused action never leaves a partial apply behind.
      const PERM_FOR_KIND: Record<string, { perm: string; error: string }> = {
        "event": { perm: "manage_calendar", error: "Only members with calendar access can add events" },
        "delete-event": { perm: "manage_calendar", error: "Only members with calendar access can delete events" },
        "communication": { perm: "manage_communications", error: "Only members with communication access can log messages" },
        "task": { perm: "manage_tasks", error: "Only members with task access can add tasks" },
        "budget": { perm: "manage_budget", error: "Only members with budget access can add budget entries" },
      };
      for (const a of actions) {
        const need = PERM_FOR_KIND[a?.kind];
        if (need && !(await hasPerm(auth, need.perm))) return res.status(403).json({ error: need.error });
      }
      const applied: Record<string, number> = {};
      const createdAt = new Date().toISOString();
      for (const a of actions) {
        const kind = a?.kind;
        const items = Array.isArray(a?.items) ? a.items : [];
        if (!items.length || items.length > 20) continue;
        if (kind === "event") {
          const { events } = extractEventBlock("```event\n" + JSON.stringify(items) + "\n```");
          if (!events?.length) continue;
          // Saved as confirmed: the confirm card already moved any time left
          // in the title or notes into the time fields (recoverEventTime).
          for (const e of events) {
            (await insertTeamEvent(auth.teamId, auth.memberId, e));
          }
          applied.event = (applied.event || 0) + events.length;
          const everyone = (await dbAll("SELECT id FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", auth.teamId)) as any[];
          void notifyTeamUpdate(auth.teamId!, auth.memberId, everyone.map((m) => m.id), "event",
            events.length === 1 ? `New calendar event: ${events[0].title} on ${events[0].date}` : `${events.length} calendar events were added`,
            { events: events.length }, events.length);
        } else if (kind === "delete-event") {
          const ids = items
            .map((it: any) => (typeof it?.id === "number" ? it.id : parseInt(it?.id)))
            .filter((n: any) => Number.isInteger(n) && n > 0)
            .slice(0, 20);
          if (!ids.length) continue;
          const placeholders = ids.map(() => "?").join(",");
          const info: any = await dbRun(
            `DELETE FROM events WHERE team_id = ? AND id IN (${placeholders})`,
            auth.teamId, ...ids
          );
          const deleted = Number(info?.changes) || 0;
          if (deleted) applied["delete-event"] = (applied["delete-event"] || 0) + deleted;
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
        } else if (kind === "communication") {
          const { entries } = extractCommunicationsBlock("```communications\n" + JSON.stringify(items) + "\n```");
          if (!entries?.length) continue;
          // Validate every parent BEFORE writing anything: if one reply
          // refers to a deleted thread, nothing is saved, so a retry
          // cannot duplicate the entries that succeeded before the failure.
          const resolvedParents = new Map<number, number | null>();
          for (const c of entries) {
            if (c.parent_id != null) {
              const parent: any = (await dbGet("SELECT id, team_id, parent_id FROM communications WHERE id = ?", c.parent_id));
              if (!parent || parent.team_id !== auth.teamId) {
                return res.status(400).json({ error: `Thread #${c.parent_id} no longer exists — nothing was logged` });
              }
              resolvedParents.set(c.parent_id, parent.parent_id != null ? parent.parent_id : parent.id);
            }
          }
          for (const c of entries) {
            // Resolve parent_id to the thread root (same rule as POST
            // /api/communications): must belong to this team.
            const parentId = c.parent_id != null ? resolvedParents.get(c.parent_id) ?? null : null;
            (await dbRun(
              "INSERT INTO communications (recipient, subject, body, date, type, team_id, parent_id, direction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              c.recipient, c.subject, c.body, c.date, c.type, auth.teamId, parentId, c.direction || 'outbound'
            ));
          }
          applied.communication = (applied.communication || 0) + entries.length;
        } else if (kind === "task") {
          const { tasks } = extractTasksBlock("```tasks\n" + JSON.stringify(items) + "\n```");
          if (!tasks?.length) continue;
          // Saved exactly as confirmed: the card already read any fields left
          // in the text (normalizeBrunoTask with fromText); here names resolve
          // against the roster and a bare time takes the team's today.
          const roster = (await dbAll("SELECT id, name FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", auth.teamId)) as any[];
          const todayISO = todayIn(await teamTimeZone(auth.teamId, req.body?.tz));
          const names = roster.map((m: any) => String(m.name));
          for (const raw of tasks) {
            const t = normalizeBrunoTask(raw, todayISO, names, { fromText: false });
            const ids = t.assignees.map((n) => roster.find((m: any) => m.name === n)?.id).filter((id): id is number => Number.isFinite(id));
            const info = await dbRun(
              "INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, due_time, is_board, created_at, priority, recurrence) VALUES (?, ?, ?, 'todo', ?, ?, ?, 0, ?, ?, ?)",
              auth.teamId, t.title, t.description, ids[0] ?? null, t.due_date, t.due_date ? t.due_time : null, createdAt, t.priority, t.recurrence ? JSON.stringify(t.recurrence) : null,
            );
            const taskId = Number(info.lastInsertRowid);
            if (ids.length) {
              await setTaskAssignees(taskId, ids, auth.teamId);
              for (const mid of ids) if (mid !== auth.memberId) void createNotification(mid, `New task assigned: ${t.title}`, "task", { task_id: taskId });
              // The same assignment email as POST /api/tasks.
              void notifyTaskAssignees(taskId, t.title, t.description, t.due_date || "", auth.teamId, auth.memberId, ids);
            }
          }
          applied.task = (applied.task || 0) + tasks.length;
        } else if (kind === "budget") {
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
      // Bruno's writes are live-synced like the direct API's.
      if (applied.budget) broadcastToTeam(auth.teamId, { type: "budget_changed" });
      if (applied.event || applied["delete-event"]) broadcastToTeam(auth.teamId, { type: "events_changed" });
      if (applied.task) broadcastToTeam(auth.teamId, { type: "tasks_changed" });
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
    // Paginated: newest first. Clients infer hasMore from items.length === limit.
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "30"), 10) || 30, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);
    const chats = (await dbAll(`
      SELECT c.*, m.name AS owner_name,
        (SELECT COUNT(*) FROM bruno_messages WHERE chat_id = c.id) AS message_count
      FROM bruno_chats c
      LEFT JOIN members m ON c.member_id = m.id
      WHERE c.team_id = ? AND (c.member_id = ? OR c.is_public = 1)
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?
    `, auth.teamId, auth.memberId, limit, offset)) as any[];
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
    // Hoisted so the catch block can attribute failed attempts to the caller.
    let auth: Awaited<ReturnType<typeof requireAuth>> = null;
    try {
      auth = await requireAuth(req, res);
      if (!auth) return;
      if (!isGeminiConfigured()) {
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
      // (messages has no created_at column — this count used to fail and read
      // as 0, which the briefing turned into "your channels have gone quiet".)
      const recentMessages = (await dbGet(
        "SELECT COUNT(*) AS c FROM messages WHERE team_id = ? AND timestamp >= ? AND deleted_at IS NULL",
        teamId, new Date(Date.now() - 7 * 86400000).toISOString()
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
      // Active members only (removed members' rows are kept for history).
      const memberCount = ((await dbGet("SELECT COUNT(*) AS c FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", teamId)) as any)?.c || 0;
      const openTaskTotal = ((await dbGet("SELECT COUNT(*) AS c FROM tasks WHERE team_id = ? AND status != 'done'", teamId)) as any)?.c || 0;
      const tz = await teamTimeZone(teamId, req.body?.tz);
      const facts = await workspaceFactsBlock({ dbGet, dbAll }, teamId, tz);
      const today = new Date().toISOString().slice(0, 10);
      const prompt = buildCoachPrompt({
        facts,
        openTaskTotal,
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
        res.setHeader("X-Accel-Buffering", "no"); // stream through nginx unbuffered
        res.setHeader("Cache-Control", "no-cache");
        try {
          const streamedSummary = await aiStream(COACH_SYSTEM, prompt, maxTokens, (chunk) => res.write(chunk));
          logAiUsage(auth.memberId, auth.teamId, null, String(prompt || "").length, String(streamedSummary || "").length, "ok", "gemini", "activity-summary");
          res.end();
        } catch (err) {
          console.error("AI summary stream error:", err);
          logAiUsage(auth.memberId, auth.teamId, null, 0, 0, isQuotaError(err) ? "quota" : "error", "gemini", "activity-summary");
          res.end(isQuotaError(err) ? `\n\n(${QUOTA_EXHAUSTED_MSG})` : "\n\n(Failed to finish the summary.)");
        }
        return;
      }
      const result = await aiGenerate(COACH_SYSTEM, prompt, maxTokens);
      logAiUsage(auth.memberId, auth.teamId, null, String(prompt || "").length, String(result || "").length, "ok", "gemini", "activity-summary");
      res.json({ result });
    } catch (error) {
      console.error("AI summary error:", error);
      if (auth) logAiUsage(auth.memberId, auth.teamId, null, 0, 0, isQuotaError(error) ? "quota" : "error", "gemini", "activity-summary");
      if (isQuotaError(error)) {
        res.status(429).json({ error: "AI quota exhausted", result: QUOTA_EXHAUSTED_MSG });
      } else {
        res.status(502).json({ error: "AI request failed", result: "Failed to generate summary." });
      }
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
      const { recipient, subject, body, date, type, parent_id, direction } = req.body;
      // Replies must attach to an entry in the same team. Threads are one level
      // deep: a reply-to-a-reply is resolved to the thread root so it always
      // appears in the thread instead of becoming invisible.
      let parentId: number | null = null;
      if (parent_id != null) {
        const parent: any = (await dbGet("SELECT id, team_id, parent_id FROM communications WHERE id = ?", parent_id));
        if (!parent || parent.team_id !== auth.teamId) return res.status(400).json({ error: "Invalid parent entry" });
        parentId = parent.parent_id != null ? parent.parent_id : parent.id;
      }
      const missingComm = communicationError(req.body || {}, parentId != null);
      if (missingComm) return res.status(400).json({ error: missingComm });
      const dir = direction === 'inbound' ? 'inbound' : 'outbound';
      const info = (await dbRun("INSERT INTO communications (recipient, subject, body, date, type, team_id, parent_id, direction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", recipient ?? '', subject ?? '', body ?? '', date || new Date().toISOString().slice(0, 16).replace('T', ' '), type || 'email', auth.teamId, parentId, dir));
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating communication:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/communications/:id", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_communications");
      if (!auth) return;
      const existing: any = (await dbGet("SELECT team_id, parent_id FROM communications WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      const { recipient, subject, body, date, type, direction } = req.body || {};
      const missingComm = communicationError(req.body || {}, existing.parent_id != null);
      if (missingComm) return res.status(400).json({ error: missingComm });
      const dir = direction === 'inbound' ? 'inbound' : 'outbound';
      await dbRun(
        "UPDATE communications SET recipient = ?, subject = ?, body = ?, date = ?, type = ?, direction = ? WHERE id = ? AND team_id = ?",
        recipient ?? '', subject ?? '', body ?? '', date ?? '', type || 'email', dir, req.params.id, auth.teamId
      );
      res.json({ ok: true });
    } catch (error) {
      console.error("Error updating communication:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/communications/:id", async (req, res) => {
    try {
      const auth = await requirePerm(req, res, "manage_communications");
      if (!auth) return;
      const existing: any = (await dbGet("SELECT team_id FROM communications WHERE id = ?", req.params.id));
      if (!existing || existing.team_id !== auth.teamId) return res.status(404).json({ error: "Not found" });
      // Delete the entry and every descendant in ONE statement (recursive CTE)
      // so a reply saved concurrently cannot slip between a read and the
      // delete and survive as an orphaned thread.
      (await dbRun(
        `WITH RECURSIVE descendants(id) AS (
           SELECT id FROM communications WHERE id = ? AND team_id = ?
           UNION
           SELECT c.id FROM communications c
           JOIN descendants d ON c.parent_id = d.id
           WHERE c.team_id = ?
         )
         DELETE FROM communications WHERE id IN (SELECT id FROM descendants)`,
        req.params.id, auth.teamId, auth.teamId
      ));
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

      // Paginated newest-first history; clients infer hasMore from items.length === limit.
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 200);
      const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);
      const commits = (await dbAll(`
        SELECT cc.*, m.name as author_name 
        FROM code_commits cc
        LEFT JOIN members m ON cc.author_id = m.id
        WHERE cc.file_id = ? AND cc.branch = ?
        ORDER BY cc.created_at DESC
        LIMIT ? OFFSET ?
      `, fileId, branch, limit, offset));

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
  const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || "").trim();
  const GITHUB_TREE_CAP = 5000;
  const GITHUB_FILE_BYTES_CAP = 100 * 1024;

  async function githubFetch(url: string): Promise<Response> {
    const headers: Record<string, string> = { "User-Agent": GITHUB_UA, "Accept": "application/vnd.github+json" };
    // Optional GITHUB_TOKEN (classic PAT, no scopes needed for public repos)
    // raises the API limit from 60/hr (shared IP) to 5,000/hr.
    if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
    const res = await fetch(url, { headers });
    if (res.status === 403 || res.status === 429) {
      if (!GITHUB_TOKEN) console.warn("[github] rate limited without GITHUB_TOKEN set — add it to raise the limit");
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

  // Compact snapshot of everything the team has done in Control Point, so
  // Bruno actually knows the workspace: tasks, outreach, linked accounts.
  // Best-effort and capped — context is informative, never blocks the reply.
  /** The team's timezone: its saved setting, else the caller's browser zone, else New York. */
  async function teamTimeZone(teamId: number | null, clientTz?: unknown): Promise<string> {
    let saved: string | null = null;
    if (teamId) {
      try { saved = ((await dbGet("SELECT timezone FROM teams WHERE id = ?", teamId)) as any)?.timezone || null; } catch { /* column missing pre-migration */ }
    }
    return resolveTimeZone(saved, clientTz);
  }

  async function buildTeamSnapshotContext(teamId: number | null): Promise<string> {
    if (!teamId) return "";
    try {
      // Team counts, open tasks and the calendar are in WORKSPACE FACTS.
      // Everything below is member-written, so it is quoted (data, not instructions).
      const q = quoteUntrusted;
      const parts: string[] = [];
      const team = (await dbGet("SELECT name, number FROM teams WHERE id = ?", teamId)) as any;
      if (team) parts.push(`TEAM: ${q(team.name, 80)}${team.number ? ` (#${q(String(team.number), 20)})` : ""}`);
      const done = (await dbAll(
        `SELECT t.id, t.title, t.completed_at, m.name AS completer
         FROM tasks t LEFT JOIN members m ON m.id = t.completed_by
         WHERE t.team_id = ? AND t.status = 'done'
         ORDER BY t.completed_at DESC LIMIT 5`,
        teamId
      )) as any[];
      if (done.length) {
        const lines = done.map((t) => `#${t.id} ${q(t.title, 120)}${t.completer ? ` — done by ${q(t.completer, 40)}` : ""}${t.completed_at ? ` (${String(t.completed_at).slice(0, 10)})` : ""}`);
        parts.push(`RECENTLY COMPLETED TASKS:\n${lines.join("\n")}`);
      }

      const outreach = (await dbAll(
        "SELECT title, date, hours, location FROM outreach WHERE team_id = ? ORDER BY date DESC LIMIT 5",
        teamId
      )) as any[];
      if (outreach.length) {
        const lines = outreach.map((o) => `${q(o.title, 120)} — ${o.date}${o.hours ? `, ${o.hours}h` : ""}${o.location ? ` @ ${q(o.location, 80)}` : ""}`);
        parts.push(`RECENT OUTREACH:\n${lines.join("\n")}`);
      }

      const links: string[] = [];
      const socials = (await dbAll(
        "SELECT platform, display_name, handle, url FROM social_profiles WHERE team_id = ? ORDER BY sort_order ASC LIMIT 6",
        teamId
      )) as any[];
      for (const s of socials) {
        const label = s.display_name || s.handle || s.platform;
        links.push(`${s.platform}: ${q(label, 60)}${s.url ? ` (${q(s.url, 200)})` : ""}`);
      }
      const repo = (await dbGet("SELECT owner, repo, branch FROM code_repos WHERE team_id = ?", teamId)) as any;
      if (repo) links.push(`GitHub: ${q(`${repo.owner}/${repo.repo}`, 120)} (branch ${q(repo.branch, 60)})`);
      const docsCount = (await dbGet("SELECT COUNT(*) AS n FROM cad_docs WHERE team_id = ?", teamId)) as any;
      if (docsCount?.n) links.push(`Onshape: ${docsCount.n} doc(s) linked`);
      if (links.length) parts.push(`LINKED ACCOUNTS:\n${links.join("\n")}`);

      // FTC competition data so Bruno can answer "who should we pick for
      // alliances?" and similar strategy questions. Best-effort; never blocks.
      // Uses the data-source layer: FIRST Events primary, FTC Scout fallback.
      // The optional sections above are capped as a group; FTC stats are
      // appended after the cap so a long outreach list can never cut them off.
      let snap = parts.join("\n\n");
      if (snap.length > 2500) snap = snap.slice(0, 2500) + "\n…(more omitted)";
      try {
        const ftcRow = (await dbGet("SELECT ftc_team_number FROM teams WHERE id = ?", teamId)) as any;
        const ftcNum = parseInt(ftcRow?.ftc_team_number, 10);
        if (Number.isFinite(ftcNum) && ftcNum > 0) {
          const season = currentFtcSeason();
          const payload = await getTeamData(ftcNum, season).catch(() => null);
          if (payload?.data) {
            const d = payload.data;
            const opr = d.opr || {};
            const fmt = (s: any) => s?.value != null ? `${s.value}${s.rank ? ` (#${s.rank})` : ''}` : 'n/a';
            const evts = (d.events || []).slice(0, 5).map((e: any) =>
              `${e.name} (${e.date || '?'})${e.code ? ` [code: ${e.code}]` : ''}${e.rank ? ` — quals #${e.rank}` : ''}${e.wins != null ? ` ${e.wins}-${e.losses}-${e.ties}` : ''}${e.awards?.length ? ` [${e.awards.join(', ')}]` : ''}`
            );
            const srcLabel = payload.source === 'first-events' ? 'FIRST Events' : payload.source === 'ftc-scout' ? 'FTC Scout' : 'cache';
            const ftcSite = siteOf(payload.source, (payload as any).origin);
            const ftcLinks = citeTeam(ftcSite, season, Number(d.number) || ftcNum, opr.tot?.value != null);
            snap += `\n\nFTC STATS (team #${d.number}, ${season} season, via ${srcLabel}, fetched ${payload.fetchedAt.slice(0, 10)}):\nOPR total ${fmt(opr.tot)} | auto ${fmt(opr.auto)} | teleop ${fmt(opr.dc)} | endgame ${fmt(opr.eg)}${d.oprSource ? ` (OPR via ${d.oprSource === 'ftc-scout' ? 'FTC Scout' : d.oprSource})` : ''}\nRecent events:\n${evts.join('\n') || '(none)'}\nSource links (cite inline as markdown when you use these numbers; never invent a link): ${ftcLinks}`;
          }
        }
      } catch { /* FTC context is best-effort */ }
      return snap;
    } catch (err) {
      console.error("[bruno] team snapshot context query failed:", err);
      return "";
    }
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
      // Verify the write persisted — if not, surface it instead of fake success.
      const verify: any = await dbGet("SELECT id FROM code_repos WHERE team_id = ?", auth.teamId);
      if (!verify) {
        console.error("code_repos write verification failed for team", auth.teamId);
        return res.status(500).json({ error: "Could not save the repo link — please try again" });
      }
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

  // CAD: convert multer fileFilter/size errors into JSON instead of
  // Express's default HTML error page.
  const cadUploadJson = (mw: any) => (req: any, res: any, next: any) =>
    mw(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      next();
    });

  // ================= CAD =================
  // Every route binds auth.teamId; cross-team access is rejected.
  const cadTeam = (auth: any, res: any) => {
    if (!auth.teamId) { res.status(400).json({ error: "Join a team first" }); return null; }
    return auth.teamId as number;
  };

  // ---- Onshape docs ----
  app.get("/api/cad/docs", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const docs = await dbAll("SELECT * FROM cad_docs WHERE team_id = ? ORDER BY created_at DESC", teamId);
      res.json(docs);
    } catch (e) { console.error("CAD docs list error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/cad/docs", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const name = String(req.body?.name ?? "").trim().slice(0, 160);
      const url = String(req.body?.url ?? "").trim().slice(0, 500);
      if (!name) return res.status(400).json({ error: "Document name is required" });
      if (!isValidHttpUrl(url)) return res.status(400).json({ error: "Enter a valid http(s) URL" });
      const now = new Date().toISOString();
      const r = await dbRun("INSERT INTO cad_docs (team_id, name, url, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
        teamId, name, url, auth.memberId, now);
      res.json({ id: r.lastInsertRowid, name, url });
    } catch (e) { console.error("CAD doc create error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.delete("/api/cad/docs/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const doc = (await dbGet("SELECT id, created_by FROM cad_docs WHERE id = ? AND team_id = ?", id, teamId)) as any;
      if (!doc) return res.status(404).json({ error: "Not found" });
      const isAdmin = await hasPerm(auth, "manage_members");
      if (doc.created_by !== auth.memberId && !isAdmin) return res.status(403).json({ error: "You don't have permission for that" });
      await dbRun("DELETE FROM cad_docs WHERE id = ?", id);
      res.json({ success: true });
    } catch (e) { console.error("CAD doc delete error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  // ---- Design reviews ----
  app.get("/api/cad/reviews", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const reviews = await dbAll(`
        SELECT r.*, m.name AS author_name,
          (SELECT COUNT(*) FROM cad_review_comments c WHERE c.review_id = r.id) AS comment_count
        FROM cad_reviews r LEFT JOIN members m ON m.id = r.created_by
        WHERE r.team_id = ? ORDER BY r.updated_at DESC`, teamId);
      res.json(reviews);
    } catch (e) { console.error("CAD reviews list error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/cad/reviews", cadUploadJson(cadUpload.single("screenshot")), async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const title = String(req.body?.title ?? "").trim().slice(0, 160);
      if (!title) return res.status(400).json({ error: "Title is required" });
      const section = normalizeSection(req.body?.section);
      const onshape_url = String(req.body?.onshape_url ?? "").trim().slice(0, 500);
      if (onshape_url && !isValidHttpUrl(onshape_url)) return res.status(400).json({ error: "Onshape link must be a valid http(s) URL" });
      const description = String(req.body?.description ?? "").trim().slice(0, 4000);
      // Review screenshots are persisted in the database (disk is ephemeral).
      let screenshot_url: string | null = null;
      const shotFile = (req as any).file;
      if (shotFile?.buffer?.length) {
        const fid = await storeFile({
          teamId, memberId: auth.memberId, kind: "cad",
          filename: shotFile.originalname, mimeType: shotFile.mimetype, buffer: shotFile.buffer,
        });
        screenshot_url = fileUrl(fid);
      }
      const now = new Date().toISOString();
      const r = await dbRun(
        `INSERT INTO cad_reviews (team_id, title, section, onshape_url, screenshot_url, description, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'concept', ?, ?, ?)`,
        teamId, title, section, onshape_url || null, screenshot_url, description, auth.memberId, now, now);
      res.json({ id: r.lastInsertRowid });
    } catch (e) { console.error("CAD review create error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.patch("/api/cad/reviews/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const review = (await dbGet("SELECT * FROM cad_reviews WHERE id = ? AND team_id = ?", id, teamId)) as any;
      if (!review) return res.status(404).json({ error: "Not found" });
      const to = req.body?.status;
      if (!isValidReviewStatus(to)) return res.status(400).json({ error: "Invalid status" });
      const isAdmin = await hasPerm(auth, "manage_members");
      const isAuthor = review.created_by === auth.memberId;
      if (!canTransitionReviewStatus({ from: review.status, to, isAdmin, isAuthor })) {
        return res.status(403).json({ error: "That status change isn't allowed" });
      }
      const now = new Date().toISOString();
      await dbRun("UPDATE cad_reviews SET status = ?, updated_at = ? WHERE id = ?", to, now, id);
      res.json({ success: true, status: to });
    } catch (e) { console.error("CAD review status error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.delete("/api/cad/reviews/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const review = (await dbGet("SELECT id, created_by FROM cad_reviews WHERE id = ? AND team_id = ?", id, teamId)) as any;
      if (!review) return res.status(404).json({ error: "Not found" });
      const isAdmin = await hasPerm(auth, "manage_members");
      if (review.created_by !== auth.memberId && !isAdmin) return res.status(403).json({ error: "You don't have permission for that" });
      await dbRun("DELETE FROM cad_review_comments WHERE review_id = ?", id);
      await dbRun("DELETE FROM cad_reviews WHERE id = ?", id);
      res.json({ success: true });
    } catch (e) { console.error("CAD review delete error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.get("/api/cad/reviews/:id/comments", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const review = (await dbGet("SELECT id FROM cad_reviews WHERE id = ? AND team_id = ?", id, teamId)) as any;
      if (!review) return res.status(404).json({ error: "Not found" });
      const comments = await dbAll(`
        SELECT c.*, m.name AS author_name FROM cad_review_comments c
        LEFT JOIN members m ON m.id = c.author_id
        WHERE c.review_id = ? AND c.team_id = ? ORDER BY c.created_at ASC`, id, teamId);
      res.json(comments);
    } catch (e) { console.error("CAD comments list error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/cad/reviews/:id/comments", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const review = (await dbGet("SELECT id FROM cad_reviews WHERE id = ? AND team_id = ?", id, teamId)) as any;
      if (!review) return res.status(404).json({ error: "Not found" });
      const comment = String(req.body?.comment ?? "").trim().slice(0, 2000);
      if (!comment) return res.status(400).json({ error: "Comment is required" });
      const now = new Date().toISOString();
      const r = await dbRun("INSERT INTO cad_review_comments (review_id, team_id, author_id, comment, created_at) VALUES (?, ?, ?, ?, ?)",
        id, teamId, auth.memberId, comment, now);
      res.json({ id: r.lastInsertRowid });
    } catch (e) { console.error("CAD comment create error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  // ---- Snapshots ----
  app.get("/api/cad/snapshots", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const snaps = await dbAll(`
        SELECT s.*, m.name AS author_name FROM cad_snapshots s
        LEFT JOIN members m ON m.id = s.created_by
        WHERE s.team_id = ? ORDER BY s.created_at DESC`, teamId);
      res.json(snaps);
    } catch (e) { console.error("CAD snapshots list error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/cad/snapshots", cadUploadJson(cadUpload.fields([{ name: "model", maxCount: 1 }, { name: "screenshot", maxCount: 1 }])), async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const files = (req as any).files || {};
      const model = files.model?.[0];
      if (!model) return res.status(400).json({ error: "A 3D model file is required" });
      const file_type = detectModelType(model.originalname);
      if (!file_type) return res.status(400).json({ error: "Model must be .step/.stp or .stl" });
      const title = String(req.body?.title ?? "").trim().slice(0, 160) || model.originalname;
      const section = normalizeSection(req.body?.section);
      const notes = String(req.body?.notes ?? "").trim().slice(0, 4000);
      const screenshot = files.screenshot?.[0];
      const now = new Date().toISOString();
      // Model + screenshot are persisted in the database (disk is ephemeral).
      const modelId = await storeFile({
        teamId, memberId: auth.memberId, kind: "cad",
        filename: model.originalname, mimeType: model.mimetype, buffer: model.buffer,
      });
      let screenshotId: number | null = null;
      if (screenshot?.buffer?.length) {
        screenshotId = await storeFile({
          teamId, memberId: auth.memberId, kind: "cad",
          filename: screenshot.originalname, mimeType: screenshot.mimetype, buffer: screenshot.buffer,
        });
      }
      const r = await dbRun(
        `INSERT INTO cad_snapshots (team_id, title, section, file_url, file_name, file_size, file_type, screenshot_url, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        teamId, title, section, fileUrl(modelId), model.originalname, model.size, file_type,
        screenshotId ? fileUrl(screenshotId) : null, notes, auth.memberId, now);
      res.json({ id: r.lastInsertRowid });
    } catch (e) { console.error("CAD snapshot upload error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.delete("/api/cad/snapshots/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const snap = (await dbGet("SELECT * FROM cad_snapshots WHERE id = ? AND team_id = ?", id, teamId)) as any;
      if (!snap) return res.status(404).json({ error: "Not found" });
      const isAdmin = await hasPerm(auth, "manage_members");
      if (snap.created_by !== auth.memberId && !isAdmin) return res.status(403).json({ error: "You don't have permission for that" });
      await dbRun("DELETE FROM cad_snapshots WHERE id = ?", id);
      for (const u of [snap.file_url, snap.screenshot_url]) {
        await deleteStoredFileByUrl(u);
      }
      res.json({ success: true });
    } catch (e) { console.error("CAD snapshot delete error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  // ---- Parts / BOM ----
  app.get("/api/cad/parts", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const parts = await dbAll("SELECT * FROM cad_parts WHERE team_id = ? ORDER BY section, name", teamId);
      res.json(parts);
    } catch (e) { console.error("CAD parts list error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/cad/parts", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const parsed = sanitizePartInput(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const v = parsed.value!;
      const now = new Date().toISOString();
      const r = await dbRun(
        `INSERT INTO cad_parts (team_id, name, section, quantity, source, unit_cost, status, assignee, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        teamId, v.name, v.section, v.quantity, v.source, v.unit_cost, v.status, v.assignee, v.notes, auth.memberId, now, now);
      res.json({ id: r.lastInsertRowid });
    } catch (e) { console.error("CAD part create error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.patch("/api/cad/parts/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const part = (await dbGet("SELECT * FROM cad_parts WHERE id = ? AND team_id = ?", id, teamId)) as any;
      if (!part) return res.status(404).json({ error: "Not found" });
      // Partial update: validate the merged line, but write only the columns
      // that were sent (bulk status changes send just { status }), so two
      // overlapping edits to different fields can't undo each other.
      const body = req.body || {};
      const parsed = sanitizePartInput({ ...part, ...body });
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const v = parsed.value! as Record<string, any>;
      const cols = ["name", "section", "quantity", "source", "unit_cost", "status", "assignee", "notes"].filter((k) => body[k] !== undefined);
      if (!cols.length) return res.status(400).json({ error: "Nothing to update" });
      await dbRun(
        `UPDATE cad_parts SET ${cols.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
        ...cols.map((k) => v[k]), new Date().toISOString(), id);
      res.json({ success: true });
    } catch (e) { console.error("CAD part update error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  app.delete("/api/cad/parts/:id", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const part = (await dbGet("SELECT id FROM cad_parts WHERE id = ? AND team_id = ?", id, teamId)) as any;
      if (!part) return res.status(404).json({ error: "Not found" });
      await dbRun("DELETE FROM cad_parts WHERE id = ?", id);
      res.json({ success: true });
    } catch (e) { console.error("CAD part delete error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  // ---- Dashboard aggregates ----
  app.get("/api/cad/dashboard", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teamId = cadTeam(auth, res); if (!teamId) return;
      const docsCount = (await dbGet("SELECT COUNT(*) AS n FROM cad_docs WHERE team_id = ?", teamId) as any).n;
      const pendingReviews = (await dbGet("SELECT COUNT(*) AS n FROM cad_reviews WHERE team_id = ? AND status = 'in_review'", teamId) as any).n;
      const snapshotsCount = (await dbGet("SELECT COUNT(*) AS n FROM cad_snapshots WHERE team_id = ?", teamId) as any).n;
      const partsAgg = (await dbGet("SELECT COUNT(*) AS n, COALESCE(SUM(quantity * unit_cost), 0) AS total FROM cad_parts WHERE team_id = ?", teamId)) as any;
      const needsAttention = await dbAll(`
        SELECT r.id, r.title, r.section, r.updated_at, m.name AS author_name
        FROM cad_reviews r LEFT JOIN members m ON m.id = r.created_by
        WHERE r.team_id = ? AND r.status = 'in_review' ORDER BY r.updated_at ASC LIMIT 5`, teamId);
      const recent = await dbAll(`
        SELECT 'review' AS kind, id, title, section, status AS detail, updated_at AS ts FROM cad_reviews WHERE team_id = ?
        UNION ALL
        SELECT 'snapshot' AS kind, id, title, section, file_type AS detail, created_at AS ts FROM cad_snapshots WHERE team_id = ?
        UNION ALL
        SELECT 'part' AS kind, id, name AS title, section, status AS detail, updated_at AS ts FROM cad_parts WHERE team_id = ?
        UNION ALL
        SELECT 'doc' AS kind, id, name AS title, '' AS section, url AS detail, created_at AS ts FROM cad_docs WHERE team_id = ?
        ORDER BY ts DESC LIMIT 10`, teamId, teamId, teamId, teamId);
      res.json({
        docsCount, pendingReviews, snapshotsCount,
        partsCount: partsAgg.n, partsTotalCost: Math.round(partsAgg.total * 100) / 100,
        needsAttention, recent,
        sections: CAD_SECTIONS, reviewStatuses: REVIEW_STATUSES,
        reviewStatusLabels: REVIEW_STATUS_LABELS, partSources: PART_SOURCES,
        partStatuses: PART_STATUSES, partSourceLabels: PART_SOURCE_LABELS, partStatusLabels: PART_STATUS_LABELS,
      });
    } catch (e) { console.error("CAD dashboard error:", e); res.status(500).json({ error: "Internal server error" }); }
  });

  // Unknown API routes: JSON 404 (not the SPA html) so clients can tell
  // a missing endpoint apart from a page load.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // "How Control Point Predict Works": a standalone article, linked from
  // Predict's "How accurate is this?" sheet.
  // One fixed file, no route params. Registered before the SPA fallback.
  // It has its own CSP (inline script pinned by hash, Google Fonts), sent
  // in the same mode as the app's (enforced when CSP_ENFORCE=1).
  const predictArticle = path.join(__dirname, "server", "predict", "how-it-works.html");
  let predictArticleCsp: string | undefined;
  try {
    predictArticleCsp = buildArticleCsp({
      scriptHashes: inlineScriptHashes(fs.readFileSync(predictArticle, "utf8")),
      reportUri: "/api/csp-report",
    });
  } catch (e) {
    console.error("[predict article] could not read the page:", e);
  }
  // Exact path only (Express would otherwise also match other letter cases
  // and a trailing slash); anything else falls through to the app.
  app.get(/^\/predict\/how-it-works$/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    if (predictArticleCsp) {
      res.setHeader(process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", predictArticleCsp);
    }
    res.type("html");
    res.sendFile(predictArticle, (err) => {
      if (err && !res.headersSent) res.status(404).type("text").send("Not found");
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Pre-compressed assets + long-lived caching for hashed files.
    // CSP: hash the inline script(s) of the built page once at startup.
    // Report-only unless CSP_ENFORCE=1 (flip once the reports are clean).
    const distIndex = path.join(__dirname, "dist", "index.html");
    let csp: { header: string; value: string } | undefined;
    try {
      const html = fs.readFileSync(distIndex, "utf8");
      csp = {
        header: process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
        value: buildCsp({ scriptHashes: inlineScriptHashes(html), reportUri: "/api/csp-report" }),
      };
    } catch (e) {
      console.error("[csp] could not read dist/index.html — no CSP header:", e);
    }
    serveDist(app, path.join(__dirname, "dist"), { csp });
  }

  // Centralized error handler (reached via express-async-errors for async
  // throws, or next(err)). Always JSON; never leaks stacks to clients.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: any, res: any, _next: any) => {
    const status = typeof err?.status === "number" ? err.status : 500;
    console.error(`[API error] ${status}:`, err?.message || err);
    if (res.headersSent) return;
    res.status(status).json({
      error: status >= 500 ? "Internal server error" : (err?.message || "Request failed"),
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (process.env.NODE_ENV === "production" && !isEmailConfigured()) {
      console.error("[email] RESEND_API_KEY is not set: signup codes will NOT be emailed (they are only logged here). Nobody new can verify.");
    }
  });

  // One-time boot cleanup: remove duplicate voice channels for every team.
  dedupeVoiceChannels(voiceDeps).catch((e) => console.warn('[voice] boot dedupe failed:', e?.message));

  // Boot backfill: ensure every team has the default role set
  // (Admin, Member, Verified Member) — creates any that are missing.
  (async () => {
    try {
      const teams = (await dbAll("SELECT id FROM teams")) as any[];
      for (const t of teams) {
        try { await ensureRolesSeeded(t.id); } catch { /* per-team errors shouldn't block boot */ }
      }
    } catch (e) {
      console.warn('[roles] boot backfill failed:', (e as any)?.message);
    }
  })();

  // One-time force logout: clear all sessions so everyone signs in fresh.
  // This triggers the OAuth avatar migration for each user on their next login.
  (async () => {
    try {
      const done = (await dbGet("SELECT value FROM settings WHERE key = 'force_logout_v1'")) as any;
      if (!done) {
        const r = await dbRun("DELETE FROM sessions");
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('force_logout_v1', '1')");
        console.log(`[auth] force logout: cleared ${r.changes} sessions — all users must sign in again`);
      }
    } catch (e) {
      console.warn('[auth] force logout failed:', (e as any)?.message);
    }
  })();

  // Boot backfill: migrate external avatar URLs to local storage. Broken
  // (expired) ones get cleared so they fall back to initials instead of
  // showing broken images.
  (async () => {
    try {
      const rows = (await dbAll(
        "SELECT id, avatar_url FROM members WHERE avatar_url LIKE 'http%' AND COALESCE(is_active, 1) = 1"
      )) as any[];
      for (const r of rows) {
        try {
          const resp = await fetch(r.avatar_url, { signal: AbortSignal.timeout(8000) });
          const buf = Buffer.from(await resp.arrayBuffer());
          const ctype = resp.headers.get('content-type') || '';
          if (resp.ok && buf.length > 0 && buf.length < 2 * 1024 * 1024 && ctype.startsWith('image/')) {
            const fid = await storeFile({
              teamId: null, memberId: r.id, kind: 'avatar',
              filename: 'oauth-avatar', mimeType: ctype.split(';')[0], buffer: buf,
            });
            await dbRun("UPDATE members SET avatar_url = ? WHERE id = ?", fileUrl(fid), r.id);
            console.log(`[avatar-backfill] migrated avatar for member ${r.id}`);
          } else if (resp.status === 404 || resp.status === 410) {
            // URL is dead — clear it so the UI falls back to initials.
            await dbRun("UPDATE members SET avatar_url = NULL WHERE id = ?", r.id);
            console.log(`[avatar-backfill] cleared dead avatar for member ${r.id}`);
          }
        } catch { /* network error — leave it for next boot */ }
      }
    } catch (e) {
      console.warn('[avatar-backfill] failed:', (e as any)?.message);
    }
  })();
}

startServer();
