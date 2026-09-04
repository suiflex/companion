# Changelog

## [1.11.0](https://github.com/suiflex/companion/compare/v1.10.0...v1.11.0) (2026-09-04)


### Features

* add sponsor links ([6a6dad0](https://github.com/suiflex/companion/commit/6a6dad0608f6d8100fbc33122ade32233810a35c))
* **ai:** let the host choose the transport ([bc8ab2b](https://github.com/suiflex/companion/commit/bc8ab2b5c1a726cbf58a64bc4ad63eb69f7a28ec))
* **desktop:** add light and system themes ([60402f7](https://github.com/suiflex/companion/commit/60402f7f24e6285eb538d94a01ccb1898be2e732))
* **desktop:** add the AI provider settings screen ([7fa168b](https://github.com/suiflex/companion/commit/7fa168bf9696b069cd7f7e9e4284fe3d7c432eda))
* **desktop:** add the incoming meetings view ([2310c4e](https://github.com/suiflex/companion/commit/2310c4eb16f63de6ca404729f477e4b67d5ca64a))
* **desktop:** apply what the host spooled ([23498f7](https://github.com/suiflex/companion/commit/23498f72d6e23d2058ecc117c660936293e943fc))
* **desktop:** colour status and priority ([16b6188](https://github.com/suiflex/companion/commit/16b61887f9ee8b470014f17158a999b9794da52c))
* **desktop:** connect a browser without a terminal ([bb6840a](https://github.com/suiflex/companion/commit/bb6840a5c53d722673b75c181d376f2338a2781d))
* **desktop:** copy a delivered meeting instead of rewriting it ([ffc5940](https://github.com/suiflex/companion/commit/ffc5940fa6698929c4834d743af35d7418b089ad))
* **desktop:** edit note bodies in a rich markdown editor ([f64aa88](https://github.com/suiflex/companion/commit/f64aa88aa00eedd1166ab9be6fba5b7d183a4bb5))
* **desktop:** edit ticket fields on a note ([c575816](https://github.com/suiflex/companion/commit/c575816fbe4b6c0be4cf30a9cfffa1e42b7faf41))
* **desktop:** format from a selection instead of a toolbar ([8e2069d](https://github.com/suiflex/companion/commit/8e2069d379dd0407c3ca08d43f2404e53b437c9b))
* **desktop:** group notes in folders you can make ([9fd1aea](https://github.com/suiflex/companion/commit/9fd1aea0ebe24feb8ef675eab886119546adc3f4))
* **desktop:** keep the provider key in the OS keychain ([c617dee](https://github.com/suiflex/companion/commit/c617dee972d9301dbe1bd2fe50ec72b5d0c3549b))
* **desktop:** make a folder inside the folder you point at ([e7cd3c4](https://github.com/suiflex/companion/commit/e7cd3c4c13271b0f71d4ba6569e08215efdb8ff7))
* **desktop:** make the app its own native-messaging host ([440350a](https://github.com/suiflex/companion/commit/440350aed57ac4729093b9a233bdc7741695bf27))
* **desktop:** mark delivered meetings in the note list ([1e6a258](https://github.com/suiflex/companion/commit/1e6a258ce59f879ed57767297b14b1aca8150c64))
* **desktop:** mark meeting notes in the sidebar tree ([a674a5f](https://github.com/suiflex/companion/commit/a674a5f679464616105c4aec519d504655f0db08))
* **desktop:** pick up vault changes without a restart ([abd2c9e](https://github.com/suiflex/companion/commit/abd2c9eb82f7d9c1575ff57d005499f1c35b7884))
* **desktop:** replace the date input with a themed calendar ([81dae75](https://github.com/suiflex/companion/commit/81dae759be8ce722c3b0b32a88ecbce00aa063d8))
* **desktop:** replace the native status and priority dropdowns ([a871c9d](https://github.com/suiflex/companion/commit/a871c9dbb15b79e71b1f5e9320ebe9ffa079ad5e))
* **desktop:** say when an action succeeded ([b0675eb](https://github.com/suiflex/companion/commit/b0675ebd05aa1880b822c0618b2674046d2e650f))
* **desktop:** show a meeting's participants and transcript ([756a55a](https://github.com/suiflex/companion/commit/756a55a3edeb822665b230910ec2d12502840a70))
* **desktop:** translate the interface and add a language setting ([aeb24a8](https://github.com/suiflex/companion/commit/aeb24a867045d563eb0d54bac1e9c37ddc4c5284))
* **extension:** add a language setting and translate the shell ([24044be](https://github.com/suiflex/companion/commit/24044bec7d214edae2007547aba9c74dac42bc53))
* **extension:** follow the system theme by default ([7e79e55](https://github.com/suiflex/companion/commit/7e79e553654c2a6dfbfca5867c97c78d9abc821b))
* **extension:** surface desktop bridge connection status ([c227cc3](https://github.com/suiflex/companion/commit/c227cc376a3fece041b5e91c1480064b1c323392))
* **extension:** translate the dashboard components ([aaed8ee](https://github.com/suiflex/companion/commit/aaed8ee805ae7b5bcf8c9ba616f41b29238f673a))
* **extension:** translate the settings panels, worker and content script ([1176db6](https://github.com/suiflex/companion/commit/1176db665669b78f920090050a65388c1553aaab))
* make the desktop bridge work, and the desktop app worth opening ([20a2714](https://github.com/suiflex/companion/commit/20a2714cb265feddf2b4436959fb18b5496f2518))
* point the Saweria link at saweria.co/suiflex ([1bfd241](https://github.com/suiflex/companion/commit/1bfd24193056653a5a77ecc04f44efbdc31def64))
* **shared:** add the i18n engine and message catalogues ([8552876](https://github.com/suiflex/companion/commit/85528766abb25258e72f1f9094c2fcd27f79fbd1))
* **shared:** translate user-facing package messages ([114b4c3](https://github.com/suiflex/companion/commit/114b4c3059e566013003647bc17fee52b642c467))
* **vault:** carry ticket fields in note frontmatter ([11db49b](https://github.com/suiflex/companion/commit/11db49b3fedc7ead7ae3151751d6e8a8e312f477))
* **vault:** record where an edited copy of a meeting came from ([6f4e54b](https://github.com/suiflex/companion/commit/6f4e54b8ac5091beaaa9fecaab889d2036cd0045))


### Bug Fixes

* **ci:** stop the host smoke test assuming macOS ([35d0f7b](https://github.com/suiflex/companion/commit/35d0f7bd5567b04b2081bdc7716d01e2b1729124))
* **desktop:** agree with Tauri about where the config dir is ([a8aa3f5](https://github.com/suiflex/companion/commit/a8aa3f57e457686a655566bfa938796d923e7e88))
* **desktop:** confirm and remember the vault folder ([4cd3b4b](https://github.com/suiflex/companion/commit/4cd3b4b05d84e4972990929c51a2bf8d4a6e97e7))
* **desktop:** copy a meeting once, not once per save ([9dcb174](https://github.com/suiflex/companion/commit/9dcb174fca51b3fc4697cd004b12fc39a757596c))
* **desktop:** flip a dropdown that would open off screen ([4ad0ef7](https://github.com/suiflex/companion/commit/4ad0ef734641adbdc184a152cfe72eb1ea3b07cd))
* **desktop:** give each sponsor link its own glyph ([da024c2](https://github.com/suiflex/companion/commit/da024c2376ceed860d92bcbdd70333e6b8860c72))
* **desktop:** give the sidebar one type scale ([724148a](https://github.com/suiflex/companion/commit/724148a7200a97813adf7a81c62f8ee7e045b4b1))
* **desktop:** keep a long note off the Save button ([9eead81](https://github.com/suiflex/companion/commit/9eead8134469b4584e55d5f91125ff7493157069))
* **desktop:** keep the vault usable when the index will not open ([cf1914e](https://github.com/suiflex/companion/commit/cf1914ec57c2d96fd063af11e1198fa3da97186f))
* **desktop:** let the webview receive a dropped note ([03315f3](https://github.com/suiflex/companion/commit/03315f3819f062659a9a73b883863bca90df7ae9))
* **desktop:** line the ticket fields up ([1070dc0](https://github.com/suiflex/companion/commit/1070dc0b45744cc69163bdc02eea468a853b143f))
* **desktop:** load the SQLite wasm under the dev server ([7b6ebe8](https://github.com/suiflex/companion/commit/7b6ebe85656bc104d49813ea43661c6d8bf10198))
* **desktop:** make the folder actions actually work ([4d756b1](https://github.com/suiflex/companion/commit/4d756b10b3dc7daa406c3628407e4db505e9eda6))
* **desktop:** poll the vault with one call instead of one per note ([76344dd](https://github.com/suiflex/companion/commit/76344dd4fb699b7bb0288995c52042b59daf9908))
* **desktop:** report a copy that did not happen ([525d241](https://github.com/suiflex/companion/commit/525d241293fc0e60f215233f4285cbf7f478c827))
* **desktop:** show the editor toolbar ([21c4d42](https://github.com/suiflex/companion/commit/21c4d427c99dfd247d8b22d512f84aae7d795d2f))
* **desktop:** size a dropdown to its options, not to its button ([a2f9f4d](https://github.com/suiflex/companion/commit/a2f9f4d509cb4d4ab604a82d426ecd05abf4ea58))
* **desktop:** stop the copy button waiting forever ([d872e7b](https://github.com/suiflex/companion/commit/d872e7ba15b792ba568930fb2820c31ba2a5fb06))
* **desktop:** stop the editor clipping the slash menu ([088968f](https://github.com/suiflex/companion/commit/088968f12d43f1bb1535501d5de41023bdefc888))
* **desktop:** warn about a duplicate session key once ([4eb3e9d](https://github.com/suiflex/companion/commit/4eb3e9d6dc3c62b6f05f0e029a31cd1efdda499d))
* **extension:** let the settings panel use the window width ([6d895d9](https://github.com/suiflex/companion/commit/6d895d927c4f62ab8681596707747d3f82d8240a))
* **extension:** put the sponsor links back where they are visible ([c489267](https://github.com/suiflex/companion/commit/c489267c5f1e689e576f40b4c955687bb72dfde7))
* **extension:** put the sponsor links in the icon row ([99534ea](https://github.com/suiflex/companion/commit/99534ea4ea2866ad2f786afcd462c7e7543d86fd))
* **extension:** stop the settings cards overlapping each other ([85a3c6f](https://github.com/suiflex/companion/commit/85a3c6f97db52c7f99efe49f1af50edd27f02b2e))
* **extension:** translate the strings the sweep never saw ([88c8405](https://github.com/suiflex/companion/commit/88c8405c169ea58fdcf30eec2d6cf9b55e3c9b63))
* **installer:** find Arc, whose binary is not named what we guessed ([0ed216d](https://github.com/suiflex/companion/commit/0ed216dcf61807c297674c4766ee4fe270337025))
* **installer:** install the module the CLI imports ([fe45163](https://github.com/suiflex/companion/commit/fe45163b0f1b744c08878634c6bed37f672b4781))
* **installer:** register the native host from companion install ([5473460](https://github.com/suiflex/companion/commit/54734604d25cb7c553634c8bb2cf86df9abcfc01))
* **shared:** catch the strings the hand sweep missed ([78c74fa](https://github.com/suiflex/companion/commit/78c74fa3316fa15eea73f905aac8915987b75940))
* **vault:** refuse a batch that identifies no meeting ([6cf2bc5](https://github.com/suiflex/companion/commit/6cf2bc55101e13c956f831fed58e39fc953a7e15))
* **vault:** skip a duplicate session key instead of failing the index ([9581ee5](https://github.com/suiflex/companion/commit/9581ee553c4bae3ec9d8c4710dda600e59a463de))
* **vault:** write and index a note where it actually lives ([b6c8655](https://github.com/suiflex/companion/commit/b6c8655d42540f8d52610666b323c9ec84bc6ded))

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
