# AGENTS

This file contains repository-wide guidance for AI coding agents and human contributors.

## Scope

Apply these rules to the whole repository unless a more specific instruction exists closer to the relevant files.

## Code Style

- Prefer explicit, strict typing. Keep types narrow and avoid widening to `string | number | ...` when the domain is known.
- Comments must be in English using the Latin alphabet only. Do not write comments in Cyrillic.
- Boolean variables and flags should preferably start with `is`, for example `isActive`, `isAdmin`, `isValid`.
- Keep line endings as `LF` in tracked files. If you hit formatter errors caused by `CRLF`, convert the file to `LF` and reformat.

## Execution Rules

- Do not run `build`, `test`, `typecheck`, `dev`, or start watchers or servers unless the user explicitly asks.
- If command execution is needed to validate a change, ask first instead of running it proactively.

## TypeScript Rules

- `any` is forbidden by default.
- Use `unknown` plus type guards or narrowing instead of `any`.
- If you need a flexible object shape, prefer `Record<string, unknown>` or a specific interface over `any`.
- If you need to type JSON, prefer `unknown` or an explicit JSON union over `any`.
- Use `any` only when there is no realistic alternative, for example a truly untyped third-party API surface.
- When using `any`, localize it at the boundary and add a short comment explaining why it is unavoidable.

- Avoid type assertions with `as` as much as possible.
- Prefer type guards, narrowing, and better source types instead of `as`.
- Prefer `satisfies` for validating object shapes without changing inferred types.
- Prefer parsing and validation at boundaries such as HTTP, env, storage, and third-party SDKs so the rest of the code stays strongly typed.
- Avoid `as any` entirely.

- Prefer `readonly` where immutability is appropriate, especially for DTOs, config objects, and constants.

- Prefer named types for public APIs such as service methods, controller responses, and module exports.
- Do not use inline object types in public signatures such as `Promise<{ ... }>` or `foo(arg: { ... })`.
- Extract object shapes into a named `interface` or `type`, ideally colocated in `types/requests/*` for DTOs.

- Prefer `interface` over `type` for object shapes unless `type` is clearly the better fit.
- Use `type` for unions, intersections, mapped types, conditional types, tuples, and other patterns that interfaces cannot express cleanly.
- Keep type imports separate from value imports. Do not mix them in one import statement.

## Strictness

- Prefer explicit correctness over best-effort fallbacks.
- Do not add "just in case" logic that guesses shapes or silently recovers from invalid states.
- If something is not as expected, throw an error or return an explicit error result instead of defaulting silently.
- Avoid patterns that hide invalid states, for example `res?.data ?? res ?? {}`, `value || {}`, or `arr ?? []` when the default is not explicitly part of the contract.
- At boundaries, parse unknown input, validate the expected shape, and throw if it does not match.

## NestJS Patterns

- Prefer DTOs for request and response shapes.
- Keep controllers thin and move business logic into services.
- Use dependency injection consistently.
- Avoid creating clients directly inside methods unless the scope requires it and the reason is clear.

## Notes

- This file is the repository-wide, tool-agnostic source of agent instructions.
- If a tool supports its own instruction format, prefer pointing it to this file instead of duplicating rules.
