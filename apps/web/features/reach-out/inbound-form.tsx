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
import { toast } from "sonner";
import {
  Megaphone,
  Table as TableIcon,
  Plus,
  Download,
  Upload,
  CloudUpload,
  X,
  Info,
  Inbox,
  Sparkles,
  AlertCircle,
  Loader2,
  ExternalLink,
  Eye,
  Users,
  Zap,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { isInstagramProfileUrl } from "@/lib/validators";
import { formatFollowers, proxyAvatarUrl } from "@/lib/formatters";
import { MissingFieldsAlert } from "@/components/ui/missing-fields-alert";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { GENDERS, type Gender } from "./schema";
import { CONTENT_CODES } from "./content-codes";
import {
  lookupCreator,
  lookupCreatorsFromDataset,
  lookupCreatorsBatch,
  type CreatorLookupHit,
} from "./actions";
import {
  INBOUND_MANUAL_CAP,
  inboundUsernameFromUrl,
  makeInboundRow,
  type InboundRowInput,
} from "./inbound-schema";
import { submitInboundBatch } from "./inbound-actions";

interface InboundFormProps {
  campaigns: {
    campaign_id: string;
    campaign_name: string | null;
    status: string | null;
    brief_link: string | null;
    internal_brief_link?: string | null;
    creator_cap?: number;
    creators_used?: number;
  }[];
}

const igUrlRe = /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+/i;

type RowLookupStatus = "idle" | "loading" | "found" | "error";

type RowLookup = {
  username: string;
  source: CreatorLookupHit["source"] | "unknown";
  status: RowLookupStatus;
  name: string | null;
  followers: number | null;
  gender: Gender | null;
  category: string | null;
  profilePic: string | null;
  verification: CreatorLookupHit["verification"] | null;
  profileId?: string | null;
  error?: string;
};

type RowState = InboundRowInput & { id: string; lookup?: RowLookup };
type RowValidationErrors = Partial<
  Record<
    "instagramLink" | "gender" | "contentCode" | "collabType" | "commercials",
    string
  >
>;

function newRow(prefill: Partial<InboundRowInput> = {}): RowState {
  return {
    ...makeInboundRow(prefill),
    id: `rin-${Math.random().toString(36).slice(2, 9)}`,
  };
}

function isRowValid(r: RowState): boolean {
  if (!r.instagramLink.trim() || !igUrlRe.test(r.instagramLink)) return false;
  if (!r.gender) return false;
  if (!r.contentCode.trim()) return false;
  return true;
}

function rowHasEntry(r: RowState): boolean {
  return Boolean(r.instagramLink.trim() || r.contentCode.trim());
}

function getRowValidationErrors(r: RowState): RowValidationErrors {
  const errors: RowValidationErrors = {};
  const link = r.instagramLink.trim();

  if (!link) {
    errors.instagramLink = "Profile URL is required.";
  } else if (!igUrlRe.test(link)) {
    errors.instagramLink = "Enter a valid Instagram profile URL.";
  }

  if (!r.gender) {
    errors.gender = "Gender is required.";
  }

  if (!r.contentCode.trim()) {
    errors.contentCode = "Content Type is required.";
  }

  return errors;
}

function hasRowErrors(errors: RowValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

function normalizeGender(value: string | null | undefined): Gender | null {
  if (!value) return null;
  const match = GENDERS.find((g) => g.toLowerCase() === value.toLowerCase());
  return match ?? null;
}

function lookupStatusText(lookup?: RowLookup): string {
  if (!lookup) return "Waiting";
  if (lookup.status === "loading") return "Checking";
  if (lookup.status === "found") {
    switch (lookup.source) {
      case "creator":
        return "Creator Data";
      case "meta":
        return "Live";
      case "historic":
        return "Last known";
      default:
        return "Fetched";
    }
  }
  if (lookup.status === "error") {
    return lookup.source === "deactivated" ? "Not fetchable" : "Fetch failed";
  }
  return "Waiting";
}

function rosterValue(row: Record<string, string>, ...keys: string[]): string {
  const aliases = new Map(
    Object.entries(row).map(([key, value]) => [
      key.toLowerCase().replace(/[^a-z0-9]/g, ""),
      value,
    ]),
  );

  for (const key of keys) {
    const value = aliases.get(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (value) return value;
  }

  return "";
}

export function InboundForm({ campaigns }: InboundFormProps) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const [fetchingAll, startFetchAll] = useTransition();
  const [campaignId, setCampaignId] = useState("");
  const [rows, setRows] = useState<RowState[]>([newRow()]);
  const [failures, setFailures] = useState<{ row: number; error: string }[]>(
    [],
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [profilePreview, setProfilePreview] = useState<RowLookup | null>(null);
  // Bulk-fetch progress: how many done / total this run, the live cooldown
  // countdown, and a cancel flag the loop checks between batches.
  const [fetchProgress, setFetchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const cancelFetchRef = useRef(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const lookupTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const lookupCache = useRef<Record<string, CreatorLookupHit | null>>({});

  const validCount = useMemo(() => rows.filter(isRowValid).length, [rows]);
  const selectedCamp = useMemo(
    () => campaigns.find((c) => c.campaign_id === campaignId) ?? null,
    [campaigns, campaignId],
  );
  const campaignInvalid = submitAttempted && !campaignId.trim();

  const INBOUND_FIELD_LABELS: Record<string, string> = {
    instagramLink: "Profile URL",
    gender: "Gender",
    contentCode: "Content Type",
    collabType: "Collab Type",
    commercials: "Commercials",
  };

  const missingFieldLabels = useMemo(() => {
    if (!submitAttempted) return [] as string[];
    const labels = new Set<string>();
    if (!campaignId.trim()) labels.add("Campaign ID");
    const rowsWithEntry = rows.filter(rowHasEntry);
    const rowsToValidate = rowsWithEntry.length > 0 ? rowsWithEntry : rows;
    rowsToValidate.forEach((row) => {
      const errs = getRowValidationErrors(row);
      Object.keys(errs).forEach((k) => {
        const label = INBOUND_FIELD_LABELS[k];
        if (label) labels.add(label);
      });
    });
    return Array.from(labels);
  }, [submitAttempted, campaignId, rows]);

  const addRow = (prefill: Partial<InboundRowInput> = {}) => {
    setRows((r) => [...r, newRow(prefill)]);
  };

  const removeRow = (id: string) => {
    setRows((r) =>
      r.length > 1 ? r.filter((row) => row.id !== id) : [newRow()],
    );
  };

  const updateRow = useCallback((id: string, patch: Partial<RowState>) => {
    setRows((r) =>
      r.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  const applyLookupResult = useCallback(
    (id: string, username: string, result: CreatorLookupHit | null) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const currentUsername = inboundUsernameFromUrl(row.instagramLink);
          if (currentUsername !== username) return row;

          if (!result) {
            return {
              ...row,
              lookup: {
                username,
                source: "unknown",
                status: "error",
                name: null,
                followers: null,
                gender: null,
                category: null,
                profilePic: null,
                verification: null,
                error: "No existing data found",
              },
            };
          }

          const gender = normalizeGender(result.gender);
          return {
            ...row,
            gender: gender ?? row.gender,
            lookup: {
              username: result.username,
              source: result.source,
              status:
                result.source === "deactivated" || result.source === "error"
                  ? "error"
                  : "found",
              name: result.inf_name,
              profileId: result.profile_id ?? null,
              followers: result.followers,
              gender,
              category: result.category,
              profilePic: result.profile_pic,
              verification: result.verification,
            },
          };
        }),
      );
    },
    [],
  );

  const runRowLookup = useCallback(
    async (id: string, value: string) => {
      const username = inboundUsernameFromUrl(value);
      if (!username || !igUrlRe.test(value.trim())) {
        updateRow(id, { lookup: undefined });
        return;
      }

      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          if (
            row.lookup?.username === username &&
            row.lookup.status === "found"
          )
            return row;
          return {
            ...row,
            lookup: {
              username,
              source: row.lookup?.source ?? "unknown",
              status: "loading",
              name: row.lookup?.name ?? null,
              followers: row.lookup?.followers ?? null,
              gender: row.lookup?.gender ?? null,
              category: row.lookup?.category ?? null,
              profilePic: row.lookup?.profilePic ?? null,
              verification: row.lookup?.verification ?? null,
            },
          };
        }),
      );

      try {
        if (
          Object.prototype.hasOwnProperty.call(lookupCache.current, username)
        ) {
          applyLookupResult(id, username, lookupCache.current[username]);
          return;
        }
        const result = await lookupCreator(value, "reachout_inbound");
        lookupCache.current[username] = result;
        applyLookupResult(id, username, result);
      } catch (error) {
        setRows((prev) =>
          prev.map((row) =>
            row.id === id
              ? {
                  ...row,
                  lookup: {
                    username,
                    source: "unknown",
                    status: "error",
                    name: null,
                    followers: null,
                    gender: null,
                    category: null,
                    profilePic: null,
                    verification: null,
                    error:
                      error instanceof Error ? error.message : "Lookup failed",
                  },
                }
              : row,
          ),
        );
      }
    },
    [applyLookupResult, updateRow],
  );

  // Rows that carry a valid IG URL but haven't been fetched yet (no lookup, or it
  // hasn't resolved). Used to gate submit and to label the Fetch-all button.
  const unfetchedRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          igUrlRe.test(r.instagramLink.trim()) &&
          (!r.lookup ||
            r.lookup.status === "idle" ||
            r.lookup.status === "loading"),
      ),
    [rows],
  );

  // Fetch every unresolved row in ONE Meta Batch call (≤50 sub-requests, the
  // ig_fetching.py model). Each batch consumes a window of the rolling rate gate;
  // after 50 (or when Meta's X-App-Usage is high) the server opens a cooldown.
  const META_BATCH = 50;

  // Mark a set of row ids as "loading" so they show a spinner up-front.
  const markRowsLoading = (ids: Set<string>) => {
    setRows((prev) =>
      prev.map((row) =>
        ids.has(row.id)
          ? {
              ...row,
              lookup: {
                username: inboundUsernameFromUrl(row.instagramLink),
                source: row.lookup?.source ?? "unknown",
                status: "loading",
                name: row.lookup?.name ?? null,
                followers: row.lookup?.followers ?? null,
                gender: row.lookup?.gender ?? null,
                category: row.lookup?.category ?? null,
                profilePic: row.lookup?.profilePic ?? null,
                verification: row.lookup?.verification ?? null,
              },
            }
          : row,
      ),
    );
  };

  // Visible cooldown countdown between batches (ig_fetching.py style). Resolves
  // early if the user cancels.
  const countdown = async (secs: number) => {
    for (let s = secs; s > 0; s--) {
      if (cancelFetchRef.current) break;
      setCooldownLeft(s);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCooldownLeft(0);
  };

  // Fetch EVERY unresolved row, auto-looping in batches of 50 with the rate-gate
  // cooldown between batches (e.g. 70 rows → fetch 50, cool down, fetch 20).
  const fetchAllRows = () => {
    const targets = rows.filter(
      (r) =>
        igUrlRe.test(r.instagramLink.trim()) &&
        r.lookup?.status !== "found" &&
        r.lookup?.status !== "loading",
    );
    if (targets.length === 0) {
      toast.info("Nothing to fetch — add Instagram profile URLs first.");
      return;
    }
    cancelFetchRef.current = false;
    const total = targets.length;
    startFetchAll(async () => {
      let remaining = [...targets];
      let done = 0;
      setFetchProgress({ done: 0, total });
      let guard = 0;
      while (remaining.length && !cancelFetchRef.current && guard++ < 50) {
        const chunk = remaining.slice(0, META_BATCH);
        markRowsLoading(new Set(chunk.map((r) => r.id)));
        const res = await lookupCreatorsBatch(
          chunk.map((r) => r.instagramLink),
          "reachout_inbound",
        );
        if (res.fetched > 0) {
          chunk.forEach((r) => {
            const u = inboundUsernameFromUrl(r.instagramLink);
            const hit = res.hits[u] ?? null;
            lookupCache.current[u] = hit;
            applyLookupResult(r.id, u, hit);
          });
          done += res.fetched;
          remaining = remaining.slice(chunk.length);
          setFetchProgress({ done, total });
        }
        // More to go AND the gate opened a cooldown → wait it out, then continue
        // (also covers the "already cooling, fetched 0" case → retry same chunk).
        if (remaining.length && res.coolingDown && !cancelFetchRef.current) {
          await countdown(res.retryAfterSec);
        } else if (res.fetched === 0 && !res.coolingDown) {
          break; // nothing fetched and not cooling — avoid a tight loop
        }
      }
      setFetchProgress(null);
      setCooldownLeft(0);
      if (cancelFetchRef.current) toast.info(`Stopped. Fetched ${done}/${total}.`);
      else toast.success(`Fetched ${done} profile(s).`);
    });
  };

  const cancelFetchAll = () => {
    cancelFetchRef.current = true;
  };

  const handleInstagramChange = (id: string, value: string) => {
    const username = inboundUsernameFromUrl(value);
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const keepLookup =
          row.lookup?.username === username ? row.lookup : undefined;
        return { ...row, instagramLink: value, lookup: keepLookup };
      }),
    );

    if (lookupTimers.current[id]) clearTimeout(lookupTimers.current[id]);
    if (username && igUrlRe.test(value.trim())) {
      lookupTimers.current[id] = setTimeout(() => {
        void runRowLookup(id, value);
      }, 120);
    }
  };

  useEffect(() => {
    const timers = lookupTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const downloadTemplate = async () => {
    const headers = ["instaLink", "gender", "contentCode"];

    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const rosterSheet = XLSX.utils.aoa_to_sheet([
      headers,
      ["https://instagram.com/handle", "Female", CONTENT_CODES[0]?.code ?? ""],
      ["https://instagram.com/another", "Female", CONTENT_CODES[0]?.code ?? ""],
    ]);
    rosterSheet["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 18 }];
    rosterSheet["!autofilter"] = { ref: "A1:C1" };
    XLSX.utils.book_append_sheet(workbook, rosterSheet, "Inbound Reach Out");

    const codeSheet = XLSX.utils.aoa_to_sheet([
      ["Content Type"],
      ...CONTENT_CODES.map((content) => [content.code]),
    ]);
    codeSheet["!cols"] = [{ wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, codeSheet, "Content Types");

    const genderFormula = `"${GENDERS.join(",")}"`;
    const contentCodeFormula = `"${CONTENT_CODES.map((c) => c.code).join(",")}"`;
    const validationXml =
      '<dataValidations count="2">' +
      `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="B2:B201"><formula1>${genderFormula}</formula1></dataValidation>` +
      `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="C2:C201"><formula1>${contentCodeFormula}</formula1></dataValidation>` +
      "</dataValidations>";
    const workbookBytes = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    }) as ArrayBuffer;
    const zip = XLSX.CFB.read(new Uint8Array(workbookBytes), {
      type: "buffer",
    });
    const sheet = XLSX.CFB.find(zip, "sheet1.xml");
    if (!sheet?.content) {
      throw new Error("Could not prepare spreadsheet template");
    }
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const sheetXml = decoder.decode(sheet.content as Uint8Array);
    const patchedSheetXml = sheetXml.includes("<ignoredErrors")
      ? sheetXml.replace("<ignoredErrors", `${validationXml}<ignoredErrors`)
      : sheetXml.replace("</worksheet>", `${validationXml}</worksheet>`);
    XLSX.CFB.utils.cfb_add(zip, "sheet1.xml", encoder.encode(patchedSheetXml));
    const patchedWorkbook = XLSX.CFB.write(zip, {
      type: "array",
      fileType: "zip",
    }) as ArrayBuffer;
    const blob = new Blob([patchedWorkbook], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inbound-reachout-template.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const importRosterFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const isSpreadsheet = /\.(xlsx|xls)$/i.test(f.name);
      let parsed: Record<string, string>[];
      if (isSpreadsheet) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await f.arrayBuffer(), { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        parsed = XLSX.utils
          .sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" })
          .map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([key, value]) => [
                key.trim(),
                String(value).trim(),
              ]),
            ),
          );
      } else {
        const data = await f.text();
        const lines = data.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          toast.error("Empty file — no data rows detected.");
          return;
        }
        const hdr = lines[0].split(",").map((s) => s.trim());
        parsed = lines.slice(1).map((line) => {
          const cols = line.split(",");
          const obj: Record<string, string> = {};
          hdr.forEach((h, i) => {
            obj[h] = (cols[i] || "").trim();
          });
          return obj;
        });
      }

      if (parsed.length === 0) {
        toast.error("Empty file — no data rows detected.");
        return;
      }

      const next = parsed.slice(0, 200).map((r) => {
        const gender =
          normalizeGender(rosterValue(r, "gender", "Gender")) ?? "Female";
        const contentCode = rosterValue(
          r,
          "contentCode",
          "content_code",
          "Content Type",
          "content_type",
          "Content Code",
        );
        // Collab Type + Commercials are no longer collected — inbound is always
        // Barter / ₹0 (newRow defaults them). Legacy template columns ignored.
        return newRow({
          instagramLink: rosterValue(
            r,
            "instaLink",
            "instagramLink",
            "url",
            "Profile URL",
            "Instagram URL",
          ),
          gender,
          contentCode,
        });
      });
      setRows(next);
      const lookupRows = next.filter((row) =>
        igUrlRe.test(row.instagramLink.trim()),
      );
      const datasetHits = await lookupCreatorsFromDataset(
        lookupRows.map((row) => row.instagramLink),
        "reachout_inbound",
      );
      lookupRows.forEach((row) => {
        const username = inboundUsernameFromUrl(row.instagramLink);
        const hit = datasetHits[username];
        if (hit) {
          lookupCache.current[username] = hit;
          applyLookupResult(row.id, username, hit);
        } else {
          void runRowLookup(row.id, row.instagramLink);
        }
      });
      toast.success(`${parsed.length} row(s) staged. Review and submit.`);
    } catch (err) {
      toast.error(
        `Parse error: ${err instanceof Error ? err.message : "Could not read file"}`,
      );
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  const onSubmit = () => {
    setSubmitAttempted(true);

    const messages: string[] = [];
    if (!campaignId.trim()) {
      messages.push("Campaign ID is required.");
    }

    const rowsWithEntry = rows.filter(rowHasEntry);
    const rowsToValidate = rowsWithEntry.length > 0 ? rowsWithEntry : rows;
    rowsToValidate.forEach((row) => {
      const originalIndex = rows.findIndex((r) => r.id === row.id);
      const errors = getRowValidationErrors(row);
      Object.values(errors).forEach((message) => {
        messages.push(`Row ${originalIndex + 1}: ${message}`);
      });
      // Fetch-before-submit rule: a row with a valid URL must have been fetched
      // (Meta/historic resolved, or a definitive not-fetchable result). Block a
      // row that was never fetched or is still loading.
      if (
        igUrlRe.test(row.instagramLink.trim()) &&
        (!row.lookup ||
          row.lookup.status === "idle" ||
          row.lookup.status === "loading")
      ) {
        messages.push(
          `Row ${originalIndex + 1}: fetch the profile before submitting.`,
        );
      }
    });

    if (messages.length > 0) {
      toast.error(messages[0], {
        description:
          messages.length > 1
            ? messages.slice(1, 4).join(" ")
            : "Please fill the highlighted field.",
      });
      return;
    }

    const valid = rows.filter(isRowValid);
    if (valid.length === 0) {
      toast.error("Add at least one valid row.");
      return;
    }
    setFailures([]);
    startSubmit(async () => {
      const res = await submitInboundBatch({
        campaignId,
        rows: valid.map((v) => ({
          instagramLink: v.instagramLink,
          gender: v.gender,
          contentCode: v.contentCode,
          collabType: v.collabType,
          commercials: v.collabType === "Barter" ? 0 : v.commercials ?? 0,
          profileId: v.lookup?.profileId ?? undefined,
        })),
      });
      if (!res.ok) {
        toast.error(res.error || "Batch submit failed");
        return;
      }
      setFailures(res.failures);
      // Strip succeeded rows; keep failed ones for fix-and-retry.
      const failedIdxs = new Set(res.failures.map((f) => f.row - 1));
      const validIdxs = rows
        .map((r, i) => (isRowValid(r) ? i : -1))
        .filter((i) => i !== -1);
      const failedRowIds = new Set(
        validIdxs.filter((vi, k) => failedIdxs.has(k)).map((vi) => rows[vi].id),
      );
      setRows((prev) => {
        const remaining = prev.filter(
          (r) => !isRowValid(r) || failedRowIds.has(r.id),
        );
        return remaining.length ? remaining : [newRow()];
      });
      if (res.created > 0) {
        setSubmitAttempted(false);
        toast.success(
          `${res.created} inbound reach out(s) created.`,
        );
        if (res.failures.length === 0) {
          setCampaignId("");
        }
        router.refresh();
      } else if (res.failures.length) {
        toast.error(
          "None of the rows were created. See banner above the table.",
        );
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="reachout-form space-y-3"
    >
      {/* ── Campaign Assignment + Cap chip ─────────────────────────────── */}
      <section
        className="glass-card reachout-step-card"
        style={{ animationDelay: "0ms" }}
      >
        <h5 className="section-title">
          <Megaphone aria-hidden />
          Campaign Assignment
          <span className="section-status-chip">Required</span>
          <button
            type="button"
            className="section-info-trigger"
            aria-label="Inbound campaign tip"
            title="All inbound rows in this batch will be linked to the selected campaign."
          >
            <Info aria-hidden />
          </button>
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div className="md:col-span-2">
            <div className="form-floating">
              <SearchableSelect
                id="rin_campaign"
                className={cn(campaignInvalid && "is-invalid-control")}
                value={campaignId}
                onChange={setCampaignId}
                options={campaigns.map((c) => ({
                  value: c.campaign_id,
                  label: `${c.campaign_id}${c.campaign_name ? ` · ${c.campaign_name}` : ""}`,
                }))}
                placeholder="Select campaign…"
                searchPlaceholder="Search campaigns…"
              />
              <label htmlFor="rin_campaign">
                Campaign ID <span className="req">*</span>
              </label>
            </div>
            {campaignInvalid && (
              <small className="field-error">Campaign ID is required.</small>
            )}
            {selectedCamp?.brief_link && (
              <div className="brief-chip mt-2">
                <ExternalLink size={11} />
                <span className="brief-label">Campaign brief</span>
                <a
                  href={selectedCamp.brief_link}
                  target="_blank"
                  rel="noopener"
                  className="brief-link"
                >
                  Open
                </a>
                {selectedCamp.internal_brief_link && (
                  <>
                    <span className="brief-sep">·</span>
                    <a
                      href={selectedCamp.internal_brief_link}
                      target="_blank"
                      rel="noopener"
                      className="brief-link"
                    >
                      Internal
                    </a>
                  </>
                )}
              </div>
            )}
            {selectedCamp && (selectedCamp.creator_cap ?? 0) > 0
              ? (() => {
                  const cap = selectedCamp.creator_cap ?? 0;
                  const used = selectedCamp.creators_used ?? 0;
                  const closed =
                    (selectedCamp.status ?? "").trim().toLowerCase() ===
                    "closed";
                  const full = used >= cap;
                  const tone = closed
                    ? "pill--danger"
                    : full
                      ? "pill--warning"
                      : "pill--muted";
                  return (
                    <span
                      className={`pill ${tone} mt-2`}
                      title="Onboarded creators / onboarding cap for this campaign. Reach-out is unlimited — the cap applies at onboarding."
                    >
                      <Users size={11} aria-hidden />
                      {used} / {cap} onboarded
                      {closed
                        ? " · closed — reopen to add"
                        : full
                          ? " · onboard cap reached"
                          : ` · ${cap - used} slot${cap - used === 1 ? "" : "s"} left`}
                    </span>
                  );
                })()
              : null}
            <small className="text-muted">
              All rows in this batch will be tagged to the chosen campaign.
            </small>
          </div>

          <div className="cap-card">
            <div className="cap-card__head">
              <span>Manual entry cap</span>
              <span className="cap-card__chip">
                <strong>{rows.length}</strong> / {INBOUND_MANUAL_CAP}
              </span>
            </div>
            <small>
              Add up to {INBOUND_MANUAL_CAP} inbound creators by hand. For
              larger batches, upload the template file.
            </small>
            <small className="cap-card__hint">
              <Sparkles size={11} />
              Click Fetch to pull followers + profile data live from Instagram.
            </small>
          </div>
        </div>
      </section>

      {/* ── Inbound Roster table ───────────────────────────────────────── */}
      <section
        className="glass-card reachout-step-card"
        style={{ animationDelay: "55ms" }}
      >
        <div className="flex justify-between items-start gap-3 flex-wrap mb-2">
          <div>
            <h5 className="section-title mb-1">
              <TableIcon size={14} className="inline mr-2" />
              Inbound Roster <span className="req">*</span>
            </h5>
            <small className="text-muted">
              Profile URL, Gender, Content Type are mandatory. Click{" "}
              <strong>Fetch</strong> to pull name + followers live from Instagram
              (required before submit). Email auto-fills from the Shopify order.
            </small>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button
              type="button"
              className="btn-toolbar"
              onClick={() =>
                void downloadTemplate().catch((error) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not build template",
                  );
                })
              }
            >
              <Download size={12} />
              XLSX template
            </button>
            <button
              type="button"
              className="btn-toolbar"
              onClick={() => csvInputRef.current?.click()}
            >
              <Upload size={12} />
              Upload CSV/XLSX
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              hidden
              onChange={(event) => void importRosterFile(event)}
            />
            <button
              type="button"
              className="btn-toolbar"
              onClick={fetchAllRows}
              disabled={fetchingAll || unfetchedRows.length === 0}
              title="Fetch all profiles live from Instagram — auto-batches of 50 with a cooldown between"
            >
              {fetchingAll ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Zap size={12} />
              )}
              {unfetchedRows.length > 0
                ? `Fetch (${unfetchedRows.length})`
                : "Fetch all"}
            </button>
            {fetchingAll && fetchProgress && (
              <span className="inline-flex flex-col gap-1 rounded-xl bg-[#F5F1EC] px-3 py-1.5 text-[0.72rem] font-semibold text-[#161513]">
                <span className="inline-flex items-center gap-2">
                  {cooldownLeft > 0 ? (
                    <>
                      <Clock size={11} className="text-[#B57514]" />
                      Cooling down {cooldownLeft}s · {fetchProgress.done}/
                      {fetchProgress.total}
                    </>
                  ) : (
                    <>
                      <Loader2 size={11} className="animate-spin" />
                      Fetching {fetchProgress.done}/{fetchProgress.total}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={cancelFetchAll}
                    className="ml-1 text-[#C0392B] hover:underline"
                  >
                    Stop
                  </button>
                </span>
                <span
                  className="fetch-bar fetch-bar--determinate"
                  style={{ minWidth: 160 }}
                >
                  <span
                    style={{
                      width: `${fetchProgress.total ? Math.round((fetchProgress.done / fetchProgress.total) * 100) : 0}%`,
                    }}
                  />
                </span>
              </span>
            )}
            <button
              type="button"
              className="btn-accent btn-sm"
              onClick={() => addRow()}
              disabled={rows.length >= INBOUND_MANUAL_CAP}
              title={
                rows.length >= INBOUND_MANUAL_CAP
                  ? "Manual cap reached — use CSV for more"
                  : ""
              }
            >
              <Plus size={12} />
              Add row
            </button>
          </div>
        </div>

        {failures.length > 0 && (
          <div className="alert alert-danger mb-2">
            <AlertCircle size={14} />
            <div>
              <strong>{failures.length} row(s) failed</strong>
              <ul className="mt-1">
                {failures.map((f) => (
                  <li key={f.row}>
                    Row {f.row} — {f.error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Desktop table */}
        <div className="inbound-table-wrap hidden md:block">
          <table className="inbound-table">
            <colgroup>
              <col style={{ width: 120 }} />
              <col style={{ width: 320 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 280 }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>
                  Profile URL <span className="req">*</span>
                </th>
                <th>
                  Gender <span className="req">*</span>
                </th>
                <th>
                  Content Type <span className="req">*</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const valid = isRowValid(r);
                const hasUrl = !!r.instagramLink.trim();
                // REQ #1: live URL feedback — flag a non-empty, non-Instagram
                // value immediately on type/blur, before submit.
                const igLiveInvalid =
                  hasUrl && !isInstagramProfileUrl(r.instagramLink);
                const showRowValidation =
                  submitAttempted &&
                  (rowHasEntry(r) || rows.every((row) => !rowHasEntry(row)));
                const rowErrors = showRowValidation
                  ? getRowValidationErrors(r)
                  : {};
                const rowInvalid = hasRowErrors(rowErrors);
                return (
                  <tr
                    key={r.id}
                    className={
                      rowInvalid || (hasUrl && !valid) ? "row-invalid" : ""
                    }
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <td className="idx">
                      <div className="inbound-row-index">
                        <button
                          type="button"
                          className={cn(
                            "btn-icon-remove inbound-row-remove",
                            !hasUrl && idx === 0 && "is-hidden",
                          )}
                          onClick={() => removeRow(r.id)}
                          aria-label={
                            rows.length === 1 ? "Clear row" : "Remove row"
                          }
                        >
                          <X size={13} />
                        </button>
                        <span className="inbound-row-number">{idx + 1}</span>
                        <button
                          type="button"
                          className={cn(
                            "inbound-row-avatar",
                            r.lookup?.status === "loading" && "is-loading",
                            !r.lookup?.profilePic && "is-empty",
                            !hasUrl && "is-placeholder",
                          )}
                          onClick={() =>
                            r.lookup?.profilePic && setProfilePreview(r.lookup)
                          }
                          disabled={!r.lookup?.profilePic}
                          aria-label={
                            hasUrl
                              ? `Open @${inboundUsernameFromUrl(r.instagramLink)} profile image`
                              : "Profile preview unavailable"
                          }
                        >
                          {r.lookup?.profilePic ? (
                            <img
                              src={
                                proxyAvatarUrl(r.lookup.profilePic, 96) ??
                                r.lookup.profilePic
                              }
                              alt=""
                            />
                          ) : r.lookup?.status === "loading" ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Eye size={13} />
                          )}
                        </button>
                      </div>
                    </td>
                    <td>
                      <input
                        type="url"
                        className={cn(
                          "form-control",
                          (rowErrors.instagramLink || igLiveInvalid) &&
                            "is-invalid-control",
                        )}
                        placeholder="https://instagram.com/handle"
                        value={r.instagramLink}
                        onChange={(e) =>
                          handleInstagramChange(r.id, e.target.value)
                        }
                        onBlur={(e) => void runRowLookup(r.id, e.target.value)}
                      />
                      {hasUrl && (
                        <div className="inbound-row-profile is-compact">
                          <div className="min-w-0">
                            <div className="inbound-row-handle">
                              @{inboundUsernameFromUrl(r.instagramLink)}
                            </div>
                            <div
                              className={cn(
                                "inbound-row-status",
                                r.lookup?.status && `is-${r.lookup.status}`,
                              )}
                            >
                              {lookupStatusText(r.lookup)}
                            </div>
                          </div>
                        </div>
                      )}
                      {rowErrors.instagramLink && (
                        <small className="field-error">
                          {rowErrors.instagramLink}
                        </small>
                      )}
                    </td>
                    <td>
                      <SearchableSelect
                        className={cn(rowErrors.gender && "is-invalid-control")}
                        value={r.gender}
                        onChange={(v) =>
                          updateRow(r.id, { gender: v as Gender })
                        }
                        options={GENDERS.map((g) => ({ value: g, label: g }))}
                        placeholder="Select gender…"
                        searchPlaceholder="Search…"
                      />
                      {rowErrors.gender && (
                        <small className="field-error">
                          {rowErrors.gender}
                        </small>
                      )}
                    </td>
                    <td>
                      <SearchableSelect
                        className={cn(
                          rowErrors.contentCode && "is-invalid-control",
                        )}
                        value={r.contentCode}
                        onChange={(v) =>
                          updateRow(r.id, { contentCode: v })
                        }
                        options={[
                          { value: "", label: "Choose code…" },
                          ...CONTENT_CODES.map((c) => ({
                            value: c.code,
                            label: `${c.code} — ${c.name}`,
                          })),
                        ]}
                        placeholder="Choose code…"
                        searchPlaceholder="Search content types…"
                      />
                      {rowErrors.contentCode && (
                        <small className="field-error">
                          {rowErrors.contentCode}
                        </small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards (2x2 per legacy mobile rules) */}
        <div className="md:hidden space-y-3">
          {rows.map((r, idx) => {
            const valid = isRowValid(r);
            const hasUrl = !!r.instagramLink.trim();
            const showRowValidation =
              submitAttempted &&
              (rowHasEntry(r) || rows.every((row) => !rowHasEntry(row)));
            const rowErrors = showRowValidation
              ? getRowValidationErrors(r)
              : {};
            const rowInvalid = hasRowErrors(rowErrors);
            return (
              <div
                key={r.id}
                className={cn(
                  "inbound-card relative",
                  (rowInvalid || (hasUrl && !valid)) && "is-invalid",
                )}
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                {/* Floating Close Button in top-right corner above the card border */}
                <button
                  type="button"
                  className={cn(
                    "inbound-mobile-close-btn",
                    !hasUrl && idx === 0 && "is-hidden",
                  )}
                  onClick={() => removeRow(r.id)}
                  aria-label={rows.length === 1 ? "Clear row" : "Remove row"}
                >
                  <X size={13} />
                </button>

                {hasUrl && (
                  <div className="inbound-mobile-identity">
                    <button
                      type="button"
                      className={cn(
                        "inbound-mobile-identity__avatar",
                        r.lookup?.status === "loading" && "is-loading",
                        !r.lookup?.profilePic && "is-empty",
                      )}
                      onClick={() =>
                        r.lookup?.profilePic && setProfilePreview(r.lookup)
                      }
                      disabled={!r.lookup?.profilePic}
                      aria-label={`Open @${inboundUsernameFromUrl(r.instagramLink)} profile image`}
                    >
                      {r.lookup?.profilePic ? (
                        <img
                          src={
                            proxyAvatarUrl(r.lookup.profilePic, 144) ??
                            r.lookup.profilePic
                          }
                          alt=""
                        />
                      ) : r.lookup?.status === "loading" ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Eye size={17} />
                      )}
                    </button>
                    <div className="inbound-mobile-identity__copy">
                      <strong>
                        {r.lookup?.name ??
                          `@${inboundUsernameFromUrl(r.instagramLink)}`}
                      </strong>
                      <span>@{inboundUsernameFromUrl(r.instagramLink)}</span>
                    </div>
                    <span
                      className={cn(
                        "inbound-row-status",
                        r.lookup?.status && `is-${r.lookup.status}`,
                      )}
                    >
                      {lookupStatusText(r.lookup)}
                    </span>
                  </div>
                )}

                <label className="form-field mb-3 block">
                  <span>
                    Profile URL <span className="req">*</span>
                  </span>
                  <input
                    type="url"
                    className={cn(
                      "form-control",
                      rowErrors.instagramLink && "is-invalid-control",
                    )}
                    placeholder="https://instagram.com/handle"
                    value={r.instagramLink}
                    onChange={(e) =>
                      handleInstagramChange(r.id, e.target.value)
                    }
                    onBlur={(e) => void runRowLookup(r.id, e.target.value)}
                  />
                  {rowErrors.instagramLink && (
                    <small className="field-error">
                      {rowErrors.instagramLink}
                    </small>
                  )}
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="form-field block">
                    <span>
                      Gender <span className="req">*</span>
                    </span>
                    <SearchableSelect
                      className={cn(rowErrors.gender && "is-invalid-control")}
                      value={r.gender}
                      onChange={(v) => updateRow(r.id, { gender: v as Gender })}
                      options={GENDERS.map((g) => ({ value: g, label: g }))}
                      placeholder="Select gender…"
                      searchPlaceholder="Search…"
                    />
                    {rowErrors.gender && (
                      <small className="field-error">{rowErrors.gender}</small>
                    )}
                  </label>
                  <label className="form-field block">
                    <span>
                      Content Type <span className="req">*</span>
                    </span>
                    <SearchableSelect
                      className={cn(
                        rowErrors.contentCode && "is-invalid-control",
                      )}
                      value={r.contentCode}
                      onChange={(v) => updateRow(r.id, { contentCode: v })}
                      options={[
                        { value: "", label: "Choose…" },
                        ...CONTENT_CODES.map((c) => ({
                          value: c.code,
                          label: c.code,
                        })),
                      ]}
                      placeholder="Choose…"
                      searchPlaceholder="Search content types…"
                    />
                    {rowErrors.contentCode && (
                      <small className="field-error">
                        {rowErrors.contentCode}
                      </small>
                    )}
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {rows.length === 0 && (
          <div className="empty-row">
            <Inbox size={20} aria-hidden />
            No rows yet. Use <strong>Add row</strong> for one-off entries or{" "}
            <strong>Upload CSV</strong> for batches.
          </div>
        )}

        <MissingFieldsAlert fields={missingFieldLabels} className="mt-3" />

        <div className="flex justify-between items-center mt-3 gap-3 flex-wrap">
          <small className="text-muted">
            <Info size={11} className="inline mr-1" />
            Each row creates one Reach Out record tagged{" "}
            <code className="code-chip">Inbound</code> and linked to the
            campaign above.
          </small>
          <button
            type="submit"
            className={cn("btn-primary-cta", submitting && "is-loading")}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Submitting {validCount}...
              </>
            ) : (
              <>
                <CloudUpload size={14} />
                Submit all ({validCount})
              </>
            )}
          </button>
        </div>
      </section>
      {profilePreview && (
        <div
          className="inbound-profile-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Profile image for @${profilePreview.username}`}
          onClick={() => setProfilePreview(null)}
        >
          <div
            className="inbound-profile-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn-icon-remove inbound-profile-close"
              onClick={() => setProfilePreview(null)}
              aria-label="Close profile preview"
            >
              <X size={18} />
            </button>
            <div className="inbound-profile-hero">
              {profilePreview.profilePic ? (
                <img
                  src={
                    proxyAvatarUrl(profilePreview.profilePic, 320) ??
                    profilePreview.profilePic
                  }
                  alt={`@${profilePreview.username}`}
                />
              ) : (
                <span>{profilePreview.username.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="inbound-profile-copy">
              <p>@{profilePreview.username}</p>
              <h3>{profilePreview.name ?? "Instagram profile"}</h3>
            </div>
            <div className="inbound-profile-grid">
              <div>
                <span>Source</span>
                <strong>{lookupStatusText(profilePreview)}</strong>
              </div>
              <div>
                <span>Followers</span>
                <strong>{formatFollowers(profilePreview.followers)}</strong>
              </div>
              <div>
                <span>Gender</span>
                <strong>{profilePreview.gender ?? "—"}</strong>
              </div>
              <div>
                <span>Tier</span>
                <strong>{profilePreview.category ?? "—"}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
