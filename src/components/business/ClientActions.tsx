"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import SmartChargeModal from "@/components/payments/SmartChargeModal";

type Props = {
  client: { id: string; name?: string | null; email?: string | null; phone?: string | null };
  defaultSlug?: string;
};

export default function ClientActions({ client, defaultSlug }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" className="h-8 bg-gray-900 text-white" onClick={() => setOpen(true)}>
        New Charge
      </Button>
      <SmartChargeModal open={open} onOpenChange={setOpen} client={client} clinicSlug={defaultSlug} />
    </div>
  );
}
