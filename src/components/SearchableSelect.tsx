import { useId, useRef, useState, useEffect } from 'react'

type Option = { value: string; label: string }
type Props = {
  id: string
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  allowCustom?: boolean
}

export function SearchableSelect({ id, label, value, options, onChange, placeholder = 'Pilih…', required, disabled, allowCustom = false }: Props) {
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const selectedLabel = options.find((option) => option.value === value)?.label ?? ''
  const search = allowCustom ? value : query
  const filtered = options.filter((option) => option.label.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id')))
  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1))

  useEffect(() => {
    input.current?.setCustomValidity(required && !value.trim() ? `${allowCustom ? 'Isi' : 'Pilih'} ${label.toLowerCase()}${allowCustom ? '.' : ' dari daftar.'}` : '')
  }, [required, value, label, allowCustom])

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, listId, activeIndex])

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  return <div className="searchable-select" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery('') }
  }}>
    <input
      ref={input} id={id} type="text" role="combobox" aria-label={label}
      aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={open && filtered.length ? `${listId}-${activeIndex}` : undefined}
      autoComplete="off" disabled={disabled} aria-required={required}
      value={allowCustom ? value : open ? query : selectedLabel} placeholder={open && !allowCustom ? `Cari ${label.toLowerCase()}…` : placeholder}
      onFocus={() => { setOpen(true); setQuery(''); setActive(0) }}
      onClick={() => { if (!open) { setOpen(true); setQuery(''); setActive(0) } }}
      onChange={(event) => { if (allowCustom) onChange(event.target.value); else setQuery(event.target.value); setOpen(true); setActive(0) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setQuery('') }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true)
          setActive(event.key === 'ArrowDown' ? Math.min(activeIndex + 1, filtered.length - 1) : Math.max(0, activeIndex - 1))
        }
        if (event.key === 'Enter' && open) {
          event.preventDefault()
          if (filtered[activeIndex]) choose(filtered[activeIndex].value)
        }
      }}
    />
    <span className="searchable-select-arrow" aria-hidden="true">⌄</span>
    {open && <ul className="searchable-options" id={listId} role="listbox" aria-label={label}>
      {filtered.map((option, index) => <li
        key={option.value} id={`${listId}-${index}`} role="option"
        aria-selected={value === option.value}
        className={index === activeIndex ? 'active' : ''}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(option.value)}
      >{option.label}{value === option.value && <span aria-hidden="true">✓</span>}</li>)}
      {!filtered.length && <li role="presentation" className="searchable-empty">{allowCustom ? 'Nama baru bisa langsung digunakan.' : 'Tidak ditemukan. Coba nama lainnya.'}</li>}
    </ul>}
  </div>
}
