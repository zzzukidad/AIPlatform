# AIPlatform security audit

**Review date:** 2026-09-05 (Australia/Perth)  
**Review type:** Static application, route, integration, extension, WordPress, deployment, and dependency review  
**Repository:** `zzukidad/AIPlatform`, branch `arena/01a071f3-aiplatform`

## Scope and limitations

Reviewed the Laravel application (`app/`, `routes/`, configuration, deployment files, and the committed extensions), the duplicated `Extensions/Extensions` tree, `WordPress Extension/`, frontend dependency manifests, and the committed SQL/deployment material. I inspected approximately 369 primary PHP controller/service/middleware/model-related files plus route and integration call sites, with targeted review of high-risk handlers.

This is not a claim that every execution path has been proven exploitable. There is no configured database, production credential set, PHP vendor tree, Composer binary, or running HTTP/WebSocket service in this checkout, so route reachability, middleware behavior in the deployed stack, provider registration, provider-specific webhook fixtures, and exploitability of some dependency findings still require runtime confirmation.

Severity uses **Critical**, **High**, **Medium**, and **Low**. “Confirmed from source” means the authorization, secret-handling, or unsafe operation is directly visible in reviewed code; it does not mean an exploit was run against a live installation.

## Executive summary

The highest-risk issues are:

1. Public extension installation/removal and public update/migration surfaces can modify the application and execute marketplace-supplied extension code.
2. An authenticated API user can obtain application-wide provider secrets through the app-settings and entity endpoints, including OpenAI, payment, OAuth, SMTP, and other integration credentials.
3. Multiple authenticated API endpoints have object-level authorization failures, including cross-user document read/update/delete and cross-user chat mutation/AI spending.
4. Public routes perform server-side URL fetching, file/PDF processing, OpenAI streaming, cache/log mutation, and uploads without authentication or useful resource limits.
5. Dashboard CSRF protection is disabled for the entire `dashboard/*` namespace.
6. Razorpay webhook processing lacks visible authenticity verification and can credit plans from attacker-controlled event fields.
7. The included WordPress plugin has unauthenticated/private AJAX data and mutation paths, missing nonce/capability/ownership checks, SSRF, stored-XSS opportunities, client-side exposure of the OpenAI key, and an HTTP remote updater.
8. `npm audit --package-lock-only --json` reported **27 vulnerabilities**: 20 high, 5 moderate, and 2 low. Composer audit could not be run because `composer` is not installed.

## Confirmed or high-confidence findings

### C-01 — Public extension install/uninstall is a privileged code/deployment operation
**Severity: Critical**  
**Confidence: Confirmed from source; exploitability depends only on the application being reachable.**

`routes/web.php:63-71` exposes `POST /install-extension/{slug}` and `POST /uninstall-extension/{slug}` without `auth`, `admin`, signed URL, or visible CSRF middleware. `InstallationController::installExtension()` and `uninstallExtension()` call the extension service directly (`app/Http/Controllers/InstallationController.php:249-318`).

`app/Domains/Marketplace/Services/ExtensionInstallService.php:67-127` downloads marketplace content, writes and extracts a ZIP, clears caches, runs forced migrations, publishes vendor files, updates installation state, and invokes extension lifecycle handling. The legacy installer in `app/Services/Extension/Traits/InstallExtension.php:48-180` copies controllers, routes, views, stubs, and runs `DB::unprepared()` over package SQL.

Impact includes unauthenticated destructive changes and arbitrary application-code installation if the marketplace response, package, or extraction path is compromised. ZIP member paths are not visibly validated before `extractTo()`.

**Required remediation:** require authenticated super-admin authorization and CSRF/signed requests; remove the public update/install routes; verify package signatures and immutable hashes; validate ZIP members against traversal/symlink paths; run installation out of process with least privilege; review SQL and file destinations; add audit logs and idempotency.

### C-02 — Authenticated API users receive application-wide secrets
**Severity: Critical**  
**Confidence: Confirmed from source.**

`routes/api.php:44-46` puts the app API routes behind ordinary `auth:api`, not admin authorization. `AppController::getSetting()` merges and returns every column from `Setting` and `SettingTwo` (`app/Http/Controllers/Api/AppController.php:81-100`). The models have no hidden secret fields (`app/Models/Setting.php:17-25`, `app/Models/SettingTwo.php:15-25`). Depending on configuration, this includes OpenAI, Stripe, OAuth, SMTP, reCAPTCHA, Stable Diffusion, ElevenLabs, Serper, and other provider secrets.

A separate endpoint is equally serious: `EntityController::getAllEntities()` returns each entity's `key_value` and token rows to any authenticated API user (`app/Http/Controllers/Api/EntityController.php:60-75`); `EntityEnum::valueAsString()` returns the raw enum value (`app/Domains/Entity/Enums/EntityEnum.php:1801-1808`). `AIRealTimeChatController::getWebsocketCredentials()` also returns three Base64 fragments that reconstruct the configured OpenAI API key (`app/Http/Controllers/Api/AIRealTimeChatController.php:1100-1120`). Base64/random splitting is not encryption, so every ordinary API user can recover the server key.

**Required remediation:** return an explicit allowlisted public-settings DTO; never serialize settings or entity credentials; rotate every secret exposed by deployed instances; make provider credentials server-side only and use short-lived, scoped tokens where a client feature truly requires one.

### C-03 — Public file upload can write executable PHP and SVG content
**Severity: Critical when the public directory is PHP-executable; High otherwise**  
**Confidence: Confirmed from source; final RCE impact depends on web-server execution rules.**

`routes/panel.php:916` exposes `POST files/upload` outside the dashboard group. `CommonController::filesUpload()` takes a caller-controlled MIME type and filename, writes decoded bytes to `public/uploads/media/...`, and uses the original filename in the destination (`app/Http/Controllers/Common/CommonController.php:184-248`). The extension is derived from the supplied MIME type by `mimeToExtension()` (`app/Helpers/helpers.php:1690-1775`), which explicitly maps `text/x-php` to `php` and `image/svg+xml` to `svg`.

`validateUploadedFile()` only scans the first 1024 bytes for PHP/script patterns and does not validate the complete file, and it performs image validation only for JPG/JPEG/PNG/GIF/WEBP (`app/Helpers/helpers.php:2080-2113`). A PHP payload placed after the first kilobyte can therefore pass and be saved with a `.php` suffix. SVG is not image-validated or sanitized, so attacker-controlled script-bearing SVG can be stored in a public path and served to site users/admins. The request has no application-level size/count limit.

**Required remediation:** deny executable extensions regardless of client MIME; generate server-side names and canonicalize/contain the destination; store uploads outside the web root or disable script execution in the upload directory; use `finfo` plus full-file type validation and image re-encoding; sanitize or disallow SVG; enforce byte/count limits; and delete rejected files using the actual absolute path.

### H-01 — Cross-user document IDOR permits disclosure, tampering, and deletion
**Severity: High**  
**Confidence: Confirmed from source.**

The authenticated document API correctly scopes list queries, but the single-object methods do not. `DocumentsApiController::getDoc()`, `saveDoc()`, and `deleteDoc()` query only `user_openai.id` (`app/Http/Controllers/Api/DocumentsApiController.php:300-319`, `381-411`, `454-478`) and never constrain `user_id` to `$request->user()->id`.

Any authenticated API user who learns or guesses another numeric document ID can read its generated content, overwrite its title/output, or delete it.

**Required remediation:** use `$request->user()->openai()->whereKey($id)` or policies/route-bound scoped models for every operation; add authorization tests for read, update, and delete.

### H-02 — AI chat endpoints trust arbitrary conversation/message IDs
**Severity: High**  
**Confidence: Confirmed from source.**

The collection/history endpoints mostly scope by user, but the expensive and mutating chat stream does not. In `app/Http/Controllers/Api/AIChatController.php:547-699`, POST `/api/aichat/chat-send` loads the conversation with `UserOpenaiChat::where('id', $request->conver_id)->first()` and loads/saves messages with `whereId()` without checking ownership. The GET streaming branch can read an arbitrary message/chat and then save the generated response and credits to it. `AIRealTimeChatController` contains the same logic.

`AIChatController::changeChatTitle()` (`app/Http/Controllers/Api/AIChatController.php:1038-1070`) accepts an arbitrary message ID and changes the associated chat title without ownership checking. `conversationChats()` scopes the conversation but, when a message ID is supplied, retrieves `UserOpenaiChatMessage::whereId($id)->first()` independently (`:807-825`).

The same defect exists in the separate writer API: `AIWriterController::streamedTextOutput()` loads `UserOpenai` by arbitrary `message_id` and later saves it (`app/Http/Controllers/Api/AIWriterController.php:238-266`, `403-410`), while `lowGenerateSave()` updates any `UserOpenai::find($request->message_id)` (`:562-576`).

Impact includes cross-user chat/document disclosure and tampering, charging the attacker’s provider/credit balance while modifying another user’s record, and possible denial of service through long-running generation.

**Required remediation:** resolve the conversation and message through the current user relation, enforce policies before every read/write/stream, verify message-to-conversation consistency, and rate-limit/queue generation.

### H-03 — Any authenticated API user can create/update/delete global chat templates
**Severity: High**  
**Confidence: Confirmed from source.**

Both chat-template route groups are only under `auth:api` (`routes/api.php:73-77` and `104-108`). `ChatTemplatesController::update()` creates or updates any template ID and accepts an uploaded avatar (`app/Http/Controllers/Api/ChatTemplatesController.php:155-211`); `destroy()` deletes any template (`:252-263`). No admin/policy check is visible. This permits global prompt/template defacement or deletion by a normal account and can affect all users. The avatar path and SVG allowance also need content validation and serving isolation.

**Required remediation:** make these admin-only or scope templates to the owning tenant; use policies and validated storage uploads; sanitize SVG or disallow it; add destructive-action authorization tests.

### H-04 — Public, unauthenticated operational routes
**Severity: High**  
**Confidence: Confirmed from route mapping.**

The dashboard authentication group ends at `routes/panel.php:887`. The translation group at `:889-904` has its own configured `['web', 'auth', 'admin']` middleware, but the write routes at `:906-910` are outside it. The following routes are therefore public at the route-definition level, despite handling state changes and resource-heavy operations:

- `POST translations/lang/update/{id}`, `POST translations/lang/update-all`, and `POST translations/lang-save`;
- `POST image/upload`, `POST images/upload`, and `POST files/upload`;
- `POST pdf/getContent`; and
- `POST rss/fetch`.

`routes/web.php:63-79` also exposes `upgrade-script`, `update-manual`, cache clearing, log clearing, font-cache refresh, and debug toggling without an authentication middleware at the route definition.

`CommonController::imagesUpload()` and `imageUpload()` accept base64/file content and write to local or object storage (`app/Http/Controllers/Common/CommonController.php:134-174`, `292-327`). `filesUpload()` uses `auth()->id()` despite the route being public and writes to a public path (`:176-290`). `ChatPdfController::getSimiliarContent()` invokes vector processing for caller-supplied chat/prompt IDs (`app/Http/Controllers/ChatPdfController.php:127-137`). `ClearController::cacheClear()` and `clearLog()` are public destructive operations (`app/Http/Controllers/Common/ClearController.php:12-36`).

**Required remediation:** move all operational routes into explicit authenticated groups; require admin policy for translation/update/cache actions; apply CSRF, file-size/type/content limits, ownership checks, and per-IP/user throttles; keep generated files outside executable public paths.

### H-05 — Public OpenAI streaming abuse through test route
**Severity: High**  
**Confidence: Confirmed from source.**

`routes/web.php:25-27` exposes `/test/stream/{model}` publicly. `TestController::stream()` accepts any model beginning with `gpt`, selects the server-side OpenAI key, and calls OpenAI with no authentication, credit accounting, or rate limit (`app/Http/Controllers/TestController.php:20-74`). An attacker can repeatedly spend the operator’s provider budget and hold workers open. The `test` routes should not be deployed at all.

### H-06 — Public RSS SSRF and resource exhaustion
**Severity: High**  
**Confidence: Confirmed from source.**

`routes/panel.php:920` exposes `rss/fetch` publicly. `CommonController::rssFetch()` passes the request URL to `parseRSS()` (`app/Http/Controllers/Common/CommonController.php:329-348`), while `app/Helpers/helpers.php:1175-1188` calls `file_get_contents($feed_url)` and parses the result. There is no visible scheme/port allowlist, private/link-local/loopback block, post-DNS validation, timeout, response-size limit, or redirect validation.

The authenticated chatbot URL trainers are a second SSRF/resource-abuse path: `ChatbotTrainingController::postWebSites()` accepts a URL and `LinkCrawler`/`LinkParser` use `file_get_contents()` without destination restrictions (`app/Http/Controllers/Chatbot/ChatbotTrainingController.php:190-210`, `app/Services/Chatbot/LinkCrawler.php:60-108`, with duplicated extension implementations).

**Required remediation:** centralize safe outbound-fetching; allow only HTTPS where possible; resolve and block private, loopback, link-local, multicast, metadata, reserved, and RFC1918 destinations on every redirect; enforce connect/read timeouts, maximum bytes, content type, crawl depth, and job quotas.

### H-07 — Admin chatbot training lacks object policy and resource limits
**Severity: Medium; High in a multi-tenant deployment with multiple admin scopes**  
**Confidence: Confirmed missing policy; impact depends on the intended admin/tenant model.**

The routes at `routes/panel.php:408-421` are inside the dashboard `auth` and `admin` groups, so this is not an ordinary-user bypass. However, `ChatbotTrainingController` receives route-bound `Chatbot $chatbot` and accepts arbitrary `qa_id`/`text_id` rows for update/delete (`app/Http/Controllers/Chatbot/ChatbotTrainingController.php:19-57`, `68-114`, `272-288`). Existing data rows are loaded by ID alone in the update methods and are not checked against the route chatbot. The controller also exposes any chatbot selected by ID to an administrator, while `Chatbot` has a `user_id` relation (`app/Models/Chatbot/Chatbot.php:15-44`) that is not consulted. The Livewire external-settings components have the same missing ownership check (`app/Livewire/ChatbotDomains.php:31-43`, `app/Livewire/ChatbotDomain.php:23-85`), although their parent route is also admin-only.

An administrator can therefore alter/delete data outside the selected chatbot or tenant, and can upload large PDFs and trigger synchronous parsing/embedding. PDF validation has no maximum size/page limit (`ChatbotTrainingController.php:129-164`).

**Required remediation:** enforce a documented global-admin versus tenant-admin policy; resolve data through the route chatbot; add tenant ownership checks to Livewire mount/actions; cap upload bytes/pages/rows and queue embeddings.

### H-08 — Global dashboard CSRF exclusion
**Severity: High**  
**Confidence: Confirmed from source.**

`app/Http/Middleware/VerifyCsrfToken.php:18-31` excludes `dashboard/*`, in addition to selected webhooks and operational paths. The dashboard is authenticated and contains many POST/PUT/DELETE and GET state-changing routes (including account, payment, integration, team, admin, deletion, and configuration actions). A logged-in browser can be induced to submit cross-site requests.

**Required remediation:** remove the wildcard exclusion; use CSRF tokens for browser routes. Exempt only cryptographically authenticated provider webhooks, with exact signature verification and separate stateless middleware.

### H-09 — Razorpay webhook trusts unsigned event/status fields
**Severity: High**  
**Confidence: Confirmed from source; live provider configuration still needs testing.**

`routes/webhooks.php:6-9` accepts unauthenticated webhook requests and `PaymentProcessController` also accepts GET for Razorpay (`app/Http/Controllers/Finance/PaymentProcessController.php:270-320`). `RazorpayService::handleWebhook()` reads subscription/payment-link event and status fields directly and can call `creditIncreaseSubscribePlan()` after using attacker-controlled `razorpay_payment_link_status` (`app/Services/PaymentGateways/RazorpayService.php:614-704`). No visible HMAC/signature verification or event idempotency is present. The lookup can also return null before `$order->order_id` is dereferenced. The legacy `CoingateService::handleWebhook()` has the same trust problem: it looks up an order by caller-supplied `order_id`, accepts caller-supplied `status == paid`, and credits the order without authenticating the callback (`app/Services/PaymentGateways/CoingateService.php:276-320`).

**Required remediation:** verify the raw request body using Razorpay’s configured webhook secret before parsing; retrieve and verify the payment/order server-side; bind the event to the expected order/user/amount/plan; make crediting transactional and idempotent; reject GET and log only safe identifiers.

### H-10 — Custom password-reset token has no visible expiry or one-time use
**Severity: High**  
**Confidence: Confirmed from source.**

The custom reset flow writes `Str::random(67)` to `users.password_reset_code` (`app/Http/Controllers/MailController.php:29-41` and `app/Http/Controllers/Api/AuthController.php:173-190`). `passwordResetCallbackSave()` accepts the code, changes the password, and logs the user in but never clears the code or records an expiry (`app/Http/Controllers/MailController.php:48-76`). A leaked old link remains reusable until another reset overwrites it. The separate Laravel password broker flow has different semantics, so both flows need to be consolidated.

**Remediation:** use Laravel’s password broker exclusively, or store a hashed, expiring, single-use token; rotate remember/session tokens after reset; return uniform responses to prevent account enumeration.

### H-11 — Four-digit login OTP is globally matched and not expired/throttled
**Severity: High**  
**Confidence: Confirmed from source.**

When OTP login is enabled, `AuthenticatedSessionController::store()` generates only `random_int(1000, 9999)` and stores it on the user (`app/Http/Controllers/Auth/AuthenticatedSessionController.php:78-94`). `verifyOtp()` searches globally by OTP only, without a user/session binding, expiry, attempt counter, or throttle (`:173-198`). A four-digit code has only 10,000 possibilities and an online attacker can target accounts or exploit a collision.

**Remediation:** use a cryptographically random, sufficiently long, session-bound challenge; expire it within minutes; cap attempts per account/IP; invalidate on success; use uniform responses and account lockout/alerting.

### H-12 — WordPress AJAX authorization/CSRF/ownership failures
**Severity: High**  
**Confidence: Confirmed from source.**

`WordPress Extension/includes/hooks.php:23-48` registers many mutating AJAX actions without visible `check_ajax_referer()` or capability checks. Examples:

- `fetch_post_details` is registered for `wp_ajax_nopriv` and returns arbitrary post content by ID (`:23-24`, `100-137`), disclosing private/draft content.
- `magicai_delete_attachment()` deletes arbitrary post/attachment IDs (`:386-396`).
- `magicai_save_chat_data()` updates arbitrary chat post meta by ID (`:447-476`), and `magicai_delete_chat()` deletes arbitrary chats (`:601-610`).
- `magicai_get_chat_data()` and `magicai_get_chat()` return arbitrary chat content by ID (`:487-590`).
- Authenticated subscriber-level requests can invoke post/document creation and AI actions because registration alone does not enforce the necessary WordPress capabilities.

The lack of nonce checks also makes logged-in state-changing actions CSRFable.

**Remediation:** require nonces and exact capabilities per action; scope every post/chat/attachment query to the current user or a capability such as `current_user_can('edit_post', $id)`; remove `nopriv` from private data actions; use `wp_send_json_*` only after authorization.

### H-13 — WordPress public chatbot AJAX is an IDOR and stored-XSS path
**Severity: High**  
**Confidence: Confirmed from source.**

The chatbot data actions are registered for unauthenticated users (`WordPress Extension/includes/hooks.php:40-48`). `magicai_chatbot_get_chat_data()` and `magicai_chatbot_save_chat_data()` accept arbitrary `chat_id` and read/write `_magicai_messages` without verifying ownership, IP/session binding, or a capability (`:1428-1487`). `magicai_chatbot_get_chat()` similarly accepts a caller-supplied ID and emits message fields into HTML without escaping (`:1349-1365`). The save path stores `$message` directly (`:1475-1484`), so attacker-controlled HTML can persist and execute when a chat is rendered.

### H-14 — WordPress chatbot training and RSS fetch are SSRF/resource-abuse paths
**Severity: High**  
**Confidence: Confirmed from source.**

`MagicAI_ChatBot::crawl_website()` and `crawl_website_single_url()` accept a validated-looking URL but do not enforce a public destination policy, then crawl with `MagicAI_LinkCrawler` (`WordPress Extension/includes/classes/chatbot.php:210-298`). The crawler uses `file_get_contents()` (`WordPress Extension/includes/classes/link-crawler.php:55-96`). The WordPress RSS handler also accepts a caller URL and passes it to the parser (`WordPress Extension/includes/hooks.php:1502-1518`). `wp_http_validate_url()` is not a sufficient replacement for DNS/rebinding/redirect checks or resource controls.

### H-15 — WordPress plugin exposes the OpenAI secret to admin JavaScript
**Severity: High**  
**Confidence: Confirmed from source.**

`WordPress Extension/includes/classes/openai.php:147-168` splits the configured OpenAI key into three Base64 fragments and sends them via `wp_localize_script()` to browser JavaScript. Base64 and random split positions are not protection; any admin page script or browser extension with access to the page can reconstruct and exfiltrate the key. The plugin also has many AI AJAX endpoints (`:123-145`) without visible nonce/capability checks in the registration code.

**Remediation:** keep provider keys server-side; proxy narrowly scoped operations through authenticated, nonce-protected handlers; rotate any key exposed to a live site.

### H-16 — WordPress updater uses plain HTTP
**Severity: High / supply-chain risk**  
**Confidence: Confirmed from source.**

The plugin constructs its update checker with `http://api.liquid-themes.com/magicai-wp/updater.json` (`WordPress Extension/includes/plugin.php:150-160`). A network attacker who can tamper with this channel can influence update metadata/package delivery and obtain code execution when WordPress installs the update. Pin HTTPS, verify package signatures/hashes, and fail closed on insecure transport.

Also notable: `WordPress Extension/magicai-wp.php:10-15` marks the license valid and writes a fake license message on every plugin load. This is unauthorized persistent option mutation and a supply-chain/trust concern, not merely a license issue; the plugin should be replaced with a verified vendor build.

### H-17 — Direct remote URL reads in image/video generation
**Severity: High**  
**Confidence: High; exact reachable feature configuration should be validated.**

Several authenticated generation paths pass user or feed-controlled URLs to `file_get_contents()`, including `AIController::videoOutput()` (`app/Http/Controllers/AIController.php:1028-1048`), RSS image processing (`:629-650`), and Stable Diffusion image references (`app/Services/Ai/Images/StableDiffusionImageService.php:78-100`). These can be used to read internal HTTP services/metadata endpoints or consume unbounded resources. Apply the same centralized safe-fetch policy as H-06 and reject local filesystem paths from user input.

### H-18 — Public update/debug/cache/log operations are remotely triggerable
**Severity: High**  
**Confidence: Confirmed from source.**

`upgrade-script` and `update-manual` run migrations and installation/seeding routines without a route auth guard (`routes/web.php:63-66`, `InstallationController::upgrade()` and `updateManual()`). `clear-log`, `cache-clear`, and `update-fonts` are also public (`routes/web.php:73-75`). `debug/{token?}` toggles `APP_DEBUG` and writes `.env`; with a valid/weak/leaked token it changes a sensitive production setting (`routes/web.php:76`, `app/Http/Controllers/Common/DebugModeController.php:10-39`). These routes enable denial of service, information disclosure, and potentially unsafe migration/file operations.

**Remediation:** remove production routes or protect with super-admin policy, CSRF and a one-time maintenance authorization; disable debug toggling in production; never expose application update operations as anonymous web actions.

### H-19 — Custom TON/Telegram webhook lacks authentication and leaks request data
**Severity: High if the integration is enabled**  
**Confidence: Source-confirmed but not reachable in the default route/provider map.**

If `routes/ton.php` is loaded, `/api/ton/webhook` and `/api/ton/set-webhook` are public (`routes/ton.php:16-22`). `TonIntegrationController::handleWebhook()` accepts and logs arbitrary updates with no Telegram secret-token check (`app/Http/Controllers/Api/TonIntegrationController.php:22-43`), and `setWebhook()` lets an unauthenticated caller replace the bot webhook URL (`:52-79`). Full untrusted updates are logged. The code also accepts private keys/mnemonics in a request to `sendTon()` (`:104-143`); secrets can leak through request logs, tracing, proxy logs, or exception handling.

In the current checkout, `routes/ton.php` is not required by `RouteServiceProvider`, and `TonIntegrationServiceProvider` is not listed in `config/app.php`; confirm deployment/provider registration before treating these endpoints as live. If enabled, protect configuration with admin auth, verify Telegram’s secret token, use an allowlisted HTTPS URL, redact logs, and never transmit wallet secrets through ordinary request bodies.

### H-20 — API search leaks other users’ chat history
**Severity: High**  
**Confidence: Confirmed from source.**

`AIChatController::search()` scopes workbooks to the current user but retrieves `UserOpenaiChat` history without a `user_id` condition (`app/Http/Controllers/Api/AIChatController.php:963-1020`). Any authenticated API user can search and receive other users’ chat titles/data matching a term.

### H-21 — Application-wide CSRF/authorization gap in WordPress admin AI operations
**Severity: High**  
**Confidence: Confirmed from source; exact capability impact depends on WordPress role assignments.**

The WordPress OpenAI class registers post creation, code/image generation, transcription, fine-tune creation/deletion, PDF parsing, and web search actions (`WordPress Extension/includes/classes/openai.php:123-145`). The shown registration has no nonce or capability enforcement; handlers must enforce these independently, but the reviewed high-impact functions do not consistently do so. This permits low-privilege logged-in users and CSRF requests to spend the site’s provider budget, create/modify content, or operate on files.

### H-22 — Unauthenticated WordPress embedding endpoint spends the provider budget
**Severity: High**  
**Confidence: Confirmed from source.**

`WordPress Extension/includes/classes/chatbot.php:82-83` registers `magicai_chatbot_getMostSimilarText` for `wp_ajax_nopriv`. The handler accepts attacker-controlled `chat_id` and prompt, loads the chatbot’s vectors, and calls OpenAI embeddings with the server key (`:1442-1466`) before returning the result. There is no visible nonce, authentication, per-IP quota, prompt/size limit, or cost accounting. An attacker can repeatedly trigger paid embedding requests and make the endpoint perform unbounded vector comparisons. The handler also constructs its response with an undefined `$prompt` at `:1489`, which should be corrected during the authorization fix.

### H-23 — Brand voice API permits takeover of another user’s company record
**Severity: High**  
**Confidence: Confirmed from source.**

`BrandController::store()` accepts a caller-supplied `item_id`, loads `Company::where('id', $request->item_id)` without a user condition, then assigns the record to the current user and saves attacker-controlled fields (`app/Http/Controllers/Api/BrandController.php:155-199`). The route is available to every `auth:api` user (`routes/api.php:205-210`). A user can claim and modify another user’s company/brand data, with possible cross-user disclosure through subsequent generation. Add `where('user_id', auth()->id())` or a policy before update; never silently reassign an existing owner.

### H-24 — Token-pack orders can bypass order ownership check
**Severity: High**  
**Confidence: Confirmed from source.**

`PaymentApiController::orders()` checks ownership only when `$order->plan_id != null` (`app/Http/Controllers/Api/PaymentApiController.php:252-275`). Any order row with a null `plan_id` can be returned to any authenticated API user by numeric order ID; the exact affected order types depend on deployment data and should be confirmed against the schema/migrations. This exposes order/payment metadata and should use an unconditional owner/admin policy.

### H-25 — Dashboard order list accepts arbitrary user IDs
**Severity: High**  
**Confidence: Confirmed from source.**

`routes/panel.php:351-358` places `GET /dashboard/orders/list/{user_id?}` in the ordinary authenticated user area, not the admin group. `Dashboard\UserController::userOrdersList()` calls `User::findOrFail($user_id)` and returns that user’s complete order collection without checking the current user or admin status (`app/Http/Controllers/Dashboard/UserController.php:725-731`). A logged-in user can enumerate another user’s billing/order history by changing the path ID.

**Required remediation:** remove the route from the user area or require an admin policy; for self-service use `Auth::user()->orders` and ignore a caller-supplied user ID.

### H-26 — Committed Google API key in server code
**Severity: High if the key is active/unrestricted; Medium otherwise**  
**Confidence: Confirmed from source; live key scope/billing cannot be tested here.**

`app/Services/Common/FontsService.php:20-38` sends a hardcoded Google Web Fonts API key in every cache refresh. The key is tracked in Git and was found by a repository secret scan. Anyone with repository/history access can use it until revoked; if it is billing-enabled or broadly scoped, this can cause quota/billing abuse. Remove it from source, rotate it, load it from secret configuration, and restrict the replacement to the required API/referrer/server identities.

## Medium and lower-risk findings / hardening items

1. **Account enumeration:** API password reset returns `422 User not found` for unknown emails (`AuthController.php:173-190`), while resend uses `firstOrFail()` (`:252+`). Use a uniform response and rate limit.
2. **Payment webhook robustness:** Razorpay can dereference a missing order, and several handlers need explicit replay/idempotency checks. Yokassa’s exact-IP comparison against CIDR-style values should be replaced with a correct CIDR matcher.
3. **Webhook logging:** Telegram logs full attacker-controlled updates; payment handlers and AI exceptions should avoid payloads containing credentials, personal data, or provider tokens.
4. **WebSocket custom implementation is incomplete/unsafe if wired:** `WebSocketController::authenticateConnection()` only checks that a query `token` exists and leaves JWT validation commented out (`app/Http/Controllers/Api/WebSocketController.php:511-548`). Private channel/presence handling is not tied to a Laravel user/tenant. Recovery IDs are only regex-validated (`:375-381`). The class also references methods that are not defined in the reviewed file and `onOpen()` uses an undefined loop, so availability and actual handler selection require runtime validation.
5. **WebSocket service channel API inconsistency:** `WebSocketChannelManager` has a private-channel HMAC check, but `WebSocketService::subscribe()` uses a different `findOrCreate()` call shape. Verify the package’s actual manager implementation and test all public/private/presence channel paths.
6. **WordPress output escaping:** multiple chat renderers interpolate stored message/image content without context-appropriate escaping (`hooks.php:509-547`, `571-586`). Treat model/user output as untrusted HTML.
7. **WordPress upload and image fetch paths:** helpers read caller-provided image URLs (`WordPress Extension/includes/helper.php:153-255`) and write them to storage. Add safe fetch, MIME/size limits, image re-encoding, and object ownership checks.
8. **Default/demo credentials and seed material:** `InstallationController.php:140-150`, the installer package, and `magicai.sql` contain the same seeded `admin@admin.com` account and committed bcrypt hash. Do not ship a known/default administrator; force a unique password and rotate/reset on import.
9. **Secrets in API profile serialization:** `User::$hidden` does not include `api_keys`, provider tokens, password-reset code, OTP, or email confirmation code (`app/Models/User.php:64-70`). Review every endpoint returning a User model, especially `/api/user` and `/api/auth/profile`.
10. **Public deployment defaults:** `.env.example` sets `APP_DEBUG=true`, uses HTTP localhost, a committed static `APP_KEY`, debug-level logging, root/blank database defaults, and Docker Compose publishes MySQL, Redis, blockchain RPC, IPFS admin/API, monitoring, Grafana, and Adminer ports. `docker-compose.yml` also uses `APP_KEY=base64:your_app_key`, MySQL root/root, and exposes Ganache/geth APIs with administrative modules. These are unsafe if copied into internet-facing deployments.
11. **Transaction/affiliate race conditions:** affiliate withdrawal balance calculation and several payment credit paths should use database locks/idempotency; concurrent requests can double-spend calculated balances or credits.
12. **Resource exhaustion:** many AI/PDF/audio/video routes call `set_time_limit()` and process uploads synchronously. Enforce request/body limits, queue expensive work, cap pages/tokens/images, and add per-user/provider budget limits.
13. **Unbounded image-generation count/global lock:** `AIImageController::imageOutput()` casts caller input to `image_number_of_images` and loops that many times without a positive maximum (`app/Http/Controllers/Api/AIImageController.php:159-200`; the web controller has the same pattern at `app/Http/Controllers/AIController.php:951-984`). A single large request can tie up the worker and provider; the global `generate_image_output_lock` also lets one user block all users. Validate a small allowlisted range and use per-user/provider queues/locks.
14. **Order and subscription operation throttling:** payment status/cancel and credit-affecting API operations lack a consistent per-user throttle and idempotency key. Add transaction locks, provider-side verification, and replay-safe request IDs.

## Dependency evidence

`npm audit --package-lock-only --json` on the committed lockfile reported **27 vulnerabilities**: 20 high, 5 moderate, 2 low, 0 critical. High-severity packages include `axios`, `brace-expansion`, `browserslist`, `editorconfig`, `fast-uri`, `flatted`, `form-data`, `glob`, `immutable`, `js-cookie`, `js-yaml`, `linkify-it`, `lodash`, `minimatch`, `nanoid`, `picomatch`, `postcss`, `rollup`, `vite`, and `ws`; all reported fixes were available according to the audit output at review time. Run `npm audit` against the actual production build and test lockfile upgrades before release.

Composer audit was **not run** because `composer` is unavailable in the checkout environment. Run `composer validate`, `composer audit --locked`, and a PHP SCA tool in CI against `composer.lock`; review the tracked WordPress vendor/updater libraries separately.

## Recommended remediation order

1. Disable/remove public extension install, update, debug, test, cache, log, upload, PDF, RSS, and translation routes; rotate all secrets exposed by H-02/C-02 and H-15.
2. Fix `auth`/admin policy boundaries, restore CSRF protection, and add object-policy tests for documents, chats, templates, chatbot training, media, support, payment, and team resources.
3. Replace custom reset/OTP flows with expiring, throttled, session-bound Laravel primitives.
4. Add a single hardened outbound HTTP client for RSS, crawling, image, YouTube, WordPress, and extension metadata fetches.
5. Fix webhook authenticity, replay protection, server-side payment verification, and safe logging.
6. Remove or quarantine the WordPress plugin’s license-bypass behavior and HTTP updater; publish a signed, reviewed build with nonce/capability/ownership enforcement.
7. Upgrade npm dependencies, run Composer/PHP audits, and harden Docker/Kubernetes defaults and secret handling.

## Validation still required

- Generate the production route list and confirm middleware for every item above, including any routes dynamically copied from extensions.
- Run two-user authorization tests against API document/chat/template/support/team/media endpoints.
- Test provider webhook fixtures for every enabled gateway, including duplicate and malformed events.
- Verify whether a deployment registers `routes/ton.php`, `TonIntegrationServiceProvider`, and the custom WebSocket handler.
- Exercise WordPress AJAX actions with anonymous, subscriber, editor, and administrator roles and with cross-user IDs.
- Run safe SSRF tests from a staging network with loopback, RFC1918, IPv6, DNS rebinding, redirects, oversized responses, and metadata endpoints.
- Re-run npm and Composer audits in CI and review all reachable extension packages before enabling marketplace installation.
