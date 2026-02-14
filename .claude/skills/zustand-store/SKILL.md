---
name: zustand-store
description: "Zustand store conventions for this project. Use when adding new store slices, actions, state, selectors, or modifying the Zustand store. Covers action naming for Redux DevTools, Map serialization, selector patterns, and WebSocket event handling."
tools: Read, Glob, Grep, Edit, Write
---

# Zustand Store Conventions

Reference for working with the Zustand store in `apps/web/src/store/`.

## Store Location

- **Store definition:** `apps/web/src/store/index.ts`
- **Types:** `apps/web/src/store/types.ts`
- **Selectors:** `apps/web/src/store/selectors.ts`
- **Hydration component:** `apps/web/src/components/store-hydrator.tsx`
- **WebSocket hook:** `apps/web/src/hooks/use-app-socket.ts`

## State Shape

State uses `Map` objects for all entity collections (not plain objects or arrays):

```typescript
workspaces: Map<number, Workspace>;
tasks: Map<number, Task>;
folders: Map<number, TaskFolder>;
claudeSessions: Map<string, ClaudeSession>;
hydrated: boolean;
```

When adding new entity collections, always use `Map<id, Entity>`.

## DevTools Configuration

The store uses `devtools` middleware with two critical settings:

### 1. Map Serialization

Maps are not JSON-serializable. A custom `serialize.replacer` converts them to plain objects for Redux DevTools display:

```typescript
serialize: {
  replacer: (_key: string, value: unknown) =>
    value instanceof Map ? Object.fromEntries(value) : value,
},
```

Without this, all Maps show as `{}` in DevTools.

### 2. Action Names (REQUIRED)

Every `set()` call MUST include an action name as the 3rd parameter. Without it, actions show as "anonymous" in Redux DevTools.

```typescript
// CORRECT
set({ ... }, false, "actionName");
set((state) => { ... }, false, "actionName");

// WRONG - shows as "anonymous"
set({ ... });
set((state) => { ... });
```

### Action Naming Convention

| Context | Pattern | Examples |
|---------|---------|----------|
| Hydration | `"hydrate"` | `"hydrate"` |
| WebSocket events | `"ws/<event.type>"` | `"ws/task:created"`, `"ws/workspace:deleted"` |
| User actions | `"<entity>/<verb>"` | `"task/create"`, `"folder/rename"`, `"session/dismiss"` |

For WebSocket events, use the dynamic event type: `` `ws/${event.type}` ``

## Patterns

### Adding a New Entity Collection

1. Add the `Map` to state in the interface and initial state
2. Add hydration: fetch in `hydrate()` and populate with `new Map(items.map(i => [i.id, i]))`
3. Add WebSocket event cases in `applyEvent()` for created/updated/deleted
4. Add action methods (create, update, delete, etc.)
5. Add selectors in `selectors.ts`
6. Name every `set()` call

### Immutable Map Updates

Always create a new Map when updating — never mutate in place:

```typescript
set((state) => {
  const next = new Map(state.things);
  next.set(item.id, item);
  return { things: next };
}, false, "thing/create");
```

### Selectors

Selectors live in `apps/web/src/store/selectors.ts` and convert Maps to sorted arrays for component consumption. Use `useStore(selector, shallowArrayEqual)` with a custom equality function to prevent unnecessary re-renders.

### WebSocket Event Handling

Events flow: WebSocket -> `use-app-socket.ts` -> `useStore.getState().applyEvent(data)`

The `applyEvent` switch handles all entity CRUD events. Each case:
1. Creates a new Map from current state
2. Applies the mutation (set/delete)
3. Calls `set()` with the `ws/<event.type>` action name

### Hydration

`store-hydrator.tsx` calls `hydrate()` on mount, which fetches all entities in parallel and populates the Maps in a single `set()` call named `"hydrate"`.
