import { resolvePlanParticipants } from "@novelfoundry/shared/types/chapterRuntime";
import { parseJsonStringArray } from "../../novelP0Utils";

export function resolveChapterResourceCharacterIds(input: {
  plan: { participantsJson?: string | null } | null | undefined;
  characters: Array<{ id: string; name: string }>;
}): string[] {
  return resolvePlanParticipants(
    parseJsonStringArray(input.plan?.participantsJson ?? null), input.characters,
  ).characters.map((item) => item.id);
}
