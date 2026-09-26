"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProfileAction, type ProfileState } from "@/lib/actions";

type Initial = { firstName?: string; lastName?: string; email?: string; zip?: string };

export function ProfileForm({ initial, submitLabel = "Save", next }: { initial: Initial; submitLabel?: string; next?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProfileState, FormData>(async (prev, form) => {
    const r = await saveProfileAction(prev, form);
    if (r?.ok && next) router.push(next);
    return r;
  }, null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required maxLength={40} defaultValue={initial.firstName} autoComplete="given-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" maxLength={40} defaultValue={initial.lastName} autoComplete="family-name" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">
          Email <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="email" name="email" type="email" maxLength={120} defaultValue={initial.email} autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="zip">Home ZIP</Label>
        <Input id="zip" name="zip" inputMode="numeric" maxLength={5} defaultValue={initial.zip} placeholder="11215" autoComplete="postal-code" />
        <p className="text-xs text-muted-foreground">For real distances in miles, here and when you text Pricey.</p>
      </div>
      <Button disabled={pending} className="w-full" size="lg">
        {pending ? "Saving..." : submitLabel}
      </Button>
      {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.ok && !next && <p className="text-sm text-primary">Saved.</p>}
    </form>
  );
}
