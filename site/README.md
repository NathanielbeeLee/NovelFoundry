# NovelFoundry documentation site

This package builds the public documentation site from the maintained Markdown
files under `docs/public/` and the manifest in `src/docsManifest.ts`.

The [public site design contract](../docs/wiki/product/public-site-design.md)
describes the visual direction, documentation navigation, and copy rules.

## Local development

```bash
pnpm --filter @novelfoundry/site dev
pnpm --filter @novelfoundry/site typecheck
pnpm --filter @novelfoundry/site build
```

The build generates a sitemap and prerendered routes. The generated sitemap is
ignored until the independent public site domain and repository path are
configured.

## Public deployment variables

The GitHub Pages workflow supplies these values from the repository context:

- `SITE_ORIGIN`: the public site origin, such as `https://owner.github.io`;
- `SITE_BASE_PATH`: the repository path, such as `/NovelFoundry`;
- `VITE_PUBLIC_REPOSITORY_URL`: the public repository URL, such as
  `https://github.com/owner/NovelFoundry`.

Do not hard-code a repository URL in the site. Before publication,
configure `VITE_PUBLIC_REPOSITORY_URL` in the deployment environment so GitHub
links, release links, star counts, canonical URLs, and source links become
active together.

The application shell also reads `VITE_PUBLIC_REPOSITORY_URL`. Its GitHub link
is hidden until a public repository URL is configured for the client build.

The Pages workflow runs from `main` only after the repository variable
`NOVELFOUNDRY_PUBLICATION_ENABLED` is set to `true` in the independent
repository. Leave it unset while publication is paused.
