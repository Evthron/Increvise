-- SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
--
-- SPDX-License-Identifier: GPL-3.0-or-later

CREATE TABLE workspace_history (
  library_id TEXT PRIMARY KEY,
  folder_path TEXT NOT NULL UNIQUE,
  folder_name TEXT NOT NULL,
  db_path TEXT NOT NULL,
  first_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
  open_count INTEGER DEFAULT 1,
  total_files INTEGER DEFAULT 0,
  files_due_today INTEGER DEFAULT 0
);

CREATE INDEX idx_last_opened ON workspace_history(last_opened DESC);
CREATE INDEX idx_folder_path ON workspace_history(folder_path);
