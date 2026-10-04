#!/usr/bin/env bash
#
# add-provider.sh — provision an OpenAI-compatible provider for pi-openai-compat
# without going through the /compat-login wizard inside pi.
#
# Prompts for the provider, its API key and the config file path, fetches the
# model catalog, and merges the result into ~/.config/pi-openai-compat/config.json
# — the same file, and the same shape, that /compat-login writes. If the chosen
# provider is missing from this checkout's index.ts, it also offers to add the
# template there and to the README table, so the script works on older checkouts.
#
# Requires: node (already required to run the extension) and curl. No jq.
#
# Usage: ./add-provider.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INDEX_TS="$SCRIPT_DIR/index.ts"
README_MD="$SCRIPT_DIR/README.md"
DEFAULT_CONFIG="${HOME}/.config/pi-openai-compat/config.json"

command -v node >/dev/null 2>&1 || { echo "error: node is required but not on PATH." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "error: curl is required but not on PATH." >&2; exit 1; }

TMPDIR_RUN="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_RUN"' EXIT
HELPER="$TMPDIR_RUN/helper.js"

cat > "$HELPER" <<'NODE_EOF'
"use strict";
const fs = require("fs");
const path = require("path");

// Providers this script knows about even when the checkout's index.ts predates
// them. Merged under whatever index.ts already defines, so a current checkout
// simply wins and this table is inert.
const BUILTIN = {
  xkiro: {
    displayName: "xKiro",
    baseUrl: "https://api.xkiro.com/v1",
    keyless: false,
    keyHint: "xkiro.com console — keys look like sk-xt-... (docs at docs.xkiro.com)",
  },
  teamorouter: {
    displayName: "TeamoRouter",
    baseUrl: "https://api.teamorouter.com/v1",
    keyless: false,
    keyHint: "teamorouter.com — keys look like sk-teamo-... (docs at teamorouter.com/docs/api-integration)",
  },
  gmi: {
    displayName: "GMI Cloud",
    baseUrl: "https://api.gmi-serving.com/v1",
    keyless: false,
    keyHint: "console.gmicloud.ai → Organization Settings → API Keys (docs at docs.gmicloud.ai/inference-engine)",
  },
  tokenharbor: {
    displayName: "Token Harbor",
    baseUrl: "https://tokenharbor.ai/v1",
    keyless: false,
    keyHint: "tokenharbor.ai/dashboard/api-keys (Universal Key, format thk_live_...; docs at tokenharbor.ai/docs)",
  },
  tokenrouter: {
    displayName: "TokenRouter",
    baseUrl: "https://api.tokenrouter.com/v1",
    keyless: false,
    keyHint: "tokenrouter.com console (model prices at tokenrouter.com/models)",
  },
  atria_asi: {
    displayName: "Atria ASI",
    baseUrl: "https://api.atria-asi.ai/v1",
    keyless: false,
    keyHint: "api.atria-asi.ai/console/keys (Google sign-in; keys look like atr_...; docs at api.atria-asi.ai/docs)",
  },
  unbiased_ai: {
    displayName: "Unbiased AI",
    baseUrl: "https://api.unbiased.ai/v1",
    keyless: false,
    keyHint: "platform.unbiased.ai (signup is reviewed by hand; keys look like sk_...)",
  },
  kilo: {
    displayName: "Kilo AI",
    baseUrl: "https://api.kilo.ai/api/gateway",
    keyless: false,
    keyHint: "app.kilo.ai → Your Profile on your personal account (not an organization), at the bottom of the page; needs account credits (docs at kilo.ai/docs/gateway)",
  },
  modelscope: {
    displayName: "ModelScope",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    keyless: false,
    keyHint: "modelscope.cn/my/myaccesstoken (SDK token, format ms-...; docs at modelscope.cn/docs/model-service/API-Inference/intro)",
  },
  aion_labs: {
    displayName: "Aion Labs",
    baseUrl: "https://api.aionlabs.ai/v1",
    keyless: false,
    keyHint: "aionlabs.ai/app/api-keys (docs at aionlabs.ai/docs/api-reference)",
  },
  agnes_ai: {
    displayName: "Agnes AI",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    keyless: false,
    keyHint: "platform.agnes-ai.com → API Key management (keys look like sk-...; docs at wiki.agnes-ai.com)",
  },
  xiaomi_mimo: {
    displayName: "Xiaomi MiMo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    keyless: false,
    keyHint: "platform.xiaomimimo.com → API Keys (docs at mimo.mi.com/docs)",
  },
};

// README "Auth" column text for the built-in providers, used only by patchreadme.
const BUILTIN_AUTH = {
  xkiro: "`sk-xt-...` key from the xKiro console at xkiro.com (docs.xkiro.com)",
  teamorouter: "`sk-teamo-...` key from teamorouter.com (teamorouter.com/docs)",
  gmi: "API key from console.gmicloud.ai → Organization Settings → API Keys",
  tokenharbor: "`thk_live_...` Universal Key from tokenharbor.ai/dashboard/api-keys",
  tokenrouter: "API key from the TokenRouter console at tokenrouter.com (model prices at tokenrouter.com/models)",
  atria_asi: "`atr_...` key from api.atria-asi.ai/console/keys (Google sign-in)",
  unbiased_ai: "`sk_...` key from platform.unbiased.ai (signup reviewed by hand)",
  kilo: "API key from app.kilo.ai → Your Profile (personal account), at the bottom of the page; needs account credits",
  modelscope: "`ms-...` SDK token from modelscope.cn/my/myaccesstoken",
  aion_labs: "API key from aionlabs.ai/app/api-keys (aionlabs.ai/docs)",
  agnes_ai: "`sk-...` key from the Agnes console at platform.agnes-ai.com (wiki.agnes-ai.com)",
  xiaomi_mimo: "API key from the Xiaomi MiMo console at platform.xiaomimimo.com → API Keys (mimo.mi.com/docs)",
};

/**
 * Locate the TEMPLATES object literal in index.ts and return [start, end)
 * offsets of the literal itself (braces included). Scans with a tiny tokenizer
 * so braces inside strings, template literals and comments never confuse the
 * depth count. Returns null if the shape is not what we expect.
 */
function templatesRange(src) {
  const decl = src.indexOf("const TEMPLATES");
  if (decl === -1) return null;
  // The declaration carries a TS type annotation between the name and the "= {".
  const eq = src.indexOf("= {", decl);
  if (eq === -1) return null;
  const start = src.indexOf("{", eq);
  let i = start, depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i === -1) return null; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i); if (i === -1) return null; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) { if (src[i] === "\\") i++; i++; }
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return [start, i + 1]; }
    i++;
  }
  return null;
}

/** Parse TEMPLATES out of index.ts. The literal is pure data, so evaluating it
 *  is exact and stays in step with the file as providers are added. */
function parseTemplates(indexPath) {
  try {
    const src = fs.readFileSync(indexPath, "utf8");
    const range = templatesRange(src);
    if (!range) return null;
    const literal = src.slice(range[0], range[1]);
    // eslint-disable-next-line no-new-func
    const obj = new Function("return (" + literal + ");")();
    if (!obj || typeof obj !== "object" || !Object.keys(obj).length) return null;
    return obj;
  } catch {
    return null;
  }
}

/** Templates from index.ts, with any BUILTIN entry the checkout lacks appended
 *  just before `custom` (which the wizard keeps last). */
function templateMenu(indexPath) {
  const parsed = parseTemplates(indexPath);
  const base = parsed || {};
  const out = {};
  for (const [k, v] of Object.entries(base)) {
    if (k === "custom") continue;
    out[k] = v;
  }
  for (const [k, v] of Object.entries(BUILTIN)) if (!(k in out)) out[k] = v;
  if (base.custom) out.custom = base.custom;
  else out.custom = { displayName: "Custom Endpoint", baseUrl: "", keyless: false, promptUrl: true };
  return { templates: out, parsed: parsed !== null, inFile: Object.keys(base) };
}

/** Mirror of fetchModels() in index.ts: normalize the catalog payload, honour
 *  the id-field / task overrides, drop empty ids, sort by id. */
function normalizeModels(body, idField, keepTask) {
  const json = JSON.parse(body);
  let raw;
  if (Array.isArray(json)) raw = json;
  else if (json && typeof json === "object") {
    if (Array.isArray(json.data)) raw = json.data;
    else if (Array.isArray(json.result)) raw = json.result;
    else if (Array.isArray(json.models)) raw = json.models;
  }
  if (!raw) throw new Error('expected an array or an object with a "data", "result" or "models" array');
  const field = idField || "id";
  return raw
    .filter((m) => {
      if (!keepTask) return true;
      const name = (m && m.task && m.task.name) || "";
      return name.toLowerCase() === keepTask.toLowerCase();
    })
    .map((m) => {
      const rawId = m ? m[field] : undefined;
      const id = typeof rawId === "string" ? rawId : typeof rawId === "number" ? String(rawId) : "";
      const out = { id };
      // Mirrors normalizeTokenCount() in index.ts: the catalog is untrusted,
      // so a non-numeric or absurd token count is dropped/clamped rather than
      // written into config.json.
      const num = (v, max) =>
        typeof v === "number" && Number.isFinite(v) && v > 0
          ? Math.min(Math.floor(v), max)
          : undefined;
      const ctx = num(m ? m.context_window : undefined, 10000000);
      const max = num(m ? m.max_tokens : undefined, 1000000);
      if (ctx !== undefined) out.contextWindow = ctx;
      if (max !== undefined) out.maxTokens = max;
      return out;
    })
    .filter((m) => Boolean(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function writeAtomic(file, text, mode) {
  const tmp = file + ".tmp." + process.pid;
  fs.writeFileSync(tmp, text, { mode: mode || 0o600 });
  fs.renameSync(tmp, file);
  if (mode) { try { fs.chmodSync(file, mode); } catch {} }
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "menu") {
  // args: indexPath
  process.stdout.write(JSON.stringify(templateMenu(args[0])));

} else if (cmd === "models") {
  // args: bodyFile idField keepTask modelFilterJson
  const [bodyFile, idField, keepTask, filterJson] = args;
  let models = normalizeModels(fs.readFileSync(bodyFile, "utf8"), idField || null, keepTask || null);
  const filter = filterJson ? JSON.parse(filterJson) : null;
  if (Array.isArray(filter) && filter.length) {
    const set = new Set(filter);
    const kept = models.filter((m) => set.has(m.id));
    if (kept.length) models = kept;
    else process.stderr.write(
      "note: none of the template's expected models were returned — keeping all " +
      models.length + " model(s) the provider listed.\n");
  }
  process.stdout.write(JSON.stringify(models));

} else if (cmd === "merge") {
  // args: configPath providerKey providerJson
  const [configPath, key, providerJson] = args;
  const provider = JSON.parse(providerJson);
  let config = { previousModel: null, providers: {} };
  if (fs.existsSync(configPath)) {
    const text = fs.readFileSync(configPath, "utf8").trim();
    if (text) {
      try {
        config = JSON.parse(text);
      } catch (e) {
        console.error("error: " + configPath + " is not valid JSON (" + e.message + ").");
        console.error("Refusing to overwrite it — fix or move the file and re-run.");
        process.exit(1);
      }
    }
    fs.copyFileSync(configPath, configPath + ".bak");
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    console.error("error: " + configPath + " does not contain a JSON object.");
    process.exit(1);
  }
  if (!config.providers || typeof config.providers !== "object") config.providers = {};
  if (!("previousModel" in config)) config.previousModel = null;
  const existed = key in config.providers;
  config.providers[key] = provider;
  writeAtomic(configPath, JSON.stringify(config, null, 2) + "\n", 0o600);
  process.stdout.write(existed ? "updated" : "added");

} else if (cmd === "patch-index") {
  // args: indexPath key tplJson  — insert a TEMPLATES entry before `custom:`
  const [indexPath, key, tplJson] = args;
  const tpl = JSON.parse(tplJson);
  const src = fs.readFileSync(indexPath, "utf8");
  const existing = parseTemplates(indexPath);
  if (existing && key in existing) { process.stdout.write("present"); process.exit(0); }
  const anchor = src.indexOf("\n  custom: {");
  if (anchor === -1) { process.stdout.write("noanchor"); process.exit(0); }
  const lines = ["  " + key + ": {"];
  lines.push('    displayName: ' + JSON.stringify(tpl.displayName) + ",");
  lines.push('    baseUrl: ' + JSON.stringify(tpl.baseUrl) + ",");
  lines.push('    keyless: ' + (tpl.keyless ? "true" : "false") + ",");
  if (tpl.keyHint) lines.push('    keyHint: ' + JSON.stringify(tpl.keyHint) + ",");
  if (tpl.promptUrl) lines.push("    promptUrl: true,");
  lines.push("  },");
  const block = "\n" + lines.join("\n");
  writeAtomic(indexPath, src.slice(0, anchor) + block + src.slice(anchor), null);
  process.stdout.write("patched");

} else if (cmd === "patch-readme") {
  // args: readmePath key displayName baseUrl
  const [readmePath, key, displayName, baseUrl] = args;
  const src = fs.readFileSync(readmePath, "utf8");
  if (src.includes("| **" + displayName + "** |")) { process.stdout.write("present"); process.exit(0); }
  const anchor = "| **Ollama (local)** |";
  const at = src.indexOf(anchor);
  if (at === -1) { process.stdout.write("noanchor"); process.exit(0); }
  const auth = BUILTIN_AUTH[key] || "API key from the provider's console";
  const row = "| **" + displayName + "** | `" + baseUrl + "` | " + auth + " |\n";
  writeAtomic(readmePath, src.slice(0, at) + row + src.slice(at), null);
  process.stdout.write("patched");

} else {
  console.error("unknown subcommand: " + cmd);
  process.exit(2);
}
NODE_EOF

node_helper() { node "$HELPER" "$@"; }

# ── Read the provider list straight out of index.ts ──────────────────────────
if [ ! -f "$INDEX_TS" ]; then
  echo "error: index.ts not found next to this script ($INDEX_TS)." >&2
  exit 1
fi
MENU_JSON="$(node_helper menu "$INDEX_TS")"
if [ "$(printf '%s' "$MENU_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).parsed?"1":"0"))')" != "1" ]; then
  echo "warning: could not parse TEMPLATES out of index.ts — falling back to the" >&2
  echo "         providers built into this script." >&2
fi

mapfile -t KEYS < <(printf '%s' "$MENU_JSON" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const t=JSON.parse(s).templates;
  for (const k of Object.keys(t)) console.log(k);
});')

tpl_field() { # tpl_field <key> <field>
  printf '%s' "$MENU_JSON" | KEY="$1" FIELD="$2" node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const v=JSON.parse(s).templates[process.env.KEY][process.env.FIELD];
  if (v===undefined||v===null) process.stdout.write("");
  else if (typeof v==="object") process.stdout.write(JSON.stringify(v));
  else process.stdout.write(String(v));
});'
}

echo
echo "pi-openai-compat — add a provider"
echo "================================="
echo
i=1
for k in "${KEYS[@]}"; do
  disp="$(tpl_field "$k" displayName)"
  url="$(tpl_field "$k" baseUrl)"
  printf '%3d) %-28s %s\n' "$i" "$disp" "${url:-<you supply the URL>}"
  i=$((i + 1))
done
echo

while :; do
  read -r -p "Select a provider [1-${#KEYS[@]}]: " choice
  case "$choice" in
    ''|*[!0-9]*) echo "  Enter a number." ;;
    *) if [ "$choice" -ge 1 ] && [ "$choice" -le "${#KEYS[@]}" ]; then break; fi
       echo "  Out of range." ;;
  esac
done
TPL_KEY="${KEYS[$((choice - 1))]}"

DISPLAY_NAME="$(tpl_field "$TPL_KEY" displayName)"
BASE_URL="$(tpl_field "$TPL_KEY" baseUrl)"
KEYLESS="$(tpl_field "$TPL_KEY" keyless)"
KEY_HINT="$(tpl_field "$TPL_KEY" keyHint)"
PROMPT_URL="$(tpl_field "$TPL_KEY" promptUrl)"
MODELS_URL="$(tpl_field "$TPL_KEY" modelsUrl)"
MODELS_ID_FIELD="$(tpl_field "$TPL_KEY" modelsIdField)"
MODELS_KEEP_TASK="$(tpl_field "$TPL_KEY" modelsKeepTask)"
MODEL_FILTER="$(tpl_field "$TPL_KEY" modelFilter)"
FALLBACK_MODELS="$(tpl_field "$TPL_KEY" fallbackModels)"

echo
echo "Selected: $DISPLAY_NAME"

# The config key doubles as pi's provider id (compat-<key>), so let it be renamed.
read -r -p "Config key (pi will show it as compat/${TPL_KEY//_/-}) [$TPL_KEY]: " PROVIDER_KEY
PROVIDER_KEY="${PROVIDER_KEY:-$TPL_KEY}"

if [ "$TPL_KEY" = "custom" ]; then
  read -r -p "Display name [Custom Endpoint]: " in_disp
  DISPLAY_NAME="${in_disp:-Custom Endpoint}"
fi

# ── Base URL, including the placeholder substitutions the wizard performs ────
for ph in YOUR_ACCOUNT_ID YOUR_GATEWAY_SLUG YOUR_PROVIDER; do
  case "$BASE_URL$MODELS_URL" in
    *"$ph"*)
      read -r -p "Value for $ph: " val
      [ -n "$val" ] || { echo "error: $ph is required for this provider." >&2; exit 1; }
      BASE_URL="${BASE_URL//$ph/$val}"
      MODELS_URL="${MODELS_URL//$ph/$val}"
      ;;
  esac
done

if [ "$PROMPT_URL" = "true" ] || [ -z "$BASE_URL" ]; then
  read -r -p "Base URL${BASE_URL:+ [$BASE_URL]}: " in_url
  BASE_URL="${in_url:-$BASE_URL}"
fi
[ -n "$BASE_URL" ] || { echo "error: a base URL is required." >&2; exit 1; }
BASE_URL="${BASE_URL%/}"

# ── API key ──────────────────────────────────────────────────────────────────
IS_LOCAL=0
case "$BASE_URL" in
  *//localhost*|*//127.0.0.1*|*//[::1]*|*//0.0.0.0*) IS_LOCAL=1 ;;
esac

API_KEY=""
if [ "$KEYLESS" = "true" ] || [ "$IS_LOCAL" = "1" ]; then
  echo "  (this endpoint is keyless — press Enter to skip, or paste a token if yours requires one)"
  read -r -s -p "API key (optional): " API_KEY; echo
else
  [ -n "$KEY_HINT" ] && echo "  Get your key at: $KEY_HINT"
  read -r -s -p "API key: " API_KEY; echo
  if [ -z "$API_KEY" ]; then
    echo "error: this provider requires an API key." >&2
    exit 1
  fi
fi

# ── Config file path ─────────────────────────────────────────────────────────
echo
read -r -p "Config file [$DEFAULT_CONFIG]: " CONFIG_PATH
CONFIG_PATH="${CONFIG_PATH:-$DEFAULT_CONFIG}"
case "$CONFIG_PATH" in "~"/*) CONFIG_PATH="$HOME/${CONFIG_PATH#\~/}" ;; esac

if [ ! -f "$CONFIG_PATH" ]; then
  read -r -p "$CONFIG_PATH does not exist. Create it? [Y/n]: " yn
  case "${yn:-Y}" in [Nn]*) echo "Aborted."; exit 1 ;; esac
fi

# ── Fetch the model catalog ──────────────────────────────────────────────────
FETCH_URL="${MODELS_URL:-$BASE_URL/models}"
echo
echo "Fetching models from $FETCH_URL …"
BODY="$TMPDIR_RUN/models.json"
HTTP_CODE="$(curl -sS -o "$BODY" -w '%{http_code}' --max-time 45 \
  -H 'Accept: application/json' \
  ${API_KEY:+-H "Authorization: Bearer $API_KEY"} \
  "$FETCH_URL" || echo 000)"

MODELS_JSON=""
if [ "$HTTP_CODE" = "200" ]; then
  if MODELS_JSON="$(node_helper models "$BODY" "$MODELS_ID_FIELD" "$MODELS_KEEP_TASK" "$MODEL_FILTER" 2>"$TMPDIR_RUN/err")"; then
    [ -s "$TMPDIR_RUN/err" ] && cat "$TMPDIR_RUN/err"
  else
    echo "  Could not read the catalog payload: $(cat "$TMPDIR_RUN/err")"
    MODELS_JSON=""
  fi
else
  echo "  HTTP $HTTP_CODE from $FETCH_URL"
  [ -s "$BODY" ] && head -c 300 "$BODY" && echo
fi

MODEL_COUNT=0
[ -n "$MODELS_JSON" ] && MODEL_COUNT="$(printf '%s' "$MODELS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).length)))')"

# Mirrors isAuthFailure() in index.ts: a fallback list stands in for an endpoint
# that is not there, never for a credential that was refused. Falling back on a
# 401/403 would write a provider that looks healthy in /model and fails on every
# completion, which is worse than saying the key was rejected.
if [ "$MODEL_COUNT" = "0" ] && { [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; }; then
  echo "  The provider rejected the API key (HTTP $HTTP_CODE)."
  echo "  Not using the built-in model list: that would save a provider whose"
  echo "  every request fails. Re-run with a valid key."
  exit 1
fi

if [ "$MODEL_COUNT" = "0" ]; then
  if [ -n "$FALLBACK_MODELS" ]; then
    echo "  Using this template's built-in model list instead."
    MODELS_JSON="$(printf '%s' "$FALLBACK_MODELS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s).map(id=>({id})))))')"
  else
    echo "  No models discovered. Enter model IDs by hand (comma-separated), or"
    echo "  leave blank to save the provider anyway and run /compat-refresh later."
    read -r -p "  Model IDs: " manual
    MODELS_JSON="$(MANUAL="$manual" node -e '
const ids=(process.env.MANUAL||"").split(",").map(s=>s.trim()).filter(Boolean);
process.stdout.write(JSON.stringify(ids.map(id=>({id}))));')"
  fi
  MODEL_COUNT="$(printf '%s' "$MODELS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).length)))')"
fi
echo "  $MODEL_COUNT model(s)."

# ── Merge into the config ────────────────────────────────────────────────────
PROVIDER_JSON="$(
  DISPLAY_NAME="$DISPLAY_NAME" BASE_URL="$BASE_URL" API_KEY="$API_KEY" \
  MODELS_JSON="$MODELS_JSON" MODELS_URL="$MODELS_URL" \
  MODELS_ID_FIELD="$MODELS_ID_FIELD" MODELS_KEEP_TASK="$MODELS_KEEP_TASK" \
  node -e '
const e = process.env;
const out = {
  displayName: e.DISPLAY_NAME,
  baseUrl: e.BASE_URL,
  apiKey: e.API_KEY ? e.API_KEY : null,
  cachedModels: JSON.parse(e.MODELS_JSON || "[]"),
};
// Persisted so the session_start rehydrate path re-fetches from the right URL.
if (e.MODELS_URL) out.modelsUrl = e.MODELS_URL;
if (e.MODELS_ID_FIELD) out.modelsIdField = e.MODELS_ID_FIELD;
if (e.MODELS_KEEP_TASK) out.modelsKeepTask = e.MODELS_KEEP_TASK;
process.stdout.write(JSON.stringify(out));'
)"

RESULT="$(node_helper merge "$CONFIG_PATH" "$PROVIDER_KEY" "$PROVIDER_JSON")"
echo
if [ "$RESULT" = "updated" ]; then
  echo "Updated provider '$PROVIDER_KEY' in $CONFIG_PATH (previous version saved to $CONFIG_PATH.bak)."
else
  echo "Added provider '$PROVIDER_KEY' to $CONFIG_PATH."
fi

# ── Offer to add the template to this checkout if it is missing ──────────────
IN_FILE="$(printf '%s' "$MENU_JSON" | KEY="$TPL_KEY" node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  process.stdout.write(JSON.parse(s).inFile.includes(process.env.KEY)?"1":"0");});')"

if [ "$IN_FILE" != "1" ] && [ "$TPL_KEY" != "custom" ]; then
  echo
  echo "'$TPL_KEY' is not in this checkout's index.ts TEMPLATES."
  read -r -p "Add it to index.ts and the README table too? [y/N]: " yn
  case "${yn:-N}" in
    [Yy]*)
      TPLJSON="$(DISPLAY_NAME="$DISPLAY_NAME" BASE_URL="$BASE_URL" KEYLESS="$KEYLESS" KEY_HINT="$KEY_HINT" node -e '
const e=process.env;
process.stdout.write(JSON.stringify({
  displayName: e.DISPLAY_NAME, baseUrl: e.BASE_URL,
  keyless: e.KEYLESS === "true", keyHint: e.KEY_HINT || undefined }));')"
      echo "  index.ts:  $(node_helper patch-index "$INDEX_TS" "$TPL_KEY" "$TPLJSON")"
      echo "  README.md: $(node_helper patch-readme "$README_MD" "$TPL_KEY" "$DISPLAY_NAME" "$BASE_URL")"
      ;;
    *) echo "  Skipped — the config entry above works regardless." ;;
  esac
fi

echo
echo "Done. In pi, run /reload (then /model to pick a $DISPLAY_NAME model)."
