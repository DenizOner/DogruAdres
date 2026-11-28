import Image from "next/image"
import { HttpTypes } from "@medusajs/types"

import { CartDropdown, MobileNavbar, Navbar } from "@/components/cells"
import { UserDropdown } from "@/components/cells/UserDropdown/UserDropdown"
import CountrySelector from "@/components/molecules/CountrySelector/CountrySelector"
import LocalizedClientLink from "@/components/molecules/LocalizedLink/LocalizedLink"
import { MessageButton } from "@/components/molecules/MessageButton/MessageButton"
import { listCategories } from "@/lib/data/categories"
import { listRegions } from "@/lib/data/regions"
import { retrieveCustomer } from "@/lib/data/customer"
import { ParentCategoryLinks } from "@/components/molecules/ParentCategoryLinks/ParentCategoryLinks"
import { CORPORATE_NAV_LINKS } from "@/components/sections/WelcomePage"

export const Header = async ({}: { locale: string }) => {
  const user = await retrieveCustomer().catch(() => null)
  const isLoggedIn = Boolean(user)

  const regions = await listRegions()

  // The closed B4B API deliberately denies native public categories.
  // Skip category fetching for guests and keep login/verification usable.
  const { categories, parentCategories } = isLoggedIn
    ? ((await listCategories({ query: { include_ancestors_tree: true } })
        .catch(() => ({ categories: [], parentCategories: [] }))) as {
        categories: HttpTypes.StoreProductCategory[]
        parentCategories: HttpTypes.StoreProductCategory[]
      })
    : { categories: [], parentCategories: [] }

  return (
    <header data-testid="header" className="border-b border-primary bg-primary/95 backdrop-blur-xs sticky top-0 z-40">
      <div className="flex items-center justify-between py-3 lg:px-8 px-4 md:px-5" data-testid="header-top">
        {/* Sol Alan: Logo & Kurumsal Etiket */}
        <div className="flex items-center gap-4">
          <LocalizedClientLink href="/" className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-sm" data-testid="header-logo-link">
            <Image
              src="/Logo.svg"
              width={188}
              height={40}
              alt="DoğruAdres Logo"
              priority
              className="h-9 w-auto"
            />
          </LocalizedClientLink>
          <span className="hidden xl:inline-block border-l border-primary pl-3 text-xs font-semibold text-secondary uppercase tracking-wider">
            Kurumsal Otomotiv B4B
          </span>
        </div>

        {/* Orta Alan: Misafir için Kurumsal Gezinme; Girişli için Kategori Navigasyonu */}
        {!isLoggedIn ? (
          <nav
            className="hidden md:flex items-center gap-6 text-sm font-medium text-secondary"
            aria-label="Kurumsal bölümler"
            data-testid="header-corporate-nav"
          >
            {CORPORATE_NAV_LINKS.map((item) => (
              <LocalizedClientLink
                key={item.href}
                href={item.href}
                className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xs px-1"
                data-testid={item.testId}
              >
                {item.label}
              </LocalizedClientLink>
            ))}
          </nav>
        ) : (
          <div className="flex items-center">
            <MobileNavbar
              parentCategories={parentCategories}
              categories={categories}
            />
            <ParentCategoryLinks
              parentCategories={parentCategories}
              categories={categories}
            />
          </div>
        )}

        {/* Sağ Alan: Ülke Seçici ve Kullanıcı Aksiyonları */}
        <div className="flex items-center justify-end gap-3" data-testid="header-actions">
          <CountrySelector regions={regions} />
          {isLoggedIn ? (
            <>
              <MessageButton />
              <UserDropdown isLoggedIn={isLoggedIn} />
              <CartDropdown />
            </>
          ) : (
            <div className="flex items-center gap-2" data-testid="header-guest-auth-actions">
              <a
                href="/login"
                className="inline-flex items-center justify-center rounded-sm px-3.5 py-1.5 text-sm font-medium border border-primary text-primary hover:bg-component transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                data-testid="header-login-btn"
              >
                Giriş Yap
              </a>
              <a
                href="/register"
                className="inline-flex items-center justify-center rounded-sm px-3.5 py-1.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                data-testid="header-register-btn"
              >
                Hesap Oluştur
              </a>
            </div>
          )}
        </div>
      </div>
      {isLoggedIn && categories.length > 0 && (
        <Navbar categories={categories} parentCategories={parentCategories} />
      )}
    </header>
  )
}
