import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function isAuthenticated() {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** Use at the top of every protected server component / route handler. */
export async function requireAuth() {
  if (!(await isAuthenticated())) redirect("/login");
}

/** For API routes: returns a 401 Response when not signed in, otherwise null. */
export async function guardApi() {
  if (!(await isAuthenticated())) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
