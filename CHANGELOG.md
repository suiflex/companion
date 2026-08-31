# Changelog

## [1.5.1](https://github.com/suiflex/companion/compare/v1.5.0...v1.5.1) (2026-08-31)


### Bug Fixes

* **installer:** drop the control character from the picker test regex ([ebc5178](https://github.com/suiflex/companion/commit/ebc5178f876317e793da6d148d3a285030d18d95))
* **installer:** fetch the picker module in both bootstraps ([4a8c456](https://github.com/suiflex/companion/commit/4a8c45694709bfd6738fb1515cb09ccc3148c08d))
* **installer:** stop the browser picker walking down the screen ([ea40948](https://github.com/suiflex/companion/commit/ea409483ef9ca8f4b8ca63ddd1bac7dee03a08b3))


## [1.5.0](https://github.com/suiflex/companion/compare/v1.4.0...v1.5.0) (2026-08-31)


### Features

* **ai:** list the models a provider actually serves ([fbe1bbb](https://github.com/suiflex/companion/commit/fbe1bbba90547ed6206465e1875c15d727d92499))
* **extension:** offer model choices and keep each provider's setup ([e6cabea](https://github.com/suiflex/companion/commit/e6cabea6e094ec1d6cb0c1069e6b17daae47d46b))
* **installer:** add a PowerShell bootstrap for Windows ([53818a1](https://github.com/suiflex/companion/commit/53818a1d1a5382c3a4e514db1d7dd33eef926f7e))
* **shared:** remember model and base URL per provider ([39bfb10](https://github.com/suiflex/companion/commit/39bfb10e45bd1042b1889f24f9facb8ba16f33d7))
* add companion curl bootstrap installer ([5adcc93](https://github.com/suiflex/companion/commit/5adcc93d8ca719458cd22d70c9454b6a85deea66))
* add companion terminal installer CLI ([6ffe5b6](https://github.com/suiflex/companion/commit/6ffe5b6ca38fa28c87b66c30d858fb780dcfe1d2))


### Bug Fixes

* **ai:** associate a user-supplied Code Assist project before trusting it ([41e98d3](https://github.com/suiflex/companion/commit/41e98d3867f6cfc396c384947f2b9f852f0cc2dc))
* **ai:** stop Code Assist sign-in failing on an onboarded account ([461ae8b](https://github.com/suiflex/companion/commit/461ae8b3975a120ebe227bf11a897c406cbb1ea9))
* **brand:** widen logo viewBox so the wordmark is not clipped ([c3dcca7](https://github.com/suiflex/companion/commit/c3dcca7f9cc470e9f5b05c36b6908ce5ef131d0c))
* **extension:** keep the model list matched to the selected provider ([5cffe2d](https://github.com/suiflex/companion/commit/5cffe2d92bc700cf7e21d5249448921ba0f3b97e))
* **installer:** find the per-user Chromium installs on Windows ([fa55e6e](https://github.com/suiflex/companion/commit/fa55e6ea0923a70b2722cb0f74d936d6bbeb3bb8))
* satisfy eslint in docs probe/gate scripts ([d7b1bd7](https://github.com/suiflex/companion/commit/d7b1bd753471fe52a5f3f8de8add48cdfec14119))
* satisfy eslint in terminal installer CLI ([7234688](https://github.com/suiflex/companion/commit/7234688f8bc74bc6b03dc66f57f0cd6e78a58da3))


## [1.4.0](https://github.com/suiflex/companion/compare/v1.3.0...v1.4.0) (2026-08-28)


### Features

* **ai:** sign in with ChatGPT or Google instead of pasting a key ([7fc7cb6](https://github.com/suiflex/companion/commit/7fc7cb63d4d29edad05539690d06272cb44fa595))
* **extension:** connect ChatGPT and Google accounts from settings ([34e436d](https://github.com/suiflex/companion/commit/34e436d76e0a7b72e6ef00211a209fa2b14a8aaf))
* **shared:** carry subscription sign-in tokens in settings ([8c84435](https://github.com/suiflex/companion/commit/8c84435bf8b796bd338c57e3ec5370f17a7a3663))
* brand mark and icons in the Suiflex house style ([820b513](https://github.com/suiflex/companion/commit/820b51374a36a4265d787b76147f1872f0143f3c))


## [1.3.0](https://github.com/suiflex/companion/compare/v1.1.0...v1.3.0) (2026-08-26)


### Features

* local knowledge base (SQLite+FTS5), MCP bridge, integrations ([71b76a4](https://github.com/suiflex/companion/commit/71b76a4a707f6458b57971135a19569758e378a9))
* self-hosted sync server, two-way tracker status, speaker diarization ([0fca148](https://github.com/suiflex/companion/commit/0fca148355fcff462bfc7979fd3283ce80de66ac))


## [1.1.0](https://github.com/suiflex/companion/compare/v1.0.2...v1.1.0) (2026-07-13)


### Features

* transcript cleanup, advanced docgen, on-demand diagrams + robustness ([7a91c5e](https://github.com/suiflex/companion/commit/7a91c5e9030c67b13f98837b8215d68dfa23982f))


## [1.0.2](https://github.com/suiflex/companion/compare/v1.0.1...v1.0.2) (2026-07-13)


### Bug Fixes

* sidebar reorders constantly with concurrent live meetings ([d73a808](https://github.com/suiflex/companion/commit/d73a808a6c2c00b6dfbe21137e42fe7928be914d))


## [1.0.1](https://github.com/suiflex/companion/compare/v1.0.0...v1.0.1) (2026-07-13)


### Bug Fixes

* transcripts from concurrent meetings merged into one ([15fe37b](https://github.com/suiflex/companion/commit/15fe37b91fa684e093bee62eca1d61924c17d32d))


## 1.0.0 (2026-07-13)


### Features

* capture Google Meet captions and turn them into AI notes ([11e2ac6](https://github.com/suiflex/companion/commit/11e2ac693fd8582a2d1b03a21207e2c398fcd0f5))
