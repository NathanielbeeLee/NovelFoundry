import { Router } from "express";
import { registerComicProjectsRoutes } from "./projects/registerRoutes";
import { registerComicEpisodesRoutes } from "./episodes/registerRoutes";
import { registerComicFactsRoutes } from "./facts/registerRoutes";
import { registerComicPanelScriptsRoutes } from "./panelScripts/registerRoutes";
import { registerComicCharacterImagesRoutes } from "./characterImages/registerRoutes";
import { registerComicPanelImagesRoutes } from "./panelImages/registerRoutes";
import { registerComicExportsRoutes } from "./exports/registerRoutes";
import { registerComicBatchesRoutes } from "./batches/registerRoutes";
import { registerComicCharacterAssetsRoutes } from "./characterAssets/registerRoutes";
import { registerComicScenesRoutes } from "./scenes/registerRoutes";

const router = Router();

registerComicProjectsRoutes(router);
registerComicEpisodesRoutes(router);
registerComicFactsRoutes(router);
registerComicPanelScriptsRoutes(router);
registerComicCharacterImagesRoutes(router);
registerComicPanelImagesRoutes(router);
registerComicExportsRoutes(router);
registerComicBatchesRoutes(router);
registerComicCharacterAssetsRoutes(router);
registerComicScenesRoutes(router);

export default router;
