// Profile identifiers are generated locally and never interpreted as paths without validation.
export const MAX_PROFILES = 5
export const PRIMARY_PROFILE = 'primary'
const ID = /^(?:primary|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/

export function validProfileId(id) {
  return typeof id === 'string' && ID.test(id)
}

export function validateProfiles(value) {
  if (
    !value ||
    !Array.isArray(value.profiles) ||
    !value.profiles.length ||
    value.profiles.length > MAX_PROFILES
  )
    return false
  const seen = new Set()
  for (const profile of value.profiles) {
    if (
      !validProfileId(profile?.id) ||
      typeof profile.name !== 'string' ||
      !profile.name.trim() ||
      profile.name.length > 100 ||
      seen.has(profile.id)
    )
      return false
    seen.add(profile.id)
  }
  return seen.has(PRIMARY_PROFILE) && seen.has(value.active)
}

export function initialProfiles() {
  return { active: PRIMARY_PROFILE, profiles: [{ id: PRIMARY_PROFILE, name: 'Principal' }] }
}

export function addProfile(catalog, name, id = crypto.randomUUID()) {
  if (
    !validateProfiles(catalog) ||
    catalog.profiles.length >= MAX_PROFILES ||
    !validProfileId(id) ||
    id === PRIMARY_PROFILE ||
    catalog.profiles.some((profile) => profile.id === id)
  )
    throw new Error('invalid_profile')
  return { ...catalog, profiles: [...catalog.profiles, { id, name: cleanName(catalog, name) }] }
}

// Two profiles with the same name cannot be told apart on screen.
function cleanName(catalog, name, except = null) {
  const cleaned = typeof name === 'string' ? name.trim() : ''
  if (!cleaned || cleaned.length > 100) throw new Error('invalid_name')
  const key = cleaned.toLocaleLowerCase()
  if (catalog.profiles.some((p) => p.id !== except && p.name.trim().toLocaleLowerCase() === key))
    throw new Error('duplicate_name')
  return cleaned
}

export function renameProfile(catalog, id, name) {
  if (!validateProfiles(catalog) || !catalog.profiles.some((profile) => profile.id === id))
    throw new Error('invalid_profile')
  const cleaned = cleanName(catalog, name, id)
  return {
    ...catalog,
    profiles: catalog.profiles.map((profile) =>
      profile.id === id ? { ...profile, name: cleaned } : profile,
    ),
  }
}
