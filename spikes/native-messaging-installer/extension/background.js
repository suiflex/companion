// MV3 service worker fixture: exercises the three native-messaging paths the spike needs:
//   1. normal round-trip (fresh operation_id)            -> expect {status:'ok', applied:true}
//   2. duplicated delivery (same operation_id again)     -> expect {status:'duplicate', applied:false}
//   3. host absent (never registered)                    -> expect lastError 'not found'
// Runs on onInstalled AND onStartup (so a Chrome restart re-runs it). Results are POSTed
// to a local receiver because service-worker console is not observable from the shell.
'use strict';

const HOST = 'com.meetcc.spike.bridge';
const MISSING_HOST = 'com.meetcc.nonexistent';
const RECEIVER = 'http://127.0.0.1:17777/report';

function sendOnce(hostName, opId) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(hostName, { operation_id: opId, payload: { kind: 'fixture_capture', lines: 3 } }, (resp) => {
      const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
      resolve({ opId, response: resp || null, error: err });
    });
  });
}

async function postReport(results) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(RECEIVER, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(results)
      });
      if (r.ok || r.status === 204) return true;
    } catch { /* receiver down, retry */ }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return false;
}

async function runFixture() {
  const results = {
    when: new Date().toISOString(),
    origin: location.origin, // the REAL extension origin, straight from Chrome
    version: chrome.runtime.getManifest().version
  };
  try {
    const firstOp = crypto.randomUUID();
    results.first = await sendOnce(HOST, firstOp);
    // A4: deliberate duplicate delivery of the SAME operation (bridge+cloud double-delivery shape)
    results.dup = await sendOnce(HOST, firstOp);
    // degrade path: a host that was never registered
    results.missing = await sendOnce(MISSING_HOST, crypto.randomUUID());
  } catch (e) {
    results.fatal = String(e);
  }
  results.reported = await postReport(results);
}

chrome.runtime.onInstalled.addListener(runFixture);
chrome.runtime.onStartup.addListener(runFixture);
