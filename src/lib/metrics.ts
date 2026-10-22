// src/lib/metrics.ts

class MetricsTracker {
  private aiSuccessTotal = 0;
  private aiFallbackTotal = 0;
  private lastLatencyMs = 0;
  private totalLatencyMs = 0;
  private latencyCount = 0;

  recordAiSuccess(latencyMs: number) {
    this.aiSuccessTotal++;
    this.lastLatencyMs = latencyMs;
    this.totalLatencyMs += latencyMs;
    this.latencyCount++;
  }

  recordAiFallback() {
    this.aiFallbackTotal++;
  }

  getSnapshot() {
    const avgLatencyMs = this.latencyCount > 0 ? this.totalLatencyMs / this.latencyCount : 0;
    return {
      aiSuccessTotal: this.aiSuccessTotal,
      aiFallbackTotal: this.aiFallbackTotal,
      lastLatencyMs: this.lastLatencyMs,
      avgLatencyMs: Math.round(avgLatencyMs * 100) / 100,
    };
  }

  getMetricsAsPrometheusText(): string {
    const snapshot = this.getSnapshot();
    return [
      '# HELP plan_ai_success_total Total successful AI workout plan generations',
      '# TYPE plan_ai_success_total counter',
      `plan_ai_success_total ${snapshot.aiSuccessTotal}`,
      '',
      '# HELP plan_ai_fallback_total Total AI workout plan generation fallbacks',
      '# TYPE plan_ai_fallback_total counter',
      `plan_ai_fallback_total ${snapshot.aiFallbackTotal}`,
      '',
      '# HELP plan_ai_latency_ms Latency of latest AI plan generation in milliseconds',
      '# TYPE plan_ai_latency_ms gauge',
      `plan_ai_latency_ms ${snapshot.lastLatencyMs}`,
      '',
      '# HELP plan_ai_latency_ms_avg Average latency of AI plan generations in milliseconds',
      '# TYPE plan_ai_latency_ms_avg gauge',
      `plan_ai_latency_ms_avg ${snapshot.avgLatencyMs}`,
      '',
    ].join('\n');
  }

  reset() {
    this.aiSuccessTotal = 0;
    this.aiFallbackTotal = 0;
    this.lastLatencyMs = 0;
    this.totalLatencyMs = 0;
    this.latencyCount = 0;
  }
}

export const metrics = new MetricsTracker();
