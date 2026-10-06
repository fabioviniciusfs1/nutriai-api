"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, type TooltipContentProps } from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import { Smartphone } from "lucide-react";
import { activitySources, type activityHistory } from "@/lib/mock-data";
import { formatLongDate, formatShortDate, numberFormat } from "@/components/history/format";

function average(values: number[]) {
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function StepsTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload as (typeof activityHistory)[number];

  return (
    <div className="rounded-xl bg-neutral-800/95 p-3 text-sm text-white shadow-lg">
      <p className="mb-1 text-xs text-neutral-300">{formatLongDate(String(label))}</p>
      <p className="font-semibold">{numberFormat.format(day.steps)} passos</p>
      <p className="text-neutral-300">
        {day.activeCalories} kcal ativas · {day.activeMinutes} min
      </p>
    </div>
  );
}

export function ActivityPanel({ days }: { days: typeof activityHistory }) {
  const metrics = [
    { label: "Passos por dia", value: numberFormat.format(average(days.map((d) => d.steps))), unit: "" },
    { label: "Calorias ativas por dia", value: numberFormat.format(average(days.map((d) => d.activeCalories))), unit: "kcal" },
    { label: "Minutos ativos por dia", value: numberFormat.format(average(days.map((d) => d.activeMinutes))), unit: "min" },
    {
      label: "Distância no período",
      value: numberFormat.format(Math.round(days.reduce((total, d) => total + d.distanceKm, 0))),
      unit: "km",
    },
  ];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-900">Atividade Física</h3>
          <p className="mt-1 text-xs text-neutral-500">Dados sincronizados de aplicativos de saúde</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activitySources.map((source) => (
            <span
              key={source.name}
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600"
            >
              <Smartphone size={14} className="text-neutral-400" />
              <span className="font-medium text-neutral-900">{source.name}</span>
              {source.connected ? (
                <span className="text-neutral-500">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
                  Sincronizado {source.lastSync}
                </span>
              ) : (
                <span className="text-neutral-400">Não conectado</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl bg-neutral-50 p-4">
            <dt className="text-xs text-neutral-500">{metric.label}</dt>
            <dd className="mt-1 text-xl font-semibold text-neutral-900">
              {metric.value}
              {metric.unit && <span className="ml-1 text-sm font-medium text-neutral-400">{metric.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-sm font-medium text-neutral-700">Passos diários</p>
      <div className="mt-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ left: -8, right: 10 }} barCategoryGap={days.length > 30 ? 1 : "20%"}>
            <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="#e5e5e5" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#a3a3a3", fontSize: 12 }}
              tickFormatter={formatShortDate}
              minTickGap={24}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#a3a3a3", fontSize: 12 }}
              tickFormatter={(v) => numberFormat.format(v)}
            />
            <Tooltip content={StepsTooltip} cursor={{ fill: "#f5f5f5" }} />
            <Bar dataKey="steps" fill="#3b82c4" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
