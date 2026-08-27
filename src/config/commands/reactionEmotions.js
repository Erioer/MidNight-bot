export const EMOTIONS = {
  hug: {
    emoji: '🤗',
    noun: 'hug',
    action: (giver, receiver, amount) =>
      amount === 1 ? `pulled **${receiver}** into a warm hug` : `wrapped **${receiver}** in **${amount}** big hugs`,
    actionSelf: (giver) => `wrapped their arms around themselves for a cozy hug`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `pulled **${receiver}** right back into a warm hug` : `wrapped **${receiver}** in **${amount}** returning hugs`,
    total: (names, total) => `**${names}** have shared **${total}** ${total === 1 ? 'hug' : 'hugs'} so far`,
  },
  kiss: {
    emoji: '😘',
    noun: 'kiss',
    action: (giver, receiver, amount) =>
      amount === 1 ? `planted a sweet kiss on **${receiver}**` : `showered **${receiver}** with **${amount}** kisses`,
    actionSelf: (giver) => `blew a kiss into the mirror`,
    actionBack: (giver, receiver) => `caught the kiss and returned it to **${receiver}**`,
    total: (names, total) => `**${names}** have exchanged **${total}** ${total === 1 ? 'kiss' : 'kisses'}`,
  },
  cuddle: {
    emoji: '🤗',
    noun: 'cuddle',
    action: (giver, receiver, amount) =>
      amount === 1 ? `snuggled up close to **${receiver}**` : `cuddled **${receiver}** **${amount}** times`,
    actionSelf: (giver) => `curled up into a tiny ball to cuddle themselves`,
    actionBack: (giver, receiver) => `snuggled right back into **${receiver}**`,
    total: (names, total) => `**${names}** have spent **${total}** cuddle sessions together`,
  },
  pat: {
    emoji: '🖐️',
    noun: 'pat',
    action: (giver, receiver, amount) =>
      amount === 1 ? `gently patted **${receiver}** on the head` : `patted **${receiver}** **${amount}** times`,
    actionSelf: (giver) => `patted their own head reassuringly`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `gave **${receiver}** a headpat right back` : `returned **${amount}** headpats to **${receiver}**`,
    total: (names, total) => `**${names}** have **${total}** headpats on record`,
  },
  poke: {
    emoji: '👉',
    noun: 'poke',
    action: (giver, receiver, amount) =>
      amount === 1 ? `booped **${receiver}** softly` : `poked **${receiver}** **${amount}** times non-stop`,
    actionSelf: (giver) => `poked their own cheek thoughtfully`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `poked **${receiver}** right back` : `returned the favor with **${amount}** pokes`,
    total: (names, total) => `**${names}** have accumulated **${total}** pokes`,
  },
  slap: {
    emoji: '🖐️',
    noun: 'slap',
    action: (giver, receiver, amount) =>
      amount === 1 ? `slapped **${receiver}** across the face` : `delivered **${amount}** swift slaps to **${receiver}**`,
    actionSelf: (giver) => `slapped their own face to wake up`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `slapped **${receiver}** right back` : `landed **${amount}** slaps right back on **${receiver}**`,
    total: (names, total) => `**${names}** have a tally of **${total}** slaps`,
  },
  punch: {
    emoji: '👊',
    noun: 'punch',
    action: (giver, receiver, amount) =>
      amount === 1 ? `threw a heavy punch at **${receiver}**` : `threw **${amount}** quick punches at **${receiver}**`,
    actionSelf: (giver) => `punched the air violently`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `returned the punch straight at **${receiver}**` : `shot **${amount}** punches right back at **${receiver}**`,
    total: (names, total) => `**${names}** have **${total}** hits logged`,
  },
  kick: {
    emoji: '🦵',
    noun: 'kick',
    action: (giver, receiver, amount) =>
      amount === 1 ? `kicked **${receiver}** straight in the shin` : `kicked **${receiver}** **${amount}** times in a row`,
    actionSelf: (giver) => `tripped over their own feet trying to kick`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `kicked **${receiver}** right back` : `sent **${amount}** kicks flying back at **${receiver}**`,
    total: (names, total) => `**${names}** have registered **${total}** kicks`,
  },
  bite: {
    emoji: '🦷',
    noun: 'bite',
    action: (giver, receiver, amount) =>
      amount === 1 ? `took a gentle bite out of **${receiver}**` : `chomped on **${receiver}** **${amount}** times`,
    actionSelf: (giver) => `accidentally bit their own tongue`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `took a playful bite right back at **${receiver}**` : `chomped on **${receiver}** **${amount}** times back`,
    total: (names, total) => `**${names}** have **${total}** bite marks count`,
  },
  tickle: {
    emoji: '🪶',
    noun: 'tickle',
    action: (giver, receiver, amount) =>
      amount === 1 ? `started relentless tickling on **${receiver}**` : `tickled **${receiver}** **${amount}** times without mercy`,
    actionSelf: (giver) => `tried to tickle themselves and failed`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `tickled **${receiver}** right back` : `unleashed **${amount}** tickle attacks right back`,
    total: (names, total) => `**${names}** have survived **${total}** tickle attacks`,
  },
  feed: {
    emoji: '🍽️',
    noun: 'snack',
    action: (giver, receiver, amount) =>
      amount === 1 ? `offered a delicious bite to **${receiver}**` : `fed **${receiver}** **${amount}** tasty treats`,
    actionSelf: (giver) => `treated themselves to a fine meal`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `shared a bite right back with **${receiver}**` : `fed **${receiver}** **${amount}** treats back`,
    total: (names, total) => `**${names}** have shared **${total}** snacks together`,
  },
  handhold: {
    emoji: '🤝',
    noun: 'handhold',
    action: (giver, receiver) => `gently intertwined fingers with **${receiver}**`,
    actionSelf: (giver) => `clasped their own hands together awkwardly`,
    actionBack: (giver, receiver) => `squeezed **${receiver}**'s hand right back`,
    total: (names, total) => `**${names}** have held hands **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  highfive: {
    emoji: '🖐️',
    noun: 'high-five',
    action: (giver, receiver, amount) =>
      amount === 1 ? `slapped a high-five with **${receiver}**` : `exchanged **${amount}** crisp high-fives with **${receiver}**`,
    actionSelf: (giver) => `high-fived their own reflection`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `returned the high-five with **${receiver}**` : `exchanged **${amount}** high-fives right back`,
    total: (names, total) => `**${names}** have **${total}** high-fives on the board`,
  },
  wave: {
    emoji: '👋',
    noun: 'wave',
    action: (giver, receiver) => `waved enthusiastically at **${receiver}**`,
    actionSelf: (giver) => `waved at the void`,
    actionBack: (giver, receiver) => `waved right back at **${receiver}**`,
    total: (names, total) => `**${names}** have waved at each other **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  wink: {
    emoji: '😉',
    noun: 'wink',
    action: (giver, receiver) => `threw a cheeky wink toward **${receiver}**`,
    actionSelf: (giver) => `winked at themselves in the mirror`,
    actionBack: (giver, receiver) => `winked right back at **${receiver}**`,
    total: (names, total) => `**${names}** have exchanged **${total}** winks`,
  },
  smile: {
    emoji: '😊',
    noun: 'smile',
    action: (giver, receiver) => `flashed a warm, genuine smile at **${receiver}**`,
    actionSelf: (giver) => `smiled quietly to themselves`,
    actionBack: (giver, receiver) => `smiled right back at **${receiver}**`,
    total: (names, total) => `**${names}** have shared **${total}** smiles`,
  },
  laugh: {
    emoji: '😂',
    noun: 'laugh',
    action: (giver, receiver) => `burst out laughing at **${receiver}**`,
    actionSelf: (giver) => `started laughing uncontrollably at their own joke`,
    actionBack: (giver, receiver) => `burst out laughing right back at **${receiver}**`,
    total: (names, total) => `**${names}** have laughed together **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  blush: {
    emoji: '😳',
    noun: 'blush',
    action: (giver, receiver) => `flushed red looking at **${receiver}**`,
    actionSelf: (giver) => `blushed from their own embarrassing thought`,
    actionBack: (giver, receiver) => `flushed even redder looking back at **${receiver}**`,
    total: (names, total) => `**${names}** have caused **${total}** blushes`,
  },
  dance: {
    emoji: '💃',
    noun: 'dance',
    action: (giver, receiver) => `pulled **${receiver}** onto the dance floor`,
    actionSelf: (giver) => `busted out some solo dance moves`,
    actionBack: (giver, receiver) => `spun **${receiver}** right back into the dance`,
    total: (names, total) => `**${names}** have shared **${total}** dances`,
  },
  nom: {
    emoji: '😋',
    noun: 'nom',
    action: (giver, receiver, amount) =>
      amount === 1 ? `took a tiny nibble of **${receiver}**` : `nommed on **${receiver}** **${amount}** times`,
    actionSelf: (giver) => `nibbled on their own fingernails`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `nibbled right back at **${receiver}**` : `nommed on **${receiver}** **${amount}** times back`,
    total: (names, total) => `**${names}** have logged **${total}** noms`,
  },
  yeet: {
    emoji: '🚀',
    noun: 'yeet',
    action: (giver, receiver, amount) =>
      amount === 1 ? `launched **${receiver}** into orbit` : `yeeted **${receiver}** into outer space **${amount}** times`,
    actionSelf: (giver) => `yeeted themselves off the cliff`,
    actionBack: (giver, receiver, amount) =>
      amount === 1 ? `yeeted **${receiver}** right back into orbit` : `sent **${receiver}** flying back **${amount}** times`,
    total: (names, total) => `**${names}** have recorded **${total}** yeets`,
  },
  kill: {
    emoji: '💀',
    noun: 'kill',
    action: (giver, receiver) => `eliminated **${receiver}** in cold blood`,
    actionSelf: (giver) => `accidentally defeated themselves`,
    actionBack: (giver, receiver) => `eliminated **${receiver}** right back in cold blood`,
    total: (names, total) => `**${names}** have **${total}** eliminations registered`,
  },
  love: {
    emoji: '❤️',
    noun: 'heart',
    action: (giver, receiver) => `sent a whole lot of love to **${receiver}**`,
    actionSelf: (giver) => `is practicing some well-deserved self-love`,
    actionBack: (giver, receiver) => `sent all the love right back to **${receiver}**`,
    total: (names, total) => `**${names}** have **${total}** hearts shared`,
  },
  cry: {
    emoji: '😭',
    noun: 'tear',
    action: (giver, receiver) => `sobbed uncontrollably on **${receiver}**'s shoulder`,
    actionSelf: (giver) => `cried quietly into their pillow`,
    actionBack: (giver, receiver) => `sobbed right back on **${receiver}**'s shoulder`,
    total: (names, total) => `**${names}** have shed **${total}** tears together`,
  },
  angry: {
    emoji: '😠',
    noun: 'angry',
    action: (giver, receiver) => `shot a furious glare at **${receiver}**`,
    actionSelf: (giver) => `grumbled angrily to themselves`,
    actionBack: (giver, receiver) => `glared right back at **${receiver}**`,
    total: (names, total) => `**${names}** have **${total}** angry moments on record`,
  },
  baka: {
    emoji: '🙄',
    noun: 'baka',
    action: (giver, receiver) => `called **${receiver}** a baka`,
    actionSelf: (giver) => `called themselves a baka`,
    actionBack: (giver, receiver) => `called **${receiver}** a baka right back`,
    total: (names, total) => `**${names}** have traded **${total}** bakas`,
  },
  bleh: {
    emoji: '🤪',
    noun: 'bleh',
    action: (giver, receiver) => `stuck their tongue out at **${receiver}**`,
    actionSelf: (giver) => `went bleh at the mirror`,
    actionBack: (giver, receiver) => `went bleh right back at **${receiver}**`,
    total: (names, total) => `**${names}** have gone bleh **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  blowkiss: {
    emoji: '💋',
    noun: 'blow kiss',
    action: (giver, receiver) => `blew a flying kiss toward **${receiver}**`,
    actionSelf: (giver) => `blew a kiss at the ceiling`,
    actionBack: (giver, receiver) => `caught the kiss and blew one back to **${receiver}**`,
    total: (names, total) => `**${names}** have blown **${total}** kisses`,
  },
  bonk: {
    emoji: '🔨',
    noun: 'bonk',
    action: (giver, receiver, amount) =>
      amount === 1 ? `bonked **${receiver}** on the head` : `bonked **${receiver}** **${amount}** times`,
    actionSelf: (giver) => `bonked their own head with a mallet`,
    actionBack: (giver, receiver) => `bonked **${receiver}** right back`,
    total: (names, total) => `**${names}** have dished out **${total}** bonks`,
  },
  bored: {
    emoji: '🥱',
    noun: 'bored',
    action: (giver, receiver) => `stared blankly at **${receiver}** out of boredom`,
    actionSelf: (giver) => `is completely and utterly bored`,
    actionBack: (giver, receiver) => `stared blankly right back at **${receiver}**`,
    total: (names, total) => `**${names}** have been bored together **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  carry: {
    emoji: '🫂',
    noun: 'carry',
    action: (giver, receiver) => `scooped **${receiver}** up in a princess carry`,
    actionSelf: (giver) => `tried to carry themselves and wobbled`,
    actionBack: (giver, receiver) => `carried **${receiver}** right back`,
    total: (names, total) => `**${names}** have shared **${total}** carries`,
  },
  clap: {
    emoji: '👏',
    noun: 'clap',
    action: (giver, receiver) => `clapped enthusiastically for **${receiver}**`,
    actionSelf: (giver) => `clapped for their own achievement`,
    actionBack: (giver, receiver) => `clapped right back for **${receiver}**`,
    total: (names, total) => `**${names}** have **${total}** rounds of applause`,
  },
  confused: {
    emoji: '😕',
    noun: 'confused',
    action: (giver, receiver) => `gave **${receiver}** a deeply confused look`,
    actionSelf: (giver) => `is thoroughly confused`,
    actionBack: (giver, receiver) => `looked even more confused at **${receiver}**`,
    total: (names, total) => `**${names}** have been confused **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  facepalm: {
    emoji: '🤦',
    noun: 'facepalm',
    action: (giver, receiver) => `facepalmed at **${receiver}**`,
    actionSelf: (giver) => `facepalmed at their own actions`,
    actionBack: (giver, receiver) => `facepalmed right back at **${receiver}**`,
    total: (names, total) => `**${names}** have facepalmed **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  handshake: {
    emoji: '🤝',
    noun: 'handshake',
    action: (giver, receiver) => `shook hands firmly with **${receiver}**`,
    actionSelf: (giver) => `shook their own hand awkwardly`,
    actionBack: (giver, receiver) => `returned the handshake with **${receiver}**`,
    total: (names, total) => `**${names}** have shaken hands **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  happy: {
    emoji: '😄',
    noun: 'happy',
    action: (giver, receiver) => `beamed happily at **${receiver}**`,
    actionSelf: (giver) => `is radiating pure happiness`,
    actionBack: (giver, receiver) => `beamed right back at **${receiver}**`,
    total: (names, total) => `**${names}** have shared **${total}** moments of happiness`,
  },
  kabedon: {
    emoji: '🚪',
    noun: 'kabedon',
    action: (giver, receiver) => `slammed their hand against the wall next to **${receiver}**`,
    actionSelf: (giver) => `kabedon'd an innocent wall`,
    actionBack: (giver, receiver) => `turned the tables and kabedon'd **${receiver}** right back`,
    total: (names, total) => `**${names}** have **${total}** kabedons on record`,
  },
  lappillow: {
    emoji: '🛏️',
    noun: 'lap pillow',
    action: (giver, receiver) => `rested their head on **${receiver}**'s lap`,
    actionSelf: (giver) => `rested their head on a pillow pile`,
    actionBack: (giver, receiver) => `offered their lap right back to **${receiver}**`,
    total: (names, total) => `**${names}** have shared **${total}** lap pillows`,
  },
  lurk: {
    emoji: '👀',
    noun: 'lurk',
    action: (giver, receiver) => `lurks quietly in the shadows, watching **${receiver}**`,
    actionSelf: (giver) => `lurks in the shadows menacingly`,
    actionBack: (giver, receiver) => `caught **${receiver}** lurking and lurked right back`,
    total: (names, total) => `**${names}** have been caught lurking **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  nod: {
    emoji: '👍',
    noun: 'nod',
    action: (giver, receiver) => `nodded approvingly at **${receiver}**`,
    actionSelf: (giver) => `nodded at their own reflection`,
    actionBack: (giver, receiver) => `nodded right back at **${receiver}**`,
    total: (names, total) => `**${names}** have exchanged **${total}** nods`,
  },
  nope: {
    emoji: '🚫',
    noun: 'nope',
    action: (giver, receiver) => `gave **${receiver}** a hard nope`,
    actionSelf: (giver) => `noped right out of there`,
    actionBack: (giver, receiver) => `noped right back at **${receiver}**`,
    total: (names, total) => `**${names}** have noped **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  nya: {
    emoji: '🐱',
    noun: 'nya',
    action: (giver, receiver) => `let out a cute nya at **${receiver}**`,
    actionSelf: (giver) => `nya'd at absolutely nothing`,
    actionBack: (giver, receiver) => `nya'd right back at **${receiver}**`,
    total: (names, total) => `**${names}** have nya'd **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  peck: {
    emoji: '😚',
    noun: 'peck',
    action: (giver, receiver) => `gave **${receiver}** a quick peck on the cheek`,
    actionSelf: (giver) => `pecked their own reflection`,
    actionBack: (giver, receiver) => `pecked **${receiver}** right back on the cheek`,
    total: (names, total) => `**${names}** have shared **${total}** pecks`,
  },
  pout: {
    emoji: '😾',
    noun: 'pout',
    action: (giver, receiver) => `pouted at **${receiver}**`,
    actionSelf: (giver) => `pouted at the unfairness of life`,
    actionBack: (giver, receiver) => `pouted right back at **${receiver}**`,
    total: (names, total) => `**${names}** have pouted **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  run: {
    emoji: '🏃',
    noun: 'run',
    action: (giver, receiver) => `bolted away from **${receiver}**`,
    actionSelf: (giver) => `ran for their life from nothing`,
    actionBack: (giver, receiver) => `chased **${receiver}** right back`,
    total: (names, total) => `**${names}** have **${total}** dramatic exits`,
  },
  salute: {
    emoji: '🫡',
    noun: 'salute',
    action: (giver, receiver) => `snapped a crisp salute at **${receiver}**`,
    actionSelf: (giver) => `saluted their own reflection`,
    actionBack: (giver, receiver) => `returned the salute right back at **${receiver}**`,
    total: (names, total) => `**${names}** have exchanged **${total}** salutes`,
  },
  shake: {
    emoji: '😵',
    noun: 'shake',
    action: (giver, receiver) => `shook their head disappointedly at **${receiver}**`,
    actionSelf: (giver) => `shook their head at their own antics`,
    actionBack: (giver, receiver) => `shook their head right back at **${receiver}**`,
    total: (names, total) => `**${names}** have had **${total}** head-shakes`,
  },
  shoot: {
    emoji: '🔫',
    noun: 'shoot',
    action: (giver, receiver) => `fired finger guns at **${receiver}**`,
    actionSelf: (giver) => `fired finger guns at the mirror`,
    actionBack: (giver, receiver) => `returned fire with finger guns at **${receiver}**`,
    total: (names, total) => `**${names}** have had **${total}** shootouts`,
  },
  shocked: {
    emoji: '😱',
    noun: 'shock',
    action: (giver, receiver) => `stared in complete shock at **${receiver}**`,
    actionSelf: (giver) => `is shocked beyond words`,
    actionBack: (giver, receiver) => `stared in even more shock at **${receiver}**`,
    total: (names, total) => `**${names}** have been shocked **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  shrug: {
    emoji: '🤷',
    noun: 'shrug',
    action: (giver, receiver) => `shrugged at **${receiver}**`,
    actionSelf: (giver) => `shrugged and moved on`,
    actionBack: (giver, receiver) => `shrugged right back at **${receiver}**`,
    total: (names, total) => `**${names}** have shrugged **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  sip: {
    emoji: '☕',
    noun: 'sip',
    action: (giver, receiver) => `took a slow, dramatic sip while staring at **${receiver}**`,
    actionSelf: (giver) => `sipped their tea with great intensity`,
    actionBack: (giver, receiver) => `took an equally dramatic sip back at **${receiver}**`,
    total: (names, total) => `**${names}** have shared **${total}** dramatic sips`,
  },
  sleep: {
    emoji: '😴',
    noun: 'sleep',
    action: (giver, receiver) => `fell asleep on **${receiver}**`,
    actionSelf: (giver) => `dozed off peacefully`,
    actionBack: (giver, receiver) => `fell asleep right back on **${receiver}**`,
    total: (names, total) => `**${names}** have napped together **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  smug: {
    emoji: '😏',
    noun: 'smug',
    action: (giver, receiver) => `smirked smugly at **${receiver}**`,
    actionSelf: (giver) => `is feeling extremely smug`,
    actionBack: (giver, receiver) => `smirked smugly right back at **${receiver}**`,
    total: (names, total) => `**${names}** have smugged **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  spin: {
    emoji: '💫',
    noun: 'spin',
    action: (giver, receiver) => `spun **${receiver}** around`,
    actionSelf: (giver) => `spun around until dizzy`,
    actionBack: (giver, receiver) => `spun **${receiver}** right back around`,
    total: (names, total) => `**${names}** have spun **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  stare: {
    emoji: '👁️',
    noun: 'stare',
    action: (giver, receiver) => `stared intensely at **${receiver}**`,
    actionSelf: (giver) => `stared into the void`,
    actionBack: (giver, receiver) => `stared right back at **${receiver}**`,
    total: (names, total) => `**${names}** have exchanged **${total}** stares`,
  },
  tableflip: {
    emoji: '💢',
    noun: 'table flip',
    action: (giver, receiver) => `flipped the table in front of **${receiver}**`,
    actionSelf: (giver) => `flipped a table all by themselves`,
    actionBack: (giver, receiver) => `flipped the table right back at **${receiver}**`,
    total: (names, total) => `**${names}** have caused **${total}** table flips`,
  },
  teehee: {
    emoji: '😜',
    noun: 'teehee',
    action: (giver, receiver) => `giggled a little teehee at **${receiver}**`,
    actionSelf: (giver) => `giggled teehee to themselves`,
    actionBack: (giver, receiver) => `giggled teehee right back at **${receiver}**`,
    total: (names, total) => `**${names}** have teehee'd **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
  think: {
    emoji: '🤔',
    noun: 'think',
    action: (giver, receiver) => `fell into deep thought while looking at **${receiver}**`,
    actionSelf: (giver) => `is thinking about something profound`,
    actionBack: (giver, receiver) => `fell into thought right back at **${receiver}**`,
    total: (names, total) => `**${names}** have shared **${total}** thinking sessions`,
  },
  thumbsup: {
    emoji: '👍',
    noun: 'thumbs up',
    action: (giver, receiver) => `gave **${receiver}** an enthusiastic thumbs up`,
    actionSelf: (giver) => `gave themselves a thumbs up in the mirror`,
    actionBack: (giver, receiver) => `returned a thumbs up right back at **${receiver}**`,
    total: (names, total) => `**${names}** have exchanged **${total}** thumbs ups`,
  },
  wag: {
    emoji: '🐾',
    noun: 'wag',
    action: (giver, receiver) => `wagged their tail happily at **${receiver}**`,
    actionSelf: (giver) => `wagged their own tail at the wall`,
    actionBack: (giver, receiver) => `wagged their tail right back at **${receiver}**`,
    total: (names, total) => `**${names}** have had **${total}** tail wags`,
  },
  yawn: {
    emoji: '🥱',
    noun: 'yawn',
    action: (giver, receiver) => `yawned right in front of **${receiver}**`,
    actionSelf: (giver) => `yawned loudly at their desk`,
    actionBack: (giver, receiver) => `yawned right back at **${receiver}**`,
    total: (names, total) => `**${names}** have yawned **${total}** ${total === 1 ? 'time' : 'times'}`,
  },
};

/**
 * Static image categories (husbando / kitsune / neko / waifu). These fetch a
 * single image instead of an action GIF and show the artist in the embed footer.
 */
export const IMAGE_EMOTIONS = {
  husbando: {
    emoji: '🥰',
    noun: 'husbando',
    action: (giver, receiver) => `showed off their husbando to **${receiver}**`,
    actionSelf: (giver) => `showed off their beloved husbando`,
    actionBack: (giver, receiver) => `showed off their husbando right back at **${receiver}**`,
    total: (names, total) => `**${names}** have shown off **${total}** husbandos`,
  },
  kitsune: {
    emoji: '🦊',
    noun: 'kitsune',
    action: (giver, receiver) => `showed **${receiver}** their favorite kitsune`,
    actionSelf: (giver) => `summoned a cute kitsune`,
    actionBack: (giver, receiver) => `showed a kitsune right back to **${receiver}**`,
    total: (names, total) => `**${names}** have summoned **${total}** kitsunes`,
  },
  neko: {
    emoji: '🐱',
    noun: 'neko',
    action: (giver, receiver) => `shared a neko with **${receiver}**`,
    actionSelf: (giver) => `summoned an adorable neko`,
    actionBack: (giver, receiver) => `shared a neko right back with **${receiver}**`,
    total: (names, total) => `**${names}** have summoned **${total}** nekos`,
  },
  waifu: {
    emoji: '💍',
    noun: 'waifu',
    action: (giver, receiver) => `showed off their waifu to **${receiver}**`,
    actionSelf: (giver) => `showed off their precious waifu`,
    actionBack: (giver, receiver) => `showed off their waifu right back at **${receiver}**`,
    total: (names, total) => `**${names}** have shown off **${total}** waifus`,
  },
};

/**
 * Build the two-line reaction message with unique dynamic formatting.
 */
export function buildReactionMessage({ giverName, receiverName, emotionName, amount = 1, total = 1, isSelf = false, isBack = false }) {
  const emotion = EMOTIONS[emotionName] || IMAGE_EMOTIONS[emotionName];
  if (!emotion) return '';

  const actionText = isSelf
    ? emotion.actionSelf(giverName)
    : isBack
      ? emotion.actionBack(giverName, receiverName, amount)
      : emotion.action(giverName, receiverName, amount);

  const actionLine = `**${giverName}** ${actionText} ${emotion.emoji}`;
  
  const targetNames = isSelf ? giverName : `${giverName} & ${receiverName}`;
  const countLine = emotion.total(targetNames, total);

  return `${actionLine}\n${countLine}`;
}

/** Emotion names usable directly as a prefix shortcut (e.g. `$hug @user`). */
export const REACTION_PREFIX_SHORTCUTS = new Set([...Object.keys(EMOTIONS), ...Object.keys(IMAGE_EMOTIONS)]);