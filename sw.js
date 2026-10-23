/* Service Worker لموقع "مباشر" — تخزين مؤقت بسيط لهيكل الموقع (App Shell) ليعمل الموقع
   كتطبيق مُثبَّت (PWA) على أندرويد وiOS، مع تحميل شبه فوري عند الفتح اللاحق وعمل جزئي دون اتصال.
   لا يتدخل هذا الملف إطلاقًا في طلبات الشبكة الخارجية (مثل Supabase) — فقط ملفات الموقع نفسه. */

var CACHE_NAME = "mubasher-shell-v2";
var APP_SHELL = [
  "index.html",
  "login.html",
  "signup.html",
  "add-listing.html",
  "listing.html",
  "my-listings.html",
  "favorites.html",
  "messages.html",
  "subscription.html",
  "admin.html",
  "admin-login.html",
  "admin-register.html",
  "privacy.html",
  "terms.html",
  "styles.css",
  "frost.css",
  "script.js",
  "supabase-client.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function () {
        /* فشل تحميل أحد الملفات لا يجب أن يمنع تثبيت الـ Service Worker بالكامل */
      });
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  /* نتعامل فقط مع طلبات GET لنفس أصل الموقع (ملفاته الثابتة) — أي طلب آخر (Supabase، خطوط
     جوجل، أو أي API خارجي) يُترك للشبكة كما هو دون أي تدخل من الـ Service Worker. */
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      var networkFetch = fetch(req)
        .then(function (res) {
          if (res && res.status === 200) {
            var resClone = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, resClone); });
          }
          return res;
        })
        .catch(function () {
          /* لا اتصال بالشبكة: استخدم النسخة المخزَّنة إن وُجدت، وإلا اعرض الصفحة الرئيسية
             كبديل احتياطي لطلبات التصفح (navigation) فقط. */
          if (cached) return cached;
          if (req.mode === "navigate") return caches.match("index.html");
          return Promise.reject("offline-and-not-cached");
        });
      /* عرض النسخة المخزَّنة فورًا إن وُجدت (تحميل أسرع)، مع تحديثها في الخلفية من الشبكة. */
      return cached || networkFetch;
    })
  );
});
