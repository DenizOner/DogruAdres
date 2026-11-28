import type { Metadata } from "next"
import { LoginClient } from "./LoginClient"

export const metadata: Metadata = {
  title: "Giriş Yap | DoğruAdres",
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return <LoginClient />
}
