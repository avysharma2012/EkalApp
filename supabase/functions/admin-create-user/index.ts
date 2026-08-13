import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

// Server-side mirror of the client's password policy (AUTH-06): the client
// gate can be bypassed, so this must be re-checked here regardless.
function meetsPasswordPolicy(pw: string): boolean {
  return (
    typeof pw === "string" &&
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: corsHeaders(origin) });
    }

    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: corsHeaders(origin) });
    }
    const caller = userData.user;

    const { name, email, password, chapterId } = await req.json();
    if (!name || !email || !password) {
      return new Response(JSON.stringify({ error: "name, email, and password are required" }), { status: 400, headers: corsHeaders(origin) });
    }
    if (!meetsPasswordPolicy(password)) {
      return new Response(
        JSON.stringify({ error: "Password does not meet the minimum policy (8+ chars, upper, lower, digit, special character)" }),
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role, chapter_id")
      .eq("user_id", caller.id)
      .maybeSingle();
    const isSuperAdmin = callerRole?.role === "super_admin";
    const isChapterAdmin = callerRole?.role === "chapter_admin";
    if (!isSuperAdmin && !isChapterAdmin) {
      return new Response(JSON.stringify({ error: "Admin privileges required" }), { status: 403, headers: corsHeaders(origin) });
    }

    // USER-02: chapter admins are restricted to their own chapter regardless
    // of what chapterId was requested.
    const finalChapterId = isSuperAdmin ? (chapterId || null) : callerRole!.chapter_id;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, chapter_id: finalChapterId },
    });
    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders(origin) });
    }

    await admin.from("audit_log").insert({
      actor_id: caller.id,
      action_type: "user_created",
      target_user_id: created.user?.id ?? null,
      details: { name, email, chapter_id: finalChapterId, created_by_admin: true },
    });

    return new Response(JSON.stringify({ ok: true, userId: created.user?.id }), { status: 200, headers: corsHeaders(origin) });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Internal error creating user" }), { status: 500, headers: corsHeaders(origin) });
  }
});
