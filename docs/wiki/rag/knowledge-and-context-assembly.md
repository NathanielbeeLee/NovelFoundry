# Knowledge and Context Assembly

Long-form production needs stable world, character, chapter, reference, style,
and continuity context. The Knowledge Base and Context Broker make that input
reusable and auditable.

## Ownership

Knowledge documents own versions, index state, and retrieval configuration.
Context Broker and resolvers choose, budget, filter, summarize, and assemble
context blocks. Prompt templates declare requirements; they do not query the
database directly.

## Retrieval order

Explicit document selection has priority, then project bindings, then enabled
global documents. An explicit `ownerTypes` scope is a hard limit. Book facts,
contracts, and chapter tasks remain higher priority than external references.

Vector and keyword retrieval run in parallel, then use fusion and optional
reranking. Reranking is fail-open and cannot be a hard dependency for basic
recall. Retrieval traces keep a digest, scope, candidate counts, hit summaries,
timings, and fallback markers without storing chunk text.

The chapter retrieval query also includes a bounded set of payoff titles from
the current chapter's structured directives. This helps find an older setup
passage when a due thread is relevant to the chapter mission. The query is a
recall hint: it does not authorize a reveal or replace the payoff operation,
reader-knowledge boundary, or source chapter. A missing payoff should be
diagnosed from the ledger and context trace before changing retrieval ranking
or increasing prompt size.

## Index and lifecycle rules

A document version must be indexed before it is searchable. Archiving is
recoverable and removes a document from default recall; restoring it queues a
new index build. Facets and chapter anchors must use one shared field contract
across local chunks and vector payloads.

## Failure diagnosis

Check active version, index completion, vector-store connectivity, scope,
budget, and resolver integration. A required context block may not be silently
dropped; preview and trace output must explain missing or discarded blocks.
