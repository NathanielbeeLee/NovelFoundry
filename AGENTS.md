# NovelFoundry Agent Guide

These rules apply to this repository. Keep project configuration local; do not
change global Git settings or rules for other projects.

## Git Workflow and Commit Identity

- Work directly on `main` for normal product development, fixes, documentation,
  and upstream integration. Create another branch only when the user requests it.
- Both Git **author** and **committer** names must be exactly `gpd` for every
  commit, including phase commits, merges, amendments, and cherry-picks.
- Set `git config --local user.name gpd`. Preserve the configured email unless
  the user supplies a replacement; do not invent an address or change global config.
- Before committing, inspect both `git var GIT_AUTHOR_IDENT` and
  `git var GIT_COMMITTER_IDENT`, including environment overrides. Correct any
  mismatch before creating the commit.
- Commit each coherent completed phase, including small fixes and internal
  documentation, unless the user explicitly asks not to commit yet. Check the
  intended diff and follow the release-note workflow below before Git writes.
- A completed phase has appropriate verification or an explicitly documented
  verification gap, and contains only that phase's intended changes.
- Keep major workflow changes on `main` and increase verification depth as needed.
- For requested source integration, record the exact source ref in the local
  task entry before merging it into `main`; never merge `main` into that ref.
- History rewrites require explicit authorization and a verified recoverable
  Git backup. Synchronize an authorized rewrite with an exact `--force-with-lease`
  expectation. Ordinary commits and pushes must not rewrite history.

## Project Entry Points

- For capability, workflow, failure, ownership, and provenance questions, start
  from [the knowledge graph](docs/wiki/knowledge-graph/README.md). Use its
  [capability catalog](docs/wiki/knowledge-graph/capability-catalog.md),
  [question routing](docs/wiki/knowledge-graph/question-routing.md), and
  [source notes](docs/wiki/knowledge-graph/provenance.md) for the specific topic.
  Verify claims against current code and runtime evidence.
- Before claiming code origin or relicensing rights, consult the provenance
  notes and verify the relevant source and license evidence.
- For requested upstream updates or competitor adoption, read the local
  [task entry](./【任务入口】上游更新与竞品吸纳.md) and follow its workflow. Keep source comparisons,
  ledgers, and reports in ignored local records; maintained docs describe
  NovelFoundry. Editing documentation alone does not trigger a scan or merge.
- For formulaic prose, missing foreshadowing, or continuity drift, inspect the
  chapter evidence and owning module first. Then consult
  `.local-upstream-watch/decisions/writing-quality-and-long-context.md` when
  present. Explain which source approach fits the evidence; do not force one.
  Keep comparison details in that local record.

## Product Direction

- The primary target users of this project are complete writing beginners who do not understand fiction craft, structure, or novel production workflows.
- The product should help these users finish a full novel through AI guidance, AI-first decision support, or fully automated planning when appropriate.
- When making product, UX, planning, or agent behavior decisions, optimize for:
  - low cognitive load;
  - strong step-by-step guidance;
  - clear defaults and automatic recommendations;
  - end-to-end completion of a full-length novel, not just isolated writing assistance.
- Do not assume the primary user can manually repair structure, pacing, character arcs, or chapter planning without substantial AI support.
- If there is a tradeoff between expert-oriented flexibility and beginner completion rate, prefer the path that better helps a novice user successfully produce a complete novel.
- Prioritize stable director recovery and chapter production. Prefer fixing
  runtime, prompt, and projection contracts before adding UI workarounds.
- Add workflow branches only when they simplify the main completion path.
  Creative Hub must serve novel completion rather than become general chat.

## Data Protection (Highest Priority)

- Never execute any destructive data operation without a verified backup first.
- Destructive operations include (but are not limited to): deleting database files, `prisma migrate reset`, `db reset`, truncation, dropping tables, or any command that can remove existing data.
- Before any such operation, require:
  - explicit user approval for the destructive step;
  - a completed backup with a concrete backup path;
  - a quick restore validation (or at minimum a backup file existence/size check).
- If backup is missing or unverified, stop and do not proceed.

## AI-First System Rules (Highest Priority)

- This project is an AI-native application. For intent recognition, task classification, planning, routing, tool selection, and similar decision-making paths, AI-based structured understanding must be the primary implementation.
- Do not implement product-facing core behavior with fixed keyword matching, hard-coded regex routing, manual branch tables, or any non-AI fallback path when the problem is intended to be handled by AI.
- If AI intent recognition fails, treat it as an AI capability/problem to be fixed. Do not add fallback matching to hide the miss.
- Fixed judgments are only allowed as:
  - input validation or safety guards;
  - deterministic post-processing of already-structured AI output.
- When adding a new capability, first extend the AI schema / structured output / tool contract. Do not patch behavior by stacking special-case string rules.

## Auto-Director Quality Gate Rules (Highest Priority)

- Chapter audit, acceptance, and quality-loop results must not automatically block the global auto-director or full-book execution chain.
- Non-global chapter quality problems, including `local_patch_plan`, `continue_with_warning`, `patchable_obligation_gap`, `draft_obligation_unmet`, recoverable repair failures, and `defer_and_continue` quality debt, must be recorded as chapter-level quality debt or local repair guidance and allow the remaining chapter range to continue.
- Only an explicit `stop_for_replan`, `replan_required`, `recommendedAction=replan`, unrecoverable generation failure with no usable chapter content, or a runtime safety/data integrity failure may stop the global chain.
- Do not route local audit issues into `replanAlertDetails`, `PIPELINE_REPLAN_REQUIRED`, or the `replan_required` checkpoint unless the structured AI/runtime decision explicitly says the neighboring chapter plan must stop for replan.
- If local repair has already been attempted and residual issues remain but the chapter has usable content, prefer degraded finalization plus quality debt over failing the whole auto-director task.
- UI, task projection, and recovery logic must preserve this distinction: local quality debt is a visible warning and follow-up item, not a failed auto-director workflow.
- Book-level auto-director projections with `failed`, `blocked`, or `waiting_recovery` status and a latest task must remain visible in AI cockpit, task drawer, and recovery entrypoints even when the URL does not include `directorTaskId`; `workspaceTaskId` is a manual workspace lane and must never be used as a substitute director task id.

## UI Copy Rules

- All user-facing UI copy must explain the function from the user's perspective: what the user can do, what the system is helping with, or what the next step is.
- Do not write UI copy as implementation commentary, migration commentary, refactor commentary, or change-history commentary.
- Avoid product-facing copy that uses process/meta wording such as `现在`, `不再`, `已经`, `之前`, `原本`, `迁回`, `升级为`, or similar "we changed this" narration when the text is visible to end users.
- Prefer direct task wording such as:
  - entry point guidance;
  - action guidance;
  - expected effect;
  - current selection or current result.
- If a workflow belongs in another module, explain the correct user entry point directly, for example "从小说基础信息设置书级默认写法", rather than "书级默认写法已经迁回小说页".
- Before finishing UI work, review newly added copy and rewrite any sentence that sounds like it is talking to the developer or describing the modification process.

## Architecture Rules

- If a single source file becomes too long, it must be split into functional modules.
- Preferred threshold: keep a single source file around 600 lines.
- Floating range: 500-700 lines is acceptable when module cohesion is still clear and the file is not becoming hard to maintain.
- Hard threshold: when a source file exceeds 700 lines, refactoring and modularization are mandatory before continuing feature expansion.
- Long-file splitting must improve module boundaries, not merely reduce line count.
- Before splitting a long file, list its responsibilities and separate business rules, application orchestration, persistence/external adapters, and HTTP/API mapping.
- Do not split an oversized file by adding loose same-level files such as generic `helper`, `utils`, `shared`, or `runtime` files without clear module ownership.
- Extracted files must move into an explicit responsibility folder such as `domain/`, `application/`, `infrastructure/`, or `http/`, or into an existing business-stage folder with the same clarity of ownership.
- If a directory contains more than 12 `.ts` files, create or use a lower-level module directory before adding more peer files.
- If more than 4 files share the same feature prefix, for example `novelDirector*`, converge them into a dedicated feature directory instead of continuing the prefix-based flat layout.
- A `utils`, `helpers`, or `shared` file that grows beyond 300 lines or is depended on by more than 3 modules must be promoted into an owned service, policy, adapter, or domain module.
- After a split, outside modules should consume the capability through the module facade or `index.ts`; avoid deep imports into another module's internal files.
- If a split affects workflows, prompt/runtime contracts, automatic director chains, chapter execution chains, or other major novel-production links, add or update the module README or boundary notes before continuing feature expansion.
- For server-side architecture convergence, keep the current `server/src` structure runnable while gradually moving toward clear top-level ownership: `app/` for startup and route mounting, `platform/` for db/llm/events/runtime/config infrastructure, and `modules/` for product capabilities.
- Server business modules should be organized around the novel completion workflow when applicable: `setup`, `planning`, `production`, `director`, `characters`, `state`, and `export`.
- High-density server directories should be reduced incrementally. `routes` should converge into module-owned `http/` entrypoints, `services/novel` should keep only facades and stable shared entrypoints at its root, and `services/novel/director` should converge into owned submodules such as `commands`, `runtime`, `state`, `automation`, `projections`, `recovery`, and `phases`.
- Each architecture cleanup phase should move only one coherent subsystem, preserve compatibility exports where needed, check dependency direction, and run targeted TypeScript or service-level verification before the phase is considered complete.

## Prompt Governance

- `server/src/prompting/` is the only allowed entrypoint for adding new product-level prompts.
- Any new product-facing prompt must be implemented as a `PromptAsset` under `server/src/prompting/prompts/<family>/`.
- Any new product-facing prompt must be registered in `server/src/prompting/registry.ts` with explicit `id`, `version`, `taskType`, `mode`, `contextPolicy`, and `outputSchema` when structured.
- Do not add new business prompts by inlining `systemPrompt` / `userPrompt` inside service files and calling `invokeStructuredLlm`.
- Do not add new business prompts by calling raw `getLLM()` from service code unless the flow is an approved exception below.
- When touching an existing unregistered prompt path, default to migrating that prompt into `server/src/prompting/` instead of extending the old inline implementation.
- Approved exceptions are limited to:
  - JSON repair inside `server/src/llm/structuredInvoke.ts`
  - connectivity / probe prompts such as `server/src/llm/connectivity.ts`
  - phase-two flow adapters in `graphs/*`, `routes/chat.ts`, `services/novel/runtime/*`, and other stream bridge code explicitly kept outside the registry for now
- For naming and registration workflow, follow `server/src/prompting/README.md`.

## Verification Reuse Rules

- Prefer targeted verification that matches the actual change scope.
- For UI-facing project modifications, do not run browser, screenshot, Playwright, visual, or manual interaction verification by default; the user will perform UI acceptance testing. Use code-level checks such as typecheck or focused tests when they fit the change, and clearly state that UI verification is left to the user.
- If a recent build, typecheck, packaging check, or test run already covers the same code paths after the relevant files last changed, do not repeat the same expensive verification by default.
- Before reusing recent verification, confirm the evidence is recent, tied to the same branch or commit range, and not invalidated by subsequent changes.
- Build commands can take significant time. Avoid repeated `pnpm build`, `pnpm typecheck`, desktop packaging, or full test-suite runs when the current diff is documentation-only or already covered by a recent successful run.
- If verification is reused instead of rerun, state exactly what prior check is being trusted and why it still applies.
- If no suitable recent verification exists, or the change touches runtime contracts, prompt schemas, task recovery, database behavior, packaging, or cross-module product flow, run the narrowest sufficient check and document any skipped broader checks.

## Agent Collaboration Rules

- The project allows subagents to assist with development, investigation, verification, and documentation work when the active tool environment and higher-priority instructions permit it.
- Use subagents for well-scoped parallel work such as independent codebase exploration, focused implementation slices, documentation audits, or non-blocking verification.
- When delegating implementation, assign clear ownership of files or modules. Subagents must not revert or overwrite changes made by others.
- Do not use subagents to bypass project safety rules, data protection rules, branch workflow, prompt governance, or release-note / wiki requirements.
- Do not delegate destructive operations, database resets, migrations with data-loss risk, public release uploads, or branch promotion decisions.
- Integrate subagent output through normal review: inspect the diff, confirm it matches the current product and architecture rules, run or reuse appropriate verification, and document residual risk.

## Documentation Ownership

- Maintain durable architecture, workflow, runtime, prompt, retrieval, debugging,
  and beginner-product decisions in `docs/wiki/`. Explain the reason and current
  rule for future developers and agents; identify affected contracts and scope.
- Before completing a phase, significant fix, architecture or core-flow change,
  or any commit/push/PR, check whether the work adds durable knowledge. Update the
  relevant Wiki page and index when needed; otherwise state why no Wiki edit is
  needed. Do not duplicate a rule already owned by this guide or a module README.
- Favor director recovery, chapter production, state projections, Prompt Registry,
  Creative Hub boundaries, long-range context, and beginner completion decisions.
  Use the relevant folders under `docs/wiki/architecture`, `workflows`, `prompts`,
  `rag`, `debugging`, and `product`.
- Use English for maintained documentation. Keep the user-designated local task
  entry in its original language. Write actionable rules rather than vague advice.
- Wiki pages are not changelogs. Keep temporary TODOs, audits, handoffs, superseded
  plans, per-commit lists, and source comparisons in ignored local records.
- `docs/releases/` owns user-visible change history; README shows only the newest
  update. When behavior and durable contracts both change, update both owners.

## Release Notes and Update Identification

- Before any commit, push, or PR, use the `readme-release-updater` skill at
  `${CODEX_HOME:-~/.codex}/skills/readme-release-updater/SKILL.md`. If missing,
  recreate it with the workflow in this section before proceeding.
- Inspect the intended Git scope first. For user-visible changes, update
  `docs/releases/release-notes.md` as the complete history, preserve older dates,
  and merge same-day updates under one date heading.
- Sync README's `Latest update` section to only the newest merged date block and
  a link to the full history. Write capabilities and author outcomes, not internal
  file lists, prompt identifiers, schema details, or verification logs.
- For internal-only changes, skip both release-note surfaces and explicitly say
  no user-facing release note is needed.
- Product updates use dates such as `2026-10-16`. Do not introduce semantic release
  names or tags until the user explicitly chooses that transition. Desktop package
  uploads must separately follow the version/tag contract below.

## Desktop Packaging Upload Rules

- Public desktop package upload to GitHub Releases is allowed only when the release version is driven by `desktop/package.json` and the Git tag is exactly `vX.Y.Z`.
- Before any public desktop upload, verify that `desktop/package.json` `version` is a stable semver like `0.2.3`, with no `desktop-` prefix, no `-r1` style suffix, and no branch-only naming mixed into the version field.
- The pushed release tag must match `desktop/package.json` exactly after adding the `v` prefix. Example: `desktop/package.json` is `0.2.3`, then the only allowed public release tag is `v0.2.3`.
- Do not use `desktop-vX.Y.Z-rN`, `desktop-v*`, branch names, workflow dispatch on `main`, or any other non-matching ref as the identifier for a public desktop GitHub Release upload.
- If a build is triggered manually or from a non-matching tag, treat it as verification or packaging only. It must not be treated as a valid public release upload.
- If the required `vX.Y.Z` tag and `desktop/package.json` version are not aligned, stop before upload, fix the version/tag pair first, and then rerun the release flow.
- When packaging is requested and there is no explicit, current, repo-specific knowledge that local packaging is required, prefer triggering the GitHub-side packaging workflow rather than inventing local packaging steps.
- Do not run local desktop packaging just to guess the release process. Local packaging is appropriate only when the user explicitly asks for local artifacts, the task is packaging verification, or the relevant docs/scripts clearly require local staging.
- GitHub-side packaging still must obey the version/tag rules above. If the correct workflow, tag, branch, or version is unclear, stop and verify the release identifier before triggering packaging.
