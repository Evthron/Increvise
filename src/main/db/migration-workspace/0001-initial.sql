-- SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
--
-- SPDX-License-Identifier: GPL-3.0-or-later

CREATE TABLE library (
    library_id TEXT PRIMARY KEY,
    library_name TEXT NOT NULL,
    created_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE file (
    library_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    added_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_revised_time DATETIME,
    review_count INTEGER DEFAULT 0,
    easiness REAL DEFAULT 2.5,
    rank REAL DEFAULT 70.0,
    interval INTEGER DEFAULT 1,
    due_time DATETIME,
    
    rotation_interval INTEGER DEFAULT 3,
    intermediate_multiplier REAL DEFAULT 1.0,
    intermediate_base INTEGER DEFAULT 7,
    extraction_count INTEGER DEFAULT 0,
    last_queue_change DATETIME,

    PRIMARY KEY (library_id, relative_path),
    FOREIGN KEY (library_id) REFERENCES library(library_id)
);

CREATE TABLE review_queue (
    library_id TEXT NOT NULL,
    queue_name TEXT NOT NULL,
    description TEXT,
    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (library_id, queue_name),
    FOREIGN KEY (library_id) REFERENCES library(library_id)
);

CREATE TABLE queue_membership (
    library_id TEXT NOT NULL,
    queue_name TEXT NOT NULL,
    relative_path TEXT NOT NULL,

    PRIMARY KEY (library_id, relative_path),
    FOREIGN KEY (library_id, relative_path)
    REFERENCES file(library_id, relative_path),
    FOREIGN KEY (library_id, queue_name)
    REFERENCES review_queue(library_id, queue_name)
);

CREATE TABLE queue_config (
    library_id TEXT NOT NULL,
    queue_name TEXT NOT NULL,
    config_key TEXT NOT NULL,
    config_value TEXT NOT NULL,

    PRIMARY KEY (library_id, queue_name, config_key),
    FOREIGN KEY (library_id) REFERENCES library(library_id)
);

CREATE TABLE note_source (
    library_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    parent_path TEXT,
    extract_type TEXT NOT NULL,
    range_start TEXT,
    range_end TEXT,
    source_hash TEXT,

    PRIMARY KEY (library_id, relative_path),
    FOREIGN KEY (library_id, relative_path) 
        REFERENCES file(library_id, relative_path)
);

CREATE INDEX idx_note_source_parent ON note_source(library_id, parent_path);
CREATE INDEX idx_note_source_hash ON note_source(library_id, source_hash);
