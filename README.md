# @billjr99/pi-openai-compat — pi-coding-agent extension

Registers OpenAI-compatible LLM endpoints as first-class providers inside
[pi](https://pi.dev), so their models appear directly in pi's native `/model`
list and `Ctrl+L` picker alongside built-in Anthropic, OpenAI, and Google
models.  No custom model selection UI — pi handles it natively.

Multiple providers can be registered at the same time.  All of their models
appear together in `/model` under their own provider label.

---

## Quick start

```bash
# Install from npm
pi install npm:@billjr99/pi-openai-compat

# Or from GitHub
pi install git:github.com/BillJr99/pi-openai-compat
```

Then inside pi:

```
/compat-login
```

Pick your provider, enter credentials, and pi fetches the model list
automatically.  Your models are immediately available in `/model`.

If pi is already running when you install, type `/reload` first.

---

## Supported providers

| Provider | Default base URL | Auth |
|---|---|---|
| **OpenRouter** | `https://openrouter.ai/api/v1` | `sk-or-...` from openrouter.ai/keys |
| **NVIDIA NIM** | `https://integrate.api.nvidia.com/v1` | `nvapi-...` from build.nvidia.com |
| **Nous Research Portal** | `https://inference-api.nousresearch.com/v1` | Nous Portal API key |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | API key from aistudio.google.com/apikey |
| **Cerebras** | `https://api.cerebras.ai/v1` | API key from cloud.cerebras.ai |
| **SambaNova** | `https://api.sambanova.ai/v1` | API key from cloud.sambanova.ai |
| **Mistral** | `https://api.mistral.ai/v1` | API key from console.mistral.ai/api-keys |
| **Groq** | `https://api.groq.com/openai/v1` | API key from console.groq.com/keys |
| **Cohere** | `https://api.cohere.com/compatibility/v1` | API key from dashboard.cohere.com/api-keys |
| **Zhipu (Z.ai / BigModel)** | `https://open.bigmodel.cn/api/paas/v4` | API key from open.bigmodel.cn/usercenter/apikeys |
| **DeepSeek** | `https://api.deepseek.com/v1` | API key from platform.deepseek.com |
| **xAI (Grok)** | `https://api.x.ai/v1` | API key from console.x.ai |
| **Hugging Face** | `https://router.huggingface.co/v1` | `hf_...` token from huggingface.co/settings/tokens |
| **Moonshot (Kimi)** | `https://api.moonshot.ai/v1` | `sk-...` key from platform.moonshot.ai |
| **MiniMax** | `https://api.minimax.io/v1` | API key from platform.minimax.io |
| **Z.ai** | `https://api.z.ai/api/paas/v4` | API key from z.ai |
| **Venice AI** | `https://api.venice.ai/api/v1` | API key from venice.ai/settings/api |
| **Fireworks AI** | `https://api.fireworks.ai/inference/v1` | API key from fireworks.ai/account/api-keys |
| **Together AI** | `https://api.together.xyz/v1` | API key from api.together.ai/settings/api-keys |
| **GitHub Models** | `https://models.github.ai/inference` | GitHub PAT — fine-grained, `Models → read` |
| **Cloudflare Workers AI** | `https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1` | API token from dash.cloudflare.com (`Workers AI: Read`) |
| **Cloudflare AI Gateway** | `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/openai` | API token from dash.cloudflare.com (`AI Gateway: Run` + `Workers AI: Read`) |
| **Vercel AI Gateway** | `https://ai-gateway.vercel.sh/v1` | API key from vercel.com |
| **OpenCode Zen** | `https://opencode.ai/zen/v1` | API key from opencode.ai |
| **B.AI** | `https://api.b.ai/v1` | API key from the B.AI console at b.ai (docs.b.ai) |
| **xKiro** | `https://api.xkiro.com/v1` | `sk-xt-...` key from the xKiro console at xkiro.com (docs.xkiro.com) |
| **TeamoRouter** | `https://api.teamorouter.com/v1` | `sk-teamo-...` key from teamorouter.com (teamorouter.com/docs) |
| **GMI Cloud** | `https://api.gmi-serving.com/v1` | API key from console.gmicloud.ai → Organization Settings → API Keys |
| **Token Harbor** | `https://tokenharbor.ai/v1` | `thk_live_...` Universal Key from tokenharbor.ai/dashboard/api-keys |
| **TokenRouter** | `https://api.tokenrouter.com/v1` | API key from the TokenRouter console at tokenrouter.com (model prices at tokenrouter.com/models) |
| **Atria ASI** | `https://api.atria-asi.ai/v1` | `atr_...` key from api.atria-asi.ai/console/keys (Google sign-in) |
| **Unbiased AI** | `https://api.unbiased.ai/v1` | `sk_...` key from platform.unbiased.ai (signup reviewed by hand) |
| **Kilo AI** | `https://api.kilo.ai/api/gateway` | API key from app.kilo.ai → Your Profile (personal account), at the bottom of the page; needs account credits |
| **ModelScope** | `https://api-inference.modelscope.cn/v1` | `ms-...` SDK token from modelscope.cn/my/myaccesstoken |
| **Aion Labs** | `https://api.aionlabs.ai/v1` | API key from aionlabs.ai/app/api-keys (aionlabs.ai/docs) |
| **Agnes AI** | `https://apihub.agnes-ai.com/v1` | `sk-...` key from the Agnes console at platform.agnes-ai.com (wiki.agnes-ai.com) |
| **Xiaomi MiMo** | `https://api.xiaomimimo.com/v1` | API key from the Xiaomi MiMo console at platform.xiaomimimo.com → API Keys (mimo.mi.com/docs) |
| **Ollama (local)** | `http://localhost:11434/v1` (editable) | Optional bearer token; leave blank for a default local install |
| **Ollama Cloud** | `https://ollama.com/v1` | Ollama Cloud API key from ollama.com |
| **llmproxy** | `http://localhost:8080/v1` (editable) | Keyless by default; bearer token if your instance requires one |
| **Custom** | Any URL you supply | Optional bearer token |

> **Providers whose model catalog lives at a non-standard `/models` path (as of June 2026)**
> Some providers don't return models at `<base_url>/models`. The extension
> handles them in one of two ways:
>
> 1. **Live discovery via a per-template URL override** (`modelsUrl`,
>    `modelsIdField`, `modelsKeepTask` on the template). Used for **GitHub
>    Models** and **Cloudflare Workers AI** — `/compat-login` fetches the real
>    catalog and registers actual current models, not a curated guess.
> 2. **Built-in fallback list** when no working catalog endpoint exists. Used
>    when discovery fails or when the upstream simply has no `/models` at all
>    (e.g. **Hugging Face** returns HTML, **Cloudflare AI Gateway** has no
>    catalog endpoint, **Unbiased AI** has no such route).
>
> A fallback list stands in for a missing endpoint, never for a rejected
> credential: a catalog fetch that fails with 401 or 403 aborts the login
> instead, so a mistyped key cannot be saved as a provider that looks healthy
> in `/model` and then fails on every completion.
>
> | Provider | Default `/models` symptom | Handling |
> |---|---|---|
> | **GitHub Models** | HTTP 404 at `<base_url>/models` (catalog is at `/catalog/models`, not `/inference/models`) | Live discovery — `modelsUrl: https://models.github.ai/catalog/models` |
> | **Cloudflare Workers AI** | HTTP 405 (no `GET /v1/models`; real catalog at `/ai/models/search`, id field is `name`, mixed task types) | Live discovery — `modelsUrl: …/ai/models/search`, `modelsIdField: name`, `modelsKeepTask: "Text Generation"` |
> | **Cloudflare AI Gateway** | HTTP 401 (token missing `AI Gateway: Run`) or HTTP 400 *"Please configure AI Gateway"* (gateway slug doesn't exist, or the upstream isn't configured on it) | Built-in fallback list |
> | **Hugging Face** | Returns HTML rather than JSON | Built-in fallback list |
> | **Unbiased AI** | HTTP 404 `unknown_url` with a valid key (no `/v1/models` at all; an *invalid* key returns 401 on every path, including ones that do not exist, so a 401 here proves nothing) | Built-in fallback list |
>
> **Auto-heal for older configs:** if you logged in before live discovery
> existed, your saved provider is missing these `modelsUrl`/`modelsIdField`/
> `modelsKeepTask` fields. On startup the extension backfills them from the
> template whenever it can do so without prompting — i.e. when your saved base
> URL still matches the template (Cloudflare Workers AI). When the base URL
> itself changed (e.g. GitHub Models' retired `models.inference.ai.azure.com`
> host), it can't be migrated silently and you'll get a one-time notice to run
> `/compat-login`.

---

## Commands

Three commands are available; `/compat-login` is the only one you need to get started.

### `/compat-login`

Walks you through a short wizard:

1. Select a provider from the list above (or choose Custom).
2. For Ollama, llmproxy and Custom, confirm or change the base URL.
3. Enter your API key.  For the local templates the key is optional: press
   Enter to skip it on a default install, or supply one if you have put the
   server behind a reverse proxy or exposed it on your LAN.  The prompt is
   never skipped based on the hostname, because a `.local` or LAN address is
   no guarantee that the endpoint is unauthenticated.
4. The extension connects, fetches the model list from `/v1/models`, and
   registers the provider with pi.

After login, the provider's models appear in pi's `/model` command and
`Ctrl+L` picker immediately.  You can run `/compat-login` again to add a
second provider — all providers are active simultaneously.

### `/compat-refresh`

Re-fetches the model list for an already-registered provider, reusing the
saved base URL, API key, and discovery settings — no need to re-enter URLs,
keys, or account IDs. Use it to pick up models a provider has added (or
dropped) since you logged in, without restarting your session.

If you have multiple providers registered, you are asked which one to refresh
(or choose **All providers**); with a single provider it refreshes directly.
A failed or empty refresh leaves the existing model list untouched, so a flaky
network call can't blank out a working provider.  Capability metadata you have
hand-edited into `cachedModels` (see [Config file](#config-file)) survives a
refresh: the fetched list decides which model IDs exist, and any field the
provider's catalog omits is carried forward from the previous cache.

### `/compat-logout`

Unregisters a provider from pi.  If you have multiple providers registered,
you are asked which one to remove.  If you have only one, you are asked to
confirm.

When the last compat provider is removed, the extension restores whichever
built-in model you were using before you added any compat providers.

---

## Typical workflow

```
/compat-login
  → pick Ollama
  → press Enter to accept http://localhost:11434/v1
  → 3 models added to /model

/model
  → scroll to ollama/gemma4:latest
  → select it

(start chatting)

/compat-logout
  → confirm remove Ollama
  → previous model restored automatically
```

To add OpenRouter alongside Ollama:

```
/compat-login
  → pick OpenRouter
  → enter API key
  → 300+ models added to /model alongside your Ollama models
```

---

## How it works

The extension uses pi's `registerProvider` API to register each configured
endpoint as a named provider.  This is the same mechanism pi uses internally
for Anthropic, OpenAI, and Google.  Registered providers appear in `/model`
and `Ctrl+L` with their own label, and pi handles all model selection,
routing, and request formatting natively.

On unregistration, pi's built-in `unregisterProvider` restores the original
model list automatically.

Model lists are cached in `config.json` at startup so no network call is
needed to re-register providers when pi restarts.

---

## Config file

Credentials and cached model lists are stored at:

```
~/.config/pi-openai-compat/config.json
```

API keys are stored in plaintext, so the extension creates the file `0600` and
the directory `0700`, and tightens both on load if an older version left them
world-readable.  Delete the file to clear all saved credentials.

Each provider's `cachedModels` array holds one entry per model.  Only `id` is
required; the rest are optional and fall back to conservative defaults when the
provider's `/models` catalog does not report them:

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | string | required | Model ID as sent in requests. |
| `contextWindow` | number | `128000` | Context window in tokens. |
| `maxTokens` | number | `4096` | Maximum output tokens per response. |
| `reasoning` | boolean | `false` | Enables pi's thinking mode for the model. |
| `input` | `["text"]` or `["text","image"]` | `["text"]` | Modalities pi may send; `image` lets pi attach image blocks. Any other value is ignored. |
| `thinkingLevelMap` | object | omitted | pi thinking-level remap, passed through to the registered model. Keys are pi thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`); string values are sent to the provider, `null` hides an unsupported level. See [pi's docs](https://pi.dev/docs/latest/models#thinking-level-map). |
| `samplingParams` | object | omitted | **Not currently applied.** Preserved in the config and passed to pi, but pi's `registerProvider` builds each model from a fixed field list that does not include it (verified against pi 0.73.1), so it has no effect today. Kept for forward compatibility. |
| `compat` | object | omitted | OpenAI compatibility flags for the model (`thinkingFormat`, `chatTemplateKwargs`, `maxTokensField`, `supportsDeveloperRole`, …). See [pi's docs](https://pi.dev/docs/latest/models#openai-compatibility). |

`contextWindow` and `maxTokens` are validated before they reach pi: a value
that is not a positive finite number is ignored in favor of the default, and
anything above 10,000,000 (context) or 1,000,000 (output) is clamped.  pi drives
its context accounting off these numbers, so an inflated value from a
misreporting or hostile catalog would otherwise inflate every request sent.

Most catalogs report none of these beyond the ID, so aggregators and proxies
(CLIProxyAPI, for example) register every model as a 128K, text-only,
non-reasoning model.  To correct that, edit the entry by hand and `/reload`:

```json
{
  "providers": {
    "cpa": {
      "cachedModels": [
        { "id": "claude-sonnet-4-6", "contextWindow": 1000000, "maxTokens": 128000,
          "reasoning": true, "input": ["text", "image"] }
      ]
    }
  }
}
```

`/compat-refresh` keeps these hand-edited fields for any model ID that is still
present in the refreshed catalog; a field the provider does report always wins.

### Adding a provider without pi — `add-provider.sh`

`/compat-login` is the normal path, but the repo also ships a standalone script
that writes the same config entry from a shell:

```
./add-provider.sh
```

It lists every provider in `TEMPLATES` (read out of `index.ts` at runtime, so it
never drifts), then prompts for the API key and for the config file path —
defaulting to `~/.config/pi-openai-compat/config.json`, and offering to create it
if it is missing.  It fetches the model catalog, writes
`providers.<key>` with `displayName` / `baseUrl` / `apiKey` / `cachedModels`
exactly as the wizard would, backs the old file up to `config.json.bak`, and
leaves the result `chmod 600`.  Existing providers and `previousModel` are
preserved, and re-running it just updates the one entry.

If the catalog cannot be fetched (wrong key, provider down), it falls back to the
template's built-in model list, or lets you type model IDs by hand.  If the
provider you pick is missing from this checkout's `index.ts` — the script carries
its own copy of the newest templates — it offers to add the template and the
README row too.

Afterwards, run `/reload` in pi to pick up the new provider.

---

## Publishing to npmjs.com

### First-time setup

1. Register at https://www.npmjs.com/signup — use `billjr99` as your username
   to match the `@billjr99/` package scope.
2. Verify your email address (required before publishing).
3. Enable two-factor authentication under your npm account settings.
4. Log in from the command line:

```bash
npm login
```

### Publishing

```bash
cd /path/to/pi-openai-compat
npm publish --access public
```

`--access public` is required for scoped packages on the first publish.
Subsequent publishes do not need it.

The package is immediately available at
https://www.npmjs.com/package/@billjr99/pi-openai-compat.

### Releasing a new version

```bash
npm version patch   # 1.0.0 → 1.0.1  (bug fixes)
npm version minor   # 1.0.0 → 1.1.0  (new features)
npm version major   # 1.0.0 → 2.0.0  (breaking changes)
npm publish --access public
```

`npm version` also creates a git tag, so GitHub gets release tags automatically.

### Automated publishing via GitHub Actions

Every push to `main` automatically bumps the patch version and publishes to npm
via `.github/workflows/publish.yml`. This workflow uses **npm trusted publishing**
(OIDC) — no long-lived token or secret is needed anywhere.

#### Required one-time setup on npmjs.com

> **Do this before the first automated publish or it will fail.**

1. Go to **npmjs.com** → sign in → click your avatar → **Packages** →
   `@billjr99/pi-openai-compat`
2. Click **Settings** (in the left sidebar of the package page)
3. Scroll to **Publishing** → enable **Trusted Publishing**
4. Add a publisher with these exact values:

| Field | Value |
|---|---|
| Repository owner | `BillJr99` |
| Repository name | `pi-openai-compat` |
| Workflow filename | `publish.yml` |
| Environment | *(leave blank)* |

5. Click **Save**

No token to copy, no secret to rotate. That's the only setup step.

#### What the workflow does

```yaml
# .github/workflows/publish.yml
on:
  push:
    branches: [main]

permissions:
  contents: write    # push the version-bump commit back to main
  id-token: write    # request an OIDC token from GitHub for npm auth
```

On every push to `main` the workflow:

1. Checks out the repo with `GITHUB_TOKEN` so it can push back
2. Runs `npm version patch --no-git-tag-version` to increment the patch number
   in `package.json` (e.g. `1.1.0` → `1.1.1`)
3. Commits the updated `package.json` with `[skip ci]` in the message so the
   commit does not re-trigger the workflow
4. Pushes the bump commit to `main`
5. Runs `npm publish --access public --provenance`
   - GitHub mints a short-lived OIDC token proving the job is running from
     this exact repo and workflow
   - npm validates it against the trusted publisher config above and allows
     the publish — no `NPM_TOKEN` secret required
   - `--provenance` attaches a signed build attestation to the package,
     visible on the npmjs.com package page under **Provenance**

The published package is immediately available at
https://www.npmjs.com/package/@billjr99/pi-openai-compat.

### Installing from npm

```bash
pi install npm:@billjr99/pi-openai-compat         # latest
pi install npm:@billjr99/pi-openai-compat@1.0.0   # pinned version
pi update  npm:@billjr99/pi-openai-compat          # update to latest
pi remove  npm:@billjr99/pi-openai-compat          # uninstall
```

---

## Troubleshooting

**Connection fails during `/compat-login`**
Verify the base URL does not have a trailing slash and ends with `/v1`.
Confirm the API key is correct and has model-access permissions.
For Ollama: ensure `ollama serve` is running.
For self-hosted Open WebUI: the OpenAI-compatible API is under `/api/v1`, not
the SPA root — e.g. `https://your-host/api/v1`, not `https://your-host`.
Hitting the root returns the HTML SPA and `/compat-login` fails with a JSON
parse error.

**Cloudflare AI Gateway returns 401 Unauthorized**
Check both: (1) the API token has `AI Gateway: Run` *and* `Workers AI: Read`
under "Permissions", scoped to the correct account; and (2) the gateway slug
in the URL actually exists under that account — list them with:

```bash
curl https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai-gateway/gateways \
  -H "Authorization: Bearer $TOKEN"
```

An empty `result` array means the gateway isn't there (you may need to create it
in **dash.cloudflare.com → AI → AI Gateway**, or you're querying the wrong
account).

**No models appear after login**
For Ollama: pull at least one model first (`ollama pull llama3`).
For OpenRouter: some keys are restricted to free-tier models only.
For NIM: confirm your account has inference access enabled.

**`/compat-login` reports N models but far fewer appear in `/model`**
The usual cause is a **scoped or restricted API key/account** — the catalog
endpoint advertises the full model list, but your credentials are only entitled
to a subset, so pi only surfaces the ones you can actually use. Check whether your
key is limited to specific models or a free tier on the provider's dashboard.

**Models appear in `/model` but requests fail**
Check `/compat-login` ran successfully (no error message).
Verify Ollama is still running if using a local endpoint.
