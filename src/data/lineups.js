// Committed lineup overrides, keyed by ESPN event id.
//
// The app normally reads starters/bench from ESPN's live box score
// (services/summary.js). This file is a manual fallback for games whose lineups
// are announced before ESPN posts a box score — currently just the All-Star Game,
// whose drafted rosters ESPN doesn't carry until near tip. GameSummary shows this
// only while `summary.data.box` is absent; the moment ESPN posts a real box score,
// ESPN wins and this is ignored.
//
// NOT auto-generated (WNBA.com is bot-blocked and client-rendered). Populated by hand
// from the official announcements:
//   Rosters:  https://www.wnba.com/allstar/2026/roster
//   Starters: https://www.wnba.com/news/all-star-starters-2026  (10 starters =
//             4 guards + 6 frontcourt; the other 12 are the coach-voted reserves)
// Sourced 2026-07-22. Team names (Team Coop / Team Spoon) honor GMs Cynthia Cooper
// and Teresa Weatherspoon; on-court captains are Paige Bueckers and Caitlin Clark.
//
// Replacements (injured player → replacement), applied as announced:
//   Kelsey Plum (LA) → Kahleah Copper (PHX), Team Coop reserve. 2026-07-22.
//   https://www.wnba.com/news/kahleah-copper-named-2026-all-star-game-replacement
// (A Sykes/Jones "replacement" article also surfaces in related links but is the 2025
// game — do not apply it here.)

export const LINEUPS = {
  // AT&T WNBA All-Star Game — United Center, Chicago, 2026-07-25
  '401857320': {
    sides: [
      {
        abbr: 'SPO',
        name: 'Team Spoon',
        starters: [
          { id: '1642286', name: 'Caitlin Clark', jersey: '22', pos: 'G' },
          { id: '1628932', name: "A'ja Wilson", jersey: '22', pos: 'C' },
          { id: '1643426', name: 'Olivia Miles', jersey: '5', pos: 'G' },
          { id: '1641648', name: 'Aliyah Boston', jersey: '7', pos: 'C-F' },
          { id: '1629491', name: 'Jessica Shepard', jersey: '32', pos: 'F' },
        ],
        bench: [
          { id: '1631009', name: 'Rhyne Howard', jersey: '10', pos: 'G' },
          { id: '1628277', name: 'Allisha Gray', jersey: '15', pos: 'G' },
          { id: '1627673', name: 'Jonquel Jones', jersey: '35', pos: 'C' },
          { id: '1627675', name: 'Courtney Williams', jersey: '10', pos: 'G' },
          { id: '1642792', name: 'Kiki Iriafen', jersey: '44', pos: 'F' },
          { id: '203014', name: 'Nneka Ogwumike', jersey: '30', pos: 'F' },
        ],
      },
      {
        abbr: 'COOP',
        name: 'Team Coop',
        starters: [
          { id: '1642784', name: 'Paige Bueckers', jersey: '5', pos: 'G' },
          { id: '1627668', name: 'Breanna Stewart', jersey: '30', pos: 'F' },
          { id: '1628909', name: 'Kelsey Mitchell', jersey: '0', pos: 'G' },
          { id: '203827', name: 'Natasha Howard', jersey: '1', pos: 'F' },
          { id: '1628931', name: 'Gabby Williams', jersey: '1', pos: 'F' },
        ],
        bench: [
          { id: '1642291', name: 'Angel Reese', jersey: '5', pos: 'F' },
          { id: '1629497', name: 'Marina Mabrey', jersey: '3', pos: 'G' },
          { id: '1642798', name: 'Dominique Malonga', jersey: '14', pos: 'C' },
          { id: '2998938', name: 'Kahleah Copper', jersey: '2', pos: 'G-F' },
          { id: '1629498', name: 'Jackie Young', jersey: '0', pos: 'G' },
          { id: '1642785', name: 'Sonia Citron', jersey: '22', pos: 'G' },
        ],
      },
    ],
  },
}
