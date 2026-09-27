# Review that produces fixes

Review sampled frames from every shot plus short sequences spanning each major transition. The QA command makes contact pages spanning the entire film (not only the first 15 seconds), 360 px phone pages, and an action strip. Use `--action-time` to inspect each risky event. Contact sheets alone cannot establish pacing or sync; watch/listen when tools support it, otherwise mark those dimensions unverified.

Use an evidence table in `docs/review.md`:

| Time/range | Dimension | Observed defect | Change | Verification |
|---|---|---|---|---|
| 2.30–2.48 s | Readability | Old label crosses new number | Exit label 6 frames earlier | Re-render range and inspect strip |

Dimensions: opening hook, phone-size readability, hierarchy/composition, motion continuity, variety appropriate to the story, brand/factual fidelity, sound synchronization and finishing. Optional scores are subjective diagnostics, not proof of quality. “8/10” without a visual observation is not an acceptance test.

Look for:
- Text overlap, clipping, stale words and accidental raster blur.
- Camera motion that loses the subject; offscreen cursor or unreadably small UI.
- Unmotivated pauses and frenetic cuts that prevent reading.
- Abrupt spring restarts, jump cuts from incomplete timeline coverage, carry-over transforms.
- Misaligned hits, clipping, weak music bed, voice masked by score.
- Loop seam jumps, mismatched velocity and cut-off audio tails.
- Brand assets distorted or claims unsupported by the brief.

Validate fixes at the same timestamps, then render the full timeline to catch integration problems. Default to at most three purposeful review rounds. If the available assets/renderer cannot meet the brief, state the limitation and deliver inspectable progress; don't silently present it as final.

`determinism.json` checks repeated raw pixel hashes at the same time after out-of-order seeks and a page reload. It checks this runtime/environment, not cross-platform font/GPU reproducibility. Technical QA checks decoding, stream size, fps, frame count, duration and requested audio. Record the render command and keep `package-lock.json` with the project.

For a loop, inspect the last few frames, frame zero and the following frames in `loop-check.mp4`; never demand that the last encoded frame equal the first exactly. In a continuous periodic motion they are one frame interval apart. What must connect is the state and derivative across the boundary.
