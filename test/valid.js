import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import crypto from 'node:crypto'
import {
  extractLines,
  findContentByHashAndLineCount,
  validateAndRecoverNoteRange,
  embedText,
} from '../src/main/ipc/incremental.js'

function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of the same length')
  }
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i]
    const b = vecB[i]
    dotProduct += a * b
    normA += a * a
    normB += b * b
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return dotProduct / denominator
}

const embedTextFn = async (text) => embeddingMap[text] || new Float32Array([0, 1, 0])
