// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

export function calculateSM2(file, feedback, params) {
  const response_quality = { again: 0, hard: 1, good: 4, easy: 5 }
  const q = response_quality[feedback]

  if (q === undefined) {
    throw new Error('Invalid feedback value')
  }

  const easiness_update = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)

  let newEasiness, newRank, newInterval

  // Check if failed (below threshold)
  if (q < params.fail_threshold) {
    // Failed: reset interval but keep EF
    newInterval = 1
    newEasiness = file.easiness
    newRank = file.rank
  } else {
    // Passed: update EF and calculate new interval
    newEasiness = Math.max(params.min_ef, Math.min(params.max_ef, file.easiness + easiness_update))
    // Naively adjust rank based on feedback
    newRank = file.rank + q

    if (file.review_count === 0) {
      newInterval = params.first_interval
    } else if (file.review_count === 1) {
      newInterval = params.second_interval
    } else {
      newInterval = Math.floor(file.interval * newEasiness)
    }
  }

  return { newEasiness, newInterval, newRank }
}
