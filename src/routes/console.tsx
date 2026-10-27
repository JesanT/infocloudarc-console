import { createFileRoute } from "@tanstack/react-router";
import { ConsolePage } from "@/components/views/console-page";

export const Route = createFileRoute("/console")({
  component: ConsolePage,
});
