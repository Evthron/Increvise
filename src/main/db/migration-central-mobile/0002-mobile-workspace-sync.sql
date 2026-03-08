-- SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
--
-- SPDX-License-Identifier: GPL-3.0-or-later

-- Mobile workspace sync tracking table
-- This table is only used by the mobile app to track external workspace locations
CREATE TABLE IF NOT EXISTS mobile_workspace_sync (
  workspace_id TEXT PRIMARY KEY,
  external_uri TEXT NOT NULL,
  last_synced INTEGER DEFAULT 0,
  sync_enabled INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_external_uri ON mobile_workspace_sync(external_uri);
