// Node implementation of VaultIo (tests + scripts). The browser/WebView build
import {
  appendFileSync,
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

/** Node-filesystem VaultIo rooted at `root`. */
export function nodeIo(root: string): VaultIo {
  return {
    root,
    join: (...parts) => join(...parts),
    mkdirs: (abs) => mkdirSync(abs, { recursive: true }),
    readFile: (abs) => readFileSync(abs, 'utf8'),
    appendLine: (abs, line) => appendFileSync(abs, `${line}\n`, { encoding: 'utf8' }),
    writeFileAtomic: (abs, content) => {
      mkdirSync(dirname(abs), { recursive: true })
      const tmp = `${abs}.${process.pid}.tmp`
      writeFileSync(tmp, content, 'utf8')
      renameSync(tmp, abs)
    },
    trash: (abs) => {
      const base = abs.split('/').pop() ?? abs
      const trashDir = join(root, TRASH)
      mkdirSync(trashDir, { recursive: true })
      renameSync(abs, join(trashDir, base))
    },
    listMarkdown: () => walkMd(root),
    mtimeMs: (abs) => statSync(abs).mtimeMs,
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
