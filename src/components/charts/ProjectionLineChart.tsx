"use client";

import dynamic from "next/dynamic";
import React from "react";
import type { ApexOptions } from "apexcharts";

// Dynamically import to avoid SSR issues
const ReactApexChart: any = dynamic(() => import("react-apexcharts"), { ssr: false });

export type SeriesPoint = [number, number]; // [timestamp(ms), value]

export interface ProjectionLineChartProps {
  past: SeriesPoint[]; // historical series
  projection?: SeriesPoint[]; // optional projected series
  title?: string; // when omitted or falsy, no header is shown
  height?: number;
  pastName?: string; // default: 'Referrals'
  projectionName?: string; // default: 'Projection'
  colors?: string[]; // override series colors
  yFormatter?: (v: number) => string; // tooltip y formatter
}

const ProjectionLineChart: React.FC<ProjectionLineChartProps> = ({ past, projection, title, height = 320, pastName = 'Referrals', projectionName = 'Projection', colors, yFormatter }) => {
  const hasProjection = !!(projection && projection.length);
  const series = hasProjection
    ? [
        { name: pastName, data: past },
        { name: projectionName, data: projection as SeriesPoint[] },
      ]
    : [
        { name: pastName, data: past },
      ];

  const options: ApexOptions = {
    chart: {
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true },
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, 'Apple Color Emoji', 'Segoe UI Emoji'",
    },
    stroke: {
      width: hasProjection ? [3.2, 2.6] : 3.2,
      curve: "smooth",
      dashArray: hasProjection ? [0, 6] : 0, // dashed only when projection exists
    },
    markers: {
      size: 4,
      strokeWidth: 0,
      hover: { size: 6 },
    },
    colors: colors && colors.length ? colors : (hasProjection ? ["#059669", "#0ea5e9"] : ["#059669"]),
    dataLabels: { enabled: false },
    legend: {
      show: hasProjection,
      position: "top",
      horizontalAlign: "right",
      fontSize: "11px",
      labels: { colors: "#374151" },
    },
    grid: {
      borderColor: "#e5e7eb",
      strokeDashArray: 2,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    xaxis: {
      type: "datetime",
      labels: {
        datetimeFormatter: {
          day: "d. MMM",
        },
        style: { colors: "#6b7280", fontSize: "11px" },
      },
      axisBorder: { color: "#e5e7eb" },
      axisTicks: { color: "#e5e7eb" },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      decimalsInFloat: 0,
      labels: { style: { colors: "#6b7280", fontSize: "11px" } },
    },
    fill: {
      type: hasProjection ? ["gradient", "solid"] : "gradient",
      gradient: {
        shadeIntensity: 0,
        opacityFrom: 0.45,
        opacityTo: 0.15,
        stops: [0, 100],
      },
    },
    tooltip: {
      followCursor: true,
      x: { format: "dd MMM" },
      y: { formatter: (v: number) => (yFormatter ? yFormatter(v) : `${v}`) },
      theme: "light",
    },
  };

  return (
    <div>
      {title ? (
        <div className="px-4 pt-3 pb-1 text-sm font-medium text-gray-900">{title}</div>
      ) : null}
      <div className="px-2">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ReactApexChart options={options as any} series={series as any} type="line" height={height} />
      </div>
    </div>
  );
};

export default ProjectionLineChart;
