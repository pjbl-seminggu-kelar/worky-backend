// src/services/ai/aiPrompt.ts

export interface UserPlanProfile {
  goal: string;
  age?: number | null;
  weightKg?: number | null;
  experienceLevel: string;
  equipment: string[];
  sessionsPerWeek: number;
  sessionDurationMinutes: number;
}

export interface AvailableExerciseInfo {
  slug: string;
  name: string;
  category: string;
  equipmentRequired: string[];
  defaultSets?: number;
  defaultTargetReps?: number | null;
  defaultTargetDurationSeconds?: number | null;
  defaultRestSeconds?: number;
}

export function buildWorkoutPlanPrompt(
  profile: UserPlanProfile,
  exercises: AvailableExerciseInfo[]
): string {
  const exercisesSummary = exercises.map((e) => ({
    slug: e.slug,
    name: e.name,
    category: e.category,
    equipmentRequired: e.equipmentRequired,
  }));

  return `You are an expert personal trainer. Using the following user profile and available exercise catalog, create a customized weekly workout plan.

### USER PROFILE:
- Goal: ${profile.goal}
- Age: ${profile.age ?? 'Not specified'}
- Weight (kg): ${profile.weightKg ?? 'Not specified'}
- Experience level: ${profile.experienceLevel}
- Equipment owned: ${JSON.stringify(profile.equipment)}
- Sessions per week: ${profile.sessionsPerWeek}
- Target session duration: ${profile.sessionDurationMinutes} minutes

### AVAILABLE EXERCISE CATALOG:
${JSON.stringify(exercisesSummary, null, 2)}

### INSTRUCTIONS & CONSTRAINTS:
1. Schedule exactly ${profile.sessionsPerWeek} distinct workout days across the week. Use integer day numbers for dayOfWeek (1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday, 7 = Sunday).
   Recommended days:
   - 1 session: [1]
   - 2 sessions: [1, 4]
   - 3 sessions: [1, 3, 5]
   - 4 sessions: [1, 2, 4, 5]
   - 5 sessions: [1, 2, 3, 4, 5]
   - 6 sessions: [1, 2, 3, 4, 5, 6]
   - 7 sessions: [1, 2, 3, 4, 5, 6, 7]
2. Within each workout day, assign 2 to 4 exercises with sequential orderIndex (1, 2, 3, ...).
3. The total workout time per day (sets * reps * tempo + rest periods) must fit reasonably within ${profile.sessionDurationMinutes} minutes.
4. ONLY choose exercises from the "AVAILABLE EXERCISE CATALOG" above. Use their exact "slug".
5. Only select exercises whose "equipmentRequired" is completely satisfied by the user's equipment.
6. Target sets, reps, and rest guidelines:
   - STRENGTH: 3-5 sets, 5-8 reps, 60-90s rest.
   - MUSCLE_BUILDING: 3-4 sets, 8-12 reps, 45-60s rest.
   - WEIGHT_LOSS: 3-4 sets, 12-15 reps, 30-45s rest.
   - GENERAL_FITNESS: 3 sets, 10-12 reps, 45s rest.
7. For isometric exercises (like plank), set targetReps to null and targetDurationSeconds to an appropriate duration in seconds (e.g., 30 to 60). For dynamic repetition exercises, set targetReps to an integer and targetDurationSeconds to null.

### OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object matching the following structure (no explanations, no markdown markdown wrapper, no extra text):

{
  "items": [
    {
      "dayOfWeek": 1,
      "orderIndex": 1,
      "exerciseSlug": "push_up",
      "sets": 3,
      "targetReps": 12,
      "targetDurationSeconds": null,
      "restSeconds": 45,
      "notes": "Fokus pada rentang gerak penuh"
    }
  ]
}`;
}
