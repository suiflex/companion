// Captures Google Meet / Microsoft Teams / Zoom Web captions into a transcript.
// Platform is auto-detected from the host; everything downstream (storage,
// pipeline, AI, exporters) is platform-agnostic and keys off meetingId.
// Meet strategy: known selector sets (obfuscated classes churn) + heuristic.
// Teams strategy: stable data-tid attributes on the caption virtual list.
// Zoom strategy: subtitle overlay rows; the overlay does not expose full names.
// Diagnostics: filter DevTools console on [MeetCC].

const TEAMS = /teams\.(microsoft\.com|live\.com|cloud\.microsoft)/.test(
  location.host,
)
const ZOOM = location.hostname === 'zoom.us' || location.hostname.endsWith('.zoom.us')
const TAG = TEAMS ? '[MeetCC:teams]' : ZOOM ? '[MeetCC:zoom]' : '[MeetCC]'

// This file ships as-is with no build step, so it cannot import the shared
// catalogue. Its visible strings get an inline copy instead, reading the same
// `lang` storage key the rest of the extension writes. Keep the two languages
// in step with each other, and with packages/shared/src/messages when they
// overlap.
const MESSAGES = {
  en: {
    badge: 'Click: open or close the floating transcript (it follows you to other tabs and apps)',
    openInDashboard: 'Click: open this meeting in the dashboard',
    carryOver: '{count} items from the previous meeting are still open',
    captionsWorking: 'Setting captions to {lang}…',
    captionsUpdated: 'Captions: {lang} ✓',
    captionsFailed: 'Could not set captions to {lang} — change it in Meet',
    teamsSetLang: 'Set spoken language: {lang}',
    teamsConfirm: 'Confirm in the Teams dialog — it applies to everyone',
    teamsUpdated: 'Spoken language: {lang} ✓',
    teamsCancelled: 'Spoken language not changed',
    teamsLocked: 'Only the organizer can change the spoken language',
    teamsFailed: 'Turn captions on first, or change it in Teams captions settings',
    lang_id: 'Indonesian',
    lang_en: 'English',
  },
  id: {
    badge: 'Klik: buka/tutup transcript mengambang (ikut ke tab/app lain)',
    openInDashboard: 'Klik: buka meeting ini di dashboard',
    carryOver: '{count} item dari rapat sebelumnya masih terbuka',
    captionsWorking: 'Mengatur caption ke {lang}…',
    captionsUpdated: 'Caption: {lang} ✓',
    captionsFailed: 'Gagal mengatur caption ke {lang} — ubah di Meet',
    teamsSetLang: 'Ubah bahasa ucapan: {lang}',
    teamsConfirm: 'Konfirmasi di dialog Teams — berlaku untuk semua peserta',
    teamsUpdated: 'Bahasa ucapan: {lang} ✓',
    teamsCancelled: 'Bahasa ucapan tidak diubah',
    teamsLocked: 'Hanya penyelenggara yang bisa mengubah bahasa ucapan',
    teamsFailed: 'Nyalakan caption dulu, atau ubah di setelan caption Teams',
    lang_id: 'Indonesia',
    lang_en: 'Inggris',
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

// The dashboard's "Meeting language": what people speak, not the interface
// language above. Same flat-key arrangement as `lang` — see
// packages/shared/src/meetingLang.ts, which this mirrors.
let MEETING_LANG_PREF = 'keep'

try {
  chrome.storage.local.get(['lang', 'meetingLang'], ({ lang, meetingLang }) => {
    LANG = pickLang(lang)
    MEETING_LANG_PREF = meetingLang ?? 'keep'
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes.lang) LANG = pickLang(changes.lang.newValue)
    if (changes.meetingLang) {
      MEETING_LANG_PREF = changes.meetingLang.newValue ?? 'keep'
      captionLangSettled = false // a new choice gets applied once more
      captionLangTries = 0
      langDone = false // the badge offers / reports it again
      langNote = null
      teamsAutoTried = false
    }
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
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !meetingId || !storageKey) return
  const mergeMarker = changes[`merge-sources:${meetingId}`]
  const updated = changes[storageKey]?.newValue
  if (!mergeMarker || !Array.isArray(updated)) return

  const byCaption = new Map()
  for (const entry of updated) {
    const key = `${entry.time}\0${entry.speaker}\0${entry.text}`
    const matches = byCaption.get(key) || []
    matches.push(entry)
    byCaption.set(key, matches)
  }
  for (const [element, previous] of seen) {
    const key = `${previous.time}\0${previous.speaker}\0${previous.text}`
    const match = byCaption.get(key)?.shift()
    if (match) seen.set(element, match)
  }
  entries = updated
})

// A Meet/Teams/Zoom link is a ROOM, not a meeting: the same link is reused every
// week. The session id (room + start) is decided by the service worker, which
// can see what is already stored — rejoining within a few minutes resumes the
// running session, a new day starts a new one. Resolution is async, so until
// it lands captured lines just buffer in `entries`.
let initPending = false
function adoptSession(id) {
  initPending = false
  if (meetingId || dead) return
  meetingId = id
  metaKey = `meta:${id}`
  const key = `transcript:${id}`
  try {
    chrome.storage.local.get(key, (r) => {
      const buffered = entries
      if (Array.isArray(r[key])) entries = r[key].concat(buffered)
      storageKey = key
      if (buffered.length) store({ [key]: entries })
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

if (ZOOM) {
  const code = location.pathname.match(/^\/(?:wc\/(?:join\/)?|j\/)(\d+)(?:\/|$)/)?.[1]
  if (code) initMeeting('zm-' + code)
} else if (!TEAMS) {
  initMeeting(location.pathname.replace(/\//g, '') || 'meet')
} else {
  const m = decodeURIComponent(location.href).match(
    /19:meeting_([A-Za-z0-9]+)@thread\.v2/,
  )
  if (m) initMeeting('tms-' + m[1].slice(0, 16))
}

// CC state = captions region mounted in DOM (locale-independent, unlike aria-label)
function ccOn() {
  if (TEAMS) return !!document.querySelector('[data-tid="closed-caption-v2-window-wrapper"]')
  if (ZOOM) {
    const label = zoomCcButton()?.getAttribute('aria-label') || ''
    return !!document.querySelector('.live-transcription-subtitle__overlay-container') ||
      /hide (captions|subtitles|text)|sembunyikan teks/i.test(label)
  }
  if (document.querySelector('div[jscontroller="KPn5nb"], .vNKgIf')) return true
  // Region classes rotate; the toggle's own state does not, and reading it
  // keeps the auto-enable tick from clicking captions back off.
  const btn = meetCcButton()
  return btn?.getAttribute('aria-pressed') === 'true' ||
    MEET_CC_OFF_LABEL.test(btn?.getAttribute('aria-label') || '')
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

const zoomUnnamed = new Map()
const zoomNamesByAvatar = new Map()
let zoomNamesByInitial = new Map()
let zoomParticipantsCount = 0
function zoomSpeaker(avatar) {
  if (!avatar) return '?'
  if (!zoomUnnamed.has(avatar)) zoomUnnamed.set(avatar, `Speaker ${zoomUnnamed.size + 1}`)
  return zoomUnnamed.get(avatar)
}

function zoomParticipantsButton() {
  return document.querySelector('svg.SvgParticipants')?.closest('button')
}

function zoomLearnNames() {
  const button = zoomParticipantsButton()
  const count = Number(button?.querySelector('.footer-button__number-counter')?.textContent)
  if (count && count !== zoomParticipantsCount) {
    zoomParticipantsCount = count
    zoomNamesByInitial.clear()
  }
  const list = document.querySelector('#participants-unified-list')
  if (!list) return false
  zoomOpenClicks = 0
  const people = [...list.querySelectorAll('.participants-li')]
  const initials = new Map()
  for (const person of people) {
    const name = person.querySelector('.participants-item__display-name')?.textContent.trim()
    const icon = person.querySelector('.participants-item__avatar')
    if (!name || !icon) continue
    if (icon.tagName === 'IMG') {
      zoomNamesByAvatar.set(icon.src,
        zoomNamesByAvatar.has(icon.src) && zoomNamesByAvatar.get(icon.src) !== name ? null : name)
    } else {
      const key = `${icon.textContent.trim()}|${icon.style.backgroundColor}`
      initials.set(key, initials.has(key) && initials.get(key) !== name ? null : name)
    }
  }
  if (count && people.length === count) zoomNamesByInitial = initials
  let changed = false
  for (const entry of entries) {
    const name = zoomNamesByAvatar.get(entry.avatar)
    if (name && entry.speaker.startsWith('Speaker ') && entry.speaker !== name) {
      entry.speaker = name
      changed = true
    }
  }
  return changed
}

function zoomRows() {
  const overlay = document.querySelector('.live-transcription-subtitle__content')
  if (!overlay) return null
  const namesChanged = zoomLearnNames()
  const rows = []
  for (const b of overlay.querySelectorAll('[id="live-transcription-subtitle"]')) {
    const text = b.querySelector('.live-transcription-subtitle__item')?.textContent.trim()
    if (!text) continue
    const icon = b.querySelector('.zmu-data-selector-item__icon')
    const avatar = b.querySelector('img')?.src || ''
    const fallback = icon?.textContent.trim() || zoomSpeaker(avatar)
    const initialKey = `${icon?.textContent.trim()}|${icon?.style.backgroundColor}`
    const speaker = icon?.getAttribute('title') || icon?.getAttribute('aria-label') ||
      icon?.getAttribute('alt') || zoomNamesByAvatar.get(avatar) ||
      zoomNamesByInitial.get(initialKey) || fallback
    rows.push({ el: b, speaker, avatar, text, fallback })
  }
  return rows.length ? { via: 'zoom subtitle overlay', rows, namesChanged } : null
}

/** The same caption among the last few captured, if it is already there. */
function recentDuplicate(speaker, avatar, text) {
  return entries.slice(-8).find((e) => e.speaker === speaker && e.text === text && (!ZOOM || e.avatar === avatar))
}

function captureRows(found) {
  let dirty = !!found.namesChanged
  for (const { el, speaker, avatar, text, fallback } of found.rows) {
    let entry = seen.get(el)
    if (entry && ZOOM && entry.speaker === fallback && speaker !== fallback && entry.avatar === avatar) {
      entry.speaker = speaker
      dirty = true
    }
    if (entry && ZOOM && (entry.speaker !== speaker || entry.avatar !== avatar)) entry = null
    if (!entry) {
      // Teams virtual list recycles/remounts DOM nodes on scroll: an already
      // captured caption can come back as a fresh element. Re-adopt, not dup.
      const dup = recentDuplicate(speaker, avatar, text)
      if (dup) {
        seen.set(el, dup)
        continue
      }
      entry = { speaker, avatar, text, time: new Date().toISOString() }
      seen.set(el, entry)
      entries.push(entry)
      dirty = true
    } else if (entry.text !== text) {
      // Caption recognition can revise earlier words, not only append.
      entry.text = text
      dirty = true
    }
  }
  return dirty
}

let idleTicks = 0

timers.push(
  setInterval(() => {
    if (dead) return
    const found = ZOOM ? zoomRows() : TEAMS ? teamsRows() : knownRows() || heuristicRows()

    if (!found) {
      if (++idleTicks === 30 && entries.length === 0 && !TEAMS && !ZOOM) {
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
    if (!meetingId) initMeeting((ZOOM ? 'zm-' : 'tms-') + Date.now())

    if (found.via !== lastVia) {
      lastVia = found.via
      console.log(TAG, 'capturing via:', found.via)
    }

    if (captureRows(found)) {
      // Until the session and its stored entries load, adoptSession flushes
      // these buffered captions even if the DOM never changes again.
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
// Once captions were on and then go off while the call toolbar is still
// there, the user turned them off: stop re-enabling until they turn them on.
let ccWasOn = false
let ccUserOff = false
let zoomOpenClicks = 0
/** Attempts to open Zoom's participants pane before settling for initials. */
const ZOOM_OPEN_TRIES = 5
const TEAMS_MORE =
  '#callingButtons-showMoreBtn, [data-tid="more-button"], [data-tid="call-more-menu-trigger"]'
function zoomCcButton() {
  return document.querySelector('svg.SvgCaptions')?.closest('button')
}
function zoomOpenParticipants() {
  if (document.querySelector('#participants-unified-list')) {
    zoomOpenClicks = 0
    return
  }
  if (zoomOpenClicks >= ZOOM_OPEN_TRIES) {
    // Said once, then left alone until the pane opens (which resets the count):
    // capture carries on with the caption's initials/avatar as the speaker.
    if (zoomOpenClicks === ZOOM_OPEN_TRIES) {
      console.warn(TAG, `Zoom participants pane did not open after ${ZOOM_OPEN_TRIES} clicks; speaker names fall back to initials/avatar.`)
      zoomOpenClicks++
    }
    return
  }
  const button = zoomParticipantsButton()
  if (/^open the participants list pane/i.test(button?.getAttribute('aria-label') || '')) {
    button.click()
    zoomOpenClicks++
  }
}
// Meet's CC control: the material icon ligature first, then its aria-label
// ("Turn on captions (c)" / "Aktifkan teks"), for toolbars that render the
// icon as a <span> or an SVG without ligature text.
const MEET_CC_LABEL = /^(turn (on|off) captions|(aktifkan|nonaktifkan) teks)/i
const MEET_CC_OFF_LABEL = /^(turn off captions|nonaktifkan teks)/i
function meetCcButton() {
  const icon = [...document.querySelectorAll('button i, button span')].find((i) =>
    i.textContent.trim().startsWith('closed_caption'),
  )
  return icon?.closest('button') ||
    [...document.querySelectorAll('button[aria-label]')].find((b) =>
      MEET_CC_LABEL.test(b.getAttribute('aria-label')),
    )
}
// Meet UI seen 2026-11: no CC toggle in the toolbar. "Captions and
// translation" opens a dialog, and the "Live captions" chip inside it is the
// old toggle moved: aria-label "Turn on captions", icon closed_caption_off —
// so meetCcButton finds it once the dialog is open. The panel button's
// pressed state is the panel, not captions; ccOn reads the captions region,
// which this UI still mounts as KPn5nb/.vNKgIf.
// ponytail: English panel label only (verified); add other locales when seen.
const MEET_CC_PANEL = /^captions and translation/i
function meetCcPanelButton() {
  return [...document.querySelectorAll('button[aria-label]')].find((b) =>
    MEET_CC_PANEL.test(b.getAttribute('aria-label')),
  )
}
async function meetEnableCcViaPanel(panel) {
  if (ccBusy) return
  ccBusy = true
  try {
    if (panel.getAttribute('aria-expanded') !== 'true') {
      panel.click()
      await sleep(600)
    }
    // Matched by its captions icon/label, never by position: the
    // "Translate speech" chip sits right beside it.
    const chip = meetCcButton()
    ccClicks++
    // The captions region may only mount once someone speaks, so ccOn can be
    // false with captions already on: never click a chip that reads as on.
    const chipOn =
      chip &&
      (chip.getAttribute('aria-pressed') === 'true' ||
        MEET_CC_OFF_LABEL.test(chip.getAttribute('aria-label') || ''))
    if (chipOn) {
      console.log(TAG, 'Live captions already on, waiting for speech.')
    } else if (chip) {
      chip.click()
      console.log(TAG, 'auto-enabled captions via panel, attempt', ccClicks)
      await sleep(300)
    } else {
      const dialog = document.querySelector('[role="dialog"]')
      console.warn(
        TAG,
        'Live captions chip not found. Panel:',
        dialog ? dialog.outerHTML.slice(0, 3000) : 'NOT FOUND',
      )
    }
    if (panel.getAttribute('aria-expanded') === 'true') panel.click() // close it again
  } finally {
    ccBusy = false
  }
}
// still in the call = the toolbar control we would click is mounted
const inCallToolbar = () =>
  !!(ZOOM ? zoomCcButton() : TEAMS ? document.querySelector(TEAMS_MORE) : meetCcButton() || meetCcPanelButton())
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
    const more = document.querySelector(TEAMS_MORE)
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
        'CC menu not found. Turn it on manually: More → Language and speech → ' +
          'Turn on live captions. Permanen: Settings → Accessibility → Always keep captions on.',
      )
    }
  } finally {
    ccBusy = false
  }
}

// --- meeting title from the page ---
// Meet names the tab "Meet - <title>"; an instant meeting only has its code
// there. Teams names it "<app section> | <title> | Microsoft Teams" and renames
// it when the viewer moves to another Teams app (a chat shows a person's name),
// so the title is read once, on the first captions tick — before that is
// likely. Opening the in-meeting chat panel leaves it alone. Both formats hang
// off brand names rather than localized labels. Verified on Meet and Teams
// web, 2026-09.
//
// It only fills an empty `title:<id>`: a rename in the dashboard, or a capture
// on an earlier join, always wins, and the AI-derived name (background.ts)
// only fills a title that is still empty once the meeting is analysed.
const MEET_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/
let titleChecked = false

function pageMeetingTitle() {
  let raw = document.title
  try {
    raw = window.top.document.title // the call can run in a same-origin frame
  } catch {
    /* cross-origin top: this frame's own title is all there is */
  }
  raw = raw.replace(/^\(\d+\)\s*/, '').trim() // unread-count prefix
  if (TEAMS) {
    const parts = raw.split(' | ').map((p) => p.trim())
    const shaped = parts.length >= 3 && parts[parts.length - 1] === 'Microsoft Teams'
    return shaped ? parts[parts.length - 2] : ''
  }
  if (ZOOM) return ''
  const title = raw.match(/^Meet\s*[-–—]\s*(.+)$/)?.[1]?.trim() ?? ''
  return MEET_CODE.test(title) ? '' : title
}

function captureMeetingTitle() {
  if (titleChecked || !meetingId || dead) return
  titleChecked = true
  const title = pageMeetingTitle().slice(0, 200)
  if (!title) return
  const key = `title:${meetingId}`
  try {
    chrome.storage.local.get(key, (r) => {
      if (typeof r[key] === 'string' && r[key]) return // renamed, or captured on an earlier join
      store({ [key]: title })
      console.log(TAG, 'meeting title from the page:', title)
    })
  } catch {
    die()
  }
}

// --- Meet: caption language follows the "Meeting language" setting ---
// Meet recognises speech in whatever caption language is selected, so an
// Indonesian meeting under the English default captions as garbled English
// and every downstream note inherits it. Meet's choice is per viewer ("the
// captions are turned on only for you"), which is what makes setting it
// without asking acceptable. Teams gets a confirmation-gated button instead
// (below): its spoken language applies to everyone in the meeting.
//
// Hook: the option's `data-value` is a BCP-47 tag that does not follow the
// UI language, unlike every label around it. The options are mounted once
// captions are on, without opening caption settings; a plain click on the
// combobox and then the option switches it, with no confirmation dialog.
// Verified on Meet web, 2026-09.
//
// Applied once per page (and again after the setting changes): a viewer who
// switches back by hand mid-meeting keeps their choice.
const MEET_CAPTION_LANG = { id: 'id-ID', en: 'en-US' }
let captionLangSettled = false
let captionLangTries = 0
let captionLangBusy = false

/** 'id' | 'en', or null for "Don't change" (and anything unrecognised). */
function wantedMeetingLang() {
  if (MEETING_LANG_PREF === 'ui') return LANG
  return MEETING_LANG_PREF === 'id' || MEETING_LANG_PREF === 'en' ? MEETING_LANG_PREF : null
}

function wantedCaptionLang() {
  const lang = wantedMeetingLang()
  return lang ? MEET_CAPTION_LANG[lang] : null
}

async function meetApplyCaptionLang() {
  const tag = wantedCaptionLang()
  if (!tag || captionLangSettled || captionLangBusy) return
  if (captionLangTries >= 3) return // Meet moved things: stop, capture carries on

  const selector = `[role="listbox"] li[role="option"][data-value="${tag}"]`
  const options = document.querySelectorAll(selector)
  if (!options.length) return // caption settings not mounted yet — next tick
  if (options.length > 1) {
    // e.g. a translated-captions target list offering the same tags: never
    // guess which list is which
    captionLangSettled = true
    console.warn(TAG, 'caption language: more than one list offers', tag, '— leaving it alone.')
    return
  }
  const option = options[0]
  if (option.getAttribute('aria-selected') === 'true') {
    captionLangSettled = true
    reportLangStatus('already')
    return
  }

  let combobox = null
  for (let n = option.closest('[role="listbox"]')?.parentElement; n && !combobox; n = n.parentElement) {
    combobox = n.querySelector('[role="combobox"]')
  }
  if (!combobox) return

  captionLangBusy = true
  captionLangTries++
  reportLangStatus('working')
  try {
    combobox.click()
    await sleep(400)
    option.click()
    await sleep(800)
    // Meet leaves focus on the closed menu, which Chrome then reports as
    // focus hidden under aria-hidden
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (document.querySelector(`${selector}[aria-selected="true"]`)) {
      captionLangSettled = true
      reportLangStatus('updated')
      console.log(TAG, 'caption language set to', tag)
    } else {
      console.warn(TAG, 'caption language: could not select', tag, '— attempt', captionLangTries)
      if (captionLangTries >= 3) reportLangStatus('failed')
    }
  } finally {
    captionLangBusy = false
  }
}

// --- badge: what is happening to the caption language ---
// Both platforms report here so the viewer sees that captions are being set
// to the Meeting language, and how it went. Reports travel to the top frame,
// where the badge lives; a pending note expires on its own so a vanished
// menu cannot leave the badge stuck. On Teams the same element doubles as the
// "set spoken language" button when there is nothing to report.
const LANG_NOTE = {
  working: 'captionsWorking',
  confirm: 'teamsConfirm',
  updated: TEAMS ? 'teamsUpdated' : 'captionsUpdated',
  already: TEAMS ? 'teamsUpdated' : 'captionsUpdated',
  cancelled: 'teamsCancelled',
  locked: 'teamsLocked',
  failed: TEAMS ? 'teamsFailed' : 'captionsFailed',
}
let langDone = false
let langNote = null // { key, until }

const reportLangStatus = (status) => window.top.postMessage({ __meetcc: 'lang-status', status }, '*')

const langInProgress = () =>
  !!langNote && Date.now() < langNote.until && (langNote.key === LANG_NOTE.working || langNote.key === LANG_NOTE.confirm)

function onLangStatus(status) {
  if (status === 'idle') {
    langNote = null // an automatic attempt gave up quietly
    teamsLangBusy = false
    return
  }
  const key = LANG_NOTE[status]
  if (!key) return
  const pending = status === 'working' || status === 'confirm'
  langNote = { key, until: Date.now() + (pending ? 300_000 : 5000) }
  if (pending) return
  teamsLangBusy = false
  langDone = status === 'updated' || status === 'already'
  console.log(TAG, 'caption language:', status)
}

function renderLangBadge(el) {
  const lang = wantedMeetingLang()
  const noting = !!langNote && Date.now() < langNote.until
  // Meet has nothing to click, so its note only shows while there is news
  el.hidden = !lang || (TEAMS ? langDone && !noting : !noting)
  if (lang) el.textContent = T(noting ? langNote.key : 'teamsSetLang', { lang: T(`lang_${lang}`) })
}

if (TOP) {
  addEventListener('message', (e) => {
    if (e.data?.__meetcc === 'lang-status') onLangStatus(e.data.status)
  })
}

// --- Teams: offer to switch the meeting's spoken language ---
// Unlike Meet, Teams' spoken language applies to everyone in the meeting, so
// it never changes without the user. With a Meeting language set, once
// captions are on this opens captions settings → Meeting spoken language and
// picks the option, which makes Teams ask "Is this the language that everyone
// is speaking?". The user answers that dialog; this code never clicks Update.
// It asks once per page, only while the page has focus and nobody is typing
// (an Enter meant for the chat must not confirm it). The badge button runs the
// same flow on demand, e.g. after a Cancel.
//
// Hooks are Microsoft's data-tid test attributes. Options carry the locale in
// lowercase (`…-spoken-language-id-id`); recently used ones repeat under a
// `saved-` prefix, and only that copy is marked aria-checked. The menus close
// the moment the page loses focus. Verified on Teams web as organizer, 2026-09.
//
// The badge lives in the top frame but the call can sit in an iframe, so the
// request is posted to every frame and handled by whichever holds the
// captions settings button.
const TEAMS_SPOKEN_LANG = { id: 'id-id', en: 'en-us' }
const TEAMS_CC_SETTINGS = 'button[data-tid="closed-captions-settings-menu-trigger-button"]'
const TEAMS_SPOKEN_ITEM = '[role="menuitem"][data-tid="captions-settings-redesign-spoken-language"]'
const TEAMS_SPOKEN_PREFIX = 'captions-settings-redesign-spoken-language-'
const TEAMS_CONFIRM = 'confirm-spoken-language-change-dialog'
let teamsLangBusy = false
let teamsAutoTried = false
let teamsFlowRunning = false

const closeTeamsMenu = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

const teamsLocaleChecked = (locale) =>
  [...document.querySelectorAll(`[role="menuitemradio"][data-tid^="${TEAMS_SPOKEN_PREFIX}"][aria-checked="true"]`)].some(
    (el) => el.getAttribute('data-tid').slice(TEAMS_SPOKEN_PREFIX.length).replace(/^saved-/, '') === locale,
  )

// Captions settings → Meeting spoken language: 'open', 'locked' or 'failed'.
async function teamsOpenSpokenMenu() {
  const trigger = document.querySelector(TEAMS_CC_SETTINGS)
  if (!trigger) return 'failed'
  if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click()
  await sleep(600)
  const item = document.querySelector(TEAMS_SPOKEN_ITEM)
  if (!item) return 'failed'
  if (item.getAttribute('aria-disabled') === 'true') return 'locked'
  item.click()
  await sleep(600)
  return 'open'
}

// Enter on the focused Update button fires its click too, so one listener
// tells an update from a cancel or close.
async function teamsAwaitAnswer(report, focusUpdate) {
  const dialog = document.querySelector(`[data-tid="${TEAMS_CONFIRM}"]`)
  if (!dialog) return 'failed'
  const update = dialog.querySelector(`[data-tid="${TEAMS_CONFIRM}-update-button"]`)
  let confirmed = false
  update?.addEventListener('click', () => (confirmed = true), { once: true })
  if (focusUpdate) update?.focus() // only right after the user clicked our button
  report('confirm')
  for (let i = 0; i < 600 && document.querySelector(`[data-tid="${TEAMS_CONFIRM}"]`); i++) {
    await sleep(500) // up to five minutes for an answer
  }
  return confirmed ? 'updated' : 'cancelled'
}

async function teamsPickSpokenLanguage(locale, report, focusUpdate) {
  const menu = await teamsOpenSpokenMenu()
  const option = document.querySelector(`[role="menuitemradio"][data-tid="${TEAMS_SPOKEN_PREFIX}${locale}"]`)
  if (menu !== 'open' || !option) {
    closeTeamsMenu()
    return menu === 'open' ? 'failed' : menu
  }
  if (teamsLocaleChecked(locale) || option.getAttribute('aria-disabled') === 'true') {
    closeTeamsMenu()
    return teamsLocaleChecked(locale) ? 'already' : 'locked'
  }
  option.click()
  await sleep(800)
  return teamsAwaitAnswer(report, focusUpdate)
}

// One flow at a time per frame: the automatic ask and the badge button share it.
async function teamsSetSpokenLanguage(locale, report, focusUpdate) {
  if (teamsFlowRunning) return null
  teamsFlowRunning = true
  try {
    return await teamsPickSpokenLanguage(locale, report, focusUpdate)
  } finally {
    teamsFlowRunning = false
  }
}

const isTyping = () => {
  const el = document.activeElement
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

// Runs from the captions tick in the frame that holds the captions UI.
async function teamsAutoPrompt() {
  const lang = wantedMeetingLang()
  if (!lang || teamsAutoTried || teamsFlowRunning) return
  if (!document.hasFocus() || isTyping() || !document.querySelector(TEAMS_CC_SETTINGS)) return // next tick
  teamsAutoTried = true
  reportLangStatus('working')
  const status = await teamsSetSpokenLanguage(TEAMS_SPOKEN_LANG[lang], reportLangStatus, false)
  if (status && status !== 'failed') return reportLangStatus(status)
  // a failed automatic attempt only logs: the badge button is still there
  reportLangStatus('idle')
  if (status === 'failed') console.warn(TAG, 'spoken language: automatic ask did not reach the Teams menu')
}

// Top frame: the badge button asks every frame; one of them answers.
function requestTeamsLang() {
  const lang = wantedMeetingLang()
  // the automatic ask may be working, or have Teams' dialog on screen already
  if (!lang || teamsLangBusy || langInProgress()) return
  teamsLangBusy = true
  onLangStatus('working')
  const msg = { __meetcc: 'teams-set-lang', locale: TEAMS_SPOKEN_LANG[lang] }
  window.postMessage(msg, '*')
  for (let i = 0; i < window.frames.length; i++) window.frames[i].postMessage(msg, '*')
  // no frame holds the captions settings button: nobody answers
  setTimeout(() => {
    if (teamsLangBusy && langNote?.key === LANG_NOTE.working) onLangStatus('failed')
  }, 5000)
}

if (TEAMS) {
  // every frame: act only for the top frame, and only where the menu lives
  addEventListener('message', async (e) => {
    const d = e.data
    if (!d || d.__meetcc !== 'teams-set-lang' || e.source !== window.top) return
    if (!/^[a-z]{2,3}-[a-z]{2}$/.test(d.locale) || !document.querySelector(TEAMS_CC_SETTINGS)) return
    const status = await teamsSetSpokenLanguage(d.locale, reportLangStatus, true)
    if (status) reportLangStatus(status) // null: the automatic ask is already on screen
  })
}

timers.push(
  setInterval(() => {
    if (dead) return
    if (ccOn()) {
      ccClicks = 0
      ccWasOn = true
      ccUserOff = false // turned back on: capture resumes
      if (!meetingId) initMeeting((ZOOM ? 'zm-' : 'tms-') + Date.now())
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
      captureMeetingTitle()
      if (ZOOM) zoomOpenParticipants()
      if (!ZOOM) void (TEAMS ? teamsAutoPrompt() : meetApplyCaptionLang())
      return
    }
    if (ccWasOn && inCallToolbar()) ccUserOff = true
    if (ccUserOff) return // user turned captions off: leave them off
    if (ZOOM) return // the sample only proves the on-state; never toggle blindly
    if (ccClicks >= 5) return // selector churned? stop before toggle-looping
    if (TEAMS) {
      void teamsEnableCc()
      return
    }
    const btn = meetCcButton()
    if (btn) {
      btn.click()
      ccClicks++
      console.log(TAG, 'auto-enabled captions, attempt', ccClicks)
      return
    }
    const panel = meetCcPanelButton()
    if (panel) void meetEnableCcViaPanel(panel)
  }, 3000),
)

// --- meeting heartbeat: powers the live/ended list in the UI ---
// gated on the captions region actually being mounted: when the call ends
// the heartbeat stops and background.js picks the meeting up as "finished".
let startedAt = null
timers.push(
  setInterval(() => {
    if (dead || !announced || !meetingId) return // not in a call yet
    // left the call; CC switched off by the user still counts as in-call
    if (!ccOn() && !(ccUserOff && inCallToolbar())) return
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
    `<div id="hd">${ZOOM ? 'Zoom' : TEAMS ? 'Teams' : 'Meet'} CC — live` +
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
  // caption-language status; on Teams also the "set spoken language" button
  const langBadge = document.createElement('span')
  langBadge.hidden = true
  langBadge.style.cssText =
    'color:#0f131b;background:#46e394;border-radius:8px;padding:0 6px' + (TEAMS ? ';cursor:pointer' : '')
  if (TEAMS) {
    langBadge.onclick = (e) => {
      e.stopPropagation() // the badge itself toggles the floating transcript
      requestTeamsLang()
    }
  }
  badge.append(langBadge)
  document.documentElement.appendChild(badge)
  timers.push(
    setInterval(() => {
      if (dead) return // die() owns the badge once the context is gone
      badgeLabel.textContent = `MeetCC ${pipWin && !pipWin.closed ? '▣' : '✓'} ${entries.length}`
      renderLangBadge(langBadge)
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
