import { NextResponse } from "next/server";
import { createSessionToken, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "APP_PASSWORD is not configured on the server" }, { status: 500 });
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !safeEqual(password, expected)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
