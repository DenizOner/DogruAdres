import type { Metadata } from "next"
import { RegisterClient } from "./RegisterClient"

export const metadata: Metadata = {
  title: "Hesap Oluştur | DoğruAdres",
  robots: { index: false, follow: false },
}

export default function RegisterPage() {
  return <RegisterClient />
}
