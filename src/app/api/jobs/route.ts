import { NextResponse } from "next/server";
import { fetchJobFeed, type JobFeed } from "@/lib/jobs/providers";

// Live internship data from public job-board APIs (no API key, no student data sent).
// Configure in .env.local: JOB_GREENHOUSE_BOARDS=board1,board2  JOB_LEVER_COMPANIES=company1
const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; feed: JobFeed } | null = null;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (!refresh && cache && Date.now() - cache.at < TTL_MS) return NextResponse.json({ ...cache.feed, cached: true });
  const feed = await fetchJobFeed({ greenhouse: process.env.JOB_GREENHOUSE_BOARDS, lever: process.env.JOB_LEVER_COMPANIES });
  if (feed.configured) cache = { at: Date.now(), feed };
  return NextResponse.json({ ...feed, cached: false });
}
