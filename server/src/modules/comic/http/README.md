# Comic HTTP boundary

`comicRoutes.ts` creates one router and registers capability routes in their
original sequence. Projects, episodes, facts, panel scripts, character images,
panel images, exports, batches, character assets, and scenes each own their
request schemas and HTTP mapping.

`request/contracts.ts` holds shared parameter and image-input validation.
`infrastructure/serviceInstances.ts` owns the three router-scoped service
instances; existing singleton services remain with their service modules.

Registrars receive the same Router instance. Do not substitute nested routers
or reorder registrations without checking path precedence and middleware.
Keep status codes, validation, response shapes, file streaming, and error
forwarding in this HTTP boundary; generation and persistence stay in services.
