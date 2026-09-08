import { randomUUID } from 'node:crypto';
import { pool, transaction, audit, type DB } from './index.js';
import { defaultPolicy, hash, beautyDePolicy, rightsHash } from '../domain/src/index.js';
import { backfillMarketplaceRightsGrants } from './rights-grants.js';
export const demoIds = {
  buyer: '10000000-0000-4000-8000-000000000001',
  creator: '10000000-0000-4000-8000-000000000002',
  admin: '10000000-0000-4000-8000-000000000003',
  viewer: '10000000-0000-4000-8000-000000000004',
  other: '10000000-0000-4000-8000-000000000005',
  org: '20000000-0000-4000-8000-000000000001',
  otherOrg: '20000000-0000-4000-8000-000000000002',
  rightsCoreCreatorUser: '10000000-0000-4000-8000-000000000010',
  rightsCoreCreator: '10000000-0000-4000-8000-000000000011',
  rightsCoreAsset: '30000000-0000-4000-8000-000000000010',
  rightsCorePolicy: '40000000-0000-4000-8000-000000000010',
};

type Gender = 'female' | 'male' | 'non_binary' | 'unspecified';
type AgeBand = '18_24' | '25_34' | '35_44' | '45_plus';

function slugifyName(name: string) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function patchCreatorPublicProfiles(db: DB) {
  const patches: [string, Gender, AgeBand, string[], string, string][] = [
    [demoIds.creator, 'female', '25_34', ['es', 'de'], 'lucia-martin', 'Vienna, AT'],
    [
      demoIds.rightsCoreCreatorUser,
      'female',
      '25_34',
      ['de', 'en'],
      'greta-vogel',
      'Berlin, DE',
    ],
  ];
  for (const [userId, gender, ageBand, languages, slug, location] of patches) {
    await db.query(
      'UPDATE creators SET gender=$2, age_band=$3, languages=$4, public_slug=$5, location=$6 WHERE user_id=$1',
      [userId, gender, ageBand, languages, slug, location],
    );
  }
  // Fill missing slugs for other seeded creators from display_name.
  const missing = (
    await db.query(
      'SELECT id, display_name FROM creators WHERE public_slug IS NULL',
    )
  ).rows as { id: string; display_name: string }[];
  for (const row of missing) {
    let base = slugifyName(row.display_name) || 'creator';
    let candidate = base;
    let n = 0;
    while (
      (
        await db.query(
          'SELECT 1 FROM creators WHERE public_slug=$1 AND id<>$2 LIMIT 1',
          [candidate, row.id],
        )
      ).rowCount
    ) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    await db.query('UPDATE creators SET public_slug=$2 WHERE id=$1', [row.id, candidate]);
  }
}

export async function seed() {
  if (process.env.APP_ENV === 'production') throw new Error('No sandbox seeds in production');
  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(918322)');
    if ((await db.query('SELECT 1 FROM users WHERE id=$1', [demoIds.buyer])).rowCount) {
      await patchCreatorPublicProfiles(db);
      return;
    }
    for (const [id, email, name, role] of [
      [demoIds.buyer, 'brand@example.test', 'Alex · Estudio Norte', 'buyer'],
      [demoIds.creator, 'creator@example.test', 'Lucía Martín', 'creator'],
      [demoIds.admin, 'admin@example.test', 'Equipo RightsNet', 'admin'],
      [demoIds.viewer, 'viewer@example.test', 'Lector · Estudio Norte', 'viewer'],
      [demoIds.other, 'other@example.test', 'Otra empresa', 'buyer'],
    ])
      await db.query('INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,$4)', [
        id,
        email,
        name,
        role,
      ]);
    await db.query(
      'INSERT INTO organizations(id,legal_name,country,verified) VALUES($1,$2,$3,true),($4,$5,$3,true)',
      [demoIds.org, 'Estudio Norte · Sandbox', 'ES', demoIds.otherOrg, 'Otra empresa · Sandbox'],
    );
    for (const [org, user, role] of [
      [demoIds.org, demoIds.buyer, 'owner'],
      [demoIds.org, demoIds.viewer, 'viewer'],
      [demoIds.otherOrg, demoIds.other, 'owner'],
    ])
      await db.query('INSERT INTO organization_members VALUES($1,$2,$3)', [org, user, role]);
    const people: [
      string,
      string,
      string,
      string,
      number,
      string,
      Gender,
      AgeBand,
      string[],
      string,
    ][] = [
      [
        'Lucía Martín',
        'Vienna, AT',
        'Spanish lifestyle creator. Belleza natural y rituales cotidianos.',
        'lifestyle',
        85000,
        'automatic',
        'female',
        '25_34',
        ['es', 'de'],
        'lucia-martin',
      ],
      [
        'Mateo Costa',
        'Barcelona, ES',
        'Diseño, movimiento y una forma consciente de vivir la ciudad.',
        'lifestyle',
        48000,
        'automatic',
        'male',
        '25_34',
        ['es'],
        'mateo-costa',
      ],
      [
        'Alba Ríos',
        'Valencia, ES',
        'Estilo mediterráneo, luz natural y una voz creativa propia.',
        'fashion',
        80000,
        'manual',
        'female',
        '18_24',
        ['es', 'en'],
        'alba-rios',
      ],
      [
        'Leo Vidal',
        'Berlín, DE',
        'Historias urbanas con carácter. Moda independiente y cultura visual.',
        'fashion',
        55000,
        'automatic',
        'male',
        '35_44',
        ['de', 'en'],
        'leo-vidal',
      ],
      [
        'Inés Soler',
        'Sevilla, ES',
        'Belleza real y hábitos sencillos para sentirse bien.',
        'beauty',
        72000,
        'manual',
        'female',
        '25_34',
        ['es'],
        'ines-soler',
      ],
      [
        'Nico Serra',
        'Málaga, ES',
        'Al aire libre. Energía, movimiento y vida junto al mar.',
        'lifestyle',
        42000,
        'automatic',
        'male',
        '18_24',
        ['es', 'en'],
        'nico-serra',
      ],
    ];
    for (const [index, p] of people.entries()) {
      const [name, location, bio, category, base, approval, gender, ageBand, languages, slug] = p;
      const uid = index === 0 ? demoIds.creator : randomUUID();
      if (index > 0)
        await db.query('INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,$4)', [
          uid,
          `creator${index}@example.test`,
          name,
          'creator',
        ]);
      const cid = randomUUID(),
        aid = randomUUID(),
        pid = randomUUID();
      await db.query(
        "INSERT INTO creators(id,user_id,display_name,bio,location,portrait,languages,gender,age_band,public_slug,identity_status,identity_expires_at,adult_verified,connected_account) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'verified',now()+interval '1 year',true,$11)",
        [
          cid,
          uid,
          name,
          bio,
          location,
          `/portraits/creator-${index + 1}.svg`,
          languages,
          gender,
          ageBand,
          slug,
          `sandbox_${cid}`,
        ],
      );
      await db.query(
        "INSERT INTO assets(id,creator_id,status,relationship_status) VALUES($1,$2,'published','reviewed')",
        [aid, cid],
      );
      const policy = {
        ...defaultPolicy,
        categories: [category],
        approval,
        prices: { '30': Number(base), '90': Number(base) * 2 },
      };
      await db.query(
        'INSERT INTO policies(id,asset_id,version,payload,sha256) VALUES($1,$2,1,$3,$4)',
        [pid, aid, JSON.stringify(policy), hash(policy)],
      );
      await db.query('UPDATE assets SET policy_id=$1 WHERE id=$2', [pid, aid]);
      await db.query(
        'INSERT INTO consents(id,policy_id,user_id,document_hash) VALUES($1,$2,$3,$4)',
        [randomUUID(), pid, uid, hash(policy)],
      );
      await audit(db, demoIds.admin, 'sandbox.fixture.created', aid, { synthetic: true });
    }
  });
  await seedRightsCoreFixture();
}

/** Idempotent AT/DE beauty rights-policy fixture (legacy ES creators unchanged). */
export async function seedRightsCoreFixture() {
  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(918323)');
    if ((await db.query('SELECT 1 FROM assets WHERE id=$1', [demoIds.rightsCoreAsset])).rowCount) {
      await patchCreatorPublicProfiles(db);
      return;
    }
    await db.query(
      "INSERT INTO users(id,email,display_name,role) VALUES($1,$2,'Greta · Rights Core DE','creator') ON CONFLICT (id) DO NOTHING",
      [demoIds.rightsCoreCreatorUser, 'rights-core@example.test'],
    );
    await db.query(
      "INSERT INTO creators(id,user_id,display_name,bio,location,portrait,languages,gender,age_band,public_slug,identity_status,identity_expires_at,adult_verified,connected_account) VALUES($1,$2,'Greta Vogel','Synthetic DE beauty fixture for rights-policy/0.1 integration.','Berlin, DE','/portraits/creator-1.svg',ARRAY['de','en'],'female','25_34','greta-vogel','verified',now()+interval '1 year',true,$3) ON CONFLICT (id) DO NOTHING",
      [demoIds.rightsCoreCreator, demoIds.rightsCoreCreatorUser, 'sandbox_rights_core'],
    );
    await db.query(
      "INSERT INTO assets(id,creator_id,status,relationship_status) VALUES($1,$2,'published','reviewed') ON CONFLICT (id) DO NOTHING",
      [demoIds.rightsCoreAsset, demoIds.rightsCoreCreator],
    );
    const policy = beautyDePolicy({
      policy_id: demoIds.rightsCorePolicy,
      asset_id: demoIds.rightsCoreAsset,
      creator_id: demoIds.rightsCoreCreator,
    });
    const digest = rightsHash(policy);
    await db.query(
      'INSERT INTO policies(id,asset_id,version,payload,sha256) VALUES($1,$2,1,$3,$4) ON CONFLICT (id) DO NOTHING',
      [demoIds.rightsCorePolicy, demoIds.rightsCoreAsset, JSON.stringify(policy), digest],
    );
    await db.query('UPDATE assets SET policy_id=$1 WHERE id=$2', [
      demoIds.rightsCorePolicy,
      demoIds.rightsCoreAsset,
    ]);
    await db.query(
      'INSERT INTO consents(id,policy_id,user_id,document_hash,license_terms_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT (policy_id,user_id) DO NOTHING',
      [
        randomUUID(),
        demoIds.rightsCorePolicy,
        demoIds.rightsCoreCreatorUser,
        digest,
        policy.license_terms_version,
      ],
    );
    await audit(db, demoIds.admin, 'sandbox.fixture.rights_core', demoIds.rightsCoreAsset, {
      schema: 'rightsnet.rights-policy/0.1',
    });
  });
  await backfillMarketplaceRightsGrants(pool);
}
if (process.argv[1]?.endsWith('seed.ts'))
  seed()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
