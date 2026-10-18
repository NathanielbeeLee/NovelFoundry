// Pure persistence facade: importing CAS validation must not initialize a model or database.
export { buildContentHash } from "./domain/ChapterSourceIdentity";
export { invalidateManualChapterProjections } from "./infrastructure/ManualChapterProjectionInvalidation";
