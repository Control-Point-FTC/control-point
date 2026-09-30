// CAD section helpers for Control Point.
// Pure module (no server imports) so validation / transition logic is unit
// testable without booting the server. server.ts registers the /api/cad/*
// routes and binds auth.teamId on every query.

export const CAD_DDL = `
  CREATE TABLE IF NOT EXISTS cad_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES members(id)
  );
  CREATE TABLE IF NOT EXISTS cad_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'Other',
    onshape_url TEXT,
    screenshot_url TEXT,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'concept',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES members(id)
  );
  CREATE TABLE IF NOT EXISTS cad_review_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    author_id INTEGER,
    comment TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(review_id) REFERENCES cad_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY(author_id) REFERENCES members(id)
  );
  CREATE TABLE IF NOT EXISTS cad_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'Other',
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    file_type TEXT NOT NULL,
    screenshot_url TEXT,
    notes TEXT DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES members(id)
  );
  CREATE TABLE IF NOT EXISTS cad_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'Other',
    quantity INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'purchased',
    unit_cost REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'to_order',
    assignee TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES members(id)
  );
  CREATE INDEX IF NOT EXISTS idx_cad_docs_team ON cad_docs(team_id);
  CREATE INDEX IF NOT EXISTS idx_cad_reviews_team ON cad_reviews(team_id);
  CREATE INDEX IF NOT EXISTS idx_cad_review_comments_review ON cad_review_comments(review_id);
  CREATE INDEX IF NOT EXISTS idx_cad_snapshots_team ON cad_snapshots(team_id);
  CREATE INDEX IF NOT EXISTS idx_cad_parts_team ON cad_parts(team_id);
`;

export const CAD_SECTIONS = [
  'Intake',
  'Outtake',
  'Drivetrain',
  'Chassis',
  'End Game',
  'Electronics',
  'Other',
] as const;
export type CadSection = (typeof CAD_SECTIONS)[number];

export const REVIEW_STATUSES = [
  'concept',
  'in_review',
  'approved',
  'changes_requested',
  'built',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  concept: 'Concept',
  in_review: 'In Review',
  approved: 'Approved',
  changes_requested: 'Changes Requested',
  built: 'Built',
};

export const PART_SOURCES = ['printed', 'purchased', 'gobilda', 'other'] as const;
export type PartSource = (typeof PART_SOURCES)[number];

export const PART_STATUSES = ['to_order', 'ordered', 'received', 'printed', 'installed'] as const;
export type PartStatus = (typeof PART_STATUSES)[number];

export const PART_SOURCE_LABELS: Record<PartSource, string> = {
  printed: '3D Printed',
  purchased: 'Purchased',
  gobilda: 'goBILDA',
  other: 'Other',
};

export const PART_STATUS_LABELS: Record<PartStatus, string> = {
  to_order: 'To Order',
  ordered: 'Ordered',
  received: 'Received',
  printed: 'Printed',
  installed: 'Installed',
};

export function normalizeSection(input: unknown): CadSection {
  const s = String(input ?? '').trim();
  const hit = CAD_SECTIONS.find((c) => c.toLowerCase() === s.toLowerCase());
  return (hit ?? 'Other') as CadSection;
}

export function isValidReviewStatus(s: unknown): s is ReviewStatus {
  return (REVIEW_STATUSES as readonly string[]).includes(String(s));
}

export function isValidPartSource(s: unknown): s is PartSource {
  return (PART_SOURCES as readonly string[]).includes(String(s));
}

export function isValidPartStatus(s: unknown): s is PartStatus {
  return (PART_STATUSES as readonly string[]).includes(String(s));
}

/** Detect an uploadable 3D model type from a filename. Null = not supported. */
export function detectModelType(filename: unknown): 'step' | 'stl' | null {
  const name = String(filename ?? '').toLowerCase();
  if (name.endsWith('.step') || name.endsWith('.stp')) return 'step';
  if (name.endsWith('.stl')) return 'stl';
  return null;
}

export function isValidHttpUrl(u: unknown): boolean {
  try {
    const url = new URL(String(u));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Whether a review status change is allowed.
 * - The author (or any member) can submit a concept for review and re-submit
 *   after changes were requested.
 * - Only team admins can approve, request changes, or mark built.
 */
export function canTransitionReviewStatus(opts: {
  from: ReviewStatus;
  to: ReviewStatus;
  isAdmin: boolean;
  isAuthor: boolean;
}): boolean {
  const { from, to, isAdmin, isAuthor } = opts;
  if (from === to) return false;
  if (!isValidReviewStatus(from) || !isValidReviewStatus(to)) return false;
  if (isAdmin) {
    // Admins can move anything forward/backward except resurrecting "built"
    // back into the pipeline (built is terminal).
    if (from === 'built') return false;
    return true;
  }
  // Members: submit for review, and re-submit after requested changes.
  if (!isAuthor) return false;
  if (from === 'concept' && to === 'in_review') return true;
  if (from === 'changes_requested' && to === 'in_review') return true;
  return false;
}

/** Clamp/validate a part payload coming from the client. */
export function sanitizePartInput(body: any): {
  ok: boolean;
  error?: string;
  value?: {
    name: string;
    section: CadSection;
    quantity: number;
    source: PartSource;
    unit_cost: number;
    status: PartStatus;
    assignee: string;
    notes: string;
  };
} {
  const name = String(body?.name ?? '').trim();
  if (!name) return { ok: false, error: 'Part name is required' };
  const quantity = Math.max(1, Math.floor(Number(body?.quantity) || 1));
  const unit_cost = Math.max(0, Number(body?.unit_cost) || 0);
  const source = isValidPartSource(body?.source) ? body.source : 'purchased';
  const status = isValidPartStatus(body?.status) ? body.status : 'to_order';
  return {
    ok: true,
    value: {
      name,
      section: normalizeSection(body?.section),
      quantity,
      source,
      unit_cost,
      status,
      assignee: String(body?.assignee ?? '').trim().slice(0, 120),
      notes: String(body?.notes ?? '').trim().slice(0, 2000),
    },
  };
}
