# النسخ الاحتياطي — مشروع «مباشر»

> الخطة الحالية لمشروع Supabase: **Free** — لا نسخ احتياطية تلقائية من Supabase، وتُوقَف المشاريع المجانية بعد أسبوع بلا نشاط.
> لذلك بُني نظام نسخ داخل قاعدة البيانات نفسها، **ويجب تنزيل نسخة على جهازك بانتظام**.

## ما يعمل تلقائيًا
| المهمة | الجدولة (UTC) | ما تفعله |
|---|---|---|
| `mubasher-daily-backup` | يوميًا 03:00 | تحفظ لقطة JSON كاملة في `backup.snapshots` |
| `mubasher-backup-retention` | يوميًا 03:30 | تحذف اللقطات اليومية الأقدم من 14 يومًا |

اللقطة تشمل: users, listings, messages, notifications, favorites, reviews, reports, coupons, site_content, site_settings, audit_log، وقائمة أسماء ملفات التخزين (ليس الملفات نفسها).
لا تشمل كلمات المرور (محفوظة في نظام المصادقة `auth.users`).

## من لوحة الإدارة (المدير العام فقط)
الإعدادات ← «نسخ قاعدة البيانات (Supabase)»:
- **تنزيل نسخة كاملة الآن**: ملف JSON على جهازك (الأهم — يحميك من حذف المشروع أو إيقافه).
- **حفظ لقطة الآن**: لقطة يدوية داخل القاعدة.
- قائمة اللقطات مع تنزيل أي واحدة.
تعمل هذه الأزرار فقط إذا سجّلت الدخول بحساب مدير عام موجود في Supabase.

## الاستعادة (يدويًا من Supabase ← SQL Editor)
دالة الاستعادة لا تُكشف عبر الـ API عمدًا. لاستعادة جدول من لقطة (مثال: الإعلانات من اللقطة رقم 5):

```sql
-- 1) راجع اللقطات
select id, label, taken_at, row_counts from backup.snapshots order by taken_at desc;

-- 2) استعد جدولًا واحدًا (يستبدل محتواه الحالي بالكامل!)
begin;
delete from public.listings;
insert into public.listings
  select * from jsonb_populate_recordset(null::public.listings,
         (select data->'listings' from backup.snapshots where id = 5));
commit;
```
ترتيب الاستعادة عند استعادة عدة جداول: `users` ← `listings` ← (`messages`, `notifications`, `favorites`, `reviews`, `reports`) ← بقية الجداول.
ملاحظة: حذف `users` يحذف بالتتابع ما يرتبط به، وصفوف `users` تتطلب وجود حساب مصادقة مطابق في `auth.users`.

## استعادة من ملف JSON منزَّل
نفس الأسلوب مع استبدال المصدر بالقيمة النصية للملف:
```sql
insert into public.listings
  select * from jsonb_populate_recordset(null::public.listings, '<ضع هنا مصفوفة listings من الملف>'::jsonb);
```

## ما لا يشمله النظام
- **ملفات الصور** في Storage (تُحفظ أسماؤها فقط) — صور الإعلانات والهوية تُنسخ من لوحة Supabase ← Storage يدويًا إن لزم.
- **حسابات المصادقة وكلمات المرور** (`auth.users`).
- النسخ المحلية في المتصفح (زر «تنزيل نسخة احتياطية» القديم في الإعدادات يغطي بيانات المتصفح فقط).

## للحماية الكاملة
الترقية إلى خطة Pro تضيف نسخًا يومية من Supabase نفسها (وPITR اختياريًا).
