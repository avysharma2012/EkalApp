import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Client scoped to the caller's JWT, used only to identify who is asking
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    const caller = userData.user;

    const { logId } = await req.json();
    if (!logId) {
      return new Response(JSON.stringify({ error: "logId is required" }), {
        status: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Admin client for reading full records (bypasses RLS; we enforce access manually below)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: log, error: logErr } = await admin
      .from("hour_logs")
      .select("*")
      .eq("id", logId)
      .single();
    if (logErr || !log) {
      return new Response(JSON.stringify({ error: "Hour log not found" }), {
        status: 404,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();
    const isAdmin = callerProfile?.role === "admin";

    if (log.user_id !== caller.id && !isAdmin) {
      return new Response(JSON.stringify({ error: "Not your certificate" }), {
        status: 403,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    if (log.status !== "approved") {
      return new Response(JSON.stringify({ error: "Certificate is only available for approved hours" }), {
        status: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const { data: volunteer } = await admin.from("profiles").select("*").eq("id", log.user_id).single();
    const reviewer = log.reviewed_by
      ? (await admin.from("profiles").select("*").eq("id", log.reviewed_by).single()).data
      : null;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([842, 595]); // A4 landscape
    const { width, height } = page.getSize();
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);

    const rust = rgb(0.76, 0.27, 0.05);
    const amber = rgb(0.88, 0.54, 0.24);
    const cream = rgb(1, 0.97, 0.93);

    page.drawRectangle({ x: 0, y: 0, width, height, color: cream });
    page.drawRectangle({
      x: 20, y: 20, width: width - 40, height: height - 40,
      borderColor: rust, borderWidth: 3,
    });
    page.drawRectangle({
      x: 30, y: 30, width: width - 60, height: height - 60,
      borderColor: amber, borderWidth: 1,
    });

    const centerText = (text: string, y: number, font = regular, size = 14, color = rgb(0.1, 0.1, 0.1)) => {
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
    };

    centerText("EKAL VOLUNTEERING APP", height - 100, bold, 30, rust);
    centerText("Certificate of Volunteer Service", height - 140, regular, 17, rgb(0.2, 0.2, 0.2));
    centerText("This certificate is proudly presented to", height - 185, regular, 12, rgb(0.35, 0.35, 0.35));
    centerText(volunteer?.name ?? "Volunteer", height - 225, bold, 26, rgb(0.07, 0.07, 0.07));

    const hoursLabel = Number(log.hours) === 1 ? "hour" : "hours";
    centerText(
      `for completing ${log.hours} volunteer ${hoursLabel} on ${formatDate(log.log_date)}`,
      height - 265, regular, 13, rgb(0.2, 0.2, 0.2)
    );
    centerText(`Activity: ${log.activity}`, height - 292, regular, 12, rgb(0.27, 0.27, 0.27));

    centerText(
      `Approved by ${reviewer?.name ?? "Ekal Administrator"} · Issued ${formatDate(new Date().toISOString())}`,
      55, regular, 10, rgb(0.45, 0.45, 0.45)
    );
    centerText(
      "Ekal Volunteering App — empowering underprivileged women and children in rural India through education.",
      38, regular, 9, rgb(0.55, 0.55, 0.55)
    );

    const pdfBytes = await pdf.save();

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ekal-certificate-${log.id}.pdf"`,
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Internal error generating certificate" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
