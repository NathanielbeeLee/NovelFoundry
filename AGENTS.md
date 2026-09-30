# Safety Rules

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

## Product Context (Highest Priority)

- The primary target users of this project are complete writing beginners who do not understand fiction craft, structure, or novel production workflows.
- The product should help these users finish a full novel through AI guidance, AI-first decision support, or fully automated planning when appropriate.
- When making product, UX, planning, or agent behavior decisions, optimize for:
  - low cognitive load;
  - strong step-by-step guidance;
  - clear defaults and automatic recommendations;
  - end-to-end completion of a full-length novel, not just isolated writing assistance.
- Do not assume the primary user can manually repair structure, pacing, character arcs, or chapter planning without substantial AI support.
- If there is a tradeoff between expert-oriented flexibility and beginner completion rate, prefer the path that better helps a novice user successfully produce a complete novel.

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

## Project Development Wiki Rules

This project must continuously maintain a development wiki for architecture decisions, workflow rules, module boundaries, runtime contracts, debugging lessons, and product design rationale.

### Project Question Routing

- 用户要求“上游更新与竞品吸纳”“竞品优势吸纳任务”或引用对应运行手册时，先读取根目录 [【任务入口】上游更新与竞品吸纳.md](./【任务入口】上游更新与竞品吸纳.md)，按其中流程执行。该文件及扫描台账、报告只作为本地未跟踪工作资料；项目文档仅描述 NovelFoundry。仅整理文档不触发扫描或合并。
- For questions about this project's capabilities, workflows, failures, module ownership, or provenance, start from `docs/wiki/knowledge-graph/README.md`.
- Use `docs/wiki/knowledge-graph/capability-catalog.md` to locate the product entrypoint, backend owner, persistent assets, and deeper documentation.
- Use `docs/wiki/knowledge-graph/question-routing.md` to choose the narrowest relevant workflow or debugging evidence.
- Use `docs/wiki/knowledge-graph/provenance.md` before making a claim about code origin or relicensing rights.
- Treat the knowledge graph as a routing layer, not a substitute for current code, runtime state, database facts, or the specialist Wiki page.
- When the user reports formulaic prose, lost foreshadowing, or long-range continuity drift, inspect the current chapter evidence and owner first. Then consult `.local-upstream-watch/decisions/writing-quality-and-long-context.md` when it exists for relevant external approaches. Briefly tell the user which source approach is being considered and why; if none fits, diagnose from the project evidence without forcing a competitor pattern. Keep source-comparison details in that local document rather than public project Wiki pages.

The wiki is not a record of "what changed". It should help future developers and AI agents understand why the system is designed this way and how it should be maintained.

### What Should Be Documented

Document stable knowledge such as:

- Design boundaries for core modules such as auto-director, chapter production, Creative Hub, task center, RAG, and Prompt Registry.
- Important architecture decisions and their reasons.
- Runtime state contracts, stage transition rules, recovery rules, retry rules, and failure-handling rules.
- AI invocation conventions such as Prompt Schema, structured output, JSON repair, and context assembly.
- Module ownership, dependency direction, and boundaries that forbid cross-layer calls.
- Repeated failure modes, debugging conclusions, and recommended diagnosis paths.
- Product principles and UX decisions that help beginners complete a full novel.

### What Should Not Be Documented

Do not add wiki entries for:

- Tiny changes with no long-term value.
- Per-commit file modification lists.
- Temporary TODOs.
- Pure release-note content.
- Implementation details that are likely to be discarded soon.
- Narration that only says what changed in the current task.

### Wiki Writing Rules

- Use English for maintained repository documentation. Keep the user-designated local task entry in its original language.
- Write for future developers and future AI agents.
- Explain the reason behind a decision, not just the decision itself.
- Prefer sections such as `Background / Decision / Current Rule / Examples / Failure Modes / Related Modules / Source Documents`.
- Keep entries stable, clear, and actionable.
- Avoid vague wording such as "optimize later", "handle properly", or "improve this".
- If a rule affects auto-director, chapter production, Prompt, RAG, task state, or frontend projection, state the affected scope explicitly.

### Recommended Locations

- `docs/wiki/architecture/`: architecture design, module boundaries, dependency direction.
- `docs/wiki/workflows/`: auto-director, chapter production, recovery chain, task center, and other workflows.
- `docs/wiki/prompts/`: Prompt Registry, structured output, JSON repair, schema conventions.
- `docs/wiki/rag/`: embedding, vector retrieval, context assembly, knowledge-base rules.
- `docs/wiki/debugging/`: recurring failures, diagnosis paths, recovery methods.
- `docs/wiki/product/`: beginner-first decisions, full-novel completion, UX rationale.

### When To Update The Wiki

Before completing any of the following, check whether the work produced stable wiki-worthy knowledge:

- A development phase.
- A significant bug fix.
- An architecture adjustment.
- A core workflow change.
- A change to Prompt Schema, runtime state, task recovery, or the chapter production chain.
- A commit, push, or PR.

If stable knowledge was introduced or clarified, update the relevant wiki page before the phase is considered complete.

If no wiki update is needed, explicitly state that the change has no long-term wiki value and should remain only in code or release notes.

### Wiki And Release Notes Boundary

- Wiki records durable project knowledge.
- Release Notes record user-visible product changes.
- README latest update only shows the latest public-facing summary.
- Do not write the wiki as a changelog.
- Do not copy release notes into the wiki.
- If a change affects both user behavior and long-term architecture, update both release notes and the relevant wiki page.

### Novel Production Wiki Priority

These areas have the highest priority for wiki accumulation:

1. Auto-director runtime, recovery, checkpoints, and resume behavior.
2. Chapter production chain, including draft generation, review, repair, save, and retry rules.
3. Runtime state contracts between backend, task center, and frontend projections.
4. Prompt Registry rules, structured output schemas, and JSON repair boundaries.
5. Creative Hub boundaries: what it can create, when it should hand off to auto-director, and when it should avoid becoming general chat.
6. RAG and context assembly rules for worldbuilding, characters, chapters, style, and continuity.
7. Beginner-first product decisions that reduce cognitive load and help users complete a full novel.

## Agent Collaboration Rules

- The project allows subagents to assist with development, investigation, verification, and documentation work when the active tool environment and higher-priority instructions permit it.
- Use subagents for well-scoped parallel work such as independent codebase exploration, focused implementation slices, documentation audits, or non-blocking verification.
- When delegating implementation, assign clear ownership of files or modules. Subagents must not revert or overwrite changes made by others.
- Do not use subagents to bypass project safety rules, data protection rules, branch workflow, prompt governance, or release-note / wiki requirements.
- Do not delegate destructive operations, database resets, migrations with data-loss risk, public release uploads, or branch promotion decisions.
- Integrate subagent output through normal review: inspect the diff, confirm it matches the current product and architecture rules, run or reuse appropriate verification, and document residual risk.

## Verification Reuse Rules

- Prefer targeted verification that matches the actual change scope.
- For UI-facing project modifications, do not run browser, screenshot, Playwright, visual, or manual interaction verification by default; the user will perform UI acceptance testing. Use code-level checks such as typecheck or focused tests when they fit the change, and clearly state that UI verification is left to the user.
- If a recent build, typecheck, packaging check, or test run already covers the same code paths after the relevant files last changed, do not repeat the same expensive verification by default.
- Before reusing recent verification, confirm the evidence is recent, tied to the same branch or commit range, and not invalidated by subsequent changes.
- Build commands can take significant time. Avoid repeated `pnpm build`, `pnpm typecheck`, desktop packaging, or full test-suite runs when the current diff is documentation-only or already covered by a recent successful run.
- If verification is reused instead of rerun, state exactly what prior check is being trusted and why it still applies.
- If no suitable recent verification exists, or the change touches runtime contracts, prompt schemas, task recovery, database behavior, packaging, or cross-module product flow, run the narrowest sufficient check and document any skipped broader checks.

## NovelFoundry Main Development Workflow

- `main` is NovelFoundry's default development and integration branch. Fixes, new features, documentation updates, and upstream merges intended for the customized product must be made and committed directly on `main`.
- Do not create temporary `feature/*`, `fix/*`, `codex/*`, or `beta-fix` branches for normal `main` work unless the user explicitly requests a separate branch for a specific task.
- Use this direct-development workflow for the customized product; historical source-project branch procedures belong in local archives.
- Keep source-comparison details in the local task entry rather than public project documentation. If the user requests an update from the original codebase, follow that entry and record the exact source ref before merging into `main`. Never merge `main` into the source reference.
- For phased development, making an intentional commit after each completed development phase is mandatory. A phase is complete when its scope is coherent, the relevant verification has passed or the remaining verification gap is explicitly documented, and the working tree contains only that phase's intended changes.
- This phase-completion commit rule also applies to small isolated fixes, documentation-only updates, workflow-rule updates, and low-risk UI polish unless the user explicitly says not to commit yet.
- Before each phase commit, inspect the Git scope and follow the README Release Notes Workflow when the phase has user-facing impact. If the diff is purely internal, document that release notes were intentionally skipped.
- For changes that touch cross-stage workflows, shared runtime/prompting/context contracts, automatic director chains, chapter execution chains, data migration behavior, or other major links, stay on `main` and increase the verification depth instead of creating another branch.

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

## README Release Notes Workflow

- Before any commit, push, or PR step in this repository, use the `readme-release-updater` skill from `${CODEX_HOME:-~/.codex}/skills/readme-release-updater` to inspect the Git scope, summarize the user-visible changes, update `docs/releases/release-notes.md`, and refresh `README.md` `## 最新更新` when applicable.
- If the `readme-release-updater` skill does not exist in the expected Codex skills directory, create it first before any commit, push, or PR step instead of skipping the workflow.
- When creating that skill, place it under `${CODEX_HOME:-~/.codex}/skills/readme-release-updater/` with a `SKILL.md` that explicitly instructs the agent to:
  - inspect the pending Git scope for the intended commit, push, or PR, including enough status/diff context to understand the user-visible change;
  - decide whether the diff has clear user-facing impact or is purely internal;
  - update `docs/releases/release-notes.md` as the canonical full history, preserving older entries and merging multiple updates for the same date under one date heading;
  - refresh `README.md` `## 最新更新` so it shows only the newest merged date block plus a link to `docs/releases/release-notes.md`, instead of accumulating historical sections;
  - write release summaries from the user's perspective, focusing on visible capabilities, workflow improvements, and product behavior rather than file paths, refactors, or test-only details;
  - skip noisy release-note edits when the current diff is purely internal and clearly say that no user-facing release note update is needed.
- The `readme-release-updater` skill should also tell the agent to keep the repository's date-based release format, for example `### 2026-04-07`, and not introduce semantic versions unless the user explicitly requests a versioning transition.
- If the skill is newly created in another terminal, verify that its `SKILL.md` contains the workflow above before continuing with the Git write step.
- When the user asks to commit or push code, inspect the Git scope for that push and update `docs/releases/release-notes.md` first, then sync `README.md` before the Git write step if the change set has clear user-facing impact.
- `docs/releases/release-notes.md` is the complete user-facing update history and should preserve older entries.
- `README.md` is only the latest update surface and must keep a link to `docs/releases/release-notes.md`; do not let `README.md` accumulate multiple historical date blocks.
- When a new update is recorded, keep full history in `docs/releases/release-notes.md` and make `README.md` show only the newest merged date block plus the history link.
- If multiple user-visible updates are recorded on the same date, merge them under the same date heading in `docs/releases/release-notes.md`; `README.md` should keep only that date's latest merged summary.
- If the current diff is purely internal and has no clear user-facing impact, state that explicitly and skip both release-note updates instead of forcing a noisy entry.
- Write both release-note surfaces from the user's perspective: describe capabilities, workflow improvements, and visible product behavior instead of file names, route names, service names, tests, or refactor details.
- Release notes and README latest updates must read like normal user-facing product notes, not developer acceptance notes. Avoid raw implementation vocabulary such as internal prompt ids, schema names, JSON repair terms, enum aliases, database/API details, test names, or "we changed this" process narration unless the user must see that exact UI label to use the product. Translate technical work into the user outcome, for example "章节规划失败后会给 AI 更明确的重试方向" instead of "补齐 JSON skeleton 和 schema preprocess".

## Release Identification Rules

- For now, this project continues to use `date-based` release/update identification. Do not introduce formal semantic version numbers unless the user explicitly decides to switch.
- `docs/releases/release-notes.md`, `README.md` `## 最新更新`, release summaries, and other user-facing update records should continue to use the existing date-first format, for example: `### 2026-04-07`.
- Keep the date as the primary update identifier until the product workflow, information architecture, and release cadence are stable enough to justify a formal versioning system.
- If multiple user-visible updates are recorded on the same date, keep them under the same date heading in `docs/releases/release-notes.md` and distinguish them by clear summary text instead of inventing temporary version numbers.

## Current Product Priorities

1. Stabilize auto-director recovery and chapter production chain.
2. Keep beginner-first full-novel completion as the main product goal.
3. Avoid introducing new workflow branches unless they simplify the main production path.
4. Prefer fixing runtime contracts, prompt schemas, and state projections before adding UI-only patches.
5. Do not expand Creative Hub into a general chat tool unless it directly supports novel completion.

### Future Versioning Transition

- When the user later decides the product is stable enough for formal versions, versioning can transition from `date-only` to `version number + date`.
- Until that explicit transition happens, do not add `v0.x.y`, tags, or release naming conventions into README, changelog, or other product-facing release notes by default.
