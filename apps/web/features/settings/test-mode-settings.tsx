"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, AlertTriangle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { setTestMode, previewTestEntries } from "./actions";
import {
  TEST_SCOPES,
  TEST_SCOPE_LABELS,
  TEST_SCOPE_DESCRIPTIONS,
  type TestEntriesPreview,
} from "./test-scopes";

// Scope key/label pairs from the single source of truth in test-scopes.ts.
const SCOPES = TEST_SCOPES.map((key) => ({
  key,
  label: TEST_SCOPE_LABELS[key],
  desc: TEST_SCOPE_DESCRIPTIONS[key],
}));
const ALL_KEYS: string[] = SCOPES.map((s) => s.key);
const labelFor = (key: string) =>
  TEST_SCOPE_LABELS[key as keyof typeof TEST_SCOPE_LABELS] ?? key;

interface TestModeSettingsProps {
  // Current active scopes, read server-side via getTestModeScopes() and passed in.
  activeScopes: string[];
}

/**
 * Admin-only Test Mode control, rendered as a section on the Settings page.
 *
 * - "Select all" master checkbox + a checkbox per scope (Campaigns / Creators /
 *   Collabs / Payments).
 * - Saving = setTestMode(selectedScopes). Turning any scope OFF is DESTRUCTIVE
 *   (archives then deletes that scope's is_test rows) → an itemised preview-then-
 *   confirm popup is shown before the destructive call.
 *
 * Admin-only at the server too (setTestMode / previewTestEntries →
 * assertPermission('system_config')). The Settings page only renders this for admins.
 */
export function TestModeSettings({ activeScopes }: TestModeSettingsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const active = useMemo(
    () => ALL_KEYS.filter((k) => activeScopes.includes(k)),
    [activeScopes],
  );

  // Draft selection + confirm flags.
  const [selected, setSelected] = useState<string[]>(active);
  const [confirming, setConfirming] = useState(false);
  // Itemised delete-confirmation popup: the loaded preview + a separate loading flag.
  const [preview, setPreview] = useState<TestEntriesPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Scopes being turned OFF by the current draft = destructive.
  const turningOff = useMemo(
    () => active.filter((k) => !selected.includes(k)),
    [active, selected],
  );
  const dirty = useMemo(() => {
    if (selected.length !== active.length) return true;
    return selected.some((k) => !active.includes(k));
  }, [selected, active]);

  const allSelected = selected.length === ALL_KEYS.length;

  const cancelConfirm = () => {
    setConfirming(false);
    setPreview(null);
  };

  const toggleScope = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.length === ALL_KEYS.length ? [] : [...ALL_KEYS],
    );
  };

  const save = () => {
    startTransition(async () => {
      const res = await setTestMode(selected);
      if (!res.success) {
        toast.error(res.error ?? "Failed to update Test Mode");
        return;
      }
      const total = res.deletedTotal ?? 0;
      if (turningOff.length > 0 && total > 0) {
        toast.success(
          `Test Mode updated — deleted ${total} test ${total === 1 ? "entry" : "entries"}.`,
        );
      } else if ((res.scopes?.length ?? 0) > 0) {
        toast.success(
          "Test Mode updated — selected views now create test entries.",
        );
      } else {
        toast.success("Test Mode is now off everywhere.");
      }
      setConfirming(false);
      setPreview(null);
      router.refresh();
    });
  };

  const onSave = () => {
    if (pending || loadingPreview || !dirty) return;
    if (turningOff.length > 0) {
      // Destructive: load the itemised preview FIRST, then open the confirm popup.
      setLoadingPreview(true);
      (async () => {
        try {
          const p = await previewTestEntries(selected);
          setPreview(p);
          setConfirming(true);
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Failed to load test entries",
          );
        } finally {
          setLoadingPreview(false);
        }
      })();
    } else {
      save();
    }
  };

  return (
    <section className="rounded-[14px] border border-[#E7E2D2] bg-white p-4 sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E7E2D2] bg-[#F5F1EC] text-[#6E695E]">
          <FlaskConical size={15} aria-hidden />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-[#161513]">
            Test Mode
          </h2>
          <p className="text-[12px] text-[#9A9384]">
            Turn on per entity to create throwaway test rows that never pollute
            real data.
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-[10px] border border-[#E7E2D2] bg-white px-3 py-3">
        <p className="mb-2.5 text-[12px] font-semibold text-[#161513]">
          Test Mode by entity
        </p>

        {/* Select all master. */}
        <label className="mb-1.5 flex cursor-pointer select-none items-center gap-2 border-b border-[#F1ECDE] py-1.5">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={pending}
            className="h-4 w-4 rounded border-[#C9C2AE] accent-[#F0C61E]"
          />
          <span className="text-[12px] font-semibold text-[#161513]">
            Select all
          </span>
        </label>

        {/* Per-scope checkboxes. */}
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {SCOPES.map((s) => (
            <label
              key={s.key}
              className="flex cursor-pointer select-none items-start gap-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={selected.includes(s.key)}
                onChange={() => toggleScope(s.key)}
                disabled={pending}
                className="mt-0.5 h-4 w-4 rounded border-[#C9C2AE] accent-[#F0C61E]"
              />
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-[#2C2420]">
                  {s.label}
                </span>
                <span className="block text-[11px] leading-snug text-[#9A9384]">
                  {s.desc}
                </span>
              </span>
            </label>
          ))}
        </div>

        {/* Inline warning when scopes are being turned off (popup lists items). */}
        {turningOff.length > 0 && (
          <div className="mt-3 rounded-[10px] border border-[#C0392B]/40 bg-[#FDECEA] px-3 py-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={15}
                className="mt-0.5 shrink-0 text-[#C0392B]"
              />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-tight text-[#C0392B]">
                  This deletes all test rows for:{" "}
                  {turningOff.map(labelFor).join(", ")}.
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#9A9384]">
                  Every test row in{" "}
                  {turningOff.length === 1 ? "that entity" : "those entities"}{" "}
                  will be archived then permanently removed. This cannot be
                  undone from the UI. You will see the exact rows before
                  confirming.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={pending || loadingPreview || !dirty}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#F0C61E] px-3 py-1.5 text-[12px] font-semibold text-[#161513] transition-colors hover:bg-[#DDB517] disabled:opacity-50"
          >
            {(pending || loadingPreview) && (
              <Loader2 size={13} className="animate-spin" />
            )}
            {turningOff.length > 0 ? "Delete test rows & save" : "Save"}
          </button>
        </div>
      </div>

      {/* Itemised delete-confirmation popup — lists every test row to be removed. */}
      {confirming && preview && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) cancelConfirm();
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            {/* Header. */}
            <div className="flex items-start justify-between gap-3 border-b border-[#F1ECDE] px-5 py-4">
              <div className="flex min-w-0 items-start gap-2.5">
                <AlertTriangle
                  size={18}
                  className="mt-0.5 shrink-0 text-[#C0392B]"
                />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-tight text-[#161513]">
                    {preview.total === 0
                      ? "No test rows to delete"
                      : `Delete ${preview.total} test ${preview.total === 1 ? "row" : "rows"}?`}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-[#6E695E]">
                    {preview.total === 0
                      ? `Turning off ${turningOff.map(labelFor).join(", ")} won’t remove anything — there are no test rows in ${turningOff.length === 1 ? "that entity" : "those entities"}.`
                      : "These will be archived then permanently removed. This cannot be undone from the UI."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelConfirm}
                disabled={pending}
                className="text-[#9A9384] transition-colors hover:text-[#161513] disabled:opacity-50"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Grouped, scrollable list of entries. */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {preview.groups.length === 0 ? (
                <p className="py-2 text-[12px] text-[#9A9384]">
                  Nothing to delete.
                </p>
              ) : (
                <div className="space-y-4">
                  {preview.groups.map((group) => (
                    <div key={group.scope}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-[12px] font-semibold text-[#161513]">
                          {group.label}
                        </p>
                        <span className="text-[11px] font-medium text-[#9A9384]">
                          {group.count} {group.count === 1 ? "row" : "rows"}
                        </span>
                      </div>
                      {group.items.length === 0 ? (
                        <p className="pl-1 text-[11px] text-[#9A9384]">
                          No test rows.
                        </p>
                      ) : (
                        <ul className="divide-y divide-[#F1ECDE] overflow-hidden rounded-[10px] border border-[#F1ECDE]">
                          {group.items.map((item) => (
                            <li
                              key={item.id}
                              className="break-words px-3 py-1.5 text-[12px] leading-snug text-[#2C2420]"
                            >
                              {item.label}
                            </li>
                          ))}
                          {group.count > group.items.length && (
                            <li className="px-3 py-1.5 text-[11px] font-medium text-[#9A9384]">
                              +{group.count - group.items.length} more
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer actions. */}
            <div className="flex items-center justify-end gap-2 border-t border-[#F1ECDE] px-5 py-4">
              <button
                type="button"
                onClick={cancelConfirm}
                disabled={pending}
                className="rounded-[8px] border border-[#E7E2D2] bg-white px-4 py-2 text-[13px] font-semibold text-[#6B5F58] transition-colors hover:bg-[#FDFBF7] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#C0392B] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#A93226] disabled:opacity-50"
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                Confirm &amp; delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
