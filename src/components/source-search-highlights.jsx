export function SourceSearchHighlights({ body, matches, index, scope }) {
  function content(from, to) {
    const parts = []
    let cursor = from
    matches.forEach((match, matchIndex) => {
      if (match.start < from || match.end > to) return
      parts.push(
        body.slice(cursor, match.start),
        <mark
          key={matchIndex}
          data-search-index={matchIndex}
          className={matchIndex === index ? 'search-match search-match-current' : 'search-match'}
        >
          {body.slice(match.start, match.end)}
        </mark>,
      )
      cursor = match.end
    })
    parts.push(body.slice(cursor, to))
    return parts
  }
  return scope ? (
    <>
      {body.slice(0, scope.from)}
      <span className="search-scope">{content(scope.from, scope.to)}</span>
      {body.slice(scope.to)}
    </>
  ) : (
    content(0, body.length)
  )
}
