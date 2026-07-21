"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Clapperboard,
  Download,
  Folder,
  FolderOpen,
  Home,
  Play,
  Search,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { InstagramEmbedLightbox } from "@/components/ui/instagram-preview";
import { extractShortcode } from "@/lib/instagram-shortcode";
import type { CampaignFolder, CreatorFolder, PostAsset } from "./queries";

/**
 * Post Assets — DAM-style folder browser (Campaign → Creator → videos).
 * Grid videos autoplay muted while in view (IntersectionObserver pauses
 * off-screen ones); clicking a card opens the shared lightbox popup, which
 * plays the durable bucket mp4 natively (Instagram embed fallback).
 */

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function PostAssetsView({
  campaigns,
  totalAssets,
  totalCreators,
}: {
  campaigns: CampaignFolder[];
  totalAssets: number;
  totalCreators: number;
}) {
  const [campId, setCampId] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const campaign = campaigns.find((c) => c.campaign_id === campId) ?? null;
  const creator =
    campaign?.creators.find((c) => c.username === creatorId) ?? null;

  // Search cuts across the whole tree from any level.
  const needle = q.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!needle) return null;
    const out: Array<{ asset: PostAsset; folder: CreatorFolder }> = [];
    for (const c of campaigns) {
      for (const f of c.creators) {
        for (const a of f.assets) {
          const hay = [
            f.username,
            f.inf_name,
            a.post_id_short ?? a.post_id,
            a.collab_id,
            a.campaign_id,
          ]
            .map((v) => String(v ?? "").toLowerCase())
            .join(" ");
          if (hay.includes(needle)) out.push({ asset: a, folder: f });
        }
      }
    }
    return out;
  }, [campaigns, needle]);

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {/* ── Left rail — campaign folders (DAM asset-tabs style) ── */}
      <aside className="lg:w-[240px] shrink-0">
        <div className="rounded-[12px] border border-[#E7E2D2] bg-white p-2 flex lg:flex-col gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setCampId(null);
              setCreatorId(null);
            }}
            className={cn(
              "flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-[13px] font-medium text-left shrink-0",
              campId === null
                ? "bg-[#2C2420] text-white"
                : "text-[#494640] hover:bg-[#F9F7F2]",
            )}
          >
            <Home size={14} aria-hidden className="shrink-0" />
            All campaigns
            <span
              className={cn(
                "ml-auto text-[11px]",
                campId === null ? "text-white/60" : "text-[#9A9384]",
              )}
            >
              {totalAssets}
            </span>
          </button>
          {campaigns.map((c) => {
            const active = campId === c.campaign_id;
            return (
              <button
                key={c.campaign_id}
                type="button"
                onClick={() => {
                  setCampId(c.campaign_id);
                  setCreatorId(null);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-[13px] font-medium text-left shrink-0 min-w-0",
                  active
                    ? "bg-[#2C2420] text-white"
                    : "text-[#494640] hover:bg-[#F9F7F2]",
                )}
                title={c.campaign_name ?? c.campaign_id}
              >
                {active ? (
                  <FolderOpen size={14} aria-hidden className="shrink-0" />
                ) : (
                  <Folder size={14} aria-hidden className="shrink-0" />
                )}
                <span className="truncate">
                  {c.campaign_id}
                  {c.campaign_name ? ` · ${c.campaign_name}` : ""}
                </span>
                <span
                  className={cn(
                    "ml-auto text-[11px]",
                    active ? "text-white/60" : "text-[#9A9384]",
                  )}
                >
                  {c.assetCount}
                </span>
              </button>
            );
          })}
        </div>
        <p className="hidden lg:flex items-center gap-1.5 mt-3 text-[11px] text-[#9A9384] px-1">
          <Users size={11} aria-hidden /> {totalCreators} creators ·{" "}
          {totalAssets} videos
        </p>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 min-w-0">
        {/* Breadcrumb + search */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <nav
            aria-label="Folder path"
            className="flex items-center gap-1 text-[13px] min-w-0"
          >
            <button
              type="button"
              onClick={() => {
                setCampId(null);
                setCreatorId(null);
              }}
              className={cn(
                "font-semibold",
                campId === null
                  ? "text-[#161513]"
                  : "text-[#6E695E] hover:text-[#161513]",
              )}
            >
              Post Assets
            </button>
            {campaign && (
              <>
                <ChevronRight size={13} aria-hidden className="text-[#C9C2AE]" />
                <button
                  type="button"
                  onClick={() => setCreatorId(null)}
                  className={cn(
                    "font-semibold truncate",
                    creator
                      ? "text-[#6E695E] hover:text-[#161513]"
                      : "text-[#161513]",
                  )}
                >
                  {campaign.campaign_id}
                </button>
              </>
            )}
            {creator && (
              <>
                <ChevronRight size={13} aria-hidden className="text-[#C9C2AE]" />
                <span className="font-semibold text-[#161513] truncate">
                  @{creator.username}
                </span>
              </>
            )}
          </nav>
          <label className="relative flex items-center w-full sm:w-[260px]">
            <Search
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#9A9384]"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search creator, POST ID…"
              className="w-full h-9 rounded-[10px] border border-[#E7E2D2] bg-white pl-8 pr-3 text-[13px] outline-none focus:border-[#C9A882]"
            />
          </label>
        </div>

        {/* Search results override the folder view */}
        {searchResults ? (
          searchResults.length === 0 ? (
            <EmptyNote text="No videos match your search." />
          ) : (
            <VideoGrid
              items={searchResults.map((r) => ({
                asset: r.asset,
                folder: r.folder,
              }))}
              showCreator
            />
          )
        ) : campaign === null ? (
          /* Level 1 — campaign folders */
          campaigns.length === 0 ? (
            <EmptyNote text="No posted videos yet — assets appear here automatically once posts are submitted." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {campaigns.map((c) => (
                <button
                  key={c.campaign_id}
                  type="button"
                  onClick={() => setCampId(c.campaign_id)}
                  className="group flex items-center gap-3 rounded-[12px] border border-[#E7E2D2] bg-white p-4 text-left hover:border-[#C9A882] transition-colors"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[#FDF6DC] text-[#8C6D00]">
                    <Folder size={20} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold text-[#161513] truncate">
                      {c.campaign_id}
                      {c.campaign_name ? ` · ${c.campaign_name}` : ""}
                    </span>
                    <span className="block text-[12px] text-[#9A9384]">
                      {c.creators.length} creator
                      {c.creators.length === 1 ? "" : "s"} · {c.assetCount}{" "}
                      video{c.assetCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    aria-hidden
                    className="ml-auto shrink-0 text-[#C9C2AE] group-hover:text-[#8C6D00]"
                  />
                </button>
              ))}
            </div>
          )
        ) : creator === null ? (
          /* Level 2 — creator folders inside the campaign */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {campaign.creators.map((f) => (
              <button
                key={f.username}
                type="button"
                onClick={() => setCreatorId(f.username)}
                className="group flex items-center gap-3 rounded-[12px] border border-[#E7E2D2] bg-white p-4 text-left hover:border-[#C9A882] transition-colors"
              >
                <Avatar
                  src={f.profile_pic}
                  username={f.username}
                  name={f.inf_name}
                  size={44}
                  interactive={false}
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-[#161513] truncate">
                    {f.inf_name ?? `@${f.username}`}
                  </span>
                  <span className="block text-[12px] text-[#9A9384] truncate">
                    @{f.username} · {f.assets.length} video
                    {f.assets.length === 1 ? "" : "s"}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  aria-hidden
                  className="ml-auto shrink-0 text-[#C9C2AE] group-hover:text-[#8C6D00]"
                />
              </button>
            ))}
          </div>
        ) : (
          /* Level 3 — the creator's videos */
          <VideoGrid
            items={creator.assets.map((asset) => ({
              asset,
              folder: creator,
            }))}
          />
        )}
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="rounded-[12px] border border-dashed border-[#E7E2D2] bg-white/60 px-4 py-10 text-center text-[13px] text-[#9A9384]">
      {text}
    </p>
  );
}

function VideoGrid({
  items,
  showCreator = false,
}: {
  items: Array<{ asset: PostAsset; folder: CreatorFolder }>;
  showCreator?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {items.map(({ asset, folder }) => (
        <VideoCard
          key={asset.post_id}
          asset={asset}
          folder={folder}
          showCreator={showCreator}
        />
      ))}
    </div>
  );
}

function VideoCard({
  asset,
  folder,
  showCreator,
}: {
  asset: PostAsset;
  folder: CreatorFolder;
  showCreator: boolean;
}) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shortcode = extractShortcode(asset.post_link ?? "");
  const canOpen = Boolean(shortcode || asset.post_media);

  // Autoplay while in view: play muted when ≥40% visible, pause off-screen.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const label = `@${folder.username} · ${asset.post_id_short ?? asset.post_id}`;

  return (
    <>
      <div className="group overflow-hidden rounded-[12px] border border-[#E7E2D2] bg-white transition-colors hover:border-[#C9A882]">
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => canOpen && setOpen(true)}
          className="relative block w-full aspect-[9/16] bg-black text-left"
          aria-label={`Play ${label}`}
          title={canOpen ? "Open in player" : undefined}
        >
          {asset.post_media ? (
            <video
              ref={videoRef}
              src={asset.post_media}
              muted
              loop
              playsInline
              preload="metadata"
              poster={asset.post_thumbnail ?? undefined}
              className="h-full w-full object-cover"
            />
          ) : asset.post_thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.post_thumbnail}
              alt={label}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-white/40">
              <Clapperboard size={28} aria-hidden />
            </span>
          )}
          {canOpen && (
            <span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/25">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F0C61E] text-[#161513] shadow opacity-0 transition-opacity group-hover:opacity-100">
                <Play size={18} aria-hidden fill="currentColor" className="translate-x-[1px]" />
              </span>
            </span>
          )}
          {asset.deliverable_type && (
            <span className="absolute left-1.5 top-1.5 rounded-[6px] bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {asset.deliverable_type}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1.5 p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-[#161513]">
              {showCreator
                ? `@${folder.username}`
                : (asset.post_id_short ?? asset.post_id)}
            </p>
            <p className="truncate text-[11px] text-[#9A9384]">
              {showCreator
                ? (asset.post_id_short ?? asset.post_id)
                : fmtDate(asset.post_date)}
              {showCreator ? ` · ${fmtDate(asset.post_date)}` : ""}
            </p>
          </div>
          {asset.download_link && (
            <a
              href={asset.download_link}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-[#E7E2D2] text-[#6E695E] hover:bg-[#F9F7F2] hover:text-[#161513]"
              title="Open the Drive copy"
              aria-label="Open the Drive copy"
            >
              <Download size={13} aria-hidden />
            </a>
          )}
        </div>
      </div>
      {open && (
        <InstagramEmbedLightbox
          shortcode={shortcode ?? ""}
          label={label}
          mediaUrl={asset.post_media}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
