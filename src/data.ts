export type Bird = {
  name: string
  fact: string
  size: number // relative to a blue tit
  back: string
  belly: string
  head: string
  wing: string
  cap?: string
  beak?: string
  eye?: string
  tailUp?: boolean
}

export const birds = {
  crow: { name: 'Crow', size: 2, back: '#20202b', belly: '#1b1b25', head: '#20202b', wing: '#15151e', beak: '#5a5a66', eye: '#b4bace', fact: 'Crows recognise individual human faces and remember who has been kind to them. People who feed them regularly sometimes get little gifts back: pebbles, buttons, shiny things.' },
  bluetit: { name: 'Blue tit', size: 1, back: '#7fa35a', belly: '#f2d94e', head: '#f6f6f0', wing: '#3f7fd0', cap: '#3f7fd0', fact: 'Weighs about 11 g, roughly two sheets of paper, and happily feeds hanging upside down.' },
  greattit: { name: 'Great tit', size: 1.15, back: '#7d8f4e', belly: '#ecd640', head: '#f6f6f0', wing: '#5f7896', cap: '#15151a', fact: 'Its two-note song sounds like a squeaky bicycle pump: "tea-cher, tea-cher".' },
  sparrow: { name: 'House sparrow', size: 1.1, back: '#8b5a2b', belly: '#cfc6b8', head: '#cfc6b8', wing: '#6e4521', cap: '#7b7f86', fact: 'Lives in a tight-knit gang and rarely strays far from where it hatched.' },
  goldfinch: { name: 'Goldfinch', size: 1, back: '#b98d5a', belly: '#f4ead8', head: '#d42a20', wing: '#f2c21a', cap: '#15151a', fact: 'A flock of goldfinches is called a charm.' },
  siskin: { name: 'Siskin', size: 0.9, back: '#9fb031', belly: '#e3e06a', head: '#c8d436', wing: '#2e3018', cap: '#1c1c1c', fact: 'A small streaky-green finch that turns up at feeders most in late winter.' },
  nuthatch: { name: 'Nuthatch', size: 1.1, back: '#6f8fae', belly: '#e0a15e', head: '#eef0ee', wing: '#5d7c9a', cap: '#6f8fae', fact: 'Famous for walking down tree trunks head-first.' },
  woodpecker: { name: 'Woodpecker', size: 1.6, back: '#17171b', belly: '#f1efe8', head: '#f1efe8', wing: '#17171b', cap: '#d21f1f', fact: 'Its tongue is so long that it is anchored around the back of its skull.' },
  jay: { name: 'Jay', size: 1.7, back: '#c99a8a', belly: '#d9b0a0', head: '#c99a8a', wing: '#3f8fe0', fact: 'Buries thousands of acorns each autumn and forgets enough of them to plant new oak woods.' },
  robin: { name: 'Robin', size: 1, back: '#7a5c3e', belly: '#e2622b', head: '#e2622b', wing: '#6b4f35', cap: '#7a5c3e', fact: 'Sings nearly all year round, sometimes at night under street lamps.' },
  blackbird: { name: 'Blackbird', size: 1.5, back: '#1d1d1d', belly: '#1d1d1d', head: '#1d1d1d', wing: '#151515', beak: '#f5a623', eye: '#f5a623', fact: 'Only the males are black. Females are brown.' },
  wren: { name: 'Wren', size: 0.75, back: '#8a5a34', belly: '#b98a5e', head: '#8a5a34', wing: '#74482a', tailUp: true, fact: 'Tiny bird, enormous voice: one of the loudest songs for its size.' },
  thrush: { name: 'Song thrush', size: 1.45, back: '#8c6b43', belly: '#f0e2bf', head: '#8c6b43', wing: '#7a5c38', fact: 'Smashes snails open on a favourite stone, called an anvil.' },
} satisfies Record<string, Bird>

export type BirdId = keyof typeof birds

// typing the guest lists as BirdId[] is the self-check: a misspelt bird fails the build
export type Food = { name: string; emoji: string; birds: BirdId[]; note: string; pile: { color: string; size: number; count: number; round?: boolean } }

export const foods = {
  sunflower: { name: 'Sunflower seeds', emoji: '🌻', birds: ['bluetit', 'greattit', 'goldfinch', 'sparrow', 'nuthatch'], pile: { color: '#2d2a26', size: 0.05, count: 45 }, note: 'The all-rounder: thin shells, lots of fat. If you only buy one food, buy black sunflower seeds.' },
  nyjer: { name: 'Nyjer seed', emoji: '🌾', birds: ['goldfinch', 'siskin'], pile: { color: '#17130f', size: 0.028, count: 70 }, note: 'Tiny, oily seeds that need a feeder with very small ports. A finch magnet.' },
  suet: { name: 'Suet', emoji: '🧈', birds: ['woodpecker', 'bluetit', 'greattit', 'nuthatch', 'crow'], pile: { color: '#efe3c8', size: 0.2, count: 1, round: true }, note: 'High-energy fat, best in cold weather. Always take fat balls out of their plastic nets, because birds get tangled in them.' },
  peanuts: { name: 'Peanuts', emoji: '🥜', birds: ['jay', 'bluetit', 'greattit', 'woodpecker', 'crow'], pile: { color: '#c9a26b', size: 0.06, count: 30 }, note: 'Unsalted and unroasted only. Use a mesh feeder for small birds, or serve them in the shell on a tray for jays and crows.' },
  mealworms: { name: 'Mealworms', emoji: '🪱', birds: ['robin', 'blackbird', 'wren', 'crow'], pile: { color: '#b98045', size: 0.04, count: 40 }, note: 'Protein for the insect eaters. Dried is fine. Soak them in water first during the breeding season.' },
  fruit: { name: 'Apples', emoji: '🍎', birds: ['blackbird', 'thrush', 'crow'], pile: { color: '#c8322b', size: 0.17, count: 3, round: true }, note: 'Halved apples and pears on the ground or spiked on a branch. Soft and wrinkly is fine, mouldy is not.' },
  bread: { name: 'Bread', emoji: '🍞', birds: [], pile: { color: '#dcbc85', size: 0.25, count: 1 }, note: "The table stays empty on purpose. Birds will eat bread, but it fills them up with almost no fat or protein. Please don't. Try the sunflower seeds instead." },
} satisfies Record<string, Food>

export type FoodId = keyof typeof foods

export const seasons = {
  winter: { name: 'Winter', emoji: '❄️', sky: ['#8fb4d9', '#e6eef6'], grass: '#f1f5f9', leaf: '#e6ecf3', tip: 'Small birds can burn a tenth of their weight on a cold night. Put out high-fat food (suet, sunflower seeds, peanuts) early in the morning and again before dusk, and keep the water ice-free.' },
  spring: { name: 'Spring', emoji: '🌱', sky: ['#8fd0f2', '#e9f8ea'], grass: '#8fd16a', leaf: '#f4a9c6', tip: 'Parents are feeding chicks, and chicks can choke on big pieces. No whole peanuts outside a mesh feeder, no large chunks. Soaked mealworms are a welcome extra.' },
  summer: { name: 'Summer', emoji: '☀️', sky: ['#5db6f5', '#d6f0ff'], grass: '#5bb14a', leaf: '#3f9a3d', tip: 'Natural food is plentiful, so feed lightly. Water matters most now. Clean feeders more often because heat spreads disease, and skip soft suet, which turns rancid.' },
  autumn: { name: 'Autumn', emoji: '🍂', sky: ['#f2b97c', '#fdf0d8'], grass: '#b3a04a', leaf: '#e0702a', tip: 'Birds are fattening up and scouting where to spend the winter. Start feeding now so they know your address, leave seed heads standing, and give the feeders a deep clean.' },
}

export type SeasonId = keyof typeof seasons

// ---- game rules, shared by the browser and the server ----

export const TABLE_Y = 1.505
export const WORLD_R = 4.3 // birds stay over the island
export const MAX_Y = 4.2

// every bird can eat bread, which is the problem with bread
export const canEat = (bird: BirdId, food: FoodId) => food === 'bread' || (foods[food].birds as BirdId[]).includes(bird)
// bigger birds reach further
export const reach = (bird: BirdId) => 0.3 + 0.12 * birds[bird].size
