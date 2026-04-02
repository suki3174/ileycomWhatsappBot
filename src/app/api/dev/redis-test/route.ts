import { NextResponse } from "next/server";
import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";

export async function GET() {
  try {
    const client = await ensureRedisConnected();
    const prefix = getRedisPrefix();
    const key = `${prefix}:health:test`;

    await client.set(key, "ok", { EX: 60 });
    const value = await client.get(key);
    const ping = await client.ping();

    return NextResponse.json({
      redis: "connected",
      ping,
      key,
      value,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { redis: "error", error: message },
      { status: 500 },
    );
  }
}
