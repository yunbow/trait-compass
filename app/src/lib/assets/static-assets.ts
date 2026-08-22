export const SELF_UNDERSTANDING_MAP_KEY = "images/self-understanding-map.png";

const DEFAULT_LOCAL_R2_PUBLIC_URL = "http://localhost:19000/trait-compass";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export function getPublicAssetUrl(key: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL ?? DEFAULT_LOCAL_R2_PUBLIC_URL;
  return `${stripTrailingSlash(publicUrl)}/${key.replace(/^\/+/, "")}`;
}

export const SELF_UNDERSTANDING_MAP_URL = getPublicAssetUrl(SELF_UNDERSTANDING_MAP_KEY);
