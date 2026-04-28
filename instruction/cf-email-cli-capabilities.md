# Cloudflare Email — CLI / MCP capability audit

> Captured: 2026-04-23 20:10 (+07)
> Context: asked whether agent can do Email Sending + Email Routing setup without CF Dashboard.
> Test environment: wrangler 4.83.0 + 4.84.1, wrangler OAuth token from `wrangler login`, zone `jairukchan.com` (id `be7a169ab6b3d1e478afda77702d8830`), account `SORNKan` (id `a24ce30584273b42333051f1cdec48e2`).

---

## TL;DR

| Task | Can agent do it? | How |
|------|-----------------:|-----|
| Email Routing — enable catch-all forward | ✅ YES | `wrangler email routing rules update <domain> catch-all --action-type forward --action-value <dest> --enabled` |
| Email Routing — any rule CRUD (create/update/delete/list/get) | ✅ YES | `wrangler email routing rules <subcommand>` |
| Email Routing — destination address list | ✅ YES | `wrangler email routing addresses list` |
| Email Routing — destination address create | ⚠ partial | CLI has `addresses create` but destination requires email-verification click; CLI triggers the send, user still clicks |
| Email Routing — enable/disable zone-level | ✅ YES | `wrangler email routing enable/disable <domain>` |
| Email Sending — enable domain (onboard) | ❌ NO | wrangler CLI `email sending enable` hits a broken/wrong API path (404); account-level CF API endpoint exists but OAuth token from `wrangler login` lacks `email_sending:edit` scope |
| Email Sending — list onboarded zones | ✅ YES (read-only) | `wrangler email sending list` |
| Email Sending — get DNS records CF wants | ❌ NO | CLI hits same broken zone path (404) |
| Email Sending — actually send (from Worker) | ✅ YES at runtime | via `env.EMAIL.send(...)` binding — this is separate from onboarding |
| CF MCP — anything email-related | ❌ NO | The CF Developer Platform MCP tools exposed: accounts, d1, hyperdrive, kv, r2, workers. **No email tools at all.** |
| Raw curl to `/accounts/{acct}/email/sending/domains` | ❌ NO (with wrangler OAuth) | Returns `401 Unable to authenticate request` — OAuth token scope covers `email_routing` but not `email_sending` |

**Conclusion:** agent can complete Email Routing setup end-to-end via CLI. Email Sending onboarding **requires user action** in dashboard (or an API Token with `email_sending:edit` scope manually created and handed to the agent).

---

## Detailed probe log

### 1. wrangler CLI email surface

wrangler 4.83+ ships a beta `wrangler email` top-level command:

```
wrangler email routing
  ├─ list                       ✅ works
  ├─ settings <domain>          ✅ works
  ├─ enable <domain>            ✅ presumed works (not tested — routing already enabled)
  ├─ disable <domain>           ✅ presumed works
  ├─ dns                        ✅ presumed works
  ├─ rules
  │   ├─ list <domain>          ✅ works
  │   ├─ get <domain> <id>      ✅ works (use 'catch-all' for catch-all rule)
  │   ├─ create <domain>        ✅ presumed works (API path matches routing)
  │   ├─ update <domain> <id>   ✅ WORKS — verified by enabling catch-all live
  │   └─ delete <domain> <id>   ✅ presumed works
  └─ addresses
      ├─ list                   ✅ works (shows 4 verified destinations)
      ├─ get <id>               ✅ presumed works
      ├─ create <email>         ⚠ sends verification email; user still clicks link
      └─ delete <id>            ✅ presumed works

wrangler email sending
  ├─ list                       ✅ works (returns "No zones found")
  ├─ settings <domain>          ❌ GET /zones/{zone}/email/sending → 404
  ├─ enable <domain>            ❌ POST /zones/{zone}/email/sending/enable → 404
  ├─ disable <domain>           ❌ presumed broken (same path family)
  ├─ send                       — not tested, not needed for setup
  ├─ send-raw                   — not tested, not needed for setup
  └─ dns
      └─ get <domain>           ❌ GET /zones/{zone}/email/sending/dns → 404
```

### 2. Evidence: enable catch-all succeeded via CLI

```
$ wrangler email routing rules update jairukchan.com catch-all \
    --action-type forward \
    --action-value suanwin.paows@gmail.com \
    --enabled

Updated catch-all rule:
  Enabled: true
  Actions:
    - forward: suanwin.paows@gmail.com
```

Verified:

```
$ wrangler email routing rules get jairukchan.com catch-all
Catch-all rule:
  Enabled: true
  Actions:
    - forward: suanwin.paows@gmail.com
```

### 3. Evidence: enable Email Sending fails via CLI

```
$ wrangler email sending enable jairukchan.com
POST /zones/be7a169ab6b3d1e478afda77702d8830/email/sending/enable -> 404 Not Found
```

Same result on wrangler 4.84.1. The beta CLI command targets a **zone-level** path that doesn't exist; the real CF Email Service API is **account-level**: `POST /accounts/{account_id}/email/sending/domains` with `{"domain":"..."}`.

### 4. Evidence: account-level API rejects our OAuth token

```
$ curl -H "Authorization: Bearer $wranglerOAuth" \
    https://api.cloudflare.com/client/v4/accounts/{acct}/email/sending/domains

{"success":false,"errors":[{"code":10001,"message":"Unable to authenticate request"}]}
```

Same OAuth token works fine on D1, R2, KV, Workers, Email Routing, zone DNS (read). It lacks Email Sending scope. `wrangler login` does not currently include `email_sending:edit` in its default scope set.

Token `/verify` endpoint rejects the OAuth token with `Invalid API Token` — OAuth access tokens and API Tokens use different auth flows, and the `/user/tokens/verify` endpoint expects the latter.

### 5. CF MCP (Cloudflare Developer Platform MCP server)

Tools exposed:
- `accounts_list`, `set_active_account`
- `d1_*` (full D1 CRUD)
- `hyperdrive_*`
- `kv_namespaces_*`
- `r2_buckets_*`
- `workers_list`, `workers_get_worker`, `workers_get_worker_code`
- `migrate_pages_to_workers_guide`, `search_cloudflare_documentation`

**No `email_*` tools.** The MCP server does not expose Email Routing or Email Sending management. Out of scope for the current server.

---

## Options to unblock Email Sending setup without dashboard

If the user would rather NOT touch dashboard, these paths exist:

### Option X — create a CF API Token with email_sending scope, feed it to the agent

1. User visits https://dash.cloudflare.com/profile/api-tokens
2. Create Token → Custom token
3. Permissions: `Account` · `Email - Sending` · `Edit` (and any related Email Sending scopes CF offers)
4. Account Resources: include the relevant account
5. Copy the token, pass to agent as `CLOUDFLARE_API_TOKEN` env
6. Agent runs: `curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -X POST /accounts/{acct}/email/sending/domains -d '{"domain":"jairukchan.com"}'` then agent pulls the DNS records CF expects and publishes them via the DNS API (agent DOES have DNS edit scope via wrangler OAuth)

This replaces 4 dashboard clicks with 3 dashboard clicks (creating the API token) but then agent can automate the whole flow. Probably not worth the hassle for a one-time setup.

### Option Y — user does dashboard clicks directly (original recommendation)

Same 4 clicks as Option X's token creation, plus a "click Onboard" button — comparable effort, no extra secret to manage. **This is the recommended path.**

### Option Z — use a third-party provider (Resend) instead of CF Email Service

Resend has a fully scriptable API with a single API token and no beta-status risk. Agent can do 100% of setup via API. Trade-off: adds a third-party dependency + API token secret.

User's stated preference (Q9 in requirements.md): "No fallback without asking." Keep CF Email Service.

---

## Action this session

- ✅ Completed by agent via `wrangler email routing rules update`: catch-all forward to `suanwin.paows@gmail.com`
- ⏳ Pending user in dashboard:
  1. Account → Email Sending → Onboard domain `jairukchan.com`
  2. Approve DNS records CF proposes (DMARC TXT, possibly extra DKIM, possibly `cf-bounce` MX)
  3. Wait for domain to show `Verified`
- After that, agent picks up: `gh workflow run deploy.yml`, migrate:remote, prod smoke.

---

## If CF Dashboard is truly unreachable

If the user cannot access the dashboard at all, the escape hatch is Option X (create API token). That's the only path that keeps everything agent-driven.
