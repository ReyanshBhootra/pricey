"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await fetch("/api/auth/session", { method: "DELETE" });
        router.push("/");
        router.refresh();
      }}
    >
      <LogOut /> Log out
    </Button>
  );
}
