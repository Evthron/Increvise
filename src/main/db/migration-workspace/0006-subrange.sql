-- SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
--
-- SPDX-License-Identifier: GPL-3.0-or-later
ALTER TABLE note_source
RENAME TO note_source_old;

CREATE TABLE
    note_source (
        library_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        parent_path TEXT,
        extract_type TEXT NOT NULL,
        range_start INTEGER, -- Change type from TEXT to INTEGER
        range_start_sub INTEGER, -- Add sub postion (like line-start)
        range_end INTEGER, -- Change type from TEXT to INTEGER
        range_end_sub INTEGER, -- Add sub postion (like line-end)
        source_hash TEXT,
        source_embedding BLOB,
        embedding_model TEXT,
        embedding_dim INTEGER,
        PRIMARY KEY (library_id, relative_path),
        FOREIGN KEY (library_id, relative_path) REFERENCES file (library_id, relative_path) ON UPDATE CASCADE ON DELETE CASCADE
    );

INSERT INTO
    note_source (
        library_id,
        relative_path,
        parent_path,
        extract_type,
        range_start,
        range_start_sub,
        range_end,
        range_end_sub,
        source_hash,
        source_embedding,
        embedding_model,
        embedding_dim
    )
SELECT
    library_id,
    relative_path,
    parent_path,
    extract_type,
    -- originally used "page_start:line_start" and "page_end:line_end" and parse it on the fly
    CASE
        WHEN extract_type = 'pdf-text' THEN CAST(
            substring(range_start, 1, instr (range_start, ':') - 1) as integer
        )
        ELSE CAST(range_start as INTEGER)
    END,
    CASE
        WHEN extract_type = 'pdf-text' THEN CAST(
            substring(range_start, instr (range_start, ':') + 1) as integer
        )
        else null
    END,
    CASE
        WHEN extract_type = 'pdf-text' THEN CAST(
            substring(range_end, 1, instr (range_end, ':') - 1) as integer
        )
        ELSE CAST(range_end as INTEGER)
    END,
    CASE
        WHEN extract_type = 'pdf-text' THEN CAST(
            substring(range_end, instr (range_end, ':') + 1) as integer
        )
        else null
    END,
    source_hash,
    source_embedding,
    embedding_model,
    embedding_dim
FROM
    note_source_old;

DROP TABLE note_source_old;