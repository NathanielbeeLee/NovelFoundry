# Provider configuration and model discovery

The HTTP adapter maps provider settings, the application layer coordinates discovery,
and the secret store owns credentials. Other modules consume discovery through this
module's facade.

## Discovery history

Custom providers retain the most recent successful remote model list in `AppSetting`
under `provider.modelDiscovery.<provider>`. No schema migration is required. The record
contains model IDs, the discovery time, request start order, and a SHA-256 identity
of the provider incarnation, endpoint, credentials, authentication mode, and request
protocol. Neither credentials nor endpoint URLs are duplicated in this record or
returned as discovery metadata.

History is read only for the matching configuration. Manual default models are merged
at response time; hidden models are filtered without removing the current selection.
A missing `/models` endpoint or failed refresh must not replace successful history
with fallback data or advance its discovery time. A changed connection starts with
its manual model until successful discovery. History is an option list, not a promise
of current model availability or successful connectivity.

## Concurrent requests

Discovery uses a parameterized no-op API-key row write inside a transaction, then
verifies decoded identity/timestamps while holding the row lock through the history
update. Comparing decoded dates also supports legacy SQLite epoch timestamps. Deleted, recreated, or
modified providers reject responses from their earlier configuration. Request start
time prevents an older successful request from replacing a newer completed result.
The application re-reads the provider and history after remote work; a changed revision
returns a conflict, and an older same-configuration request returns the retained newer
list. Browser refreshes re-fetch custom provider settings rather than writing an async
response directly into current settings. Process-local model caches independently
partition credentials/authentication and reject out-of-order completions.

The conditional revision check deliberately rejects a pending discovery even when a
concurrent edit changes only a display name or selection. The caller can refresh again;
this conservative rule prevents stale configuration projections.

## Scope

Creation, settings save, and explicit refresh persist successful custom-provider
catalogs. Unsaved previews do not persist. Built-in catalogs keep their existing
behavior. The general model selector can use matching history as its offline fallback.
Deleting a provider removes matching history without erasing a recreated provider's
new discovery. Automated verification uses fixture persistence and mocked remote
responses; it does not probe configured provider accounts.
