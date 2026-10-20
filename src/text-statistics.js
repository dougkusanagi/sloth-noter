export function textStatistics(text) {
  return {
    characters: Array.from(text).length,
    charactersNoSpaces: Array.from(text.replace(/\s/gu, '')).length,
    words: text.match(/\S+/gu)?.length ?? 0,
    lines: text ? text.split(/\r\n|\r|\n/u).length : 0,
  }
}
