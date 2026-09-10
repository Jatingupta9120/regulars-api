import { PrismaClient, type Prisma } from '@prisma/client';

/**
 * Seeds one realistic cohort so the whole app can be walked end to end on a
 * phone: a confirmed group of six in Greenpoint, four sessions at real venues,
 * with weeks one and two already in the past so a check-in is waiting.
 *
 * Run with:  npx tsx prisma/seed.ts you@example.com
 *
 * The email you pass becomes a verified member of the cohort. Everything is
 * idempotent — running it twice updates rather than duplicates.
 */

const prisma = new PrismaClient();

const NEIGHBORHOOD = 'greenpoint';
const AGE_BAND = '30-34';

/** Real places, because vague venues are the fastest way to make this feel fake. */
const SESSIONS: Array<{
  weekNumber: number;
  activity: string;
  venueName: string;
  venueAddress: string;
  nearestSubway: string;
  walkMinutes: number;
  doorNote: string;
  whatToBring: string;
  hostName: string | null;
  daysFromNow: number;
}> = [
  {
    weekNumber: 1,
    activity: 'Wheel throwing, first class',
    venueName: 'Choplet Ceramics',
    venueAddress: '238 Grand St, Brooklyn, NY 11211',
    nearestSubway: 'Lorimer St on the L, or Metropolitan Av on the G',
    walkMinutes: 6,
    doorNote: 'Glass storefront, studio is on the ground floor. Walk straight back past the shelves.',
    whatToBring: 'Nothing. Wear something you do not mind getting clay on.',
    hostName: 'Priya',
    daysFromNow: -14,
  },
  {
    weekNumber: 2,
    activity: 'Ramen from scratch',
    venueName: 'The Brooklyn Kitchen',
    venueAddress: '169 N 3rd St, Brooklyn, NY 11211',
    nearestSubway: 'Bedford Av on the L',
    walkMinutes: 8,
    doorNote: 'Ring the buzzer marked Kitchen. Someone comes down.',
    whatToBring: 'An appetite. Aprons are provided.',
    hostName: null,
    daysFromNow: -7,
  },
  {
    weekNumber: 3,
    activity: 'Saturday pantry shift',
    venueName: 'St. Nicks Alliance Food Pantry',
    venueAddress: '790 Broadway, Brooklyn, NY 11206',
    nearestSubway: 'Flushing Av on the J and M',
    walkMinutes: 4,
    doorNote: 'Side entrance on Lorimer. Ask for the volunteer desk.',
    whatToBring: 'Closed-toe shoes. You will be on your feet and lifting boxes.',
    hostName: null,
    daysFromNow: 1,
  },
  {
    weekNumber: 4,
    activity: 'Bouldering, no experience needed',
    venueName: 'The Cliffs at Gowanus',
    venueAddress: '145 4th Ave, Brooklyn, NY 11217',
    nearestSubway: 'Union St on the R',
    walkMinutes: 5,
    doorNote: 'Front desk on the left. Say you are with the Regulars group.',
    whatToBring: 'Shoes are included. Bring socks and a water bottle.',
    hostName: null,
    daysFromNow: 8,
  },
];

/** Five people plus whoever runs the script. First names only ever surface. */
const COHORT_MATES: Array<{ email: string; displayName: string; gender: Prisma.UserCreateInput['gender'] }> = [
  { email: 'nadia@example.com', displayName: 'Nadia Okonkwo', gender: 'WOMAN' },
  { email: 'sam@example.com', displayName: 'Sam Reyes', gender: 'WOMAN' },
  { email: 'joon@example.com', displayName: 'Joon Park', gender: 'WOMAN' },
  { email: 'tessa@example.com', displayName: 'Tessa Lindqvist', gender: 'WOMAN' },
  { email: 'ari@example.com', displayName: 'Ari Bhatt', gender: 'NONBINARY' },
];

function at(daysFromNow: number, hour = 19): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function verifiedUser(input: {
  email: string;
  displayName: string;
  gender: Prisma.UserCreateInput['gender'];
}): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: input.email.toLowerCase() },
    update: { displayName: input.displayName, neighborhood: NEIGHBORHOOD, ageBand: AGE_BAND },
    create: {
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      gender: input.gender,
      neighborhood: NEIGHBORHOOD,
      ageBand: AGE_BAND,
    },
  });

  await prisma.verification.upsert({
    where: { userId: user.id },
    update: { status: 'APPROVED', decidedAt: new Date(), failureCode: null },
    create: {
      userId: user.id,
      status: 'APPROVED',
      provider: 'seed',
      referenceId: `seed_${user.id.slice(0, 8)}`,
      documentType: 'drivers_license',
      identityHash: `seedhash_${user.id.slice(0, 8)}`,
      decidedAt: new Date(),
    },
  });

  return user.id;
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email || !email.includes('@')) {
    throw new Error('Pass your email: npx tsx prisma/seed.ts you@example.com');
  }

  const youId = await verifiedUser({
    email,
    displayName: 'You Yourself',
    gender: 'WOMAN',
  });

  const mateIds: string[] = [];
  for (const mate of COHORT_MATES) {
    mateIds.push(await verifiedUser(mate));
  }

  // One cohort per neighborhood and age band keeps reruns idempotent.
  const existing = await prisma.cohort.findFirst({
    where: { neighborhood: NEIGHBORHOOD, ageBand: AGE_BAND },
  });

  const cohort = existing
    ? await prisma.cohort.update({
        where: { id: existing.id },
        data: { status: 'RUNNING', confirmedAt: new Date() },
      })
    : await prisma.cohort.create({
        data: {
          neighborhood: NEIGHBORHOOD,
          ageBand: AGE_BAND,
          promisedSize: 6,
          promisedWomen: 5,
          womenOnly: false,
          priceCents: 14000,
          status: 'RUNNING',
          confirmedAt: new Date(),
        },
      });

  for (const userId of [youId, ...mateIds]) {
    await prisma.cohortMember.upsert({
      where: { cohortId_userId: { cohortId: cohort.id, userId } },
      update: { status: 'ACTIVE', paidAt: new Date() },
      create: { cohortId: cohort.id, userId, status: 'ACTIVE', paidAt: new Date() },
    });
  }

  for (const s of SESSIONS) {
    await prisma.session.upsert({
      where: { cohortId_weekNumber: { cohortId: cohort.id, weekNumber: s.weekNumber } },
      update: { startsAt: at(s.daysFromNow) },
      create: {
        cohortId: cohort.id,
        weekNumber: s.weekNumber,
        startsAt: at(s.daysFromNow),
        durationMinutes: 120,
        activity: s.activity,
        venueName: s.venueName,
        venueAddress: s.venueAddress,
        nearestSubway: s.nearestSubway,
        walkMinutes: s.walkMinutes,
        doorNote: s.doorNote,
        whatToBring: s.whatToBring,
        hostName: s.hostName,
      },
    });
  }

  const sessions = await prisma.session.findMany({
    where: { cohortId: cohort.id },
    orderBy: { weekNumber: 'asc' },
  });

  // Week one is already checked in, so week two is the one waiting for you.
  const week1 = sessions.find((s) => s.weekNumber === 1);
  if (week1) {
    await prisma.checkIn.upsert({
      where: { sessionId_authorId: { sessionId: week1.id, authorId: youId } },
      update: {},
      create: {
        sessionId: week1.id,
        authorId: youId,
        enjoyed: 4,
        wouldReturn: true,
        feltSafe: true,
        note: 'Quieter than I expected, in a good way.',
      },
    });
  }

  console.log('Seeded.');
  console.log(`  cohort:   ${cohort.id} (${NEIGHBORHOOD}, ${AGE_BAND}, RUNNING)`);
  console.log(`  you:      ${email}`);
  console.log(`  sessions: ${sessions.length}`);
  console.log('');
  console.log('On the phone: sign in with that email, read the code from the Render logs.');
  console.log('Week 2 has a check-in waiting. Week 3 is the next session.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
