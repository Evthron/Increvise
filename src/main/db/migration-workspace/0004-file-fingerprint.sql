-- SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
--
-- SPDX-License-Identifier: GPL-3.0-or-later

ALTER TABLE file ADD COLUMN content_hash TEXT;
ALTER TABLE file ADD COLUMN content_embedding BLOB;
ALTER TABLE file ADD COLUMN content_embedding_model TEXT;
ALTER TABLE file ADD COLUMN content_embedding_dim INTEGER;

CREATE INDEX idx_file_content_hash ON file(library_id, content_hash);
