"""
RAVEN Central Database — SQLite-backed storage for all detection data.

Every pipeline run (live feed or video file) creates a unique Session.
All detections are linked to their session, so you always know:
  - WHERE the data came from (source_type + source_path)
  - WHEN it was captured (wall-clock timestamps)
  - WHICH model produced it
  - The full detection + evidence record
"""

import sqlite3
import os
import json
import logging
import uuid
import datetime
from typing import List, Optional, Dict, Any
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# Default database location — single file for the entire project
DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", "data", "raven.db"
)


class RavenDatabase:
    """
    Central SQLite database for all RAVEN data.

    Tables:
        sessions    — one row per pipeline run (live or video)
        detections  — one row per tracked defect event
    """

    SCHEMA_VERSION = 1

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = os.path.abspath(db_path or DEFAULT_DB_PATH)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()
        logger.info(f"RAVEN database ready at {self.db_path}")

    # ------------------------------------------------------------------ #
    #  Connection helpers
    # ------------------------------------------------------------------ #

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @contextmanager
    def _transaction(self):
        conn = self._get_connection()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ------------------------------------------------------------------ #
    #  Schema initialisation
    # ------------------------------------------------------------------ #

    def _init_db(self):
        with self._transaction() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id      TEXT PRIMARY KEY,
                    source_type     TEXT NOT NULL,       -- 'video' | 'live_camera'
                    source_path     TEXT,                -- file path or camera index
                    model_path      TEXT,
                    started_at      TEXT NOT NULL,       -- ISO-8601
                    ended_at        TEXT,                -- ISO-8601, NULL while running
                    total_frames    INTEGER DEFAULT 0,
                    total_detections INTEGER DEFAULT 0,
                    config_snapshot TEXT,                -- JSON dump of config used
                    status          TEXT DEFAULT 'running' -- 'running' | 'completed' | 'interrupted'
                );

                CREATE TABLE IF NOT EXISTS detections (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id      TEXT NOT NULL REFERENCES sessions(session_id),
                    event_id        TEXT NOT NULL,       -- e.g. RAVEN-00001
                    class_name      TEXT NOT NULL,
                    confidence      REAL NOT NULL,
                    first_frame     INTEGER,
                    last_frame      INTEGER,
                    latitude        REAL,
                    longitude       REAL,
                    evidence_path   TEXT,
                    status          TEXT DEFAULT 'detected',
                    detected_at     TEXT NOT NULL,       -- ISO-8601 wall-clock
                    source_type     TEXT NOT NULL,       -- denormalised for fast queries
                    source_path     TEXT,                -- denormalised for fast queries
                    model_path      TEXT,
                    extra           TEXT                 -- JSON blob for future fields
                );

                CREATE INDEX IF NOT EXISTS idx_detections_session
                    ON detections(session_id);
                CREATE INDEX IF NOT EXISTS idx_detections_class
                    ON detections(class_name);
                CREATE INDEX IF NOT EXISTS idx_detections_detected_at
                    ON detections(detected_at);
                CREATE INDEX IF NOT EXISTS idx_detections_event_id
                    ON detections(event_id);

                CREATE TABLE IF NOT EXISTS schema_meta (
                    key   TEXT PRIMARY KEY,
                    value TEXT
                );
            """)

            # Store schema version
            conn.execute(
                "INSERT OR REPLACE INTO schema_meta(key, value) VALUES (?, ?)",
                ("version", str(self.SCHEMA_VERSION))
            )

    # ------------------------------------------------------------------ #
    #  Session management
    # ------------------------------------------------------------------ #

    def create_session(
        self,
        source_type: str,
        source_path: str,
        model_path: str,
        config_snapshot: Optional[Dict] = None
    ) -> str:
        """
        Create a new session for a pipeline run.
        Returns the session_id (UUID).
        """
        session_id = f"SESSION-{uuid.uuid4().hex[:8].upper()}"
        now = datetime.datetime.now().isoformat()
        config_json = json.dumps(config_snapshot) if config_snapshot else None

        with self._transaction() as conn:
            conn.execute(
                """INSERT INTO sessions
                   (session_id, source_type, source_path, model_path,
                    started_at, config_snapshot, status)
                   VALUES (?, ?, ?, ?, ?, ?, 'running')""",
                (session_id, source_type, source_path, model_path,
                 now, config_json)
            )

        logger.info(
            f"Created session {session_id} | "
            f"source={source_type}:{source_path} | model={model_path}"
        )
        return session_id

    def finish_session(
        self,
        session_id: str,
        total_frames: int,
        total_detections: int,
        status: str = "completed"
    ):
        """Mark a session as finished."""
        now = datetime.datetime.now().isoformat()
        with self._transaction() as conn:
            conn.execute(
                """UPDATE sessions
                   SET ended_at = ?, total_frames = ?,
                       total_detections = ?, status = ?
                   WHERE session_id = ?""",
                (now, total_frames, total_detections, status, session_id)
            )
        logger.info(
            f"Session {session_id} finished | status={status} | "
            f"frames={total_frames} detections={total_detections}"
        )

    # ------------------------------------------------------------------ #
    #  Detection storage
    # ------------------------------------------------------------------ #

    def save_detections(
        self,
        session_id: str,
        events: list,
        source_type: str,
        source_path: str,
        model_path: str
    ):
        """
        Upsert detections for a session.
        Replaces all detections for this session (so live flushes work correctly).
        """
        now = datetime.datetime.now().isoformat()

        with self._transaction() as conn:
            # Delete existing detections for this session (idempotent upsert)
            conn.execute(
                "DELETE FROM detections WHERE session_id = ?",
                (session_id,)
            )

            for event in events:
                # Support both TrackedEvent objects and plain dicts
                if hasattr(event, "event_id"):
                    extra_data = {}
                    if event.gps_position:
                        extra_data = {
                            "road_id": event.gps_position.road_id,
                            "road_name": event.gps_position.road_name,
                            "city": event.gps_position.city,
                        }
                    
                    row = (
                        session_id,
                        event.event_id,
                        event.class_name,
                        round(event.current_confidence, 4),
                        event.first_frame,
                        event.last_frame,
                        event.gps_position.latitude if event.gps_position else None,
                        event.gps_position.longitude if event.gps_position else None,
                        event.evidence_path,
                        event.status,
                        now,
                        source_type,
                        source_path,
                        model_path,
                        json.dumps(extra_data)
                    )
                else:
                    # Dict form (e.g. from JSON)
                    extra_data = {
                        "road_id": event.get("road_id"),
                        "road_name": event.get("road_name"),
                        "city": event.get("city")
                    }
                    row = (
                        session_id,
                        event.get("event_id", ""),
                        event.get("class_name", event.get("type", "")),
                        event.get("confidence", 0.0),
                        event.get("first_frame"),
                        event.get("last_frame"),
                        event.get("latitude"),
                        event.get("longitude"),
                        event.get("evidence_path", event.get("evidence")),
                        event.get("status", "detected"),
                        now,
                        source_type,
                        source_path,
                        model_path,
                        json.dumps(extra_data)
                    )

                conn.execute(
                    """INSERT INTO detections
                       (session_id, event_id, class_name, confidence,
                        first_frame, last_frame, latitude, longitude,
                        evidence_path, status, detected_at,
                        source_type, source_path, model_path, extra)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    row
                )

        logger.info(
            f"Saved {len(events)} detections for session {session_id}"
        )

    # ------------------------------------------------------------------ #
    #  Query helpers
    # ------------------------------------------------------------------ #

    def get_all_sessions(self) -> List[Dict[str, Any]]:
        """Return all sessions, newest first."""
        with self._transaction() as conn:
            rows = conn.execute(
                "SELECT * FROM sessions ORDER BY started_at DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Return a single session by ID."""
        with self._transaction() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE session_id = ?",
                (session_id,)
            ).fetchone()
            return dict(row) if row else None

    def get_detections_for_session(
        self, session_id: str
    ) -> List[Dict[str, Any]]:
        """Return all detections for a given session."""
        with self._transaction() as conn:
            rows = conn.execute(
                """SELECT * FROM detections
                   WHERE session_id = ?
                   ORDER BY first_frame""",
                (session_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_all_detections(
        self,
        source_type: Optional[str] = None,
        class_name: Optional[str] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """
        Return detections across all sessions with optional filters.
        """
        query = "SELECT * FROM detections WHERE 1=1"
        params: list = []

        if source_type:
            query += " AND source_type = ?"
            params.append(source_type)
        if class_name:
            query += " AND class_name = ?"
            params.append(class_name)

        query += " ORDER BY detected_at DESC LIMIT ?"
        params.append(limit)

        with self._transaction() as conn:
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]

    def get_latest_detections(self) -> List[Dict[str, Any]]:
        """
        Return detections from the most recent session (for dashboard compat).
        """
        with self._transaction() as conn:
            row = conn.execute(
                "SELECT session_id FROM sessions ORDER BY started_at DESC LIMIT 1"
            ).fetchone()
            if not row:
                return []
            return self.get_detections_for_session(row["session_id"])

    def get_latest_report(self) -> Dict[str, Any]:
        """
        Generate a report dict from the most recent session (dashboard compat).
        """
        with self._transaction() as conn:
            session_row = conn.execute(
                "SELECT * FROM sessions ORDER BY started_at DESC LIMIT 1"
            ).fetchone()
            if not session_row:
                return {}

            session = dict(session_row)
            detections = self.get_detections_for_session(session["session_id"])

            breakdown: Dict[str, int] = {}
            total_conf = 0.0
            for det in detections:
                cn = det["class_name"]
                breakdown[cn] = breakdown.get(cn, 0) + 1
                total_conf += det["confidence"]

            n = len(detections)
            return {
                "survey_id": session["session_id"],
                "source_type": session["source_type"],
                "source_path": session["source_path"],
                "timestamp": session["started_at"],
                "ended_at": session.get("ended_at"),
                "surveyed_frames": session["total_frames"],
                "total_defects": n,
                "average_confidence": round(total_conf / n, 4) if n else 0.0,
                "breakdown": breakdown,
                "status": session["status"],
            }

    def update_detection_status(
        self, event_id: str, new_status: str
    ) -> bool:
        """Update status of a detection (e.g. 'cleared', 'deleted')."""
        with self._transaction() as conn:
            cursor = conn.execute(
                "UPDATE detections SET status = ? WHERE event_id = ?",
                (new_status, event_id)
            )
            return cursor.rowcount > 0

    def delete_detection(self, event_id: str) -> bool:
        """Hard-delete a detection row."""
        with self._transaction() as conn:
            cursor = conn.execute(
                "DELETE FROM detections WHERE event_id = ?",
                (event_id,)
            )
            return cursor.rowcount > 0

    def get_summary_stats(self) -> Dict[str, Any]:
        """
        Aggregate statistics across all sessions.
        """
        with self._transaction() as conn:
            session_count = conn.execute(
                "SELECT COUNT(*) AS cnt FROM sessions"
            ).fetchone()["cnt"]

            detection_count = conn.execute(
                "SELECT COUNT(*) AS cnt FROM detections"
            ).fetchone()["cnt"]

            by_source = conn.execute(
                """SELECT source_type, COUNT(*) AS cnt
                   FROM detections GROUP BY source_type"""
            ).fetchall()

            by_class = conn.execute(
                """SELECT class_name, COUNT(*) AS cnt
                   FROM detections GROUP BY class_name
                   ORDER BY cnt DESC"""
            ).fetchall()

            return {
                "total_sessions": session_count,
                "total_detections": detection_count,
                "by_source": {r["source_type"]: r["cnt"] for r in by_source},
                "by_class": {r["class_name"]: r["cnt"] for r in by_class},
            }
