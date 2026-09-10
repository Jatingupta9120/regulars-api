do $$
declare
  v_email text := 'jatinguptaworks@gmail.com';

  v_you text;
  v_cohort text;
  v_week1 text;
  v_mate record;
  v_session record;
begin

  ------------------------------------------------------------------
  -- USERS
  ------------------------------------------------------------------

  for v_mate in
    select *
    from (values
      (v_email,             'You Yourself',    'WOMAN'),
      ('nadia@example.com', 'Nadia Okonkwo',   'WOMAN'),
      ('sam@example.com',   'Sam Reyes',       'WOMAN'),
      ('joon@example.com',  'Joon Park',       'WOMAN'),
      ('tessa@example.com', 'Tessa Lindqvist', 'WOMAN'),
      ('ari@example.com',   'Ari Bhatt',       'NONBINARY')
    ) as t(email, name, gender)
  loop

    insert into "User"
      (
        id,
        email,
        "displayName",
        gender,
        "ageBand",
        neighborhood,
        market
      )
    values
      (
        gen_random_uuid()::text,
        v_mate.email,
        v_mate.name,
        v_mate.gender::"Gender",
        '30-34',
        'greenpoint',
        'nyc'
      )
    on conflict (email) do update
      set
        "displayName" = excluded."displayName",
        gender = excluded.gender,
        "ageBand" = excluded."ageBand",
        neighborhood = excluded.neighborhood,
        market = excluded.market;

    ----------------------------------------------------------------
    -- VERIFICATION
    ----------------------------------------------------------------

    insert into "Verification"
      (
        id,
        "userId",
        status,
        provider,
        "referenceId",
        "documentType",
        "identityHash",
        "decidedAt"
      )
    select
      gen_random_uuid()::text,
      u.id,
      'APPROVED'::"VerificationStatus",
      'seed',
      'seed_' || left(u.id, 8),
      'drivers_license',
      'seedhash_' || left(u.id, 8),
      now()
    from "User" u
    where lower(u.email) = lower(v_mate.email)
    on conflict ("userId") do update
      set
        status = 'APPROVED'::"VerificationStatus",
        "decidedAt" = now(),
        "failureCode" = null;

  end loop;


  ------------------------------------------------------------------
  -- GET YOUR USER ID
  ------------------------------------------------------------------

  select u.id
  into v_you
  from "User" u
  where lower(u.email) = lower(v_email)
  limit 1;

  if v_you is null then
    raise exception
      'Could not find seeded user: %',
      v_email;
  end if;


  ------------------------------------------------------------------
  -- COHORT
  ------------------------------------------------------------------

  select c.id
  into v_cohort
  from "Cohort" c
  where c.neighborhood = 'greenpoint'
    and c."ageBand" = '30-34'
  limit 1;

  if v_cohort is null then

    v_cohort := gen_random_uuid()::text;

    insert into "Cohort"
      (
        id,
        status,
        market,
        neighborhood,
        "ageBand",
        "promisedWomen",
        "promisedSize",
        "womenOnly",
        "priceCents",
        "confirmedAt"
      )
    values
      (
        v_cohort,
        'RUNNING'::"CohortStatus",
        'nyc',
        'greenpoint',
        '30-34',
        5,
        6,
        false,
        14000,
        now()
      );

  else

    update "Cohort"
    set
      status = 'RUNNING'::"CohortStatus",
      "confirmedAt" = now()
    where id = v_cohort;

  end if;


  ------------------------------------------------------------------
  -- COHORT MEMBERS
  -- Session/CohortMember cohortId is TEXT in your schema.
  ------------------------------------------------------------------

  insert into "CohortMember"
    (
      id,
      "cohortId",
      "userId",
      status,
      "paidAt"
    )
  select
    gen_random_uuid()::text,
    v_cohort,
    u.id,
    'ACTIVE'::"MemberStatus",
    now()
  from "User" u
  where lower(u.email) in (
    lower(v_email),
    'nadia@example.com',
    'sam@example.com',
    'joon@example.com',
    'tessa@example.com',
    'ari@example.com'
  )
  on conflict ("cohortId", "userId") do update
    set
      status = 'ACTIVE'::"MemberStatus",
      "paidAt" = now();


  ------------------------------------------------------------------
  -- SESSIONS
  ------------------------------------------------------------------

  for v_session in
    select *
    from (values

      (
        1,
        -14,
        'Wheel throwing, first class',
        'Choplet Ceramics',
        '238 Grand St, Brooklyn, NY 11211',
        'Lorimer St on the L, or Metropolitan Av on the G',
        6,
        'Glass storefront, studio is on the ground floor. Walk straight back past the shelves.',
        'Nothing. Wear something you do not mind getting clay on.',
        'Priya'
      ),

      (
        2,
        -7,
        'Ramen from scratch',
        'The Brooklyn Kitchen',
        '169 N 3rd St, Brooklyn, NY 11211',
        'Bedford Av on the L',
        8,
        'Ring the buzzer marked Kitchen. Someone comes down.',
        'An appetite. Aprons are provided.',
        null
      ),

      (
        3,
        1,
        'Saturday pantry shift',
        'St. Nicks Alliance Food Pantry',
        '790 Broadway, Brooklyn, NY 11206',
        'Flushing Av on the J and M',
        4,
        'Side entrance on Lorimer. Ask for the volunteer desk.',
        'Closed-toe shoes. You will be on your feet and lifting boxes.',
        null
      ),

      (
        4,
        8,
        'Bouldering, no experience needed',
        'The Cliffs at Gowanus',
        '145 4th Ave, Brooklyn, NY 11217',
        'Union St on the R',
        5,
        'Front desk on the left. Say you are with the Regulars group.',
        'Shoes are included. Bring socks and a water bottle.',
        null
      )

    ) as s(
      week,
      days,
      activity,
      venue,
      addr,
      subway,
      walk,
      door,
      bring,
      host
    )
  loop

    insert into "Session"
      (
        id,
        "cohortId",
        "weekNumber",
        "startsAt",
        "durationMinutes",
        activity,
        "venueName",
        "venueAddress",
        "nearestSubway",
        "walkMinutes",
        "doorNote",
        "whatToBring",
        "hostName"
      )
    values
      (
        gen_random_uuid()::text,
        v_cohort,
        v_session.week,
        date_trunc('day', now())
          + (v_session.days || ' days')::interval
          + interval '19 hours',
        120,
        v_session.activity,
        v_session.venue,
        v_session.addr,
        v_session.subway,
        v_session.walk,
        v_session.door,
        v_session.bring,
        v_session.host
      )
    on conflict ("cohortId", "weekNumber") do update
      set
        "startsAt" = excluded."startsAt",
        activity = excluded.activity,
        "venueName" = excluded."venueName",
        "venueAddress" = excluded."venueAddress",
        "nearestSubway" = excluded."nearestSubway",
        "walkMinutes" = excluded."walkMinutes",
        "doorNote" = excluded."doorNote",
        "whatToBring" = excluded."whatToBring",
        "hostName" = excluded."hostName";

  end loop;


  ------------------------------------------------------------------
  -- WEEK 1 CHECK-IN
  ------------------------------------------------------------------

  select s.id
  into v_week1
  from "Session" s
  where s."cohortId" = v_cohort
    and s."weekNumber" = 1
  limit 1;

  if v_week1 is null then
    raise exception
      'Could not find Week 1 session for cohort %',
      v_cohort;
  end if;

  insert into "CheckIn"
    (
      id,
      "sessionId",
      "authorId",
      enjoyed,
      "wouldReturn",
      "feltSafe",
      "romanticPressure",
      note
    )
  values
    (
      gen_random_uuid()::text,
      v_week1,
      v_you,
      4,
      true,
      true,
      false,
      'Quieter than I expected, in a good way.'
    )
  on conflict ("sessionId", "authorId") do update
    set
      enjoyed = excluded.enjoyed,
      "wouldReturn" = excluded."wouldReturn",
      "feltSafe" = excluded."feltSafe",
      "romanticPressure" = excluded."romanticPressure",
      note = excluded.note;


  raise notice
    'SUCCESS: Seeded cohort % for %',
    v_cohort,
    v_email;

end $$;


------------------------------------------------------------------
-- ROW LEVEL SECURITY
------------------------------------------------------------------

alter table "User" enable row level security;
alter table "Verification" enable row level security;
alter table "LoginCode" enable row level security;
alter table "Cohort" enable row level security;
alter table "CohortMember" enable row level security;
alter table "Session" enable row level security;
alter table "Reminder" enable row level security;
alter table "Attendance" enable row level security;
alter table "CheckIn" enable row level security;
alter table "Flag" enable row level security;


------------------------------------------------------------------
-- VERIFY
------------------------------------------------------------------

select
  c.id,
  c.neighborhood,
  c."ageBand",
  c.status,

  (
    select count(*)
    from "CohortMember" m
    where m."cohortId" = c.id
  ) as members,

  (
    select count(*)
    from "Session" s
    where s."cohortId" = c.id
  ) as sessions

from "Cohort" c
where c.neighborhood = 'greenpoint'
  and c."ageBand" = '30-34';
