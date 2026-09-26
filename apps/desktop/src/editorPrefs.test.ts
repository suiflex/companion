// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { loadAutosave, saveAutosave } from './editorPrefs'

beforeEach(() => localStorage.clear())

it('autosaves by default and remembers being turned off', () => {
  expect(loadAutosave()).toBe(true)
  saveAutosave(false)
  expect(loadAutosave()).toBe(false)
  saveAutosave(true)
  expect(loadAutosave()).toBe(true)
})
