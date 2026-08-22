import { readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AwsClient } from "aws4fetch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const ASSETS = [
  {
    source: "assets/images/self-understanding-map.png",
    key: "images/self-understanding-map.png",
    contentType: "image/png",
    cacheControl: "public, max-age=31536000, immutable",
  },
];

function loadDotEnv() {
  const envPath = path.join(rootDir, ".env");
  let raw;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Copy .env.example to .env or export the variable.`);
  }
  return value;
}

function stripTrailingSlash(url) {
  return url.replace(/\/$/, "");
}

function stripLeadingSlash(key) {
  return key.replace(/^\/+/, "");
}

function buildObjectEndpointUrl({ endpoint, bucketName }, key) {
  return `${stripTrailingSlash(endpoint)}/${bucketName}/${stripLeadingSlash(key)}`;
}

function buildPublicObjectUrl(publicUrl, key) {
  return `${stripTrailingSlash(publicUrl)}/${stripLeadingSlash(key)}`;
}

async function uploadAsset(client, config, asset) {
  const sourcePath = path.join(rootDir, asset.source);
  const file = readFileSync(sourcePath);
  const fileStat = await stat(sourcePath);
  const endpointUrl = buildObjectEndpointUrl(config, asset.key);

  const response = await client.fetch(endpointUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": asset.cacheControl,
      "Content-Length": String(fileStat.size),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Upload failed for ${asset.key}: ${response.status} ${response.statusText} ${detail}`.trim());
  }

  return buildPublicObjectUrl(config.publicUrl, asset.key);
}

async function main() {
  loadDotEnv();

  const config = {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucketName: requireEnv("R2_BUCKET_NAME"),
    endpoint: requireEnv("R2_ENDPOINT"),
    publicUrl: requireEnv("R2_PUBLIC_URL"),
  };

  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });

  for (const asset of ASSETS) {
    const url = await uploadAsset(client, config, asset);
    console.log(`uploaded ${asset.source} -> ${url}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
