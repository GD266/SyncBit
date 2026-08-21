import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  _request: VercelRequest,
  response: VercelResponse
) {
  const info = {
    name: "GrabAClip",
    version: process.env.npm_package_version ?? "0.1.0",
    environment: "production",
    platform: "vercel",
    arch: "serverless",
    dataDir: "/tmp",
    logLevel: "info",
  };
  return response.status(200).json(info);
}