import { sendAuthFlowToSeller } from "@/handlers/seller/sendBatch_handler";
import { type ExpiredSessionSeller, findExpiredSessionsForAuthPortal, markAuthPortalSent } from "@/repositories/auth/seller_repo";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 300;
const DEFAULT_MAX_PAGES = 10;
const MAX_MAX_PAGES = 50;
const FALLBACK_CRON_INTERVAL_MINUTES = 5;
const FALLBACK_LEAD_MINUTES = 15;
const MAX_LEAD_MINUTES = 24 * 60;

interface ResendRequestBody {
  pageSize?: number;
  maxPages?: number;
  leadMinutes?: number;
  dryRun?: boolean;
}

interface ResendExecutionOptions {
  pageSize: number;
  maxPages: number;
  leadMinutes: number;
  dryRun: boolean;
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded <= 0) return fallback;
  return Math.min(rounded, max);
}

function getEnvInt(name: string): number | null {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  if (rounded <= 0) return null;
  return rounded;
}

function getDefaultCronIntervalMinutes(): number {
  const interval = getEnvInt("AUTH_PORTAL_CRON_INTERVAL_MINUTES");
  if (interval === null) return FALLBACK_CRON_INTERVAL_MINUTES;
  return Math.min(interval, MAX_LEAD_MINUTES);
}

function getDefaultLeadMinutes(): number {
  const lead = getEnvInt("AUTH_PORTAL_LEAD_MINUTES");
  if (lead !== null) {
    return Math.min(lead, MAX_LEAD_MINUTES);
  }

  const interval = getDefaultCronIntervalMinutes();
  if (interval > 0) return interval;
  return FALLBACK_LEAD_MINUTES;
}

function isAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.AUTH_PORTAL_CRON_KEY || "").trim();
  if (!expected) return true;

  const headerKey = String(req.headers.get("x-cron-key") || "").trim();
  const authHeader = String(req.headers.get("authorization") || "").trim();
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  return headerKey === expected || bearer === expected;
}

function normalizeCandidate(seller: ExpiredSessionSeller): ExpiredSessionSeller {
  return {
    ...seller,
    name: String(seller.name || "Vendeur"),
    email: String(seller.email || ""),
    phone: String(seller.phone || "").trim(),
    code: seller.code ?? null,
    flow_token: seller.flow_token ?? null,
  };
}

async function runResendCycle(options: ResendExecutionOptions) {
  const { pageSize, maxPages, leadMinutes, dryRun } = options;

  let scanned = 0;
  let attempted = 0;
  let sent = 0;
  let marked = 0;
  const failures: Array<{ phone: string; reason: string }> = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const candidates = await findExpiredSessionsForAuthPortal(page, pageSize, leadMinutes);
    if (!candidates.length) break;

    scanned += candidates.length;

    for (const rawCandidate of candidates) {
      const seller = normalizeCandidate(rawCandidate);
      if (!seller.phone) {
        failures.push({ phone: "", reason: "missing_phone" });
        continue;
      }

      if (dryRun) continue;

      attempted += 1;
      try {
        await sendAuthFlowToSeller(seller);
        sent += 1;

        const markOk = await markAuthPortalSent(seller.phone);
        if (markOk) {
          marked += 1;
        } else {
          failures.push({ phone: seller.phone, reason: "mark_failed" });
        }
      } catch (err) {
        const reason = err instanceof Error && err.message ? err.message : "send_failed";
        failures.push({ phone: seller.phone, reason });
      }
    }

    if (candidates.length < pageSize) break;
  }

  return NextResponse.json({
    dryRun,
    pageSize,
    maxPages,
    leadMinutes,
    scanned,
    attempted,
    sent,
    marked,
    failed: failures.length,
    failures,
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ResendRequestBody = {};
  try {
    body = (await req.json()) as ResendRequestBody;
  } catch {
    body = {};
  }

  const defaultLeadMinutes = getDefaultLeadMinutes();
  const pageSize = parsePositiveInt(body.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxPages = parsePositiveInt(body.maxPages, DEFAULT_MAX_PAGES, MAX_MAX_PAGES);
  const leadMinutes = parsePositiveInt(body.leadMinutes, defaultLeadMinutes, MAX_LEAD_MINUTES);
  const dryRun = !!body.dryRun;

  return runResendCycle({ pageSize, maxPages, leadMinutes, dryRun });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const defaultLeadMinutes = getDefaultLeadMinutes();
  const { searchParams } = new URL(req.url);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxPages = parsePositiveInt(searchParams.get("maxPages"), DEFAULT_MAX_PAGES, MAX_MAX_PAGES);
  const leadMinutes = parsePositiveInt(searchParams.get("leadMinutes"), defaultLeadMinutes, MAX_LEAD_MINUTES);
  const dryRunParam = String(searchParams.get("dryRun") || "").toLowerCase();
  const dryRun = dryRunParam === "1" || dryRunParam === "true" || dryRunParam === "yes";

  return runResendCycle({ pageSize, maxPages, leadMinutes, dryRun });
}
