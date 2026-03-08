// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'

/**
 * Filesystem Adapter for Capacitor
 * Provides an interface similar to Node.js fs module
 */

/**
 * Read a text file
 * @param {string} path - File path
 * @param {string} directory - Directory location
 * @returns {Promise<string>} File content
 */
export async function readFile(path, directory = Directory.Data) {
  try {
    const result = await Filesystem.readFile({
      path,
      directory,
      encoding: Encoding.UTF8,
    })
    return result.data
  } catch (error) {
    console.error('[Filesystem] Read file error:', error, path)
    throw error
  }
}

/**
 * Read a binary file (e.g., PDF)
 * @param {string} path - File path
 * @param {string} directory - Directory location
 * @returns {Promise<string>} Base64 encoded data
 */
export async function readBinaryFile(path, directory = Directory.Data) {
  try {
    const result = await Filesystem.readFile({
      path,
      directory,
    })
    return result.data // Returns base64
  } catch (error) {
    console.error('[Filesystem] Read binary file error:', error, path)
    throw error
  }
}

/**
 * Write a text file
 * @param {string} path - File path
 * @param {string} data - File content
 * @param {string} directory - Directory location
 */
export async function writeFile(path, data, directory = Directory.Data) {
  try {
    const parentDir = path.split('/').slice(0, -1).join('/')
    if (parentDir) {
      await Filesystem.mkdir({
        path: parentDir,
        directory,
        recursive: true,
      })
    }

    await Filesystem.writeFile({
      path,
      data,
      directory,
      encoding: Encoding.UTF8,
    })
  } catch (error) {
    console.error('[Filesystem] Write file error:', error, path)
    throw error
  }
}

/**
 * Check if a file exists
 * @param {string} path - File path
 * @param {string} directory - Directory location
 * @returns {Promise<boolean>}
 */
export async function exists(path, directory = Directory.Data) {
  try {
    await Filesystem.stat({
      path,
      directory,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Get file information
 * @param {string} path - File path
 * @param {string} directory - Directory location
 */
export async function stat(path, directory = Directory.Data) {
  try {
    const result = await Filesystem.stat({
      path,
      directory,
    })
    return result
  } catch (error) {
    console.error('[Filesystem] Stat error:', error, path)
    throw error
  }
}

/**
 * Create a directory
 * @param {string} path - Directory path
 * @param {string} directory - Directory location
 */
export async function mkdir(path, directory = Directory.Data) {
  try {
    await Filesystem.mkdir({
      path,
      directory,
      recursive: true,
    })
  } catch (error) {
    console.error('[Filesystem] Mkdir error:', error, path)
    throw error
  }
}

/**
 * List directory contents
 * @param {string} path - Directory path
 * @param {string} directory - Directory location
 */
export async function readdir(path, directory = Directory.Data) {
  try {
    const result = await Filesystem.readdir({
      path,
      directory,
    })
    return result.files
  } catch (error) {
    console.error('[Filesystem] Readdir error:', error, path)
    throw error
  }
}

/**
 * Delete a file
 * @param {string} path - File path
 * @param {string} directory - Directory location
 */
export async function deleteFile(path, directory = Directory.Data) {
  try {
    await Filesystem.deleteFile({
      path,
      directory,
    })
  } catch (error) {
    console.error('[Filesystem] Delete file error:', error, path)
    throw error
  }
}

/**
 * Delete a directory
 * @param {string} path - Directory path
 * @param {string} directory - Directory location
 */
export async function rmdir(path, directory = Directory.Data) {
  try {
    await Filesystem.rmdir({
      path,
      directory,
      recursive: true,
    })
  } catch (error) {
    console.error('[Filesystem] Rmdir error:', error, path)
    throw error
  }
}

/**
 * Copy a file
 * @param {string} from - Source file path
 * @param {string} to - Target file path
 * @param {string} directory - Directory location
 */
export async function copyFile(from, to, directory = Directory.Data) {
  try {
    await Filesystem.copy({
      from,
      to,
      directory,
    })
  } catch (error) {
    console.error('[Filesystem] Copy file error:', error, from, to)
    throw error
  }
}

/**
 * Get the URI of the Data directory
 */
export async function getDataDirUri() {
  try {
    const result = await Filesystem.getUri({
      path: '',
      directory: Directory.Data,
    })
    return result.uri
  } catch (error) {
    console.error('[Filesystem] Get data dir URI error:', error)
    throw error
  }
}

/**
 * Recursively copy a directory (used for importing workspaces)
 * @param {string} sourcePath - Source directory path
 * @param {string} targetPath - Target directory path
 * @param {string} sourceDir - Source directory type
 * @param {string} targetDir - Target directory type
 */
export async function copyDirectory(
  sourcePath,
  targetPath,
  sourceDir = Directory.Data,
  targetDir = Directory.Data
) {
  try {
    // Create the target directory
    await mkdir(targetPath, targetDir)

    // List the contents of the source directory
    const files = await readdir(sourcePath, sourceDir)

    // Recursively copy each file and subdirectory
    for (const file of files) {
      const sourceFilePath = `${sourcePath}/${file.name}`
      const targetFilePath = `${targetPath}/${file.name}`

      if (file.type === 'directory') {
        // Recursively copy subdirectory
        await copyDirectory(sourceFilePath, targetFilePath, sourceDir, targetDir)
      } else {
        // Copy file
        await copyFile(sourceFilePath, targetFilePath, targetDir)
      }
    }
  } catch (error) {
    console.error('[Filesystem] Copy directory error:', error, sourcePath, targetPath)
    throw error
  }
}
