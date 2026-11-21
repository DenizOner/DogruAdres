"use client"
import { Chip } from "@/components/atoms"
import { Accordion } from "@/components/molecules"
import useFilters from "@/hooks/useFilters"

const sizeOptions = [
  "One size",
  "1",
  "3",
  "3.5",
  "4",
  "4.5",
  "5",
  "5.5",
  "6",
  "6.5",
  "7",
  "7.5",
  "8",
  "8.5",
]

export const SizeFilter = () => {
  const { updateFilters, isFilterActive } = useFilters("size")
  const selectSizeHandler = (size: string) => {
    updateFilters(size)
  }
  return (
    <Accordion heading="Size" data-testid="filter-size">
      <ul className="grid grid-cols-3 mt-2 gap-2" data-testid="filter-size-options">
        {sizeOptions.map((option) => (
          <li key={option}>
            <Chip
              selected={isFilterActive(option)}
              onSelect={() => selectSizeHandler(option)}
              value={option}
              className="w-full !justify-center !py-2 !font-normal"
              data-testid={`filter-size-chip-${option.toLowerCase().replace(/\s+/g, '-')}`}
            />
          </li>
        ))}
      </ul>
    </Accordion>
  )
}
