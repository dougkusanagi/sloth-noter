// The emoji picker reads its data from the app bundle, so it works offline (no CDN).
const SOURCES = {
  pt: () =>
    Promise.all([import('emojibase-data/pt/data.json'), import('emojibase-data/pt/messages.json')]),
  en: () =>
    Promise.all([import('emojibase-data/en/data.json'), import('emojibase-data/en/messages.json')]),
}
// Newer emoji often show as empty boxes in the system fonts.
const MAX_VERSION = 15.1
const TONES = ['light', 'medium-light', 'medium', 'medium-dark', 'dark']
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

export function emojiLocale(language) {
  return language?.startsWith('pt') ? 'pt' : 'en'
}

/** Converts Emojibase data to what the frimousse picker expects (same shape as its resolver). */
export function pickerData(locale, emojis, messages) {
  const flags = messages.subgroups.find(
    (item) => item.key === 'country-flag' || item.key === 'subdivision-flag',
  )
  return {
    locale,
    categories: messages.groups
      .filter((group) => group.key !== 'component')
      .map((group) => ({ index: group.order, label: capitalize(group.message) })),
    skinTones: Object.fromEntries(
      messages.skinTones.map((tone) => [tone.key, capitalize(tone.message)]),
    ),
    emojis: emojis
      .filter((emoji) => 'group' in emoji && emoji.version <= MAX_VERSION)
      .map((emoji) => {
        const skins = emoji.skins?.filter((skin) => typeof skin.tone === 'number')
        return {
          emoji: emoji.emoji,
          category: emoji.group,
          version: emoji.version,
          label: capitalize(emoji.label),
          tags: emoji.tags ?? [],
          countryFlag: (flags && emoji.subgroup === flags.order) || undefined,
          skins: skins?.length
            ? Object.fromEntries(skins.map((skin) => [TONES[skin.tone - 1], skin.emoji]))
            : undefined,
        }
      }),
  }
}

export async function resolveEmojiData(locale) {
  const key = emojiLocale(locale)
  const [emojis, messages] = await SOURCES[key]()
  return pickerData(key, emojis.default, messages.default)
}

/** A random emoji, for the "Aleatório" button. */
export async function randomEmoji(locale) {
  const { emojis } = await resolveEmojiData(locale)
  const people = emojis.filter((emoji) => emoji.category !== 9 && !emoji.countryFlag)
  return people[Math.floor(Math.random() * people.length)]?.emoji ?? '🌱'
}
