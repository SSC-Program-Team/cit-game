/**
 * Job definitions. A job is data: the console it prints, the questions it asks,
 * what it pays. main.ts runs any of them through the same desk screen.
 *
 * Text constraints (checked by scripts/check-jobs.ts at build time):
 * only the font charset renders; prompts and feedback sit in a 36-char column,
 * choices in a 46-char row, console lines in 52 chars, at most 3 choices.
 */

export type Crime = {
  act: string;
  law: string;
  offence: string;
  fix: string;
};

export type Choice = {
  label: string;
  ok?: true;
  /** shown when this wrong choice is picked */
  hint?: string;
  /** picking this is a crime: the player is arrested on the spot */
  crime?: Crime;
};

export type Stage = {
  prompt: string;
  choices: Choice[];
  /** feedback once the right choice is picked */
  right?: string;
  /** a wrong pick costs nothing but the client's patience (EXPLAIN tasks) */
  free?: true;
};

export type Prop = 'router' | 'printer' | 'terminal';

export type JobDef = {
  id: string;
  /** spot id on the street that offers this job */
  spot: string;
  ticket: string;
  client: string;
  place: string;
  pay: number;
  symptom: string;
  prop: Prop;
  console: string[];
  /** a paper slip on the counter: evidence that is not on the screen */
  note?: string[];
  stages: Stage[];
  mastery: [topic: string, delta: number];
  minutes: number;
  paid: string;
  wire: string;
};

const S161 = {
  law: 'crimes ordinance (cap. 200) s.161',
  offence: 'access to computer with criminal or dishonest intent',
};

export const JOBS: JobDef[] = [
  {
    id: 'chantai',
    spot: 'chantai',
    ticket: 'job 4471',
    client: 'chan tai',
    place: 'tea shop',
    pay: 450,
    symptom: 'no internet',
    prop: 'router',
    console: [
      'C:\\> ipconfig',
      '  ipv4 ..... 192.168.18.77',
      '  mask ..... 255.255.255.0',
      '  gateway .. 192.168.18.254',
      'C:\\> ping 192.168.18.50',
      '  reply 1ms  ttl=64',
      'C:\\> ping 192.168.18.254',
      '  reply 1ms  ttl=64',
      'C:\\> ping 8.8.8.8',
      '  request timed out.',
    ],
    stages: [
      {
        prompt: 'what is wrong?',
        choices: [
          { label: 'wrong subnet mask', hint: 'a /24 with a peer answering is fine' },
          { label: 'not forwarding', ok: true },
          { label: 'printer offline', hint: 'the printer is idle' },
        ],
        right: 'router answers. internet does not',
      },
      {
        prompt: 'correct. now tell her',
        free: true,
        choices: [
          { label: 'the router was not passing traffic', ok: true },
          { label: 'the printer firmware corrupted', hint: 'she does not believe you' },
        ],
      },
    ],
    mastery: ['gateway', 40],
    minutes: 20,
    paid: 'she pays in cash and gives you buns',
    wire: "chan tai's till is back online - $450",
  },
  {
    id: 'bakery',
    spot: 'bakery',
    ticket: 'job 4502',
    client: 'bakery owner',
    place: 'bakery',
    pay: 650,
    symptom: 'no receipts',
    prop: 'printer',
    console: [
      'C:\\> ipconfig',
      '  ipv4 ..... 192.168.1.20',
      '  mask ..... 255.255.255.0',
      '  gateway .. 192.168.1.1',
      'C:\\> ping 192.168.1.1',
      '  reply 1ms  ttl=64',
      'C:\\> ping 192.168.2.50',
      '  request timed out.',
    ],
    note: ['printer test page', 'ip   192.168.2.50', 'mask 255.255.255.0'],
    stages: [
      {
        prompt: 'why will the till not print?',
        choices: [
          { label: 'the printer is offline', hint: 'it just printed its test page' },
          { label: 'the printer is on another subnet', ok: true },
          { label: 'the router is down', hint: 'the router answered in 1ms' },
        ],
        right: 'the till sends .2.50 to the router',
      },
      {
        prompt: 'give the printer an address',
        choices: [
          { label: 'ip 192.168.1.20   mask /24', hint: 'that is the till: duplicate ip' },
          { label: 'ip 192.168.1.50   mask /24', ok: true },
          { label: 'ip 192.168.1.200  mask /25', hint: '/25 puts .200 and .20 apart' },
        ],
        right: 'test receipt prints',
      },
      {
        prompt: 'tell her what happened',
        free: true,
        choices: [
          { label: 'the new printer came set for another network', ok: true },
          { label: 'receipts need faster internet', hint: 'she frowns. printing is not online' },
        ],
        right: 'she nods. then she has an idea',
      },
      {
        prompt: "+$200 to use next door's wifi?",
        choices: [
          {
            label: "log into next door's router: admin/admin",
            crime: {
              ...S161,
              act: "logged into the restaurant's router for $200",
              fix: 'only touch a network its owner asked you to',
            },
          },
          { label: 'no. it is not her network', ok: true },
        ],
      },
    ],
    mastery: ['subnet', 40],
    minutes: 30,
    paid: 'she pays and packs you a pineapple bun',
    wire: 'the bakery prints receipts again - $650',
  },
];

/** Sudden missions: callouts that appear on the street, pay double, and expire. */
export const MISSIONS: JobDef[] = [
  {
    id: 'm.store',
    spot: 'store',
    ticket: 'callout',
    client: 'the store',
    place: 'stanley',
    pay: 600,
    symptom: 'card machine down',
    prop: 'terminal',
    console: [
      'C:\\> ipconfig /all',
      '  ipv4 ..... 10.0.0.23',
      '  mask ..... 255.255.255.0',
      '  gateway .. 10.0.0.1',
      '  dns ...... 10.0.0.53',
      'C:\\> ping 8.8.8.8',
      '  reply 6ms  ttl=117',
      'C:\\> nslookup google.com',
      '  dns request timed out.',
      '  timeout was 2 seconds.',
    ],
    stages: [
      {
        prompt: 'why is the card machine down?',
        choices: [
          { label: 'no default gateway', hint: '8.8.8.8 answered: routing works' },
          { label: 'the dns server is not answering', ok: true },
          { label: 'the cable is unplugged', hint: 'then nothing would answer' },
        ],
        right: 'numbers work. names do not',
      },
      {
        prompt: 'fix it. the queue is growing',
        choices: [
          { label: 'give the terminal a new ip', hint: 'its ip was never the problem' },
          {
            label: "use the last tech's portal login",
            crime: {
              ...S161,
              act: 'used a login you were not given, to get paid faster',
              fix: 'ask the owner for access, even with a queue',
            },
          },
          { label: 'set its dns to a working server', ok: true },
        ],
        right: 'the card machine beeps. approved',
      },
      {
        prompt: 'tell him what broke',
        free: true,
        choices: [
          { label: "the internet's phone book stopped answering", ok: true },
          { label: 'the card machine has a virus', hint: 'he looks scared. that is not true' },
        ],
      },
    ],
    mastery: ['dns', 40],
    minutes: 25,
    paid: 'he pays double. the queue claps',
    wire: 'you beat the clock at the store',
  },
  {
    id: 'm.market',
    spot: 'market',
    ticket: 'callout',
    client: 'stall holders',
    place: 'stanley market',
    pay: 550,
    symptom: 'tablets offline',
    prop: 'router',
    console: [
      'C:\\> ipconfig',
      '  ipv4 ..... 169.254.31.7',
      '  mask ..... 255.255.0.0',
      '  gateway ..',
      'C:\\> ipconfig /renew',
      '  unable to contact your dhcp server.',
      'router> show dhcp',
      '  pool   192.168.0.100 - 192.168.0.149',
      '  leases 50 of 50 in use',
    ],
    stages: [
      {
        prompt: 'why are the tablets offline?',
        choices: [
          { label: 'wrong subnet mask', hint: '/16 is what apipa always gives' },
          { label: 'the dhcp pool is full', ok: true },
          { label: 'the dns server is down', hint: 'no ip yet: dns never gets asked' },
        ],
        right: '169.254 means no lease was given',
      },
      {
        prompt: 'fix it before the evening rush',
        choices: [
          { label: 'make 169.254.31.7 a static ip', hint: 'link-local cannot reach the router' },
          { label: 'reboot the tablets again', hint: 'the pool is still full' },
          { label: 'widen the pool, shorten the lease', ok: true },
        ],
        right: 'leases free up. tablets online',
      },
      {
        prompt: 'tell the stall holders',
        free: true,
        choices: [
          { label: 'the internet is broken in stanley', hint: 'they can see the cafe is online' },
          { label: "shoppers' phones took every address", ok: true },
        ],
      },
    ],
    mastery: ['dhcp', 40],
    minutes: 25,
    paid: 'they pay double and argue over the split',
    wire: "you saved stanley market's evening",
  },
];

/** A shady offer on the street. Taking it is the crime. */
export const OFFER: { spot: string; who: string; line: string; take: string; walk: string; crime: Crime } = {
  spot: 'terminus',
  who: 'a man in a cap',
  line: "$900 to get into my neighbour's router. he parks in my space.",
  take: 'take the $900',
  walk: 'walk away',
  crime: {
    ...S161,
    act: "broke into a stranger's router for $900",
    fix: 'walk away from cash for access you were not given',
  },
};

export const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;-/$%+!?[]()*#'<>=\\";
