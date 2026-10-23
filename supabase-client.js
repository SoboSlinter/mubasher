/* ============================================================
   اتصال الموقع بقاعدة بيانات Supabase
   ملاحظة أمنية: هذا المفتاح "anon public key" مصمَّم خصيصًا ليكون علنيًا
   داخل كود الموقع في المتصفح — الحماية الفعلية تأتي من قواعد
   Row Level Security المكتوبة في supabase_schema.sql، وليس من إخفاء هذا المفتاح.
   ============================================================ */

var SUPABASE_URL = "https://onrtkranuffmozpedjrl.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ucnRrcmFudWZmbW96cGVkanJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3OTAzNTIsImV4cCI6MjEwODM2NjM1Mn0.J-JP30F5fG6UXqdjChfsf0-OaRpOjR65Y6wYIkWoExs";

/* يتطلب تحميل مكتبة supabase-js أولاً في الصفحة عبر:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
   قبل هذا الملف.
   إن تعذّر تحميل هذه المكتبة (لا إنترنت، أو حجب من الشبكة، أو أي سبب آخر)، تبقى
   window.sbSignUp/sbSignIn/... غير معرَّفة، فيستمر باقي الموقع بالعمل محليًا
   (localStorage) دون أي كسر — كل مكان يستخدمها في script.js يتحقق أولاً
   من "typeof sbSignIn === 'function'" قبل استدعائها. */
var supabaseClient = null;
try {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.warn("Supabase: مكتبة supabase-js لم تُحمَّل — سيعمل الموقع بالتخزين المحلي فقط.");
  }
} catch (e) {
  console.warn("Supabase: تعذّر تهيئة الاتصال —", e.message);
}

if (supabaseClient) {
  /* ---------- إنشاء حساب جديد ----------
     ينشئ حساب مصادقة (Auth) في Supabase، ثم صفًا مرتبطًا به في جدول public.users
     يحمل بيانات الملف الشخصي (الاسم، الجوال، الرقم الوطني...). */
  window.sbSignUp = async function (profile) {
    var authResult = await supabaseClient.auth.signUp({
      email: profile.email,
      password: profile.password,
    });
    if (authResult.error) return { ok: false, error: authResult.error.message };

    var authUserId = authResult.data.user ? authResult.data.user.id : null;
    if (!authUserId) {
      /* بريد يحتاج تأكيدًا قبل أن يصبح الحساب فعّالًا بالكامل */
      return { ok: true, needsEmailConfirmation: true };
    }

    var insertResult = await supabaseClient.from("users").insert({
      auth_user_id: authUserId,
      name: profile.name,
      email: profile.email,
      username: profile.username || null,
      phone: profile.phone || null,
      national_id: profile.nationalId || null,
      id_photo_url: profile.idPhotoUrl || null,
      photo_url: profile.photoUrl || null,
      birthdate: profile.birthdate || null,
      plan: profile.plan || "monthly",
      review_status: "pending",
    }).select().single();

    if (insertResult.error) return { ok: false, error: insertResult.error.message };
    return { ok: true, user: insertResult.data };
  };

  /* ---------- تسجيل الدخول ---------- */
  /* الدخول باسم المستخدم: إن لم يحتوِ المُدخَل على @ نحوّله إلى البريد المرتبط به عبر
     دالة email_for_username في قاعدة البيانات (Supabase Auth نفسه يتطلب بريدًا). */
  window.sbResolveLoginEmail = async function (identifier) {
    var id = (identifier || "").trim();
    if (id.indexOf("@") > -1) return id;
    var r = await supabaseClient.rpc("email_for_username", { u: id });
    return !r.error && r.data ? r.data : null;
  };
  /* true = متاح، false = مستخدم، null = تعذّر التحقق (لا اتصال) */
  /* ---------- النسخ الاحتياطي (للمدير العام فقط — الدوال تتحقق من الصلاحية داخل قاعدة البيانات) ---------- */
  function sbRpc(name, args) {
    return supabaseClient.rpc(name, args || {}).then(function (r) {
      return r.error ? { ok: false, error: r.error.message } : { ok: true, data: r.data };
    });
  }
  window.sbAdminBackupDownload = function () { return sbRpc("admin_backup_download"); };
  window.sbAdminBackupSnapshot = function (label) { return sbRpc("admin_backup_snapshot", { p_label: label || "manual" }); };
  window.sbAdminBackupList = function () { return sbRpc("admin_backup_list"); };
  window.sbAdminBackupGet = function (id) { return sbRpc("admin_backup_get", { p_id: id }); };

  window.sbUpdateUsername = async function (userId, username) {
    var r = await supabaseClient.from("users").update({ username: username || null }).eq("id", userId);
    return { ok: !r.error, error: r.error ? r.error.message : null };
  };
  window.sbUsernameAvailable = async function (username) {
    try {
      var r = await supabaseClient.rpc("username_available", { u: username });
      if (r.error || typeof r.data !== "boolean") return null;
      return r.data;
    } catch (e) { return null; }
  };

  window.sbSignIn = async function (identifier, password) {
    var email = await window.sbResolveLoginEmail(identifier);
    if (!email) return { ok: false, error: "Invalid login credentials" };
    var authResult = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (authResult.error) return { ok: false, error: authResult.error.message };

    var profileResult = await supabaseClient
      .from("users")
      .select("*")
      .eq("auth_user_id", authResult.data.user.id)
      .single();

    if (profileResult.error) return { ok: false, error: profileResult.error.message };
    return { ok: true, user: profileResult.data };
  };

  /* ---------- تسجيل الخروج ---------- */
  window.sbSignOut = async function () {
    var result = await supabaseClient.auth.signOut();
    return { ok: !result.error, error: result.error ? result.error.message : null };
  };

  /* ---------- جلب ملف المستخدم الحالي (إن كان مسجّلاً دخوله) ---------- */
  window.sbGetCurrentProfile = async function () {
    var sessionResult = await supabaseClient.auth.getSession();
    var session = sessionResult.data.session;
    if (!session) return null;

    var profileResult = await supabaseClient
      .from("users")
      .select("*")
      .eq("auth_user_id", session.user.id)
      .single();

    return profileResult.error ? null : profileResult.data;
  };

  /* ============================================================
     الإعلانات — تحويل شكل بيانات الإعلان بين الموقع (حقول مسطّحة
     بحسب الفئة: resRooms, carBrand, landType...) وجدول Supabase
     (عمود JSONB واحد اسمه details يحمل كل الحقول الخاصة بالفئة).
     ============================================================ */
  var LISTING_DETAIL_FIELDS = [
    "landArea", "landType", "landAddress", "landNumber",
    "resArea", "resRooms", "resBaths", "resAddress", "resNumber",
    "comArea", "comType", "comAddress", "comNumber",
    "carBrand", "carModel", "carYear", "carOdometer", "carRegistration",
    "motoBrand", "motoModel", "motoYear", "motoOdometer",
  ];

  function mapListingToSbPayload(listing) {
    var details = {};
    LISTING_DETAIL_FIELDS.forEach(function (f) {
      if (listing[f] !== undefined && listing[f] !== "") details[f] = listing[f];
    });
    return {
      category: listing.category,
      offer_type: listing.offerType || "sale",
      title: listing.title || "",
      description: listing.description || "",
      price: Number(listing.price) || 0,
      city: listing.city || "",
      status: listing.status === "sold" ? "sold" : "approved",
      hidden_by_admin: !!listing.hidden,
      photos: listing.photos || [],
      details: details,
    };
  }

  function mapSbRowToListing(row) {
    var listing = {
      sbId: row.id,
      category: row.category,
      offerType: row.offer_type,
      title: row.title,
      description: row.description,
      price: row.price,
      city: row.city,
      status: row.status === "sold" ? "sold" : "active",
      hidden: !!row.hidden_by_admin,
      photos: row.photos || [],
      ownerEmail: row.owner && row.owner.email ? row.owner.email : "",
      ownerName: row.owner && row.owner.name ? row.owner.name : "",
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    };
    var details = row.details || {};
    Object.keys(details).forEach(function (k) {
      listing[k] = details[k];
    });
    return listing;
  }

  /* ---------- إنشاء إعلان جديد (ownerId = users.id الخاص بصاحب الإعلان في Supabase) ---------- */
  window.sbCreateListing = async function (listing, ownerId) {
    if (!ownerId) return { ok: false, error: "no owner id" };
    var payload = mapListingToSbPayload(listing);
    payload.owner_id = ownerId;
    var result = await supabaseClient.from("listings").insert(payload).select().single();
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, row: mapSbRowToListing(result.data) };
  };

  /* ---------- تعديل إعلان موجود (sbId = المعرّف الحقيقي بجدول listings) ---------- */
  window.sbUpdateListing = async function (sbId, listing) {
    var payload = mapListingToSbPayload(listing);
    var result = await supabaseClient.from("listings").update(payload).eq("id", sbId);
    return { ok: !result.error, error: result.error ? result.error.message : null };
  };

  /* ---------- حذف إعلان ---------- */
  window.sbDeleteListing = async function (sbId) {
    var result = await supabaseClient.from("listings").delete().eq("id", sbId);
    return { ok: !result.error, error: result.error ? result.error.message : null };
  };

  /* ---------- جلب كل الإعلانات المتاحة (المعتمدة للجميع + إعلانات المستخدم الحالي) ---------- */
  window.sbFetchListings = async function () {
    var result = await supabaseClient.from("listings").select("*");
    if (result.error) return { ok: false, error: result.error.message };
    var owners = await fetchProfileMap(result.data.map(function (r) { return r.owner_id; }));
    return {
      ok: true,
      rows: result.data.map(function (r) {
        r.owner = owners[r.owner_id] || null;
        return mapSbRowToListing(r);
      }),
    };
  };

  /* ============================================================
     دوال مُعاد بناؤها بعد استعادة الـ Backend: الرسائل، الإشعارات، المفضلة،
     التقييمات، البلاغات، ورفع الملفات. تُعيد جميعها {ok, ...} ولا ترمي استثناءات.
     ============================================================ */
  function sbErr(result) {
    return { ok: false, error: result && result.error ? result.error.message : "unknown error" };
  }
  function toMs(v) {
    return v ? new Date(v).getTime() : Date.now();
  }
  /* جلب الاسم والبريد للأطراف المعنية عبر دالة قاعدة البيانات profiles_by_ids (تُظهر فقط
     من يحق للمستخدم الحالي رؤيته: نفسه، أصحاب الإعلانات المعتمدة، شركاء الرسائل، المقيِّمين).
     تُعيد خريطة id → {email, name}؛ وعند الفشل خريطة فارغة فيستمر الموقع محليًا. */
  async function fetchProfileMap(ids) {
    var unique = [];
    (ids || []).forEach(function (id) {
      if (id && unique.indexOf(id) === -1) unique.push(id);
    });
    var map = {};
    if (!unique.length) return map;
    try {
      var result = await supabaseClient.rpc("profiles_by_ids", { ids: unique });
      if (!result.error && Array.isArray(result.data)) {
        result.data.forEach(function (p) {
          map[p.id] = { email: p.email, name: p.name };
        });
      }
    } catch (e) {}
    return map;
  }

  /* ---------- الرسائل ---------- */
  function mapSbMessage(row, profiles) {
    profiles = profiles || {};
    row.sender = profiles[row.sender_id] || null;
    row.recipient = profiles[row.recipient_id] || null;
    return {
      sbId: row.id,
      listingSbId: row.listing_id,
      fromEmail: row.sender && row.sender.email ? row.sender.email : "",
      toEmail: row.recipient && row.recipient.email ? row.recipient.email : "",
      body: row.body,
      read: !!row.read_at,
      createdAt: toMs(row.created_at),
    };
  }
  window.sbSendMessage = async function (payload) {
    var result = await supabaseClient
      .from("messages")
      .insert(payload)
      .select()
      .single();
    if (result.error) return sbErr(result);
    var sendProfiles = await fetchProfileMap([result.data.sender_id, result.data.recipient_id]);
    return { ok: true, row: mapSbMessage(result.data, sendProfiles) };
  };
  window.sbFetchMessagesFor = async function (userId) {
    var result = await supabaseClient
      .from("messages")
      .select("*")
      .or("sender_id.eq." + userId + ",recipient_id.eq." + userId)
      .order("created_at", { ascending: true });
    if (result.error) return sbErr(result);
    var ids = [];
    result.data.forEach(function (m) { ids.push(m.sender_id, m.recipient_id); });
    var msgProfiles = await fetchProfileMap(ids);
    return {
      ok: true,
      rows: result.data.map(function (m) {
        return mapSbMessage(m, msgProfiles);
      }),
    };
  };
  window.sbMarkMessageRead = async function (sbId) {
    var result = await supabaseClient.from("messages").update({ read_at: new Date().toISOString() }).eq("id", sbId);
    return { ok: !result.error, error: result.error ? result.error.message : null };
  };

  /* ---------- الإشعارات ---------- */
  window.sbCreateNotification = async function (payload) {
    var result = await supabaseClient.from("notifications").insert(payload).select().single();
    if (result.error) return sbErr(result);
    return { ok: true, row: result.data };
  };
  window.sbFetchNotificationsFor = async function (userId) {
    var result = await supabaseClient
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (result.error) return sbErr(result);
    return {
      ok: true,
      rows: result.data.map(function (r) {
        return {
          sbId: r.id,
          type: r.type,
          data: r.payload || {},
          dedupeKey: r.dedupe_key,
          createdAt: toMs(r.created_at),
          read: !!r.read_at,
        };
      }),
    };
  };
  window.sbMarkNotificationRead = async function (sbId) {
    var result = await supabaseClient.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", sbId);
    return { ok: !result.error, error: result.error ? result.error.message : null };
  };

  /* ---------- المفضلة ---------- */
  window.sbSetFavorite = async function (userId, listingSbId, isFavorite) {
    var result = isFavorite
      ? await supabaseClient.from("favorites").upsert({ user_id: userId, listing_id: listingSbId })
      : await supabaseClient.from("favorites").delete().eq("user_id", userId).eq("listing_id", listingSbId);
    return { ok: !result.error, error: result.error ? result.error.message : null };
  };
  window.sbFetchFavoritesFor = async function (userId) {
    var result = await supabaseClient.from("favorites").select("listing_id").eq("user_id", userId);
    if (result.error) return sbErr(result);
    return {
      ok: true,
      listingSbIds: result.data.map(function (r) {
        return r.listing_id;
      }),
    };
  };

  /* ---------- التقييمات ---------- */
  window.sbUpsertReview = async function (sellerId, reviewerId, rating, comment) {
    var result = await supabaseClient
      .from("reviews")
      .upsert(
        { seller_id: sellerId, reviewer_id: reviewerId, rating: rating, comment: comment || "" },
        { onConflict: "seller_id,reviewer_id" }
      )
      .select()
      .single();
    if (result.error) return sbErr(result);
    return { ok: true, row: result.data };
  };
  window.sbFetchReviewsForSeller = async function (sellerId) {
    var result = await supabaseClient
      .from("reviews")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: true });
    if (result.error) return sbErr(result);
    var reviewers = await fetchProfileMap(result.data.map(function (r) { return r.reviewer_id; }));
    result.data.forEach(function (r) { r.reviewer = reviewers[r.reviewer_id] || null; });
    return {
      ok: true,
      rows: result.data.map(function (r) {
        return {
          sbId: r.id,
          reviewerEmail: r.reviewer && r.reviewer.email ? r.reviewer.email : "",
          rating: r.rating,
          comment: r.comment || "",
          createdAt: toMs(r.created_at),
          updatedAt: toMs(r.created_at),
        };
      }),
    };
  };

  /* ---------- البلاغات ---------- */
  window.sbCreateReport = async function (payload) {
    var result = await supabaseClient.from("reports").insert(payload).select().single();
    if (result.error) return sbErr(result);
    return { ok: true, row: result.data };
  };
  window.sbUpdateReportStatus = async function (sbId, status) {
    var result = await supabaseClient.from("reports").update({ status: status }).eq("id", sbId);
    return { ok: !result.error, error: result.error ? result.error.message : null };
  };
  window.sbFetchReports = async function () {
    var result = await supabaseClient
      .from("reports")
      .select("*")
      .order("created_at", { ascending: true });
    if (result.error) return sbErr(result);
    var reporters = await fetchProfileMap(result.data.map(function (r) { return r.reporter_id; }));
    result.data.forEach(function (r) { r.reporter = reporters[r.reporter_id] || null; });
    return {
      ok: true,
      rows: result.data.map(function (r) {
        return {
          sbId: r.id,
          listingSbId: r.listing_id,
          reporterEmail: r.reporter && r.reporter.email ? r.reporter.email : "",
          reason: r.reason,
          details: r.details || "",
          status: r.status,
          createdAt: toMs(r.created_at),
        };
      }),
    };
  };

  /* ---------- رفع الملفات إلى Supabase Storage (يعود script.js إلى Base64 عند الفشل) ---------- */
  window.sbUploadFile = async function (bucket, path, file) {
    var up = await supabaseClient.storage.from(bucket).upload(path, file, { upsert: false });
    if (up.error) return { ok: false, error: up.error.message };
    var pub = supabaseClient.storage.from(bucket).getPublicUrl(path);
    return { ok: true, url: pub.data.publicUrl };
  };
}
