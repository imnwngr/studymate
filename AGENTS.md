# Spark — Agent Instructions

## UI/UX Workflow

For every UI/UX task:

1. Read DESIGN.md if available.
2. Use the installed `hallmark` skill for design,
   layout, typography, and interaction decisions.
3. Use the installed `antislop` skill and relevant
   supporting skills for quality enforcement.
4. Apply antislop in `during` mode while developing
   and `after` mode when auditing, unless overridden.
5. Preserve existing functionality and architecture.
6. Verify accessibility, responsiveness, and
   interactive states.
7. Run the Anti-slop Delivery Gate before completion.

## Design Priority

1. Functional correctness and accessibility.
2. Spark's DESIGN.md and visual identity.
3. Hallmark design guidance.
4. Anti-slop quality checks.

Resolve conflicting recommendations explicitly.
Never redesign unrelated components without reason.
Never report tests as passed without executing them.