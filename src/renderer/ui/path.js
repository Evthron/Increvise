/**
 * Helper: Get basename of a file path
 * @param {string} filePath - Full file path
 * @param {string} ext - Optional extension to remove
 * @returns {string} - Base name
 */
function basename(filePath, ext) {
  const parts = filePath.replace(/\\/g, '/').split('/')
  let name = parts[parts.length - 1] || ''
  if (ext && name.endsWith(ext)) {
    name = name.slice(0, -ext.length)
  }
  return name
}

/**
 * Helper: Get file extension
 * @param {string} filePath - Full file path
 * @returns {string} - Extension including dot (e.g., '.md')
 */
function extname(filePath) {
  const name = basename(filePath)
  const lastDot = name.lastIndexOf('.')
  return lastDot === -1 ? '' : name.slice(lastDot)
}

/**
 * Helper: Get file base path relative to the root folder
 * @param {string} filePath - Full file path
 * @returns {string} - Relative path from root folder
 */
function relative(filePath) {
  const rootPath = window.currentRootPath || ''
  return filePath.startsWith(rootPath)
    ? filePath.slice(rootPath.length).replace(/^\/+/, '')
    : filePath
}

export { basename, extname, relative }
