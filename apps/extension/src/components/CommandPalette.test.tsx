// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchHit } from '@meetcc/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// the palette's only outside dependency is the service worker round-trip
const search = vi.fn<(query: string, sessionId?: string) => Promise<SearchHit[]>>();
vi.mock('../lib/db', () => ({ search: (q: string, s?: string) => search(q, s) }));

const { CommandPalette } = await import('./CommandPalette');

const hit = (over: Partial<SearchHit>): SearchHit =>
  ({
    kind: 'transcript',
    sessionId: 'room#1000',
    sessionTitle: 'Incident Freeport',
    entityId: 1,
    text: 'Kita pakai shared service',
    speaker: 'Akbar',
    time: '2026-08-24T07:00:00.000Z',
    score: 1,
    ...over,
  }) as SearchHit;

function setup(over: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onOpenMeeting: vi.fn(),
    onAskAll: vi.fn(),
    ...over,
  };
  render(<CommandPalette {...props} />);
  return props;
}

beforeEach(() => {
  search.mockReset();
  search.mockResolvedValue([]);
});
afterEach(cleanup);

describe('CommandPalette', () => {
  it('does not query until the input passes the minimum length', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Kata kunci pencarian'), 'a');

    expect(screen.getByText('Ketik minimal 2 huruf.')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 300));
    expect(search).not.toHaveBeenCalled();
  });

  it('renders hits grouped under their meeting title', async () => {
    search.mockResolvedValue([
      hit({}),
      hit({ kind: 'decision', entityId: 7, text: 'Pakai shared service', speaker: undefined }),
      hit({ sessionId: 'room#2000', sessionTitle: 'Sprint review', entityId: 2 }),
    ]);
    setup();
    await userEvent.type(screen.getByLabelText('Kata kunci pencarian'), 'shared');

    await waitFor(() => expect(search).toHaveBeenCalledWith('shared', undefined));
    expect(await screen.findByText('Incident Freeport')).toBeTruthy();
    expect(screen.getByText('Sprint review')).toBeTruthy();
    expect(screen.getByText('Keputusan')).toBeTruthy();
  });

  it('opens the meeting behind the keyboard cursor on Enter', async () => {
    search.mockResolvedValue([
      hit({}),
      hit({ sessionId: 'room#2000', sessionTitle: 'Sprint review', entityId: 2 }),
    ]);
    const props = setup();
    const input = screen.getByLabelText('Kata kunci pencarian');
    await userEvent.type(input, 'shared');
    await screen.findByText('Incident Freeport');

    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(props.onOpenMeeting).toHaveBeenCalledWith('room#2000');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('surfaces a failed search instead of showing an empty result set', async () => {
    search.mockRejectedValue(new Error('Database tidak merespons.'));
    setup();
    await userEvent.type(screen.getByLabelText('Kata kunci pencarian'), 'shared');

    expect(await screen.findByText('Database tidak merespons.')).toBeTruthy();
    expect(screen.queryByText('Tidak ada hasil.')).toBeNull();
  });
});
