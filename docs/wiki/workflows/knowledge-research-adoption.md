# Optional research adoption

## Background and decision

Historical and real-world fiction may need traceable external facts. Document
versioning proves which text was read, but does not explain a claim's provenance
or whether an author wants it used. Keep source metadata, AI findings and author
adoptions separate in the knowledge module. Research is optional; beginners do
not acquire a required research stage.

## Source and extraction

A source card belongs to one immutable knowledge-document version and records
its title, location, author, access time and the author's reliability reasoning.
These fields are not a fact-checking certificate. One complete document of up to
12,000 UTF-16 units is passed to the registered AI extractor; over-budget input
is rejected rather than truncated. Quotes and offsets are grounded against that
exact text, and every finding records limitations. Extraction failure preserves
prior evidence. No web fetch, graph database or ontology import is implied.

Changing source metadata or regenerating findings creates a new source revision.
Earlier findings and adoptions remain inspectable history and become inactive
for context. Switching the active document version, disabling the source or
archiving the document likewise prevents stale references from being injected.

## Adoption and context

An author explicitly adopts or revokes a finding for a novel. The source and
novel are checked and locked before the change; per-novel limits are enforced
under the same transaction. At most five active selections are allowed so a
small optional pilot cannot exhaust the writing context. Revoke stale selections
before adopting replacements. Unselected findings never enter writing context.

Fresh adopted findings feed chapter writing, review and repair as a required,
non-summarizable `research_anchors` block with source identity, quote and
uncertainty. This is the chapter planning/execution handoff, not permission to
rewrite existing volume plans or silently replace canonical story facts. The AI
considers relevance and preserves established fiction. A missing external
reference is not itself a global quality stop.

## Persistence and maintenance

`KnowledgeResearchSource`, `KnowledgeResearchFinding` and
`KnowledgeResearchAdoption` belong to `services/knowledge/research/`; consumers
use its public facade or pure contracts entrypoint. PostgreSQL and SQLite use
matching additive, repeat-safe migrations. They do not modify existing document
or manuscript content. Normal runtime migration/deployment procedures apply;
implementation verification uses an isolated temporary database.

If the pilot needs multi-source synthesis, large catalogs or automatic research,
extend the structured AI and adoption contract before expanding the workflow.
Keep attribution and direct-reuse rights separate from source credibility.
