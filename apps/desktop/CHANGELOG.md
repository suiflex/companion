# Changelog

## [0.3.1](https://github.com/suiflex/companion/compare/companion-desktop-v0.3.0...companion-desktop-v0.3.1) (2026-09-03)


### Bug Fixes

* **desktop:** rotate the updater signing key onto a passphrase ([6dcd337](https://github.com/suiflex/companion/commit/6dcd337bea9b0b0f27fe299a76db44c2bc79fd2f))
* recover the desktop release and harden its failure modes ([e540860](https://github.com/suiflex/companion/commit/e540860533106d8ca396fd5d07ce6bf45d85a368))

## [0.3.0](https://github.com/suiflex/companion/compare/companion-desktop-v0.2.0...companion-desktop-v0.3.0) (2026-09-02)


### Features

* **desktop:** check for updates and install them in place ([49cf7ec](https://github.com/suiflex/companion/commit/49cf7ecb9bd0d09d9e7c542cdbee4815a9ec1b6c))
* **desktop:** check for updates and install them in place ([ce6967b](https://github.com/suiflex/companion/commit/ce6967b9a1b8f424e2fac77394065fd8ecc3c0c1))

## [0.2.0](https://github.com/suiflex/companion/compare/companion-desktop-v0.1.0...companion-desktop-v0.2.0) (2026-09-02)


### Features

* **bridge:** cross-platform native host installers ([d4a6c13](https://github.com/suiflex/companion/commit/d4a6c137d565ead96fc5fce5e1738be31042d690))
* **bridge:** wire extension to native host to vault ([9cf9e41](https://github.com/suiflex/companion/commit/9cf9e41892b196cdee64d6883d47941d5517a32c))
* **desktop:** add Companion Desktop, split the release lines, and make it testable ([ef0a730](https://github.com/suiflex/companion/commit/ef0a7304bd0d40e6101e7d2cec233662ea886138))
* **desktop:** add Rust vault IPC and WebView note editor ([fbe4d78](https://github.com/suiflex/companion/commit/fbe4d7870a89ea755fda7f0c293d70346ab5b3df))
* **desktop:** make the settings screen real ([051912b](https://github.com/suiflex/companion/commit/051912b2678a9195362d1bbd8c6143c005d8d8f5))
* **desktop:** run a WebDriver server under a test-only feature ([43a3dcc](https://github.com/suiflex/companion/commit/43a3dcc39a040595f5894373c30fe6bacc1d9c5d))
* **desktop:** scaffold Tauri 2 desktop workspace ([c6d4a85](https://github.com/suiflex/companion/commit/c6d4a8563be07ad523acfe3fbac29167ce3dcde5))
* **desktop:** stop discarding unsaved edits on navigation ([0638278](https://github.com/suiflex/companion/commit/06382786612ebda8f7cb8d6ca825cfaf4c842596))
* **desktop:** wire FTS search into the note sidebar ([d0d7dc4](https://github.com/suiflex/companion/commit/d0d7dc4cc872e3162510967ca6527aa0c65fd565))


### Bug Fixes

* **bridge:** apply native host deliveries one at a time ([1f8706d](https://github.com/suiflex/companion/commit/1f8706dd67050241945b0fd0f88cf2688b1e8582))
* **desktop:** address a saved note by its path, not its session key ([d7a7d09](https://github.com/suiflex/companion/commit/d7a7d094226c1bd42c9be1773e9382c2b9a20596))
* **desktop:** create the vault before the window asks to read it ([8adddad](https://github.com/suiflex/companion/commit/8adddad48e3ae562dec8ade202d704fa36feb805))
* **desktop:** do not offer note actions before the vault is open ([a2aaa85](https://github.com/suiflex/companion/commit/a2aaa85527e202ed82af222c468f2cd88820f654))
* **desktop:** hold a vault move behind the unsaved-edits guard too ([4eddd14](https://github.com/suiflex/companion/commit/4eddd1432f73eb7dd7dd1cc1f9f0b5364f568047))
* **desktop:** refuse vault paths that climb out of the vault ([a74d350](https://github.com/suiflex/companion/commit/a74d3500c2195bff9a06959a0d0ba818b359184c))
* **desktop:** show the brand mark, and stop offering buttons that do nothing ([8b43c0b](https://github.com/suiflex/companion/commit/8b43c0bc3c5789dc556df420eaaddd75e84e5a58))


### Performance Improvements

* **desktop:** index the notes the refresh already read ([29ca90d](https://github.com/suiflex/companion/commit/29ca90d9b8f9c57d196038950cdf8c054f02bdcd))

## Changelog

All notable changes to Companion Desktop are documented here. The browser
extension has its own changelog at the repository root — the two ship on
separate tags (`companion-desktop-v*` and `v*`) and their versions move
independently.
