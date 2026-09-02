// Node implementation of VaultIo (tests + scripts). The browser/WebView build
// never imports this module, so `node:fs` stays out of the desktop bundle.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { Vault, type VaultIo } from './vault'

const TRASH = '.trash'
const TRANSCRIPT_DIR = '.transcript'

/** Node-filesystem VaultIo rooted at `root`. Methods are async to match VaultIo. */
export function nodeIo(root: string): VaultIo {
  return {
    root,
    join: (...parts) => join(...parts),
    mkdirs: async (abs) => {
      mkdirSync(abs, { recursive: true })
    },
    readFile: async (abs) => readFileSync(abs, 'utf8'),
    appendLine: async (abs, line) => appendFileSync(abs, `${line}\n`, { encoding: 'utf8' }),
    writeFileAtomic: async (abs, content) => {
      mkdirSync(dirname(abs), { recursive: true })
      const tmp = `${abs}.${process.pid}.tmp`
      writeFileSync(tmp, content, 'utf8')
      renameSync(tmp, abs)
    },
    trash: async (abs) => {
      const base = abs.split('/').pop() ?? abs
      const trashDir = join(root, TRASH)
      mkdirSync(trashDir, { recursive: true })
      // Notes from different days share a basename, so the trash needs to keep
      // them apart — landing on an existing name would delete what is already
      // in there, which is the one thing the trash exists to prevent.
      let dest = join(trashDir, base)
      if (existsSync(dest)) {
        const stem = base.replace(/\.md$/, '')
        dest = join(trashDir, `${stem}-${Date.now()}.md`)
      }
      renameSync(abs, dest)
    },
    listMarkdown: async () => walkMd(root),
    mtimeMs: async (abs) => statSync(abs).mtimeMs,
  }
}

/** Open a Node-backed vault rooted at `root` (e.g. `~/Companion`). */
export function openNodeVault(root: string): Vault {
  return new Vault({ io: nodeIo(root) })
}

function walkMd(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === TRASH || entry.name === TRANSCRIPT_DIR) continue
    const abs = join(root, entry.name)
    if (entry.isDirectory()) out.push(...walkMd(abs))
    else if (entry.name.endsWith('.md')) out.push(abs)
  }
  return out
}
