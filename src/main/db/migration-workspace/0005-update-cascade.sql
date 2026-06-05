-- SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
--
-- SPDX-License-Identifier: GPL-3.0-or-later

-- Temporarily disable foreign keys to allow table restructuring
PRAGMA foreign_keys = OFF;

-- Rebuild queue_membership table with ON UPDATE CASCADE on file foreign key
ALTER TABLE queue_membership RENAME TO queue_membership_old;

CREATE TABLE queue_membership (
    library_id TEXT NOT NULL,
    queue_name TEXT NOT NULL,
    relative_path TEXT NOT NULL,

    PRIMARY KEY (library_id, relative_path),
    FOREIGN KEY (library_id, relative_path)
    REFERENCES file(library_id, relative_path) ON UPDATE CASCADE,
    FOREIGN KEY (library_id, queue_name)
    REFERENCES review_queue(library_id, queue_name)
);

INSERT INTO queue_membership SELECT * FROM queue_membership_old;
DROP TABLE queue_membership_old;

-- Rebuild note_source table with ON UPDATE CASCADE on file foreign key
ALTER TABLE note_source RENAME TO note_source_old;

CREATE TABLE note_source (
    library_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    parent_path TEXT,
    extract_type TEXT NOT NULL,
    range_start TEXT,
    range_end TEXT,
    source_hash TEXT,
    source_embedding BLOB,
    embedding_model TEXT,
    embedding_dim INTEGER,

    PRIMARY KEY (library_id, relative_path),
    FOREIGN KEY (library_id, relative_path)
        REFERENCES file(library_id, relative_path) ON UPDATE CASCADE
);

INSERT INTO note_source SELECT * FROM note_source_old;
DROP TABLE note_source_old;

-- Recreate indexes for note_source
CREATE INDEX idx_note_source_parent ON note_source(library_id, parent_path);
CREATE INDEX idx_note_source_hash ON note_source(library_id, source_hash);

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;
