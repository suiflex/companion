# Changelog

## [1.10.0](https://github.com/suiflex/companion/compare/v1.9.0...v1.10.0) (2026-09-03)


### Features

* **installer:** install Companion Desktop from the curl installer ([b1b488c](https://github.com/suiflex/companion/commit/b1b488cdf6c2d375c5d25ba10ddea2e9814dc6f4))
* one release stream, stable desktop asset names, desktop-first installer ([37d9032](https://github.com/suiflex/companion/commit/37d9032068699ae3dba43752b11e755cfdb35c56))


### Bug Fixes

* **installer:** match releases on the one shared tag ([5749807](https://github.com/suiflex/companion/commit/57498070d8a55243ce90643e394759944744aaab))

## [1.9.0](https://github.com/suiflex/companion/compare/v1.8.1...v1.9.0) (2026-09-03)


### Features

* **desktop:** check for updates and install them in place ([49cf7ec](https://github.com/suiflex/companion/commit/49cf7ecb9bd0d09d9e7c542cdbee4815a9ec1b6c))
* **desktop:** check for updates and install them in place ([ce6967b](https://github.com/suiflex/companion/commit/ce6967b9a1b8f424e2fac77394065fd8ecc3c0c1))
* **extension:** let users generate a MoM while the meeting runs ([78979ea](https://github.com/suiflex/companion/commit/78979ead6d344b88d5f6987f44f248e877d2ddeb))


### Bug Fixes

* **ci:** stop the updater manifest matching a signature as its bundle ([b14c1b3](https://github.com/suiflex/companion/commit/b14c1b317e07db9dc61920323e10e86be40b3bc1))
* **ci:** stop the updater manifest matching a signature as its bundle ([64d2e12](https://github.com/suiflex/companion/commit/64d2e128c9ee66a3530472e06d88d513c0946bc7))
* **extension:** keep Tanya history, and allow a MoM mid-meeting ([2047d9a](https://github.com/suiflex/companion/commit/2047d9a1d2be37537bee3ef0d41982bd0065ecd6))
* **extension:** stop the Tanya tab losing questions and answers ([f315b33](https://github.com/suiflex/companion/commit/f315b33f4218343d8dd2916a3e5509530a696ba0))
* recover the desktop release and harden its failure modes ([e540860](https://github.com/suiflex/companion/commit/e540860533106d8ca396fd5d07ce6bf45d85a368))
* **vault:** stop listNotes ordering test racing the clock ([bfcb6b8](https://github.com/suiflex/companion/commit/bfcb6b89ec6ca59ae560d98ad42488172e5b3be5))

## [1.8.1](https://github.com/suiflex/companion/compare/v1.8.0...v1.8.1) (2026-09-02)


### Bug Fixes

* **installer:** pick a release by product, not by whatever shipped last ([adba7d7](https://github.com/suiflex/companion/commit/adba7d71bf5c3c48bc832b475f66b65b73a95805))
* **release:** resolve the desktop extra-file relative to its package ([59c3386](https://github.com/suiflex/companion/commit/59c33864e4dccfd9d185e75f671fb45009fc89ab))
* unblock the first desktop release, and repair the README ([28c101c](https://github.com/suiflex/companion/commit/28c101c8ec420f2bf666ec28fc8492f64cdc2e11))

## [1.8.0](https://github.com/suiflex/companion/compare/v1.7.1...v1.8.0) (2026-09-02)


### Features

* **bridge:** deliver finished meetings to the desktop vault ([a5c1ba6](https://github.com/suiflex/companion/commit/a5c1ba679997f0e69e55a324f4e88118d6ce8a6f))
* **bridge:** wire extension to native host to vault ([9cf9e41](https://github.com/suiflex/companion/commit/9cf9e41892b196cdee64d6883d47941d5517a32c))
* **desktop:** add Companion Desktop, split the release lines, and make it testable ([ef0a730](https://github.com/suiflex/companion/commit/ef0a7304bd0d40e6101e7d2cec233662ea886138))
* **desktop:** add Rust vault IPC and WebView note editor ([fbe4d78](https://github.com/suiflex/companion/commit/fbe4d7870a89ea755fda7f0c293d70346ab5b3df))
* **desktop:** make the settings screen real ([051912b](https://github.com/suiflex/companion/commit/051912b2678a9195362d1bbd8c6143c005d8d8f5))
* **desktop:** scaffold Tauri 2 desktop workspace ([c6d4a85](https://github.com/suiflex/companion/commit/c6d4a8563be07ad523acfe3fbac29167ce3dcde5))
* **desktop:** wire FTS search into the note sidebar ([d0d7dc4](https://github.com/suiflex/companion/commit/d0d7dc4cc872e3162510967ca6527aa0c65fd565))
* **vault:** add native-messaging bridge handler ([37f17ed](https://github.com/suiflex/companion/commit/37f17ed03f42cbb1dc2c27a03c29207c2b8260d1))
* **vault:** add packages/vault with identity, notes and FTS index ([1f21861](https://github.com/suiflex/companion/commit/1f21861baed6eb2fba414e3d4760afb545cca792))


### Bug Fixes

* **bridge:** apply native host deliveries one at a time ([1f8706d](https://github.com/suiflex/companion/commit/1f8706dd67050241945b0fd0f88cf2688b1e8582))
* **vault:** guard an empty FTS match like the meeting store does ([0b4393d](https://github.com/suiflex/companion/commit/0b4393d723d3567db3db0548cae3b1103013c201))
* **vault:** key note files by session start, not just the day ([d1d4db8](https://github.com/suiflex/companion/commit/d1d4db8008fcac701b8862b3a3d74edf42b6928e))
* **vault:** point the transcript frontmatter at the sidecar it writes ([52ca5aa](https://github.com/suiflex/companion/commit/52ca5aad2a808470821c39569eee1e766d784195))
* **vault:** slug the date segment of a note path too ([1e1bb4e](https://github.com/suiflex/companion/commit/1e1bb4e9c4eee23a636d14c5c610889b48be7dd4))
* **vault:** treat only a leading heading as the note title ([7615902](https://github.com/suiflex/companion/commit/7615902c7c06b81ba912aed7598cd4d02f0aa878))


### Performance Improvements

* **desktop:** index the notes the refresh already read ([29ca90d](https://github.com/suiflex/companion/commit/29ca90d9b8f9c57d196038950cdf8c054f02bdcd))

## [1.7.1](https://github.com/suiflex/companion/compare/v1.7.0...v1.7.1) (2026-09-01)


### Bug Fixes

* **ai:** drop the port from requested origin patterns ([1d24417](https://github.com/suiflex/companion/commit/1d2441759c89b78a413763c0c11f9a548f00464d))
* **ai:** drop the port from requested origin patterns ([4aca706](https://github.com/suiflex/companion/commit/4aca706d3f147513cf5f12c528cd9aa07077d300))

## [1.7.0](https://github.com/suiflex/companion/compare/v1.6.0...v1.7.0) (2026-08-31)


### Features

* back up and restore the whole meeting archive ([4c74c6e](https://github.com/suiflex/companion/commit/4c74c6ed350ed638854dd923185cc6cbedc9062f))
* **extension:** back up and restore the whole archive ([f3ccfe4](https://github.com/suiflex/companion/commit/f3ccfe4b0c8b9af482ce3b916dea6d7a36dd6e7d))

## [1.6.0](https://github.com/suiflex/companion/compare/v1.5.1...v1.6.0) (2026-08-31)


### Features

* **ai:** add a send-ready recap document type ([08fa7ab](https://github.com/suiflex/companion/commit/08fa7ab3cd0b9acab5af0cb1edd03df7b3a66119))
* **extension:** add a copy button for the weekly digest ([d43942e](https://github.com/suiflex/companion/commit/d43942e4b3ee3360af215093a8d32cf1f84a1796))
* **extension:** list detected action items while the meeting runs ([00cccc5](https://github.com/suiflex/companion/commit/00cccc5f1b8319eeca2083b85649fa085c22dd53))
* **extension:** pin the extension id across installs ([fdea5c9](https://github.com/suiflex/companion/commit/fdea5c971a5f380973a50b947a458a4415b05996))
* **extension:** show the talk-share strip above the transcript ([0d097f5](https://github.com/suiflex/companion/commit/0d097f5c907d99eb226b8ecfb1456d8a363d1321))
* **extension:** surface carry-over items while the meeting runs ([79c84e3](https://github.com/suiflex/companion/commit/79c84e3022eca9c62303527120c9e0a59bdf8ad2))
* **extension:** surface when a newer release is out ([a81ff16](https://github.com/suiflex/companion/commit/a81ff160c16f4edd3380ff3e54ec59fec2eddca1))
* **installer:** offer firefox in the browser picker ([92079b7](https://github.com/suiflex/companion/commit/92079b753ccea875d85aad6c08620104eaa10a8a))
* **installer:** send firefox to the add-on page instead of an xpi ([fba76e3](https://github.com/suiflex/companion/commit/fba76e3d348a058bea8f2463b739387d17ac1487))
* meeting insights bundle — live nudges, recap, digest, talk share ([997371c](https://github.com/suiflex/companion/commit/997371cb298176fadbc702b0f110a90446a8280d))
* **meeting:** compute per-speaker talk share from captions ([dc1c663](https://github.com/suiflex/companion/commit/dc1c66350c536ae72501e398dc700af7311f66f1))
* **meeting:** render a weekly digest from the chronology ([8f7fd75](https://github.com/suiflex/companion/commit/8f7fd75da920ba1771fdaa8f4f4cc1e59207f659))
* **meeting:** turn live action cues into provisional items ([b214759](https://github.com/suiflex/companion/commit/b214759fe6d8e4bc9ce78b26337ade007966e07d))
* ship to firefox, pin the extension id, and automate releases ([8f7027e](https://github.com/suiflex/companion/commit/8f7027e243eba8967a87dd7bd150935353ca0b35))


### Bug Fixes

* **ai:** keep exact BM25 matches at full weight beside a prefix hit ([0c045ce](https://github.com/suiflex/companion/commit/0c045ce9fc4204301a08acaa8aad9bc9907cbb42))
* **extension:** give the toolbar button a real icon in firefox ([dae0266](https://github.com/suiflex/companion/commit/dae02666184ad4b5c03cd4410130bc16c66d5428))
* **installer:** skip firefox instead of aborting when no xpi exists ([6244753](https://github.com/suiflex/companion/commit/624475318c520edb894f787bd0b3df79f56bb0d0))
* **meeting:** anchor an imported transcript to an epoch startedAt ([2b78135](https://github.com/suiflex/companion/commit/2b781359ebee08c423d5b906b6a14d0246a241c4))
* title the release pr without the workspace package name ([4db838e](https://github.com/suiflex/companion/commit/4db838e8bb3f698e22e838e1c79d8cdc9d712e69))

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
