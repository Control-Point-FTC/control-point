// Centralized API response/error types.

import type { ApiError } from '../services/api';

/** Result wrapper for call sites that want data-or-error without throwing. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

/** Pagination envelope used by paginated list endpoints. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Query params accepted by paginated list endpoints. */
export interface PageQuery {
  limit?: number;
  offset?: number;
}
