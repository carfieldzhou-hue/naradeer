/**
 * Naradeer analytics client tracker.
 *
 * - Captures a session UUID at first page load and reuses it across reloads
 *   (stored under `naradeer_analytics_session` localStorage key, so a
 *   long-running player keeps their session).
 * - 10s state snapshots into a localStorage buffer (so refreshing the page
 *   mid-session doesn't drop the most recent state).
 * - Batch flushes every 30s + on `pagehide` (using `navigator.sendBeacon`
 *   when available so the unload request actually leaves the browser).
 * - Endpoints: POST /api/track (public, rate-limited at nginx+Flask layer).
 * - `tracker.recordEvent(type, payload?)` is the public API for game code.
 *   `tracker.recordState()` is auto-called from an internal 10s timer based
 *   on what the caller installed via `tracker.bindStateReader(() => state)`.
 */

const LS_SESSION = 'naradeer_analytics_session';
const LS_BUFFER  = 'naradeer_analytics_buffer';
const ENDPOINT   = '/api/track';

const SNAPSHOT_INTERVAL_MS = 10_000;
const FLUSH_INTERVAL_MS    = 30_000;
const MAX_BUFFER_EVENTS    = 200;   // drop oldest above this if backlogged
const MAX_BUFFER_SNAPS     = 60;    // ~10 min of snapshots kept at most

interface Event {
  ts: number;
  type: string;
  payload?: Record<string, unknown>;
}
interface Snapshot {
  ts: number;
  level?: number;
  money?: number;
  crackers?: number;
  deerFed?: number;
  deerRemaining?: number;
  pos?: [number, number] | null;
}
interface DeviceInfo {
  ua: string;
  screen: string;
  viewport: string;
  dpr: number | null;
  lang: string;
  tz: string;
  net: string | null;
}
interface Buffer {
  events: Event[];
  snapshots: Snapshot[];
}

// ---- public types ----
export type EventType =
  | 'game_start'
  | 'level_start'
  | 'level_complete'
  | 'feed'
  | 'dash'
  | 'buy'
  | 'share'
  | 'crack_pool'
  | 'exit';

export interface SessionSummary {
  highestLevel?: number;
  totalDeerFed?: number;
  totalMoneyEarned?: number;
  totalMoneySpent?: number;
  totalShares?: number;
  titlesUnlocked?: string[];
  completed?: boolean;
  exitReason?: string;
}

export interface TrackerApi {
  recordEvent(type: EventType, payload?: Record<string, unknown>): void;
  /** Replace the state reader. Tracker polls it every SNAPSHOT_INTERVAL_MS. */
  bindStateReader(reader: () => Omit<Snapshot, 'ts'> | null): void;
  /** Persist + send on next flush. Merge (highest wins for numerics, union for arrays). */
  setSummary(partial: SessionSummary): void;
  /** Schedule flush (debounced). */
  flush(): Promise<void>;
  /** Mark session ended (calls flush, sets exitReason). */
  endSession(reason: string): void;
  /** Expose for testing / debug. */
  _sessionId: string;
}

// ---- helpers ----

const LS_SUMMARY = 'naradeer_analytics_summary';

function loadSummary(): SessionSummary {
  try {
    const raw = localStorage.getItem(LS_SUMMARY);
    if (raw) return JSON.parse(raw) || {};
  } catch {
    /* ignore */
  }
  return {};
}

function saveSummary(s: SessionSummary): void {
  try {
    localStorage.setItem(LS_SUMMARY, JSON.stringify(s));
  } catch {
    /* quota — drop silently */
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  // Fallback — sufficient for an internal tracker (not cryptographic).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function detectDevice(): DeviceInfo {
  const conn: any =
    (navigator as any).connection || (navigator as any).mozConnection || null;
  return {
    ua: navigator.userAgent.slice(0, 256),
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio ?? null,
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    net: conn?.effectiveType ?? null,
  };
}

function loadSession(): { id: string; startAt: number } {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.id === 'string' && typeof s.startAt === 'number' && s.id.length > 0) {
        // If session is older than 8 hours, start a new one (caps payload size
        // and lets us count re-visits as fresh sessions).
        const ageMs = Date.now() - s.startAt;
        if (ageMs < 8 * 3600_000) return s;
      }
    }
  } catch {
    /* ignore */
  }
  const fresh = { id: uuid(), startAt: Date.now() };
  try {
    localStorage.setItem(LS_SESSION, JSON.stringify(fresh));
  } catch {
    /* quota etc — silent */
  }
  return fresh;
}

function loadBuffer(): Buffer {
  try {
    const raw = localStorage.getItem(LS_BUFFER);
    if (raw) {
      const b = JSON.parse(raw);
      if (b && Array.isArray(b.events) && Array.isArray(b.snapshots)) return b;
    }
  } catch {
    /* ignore */
  }
  return { events: [], snapshots: [] };
}

function saveBuffer(b: Buffer): void {
  try {
    localStorage.setItem(LS_BUFFER, JSON.stringify(b));
  } catch {
    /* quota — drop silently */
  }
}

// ---- implementation ----

class TrackerImpl implements TrackerApi {
  private buffer: Buffer = loadBuffer();
  private session = loadSession();
  private summary: SessionSummary = loadSummary();
  private device = detectDevice();
  private stateReader: (() => Omit<Snapshot, 'ts'> | null) | null = null;
  private _snapTimer: number | null = null;
  private _flushTimer: number | null = null;
  private flushing = false;
  private exitReason: string | null = null;

  get _sessionId(): string {
    return this.session.id;
  }

  start(): void {
    // Periodic snapshot. Stored on `this` so a future reset() can clear them;
    // not currently read because we leave the timers running for the page's
    // lifetime.
    // denylist-unused: private fields intentionally kept for future use.
    this._snapTimer = window.setInterval(() => this.tickSnap(), SNAPSHOT_INTERVAL_MS);
    this._flushTimer = window.setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);

    // Best-effort flush on page exit. `pagehide` is the most reliable across
    // browsers; `sendBeacon` ensures the request goes out even after the
    // document is gone.
    const unload = () => this.endSession('pagehide');
    window.addEventListener('pagehide', unload);
    window.addEventListener('beforeunload', unload);
    // Visibility change — flush when tab goes hidden for >30s
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flush();
    });

    // Take an immediate snapshot so the first record has a frame of reference
    // even if the user bails in < 10s.
    this.tickSnap();
  }

  endSession(reason: string): void {
    if (!this.exitReason) this.exitReason = reason;
    // Final flush (best-effort).
    void this.flush();
  }

  /** Optional — call when the singleton is being torn down (HMR / tests). */
  dispose(): void {
    if (this._snapTimer != null) window.clearInterval(this._snapTimer);
    if (this._flushTimer != null) window.clearInterval(this._flushTimer);
    this._snapTimer = null;
    this._flushTimer = null;
    void this.flush();
  }

  bindStateReader(reader: () => Omit<Snapshot, 'ts'> | null): void {
    this.stateReader = reader;
  }

  setSummary(partial: SessionSummary): void {
    const prev = this.summary;
    const next: SessionSummary = { ...prev };

    // Numeric fields: keep MAX so a partial / stale update never overwrites
    // a higher number already persisted (covers rehydration + late events).
    for (const k of ['highestLevel', 'totalDeerFed', 'totalMoneyEarned',
                     'totalMoneySpent', 'totalShares'] as const) {
      const v = partial[k];
      if (typeof v === 'number' && (typeof prev[k] !== 'number' || v > prev[k]!)) {
        next[k] = v;
      }
    }
    // Array / scalar — union or last-write-wins.
    if (partial.titlesUnlocked) {
      const set = new Set([...(prev.titlesUnlocked ?? []), ...partial.titlesUnlocked]);
      next.titlesUnlocked = Array.from(set);
    }
    if (typeof partial.completed === 'boolean' && partial.completed) {
      next.completed = true;
    }
    if (partial.exitReason) next.exitReason = partial.exitReason;

    this.summary = next;
    saveSummary(next);
  }

  recordEvent(type: EventType, payload?: Record<string, unknown>): void {
    this.buffer.events.push({ ts: Date.now(), type, payload });
    if (this.buffer.events.length > MAX_BUFFER_EVENTS) {
      this.buffer.events.splice(0, this.buffer.events.length - MAX_BUFFER_EVENTS);
    }
    saveBuffer(this.buffer);
  }

  private tickSnap(): void {
    if (!this.stateReader) return;
    try {
      const s = this.stateReader();
      if (!s) return;
      this.buffer.snapshots.push({ ts: Date.now(), ...s });
      if (this.buffer.snapshots.length > MAX_BUFFER_SNAPS) {
        this.buffer.snapshots.splice(
          0,
          this.buffer.snapshots.length - MAX_BUFFER_SNAPS,
        );
      }
      saveBuffer(this.buffer);
    } catch {
      /* reader threw — skip this tick */
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.buffer.events.length === 0 && this.buffer.snapshots.length === 0 && !this.exitReason) {
      return;
    }
    this.flushing = true;

    const body = {
      sessionId: this.session.id,
      startAt: this.session.startAt,
      lastActive: Date.now(),
      endAt: this.exitReason ? Date.now() : undefined,
      device: this.device,
      snapshots: this.buffer.snapshots,
      events: this.buffer.events,
      summary: {
        ...this.summary,
        exitReason: this.exitReason ?? this.summary.exitReason,
      },
    };

    // Drain locally first to avoid double-sending on slow networks.
    const events = this.buffer.events.splice(0, this.buffer.events.length);
    const snaps = this.buffer.snapshots.splice(0, this.buffer.snapshots.length);
    saveBuffer(this.buffer);

    const payload = JSON.stringify(body);

    try {
      const ok = await postTrack(payload);
      if (!ok) {
        // Put them back at the head so the next attempt retries.
        this.buffer.events = events.concat(this.buffer.events);
        this.buffer.snapshots = snaps.concat(this.buffer.snapshots);
        saveBuffer(this.buffer);
      }
    } catch {
      // Network down — re-buffer. The next flush will pick them up.
      this.buffer.events = events.concat(this.buffer.events);
      this.buffer.snapshots = snaps.concat(this.buffer.snapshots);
      saveBuffer(this.buffer);
    } finally {
      this.flushing = false;
    }
  }
}

async function postTrack(payload: string): Promise<boolean> {
  // Prefer sendBeacon on unload (it survives navigation); fall back to fetch
  // for periodic flushes where we want to know if it landed.
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    // sendBeacon ignores Content-Type unless caller sets it; this works for
    // Flask's get_json() because Flask doesn't care about Content-Type for
    // sendBeacon if it can sniff the JSON. Set explicitly for safety.
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return true;
    } catch {
      /* fall through */
    }
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- singleton ----

let _tracker: TrackerImpl | null = null;
let _started = false;

/** Lazily create + auto-start the singleton. Idempotent. */
export function getTracker(): TrackerApi {
  if (!_tracker) {
    _tracker = new TrackerImpl();
    if (!_started) {
      _tracker.start();
      _started = true;
    }
  }
  return _tracker;
}
