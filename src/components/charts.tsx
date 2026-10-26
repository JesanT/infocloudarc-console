import { useEffect, useState } from "react";

type Point = { label: string; a: number | null; b: number | null };

export function Trend({
  data,
  aLabel,
  bLabel,
  className = "h-28",
  interval,
  domain,
}: {
  data: Point[];
  aLabel: string;
  bLabel: string;
  className?: string;
  interval?: number;
  domain?: [number, number];
}) {
  const [lib, setLib] = useState<typeof import("recharts") | null>(null);

  useEffect(() => {
    let live = true;
    void import("recharts").then((mod) => {
      if (live) setLib(mod);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!lib) return <div className={`${className} rounded-lg bg-inset`} />;

  const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } = lib;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="label" interval={interval} tick={{ fill: "var(--color-faint)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis domain={domain} tick={{ fill: "var(--color-faint)", fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
          <Tooltip
            contentStyle={{
              background: "var(--color-panel)",
              border: "1px solid var(--color-line)",
              borderRadius: 8,
              color: "var(--color-ink)",
              fontSize: 12,
            }}
          />
          <Line type="monotone" dataKey="a" name={aLabel} stroke="var(--color-info)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="b" name={bLabel} stroke="var(--color-ok)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
