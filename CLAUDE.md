## Project-level coding guidelines

## Architecture principles

- **Backend is the source of truth**: All state, data, and computation lives in the backend. The frontend is purely a presentation layer — it renders what the backend provides via REST and WebSocket. The frontend MUST NOT maintain its own derived state or duplicate backend logic.
- **Design tokens over hardcoded values**: All colors, font sizes, spacing, and other visual properties MUST use theme tokens defined in `index.css` `@theme` block. Never use hardcoded pixel sizes (e.g. `text-[10px]`) or raw color values (e.g. `rgba(129,140,248,...)`).

## Workflow
- See @~/SPEC.md and @~/TODO.md for project details and design
- Make sure to create TODO.md with task items and completion status. Update the status as you complete task.
- Always refer back to TODO.md to confirm after completing a task.
- NEVER defer a task for future, any tasks in TODO should be completed. Move the task to new or different phase if needed.
- This is a monorepo so make sure to use `npm install -w @crow-central-agency/xxx` or `npm install -D -w @crow-central-agency/xxx` from root project folder for adding packages so we always use up-to-date version.
- Run `npm run build` before every commit to validate changes.
- Never ignore security, high, or medium severity issues. When addressing review comments, reason through the issue independently and determine the most appropriate fix rather than applying suggestions blindly.
- Always making changes in a modular or signle feature focused way. MUST NOT create giant changes in one iteration.
- Commit the changes with clear messages on the goals of the changes and what it is supposed to accomplish.
- Keep documentation up-to-date alongside any code changes.
- NEVER amend commit
- Add proper JSDoc comments to functions and code
- DO NOT divide implementation phases by backend / frontend / shared, etc. The plan should be feature-oriented functional phases.
