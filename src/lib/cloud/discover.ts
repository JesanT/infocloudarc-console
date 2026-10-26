import { createServerFn } from "@tanstack/react-start";

export const getAppSubnet = createServerFn({ method: "GET" }).handler(async () => {
  const { readAppSubnet } = await import("./discover.server.ts");
  return readAppSubnet();
});

export const scanSubnet = createServerFn({ method: "POST" })
  .validator((input: { cidr: string }) => {
    if (!input || typeof input.cidr !== "string") throw new Error("CIDR is required");
    return { cidr: input.cidr.trim() };
  })
  .handler(async ({ data }) => {
    const { probeCidr } = await import("./discover.server.ts");
    return probeCidr(data.cidr);
  });
