import { KMCallout, KMHeader, KMList, KMSection } from "../km-shell";

export default function PostAssetsKM() {
  return (
    <>
      <KMHeader
        title="Post Assets"
        subtitle="A visual library of every posted reel. Browse by Campaign → Creator, search the whole archive, and open any asset in a focused detail panel."
      />

      <KMSection tag="Where the videos come from">
        <KMList>
          <li>
            When a posting is submitted, CreatorHub automatically saves a
            durable copy of the reel and its cover image to our own storage
            (Instagram&apos;s links expire within days; these copies don&apos;t).
            Every video here is that saved copy — nothing needs to be uploaded
            manually.
          </li>
          <li>
            The same submit also files the video into the collab&apos;s Google
            Drive folder — the <strong>download button</strong> on each card
            opens that Drive copy.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Folders & navigation">
        <KMList>
          <li>
            <strong>Campaign folders</strong> (left rail or the folder cards) →{" "}
            <strong>creator folders</strong> (avatar, name, video count) →{" "}
            <strong>the creator&apos;s videos</strong>. The breadcrumb at the
            top jumps back up a level.
          </li>
          <li>
            <strong>Search</strong> cuts across every folder at once — creator
            name, handle, POST ID, collab or campaign ID.
          </li>
          <li>
            Inside a creator folder, switch between <strong>grid</strong> and
            <strong> list</strong> view, then sort by newest or oldest post.
          </li>
          <li>
            A creator with one asset opens the detail panel directly. Creator
            folders with multiple assets still open the folder view first. The
            single-asset card uses the full 9:16 preview so the reel never
            leaves an empty rail beside it.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Playback">
        <KMList>
          <li>
            Grid videos <strong>auto-play silently while on screen</strong>{" "}
            (they pause the moment they scroll out of view, so nothing keeps
            playing in the background).
          </li>
          <li>
            On smaller screens, creator and media cards keep the shared
            two-column workspace rhythm used across the app.
          </li>
          <li>
            <strong>Click a video to open the detail panel</strong> with full
            playback, metadata, previous/next navigation, and links to
            Instagram and the Drive copy.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Access & data">
        <KMList>
          <li>Read-only; every logged-in team member can browse.</li>
          <li>
            Only real posted work appears (Posted / Delivered, test rows
            excluded). New posts show up here automatically right after the
            posting form is submitted.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Use Post Assets when you need the actual video file or a quick visual
        sweep of everything a campaign has produced — no digging through
        Instagram links or Drive folders.
      </KMCallout>
    </>
  );
}
