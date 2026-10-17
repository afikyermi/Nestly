// The sections of the Settings page (FR-SET-001, PG-038; F2.5). The address of a section is the hash of the Settings path
// (`/settings#account`), so the route table is unchanged and a reload or a shared link opens the same section.
export const SETTINGS_SECTIONS = [
  { id: 'account', label: 'חשבון' },
  { id: 'privacy', label: 'פרטיות ואבטחה' },
  { id: 'terms', label: 'תנאים ופרטיות' },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

/** The section a location hash names, or null for no hash or an unknown one (the top of Settings, no error). */
export function parseSettingsSection(hash: string): SettingsSectionId | null {
  const name = hash.startsWith('#') ? hash.slice(1) : hash;
  return SETTINGS_SECTIONS.find((section) => section.id === name)?.id ?? null;
}

/** The hash that opens a section. */
export function settingsSectionHash(id: SettingsSectionId): string {
  return `#${id}`;
}
