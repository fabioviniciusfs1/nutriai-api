"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  type TooltipContentProps,
} from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { nutrientGroups, type nutrientHistory } from "@/lib/mock-data";
import { formatLongDate, formatShortDate, numberFormat } from "@/components/history/format";

const LINE_COLOR = "#f4623a";

type NutrientChartProps = {
  days: typeof nutrientHistory;
};

const allNutrients = nutrientGroups.flatMap((group) => group.nutrients);

/** Arredonda o topo do eixo para um valor "redondo" (múltiplo de meia potência de 10). */
function niceCeil(value: number) {
  const step = 10 ** Math.floor(Math.log10(value)) / 2;
  return Math.ceil(value / step) * step;
}

function percentOf(value: number, meta: number) {
  return Math.round((value / meta) * 100);
}

export function NutrientChart({ days }: NutrientChartProps) {
  const [selected, setSelected] = useState(allNutrients[0].name);
  const nutrient = allNutrients.find((item) => item.name === selected) ?? allNutrients[0];

  const data = days.map((day) => ({ date: day.date, value: day.values[nutrient.name] }));
  const average = data.reduce((total, day) => total + day.value, 0) / data.length;
  const yMax = niceCeil(Math.max(nutrient.meta, ...data.map((day) => day.value)) * 1.1);
  const averageText = numberFormat.format(nutrient.meta < 10 ? Math.round(average * 10) / 10 : Math.round(average));
  // Nutrientes com limite máximo (açúcares, sódio…): ficar abaixo da linha é o bom.
  const ofTarget = nutrient.limit ? "do limite" : "da meta";
  const daysOverLimit = data.filter((day) => day.value > nutrient.meta).length;
  const daysOnGoal = data.filter((day) => day.value >= nutrient.meta).length;

  function NutrientTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length) return null;
    const value = Number(payload[0].value);
    const overLimit = nutrient.limit && value > nutrient.meta;

    return (
      <div className="rounded-xl bg-neutral-800/95 p-4 text-white shadow-lg">
        <p className="mb-2 text-xs text-neutral-300">{formatLongDate(String(label))}</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: LINE_COLOR }} />
          <span className="text-neutral-300">{nutrient.name}</span>
          <span className="ml-auto pl-4 font-semibold">
            {numberFormat.format(value)} {nutrient.unit}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2 text-sm">
          <span className="text-neutral-300">{nutrient.limit ? "Do limite" : "Da meta"}</span>
          <span className="ml-auto pl-4 font-semibold">{percentOf(value, nutrient.meta)}%</span>
        </div>
        {nutrient.limit && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-300">
            {overLimit ? <TriangleAlert size={14} className="text-amber-400" /> : <CircleCheck size={14} className="text-emerald-400" />}
            {overLimit ? "Acima do limite máximo" : "Dentro do limite máximo"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-900">Consumo de Nutrientes</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Média de {averageText} {nutrient.unit}/dia · {percentOf(average, nutrient.meta)}% {ofTarget}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {nutrient.limit
              ? daysOverLimit === 0
                ? "Limite máximo: o ideal é ficar abaixo da linha. Nenhum dia acima do limite."
                : `Limite máximo: o ideal é ficar abaixo da linha. ${daysOverLimit} de ${data.length} dias acima do limite.`
              : `Meta diária: o ideal é alcançar a linha. ${daysOnGoal} de ${data.length} dias atingiram a meta.`}
          </p>
        </div>
        <select
          aria-label="Nutriente"
          value={nutrient.name}
          onChange={(event) => setSelected(event.target.value)}
          className="rounded-full border-0 bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-700 outline-none focus:ring-2 focus:ring-accent"
        >
          {nutrientGroups.map((group) => (
            <optgroup key={group.name} label={group.name}>
              {group.nutrients.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.limit ? `${item.name} (limite)` : item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: LINE_COLOR }} /> Consumido ({nutrient.unit})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-neutral-400" />{" "}
          {nutrient.limit ? "Limite máximo" : "Meta"} ({numberFormat.format(nutrient.meta)} {nutrient.unit})
        </span>
      </div>

      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -8, right: 10, top: 8 }}>
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
              // Sempre inclui a meta, mesmo quando o consumo fica bem abaixo ou acima dela.
              domain={[0, yMax]}
              allowDecimals={nutrient.meta < 10}
            />
            <Tooltip content={NutrientTooltip} cursor={{ stroke: "#d4d4d4" }} />
            <ReferenceLine y={nutrient.meta} stroke="#a3a3a3" strokeDasharray="6 4" />
            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
