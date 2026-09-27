# Source and implementation notes

Primary article: Movez (@0xMovez), “How to build motion design studio with Opus 5.5 (Full-course)”, 27 September 2026.
- https://x.com/0xmovez/status/2104216919033192746
- https://x.com/i/article/2104196832637210624

Read on 28 September 2026 through the public FxTwitter article representation after X returned HTTP 403. The full article body and embedded code blocks were available. Linked example videos were not independently watched; their popularity, costs, model performance and production-time claims are not validated or adopted as guarantees. This package is an operational adaptation with original supporting code, not a republication of the course.

Coverage: (1) time-based rendering, (2) local runtime, (3) showreel direction, (4) real product assets, (5) references/style guide, (6) state specification, (7) renderer, (8) spring tracks, (9) music/beats/SFX, (10) director brief and long productions, (11) visual critique, (12) responsive exports and reusable packaging. The article's marketing/service-price claims are outside the production skill.

Corrections and deliberate adaptations:
- Correct over-damped solution instead of treating every damping ratio above one as critical.
- Wrapped time alone cannot make an end state meet the start state.
- Estimated beats[::4] are not detected musical downbeats.
- Raw pixels at nonsequential times/reload test state independence more directly than hashing encoded MP4s.
- Contact sheets paginate the full film; no silent truncation after the first tile page.
- Real subprocess exit checks, timeouts, isolated render outputs, local asset readiness and HTTP module loading.
- Synthetic music is included; an SFX file alone is not a score.
- No fixed paid model, no mandatory API key, no copied approval timeout, no mandatory delegation, no arbitrary infinite score loop.

Technical API references consulted:
- https://playwright.dev/docs/api/class-page#page-evaluate
- https://ffmpeg.org/ffmpeg-filters.html#tmix
- https://ffmpeg.org/ffmpeg-filters.html#loudnorm

Local execution evidence: [validation](validation.md).
