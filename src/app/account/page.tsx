import type { Metadata } from "next";
import { LegalPage } from "@/components/ohmni/legal";
import { AccountClient } from "./account-client";

export const metadata: Metadata = { title: "Account | Ohmni", description: "Sign in, export your workspaces, or delete your account." };

export default function AccountPage() {
  return (
    <LegalPage title="Account" draft={false}>
      <AccountClient />
    </LegalPage>
  );
}
