import { describe, expect, it } from "vitest";
import { clickAction, linkLabel, linkTooltip } from "../restorer/link.ts";
import {
  answerPref,
  getAinbCaseOriginTracking,
  loadPrefs,
  normalizeTrackingPage,
  SUMMARY_KEY,
  TRACKING_KEY,
  type PrefStore,
} from "../restorer/prefs.ts";
import { restoreSummary, trackingSummary } from "../restorer/summary.ts";

function memoryStore(
  initial: Record<string, string> = {},
): PrefStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const brokenStore: PrefStore = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("quota");
  },
  removeItem() {
    throw new Error("blocked");
  },
};

const click = {
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
};

describe("restorer edit summaries", () => {
  it("links the restored revision and its author", () => {
    expect(restoreSummary(123, "Example user", "")).toBe(
      "[[User:MSK/restorer|restorer]]: restored revision [[Special:PermanentLink/123|123]] by [[Special:Contributions/Example user|Example user]]",
    );
  });

  it("appends the additional summary after a full stop", () => {
    expect(restoreSummary(123, "Ann", "  see [[WP:AINB]]  ")).toBe(
      "[[User:MSK/restorer|restorer]]: restored revision [[Special:PermanentLink/123|123]] by [[Special:Contributions/Ann|Ann]]. see [[WP:AINB]]",
    );
    expect(restoreSummary(123, "Ann", "   ")).toBe(
      "[[User:MSK/restorer|restorer]]: restored revision [[Special:PermanentLink/123|123]] by [[Special:Contributions/Ann|Ann]]",
    );
  });

  it("never names a hidden user", () => {
    expect(restoreSummary(7, null, "x")).toBe(
      "[[User:MSK/restorer|restorer]]: restored revision [[Special:PermanentLink/7|7]]. x",
    );
  });

  it("describes the tracking page edit", () => {
    expect(trackingSummary("Example article")).toBe(
      "[[User:MSK/restorer|restorer]]: marked [[Example article]] completed",
    );
  });
});

describe("restore link", () => {
  it("marks a tracking page with ~ and an extra summary with +", () => {
    expect(linkLabel({ summary: "", tracking: "" })).toBe("restore");
    expect(linkLabel({ summary: "s", tracking: "" })).toBe("restore+");
    expect(linkLabel({ summary: "", tracking: "t" })).toBe("restore~");
    expect(linkLabel({ summary: "s", tracking: "t" })).toBe("restore~+");
  });

  it("puts the summary and tracking page on separate tooltip lines", () => {
    expect(linkTooltip({ summary: "per AINB", tracking: "WP:AIC/Foo" })).toBe(
      "per AINB\nWP:AIC/Foo",
    );
    expect(
      linkTooltip({
        summary: "per AINB",
        tracking: "WP:AIC/Foo",
        autoTracking: true,
      }),
    ).toBe("per AINB\nWP:AIC/Foo (automatically detected)");
    expect(linkTooltip({ summary: "per AINB", tracking: "" })).toBe(
      "per AINB",
    );
    expect(linkTooltip({ summary: "", tracking: "WP:AIC/Foo" })).toBe(
      "WP:AIC/Foo",
    );
    expect(
      linkTooltip({ summary: "", tracking: "WP:AIC/Foo", autoTracking: true }),
    ).toBe("WP:AIC/Foo (automatically detected)");
    expect(linkTooltip({ summary: "", tracking: "" })).toBe("");
  });

  it("maps modifier keys to actions, ctrl then shift then alt", () => {
    expect(clickAction(click)).toBe("restore");
    expect(clickAction({ ...click, ctrlKey: true })).toBe("edit-summary");
    expect(clickAction({ ...click, metaKey: true })).toBe("edit-summary");
    expect(clickAction({ ...click, shiftKey: true })).toBe("edit-tracking");
    expect(clickAction({ ...click, altKey: true })).toBe("restore-untracked");
    expect(clickAction({ ...click, ctrlKey: true, shiftKey: true })).toBe(
      "edit-summary",
    );
    expect(clickAction({ ...click, shiftKey: true, altKey: true })).toBe(
      "edit-tracking",
    );
  });
});

describe("restorer prefs", () => {
  it("keeps a setting when the prompt is cancelled", () => {
    const store = memoryStore({ [SUMMARY_KEY]: "per AINB" });
    expect(answerPref(store, SUMMARY_KEY, null)).toBe(true);
    expect(loadPrefs(store).summary).toBe("per AINB");
  });

  it("clears a setting on a blank answer", () => {
    const store = memoryStore({
      [SUMMARY_KEY]: "per AINB",
      [TRACKING_KEY]: "WP:AIC/Foo",
    });
    expect(answerPref(store, SUMMARY_KEY, "   ")).toBe(true);
    expect(answerPref(store, TRACKING_KEY, "")).toBe(true);
    expect(store.data.size).toBe(0);
    expect(loadPrefs(store)).toEqual({ summary: "", tracking: "" });
  });

  it("trims summaries and normalizes tracking pages", () => {
    const store = memoryStore();
    answerPref(store, SUMMARY_KEY, "  per [[WP:AINB]] ");
    answerPref(
      store,
      TRACKING_KEY,
      " https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup/Foo ",
    );
    expect(loadPrefs(store)).toEqual({
      summary: "per [[WP:AINB]]",
      tracking: "Wikipedia:WikiProject AI Cleanup/Foo",
    });
  });

  it("reports storage that cannot be written", () => {
    expect(answerPref(null, SUMMARY_KEY, "x")).toBe(false);
    expect(answerPref(brokenStore, SUMMARY_KEY, "x")).toBe(false);
    expect(loadPrefs(null)).toEqual({ summary: "", tracking: "" });
    expect(loadPrefs(brokenStore)).toEqual({ summary: "", tracking: "" });
  });

  it("finds the unique case containing the current article even with multiple cases in storage", () => {
    const store = memoryStore();
    const oldLs = globalThis.localStorage;
    const mockStorage = new Map<string, string>();
    mockStorage.set(
      "ainb-case-origin",
      JSON.stringify({
        "Wikipedia:AI noticeboard/LumenArchivorum": {
          articles: ["Health in Yemen", "Switzerland"],
          ts: 1794081245056,
        },
        "Wikipedia:AI noticeboard/Metalicat": {
          articles: ["Bombardier Billy Wells"],
          ts: 1794090968447,
        },
        "Wikipedia:AI noticeboard/Wikideas1": {
          articles: ["Open WebUI", "LM Studio", "LiteLLM"],
          ts: 1794092348756,
        },
      }),
    );
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage.get(k) ?? null,
      setItem: (k: string, v: string) => mockStorage.set(k, v),
      removeItem: (k: string) => mockStorage.delete(k),
    };

    try {
      // Matches LumenArchivorum (even with underscores)
      expect(getAinbCaseOriginTracking("Health_in_Yemen")).toBe(
        "Wikipedia:AI noticeboard/LumenArchivorum",
      );
      expect(getAinbCaseOriginTracking("Switzerland")).toBe(
        "Wikipedia:AI noticeboard/LumenArchivorum",
      );

      // Matches Metalicat
      expect(getAinbCaseOriginTracking("Bombardier Billy Wells")).toBe(
        "Wikipedia:AI noticeboard/Metalicat",
      );

      // Article not in any case
      expect(getAinbCaseOriginTracking("France")).toBeNull();

      // Dynamic loadPrefs on matching article
      const prefs = loadPrefs(store, "Health in Yemen");
      expect(prefs.tracking).toBe(
        "Wikipedia:AI noticeboard/LumenArchivorum",
      );
      expect(store.getItem(TRACKING_KEY)).toBeNull();

      // Dynamic loadPrefs on non-matching article is blank
      const otherPrefs = loadPrefs(store, "France");
      expect(otherPrefs.tracking).toBe("");
    } finally {
      (globalThis as any).localStorage = oldLs;
    }
  });

  it("returns null if multiple cases match the same article or articles is missing", () => {
    const oldLs = globalThis.localStorage;
    const mockStorage = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage.get(k) ?? null,
    };

    try {
      mockStorage.set("ainb-case-origin", JSON.stringify({}));
      expect(getAinbCaseOriginTracking("Switzerland")).toBeNull();

      // Ambiguous: two cases list Switzerland
      mockStorage.set(
        "ainb-case-origin",
        JSON.stringify({
          "Case 1": { articles: ["Switzerland"] },
          "Case 2": { articles: ["Switzerland"] },
        }),
      );
      expect(getAinbCaseOriginTracking("Switzerland")).toBeNull();

      mockStorage.set(
        "ainb-case-origin",
        JSON.stringify({
          "Wikipedia:AI noticeboard/Foo": { articles: "not an array" },
        }),
      );
      expect(getAinbCaseOriginTracking("Switzerland")).toBeNull();

      mockStorage.set("ainb-case-origin", "not valid json");
      expect(getAinbCaseOriginTracking("Switzerland")).toBeNull();
    } finally {
      (globalThis as any).localStorage = oldLs;
    }
  });
});

describe("tracking page input", () => {
  it("accepts titles, links, and wiki URLs", () => {
    expect(normalizeTrackingPage(" Wikipedia:WikiProject_AI_Cleanup/Foo ")).toBe(
      "Wikipedia:WikiProject AI Cleanup/Foo",
    );
    expect(normalizeTrackingPage("[[Wikipedia:AIC/Foo|the list]]")).toBe(
      "Wikipedia:AIC/Foo",
    );
    expect(normalizeTrackingPage("[[:Wikipedia:AIC/Foo#Articles]]")).toBe(
      "Wikipedia:AIC/Foo",
    );
    expect(
      normalizeTrackingPage(
        "https://en.wikipedia.org/wiki/Wikipedia:AIC/Bob%27s_list#Rows",
      ),
    ).toBe("Wikipedia:AIC/Bob's list");
    expect(
      normalizeTrackingPage(
        "https://en.wikipedia.org/w/index.php?title=Wikipedia:AIC/Foo&action=edit",
      ),
    ).toBe("Wikipedia:AIC/Foo");
    expect(normalizeTrackingPage("//en.wikipedia.org/wiki/Wikipedia:AIC/Foo")).toBe(
      "Wikipedia:AIC/Foo",
    );
    expect(normalizeTrackingPage("   ")).toBe("");
  });
});
