import * as React from "react"
import { Command, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
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
  const selectedLabel = items.find(item => item.id === value)?.label || ""

  React.useEffect(() => {
    if (!open) return

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)

    return () => window.clearTimeout(focusTimer)
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
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-50" align="start">
        <Command>
          <CommandEmpty>No items found.</CommandEmpty>
          <CommandGroup 
            className="h-[200px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => handleSelect(item.id)}
                  className="text-xs cursor-pointer py-2"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === item.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {item.label}
                </CommandItem>
              ))
            ) : (
              <div className="p-2 text-xs text-muted-foreground">No items found</div>
            )}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
