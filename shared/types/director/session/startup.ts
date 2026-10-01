export interface DirectorStartupPreparation {
  strategy: "fast_start";
  routeWindow: {
    min: 3;
    target: 5;
    detailAhead: 1;
  };
  backgroundEnrichment: "after_first_draft";
}

export const DEFAULT_DIRECTOR_STARTUP_PREPARATION: DirectorStartupPreparation = {
  strategy: "fast_start",
  routeWindow: {
    min: 3,
    target: 5,
    detailAhead: 1,
  },
  backgroundEnrichment: "after_first_draft",
};
