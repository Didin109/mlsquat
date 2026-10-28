import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
async function sha256(value:string){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).map(x=>x).join("");}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({error:"Konfigurasi backend belum lengkap."},500);
  let body:any;try{body=await req.json()}catch{return json({error:"JSON tidak valid."},400)}
  const id=String(body.id??"");
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"ID postingan tidak valid."},400);
  const admin=createClient(url,key,{auth:{persistSession:false}});
  if(body.action==="complete"){
    // Public completion is intentionally allowed for community coordination; rate-limit this endpoint before production.
    const {error}=await admin.from("community_posts").update({status:"completed",updated_at:new Date().toISOString()}).eq("id",id);
    if(error)return json({error:"Tidak dapat mengubah status."},400);
    return json({success:true});
  }
  if(body.action==="delete"){
    const token=String(body.owner_token??"");
    if(token.length<20)return json({error:"Token kepemilikan tidak ditemukan."},403);
    const hash=await sha256(token);
    const {data,error}=await admin.from("community_posts").delete().eq("id",id).eq("owner_token_hash",hash).select("id").maybeSingle();
    if(error||!data)return json({error:"Token salah atau postingan bukan milikmu."},403);
    return json({success:true});
  }
  return json({error:"Aksi tidak dikenal."},400);
});