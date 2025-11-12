# AGENTS.md

## Build, Lint, and Test Commands

### Build
- **Start the application**: `npm start`

### Lint
- **Lint the code**: ESLint is configured. Run `npx eslint .` to lint the codebase.

### Test
- **Run all tests**: No test framework is currently configured. Add a testing framework like Jest or Mocha to enable automated tests.
- **Run a single test**: Not applicable until a test framework is added.

## Code Style Guidelines

### General
- **Module System**: ES Modules (`import`/`export` syntax is used; see `type: "module"` in package.json).
- **File Extensions**: Use `.js` for JavaScript files.

### Imports
- Use `import`/`export` for modules.
- Group `node:` modules (e.g., `path`, `fs`) at the top, followed by third-party modules, and then local modules.

### Formatting
- **Indentation**: Use 2 spaces.
- **Line Length**: Keep lines under 80 characters where possible.
- **Semicolons**: Omit semicolons unless required to prevent errors.
- **Quotes**: Use single quotes for strings.

### Types
- No TypeScript or explicit type-checking is used. Consider adding TypeScript for better type safety.

### Naming Conventions
- **Variables and Functions**: Use `camelCase`.
- **Constants**: Use `UPPER_SNAKE_CASE`.
- **Classes**: Use `PascalCase`.
- **Files**: Use `kebab-case`.

### Error Handling
- Always handle errors in asynchronous functions using `try-catch` blocks.
- Log errors to the console with meaningful messages.

### Specific Practices
- Use `async/await` for asynchronous operations.
- Avoid deeply nested callbacks; refactor into smaller functions.
- Use `contextBridge` in `preload.js` to expose APIs securely.

## Recommendations
- Configure a test framework like Jest or Mocha.
- Consider adding TypeScript for type safety.
- Document additional commands and guidelines as the project evolves.