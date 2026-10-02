export function ToastButtons({ items }) {
  return (
    <div className="toast-buttons">
      {items.map(([label, onClick]) => (
        <button key={label} onClick={onClick}>
          {label}
        </button>
      ))}
    </div>
  )
}
