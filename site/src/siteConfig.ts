const configuredRepositoryUrl = (import.meta.env.VITE_PUBLIC_REPOSITORY_URL ?? "").trim();

export const publicRepositoryUrl = configuredRepositoryUrl.replace(/\/+$/, "");
export const publicReleaseUrl = publicRepositoryUrl ? `${publicRepositoryUrl}/releases/latest` : null;

export const publicRepositoryCoordinates = (() => {
  const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(publicRepositoryUrl);
  return match ? { owner: match[1], repo: match[2] } : null;
})();
