import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Konfigurasi backend belum lengkap." }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Format data tidak valid." }, 400); }

  const nickname = String(body.nickname ?? "").trim();
  const ml_id = String(body.ml_id ?? "").trim();
  const zone_id = String(body.zone_id ?? "").trim();
  const category = body.category;
  const note = String(body.note ?? "").trim();
  const email = body.email_consent ? String(body.email ?? "").trim().toLowerCase() : null;
  if (nickname.length < 1 || nickname.length > 40) return json({ error: "Nickname harus 1–40 karakter." }, 400);
  if (!/^\d{3,24}$/.test(ml_id)) return json({ error: "ID ML harus berupa 3–24 angka." }, 400);
  if (!/^\d{1,12}$/.test(zone_id)) return json({ error: "Zone ID harus berupa angka." }, 400);
  if (!["like_exchange", "looking_for_party"].includes(category)) return json({ error: "Kategori tidak valid." }, 400);
  if (note.length > 240) return json({ error: "Catatan maksimal 240 karakter." }, 400);
  if (body.email_consent && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return json({ error: "Alamat email tidak valid." }, 400);

  const ownerToken = crypto.randomUUID() + "-" + crypto.randomUUID();
  const ownerHash = await sha256(ownerToken);
  const record: Record<string, unknown> = {
    nickname, ml_id, zone_id, category, note,
    like_target: category === "like_exchange" ? String(body.like_target ?? "Saling like profil") : null,
    rank: category === "looking_for_party" ? String(body.rank ?? "Fleksibel") : null,
    role: category === "looking_for_party" ? String(body.role ?? "Fleksibel") : null,
    contact_email: email,
    email_consent: Boolean(body.email_consent && email),
    owner_token_hash: ownerHash,
  };
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.from("community_posts").insert(record).select("id").single();
  if (error) return json({ error: "Database menolak postingan. Pastikan schema.sql sudah dijalankan." }, 400);

  // Email is best-effort; a mail failure must not undo a successful post.
  if (email && body.email_consent) {
    try {
      await fetch(`${url}/functions/v1/send-community-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}`, "apikey": serviceKey },
        body: JSON.stringify({ to: email, nickname, postId: data.id, category }),
      });
    } catch (_) { /* Do not leak provider errors to browser. */ }
  }
  return json({ id: data.id, owner_token: ownerToken });
});