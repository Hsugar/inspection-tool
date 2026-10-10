'use client';
import { useRef, useState } from 'react';
import type { Inspection } from '@/lib/inspection';
import type { Box } from '@/lib/device-vision';
export type Layer = 'all' | 'lamps' | 'body' | 'barcode' | 'none';
export function AnalysisImage({
  record,
  layer = 'all',
  selecting = false,
  onSelect,
}: {
  record: Inspection;
  layer?: Layer;
  selecting?: boolean;
  onSelect?: (box: Box) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null),
    [draft, setDraft] = useState<Box | null>(null);
  const w = record.imageWidth || 768,
    h = record.imageHeight || 1024;
  function point(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(w, ((e.clientX - r.left) * w) / r.width)),
      y: Math.max(0, Math.min(h, ((e.clientY - r.top) * h) / r.height)),
    };
  }
  const boxes: {
    box: Box;
    label: string;
    color: string;
    dashed?: boolean;
    side?: 'left' | 'right';
  }[] = [];
  if (record.device.body && (layer === 'all' || layer === 'body'))
    boxes.push({
      box: record.device.body,
      label: 'Device · 机身',
      color: '#36c8ef',
      dashed: true,
    });
  if (record.barcodeBox && (layer === 'all' || layer === 'barcode'))
    boxes.push({
      box: record.barcodeBox,
      label: record.barcode || 'Barcode',
      color: '#ba84ff',
    });
  if (layer === 'all' || layer === 'lamps')
    for (const l of record.device.lamps)
      if (l.box.width > 0)
        boxes.push({
          box: l.box,
          side: l.key === 'positive' ? 'right' : 'left',
          label: `${l.key} · ${l.state === 'on' ? 'ON' : l.state === 'off' ? 'OFF' : '?'}`,
          color:
            l.state === 'on'
              ? l.color === 'amber'
                ? '#ffc34d'
                : l.color === 'green'
                  ? '#3ae0a6'
                  : '#ff5266'
              : '#9caec4',
        });
  return (
    <svg
      role="img"
      aria-label={`${record.name}，设备及四路灯位识别标注`}
      viewBox={`0 0 ${w} ${h}`}
      className={`analysis-image ${selecting ? 'selecting' : ''}`}
      onPointerDown={(e) => {
        if (!selecting) return;
        e.preventDefault();
        start.current = point(e);
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraft(null);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const p = point(e),
          s = start.current;
        setDraft({
          x: Math.min(s.x, p.x),
          y: Math.min(s.y, p.y),
          width: Math.abs(s.x - p.x),
          height: Math.abs(s.y - p.y),
        });
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const p = point(e),
          s = start.current;
        const b = {
          x: Math.min(s.x, p.x),
          y: Math.min(s.y, p.y),
          width: Math.abs(s.x - p.x),
          height: Math.abs(s.y - p.y),
        };
        start.current = null;
        setDraft(null);
        if (b.width > 5 && b.height > 5) onSelect?.(b);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDraft(null);
      }}
    >
      <image
        href={record.displayImage || record.image}
        x="0"
        y="0"
        width={w}
        height={h}
      />
      {boxes.map(({ box: b, label, color, dashed, side }, i) => {
        const labelWidth = label.length * 11 + 14;
        const lx = Math.max(
            0,
            Math.min(
              w - labelWidth,
              side === 'left'
                ? b.x - labelWidth - 10
                : side === 'right'
                  ? b.x + b.width + 10
                  : b.x,
            ),
          ),
          ly = Math.max(0, side ? b.y + b.height / 2 - 13 : b.y - 27);
        return (
          <g key={i} pointerEvents="none">
            <rect
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              fill="none"
              stroke={color}
              strokeWidth={w / 300}
              strokeDasharray={dashed ? '8 5' : undefined}
            />
            {side && (
              <line
                x1={side === 'left' ? lx + labelWidth : lx}
                y1={ly + 13}
                x2={side === 'left' ? b.x : b.x + b.width}
                y2={b.y + b.height / 2}
                stroke={color}
                strokeWidth="2"
              />
            )}
            <rect
              x={lx}
              y={ly}
              width={labelWidth}
              height="26"
              rx="3"
              fill={color}
            />
            <text
              x={lx + 7}
              y={ly + 19}
              fontSize="18"
              fontWeight="600"
              fill="#081322"
            >
              {label}
            </text>
          </g>
        );
      })}
      {draft && (
        <rect
          {...draft}
          fill="#42c9ed25"
          stroke="#fff"
          strokeWidth="3"
          strokeDasharray="8 5"
        />
      )}
    </svg>
  );
}
