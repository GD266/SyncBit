import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchYouTubeMetadata } from "../src/services/youtube-provider";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const { url } = request.body as { url?: string };

  if (!url || typeof url !== "string") {
    return response.status(400).json({ error: "URL is required" });
  }

  try {
    const metadata = await fetchYouTubeMetadata(url);
    return response.status(200).json(metadata);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    let code = "metadata_error";
    if (message.includes("not a valid YouTube")) code = "unsupported_url";
    if (message.includes("not publicly playable") || message.includes("not publicly available")) code = "unauthorized_content";
    if (message.includes("exceeds size limit") || message.includes("HTTP")) code = "backend_error";
    return response.status(400).json({ error: message, code });
  }
}