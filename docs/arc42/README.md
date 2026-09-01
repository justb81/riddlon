# Riddlon — Architecture Documentation (arc42)

This directory is the **single source of truth** for Riddlon's architecture documentation. It
follows the [arc42](https://arc42.org) template: twelve numbered chapters, one file each.

Everything that used to live in `docs/concept.md` (the German concept paper), `stories/README.md`
and `docs/design/README.md` has been migrated here, translated into English, and checked against
the code as it is today.

## Chapters

| #   | Chapter                                                      | Contents                                                             |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | [Introduction and Goals](./01-introduction-and-goals.md)     | Product vision, quality goals, reference story, stakeholders         |
| 2   | [Architecture Constraints](./02-architecture-constraints.md) | Technical, organisational and convention constraints                 |
| 3   | [Context and Scope](./03-context-and-scope.md)               | Business and technical context, external interfaces                  |
| 4   | [Solution Strategy](./04-solution-strategy.md)               | How the quality goals are met, in one page                           |
| 5   | [Building Block View](./05-building-block-view.md)           | Static decomposition: modules, their responsibilities and boundaries |
| 6   | [Runtime View](./06-runtime-view.md)                         | Boot, story import, a conversation turn, resume, update, reset       |
| 7   | [Deployment View](./07-deployment-view.md)                   | Browser runtime, app release, story-package release, local dev       |
| 8   | [Cross-cutting Concepts](./08-crosscutting-concepts.md)      | Package format, engine, LLM, persistence, offline, UI, i18n, testing |
| 9   | [Architecture Decisions](./09-architecture-decisions.md)     | ADRs with context, decision and consequences                         |
| 10  | [Quality Requirements](./10-quality-requirements.md)         | Quality tree and concrete quality scenarios                          |
| 11  | [Risks and Technical Debt](./11-risks-and-technical-debt.md) | Known gaps, open format questions, accepted debt                     |
| 12  | [Glossary](./12-glossary.md)                                 | Domain and technical terms, including the German UI vocabulary       |

## Maintenance rules

1. **arc42 is the only documentation format in this repository.** New architecture documentation
   goes into one of the twelve chapters above — never into a new free-standing document, a new
   `docs/*.md`, or a growing `README.md`.
2. **One concept, one place.** If something is already described in a chapter, link to it instead
   of restating it. Duplicated prose is how this repository's documentation drifted before.
3. **Code comments reference sections** as `docs/arc42 §8.1.4` — the leading number is the chapter file.
   Keep the section numbers stable; if a section must be renumbered, update the references in the
   same commit (`grep -rn "docs/arc42" src/ scripts/ stories/`).
4. **Every architectural change updates its chapter in the same pull request.** A decision that
   changes a trade-off gets an ADR entry in chapter 9; a gap that is accepted rather than fixed
   gets an entry in chapter 11.
5. **Describe the code as it is**, not as it was planned. A chapter that documents an unimplemented
   intention belongs in chapter 11 (Risks and Technical Debt), clearly marked as open.
