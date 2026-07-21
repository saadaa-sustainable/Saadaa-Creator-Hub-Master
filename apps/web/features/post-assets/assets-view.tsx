"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clapperboard,
  Download,
  ExternalLink,
  Folder,
  FolderOpen,
  Grid2X2,
  Home,
  Instagram,
  LayoutList,
  Lightbulb,
  Play,
  Search,
  Users,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { extractShortcode } from "@/lib/instagram-shortcode";
import type { CampaignFolder, CreatorFolder, PostAsset } from "./queries";

type ViewMode = "grid" | "list";
type SortOrder = "newest" | "oldest";

type AssetItem = {
  asset: PostAsset;
  folder: CreatorFolder;
  campaign: CampaignFolder;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "Not dated";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "Not dated";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function campaignLabel(campaign: CampaignFolder): string {
  return campaign.campaign_name ?? campaign.campaign_id;
}

function assetLabel(asset: PostAsset): string {
  return asset.post_id_short ?? asset.post_id;
}

function collectAssets(campaigns: CampaignFolder[]): AssetItem[] {
  return campaigns.flatMap((campaign) =>
    campaign.creators.flatMap((folder) =>
      folder.assets.map((asset) => ({ asset, folder, campaign })),
    ),
  );
}

function sortAssets(items: AssetItem[], sort: SortOrder): AssetItem[] {
  return [...items].sort((a, b) => {
    const aDate = a.asset.post_date ?? "";
    const bDate = b.asset.post_date ?? "";
    return sort === "newest"
      ? bDate.localeCompare(aDate)
      : aDate.localeCompare(bDate);
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
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [directPreviewCreatorId, setDirectPreviewCreatorId] = useState<string | null>(null);

  const allAssets = useMemo(() => collectAssets(campaigns), [campaigns]);
  const activeCampaign =
    campaigns.find((campaign) => campaign.campaign_id === campaignId) ?? null;
  const activeCreator =
    activeCampaign?.creators.find((folder) => folder.username === creatorId) ??
    null;
  const needle = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!needle) return null;
    return allAssets.filter(({ asset, folder, campaign }) =>
      [
        folder.username,
        folder.inf_name,
        assetLabel(asset),
        asset.collab_id,
        asset.campaign_id,
        campaign.campaign_name,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ")
        .includes(needle),
    );
  }, [allAssets, needle]);

  const currentItems = useMemo(() => {
    if (searchResults) return sortAssets(searchResults, sort);
    if (activeCreator && activeCampaign) {
      return sortAssets(
        activeCreator.assets.map((asset) => ({
          asset,
          folder: activeCreator,
          campaign: activeCampaign,
        })),
        sort,
      );
    }
    return [];
  }, [activeCampaign, activeCreator, searchResults, sort]);

  const directPreviewItems = useMemo(() => {
    if (!directPreviewCreatorId || !activeCampaign) return null;
    const folder = activeCampaign.creators.find(
      (creator) => creator.username === directPreviewCreatorId,
    );
    if (!folder) return null;
    return sortAssets(
      folder.assets.map((asset) => ({ asset, folder, campaign: activeCampaign })),
      sort,
    );
  }, [activeCampaign, directPreviewCreatorId, sort]);

  const drawerItems = directPreviewItems ?? currentItems;
  const selectedItem =
    selectedIndex === null ? null : drawerItems[selectedIndex] ?? null;
  const latestDate = allAssets.reduce<string | null>((latest, item) => {
    if (!item.asset.post_date) return latest;
    return !latest || item.asset.post_date > latest ? item.asset.post_date : latest;
  }, null);

  const clearSelection = () => {
    setSelectedIndex(null);
    setDirectPreviewCreatorId(null);
  };
  const goRoot = () => {
    setCampaignId(null);
    setCreatorId(null);
    clearSelection();
  };
  const openCampaign = (nextCampaignId: string) => {
    setCampaignId(nextCampaignId);
    setCreatorId(null);
    clearSelection();
  };
  const openCreator = (username: string) => {
    const folder = activeCampaign?.creators.find(
      (creator) => creator.username === username,
    );
    if (folder?.assets.length === 1) {
      setDirectPreviewCreatorId(username);
      setSelectedIndex(0);
      return;
    }
    setCreatorId(username);
    clearSelection();
  };

  const title = searchResults
    ? "Search results"
    : activeCreator
      ? `@${activeCreator.username}`
      : activeCampaign
        ? campaignLabel(activeCampaign)
        : "Campaign archive";
  const description = searchResults
    ? `${searchResults.length} matching ${searchResults.length === 1 ? "asset" : "assets"} across the library.`
    : activeCreator
      ? `${activeCreator.assets.length} ${activeCreator.assets.length === 1 ? "video" : "videos"} from this creator.`
      : activeCampaign
        ? `${activeCampaign.assetCount} ${activeCampaign.assetCount === 1 ? "video" : "videos"} from ${activeCampaign.creators.length} ${activeCampaign.creators.length === 1 ? "creator" : "creators"}.`
        : "Choose a campaign to browse its creators and posted work.";

  return (
    <div className="post-assets-stage">
      <section className="assets-hero" aria-labelledby="post-assets-title">
        <div className="assets-hero__wash" aria-hidden />
        <div className="assets-hero__copy">
          <div className="assets-hero__eyebrow">
            <span className="assets-hero__mark" aria-hidden>
              <Clapperboard size={16} />
            </span>
            <span>Post Assets</span>
            <span className="assets-hero__live">Live library</span>
          </div>
          <h1 id="post-assets-title">The work is ready when you are.</h1>
          <p>
            Browse posted videos by campaign or creator, then move from preview
            to Instagram or Drive without losing the context around the asset.
          </p>
          <button
            type="button"
            className="assets-help-button"
            data-know-more="post-assets"
          >
            <Lightbulb size={14} aria-hidden />
            How this library works
          </button>
        </div>
        <div className="assets-hero__stats" aria-label="Library summary">
          <HeroStat label="Posted videos" value={totalAssets} />
          <HeroStat label="Creators" value={totalCreators} />
          <HeroStat label="Campaigns" value={campaigns.length} />
          <div className="assets-hero__date">
            <span>Latest post</span>
            <strong>{fmtDateShort(latestDate)}</strong>
          </div>
        </div>
      </section>

      <section className="assets-toolbar" aria-label="Asset controls">
        <nav className="assets-breadcrumb" aria-label="Folder path">
          <button
            type="button"
            onClick={goRoot}
            className={cn(!activeCampaign && "is-current")}
          >
            All assets
          </button>
          {activeCampaign && (
            <>
              <ChevronRight size={14} aria-hidden />
              <button
                type="button"
                onClick={() => {
                  setCreatorId(null);
                  clearSelection();
                }}
                className={cn(!activeCreator && "is-current")}
              >
                {activeCampaign.campaign_id}
              </button>
            </>
          )}
          {activeCreator && (
            <>
              <ChevronRight size={14} aria-hidden />
              <span className="is-current">@{activeCreator.username}</span>
            </>
          )}
        </nav>
        <label className="assets-search">
          <Search size={16} aria-hidden />
          <span className="sr-only">Search assets</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search creator, POST ID, collab or campaign"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </label>
      </section>

      <div className="assets-browser">
        <aside className="assets-rail" aria-label="Campaign folders">
          <div className="assets-rail__head">
            <div>
              <span>Library</span>
              <strong>Campaign folders</strong>
            </div>
            <span className="assets-rail__count">{campaigns.length}</span>
          </div>
          <button
            type="button"
            onClick={goRoot}
            className={cn("assets-rail__item", !activeCampaign && "is-active")}
          >
            <span className="assets-rail__icon">
              <Home size={15} aria-hidden />
            </span>
            <span className="assets-rail__label">All campaigns</span>
            <strong>{totalAssets}</strong>
          </button>
          <div className="assets-rail__list">
            {campaigns.map((campaign) => {
              const active = campaign.campaign_id === campaignId;
              return (
                <button
                  key={campaign.campaign_id}
                  type="button"
                  onClick={() => openCampaign(campaign.campaign_id)}
                  className={cn("assets-rail__item", active && "is-active")}
                  title={campaignLabel(campaign)}
                >
                  <span className="assets-rail__icon">
                    {active ? (
                      <FolderOpen size={15} aria-hidden />
                    ) : (
                      <Folder size={15} aria-hidden />
                    )}
                  </span>
                  <span className="assets-rail__label">
                    {campaign.campaign_id}
                  </span>
                  <strong>{campaign.assetCount}</strong>
                </button>
              );
            })}
          </div>
          <div className="assets-rail__footer">
            <Users size={14} aria-hidden />
            <span>{totalCreators} creators in this library</span>
          </div>
        </aside>

        <main className="assets-main">
          <div className="assets-main__head">
            <div>
              <span className="assets-main__eyebrow">
                {searchResults ? "Across the library" : "Browse the archive"}
              </span>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            {(activeCreator || searchResults) && currentItems.length > 0 && (
              <div className="assets-main__controls">
                <label className="assets-sort">
                  <span>Sort</span>
                  <select
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as SortOrder)
                    }
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>
                <div className="assets-view-toggle" aria-label="View mode">
                  <button
                    type="button"
                    className={cn(viewMode === "grid" && "is-active")}
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                    aria-pressed={viewMode === "grid"}
                  >
                    <Grid2X2 size={15} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={cn(viewMode === "list" && "is-active")}
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                    aria-pressed={viewMode === "list"}
                  >
                    <LayoutList size={15} aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </div>

          {searchResults ? (
            searchResults.length === 0 ? (
              <EmptyState
                title="Nothing matched that search"
                text="Try a creator name, handle, POST ID, collab ID or campaign ID."
                action={query ? () => setQuery("") : undefined}
              />
            ) : (
              <AssetResults
                items={currentItems}
                viewMode={viewMode}
                onOpen={(index) => setSelectedIndex(index)}
                showCreator
                showCampaign
              />
            )
          ) : activeCampaign === null ? (
            campaigns.length === 0 ? (
              <EmptyState
                title="Your library is waiting for its first post"
                text="Posted and Delivered work appears here automatically after the posting flow saves a durable copy."
              />
            ) : (
              <CampaignGrid campaigns={campaigns} onOpen={openCampaign} />
            )
          ) : activeCreator === null ? (
            <CreatorGrid creatorFolders={activeCampaign.creators} onOpen={openCreator} />
          ) : currentItems.length === 0 ? (
            <EmptyState
              title="No media in this folder"
              text="This creator has no saved video or cover available in the selected campaign."
            />
          ) : (
            <AssetResults
              items={currentItems}
              viewMode={viewMode}
              onOpen={(index) => setSelectedIndex(index)}
            />
          )}
        </main>
      </div>

      {selectedItem && selectedIndex !== null && (
        <AssetDetailDrawer
          item={selectedItem}
          onClose={clearSelection}
          onPrevious={
            selectedIndex > 0
              ? () => setSelectedIndex(selectedIndex - 1)
              : undefined
          }
          onNext={
            selectedIndex < drawerItems.length - 1
              ? () => setSelectedIndex(selectedIndex + 1)
              : undefined
          }
          position={selectedIndex + 1}
          total={drawerItems.length}
        />
      )}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="assets-hero__stat">
      <strong>{value.toLocaleString("en-IN")}</strong>
      <span>{label}</span>
    </div>
  );
}

function CampaignGrid({
  campaigns,
  onOpen,
}: {
  campaigns: CampaignFolder[];
  onOpen: (campaignId: string) => void;
}) {
  return (
    <div className="assets-campaign-grid">
      {campaigns.map((campaign, index) => (
        <button
          key={campaign.campaign_id}
          type="button"
          onClick={() => onOpen(campaign.campaign_id)}
          className={cn(
            "assets-campaign-card",
            index === 0 && "assets-campaign-card--featured",
          )}
        >
          <PreviewMosaic
            assets={campaign.creators.flatMap((folder) => folder.assets).slice(0, 4)}
            label={campaignLabel(campaign)}
          />
          <span className="assets-campaign-card__body">
            <span className="assets-campaign-card__title">
              <span>{campaign.campaign_id}</span>
              <ChevronRight size={17} aria-hidden />
            </span>
            <span className="assets-campaign-card__name">
              {campaign.campaign_name ?? "Campaign archive"}
            </span>
            <span className="assets-campaign-card__meta">
              {campaign.creators.length} {campaign.creators.length === 1 ? "creator" : "creators"}
              <span aria-hidden>/</span>
              {campaign.assetCount} {campaign.assetCount === 1 ? "video" : "videos"}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function CreatorGrid({
  creatorFolders,
  onOpen,
}: {
  creatorFolders: CreatorFolder[];
  onOpen: (username: string) => void;
}) {
  return (
    <div className="assets-creator-grid">
      {creatorFolders.map((folder, index) => (
        <button
          key={folder.username}
          type="button"
          onClick={() => onOpen(folder.username)}
          className="assets-creator-card"
        >
          <PreviewMosaic
            assets={folder.assets.slice(0, 3)}
            label={`@${folder.username}`}
            compact
            playVideos
          />
          <span className="assets-creator-card__body">
            <span className="assets-creator-card__topline">
              <Avatar
                src={folder.profile_pic}
                username={folder.username}
                name={folder.inf_name}
                size={34}
                interactive={false}
              />
              <span className="assets-creator-card__arrow" aria-hidden>
                <ChevronRight size={15} />
              </span>
            </span>
            <span className="assets-creator-card__name">
              {folder.inf_name ?? `@${folder.username}`}
            </span>
            <span className="assets-creator-card__handle">
              @{folder.username}
            </span>
            <span className="assets-creator-card__meta">
              {folder.assets.length} {folder.assets.length === 1 ? "video" : "videos"}
              <span aria-hidden>/</span>
              {index + 1} of {creatorFolders.length}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function PreviewMosaic({
  assets,
  label,
  compact = false,
  playVideos = false,
}: {
  assets: PostAsset[];
  label: string;
  compact?: boolean;
  playVideos?: boolean;
}) {
  return (
    <span className={cn("assets-mosaic", compact && "assets-mosaic--compact")}>
      {assets.length === 0 ? (
        <span className="assets-mosaic__empty">
          <Clapperboard size={22} aria-hidden />
        </span>
      ) : (
        assets.map((asset) => (
          <span key={asset.post_id} className="assets-mosaic__tile">
            {playVideos && asset.post_media ? (
              <AssetVideoPreview asset={asset} label={assetLabel(asset)} />
            ) : asset.post_thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.post_thumbnail} alt="" loading="lazy" />
            ) : (
              <span className="assets-mosaic__fallback" aria-hidden>
                <Video size={18} />
              </span>
            )}
          </span>
        ))
      )}
      <span className="sr-only">Preview of {label}</span>
    </span>
  );
}

function AssetResults({
  items,
  viewMode,
  onOpen,
  showCreator = false,
  showCampaign = false,
}: {
  items: AssetItem[];
  viewMode: ViewMode;
  onOpen: (index: number) => void;
  showCreator?: boolean;
  showCampaign?: boolean;
}) {
  if (viewMode === "list") {
    return (
      <div className="assets-list" role="list">
        {items.map((item, index) => (
          <AssetListRow
            key={item.asset.post_id}
            item={item}
            onOpen={() => onOpen(index)}
            showCreator={showCreator}
            showCampaign={showCampaign}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="assets-media-grid">
      {items.map((item, index) => (
        <AssetMediaCard
          key={item.asset.post_id}
          item={item}
          onOpen={() => onOpen(index)}
          showCreator={showCreator}
          showCampaign={showCampaign}
        />
      ))}
    </div>
  );
}

function AssetMediaCard({
  item,
  onOpen,
  showCreator,
  showCampaign,
}: {
  item: AssetItem;
  onOpen: () => void;
  showCreator?: boolean;
  showCampaign?: boolean;
}) {
  const { asset, folder, campaign } = item;
  const canOpen = Boolean(asset.post_media || asset.post_thumbnail || asset.post_link);
  return (
    <article className="assets-media-card">
      <button
        type="button"
        onClick={onOpen}
        disabled={!canOpen}
        className="assets-media-card__preview"
        aria-label={`Open ${assetLabel(asset)} preview`}
      >
        <AssetVideoPreview asset={asset} label={assetLabel(asset)} />
        {canOpen && (
          <span className="assets-media-card__play" aria-hidden>
            <Play size={15} fill="currentColor" />
          </span>
        )}
      </button>
      <div className="assets-media-card__footer">
        <div className="assets-media-card__copy">
          <strong>{showCreator ? `@${folder.username}` : assetLabel(asset)}</strong>
          <span>
            {showCampaign ? campaign.campaign_id : asset.deliverable_type ?? "Posted video"}
            <span aria-hidden>/</span>
            {showCreator ? assetLabel(asset) : fmtDateShort(asset.post_date)}
          </span>
        </div>
        {asset.download_link && (
          <a
            href={asset.download_link}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="assets-icon-button"
            title="Open Drive copy"
            aria-label={`Open Drive copy for ${assetLabel(asset)}`}
          >
            <Download size={14} aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}

function AssetListRow({
  item,
  onOpen,
  showCreator,
  showCampaign,
}: {
  item: AssetItem;
  onOpen: () => void;
  showCreator?: boolean;
  showCampaign?: boolean;
}) {
  const { asset, folder, campaign } = item;
  return (
    <article className="assets-list-row" role="listitem">
      <button
        type="button"
        className="assets-list-row__thumb"
        onClick={onOpen}
        aria-label={`Open ${assetLabel(asset)} preview`}
      >
        <AssetVideoPreview asset={asset} label={assetLabel(asset)} />
        <span className="assets-media-card__play" aria-hidden>
          <Play size={13} fill="currentColor" />
        </span>
      </button>
      <button type="button" className="assets-list-row__identity" onClick={onOpen}>
        <strong>{assetLabel(asset)}</strong>
        <span>{showCreator ? `@${folder.username}` : campaign.campaign_id}</span>
      </button>
      <span className="assets-list-row__detail">
        {showCampaign ? campaignLabel(campaign) : asset.deliverable_type ?? "Posted video"}
      </span>
      <span className="assets-list-row__detail">{fmtDate(asset.post_date)}</span>
      {asset.download_link ? (
        <a
          href={asset.download_link}
          target="_blank"
          rel="noreferrer"
          className="assets-icon-button"
          title="Open Drive copy"
          aria-label={`Open Drive copy for ${assetLabel(asset)}`}
        >
          <Download size={14} aria-hidden />
        </a>
      ) : (
        <span className="assets-list-row__empty-action" aria-hidden />
      )}
    </article>
  );
}

function AssetVideoPreview({
  asset,
  label,
}: {
  asset: PostAsset;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !asset.post_media) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [asset.post_media]);

  if (asset.post_media) {
    return (
      <video
        ref={videoRef}
        src={asset.post_media}
        poster={asset.post_thumbnail ?? undefined}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        aria-label={label}
      />
    );
  }
  if (asset.post_thumbnail) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.post_thumbnail} alt={label} loading="lazy" />;
  }
  return (
    <span className="assets-media-card__fallback" aria-label={label}>
      <Clapperboard size={24} aria-hidden />
    </span>
  );
}

function AssetDetailDrawer({
  item,
  onClose,
  onPrevious,
  onNext,
  position,
  total,
}: {
  item: AssetItem;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position: number;
  total: number;
}) {
  const { asset, folder, campaign } = item;
  const shortcode = extractShortcode(asset.post_link ?? "");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrevious?.();
      if (event.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, onNext, onPrevious]);

  return createPortal(
    <div className="assets-drawer-backdrop" onClick={onClose}>
      <aside
        className="assets-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${assetLabel(asset)}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="assets-drawer__head">
          <div>
            <span className="assets-drawer__eyebrow">
              <Instagram size={13} aria-hidden />
              Posted asset
            </span>
            <h2>{assetLabel(asset)}</h2>
            <p>@{folder.username}</p>
          </div>
          <button type="button" className="assets-icon-button" onClick={onClose} aria-label="Close preview">
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="assets-drawer__body">
          <div className="assets-drawer__media">
            {asset.post_media ? (
              <video
                src={asset.post_media}
                poster={asset.post_thumbnail ?? undefined}
                controls
                autoPlay
                playsInline
              />
            ) : asset.post_thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.post_thumbnail} alt={assetLabel(asset)} />
            ) : shortcode ? (
              <iframe
                src={`https://www.instagram.com/p/${shortcode}/embed/captioned/`}
                title={`Instagram preview for ${assetLabel(asset)}`}
                loading="lazy"
                scrolling="no"
                allow="encrypted-media; clipboard-write; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <div className="assets-drawer__no-media">
                <Clapperboard size={28} aria-hidden />
                <span>No preview available</span>
              </div>
            )}
          </div>

          <div className="assets-drawer__actions">
            {asset.post_link && (
              <a href={asset.post_link} target="_blank" rel="noreferrer" className="assets-drawer__action assets-drawer__action--primary">
                <ExternalLink size={15} aria-hidden />
                Open Instagram
              </a>
            )}
            {asset.download_link && (
              <a href={asset.download_link} target="_blank" rel="noreferrer" className="assets-drawer__action">
                <Download size={15} aria-hidden />
                Open Drive copy
              </a>
            )}
          </div>

          <dl className="assets-drawer__details">
            <DetailRow label="Campaign" value={campaignLabel(campaign)} />
            <DetailRow label="Creator" value={`@${folder.username}`} />
            <DetailRow label="Collab ID" value={asset.collab_id ?? "Not assigned"} />
            <DetailRow label="Posted" value={fmtDate(asset.post_date)} />
            <DetailRow label="Format" value={asset.deliverable_type ?? "Video"} />
          </dl>
        </div>

        <footer className="assets-drawer__foot">
          <button type="button" onClick={onPrevious} disabled={!onPrevious} className="assets-drawer__nav">
            <ArrowLeft size={15} aria-hidden />
            Previous
          </button>
          <span>{position} / {total}</span>
          <button type="button" onClick={onNext} disabled={!onNext} className="assets-drawer__nav">
            Next
            <ArrowRight size={15} aria-hidden />
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: () => void;
}) {
  return (
    <div className="assets-empty-state">
      <span className="assets-empty-state__icon" aria-hidden>
        <Clapperboard size={22} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button type="button" onClick={action} className="assets-empty-state__action">
          Clear search
        </button>
      )}
    </div>
  );
}
