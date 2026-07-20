// Which of the site owner's streaming/TV subscriptions can show a given game.
//
// A game's `broadcast` is a flat list of ESPN network names mixing national
// networks, regional sports networks, and streaming exclusives. We map that to
// the three services actually subscribed to — YouTube TV, Amazon Prime Video,
// and Peacock — so the schedule can flag what's watchable and on which service.
//
// YouTube TV is a *bundle*, not a broadcaster: it never appears in ESPN's list.
// It carries a game whenever that game airs on a linear network YouTube TV
// carries in every US market. Local/regional affiliates (KOMO, Fox 5 NY, …) are
// deliberately excluded — YouTube TV only carries those in their home market, so
// a nationwide label would be wrong. Peacock and Prime Video are streaming
// exclusives matched by exact name; the regional "Prime Video-Seattle" feed
// needs an in-market add-on beyond standard Prime, so it is excluded too.

// National linear networks YouTube TV carries in every US market.
const YOUTUBE_TV_NETWORKS = new Set([
  'ESPN',
  'ABC',
  'CBS',
  'NBC',
  'USA Net',
  'ION',
  'CNBC',
  'NBA TV',
])

// Order here is the order labels render in.
export const MY_SERVICES = [
  { key: 'youtubetv', label: 'YouTube TV', match: (name) => YOUTUBE_TV_NETWORKS.has(name) },
  { key: 'prime', label: 'Prime Video', match: (name) => name === 'Prime Video' },
  { key: 'peacock', label: 'Peacock', match: (name) => name === 'Peacock' },
]

// The services from MY_SERVICES that can show this broadcast list, in display
// order. Returns [] when nothing subscribed carries the game (League Pass-only,
// regional-only, TSN, etc.).
export function watchableServices(broadcast) {
  if (!broadcast?.length) return []
  return MY_SERVICES.filter((s) => broadcast.some((name) => s.match(name)))
}
