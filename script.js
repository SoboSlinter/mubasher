/* =========================================================
   مباشر (Mubasher) — ملف الجافاسكريبت الموحّد لكل صفحات المشروع
   يشمل: دعم اللغتين العربية والإنجليزية، حالة الدخول بالهيدر،
   تسجيل الدخول والخروج، إنشاء حساب، نسيت كلمة المرور (رمز مؤقت
   لمرة واحدة)، وصفحة إضافة إعلان.

   ملاحظة: هذا موقع تجريبي بدون خادم فعلي، لذلك يتم تخزين
   الحسابات وحالة الدخول وتفضيل اللغة داخل localStorage الخاص
   بالمتصفح، وكلمة المرور المؤقتة تُعرض على الشاشة بدلاً من
   إرسالها فعليًا عبر بريد إلكتروني أو رسالة نصية.
   ========================================================= */

(function () {
  "use strict";

  /* ---------- تسجيل Service Worker لتشغيل الموقع كتطبيق مُثبَّت (PWA) على أندرويد وiOS ----------
     لا يمنع فشل التسجيل (مثلاً في بيئة لا تدعمه) عمل بقية الموقع إطلاقًا. */
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  var USERS_KEY = "eqari_users";
  var SESSION_KEY = "eqari_session";
  var LANG_KEY = "eqari_lang";

  /* ============================================================
     حقلا "الصورة الشخصية" و"صورة الهوية" في فورم إنشاء حساب جديد — كانا معطَّلين
     مؤقتًا ريثما تُحل مشكلات التقاط الصورة على بعض الأجهزة، وأُعيد تفعيلهما. عند
     إعادة القيمة إلى false: يُخفى الحقلان بالكامل من الفورم ولا يُطلَب أي منهما
     لإتمام التسجيل (يُنشأ الحساب بدون صورة شخصية ولا صورة هوية).
     ============================================================ */
  var SIGNUP_PHOTOS_ENABLED = true;

  /* ============================================================
     إلزامية إرفاق صورة واحدة على الأقل عند نشر إعلان جديد (صفحة إضافة إعلان) —
     كانت معلَّقة مؤقتًا وأُعيد تفعيلها. عند إعادة القيمة إلى false: يمكن نشر
     الإعلان بدون أي صورة؛ حقل رفع الصور (بالكاميرا أو السحب والإفلات) يبقى ظاهرًا
     ويعمل بشكل طبيعي لمن يريد إضافة صور، لكنه لا يُعتبر خطأ يمنع النشر إن تُرك فارغًا.
     ============================================================ */
  var LISTING_PHOTOS_REQUIRED = true;

  /* يُميّز بين رفض Supabase الحقيقي لطلب ما (بريد مسجَّل مسبقًا، كلمة مرور ضعيفة...) وبين
     تعذّر الوصول الفعلي إلى الخادم (لا إنترنت، مشروع Supabase متوقف/محذوف، حجب شبكة، مهلة
     انتظار...). المشكلة أن مكتبة supabase-js تُعيد النوع الثاني أحيانًا كنتيجة "ناجحة" تحمل
     كائن خطأ (رسالته الحرفية غالبًا "Failed to fetch") بدل رفض الوعد (Promise rejection)،
     فلا يكفي الاعتماد على .catch() وحده لرصده — وبدون هذا الفحص كانت هذه الرسالة التقنية
     تظهر حرفيًا للمستخدم وتمنعه من إكمال التسجيل رغم أن كل بياناته صحيحة. */
  function isSupabaseConnectivityError(msg) {
    if (!msg) return true;
    var m = String(msg).toLowerCase();
    return (
      m.indexOf("failed to fetch") !== -1 ||
      m.indexOf("networkerror") !== -1 ||
      m.indexOf("network error") !== -1 ||
      m.indexOf("load failed") !== -1 ||
      m.indexOf("timeout") !== -1 ||
      m.indexOf("timed out") !== -1 ||
      m.indexOf("err_") !== -1
    );
  }

  var currentLang = localStorage.getItem(LANG_KEY) || "ar";
  var profileModalOpenFn = null;

  var I18N = {
    ar: {
    "brand.name": "مباشر",
    "meta.home.title": "مباشر | عقارات وسيارات للبيع والإيجار",
    "meta.login.title": "تسجيل الدخول | مباشر",
    "meta.signup.title": "إنشاء حساب | مباشر",
    "meta.adminLogin.title": "تسجيل دخول الإدارة | مباشر",
    "meta.adminRegister.title": "تسجيل مدير جديد | مباشر",
    "nav.adminPanel": "لوحة التحكم",
    "meta.listing.title": "أضف إعلانك | مباشر",
    "meta.privacy.title": "سياسة الخصوصية | مباشر",
    "meta.terms.title": "الشروط والأحكام | مباشر",
    "nav.realestate": "عقارات",
    "nav.cars": "سيارات",
    "nav.addListing": "أضف إعلانك",
    "nav.about": "من نحن",
    "theme.switchToDark": "تفعيل الوضع الداكن",
    "theme.switchToLight": "تفعيل الوضع الفاتح",
    "notif.bellLabel": "الإشعارات",
    "notif.heading": "الإشعارات",
    "notif.empty": "لا توجد إشعارات حتى الآن.",
    "notif.accountApproved": "تم قبول حسابك! يمكنك الآن نشر إعلاناتك على المنصة.",
    "notif.accountRejected": "تم رفض طلب حسابك.",
    "notif.subscriptionExpiring": "اشتراكك سينتهي خلال {days} يوم. جدد الآن لتفادي إيقاف إعلاناتك.",
    "notif.reviewSellerPrompt": "تم إكمال عملية البيع! شاركنا تقييمك لتجربتك مع البائع.",
    "notif.savedSearchMatch": "إعلان جديد يطابق بحثك المحفوظ «{name}»",
    "email.subject.generic": "إشعار جديد من مباشر",
    "email.subject.account_approved": "تم تفعيل حسابك في مباشر",
    "email.subject.account_rejected": "بخصوص طلب تفعيل حسابك في مباشر",
    "email.subject.subscription_expiring": "اشتراكك على وشك الانتهاء",
    "email.subject.review_seller_prompt": "شاركنا رأيك في تجربتك مع البائع",
    "email.subject.saved_search_match": "عثرنا على إعلان يطابق بحثك المحفوظ",
    "admin.nav.emailLog": "سجل البريد الإلكتروني",
    "admin.emailLog.heading": "سجل البريد الإلكتروني",
    "admin.emailLog.note": "محاكاة لإشعارات البريد الإلكتروني داخل الموقع — لا يوجد اتصال فعلي بخدمة بريد خارجية حاليًا.",
    "admin.emailLog.col.date": "التاريخ",
    "admin.emailLog.col.to": "إلى",
    "admin.emailLog.col.subject": "الموضوع",
    "admin.emailLog.col.body": "نص الرسالة",
    "admin.emailLog.empty": "لا توجد رسائل بريد مُرسَلة حتى الآن.",
    "savedSearch.saveBtn": "حفظ هذا البحث",
    "savedSearch.namePrompt": "اختر اسمًا لهذا البحث المحفوظ:",
    "savedSearch.defaultName": "بحث محفوظ",
    "savedSearch.savedAlert": "تم حفظ البحث. سنُشعرك عند نشر إعلان جديد يطابقه.",
    "savedSearch.loginRequiredAlert": "يجب تسجيل الدخول لحفظ البحث.",
    "savedSearch.sectionTitle": "عمليات البحث المحفوظة",
    "savedSearch.emptyState": "لا توجد عمليات بحث محفوظة بعد. من الصفحة الرئيسية، اضبط فلاتر البحث واضغط «حفظ هذا البحث».",
    "savedSearch.applyBtn": "تطبيق",
    "savedSearch.deleteBtn": "حذف",
    "savedSearch.deleteConfirm": "هل تريد حذف هذا البحث المحفوظ؟",
    "map.showMapBtn": "البحث بالخريطة",
    "map.showListBtn": "عرض القائمة",
    "map.unavailable": "تعذّر تحميل الخريطة. تحقّق من اتصالك بالإنترنت وحاول مجددًا.",
    "map.viewListingsBtn": "عرض الإعلانات",
    "auth.login": "تسجيل الدخول",
    "auth.logout": "تسجيل الخروج",
    "auth.signup": "إنشاء حساب",
    "auth.backHome": "← العودة إلى الرئيسية",
    "auth.backHomeShort": "العودة إلى الرئيسية",
    "auth.loginTitle": "تسجيل الدخول",
    "auth.loginSub": "أدخل بياناتك للوصول إلى حسابك",
    "auth.remember": "تذكرني",
    "auth.forgot": "نسيت كلمة المرور؟",
    "auth.loginBtn": "دخول",
    "auth.or": "أو",
    "auth.noAccount": "ليس لديك حساب؟",
    "auth.createOne": "إنشاء حساب جديد",
    "auth.hasAccount": "لديك حساب بالفعل؟",
    "auth.visualLogin": "سجّل الدخول لمتابعة إعلاناتك المحفوظة، والتواصل مع البائعين، ونشر إعلاناتك الخاصة.",
    "auth.signupTitle": "إنشاء حساب جديد",
    "auth.signupSub": "املأ بياناتك للبدء في استخدام المنصة",
    "auth.signupBtn": "إنشاء الحساب",
    "auth.agreeTo": "أوافق على",
    "auth.and": "و",
    "plan.title": "اختر خطة الاشتراك",
    "plan.intro": "اشتراك شهري لنشر إعلاناتك على المنصة، بإمكانك الدفع شهريًا أو الدفع سنويًا بخصم.",
    "plan.currency": "ج.س",
    "plan.perMonth": "شهريًا",
    "plan.perYear": "سنويًا",
    "plan.monthly.name": "شهري",
    "plan.yearly.name": "سنوي",
    "plan.yearly.badge": "خصم 17%",
    "plan.yearly.savings": "توفّر 41٬000 ج.س سنويًا مقارنة بالدفع الشهري",
    "plan.yearly.compareNote": "بدلاً من 240٬000 ج.س عند الدفع شهريًا (20٬000 × 12 شهرًا)",
    "plan.yearly.badgeDynamic": "خصم {percent}%",
    "plan.yearly.savingsDynamic": "توفّر {amount} سنويًا مقارنة بالدفع الشهري",
    "plan.yearly.compareNoteDynamic": "بدلاً من {total} عند الدفع شهريًا ({monthly} × 12 شهرًا)",
    "plan.discountBadge": "خصم {percent}% حتى {date}",
    "auth.visualSignupTitle": "انضم إلى آلاف المستخدمين الذين يبيعون ويشترون بثقة",
    "auth.visualSignupSub": "أنشئ حسابك لتتمكن من حفظ الإعلانات، ونشر عقاراتك وسياراتك، والتواصل المباشر مع المهتمين.",
    "auth.fixErrors": "الرجاء تصحيح البيانات المُعلّمة أدناه قبل المتابعة.",
    "auth.agreeTermsRequired": "الرجاء الموافقة على الشروط والأحكام للمتابعة.",
    "auth.emailExists": "يوجد حساب مسجّل بهذا البريد الإلكتروني مسبقًا.",
    "auth.creatingAccount": "جارٍ إنشاء الحساب...",
    "auth.signupSuccess": "تم إنشاء الحساب بنجاح، جارٍ تحويلك...",
    "auth.enterValidData": "الرجاء إدخال بيانات صحيحة.",
    "auth.wrongCredentials": "اسم المستخدم أو كلمة المرور غير صحيحة، الرجاء إدخال بيانات صحيحة.",
    "auth.signupGeneric": "تعذّر إنشاء الحساب، حاول مرة أخرى بعد قليل.",
    "auth.rateLimited": "محاولات كثيرة خلال وقت قصير، انتظر قليلًا ثم حاول مجددًا.",
    "auth.networkError": "تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت وحاول مجددًا.",
    "auth.useAdminLogin": "هذا حساب إدارة، الرجاء استخدام صفحة تسجيل دخول الإدارة المخصصة.",
    "auth.loggingIn": "جارٍ الدخول...",
    "auth.loginSuccess": "تم تسجيل الدخول بنجاح، جارٍ تحويلك...",
    "auth.accountDisabled": "تم تعطيل هذا الحساب من قبل إدارة المنصة. يرجى التواصل مع الدعم الفني.",
    "field.email": "البريد الإلكتروني",
    "field.username": "اسم المستخدم",
    "field.usernamePlaceholder": "مثال: mohamed_ahmed",
    "error.username": "اسم المستخدم من 3 إلى 20 حرفًا: إنجليزية أو أرقام أو _ أو . فقط",
    "error.usernameLogin": "الرجاء إدخال اسم المستخدم",
    "auth.usernameExists": "اسم المستخدم هذا مستخدم مسبقًا، اختر اسمًا آخر.",
    "field.password": "كلمة المرور",
    "field.confirmPassword": "تأكيد كلمة المرور",
    "field.fullName": "الاسم الكامل",
    "field.phone": "رقم الجوال",
    "field.choose": "اختر...",
    "error.email": "الرجاء إدخال بريد إلكتروني صحيح",
    "error.password": "كلمة المرور يجب ألا تقل عن 6 أحرف",
    "error.confirmPassword": "كلمتا المرور غير متطابقتين",
    "error.fullName": "الرجاء إدخال الاسم الكامل",
    "error.phone": "الرجاء إدخال رقم جوال صحيح (10 أرقام)",
    "field.birthdate": "تاريخ الميلاد",
    "error.birthdate": "الرجاء إدخال تاريخ ميلاد صحيح",
    "auth.ageRequirement": "يجب أن يكون عمرك 18 عامًا أو أكثر للتسجيل في المنصة",
    "auth.ageRequirementHint": "يجب أن يكون عمرك 18 عامًا أو أكثر لإنشاء حساب.",
    "field.profilePhoto": "الصورة الشخصية (اختياري)",
    "field.profilePhotoHint": "يمكنك إضافة صورة شخصية تظهر بجانب اسم المنصة بعد تسجيل الدخول.",
    "field.profilePhotoRequired": "الصورة الشخصية",
    "field.profilePhotoHintRequired": "يجب إضافة صورة شخصية، وستظهر بجانب اسم المنصة بعد تسجيل الدخول.",
    "error.profilePhoto": "الرجاء إرفاق صورة شخصية",

    "field.identityVerificationTitle": "التحقق من الهوية",
    "field.identityVerificationIntro": "هذه البيانات مطلوبة لمراجعة طلبك من قبل الإدارة قبل تفعيل حسابك، ويتم استخدامها للأغراض القانونية فقط.",
    "field.nationalId": "الرقم الوطني",
    "error.nationalId": "الرجاء إدخال الرقم الوطني",
    "field.idPhoto": "صورة الهوية",
    "error.idPhoto": "الرجاء التقاط أو إرفاق صورة للهوية",
    "field.idPhotoHint": "التقط صورة واضحة لهويتك الوطنية أو ارفقها من جهازك. تُستخدم هذه الصورة فقط للتحقق من هويتك من قبل الإدارة.",

    "photoCapture.profilePlaceholder": "أضف صورة شخصية واضحة",
    "photoCapture.idPlaceholder": "أضف صورة واضحة لبطاقة الهوية",
    "photoCapture.openCamera": "📷 التقاط بالكاميرا",
    "photoCapture.chooseFile": "🖼️ اختيار من الجهاز",
    "photoCapture.snap": "التقاط الصورة",
    "photoCapture.cancel": "إلغاء",
    "photoCapture.retake": "🔄 إعادة الالتقاط",
    "photoCapture.cameraUnavailable": "تعذّر الوصول إلى الكاميرا، الرجاء اختيار صورة من جهازك",

    "auth.pendingReviewMessage": "✅ تم إنشاء حسابك بنجاح! حسابك الآن بانتظار مراجعة الإدارة، وسيتم إشعارك عند الموافقة عليه.",
    "auth.accountPendingReview": "حسابك قيد المراجعة الإدارية، سيتم إشعارك عند الموافقة عليه.",
    "auth.accountRejected": "تم رفض طلب تسجيلك.",

    "nav.subscription": "اشتراكي",
    "meta.subscription.title": "اشتراكي | مباشر",
    "subscription.heading": "اشتراكي",
    "subscription.adminExemptNote": "حسابات فريق الإدارة معفاة من نظام الاشتراك الشهري/السنوي، ولا تحتاج إلى دفع أي رسوم لاستخدام لوحة التحكم.",
    "subscription.sub": "تابع حالة حسابك واشتراكك، وأكمل الدفع لتفعيل النشر على المنصة.",
    "subscription.loginNotice": "يجب تسجيل الدخول لعرض بيانات اشتراكك.",
    "subscription.paymentTitle": "إكمال الدفع لتفعيل الاشتراك",
    "subscription.method.bankak": "بنكك (بنك الخرطوم)",
    "subscription.method.ewallet": "محفظة إلكترونية",
    "subscription.method.card": "Visa / Mastercard",
    "subscription.method.banktransfer": "تحويل بنكي",
    "subscription.method.gateway": "بوابة دفع إلكترونية",
    "subscription.payNowBtn": "ادفع الآن",
    "subscription.paymentSimNote": "بيئة تجريبية: لا يتم تحصيل أي مبلغ فعلي، ويُستخدم هذا النموذج لمحاكاة عملية الدفع فقط.",
    "subscription.processing": "جارٍ معالجة الدفع...",
    "subscription.paymentSuccess": "تم الدفع بنجاح، تم تفعيل اشتراكك.",
    "subscription.trialDaysLeft": "متبقٍ {days} يوم من فترتك التجريبية المجانية (تنتهي في {date}).",
    "subscription.rejectedReason": "تم رفض طلب تسجيلك.",
    "subscription.activeSince": "اشتراكك نشط منذ",
    "subscription.remainingDays": "متبقٍ {days} يوم على انتهاء اشتراكك (ينتهي في {date}).",
    "subscription.extendBtn": "تمديد الاشتراك",
    "subscription.extendedSuccess": "تم تمديد اشتراكك بنجاح.",
    "subscription.selectedPlan": "الخطة المختارة:",
    "subscription.stageDetail.pending_review": "حسابك بانتظار مراجعة الإدارة للرقم الوطني وصورة الهوية. لا يمكنك نشر إعلانات حتى تتم الموافقة.",
    "subscription.stageDetail.rejected": "تم رفض طلب تسجيلك، يرجى التواصل مع الدعم الفني لمزيد من التفاصيل.",
    "subscription.stageDetail.trial": "أنت الآن ضمن الفترة التجريبية المجانية، ويمكنك نشر الإعلانات بحرية.",
    "subscription.stageDetail.active": "اشتراكك نشط، ويمكنك نشر الإعلانات بحرية.",
    "subscription.stageDetail.expired": "انتهت فترتك التجريبية ولم يتم تفعيل الاشتراك بعد. أكمل الدفع لمتابعة نشر الإعلانات.",
    "subscription.goToSubscriptionBtn": "إدارة الاشتراك",

    "admin.users.col.accountStage": "مرحلة الاشتراك",
    "admin.accountStage.pending_review": "بانتظار المراجعة",
    "admin.accountStage.rejected": "مرفوض",
    "admin.accountStage.trial": "تجربة مجانية",
    "admin.accountStage.active": "نشط",
    "admin.accountStage.expired": "منتهي",

    "admin.pendingReview.heading": "طلبات التسجيل بانتظار المراجعة",
    "admin.pendingReview.note": "راجع الرقم الوطني وصورة الهوية قبل الموافقة على الحساب. عند الموافقة تبدأ فترة تجربة مجانية مدتها 7 أيام تلقائيًا.",
    "admin.pendingReview.col.name": "الاسم",
    "admin.pendingReview.col.email": "البريد",
    "admin.pendingReview.col.nationalId": "الرقم الوطني",
    "admin.pendingReview.col.idPhoto": "صورة الهوية",
    "admin.pendingReview.col.plan": "الخطة المطلوبة",
    "admin.pendingReview.col.actions": "إجراءات",
    "admin.pendingReview.approveBtn": "موافقة",
    "admin.pendingReview.rejectBtn": "رفض",
    "admin.pendingReview.rejectReasonPrompt": "سبب الرفض (اختياري):",
    "admin.pendingReview.empty": "لا توجد طلبات تسجيل بانتظار المراجعة حاليًا.",

    "admin.auditAction.account_submitted_for_review": "إرسال طلب تسجيل للمراجعة",
    "admin.auditAction.user_approved": "الموافقة على حساب مستخدم",
    "admin.auditAction.user_rejected": "رفض طلب تسجيل مستخدم",
    "admin.auditAction.subscription_activated": "تفعيل الاشتراك بعد الدفع",
    "admin.auditAction.login_blocked_pending_review": "محاولة دخول لحساب بانتظار المراجعة",
    "admin.auditAction.login_blocked_rejected": "محاولة دخول لحساب مرفوض",

    "terms.s10.heading": "التحقق من الهوية ومراجعة الحسابات",
    "terms.s10.body": "عند إنشاء الحساب، يُطلب منك إدخال رقمك الوطني وإرفاق صورة لهويتك للتحقق من صحة بياناتك. يبقى الحساب معلّقًا حتى تتم مراجعته والموافقة عليه من قبل إدارة المنصة، ويحق للإدارة رفض أي طلب تسجيل لا تكتمل بياناته أو تبدو غير صحيحة.",
    "terms.s11.heading": "الاشتراك والفترة التجريبية والدفع",
    "terms.s11.body": "بعد الموافقة على بياناتك، تُمنح فترة تجربة مجانية مدتها 7 أيام لاستخدام المنصة. لاستمرار الاشتراك بعد انتهاء الفترة التجريبية، يجب إكمال عملية الدفع عبر إحدى وسائل الدفع المتاحة على المنصة، وتصبح حالة الاشتراك \"نشط\" تلقائيًا بعد نجاح عملية الدفع.",

    "privacy.s10.heading": "الرقم الوطني وصورة الهوية",
    "privacy.s10.body": "يُستخدم الرقم الوطني وصورة الهوية التي تقدّمها عند التسجيل حصريًا للتحقق من صحة بياناتك ومراجعتها من قبل إدارة المنصة، ولأغراض قانونية فقط. لا تتم مشاركة هذه البيانات مع أي طرف خارجي، ولا تُستخدم لأي غرض تسويقي.",

    "profile.title": "الملف الشخصي",
    "profile.changePhotoBtn": "تغيير الصورة",
    "profile.nameLabel": "الاسم الكامل",
    "profile.phoneLabel": "رقم الجوال",
    "profile.addressLabel": "العنوان",
    "profile.addressPlaceholder": "أدخل عنوانك",
    "profile.usernameLabel": "اسم المستخدم (لتسجيل الدخول)",
    "profile.usernamePlaceholder": "مثال: mohamed_ahmed",
    "profile.usernameFormatError": "3 إلى 20 حرفًا: أحرف إنجليزية أو أرقام أو _ أو . فقط",
    "profile.usernameTakenError": "اسم المستخدم هذا مُستخدَم بالفعل",
    "profile.usernameHint": "تستخدم اسم المستخدم هذا مع كلمة المرور لتسجيل الدخول إلى حسابك.",
    "profile.saveAddressBtn": "حفظ العنوان",
    "profile.saveInfoBtn": "حفظ البيانات",
    "profile.changePasswordTitle": "تغيير كلمة المرور",
    "profile.currentPasswordLabel": "كلمة المرور الحالية",
    "profile.newPasswordLabel": "كلمة المرور الجديدة",
    "profile.confirmNewPasswordLabel": "تأكيد كلمة المرور الجديدة",
    "profile.savePasswordBtn": "تحديث كلمة المرور",
    "profile.currentPasswordError": "كلمة المرور الحالية غير صحيحة",
    "profile.addressSaved": "تم حفظ العنوان بنجاح",
    "profile.infoSaved": "تم حفظ بياناتك بنجاح",
    "profile.fixInfoErrors": "الرجاء تصحيح البيانات أعلاه",
    "profile.passwordSaved": "تم تحديث كلمة المرور بنجاح",
    "profile.photoSaved": "تم تحديث الصورة الشخصية",
    "profile.fixPasswordErrors": "الرجاء تصحيح بيانات كلمة المرور أعلاه",
    "forgot.title": "نسيت كلمة المرور؟",
    "forgot.step1Sub": "أدخل اسم المستخدم أو بريدك الإلكتروني أو رقم جوالك المسجّل بحسابك",
    "forgot.adminStep1Sub": "أدخل اسم المستخدم أو البريد الإلكتروني المسجّل بحساب الإدارة الخاص بك",
    "forgot.identifierLabel": "اسم المستخدم أو البريد الإلكتروني أو رقم الجوال",
    "forgot.identifierError": "لا يوجد حساب مرتبط بهذه البيانات",
    "forgot.sendBtn": "إرسال كلمة مرور مؤقتة",
    "forgot.step2Title": "تحقق من كلمة المرور المؤقتة",
    "forgot.sentTo": "أرسلنا كلمة مرور مؤقتة إلى",
    "forgot.demoNote": "بيئة تجريبية: كلمة المرور المؤقتة معروضة هنا بدلاً من إرسالها فعليًا عبر البريد أو الرسائل.",
    "forgot.otpLabel": "أدخل كلمة المرور المؤقتة",
    "forgot.otpError": "كلمة المرور المؤقتة غير صحيحة",
    "forgot.verifyBtn": "تحقق",
    "forgot.step3Title": "تعيين كلمة مرور جديدة",
    "forgot.step3Sub": "كلمة المرور المؤقتة صالحة لاستخدام واحد فقط. عيّن كلمة مرور جديدة لحسابك",
    "forgot.newPassword": "كلمة المرور الجديدة",
    "forgot.resetBtn": "تعيين كلمة المرور والدخول",
    "hero.eyebrow": "منصة موثوقة للبيع والشراء",
    "hero.title": "منزلك القادم، أو سيارتك التالية، في مكان واحد",
    "hero.subtitle": "آلاف الإعلانات المُحقّقة للعقارات والسيارات والأراضي، من أصحابها مباشرة أو عبر وسطاء معتمدين.",
    "search.tab.realestate": "عقارات",
    "search.tab.land": "أراضي",
    "search.tab.commercial": "تجارية",
    "search.tab.cars": "سيارات",
    "search.tab.moto": "دراجات نارية",
    "search.keyword.label": "كلمة مفتاحية",
    "search.keyword.placeholder": "ابحث بعنوان الإعلان...",
    "search.city.label": "المدينة",
    "search.offerType.label": "نوع العرض",
    "search.budget.label": "الميزانية",
    "search.any": "الكل",
    "search.priceRange.label": "نطاق السعر",
    "search.priceFrom": "من",
    "search.priceTo": "إلى",
    "search.rooms.label": "عدد الغرف",
    "search.yearRange.label": "سنة الصنع",
    "search.yearFrom": "من سنة",
    "search.yearTo": "إلى سنة",
    "search.sort.label": "الترتيب",
    "search.sort.newest": "الأحدث أولاً",
    "search.sort.priceAsc": "السعر: من الأقل للأعلى",
    "search.sort.priceDesc": "السعر: من الأعلى للأقل",
    "search.noResults": "لا توجد نتائج مطابقة لبحثك.",
    "search.resultsFor": "نتائج البحث",
    "search.resultsUnit": "نتيجة",
    "search.clearBtn": "مسح الفلاتر",
    "search.cta": "ابحث الآن",
    "search.categoryAriaLabel": "اختر القسم",
    "search.advancedToggle": "فلاتر متقدمة",
    "search.filtersBtnAriaLabel": "فلاتر البحث",
    "favorites.toggleBtn": "إضافة/إزالة من المفضلة",
    "nav.favorites": "المفضلة",
    "bottomNav.home": "الرئيسية",
    "bottomNav.favorites": "المفضلة",
    "bottomNav.add": "أضف",
    "bottomNav.messages": "رسائلي",
    "bottomNav.profile": "حسابي",
    "favorites.heading": "إعلاناتي المفضلة",
    "favorites.sub": "الإعلانات التي حفظتها لمتابعتها لاحقًا.",
    "favorites.empty": "لم تُضف أي إعلانات إلى المفضلة بعد.",
    "favorites.loginNotice": "يجب تسجيل الدخول لعرض قائمة المفضلة.",
    "meta.favorites.title": "المفضلة | مباشر",
    "reviews.heading": "تقييمات ومراجعات البائع",
    "reviews.yourRating": "تقييمك",
    "reviews.commentLabel": "تعليقك (اختياري)",
    "reviews.submitBtn": "إرسال التقييم",
    "reviews.loginToReview": "يجب تسجيل الدخول لإضافة تقييم.",
    "reviews.noReviewsYet": "لا توجد تقييمات لهذا البائع حتى الآن.",
    "reviews.reviewsCountSuffix": "تقييم",
    "seller.verifiedBadge": "بائع موثّق",
    "seller.verifiedBadgeTooltip": "تم التحقق من هوية هذا البائع من قبل إدارة المنصة.",
    "reviews.selectRatingAlert": "الرجاء اختيار عدد النجوم أولاً.",
    "city.khartoum": "الخرطوم",
    "city.omdurman": "أم درمان",
    "city.bahri": "بحري",
    "city.madani": "مدني",
    "city.portsudan": "بورتسودان",
    "city.kassala": "كسلا",
    "city.elobeid": "الأبيض",
    "city.nyala": "نيالا",
    "city.elfasher": "الفاشر",
    "city.elgeneina": "الجنينة",
    "city.kosti": "كوستي",
    "city.sennar": "سنار",
    "city.eddamazin": "الدمازين",
    "city.atbara": "عطبرة",
    "city.dongola": "دنقلا",
    "city.gadarif": "القضارف",
    "city.shendi": "شندي",
    "city.kadugli": "كادقلي",
    "city.zalingei": "زالنجي",
    "city.eddamer": "الدامر",
    "offer.sale": "للبيع",
    "offer.rent": "للإيجار",
    "budget.low": "أقل من 500 ألف",
    "budget.mid": "500 ألف - مليون",
    "budget.high": "أكثر من مليون",
    "cat.apartments.title": "شقق وفلل",
    "cat.apartments.count": "3٬240 إعلان",
    "cat.land.title": "أراضي",
    "cat.land.count": "1٬180 إعلان",
    "cat.cars.title": "سيارات",
    "cat.cars.count": "2٬560 إعلان",
    "cat.commercial.title": "عقارات تجارية",
    "cat.commercial.count": "640 إعلان",
    "cat.moto.title": "دراجات نارية",
    "cat.moto.count": "310 إعلان",
    "realestate.heading": "أحدث العقارات",
    "realestate.sub": "فلل وشقق وأراضي مختارة بعناية هذا الأسبوع",
    "realestate.seeAll": "عرض جميع العقارات",
    "listing1.price": "1٬250٬000 ج.س",
    "listing1.title": "فيلا دوبلكس راقية بحي الياسمين",
    "listing1.loc": "الخرطوم — حي الرياض",
    "listing2.price": "4٬500 ج.س / شهرياً",
    "listing2.title": "شقة مفروشة بإطلالة على النيل",
    "listing2.loc": "أم درمان — الثورة",
    "listing3.price": "680٬000 ج.س",
    "listing3.title": "قطعة أرض سكنية مخططة",
    "listing3.loc": "بحري — الكدرو",
    "spec.rooms": "غرف",
    "spec.baths": "حمامات",
    "spec.sqm": "م²",
    "spec.corner": "زاوية",
    "spec.eTitle": "صك إلكتروني",
    "cars.heading": "أحدث السيارات",
    "cars.sub": "سيارات مفحوصة وموثقة من أصحابها",
    "cars.seeAll": "عرض جميع السيارات",
    "listing4.price": "96٬000 ج.س",
    "listing4.title": "تويوتا لاندكروزر GXR 2023",
    "listing4.loc": "الخرطوم",
    "listing5.price": "61٬500 ج.س",
    "listing5.title": "هيونداي سوناتا 2022 فل كامل",
    "listing5.loc": "أم درمان",
    "listing6.price": "142٬000 ج.س",
    "listing6.title": "مرسيدس C200 موديل 2024",
    "listing6.loc": "بحري",
    "spec.thousandKm": "ألف كم",
    "spec.automatic": "أوتوماتيك",
    "spec.petrol": "بنزين",
    "spec.dealerWarranty": "ضمان الوكالة",
    "promo.heading": "عندك عقار أو سيارة تبيعها؟",
    "promo.sub": "انشر إعلانك مجاناً ويصل لآلاف المهتمين الجادين خلال دقائق.",
    "promo.point1": "نشر الإعلان خلال دقائق بدون تعقيد",
    "promo.point2": "توثيق الإعلانات لحماية البائع والمشتري",
    "promo.point3": "تواصل مباشر مع المهتمين عبر المنصة",
    "promo.cta": "أضف إعلانك الآن",
    "trust.support.title": "دعم محلي",
    "trust.support.sub": "فريق دعم سوداني يرد عليك بسرعة عند أي استفسار",
    "trust.search.title": "بحث أسهل",
    "trust.search.sub": "فلاتر ذكية وبحث بالخريطة تصلك بالإعلان المناسب فورًا",
    "trust.verified.title": "إعلانات موثوقة",
    "trust.verified.sub": "بائعون موثّقون وإعلانات مراجعة لحمايتك من الاحتيال",
    "footer.cta.heading": "انضم إلى مباشر اليوم",
    "footer.cta.sub": "أنشئ حسابك وابدأ بنشر إعلاناتك أو تصفح آلاف العروض المتاحة",
    "footer.cta.btn": "سجّل الآن",
    "footer.about": "منصة سودانية لعرض وبيع وشراء العقارات والأراضي والسيارات والدراجات النارية مباشرة بين الأفراد والوسطاء.",
    "footer.sections.heading": "الأقسام",
    "footer.sections.saleRealestate": "عقارات للبيع",
    "footer.sections.rentRealestate": "عقارات للإيجار",
    "footer.sections.land": "أراضي",
    "footer.sections.cars": "سيارات",
    "footer.sections.moto": "دراجات نارية",
    "footer.company.heading": "الشركة",
    "footer.company.about": "من نحن",
    "footer.company.contact": "تواصل معنا",
    "footer.company.faq": "الأسئلة الشائعة",
    "footer.contact.heading": "تواصل",
    "footer.contact.support": "الدعم الفني",
    "footer.contact.terms": "الشروط والأحكام",
    "footer.contact.privacy": "سياسة الخصوصية",
    "footer.copyright": "© 2026 مباشر. جميع الحقوق محفوظة.",
    "listingPage.heading": "أضف إعلانك",
    "listingPage.sub": "اختر نوع ما تعرضه، وأدخل التفاصيل. جميع الأسعار بالجنيه السوداني.",
    "listingPage.categoryTitle": "نوع الإعلان",
    "listingPage.cat.land": "قطعة أرض",
    "listingPage.cat.residential": "عقار سكني",
    "listingPage.cat.commercial": "عقار تجاري",
    "listingPage.cat.car": "سيارة",
    "listingPage.cat.motorcycle": "دراجة نارية",
    "listingPage.categoryError": "الرجاء اختيار نوع الإعلان",
    "listingPage.detailsTitle": "بيانات الإعلان",
    "listingPage.offerTypeError": "الرجاء اختيار نوع العرض",
    "listingPage.priceLabel": "السعر (بالجنيه السوداني)",
    "listingPage.priceError": "الرجاء إدخال سعر صحيح",
    "listingPage.cityChoose": "اختر المدينة...",
    "listingPage.cityError": "الرجاء اختيار المدينة",
    "listingPage.landDetails": "تفاصيل الأرض",
    "listingPage.areaLabel": "المساحة (م²)",
    "listingPage.areaError": "الرجاء إدخال المساحة",
    "listingPage.landTypeLabel": "نوع الأرض",
    "listingPage.landTypeError": "الرجاء اختيار نوع الأرض",
    "listingPage.addressLabel": "العنوان",
    "listingPage.addressPlaceholder": "الحي، الشارع، أقرب علامة مميزة",
    "listingPage.landNumberPlaceholder": "مثال: 1234/56",
    "listingPage.resNumberPlaceholder": "مثال: 4521",
    "listingPage.comNumberPlaceholder": "مثال: 7788",
    "listingPage.carRegistrationPlaceholder": "مثال: KRT-778241",
    "field.fullNamePlaceholder": "محمد أحمد",
    "profile.closeBtnLabel": "إغلاق",
    "brand.initial": "م",
    "listingPage.addressError": "الرجاء إدخال العنوان",
    "listingPage.landNumberLabel": "رقم قطعة الأرض",
    "listingPage.landNumberError": "الرجاء إدخال رقم قطعة الأرض",
    "listingPage.landNumberDuplicate": "هذه الأرض تم نشر إعلان لها من قبل بنفس الرقم، لا يمكن نشر إعلان مكرر لنفس القطعة.",
    "listingPage.propertyNumberLabel": "رقم العقار",
    "listingPage.propertyNumberError": "الرجاء إدخال رقم العقار",
    "listingPage.propertyNumberDuplicate": "هذا العقار تم نشر إعلان له من قبل بنفس الرقم، لا يمكن نشر إعلان مكرر لنفس العقار.",
    "listingPage.carRegistrationLabel": "رقم استمارة السيارة",
    "listingPage.carRegistrationError": "الرجاء إدخال رقم استمارة السيارة",
    "listingPage.carRegistrationDuplicate": "تم نشر إعلان لهذه السيارة من قبل بنفس رقم الاستمارة، لا يمكن نشر إعلان مكرر لنفس السيارة.",
    "listingPage.internalOnlyHintProperty": "لن يظهر هذا الرقم للعملاء، ويُستخدم داخليًا فقط لمنع تكرار نشر نفس العقار أو قطعة الأرض أكثر من مرة.",
    "listingPage.internalOnlyHintCar": "لن يظهر هذا الرقم للعملاء، ويُستخدم داخليًا فقط لمنع تكرار نشر نفس السيارة أكثر من مرة.",
    "landType.residential": "سكنية",
    "landType.commercial": "تجارية",
    "landType.agricultural": "زراعية",
    "listingPage.resDetails": "تفاصيل العقار السكني",
    "listingPage.roomsLabel": "عدد الغرف",
    "listingPage.roomsError": "الرجاء إدخال عدد الغرف",
    "listingPage.bathsLabel": "عدد الحمامات",
    "listingPage.bathsError": "الرجاء إدخال عدد الحمامات",
    "listingPage.comDetails": "تفاصيل العقار التجاري",
    "listingPage.comTypeLabel": "نوع الاستخدام",
    "listingPage.comTypeError": "الرجاء اختيار نوع الاستخدام",
    "comType.shop": "محل تجاري",
    "comType.office": "مكتب",
    "comType.warehouse": "مستودع",
    "comType.mall": "مجمع تجاري",
    "listingPage.carDetails": "تفاصيل السيارة",
    "listingPage.motoDetails": "تفاصيل الدراجة النارية",
    "listingPage.brandLabel": "شركة التصنيع",
    "listingPage.brandChoose": "اختر الشركة...",
    "listingPage.brandError": "الرجاء اختيار شركة التصنيع",
    "listingPage.modelLabel": "الموديل",
    "listingPage.modelChooseBrandFirst": "اختر الشركة أولاً",
    "listingPage.modelChoose": "اختر الموديل...",
    "listingPage.modelError": "الرجاء اختيار الموديل",
    "listingPage.yearLabel": "سنة الصنع",
    "listingPage.yearChoose": "اختر السنة...",
    "listingPage.yearError": "الرجاء اختيار سنة الصنع",
    "listingPage.descTitle": "وصف الإعلان",
    "listingPage.descLabel": "وصف إضافي (اختياري)",
    "listingPage.descPlaceholder": "أضف أي تفاصيل إضافية تساعد المهتمين، مثل الحالة، الإضافات، أو سبب البيع...",
    "listingPage.descHint": "للسيارات والدراجات: اذكر حالة الفحص، المسافة المقطوعة، أو أي تعديلات.",
    "listingPage.photosTitle": "الصور",
    "listingPage.photosLabel": "إرفاق صور (اختياري)",
    "listingPage.photosHint": "يمكنك إرفاق أكثر من صورة لإعلانك. هذه الخطوة اختيارية.",
    "listingPage.publishBtn": "نشر الإعلان",
    "listingPage.fixErrors": "الرجاء تصحيح البيانات المُعلّمة أعلاه قبل نشر الإعلان.",
    "listingPage.photosStorageQuotaError": "تعذّر نشر الإعلان بسبب كِبَر حجم الصور المرفقة. الرجاء إرفاق عدد أقل من الصور، أو صور بحجم أصغر، ثم إعادة المحاولة.",
    "listingPage.publishing": "جارٍ النشر...",
    "listingPage.success": "تم نشر إعلانك بنجاح، جارٍ تحويلك للصفحة الرئيسية...",
    "listingPage.odometerLabel": "عداد الكيلومترات (كم)",
    "listingPage.odometerError": "الرجاء إدخال قراءة عداد الكيلومترات",
    "listingPage.photosLabelRequired": "إرفاق صور",
    "listingPage.dropzoneText": "اسحب الصور وأفلتها هنا، أو اضغط للاختيار من جهازك",
    "listingPage.photosError": "الرجاء إرفاق صورة واحدة على الأقل",
    "listingPage.photosHintRequired": "يجب إرفاق صورة واحدة على الأقل لنشر الإعلان.",
    "listingPage.customFieldRequiredError": "الرجاء تعبئة هذا الحقل",
    "listingPage.authRequired": "يجب تسجيل الدخول لنشر إعلان على المنصة.",
    "listingPage.noDescription": "لم يقم صاحب الإعلان بإضافة وصف إضافي.",
    "listingPage.ownAdNote": "هذا إعلانك الخاص. يمكنك متابعة الرسائل الواردة بخصوصه من صفحة رسائلي.",
    "listingPage.loginToMessagePrompt": "يجب تسجيل الدخول للتواصل مع صاحب الإعلان.",
    "listingPage.messagePlaceholder": "اكتب رسالتك لصاحب الإعلان هنا...",
    "listingPage.sendMessageBtn": "إرسال الرسالة",
    "listingPage.viewMessagesLink": "عرض رسائلي",
    "listingPage.detailBack": "← رجوع لكل الإعلانات",
    "listingPage.notFoundTitle": "الإعلان غير موجود",
    "listingPage.notFoundBody": "قد يكون هذا الإعلان قد حُذف أو أن الرابط غير صحيح.",
    "listingPage.galleryNoPhotos": "لا توجد صور مرفقة لهذا الإعلان",
    "listingPage.hiddenByAdminNotice": "تم إخفاء هذا الإعلان من قبل إدارة المنصة، ولا يظهر للمستخدمين الآخرين.",
    "listingPage.reportLink": "الإبلاغ عن هذا الإعلان",
    "listingPage.reportReasonLabel": "سبب الإبلاغ",
    "listingPage.reportReason.misleading": "معلومات مضللة",
    "listingPage.reportReason.duplicate": "إعلان مكرر",
    "listingPage.reportReason.soldElsewhere": "تم البيع في مكان آخر",
    "listingPage.reportReason.inappropriate": "محتوى غير لائق",
    "listingPage.reportReason.other": "أخرى",
    "listingPage.reportDetailsLabel": "تفاصيل إضافية (اختياري)",
    "listingPage.reportSubmitBtn": "إرسال البلاغ",
    "listingPage.reportSubmitted": "تم إرسال البلاغ، شكرًا لك",
    "adminRole.super_admin": "مدير عام (Super Admin)",
    "adminRole.admin": "مدير (Admin)",
    "adminRole.moderator": "مشرف مراجعة (Moderator)",
    "adminRole.support": "دعم فني (Support)",
    "adminRole.finance_admin": "مدير مالي (Finance Admin)",
    "adminRole.content_admin": "مدير محتوى (Content Admin)",

    "meta.admin.title": "لوحة تحكم الإدارة | مباشر",
    "admin.badge": "الإدارة",
    "admin.loginRequired": "يجب تسجيل الدخول للوصول إلى لوحة تحكم الإدارة.",
    "admin.accessDenied": "حسابك لا يملك صلاحية الوصول إلى لوحة تحكم الإدارة.",

    "adminAuth.visualTitle": "بوابة دخول مخصصة لفريق الإدارة",
    "adminAuth.visualSub": "هذه الصفحة مخصصة لحسابات الإدارة فقط، منفصلة تمامًا عن تسجيل دخول المستخدمين.",
    "adminAuth.loginTitle": "تسجيل دخول الإدارة",
    "adminAuth.loginSub": "لحسابات الإدارة والمدراء فقط",
    "adminAuth.emailOrUsernameLabel": "اسم المستخدم",
    "adminAuth.emailOrUsernameError": "الرجاء إدخال اسم مستخدم صحيح",
    "adminAuth.needNewAdmin": "هل تريد تسجيل مدير جديد؟",
    "adminAuth.notAdmin": "لست مديرًا؟",
    "adminAuth.goUserLogin": "تسجيل دخول المستخدمين",
    "adminAuth.notAdminAccount": "هذا الحساب ليس حساب إدارة، الرجاء استخدام صفحة تسجيل دخول المستخدمين.",
    "adminAuth.imAdmin": "دخول فريق الإدارة",
    "admin.bootstrapNote": "لا يوجد بعد أي حساب \"مدير عام\" على المنصة. بصفتك أول مستخدم يفتح هذه الصفحة، يمكنك تفعيل صلاحية المدير العام لحسابك الحالي.",
    "admin.claimSuperAdminBtn": "تفعيل صلاحية المدير العام لحسابي",
    "admin.twoFactorPrompt": "هذا الحساب مفعّل عليه التحقق بخطوتين. أدخل الرمز المؤقت المعروض أدناه لإثبات الهوية (بيئة تجريبية: يظهر الرمز هنا بدلاً من إرساله فعليًا).",
    "admin.registerNewAdminBtn": "تسجيل مدير جديد",
    "admin.registerNewAdmin.heading": "تسجيل مدير جديد",
    "admin.registerNewAdmin.note": "هذه العملية متاحة فقط للمدير العام (Super Admin). أدخل بيانات المدير العام أدناه لتفويض العملية، ثم بيانات المدير الجديد ونوع صلاحياته.",
    "admin.registerNewAdmin.bypassNotice": "⚠️ وضع استرجاع مؤقت: تفويض المدير العام معطّل حاليًا، والحساب الذي ستنشئه أدناه سيُمنح صلاحية \"مدير عام\" كاملة مباشرة. أعد تفعيل التفويض في الكود بعد استرجاع وصولك.",
    "admin.registerNewAdmin.authorizerTitle": "بيانات المدير العام (للتفويض)",
    "admin.registerNewAdmin.authorizerError": "بيانات المدير العام غير صحيحة، أو الحساب لا يملك صلاحية المدير العام",
    "admin.registerNewAdmin.newAdminTitle": "بيانات المدير الجديد",
    "admin.registerNewAdmin.roleLabel": "نوع الصلاحية",
    "admin.registerNewAdmin.submitBtn": "تسجيل المدير الجديد",
    "admin.registerNewAdmin.backBtn": "العودة لتسجيل الدخول",
    "admin.registerNewAdmin.success": "✅ تم إنشاء حساب المدير الجديد بنجاح! يتم الآن تحويلك إلى صفحة تسجيل الدخول...",
    "admin.logoutBtn": "تسجيل الخروج",
    "admin.role.user": "مستخدم عادي",

    "admin.nav.dashboard": "لوحة التحكم",
    "admin.nav.users": "المستخدمون",
    "admin.nav.cars": "السيارات",
    "admin.nav.properties": "العقارات",
    "admin.nav.categories": "فئات المنصة",
    "admin.nav.listings": "الإعلانات",
    "admin.nav.payments": "المدفوعات",
    "admin.nav.subscriptions": "الاشتراكات",
    "admin.nav.reports": "البلاغات والشكاوى",
    "admin.nav.content": "المحتوى",
    "admin.nav.settings": "الإعدادات",
    "admin.nav.adminUsers": "مستخدمو الإدارة",
    "admin.nav.auditLogs": "سجل العمليات",
    "admin.nav.database": "إدارة قاعدة البيانات",

    "admin.database.heading": "إدارة قاعدة البيانات",
    "admin.database.pageNote": "للمدير العام حصريًا — وصول مباشر لكل بيانات المنصة المخزّنة. اختر جدولًا من الأعلى، ثم أضف أو عدّل أو احذف أي سجل. يمكنك أيضًا تحرير الجدول كاملاً كنص JSON خام لتعديلات جماعية سريعة.",
    "admin.database.note": "كل تعديل هنا مباشر وفوري على البيانات الفعلية — لا يوجد \"تراجع\". يُنصح بالحذر خاصة عند تعديل جدول المستخدمين.",
    "admin.database.searchPlaceholder": "ابحث داخل السجلات...",
    "admin.database.addRecordBtn": "+ سجل جديد",
    "admin.database.editRawBtn": "تحرير الجدول كاملاً (JSON خام)",
    "admin.database.col.id": "المعرّف",
    "admin.database.col.preview": "معاينة السجل",
    "admin.database.col.actions": "إجراءات",
    "admin.database.emptyTable": "لا توجد سجلات في هذا الجدول.",
    "admin.database.editBtn": "تعديل",
    "admin.database.deleteBtn": "حذف",
    "admin.database.deleteConfirm": "هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء.",
    "admin.database.addRecordHeading": "إضافة سجل جديد",
    "admin.database.editRecordHeading": "تعديل السجل",
    "admin.database.rawEditHeading": "تحرير الجدول كاملاً (JSON خام)",
    "admin.database.rawEditWarning": "تحذير: استبدال محتوى الحقل التالي يستبدل الجدول بأكمله فورًا عند الحفظ. تأكد من صحة تنسيق JSON قبل الحفظ.",
    "admin.database.saveBtn": "حفظ",
    "admin.database.cancelBtn": "إلغاء",
    "admin.database.invalidJsonError": "تنسيق JSON غير صحيح. الرجاء مراجعة النص والمحاولة مجددًا.",
    "admin.database.notArrayError": "يجب أن يكون محتوى الجدول عبارة عن قائمة [ ] من السجلات.",
    "admin.database.missingIdError": "هذا السجل يحتاج قيمة للحقل المعرّف قبل الحفظ.",
    "admin.database.duplicateIdError": "يوجد سجل آخر بنفس المعرّف بالفعل. استخدم معرّفًا مختلفًا.",
    "admin.database.lastSuperAdminError": "لا يمكن حفظ هذا التغيير — سيؤدي إلى عدم وجود أي حساب \"مدير عام\" على المنصة، ما يفقدك الوصول للوحة التحكم بالكامل.",
    "admin.database.table.users": "المستخدمون",
    "admin.database.table.listings": "الإعلانات",
    "admin.database.table.messages": "الرسائل",
    "admin.database.table.notifications": "الإشعارات",
    "admin.database.table.favorites": "المفضّلة",
    "admin.database.table.reviews": "التقييمات",
    "admin.database.table.reports": "البلاغات",
    "admin.database.table.coupons": "الكوبونات",
    "admin.database.table.customCategories": "الفئات المخصّصة",
    "admin.database.table.auditLog": "سجل العمليات",
    "admin.database.fieldFormHint": "حرّر كل حقل من مكانه مباشرة. الحقول النصية الطويلة والقوائم/الكائنات تُحرَّر كنص JSON قصير داخل نفس الحقل.",
    "admin.database.newFieldKeyPlaceholder": "اسم حقل جديد",
    "admin.database.newFieldValuePlaceholder": "القيمة (اختياري)",
    "admin.database.addFieldBtn": "+ إضافة حقل",
    "admin.database.duplicateFieldKeyError": "يوجد حقل بهذا الاسم بالفعل في هذا السجل.",
    "admin.database.invalidFieldJsonError": "تنسيق JSON غير صحيح في الحقل/الحقول التالية: {fields}",
    "admin.database.attachmentValue": "مرفق (محتوى طويل)",
    "admin.database.fieldType.text": "نص",
    "admin.database.fieldType.number": "رقم",
    "admin.database.fieldType.boolean": "منطقي",
    "admin.database.fieldType.textarea": "نص طويل",
    "admin.database.fieldType.array": "قائمة",
    "admin.database.fieldType.object": "كائن",

    "admin.auditAction.database_record_created": "إضافة سجل عبر إدارة قاعدة البيانات",
    "admin.auditAction.database_record_updated": "تعديل سجل عبر إدارة قاعدة البيانات",
    "admin.auditAction.database_record_deleted": "حذف سجل عبر إدارة قاعدة البيانات",
    "admin.auditAction.database_table_bulk_edited": "تحرير جدول كامل عبر إدارة قاعدة البيانات",

    "admin.categories.heading": "إدارة فئات المنصة",
    "admin.categories.addBtn": "إضافة فئة جديدة",
    "admin.categories.note": "الفئات الأساسية (أرض، عقار سكني، عقار تجاري، سيارة، دراجة نارية) ثابتة ولا يمكن حذفها. يمكنك إضافة فئات جديدة بالكامل للمنصة، وتحديد حقولها الخاصة.",
    "admin.categories.col.icon": "الأيقونة",
    "admin.categories.col.name": "الاسم",
    "admin.categories.col.group": "المجموعة",
    "admin.categories.col.fields": "عدد الحقول",
    "admin.categories.col.listings": "عدد الإعلانات",
    "admin.categories.col.type": "النوع",
    "admin.categories.group.realestate": "عقارات",
    "admin.categories.group.vehicles": "مركبات",
    "admin.categories.builtinBadge": "أساسية",
    "admin.categories.customBadge": "مخصّصة",
    "admin.categories.builtinNote": "فئة أساسية بالمنصة",
    "admin.categories.editBtn": "تعديل",
    "admin.categories.deleteBtn": "حذف",
    "admin.categories.deleteBlockedHasListings": "لا يمكن حذف هذه الفئة لوجود إعلانات منشورة تستخدمها. احذف أو انقل تلك الإعلانات أولاً.",
    "admin.categories.deleteConfirm": "هل أنت متأكد من حذف هذه الفئة؟ لا يمكن التراجع عن هذا الإجراء.",
    "admin.categories.editHeading": "تعديل الفئة",
    "admin.categories.addHeading": "إضافة فئة جديدة",
    "admin.categories.nameArLabel": "الاسم بالعربية",
    "admin.categories.nameEnLabel": "الاسم بالإنجليزية",
    "admin.categories.iconLabel": "أيقونة (رمز تعبيري، اختياري)",
    "admin.categories.groupLabel": "المجموعة",
    "admin.categories.fieldsHeading": "حقول هذه الفئة",
    "admin.categories.fieldsNote": "أضف الحقول الخاصة بهذه الفئة (مثل: المساحة، اللون، السعة...). كل حقل يظهر في نموذج نشر الإعلان لهذه الفئة تحديدًا.",
    "admin.categories.fieldLabelAr": "التسمية بالعربية",
    "admin.categories.fieldLabelEn": "التسمية بالإنجليزية",
    "admin.categories.fieldTypeLabel": "نوع الحقل",
    "admin.categories.fieldType.text": "نص",
    "admin.categories.fieldType.number": "رقم",
    "admin.categories.fieldType.select": "قائمة اختيار",
    "admin.categories.fieldType.year": "سنة",
    "admin.categories.fieldRequired": "حقل إلزامي",
    "admin.categories.fieldInternal": "داخلي فقط (لا يظهر للعملاء)",
    "admin.categories.optionsHint": "خيارات القائمة:",
    "admin.categories.addOptionBtn": "+ إضافة خيار",
    "admin.categories.removeOptionBtn": "حذف الخيار",
    "admin.categories.addFieldBtn": "+ إضافة حقل جديد",
    "admin.categories.removeFieldBtn": "حذف هذا الحقل",
    "admin.categories.saveBtn": "حفظ الفئة",
    "admin.categories.cancelBtn": "إلغاء",
    "admin.categories.nameRequiredError": "الرجاء إدخال اسم الفئة بالعربية والإنجليزية",
    "admin.categories.fieldLabelRequiredError": "الرجاء إدخال تسمية كل حقل بالعربية والإنجليزية",

    "admin.dashboard.heading": "لوحة التحكم",
    "admin.dashboard.topCities": "أكثر المناطق نشاطًا",
    "admin.dashboard.noCityData": "لا توجد بيانات كافية بعد.",
    "admin.dashboard.stat.users": "عدد المستخدمين",
    "admin.dashboard.stat.listings": "عدد الإعلانات",
    "admin.dashboard.stat.cars": "عدد السيارات والدراجات",
    "admin.dashboard.stat.properties": "عدد العقارات والأراضي",
    "admin.dashboard.stat.sold": "الإعلانات المباعة",
    "admin.dashboard.stat.revenue": "الإيرادات التقديرية",
    "admin.dashboard.stat.newSubs": "اشتراكات جديدة (7 أيام)",
    "admin.dashboard.stat.activeUsers": "مستخدمون نشطون (30 يوم)",

    "admin.users.heading": "إدارة المستخدمين",
    "admin.users.searchPlaceholder": "بحث بالاسم أو البريد...",
    "admin.users.col.name": "الاسم",
    "admin.users.col.email": "البريد",
    "admin.users.col.phone": "الجوال",
    "admin.users.col.photo": "الصورة الشخصية",
    "admin.users.col.password": "كلمة المرور",
    "admin.users.col.role": "الدور",
    "admin.users.col.status": "الحالة",
    "admin.users.col.plan": "الخطة",
    "admin.users.col.joined": "آخر دخول",
    "admin.users.col.actions": "إجراءات",
    "admin.users.filterAllRoles": "كل الأدوار",
    "admin.users.filterAllStatuses": "كل الحالات",
    "admin.users.revealPassword": "إظهار/إخفاء كلمة المرور",
    "admin.users.resetPassword": "إعادة تعيين كلمة المرور",
    "admin.users.resetPasswordConfirm": "سيتم إنشاء كلمة مرور مؤقتة جديدة لهذا المستخدم وإلغاء كلمة مروره الحالية. هل تريد المتابعة؟",
    "admin.users.resetPasswordHint": "كلمة مرور مؤقتة جديدة — سلّمها للمستخدم فورًا، ولن تظهر مرة أخرى بعد مغادرة الصفحة",
    "admin.users.statusActive": "نشط",
    "admin.users.statusDisabled": "معطّل",
    "admin.users.flagged": "مشبوه",
    "admin.users.enableBtn": "تفعيل",
    "admin.users.disableBtn": "تعطيل",
    "admin.users.flagBtn": "وضع علامة مشبوه",
    "admin.users.unflagBtn": "إزالة العلامة",
    "admin.users.deleteBtn": "حذف",
    "admin.users.deleteConfirm": "هل أنت متأكد من حذف هذا الحساب نهائيًا؟",
    "admin.users.cannotDeleteSelf": "لا يمكنك حذف حسابك الخاص من هنا.",
    "admin.users.neverLoggedIn": "لم يسجّل الدخول بعد",
    "admin.users.lastSuperAdminWarning": "لا يمكن ترك المنصة بدون مدير عام واحد على الأقل.",
    "admin.users.onlyOneSuperAdmin": "يوجد مدير عام (Super Admin) واحد بالفعل، ولا يمكن إضافة أكثر من مدير عام واحد. يجب إزالة صلاحية المدير العام الحالي أولًا إن رغبت بنقلها لشخص آخر.",

    "admin.cars.heading": "إدارة السيارات والدراجات النارية",
    "admin.properties.heading": "إدارة العقارات والأراضي",
    "admin.listings.heading": "جميع الإعلانات",
    "admin.listings.searchPlaceholder": "بحث في الإعلانات...",
    "admin.listings.col.category": "النوع",
    "admin.listings.col.title": "الإعلان",
    "admin.listings.col.owner": "المالك",
    "admin.listings.col.price": "السعر",
    "admin.listings.col.city": "المدينة",
    "admin.listings.col.status": "الحالة",
    "admin.listings.col.visibility": "الظهور",
    "admin.listings.col.actions": "إجراءات",
    "admin.listings.hidden": "مخفي",
    "admin.listings.visible": "ظاهر",
    "admin.listings.hideBtn": "إخفاء",
    "admin.listings.unhideBtn": "إظهار",

    "admin.payments.heading": "المدفوعات",
    "admin.payments.simulatedNote": "بيانات مشتقة من خطط الاشتراك الحالية للمستخدمين. لا توجد بوابة دفع فعلية مربوطة بهذا الموقع التجريبي.",
    "admin.payments.mrr": "الإيراد الشهري التقديري",
    "admin.payments.arr": "الإيراد السنوي التقديري",
    "admin.payments.totalSubscribers": "إجمالي المشتركين",
    "admin.payments.perYear": "سنويًا",
    "admin.payments.col.user": "المستخدم",
    "admin.payments.col.plan": "الخطة",
    "admin.payments.col.amount": "القيمة التقديرية",

    "admin.subscriptions.heading": "الاشتراكات",
    "admin.subscriptions.col.user": "المستخدم",
    "admin.subscriptions.col.plan": "الخطة الحالية",
    "admin.subscriptions.col.actions": "تغيير الخطة",
    "admin.subscriptions.planUpdated": "تم تحديث خطة اشتراك المستخدم بنجاح.",
    "admin.subPricing.heading": "أسعار الاشتراك (للمدير العام فقط)",
    "admin.subPricing.note": "تعديل السعر الشهري والسنوي للاشتراك. تنعكس التغييرات فورًا على صفحة إنشاء الحساب وصفحة \"اشتراكي\".",
    "admin.subPricing.monthlyLabel": "السعر الشهري (ج.س)",
    "admin.subPricing.yearlyLabel": "السعر السنوي (ج.س)",
    "admin.subPricing.saveBtn": "حفظ الأسعار",
    "admin.subDiscount.heading": "خصم على أسعار الاشتراك بتاريخ محدد",
    "admin.subDiscount.note": "يُطبَّق الخصم تلقائيًا على السعرين الشهري والسنوي خلال الفترة المحددة فقط.",
    "admin.subDiscount.percentLabel": "نسبة الخصم %",
    "admin.subDiscount.startLabel": "تاريخ البداية",
    "admin.subDiscount.endLabel": "تاريخ النهاية",
    "admin.subDiscount.saveBtn": "حفظ الخصم",
    "admin.subDiscount.invalidRange": "الرجاء تحديد تاريخ بداية ونهاية صحيحين (البداية قبل النهاية).",

    "admin.coupons.heading": "العروض والكوبونات",
    "admin.coupons.codePlaceholder": "كود الكوبون",
    "admin.coupons.discountPlaceholder": "نسبة الخصم %",
    "admin.coupons.addBtn": "إضافة",
    "admin.coupons.col.code": "الكود",
    "admin.coupons.col.discount": "الخصم",
    "admin.coupons.col.status": "الحالة",
    "admin.coupons.col.actions": "إجراءات",
    "admin.coupons.active": "فعّال",
    "admin.coupons.inactive": "متوقف",
    "admin.coupons.activateBtn": "تفعيل",
    "admin.coupons.deactivateBtn": "إيقاف",
    "admin.coupons.added": "تمت إضافة الكوبون بنجاح.",

    "admin.reports.heading": "البلاغات والشكاوى",
    "admin.reports.col.listing": "الإعلان",
    "admin.reports.col.reporter": "المُبلّغ",
    "admin.reports.col.reason": "السبب",
    "admin.reports.col.status": "الحالة",
    "admin.reports.col.date": "التاريخ",
    "admin.reports.col.actions": "إجراءات",
    "admin.reports.listingDeleted": "تم حذف الإعلان",
    "admin.reports.resolveBtn": "معالجة",
    "admin.reports.dismissBtn": "تجاهل",
    "admin.reports.deleteListingBtn": "حذف الإعلان",
    "admin.reports.status.open": "مفتوح",
    "admin.reports.status.resolved": "تمت المعالجة",
    "admin.reports.status.dismissed": "تم التجاهل",

    "admin.content.heading": "إدارة محتوى الصفحة الرئيسية",
    "admin.content.note": "التعديلات هنا تستبدل النصوص الافتراضية لكل لغة على حدة. اترك الحقل فارغًا للرجوع للنص الافتراضي.",
    "admin.content.saveBtn": "حفظ التعديلات",
    "admin.content.arLabel": "العربية",
    "admin.content.enLabel": "الإنجليزية",
    "admin.content.saved": "تم حفظ محتوى الصفحة الرئيسية بنجاح.",

    "admin.settings.heading": "إعدادات المنصة",
    "admin.settings.minAgeLabel": "الحد الأدنى لعمر التسجيل",
    "admin.settings.maintenanceModeLabel": "تفعيل وضع الصيانة (يظهر تنبيه للزوار في الصفحة الرئيسية)",
    "admin.settings.maintenanceMessageNote": "يمكن تعديل نص رسالة الصيانة باللغتين العربية والإنجليزية من قسم \"المحتوى\".",
    "maintenance.customMessage": "",
    "admin.settings.saveBtn": "حفظ الإعدادات",
    "admin.settings.saved": "تم حفظ الإعدادات بنجاح.",
    "admin.dbBackup.heading": "نسخ قاعدة البيانات (Supabase)",
    "admin.dbBackup.note": "لقطة تلقائية كل يوم الساعة 03:00 (UTC) تُحفظ داخل قاعدة البيانات لمدة 14 يومًا. نزّل نسخة على جهازك بانتظام، فلقطات القاعدة وحدها لا تحمي من حذف المشروع أو إيقافه.",
    "admin.dbBackup.downloadBtn": "تنزيل نسخة كاملة الآن",
    "admin.dbBackup.snapshotBtn": "حفظ لقطة الآن",
    "admin.dbBackup.refreshBtn": "تحديث القائمة",
    "admin.dbBackup.working": "جارٍ التنفيذ...",
    "admin.dbBackup.downloaded": "تم تنزيل النسخة الكاملة بنجاح.",
    "admin.dbBackup.snapshotDone": "تم حفظ اللقطة رقم {id}.",
    "admin.dbBackup.forbidden": "هذه العملية للمدير العام المسجَّل دخوله عبر قاعدة البيانات فقط. سجّل الخروج ثم ادخل بحساب المدير العام.",
    "admin.dbBackup.unavailable": "تعذّر الاتصال بقاعدة البيانات. تحقق من الإنترنت وحاول مجددًا.",
    "admin.dbBackup.error": "تعذّر تنفيذ العملية، حاول مرة أخرى.",
    "admin.dbBackup.empty": "لا توجد لقطات بعد.",
    "admin.dbBackup.colDate": "التاريخ",
    "admin.dbBackup.colLabel": "النوع",
    "admin.dbBackup.colRows": "عدد السجلات",
    "admin.dbBackup.download": "تنزيل",
    "admin.dbBackup.lastDownload": "آخر تنزيل لنسخة كاملة: {date}",
    "admin.dbBackup.neverDownloaded": "لم تنزّل أي نسخة كاملة بعد — يُنصح بتنزيل نسخة الآن.",
    "admin.dbBackup.staleWarning": "مرّ أكثر من 7 أيام على آخر تنزيل — يُنصح بتنزيل نسخة جديدة.",
    "admin.settings.backupHeading": "النسخ الاحتياطي للبيانات",
    "admin.settings.backupNote": "تصدير جميع بيانات المنصة (المستخدمون، الإعلانات، الرسائل...) كملف نسخة احتياطية، أو استيراد نسخة سابقة.",
    "admin.settings.exportBtn": "تنزيل نسخة احتياطية",
    "admin.settings.importBtn": "استيراد نسخة احتياطية",
    "admin.settings.importConfirm": "سيؤدي هذا إلى استبدال بيانات المنصة الحالية بالكامل ببيانات النسخة الاحتياطية. هل تريد المتابعة؟",
    "admin.settings.importSuccess": "تم استيراد النسخة الاحتياطية بنجاح، جارٍ إعادة تحميل الصفحة...",
    "admin.settings.importError": "تعذّر قراءة ملف النسخة الاحتياطية. تأكد من أنه ملف JSON صالح.",
    "admin.settings.dangerHeading": "منطقة الخطر",
    "admin.settings.dangerNote": "حذف جميع حسابات المستخدمين والمدراء من هذا الجهاز/المتصفح باستثناء حسابك الحالي. هذا يحذف معهم تلقائيًا كل إعلاناتهم ورسائلهم وإشعاراتهم وتقييماتهم ومفضلاتهم وبلاغاتهم. هذا الإجراء محلي فقط (بيانات هذا المتصفح) ولا يمكن التراجع عنه.",
    "admin.settings.dangerDeleteBtn": "حذف جميع المستخدمين والمدراء (باستثناء حسابي)",
    "admin.settings.dangerConfirm1": "سيتم حذف جميع المستخدمين والمدراء نهائيًا من هذا المتصفح باستثناء حسابك، وكل إعلاناتهم ورسائلهم وبياناتهم المرتبطة. هل أنت متأكد من المتابعة؟",
    "admin.settings.dangerConfirm2": "للتأكيد النهائي، اكتب العبارة التالية بالضبط: حذف نهائي",
    "admin.settings.dangerConfirmPhrase": "حذف نهائي",
    "admin.settings.dangerCancelled": "تم إلغاء العملية — لم يتم حذف أي شيء.",
    "admin.settings.dangerNothingToDelete": "لا يوجد مستخدمون آخرون لحذفهم.",
    "admin.settings.dangerDone": "تم حذف {count} حساب وكل بياناتهم المرتبطة نهائيًا من هذا المتصفح.",

    "admin.adminUsers.heading": "مستخدمو الإدارة",
    "admin.adminUsers.emailPlaceholder": "بريد المستخدم",
    "admin.adminUsers.grantBtn": "منح صلاحية",
    "admin.adminUsers.col.name": "الاسم",
    "admin.adminUsers.col.email": "البريد",
    "admin.adminUsers.col.role": "الدور",
    "admin.adminUsers.col.permissions": "الصلاحيات",
    "admin.adminUsers.col.twoFactor": "المصادقة الثنائية",
    "admin.adminUsers.col.actions": "إجراءات",
    "admin.adminUsers.allPermissions": "جميع الصلاحيات",
    "admin.adminUsers.editPermissionsBtn": "تعديل الصلاحيات",
    "admin.adminUsers.savePermissionsBtn": "حفظ الصلاحيات",
    "admin.adminUsers.enable2fa": "تفعيل المصادقة الثنائية",
    "admin.adminUsers.disable2fa": "إيقاف المصادقة الثنائية",
    "admin.adminUsers.revokeBtn": "سحب الصلاحية",
    "admin.adminUsers.deleteBtn": "حذف نهائي",
    "admin.adminUsers.deleteConfirm": "سيتم حذف حساب {email} نهائيًا من المنصة، مع كل إعلاناته ورسائله وبياناته المرتبطة. هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟",
    "admin.adminUsers.userNotFound": "لم يتم العثور على مستخدم بهذا البريد الإلكتروني.",
    "admin.adminUsers.alreadyAdmin": "هذا المستخدم لديه صلاحيات إدارية بالفعل.",
    "admin.adminUsers.grantHint": "تُمنح للمدير الجديد صلاحية الدخول فقط، ثم يحدّد المدير العام صلاحياته من الجدول أدناه.",
    "admin.adminUsers.grantSuccess": "✅ تم منح صلاحية الإدارة بنجاح لـ {email}",

    "admin.auditLogs.heading": "سجل العمليات (Audit Log)",
    "admin.auditLogs.col.date": "التاريخ",
    "admin.auditLogs.col.actor": "المستخدم",
    "admin.auditLogs.col.action": "الإجراء",
    "admin.auditLogs.col.target": "الهدف",
    "admin.auditLogs.col.details": "تفاصيل",

    "admin.auditAction.login_success": "تسجيل دخول ناجح",
    "admin.auditAction.login_failed": "محاولة دخول فاشلة",
    "admin.auditAction.login_blocked_disabled": "محاولة دخول لحساب معطّل",
    "admin.auditAction.listing_reported": "إبلاغ عن إعلان",
    "admin.auditAction.user_role_changed": "تغيير دور مستخدم",
    "admin.auditAction.user_enabled": "تفعيل حساب مستخدم",
    "admin.auditAction.user_disabled": "تعطيل حساب مستخدم",
    "admin.auditAction.user_flagged": "وضع علامة مشبوه على حساب",
    "admin.auditAction.user_unflagged": "إزالة علامة مشبوه عن حساب",
    "admin.auditAction.user_deleted": "حذف حساب مستخدم",
    "admin.auditAction.user_plan_changed": "تغيير خطة اشتراك مستخدم",
    "admin.auditAction.listing_hidden": "إخفاء إعلان",
    "admin.auditAction.listing_unhidden": "إعادة إظهار إعلان",
    "admin.auditAction.listing_status_changed": "تغيير حالة إعلان",
    "admin.auditAction.listing_deleted": "حذف إعلان",
    "admin.auditAction.listing_deleted_from_report": "حذف إعلان من خلال بلاغ",
    "admin.auditAction.report_resolved": "معالجة بلاغ",
    "admin.auditAction.report_dismissed": "تجاهل بلاغ",
    "admin.auditAction.coupon_added": "إضافة كوبون",
    "admin.auditAction.coupon_toggled": "تغيير حالة كوبون",
    "admin.auditAction.coupon_deleted": "حذف كوبون",
    "admin.auditAction.site_content_updated": "تعديل محتوى الصفحة الرئيسية",
    "admin.auditAction.site_settings_updated": "تعديل إعدادات المنصة",
    "admin.auditAction.backup_exported": "تصدير نسخة احتياطية",
    "admin.auditAction.backup_imported": "استيراد نسخة احتياطية",
    "admin.auditAction.admin_role_granted": "منح صلاحية إدارية",
    "admin.auditAction.admin_role_revoked": "سحب صلاحية إدارية",
    "admin.auditAction.admin_2fa_enabled": "تفعيل المصادقة الثنائية لحساب إداري",
    "admin.auditAction.admin_2fa_disabled": "إيقاف المصادقة الثنائية لحساب إداري",
    "admin.auditAction.admin_2fa_verified": "التحقق الناجح بالمصادقة الثنائية",
    "admin.auditAction.subscription_pricing_updated": "تحديث أسعار الاشتراك",
    "admin.auditAction.subscription_discount_updated": "تحديث خصم الاشتراك",
    "admin.auditAction.admin_permissions_changed": "تعديل صلاحيات مدير",
    "admin.auditAction.category_created": "إضافة فئة جديدة",
    "admin.auditAction.category_updated": "تعديل فئة",
    "admin.auditAction.category_deleted": "حذف فئة",
    "admin.auditAction.admin_password_reset": "إعادة تعيين كلمة مرور مستخدم",
    "admin.auditAction.admin_registered_by_superadmin": "تسجيل مدير جديد من قبل المدير العام",

    "maintenance.defaultMessage": "المنصة قيد الصيانة حاليًا، نعتذر عن أي إزعاج وسنعود قريبًا.",

    "listingPage.saveChangesBtn": "حفظ التعديلات",
    "listingPage.editHeading": "تعديل الإعلان",
    "listingPage.editSub": "قم بتحديث تفاصيل إعلانك أدناه.",
    "listingPage.currentPhotosLabel": "الصور الحالية",
    "listingPage.photosHintEdit": "يمكنك ترك هذا الحقل فارغًا للاحتفاظ بالصور الحالية، أو إرفاق صور جديدة لاستبدالها.",
    "listingPage.editSuccess": "تم حفظ التعديلات بنجاح، جارٍ تحويلك...",
    "nav.myListings": "إعلاناتي",
    "meta.myListings.title": "إعلاناتي | مباشر",
    "myListings.heading": "إعلاناتي",
    "myListings.sub": "إدارة إعلاناتك المنشورة: التعديل، الحذف، أو تحديد الإعلان كـ \"تم البيع\".",
    "myListings.loginNotice": "يجب تسجيل الدخول لعرض إعلاناتك.",
    "myListings.emptyState": "لم تقم بنشر أي إعلان بعد.",
    "myListings.viewBtn": "عرض",
    "myListings.editBtn": "تعديل",
    "myListings.deleteBtn": "حذف",
    "myListings.deleteConfirm": "هل أنت متأكد من حذف هذا الإعلان؟ لا يمكن التراجع عن هذا الإجراء.",
    "myListings.markSoldBtn": "تحديد كـ «تم البيع»",
    "myListings.reactivateBtn": "إعادة تنشيط الإعلان",
    "listing.featuredBadge": "مميز",
    "myListings.featureBtn": "تمييز الإعلان",
    "myListings.unfeatureBtn": "إلغاء التمييز",
    "admin.listings.featureBtn": "تمييز",
    "admin.listings.unfeatureBtn": "إلغاء التمييز",
    "myListings.notOwnerError": "لا يمكنك تعديل إعلان لا تملكه.",
    "listing.active": "متاح",
    "listing.sold": "تم البيع",
    "nav.messages": "رسائلي",
    "spec.km": "كم",
    "home.noRealestate": "لا توجد عقارات منشورة بعد. كن أول من ينشر إعلانًا!",
    "home.noVehicles": "لا توجد سيارات أو دراجات نارية منشورة بعد. كن أول من ينشر إعلانًا!",
    "meta.listingDetail.title": "تفاصيل الإعلان | مباشر",
    "meta.messages.title": "رسائلي | مباشر",
    "messages.heading": "رسائلي",
    "messages.sub": "تابع محادثاتك مع أصحاب الإعلانات والمهتمين بإعلاناتك.",
    "messages.loginNotice": "يجب تسجيل الدخول لعرض رسائلك.",
    "messages.emptyState": "لا توجد رسائل بعد. تصفح الإعلانات وابدأ محادثة مع صاحب أي إعلان يهمك.",
    "messages.deletedListing": "إعلان محذوف",
    "messages.replyPlaceholder": "اكتب ردك هنا...",
    "messages.sendBtn": "إرسال",
    "messages.contactLeakWarning": "لا يمكن تضمين رقم جوال أو بريد إلكتروني أو حساب تواصل اجتماعي أو رابط ضمن الرسائل، حفاظًا على خصوصيتك وأمانك. يرجى إبقاء التواصل داخل نظام رسائل الموقع.",
    "messages.noMessagesYet": "لا توجد رسائل في هذه المحادثة بعد.",
    "legal.updated": "آخر تحديث: سبتمبر 2026",
    "privacy.heading": "سياسة الخصوصية",
    "privacy.s1.heading": "مقدمة",
    "privacy.s1.body": "نحترم في \"مباشر\" خصوصية مستخدمينا، وتوضح هذه السياسة نوع المعلومات التي نجمعها وكيفية استخدامها وحمايتها عند استخدامك للمنصة.",
    "privacy.s2.heading": "المعلومات التي نجمعها",
    "privacy.s2.body": "نجمع المعلومات التي تقدمها مباشرة عند إنشاء حساب، مثل الاسم والبريد الإلكتروني ورقم الجوال، بالإضافة إلى تفاصيل الإعلانات التي تنشرها على المنصة.",
    "privacy.s3.heading": "كيف نستخدم معلوماتك",
    "privacy.s3.body": "نستخدم بياناتك لتشغيل حسابك، وعرض إعلاناتك للمستخدمين الآخرين، والتواصل معك بخصوص طلباتك، وتحسين خدمات المنصة.",
    "privacy.s4.heading": "مشاركة المعلومات",
    "privacy.s4.body": "لا نبيع بياناتك الشخصية لأطراف ثالثة. قد تُعرض بيانات التواصل التي تختار إظهارها في إعلانك للمستخدمين المهتمين فقط.",
    "privacy.s5.heading": "أمان البيانات",
    "privacy.s5.body": "نتخذ إجراءات معقولة لحماية بياناتك من الوصول غير المصرح به، مع العلم أن أي نظام تخزين إلكتروني لا يخلو من مخاطر أمنية بشكل كامل.",
    "privacy.s6.heading": "ملفات تعريف الارتباط",
    "privacy.s6.body": "تستخدم المنصة تخزينًا محليًا في متصفحك لحفظ تفضيلاتك، مثل اللغة وحالة تسجيل الدخول، لتحسين تجربتك أثناء التصفح.",
    "privacy.s7.heading": "حقوقك",
    "privacy.s7.body": "يحق لك الاطلاع على بياناتك أو تعديلها أو طلب حذف حسابك في أي وقت من خلال التواصل مع فريق الدعم.",
    "privacy.s8.heading": "التعديلات على هذه السياسة",
    "privacy.s8.body": "قد نقوم بتحديث سياسة الخصوصية من وقت لآخر، وسيتم نشر أي تغييرات جوهرية على هذه الصفحة مع تاريخ التحديث.",
    "privacy.s9.heading": "تواصل معنا",
    "privacy.s9.body": "لأي استفسار بخصوص هذه السياسة أو بياناتك الشخصية، يمكنك التواصل مع فريق الدعم الفني عبر المنصة.",
    "terms.heading": "الشروط والأحكام",
    "terms.s1.heading": "مقدمة",
    "terms.s1.body": "باستخدامك منصة \"مباشر\"، فإنك توافق على هذه الشروط والأحكام. إذا كنت لا توافق على أي جزء منها، يرجى عدم استخدام المنصة.",
    "terms.s2.heading": "استخدام المنصة",
    "terms.s2.body": "تُستخدم المنصة لعرض وتصفح إعلانات العقارات والأراضي والسيارات والدراجات النارية فقط. يُمنع استخدامها لأي غرض مخالف للقانون.",
    "terms.s3.heading": "حسابات المستخدمين",
    "terms.s3.body": "أنت مسؤول عن الحفاظ على سرية بيانات حسابك وكلمة المرور الخاصة بك، وعن جميع الأنشطة التي تتم من خلال حسابك. يجب أن يكون عمر المستخدم 18 عامًا أو أكثر لإنشاء حساب واستخدام المنصة، ولا يُسمح بالتسجيل لمن هم دون هذا العمر.",
    "terms.s4.heading": "قواعد نشر الإعلانات",
    "terms.s4.body": "يجب أن تكون المعلومات المنشورة في إعلانك دقيقة وصحيحة. يُمنع نشر إعلانات مضللة أو مكررة أو لسلع غير مملوكة لك.",
    "terms.s5.heading": "المسؤولية",
    "terms.s5.body": "المنصة وسيط لعرض الإعلانات فقط، ولا تتحمل مسؤولية أي تعامل مباشر أو خلاف ينشأ بين البائع والمشتري.",
    "terms.s6.heading": "الملكية الفكرية",
    "terms.s6.body": "جميع عناصر التصميم والشعار الخاصة بالمنصة محمية، ولا يجوز نسخها أو إعادة استخدامها دون إذن مسبق.",
    "terms.s7.heading": "إنهاء الحساب",
    "terms.s7.body": "يحق للمنصة تعليق أو إنهاء أي حساب يخالف هذه الشروط، دون إشعار مسبق في حالات المخالفات الجسيمة.",
    "terms.s8.heading": "التعديلات على الشروط",
    "terms.s8.body": "قد يتم تحديث هذه الشروط من وقت لآخر، واستمرارك في استخدام المنصة بعد التحديث يُعد موافقة على الشروط الجديدة.",
    "terms.s9.heading": "تواصل معنا",
    "terms.s9.body": "لأي استفسار بخصوص هذه الشروط، يمكنك التواصل مع فريق الدعم الفني عبر المنصة.",
    },
    en: {
    "brand.name": "Mubasher",
    "meta.home.title": "Mubasher | Real Estate & Cars for Sale and Rent",
    "meta.login.title": "Log In | Mubasher",
    "meta.signup.title": "Sign Up | Mubasher",
    "meta.adminLogin.title": "Admin Login | Mubasher",
    "meta.adminRegister.title": "Register New Admin | Mubasher",
    "nav.adminPanel": "Admin Panel",
    "meta.listing.title": "Post an Ad | Mubasher",
    "meta.privacy.title": "Privacy Policy | Mubasher",
    "meta.terms.title": "Terms & Conditions | Mubasher",
    "nav.realestate": "Real Estate",
    "nav.cars": "Cars",
    "nav.addListing": "Post an Ad",
    "nav.about": "About Us",
    "theme.switchToDark": "Switch to dark mode",
    "theme.switchToLight": "Switch to light mode",
    "notif.bellLabel": "Notifications",
    "notif.heading": "Notifications",
    "notif.empty": "No notifications yet.",
    "notif.accountApproved": "Your account has been approved! You can now publish listings on the platform.",
    "notif.accountRejected": "Your account application was rejected.",
    "notif.subscriptionExpiring": "Your subscription expires in {days} day(s). Renew now to avoid your listings being paused.",
    "notif.reviewSellerPrompt": "The sale is complete! Share your rating of your experience with the seller.",
    "notif.savedSearchMatch": "A new listing matches your saved search “{name}”",
    "email.subject.generic": "New notification from Mubasher",
    "email.subject.account_approved": "Your Mubasher account has been activated",
    "email.subject.account_rejected": "About your Mubasher account activation request",
    "email.subject.subscription_expiring": "Your subscription is about to expire",
    "email.subject.review_seller_prompt": "Share your feedback on the seller",
    "email.subject.saved_search_match": "We found a listing matching your saved search",
    "admin.nav.emailLog": "Email Log",
    "admin.emailLog.heading": "Email Log",
    "admin.emailLog.note": "A simulation of email notifications within the site — there is currently no real connection to an external email service.",
    "admin.emailLog.col.date": "Date",
    "admin.emailLog.col.to": "To",
    "admin.emailLog.col.subject": "Subject",
    "admin.emailLog.col.body": "Message",
    "admin.emailLog.empty": "No emails have been sent yet.",
    "savedSearch.saveBtn": "Save this search",
    "savedSearch.namePrompt": "Choose a name for this saved search:",
    "savedSearch.defaultName": "Saved search",
    "savedSearch.savedAlert": "Search saved. We'll notify you when a matching listing is published.",
    "savedSearch.loginRequiredAlert": "You must log in to save a search.",
    "savedSearch.sectionTitle": "Saved Searches",
    "savedSearch.emptyState": "No saved searches yet. From the homepage, set your search filters and click “Save this search.”",
    "savedSearch.applyBtn": "Apply",
    "savedSearch.deleteBtn": "Delete",
    "savedSearch.deleteConfirm": "Delete this saved search?",
    "map.showMapBtn": "Search by map",
    "map.showListBtn": "Show list",
    "map.unavailable": "Couldn't load the map. Check your internet connection and try again.",
    "map.viewListingsBtn": "View listings",
    "auth.login": "Log In",
    "auth.logout": "Log Out",
    "auth.signup": "Sign Up",
    "auth.backHome": "← Back to Home",
    "auth.backHomeShort": "Back to Home",
    "auth.loginTitle": "Log In",
    "auth.loginSub": "Enter your details to access your account",
    "auth.remember": "Remember me",
    "auth.forgot": "Forgot password?",
    "auth.loginBtn": "Log In",
    "auth.or": "or",
    "auth.noAccount": "Don't have an account?",
    "auth.createOne": "Create one",
    "auth.hasAccount": "Already have an account?",
    "auth.visualLogin": "Log in to keep track of your saved listings, message sellers, and post your own ads.",
    "auth.signupTitle": "Create a New Account",
    "auth.signupSub": "Fill in your details to start using the platform",
    "auth.signupBtn": "Create Account",
    "auth.agreeTo": "I agree to the",
    "auth.and": "and",
    "plan.title": "Choose Your Subscription Plan",
    "plan.intro": "A monthly subscription is required to post ads on the platform. Pay monthly, or pay yearly and save.",
    "plan.currency": "SDG",
    "plan.perMonth": "per month",
    "plan.perYear": "per year",
    "plan.monthly.name": "Monthly",
    "plan.yearly.name": "Yearly",
    "plan.yearly.badge": "Save 17%",
    "plan.yearly.savings": "Save 41,000 SDG a year compared to paying monthly",
    "plan.yearly.compareNote": "Instead of 240,000 SDG when paid monthly (20,000 × 12 months)",
    "plan.yearly.badgeDynamic": "Save {percent}%",
    "plan.yearly.savingsDynamic": "Saves {amount} a year compared to paying monthly",
    "plan.yearly.compareNoteDynamic": "Instead of {total} when paid monthly ({monthly} × 12 months)",
    "plan.discountBadge": "{percent}% off until {date}",
    "auth.visualSignupTitle": "Join thousands of users buying and selling with confidence",
    "auth.visualSignupSub": "Create your account to save listings, post your properties and cars, and message interested buyers directly.",
    "auth.fixErrors": "Please fix the highlighted fields below before continuing.",
    "auth.agreeTermsRequired": "Please agree to the Terms & Conditions to continue.",
    "auth.emailExists": "An account with this email already exists.",
    "auth.creatingAccount": "Creating account...",
    "auth.signupSuccess": "Account created successfully, redirecting...",
    "auth.enterValidData": "Please enter valid information.",
    "auth.wrongCredentials": "Incorrect username or password. Please enter valid information.",
    "auth.signupGeneric": "We couldn't create your account, please try again shortly.",
    "auth.rateLimited": "Too many attempts in a short time, please wait a moment and try again.",
    "auth.networkError": "Couldn't reach the server, check your internet connection and try again.",
    "auth.useAdminLogin": "This is an admin account — please use the dedicated admin login page.",
    "auth.loggingIn": "Logging in...",
    "auth.loginSuccess": "Logged in successfully, redirecting...",
    "auth.accountDisabled": "This account has been disabled by the platform administration. Please contact support.",
    "field.email": "Email",
    "field.username": "Username",
    "field.usernamePlaceholder": "e.g. mohamed_ahmed",
    "error.username": "Username must be 3–20 characters: English letters, numbers, _ or . only",
    "error.usernameLogin": "Please enter your username",
    "auth.usernameExists": "This username is already taken, please choose another.",
    "field.password": "Password",
    "field.confirmPassword": "Confirm Password",
    "field.fullName": "Full Name",
    "field.phone": "Phone Number",
    "field.choose": "Choose...",
    "error.email": "Please enter a valid email address",
    "error.password": "Password must be at least 6 characters",
    "error.confirmPassword": "Passwords do not match",
    "error.fullName": "Please enter your full name",
    "error.phone": "Please enter a valid phone number (10 digits)",
    "field.birthdate": "Date of Birth",
    "error.birthdate": "Please enter a valid date of birth",
    "auth.ageRequirement": "You must be 18 years or older to register on the platform",
    "auth.ageRequirementHint": "You must be 18 years or older to create an account.",
    "field.profilePhoto": "Profile Photo (optional)",
    "field.profilePhotoHint": "You can add a profile photo that will appear next to the platform name after you log in.",
    "field.profilePhotoRequired": "Profile Photo",
    "field.profilePhotoHintRequired": "A profile photo is required and will appear next to the platform name after you log in.",
    "error.profilePhoto": "Please attach a profile photo",

    "field.identityVerificationTitle": "Identity Verification",
    "field.identityVerificationIntro": "This information is required for admin review before your account is activated, and is used for legal purposes only.",
    "field.nationalId": "National ID Number",
    "error.nationalId": "Please enter your national ID number",
    "field.idPhoto": "ID Photo",
    "error.idPhoto": "Please capture or attach a photo of your ID",
    "field.idPhotoHint": "Take a clear photo of your national ID, or attach one from your device. This photo is used only to verify your identity by the admin team.",

    "photoCapture.profilePlaceholder": "Add a clear profile photo",
    "photoCapture.idPlaceholder": "Add a clear photo of your ID card",
    "photoCapture.openCamera": "📷 Capture with camera",
    "photoCapture.chooseFile": "🖼️ Choose from device",
    "photoCapture.snap": "Capture Photo",
    "photoCapture.cancel": "Cancel",
    "photoCapture.retake": "🔄 Retake",
    "photoCapture.cameraUnavailable": "Couldn't access the camera, please choose a photo from your device",

    "auth.pendingReviewMessage": "✅ Your account was created successfully! It's now pending admin review, and you'll be notified once it's approved.",
    "auth.accountPendingReview": "Your account is pending admin review. You'll be notified once it's approved.",
    "auth.accountRejected": "Your registration request was rejected.",

    "nav.subscription": "My Subscription",
    "meta.subscription.title": "My Subscription | Mubasher",
    "subscription.heading": "My Subscription",
    "subscription.adminExemptNote": "Admin team accounts are exempt from the monthly/yearly subscription and do not need to pay any fees to use the dashboard.",
    "subscription.sub": "Track your account and subscription status, and complete payment to activate posting on the platform.",
    "subscription.loginNotice": "You must log in to view your subscription details.",
    "subscription.paymentTitle": "Complete payment to activate your subscription",
    "subscription.method.bankak": "Bankak (Bank of Khartoum)",
    "subscription.method.ewallet": "E-Wallet",
    "subscription.method.card": "Visa / Mastercard",
    "subscription.method.banktransfer": "Bank Transfer",
    "subscription.method.gateway": "Online Payment Gateway",
    "subscription.payNowBtn": "Pay Now",
    "subscription.paymentSimNote": "Demo environment: no real amount is charged. This form only simulates a payment.",
    "subscription.processing": "Processing payment...",
    "subscription.paymentSuccess": "Payment successful, your subscription is now active.",
    "subscription.trialDaysLeft": "{days} day(s) left in your free trial (ends {date}).",
    "subscription.rejectedReason": "Your registration request was rejected.",
    "subscription.activeSince": "Your subscription has been active since",
    "subscription.remainingDays": "{days} day(s) left on your subscription (ends {date}).",
    "subscription.extendBtn": "Extend Subscription",
    "subscription.extendedSuccess": "Your subscription was extended successfully.",
    "subscription.selectedPlan": "Selected plan:",
    "subscription.stageDetail.pending_review": "Your account is pending admin review of your national ID and ID photo. You can't post listings until it's approved.",
    "subscription.stageDetail.rejected": "Your registration request was rejected. Please contact support for more details.",
    "subscription.stageDetail.trial": "You're currently in your free trial period and can post listings freely.",
    "subscription.stageDetail.active": "Your subscription is active, and you can post listings freely.",
    "subscription.stageDetail.expired": "Your trial period has ended and your subscription isn't active yet. Complete payment to keep posting listings.",
    "subscription.goToSubscriptionBtn": "Manage Subscription",

    "admin.users.col.accountStage": "Subscription Stage",
    "admin.accountStage.pending_review": "Pending Review",
    "admin.accountStage.rejected": "Rejected",
    "admin.accountStage.trial": "Free Trial",
    "admin.accountStage.active": "Active",
    "admin.accountStage.expired": "Expired",

    "admin.pendingReview.heading": "Pending Registration Requests",
    "admin.pendingReview.note": "Review the national ID and ID photo before approving the account. Approval automatically starts a 7-day free trial.",
    "admin.pendingReview.col.name": "Name",
    "admin.pendingReview.col.email": "Email",
    "admin.pendingReview.col.nationalId": "National ID",
    "admin.pendingReview.col.idPhoto": "ID Photo",
    "admin.pendingReview.col.plan": "Requested Plan",
    "admin.pendingReview.col.actions": "Actions",
    "admin.pendingReview.approveBtn": "Approve",
    "admin.pendingReview.rejectBtn": "Reject",
    "admin.pendingReview.rejectReasonPrompt": "Rejection reason (optional):",
    "admin.pendingReview.empty": "There are no pending registration requests right now.",

    "admin.auditAction.account_submitted_for_review": "Account submitted for review",
    "admin.auditAction.user_approved": "User account approved",
    "admin.auditAction.user_rejected": "User registration rejected",
    "admin.auditAction.subscription_activated": "Subscription activated after payment",
    "admin.auditAction.login_blocked_pending_review": "Login attempt on a pending-review account",
    "admin.auditAction.login_blocked_rejected": "Login attempt on a rejected account",

    "terms.s10.heading": "Identity Verification and Account Review",
    "terms.s10.body": "When creating an account, you are required to enter your national ID number and attach a photo of your ID to verify your information. The account remains pending until it is reviewed and approved by the platform administration, and the administration reserves the right to reject any registration request with incomplete or apparently invalid information.",
    "terms.s11.heading": "Subscription, Free Trial, and Payment",
    "terms.s11.body": "Once your information is approved, you are granted a 7-day free trial to use the platform. To continue your subscription after the trial ends, you must complete payment through one of the available payment methods on the platform, and the subscription status automatically becomes \"Active\" once payment succeeds.",

    "privacy.s10.heading": "National ID Number and ID Photo",
    "privacy.s10.body": "The national ID number and ID photo you provide at signup are used exclusively to verify and review your information by the platform administration, and for legal purposes only. This data is never shared with any third party and is never used for marketing purposes.",

    "profile.title": "My Profile",
    "profile.changePhotoBtn": "Change Photo",
    "profile.nameLabel": "Full Name",
    "profile.phoneLabel": "Phone Number",
    "profile.addressLabel": "Address",
    "profile.addressPlaceholder": "Enter your address",
    "profile.usernameLabel": "Username (for login)",
    "profile.usernamePlaceholder": "e.g. mohamed_ahmed",
    "profile.usernameFormatError": "3 to 20 characters: letters, numbers, _ or . only",
    "profile.usernameTakenError": "This username is already taken",
    "profile.usernameHint": "You use this username with your password to log in to your account.",
    "profile.saveAddressBtn": "Save Address",
    "profile.saveInfoBtn": "Save Info",
    "profile.changePasswordTitle": "Change Password",
    "profile.currentPasswordLabel": "Current Password",
    "profile.newPasswordLabel": "New Password",
    "profile.confirmNewPasswordLabel": "Confirm New Password",
    "profile.savePasswordBtn": "Update Password",
    "profile.currentPasswordError": "Current password is incorrect",
    "profile.addressSaved": "Address saved successfully",
    "profile.infoSaved": "Your info was saved successfully",
    "profile.fixInfoErrors": "Please fix the fields above",
    "profile.passwordSaved": "Password updated successfully",
    "profile.photoSaved": "Profile photo updated",
    "profile.fixPasswordErrors": "Please fix the password fields above",
    "forgot.title": "Forgot Password?",
    "forgot.step1Sub": "Enter the username, email or phone number registered on your account",
    "forgot.adminStep1Sub": "Enter the username or email registered on your admin account",
    "forgot.identifierLabel": "Username, Email or Phone Number",
    "forgot.identifierError": "No account is linked to this information",
    "forgot.sendBtn": "Send Temporary Password",
    "forgot.step2Title": "Verify the Temporary Password",
    "forgot.sentTo": "We sent a temporary password to",
    "forgot.demoNote": "Demo environment: the temporary password is shown here instead of actually being emailed or texted.",
    "forgot.otpLabel": "Enter the Temporary Password",
    "forgot.otpError": "Incorrect temporary password",
    "forgot.verifyBtn": "Verify",
    "forgot.step3Title": "Set a New Password",
    "forgot.step3Sub": "The temporary password can only be used once. Set a new password for your account",
    "forgot.newPassword": "New Password",
    "forgot.resetBtn": "Set Password & Log In",
    "hero.eyebrow": "A trusted platform for buying and selling",
    "hero.title": "Your next home, or your next car, all in one place",
    "hero.subtitle": "Thousands of verified listings for real estate, cars, and land — direct from owners or trusted agents.",
    "search.tab.realestate": "Real Estate",
    "search.tab.land": "Land",
    "search.tab.commercial": "Commercial",
    "search.tab.cars": "Cars",
    "search.tab.moto": "Motorcycles",
    "search.keyword.label": "Keyword",
    "search.keyword.placeholder": "Search by listing title...",
    "search.city.label": "City",
    "search.offerType.label": "Offer Type",
    "search.budget.label": "Budget",
    "search.any": "Any",
    "search.priceRange.label": "Price range",
    "search.priceFrom": "From",
    "search.priceTo": "To",
    "search.rooms.label": "Rooms",
    "search.yearRange.label": "Year",
    "search.yearFrom": "From year",
    "search.yearTo": "To year",
    "search.sort.label": "Sort by",
    "search.sort.newest": "Newest first",
    "search.sort.priceAsc": "Price: low to high",
    "search.sort.priceDesc": "Price: high to low",
    "search.noResults": "No results match your search.",
    "search.resultsFor": "Search results",
    "search.resultsUnit": "results",
    "search.clearBtn": "Clear filters",
    "search.cta": "Search Now",
    "search.categoryAriaLabel": "Choose a category",
    "search.advancedToggle": "Advanced filters",
    "search.filtersBtnAriaLabel": "Search filters",
    "favorites.toggleBtn": "Add/remove from favorites",
    "nav.favorites": "Favorites",
    "bottomNav.home": "Home",
    "bottomNav.favorites": "Favorites",
    "bottomNav.add": "Add",
    "bottomNav.messages": "Messages",
    "bottomNav.profile": "Profile",
    "favorites.heading": "My Favorite Listings",
    "favorites.sub": "Listings you've saved to check out later.",
    "favorites.empty": "You haven't added any listings to your favorites yet.",
    "favorites.loginNotice": "You must log in to view your favorites list.",
    "meta.favorites.title": "Favorites | Mubasher",
    "reviews.heading": "Seller Ratings & Reviews",
    "reviews.yourRating": "Your rating",
    "reviews.commentLabel": "Your comment (optional)",
    "reviews.submitBtn": "Submit Review",
    "reviews.loginToReview": "You must log in to add a review.",
    "reviews.noReviewsYet": "This seller has no reviews yet.",
    "reviews.reviewsCountSuffix": "reviews",
    "seller.verifiedBadge": "Verified Seller",
    "seller.verifiedBadgeTooltip": "This seller's identity has been verified by the platform's admin team.",
    "reviews.selectRatingAlert": "Please select a star rating first.",
    "city.khartoum": "Khartoum",
    "city.omdurman": "Omdurman",
    "city.bahri": "Bahri",
    "city.madani": "Wad Madani",
    "city.portsudan": "Port Sudan",
    "city.kassala": "Kassala",
    "city.elobeid": "El Obeid",
    "city.nyala": "Nyala",
    "city.elfasher": "El Fasher",
    "city.elgeneina": "El Geneina",
    "city.kosti": "Kosti",
    "city.sennar": "Sennar",
    "city.eddamazin": "Ed Damazin",
    "city.atbara": "Atbara",
    "city.dongola": "Dongola",
    "city.gadarif": "Gadarif",
    "city.shendi": "Shendi",
    "city.kadugli": "Kadugli",
    "city.zalingei": "Zalingei",
    "city.eddamer": "Ed Damer",
    "offer.sale": "For Sale",
    "offer.rent": "For Rent",
    "budget.low": "Under 500K",
    "budget.mid": "500K - 1M",
    "budget.high": "Over 1M",
    "cat.apartments.title": "Apartments & Villas",
    "cat.apartments.count": "3,240 listings",
    "cat.land.title": "Land",
    "cat.land.count": "1,180 listings",
    "cat.cars.title": "Cars",
    "cat.cars.count": "2,560 listings",
    "cat.commercial.title": "Commercial Property",
    "cat.commercial.count": "640 listings",
    "cat.moto.title": "Motorcycles",
    "cat.moto.count": "310 listings",
    "realestate.heading": "Latest Properties",
    "realestate.sub": "Handpicked villas, apartments, and land this week",
    "realestate.seeAll": "View All Properties",
    "listing1.price": "1,250,000 SDG",
    "listing1.title": "Elegant Duplex Villa in Al Yasmin",
    "listing1.loc": "Khartoum — Al Riyadh District",
    "listing2.price": "4,500 SDG / month",
    "listing2.title": "Furnished Apartment with Nile View",
    "listing2.loc": "Omdurman — Al Thawra",
    "listing3.price": "680,000 SDG",
    "listing3.title": "Planned Residential Land Plot",
    "listing3.loc": "Bahri — Al Kadaro",
    "spec.rooms": "rooms",
    "spec.baths": "baths",
    "spec.sqm": "sqm",
    "spec.corner": "Corner plot",
    "spec.eTitle": "E-title deed",
    "cars.heading": "Latest Cars",
    "cars.sub": "Inspected cars, listed directly by their owners",
    "cars.seeAll": "View All Cars",
    "listing4.price": "96,000 SDG",
    "listing4.title": "Toyota Land Cruiser GXR 2023",
    "listing4.loc": "Khartoum",
    "listing5.price": "61,500 SDG",
    "listing5.title": "Hyundai Sonata 2022 Fully Loaded",
    "listing5.loc": "Omdurman",
    "listing6.price": "142,000 SDG",
    "listing6.title": "Mercedes C200 2024 Model",
    "listing6.loc": "Bahri",
    "spec.thousandKm": "thousand km",
    "spec.automatic": "Automatic",
    "spec.petrol": "Petrol",
    "spec.dealerWarranty": "Dealer warranty",
    "promo.heading": "Have a property or car to sell?",
    "promo.sub": "Post your ad for free and reach thousands of serious buyers within minutes.",
    "promo.point1": "Publish your ad in minutes, no hassle",
    "promo.point2": "Verified listings to protect buyers and sellers",
    "promo.point3": "Message interested buyers directly on the platform",
    "promo.cta": "Post Your Ad Now",
    "trust.support.title": "Local support",
    "trust.support.sub": "A Sudanese support team that responds quickly to any question",
    "trust.search.title": "Smarter search",
    "trust.search.sub": "Smart filters and map search get you to the right listing instantly",
    "trust.verified.title": "Verified listings",
    "trust.verified.sub": "Verified sellers and reviewed listings to protect you from fraud",
    "footer.cta.heading": "Join Mubasher today",
    "footer.cta.sub": "Create your account and start posting your ads or browsing thousands of listings",
    "footer.cta.btn": "Sign up now",
    "footer.about": "A Sudanese platform to list, buy, and sell real estate, land, cars, and motorcycles directly between individuals and agents.",
    "footer.sections.heading": "Categories",
    "footer.sections.saleRealestate": "Property for Sale",
    "footer.sections.rentRealestate": "Property for Rent",
    "footer.sections.land": "Land",
    "footer.sections.cars": "Cars",
    "footer.sections.moto": "Motorcycles",
    "footer.company.heading": "Company",
    "footer.company.about": "About Us",
    "footer.company.contact": "Contact Us",
    "footer.company.faq": "FAQ",
    "footer.contact.heading": "Support",
    "footer.contact.support": "Technical Support",
    "footer.contact.terms": "Terms & Conditions",
    "footer.contact.privacy": "Privacy Policy",
    "footer.copyright": "© 2026 Mubasher. All rights reserved.",
    "listingPage.heading": "Post Your Ad",
    "listingPage.sub": "Choose what you're listing and enter the details. All prices are in Sudanese Pounds.",
    "listingPage.categoryTitle": "Ad Type",
    "listingPage.cat.land": "Land Plot",
    "listingPage.cat.residential": "Residential Property",
    "listingPage.cat.commercial": "Commercial Property",
    "listingPage.cat.car": "Car",
    "listingPage.cat.motorcycle": "Motorcycle",
    "listingPage.categoryError": "Please choose an ad type",
    "listingPage.detailsTitle": "Ad Details",
    "listingPage.offerTypeError": "Please choose an offer type",
    "listingPage.priceLabel": "Price (in Sudanese Pounds)",
    "listingPage.priceError": "Please enter a valid price",
    "listingPage.cityChoose": "Choose a city...",
    "listingPage.cityError": "Please choose a city",
    "listingPage.landDetails": "Land Details",
    "listingPage.areaLabel": "Area (sqm)",
    "listingPage.areaError": "Please enter the area",
    "listingPage.landTypeLabel": "Land Type",
    "listingPage.landTypeError": "Please choose a land type",
    "listingPage.addressLabel": "Address",
    "listingPage.addressPlaceholder": "Neighborhood, street, nearest landmark",
    "listingPage.landNumberPlaceholder": "e.g. 1234/56",
    "listingPage.resNumberPlaceholder": "e.g. 4521",
    "listingPage.comNumberPlaceholder": "e.g. 7788",
    "listingPage.carRegistrationPlaceholder": "e.g. KRT-778241",
    "field.fullNamePlaceholder": "John Doe",
    "profile.closeBtnLabel": "Close",
    "brand.initial": "M",
    "listingPage.addressError": "Please enter the address",
    "listingPage.landNumberLabel": "Land Plot Number",
    "listingPage.landNumberError": "Please enter the land plot number",
    "listingPage.landNumberDuplicate": "This land plot (same number) has already been listed. You cannot post a duplicate ad for the same plot.",
    "listingPage.propertyNumberLabel": "Property Number",
    "listingPage.propertyNumberError": "Please enter the property number",
    "listingPage.propertyNumberDuplicate": "This property (same number) has already been listed. You cannot post a duplicate ad for the same property.",
    "listingPage.carRegistrationLabel": "Vehicle Registration Number",
    "listingPage.carRegistrationError": "Please enter the vehicle registration number",
    "listingPage.carRegistrationDuplicate": "An ad for this vehicle (same registration number) has already been posted. You cannot post a duplicate ad for the same vehicle.",
    "listingPage.internalOnlyHintProperty": "This number is not shown to customers; used internally only to prevent duplicate listings for the same property or land plot.",
    "listingPage.internalOnlyHintCar": "This number is not shown to customers; used internally only to prevent duplicate listings for the same vehicle.",
    "landType.residential": "Residential",
    "landType.commercial": "Commercial",
    "landType.agricultural": "Agricultural",
    "listingPage.resDetails": "Residential Property Details",
    "listingPage.roomsLabel": "Number of Rooms",
    "listingPage.roomsError": "Please enter the number of rooms",
    "listingPage.bathsLabel": "Number of Bathrooms",
    "listingPage.bathsError": "Please enter the number of bathrooms",
    "listingPage.comDetails": "Commercial Property Details",
    "listingPage.comTypeLabel": "Usage Type",
    "listingPage.comTypeError": "Please choose a usage type",
    "comType.shop": "Retail Shop",
    "comType.office": "Office",
    "comType.warehouse": "Warehouse",
    "comType.mall": "Shopping Mall",
    "listingPage.carDetails": "Car Details",
    "listingPage.motoDetails": "Motorcycle Details",
    "listingPage.brandLabel": "Manufacturer",
    "listingPage.brandChoose": "Choose a manufacturer...",
    "listingPage.brandError": "Please choose a manufacturer",
    "listingPage.modelLabel": "Model",
    "listingPage.modelChooseBrandFirst": "Choose a manufacturer first",
    "listingPage.modelChoose": "Choose a model...",
    "listingPage.modelError": "Please choose a model",
    "listingPage.yearLabel": "Manufacture Year",
    "listingPage.yearChoose": "Choose a year...",
    "listingPage.yearError": "Please choose a manufacture year",
    "listingPage.descTitle": "Ad Description",
    "listingPage.descLabel": "Additional Description (optional)",
    "listingPage.descPlaceholder": "Add any extra details that help buyers, such as condition, extras, or reason for selling...",
    "listingPage.descHint": "For cars and motorcycles: mention inspection status, mileage, or any modifications.",
    "listingPage.photosTitle": "Photos",
    "listingPage.photosLabel": "Attach Photos (optional)",
    "listingPage.photosHint": "You can attach more than one photo for your ad. This step is optional.",
    "listingPage.publishBtn": "Publish Ad",
    "listingPage.fixErrors": "Please fix the highlighted fields above before publishing.",
    "listingPage.photosStorageQuotaError": "Couldn't publish the listing because the attached photos are too large. Please attach fewer photos, or smaller ones, and try again.",
    "listingPage.publishing": "Publishing...",
    "listingPage.success": "Your ad was published successfully, redirecting to the homepage...",
    "listingPage.odometerLabel": "Odometer Reading (km)",
    "listingPage.odometerError": "Please enter the odometer reading",
    "listingPage.photosLabelRequired": "Attach Photos",
    "listingPage.dropzoneText": "Drag and drop photos here, or click to choose from your device",
    "listingPage.photosError": "Please attach at least one photo",
    "listingPage.photosHintRequired": "You must attach at least one photo to publish the ad.",
    "listingPage.customFieldRequiredError": "Please fill in this field",
    "listingPage.authRequired": "You must log in to post an ad on the platform.",
    "listingPage.noDescription": "The owner did not add an additional description.",
    "listingPage.ownAdNote": "This is your own ad. You can follow any messages about it from the My Messages page.",
    "listingPage.loginToMessagePrompt": "You must log in to message the ad owner.",
    "listingPage.messagePlaceholder": "Write your message to the ad owner here...",
    "listingPage.sendMessageBtn": "Send Message",
    "listingPage.viewMessagesLink": "View My Messages",
    "listingPage.detailBack": "← Back to all listings",
    "listingPage.notFoundTitle": "Ad Not Found",
    "listingPage.notFoundBody": "This ad may have been removed, or the link is incorrect.",
    "listingPage.galleryNoPhotos": "No photos attached to this ad",
    "listingPage.hiddenByAdminNotice": "This ad has been hidden by the platform administration and is not visible to other users.",
    "listingPage.reportLink": "Report this ad",
    "listingPage.reportReasonLabel": "Reason for report",
    "listingPage.reportReason.misleading": "Misleading information",
    "listingPage.reportReason.duplicate": "Duplicate ad",
    "listingPage.reportReason.soldElsewhere": "Sold elsewhere",
    "listingPage.reportReason.inappropriate": "Inappropriate content",
    "listingPage.reportReason.other": "Other",
    "listingPage.reportDetailsLabel": "Additional details (optional)",
    "listingPage.reportSubmitBtn": "Submit Report",
    "listingPage.reportSubmitted": "Report submitted, thank you",
    "adminRole.super_admin": "Super Admin",
    "adminRole.admin": "Admin",
    "adminRole.moderator": "Moderator",
    "adminRole.support": "Support",
    "adminRole.finance_admin": "Finance Admin",
    "adminRole.content_admin": "Content Admin",

    "meta.admin.title": "Admin Dashboard | Mubasher",
    "admin.badge": "Admin",
    "admin.loginRequired": "You must log in to access the admin dashboard.",
    "admin.accessDenied": "Your account does not have access to the admin dashboard.",

    "adminAuth.visualTitle": "A dedicated login gateway for the admin team",
    "adminAuth.visualSub": "This page is for admin accounts only, entirely separate from user login.",
    "adminAuth.loginTitle": "Admin Login",
    "adminAuth.loginSub": "For admin and manager accounts only",
    "adminAuth.emailOrUsernameLabel": "Username",
    "adminAuth.emailOrUsernameError": "Please enter a valid username",
    "adminAuth.needNewAdmin": "Need to register a new admin?",
    "adminAuth.notAdmin": "Not an admin?",
    "adminAuth.goUserLogin": "User login",
    "adminAuth.notAdminAccount": "This account is not an admin account — please use the user login page.",
    "adminAuth.imAdmin": "Admin team login",
    "admin.bootstrapNote": "There is no \"Super Admin\" account on the platform yet. As the first user to open this page, you can grant your own account Super Admin access.",
    "admin.claimSuperAdminBtn": "Grant my account Super Admin access",
    "admin.twoFactorPrompt": "This account has two-factor verification enabled. Enter the one-time code shown below to confirm it's you (demo environment: the code is shown here instead of being sent for real).",
    "admin.registerNewAdminBtn": "Register New Admin",
    "admin.registerNewAdmin.heading": "Register New Admin",
    "admin.registerNewAdmin.note": "This action is available to the Super Admin only. Enter the Super Admin's credentials below to authorize it, then the new admin's details and their permission type.",
    "admin.registerNewAdmin.bypassNotice": "⚠️ Temporary recovery mode: super admin authorization is currently disabled, and the account you create below will be granted full \"super admin\" access immediately. Re-enable authorization in the code once you've regained access.",
    "admin.registerNewAdmin.authorizerTitle": "Super Admin Credentials (to authorize)",
    "admin.registerNewAdmin.authorizerError": "Invalid Super Admin credentials, or this account does not have Super Admin access",
    "admin.registerNewAdmin.newAdminTitle": "New Admin's Details",
    "admin.registerNewAdmin.roleLabel": "Permission Type",
    "admin.registerNewAdmin.submitBtn": "Register New Admin",
    "admin.registerNewAdmin.backBtn": "Back to Login",
    "admin.registerNewAdmin.success": "✅ The new admin account was created successfully! Redirecting you to the login page...",
    "admin.logoutBtn": "Log Out",
    "admin.role.user": "Regular user",

    "admin.nav.dashboard": "Dashboard",
    "admin.nav.users": "Users",
    "admin.nav.cars": "Cars",
    "admin.nav.properties": "Properties",
    "admin.nav.categories": "Categories",
    "admin.nav.listings": "Listings",
    "admin.nav.payments": "Payments",
    "admin.nav.subscriptions": "Subscriptions",
    "admin.nav.reports": "Reports & Complaints",
    "admin.nav.content": "Content",
    "admin.nav.settings": "Settings",
    "admin.nav.adminUsers": "Admin Users",
    "admin.nav.auditLogs": "Audit Logs",
    "admin.nav.database": "Database Management",

    "admin.database.heading": "Database Management",
    "admin.database.pageNote": "Super admin only — direct access to all platform data. Pick a table above, then add, edit, or delete any record. You can also edit an entire table at once as raw JSON for quick bulk changes.",
    "admin.database.note": "Every change here writes directly to the live data — there is no \"undo\". Be extra careful when editing the users table.",
    "admin.database.searchPlaceholder": "Search within records...",
    "admin.database.addRecordBtn": "+ New Record",
    "admin.database.editRawBtn": "Edit Entire Table (Raw JSON)",
    "admin.database.col.id": "ID",
    "admin.database.col.preview": "Record Preview",
    "admin.database.col.actions": "Actions",
    "admin.database.emptyTable": "No records in this table.",
    "admin.database.editBtn": "Edit",
    "admin.database.deleteBtn": "Delete",
    "admin.database.deleteConfirm": "Are you sure you want to delete this record? This cannot be undone.",
    "admin.database.addRecordHeading": "Add New Record",
    "admin.database.editRecordHeading": "Edit Record",
    "admin.database.rawEditHeading": "Edit Entire Table (Raw JSON)",
    "admin.database.rawEditWarning": "Warning: saving below replaces the whole table immediately. Make sure the JSON is valid before saving.",
    "admin.database.saveBtn": "Save",
    "admin.database.cancelBtn": "Cancel",
    "admin.database.invalidJsonError": "Invalid JSON format. Please check the text and try again.",
    "admin.database.notArrayError": "The table content must be a list [ ] of records.",
    "admin.database.missingIdError": "This record needs a value for the ID field before saving.",
    "admin.database.duplicateIdError": "Another record already has this same ID. Use a different one.",
    "admin.database.lastSuperAdminError": "This change can't be saved — it would leave the platform with no \"super admin\" account, locking you out of the admin panel entirely.",
    "admin.database.table.users": "Users",
    "admin.database.table.listings": "Listings",
    "admin.database.table.messages": "Messages",
    "admin.database.table.notifications": "Notifications",
    "admin.database.table.favorites": "Favorites",
    "admin.database.table.reviews": "Reviews",
    "admin.database.table.reports": "Reports",
    "admin.database.table.coupons": "Coupons",
    "admin.database.table.customCategories": "Custom Categories",
    "admin.database.table.auditLog": "Audit Log",
    "admin.database.fieldFormHint": "Edit each field in place. Long text fields and arrays/objects are edited as short JSON text within the same field.",
    "admin.database.newFieldKeyPlaceholder": "New field name",
    "admin.database.newFieldValuePlaceholder": "Value (optional)",
    "admin.database.addFieldBtn": "+ Add Field",
    "admin.database.duplicateFieldKeyError": "A field with this name already exists on this record.",
    "admin.database.invalidFieldJsonError": "Invalid JSON format in field(s): {fields}",
    "admin.database.attachmentValue": "Attachment (long content)",
    "admin.database.fieldType.text": "Text",
    "admin.database.fieldType.number": "Number",
    "admin.database.fieldType.boolean": "Boolean",
    "admin.database.fieldType.textarea": "Long Text",
    "admin.database.fieldType.array": "Array",
    "admin.database.fieldType.object": "Object",

    "admin.auditAction.database_record_created": "Record added via Database Management",
    "admin.auditAction.database_record_updated": "Record updated via Database Management",
    "admin.auditAction.database_record_deleted": "Record deleted via Database Management",
    "admin.auditAction.database_table_bulk_edited": "Entire table bulk-edited via Database Management",

    "admin.categories.heading": "Platform Categories",
    "admin.categories.addBtn": "Add New Category",
    "admin.categories.note": "The core categories (land, residential, commercial, car, motorcycle) are fixed and can't be deleted. You can add entirely new categories to the platform and define their own fields.",
    "admin.categories.col.icon": "Icon",
    "admin.categories.col.name": "Name",
    "admin.categories.col.group": "Group",
    "admin.categories.col.fields": "Fields",
    "admin.categories.col.listings": "Listings",
    "admin.categories.col.type": "Type",
    "admin.categories.group.realestate": "Real Estate",
    "admin.categories.group.vehicles": "Vehicles",
    "admin.categories.builtinBadge": "Built-in",
    "admin.categories.customBadge": "Custom",
    "admin.categories.builtinNote": "Built-in platform category",
    "admin.categories.editBtn": "Edit",
    "admin.categories.deleteBtn": "Delete",
    "admin.categories.deleteBlockedHasListings": "This category can't be deleted because listings still use it. Remove or move those listings first.",
    "admin.categories.deleteConfirm": "Are you sure you want to delete this category? This cannot be undone.",
    "admin.categories.editHeading": "Edit Category",
    "admin.categories.addHeading": "Add New Category",
    "admin.categories.nameArLabel": "Name (Arabic)",
    "admin.categories.nameEnLabel": "Name (English)",
    "admin.categories.iconLabel": "Icon (emoji, optional)",
    "admin.categories.groupLabel": "Group",
    "admin.categories.fieldsHeading": "This category's fields",
    "admin.categories.fieldsNote": "Add the fields specific to this category (e.g. area, color, capacity...). Each field appears on the listing form for this category only.",
    "admin.categories.fieldLabelAr": "Label (Arabic)",
    "admin.categories.fieldLabelEn": "Label (English)",
    "admin.categories.fieldTypeLabel": "Field type",
    "admin.categories.fieldType.text": "Text",
    "admin.categories.fieldType.number": "Number",
    "admin.categories.fieldType.select": "Dropdown",
    "admin.categories.fieldType.year": "Year",
    "admin.categories.fieldRequired": "Required field",
    "admin.categories.fieldInternal": "Internal only (not shown to customers)",
    "admin.categories.optionsHint": "Dropdown options:",
    "admin.categories.addOptionBtn": "+ Add option",
    "admin.categories.removeOptionBtn": "Remove option",
    "admin.categories.addFieldBtn": "+ Add new field",
    "admin.categories.removeFieldBtn": "Remove this field",
    "admin.categories.saveBtn": "Save category",
    "admin.categories.cancelBtn": "Cancel",
    "admin.categories.nameRequiredError": "Please enter the category name in both Arabic and English",
    "admin.categories.fieldLabelRequiredError": "Please enter a label for every field in both Arabic and English",

    "admin.dashboard.heading": "Dashboard",
    "admin.dashboard.topCities": "Most active regions",
    "admin.dashboard.noCityData": "Not enough data yet.",
    "admin.dashboard.stat.users": "Total users",
    "admin.dashboard.stat.listings": "Total listings",
    "admin.dashboard.stat.cars": "Cars & motorcycles",
    "admin.dashboard.stat.properties": "Properties & land",
    "admin.dashboard.stat.sold": "Sold listings",
    "admin.dashboard.stat.revenue": "Estimated revenue",
    "admin.dashboard.stat.newSubs": "New subscriptions (7 days)",
    "admin.dashboard.stat.activeUsers": "Active users (30 days)",

    "admin.users.heading": "User Management",
    "admin.users.searchPlaceholder": "Search by name or email...",
    "admin.users.col.name": "Name",
    "admin.users.col.email": "Email",
    "admin.users.col.phone": "Phone",
    "admin.users.col.photo": "Profile Photo",
    "admin.users.col.password": "Password",
    "admin.users.col.role": "Role",
    "admin.users.col.status": "Status",
    "admin.users.col.plan": "Plan",
    "admin.users.col.joined": "Last login",
    "admin.users.col.actions": "Actions",
    "admin.users.filterAllRoles": "All Roles",
    "admin.users.filterAllStatuses": "All Statuses",
    "admin.users.revealPassword": "Show/hide password",
    "admin.users.resetPassword": "Reset password",
    "admin.users.resetPasswordConfirm": "A new temporary password will be generated for this user and their current password revoked. Continue?",
    "admin.users.resetPasswordHint": "New temporary password — hand it to the user right away; it won't be shown again after you leave this page",
    "admin.users.statusActive": "Active",
    "admin.users.statusDisabled": "Disabled",
    "admin.users.flagged": "Flagged",
    "admin.users.enableBtn": "Enable",
    "admin.users.disableBtn": "Disable",
    "admin.users.flagBtn": "Flag as suspicious",
    "admin.users.unflagBtn": "Remove flag",
    "admin.users.deleteBtn": "Delete",
    "admin.users.deleteConfirm": "Are you sure you want to permanently delete this account?",
    "admin.users.cannotDeleteSelf": "You can't delete your own account from here.",
    "admin.users.neverLoggedIn": "Never logged in",
    "admin.users.lastSuperAdminWarning": "The platform must always have at least one Super Admin.",
    "admin.users.onlyOneSuperAdmin": "There is already a Super Admin, and only one Super Admin is allowed at a time. Remove the current Super Admin's role first if you want to transfer it to someone else.",

    "admin.cars.heading": "Cars & Motorcycles Management",
    "admin.properties.heading": "Properties & Land Management",
    "admin.listings.heading": "All Listings",
    "admin.listings.searchPlaceholder": "Search listings...",
    "admin.listings.col.category": "Type",
    "admin.listings.col.title": "Listing",
    "admin.listings.col.owner": "Owner",
    "admin.listings.col.price": "Price",
    "admin.listings.col.city": "City",
    "admin.listings.col.status": "Status",
    "admin.listings.col.visibility": "Visibility",
    "admin.listings.col.actions": "Actions",
    "admin.listings.hidden": "Hidden",
    "admin.listings.visible": "Visible",
    "admin.listings.hideBtn": "Hide",
    "admin.listings.unhideBtn": "Unhide",

    "admin.payments.heading": "Payments",
    "admin.payments.simulatedNote": "Data derived from users' current subscription plans. No real payment gateway is connected to this demo site.",
    "admin.payments.mrr": "Estimated monthly revenue",
    "admin.payments.arr": "Estimated yearly revenue",
    "admin.payments.totalSubscribers": "Total subscribers",
    "admin.payments.perYear": "per year",
    "admin.payments.col.user": "User",
    "admin.payments.col.plan": "Plan",
    "admin.payments.col.amount": "Estimated amount",

    "admin.subscriptions.heading": "Subscriptions",
    "admin.subscriptions.col.user": "User",
    "admin.subscriptions.col.plan": "Current plan",
    "admin.subscriptions.col.actions": "Change plan",
    "admin.subscriptions.planUpdated": "The user's subscription plan was updated successfully.",
    "admin.subPricing.heading": "Subscription Pricing (Super Admin only)",
    "admin.subPricing.note": "Edit the monthly and yearly subscription price. Changes are reflected immediately on the signup page and the \"My Subscription\" page.",
    "admin.subPricing.monthlyLabel": "Monthly Price (SDG)",
    "admin.subPricing.yearlyLabel": "Yearly Price (SDG)",
    "admin.subPricing.saveBtn": "Save Prices",
    "admin.subDiscount.heading": "Date-Ranged Subscription Discount",
    "admin.subDiscount.note": "The discount is applied automatically to both the monthly and yearly prices only during the selected period.",
    "admin.subDiscount.percentLabel": "Discount %",
    "admin.subDiscount.startLabel": "Start Date",
    "admin.subDiscount.endLabel": "End Date",
    "admin.subDiscount.saveBtn": "Save Discount",
    "admin.subDiscount.invalidRange": "Please select a valid start and end date (start before end).",

    "admin.coupons.heading": "Offers & Coupons",
    "admin.coupons.codePlaceholder": "Coupon code",
    "admin.coupons.discountPlaceholder": "Discount %",
    "admin.coupons.addBtn": "Add",
    "admin.coupons.col.code": "Code",
    "admin.coupons.col.discount": "Discount",
    "admin.coupons.col.status": "Status",
    "admin.coupons.col.actions": "Actions",
    "admin.coupons.active": "Active",
    "admin.coupons.inactive": "Inactive",
    "admin.coupons.activateBtn": "Activate",
    "admin.coupons.deactivateBtn": "Deactivate",
    "admin.coupons.added": "The coupon was added successfully.",

    "admin.reports.heading": "Reports & Complaints",
    "admin.reports.col.listing": "Listing",
    "admin.reports.col.reporter": "Reporter",
    "admin.reports.col.reason": "Reason",
    "admin.reports.col.status": "Status",
    "admin.reports.col.date": "Date",
    "admin.reports.col.actions": "Actions",
    "admin.reports.listingDeleted": "Listing deleted",
    "admin.reports.resolveBtn": "Resolve",
    "admin.reports.dismissBtn": "Dismiss",
    "admin.reports.deleteListingBtn": "Delete listing",
    "admin.reports.status.open": "Open",
    "admin.reports.status.resolved": "Resolved",
    "admin.reports.status.dismissed": "Dismissed",

    "admin.content.heading": "Homepage Content Management",
    "admin.content.note": "Changes here replace the default text per language. Leave a field empty to fall back to the default text.",
    "admin.content.saveBtn": "Save changes",
    "admin.content.arLabel": "Arabic",
    "admin.content.enLabel": "English",
    "admin.content.saved": "Homepage content saved successfully.",

    "admin.settings.heading": "Platform Settings",
    "admin.settings.minAgeLabel": "Minimum signup age",
    "admin.settings.maintenanceModeLabel": "Enable maintenance mode (shows a banner to visitors on the homepage)",
    "admin.settings.maintenanceMessageNote": "The maintenance message can be edited in both Arabic and English from the \"Content\" section.",
    "maintenance.customMessage": "",
    "admin.settings.saveBtn": "Save settings",
    "admin.settings.saved": "Settings saved successfully.",
    "admin.dbBackup.heading": "Database backups (Supabase)",
    "admin.dbBackup.note": "An automatic snapshot is saved inside the database every day at 03:00 (UTC) and kept for 14 days. Download a copy to your device regularly — database snapshots alone don't protect against the project being deleted or paused.",
    "admin.dbBackup.downloadBtn": "Download full backup now",
    "admin.dbBackup.snapshotBtn": "Save snapshot now",
    "admin.dbBackup.refreshBtn": "Refresh list",
    "admin.dbBackup.working": "Working...",
    "admin.dbBackup.downloaded": "Full backup downloaded successfully.",
    "admin.dbBackup.snapshotDone": "Snapshot #{id} saved.",
    "admin.dbBackup.forbidden": "This action is only for the super admin signed in through the database. Log out and sign in with the super admin account.",
    "admin.dbBackup.unavailable": "Couldn't reach the database. Check your internet connection and try again.",
    "admin.dbBackup.error": "Couldn't complete the action, please try again.",
    "admin.dbBackup.empty": "No snapshots yet.",
    "admin.dbBackup.colDate": "Date",
    "admin.dbBackup.colLabel": "Type",
    "admin.dbBackup.colRows": "Records",
    "admin.dbBackup.download": "Download",
    "admin.dbBackup.lastDownload": "Last full backup download: {date}",
    "admin.dbBackup.neverDownloaded": "You haven't downloaded a full backup yet — we recommend downloading one now.",
    "admin.dbBackup.staleWarning": "More than 7 days since the last download — we recommend downloading a new backup.",
    "admin.settings.backupHeading": "Data Backup",
    "admin.settings.backupNote": "Export all platform data (users, listings, messages...) as a backup file, or restore from a previous backup.",
    "admin.settings.exportBtn": "Download backup",
    "admin.settings.importBtn": "Import backup",
    "admin.settings.importConfirm": "This will completely replace the current platform data with the backup's data. Continue?",
    "admin.settings.importSuccess": "Backup imported successfully, reloading the page...",
    "admin.settings.importError": "Couldn't read the backup file. Make sure it's a valid JSON file.",
    "admin.settings.dangerHeading": "Danger zone",
    "admin.settings.dangerNote": "Permanently delete every user and admin account from this device/browser, except your own account. This also deletes their listings, messages, notifications, reviews, favorites and reports. This action is local only (this browser's data) and cannot be undone.",
    "admin.settings.dangerDeleteBtn": "Delete all users and admins (except my account)",
    "admin.settings.dangerConfirm1": "This will permanently delete every user and admin from this browser except your own account, along with all their listings, messages and related data. Continue?",
    "admin.settings.dangerConfirm2": "To confirm, type the following phrase exactly: DELETE ALL",
    "admin.settings.dangerConfirmPhrase": "DELETE ALL",
    "admin.settings.dangerCancelled": "Cancelled — nothing was deleted.",
    "admin.settings.dangerNothingToDelete": "There are no other users to delete.",
    "admin.settings.dangerDone": "Permanently deleted {count} accounts and all their related data from this browser.",

    "admin.adminUsers.heading": "Admin Users",
    "admin.adminUsers.emailPlaceholder": "User's email",
    "admin.adminUsers.grantBtn": "Grant access",
    "admin.adminUsers.col.name": "Name",
    "admin.adminUsers.col.email": "Email",
    "admin.adminUsers.col.role": "Role",
    "admin.adminUsers.col.permissions": "Permissions",
    "admin.adminUsers.col.twoFactor": "Two-factor auth",
    "admin.adminUsers.col.actions": "Actions",
    "admin.adminUsers.allPermissions": "All permissions",
    "admin.adminUsers.editPermissionsBtn": "Edit permissions",
    "admin.adminUsers.savePermissionsBtn": "Save permissions",
    "admin.adminUsers.enable2fa": "Enable 2FA",
    "admin.adminUsers.disable2fa": "Disable 2FA",
    "admin.adminUsers.revokeBtn": "Revoke access",
    "admin.adminUsers.deleteBtn": "Delete permanently",
    "admin.adminUsers.deleteConfirm": "This will permanently delete {email}'s account from the platform, along with all their listings, messages and related data. This cannot be undone. Are you sure?",
    "admin.adminUsers.userNotFound": "No user found with that email.",
    "admin.adminUsers.alreadyAdmin": "This user already has admin access.",
    "admin.adminUsers.grantHint": "The new admin only gets access at first — the super admin then sets their permissions from the table below.",
    "admin.adminUsers.grantSuccess": "✅ Admin access granted successfully to {email}",

    "admin.auditLogs.heading": "Audit Log",
    "admin.auditLogs.col.date": "Date",
    "admin.auditLogs.col.actor": "User",
    "admin.auditLogs.col.action": "Action",
    "admin.auditLogs.col.target": "Target",
    "admin.auditLogs.col.details": "Details",

    "admin.auditAction.login_success": "Successful login",
    "admin.auditAction.login_failed": "Failed login attempt",
    "admin.auditAction.login_blocked_disabled": "Login attempt on a disabled account",
    "admin.auditAction.listing_reported": "Listing reported",
    "admin.auditAction.user_role_changed": "User role changed",
    "admin.auditAction.user_enabled": "User account enabled",
    "admin.auditAction.user_disabled": "User account disabled",
    "admin.auditAction.user_flagged": "User account flagged as suspicious",
    "admin.auditAction.user_unflagged": "User account flag removed",
    "admin.auditAction.user_deleted": "User account deleted",
    "admin.auditAction.user_plan_changed": "User subscription plan changed",
    "admin.auditAction.listing_hidden": "Listing hidden",
    "admin.auditAction.listing_unhidden": "Listing unhidden",
    "admin.auditAction.listing_status_changed": "Listing status changed",
    "admin.auditAction.listing_deleted": "Listing deleted",
    "admin.auditAction.listing_deleted_from_report": "Listing deleted via a report",
    "admin.auditAction.report_resolved": "Report resolved",
    "admin.auditAction.report_dismissed": "Report dismissed",
    "admin.auditAction.coupon_added": "Coupon added",
    "admin.auditAction.coupon_toggled": "Coupon status toggled",
    "admin.auditAction.coupon_deleted": "Coupon deleted",
    "admin.auditAction.site_content_updated": "Homepage content updated",
    "admin.auditAction.site_settings_updated": "Platform settings updated",
    "admin.auditAction.backup_exported": "Backup exported",
    "admin.auditAction.backup_imported": "Backup imported",
    "admin.auditAction.admin_role_granted": "Admin role granted",
    "admin.auditAction.admin_role_revoked": "Admin role revoked",
    "admin.auditAction.admin_2fa_enabled": "Two-factor auth enabled for an admin account",
    "admin.auditAction.admin_2fa_disabled": "Two-factor auth disabled for an admin account",
    "admin.auditAction.admin_2fa_verified": "Two-factor verification succeeded",
    "admin.auditAction.subscription_pricing_updated": "Subscription pricing updated",
    "admin.auditAction.subscription_discount_updated": "Subscription discount updated",
    "admin.auditAction.admin_permissions_changed": "Admin permissions changed",
    "admin.auditAction.category_created": "New category added",
    "admin.auditAction.category_updated": "Category updated",
    "admin.auditAction.category_deleted": "Category deleted",
    "admin.auditAction.admin_password_reset": "User password reset by admin",
    "admin.auditAction.admin_registered_by_superadmin": "Admin registered by super admin",

    "maintenance.defaultMessage": "The platform is currently under maintenance. We apologize for any inconvenience and will be back shortly.",

    "listingPage.saveChangesBtn": "Save Changes",
    "listingPage.editHeading": "Edit Ad",
    "listingPage.editSub": "Update your ad's details below.",
    "listingPage.currentPhotosLabel": "Current Photos",
    "listingPage.photosHintEdit": "Leave this empty to keep the current photos, or attach new ones to replace them.",
    "listingPage.editSuccess": "Your changes were saved successfully, redirecting...",
    "nav.myListings": "My Ads",
    "meta.myListings.title": "My Ads | Mubasher",
    "myListings.heading": "My Ads",
    "myListings.sub": "Manage your posted ads: edit, delete, or mark as sold.",
    "myListings.loginNotice": "You must log in to view your ads.",
    "myListings.emptyState": "You haven't posted any ads yet.",
    "myListings.viewBtn": "View",
    "myListings.editBtn": "Edit",
    "myListings.deleteBtn": "Delete",
    "myListings.deleteConfirm": "Are you sure you want to delete this ad? This cannot be undone.",
    "myListings.markSoldBtn": "Mark as Sold",
    "myListings.reactivateBtn": "Reactivate Ad",
    "listing.featuredBadge": "Featured",
    "myListings.featureBtn": "Feature this Ad",
    "myListings.unfeatureBtn": "Unfeature",
    "admin.listings.featureBtn": "Feature",
    "admin.listings.unfeatureBtn": "Unfeature",
    "myListings.notOwnerError": "You cannot edit an ad you do not own.",
    "listing.active": "Available",
    "listing.sold": "Sold",
    "nav.messages": "My Messages",
    "spec.km": "km",
    "home.noRealestate": "No properties posted yet. Be the first to post an ad!",
    "home.noVehicles": "No cars or motorcycles posted yet. Be the first to post an ad!",
    "meta.listingDetail.title": "Ad Details | Mubasher",
    "meta.messages.title": "My Messages | Mubasher",
    "messages.heading": "My Messages",
    "messages.sub": "Follow your conversations with ad owners and people interested in your ads.",
    "messages.loginNotice": "You must log in to view your messages.",
    "messages.emptyState": "No messages yet. Browse listings and start a conversation with any ad owner.",
    "messages.deletedListing": "Deleted listing",
    "messages.replyPlaceholder": "Write your reply here...",
    "messages.sendBtn": "Send",
    "messages.contactLeakWarning": "You can't include a phone number, email address, social media handle, or link in messages, to protect your privacy and safety. Please keep the conversation within the site's messaging system.",
    "messages.noMessagesYet": "No messages in this conversation yet.",
    "legal.updated": "Last updated: September 2026",
    "privacy.heading": "Privacy Policy",
    "privacy.s1.heading": "Introduction",
    "privacy.s1.body": "At Mubasher, we respect our users' privacy. This policy explains what information we collect, how we use it, and how we protect it when you use the platform.",
    "privacy.s2.heading": "Information We Collect",
    "privacy.s2.body": "We collect the information you provide directly when creating an account, such as your name, email, and phone number, along with the details of any ads you post on the platform.",
    "privacy.s3.heading": "How We Use Your Information",
    "privacy.s3.body": "We use your data to operate your account, display your ads to other users, communicate with you about your requests, and improve the platform's services.",
    "privacy.s4.heading": "Information Sharing",
    "privacy.s4.body": "We do not sell your personal data to third parties. Contact details you choose to display in your ad may be shown only to interested users.",
    "privacy.s5.heading": "Data Security",
    "privacy.s5.body": "We take reasonable measures to protect your data from unauthorized access, though no electronic storage system is completely free of security risk.",
    "privacy.s6.heading": "Cookies & Local Storage",
    "privacy.s6.body": "The platform uses local storage in your browser to save your preferences, such as language and login status, to improve your browsing experience.",
    "privacy.s7.heading": "Your Rights",
    "privacy.s7.body": "You have the right to access, update, or request deletion of your account at any time by contacting our support team.",
    "privacy.s8.heading": "Changes to This Policy",
    "privacy.s8.body": "We may update this privacy policy from time to time. Any material changes will be posted on this page along with the update date.",
    "privacy.s9.heading": "Contact Us",
    "privacy.s9.body": "For any questions about this policy or your personal data, you can contact our technical support team through the platform.",
    "terms.heading": "Terms & Conditions",
    "terms.s1.heading": "Introduction",
    "terms.s1.body": "By using the Mubasher platform, you agree to these Terms & Conditions. If you do not agree with any part of them, please do not use the platform.",
    "terms.s2.heading": "Use of the Platform",
    "terms.s2.body": "The platform is used to list and browse ads for real estate, land, cars, and motorcycles only. Using it for any unlawful purpose is prohibited.",
    "terms.s3.heading": "User Accounts",
    "terms.s3.body": "You are responsible for keeping your account credentials and password confidential, and for all activity that occurs under your account. Users must be 18 years of age or older to create an account and use the platform; registration is not permitted for anyone under this age.",
    "terms.s4.heading": "Posting Rules",
    "terms.s4.body": "Information posted in your ad must be accurate and truthful. Misleading or duplicate ads, or ads for items you do not own, are prohibited.",
    "terms.s5.heading": "Liability",
    "terms.s5.body": "The platform is only an intermediary for displaying ads and is not liable for any direct dealings or disputes between buyers and sellers.",
    "terms.s6.heading": "Intellectual Property",
    "terms.s6.body": "All design elements and the platform's logo are protected and may not be copied or reused without prior permission.",
    "terms.s7.heading": "Termination",
    "terms.s7.body": "The platform reserves the right to suspend or terminate any account that violates these terms, without prior notice in cases of serious violations.",
    "terms.s8.heading": "Changes to These Terms",
    "terms.s8.body": "These terms may be updated from time to time. Continuing to use the platform after an update constitutes acceptance of the new terms.",
    "terms.s9.heading": "Contact Us",
    "terms.s9.body": "For any questions about these terms, you can contact our technical support team through the platform.",
    }
  };

  /* ---------- محرك الترجمة ---------- */
  function t(key) {
    var overrides = getSiteContentOverrides();
    if (overrides[currentLang] && overrides[currentLang][key]) {
      return overrides[currentLang][key];
    }
    var dict = I18N[currentLang] || I18N.ar;
    return dict[key] !== undefined ? dict[key] : (I18N.ar[key] !== undefined ? I18N.ar[key] : key);
  }

  function applyTranslations() {
    document.documentElement.setAttribute("lang", currentLang === "ar" ? "ar" : "en");
    document.documentElement.setAttribute("dir", currentLang === "ar" ? "rtl" : "ltr");

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });

    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      el.textContent = t(key);
      if (el.tagName === "TITLE") document.title = t(key);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", t(key));
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria-label");
      el.setAttribute("aria-label", t(key));
    });

    /* عناصر تعرض اسم فئة (قد تكون فئة مخصّصة أضافها المدير العام وليست جزءًا من
       قاموس الترجمة الثابت) — تُحدَّث نصوصها هنا مركزيًا في كل مرة تتغيّر اللغة */
    document.querySelectorAll("[data-cat-name]").forEach(function (el) {
      el.textContent = getCategoryLabel(el.getAttribute("data-cat-name"));
    });

    var langToggle = document.getElementById("langToggle");
    if (langToggle) {
      langToggle.textContent = currentLang === "ar" ? "EN" : "AR";
    }
    applyTheme();
  }

  function setLang(lang) {
    currentLang = lang === "en" ? "en" : "ar";
    localStorage.setItem(LANG_KEY, currentLang);
    applyTranslations();
    initHeaderAuthState();
    renderMaintenanceBanner();
    if (typeof window.__rerenderPage === "function") {
      window.__rerenderPage();
    }
  }

  function initLangToggle() {
    var btn = document.getElementById("langToggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      setLang(currentLang === "ar" ? "en" : "ar");
    });
  }

  /* ---------- إخفاء الهيدر وشريط التنقل السفلي عند الكتابة على الجوال ----------
     عند التركيز على أي حقل نصي قابل للكتابة (وتظهر لوحة المفاتيح)، يُضاف صنف
     "keyboard-focus-mode" على body فيُخفي الهيدر العلوي وشريط التنقل السفلي بالكامل
     (انظر CSS)، تاركًا أكبر مساحة ممكنة للحقل ولوحة المفاتيح. يُزال الصنف تلقائيًا عند
     فقدان التركيز عن الحقل (مع تأخير بسيط لتفادي الوميض عند الانتقال المباشر بين حقلين). */
  var FOCUS_MODE_FIELD_SELECTOR =
    'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="hidden"]), textarea';
  function initHideChromeOnFocus() {
    function isMobileWidth() {
      return window.innerWidth <= 880;
    }
    function isFocusableField(el) {
      return !!(el && el.matches && el.matches(FOCUS_MODE_FIELD_SELECTOR));
    }
    // الحقول الواقعة داخل الهيدر نفسه (مثل حقل بحث أمازون في الأعلى) تُستثنى: إخفاء الهيدر
    // عند التركيز عليها سيُخفي الحقل ذاته ويفقده التركيز فورًا (المتصفح يُلغي تركيز أي عنصر
    // يصبح داخل شجرة display:none)، فيسبب ذلك حلقة فقدان/استرجاع تركيز غير مستقرة.
    function isInsideHeader(el) {
      return !!(el && el.closest && el.closest("header"));
    }
    document.addEventListener("focusin", function (e) {
      if (isMobileWidth() && isFocusableField(e.target) && !isInsideHeader(e.target)) {
        document.body.classList.add("keyboard-focus-mode");
      }
    });
    document.addEventListener("focusout", function (e) {
      if (!isFocusableField(e.target)) return;
      setTimeout(function () {
        var active = document.activeElement;
        if (!isFocusableField(active) || isInsideHeader(active)) {
          document.body.classList.remove("keyboard-focus-mode");
        }
      }, 50);
    });
    window.addEventListener("resize", function () {
      if (!isMobileWidth()) document.body.classList.remove("keyboard-focus-mode");
    });
  }

  /* ---------- قائمة الجوال المنسدلة (الصفحة الرئيسية فقط — الصفحة الوحيدة التي تملك nav.links
     كاملاً) — على الشاشات الضيقة يختفي شريط التنقل الرئيسي، فيعوّضه زر ☰ يفتح لوحة منسدلة
     تضم نفس روابط التنقل بالإضافة لأزرار الحساب/تسجيل الدخول. ---------- */
  function initMobileNavToggle() {
    var toggleBtn = document.getElementById("mobileNavToggle");
    var navRow = document.querySelector(".nav-row");
    var panel = document.getElementById("mobileMenuPanel");
    var header = document.querySelector("header");
    if (!toggleBtn || !navRow) return;

    /* يضبط موضع وارتفاع لوحة القائمة المنسدلة أسفل الهيدر مباشرة في كل مرة تُفتح فيها،
       بحيث تبقى منطقة تمرير اللوحة (ومؤشر السحب الخاص بها) مطابقة تمامًا لطول قائمة
       الروابط نفسها، بلا علاقة بطول باقي الصفحة خلفها. */
    function positionPanel() {
      if (!panel || !header) return;
      var headerBottom = header.getBoundingClientRect().bottom;
      /* شريط التنقل السفلي الثابت (Bottom Nav) يطفو فوق كل شيء بـ z-index أعلى من هذه
         اللوحة، فإن لم نطرح ارتفاعه هنا يمتد آخر عناصر القائمة (تبديل الوضع الداكن/اللغة،
         تنبيهات الحساب...) خلفه فيبدو للمستخدم وكأن أزرار الشريط السفلي "تتكرر" فوق قائمة
         الهيدر المفتوحة بدل أن تبقى تحتها بوضوح. */
      var bottomNavEl = document.querySelector(".app-bottom-nav");
      var bottomNavHeight =
        bottomNavEl && getComputedStyle(bottomNavEl).display !== "none"
          ? bottomNavEl.getBoundingClientRect().height
          : 0;
      panel.style.top = Math.max(0, headerBottom) + "px";
      panel.style.maxHeight = Math.max(120, window.innerHeight - headerBottom - bottomNavHeight) + "px";
    }

    function closeMenu() {
      navRow.classList.remove("mobile-menu-open");
      toggleBtn.textContent = "☰";
      toggleBtn.setAttribute("aria-expanded", "false");
    }
    function openMenu() {
      navRow.classList.add("mobile-menu-open");
      toggleBtn.textContent = "✕";
      toggleBtn.setAttribute("aria-expanded", "true");
      positionPanel();
    }

    toggleBtn.addEventListener("click", function () {
      if (navRow.classList.contains("mobile-menu-open")) closeMenu();
      else openMenu();
    });

    /* إغلاق القائمة تلقائيًا عند الضغط على أي رابط داخلها، أو تكبير الشاشة لعرض سطح المكتب */
    navRow.querySelectorAll("nav.links a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 880) closeMenu();
      else if (navRow.classList.contains("mobile-menu-open")) positionPanel();
    });
  }

  /* ---------- شريط تنقل سفلي بنمط تطبيقات أندرويد (Bottom Navigation) ----------
     يُحقن تلقائيًا في صفحات المحتوى الرئيسية (لا يظهر إلا على الشاشات الصغيرة عبر CSS)،
     بنفس منطق الجلسة/الصلاحيات المستخدَم في الهيدر — مصدر واحد للحقيقة، بدون تكرار DOM. */
  var BOTTOM_NAV_EXCLUDED_PAGES = [
    "",
    "login.html",
    "signup.html",
    "admin.html",
    "admin-login.html",
    "admin-register.html",
    "privacy.html",
    "terms.html",
  ];
  function currentPageFile() {
    return window.location.pathname.split("/").pop();
  }
  function initMobileBottomNav() {
    var page = currentPageFile();
    if (BOTTOM_NAV_EXCLUDED_PAGES.indexOf(page) !== -1) return;
    if (document.querySelector(".app-bottom-nav")) return;

    var session = getSession();

    function makeItem(opts) {
      var a = document.createElement("a");
      a.href = opts.href;
      a.className = "app-bottom-nav-item";
      if (opts.match.indexOf(page) !== -1) a.classList.add("active");
      var iconSpan = document.createElement("span");
      iconSpan.className = "app-bottom-nav-icon";
      iconSpan.textContent = opts.icon;
      if (opts.badgeId) {
        var badge = document.createElement("span");
        badge.className = "app-bottom-nav-badge";
        badge.id = opts.badgeId;
        badge.style.display = "none";
        iconSpan.appendChild(badge);
      }
      var labelSpan = document.createElement("span");
      labelSpan.className = "app-bottom-nav-label";
      labelSpan.setAttribute("data-i18n", opts.labelKey);
      labelSpan.textContent = t(opts.labelKey);
      a.appendChild(iconSpan);
      a.appendChild(labelSpan);
      return a;
    }

    var nav = document.createElement("nav");
    nav.className = "app-bottom-nav";
    nav.setAttribute("aria-label", "bottom navigation");

    nav.appendChild(
      makeItem({ href: "index.html", icon: "⌂", labelKey: "bottomNav.home", match: ["index.html", ""] })
    );
    nav.appendChild(
      makeItem({
        href: session ? "favorites.html" : "login.html",
        icon: "♡",
        labelKey: "bottomNav.favorites",
        match: ["favorites.html"],
      })
    );

    var fabItem = makeItem({
      href: "add-listing.html",
      icon: "+",
      labelKey: "bottomNav.add",
      match: ["add-listing.html"],
    });
    fabItem.classList.add("app-bottom-nav-fab-item");
    fabItem.querySelector(".app-bottom-nav-icon").className = "app-bottom-nav-fab";
    nav.appendChild(fabItem);

    nav.appendChild(
      makeItem({
        href: session ? "messages.html" : "login.html",
        icon: "✉",
        labelKey: "bottomNav.messages",
        match: ["messages.html"],
        badgeId: "bottomNavMessagesBadge",
      })
    );
    nav.appendChild(
      makeItem({
        href: session ? "my-listings.html" : "login.html",
        icon: "◉",
        labelKey: "bottomNav.profile",
        match: ["my-listings.html", "subscription.html"],
      })
    );

    document.body.appendChild(nav);
    document.body.classList.add("has-bottom-nav");
    renderBottomNavBadge();
  }
  function renderBottomNavBadge() {
    var badge = document.getElementById("bottomNavMessagesBadge");
    if (!badge) return;
    var session = getSession();
    var count = session ? getUnreadMessageCount(session) : 0;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  }

  /* ---------- شريط علوي بنمط "App Bar": زر رجوع دائري + عنوان الصفحة، بدل رابط النص
     الطويل "العودة إلى الرئيسية" — يظهر فقط على الشاشات الصغيرة (استبدال بصري عبر CSS
     يُبقي رابط النص الأصلي في الـ DOM لسطح المكتب وقارئات الشاشة). ---------- */
  function initMobileAppBar() {
    var header = document.querySelector(".listing-header");
    if (!header) return;
    var actions = header.querySelector(".listing-header-actions");
    if (!actions) return;
    var backLink = actions.querySelector('a[data-i18n="auth.backHomeShort"]');
    if (!backLink || backLink.dataset.appBarDone) return;
    backLink.dataset.appBarDone = "1";
    backLink.classList.add("app-bar-back-btn");

    var titleSource =
      document.querySelector(".listing-intro h1") || document.querySelector(".detail-title") || document.querySelector("h1");
    var titleEl = document.createElement("span");
    titleEl.className = "app-bar-title";
    titleEl.textContent = titleSource ? titleSource.textContent : document.title;
    var wrap = header.querySelector(".wrap");
    var brandEl = wrap.querySelector(".brand");
    if (brandEl && brandEl.nextSibling) {
      wrap.insertBefore(titleEl, brandEl.nextSibling);
    } else {
      wrap.appendChild(titleEl);
    }

    /* إبقاء العنوان محدَّثًا إن تغيّر النص المصدر لاحقًا (كصفحة تفاصيل الإعلان التي تُحمَّل
       بيانات الإعلان بعد الرسم الأولي) */
    if (titleSource) {
      var mo = new MutationObserver(function () {
        titleEl.textContent = titleSource.textContent;
      });
      mo.observe(titleSource, { childList: true, characterData: true, subtree: true });
    }
  }

  /* ---------- تأثير التموّج (Ripple) بنمط Material عند الضغط على الأزرار — للشاشات
     الصغيرة فقط، ولا يغيّر أي منطق نقر موجود (يُضاف كطبقة بصرية فوق العنصر فقط). ---------- */
  function initMaterialRipple() {
    if (window.innerWidth > 880) return;
    document.addEventListener(
      "pointerdown",
      function (e) {
        var target = e.target.closest(".btn, .app-bottom-nav-item, .cat-card, .search-tab");
        if (!target) return;
        var rect = target.getBoundingClientRect();
        var ripple = document.createElement("span");
        ripple.className = "material-ripple";
        var size = Math.max(rect.width, rect.height) * 1.4;
        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = e.clientX - rect.left - size / 2 + "px";
        ripple.style.top = e.clientY - rect.top - size / 2 + "px";
        var computedPos = getComputedStyle(target).position;
        if (computedPos === "static") target.style.position = "relative";
        target.classList.add("material-ripple-host");
        target.appendChild(ripple);
        ripple.addEventListener("animationend", function () {
          ripple.remove();
        });
      },
      { passive: true }
    );
  }

  /* ---------- الوضع الداكن (Dark Mode) ---------- */
  var THEME_KEY = "eqari_theme";
  var currentTheme = localStorage.getItem(THEME_KEY) || "light";
  function applyTheme() {
    if (currentTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    var btn = document.getElementById("themeToggle");
    if (btn) {
      btn.textContent = currentTheme === "dark" ? "☀️" : "🌙";
      btn.setAttribute("aria-label", currentTheme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark"));
    }
  }
  function setTheme(theme) {
    currentTheme = theme === "dark" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, currentTheme);
    applyTheme();
  }
  function initThemeToggle() {
    applyTheme();
    var btn = document.getElementById("themeToggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      setTheme(currentTheme === "dark" ? "light" : "dark");
    });
  }

  /* ---------- تخزين المستخدمين والجلسة ---------- */
  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  /* ---------- تشفير كلمات المرور (PBKDF2 عبر Web Crypto — لا تُحفظ أي كلمة مرور كنص واضح) ----------
     كل مستخدم يُخزَّن له passwordHash + passwordSalt بدلاً من password كنص واضح.
     الحسابات القديمة (قبل هذا التحديث) التي لا تزال تحمل password كنص واضح تُقبل عند
     تسجيل الدخول للمرة الأولى فقط، ثم تُرحَّل فورًا إلى passwordHash/passwordSalt ويُحذف
     الحقل القديم — بذلك تُشفَّر كل كلمات المرور تدريجيًا دون إجبار أحد على إعادة التسجيل. */
  var PBKDF2_ITERATIONS = 100000;
  function bufToHex(buf) {
    return Array.prototype.map
      .call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }
  function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
  function generateTempPassword() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    var bytes = new Uint8Array(10);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var out = "";
    for (var i = 0; i < bytes.length; i++) {
      out += chars[bytes[i] % chars.length];
    }
    return out;
  }
  function generateSaltHex() {
    var bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return bufToHex(bytes);
  }
  function cryptoAvailable() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.importKey);
  }
  function pbkdf2Hex(plainPassword, saltHex) {
    if (!cryptoAvailable()) {
      /* بيئة نادرة بدون Web Crypto (مثلاً صفحة مفتوحة عبر http قديم) — نستخدم تجزئة بديلة
         بسيطة حتى لا يتعطل الموقع، وهي أفضل من نص واضح تمامًا وإن لم تكن بقوة PBKDF2 */
      var str = saltHex + ":" + plainPassword;
      var hash = 0;
      for (var i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return Promise.resolve("fallback" + Math.abs(hash).toString(16));
    }
    var enc = new TextEncoder();
    return window.crypto.subtle
      .importKey("raw", enc.encode(plainPassword), { name: "PBKDF2" }, false, ["deriveBits"])
      .then(function (keyMaterial) {
        return window.crypto.subtle.deriveBits(
          { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
          keyMaterial,
          256
        );
      })
      .then(bufToHex);
  }
  /* يُنتج {passwordHash, passwordSalt} جاهزة للتخزين على كائن المستخدم */
  function hashNewPassword(plainPassword) {
    var saltHex = generateSaltHex();
    return pbkdf2Hex(plainPassword, saltHex).then(function (hash) {
      return { passwordHash: hash, passwordSalt: saltHex };
    });
  }
  /* يتحقق من كلمة مرور مُدخَلة مقابل مستخدم مخزَّن؛ يدعم الحسابات القديمة (password نص واضح)
     ويُرحِّلها تلقائيًا إلى passwordHash/passwordSalt عند أول تحقق ناجح */
  function verifyPassword(userObj, plainPassword) {
    if (!userObj) return Promise.resolve(false);
    if (userObj.passwordHash && userObj.passwordSalt) {
      return pbkdf2Hex(plainPassword, userObj.passwordSalt).then(function (hash) {
        return hash === userObj.passwordHash;
      });
    }
    if (typeof userObj.password === "string") {
      var legacyMatch = userObj.password === plainPassword;
      if (legacyMatch) {
        migrateLegacyPassword(userObj.email, plainPassword);
      }
      return Promise.resolve(legacyMatch);
    }
    return Promise.resolve(false);
  }
  function migrateLegacyPassword(email, plainPassword) {
    hashNewPassword(plainPassword).then(function (result) {
      var users = getUsers();
      var idx = users.findIndex(function (u) {
        return u.email === email;
      });
      if (idx === -1) return;
      users[idx].passwordHash = result.passwordHash;
      users[idx].passwordSalt = result.passwordSalt;
      delete users[idx].password;
      saveUsers(users);
    });
  }
  /* يعيّن كلمة مرور جديدة مُشفَّرة على مستخدم موجود مسبقًا (تغيير/إعادة تعيين كلمة المرور) */
  function setUserPassword(email, plainPassword) {
    return hashNewPassword(plainPassword).then(function (result) {
      updateUserRecord(email, {
        passwordHash: result.passwordHash,
        passwordSalt: result.passwordSalt,
        password: undefined,
      });
      /* حذف الحقل القديم فعليًا (updateUserRecord بالدمج لا يحذف password:undefined من JSON) */
      var users = getUsers();
      var idx = users.findIndex(function (u) {
        return u.email === email;
      });
      if (idx > -1 && "password" in users[idx]) {
        delete users[idx].password;
        saveUsers(users);
      }
      return result;
    });
  }
  function findUser(identifier) {
    if (!identifier) return null;
    var users = getUsers();
    return (
      users.find(function (u) {
        return (
          u.email === identifier ||
          u.phone === identifier ||
          (!!u.username && u.username.toLowerCase() === String(identifier).toLowerCase())
        );
      }) || null
    );
  }
  function updateUserRecord(email, patch) {
    var users = getUsers();
    var idx = users.findIndex(function (u) {
      return u.email === email;
    });
    if (idx === -1) return null;
    users[idx] = Object.assign({}, users[idx], patch);
    saveUsers(users);
    return users[idx];
  }
  function getSession() {
    return localStorage.getItem(SESSION_KEY);
  }
  function setSession(email) {
    localStorage.setItem(SESSION_KEY, email);
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  /* ---------- إحداثيات تقريبية لمدن المنصة (لعرض خريطة البحث الجغرافي) ---------- */
  var CITY_COORDS = {
    khartoum: [15.5007, 32.5599],
    omdurman: [15.6445, 32.4777],
    bahri: [15.6197, 32.5324],
    madani: [14.4012, 33.5199],
    portsudan: [19.6158, 37.2164],
    kassala: [15.4514, 36.3996],
    elobeid: [13.1875, 30.2176],
    nyala: [12.0500, 24.8800],
    elfasher: [13.6300, 25.3500],
    elgeneina: [13.4522, 22.4485],
    kosti: [13.1637, 32.6625],
    sennar: [13.5500, 33.6167],
    eddamazin: [11.7833, 34.3500],
    atbara: [17.7022, 33.9870],
    dongola: [19.1667, 30.4833],
    gadarif: [14.0333, 35.3833],
    shendi: [16.6889, 33.4336],
    kadugli: [11.0100, 29.7100],
    zalingei: [12.9089, 23.4714],
    eddamer: [17.5892, 33.9700],
  };

  /* ---------- تخزين الإعلانات ---------- */
  var LISTINGS_KEY = "eqari_listings";

  function getListings() {
    try {
      return JSON.parse(localStorage.getItem(LISTINGS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  /* أخطاء تجاوز سعة التخزين المحلي (QuotaExceededError) تحدث غالبًا عند رفع عدة صور أو صور
     كبيرة الحجم دون اتصال فعّال بـ Supabase Storage (فتُحفَظ الصور كنصوص Base64 ضخمة داخل
     localStorage بدلاً من رابط خفيف) — نميّزها هنا لنعرض للمستخدم رسالة واضحة عن السبب
     الحقيقي، بدل رسالة "صحّح الأخطاء" العامة المضلِّلة. */
  function isStorageQuotaError(e) {
    return !!(
      e &&
      (e.name === "QuotaExceededError" ||
        e.code === 22 ||
        e.code === 1014 ||
        (e.message && /quota/i.test(e.message)))
    );
  }
  function saveListings(listings) {
    try {
      localStorage.setItem(LISTINGS_KEY, JSON.stringify(listings));
    } catch (e) {
      if (isStorageQuotaError(e)) {
        var quotaErr = new Error("PHOTOS_STORAGE_QUOTA_EXCEEDED");
        quotaErr.isPhotosQuotaExceeded = true;
        throw quotaErr;
      }
      throw e;
    }
  }
  function genId() {
    return "l_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  /* ---------- مزامنة الإعلان مع قاعدة بيانات Supabase الحقيقية (في الخلفية، دون تعطيل الحفظ المحلي) ----------
     إن لم تتوفر sbCreateListing/sbUpdateListing (تعذّر تحميل مكتبة Supabase، أو لا اتصال)، لا تفعل شيئًا،
     ويستمر الموقع بالعمل بالتخزين المحلي فقط كما كان قبل هذا الربط. */
  function syncListingToSupabase(listing) {
    if (!listing) return;
    /* لا يوجد حقل "عنوان" مخزَّن مع الإعلان محليًا (يُبنى تلقائيًا عند العرض)،
       لكن عمود title في Supabase إلزامي — نحسبه هنا فقط عند الإرسال */
    var payload = Object.assign({}, listing, { title: buildListingTitle(listing) });
    if (listing.sbId) {
      if (typeof sbUpdateListing === "function") {
        sbUpdateListing(listing.sbId, payload).catch(function () {});
      }
      return;
    }
    if (typeof sbCreateListing !== "function") return;
    var owner = findUser(listing.ownerEmail);
    var ownerId = owner ? owner.sbUserId : null;
    /* حسابات الإدارة (تُنشأ محليًا فقط عبر admin.html) ليس لها صف في Supabase، فتبقى إعلاناتها محلية فقط */
    if (!ownerId) return;
    sbCreateListing(payload, ownerId)
      .then(function (result) {
        if (result && result.ok && result.row) {
          var current = getListings();
          var idx = current.findIndex(function (l) {
            return l.id === listing.id;
          });
          if (idx > -1 && !current[idx].sbId) {
            current[idx].sbId = result.row.sbId;
            saveListings(current);
          }
        }
      })
      .catch(function () {});
  }

  function addListing(listing) {
    var listings = getListings();
    listings.push(listing);
    saveListings(listings);
    syncListingToSupabase(listing);
    notifySavedSearchSubscribers(listing);
    return listing;
  }
  function getListingById(id) {
    if (!id) return null;
    return (
      getListings().find(function (l) {
        return l.id === id;
      }) || null
    );
  }
  function updateListing(id, patch) {
    var listings = getListings();
    var idx = listings.findIndex(function (l) {
      return l.id === id;
    });
    if (idx === -1) return null;
    listings[idx] = Object.assign({}, listings[idx], patch);
    saveListings(listings);
    syncListingToSupabase(listings[idx]);
    return listings[idx];
  }
  function deleteListing(id) {
    var toDelete = getListings().find(function (l) {
      return l.id === id;
    });
    var listings = getListings().filter(function (l) {
      return l.id !== id;
    });
    saveListings(listings);
    if (toDelete && toDelete.sbId && typeof sbDeleteListing === "function") {
      sbDeleteListing(toDelete.sbId).catch(function () {});
    }
  }

  /* ---------- جلب كل الإعلانات من Supabase ودمجها مع النسخة المحلية (تعمل في الخلفية دون حجب عرض الصفحة) ---------- */
  function refreshListingsFromSupabase() {
    if (typeof sbFetchListings !== "function") return Promise.resolve();
    return sbFetchListings()
      .then(function (result) {
        if (!result || !result.ok || !Array.isArray(result.rows)) return;
        var local = getListings();
        var bySbId = {};
        local.forEach(function (l, i) {
          if (l.sbId) bySbId[l.sbId] = i;
        });
        result.rows.forEach(function (row) {
          var existingIdx = bySbId[row.sbId];
          if (existingIdx !== undefined) {
            var localId = local[existingIdx].id;
            local[existingIdx] = Object.assign({}, local[existingIdx], row, { id: localId });
          } else {
            row.id = "sb_" + row.sbId;
            local.push(row);
          }
        });
        saveListings(local);
        if (typeof window.__rerenderAdmin === "function") window.__rerenderAdmin();
        else if (typeof window.__rerenderPage === "function") window.__rerenderPage();
      })
      .catch(function () {});
  }
  function getListingStatus(listing) {
    return listing && listing.status === "sold" ? "sold" : "active";
  }
  function getUserStatus(user) {
    return user && user.status === "disabled" ? "disabled" : "active";
  }
  /* شارة "بائع موثّق": تظهر فقط إذا كانت إدارة المنصة قد راجعت وقبلت حساب البائع (reviewStatus === "approved")
     وكان قد أرفق صورة هوية فعليًا عند التسجيل (idPhoto). هذا يستثني الحسابات القديمة التي تمت الموافقة عليها
     يدويًا في فترة تعليق طلب صور الهوية (SIGNUP_PHOTOS_ENABLED = false) دون إرفاق صورة هوية حقيقية. */
  function isSellerVerified(email) {
    var u = findUser(email);
    return !!(u && u.reviewStatus === "approved" && u.idPhoto);
  }

  /* ---------- مرحلة الحساب: مراجعة الهوية والاشتراك والتجربة المجانية ---------- */
  var TRIAL_DAYS = 7;
  function getAccountStage(user) {
    if (!user) return "pending_review";
    /* المدير العام فقط معفى كليًا من نظام الاشتراك والتجربة المجانية. باقي موظفي الإدارة
       (مدير، مشرف، دعم فني...) يحتاجون اشتراكًا كالمستخدم العادي إذا أرادوا نشر إعلاناتهم الخاصة. */
    if (user.role === "super_admin") return "active";
    if (!user.reviewStatus || user.reviewStatus === "pending") return "pending_review";
    if (user.reviewStatus === "rejected") return "rejected";
    if (user.subscriptionStatus === "active") {
      if (user.subscriptionEndsAt && Date.now() > user.subscriptionEndsAt) return "expired";
      return "active";
    }
    if (user.trialEndsAt && Date.now() <= user.trialEndsAt) return "trial";
    return "expired";
  }
  var PLAN_DURATIONS_MS = { monthly: 30 * 24 * 60 * 60 * 1000, yearly: 365 * 24 * 60 * 60 * 1000 };
  function approveUserAccount(email) {
    var trialStart = Date.now();
    var trialEnd = trialStart + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    var result = updateUserRecord(email, {
      reviewStatus: "approved",
      rejectionReason: "",
      reviewedAt: trialStart,
      trialStartsAt: trialStart,
      trialEndsAt: trialEnd,
      subscriptionStatus: "trial",
    });
    pushNotificationOnce(email, "account_approved", {}, "approved_" + email + "_" + trialStart);
    return result;
  }
  function rejectUserAccount(email, reason) {
    var reviewedAt = Date.now();
    var result = updateUserRecord(email, {
      reviewStatus: "rejected",
      rejectionReason: reason || "",
      reviewedAt: reviewedAt,
    });
    pushNotificationOnce(email, "account_rejected", { reason: reason || "" }, "rejected_" + email + "_" + reviewedAt);
    return result;
  }
  function activateSubscriptionPayment(email, paymentMethod, plan) {
    var user = findUser(email);
    var selectedPlan = plan || (user && user.plan) || "monthly";
    var duration = PLAN_DURATIONS_MS[selectedPlan] || PLAN_DURATIONS_MS.monthly;
    var now = Date.now();
    var currentEndsAt = user && user.subscriptionStatus === "active" ? user.subscriptionEndsAt : null;
    var base = currentEndsAt && currentEndsAt > now ? currentEndsAt : now;
    var newEndsAt = base + duration;
    return updateUserRecord(email, {
      subscriptionStatus: "active",
      paymentMethod: paymentMethod,
      paidAt: now,
      plan: selectedPlan,
      subscriptionEndsAt: newEndsAt,
    });
  }

  /* ---------- تخزين الرسائل بين المستخدمين ---------- */
  var MESSAGES_KEY = "eqari_messages";

  function getMessages() {
    try {
      return JSON.parse(localStorage.getItem(MESSAGES_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveMessages(messages) {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  }
  /* ---------- مزامنة الرسائل مع Supabase (نفس نمط مزامنة الإعلانات: في الخلفية، دون تعطيل الحفظ المحلي) ----------
     رسالة تخص إعلانًا غير مُزامَن (لا sbId له)، أو مرسِل/مستقبِل بلا sbUserId (حسابات إدارة محلية)،
     تبقى محلية فقط — تمامًا كما تفعل الإعلانات في نفس الحالة. */
  function syncMessageToSupabase(message) {
    if (!message || typeof sbSendMessage !== "function") return;
    var listing = getListingById(message.listingId);
    if (!listing || !listing.sbId) return;
    var sender = findUser(message.fromEmail);
    var recipient = findUser(message.toEmail);
    if (!sender || !sender.sbUserId || !recipient || !recipient.sbUserId) return;
    sbSendMessage({
      listing_id: listing.sbId,
      sender_id: sender.sbUserId,
      recipient_id: recipient.sbUserId,
      body: message.body,
    })
      .then(function (result) {
        if (result && result.ok && result.row) {
          var current = getMessages();
          var idx = current.findIndex(function (m) {
            return m.id === message.id;
          });
          if (idx > -1 && !current[idx].sbId) {
            current[idx].sbId = result.row.sbId;
            saveMessages(current);
          }
        }
      })
      .catch(function () {});
  }

  /* ---------- منع تسرّب معلومات الاتصال داخل الرسائل ----------
     هدف هذا الفحص إبقاء التواصل بين المستخدمين داخل نظام رسائل الموقع (لحماية خصوصيتهم ولمنع
     محاولات تجاوز رسوم/إجراءات المنصة عبر الانتقال لمحادثة خارجية). يرصد: البريد الإلكتروني،
     المعرّفات على شكل @username، الروابط، أسماء تطبيقات التواصل الشائعة (واتساب/تيليجرام/...)،
     وتسلسل 8 أرقام متتالية أو أكثر (بعد حذف الفواصل الشائعة بين الأرقام) كإشارة لرقم هاتف. */
  function containsContactInfo(text) {
    if (!text) return false;
    var normalized = String(text).replace(/[0-9]/g, function (ch) {
      return String(ch.charCodeAt(0) - 1632);
    });
    var emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    if (emailPattern.test(normalized)) return true;
    if (/@[a-zA-Z0-9_]{3,}/.test(normalized)) return true;
    if (/(https?:\/\/|www\.)/i.test(normalized)) return true;
    var appsPattern = /(whatsapp|واتس\s*اب|واتساب|تيليجرام|telegram|سناب\s*شات|snapchat|انستقرام|انستجرام|instagram|فيسبوك|facebook|تويتر|twitter)/i;
    if (appsPattern.test(normalized)) return true;
    var digitsOnly = normalized.replace(/[\s\-.()]/g, "");
    if (/\d{8,}/.test(digitsOnly)) return true;
    return false;
  }

  function sendMessage(data) {
    var messages = getMessages();
    var message = {
      id: "m_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9),
      listingId: data.listingId,
      fromEmail: data.fromEmail,
      toEmail: data.toEmail,
      body: data.body,
      createdAt: Date.now(),
      read: false,
    };
    messages.push(message);
    saveMessages(messages);
    syncMessageToSupabase(message);
    return message;
  }
  function getUnreadMessageCount(email) {
    if (!email) return 0;
    return getMessages().filter(function (m) {
      return m.toEmail === email && !m.read;
    }).length;
  }
  function markMessagesReadFor(email) {
    var messages = getMessages();
    var changed = false;
    messages.forEach(function (m) {
      if (m.toEmail === email && !m.read) {
        m.read = true;
        changed = true;
        if (m.sbId && typeof sbMarkMessageRead === "function") {
          sbMarkMessageRead(m.sbId).catch(function () {});
        }
      }
    });
    if (changed) saveMessages(messages);
    return changed;
  }

  /* ---------- طلب تقييم من المشترين عند اكتمال البيع ----------
     لا يوجد في الموقع سجل معاملة شراء رسمي (لا بوابة دفع)، فيُعرَّف "المشتري" عمليًا بأنه
     أي مستخدم تواصل مع البائع بخصوص هذا الإعلان عبر الرسائل. عند تحديد الإعلان كـ"تم البيع"
     (من صفحة "إعلاناتي" أو من لوحة تحكم الإدارة)، يصل إشعار لكل من راسل البائع بخصوصه
     يدعوه لتقييم تجربته معه؛ الضغط على الإشعار ينقله مباشرة لصفحة الإعلان حيث يوجد نموذج
     التقييم جاهزًا. */
  function getBuyerEmailsForListing(listing) {
    if (!listing) return [];
    var seen = {};
    var buyers = [];
    getMessages().forEach(function (m) {
      if (m.listingId !== listing.id) return;
      var otherEmail = m.fromEmail === listing.ownerEmail ? m.toEmail : m.fromEmail;
      if (!otherEmail || otherEmail === listing.ownerEmail || seen[otherEmail]) return;
      seen[otherEmail] = true;
      buyers.push(otherEmail);
    });
    return buyers;
  }
  function notifyBuyersToReviewSeller(listing) {
    if (!listing) return;
    getBuyerEmailsForListing(listing).forEach(function (buyerEmail) {
      pushNotificationOnce(
        buyerEmail,
        "review_seller_prompt",
        { listingId: listing.id, sellerEmail: listing.ownerEmail },
        "review_prompt_" + listing.id + "_" + buyerEmail
      );
    });
  }

  /* ---------- تنبيهات البحث المحفوظ (Saved Search Alerts) ----------
     يسمح للمستخدم بحفظ فلاتر بحثه الحالية (من الصفحة الرئيسية) باسم، ثم إشعاره تلقائيًا
     عند نشر إعلان جديد يطابق تلك الفلاتر. يُعاد استخدام نفس أسماء حقول الفلاتر المستخدمة في
     collectFilters/restoreFiltersFromUrl بالصفحة الرئيسية حتى يظل "تطبيق" البحث المحفوظ
     بسيطًا (رابط index.html مع نفس معاملات الرابط المحفوظة). */
  var SAVED_SEARCHES_KEY = "eqari_saved_searches";
  function getSavedSearches() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveSavedSearches(list) {
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(list));
  }
  function getSavedSearchesFor(email) {
    if (!email) return [];
    return getSavedSearches().filter(function (s) {
      return s.userEmail === email;
    });
  }
  function addSavedSearch(email, name, filters, queryString) {
    var list = getSavedSearches();
    var entry = {
      id: "ss_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9),
      userEmail: email,
      name: name,
      filters: filters || {},
      query: queryString || "",
      createdAt: Date.now(),
    };
    list.push(entry);
    saveSavedSearches(list);
    return entry;
  }
  function deleteSavedSearch(id) {
    var list = getSavedSearches().filter(function (s) {
      return s.id !== id;
    });
    saveSavedSearches(list);
  }
  /* مطابقة إعلان مع فلاتر بحث محفوظ — نسخة مستقلة عن منطق renderHomeListings بالصفحة الرئيسية
     (التي تعيد تعريف متغيراتها داخل closure الصفحة ولا يمكن استدعاؤها من هنا)، لكنها تطبّق
     المعايير الأساسية نفسها: الفئة، المدينة، نوع العرض، نطاق السعر، الكلمة المفتاحية، الغرف
     (سكني)، نوع الأرض/العقار التجاري، ونطاق السنة/الشركة/الموديل (مركبات). */
  function listingMatchesSavedFilters(listing, filters) {
    if (!listing || !filters) return false;
    if (filters.category && listing.category !== filters.category) return false;
    if (filters.city && listing.city !== filters.city) return false;
    if (filters.offerType && listing.offerType !== filters.offerType) return false;
    var price = Number(listing.price) || 0;
    if (filters.priceMin && price < Number(filters.priceMin)) return false;
    if (filters.priceMax && price > Number(filters.priceMax)) return false;
    if (filters.keyword) {
      var kw = String(filters.keyword).trim().toLowerCase();
      if (kw) {
        var haystack = (buildListingTitle(listing) + " " + (listing.description || "")).toLowerCase();
        if (haystack.indexOf(kw) === -1) return false;
      }
    }
    if (filters.rooms && listing.category === "residential") {
      var rooms = Number(listing.resRooms) || 0;
      if (rooms < Number(filters.rooms)) return false;
    }
    if (filters.landType && listing.category === "land" && listing.landType !== filters.landType) return false;
    if (filters.comType && listing.category === "commercial" && listing.comType !== filters.comType) return false;
    if (listing.category === "car" || listing.category === "motorcycle") {
      var year = Number(listing.category === "car" ? listing.carYear : listing.motoYear) || 0;
      if (filters.yearMin && year < Number(filters.yearMin)) return false;
      if (filters.yearMax && year > Number(filters.yearMax)) return false;
      if (filters.brand) {
        var brandVal = listing.category === "car" ? listing.carBrand : listing.motoBrand;
        if (brandVal !== filters.brand) return false;
      }
      if (filters.model) {
        var modelVal = listing.category === "car" ? listing.carModel : listing.motoModel;
        if (modelVal !== filters.model) return false;
      }
    }
    return true;
  }
  /* عند نشر إعلان جديد: إشعار كل من يملك بحثًا محفوظًا مطابقًا (باستثناء مالك الإعلان نفسه)،
     بإشعار واحد فقط لكل زوج (بحث محفوظ × إعلان) حتى لو أُعيد تحميل الصفحة عدة مرات. */
  function notifySavedSearchSubscribers(listing) {
    if (!listing) return;
    getSavedSearches().forEach(function (s) {
      if (s.userEmail === listing.ownerEmail) return;
      if (!listingMatchesSavedFilters(listing, s.filters)) return;
      pushNotificationOnce(
        s.userEmail,
        "saved_search_match",
        { listingId: listing.id, savedSearchName: s.name },
        "saved_search_" + s.id + "_" + listing.id
      );
    });
  }

  /* ---------- جلب كل رسائل المستخدم الحالي من Supabase ودمجها مع النسخة المحلية ---------- */
  function refreshMessagesFromSupabase() {
    if (typeof sbFetchMessagesFor !== "function") return;
    var session = getSession();
    var currentUserForSync = session ? findUser(session) : null;
    if (!currentUserForSync || !currentUserForSync.sbUserId) return;
    sbFetchMessagesFor(currentUserForSync.sbUserId)
      .then(function (result) {
        if (!result || !result.ok || !Array.isArray(result.rows)) return;
        var local = getMessages();
        var bySbId = {};
        local.forEach(function (m, i) {
          if (m.sbId) bySbId[m.sbId] = i;
        });
        var listings = getListings();
        var listingIdBySbId = {};
        listings.forEach(function (l) {
          if (l.sbId) listingIdBySbId[l.sbId] = l.id;
        });
        result.rows.forEach(function (row) {
          var existingIdx = bySbId[row.sbId];
          if (existingIdx !== undefined) {
            var localId = local[existingIdx].id;
            local[existingIdx] = Object.assign({}, local[existingIdx], row, {
              id: localId,
              listingId: local[existingIdx].listingId,
            });
          } else {
            var localListingId = listingIdBySbId[row.listingSbId];
            if (!localListingId) return; /* الإعلان المرتبط لم يُزامَن بعد محليًا */
            row.id = "sbm_" + row.sbId;
            row.listingId = localListingId;
            local.push(row);
          }
        });
        saveMessages(local);
        if (typeof window.__rerenderAdmin === "function") window.__rerenderAdmin();
        else if (typeof window.__rerenderPage === "function") window.__rerenderPage();
      })
      .catch(function () {});
  }

  /* ---------- محاكاة إرسال البريد الإلكتروني ----------
     لا يوجد في هذا المشروع (موقع ثابت HTML/CSS/JS) اتصال فعلي بخدمة بريد خارجية (مثل
     Resend أو SendGrid)، وهو ما يتطلب مفاتيح API خاصة بالمستخدم. بدلاً من ذلك، تُسجَّل كل
     رسالة بريد "مرسَلة" في سجلّ محلي (eqari_email_log) يمكن لمدير المنصة مراجعته من لوحة
     التحكم (قسم "سجل البريد الإلكتروني")، فيُحاكي تدفق الإشعارات بالبريد دون إرسال فعلي. */
  var EMAIL_LOG_KEY = "eqari_email_log";
  function getEmailLog() {
    try {
      return JSON.parse(localStorage.getItem(EMAIL_LOG_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveEmailLog(list) {
    localStorage.setItem(EMAIL_LOG_KEY, JSON.stringify(list));
  }
  function emailSubjectForType(type) {
    var key = "email.subject." + type;
    var text = t(key);
    return text === key ? t("email.subject.generic") : text;
  }
  function simulateSendEmail(toEmail, subject, body) {
    if (!toEmail) return null;
    var entry = {
      id: "em_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9),
      toEmail: toEmail,
      subject: subject || "",
      body: body || "",
      createdAt: Date.now(),
    };
    var list = getEmailLog();
    list.push(entry);
    /* سقف 500 رسالة بالسجلّ المحلي يكفي للعرض التجريبي ويمنع تضخّم localStorage بلا حدود */
    if (list.length > 500) list = list.slice(list.length - 500);
    saveEmailLog(list);
    return entry;
  }

  /* ---------- نظام الإشعارات العام ---------- */
  var NOTIFICATIONS_KEY = "eqari_notifications";
  function getNotifications() {
    try {
      return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveNotifications(list) {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list));
  }
  function pushNotificationOnce(toEmail, type, data, dedupeKey) {
    if (!toEmail) return null;
    var list = getNotifications();
    if (dedupeKey && list.some(function (n) { return n.dedupeKey === dedupeKey; })) return null;
    var notif = {
      id: "n_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9),
      toEmail: toEmail,
      type: type,
      data: data || {},
      dedupeKey: dedupeKey || null,
      createdAt: Date.now(),
      read: false,
    };
    list.push(notif);
    saveNotifications(list);
    /* كل إشعار داخل الموقع يُحاكي أيضًا إرسال بريد إلكتروني لصاحبه (انظر ملاحظة
       EMAIL_LOG_KEY أعلاه) — يُسجَّل في سجلّ البريد المحلي بنفس نص الإشعار. */
    simulateSendEmail(toEmail, emailSubjectForType(type), notificationText(notif));
    if (typeof sbCreateNotification === "function") {
      var notifUser = findUser(toEmail);
      if (notifUser && notifUser.sbUserId) {
        sbCreateNotification({
          user_id: notifUser.sbUserId,
          type: type,
          payload: data || {},
          dedupe_key: dedupeKey || null,
        })
          .then(function (result) {
            if (result && result.ok && result.row) {
              var current = getNotifications();
              var idx = current.findIndex(function (n) {
                return n.id === notif.id;
              });
              if (idx > -1) {
                current[idx].sbId = result.row.id;
                saveNotifications(current);
              }
            }
          })
          .catch(function () {});
      }
    }
    return notif;
  }
  function getNotificationsFor(email) {
    return getNotifications()
      .filter(function (n) { return n.toEmail === email; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }
  function getUnreadNotificationCount(email) {
    if (!email) return 0;
    return getNotifications().filter(function (n) { return n.toEmail === email && !n.read; }).length;
  }
  function markNotificationsReadFor(email) {
    var list = getNotifications();
    var changed = false;
    list.forEach(function (n) {
      if (n.toEmail === email && !n.read) {
        n.read = true;
        changed = true;
        if (n.sbId && typeof sbMarkNotificationRead === "function") {
          sbMarkNotificationRead(n.sbId).catch(function () {});
        }
      }
    });
    if (changed) saveNotifications(list);
    return changed;
  }
  /* ---------- جلب إشعارات المستخدم الحالي من Supabase ودمجها مع النسخة المحلية ---------- */
  function refreshNotificationsFromSupabase() {
    if (typeof sbFetchNotificationsFor !== "function") return;
    var session = getSession();
    var notifCurrentUser = session ? findUser(session) : null;
    if (!notifCurrentUser || !notifCurrentUser.sbUserId) return;
    sbFetchNotificationsFor(notifCurrentUser.sbUserId)
      .then(function (result) {
        if (!result || !result.ok || !Array.isArray(result.rows)) return;
        var local = getNotifications();
        var bySbId = {};
        local.forEach(function (n, i) {
          if (n.sbId) bySbId[n.sbId] = i;
        });
        var changed = false;
        result.rows.forEach(function (row) {
          var existingIdx = bySbId[row.sbId];
          if (existingIdx !== undefined) {
            if (row.read && !local[existingIdx].read) {
              local[existingIdx].read = true;
              changed = true;
            }
          } else {
            local.push({
              id: "nsb_" + row.sbId,
              sbId: row.sbId,
              toEmail: session,
              type: row.type,
              data: row.data,
              dedupeKey: row.dedupeKey,
              createdAt: row.createdAt,
              read: row.read,
            });
            changed = true;
          }
        });
        if (changed) {
          saveNotifications(local);
          if (typeof window.__rerenderPage === "function") window.__rerenderPage();
          if (typeof renderNotificationBell === "function") renderNotificationBell();
        }
      })
      .catch(function () {});
  }
  function notificationText(n) {
    if (n.type === "account_approved") return t("notif.accountApproved");
    if (n.type === "account_rejected") return t("notif.accountRejected") + (n.data && n.data.reason ? " " + n.data.reason : "");
    if (n.type === "subscription_expiring") return t("notif.subscriptionExpiring").replace("{days}", String(n.data && n.data.daysLeft));
    if (n.type === "review_seller_prompt") return t("notif.reviewSellerPrompt");
    if (n.type === "saved_search_match") return t("notif.savedSearchMatch").replace("{name}", (n.data && n.data.savedSearchName) || "");
    return "";
  }
  function checkSubscriptionExpiryNotifications(email) {
    var user = findUser(email);
    if (!user) return;
    if (getAccountStage(user) !== "active" || !user.subscriptionEndsAt) return;
    var daysLeft = Math.ceil((user.subscriptionEndsAt - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysLeft >= 0 && daysLeft <= 3) {
      pushNotificationOnce(email, "subscription_expiring", { daysLeft: daysLeft }, "sub_expiring_" + email + "_" + user.subscriptionEndsAt);
    }
  }

  /* ---------- المفضّلة (Favorites/Wishlist) ---------- */
  var FAVORITES_KEY = "eqari_favorites";
  function getFavoritesMap() {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveFavoritesMap(map) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(map));
  }
  /* محولات لعرض/تحرير المفضّلة كجدول صفوف عادي (بدل خريطة بريد<-قائمة) —
     تُستخدم فقط من أداة "إدارة قاعدة البيانات" الخام في لوحة التحكم. */
  function getFavoritesRows() {
    var map = getFavoritesMap();
    var rows = [];
    Object.keys(map).forEach(function (email) {
      (Array.isArray(map[email]) ? map[email] : []).forEach(function (listingId) {
        rows.push({ _rowId: email + "::" + listingId, userEmail: email, listingId: listingId });
      });
    });
    return rows;
  }
  function saveFavoritesRows(rows) {
    var map = {};
    rows.forEach(function (r) {
      if (!r || !r.userEmail || !r.listingId) return;
      if (!map[r.userEmail]) map[r.userEmail] = [];
      if (map[r.userEmail].indexOf(r.listingId) === -1) map[r.userEmail].push(r.listingId);
    });
    saveFavoritesMap(map);
  }
  function getFavoriteIds(email) {
    if (!email) return [];
    var map = getFavoritesMap();
    return Array.isArray(map[email]) ? map[email] : [];
  }
  function isFavorite(email, listingId) {
    return getFavoriteIds(email).indexOf(listingId) !== -1;
  }
  function toggleFavorite(email, listingId) {
    if (!email) return false;
    var map = getFavoritesMap();
    var list = Array.isArray(map[email]) ? map[email] : [];
    var idx = list.indexOf(listingId);
    var nowFavorite = idx === -1;
    if (nowFavorite) {
      list.push(listingId);
    } else {
      list.splice(idx, 1);
    }
    map[email] = list;
    saveFavoritesMap(map);
    if (typeof sbSetFavorite === "function") {
      var favUser = findUser(email);
      var favListing = getListingById(listingId);
      if (favUser && favUser.sbUserId && favListing && favListing.sbId) {
        sbSetFavorite(favUser.sbUserId, favListing.sbId, nowFavorite).catch(function () {});
      }
    }
    return nowFavorite;
  }
  /* ---------- جلب مفضّلة المستخدم الحالي من Supabase ودمجها مع النسخة المحلية ---------- */
  function refreshFavoritesFromSupabase() {
    if (typeof sbFetchFavoritesFor !== "function") return;
    var session = getSession();
    var favCurrentUser = session ? findUser(session) : null;
    if (!favCurrentUser || !favCurrentUser.sbUserId) return;
    sbFetchFavoritesFor(favCurrentUser.sbUserId)
      .then(function (result) {
        if (!result || !result.ok || !Array.isArray(result.listingSbIds)) return;
        var listings = getListings();
        var localIdBySbId = {};
        listings.forEach(function (l) {
          if (l.sbId) localIdBySbId[l.sbId] = l.id;
        });
        var map = getFavoritesMap();
        var list = Array.isArray(map[session]) ? map[session].slice() : [];
        var changed = false;
        result.listingSbIds.forEach(function (listingSbId) {
          var localId = localIdBySbId[listingSbId];
          if (localId && list.indexOf(localId) === -1) {
            list.push(localId);
            changed = true;
          }
        });
        if (changed) {
          map[session] = list;
          saveFavoritesMap(map);
          if (typeof window.__rerenderPage === "function") window.__rerenderPage();
        }
      })
      .catch(function () {});
  }

  /* ---------- تقييمات ومراجعات البائعين ---------- */
  var REVIEWS_KEY = "eqari_reviews";
  function getReviews() {
    try {
      return JSON.parse(localStorage.getItem(REVIEWS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveReviews(list) {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(list));
  }
  function getReviewsForSeller(sellerEmail) {
    return getReviews()
      .filter(function (r) { return r.sellerEmail === sellerEmail; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }
  function getSellerRatingSummary(sellerEmail) {
    var reviews = getReviewsForSeller(sellerEmail);
    if (!reviews.length) return { count: 0, average: 0 };
    var sum = reviews.reduce(function (acc, r) { return acc + (Number(r.rating) || 0); }, 0);
    return { count: reviews.length, average: sum / reviews.length };
  }
  function getReviewByReviewer(sellerEmail, reviewerEmail) {
    return getReviews().find(function (r) { return r.sellerEmail === sellerEmail && r.reviewerEmail === reviewerEmail; }) || null;
  }
  function submitSellerReview(sellerEmail, reviewerEmail, rating, comment) {
    var list = getReviews();
    var existing = list.find(function (r) { return r.sellerEmail === sellerEmail && r.reviewerEmail === reviewerEmail; });
    if (existing) {
      existing.rating = rating;
      existing.comment = comment || "";
      existing.updatedAt = Date.now();
    } else {
      list.push({
        id: "rv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9),
        sellerEmail: sellerEmail,
        reviewerEmail: reviewerEmail,
        rating: rating,
        comment: comment || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    saveReviews(list);
    if (typeof sbUpsertReview === "function") {
      var seller = findUser(sellerEmail);
      var reviewer = findUser(reviewerEmail);
      if (seller && seller.sbUserId && reviewer && reviewer.sbUserId) {
        sbUpsertReview(seller.sbUserId, reviewer.sbUserId, rating, comment || "")
          .then(function (result) {
            if (result && result.ok && result.row) {
              var current = getReviews();
              var idx = current.findIndex(function (r) {
                return r.sellerEmail === sellerEmail && r.reviewerEmail === reviewerEmail;
              });
              if (idx > -1) {
                current[idx].sbId = result.row.id;
                saveReviews(current);
              }
            }
          })
          .catch(function () {});
      }
    }
  }
  /* ---------- جلب كل تقييمات بائع معيّن من Supabase ودمجها مع النسخة المحلية ---------- */
  function refreshReviewsFromSupabase(sellerEmail, onDone) {
    if (typeof sbFetchReviewsForSeller !== "function") return;
    var seller = findUser(sellerEmail);
    if (!seller || !seller.sbUserId) return;
    sbFetchReviewsForSeller(seller.sbUserId)
      .then(function (result) {
        if (!result || !result.ok || !Array.isArray(result.rows)) return;
        var local = getReviews();
        var changed = false;
        result.rows.forEach(function (row) {
          if (!row.reviewerEmail) return;
          var idx = local.findIndex(function (r) {
            return r.sellerEmail === sellerEmail && r.reviewerEmail === row.reviewerEmail;
          });
          if (idx > -1) {
            local[idx] = Object.assign({}, local[idx], {
              sbId: row.sbId,
              rating: row.rating,
              comment: row.comment,
            });
          } else {
            local.push({
              id: "rvsb_" + row.sbId,
              sbId: row.sbId,
              sellerEmail: sellerEmail,
              reviewerEmail: row.reviewerEmail,
              rating: row.rating,
              comment: row.comment,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            });
          }
          changed = true;
        });
        if (changed) {
          saveReviews(local);
          if (typeof onDone === "function") onDone();
        }
      })
      .catch(function () {});
  }

  function getThreadsForUser(email) {
    var msgs = getMessages().filter(function (m) {
      return m.fromEmail === email || m.toEmail === email;
    });
    var map = {};
    msgs.forEach(function (m) {
      var other = m.fromEmail === email ? m.toEmail : m.fromEmail;
      var key = m.listingId + "|" + other;
      if (!map[key]) map[key] = { listingId: m.listingId, other: other, messages: [] };
      map[key].messages.push(m);
    });
    return Object.keys(map)
      .map(function (k) {
        var thread = map[k];
        thread.messages.sort(function (a, b) {
          return a.createdAt - b.createdAt;
        });
        thread.lastMessage = thread.messages[thread.messages.length - 1];
        return thread;
      })
      .sort(function (a, b) {
        return b.lastMessage.createdAt - a.lastMessage.createdAt;
      });
  }

  /* ================= طبقة بيانات لوحة تحكم الإدارة (Admin) ================= */

  /* ---------- الأدوار والصلاحيات ---------- */
  var ADMIN_ROLES = {
    super_admin: {
      labelKey: "adminRole.super_admin",
      sections: [
        "dashboard", "users", "cars", "properties", "listings", "payments",
        "subscriptions", "reports", "content", "settings", "adminUsers", "auditLogs", "emailLog",
      ],
    },
    admin: {
      labelKey: "adminRole.admin",
      sections: ["dashboard", "users", "cars", "properties", "listings", "reports"],
    },
    moderator: {
      labelKey: "adminRole.moderator",
      sections: ["dashboard", "listings", "cars", "properties", "reports"],
    },
    support: {
      labelKey: "adminRole.support",
      sections: ["dashboard", "users", "reports"],
    },
    finance_admin: {
      labelKey: "adminRole.finance_admin",
      sections: ["dashboard", "payments", "subscriptions"],
    },
    content_admin: {
      labelKey: "adminRole.content_admin",
      sections: ["dashboard", "content", "settings"],
    },
  };
  var ADMIN_SECTION_ORDER = [
    "dashboard", "users", "cars", "properties", "categories", "listings", "payments",
    "subscriptions", "reports", "content", "settings", "adminUsers", "auditLogs", "emailLog", "database",
  ];
  var ADMIN_NAV_ICONS = {
    dashboard: "🏠",
    users: "👥",
    cars: "🚗",
    properties: "🏢",
    categories: "🗂️",
    listings: "📋",
    payments: "💳",
    subscriptions: "🔁",
    reports: "🚩",
    content: "📝",
    settings: "⚙️",
    adminUsers: "🛡️",
    auditLogs: "🧾",
    emailLog: "✉️",
    database: "🗄️",
  };
  // الصلاحيات القابلة للمنح من لوحة "مستخدمو الإدارة": تُستثنى "dashboard" (تُمنح تلقائيًا
  // لأي مدير) و"adminUsers" (لا يمنحها إلا المدير العام لنفسه — لا يمكن تفويضها لغيره)
  // و"database" (الوصول الخام لكل بيانات المنصة — للمدير العام حصريًا، غير قابل للتفويض
  // لموظفي الإدارة مهما كانت صلاحياتهم الأخرى، لتفادي أي تعديل غير مقصود على حسابات
  // وبيانات حسّاسة عبر هذه الأداة القوية).
  var GRANTABLE_SECTIONS = ADMIN_SECTION_ORDER.filter(function (sec) {
    return sec !== "dashboard" && sec !== "adminUsers" && sec !== "database";
  });
  function isAdminRole(role) {
    return !!role && !!ADMIN_ROLES[role];
  }
  function getAdminUsersList() {
    return getUsers().filter(function (u) {
      return isAdminRole(u.role);
    });
  }
  function superAdminExists(excludeEmail) {
    return getAdminUsersList().some(function (u) {
      return u.role === "super_admin" && u.email !== excludeEmail;
    });
  }
  function roleAllowsSection(role, section) {
    return !!(ADMIN_ROLES[role] && ADMIN_ROLES[role].sections.indexOf(section) !== -1);
  }
  function getUserSections(user) {
    if (!user) return [];
    if (user.role === "super_admin") return ADMIN_SECTION_ORDER.slice();
    if (Array.isArray(user.customSections)) return user.customSections.slice();
    return ADMIN_ROLES[user.role] ? ADMIN_ROLES[user.role].sections.slice() : [];
  }
  function userAllowsSection(user, section) {
    return getUserSections(user).indexOf(section) !== -1;
  }

  /* ---------- سجل العمليات (Audit Log) ---------- */
  var AUDIT_LOG_KEY = "eqari_audit_log";
  function getAuditLog() {
    try {
      return JSON.parse(localStorage.getItem(AUDIT_LOG_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function logAuditEvent(action, target, details, actorOverride) {
    var log = getAuditLog();
    log.push({
      id: "a_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      actorEmail: actorOverride || getSession() || "—",
      action: action,
      target: target || "",
      details: details || "",
      createdAt: Date.now(),
    });
    // نحتفظ بآخر 500 سجل فقط لتجنّب تضخم التخزين المحلي
    if (log.length > 500) log = log.slice(log.length - 500);
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
  }
  function saveAuditLog(list) {
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(list));
  }

  /* ---------- البلاغات والشكاوى ---------- */
  var REPORTS_KEY = "eqari_reports";
  function getReports() {
    try {
      return JSON.parse(localStorage.getItem(REPORTS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveReports(reports) {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  }
  function addReport(data) {
    var reports = getReports();
    var report = {
      id: "r_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      listingId: data.listingId,
      reporterEmail: data.reporterEmail,
      reason: data.reason,
      details: data.details || "",
      status: "open",
      createdAt: Date.now(),
    };
    reports.push(report);
    saveReports(reports);
    if (typeof sbCreateReport === "function") {
      var reportListing = getListingById(data.listingId);
      var reporter = findUser(data.reporterEmail);
      if (reportListing && reportListing.sbId) {
        sbCreateReport({
          listing_id: reportListing.sbId,
          reporter_id: reporter && reporter.sbUserId ? reporter.sbUserId : null,
          reason: data.reason,
          details: data.details || "",
        })
          .then(function (result) {
            if (result && result.ok && result.row) {
              var current = getReports();
              var idx = current.findIndex(function (r) {
                return r.id === report.id;
              });
              if (idx > -1) {
                current[idx].sbId = result.row.id;
                saveReports(current);
              }
            }
          })
          .catch(function () {});
      }
    }
    return report;
  }
  function updateReport(id, patch) {
    var reports = getReports();
    var idx = reports.findIndex(function (r) {
      return r.id === id;
    });
    if (idx === -1) return null;
    reports[idx] = Object.assign({}, reports[idx], patch);
    saveReports(reports);
    if (patch && patch.status && reports[idx].sbId && typeof sbUpdateReportStatus === "function") {
      sbUpdateReportStatus(reports[idx].sbId, patch.status).catch(function () {});
    }
    return reports[idx];
  }
  /* ---------- جلب كل البلاغات من Supabase ودمجها مع النسخة المحلية (تُستخدم من لوحة تحكم الإدارة) ---------- */
  function refreshReportsFromSupabase() {
    if (typeof sbFetchReports !== "function") return;
    sbFetchReports()
      .then(function (result) {
        if (!result || !result.ok || !Array.isArray(result.rows)) return;
        var local = getReports();
        var bySbId = {};
        local.forEach(function (r, i) {
          if (r.sbId) bySbId[r.sbId] = i;
        });
        var listings = getListings();
        var localListingIdBySbId = {};
        listings.forEach(function (l) {
          if (l.sbId) localListingIdBySbId[l.sbId] = l.id;
        });
        var changed = false;
        result.rows.forEach(function (row) {
          var existingIdx = bySbId[row.sbId];
          if (existingIdx !== undefined) {
            local[existingIdx] = Object.assign({}, local[existingIdx], {
              status: row.status,
              reason: row.reason,
              details: row.details,
            });
            changed = true;
          } else {
            var localListingId = localListingIdBySbId[row.listingSbId];
            if (!localListingId) return;
            local.push({
              id: "rpsb_" + row.sbId,
              sbId: row.sbId,
              listingId: localListingId,
              reporterEmail: row.reporterEmail,
              reason: row.reason,
              details: row.details,
              status: row.status,
              createdAt: row.createdAt,
            });
            changed = true;
          }
        });
        if (changed) {
          saveReports(local);
          if (typeof window.__rerenderAdmin === "function") window.__rerenderAdmin();
        }
      })
      .catch(function () {});
  }

  /* ---------- الكوبونات والعروض ---------- */
  var COUPONS_KEY = "eqari_coupons";
  function getCoupons() {
    try {
      return JSON.parse(localStorage.getItem(COUPONS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveCoupons(coupons) {
    localStorage.setItem(COUPONS_KEY, JSON.stringify(coupons));
  }
  function addCoupon(data) {
    var coupons = getCoupons();
    var coupon = {
      id: "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      code: data.code,
      discountPercent: data.discountPercent,
      active: true,
      createdAt: Date.now(),
    };
    coupons.push(coupon);
    saveCoupons(coupons);
    return coupon;
  }
  function deleteCoupon(id) {
    saveCoupons(
      getCoupons().filter(function (c) {
        return c.id !== id;
      })
    );
  }

  /* ---------- محتوى الصفحة الرئيسية القابل للتعديل (Content Admin) ---------- */
  var CONTENT_KEY = "eqari_site_content";
  function getSiteContentOverrides() {
    try {
      return JSON.parse(localStorage.getItem(CONTENT_KEY)) || { ar: {}, en: {} };
    } catch (e) {
      return { ar: {}, en: {} };
    }
  }
  function saveSiteContentOverride(lang, key, value) {
    var data = getSiteContentOverrides();
    if (!data[lang]) data[lang] = {};
    if (value === "") {
      delete data[lang][key];
    } else {
      data[lang][key] = value;
    }
    localStorage.setItem(CONTENT_KEY, JSON.stringify(data));
  }
  var EDITABLE_CONTENT_KEYS = [
    "hero.eyebrow", "hero.title", "hero.subtitle",
    "promo.heading", "promo.sub",
    "footer.about",
    "maintenance.customMessage",
  ];

  /* ---------- إعدادات المنصة العامة (Settings) ---------- */
  var SETTINGS_KEY = "eqari_site_settings";
  var DEFAULT_SETTINGS = {
    minAge: 18,
    maintenanceMode: false,
    monthlyPrice: 20000,
    yearlyPrice: 199000,
    subDiscountPercent: 0,
    subDiscountStart: "",
    subDiscountEnd: "",
  };
  function getSiteSettings() {
    try {
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }
  function saveSiteSettings(patch) {
    var current = getSiteSettings();
    var updated = Object.assign({}, current, patch);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  }

  /* ---------- تسعير الاشتراكات والخصومات المحدّدة بتاريخ ---------- */
  function getSubscriptionPricing() {
    var s = getSiteSettings();
    var monthlyBase = Number(s.monthlyPrice) || 0;
    var yearlyBase = Number(s.yearlyPrice) || 0;
    var percent = Number(s.subDiscountPercent) || 0;
    var todayStr = new Date().toISOString().slice(0, 10);
    var discountActive =
      percent > 0 &&
      !!s.subDiscountStart &&
      !!s.subDiscountEnd &&
      todayStr >= s.subDiscountStart &&
      todayStr <= s.subDiscountEnd;
    var monthlyEffective = discountActive ? Math.round(monthlyBase * (1 - percent / 100)) : monthlyBase;
    var yearlyEffective = discountActive ? Math.round(yearlyBase * (1 - percent / 100)) : yearlyBase;
    return {
      monthlyBase: monthlyBase,
      yearlyBase: yearlyBase,
      monthlyEffective: monthlyEffective,
      yearlyEffective: yearlyEffective,
      discountActive: discountActive,
      discountPercent: percent,
      discountStart: s.subDiscountStart || "",
      discountEnd: s.subDiscountEnd || "",
    };
  }
  function formatSubPrice(amount) {
    return Number(amount || 0).toLocaleString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US") + " " + t("plan.currency");
  }
  function renderPlanPricing() {
    var monthlyEl = document.getElementById("monthlyPlanPrice");
    var yearlyEl = document.getElementById("yearlyPlanPrice");
    if (!monthlyEl && !yearlyEl) return;
    var pricing = getSubscriptionPricing();
    var currency = t("plan.currency");

    if (monthlyEl) monthlyEl.innerHTML = formatSubPrice(pricing.monthlyEffective).replace(currency, '<span class="plan-currency-unit">' + currency + "</span>");
    if (yearlyEl) yearlyEl.innerHTML = formatSubPrice(pricing.yearlyEffective).replace(currency, '<span class="plan-currency-unit">' + currency + "</span>");

    var yearlyTotal = pricing.monthlyEffective * 12;
    var savings = yearlyTotal - pricing.yearlyEffective;
    var badgePercent = yearlyTotal > 0 ? Math.round((savings / yearlyTotal) * 100) : 0;

    var yearlyBadgeEl = document.querySelector('.plan-option[data-plan="yearly"] .plan-badge:not(.plan-discount-badge)');
    if (yearlyBadgeEl) yearlyBadgeEl.textContent = t("plan.yearly.badgeDynamic").replace("{percent}", badgePercent);
    var savingsEl = document.getElementById("yearlyPlanSavings");
    if (savingsEl) savingsEl.textContent = t("plan.yearly.savingsDynamic").replace("{amount}", formatSubPrice(savings));
    var compareNoteEl = document.getElementById("yearlyPlanCompareNote");
    if (compareNoteEl) {
      compareNoteEl.textContent = t("plan.yearly.compareNoteDynamic")
        .replace("{total}", formatSubPrice(yearlyTotal))
        .replace("{monthly}", formatSubPrice(pricing.monthlyEffective));
    }

    var monthlyDiscountBadge = document.getElementById("monthlyDiscountBadge");
    var yearlyDiscountBadge = document.getElementById("yearlyDiscountBadge");
    [monthlyDiscountBadge, yearlyDiscountBadge].forEach(function (badge) {
      if (!badge) return;
      if (pricing.discountActive) {
        var dateStr = new Date(pricing.discountEnd).toLocaleDateString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US");
        badge.textContent = t("plan.discountBadge").replace("{percent}", pricing.discountPercent).replace("{date}", dateStr);
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    });
  }

  /* ---------- عرض بيانات الإعلان (عنوان، موقع، سعر، مواصفات) ---------- */
  function readSingleFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function readFilesAsDataURLs(fileList) {
    var files = Array.prototype.slice.call(fileList);
    return Promise.all(files.map(readSingleFileAsDataURL));
  }
  /* ---------- رفع الصور إلى Supabase Storage (رابط عام حقيقي بدل Base64 في التخزين المحلي) ----------
     إن لم تتوفر sbUploadFile (تعذّر تحميل مكتبة Supabase، أو لا اتصال)، أو فشل رفع ملف بعينه،
     يُستخدم Base64 كخطة بديلة لذلك الملف فقط — تمامًا بنفس فلسفة باقي عمليات المزامنة في الموقع:
     لا يتعطل نشر الإعلان أو إنشاء الحساب أبدًا بسبب Supabase، فقط تُفقد ميزة "رابط حقيقي خفيف" له. */
  /* تصغير الصور وضغطها قبل الرفع: صور الهاتف الأصلية (3–12 ميغابايت) تُحوَّل إلى JPEG بأبعاد معقولة
     (أقصى بُعد maxDim). هذا يسرّع الرفع، ويبقي الصورة ضمن حدّ الحاوية (10MB)، ويمنع تجاوز حصة
     التخزين المحلي عند الرجوع لـ Base64. إن تعذّر التصغير (صيغة غير مدعومة مثل HEIC) نرفع الأصل كما هو. */
  function downscaleImage(file, maxDim) {
    return new Promise(function (resolve) {
      try {
        if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || "")) return resolve(file);
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          if (scale === 1 && file.size <= 800 * 1024) return resolve(file);
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            function (blob) {
              if (!blob || (scale === 1 && blob.size >= file.size)) return resolve(file);
              var name = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
              try { resolve(new File([blob], name, { type: "image/jpeg" })); } catch (e) { resolve(file); }
            },
            "image/jpeg",
            0.85
          );
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      } catch (e) {
        resolve(file);
      }
    });
  }
  function uploadFilesOrFallback(fileList, bucket, pathPrefix) {
    var files = Array.prototype.slice.call(fileList);
    var maxDim = bucket === "profile-photos" ? 800 : 1600;
    return Promise.all(files.map(function (f) { return downscaleImage(f, maxDim); })).then(function (resized) {
      if (typeof sbUploadFile !== "function") {
        return Promise.all(resized.map(readSingleFileAsDataURL));
      }
      return Promise.all(
        resized.map(function (file, idx) {
          var ext = "";
          var dot = file.name ? file.name.lastIndexOf(".") : -1;
          if (dot > -1) ext = file.name.slice(dot);
          var path =
            pathPrefix + "/" + Date.now().toString(36) + "_" + idx + "_" + Math.random().toString(36).slice(2, 8) + ext;
          return sbUploadFile(bucket, path, file)
            .then(function (result) {
              if (result && result.ok && result.url) return result.url;
              return readSingleFileAsDataURL(file);
            })
            .catch(function () {
              return readSingleFileAsDataURL(file);
            });
        })
      );
    });
  }
  /* ============================================================
     فئات الإعلانات (أنواع المنتجات) — الفئات الخمس الأساسية (أرض/سكني/تجاري/سيارة/دراجة)
     تبقى كما هي تمامًا في الكود (بلا أي تغيير في سلوكها أو حقولها القائمة)، بينما يمكن
     للمدير العام إضافة فئات جديدة بالكامل من لوحة التحكم — اسم (عربي/إنجليزي)، أيقونة،
     مجموعة (عقارات/مركبات)، وحقول مخصّصة (نص/رقم/قائمة اختيار/سنة) — تُخزَّن هنا وتُستخدم
     تلقائيًا في كل مكان: نموذج نشر الإعلان، تبويبات البحث، شبكات الصفحة الرئيسية،
     صفحة تفاصيل الإعلان، ولوحة التحكم — دون أي حاجة لتعديل الكود لاحقًا.
     ============================================================ */
  var CUSTOM_CATEGORIES_KEY = "eqari_custom_categories";
  var BUILTIN_CATEGORY_IDS = ["land", "residential", "commercial", "car", "motorcycle"];
  var BUILTIN_CATEGORY_GROUPS = {
    land: "realestate", residential: "realestate", commercial: "realestate",
    car: "vehicles", motorcycle: "vehicles",
  };
  var CUSTOM_FIELD_TYPES = ["text", "number", "select", "year"];

  function getCustomCategories() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveCustomCategories(list) {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(list));
  }
  function findCustomCategory(id) {
    return getCustomCategories().find(function (c) { return c.id === id; }) || null;
  }
  function isBuiltinCategory(id) {
    return BUILTIN_CATEGORY_IDS.indexOf(id) !== -1;
  }
  function isCustomCategory(id) {
    return !isBuiltinCategory(id) && !!findCustomCategory(id);
  }
  /* قائمة موحّدة لكل الفئات (الأساسية + المخصّصة) — تُستخدم في لوحة إدارة الفئات وفي
     أي مكان يحتاج تعداد كل الفئات المتاحة على المنصة */
  function getAllCategories() {
    var builtins = BUILTIN_CATEGORY_IDS.map(function (id) {
      return {
        id: id,
        nameAr: I18N.ar["listingPage.cat." + id] || id,
        nameEn: I18N.en["listingPage.cat." + id] || id,
        icon: { land: "▦", residential: "⌂", commercial: "🏢", car: "🚗", motorcycle: "🏍" }[id] || "•",
        group: BUILTIN_CATEGORY_GROUPS[id],
        builtin: true,
        fields: [],
      };
    });
    return builtins.concat(getCustomCategories());
  }
  function slugify(str) {
    return String(str || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, "-")
      .replace(/(^-+|-+$)/g, "");
  }
  function genCategoryId(nameEn, nameAr) {
    var base = slugify(nameEn) || slugify(nameAr) || "category";
    var id = base;
    var i = 1;
    while (isBuiltinCategory(id) || findCustomCategory(id)) {
      id = base + "-" + i;
      i++;
    }
    return id;
  }
  function genFieldKey(labelEn, labelAr, existingKeys) {
    var base = "f_" + (slugify(labelEn) || slugify(labelAr) || "field").replace(/-/g, "_");
    var key = base;
    var i = 1;
    while (existingKeys.indexOf(key) !== -1) {
      key = base + "_" + i;
      i++;
    }
    return key;
  }
  function getCategoryLabel(cat) {
    if (isBuiltinCategory(cat)) return t("listingPage.cat." + cat);
    var custom = findCustomCategory(cat);
    if (custom) return currentLang === "ar" ? custom.nameAr : custom.nameEn;
    return cat || "";
  }
  function getCategoryGroup(cat) {
    if (BUILTIN_CATEGORY_GROUPS[cat]) return BUILTIN_CATEGORY_GROUPS[cat];
    var custom = findCustomCategory(cat);
    return custom ? custom.group : "realestate";
  }
  function fieldTypeLabel(type) {
    return t("admin.categories.fieldType." + type);
  }
  /* ---------- تنسيق الأرقام بفواصل الآلاف لسهولة القراءة والكتابة ---------- */
  function stripSeparators(str) {
    return String(str || "").replace(/[^\d]/g, "");
  }
  function formatNumberWithSeparators(digitsStr) {
    var clean = stripSeparators(digitsStr);
    if (!clean) return "";
    var sep = currentLang === "ar" ? "٬" : ",";
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }
  function attachThousandsFormatting(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener("input", function () {
      var cursorFromEnd = inputEl.value.length - inputEl.selectionStart;
      var clean = stripSeparators(inputEl.value);
      inputEl.value = formatNumberWithSeparators(clean);
      var newPos = Math.max(0, inputEl.value.length - cursorFromEnd);
      inputEl.setSelectionRange(newPos, newPos);
    });
  }
  function formatPrice(listing) {
    var n = Number(listing.price) || 0;
    var formatted = n.toLocaleString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US");
    var text = formatted + " " + t("plan.currency");
    if (listing.offerType === "rent") {
      text += " / " + t("plan.perMonth");
    }
    return text;
  }
  /* ---------- قوائم شركات وموديلات السيارات والدراجات النارية (ثنائية اللغة) ---------- */
  var CAR_DATA = {
    toyota: { label: { ar: "تويوتا", en: "Toyota" }, models: {
      camry: { ar: "كامري", en: "Camry" }, corolla: { ar: "كورولا", en: "Corolla" },
      landcruiser: { ar: "لاندكروزر", en: "Land Cruiser" }, hilux: { ar: "هايلكس", en: "Hilux" },
      rav4: { ar: "راف 4", en: "RAV4" }, yaris: { ar: "يارس", en: "Yaris" },
      prado: { ar: "برادو", en: "Prado" }, avalon: { ar: "أفالون", en: "Avalon" }, avanza: { ar: "أفانزا", en: "Avanza" },
    } },
    hyundai: { label: { ar: "هيونداي", en: "Hyundai" }, models: {
      sonata: { ar: "سوناتا", en: "Sonata" }, elantra: { ar: "إلنترا", en: "Elantra" },
      tucson: { ar: "توسان", en: "Tucson" }, accent: { ar: "أكسنت", en: "Accent" },
      santafe: { ar: "سانتافي", en: "Santa Fe" }, creta: { ar: "كريتا", en: "Creta" }, azera: { ar: "أزيرا", en: "Azera" },
    } },
    mercedes: { label: { ar: "مرسيدس", en: "Mercedes-Benz" }, models: {
      c200: { ar: "C200", en: "C200" }, e200: { ar: "E200", en: "E200" }, s500: { ar: "S500", en: "S500" },
      glc: { ar: "GLC", en: "GLC" }, gle: { ar: "GLE", en: "GLE" }, gla: { ar: "GLA", en: "GLA" }, gls: { ar: "GLS", en: "GLS" },
    } },
    nissan: { label: { ar: "نيسان", en: "Nissan" }, models: {
      altima: { ar: "التيما", en: "Altima" }, sunny: { ar: "صني", en: "Sunny" },
      patrol: { ar: "باترول", en: "Patrol" }, xtrail: { ar: "إكس تريل", en: "X-Trail" },
      sentra: { ar: "صنترا", en: "Sentra" }, qashqai: { ar: "قشقاي", en: "Qashqai" }, navara: { ar: "نافارا", en: "Navara" },
    } },
    kia: { label: { ar: "كيا", en: "Kia" }, models: {
      cerato: { ar: "سيراتو", en: "Cerato" }, sportage: { ar: "سبورتاج", en: "Sportage" },
      optima: { ar: "أوبتيما", en: "Optima" }, sorento: { ar: "سورينتو", en: "Sorento" },
      picanto: { ar: "بيكانتو", en: "Picanto" }, rio: { ar: "ريو", en: "Rio" },
    } },
    ford: { label: { ar: "فورد", en: "Ford" }, models: {
      f150: { ar: "F150", en: "F150" }, explorer: { ar: "إكسبلورر", en: "Explorer" },
      fusion: { ar: "فيوجن", en: "Fusion" }, edge: { ar: "إيدج", en: "Edge" },
      ranger: { ar: "رينجر", en: "Ranger" }, ecosport: { ar: "إيكوسبورت", en: "EcoSport" },
    } },
    chevrolet: { label: { ar: "شيفروليه", en: "Chevrolet" }, models: {
      caprice: { ar: "كابرس", en: "Caprice" }, tahoe: { ar: "تاهو", en: "Tahoe" },
      malibu: { ar: "ماليبو", en: "Malibu" }, silverado: { ar: "سيلفرادو", en: "Silverado" },
      aveo: { ar: "أفيو", en: "Aveo" }, cruze: { ar: "كروز", en: "Cruze" },
    } },
    lexus: { label: { ar: "لكزس", en: "Lexus" }, models: {
      es: { ar: "ES", en: "ES" }, rx: { ar: "RX", en: "RX" }, lx: { ar: "LX", en: "LX" }, gx: { ar: "GX", en: "GX" }, nx: { ar: "NX", en: "NX" },
    } },
    bmw: { label: { ar: "بي إم دبليو", en: "BMW" }, models: {
      series3: { ar: "الفئة 3", en: "3 Series" }, series5: { ar: "الفئة 5", en: "5 Series" },
      x5: { ar: "X5", en: "X5" }, x3: { ar: "X3", en: "X3" }, x6: { ar: "X6", en: "X6" },
    } },
    honda: { label: { ar: "هوندا", en: "Honda" }, models: {
      accord: { ar: "أكورد", en: "Accord" }, civic: { ar: "سيفيك", en: "Civic" },
      crv: { ar: "CR-V", en: "CR-V" }, pilot: { ar: "بايلوت", en: "Pilot" }, hrv: { ar: "HR-V", en: "HR-V" },
    } },
    mazda: { label: { ar: "مازدا", en: "Mazda" }, models: {
      mazda3: { ar: "مازدا 3", en: "Mazda 3" }, mazda6: { ar: "مازدا 6", en: "Mazda 6" },
      cx5: { ar: "CX-5", en: "CX-5" }, cx9: { ar: "CX-9", en: "CX-9" },
    } },
    mitsubishi: { label: { ar: "ميتسوبيشي", en: "Mitsubishi" }, models: {
      pajero: { ar: "باجيرو", en: "Pajero" }, lancer: { ar: "لانسر", en: "Lancer" },
      outlander: { ar: "أوتلاندر", en: "Outlander" }, l200: { ar: "L200", en: "L200" },
    } },
    suzukiCar: { label: { ar: "سوزوكي", en: "Suzuki" }, models: {
      swift: { ar: "سويفت", en: "Swift" }, vitara: { ar: "فيتارا", en: "Vitara" },
      alto: { ar: "ألتو", en: "Alto" }, ciaz: { ar: "سياز", en: "Ciaz" },
    } },
    geely: { label: { ar: "جيلي", en: "Geely" }, models: {
      emgrand: { ar: "إمجراند", en: "Emgrand" }, coolray: { ar: "كولراي", en: "Coolray" }, azkarra: { ar: "أزكارا", en: "Azkarra" },
    } },
    mg: { label: { ar: "إم جي", en: "MG" }, models: {
      mg5: { ar: "MG5", en: "MG5" }, mgzs: { ar: "MG ZS", en: "MG ZS" }, mgrx5: { ar: "MG RX5", en: "MG RX5" }, mghs: { ar: "MG HS", en: "MG HS" },
    } },
    haval: { label: { ar: "هافال", en: "Haval" }, models: {
      h6: { ar: "H6", en: "H6" }, jolion: { ar: "جوليون", en: "Jolion" }, h2: { ar: "H2", en: "H2" },
    } },
    byd: { label: { ar: "بي واي دي", en: "BYD" }, models: {
      f3: { ar: "F3", en: "F3" }, song: { ar: "سونج", en: "Song" }, tang: { ar: "تانج", en: "Tang" },
    } },
    peugeot: { label: { ar: "بيجو", en: "Peugeot" }, models: {
      p308: { ar: "308", en: "308" }, p3008: { ar: "3008", en: "3008" }, p5008: { ar: "5008", en: "5008" }, p206: { ar: "206", en: "206" },
    } },
    volkswagen: { label: { ar: "فولكس واجن", en: "Volkswagen" }, models: {
      passat: { ar: "باسات", en: "Passat" }, tiguan: { ar: "تيجوان", en: "Tiguan" },
      golf: { ar: "جولف", en: "Golf" }, jetta: { ar: "جيتا", en: "Jetta" },
    } },
  };
  var MOTO_DATA = {
    hondaMoto: { label: { ar: "هوندا", en: "Honda" }, models: {
      cb150: { ar: "CB150", en: "CB150" }, cbr500: { ar: "CBR500", en: "CBR500" },
      africatwin: { ar: "أفريكا توين", en: "Africa Twin" }, pcx: { ar: "PCX", en: "PCX" }, cg125: { ar: "CG125", en: "CG125" },
    } },
    yamaha: { label: { ar: "ياماها", en: "Yamaha" }, models: {
      ybr125: { ar: "YBR125", en: "YBR125" }, r15: { ar: "R15", en: "R15" },
      mt07: { ar: "MT-07", en: "MT-07" }, nmax: { ar: "NMAX", en: "NMAX" }, crypton: { ar: "Crypton", en: "Crypton" },
    } },
    kawasaki: { label: { ar: "كاواساكي", en: "Kawasaki" }, models: {
      ninja400: { ar: "Ninja 400", en: "Ninja 400" }, z900: { ar: "Z900", en: "Z900" }, versys: { ar: "Versys", en: "Versys" },
    } },
    suzukiMoto: { label: { ar: "سوزوكي", en: "Suzuki" }, models: {
      gsxr: { ar: "GSX-R", en: "GSX-R" }, gn125: { ar: "GN125", en: "GN125" },
      vstrom: { ar: "V-Strom", en: "V-Strom" }, en125: { ar: "EN125", en: "EN125" },
    } },
    bajaj: { label: { ar: "باجاج", en: "Bajaj" }, models: {
      pulsar150: { ar: "بولسار 150", en: "Pulsar 150" }, pulsar200: { ar: "بولسار 200", en: "Pulsar 200" },
      discover: { ar: "ديسكفر", en: "Discover" }, platina: { ar: "بلاتينا", en: "Platina" },
    } },
    tvs: { label: { ar: "TVS", en: "TVS" }, models: {
      apache: { ar: "أباتشي", en: "Apache" }, starcity: { ar: "ستار سيتي", en: "Star City" }, xl100: { ar: "XL100", en: "XL100" },
    } },
    lifan: { label: { ar: "لِفان", en: "Lifan" }, models: {
      lf150: { ar: "LF150", en: "LF150" }, lf200: { ar: "LF200", en: "LF200" }, kpr: { ar: "KPR", en: "KPR" },
    } },
    zongshen: { label: { ar: "زونغشن", en: "Zongshen" }, models: {
      zs150: { ar: "ZS150", en: "ZS150" }, zs200: { ar: "ZS200", en: "ZS200" },
    } },
    loncin: { label: { ar: "لونشين", en: "Loncin" }, models: {
      lx150: { ar: "LX150", en: "LX150" }, lx200: { ar: "LX200", en: "LX200" },
    } },
    sym: { label: { ar: "سيم (SYM)", en: "SYM" }, models: {
      wolf125: { ar: "Wolf 125", en: "Wolf 125" }, jet14: { ar: "Jet 14", en: "Jet 14" },
    } },
    cfmoto: { label: { ar: "سي إف موتو", en: "CFMoto" }, models: {
      cf150: { ar: "CF150", en: "CF150" }, cf250: { ar: "CF250", en: "CF250" },
    } },
    rocket: { label: { ar: "روكيت", en: "Rocket" }, models: {
      rocket125: { ar: "روكيت 125", en: "Rocket 125" }, rocket150: { ar: "روكيت 150", en: "Rocket 150" },
    } },
  };
  function getBrandLabel(data, brandId) {
    var entry = data[brandId];
    if (!entry) return brandId || "";
    return entry.label[currentLang] || entry.label.ar;
  }
  function getModelLabel(data, brandId, modelId) {
    var entry = data[brandId];
    var model = entry && entry.models[modelId];
    if (!model) return modelId || "";
    return model[currentLang] || model.ar;
  }
  function buildListingTitle(listing) {
    if (listing.category === "car") {
      return [getBrandLabel(CAR_DATA, listing.carBrand), getModelLabel(CAR_DATA, listing.carBrand, listing.carModel), listing.carYear]
        .filter(Boolean)
        .join(" ");
    }
    if (listing.category === "motorcycle") {
      return [getBrandLabel(MOTO_DATA, listing.motoBrand), getModelLabel(MOTO_DATA, listing.motoBrand, listing.motoModel), listing.motoYear]
        .filter(Boolean)
        .join(" ");
    }
    if (listing.category === "land") {
      return getCategoryLabel("land") + " — " + t("landType." + listing.landType);
    }
    if (listing.category === "residential") {
      return getCategoryLabel("residential") + " — " + listing.resRooms + " " + t("spec.rooms");
    }
    if (listing.category === "commercial") {
      return t("comType." + listing.comType);
    }
    return getCategoryLabel(listing.category);
  }
  function buildListingLocation(listing) {
    var city = t("city." + listing.city);
    var addr = listing.landAddress || listing.resAddress || listing.comAddress;
    return addr ? city + " — " + addr : city;
  }
  function buildListingSpecs(listing) {
    var specs = [];
    if (listing.category === "residential") {
      specs.push({ value: listing.resRooms, unit: t("spec.rooms") });
      specs.push({ value: listing.resArea, unit: t("spec.sqm") });
      specs.push({ value: listing.resBaths, unit: t("spec.baths") });
    } else if (listing.category === "land") {
      specs.push({ value: listing.landArea, unit: t("spec.sqm") });
      specs.push({ value: null, unit: t("landType." + listing.landType) });
    } else if (listing.category === "commercial") {
      specs.push({ value: listing.comArea, unit: t("spec.sqm") });
    } else if (listing.category === "car" || listing.category === "motorcycle") {
      var odo = listing.category === "car" ? listing.carOdometer : listing.motoOdometer;
      if (odo !== undefined && odo !== "" && odo !== null) {
        specs.push({ value: formatNumberWithSeparators(odo), unit: t("spec.km") });
      }
    } else if (isCustomCategory(listing.category)) {
      /* فئة مخصّصة أضافها المدير العام — نعرض أول 3 حقول غير داخلية كـ"مواصفات" عامة */
      var customDef = findCustomCategory(listing.category);
      (customDef ? customDef.fields : [])
        .filter(function (f) { return !f.internal; })
        .slice(0, 3)
        .forEach(function (f) {
          var raw = listing[f.key];
          if (raw === undefined || raw === "" || raw === null) return;
          var displayVal = f.type === "select" ? selectOptionLabel(f, raw) : raw;
          specs.push({ value: displayVal, unit: currentLang === "ar" ? f.labelAr : f.labelEn });
        });
    }
    return specs;
  }
  function selectOptionLabel(field, value) {
    var opt = (field.options || []).find(function (o) { return o.value === value; });
    if (!opt) return value;
    return currentLang === "ar" ? opt.labelAr : opt.labelEn;
  }
  function appendSpecsToEl(container, listing) {
    container.innerHTML = "";
    buildListingSpecs(listing).forEach(function (spec) {
      var span = document.createElement("span");
      if (spec.value !== null && spec.value !== undefined && spec.value !== "") {
        var b = document.createElement("b");
        b.textContent = spec.value;
        span.appendChild(b);
        span.appendChild(document.createTextNode(" " + spec.unit));
      } else {
        span.textContent = spec.unit;
      }
      container.appendChild(span);
    });
  }

  /* ---------- عرض إعلانات الصفحة الرئيسية ---------- */
  function createListingCardEl(listing) {
    var isSold = getListingStatus(listing) === "sold";
    var a = document.createElement("a");
    a.className = "card card-link" + (isSold ? " card-sold" : "");
    a.href = "listing.html?id=" + encodeURIComponent(listing.id);

    var media = document.createElement("div");
    media.className = "card-media";
    if (listing.photos && listing.photos[0]) {
      media.style.backgroundImage = "url('" + listing.photos[0] + "')";
    } else {
      media.classList.add("card-media-empty");
    }
    var badge = document.createElement("span");
    if (isSold) {
      badge.className = "badge badge-sold";
      badge.textContent = t("listing.sold");
    } else {
      badge.className = "badge" + (listing.offerType !== "rent" ? " sale" : "");
      badge.textContent = listing.offerType === "rent" ? t("offer.rent") : t("offer.sale");
    }
    media.appendChild(badge);

    if (listing.featured && !isSold) {
      var featuredBadge = document.createElement("span");
      featuredBadge.className = "badge badge-featured";
      featuredBadge.textContent = "★ " + t("listing.featuredBadge");
      media.appendChild(featuredBadge);
    }

    var session = getSession();
    if (session) {
      var favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "card-favorite-btn" + (isFavorite(session, listing.id) ? " active" : "");
      favBtn.setAttribute("aria-label", t("favorites.toggleBtn"));
      favBtn.textContent = isFavorite(session, listing.id) ? "♥" : "♡";
      favBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var nowFav = toggleFavorite(session, listing.id);
        favBtn.classList.toggle("active", nowFav);
        favBtn.textContent = nowFav ? "♥" : "♡";
        if (typeof window.__rerenderFavoritesPage === "function") window.__rerenderFavoritesPage();
      });
      media.appendChild(favBtn);
    }

    a.appendChild(media);

    var body = document.createElement("div");
    body.className = "card-body";

    var title = document.createElement("div");
    title.className = "card-title";
    title.textContent = buildListingTitle(listing);
    body.appendChild(title);

    var price = document.createElement("div");
    price.className = "card-price";
    price.textContent = formatPrice(listing);
    body.appendChild(price);

    var loc = document.createElement("div");
    loc.className = "card-loc";
    loc.textContent = buildListingLocation(listing);
    body.appendChild(loc);

    if (isSellerVerified(listing.ownerEmail)) {
      var verifiedBadge = document.createElement("span");
      verifiedBadge.className = "verified-seller-badge";
      verifiedBadge.title = t("seller.verifiedBadgeTooltip");
      verifiedBadge.innerHTML = "<span class='verified-seller-check'>&#10003;</span> " + t("seller.verifiedBadge");
      body.appendChild(verifiedBadge);
    }

    var specs = document.createElement("div");
    specs.className = "card-specs";
    appendSpecsToEl(specs, listing);
    body.appendChild(specs);

    a.appendChild(body);
    return a;
  }

  var HOME_PAGE_SIZE = 6;
  var homePagination = { re: 1, veh: 1 };
  var lastHomeFilters = null;

  var ADMIN_PAGE_SIZE = 10;
  function renderPaginationBar(containerId, page, totalPages, onChange) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = "";
    if (totalPages <= 1) return;

    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn btn-ghost btn-xs pagination-btn";
    prevBtn.textContent = "‹";
    prevBtn.disabled = page <= 1;
    prevBtn.addEventListener("click", function () {
      onChange(Math.max(1, page - 1));
    });
    el.appendChild(prevBtn);

    var info = document.createElement("span");
    info.className = "pagination-info";
    info.textContent = page + " / " + totalPages;
    el.appendChild(info);

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-ghost btn-xs pagination-btn";
    nextBtn.textContent = "›";
    nextBtn.disabled = page >= totalPages;
    nextBtn.addEventListener("click", function () {
      onChange(Math.min(totalPages, page + 1));
    });
    el.appendChild(nextBtn);
  }

  function renderHomeListings(filters) {
    var reContainer = document.getElementById("realestateGrid");
    var vehContainer = document.getElementById("vehiclesGrid");
    if (!reContainer && !vehContainer) return;

    if (filters !== undefined) {
      lastHomeFilters = filters;
      homePagination.re = 1;
      homePagination.veh = 1;
    }
    var f = lastHomeFilters || {};

    var listings = getListings()
      .filter(function (l) {
        return !l.hidden;
      })
      .sort(function (a, b) {
        return b.createdAt - a.createdAt;
      });

    function matchesCommon(l) {
      if (f.city && l.city !== f.city) return false;
      if (f.offerType && l.offerType !== f.offerType) return false;
      var price = Number(l.price) || 0;
      if (f.priceMin !== undefined && f.priceMin !== "" && price < Number(f.priceMin)) return false;
      if (f.priceMax !== undefined && f.priceMax !== "" && price > Number(f.priceMax)) return false;
      if (f.keyword) {
        var kw = String(f.keyword).trim().toLowerCase();
        if (kw) {
          /* لا يوجد حقل "عنوان" ثابت مخزَّن مع الإعلان — العنوان يُبنى تلقائيًا من
             الفئة وتفاصيلها (buildListingTitle)، فنبحث فيه هو والوصف بدل الاعتماد
             على حقل title غير موجود أصلاً على الإعلانات الحقيقية. */
          var haystack = (buildListingTitle(l) + " " + (l.description || "")).toLowerCase();
          if (haystack.indexOf(kw) === -1) return false;
        }
      }
      return true;
    }

    function sortListings(arr) {
      var sorted = arr.slice();
      var cmp;
      if (f.sort === "priceAsc") {
        cmp = function (a, b) {
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        };
      } else if (f.sort === "priceDesc") {
        cmp = function (a, b) {
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        };
      } else {
        cmp = function (a, b) {
          return b.createdAt - a.createdAt;
        };
      }
      /* الإعلانات المميزة (featured) تظهر دائمًا أولًا ضمن ترتيب النتائج، بصرف النظر عن
         فلتر الترتيب المختار، ما دامت لا تزال نشطة (غير مباعة). */
      sorted.sort(function (a, b) {
        var af = a.featured && getListingStatus(a) !== "sold" ? 1 : 0;
        var bf = b.featured && getListingStatus(b) !== "sold" ? 1 : 0;
        if (af !== bf) return bf - af;
        return cmp(a, b);
      });
      return sorted;
    }

    var reListings = listings.filter(function (l) {
      if (getCategoryGroup(l.category) !== "realestate") return false;
      if (!matchesCommon(l)) return false;
      if (f.category && getCategoryGroup(f.category) === "realestate") {
        if (l.category !== f.category) return false;
      }
      if (f.rooms && l.category === "residential") {
        var rooms = Number(l.resRooms) || 0;
        if (rooms < Number(f.rooms)) return false;
      }
      if (f.landType && l.category === "land" && l.landType !== f.landType) return false;
      if (f.comType && l.category === "commercial" && l.comType !== f.comType) return false;
      return true;
    });
    var vehListings = listings.filter(function (l) {
      if (getCategoryGroup(l.category) !== "vehicles") return false;
      if (!matchesCommon(l)) return false;
      if (f.category && getCategoryGroup(f.category) === "vehicles") {
        if (l.category !== f.category) return false;
      }
      /* فلاتر السنة/الشركة/الموديل خاصة بفئتَي السيارات والدراجات النارية الأساسيتين فقط —
         لا تُطبَّق على فئات المركبات المخصّصة التي يضيفها المدير العام، حتى لا تُستبعد
         نتائجها بسبب قيم فلتر متبقية من فئة أخرى بينما حقول الفلتر نفسها مخفية لها. */
      if (l.category === "car" || l.category === "motorcycle") {
        var year = Number(l.category === "car" ? l.carYear : l.motoYear) || 0;
        if (f.yearMin && year < Number(f.yearMin)) return false;
        if (f.yearMax && year > Number(f.yearMax)) return false;
        if (f.brand) {
          var brandVal = l.category === "car" ? l.carBrand : l.motoBrand;
          if (brandVal !== f.brand) return false;
        }
        if (f.model) {
          var modelVal = l.category === "car" ? l.carModel : l.motoModel;
          if (modelVal !== f.model) return false;
        }
      }
      return true;
    });

    reListings = sortListings(reListings);
    vehListings = sortListings(vehListings);

    function updateResultsCount(elId, count) {
      var el = document.getElementById(elId);
      if (!el) return;
      el.textContent = count.toLocaleString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US") + " " + t("search.resultsUnit");
    }
    updateResultsCount("realestateResultsCount", reListings.length);
    updateResultsCount("vehiclesResultsCount", vehListings.length);

    function renderPaginationControls(pageKey, page, totalPages) {
      var pagEl = document.getElementById(pageKey === "re" ? "realestatePagination" : "vehiclesPagination");
      if (!pagEl) return;
      pagEl.innerHTML = "";
      if (totalPages <= 1) return;

      var prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "btn btn-ghost btn-xs pagination-btn";
      prevBtn.textContent = "‹";
      prevBtn.disabled = page <= 1;
      prevBtn.addEventListener("click", function () {
        homePagination[pageKey] = Math.max(1, page - 1);
        renderHomeListings();
      });
      pagEl.appendChild(prevBtn);

      var info = document.createElement("span");
      info.className = "pagination-info";
      info.textContent = page + " / " + totalPages;
      pagEl.appendChild(info);

      var nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "btn btn-ghost btn-xs pagination-btn";
      nextBtn.textContent = "›";
      nextBtn.disabled = page >= totalPages;
      nextBtn.addEventListener("click", function () {
        homePagination[pageKey] = Math.min(totalPages, page + 1);
        renderHomeListings();
      });
      pagEl.appendChild(nextBtn);
    }

    function fill(container, items, emptyKey, pageKey) {
      if (!container) return;
      container.innerHTML = "";
      if (!items.length) {
        var empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = lastHomeFilters ? t("search.noResults") : t(emptyKey);
        container.appendChild(empty);
        renderPaginationControls(pageKey, 0, 0);
        return;
      }
      var totalPages = Math.max(1, Math.ceil(items.length / HOME_PAGE_SIZE));
      if (homePagination[pageKey] > totalPages) homePagination[pageKey] = totalPages;
      var page = homePagination[pageKey];
      var start = (page - 1) * HOME_PAGE_SIZE;
      items.slice(start, start + HOME_PAGE_SIZE).forEach(function (listing) {
        container.appendChild(createListingCardEl(listing));
      });
      renderPaginationControls(pageKey, page, totalPages);
    }

    fill(reContainer, reListings, "home.noRealestate", "re");
    fill(vehContainer, vehListings, "home.noVehicles", "veh");
  }

  /* ---------- أدوات مشتركة ---------- */
  /* يحوّل رسائل أخطاء Supabase (بالإنجليزية) إلى رسائل مفهومة بلغة الواجهة */
  function mapSupabaseError(message) {
    var m = String(message || "");
    if (/users_username|username/i.test(m) && /duplicate|unique|already/i.test(m)) return t("auth.usernameExists");
    if (/already registered|already exists|users_email_key|duplicate key/i.test(m)) return t("auth.emailExists");
    if (/password/i.test(m) && /(should be|at least|weak|short)/i.test(m)) return t("error.password");
    if (/invalid.*email|email.*invalid|unable to validate email/i.test(m)) return t("error.email");
    if (/rate limit|too many|over_.*_rate/i.test(m)) return t("auth.rateLimited");
    if (/failed to fetch|networkerror|network request|load failed/i.test(m)) return t("auth.networkError");
    try { console.warn("Supabase error:", m); } catch (e) {}
    return t("auth.signupGeneric");
  }
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  function isValidPhone(value) {
    return /^0\d{9}$/.test(value.trim());
  }
  /* اسم مستخدم بديل (alias) لتسجيل دخول موظفي/موظفات الإدارة فقط — بدلاً من
     البريد الإلكتروني. متاح فقط لحسابات الإدارة (super_admin/admin/moderator...)،
     ولا يُستخدم إطلاقًا في تسجيل دخول المستخدمين العاديين. */
  function isValidUsername(value) {
    return /^[a-zA-Z0-9_.]{3,20}$/.test((value || "").trim());
  }
  function isUsernameTaken(username, excludeEmail) {
    var normalized = (username || "").trim().toLowerCase();
    if (!normalized) return false;
    return getUsers().some(function (u) {
      return u.email !== excludeEmail && (u.username || "").toLowerCase() === normalized;
    });
  }
  function calculateAge(birthdateStr) {
    var b = new Date(birthdateStr);
    if (isNaN(b.getTime())) return null;
    var today = new Date();
    if (b.getTime() > today.getTime()) return null;
    var age = today.getFullYear() - b.getFullYear();
    var m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
    return age;
  }

  /* ---------- حالة الدخول في هيدر الصفحة الرئيسية ---------- */
  function renderBrandAvatar() {
    /* شعار المنصة (الدائرة "م" بجانب اسم "مباشر") ثابت دائمًا ولا يُستبدل بصورة
       المستخدم الشخصية — صورة المستخدم تظهر في مكانها الصحيح: شارة الاسم في الهيدر. */
    var avatarEl = document.getElementById("brandAvatar");
    if (!avatarEl) return;
    avatarEl.classList.remove("brand-mark-clickable", "has-photo");
    avatarEl.removeAttribute("role");
    avatarEl.removeAttribute("tabindex");
    avatarEl.onclick = null;
    avatarEl.style.backgroundImage = "";
    avatarEl.textContent = t("brand.initial");
  }

  /* ---------- شارة اسم المستخدم وصورته أعلى جميع الصفحات ---------- */
  function renderHeaderUserBadge() {
    var badge = document.getElementById("headerUserBadge");
    if (!badge) return;
    var avatarEl = document.getElementById("headerUserAvatar");
    var nameEl = document.getElementById("headerUserName");
    var session = getSession();
    var user = session ? findUser(session) : null;

    if (!user) {
      badge.classList.remove("show");
      badge.onclick = null;
      return;
    }

    badge.classList.add("show");
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.onclick = function () {
      if (profileModalOpenFn) profileModalOpenFn();
    };

    if (avatarEl) {
      if (user.photo) {
        avatarEl.style.backgroundImage = "url('" + user.photo + "')";
        avatarEl.classList.add("has-photo");
        avatarEl.textContent = "";
      } else {
        avatarEl.style.backgroundImage = "";
        avatarEl.classList.remove("has-photo");
        avatarEl.textContent = (user.name || user.email || t("brand.initial")).trim().charAt(0).toUpperCase();
      }
    }
    if (nameEl) {
      nameEl.textContent = user.name || user.email || "";
    }
  }

  function renderUnreadMessagesBadge() {
    var badge = document.getElementById("unreadMessagesBadge");
    if (!badge) return;
    var session = getSession();
    var count = session ? getUnreadMessageCount(session) : 0;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
    renderBottomNavBadge();
  }

  function renderNotificationDropdownList() {
    var listEl = document.getElementById("notifDropdownList");
    if (!listEl) return;
    var session = getSession();
    var items = session ? getNotificationsFor(session) : [];
    listEl.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "notif-empty";
      empty.textContent = t("notif.empty");
      listEl.appendChild(empty);
      return;
    }
    items.slice(0, 30).forEach(function (n) {
      var item = document.createElement("div");
      item.className = "notif-item" + (n.read ? "" : " unread");
      var textEl = document.createElement("div");
      textEl.className = "notif-item-text";
      textEl.textContent = notificationText(n);
      item.appendChild(textEl);
      var timeEl = document.createElement("div");
      timeEl.className = "notif-item-time";
      timeEl.textContent = new Date(n.createdAt).toLocaleString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US");
      item.appendChild(timeEl);
      /* إشعار "قيّم البائع" يحمل معرّف الإعلان — الضغط عليه ينقل مباشرة لصفحة الإعلان
         حيث يوجد نموذج التقييم جاهزًا، بدل أن يبقى الإشعار نصًا بلا فائدة عملية. */
      if (n.data && n.data.listingId) {
        item.classList.add("notif-item-clickable");
        item.addEventListener("click", function () {
          window.location.href = "listing.html?id=" + encodeURIComponent(n.data.listingId);
        });
      }
      listEl.appendChild(item);
    });
  }

  function initNotificationBell() {
    /* على الصفحة الرئيسية (index.html) توجد حاوية "#headerQuickActions" ثابتة الظهور دائمًا
       أعلى الهيدر (خارج قائمة ☰ المنسدلة على الجوال) — نضع الجرس فيها إن وُجدت، بدل مكانه
       القديم بجانب شارة المستخدم داخل القائمة المنسدلة (حيث كان يختفي حتى تُفتح القائمة).
       باقي الصفحات (تفاصيل إعلان، إعلاناتي...) ليس لها قائمة منسدلة أصلاً؛ شارة المستخدم بها
       ظاهرة دائمًا، فيبقى السلوك القديم كما هو تمامًا. */
    var quickActions = document.getElementById("headerQuickActions");
    var anchor = document.getElementById("headerUserBadge");
    var insertParent = quickActions ? quickActions : anchor && anchor.parentNode;
    var insertBeforeEl = quickActions ? quickActions.firstChild : anchor;
    if (!insertParent) return;
    var wrap = document.getElementById("notifBellWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "notif-bell-wrap";
      wrap.id = "notifBellWrap";
      wrap.innerHTML =
        '<button type="button" class="btn btn-ghost notif-bell-btn" id="notifBell">' +
        '🔔<span class="unread-badge" id="notifUnreadBadge" style="display:none;">0</span>' +
        "</button>" +
        '<div class="notif-dropdown" id="notifDropdown" style="display:none;">' +
        '<div class="notif-dropdown-head" id="notifDropdownHead"></div>' +
        '<div class="notif-dropdown-list" id="notifDropdownList"></div>' +
        "</div>";
      insertParent.insertBefore(wrap, insertBeforeEl);

      var bellBtn = document.getElementById("notifBell");
      var dropdown = document.getElementById("notifDropdown");
      bellBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOpen = dropdown.style.display !== "none";
        if (isOpen) {
          dropdown.style.display = "none";
        } else {
          renderNotificationDropdownList();
          dropdown.style.display = "";
          var session = getSession();
          if (session && markNotificationsReadFor(session)) {
            renderNotificationBell();
          }
        }
      });
      document.addEventListener("click", function (e) {
        if (dropdown.style.display !== "none" && !wrap.contains(e.target)) {
          dropdown.style.display = "none";
        }
      });
    }
    renderNotificationBell();
  }

  function renderNotificationBell() {
    var bellWrap = document.getElementById("notifBellWrap");
    if (!bellWrap) return;
    var session = getSession();
    bellWrap.style.display = session ? "inline-block" : "none";
    var badge = document.getElementById("notifUnreadBadge");
    var headEl = document.getElementById("notifDropdownHead");
    if (headEl) headEl.textContent = t("notif.heading");
    var bellBtn = document.getElementById("notifBell");
    if (bellBtn) bellBtn.setAttribute("aria-label", t("notif.bellLabel"));
    if (!badge) return;
    var count = session ? getUnreadNotificationCount(session) : 0;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  }

  function initHeaderAuthState() {
    var authActions = document.getElementById("authActions");
    var messagesLink = document.getElementById("navMessagesLink");
    var myListingsLink = document.getElementById("navMyListingsLink");
    var subscriptionLink = document.getElementById("navSubscriptionLink");
    var favoritesLink = document.getElementById("navFavoritesLink");
    var session = getSession();

    if (messagesLink) {
      messagesLink.style.display = session ? "" : "none";
      renderUnreadMessagesBadge();
    }
    if (favoritesLink) {
      favoritesLink.style.display = session ? "" : "none";
    }
    if (myListingsLink) {
      var hasOwnListings =
        !!session &&
        getListings().some(function (l) {
          return l.ownerEmail === session;
        });
      myListingsLink.style.display = hasOwnListings ? "" : "none";
    }
    if (subscriptionLink) {
      subscriptionLink.style.display = session ? "" : "none";
    }

    renderBrandAvatar();
    renderHeaderUserBadge();

    // رابط "لوحة التحكم" يظهر لأي موظف إدارة في كل الصفحات، ليتنقل بسهولة بين لوحة الإدارة
    // والصفحة الرئيسية وباقي صفحات الموقع دون الحاجة للعودة لصفحة تسجيل دخول الإدارة كل مرة.
    var adminPanelLink = document.getElementById("navAdminPanelLink");
    if (adminPanelLink) {
      var sessUserForNav = session ? findUser(session) : null;
      adminPanelLink.style.display = sessUserForNav && isAdminRole(sessUserForNav.role) ? "" : "none";
    }

    if (session) {
      checkSubscriptionExpiryNotifications(session);
    }
    initNotificationBell();

    if (!authActions) return;

    var loginBtn = document.getElementById("navLoginBtn");
    var signupBtn = document.getElementById("navSignupBtn");

    if (session) {
      if (signupBtn) signupBtn.style.display = "none";
      if (loginBtn) {
        loginBtn.removeAttribute("data-i18n");
        loginBtn.textContent = t("auth.logout");
        loginBtn.setAttribute("href", "#");
        loginBtn.addEventListener("click", function (e) {
          e.preventDefault();
          clearSession();
          window.location.href = "login.html";
        });
      }
    }
  }

  /* ---------- تبويبات البحث بالصفحة الرئيسية ---------- */
  function initSearchTabs() {
    /* إضافة تبويب لكل فئة مخصّصة أضافها المدير العام، قبل قراءة قائمة التبويبات —
       بذلك تُعامَل مثل أي تبويب أساسي تمامًا (النقر، التمييز، الفلترة) دون أي كود إضافي */
    var searchTabsWrap = document.getElementById("searchTabs");
    if (searchTabsWrap && !searchTabsWrap.dataset.customTabsInjected) {
      searchTabsWrap.dataset.customTabsInjected = "1";
      getCustomCategories().forEach(function (cat) {
        var tabEl = document.createElement("div");
        tabEl.className = "search-tab";
        tabEl.setAttribute("data-cat", cat.id);
        tabEl.setAttribute("data-cat-name", cat.id);
        tabEl.textContent = getCategoryLabel(cat.id);
        searchTabsWrap.appendChild(tabEl);
      });
    }

    var tabs = document.querySelectorAll(".search-tab");
    if (!tabs.length) return;

    var roomsField = document.getElementById("searchRoomsField");
    var yearField = document.getElementById("searchYearField");
    var yearMinSel = document.getElementById("searchYearMin");
    var yearMaxSel = document.getElementById("searchYearMax");
    var landTypeField = document.getElementById("searchLandTypeField");
    var comTypeField = document.getElementById("searchComTypeField");
    var brandField = document.getElementById("searchBrandField");
    var modelField = document.getElementById("searchModelField");
    var brandSelect = document.getElementById("searchBrand");
    var modelSelect = document.getElementById("searchModel");

    function fillYearOptions(selectEl) {
      if (!selectEl || selectEl.dataset.filled) return;
      selectEl.dataset.filled = "1";
      var anyOpt = document.createElement("option");
      anyOpt.value = "";
      anyOpt.textContent = t("search.any");
      selectEl.appendChild(anyOpt);
      var currentYear = new Date().getFullYear();
      for (var y = currentYear; y >= 1990; y--) {
        var opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = String(y);
        selectEl.appendChild(opt);
      }
    }
    fillYearOptions(yearMinSel);
    fillYearOptions(yearMaxSel);

    /* ---------- تعبئة قوائم الشركة المصنعة/الموديل لفلتر البحث (سيارات/دراجات) ---------- */
    function vehicleDataFor(cat) {
      if (cat === "car") return CAR_DATA;
      if (cat === "motorcycle") return MOTO_DATA;
      return null;
    }
    function fillSearchBrandSelect(data) {
      if (!brandSelect) return;
      brandSelect.innerHTML = "";
      var anyOpt = document.createElement("option");
      anyOpt.value = "";
      anyOpt.textContent = t("search.any");
      brandSelect.appendChild(anyOpt);
      if (!data) return;
      Object.keys(data).forEach(function (brandId) {
        var opt = document.createElement("option");
        opt.value = brandId;
        opt.textContent = getBrandLabel(data, brandId);
        brandSelect.appendChild(opt);
      });
    }
    function fillSearchModelSelect(data, brandId) {
      if (!modelSelect) return;
      modelSelect.innerHTML = "";
      var anyOpt = document.createElement("option");
      anyOpt.value = "";
      anyOpt.textContent = t("search.any");
      modelSelect.appendChild(anyOpt);
      if (!data || !brandId || !data[brandId]) return;
      Object.keys(data[brandId].models).forEach(function (modelId) {
        var opt = document.createElement("option");
        opt.value = modelId;
        opt.textContent = getModelLabel(data, brandId, modelId);
        modelSelect.appendChild(opt);
      });
    }
    if (brandSelect) {
      brandSelect.addEventListener("change", function () {
        var activeCat = (document.querySelector(".search-tab.active") || {}).getAttribute
          ? document.querySelector(".search-tab.active").getAttribute("data-cat")
          : "";
        fillSearchModelSelect(vehicleDataFor(activeCat), brandSelect.value);
      });
    }

    function updateFieldsForCategory(cat) {
      if (roomsField) roomsField.style.display = cat === "residential" ? "" : "none";
      if (yearField) yearField.style.display = cat === "car" || cat === "motorcycle" ? "" : "none";
      if (landTypeField) landTypeField.style.display = cat === "land" ? "" : "none";
      if (comTypeField) comTypeField.style.display = cat === "commercial" ? "" : "none";
      var isVehicle = cat === "car" || cat === "motorcycle";
      if (brandField) brandField.style.display = isVehicle ? "" : "none";
      if (modelField) modelField.style.display = isVehicle ? "" : "none";
      if (isVehicle) {
        fillSearchBrandSelect(vehicleDataFor(cat));
        fillSearchModelSelect(null, "");
      }
    }

    var activeTab = document.querySelector(".search-tab.active") || tabs[0];
    updateFieldsForCategory(activeTab ? activeTab.getAttribute("data-cat") : "residential");

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t2) {
          t2.classList.remove("active");
        });
        tab.classList.add("active");
        updateFieldsForCategory(tab.getAttribute("data-cat"));
      });
    });

    function collectFilters() {
      var activeCat = (document.querySelector(".search-tab.active") || {}).getAttribute
        ? document.querySelector(".search-tab.active").getAttribute("data-cat")
        : "residential";
      return {
        category: activeCat,
        keyword: (document.getElementById("searchKeyword") || {}).value ? document.getElementById("searchKeyword").value.trim() : "",
        city: (document.getElementById("searchCity") || {}).value || "",
        offerType: (document.getElementById("searchOfferType") || {}).value || "",
        priceMin: (document.getElementById("searchPriceMin") || {}).value || "",
        priceMax: (document.getElementById("searchPriceMax") || {}).value || "",
        rooms: (document.getElementById("searchRooms") || {}).value || "",
        yearMin: (yearMinSel || {}).value || "",
        yearMax: (yearMaxSel || {}).value || "",
        landType: (document.getElementById("searchLandType") || {}).value || "",
        comType: (document.getElementById("searchComType") || {}).value || "",
        brand: (brandSelect || {}).value || "",
        model: (modelSelect || {}).value || "",
        sort: (document.getElementById("searchSort") || {}).value || "newest",
      };
    }

    /* ---------- حفظ/استرجاع الفلاتر عبر رابط الصفحة (قابلة للمشاركة والرجوع إليها) ---------- */
    function syncFiltersToUrl(filters) {
      var params = new URLSearchParams();
      Object.keys(filters).forEach(function (k) {
        if (filters[k]) params.set(k, filters[k]);
      });
      var qs = params.toString();
      var newUrl = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    }
    function clearFiltersFromUrl() {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }

    function runSearch(scrollToSection) {
      var filters = collectFilters();
      renderHomeListings(filters);
      syncFiltersToUrl(filters);
      if (scrollToSection) {
        var targetId = getCategoryGroup(filters.category) === "vehicles" ? "cars" : "realestate";
        var targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    var submitBtn = document.getElementById("searchSubmitBtn");
    if (submitBtn) {
      submitBtn.addEventListener("click", function () {
        var hsCat = document.getElementById("headerSearchCategory");
        var hsKeyword = document.getElementById("headerSearchKeyword");
        var activeTabNow = document.querySelector(".search-tab.active");
        if (hsCat && activeTabNow) hsCat.value = activeTabNow.getAttribute("data-cat");
        var heroKeywordNow = document.getElementById("searchKeyword");
        if (hsKeyword && heroKeywordNow) hsKeyword.value = heroKeywordNow.value;
        runSearch(true);
      });
    }

    var saveSearchBtn = document.getElementById("saveSearchBtn");
    if (saveSearchBtn) {
      saveSearchBtn.addEventListener("click", function () {
        var session = getSession();
        if (!session) {
          window.alert(t("savedSearch.loginRequiredAlert"));
          return;
        }
        var filters = collectFilters();
        var params = new URLSearchParams();
        Object.keys(filters).forEach(function (k) {
          if (filters[k]) params.set(k, filters[k]);
        });
        var name = window.prompt(t("savedSearch.namePrompt"), t("savedSearch.defaultName"));
        if (name === null) return;
        name = name.trim() || t("savedSearch.defaultName");
        addSavedSearch(session, name, filters, params.toString());
        window.alert(t("savedSearch.savedAlert"));
      });
    }

    /* ---------- البحث بالموقع الجغرافي: عرض خريطة تجميعية للإعلانات حسب المدينة ----------
       لا تحتوي الإعلانات على إحداثيات دقيقة (لا توجد بوابة تحديد موقع/عنوان مُفصَّل)، فالخريطة
       تعرض علامة واحدة لكل مدينة فيها إعلانات نشطة (باستخدام جدول إحداثيات تقريبية للمدن)، مع
       عدد الإعلانات بها، والنقر على العلامة يطبّق فلتر هذه المدينة على البحث العادي. تعتمد على
       مكتبة Leaflet المُحمَّلة من CDN فقط عند الحاجة (عند فتح عرض الخريطة أول مرة)؛ إن تعذّر
       تحميلها (مثل بيئة بلا إنترنت) تُعرض رسالة بديلة بلا كسر الصفحة. */
    var mapToggleBtn = document.getElementById("mapViewToggleBtn");
    var mapSection = document.getElementById("mapViewSection");
    var listingsMapInstance = null;
    var listingsMapMarkersLayer = null;
    var mapViewActive = false;

    function getActiveListingCityCounts() {
      var counts = {};
      getListings().forEach(function (l) {
        if (l.hidden) return;
        if (getListingStatus(l) === "sold") return;
        if (!l.city) return;
        counts[l.city] = (counts[l.city] || 0) + 1;
      });
      return counts;
    }

    function applyCityFilterFromMap(cityKey) {
      var citySelect = document.getElementById("searchCity");
      if (citySelect) citySelect.value = cityKey;
      setMapViewActive(false);
      runSearch(true);
    }

    function renderListingsMap() {
      if (!mapSection) return;
      var mapEl = document.getElementById("listingsMap");
      if (!mapEl) return;
      if (typeof L === "undefined") {
        mapEl.innerHTML = '<p class="map-unavailable-note">' + t("map.unavailable") + "</p>";
        return;
      }
      if (!listingsMapInstance) {
        listingsMapInstance = L.map(mapEl, { scrollWheelZoom: false }).setView([15.6, 30.5], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 18,
        }).addTo(listingsMapInstance);
        listingsMapMarkersLayer = L.layerGroup().addTo(listingsMapInstance);
        listingsMapInstance.on("popupopen", function (e) {
          var popupNode = e.popup.getElement ? e.popup.getElement() : e.popup._contentNode;
          var btn = popupNode ? popupNode.querySelector(".map-popup-btn") : null;
          if (btn) {
            btn.addEventListener("click", function () {
              applyCityFilterFromMap(btn.getAttribute("data-city"));
            });
          }
        });
      }
      listingsMapMarkersLayer.clearLayers();
      var counts = getActiveListingCityCounts();
      Object.keys(counts).forEach(function (cityKey) {
        var coords = CITY_COORDS[cityKey];
        if (!coords) return;
        var marker = L.marker(coords).addTo(listingsMapMarkersLayer);
        var cityLabel = t("city." + cityKey);
        var popupHtml =
          "<div class='map-popup'><b>" + cityLabel + "</b><br>" +
          counts[cityKey] + " " + t("search.resultsUnit") + "<br>" +
          "<button type='button' class='btn btn-solid btn-xs map-popup-btn' data-city='" + cityKey + "'>" +
          t("map.viewListingsBtn") + "</button></div>";
        marker.bindPopup(popupHtml);
      });
      setTimeout(function () {
        if (listingsMapInstance) listingsMapInstance.invalidateSize();
      }, 60);
    }

    function setMapViewActive(active) {
      mapViewActive = active;
      if (mapSection) mapSection.style.display = active ? "" : "none";
      if (mapToggleBtn) {
        mapToggleBtn.textContent = active ? t("map.showListBtn") : t("map.showMapBtn");
        mapToggleBtn.setAttribute("aria-pressed", active ? "true" : "false");
      }
      var reSection = document.getElementById("realestate");
      var carsSection = document.getElementById("cars");
      if (reSection) reSection.style.display = active ? "none" : "";
      if (carsSection) carsSection.style.display = active ? "none" : "";
      if (active) renderListingsMap();
    }

    if (mapToggleBtn) {
      mapToggleBtn.setAttribute("aria-pressed", "false");
      mapToggleBtn.addEventListener("click", function () {
        setMapViewActive(!mapViewActive);
      });
    }

    /* ---------- شريط البحث البارز في الهيدر (بنمط أمازون): قسم + كلمة مفتاحية + زر بحث ----------
       يُعيد استخدام نفس منطق البحث المفصّل بالأسفل (تبويبات الأقسام + collectFilters/runSearch)
       بدل تكرار منطق فلترة منفصل — يضبط التبويب المطابق للقسم المختار وحقل الكلمة المفتاحية،
       ثم يُشغّل نفس البحث الموجود أصلاً. */
    var headerSearchForm = document.getElementById("headerSearchForm");
    var headerSearchCategory = document.getElementById("headerSearchCategory");
    var headerSearchKeyword = document.getElementById("headerSearchKeyword");
    if (headerSearchForm) {
      headerSearchForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var cat = (headerSearchCategory && headerSearchCategory.value) || "residential";
        tabs.forEach(function (tb) {
          tb.classList.toggle("active", tb.getAttribute("data-cat") === cat);
        });
        updateFieldsForCategory(cat);
        var heroKeywordInput = document.getElementById("searchKeyword");
        if (heroKeywordInput && headerSearchKeyword) heroKeywordInput.value = headerSearchKeyword.value;
        runSearch(true);
      });
    }

    function clearAllFilters() {
      [
        "searchKeyword", "searchCity", "searchOfferType", "searchPriceMin", "searchPriceMax",
        "searchRooms", "searchYearMin", "searchYearMax", "searchLandType", "searchComType",
        "headerSearchKeyword",
      ].forEach(function (fid) {
        var el = document.getElementById(fid);
        if (el) el.value = "";
      });
      if (headerSearchCategory) headerSearchCategory.value = "residential";
      var sortSel = document.getElementById("searchSort");
      if (sortSel) sortSel.value = "newest";
      tabs.forEach(function (tb) {
        tb.classList.toggle("active", tb.getAttribute("data-cat") === "residential");
      });
      updateFieldsForCategory("residential");
      clearFiltersFromUrl();
      renderHomeListings(null);
    }

    var clearBtn = document.getElementById("searchClearBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", clearAllFilters);
    }

    function wireClearLink(id) {
      var link = document.getElementById(id);
      if (!link) return;
      link.addEventListener("click", function (e) {
        e.preventDefault();
        clearAllFilters();
      });
    }
    wireClearLink("realestateClearFilters");
    wireClearLink("carsClearFilters");

    /* ---------- استرجاع الفلاتر من رابط الصفحة عند التحميل (بحث قابل للمشاركة) ---------- */
    function restoreFiltersFromUrl() {
      var params = new URLSearchParams(window.location.search);
      var hasParams = false;
      params.forEach(function () {
        hasParams = true;
      });
      if (!hasParams) return false;

      var cat = params.get("category") || "residential";
      tabs.forEach(function (tb) {
        tb.classList.toggle("active", tb.getAttribute("data-cat") === cat);
      });
      updateFieldsForCategory(cat);

      function setVal(id, val) {
        var el = document.getElementById(id);
        if (el && val) el.value = val;
      }
      setVal("searchKeyword", params.get("keyword"));
      setVal("searchCity", params.get("city"));
      setVal("searchOfferType", params.get("offerType"));
      setVal("searchPriceMin", params.get("priceMin"));
      setVal("searchPriceMax", params.get("priceMax"));
      setVal("searchRooms", params.get("rooms"));
      setVal("searchYearMin", params.get("yearMin"));
      setVal("searchYearMax", params.get("yearMax"));
      setVal("searchLandType", params.get("landType"));
      setVal("searchComType", params.get("comType"));
      if (params.get("brand")) {
        setVal("searchBrand", params.get("brand"));
        fillSearchModelSelect(vehicleDataFor(cat), params.get("brand"));
      }
      setVal("searchModel", params.get("model"));
      setVal("searchSort", params.get("sort") || "newest");

      renderHomeListings({
        category: cat,
        keyword: params.get("keyword") || "",
        city: params.get("city") || "",
        offerType: params.get("offerType") || "",
        priceMin: params.get("priceMin") || "",
        priceMax: params.get("priceMax") || "",
        rooms: params.get("rooms") || "",
        yearMin: params.get("yearMin") || "",
        yearMax: params.get("yearMax") || "",
        landType: params.get("landType") || "",
        comType: params.get("comType") || "",
        brand: params.get("brand") || "",
        model: params.get("model") || "",
        sort: params.get("sort") || "newest",
      });
      return true;
    }
    restoreFiltersFromUrl();
  }

  /* ---------- فتح/إغلاق لوحة الفلاتر المتقدمة (المدينة، نطاق السعر، عدد الغرف، الترتيب...) ----------
     دُمج الوصول إلى هذه اللوحة في شريط البحث البارز الظاهر دائمًا أعلى الصفحة (زر ⚙
     #headerFiltersToggle)، إلى جانب الزر الأصلي أسفل الواجهة الرئيسية (#advancedFiltersToggle) —
     كلا الزرّين يتحكمان بنفس اللوحة ويبقيان متزامنَين في الحالة (active/aria-expanded)، أيًّا
     كان الزر الذي فتحها. */
  function initAdvancedFiltersToggle() {
    var panel = document.getElementById("advancedFiltersPanel");
    var toggleBtns = [
      document.getElementById("advancedFiltersToggle"),
      document.getElementById("headerFiltersToggle"),
    ].filter(Boolean);
    if (!panel || !toggleBtns.length) return;

    function setOpen(open, scrollTo) {
      panel.style.display = open ? "" : "none";
      toggleBtns.forEach(function (btn) {
        btn.classList.toggle("active", open);
        btn.setAttribute("aria-expanded", String(open));
      });
      if (open && scrollTo) {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    toggleBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var isOpen = panel.style.display !== "none";
        setOpen(!isOpen, true);
      });
    });
  }

  /* ---------- التقاط صور متطور: كاميرا مباشرة داخل الصفحة + سحب وإفلات + اختيار تقليدي ----------
     يعمل على أي حقل <input type="file"> واحد (الصورة الشخصية أو صورة الهوية) عبر بطاقة التقاط
     تحتوي: منصة عرض (كاميرا حية / معاينة الصورة الناتجة)، وأزرار تتبدّل حسب الحالة (خامل/كاميرا
     مباشرة/تم الالتقاط). النتيجة النهائية تُحقن في نفس عنصر <input type="file"> الأصلي عبر
     DataTransfer وإطلاق حدث change، بحيث يبقى منطق التحقق والإرسال في initSignupForm بلا تغيير. */
  function initPhotoCaptureField(opts) {
    var input = document.getElementById(opts.inputId);
    var card = document.getElementById(opts.cardId);
    if (!input || !card) return;

    var video = document.getElementById(opts.videoId);
    var previewImg = document.getElementById(opts.previewImgId);
    var canvas = document.getElementById(opts.canvasId);
    var placeholder = document.getElementById(opts.placeholderId);
    var actionsIdle = document.getElementById(opts.actionsIdleId);
    var actionsLive = document.getElementById(opts.actionsLiveId);
    var actionsDone = document.getElementById(opts.actionsDoneId);
    var cameraBtn = document.getElementById(opts.cameraBtnId);
    var browseBtn = document.getElementById(opts.browseBtnId);
    var snapBtn = document.getElementById(opts.snapBtnId);
    var cameraCancelBtn = document.getElementById(opts.cameraCancelBtnId);
    var retakeBtn = document.getElementById(opts.retakeBtnId);

    var activeStream = null;

    /* رسالة "تعذّر الوصول إلى الكاميرا" — تُنشأ ديناميكيًا مرة واحدة داخل حاوية الحقل.
       كانت هذه الرسالة معرَّفة في قاموس الترجمة سابقًا لكنها لم تُعرَض في أي مكان فعليًا،
       فكان المستخدم يضغط "التقاط بالكاميرا" ولا يحدث شيء ظاهر عند رفض الإذن أو عدم توفّره —
       بالإضافة إلى أن محاولة فتح منتقي الملفات تلقائيًا (input.click()) من داخل then/catch
       لوعد غير متزامن تفشل بصمت على متصفحات الجوال (Safari/Chrome-Android) التي تشترط أن
       يكون فتح منتقي الملفات ناتجًا مباشرًا عن ضغطة المستخدم نفسها، وليس من رد فعل لاحق. */
    var statusEl = document.createElement("p");
    statusEl.className = "photo-capture-status";
    statusEl.style.display = "none";
    var fieldWrap = card.closest(".photo-capture-field") || card.parentNode;
    fieldWrap.appendChild(statusEl);

    function showCameraUnavailable() {
      statusEl.textContent = t("photoCapture.cameraUnavailable");
      statusEl.style.display = "block";
    }
    function hideCameraUnavailable() {
      statusEl.style.display = "none";
    }

    function stopStream() {
      if (activeStream) {
        activeStream.getTracks().forEach(function (track) {
          track.stop();
        });
        activeStream = null;
      }
      if (video) video.srcObject = null;
    }

    function showIdle() {
      hideCameraUnavailable();
      if (actionsIdle) actionsIdle.style.display = "";
      if (actionsLive) actionsLive.style.display = "none";
      if (actionsDone) actionsDone.style.display = "none";
      if (placeholder) placeholder.style.display = "flex";
      if (video) video.classList.remove("active");
      if (previewImg) previewImg.classList.remove("active");
    }

    function showLive() {
      hideCameraUnavailable();
      if (actionsIdle) actionsIdle.style.display = "none";
      if (actionsLive) actionsLive.style.display = "";
      if (actionsDone) actionsDone.style.display = "none";
      if (placeholder) placeholder.style.display = "none";
      if (video) video.classList.add("active");
      if (previewImg) previewImg.classList.remove("active");
    }

    function showDone(src) {
      hideCameraUnavailable();
      if (actionsIdle) actionsIdle.style.display = "none";
      if (actionsLive) actionsLive.style.display = "none";
      if (actionsDone) actionsDone.style.display = "";
      if (placeholder) placeholder.style.display = "none";
      if (video) video.classList.remove("active");
      if (previewImg) {
        previewImg.src = src;
        previewImg.classList.add("active");
      }
    }

    function setFileFromBlob(blob) {
      var fileName = (opts.fileNamePrefix || "photo") + "-" + Date.now() + ".jpg";
      var file;
      try {
        file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
      } catch (e) {
        file = blob;
      }
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function openCamera() {
      hideCameraUnavailable();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showCameraUnavailable();
        return;
      }
      try {
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: opts.facingMode || "user" }, audio: false })
          .then(function (s) {
            activeStream = s;
            if (video) video.srcObject = s;
            showLive();
          })
          .catch(function () {
            /* رفض إذن الكاميرا أو تعذّر الوصول إليها. لا نحاول فتح منتقي الملفات تلقائيًا هنا:
               بعض متصفحات الجوال تتجاهل input.click() الصادر من رد فعل غير متزامن (خارج
               حدث الضغط الأصلي مباشرة) فيبدو الأمر وكأن "لا شيء يحدث إطلاقًا". بدلاً من ذلك
               نعرض رسالة واضحة تطلب من المستخدم الضغط بنفسه على "اختيار من الجهاز" —
               وهي ضغطة مستخدم حقيقية جديدة تفتح المنتقي بثقة على كل المتصفحات. */
            showCameraUnavailable();
          });
      } catch (e) {
        /* بعض المتصفحات/السياقات (مثل إطار iframe مقيَّد الصلاحيات) قد تطلق استثناءً فوريًا
           بدل رفض الوعد — نلتقطه هنا لضمان ظهور رسالة واضحة دائمًا بدل تجمّد الواجهة صامتة */
        showCameraUnavailable();
      }
    }

    if (cameraBtn) cameraBtn.addEventListener("click", openCamera);
    if (browseBtn)
      browseBtn.addEventListener("click", function () {
        input.click();
      });
    if (cameraCancelBtn)
      cameraCancelBtn.addEventListener("click", function () {
        stopStream();
        showIdle();
      });
    if (retakeBtn)
      retakeBtn.addEventListener("click", function () {
        input.value = "";
        showIdle();
      });

    if (snapBtn)
      snapBtn.addEventListener("click", function () {
        if (!video || !video.videoWidth) return;
        var w = video.videoWidth;
        var h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (opts.mirror) {
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          function (blob) {
            if (!blob) return;
            setFileFromBlob(blob);
            stopStream();
          },
          "image/jpeg",
          0.9
        );
      });

    input.addEventListener("change", function () {
      var field = input.closest(".form-field");
      if (field) field.classList.remove("invalid");
      if (input.files && input.files.length) {
        var reader = new FileReader();
        reader.onload = function (e) {
          showDone(e.target.result);
        };
        reader.readAsDataURL(input.files[0]);
      } else {
        showIdle();
      }
    });

    /* سحب وإفلات صورة مباشرة على البطاقة */
    ["dragenter", "dragover"].forEach(function (evt) {
      card.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        card.classList.add("dragover");
      });
    });
    ["dragleave", "dragend"].forEach(function (evt) {
      card.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove("dragover");
      });
    });
    card.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove("dragover");
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var imgFile = null;
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf("image/") === 0) {
          imgFile = files[i];
          break;
        }
      }
      if (!imgFile) return;
      var dt = new DataTransfer();
      dt.items.add(imgFile);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    showIdle();
  }

  /* ---------- نموذج إنشاء حساب ---------- */
  function initSignupForm() {
    var form = document.getElementById("signupForm");
    if (!form) return;

    var status = document.getElementById("formStatus");
    var submitBtn = document.getElementById("submitBtn");

    var nameField = document.getElementById("nameField");
    var emailField = document.getElementById("emailField");
    var phoneField = document.getElementById("phoneField");
    var birthdateField = document.getElementById("birthdateField");
    var nationalIdField = document.getElementById("nationalIdField");
    var idPhotoField = document.getElementById("idPhotoField");
    var passwordField = document.getElementById("passwordField");
    var confirmField = document.getElementById("confirmField");

    var nameInput = document.getElementById("fullName");
    var emailInput = document.getElementById("email");
    var phoneInput = document.getElementById("phone");
    var birthdateInput = document.getElementById("birthdate");
    var profilePhotoInput = document.getElementById("profilePhoto");
    var nationalIdInput = document.getElementById("nationalId");
    var idPhotoInput = document.getElementById("idPhoto");
    var passwordInput = document.getElementById("password");
    var confirmInput = document.getElementById("confirmPassword");
    var termsInput = document.getElementById("terms");

    function setInvalid(fieldEl, invalid) {
      fieldEl.classList.toggle("invalid", invalid);
    }

    /* ---------- التقاط الصورة الشخصية وصورة الهوية بنمط متطور (كاميرا مباشرة + سحب وإفلات) ----------
       تعطيل مؤقت (SIGNUP_PHOTOS_ENABLED = false أعلاه في الملف): يُخفى الحقلان كاملاً ولا تُهيَّأ
       واجهة الكاميرا لهما إطلاقًا، دون حذف أي كود — إعادة SIGNUP_PHOTOS_ENABLED إلى true تُعيد كل
       شيء كما كان فورًا. ---------- */
    if (!SIGNUP_PHOTOS_ENABLED) {
      var profilePhotoFieldEl = document.getElementById("profilePhotoField");
      var idPhotoFieldEl = document.getElementById("idPhotoField");
      if (profilePhotoFieldEl) profilePhotoFieldEl.style.display = "none";
      if (idPhotoFieldEl) idPhotoFieldEl.style.display = "none";
    }
    if (SIGNUP_PHOTOS_ENABLED) {
    initPhotoCaptureField({
      inputId: "profilePhoto",
      cardId: "profilePhotoCard",
      videoId: "profilePhotoVideo",
      previewImgId: "profilePhotoPreviewImg",
      canvasId: "profilePhotoCanvas",
      placeholderId: "profilePhotoPlaceholder",
      actionsIdleId: "profilePhotoActionsIdle",
      actionsLiveId: "profilePhotoActionsLive",
      actionsDoneId: "profilePhotoActionsDone",
      cameraBtnId: "profilePhotoCameraBtn",
      browseBtnId: "profilePhotoBrowseBtn",
      snapBtnId: "profilePhotoSnapBtn",
      cameraCancelBtnId: "profilePhotoCameraCancelBtn",
      retakeBtnId: "profilePhotoRetakeBtn",
      facingMode: "user",
      mirror: true,
      fileNamePrefix: "profile-photo",
    });
    initPhotoCaptureField({
      inputId: "idPhoto",
      cardId: "idPhotoCard",
      videoId: "idPhotoVideo",
      previewImgId: "idPhotoPreviewImg",
      canvasId: "idPhotoCanvas",
      placeholderId: "idPhotoPlaceholder",
      actionsIdleId: "idPhotoActionsIdle",
      actionsLiveId: "idPhotoActionsLive",
      actionsDoneId: "idPhotoActionsDone",
      cameraBtnId: "idPhotoCameraBtn",
      browseBtnId: "idPhotoBrowseBtn",
      snapBtnId: "idPhotoSnapBtn",
      cameraCancelBtnId: "idPhotoCameraCancelBtn",
      retakeBtnId: "idPhotoRetakeBtn",
      facingMode: "environment",
      mirror: false,
      fileNamePrefix: "id-photo",
    });
    }

    /* ---------- خطة الاشتراك (شهري / سنوي بخصم) ---------- */
    var planOptions = document.querySelectorAll(".plan-option");
    if (planOptions.length) {
      planOptions.forEach(function (option) {
        var radio = option.querySelector('input[type="radio"]');
        radio.addEventListener("change", function () {
          planOptions.forEach(function (o) {
            o.classList.toggle("active", o === option);
          });
        });
      });
      renderPlanPricing();
      var existingRerender = window.__rerenderPage;
      window.__rerenderPage = function () {
        if (typeof existingRerender === "function") existingRerender();
        renderPlanPricing();
      };
    }
    function getSelectedPlan() {
      var checked = document.querySelector('input[name="plan"]:checked');
      return checked ? checked.value : "monthly";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.classList.remove("show", "success", "error");

      var nameValid = nameInput.value.trim().length >= 2;
      var emailValid = isValidEmail(emailInput.value.trim());
      var usernameInput = document.getElementById("username");
      var usernameField = document.getElementById("usernameField");
      var usernameValid = !usernameInput || isValidUsername(usernameInput.value);
      var phoneValid = isValidPhone(phoneInput.value);
      var passwordValid = passwordInput.value.length >= 6;
      var confirmValid =
        confirmInput.value === passwordInput.value && confirmInput.value.length > 0;

      var birthdateRaw = birthdateInput ? birthdateInput.value : "";
      var age = birthdateRaw ? calculateAge(birthdateRaw) : null;
      var birthdateFilled = birthdateRaw !== "" && age !== null;
      var minAge = getSiteSettings().minAge || 18;
      var ageOk = birthdateFilled && age >= minAge;
      var birthdateValid = birthdateFilled && ageOk;

      var profilePhotoField = document.getElementById("profilePhotoField");
      var photoValid =
        !SIGNUP_PHOTOS_ENABLED ||
        (!!profilePhotoInput && !!profilePhotoInput.files && profilePhotoInput.files.length > 0);

      var nationalIdValid = !!nationalIdInput && nationalIdInput.value.trim().length >= 5;
      var idPhotoValid =
        !SIGNUP_PHOTOS_ENABLED ||
        (!!idPhotoInput && !!idPhotoInput.files && idPhotoInput.files.length > 0);

      setInvalid(nameField, !nameValid);
      setInvalid(emailField, !emailValid);
      if (usernameField) setInvalid(usernameField, !usernameValid);
      setInvalid(phoneField, !phoneValid);
      setInvalid(passwordField, !passwordValid);
      setInvalid(confirmField, !confirmValid);
      if (birthdateField) {
        setInvalid(birthdateField, !birthdateValid);
        var birthdateErrorMsg = document.getElementById("birthdateErrorMsg");
        if (birthdateErrorMsg) {
          birthdateErrorMsg.textContent =
            birthdateFilled && !ageOk ? t("auth.ageRequirement") : t("error.birthdate");
        }
      }
      if (profilePhotoField) {
        setInvalid(profilePhotoField, !photoValid);
      }
      if (nationalIdField) {
        setInvalid(nationalIdField, !nationalIdValid);
      }
      if (idPhotoField) {
        setInvalid(idPhotoField, !idPhotoValid);
      }

      if (
        !nameValid || !emailValid || !usernameValid || !phoneValid || !passwordValid || !confirmValid ||
        !birthdateValid || !photoValid || !nationalIdValid || !idPhotoValid
      ) {
        status.textContent = t("auth.fixErrors");
        status.classList.add("show", "error");
        return;
      }

      if (!termsInput.checked) {
        status.textContent = t("auth.agreeTermsRequired");
        status.classList.add("show", "error");
        return;
      }

      var users = getUsers();
      var email = emailInput.value.trim();
      var alreadyExists = users.some(function (u) {
        return u.email === email;
      });
      if (alreadyExists) {
        status.textContent = t("auth.emailExists");
        status.classList.add("show", "error");
        return;
      }
      var signupUsername = usernameInput ? usernameInput.value.trim() : "";
      if (signupUsername && isUsernameTaken(signupUsername, "")) {
        setInvalid(usernameField, true);
        status.textContent = t("auth.usernameExists");
        status.classList.add("show", "error");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = t("auth.creatingAccount");

      var photoPromise =
        profilePhotoInput && profilePhotoInput.files && profilePhotoInput.files.length
          ? uploadFilesOrFallback(profilePhotoInput.files, "profile-photos", "profiles").then(function (urls) {
              return urls[0] || "";
            })
          : Promise.resolve("");
      /* صورة الهوية الوطنية حساسة — تُرفع إلى bucket خاص منفصل (id-photos) يُفترض إعداده
         بصلاحيات وصول مقيَّدة (private) بخلاف صور الإعلانات والملف الشخصي العامة. */
      var idPhotoPromise =
        idPhotoInput && idPhotoInput.files && idPhotoInput.files.length
          ? uploadFilesOrFallback(idPhotoInput.files, "id-photos", "id-docs").then(function (urls) {
              return urls[0] || "";
            })
          : Promise.resolve("");
      /* تُشفَّر كلمة المرور محليًا (PBKDF2) قبل أي تخزين — لا تُحفظ أبدًا كنص واضح */
      var pwHashPromise = hashNewPassword(passwordInput.value);

      Promise.all([photoPromise, idPhotoPromise, pwHashPromise])
        .then(function (results) {
          var photoUrl = results[0];
          var idPhotoUrl = results[1];
          var pwHash = results[2];

          function finishLocalSignup(sbUserId) {
            var freshUsers = getUsers();
            /* قد يكون الحساب موجودًا محليًا مسبقًا (تمت إضافته عبر Supabase أعلاه) */
            var existingIdx = -1;
            for (var i = 0; i < freshUsers.length; i++) {
              if (freshUsers[i].email === email) { existingIdx = i; break; }
            }
            if (existingIdx === -1) {
              freshUsers.push({
                name: nameInput.value.trim(),
                email: email,
                username: signupUsername.toLowerCase(),
                phone: phoneInput.value.trim(),
                passwordHash: pwHash.passwordHash,
                passwordSalt: pwHash.passwordSalt,
                plan: getSelectedPlan(),
                birthdate: birthdateRaw,
                photo: photoUrl,
                nationalId: nationalIdInput.value.trim(),
                idPhoto: idPhotoUrl,
                reviewStatus: "pending",
                address: "",
                sbUserId: sbUserId || null,
                createdAt: Date.now(),
              });
              saveUsers(freshUsers);
            } else if (sbUserId && !freshUsers[existingIdx].sbUserId) {
              freshUsers[existingIdx].sbUserId = sbUserId;
              saveUsers(freshUsers);
            }
            logAuditEvent("account_submitted_for_review", email, "", email);

            status.textContent = t("auth.pendingReviewMessage");
            status.classList.remove("error");
            status.classList.add("show", "success");
            form.reset();
            setTimeout(function () {
              window.location.href = "login.html";
            }, 2200);
          }

          function signupFailed(message) {
            submitBtn.disabled = false;
            submitBtn.textContent = t("auth.signupBtn");
            status.textContent = message || t("auth.fixErrors");
            status.classList.add("show", "error");
          }

          var usernameCheck =
            signupUsername && typeof sbUsernameAvailable === "function"
              ? sbUsernameAvailable(signupUsername)
              : Promise.resolve(null);
          if (typeof sbSignUp === "function") {
            usernameCheck.then(function (available) {
              if (available === false) {
                setInvalid(usernameField, true);
                signupFailed(t("auth.usernameExists"));
                return null;
              }
              return sbSignUp({
              name: nameInput.value.trim(),
              email: email,
              username: signupUsername,
              password: passwordInput.value,
              phone: phoneInput.value.trim(),
              nationalId: nationalIdInput.value.trim(),
              idPhotoUrl: idPhotoUrl,
              photoUrl: photoUrl,
              birthdate: birthdateRaw,
              plan: getSelectedPlan(),
            });
            })
              .then(function (result) {
                if (result === null) return;
                if (result && result.ok) {
                  finishLocalSignup(result.user ? result.user.id : null);
                } else if (result && result.error && !isSupabaseConnectivityError(result.error)) {
                  /* رفض حقيقي من Supabase نفسه (مثل بريد مسجَّل مسبقًا هناك) — نعرضه للمستخدم */
                  signupFailed(mapSupabaseError(result.error));
                } else {
                  /* تعذّر الوصول الفعلي إلى قاعدة البيانات (لا إنترنت، مشروع متوقف، حجب شبكة...) —
                     Supabase يُعيد هذا كنتيجة "ناجحة" تحمل رسالة خطأ (مثل "Failed to fetch")
                     بدل رفض الوعد، فلا يكفي الاعتماد على .catch() وحده. نكمل التسجيل محليًا حتى
                     لا يتعطل إنشاء الحساب بسبب مشكلة اتصال لا علاقة لها ببيانات المستخدم */
                  finishLocalSignup();
                }
              })
              .catch(function () {
                /* تعذّر الوصول إلى قاعدة البيانات الحقيقية — نكمل محليًا حتى لا يتعطل الموقع */
                finishLocalSignup();
              });
          } else {
            finishLocalSignup();
          }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = t("auth.signupBtn");
          status.textContent = t("auth.fixErrors");
          status.classList.add("show", "error");
        });
    });

    [nameInput, emailInput, document.getElementById("username"), phoneInput, birthdateInput, profilePhotoInput, nationalIdInput, idPhotoInput, passwordInput, confirmInput].forEach(
      function (input) {
        if (!input) return;
        var evt = input.type === "file" ? "change" : "input";
        input.addEventListener(evt, function () {
          input.closest(".form-field").classList.remove("invalid");
        });
      }
    );
  }

  /* ---------- نموذج تسجيل الدخول ---------- */
  function initLoginForm() {
    var form = document.getElementById("loginForm");
    if (!form) return;

    var emailField = document.getElementById("emailField");
    var passwordField = document.getElementById("passwordField");
    var emailInput = document.getElementById("email");
    var passwordInput = document.getElementById("password");
    var status = document.getElementById("formStatus");
    var submitBtn = document.getElementById("submitBtn");

    function setInvalid(fieldEl, invalid) {
      fieldEl.classList.toggle("invalid", invalid);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.classList.remove("show", "success", "error");

      var emailValid = isValidUsername(emailInput.value.trim()) || isValidEmail(emailInput.value.trim());
      var passwordValid = passwordInput.value.length >= 6;

      setInvalid(emailField, !emailValid);
      setInvalid(passwordField, !passwordValid);

      if (!emailValid || !passwordValid) {
        status.textContent = t("auth.enterValidData");
        status.classList.add("show", "error");
        return;
      }

      var email = emailInput.value.trim();
      var password = passwordInput.value;

      function localMatch() {
        var users = getUsers();
        var idLower = email.toLowerCase();
        var candidate = users.find(function (u) {
          return u.email === email || (!!u.username && u.username.toLowerCase() === idLower);
        });
        if (!candidate) return Promise.resolve(null);
        return verifyPassword(candidate, password).then(function (ok) {
          return ok ? candidate : null;
        });
      }

      function proceedWithMatch(match) {
        if (!match) {
          logAuditEvent("login_failed", email, "", email);
          status.textContent = t("auth.wrongCredentials");
          status.classList.add("show", "error");
          submitBtn.disabled = false;
          submitBtn.textContent = t("auth.loginBtn");
          return;
        }

        if (getUserStatus(match) === "disabled") {
          logAuditEvent("login_blocked_disabled", email, "", email);
          status.textContent = t("auth.accountDisabled");
          status.classList.add("show", "error");
          submitBtn.disabled = false;
          submitBtn.textContent = t("auth.loginBtn");
          return;
        }

        // فورم تسجيل دخول المستخدمين منفصل تمامًا عن فورم دخول الإدارة — حسابات الإدارة
        // توجَّه لصفحتها الخاصة (admin-login.html) ولا تُسجَّل الدخول من هنا.
        if (isAdminRole(match.role)) {
          logAuditEvent("login_blocked_admin_wrong_form", email, "", email);
          status.textContent = t("auth.useAdminLogin");
          status.classList.add("show", "error");
          submitBtn.disabled = false;
          submitBtn.textContent = t("auth.loginBtn");
          return;
        }

        var stage = getAccountStage(match);
        if (stage === "pending_review") {
          logAuditEvent("login_blocked_pending_review", email, "", email);
          status.textContent = t("auth.accountPendingReview");
          status.classList.add("show", "error");
          submitBtn.disabled = false;
          submitBtn.textContent = t("auth.loginBtn");
          return;
        }
        if (stage === "rejected") {
          logAuditEvent("login_blocked_rejected", email, "", email);
          status.textContent = t("auth.accountRejected") + (match.rejectionReason ? " — " + match.rejectionReason : "");
          status.classList.add("show", "error");
          submitBtn.disabled = false;
          submitBtn.textContent = t("auth.loginBtn");
          return;
        }

        setTimeout(function () {
          status.textContent = t("auth.loginSuccess");
          status.classList.remove("error");
          status.classList.add("show", "success");
          setSession(match.email);
          updateUserRecord(match.email, { lastLoginAt: Date.now() });
          logAuditEvent("login_success", match.email, "");
          setTimeout(function () {
            window.location.href = "index.html";
          }, 700);
        }, 700);
      }

      submitBtn.disabled = true;
      submitBtn.textContent = t("auth.loggingIn");

      if (typeof sbSignIn === "function") {
        sbSignIn(email, password)
          .then(function (result) {
            if (result && result.ok && result.user) {
              /* نعكس بيانات المستخدم القادمة من Supabase (أعمدة snake_case) في شكل
                 كائن المستخدم المحلي (camelCase) ليستمر بقية الموقع بالعمل كما هو */
              var sbUser = result.user;
              var users = getUsers();
              var idx = -1;
              for (var i = 0; i < users.length; i++) {
                if (users[i].email === sbUser.email) { idx = i; break; }
              }
              var localUser = idx > -1 ? users[idx] : {};
              localUser.sbUserId = sbUser.id || localUser.sbUserId;
              localUser.name = sbUser.name || localUser.name;
              localUser.email = sbUser.email;
              localUser.username = sbUser.username || localUser.username;
              localUser.phone = sbUser.phone || localUser.phone;
              localUser.nationalId = sbUser.national_id || localUser.nationalId;
              localUser.idPhoto = sbUser.id_photo_url || localUser.idPhoto;
              localUser.photo = sbUser.photo_url || localUser.photo;
              localUser.birthdate = sbUser.birthdate || localUser.birthdate;
              localUser.plan = sbUser.plan || localUser.plan;
              localUser.reviewStatus = sbUser.review_status || localUser.reviewStatus || "pending";
              localUser.address = localUser.address || "";
              localUser.createdAt = localUser.createdAt || Date.now();
              /* نُخزِّن نسخة محلية مُشفَّرة من كلمة المرور (وليست كنص واضح) لتُستخدم كاحتياط
                 عند عدم توفر اتصال بـ Supabase لاحقًا */
              hashNewPassword(password).then(function (pwHash) {
                localUser.passwordHash = pwHash.passwordHash;
                localUser.passwordSalt = pwHash.passwordSalt;
                delete localUser.password;
                if (idx > -1) {
                  users[idx] = localUser;
                } else {
                  users.push(localUser);
                }
                saveUsers(users);
                proceedWithMatch(localUser);
              });
            } else {
              /* فشل الدخول عبر Supabase (بيانات خاطئة، أو لا اتصال) — نجرّب محليًا،
                 وهذا ضروري أيضًا لحسابات الإدارة التي لا تُنشأ في Supabase أصلاً */
              localMatch().then(proceedWithMatch);
            }
          })
          .catch(function () {
            localMatch().then(proceedWithMatch);
          });
      } else {
        localMatch().then(proceedWithMatch);
      }
    });

    [emailInput, passwordInput].forEach(function (input) {
      input.addEventListener("input", function () {
        input.closest(".form-field").classList.remove("invalid");
      });
    });
  }

  /* ---------- نموذج تسجيل دخول الإدارة (صفحة منفصلة تمامًا عن دخول المستخدمين) ---------- */
  function initAdminLoginForm() {
    var form = document.getElementById("adminLoginForm");
    if (!form) return;

    var emailField = document.getElementById("adminLoginEmailField");
    var passwordField = document.getElementById("adminLoginPasswordField");
    var emailInput = document.getElementById("adminLoginEmail");
    var passwordInput = document.getElementById("adminLoginPassword");
    var status = document.getElementById("adminLoginStatus");
    var submitBtn = document.getElementById("adminLoginSubmitBtn");

    function setInvalid(fieldEl, invalid) {
      fieldEl.classList.toggle("invalid", invalid);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.classList.remove("show", "success", "error");

      /* الحقل يقبل بريدًا إلكترونيًا صحيحًا، أو اسم مستخدم بديل (alias) — اسم
         المستخدم متاح فقط لحسابات الإدارة، يُعيّنه كل موظف بنفسه من صفحة الملف
         الشخصي، ولا علاقة له بتسجيل دخول المستخدمين العاديين. */
      var identifier = emailInput.value.trim();
      var identifierValid = isValidEmail(identifier) || isValidUsername(identifier);
      var passwordValid = passwordInput.value.length >= 6;

      setInvalid(emailField, !identifierValid);
      setInvalid(passwordField, !passwordValid);

      if (!identifierValid || !passwordValid) {
        status.textContent = t("auth.enterValidData");
        status.classList.add("show", "error");
        return;
      }

      var email = identifier;
      var password = passwordInput.value;
      var identifierLower = identifier.toLowerCase();
      var candidate = getUsers().find(function (u) {
        if (u.email === identifier) return true;
        return isAdminRole(u.role) && !!u.username && u.username.toLowerCase() === identifierLower;
      });

      submitBtn.disabled = true;
      submitBtn.textContent = t("auth.loggingIn");

      Promise.all([verifyPassword(candidate, password), new Promise(function (resolve) { setTimeout(resolve, 700); })]).then(function (
        results
      ) {
        var passwordOk = results[0];
        var localMatchUser = passwordOk ? candidate : null;

        /* إن لم يوجد حساب إدارة محلي مطابق، نجرّب Supabase: حساب المدير العام الافتراضي
           يُنشأ في قاعدة البيانات. sbSignIn يحوّل اسم المستخدم إلى بريده المسجَّل (دالة email_for_username). */
        function handleAdminMatch(match) {
        submitBtn.disabled = false;
        submitBtn.textContent = t("auth.loginBtn");

        if (!match) {
          logAuditEvent("admin_login_failed", email, "", email);
          status.textContent = t("auth.wrongCredentials");
          status.classList.add("show", "error");
          return;
        }
        if (getUserStatus(match) === "disabled") {
          logAuditEvent("login_blocked_disabled", email, "", email);
          status.textContent = t("auth.accountDisabled");
          status.classList.add("show", "error");
          return;
        }
        // هذه الصفحة لحسابات الإدارة فقط — حساب مستخدم عادي يُوجَّه لصفحة الدخول العادية.
        if (!isAdminRole(match.role)) {
          logAuditEvent("admin_login_blocked_not_admin", email, "", email);
          status.textContent = t("adminAuth.notAdminAccount");
          status.classList.add("show", "error");
          return;
        }

        status.textContent = t("auth.loginSuccess");
        status.classList.add("show", "success");
        setSession(match.email);
        updateUserRecord(match.email, { lastLoginAt: Date.now() });
        logAuditEvent("admin_login_success", match.email, "");
        setTimeout(function () {
          window.location.href = "admin.html";
        }, 700);
        }

        if (!localMatchUser && typeof sbSignIn === "function") {
          sbSignIn(identifier, password)
            .then(function (res) {
              if (!(res && res.ok && res.user && isAdminRole(res.user.role))) { handleAdminMatch(null); return; }
              var sbUser = res.user;
              hashNewPassword(password).then(function (pw) {
                var users = getUsers();
                var idx = -1;
                for (var i = 0; i < users.length; i++) { if (users[i].email === sbUser.email) { idx = i; break; } }
                var lu = idx > -1 ? users[idx] : { id: "sb-" + sbUser.id, createdAt: Date.now() };
                lu.sbUserId = sbUser.id;
                lu.name = sbUser.name || lu.name;
                lu.email = sbUser.email;
                lu.role = sbUser.role;
                lu.status = sbUser.status || "active";
                lu.reviewStatus = "approved";
                if (sbUser.username) lu.username = sbUser.username.toLowerCase();
                lu.passwordHash = pw.passwordHash;
                lu.passwordSalt = pw.passwordSalt;
                delete lu.password;
                if (idx > -1) users[idx] = lu; else users.push(lu);
                saveUsers(users);
                handleAdminMatch(lu);
              });
            })
            .catch(function () { handleAdminMatch(null); });
        } else {
          handleAdminMatch(localMatchUser);
        }
      });
    });

    [emailInput, passwordInput].forEach(function (input) {
      input.addEventListener("input", function () {
        input.closest(".form-field").classList.remove("invalid");
      });
    });
  }

  /* ---------- نافذة نسيت كلمة المرور (رمز مؤقت لمرة واحدة) ---------- */
  function initForgotPassword() {
    var modal = document.getElementById("forgotModal");
    if (!modal) return;

    var openLink = document.getElementById("forgotLink");
    var closeBtn = document.getElementById("closeForgot");

    var step1 = document.getElementById("forgotStep1");
    var step2 = document.getElementById("forgotStep2");
    var step3 = document.getElementById("forgotStep3");

    var identifierField = document.getElementById("identifierField");
    var identifierInput = document.getElementById("identifier");
    var sendBtn = document.getElementById("sendOtpBtn");

    var sentTo = document.getElementById("sentTo");
    var otpDisplay = document.getElementById("otpDisplay");
    var otpField = document.getElementById("otpField");
    var otpInput = document.getElementById("otpInput");
    var verifyBtn = document.getElementById("verifyOtpBtn");

    var newPasswordField = document.getElementById("newPasswordField");
    var newPasswordConfirmField = document.getElementById("newPasswordConfirmField");
    var newPasswordInput = document.getElementById("newPassword");
    var newPasswordConfirmInput = document.getElementById("newPasswordConfirm");
    var resetBtn = document.getElementById("resetPasswordBtn");

    var matchedUser = null;
    var generatedOtp = null;
    var otpUsed = false;

    function showStep(step) {
      [step1, step2, step3].forEach(function (s) {
        s.classList.remove("active");
      });
      step.classList.add("active");
    }

    function resetModal() {
      matchedUser = null;
      generatedOtp = null;
      otpUsed = false;
      identifierInput.value = "";
      otpInput.value = "";
      newPasswordInput.value = "";
      newPasswordConfirmInput.value = "";
      [identifierField, otpField, newPasswordField, newPasswordConfirmField].forEach(function (f) {
        f.classList.remove("invalid");
      });
      showStep(step1);
    }

    openLink.addEventListener("click", function (e) {
      e.preventDefault();
      resetModal();
      modal.classList.add("open");
    });
    closeBtn.addEventListener("click", function () {
      modal.classList.remove("open");
    });
    modal.addEventListener("click", function (e) {
      if (e.target === modal) modal.classList.remove("open");
    });

    sendBtn.addEventListener("click", function () {
      var value = identifierInput.value.trim();
      var user = findUser(value);

      if (!user) {
        identifierField.classList.add("invalid");
        return;
      }
      identifierField.classList.remove("invalid");

      matchedUser = user;
      otpUsed = false;
      generatedOtp = String(Math.floor(100000 + Math.random() * 900000));

      sentTo.textContent = value;
      otpDisplay.textContent = generatedOtp;
      showStep(step2);
    });

    verifyBtn.addEventListener("click", function () {
      var entered = otpInput.value.trim();
      if (otpUsed || !generatedOtp || entered !== generatedOtp) {
        otpField.classList.add("invalid");
        return;
      }
      otpField.classList.remove("invalid");
      otpUsed = true;
      showStep(step3);
    });

    resetBtn.addEventListener("click", function () {
      var pw = newPasswordInput.value;
      var pw2 = newPasswordConfirmInput.value;
      var pwValid = pw.length >= 6;
      var matchValid = pw === pw2 && pw2.length > 0;

      newPasswordField.classList.toggle("invalid", !pwValid);
      newPasswordConfirmField.classList.toggle("invalid", !matchValid);
      if (!pwValid || !matchValid) return;

      resetBtn.disabled = true;
      setUserPassword(matchedUser.email, pw).then(function () {
        generatedOtp = null;
        setSession(matchedUser.email);
        resetBtn.disabled = false;
        modal.classList.remove("open");
        /* حسابات الإدارة تُعاد توجيهها للوحة التحكم بدل الصفحة الرئيسية —
           تُطبَّق سواء فُتحت النافذة من صفحة دخول المستخدمين أو دخول الإدارة. */
        window.location.href = isAdminRole(matchedUser.role) ? "admin.html" : "index.html";
      });
    });
  }

  /* ---------- نافذة الملف الشخصي (الصورة، العنوان، كلمة المرور) ---------- */
  function initProfileModal() {
    var modal = document.getElementById("profileModal");
    if (!modal) return;

    var closeBtn = document.getElementById("closeProfile");
    var photoInput = document.getElementById("profilePhotoInput");
    var photoPreview = document.getElementById("profilePhotoPreview");
    var emailEl = document.getElementById("profileEmail");
    var statusEl = document.getElementById("profileStatus");
    var nameField = document.getElementById("profileNameField");
    var nameInput = document.getElementById("profileNameInput");
    var phoneField = document.getElementById("profilePhoneField");
    var phoneInput = document.getElementById("profilePhoneInput");
    var addressField = document.getElementById("profileAddressField");
    var addressInput = document.getElementById("profileAddress");
    var usernameField = document.getElementById("profileUsernameField");
    var usernameInput = document.getElementById("profileUsernameInput");
    var usernameFormatMsg = document.getElementById("profileUsernameFormatMsg");
    var usernameTakenMsg = document.getElementById("profileUsernameTakenMsg");
    var saveProfileInfoBtn = document.getElementById("saveProfileInfoBtn");
    var currentPasswordField = document.getElementById("currentPasswordField");
    var newPasswordField = document.getElementById("newPasswordProfileField");
    var confirmNewPasswordField = document.getElementById("confirmNewPasswordProfileField");
    var currentPasswordInput = document.getElementById("currentPassword");
    var newPasswordInput = document.getElementById("newPasswordProfile");
    var confirmNewPasswordInput = document.getElementById("confirmNewPasswordProfile");
    var savePasswordBtn = document.getElementById("savePasswordBtn");

    function setFieldInvalidEl(el, invalid) {
      if (el) el.classList.toggle("invalid", !!invalid);
    }

    function setPreview(url) {
      if (!photoPreview) return;
      if (url) {
        photoPreview.style.backgroundImage = "url('" + url + "')";
        photoPreview.classList.add("has-photo");
        photoPreview.textContent = "";
      } else {
        photoPreview.style.backgroundImage = "";
        photoPreview.classList.remove("has-photo");
        photoPreview.textContent = t("brand.initial");
      }
    }

    function loadUser() {
      var session = getSession();
      var user = session ? findUser(session) : null;
      if (!user) return null;
      if (nameInput) nameInput.value = user.name || "";
      if (emailEl) emailEl.textContent = user.email || "";
      if (phoneInput) phoneInput.value = user.phone || "";
      if (addressInput) addressInput.value = user.address || "";
      if (usernameInput) usernameInput.value = user.username || "";
      if (usernameField) usernameField.style.display = "";
      setPreview(user.photo || "");
      return user;
    }

    function openModal() {
      var user = loadUser();
      if (!user) return;
      if (statusEl) statusEl.classList.remove("show", "success", "error");
      if (currentPasswordInput) currentPasswordInput.value = "";
      if (newPasswordInput) newPasswordInput.value = "";
      if (confirmNewPasswordInput) confirmNewPasswordInput.value = "";
      [currentPasswordField, newPasswordField, confirmNewPasswordField, nameField, phoneField, addressField, usernameField].forEach(function (f) {
        if (f) f.classList.remove("invalid");
      });
      if (usernameFormatMsg) usernameFormatMsg.style.display = "none";
      if (usernameTakenMsg) usernameTakenMsg.style.display = "none";

      /* المدير العام (super_admin) يُعفى من إدخال كلمة المرور الحالية وتأكيد الجديدة —
         يكفيه إدخال كلمة المرور الجديدة مرة واحدة وحفظها فورًا */
      var isSuperAdminUser = user.role === "super_admin";
      if (currentPasswordField) currentPasswordField.style.display = isSuperAdminUser ? "none" : "";
      if (confirmNewPasswordField) confirmNewPasswordField.style.display = isSuperAdminUser ? "none" : "";

      modal.classList.add("open");
    }
    profileModalOpenFn = openModal;

    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        modal.classList.remove("open");
      });
    }
    modal.addEventListener("click", function (e) {
      if (e.target === modal) modal.classList.remove("open");
    });

    if (photoInput) {
      photoInput.addEventListener("change", function () {
        var session = getSession();
        if (!session || !photoInput.files || !photoInput.files.length) return;
        uploadFilesOrFallback(photoInput.files, "profile-photos", "profiles").then(function (urls) {
          var url = urls[0];
          updateUserRecord(session, { photo: url });
          setPreview(url);
          renderBrandAvatar();
          renderHeaderUserBadge();
          if (statusEl) {
            statusEl.textContent = t("profile.photoSaved");
            statusEl.classList.remove("error");
            statusEl.classList.add("show", "success");
          }
        });
      });
    }

    if (saveProfileInfoBtn) {
      saveProfileInfoBtn.addEventListener("click", function () {
        var session = getSession();
        var user = session ? findUser(session) : null;
        if (!user) return;

        var nameValid = nameInput.value.trim().length >= 2;
        var phoneValid = isValidPhone(phoneInput.value);
        setFieldInvalidEl(nameField, !nameValid);
        setFieldInvalidEl(phoneField, !phoneValid);

        /* اسم المستخدم هو وسيلة الدخول لكل الحسابات (وليس الإدارة فقط) */
        var usernameValue = usernameInput ? usernameInput.value.trim() : "";
        var usernameFormatValid = usernameValue === "" || isValidUsername(usernameValue);
        var usernameTaken = usernameValue !== "" && isUsernameTaken(usernameValue, user.email);
        if (usernameFormatMsg) usernameFormatMsg.style.display = !usernameFormatValid ? "block" : "none";
        if (usernameTakenMsg) usernameTakenMsg.style.display = usernameFormatValid && usernameTaken ? "block" : "none";
        setFieldInvalidEl(usernameField, !usernameFormatValid || usernameTaken);

        if (!nameValid || !phoneValid || !usernameFormatValid || usernameTaken) {
          if (statusEl) {
            statusEl.textContent = t("profile.fixInfoErrors");
            statusEl.classList.remove("success");
            statusEl.classList.add("show", "error");
          }
          return;
        }

        var patch = {
          name: nameInput.value.trim(),
          phone: phoneInput.value.trim(),
          address: addressInput.value.trim(),
        };
        patch.username = usernameValue;
        var usernameChanged = usernameValue.toLowerCase() !== (user.username || "").toLowerCase();

        function persistProfileInfo() {
          updateUserRecord(session, patch);
          /* مزامنة اسم المستخدم مع Supabase ليعمل الدخول به من أي جهاز */
          if (usernameChanged && user.sbUserId && typeof sbUpdateUsername === "function") {
            sbUpdateUsername(user.sbUserId, usernameValue).catch(function () {});
          }
          renderBrandAvatar();
          renderHeaderUserBadge();
          if (statusEl) {
            statusEl.textContent = t("profile.infoSaved");
            statusEl.classList.remove("error");
            statusEl.classList.add("show", "success");
          }
        }

        if (usernameChanged && usernameValue !== "" && user.sbUserId && typeof sbUsernameAvailable === "function") {
          sbUsernameAvailable(usernameValue).then(function (available) {
            if (available === false) {
              setFieldInvalidEl(usernameField, true);
              if (usernameTakenMsg) usernameTakenMsg.style.display = "block";
              if (statusEl) {
                statusEl.textContent = t("profile.fixInfoErrors");
                statusEl.classList.remove("success");
                statusEl.classList.add("show", "error");
              }
              return;
            }
            persistProfileInfo();
          });
        } else {
          persistProfileInfo();
        }
      });
    }

    if (savePasswordBtn) {
      savePasswordBtn.addEventListener("click", function () {
        var session = getSession();
        var user = session ? findUser(session) : null;
        if (!user) return;

        var isSuperAdminUser = user.role === "super_admin";
        var newValid = newPasswordInput.value.length >= 6;
        var confirmValid =
          isSuperAdminUser ||
          (confirmNewPasswordInput.value === newPasswordInput.value && confirmNewPasswordInput.value.length > 0);

        var currentPasswordCheck = isSuperAdminUser
          ? Promise.resolve(true)
          : verifyPassword(user, currentPasswordInput.value);

        currentPasswordCheck.then(function (currentValid) {
          currentPasswordField.classList.toggle("invalid", !currentValid);
          newPasswordField.classList.toggle("invalid", !newValid);
          confirmNewPasswordField.classList.toggle("invalid", !confirmValid);

          if (!currentValid || !newValid || !confirmValid) {
            if (statusEl) {
              statusEl.textContent = t("profile.fixPasswordErrors");
              statusEl.classList.remove("success");
              statusEl.classList.add("show", "error");
            }
            return;
          }

          setUserPassword(session, newPasswordInput.value).then(function () {
            currentPasswordInput.value = "";
            newPasswordInput.value = "";
            confirmNewPasswordInput.value = "";
            if (statusEl) {
              statusEl.textContent = t("profile.passwordSaved");
              statusEl.classList.remove("error");
              statusEl.classList.add("show", "success");
            }
          });
        });
      });
    }
  }

  /* ---------- نموذج إضافة إعلان ---------- */
  function initListingForm() {
    var form = document.getElementById("listingForm");
    if (!form) return;

    /* ---------- الحماية: يجب تسجيل الدخول لنشر إعلان ---------- */
    var authNotice = document.getElementById("authRequiredNotice");
    var subNotice = document.getElementById("subscriptionRequiredNotice");
    var listingFormCard = document.getElementById("listingFormCard");
    var currentSession = getSession();
    if (!currentSession) {
      if (authNotice) authNotice.style.display = "";
      if (subNotice) subNotice.style.display = "none";
      if (listingFormCard) listingFormCard.style.display = "none";
      return;
    }
    if (authNotice) authNotice.style.display = "none";

    /* ---------- وضع التعديل: تحرير إعلان منشور مسبقًا ---------- */
    var editingId = new URLSearchParams(window.location.search).get("edit");

    /* ---------- الحماية: يتطلب نشر إعلان جديد حسابًا مفعّلًا (تجربة أو اشتراك نشط) ---------- */
    var currentUserRecord = findUser(currentSession);
    var accountStage = getAccountStage(currentUserRecord);
    if (!editingId && accountStage !== "trial" && accountStage !== "active") {
      var subMessageEl = document.getElementById("subscriptionRequiredMessage");
      if (subMessageEl) subMessageEl.textContent = t("subscription.stageDetail." + accountStage);
      if (subNotice) subNotice.style.display = "";
      if (listingFormCard) listingFormCard.style.display = "none";
      return;
    }
    if (subNotice) subNotice.style.display = "none";
    if (listingFormCard) listingFormCard.style.display = "";

    var editingListing = editingId ? getListingById(editingId) : null;
    if (editingId && (!editingListing || editingListing.ownerEmail !== currentSession)) {
      window.location.href = "my-listings.html";
      return;
    }
    if (editingListing) {
      var introHeading = document.querySelector(".listing-intro h1");
      var introSub = document.querySelector(".listing-intro p");
      if (introHeading) {
        introHeading.removeAttribute("data-i18n");
        introHeading.textContent = t("listingPage.editHeading");
      }
      if (introSub) {
        introSub.removeAttribute("data-i18n");
        introSub.textContent = t("listingPage.editSub");
      }
    }

    function fillBrandSelect(selectEl, data) {
      selectEl.innerHTML = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = t("listingPage.brandChoose");
      selectEl.appendChild(placeholder);
      Object.keys(data).forEach(function (brandId) {
        var opt = document.createElement("option");
        opt.value = brandId;
        opt.textContent = getBrandLabel(data, brandId);
        selectEl.appendChild(opt);
      });
    }

    function wireDependentSelects(brandEl, modelEl, data) {
      brandEl.addEventListener("change", function () {
        modelEl.innerHTML = "";
        var brandId = brandEl.value;
        if (!brandId || !data[brandId]) {
          var ph = document.createElement("option");
          ph.value = "";
          ph.textContent = t("listingPage.modelChooseBrandFirst");
          modelEl.appendChild(ph);
          return;
        }
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = t("listingPage.modelChoose");
        modelEl.appendChild(placeholder);
        Object.keys(data[brandId].models).forEach(function (modelId) {
          var opt = document.createElement("option");
          opt.value = modelId;
          opt.textContent = getModelLabel(data, brandId, modelId);
          modelEl.appendChild(opt);
        });
      });
    }

    function fillYearSelect(selectEl) {
      var currentYear = new Date().getFullYear();
      for (var y = currentYear; y >= 1990; y--) {
        var opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        selectEl.appendChild(opt);
      }
    }

    var carBrand = document.getElementById("carBrand");
    var carModel = document.getElementById("carModel");
    var carYear = document.getElementById("carYear");
    var motoBrand = document.getElementById("motoBrand");
    var motoModel = document.getElementById("motoModel");
    var motoYear = document.getElementById("motoYear");

    fillBrandSelect(carBrand, CAR_DATA);
    fillBrandSelect(motoBrand, MOTO_DATA);
    wireDependentSelects(carBrand, carModel, CAR_DATA);
    wireDependentSelects(motoBrand, motoModel, MOTO_DATA);

    /* ---------- تحديث نصوص القوائم عند تبديل اللغة ---------- */
    function refreshBrandModelLabels() {
      [
        [carBrand, CAR_DATA],
        [motoBrand, MOTO_DATA],
      ].forEach(function (pair) {
        var selectEl = pair[0],
          data = pair[1];
        Array.prototype.forEach.call(selectEl.options, function (opt) {
          if (opt.value && data[opt.value]) {
            opt.textContent = getBrandLabel(data, opt.value);
          } else if (!opt.value) {
            opt.textContent = t("listingPage.brandChoose");
          }
        });
      });
      [
        [carBrand, carModel, CAR_DATA],
        [motoBrand, motoModel, MOTO_DATA],
      ].forEach(function (triple) {
        var brandEl = triple[0],
          modelEl = triple[1],
          data = triple[2];
        var brandId = brandEl.value;
        Array.prototype.forEach.call(modelEl.options, function (opt) {
          if (opt.value && brandId && data[brandId] && data[brandId].models[opt.value]) {
            opt.textContent = getModelLabel(data, brandId, opt.value);
          } else if (!opt.value) {
            opt.textContent = brandId ? t("listingPage.modelChoose") : t("listingPage.modelChooseBrandFirst");
          }
        });
      });
    }
    fillYearSelect(carYear);
    fillYearSelect(motoYear);

    /* ============================================================
       حقن الفئات المخصّصة (التي أضافها المدير العام من لوحة التحكم) في منتقي الفئة
       وبناء مجموعة حقول ديناميكية لكل واحدة منها — دون لمس الفئات الخمس الأساسية
       الموجودة أصلاً في هذا الملف بأي شكل، حتى لا يتأثر سلوكها القائم إطلاقًا.
       ============================================================ */
    var categoryPickerEl = document.getElementById("categoryPicker");
    var detailsWrapperForCustom = document.getElementById("detailsWrapper");
    var customCategoryDefs = getCustomCategories();
    var customFieldGroupEls = {};

    function buildCustomFieldInputEl(field) {
      var wrap = document.createElement("div");
      wrap.className = "form-field";
      wrap.id = field.key + "Field";
      if (field.type === "text") wrap.style.gridColumn = "1 / -1";

      var label = document.createElement("label");
      label.setAttribute("for", field.key);
      label.textContent = (currentLang === "ar" ? field.labelAr : field.labelEn) || field.key;
      wrap.appendChild(label);

      var inputEl;
      if (field.type === "select") {
        inputEl = document.createElement("select");
        var chooseOpt = document.createElement("option");
        chooseOpt.value = "";
        chooseOpt.textContent = t("field.choose");
        inputEl.appendChild(chooseOpt);
        (field.options || []).forEach(function (o) {
          var optEl = document.createElement("option");
          optEl.value = o.value;
          optEl.textContent = (currentLang === "ar" ? o.labelAr : o.labelEn) || o.value;
          inputEl.appendChild(optEl);
        });
      } else if (field.type === "year") {
        inputEl = document.createElement("select");
        var anyOpt = document.createElement("option");
        anyOpt.value = "";
        anyOpt.textContent = t("listingPage.yearChoose");
        inputEl.appendChild(anyOpt);
        var curY = new Date().getFullYear();
        for (var y = curY + 1; y >= 1990; y--) {
          var yOpt = document.createElement("option");
          yOpt.value = String(y);
          yOpt.textContent = String(y);
          inputEl.appendChild(yOpt);
        }
      } else if (field.type === "number") {
        inputEl = document.createElement("input");
        inputEl.type = "number";
        inputEl.min = "0";
      } else {
        inputEl = document.createElement("input");
        inputEl.type = "text";
      }
      inputEl.id = field.key;
      wrap.appendChild(inputEl);

      var errEl = document.createElement("span");
      errEl.className = "error-msg";
      errEl.textContent = t("listingPage.customFieldRequiredError");
      wrap.appendChild(errEl);

      if (field.internal) {
        var hint = document.createElement("span");
        hint.className = "hint";
        hint.textContent = t("listingPage.internalOnlyHintProperty");
        wrap.appendChild(hint);
      }
      return wrap;
    }

    function buildCustomCategoryFieldGroup(catDef) {
      var group = document.createElement("div");
      group.className = "field-group";
      group.id = "group-" + catDef.id;

      var titleEl = document.createElement("div");
      titleEl.className = "form-section-title";
      titleEl.textContent = getCategoryLabel(catDef.id);
      group.appendChild(titleEl);

      var grid = document.createElement("div");
      grid.className = "form-grid-2";
      catDef.fields.forEach(function (f) {
        grid.appendChild(buildCustomFieldInputEl(f));
      });
      group.appendChild(grid);
      return group;
    }

    if (categoryPickerEl && !categoryPickerEl.dataset.customCategoriesInjected) {
      categoryPickerEl.dataset.customCategoriesInjected = "1";
      customCategoryDefs.forEach(function (catDef) {
        var opt = document.createElement("div");
        opt.className = "category-option";
        opt.setAttribute("data-category", catDef.id);
        var emoji = document.createElement("span");
        emoji.className = "cat-emoji";
        emoji.textContent = catDef.icon || "•";
        var nameSpan = document.createElement("span");
        nameSpan.setAttribute("data-cat-name", catDef.id);
        nameSpan.textContent = getCategoryLabel(catDef.id);
        opt.appendChild(emoji);
        opt.appendChild(nameSpan);
        categoryPickerEl.appendChild(opt);

        var groupEl = buildCustomCategoryFieldGroup(catDef);
        customFieldGroupEls[catDef.id] = groupEl;
        var anchor = document.getElementById("group-motorcycle");
        if (anchor && anchor.parentNode) {
          anchor.parentNode.insertBefore(groupEl, anchor.nextSibling);
        } else if (detailsWrapperForCustom) {
          detailsWrapperForCustom.appendChild(groupEl);
        }
      });
    }

    var categoryOptions = document.querySelectorAll(".category-option");
    var fieldGroups = {
      land: document.getElementById("group-land"),
      residential: document.getElementById("group-residential"),
      commercial: document.getElementById("group-commercial"),
      car: document.getElementById("group-car"),
      motorcycle: document.getElementById("group-motorcycle"),
    };
    customCategoryDefs.forEach(function (catDef) {
      fieldGroups[catDef.id] = document.getElementById("group-" + catDef.id);
    });
    var detailsWrapper = document.getElementById("detailsWrapper");
    var offerTypeField = document.getElementById("offerTypeField");
    var selectedCategory = "";

    categoryOptions.forEach(function (opt) {
      opt.addEventListener("click", function () {
        categoryOptions.forEach(function (o) {
          o.classList.remove("active");
        });
        opt.classList.add("active");
        selectedCategory = opt.dataset.category;
        document.getElementById("categoryField").classList.remove("invalid");

        Object.keys(fieldGroups).forEach(function (key) {
          fieldGroups[key].classList.toggle("active", key === selectedCategory);
        });

        // لا يوجد نوع عرض (بيع/إيجار) لقطع الأراضي
        if (offerTypeField) {
          offerTypeField.style.display = selectedCategory === "land" ? "none" : "";
          offerTypeField.classList.remove("invalid");
        }

        // إظهار بقية الحقول فقط بعد اختيار نوع الإعلان
        if (detailsWrapper) detailsWrapper.classList.add("active");
      });
    });

    var status = document.getElementById("formStatus");
    var submitBtn = document.getElementById("submitBtn");

    /* تعليق مؤقت لإلزامية الصورة (LISTING_PHOTOS_REQUIRED أعلاه بالملف): يبدّل تسمية الحقل
       وتلميحه إلى الصيغة "اختياري" الموجودة أصلًا في قاموس الترجمة، دون حذف أي كود — إعادة
       القيمة إلى true تُعيد صيغة "مطلوب" تلقائيًا. */
    if (!LISTING_PHOTOS_REQUIRED) {
      var photosLabelEl = document.querySelector('#photosField label[for="photos"]');
      var photosHintStaticEl = document.querySelector("#photosField .hint");
      if (photosLabelEl) {
        photosLabelEl.setAttribute("data-i18n", "listingPage.photosLabel");
        photosLabelEl.textContent = t("listingPage.photosLabel");
      }
      if (photosHintStaticEl) {
        photosHintStaticEl.setAttribute("data-i18n", "listingPage.photosHint");
        photosHintStaticEl.textContent = t("listingPage.photosHint");
      }
    }

    /* ---------- رفع الصور: اختيار تقليدي من الجهاز أو سحب وإفلات ---------- */
    (function initPhotoDropzone() {
      var input = document.getElementById("photos");
      var dropzone = document.getElementById("photosDropzone");
      var preview = document.getElementById("selectedPhotosPreview");
      if (!input || !dropzone) return;

      function renderSelectedPreview() {
        if (!preview) return;
        preview.innerHTML = "";
        if (!input.files || !input.files.length) return;
        readFilesAsDataURLs(input.files).then(function (urls) {
          preview.innerHTML = "";
          urls.forEach(function (src) {
            var img = document.createElement("img");
            img.src = src;
            preview.appendChild(img);
          });
        });
      }

      input.addEventListener("change", function () {
        var field = input.closest(".form-field");
        if (field) field.classList.remove("invalid");
        renderSelectedPreview();
      });

      /* بعض متصفحات الجوال لا تُوصِّل نقرة المستخدم إلى الحقل الشفاف (opacity:0) المُغطّي
         للمربع بشكل موثوق (حسب طبقات العرض/التمرير على الجهاز الفعلي)، فيبدو الضغط وكأنه
         بلا أي استجابة. لضمان فتح الكاميرا/مدير الملفات دائمًا، نستدعي input.click() صراحةً
         من داخل معالج نقر مباشر على صندوق الرفع نفسه — وهذا استدعاء متزامن ينبع مباشرة من
         إيماءة المستخدم الحقيقية، فيعمل بشكل موثوق على كل المتصفحات (بعكس أي استدعاء غير
         مباشر/مؤجَّل لـ .click() الذي تتجاهله متصفحات الجوال بصمت). */
      dropzone.addEventListener("click", function (e) {
        if (e.target !== input) {
          input.click();
        }
      });

      ["dragenter", "dragover"].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add("dragover");
        });
      });
      ["dragleave", "dragend"].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove("dragover");
        });
      });
      dropzone.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        var imgFiles = Array.prototype.filter.call(files, function (f) {
          return f.type.indexOf("image/") === 0;
        });
        if (!imgFiles.length) return;
        var dt = new DataTransfer();
        imgFiles.forEach(function (f) {
          dt.items.add(f);
        });
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    })();

    /* ---------- تنسيق حقول السعر وعداد الكيلومترات بفواصل الآلاف ---------- */
    [document.getElementById("price"), document.getElementById("carOdometer"), document.getElementById("motoOdometer")].forEach(
      attachThousandsFormatting
    );

    /* ---------- تعبئة الفورم ببيانات الإعلان عند التعديل ---------- */
    var currentPhotosPreview = document.getElementById("currentPhotosPreview");
    function renderCurrentPhotosPreview() {
      if (!currentPhotosPreview || !editingListing) return;
      currentPhotosPreview.innerHTML = "";
      var photos = editingListing.photos || [];
      if (!photos.length) return;
      var label = document.createElement("div");
      label.className = "current-photos-label";
      label.textContent = t("listingPage.currentPhotosLabel");
      currentPhotosPreview.appendChild(label);
      var strip = document.createElement("div");
      strip.className = "current-photos-strip";
      photos.forEach(function (src) {
        var img = document.createElement("img");
        img.src = src;
        strip.appendChild(img);
      });
      currentPhotosPreview.appendChild(strip);
    }

    if (editingListing) {
      var catOpt = document.querySelector('.category-option[data-category="' + editingListing.category + '"]');
      if (catOpt) catOpt.click();

      if (editingListing.offerType) {
        var offerTypeSelect = document.getElementById("offerType");
        if (offerTypeSelect) offerTypeSelect.value = editingListing.offerType;
      }
      document.getElementById("price").value = editingListing.price != null ? formatNumberWithSeparators(editingListing.price) : "";
      document.getElementById("city").value = editingListing.city || "";

      if (editingListing.category === "land") {
        document.getElementById("landArea").value = editingListing.landArea || "";
        document.getElementById("landType").value = editingListing.landType || "";
        document.getElementById("landAddress").value = editingListing.landAddress || "";
        document.getElementById("landNumber").value = editingListing.landNumber || "";
      } else if (editingListing.category === "residential") {
        document.getElementById("resArea").value = editingListing.resArea || "";
        document.getElementById("resRooms").value = editingListing.resRooms || "";
        document.getElementById("resBaths").value = editingListing.resBaths || "";
        document.getElementById("resAddress").value = editingListing.resAddress || "";
        document.getElementById("resNumber").value = editingListing.resNumber || "";
      } else if (editingListing.category === "commercial") {
        document.getElementById("comArea").value = editingListing.comArea || "";
        document.getElementById("comType").value = editingListing.comType || "";
        document.getElementById("comAddress").value = editingListing.comAddress || "";
        document.getElementById("comNumber").value = editingListing.comNumber || "";
      } else if (editingListing.category === "car") {
        carBrand.value = editingListing.carBrand || "";
        carBrand.dispatchEvent(new Event("change"));
        carModel.value = editingListing.carModel || "";
        carYear.value = editingListing.carYear || "";
        document.getElementById("carOdometer").value = editingListing.carOdometer ? formatNumberWithSeparators(editingListing.carOdometer) : "";
        document.getElementById("carRegistration").value = editingListing.carRegistration || "";
      } else if (editingListing.category === "motorcycle") {
        motoBrand.value = editingListing.motoBrand || "";
        motoBrand.dispatchEvent(new Event("change"));
        motoModel.value = editingListing.motoModel || "";
        motoYear.value = editingListing.motoYear || "";
        document.getElementById("motoOdometer").value = editingListing.motoOdometer ? formatNumberWithSeparators(editingListing.motoOdometer) : "";
      } else if (isCustomCategory(editingListing.category)) {
        var editingCatDef = findCustomCategory(editingListing.category);
        (editingCatDef ? editingCatDef.fields : []).forEach(function (f) {
          var el = document.getElementById(f.key);
          if (!el) return;
          var raw = editingListing[f.key];
          el.value = raw !== undefined && raw !== null ? raw : "";
        });
      }

      document.getElementById("description").value = editingListing.description || "";

      submitBtn.removeAttribute("data-i18n");
      submitBtn.textContent = t("listingPage.saveChangesBtn");

      var photosHintEl = document.querySelector("#photosField .hint");
      if (photosHintEl) {
        photosHintEl.removeAttribute("data-i18n");
        photosHintEl.textContent = t("listingPage.photosHintEdit");
      }

      renderCurrentPhotosPreview();

      window.__rerenderPage = function () {
        if (introHeading) introHeading.textContent = t("listingPage.editHeading");
        if (introSub) introSub.textContent = t("listingPage.editSub");
        submitBtn.textContent = t("listingPage.saveChangesBtn");
        if (photosHintEl) photosHintEl.textContent = t("listingPage.photosHintEdit");
        renderCurrentPhotosPreview();
        refreshBrandModelLabels();
        relabelCustomCategoryFieldGroups();
      };
    } else {
      window.__rerenderPage = function () {
        refreshBrandModelLabels();
        relabelCustomCategoryFieldGroups();
      };
    }

    /* تحديث نصوص حقول الفئات المخصّصة (العناوين، تسميات الحقول، خيارات القوائم) عند
       تبديل اللغة — القيم المُدخَلة تبقى كما هي، فقط النصوص تتغيّر */
    function relabelCustomCategoryFieldGroups() {
      customCategoryDefs.forEach(function (catDef) {
        var groupEl = customFieldGroupEls[catDef.id];
        if (!groupEl) return;
        var titleEl = groupEl.querySelector(".form-section-title");
        if (titleEl) titleEl.textContent = getCategoryLabel(catDef.id);
        catDef.fields.forEach(function (f) {
          var labelEl = groupEl.querySelector('label[for="' + f.key + '"]');
          if (labelEl) labelEl.textContent = (currentLang === "ar" ? f.labelAr : f.labelEn) || f.key;
          if (f.type === "select") {
            var selectEl = document.getElementById(f.key);
            if (selectEl) {
              Array.prototype.forEach.call(selectEl.options, function (optEl) {
                if (!optEl.value) return;
                var optDef = (f.options || []).find(function (o) { return o.value === optEl.value; });
                if (optDef) optEl.textContent = (currentLang === "ar" ? optDef.labelAr : optDef.labelEn) || optDef.value;
              });
            }
          }
        });
      });
    }

    function setInvalid(id, invalid) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle("invalid", invalid);
    }
    function val(id) {
      return document.getElementById(id).value.trim();
    }
    function numVal(id) {
      return stripSeparators(document.getElementById(id).value);
    }
    function setFieldMessage(errorMsgId, key) {
      var el = document.getElementById(errorMsgId);
      if (el) el.textContent = t(key);
    }

    /* ---------- منع تكرار نشر نفس السيارة أو نفس العقار/الأرض ----------
       يتم تخزين أرقام الاستمارة/العقار كمفاتيح رئيسية فريدة محليًا،
       ولا تُعرض هذه الأرقام للعميل في أي مكان بالموقع. */
    var USED_IDS_KEY = "eqari_used_ids";

    function getUsedIds() {
      try {
        return (
          JSON.parse(localStorage.getItem(USED_IDS_KEY)) || {
            car: {},
            land: {},
            residential: {},
            commercial: {},
          }
        );
      } catch (e) {
        return { car: {}, land: {}, residential: {}, commercial: {} };
      }
    }
    function normalizeId(value) {
      return value.trim().replace(/\s+/g, "").toUpperCase();
    }
    function isIdUsed(bucket, id) {
      var data = getUsedIds();
      return !!(data[bucket] && data[bucket][normalizeId(id)]);
    }
    function markIdUsed(bucket, id) {
      var data = getUsedIds();
      if (!data[bucket]) data[bucket] = {};
      data[bucket][normalizeId(id)] = true;
      localStorage.setItem(USED_IDS_KEY, JSON.stringify(data));
    }
    function freeUsedId(bucket, id) {
      var data = getUsedIds();
      if (data[bucket]) {
        delete data[bucket][normalizeId(id)];
        localStorage.setItem(USED_IDS_KEY, JSON.stringify(data));
      }
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.classList.remove("show", "success", "error");
      var allValid = true;

      if (!selectedCategory) {
        setInvalid("categoryField", true);
        allValid = false;
      } else {
        setInvalid("categoryField", false);
      }

      // لا يوجد حقل نوع عرض لقطع الأراضي
      if (selectedCategory !== "land") {
        var offerValid = val("offerType") !== "";
        setInvalid("offerTypeField", !offerValid);
        if (!offerValid) allValid = false;
      }

      var priceValid = parseFloat(numVal("price")) > 0;
      setInvalid("priceField", !priceValid);
      if (!priceValid) allValid = false;

      var cityValid = val("city") !== "";
      setInvalid("cityField", !cityValid);
      if (!cityValid) allValid = false;

      var pendingUsedId = null;

      if (selectedCategory === "land") {
        var a1 = val("landArea") !== "" && parseFloat(val("landArea")) > 0;
        var t1 = val("landType") !== "";
        var addr1 = val("landAddress") !== "";
        setInvalid("landAreaField", !a1);
        setInvalid("landTypeField", !t1);
        setInvalid("landAddressField", !addr1);

        var landNumberRaw = val("landNumber");
        var landNumEmpty = landNumberRaw === "";
        var landNumOriginal = editingListing ? editingListing.landNumber || null : null;
        var landNumUnchanged = landNumOriginal !== null && normalizeId(landNumberRaw) === normalizeId(landNumOriginal);
        var landNumDup = !landNumEmpty && !landNumUnchanged && isIdUsed("land", landNumberRaw);
        var landNumValid = !landNumEmpty && !landNumDup;
        setInvalid("landNumberField", !landNumValid);
        setFieldMessage(
          "landNumberErrorMsg",
          landNumDup ? "listingPage.landNumberDuplicate" : "listingPage.landNumberError"
        );
        if (landNumValid) pendingUsedId = { bucket: "land", id: landNumberRaw, previousId: landNumOriginal };

        if (!a1 || !t1 || !addr1 || !landNumValid) allValid = false;
      } else if (selectedCategory === "residential") {
        var a2 = val("resArea") !== "" && parseFloat(val("resArea")) > 0;
        var r2 = val("resRooms") !== "";
        var b2 = val("resBaths") !== "";
        var addr2 = val("resAddress") !== "";
        setInvalid("resAreaField", !a2);
        setInvalid("resRoomsField", !r2);
        setInvalid("resBathsField", !b2);
        setInvalid("resAddressField", !addr2);

        var resNumberRaw = val("resNumber");
        var resNumEmpty = resNumberRaw === "";
        var resNumOriginal = editingListing ? editingListing.resNumber || null : null;
        var resNumUnchanged = resNumOriginal !== null && normalizeId(resNumberRaw) === normalizeId(resNumOriginal);
        var resNumDup = !resNumEmpty && !resNumUnchanged && isIdUsed("residential", resNumberRaw);
        var resNumValid = !resNumEmpty && !resNumDup;
        setInvalid("resNumberField", !resNumValid);
        setFieldMessage(
          "resNumberErrorMsg",
          resNumDup ? "listingPage.propertyNumberDuplicate" : "listingPage.propertyNumberError"
        );
        if (resNumValid) pendingUsedId = { bucket: "residential", id: resNumberRaw, previousId: resNumOriginal };

        if (!a2 || !r2 || !b2 || !addr2 || !resNumValid) allValid = false;
      } else if (selectedCategory === "commercial") {
        var a3 = val("comArea") !== "" && parseFloat(val("comArea")) > 0;
        var t3 = val("comType") !== "";
        var addr3 = val("comAddress") !== "";
        setInvalid("comAreaField", !a3);
        setInvalid("comTypeField", !t3);
        setInvalid("comAddressField", !addr3);

        var comNumberRaw = val("comNumber");
        var comNumEmpty = comNumberRaw === "";
        var comNumOriginal = editingListing ? editingListing.comNumber || null : null;
        var comNumUnchanged = comNumOriginal !== null && normalizeId(comNumberRaw) === normalizeId(comNumOriginal);
        var comNumDup = !comNumEmpty && !comNumUnchanged && isIdUsed("commercial", comNumberRaw);
        var comNumValid = !comNumEmpty && !comNumDup;
        setInvalid("comNumberField", !comNumValid);
        setFieldMessage(
          "comNumberErrorMsg",
          comNumDup ? "listingPage.propertyNumberDuplicate" : "listingPage.propertyNumberError"
        );
        if (comNumValid) pendingUsedId = { bucket: "commercial", id: comNumberRaw, previousId: comNumOriginal };

        if (!a3 || !t3 || !addr3 || !comNumValid) allValid = false;
      } else if (selectedCategory === "car") {
        var b4 = val("carBrand") !== "";
        var m4 = val("carModel") !== "";
        var y4 = val("carYear") !== "";
        var odo4 = numVal("carOdometer") !== "" && parseFloat(numVal("carOdometer")) >= 0;
        setInvalid("carBrandField", !b4);
        setInvalid("carModelField", !m4);
        setInvalid("carYearField", !y4);
        setInvalid("carOdometerField", !odo4);

        var carRegRaw = val("carRegistration");
        var carRegEmpty = carRegRaw === "";
        var carRegOriginal = editingListing ? editingListing.carRegistration || null : null;
        var carRegUnchanged = carRegOriginal !== null && normalizeId(carRegRaw) === normalizeId(carRegOriginal);
        var carRegDup = !carRegEmpty && !carRegUnchanged && isIdUsed("car", carRegRaw);
        var carRegValid = !carRegEmpty && !carRegDup;
        setInvalid("carRegistrationField", !carRegValid);
        setFieldMessage(
          "carRegistrationErrorMsg",
          carRegDup ? "listingPage.carRegistrationDuplicate" : "listingPage.carRegistrationError"
        );
        if (carRegValid) pendingUsedId = { bucket: "car", id: carRegRaw, previousId: carRegOriginal };

        if (!b4 || !m4 || !y4 || !odo4 || !carRegValid) allValid = false;
      } else if (selectedCategory === "motorcycle") {
        var b5 = val("motoBrand") !== "";
        var m5 = val("motoModel") !== "";
        var y5 = val("motoYear") !== "";
        var odo5 = numVal("motoOdometer") !== "" && parseFloat(numVal("motoOdometer")) >= 0;
        setInvalid("motoBrandField", !b5);
        setInvalid("motoModelField", !m5);
        setInvalid("motoYearField", !y5);
        setInvalid("motoOdometerField", !odo5);
        if (!b5 || !m5 || !y5 || !odo5) allValid = false;
      } else if (isCustomCategory(selectedCategory)) {
        var validatingCatDef = findCustomCategory(selectedCategory);
        (validatingCatDef ? validatingCatDef.fields : []).forEach(function (f) {
          var raw = val(f.key);
          var fieldValid = true;
          if (f.required) {
            fieldValid = raw !== "";
            if (fieldValid && f.type === "number") {
              fieldValid = raw !== "" && !isNaN(parseFloat(raw)) && parseFloat(raw) >= 0;
            }
          }
          setInvalid(f.key + "Field", !fieldValid);
          if (!fieldValid) allValid = false;
        });
      }

      var photosInput = document.getElementById("photos");
      var hasNewPhotos = !!(photosInput && photosInput.files && photosInput.files.length > 0);
      var hasExistingPhotos = !!(editingListing && editingListing.photos && editingListing.photos.length > 0);
      var photosValid = !LISTING_PHOTOS_REQUIRED || hasNewPhotos || hasExistingPhotos;
      setInvalid("photosField", !photosValid);
      if (!photosValid) allValid = false;

      if (!allValid) {
        status.textContent = t("listingPage.fixErrors");
        status.classList.add("show", "error");
        status.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = editingListing ? t("listingPage.publishing") : t("listingPage.publishing");

      var photosWorkPromise = hasNewPhotos
        ? uploadFilesOrFallback(photosInput.files, "listing-photos", "listings")
        : Promise.resolve(editingListing ? editingListing.photos : []);

      photosWorkPromise
        .then(function (photoUrls) {
          var owner = findUser(currentSession);
          var listing = {
            category: selectedCategory,
            offerType: selectedCategory === "land" ? "" : val("offerType"),
            price: parseFloat(numVal("price")),
            city: val("city"),
            description: document.getElementById("description").value.trim(),
            photos: photoUrls,
          };

          if (selectedCategory === "land") {
            listing.landArea = val("landArea");
            listing.landType = val("landType");
            listing.landAddress = val("landAddress");
            listing.landNumber = val("landNumber");
          } else if (selectedCategory === "residential") {
            listing.resArea = val("resArea");
            listing.resRooms = val("resRooms");
            listing.resBaths = val("resBaths");
            listing.resAddress = val("resAddress");
            listing.resNumber = val("resNumber");
          } else if (selectedCategory === "commercial") {
            listing.comArea = val("comArea");
            listing.comType = val("comType");
            listing.comAddress = val("comAddress");
            listing.comNumber = val("comNumber");
          } else if (selectedCategory === "car") {
            listing.carBrand = val("carBrand");
            listing.carModel = val("carModel");
            listing.carYear = val("carYear");
            listing.carOdometer = numVal("carOdometer");
            listing.carRegistration = val("carRegistration");
          } else if (selectedCategory === "motorcycle") {
            listing.motoBrand = val("motoBrand");
            listing.motoModel = val("motoModel");
            listing.motoYear = val("motoYear");
            listing.motoOdometer = numVal("motoOdometer");
          } else if (isCustomCategory(selectedCategory)) {
            var collectingCatDef = findCustomCategory(selectedCategory);
            (collectingCatDef ? collectingCatDef.fields : []).forEach(function (f) {
              listing[f.key] = val(f.key);
            });
          }

          if (pendingUsedId) {
            if (pendingUsedId.previousId && normalizeId(pendingUsedId.previousId) !== normalizeId(pendingUsedId.id)) {
              freeUsedId(pendingUsedId.bucket, pendingUsedId.previousId);
            }
            markIdUsed(pendingUsedId.bucket, pendingUsedId.id);
          }

          var finalId;
          if (editingListing) {
            finalId = editingListing.id;
            listing.ownerEmail = editingListing.ownerEmail;
            listing.ownerName = editingListing.ownerName;
            listing.createdAt = editingListing.createdAt;
            listing.status = editingListing.status || "active";
            listing.updatedAt = Date.now();
            updateListing(finalId, listing);
          } else {
            finalId = genId();
            listing.id = finalId;
            listing.ownerEmail = currentSession;
            listing.ownerName = owner ? owner.name : "";
            listing.createdAt = Date.now();
            listing.status = "active";
            addListing(listing);
          }

          status.textContent = editingListing ? t("listingPage.editSuccess") : t("listingPage.success");
          status.classList.remove("error");
          status.classList.add("show", "success");
          setTimeout(function () {
            window.location.href = "listing.html?id=" + encodeURIComponent(finalId);
          }, 800);
        })
        .catch(function (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = editingListing ? t("listingPage.saveChangesBtn") : t("listingPage.publishBtn");
          status.textContent =
            err && err.isPhotosQuotaExceeded ? t("listingPage.photosStorageQuotaError") : t("listingPage.fixErrors");
          status.classList.add("show", "error");
          status.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
  }

  /* ---------- صفحة تفاصيل الإعلان ---------- */
  function initListingDetailPage() {
    var root = document.getElementById("listingDetailRoot");
    if (!root) return;

    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");
    var listing = id ? getListingById(id) : null;

    var notFound = document.getElementById("listingNotFound");
    var content = document.getElementById("listingDetailContent");

    var viewerSession = getSession();
    var viewerUser = viewerSession ? findUser(viewerSession) : null;
    var viewerIsAdmin = viewerUser && isAdminRole(viewerUser.role);
    var viewerIsOwner = !!(listing && viewerSession === listing.ownerEmail);

    if (!listing || (listing.hidden && !viewerIsOwner && !viewerIsAdmin)) {
      if (content) content.style.display = "none";
      if (notFound) notFound.style.display = "";
      return;
    }
    if (notFound) notFound.style.display = "none";
    if (content) content.style.display = "";

    var hiddenNotice = document.getElementById("hiddenByAdminNotice");
    if (hiddenNotice) {
      hiddenNotice.style.display = listing.hidden ? "" : "none";
    }

    function renderThread(viewerEmail, otherEmail) {
      var threadWrap = document.getElementById("threadMessages");
      if (!threadWrap) return;
      threadWrap.innerHTML = "";
      var msgs = getMessages()
        .filter(function (m) {
          if (m.listingId !== listing.id) return false;
          return (
            (m.fromEmail === viewerEmail && m.toEmail === otherEmail) ||
            (m.fromEmail === otherEmail && m.toEmail === viewerEmail)
          );
        })
        .sort(function (a, b) {
          return a.createdAt - b.createdAt;
        });

      if (!msgs.length) {
        var empty = document.createElement("p");
        empty.className = "thread-empty";
        empty.textContent = t("messages.noMessagesYet");
        threadWrap.appendChild(empty);
        return;
      }
      msgs.forEach(function (m) {
        var bubble = document.createElement("div");
        bubble.className = "msg-bubble " + (m.fromEmail === viewerEmail ? "mine" : "theirs");
        var p = document.createElement("p");
        p.textContent = m.body;
        bubble.appendChild(p);
        threadWrap.appendChild(bubble);
      });
      threadWrap.scrollTop = threadWrap.scrollHeight;
    }

    function renderContactPanel() {
      var session = getSession();
      var ownAdNote = document.getElementById("ownAdNote");
      var loginPrompt = document.getElementById("loginToMessage");
      var messageForm = document.getElementById("messageFormWrap");
      var threadWrap = document.getElementById("threadMessages");

      [ownAdNote, loginPrompt, messageForm].forEach(function (el) {
        if (el) el.style.display = "none";
      });
      if (threadWrap) threadWrap.innerHTML = "";

      if (!session) {
        if (loginPrompt) loginPrompt.style.display = "";
        return;
      }
      if (session === listing.ownerEmail) {
        if (ownAdNote) ownAdNote.style.display = "";
        return;
      }
      if (messageForm) messageForm.style.display = "";
      renderThread(session, listing.ownerEmail);
    }

    function render() {
      var titleEl = document.getElementById("detailTitle");
      if (titleEl) titleEl.textContent = buildListingTitle(listing);
      document.title = buildListingTitle(listing) + " | " + t("brand.name");

      var priceEl = document.getElementById("detailPrice");
      if (priceEl) priceEl.textContent = formatPrice(listing);

      var locEl = document.getElementById("detailLoc");
      if (locEl) locEl.textContent = buildListingLocation(listing);

      var verifiedEl = document.getElementById("detailVerifiedBadge");
      if (verifiedEl) {
        if (isSellerVerified(listing.ownerEmail)) {
          verifiedEl.style.display = "";
          verifiedEl.title = t("seller.verifiedBadgeTooltip");
          verifiedEl.innerHTML = "<span class='verified-seller-check'>&#10003;</span> " + t("seller.verifiedBadge");
        } else {
          verifiedEl.style.display = "none";
          verifiedEl.innerHTML = "";
        }
      }

      var catEl = document.getElementById("detailCategory");
      if (catEl) catEl.textContent = getCategoryLabel(listing.category);

      var soldEl = document.getElementById("detailSoldBadge");
      var sold = getListingStatus(listing) === "sold";
      if (soldEl) {
        soldEl.style.display = sold ? "" : "none";
        soldEl.textContent = t("listing.sold");
      }

      var featuredEl = document.getElementById("detailFeaturedBadge");
      if (featuredEl) {
        var showFeatured = !!listing.featured && !sold;
        featuredEl.style.display = showFeatured ? "" : "none";
        featuredEl.textContent = showFeatured ? "★ " + t("listing.featuredBadge") : "";
      }

      var specsWrap = document.getElementById("detailSpecs");
      if (specsWrap) appendSpecsToEl(specsWrap, listing);

      var descEl = document.getElementById("detailDescription");
      if (descEl) descEl.textContent = listing.description || t("listingPage.noDescription");

      var mainPhoto = document.getElementById("mainPhoto");
      var thumbStrip = document.getElementById("thumbStrip");
      var noPhotoPlaceholder = document.getElementById("noPhotoPlaceholder");
      var photos = listing.photos && listing.photos.length ? listing.photos : [];

      if (thumbStrip) thumbStrip.innerHTML = "";
      if (photos.length && mainPhoto) {
        mainPhoto.src = photos[0];
        mainPhoto.style.display = "";
        if (noPhotoPlaceholder) noPhotoPlaceholder.style.display = "none";
        photos.forEach(function (src, idx) {
          var thumb = document.createElement("img");
          thumb.src = src;
          thumb.className = "thumb" + (idx === 0 ? " active" : "");
          thumb.addEventListener("click", function () {
            mainPhoto.src = src;
            thumbStrip.querySelectorAll(".thumb").forEach(function (th) {
              th.classList.remove("active");
            });
            thumb.classList.add("active");
          });
          if (thumbStrip) thumbStrip.appendChild(thumb);
        });
      } else {
        if (mainPhoto) mainPhoto.style.display = "none";
        if (noPhotoPlaceholder) noPhotoPlaceholder.style.display = "";
      }

      renderContactPanel();
      renderFavoriteButton();
      renderSellerRating();
      renderReviews();
      refreshReviewsFromSupabase(listing.ownerEmail, function () {
        renderSellerRating();
        renderReviews();
      });
    }

    function renderFavoriteButton() {
      var btn = document.getElementById("detailFavoriteBtn");
      if (!btn) return;
      var session = getSession();
      if (!session) {
        btn.style.display = "none";
        return;
      }
      btn.style.display = "";
      var fav = isFavorite(session, listing.id);
      btn.classList.toggle("active", fav);
      btn.textContent = fav ? "♥" : "♡";
      btn.setAttribute("aria-label", t("favorites.toggleBtn"));
    }

    function renderSellerRating() {
      var wrap = document.getElementById("sellerRatingSummary");
      if (!wrap) return;
      var summary = getSellerRatingSummary(listing.ownerEmail);
      if (!summary.count) {
        wrap.textContent = t("reviews.noReviewsYet");
      } else {
        wrap.textContent = "★ " + summary.average.toFixed(1) + " (" + summary.count + " " + t("reviews.reviewsCountSuffix") + ")";
      }
    }

    var selectedReviewRating = 0;
    function updateStarInputDisplay() {
      var stars = document.querySelectorAll("#reviewStarInput span");
      stars.forEach(function (s) {
        var v = Number(s.getAttribute("data-value"));
        s.textContent = v <= selectedReviewRating ? "★" : "☆";
      });
    }

    function renderReviews() {
      var panel = document.getElementById("reviewsPanel");
      var listEl = document.getElementById("reviewsList");
      var formWrap = document.getElementById("reviewFormWrap");
      var loginNote = document.getElementById("reviewLoginNote");
      if (!panel) return;
      panel.style.display = "";

      var session = getSession();
      var reviews = getReviewsForSeller(listing.ownerEmail);
      listEl.innerHTML = "";
      if (!reviews.length) {
        var empty = document.createElement("p");
        empty.className = "thread-empty";
        empty.textContent = t("reviews.noReviewsYet");
        listEl.appendChild(empty);
      } else {
        reviews.slice(0, 20).forEach(function (r) {
          var item = document.createElement("div");
          item.className = "review-item";
          var starsEl = document.createElement("div");
          starsEl.className = "review-item-stars";
          starsEl.textContent = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
          item.appendChild(starsEl);
          if (r.comment) {
            var commentEl = document.createElement("p");
            commentEl.className = "review-item-comment";
            commentEl.textContent = r.comment;
            item.appendChild(commentEl);
          }
          var meta = document.createElement("div");
          meta.className = "review-item-meta";
          var reviewer = findUser(r.reviewerEmail);
          meta.textContent = (reviewer ? reviewer.name : r.reviewerEmail) + " · " + new Date(r.createdAt).toLocaleDateString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US");
          item.appendChild(meta);
          listEl.appendChild(item);
        });
      }

      if (!session) {
        if (formWrap) formWrap.style.display = "none";
        if (loginNote) loginNote.style.display = "";
        return;
      }
      if (session === listing.ownerEmail) {
        if (formWrap) formWrap.style.display = "none";
        if (loginNote) loginNote.style.display = "none";
        return;
      }
      if (loginNote) loginNote.style.display = "none";
      if (formWrap) formWrap.style.display = "";

      var existing = getReviewByReviewer(listing.ownerEmail, session);
      selectedReviewRating = existing ? existing.rating : 0;
      updateStarInputDisplay();
      var commentInput = document.getElementById("reviewComment");
      if (commentInput) commentInput.value = existing ? existing.comment : "";
    }

    var favoriteBtn = document.getElementById("detailFavoriteBtn");
    if (favoriteBtn) {
      favoriteBtn.addEventListener("click", function () {
        var session = getSession();
        if (!session) {
          window.location.href = "login.html";
          return;
        }
        toggleFavorite(session, listing.id);
        renderFavoriteButton();
      });
    }

    var starInputWrap = document.getElementById("reviewStarInput");
    if (starInputWrap) {
      starInputWrap.querySelectorAll("span").forEach(function (s) {
        s.addEventListener("click", function () {
          selectedReviewRating = Number(s.getAttribute("data-value"));
          updateStarInputDisplay();
        });
      });
    }

    var submitReviewBtn = document.getElementById("submitReviewBtn");
    if (submitReviewBtn) {
      submitReviewBtn.addEventListener("click", function () {
        var session = getSession();
        if (!session || session === listing.ownerEmail) return;
        if (!selectedReviewRating) {
          window.alert(t("reviews.selectRatingAlert"));
          return;
        }
        var comment = document.getElementById("reviewComment").value.trim();
        submitSellerReview(listing.ownerEmail, session, selectedReviewRating, comment);
        renderReviews();
        renderSellerRating();
      });
    }

    var msgForm = document.getElementById("messageForm");
    if (msgForm) {
      var msgContactWarning = document.getElementById("messageContactWarning");
      var msgTextarea = document.getElementById("messageText");
      if (msgTextarea) {
        msgTextarea.addEventListener("input", function () {
          if (msgContactWarning) msgContactWarning.classList.remove("show");
        });
      }
      msgForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var textarea = document.getElementById("messageText");
        var text = textarea.value.trim();
        if (!text) return;
        if (containsContactInfo(text)) {
          if (msgContactWarning) msgContactWarning.classList.add("show");
          return;
        }
        if (msgContactWarning) msgContactWarning.classList.remove("show");
        sendMessage({
          listingId: listing.id,
          fromEmail: getSession(),
          toEmail: listing.ownerEmail,
          body: text,
        });
        textarea.value = "";
        renderThread(getSession(), listing.ownerEmail);
      });
    }

    var reportLink = document.getElementById("reportListingLink");
    var reportFormWrap = document.getElementById("reportFormWrap");
    var submitReportBtn = document.getElementById("submitReportBtn");
    if (reportLink) {
      reportLink.addEventListener("click", function (e) {
        e.preventDefault();
        var session = getSession();
        if (!session) {
          window.location.href = "login.html";
          return;
        }
        if (reportFormWrap) reportFormWrap.style.display = reportFormWrap.style.display === "none" ? "" : "none";
      });
    }
    if (submitReportBtn) {
      submitReportBtn.addEventListener("click", function () {
        var session = getSession();
        if (!session) return;
        var reason = document.getElementById("reportReason").value;
        var details = document.getElementById("reportDetails").value.trim();
        addReport({ listingId: listing.id, reporterEmail: session, reason: reason, details: details });
        logAuditEvent("listing_reported", listing.id, reason);
        submitReportBtn.disabled = true;
        submitReportBtn.textContent = t("listingPage.reportSubmitted");
      });
    }

    render();
    window.__rerenderPage = render;
  }

  /* ---------- صفحة رسائلي (صندوق الرسائل) ---------- */
  function initMessagesPage() {
    var root = document.getElementById("messagesRoot");
    if (!root) return;

    var session = getSession();
    var notice = document.getElementById("messagesLoginNotice");
    var listWrap = document.getElementById("threadsList");
    var emptyState = document.getElementById("messagesEmptyState");

    if (!session) {
      if (notice) notice.style.display = "";
      if (listWrap) listWrap.style.display = "none";
      if (emptyState) emptyState.style.display = "none";
      return;
    }
    if (notice) notice.style.display = "none";

    markMessagesReadFor(session);
    renderUnreadMessagesBadge();

    function render() {
      var threads = getThreadsForUser(session);
      if (!listWrap) return;
      listWrap.innerHTML = "";

      if (!threads.length) {
        if (emptyState) emptyState.style.display = "";
        listWrap.style.display = "none";
        return;
      }
      if (emptyState) emptyState.style.display = "none";
      listWrap.style.display = "";

      threads.forEach(function (thread) {
        var listing = getListingById(thread.listingId);
        var card = document.createElement("div");
        card.className = "thread-card";

        var header = document.createElement("div");
        header.className = "thread-card-header";
        var titleEl = document.createElement("div");
        titleEl.className = "thread-card-title";
        titleEl.textContent = listing ? buildListingTitle(listing) : t("messages.deletedListing");
        var otherEl = document.createElement("div");
        otherEl.className = "thread-card-other";
        var otherUser = findUser(thread.other);
        otherEl.textContent = otherUser ? otherUser.name : thread.other;
        header.appendChild(titleEl);
        header.appendChild(otherEl);
        card.appendChild(header);

        var snippet = document.createElement("div");
        snippet.className = "thread-card-snippet";
        snippet.textContent = thread.lastMessage.body;
        card.appendChild(snippet);

        var threadBody = document.createElement("div");
        threadBody.className = "thread-card-body";
        thread.messages.forEach(function (m) {
          var bubble = document.createElement("div");
          bubble.className = "msg-bubble " + (m.fromEmail === session ? "mine" : "theirs");
          var p = document.createElement("p");
          p.textContent = m.body;
          bubble.appendChild(p);
          threadBody.appendChild(bubble);
        });
        card.appendChild(threadBody);

        var replyForm = document.createElement("form");
        replyForm.className = "thread-reply-form";
        var textarea = document.createElement("textarea");
        textarea.placeholder = t("messages.replyPlaceholder");
        var replyContactWarning = document.createElement("div");
        replyContactWarning.className = "contact-leak-warning";
        replyContactWarning.textContent = t("messages.contactLeakWarning");
        var sendBtn = document.createElement("button");
        sendBtn.type = "submit";
        sendBtn.className = "btn btn-solid";
        sendBtn.textContent = t("messages.sendBtn");
        replyForm.appendChild(textarea);
        replyForm.appendChild(replyContactWarning);
        replyForm.appendChild(sendBtn);
        replyForm.addEventListener("click", function (e) {
          e.stopPropagation();
        });
        textarea.addEventListener("input", function () {
          replyContactWarning.classList.remove("show");
        });
        replyForm.addEventListener("submit", function (e) {
          e.preventDefault();
          var text = textarea.value.trim();
          if (!text) return;
          if (containsContactInfo(text)) {
            replyContactWarning.classList.add("show");
            return;
          }
          sendMessage({ listingId: thread.listingId, fromEmail: session, toEmail: thread.other, body: text });
          render();
        });
        card.appendChild(replyForm);

        header.addEventListener("click", function () {
          card.classList.toggle("open");
        });
        snippet.addEventListener("click", function () {
          card.classList.toggle("open");
        });

        listWrap.appendChild(card);
      });
    }

    render();
    window.__rerenderPage = render;
  }

  /* ---------- صفحة إعلاناتي (إدارة الإعلانات الخاصة بالمستخدم) ---------- */
  function initFavoritesPage() {
    var root = document.getElementById("favoritesRoot");
    if (!root) return;

    var session = getSession();
    var notice = document.getElementById("favoritesLoginNotice");
    var emptyState = document.getElementById("favoritesEmptyState");
    var grid = document.getElementById("favoritesGrid");

    if (!session) {
      if (notice) notice.style.display = "";
      if (grid) grid.style.display = "none";
      if (emptyState) emptyState.style.display = "none";
      return;
    }
    if (notice) notice.style.display = "none";

    function render() {
      if (!grid) return;
      grid.innerHTML = "";
      var ids = getFavoriteIds(session);
      var listings = ids
        .map(function (id) { return getListingById(id); })
        .filter(function (l) { return !!l; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });

      if (!listings.length) {
        if (emptyState) emptyState.style.display = "";
        grid.style.display = "none";
        return;
      }
      if (emptyState) emptyState.style.display = "none";
      grid.style.display = "";
      listings.forEach(function (listing) {
        grid.appendChild(createListingCardEl(listing));
      });
    }

    render();
    window.__rerenderFavoritesPage = render;
    window.__rerenderPage = render;

    /* ---------- قسم عمليات البحث المحفوظة بنفس الصفحة ---------- */
    var savedSearchesList = document.getElementById("savedSearchesList");
    var savedSearchesEmptyState = document.getElementById("savedSearchesEmptyState");
    function renderSavedSearches() {
      if (!savedSearchesList) return;
      savedSearchesList.innerHTML = "";
      var searches = getSavedSearchesFor(session).sort(function (a, b) {
        return b.createdAt - a.createdAt;
      });
      if (!searches.length) {
        if (savedSearchesEmptyState) savedSearchesEmptyState.style.display = "";
        savedSearchesList.style.display = "none";
        return;
      }
      if (savedSearchesEmptyState) savedSearchesEmptyState.style.display = "none";
      savedSearchesList.style.display = "";
      searches.forEach(function (s) {
        var row = document.createElement("div");
        row.className = "saved-search-row";

        var nameEl = document.createElement("div");
        nameEl.className = "saved-search-name";
        nameEl.textContent = s.name;
        row.appendChild(nameEl);

        var actions = document.createElement("div");
        actions.className = "saved-search-actions";

        var applyLink = document.createElement("a");
        applyLink.className = "btn btn-ghost";
        applyLink.href = "index.html" + (s.query ? "?" + s.query : "");
        applyLink.textContent = t("savedSearch.applyBtn");
        actions.appendChild(applyLink);

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-ghost";
        deleteBtn.textContent = t("savedSearch.deleteBtn");
        deleteBtn.addEventListener("click", function () {
          if (window.confirm(t("savedSearch.deleteConfirm"))) {
            deleteSavedSearch(s.id);
            renderSavedSearches();
          }
        });
        actions.appendChild(deleteBtn);

        row.appendChild(actions);
        savedSearchesList.appendChild(row);
      });
    }
    renderSavedSearches();
  }

  function initMyListingsPage() {
    var root = document.getElementById("myListingsRoot");
    if (!root) return;

    var session = getSession();
    var notice = document.getElementById("myListingsLoginNotice");
    var emptyState = document.getElementById("myListingsEmptyState");
    var grid = document.getElementById("myListingsGrid");

    if (!session) {
      if (notice) notice.style.display = "";
      if (grid) grid.style.display = "none";
      if (emptyState) emptyState.style.display = "none";
      return;
    }
    if (notice) notice.style.display = "none";

    function createRow(listing) {
      var status = getListingStatus(listing);
      var isSold = status === "sold";

      var row = document.createElement("div");
      row.className = "my-listing-row" + (isSold ? " sold" : "");

      var thumb = document.createElement("div");
      thumb.className = "my-listing-thumb";
      if (listing.photos && listing.photos[0]) {
        thumb.style.backgroundImage = "url('" + listing.photos[0] + "')";
      } else {
        thumb.classList.add("card-media-empty");
      }
      row.appendChild(thumb);

      var info = document.createElement("div");
      info.className = "my-listing-info";

      var titleEl = document.createElement("div");
      titleEl.className = "my-listing-title";
      titleEl.textContent = buildListingTitle(listing);
      info.appendChild(titleEl);

      var priceEl = document.createElement("div");
      priceEl.className = "my-listing-price";
      priceEl.textContent = formatPrice(listing);
      info.appendChild(priceEl);

      var statusBadge = document.createElement("span");
      statusBadge.className = "my-listing-status " + (isSold ? "sold" : "active");
      statusBadge.textContent = isSold ? t("listing.sold") : t("listing.active");
      info.appendChild(statusBadge);

      if (listing.featured && !isSold) {
        var featuredStatusBadge = document.createElement("span");
        featuredStatusBadge.className = "my-listing-status featured";
        featuredStatusBadge.textContent = "★ " + t("listing.featuredBadge");
        info.appendChild(featuredStatusBadge);
      }

      row.appendChild(info);

      var actions = document.createElement("div");
      actions.className = "my-listing-actions";

      var viewLink = document.createElement("a");
      viewLink.className = "btn btn-ghost";
      viewLink.href = "listing.html?id=" + encodeURIComponent(listing.id);
      viewLink.textContent = t("myListings.viewBtn");
      actions.appendChild(viewLink);

      var editLink = document.createElement("a");
      editLink.className = "btn btn-ghost";
      editLink.href = "add-listing.html?edit=" + encodeURIComponent(listing.id);
      editLink.textContent = t("myListings.editBtn");
      actions.appendChild(editLink);

      var toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "btn btn-ghost";
      toggleBtn.textContent = isSold ? t("myListings.reactivateBtn") : t("myListings.markSoldBtn");
      toggleBtn.addEventListener("click", function () {
        updateListing(listing.id, { status: isSold ? "active" : "sold" });
        if (!isSold) notifyBuyersToReviewSeller(listing);
        render();
      });
      actions.appendChild(toggleBtn);

      if (!isSold) {
        var featureBtn = document.createElement("button");
        featureBtn.type = "button";
        featureBtn.className = "btn btn-ghost";
        featureBtn.textContent = listing.featured ? t("myListings.unfeatureBtn") : t("myListings.featureBtn");
        featureBtn.addEventListener("click", function () {
          updateListing(listing.id, { featured: !listing.featured });
          render();
        });
        actions.appendChild(featureBtn);
      }

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-ghost my-listing-delete";
      deleteBtn.textContent = t("myListings.deleteBtn");
      deleteBtn.addEventListener("click", function () {
        if (window.confirm(t("myListings.deleteConfirm"))) {
          deleteListing(listing.id);
          render();
          initHeaderAuthState();
        }
      });
      actions.appendChild(deleteBtn);

      row.appendChild(actions);
      return row;
    }

    function render() {
      if (!grid) return;
      var listings = getListings()
        .filter(function (l) {
          return l.ownerEmail === session;
        })
        .sort(function (a, b) {
          return b.createdAt - a.createdAt;
        });

      grid.innerHTML = "";
      if (!listings.length) {
        if (emptyState) emptyState.style.display = "";
        grid.style.display = "none";
        return;
      }
      if (emptyState) emptyState.style.display = "none";
      grid.style.display = "";
      listings.forEach(function (l) {
        grid.appendChild(createRow(l));
      });
    }

    render();
    window.__rerenderPage = render;
  }

  /* ---------- صفحة إدارة الاشتراك (subscription.html) ---------- */
  function initSubscriptionPage() {
    var root = document.getElementById("subscriptionRoot");
    if (!root) return;

    var session = getSession();
    var loginNotice = document.getElementById("subLoginNotice");
    var statusCard = document.getElementById("subStatusCard");

    if (!session) {
      if (loginNotice) loginNotice.style.display = "";
      if (statusCard) statusCard.style.display = "none";
      return;
    }
    if (loginNotice) loginNotice.style.display = "none";
    if (statusCard) statusCard.style.display = "";

    function formatDate(ts) {
      return new Date(ts).toLocaleDateString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US");
    }

    function render() {
      var user = findUser(session);
      if (!user) return;

      var adminExemptNote = document.getElementById("subAdminExemptNote");
      var subBody = document.getElementById("subStatusBody");
      // المدير العام فقط معفى من الاشتراك؛ باقي موظفي الإدارة يرون حالة اشتراكهم الفعلية
      // لأنهم يحتاجون اشتراكًا مثل أي مستخدم إذا أرادوا نشر إعلاناتهم الخاصة.
      if (user.role === "super_admin") {
        if (adminExemptNote) adminExemptNote.style.display = "";
        if (subBody) subBody.style.display = "none";
        return;
      }
      if (adminExemptNote) adminExemptNote.style.display = "none";
      if (subBody) subBody.style.display = "";

      var stage = getAccountStage(user);

      var badge = document.getElementById("subStageBadge");
      var detail = document.getElementById("subStageDetail");
      var trialInfo = document.getElementById("subTrialInfo");
      var rejectedInfo = document.getElementById("subRejectedInfo");
      var paymentSection = document.getElementById("subPaymentSection");
      var activeInfo = document.getElementById("subActiveInfo");
      var endInfo = document.getElementById("subEndInfo");
      var extendBtn = document.getElementById("extendSubscriptionBtn");

      [trialInfo, rejectedInfo, paymentSection, activeInfo, endInfo, extendBtn].forEach(function (el) {
        if (el) el.style.display = "none";
      });

      var tone = stage === "active" || stage === "trial" ? "chip-ok" : stage === "rejected" ? "chip-danger" : stage === "pending_review" ? "chip-warn" : "chip-neutral";
      if (badge) {
        badge.className = "admin-badge-chip " + tone;
        badge.textContent = t("admin.accountStage." + stage);
      }
      if (detail) {
        detail.textContent = t("subscription.stageDetail." + stage);
      }

      if (stage === "trial") {
        var daysLeft = Math.max(0, Math.ceil((user.trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000)));
        if (trialInfo) {
          trialInfo.style.display = "";
          trialInfo.textContent = t("subscription.trialDaysLeft").replace("{days}", String(daysLeft)).replace("{date}", formatDate(user.trialEndsAt));
        }
        if (paymentSection) paymentSection.style.display = "";
      } else if (stage === "expired") {
        if (paymentSection) paymentSection.style.display = "";
      } else if (stage === "rejected") {
        if (rejectedInfo) {
          rejectedInfo.style.display = "";
          rejectedInfo.textContent = t("subscription.rejectedReason") + (user.rejectionReason ? " " + user.rejectionReason : "");
        }
      } else if (stage === "active") {
        if (activeInfo) {
          activeInfo.style.display = "";
          activeInfo.textContent =
            t("subscription.activeSince") + " " + (user.paidAt ? formatDate(user.paidAt) : "—") +
            (user.paymentMethod ? " · " + t("subscription.method." + user.paymentMethod) : "");
        }
        if (endInfo && user.subscriptionEndsAt) {
          var remainingDays = Math.max(0, Math.ceil((user.subscriptionEndsAt - Date.now()) / (24 * 60 * 60 * 1000)));
          endInfo.style.display = "";
          endInfo.textContent = t("subscription.remainingDays")
            .replace("{days}", String(remainingDays))
            .replace("{date}", formatDate(user.subscriptionEndsAt));
        }
        if (extendBtn) extendBtn.style.display = "";
      }

      var planSummary = document.getElementById("subPlanSummary");
      if (planSummary) {
        var pricing = getSubscriptionPricing();
        var effectivePrice = user.plan === "yearly" ? pricing.yearlyEffective : pricing.monthlyEffective;
        var priceText = user.plan ? formatMoney(effectivePrice) + (user.plan === "monthly" ? " / " + t("plan.perMonth") : " / " + t("admin.payments.perYear")) : "";
        planSummary.textContent = t("subscription.selectedPlan") + " " + (user.plan ? t("plan." + user.plan + ".name") : "—") + " — " + priceText;
      }
    }

    var extendSubscriptionBtn = document.getElementById("extendSubscriptionBtn");
    if (extendSubscriptionBtn) {
      extendSubscriptionBtn.addEventListener("click", function () {
        var paymentSection = document.getElementById("subPaymentSection");
        if (paymentSection) paymentSection.style.display = "";
        extendSubscriptionBtn.style.display = "none";
      });
    }

    var payBtn = document.getElementById("payNowBtn");
    if (payBtn) {
      payBtn.addEventListener("click", function () {
        var methodInput = document.querySelector('input[name="paymentMethod"]:checked');
        var method = methodInput ? methodInput.value : "bankak";
        var statusEl = document.getElementById("subPaymentStatus");
        var wasActive = getAccountStage(findUser(session)) === "active";
        payBtn.disabled = true;
        payBtn.textContent = t("subscription.processing");
        setTimeout(function () {
          activateSubscriptionPayment(session, method);
          logAuditEvent("subscription_activated", session, method);
          if (statusEl) {
            statusEl.textContent = wasActive ? t("subscription.extendedSuccess") : t("subscription.paymentSuccess");
            statusEl.classList.add("show", "success");
          }
          payBtn.disabled = false;
          payBtn.textContent = t("subscription.payNowBtn");
          render();
        }, 900);
      });
    }

    render();
    window.__rerenderPage = render;
  }

  /* ---------- شريط تنبيه وضع الصيانة ---------- */
  function renderMaintenanceBanner() {
    var banner = document.getElementById("maintenanceBanner");
    if (!banner) return;
    var settings = getSiteSettings();
    if (settings.maintenanceMode) {
      banner.textContent = t("maintenance.customMessage") || t("maintenance.defaultMessage");
      banner.style.display = "";
    } else {
      banner.style.display = "none";
    }
  }

  /* ================= لوحة تحكم الإدارة (admin.html) ================= */
  function getPlanPrice(plan) {
    var pricing = getSubscriptionPricing();
    return plan === "yearly" ? pricing.yearlyEffective : pricing.monthlyEffective;
  }

  function formatMoney(n) {
    var formatted = Number(n || 0).toLocaleString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US");
    return formatted + " " + t("plan.currency");
  }

  function td(text) {
    var cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  function adminBadge(text, tone) {
    var span = document.createElement("span");
    span.className = "admin-badge-chip chip-" + tone;
    span.textContent = text;
    return span;
  }

  var STAT_TILE_TONE_CYCLE = ["blue", "orange", "green", "purple"];
  var statTileToneIndex = 0;
  function statTileEl(label, value, icon) {
    var tile = document.createElement("div");
    tile.className = "admin-stat-tile";
    var tone = STAT_TILE_TONE_CYCLE[statTileToneIndex % STAT_TILE_TONE_CYCLE.length];
    statTileToneIndex++;
    if (icon) {
      var iconBadge = document.createElement("div");
      iconBadge.className = "admin-stat-icon tone-" + tone;
      iconBadge.textContent = icon;
      iconBadge.setAttribute("aria-hidden", "true");
      tile.appendChild(iconBadge);
    }
    var body = document.createElement("div");
    body.className = "admin-stat-body";
    var v = document.createElement("div");
    v.className = "admin-stat-value";
    v.textContent = value;
    var l = document.createElement("div");
    l.className = "admin-stat-label";
    l.textContent = label;
    body.appendChild(v);
    body.appendChild(l);
    tile.appendChild(body);
    return tile;
  }

  /* ---------- تسجيل مدير جديد: صفحة مستقلة تمامًا (admin-register.html)، متاحة فقط لمن
     يفوّض العملية ببيانات مدير عام صحيحة. المدير الجديد يُمنح دخولاً بلا صلاحيات إضافية —
     المدير العام يحدّد صلاحياته لاحقًا من لوحة "مستخدمو الإدارة". ---------- */
  /* ============================================================
     تعطيل مؤقت لطلب تفويض المدير العام عند تسجيل مدير جديد (admin-register.html)
     — لأغراض استرجاع الوصول فقط عند فقدان بيانات دخول كل حسابات المدير العام.
     عندما تكون القيمة false: لا يُطلب بريد/كلمة مرور مدير عام للتفويض، ويُنشأ
     الحساب الجديد مباشرة بصلاحية "مدير عام" كاملة. أعد هذه القيمة إلى true
     حالما تسترجع وصولك لإغلاق هذه الثغرة المؤقتة والعودة للسلوك الآمن الافتراضي
     (تسجيل مدير جديد يتطلب تفويض مدير عام حالي، ويُمنح دورًا محدودًا قابلًا
     للتوسيع لاحقًا من لوحة "مستخدمو الإدارة").
     ============================================================ */
  var ADMIN_REGISTER_REQUIRE_AUTHORIZER = true;

  function initAdminRegisterPage() {
    var submitBtn = document.getElementById("submitAdminRegisterBtn");
    if (!submitBtn) return;
    var statusEl = document.getElementById("adminRegisterStatus");

    var authorizerSectionTitle = document.querySelector('[data-i18n="admin.registerNewAdmin.authorizerTitle"]');
    var authorizerEmailField = document.getElementById("authorizerEmailField");
    var authorizerPasswordField = document.getElementById("authorizerPasswordField");
    if (!ADMIN_REGISTER_REQUIRE_AUTHORIZER) {
      [authorizerSectionTitle, authorizerEmailField, authorizerPasswordField].forEach(function (el) {
        if (el) el.style.display = "none";
      });
      var bypassNotice = document.getElementById("adminRegisterBypassNotice");
      if (bypassNotice) bypassNotice.style.display = "";
    }

    function setFieldInvalid(id, invalid) {
      var field = document.getElementById(id);
      if (field) field.classList.toggle("invalid", invalid);
    }

    if (!submitBtn.dataset.bound) {
      submitBtn.dataset.bound = "1";
      submitBtn.addEventListener("click", function () {
        if (statusEl) statusEl.classList.remove("show", "success", "error");

        var authorizerEmail = document.getElementById("authorizerEmail").value.trim();
        var authorizerPassword = document.getElementById("authorizerPassword").value;
        var name = document.getElementById("newAdminName").value.trim();
        var email = document.getElementById("newAdminEmail").value.trim();
        var phone = document.getElementById("newAdminPhone").value.trim();
        var password = document.getElementById("newAdminPassword").value;
        var confirmPassword = document.getElementById("newAdminConfirmPassword").value;

        var nameValid = name.length >= 2;
        var emailValid = isValidEmail(email);
        var phoneValid = isValidPhone(phone);
        var passwordValid = password.length >= 6;
        var confirmValid = confirmPassword === password && confirmPassword.length > 0;
        var emailTaken = !!findUser(email);

        setFieldInvalid("newAdminNameField", !nameValid);
        setFieldInvalid("newAdminEmailField", !emailValid || emailTaken);
        setFieldInvalid("newAdminPhoneField", !phoneValid);
        setFieldInvalid("newAdminPasswordField", !passwordValid);
        setFieldInvalid("newAdminConfirmPasswordField", !confirmValid);
        var emailFormatMsg = document.getElementById("newAdminEmailFormatMsg");
        var emailExistsMsg = document.getElementById("newAdminEmailExistsMsg");
        if (emailFormatMsg) emailFormatMsg.style.display = !emailValid ? "block" : "none";
        if (emailExistsMsg) emailExistsMsg.style.display = emailValid && emailTaken ? "block" : "none";

        // التحقق من بيانات المدير العام المفوِّض للعملية — مُتخطّى بالكامل طالما
        // ADMIN_REGISTER_REQUIRE_AUTHORIZER معطّلة مؤقتًا (انظر التعليق أعلى الدالة).
        var authorizer = findUser(authorizerEmail);
        var authorizerIsSuperAdmin = !!authorizer && authorizer.role === "super_admin";
        var authorizerPasswordCheck = !ADMIN_REGISTER_REQUIRE_AUTHORIZER
          ? Promise.resolve(true)
          : authorizerIsSuperAdmin
          ? verifyPassword(authorizer, authorizerPassword)
          : Promise.resolve(false);

        authorizerPasswordCheck.then(function (authorizerPasswordOk) {
          var authorizerValid = !ADMIN_REGISTER_REQUIRE_AUTHORIZER || (authorizerIsSuperAdmin && authorizerPasswordOk);
          if (ADMIN_REGISTER_REQUIRE_AUTHORIZER) setFieldInvalid("authorizerEmailField", !authorizerValid);

          if (!authorizerValid) {
            if (statusEl) {
              statusEl.textContent = t("admin.registerNewAdmin.authorizerError");
              statusEl.classList.add("show", "error");
            }
            return;
          }

          if (!nameValid || !emailValid || emailTaken || !phoneValid || !passwordValid || !confirmValid) {
            if (statusEl) {
              statusEl.textContent = t("auth.fixErrors");
              statusEl.classList.add("show", "error");
            }
            return;
          }

          hashNewPassword(password).then(function (pwHash) {
            var users = getUsers();
            users.push({
              name: name,
              email: email,
              phone: phone,
              passwordHash: pwHash.passwordHash,
              passwordSalt: pwHash.passwordSalt,
              // بوضع التفويض المعطّل مؤقتًا: يُمنح الحساب الجديد صلاحية "مدير عام" كاملة
              // فورًا (غرض الاسترجاع)؛ بالوضع الطبيعي يبقى السلوك كما كان: "admin" بصلاحية
              // dashboard الأساسية فقط، يوسّعها المدير العام لاحقًا من "مستخدمو الإدارة".
              role: ADMIN_REGISTER_REQUIRE_AUTHORIZER ? "admin" : "super_admin",
              customSections: ["dashboard"],
              reviewStatus: "approved",
              reviewedAt: Date.now(),
              address: "",
              createdAt: Date.now(),
            });
            saveUsers(users);
            logAuditEvent(
              "admin_registered_by_superadmin",
              email,
              ADMIN_REGISTER_REQUIRE_AUTHORIZER
                ? "admin (by " + authorizer.email + ")"
                : "super_admin (بدون تفويض — وضع الاسترجاع المؤقت)"
            );

            if (statusEl) {
              statusEl.textContent = t("admin.registerNewAdmin.success");
              statusEl.classList.remove("error");
              statusEl.classList.add("show", "success");
            }
            setTimeout(function () {
              window.location.href = "admin-login.html";
            }, 2200);
          });
        });
      });
    }
  }

  function initAdminPage() {
    var shell = document.getElementById("adminShell");
    if (!shell) return;

    var loginNotice = document.getElementById("adminLoginNotice");
    var deniedNotice = document.getElementById("adminAccessDenied");
    var bootstrapNotice = document.getElementById("adminBootstrap");
    var twoFactorGate = document.getElementById("adminTwoFactorGate");

    function hideAllGates() {
      [loginNotice, deniedNotice, bootstrapNotice, twoFactorGate, shell].forEach(function (el) {
        if (el) el.style.display = "none";
      });
    }

    var session = getSession();
    if (!session) {
      hideAllGates();
      if (loginNotice) loginNotice.style.display = "";
      return;
    }
    var currentUser = findUser(session);
    if (!currentUser) {
      hideAllGates();
      if (loginNotice) loginNotice.style.display = "";
      return;
    }

    if (!isAdminRole(currentUser.role)) {
      if (getAdminUsersList().length === 0) {
        hideAllGates();
        if (bootstrapNotice) bootstrapNotice.style.display = "";
        var claimBtn = document.getElementById("claimSuperAdminBtn");
        if (claimBtn && !claimBtn.dataset.bound) {
          claimBtn.dataset.bound = "1";
          claimBtn.addEventListener("click", function () {
            updateUserRecord(currentUser.email, { role: "super_admin" });
            logAuditEvent("admin_role_granted", currentUser.email, "super_admin (bootstrap)");
            window.location.reload();
          });
        }
        return;
      }
      hideAllGates();
      if (deniedNotice) deniedNotice.style.display = "";
      return;
    }

    var otpVerifiedKey = "eqari_admin_otp_ok_" + currentUser.email;
    if (currentUser.twoFactorEnabled && sessionStorage.getItem(otpVerifiedKey) !== "1") {
      hideAllGates();
      if (twoFactorGate) twoFactorGate.style.display = "";
      var generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
      var otpDisplay = document.getElementById("adminOtpDisplay");
      if (otpDisplay) otpDisplay.textContent = generatedOtp;
      var otpField = document.getElementById("adminOtpField");
      var otpInput = document.getElementById("adminOtpInput");
      var verifyBtn = document.getElementById("adminOtpVerifyBtn");
      if (verifyBtn) {
        verifyBtn.addEventListener("click", function () {
          if (otpInput.value.trim() === generatedOtp) {
            sessionStorage.setItem(otpVerifiedKey, "1");
            logAuditEvent("admin_2fa_verified", currentUser.email, "");
            window.location.reload();
          } else {
            if (otpField) otpField.classList.add("invalid");
          }
        });
      }
      return;
    }

    hideAllGates();
    shell.style.display = "";

    var role = currentUser.role;
    var activeSection = null;

    // ضمان تعطيل زر "حذف جميع المستخدمين" لغير المدير العام فورًا، بصرف النظر عن ترتيب
    // عرض الأقسام (القسم قد لا يُعرض إطلاقًا إذا لم يصل إليه المستخدم بعد).
    var deleteAllUsersBtnGuard = document.getElementById("deleteAllUsersBtn");
    if (deleteAllUsersBtnGuard) deleteAllUsersBtnGuard.disabled = role !== "super_admin";

    var adminLogoutBtn = document.getElementById("adminLogoutBtn");
    if (adminLogoutBtn && !adminLogoutBtn.dataset.bound) {
      adminLogoutBtn.dataset.bound = "1";
      adminLogoutBtn.addEventListener("click", function () {
        sessionStorage.removeItem("eqari_admin_otp_ok_" + currentUser.email);
        clearSession();
        window.location.href = "admin-login.html";
      });
    }

    var roleChip = document.getElementById("adminRoleChip");
    if (roleChip) {
      var chipName = currentUser.name || currentUser.email;
      var chipInitial = chipName.trim().charAt(0) || "م";
      roleChip.innerHTML = "";
      var chipAvatar = document.createElement("div");
      chipAvatar.className = "admin-role-chip-avatar";
      chipAvatar.textContent = chipInitial;
      chipAvatar.setAttribute("aria-hidden", "true");
      var chipText = document.createElement("div");
      chipText.className = "admin-role-chip-text";
      var chipNameEl = document.createElement("div");
      chipNameEl.className = "admin-role-chip-name";
      chipNameEl.textContent = chipName;
      var chipRoleEl = document.createElement("div");
      chipRoleEl.className = "admin-role-chip-role";
      chipRoleEl.textContent = t(ADMIN_ROLES[role].labelKey);
      chipText.appendChild(chipNameEl);
      chipText.appendChild(chipRoleEl);
      roleChip.appendChild(chipAvatar);
      roleChip.appendChild(chipText);
    }

    var nav = document.getElementById("adminNav");
    var sections = ADMIN_SECTION_ORDER.filter(function (s) {
      return userAllowsSection(currentUser, s);
    });

    function buildListingRow(l, withCategory) {
      var tr = document.createElement("tr");
      if (withCategory) tr.appendChild(td(getCategoryLabel(l.category)));

      var titleTd = document.createElement("td");
      var link = document.createElement("a");
      link.href = "listing.html?id=" + encodeURIComponent(l.id);
      link.target = "_blank";
      link.textContent = buildListingTitle(l);
      titleTd.appendChild(link);
      tr.appendChild(titleTd);

      tr.appendChild(td(l.ownerEmail || "—"));
      tr.appendChild(td(formatPrice(l)));
      tr.appendChild(td(t("city." + l.city)));

      var isSold = getListingStatus(l) === "sold";
      var statusTd = document.createElement("td");
      statusTd.appendChild(adminBadge(isSold ? t("listing.sold") : t("listing.active"), isSold ? "neutral" : "ok"));
      if (l.featured && !isSold) {
        statusTd.appendChild(adminBadge("★ " + t("listing.featuredBadge"), "neutral"));
      }
      tr.appendChild(statusTd);

      var visTd = document.createElement("td");
      visTd.appendChild(adminBadge(l.hidden ? t("admin.listings.hidden") : t("admin.listings.visible"), l.hidden ? "danger" : "ok"));
      tr.appendChild(visTd);

      var actionsTd = document.createElement("td");
      actionsTd.className = "admin-actions-cell";

      var hideBtn = document.createElement("button");
      hideBtn.type = "button";
      hideBtn.className = "btn btn-ghost btn-xs";
      hideBtn.textContent = l.hidden ? t("admin.listings.unhideBtn") : t("admin.listings.hideBtn");
      hideBtn.addEventListener("click", function () {
        updateListing(l.id, { hidden: !l.hidden });
        logAuditEvent(l.hidden ? "listing_unhidden" : "listing_hidden", l.id, "");
        renderSection(activeSection);
      });
      actionsTd.appendChild(hideBtn);

      var toggleSoldBtn = document.createElement("button");
      toggleSoldBtn.type = "button";
      toggleSoldBtn.className = "btn btn-ghost btn-xs";
      toggleSoldBtn.textContent = isSold ? t("myListings.reactivateBtn") : t("myListings.markSoldBtn");
      toggleSoldBtn.addEventListener("click", function () {
        updateListing(l.id, { status: isSold ? "active" : "sold" });
        if (!isSold) notifyBuyersToReviewSeller(l);
        logAuditEvent("listing_status_changed", l.id, isSold ? "active" : "sold");
        renderSection(activeSection);
      });
      actionsTd.appendChild(toggleSoldBtn);

      if (!isSold) {
        var toggleFeaturedBtn = document.createElement("button");
        toggleFeaturedBtn.type = "button";
        toggleFeaturedBtn.className = "btn btn-ghost btn-xs";
        toggleFeaturedBtn.textContent = l.featured ? t("admin.listings.unfeatureBtn") : t("admin.listings.featureBtn");
        toggleFeaturedBtn.addEventListener("click", function () {
          updateListing(l.id, { featured: !l.featured });
          logAuditEvent(l.featured ? "listing_unfeatured" : "listing_featured", l.id, "");
          renderSection(activeSection);
        });
        actionsTd.appendChild(toggleFeaturedBtn);
      }

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-ghost btn-xs btn-danger";
      deleteBtn.textContent = t("myListings.deleteBtn");
      deleteBtn.addEventListener("click", function () {
        if (window.confirm(t("myListings.deleteConfirm"))) {
          deleteListing(l.id);
          logAuditEvent("listing_deleted", l.id, "");
          renderSection(activeSection);
        }
      });
      actionsTd.appendChild(deleteBtn);

      tr.appendChild(actionsTd);
      return tr;
    }

    function renderDashboard() {
      var wrap = document.getElementById("dashboardStats");
      if (wrap) {
        wrap.innerHTML = "";
        var users = getUsers();
        var listings = getListings();
        var soldCount = listings.filter(function (l) { return l.status === "sold"; }).length;
        var carsCount = listings.filter(function (l) { return getCategoryGroup(l.category) === "vehicles"; }).length;
        var propsCount = listings.filter(function (l) { return getCategoryGroup(l.category) === "realestate"; }).length;
        var mrr = users.reduce(function (sum, u) {
          return sum + (u.plan === "monthly" ? getPlanPrice("monthly") : u.plan === "yearly" ? Math.round(getPlanPrice("yearly") / 12) : 0);
        }, 0);
        var thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        var activeUsersCount = users.filter(function (u) { return u.lastLoginAt && u.lastLoginAt >= thirtyDaysAgo; }).length;
        var sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        var newSubsCount = users.filter(function (u) { return u.createdAt && u.createdAt >= sevenDaysAgo; }).length;

        wrap.appendChild(statTileEl(t("admin.dashboard.stat.users"), String(users.length), "👥"));
        wrap.appendChild(statTileEl(t("admin.dashboard.stat.listings"), String(listings.length), "📋"));
        wrap.appendChild(statTileEl(t("admin.dashboard.stat.cars"), String(carsCount), "🚗"));
        wrap.appendChild(statTileEl(t("admin.dashboard.stat.properties"), String(propsCount), "🏢"));
        wrap.appendChild(statTileEl(t("admin.dashboard.stat.sold"), String(soldCount), "✅"));
        wrap.appendChild(statTileEl(t("admin.dashboard.stat.revenue"), formatMoney(mrr) + " / " + t("plan.perMonth"), "💰"));
        wrap.appendChild(statTileEl(t("admin.dashboard.stat.newSubs"), String(newSubsCount), "✨"));
        wrap.appendChild(statTileEl(t("admin.dashboard.stat.activeUsers"), String(activeUsersCount), "📈"));
      }

      var citiesWrap = document.getElementById("dashboardTopCities");
      if (citiesWrap) {
        citiesWrap.innerHTML = "";
        var tally = {};
        getListings().forEach(function (l) {
          if (!l.city) return;
          tally[l.city] = (tally[l.city] || 0) + 1;
        });
        var entries = Object.keys(tally)
          .map(function (city) { return { city: city, count: tally[city] }; })
          .sort(function (a, b) { return b.count - a.count; })
          .slice(0, 5);
        if (!entries.length) {
          var empty = document.createElement("p");
          empty.className = "admin-note";
          empty.textContent = t("admin.dashboard.noCityData");
          citiesWrap.appendChild(empty);
        } else {
          var maxCount = entries[0].count;
          entries.forEach(function (e) {
            var row = document.createElement("div");
            row.className = "admin-city-row";
            var name = document.createElement("span");
            name.className = "admin-city-name";
            name.textContent = t("city." + e.city);
            var barWrap = document.createElement("span");
            barWrap.className = "admin-city-bar-wrap";
            var bar = document.createElement("span");
            bar.className = "admin-city-bar";
            bar.style.width = Math.max(6, Math.round((e.count / maxCount) * 100)) + "%";
            barWrap.appendChild(bar);
            var count = document.createElement("span");
            count.className = "admin-city-count";
            count.textContent = String(e.count);
            row.appendChild(name);
            row.appendChild(barWrap);
            row.appendChild(count);
            citiesWrap.appendChild(row);
          });
        }
      }
    }

    var isSuperAdmin = role === "super_admin";
    var usersFilter = "";
    var usersRoleFilterVal = "";
    var usersStatusFilterVal = "";
    var usersPage = 1;
    var usersSearchInput = document.getElementById("usersSearchInput");
    if (usersSearchInput && !usersSearchInput.dataset.bound) {
      usersSearchInput.dataset.bound = "1";
      usersSearchInput.addEventListener("input", function () {
        usersFilter = usersSearchInput.value.trim().toLowerCase();
        usersPage = 1;
        renderUsers();
      });
    }
    var usersRoleFilterSelect = document.getElementById("usersRoleFilter");
    if (usersRoleFilterSelect && !usersRoleFilterSelect.dataset.bound) {
      usersRoleFilterSelect.dataset.bound = "1";
      ["user"].forEach(function (r) {
        var opt = document.createElement("option");
        opt.value = r;
        opt.textContent = t("admin.role.user");
        usersRoleFilterSelect.appendChild(opt);
      });
      usersRoleFilterSelect.addEventListener("change", function () {
        usersRoleFilterVal = usersRoleFilterSelect.value;
        usersPage = 1;
        renderUsers();
      });
    }
    var usersStatusFilterSelect = document.getElementById("usersStatusFilter");
    if (usersStatusFilterSelect && !usersStatusFilterSelect.dataset.bound) {
      usersStatusFilterSelect.dataset.bound = "1";
      usersStatusFilterSelect.addEventListener("change", function () {
        usersStatusFilterVal = usersStatusFilterSelect.value;
        usersPage = 1;
        renderUsers();
      });
    }

    var thUserPhoto = document.getElementById("thUserPhoto");
    var thUserPassword = document.getElementById("thUserPassword");
    [thUserPhoto, thUserPassword].forEach(function (el) {
      if (el) el.style.display = isSuperAdmin ? "" : "none";
    });

    function renderUsers() {
      var tbody = document.getElementById("usersTableBody");
      if (!tbody) return;
      tbody.innerHTML = "";
      var list = getUsers().filter(function (u) {
        /* مستخدمو الإدارة لا يظهرون في جدول المستخدمين العاديين — لهم صفحتهم الخاصة "مستخدمو الإدارة" */
        if (isAdminRole(u.role)) return false;
        if (usersFilter) {
          var matchesText =
            (u.name || "").toLowerCase().indexOf(usersFilter) !== -1 || (u.email || "").toLowerCase().indexOf(usersFilter) !== -1;
          if (!matchesText) return false;
        }
        if (usersRoleFilterVal && (u.role || "user") !== usersRoleFilterVal) return false;
        if (usersStatusFilterVal === "flagged" && !u.flagged) return false;
        if (usersStatusFilterVal === "active" && getUserStatus(u) !== "active") return false;
        if (usersStatusFilterVal === "disabled" && getUserStatus(u) !== "disabled") return false;
        return true;
      });
      var usersTotalPages = Math.max(1, Math.ceil(list.length / ADMIN_PAGE_SIZE));
      if (usersPage > usersTotalPages) usersPage = usersTotalPages;
      var usersPageStart = (usersPage - 1) * ADMIN_PAGE_SIZE;
      var pagedList = list.slice(usersPageStart, usersPageStart + ADMIN_PAGE_SIZE);
      renderPaginationBar("usersPagination", usersPage, usersTotalPages, function (newPage) {
        usersPage = newPage;
        renderUsers();
      });
      pagedList.forEach(function (u) {
        var tr = document.createElement("tr");
        tr.appendChild(td(u.name || "—"));
        tr.appendChild(td(u.email));
        tr.appendChild(td(u.phone || "—"));

        if (isSuperAdmin) {
          var photoTd = document.createElement("td");
          if (u.photo) {
            var img = document.createElement("img");
            img.className = "user-photo-thumb";
            img.src = u.photo;
            img.alt = u.name || u.email;
            photoTd.appendChild(img);
          } else {
            var noPhoto = document.createElement("span");
            noPhoto.className = "user-photo-none";
            noPhoto.textContent = "—";
            photoTd.appendChild(noPhoto);
          }
          tr.appendChild(photoTd);

          /* كلمات المرور مشفّرة الآن (PBKDF2) ولا يمكن فك تشفيرها أو "إظهارها" —
             بدلاً من ذلك يمكن للمدير العام إعادة تعيينها وسيُنشأ له كلمة مرور مؤقتة جديدة
             تُعرض مرة واحدة هنا ليُسلِّمها للمستخدم مباشرة. */
          var passwordTd = document.createElement("td");
          var passwordCell = document.createElement("div");
          passwordCell.className = "password-reveal-cell";
          var passwordValueEl = document.createElement("span");
          passwordValueEl.className = "password-reveal-value";
          passwordValueEl.textContent = "••••••••";
          var resetPwBtn = document.createElement("button");
          resetPwBtn.type = "button";
          resetPwBtn.className = "password-reveal-btn";
          resetPwBtn.textContent = "🔄";
          resetPwBtn.title = t("admin.users.resetPassword");
          resetPwBtn.addEventListener("click", function () {
            if (!window.confirm(t("admin.users.resetPasswordConfirm"))) return;
            var tempPw = generateTempPassword();
            resetPwBtn.disabled = true;
            setUserPassword(u.email, tempPw).then(function () {
              resetPwBtn.disabled = false;
              passwordValueEl.textContent = tempPw;
              passwordValueEl.title = t("admin.users.resetPasswordHint");
              logAuditEvent("admin_password_reset", u.email, "");
            });
          });
          passwordCell.appendChild(passwordValueEl);
          passwordCell.appendChild(resetPwBtn);
          passwordTd.appendChild(passwordCell);
          tr.appendChild(passwordTd);
        }

        var roleTd = document.createElement("td");
        var roleSelect = document.createElement("select");
        roleSelect.className = "admin-mini-select";
        ["user"].concat(Object.keys(ADMIN_ROLES)).forEach(function (r) {
          if (r === "super_admin" && u.role !== "super_admin" && superAdminExists()) return;
          var opt = document.createElement("option");
          opt.value = r;
          opt.textContent = r === "user" ? t("admin.role.user") : t(ADMIN_ROLES[r].labelKey);
          if ((u.role || "user") === r) opt.selected = true;
          roleSelect.appendChild(opt);
        });
        roleSelect.addEventListener("change", function () {
          if (u.role === "super_admin" && roleSelect.value !== "super_admin") {
            var others = getAdminUsersList().filter(function (a) { return a.role === "super_admin" && a.email !== u.email; });
            if (!others.length) {
              window.alert(t("admin.users.lastSuperAdminWarning"));
              roleSelect.value = "super_admin";
              return;
            }
          }
          if (roleSelect.value === "super_admin" && u.role !== "super_admin" && superAdminExists(u.email)) {
            window.alert(t("admin.users.onlyOneSuperAdmin"));
            roleSelect.value = u.role || "user";
            return;
          }
          updateUserRecord(u.email, { role: roleSelect.value === "user" ? undefined : roleSelect.value });
          logAuditEvent("user_role_changed", u.email, roleSelect.value);
          renderUsers();
        });
        roleTd.appendChild(roleSelect);
        tr.appendChild(roleTd);

        var statusTd = document.createElement("td");
        var uStatus = getUserStatus(u);
        var statusLabel = t(uStatus === "disabled" ? "admin.users.statusDisabled" : "admin.users.statusActive") + (u.flagged ? " · " + t("admin.users.flagged") : "");
        statusTd.appendChild(adminBadge(statusLabel, uStatus === "disabled" ? "danger" : u.flagged ? "warn" : "ok"));
        tr.appendChild(statusTd);

        var stageTd = document.createElement("td");
        var stage = getAccountStage(u);
        var stageTone = stage === "active" || stage === "trial" ? "ok" : stage === "rejected" ? "danger" : stage === "pending_review" ? "warn" : "neutral";
        stageTd.appendChild(adminBadge(t("admin.accountStage." + stage), stageTone));
        tr.appendChild(stageTd);

        tr.appendChild(td(u.plan ? t("plan." + u.plan + ".name") : "—"));
        tr.appendChild(td(u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US") : t("admin.users.neverLoggedIn")));

        var actionsTd = document.createElement("td");
        actionsTd.className = "admin-actions-cell";

        var toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "btn btn-ghost btn-xs";
        toggleBtn.textContent = uStatus === "disabled" ? t("admin.users.enableBtn") : t("admin.users.disableBtn");
        toggleBtn.addEventListener("click", function () {
          updateUserRecord(u.email, { status: uStatus === "disabled" ? "active" : "disabled" });
          logAuditEvent(uStatus === "disabled" ? "user_enabled" : "user_disabled", u.email, "");
          renderUsers();
        });
        actionsTd.appendChild(toggleBtn);

        var flagBtn = document.createElement("button");
        flagBtn.type = "button";
        flagBtn.className = "btn btn-ghost btn-xs";
        flagBtn.textContent = u.flagged ? t("admin.users.unflagBtn") : t("admin.users.flagBtn");
        flagBtn.addEventListener("click", function () {
          updateUserRecord(u.email, { flagged: !u.flagged });
          logAuditEvent(u.flagged ? "user_unflagged" : "user_flagged", u.email, "");
          renderUsers();
        });
        actionsTd.appendChild(flagBtn);

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-ghost btn-xs btn-danger";
        deleteBtn.textContent = t("admin.users.deleteBtn");
        deleteBtn.addEventListener("click", function () {
          if (u.email === session) {
            window.alert(t("admin.users.cannotDeleteSelf"));
            return;
          }
          if (window.confirm(t("admin.users.deleteConfirm"))) {
            saveUsers(getUsers().filter(function (x) { return x.email !== u.email; }));
            logAuditEvent("user_deleted", u.email, "");
            renderUsers();
          }
        });
        actionsTd.appendChild(deleteBtn);

        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
    }

    function renderPendingReview() {
      var tbody = document.getElementById("pendingReviewTableBody");
      var emptyNote = document.getElementById("pendingReviewEmptyNote");
      if (typeof updateAdminUsersNavBadge === "function") updateAdminUsersNavBadge();
      if (!tbody) return;
      tbody.innerHTML = "";
      var pending = getUsers().filter(function (u) {
        return !u.reviewStatus || u.reviewStatus === "pending";
      });
      if (emptyNote) emptyNote.style.display = pending.length ? "none" : "";
      pending.forEach(function (u) {
        var tr = document.createElement("tr");
        tr.appendChild(td(u.name || "—"));
        tr.appendChild(td(u.email));
        tr.appendChild(td(u.nationalId || "—"));

        var photoTd = document.createElement("td");
        if (u.idPhoto) {
          var link = document.createElement("a");
          link.href = u.idPhoto;
          link.target = "_blank";
          var thumb = document.createElement("img");
          thumb.src = u.idPhoto;
          thumb.alt = "";
          thumb.className = "admin-id-photo-thumb";
          link.appendChild(thumb);
          photoTd.appendChild(link);
        } else {
          photoTd.textContent = "—";
        }
        tr.appendChild(photoTd);

        tr.appendChild(td(u.plan ? t("plan." + u.plan + ".name") : "—"));

        var actionsTd = document.createElement("td");
        actionsTd.className = "admin-actions-cell";

        var approveBtn = document.createElement("button");
        approveBtn.type = "button";
        approveBtn.className = "btn btn-ghost btn-xs";
        approveBtn.textContent = t("admin.pendingReview.approveBtn");
        approveBtn.addEventListener("click", function () {
          approveUserAccount(u.email);
          logAuditEvent("user_approved", u.email, "");
          renderPendingReview();
          renderUsers();
        });
        actionsTd.appendChild(approveBtn);

        var rejectBtn = document.createElement("button");
        rejectBtn.type = "button";
        rejectBtn.className = "btn btn-ghost btn-xs btn-danger";
        rejectBtn.textContent = t("admin.pendingReview.rejectBtn");
        rejectBtn.addEventListener("click", function () {
          var reason = window.prompt(t("admin.pendingReview.rejectReasonPrompt"), "");
          if (reason === null) return;
          rejectUserAccount(u.email, reason);
          logAuditEvent("user_rejected", u.email, reason);
          renderPendingReview();
          renderUsers();
        });
        actionsTd.appendChild(rejectBtn);

        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
    }

    function renderCars() {
      var tbody = document.getElementById("carsTableBody");
      if (!tbody) return;
      tbody.innerHTML = "";
      getListings()
        .filter(function (l) { return getCategoryGroup(l.category) === "vehicles"; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; })
        .forEach(function (l) { tbody.appendChild(buildListingRow(l, false)); });
    }

    function renderProperties() {
      var tbody = document.getElementById("propertiesTableBody");
      if (!tbody) return;
      tbody.innerHTML = "";
      getListings()
        .filter(function (l) { return getCategoryGroup(l.category) === "realestate"; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; })
        .forEach(function (l) { tbody.appendChild(buildListingRow(l, false)); });
    }

    /* ---------- إدارة فئات المنصة (المنتجات): إضافة/تعديل/حذف فئات مخصّصة بالكامل ---------- */
    function renderCategoriesAdmin() {
      var listWrap = document.getElementById("categoriesListWrap");
      var formPanel = document.getElementById("categoryFormPanel");
      if (!listWrap || !formPanel) return;

      function closeForm() {
        formPanel.style.display = "none";
        formPanel.innerHTML = "";
      }

      /* ---- قائمة الفئات ---- */
      listWrap.innerHTML = "";
      var table = document.createElement("table");
      table.className = "admin-table";
      var thead = document.createElement("thead");
      var headRow = document.createElement("tr");
      [
        "admin.categories.col.icon", "admin.categories.col.name", "admin.categories.col.group",
        "admin.categories.col.fields", "admin.categories.col.listings", "admin.categories.col.type",
        "admin.users.col.actions",
      ].forEach(function (key) {
        var th = document.createElement("th");
        th.textContent = t(key);
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = document.createElement("tbody");

      var allListings = getListings();
      getAllCategories().forEach(function (cat) {
        var tr = document.createElement("tr");
        tr.appendChild(td(cat.icon || "•"));
        tr.appendChild(td(getCategoryLabel(cat.id)));
        tr.appendChild(td(t("admin.categories.group." + cat.group)));
        tr.appendChild(td(cat.builtin ? "—" : String(cat.fields.length)));
        var listingCount = allListings.filter(function (l) { return l.category === cat.id; }).length;
        tr.appendChild(td(String(listingCount)));
        tr.appendChild(td(t(cat.builtin ? "admin.categories.builtinBadge" : "admin.categories.customBadge")));

        var actionsTd = document.createElement("td");
        actionsTd.className = "admin-actions-cell";
        if (cat.builtin) {
          var note = document.createElement("span");
          note.className = "admin-note";
          note.textContent = t("admin.categories.builtinNote");
          actionsTd.appendChild(note);
        } else {
          var editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "btn btn-ghost btn-xs";
          editBtn.textContent = t("admin.categories.editBtn");
          editBtn.addEventListener("click", function () { openCategoryForm(cat); });
          actionsTd.appendChild(editBtn);

          var deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = "btn btn-ghost btn-xs btn-danger";
          deleteBtn.textContent = t("admin.categories.deleteBtn");
          deleteBtn.addEventListener("click", function () {
            if (listingCount > 0) {
              window.alert(t("admin.categories.deleteBlockedHasListings"));
              return;
            }
            if (!window.confirm(t("admin.categories.deleteConfirm"))) return;
            saveCustomCategories(getCustomCategories().filter(function (c) { return c.id !== cat.id; }));
            logAuditEvent("category_deleted", cat.id, "");
            closeForm();
            renderCategoriesAdmin();
          });
          actionsTd.appendChild(deleteBtn);
        }
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      listWrap.appendChild(table);

      var addBtn = document.getElementById("addCategoryBtn");
      if (addBtn && !addBtn.dataset.bound) {
        addBtn.dataset.bound = "1";
        addBtn.addEventListener("click", function () { openCategoryForm(null); });
      }

      /* ---- نموذج إضافة/تعديل فئة، مع أداة بناء الحقول المخصّصة ---- */
      function openCategoryForm(existingCat) {
        formPanel.innerHTML = "";
        formPanel.style.display = "";

        var heading = document.createElement("h3");
        heading.textContent = t(existingCat ? "admin.categories.editHeading" : "admin.categories.addHeading");
        formPanel.appendChild(heading);

        var nameArField = document.createElement("div");
        nameArField.className = "form-field";
        var nameArLabel = document.createElement("label");
        nameArLabel.textContent = t("admin.categories.nameArLabel");
        var nameArInput = document.createElement("input");
        nameArInput.type = "text";
        nameArInput.value = existingCat ? existingCat.nameAr : "";
        nameArField.appendChild(nameArLabel);
        nameArField.appendChild(nameArInput);

        var nameEnField = document.createElement("div");
        nameEnField.className = "form-field";
        var nameEnLabel = document.createElement("label");
        nameEnLabel.textContent = t("admin.categories.nameEnLabel");
        var nameEnInput = document.createElement("input");
        nameEnInput.type = "text";
        nameEnInput.value = existingCat ? existingCat.nameEn : "";
        nameEnField.appendChild(nameEnLabel);
        nameEnField.appendChild(nameEnInput);

        var iconField = document.createElement("div");
        iconField.className = "form-field";
        var iconLabel = document.createElement("label");
        iconLabel.textContent = t("admin.categories.iconLabel");
        var iconInput = document.createElement("input");
        iconInput.type = "text";
        iconInput.maxLength = 4;
        iconInput.style.maxWidth = "100px";
        iconInput.value = existingCat ? existingCat.icon || "" : "";
        iconField.appendChild(iconLabel);
        iconField.appendChild(iconInput);

        var groupField = document.createElement("div");
        groupField.className = "form-field";
        var groupLabel = document.createElement("label");
        groupLabel.textContent = t("admin.categories.groupLabel");
        var groupSelect = document.createElement("select");
        [["realestate", "admin.categories.group.realestate"], ["vehicles", "admin.categories.group.vehicles"]].forEach(function (pair) {
          var opt = document.createElement("option");
          opt.value = pair[0];
          opt.textContent = t(pair[1]);
          groupSelect.appendChild(opt);
        });
        groupSelect.value = existingCat ? existingCat.group : "realestate";
        groupField.appendChild(groupLabel);
        groupField.appendChild(groupSelect);

        [nameArField, nameEnField, iconField, groupField].forEach(function (f) { formPanel.appendChild(f); });

        var fieldsHeading = document.createElement("div");
        fieldsHeading.className = "form-section-title";
        fieldsHeading.textContent = t("admin.categories.fieldsHeading");
        formPanel.appendChild(fieldsHeading);
        var fieldsNote = document.createElement("p");
        fieldsNote.className = "admin-note";
        fieldsNote.textContent = t("admin.categories.fieldsNote");
        formPanel.appendChild(fieldsNote);

        var fieldsListWrap = document.createElement("div");
        formPanel.appendChild(fieldsListWrap);

        /* الحقول تُحفَظ في مصفوفة محلية أثناء التحرير، وتُبنى منها الواجهة في كل مرة */
        var draftFields = existingCat ? existingCat.fields.map(function (f) { return Object.assign({}, f, { options: (f.options || []).map(function (o) { return Object.assign({}, o); }) }); }) : [];

        function renderFieldsList() {
          fieldsListWrap.innerHTML = "";
          draftFields.forEach(function (f, idx) {
            var row = document.createElement("div");
            row.className = "admin-panel";
            row.style.marginTop = "10px";

            var rowGrid = document.createElement("div");
            rowGrid.className = "form-grid-2";

            function miniField(labelKey, value, onChange, placeholder) {
              var wrap = document.createElement("div");
              wrap.className = "form-field";
              var lbl = document.createElement("label");
              lbl.textContent = t(labelKey);
              var inp = document.createElement("input");
              inp.type = "text";
              inp.value = value || "";
              if (placeholder) inp.placeholder = placeholder;
              inp.addEventListener("input", function () { onChange(inp.value); });
              wrap.appendChild(lbl);
              wrap.appendChild(inp);
              return wrap;
            }

            rowGrid.appendChild(miniField("admin.categories.fieldLabelAr", f.labelAr, function (v) { f.labelAr = v; }));
            rowGrid.appendChild(miniField("admin.categories.fieldLabelEn", f.labelEn, function (v) { f.labelEn = v; }));

            var typeWrap = document.createElement("div");
            typeWrap.className = "form-field";
            var typeLbl = document.createElement("label");
            typeLbl.textContent = t("admin.categories.fieldTypeLabel");
            var typeSelect = document.createElement("select");
            CUSTOM_FIELD_TYPES.forEach(function (ty) {
              var opt = document.createElement("option");
              opt.value = ty;
              opt.textContent = fieldTypeLabel(ty);
              typeSelect.appendChild(opt);
            });
            typeSelect.value = f.type;
            typeSelect.addEventListener("change", function () {
              f.type = typeSelect.value;
              renderFieldsList();
            });
            typeWrap.appendChild(typeLbl);
            typeWrap.appendChild(typeSelect);
            rowGrid.appendChild(typeWrap);

            var flagsWrap = document.createElement("div");
            flagsWrap.className = "form-field";
            var reqLabel = document.createElement("label");
            var reqCheckbox = document.createElement("input");
            reqCheckbox.type = "checkbox";
            reqCheckbox.checked = !!f.required;
            reqCheckbox.addEventListener("change", function () { f.required = reqCheckbox.checked; });
            reqLabel.appendChild(reqCheckbox);
            reqLabel.appendChild(document.createTextNode(" " + t("admin.categories.fieldRequired")));

            var intLabel = document.createElement("label");
            intLabel.style.marginInlineStart = "14px";
            var intCheckbox = document.createElement("input");
            intCheckbox.type = "checkbox";
            intCheckbox.checked = !!f.internal;
            intCheckbox.addEventListener("change", function () { f.internal = intCheckbox.checked; });
            intLabel.appendChild(intCheckbox);
            intLabel.appendChild(document.createTextNode(" " + t("admin.categories.fieldInternal")));

            flagsWrap.appendChild(reqLabel);
            flagsWrap.appendChild(intLabel);
            rowGrid.appendChild(flagsWrap);

            row.appendChild(rowGrid);

            if (f.type === "select") {
              var optsWrap = document.createElement("div");
              optsWrap.style.marginTop = "8px";
              var optsTitle = document.createElement("div");
              optsTitle.className = "hint";
              optsTitle.textContent = t("admin.categories.optionsHint");
              optsWrap.appendChild(optsTitle);
              (f.options || []).forEach(function (o, oIdx) {
                var optRow = document.createElement("div");
                optRow.className = "form-grid-2";
                optRow.style.marginTop = "6px";
                optRow.appendChild(miniField("admin.categories.fieldLabelAr", o.labelAr, function (v) {
                  o.labelAr = v;
                  o.value = o.value || slugify(v);
                }));
                optRow.appendChild(miniField("admin.categories.fieldLabelEn", o.labelEn, function (v) {
                  o.labelEn = v;
                  if (!o.value) o.value = slugify(v);
                }));
                var removeOptBtn = document.createElement("button");
                removeOptBtn.type = "button";
                removeOptBtn.className = "btn btn-ghost btn-xs btn-danger";
                removeOptBtn.textContent = t("admin.categories.removeOptionBtn");
                removeOptBtn.addEventListener("click", function () {
                  f.options.splice(oIdx, 1);
                  renderFieldsList();
                });
                optRow.appendChild(removeOptBtn);
                optsWrap.appendChild(optRow);
              });
              var addOptBtn = document.createElement("button");
              addOptBtn.type = "button";
              addOptBtn.className = "btn btn-ghost btn-xs";
              addOptBtn.textContent = t("admin.categories.addOptionBtn");
              addOptBtn.style.marginTop = "6px";
              addOptBtn.addEventListener("click", function () {
                if (!f.options) f.options = [];
                f.options.push({ value: "", labelAr: "", labelEn: "" });
                renderFieldsList();
              });
              optsWrap.appendChild(addOptBtn);
              row.appendChild(optsWrap);
            }

            var removeFieldBtn = document.createElement("button");
            removeFieldBtn.type = "button";
            removeFieldBtn.className = "btn btn-ghost btn-xs btn-danger";
            removeFieldBtn.style.marginTop = "10px";
            removeFieldBtn.textContent = t("admin.categories.removeFieldBtn");
            removeFieldBtn.addEventListener("click", function () {
              draftFields.splice(idx, 1);
              renderFieldsList();
            });
            row.appendChild(removeFieldBtn);

            fieldsListWrap.appendChild(row);
          });
        }
        renderFieldsList();

        var addFieldBtn = document.createElement("button");
        addFieldBtn.type = "button";
        addFieldBtn.className = "btn btn-ghost";
        addFieldBtn.style.marginTop = "10px";
        addFieldBtn.textContent = t("admin.categories.addFieldBtn");
        addFieldBtn.addEventListener("click", function () {
          var existingKeys = draftFields.map(function (f) { return f.key; });
          draftFields.push({
            key: genFieldKey("field" + (draftFields.length + 1), "", existingKeys),
            type: "text", labelAr: "", labelEn: "", required: true, internal: false, options: [],
          });
          renderFieldsList();
        });
        formPanel.appendChild(addFieldBtn);

        var formStatusEl = document.createElement("div");
        formStatusEl.className = "form-status";
        formPanel.appendChild(formStatusEl);

        var actionsRow = document.createElement("div");
        actionsRow.style.marginTop = "16px";
        var saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "btn btn-solid";
        saveBtn.textContent = t("admin.categories.saveBtn");
        saveBtn.addEventListener("click", function () {
          var nameAr = nameArInput.value.trim();
          var nameEn = nameEnInput.value.trim();
          if (!nameAr || !nameEn) {
            formStatusEl.textContent = t("admin.categories.nameRequiredError");
            formStatusEl.classList.add("show", "error");
            return;
          }
          var invalidField = draftFields.find(function (f) { return !f.labelAr.trim() || !f.labelEn.trim(); });
          if (invalidField) {
            formStatusEl.textContent = t("admin.categories.fieldLabelRequiredError");
            formStatusEl.classList.add("show", "error");
            return;
          }

          var list = getCustomCategories();
          if (existingCat) {
            var idx = list.findIndex(function (c) { return c.id === existingCat.id; });
            if (idx > -1) {
              list[idx] = Object.assign({}, existingCat, {
                nameAr: nameAr, nameEn: nameEn, icon: iconInput.value.trim(), group: groupSelect.value,
                fields: draftFields,
              });
            }
            logAuditEvent("category_updated", existingCat.id, "");
          } else {
            var newId = genCategoryId(nameEn, nameAr);
            list.push({
              id: newId, nameAr: nameAr, nameEn: nameEn, icon: iconInput.value.trim() || "•",
              group: groupSelect.value, builtin: false, fields: draftFields, createdAt: Date.now(),
            });
            logAuditEvent("category_created", newId, "");
          }
          saveCustomCategories(list);
          closeForm();
          renderCategoriesAdmin();
        });
        actionsRow.appendChild(saveBtn);

        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn-ghost";
        cancelBtn.style.marginInlineStart = "10px";
        cancelBtn.textContent = t("admin.categories.cancelBtn");
        cancelBtn.addEventListener("click", closeForm);
        actionsRow.appendChild(cancelBtn);

        formPanel.appendChild(actionsRow);
        formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    var listingsFilter = "";
    var listingsPage = 1;
    var listingsSearchInput = document.getElementById("listingsSearchInput");
    if (listingsSearchInput && !listingsSearchInput.dataset.bound) {
      listingsSearchInput.dataset.bound = "1";
      listingsSearchInput.addEventListener("input", function () {
        listingsFilter = listingsSearchInput.value.trim().toLowerCase();
        listingsPage = 1;
        renderMasterListings();
      });
    }
    function renderMasterListings() {
      var tbody = document.getElementById("listingsTableBody");
      if (!tbody) return;
      tbody.innerHTML = "";
      var list = getListings()
        .filter(function (l) {
          if (!listingsFilter) return true;
          return buildListingTitle(l).toLowerCase().indexOf(listingsFilter) !== -1 || (l.ownerEmail || "").toLowerCase().indexOf(listingsFilter) !== -1;
        })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });
      var listingsTotalPages = Math.max(1, Math.ceil(list.length / ADMIN_PAGE_SIZE));
      if (listingsPage > listingsTotalPages) listingsPage = listingsTotalPages;
      var listingsStart = (listingsPage - 1) * ADMIN_PAGE_SIZE;
      list.slice(listingsStart, listingsStart + ADMIN_PAGE_SIZE).forEach(function (l) { tbody.appendChild(buildListingRow(l, true)); });
      renderPaginationBar("listingsPagination", listingsPage, listingsTotalPages, function (newPage) {
        listingsPage = newPage;
        renderMasterListings();
      });
    }

    function renderPayments() {
      var users = getUsers();
      var statsWrap = document.getElementById("paymentsStats");
      if (statsWrap) {
        statsWrap.innerHTML = "";
        var mrr = users.reduce(function (sum, u) {
          return sum + (u.plan === "monthly" ? getPlanPrice("monthly") : u.plan === "yearly" ? Math.round(getPlanPrice("yearly") / 12) : 0);
        }, 0);
        statsWrap.appendChild(statTileEl(t("admin.payments.mrr"), formatMoney(mrr), "💵"));
        statsWrap.appendChild(statTileEl(t("admin.payments.arr"), formatMoney(mrr * 12), "📊"));
        statsWrap.appendChild(statTileEl(t("admin.payments.totalSubscribers"), String(users.length), "👥"));
      }
      var tbody = document.getElementById("paymentsTableBody");
      if (tbody) {
        tbody.innerHTML = "";
        users.forEach(function (u) {
          var tr = document.createElement("tr");
          tr.appendChild(td(u.name + " — " + u.email));
          tr.appendChild(td(u.plan ? t("plan." + u.plan + ".name") : "—"));
          var amountText = formatMoney(getPlanPrice(u.plan) || 0) + (u.plan === "monthly" ? " / " + t("plan.perMonth") : u.plan === "yearly" ? " / " + t("admin.payments.perYear") : "");
          tr.appendChild(td(amountText));
          tbody.appendChild(tr);
        });
      }
    }

    var couponForm = document.getElementById("addCouponForm");
    if (couponForm && !couponForm.dataset.bound) {
      couponForm.dataset.bound = "1";
      couponForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var codeInput = document.getElementById("couponCode");
        var discountInput = document.getElementById("couponDiscount");
        var code = codeInput.value.trim();
        var discount = Number(discountInput.value);
        if (!code || !discount || discount < 1 || discount > 100) return;
        addCoupon({ code: code, discountPercent: discount });
        logAuditEvent("coupon_added", code, discount + "%");
        codeInput.value = "";
        discountInput.value = "";
        renderCoupons();
        window.alert(t("admin.coupons.added"));
      });
    }
    function renderCoupons() {
      var tbody = document.getElementById("couponsTableBody");
      if (!tbody) return;
      tbody.innerHTML = "";
      getCoupons().forEach(function (c) {
        var tr = document.createElement("tr");
        tr.appendChild(td(c.code));
        tr.appendChild(td(c.discountPercent + "%"));
        var statusTd = document.createElement("td");
        statusTd.appendChild(adminBadge(c.active ? t("admin.coupons.active") : t("admin.coupons.inactive"), c.active ? "ok" : "neutral"));
        tr.appendChild(statusTd);

        var actionsTd = document.createElement("td");
        var toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "btn btn-ghost btn-xs";
        toggleBtn.textContent = c.active ? t("admin.coupons.deactivateBtn") : t("admin.coupons.activateBtn");
        toggleBtn.addEventListener("click", function () {
          var coupons = getCoupons();
          var idx = coupons.findIndex(function (x) { return x.id === c.id; });
          if (idx > -1) {
            coupons[idx].active = !coupons[idx].active;
            saveCoupons(coupons);
          }
          logAuditEvent("coupon_toggled", c.code, "");
          renderCoupons();
        });
        actionsTd.appendChild(toggleBtn);

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-ghost btn-xs btn-danger";
        deleteBtn.textContent = t("myListings.deleteBtn");
        deleteBtn.addEventListener("click", function () {
          deleteCoupon(c.id);
          logAuditEvent("coupon_deleted", c.code, "");
          renderCoupons();
        });
        actionsTd.appendChild(deleteBtn);

        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
    }

    function renderSubscriptionPricingPanel() {
      var panel = document.getElementById("subscriptionPricingPanel");
      if (!panel) return;
      panel.style.display = role === "super_admin" ? "" : "none";
      if (role !== "super_admin") return;

      var settings = getSiteSettings();
      var monthlyInput = document.getElementById("settingMonthlyPrice");
      var yearlyInput = document.getElementById("settingYearlyPrice");
      var discountPercentInput = document.getElementById("settingDiscountPercent");
      var discountStartInput = document.getElementById("settingDiscountStart");
      var discountEndInput = document.getElementById("settingDiscountEnd");
      if (monthlyInput) monthlyInput.value = settings.monthlyPrice;
      if (yearlyInput) yearlyInput.value = settings.yearlyPrice;
      if (discountPercentInput) discountPercentInput.value = settings.subDiscountPercent || 0;
      if (discountStartInput) discountStartInput.value = settings.subDiscountStart || "";
      if (discountEndInput) discountEndInput.value = settings.subDiscountEnd || "";

      var savePricingBtn = document.getElementById("savePricingBtn");
      if (savePricingBtn && !savePricingBtn.dataset.bound) {
        savePricingBtn.dataset.bound = "1";
        savePricingBtn.addEventListener("click", function () {
          saveSiteSettings({
            monthlyPrice: Math.max(0, Number(monthlyInput.value) || 0),
            yearlyPrice: Math.max(0, Number(yearlyInput.value) || 0),
          });
          logAuditEvent("subscription_pricing_updated", "", "");
          window.alert(t("admin.settings.saved"));
          renderPlanPricing();
        });
      }

      var saveDiscountBtn = document.getElementById("saveDiscountBtn");
      if (saveDiscountBtn && !saveDiscountBtn.dataset.bound) {
        saveDiscountBtn.dataset.bound = "1";
        saveDiscountBtn.addEventListener("click", function () {
          var percent = Math.max(0, Math.min(100, Number(discountPercentInput.value) || 0));
          var startDate = discountStartInput.value;
          var endDate = discountEndInput.value;
          if (percent > 0 && (!startDate || !endDate || startDate > endDate)) {
            window.alert(t("admin.subDiscount.invalidRange"));
            return;
          }
          saveSiteSettings({
            subDiscountPercent: percent,
            subDiscountStart: startDate,
            subDiscountEnd: endDate,
          });
          logAuditEvent("subscription_discount_updated", "", percent + "% (" + startDate + " → " + endDate + ")");
          window.alert(t("admin.settings.saved"));
          renderPlanPricing();
        });
      }
    }

    function renderSubscriptions() {
      renderSubscriptionPricingPanel();
      var tbody = document.getElementById("subscriptionsTableBody");
      if (tbody) {
        tbody.innerHTML = "";
        getUsers().forEach(function (u) {
          var tr = document.createElement("tr");
          tr.appendChild(td(u.name + " — " + u.email));
          tr.appendChild(td(u.plan ? t("plan." + u.plan + ".name") : "—"));
          var actionTd = document.createElement("td");
          var select = document.createElement("select");
          select.className = "admin-mini-select";
          ["monthly", "yearly"].forEach(function (p) {
            var opt = document.createElement("option");
            opt.value = p;
            opt.textContent = t("plan." + p + ".name");
            if (u.plan === p) opt.selected = true;
            select.appendChild(opt);
          });
          select.addEventListener("change", function () {
            updateUserRecord(u.email, { plan: select.value });
            logAuditEvent("user_plan_changed", u.email, select.value);
            renderSubscriptions();
            window.alert(t("admin.subscriptions.planUpdated"));
          });
          actionTd.appendChild(select);
          tr.appendChild(actionTd);
          tbody.appendChild(tr);
        });
      }
      renderCoupons();
    }

    function renderReports() {
      var tbody = document.getElementById("reportsTableBody");
      if (typeof updateAdminNavBadge === "function") updateAdminNavBadge("reports");
      if (!tbody) return;
      tbody.innerHTML = "";
      getReports()
        .slice()
        .sort(function (a, b) { return b.createdAt - a.createdAt; })
        .forEach(function (r) {
          var tr = document.createElement("tr");
          var listing = getListingById(r.listingId);
          var listingTd = document.createElement("td");
          if (listing) {
            var link = document.createElement("a");
            link.href = "listing.html?id=" + encodeURIComponent(listing.id);
            link.target = "_blank";
            link.textContent = buildListingTitle(listing);
            listingTd.appendChild(link);
          } else {
            listingTd.textContent = t("admin.reports.listingDeleted");
          }
          tr.appendChild(listingTd);
          tr.appendChild(td(r.reporterEmail));
          tr.appendChild(td(t("listingPage.reportReason." + r.reason)));

          var statusTd = document.createElement("td");
          statusTd.appendChild(adminBadge(t("admin.reports.status." + r.status), r.status === "open" ? "danger" : "ok"));
          tr.appendChild(statusTd);

          tr.appendChild(td(new Date(r.createdAt).toLocaleDateString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US")));

          var actionsTd = document.createElement("td");
          if (r.status === "open") {
            var resolveBtn = document.createElement("button");
            resolveBtn.type = "button";
            resolveBtn.className = "btn btn-ghost btn-xs";
            resolveBtn.textContent = t("admin.reports.resolveBtn");
            resolveBtn.addEventListener("click", function () {
              updateReport(r.id, { status: "resolved" });
              logAuditEvent("report_resolved", r.id, r.listingId);
              renderReports();
            });
            actionsTd.appendChild(resolveBtn);

            var dismissBtn = document.createElement("button");
            dismissBtn.type = "button";
            dismissBtn.className = "btn btn-ghost btn-xs";
            dismissBtn.textContent = t("admin.reports.dismissBtn");
            dismissBtn.addEventListener("click", function () {
              updateReport(r.id, { status: "dismissed" });
              logAuditEvent("report_dismissed", r.id, r.listingId);
              renderReports();
            });
            actionsTd.appendChild(dismissBtn);

            if (listing) {
              var deleteListingBtn = document.createElement("button");
              deleteListingBtn.type = "button";
              deleteListingBtn.className = "btn btn-ghost btn-xs btn-danger";
              deleteListingBtn.textContent = t("admin.reports.deleteListingBtn");
              deleteListingBtn.addEventListener("click", function () {
                if (window.confirm(t("myListings.deleteConfirm"))) {
                  deleteListing(listing.id);
                  updateReport(r.id, { status: "resolved" });
                  logAuditEvent("listing_deleted_from_report", listing.id, r.id);
                  renderReports();
                }
              });
              actionsTd.appendChild(deleteListingBtn);
            }
          }
          tr.appendChild(actionsTd);
          tbody.appendChild(tr);
        });
    }

    function renderContentEditor() {
      var wrap = document.getElementById("contentEditorFields");
      if (!wrap) return;
      wrap.innerHTML = "";
      var overrides = getSiteContentOverrides();
      EDITABLE_CONTENT_KEYS.forEach(function (key) {
        var group = document.createElement("div");
        group.className = "admin-content-field-group";
        var heading = document.createElement("div");
        heading.className = "admin-content-field-heading";
        heading.textContent = key;
        group.appendChild(heading);

        ["ar", "en"].forEach(function (lang) {
          var field = document.createElement("div");
          field.className = "form-field";
          var label = document.createElement("label");
          label.textContent = lang === "ar" ? t("admin.content.arLabel") : t("admin.content.enLabel");
          field.appendChild(label);
          var input = document.createElement("input");
          input.type = "text";
          input.setAttribute("data-content-lang", lang);
          input.setAttribute("data-content-key", key);
          input.value = (overrides[lang] && overrides[lang][key]) || "";
          input.placeholder = I18N[lang][key] || "";
          field.appendChild(input);
          group.appendChild(field);
        });
        wrap.appendChild(group);
      });
    }
    var saveContentBtn = document.getElementById("saveContentBtn");
    if (saveContentBtn && !saveContentBtn.dataset.bound) {
      saveContentBtn.dataset.bound = "1";
      saveContentBtn.addEventListener("click", function () {
        var inputs = document.querySelectorAll("#contentEditorFields input[data-content-key]");
        Array.prototype.forEach.call(inputs, function (input) {
          saveSiteContentOverride(input.getAttribute("data-content-lang"), input.getAttribute("data-content-key"), input.value.trim());
        });
        logAuditEvent("site_content_updated", "", "");
        applyTranslations();
        if (typeof window.__rerenderPage === "function") window.__rerenderPage();
        window.alert(t("admin.content.saved"));
      });
    }

    function renderSettings() {
      var settings = getSiteSettings();
      var minAgeInput = document.getElementById("settingMinAge");
      var maintenanceModeInput = document.getElementById("settingMaintenanceMode");
      if (minAgeInput) minAgeInput.value = settings.minAge;
      if (maintenanceModeInput) maintenanceModeInput.checked = !!settings.maintenanceMode;
      // منطقة الخطر (حذف جميع المستخدمين نهائيًا) تظهر فقط للمدير العام، حتى لو مُنح مدير آخر صلاحية "الإعدادات".
      var dangerZoneWrap = document.getElementById("dangerZoneWrap");
      if (dangerZoneWrap) dangerZoneWrap.style.display = currentUserIsSuperAdmin() ? "" : "none";
      var deleteAllUsersBtnEl = document.getElementById("deleteAllUsersBtn");
      if (deleteAllUsersBtnEl) deleteAllUsersBtnEl.disabled = !currentUserIsSuperAdmin();
    }
    var saveSettingsBtn = document.getElementById("saveSettingsBtn");
    if (saveSettingsBtn && !saveSettingsBtn.dataset.bound) {
      saveSettingsBtn.dataset.bound = "1";
      saveSettingsBtn.addEventListener("click", function () {
        var minAgeInput = document.getElementById("settingMinAge");
        var maintenanceModeInput = document.getElementById("settingMaintenanceMode");
        saveSiteSettings({
          minAge: Math.max(13, Number(minAgeInput.value) || 18),
          maintenanceMode: !!maintenanceModeInput.checked,
        });
        logAuditEvent("site_settings_updated", "", "");
        window.alert(t("admin.settings.saved"));
      });
    }

    var exportBtn = document.getElementById("exportBackupBtn");
    if (exportBtn && !exportBtn.dataset.bound) {
      exportBtn.dataset.bound = "1";
      exportBtn.addEventListener("click", function () {
        var backup = {};
        var keys = [
          "eqari_users", "eqari_listings", "eqari_messages", "eqari_used_ids",
          "eqari_audit_log", "eqari_reports", "eqari_coupons", "eqari_site_content", "eqari_site_settings",
          "eqari_notifications", "eqari_favorites", "eqari_reviews",
        ];
        keys.forEach(function (k) {
          var raw = localStorage.getItem(k);
          if (raw !== null) {
            try { backup[k] = JSON.parse(raw); } catch (e) { /* تجاهل */ }
          }
        });
        backup.exportedAt = Date.now();
        var blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "mubasher-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logAuditEvent("backup_exported", "", "");
      });
    }
    /* ---------- نسخ قاعدة بيانات Supabase (للمدير العام) ---------- */
    (function initDbBackup() {
      var panel = document.getElementById("dbBackupPanel");
      if (!panel || panel.dataset.bound) return;
      panel.dataset.bound = "1";
      var downloadBtn = document.getElementById("dbBackupDownloadBtn");
      var snapshotBtn = document.getElementById("dbBackupSnapshotBtn");
      var refreshBtn = document.getElementById("dbBackupRefreshBtn");
      var statusEl = document.getElementById("dbBackupStatus");
      var lastEl = document.getElementById("dbBackupLastDownload");
      var listEl = document.getElementById("dbBackupList");
      var LAST_KEY = "eqari_last_db_backup_download";

      function say(msg, isError) {
        if (!statusEl) return;
        statusEl.textContent = msg || "";
        statusEl.style.color = isError ? "#b3261e" : "";
      }
      function explain(res) {
        var m = String((res && res.error) || "");
        if (/forbidden/i.test(m)) return t("admin.dbBackup.forbidden");
        if (/failed to fetch|network|load failed/i.test(m)) return t("admin.dbBackup.unavailable");
        return t("admin.dbBackup.error");
      }
      function saveJson(obj, filename) {
        var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      function renderLast() {
        if (!lastEl) return;
        var ts = 0;
        try { ts = Number(localStorage.getItem(LAST_KEY)) || 0; } catch (e) {}
        if (!ts) { lastEl.textContent = t("admin.dbBackup.neverDownloaded"); return; }
        var txt = t("admin.dbBackup.lastDownload").replace("{date}", new Date(ts).toLocaleString());
        if (Date.now() - ts > 7 * 86400000) txt += " — " + t("admin.dbBackup.staleWarning");
        lastEl.textContent = txt;
      }
      function renderList(rows) {
        if (!listEl) return;
        if (!rows || !rows.length) { listEl.innerHTML = '<p class="admin-note">' + t("admin.dbBackup.empty") + "</p>"; return; }
        var html = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>#</th><th>' + t("admin.dbBackup.colDate") +
          "</th><th>" + t("admin.dbBackup.colLabel") + "</th><th>" + t("admin.dbBackup.colRows") + "</th><th></th></tr></thead><tbody>";
        rows.forEach(function (r) {
          var total = 0;
          Object.keys(r.row_counts || {}).forEach(function (k) { if (k !== "storage_files") total += Number(r.row_counts[k]) || 0; });
          html += "<tr><td>" + Number(r.id) + "</td><td>" + new Date(r.taken_at).toLocaleString() + "</td><td>" +
            String(r.label || "").replace(/[<>&]/g, "") + "</td><td>" + total + '</td><td><button type="button" class="btn btn-ghost" data-snap="' +
            Number(r.id) + '">' + t("admin.dbBackup.download") + "</button></td></tr>";
        });
        listEl.innerHTML = html + "</tbody></table></div>";
        Array.prototype.forEach.call(listEl.querySelectorAll("[data-snap]"), function (b) {
          b.addEventListener("click", function () {
            var id = Number(b.getAttribute("data-snap"));
            say(t("admin.dbBackup.working"));
            sbAdminBackupGet(id).then(function (res) {
              if (!res.ok) return say(explain(res), true);
              saveJson(res.data, "mubasher-snapshot-" + id + ".json");
              say(t("admin.dbBackup.downloaded"));
            }).catch(function () { say(t("admin.dbBackup.unavailable"), true); });
          });
        });
      }
      function refresh() {
        if (typeof sbAdminBackupList !== "function") { say(t("admin.dbBackup.unavailable"), true); return; }
        sbAdminBackupList().then(function (res) {
          if (!res.ok) { renderList([]); return say(explain(res), true); }
          renderList(res.data);
        }).catch(function () { say(t("admin.dbBackup.unavailable"), true); });
      }

      downloadBtn.addEventListener("click", function () {
        if (typeof sbAdminBackupDownload !== "function") return say(t("admin.dbBackup.unavailable"), true);
        say(t("admin.dbBackup.working"));
        sbAdminBackupDownload().then(function (res) {
          if (!res.ok) return say(explain(res), true);
          saveJson(res.data, "mubasher-db-backup-" + new Date().toISOString().slice(0, 10) + ".json");
          try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (e) {}
          renderLast();
          say(t("admin.dbBackup.downloaded"));
          logAuditEvent("backup_exported", "", "database");
        }).catch(function () { say(t("admin.dbBackup.unavailable"), true); });
      });
      snapshotBtn.addEventListener("click", function () {
        if (typeof sbAdminBackupSnapshot !== "function") return say(t("admin.dbBackup.unavailable"), true);
        say(t("admin.dbBackup.working"));
        sbAdminBackupSnapshot("manual").then(function (res) {
          if (!res.ok) return say(explain(res), true);
          say(t("admin.dbBackup.snapshotDone").replace("{id}", res.data));
          refresh();
        }).catch(function () { say(t("admin.dbBackup.unavailable"), true); });
      });
      refreshBtn.addEventListener("click", refresh);
      renderLast();
      refresh();
    })();

    var importInput = document.getElementById("importBackupInput");
    if (importInput && !importInput.dataset.bound) {
      importInput.dataset.bound = "1";
      importInput.addEventListener("change", function () {
        var file = importInput.files && importInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(reader.result);
            if (!window.confirm(t("admin.settings.importConfirm"))) {
              importInput.value = "";
              return;
            }
            Object.keys(data).forEach(function (k) {
              if (k === "exportedAt") return;
              localStorage.setItem(k, JSON.stringify(data[k]));
            });
            logAuditEvent("backup_imported", "", "");
            window.alert(t("admin.settings.importSuccess"));
            window.location.reload();
          } catch (e) {
            window.alert(t("admin.settings.importError"));
          }
          importInput.value = "";
        };
        reader.readAsText(file);
      });
    }

    var deleteAllUsersBtn = document.getElementById("deleteAllUsersBtn");
    if (deleteAllUsersBtn && !deleteAllUsersBtn.dataset.bound) {
      deleteAllUsersBtn.dataset.bound = "1";
      deleteAllUsersBtn.addEventListener("click", function () {
        if (!currentUser || currentUser.role !== "super_admin") return;
        if (!window.confirm(t("admin.settings.dangerConfirm1"))) return;
        var typed = window.prompt(t("admin.settings.dangerConfirm2"));
        if (typed === null || typed.trim() !== t("admin.settings.dangerConfirmPhrase")) {
          window.alert(t("admin.settings.dangerCancelled"));
          return;
        }

        var allUsers = getUsers();
        var removedEmails = allUsers
          .filter(function (u) { return u.email !== currentUser.email; })
          .map(function (u) { return u.email; });
        var removedCount = removedEmails.length;
        if (!removedCount) {
          window.alert(t("admin.settings.dangerNothingToDelete"));
          return;
        }
        var removedSet = {};
        removedEmails.forEach(function (e) { removedSet[e] = true; });

        // 1) الإبقاء على حساب المدير العام الحالي فقط
        var keptUsers = allUsers.filter(function (u) { return u.email === currentUser.email; });
        saveUsers(keptUsers);

        // 2) حذف إعلانات المستخدمين المحذوفين (يماثل سلوك CASCADE في قاعدة بيانات Supabase الحقيقية)
        var allListings = getListings();
        var removedListingIds = {};
        var keptListings = allListings.filter(function (l) {
          if (removedSet[l.ownerEmail]) { removedListingIds[l.id] = true; return false; }
          return true;
        });
        saveListings(keptListings);

        // 3) حذف الرسائل المرتبطة بهم أو بإعلاناتهم المحذوفة
        var keptMessages = getMessages().filter(function (m) {
          return !removedSet[m.fromEmail] && !removedSet[m.toEmail] && !removedListingIds[m.listingId];
        });
        saveMessages(keptMessages);

        // 4) حذف الإشعارات الموجهة لهم
        var keptNotifications = getNotifications().filter(function (n) { return !removedSet[n.toEmail]; });
        saveNotifications(keptNotifications);

        // 5) حذف مفضّلاتهم بالكامل، وتنظيف مفضّلات الباقين من الإعلانات المحذوفة
        var favMap = getFavoritesMap();
        var cleanedFavMap = {};
        Object.keys(favMap).forEach(function (email) {
          if (removedSet[email]) return;
          var ids = (favMap[email] || []).filter(function (id) { return !removedListingIds[id]; });
          cleanedFavMap[email] = ids;
        });
        saveFavoritesMap(cleanedFavMap);

        // 6) حذف تقييماتهم (كبائعين أو كمقيّمين)
        var keptReviews = getReviews().filter(function (r) {
          return !removedSet[r.sellerEmail] && !removedSet[r.reviewerEmail];
        });
        saveReviews(keptReviews);

        // 7) حذف بلاغاتهم أو البلاغات المرتبطة بإعلاناتهم المحذوفة
        var keptReports = getReports().filter(function (r) {
          return !removedSet[r.reporterEmail] && !removedListingIds[r.listingId];
        });
        saveReports(keptReports);

        logAuditEvent("bulk_users_deleted", "ALL_EXCEPT_SELF", String(removedCount));
        window.alert(t("admin.settings.dangerDone").replace("{count}", String(removedCount)));
        window.location.reload();
      });
    }

    // فقط المدير العام يصل لقسم "مستخدمو الإدارة" أصلاً (عبر نظام الصلاحيات)، وهذا الحارس
    // إضافي يمنع أي استدعاء آخر من تعديل الأدوار/الصلاحيات لغير المدير العام.
    function currentUserIsSuperAdmin() {
      return !!currentUser && currentUser.role === "super_admin";
    }

    // حذف حساب واحد نهائيًا (مدير أو موظف إدارة أو مستخدم عادي) مع كل بياناته المرتبطة —
    // بنفس منطق سلوك CASCADE في Supabase. يُستخدم من زر "حذف نهائي" في جدول مستخدمي الإدارة.
    function cascadeDeleteSingleAccount(email) {
      var allUsers = getUsers();
      var keptUsers = allUsers.filter(function (u) { return u.email !== email; });
      if (keptUsers.length === allUsers.length) return false; // لم يوجد المستخدم أصلًا
      saveUsers(keptUsers);

      var allListings = getListings();
      var removedListingIds = {};
      var keptListings = allListings.filter(function (l) {
        if (l.ownerEmail === email) { removedListingIds[l.id] = true; return false; }
        return true;
      });
      saveListings(keptListings);

      var keptMessages = getMessages().filter(function (m) {
        return m.fromEmail !== email && m.toEmail !== email && !removedListingIds[m.listingId];
      });
      saveMessages(keptMessages);

      var keptNotifications = getNotifications().filter(function (n) { return n.toEmail !== email; });
      saveNotifications(keptNotifications);

      var favMap = getFavoritesMap();
      var cleanedFavMap = {};
      Object.keys(favMap).forEach(function (favEmail) {
        if (favEmail === email) return;
        cleanedFavMap[favEmail] = (favMap[favEmail] || []).filter(function (id) { return !removedListingIds[id]; });
      });
      saveFavoritesMap(cleanedFavMap);

      var keptReviews = getReviews().filter(function (r) {
        return r.sellerEmail !== email && r.reviewerEmail !== email;
      });
      saveReviews(keptReviews);

      var keptReports = getReports().filter(function (r) {
        return r.reporterEmail !== email && !removedListingIds[r.listingId];
      });
      saveReports(keptReports);

      return true;
    }
    function renderAdminUsers() {
      var tbody = document.getElementById("adminUsersTableBody");
      if (tbody) {
        tbody.innerHTML = "";
        getAdminUsersList().forEach(function (u) {
          var tr = document.createElement("tr");
          tr.appendChild(td(u.name || "—"));
          tr.appendChild(td(u.email));

          var roleTd = document.createElement("td");
          var roleBadge = document.createElement("span");
          roleBadge.className = "admin-role-badge" + (u.role === "super_admin" ? " admin-role-badge-super" : "");
          roleBadge.textContent = t(ADMIN_ROLES[u.role] ? ADMIN_ROLES[u.role].labelKey : "adminRole.admin");
          roleTd.appendChild(roleBadge);
          tr.appendChild(roleTd);

          var permTd = document.createElement("td");
          if (u.role === "super_admin") {
            var allPermsNote = document.createElement("span");
            allPermsNote.className = "admin-note";
            allPermsNote.textContent = t("admin.adminUsers.allPermissions");
            permTd.appendChild(allPermsNote);
          } else {
            var currentSections = getUserSections(u);
            var chipsWrap = document.createElement("div");
            chipsWrap.className = "admin-permissions-chips";
            GRANTABLE_SECTIONS.forEach(function (sec) {
              var chip = document.createElement("button");
              chip.type = "button";
              var isOn = currentSections.indexOf(sec) !== -1;
              chip.className = "admin-permission-chip" + (isOn ? " active" : "");
              chip.textContent = t("admin.nav." + sec);
              chip.setAttribute("aria-pressed", isOn ? "true" : "false");
              chip.disabled = !currentUserIsSuperAdmin();
              chip.addEventListener("click", function () {
                if (!currentUserIsSuperAdmin()) return;
                var sections = getUserSections(u).filter(function (s) { return s !== "dashboard"; });
                var nowOn = sections.indexOf(sec) === -1;
                if (nowOn) sections.push(sec);
                else sections = sections.filter(function (s) { return s !== sec; });
                sections.unshift("dashboard");
                updateUserRecord(u.email, { customSections: sections });
                logAuditEvent(nowOn ? "admin_permission_granted" : "admin_permission_revoked", u.email, sec);
                renderAdminUsers();
              });
              chipsWrap.appendChild(chip);
            });
            permTd.appendChild(chipsWrap);
          }
          tr.appendChild(permTd);

          var tfaTd = document.createElement("td");
          var tfaToggle = document.createElement("button");
          tfaToggle.type = "button";
          tfaToggle.className = "btn btn-ghost btn-xs";
          tfaToggle.textContent = u.twoFactorEnabled ? t("admin.adminUsers.disable2fa") : t("admin.adminUsers.enable2fa");
          tfaToggle.addEventListener("click", function () {
            updateUserRecord(u.email, { twoFactorEnabled: !u.twoFactorEnabled });
            logAuditEvent(u.twoFactorEnabled ? "admin_2fa_disabled" : "admin_2fa_enabled", u.email, "");
            renderAdminUsers();
          });
          tfaTd.appendChild(tfaToggle);
          tr.appendChild(tfaTd);

          var actionsTd = document.createElement("td");
          actionsTd.className = "admin-actions-cell";
          // حذف حساب إداري نهائيًا (سحب الصلاحية) لا يقوم به إلا المدير العام.
          var revokeBtn = document.createElement("button");
          revokeBtn.type = "button";
          revokeBtn.className = "btn btn-ghost btn-xs btn-danger";
          revokeBtn.textContent = t("admin.adminUsers.revokeBtn");
          revokeBtn.disabled = !currentUserIsSuperAdmin();
          revokeBtn.addEventListener("click", function () {
            if (!currentUserIsSuperAdmin()) return;
            if (u.role === "super_admin") {
              var others = getAdminUsersList().filter(function (a) { return a.role === "super_admin" && a.email !== u.email; });
              if (!others.length) {
                window.alert(t("admin.users.lastSuperAdminWarning"));
                return;
              }
            }
            updateUserRecord(u.email, { role: undefined, customSections: undefined });
            logAuditEvent("admin_role_revoked", u.email, "");
            renderAdminUsers();
          });
          actionsTd.appendChild(revokeBtn);

          // حذف الحساب نهائيًا من المنصة (وليس فقط سحب صلاحيته الإدارية) — للمدير العام فقط،
          // ولا يمكن للمدير العام حذف حسابه الخاص من هنا.
          var deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = "btn btn-ghost btn-xs btn-danger";
          deleteBtn.textContent = t("admin.adminUsers.deleteBtn");
          var isSelf = currentUser && u.email === currentUser.email;
          deleteBtn.disabled = !currentUserIsSuperAdmin() || isSelf;
          deleteBtn.addEventListener("click", function () {
            if (!currentUserIsSuperAdmin() || isSelf) return;
            if (u.role === "super_admin") {
              var others2 = getAdminUsersList().filter(function (a) { return a.role === "super_admin" && a.email !== u.email; });
              if (!others2.length) {
                window.alert(t("admin.users.lastSuperAdminWarning"));
                return;
              }
            }
            if (!window.confirm(t("admin.adminUsers.deleteConfirm").replace("{email}", u.email))) return;
            cascadeDeleteSingleAccount(u.email);
            logAuditEvent("admin_account_deleted", u.email, "");
            renderAdminUsers();
          });
          actionsTd.appendChild(deleteBtn);
          tr.appendChild(actionsTd);

          tbody.appendChild(tr);
        });
      }
    }
    var grantAdminBtn = document.getElementById("grantAdminBtn");
    if (grantAdminBtn) grantAdminBtn.disabled = !currentUserIsSuperAdmin();
    if (grantAdminBtn && !grantAdminBtn.dataset.bound) {
      grantAdminBtn.dataset.bound = "1";
      grantAdminBtn.addEventListener("click", function () {
        // منح صلاحية إدارية (تغيير دور مستخدم إلى موظف إدارة) لا يقوم به إلا المدير العام.
        if (!currentUserIsSuperAdmin()) return;
        var emailInput = document.getElementById("grantAdminEmail");
        var statusEl = document.getElementById("grantAdminStatus");
        if (statusEl) statusEl.classList.remove("show", "success", "error");
        var email = emailInput.value.trim();
        var target = findUser(email);
        if (!target) {
          window.alert(t("admin.adminUsers.userNotFound"));
          return;
        }
        if (isAdminRole(target.role)) {
          window.alert(t("admin.adminUsers.alreadyAdmin"));
          return;
        }
        // يُمنح المدير الجديد دور "admin" العام بلا أي صلاحيات إضافية بعد — المدير العام
        // هو من يحدد صلاحياته لاحقًا من خانة الصلاحيات الموحدة في الجدول أدناه.
        updateUserRecord(target.email, { role: "admin", customSections: ["dashboard"] });
        logAuditEvent("admin_role_granted", target.email, "admin");
        emailInput.value = "";
        renderAdminUsers();
        if (statusEl) {
          statusEl.textContent = t("admin.adminUsers.grantSuccess").replace("{email}", email);
          statusEl.classList.add("show", "success");
          setTimeout(function () {
            statusEl.classList.remove("show", "success");
          }, 4000);
        }
      });
    }

    function renderAuditLogs() {
      var tbody = document.getElementById("auditLogTableBody");
      if (!tbody) return;
      tbody.innerHTML = "";
      getAuditLog()
        .slice()
        .reverse()
        .slice(0, 200)
        .forEach(function (entry) {
          var tr = document.createElement("tr");
          tr.appendChild(td(new Date(entry.createdAt).toLocaleString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US")));
          tr.appendChild(td(entry.actorEmail));
          tr.appendChild(td(t("admin.auditAction." + entry.action)));
          tr.appendChild(td(entry.target || "—"));
          tr.appendChild(td(entry.details || "—"));
          tbody.appendChild(tr);
        });
    }

    /* ---------- سجل البريد الإلكتروني (محاكاة) ----------
       يعرض كل رسائل "البريد" التي حاكاها الموقع (انظر simulateSendEmail) عند إرسال أي
       إشعار داخلي — تُظهر إلى مَن أُرسلت، موضوعها، نصها، ووقت الإرسال، بدون أي اتصال
       فعلي بخدمة بريد خارجية. */
    function renderEmailLog() {
      var tbody = document.getElementById("emailLogTableBody");
      var emptyEl = document.getElementById("emailLogEmpty");
      if (!tbody) return;
      tbody.innerHTML = "";
      var log = getEmailLog().slice().reverse().slice(0, 200);
      if (emptyEl) emptyEl.style.display = log.length ? "none" : "";
      log.forEach(function (entry) {
        var tr = document.createElement("tr");
        tr.appendChild(td(new Date(entry.createdAt).toLocaleString(currentLang === "ar" ? "ar-EG-u-nu-latn" : "en-US")));
        tr.appendChild(td(entry.toEmail));
        tr.appendChild(td(entry.subject || "—"));
        tr.appendChild(td(entry.body || "—"));
        tbody.appendChild(tr);
      });
    }

    /* ============================================================
       إدارة قاعدة البيانات (خام) — قسم للمدير العام حصريًا يمنحه وصولًا
       مباشرًا لكل مجموعات البيانات المخزّنة محليًا (وتُزامَن تلقائيًا مع
       Supabase حيثما كان ذلك مفعّلاً بالفعل عبر الدوال الأصلية لكل قسم):
       عرض/بحث/إضافة/تعديل/حذف لأي سجل، بالإضافة لتحرير الجدول كاملاً
       كنص JSON خام دفعة واحدة. لا تظهر هذه الأداة ولا يمكن منحها لأي
       موظف إدارة آخر (انظر GRANTABLE_SECTIONS) لأنها قوية جدًا ويمكن أن
       تُستخدم لتجاوز كل الضوابط الأخرى في الموقع لو أُسيء استخدامها.
       ============================================================ */
    var DB_TABLE_DEFS = [
      { id: "users", labelKey: "admin.database.table.users", get: getUsers, save: saveUsers, idField: "email", isUsers: true },
      { id: "listings", labelKey: "admin.database.table.listings", get: getListings, save: saveListings, idField: "id" },
      { id: "messages", labelKey: "admin.database.table.messages", get: getMessages, save: saveMessages, idField: "id" },
      { id: "notifications", labelKey: "admin.database.table.notifications", get: getNotifications, save: saveNotifications, idField: "id" },
      { id: "favorites", labelKey: "admin.database.table.favorites", get: getFavoritesRows, save: saveFavoritesRows, idField: "_rowId" },
      { id: "reviews", labelKey: "admin.database.table.reviews", get: getReviews, save: saveReviews, idField: "id" },
      { id: "reports", labelKey: "admin.database.table.reports", get: getReports, save: saveReports, idField: "id" },
      { id: "coupons", labelKey: "admin.database.table.coupons", get: getCoupons, save: saveCoupons, idField: "id" },
      { id: "customCategories", labelKey: "admin.database.table.customCategories", get: getCustomCategories, save: saveCustomCategories, idField: "id" },
      { id: "auditLog", labelKey: "admin.database.table.auditLog", get: getAuditLog, save: saveAuditLog, idField: "id" },
    ];
    var DB_TABLE_ICONS = {
      users: "👤",
      listings: "🏠",
      messages: "💬",
      notifications: "🔔",
      favorites: "❤️",
      reviews: "⭐",
      reports: "🚩",
      coupons: "🎟️",
      customCategories: "🏷️",
      auditLog: "📜",
    };
    var dbActiveTableId = DB_TABLE_DEFS[0].id;
    var dbFilterText = "";
    var dbPage = 1;
    var DB_PAGE_SIZE = 12;

    /* يحدّد نوع حقل قيمة معيّنة لبناء عنصر إدخال مناسب له في نموذج الحقول */
    function dbInferFieldType(value) {
      if (typeof value === "boolean") return "boolean";
      if (typeof value === "number") return "number";
      if (value !== null && typeof value === "object") return "json";
      if (typeof value === "string" && (value.length > 70 || value.indexOf("\n") !== -1)) return "textarea";
      return "text";
    }

    /* قيمة مختصرة لعرضها داخل بطاقة السجل — تتفادى إغراق البطاقة بنصوص base64 الطويلة */
    function dbFormatPreviewValue(value) {
      if (value === null || value === undefined || value === "") return "—";
      if (typeof value === "boolean") return value ? "✓" : "✗";
      if (Array.isArray(value)) return "[" + value.length + "]";
      if (typeof value === "object") return "{…}";
      var str = String(value);
      if (str.length > 240 && /^data:|^https?:\/\/\S{40,}/.test(str) === false && /^[A-Za-z0-9+/=]{200,}$/.test(str)) {
        return "📎 " + t("admin.database.attachmentValue");
      }
      if (str.length > 46) return str.slice(0, 46) + "…";
      return str;
    }

    /* يبني صف حقل واحد (تسمية + شارة النوع + عنصر إدخال مناسب) لنموذج التعديل/الإضافة القائم على الحقول */
    function buildDbFieldRow(key, value, isIdField) {
      var type = dbInferFieldType(value);
      var row = document.createElement("div");
      row.className = "db-field-row" + (type === "boolean" ? " db-field-boolean" : "");

      var labelEl = document.createElement("label");
      var keySpan = document.createElement("span");
      keySpan.textContent = key + (isIdField ? " 🔑" : "");
      labelEl.appendChild(keySpan);
      var badge = document.createElement("span");
      badge.className = "db-field-type-badge";
      badge.textContent = t(
        "admin.database.fieldType." + (type === "json" ? (Array.isArray(value) ? "array" : "object") : type)
      );
      labelEl.appendChild(badge);
      row.appendChild(labelEl);

      var input;
      if (type === "boolean") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!value;
      } else if (type === "number") {
        input = document.createElement("input");
        input.type = "number";
        input.value = value === null || value === undefined ? "" : value;
      } else if (type === "textarea") {
        input = document.createElement("textarea");
        input.rows = 3;
        input.value = value === null || value === undefined ? "" : String(value);
      } else if (type === "json") {
        input = document.createElement("textarea");
        input.className = "db-field-json";
        input.rows = 5;
        input.value = JSON.stringify(value, null, 2);
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.value = value === null || value === undefined ? "" : String(value);
      }
      input.dataset.dbFieldKey = key;
      input.dataset.dbFieldType = type;
      row.appendChild(input);
      return row;
    }

    /* يقرأ كل صفوف الحقول داخل حاوية النموذج ويعيد بناء الكائن/السجل منها */
    function readDbFieldsFromForm(container) {
      var obj = {};
      var jsonErrors = [];
      Array.prototype.forEach.call(container.querySelectorAll("[data-db-field-key]"), function (input) {
        var key = input.dataset.dbFieldKey;
        var type = input.dataset.dbFieldType;
        if (type === "boolean") {
          obj[key] = input.checked;
        } else if (type === "number") {
          var trimmed = input.value.trim();
          if (trimmed === "") {
            obj[key] = null;
          } else {
            var n = Number(trimmed);
            obj[key] = isNaN(n) ? trimmed : n;
          }
        } else if (type === "json") {
          var raw = input.value.trim();
          try {
            obj[key] = raw === "" ? null : JSON.parse(raw);
          } catch (e) {
            jsonErrors.push(key);
            obj[key] = raw;
          }
        } else {
          obj[key] = input.value;
        }
      });
      return { obj: obj, jsonErrors: jsonErrors };
    }

    function dbTableDef(id) {
      return DB_TABLE_DEFS.find(function (t2) { return t2.id === id; }) || DB_TABLE_DEFS[0];
    }
    /* يمنع ترك المنصة بلا أي مدير عام معتمد — يُستدعى قبل أي حذف/تعديل/استبدال
       خام لجدول المستخدمين، سواء لسجل واحد أو لكامل الجدول دفعة واحدة. */
    function dbWouldRemoveLastSuperAdmin(newUsersList) {
      var stillHasSuperAdmin = newUsersList.some(function (u) {
        return u && u.role === "super_admin";
      });
      return !stillHasSuperAdmin;
    }

    function renderDatabaseAdmin() {
      var tabsWrap = document.getElementById("dbTableTabs");
      var wrap = document.getElementById("dbTableWrap");
      var formPanel = document.getElementById("dbRecordFormPanel");
      var rawPanel = document.getElementById("dbRawJsonPanel");
      if (!tabsWrap || !wrap) return;
      formPanel.style.display = "none";
      rawPanel.style.display = "none";
      formPanel.innerHTML = "";
      rawPanel.innerHTML = "";

      tabsWrap.innerHTML = "";
      DB_TABLE_DEFS.forEach(function (def) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-ghost btn-xs db-table-tab" + (def.id === dbActiveTableId ? " active" : "");
        var count = 0;
        try { count = def.get().length; } catch (e) { count = 0; }
        btn.textContent = (DB_TABLE_ICONS[def.id] || "🗂️") + " " + t(def.labelKey) + " (" + count + ")";
        btn.addEventListener("click", function () {
          dbActiveTableId = def.id;
          dbFilterText = "";
          dbPage = 1;
          renderDatabaseAdmin();
        });
        tabsWrap.appendChild(btn);
      });

      var def = dbTableDef(dbActiveTableId);
      var allRows = [];
      try { allRows = def.get().slice(); } catch (e) { allRows = []; }

      wrap.innerHTML = "";

      var toolbar = document.createElement("div");
      toolbar.className = "db-toolbar";
      var searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = t("admin.database.searchPlaceholder");
      searchInput.value = dbFilterText;
      searchInput.addEventListener("input", function () {
        dbFilterText = searchInput.value.trim().toLowerCase();
        dbPage = 1;
        renderDatabaseAdmin();
      });
      toolbar.appendChild(searchInput);

      var addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-solid btn-xs";
      addBtn.textContent = t("admin.database.addRecordBtn");
      addBtn.addEventListener("click", function () { openDbRecordForm(null); });
      toolbar.appendChild(addBtn);

      var rawBtn = document.createElement("button");
      rawBtn.type = "button";
      rawBtn.className = "btn btn-ghost btn-xs";
      rawBtn.textContent = t("admin.database.editRawBtn");
      rawBtn.addEventListener("click", openDbRawJsonEditor);
      toolbar.appendChild(rawBtn);

      wrap.appendChild(toolbar);

      var note = document.createElement("p");
      note.className = "admin-note";
      note.textContent = t("admin.database.note");
      wrap.appendChild(note);

      var filteredRows = !dbFilterText ? allRows : allRows.filter(function (row) {
        try { return JSON.stringify(row).toLowerCase().indexOf(dbFilterText) !== -1; } catch (e) { return false; }
      });

      var grid = document.createElement("div");
      grid.className = "db-grid";

      var totalPages = Math.max(1, Math.ceil(filteredRows.length / DB_PAGE_SIZE));
      if (dbPage > totalPages) dbPage = totalPages;
      var start = (dbPage - 1) * DB_PAGE_SIZE;
      var pageRows = filteredRows.slice(start, start + DB_PAGE_SIZE);

      if (!pageRows.length) {
        var emptyState = document.createElement("div");
        emptyState.className = "db-empty-state";
        emptyState.textContent = t("admin.database.emptyTable");
        grid.appendChild(emptyState);
      }

      pageRows.forEach(function (row) {
        var idVal = row[def.idField];
        var card = document.createElement("div");
        card.className = "db-record-card";

        var head = document.createElement("div");
        head.className = "db-record-card-head";
        var idBadge = document.createElement("span");
        idBadge.className = "db-record-id";
        idBadge.textContent = idVal !== undefined && idVal !== null && idVal !== "" ? String(idVal) : "—";
        idBadge.title = idBadge.textContent;
        head.appendChild(idBadge);
        var iconSpan = document.createElement("span");
        iconSpan.className = "db-record-icon";
        iconSpan.textContent = DB_TABLE_ICONS[def.id] || "🗂️";
        head.appendChild(iconSpan);
        card.appendChild(head);

        var fieldsWrap = document.createElement("div");
        fieldsWrap.className = "db-record-fields";
        var shownKeys = Object.keys(row)
          .filter(function (k) { return k !== def.idField; })
          .slice(0, 6);
        shownKeys.forEach(function (k) {
          var fRow = document.createElement("div");
          fRow.className = "db-record-field-row";
          var kEl = document.createElement("span");
          kEl.className = "db-record-field-key";
          kEl.textContent = k + ":";
          var vEl = document.createElement("span");
          vEl.className = "db-record-field-value";
          vEl.textContent = dbFormatPreviewValue(row[k]);
          fRow.appendChild(kEl);
          fRow.appendChild(vEl);
          fieldsWrap.appendChild(fRow);
        });
        card.appendChild(fieldsWrap);

        var actionsRow = document.createElement("div");
        actionsRow.className = "db-record-card-actions";
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-ghost btn-xs";
        editBtn.textContent = t("admin.database.editBtn");
        editBtn.addEventListener("click", function () { openDbRecordForm(row); });
        actionsRow.appendChild(editBtn);

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-ghost btn-xs btn-danger";
        deleteBtn.textContent = t("admin.database.deleteBtn");
        deleteBtn.addEventListener("click", function () {
          if (!window.confirm(t("admin.database.deleteConfirm"))) return;
          var remaining = allRows.filter(function (r) { return r[def.idField] !== row[def.idField]; });
          if (def.isUsers && dbWouldRemoveLastSuperAdmin(remaining)) {
            window.alert(t("admin.database.lastSuperAdminError"));
            return;
          }
          def.save(remaining);
          logAuditEvent("database_record_deleted", def.id + ":" + row[def.idField], "");
          renderDatabaseAdmin();
        });
        actionsRow.appendChild(deleteBtn);
        card.appendChild(actionsRow);

        grid.appendChild(card);
      });
      wrap.appendChild(grid);

      var paginationEl = document.createElement("div");
      paginationEl.className = "pagination-controls";
      paginationEl.id = "dbPagination";
      wrap.appendChild(paginationEl);
      renderPaginationBar("dbPagination", dbPage, totalPages, function (p) {
        dbPage = p;
        renderDatabaseAdmin();
      });

      function openDbRecordForm(existingRow) {
        formPanel.style.display = "";
        rawPanel.style.display = "none";
        formPanel.innerHTML = "";

        var heading = document.createElement("h3");
        heading.textContent = t(existingRow ? "admin.database.editRecordHeading" : "admin.database.addRecordHeading") + " — " + t(def.labelKey);
        formPanel.appendChild(heading);

        var hint = document.createElement("p");
        hint.className = "admin-note";
        hint.textContent = t("admin.database.fieldFormHint");
        formPanel.appendChild(hint);

        /* عند الإضافة: نبني شكل الحقول من أحد السجلات الموجودة فعليًا في نفس الجدول (إن وُجد)
           بقيم فارغة، بحيث يحصل المستخدم على نفس بنية الحقول المعتادة بدل نموذج فارغ تمامًا. */
        var initialObj;
        if (existingRow) {
          initialObj = existingRow;
        } else {
          var templateRow = allRows.length ? allRows[0] : null;
          initialObj = {};
          if (templateRow) {
            Object.keys(templateRow).forEach(function (k) {
              var v = templateRow[k];
              if (typeof v === "boolean") initialObj[k] = false;
              else if (typeof v === "number") initialObj[k] = 0;
              else if (Array.isArray(v)) initialObj[k] = [];
              else if (v !== null && typeof v === "object") initialObj[k] = {};
              else initialObj[k] = "";
            });
          }
          if (!(def.idField in initialObj)) initialObj[def.idField] = "";
        }

        var fieldsContainer = document.createElement("div");
        fieldsContainer.className = "db-field-form";
        Object.keys(initialObj).forEach(function (k) {
          fieldsContainer.appendChild(buildDbFieldRow(k, initialObj[k], k === def.idField));
        });
        formPanel.appendChild(fieldsContainer);

        /* صف إضافة حقل مخصص جديد — يعوّض عن مرونة التحرير الخام لمن يحتاج حقلاً غير معتاد */
        var addFieldRow = document.createElement("div");
        addFieldRow.className = "db-field-add-row";
        var newKeyInput = document.createElement("input");
        newKeyInput.type = "text";
        newKeyInput.placeholder = t("admin.database.newFieldKeyPlaceholder");
        var newValueInput = document.createElement("input");
        newValueInput.type = "text";
        newValueInput.placeholder = t("admin.database.newFieldValuePlaceholder");
        var addFieldBtn = document.createElement("button");
        addFieldBtn.type = "button";
        addFieldBtn.className = "btn btn-ghost btn-xs";
        addFieldBtn.textContent = t("admin.database.addFieldBtn");
        addFieldBtn.addEventListener("click", function () {
          var newKey = newKeyInput.value.trim();
          if (!newKey) return;
          var exists = !!fieldsContainer.querySelector('[data-db-field-key="' + CSS.escape(newKey) + '"]');
          if (exists) {
            window.alert(t("admin.database.duplicateFieldKeyError"));
            return;
          }
          fieldsContainer.appendChild(buildDbFieldRow(newKey, newValueInput.value, false));
          newKeyInput.value = "";
          newValueInput.value = "";
          newKeyInput.focus();
        });
        addFieldRow.appendChild(newKeyInput);
        addFieldRow.appendChild(newValueInput);
        addFieldRow.appendChild(addFieldBtn);
        formPanel.appendChild(addFieldRow);

        var statusEl = document.createElement("div");
        statusEl.className = "form-status";
        formPanel.appendChild(statusEl);

        var actionsRow = document.createElement("div");
        actionsRow.style.marginTop = "12px";

        var saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "btn btn-solid";
        saveBtn.textContent = t("admin.database.saveBtn");
        saveBtn.addEventListener("click", function () {
          var fieldResult = readDbFieldsFromForm(fieldsContainer);
          if (fieldResult.jsonErrors.length) {
            statusEl.textContent = t("admin.database.invalidFieldJsonError").replace(
              "{fields}",
              fieldResult.jsonErrors.join("، ")
            );
            statusEl.classList.add("show", "error");
            return;
          }
          var parsed = fieldResult.obj;
          var newId = parsed[def.idField];
          if (newId === undefined || newId === null || newId === "") {
            if (def.idField === "id") {
              newId = def.id.slice(0, 3) + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
              parsed[def.idField] = newId;
            } else {
              statusEl.textContent = t("admin.database.missingIdError");
              statusEl.classList.add("show", "error");
              return;
            }
          }

          var current = def.get().slice();
          var originalId = existingRow ? existingRow[def.idField] : null;
          var collidesWithOther = current.some(function (r) {
            return r[def.idField] === newId && (!existingRow || r[def.idField] !== originalId);
          });
          if (collidesWithOther) {
            statusEl.textContent = t("admin.database.duplicateIdError");
            statusEl.classList.add("show", "error");
            return;
          }

          var updated;
          if (existingRow) {
            updated = current.map(function (r) {
              return r[def.idField] === originalId ? parsed : r;
            });
          } else {
            updated = current.concat([parsed]);
          }

          if (def.isUsers && dbWouldRemoveLastSuperAdmin(updated)) {
            statusEl.textContent = t("admin.database.lastSuperAdminError");
            statusEl.classList.add("show", "error");
            return;
          }

          def.save(updated);
          logAuditEvent(existingRow ? "database_record_updated" : "database_record_created", def.id + ":" + newId, "");
          formPanel.style.display = "none";
          renderDatabaseAdmin();
        });
        actionsRow.appendChild(saveBtn);

        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn-ghost";
        cancelBtn.style.marginInlineStart = "10px";
        cancelBtn.textContent = t("admin.database.cancelBtn");
        cancelBtn.addEventListener("click", function () { formPanel.style.display = "none"; });
        actionsRow.appendChild(cancelBtn);

        formPanel.appendChild(actionsRow);
        formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      function openDbRawJsonEditor() {
        rawPanel.style.display = "";
        formPanel.style.display = "none";
        rawPanel.innerHTML = "";

        var heading = document.createElement("h3");
        heading.textContent = t("admin.database.rawEditHeading") + " — " + t(def.labelKey);
        rawPanel.appendChild(heading);

        var warning = document.createElement("p");
        warning.className = "admin-note";
        warning.textContent = t("admin.database.rawEditWarning");
        rawPanel.appendChild(warning);

        var textarea = document.createElement("textarea");
        textarea.className = "db-json-editor";
        textarea.rows = 20;
        textarea.value = JSON.stringify(def.get(), null, 2);
        rawPanel.appendChild(textarea);

        var statusEl = document.createElement("div");
        statusEl.className = "form-status";
        rawPanel.appendChild(statusEl);

        var actionsRow = document.createElement("div");
        actionsRow.style.marginTop = "12px";

        var saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "btn btn-solid";
        saveBtn.textContent = t("admin.database.saveBtn");
        saveBtn.addEventListener("click", function () {
          var parsed;
          try {
            parsed = JSON.parse(textarea.value);
          } catch (e) {
            statusEl.textContent = t("admin.database.invalidJsonError");
            statusEl.classList.add("show", "error");
            return;
          }
          if (!Array.isArray(parsed)) {
            statusEl.textContent = t("admin.database.notArrayError");
            statusEl.classList.add("show", "error");
            return;
          }
          if (def.isUsers && dbWouldRemoveLastSuperAdmin(parsed)) {
            statusEl.textContent = t("admin.database.lastSuperAdminError");
            statusEl.classList.add("show", "error");
            return;
          }
          def.save(parsed);
          logAuditEvent("database_table_bulk_edited", def.id, "");
          rawPanel.style.display = "none";
          renderDatabaseAdmin();
        });
        actionsRow.appendChild(saveBtn);

        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn-ghost";
        cancelBtn.style.marginInlineStart = "10px";
        cancelBtn.textContent = t("admin.database.cancelBtn");
        cancelBtn.addEventListener("click", function () { rawPanel.style.display = "none"; });
        actionsRow.appendChild(cancelBtn);

        rawPanel.appendChild(actionsRow);
        rawPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    function renderSection(sec) {
      if (sec === "dashboard") renderDashboard();
      else if (sec === "users") { renderPendingReview(); renderUsers(); }
      else if (sec === "cars") renderCars();
      else if (sec === "properties") renderProperties();
      else if (sec === "categories") renderCategoriesAdmin();
      else if (sec === "listings") renderMasterListings();
      else if (sec === "payments") renderPayments();
      else if (sec === "subscriptions") renderSubscriptions();
      else if (sec === "reports") renderReports();
      else if (sec === "content") renderContentEditor();
      else if (sec === "settings") renderSettings();
      else if (sec === "adminUsers") renderAdminUsers();
      else if (sec === "auditLogs") renderAuditLogs();
      else if (sec === "emailLog") renderEmailLog();
      else if (sec === "database") renderDatabaseAdmin();
    }

    function showSection(sec) {
      activeSection = sec;
      ADMIN_SECTION_ORDER.forEach(function (s) {
        var el = document.getElementById("section-" + s);
        if (el) el.style.display = s === sec ? "" : "none";
      });
      Array.prototype.forEach.call(nav.querySelectorAll("button"), function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-section") === sec);
      });
      renderSection(sec);
    }

    /* ---------- بالونات حمراء عند تبويبات القائمة الجانبية التي تحتاج انتباه الإدارة: طلبات
       تسجيل بانتظار المراجعة (المستخدمون)، وبلاغات/شكاوى بحاجة لمعالجة (البلاغات) — تظهر
       تلقائيًا بالعدد الفعلي دون الحاجة لفتح التبويب أولاً، وتختفي عند عدم وجود شيء معلّق. ---------- */
    var ADMIN_NAV_BADGE_SOURCES = {
      users: function () {
        return getUsers().filter(function (u) {
          return !u.reviewStatus || u.reviewStatus === "pending";
        }).length;
      },
      reports: function () {
        return getReports().filter(function (r) {
          return r.status === "open";
        }).length;
      },
    };
    function updateAdminNavBadge(sec) {
      var badge = document.getElementById("adminNavBadge_" + sec);
      var countFn = ADMIN_NAV_BADGE_SOURCES[sec];
      if (!badge || !countFn) return;
      var count = countFn();
      if (count > 0) {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    }
    function updateAllAdminNavBadges() {
      Object.keys(ADMIN_NAV_BADGE_SOURCES).forEach(updateAdminNavBadge);
    }
    // إبقاء الاسم القديم متاحًا لأي استدعاء سابق (تحديث المستخدمين فقط) لضمان التوافق
    function updateAdminUsersNavBadge() {
      updateAdminNavBadge("users");
    }

    nav.innerHTML = "";
    sections.forEach(function (sec) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-section", sec);
      var iconSpan = document.createElement("span");
      iconSpan.className = "admin-nav-icon";
      iconSpan.textContent = ADMIN_NAV_ICONS[sec] || "•";
      iconSpan.setAttribute("aria-hidden", "true");
      btn.appendChild(iconSpan);
      var labelSpan = document.createElement("span");
      labelSpan.className = "admin-nav-label";
      labelSpan.textContent = t("admin.nav." + sec);
      btn.appendChild(labelSpan);
      if (ADMIN_NAV_BADGE_SOURCES[sec]) {
        var navBadge = document.createElement("span");
        navBadge.className = "unread-badge admin-nav-badge";
        navBadge.id = "adminNavBadge_" + sec;
        navBadge.style.display = "none";
        btn.appendChild(navBadge);
      }
      btn.addEventListener("click", function () { showSection(sec); });
      nav.appendChild(btn);
    });
    updateAllAdminNavBadges();

    showSection(sections[0]);
    window.__rerenderAdmin = function () {
      if (activeSection) showSection(activeSection);
    };
    refreshReportsFromSupabase();
  }

  /* ---------- تشغيل كل الوحدات بعد تحميل الصفحة ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    applyTranslations();
    initLangToggle();
    initThemeToggle();
    initMobileNavToggle();
    initMobileBottomNav();
    initMobileAppBar();
    initMaterialRipple();
    initHideChromeOnFocus();
    initHeaderAuthState();
    initSearchTabs();
    initAdvancedFiltersToggle();
    initSignupForm();
    initLoginForm();
    initAdminLoginForm();
    initAdminRegisterPage();
    initForgotPassword();
    initProfileModal();
    initListingForm();
    renderHomeListings();
    initListingDetailPage();
    initMessagesPage();
    initMyListingsPage();
    initFavoritesPage();
    initSubscriptionPage();
    initAdminPage();
    renderMaintenanceBanner();
    if (document.getElementById("realestateGrid") || document.getElementById("vehiclesGrid")) {
      window.__rerenderPage = renderHomeListings;
    }
    refreshListingsFromSupabase().then(function () {
      refreshMessagesFromSupabase();
      refreshFavoritesFromSupabase();
      refreshNotificationsFromSupabase();
    });
  });
})();
