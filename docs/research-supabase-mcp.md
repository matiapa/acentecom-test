# Research: Official Supabase MCP Server

Status: DONE
Started: 2026-07-11
Finished: 2026-07-11

## Goal
Inform a design decision about using the official Supabase MCP server
(`supabase-community/supabase-mcp`, hosted at `mcp.supabase.com`)
vs. building a custom read-only SQL CLI, for use with Claude Code pinned to a repo.

## Key architecture fact (important, changes the framing of the whole question)

The **current** official server is a **hosted remote MCP server** reachable at
`https://mcp.supabase.com/mcp`, authenticated via **OAuth 2.1** (browser login flow),
**not** a locally-spawned `npx` stdio process with a token in an env var. The
`npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=...` pattern
that circulates in older tutorials/blog posts is legacy — the current README/docs
(as of query date) center on the hosted URL + OAuth, with `SUPABASE_ACCESS_TOKEN`
only mentioned as a **fallback for CI/headless environments** that can't do a
browser OAuth flow.
Source: https://raw.githubusercontent.com/supabase-community/supabase-mcp/main/README.md
Source: https://supabase.com/docs/guides/getting-started/mcp

There are also two other flavors with a **reduced tool set and no OAuth**:
- Local Supabase CLI dev stack: `http://localhost:54321/mcp`
- Self-hosted Supabase: see https://supabase.com/docs/guides/self-hosting/enable-mcp

---

## 1. Read-only enforcement

**Yes, read-only mode exists**, controlled by the `read_only` query parameter on the
server URL (not a CLI flag in the current hosted model):

```
https://mcp.supabase.com/mcp?read_only=true
```

(Older/local-stdio-style docs express the same thing as a `--read-only` flag.)

**Enforcement layer — it is a real DB-level control, not just a prompt hint.**
Verbatim from the official README:

> "To restrict the Supabase MCP server to read-only queries, set the `read_only`
> query parameter in the server URL... We recommend enabling this setting by
> default. **This prevents write operations on any of your databases by executing
> SQL as a read-only Postgres user (via `execute_sql`).** All other mutating tools
> are disabled in read-only mode, including: `apply_migration`, `create_project`,
> `pause_project`, `restore_project`, `deploy_edge_function`, `create_branch`,
> `delete_branch`, `merge_branch`, `reset_branch`, `rebase_branch`,
> `update_storage_config`."

Source: https://raw.githubusercontent.com/supabase-community/supabase-mcp/main/README.md (README lines ~69-88)

So there are two independent layers of enforcement:
1. **Tool-level**: mutating tools (migrations, project/branch/storage management) are
   removed from the tool list entirely when `read_only=true` — the model literally
   cannot call them, this isn't a "please don't" instruction.
2. **DB-connection level**: the one remaining SQL-execution tool (`execute_sql`) is
   run against the project's Postgres using a **dedicated read-only Postgres role**
   (`supabase_read_only_user`), so even a crafted/injected SQL string containing
   `INSERT`/`UPDATE`/`DELETE`/`DROP` would be rejected by Postgres' own permission
   system, not merely filtered client-side.

This is a genuine defense-in-depth control, not just a system-prompt instruction the
model could ignore — the ceiling is enforced by Postgres GRANTs.

Caveat: read-only mode does **not** protect against data exfiltration via SELECT —
an attacker (or a prompt-injection payload sitting in your own data) can still read
and leak anything the read-only role can see. Read-only stops writes, not disclosure.

---

## 2. Configuration & pinning to a repo (Claude Code / `.mcp.json`)

Claude Code auto-detects a project-root `.mcp.json`. Official docs give this exact
setup for Claude Code:

**CLI approach:**
```bash
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp"
```

**Config-file approach** (`.mcp.json` at repo root):
```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}
```
Then run `claude /mcp`, select "supabase", choose "Authenticate" → browser OAuth flow.

Source: https://supabase.com/docs/guides/getting-started/mcp

**Scoping flags are query params appended to the same URL**, e.g. to bake in
read-only + a single project:
```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=<project-ref>&read_only=true&features=database,docs"
    }
  }
}
```
(`features` further restricts which tool groups load — see Q5.)
Source: https://raw.githubusercontent.com/supabase-community/supabase-mcp/main/README.md
(the `?project_ref=<project-ref>&read_only=true&features=database,docs` combo is
shown verbatim in the "Usage with AI SDK's MCP Client" section, and `read_only`/
`project_ref` individually in the "Options" section).

**Headless/CI config (token via env var, no OAuth browser flow)** — this is the
pattern that maps to "secrets referenced via env var, not hardcoded in a committed
file":
```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}",
      "headers": {
        "Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```
Docs state this "assumes you have environment variables `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_PROJECT_REF` set in your CI environment" — i.e. `${VAR}` interpolation is
the officially documented way to keep the token out of the committed `.mcp.json`.
Source: https://supabase.com/docs/guides/getting-started/mcp

**Confirmed: yes**, secrets can be referenced via env-var interpolation
(`${SUPABASE_ACCESS_TOKEN}`) in the committed `.mcp.json` rather than hardcoded —
this is the officially documented pattern for CI/non-interactive environments, and
directly transferable to "pin this repo to auto-connect without a human doing an
OAuth click-through."

---

## 3. What a non-technical user must provide

- **A Supabase Personal Access Token (PAT)**: create at
  https://supabase.com/dashboard/account/tokens ("Navigate to your Supabase access
  tokens and generate a new token" — https://supabase.com/docs/guides/getting-started/mcp).
  Only needed for the CI/headless path; for interactive Claude Code use, the OAuth
  flow (`claude /mcp` → Authenticate) avoids ever handling a raw token.
- **A project ref**: found under **Project ID** in Project Settings →
  `https://supabase.com/dashboard/project/_/settings/general` (README line 65).

**Token scope — this is the important caveat for the design decision:**
PATs are **account-scoped, not project-scoped**. Per Supabase's own docs/community
threads: "Personal access tokens ... carry the same privileges as your user
account" and there is an open feature request (supabase/supabase#18584) precisely
because users want tokens scoped to one org/project and currently cannot get that.
Source: https://supabase.com/docs/reference/api/introduction ,
https://github.com/supabase/supabase/issues/18584

So `--project-ref` / `project_ref=` **does not scope the credential** — it only
tells the *MCP server* to restrict which project's tools/data it will serve for
that session. If the PAT itself leaks (e.g. exfiltrated from the CI env, or from a
`.env` file), it grants **full account access to every project the user owns**,
regardless of the `project_ref` parameter set in `.mcp.json`. The scoping is a
convenience/blast-radius control at the MCP-server layer, not a credential-level
security boundary.

---

## 4. Security posture (Supabase's own recommendations)

From the README "Security risks" section and the docs "Security risks" section
(https://supabase.com/docs/guides/ai-tools/mcp#security-risks), and the dedicated
blog post "Defense in Depth for MCP Servers"
(https://supabase.com/blog/defense-in-depth-mcp):

- **Don't connect to production** — "Use the MCP server with a development
  project, not production." Use branching / staging / anonymized data instead.
- **Don't give it to customers/end users** — the server runs "under the context
  of your developer permissions," so it's for internal developer use only, never
  exposed to end users of your app.
- **Enable read-only mode** if real/production-like data must be touched at all.
- **Project scoping** — restrict to one project via `project_ref` to reduce blast
  radius (though see Q3 caveat: doesn't protect the underlying token).
- **Feature groups** — use `features=` to load only the tool groups actually
  needed (e.g. `database,docs`), shrinking the attack surface / tools an
  injected prompt could invoke.
- **Branching** — use dev branches so LLM-driven schema changes don't touch prod.
- **Manual approval / "beware Always Approve"** — keep human-in-the-loop approval
  on tool calls in the MCP client; don't blanket-auto-approve.
- **Monitor and log all MCP queries.**
- **Prompt injection is called out as the #1 residual risk**: "prompt injection
  remains the number one concern" — malicious text stored in your own database
  rows (support tickets, user bios, etc.) can contain hidden instructions that
  trick the LLM into running unintended reads/actions when that data is later
  fetched into the model's context. Supabase's stated conclusion: "guardrails
  alone aren't enough" — environmental separation (dev/staging data, not prod)
  is the real mitigation, not just read-only + scoping.
  Source: https://supabase.com/blog/defense-in-depth-mcp

---

## 5. Query capability (execute_sql / arbitrary SELECT)

Yes — full tool list from the official README, grouped by feature (feature groups
controllable via `features=`):

- **account** (disabled once `project_ref` set): `list_projects`, `get_project`,
  `create_project`, `pause_project`, `restore_project`, `list_organizations`,
  `get_organization`, `get_cost`, `confirm_cost`
- **docs**: `search_docs`
- **database**: `list_tables`, `list_extensions`, `list_migrations`,
  `apply_migration` (DDL, disabled in read-only), **`execute_sql`** (arbitrary SQL —
  in read-only mode this runs as the `supabase_read_only_user` Postgres role, so a
  question like "how many orders this week" maps directly to
  `execute_sql("select count(*) from orders where created_at > now() - interval '7 days'")`)
- **debugging**: `get_logs`, `get_advisors`
- **development**: `get_project_url`, `get_publishable_keys`,
  `generate_typescript_types`
- **functions**: `list_edge_functions`, `get_edge_function`,
  `deploy_edge_function` (disabled in read-only)
- **branching** (paid plans, disabled in read-only for the mutating ones):
  `create_branch`, `list_branches`, `delete_branch`, `merge_branch`,
  `reset_branch`, `rebase_branch`
- **storage** (disabled by default, must opt in via `features=storage`):
  `list_storage_buckets`, `get_storage_config`, `update_storage_config`
  (disabled in read-only)

Default enabled feature groups if `features=` is not set: `account`, `database`,
`debugging`, `development`, `docs`, `functions`, `branching` (storage is opt-in).

Source: https://raw.githubusercontent.com/supabase-community/supabase-mcp/main/README.md
(README lines 90-181, "Tools" section)

---

## RECOMMENDATION

**Can read-only genuinely be enforced? Yes**, at two real layers, not just a
prompt-level hint:
1. Mutating tools are structurally absent from the tool list the model is given
   when `read_only=true` (model literally cannot invoke `apply_migration`,
   `create_project`, `deploy_edge_function`, branch/storage mutators, etc.).
2. The one remaining SQL tool (`execute_sql`) is executed by Postgres under a
   dedicated `supabase_read_only_user` role — so even an adversarial/injected SQL
   string attempting a write is rejected by the database's own grants, independent
   of what the model "intends."

This is materially stronger than "we told the LLM not to write" — it is comparable
to giving a human contractor a read-only DB user, which is the correct mental
model.

**Residual risk that read-only does NOT cover:**
- **Data exfiltration/disclosure** (read-only stops writes, not leaking sensitive
  rows via SELECT + prompt injection from data already in the DB).
- **Credential blast radius**: the Personal Access Token behind all of this is
  **account-wide, not project-scoped** — `project_ref` limits what the *MCP
  server* will serve in that session, but if the PAT itself is exfiltrated (e.g.
  from a CI secret, a misconfigured `.mcp.json`, or a compromised machine), it
  grants full access to every project in the account, including production,
  fully bypassing both `read_only` and `project_ref` since those are just query
  params the attacker (using the raw token directly against the Management
  API/DB) doesn't have to respect at all.

**Is the official MCP a good fit vs. a custom read-only SQL CLI?**

- For interactive, human-in-the-loop use in Claude Code (a dev pinging "how many
  orders this week" and reviewing the tool call before it runs), the official
  server is a good fit: it's maintained by Supabase, ships genuine DB-level
  read-only enforcement, supports env-var-based secrets in a committed
  `.mcp.json`, and needs no custom code.
- For anything closer to unattended/production/customer-facing use, a **custom
  minimal read-only SQL CLI/tool would be the safer choice**, because:
  - You can mint a **Postgres role scoped to exactly the tables/columns needed**
    (narrower than "the whole read-only project"), independent of Supabase's
    account-wide PAT model.
  - You avoid exposing 20+ tools (logs, advisors, edge functions, typescript
    codegen, etc.) that aren't needed for "answer analytics questions" — a
    smaller, purpose-built tool is a smaller prompt-injection/attack surface than
    the general-purpose Supabase MCP with `features=` trimmed down.
  - You control exactly what happens to the credential (e.g. a Postgres
    connection string scoped via `pg_hba`/row-level security to specific
    read-only views) instead of trusting an account-wide Supabase PAT plus a
    query-param "recommendation" for scoping.
- Practical middle ground: use the official MCP with `read_only=true`,
  `project_ref=<ref>`, and `features=database,docs` for day-to-day
  interactive dev use in Claude Code (fast to set up, real DB-level
  enforcement), but do **not** wire the account-wide PAT into any unattended/CI
  path that touches production — for that, build the narrow custom read-only
  tool against a dedicated least-privilege Postgres role.

---

## Sources (primary, official)
- https://github.com/supabase-community/supabase-mcp (repo)
- https://raw.githubusercontent.com/supabase-community/supabase-mcp/main/README.md (full README, fetched verbatim)
- https://supabase.com/docs/guides/getting-started/mcp (client setup incl. Claude Code)
- https://supabase.com/docs/guides/ai-tools/mcp (security risks section)
- https://supabase.com/blog/defense-in-depth-mcp (security posture / prompt injection)
- https://supabase.com/docs/guides/self-hosting/enable-mcp (self-hosted variant)
- https://supabase.com/docs/reference/api/introduction (PAT = account privileges)
- https://github.com/supabase/supabase/issues/18584 (feature request for scoped tokens — confirms current tokens are account-wide, not project-scoped)
