# Desktop Release Versioning

Public desktop releases are identified by a stable semver in `desktop/package.json` and a matching Git tag `vX.Y.Z`. Branch names and non-matching tags are verification refs, not public release identifiers.

Verify the version/tag pair before triggering packaging or upload. Packaging should run from a verified release state after the pre-release branch has passed its checks.
