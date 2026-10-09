// Automatic reductions affect the running scene, never the saved preferences.
export function reduceQuality(current) {
  return {
    ...current,
    renderScale: Math.max(0.5, Math.round((current.renderScale - 0.15) * 100) / 100),
    particleDensity: Math.min(current.particleDensity, Math.max(0.15, current.particleDensity - 0.15)),
    bloom: current.bloom && current.renderScale > 0.85,
    trails: false,
    captureWidth: 640,
    analysisFps: Math.max(5, current.analysisFps - 5),
  };
}
