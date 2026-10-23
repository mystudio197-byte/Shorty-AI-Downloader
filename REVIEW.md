# Shorty Studio development review

The existing GitHub Pages deployment remains unchanged. Changes are prepared on `development/shorty-studio`.

## Implemented

Responsive dashboard; IndexedDB video library with thumbnails, search and source filters; multiple local video imports; save original file; remove with one-step undo; trim preview; local export at source size or a capped 480p/720p/1080p; mute export; export cancellation; authorized Facebook Page picker and imports via backend; privacy and data deletion instructions.

No subscriptions, advertising, cloud storage, unauthorized Reel downloads, or paid services were enabled.

## Export limitations

Export uses the single-thread FFmpeg WebAssembly engine in a dedicated worker, producing H.264/AAC MP4 cuts. The engine is loaded locally (about 32 MB on first use); no uploaded video is transmitted for editing. Resolution does not upscale the source. Exports have a five-minute processing timeout and a 100 MB output limit. Large videos may exceed browser memory; use a shorter clip or lower resolution. Sources remain unchanged. Library content is browser/device-local and may be removed by clearing site data or browser storage eviction.

Third-party engine: `@ffmpeg/core` 0.12.10, GPL-2.0-or-later. See `vendor/ffmpeg/NOTICE.md` and the included license. Review corresponding-source distribution requirements before publication.

## Verification

`npm test` checks trim bounds, dimensions, and filename handling. `npm run check` checks syntax. Browser QA uses a generated five-second synthetic video with a sine-wave audio track, no personal media. Actual Facebook integration requires approved backend deployment and server secret configuration before an end-to-end production connection can be tested.

## Publishing gate

The existing `.github/workflows/static.yml` deploys pushes to `main`. Do not merge or manually run it without the owner's approval. Render also deploys `main`. Development branches must remain separate from production. Review the backend `DEVELOPMENT.md` for the exact callback, env template, and release checklist.

The privacy copy describes this implementation; the owner should add a public contact method before general public launch.

## Browser QA results

- Import generated MP4: passed; thumbnail and duration populated.
- Refresh persistence: passed; IndexedDB content remained.
- Trim 1.0–3.0 seconds: passed; downloaded H.264/AAC MP4 verified with ffprobe at exactly 2.000000 seconds, 640×360 with no upscaling.
- Mute export: passed; downloaded MP4 had a video stream and no audio stream, exactly 2.000000 seconds.
- Invalid reversed trim range: rejected with a clear error.
- Search with no matches: correct empty state.
- All 10 automated tests passed again after the export change.
- End-to-end Facebook OAuth/import and mobile-device QA remain pending. Meta API permissions and video access were verified earlier in Graph API Explorer; the new production backend code has not been deployed.
