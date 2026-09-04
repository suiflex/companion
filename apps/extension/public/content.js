// Captures Google Meet / Microsoft Teams (web) CC captions into a transcript.
// Platform is auto-detected from the host; everything downstream (storage,
// pipeline, AI, exporters) is platform-agnostic and keys off meetingId.
// Meet strategy: known selector sets (obfuscated classes churn) + heuristic.
// Teams strategy: stable data-tid attributes on the caption virtual list.
// Diagnostics: filter DevTools console on [MeetCC].

const TEAMS = /teams\.(microsoft\.com|live\.com|cloud\.microsoft)/.test(
  location.host,
)
const TAG = TEAMS ? '[MeetCC:teams]' : '[MeetCC]'

// This file ships as-is with no build step, so it cannot import the shared
// catalogue. Its three visible strings get an inline copy instead, reading the
// same `lang` storage key the rest of the extension writes. Keep these in step
// with packages/shared/src/messages when they change.
const MESSAGES = {
  en: {
    badge: 'Click: open or close the floating transcript (it follows you to other tabs and apps)',
    openInDashboard: 'Click: open this meeting in the dashboard',
    carryOver: '{count} items from the previous meeting are still open',
  },
  id: {
    badge: 'Klik: buka/tutup transcript mengambang (ikut ke tab/app lain)',
    openInDashboard: 'Klik: buka meeting ini di dashboard',
    carryOver: '{count} item dari rapat sebelumnya masih terbuka',
  },
}

let LANG = 'en'
const T = (key, vars) =>
  (MESSAGES[LANG][key] ?? MESSAGES.en[key]).replace(/\{(\w+)\}/g, (whole, name) =>
    vars && name in vars ? String(vars[name]) : whole,
  )

const pickLang = (pref) => {
  if (pref === 'en' || pref === 'id') return pref
  // `system`, or nothing stored yet: fall back to the browser, then English.
  const primary = (navigator.languages ?? [navigator.language])
    .map((tag) => String(tag).toLowerCase().split('-')[0])
    .find((p) => p in MESSAGES)
  return primary ?? 'en'
}

try {
  chrome.storage.local.get('lang', ({ lang }) => {
    LANG = pickLang(lang)
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.lang) LANG = pickLang(changes.lang.newValue)
  })
} catch {
  /* no storage access — English is the default and still correct */
}
const TOP = window === window.top

const KNOWN = [
  { block: '.nMcdL', speaker: '.KcIKyf', text: '.ygicle' }, // verified 2026-07
  { block: '.nMcdL', speaker: '.KcIKyf', text: '.bh44bd' }, // older layout
]

// Teams (v2) SPA URLs often carry no meeting id, so id init is lazy there:
// from the join URL when present, else a timestamp id minted when captions
// (or the call) first appear. Meet always has the id in the pathname.
let meetingId = null
let storageKey = null
let metaKey = null

let entries = [] // {speaker, avatar, text, time}
const seen = new Map() // caption row element -> its transcript entry
let lastVia = null

// storage writes must never throw: after an extension reload this page
// keeps the orphaned script and every chrome.* call starts failing.
// once the context dies (extension reloaded/updated) this orphaned script
// can never recover: warn once, stop all timers, flag the badge.
let dead = false
const timers = []
function die() {
  if (dead) return
  dead = true
  console.warn(
    TAG,
    'extension di-reload — refresh tab ini (F5) untuk lanjut merekam.',
  )
  timers.forEach(clearInterval)
  if (badge) {
    badge.textContent = 'MeetCC ✗ F5'
    badge.style.color = '#ff6b74'
    badge.style.borderColor = '#ff6b74'
  }
}

function store(obj) {
  if (dead) return
  try {
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, 'save failed:', chrome.runtime.lastError.message)
      }
    })
  } catch {
    die()
  }
}

// A Meet/Teams link is a ROOM, not a meeting: the same link is reused every
// week. The session id (room + start) is decided by the service worker, which
// can see what is already stored — rejoining within a few minutes resumes the
// running session, a new day starts a new one. Resolution is async, so until
// it lands captured lines just buffer in `entries`.
let initPending = false
function adoptSession(id) {
  initPending = false
  if (meetingId || dead) return
  meetingId = id
  storageKey = `transcript:${id}`
  metaKey = `meta:${id}`
  try {
    chrome.storage.local.get(storageKey, (r) => {
      if (Array.isArray(r[storageKey])) entries = r[storageKey].concat(entries)
    })
  } catch {
    die()
  }
}

function initMeeting(roomId) {
  if (meetingId || dead || initPending) return
  initPending = true
  try {
    chrome.runtime.sendMessage({ type: 'resolve-session', roomId }, (res) => {
      if (chrome.runtime.lastError || !res || !res.sessionId) {
        // SW unreachable — recording under the room id loses the session
        // split, but losing the transcript would be worse.
        console.warn(TAG, 'session resolve failed, using room id:', roomId)
        adoptSession(roomId)
        return
      }
      adoptSession(res.sessionId)
    })
  } catch {
    die()
  }
}

if (!TEAMS) {
  initMeeting(location.pathname.replace(/\//g, '') || 'meet')
} else {
  const m = decodeURIComponent(location.href).match(
    /19:meeting_([A-Za-z0-9]+)@thread\.v2/,
  )
  if (m) initMeeting('tms-' + m[1].slice(0, 16))
}

// CC state = captions region mounted in DOM (locale-independent, unlike aria-label)
function ccOn() {
  return TEAMS
    ? !!document.querySelector('[data-tid="closed-caption-v2-window-wrapper"]')
    : !!document.querySelector('div[jscontroller="KPn5nb"], .vNKgIf')
}

function knownRows() {
  for (const s of KNOWN) {
    const blocks = document.querySelectorAll(s.block)
    if (!blocks.length) continue
    const rows = []
    for (const b of blocks) {
      const speaker = b.querySelector(s.speaker)?.textContent.trim() || '?'
      const text = b.querySelector(s.text)?.textContent.trim()
      const avatar = b.querySelector('img')?.src || ''
      if (text) rows.push({ el: b, speaker, avatar, text })
    }
    if (rows.length) return { via: s.block, rows }
  }
  return null
}

// Class-independent fallback: a caption row is the smallest ancestor of a
// small avatar <img> whose text has >= 2 lines (name line + caption text),
// positioned in the left/center of the viewport (excludes chat panel).
function heuristicRows() {
  const rows = []
  const taken = new Set()
  for (const img of document.images) {
    if (!/googleusercontent\.com/.test(img.src)) continue
    if (!img.clientWidth || img.clientWidth > 48) continue
    let node = img.parentElement
    for (let i = 0; i < 5 && node; i++, node = node.parentElement) {
      const lines = (node.innerText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      if (lines.length >= 2 && lines[0].length < 60) {
        const r = node.getBoundingClientRect()
        if (!taken.has(node) && r.left < innerWidth * 0.4) {
          taken.add(node)
          rows.push({
            el: node,
            speaker: lines[0],
            avatar: img.src,
            text: lines.slice(1).join(' '),
          })
        }
        break
      }
    }
  }
  return rows.length ? { via: 'heuristic', rows } : null
}

// Teams renders captions as fui-ChatMessageCompact rows inside a virtual
// list; data-tid attributes are Microsoft's own test hooks, far more stable
// than Meet's obfuscated classes.
function teamsRows() {
  const list = document.querySelector(
    '[data-tid="closed-caption-v2-virtual-list-content"]',
  )
  if (!list) return null
  const rows = []
  for (const b of list.querySelectorAll('.fui-ChatMessageCompact')) {
    const speaker =
      b.querySelector('[data-tid="author"]')?.textContent.trim() || '?'
    const text = b
      .querySelector('[data-tid="closed-caption-text"]')
      ?.textContent.trim()
    if (text)
      rows.push({
        el: b,
        speaker,
        avatar: b.querySelector('img')?.src || '',
        text,
      })
  }
  return rows.length ? { via: 'teams data-tid', rows } : null
}

let idleTicks = 0

timers.push(
  setInterval(() => {
    if (dead) return
    const found = TEAMS ? teamsRows() : knownRows() || heuristicRows()

    if (!found) {
      if (++idleTicks === 30 && entries.length === 0 && !TEAMS) {
        const region = document.querySelector(
          'div[jscontroller="KPn5nb"], .vNKgIf',
        )
        if (region && !region.querySelector(KNOWN[0].block)) {
          console.log(TAG, 'CC on, captions region empty — waiting for speech.')
        } else {
          const c = document.querySelector('div[jsname="dsyhDe"], .a4cQT')
          console.warn(
            TAG,
            'no caption rows matched. Known container:',
            c ? c.outerHTML.slice(0, 3000) : 'NOT FOUND',
          )
        }
      }
      return
    }
    idleTicks = 0
    if (!meetingId) initMeeting('tms-' + Date.now()) // Teams, no id in URL

    if (found.via !== lastVia) {
      lastVia = found.via
      console.log(TAG, 'capturing via:', found.via)
    }

    let dirty = false
    for (const { el, speaker, avatar, text } of found.rows) {
      let entry = seen.get(el)
      if (!entry) {
        // Teams virtual list recycles/remounts DOM nodes on scroll: an already
        // captured caption can come back as a fresh element. Re-adopt, not dup.
        const dup = entries
          .slice(-8)
          .find((e) => e.speaker === speaker && e.text === text)
        if (dup) {
          seen.set(el, dup)
          continue
        }
        entry = { speaker, avatar, text, time: new Date().toISOString() }
        seen.set(el, entry)
        entries.push(entry)
        dirty = true
      } else if (entry.text !== text) {
        // caption grows in place while the person keeps talking
        entry.text = text
        dirty = true
      }
    }
    if (dirty) {
      // storageKey is null until the session id comes back; the next dirty
      // tick flushes the whole buffer, so nothing is lost meanwhile.
      if (storageKey) store({ [storageKey]: entries })
      if (!TOP) {
        // mirror to this tab's top frame (badge + PiP live there)
        try {
          window.top.postMessage({ __meetcc: 'entries', entries }, '*')
        } catch {
          /* top frame gone / cross-origin refusal — badge just lags */
        }
      }
    }
  }, 500),
)

// --- auto-enable CC and keep it on ---
// Meet: single toolbar button, found via its material icon name.
// Teams: CC toggle is buried in a dropdown (More -> Language and speech ->
// Turn on live captions). Menus are portals rendered on demand and their
// labels are localized, so this is a best-effort click chain with strict
// text matching (never click an unmatched menu item — misfire could start
// a recording). If it fails, we tell the user the one-time permanent fix.
let ccClicks = 0
let announced = false
let ccBusy = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const menuItem = (re) =>
  [
    ...document.querySelectorAll(
      '[role="menuitem"], [role="menuitemcheckbox"]',
    ),
  ].find(
    (el) =>
      re.test(el.textContent || '') ||
      re.test(el.getAttribute('aria-label') || ''),
  )

async function teamsEnableCc() {
  if (ccBusy) return
  ccBusy = true
  try {
    const more = document.querySelector(
      '#callingButtons-showMoreBtn, [data-tid="more-button"], [data-tid="call-more-menu-trigger"]',
    )
    if (!more) return // not in a call (or toolbar hidden) — try next tick
    more.click()
    await sleep(600)
    let item = menuItem(/live caption|teks langsung/i)
    if (!item) {
      const sub = menuItem(/language and speech|bahasa dan ucapan/i)
      if (sub) {
        sub.click()
        await sleep(600)
        item = menuItem(/live caption|teks langsung/i)
      }
    }
    ccClicks++
    if (item) {
      item.click()
      console.log(TAG, 'auto-enabled captions via menu, attempt', ccClicks)
    } else {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      console.warn(
        TAG,
        'CC menu tidak ketemu. Nyalakan manual: More → Language and speech → ' +
          'Turn on live captions. Permanen: Settings → Accessibility → Always keep captions on.',
      )
    }
  } finally {
    ccBusy = false
  }
}

timers.push(
  setInterval(() => {
    if (dead) return
    if (ccOn()) {
      ccClicks = 0 // CC is on; reset so a manual turn-off gets re-enabled
      if (!meetingId) initMeeting('tms-' + Date.now()) // Teams: in-call, CC on, no URL id
      if (!announced && meetingId) {
        announced = true // in the call, CC live -> auto-open transcript window
        try {
          chrome.runtime.sendMessage(
            { type: 'meeting-started', meetingId },
            () => void chrome.runtime.lastError,
          ) // callback form: no unhandled rejection
        } catch {
          die()
        }
      }
      return
    }
    if (ccClicks >= 5) return // selector churned? stop before toggle-looping
    if (TEAMS) {
      void teamsEnableCc()
      return
    }
    const icon = [...document.querySelectorAll('button i')].find((i) =>
      i.textContent.trim().startsWith('closed_caption'),
    )
    const btn = icon?.closest('button')
    if (btn) {
      btn.click()
      ccClicks++
      console.log(TAG, 'auto-enabled captions, attempt', ccClicks)
    }
  }, 3000),
)

// --- meeting heartbeat: powers the live/ended list in the UI ---
// gated on the captions region actually being mounted: when the call ends
// the heartbeat stops and background.js picks the meeting up as "finished".
let startedAt = null
timers.push(
  setInterval(() => {
    if (dead || !announced || !meetingId) return // not in a call yet
    if (!ccOn()) return // left the call
    const now = new Date().toISOString()
    if (startedAt) {
      store({ [metaKey]: { id: meetingId, startedAt, lastSeenAt: now } })
      return
    }
    try {
      chrome.storage.local.get(metaKey, (r) => {
        startedAt = r[metaKey]?.startedAt || now // keep original start on rejoin
        store({ [metaKey]: { id: meetingId, startedAt, lastSeenAt: now } })
      })
    } catch {
      die()
    }
  }, 5000),
)

// --- floating transcript (Document Picture-in-Picture) ---
// Always-on-top across tabs AND apps. Chrome requires a user gesture to open:
// click the badge once; the PiP window then follows you everywhere.
let pipWin = null
let pipList = null
let pipSig = ''

function renderPip() {
  if (!pipWin || pipWin.closed) return
  const last = entries[entries.length - 1]
  const sig = `${entries.length}:${last ? last.text.length : 0}`
  if (sig === pipSig) return
  pipSig = sig

  const doc = pipWin.document
  pipList.textContent = ''
  for (const e of entries.slice(-100)) {
    const row = doc.createElement('div')
    row.className = 'row'
    if (e.avatar) {
      const img = doc.createElement('img')
      img.className = 'ava'
      img.src = e.avatar
      row.append(img)
    } else {
      const ph = doc.createElement('div')
      ph.className = 'ava ph'
      ph.textContent = (e.speaker[0] || '?').toUpperCase()
      row.append(ph)
    }
    const body = doc.createElement('div')
    const who = doc.createElement('div')
    who.className = 'who'
    who.textContent = e.speaker
    const txt = doc.createElement('div')
    txt.className = 'txt'
    txt.textContent = e.text
    body.append(who, txt)
    row.append(body)
    pipList.append(row)
  }
  pipList.scrollTop = pipList.scrollHeight
}

async function togglePip() {
  if (pipWin && !pipWin.closed) {
    pipWin.close()
    pipWin = null
    return
  }
  if (!('documentPictureInPicture' in window)) {
    console.warn(TAG, 'Document PiP unsupported in this browser')
    return
  }
  pipWin = await documentPictureInPicture.requestWindow({
    width: 340,
    height: 460,
  })
  const doc = pipWin.document
  doc.head.insertAdjacentHTML(
    'beforeend',
    `<style>
    body { margin: 0; background: #0a0d12; color: #dbe2ee;
           font: 12px/1.45 "Avenir Next", "Segoe UI", sans-serif; }
    #hd { padding: 8px 12px; font-weight: 600; font-size: 10px;
          letter-spacing: .14em; text-transform: uppercase; color: #46e394;
          border-bottom: 1px solid #1d2434; position: sticky; top: 0;
          background: #0f131b; }
    #list { padding: 10px; display: flex; flex-direction: column; gap: 8px;
            overflow-y: auto; height: calc(100vh - 31px); box-sizing: border-box; }
    .row { display: flex; gap: 8px; }
    .ava { width: 22px; height: 22px; border-radius: 50%; flex: none;
           object-fit: cover; background: #131926; }
    .ph { display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 600; color: #8b95a9; }
    .who { font-weight: 600; font-size: 11px; color: #46e394; }
    .txt { color: #dbe2ee; }
  </style>`,
  )
  doc.body.innerHTML =
    `<div id="hd">${TEAMS ? 'Teams' : 'Meet'} CC — live` +
    '<span style="float:right;color:#8b95a9;font-weight:400;letter-spacing:0;text-transform:none">powered by suiflex</span>' +
    '</div><div id="list"></div>'
  pipList = doc.getElementById('list')
  pipSig = ''
  renderPip()
  pipWin.addEventListener('pagehide', () => {
    pipWin = null
  })
}

// proof-of-life badge, live entry counter, click = toggle floating transcript.
// Top frame only: Teams may run the call inside an iframe (script runs in all
// frames to reach the captions), and one badge per frame would stack up.
let badge = null
let badgeLabel = null
if (TOP) {
  timers.push(setInterval(renderPip, 700))

  badge = document.createElement('div')
  badge.title = T('badge')
  badge.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;background:#0f131b;' +
    'color:#46e394;border:1px solid #273043;font:11px ui-monospace,Menlo,monospace;' +
    'padding:3px 10px;border-radius:10px;opacity:.9;cursor:pointer;user-select:none;' +
    'display:flex;align-items:center;gap:6px'
  badge.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" style="flex:none">' +
    '<path fill="#00ac47" d="M12 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2.5l4.5 3.5c.66.51 1.5.04 1.5-.8V7.8c0-.84-.84-1.31-1.5-.8L14 10.5V8a2 2 0 0 0-2-2z"/></svg>' +
    '<span id="mcc-label">MeetCC ✓ 0</span>' +
    '<span style="color:#8b95a9;font-size:9px">powered by suiflex</span>'
  badgeLabel = badge.querySelector('#mcc-label')
  badge.onclick = togglePip
  document.documentElement.appendChild(badge)
  timers.push(
    setInterval(() => {
      if (dead) return // die() owns the badge once the context is gone
      badgeLabel.textContent = `MeetCC ${pipWin && !pipWin.closed ? '▣' : '✓'} ${entries.length}`
    }, 1000),
  )

  // captions captured in a child frame (Teams can iframe the call) are
  // mirrored up via postMessage so the badge counter and PiP stay live.
  // Same-tab by construction — chrome.storage.onChanged is global across
  // tabs and merged two concurrent meetings into one transcript.
  addEventListener('message', (e) => {
    const d = e.data
    if (!d || d.__meetcc !== 'entries' || lastVia) return // capturing here: ignore
    if (Array.isArray(d.entries)) entries = d.entries
  })
}

// --- carry-over nudge ---
// What is still open from earlier meetings in this room is only useful while
// the meeting is running; the dashboard shows it after the fact. The index is
// rebuilt by the minute sweep, so a just-started session is not queryable yet
// — poll a few times, then give up quietly.
if (TOP) {
  let carryTries = 0
  let carryShown = false

  const carryLines = (data) =>
    [
      ...data.openActions.map(
        (a) => `☐ ${a.task}${a.owner ? ` — ${a.owner}` : ''}`,
      ),
      ...data.openQuestions.map((q) => `? ${q.question}`),
    ].filter(Boolean)

  function showCarryOver(lines, total) {
    carryShown = true
    const box = document.createElement('div')
    box.style.cssText =
      'position:fixed;top:36px;right:8px;z-index:2147483646;max-width:320px;' +
      'background:#0f131b;color:#dbe2ee;border:1px solid #273043;border-radius:10px;' +
      'font:11px/1.5 "Avenir Next","Segoe UI",sans-serif;padding:8px 10px;opacity:.95;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer'
    box.title = T('openInDashboard')
    const head = document.createElement('div')
    head.style.cssText =
      'color:#46e394;font-weight:600;font-size:10px;letter-spacing:.1em;' +
      'text-transform:uppercase;margin-bottom:4px'
    head.textContent = T('carryOver', { count: total })
    box.append(head)
    for (const line of lines) {
      const row = document.createElement('div')
      row.textContent = line
      row.style.cssText =
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
      box.append(row)
    }
    if (total > lines.length) {
      const more = document.createElement('div')
      more.style.color = '#8b95a9'
      more.textContent = `+${total - lines.length} lainnya`
      box.append(more)
    }
    const close = document.createElement('span')
    close.textContent = '×'
    close.style.cssText =
      'position:absolute;top:4px;right:8px;color:#8b95a9;font-size:14px'
    close.onclick = (e) => {
      e.stopPropagation()
      box.remove()
    }
    box.append(close)
    box.onclick = () => {
      try {
        chrome.runtime.sendMessage(
          { type: 'meeting-started', meetingId },
          () => void chrome.runtime.lastError,
        )
      } catch {
        die()
      }
      box.remove()
    }
    document.documentElement.appendChild(box)
  }

  timers.push(
    setInterval(() => {
      if (dead || carryShown || !announced || !meetingId) return
      if (++carryTries > 8) return // index never caught up — stay silent
      try {
        chrome.runtime.sendMessage(
          { type: 'db', op: 'carry-over', args: { sessionId: meetingId } },
          (res) => {
            void chrome.runtime.lastError
            const data = res && res.ok ? res.data : null
            if (!data || carryShown) return
            const lines = carryLines(data)
            if (lines.length) showCarryOver(lines.slice(0, 3), lines.length)
          },
        )
      } catch {
        die()
      }
    }, 30_000),
  )
}

// tab closes / navigates away mid-meeting: nudge background to sweep soon
addEventListener('pagehide', () => {
  if (!announced || !meetingId) return
  try {
    chrome.runtime.sendMessage(
      { type: 'meeting-left', meetingId },
      () => void chrome.runtime.lastError,
    )
  } catch {
    /* context gone */
  }
})

console.log(TAG, 'content script loaded,', meetingId || '(meeting id pending)')
