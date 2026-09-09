// docs/spike-native-messaging-installer.md "Conditions attached to this GO" #4:
// the extension must treat native-messaging failure as one of three distinct,
// machine-readable signals instead of one opaque string, so the audit log and
// the installer's own troubleshooting docs can tell "host isn't installed"
// apart from "installed under the wrong extension id" apart from Windows'
// differently-worded registration failure.
//
// Pure on purpose: only chrome.runtime.lastError.message text in, a category
// out — no chrome.*, so it is testable without a browser.

export type BridgeErrorKind = 'not_found' | 'forbidden' | 'not_registered' | 'unknown';

/** Chrome/Chromium (macOS, Linux, Windows) and the Windows-only wording
 *  documented in the spike, each a distinct silent-failure class. */
export function classifyBridgeError(message: string | undefined | null): BridgeErrorKind {
  const m = message ?? '';
  if (/forbidden/i.test(m)) return 'forbidden';
  if (/is not registered/i.test(m)) return 'not_registered'; // Windows wording
  if (/not found/i.test(m)) return 'not_found';
  return 'unknown';
}
