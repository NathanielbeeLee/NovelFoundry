// Lightweight, owned persistence facade: no application services or external adapters.
export { polishPrisma, currentPolishScope, runInPolishScope } from "./infrastructure/polish/PolishPersistence";
export type { PolishScope } from "./infrastructure/polish/PolishPersistence";
