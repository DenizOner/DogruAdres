export const CORPORATE_NAV_LINKS = [
  { href: "/#kimler-icin", label: "Kimler İçin?", testId: "welcome-nav-audiences" },
  { href: "/#cozumler", label: "Bütünleşik Çözümler", testId: "welcome-nav-solutions" },
  { href: "/#nasil-calisir", label: "Nasıl Çalışır?", testId: "welcome-nav-how-it-works" },
  { href: "/#guven-ve-sss", label: "Kurumsal Güven & SSS", testId: "welcome-nav-faq" },
] as const

export { WelcomeHero } from "./WelcomeHero"
export { TargetAudienceSection } from "./TargetAudienceSection"
export { IntegratedSolutionsSection } from "./IntegratedSolutionsSection"
export { HowItWorksSection } from "./HowItWorksSection"
export { TrustAndFaqSection } from "./TrustAndFaqSection"
