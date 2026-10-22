// tests/aiPlan.service.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { aiPlanResponseSchema } from '../src/services/ai/aiSchema';
import { transformAIPlanItems } from '../src/services/ai/aiTransform';
import { GeminiAIClient } from '../src/services/ai/aiClient';
import { metrics } from '../src/lib/metrics';
import { Exercise } from '../src/app/generated/prisma';

describe('AI Workout Plan - Schema Validation', () => {
  it('should successfully validate a correct AI plan response', () => {
    const validData = {
      items: [
        {
          dayOfWeek: 1,
          orderIndex: 1,
          exerciseSlug: 'push_up',
          sets: 3,
          targetReps: 12,
          targetDurationSeconds: null,
          restSeconds: 45,
          notes: 'Keep core tight',
        },
        {
          dayOfWeek: 1,
          orderIndex: 2,
          exerciseSlug: 'plank',
          sets: 3,
          targetReps: null,
          targetDurationSeconds: 45,
          restSeconds: 30,
          notes: null,
        },
      ],
    };

    const parsed = aiPlanResponseSchema.parse(validData);
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0].exerciseSlug, 'push_up');
    assert.equal(parsed.items[1].targetDurationSeconds, 45);
  });

  it('should reject invalid dayOfWeek (> 7 or < 1)', () => {
    const invalidData = {
      items: [
        {
          dayOfWeek: 8,
          orderIndex: 1,
          exerciseSlug: 'push_up',
          sets: 3,
          targetReps: 10,
        },
      ],
    };

    assert.throws(() => aiPlanResponseSchema.parse(invalidData));
  });

  it('should reject non-positive sets', () => {
    const invalidData = {
      items: [
        {
          dayOfWeek: 1,
          orderIndex: 1,
          exerciseSlug: 'push_up',
          sets: 0,
        },
      ],
    };

    assert.throws(() => aiPlanResponseSchema.parse(invalidData));
  });

  it('should reject empty items array', () => {
    const invalidData = { items: [] };
    assert.throws(() => aiPlanResponseSchema.parse(invalidData));
  });
});

describe('AI Workout Plan - Transform Helper', () => {
  const dummyExercises: Exercise[] = [
    {
      id: 'ex-push-up-uuid',
      slug: 'push_up',
      name: 'Push-up',
      imageUrl: null,
      category: 'UPPER',
      description: null,
      instructions: [],
      equipmentRequired: [],
      cameraGuidance: {},
      supportedErrors: [],
      defaultSets: 3,
      defaultTargetReps: 12,
      defaultTargetDurationSeconds: null,
      defaultRestSeconds: 45,
      cvStatus: 'VALIDATED',
      modelVersion: 'v1.0.0',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ex-squat-uuid',
      slug: 'squat',
      name: 'Squat',
      imageUrl: null,
      category: 'LOWER',
      description: null,
      instructions: [],
      equipmentRequired: [],
      cameraGuidance: {},
      supportedErrors: [],
      defaultSets: 3,
      defaultTargetReps: 12,
      defaultTargetDurationSeconds: null,
      defaultRestSeconds: 45,
      cvStatus: 'VALIDATED',
      modelVersion: 'v1.0.0',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('should transform items and resolve exerciseId', () => {
    const items = [
      {
        dayOfWeek: 1,
        orderIndex: 1,
        exerciseSlug: 'push_up',
        sets: 4,
        targetReps: 10,
        targetDurationSeconds: null,
        restSeconds: 60,
        notes: 'Good form',
      },
    ];

    const result = transformAIPlanItems('plan-123', items, dummyExercises);
    assert.equal(result.length, 1);
    assert.equal(result[0].planId, 'plan-123');
    assert.equal(result[0].exerciseId, 'ex-push-up-uuid');
    assert.equal(result[0].sets, 4);
    assert.equal(result[0].targetReps, 10);
    assert.equal(result[0].restSeconds, 60);
  });

  it('should throw error when slug does not exist in exercise catalog', () => {
    const items = [
      {
        dayOfWeek: 1,
        orderIndex: 1,
        exerciseSlug: 'non_existent_exercise',
        sets: 3,
        targetReps: 10,
        targetDurationSeconds: null,
        restSeconds: 45,
        notes: null,
      },
    ];

    assert.throws(
      () => transformAIPlanItems('plan-123', items, dummyExercises),
      /not found in available exercises/
    );
  });
});

describe('AI Workout Plan - Gemini AI Client', () => {
  it('should parse content and strip markdown code fences', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: '```json\n{"items": [{"dayOfWeek": 1}]}\n```' }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const client = new GeminiAIClient({ apiKey: 'mock-key', model: 'mock-model' });
      const result = await client.callGemini('test prompt');
      assert.equal(result, '{"items": [{"dayOfWeek": 1}]}');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should handle API errors and throw meaningful message', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response('Quota exceeded', { status: 429, statusText: 'Too Many Requests' });

      const client = new GeminiAIClient({ apiKey: 'mock-key', model: 'mock-model' });
      await assert.rejects(
        () => client.callGemini('test prompt'),
        /Gemini API error \(HTTP 429\)/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should throw timeout error when request is aborted', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        return new Promise((resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const client = new GeminiAIClient({
        apiKey: 'mock-key',
        model: 'mock-model',
        timeoutMs: 50,
      });

      await assert.rejects(
        () => client.callGemini('test prompt'),
        /timed out after 50ms/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('AI Workout Plan - Metrics Tracker', () => {
  beforeEach(() => {
    metrics.reset();
  });

  it('should track success, fallback, and latency', () => {
    metrics.recordAiSuccess(250);
    metrics.recordAiSuccess(350);
    metrics.recordAiFallback();

    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.aiSuccessTotal, 2);
    assert.equal(snapshot.aiFallbackTotal, 1);
    assert.equal(snapshot.lastLatencyMs, 350);
    assert.equal(snapshot.avgLatencyMs, 300);

    const prometheusText = metrics.getMetricsAsPrometheusText();
    assert.ok(prometheusText.includes('plan_ai_success_total 2'));
    assert.ok(prometheusText.includes('plan_ai_fallback_total 1'));
    assert.ok(prometheusText.includes('plan_ai_latency_ms 350'));
    assert.ok(prometheusText.includes('plan_ai_latency_ms_avg 300'));
  });
});
