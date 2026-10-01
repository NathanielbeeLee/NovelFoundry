import type { NovelApplicationServices } from "../NovelApplicationContracts";
import { NovelApplicationContext } from "./NovelApplicationContext";
import { NovelCharacterApplication } from "./NovelCharacterApplication";
import { NovelPlanningApplication } from "./NovelPlanningApplication";
import { NovelProductionApplication } from "./NovelProductionApplication";
import { NovelProjectApplication } from "./NovelProjectApplication";
import { NovelWorldApplication } from "./NovelWorldApplication";

export class DefaultNovelApplicationServices extends NovelApplicationContext {}

export interface DefaultNovelApplicationServices extends
  NovelProjectApplication,
  NovelProductionApplication,
  NovelPlanningApplication,
  NovelWorldApplication,
  NovelCharacterApplication {}

for (const capability of [
  NovelProjectApplication,
  NovelProductionApplication,
  NovelPlanningApplication,
  NovelWorldApplication,
  NovelCharacterApplication,
]) {
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(capability.prototype))) {
    if (name !== "constructor") {
      Object.defineProperty(DefaultNovelApplicationServices.prototype, name, descriptor);
    }
  }
}

export function createNovelApplicationServices(): NovelApplicationServices {
  return new DefaultNovelApplicationServices();
}
