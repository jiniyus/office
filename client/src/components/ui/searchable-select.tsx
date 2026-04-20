import * as React from "react"
import { ChevronsUpDown, Check, ChevronRight } from "lucide-react"
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
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const selectedLabel = items.find(item => item.id === value)?.label || ""

  // Extract unique categories from items
  const categories = React.useMemo(() => {
    const cats = new Set<string>()
    items.forEach(item => {
      const match = item.label.match(/\s-\s(.+)$/)
      if (match) cats.add(match[1])
    })
    return Array.from(cats).sort()
  }, [items])

  // Get items for selected category, sorted by smart search (prefix matches first)
  const filteredItems = React.useMemo(() => {
    let filtered = items
    
    // Filter by selected category if any
    if (selectedCategory) {
      filtered = items.filter(item => item.label.endsWith(` - ${selectedCategory}`))
    }
    
    // Filter by search value (prioritize prefix matches)
    if (searchValue) {
      const searchLower = searchValue.toLowerCase()
      const prefixMatches = filtered.filter(item =>
        item.label.toLowerCase().startsWith(searchLower)
      )
      const otherMatches = filtered.filter(item =>
        item.label.toLowerCase().includes(searchLower) &&
        !item.label.toLowerCase().startsWith(searchLower)
      )
      filtered = [...prefixMatches, ...otherMatches]
    }
    
    return filtered
  }, [searchValue, selectedCategory, items])

  // Get categories matching search
  const filteredCategories = React.useMemo(() => {
    if (!searchValue) return categories
    const searchLower = searchValue.toLowerCase()
    const prefixMatches = categories.filter(cat => cat.toLowerCase().startsWith(searchLower))
    const otherMatches = categories.filter(cat =>
      cat.toLowerCase().includes(searchLower) &&
      !cat.toLowerCase().startsWith(searchLower)
    )
    return [...prefixMatches, ...otherMatches]
  }, [searchValue, categories])

  React.useEffect(() => {
    if (!open) {
      setSearchValue("")
      setSelectedCategory(null)
      return
    }
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(focusTimer)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearchValue("")
        setSelectedCategory(null)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    document.addEventListener("touchstart", handleOutsideClick)
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
      document.removeEventListener("touchstart", handleOutsideClick)
    }
  }, [open])

  const handleSelect = (id: string) => {
    onValueChange(id)
    setSearchValue("")
    setSelectedCategory(null)
    setOpen(false)
  }

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category)
    setSearchValue("")
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setSearchValue(newValue)
    // If user clears input, clear category selection
    if (newValue === "") {
      setSelectedCategory(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace with empty search clears category to go back
    if (e.key === "Backspace" && searchValue === "" && selectedCategory) {
      setSelectedCategory(null)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative w-full">
        {open ? (
          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
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

      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-input bg-popover text-popover-foreground shadow-md"
          style={{
            height: '140px',
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {selectedCategory ? (
            // Show filtered items for selected category
            filteredItems.length === 0 ? (
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
                    <span className="truncate">{item.label.split(" - ")[0]}</span>
                  </button>
                ))}
              </div>
            )
          ) : (
            // Show categories or filtered items based on search
            <>
              {/* Show categories */}
              {filteredCategories.length > 0 && (
                <div className="p-1">
                  {filteredCategories.map((category) => (
                    <button
                      key={category}
                      onClick={() => handleCategorySelect(category)}
                      className="w-full flex items-center gap-2 px-2 py-2 text-xs text-left rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                    >
                      <ChevronRight className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate font-semibold text-slate-600">{category}</span>
                    </button>
                  ))}
                </div>
              )}
              
              {/* Show items matching search across all categories */}
              {searchValue && filteredItems.length > 0 && (
                <>
                  {filteredCategories.length > 0 && (
                    <div className="border-t border-slate-200"></div>
                  )}
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
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {filteredCategories.length === 0 && (!searchValue || filteredItems.length === 0) && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No items found.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}