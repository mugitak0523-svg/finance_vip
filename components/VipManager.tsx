"use client";

import { useRef } from "react";

import VipForm from "@/components/VipForm";
import VipList, { VipListHandle } from "@/components/VipList";

export default function VipManager() {
  const listRef = useRef<VipListHandle>(null);

  const handleAdded = () => {
    listRef.current?.refresh();
  };

  return (
    <div className="space-y-4">
      <VipForm onAdd={handleAdded} />
      <VipList ref={listRef} />
    </div>
  );
}
