-- SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
--
-- SPDX-License-Identifier: GPL-3.0-or-later

ALTER TABLE file RENAME COLUMN intermediate_base TO intermediate_interval;

ALTER TABLE file DROP COLUMN intermediate_multiplier;
