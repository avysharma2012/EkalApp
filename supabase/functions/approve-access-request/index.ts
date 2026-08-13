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

    // Identify the caller from their own JWT — a valid session alone is not
    // authorization (SEC-04); we re-check admin/chapter scope below.
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: corsHeaders(origin) });
    }
    const caller = userData.user;

    const { requestId, chapterId } = await req.json();
    if (!requestId) {
      return new Response(JSON.stringify({ error: "requestId is required" }), { status: 400, headers: corsHeaders(origin) });
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

    const { data: accessRequest, error: reqErr } = await admin
      .from("access_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    if (reqErr || !accessRequest) {
      return new Response(JSON.stringify({ error: "Access request not found" }), { status: 404, headers: corsHeaders(origin) });
    }
    if (accessRequest.status !== "pending") {
      return new Response(JSON.stringify({ error: "This request has already been reviewed" }), { status: 400, headers: corsHeaders(origin) });
    }

    // AREQ-04: chapter admins may only approve into their own chapter.
    const finalChapterId = isSuperAdmin ? (chapterId || accessRequest.chapter_id) : callerRole!.chapter_id;
    if (isChapterAdmin && chapterId && chapterId !== callerRole!.chapter_id) {
      return new Response(JSON.stringify({ error: "Chapter admins may only approve requests into their own chapter" }), { status: 403, headers: corsHeaders(origin) });
    }

    const { data: created, error: createErr } = await admin.auth.admin.inviteUserByEmail(accessRequest.email, {
      data: { name: accessRequest.name, chapter_id: finalChapterId },
    });
    if (createErr) {
      return new Response(JSON.stringify({ error: `Could not create account: ${createErr.message}` }), { status: 500, headers: corsHeaders(origin) });
    }

    const { error: updateErr } = await admin
      .from("access_requests")
      .update({ status: "approved", reviewed_by: caller.id, reviewed_at: new Date().toISOString(), chapter_id: finalChapterId })
      .eq("id", requestId);
    if (updateErr) {
      return new Response(JSON.stringify({ error: `Account created but could not mark request approved: ${updateErr.message}` }), { status: 500, headers: corsHeaders(origin) });
    }

    await admin.from("audit_log").insert({
      actor_id: caller.id,
      action_type: "access_approved",
      target_user_id: created.user?.id ?? null,
      target_id: String(requestId),
      details: { email: accessRequest.email, chapter_id: finalChapterId },
    });

    return new Response(JSON.stringify({ ok: true, userId: created.user?.id }), { status: 200, headers: corsHeaders(origin) });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Internal error approving access request" }), { status: 500, headers: corsHeaders(origin) });
  }
});
