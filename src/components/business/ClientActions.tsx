"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import NewChargeModal from "@/components/business/NewChargeModal";

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
      <NewChargeModal open={open} onOpenChange={setOpen} client={client} defaultSlug={defaultSlug} />
    </div>
  );
}
