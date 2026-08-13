# Source Pack: ARCH-BASIC-SCHEMA

## Resolved Sources

| Source | Status | Notes |
| --- | --- | --- |
| SRC-AUTHOR-MATERIALS | Limited | Dedicated author-materials directory is not present in this repository snapshot, so the lesson uses established course context and Compliance project facts. |
| Course context | Available | Previous lessons define requirements, UML interaction models and the Compliance case. |
| Compliance project context | Available | Current system-analysis artifacts include use cases, activities, states and sequence diagrams. |

## Source Boundary

External research is disabled for this topic by the topic passport. The lesson intentionally stays at the introductory analyst level and avoids framework-specific frontend/backend implementation details.

## Usable Teaching Points

1. `client -> frontend -> backend -> database` is a teaching model for responsibility boundaries.
2. Client is the user's runtime environment; frontend is the interface layer loaded or installed for the user.
3. Backend owns critical business rules, access checks and state transitions.
4. Database stores durable system state.
5. The same scenario can be described both as a sequence diagram and as a responsibility split across architectural parts.
