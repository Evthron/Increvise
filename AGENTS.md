# AGENTS.md

## Commands

### Development

- `npm run dev` - Start Electron with hot reload
- `npm run build` - Build for production
- `npm start` - Preview production build

### Testing

- `npm test` - Run all tests (auto-rebuilds better-sqlite3)
- `npm run test:validation` / `test:incremental` / `test:spaced` / `test:workspace` - Run specific test suites
- `npm run test:clean` - Remove test artifacts

### Code Quality

- `npx eslint .` - Lint code
- `npx prettier --write .` - Format code

### Native Modules

- `npm run rebuild:electron` - Rebuild better-sqlite3 for Electron
- `npm run rebuild:node` - Rebuild better-sqlite3 for Node

## Project Structure

Electron app with:

- `src/main/` - Main process (IPC handlers, database)
  - `src/main/db/` - Database initialization
  - `src/main/ipc/` - IPC handlers (file, workspace, incremental, spaced)
- `src/preload/` - Secure IPC bridge using contextBridge
- `src/renderer/` - UI layer (Lit web components)
  - `src/renderer/ui/` - Components (FileTree, EditorPanel, viewers, etc.)
- `test/` - Node.js test runner tests

## Key Technologies

- **Better-SQLite3**: Synchronous API (no async/await needed for queries)
  - Central DB: global workspace metadata and settings
  - Workspace DB: per-workspace in `.increvise/db.sqlite`
  - Use prepared statements and transactions for performance
- **Lit**: Web components extending `LitElement`
- **CodeMirror**: Code/text editor
- **Marked**: Markdown rendering
- **pdfjs-dist**: PDF viewing

## Code Conventions

- **ES Modules**: Use `import`/`export`, `node:` prefix for built-ins
- **Formatting**: Prettier and ESLint configured (see `.prettierrc` and `eslint.config.mjs`)
- **File Headers**: All source files require SPDX headers:
  ```javascript
  // SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
  //
  // SPDX-License-Identifier: GPL-3.0-or-later
  ```
- **Import Order**: Node built-ins → third-party → local modules
