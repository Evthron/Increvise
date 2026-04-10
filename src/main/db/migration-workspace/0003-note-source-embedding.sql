-- SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
--
-- SPDX-License-Identifier: GPL-3.0-or-later

ALTER TABLE note_source ADD COLUMN source_embedding BLOB;
ALTER TABLE note_source ADD COLUMN embedding_model TEXT;
ALTER TABLE note_source ADD COLUMN embedding_dim INTEGER;
