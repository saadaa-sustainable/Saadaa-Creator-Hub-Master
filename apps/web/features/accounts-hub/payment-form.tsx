"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  FileSpreadsheet,
  Hash,
  Layers,
  Link2,
  Loader2,
  Plus,
  Send,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, MissingFieldsAlert } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/formatters";
import { todayIstIso } from "@/lib/payable-cycle";
import { submitPayments } from "./actions";

interface EligiblePost {
  post_id: string;
  post_id_short: string | null;
  collab_id: string | null;
  inf_name: string | null;
  username: string | null;
  profile_pic: string | null;
  commercial_amount: number | null;
  campaign_id: string | null;
  workflow_status: string;
  ads_usage_rights: string | null;
  partnership_id: string | null;
  ad_partnership_valid: boolean | null;
}

interface FormRow {
  key: string;
  postId: string;
  utr: string;
  paymentDate: string;
  amount: string;
}

/**
 * Convert a paste-cell date string to ISO yyyy-MM-dd. Accepts:
 *   - yyyy-MM-dd  (already ISO)
 *   - dd/MM/yyyy or dd-MM-yyyy
 *   - MM/dd/yyyy (best-effort when day > 12)
 *   - Excel serial date (number of days since 1899-12-30)
 * Returns "" if unparseable so the caller can fall back to today.
 */
function normalizePastedDate(raw: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4,6}$/.test(s)) {
    const serial = Number(s);
    if (serial > 30000 && serial < 60000) {
      const utc = Date.UTC(1899, 11, 30) + serial * 86400000;
      const d = new Date(utc);
      return d.toISOString().slice(0, 10);
    }
  }
  const parts = s.split(/[/\-.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    let day: string, mo: string, year: string;
    if (c.length === 4) {
      year = c;
      day = a;
      mo = b;
    } else if (a.length === 4) {
      year = a;
      mo = b;
      day = c;
    } else {
      return "";
    }
    const yNum = Number(year);
    const mNum = Number(mo);
    const dNum = Number(day);
    if (
      Number.isFinite(yNum) &&
      Number.isFinite(mNum) &&
      Number.isFinite(dNum) &&
      mNum >= 1 &&
      mNum <= 12 &&
      dNum >= 1 &&
      dNum <= 31
    ) {
      const mm = String(mNum).padStart(2, "0");
      const dd = String(dNum).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    }
  }
  return "";
}

/** REQ #10b: hard cap on the payment entry batch (UI + schema both enforce). */
const MAX_PAYMENT_ROWS = 10;

// Counter-based row key generator — deterministic across SSR / hydration so
// `htmlFor` attributes don't mismatch on first paint. Module-level state is
// fine here because each row is unique within a single client session.
let __rowKeyCounter = 0;
function newRow(): FormRow {
  __rowKeyCounter += 1;
  return {
    key: `r${__rowKeyCounter}`,
    postId: "",
    utr: "",
    paymentDate: todayIstIso(),
    amount: "",
  };
}

/**
 * Operator-facing short post label. Post IDs are already short under the Collab
 * ID model (SIF-1-P1); this also strips any legacy "-C1" suffix defensively so
 * pre-migration ids still render cleanly.
 */
function shortenPostId(id: string): string {
  return id.replace(/-C\d+$/i, "");
}

/**
 * Inline Accounts Hub payment entry panel — mirrors legacy
 * `payment-entry-table` (Index.html:6627-6676). Always visible at the top of
 * the page. Operator can:
 *   - add N rows (Post ID / UTR / Date / Amount each)
 *   - import from Excel/CSV paste (auto-detect header + Excel serial dates)
 *   - submit all rows in one transaction (3 stage gates + dedup + match)
 */
export function PaymentEntryPanel() {
  const router = useRouter();
  // Render skeleton during SSR + initial paint. Form state is created only
  // after mount, which permanently kills the SSR/hydration mismatch caused
  // by per-row dynamic IDs and a today-date that depends on client locale.
  const [mounted, setMounted] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [rows, setRows] = useState<FormRow[]>([]);
  const [eligible, setEligible] = useState<EligiblePost[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const csvInputRef = useRef<HTMLInputElement>(null);
  // REQ #10a: when on, every row uses the first row's payment date.
  const [sameDateForAll, setSameDateForAll] = useState(false);

  // Seed the first row + flip mounted after hydration. Same code on every
  // render path, no SSR involvement → no mismatch possible.
  useEffect(() => {
    setRows([newRow()]);
    setMounted(true);
  }, []);

  // Load eligible-posts once on mount.
  useEffect(() => {
    if (!mounted) return;
    setLoadingEligible(true);
    fetch("/api/accounts/eligible-posts")
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Unable to load posts");
        return payload.rows as EligiblePost[];
      })
      .then(setEligible)
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoadingEligible(false));
  }, [mounted]);

  const eligibleById = useMemo(() => {
    const map = new Map<string, EligiblePost>();
    for (const p of eligible) map.set(p.post_id, p);
    return map;
  }, [eligible]);

  // Map any id form (collab_id / short post id / post_id) to the representative
  // post_id that submit + the dropdown use. Lets a pasted/uploaded sheet key on
  // Collab ID (the operator-facing id) while the form stays post_id-internal.
  const resolveToPostId = useCallback(
    (raw: string): string => {
      const k = raw.trim().toLowerCase();
      if (!k) return "";
      for (const p of eligible) {
        if (p.post_id.toLowerCase() === k) return p.post_id;
        if ((p.collab_id ?? "").toLowerCase() === k) return p.post_id;
        if ((p.post_id_short ?? "").toLowerCase() === k) return p.post_id;
      }
      return raw.trim(); // unmatched — submit's gate will surface it
    },
    [eligible],
  );

  const addRow = useCallback(() => {
    setRows((cur) =>
      cur.length >= MAX_PAYMENT_ROWS ? cur : [...cur, newRow()],
    );
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((cur) =>
      cur.length <= 1 ? cur : cur.filter((r) => r.key !== key),
    );
  }, []);

  const patchRow = useCallback((key: string, patch: Partial<FormRow>) => {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  // REQ #10a: keep every row on the first row's date while the toggle is on.
  // Guard prevents a re-render loop; watching `rows` re-syncs when row 1 edits.
  useEffect(() => {
    if (!sameDateForAll) return;
    setRows((cur) => {
      if (cur.length === 0) return cur;
      const d = cur[0].paymentDate;
      if (cur.every((r) => r.paymentDate === d)) return cur;
      return cur.map((r) => ({ ...r, paymentDate: d }));
    });
  }, [sameDateForAll, rows]);

  // Shared delimited parser (Excel/CSV). Accepts a header row (Collab ID / Post
  // ID / UTR / Date / Amount) or bare values, tab- or comma-separated. The id
  // cell is resolved to the representative post_id so a Collab-ID sheet works.
  const parseDelimited = useCallback(
    (text: string): FormRow[] => {
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) return [];

      const splitRow = (line: string): string[] =>
        line.includes("\t") ? line.split("\t") : line.split(",");

      const first = splitRow(lines[0]).map((c) => c.trim().toLowerCase());
      const hasHeader = first.some((c) =>
        [
          "collab id",
          "collab_id",
          "post id",
          "post_id",
          "utr",
          "amount",
          "date",
          "payment date",
        ].includes(c),
      );
      const headers = hasHeader ? first : ["collab id", "utr", "date", "amount"];
      const idxOf = (...keys: string[]) =>
        headers.findIndex((h) => keys.includes(h));
      const idIdx = idxOf("collab id", "collab_id", "post id", "post_id", "postid", "id");
      const utrIdx = idxOf("utr", "reference", "ref", "utr / reference no.");
      const dateIdx = idxOf("date", "payment date", "payment_date");
      const amountIdx = idxOf("amount", "amount (₹)", "amount inr", "₹");

      const startAt = hasHeader ? 1 : 0;
      const parsed: FormRow[] = [];
      for (let i = startAt; i < lines.length; i++) {
        const cells = splitRow(lines[i]).map((c) => c.trim());
        const idCell = cells[idIdx >= 0 ? idIdx : 0] ?? "";
        const utr = cells[utrIdx >= 0 ? utrIdx : 1] ?? "";
        const rawDate = cells[dateIdx >= 0 ? dateIdx : 2] ?? "";
        const amount = cells[amountIdx >= 0 ? amountIdx : 3] ?? "";
        if (!idCell && !utr && !amount) continue;
        parsed.push({
          key: Math.random().toString(36).slice(2),
          postId: idCell ? resolveToPostId(idCell) : "",
          utr: utr.trim(),
          paymentDate: normalizePastedDate(rawDate.trim()) || todayIstIso(),
          amount: amount.replace(/[^\d.\-]/g, ""),
        });
      }
      return parsed;
    },
    [resolveToPostId],
  );

  const applyImported = useCallback((parsed: FormRow[]) => {
    const capped = parsed.slice(0, MAX_PAYMENT_ROWS);
    setRows(capped);
    if (parsed.length > MAX_PAYMENT_ROWS) {
      toast.warning(
        `Imported the first ${MAX_PAYMENT_ROWS} of ${parsed.length} rows (max ${MAX_PAYMENT_ROWS} per batch).`,
      );
    } else {
      toast.success(
        `Imported ${capped.length} row${capped.length === 1 ? "" : "s"}.`,
      );
    }
  }, []);

  const importFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = ""; // allow re-uploading the same file
      if (!f) return;
      try {
        let text: string;
        if (/\.(xlsx|xls)$/i.test(f.name)) {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          text = XLSX.utils.sheet_to_csv(ws);
        } else {
          text = await f.text();
        }
        const parsed = parseDelimited(text);
        if (parsed.length === 0) {
          toast.error("No payment rows found in the file.");
          return;
        }
        applyImported(parsed);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not read the file.",
        );
      }
    },
    [parseDelimited, applyImported],
  );

  const downloadTemplate = useCallback(() => {
    const sample = eligible[0];
    const header = "Collab ID,UTR,Date,Amount";
    const exampleRow = sample
      ? `${sample.collab_id ?? sample.post_id_short ?? sample.post_id},UTRREF123,${todayIstIso()},${sample.commercial_amount ?? 10000}`
      : "SIF-1-C1,UTRREF123,2026-06-15,10000";
    const csv = `${header}\n${exampleRow}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "accounts-payment-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, [eligible]);

  const missingPaymentFields = useMemo(() => {
    if (!submitAttempted) return [] as string[];
    const labels = new Set<string>();
    rows.forEach((r) => {
      if (!r.postId.trim()) labels.add("Collab ID");
      if (!r.paymentDate) labels.add("Payment Date");
      const amt = Number(r.amount);
      if (!r.amount || Number.isNaN(amt) || amt <= 0)
        labels.add("Amount");
    });
    return Array.from(labels);
  }, [submitAttempted, rows]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitAttempted(true);
    const payload = rows.map((r) => ({
      postId: r.postId.trim(),
      utr: r.utr.trim(),
      paymentDate: r.paymentDate,
      amount: Number(r.amount),
    }));
    const invalid = payload.find(
      (r) =>
        !r.postId ||
        !r.paymentDate ||
        Number.isNaN(r.amount) ||
        r.amount <= 0,
    );
    if (invalid) {
      toast.error("Each row needs a collab, payment date and positive amount.");
      return;
    }
    startSubmit(async () => {
      const res = await submitPayments({ rows: payload });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      // Build a multi-line reason string per blocked post so the operator can
      // see exactly which sibling deliverables need work — not just a category
      // count. Covers both the inline single-row form AND Excel-paste imports
      // (every row in the batch is gated through the same per-row checks).
      const stageBlocked = new Set(res.blockedByStage);
      const reelBlocked = new Set(res.blockedByReelRule);
      const adBlocked = new Set(res.blockedByAdPartnership);
      const dupBlocked = new Set(res.duplicates);
      const detailByPost = new Map(
        res.blockedDetails.map((d) => [d.postId, d]),
      );

      const renderReason = (pid: string): string => {
        const reasons: string[] = [];
        if (stageBlocked.has(pid))
          reasons.push("post is not in Posted stage yet");
        const d = detailByPost.get(pid);
        if (reelBlocked.has(pid) && d && d.unpostedSiblings.length > 0) {
          reasons.push(
            `siblings not posted yet: ${d.unpostedSiblings.join(", ")}`,
          );
        }
        if (adBlocked.has(pid)) {
          if (d && d.partnershipMissingSiblings.length > 0) {
            reasons.push(
              `partnership key missing on: ${d.partnershipMissingSiblings.join(
                ", ",
              )}`,
            );
          } else {
            reasons.push(
              "partnership key missing (required when Ads Usage Rights = Yes)",
            );
          }
        }
        if (dupBlocked.has(pid))
          reasons.push("collab already fully paid or duplicate UTR");
        return reasons.length > 0 ? reasons.join(" · ") : "blocked";
      };

      // Preserve submit order so the toast lists rows top-to-bottom as entered.
      const blockedOrdered = payload
        .map((r) => r.postId)
        .filter(
          (id) =>
            stageBlocked.has(id) ||
            reelBlocked.has(id) ||
            adBlocked.has(id) ||
            dupBlocked.has(id),
        );

      const allBlocked = res.saved === 0 && blockedOrdered.length > 0;
      const someBlocked = res.saved > 0 && blockedOrdered.length > 0;

      if (allBlocked) {
        const lines = blockedOrdered.map(
          (pid) => `${shortenPostId(pid)} — ${renderReason(pid)}`,
        );
        toast.error(
          lines.length === 1
            ? `Payment blocked. ${lines[0]}`
            : `${lines.length} payments blocked`,
          {
            description:
              lines.length === 1 ? undefined : lines.join("\n"),
            duration: 10000,
          },
        );
      } else if (someBlocked) {
        const lines = blockedOrdered.map(
          (pid) => `${shortenPostId(pid)} — ${renderReason(pid)}`,
        );
        toast.warning(
          `${res.saved} saved (${res.paid} paid · ${res.partial} partial · ${res.due} due), ${blockedOrdered.length} blocked`,
          { description: lines.join("\n"), duration: 10000 },
        );
      } else if (res.partial > 0) {
        toast.success(
          `${res.saved} saved (${res.paid} paid · ${res.partial} partial · ${res.due} due)`,
          {
            description:
              "Partial payments recorded — the remaining balance stays outstanding until the collab total is paid.",
            duration: 8000,
          },
        );
      } else {
        toast.success(
          `${res.saved} saved (${res.paid} paid · ${res.due} due)`,
        );
      }

      setRows([newRow()]);
      router.refresh();
    });
  };

  if (!mounted) {
    return (
      <section
        className="acc-entry-panel acc-entry-panel--open"
        suppressHydrationWarning
      >
        <header className="acc-entry-panel__head">
          <div className="acc-entry-panel__title-wrap">
            <span className="acc-entry-panel__title">
              <Banknote size={15} aria-hidden />
              Log Payments
            </span>
            <span className="acc-entry-panel__sub">
              One row per payment · UTR required
            </span>
          </div>
        </header>
        <div className="acc-entry-panel__body">
          <div className="acc-entry-skeleton" aria-hidden />
        </div>
      </section>
    );
  }

  return (
    <section className="acc-entry-panel acc-entry-panel--open">
      <header className="acc-entry-panel__head">
        <div className="acc-entry-panel__title-wrap">
          <span className="acc-entry-panel__title">
            <Banknote size={15} aria-hidden />
            Log Payments
          </span>
          <span className="acc-entry-panel__sub">
            One row per payment · UTR required
          </span>
        </div>
        <span className="acc-entry-panel__count tabular">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </header>

      <form onSubmit={onSubmit} className="acc-entry-panel__body">
        <label className="acc-entry-samedate">
          <input
            type="checkbox"
            checked={sameDateForAll}
            onChange={(e) => setSameDateForAll(e.target.checked)}
          />
          Same payment date for all entries
          <span className="acc-entry-samedate__hint">
            (copies the first row&rsquo;s date)
          </span>
        </label>
        <div className="acc-entry-rows">
          {rows.map((row, idx) => {
            const linked = eligibleById.get(row.postId);
            const postFieldId = `pay_post_${row.key}`;
            const utrFieldId = `pay_utr_${row.key}`;
            const dateFieldId = `pay_date_${row.key}`;
            const amountFieldId = `pay_amount_${row.key}`;
            return (
              <div key={row.key} className="acc-entry-row">
                <div className="acc-entry-row__index" aria-hidden>
                  {linked ? (
                    <Avatar
                      src={linked.profile_pic}
                      username={linked.username}
                      name={linked.inf_name}
                      size={36}
                      className="acc-entry-row__avatar"
                    />
                  ) : (
                    <span className="acc-entry-row__idx-num">#{idx + 1}</span>
                  )}
                </div>

                <div className="acc-entry-row__fields">
                  <div className="acc-field acc-field--post">
                    <label
                      htmlFor={postFieldId}
                      className="acc-field__label"
                    >
                      <Layers size={11} aria-hidden /> Collab ID
                      <span className="req">*</span>
                    </label>
                    <div className="flex items-center gap-2 min-w-0">
                      <select
                        id={postFieldId}
                        className="acc-field__input acc-field__input--select min-w-0"
                        value={row.postId}
                        onChange={(e) =>
                          patchRow(row.key, {
                            postId: e.target.value,
                            amount:
                              eligibleById.get(e.target.value)
                                ?.commercial_amount?.toString() ?? row.amount,
                          })
                        }
                      >
                        <option value="">
                          {loadingEligible ? "Loading collabs…" : "Pick a collab"}
                        </option>
                        {eligible.map((p) => (
                          <option key={p.post_id} value={p.post_id}>
                            {p.collab_id ?? p.post_id_short ?? p.post_id} ·{" "}
                            {p.inf_name ?? p.username ?? "—"}
                          </option>
                        ))}
                      </select>
                      {linked && (
                        <span
                          className="inline-flex items-center gap-1 whitespace-nowrap text-[0.72rem] font-semibold text-text-secondary"
                          title="Creator for this collab"
                        >
                          <User size={11} aria-hidden className="text-text-tertiary" />
                          {linked.inf_name ?? linked.username ?? "—"}
                          {linked.username && (
                            <span className="text-text-tertiary font-normal">
                              @{linked.username}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="acc-field">
                    <label htmlFor={utrFieldId} className="acc-field__label">
                      <Hash size={11} aria-hidden /> UTR / Reference
                      <span className="req">*</span>
                    </label>
                    <input
                      id={utrFieldId}
                      type="text"
                      className="acc-field__input"
                      placeholder="Bank reference"
                      value={row.utr}
                      onChange={(e) =>
                        patchRow(row.key, { utr: e.target.value })
                      }
                    />
                  </div>

                  <div className="acc-field">
                    <label htmlFor={dateFieldId} className="acc-field__label">
                      <CalendarCheck size={11} aria-hidden /> Payment Date
                      <span className="req">*</span>
                    </label>
                    <input
                      id={dateFieldId}
                      type="date"
                      className="acc-field__input"
                      value={row.paymentDate}
                      disabled={sameDateForAll && idx > 0}
                      title={
                        sameDateForAll && idx > 0
                          ? "Using the first row's date (same-date toggle is on)"
                          : undefined
                      }
                      onChange={(e) =>
                        patchRow(row.key, { paymentDate: e.target.value })
                      }
                    />
                  </div>

                  <div className="acc-field">
                    <label
                      htmlFor={amountFieldId}
                      className="acc-field__label"
                    >
                      <Link2 size={11} aria-hidden /> Amount ₹
                      <span className="req">*</span>
                    </label>
                    <input
                      id={amountFieldId}
                      type="number"
                      min={0}
                      step="0.01"
                      className="acc-field__input tabular"
                      placeholder="0"
                      value={row.amount}
                      onChange={(e) =>
                        patchRow(row.key, { amount: e.target.value })
                      }
                    />
                  </div>
                </div>

                {rows.length > 1 && (
                  <button
                    type="button"
                    className="acc-entry-row__remove"
                    onClick={() => removeRow(row.key)}
                    aria-label="Remove row"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                )}

                {linked && row.amount && (
                  <div className="acc-entry-row__badge">
                    <MatchBadge
                      entered={Number(row.amount)}
                      commercial={Number(linked.commercial_amount ?? 0)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

          <div className="acc-entry-toolbar">
            <button
              type="button"
              className="acc-entry-add"
              onClick={addRow}
              disabled={submitting || rows.length >= MAX_PAYMENT_ROWS}
            >
              <Plus size={13} aria-hidden />
              {rows.length >= MAX_PAYMENT_ROWS
                ? `Max ${MAX_PAYMENT_ROWS} rows`
                : "Add another row"}
            </button>
            <button
              type="button"
              className="acc-entry-add"
              onClick={downloadTemplate}
              disabled={submitting}
            >
              <FileSpreadsheet size={13} aria-hidden />
              Download CSV template
            </button>
            <button
              type="button"
              className="acc-entry-add"
              onClick={() => csvInputRef.current?.click()}
              disabled={submitting}
            >
              <Upload size={13} aria-hidden />
              Upload CSV
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              onChange={importFile}
            />
            <div className="acc-entry-toolbar__spacer" />
            <MissingFieldsAlert fields={missingPaymentFields} className="w-full" />
            <button
              type="submit"
              className={cn("btn-primary-cta", submitting && "is-loading")}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="hidden sm:inline">Saving…</span>
                </>
              ) : (
                <>
                  <Send size={14} aria-hidden />
                  <span className="hidden sm:inline">Submit </span>
                  {rows.length > 1 ? `${rows.length} Rows` : "Payment"}
                </>
              )}
            </button>
          </div>
      </form>
    </section>
  );
}

function MatchBadge({
  entered,
  commercial,
}: {
  entered: number;
  commercial: number;
}) {
  if (!entered || !commercial) return null;
  const diff = entered - commercial;
  if (diff === 0) {
    return (
      <div className="acc-entry-match acc-entry-match--ok">
        <CheckCircle2 size={11} aria-hidden />
        Matched · {formatRupees(commercial)}
      </div>
    );
  }
  // Amount LESS than the agreed total is a valid PARTIAL installment, not an
  // error. Surface the remaining balance instead of an "Off by" warning.
  if (entered < commercial) {
    return (
      <div className="acc-entry-match acc-entry-match--partial">
        <CircleDollarSign size={11} aria-hidden />
        Partial · {formatRupees(commercial - entered)} will stay due of{" "}
        {formatRupees(commercial)}
      </div>
    );
  }
  // Amount GREATER than the agreed total — still a genuine mismatch to flag.
  return (
    <div className="acc-entry-match acc-entry-match--off">
      <AlertTriangle size={11} aria-hidden />
      Over by {formatRupees(diff)} · Agreed {formatRupees(commercial)}
    </div>
  );
}
