---
description: Guidelines for using Memory MCP (Knowledge Graph) to persist architectural decisions and context.
---

# Memory MCP & Knowledge Graph Workflow

Use the Memory MCP tools (`mcp_memory_*`) to persist structured knowledge about the Blawby codebase. This ensures the AI assistant maintains a long-term "mental map" of the project across sessions.

## 1. When to Add Information
- **After major refactors**: Record what was split/merged and why (e.g., UserDetails split into CRUD/Stripe).
- **New patterns**: Record project-specific conventions (e.g., `ServiceContext` requirements).
- **Tricky bugs**: Record "gotchas" or complex fixes that shouldn't be regressed.
- **Architectural links**: Record how modules interact (e.g., Intake -> triggers -> UserDetails creation).

## 2. Entity Naming Conventions
- **Modules**: `Module:<ModuleName>` (e.g., `Module:UserDetails`).
- **Patterns**: `Pattern:<PatternName>` (e.g., `Pattern:ServiceContext`).
- **External Services**: `Service:<ServiceName>` (e.g., `Service:Stripe`).
- **Refactors**: `Refactor:<Topic>` (e.g., `Refactor:UserDetailsPR4`).

## 3. Tool Usage Rules
- **Entities**: Create focused entities. Avoid one giant "Codebase" node.
- **Observations**: Keep observations factual and concise.
- **Relations**: Use active voice for relation types (`uses`, `implements`, `triggers`, `validates`).

### Example Command Sequence
```javascript
// 1. Create the entity
create_entities([{ name: "Module:UserDetails", entityType: "Module", observations: ["Refactored in PR-4 to split logic."] }])

// 2. Add specific facts
add_observations([{ entityName: "Module:UserDetails", contents: ["Uses CASL for granular authorization at service level."] }])

// 3. Link it to other parts of the system
create_relations([{ from: "Module:UserDetails", to: "Module:Intake", relationType: "triggered_by" }])
```

## 4. Search Before Research
Always call `mcp_memory_search_nodes` or `mcp_memory_read_graph` when entering a new module to see if there are existing "memories" about that module's quirks or history.
