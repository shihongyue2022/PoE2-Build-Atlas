# Isolated PoB2 modifier calculations

`HeadlessWrapper.lua` is vendored unchanged from Path of Building Community for PoE2 v0.23.1:
https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/v0.23.1/src/HeadlessWrapper.lua

SHA-256: `39b47bc372ae2a96e8d719b1ae2a0c778218f2144b5225253cab0a1c0d9dfc63`.
It is covered by the upstream MIT license and attribution:
https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/v0.23.1/LICENSE.md

The local Windows runner uses the installed v0.23.1 LuaJIT DLL. No executable or game data is bundled here. Each calculation runs in a separate process with temporary input/output files. The wrapper is intercepted in memory to disable settings, shared item, and account-cache loading. UI, clipboard, external processes, and network callbacks are stubs. The original installation and saved builds are not written.

Rankings are leave-one-modifier-out differences for one explicitly selected skill under the imported PoB configuration, not additive shares of total build damage or a reconstructed combat rotation. Native item round trips and restoration are checked. For automatically regenerated rune/buff lines, the exact parsed native mod line is removed and the native item modifier list is rebuilt, keeping socket counts and other item facts fixed. Unsupported, non-isolatable, or skill-changing effects remain pending and are not assigned zero damage.

Item groups use a separate native calculation with all modifier-line lists cleared simultaneously and rebuilt, keeping the base, quality and socket counts fixed. Groups sort by this bundled loss, then individual lines by their own losses; these figures are not summed. Each item total carries the count of pending individual lines so the UI labels incomplete models explicitly. A failed round trip or a changed/disabled selected skill leaves the item total pending.
