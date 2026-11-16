"use client"
import { Chip } from "@/components/atoms"
import useFilters from "@/hooks/useFilters"
import { CloseIcon } from "@/icons"
import { useParams } from "next/navigation"

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
  const locale = params?.locale
  const removeLabel =
    locale === "ar"
      ? "إزالة عامل التصفية"
      : locale === "en"
        ? "Remove filter"
        : "Filtreyi kaldır"

  const activeFilters = filter[1].split(",")
  const filterLabel =
    filtersLabels[filter[0] as keyof typeof filtersLabels] ??
    filter[0].charAt(0).toUpperCase() + filter[0].slice(1)

  const removeFilterHandler = (value: string) => {
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
          onSelect={() => removeFilterHandler(element)}
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
