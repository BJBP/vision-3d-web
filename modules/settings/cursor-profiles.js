// Built-in cursor templates change only pointing, keeping scene and participant settings.
const fixed = { participantCursor: false, handZoneX: 0.12, handZoneY: 0.08, handZoneWidth: 0.76, handZoneHeight: 0.84 };
export const CURSOR_PROFILES = Object.freeze({
  stable: { label: 'Estable · área fija', settings: { ...fixed, cursorStability: 'smooth' } },
  classic: { label: 'Clásico · área fija', settings: { ...fixed, cursorStability: 'legacy' } },
  balanced: { label: 'Equilibrado · área fija', settings: { ...fixed, cursorStability: 'normal' } },
  body: {
    label: 'Móvil · sigue al cuerpo',
    settings: { ...fixed, participantCursor: true, cursorStability: 'normal' },
  },
});
export function matchingCursorProfile(settings) {
  return (
    Object.entries(CURSOR_PROFILES).find(([, profile]) =>
      Object.entries(profile.settings).every(([key, value]) => settings[key] === value),
    )?.[0] ?? 'custom'
  );
}
