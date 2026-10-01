import { Router } from "express";
import { registerDramaProjectsRoutes } from "./projects/registerRoutes";
import { registerDramaCatalogRoutes } from "./catalog/registerRoutes";
import { registerDramaCharactersRoutes } from "./characters/registerRoutes";
import { registerDramaWritingRoutes } from "./writing/registerRoutes";
import { registerDramaExportsRoutes } from "./exports/registerRoutes";
import { registerDramaBatchesRoutes } from "./batches/registerRoutes";
import { registerDramaStoryboardsRoutes } from "./storyboards/registerRoutes";
import { registerDramaVideoTasksRoutes } from "./videoTasks/registerRoutes";
import { registerDramaCharacterImagesRoutes } from "./characterImages/registerRoutes";
import { registerDramaImageFilesRoutes } from "./imageFiles/registerRoutes";

const router = Router();

registerDramaProjectsRoutes(router);
registerDramaCatalogRoutes(router);
registerDramaCharactersRoutes(router);
registerDramaWritingRoutes(router);
registerDramaExportsRoutes(router);
registerDramaBatchesRoutes(router);
registerDramaStoryboardsRoutes(router);
registerDramaVideoTasksRoutes(router);
registerDramaCharacterImagesRoutes(router);
registerDramaImageFilesRoutes(router);

export default router;
