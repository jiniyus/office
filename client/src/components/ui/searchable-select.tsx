import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronsUpDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchableSelectProps {
  items: Array<{ id: string; label: string }>;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchableSelect({
  items,
  value,
  onValueChange,
  placeholder = "Search item...",
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const selectedLabel = items.find(item => item.id === value)?.label || ""

  React.useEffect(() => {
    if (!open) return

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [open])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleTouchMove = (e: TouchEvent) => {
      e.stopPropagation()
    }

    el.addEventListener("touchmove", handleTouchMove, { passive: true })
    return () => el.removeEventListener("touchmove", handleTouchMove)
  }, [open])

  const filteredItems = React.useMemo(() => {
    if (!searchValue) return items
    return items.filter(item => 
      item.label.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [searchValue, items])

  const handleSelect = (id: string) => {
    onValueChange(id)
    setSearchValue("")
    setOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setSearchValue("")
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          {open ? (
            <input
              ref={inputRef}
              type="text"
              value={searchValue}
              onChange={handleInputChange}
              placeholder={selectedLabel || placeholder}
              className={cn(
                "w-full px-3 py-1.5 pr-8 h-8 text-xs border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                className
              )}
            />
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                "w-full px-3 py-1.5 pr-8 h-8 text-xs border border-input rounded-md bg-background text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                !selectedLabel && "text-muted-foreground",
                className
              )}
            >
              {selectedLabel || placeholder}
            </button>
          )}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0 overflow-visible">
        <div
          ref={scrollRef}
          className="w-full bg-popover text-popover-foreground"
          style={{
            height: '200px',
            overflowY: 'scroll',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            scrollBehavior: 'smooth',
          }}
        >
          {filteredItems.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No items found.
            </div>
          ) : (
            <div className="p-1">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-2 text-xs text-left rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer",
                    value === item.id && "bg-accent text-accent-foreground"
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 flex-shrink-0",
                      value === item.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}