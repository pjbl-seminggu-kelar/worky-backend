import { PrismaClient } from '../src/app/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Memulai Seeding Data Worky ---');

  // 1. Seed User Dummy (Badzlan Nur)
  const hashedPassword = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'badzlan@worky.id' },
    update: {
      equipment: ['exercise_mat', 'chair', 'pull_up_bar'],
    },
    create: {
      email: 'badzlan@worky.id',
      passwordHash: hashedPassword,
      displayName: 'Badzlan Nur',
      age: 24,
      weightKg: 68.0,
      goal: 'GENERAL_FITNESS',
      experienceLevel: 'BEGINNER',
      sessionsPerWeek: 4,
      sessionDurationMinutes: 20,
      equipment: ['exercise_mat', 'chair', 'pull_up_bar'],
      reminderTime: '18:30',
      streakWeeks: 5,
    },
  });
  console.log(`User seeded: ${user.displayName}`);

  // 2. Seed Master 6 Exercises (Lengkap dengan imageUrl & Label 'Yang dicek AI')
  const exercisesData = [
    {
      slug: 'push_up',
      name: 'Push-up',
      imageUrl: 'https://worky-web.vercel.app/pushup.png',
      category: 'UPPER' as const,
      description: 'Dada · Trisep · Bahu',
      instructions: [
        'Tangan selebar bahu, badan lurus.',
        'Turunkan dada hingga siku ±90°.',
        'Dorong kembali ke posisi awal.',
      ],
      equipmentRequired: [],
      cameraGuidance: { position: 'Samping', distance: '2–3 m' },
      supportedErrors: [
        'Pinggul turun',
        'Pinggul terlalu tinggi',
        'Turun kurang dalam',
        'Kepala menunduk',
      ],
      defaultSets: 3,
      defaultTargetReps: 12,
      defaultRestSeconds: 45,
      cvStatus: 'VALIDATED' as const,
      modelVersion: 'v1.0.0',
    },
    {
      slug: 'squat',
      name: 'Squat',
      imageUrl: 'https://worky-web.vercel.app/squat.png',
      category: 'LOWER' as const,
      description: 'Paha · Glutes · Core',
      instructions: [
        'Kaki selebar bahu.',
        'Dorong pinggul ke belakang, turun',
        'Paha sejajar lantai, lalu berdiri',
      ],
      equipmentRequired: [],
      cameraGuidance: { position: 'Samping atau Depan', distance: '2–3 m' },
      supportedErrors: [
        'Lutut masuk ke dalam',
        'Tumit terangkat',
        'Punggung membungkuk',
        'Turun kurang dalam',
      ],
      defaultSets: 3,
      defaultTargetReps: 12,
      defaultRestSeconds: 45,
      cvStatus: 'EXPERIMENTAL' as const,
      modelVersion: 'v0.9.0',
    },
    {
      slug: 'sit_up',
      name: 'Sit-up',
      imageUrl: 'https://worky-web.vercel.app/situp.png',
      category: 'CORE' as const,
      description: 'Perut · Hip flexor',
      instructions: [
        'Berbaring, lutut ditekuk.',
        'Angkat badan ke arah lutut.',
        'Turun perlahan terkontrol.',
      ],
      equipmentRequired: [],
      cameraGuidance: { position: 'Samping', distance: '2 m' },
      supportedErrors: [
        'Menarik leher',
        'Gerakan terlalu cepat',
        'Rentang kurang penuh',
      ],
      defaultSets: 3,
      defaultTargetReps: 12,
      defaultRestSeconds: 45,
      cvStatus: 'PLANNED' as const,
      modelVersion: 'v0.5.0',
    },
    {
      slug: 'plank',
      name: 'Plank',
      imageUrl: 'https://worky-web.vercel.app/plank.png',
      category: 'CORE' as const,
      description: 'Core · Bahu',
      instructions: [
        'Siku tepat di bawah bahu.',
        'Badan lurus dari kepala ke tumit.',
        'Tahan dan bernapas normal.',
      ],
      equipmentRequired: ['exercise_mat'],
      cameraGuidance: { position: 'Samping', distance: '2 m' },
      supportedErrors: [
        'Pinggul turun',
        'Pinggul terlalu tinggi',
        'Kepala menunduk',
      ],
      defaultSets: 3,
      defaultTargetDurationSeconds: 45,
      defaultRestSeconds: 45,
      cvStatus: 'PLANNED' as const,
      modelVersion: 'v0.5.0',
    },
    {
      slug: 'pull_up',
      name: 'Pull-up',
      imageUrl: 'https://worky-web.vercel.app/pullup.png',
      category: 'UPPER' as const,
      description: 'Punggung · Bisep · Bahu',
      instructions: [
        'Pegang pull-up bar dengan telapak tangan menghadap ke depan.',
        'Tarik tubuh ke atas hingga dagu melewati bar.',
        'Turunkan tubuh kembali secara perlahan ke posisi semula.',
      ],
      equipmentRequired: ['pull_up_bar'],
      cameraGuidance: { position: 'Samping / Belakang', distance: '2–3 m' },
      supportedErrors: [
        'Dagu tidak melewati bar',
        'Ayun tubuh (kipping)',
        'Rentang gerak tidak penuh',
      ],
      defaultSets: 3,
      defaultTargetReps: 8,
      defaultRestSeconds: 60,
      cvStatus: 'PLANNED' as const,
      modelVersion: 'v0.1.0',
    },
    {
      slug: 'chair_dips',
      name: 'Dips',
      imageUrl: 'https://worky-web.vercel.app/dips.png',
      category: 'UPPER' as const,
      description: 'Trisep · Bahu Depan · Dada',
      instructions: [
        'Duduk di tepi kursi yang stabil, letakkan tangan di samping panggul.',
        'Geser panggul ke depan dan tekuk siku hingga ±90°.',
        'Dorong tubuh kembali ke atas menggunakan kekuatan trisep.',
      ],
      equipmentRequired: ['chair'],
      cameraGuidance: { position: 'Samping', distance: '2 m' },
      supportedErrors: [
        'Turun kurang dalam',
        'Siku mekar ke samping',
        'Bahu terlalu naik',
      ],
      defaultSets: 3,
      defaultTargetReps: 12,
      defaultRestSeconds: 45,
      cvStatus: 'PLANNED' as const,
      modelVersion: 'v0.1.0',
    },
  ];

  const exercisesMap: Record<string, string> = {};
  for (const ex of exercisesData) {
    const created = await prisma.exercise.upsert({
      where: { slug: ex.slug },
      update: {
        imageUrl: ex.imageUrl,
        description: ex.description,
        supportedErrors: ex.supportedErrors,
        instructions: ex.instructions,
        equipmentRequired: ex.equipmentRequired,
        category: ex.category,
        defaultSets: ex.defaultSets,
        defaultTargetReps: ex.defaultTargetReps,
        defaultTargetDurationSeconds: ex.defaultTargetDurationSeconds,
      },
      create: ex,
    });
    exercisesMap[ex.slug] = created.id;
  }
  console.log('Master 6 exercises seeded successfully with images and error badges.');

  // 3. Seed Active Workout Plan
  const plan = await prisma.workoutPlan.create({
    data: {
      userId: user.id,
      name: 'Program Kebugaran Mingguan',
      goal: 'GENERAL_FITNESS',
      status: 'ACTIVE',
      workoutPlanItems: {
        create: [
          { exerciseId: exercisesMap['push_up'], dayOfWeek: 1, sets: 3, targetReps: 12 },
          { exerciseId: exercisesMap['squat'], dayOfWeek: 2, sets: 3, targetReps: 15 },
          { exerciseId: exercisesMap['chair_dips'], dayOfWeek: 4, sets: 3, targetReps: 12 },
          { exerciseId: exercisesMap['sit_up'], dayOfWeek: 6, sets: 3, targetReps: 20 },
        ],
      },
    },
  });
  console.log(`Workout plan seeded: ${plan.name}`);

  // 4. Seed Riwayat Workout Sessions
  await prisma.workoutSession.createMany({
    data: [
      {
        userId: user.id,
        exerciseId: exercisesMap['push_up'],
        sessionName: 'Full Body Pemula',
        totalAttempts: 48,
        totalReps: 48,
        validReps: 42,
        invalidReps: 6,
        activeDurationSeconds: 768,
        validRepRate: 87.5,
        modelVersion: 'v1.0.0',
        status: 'COMPLETED',
      },
      {
        userId: user.id,
        exerciseId: exercisesMap['chair_dips'],
        sessionName: 'Tricep & Upper Focus',
        totalAttempts: 36,
        totalReps: 36,
        validReps: 32,
        invalidReps: 4,
        activeDurationSeconds: 540,
        validRepRate: 88.8,
        modelVersion: 'v0.1.0',
        status: 'COMPLETED',
      },
      {
        userId: user.id,
        exerciseId: exercisesMap['sit_up'],
        sessionName: 'Core 10 Menit',
        totalAttempts: 55,
        totalReps: 55,
        validReps: 50,
        invalidReps: 5,
        activeDurationSeconds: 618,
        validRepRate: 90.9,
        modelVersion: 'v1.0.0',
        status: 'COMPLETED',
      },
    ],
  });
  console.log('Riwayat sesi latihan seeded.');

  console.log('--- Seeding Selesai 100% ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });