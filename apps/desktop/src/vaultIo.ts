// VaultIo implemented on top of the Tauri Rust backend. Maps the Vault's
// absolute-path calls to the relative-path Rust commands, so the shared
// @meetcc/vault logic (parsing, index, search) runs untouched in the WebView.
import { invoke } from '@tauri-apps/api/core'
import type { VaultIo } from '@meetcc/vault'

export function tauriVaultIo(root: string): VaultIo {
  const relOf = (abs: string): string => {
    const r = root.replace(/\/+$/, '')
    return abs.startsWith(r + '/') ? abs.slice(r.length + 1) : abs
  }
  const absOf = (rel: string): string => root + '/' + rel
  return {
    root,
    join: (...parts) => parts.join('/'),
    mkdirs: async () => {},
    readFile: async (abs) => invoke<string>('read_vault_file', { rel: relOf(abs) }),
    appendLine: async (abs, line) =>
      invoke('append_vault_line', { rel: relOf(abs), line }),
    writeFileAtomic: async (abs, content) =>
      invoke('write_vault_file', { rel: relOf(abs), content }),
    trash: async (abs) => invoke('trash_vault_file', { rel: relOf(abs) }),
    listMarkdown: async () => (await invoke<string[]>('list_vault')).map(absOf),
    mtimeMs: async (abs) => invoke<number>('vault_mtime', { rel: relOf(abs) }),
  }
}
