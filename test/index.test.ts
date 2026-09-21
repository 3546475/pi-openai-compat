/**
 * Regression tests for @billjr99/pi-openai-compat.
 *
 * Runs on node:test with Node's built-in TypeScript type stripping, so there
 * is no build step and no test-framework dependency. index.ts imports pi only
 * as `import type`, which is erased at runtime, and has no top-level side
 * effects, so importing it here is free.
 *
 *   node --test test/
 *
 * Each suite below is tied to a specific defect so the fix cannot silently
 * regress. Where a test encodes a rule enforced by pi rather than by this
 * extension, the pi source is cited in a comment.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  CURSOR_MARKER,
  getKeybindings,
  type Keybinding,
  visibleWidth,
} from "@mariozechner/pi-tui";

import {
  TEMPLATES,
  KEYLESS_PLACEHOLDER,
  MAX_CONTEXT_WINDOW,
  MAX_OUTPUT_TOKENS,
  MAX_ERROR_BODY,
  CONFIG_FILE_MODE,
  PICKER_MAX_VISIBLE,
  SearchablePicker,
  buildProviderModels,
  compatKey,
  fetchModels,
  isAuthFailure,
  isLocalUrl,
  mergeModelMetadata,
  normalizeInput,
  normalizeTokenCount,
  pickFromList,
  providerPickerItems,
  registeredProviderItems,
  registerProvider,
  restrictPermissions,
  tryRegisterProvider,
  type PickerItem,
} from "../index.ts";

/**
 * pi's ModelRegistry.validateProviderConfig, reproduced from
 * @mariozechner/pi-coding-agent dist/core/model-registry.js. A provider that
 * defines models is rejected outright unless apiKey is a non-empty string,
 * and registerProvider throws before any /compat-* command is registered.
 */
function piWouldAccept(config: { baseUrl?: string; apiKey?: unknown; models?: unknown[] }): boolean {
  if (!config.models || config.models.length === 0) return true;
  if (!config.baseUrl) return false;
  if (!config.apiKey) return false;
  return true;
}

/** Minimal ExtensionAPI stub capturing what registerProvider hands to pi. */
function fakePi() {
  const calls: Array<{ key: string; config: any }> = [];
  const pi = {
    registerProvider(key: string, config: any) {
      // Mirror pi's own rejection so a regression surfaces as a throw here too.
      if (!piWouldAccept(config)) {
        throw new Error(`Provider ${key}: "apiKey" or "oauth" is required when defining models.`);
      }
      calls.push({ key, config });
    },
  };
  return { pi: pi as any, calls };
}

const oneModel = [{ id: "llama3" }];

// ─────────────────────────────────────────────────────────────────────────────
describe("Finding 1 — keyless providers must still register (PR #30 regression)", () => {
  test("a keyless provider is given a non-empty placeholder key", () => {
    const { pi, calls } = fakePi();
    registerProvider(pi, "ollama", {
      displayName: "Ollama (local)",
      baseUrl: "http://localhost:11434/v1",
      apiKey: null,
      cachedModels: oneModel,
    });
    assert.equal(calls.length, 1, "provider should have registered");
    assert.equal(calls[0].config.apiKey, KEYLESS_PLACEHOLDER);
    assert.equal(typeof calls[0].config.apiKey, "string");
    assert.ok(calls[0].config.apiKey.length > 0, "pi rejects a falsy apiKey");
  });

  test("a real key is passed through untouched", () => {
    const { pi, calls } = fakePi();
    registerProvider(pi, "openrouter", {
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-secret",
      cachedModels: oneModel,
    });
    assert.equal(calls[0].config.apiKey, "sk-or-secret");
  });

  test("the placeholder does not depend on the hostname being local", () => {
    // The whole point of PR #30: a .local or LAN host may still be
    // key-protected, so registration must not branch on isLocalUrl.
    const { pi, calls } = fakePi();
    for (const baseUrl of [
      "http://localhost:11434/v1",
      "http://mac-mini.local:11434/v1",
      "https://ollama.example.com/v1",
    ]) {
      registerProvider(pi, "k", {
        displayName: "x", baseUrl, apiKey: null, cachedModels: oneModel,
      });
    }
    assert.equal(calls.length, 3);
    for (const c of calls) assert.equal(c.config.apiKey, KEYLESS_PLACEHOLDER);
  });

  test("every keyless template can actually register", () => {
    const { pi, calls } = fakePi();
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      if (!tpl.keyless) continue;
      registerProvider(pi, key, {
        displayName: tpl.displayName,
        baseUrl: tpl.baseUrl || "http://localhost:1/v1",
        apiKey: null,
        cachedModels: oneModel,
      });
    }
    assert.ok(calls.every((c) => piWouldAccept(c.config)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Finding 2 — one bad provider must not take down the extension", () => {
  test("tryRegisterProvider reports failure instead of throwing", () => {
    const exploding = {
      registerProvider() { throw new Error("boom"); },
    } as any;
    let ok: boolean | undefined;
    assert.doesNotThrow(() => {
      ok = tryRegisterProvider(exploding, "bad", {
        displayName: "bad", baseUrl: "https://x/v1", apiKey: "k", cachedModels: oneModel,
      });
    });
    assert.equal(ok, false);
  });

  test("a failing provider does not stop the ones after it", () => {
    const seen: string[] = [];
    const pi = {
      registerProvider(key: string) {
        if (key === "compat-bad") throw new Error("boom");
        seen.push(key);
      },
    } as any;
    const providers = {
      bad: { displayName: "bad", baseUrl: "https://x/v1", apiKey: "k", cachedModels: oneModel },
      good: { displayName: "good", baseUrl: "https://y/v1", apiKey: "k", cachedModels: oneModel },
    };
    for (const [key, p] of Object.entries(providers)) tryRegisterProvider(pi, key, p);
    assert.deepEqual(seen, [compatKey("good")]);
  });

  test("tryRegisterProvider succeeds on a valid provider", () => {
    const { pi } = fakePi();
    assert.equal(
      tryRegisterProvider(pi, "ok", {
        displayName: "ok", baseUrl: "https://x/v1", apiKey: null, cachedModels: oneModel,
      }),
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Finding 3 — locally-hosted templates must still offer a key prompt", () => {
  test("ollama and llmproxy are not marked keyless", () => {
    // They are routinely exposed on a LAN/.local host behind a key. Marking
    // them keyless skips the wizard's key prompt with no way to supply one.
    for (const key of ["ollama", "llmproxy"]) {
      assert.equal(TEMPLATES[key].keyless, false, `${key} must prompt for an optional key`);
    }
  });

  test("a template that skips the key prompt never advertises a key source", () => {
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      if (tpl.keyless) {
        assert.equal(tpl.keyHint, undefined, `${key}: keyless template must not have a keyHint`);
      }
    }
  });

  test("every template has a usable baseUrl or prompts for one", () => {
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      assert.ok(tpl.baseUrl || tpl.promptUrl, `${key}: needs a baseUrl or promptUrl`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Finding 5 — config permissions (API keys are stored in cleartext)", () => {
  test("restrictPermissions tightens a world-readable file", (t) => {
    if (process.platform === "win32") return t.skip("POSIX modes only");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compat-perm-"));
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, "{}", { mode: 0o644 });
    fs.chmodSync(file, 0o644);
    restrictPermissions(file, CONFIG_FILE_MODE);
    assert.equal(fs.statSync(file).mode & 0o777, CONFIG_FILE_MODE);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("restrictPermissions leaves an already-strict file alone", (t) => {
    if (process.platform === "win32") return t.skip("POSIX modes only");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compat-perm-"));
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, "{}", { mode: 0o600 });
    fs.chmodSync(file, 0o400);
    restrictPermissions(file, CONFIG_FILE_MODE);
    // 0400 is narrower than 0600, so it must not be widened.
    assert.equal(fs.statSync(file).mode & 0o777, 0o400);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("restrictPermissions does not throw on a missing path", () => {
    assert.doesNotThrow(() => restrictPermissions("/nonexistent/compat/config.json", 0o600));
  });

  test("the config file mode is owner-only", () => {
    assert.equal(CONFIG_FILE_MODE & 0o077, 0, "config.json must not be group/world accessible");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Finding 6 — untrusted catalog metadata is validated", () => {
  test("non-numeric token counts are rejected", () => {
    for (const bad of ["128000", null, undefined, NaN, Infinity, -1, 0, {}, []]) {
      assert.equal(normalizeTokenCount(bad, MAX_CONTEXT_WINDOW), undefined, `rejects ${String(bad)}`);
    }
  });

  test("absurd token counts are clamped, not trusted", () => {
    assert.equal(normalizeTokenCount(100_000_000, MAX_CONTEXT_WINDOW), MAX_CONTEXT_WINDOW);
    assert.equal(normalizeTokenCount(5_000_000, MAX_OUTPUT_TOKENS), MAX_OUTPUT_TOKENS);
  });

  test("sane values pass through, fractions floored", () => {
    assert.equal(normalizeTokenCount(128_000, MAX_CONTEXT_WINDOW), 128_000);
    assert.equal(normalizeTokenCount(4096.7, MAX_OUTPUT_TOKENS), 4096);
  });

  test("a hostile cachedModels entry cannot reach pi unvalidated", () => {
    const [m] = buildProviderModels([
      { id: "evil", contextWindow: 1e12, maxTokens: "9999" as any },
    ]);
    assert.equal(m.contextWindow, MAX_CONTEXT_WINDOW);
    assert.equal(m.maxTokens, 4_096, "a string maxTokens falls back to the default");
  });

  test("defaults still apply when the catalog omits the fields", () => {
    const [m] = buildProviderModels([{ id: "plain" }]);
    assert.equal(m.contextWindow, 128_000);
    assert.equal(m.maxTokens, 4_096);
    assert.equal(m.reasoning, false);
    assert.deepEqual(m.input, ["text"]);
  });

  test("normalizeInput drops unknown modalities (PR #24/#25)", () => {
    assert.deepEqual(normalizeInput(["text", "image"]), ["text", "image"]);
    assert.deepEqual(normalizeInput(["text", "video", "audio"]), ["text"]);
    assert.equal(normalizeInput(["video"]), undefined);
    assert.equal(normalizeInput("text"), undefined);
    assert.equal(normalizeInput(null), undefined);
    assert.equal(normalizeInput([]), undefined);
  });

  test("fetchModels sanitizes a hostile /models payload end to end", async (t) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: "evil", context_window: 1e12, max_tokens: "abc", reasoning: "yes", input: ["video"] },
          { id: "fine", context_window: 200_000, max_tokens: 8_192, reasoning: true, input: ["text", "image"] },
        ],
      }),
    })) as any;
    t.after(() => { globalThis.fetch = original; });

    const models = await fetchModels("https://hostile.example/v1", null);
    const evil = models.find((m) => m.id === "evil")!;
    assert.equal(evil.contextWindow, MAX_CONTEXT_WINDOW, "clamped");
    assert.equal(evil.maxTokens, undefined, "string max_tokens dropped");
    assert.equal(evil.reasoning, undefined, "non-boolean reasoning dropped");
    assert.equal(evil.input, undefined, "unknown modality dropped");

    const fine = models.find((m) => m.id === "fine")!;
    assert.equal(fine.contextWindow, 200_000);
    assert.equal(fine.maxTokens, 8_192);
    assert.equal(fine.reasoning, true);
    assert.deepEqual(fine.input, ["text", "image"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Finding 7 — upstream error bodies are truncated", () => {
  test("a huge error body is capped before it reaches the UI", async (t) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 401,
      text: async () => "S".repeat(50_000),
    })) as any;
    t.after(() => { globalThis.fetch = original; });

    await assert.rejects(
      () => fetchModels("https://x.example/v1", "sk-test"),
      (err: Error) => {
        assert.ok(err.message.length < MAX_ERROR_BODY + 200, "error message must stay bounded");
        assert.ok(err.message.includes("truncated"));
        assert.ok(err.message.includes("401"));
        return true;
      },
    );
  });

  test("a short error body is preserved verbatim for diagnosis", async (t) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false, status: 404, text: async () => "no such route",
    })) as any;
    t.after(() => { globalThis.fetch = original; });

    await assert.rejects(
      () => fetchModels("https://x.example/v1", null),
      /404.*no such route/s,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("supporting behavior relied on by the fixes", () => {
  test("mergeModelMetadata carries hand-edited fields forward (PR #25/#28)", () => {
    const merged = mergeModelMetadata(
      [{ id: "a", contextWindow: 1_000_000, reasoning: true, input: ["text", "image"],
         thinkingLevelMap: { high: "high" }, compat: { maxTokensField: "max_tokens" } }],
      [{ id: "a" }, { id: "b" }],
    );
    const a = merged.find((m) => m.id === "a")!;
    assert.equal(a.contextWindow, 1_000_000);
    assert.equal(a.reasoning, true);
    assert.deepEqual(a.input, ["text", "image"]);
    assert.deepEqual(a.thinkingLevelMap, { high: "high" });
    assert.deepEqual(a.compat, { maxTokensField: "max_tokens" });
    assert.ok(merged.find((m) => m.id === "b"), "new ids are kept");
  });

  test("a field the provider reports wins over the cached value", () => {
    const merged = mergeModelMetadata(
      [{ id: "a", contextWindow: 1_000 }],
      [{ id: "a", contextWindow: 2_000 }],
    );
    assert.equal(merged[0].contextWindow, 2_000);
  });

  test("a model dropped upstream is dropped from the cache", () => {
    const merged = mergeModelMetadata([{ id: "old" }], [{ id: "new" }]);
    assert.deepEqual(merged.map((m) => m.id), ["new"]);
  });

  test("passthrough fields are only emitted when present", () => {
    const [bare] = buildProviderModels([{ id: "x" }]);
    assert.ok(!("thinkingLevelMap" in bare));
    assert.ok(!("compat" in bare));
    const [full] = buildProviderModels([{ id: "x", compat: { supportsDeveloperRole: false } }]);
    assert.deepEqual((full as any).compat, { supportsDeveloperRole: false });
  });

  test("isLocalUrl is still correct for the prompt hint it now only feeds", () => {
    assert.equal(isLocalUrl("http://localhost:11434/v1"), true);
    assert.equal(isLocalUrl("http://127.0.0.1:8080/v1"), true);
    assert.equal(isLocalUrl("http://mac.local:11434/v1"), true);
    assert.equal(isLocalUrl("https://openrouter.ai/api/v1"), false);
    assert.equal(isLocalUrl("not a url"), false);
  });

  test("compatKey namespaces providers", () => {
    assert.equal(compatKey("ollama"), "compat-ollama");
  });

  test("fetchModels accepts the four documented catalog shapes", async (t) => {
    const original = globalThis.fetch;
    t.after(() => { globalThis.fetch = original; });
    for (const payload of [
      { data: [{ id: "m" }] },
      { result: [{ id: "m" }] },
      { models: [{ id: "m" }] },
      [{ id: "m" }],
    ]) {
      globalThis.fetch = (async () => ({ ok: true, json: async () => payload })) as any;
      const models = await fetchModels("https://x.example/v1", null);
      assert.deepEqual(models.map((m) => m.id), ["m"]);
    }
  });

  test("fetchModels rejects an unrecognized catalog shape", async (t) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ nope: 1 }) })) as any;
    t.after(() => { globalThis.fetch = original; });
    await assert.rejects(() => fetchModels("https://x.example/v1", null), /Unexpected model catalog payload/);
  });
});

describe("catalog failures: a missing endpoint is not a bad key", () => {
  const respond = (status: number) => (async () => ({
    ok: false,
    status,
    text: async () => "{}",
  })) as any;

  test("fetchModels carries the upstream status on the error", async (t) => {
    const original = globalThis.fetch;
    t.after(() => { globalThis.fetch = original; });
    for (const status of [401, 403, 404, 500]) {
      globalThis.fetch = respond(status);
      const err = await fetchModels("https://x.example/v1", "k").then(
        () => null,
        (e) => e,
      );
      assert.equal(err.status, status, `status ${status} must reach the caller`);
    }
  });

  test("isAuthFailure separates a rejected key from a missing endpoint", () => {
    // 401/403 mean the credential was refused, so a fallback list must not
    // stand in: it would save a provider that fails every completion.
    assert.equal(isAuthFailure({ status: 401 }), true);
    assert.equal(isAuthFailure({ status: 403 }), true);
    // 404 is the Unbiased AI case: the key was accepted, the path is absent.
    assert.equal(isAuthFailure({ status: 404 }), false);
    assert.equal(isAuthFailure({ status: 500 }), false);
    // A network error carries no status; treat it as non-auth so an offline
    // host still gets the fallback rather than a hard failure.
    assert.equal(isAuthFailure(new Error("fetch failed")), false);
    assert.equal(isAuthFailure(null), false);
    assert.equal(isAuthFailure(undefined), false);
  });

  test("unbiased_ai ships a fallback list, because it publishes no catalog", () => {
    // GET /v1/models returns 404 "unknown_url" with a valid key, so discovery
    // finds nothing and /compat-login would refuse to save without this.
    assert.deepEqual(TEMPLATES.unbiased_ai.fallbackModels, ["pareto"]);
  });

  test("every fallback list names at least one model", () => {
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      if (tpl.fallbackModels !== undefined) {
        assert.ok(
          tpl.fallbackModels.length > 0,
          `${key}: an empty fallback list is never reached and hides the failure`,
        );
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Provider selection is searchable (39 templates do not fit a flat list)", () => {
  /**
   * pi's own `ctx.ui.select()` cannot be used for this list: it renders every
   * option at once with no search and no scrolling, so the templates at the end
   * of TEMPLATES are only reachable by counting arrow presses. The picker below
   * wraps pi-tui's `SelectList` (which scrolls) and re-filters it with
   * `fuzzyFilter` — the matcher behind pi's /model picker — because
   * `SelectList.setFilter` only matches a *prefix* of the item value.
   */
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };

  function pickerFor(items: PickerItem[]) {
    const picked: Array<string | null> = [];
    const picker = new SearchablePicker({
      title: "Select Provider",
      items,
      theme,
      keybindings: getKeybindings(),
      tui: { requestRender() {} },
      done: (value) => picked.push(value),
    });
    return { picker, picked };
  }

  /**
   * The byte sequence the real keybinding manager accepts for `id`, so the tests
   * do not hard-code escape codes that a keybinding change could invalidate.
   */
  function keyFor(id: Keybinding): string {
    const sequence = [
      "\r",
      "\n",
      "\u001b",
      "\u001b[A",
      "\u001b[B",
      "\u001b[5~",
      "\u001b[6~",
      "\u007f",
      "\b",
    ].find((data) => getKeybindings().matches(data, id));
    assert.ok(sequence, `no key sequence found for ${id}`);
    return sequence;
  }

  const ANSI = /\u001b\[[0-9;]*m/g;
  const lines = (picker: SearchablePicker, width = 80) =>
    picker.render(width).map((line) => line.replace(ANSI, ""));
  /** Rendered provider rows, excluding the "(position/total)" indicator line. */
  const rows = (picker: SearchablePicker) =>
    lines(picker).filter((line) => (line.startsWith("  ") || line.startsWith("→ ")) && !/\(\d+\/\d+\)/.test(line));
  const highlighted = (picker: SearchablePicker) => rows(picker).find((line) => line.startsWith("→ ")) ?? "";

  function typeInto(picker: SearchablePicker, text: string): void {
    for (const char of text) picker.handleInput(char);
  }

  test("only a screenful of the template list is rendered, with a position indicator", () => {
    const { picker } = pickerFor(providerPickerItems());
    assert.equal(rows(picker).length, PICKER_MAX_VISIBLE);
    assert.ok(lines(picker).some((line) => line.includes(`(1/${Object.keys(TEMPLATES).length})`)));
  });

  test("a template near the end of the list is reachable by typing its endpoint", () => {
    // Choosing Zhipu used to mean pressing ↓ eleven times and hoping.
    const { picker, picked } = pickerFor(providerPickerItems());
    typeInto(picker, "open.bigmodel");
    assert.equal(rows(picker).length, 1);
    assert.match(highlighted(picker), /Zhipu/);
    picker.handleInput(keyFor("tui.select.confirm"));
    assert.deepEqual(picked, ["zhipu"], "the pick must be the template key, not its label");
  });

  test("filtering is case-insensitive", () => {
    const { picker } = pickerFor(providerPickerItems());
    typeInto(picker, "GROQ");
    assert.equal(rows(picker).length, 1);
    assert.match(highlighted(picker), /Groq/);
  });

  test("a subsequence query matches (nsr → Nous Research Portal)", () => {
    const { picker } = pickerFor(providerPickerItems());
    typeInto(picker, "nsr");
    assert.match(highlighted(picker), /Nous Research Portal/);
  });

  test("the highlighted row is the one Enter returns", () => {
    const { picker, picked } = pickerFor(providerPickerItems());
    typeInto(picker, "groq");
    picker.handleInput(keyFor("tui.select.confirm"));
    assert.deepEqual(picked, ["groq"]);
  });

  test("arrow keys move the highlight and wrap at both ends", () => {
    const { picker } = pickerFor(providerPickerItems());
    const keys = Object.keys(TEMPLATES);
    const nameOf = (key: string) => TEMPLATES[key].displayName;
    picker.handleInput(keyFor("tui.select.down"));
    assert.ok(highlighted(picker).includes(nameOf(keys[1])));
    picker.handleInput(keyFor("tui.select.up"));
    assert.ok(highlighted(picker).includes(nameOf(keys[0])));
    picker.handleInput(keyFor("tui.select.up"));
    assert.ok(highlighted(picker).includes(nameOf(keys[keys.length - 1])), "↑ from the top wraps to the bottom");
    picker.handleInput(keyFor("tui.select.down"));
    assert.ok(highlighted(picker).includes(nameOf(keys[0])), "↓ from the bottom wraps to the top");
  });

  test("PageDown moves a screenful and the indicator follows", () => {
    const { picker } = pickerFor(providerPickerItems());
    const keys = Object.keys(TEMPLATES);
    picker.handleInput(keyFor("tui.select.pageDown"));
    assert.ok(lines(picker).some((line) => line.includes(`(${PICKER_MAX_VISIBLE + 1}/${keys.length})`)));
    assert.ok(highlighted(picker).includes(TEMPLATES[keys[PICKER_MAX_VISIBLE]].displayName));
  });

  test("clearing the query restores every template", () => {
    const { picker } = pickerFor(providerPickerItems());
    typeInto(picker, "groq");
    assert.equal(rows(picker).length, 1);
    for (let i = 0; i < "groq".length; i++) picker.handleInput(keyFor("tui.editor.deleteCharBackward"));
    assert.equal(rows(picker).length, PICKER_MAX_VISIBLE);
    assert.ok(lines(picker).some((line) => line.includes(`(1/${Object.keys(TEMPLATES).length})`)));
  });

  test("a query that matches nothing says so, and Enter then picks nothing", () => {
    // Synthetic items: no real query is guaranteed to miss every template.
    const { picker, picked } = pickerFor([
      { value: "alpha", label: "Alpha" },
      { value: "beta", label: "Beta" },
    ]);
    typeInto(picker, "zzzz");
    assert.equal(rows(picker).length, 0);
    assert.ok(lines(picker).some((line) => line.includes("No matching providers")));
    picker.handleInput(keyFor("tui.select.confirm"));
    assert.deepEqual(picked, []);
  });

  test("Escape cancels with null, so callers can treat falsy as 'backed out'", () => {
    const { picker, picked } = pickerFor(providerPickerItems());
    picker.handleInput(keyFor("tui.select.cancel"));
    assert.deepEqual(picked, [null]);
  });

  test("rows are truncated to the terminal width instead of wrapping", () => {
    const { picker } = pickerFor(providerPickerItems());
    for (const width of [40, 80]) {
      for (const line of picker.render(width)) {
        assert.ok(visibleWidth(line) <= width, `${width} columns: ${JSON.stringify(line)}`);
      }
    }
  });

  test("focus reaches the search box, so the terminal cursor (IME) lands there", () => {
    const { picker } = pickerFor(providerPickerItems());
    assert.ok(!picker.render(80).some((line) => line.includes(CURSOR_MARKER)));
    picker.focused = true;
    assert.equal(picker.focused, true);
    assert.ok(picker.render(80).some((line) => line.includes(CURSOR_MARKER)));
  });

  test("providerPickerItems covers every template once, keyed by template key", () => {
    const items = providerPickerItems();
    const keys = Object.keys(TEMPLATES);
    assert.equal(items.length, keys.length);
    assert.equal(new Set(items.map((item) => item.value)).size, keys.length);
    for (const item of items) {
      assert.ok(item.value in TEMPLATES, `${item.value} is not a template key`);
      assert.equal(item.label, TEMPLATES[item.value].displayName);
      assert.equal(item.keywords, item.value, "the key must be searchable, not only the label");
    }
  });

  test("registeredProviderItems keeps same-named providers distinguishable", () => {
    // Two providers can share a display name; the internal key is what tells
    // them apart, and it has to survive as the picked value.
    const items = registeredProviderItems({
      groq: { displayName: "Groq" },
      groq_lan: { displayName: "Groq" },
    });
    assert.deepEqual(
      items.map((item) => item.value),
      ["groq", "groq_lan"],
    );
    assert.deepEqual(
      items.map((item) => item.description),
      ["[groq]", "[groq_lan]"],
    );
    const { picker, picked } = pickerFor(items);
    typeInto(picker, "lan");
    assert.equal(rows(picker).length, 1);
    picker.handleInput(keyFor("tui.select.confirm"));
    assert.deepEqual(picked, ["groq_lan"]);
  });

  test("pickFromList drives ctx.ui.custom and resolves with the pick", async () => {
    let customCalls = 0;
    // The factory parameters and return are `any` here on purpose: this mock's
    // only job is to hand the component to the test and resolve when it is done.
    const ctx = {
      ui: {
        custom<T>(
          factory: (
            tui: any,
            theme: any,
            keybindings: any,
            done: (result: T) => void,
          ) => any,
        ): Promise<T> {
          customCalls++;
          return new Promise<T>((resolve) => {
            const component = factory({ requestRender() {} }, theme, getKeybindings(), resolve);
            for (const char of "groq") component.handleInput(char);
            component.handleInput(keyFor("tui.select.confirm"));
          });
        },
      },
    };
    assert.equal(await pickFromList(ctx, "Select Provider", providerPickerItems()), "groq");
    assert.equal(customCalls, 1);
  });
});
