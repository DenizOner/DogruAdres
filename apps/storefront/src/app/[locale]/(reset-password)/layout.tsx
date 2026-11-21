/**
 * A customer password-recovery link is a public security route, not a catalog
 * visit. It must work without selecting a commercial region or fetching stores.
 * Avoid unrelated navigation and external images around a one-time bearer.
 */
export default function ResetPasswordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>
}
