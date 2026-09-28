import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import en from "./en.json";
import fr from "./fr.json";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

describe("translations", () => {
  const frKeys = flatten(fr as Tree);
  const enKeys = flatten(en as Tree);

  it("have the same keys in French and English", () => {
    expect([...frKeys.keys()].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys.keys()].filter((k) => !frKeys.has(k))).toEqual([]);
  });

  it("are valid ICU messages", () => {
    for (const [lang, keys] of [["fr", frKeys], ["en", enKeys]] as const) {
      for (const [key, message] of keys) {
        expect(() => new IntlMessageFormat(message, lang), `${lang}:${key}`).not.toThrow();
      }
    }
  });

  it("use the same placeholders in both languages", () => {
    type El = { type: number; value?: string; options?: Record<string, { value: El[] }> };
    const collect = (els: El[], out: Set<string>) => {
      for (const el of els) {
        if (el.value && el.type !== 0) out.add(el.value); // 0 = literal text
        for (const opt of Object.values(el.options ?? {})) collect(opt.value, out);
      }
      return out;
    };
    const vars = (m: string, lang: string) => [...collect(new IntlMessageFormat(m, lang).getAst() as El[], new Set())].sort().join(",");
    for (const [key, message] of frKeys) expect(vars(enKeys.get(key) ?? "", "en"), key).toBe(vars(message, "fr"));
  });
});
