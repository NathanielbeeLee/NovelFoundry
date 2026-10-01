# Drama HTTP boundary

`dramaRoutes.ts` creates one router and registers projects, catalog, characters,
writing, exports, batches, storyboards, provider tasks, character images, and
image files in their original sequence.

Capability folders own request schemas and HTTP mapping. `request/contracts.ts`
holds shared parameter, model, and image-input validation. Existing services
and provider registries retain their singleton ownership.

Registrars receive the same Router instance. Preserve route precedence,
validation, response/status contracts, streaming, and error forwarding.
Compatibility image URLs still resolve through the existing image services;
the HTTP boundary does not own another generation or production pipeline.
