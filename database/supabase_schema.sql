-- ============================================================
-- مباشر (Mubasher) — Supabase / PostgreSQL Schema
-- ينفَّذ هذا الملف كاملاً مرة واحدة داخل SQL Editor في مشروع Supabase.
-- يقابل كل جدول هنا مفتاح تخزين محلي (localStorage) كان يُستخدم سابقًا في script.js
-- ============================================================

-- يفعّل توليد UUID تلقائيًا
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1) المستخدمون (كان: eqari_users)
-- ------------------------------------------------------------
create table if not exists users (
  id                  uuid primary key default gen_random_uuid(),
  auth_user_id        uuid unique references auth.users(id) on delete cascade, -- يربط الحساب بنظام مصادقة Supabase
  name                text not null,
  email               text not null unique,
  phone               text,
  role                text not null default 'user'
                        check (role in ('user','super_admin','admin','moderator','support','finance_admin','content_admin')),
  custom_sections     text[],                       -- صلاحيات مخصّصة لموظف إدارة (تجاوز صلاحيات الدور الافتراضية)
  two_factor_enabled  boolean not null default false,

  -- التحقق من الهوية عند التسجيل
  national_id         text,
  id_photo_url        text,
  photo_url            text,
  birthdate           date,
  address             text default '',

  review_status       text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  rejection_reason    text,
  reviewed_at         timestamptz,

  -- الاشتراك / التجربة المجانية (غير مطلوبة لحسابات الإدارة)
  plan                text check (plan in ('monthly','yearly')),
  subscription_status text check (subscription_status in ('trial','active')),
  trial_starts_at     timestamptz,
  trial_ends_at       timestamptz,
  subscription_ends_at timestamptz,
  paid_at             timestamptz,
  payment_method      text,

  status              text not null default 'active' check (status in ('active','disabled')),
  flagged             boolean not null default false,

  last_login_at       timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists idx_users_role on users(role);
create index if not exists idx_users_review_status on users(review_status);

-- ------------------------------------------------------------
-- 2) الإعلانات (كان: eqari_listings)
-- ------------------------------------------------------------
create table if not exists listings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references users(id) on delete cascade,
  category      text not null check (category in ('residential','land','car','motorcycle','commercial')),
  offer_type    text not null check (offer_type in ('sale','rent')),
  title         text not null,
  description   text,
  price         numeric not null,
  city          text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','sold')),
  hidden_by_admin boolean not null default false,
  photos        text[] default '{}',
  -- الحقول الخاصة بكل فئة (غرف، سنة الصنع، رقم القطعة، رقم لوحة السيارة...) تُحفظ هنا
  -- بدل إنشاء عشرات الأعمدة الفارغة لكل فئة
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_listings_owner on listings(owner_id);
create index if not exists idx_listings_category on listings(category);
create index if not exists idx_listings_status on listings(status);
create index if not exists idx_listings_city on listings(city);
create index if not exists idx_listings_details on listings using gin(details);

-- ------------------------------------------------------------
-- 3) الرسائل بين المستخدمين حول إعلان (كان: eqari_messages)
-- ------------------------------------------------------------
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings(id) on delete cascade,
  sender_id     uuid not null references users(id) on delete cascade,
  recipient_id  uuid not null references users(id) on delete cascade,
  body          text not null,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_messages_listing on messages(listing_id);
create index if not exists idx_messages_recipient on messages(recipient_id, read_at);

-- ------------------------------------------------------------
-- 4) الإشعارات العامة (كان: eqari_notifications)
-- ------------------------------------------------------------
create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  type         text not null,               -- account_approved / account_rejected / subscription_expiring ...
  payload      jsonb not null default '{}'::jsonb,
  dedupe_key   text,                        -- يمنع تكرار نفس الإشعار لنفس الحالة
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique(user_id, dedupe_key)
);
create index if not exists idx_notifications_user on notifications(user_id, read_at);

-- ------------------------------------------------------------
-- 5) المفضّلة (كان: eqari_favorites)
-- ------------------------------------------------------------
create table if not exists favorites (
  user_id      uuid not null references users(id) on delete cascade,
  listing_id   uuid not null references listings(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ------------------------------------------------------------
-- 6) تقييمات البائعين (كان: eqari_reviews)
-- ------------------------------------------------------------
create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references users(id) on delete cascade,
  reviewer_id   uuid not null references users(id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now(),
  unique(seller_id, reviewer_id)  -- مراجعة واحدة لكل بائع من نفس المستخدم (تُحدَّث لاحقًا)
);

-- ------------------------------------------------------------
-- 7) بلاغات عن الإعلانات (كان: eqari_reports)
-- ------------------------------------------------------------
create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings(id) on delete cascade,
  reporter_id   uuid references users(id) on delete set null,
  reason        text not null,
  details       text,
  status        text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8) أكواد الخصم (كان: eqari_coupons)
-- ------------------------------------------------------------
create table if not exists coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  percent_off   numeric,
  starts_at     date,
  ends_at       date,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 9) محتوى الصفحة الرئيسية القابل للتعديل (كان: eqari_site_content)
-- ------------------------------------------------------------
create table if not exists site_content (
  key           text not null,
  lang          text not null check (lang in ('ar','en')),
  value         text not null,
  updated_at    timestamptz not null default now(),
  primary key (key, lang)
);

-- ------------------------------------------------------------
-- 10) إعدادات المنصة العامة — صف واحد فقط (كان: eqari_site_settings)
-- ------------------------------------------------------------
create table if not exists site_settings (
  id                     boolean primary key default true check (id),  -- يضمن صفًا واحدًا فقط
  min_age                int not null default 18,
  maintenance_mode       boolean not null default false,
  monthly_price          numeric not null default 20000,
  yearly_price           numeric not null default 199000,
  sub_discount_percent   numeric not null default 0,
  sub_discount_start     date,
  sub_discount_end       date
);
insert into site_settings (id) values (true) on conflict do nothing;

-- ------------------------------------------------------------
-- 11) سجل العمليات (كان: eqari_audit_log)
-- ------------------------------------------------------------
create table if not exists audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_email   text not null,
  action        text not null,
  target        text,
  details       text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_audit_created on audit_log(created_at desc);

-- ============================================================
-- Row Level Security (RLS) — أساسيات فقط، تُراجَع وتُشدَّد قبل الإطلاق الفعلي
-- ============================================================
alter table users enable row level security;
alter table listings enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table favorites enable row level security;
alter table reviews enable row level security;
alter table reports enable row level security;
alter table coupons enable row level security;
alter table site_content enable row level security;
alter table site_settings enable row level security;
alter table audit_log enable row level security;

-- coupons وsite_content وsite_settings وaudit_log: لم تُربط بعد بمزامنة فعلية مع الموقع
-- (لا يزال الموقع يستخدم localStorage لها) — تُفعَّل الحماية هنا دون أي سياسة select/insert
-- عامة حاليًا، أي أنها محجوبة بالكامل عن anon/authenticated عبر الـ REST API إلى أن تُربط
-- فعليًا، حينها تُضاف سياسات مناسبة (مثال: قراءة عامة لـ site_content وsite_settings، وقراءة
-- محدودة لأكواد الخصم النشطة فقط في coupons، وaudit_log يبقى بلا سياسة قراءة عامة إطلاقًا).

-- كل مستخدم يقرأ ويعدّل بيانات حسابه فقط
create policy "users read own row" on users
  for select using (auth.uid() = auth_user_id);
create policy "users update own row" on users
  for update using (auth.uid() = auth_user_id);

-- الإعلانات المعتمدة مرئية للجميع؛ صاحب الإعلان يرى إعلاناته دائمًا مهما كانت حالتها
create policy "approved listings are public" on listings
  for select using (status = 'approved' or owner_id in (select id from users where auth_user_id = auth.uid()));
create policy "owner manages own listings" on listings
  for all using (owner_id in (select id from users where auth_user_id = auth.uid()));

-- الرسائل مرئية فقط لطرفَي المحادثة
create policy "messages visible to participants" on messages
  for select using (
    sender_id in (select id from users where auth_user_id = auth.uid())
    or recipient_id in (select id from users where auth_user_id = auth.uid())
  );
create policy "participants can send messages" on messages
  for insert with check (sender_id in (select id from users where auth_user_id = auth.uid()));

-- الإشعارات والمفضّلة خاصة بصاحبها فقط
create policy "notifications are private" on notifications
  for all using (user_id in (select id from users where auth_user_id = auth.uid()));
create policy "favorites are private" on favorites
  for all using (user_id in (select id from users where auth_user_id = auth.uid()));

-- التقييمات مرئية للجميع، لكن الكتابة لصاحب الحساب المسجّل فقط
create policy "reviews are public to read" on reviews
  for select using (true);
create policy "reviewer writes own review" on reviews
  for insert with check (reviewer_id in (select id from users where auth_user_id = auth.uid()));

-- ملاحظة: صلاحيات الإدارة (admin/super_admin) تحتاج سياسات إضافية تتحقق من عمود role
-- عبر دالة SQL مساعدة (security definer) قبل الإطلاق الفعلي — غير مضمّنة هنا لأنها تحتاج
-- اختبارًا دقيقًا بحسب صلاحيات كل دور المذكورة في ADMIN_ROLES داخل script.js.


-- =====================================================================
-- ملحق: ما أُضيف على قاعدة البيانات الحيّة (مشروع mubasher) بعد الإنشاء الأول
-- =====================================================================

-- 1) دالة لقراءة بيانات ملفات المستخدمين المرتبطين (بدل فتح جدول users للجميع)
create or replace function public.profiles_by_ids(ids uuid[])
returns table(id uuid, name text, email text, photo_url text)
language sql stable security definer set search_path = public as $$
  with me as (select u.id from public.users u where u.auth_user_id = auth.uid())
  select u.id, u.name, u.email, u.photo_url
  from public.users u
  where u.id = any(ids) and (
    u.auth_user_id = auth.uid()
    or exists (select 1 from public.listings l where l.owner_id = u.id and l.status = 'approved')
    or exists (select 1 from public.messages m, me where (m.sender_id = u.id or m.recipient_id = u.id) and (m.sender_id = me.id or m.recipient_id = me.id))
    or exists (select 1 from public.reviews r where r.reviewer_id = u.id or r.seller_id = u.id)
  )
$$;

-- 2) حاويات التخزين (Storage buckets) المستخدمة
-- listing-photos, user-docs, profile-photos, id-photos  (كلها public حاليًا — يُنصح بجعل id-photos خاصة)
-- insert into storage.buckets (id, name, public) values
--   ('listing-photos','listing-photos',true), ('user-docs','user-docs',true),
--   ('profile-photos','profile-photos',true), ('id-photos','id-photos',true) on conflict do nothing;

-- 3) سياسات التخزين
create policy "anon uploads listing photos" on storage.objects for insert to anon with check (bucket_id = 'listing-photos');
create policy "signed-in users upload site files" on storage.objects for insert to authenticated with check (bucket_id in ('listing-photos','user-docs'));
create policy "anyone can read site files" on storage.objects for select to public using (bucket_id in ('listing-photos','user-docs'));
create policy "anyone uploads profile and id photos" on storage.objects for insert to public with check (bucket_id in ('profile-photos','id-photos'));
create policy "public read profile and id photos" on storage.objects for select to public using (bucket_id in ('profile-photos','id-photos'));

-- 4) الدخول باسم المستخدم (username)
alter table public.users add column if not exists username text;
create unique index if not exists users_username_lower_key on public.users (lower(username));
alter table public.users add constraint users_username_format check (username is null or username ~ '^[A-Za-z0-9_.]{3,20}$');

create or replace function public.email_for_username(u text)
returns text language sql stable security definer set search_path = public as $$
  select email from public.users where lower(username) = lower(trim(u)) limit 1
$$;
create or replace function public.username_available(u text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.users where lower(username) = lower(trim(u)))
$$;
grant execute on function public.email_for_username(text), public.username_available(text) to anon, authenticated;

-- 5) النسخ الاحتياطي: انظر BACKUP.md — مخطط backup (snapshots, dump, take_snapshot, is_super_admin)
--    وواجهات المدير العام public.admin_backup_download / admin_backup_snapshot / admin_backup_list / admin_backup_get
--    والجدولة عبر pg_cron: mubasher-daily-backup (03:00 UTC) و mubasher-backup-retention (03:30 UTC).
--    الكود الكامل مسجَّل في migrations المشروع: backup_system_core و backup_schedule و backup_retention.
-- 6) حدود حاويات الصور: 10MB وأنواع image/* فقط (profile-photos, id-photos, listing-photos).
