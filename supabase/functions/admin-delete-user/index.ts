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

    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "targetUserId is required" }), { status: 400, headers: corsHeaders(origin) });
    }

    // GLOBAL-06: an admin may never delete their own account via this path.
    if (targetUserId === caller.id) {
      return new Response(JSON.stringify({ error: "You cannot delete your own account" }), { status: 400, headers: corsHeaders(origin) });
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

    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("id, name, email, chapter_id")
      .eq("id", targetUserId)
      .single();
    if (targetErr || !target) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: corsHeaders(origin) });
    }

    // RBAC-02: a chapter admin may only delete users within their own chapter.
    if (isChapterAdmin && target.chapter_id !== callerRole!.chapter_id) {
      return new Response(JSON.stringify({ error: "You may only delete users in your own chapter" }), { status: 403, headers: corsHeaders(origin) });
    }

    // Write the audit entry BEFORE deleting — target_user_id must reference
    // a still-existing row at insert time. The FK is ON DELETE SET NULL, so
    // the entry (with the name/email captured in details) survives the
    // deletion that follows.
    await admin.from("audit_log").insert({
      actor_id: caller.id,
      action_type: "user_deleted",
      target_user_id: targetUserId,
      details: { name: target.name, email: target.email },
    });

    const { error: deleteErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteErr) {
      return new Response(JSON.stringify({ error: deleteErr.message }), { status: 500, headers: corsHeaders(origin) });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders(origin) });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Internal error deleting user" }), { status: 500, headers: corsHeaders(origin) });
  }
});
