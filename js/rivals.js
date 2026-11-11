/* Rivalry games, as pairs of ESPN team ids. They're among the most watched and talked-about games every year whatever
   the teams' records (Texas–Oklahoma with Oklahoma unranked still drew the 10th-most betting of 2026), so the pregame
   score (excitement.js) gives them points of their own. Keep the names beside the ids. */
const PAIRS = [
  [251, 201],   // Texas – Oklahoma (Red River)
  [194, 130],   // Ohio State – Michigan (The Game)
  [333, 2],     // Alabama – Auburn (Iron Bowl)
  [52, 2390],   // Florida State – Miami
  [57, 61],     // Florida – Georgia
  [30, 87],     // USC – Notre Dame
  [349, 2426],  // Army – Navy
  [2483, 264],  // Oregon – Washington
  [228, 2579],  // Clemson – South Carolina
  [61, 59],     // Georgia – Georgia Tech
  [57, 52],     // Florida – Florida State
  [145, 344],   // Ole Miss – Mississippi State (Egg Bowl)
  [130, 127],   // Michigan – Michigan State
  [251, 245],   // Texas – Texas A&M
  [201, 197],   // Oklahoma – Oklahoma State (Bedlam)
  [333, 2633],  // Alabama – Tennessee (Third Saturday in October)
  [99, 333],    // LSU – Alabama
  [2294, 66],   // Iowa – Iowa State
  [2305, 2306], // Kansas – Kansas State
  [254, 252],   // Utah – BYU (Holy War)
  [24, 25],     // Stanford – California (Big Game)
  [26, 30],     // UCLA – USC
  [135, 275],   // Minnesota – Wisconsin (Axe)
  [84, 2509],   // Indiana – Purdue (Bucket)
  [221, 277],   // Pittsburgh – West Virginia (Backyard Brawl)
  [97, 96],     // Louisville – Kentucky
  [258, 259],   // Virginia – Virginia Tech
  [153, 152],   // North Carolina – NC State
  [153, 150],   // North Carolina – Duke
  [2483, 204],  // Oregon – Oregon State (Civil War)
  [264, 265],   // Washington – Washington State (Apple Cup)
  [12, 9],      // Arizona – Arizona State (Territorial Cup)
  [2, 61],      // Auburn – Georgia (Deep South's Oldest)
  [213, 194],   // Penn State – Ohio State
  [87, 2426],   // Notre Dame – Navy
  [130, 87],    // Michigan – Notre Dame
  [2390, 57],   // Miami – Florida
  [57, 99],     // Florida – LSU
  [2641, 251],  // Texas Tech – Texas
  [239, 2628],  // Baylor – TCU (Revivalry)
  [158, 2294],  // Nebraska – Iowa
  [2633, 57],   // Tennessee – Florida
  [275, 2294],  // Wisconsin – Iowa
  [38, 158],    // Colorado – Nebraska
  [2132, 97],   // Cincinnati – Louisville (Keg of Nails)
  [68, 278],    // Boise State – Fresno State
  [2005, 349],  // Air Force – Army
  [2005, 2426], // Air Force – Navy
  [8, 99],      // Arkansas – LSU
  [96, 2633],   // Kentucky – Tennessee
  [2579, 61],   // South Carolina – Georgia
  [142, 2305],  // Missouri – Kansas (Border War)
  [228, 52],    // Clemson – Florida State
  [201, 158],   // Oklahoma – Nebraska
  [254, 328]    // Utah – Utah State
];
const KEYS = new Set(PAIRS.map(([a, b]) => [a, b].sort((x, y) => x - y).join('-')));
export const isRivalry = g => KEYS.has([Number(g.home.id), Number(g.away.id)].sort((x, y) => x - y).join('-'));
