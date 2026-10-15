import { z } from "zod";

export const RESEARCH_INPUT_CHAR_LIMIT = 12_000;
export const RESEARCH_ADOPTION_LIMIT = 5;
export const researchAnchorSchema = z.object({
  findingId: z.string(), sourceId: z.string(), documentVersionId: z.string(),
  sourceTitle: z.string(), sourceUrl: z.string().nullable(), author: z.string().nullable(),
  accessedAt: z.string().nullable(), reliabilityReason: z.string(), contentHash: z.string(),
  claim: z.string().max(400), quote: z.string().max(600),
  startOffset: z.number().int().min(0), endOffset: z.number().int().min(1),
  uncertainty: z.string().max(300),
});
export type ResearchAnchor = z.infer<typeof researchAnchorSchema>;
export interface ResearchSourceInput {
  documentVersionId: string;
  expectedRevision: string | null;
  title: string;
  url?: string | null;
  author?: string | null;
  accessedAt?: string | null;
  reliabilityReason: string;
  enabled: boolean;
}
export interface ResearchSourceView {
  id: string;
  documentVersionId: string;
  title: string;
  url: string | null;
  author: string | null;
  accessedAt: string | null;
  reliabilityReason: string;
  enabled: boolean;
  revision: string;
  contentHash: string;
  fresh: boolean;
  findings: Array<ResearchAnchor & {
    fresh: boolean;
    adoptions: Array<{ novelId: string; novelTitle: string; revokedAt: string | null }>;
  }>;
}

export interface ResearchAdoptionView {
  findingId: string;
  documentId: string;
  sourceTitle: string;
  claim: string;
  fresh: boolean;
}
