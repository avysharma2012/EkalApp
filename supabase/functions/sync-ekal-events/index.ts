import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMParser } from "npm:linkedom@0.16.11";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EKAL_EVENTS_URL = "https://www.ekal.org/events";

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

interface ParsedEvent {
  title: string;
  event_date: string;
  event_time: string | null;
  city: string | null;
  state: string | null;
  event_type: string | null;
  chapter_label: string | null;
  external_url: string;
}

function parseEventCards(html: string): { events: ParsedEvent[]; errors: string[] } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = [...doc.querySelectorAll('a[href*="/event/"]')];
  const events: ParsedEvent[] = [];
  const errors: string[] = [];

  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const title = link.querySelector("h4")?.textContent?.trim() || "";
    const day = link.querySelector(".bg_orange b")?.textContent?.trim() || "";
    const monthYear = link.querySelector(".bg_orange p")?.textContent?.trim() || "";

    if (!title || !day || !monthYear) {
      errors.push(`Skipped a card near "${title || href}" — missing title or date badge`);
      continue;
    }

    const monthMatch = monthYear.match(/([a-z]{3})\s*(\d{4})/i);
    const monthKey = monthMatch?.[1]?.toLowerCase();
    const year = monthMatch?.[2];
    const month = monthKey ? MONTHS[monthKey] : undefined;
    const dayNum = day.padStart(2, "0");
    if (!month || !year || !/^\d{1,2}$/.test(day)) {
      errors.push(`Skipped "${title}" — could not parse date "${day} ${monthYear}"`);
      continue;
    }
    const eventDate = `${year}-${month}-${dayNum}`;

    const detailText = link.querySelector(".event_details p")?.textContent || "";
    const timeMatch = detailText.match(/(\d{1,2}:\d{2}\s*[ap]m)/i);
    const eventTime = timeMatch ? convertTo24Hour(timeMatch[1]) : null;

    const boldTags = [...(link.querySelectorAll(".event_details p b") || [])].map((b: any) => b.textContent?.trim());
    const city = boldTags[0] || null;
    const state = boldTags[1] || null;

    const badges = [...link.querySelectorAll("ul li .badge")].map((b: any) => b.textContent?.trim());
    const eventType = badges[0] && ["Fundraising", "Workshop", "Community Service", "Educational", "Event", "Conference"].includes(badges[0])
      ? badges[0]
      : null;
    const chapterLabel = badges[1] || null;

    events.push({
      title,
      event_date: eventDate,
      event_time: eventTime,
      city,
      state,
      event_type: eventType,
      chapter_label: chapterLabel,
      external_url: href,
    });
  }

  return { events, errors };
}

function convertTo24Hour(time: string): string {
  const match = time.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return time;
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = match[3].toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}:00`;
}

function matchChapter(chapters: any[], label: string | null): string | null {
  if (!label) return null;
  const [namePart, statePart] = label.split(",").map((s) => s.trim().toLowerCase());
  const byName = chapters.find((c) => c.name.trim().toLowerCase() === namePart);
  if (byName) return byName.id;
  if (statePart) {
    const byState = chapters.find((c) => !c.parent_id && !c.is_unassigned && c.state?.trim().toLowerCase() === statePart);
    if (byState) return byState.id;
  }
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: corsHeaders(origin) });
    }

    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: corsHeaders(origin) });
    }
    const caller = userData.user;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Restricted to super admins: a sync spans events across every chapter,
    // outside any single chapter admin's scope (RBAC-02/03).
    const { data: callerRole } = await admin.from("user_roles").select("role").eq("user_id", caller.id).maybeSingle();
    if (callerRole?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Only a super admin can sync events from Ekal.org" }), { status: 403, headers: corsHeaders(origin) });
    }

    const pageRes = await fetch(EKAL_EVENTS_URL, { headers: { "User-Agent": "Mozilla/5.0 (compatible; EkalVolunteeringApp/1.0)" } });
    if (!pageRes.ok) {
      return new Response(JSON.stringify({ error: `Could not fetch ekal.org/events (status ${pageRes.status})` }), { status: 502, headers: corsHeaders(origin) });
    }
    const html = await pageRes.text();

    const { events: parsed, errors: validationErrors } = parseEventCards(html);
    const { data: chapters } = await admin.from("chapters").select("id, name, state, parent_id, is_unassigned");

    let inserted = 0;
    let updated = 0;

    for (const ev of parsed) {
      const chapterId = matchChapter(chapters || [], ev.chapter_label);
      const payload = {
        title: ev.title,
        event_date: ev.event_date,
        event_time: ev.event_time,
        city: ev.city,
        state: ev.state,
        event_type: ev.event_type,
        chapter_id: chapterId,
        external_url: ev.external_url,
        created_by: caller.id,
      };

      const { data: byUrl } = await admin.from("events").select("id").eq("external_url", ev.external_url).maybeSingle();
      let existingId = byUrl?.id;

      if (!existingId) {
        const { data: byTitleDate } = await admin
          .from("events")
          .select("id")
          .ilike("title", ev.title)
          .eq("event_date", ev.event_date)
          .maybeSingle();
        existingId = byTitleDate?.id;
      }

      if (existingId) {
        await admin.from("events").update(payload).eq("id", existingId);
        updated++;
      } else {
        await admin.from("events").insert(payload);
        inserted++;
      }
    }

    await admin.from("audit_log").insert({
      actor_id: caller.id,
      action_type: "events_synced",
      details: { inserted, updated, total: parsed.length, validation_errors: validationErrors.length },
    });

    return new Response(
      JSON.stringify({ ok: true, inserted, updated, total: parsed.length, validationErrors }),
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Internal error syncing events: " + (e as Error).message }), { status: 500, headers: corsHeaders(origin) });
  }
});
