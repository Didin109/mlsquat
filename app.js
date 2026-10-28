(() => {
  const cfg = window.ML_SQUAD_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const supabaseReady = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("PASTE_"));
  const db = supabaseReady ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  let posts = [];
  let filter = "all";
  let pendingAction = null;
  const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmtTime = (v) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "Baru saja";
    return new Intl.DateTimeFormat("id-ID", {day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d);
  };
  const notify = (msg, type="success") => {
    const el = $("#form-message"); el.textContent = msg; el.className = "form-message " + type;
  };
  const category = () => $('input[name="category"]:checked').value;
  function syncCategory() {
    const isLike = category() === "like_exchange";
    $("#like-fields").hidden = !isLike;
    $("#party-fields").hidden = isLike;
    $("#choice-like").classList.toggle("selected", isLike);
    $("#choice-party").classList.toggle("selected", !isLike);
  }
  $$('input[name="category"]').forEach(el => el.addEventListener("change", syncCategory));
  function render() {
    const shown = posts.filter(p => filter === "all" || (filter === "like" ? p.category === "like_exchange" : p.category === "looking_for_party"));
    $("#stat-total").textContent = posts.length;
    $("#stat-like").textContent = posts.filter(p=>p.category==="like_exchange").length;
    $("#stat-party").textContent = posts.filter(p=>p.category==="looking_for_party").length;
    $("#post-count").textContent = shown.length;
    $("#feed-title").childNodes[0].textContent = filter === "all" ? "Semua Postingan " : filter === "like" ? "Tukaran Like " : "Cari Teman Mabar ";
    if (!shown.length) {
      $("#feed").innerHTML = `<div class="empty-state"><div class="empty-icon">⌁</div><h4>Belum ada postingan di sini</h4><p>Jadilah yang pertama membuat postingan dan mulai kenalan dengan pemain lain.</p><button class="outline-btn" id="empty-create">＋ Buat postingan</button></div>`;
      $("#empty-create").addEventListener("click",()=>$("#buat-postingan").scrollIntoView({behavior:"smooth"}));
      return;
    }
    $("#feed").innerHTML = shown.map(p => {
      const isLike = p.category === "like_exchange";
      const done = p.status === "completed";
      const chips = [`<span class="detail-chip">ID <strong>${escapeHtml(p.ml_id)}</strong></span>`,`<span class="detail-chip">Zone <strong>${escapeHtml(p.zone_id)}</strong></span>`];
      if (isLike) chips.push(`<span class="detail-chip">Target <strong>${escapeHtml(p.like_target || "Saling like profil")}</strong></span>`);
      else { if(p.rank) chips.push(`<span class="detail-chip">Rank <strong>${escapeHtml(p.rank)}</strong></span>`); if(p.role) chips.push(`<span class="detail-chip">Role <strong>${escapeHtml(p.role)}</strong></span>`); }
      const owner = Boolean(localStorage.getItem("ml_squad_owner_" + p.id));
      return `<article class="post-card">
        <div class="post-top"><div class="post-avatar">${escapeHtml((p.nickname||"ML").trim().slice(0,2).toUpperCase())}</div><div class="post-person"><b>${escapeHtml(p.nickname)}</b><small>${escapeHtml(fmtTime(p.created_at))}</small></div><span class="category-badge ${isLike?"":"party"}">${isLike?"♡ Tukaran Like":"⚔ Cari Mabar"}</span></div>
        <div class="post-status ${done?"done":""}">${done?"Selesai":"Sedang mencari"}</div>
        <div class="post-detail">${chips.join("")}</div>
        ${p.note?`<p class="post-note">${escapeHtml(p.note)}</p>`:""}
        <div class="post-actions"><button class="complete-btn" data-action="complete" data-id="${escapeHtml(p.id)}" ${done?"disabled":""}>${done?"✓ Selesai":isLike?"Selesai tukaran":"Sudah dapat teman"}</button>${owner?`<button class="delete-btn" data-action="delete" data-id="${escapeHtml(p.id)}">Hapus</button>`:""}</div>
      </article>`;
    }).join("");
    $$("#feed [data-action]").forEach(btn => btn.addEventListener("click",()=>askAction(btn.dataset.action,btn.dataset.id)));
  }
  async function loadPosts() {
    if (!db) {
      $("#connection-label").textContent = "Konfigurasi dibutuhkan";
      $("#feed").innerHTML = `<div class="empty-state"><div class="empty-icon">⌘</div><h4>Hubungkan Supabase dulu</h4><p>Masukkan publishable/anon key Supabase di file <b>config.js</b>, lalu jalankan SQL dari folder supabase/.</p><a class="outline-btn" href="SETUP.md" target="_blank" rel="noopener">Buka panduan setup</a></div>`;
      return;
    }
    $("#connection-label").textContent = "Menghubungkan…";
    const {data,error} = await db.from("community_posts_public").select("id,nickname,ml_id,zone_id,category,like_target,rank,role,note,status,created_at").order("created_at",{ascending:false}).limit(100);
    if(error) {
      $("#connection-label").textContent = "Database belum siap";
      $("#feed").innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h4>Belum bisa memuat postingan</h4><p>${escapeHtml(error.message)}<br>Pastikan SQL dan RLS sudah diterapkan.</p><button class="outline-btn" id="retry-load">Coba lagi</button></div>`;
      $("#retry-load").addEventListener("click",loadPosts); return;
    }
    posts = data || [];
    $("#connection-label").textContent = "Terhubung ke Supabase";
    render();
  }
  async function createPost(payload) {
    // Create endpoint is the safer route: it validates server-side and stores ownership token hash.
    const {data,error} = await db.functions.invoke("create-community-post",{body:payload});
    if(error) throw new Error(error.message || "Gagal membuat postingan.");
    if(data?.error) throw new Error(data.error);
    return data;
  }
  $("#post-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if(!db){notify("Supabase belum dikonfigurasi. Isi key di config.js terlebih dahulu.","error");return;}
    const email = $("#email").value.trim();
    if(email && !$("#email-consent").checked){notify("Centang persetujuan jika ingin menerima email konfirmasi.","error");return;}
    if($("#email-consent").checked && !email){notify("Isi email terlebih dahulu atau hilangkan centang persetujuan.","error");return;}
    const payload = {nickname:$("#nickname").value.trim(),ml_id:$("#mlid").value.trim(),zone_id:$("#zoneid").value.trim(),category:category(),like_target:category()==="like_exchange"?$("#like-target").value:null,rank:category()==="looking_for_party"?$("#rank").value:null,role:category()==="looking_for_party"?$("#role").value:null,note:$("#note").value.trim(),email:$("#email-consent").checked?email:null,email_consent:$("#email-consent").checked};
    if(!payload.nickname || !/^\d{3,24}$/.test(payload.ml_id) || !/^\d{1,12}$/.test(payload.zone_id)){notify("Periksa nickname, ID ML (angka 3–24 digit), dan Zone ID (angka).","error");return;}
    const btn=$("#publish-btn");btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Mengirim…';notify("");
    try {
      const result = await createPost(payload);
      if(result?.id && result?.owner_token) localStorage.setItem("ml_squad_owner_"+result.id,result.owner_token);
      $("#post-form").reset();syncCategory();notify("Postingan berhasil dipublikasikan!","success");
      await loadPosts();
    } catch(err) {
      notify("Gagal memublikasikan: "+(err.message||"Periksa Edge Function dan koneksi."),"error");
    } finally {btn.disabled=false;btn.innerHTML='Publikasikan Postingan <span>↗</span>';}
  });
  function askAction(action,id) {
    const post=posts.find(p=>String(p.id)===String(id));if(!post)return;
    if(action==="delete" && !localStorage.getItem("ml_squad_owner_"+id)){notify("Hanya pembuat postingan yang bisa menghapusnya dari perangkat ini.","error");return;}
    pendingAction={action,id,post};
    $("#dialog-title").textContent=action==="delete"?"Hapus postingan?":"Tandai postingan selesai?";
    $("#dialog-copy").textContent=action==="delete"?"Postingan ini akan dihapus dari papan komunitas. Tindakan ini tidak bisa dibatalkan.":"Postingan akan ditandai selesai dan tetap terlihat di feed.";
    $("#dialog-confirm").textContent=action==="delete"?"Ya, hapus":"Ya, tandai selesai";
    $("#confirm-dialog").showModal();
  }
  $("#dialog-cancel").addEventListener("click",()=>$("#confirm-dialog").close());
  $("#dialog-confirm").addEventListener("click",async()=>{
    if(!pendingAction)return;const {action,id}=pendingAction;$("#confirm-dialog").close();
    if(!db)return;
    try {
      if(action==="complete") {
        const {error}=await db.functions.invoke("manage-community-post",{body:{action:"complete",id}});
        if(error)throw error;
      } else {
        const token=localStorage.getItem("ml_squad_owner_"+id);
        const {error}=await db.functions.invoke("manage-community-post",{body:{action:"delete",id,owner_token:token}});
        if(error)throw error;
        localStorage.removeItem("ml_squad_owner_"+id);
      }
      await loadPosts();
    } catch(err){notify("Tindakan gagal. "+(err.message||"Periksa Edge Function dan izin akses."),"error");}
    pendingAction=null;
  });
  $$(".filter").forEach(btn=>btn.addEventListener("click",()=>{$$(".filter").forEach(b=>b.classList.toggle("active",b===btn));filter=btn.dataset.filter;render();}));
  $("#refresh-btn").addEventListener("click",loadPosts);
  $("#copy-dana").addEventListener("click",async()=>{
    const number=cfg.DANA_NUMBER||"082191523276";
    try{await navigator.clipboard.writeText(number);$("#donate-message").textContent="Nomor DANA berhasil disalin: "+number;}
    catch{$("#donate-message").textContent="Nomor DANA: "+number+" (salin manual)."}
  });
  $("#saweria-link").href=cfg.SAWERIA_URL||"https://saweria.co/";
  $("#year").textContent=new Date().getFullYear();
  if(db) {
    db.channel("community-posts-live").on("postgres_changes",{event:"*",schema:"public",table:"community_posts"},()=>loadPosts()).subscribe();
  }
  syncCategory();loadPosts();
})();