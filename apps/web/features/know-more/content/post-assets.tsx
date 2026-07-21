import { KMCallout, KMHeader, KMList, KMSection } from "../km-shell";

export default function PostAssetsKM() {
  return (
    <>
      <KMHeader
        title="Post Assets"
        subtitle="A folder-style library of every posted reel — browse by Campaign → Creator, preview videos right in the grid, and open any of them in the full player."
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
            <strong>Click a video to open the player popup</strong> — full
            playback with sound and controls, plus an &quot;Open on
            Instagram&quot; link to the live post.
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
