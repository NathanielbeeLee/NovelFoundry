import { z } from "zod";

export const novelRouteForecastSchema = z.object({
  recommendedRouteId: z.string().trim().min(1).max(40),
  comparisonSummary: z.string().trim().min(20).max(500),
  routes: z.array(z.object({
    id: z.string().trim().min(1).max(40),
    title: z.string().trim().min(2).max(40),
    coreMove: z.string().trim().min(20).max(300),
    chapterBeats: z.array(z.object({
      chapterOffset: z.number().int().min(0).max(4),
      objective: z.string().trim().min(8).max(160),
      conflict: z.string().trim().min(8).max(160),
      turningPoint: z.string().trim().min(8).max(160),
      hook: z.string().trim().min(8).max(160),
    }).strict()).min(2).max(5),
    characterChoices: z.array(z.object({
      character: z.string().trim().min(1).max(40),
      choice: z.string().trim().min(6).max(140),
      consequence: z.string().trim().min(6).max(160),
    }).strict()).min(1).max(5),
    expectedChanges: z.array(z.string().trim().min(6).max(160)).min(1).max(6),
    readerPayoff: z.string().trim().min(10).max(220),
    fitScore: z.number().int().min(0).max(100),
    noveltyScore: z.number().int().min(0).max(100),
    continuityScore: z.number().int().min(0).max(100),
    fitReason: z.string().trim().min(10).max(240),
    risks: z.array(z.object({
      level: z.enum(["low", "medium", "high"]),
      summary: z.string().trim().min(6).max(160),
      mitigation: z.string().trim().min(6).max(180),
    }).strict()).min(1).max(4),
  }).strict()).min(2).max(5),
}).strict();
