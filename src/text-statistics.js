export function textStatistics(text) {
  let characters = 0,
    charactersNoSpaces = 0,
    words = 0,
    lines = text ? 1 : 0
  let inWord = false,
    previousCR = false
  for (const character of text) {
    characters++
    const whitespace = /\s/u.test(character)
    if (!whitespace) {
      charactersNoSpaces++
      if (!inWord) words++
    }
    inWord = !whitespace
    if (character === '\r' || (character === '\n' && !previousCR)) lines++
    previousCR = character === '\r'
  }
  return { characters, charactersNoSpaces, words, lines }
}
