// The man on the phone: one call per day, a list of jobs, and you can't sleep
// until they're done.
import { mulberry32, hash } from './util.js';

const T = {
  metal: (n) => ({ type: 'collect', key: 'metal', target: n, label: `Collect ${n} scrap metal` }),
  electronics: (n) => ({ type: 'collect', key: 'electronics', target: n, label: `Collect ${n} electronics` }),
  almond: (n) => ({ type: 'collect', key: 'almond', target: n, label: `Collect ${n} bottles of almond water` }),
  gunpowder: (n) => ({ type: 'collect', key: 'gunpowder', target: n, label: `Collect ${n} gunpowder` }),
  craftGun: () => ({ type: 'craft', key: 'gun', target: 1, label: 'Craft a gun' }),
  craftMine: (n) => ({ type: 'craft', key: 'landmine', target: n, label: n > 1 ? `Craft ${n} landmines` : 'Craft a landmine' }),
  craftKart: () => ({ type: 'craft', key: 'kart', target: 1, label: 'Build a go-kart' }),
  checkGen: (n) => ({ type: 'gen', key: 'gen', target: n, label: n > 1 ? `Inspect ${n} different generators` : 'Inspect a generator' }),
  pool: () => ({ type: 'visit', key: 'pool', target: 1, label: 'Find the pool rooms' }),
  jackpot: () => ({ type: 'visit', key: 'jackpot', target: 1, label: 'Find a supply cache (jackpot room)' }),
  killSpider: () => ({ type: 'kill', key: 'spider', target: 1, label: 'Kill a giant spider' }),
  killBulb: () => ({ type: 'kill', key: 'bulb', target: 1, label: 'Destroy a light-bulb creature (don\'t look too long)' }),
  travel: (n) => ({ type: 'travel', key: 'dist', target: n, label: `Travel ${n}m from the base` }),
  restore: () => ({ type: 'restore', key: 'restore', target: 1, label: 'Restore power at a generator' }),
};

export function objectivesForDay(seed, day) {
  let list;
  if (day === 1) list = [T.metal(3), T.gunpowder(1), T.craftGun()];
  else if (day === 2) list = [T.electronics(2), T.craftMine(1), T.checkGen(1)];
  else if (day === 3) list = [T.metal(5), T.pool(), T.killSpider()];
  else {
    const rnd = mulberry32(hash(seed, day, 7, 99) * 4294967296);
    const pool = [
      () => T.metal(4 + Math.min(8, day)), () => T.electronics(2 + Math.floor(day / 2)), () => T.gunpowder(2),
      () => T.craftMine(2), () => T.checkGen(2), () => T.pool(), () => T.killSpider(), () => T.killBulb(),
      () => T.travel(120 + day * 20), () => T.almond(2),
    ];
    if (day >= 4) pool.push(() => T.craftKart());
    if (day >= 5) pool.push(() => T.jackpot(), () => T.restore());
    list = [];
    const used = new Set();
    while (list.length < 3) {
      const i = Math.floor(rnd() * pool.length);
      if (used.has(i)) continue;
      used.add(i);
      list.push(pool[i]());
    }
  }
  return list.map((o) => ({ ...o, n: 0, done: false }));
}

const LINES = {
  1: [
    "...Hello? Good. You're awake.",
    "Listen carefully. You noclipped out of reality. This is the Backrooms.",
    "That bed is the only safe place. Die out there, and you'll wake up in it. Your things stay with you.",
    "You'll need protection. Find scrap metal and gunpowder lying around. Build yourself a gun.",
    "And if you see something on the walls... break line of sight. Take turns. Lose it.",
    "I'll call again tomorrow. You can't sleep until the job's done.",
  ],
  2: [
    "You made it through the night. Most don't.",
    "The power out there is... unreliable. When the lights die, press F for your flashlight and find a generator. Check your map.",
    "Go inspect one so you know what they look like. And build a landmine. Metal and electronics.",
    "Oh — if you see a man with a light bulb for a head... don't stare at it.",
  ],
  3: [
    "Day three. Still breathing. Good.",
    "There are rooms with water out there. The pool rooms. Find them.",
    "And it's time you stopped running from the spiders.",
  ],
};
const GENERIC = [
  "Another day. The hum never stops, does it?",
  "I have more work for you. Don't ask why.",
  "They're getting bolder. So should you.",
  "You're doing well. Better than the last one.",
  "Don't trust the quiet. Here's today's list.",
];

export function dialogueForDay(seed, day, objectives) {
  const lines = LINES[day] ? [...LINES[day]] : [GENERIC[Math.floor(hash(seed, day, 3) * GENERIC.length)]];
  if (!LINES[day]) {
    lines.push(...objectives.map((o) => o.label + '.'));
    lines.push('Then sleep.');
  }
  return lines;
}
