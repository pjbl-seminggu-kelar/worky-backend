# AI‑Based Workout‑Plan Generation – Implementation Plan

## 🎯 Objective

Replace the current _rule‑based_ workout‑plan generator with a **Gemini (Google) AI‑driven** generator while keeping:

- the **same API endpoint** (`POST /api/v1/plans/generate`),
- the **exact response JSON shape** (`{ status: "success", data: WorkoutPlan }`),
- the **same input data** (user profile fields gathered during onboarding).

The only difference will be the internal algorithm that produces the plan.

---

## 📦 What’s Already In Place

1. **Google API key** is present in the project’s `.env` as `GOOGLE_API_KEY`.
2. The front‑end calls `/plans/generate` after onboarding and stores the returned plan in `localStorage` under `worky:active-plan`. No UI changes are required.
3. Existing rule‑based logic lives in `src/services/plan.service.ts`.

---

## 🛠️ High‑Level Implementation Steps

| Phase                     | Description                                                                                                                                                                                                                 | Files Affected                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **A – Gemini client**     | Add a thin wrapper that talks to Gemini (`generateContent`). Handles timeout, errors, and returns the raw text response.                                                                                                    | `src/services/ai/aiClient.ts`                     |
| **B – Prompt template**   | Create a prompt that includes every user profile field (age, weight, goal, equipment, sessions per week, session duration, experience level). The prompt requests a **pure JSON** array of plan items.                      | `src/services/ai/aiPrompt.txt` (or inline string) |
| **C – Validation schema** | Zod schema that validates the JSON returned by Gemini. Must match the shape expected by the front‑end (`items: [{ dayOfWeek, orderIndex, exerciseSlug, sets, targetReps?, targetDurationSeconds?, restSeconds, notes? }]`). | `src/services/ai/aiSchema.ts`                     |
| **D – Transform helper**  | Convert the AI JSON into the format used by the DB: map `exerciseSlug` → `exerciseId` and fetch the full `exercise` record for each item.                                                                                   | `src/services/ai/aiTransform.ts`                  |
| **E – AI Plan Service**   | New service `AIPlanService` with a method `generatePlanFromAI(userId, customName?, customGoal?)` that:                                                                                                                      |

1. Loads the user's profile.
2. Fills the prompt template.
3. Calls the Gemini client.
4. Parses & validates the response.
5. Resolves exercise slugs.
6. Executes a **single Prisma transaction** to archive any existing ACTIVE plan, create a new `WorkoutPlan`, bulk‑insert `WorkoutPlanItem`s, and finally returns the freshly created plan (including the embedded `exercise` objects). | `src/services/aiPlan.service.ts` |
   | **F – Controller hook** | Update `PlanController.generatePlan` to:

````ts
if (process.env.USE_AI_FOR_PLAN === "true") {
  try {
    plan = await AIPlanService.generatePlanFromAI(userId, name, goal);
  } catch (e) {
    // Log & fall back to deterministic generator
    plan = await PlanService.generatePlan(userId, name, goal);
  }
} else {
  plan = await PlanService.generatePlan(userId, name, goal);
}
``` |
| **G – Feature flag** | Add `USE_AI_FOR_PLAN` env var (default `true` as requested). Allows quick toggle in production if needed. | `.env.example`, read in controller.
| **H – Observability (optional but recommended)** | Log request/response, record latency, and emit Prometheus metrics: `plan_ai_success_total`, `plan_ai_fallback_total`, `plan_ai_latency_ms`. | `src/lib/metrics.ts` + minor logger usage.
| **I – Tests** | *Unit*: AI client mock, schema validation, transaction mock. *Integration*: controller with AI success & AI failure (fallback). Ensure output JSON matches existing contract. | `tests/aiPlan.service.test.ts`, `tests/plan.controller.test.ts` |
| **J – Documentation** | Update backend `README.md` section “AI‑Based Plan Generation”. Add note to front‑end README that onboarding still works unchanged. | `README.md`, `frontend/README.md` |

---

## 🧩 Detailed Flow (when `/plans/generate` is called)
1. **Controller** receives request → extracts optional `name` and `goal` from body.
2. **Feature flag** check (`USE_AI_FOR_PLAN`). Since we want AI, it is `true`.
3. **AIPlanService.generatePlanFromAI** is invoked.
   - Loads the user profile (`prisma.user.findUnique`).
   - Interpolates the prompt template with the profile values.
   - Calls `aiClient.callGemini(prompt)`.
   - Receives a raw text block, parses it as JSON, validates with Zod.
   - For each `exerciseSlug` it fetches the corresponding `Exercise` row (ensuring it exists and is active).
   - Starts a Prisma transaction:
     * Archives any existing ACTIVE plan for the user.
     * Creates a new `WorkoutPlan` record (`status: "ACTIVE"`).
     * Bulk‑inserts all `WorkoutPlanItem`s (including resolved `exerciseId`).
   - Returns `PlanService.getActivePlan(userId)` which includes the `exercise` relation for each item (exactly what the front‑end expects).
4. **If any step throws** (network timeout, invalid JSON, missing slug, DB error) the controller catches the error, logs it, increments the fallback metric, and **falls back** to the original deterministic generator (`PlanService.generatePlan`).
5. The controller sends back the JSON response (`{ status: "success", data: <WorkoutPlan> }`).
6. Front‑end stores the plan unchanged and renders it.

---

## ⚙️ Prompt Example (Gemini)
```text
You are a personal trainer. Using the following user profile, create a weekly workout plan.

Goal: {{goal}}
Age: {{age}}
Weight (kg): {{weightKg}}
Experience level: {{experienceLevel}}
Equipment owned: {{equipment}}
Sessions per week: {{sessionsPerWeek}}
Session duration (minutes): {{sessionDurationMinutes}}

Produce ONLY the following JSON (no extra text):

{ "items": [
  {
    "dayOfWeek": 1,
    "orderIndex": 1,
    "exerciseSlug": "bench-press",
    "sets": 4,
    "targetReps": 8,
    "targetDurationSeconds": null,
    "restSeconds": 60,
    "notes": null
  }
  ...
] }

Rules:
- Only suggest exercises whose `equipmentRequired` is a subset of the user's equipment list.
- Distribute sessions across the requested number of days using a split rotation (UPPER, LOWER, CORE, FULL_BODY).
- Adjust sets/reps/rest according to the goal exactly as the current rule‑based logic does.
- Keep the estimated time per day ≤ sessionDurationMinutes.
- Return **valid JSON** (no comments, no extra whitespace that breaks parsing).
````

The template will be stored as a simple string file (`src/services/ai/aiPrompt.txt`) and interpolated at runtime.

---

## 📦 What You Need to Provide / Confirm

1. **Model name (optional)** – we will default to `gemini-1.5-flash`. If you want a different Gemini model, set `AI_MODEL` in `.env`.
2. **Confirm the feature flag default** – we will set `USE_AI_FOR_PLAN=true` as you asked. Let us know if you ever need it off.
3. **Metrics destination** – we propose using Prometheus (`/metrics` endpoint already present). Confirm this is acceptable.
4. **Any additional equipment** – you said none, so we keep the current list.

Once confirmed, the engineering team can implement the above steps. The changes are confined to the backend; the front‑end remains untouched.

---

## 🚀 Timeline (approx.)

| Week  | Deliverable                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------ |
| **1** | Add Gemini client, prompt file, and Zod schema. Unit test the client with a mocked fetch.                                |
| **2** | Implement `AIPlanService` with transformation logic and Prisma transaction. Add feature‑flag handling in the controller. |
| **3** | Write integration tests for the controller (AI success & fallback). Add Prometheus metrics and basic logging.            |
| **4** | Run full test suite, perform a staging deployment, verify onboarding → plan flow works with real Gemini calls.           |
| **5** | Production rollout, monitor metrics, and toggle flag if needed.                                                          |

---

## ✅ Summary

- **Endpoint unchanged** (`POST /api/v1/plans/generate`).
- **Response format unchanged** – same `WorkoutPlan` shape that the UI already consumes.
- **All required data** (user profile) remains identical; only the generation algorithm swaps to Gemini.
- **Graceful fallback** ensures no user ever sees an error.
- **Feature flag** (`USE_AI_FOR_PLAN`) lets you enable/disable AI instantly.
- **Observability** gives you visibility into success vs fallback rates.

When you give the go‑ahead (and optionally confirm the few items listed under “What You Need to Provide/Confirm”), the implementation can proceed exactly as outlined.
