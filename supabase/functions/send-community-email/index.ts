const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // This function should only be invoked by the trusted create-community-post function.
  const auth = req.headers.get("Authorization") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from) return json({ error: "Secret RESEND_API_KEY atau RESEND_FROM_EMAIL belum diatur." }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const to = String(body.to ?? "").trim().toLowerCase();
  const nickname = String(body.nickname ?? "Pemain ML").slice(0, 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "Alamat email tidak valid." }, 400);

  const categoryLabel = body.category === "looking_for_party" ? "Cari Teman Mabar" : "Tukaran Like";
  const safeNickname = nickname.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Postingan ML Squad berhasil dibuat",
      html: `<div style="margin:0;background:#0b1020;padding:32px 12px;font-family:Arial,sans-serif;color:#eef3ff"><div style="max-width:520px;margin:auto;background:#131b2e;border:1px solid #2a3650;border-radius:16px;padding:28px"><div style="font-weight:800;letter-spacing:2px;color:#56e0d0">ML SQUAD</div><h1 style="font-size:24px;margin:22px 0 8px">Postinganmu sudah tayang!</h1><p style="color:#a5b1c8;line-height:1.7">Hai ${safeNickname}, postingan <b>${categoryLabel}</b> berhasil dibuat dan masuk ke papan komunitas.</p><p style="color:#8291aa;font-size:12px">ID referensi: ${String(body.postId ?? "").replace(/[^a-zA-Z0-9-]/g, "")}</p><div style="margin-top:24px;padding:14px;background:#0b1020;border-radius:10px;color:#a5b1c8;font-size:12px">Jaga sportivitas dan jangan pernah membagikan password atau OTP akun game.</div></div><p style="text-align:center;color:#62718b;font-size:11px">ML Squad · Komunitas independen penggemar MLBB</p></div>`
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return json({ error: "Resend gagal mengirim email.", details: result }, 502);
  return json({ success: true, id: result.id });
});