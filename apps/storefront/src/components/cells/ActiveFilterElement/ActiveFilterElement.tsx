"use client"
import { Chip } from "@/components/atoms"
import useFilters from "@/hooks/useFilters"
import { CloseIcon } from "@/icons"
import { useParams } from "next/navigation"
import { toHreflang } from "@/lib/helpers/hreflang"

const filtersLabels = {
  category: "Category",
  brand: "Brand",
  min_price: "Min Price",
  max_price: "Max Price",
  color: "Color",
  size: "Size",
  query: "Search",
  condition: "Condition",
  rating: "Rating",
}

export const ActiveFilterElement = ({ filter }: { filter: string[] }) => {
  const { updateFilters } = useFilters(filter[0])
  const params = useParams()
  // [locale] is the ISO-2 storefront COUNTRY, not the interface language.
  // The existing hreflang map gives us en-US/en-GB/etc. Argentina ("ar")
  // must not be mistaken for the Arabic language.
  const countryCode = typeof params?.locale === "string" ? params.locale.toLowerCase() : ""
  const language = toHreflang(countryCode).split("-")[0].toLowerCase()
  const arabicRegion = ["sa", "ae", "eg"].includes(countryCode)
  const removeLabel = arabicRegion
    ? "إزالة عامل التصفية"
    : language === "tr"
      ? "Filtreyi kaldır"
      : "Remove filter"

  const activeFilters = filter[1].split(",")
  const filterLabel =
    filtersLabels[filter[0] as keyof typeof filtersLabels] ??
    filter[0].charAt(0).toUpperCase() + filter[0].slice(1)

  const removeFilterHandler = (value: string, event: React.MouseEvent<HTMLButtonElement>) => {
    // Native Enter/Space generates a click with detail=0. Before the selected
    // chip disappears after routing, move keyboard focus to the next/previous
    // removal action or, for the final chip, the persistent results heading.
    // Mouse clicks retain their existing focus and visual behavior.
    if (event.detail === 0) {
      const current = event.currentTarget
      const buttons = Array.from(current.parentElement?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      const index = buttons.indexOf(current)
      const neighbor = buttons[index + 1] ?? buttons[index - 1]
      if (neighbor && !neighbor.disabled) {
        neighbor.focus()
      } else {
        const heading = current.closest("main")?.querySelector<HTMLElement>("h1")
        if (heading) {
          heading.tabIndex = -1
          heading.focus()
        }
      }
    }
    updateFilters(value)
  }

  return (
    <div className="flex gap-2 items-center mb-4">
      <span className="label-md hidden md:inline-block">
        {filterLabel}:
      </span>
      {activeFilters.map((element) => (
        <Chip
          key={element}
          onSelect={(event) => removeFilterHandler(element, event)}
          ariaLabel={`${removeLabel}: ${filterLabel} — ${element}`}
          value={
            <span className="flex gap-2 items-center whitespace-nowrap">
              {element}{" "}
              <span aria-hidden="true">
                <CloseIcon size={16} className="cursor-pointer" />
              </span>
            </span>
          }
        />
      ))}
    </div>
  )
}
