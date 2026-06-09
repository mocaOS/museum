"use client";

import { seedConfig, type ClientConfig } from "@/lib/config";

export default function ConfigBootstrap({
  config,
  children,
}: {
  config: ClientConfig;
  children: React.ReactNode;
}) {
  seedConfig(config);
  return <>{children}</>;
}
