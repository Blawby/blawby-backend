# Agent Rules & Patterns

To maintain codebase integrity and consistency, all AI agents (including Cursor and Gemini) MUST follow these established patterns. Failure to do so leads to architectural drift and type safety regressions.

## 1. Import Paths
- **Rule**: NEVER use relative paths (`./`, `../`). 
- **Requirement**: Use full path aliases starting with `@/`.
- **Reasoning**: This project uses a complex modular structure. Absolute aliases ensure that moving files doesn't break imports and that the origin of every dependency is immediately clear.

## 2. Validation & Types
- **Pattern**: Modular separation of concerns.
- **Structure**:
    - `validations/*.validation.ts`: Group schemas into a single exported `Validations` object.
    - `types/*.types.ts`: Infer types from those schemas.
- **Rule**: Handlers must not define their own schemas or types; they must consume them from these centralized locations.

## 3. API Naming
- **Rule**: Use `snake_case` for all external API interfaces (requests/responses).
- **Rule**: Use `camelCase` for internal TypeScript logic.
- **Conversion**: Rely on `responseUtils.ts` and middleware for automatic conversion. Avoid manual `toSnakeCase` calls unless absolutely necessary.

## 4. UUIDs
- **Rule**: Always use `z.uuid()` in Zod schemas. Never use `z.string().uuid()`.
- **Reasoning**: Matches the PostgreSQL `uuid` type used throughout the database.
